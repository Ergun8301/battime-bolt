// Versions du planning (lot 8, oct. 2026), sur les VRAIES pages /admin.
// UNE base simulée AVEC ÉTAT (aucune vraie base, aucun e-mail, aucun appel réseau réel).
// Horloge figée au jeudi 1er octobre 2026, 10:00 à Paris : la semaine affichée est celle du
// 28 septembre au 4 octobre (S-40), à cheval sur septembre (mois clôturé) et octobre.
//
// Lancer : npm run build, puis
//   node scripts/tests/versions-lot8.mjs out docs/captures-versions [port]
// (playwright-core doit être résoluble.)
//
// La base simulée rejoue les règles du SQL (supabase/tests/lot8_versions_planning.mjs les prouve
// sur un vrai Postgres) : n° posé par la base, auteur et date aussi, demande de 500 caractères au
// plus et seulement pour un essai de l'assistant, 2000 cases au plus, ni modifier ni effacer.
//
//   N  SANS la migration (table absente, PGRST205)
//    N1 bureau, ordinateur : aucune entrée « Versions » ; UNE seule lecture de la table ; aucune écriture
//    N2 bureau, téléphone : aucune entrée dans le menu ☰
//    N3 l'assistant applique un planning comme avant : aucune version, aucune requête de plus
//   W  AVEC la migration — la fenêtre « Versions » et « Revenir à cette version »
//    W1 l'entrée est là (coin de la grille, la barre du haut n'a plus de place : lot 3) ; la liste :
//       V3, V2, V1 « Initiale », date de Paris, auteur, demande
//    W2 « Voir » : l'aperçu en clair, RIEN n'est écrit ; cases remises, retirées, modifiées, gardées
//       (heures, pointage en cours, mois clôturé), non remises (mois clôturé, chantier supprimé)
//    W3 « Revenir à cette version » : l'aperçu et une confirmation d'abord, rien n'est écrit avant
//    W4 le retour : l'état actuel est gardé EN PREMIER (V4), puis seules les cases bougent ; les
//       cases gardées restent et sont annoncées ; les heures et pointages ne sont pas touchés
//    W4b une case retirée qui ne portait qu'un brouillon vide et une ligne « retirée » : le brouillon vide part,
//       la ligne « retirée » garde toutes ses heures (lien détaché) — la règle de « Supprimer » (lot 2)
//    W5 « Annuler » : le planning d'avant, à l'identique ; si le planning a bougé depuis le retour,
//       « Annuler » ne part plus seul : nouvel aperçu à confirmer
//    W6 l'état actuel ne peut pas être gardé : RIEN n'est touché
//    W7 le planning a bougé entre l'aperçu et le clic : rien n'est fait, nouvel aperçu à confirmer
//    W8 une écriture échoue à mi-chemin : « Retour interrompu », « Annuler » remet tout
//    W8b un pointage démarre pendant le retour : la case concernée n'est pas retirée
//    W9 double clic sur « Revenir » : un seul retour
//    W10 « Garder cette version », puis rien à changer quand le planning est déjà comme la version
//    W11 téléphone : entrée dans le menu ☰, fenêtre sans défilement horizontal
//    W12 grande semaine : plus de 1000 lignes lues page par page ; 2001 cases refusées, 2000 gardées
//   A  L'ASSISTANT écrit les versions (écritures « assistant », jamais l'écran)
//    A1 « Fais le planning de la semaine prochaine » : V1 « initiale » AVANT, l'essai (avec la demande) APRÈS
//    A2 demande de plus de 500 caractères (émojis comprises) : coupée à 500, la version est gardée
//    A3 « Efface le planning de la semaine prochaine » : V1 avec les cases d'avant ; « Versions de la
//       semaine » ouvre la liste ; « Revenir » remet les cases effacées (écran, pas assistant)
//    A4 une version qui ne s'écrit pas n'empêche pas l'action, et le message le dit
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { chromium } from 'playwright-core';
const [,, OUT, SH, PORT = '4801'] = process.argv; fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT), r));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ─── Horloge figée : jeudi 1er octobre 2026, 10:00 (Paris) ───────────────────────
const NOW = new Date('2026-10-01T10:00:00+02:00');
const WEEK = '2026-09-28'; // lundi de la semaine affichée
const NEXT = '2026-10-05'; // la semaine prochaine
const CO = 'c0000000-0000-0000-0000-0000000000aa', CO2 = 'c0000000-0000-0000-0000-0000000000bb';
const ADMIN = 'u-admin', SAM = 'u-sam', ALEX = 'u-alex', LEA = 'u-lea', CHLOE = 'u-chloe';
const WS = {
  w1: { id: 'w1', company_id: CO, client_name: 'Villa Exemple', city: 'Lyon', product_type: null, is_active: true },
  w2: { id: 'w2', company_id: CO, client_name: 'Résidence Test', city: 'Bron', product_type: null, is_active: true },
};
const u = (id, first_name, last_name, role = 'worker', extra = {}) => ({ id, company_id: CO, first_name, last_name, role, email: `${id}@exemple.fr`, is_active: true, created_at: '2026-01-01', ...extra });
const USERS = [u(ADMIN, 'Paula', 'Bureau', 'admin'), u(SAM, 'Sam', 'Test'), u(ALEX, 'Alex', 'Exemple'), u(LEA, 'Léa', 'Démo'), u(CHLOE, 'Chloé', 'Essai', 'lead'), u('u-autre', 'Autre', 'Salarié', 'worker', { company_id: CO2 })];
const COMPANY = { id: CO, name: 'Entreprise Test', ai_enabled: true, kiosk_enabled: false, position_tracking_enabled: false, travel_paid: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, accountant_email: null };
const row = (id, user_id, work_date, w, start = '08:00:00', end = '12:00:00', extra = {}) => ({ id, company_id: CO, user_id, worksite_id: w, work_date, absence_type: null, estimated_start: start, estimated_end: end,
  notes: null, position: null, added_by_worker: false, created_by: ADMIN, created_at: '2026-09-20T06:00:00Z', ...extra });
const cellOf = (r) => ({ id: r.id, user_id: r.user_id, worksite_id: r.worksite_id, work_date: r.work_date, estimated_start: r.estimated_start, estimated_end: r.estimated_end, notes: r.notes, created_by: r.created_by });

// V1 (initiale) de la semaine 28 sept. → 4 oct. ; l'assistant, puis le bureau, ont changé des choses depuis.
const V1_ROWS = [
  row('a1', SAM, '2026-09-28', 'w1'),                                  // septembre (clôturé) : inchangée
  row('a2', LEA, '2026-09-30', 'w2'),                                  // septembre : effacée depuis → ne revient PAS (mois clôturé)
  row('a3', SAM, '2026-10-01', 'w1'),                                  // inchangée
  row('a4', SAM, '2026-10-02', 'w2', '08:00:00', '12:00:00', { created_by: 'u-gone' }), // effacée depuis → revient (son auteur n'existe plus)
  row('a5', ALEX, '2026-10-01', 'w1'),                                 // une note ajoutée depuis → modifiée
  row('a6', CHLOE, '2026-10-03', 'w1'),                                // décalée au dimanche depuis → modifiée (déplacée)
  row('a7', ALEX, '2026-10-04', 'w-old'),                              // chantier supprimé depuis → ne revient PAS
];
const CURRENT_ROWS = () => [
  row('a1', SAM, '2026-09-28', 'w1'),
  row('a3', SAM, '2026-10-01', 'w1'),
  row('a5', ALEX, '2026-10-01', 'w1', '08:00:00', '12:00:00', { notes: 'Apporter l’échelle' }),
  row('a6', CHLOE, '2026-10-04', 'w1'),
  row('x1', SAM, '2026-10-03', 'w2'),                                  // posée depuis, libre → retirée
  row('x2', LEA, '2026-10-01', 'w1'),                                  // posée depuis, des heures notées → GARDÉE
  row('x3', ALEX, '2026-10-02', 'w1'),                                 // posée depuis, pointage en cours → GARDÉE
  row('z1', ALEX, '2026-09-29', 'w2'),                                 // posée depuis, septembre clôturé → GARDÉE
  { ...row('p-conge', LEA, '2026-10-02', null, null, null), absence_type: 'conge' },
];
const ENTRIES = () => [
  { id: 'te-x2', company_id: CO, user_id: LEA, work_date: '2026-10-01', worksite_id: 'w1', planning_id: 'x2', status: 'draft', start_time: '08:00:00', end_time: '12:00:00', total_minutes: 240, break_minutes: 0,
    locked: false, submitted_at: null, exit_forgotten: false, created_at: '2026-10-01T06:00:00Z' },
  { id: 'te-a3', company_id: CO, user_id: SAM, work_date: '2026-10-01', worksite_id: 'w1', planning_id: 'a3', status: 'submitted', start_time: '08:00:00', end_time: '12:00:00', total_minutes: 240, break_minutes: 0,
    locked: false, submitted_at: '2026-10-01T09:00:00Z', exit_forgotten: false, created_at: '2026-10-01T06:00:00Z' },
];
const LIVE = () => [{ user_id: ALEX, company_id: CO, worksite_id: 'w1', planning_id: 'x3', work_date: '2026-10-02', started_at: '2026-10-02T06:00:00Z', positions: [] }];

