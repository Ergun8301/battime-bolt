// Lot 4 — missions (tâches du jour) et réunions, sur les VRAIES pages : planning du
// bureau (/admin) et « Ma journée » du salarié (/poseur). UNE base simulée partagée
// par les deux navigateurs (aucune vraie base, aucun e-mail : send-push est simulé).
// Horloge figée au mercredi 21 octobre 2026, 10:00 à Paris (semaine 43).
//
// Lancer : npm run build, puis
//   node scripts/tests/missions-lot4.mjs out docs/captures-lot4 [port]
// Captures « avant » (build de la base, captures seulement, aucune vérification) :
//   AVANT=1 node scripts/tests/missions-lot4.mjs <build d'avant> docs/captures-lot4 [port]
// (playwright-core doit être résoluble.)
//
// La base simulée a trois états (variable MIG) :
//   'non'   migration 20261010170000 pas appliquée : les 4 tables → 404 PGRST205,
//           les 3 fonctions → 404 PGRST202. Tout doit être EXACTEMENT comme avant.
//   'oui'   migration appliquée : droits par colonne, RLS et fonctions rejoués ici
//           avec les règles du SQL (supabase/tests/lot4_missions_reunions.mjs les
//           prouve sur un vrai Postgres).
//   'table' tables présentes, fonctions absentes (cache PostgREST en retard).
// Base du LOT 4 seul : les heures d'une tâche (lot 9, start_time / end_time)
// n'existent pas — une lecture qui les demande reçoit 42703, comme en production
// avant la migration 20261011130000. Le lot 9 a son propre harnais
// (taches-heures-lot9.mjs) ; ici, tout doit rester exactement celui du lot 4.
//
//   O1  sans migration : fenêtre « + » d'avant, rien de plus, pas de « Avec les tâches »
//   O2  « + » : pastilles Intervention · Tâche · Réunion ; l'intervention marche comme avant
//   O3  tâches : ajout (Matin, « Garder… »), tâche habituelle, colonnes permises seulement
//   O4  le salarié coche « Fait » → le bureau voit « ✓ Fait 10:00 » et « ☐ 1/2 tâches »
//   O5  réunion « Toute l'équipe » : chip rose sur CHAQUE ligne, send-push une fois, pas d'e-mail
//   O6  réunion « Choisir » (2 salariés) : chips sur ces 2 lignes seulement
//   O7  modifier (nouveau / modifiée / annulée) puis retirer (annulée), chips retirés
//   O8  jamais des heures : aucune écriture planning / heures, chiffres du cockpit identiques
//   O9  impression : « Avec les tâches » (semaine, jour + salarié, période hors écran), légende
//   O10 390 px / 1024 / 1280 : rien ne déborde, barre inchangée
//   O11 send-push « 0 appareil » : message honnête, aucun e-mail ; rien à prévenir : aucun appel
//   O12 mode « Sélectionner » : chip et compteur inertes, sans case à cocher
//   O13 fonctions absentes : « Mise à jour de la base en attente », rien d'écrit
//   W1  salarié sans migration : « Ma journée » et « Ma semaine » comme avant
//   W2  « Tâches du jour » : Matin d'abord, « Fait » → set_day_task_done, hors-ligne désactivé
//   W3  réunion au-dessus de « Chantiers du jour », 0:00 inchangé, pas de « Je commence »
//   W4  « Ma semaine » : la ligne de la réunion, au bon jour
//   W5  tâche retirée par le bureau pendant qu'on coche : message, liste relue
import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { ouvrirVue } from './navigation-salarie.mjs';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, OUT = 'out', SH = 'docs/captures-lot4', PORT = '5521'] = process.argv;
const AVANT = process.env.AVANT === '1';
fs.mkdirSync(SH, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'missions-lot4-'));
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
const PLANNING = [
  slot('p-a1', ALEX, D_(19), W1, '08:00:00', '12:00:00'), slot('p-a3', ALEX, D_(21), W2, '13:30:00', '17:00:00'),
  slot('p-c2', CHLOE, D_(20), W1, '08:00:00', '17:00:00'), slot('p-c3', CHLOE, D_(21), W1, '08:00:00', '12:00:00'),
  slot('p-d3', DINA, D_(21), null, null, null, { absence_type: 'conge' }), slot('p-d4', DINA, D_(22), null, null, null, { absence_type: 'conge' }),
  slot('p-s1', SAM, D_(19), W2, '08:00:00', '12:00:00'),
];
const entry = (id, user_id, date, w, status, start, end, minutes, extra = {}) => ({ id, company_id: CO, user_id, work_date: date, worksite_id: w?.id ?? null, planning_id: null, status, start_time: start, end_time: end,
  total_minutes: minutes, break_minutes: 0, meal_allowance: false, reception: null, reserve_resolved_at: null, reserve_fixed_at: null, observation: null, locked: false, exported_at: null, gap_before: null, source: null,
  exit_forgotten: false, modified_at: null, modified_by: null, created_at: `${date}T12:00:00Z`, submitted_at: status === 'draft' ? null : `${date}T18:00:00Z`, ...extra });
