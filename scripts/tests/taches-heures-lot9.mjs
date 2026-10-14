// Lot 9 — tâches avec heure de début et de fin, sur les VRAIES pages : planning du
// bureau (/admin), « Ma journée » et « Ma semaine » du salarié (/poseur), feuille
// imprimée. UNE base simulée partagée (aucune vraie base, aucun e-mail). Horloge
// figée au mercredi 21 octobre 2026, 10:00 à Paris (semaine 43).
//
// Lancer : npm run build, puis
//   node scripts/tests/taches-heures-lot9.mjs out docs/captures-taches-heures [port]
// (playwright-core doit être résoluble.)
//
// Même base simulée que missions-lot4.mjs (réseau, RLS et droits par colonne
// rejoués), avec trois états (variable MIG) :
//   'non'   lot 4 pas appliqué : tables absentes (PGRST205) ;
//   'lot4'  lot 4 appliqué, PAS le lot 9 — l'état de la production aujourd'hui :
//           lire start_time → 42703, écrire start_time → PGRST204 ;
//   'oui'   lot 9 appliqué (supabase/tests/lot9_taches_avec_heures.mjs le prouve
//           sur un vrai Postgres).
//
//   A1  colonnes absentes : pas de « de … à … », insertion du lot 4 mot pour mot,
//       une seule relecture sans les heures, « Ma journée » (« Fait » marche),
//       semaine (sans lire les tâches) et feuille d'avant
//   A2  lot 4 pas appliqué : rien de plus qu'avant (aucune pastille « Tâche »)
//   B1  bureau : « Heure de … à … », moment déduit (pastilles grisées), colonnes envoyées
//   B2  alerte NON bloquante hors créneau : « Non » n'écrit rien, « Ajouter quand même » écrit ;
//       focus clavier ; changer « Garder… » retire l'alerte
//   B3  deux créneaux (libellé au pluriel), sans planning : pas d'alerte ; saisies refusées
//   B4  tri : avec heure d'abord, par heure, puis sans heure ; compteur de la case
//   B5  jamais des heures : cockpit identique, aucune écriture planning / heures
//   S1  « Ma journée » : « 08:00–08:30 », teinté comme son moment, trié ; « Fait » garde l'heure
//   S2  « Ma semaine » : la ligne « 10:00–11:30 · Texte », triée, au bon jour
//   S3  « Ma semaine » : tâches illisibles (500) → les réunions restent
//   P1  impression semaine, jour + salarié (feuille de mission) : heures imprimées, triées
//   M1  390 px : la fenêtre « + » et « Ma journée » sans débordement
import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, OUT = 'out', SH = 'docs/captures-taches-heures', PORT = '45100'] = process.argv;
fs.mkdirSync(SH, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'taches-heures-lot9-'));
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
const D_ = (d) => `2026-10-${String(d).padStart(2, '0')}`;
const MON = 0, TUE = 1, WED = 2, THU = 3, FRI = 4;

// ─── Base simulée ─────────────────────────────────────────────────────────────
const CO = 'c0000000-0000-0000-0000-0000000000aa', CO2 = 'c0000000-0000-0000-0000-0000000000bb';
const ADMIN = 'u-admin', SAM = 'u-sam', ALEX = 'u-alex', CHLOE = 'u-chloe', DINA = 'u-dina';
const TEAM = [ALEX, CHLOE, DINA, SAM]; // salariés et chef d'équipe actifs (ordre de la grille)
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Exemple', city: 'Lyon', product_type: 'Fenêtres', is_active: true };
const W2 = { id: 'w2', company_id: CO, client_name: 'Résidence Test', city: 'Bron', product_type: null, is_active: true };
const W5 = { id: 'w5', company_id: CO, client_name: 'Autre', city: null, product_type: null, is_active: true };
const WS = { w1: W1, w2: W2, w5: W5 };
const u = (id, first_name, last_name, role = 'worker', extra = {}) => ({ id, company_id: CO, first_name, last_name, role, email: `${id}@exemple.fr`, is_active: true, created_at: '2026-01-01', ...extra });
const USERS = [u(ADMIN, 'Admin', 'Test', 'admin'), u(ALEX, 'Alex', 'Exemple'), u(CHLOE, 'Chloé', 'Démo', 'lead'), u(DINA, 'Dina', 'Essai'), u(SAM, 'Sam', 'Test'),
  u('u-ancien', 'Ancien', 'Test', 'worker', { is_active: false }), u('u-autre', 'Autre', 'Salarié', 'worker', { company_id: CO2 })];
const COMPANY = { id: CO, name: 'Entreprise Test', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, travel_paid: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, accountant_email: null };
let seq = 0;
const slot = (id, user_id, date, w, start, end, extra = {}) => ({ id, company_id: CO, user_id, worksite_id: w?.id ?? null, work_date: date, absence_type: null, estimated_start: start, estimated_end: end,
  notes: null, position: null, added_by_worker: false, created_by: ADMIN, created_at: new Date(Date.UTC(2026, 9, 1, 6, 0, seq++)).toISOString(), ...extra });
// Mercredi 21 : Sam 08:00–12:00 ; Alex 08:00–12:00 puis 13:30–17:00 ; Chloé sans
// planning ce jour-là ; Dina en congé.
const PLANNING = [
  slot('p-s3', SAM, D_(21), W1, '08:00:00', '12:00:00'),
  slot('p-a3m', ALEX, D_(21), W1, '08:00:00', '12:00:00'), slot('p-a3a', ALEX, D_(21), W2, '13:30:00', '17:00:00'),
  slot('p-c2', CHLOE, D_(20), W1, '08:00:00', '17:00:00'),
  slot('p-d3', DINA, D_(21), null, null, null, { absence_type: 'conge' }),
  slot('p-s1', SAM, D_(19), W2, '08:00:00', '12:00:00'),
];
const entry = (id, user_id, date, w, status, start, end, minutes, extra = {}) => ({ id, company_id: CO, user_id, work_date: date, worksite_id: w?.id ?? null, planning_id: null, status, start_time: start, end_time: end,
  total_minutes: minutes, break_minutes: 0, meal_allowance: false, reception: null, reserve_resolved_at: null, reserve_fixed_at: null, observation: null, locked: false, exported_at: null, gap_before: null, source: null,
  exit_forgotten: false, modified_at: null, modified_by: null, created_at: `${date}T12:00:00Z`, submitted_at: status === 'draft' ? null : `${date}T18:00:00Z`, ...extra });