// Les versions, telles que la base les a écrites.
const ver = (id, number, kind, created_at, cells, o = {}) => ({ id, company_id: CO, week_start: WEEK, number, kind, request: null, note: null, created_by: ADMIN, created_at,
  cells, user_ids: Array.from(new Set(cells.map((c) => c.user_id))).sort(), ...o });
const VERSIONS = () => [
  ver('v1', 1, 'initial', '2026-09-28T05:30:00Z', V1_ROWS.map(cellOf)),
  ver('v2', 2, 'assistant', '2026-09-29T09:10:00Z', [...V1_ROWS.map(cellOf), cellOf(row('x1', SAM, '2026-10-03', 'w2'))],
    { request: 'Fais le planning de la semaine du 28 septembre comme la semaine dernière', note: 'Planning appliqué : 5 affectations.' }),
  ver('v3', 3, 'assistant', '2026-09-30T14:00:00Z', CURRENT_ROWS().filter((r) => !r.absence_type).map(cellOf),
    { request: 'Mets Léa chez Villa Exemple jeudi et retire Sam du samedi', note: 'Planning appliqué : 2 affectations.' }),
];

// ─── Base simulée AVEC ÉTAT ─────────────────────────────────────────────────────
let D = {}; let MIG = 'oui';
const FAIL = { versions: 0, patch: 0, versionsAlways: false };
const HOOK = { afterVersion: null }; // un événement qui survient PENDANT le retour (une fois)
const log = []; // chaque requête de données : { n, m, t, origin, body, q }
let VSEQ = 0;
const fresh = () => {
  VSEQ = 0;
  D = {
    users: USERS.map((x) => ({ ...x })), companies: [{ ...COMPANY }], worksites: Object.values(WS).map((x) => ({ ...x })),
    planning: CURRENT_ROWS(), time_entries: ENTRIES(), active_sessions: LIVE(), month_closures: [{ company_id: CO, month: '2026-09-01' }],
    planning_versions: VERSIONS(), traces: [],
    documents: [], leave_requests: [], invitations: [], user_closures: [], certifications: [], push_subscriptions: [], kiosks: [], kiosk_settings: [], worksite_expenses: [], user_payroll: [],
    assistant_journal: [], day_tasks: [], meetings: [], meeting_participants: [], trainings: [], training_views: [],
  };
  log.length = 0; FAIL.versions = 0; FAIL.patch = 0; FAIL.versionsAlways = false; HOOK.afterVersion = null;
};
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or']);
function filterRows(rows, params) {
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
}
const sortRows = (rows, order) => {
  if (!order) return rows;
  const keys = order.split(',').map((o) => { const [k, dir] = o.split('.'); return { k, desc: dir === 'desc' }; });
  const val = (x) => (typeof x === 'number' ? String(x).padStart(12, '0') : String(x ?? ''));
  return [...rows].sort((a, z) => { for (const { k, desc } of keys) { const x = val(a[k]); const y = val(z[k]); if (x !== y) return (x < y ? -1 : 1) * (desc ? -1 : 1); } return 0; });
};
const isMonday = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay() === 1;
const chars = (s) => Array.from(String(s)).length;
/** Les CHECK du SQL (supabase/migrations/20261012100000_lot8_versions_planning.sql), rejoués. */
function checkVersion(v) {
  if (!isMonday(v.week_start)) return 'planning_versions_lundi';
  if (!['initial', 'assistant', 'manuel', 'avant_assistant', 'avant_retour'].includes(v.kind)) return 'planning_versions_kind';
  if (v.request != null && (v.kind !== 'assistant' || chars(v.request) > 500)) return 'planning_versions_request';
  if (v.note != null && chars(v.note) > 200) return 'planning_versions_note';
  if (!Array.isArray(v.cells) || v.cells.length > 2000) return 'planning_versions_cells';
  if ((v.user_ids || []).length > 1000) return 'planning_versions_users';
  if (v.company_id !== CO) return 'rls';
  return null;
}
const sessionOf = (uid) => {
  const now = Math.floor(NOW.getTime() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', exp: now + 864000, aal: 'aal1' })}.sig`;
  return { access_token: jwt, refresh_token: 'r', expires_at: now + 864000, expires_in: 864000, token_type: 'bearer', user: { id: uid, email: `${uid}@exemple.fr`, aud: 'authenticated', role: 'authenticated' } };
};
const session = sessionOf(ADMIN);
let REPLY = null; // la réponse de la fonction « assistant »
const missing = (t) => ({ status: 404, json: { code: 'PGRST205', message: `Could not find the table 'public.${t}' in the schema cache`, details: null, hint: null } });

const newCtx = async (viewport) => {
  const ctx = await b.newContext({ viewport, locale: 'fr-FR', timezoneId: 'Europe/Paris', reducedMotion: 'reduce', ...(viewport.width < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  await ctx.clock.setFixedTime(NOW);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.route((url) => url.hostname !== 'localhost' && !url.hostname.endsWith('.supabase.co'), (r) => r.abort());
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url()); const m = r.request().method(); const h = r.request().headers();
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/assistant')) return r.fulfill({ json: REPLY || { answer: '…', links: [], remaining: 40 } });
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
    if (!url.pathname.startsWith('/rest/v1/')) return r.fulfill({ json: {} });
    const t = url.pathname.replace('/rest/v1/', '');
    let body = null; try { body = JSON.parse(r.request().postData() || 'null'); } catch { body = null; }
    const entry = { n: log.length, m, t, origin: h['x-bemexo-origine'] || null, body, q: url.search };
    log.push(entry);
    if (t === 'planning_versions' && MIG !== 'oui') return r.fulfill(missing(t));
    if (t === 'traces' && MIG !== 'oui') return r.fulfill(missing(t));
    D[t] = D[t] || [];
    const wantOne = (h['accept'] || '').includes('vnd.pgrst.object');
    const reply = (rows, status = 200) => (wantOne ? (rows.length === 1 ? r.fulfill({ status, json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'The result contains 0 rows' } })) : r.fulfill({ status, json: rows }));
    if (m === 'GET' || m === 'HEAD') {
      let rows = filterRows(D[t], url.searchParams);
      rows = sortRows(rows, url.searchParams.get('order'));
      const sel = url.searchParams.get('select') || '*';
      if (t === 'planning') rows = rows.map((x) => ({ ...x, ...(sel.includes('worksite:worksites') ? { worksite: x.worksite_id ? WS[x.worksite_id] || null : null } : {}), ...(sel.includes('user:users') ? { user: D.users.find((y) => y.id === x.user_id) || null } : {}) }));
      const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
      const total = rows.length; rows = rows.slice(off, lim ? off + Number(lim) : undefined);
      if (wantOne) return reply(rows);
      return r.fulfill({ json: rows, headers: { 'content-range': `${off}-${Math.max(off, off + rows.length - 1)}/${total}`, 'access-control-expose-headers': 'content-range', 'access-control-allow-origin': '*' } });
    }
    if (t === 'planning_versions') {
      if (m !== 'POST') return r.fulfill({ status: 403, json: { code: '42501', message: 'permission denied for table planning_versions' } });
      if (FAIL.versionsAlways || FAIL.versions > 0) { if (FAIL.versions > 0) FAIL.versions--; entry.failed = true; return r.fulfill({ status: 500, json: { code: 'XX000', message: 'boum', details: null, hint: null } }); }
      const made = [];
      for (const raw of Array.isArray(body) ? body : [body]) {
        // Colonnes que le SQL autorise à l'ajout : ni id, ni n°, ni auteur, ni date.
        const extra = Object.keys(raw).filter((k) => !['company_id', 'week_start', 'kind', 'request', 'note', 'cells', 'user_ids'].includes(k));
        if (extra.length) return r.fulfill({ status: 403, json: { code: '42501', message: `permission denied for column ${extra[0]}` } });
        const v = { request: null, note: null, cells: [], user_ids: [], ...raw };
        const bad = checkVersion(v);
        if (bad) { entry.failed = bad; return r.fulfill({ status: 400, json: { code: bad === 'rls' ? '42501' : '23514', message: `violates ${bad}` } }); }
        const n = Math.max(0, ...D.planning_versions.filter((x) => x.company_id === v.company_id && x.week_start === v.week_start).map((x) => x.number)) + 1;
        const saved = { id: `v-new-${++VSEQ}`, ...v, number: n, created_by: ADMIN, created_at: new Date(NOW.getTime() + VSEQ * 60000).toISOString() };
        D.planning_versions.push(saved); made.push(saved);
        if (HOOK.afterVersion) { const h = HOOK.afterVersion; HOOK.afterVersion = null; h(saved); }
      }
      return reply(made, 201);
    }
    if (m === 'POST') {
      const arr = Array.isArray(body) ? body : [body];
      const merge = (h['prefer'] || '').includes('merge-duplicates');
      const made = [];
      if (!merge && arr.some((x) => x.id && D[t].some((y) => y.id === x.id))) return r.fulfill({ status: 409, json: { code: '23505', message: 'duplicate key value violates unique constraint' } });
      for (const x of arr) {
        const i = x.id ? D[t].findIndex((y) => y.id === x.id) : -1;
        const full = { id: x.id || `${t}-new-${log.length}-${made.length}`, created_at: NOW.toISOString(), ...x };
        if (i >= 0) D[t][i] = { ...D[t][i], ...full }; else D[t].push(full);
        made.push(full);
      }
      return reply(made, 201);
    }
    if (m === 'PATCH') {
      if (t === 'planning' && FAIL.patch > 0) { FAIL.patch--; entry.failed = true; return r.fulfill({ status: 500, json: { code: 'XX000', message: 'écriture refusée', details: null, hint: null } }); }
      const hit = filterRows(D[t], url.searchParams);
      for (const x of hit) Object.assign(x, body);
      return reply(hit);
    }
    if (m === 'DELETE') {
      const hit = filterRows(D[t], url.searchParams);
      // La base refuse d'effacer une case qui porte des heures (clé étrangère) — comme en production.
      if (t === 'planning' && hit.some((p) => D.time_entries.some((e) => e.planning_id === p.id && e.status !== 'cancelled'))) {
        entry.failed = 'fk'; return r.fulfill({ status: 409, json: { code: '23503', message: 'violates foreign key constraint' } });
      }
      D[t] = D[t].filter((x) => !hit.includes(x));
      entry.deleted = hit.map((x) => x.id);
      return reply(hit);
    }
    return r.fulfill({ json: [] });
  });
  return ctx;
};

