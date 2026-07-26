// Edge Function : weekly-digest
// Récap hebdomadaire envoyé aux admins d'une entreprise (heures validées de la
// semaine, répartition par chantier, pointages en attente de validation,
// salariés n'ayant rien pointé). Deux façons de la déclencher :
//   - pg_cron (header x-cron-secret, vérifié via RPC public.verify_cron_secret)
//     -> MODE LOT : une entreprise à la fois, pour toutes les entreprises actives.
//   - un admin connecté, bouton « Envoyer maintenant » (Réglages)
//     -> MODE UNITAIRE : uniquement sa propre entreprise, à la demande.
// Envoi via l'API Resend (RESEND_API_KEY, secret Supabase), pas le SMTP Auth —
// ce n'est pas un email d'authentification.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const FROM = 'BEMEXO <contact@bemexo.com>';

function mondayISO(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff)).toISOString().slice(0, 10);
}
const todayISO = () => new Date().toISOString().slice(0, 10);

function fmtHours(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${h}h${m.toString().padStart(2, '0')}`;
}
function fmtDateFR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Heure/jour RÉELS à Paris. Le cron déclenche aux deux heures UTC possibles
// (16:00 et 17:00 le vendredi) et c'est ici qu'on ne retient que la bonne :
// 18 h Paris, été comme hiver. Sans ça, l'envoi décalait d'1 h en hiver.
function parisNow(): { hour: number; weekday: number } {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', hour: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(new Date());
  const hour = parseInt(f.find((p) => p.type === 'hour')?.value || '0', 10);
  const wd = (f.find((p) => p.type === 'weekday')?.value || '').toLowerCase();
  const map: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return { hour, weekday: map[wd] ?? 0 };
}
const DIGEST_HOUR_PARIS = 18;
const DIGEST_WEEKDAY = 5; // vendredi

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

function buildHtml(opts: {
  companyName: string; periodLabel: string; totalMinutes: number;
  bySite: { name: string; minutes: number }[];
  pending: { workerName: string; siteName: string; date: string }[];
  noEntry: string[];
}) {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#3a352f;font-size:13px;">${label}</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#15120F;font-size:13px;">${value}</td></tr>`;

  const siteRows = opts.bySite.length
    ? opts.bySite.map((s) => row(s.name, fmtHours(s.minutes))).join('')
    : `<tr><td colspan="2" style="padding:8px 0;color:#8a8378;font-size:13px;">Aucune heure validée cette semaine</td></tr>`;

  const pendingList = opts.pending.length
    ? opts.pending.slice(0, 12).map((p) => `<li style="margin:3px 0;">${p.workerName} — ${p.siteName} (${fmtDateFR(p.date)})</li>`).join('')
      + (opts.pending.length > 12 ? `<li style="margin:3px 0;color:#8a8378;">+ ${opts.pending.length - 12} autre(s)</li>` : '')
    : '<li style="margin:3px 0;color:#8a8378;">Aucune</li>';

  const noEntryList = opts.noEntry.length
    ? `<p style="margin:4px 0 0;font-size:13px;color:#3a352f;">${opts.noEntry.join(', ')}</p>`
    : '<p style="margin:4px 0 0;font-size:13px;color:#8a8378;">Tout le monde a pointé cette semaine</p>';

  return `
<div style="font-family:Arial,Helvetica,sans-serif;background:#F2EDE3;padding:24px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;">
      <tr><td style="background:#15120F;padding:22px 28px;">
        <span style="color:#FFC21A;font-weight:900;font-size:18px;">BEMEXO</span>
        <span style="color:#a59c86;font-size:12px;margin-left:8px;">Récap hebdomadaire</span>
      </td></tr>
      <tr><td style="padding:22px 28px 6px;">
        <p style="margin:0;font-size:15px;font-weight:800;color:#15120F;">${opts.companyName}</p>
        <p style="margin:2px 0 0;font-size:12.5px;color:#8a8378;">Semaine du ${opts.periodLabel}</p>
      </td></tr>
      <tr><td style="padding:14px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF8F2;border-radius:10px;padding:14px;">
          <tr><td style="padding:6px 14px;font-size:13px;color:#3a352f;">Heures validées (total)</td>
              <td style="padding:6px 14px;text-align:right;font-weight:900;font-size:16px;color:#15120F;">${fmtHours(opts.totalMinutes)}</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:6px 28px 18px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#8a8378;">Répartition par chantier</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${siteRows}</table>
      </td></tr>
      <tr><td style="padding:6px 28px 18px;border-top:1px solid #eee;">
        <p style="margin:12px 0 4px;font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#8a8378;">Pointages en attente de validation (${opts.pending.length})</p>
        <ul style="margin:0;padding-left:18px;font-size:13px;color:#3a352f;">${pendingList}</ul>
      </td></tr>
      <tr><td style="padding:6px 28px 24px;border-top:1px solid #eee;">
        <p style="margin:12px 0 0;font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#8a8378;">N'ont rien pointé cette semaine</p>
        ${noEntryList}
      </td></tr>
      <tr><td style="background:#FBF8F2;padding:14px 28px;">
        <p style="margin:0;font-size:11px;color:#9a948a;">Récap automatique BEMEXO — généré chaque vendredi.</p>
      </td></tr>
    </table>
  </td></tr></table>
</div>`;
}

