// Edge Function : budget-alerts
// Alerte l'admin quand la main-d'œuvre consommée sur un chantier atteint 70 %,
// 80 % puis 100 % du budget prévu. Une seule alerte par palier et par chantier.
//
// Le calcul reprend STRICTEMENT celui du rapport « Coût chantiers » :
// uniquement les pointages VALIDÉS, coût = Σ (minutes/60 × taux horaire).
//
// Deux limites assumées, explicitées dans l'email plutôt que masquées :
//   1. Budget de MAIN-D'ŒUVRE uniquement — BEMEXO ne connaît ni matériaux, ni
//      sous-traitance, ni location.
//   2. Un salarié sans taux horaire compte dans les HEURES mais pas dans le
//      COÛT. Le coût en euros est donc sous-estimé sur un chantier où des taux
//      manquent : on le signale dans l'email (« X h non chiffrées »), car une
//      sous-estimation silencieuse rassurerait à tort.
//
// Quand les deux budgets sont renseignés, c'est le POURCENTAGE LE PLUS ÉLEVÉ qui
// déclenche — on alerte sur le premier signal de dérive, pas sur le plus flatteur.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const FROM = 'BEMEXO <no-reply@bemexo.com>';
const ALERT_HOUR_PARIS = 7;

function parisHour(): number {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', hour: '2-digit', hour12: false,
  }).formatToParts(new Date());
  return parseInt(f.find((p) => p.type === 'hour')?.value || '0', 10);
}

const fmtH = (min: number) => `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}`;
const fmtEur = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`;

async function sendEmail(to: string[], subject: string, html: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY manquant (secret Supabase)');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text().catch(() => '')}`);
}

type Site = {
  id: string; client_name: string; city: string | null;
  budget_hours: number | null; budget_amount: number | null;
  alert_70_sent_at: string | null; alert_80_sent_at: string | null; alert_100_sent_at: string | null;
};
type Hit = {
  site: Site; level: 70 | 80 | 100; pct: number;
  minutes: number; cost: number; unpricedMinutes: number;
};

function buildHtml(companyName: string, hits: Hit[]) {
  const row = (h: Hit) => {
    const color = h.level === 100 ? '#B5472E' : h.level === 80 ? '#C0461F' : '#8a6d05';
    const budget = [
      h.site.budget_hours ? `${h.site.budget_hours} h` : null,
      h.site.budget_amount ? fmtEur(h.site.budget_amount) : null,
    ].filter(Boolean).join(' · ');
    const conso = [
      fmtH(h.minutes),
      h.site.budget_amount ? fmtEur(h.cost) : null,
    ].filter(Boolean).join(' · ');
    const warn = h.unpricedMinutes > 0
      ? `<div style="font-size:11.5px;color:#8a6d05;margin-top:3px;">⚠ ${fmtH(h.unpricedMinutes)} non chiffrées (taux horaire manquant) — le coût réel est supérieur.</div>`
      : '';
    return `
    <tr><td style="padding:11px 0;border-bottom:1px solid #eee;">
      <div style="font-size:14px;font-weight:800;color:#15120F;">${h.site.client_name}${h.site.city ? ` · ${h.site.city}` : ''}</div>
      <div style="font-size:12.5px;color:#3a352f;margin-top:3px;">Budget : ${budget || '—'} · Consommé : ${conso}</div>
      ${warn}
    </td>
    <td style="padding:11px 0;text-align:right;vertical-align:top;white-space:nowrap;">
      <span style="display:inline-block;background:${color};color:#fff;font-weight:900;font-size:13px;padding:5px 11px;border-radius:99px;">${Math.round(h.pct)} %</span>
    </td></tr>`;
  };

  return `
<div style="font-family:Arial,Helvetica,sans-serif;background:#F2EDE3;padding:24px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;">
      <tr><td style="background:#15120F;padding:22px 28px;">
        <span style="color:#FFC21A;font-weight:900;font-size:18px;">BEMEXO</span>
        <span style="color:#a59c86;font-size:12px;margin-left:8px;">Budget main-d'œuvre</span>
      </td></tr>
      <tr><td style="padding:22px 28px 4px;">
        <p style="margin:0;font-size:15px;font-weight:800;color:#15120F;">${companyName}</p>
        <p style="margin:4px 0 0;font-size:13px;color:#3a352f;">
          ${hits.length > 1 ? `${hits.length} chantiers ont atteint` : 'Un chantier a atteint'} un seuil de budget main-d'œuvre.
        </p>
      </td></tr>
      <tr><td style="padding:6px 28px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${hits.map(row).join('')}</table>
      </td></tr>
      <tr><td style="background:#FBF8F2;padding:14px 28px;">
        <p style="margin:0;font-size:11px;color:#9a948a;">
          Calcul sur les heures <b>validées</b> uniquement, main-d'œuvre seule (hors matériaux et sous-traitance).
          Chaque seuil n'est signalé qu'une fois par chantier.
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</div>`;
}

