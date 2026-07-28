// Edge Function : cert-expiry-alerts
// Alerte les admins d'une entreprise quand une habilitation salarié entre dans
// la fenêtre des 30 jours ou des 7 jours avant expiration (un seul envoi par
// palier, jamais de rappel en boucle — colonnes alert_30_sent_at/alert_7_sent_at).
// Contrairement au récap hebdo, ceci n'envoie QUE s'il y a quelque chose à
// signaler (pas d'email quotidien vide). Mêmes deux modes de déclenchement :
//   - pg_cron (header x-cron-secret) -> MODE LOT, toutes les entreprises.
//   - admin connecté, bouton « Vérifier maintenant » -> MODE UNITAIRE.
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

const TYPE_LABELS: Record<string, string> = {
  caces: 'CACES',
  carte_btp: 'Carte BTP',
  habilitation_electrique: 'Habilitation électrique',
  visite_medicale: 'Visite médicale',
  travail_hauteur: 'Travail en hauteur',
  autre: 'Autre',
};
const displayLabel = (type: string, label: string | null) => {
  const base = TYPE_LABELS[type] || type;
  return label && label.trim() ? `${base} — ${label.trim()}` : base;
};

// Heure réelle à Paris. Le cron déclenche aux deux heures UTC possibles (05:00 et
// 06:00) et c'est ici qu'on ne retient que la bonne : 7 h Paris, été comme hiver.
function parisHour(): number {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', hour: '2-digit', hour12: false,
  }).formatToParts(new Date());
  return parseInt(f.find((p) => p.type === 'hour')?.value || '0', 10);
}
const ALERT_HOUR_PARIS = 7;