let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const section = (t) => console.log(`\n═══ ${t}`);
const shot = (name) => path.join(SH, `${name}.png`);
let ctx = null;
const open = async (viewport = { width: 1280, height: 900 }) => {
  if (ctx) await ctx.close().catch(() => {});
  ctx = await newCtx(viewport);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('   [erreur page]', e.message));
  await p.goto(`http://localhost:${PORT}/admin`);
  await p.waitForTimeout(2600);
  return p;
};
const snapPlanning = () => JSON.stringify(D.planning.filter((p) => !p.absence_type).map((p) => [p.id, p.user_id, p.work_date, p.worksite_id, p.estimated_start, p.estimated_end, p.notes]).sort());
const snapHours = () => JSON.stringify({ te: D.time_entries, live: D.active_sessions });
const writes = (from = 0) => log.slice(from).filter((x) => x.m !== 'GET' && x.m !== 'HEAD');
const planWrites = (from = 0) => writes(from).filter((x) => x.t === 'planning');
const verWrites = (from = 0) => writes(from).filter((x) => x.t === 'planning_versions' && !x.failed);
const dlg = (p) => p.locator('[data-testid=versions-dialog]');
const openVersions = async (p) => {
  await p.click('[data-testid="corner-versions"]');
  await p.waitForSelector('[data-testid=versions-list], [data-testid=versions-empty]', { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(200);
};
const itemOf = (p, n) => dlg(p).locator('[data-testid=versions-item]').filter({ hasText: new RegExp(`^V${n} ·`) });
const waitResult = (p) => p.waitForSelector('[data-testid=versions-result]', { timeout: 15000 }).catch(() => {});
const resultText = async (p) => (await dlg(p).locator('[data-testid=versions-result]').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
const noHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && [...document.querySelectorAll('[data-testid=versions-dialog]')].every((d) => d.scrollWidth <= d.clientWidth + 1));

// ═══ N · SANS la migration ═══════════════════════════════════════════════════════
section('N1 · sans la migration, bureau : aucune entrée, une seule lecture, aucune écriture');
{
  fresh(); MIG = 'non';
  const p = await open();
  check(await p.locator('[data-testid="corner-versions"]').count() === 0, 'N1 aucune entrée « Versions » dans la barre du planning');
  await p.waitForTimeout(800);
  const reads = log.filter((x) => x.t === 'planning_versions');
  check(reads.length === 1 && reads[0].m === 'GET', `N1 UNE seule lecture de planning_versions, jamais redemandée (${reads.length})`);
  check(writes().length === 0, `N1 aucune écriture (${writes().length})`);
  await p.screenshot({ path: shot('N1-sans-migration-ordinateur') });
}
section('N2 · sans la migration, téléphone : rien dans le menu ☰');
{
  fresh(); MIG = 'non';
  const p = await open({ width: 390, height: 844 });
  await p.click('button[aria-label="Menu"]');
  await p.waitForTimeout(500);
  check(await p.locator('[data-testid="mm-versions"]').count() === 0, 'N2 pas d’entrée « Versions » dans le menu du téléphone');
  check(log.filter((x) => x.t === 'planning_versions').length === 1, 'N2 toujours une seule lecture de la table');
  await p.screenshot({ path: shot('N2-sans-migration-telephone') });
}
section('N3 · sans la migration, l’assistant applique un planning comme avant');
{
  fresh(); MIG = 'non'; D.planning = [];
  const p = await open();
  REPLY = { answer: '', links: [], remaining: 40, action: { draft: { type: 'planning_semaine', semaine_du: NEXT, lignes: [{ user_id: SAM, date: NEXT, worksite_id: 'w1' }, { user_id: ALEX, date: NEXT, worksite_id: 'w2' }], notes: [] }, problems: [], summary: '', question: null },
    options: { salaries: [{ id: SAM, nom: 'Sam Test' }, { id: ALEX, nom: 'Alex Exemple' }], chantiers: [{ id: 'w1', nom: 'Villa Exemple', ville: 'Lyon' }, { id: 'w2', nom: 'Résidence Test', ville: 'Bron' }] } };
  await p.click('[data-testid="bar-assistant"]'); await p.waitForTimeout(400);
  await p.fill('.as-bar textarea', 'Fais le planning de la semaine prochaine');
  await p.click('button[aria-label="Envoyer"]');
  await p.waitForSelector('[data-testid=action-confirm]', { timeout: 10000 }).catch(() => {});
  const n = log.length;
  await p.click('[data-testid=action-confirm]');
  await p.waitForSelector('[data-testid=action-done]', { timeout: 10000 }).catch(() => {});
  check(D.planning.length === 2, `N3 les 2 cases sont posées (${D.planning.length})`);
  check(log.slice(n).filter((x) => x.t === 'planning_versions').length === 0, 'N3 aucune requête vers planning_versions pendant l’action');
  check(await p.locator('[data-testid=action-versions]').count() === 0, 'N3 pas de lien « Versions de la semaine »');
  check(!/version/i.test(await p.locator('[data-testid=action-done]').innerText().catch(() => '')), 'N3 la carte ne parle pas de versions');
}

// ═══ W · AVEC la migration ═══════════════════════════════════════════════════════
MIG = 'oui';
section('W1 · la liste des versions');
{
  fresh();
  const p = await open();
  check(await p.locator('[data-testid="corner-versions"]').count() === 1, 'W1 l’entrée « Versions » est dans le coin de la grille du planning');
  const rects = await p.evaluate(() => { const r = (q) => { const e = document.querySelector(q); const b = e?.getBoundingClientRect(); return b ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null; };
    return { btn: r('[data-testid="corner-versions"]'), sal: r('.bt-pl-corner-sal'), wk: r('.bt-pl-corner-wk'), cell: r('.bt-pl-th-name') }; });
  const hit = (a, z) => !(a.r <= z.l || z.r <= a.l || a.b <= z.t || z.b <= a.t);
  check(rects.btn && !hit(rects.btn, rects.sal) && !hit(rects.btn, rects.wk) && rects.btn.r <= rects.cell.r && rects.btn.b <= rects.cell.b && rects.btn.l >= rects.cell.l && rects.btn.t >= rects.cell.t,
    `W1 le bouton ne recouvre ni « Salarié » ni « S-40 » et reste dans le coin ${JSON.stringify(rects.btn)}`);
  check(await p.locator('[data-testid="corner-versions"]').getAttribute('aria-label') === 'Versions du planning de cette semaine', 'W1 nom accessible : « Versions du planning de cette semaine »');
  await p.screenshot({ path: shot('W1-planning-entree-versions') });
  await openVersions(p);
  const items = dlg(p).locator('[data-testid=versions-item]');
  check(await items.count() === 3, `W1 trois versions (${await items.count()})`);
  const titles = (await items.locator('.bt-pv-title').allInnerTexts()).map((x) => x.trim());
  check(JSON.stringify(titles) === JSON.stringify(['V3 · Essai de l’assistant', 'V2 · Essai de l’assistant', 'V1 · Initiale']), `W1 la plus récente d’abord : ${titles.join(' | ')}`);
  const v1 = await itemOf(p, 1).innerText({ timeout: 4000 }).catch(() => '');
  const v2 = await itemOf(p, 2).innerText({ timeout: 4000 }).catch(() => '');
  check(/28\/09 à 07:30/.test(v1), 'W1 V1 : date et heure de Paris (28/09 à 07:30, pour 05:30 UTC)');
  check(/par\s+Paula Bureau/.test(v1) && /7 cases · 4 salariés/.test(v1), 'W1 V1 : l’auteur et la taille (7 cases · 4 salariés)');
  check(await itemOf(p, 1).locator('[data-testid=versions-request]').count() === 0, 'W1 V1 « initiale » : pas de demande');
  check(/29\/09 à 11:10/.test(v2), 'W1 V2 : 29/09 à 11:10 (Paris, pour 09:10 UTC)');
  check(/Fais le planning de la semaine du 28 septembre comme la semaine dernière/.test(v2), 'W1 V2 : la demande est affichée');
  check(/Planning appliqué : 5 affectations\./.test(v2), 'W1 V2 : ce que l’assistant a fait');
  check(/Mets Léa chez Villa Exemple jeudi/.test(await itemOf(p, 3).innerText({ timeout: 4000 }).catch(() => '')), 'W1 V3 : sa demande');
  check(await dlg(p).locator('[data-testid=versions-keep]').count() === 1, 'W1 « Garder cette version » est là');
  check(/Réservé au bureau/.test(await dlg(p).innerText({ timeout: 4000 }).catch(() => '')) && /gardées 12 mois/.test(await dlg(p).innerText({ timeout: 4000 }).catch(() => '')), 'W1 le texte dit : bureau seulement, demandes gardées 12 mois');
  check(await noHScroll(p), 'W1 pas de défilement horizontal');
  check(writes().length === 0, 'W1 ouvrir la liste n’écrit rien');
  await dlg(p).screenshot({ path: shot('W1-liste-des-versions') });
}

section('W2-W5 · voir, confirmer, revenir, annuler');
{
  fresh();
  const p = await open();
  await openVersions(p);
  const before = snapPlanning(); const hoursBefore = snapHours();
  await itemOf(p, 1).locator('[data-testid=versions-view]').click();
  await p.waitForSelector('[data-testid=versions-summary]', { timeout: 8000 }).catch(() => {});
  const sum = (await dlg(p).locator('[data-testid=versions-summary]').innerText({ timeout: 4000 }).catch(() => '')).replace(/\s+/g, ' ');
  check(/^Revenir à la V1 : 1 case remise, 1 retirée, 2 modifiées, 3 gardées \(.+\), 2 non remises \(.+\)\.$/.test(sum), `W2 l’aperçu en clair : ${sum}`);
  const prev = (await dlg(p).locator('[data-testid=versions-preview]').innerText({ timeout: 4000 }).catch(() => '')).replace(/\s+/g, ' ');
  check(/heures déjà notées par le salarié/.test(sum) && /pointage en cours/.test(sum) && /mois clôturé/.test(sum), 'W2 gardées : heures, pointage en cours, mois clôturé');
  check(/non remises \(.*mois clôturé.*\)/.test(sum) && /chantier supprimé/.test(sum), 'W2 non remises : mois clôturé, chantier supprimé');
  check(/Remises\s+Sam Test · ven\. 02\/10 · Résidence Test/i.test(prev), 'W2 « Remises » : la case de Sam du vendredi');
  check(/Retirées\s+Sam Test · sam\. 03\/10/i.test(prev), 'W2 « Retirées » : la case libre de Sam du samedi');
  check(/Modifiées/i.test(prev) && /dim\. 04\/10.*→.*sam\. 03\/10/.test(prev) && /Apporter l’échelle.*→/.test(prev), 'W2 « Modifiées » : Chloé dimanche → samedi ; Alex perd sa note');
  check(/Gardées comme maintenant[\s\S]*Léa Démo · jeu\. 01\/10[\s\S]*heures déjà notées/i.test(prev) && /Alex Exemple · ven\. 02\/10[\s\S]*pointage en cours/.test(prev) && /Alex Exemple · mar\. 29\/09[\s\S]*mois clôturé/.test(prev), 'W2 « Gardées » : chaque case avec sa raison');
  check(/Non remises[\s\S]*Léa Démo · mer\. 30\/09[\s\S]*mois clôturé/i.test(prev) && /Alex Exemple · dim\. 04\/10[\s\S]*chantier supprimé/.test(prev), 'W2 « Non remises » : chaque case avec sa raison');
  check(/Le planning actuel est d’abord gardé comme nouvelle version/.test(prev), 'W2 l’aperçu dit que l’état actuel est gardé d’abord');
  check(writes().length === 0 && snapPlanning() === before, 'W2/W3 AUCUNE écriture tant qu’on n’a pas confirmé, le planning est intact');
  await dlg(p).screenshot({ path: shot('W2-apercu-avant-retour') });
  check(await dlg(p).locator('[data-testid=versions-confirm]').count() === 1, 'W3 un bouton de confirmation « Revenir à la V1 » après l’aperçu');
  check(/^Revenir à la V1/.test((await dlg(p).locator('[data-testid=versions-confirm]').innerText({ timeout: 4000 }).catch(() => '')).trim()), 'W3 le bouton porte le numéro de la version');
  // « Garder comme maintenant » referme l'aperçu sans rien faire.
  await dlg(p).locator('[data-testid=versions-cancel]').click();
  check(await dlg(p).locator('[data-testid=versions-preview]').count() === 0 && writes().length === 0, 'W3 « Garder comme maintenant » : rien n’est fait');
  // « Revenir à cette version » directement : aperçu + confirmation, rien n’est écrit.
  await itemOf(p, 1).locator('[data-testid=versions-restore]').click();
  await p.waitForSelector('[data-testid=versions-confirm]', { timeout: 8000 }).catch(() => {});
  check(writes().length === 0, 'W3 « Revenir à cette version » ouvre l’aperçu et la confirmation, sans rien écrire');
  const n0 = log.length;
  await dlg(p).locator('[data-testid=versions-confirm]').click();
  await waitResult(p);
  const res = await resultText(p);
  check(/^Revenu à la V1 : 1 case remise, 1 retirée, 2 modifiées, 3 gardées \(.+\), 2 non remises \(.+\)\./.test(res), `W4 le message final : ${res}`);
  const w = writes(n0).filter((x) => !(x.t === 'traces'));
  const firstPlan = w.findIndex((x) => x.t === 'planning' || x.t === 'time_entries');
  const firstVer = w.findIndex((x) => x.t === 'planning_versions');
  check(firstVer === 0 && firstPlan > firstVer, `W4 l’état actuel est gardé EN PREMIER (écriture n°${firstVer + 1} = version, planning à partir de la n°${firstPlan + 1})`);
  const saved = D.planning_versions.find((v) => v.number === 4);
  check(saved?.kind === 'avant_retour' && /Avant le retour à la V1/.test(saved?.note || '') && saved.cells.length === 8 && saved.request === null, 'W4 la V4 « avant retour » garde les 8 cases d’avant, sans demande');
  check(JSON.stringify(saved?.cells.map((c) => c.id).sort()) === JSON.stringify(['a1', 'a3', 'a5', 'a6', 'x1', 'x2', 'x3', 'z1']), 'W4 …et ce sont bien les cases d’avant');
  const ids = D.planning.filter((x) => !x.absence_type).map((x) => x.id).sort();
  check(JSON.stringify(ids) === JSON.stringify(['a1', 'a3', 'a4', 'a5', 'a6', 'x2', 'x3', 'z1']), `W4 le planning : a4 remise, x1 retirée ; x2 (heures), x3 (pointage), z1 (mois clôturé) restent (${ids.join(' ')})`);
  const get = (id) => D.planning.find((x) => x.id === id);
  check(get('a5').notes === null && get('a6').work_date === '2026-10-03' && get('a4').user_id === SAM && get('a4').work_date === '2026-10-02' && get('a4').worksite_id === 'w2', 'W4 a5 sans sa note, a6 de retour au samedi, a4 remise avec son identifiant');
  check(!D.planning.some((x) => x.id === 'a2' || x.id === 'a7'), 'W4 a2 (mois clôturé) et a7 (chantier supprimé) ne reviennent pas');
  check(get('a4').created_by === ADMIN, 'W4 a4 revient au nom de celui qui revient en arrière (son auteur d’origine n’existe plus : une clé étrangère ne bloque rien)');
  check(snapHours() === hoursBefore, 'W4 les heures et le pointage en cours ne sont pas touchés (time_entries, active_sessions identiques)');
  check(D.planning.some((x) => x.absence_type === 'conge' && x.id === 'p-conge'), 'W4 les absences ne sont pas touchées');
  const bad = log.filter((x) => x.deleted?.some((id) => ['x2', 'x3', 'z1'].includes(id)));
  check(bad.length === 0 && !log.some((x) => x.failed === 'fk'), 'W4 aucune suppression d’une case gardée n’a même été tentée');
  check(planWrites(n0).every((x) => !x.origin), 'W4 écritures de l’écran : pas d’en-tête « assistant » (traces : origine « écran »)');
  check(await dlg(p).locator('[data-testid=versions-undo]').count() === 1, 'W5 « Annuler » est proposé juste après');
  await p.waitForFunction(() => document.querySelectorAll('[data-testid=versions-item]').length === 4, null, { timeout: 8000 }).catch(() => {});
  check(await dlg(p).locator('[data-testid=versions-item]').count() === 4 && /V4 · Avant le retour à la V1/.test(await dlg(p).innerText({ timeout: 4000 }).catch(() => '')), 'W4 la liste montre la V4 « Avant le retour à la V1 »');
  await dlg(p).screenshot({ path: shot('W4-apres-retour-annuler') });
  await p.waitForTimeout(300);
  // Annuler
  const n1 = log.length;
  await dlg(p).locator('[data-testid=versions-undo]').click();
  await p.waitForFunction(() => /^Annulé/.test(document.querySelector('[data-testid=versions-result]')?.textContent?.trim() || ''), null, { timeout: 15000 }).catch(() => {});
  const undone = await resultText(p);
  check(/^Annulé : /.test(undone), `W5 après Annuler : ${undone}`);
  check(snapPlanning() === before, 'W5 le planning est revenu À L’IDENTIQUE à celui d’avant le retour (mêmes id, jours, chantiers, horaires, notes)');
  check(snapHours() === hoursBefore, 'W5 les heures toujours intactes');
  check(verWrites(n1).length === 1 && D.planning_versions.find((v) => v.number === 5)?.kind === 'avant_retour', 'W5 l’état d’avant l’annulation est gardé aussi (V5)');
  check(await dlg(p).locator('[data-testid=versions-undo]').count() === 0, 'W5 plus de bouton « Annuler » une fois annulé');
  await dlg(p).screenshot({ path: shot('W5-annule') });
}

section('W4b · ce que le retour fait des lignes d’heures d’une case retirée (règle de « Supprimer », lot 2)');
{
  fresh();
  // La case libre x1 porte seulement : un brouillon VIDE (0 minute, jamais envoyé) et une ligne « retirée » par le salarié (avec ses heures).
  D.time_entries.push(
    { id: 'te-vide', company_id: CO, user_id: SAM, work_date: '2026-10-03', worksite_id: 'w2', planning_id: 'x1', status: 'draft', start_time: '08:00:00', end_time: '08:00:00', total_minutes: 0, break_minutes: 0, locked: false, submitted_at: null, exit_forgotten: false },
    { id: 'te-retiree', company_id: CO, user_id: SAM, work_date: '2026-10-03', worksite_id: 'w2', planning_id: 'x1', status: 'cancelled', start_time: '08:00:00', end_time: '12:00:00', total_minutes: 240, break_minutes: 0, locked: false, submitted_at: '2026-10-03T12:00:00Z', exit_forgotten: false });
  const keepRows = JSON.stringify(D.time_entries.filter((e) => !['te-vide', 'te-retiree'].includes(e.id)));
  const retiree = JSON.stringify({ ...D.time_entries.find((e) => e.id === 'te-retiree'), planning_id: null });
  const p = await open();
  await openVersions(p);
  await itemOf(p, 1).locator('[data-testid=versions-restore]').click();
  await p.waitForSelector('[data-testid=versions-confirm]', { timeout: 8000 }).catch(() => {});
  await dlg(p).locator('[data-testid=versions-confirm]').click();
  await waitResult(p);
  check(!D.planning.some((x) => x.id === 'x1'), 'W4b la case x1 est retirée (elle ne portait aucune heure)');
  check(!D.time_entries.some((e) => e.id === 'te-vide'), 'W4b son brouillon VIDE (0 minute) est parti avec elle, comme avec « Supprimer »');
  check(JSON.stringify(D.time_entries.find((e) => e.id === 'te-retiree') ?? null) === retiree, 'W4b la ligne « retirée » garde TOUTES ses heures : seul son lien avec la case est détaché');
  check(JSON.stringify(D.time_entries.filter((e) => !['te-vide', 'te-retiree'].includes(e.id))) === keepRows, 'W4b toutes les autres lignes d’heures sont identiques (aucune heure modifiée ni effacée)');
}

section('W5b · « Annuler » ne part pas seul si le planning a bougé depuis le retour');
{
  fresh();
  const p = await open();
  await openVersions(p);
  await itemOf(p, 1).locator('[data-testid=versions-restore]').click();
  await p.waitForSelector('[data-testid=versions-confirm]', { timeout: 8000 }).catch(() => {});
  await dlg(p).locator('[data-testid=versions-confirm]').click();
  await waitResult(p);
  await p.waitForSelector('[data-testid=versions-undo]', { timeout: 8000 }).catch(() => {});
  // Quelqu'un d'autre pose une case libre ET en retire une, après le retour.
  D.planning.push(row('y1', LEA, '2026-10-03', 'w2'));
  const after = snapPlanning();
  const n0 = log.length;
  await dlg(p).locator('[data-testid=versions-undo]').click();
  await p.waitForFunction(() => /Le planning a changé depuis le retour/.test(document.querySelector('[data-testid=versions-result]')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
  const res = await resultText(p);
  check(/Le planning a changé depuis le retour : rien n’a été changé\. Vérifiez l’aperçu de la V4/.test(res), `W5b le message : ${res}`);
  check(writes(n0).length === 0 && snapPlanning() === after, 'W5b RIEN n’est écrit, le planning est tel quel');
  check(await dlg(p).locator('[data-testid=versions-preview]').count() === 1 && /Revenir à la V4/.test(await dlg(p).locator('[data-testid=versions-summary]').innerText({ timeout: 4000 }).catch(() => '')), 'W5b l’aperçu de la V4 est montré, à confirmer');
  check(/Léa Démo · sam\. 03\/10/.test(await dlg(p).locator('[data-testid=versions-preview]').innerText({ timeout: 4000 }).catch(() => '')), 'W5b … avec la case posée entre-temps parmi celles qui seraient retirées');
  await dlg(p).screenshot({ path: shot('W5b-annuler-planning-change') });
}

section('W6 · l’état actuel ne peut pas être gardé : rien n’est touché');
{
  fresh();
  const p = await open();
  await openVersions(p);
  const before = snapPlanning();
  await itemOf(p, 1).locator('[data-testid=versions-restore]').click();
  await p.waitForSelector('[data-testid=versions-confirm]', { timeout: 8000 }).catch(() => {});
  FAIL.versions = 1;
  const n0 = log.length;
  await dlg(p).locator('[data-testid=versions-confirm]').click();
  await waitResult(p);
  const res = await resultText(p);
  check(/n’a pas pu être gardé : rien n’a été changé/.test(res), `W6 le message : ${res}`);
  check(planWrites(n0).length === 0 && snapPlanning() === before, `W6 AUCUNE écriture sur le planning, planning identique (${planWrites(n0).length})`);
  check(await dlg(p).locator('[data-testid=versions-undo]').count() === 0, 'W6 pas d’« Annuler » : rien n’a changé');
  await dlg(p).screenshot({ path: shot('W6-version-non-gardee-rien-touche') });
}

section('W7 · le planning a bougé entre l’aperçu et le clic');
{
  fresh();
  const p = await open();
  await openVersions(p);
  await itemOf(p, 1).locator('[data-testid=versions-restore]').click();
  await p.waitForSelector('[data-testid=versions-confirm]', { timeout: 8000 }).catch(() => {});
  // Pendant ce temps, quelqu'un pose une case libre.
  D.planning.push(row('x4', CHLOE, '2026-10-02', 'w2'));
  const before = snapPlanning();
  const n0 = log.length;
  await dlg(p).locator('[data-testid=versions-confirm]').click();
  await waitResult(p);
  const res = await resultText(p);
  check(/Le planning a changé depuis l’aperçu : rien n’a été changé/.test(res), `W7 le message : ${res}`);
  check(writes(n0).length === 0 && snapPlanning() === before, 'W7 RIEN n’a été écrit (pas même une version), planning identique');
  const prev = (await dlg(p).locator('[data-testid=versions-preview]').innerText({ timeout: 4000 }).catch(() => '')).replace(/\s+/g, ' ');
  check(/2 retirées/.test(prev) && /Chloé Essai · ven\. 02\/10/.test(prev), 'W7 le nouvel aperçu montre la case de plus (2 retirées)');
  await dlg(p).screenshot({ path: shot('W7-planning-change-nouvel-apercu') });
  await dlg(p).locator('[data-testid=versions-confirm]').click();
  await p.waitForFunction(() => /^Revenu à la V1/.test(document.querySelector('[data-testid=versions-result]')?.textContent?.trim() || ''), null, { timeout: 15000 }).catch(() => {});
  check(!D.planning.some((x) => x.id === 'x4' || x.id === 'x1') && D.planning.some((x) => x.id === 'a4'), 'W7 après avoir confirmé le nouvel aperçu, le retour a lieu');
}

section('W8 · une écriture échoue à mi-chemin');
{
  fresh();
  const p = await open();
  await openVersions(p);
  const before = snapPlanning(); const hoursBefore = snapHours();
  await itemOf(p, 1).locator('[data-testid=versions-restore]').click();
  await p.waitForSelector('[data-testid=versions-confirm]', { timeout: 8000 }).catch(() => {});
  FAIL.patch = 1;
  await dlg(p).locator('[data-testid=versions-confirm]').click();
  await waitResult(p);
  const res = await resultText(p);
  check(/Retour interrompu \(écriture refusée\)\./.test(res) && /Déjà fait : 1 case retirée/.test(res) && /« Annuler » remet le planning d’avant/.test(res), `W8 le message : ${res}`);
  check(await dlg(p).locator('[data-testid=versions-undo]').count() === 1, 'W8 « Annuler » est proposé');
  check(snapPlanning() !== before && !D.planning.some((x) => x.id === 'x1'), 'W8 le planning est à moitié changé (x1 retirée) — et c’est dit');
  await dlg(p).screenshot({ path: shot('W8-retour-interrompu') });
  await dlg(p).locator('[data-testid=versions-undo]').click();
  await p.waitForFunction(() => /^Annulé/.test(document.querySelector('[data-testid=versions-result]')?.textContent?.trim() || ''), null, { timeout: 15000 }).catch(() => {});
  check(snapPlanning() === before && snapHours() === hoursBefore, 'W8 « Annuler » : le planning d’avant, à l’identique ; heures intactes');
}

section('W8b · un pointage démarre pendant le retour');
{
  fresh();
  const p = await open();
  await openVersions(p);
  await itemOf(p, 1).locator('[data-testid=versions-restore]').click();
  await p.waitForSelector('[data-testid=versions-confirm]', { timeout: 8000 }).catch(() => {});
  // Sam pointe sur la case x1 (celle qui allait être retirée) PENDANT que l'état actuel est gardé.
  HOOK.afterVersion = () => D.active_sessions.push({ user_id: SAM, company_id: CO, worksite_id: 'w2', planning_id: 'x1', work_date: '2026-10-03', started_at: '2026-10-01T07:50:00Z', positions: [] });
  await dlg(p).locator('[data-testid=versions-confirm]').click();
  await waitResult(p);
  const res = await resultText(p);
  check(/^Revenu à la V1 : 1 case remise, 2 modifiées, 4 gardées \(.*pointage en cours.*\)/.test(res), `W8b le message : ${res}`);
  check(D.planning.some((x) => x.id === 'x1') && !log.some((x) => x.deleted?.includes('x1')), 'W8b la case x1 n’est PAS retirée : le pointage qui vient de démarrer la garde (relu juste avant d’écrire)');
  check(D.planning.some((x) => x.id === 'a4') && D.planning.find((x) => x.id === 'a5').notes === null, 'W8b le reste du retour a bien eu lieu');
}

section('W9 · double clic sur « Revenir »');
{
  fresh();
  const p = await open();
  await openVersions(p);
  await itemOf(p, 1).locator('[data-testid=versions-restore]').click();
  await p.waitForSelector('[data-testid=versions-confirm]', { timeout: 8000 }).catch(() => {});
  const n0 = log.length;
  await p.evaluate(() => { const b = document.querySelector('[data-testid=versions-confirm]'); b.click(); b.click(); });
  await waitResult(p);
  await p.waitForTimeout(600);
  check(verWrites(n0).length === 1, `W9 une seule version « avant retour » écrite (${verWrites(n0).length})`);
  check(D.planning_versions.filter((v) => v.kind === 'avant_retour').length === 1, 'W9 une seule V4');
  check(planWrites(n0).filter((x) => x.m === 'DELETE').length === 1, 'W9 une seule suppression de cases');
  check(/^Revenu à la V1/.test(await resultText(p)), 'W9 le retour s’est fait une fois');
}

section('W10 · « Garder cette version », puis rien à changer');
{
  fresh();
  const p = await open();
  await openVersions(p);
  await dlg(p).locator('[data-testid=versions-keep]').click();
  await p.waitForSelector('[data-testid=versions-result]', { timeout: 8000 }).catch(() => {});
  check(/Version gardée : V4\./.test(await resultText(p)), `W10 « ${await resultText(p)} »`);
  const v4 = D.planning_versions.find((v) => v.number === 4);
  check(v4?.kind === 'manuel' && v4.request === null && v4.cells.length === 8, 'W10 V4 « manuel », sans demande, 8 cases (copie des cases de travail, pas des absences)');
  check(/V4 · Gardée/.test(await dlg(p).innerText({ timeout: 4000 }).catch(() => '')), 'W10 la liste montre « V4 · Gardée »');
  const n0 = log.length;
  await itemOf(p, 4).locator('[data-testid=versions-view]').click();
  await p.waitForSelector('[data-testid=versions-summary]', { timeout: 8000 }).catch(() => {});
  const s = (await dlg(p).locator('[data-testid=versions-summary]').innerText({ timeout: 4000 }).catch(() => '')).replace(/\s+/g, ' ');
  check(/^Rien à changer : le planning est déjà comme cette version\.$/.test(s), `W10 « ${s} »`);
  check(await dlg(p).locator('[data-testid=versions-confirm]').count() === 0, 'W10 pas de bouton « Revenir » quand il n’y a rien à changer');
  check(writes(n0).length === 0, 'W10 rien n’est écrit');
  await dlg(p).screenshot({ path: shot('W10-rien-a-changer') });
}

section('W11 · téléphone');
{
  fresh();
  const p = await open({ width: 390, height: 844 });
  await p.click('button[aria-label="Menu"]');
  await p.waitForSelector('[data-testid="mm-versions"]', { timeout: 5000 }).catch(() => {});
  check(await p.locator('[data-testid="mm-versions"]').count() === 1, 'W11 « Versions du planning (semaine affichée) » est dans le menu ☰');
  await p.screenshot({ path: shot('W11-menu-telephone') });
  await p.click('[data-testid="mm-versions"]');
  await p.waitForSelector('[data-testid=versions-list]', { timeout: 8000 }).catch(() => {});
  check(await dlg(p).locator('[data-testid=versions-item]').count() === 3, 'W11 la même liste');
  check(await noHScroll(p), 'W11 aucun défilement horizontal');
  await itemOf(p, 1).locator('[data-testid=versions-restore]').click();
  await p.waitForSelector('[data-testid=versions-confirm]', { timeout: 8000 }).catch(() => {});
  check(await noHScroll(p), 'W11 aperçu : aucun défilement horizontal');
  await p.screenshot({ path: shot('W11-apercu-telephone') });
}

section('W12 · grande semaine');
{
  fresh();
  // Plus de 1000 lignes dans la semaine (le serveur n'en rend que 1000 par lecture) : des salariés qui ne s'affichent pas.
  for (let i = 0; i < 2001; i++) D.planning.push(row(`g${i}`, `u-g${i % 80}`, `2026-10-0${1 + (i % 3)}`, 'w1', null, null));
  const p = await open();
  await openVersions(p);
  await dlg(p).locator('[data-testid=versions-keep]').click();
  await waitResult(p);
  const res = await resultText(p);
  check(/Version non gardée : Trop de cases pour une version \(2009, 2000 au plus\)\./.test(res), `W12 plus de 2000 cases : refusé, dit clairement (${res})`);
  check(verWrites().length === 0, 'W12 rien d’écrit');
  const pages = log.filter((x) => x.t === 'planning' && x.m === 'GET' && /offset=/.test(x.q) && /limit=1000/.test(x.q));
  check(pages.length >= 3, `W12 la semaine est lue page par page (${pages.length} pages de 1000)`);
  D.planning.splice(D.planning.findIndex((x) => x.id === 'g0'), 9); // 2009 - 9 = 2000 cases : tout juste
  await dlg(p).locator('[data-testid=versions-keep]').click();
  await p.waitForFunction(() => /Version gardée/.test(document.querySelector('[data-testid=versions-result]')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
  const v = D.planning_versions.find((x) => x.number === 4);
  check(/Version gardée : V4\./.test(await resultText(p)) && v?.cells.length === D.planning.filter((x) => !x.absence_type).length && v.cells.length <= 2000, `W12 ${v?.cells.length} cases gardées (2000 au plus), toutes les pages lues`);
}

// ═══ A · L'assistant ═════════════════════════════════════════════════════════════
const OPTIONS = { salaries: [{ id: SAM, nom: 'Sam Test' }, { id: ALEX, nom: 'Alex Exemple' }, { id: LEA, nom: 'Léa Démo' }], chantiers: [{ id: 'w1', nom: 'Villa Exemple', ville: 'Lyon' }, { id: 'w2', nom: 'Résidence Test', ville: 'Bron' }] };
const ask = async (p, text, action) => {
  REPLY = { answer: '', links: [], remaining: 40, action: { ...action, summary: '', question: null }, options: OPTIONS };
  await p.fill('.as-bar textarea', text);
  await p.click('button[aria-label="Envoyer"]');
  await p.waitForSelector('[data-testid=action-confirm]', { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(500);
};
const openAssistant = async (p) => { await p.click('[data-testid="bar-assistant"]'); await p.waitForTimeout(400); };
const semaine = () => ({ draft: { type: 'planning_semaine', semaine_du: NEXT, lignes: [{ user_id: SAM, date: NEXT, worksite_id: 'w1' }, { user_id: ALEX, date: NEXT, worksite_id: 'w2' }], notes: [] }, problems: [] });
const vOf = (week) => D.planning_versions.filter((v) => v.week_start === week).sort((a, z) => a.number - z.number);

section('A1 · « Fais le planning de la semaine prochaine » : V1 avant, l’essai après');
{
  fresh(); D.planning_versions = []; D.planning = []; D.time_entries = []; D.active_sessions = [];
  const p = await open();
  await openAssistant(p);
  const req = 'Fais le planning de la semaine prochaine';
  await ask(p, req, semaine());
  const n0 = log.length;
  await p.click('[data-testid=action-confirm]');
  await p.waitForSelector('[data-testid=action-done]', { timeout: 10000 }).catch(() => {});
  const w = writes(n0).filter((x) => x.t === 'planning' || x.t === 'planning_versions');
  const seq = w.map((x) => (x.t === 'planning_versions' ? `V:${x.body?.kind}` : 'P')).join(' ');
  check(/^V:initial P P V:assistant$/.test(seq), `A1 l’ordre des écritures : ${seq}`);
  const vs = vOf(NEXT);
  check(vs.length === 2 && vs[0].number === 1 && vs[0].kind === 'initial' && vs[0].cells.length === 0, 'A1 V1 « initiale » : la semaine telle qu’elle était avant (vide)');
  check(vs[1].number === 2 && vs[1].kind === 'assistant' && vs[1].cells.length === 2 && vs[1].request === req && /Planning appliqué : 2 affectations/.test(vs[1].note), 'A1 V2 « essai » : les 2 cases, la demande, ce qui a été fait');
  check(w.every((x) => x.origin === 'assistant'), 'A1 toutes ces écritures portent « x-bemexo-origine: assistant » (traces : origine « assistant »)');
  check(await p.locator('[data-testid=action-versions]').count() === 1, 'A1 la carte « Fait » propose « Versions de la semaine »');
  await p.screenshot({ path: shot('A1-carte-fait-lien-versions') });
  await p.click('[data-testid=action-versions]');
  await p.waitForSelector('[data-testid=versions-list]', { timeout: 8000 }).catch(() => {});
  const titles = (await dlg(p).locator('.bt-pv-title').allInnerTexts()).map((x) => x.trim());
  check(JSON.stringify(titles) === JSON.stringify(['V2 · Essai de l’assistant', 'V1 · Initiale']), `A1 le lien ouvre la liste de la semaine concernée : ${titles.join(' | ')}`);
  check(/semaine du 5 au 11 oct/.test(await dlg(p).innerText({ timeout: 4000 }).catch(() => '')), 'A1 la fenêtre porte la semaine du 5 au 11 octobre');
  check(new RegExp(req).test(await itemOf(p, 2).innerText({ timeout: 4000 }).catch(() => '')), 'A1 V2 affiche la demande');
  await dlg(p).screenshot({ path: shot('A1-versions-de-la-semaine') });
}

section('A2 · demande de plus de 500 caractères');
{
  fresh(); D.planning_versions = []; D.planning = []; D.time_entries = []; D.active_sessions = [];
  const p = await open();
  await openAssistant(p);
  const long = `Fais le planning de la semaine prochaine ${'avec beaucoup de précisions '.repeat(25)}${'😀'.repeat(12)} fin`;
  await ask(p, long, semaine());
  await p.click('[data-testid=action-confirm]');
  await p.waitForSelector('[data-testid=action-done]', { timeout: 10000 }).catch(() => {});
  const v2 = vOf(NEXT)[1];
  check(chars(long) > 500, `A2 la demande fait ${chars(long)} caractères`);
  check(v2 && chars(v2.request) === 500, `A2 la version garde 500 caractères au plus (${v2 ? chars(v2.request) : 'aucune version'})`);
  check(v2 && !/[\uD800-\uDBFF]$/.test(v2.request) && Array.from(v2.request).every((c) => c.length >= 1), 'A2 coupée sur un caractère entier');
  check(!log.some((x) => x.t === 'planning_versions' && x.failed), 'A2 la base (simulée) n’a rien refusé');
  check(!/non gardée/.test(await p.locator('[data-testid=action-done]').innerText().catch(() => '')), 'A2 l’action ne signale aucune version manquante');
}

section('A3 · « Efface le planning de la semaine prochaine », puis revenir');
{
  fresh(); D.planning_versions = []; D.time_entries = []; D.active_sessions = [];
  D.planning = [];
  const mk = (id, uid, d, w) => row(id, uid, `2026-10-0${d}`, w, '08:00:00', '16:30:00');
  [['n1', SAM, 5, 'w1'], ['n2', SAM, 6, 'w1'], ['n3', ALEX, 5, 'w2'], ['n4', ALEX, 7, 'w2'], ['n5', LEA, 6, 'w1'], ['n6', LEA, 8, 'w2']].forEach((a) => D.planning.push(mk(...a)));
  D.planning.find((x) => x.id === 'n2').created_by = LEA; // posée par un autre membre de l'équipe
  D.time_entries = [{ id: 'te-n3', company_id: CO, user_id: ALEX, work_date: '2026-10-05', worksite_id: 'w2', planning_id: 'n3', status: 'submitted', start_time: '08:00:00', end_time: '16:00:00', total_minutes: 480, break_minutes: 0, locked: false, submitted_at: '2026-10-05T17:00:00Z', exit_forgotten: false }];
  const original = snapPlanning();
  const p = await open();
  await openAssistant(p);
  await ask(p, 'Efface le planning de la semaine prochaine', { draft: { type: 'effacer_planning', user_id: null, salarie_texte: '', du: NEXT, au: '2026-10-11' }, problems: [] });
  await p.waitForSelector('[data-testid=removal-notice]', { timeout: 8000 }).catch(() => {});
  check(await p.locator('[data-testid=removal-notice]').count() === 1, 'A3 la carte de confirmation d’abord (lot 1)');
  check(log.filter((x) => x.t === 'planning_versions' && x.m !== 'GET').length === 0 && writes().length === 0, 'A3 rien n’est écrit avant « Effacer », pas même une version');
  const n0 = log.length;
  await p.click('[data-testid=action-confirm]');
  await p.waitForSelector('[data-testid=action-done]', { timeout: 10000 }).catch(() => {});
  const w = writes(n0).filter((x) => x.t === 'planning' || x.t === 'planning_versions');
  const seq = w.map((x) => (x.t === 'planning_versions' ? `V:${x.body?.kind}` : x.m)).join(' ');
  check(/^V:initial DELETE V:assistant$/.test(seq), `A3 l’ordre : version d’avant, effacement, version d’après (${seq})`);
  const vs = vOf(NEXT);
  check(vs[0]?.kind === 'initial' && vs[0].cells.length === 6, 'A3 V1 « initiale » garde les 6 cases d’avant (dont celle qui porte des heures)');
  check(vs[1]?.kind === 'assistant' && vs[1].cells.length === 1 && vs[1].request === 'Efface le planning de la semaine prochaine', 'A3 V2 : la case gardée (heures), avec la demande');
  check(w.every((x) => x.origin === 'assistant'), 'A3 écritures de l’assistant : en-tête « assistant »');
  check(D.planning.length === 1 && D.planning[0].id === 'n3', 'A3 il ne reste que la case avec des heures');
  await p.screenshot({ path: shot('A3-efface-par-assistant') });
  await p.click('[data-testid=action-versions]');
  await p.waitForSelector('[data-testid=versions-list]', { timeout: 8000 }).catch(() => {});
  const n1 = log.length;
  await itemOf(p, 1).locator('[data-testid=versions-restore]').click();
  await p.waitForSelector('[data-testid=versions-confirm]', { timeout: 8000 }).catch(() => {});
  const sum = (await dlg(p).locator('[data-testid=versions-summary]').innerText({ timeout: 4000 }).catch(() => '')).replace(/\s+/g, ' ');
  check(/^Revenir à la V1 : 5 cases remises\.$/.test(sum), `A3 l’aperçu de V1 : ${sum}`);
  await dlg(p).screenshot({ path: shot('A3-revenir-apres-effacement') });
  await dlg(p).locator('[data-testid=versions-confirm]').click();
  await waitResult(p);
  check(/^Revenu à la V1 : 5 cases remises\./.test(await resultText(p)), `A3 le retour : ${await resultText(p)}`);
  check(snapPlanning() === original, 'A3 les 6 cases sont revenues À L’IDENTIQUE (mêmes identifiants, jours, horaires)');
  check(D.planning.find((x) => x.id === 'n2')?.created_by === LEA && D.planning.find((x) => x.id === 'n1')?.created_by === ADMIN, 'A3 l’auteur d’origine de chaque case est gardé quand il existe encore');
  check(writes(n1).filter((x) => x.t === 'planning').every((x) => !x.origin), 'A3 le retour est écrit par l’écran (pas d’en-tête « assistant »)');
  check(vOf(NEXT).some((v) => v.kind === 'avant_retour' && v.cells.length === 1), 'A3 l’état d’avant le retour est gardé (V3)');
}

section('A4 · une version qui ne s’écrit pas n’empêche pas l’action');
{
  fresh(); D.planning_versions = []; D.planning = []; D.time_entries = []; D.active_sessions = [];
  FAIL.versionsAlways = true;
  const p = await open();
  await openAssistant(p);
  await ask(p, 'Fais le planning de la semaine prochaine', semaine());
  await p.click('[data-testid=action-confirm]');
  await p.waitForSelector('[data-testid=action-done]', { timeout: 10000 }).catch(() => {});
  check(D.planning.length === 2, `A4 les 2 cases sont posées malgré tout (${D.planning.length})`);
  const card = (await p.locator('[data-testid=action-done]').innerText({ timeout: 4000 }).catch(() => '')).replace(/\s+/g, ' ');
  check(/version du planning non gardée/.test(card), `A4 le message le dit : ${card.slice(0, 120)}`);
  check(await p.locator('[data-testid=action-undo]').count() === 1, 'A4 « Annuler » reste proposé');
  await p.screenshot({ path: shot('A4-version-non-gardee') });
}

console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close(); process.exit(ko ? 1 : 0);
