// Edge Function : missing-days-reminders
// Relance automatiquement les salariés qui ont des journées planifiées non
// déclarées. Remplace la relance manuelle (le bureau devait repérer la pastille
// et cliquer la cloche, salarié par salarié).
//
// Règle « jour manquant » : STRICTEMENT celle déjà en production
// (lib/work-status.ts) — jour passé + affectation chantier + aucune saisie
// non-brouillon. Une absence (congé/maladie/intempérie) n'est jamais manquante.
//
// Garde-fous (portés par la table reminder_log) :
//   - une notification par salarié et par exécution, tous jours regroupés ;
//   - une relance tous les 2 jours maximum ;
//   - 3 relances maximum, puis on arrête ;
//   - fenêtre de 14 jours.
// Le compteur est remis à zéro dès que le salarié n'a plus rien en retard.
//
// Canal : push si le salarié a un appareil abonné, sinon email. Tant que le
// frontend du Chantier 4 n'est pas déployé, personne ne peut s'abonner au push —
// donc tout part par email, et le basculement vers le push se fera tout seul,
// sans changement de code, dès que les salariés activeront les notifications.
//
// Authentification : secret partagé uniquement (appel serveur-à-serveur par
// pg_cron). Pas de mode « admin connecté » pour l'instant : il n'existe aucun
// bouton côté interface, il sera ajouté avec le réglage frontend.
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
const WINDOW_DAYS = 14;      // au-delà, le jour sort du périmètre
const MIN_HOURS_BETWEEN = 48; // une relance tous les 2 jours maximum
const MAX_REMINDERS = 3;      // au-delà, ce n'est plus un oubli

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const fmtDateFR = (iso: string) => { const [y, m, dd] = iso.split('-'); return `${dd}/${m}/${y}`; };

// Heure et jour RÉELS à Paris (pas en UTC) : le cron passe toutes les heures, et
// c'est ici qu'on décide qui est concerné. Conséquence : insensible au changement
// d'heure — 17h reste 17h été comme hiver.
function parisNow(): { hour: number; weekday: number } {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', hour: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(new Date());
  const hour = parseInt(f.find((p) => p.type === 'hour')?.value || '0', 10);
  const wd = (f.find((p) => p.type === 'weekday')?.value || '').toLowerCase();
  const map: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return { hour, weekday: map[wd] ?? 0 };
}

// « lundi 22 juin » — sans dépendance date-fns (indisponible côté Deno ici).
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function longDateFR(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return `${JOURS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`;
}

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY manquant (secret Supabase)');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text().catch(() => '')}`);
}

// Le nom de l'entreprise est mis EN AVANT (objet + bandeau + corps) : le salarié
// doit reconnaître son employeur au premier coup d'œil, sinon l'email est pris
// pour du spam d'un service inconnu.
function buildHtml(companyName: string, firstName: string, days: string[]) {
  const list = days.map((d) => `<li style="margin:4px 0;font-size:14px;color:#15120F;">${longDateFR(d)}</li>`).join('');
  return `
<div style="font-family:Arial,Helvetica,sans-serif;background:#F2EDE3;padding:24px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;">
      <tr><td style="background:#15120F;padding:20px 26px;">
        <div style="color:#FFC21A;font-weight:900;font-size:17px;">${companyName}</div>
        <div style="color:#a59c86;font-size:11.5px;margin-top:3px;">Rappel de saisie des heures · via BEMEXO</div>
      </td></tr>
      <tr><td style="padding:22px 26px 8px;">
        <p style="margin:0 0 10px;font-size:15px;color:#15120F;">Bonjour ${firstName},</p>
        <p style="margin:0;font-size:14px;color:#3a352f;line-height:1.5;">
          Il manque l'envoi de vos heures pour <b>${companyName}</b> sur ${days.length > 1 ? 'les journées suivantes' : 'la journée suivante'} :
        </p>
        <ul style="margin:10px 0 0;padding-left:20px;">${list}</ul>
      </td></tr>
      <tr><td style="padding:14px 26px 24px;">
        <p style="margin:0 0 16px;font-size:13.5px;color:#3a352f;line-height:1.5;">
          Merci de les saisir dès que possible depuis l'application.
        </p>
        <a href="https://bemexo.com/poseur"
           style="display:inline-block;background:#FFC21A;color:#15120F;text-decoration:none;font-weight:800;font-size:14.5px;padding:12px 22px;border-radius:10px;">
          Déclarer mes heures
        </a>
      </td></tr>
      <tr><td style="background:#FBF8F2;padding:13px 26px;">
        <p style="margin:0;font-size:11px;color:#9a948a;">
          Message automatique envoyé pour le compte de ${companyName}. Si vous avez déjà envoyé ces heures, ignorez cet email.
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</div>`;
}

