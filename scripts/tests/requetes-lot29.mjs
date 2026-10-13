// Lot 29 — « Site rapide 2 » : COMPTER LES REQUÊTES (règle 11 de l'audit plan-ia/analyse-perf.md).
//
// Lancer (après npm run build) :
//   node scripts/tests/requetes-lot29.mjs out docs/captures-lot29 [port]
//
// Vraies pages /admin (1440×900, puis 390 px) et /poseur (390×844), base Supabase SIMULÉE : toute
// ÉCRITURE inattendue fait échouer le test. Chaque requête vers *.supabase.co est comptée DANS LE
// GESTIONNAIRE DE ROUTE (avec son heure de début et de fin) et recoupée avec page.on('request') :
// si les deux comptes divergent, le test échoue (une requête qui échapperait au comptage fausserait
// tous les budgets). Latence simulée : LATENCE ms par réponse, pour que la « chaîne la plus longue »
// (allers-retours successifs) se mesure sans bruit.
// Chiffres d'AVANT le lot (même script, hors profil) : bureau 29, salarié 25, companies ×4 / ×7,
// chaîne 3 / 4, onglet caché 43 / 16 requêtes en ~4 min.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}
const [,, OUT = 'out', SH = 'docs/captures-lot29', PORT = '42311'] = process.argv; fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, `${p}.html`, path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT), r));
const URL0 = `http://localhost:${srv.address().port}`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ─── Budgets (audit : ~31 requêtes bureau, ~25 salarié ; objectif lot 29) ─────────
const BUDGET = { adminMax: 24, poseurMax: 18, chainAfterProfile: 2 };
// Les 13 colonnes lues par le bureau, les 5 lues par le salarié (jamais l'e-mail du comptable côté salarié).
const COLS_OFFICE = 'name,logo_url,travel_paid,weekly_hours,accountant_email,overtime_rate_1,overtime_rate_2,trial_ends_at,subscription_status,ai_enabled,kiosk_enabled,position_tracking_enabled,meal_enabled'.split(',');
const COLS_WORKER = 'travel_paid,ai_enabled,kiosk_enabled,position_tracking_enabled,meal_enabled'.split(',');
const sameCols = (sel, cols) => { const a = sel.split(',').sort(); return a.length === cols.length && [...cols].sort().every((c, i) => c === a[i]); };
const LATENCE = 250; // > étalement des départs (supabase-js prend un verrou de session par requête : ~30 requêtes simultanées partent sur 100-150 ms)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Dates : horloge FIGÉE côté navigateur (mercredi 21 octobre 2026, 10:00, heure de Paris) ──────
const NOW = new Date('2026-10-21T10:00:00+02:00');
const today = '2026-10-21';
const day = (n) => { const x = new Date(`${today}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const ago = (h) => new Date(NOW.getTime() - h * 3600e3).toISOString();

// ─── Base simulée ──────────────────────────────────────────────────────────────
const CO = 'c0000000-0000-0000-0000-000000000001';
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', is_active: true };
const W2 = { id: 'w2', company_id: CO, client_name: 'Maison Garnier', city: 'Vienne', is_active: true };
const AUTRE = { id: 'w-autre', company_id: CO, client_name: 'Autre', city: '', is_active: true };
const u = (id, first, last, role = 'worker') => ({ id, company_id: CO, first_name: first, last_name: last, role, email: `${id}@x.fr`, is_active: true, created_at: '2026-01-01' });
const slot = (id, user_id, work_date, ws, extra = {}) => ({ id, company_id: CO, user_id, worksite_id: ws?.id ?? null, work_date, absence_type: null, estimated_start: '08:00:00', estimated_end: '17:00:00', notes: null, created_at: `${work_date}T06:00:00Z`, worksite: ws ?? null, ...extra });
const entry = (id, user_id, work_date, ws, status, minutes, start = '08:00:00') => ({ id, company_id: CO, user_id, planning_id: null, work_date, worksite_id: ws.id, status, start_time: start, end_time: `${String(Number(start.slice(0, 2)) + minutes / 60).padStart(2, '0')}:00:00`, break_minutes: 0, total_minutes: minutes, meal_allowance: false, locked: false, exported_at: null, gap_before: null, reception: null, reserve_resolved_at: null, observation: null, worksite: ws });
const COMPANY = { id: CO, name: 'Pizzeria Exemple', ai_enabled: true, kiosk_enabled: false, position_tracking_enabled: false, travel_paid: false, meal_enabled: true, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, accountant_email: 'compta@cabinet.fr', overtime_rate_1: 25, overtime_rate_2: 50, logo_url: '' };
const docs = (n) => Array.from({ length: n }, (_, i) => ({ id: `d${i}`, company_id: CO, worksite_id: i % 2 ? 'w1' : 'w2', file_path: `x/${i}.pdf`, created_at: '2026-10-01' }));
const D = {
  users: [u('u-admin', 'Paul', 'Martin', 'admin'), u('u-kevin', 'Kevin', 'Roussel'), u('u-sara', 'Sara', 'Benali'), u('u-marc', 'Marc', 'Durand'), u('u-karim', 'Karim', 'Benali')],
  companies: [{ ...COMPANY }],
  worksites: [W1, W2, AUTRE],
  planning: [slot('pl-sara', 'u-sara', today, W1), slot('pl-kevin', 'u-kevin', today, W1), slot('pk-2', 'u-kevin', day(-2), W1), slot('pl-marc', 'u-marc', today, W2), slot('pl-karim', 'u-karim', today, W1)],
  time_entries: [entry('e1', 'u-sara', today, W1, 'submitted', 60), entry('e-karim', 'u-karim', today, W2, 'draft', 120, '13:00:00')],
  active_sessions: [{ user_id: 'u-kevin', company_id: CO, worksite_id: 'w1', planning_id: 'pl-kevin', work_date: today, started_at: ago(2), positions: [] }],
  documents: docs(3), // 3 lignes : l'ancien fetchAllPaged coûtait 2 requêtes (la 2e « vide »), le nouveau 1
  month_closures: [], leave_requests: [], invitations: [], certifications: [], push_subscriptions: [], kiosks: [], kiosk_settings: [],
  time_entry_corrections: [], time_entry_positions: [], time_entry_edits: [],
};
const MISSING = new Set(); // colonnes « absentes » de la base simulée : toute lecture qui les demande répond 42703
let FAIL_COMPANIES = 0; // nombre de prochaines lectures `companies` qui échouent (réseau mobile : 500)
const resetDb = () => { D.companies = [{ ...COMPANY }]; D.documents = docs(3); MISSING.clear(); FAIL_COMPANIES = 0; };

// ─── Session simulée (profil lu sur `users?id=eq.<ME>`) ─────────────────────────
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sessionFor = (id, email) => {
  const exp = Math.floor(NOW.getTime() / 1000) + 36000;
  return { access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, role: 'authenticated', exp, aal: 'aal1' })}.sig`, refresh_token: 'r', expires_at: exp, expires_in: 36000, token_type: 'bearer', user: { id, email, aud: 'authenticated', role: 'authenticated' } };
};
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const filterRows = (rows, params) => {
  for (const [k, v] of params) {
    if (SKIP.has(k)) continue;
    const dot = v.indexOf('.'); const op = v.slice(0, dot); const val = v.slice(dot + 1);
    rows = rows.filter((x) => {
      if (!(k in x)) return true;
      const cur = x[k];
      if (op === 'eq') return String(cur) === val;
      if (op === 'neq') return String(cur) !== val;
      if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(cur));
      if (op === 'gte') return String(cur) >= val;
      if (op === 'lte') return String(cur) <= val;
      if (op === 'gt') return String(cur) > val;
      if (op === 'is') return val === 'null' ? cur == null : String(cur) === val;
      return true;
    });
  }
  return rows;
};