function todayISO(): string { return new Date().toISOString().slice(0, 10); }
function fmtDateFR(iso: string): string { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
function daysUntil(iso: string): number {
  const today = new Date(todayISO() + 'T00:00:00Z').getTime();
  const target = new Date(iso + 'T00:00:00Z').getTime();
  return Math.round((target - today) / 86400000);
}

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

type CertRow = {
  id: string; type: string; label: string | null; expiry_date: string;
  alert_30_sent_at: string | null; alert_7_sent_at: string | null;
  user: { first_name: string; last_name: string } | null;
};

function buildHtml(companyName: string, urgent: CertRow[], upcoming: CertRow[]) {
  const line = (c: CertRow, tone: 'urgent' | 'upcoming') => {
    const d = daysUntil(c.expiry_date);
    const daysTxt = d < 0 ? `expirée depuis ${-d} j` : d === 0 ? "expire aujourd'hui" : `dans ${d} j`;
    const color = tone === 'urgent' ? '#B5472E' : '#8a6d05';
    const name = c.user ? `${c.user.first_name} ${c.user.last_name}` : 'Salarié';
    return `<tr><td style="padding:7px 0;font-size:13px;color:#15120F;"><b>${name}</b> — ${displayLabel(c.type, c.label)}</td>
      <td style="padding:7px 0;text-align:right;font-size:12.5px;font-weight:800;color:${color};white-space:nowrap;">${daysTxt} (${fmtDateFR(c.expiry_date)})</td></tr>`;
  };
  const section = (title: string, rows: CertRow[], tone: 'urgent' | 'upcoming') => rows.length ? `
    <tr><td style="padding:6px 28px 18px;border-top:1px solid #eee;">
      <p style="margin:12px 0 4px;font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#8a8378;">${title}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.map((r) => line(r, tone)).join('')}</table>
    </td></tr>` : '';

  return `
<div style="font-family:Arial,Helvetica,sans-serif;background:#F2EDE3;padding:24px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;">
      <tr><td style="background:#15120F;padding:22px 28px;">
        <span style="color:#FFC21A;font-weight:900;font-size:18px;">BEMEXO</span>
        <span style="color:#a59c86;font-size:12px;margin-left:8px;">Habilitations — alerte d'expiration</span>
      </td></tr>
      <tr><td style="padding:22px 28px 6px;">
        <p style="margin:0;font-size:15px;font-weight:800;color:#15120F;">${companyName}</p>
      </td></tr>
      ${section('À renouveler sous 7 jours', urgent, 'urgent')}
      ${section('À anticiper (30 jours)', upcoming, 'upcoming')}
      <tr><td style="background:#FBF8F2;padding:14px 28px;">
        <p style="margin:0;font-size:11px;color:#9a948a;">Alerte automatique BEMEXO — chaque habilitation n'est signalée qu'une fois par palier.</p>
      </td></tr>
    </table>
  </td></tr></table>
</div>`;
}

async function runForCompany(admin: ReturnType<typeof createClient>, companyId: string) {
  const { data: adminsData } = await admin.from('users').select('email').eq('company_id', companyId).eq('role', 'admin').eq('is_active', true);
  const adminEmails = (adminsData || []).map((a: { email: string }) => a.email).filter(Boolean);
  if (!adminEmails.length) return { companyId, skipped: 'no_admin' };

  const { data } = await admin.from('certifications')
    .select('id, type, label, expiry_date, alert_30_sent_at, alert_7_sent_at, user:users!user_id(first_name,last_name)')
    .eq('company_id', companyId)
    .or(`and(alert_7_sent_at.is.null,expiry_date.lte.${new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)}),and(alert_30_sent_at.is.null,expiry_date.lte.${new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)})`);

  const rows = (data || []) as unknown as CertRow[];
  if (!rows.length) return { companyId, skipped: 'nothing_due' };

  const urgent = rows.filter((r) => daysUntil(r.expiry_date) <= 7);
  const upcoming = rows.filter((r) => daysUntil(r.expiry_date) > 7 && r.alert_30_sent_at == null);

  if (!urgent.length && !upcoming.length) return { companyId, skipped: 'nothing_due' };

  const { data: companyData } = await admin.from('companies').select('name').eq('id', companyId).maybeSingle();
  const html = buildHtml((companyData as { name: string } | null)?.name || 'Votre entreprise', urgent, upcoming);
  const subject = urgent.length
    ? `BEMEXO — ${urgent.length} habilitation${urgent.length > 1 ? 's' : ''} à renouveler sous 7 jours`
    : `BEMEXO — habilitations à anticiper (30 jours)`;
  await sendEmail(adminEmails, subject, html);

  const now = new Date().toISOString();
  const urgentIds = urgent.map((r) => r.id);
  const upcomingIds = upcoming.map((r) => r.id);
  await Promise.all([
    urgentIds.length ? admin.from('certifications').update({ alert_7_sent_at: now, alert_30_sent_at: now }).in('id', urgentIds) : Promise.resolve(),
    upcomingIds.length ? admin.from('certifications').update({ alert_30_sent_at: now }).in('id', upcomingIds) : Promise.resolve(),
  ]);

  return { companyId, sent: adminEmails.length, urgent: urgent.length, upcoming: upcoming.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const cronSecret = req.headers.get('x-cron-secret');
    if (cronSecret) {
      const { data: ok } = await admin.rpc('verify_cron_secret', { candidate: cronSecret });
      if (!ok) return json({ error: 'Secret invalide' }, 401);

      // company_id optionnel : restreint le lot à une seule entreprise (tests
      // ciblés sans envoyer à tout le monde). Absent = toutes les entreprises.
      const { company_id, ignore_schedule } = await req.json().catch(() => ({}));

      // Le cron passe à 05:00 ET 06:00 UTC : on ne travaille qu'au passage qui
      // correspond réellement à 7 h à Paris (un seul des deux, selon la saison).
      const hour = parisHour();
      if (ignore_schedule !== true && !company_id && hour !== ALERT_HOUR_PARIS) {
        return json({ mode: 'skip', reason: 'hors creneau', paris: { hour } });
      }

      const companiesQuery = admin.from('companies').select('id');
      const { data: companies } = company_id ? await companiesQuery.eq('id', company_id) : await companiesQuery;
      const results = [];
      for (const c of (companies || []) as { id: string }[]) {
        try { results.push(await runForCompany(admin, c.id)); }
        catch (e) { results.push({ companyId: c.id, error: (e as Error).message }); }
      }
      return json({ mode: 'batch', results });
    }

    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    if (!token) return json({ error: 'Non authentifié' }, 401);
    const { data: { user }, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !user) return json({ error: 'Session invalide' }, 401);
    const { data: profile } = await admin.from('users').select('company_id, role').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin') return json({ error: "Réservé à l'administrateur" }, 403);

    const result = await runForCompany(admin, profile.company_id);
    return json({ mode: 'single', result });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