type Worker = { id: string; first_name: string; last_name: string; email: string };

async function runForCompany(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  cronSecret: string | null,
  dryRun: boolean,
) {
  const today = new Date();
  const todayStr = isoDay(today);
  const windowStart = isoDay(new Date(today.getTime() - WINDOW_DAYS * 86400000));

  const [companyRes, workersRes, planRes, entRes, logRes, subsRes] = await Promise.all([
    admin.from('companies').select('name').eq('id', companyId).maybeSingle(),
    admin.from('users').select('id, first_name, last_name, email')
      .eq('company_id', companyId).eq('role', 'worker').eq('is_active', true),
    admin.from('planning').select('user_id, work_date, absence_type')
      .eq('company_id', companyId).gte('work_date', windowStart).lt('work_date', todayStr),
    admin.from('time_entries').select('user_id, work_date')
      .eq('company_id', companyId).neq('status', 'draft').gte('work_date', windowStart),
    admin.from('reminder_log').select('user_id, last_sent_at, sent_count').eq('company_id', companyId),
    admin.from('push_subscriptions').select('user_id').eq('company_id', companyId),
  ]);

  const companyName = (companyRes.data as { name: string } | null)?.name || 'Votre entreprise';
  const workers = (workersRes.data || []) as Worker[];
  if (!workers.length) return { companyId, skipped: 'no_worker' };

  // Jours d'absence : on les exclut, même si une ligne chantier existe le même jour.
  const planRows = (planRes.data || []) as { user_id: string; work_date: string; absence_type: string | null }[];
  const absenceDays = new Set(planRows.filter((p) => p.absence_type).map((p) => `${p.user_id}|${p.work_date}`));
  const declared = new Set(((entRes.data || []) as { user_id: string; work_date: string }[])
    .map((e) => `${e.user_id}|${e.work_date}`));

  const missingByWorker = new Map<string, string[]>();
  for (const p of planRows) {
    if (p.absence_type) continue;
    const key = `${p.user_id}|${p.work_date}`;
    if (absenceDays.has(key) || declared.has(key)) continue;
    const arr = missingByWorker.get(p.user_id) || [];
    if (!arr.includes(p.work_date)) arr.push(p.work_date);
    missingByWorker.set(p.user_id, arr);
  }

  const logs = new Map(((logRes.data || []) as { user_id: string; last_sent_at: string; sent_count: number }[])
    .map((l) => [l.user_id, l]));
  const withPush = new Set(((subsRes.data || []) as { user_id: string }[]).map((s) => s.user_id));

  const now = Date.now();
  const results: { worker: string; days: number; channel?: string; skipped?: string }[] = [];
  const toReset: string[] = [];

  for (const w of workers) {
    const days = (missingByWorker.get(w.id) || []).sort().reverse();
    if (!days.length) { if (logs.has(w.id)) toReset.push(w.id); continue; }

    const log = logs.get(w.id);
    if (log) {
      if (log.sent_count >= MAX_REMINDERS) { results.push({ worker: w.id, days: days.length, skipped: 'max_reached' }); continue; }
      const hours = (now - new Date(log.last_sent_at).getTime()) / 3600000;
      if (hours < MIN_HOURS_BETWEEN) { results.push({ worker: w.id, days: days.length, skipped: 'too_soon' }); continue; }
    }

    if (dryRun) { results.push({ worker: w.id, days: days.length, channel: withPush.has(w.id) ? 'push' : 'email' }); continue; }

    let channel = '';
    try {
      if (withPush.has(w.id) && cronSecret) {
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSecret },
          body: JSON.stringify({
            user_ids: [w.id],
            title: companyName,
            body: days.length > 1
              ? `Il vous manque ${days.length} journées à déclarer.`
              : `Il vous manque la journée du ${fmtDateFR(days[0])} à déclarer.`,
            url: '/poseur',
            tag: 'heures-manquantes',
          }),
        });
        const out = await res.json().catch(() => ({}));
        if ((out?.sent || 0) > 0) channel = 'push';
      }
      // Repli email : soit pas d'abonnement push, soit le push n'a atteint aucun appareil.
      if (!channel) {
        if (!w.email) { results.push({ worker: w.id, days: days.length, skipped: 'no_email' }); continue; }
        const subject = `[${companyName}] — Il vous manque ${days.length > 1 ? `${days.length} journées` : 'une journée'} à déclarer`;
        await sendEmail(w.email, subject, buildHtml(companyName, w.first_name, days));
        channel = 'email';
      }

      await admin.from('reminder_log').upsert({
        user_id: w.id, company_id: companyId,
        last_sent_at: new Date().toISOString(),
        sent_count: (log?.sent_count || 0) + 1,
        channel,
      }, { onConflict: 'user_id' });
      results.push({ worker: w.id, days: days.length, channel });
    } catch (e) {
      results.push({ worker: w.id, days: days.length, skipped: `error: ${(e as Error).message}` });
    }
  }

  // Remise à zéro : le salarié s'est mis à jour, il repart avec 3 relances.
  if (toReset.length && !dryRun) await admin.from('reminder_log').delete().in('user_id', toReset);

  return { companyId, company: companyName, reminded: results.filter((r) => r.channel).length, results, reset: toReset.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const cronSecret = req.headers.get('x-cron-secret');
    if (!cronSecret) return json({ error: 'Non autorisé' }, 401);
    const { data: ok } = await admin.rpc('verify_cron_secret', { candidate: cronSecret });
    if (!ok) return json({ error: 'Secret invalide' }, 401);

    // company_id : restreint à une entreprise (tests ciblés).
    // dry_run : calcule et renvoie qui serait relancé, sans rien envoyer ni écrire.
    // ignore_schedule : ignore le filtre heure/jour (tests hors créneau).
    const { company_id, dry_run, ignore_schedule } = await req.json().catch(() => ({}));
    const dryRun = dry_run === true;

    // Le cron passe toutes les heures ; on ne retient que les entreprises dont
    // l'heure de relance correspond à l'heure courante à Paris, du lundi au
    // vendredi (jour évalué à Paris également).
    const { hour, weekday } = parisNow();
    const onSchedule = weekday >= 1 && weekday <= 5;
    if (!onSchedule && ignore_schedule !== true) {
      return json({ mode: 'skip', reason: 'week-end', paris: { hour, weekday } });
    }

    let q = admin.from('companies').select('id').eq('auto_reminder_enabled', true);
    if (ignore_schedule !== true) q = q.eq('reminder_hour', hour);
    const { data: companies } = company_id ? await q.eq('id', company_id) : await q;

    const results = [];
    for (const c of (companies || []) as { id: string }[]) {
      try { results.push(await runForCompany(admin, c.id, cronSecret, dryRun)); }
      catch (e) { results.push({ companyId: c.id, error: (e as Error).message }); }
    }
    return json({ mode: dryRun ? 'dry_run' : 'send', results });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