// ─── Enregistreur : une entrée par requête Supabase ────────────────────────────
// RPC d'ÉCRITURE connues (les autres RPC sont des lectures : company_has_kiosk, my_trainings…).
const WRITE_RPC = new Set(['update_company_info', 'set_meal_enabled', 'set_position_tracking', 'set_colleagues_planning']);
function classify(req) {
  const url = new URL(req.url()); const method = req.method();
  let kind = 'autre'; let name = url.pathname;
  if (url.pathname.startsWith('/auth/v1/')) { kind = 'auth'; name = url.pathname.replace('/auth/v1/', ''); }
  else if (url.pathname.startsWith('/functions/v1/')) { kind = 'fn'; name = url.pathname.replace('/functions/v1/', ''); }
  else if (url.pathname.startsWith('/rest/v1/rpc/')) { kind = 'rpc'; name = url.pathname.replace('/rest/v1/rpc/', ''); }
  else if (url.pathname.startsWith('/rest/v1/')) { kind = 'rest'; name = url.pathname.replace('/rest/v1/', ''); }
  const write = (kind === 'rest' && method !== 'GET' && method !== 'HEAD') || (kind === 'rpc' && WRITE_RPC.has(name)) || kind === 'fn';
  // supabase-js RETIRE les espaces du select (« id, user_id » part « id,user_id ») : on compare sans espaces.
  return { kind, name, method, write, select: (url.searchParams.get('select') || '').replace(/\s+/g, ''), search: url.search, url };
}
function install(ctx, session, who) {
  const rec = { all: [], seen: 0, writes: [], unexpected: [], allow: new Set() };
  ctx.on('request', (req) => { if (/\.supabase\.co\//.test(req.url()) && req.method() !== 'OPTIONS') rec.seen++; });
  return ctx.route('**/*.supabase.co/**', async (r) => {
    const req = r.request(); const e = classify(req);
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204 });
    e.t0 = Date.now(); rec.all.push(e);
    await sleep(LATENCE);
    try { await answer(r, e, session, who, rec); } finally { e.t1 = Date.now(); }
  }).then(() => rec);
}
async function answer(r, e, session, who, rec) {
  const req = r.request(); const url = e.url;
  if (e.kind === 'auth') return r.fulfill({ json: url.pathname.startsWith('/auth/v1/user') ? session.user : {} });
  if (e.kind === 'fn') { rec.writes.push(`fn ${e.name}`); rec.unexpected.push(`fn ${e.name}`); return r.fulfill({ json: {} }); }
  if (e.kind === 'rpc') {
    if (e.write) {
      rec.writes.push(`rpc ${e.name}`);
      if (!rec.allow.has(e.name)) rec.unexpected.push(`rpc ${e.name}`);
      if (e.name === 'update_company_info') { let body = {}; try { body = req.postDataJSON(); } catch { /* corps vide */ } D.companies[0] = { ...D.companies[0], name: body.p_name ?? D.companies[0].name }; }
      return r.fulfill({ json: null, status: 204 });
    }
    return r.fulfill({ json: [] });
  }
  if (e.write) { rec.writes.push(`${e.method} ${e.name}`); rec.unexpected.push(`${e.method} ${e.name}`); return r.fulfill({ status: 201, json: {} }); }
  if (e.name === 'companies' && FAIL_COMPANIES > 0) { FAIL_COMPANIES--; return r.fulfill({ status: 500, json: { message: 'panne simulée' } }); }
  if (e.name === 'companies' && [...MISSING].some((c) => e.select.split(',').includes(c))) {
    return r.fulfill({ status: 400, json: { code: '42703', message: 'column companies does not exist', details: null, hint: null } });
  }
  const all = filterRows(D[e.name] || [], url.searchParams);
  // .range() → offset / limit : indispensable, sinon fetchAllPaged ne sait pas s'arrêter.
  const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : Infinity;
  const rows = all.slice(off, off + lim);
  if ((req.headers()['accept'] || '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
  // `count: exact, head: true` lit content-range : il doit être exposé au navigateur.
  return r.fulfill({ json: e.method === 'HEAD' ? undefined : rows, headers: { 'content-range': `${off}-${Math.max(off, off + rows.length - 1)}/${all.length}`, 'access-control-expose-headers': 'content-range' } });
}

// ─── Mesures ───────────────────────────────────────────────────────────────────
const isData = (e) => e.kind === 'rest' || e.kind === 'rpc' || e.kind === 'fn'; // « requêtes de données » (hors authentification)
const since = (rec, i) => rec.all.slice(i);
const count = (list, f = () => true) => list.filter(f).length;
const byName = (list) => { const m = new Map(); for (const e of list) { const k = `${e.kind === 'rpc' ? 'rpc:' : ''}${e.name}${e.method === 'GET' || e.method === 'HEAD' ? '' : ` ${e.method}`}`; m.set(k, (m.get(k) || 0) + 1); } return [...m].sort((a, c) => c[1] - a[1]).map(([k, n]) => `${k}×${n}`).join(', '); };
const reads = (list, table) => list.filter((e) => e.kind === 'rest' && !e.write && e.name === table);
/** Chaîne la plus longue APRÈS le profil : une requête qui part après la FIN d'une autre est comptée comme son successeur. */
function chain(list, isProfile) {
  const evts = list.filter((e) => isData(e) && e.t1 !== undefined).sort((a, c) => a.t0 - c.t0);
  const prof = evts.find(isProfile);
  const after = prof ? evts.filter((e) => e !== prof && e.t0 >= prof.t1 - 5) : evts;
  const depth = new Map(); let best = null;
  for (const e of after) {
    let d = 1; let prev = null;
    for (const q of after) { if (q === e || q.t1 === undefined || q.t1 > e.t0) continue; const dq = depth.get(q); if (dq && dq + 1 > d) { d = dq + 1; prev = q; } }
    depth.set(e, d); e.prev = prev;
    if (!best || d > depth.get(best)) best = e;
  }
  const path = []; for (let e = best; e; e = e.prev) path.unshift(`${e.kind === 'rpc' ? 'rpc:' : ''}${e.name}`);
  return { depth: best ? depth.get(best) : 0, path, profile: !!prof };
}

let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const setVis = (pg, state) => pg.evaluate((s) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => s === 'hidden' });
  document.dispatchEvent(new Event('visibilitychange', { bubbles: true })); // remonte jusqu'à window (supabase-js y écoute)
  if (s === 'visible') window.dispatchEvent(new Event('focus'));
}, state);
const RESULT = {};

