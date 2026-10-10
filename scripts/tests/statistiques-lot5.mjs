// Lot 5 — « Statistiques » du bureau, sur la VRAIE page planning (/admin). Base
// simulée (aucune vraie base, aucun e-mail : send-push est simulé). Horloge figée
// au mercredi 21 octobre 2026, 10:00 à Paris (semaine 43).
//
// Lancer : npm run build, puis
//   node scripts/tests/statistiques-lot5.mjs out docs/captures-lot5 [port]
// Captures « avant » (build de la base, captures seulement, aucune vérification) :
//   AVANT=1 node scripts/tests/statistiques-lot5.mjs <build d'avant> docs/captures-lot5 [port]
// (playwright-core doit être résoluble.)
//
// La base simulée plafonne CHAQUE réponse (table ou fonction) à 1000 lignes,
// comme PostgREST, et applique offset / limit / order aux fonctions aussi.
// MIG : 'non' = migration 20261010190000 pas appliquée (hours_reminders → 404
// PGRST205, log_hours_reminder → 404 PGRST202) ; 'oui' = appliquée.
//
//   S1  accès discret : lien « statistiques » dans le cockpit (sans chiffre, 2 indicateurs
//       inchangés), 1024 avec l'essai sans chevauchement ; « Statistiques » dans le ☰ (390)
//   S2  ouverture : mois en cours, « Octobre 2026 », salariés du planning + archivé avec heures
//   S3  heures / sup = CSV de paie de l'équipe (même période), au centième près — mois et semaine
//   S4  coût = « Main d'œuvre » de Coût chantiers ; heures = « Heures » de Coût chantiers ;
//       sans taux : « — » + « taux à renseigner » ; aucun taux : colonne et pastille cachées
//   S5  oublis = cockpit (pastilles des lignes + bandeau) ; mois clôturé : le cockpit l'oublie,
//       les statistiques le gardent
//   S6  absences : par type dans le détail, jours à venir à part ; base 0 h dite
//   S7  12 mois = l'année (heures, sup, absences, oublis, coût) ; ‹ › ; libellés
//   S8  classement et barres ; changer d'indicateur ne relit rien
//   S9  tables facultatives absentes / coût en panne : seul le chiffre concerné disparaît
//   S10 heures illisibles (500) : « Chiffres illisibles », aucun chiffre
//   S11 pagination : année avec 1200 lignes de plus → totaux justes, offsets 0/500/1000 lus
//   S12 lecture seule : aucune écriture pendant la fenêtre (seul POST rpc/my_worksite_labour)
//   S13 tâches et réunions (lot 4) jamais lues
//   S14 « Relancer » : POST rpc/log_hours_reminder (jours, push) ; sans migration : 404 avalé
//   S15 390 / 768 / 1024 / 1280 / 1440 : aucun défilement horizontal
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, OUT = 'out', SH = 'docs/captures-lot5', PORT = '5601'] = process.argv;
const AVANT = process.env.AVANT === '1';
fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  for (const c of [p, `${p}.html`, path.join(p, 'index.html')]) {
    const f = path.join(OUT, c);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); }
  }
  r.writeHead(404); r.end();
});
await new Promise((r) => srv.listen(Number(PORT), r));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ─── Horloge figée : mercredi 21 octobre 2026, 10:00 (Paris) ──────────────────
const NOW = new Date('2026-10-21T10:00:00+02:00');
const TODAY = '2026-10-21';
const O = (d) => `2026-10-${String(d).padStart(2, '0')}`;
const S = (d) => `2026-09-${String(d).padStart(2, '0')}`;

// ─── Base simulée (noms fictifs neutres) ──────────────────────────────────────
const CO = 'c0000000-0000-0000-0000-0000000000aa', CO2 = 'c0000000-0000-0000-0000-0000000000bb';
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Exemple', city: 'Lyon', product_type: 'Fenêtres', is_active: true, budget_hours: null, budget_amount: null };
const W2 = { id: 'w2', company_id: CO, client_name: 'Résidence Test', city: 'Bron', product_type: null, is_active: true, budget_hours: null, budget_amount: null };
const WS = { w1: W1, w2: W2 };
const u = (id, first_name, last_name, role = 'worker', extra = {}) => ({ id, company_id: CO, first_name, last_name, role, email: `${id}@exemple.fr`, is_active: true, created_at: '2026-01-01', ...extra });
const USERS = [
  u('u-admin', 'Admin', 'Test', 'admin'),
  u('u-alex', 'Alex', 'Exemple'), u('u-chloe', 'Chloé', 'Démo', 'lead'), u('u-dina', 'Dina', 'Essai'),
  u('u-sam', 'Sam', 'Test'), u('u-yann', 'Yann', 'Essai'), u('u-zoe', 'Zoé', 'Exemple'),
  u('u-ancien', 'Ancien', 'Test', 'worker', { is_active: false }),
  u('u-autre', 'Autre', 'Salarié', 'worker', { company_id: CO2 }),
];
const NAME = Object.fromEntries(USERS.map((x) => [x.id, `${x.first_name} ${x.last_name}`]));
const PAYROLL = [
  { user_id: 'u-alex', weekly_hours: 39, hourly_rate: 15, payroll_id: 'M001' },
  { user_id: 'u-chloe', weekly_hours: null, hourly_rate: 18, payroll_id: 'M002' },
  { user_id: 'u-sam', weekly_hours: 0, hourly_rate: 14, payroll_id: 'M003' },
  { user_id: 'u-yann', weekly_hours: null, hourly_rate: null, payroll_id: 'M005' },
  { user_id: 'u-zoe', weekly_hours: null, hourly_rate: 16, payroll_id: 'M006' },
  { user_id: 'u-ancien', weekly_hours: null, hourly_rate: 12, payroll_id: 'M007' },
  // u-dina : aucune ligne (horaire de l'entreprise, pas de taux).
].map((x) => ({ company_id: CO, social_security_number: null, hire_date: null, contract_type: null, ...x }));
const COMPANY = { id: CO, name: 'Entreprise Test', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, travel_paid: true,
  subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, overtime_rate_1: 25, overtime_rate_2: 50, accountant_email: null, meal_enabled: true };