async function runForCompany(admin: ReturnType<typeof createClient>, companyId: string, dryRun: boolean) {
  const [adminsRes, sitesRes, companyRes] = await Promise.all([
    admin.from('users').select('email').eq('company_id', companyId).eq('role', 'admin').eq('is_active', true),
    admin.from('worksites')
      .select('id, client_name, city, budget_hours, budget_amount, alert_70_sent_at, alert_80_sent_at, alert_100_sent_at')
      .eq('company_id', companyId).eq('is_active', true)
      .or('budget_hours.gt.0,budget_amount.gt.0'),
    admin.from('companies').select('name').eq('id', companyId).maybeSingle(),
  ]);

  const adminEmails = (adminsRes.data || []).map((a: { email: string }) => a.email).filter(Boolean);
  if (!adminEmails.length) return { companyId, skipped: 'no_admin' };
  const sites = (sitesRes.data || []) as Site[];
  if (!sites.length) return { companyId, skipped: 'no_budget' };

  // Heures validées + taux horaire, pour les chantiers concernés uniquement.
  const { data: entries } = await admin.from('time_entries')
    .select('worksite_id, total_minutes, owner:users!time_entries_user_id_fkey(hourly_rate)')
    .eq('company_id', companyId).eq('status', 'validated')
    .in('worksite_id', sites.map((s) => s.id));

  type Entry = { worksite_id: string; total_minutes: number; owner: { hourly_rate: number | null } | { hourly_rate: number | null }[] | null };
  const agg = new Map<string, { minutes: number; cost: number; unpriced: number }>();
  for (const e of ((entries || []) as unknown as Entry[])) {
    const cur = agg.get(e.worksite_id) || { minutes: 0, cost: 0, unpriced: 0 };
    const mins = Number(e.total_minutes || 0);
    const owner = Array.isArray(e.owner) ? e.owner[0] : e.owner;
    const rate = owner?.hourly_rate ?? null;
    cur.minutes += mins;
    if (rate != null) cur.cost += (mins / 60) * rate;
    else cur.unpriced += mins;
    agg.set(e.worksite_id, cur);
  }

  const hits: Hit[] = [];
  for (const s of sites) {
    const a = agg.get(s.id);
    if (!a || a.minutes === 0) continue;

    // Pourcentage le plus élevé parmi les budgets renseignés.
    const pcts: number[] = [];
    if (s.budget_hours && s.budget_hours > 0) pcts.push((a.minutes / 60) / s.budget_hours * 100);
    if (s.budget_amount && s.budget_amount > 0) pcts.push(a.cost / s.budget_amount * 100);
    if (!pcts.length) continue;
    const pct = Math.max(...pcts);

    // Palier atteint le plus haut, non encore signalé.
    let level: 70 | 80 | 100 | null = null;
    if (pct >= 100 && !s.alert_100_sent_at) level = 100;
    else if (pct >= 80 && !s.alert_80_sent_at) level = 80;
    else if (pct >= 70 && !s.alert_70_sent_at) level = 70;
    if (!level) continue;

    hits.push({ site: s, level, pct, minutes: a.minutes, cost: a.cost, unpricedMinutes: a.unpriced });
  }

  if (!hits.length) return { companyId, skipped: 'nothing_due' };
  if (dryRun) {
    return {
      companyId, company: (companyRes.data as { name: string } | null)?.name,
      would_alert: hits.map((h) => ({
        site: h.site.client_name, level: h.level, pct: Math.round(h.pct),
        heures: fmtH(h.minutes), cout: Math.round(h.cost), non_chiffrees: fmtH(h.unpricedMinutes),
      })),
    };
  }

  const companyName = (companyRes.data as { name: string } | null)?.name || 'Votre entreprise';
  const worst = Math.max(...hits.map((h) => h.level));
  const subject = worst >= 100
    ? `BEMEXO — Budget dépassé sur ${hits.length > 1 ? `${hits.length} chantiers` : hits[0].site.client_name}`
    : `BEMEXO — Budget à ${worst} % sur ${hits.length > 1 ? `${hits.length} chantiers` : hits[0].site.client_name}`;
  await sendEmail(adminEmails, subject, buildHtml(companyName, hits));

  // Marquer le palier atteint ET tous les paliers inférieurs : franchir 80 %
  // rend l'alerte « 70 % » caduque, il ne faut pas l'envoyer après coup.
  const now = new Date().toISOString();
  for (const h of hits) {
    const patch: Record<string, string> = { alert_70_sent_at: now };
    if (h.level >= 80) patch.alert_80_sent_at = now;
    if (h.level >= 100) patch.alert_100_sent_at = now;
    await admin.from('worksites').update(patch).eq('id', h.site.id);
  }

  return { companyId, company: companyName, sent: adminEmails.length, sites: hits.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const cronSecret = req.headers.get('x-cron-secret');
    if (!cronSecret) return json({ error: 'Non autorisé' }, 401);
    const { data: ok } = await admin.rpc('verify_cron_secret', { candidate: cronSecret });
    if (!ok) return json({ error: 'Secret invalide' }, 401);

    const { company_id, dry_run, ignore_schedule } = await req.json().catch(() => ({}));
    const dryRun = dry_run === true;

    const hour = parisHour();
    if (ignore_schedule !== true && !company_id && hour !== ALERT_HOUR_PARIS) {
      return json({ mode: 'skip', reason: 'hors creneau', paris: { hour } });
    }

    const q = admin.from('companies').select('id').eq('budget_alerts_enabled', true);
    const { data: companies } = company_id ? await q.eq('id', company_id) : await q;

    const results = [];
    for (const c of (companies || []) as { id: string }[]) {
      try { results.push(await runForCompany(admin, c.id, dryRun)); }
      catch (e) { results.push({ companyId: c.id, error: (e as Error).message }); }
    }
    return json({ mode: dryRun ? 'dry_run' : 'send', results });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