// ─── Aides de scénario ───────────────────────────────────────────────────────────
const EXTRAS = (e) => e.kind === 'rest' && e.name === 'planning' && e.select === 'id,user_id,work_date,absence_type'; // fetchExtras (bureau)
const PENDING = (e) => e.kind === 'rest' && e.name === 'planning' && e.select === 'work_date,absence_type'; // fetchPending (salarié)
/** Onglet caché pendant `ms` (par pas de 65 s : le sondage de 60 s aurait eu le temps de tourner), puis retour. */
async function hiddenFor(p, rec, ms) {
  await setVis(p, 'hidden'); await p.waitForTimeout(300);
  const i = rec.all.length;
  for (let left = ms; left > 0; left -= 65000) { await p.clock.fastForward(Math.min(65000, left)); await p.waitForTimeout(400); }
  const duringHidden = since(rec, i);
  const j = rec.all.length;
  await setVis(p, 'visible'); await p.waitForTimeout(1800);
  return { duringHidden, afterReturn: since(rec, j) };
}

// ═════════════════════════ BUREAU ═════════════════════════
async function adminSession(viewport, label, { missing = [], fail = 0 } = {}) {
  resetDb(); for (const c of missing) MISSING.add(c); FAIL_COMPANIES = fail;
  const session = sessionFor('u-admin', 'paul@exemple.fr');
  const ctx = await b.newContext({ viewport, locale: 'fr-FR', timezoneId: 'Europe/Paris', ...(viewport.width < 600 ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
  await ctx.clock.install({ time: NOW });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  const rec = await install(ctx, session, 'admin');
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('   [erreur page]', e.message));
  await p.goto(`${URL0}/admin`);
  await p.locator('[data-testid=stat-waiting]:visible, .bt-pl-m-card:visible').first().waitFor({ timeout: 20000 });
  await p.waitForTimeout(3000); // laisse partir toutes les requêtes du chargement
  const isProfile = (e) => e.kind === 'rest' && e.name === 'users' && e.search.includes('id=eq.u-admin');
  const list = rec.all.slice();
  const c = chain(list, isProfile);
  // Le profil (`users?id=eq.<moi>`) est relu une 2e fois selon l'ordre des évènements d'authentification
  // (SIGNED_IN après INITIAL_SESSION) : on le compte à part pour garder un budget stable.
  const data = list.filter((e) => isData(e) && !isProfile(e));
  const mesure = { profil: count(list, isProfile), total: data.length, auth: count(list, (e) => e.kind === 'auth'), companies: reads(list, 'companies').length, documents: reads(list, 'documents').length, depth: c.depth, path: c.path.join(' → '), detail: byName(data) };
  console.log(`   ${label} : ${mesure.total} requêtes de données hors profil (profil×${mesure.profil}, +${mesure.auth} d'authentification) · companies×${mesure.companies} · documents×${mesure.documents} · chaîne après profil = ${mesure.depth} (${mesure.path})`);
  console.log(`      ${mesure.detail}`);
  if (process.env.INVENTAIRE) for (const e of data.sort((a, c) => a.t0 - c.t0)) console.log(`      +${String(e.t0 - data[0].t0).padStart(4)} ms ${e.method.padEnd(4)} ${e.kind === 'rpc' ? 'rpc:' : ''}${e.name} ${e.select.slice(0, 70)} ${e.search.replace(/select=[^&]*&?/, '').slice(0, 90)}`);
  check(rec.seen === rec.all.length, `${label} : le comptage par route (${rec.all.length}) = page.on('request') (${rec.seen})`);
  check(mesure.profil <= 2, `${label} : le profil est lu ${mesure.profil} fois (≤ 2, compté à part)`);
  check(rec.unexpected.length === 0, `${label} : aucune écriture au chargement ${rec.unexpected.length ? `[${rec.unexpected}]` : ''}`);
  return { ctx, p, rec, mesure, list };
}

console.log('\n══ BUREAU 1440×900 ══');
{
  const { ctx, p, rec, mesure, list } = await adminSession({ width: 1440, height: 900 }, 'bureau, chargement');
  RESULT.admin = mesure;
  check(mesure.total <= BUDGET.adminMax, `1) bureau : ${mesure.total} requêtes au chargement (budget ≤ ${BUDGET.adminMax}; avant : 29)`);
  check(mesure.depth <= BUDGET.chainAfterProfile, `1) bureau : chaîne la plus longue après le profil = ${mesure.depth} (≤ ${BUDGET.chainAfterProfile}; avant : 3) : ${mesure.path}`);
  check(mesure.companies === 1, `2) bureau : UNE seule lecture de companies au chargement (${mesure.companies}; avant : 4)`);
  const cl = reads(list, 'companies');
  check(cl.length === 1 && sameCols(cl[0].select, COLS_OFFICE), `2) bureau : cette lecture demande exactement les 13 colonnes (${cl[0]?.select})`);
  check(mesure.documents === 1, `7) bureau : fetchAllPaged sur 3 documents = 1 requête (${mesure.documents}; avant : 2, la 2e rendait 0 ligne)`);
  check(count(list, (e) => e.kind === 'rest' && e.name === 'users' && e.method === 'HEAD') === 0, '4) bureau : plus de requête HEAD « nombre de salariés »');
  check((await p.locator('.bt-pl-acct-name').first().innerText()).includes('Pizzeria Exemple'), '   le nom de l’entreprise s’affiche comme avant');

  // 3) onglet caché ~4 min 20 : ZÉRO requête (toutes natures), puis retour : compteurs relus, companies non relu (< 5 min)
  let r = await hiddenFor(p, rec, 4 * 65000);
  check(r.duringHidden.length === 0, `3) bureau caché pendant ~4 min 20 simulées : ${r.duringHidden.length} requête(s) ${r.duringHidden.length ? `[${byName(r.duringHidden)}]` : ''} (avant : 43)`);
  RESULT.adminHidden = r.duringHidden.length;
  check(count(r.afterReturn, EXTRAS) === 1, `4) bureau, retour après 4 min 20 : compteurs relus tout de suite (${count(r.afterReturn, EXTRAS)} lecture)`);
  check(count(r.afterReturn, (e) => e.kind === 'rest' && e.name === 'active_sessions') >= 1, '4) bureau, retour : chronos relus tout de suite');
  check(reads(r.afterReturn, 'companies').length === 0, `4) bureau, retour après 4 min 20 : companies PAS relu (${reads(r.afterReturn, 'companies').length})`);
  console.log(`      retour : ${byName(r.afterReturn)}`);

  // retour rapide (5 s caché) : rien n'est relu (pas de rafale à chaque va-et-vient)
  r = await hiddenFor(p, rec, 5000);
  check(r.duringHidden.length === 0 && count(r.afterReturn, EXTRAS) === 0 && reads(r.afterReturn, 'companies').length === 0,
    `4) bureau, retour après 5 s : ni compteurs ni companies relus (${byName(r.afterReturn) || 'aucune requête de données'})`);

  // 5) onglet visible : le sondage des compteurs continue, `companies` n'est PAS relu
  let i = rec.all.length;
  await p.clock.fastForward(61000); await p.waitForTimeout(1500);
  let l = since(rec, i);
  check(count(l, EXTRAS) >= 1, `5) bureau visible +61 s : le sondage des compteurs tourne encore (${count(l, EXTRAS)} lecture)`);
  check(reads(l, 'companies').length === 0, `5) bureau visible +61 s : companies PAS relu (${reads(l, 'companies').length}; avant : relu à chaque sondage)`);

  // retour après 6 min cachées : UNE relecture des réglages (position, panier… changés ailleurs)
  r = await hiddenFor(p, rec, 6 * 60000);
  check(r.duringHidden.length === 0, `3) bureau caché pendant 6 min : ${r.duringHidden.length} requête(s)`);
  check(reads(r.afterReturn, 'companies').length === 1, `4) bureau, retour après 6 min : UNE relecture de companies (${reads(r.afterReturn, 'companies').length})`);

  // 6) réglages relus UNE fois après « Enregistrer » (la fenêtre de réglages fait ses propres lectures à l'ouverture)
  await p.locator('.bt-pl-acct:visible').first().click();
  await p.locator('button:visible', { hasText: "Réglages de l'entreprise" }).first().click();
  await p.waitForSelector('[role=dialog] .bt-set', { timeout: 10000 });
  await p.waitForFunction(() => !document.querySelector('.bt-set-load'), null, { timeout: 10000 });
  await p.waitForTimeout(500);
  const nom = p.locator('[role=dialog] .bt-set-namewrap input.bt-set-i').first();
  await nom.fill('Pizzeria Renommée');
  rec.allow.add('update_company_info');
  i = rec.all.length;
  const t0 = Date.now();
  await p.locator('[role=dialog] button', { hasText: 'Enregistrer' }).last().click();
  await p.waitForFunction(() => document.querySelector('.bt-pl-acct-name')?.textContent?.includes('Renommée'), null, { timeout: 2000 }).catch(() => {});
  const dt = Date.now() - t0;
  await p.waitForTimeout(1200);
  l = since(rec, i);
  check(rec.writes.includes('rpc update_company_info'), '6) l’enregistrement part bien (update_company_info)');
  check(reads(l, 'companies').length === 1, `6) réglages relus EXACTEMENT une fois après l’enregistrement (${reads(l, 'companies').length} lecture companies; ni onSaved + effet en double)`);
  const nomAffiche = (await p.locator('.bt-pl-acct-name').first().innerText()).trim();
  check(nomAffiche.includes('Renommée') && dt < 2000, `6) le nouveau nom s’affiche tout de suite (${dt} ms) : « ${nomAffiche} » (avant : jusqu’à 60 s)`);
  check(rec.unexpected.length === 0, `6) aucune écriture inattendue (${rec.unexpected})`);
  await ctx.close();
}

console.log('\n══ BUREAU 390 px (mobile) ══');
{
  const { ctx, p, mesure, list } = await adminSession({ width: 390, height: 844 }, 'bureau mobile, chargement');
  RESULT.adminMobile = mesure;
  check(mesure.total <= BUDGET.adminMax, `1) bureau mobile : ${mesure.total} requêtes (≤ ${BUDGET.adminMax}; avant : 29)`);
  check(mesure.depth <= BUDGET.chainAfterProfile, `1) bureau mobile : chaîne après le profil = ${mesure.depth} (≤ ${BUDGET.chainAfterProfile})`);
  check(mesure.companies === 1, `2) bureau mobile : UNE seule lecture de companies (${mesure.companies})`);
  await p.screenshot({ path: path.join(SH, 'bureau-390.png') });
  await ctx.close();
}

// Base simulée dont une colonne manque (migration d'un autre lot pas passée) : le repli lit la ligne par petits groupes
console.log('\n══ BUREAU, colonne absente (repli) ══');
{
  COMPANY.logo_url = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const { ctx, p, rec, list } = await adminSession({ width: 1440, height: 900 }, 'bureau, position absente', { missing: ['position_tracking_enabled'] });
  const cl = reads(list, 'companies');
  check(cl.length === 1 + 6, `   repli : 1 lecture groupée refusée + 6 groupes en parallèle (${cl.length})`);
  check((await p.locator('.bt-pl-acct-name').first().innerText()).includes('Pizzeria Exemple'), '   repli : le nom s’affiche toujours');
  check(await p.locator('img.bt-pl-acct-av-img').first().getAttribute('src').then((s) => (s || '').startsWith('data:image/gif'), () => false), '   repli : le logo s’affiche toujours');
  // le repli est collant : un retour après 6 min relit les 6 groupes, sans retenter la lecture groupée
  const r = await hiddenFor(p, rec, 6 * 60000);
  check(reads(r.afterReturn, 'companies').length === 6, `   repli collant : le retour après 6 min relit 6 groupes, sans nouvelle lecture groupée (${reads(r.afterReturn, 'companies').length})`);
  await ctx.close();
  COMPANY.logo_url = '';
}

// Première lecture des réglages en échec (réseau mobile) : l'écran se répare seul, avec les 13 colonnes
console.log('\n══ BUREAU, première lecture des réglages en échec ══');
{
  // a) onglet visible : un nouvel essai au bout d'une minute, sans rechargement, puis plus rien
  const { ctx, p, rec, list } = await adminSession({ width: 1440, height: 900 }, 'bureau, 1re lecture en échec', { fail: 1 });
  check(reads(list, 'companies').length === 1, `   échec : une seule lecture au chargement, échouée (${reads(list, 'companies').length})`);
  check(!(await p.locator('.bt-pl-acct-name').first().innerText()).includes('Pizzeria Exemple'), '   échec : le nom de l’entreprise n’est pas encore là');
  let i = rec.all.length;
  await p.clock.fastForward(61000); await p.waitForTimeout(1800);
  let cl = reads(since(rec, i), 'companies');
  check(cl.length === 1 && sameCols(cl[0].select, COLS_OFFICE), `   échec : au bout d’une minute, UN nouvel essai avec les 13 colonnes (${cl.length}; ${cl[0]?.select})`);
  check((await p.locator('.bt-pl-acct-name').first().innerText()).includes('Pizzeria Exemple'), '   échec : le nom revient tout seul, sans recharger');
  i = rec.all.length;
  await p.clock.fastForward(61000); await p.waitForTimeout(1500);
  check(reads(since(rec, i), 'companies').length === 0, '   échec : une fois lu, plus aucun nouvel essai');
  await ctx.close();
}
{
  // b) onglet caché pendant l'échec : zéro requête (même pas l'essai) ; au retour, relecture avec les 13 colonnes
  // (une relecture « salarié » à 5 colonnes perdrait l'essai d'abonnement, le nom, le logo, les majorations)
  const { ctx, p, rec } = await adminSession({ width: 1440, height: 900 }, 'bureau, 1re lecture en échec (caché)', { fail: 1 });
  const r = await hiddenFor(p, rec, 4 * 65000);
  check(r.duringHidden.length === 0, `   échec + caché ~4 min : ${r.duringHidden.length} requête(s)`);
  const cl = reads(r.afterReturn, 'companies');
  check(cl.length === 1 && sameCols(cl[0].select, COLS_OFFICE), `   échec + retour d’onglet : relecture avec les 13 colonnes, trial_ends_at compris (${cl.length}; ${cl[0]?.select})`);
  check((await p.locator('.bt-pl-acct-name').first().innerText()).includes('Pizzeria Exemple'), '   échec + retour : le nom revient');
  await ctx.close();
}

// Court passage en arrière-plan : la prochaine lecture garde son échéance (jamais plus d'une minute entre deux lectures)
console.log('\n══ BUREAU, court passage en arrière-plan ══');
{
  const { ctx, p, rec } = await adminSession({ width: 1440, height: 900 }, 'bureau, court passage');
  const r = await hiddenFor(p, rec, 25000);
  check(count(r.afterReturn, EXTRAS) === 0, `   retour après 25 s : pas de rafale (${count(r.afterReturn, EXTRAS)} lecture des compteurs)`);
  const i = rec.all.length;
  await p.clock.fastForward(31000); await p.waitForTimeout(1500);
  check(count(since(rec, i), EXTRAS) >= 1, `   … mais la lecture arrive à son échéance d’avant, pas une minute plus tard (${count(since(rec, i), EXTRAS)} lecture)`);
  await ctx.close();
}

// 7) fetchAllPaged — frontières de pagination (documents : 500 pile, 501, 1203)
console.log('\n══ fetchAllPaged (documents) ══');
for (const [n, apres, avant] of [[0, 1, 1], [3, 1, 2], [499, 1, 2], [500, 2, 2], [501, 2, 3], [1203, 3, 4]]) {
  const session = sessionFor('u-admin', 'paul@exemple.fr'); resetDb(); D.documents = docs(n);
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await ctx.clock.install({ time: NOW });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  const rec = await install(ctx, session, 'admin');
  const p = await ctx.newPage(); await p.goto(`${URL0}/admin`);
  await p.locator('[data-testid=stat-waiting]:visible').first().waitFor({ timeout: 20000 }); await p.waitForTimeout(2500);
  const nb = reads(rec.all, 'documents').length;
  console.log(`   ${n} documents → ${nb} lecture(s) de documents (avant le lot : ${avant}, après : ${apres})`);
  check(nb === apres, `7) ${n} documents : ${nb} lecture(s) = ${apres} (avant : ${avant})`);
  await ctx.close();
}
resetDb();

// ═════════════════════════ SALARIÉ ═════════════════════════
console.log('\n══ SALARIÉ 390×844 ══');
{
  resetDb();
  const session = sessionFor('u-karim', 'karim@exemple.fr');
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await ctx.clock.install({ time: NOW });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  const rec = await install(ctx, session, 'poseur');
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('   [erreur page]', e.message));
  await p.goto(`${URL0}/poseur`);
  await p.waitForSelector('.bt-total', { timeout: 20000 }); await p.waitForTimeout(3000);
  const isProfile = (e) => e.kind === 'rest' && e.name === 'users' && e.search.includes('id=eq.u-karim');
  const list = rec.all.slice(); const data = list.filter((e) => isData(e) && !isProfile(e)); const c = chain(list, isProfile);
  console.log(`   salarié, chargement : ${data.length} requêtes de données hors profil (profil×${count(list, isProfile)}, +${count(list, (e) => e.kind === 'auth')} auth) · companies×${reads(list, 'companies').length} · chaîne après profil = ${c.depth} (${c.path.join(' → ')})`);
  console.log(`      ${byName(data)}`);
  if (process.env.INVENTAIRE) for (const e of data.sort((a, c) => a.t0 - c.t0)) console.log(`      +${String(e.t0 - data[0].t0).padStart(4)} ms ${e.method.padEnd(4)} ${e.kind === 'rpc' ? 'rpc:' : ''}${e.name} ${e.select.slice(0, 70)} ${e.search.replace(/select=[^&]*&?/, '').slice(0, 90)}`);
  RESULT.poseur = { total: data.length, companies: reads(list, 'companies').length, depth: c.depth, path: c.path.join(' → ') };
  check(rec.seen === rec.all.length, `salarié : le comptage par route (${rec.all.length}) = page.on('request') (${rec.seen})`);
  check(count(list, isProfile) <= 2, `salarié : le profil est lu ${count(list, isProfile)} fois (≤ 2, compté à part)`);
  check(rec.unexpected.length === 0, `salarié : aucune écriture au chargement ${rec.unexpected.length ? `[${rec.unexpected}]` : ''}`);
  check(data.length <= BUDGET.poseurMax, `1) salarié : ${data.length} requêtes au chargement (budget ≤ ${BUDGET.poseurMax}; avant : 25)`);
  check(c.depth <= BUDGET.chainAfterProfile, `1) salarié : chaîne la plus longue après le profil = ${c.depth} (≤ ${BUDGET.chainAfterProfile}; avant : 4) : ${c.path.join(' → ')}`);
  const cl = reads(list, 'companies');
  check(cl.length === 1, `2) salarié : UNE seule lecture de companies (${cl.length}; avant : 7)`);
  check(cl.length === 1 && sameCols(cl[0].select, COLS_WORKER), `2) salarié : cette lecture ne demande que 5 colonnes, sans e-mail du comptable ni abonnement (${cl[0]?.select})`);
  check(reads(list, 'time_entries').filter((e) => e.search.includes('status=eq.draft')).length === 0, '   salarié : plus de lecture séparée des brouillons (fusionnée dans fetchPending)');

  // 8) corrections / modifications / positions : en parallèle (journée avec une ligne du salarié)
  const t = (name) => list.filter((e) => e.kind === 'rest' && e.name === name && !e.write).map((e) => e.t0);
  const [tc, te, tp] = [t('time_entry_corrections'), t('time_entry_edits'), t('time_entry_positions')];
  const ts = [...tc, ...te, ...tp];
  const spread = ts.length ? Math.max(...ts) - Math.min(...ts) : -1;
  console.log(`      corrections×${tc.length} modifications×${te.length} positions×${tp.length} · écart de départ ${spread} ms (latence simulée ${LATENCE} ms; avant : 529 ms)`);
  check(tc.length >= 1 && te.length >= 1 && tp.length >= 1, '8) la journée lit bien corrections, modifications et positions');
  check(spread >= 0 && spread < LATENCE / 2, `8) corrections / modifications / positions partent ensemble (écart ${spread} ms < ${LATENCE / 2} ms)`);
  await p.screenshot({ path: path.join(SH, 'salarie-390.png') });

  // 3) caché ~4 min 20 : zéro requête ; retour : « journées à envoyer » relu (3 requêtes, pas 6), companies non relu
  let r = await hiddenFor(p, rec, 4 * 65000);
  check(r.duringHidden.length === 0, `3) salarié caché pendant ~4 min 20 simulées : ${r.duringHidden.length} requête(s) ${r.duringHidden.length ? `[${byName(r.duringHidden)}]` : ''} (avant : 16)`);
  RESULT.poseurHidden = r.duringHidden.length;
  const pendReads = r.afterReturn.filter((e) => e.kind === 'rest' && !e.write && e.name === 'time_entries' && (e.select === 'work_date,status' || e.select.startsWith('id,work_date,observation')));
  check(count(r.afterReturn, PENDING) === 1 && pendReads.length === 2, `4) salarié, retour après 4 min 20 : « journées à envoyer » relu en 3 requêtes, pas 6 (planning×${count(r.afterReturn, PENDING)} + time_entries×${pendReads.length})`);
  check(count(r.afterReturn, (e) => e.kind === 'rest' && e.name === 'active_sessions') >= 1, '4) salarié, retour : chrono relu tout de suite');
  check(reads(r.afterReturn, 'companies').length === 0, `4) salarié, retour après 4 min 20 : companies PAS relu (${reads(r.afterReturn, 'companies').length})`);
  console.log(`      retour : ${byName(r.afterReturn)}`);

  // retour après 5 s : rien de relu côté compteurs
  r = await hiddenFor(p, rec, 5000);
  check(count(r.afterReturn, PENDING) === 0 && reads(r.afterReturn, 'companies').length === 0, `4) salarié, retour après 5 s : ni « journées à envoyer » ni companies relus (${byName(r.afterReturn) || 'aucune requête de données'})`);

  // 5) visible +61 s : sondage 60 s encore là, companies jamais relu
  let i = rec.all.length;
  await p.clock.fastForward(61000); await p.waitForTimeout(1500);
  let l = since(rec, i);
  check(count(l, PENDING) >= 1, `5) salarié visible +61 s : « journées à envoyer » relu (${count(l, PENDING)})`);
  check(reads(l, 'companies').length === 0, `5) salarié visible +61 s : companies PAS relu (${reads(l, 'companies').length})`);

  // retour après 6 min : UNE relecture des réglages (position, panier changés par le bureau)
  r = await hiddenFor(p, rec, 6 * 60000);
  check(r.duringHidden.length === 0, `3) salarié caché pendant 6 min : ${r.duringHidden.length} requête(s)`);
  check(reads(r.afterReturn, 'companies').length === 1, `4) salarié, retour après 6 min : UNE relecture de companies (${reads(r.afterReturn, 'companies').length})`);
  check(rec.unexpected.length === 0, `salarié : aucune écriture pendant tout le scénario ${rec.unexpected.length ? `[${rec.unexpected}]` : ''}`);
  await ctx.close();
}

console.log(`\nRÉSULTATS ${JSON.stringify(RESULT)}`);
console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