const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
let eid = 0;
const L = (user_id, work_date, start, end, extra = {}) => {
  const raw = toMin(end) - toMin(start) + (toMin(end) < toMin(start) ? 1440 : 0);
  return { id: `e${String(++eid).padStart(5, '0')}`, company_id: extra.company_id || CO, user_id, work_date, worksite_id: 'w1', planning_id: null, status: 'submitted',
    start_time: `${start}:00`, end_time: `${end}:00`, break_minutes: 0, total_minutes: raw - (extra.break_minutes || 0), meal_allowance: false, reception: null,
    reserve_resolved_at: null, reserve_fixed_at: null, observation: null, locked: false, exported_at: null, gap_before: null, source: null, exit_forgotten: false,
    modified_at: null, modified_by: null, created_at: `${work_date}T12:00:00Z`, submitted_at: `${work_date}T18:00:00Z`, ...extra };
};
const ENTRIES = [
  // Alex — base 39 h, 15 €/h. Semaine 28/09 à cheval (5 × 9 h), route payée le 06/10, oubli le 14/10.
  ...[S(28), S(29), S(30), O(1), O(2)].map((d) => L('u-alex', d, '08:00', '17:00')),
  L('u-alex', O(5), '08:00', '16:00'), L('u-alex', O(6), '08:00', '12:00'), L('u-alex', O(6), '13:00', '17:00', { worksite_id: 'w2', gap_before: 'route' }),
  ...[O(7), O(8), O(9)].map((d) => L('u-alex', d, '08:00', '16:00')),
  ...[O(12), O(13), O(15), O(16)].map((d) => L('u-alex', d, '07:00', '17:00')), L('u-alex', O(17), '08:00', '14:00'),
  L('u-alex', O(19), '08:00', '16:00'), L('u-alex', O(20), '08:00', '16:00'),
  // Chloé (cheffe d'équipe) — base de l'entreprise (35 h), 18 €/h. Nuit du samedi 03/10 (22:00 → 06:00).
  ...[S(28), S(29), S(30), O(1), O(2)].map((d) => L('u-chloe', d, '08:00', '15:00')), L('u-chloe', O(3), '22:00', '06:00'),
  ...[O(5), O(6), O(7), O(8), O(9)].map((d) => L('u-chloe', d, '08:00', '17:00')),
  L('u-chloe', O(19), '08:00', '15:00'), L('u-chloe', O(20), '08:00', '15:00'),
  L('u-chloe', O(20), '15:00', '18:00', { status: 'draft', submitted_at: null }),           // brouillon : jamais compté
  L('u-chloe', O(19), '18:00', '20:00', { status: 'cancelled' }),                           // retirée : jamais comptée
  // Sam — base 0 h (réglage volontaire : tout en sup), 14 €/h. Sortie oubliée le 16/10, oubli le 19/10.
  ...[O(5), O(6), O(7)].map((d) => L('u-sam', d, '08:00', '14:00')),
  L('u-sam', O(16), '08:00', '08:00', { status: 'draft', submitted_at: null, source: 'qr', exit_forgotten: true }),
  // Dina — aucune ligne de paie (35 h de l'entreprise, pas de taux). Journée du 08/10 renvoyée par le bureau.
  ...[S(28), S(29), S(30), O(1), O(2)].map((d) => L('u-dina', d, '08:00', '16:00')),
  L('u-dina', O(8), '08:00', '16:00', { status: 'draft', submitted_at: null }),
  L('u-dina', O(9), '08:00', '12:00', { status: 'cancelled', planning_id: 'p-d9' }),       // case retirée par la salariée
  // Yann — ligne de paie sans taux. Journée du 06/10 renvoyée (2 lignes) puis renvoyée.
  L('u-yann', O(6), '08:00', '15:00'), L('u-yann', O(19), '08:00', '16:00'), L('u-yann', O(20), '08:00', '16:00'),
  // Zoé — septembre seulement.
  ...[S(21), S(22), S(23), S(24), S(25)].map((d) => L('u-zoe', d, '08:00', '15:00')),
  // Ancien — archivé, mais des heures en octobre.
  L('u-ancien', O(1), '08:00', '16:00'), L('u-ancien', O(2), '08:00', '16:00'),
  // Une autre entreprise : jamais lue.
  L('u-autre', O(5), '08:00', '18:00', { company_id: CO2 }),
];
// S11 : 1200 lignes de plus en mars 2026 (une tranche de lecture à elle seule).
const EXTRA_MARCH = [];
for (const uid of ['u-alex', 'u-chloe', 'u-sam', 'u-dina', 'u-yann', 'u-zoe']) for (let d = 1; d <= 31; d++) for (let k = 0; k < 7; k++) {
  if (EXTRA_MARCH.length >= 1200) break;
  const st = 6 * 60 + k * 60;
  const hh = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  EXTRA_MARCH.push(L(uid, `2026-03-${String(d).padStart(2, '0')}`, hh(st), hh(st + 30)));
}
let pid = 0;
const slot = (user_id, work_date, worksite_id = 'w1', extra = {}) => ({ id: extra.id || `p${String(++pid).padStart(4, '0')}`, company_id: CO, user_id, worksite_id, work_date, absence_type: null,
  estimated_start: '08:00:00', estimated_end: '16:00:00', notes: null, position: null, added_by_worker: false, created_by: 'u-admin', created_at: `${work_date}T06:00:00Z`, ...extra });
const absence = (user_id, work_date, absence_type) => slot(user_id, work_date, null, { absence_type, estimated_start: null, estimated_end: null });
const PLANNING = [
  // Une case pour chaque journée envoyée (rien à « réparer » sur la page), puis les cas du lot.
  ...Array.from(new Map(ENTRIES.filter((e) => e.company_id === CO && e.status !== 'cancelled' && e.status !== 'draft' && e.user_id !== 'u-ancien')
    .map((e) => [`${e.user_id}|${e.work_date}|${e.worksite_id}`, e])).values()).map((e) => slot(e.user_id, e.work_date, e.worksite_id)),
  slot('u-alex', O(14)), slot('u-alex', O(21)), slot('u-sam', O(19)), slot('u-dina', O(8)), slot('u-dina', O(9), 'w2', { id: 'p-d9' }), slot('u-zoe', S(18)),
  ...[12, 13, 14, 15, 16, 17, 18, 22, 23].map((d) => absence('u-chloe', O(d), 'conge')),
  absence('u-sam', O(13), 'maladie'), absence('u-sam', O(14), 'maladie'), absence('u-sam', O(15), 'intemperie'),
  absence('u-yann', S(14), 'conge'), absence('u-yann', S(15), 'conge'),
];
const EDITS = [
  { id: 'r1', company_id: CO, entry_id: 'x', worker_id: 'u-dina', work_date: O(8), kind: 'return', reason: 'Pause à revoir', edited_by: 'u-admin', edited_at: `${O(9)}T08:00:00Z` },
  { id: 'r2', company_id: CO, entry_id: 'y', worker_id: 'u-yann', work_date: O(6), kind: 'return', reason: 'Heures à revoir', edited_by: 'u-admin', edited_at: `${O(7)}T08:00:00Z` },
  { id: 'r3', company_id: CO, entry_id: 'z', worker_id: 'u-yann', work_date: O(6), kind: 'return', reason: 'Heures à revoir', edited_by: 'u-admin', edited_at: `${O(7)}T08:00:00Z` },
  { id: 'r4', company_id: CO, entry_id: 'z', worker_id: 'u-yann', work_date: O(6), kind: 'correction', reason: 'Pause', edited_by: 'u-admin', edited_at: `${O(7)}T08:00:00Z` },
];
const REMINDERS = [
  { id: 'h1', company_id: CO, user_id: 'u-sam', sent_at: '2026-10-12T13:00:00Z', source: 'auto', channel: 'email', days: [], sent_by: null },
  { id: 'h2', company_id: CO, user_id: 'u-sam', sent_at: '2026-10-20T13:00:00Z', source: 'bureau', channel: 'push', days: [O(19)], sent_by: 'u-admin' },
  { id: 'h3', company_id: CO, user_id: 'u-dina', sent_at: '2026-09-30T13:00:00Z', source: 'auto', channel: 'push', days: [], sent_by: null },
];

let MIG = 'oui';         // migration du lot 5 appliquée ?
let EDITS_TABLE = 'ok';  // time_entry_edits lisible ?
let LABOUR = 'ok';       // my_worksite_labour répond ?
let ENTRIES_500 = false; // time_entries en panne ?
let RATES = 'ok';        // 'none' : aucun taux horaire
let pushSent = 1;
const D = {};
const freshDb = ({ march = false } = {}) => {
  for (const k of Object.keys(D)) delete D[k];
  Object.assign(D, {
    users: USERS.map((x) => ({ ...x })), companies: [{ ...COMPANY }], worksites: [W1, W2].map((x) => ({ ...x })),
    planning: PLANNING.map((x) => ({ ...x })), time_entries: [...ENTRIES, ...(march ? EXTRA_MARCH : [])].map((x) => ({ ...x })),
    user_payroll: PAYROLL.map((x) => ({ ...x, hourly_rate: RATES === 'none' ? null : x.hourly_rate })),
    time_entry_edits: EDITS.map((x) => ({ ...x })), hours_reminders: REMINDERS.map((x) => ({ ...x })),
    meetings: [{ id: 'm1', company_id: CO, title: 'Point équipe', meeting_date: O(14), start_time: '08:00:00', end_time: '09:00:00', place: null, all_team: true, created_by: 'u-admin', created_at: '2026-10-10T08:00:00Z', updated_at: '2026-10-10T08:00:00Z' }],
    meeting_participants: [], day_tasks: [{ id: 't1', company_id: CO, user_id: 'u-sam', work_date: O(19), text: 'Ranger', part: null, created_by: 'u-admin', created_at: '2026-10-18T08:00:00Z', done_at: null, done_by: null }],
    task_templates: [], active_sessions: [], documents: [], invitations: [], month_closures: [], user_closures: [], leave_requests: [], push_subscriptions: [], kiosks: [],
    worksite_expenses: [], certifications: [], time_entry_corrections: [],
  });
};
freshDb();

// my_worksite_labour, rejouée avec les règles du SQL (etape13) : statuts comptés, route payée
// (max des fins précédentes du jour, départage par id), taux ACTUEL, minutes non chiffrées.
function labourRows(from, to) {
  const scoped = D.time_entries.filter((t) => t.company_id === CO && ['submitted', 'validated'].includes(t.status) && t.worksite_id
    && (!from || t.work_date >= from) && (!to || t.work_date <= to))
    .map((t) => ({ ...t, s: toMin(t.start_time), e: (toMin(t.end_time) < toMin(t.start_time) ? 1440 : 0) + toMin(t.end_time) }));
  const byDay = new Map();
  for (const t of scoped) { const k = `${t.user_id}|${t.work_date}`; if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(t); }
  const agg = new Map();
  for (const arr of byDay.values()) {
    arr.sort((a, z) => a.s - z.s || (a.id < z.id ? -1 : 1));
    let prev = null;
    for (const t of arr) {
      const route = t.gap_before === 'route' && prev != null && t.s > prev && D.companies[0].travel_paid ? t.s - prev : 0;
      prev = prev == null ? t.e : Math.max(prev, t.e);
      const rate = D.user_payroll.find((p) => p.user_id === t.user_id)?.hourly_rate ?? null;
      const k = `${t.worksite_id}|${t.user_id}`;
      const a = agg.get(k) || { worksite_id: t.worksite_id, user_id: t.user_id, worked_minutes: 0, route_minutes: 0, paid_minutes: 0, cost: 0, unpriced_minutes: 0 };
      const paid = t.total_minutes + route;
      a.worked_minutes += t.total_minutes; a.route_minutes += route; a.paid_minutes += paid;
      if (rate == null) a.unpriced_minutes += paid; else a.cost += (paid / 60) * rate;
      agg.set(k, a);
    }
  }
  return Array.from(agg.values()).map((a) => ({ ...a, cost: Math.round(a.cost * 1e6) / 1e6 }));
}