async function runForCompany(admin: ReturnType<typeof createClient>, companyId: string) {
  const monday = mondayISO();
  const today = todayISO();

  const [companyRes, adminsRes, workersRes, validatedRes, pendingRes, activityRes] = await Promise.all([
    admin.from('companies').select('name').eq('id', companyId).maybeSingle(),
    admin.from('users').select('email').eq('company_id', companyId).eq('role', 'admin').eq('is_active', true),
    admin.from('users').select('id, first_name, last_name').eq('company_id', companyId).eq('role', 'worker').eq('is_active', true),
    admin.from('time_entries')
      .select('worksite_id, total_minutes, worksite:worksites(client_name)')
      .eq('company_id', companyId).eq('status', 'validated')
      .gte('work_date', monday).lte('work_date', today),
    admin.from('time_entries')
      .select('work_date, user:users!user_id(first_name,last_name), worksite:worksites(client_name)')
      .eq('company_id', companyId).eq('status', 'submitted')
      .order('work_date', { ascending: true }),
    admin.from('time_entries')
      .select('user_id')
      .eq('company_id', companyId).neq('status', 'cancelled')
      .gte('work_date', monday).lte('work_date', today),
  ]);

  const adminEmails = (adminsRes.data || []).map((a: { email: string }) => a.email).filter(Boolean);
  if (!adminEmails.length) return { companyId, skipped: 'no_admin' };

  const workers = (workersRes.data || []) as { id: string; first_name: string; last_name: string }[];
  if (!workers.length) return { companyId, skipped: 'no_worker' };

  type Validated = { worksite_id: string | null; total_minutes: number; worksite: { client_name: string } | null };
  const validated = (validatedRes.data || []) as unknown as Validated[];
  const totalMinutes = validated.reduce((s, e) => s + (e.total_minutes || 0), 0);
  const bySiteMap = new Map<string, number>();
  for (const e of validated) {
    const name = e.worksite?.client_name || 'Chantier supprimé';
    bySiteMap.set(name, (bySiteMap.get(name) || 0) + (e.total_minutes || 0));
  }
  const bySite = Array.from(bySiteMap.entries()).map(([name, minutes]) => ({ name, minutes })).sort((a, b) => b.minutes - a.minutes);

  type Pending = { work_date: string; user: { first_name: string; last_name: string } | null; worksite: { client_name: string } | null };
  const pending = ((pendingRes.data || []) as unknown as Pending[]).map((p) => ({
    workerName: p.user ? `${p.user.first_name} ${p.user.last_name}` : 'Salarié',
    siteName: p.worksite?.client_name || 'Chantier supprimé',
    date: p.work_date,
  }));

  const activeIds = new Set(((activityRes.data || []) as { user_id: string }[]).map((r) => r.user_id));
  const noEntry = workers.filter((w) => !activeIds.has(w.id)).map((w) => `${w.first_name} ${w.last_name}`);

  const html = buildHtml({
    companyName: (companyRes.data as { name: string } | null)?.name || 'Votre entreprise',
    periodLabel: `${fmtDateFR(monday)} au ${fmtDateFR(today)}`,
    totalMinutes, bySite, pending, noEntry,
  });

  await sendEmail(adminEmails, `BEMEXO — Récap hebdomadaire (${fmtDateFR(monday)} au ${fmtDateFR(today)})`, html);
  return { companyId, sent: adminEmails.length };
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
      // `weekly_digest_enabled` exclut les comptes de démo (domaines fictifs →
      // rebonds en dur, qui dégradent la réputation d'envoi du domaine). Ce filtre
      // ne s'applique qu'ici (cron) : le bouton « Envoyer maintenant » d'un admin
      // reste une action explicite et n'est jamais bloqué.
      const { company_id, ignore_schedule } = await req.json().catch(() => ({}));

      // Le cron passe à 16:00 ET 17:00 UTC : on ne travaille qu'au passage qui
      // correspond réellement à 18 h à Paris (donc un seul des deux, selon la
      // saison). `ignore_schedule` sert aux tests ciblés hors créneau.
      const { hour, weekday } = parisNow();
      if (ignore_schedule !== true && !company_id
          && (hour !== DIGEST_HOUR_PARIS || weekday !== DIGEST_WEEKDAY)) {
        return json({ mode: 'skip', reason: 'hors creneau', paris: { hour, weekday } });
      }

      const companiesQuery = admin.from('companies').select('id').eq('weekly_digest_enabled', true);
      const { data: companies } = company_id ? await companiesQuery.eq('id', company_id) : await companiesQuery;
      const results = [];
      for (const c of (companies || []) as { id: string }[]) {
        try { results.push(await runForCompany(admin, c.id)); }
        catch (e) { results.push({ companyId: c.id, error: (e as Error).message }); }
      }
      return json({ mode: 'batch', results });
    }

    // Mode unitaire : admin connecté, déclenchement manuel.
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