const ENTRIES = [
  entry('e-s1', SAM, D_(19), W2, 'validated', '08:00:00', '12:00:00', 240, { planning_id: 'p-s1' }),
  entry('e-a1', ALEX, D_(19), W1, 'submitted', '08:00:00', '12:30:00', 270, { planning_id: 'p-a1' }),
];
let MIG = 'oui';
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
function insertTask(uid, body) {
  const keys = Object.keys(body);
  const allowed = ['company_id', 'user_id', 'work_date', 'text', 'part'];
  if (keys.some((k) => !allowed.includes(k))) throw new Refus(`permission denied for table day_tasks (${keys.filter((k) => !allowed.includes(k)).join(', ')})`, '42501', 403);
  if (!isAdmin(uid) || body.company_id !== CO || !teamMember(body.user_id)) throw new Refus('new row violates row-level security policy for table "day_tasks"', '42501', 403);
  const text = String(body.text || '').trim();
  if (!text || text.length > 200 || (body.part != null && !['matin', 'apres-midi', 'soir'].includes(body.part))) throw new Refus('violates check constraint', '23514');
  const row = { id: newId('t'), company_id: CO, user_id: body.user_id, work_date: body.work_date, text: body.text, part: body.part ?? null, created_by: uid, created_at: stamp(), done_at: null, done_by: null };
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
        if (MIG !== 'oui') return r.fulfill(MISSING_FN(fn));
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
      if (t === 'day_tasks' && /\b(start_time|end_time)\b/.test(sel)) return r.fulfill({ status: 400, json: { code: '42703', message: 'column day_tasks.start_time does not exist', details: null, hint: null } });
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
const check = (c, m) => { if (AVANT) return; if (c) { ok++; console.log('  ✅', m); } else { ko++; fails.push(m); console.log('  ❌', m); } };
const section = (t) => { if (!AVANT) console.log(`\n═══ ${t}`); };
const shot = async (loc, name, opts = {}) => {
  // Les petits messages (sonner) ne cachent pas la capture : masqués le temps de la prendre.
  const page = typeof loc.page === 'function' ? loc.page() : loc;
  const toaster = (v) => page.evaluate((v) => document.querySelectorAll('[data-sonner-toaster]').forEach((t) => { t.style.visibility = v; }), v).catch(() => {});
  await toaster('hidden'); await new Promise((r) => setTimeout(r, 200));
  await loc.screenshot({ path: path.join(SH, `${AVANT ? 'avant' : 'apres'}-${name}.png`), ...opts }).catch((e) => console.log('   (capture impossible :', e.message.split('\n')[0], ')'));
  await toaster('');
};
const since = (n) => writes.slice(n);
const of = (list, m, t) => list.filter((w) => w.m === m && (t == null || w.t === t));
const sameSet = (a, z) => JSON.stringify([...a].sort()) === JSON.stringify([...z].sort());
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
const refreshOffice = async () => { await op.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await op.waitForTimeout(900); };
const openWorker = async () => { await wp.goto(`http://localhost:${PORT}/poseur`); await wp.waitForSelector('.bt-total', { timeout: 20000 }); await wp.waitForTimeout(1100); };
const openWeek = async () => {
  await ouvrirVue(wp, 'Ma semaine', { apres: 1500 });
};
const stats = async () => txt(op.locator('.bt-pl-stats').first());
const setTime = async (loc, v) => { await loc.fill(v); await loc.press('Tab'); await op.waitForTimeout(120); };
const printed = (p) => p.evaluate(() => window.__printed || 0);
const printWith = async (p, { kind = 'week', moves = 0, who = 'all', tasks = null } = {}) => {
  const n = await printed(p);
  await p.click('[data-testid=bar-print]'); await p.waitForSelector('[data-testid=print-menu]');
  await p.click(`[data-testid=print-scope-${kind}]`);
  for (let i = 0; i < Math.abs(moves); i++) await p.click(`[data-testid=print-${moves < 0 ? 'prev' : 'next'}]`);
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
const pdfInfo = (buf) => {
  const s = buf.toString('latin1');
  return { pages: (s.match(/\/Type\s*\/Page(?!s)/g) || []).length, boxes: [...s.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((x) => [Number(x[3]), Number(x[4])]) };
};
const a4Land = (info) => info.boxes.length > 0 && info.boxes.every(([w, h]) => Math.abs(w - 841.89) <= 1.5 && Math.abs(h - 595.28) <= 1.5);
const BG = { meeting: 'rgb(249, 214, 224)', matin: 'rgb(218, 237, 251)', 'apres-midi': 'rgb(253, 227, 202)', soir: 'rgb(223, 204, 238)' };
const noOverflow = (p, sel = null) => p.evaluate((sel) => {
  const el = sel ? document.querySelector(sel) : document.documentElement;
  return !!el && el.scrollWidth <= el.clientWidth + 1;
}, sel);

// ═══ AVANT : captures du build d'avant (aucune vérification) ═════════════════
if (AVANT) {
  MIG = 'non'; freshDb();
  await openOffice();
  await shot(op, 'grille');
  await cellOf(op, 'Sam Test', WED).locator('.bt-pl-add').click(); await op.waitForTimeout(500);
  await shot(dlg(), 'ajout');
  await closeDlg();
  await op.click('button[aria-label="Légende des icônes"]'); await op.waitForTimeout(300);
  await shot(op.locator('.bt-pl-dd').first(), 'legende');
  await op.click('.bt-pl-ddbackdrop'); await op.waitForTimeout(200);
  await op.click('[data-testid=bar-print]'); await op.waitForSelector('[data-testid=print-menu]');
  await shot(op.locator('[data-testid=print-menu]'), 'impression-menu');
  await op.keyboard.press('Escape');
  const mob = await newCtx(ADMIN, { width: 390, height: 844 }); const mp = await mob.newPage();
  await mp.goto(`http://localhost:${PORT}/admin`); await mp.waitForSelector('.bt-pl-m-card', { timeout: 25000 }); await mp.waitForTimeout(1200);
  await shot(mp, 'mobile-bureau'); await mob.close();
  await openWorker(); await shot(wp, 'ma-journee');
  await openWeek(); await shot(wp, 'semaine');
  console.log(`Captures « avant » écrites dans ${SH}`);
  await b.close(); srv.close(); fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(0);
}

// ═══ O1 / W1 · migration PAS appliquée : exactement comme avant ══════════════
section('O1 · migration pas appliquée : fenêtre « + », grille, légende et impression d’avant');
MIG = 'non'; freshDb();
await openOffice();
const statsBase = await stats();
{
  check(gets.some((g) => g.t === 'day_tasks' && g.missing) && gets.some((g) => g.t === 'meetings' && g.missing), 'les lectures tentées reçoivent « table absente » (PGRST205)');
  await cellOf(op, 'Sam Test', WED).locator('.bt-pl-add').click(); await op.waitForTimeout(500);
  const d = dlg();
  check((await txt(d.locator('h2'))) === 'Ajouter une intervention', 'titre « Ajouter une intervention »');
  check(await d.locator('[data-testid=add-kind]').count() === 0, 'aucune pastille Intervention · Tâche · Réunion');
  check(await d.locator('button[role=combobox]').count() === 1 && await d.locator('button[type=submit]').count() === 1, 'un seul choix de client et un seul bouton d’envoi (comme avant)');
  await closeDlg();
  check(await op.locator('[data-testid=meeting-chip], [data-testid=tasks-badge]').count() === 0, 'aucune réunion, aucun compteur de tâches dans la grille');
  await op.click('button[aria-label="Légende des icônes"]'); await op.waitForTimeout(300);
  check(await op.locator('[data-testid=leg-reunion]').count() === 0, 'légende sans « Réunion »');
  await op.click('.bt-pl-ddbackdrop'); await op.waitForTimeout(200);
  await op.click('[data-testid=bar-print]'); await op.waitForSelector('[data-testid=print-menu]');
  check(await op.locator('[data-testid=print-tasks]').count() === 0, 'menu « Imprimer » sans « Avec les tâches »');
  await op.keyboard.press('Escape');
  await shot(op, 'sans-migration');
}
section('W1 · migration pas appliquée : « Ma journée » et « Ma semaine » d’avant');
await openWorker();
{
  check(await wp.locator('[data-testid=my-meetings], [data-testid=my-tasks]').count() === 0, '« Ma journée » : aucune section de plus');
  check((await txt(wp.locator('.bt-day-scroll'))).includes('Aucun chantier aujourd'), '« Aucun chantier aujourd’hui » comme avant');
  await openWeek();
  check(await wp.locator('[data-testid=week-meeting]').count() === 0, '« Ma semaine » : aucune ligne de plus');
}
const officeBarBase = await op.evaluate(() => ({ n: document.querySelectorAll('.bt-pl-bar button').length, w: document.querySelector('.bt-pl-bar')?.scrollWidth }));

// ═══ O2 · migration appliquée : le « + » ═════════════════════════════════════
section('O2 · « + » : pastilles, l’intervention marche comme avant');
MIG = 'oui'; freshDb();
await openOffice();
check(await stats() === statsBase, `chiffres du cockpit identiques avec la migration (${statsBase})`);
{
  await cellOf(op, 'Sam Test', WED).locator('.bt-pl-add').click(); await op.waitForTimeout(500);
  const d = dlg();
  check((await txt(d.locator('h2'))) === 'Ajouter une intervention', 'titre « Ajouter une intervention » (onglet par défaut)');
  const pills = (await d.locator('[data-testid=add-kind] button').allInnerTexts()).map((s) => s.trim());
  check(pills.join('|') === 'Intervention|Tâche|Réunion', `pastilles « ${pills.join(' · ')} »`);
  check(await d.locator('[data-testid=add-kind-intervention]').getAttribute('aria-pressed') === 'true', '« Intervention » choisie');
  check(await d.locator('[data-testid=add-kind] button[type=button]').count() === 3, 'pastilles type="button" (n’envoient pas le formulaire)');
  check(await d.locator('button[role=combobox]').count() === 1 && await d.locator('button[type=submit]').count() === 1, 'toujours un seul choix de client et un seul bouton d’envoi');
  await shot(d, 'ajout-intervention');
  const n = writes.length;
  await d.locator('button[role=combobox]').click(); await op.getByRole('option', { name: /Villa Exemple/ }).click();
  await d.locator('button[type=submit]').click(); await op.waitForTimeout(1200);
  check(of(since(n), 'POST', 'planning').length === 1 && of(since(n), 'POST', 'planning')[0].body?.user_id === SAM, 'l’intervention s’ajoute comme avant (POST planning)');
  D.planning = D.planning.filter((x) => !(x.user_id === SAM && x.work_date === TODAY)); // on revient à la case vide
  await openOffice();
}

// ═══ O3 · tâches ══════════════════════════════════════════════════════════════
section('O3 · tâches : ajout, moment, tâches habituelles, colonnes permises seulement');
const W0 = writes.length; // O8 : à partir d'ici, aucune écriture planning / heures
const statsBefore = await stats();
{
  await cellOf(op, 'Sam Test', WED).locator('.bt-pl-add').click(); await op.waitForTimeout(500);
  const d = dlg();
  await d.locator('[data-testid=add-kind-tache]').click(); await op.waitForTimeout(500);
  check((await txt(d.locator('h2'))) === 'Tâches du jour — Sam, mercredi 21 octobre', `titre « ${await txt(d.locator('h2'))} »`);
  check(await d.locator('button[role=combobox]').count() === 0 && await d.locator('[data-testid=add-form]').count() === 0, 'le formulaire d’intervention n’est pas rendu sur cet onglet');
  check(gets.some((g) => g.t === 'task_templates' && g.p.get('company_id') === `eq.${CO}`), 'tâches habituelles lues à l’ouverture de l’onglet (entreprise)');
  check((await d.locator('[data-testid=task-template]').allInnerTexts()).map((s) => s.trim()).join('|') === 'Vérifier le camion', 'tâche habituelle existante proposée');
  let n = writes.length;
  await d.locator('[data-testid=task-text]').fill('  Ranger   le dépôt ');
  await d.locator('[data-testid=task-part-matin]').click();
  await d.locator('[data-testid=task-keep]').check();
  await d.locator('[data-testid=task-add]').click(); await op.waitForTimeout(1000);
  const post = of(since(n), 'POST', 'day_tasks');
  check(post.length === 1, 'une seule insertion (POST day_tasks)');
  check(post[0] && JSON.stringify(Object.keys(post[0].body).sort()) === JSON.stringify(['company_id', 'part', 'text', 'user_id', 'work_date']), `colonnes envoyées : ${post[0] ? Object.keys(post[0].body).sort().join(', ') : '—'} (ni id, ni created_by, ni done_at)`);
  check(post[0]?.body.text === 'Ranger le dépôt' && post[0]?.body.part === 'matin' && post[0]?.body.user_id === SAM && post[0]?.body.work_date === TODAY && post[0]?.body.company_id === CO, 'texte nettoyé, Matin, Sam, ce jour, cette entreprise');
  const tpl = of(since(n), 'POST', 'task_templates');
  check(tpl.length === 1 && JSON.stringify(Object.keys(tpl[0].body).sort()) === '["company_id","text"]', '« Garder… » : tâche habituelle gardée (company_id, text)');
  check((await d.locator('[data-testid=task-template]').allInnerTexts()).map((s) => s.trim()).sort().join('|') === 'Ranger le dépôt|Vérifier le camion', 'la liste des tâches habituelles a le nouveau texte');
  check(await d.locator('[data-testid=task-text]').inputValue() === '', 'champ vidé après l’ajout');
  n = writes.length;
  await d.locator('[data-testid=task-part-apres-midi]').click();
  await d.locator('[data-testid=task-template] span[role=button]', { hasText: 'Vérifier le camion' }).click(); await op.waitForTimeout(1000);
  const post2 = of(since(n), 'POST', 'day_tasks');
  check(post2.length === 1 && post2[0].body.text === 'Vérifier le camion' && post2[0].body.part === 'apres-midi', 'un clic sur la tâche habituelle l’ajoute au jour (Après-midi)');
  check(of(since(n), 'POST', 'task_templates').length === 0, '… sans regarder la liste (pas de doublon)');
  const rows = (await d.locator('[data-testid=task-row]').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
  check(rows.length === 2 && rows[0].startsWith('Matin Ranger le dépôt') && rows[1].startsWith('Après-midi Vérifier le camion') && rows.every((r) => r.includes('Pas fait')), `deux tâches, Matin d’abord, « Pas fait » (${rows.join(' / ')})`);
  await shot(d, 'ajout-tache');
  // Un double clic n'ajoute qu'une fois.
  n = writes.length;
  await d.locator('[data-testid=task-text]').fill('Appeler le client');
  await d.locator('[data-testid=task-add]').dblclick(); await op.waitForTimeout(1000);
  check(of(since(n), 'POST', 'day_tasks').length === 1, '« Ajouter » double-cliqué : une seule tâche');
  // … et on la retire (confirmation sur place).
  const r3 = d.locator('[data-testid=task-row]', { hasText: 'Appeler le client' });
  await r3.locator('[data-testid=task-del]').click();
  check(await r3.locator('[data-testid=task-del-yes]').count() === 1, 'retirer demande une confirmation sur place');
  n = writes.length;
  await r3.locator('[data-testid=task-del-yes]').click(); await op.waitForTimeout(900);
  check(of(since(n), 'DELETE', 'day_tasks').length === 1 && D.day_tasks.length === 2, 'tâche retirée (DELETE day_tasks)');
  check(!since(W0).some((w) => w.m === 'PATCH' && w.t === 'day_tasks'), 'aucune modification de tâche (pas de renommage)');
  await closeDlg();
  const badge = cellOf(op, 'Sam Test', WED).locator('[data-testid=tasks-badge]');
  check((await txt(badge)) === '☐ 0/2 tâches', `la case de Sam : « ${await txt(badge)} »`);
  check(await cellOf(op, 'Sam Test', WED).locator('.bt-pl-add').count() === 1, 'le « + » reste (on peut encore ajouter une intervention)');
}

// ═══ W2 · le salarié coche « Fait » ══════════════════════════════════════════
section('W2 · « Tâches du jour » : Matin d’abord, « Fait » par set_day_task_done');
await openWorker();
const totalBefore = await txt(wp.locator('.bt-total').first());
{
  const tasks = wp.locator('[data-testid=my-task]');
  const list = (await tasks.allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
  check(list.length === 2 && list[0].startsWith('Matin Ranger le dépôt') && list[1].startsWith('Après-midi Vérifier le camion'), `deux tâches, Matin d’abord (${list.join(' / ')})`);
  check((await wp.locator('[data-testid=my-tasks] .bt-sec').textContent()).trim() === 'Tâches du jour', 'section « Tâches du jour »');
  const btn = tasks.first().locator('[data-testid=my-task-done]');
  const h = (await btn.boundingBox())?.height || 0;
  check(h >= 30 && h <= 40, `« Fait » : petite case, pas un gros bouton (${Math.round(h)} px)`);
  let n = writes.length;
  await btn.click(); await wp.waitForTimeout(800);
  let rpc = of(since(n), 'RPC', 'set_day_task_done');
  check(rpc.length === 1 && rpc[0].body.p_done === true && rpc[0].body.p_task_id === D.day_tasks.find((x) => x.text === 'Ranger le dépôt').id, 'toucher « Fait » → set_day_task_done(p_done: true) sur SA tâche');
  check(await btn.getAttribute('aria-pressed') === 'true' && await tasks.first().getAttribute('data-done') === '1', 'la case est cochée');
  check(!since(n).some((w) => ['POST', 'PATCH', 'DELETE'].includes(w.m)), 'aucune écriture directe (ni day_tasks, ni heures)');
  n = writes.length;
  await btn.click(); await wp.waitForTimeout(800);
  rpc = of(since(n), 'RPC', 'set_day_task_done');
  check(rpc.length === 1 && rpc[0].body.p_done === false && await btn.getAttribute('aria-pressed') === 'false', 'toucher encore → p_done: false (décochée)');
  await btn.click(); await wp.waitForTimeout(800);
  check(!!D.day_tasks.find((x) => x.text === 'Ranger le dépôt').done_at, 'cochée de nouveau (« Fait » en base)');
  await worker.setOffline(true); await wp.waitForTimeout(600);
  check(await wp.locator('[data-testid=my-task-done]:disabled').count() === 2 && (await txt(wp.locator('[data-testid=my-tasks-offline]'))) === 'Hors-ligne : coche quand le réseau revient.', 'hors-ligne : « Fait » désactivé, avec l’explication');
  await shot(wp, 'ma-journee-hors-ligne');
  await worker.setOffline(false); await wp.waitForTimeout(600);
}

// ═══ O4 · le bureau voit fait / pas fait ═════════════════════════════════════
section('O4 · le bureau voit fait / pas fait');
await refreshOffice();
{
  const badge = cellOf(op, 'Sam Test', WED).locator('[data-testid=tasks-badge]');
  check((await txt(badge)) === '☐ 1/2 tâches', `retour sur l’onglet : « ${await txt(badge)} »`);
  await badge.click(); await op.waitForTimeout(700);
  const d = dlg();
  const st = (await d.locator('[data-testid=task-status]').allInnerTexts()).map((s) => s.trim());
  check(st.join('|') === '✓ Fait 10:00|Pas fait', `fenêtre : « ${st.join(' · ')} »`);
  check(await d.locator('[data-testid=add-kind]').count() === 0, 'ouverte depuis le compteur : pas de pastilles');
  await closeDlg();
}

// ═══ O5 · réunion « Toute l'équipe » ═════════════════════════════════════════
section('O5 · réunion « Toute l’équipe » : chaque ligne, couleur à part, une notification');
{
  await cellOf(op, 'Sam Test', WED).locator('.bt-pl-add').click(); await op.waitForTimeout(500);
  const d = dlg();
  await d.locator('[data-testid=add-kind-reunion]').click(); await op.waitForTimeout(400);
  check((await txt(d.locator('h2'))) === 'Réunion', 'titre « Réunion »');
  check(await d.locator('[data-testid=meeting-date]').inputValue() === TODAY, 'date = le jour de la case');
  check(await d.locator('[data-testid=meeting-pick]').getAttribute('aria-pressed') === 'true' && await d.locator('[data-testid=meeting-person][data-id="u-sam"]').isChecked(), 'par défaut « Choisir », le salarié de la case coché');
  check(await d.locator('[data-testid=meeting-notify]').isChecked(), '« Prévenir par notification » coché (réunion aujourd’hui)');
  check((await txt(d)).includes('Ne compte pas dans les heures. Pas d’e-mail : notification seulement pour ceux qui l’ont activée.'), 'rappel : ne compte pas dans les heures, pas d’e-mail');
  await d.locator('[data-testid=meeting-title]').fill('Point sécurité');
  await setTime(d.locator('[data-testid=meeting-start]'), '14h');
  await d.locator('[data-testid=meeting-place]').fill('Dépôt');
  await d.locator('[data-testid=meeting-all]').click();
  check(await d.locator('[data-testid=meeting-people]').count() === 0, '« Toute l’équipe » : pas de liste à cocher');
  await shot(d, 'ajout-reunion');
  const n = writes.length; const k = await toastMark(op);
  await d.locator('[data-testid=meeting-save]').click(); await op.waitForTimeout(1500);
  const rpc = of(since(n), 'RPC', 'office_save_meeting');
  check(rpc.length === 1 && JSON.stringify(Object.keys(rpc[0].body).sort()) === JSON.stringify(['p_all_team', 'p_date', 'p_end', 'p_id', 'p_place', 'p_start', 'p_title', 'p_user_ids']), 'office_save_meeting avec ses 8 arguments nommés');
  check(rpc[0]?.body.p_all_team === true && rpc[0]?.body.p_start === '14:00' && rpc[0]?.body.p_end === null && rpc[0]?.body.p_title === 'Point sécurité' && rpc[0]?.body.p_place === 'Dépôt' && rpc[0]?.body.p_date === TODAY && rpc[0]?.body.p_id === null,
    'toute l’équipe, 14:00, sans fin, « Point sécurité », « Dépôt », aujourd’hui');
  const pushes = of(since(n), 'FN', 'send-push');
  check(pushes.length === 1 && sameSet(pushes[0].body.user_ids, TEAM), `send-push UNE fois, aux 4 salariés et chef d’équipe actifs (${pushes[0]?.body.user_ids?.join(', ')})`);
  check(pushes[0]?.body.body === 'Réunion « Point sécurité » mercredi 21 octobre à 14:00 · Dépôt' && pushes[0]?.body.title === 'Entreprise Test' && pushes[0]?.body.url === '/poseur', `texte : « ${pushes[0]?.body.body} »`);
  check(since(n).filter((w) => w.m === 'FN').every((w) => w.t === 'send-push'), 'aucune autre fonction appelée (pas d’e-mail)');
  check(await mailtos(op) === 0, 'aucun « mailto: »');
  const ts = await toastsSince(op, k);
  check(ts.includes('Réunion enregistrée — notification envoyée (2 appareils)'), `message : « ${ts} »`);
  check(await op.locator('[role=dialog]').count() === 0, 'la fenêtre se ferme');
  const chips = [];
  for (const name of ['Alex Exemple', 'Chloé Démo', 'Dina Essai', 'Sam Test']) chips.push(await cellOf(op, name, WED).locator('[data-testid=meeting-chip]').count());
  check(chips.every((c) => c === 1), `une réunion sur CHAQUE ligne ce jour-là, absente comprise (${chips.join(', ')})`);
  check(await rowOf(op, 'Sam Test').locator('[data-testid=meeting-chip]').count() === 1, 'pas sur les autres jours');
  const chip = cellOf(op, 'Alex Exemple', WED).locator('[data-testid=meeting-chip]');
  const css = await chip.evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, bs: s.borderTopStyle, bar: !!el.querySelector('.bt-pl-bub-bar') }; });
  check(css.bg === BG.meeting && !['matin', 'apres-midi', 'soir'].some((k) => BG[k] === css.bg), `couleur à part : ${css.bg} (ni matin, ni après-midi, ni soir)`);
  check(css.bs === 'solid' && !css.bar, 'bordure pleine, pas de barre de chantier');
  check((await txt(chip)) === '👥 14:00 Point sécurité' && /Réunion · 14:00 · Point sécurité · Dépôt/.test(await chip.getAttribute('title')), `chip : « ${await txt(chip)} » (titre complet au survol)`);
  check(await chip.evaluate((el) => !el.closest('[data-sel]') && !el.querySelector('.bt-pl-bub')), 'la réunion n’est ni une bulle, ni sélectionnable');
  const dina = cellOf(op, 'Dina Essai', WED);
  check(await dina.locator('.bt-pl-abs').count() === 1 && await dina.locator('[data-testid=meeting-chip]').count() === 1 && await dina.locator('.bt-pl-add').count() === 0, 'jour d’absence : l’absence reste, la réunion s’affiche dessous, pas de « + »');
  await op.mouse.move(5, 5);
  await shot(op, 'grille');
  await op.click('button[aria-label="Légende des icônes"]'); await op.waitForTimeout(300);
  check((await txt(op.locator('[data-testid=leg-reunion]'))).includes('Réunion · ne compte pas dans les heures'), 'légende : « 👥 Réunion · ne compte pas dans les heures »');
  await shot(op.locator('.bt-pl-dd').first(), 'legende');
  await op.click('.bt-pl-ddbackdrop'); await op.waitForTimeout(200);
  check(await op.locator('[data-testid=leg-mini] span', { hasText: 'Réunion' }).count() === 0, 'mini-légende en ligne inchangée');
}

// ═══ W3 · la réunion dans « Ma journée » ════════════════════════════════════
section('W3 · « Ma journée » : la réunion au-dessus des chantiers, jamais des heures');
{
  const n = writes.length;
  await wp.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await wp.waitForTimeout(1000);
  const card = wp.locator('[data-testid=my-meeting]');
  check(await card.count() === 1, 'retour sur l’appli : la réunion apparaît sans recharger');
  const ct = (await card.textContent()).replace(/\s+/g, ' ').trim();
  check(ct === '👥 Réunion · 14:00Point sécuritéDépôt · Toute l’équipe', `carte : « ${ct} »`);
  const above = await wp.evaluate(() => {
    const m = document.querySelector('[data-testid=my-meetings]'); const s = [...document.querySelectorAll('.bt-sec')].find((x) => x.textContent.trim() === 'Chantiers du jour');
    return !!m && !!s && !!(m.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  check(above, 'au-dessus de « Chantiers du jour »');
  check(await card.locator('button').count() === 0 && !(await txt(card)).includes('Je commence'), 'ni « Je commence », ni bouton sur la réunion');
  check((await txt(wp.locator('.bt-total').first())) === totalBefore, `total inchangé : « ${totalBefore} »`);
  check(await wp.locator('.bt-send').first().isDisabled(), '« Envoyer ma journée » reste désactivé (aucun chantier)');
  check(!since(n).some((w) => w.t === 'time_entries' || w.t === 'planning'), 'aucune écriture d’heures');
  await shot(wp, 'ma-journee');
}

// ═══ O6 · réunion « Choisir » ═══════════════════════════════════════════════
section('O6 · réunion « Choisir » (2 salariés) : chips sur ces 2 lignes seulement');
{
  await cellOf(op, 'Chloé Démo', FRI).locator('.bt-pl-add').click(); await op.waitForTimeout(500);
  const d = dlg();
  await d.locator('[data-testid=add-kind-reunion]').click(); await op.waitForTimeout(300);
  await d.locator('[data-testid=meeting-title]').fill('Réunion chantier');
  await setTime(d.locator('[data-testid=meeting-start]'), '08:00');
  await setTime(d.locator('[data-testid=meeting-end]'), '07:30');
  await d.locator('[data-testid=meeting-person][data-id="u-alex"]').check();
  let n = writes.length;
  await d.locator('[data-testid=meeting-save]').click(); await op.waitForTimeout(500);
  check((await txt(d.locator('[data-testid=meeting-error]'))) === 'La fin doit être après le début.' && of(since(n), 'RPC').length === 0, 'fin avant le début : refus sur place, rien envoyé');
  await setTime(d.locator('[data-testid=meeting-end]'), '09:00');
  n = writes.length;
  await d.locator('[data-testid=meeting-save]').click(); await op.waitForTimeout(1500);
  const rpc = of(since(n), 'RPC', 'office_save_meeting');
  check(rpc.length === 1 && rpc[0].body.p_all_team === false && sameSet(rpc[0].body.p_user_ids, [CHLOE, ALEX]) && rpc[0].body.p_end === '09:00' && rpc[0].body.p_date === D_(23), 'office_save_meeting : Chloé + Alex, 08:00–09:00, vendredi');
  const pushes = of(since(n), 'FN', 'send-push');
  check(pushes.length === 1 && sameSet(pushes[0].body.user_ids, [CHLOE, ALEX]), 'send-push aux deux seulement');
  const counts = {};
  for (const name of ['Alex Exemple', 'Chloé Démo', 'Dina Essai', 'Sam Test']) counts[name] = await cellOf(op, name, FRI).locator('[data-testid=meeting-chip]').count();
  check(counts['Alex Exemple'] === 1 && counts['Chloé Démo'] === 1 && counts['Dina Essai'] === 0 && counts['Sam Test'] === 0, `chips : ${JSON.stringify(counts)}`);
  check((await txt(cellOf(op, 'Alex Exemple', FRI).locator('[data-testid=meeting-chip]'))) === '👥 08:00 Réunion chantier', 'chip « 👥 08:00 Réunion chantier »');
}

// ═══ O7 · modifier, retirer ══════════════════════════════════════════════════
section('O7 · modifier (nouvelle / modifiée / annulée), puis retirer');
{
  await cellOf(op, 'Alex Exemple', FRI).locator('[data-testid=meeting-chip]').click(); await op.waitForTimeout(500);
  const d = dlg();
  check((await txt(d.locator('h2'))) === 'Réunion' && await d.locator('[data-testid=add-kind]').count() === 0, 'la pastille ouvre la réunion (titre « Réunion », pas de pastilles)');
  check(await d.locator('[data-testid=meeting-title]').inputValue() === 'Réunion chantier' && await d.locator('[data-testid=meeting-start]').inputValue() === '08:00'
    && await d.locator('[data-testid=meeting-person][data-id="u-chloe"]').isChecked() && await d.locator('[data-testid=meeting-person][data-id="u-alex"]').isChecked(), 'la réunion est relue (titre, heure, participants)');
  check(await d.locator('[data-testid=meeting-del]').count() === 1, '« Retirer la réunion » proposé');
  await setTime(d.locator('[data-testid=meeting-start]'), '08:30');
  await d.locator('[data-testid=meeting-person][data-id="u-chloe"]').uncheck();
  await d.locator('[data-testid=meeting-person][data-id="u-sam"]').check();
  let n = writes.length;
  await d.locator('[data-testid=meeting-save]').click(); await op.waitForTimeout(1500);
  const id = D.meetings.find((x) => x.title === 'Réunion chantier').id;
  check(of(since(n), 'RPC', 'office_save_meeting')[0]?.body.p_id === id, 'même réunion (p_id)');
  const pushes = of(since(n), 'FN', 'send-push');
  const by = Object.fromEntries(pushes.map((x) => [x.body.body.startsWith('Réunion modifiée') ? 'change' : x.body.body.startsWith('Réunion annulée') ? 'cancel' : 'new', x.body.user_ids]));
  check(pushes.length === 3 && sameSet(by.new || [], [SAM]) && sameSet(by.change || [], [ALEX]) && sameSet(by.cancel || [], [CHLOE]),
    `ajouté → « nouvelle », resté → « modifiée », retiré → « annulée » (${JSON.stringify(by)})`);
  check(pushes.every((x) => x.body.tag === `reunion-${id}`), 'même étiquette : la notification suivante remplace la précédente');
  check(pushes.some((x) => x.body.body === 'Réunion modifiée : « Réunion chantier » vendredi 23 octobre à 08:30'), 'texte « Réunion modifiée : … à 08:30 »');
  check(await cellOf(op, 'Chloé Démo', FRI).locator('[data-testid=meeting-chip]').count() === 0 && await cellOf(op, 'Sam Test', FRI).locator('[data-testid=meeting-chip]').count() === 1, 'chips : Chloé retirée, Sam ajouté');
  // Relecture : un participant archivé depuis ne bloque plus la modification (la base le refuserait).
  D.meeting_participants.push({ meeting_id: id, company_id: CO, user_id: 'u-ancien' });
  await op.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await op.waitForTimeout(800);
  await cellOf(op, 'Sam Test', FRI).locator('[data-testid=meeting-chip]').click(); await op.waitForTimeout(500);
  await setTime(dlg().locator('[data-testid=meeting-start]'), '08:45');
  n = writes.length;
  await dlg().locator('[data-testid=meeting-save]').click(); await op.waitForTimeout(1500);
  const rpcA = of(since(n), 'RPC', 'office_save_meeting');
  check(rpcA.length === 1 && sameSet(rpcA[0].body.p_user_ids, [ALEX, SAM]) && D.meetings.find((x) => x.id === id)?.start_time?.startsWith('08:45'),
    `participant archivé : la réunion se modifie quand même, sans lui (${JSON.stringify(rpcA[0]?.body.p_user_ids)})`);
  check(!of(since(n), 'FN', 'send-push').some((x) => (x.body.user_ids || []).includes('u-ancien')), 'l’archivé ne reçoit aucune notification');
  await cellOf(op, 'Sam Test', FRI).locator('[data-testid=meeting-chip]').click(); await op.waitForTimeout(500);
  await dlg().locator('[data-testid=meeting-del]').click();
  n = writes.length;
  await dlg().locator('[data-testid=meeting-del-yes]').click(); await op.waitForTimeout(1500);
  check(of(since(n), 'RPC', 'office_delete_meeting').length === 1 && !D.meetings.some((x) => x.id === id), 'office_delete_meeting : retirée');
  const p2 = of(since(n), 'FN', 'send-push');
  check(p2.length === 1 && sameSet(p2[0].body.user_ids, [ALEX, SAM]) && p2[0].body.body === 'Réunion annulée : « Réunion chantier » du vendredi 23 octobre', `retirée → « annulée » à Alex et Sam (${p2[0]?.body.body})`);
  check(await rowOf(op, 'Alex Exemple').locator('td.bt-pl-cell').nth(FRI).locator('[data-testid=meeting-chip]').count() === 0 && await cellOf(op, 'Sam Test', FRI).locator('[data-testid=meeting-chip]').count() === 0, 'chips retirés');
}

// ═══ O11 · « 0 appareil », rien à prévenir ═══════════════════════════════════
section('O11 · personne n’a activé les notifications ; rien à prévenir');
{
  pushSent = 0;
  await cellOf(op, 'Sam Test', THU).locator('.bt-pl-add').click(); await op.waitForTimeout(500);
  const d = dlg();
  await d.locator('[data-testid=add-kind-reunion]').click(); await op.waitForTimeout(300);
  await d.locator('[data-testid=meeting-title]').fill('Livraison');
  await setTime(d.locator('[data-testid=meeting-start]'), '07:30');
  let n = writes.length; let k = await toastMark(op);
  await d.locator('[data-testid=meeting-save]').click(); await op.waitForTimeout(1500);
  const ts = await toastsSince(op, k);
  check(ts.includes('Réunion enregistrée. Aucun participant n’a activé les notifications : ils la verront dans « Ma journée ».'), `message honnête : « ${ts} »`);
  check(await mailtos(op) === 0 && since(n).filter((w) => w.m === 'FN').every((w) => w.t === 'send-push'), 'aucun e-mail, aucun « mailto: »');
  // Enregistrer sans rien changer : personne à prévenir → aucun appel (jamais une liste vide).
  await cellOf(op, 'Sam Test', THU).locator('[data-testid=meeting-chip]').click(); await op.waitForTimeout(500);
  n = writes.length; k = await toastMark(op);
  await dlg().locator('[data-testid=meeting-save]').click(); await op.waitForTimeout(1200);
  check(of(since(n), 'RPC', 'office_save_meeting').length === 1 && of(since(n), 'FN', 'send-push').length === 0, 'rien de changé : enregistrée, aucune notification envoyée');
  check((await toastsSince(op, k)).includes('Réunion enregistrée'), '« Réunion enregistrée »');
  check(!writes.some((w) => w.t === 'send-push' && !(w.body?.user_ids || []).length), 'send-push n’est jamais appelé avec une liste vide');
  check(!writes.some((w) => w.t === 'send-push' && (w.body?.user_ids || []).some((x) => x.startsWith('demo-') || x === 'u-ancien' || x === 'u-autre' || x === ADMIN)), 'jamais un id de démo, un archivé, une autre entreprise ou le bureau');
  pushSent = 2;
}

// ═══ O8 · jamais des heures ══════════════════════════════════════════════════
section('O8 · jamais des heures : aucune écriture planning / heures, cockpit identique');
{
  const bad = since(W0).filter((w) => ['time_entries', 'planning', 'active_sessions'].includes(w.t) || (w.m === 'RPC' && !['set_day_task_done', 'office_save_meeting', 'office_delete_meeting'].includes(w.t)));
  check(bad.length === 0, `de O3 à O11 : aucune écriture planning / heures / chrono, aucune autre fonction (${bad.map((w) => `${w.m} ${w.t}`).join(', ') || 'aucune'})`);
  await refreshOffice();
  check(await stats() === statsBefore, `chiffres du cockpit identiques : « ${statsBefore} »`);
  const reads = gets.filter((g) => ['day_tasks', 'meetings', 'meeting_participants'].includes(g.t) && g.by === ADMIN);
  check(reads.length > 0 && reads.every((g) => g.p.get('company_id') === `eq.${CO}`), `bureau : chaque lecture tâches / réunions filtrée sur l’entreprise (${reads.length})`);
}

// ═══ O9 · impression ═════════════════════════════════════════════════════════
section('O9 · impression : « Avec les tâches », réunions en couleur, légende');
{
  // Une réunion la semaine suivante (hors écran) pour la lecture à part.
  saveMeetingFn(ADMIN, { p_id: null, p_title: 'Inventaire', p_date: D_(27), p_start: '16:00', p_end: '17:00', p_place: 'Atelier', p_all_team: false, p_user_ids: [SAM] });
  insertTask(ADMIN, { company_id: CO, user_id: SAM, work_date: D_(27), text: 'Préparer les échafaudages', part: 'matin' });
  await op.click('[data-testid=bar-print]'); await op.waitForSelector('[data-testid=print-menu]');
  const box = op.locator('[data-testid=print-tasks]');
  check(await box.count() === 1 && (await txt(op.locator('label.bt-pl-pr-chk', { has: box }))) === 'Avec les tâches', 'case « Avec les tâches » sous « Avec colonne signature »');
  await shot(op.locator('[data-testid=print-menu]'), 'impression-menu');
  await op.click('[data-testid=print-scope-month]');
  check(await box.count() === 0, 'Mois : pas de case (le mois n’a pas la place d’une liste)');
  await op.click('[data-testid=print-scope-week]');
  await op.keyboard.press('Escape');
  const n = writes.length;
  await printWith(op, { kind: 'week', tasks: true });
  const sheet = op.locator('.bt-print');
  const samRow = sheet.locator('tbody tr').filter({ has: op.locator('.bt-pl-name', { hasText: 'Sam Test' }) });
  const wedCell = samRow.locator('td.bt-pl-cell').nth(WED);
  const lines = (await wedCell.locator('[data-testid=print-tasks] .ln').allInnerTexts()).map((s) => s.trim());
  check(lines.join('|') === '☑ Ranger le dépôt · Matin|☐ Vérifier le camion · Après-midi', `semaine, avec les tâches : « ${lines.join(' / ')} »`);
  check(await sheet.locator('[data-testid=print-meeting]').count() === 5, `réunions imprimées : 4 « toute l’équipe » + 1 (${await sheet.locator('[data-testid=print-meeting]').count()})`);
  const pbg = await sheet.locator('[data-testid=print-meeting]').first().evaluate((el) => getComputedStyle(el).backgroundColor);
  check(pbg === BG.meeting, `sur la feuille, la réunion garde sa couleur (${pbg})`);
  const pm = await txt(sheet.locator('[data-testid=print-meeting]').first());
  const nos = (x) => x.replace(/\s+/g, '');
  check(nos(pm) === nos('👥 14:00 Point sécurité · Dépôt'), `titre, heure et lieu imprimés (« ${pm} »)`);
  check((await txt(sheet.locator('[data-testid=print-leg-meeting]'))) === '👥 Réunion · ne compte pas dans les heures', 'légende de la feuille : « Réunion »');
  check(await sheet.locator('.bt-pl-bub').count() === await op.locator('.bt-pl-gridwrap .bt-pl-bub').count(), 'les mêmes interventions qu’à l’écran (rien de plus, rien de moins)');
  await paper(op, () => shot(op, 'impression-semaine', { fullPage: true }));
  await closePrint(op);
  await printWith(op, { kind: 'week', tasks: false });
  check(await op.locator('.bt-print [data-testid=print-tasks]').count() === 0 && await op.locator('.bt-print [data-testid=print-meeting]').count() === 5, 'sans « Avec les tâches » : aucune tâche, les réunions restent');
  await closePrint(op);
  // Un jour, un salarié, avec les tâches : la feuille de mission.
  await printWith(op, { kind: 'day', who: SAM, tasks: true });
  const day = op.locator('.bt-print');
  check(await day.locator('tbody tr').count() === 1 && await day.locator('thead th.bt-pl-th').count() === 1, 'Jour + Sam : une ligne, une colonne');
  check((await day.locator('[data-testid=print-tasks] .ln').count()) === 2 && await day.locator('[data-testid=print-meeting]').count() === 1, 'ses deux tâches et sa réunion');
  const wTasks = await day.locator('[data-testid=print-tasks]').evaluate((el) => el.getBoundingClientRect().width);
  await paper(op, async () => {
    const r = await day.locator('[data-testid=print-tasks]').evaluate((el) => ({ w: el.getBoundingClientRect().width, cell: el.closest('.bt-pl-cellfill').getBoundingClientRect().width }));
    check(r.w >= r.cell - 2, `jour : la liste des tâches prend toute la largeur de la case (${Math.round(r.w)} / ${Math.round(r.cell)} px)`);
    await shot(op, 'impression-jour-salarie', { fullPage: true });
    const pdf = await op.pdf({ format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
    fs.writeFileSync(path.join(TMP, 'jour-salarie.pdf'), pdf);
    const info = pdfInfo(pdf);
    check(a4Land(info) && info.pages === 1, `PDF : A4 paysage, ${info.pages} page`);
  });
  void wTasks;
  await closePrint(op);
  // Période hors écran (semaine suivante) : réunions et tâches lues à part, pour cette période.
  const g0 = gets.length;
  await printWith(op, { kind: 'week', moves: 1, tasks: true });
  const tg = gets.slice(g0).filter((g) => g.t === 'day_tasks'); const mg = gets.slice(g0).filter((g) => g.t === 'meetings');
  check(tg.length >= 1 && tg.every((g) => g.p.get('company_id') === `eq.${CO}` && g.p.getAll('work_date').join(' ') === 'gte.2026-10-26 lte.2026-11-01'), `semaine suivante : tâches relues pour 26 oct. → 1er nov., entreprise (${tg.length})`);
  check(mg.length >= 1 && mg.every((g) => g.p.get('company_id') === `eq.${CO}` && g.p.getAll('meeting_date').join(' ') === 'gte.2026-10-26 lte.2026-11-01'), 'réunions relues pour la même période');
  const nx = op.locator('.bt-print');
  const nm = await txt(nx.locator('[data-testid=print-meeting]')); const nt = await txt(nx.locator('[data-testid=print-tasks] .ln'));
  check(nos(nm) === nos('👥 16:00–17:00 Inventaire · Atelier') && nt === '☐ Préparer les échafaudages · Matin', `la feuille de la semaine suivante a sa réunion et sa tâche (« ${nm} », « ${nt} »)`);
  await closePrint(op);
  const g1 = gets.length;
  await printWith(op, { kind: 'month' });
  check(!gets.slice(g1).some((g) => ['day_tasks', 'meetings'].includes(g.t)) && await op.locator('.bt-print [data-testid=print-meeting], .bt-print [data-testid=print-tasks]').count() === 0, 'mois : ni réunion ni tâche (rien de lu pour elles)');
  await closePrint(op);
  check(since(n).length === 0, 'imprimer n’écrit rien');
}

// ═══ O12 · mode « Sélectionner » ═════════════════════════════════════════════
section('O12 · « Sélectionner » : réunion et compteur inertes');
{
  await op.click('[data-testid=bar-select]'); await op.waitForTimeout(400);
  const cell = cellOf(op, 'Sam Test', WED);
  check(await cell.locator('[data-testid=meeting-chip][data-sel], [data-testid=tasks-badge][data-sel]').count() === 0 && await cell.locator('[data-testid=meeting-chip]').evaluate((el) => !el.closest('[data-sel]')), 'aucune case à cocher sur la réunion ni le compteur');
  const k = await toastMark(op);
  await cell.locator('[data-testid=meeting-chip]').click(); await op.waitForTimeout(400);
  check(await op.locator('[role=dialog]').count() === 0 && (await toastsSince(op, k)).includes('Réunion / tâches — hors sélection'), 'un clic dit « Réunion / tâches — hors sélection », rien ne s’ouvre');
  await op.click('[data-testid=bar-select]'); await op.waitForTimeout(400);
}

// ═══ W4 · « Ma semaine » ═════════════════════════════════════════════════════
section('W4 · « Ma semaine » : la réunion au bon jour');
{
  await openWorker(); await openWeek();
  const lines = wp.locator('[data-testid=week-meeting]:visible');
  const texts = (await lines.allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
  check(texts.length === 2 && texts[0].includes('14:00') && texts[0].includes('Point sécurité') && texts[1].includes('07:30') && texts[1].includes('Livraison'), `deux réunions cette semaine (${texts.join(' / ')})`);
  const day = await lines.first().evaluate((el) => el.closest('.rounded-lg')?.querySelector('p')?.textContent || '');
  check(/mercredi 21 octobre/i.test(day), `au bon jour : « ${day} »`);
  check(!(await txt(wp.locator('body'))).includes('Ranger le dépôt'), 'les tâches restent dans « Ma journée » (pas dans la semaine)');
  await shot(wp, 'semaine');
}

// ═══ W5 · tâche retirée pendant qu'on coche ══════════════════════════════════
section('W5 · tâche retirée par le bureau pendant qu’on coche');
{
  await openWorker();
  check(await wp.locator('[data-testid=my-task]').count() === 2, 'deux tâches affichées');
  const gone = D.day_tasks.find((x) => x.text === 'Vérifier le camion');
  D.day_tasks = D.day_tasks.filter((x) => x !== gone); // le bureau l'a retirée entre-temps
  const k = await toastMark(wp);
  await wp.locator('[data-testid=my-task]', { hasText: 'Vérifier le camion' }).locator('[data-testid=my-task-done]').click(); await wp.waitForTimeout(1200);
  check((await toastsSince(wp, k)).includes('Cette tâche a été retirée par le bureau.'), 'message « Cette tâche a été retirée par le bureau. »');
  check(await wp.locator('[data-testid=my-task]').count() === 1, 'liste relue : la tâche a disparu');
}

// ═══ O10 · tailles d'écran ═══════════════════════════════════════════════════
section('O10 · 390 px, 1024, 1280 : rien ne déborde, barre inchangée');
{
  const mob = await newCtx(ADMIN, { width: 390, height: 844 }); const mp = await mob.newPage();
  mp.on('pageerror', (e) => errors.push(`bureau mobile : ${e.message}`));
  await mp.goto(`http://localhost:${PORT}/admin`); await mp.waitForSelector('.bt-pl-m-card', { timeout: 25000 }); await mp.waitForTimeout(1500);
  const card = mp.locator('.bt-pl-m-card').filter({ hasText: 'Sam Test' });
  check(await card.locator('[data-testid=meeting-chip]').count() === 1 && await card.locator('[data-testid=tasks-badge]').count() === 1, 'mobile : réunion et compteur dans la carte de Sam');
  check((await txt(card.locator('[data-testid=meeting-chip]'))) === '👥 14:00 Réunion · Point sécurité · Dépôt', `mobile : « ${await txt(card.locator('[data-testid=meeting-chip]'))} »`);
  const dcard = mp.locator('.bt-pl-m-card').filter({ hasText: 'Dina Essai' });
  check(await dcard.locator('[data-testid=meeting-chip]').count() === 1 && await dcard.locator('.bt-pl-m-add').count() === 0, 'mobile, jour d’absence : la réunion est montrée, pas d’ajout');
  check(await noOverflow(mp), 'mobile : pas de défilement horizontal');
  await shot(mp, 'mobile-bureau');
  await card.locator('.bt-pl-m-add').click(); await mp.waitForTimeout(500);
  const md = mp.locator('[role=dialog]').last();
  for (const k of ['tache', 'reunion']) {
    await md.locator(`[data-testid=add-kind-${k}]`).click(); await mp.waitForTimeout(400);
    check(await md.evaluate((el) => el.scrollWidth <= el.clientWidth + 1) && await noOverflow(mp), `mobile : onglet « ${k === 'tache' ? 'Tâche' : 'Réunion'} » sans débordement`);
  }
  await mob.close();
  for (const w of [1024, 1280]) {
    await op.setViewportSize({ width: w, height: 800 }); await op.waitForTimeout(500);
    const bar = await op.evaluate(() => ({ n: document.querySelectorAll('.bt-pl-bar button').length, ok: (() => { const b = document.querySelector('.bt-pl-bar'); return b.scrollWidth <= b.clientWidth + 1; })() }));
    check(bar.ok && bar.n === officeBarBase.n, `${w} px : barre sans débordement, ${bar.n} boutons (comme sans migration)`);
    await cellOf(op, 'Alex Exemple', THU).locator('.bt-pl-add').click(); await op.waitForTimeout(400);
    const d = dlg();
    let fits = true;
    for (const k of ['tache', 'reunion']) { await d.locator(`[data-testid=add-kind-${k}]`).click(); await op.waitForTimeout(300); fits = fits && await d.evaluate((el) => el.scrollWidth <= el.clientWidth + 1); }
    check(fits, `${w} px : onglets Tâche et Réunion sans débordement`);
    await closeDlg();
  }
  await op.setViewportSize({ width: 1280, height: 800 });
}

// ═══ O13 · fonctions absentes ════════════════════════════════════════════════
section('O13 · tables présentes, fonctions absentes : « Mise à jour de la base en attente »');
{
  MIG = 'table';
  await openOffice();
  check(await op.locator('[data-testid=meeting-chip]').count() > 0, 'les réunions existantes s’affichent (lecture simple)');
  await cellOf(op, 'Alex Exemple', THU).locator('.bt-pl-add').click(); await op.waitForTimeout(400);
  const d = dlg();
  await d.locator('[data-testid=add-kind-reunion]').click(); await op.waitForTimeout(300);
  await d.locator('[data-testid=meeting-title]').fill('Réunion test');
  await setTime(d.locator('[data-testid=meeting-start]'), '09:00');
  const before = D.meetings.length; const n = writes.length;
  await d.locator('[data-testid=meeting-save]').click(); await op.waitForTimeout(1000);
  check((await txt(d.locator('[data-testid=meeting-error]'))) === 'Mise à jour de la base en attente : rien n’a été modifié.', 'message « Mise à jour de la base en attente : rien n’a été modifié. »');
  check(D.meetings.length === before && of(since(n), 'FN').length === 0 && !since(n).some((w) => w.t === 'meetings'), 'rien d’écrit, aucune notification, aucun repli sur une écriture brute');
  await closeDlg();
  await openWorker();
  const k = await toastMark(wp);
  const t = wp.locator('[data-testid=my-task]').first();
  await t.locator('[data-testid=my-task-done]').click(); await wp.waitForTimeout(1000);
  check((await toastsSince(wp, k)).includes('Mise à jour de la base en attente : rien n’a été modifié.') && await t.getAttribute('data-done') === '1', 'salarié : même message, la case revient à son état (faite)');
  MIG = 'oui';
}

// ═══ Fin ═════════════════════════════════════════════════════════════════════
section('Fin');
check(errors.length === 0, `aucune erreur de page (${errors.length}${errors.length ? ` : ${errors.slice(0, 3).join(' ; ')}` : ''})`);
check(await mailtos(op) === 0 && await mailtos(wp) === 0, 'aucun « mailto: » de tout le test');
{
  const src = ['lib/missions.ts', 'components/missions-office.tsx', 'components/missions-worker.tsx'].map((f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } }).join('\n');
  check(src.length > 0 && !/mailto|sendReminder|restoreRows|send-email|resend/i.test(src.replace(/\/\/[^\n]*/g, '')), 'le code du lot n’a ni mailto, ni sendReminder, ni restoreRows, ni fonction d’e-mail');
}
console.log(`\n${ok} ✅ / ${ko} ❌`);
if (fails.length) console.log(`Échecs :\n - ${fails.join('\n - ')}`);
fs.rmSync(TMP, { recursive: true, force: true });
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