// ─── Réseau simulé ────────────────────────────────────────────────────────────
const writes = []; // toute requête hors GET (REST, RPC, fonctions)
const gets = [];
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or']);
const filterRows = (rows, params) => {
  for (const [k, v] of params) {
    if (SKIP.has(k)) continue;
    let neg = false; let w = v; if (w.startsWith('not.')) { neg = true; w = w.slice(4); }
    const dot = w.indexOf('.'); const op = w.slice(0, dot); const val = w.slice(dot + 1);
    rows = rows.filter((x) => {
      if (!(k in x)) return true;
      const cur = x[k]; let r = true;
      if (op === 'eq') r = String(cur) === val;
      else if (op === 'neq') r = String(cur) !== val;
      else if (op === 'in') r = val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(cur));
      else if (op === 'gte') r = String(cur) >= val;
      else if (op === 'lte') r = String(cur) <= val;
      else if (op === 'gt') r = String(cur) > val;
      else if (op === 'lt') r = String(cur) < val;
      else if (op === 'is') r = val === 'null' ? cur == null : String(cur) === val;
      return neg ? !r : r;
    });
  }
  return rows;
};
const sortRows = (rows, order) => {
  if (!order) return rows;
  const keys = order.split(',').map((o) => { const [k, dir] = o.split('.'); return { k, desc: dir === 'desc' }; });
  return [...rows].sort((a, z) => { for (const { k, desc } of keys) { const x = String(a[k] ?? ''); const y = String(z[k] ?? ''); if (x !== y) return (x < y ? -1 : 1) * (desc ? -1 : 1); } return 0; });
};
/** PostgREST : offset / limit, et jamais plus de 1000 lignes par réponse. */
const page = (rows, params) => {
  const off = Number(params.get('offset') || 0); const lim = params.get('limit');
  return rows.slice(off, off + Math.min(lim ? Number(lim) : 1000, 1000));
};
const sessionFor = (uid) => {
  const now = Math.floor(NOW.getTime() / 1000) + 3600; const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', exp: now + 864000, aal: 'aal1' })}.sig`;
  return { access_token: jwt, refresh_token: 'r', expires_at: now + 864000, expires_in: 864000, token_type: 'bearer', user: { id: uid, email: `${uid}@exemple.fr`, aud: 'authenticated', role: 'authenticated' } };
};
const MISSING_TABLE = (t) => ({ status: 404, json: { code: 'PGRST205', message: `Could not find the table 'public.${t}' in the schema cache`, details: null, hint: null } });
const MISSING_FN = (fn) => ({ status: 404, json: { code: 'PGRST202', message: `Could not find the function public.${fn} in the schema cache`, details: null, hint: null } });
const errors = [];
let ctxSeq = 0;
const newCtx = async (viewport, extra = {}) => {
  const ctx = await b.newContext({ viewport, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true,
    ...(viewport.width < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}), ...extra });
  const cid = ++ctxSeq;
  const session = sessionFor('u-admin');
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.addInitScript(() => {
    window.__toasts = [];
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        const list = n.matches?.('[data-sonner-toast]') ? [n] : [...(n.querySelectorAll?.('[data-sonner-toast]') || [])];
        for (const t of list) setTimeout(() => window.__toasts.push((t.textContent || '').trim()), 80);
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await ctx.clock.setFixedTime(NOW);
  await ctx.route((url) => url.hostname !== 'localhost' && !url.hostname.endsWith('.supabase.co'), (r) => r.abort());
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const req = r.request(); const url = new URL(req.url()); const m = req.method();
    let body = null; try { body = req.postDataJSON(); } catch { body = req.postData(); }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/')) {
      const fn = url.pathname.replace('/functions/v1/', '');
      writes.push({ cid, m: 'FN', t: fn, body });
      if (fn === 'send-push') return r.fulfill({ json: { mode: 'admin', sent: pushSent, failed: 0, purged: 0 } });
      return r.fulfill({ json: {} });
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.replace('/rest/v1/rpc/', '');
      writes.push({ cid, m: 'RPC', t: fn, body, q: url.search });
      if (fn === 'my_worksite_labour') {
        gets.push({ cid, t: 'rpc:my_worksite_labour', p: new URLSearchParams(url.searchParams) });
        if (LABOUR === 'ko') return r.fulfill({ status: 500, json: { code: 'XX000', message: 'panne simulée', details: null, hint: null } });
        const rows = sortRows(labourRows(body?.p_from ?? null, body?.p_to ?? null), url.searchParams.get('order'));
        return r.fulfill({ json: page(rows, url.searchParams) });
      }
      if (fn === 'log_hours_reminder') {
        if (MIG !== 'oui') return r.fulfill(MISSING_FN(fn));
        const id = `h-${D.hours_reminders.length + 1}`;
        D.hours_reminders.push({ id, company_id: CO, user_id: body.p_user_id, sent_at: NOW.toISOString(), source: 'bureau', channel: body.p_channel ?? null, days: body.p_days || [], sent_by: 'u-admin' });
        return r.fulfill({ json: id });
      }
      if (fn === 'company_has_kiosk') return r.fulfill({ json: false });
      return r.fulfill({ json: [] });
    }
    const t = url.pathname.replace('/rest/v1/', '');
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const reply = (rows, status = 200, total = rows.length, off = 0) => {
      if (single) return rows.length ? r.fulfill({ status, json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none', details: null, hint: null } });
      return r.fulfill({ status, json: rows, headers: { 'content-range': `${off}-${Math.max(off, off + rows.length - 1)}/${total}`, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' } });
    };
    if (m === 'GET' || m === 'HEAD') {
      gets.push({ cid, t, p: new URLSearchParams(url.searchParams) });
      if (t === 'hours_reminders' && MIG !== 'oui') return r.fulfill(MISSING_TABLE(t));
      if (t === 'time_entry_edits' && EDITS_TABLE !== 'ok') return r.fulfill(MISSING_TABLE(t));
      if (t === 'time_entries' && ENTRIES_500) return r.fulfill({ status: 500, json: { code: 'XX000', message: 'panne simulée', details: null, hint: null } });
      const sel = url.searchParams.get('select') || '*';
      const all = sortRows(filterRows(D[t] || [], url.searchParams), url.searchParams.get('order')).map((x) => {
        if (t !== 'planning' && t !== 'time_entries') return x;
        return { ...x, ...(sel.includes('worksite:worksites') ? { worksite: x.worksite_id ? WS[x.worksite_id] : null } : {}),
          ...(sel.includes('user:users') ? { user: (() => { const z = D.users.find((y) => y.id === x.user_id); return z ? { first_name: z.first_name, last_name: z.last_name } : null; })() } : {}) };
      });
      const off = Number(url.searchParams.get('offset') || 0);
      return reply(page(all, url.searchParams), 200, all.length, off);
    }
    writes.push({ cid, m, t, q: url.search, body });
    if (m === 'POST') { const list = (Array.isArray(body) ? body : [body]).map((x) => ({ id: `x-${writes.length}`, ...x })); D[t] = [...(D[t] || []), ...list]; return reply(list, 201); }
    const hit = filterRows(D[t] || [], url.searchParams);
    if (m === 'PATCH') { for (const x of hit) Object.assign(x, body); return reply(hit); }
    if (m === 'DELETE') { D[t] = (D[t] || []).filter((x) => !hit.includes(x)); return reply(hit); }
    return reply([]);
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { errors.push(e.message); console.log('   [erreur page]', e.message); });
  return { ctx, p, cid };
};

// ─── Outils ───────────────────────────────────────────────────────────────────
let ok = 0, ko = 0; const fails = [];
const check = (c, m) => { if (AVANT) return; if (c) { ok++; console.log('  ✅', m); } else { ko++; fails.push(m); console.log('  ❌', m); } };
const section = (t) => { if (!AVANT) console.log(`\n═══ ${t}`); };
const shot = async (p, name) => {
  await p.evaluate(() => document.querySelectorAll('[data-sonner-toaster]').forEach((t) => { t.style.visibility = 'hidden'; })).catch(() => {});
  await p.waitForTimeout(350);
  await p.screenshot({ path: path.join(SH, `${AVANT ? 'avant' : 'apres'}-${name}.png`) }).catch((e) => console.log('   (capture impossible :', e.message.split('\n')[0], ')'));
  await p.evaluate(() => document.querySelectorAll('[data-sonner-toaster]').forEach((t) => { t.style.visibility = ''; })).catch(() => {});
};
const txt = async (loc) => (await loc.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
const vis = (p, sel) => p.locator(`${sel}:visible`);
const openAdmin = async (p) => {
  await p.goto(`http://localhost:${PORT}/admin`);
  await p.waitForSelector(p.viewportSize().width < 1024 ? '.bt-pl-m-ibtn[aria-label=Menu]' : '[data-testid=stat-waiting]', { timeout: 25000 });
  await p.waitForTimeout(1500);
};
const dlg = (p) => p.locator('[data-testid=team-stats]');
const label = async (p) => ((await p.locator('[data-testid=stats-label]').textContent()) || '').trim();
const keyOf = (per) => `${per.from}|${per.to}`;
/** Attend les chiffres d'UNE période (data-loaded = « from|to ») — ou l'erreur. */
const waitLoaded = async (p, key) => { await p.waitForSelector(`[data-testid=team-stats][data-loaded="${key}"]`, { timeout: 20000 }); await p.waitForTimeout(150); };
const openStats = async (p) => {
  await p.click('[data-testid=stat-stats]');
  await waitLoaded(p, '2026-10-01|2026-10-31');
};
const statRows = (p) => p.$$eval('[data-testid=stats-row]', (els) => els.map((e) => ({
  uid: e.dataset.uid, rank: e.dataset.rank === '' ? null : Number(e.dataset.rank), minutes: Number(e.dataset.minutes), overtime: Number(e.dataset.overtime),
  absences: Number(e.dataset.absences), forgotten: Number(e.dataset.forgotten), cost: e.dataset.cost === '' ? null : Number(e.dataset.cost),
  name: (e.querySelector('.bt-st-nm')?.textContent || '').trim(), value: (e.querySelector('.bt-st-v')?.textContent || '').trim(),
  bar: parseFloat(e.querySelector('[data-testid=stats-bar]')?.style.width || '0'),
})));
const teamRow = (p) => p.$eval('[data-testid=stats-team]', (e) => ({ minutes: Number(e.dataset.minutes), overtime: Number(e.dataset.overtime), absences: Number(e.dataset.absences), forgotten: Number(e.dataset.forgotten), cost: Number(e.dataset.cost) }));
const byUid = (rows) => Object.fromEntries(rows.map((r) => [r.uid, r]));
const hScroll = (p) => p.evaluate(() => {
  const out = [];
  const de = document.documentElement;
  if (de.scrollWidth > window.innerWidth + 1) out.push(`page ${de.scrollWidth} > ${window.innerWidth}`);
  for (const d of document.querySelectorAll('[role=dialog]')) {
    if (d.scrollWidth > d.clientWidth + 1) out.push(`fenêtre ${d.scrollWidth} > ${d.clientWidth}`);
    const R = d.getBoundingClientRect();
    if (R.left < -1 || R.right > window.innerWidth + 1) out.push(`fenêtre hors écran ${Math.round(R.left)}…${Math.round(R.right)}`);
    for (const el of d.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > R.right + 1 && !el.closest('[data-radix-popper-content-wrapper]')) { out.push(`déborde : <${el.tagName.toLowerCase()}> « ${(el.textContent || '').trim().slice(0, 30)} »`); break; }
    }
  }
  return out;
});
const parseCsv = (text) => text.replace(/^﻿/, '').trim().split(/\r\n/).map((l) => l.split(';'));
const fromCenti = (s) => Math.round(Number(String(s).replace(',', '.')) * 60);
/** Le CSV de paie de l'équipe (vraie fenêtre « Exporter l'équipe ») : minutes par salarié. */
async function teamCsv(p, range) {
  await p.click('[data-testid=bar-export]');
  const team = p.locator('[data-testid=team-export]'); await team.waitFor();
  if (range === 'week') await team.getByRole('button', { name: 'Cette semaine', exact: true }).click();
  else {
    await team.getByRole('button', { name: /Créneau/ }).click();
    const days = p.locator('[data-radix-popper-content-wrapper] button[name=day]:not(.day-outside)');
    await days.first().waitFor();
    const pick = async (n) => { const i = await days.evaluateAll((els, n) => els.findIndex((e) => !/day-outside/.test(e.className) && e.textContent.trim() === String(n)), n); await days.nth(i).click(); };
    await pick(range[0]); await pick(range[1]);
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  }
  await team.locator('[data-testid=team-export-menu]').click();
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.locator('[data-testid=team-export-menu-csv]').click()]);
  const rows = parseCsv(fs.readFileSync(await dl.path(), 'utf8'));
  const head = rows[0];
  const iN = head.indexOf('Nom'), iP = head.indexOf('Prenom'), iT = head.indexOf('Total heures'), i25 = head.findIndex((h) => /^Heures sup 25/.test(h)), i50 = head.findIndex((h) => /^Heures sup 50/.test(h));
  const out = {};
  for (const r of rows.slice(1)) {
    const uid = USERS.find((x) => x.last_name === r[iN] && x.first_name === r[iP])?.id || `?${r[iP]} ${r[iN]}`;
    const cur = out[uid] || { minutes: 0, overtime: 0 };
    cur.minutes += fromCenti(r[iT]); cur.overtime += fromCenti(r[i25]) + fromCenti(r[i50]);
    out[uid] = cur;
  }
  await p.waitForTimeout(600); // le verrouillage de l'export se termine
  for (let i = 0; i < 3 && await team.isVisible(); i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(400); }
  return out;
}

// ═══ AVANT : captures seulement ═══════════════════════════════════════════════
if (AVANT) {
  for (const [w, h] of [[1440, 900], [1024, 768]]) {
    const { ctx, p } = await newCtx({ width: w, height: h });
    await openAdmin(p); await p.mouse.move(w / 2, 400);
    await shot(p, `cockpit-${w}x${h}`);
    await ctx.close();
  }
  const { ctx, p } = await newCtx({ width: 390, height: 844 });
  await openAdmin(p);
  await p.locator('.bt-pl-m-ibtn[aria-label=Menu]').click(); await p.waitForTimeout(600);
  await shot(p, 'menu-mobile-390x844');
  await ctx.close();
  await b.close(); srv.close();
  console.log('captures « avant » prises');
  process.exit(0);
}

// ═══ S1 — accès discret ═══════════════════════════════════════════════════════
section('S1 accès discret : cockpit (lien sans chiffre) et menu ☰');
const overlap = (a, c) => a.x < c.x + c.width - 0.5 && c.x < a.x + a.width - 0.5 && a.y < c.y + c.height - 0.5 && c.y < a.y + a.height - 0.5;
D.companies[0].subscription_status = 'trialing'; D.companies[0].trial_ends_at = '2026-11-02';
for (const [w, h] of [[1024, 768], [1280, 800], [1440, 900]]) {
  const { ctx, p } = await newCtx({ width: w, height: h });
  await openAdmin(p);
  const link = p.locator('[data-testid=stat-stats]');
  const label = await txt(link);
  const title = await link.getAttribute('title');
  check(await link.isVisible() && label === 'statistiques' && !/\d/.test(label), `${w}×${h} : lien « ${label} » visible, sans chiffre`);
  check(/lecture seule/.test(title || ''), `${w}×${h} : infobulle « ${title} »`);
  check(await p.locator('.bt-pl-cockpit .bt-pl-stat').count() === 2, `${w}×${h} : toujours 2 indicateurs .bt-pl-stat (règle du lot 11)`);
  const [ck, lg, st, rt] = await Promise.all(['.bt-pl-cockpit', '.bt-pl-cockpit .bt-pl-logo', '.bt-pl-stats', '.bt-pl-cockpit-right'].map((s) => vis(p, s).first().boundingBox()));
  const lk = await link.boundingBox();
  const trialOn = await vis(p, '.bt-pl-cockpit .bt-pl-trial').count() === 1;
  check(trialOn && !overlap(st, lg) && !overlap(st, rt) && !overlap(lg, rt) && lk.x >= st.x - 0.5 && lk.x + lk.width <= st.x + st.width + 0.5 && ck.height <= 50,
    `${w}×${h} (essai affiché) : logo / chiffres + lien / droite sans chevauchement, cockpit ${Math.round(ck.height)} px`);
  const mids = await p.evaluate(() => [...document.querySelectorAll('.bt-pl-cockpit .bt-pl-stat, .bt-pl-cockpit .bt-pl-cklink')].map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.top + r.height / 2); }));
  check(Math.max(...mids) - Math.min(...mids) <= 2, `${w}×${h} : chiffres et lien sur une ligne (${mids.join(', ')})`);
  if (w !== 1280) { await p.mouse.move(w / 2, 400); await shot(p, `cockpit-${w}x${h}`); }
  await ctx.close();
}
D.companies[0].subscription_status = 'active'; D.companies[0].trial_ends_at = '2030-01-01';
{
  const { ctx, p } = await newCtx({ width: 390, height: 844 });
  await openAdmin(p);
  await p.locator('.bt-pl-m-ibtn[aria-label=Menu]').click(); await p.waitForTimeout(600);
  const items = await p.locator('.bt-mm-item .bt-mm-label').allInnerTexts();
  const iCost = items.indexOf('Coût chantiers'), iStats = items.indexOf('Statistiques');
  check(iStats > 0 && iStats === iCost + 1, `390 : « Statistiques » juste après « Coût chantiers » dans le ☰ (${items.join(' · ')})`);
  await shot(p, 'menu-mobile-390x844');
  await p.click('[data-testid=mm-stats]');
  await waitLoaded(p, '2026-10-01|2026-10-31');
  await p.locator('.bt-mm-sheet').waitFor({ state: 'detached', timeout: 5000 }); // le ☰ a fini de glisser hors de l'écran
  check(await dlg(p).isVisible(), '390 : le ☰ ouvre les statistiques');
  const hs = await hScroll(p);
  check(hs.length === 0, `390 : aucun défilement horizontal ${JSON.stringify(hs)}`);
  await p.locator('[data-testid=stats-row]').first().click(); await p.waitForTimeout(300);
  check(await p.locator('[data-testid=stats-detail]').isVisible(), '390 : toucher une ligne ouvre son détail');
  check((await hScroll(p)).length === 0, '390 : détail ouvert, toujours aucun défilement horizontal');
  await shot(p, 'stats-mobile-390x844');
  await ctx.close();
}