const ENTRIES = [
  entry('e-s1', SAM, D_(19), W2, 'validated', '08:00:00', '12:00:00', 240, { planning_id: 'p-s1' }),
  entry('e-a1', ALEX, D_(19), W1, 'submitted', '08:00:00', '12:30:00', 270, { planning_id: 'p-a1' }),
];
// 'non' : lot 4 pas appliqué (tables absentes) ; 'lot4' : lot 4 appliqué, PAS le
// lot 9 (start_time / end_time absentes : 42703 en lecture, PGRST204 en écriture)
// — l'état de la production aujourd'hui ; 'oui' : lot 9 appliqué.
let MIG = 'oui';
// S3 : la lecture des tâches tombe en panne (500), celle des réunions marche.
let TASKS_FAIL = false;
let pushSent = 2;
const D = {};
const freshDb = () => {
  for (const k of Object.keys(D)) delete D[k];
  Object.assign(D, {
    users: USERS.map((x) => ({ ...x })), companies: [{ ...COMPANY }], worksites: Object.values(WS).map((x) => ({ ...x })),
    planning: PLANNING.map((x) => ({ ...x })), time_entries: ENTRIES.map((x) => ({ ...x })), active_sessions: [],
    day_tasks: [], task_templates: [{ id: 'tpl-1', company_id: CO, text: 'Vérifier le camion', created_by: ADMIN, created_at: '2026-10-01T08:00:00Z' }],
    meetings: [], meeting_participants: [],
    user_payroll: [], documents: [], invitations: [], month_closures: [], user_closures: [], leave_requests: [], push_subscriptions: [], kiosks: [],
  });
};
freshDb();
const NEW_TABLES = new Set(['day_tasks', 'task_templates', 'meetings', 'meeting_participants']);
const NEW_FNS = new Set(['set_day_task_done', 'office_save_meeting', 'office_delete_meeting']);
const userOf = (id) => D.users.find((x) => x.id === id);
const isAdmin = (uid) => userOf(uid)?.role === 'admin' && userOf(uid)?.is_active !== false;
const teamMember = (id) => { const x = userOf(id); return !!x && x.company_id === CO && x.is_active !== false && ['worker', 'lead'].includes(x.role); };