// ═══ S2–S8 — bureau 1440 ═════════════════════════════════════════════════════
const EXPECT_OCT = {
  'u-alex': { minutes: 7260, overtime: 900, absences: 0, forgotten: 1, cost: 1815 },
  'u-chloe': { minutes: 4860, overtime: 1080, absences: 7, forgotten: 0, cost: 1458 },
  'u-sam': { minutes: 1080, overtime: 1080, absences: 3, forgotten: 2, cost: 252 },
  'u-dina': { minutes: 960, overtime: 300, absences: 0, forgotten: 1, cost: null },
  'u-yann': { minutes: 1380, overtime: 0, absences: 0, forgotten: 0, cost: null },
  'u-zoe': { minutes: 0, overtime: 0, absences: 0, forgotten: 0, cost: null },
  'u-ancien': { minutes: 960, overtime: 0, absences: 0, forgotten: 0, cost: 192 },
};
let monthRows = null;
{
  // Le CSV de l'équipe d'abord, dans sa PROPRE fenêtre (l'export verrouille : des écritures, hors statistiques).
  const exp = await newCtx({ width: 1440, height: 900 });
  await openAdmin(exp.p);
  const csvOct = await teamCsv(exp.p, [1, 31]);
  const csvWeek = await teamCsv(exp.p, 'week');
  await exp.ctx.close();
  freshDb(); // les verrous de l'export n'ont aucune importance ici, mais on repart propre

  const { ctx, p, cid } = await newCtx({ width: 1440, height: 900 });
  await openAdmin(p);
  section('S2 ouverture : mois en cours, salariés du planning + archivé avec heures');
  const w0 = writes.length; const g0 = gets.length;
  await openStats(p);
  check(await label(p) === 'octobre 2026', `libellé « ${await label(p)} » (affiché « Octobre 2026 »)`);
  check(await p.locator('[data-testid=stats-kind-month]').getAttribute('aria-pressed') === 'true', '« Mois » sélectionné par défaut');
  check(await p.locator('[data-testid=stats-next]').isDisabled(), '› grisé sur le mois en cours');
  monthRows = await statRows(p);
  const got = byUid(monthRows);
  check(JSON.stringify(Object.keys(got).sort()) === JSON.stringify(Object.keys(EXPECT_OCT).sort()),
    `lignes : les 6 salariés du planning + « Ancien Test » (archivé, heures en octobre) ; ni le bureau ni l'autre entreprise (${monthRows.map((r) => r.name).join(', ')})`);
  check((got['u-ancien']?.name || '').includes('archivé'), `« Ancien Test » porte l'étiquette « archivé » (${got['u-ancien']?.name})`);
  for (const [uid, e] of Object.entries(EXPECT_OCT)) {
    const g = got[uid] || {};
    check(g.minutes === e.minutes && g.overtime === e.overtime && g.absences === e.absences && g.forgotten === e.forgotten && (e.cost == null ? g.cost == null : Math.abs(g.cost - e.cost) < 0.005),
      `${NAME[uid]} : ${g.minutes} min, sup ${g.overtime}, abs ${g.absences} j, oublis ${g.forgotten}, coût ${g.cost ?? '—'} (attendu ${JSON.stringify(e)})`);
  }
  await shot(p, 'stats-mois-1440');

  section('S3 heures et heures sup = le CSV de paie de l’équipe (octobre, puis la semaine)');
  for (const [uid, r] of Object.entries(got)) {
    const c = csvOct[uid] || { minutes: 0, overtime: 0 };
    check(r.minutes === c.minutes && r.overtime === c.overtime, `${NAME[uid]} : heures ${r.minutes} = CSV ${c.minutes} ; sup ${r.overtime} = CSV ${c.overtime}`);
  }
  check(Object.keys(csvOct).every((uid) => got[uid]), `chaque salarié du CSV d'octobre est dans les statistiques (${Object.keys(csvOct).map((x) => NAME[x] || x).join(', ')})`);
  const team = await teamRow(p);
  check(team.minutes === Object.values(csvOct).reduce((s, x) => s + x.minutes, 0) && team.minutes === 16500, `ligne « Équipe » : ${team.minutes} min = total du CSV (275 h)`);
  check(team.overtime === 3360 && team.absences === 10 && team.forgotten === 4 && Math.abs(team.cost - 3717) < 0.005, `ligne « Équipe » : sup ${team.overtime}, abs ${team.absences}, oublis ${team.forgotten}, coût ${team.cost}`);

  section('S8 classement et barres ; changer d’indicateur ne relit rien');
  const order = monthRows.map((r) => r.uid);
  check(JSON.stringify(order) === JSON.stringify(['u-alex', 'u-chloe', 'u-yann', 'u-sam', 'u-ancien', 'u-dina', 'u-zoe']), `classé par heures : ${monthRows.map((r) => `${r.rank ?? '–'}. ${r.name.replace('archivé', '').trim()}`).join(' · ')}`);
  check(JSON.stringify(monthRows.map((r) => r.rank)) === JSON.stringify([1, 2, 3, 4, 5, 5, null]), `rangs 1, 2, 3, 4, 5, 5, – (égalité Ancien / Dina, ordre alphabétique ; zéro sans rang)`);
  check(monthRows[0].bar === 100 && Math.abs(monthRows[1].bar - 4860 / 7260 * 100) < 0.01 && monthRows[6].bar === 0, `barres : 100 % pour le premier, proportionnelles, 0 pour zéro (${monthRows.map((r) => Math.round(r.bar)).join(', ')})`);
  check(monthRows[0].value.startsWith('121 h'), `valeur lisible « ${monthRows[0].value} »`);
  const gBefore = gets.length;
  await p.click('[data-testid=stats-metric-overtime]'); await p.waitForTimeout(250);
  const ot = await statRows(p);
  check(JSON.stringify(ot.slice(0, 4).map((r) => [r.uid, r.rank])) === JSON.stringify([['u-chloe', 1], ['u-sam', 1], ['u-alex', 3], ['u-dina', 4]]), `heures sup : Chloé et Sam ex æquo (1), Alex 3, Dina 4 (${ot.map((r) => `${r.rank ?? '–'} ${r.uid}`).join(' · ')})`);
  check(gets.length === gBefore, 'changer d’indicateur : aucune requête');
  await shot(p, 'stats-heures-sup-1440');
  await p.click('[data-testid=stats-metric-absences]'); await p.waitForTimeout(200);
  const ab = await statRows(p);
  check(ab[0].uid === 'u-chloe' && ab[1].uid === 'u-sam' && ab[2].rank === null, `absences : le TOTAL classe (Chloé 7 j, Sam 3 j), pas de classement par type`);
  check(await p.locator('[data-testid=stats-metric-maladie]').count() === 0, 'aucune pastille « Maladie » : pas de classement par arrêt maladie');
  await p.click('[data-testid=stats-metric-forgotten]'); await p.waitForTimeout(200);
  check((await statRows(p))[0].uid === 'u-sam', 'oublis : Sam en tête (2 j)');
  await p.click('[data-testid=stats-metric-cost]'); await p.waitForTimeout(200);
  const co = await statRows(p);
  check(co[0].uid === 'u-alex' && co.find((r) => r.uid === 'u-dina').value.startsWith('—'), `coût : Alex en tête ; Dina sans taux « — » (${co.map((r) => r.value).join(' · ')})`);
  await p.click('[data-testid=stats-metric-hours]'); await p.waitForTimeout(200);

  section('S6 détail : absences par type, à venir à part, base 0 h, renvois, relances');
  const openDetail = async (uid) => {
    await p.locator(`[data-testid=stats-row][data-uid="${uid}"]`).click(); await p.waitForTimeout(250);
    return txt(p.locator('[data-testid=stats-detail]'));
  };
  const dChloe = await openDetail('u-chloe');
  check(/Absences\s*7 j \(à venir : 2 j\)/.test(dChloe) && /Congé 7 j · Maladie 0 j · Intempérie 0 j/.test(dChloe), `Chloé : 7 j (week-end compris), à venir 2 j hors total (« ${dChloe.slice(0, 240)} »)`);
  check(/Sup\. 1 \(25 %\)\s*16 h/.test(dChloe) && /Sup\. 2 \(50 %\)\s*2 h/.test(dChloe), 'Chloé : Sup. 1 (25 %) 16 h, Sup. 2 (50 %) 2 h (taux de l’entreprise)');
  const dSam = await openDetail('u-sam');
  check(/Base 0 h\/sem\. : toutes ses heures comptent en sup\./.test(dSam), 'Sam : « Base 0 h/sem. » dit en clair');
  check(/Maladie 2 j · Intempérie 1 j/.test(dSam) && /Journées oubliées\s*2 j — lun\. 19 oct\., ven\. 16 oct\./.test(dSam), `Sam : maladie et intempérie dans le détail ; oublis 19/10 et 16/10 (sortie oubliée) (« ${dSam.slice(0, 300)} »)`);
  check(/Relances reçues\s*2/.test(dSam), 'Sam : 2 relances reçues en octobre (journal)');
  const dAlex = await openDetail('u-alex');
  check(/Heures travaillées\s*121 h \(dont 1 h de route\)/.test(dAlex) && /Coût\s*1\s?815 €/.test(dAlex.replace(/ /g, ' ')), `Alex : route payée dite, coût 1 815 € (« ${dAlex.slice(0, 200)} »)`);
  check(!/€\/h|taux horaire : \d/i.test(dAlex), 'aucun taux horaire affiché');
  const dYann = await openDetail('u-yann');
  check(/Renvoyées par le bureau\s*1 j/.test(dYann) && /Taux horaire à renseigner/.test(dYann), 'Yann : 2 lignes renvoyées le même jour = 1 j ; coût « taux horaire à renseigner »');
  const dDina = await openDetail('u-dina');
  check(/Journées oubliées\s*1 j — jeu\. 8 oct\./.test(dDina) && /Renvoyées par le bureau\s*1 j/.test(dDina), 'Dina : journée renvoyée = oubli (comme le cockpit) ; case retirée du 9/10 non réclamée');
  await shot(p, 'stats-detail-ligne-1440');
  await p.locator('[data-testid=stats-row][data-uid="u-dina"]').click(); await p.waitForTimeout(200);

  section('S7 ‹ › et libellés ; 12 mois = l’année');
  const months = [];
  const per = { from: '2026-10-01', to: '2026-10-31' };
  months.push({ key: keyOf(per), rows: monthRows, team });
  for (let m = 9; m >= 1; m--) {
    await p.click('[data-testid=stats-prev]');
    const mm = String(m).padStart(2, '0');
    const last = new Date(Date.UTC(2026, m, 0)).getUTCDate();
    const key = `2026-${mm}-01|2026-${mm}-${last}`;
    await waitLoaded(p, key);
    const empty = await p.locator('[data-testid=stats-empty]').count();
    months.push({ key, rows: empty ? [] : await statRows(p), team: empty ? { minutes: 0, overtime: 0, absences: 0, forgotten: 0, cost: 0 } : await teamRow(p) });
  }
  check(await label(p) === 'janvier 2026', '‹ × 9 : janvier 2026');
  check(!(await p.locator('[data-testid=stats-next]').isDisabled()), '› actif sur un mois passé');
  const sep = months.find((x) => x.key === '2026-09-01|2026-09-30');
  const sepBy = byUid(sep.rows);
  check(sepBy['u-alex']?.minutes === 1620 && sepBy['u-alex']?.overtime === 0 && sepBy['u-zoe']?.minutes === 2100 && sepBy['u-zoe']?.forgotten === 1 && sepBy['u-yann']?.absences === 2,
    `septembre : Alex 27 h sans sup (sa semaine à cheval classe en octobre), Zoé 35 h + 1 oubli, Yann 2 j de congé`);
  await p.click('[data-testid=stats-kind-year]');
  await waitLoaded(p, '2026-01-01|2026-12-31');
  check(await label(p) === '2026', 'Année : « 2026 »');
  check(await p.locator('[data-testid=stats-next]').isDisabled(), '› grisé sur l’année en cours');
  const year = await teamRow(p);
  const sumM = months.reduce((s, x) => ({ minutes: s.minutes + x.team.minutes, overtime: s.overtime + x.team.overtime, absences: s.absences + x.team.absences, forgotten: s.forgotten + x.team.forgotten, cost: s.cost + x.team.cost }), { minutes: 0, overtime: 0, absences: 0, forgotten: 0, cost: 0 });
  check(year.minutes === sumM.minutes && year.overtime === sumM.overtime && year.absences === sumM.absences && year.forgotten === sumM.forgotten && Math.abs(year.cost - sumM.cost) < 0.01,
    `Σ des mois (janv. → oct.) = l'année : heures ${sumM.minutes}/${year.minutes}, sup ${sumM.overtime}/${year.overtime}, abs ${sumM.absences}/${year.absences}, oublis ${sumM.forgotten}/${year.forgotten}, coût ${sumM.cost.toFixed(2)}/${year.cost.toFixed(2)}`);
  const yRows = byUid(await statRows(p));
  const perUserOk = Object.keys(yRows).every((uid) => months.reduce((s, x) => s + (byUid(x.rows)[uid]?.minutes || 0), 0) === yRows[uid].minutes
    && months.reduce((s, x) => s + (byUid(x.rows)[uid]?.overtime || 0), 0) === yRows[uid].overtime);
  check(perUserOk, 'salarié par salarié : Σ des mois = l’année (heures et sup)');
  await shot(p, 'stats-annee-1440');
  // Depuis une année qui contient aujourd'hui → la semaine d'aujourd'hui.
  await p.click('[data-testid=stats-kind-week]');
  await waitLoaded(p, '2026-10-19|2026-10-25');
  check(await label(p) === 'S-43 · 19–25 oct.', `Semaine : « ${await label(p)} »`);
  const wk = byUid(await statRows(p));
  for (const uid of Object.keys(wk)) {
    const c = csvWeek[uid] || { minutes: 0, overtime: 0 };
    check(wk[uid].minutes === c.minutes && wk[uid].overtime === c.overtime, `semaine — ${NAME[uid]} : ${wk[uid].minutes} min / sup ${wk[uid].overtime} = CSV « Cette semaine » ${c.minutes} / ${c.overtime}`);
  }
  check(wk['u-sam'].forgotten === 1 && wk['u-chloe'].absences === 0, 'semaine : l’oubli de Sam (lundi 19) ; congé de Chloé à venir, hors total');
  await p.click('[data-testid=stats-prev]');
  await waitLoaded(p, '2026-10-12|2026-10-18');
  check(await label(p) === 'S-42 · 12–18 oct.', '‹ : S-42 · 12–18 oct.');
  await p.click('[data-testid=stats-next]');
  await waitLoaded(p, '2026-10-19|2026-10-25');
  await p.setViewportSize({ width: 1280, height: 800 }); await p.waitForTimeout(300);
  await shot(p, 'stats-semaine-1280');
  await p.setViewportSize({ width: 1440, height: 900 });

  section('S12 lecture seule ; S13 jamais les tâches ni les réunions');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  const ws = writes.slice(w0).filter((x) => x.cid === cid);
  const bad = ws.filter((x) => !(x.m === 'RPC' && x.t === 'my_worksite_labour'));
  check(bad.length === 0, `pendant la fenêtre : aucune écriture (${ws.length} appel(s) rpc/my_worksite_labour seulement)${bad.length ? ` — ${JSON.stringify(bad.map((x) => `${x.m} ${x.t}`))}` : ''}`);
  const gs = gets.slice(g0).filter((x) => x.cid === cid);
  check(!gs.some((x) => ['meetings', 'meeting_participants', 'day_tasks', 'task_templates'].includes(x.t)), 'aucune lecture des tâches et réunions (lot 4)');
  const te = gs.filter((x) => x.t === 'time_entries' && x.p.get('select') === 'id,user_id,work_date,start_time,end_time,total_minutes,status,gap_before');
  check(te.length > 0 && te.every((x) => x.p.get('status') === 'in.(submitted,validated)' && x.p.get('company_id') === `eq.${CO}` && /work_date\.asc,id\.asc|work_date,id/.test(x.p.get('order') || '') && x.p.get('limit')),
    'heures : statuts comptés seulement, entreprise filtrée, ordre unique (work_date, id), lecture paginée');
  const lab = gs.filter((x) => x.t === 'rpc:my_worksite_labour');
  check(lab.length > 0 && lab.every((x) => /user_id/.test(x.p.get('order') || '') && /worksite_id/.test(x.p.get('order') || '') && x.p.get('limit')), 'coût : my_worksite_labour paginée, ordre (user_id, worksite_id)');
  await ctx.close();
}

// ═══ S4 — coût = Coût chantiers ═══════════════════════════════════════════════
section('S4 coût et heures = « Coût chantiers » (même mois)');
{
  freshDb();
  const { ctx, p } = await newCtx({ width: 1440, height: 900 });
  await openAdmin(p);
  await p.click('[data-testid=bar-cost]');
  const cr = p.locator('[role=dialog]').filter({ has: p.locator('h2', { hasText: 'Coût par chantier' }) });
  await cr.locator('[data-testid=cr-hours]').waitFor({ timeout: 15000 }); await p.waitForTimeout(500);
  const crHours = await txt(cr.locator('[data-testid=cr-hours] .bt-cr-sumv'));
  const crLabour = (await txt(cr.locator('.bt-cr-sumcard').nth(1).locator('.bt-cr-sumv'))).replace(/[  ]/g, ' ');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await openStats(p);
  const team = await teamRow(p);
  const eur = `${Math.round(team.cost).toLocaleString('fr-FR')} €`.replace(/[  ]/g, ' ');
  check(crLabour === eur && eur === '3 717 €', `Main d’œuvre de Coût chantiers « ${crLabour} » = Σ coût des statistiques « ${eur} »`);
  const h = Math.floor(team.minutes / 60), mn = team.minutes % 60;
  check(crHours === (mn ? `${h} h ${String(mn).padStart(2, '0')}` : `${h} h`), `Heures de Coût chantiers « ${crHours} » = Σ heures des statistiques (${team.minutes} min)`);
  await ctx.close();
}
{
  RATES = 'none'; freshDb();
  const { ctx, p } = await newCtx({ width: 1440, height: 900 });
  await openAdmin(p);
  await openStats(p);
  check(await p.locator('[data-testid=stats-metric-cost]').count() === 0, 'aucun taux horaire : pas de pastille « Coût »');
  check(!(await txt(p.locator('.bt-st-head'))).includes('Coût'), 'aucun taux horaire : pas de colonne « Coût »');
  check(await p.locator('[data-testid=stats-no-rate]').isVisible(), `aucun taux horaire : « ${await txt(p.locator('[data-testid=stats-no-rate]'))} »`);
  await shot(p, 'stats-sans-taux-1440');
  await ctx.close();
  RATES = 'ok';
}