// ─── Les règles du SQL, rejouées (supabase/tests/lot4_missions_reunions.mjs) ──
class Refus extends Error { constructor(message, code = 'P0001', status = 400) { super(message); this.code = code; this.status = status; } }
let idSeq = 0; const newId = (p) => `${p}-${++idSeq}`;
const stamp = () => new Date(NOW.getTime() + (++idSeq) * 1000).toISOString();
const hhmmss = (t) => (t ? (String(t).length === 5 ? `${t}:00` : String(t)) : null);
/** RLS + droits par colonne de day_tasks / task_templates / meetings / meeting_participants. */
const visible = (t, uid, rows) => {
  if (t === 'day_tasks') return rows.filter((x) => x.company_id === CO && (isAdmin(uid) || x.user_id === uid));
  if (t === 'task_templates') return rows.filter((x) => x.company_id === CO && isAdmin(uid));
  if (t === 'meeting_participants') return rows.filter((x) => x.company_id === CO && (isAdmin(uid) || x.user_id === uid));
  if (t === 'meetings') return rows.filter((x) => x.company_id === CO && (isAdmin(uid) || x.all_team || D.meeting_participants.some((p) => p.meeting_id === x.id && p.user_id === uid)));
  return rows;
};
/** Droits par colonne (lot 4 + lot 9), RLS et contrainte day_tasks_times_check, rejoués. */
function insertTask(uid, body) {
  const keys = Object.keys(body);
  if (MIG !== 'oui' && keys.some((k) => k === 'start_time' || k === 'end_time')) throw new Refus("Could not find the 'start_time' column of 'day_tasks' in the schema cache", 'PGRST204', 400);
  const allowed = ['company_id', 'user_id', 'work_date', 'text', 'part', 'start_time', 'end_time'];
  if (keys.some((k) => !allowed.includes(k))) throw new Refus(`permission denied for table day_tasks (${keys.filter((k) => !allowed.includes(k)).join(', ')})`, '42501', 403);
  const s = hhmmss(body.start_time), e = hhmmss(body.end_time);
  if ((s == null) !== (e == null) || (s && e <= s)) throw new Refus('new row for relation "day_tasks" violates check constraint "day_tasks_times_check"', '23514');
  if (!isAdmin(uid) || body.company_id !== CO || !teamMember(body.user_id)) throw new Refus('new row violates row-level security policy for table "day_tasks"', '42501', 403);
  const text = String(body.text || '').trim();
  if (!text || text.length > 200 || (body.part != null && !['matin', 'apres-midi', 'soir'].includes(body.part))) throw new Refus('violates check constraint', '23514');
  const row = { id: newId('t'), company_id: CO, user_id: body.user_id, work_date: body.work_date, text: body.text, part: body.part ?? null, created_by: uid, created_at: stamp(), done_at: null, done_by: null,
    ...(MIG === 'oui' ? { start_time: s, end_time: e } : {}) };
  D.day_tasks.push(row);
  return row;
}
function insertTemplate(uid, body) {
  const keys = Object.keys(body);
  if (keys.some((k) => !['company_id', 'text'].includes(k))) throw new Refus('permission denied for table task_templates', '42501', 403);
  if (!isAdmin(uid) || body.company_id !== CO) throw new Refus('new row violates row-level security policy', '42501', 403);
  const norm = (s) => String(s).trim().toLowerCase();
  if (D.task_templates.some((x) => x.company_id === CO && norm(x.text) === norm(body.text))) throw new Refus('duplicate key value violates unique constraint "task_templates_company_text_key"', '23505', 409);
  const row = { id: newId('tpl'), company_id: CO, text: body.text, created_by: uid, created_at: stamp() };
  D.task_templates.push(row);
  return row;
}
function setDone(uid, { p_task_id, p_done }) {
  const t = D.day_tasks.find((x) => x.id === p_task_id && x.user_id === uid && x.company_id === CO);
  if (!t) throw new Refus('Cette tâche n\'existe plus, ou elle n\'est pas à vous.', 'P0002');
  t.done_at = p_done ? (t.done_at || NOW.toISOString()) : null;
  t.done_by = p_done ? (t.done_by || uid) : null;
  return t;
}
function saveMeetingFn(uid, a) {
  if (!isAdmin(uid)) throw new Refus('Réservé au bureau.', '42501');
  const title = String(a.p_title || '').trim();
  if (!title || title.length > 120) throw new Refus('Donnez un titre (120 caractères au plus).', '22023');
  if (!a.p_date || !a.p_start) throw new Refus('Indiquez la date et l\'heure.', '22023');
  if (a.p_end && hhmmss(a.p_end) <= hhmmss(a.p_start)) throw new Refus('La fin doit être après le début.', '22023');
  const place = String(a.p_place || '').trim() || null;
  const all = !!a.p_all_team;
  const ids = all ? [] : Array.from(new Set((a.p_user_ids || []).filter(Boolean)));
  if (!all && !ids.length) throw new Refus('Choisissez au moins un participant.', '22023');
  if (ids.some((id) => !teamMember(id))) throw new Refus('Participant introuvable ou archivé.', '22023');
  let m;
  if (a.p_id == null) {
    m = { id: newId('m'), company_id: CO, title, meeting_date: a.p_date, start_time: hhmmss(a.p_start), end_time: hhmmss(a.p_end), place, all_team: all, created_by: uid, created_at: stamp(), updated_at: stamp() };
    D.meetings.push(m);
  } else {
    m = D.meetings.find((x) => x.id === a.p_id && x.company_id === CO);
    if (!m) throw new Refus('Cette réunion n\'existe pas, ou vous n\'y avez pas accès.', 'P0002');
    Object.assign(m, { title, meeting_date: a.p_date, start_time: hhmmss(a.p_start), end_time: hhmmss(a.p_end), place, all_team: all, updated_at: stamp() });
    D.meeting_participants = D.meeting_participants.filter((p) => p.meeting_id !== m.id);
  }
  for (const id of ids) D.meeting_participants.push({ meeting_id: m.id, company_id: CO, user_id: id });
  return m;
}
function deleteMeetingFn(uid, { p_id }) {
  if (!isAdmin(uid)) throw new Refus('Réservé au bureau.', '42501');
  const m = D.meetings.find((x) => x.id === p_id && x.company_id === CO);
  if (!m) throw new Refus('Cette réunion n\'existe pas, ou vous n\'y avez pas accès.', 'P0002');
  D.meetings = D.meetings.filter((x) => x !== m);
  D.meeting_participants = D.meeting_participants.filter((p) => p.meeting_id !== p_id);
  return true;
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
const sessionFor = (uid) => {
  const now = Math.floor(NOW.getTime() / 1000) + 3600; const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', exp: now + 864000, aal: 'aal1' })}.sig`;
  return { access_token: jwt, refresh_token: 'r', expires_at: now + 864000, expires_in: 864000, token_type: 'bearer', user: { id: uid, email: `${uid}@exemple.fr`, aud: 'authenticated', role: 'authenticated' } };
};
const MISSING_TABLE = (t) => ({ status: 404, json: { code: 'PGRST205', message: `Could not find the table 'public.${t}' in the schema cache`, details: null, hint: null } });
const MISSING_FN = (fn) => ({ status: 404, json: { code: 'PGRST202', message: `Could not find the function public.${fn} in the schema cache`, details: null, hint: null } });
const errors = [];
const newCtx = async (uid, viewport) => {
  const ctx = await b.newContext({ viewport, locale: 'fr-FR', timezoneId: 'Europe/Paris', ...(viewport.width < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const session = sessionFor(uid);
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
    // Jamais d'e-mail : toute tentative d'ouvrir « mailto: » est comptée.
    window.__mailto = 0;
    const isMail = (u) => /^mailto:/i.test(String(u || ''));
    const open0 = window.open; window.open = function (u, ...r) { if (isMail(u)) { window.__mailto++; return null; } return open0.call(this, u, ...r); };
    document.addEventListener('click', (e) => { const a = e.target?.closest?.('a[href]'); if (a && isMail(a.getAttribute('href'))) { window.__mailto++; e.preventDefault(); } }, true);
    try { window.navigation?.addEventListener('navigate', (e) => { if (isMail(e.destination?.url)) { window.__mailto++; e.preventDefault?.(); } }); } catch { /* navigateur sans Navigation API */ }
    window.print = () => { window.__printed = (window.__printed || 0) + 1; window.__title = document.title; };
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
      writes.push({ m: 'FN', t: fn, body, by: uid });
      if (fn === 'send-push') return r.fulfill({ json: { mode: 'admin', sent: pushSent, failed: 0, purged: 0 } });
      return r.fulfill({ json: {} });
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.replace('/rest/v1/rpc/', '');
      // Une fonction lue par un GET (my_trainings, formations du lot 6) est une LECTURE, pas une écriture.
      if (m === 'GET' || m === 'HEAD') gets.push({ t: `rpc/${fn}`, p: new URLSearchParams(url.searchParams), by: uid });
      else writes.push({ m: 'RPC', t: fn, body, by: uid });
      if (NEW_FNS.has(fn)) {
        // Les fonctions du lot 4 existent dès 'lot4' (production) : seul 'non' les ignore.
        if (MIG === 'non') return r.fulfill(MISSING_FN(fn));
        try {
          if (fn === 'set_day_task_done') return r.fulfill({ json: setDone(uid, body) });
          if (fn === 'office_save_meeting') return r.fulfill({ json: saveMeetingFn(uid, body) });
          if (fn === 'office_delete_meeting') return r.fulfill({ json: deleteMeetingFn(uid, body) });
        } catch (e) {
          return r.fulfill({ status: e.status || 400, json: { code: e.code, message: e.message, details: null, hint: null } });
        }
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
    if (NEW_TABLES.has(t) && MIG === 'non') { if (m === 'GET' || m === 'HEAD') gets.push({ t, p: new URLSearchParams(url.searchParams), by: uid, missing: true }); else writes.push({ m, t, body, by: uid }); return r.fulfill(MISSING_TABLE(t)); }
    if (m === 'GET' || m === 'HEAD') {
      gets.push({ t, p: new URLSearchParams(url.searchParams), by: uid });
      const sel = url.searchParams.get('select') || '*';
      if (TASKS_FAIL && t === 'day_tasks') return r.fulfill({ status: 500, json: { code: 'XX000', message: 'erreur passagère', details: null, hint: null } });
      if (MIG === 'lot4' && t === 'day_tasks' && /\b(start_time|end_time)\b/.test(sel)) return r.fulfill({ status: 400, json: { code: '42703', message: 'column day_tasks.start_time does not exist', details: null, hint: null } });
      let rows = sortRows(filterRows(visible(t, uid, D[t] || []), url.searchParams), url.searchParams.get('order')).map((x) => {
        if (t !== 'planning' && t !== 'time_entries') return x;
        return { ...x, ...(sel.includes('worksite:worksites') ? { worksite: x.worksite_id ? WS[x.worksite_id] : null } : {}), ...(sel.includes('user:users') ? { user: userOf(x.user_id) || null } : {}) };
      });
      const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
      const total = rows.length;
      if (off || lim) rows = rows.slice(off, lim ? off + Number(lim) : undefined);
      return reply(rows, 200, total, off);
    }
    writes.push({ m, t, q: url.search, body, by: uid });
    try {
      if (t === 'day_tasks' && m === 'POST') return reply([insertTask(uid, Array.isArray(body) ? body[0] : body)], 201);
      if (t === 'task_templates' && m === 'POST') return reply([insertTemplate(uid, Array.isArray(body) ? body[0] : body)], 201);
      if (NEW_TABLES.has(t) && m === 'PATCH') throw new Refus(`permission denied for table ${t}`, '42501', 403);
      if (['meetings', 'meeting_participants'].includes(t)) throw new Refus(`permission denied for table ${t}`, '42501', 403);
      if ((t === 'day_tasks' || t === 'task_templates') && m === 'DELETE') {
        const hit = filterRows(visible(t, uid, D[t]), url.searchParams).filter(() => isAdmin(uid));
        D[t] = D[t].filter((x) => !hit.includes(x));
        return reply(hit);
      }
    } catch (e) {
      return r.fulfill({ status: e.status || 400, json: { code: e.code, message: e.message, details: null, hint: null } });
    }
    if (m === 'POST') { const list = (Array.isArray(body) ? body : [body]).map((x) => ({ id: newId('x'), ...x })); D[t] = [...(D[t] || []), ...list]; return reply(list, 201); }
    const hit = filterRows(D[t] || [], url.searchParams);
    if (m === 'PATCH') { for (const x of hit) Object.assign(x, body); return reply(hit); }
    if (m === 'DELETE') { D[t] = (D[t] || []).filter((x) => !hit.includes(x)); return reply(hit); }
    return reply([]);
  });
  return ctx;
};

// ─── Outils ───────────────────────────────────────────────────────────────────
let ok = 0, ko = 0; const fails = [];
const check = (c, m) => { if (c) { ok++; console.log('  ✅', m); } else { ko++; fails.push(m); console.log('  ❌', m); } };
const section = (t) => console.log(`\n═══ ${t}`);
const shot = async (loc, name, opts = {}) => {
  // Les petits messages (sonner) ne cachent pas la capture : masqués le temps de la prendre.
  const page = typeof loc.page === 'function' ? loc.page() : loc;
  const toaster = (v) => page.evaluate((v) => document.querySelectorAll('[data-sonner-toaster]').forEach((t) => { t.style.visibility = v; }), v).catch(() => {});
  await toaster('hidden'); await new Promise((r) => setTimeout(r, 200));
  await loc.screenshot({ path: path.join(SH, `${name}.png`), ...opts }).catch((e) => console.log('   (capture impossible :', e.message.split('\n')[0], ')'));
  await toaster('');
};
const since = (n) => writes.slice(n);
const of = (list, m, t) => list.filter((w) => w.m === m && (t == null || w.t === t));
const txt = async (loc) => (await loc.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
const toastsSince = async (p, k) => (await p.evaluate((k) => (window.__toasts || []).slice(k), k)).join(' | ');
const toastMark = (p) => p.evaluate(() => (window.__toasts || []).length);
const mailtos = (p) => p.evaluate(() => window.__mailto || 0);

const office = await newCtx(ADMIN, { width: 1280, height: 800 });
const worker = await newCtx(SAM, { width: 390, height: 844 });
const op = await office.newPage();
op.on('pageerror', (e) => { errors.push(`bureau : ${e.message}`); console.log('   [erreur page bureau]', e.message); });
const wp = await worker.newPage();
wp.on('pageerror', (e) => { errors.push(`salarié : ${e.message}`); console.log('   [erreur page salarié]', e.message); });

const openOffice = async (p = op) => {
  await p.goto(`http://localhost:${PORT}/admin`);
  await p.waitForSelector('.bt-pl-gridwrap .bt-pl-name', { timeout: 25000 });
  await p.waitForTimeout(1300);
};
const rowOf = (p, name) => p.locator('.bt-pl-gridwrap tbody:not(.bt-pl-ghostbody) tr').filter({ has: p.locator('.bt-pl-name', { hasText: name }) });
const cellOf = (p, name, day) => rowOf(p, name).locator('td.bt-pl-cell').nth(day);
const dlg = (p = op) => p.locator('[role=dialog]').last();
const closeDlg = async (p = op) => { await p.keyboard.press('Escape'); await p.waitForTimeout(350); };
const openWorker = async () => { await wp.goto(`http://localhost:${PORT}/poseur`); await wp.waitForSelector('.bt-total', { timeout: 20000 }); await wp.waitForTimeout(1100); };
const openWeek = async () => {
  await wp.getByRole('button', { name: 'Mon compte et menu' }).click();
  await wp.getByRole('menuitem', { name: 'Ma semaine' }).click(); await wp.waitForTimeout(1500);
};
const stats = async () => txt(op.locator('.bt-pl-stats').first());
const setTime = async (p, loc, v) => { await loc.fill(v); await loc.press('Tab'); await p.waitForTimeout(150); };
/** La fenêtre « + » d'une case (même pleine : un clic sur le fond de la case), onglet « Tâche ». */
const openTasks = async (name, day = WED, p = op) => {
  await cellOf(p, name, day).locator('.bt-pl-cellfill').dispatchEvent('click'); await p.waitForTimeout(500);
  const d = dlg(p);
  await d.locator('[data-testid=add-kind-tache]').click(); await p.waitForTimeout(500);
  return d;
};
/** Écrit une tâche (heures facultatives) et clique « Ajouter ». */
const typeTask = async (d, text, { start = null, end = null, part = null } = {}, p = op) => {
  await d.locator('[data-testid=task-text]').fill(text);
  if (part) await d.locator(`[data-testid=task-part-${part}]`).click();
  if (start !== null) await setTime(p, d.locator('[data-testid=task-start]'), start);
  if (end !== null) await setTime(p, d.locator('[data-testid=task-end]'), end);
  await d.locator('[data-testid=task-add]').click(); await p.waitForTimeout(900);
};
const rowsOf = async (d) => (await d.locator('[data-testid=task-row]').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').replace(/ Pas fait$/, '').trim());
const printed = (p) => p.evaluate(() => window.__printed || 0);
const printWith = async (p, { kind = 'week', who = 'all', tasks = null } = {}) => {
  const n = await printed(p);
  await p.click('[data-testid=bar-print]'); await p.waitForSelector('[data-testid=print-menu]');
  await p.click(`[data-testid=print-scope-${kind}]`);
  await p.selectOption('[data-testid=print-who]', who);
  if (tasks !== null && await p.locator('[data-testid=print-tasks]').count() && await p.isChecked('[data-testid=print-tasks]') !== tasks) await p.click('[data-testid=print-tasks]');
  await p.click('[data-testid=print-go]');
  await p.waitForFunction((n) => (window.__printed || 0) === n + 1, n, { timeout: 15000 });
  await p.waitForTimeout(200);
};
const closePrint = (p) => p.evaluate(() => window.dispatchEvent(new Event('afterprint')));
const paper = async (p, fn, { w = 1047, h = 718 } = {}) => {
  const vp = p.viewportSize();
  await p.setViewportSize({ width: w, height: h }); await p.emulateMedia({ media: 'print' }); await p.waitForTimeout(300);
  try { return await fn(); } finally { await p.emulateMedia({ media: null }); await p.setViewportSize(vp); await p.waitForTimeout(200); }
};
const BG = { matin: 'rgb(218, 237, 251)', 'apres-midi': 'rgb(253, 227, 202)', soir: 'rgb(223, 204, 238)' };
const noOverflow = (p, sel = null) => p.evaluate((sel) => {
  const el = sel ? document.querySelector(sel) : document.documentElement;
  return !!el && el.scrollWidth <= el.clientWidth + 1;
}, sel);
const timedGets = () => gets.filter((g) => g.t === 'day_tasks' && /start_time/.test(g.p.get('select') || ''));

// ═══ A1 · lot 9 PAS appliqué (production aujourd'hui) : exactement comme le lot 4 ══
section('A1 · colonnes absentes : fenêtre « Tâche », insertion, salarié et feuille du lot 4');
MIG = 'lot4'; freshDb();
await openOffice();
const statsBase = await stats();
{
  const d = await openTasks('Sam Test');
  check(await d.locator('[data-testid=task-text]').count() === 1, 'onglet « Tâche » présent (lot 4)');
  check(await d.locator('[data-testid=task-hours], [data-testid=task-start], [data-testid=task-end]').count() === 0, 'aucun champ « de … à … » (colonnes absentes)');
  check(timedGets().length === 1, `une seule lecture tentée avec les heures, refusée (42703) (${timedGets().length})`);
  check(gets.some((g) => g.t === 'day_tasks' && !/start_time/.test(g.p.get('select') || '')), '… puis relue sans les heures');
  const n = writes.length;
  await typeTask(d, 'Ranger le dépôt', { part: 'matin' });
  const post = of(since(n), 'POST', 'day_tasks');
  check(post.length === 1 && JSON.stringify(Object.keys(post[0].body).sort()) === JSON.stringify(['company_id', 'part', 'text', 'user_id', 'work_date']),
    `insertion du lot 4 mot pour mot : ${post[0] ? Object.keys(post[0].body).sort().join(', ') : '—'} (jamais start_time / end_time)`);
  check(!/start_time|end_time/.test(post[0]?.q || ''), 'la ligne rendue est demandée sans les heures (pas d’échec 42703 à l’insertion)');
  check(D.day_tasks.length === 1 && (await rowsOf(d)).join('|') === 'Matin Ranger le dépôt', `tâche ajoutée et affichée comme au lot 4 (${(await rowsOf(d)).join(' / ')})`);
  check(timedGets().length === 1, 'les heures ne sont plus redemandées (on s’en souvient)');
  await shot(d, 'colonnes-absentes-bureau');
  await closeDlg();
  check((await txt(cellOf(op, 'Sam Test', WED).locator('[data-testid=tasks-badge]'))) === '☐ 0/1 tâche', 'compteur de la case comme au lot 4');
  check(await stats() === statsBase, 'chiffres du cockpit inchangés');
}
{
  await openWorker();
  const list = (await wp.locator('[data-testid=my-task]').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
  check(list.length === 1 && list[0].startsWith('Matin Ranger le dépôt') && await wp.locator('[data-testid=my-task-time]').count() === 0, `« Ma journée » : la tâche du lot 4, sans heure (${list.join(' / ')})`);
  // « Fait » : set_day_task_done existe en production (lot 4), il répond.
  const k = await toastMark(wp);
  const n = writes.length;
  await wp.locator('[data-testid=my-task] [data-testid=my-task-done]').first().click(); await wp.waitForTimeout(900);
  const row = wp.locator('[data-testid=my-task]').first();
  check(of(since(n), 'RPC', 'set_day_task_done').length === 1 && await row.getAttribute('data-done') === '1' && await row.locator('[data-testid=my-task-time]').count() === 0
    && !(await toastsSince(wp, k)).includes('en attente'), '« Fait » : set_day_task_done répond, la tâche est cochée et reste sans heure');
  const reads = gets.filter((g) => g.t === 'day_tasks' && g.by === SAM).length;
  await openWeek();
  check(await wp.locator('[data-testid=week-task], [data-testid=week-tasks]').count() === 0, '« Ma semaine » : comme au lot 4 (pas de tâche)');
  check(gets.filter((g) => g.t === 'day_tasks' && g.by === SAM).length === reads, '« Ma semaine » : aucune lecture des tâches (colonnes déjà connues absentes), comme au lot 4');
}
{
  await printWith(op, { kind: 'week', tasks: true });
  const lines = (await op.locator('.bt-print [data-testid=print-tasks] .ln').allInnerTexts()).map((s) => s.trim());
  check(lines.join('|') === '☐ Ranger le dépôt · Matin' && await op.locator('.bt-print [data-testid=print-task-time]').count() === 0, `feuille : la ligne du lot 4 (« ${lines.join(' / ')} »)`);
  await closePrint(op);
}

// ═══ A2 · lot 4 pas appliqué ═════════════════════════════════════════════════
section('A2 · lot 4 pas appliqué : rien de plus qu’avant');
MIG = 'non'; freshDb();
await openOffice();
{
  await cellOf(op, 'Chloé Démo', WED).locator('.bt-pl-add').click(); await op.waitForTimeout(500);
  const d = dlg();
  check(await d.locator('[data-testid=add-kind]').count() === 0 && (await txt(d.locator('h2'))) === 'Ajouter une intervention', 'fenêtre « + » d’avant (ni « Tâche », ni heures)');
  await closeDlg();
  check(await stats() === statsBase, 'chiffres du cockpit inchangés');
}

// ═══ B1 · lot 9 appliqué : « Heure de … à … » ════════════════════════════════
section('B1 · bureau : heure de début et de fin, moment déduit, colonnes envoyées');
MIG = 'oui'; freshDb();
await openOffice();
const W0 = writes.length;
{
  check(await stats() === statsBase, `chiffres du cockpit identiques avec le lot 9 (${statsBase})`);
  const d = await openTasks('Sam Test');
  const hours = d.locator('[data-testid=task-hours]');
  check(await hours.count() === 1 && (await txt(hours)) === 'Heure de à' && (await hours.getAttribute('aria-label')) === 'Heure (facultatif)', `champs « ${await txt(hours)} » à côté du moment`);
  const hgt = (await d.locator('[data-testid=task-start]').boundingBox())?.height || 0;
  check(hgt <= 42, `champ d’heure discret (${Math.round(hgt)} px, comme la réunion)`);
  await d.locator('[data-testid=task-text]').fill('Préparer la commande');
  await setTime(op, d.locator('[data-testid=task-start]'), '10h');
  await setTime(op, d.locator('[data-testid=task-end]'), '11:30');
  check(await d.locator('[data-testid=task-start]').inputValue() === '10:00', '« 10h » compris comme 10:00');
  const matin = d.locator('[data-testid=task-part-matin]');
  check(await matin.getAttribute('aria-pressed') === 'true' && await matin.isDisabled() && await d.locator('[data-testid=task-part-soir]').isDisabled(),
    'moment déduit : « Matin » choisi, pastilles grisées (« Déduit de l’heure »)');
  await shot(d, 'bureau-tache-heures');
  const n = writes.length;
  await d.locator('[data-testid=task-add]').click(); await op.waitForTimeout(900);
  const post = of(since(n), 'POST', 'day_tasks');
  check(post.length === 1 && JSON.stringify(Object.keys(post[0].body).sort()) === JSON.stringify(['company_id', 'end_time', 'part', 'start_time', 'text', 'user_id', 'work_date']),
    `colonnes envoyées : ${post[0] ? Object.keys(post[0].body).sort().join(', ') : '—'} (ni id, ni created_by, ni done_at)`);
  check(post[0]?.body.start_time === '10:00' && post[0]?.body.end_time === '11:30' && post[0]?.body.part === 'matin', 'start_time 10:00, end_time 11:30, moment « matin »');
  check(await d.locator('[data-testid=task-outside]').count() === 0, 'dans le créneau (08:00–12:00) : aucune alerte');
  check(await d.locator('[data-testid=task-start]').inputValue() === '' && await d.locator('[data-testid=task-end]').inputValue() === '' && await d.locator('[data-testid=task-text]').inputValue() === '',
    'texte et heures vidés après l’ajout');
  check(!(await matin.isDisabled()), 'heures vidées : les pastilles du moment redeviennent libres');
  const row = d.locator('[data-testid=task-row]').first();
  check((await txt(row.locator('[data-testid=task-time]'))) === '10:00–11:30', 'la ligne affiche « 10:00–11:30 »');
  check(await row.locator('[data-testid=task-time]').evaluate((el) => getComputedStyle(el).backgroundColor) === BG.matin, '… teinté comme le matin');
}

// ═══ B2 · alerte hors créneau ════════════════════════════════════════════════
section('B2 · hors du créneau prévu : alerte non bloquante');
{
  const d = dlg();
  let n = writes.length;
  await typeTask(d, 'Rendre les clés', { start: '11:00', end: '12:30' });
  const warn = d.locator('[data-testid=task-outside]');
  check((await txt(warn)).startsWith('Cette tâche dépasse le créneau prévu (08:00–12:00). Ajouter quand même ?'), `alerte « ${await txt(warn)} »`);
  check(of(since(n), 'POST', 'day_tasks').length === 0, 'rien n’est écrit tant qu’on n’a pas répondu');
  await shot(d, 'bureau-alerte-creneau');
  const focused = () => op.evaluate(() => document.activeElement?.getAttribute('data-testid') || document.activeElement?.tagName || '');
  check(await focused() === 'task-outside-yes', 'clavier : l’alerte prend le focus sur « Ajouter quand même »');
  // Changer « Garder dans mes tâches habituelles » après l'alerte : l'alerte se retire (on redemande avec le nouveau choix).
  await d.locator('[data-testid=task-keep]').check(); await op.waitForTimeout(200);
  check(await warn.count() === 0 && of(since(n), 'POST', 'day_tasks').length === 0, 'cocher « Garder… » après l’alerte : l’alerte se retire, rien d’écrit');
  await d.locator('[data-testid=task-keep]').uncheck(); await op.waitForTimeout(200);
  await d.locator('[data-testid=task-add]').click(); await op.waitForTimeout(500);
  await warn.locator('[data-testid=task-outside-no]').click(); await op.waitForTimeout(300);
  check(await warn.count() === 0 && of(since(n), 'POST', 'day_tasks').length === 0 && await d.locator('[data-testid=task-text]').inputValue() === 'Rendre les clés',
    '« Non » : rien d’écrit, la saisie reste pour corriger');
  check(await focused() === 'task-text', 'clavier : après « Non », le focus revient au texte');
  await d.locator('[data-testid=task-add]').click(); await op.waitForTimeout(500);
  n = writes.length;
  await op.keyboard.press('Enter'); await op.waitForTimeout(900);
  const post = of(since(n), 'POST', 'day_tasks');
  check(post.length === 1 && post[0].body.start_time === '11:00' && post[0].body.end_time === '12:30' && post[0].body.part === 'matin', '« Ajouter quand même » (Entrée au clavier) : tâche écrite 11:00–12:30 (matin)');
  check(of(since(n), 'POST', 'task_templates').length === 0, '… sans tâche habituelle (case décochée au moment de répondre)');
  check(await warn.count() === 0, 'l’alerte disparaît');
  // Une tâche sans heure, avec un moment choisi : le corps du lot 4.
  n = writes.length;
  await typeTask(d, 'Ranger le dépôt', { part: 'soir' });
  const p2 = of(since(n), 'POST', 'day_tasks');
  check(p2.length === 1 && !('start_time' in p2[0].body) && !('end_time' in p2[0].body) && p2[0].body.part === 'soir', 'sans heure : ni start_time ni end_time envoyés, moment « soir » choisi à la main');
  n = writes.length;
  await typeTask(d, 'Appeler le client', { start: '08:00', end: '08:30' });
  check(of(since(n), 'POST', 'day_tasks').length === 1, 'tâche 08:00–08:30 ajoutée');
  await closeDlg();
}

// ═══ B3 · deux créneaux, sans planning, saisies refusées ═════════════════════
section('B3 · deux créneaux, pas de planning, saisies refusées');
{
  let d = await openTasks('Alex Exemple');
  let n = writes.length;
  await typeTask(d, 'Charger le camion', { start: '14:00', end: '15:00' });
  check(of(since(n), 'POST', 'day_tasks').length === 1 && await d.locator('[data-testid=task-outside]').count() === 0, 'Alex, 14:00–15:00 dans le créneau de l’après-midi : pas d’alerte');
  check(D.day_tasks.at(-1)?.part === 'apres-midi', 'moment déduit « après-midi »');
  n = writes.length;
  await typeTask(d, 'Point avec le client', { start: '11:30', end: '14:00' });
  check((await txt(d.locator('[data-testid=task-outside]'))).startsWith('Cette tâche dépasse les créneaux prévus (08:00–12:00, 13:30–17:00).'), `pause de midi : « ${await txt(d.locator('[data-testid=task-outside]'))} »`);
  check(of(since(n), 'POST', 'day_tasks').length === 0, '… rien d’écrit');
  await d.locator('[data-testid=task-outside-no]').click();
  // Saisies refusées sur place (mêmes mots que la règle partagée), rien d'écrit.
  await d.locator('[data-testid=task-text]').fill('Une heure seule');
  await setTime(op, d.locator('[data-testid=task-start]'), '');
  await setTime(op, d.locator('[data-testid=task-end]'), '');
  await setTime(op, d.locator('[data-testid=task-start]'), '09:00');
  let k = await toastMark(op);
  n = writes.length;
  await d.locator('[data-testid=task-add]').click(); await op.waitForTimeout(700);
  check((await toastsSince(op, k)).includes('Indiquez l’heure de début et l’heure de fin (ou aucune).') && of(since(n), 'POST', 'day_tasks').length === 0, 'début sans fin : « Indiquez l’heure de début et l’heure de fin (ou aucune). », rien d’écrit');
  await setTime(op, d.locator('[data-testid=task-end]'), '08:00');
  k = await toastMark(op);
  await d.locator('[data-testid=task-add]').click(); await op.waitForTimeout(700);
  check((await toastsSince(op, k)).includes('La fin doit être après le début.') && of(since(n), 'POST', 'day_tasks').length === 0, 'fin avant le début : « La fin doit être après le début. », rien d’écrit');
  await d.locator('[data-testid=task-end]').fill('7h75'); await d.locator('[data-testid=task-end]').press('Tab'); await op.waitForTimeout(150);
  k = await toastMark(op);
  await d.locator('[data-testid=task-add]').click(); await op.waitForTimeout(700);
  check((await toastsSince(op, k)).includes('Heure non comprise.') && of(since(n), 'POST', 'day_tasks').length === 0, 'heure illisible (« 7h75 ») : bloquée, rien d’écrit');
  await closeDlg();
  // Chloé n'a pas de planning mercredi : rien à comparer.
  await cellOf(op, 'Chloé Démo', WED).locator('.bt-pl-add').click(); await op.waitForTimeout(500);
  d = dlg(); await d.locator('[data-testid=add-kind-tache]').click(); await op.waitForTimeout(400);
  n = writes.length;
  await typeTask(d, 'Commander les vis', { start: '19:00', end: '20:00' });
  check(of(since(n), 'POST', 'day_tasks').length === 1 && await d.locator('[data-testid=task-outside]').count() === 0 && D.day_tasks.at(-1)?.part === 'soir', 'sans planning ce jour-là : pas d’alerte, moment « soir » déduit');
  await closeDlg();
}

// ═══ B4 · tri et compteur ═════════════════════════════════════════════════════
section('B4 · tri : avec heure d’abord, par heure, puis sans heure');
{
  const d = await openTasks('Sam Test');
  const rows = await rowsOf(d);
  check(rows.join('|') === '08:00–08:30 Appeler le client|10:00–11:30 Préparer la commande|11:00–12:30 Rendre les clés|Soir Ranger le dépôt', `ordre : ${rows.join(' / ')}`);
  await closeDlg();
  check((await txt(cellOf(op, 'Sam Test', WED).locator('[data-testid=tasks-badge]'))) === '☐ 0/4 tâches', 'compteur de la case : « ☐ 0/4 tâches »');
}

// ═══ B5 · jamais des heures ══════════════════════════════════════════════════
section('B5 · jamais des heures');
{
  const bad = since(W0).filter((w) => ['planning', 'time_entries', 'active_sessions'].includes(w.t) || (w.m === 'RPC' && w.t !== 'set_day_task_done') || (w.m === 'FN' && w.t !== 'send-push'));
  check(bad.length === 0, `aucune écriture planning / heures / chrono (${bad.map((w) => `${w.m} ${w.t}`).join(', ') || 'aucune'})`);
  check(!since(W0).some((w) => w.m === 'PATCH' && w.t === 'day_tasks'), 'aucune modification de tâche (pas d’UPDATE)');
  await openOffice();
  check(await stats() === statsBase, `cockpit identique avec 7 tâches à heures (${await stats()})`);
}

// ═══ S1 · « Ma journée » ═════════════════════════════════════════════════════
section('S1 · « Ma journée » : l’heure de la tâche, triée par heure');
await openWorker();
const totalBefore = await txt(wp.locator('.bt-total').first());
{
  const list = (await wp.locator('[data-testid=my-task]').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').replace(/ Fait$/, '').trim());
  check(list.join('|') === '08:00–08:30 Appeler le client|10:00–11:30 Préparer la commande|11:00–12:30 Rendre les clés|Soir Ranger le dépôt', `ordre : ${list.join(' / ')}`);
  const tag = wp.locator('[data-testid=my-task-time]').first();
  check(await tag.evaluate((el) => getComputedStyle(el).backgroundColor) === BG.matin, 'heure teintée comme son moment (matin)');
  const btn = wp.locator('[data-testid=my-task]').nth(1).locator('[data-testid=my-task-done]');
  check((await btn.getAttribute('aria-label')) === '10:00–11:30 · Préparer la commande : pas fait', `lecteur d’écran : « ${await btn.getAttribute('aria-label')} »`);
  await shot(wp, 'salarie-ma-journee');
  const n = writes.length;
  await btn.click(); await wp.waitForTimeout(900);
  check(of(since(n), 'RPC', 'set_day_task_done').length === 1 && !since(n).some((w) => ['POST', 'PATCH', 'DELETE'].includes(w.m)), '« Fait » → set_day_task_done seulement');
  const row = wp.locator('[data-testid=my-task]').nth(1);
  check(await row.getAttribute('data-done') === '1' && (await txt(row.locator('[data-testid=my-task-time]'))) === '10:00–11:30', 'cochée, l’heure reste affichée');
  check((await txt(wp.locator('.bt-total').first())) === totalBefore, `total du jour inchangé (${totalBefore})`);
}

// ═══ S2 · « Ma semaine » ═════════════════════════════════════════════════════
section('S2 · « Ma semaine » : « 10:00–11:30 · Texte », au bon jour');
{
  await openWeek();
  const lines = wp.locator('[data-testid=week-task]:visible');
  const texts = (await lines.allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
  check(texts.join('|') === '☐ 08:00–08:30 · Appeler le client|☑ 10:00–11:30 · Préparer la commande|☐ 11:00–12:30 · Rendre les clés|☐ Ranger le dépôt', `lignes : ${texts.join(' / ')}`);
  const day = await lines.first().evaluate((el) => el.closest('.rounded-lg')?.querySelector('p')?.textContent || '');
  check(/mercredi 21 octobre/i.test(day), `au bon jour : « ${day} »`);
  check(await noOverflow(wp), '390 px : pas de défilement horizontal');
  await shot(wp, 'salarie-semaine', { fullPage: true });
  const wide = await worker.newPage(); await wide.setViewportSize({ width: 1280, height: 800 });
  wide.on('pageerror', (e) => errors.push(`salarié large : ${e.message}`));
  await wide.goto(`http://localhost:${PORT}/poseur`); await wide.waitForSelector('.bt-total', { timeout: 20000 }); await wide.waitForTimeout(900);
  await wide.getByRole('button', { name: 'Mon compte et menu' }).click(); await wide.getByRole('menuitem', { name: 'Ma semaine' }).click(); await wide.waitForTimeout(1500);
  const g = (await wide.locator('[data-testid=week-task]:visible').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
  check(g.length === 4 && g[0].includes('Appeler le client') && g[0].includes('08:00–08:30') && g[3] === '☐ Ranger le dépôt', `grille large : 4 tâches, triées (${g.join(' / ')})`);
  await wide.close();
}

// ═══ S3 · lecture des tâches en panne ════════════════════════════════════════
section('S3 · « Ma semaine » : une panne de lecture des tâches n’emporte pas les réunions');
{
  D.meetings.push({ id: 'm-1', company_id: CO, title: 'Réunion d’équipe', meeting_date: '2026-10-22', start_time: '08:00:00', end_time: '08:30:00', place: null, all_team: true,
    created_at: '2026-10-01T08:00:00Z', updated_at: '2026-10-01T08:00:00Z' });
  TASKS_FAIL = true;
  const wk = await worker.newPage();
  wk.on('pageerror', (e) => errors.push(`salarié (panne) : ${e.message}`));
  await wk.goto(`http://localhost:${PORT}/poseur`); await wk.waitForSelector('.bt-total', { timeout: 20000 }); await wk.waitForTimeout(900);
  await wk.getByRole('button', { name: 'Mon compte et menu' }).click(); await wk.getByRole('menuitem', { name: 'Ma semaine' }).click(); await wk.waitForTimeout(1500);
  const meet = (await wk.locator('[data-testid=week-meeting]:visible').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
  check(meet.length === 1 && meet[0].includes('Réunion d’équipe'), `la réunion de jeudi reste affichée (${meet.join(' / ') || 'aucune'})`);
  check(await wk.locator('[data-testid=week-task]:visible').count() === 0, 'pas de tâche affichée (lecture en panne), sans erreur');
  TASKS_FAIL = false;
  await wk.close();
  D.meetings = [];
}

// ═══ P1 · impression ═════════════════════════════════════════════════════════
section('P1 · impression « Avec les tâches » : semaine, jour + salarié');
{
  await openOffice();
  const n = writes.length;
  await printWith(op, { kind: 'week', tasks: true });
  const sheet = op.locator('.bt-print');
  const samRow = sheet.locator('tbody tr').filter({ has: op.locator('.bt-pl-name', { hasText: 'Sam Test' }) });
  const lines = (await samRow.locator('td.bt-pl-cell').nth(WED).locator('[data-testid=print-tasks] .ln').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
  check(lines.join('|') === '☐ 08:00–08:30 · Appeler le client|☑ 10:00–11:30 · Préparer la commande|☐ 11:00–12:30 · Rendre les clés|☐ Ranger le dépôt · Soir', `semaine : ${lines.join(' / ')}`);
  const alexRow = sheet.locator('tbody tr').filter({ has: op.locator('.bt-pl-name', { hasText: 'Alex Exemple' }) });
  check((await txt(alexRow.locator('td.bt-pl-cell').nth(WED).locator('[data-testid=print-tasks] .ln'))) === '☐ 14:00–15:00 · Charger le camion', 'Alex : « 14:00–15:00 · Charger le camion »');
  await paper(op, () => shot(op, 'impression-semaine', { fullPage: true }));
  await closePrint(op);
  await printWith(op, { kind: 'week', tasks: false });
  check(await op.locator('.bt-print [data-testid=print-tasks]').count() === 0, 'sans « Avec les tâches » : aucune tâche');
  await closePrint(op);
  await printWith(op, { kind: 'day', who: SAM, tasks: true });
  const day = op.locator('.bt-print');
  const dl = (await day.locator('[data-testid=print-tasks] .ln').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
  check(day && await day.locator('tbody tr').count() === 1 && dl.length === 4 && dl[0] === '☐ 08:00–08:30 · Appeler le client', `feuille de mission (jour + Sam) : ${dl.join(' / ')}`);
  await paper(op, async () => {
    await shot(op, 'impression-jour-salarie', { fullPage: true });
    const pdf = await op.pdf({ format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
    const s = pdf.toString('latin1');
    check((s.match(/\/Type\s*\/Page(?!s)/g) || []).length === 1, 'PDF de la feuille de mission : 1 page');
  });
  await closePrint(op);
  check(since(n).length === 0, 'imprimer n’écrit rien');
}

// ═══ M1 · 390 px ═════════════════════════════════════════════════════════════
section('M1 · 390 px : fenêtre « + », onglet Tâche, sans débordement');
{
  const mob = await newCtx(ADMIN, { width: 390, height: 844 }); const mp = await mob.newPage();
  mp.on('pageerror', (e) => errors.push(`bureau mobile : ${e.message}`));
  await mp.goto(`http://localhost:${PORT}/admin`); await mp.waitForSelector('.bt-pl-m-card', { timeout: 25000 }); await mp.waitForTimeout(1500);
  const card = mp.locator('.bt-pl-m-card').filter({ hasText: 'Chloé Démo' });
  await card.locator('.bt-pl-m-add').click(); await mp.waitForTimeout(500);
  const md = mp.locator('[role=dialog]').last();
  await md.locator('[data-testid=add-kind-tache]').click(); await mp.waitForTimeout(500);
  check(await md.locator('[data-testid=task-hours]').count() === 1, 'mobile : champs d’heure présents');
  check(await md.evaluate((el) => el.scrollWidth <= el.clientWidth + 1) && await noOverflow(mp), 'mobile : onglet « Tâche » sans débordement');
  await shot(md, 'mobile-bureau-tache');
  await mob.close();
}

// ═══ Fin ═════════════════════════════════════════════════════════════════════
section('Fin');
check(errors.length === 0, `aucune erreur de page (${errors.length}${errors.length ? ` : ${errors.slice(0, 3).join(' ; ')}` : ''})`);
check(await mailtos(op) === 0 && await mailtos(wp) === 0, 'aucun « mailto: » de tout le test');
console.log(`\n${ok} ✅ / ${ko} ❌`);
if (ko) console.log(`Échecs :\n${fails.map((f) => ` - ${f}`).join('\n')}`);
await b.close(); srv.close(); fs.rmSync(TMP, { recursive: true, force: true });
process.exit(ko ? 1 : 0);