// ═══ S5 — oublis = cockpit ═════════════════════════════════════════════════════
section('S5 oublis = cockpit « à relancer » ; mois clôturé : gardé par les statistiques');
{
  freshDb();
  const { ctx, p } = await newCtx({ width: 1440, height: 900 });
  await openAdmin(p);
  const badges = async () => Object.fromEntries((await p.$$eval('.bt-pl-gridwrap tbody:not(.bt-pl-ghostbody) tr', (trs) => trs.map((tr) => [
    (tr.querySelector('.bt-pl-name')?.textContent || '').trim(), Number(tr.querySelector('[data-testid=row-waiting]')?.getAttribute('data-days') || 0)])))
    .filter(([n]) => n));
  const waitingN = async () => Number(((await txt(p.locator('[data-testid=stat-waiting]'))).match(/^(\d+)/) || [])[1]);
  const b1 = await badges();
  await openStats(p);
  const oct = byUid(await statRows(p));
  await p.click('[data-testid=stats-prev]'); await waitLoaded(p, '2026-09-01|2026-09-30');
  const sep = byUid(await statRows(p));
  const sum = (uid) => (oct[uid]?.forgotten || 0) + (sep[uid]?.forgotten || 0);
  const names = { 'u-alex': 'Alex Exemple', 'u-chloe': 'Chloé Démo', 'u-dina': 'Dina Essai', 'u-sam': 'Sam Test', 'u-yann': 'Yann Essai', 'u-zoe': 'Zoé Exemple' };
  for (const [uid, n] of Object.entries(names)) check(sum(uid) === (b1[n] || 0), `${n} : oublis sept. + oct. ${sum(uid)} = pastille du planning ${b1[n] || 0}`);
  const total = Object.keys(names).reduce((s, uid) => s + sum(uid), 0);
  check(total === await waitingN() && total === 5, `bandeau « ${await txt(p.locator('[data-testid=stat-waiting]'))} » = Σ des oublis (sept. + oct.) = ${total}`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await ctx.close();
  // Septembre clôturé : le cockpit ne réclame plus le 18/09 de Zoé ; les statistiques le gardent.
  D.month_closures.push({ company_id: CO, month: '2026-09-01', closed_at: '2026-10-02T08:00:00Z', closed_by: 'u-admin' });
  const c2 = await newCtx({ width: 1440, height: 900 });
  await openAdmin(c2.p);
  const n2 = Number(((await txt(c2.p.locator('[data-testid=stat-waiting]'))).match(/^(\d+)/) || [])[1]);
  await openStats(c2.p);
  await c2.p.click('[data-testid=stats-prev]'); await waitLoaded(c2.p, '2026-09-01|2026-09-30');
  const sep2 = byUid(await statRows(c2.p));
  await c2.p.click('[data-testid=stats-metric-forgotten]'); await c2.p.waitForTimeout(150);
  const tip = await c2.p.locator('[data-testid=stats-def]').getAttribute('aria-label');
  check(n2 === 4 && sep2['u-zoe'].forgotten === 1, `septembre clôturé : cockpit ${n2} j (le 18/09 n'est plus réclamé), statistiques de septembre : Zoé 1 oubli (mois clôturés compris)`);
  await c2.p.hover('[data-testid=stats-def]'); await c2.p.waitForTimeout(400);
  const tipText = await txt(c2.p.locator('[data-radix-popper-content-wrapper]').last());
  check(/mois clôturés compris/.test(tipText) && /renvoyées par le bureau/.test(tipText) && /hors ligne/.test(tipText), `ⓘ « ${tip} » : « ${tipText.slice(0, 160)}… »`);
  await c2.ctx.close();
}

// ═══ S9 / S10 — tables facultatives, pannes ═══════════════════════════════════
section('S9 sans la migration du lot 5 (hours_reminders 404) : relances cachées, tout le reste juste');
{
  MIG = 'non'; freshDb();
  const { ctx, p } = await newCtx({ width: 1440, height: 900 });
  await openAdmin(p);
  await openStats(p);
  const rows = byUid(await statRows(p));
  check(Object.entries(EXPECT_OCT).every(([uid, e]) => rows[uid]?.minutes === e.minutes && rows[uid]?.overtime === e.overtime && rows[uid]?.forgotten === e.forgotten && rows[uid]?.absences === e.absences),
    'sans migration : heures, sup, absences, oublis identiques');
  await p.locator('[data-testid=stats-row][data-uid="u-sam"]').click(); await p.waitForTimeout(250);
  check(await p.locator('[data-testid=stats-reminders]').count() === 0 && await p.locator('[data-testid=stats-returns]').count() === 1, 'détail : « Relances reçues » caché, « Renvoyées » toujours là');
  check(await p.locator('[data-testid=stats-error]').count() === 0 && await p.locator('[data-testid=stats-cost]').count() === 1, 'aucune erreur ; coût toujours là');
  await shot(p, 'stats-sans-migration-1440');
  await ctx.close();
}
{
  EDITS_TABLE = 'absent'; freshDb();
  const { ctx, p } = await newCtx({ width: 1440, height: 900 });
  await openAdmin(p);
  await openStats(p);
  await p.locator('[data-testid=stats-row][data-uid="u-yann"]').click(); await p.waitForTimeout(250);
  check(await p.locator('[data-testid=stats-returns]').count() === 0 && await p.locator('[data-testid=stats-reminders]').count() === 0 && byUid(await statRows(p))['u-yann'].minutes === 1380,
    'time_entry_edits aussi absente : « Renvoyées » caché, le reste intact');
  await ctx.close();
  EDITS_TABLE = 'ok'; MIG = 'oui';
}
{
  LABOUR = 'ko'; freshDb();
  const { ctx, p } = await newCtx({ width: 1440, height: 900 });
  await openAdmin(p);
  await openStats(p);
  check(await p.locator('[data-testid=stats-cost-off]').isVisible() && await p.locator('[data-testid=stats-metric-cost]').count() === 0, `coût en panne : « ${await txt(p.locator('[data-testid=stats-cost-off]'))} », pastille Coût cachée`);
  check(byUid(await statRows(p))['u-alex'].minutes === 7260, '… les heures restent justes');
  await ctx.close();
  LABOUR = 'ok';
}
section('S10 heures illisibles (500) : « Chiffres illisibles », aucun chiffre');
{
  freshDb();
  const { ctx, p } = await newCtx({ width: 1440, height: 900 });
  await openAdmin(p);
  ENTRIES_500 = true;
  await p.click('[data-testid=stat-stats]');
  await p.waitForSelector('[data-testid=team-stats][data-loaded="ko"]', { timeout: 20000 });
  const t = await txt(p.locator('[data-testid=stats-error]'));
  check(/Chiffres illisibles pour le moment/.test(t) && await p.locator('[data-testid=stats-row], [data-testid=stats-team]').count() === 0, `« ${t} » — aucune ligne, aucun total`);
  await shot(p, 'stats-erreur-1440');
  ENTRIES_500 = false;
  await p.getByRole('button', { name: 'Réessayer' }).click();
  await waitLoaded(p, '2026-10-01|2026-10-31');
  check(byUid(await statRows(p))['u-alex'].minutes === 7260, '« Réessayer » : les chiffres reviennent');
  await ctx.close();
}

// ═══ S11 — pagination (année + 1200 lignes) ═══════════════════════════════════
section('S11 pagination : 1200 lignes de plus en mars → année exacte, pages 0 / 500 / 1000 lues');
{
  freshDb({ march: true });
  const { ctx, p, cid } = await newCtx({ width: 1440, height: 900 });
  await openAdmin(p);
  await openStats(p);
  const g0 = gets.length;
  await p.click('[data-testid=stats-kind-year]');
  await waitLoaded(p, '2026-01-01|2026-12-31');
  const team = await teamRow(p);
  const sumMarch = EXTRA_MARCH.reduce((s, e) => s + e.total_minutes, 0);
  const counted = D.time_entries.filter((e) => e.company_id === CO && ['submitted', 'validated'].includes(e.status) && e.work_date >= '2026-01-01' && e.work_date <= '2026-12-31')
    .reduce((s, e) => s + e.total_minutes, 0) + 60; // + la route payée d'Alex le 06/10
  check(team.minutes === counted && sumMarch === 36000, `année : ${team.minutes} min = toutes les heures envoyées de 2026 (dont 1200 lignes de mars = ${sumMarch} min)`);
  const marchGets = gets.slice(g0).filter((x) => x.cid === cid && x.t === 'time_entries' && x.p.get('work_date') && x.p.getAll('work_date').includes('gte.2026-03-01'));
  const offs = marchGets.map((x) => Number(x.p.get('offset') || 0)).sort((a, z) => a - z);
  check(JSON.stringify(offs) === JSON.stringify([0, 500, 1000, 1200]), `tranche de mars lue par pages : offsets ${offs.join(', ')} (la dernière, vide, arrête la lecture)`);
  const yr = byUid(await statRows(p));
  // Mars seul, pour comparer (l'année contient aujourd'hui → octobre, puis 7 pas en arrière).
  await p.click('[data-testid=stats-kind-month]'); await waitLoaded(p, '2026-10-01|2026-10-31');
  for (let i = 0; i < 7; i++) await p.click('[data-testid=stats-prev]');
  await waitLoaded(p, '2026-03-01|2026-03-31');
  const mar = byUid(await statRows(p));
  check(Object.keys(mar).every((uid) => mar[uid].minutes <= yr[uid].minutes) && mar['u-alex'].minutes === EXTRA_MARCH.filter((e) => e.user_id === 'u-alex').reduce((s, e) => s + e.total_minutes, 0),
    `mars : Alex ${mar['u-alex'].minutes} min = ses lignes de mars (aucune perdue au-delà de 1000)`);
  await ctx.close();
}

// ═══ S14 — « Relancer » écrit au journal ═══════════════════════════════════════
section('S14 « Relancer » : noté au journal ; sans migration, 404 avalé');
for (const mig of ['oui', 'non']) {
  MIG = mig; freshDb();
  const { ctx, p, cid } = await newCtx({ width: 1440, height: 900 });
  await openAdmin(p);
  await p.click('[data-testid=stat-waiting]');
  const row = p.locator('[data-testid=relance-row]').filter({ hasText: 'Alex Exemple' });
  const w0 = writes.length;
  const t0 = await p.evaluate(() => window.__toasts.length);
  await row.locator('[data-testid=relance-btn]').click();
  await row.locator('[data-testid=relance-done]').waitFor({ timeout: 8000 });
  await p.waitForTimeout(600);
  const ws = writes.slice(w0).filter((x) => x.cid === cid);
  const log = ws.filter((x) => x.m === 'RPC' && x.t === 'log_hours_reminder');
  const toasts = (await p.evaluate((k) => window.__toasts.slice(k), t0)).join(' | ');
  check(ws.some((x) => x.m === 'FN' && x.t === 'send-push') && log.length === 1 && log[0].body.p_user_id === 'u-alex'
    && JSON.stringify(log[0].body.p_days) === JSON.stringify([O(14)]) && log[0].body.p_channel === 'push',
    `MIG=${mig} : send-push puis UN POST rpc/log_hours_reminder {Alex, [14/10], push} (${JSON.stringify(log.map((x) => x.body))})`);
  check(/Rappel envoyé à Alex/.test(toasts) && !/Impossible|erreur/i.test(toasts), `MIG=${mig} : « ${toasts} » — aucune erreur affichée`);
  if (mig === 'oui') {
    await p.locator('.bt-pl-ddbackdrop').first().click(); await p.waitForTimeout(300);
    await openStats(p);
    await p.locator('[data-testid=stats-row][data-uid="u-alex"]').click(); await p.waitForTimeout(250);
    check(await txt(p.locator('[data-testid=stats-reminders]')) === '1', 'rouvrir les statistiques : Alex « Relances reçues 1 » (la fenêtre relit à chaque ouverture)');
  }
  await ctx.close();
}
MIG = 'oui';

// ═══ S15 — mises en page ═══════════════════════════════════════════════════════
section('S15 aucun défilement horizontal : 768 / 1024 / 1280 / 1440 (390 : voir S1)');
for (const [w, h] of [[768, 1024], [1024, 768], [1280, 800], [1440, 900]]) {
  freshDb();
  const { ctx, p } = await newCtx({ width: w, height: h });
  await openAdmin(p);
  if (w < 1024) {
    await p.locator('.bt-pl-m-ibtn[aria-label=Menu]').click(); await p.waitForTimeout(500); await p.click('[data-testid=mm-stats]');
    await waitLoaded(p, '2026-10-01|2026-10-31'); await p.locator('.bt-mm-sheet').waitFor({ state: 'detached', timeout: 5000 });
  }
  else await openStats(p);
  await p.locator('[data-testid=stats-row][data-uid="u-chloe"]').click(); await p.waitForTimeout(250);
  const hs = await hScroll(p);
  check(hs.length === 0, `${w}×${h} : fenêtre + détail ouvert, aucun défilement horizontal ${JSON.stringify(hs)}`);
  const sec = await p.locator('.bt-st-head .bt-st-sec:visible').count();
  check(w >= 1024 ? sec === 4 : sec === 0, `${w}×${h} : colonnes secondaires ${sec ? 'affichées' : 'cachées'} (${sec})`);
  if (w === 1024) await shot(p, 'stats-1024x768');
  await ctx.close();
}

check(errors.length === 0, `aucune erreur JavaScript sur les pages${errors.length ? ` (${errors.slice(0, 3).join(' | ')})` : ''}`);
console.log(`\n${ok} ✅ / ${ko} ❌`);
if (fails.length) console.log(`Échecs :\n - ${fails.join('\n - ')}`);
await b.close(); srv.close();
process.exit(ko || errors.length ? 1 : 0);
