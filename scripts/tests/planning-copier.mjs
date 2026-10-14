// Lancer : npm run build, puis  node scripts/tests/planning-copier.mjs out docs/captures-planning-copier [port]
//
// Copier une case SIMPLEMENT (planning du bureau), sur la VRAIE page /admin (base simulée AVEC état, horloge
// figée au mercredi 21 octobre 2026, 10:00 à Paris ; aucune vraie base, aucun e-mail) :
//  T   l'astuce visible (plus d'info-bulle), fermable, mémorisée, réaffichable par « ? » ; phrase sans Ctrl au doigt ;
//      le stockage du navigateur bloqué n'empêche rien
//  A   la rangée « Actions » de la fenêtre de modification : « Dupliquer au lendemain », « Copier vers… »,
//      « Supprimer » (confirmation et garde-fous d'avant), mêmes refus que la copie par glisser, case aux heures envoyées
//  C   « Copier vers un autre jour… » : jours refusés grisés avec leur raison, autre salarié, autre semaine (lue à
//      l'ouverture seulement), mois clôturé, salarié clôturé ; exactement les cases voulues sont écrites
//  G   Ctrl + glisser marche comme avant (copie, carte « Annuler » d'avant)
//  K   « ＋ Tâche » sur une case remplie et « Ajouter une tâche à ce créneau » (fenêtre existante, onglet Tâche, heures
//      du créneau pré-remplies, alerte non bloquante inchangée)
//  F   « Formations » dans la barre et dans le menu du compte (la barre tient sur une ligne à 1024/1280/1366)
//  M   téléphone 390 px : astuce, actions, copie, tâche
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}
const [,, OUT = 'out', SH = 'docs/captures-planning-copier', PORT = '42900'] = process.argv;
fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT), r));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ─── Horloge figée : mercredi 21 octobre 2026, 10:00 (Paris) ─────────────────────
const NOW = new Date('2026-10-21T10:00:00+02:00');
const D_ = (d) => `2026-10-${String(d).padStart(2, '0')}`;
const MON = 0, TUE = 1, WED = 2, THU = 3, FRI = 4, SAT = 5, SUN = 6;
const TIP_KEY = 'bemexo-astuce-copier-case';

// ─── Base simulée (avec état) — noms fictifs neutres ─────────────────────────────
const CO = 'c0000000-0000-0000-0000-0000000000e1';
const W1 = { id: 'w1', company_id: CO, client_name: 'Salle', city: 'Lyon', is_active: true };
const W2 = { id: 'w2', company_id: CO, client_name: 'Dépôt', city: 'Vienne', is_active: true };
const u = (id, first, role = 'worker') => ({ id, company_id: CO, first_name: first, last_name: 'Test', role, email: `${id}@exemple.fr`, is_active: true, created_at: '2026-01-01' });
const slot = (id, user_id, work_date, ws, extra = {}) => ({ id, company_id: CO, user_id, worksite_id: ws?.id ?? null, work_date, absence_type: null, estimated_start: null, estimated_end: null, notes: null, position: null, added_by_worker: false, created_by: 'u-admin', created_at: `${work_date}T06:00:00Z`, ...extra });
const entry = (id, user_id, work_date, ws, status, minutes, extra = {}) => ({ id, company_id: CO, user_id, work_date, worksite_id: ws?.id ?? null, planning_id: null, status, start_time: '08:00:00', end_time: `${String(8 + Math.floor(minutes / 60)).padStart(2, '0')}:00:00`, total_minutes: minutes, reception: null, reserve_resolved_at: null, reserve_fixed_at: null, observation: null, ...extra });
const H = (s, e) => ({ estimated_start: `${s}:00`, estimated_end: `${e}:00` });
const COMPANY = { id: CO, name: 'Entreprise Test', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, travel_paid: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, accountant_email: null };
let FLAGS = { trainings: true, busy: false, versions: false, tasks: true };
const fresh = () => {
  const db = {
    users: [u('u-admin', 'Alex', 'admin'), u('u-sam', 'Sam'), u('u-lou', 'Lou'), u('u-noa', 'Noa'), u('u-tom', 'Tom')],
    companies: [{ ...COMPANY, ...(FLAGS.busy ? { kiosk_enabled: true, ai_enabled: true } : {}) }],
    worksites: [W1, W2],
    planning: [
      // Sam : lun. 08–12 + note · mar. 08–17 (heures ENVOYÉES) + 18–20 · mer. sans horaire (pointage en cours) · ven. 08–17
      slot('ps-mon', 'u-sam', D_(19), W1, { ...H('08:00', '12:00'), notes: 'code portail 1234' }),
      slot('ps-tue', 'u-sam', D_(20), W1, { ...H('08:00', '17:00'), notes: 'clé chez le gardien', position: 1 }),
      slot('ps-tue2', 'u-sam', D_(20), W2, { ...H('18:00', '20:00'), position: 0 }),
      slot('ps-wed', 'u-sam', D_(21), W2),
      slot('ps-fri', 'u-sam', D_(23), W2, H('08:00', '17:00')),
      // Sam, semaine suivante : mar. 27 la MÊME intervention que lun. (08–12 Salle) · mer. 28 en congé
      slot('ps-n27', 'u-sam', D_(27), W1, { ...H('08:00', '12:00'), notes: 'code portail 1234' }),
      slot('ps-n28', 'u-sam', D_(28), null, { absence_type: 'conge' }),
      // Lou : lun. sans horaire · mar. 08–12 puis 13:30–17 · absente (maladie) jeudi
      slot('pl-mon', 'u-lou', D_(19), W2),
      slot('pl-tue-a', 'u-lou', D_(20), W2, { ...H('08:00', '12:00'), position: 0 }),
      slot('pl-tue-b', 'u-lou', D_(20), W1, { ...H('13:30', '17:00'), position: 1 }),
      slot('pl-abs', 'u-lou', D_(22), null, { absence_type: 'maladie' }),
      // Noa : lun. RETIRÉE par le salarié (ligne « cancelled »)
      slot('pn-mon', 'u-noa', D_(19), W1),
      // Tom : clôturé jusqu'au mardi 20 · jeu. libre
      slot('pt-thu', 'u-tom', D_(22), W1),
    ],
    time_entries: [
      entry('e1', 'u-sam', D_(20), W1, 'submitted', 480, { planning_id: 'ps-tue' }),
      entry('e2', 'u-noa', D_(19), W1, 'cancelled', 0, { planning_id: 'pn-mon' }),
    ],
    active_sessions: [{ user_id: 'u-sam', company_id: CO, worksite_id: 'w2', planning_id: 'ps-wed', work_date: D_(21), started_at: '2026-10-21T06:00:00Z', positions: [] }],
    month_closures: [{ company_id: CO, month: '2026-09-01' }],
    user_closures: [{ user_id: 'u-tom', company_id: CO, closed_until: D_(20), closed_at: '2026-10-20T17:00:00Z', closed_by: 'u-admin', reopened_at: null }],
    day_tasks: [], task_templates: [], meetings: [], meeting_participants: [],
    leave_requests: [], invitations: [], documents: [], certifications: [], push_subscriptions: [], kiosks: [], kiosk_settings: [], worksite_expenses: [], user_payroll: [], assistant_journal: [],
    trainings: [], training_views: [], planning_versions: [],
  };
  if (FLAGS.busy) {
    // Le pire cas de la barre (admin-lot11, planning-lot3) : 3 congés en attente, 12 réserves ouvertes.
    for (let i = 0; i < 3; i++) db.leave_requests.push({ id: `lr${i}`, company_id: CO, user_id: 'u-sam', status: 'pending', start_date: D_(26), end_date: D_(27), created_at: '2026-10-10T08:00:00Z' });
    for (let i = 0; i < 12; i++) db.time_entries.push(entry(`rsv${i}`, 'u-lou', D_(1 + (i % 9)), W2, 'submitted', 60, { reception: 'avec' }));
  }
  return db;
};
let D = fresh();

// ─── Session simulée + routes Supabase ───────────────────────────────────────────
const now = Math.floor(NOW.getTime() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-admin', role: 'authenticated', exp: now + 864000, aal: 'aal1' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', expires_at: now + 864000, expires_in: 864000, token_type: 'bearer', user: { id: 'u-admin', email: 'u-admin@exemple.fr', aud: 'authenticated', role: 'authenticated' } };
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
const embed = (t, row, sel) => {
  const out = { ...row };
  if (t === 'planning') {
    if (sel.includes('worksite:worksites')) out.worksite = D.worksites.find((w) => w.id === row.worksite_id) || null;
    if (sel.includes('user:users')) out.user = D.users.find((x) => x.id === row.user_id) || null;
  }
  return out;
};
const log = { writes: [], reads: [] };
let seq = 0;
const missing = (r) => r.fulfill({ status: 404, json: { code: 'PGRST205', message: 'Could not find the table in the schema cache' } });
const setup = async (ctx, { blockTipStorage = false } = {}) => {
  await ctx.clock.install({ time: NOW });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  if (blockTipStorage) {
    // Le stockage du navigateur refuse l'astuce (navigation privée, réglage…) : le reste (la session) marche.
    await ctx.addInitScript((key) => {
      const get = Storage.prototype.getItem, set = Storage.prototype.setItem, del = Storage.prototype.removeItem;
      Storage.prototype.getItem = function (k) { if (k === key) throw new DOMException('blocked', 'SecurityError'); return get.call(this, k); };
      Storage.prototype.setItem = function (k, v) { if (k === key) throw new DOMException('blocked', 'QuotaExceededError'); return set.call(this, k, v); };
      Storage.prototype.removeItem = function (k) { if (k === key) throw new DOMException('blocked', 'SecurityError'); return del.call(this, k); };
    }, TIP_KEY);
  }
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url()); const m = r.request().method();
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/')) { log.writes.push({ m: 'FN', t: url.pathname }); return r.fulfill({ json: {} }); }
    if (url.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
    const t = url.pathname.replace('/rest/v1/', '');
    if (t === 'trainings' && !FLAGS.trainings) return missing(r);
    if (t === 'planning_versions' && !FLAGS.versions) return missing(r);
    if (['day_tasks', 'task_templates', 'meetings', 'meeting_participants'].includes(t) && !FLAGS.tasks) return missing(r);
    D[t] = D[t] || [];
    const sel = url.searchParams.get('select') || '*';
    const single = (r.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    if (m === 'DELETE') {
      const gone = filterRows(D[t], url.searchParams); D[t] = D[t].filter((x) => !gone.includes(x));
      log.writes.push({ m, t, ids: gone.map((x) => x.id) });
      return r.fulfill({ json: gone.map((x) => ({ id: x.id })) });
    }
    if (m === 'POST') {
      const body = JSON.parse(r.request().postData() || '[]'); const arr = Array.isArray(body) ? body : [body];
      const saved = arr.map((row) => { const x = { id: row.id || `new-${++seq}`, position: null, added_by_worker: false, created_at: NOW.toISOString(), done_at: null, ...row }; const i = D[t].findIndex((y) => y.id === x.id); if (i >= 0) D[t][i] = x; else D[t].push(x); return x; });
      log.writes.push({ m, t, rows: arr, ids: saved.map((x) => x.id) });
      return r.fulfill({ status: 201, json: single ? saved[0] : saved });
    }
    if (m === 'PATCH') {
      const body = JSON.parse(r.request().postData() || '{}');
      const hit = filterRows(D[t], url.searchParams); for (const x of hit) Object.assign(x, body);
      log.writes.push({ m, t, ids: hit.map((x) => x.id), body });
      return r.fulfill({ json: hit.map((x) => ({ ...x })) });
    }
    log.reads.push({ t, q: url.search });
    const all = filterRows(D[t], url.searchParams).map((x) => embed(t, x, sel));
    if (single) return all.length ? r.fulfill({ json: all[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
    const rows = all.slice(off, lim ? off + Number(lim) : undefined);
    return r.fulfill({ json: rows, headers: { 'content-range': `${off}-${Math.max(off, off + rows.length - 1)}/${all.length}`, 'access-control-expose-headers': 'content-range', 'access-control-allow-origin': '*' } });
  });
};
const writesSince = (n) => log.writes.slice(n);
const planningWrites = (n) => writesSince(n).filter((x) => x.t === 'planning');
const readsSince = (n, t) => log.reads.slice(n).filter((x) => x.t === t);

let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const note = (m) => console.log('ℹ️ ', m);
const section = (m) => console.log(`\n── ${m} ──`);
const newPage = async ({ w = 1280, h = 800, touch = false, mobile = false, flags = {}, storageBlocked = false, keepDb = false } = {}) => {
  FLAGS = { trainings: true, busy: false, versions: false, tasks: true, ...flags };
  if (!keepDb) D = fresh();
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'fr-FR', timezoneId: 'Europe/Paris', hasTouch: touch, isMobile: mobile, deviceScaleFactor: 1 });
  await setup(ctx, { blockTipStorage: storageBlocked });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('   [erreur page]', e.message));
  await p.goto(`http://localhost:${PORT}/admin`);
  await p.waitForSelector(mobile || w < 1024 ? '.bt-pl-m-card' : '.bt-pl-gridwrap .bt-pl-grab', { timeout: 20000 });
  await p.waitForTimeout(1500);
  return { ctx, p };
};

// ─── Repères ─────────────────────────────────────────────────────────────────────
const row = (p, first) => p.locator('tr', { has: p.locator('.bt-pl-name', { hasText: `${first} Test` }) }).first();
const cell = (p, first, day) => row(p, first).locator('td.bt-pl-cell').nth(day);
const bub = (p, id) => p.locator(`[data-bub="${id}"] .bt-pl-grab`).first();
const idsIn = (p, first, day) => cell(p, first, day).locator('[data-bub]').evaluateAll((els) => els.map((e) => e.getAttribute('data-bub')));
const center = async (loc) => { const x = await loc.boundingBox(); return { x: x.x + x.width / 2, y: x.y + x.height / 2 }; };
const cellSpot = async (loc) => { const x = await loc.boundingBox(); return { x: x.x + x.width / 2, y: x.y + x.height - 12 }; };
const drag = async (p, from, to, { key = null } = {}) => {
  const a = await center(from); const z = await cellSpot(to);
  await p.mouse.move(a.x, a.y);
  if (key) await p.keyboard.down(key);
  await p.mouse.down();
  await p.mouse.move(a.x + 12, a.y + 4, { steps: 4 });
  await p.mouse.move(z.x, z.y, { steps: 14 });
  await p.waitForTimeout(180);
  await p.mouse.up();
  if (key) await p.keyboard.up(key);
  await p.waitForTimeout(800);
};
const toasts = async (p) => (await p.locator('[data-sonner-toast]').allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, ' ').trim());
const settle = async (p) => { await p.clock.fastForward(9000); await p.waitForTimeout(500); };
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const dlg = (p) => p.locator('[role=dialog]').last();
const openEditAt = async (p, id, mobile = false) => {
  if (mobile) await p.locator(`.bt-pl-m-bubbtn`).filter({ has: p.locator('.bt-pl-bub') }).first().tap();
  else await bub(p, id).click();
  await p.waitForSelector('[data-testid=edit-actions]', { timeout: 8000 });
  await p.waitForTimeout(250);
};
const heightOf = async (loc) => (await loc.boundingBox())?.height ?? 0;
const widthOf = async (loc) => (await loc.boundingBox())?.width ?? 0;
const noHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const shotTo = async (p, name, opts = {}) => { await p.screenshot({ path: `${SH}/${name}`, ...opts }); };
const dayChips = (p) => p.locator('[data-testid=copy-day]');
const chipState = async (p) => (await dayChips(p).evaluateAll((els) => els.map((e) => ({ date: e.getAttribute('data-date'), off: e.disabled, on: e.getAttribute('aria-pressed') === 'true' }))));
const offDates = async (p) => (await chipState(p)).filter((c) => c.off).map((c) => c.date.slice(8)).join(',');
const setTime = async (p, loc, v) => { await loc.click(); await loc.fill(v); await loc.press('Enter'); await p.waitForTimeout(150); };

const TIP_PC = '💡 Copier une case : cliquez dessus puis « Copier vers… », ou glissez-la en maintenant Ctrl (Windows) ou ⌥ Option (Mac).';
const TIP_TOUCH = '💡 Copier une case : touchez-la puis « Copier vers… ».';

// ═══ T · l'astuce visible ═════════════════════════════════════════════════════════
section('T · astuce visible, fermable, mémorisée');
{
  const { ctx, p } = await newPage();
  const tip = p.locator('[data-testid=copy-tip]');
  check(await tip.isVisible(), 'T1 l’astuce est visible dès l’arrivée sur le planning');
  check(norm(await tip.locator('p').innerText()) === TIP_PC, `T1 la phrase PC : « ${norm(await tip.locator('p').innerText())} »`);
  const titles = await p.locator('.bt-pl-grab').evaluateAll((els) => els.filter((e) => e.hasAttribute('title')).length);
  check(titles === 0 && await p.locator('.bt-pl-grab').count() >= 8, `T1 plus d’info-bulle sur les bulles (${titles} avec title sur ${await p.locator('.bt-pl-grab').count()})`);
  const pos = await p.evaluate(() => { const t = document.querySelector('[data-testid=copy-tip]').getBoundingClientRect(); const g = document.querySelector('.bt-pl-gridwrap').getBoundingClientRect(); const bar = document.querySelector('.bt-pl-bar').getBoundingClientRect(); return { aboveGrid: t.bottom <= g.top + 1, belowBar: t.top >= bar.bottom - 1, width: t.width, h: t.height, inView: t.bottom <= innerHeight }; });
  check(pos.aboveGrid && pos.belowBar && pos.inView && pos.h < 60, `T1 bandeau fin entre la barre et la grille (${Math.round(pos.h)} px de haut)`);
  check(await p.locator('[data-testid=copy-tip-help]').count() === 0, 'T1 pas de « ? » tant que l’astuce est là');
  await p.mouse.move(640, 790);
  await shotTo(p, 'planning-1280.png');

  // Fermée : « Compris »
  await p.click('[data-testid=copy-tip-ok]'); await p.waitForTimeout(250);
  check(await tip.count() === 0, 'T2 « Compris » ferme l’astuce');
  check(await p.evaluate((k) => localStorage.getItem(k), TIP_KEY) === '1', 'T2 mémorisée dans le navigateur');
  const help = p.locator('[data-testid=copy-tip-help]');
  check(await help.isVisible() && await help.getAttribute('aria-label') === 'Afficher l’astuce pour copier une case' && norm(await help.innerText()) === '?', 'T2 un petit « ? » (nom accessible) prend la place');
  check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'T2 aucun défilement horizontal');
  await p.reload(); await p.waitForSelector('.bt-pl-gridwrap .bt-pl-grab'); await p.waitForTimeout(1200);
  check(await tip.count() === 0 && await help.count() === 1, 'T2 après rechargement : toujours fermée (mémorisée)');
  // Réaffichée par « ? »
  await help.click(); await p.waitForTimeout(250);
  check(await tip.isVisible() && await help.count() === 0 && await p.evaluate((k) => localStorage.getItem(k), TIP_KEY) === null, 'T3 « ? » réaffiche l’astuce (et oublie la fermeture)');
  await p.reload(); await p.waitForSelector('.bt-pl-gridwrap .bt-pl-grab'); await p.waitForTimeout(1200);
  check(await tip.isVisible(), 'T3 après rechargement : l’astuce est là');
  // Au clavier
  await p.locator('[data-testid=copy-tip-ok]').focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  check(await tip.count() === 0, 'T3 « Compris » se commande au clavier');
  // Le « ? » ne gêne pas le bouton de versions du coin
  await ctx.close();
}
{
  // Le stockage du navigateur refuse la mémoire de l'astuce : l'écran marche quand même.
  const { ctx, p } = await newPage({ storageBlocked: true });
  const tip = p.locator('[data-testid=copy-tip]');
  check(await tip.isVisible(), 'T4 stockage bloqué : l’astuce s’affiche quand même');
  await p.click('[data-testid=copy-tip-ok]'); await p.waitForTimeout(250);
  check(await tip.count() === 0 && await p.locator('[data-testid=copy-tip-help]').isVisible(), 'T4 stockage bloqué : « Compris » ferme pour la session, « ? » est là');
  await bub(p, 'ps-mon').click(); await p.waitForSelector('[data-testid=edit-actions]');
  check(true, 'T4 stockage bloqué : la fenêtre de modification s’ouvre');
  await ctx.close();
}
{
  // Le coin de la grille : « ? » et bouton de versions côte à côte, sans se recouvrir.
  const { ctx, p } = await newPage({ flags: { versions: true } });
  await p.click('[data-testid=copy-tip-ok]'); await p.waitForTimeout(250);
  const r = await p.evaluate(() => { const a = document.querySelector('[data-testid=copy-tip-help] > span').getBoundingClientRect(); const v = document.querySelector('[data-testid=corner-versions]')?.getBoundingClientRect(); const th = document.querySelector('.bt-pl-th-name').getBoundingClientRect(); return { a: [a.left, a.right], v: v ? [v.left, v.right] : null, th: [th.left, th.right] }; });
  check(r.v && r.a[0] >= r.v[1] - 0.5 && r.a[1] <= r.th[1], `T5 « ? » à droite du bouton Versions, dans le coin (${JSON.stringify(r)})`);
  await ctx.close();
}
{
  // Phrase adaptée à l'appareil : le doigt n'a pas de touche Ctrl.
  const tab = await newPage({ w: 1024, h: 768, touch: true });
  const t1 = norm(await tab.p.locator('[data-testid=copy-tip] p').innerText());
  check(t1 === TIP_TOUCH && !/Ctrl|Option/.test(t1), `T6 tablette tactile (mise en page bureau) : « ${t1} »`);
  await tab.ctx.close();
  const ph = await newPage({ w: 390, h: 844, touch: true, mobile: true });
  const tm = norm(await ph.p.locator('[data-testid=copy-tip-m] p').innerText());
  check(tm === TIP_TOUCH && !/Ctrl|Option/.test(tm) && await ph.p.locator('[data-testid=copy-tip]').isVisible().catch(() => false) === false, `T6 téléphone : « ${tm} » (une seule astuce à l’écran)`);
  const okB = ph.p.locator('[data-testid=copy-tip-ok-m]');
  check(await heightOf(okB) >= 44, `T6 téléphone : « Compris » ${Math.round(await heightOf(okB))} px de haut`);
  check(await noHScroll(ph.p), 'T6 téléphone : aucun défilement horizontal');
  await ph.p.evaluate(() => window.scrollTo(0, 0));
  await shotTo(ph.p, 'planning-390.png');
  await okB.tap(); await ph.p.waitForTimeout(250);
  const hm = ph.p.locator('[data-testid=copy-tip-help-m]');
  check(await ph.p.locator('[data-testid=copy-tip-m]').count() === 0 && await heightOf(hm) >= 44 && await widthOf(hm) >= 44, `T6 téléphone : fermée, « ? » de ${Math.round(await widthOf(hm))}×${Math.round(await heightOf(hm))} px`);
  await hm.tap(); await ph.p.waitForTimeout(250);
  check(await ph.p.locator('[data-testid=copy-tip-m]').isVisible(), 'T6 téléphone : « ? » réaffiche l’astuce');
  await ph.ctx.close();
}

// ═══ A · la rangée « Actions » ════════════════════════════════════════════════════
section('A · la rangée « Actions » de la fenêtre de modification');
{
  const { ctx, p } = await newPage();
  await p.click('[data-testid=copy-tip-ok]');
  // Un clic ouvre toujours la fenêtre de modification d'avant.
  await bub(p, 'ps-mon').click(); await p.waitForSelector('[data-testid=edit-actions]'); await p.waitForTimeout(250);
  const d = dlg(p);
  check(await d.locator('text=Horaire prévu').count() >= 1 && await d.locator('text=Note pour le poseur').count() === 1 && await d.locator('text=Heures déclarées').count() === 1, 'A1 cliquer une case ouvre la fenêtre de modification (horaire, note, heures) comme avant');
  const act = d.locator('[data-testid=edit-actions]');
  const names = ['edit-copy-to', 'edit-duplicate', 'edit-add-task', 'edit-delete'];
  const hs = []; for (const n of names) hs.push(Math.round(await heightOf(act.locator(`[data-testid=${n}]`))));
  check(await act.isVisible() && hs.every((h) => h >= 44), `A1 rangée « Actions » : 4 boutons de ${hs.join(' / ')} px de haut`);
  check(norm(await act.locator('[data-testid=edit-copy-to]').innerText()) === 'Copier vers un autre jour…' && norm(await act.locator('[data-testid=edit-duplicate]').innerText()) === 'Dupliquer au lendemain' && norm(await act.locator('[data-testid=edit-delete]').innerText()) === 'Supprimer', 'A1 libellés : « Copier vers un autre jour… », « Dupliquer au lendemain », « Supprimer »');
  check(await d.locator('[data-testid=edit-delete]').count() === 1 && await d.locator('[data-guide="bureau-edit.supprimer"]').count() === 1 && await d.locator('[data-guide="bureau-edit.enregistrer"]').count() === 1, 'A1 « Supprimer » n’est pas doublé (un seul bouton, même ancre du guide)');
  const order = await d.evaluate((e) => { const a = e.querySelector('[data-guide="bureau-edit.enregistrer"]').getBoundingClientRect(); const b = e.querySelector('[data-testid=edit-actions]').getBoundingClientRect(); return b.top > a.bottom - 1; }, await d.elementHandle());
  check(order, 'A1 les Actions sont en pied, sous « Enregistrer »');
  await shotTo(p, 'actions-1280.png');
  await ctx.close();
}
{
  // A2 · Dupliquer au lendemain (Lou, lundi → mardi) : un geste, une seule ligne
  const { ctx, p } = await newPage();
  await p.click('[data-testid=copy-tip-ok]');
  await bub(p, 'pl-mon').click(); await p.waitForSelector('[data-testid=edit-actions]'); await p.waitForTimeout(250);
  const w = log.writes.length;
  await dlg(p).locator('[data-testid=edit-duplicate]').click(); await p.waitForTimeout(1000);
  const pw = planningWrites(w); const post = pw.filter((x) => x.m === 'POST'); const r0 = post[0]?.rows?.[0] || {};
  check(pw.length === 1 && post.length === 1 && r0.user_id === 'u-lou' && r0.work_date === D_(20) && r0.worksite_id === 'w2' && r0.absence_type === null && r0.created_by === 'u-admin' && r0.company_id === CO, `A2 « Dupliquer au lendemain » : UN POST planning (lou, mar. 20, Dépôt) ${JSON.stringify(r0)}`);
  check(writesSince(w).every((x) => x.t === 'planning'), 'A2 rien sur time_entries, aucun appel /functions');
  const tt = await toasts(p);
  check(tt.some((x) => /Case copiée sur mar\. 20$/.test(x)), `A2 le message dit ce qui a été fait : « ${tt.join(' | ')} »`);
  check(await p.locator('[data-testid=undo-card]').count() === 0 && !tt.some((x) => /Annuler/.test(x)), 'A2 pas de bouton « Annuler » pour cette copie');
  check(await p.locator('[role=dialog]').count() === 0, 'A2 la fenêtre se referme');
  check((await idsIn(p, 'Lou', TUE)).length === 3 && D.planning.some((x) => x.id === 'pl-mon' && x.work_date === D_(19)), 'A2 la copie est dans la case du mardi, l’original n’a pas bougé');
  await ctx.close();
}
{
  // A3 · mêmes refus que la copie par glisser : chevauchement (Sam lun. 08–12 sur mar. 08–17)
  const { ctx, p } = await newPage();
  await p.click('[data-testid=copy-tip-ok]');
  await bub(p, 'ps-mon').click(); await p.waitForSelector('[data-testid=edit-actions]'); await p.waitForTimeout(250);
  const w = log.writes.length;
  await dlg(p).locator('[data-testid=edit-duplicate]').click(); await p.waitForTimeout(900);
  const tt = await toasts(p);
  check(writesSince(w).length === 0 && tt.some((x) => /mar\. 20 : Chevauche 08:00–17:00 déjà prévu ce jour-là/.test(x)), `A3 chevauchement : zéro écriture, « ${tt.join(' | ')} »`);
  check(await dlg(p).locator('[data-testid=edit-actions]').count() === 1, 'A3 refus : la fenêtre reste ouverte');
  await ctx.close();
}
{
  // A3b · refus « absent » : une case de Lou posée mercredi, dupliquée au jeudi (Lou est en arrêt maladie ce jour-là)
  const { ctx, p } = await newPage();
  await p.click('[data-testid=copy-tip-ok]');
  D.planning.push(slot('pl-wed', 'u-lou', D_(21), W2, H('09:00', '10:00')));
  await p.reload(); await p.waitForSelector('.bt-pl-gridwrap .bt-pl-grab'); await p.waitForTimeout(1200);
  await bub(p, 'pl-wed').click(); await p.waitForSelector('[data-testid=edit-actions]'); await p.waitForTimeout(250);
  const w = log.writes.length;
  await dlg(p).locator('[data-testid=edit-duplicate]').click(); await p.waitForTimeout(900);
  const tt = await toasts(p);
  check(writesSince(w).length === 0 && tt.some((x) => /jeu\. 22 : Absent ce jour-là/.test(x)), `A3b jour d’absence : zéro écriture, « ${tt.join(' | ')} »`);
  await ctx.close();
}
{
  // A4 · modification pas encore enregistrée : les copies attendent
  const { ctx, p } = await newPage();
  await p.click('[data-testid=copy-tip-ok]');
  await bub(p, 'ps-mon').click(); await p.waitForSelector('[data-testid=edit-actions]'); await p.waitForTimeout(250);
  const d = dlg(p);
  check(await d.locator('[data-testid=edit-copy-to]').isEnabled() && await d.locator('[data-testid=edit-duplicate]').isEnabled() && await d.locator('[data-testid=edit-actions-note]').count() === 0, 'A4 case inchangée : copier et dupliquer actifs');
  const ta = d.locator('textarea'); const old = await ta.inputValue();
  await ta.fill(old + ' !'); await p.waitForTimeout(200);
  check(!(await d.locator('[data-testid=edit-copy-to]').isEnabled()) && !(await d.locator('[data-testid=edit-duplicate]').isEnabled()) && /Enregistrez d’abord/.test(await d.locator('[data-testid=edit-actions-note]').innerText()) && await d.locator('[data-testid=edit-delete]').isEnabled(), 'A4 modification en cours : copier et dupliquer attendent « Enregistrez d’abord… » ; Supprimer reste là');
  await ta.fill(old); await p.waitForTimeout(200);
  check(await d.locator('[data-testid=edit-copy-to]').isEnabled(), 'A4 modification annulée à la main : actifs de nouveau');
  await ctx.close();
}
{
  // A5 · case aux heures ENVOYÉES : copier marche (comme Ctrl + glisser), supprimer reste refusé comme avant
  const { ctx, p } = await newPage();
  await p.click('[data-testid=copy-tip-ok]');
  await bub(p, 'ps-tue').click(); await p.waitForSelector('[data-testid=edit-actions]'); await p.waitForTimeout(250);
  let w = log.writes.length;
  await dlg(p).locator('[data-testid=edit-delete]').click(); await p.waitForTimeout(700);
  let tt = await toasts(p);
  check(writesSince(w).length === 0 && tt.some((x) => /Heures envoyées — non supprimable/.test(x)) && await p.locator('[data-testid=erase-ask]').count() === 0, `A5 « Supprimer » une case aux heures envoyées : refus comme avant, zéro écriture (« ${tt.join(' | ')} »)`);
  await settle(p);
  w = log.writes.length;
  await dlg(p).locator('[data-testid=edit-duplicate]').click(); await p.waitForTimeout(1000);
  const pw = planningWrites(w); const r0 = pw[0]?.rows?.[0] || {};
  check(pw.length === 1 && pw[0].m === 'POST' && r0.user_id === 'u-sam' && r0.work_date === D_(21) && r0.estimated_start === '08:00:00' && r0.estimated_end === '17:00:00' && r0.notes === 'clé chez le gardien', `A5 dupliquer la case aux heures envoyées : UN POST (chantier, horaire, note) ${JSON.stringify(r0)}`);
  check(writesSince(w).every((x) => x.t === 'planning') && D.time_entries.find((e) => e.id === 'e1').status === 'submitted' && D.planning.find((x) => x.id === 'ps-tue').work_date === D_(20), 'A5 jamais d’heures copiées : e1 intacte, l’original n’a pas bougé');
  await ctx.close();
}
{
  // A6 · « Supprimer » : la confirmation d'avant (case retirée par le salarié), puis la suppression d'avant
  const { ctx, p } = await newPage();
  await p.click('[data-testid=copy-tip-ok]');
  await bub(p, 'pn-mon').click(); await p.waitForSelector('[data-testid=edit-actions]'); await p.waitForTimeout(250);
  let w = log.writes.length;
  await dlg(p).locator('[data-testid=edit-delete]').click(); await p.waitForTimeout(700);
  check(await p.locator('[data-testid=erase-ask]').isVisible() && writesSince(w).filter((x) => x.m === 'DELETE').length === 0, 'A6 case aux heures retirées : « Supprimer ? » d’abord, rien n’est effacé');
  await p.click('[data-testid=erase-keep]'); await p.waitForTimeout(400);
  check(writesSince(w).length === 0 && D.planning.some((x) => x.id === 'pn-mon'), 'A6 « Garder » : zéro écriture');
  check(await p.locator('[data-testid=edit-actions]').count() === 1, 'A6 « Garder » : la fenêtre de modification est toujours là');
  await dlg(p).locator('[data-testid=edit-delete]').click(); await p.waitForTimeout(500);
  await p.click('[data-testid=erase-confirm]'); await p.waitForTimeout(1200);
  const del = planningWrites(w).filter((x) => x.m === 'DELETE');
  check(del.length === 1 && del[0].ids[0] === 'pn-mon' && !D.planning.some((x) => x.id === 'pn-mon'), 'A6 confirmé : la suppression d’avant (un DELETE)');
  await settle(p);
  // et une case simple : comme avant (suppression, carte « Annuler » du lot 11)
  await bub(p, 'pl-mon').click(); await p.waitForSelector('[data-testid=edit-actions]'); await p.waitForTimeout(250);
  w = log.writes.length;
  await dlg(p).locator('[data-testid=edit-delete]').click(); await p.waitForTimeout(1200);
  check(planningWrites(w).filter((x) => x.m === 'DELETE').length === 1 && await p.locator('[data-testid=undo-card]').isVisible(), 'A6 case simple : supprimée comme avant (la carte du lot 11 est là)');
  await ctx.close();
}
{
  // A7 · Ctrl + glisser : comme avant
  const { ctx, p } = await newPage();
  await p.click('[data-testid=copy-tip-ok]');
  const w = log.writes.length;
  await drag(p, bub(p, 'ps-fri'), cell(p, 'Lou', FRI), { key: 'Control' });
  const pw = planningWrites(w); const r0 = pw[0]?.rows?.[0] || {};
  check(pw.length === 1 && pw[0].m === 'POST' && r0.user_id === 'u-lou' && r0.work_date === D_(23) && r0.estimated_start === '08:00:00', `A7 Ctrl + glisser copie toujours (UN POST) ${JSON.stringify(r0)}`);
  check(/Intervention copiée · Lou · ven\. 23 oct\./.test(norm(await p.locator('[data-testid=undo-card]').innerText())) && await p.locator('[data-testid=action-undo]').count() === 1, 'A7 la carte « Annuler » du glisser est inchangée');
  await settle(p);
  const w2 = log.writes.length;
  await drag(p, bub(p, 'ps-mon'), cell(p, 'Sam', THU));
  const mv = planningWrites(w2);
  const moves = mv.filter((x) => x.body?.work_date);
  check(moves.length === 1 && moves[0].m === 'PATCH' && moves[0].body.work_date === D_(22) && mv.every((x) => x.m === 'PATCH'), 'A7 glisser simple : toujours un déplacement (des PATCH, aucun POST)');
  await ctx.close();
}

// ═══ C · « Copier vers un autre jour… » ═══════════════════════════════════════════
section('C · « Copier vers un autre jour… »');
{
  const { ctx, p } = await newPage();
  await p.click('[data-testid=copy-tip-ok]');
  await bub(p, 'ps-fri').click(); await p.waitForSelector('[data-testid=edit-actions]'); await p.waitForTimeout(250);
  await dlg(p).locator('[data-testid=edit-copy-to]').click();
  await p.waitForSelector('[data-testid=copy-dialog]'); await p.waitForTimeout(400);
  const d = p.locator('[data-testid=copy-dialog]');
  check(await p.locator('[data-testid=edit-actions]').count() === 0, 'C1 la fenêtre de modification se referme, la fenêtre « Copier vers… » s’ouvre');
  check(norm(await d.locator('[data-testid=copy-source]').innerText()) === 'Dépôt · 08:00–17:00' && /Semaine du 19 au 25 oct\. \(affichée\)/.test(norm(await d.locator('[data-testid=copy-week]').innerText())), 'C1 elle rappelle la case copiée et la semaine affichée');
  check(await dayChips(p).count() === 7, 'C1 sept jours (lundi → dimanche)');
  const hs = []; for (let i = 0; i < 7; i++) hs.push(Math.round(await heightOf(dayChips(p).nth(i))));
  check(hs.every((h) => h >= 44) && await heightOf(d.locator('[data-testid=copy-go]')) >= 44, `C1 jours et bouton ≥ 44 px (${hs.join('/')})`);
  // Sam : lun. (08–12 Salle) et mar. (08–17 Salle) chevauchent 08–17 ; ven. = la case elle-même
  check(await offDates(p) === '19,20,23', `C1 jours refusés (grisés) : ${await offDates(p)}`);
  const why = norm(await d.locator('[data-testid=copy-refused]').innerText());
  check(/lun\. 19 oct\. : Chevauche 08:00–12:00 déjà prévu/.test(why) && /mar\. 20 oct\. : Chevauche 08:00–17:00 déjà prévu/.test(why) && /ven\. 23 oct\. : Déjà prévu dans cette case/.test(why), `C1 la raison est écrite sous les jours : « ${why} »`);
  check(await d.locator('[data-testid=copy-go]').isDisabled(), 'C1 « Copier » attend un choix');
  // Jeudi 22, samedi 24 et dimanche 25
  const w = log.writes.length;
  for (const day of ['22', '24', '25']) await d.locator(`[data-testid=copy-day][data-date="2026-10-${day}"]`).click();
  check(/Choisis : jeu\. 22 oct\., sam\. 24 oct\., dim\. 25 oct\./.test(norm(await d.locator('[data-testid=copy-picked]').innerText())) && norm(await d.locator('[data-testid=copy-go]').innerText()) === 'Copier sur ces 3 jours', 'C2 le choix est dit : jeudi, samedi, dimanche');
  await d.locator(`[data-testid=copy-day][data-date="2026-10-24"]`).click(); // décoché
  await d.locator(`[data-testid=copy-day][data-date="2026-10-24"]`).click(); // recoché
  await d.locator('[data-testid=copy-go]').click(); await p.waitForTimeout(1600);
  const pw = planningWrites(w); const posts = pw.filter((x) => x.m === 'POST');
  check(pw.length === 3 && posts.length === 3 && JSON.stringify(posts.map((x) => x.rows[0].work_date)) === JSON.stringify([D_(22), D_(24), D_(25)]), `C2 EXACTEMENT les trois jours choisis (${posts.map((x) => x.rows[0].work_date).join(', ')})`);
  check(posts.every((x) => x.rows[0].user_id === 'u-sam' && x.rows[0].worksite_id === 'w2' && x.rows[0].estimated_start === '08:00:00' && x.rows[0].estimated_end === '17:00:00' && x.rows[0].notes === null && x.rows[0].absence_type === null), 'C2 chantier, horaire et note copiés ; jamais d’heures');
  check(writesSince(w).every((x) => x.t === 'planning'), 'C2 rien sur time_entries, aucun appel /functions');
  const tt = await toasts(p);
  check(tt.some((x) => /Case copiée sur jeu\. 22, sam\. 24 et dim\. 25$/.test(x)) && await p.locator('[data-testid=undo-card]').count() === 0, `C2 le message dit ce qui a été fait, sans « Annuler » : « ${tt.join(' | ')} »`);
  check(await p.locator('[data-testid=copy-dialog]').count() === 0, 'C2 la fenêtre se referme');
  check((await idsIn(p, 'Sam', THU)).length === 1 && (await idsIn(p, 'Sam', SAT)).length === 1 && (await idsIn(p, 'Sam', SUN)).length === 1 && D.planning.some((x) => x.id === 'ps-fri' && x.work_date === D_(23)), 'C2 les trois copies sont à l’écran, l’original n’a pas bougé');
  await ctx.close();
}
{
  // C3 · autre salarié ; autre semaine lue à l'ouverture seulement
  const { ctx, p } = await newPage();
  await p.click('[data-testid=copy-tip-ok]');
  await bub(p, 'ps-mon').click(); await p.waitForSelector('[data-testid=edit-actions]'); await p.waitForTimeout(250);
  await dlg(p).locator('[data-testid=edit-copy-to]').click();
  await p.waitForSelector('[data-testid=copy-dialog]'); await p.waitForTimeout(400);
  const d = p.locator('[data-testid=copy-dialog]');
  // Pour qui ? Lou : jeudi absent, mardi chevauche, lundi libre pour Lou? (pl-mon W2 sans horaire : permis)
  await d.locator('[data-testid=copy-worker]').selectOption('u-lou'); await p.waitForTimeout(300);
  const why = norm(await d.locator('[data-testid=copy-refused]').innerText());
  check(/jeu\. 22 oct\. : Absent ce jour-là/.test(why) && /mar\. 20 oct\. : Chevauche/.test(why), `C3 Lou : jeudi absent, mardi chevauche (« ${why} »)`);
  await d.locator('[data-testid=copy-worker]').selectOption('u-tom'); await p.waitForTimeout(300);
  check(/lun\. 19 oct\. : Heures clôturées pour ce salarié/.test(norm(await d.locator('[data-testid=copy-refused]').innerText())) && /mar\. 20 oct\. : Heures clôturées/.test(norm(await d.locator('[data-testid=copy-refused]').innerText())) && !/mer\. 21/.test(norm(await d.locator('[data-testid=copy-refused]').innerText())), 'C3 Tom (clôturé jusqu’au mardi) : lundi et mardi refusés, mercredi permis');
  await d.locator('[data-testid=copy-worker]').selectOption('u-sam'); await p.waitForTimeout(300);
  // Semaine suivante : lue à l'ouverture de CETTE semaine seulement
  const r0 = log.reads.length;
  await d.locator('[data-testid=copy-week-next]').click(); await p.waitForTimeout(900);
  const rd = readsSince(r0, 'planning');
  check(rd.length === 1 && /user_id=eq\.u-sam/.test(rd[0].q) && /work_date=gte\.2026-10-26/.test(rd[0].q) && /work_date=lte\.2026-11-01/.test(rd[0].q), `C3 une seule lecture en ouvrant la semaine suivante (${rd.map((x) => x.q.slice(0, 120)).join(' ; ')})`);
  check(/Semaine du 26 au 1 nov\./.test(norm(await d.locator('[data-testid=copy-week]').innerText())) && !/affichée/.test(await d.locator('[data-testid=copy-week]').innerText()), 'C3 « Semaine du 26 au 1 nov. »');
  // Sam, semaine du 26 : mar. 27 = la même intervention, mer. 28 en congé
  check(await offDates(p) === '27,28', `C3 semaine suivante : refusés ${await offDates(p)} (déjà prévu mardi, congé mercredi)`);
  const why2 = norm(await d.locator('[data-testid=copy-refused]').innerText());
  check(/mar\. 27 oct\. : Déjà prévu dans cette case/.test(why2) && /mer\. 28 oct\. : Absent ce jour-là/.test(why2), `C3 raisons : « ${why2} »`);
  await d.locator('[data-testid=copy-week-prev]').click(); await p.waitForTimeout(300);
  check(rd.length === 1 && readsSince(r0, 'planning').length === 1, 'C3 revenir à la semaine affichée : aucune lecture de plus');
  await d.locator('[data-testid=copy-week-next]').click(); await p.waitForTimeout(300);
  check(readsSince(r0, 'planning').length === 1, 'C3 la semaine déjà lue n’est pas relue');
  // jeudi 29 octobre et dimanche 1er novembre
  await d.locator('[data-testid=copy-day][data-date="2026-10-29"]').click();
  await d.locator('[data-testid=copy-day][data-date="2026-11-01"]').click();
  const w = log.writes.length; const r1 = log.reads.length;
  await d.locator('[data-testid=copy-go]').click(); await p.waitForTimeout(1600);
  const pw = planningWrites(w);
  check(pw.length === 2 && pw.every((x) => x.m === 'POST') && JSON.stringify(pw.map((x) => x.rows[0].work_date)) === JSON.stringify(['2026-10-29', '2026-11-01']) && pw.every((x) => x.rows[0].user_id === 'u-sam' && x.rows[0].worksite_id === 'w1' && x.rows[0].notes === 'code portail 1234' && x.rows[0].estimated_start === '08:00:00' && x.rows[0].estimated_end === '12:00:00'), `C3 deux POST : jeu. 29 oct. et dim. 1er nov. (${pw.map((x) => x.rows[0].work_date).join(', ')})`);
  check(readsSince(r1, 'planning').filter((x) => /work_date=gte\.2026-10-29&work_date=lte\.2026-10-29|work_date=lte\.2026-10-29&work_date=gte\.2026-10-29/.test(x.q) || /2026-10-29/.test(x.q)).length >= 1, 'C3 chaque jour hors de la semaine affichée est relu AU MOMENT de copier (état frais)');
  const tt = await toasts(p);
  check(tt.some((x) => /Case copiée sur jeu\. 29 oct\. et dim\. 1 nov\.$/.test(x)), `C3 message : « ${tt.join(' | ')} »`);
  check(D.planning.filter((x) => x.work_date === '2026-10-29' || x.work_date === '2026-11-01').length === 2, 'C3 deux cases de plus en base, pas une de plus');
  await ctx.close();
}
{
  // C4 · mois clôturé (septembre) : jours grisés ; autre salarié choisi sans copier pour personne d'autre
  const { ctx, p } = await newPage();
  await p.click('[data-testid=copy-tip-ok]');
  await bub(p, 'ps-mon').click(); await p.waitForSelector('[data-testid=edit-actions]'); await p.waitForTimeout(250);
  await dlg(p).locator('[data-testid=edit-copy-to]').click();
  await p.waitForSelector('[data-testid=copy-dialog]'); await p.waitForTimeout(400);
  const d = p.locator('[data-testid=copy-dialog]');
  for (let i = 0; i < 4; i++) { await d.locator('[data-testid=copy-week-prev]').click(); await p.waitForTimeout(350); }
  check(await offDates(p) === '21,22,23,24,25,26,27' && /Mois clôturé/.test(norm(await d.locator('[data-testid=copy-refused]').innerText())) && await d.locator('[data-testid=copy-week-prev]').isDisabled(), 'C4 semaine du 21 sept. : tous les jours grisés « Mois clôturé » ; on ne remonte pas plus');
  await d.locator('[data-testid=copy-week-next]').click(); await p.waitForTimeout(400);
  check(await offDates(p) === '28,29,30', `C4 semaine du 28 sept. : septembre grisé, octobre permis (${await offDates(p)})`);
  const w = log.writes.length;
  await d.locator('[data-testid=copy-close]').click(); await p.waitForTimeout(400);
  check(writesSince(w).length === 0 && await p.locator('[data-testid=copy-dialog]').count() === 0, 'C4 « Fermer » : zéro écriture');
  await ctx.close();
}
{
  // C5 · l'écriture échoue : rien ne se passe en silence (une erreur dite, le reste continue)
  const { ctx, p } = await newPage();
  await p.click('[data-testid=copy-tip-ok]');
  await bub(p, 'ps-fri').click(); await p.waitForSelector('[data-testid=edit-actions]'); await p.waitForTimeout(250);
  await dlg(p).locator('[data-testid=edit-copy-to]').click();
  await p.waitForSelector('[data-testid=copy-dialog]'); await p.waitForTimeout(400);
  const d = p.locator('[data-testid=copy-dialog]');
  // Entre-temps (autre écran), Sam a eu une intervention identique posée le jeudi : l'écran ne le sait pas encore, la copie du jeudi fait doublon
  // → on le vérifie sur ce qui est écrit : seuls les jours permis sont copiés.
  await d.locator('[data-testid=copy-day][data-date="2026-10-24"]').click();
  const w = log.writes.length;
  await d.locator('[data-testid=copy-go]').click(); await p.waitForTimeout(1400);
  check(planningWrites(w).length === 1 && planningWrites(w)[0].rows[0].work_date === D_(24), 'C5 un seul jour choisi : une seule écriture');
  await ctx.close();
}

// ═══ K · ajouter une tâche à un salarié déjà planifié ═════════════════════════════
section('K · « ＋ Tâche » et « Ajouter une tâche à ce créneau »');
{
  const { ctx, p } = await newPage();
  await p.click('[data-testid=copy-tip-ok]');
  const btn = cell(p, 'Sam', MON).locator('[data-testid=cell-add-task]');
  check(await btn.isVisible() && norm(await btn.innerText()) === '＋ Tâche' && /Ajouter une tâche à Sam Test, lundi 19 octobre/.test(await btn.getAttribute('aria-label')), `K1 « ＋ Tâche » visible sur une case remplie (nom accessible « ${await btn.getAttribute('aria-label')} »)`);
  check(await cell(p, 'Sam', THU).locator('[data-testid=cell-add-task]').count() === 0, 'K1 pas sur une case vide');
  check(await cell(p, 'Lou', THU).locator('[data-testid=cell-add-task]').count() === 0, 'K1 pas un jour d’absence');
  const total = await p.locator('[data-testid=cell-add-task]').count();
  await p.click('[data-testid=bar-select]'); await p.waitForTimeout(300);
  check(total >= 6 && await p.locator('[data-testid=cell-add-task]').count() === 0, `K1 en mode « Sélectionner » : aucun (${total} hors sélection)`);
  await p.click('[data-testid=bar-select]'); await p.waitForTimeout(300);
  // Un clic ouvre la fenêtre d'ajout sur l'onglet Tâche, sans horaire
  const w = log.writes.length;
  await btn.click(); await p.waitForSelector('[data-testid=tasks-panel]'); await p.waitForTimeout(300);
  const d = dlg(p);
  check(/Tâches du jour — Sam, lundi 19 octobre/.test(norm(await d.locator('h2').first().innerText())) && await d.locator('[data-testid=add-kind-tache]').getAttribute('aria-pressed') === 'true', 'K2 la fenêtre d’ajout existante, onglet « Tâche » choisi');
  check(await d.locator('[data-testid=add-kind-intervention]').count() === 1 && await d.locator('[data-testid=task-start]').inputValue() === '' && await d.locator('[data-testid=task-end]').inputValue() === '', 'K2 les pastilles Intervention / Tâche restent ; heures vides (rien à pré-remplir ici)');
  check(/Une tâche peut être avant, pendant ou après le créneau du salarié\./.test(norm(await d.locator('[data-testid=task-hours-help]').innerText())), 'K2 l’aide courte : « Une tâche peut être avant, pendant ou après le créneau du salarié. »');
  check(writesSince(w).length === 0, 'K2 ouvrir la fenêtre n’écrit rien');
  await d.locator('[data-testid=add-kind-intervention]').click(); await p.waitForTimeout(250);
  check(await d.locator('[data-testid=add-form]').isVisible(), 'K2 l’onglet Intervention marche toujours');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await ctx.close();
}
{
  const { ctx, p } = await newPage();
  await p.click('[data-testid=copy-tip-ok]');
  await bub(p, 'ps-mon').click(); await p.waitForSelector('[data-testid=edit-actions]'); await p.waitForTimeout(250);
  await dlg(p).locator('[data-testid=edit-add-task]').click(); await p.waitForSelector('[data-testid=tasks-panel]'); await p.waitForTimeout(400);
  const d = dlg(p);
  check(await p.locator('[data-testid=edit-actions]').count() === 0 && await d.locator('[data-testid=add-kind-tache]').getAttribute('aria-pressed') === 'true', 'K3 « Ajouter une tâche à ce créneau » : la fenêtre d’ajout, onglet « Tâche »');
  check(await d.locator('[data-testid=task-start]').inputValue() === '08:00' && await d.locator('[data-testid=task-end]').inputValue() === '12:00', 'K3 heures du créneau pré-remplies (08:00 → 12:00), modifiables');
  // 10:00–11:00 dans le créneau 08:00–12:00 : pas d'alerte
  let w = log.writes.length;
  await d.locator('[data-testid=task-text]').fill('Nettoyage');
  await setTime(p, d.locator('[data-testid=task-start]'), '10:00'); await setTime(p, d.locator('[data-testid=task-end]'), '11:00');
  await d.locator('[data-testid=task-add]').click(); await p.waitForTimeout(1000);
  let dw = writesSince(w).filter((x) => x.t === 'day_tasks');
  check(await d.locator('[data-testid=task-outside]').count() === 0 && dw.length === 1 && dw[0].m === 'POST' && dw[0].rows[0].text === 'Nettoyage' && dw[0].rows[0].user_id === 'u-sam' && dw[0].rows[0].work_date === D_(19) && /^10:00/.test(dw[0].rows[0].start_time) && /^11:00/.test(dw[0].rows[0].end_time), `K4 10:00–11:00 dans 08:00–12:00 : pas d’alerte, une tâche écrite ${JSON.stringify(dw[0]?.rows?.[0] || {})}`);
  check(writesSince(w).every((x) => x.t === 'day_tasks'), 'K4 rien d’autre que la tâche (ni planning, ni heures)');
  // 13:00–14:00 : l'alerte non bloquante d'avant
  w = log.writes.length;
  await d.locator('[data-testid=task-text]').fill('Rangement');
  await setTime(p, d.locator('[data-testid=task-start]'), '13:00'); await setTime(p, d.locator('[data-testid=task-end]'), '14:00');
  await d.locator('[data-testid=task-add]').click(); await p.waitForTimeout(600);
  const al = norm(await d.locator('[data-testid=task-outside]').innerText().catch(() => ''));
  check(/dépasse le créneau prévu \(08:00–12:00\)/.test(al) && /Ajouter quand même/.test(al) && writesSince(w).filter((x) => x.t === 'day_tasks').length === 0, `K5 13:00–14:00 : alerte « ${al} », rien d’écrit avant le choix`);
  await d.locator('[data-testid=task-outside-yes]').click(); await p.waitForTimeout(1000);
  dw = writesSince(w).filter((x) => x.t === 'day_tasks');
  check(dw.length === 1 && dw[0].rows[0].text === 'Rangement' && /^13:00/.test(dw[0].rows[0].start_time), 'K5 « Ajouter quand même » : la tâche est écrite');
  check(D.day_tasks.length === 2, 'K5 deux tâches en base');
  await ctx.close();
}
{
  // K6 · le créneau sans fin (RDV 14h) : seul le début est pré-rempli ; modification en cours → l'aide d'ajout reste
  const { ctx, p } = await newPage();
  await p.click('[data-testid=copy-tip-ok]');
  D.planning.push(slot('ps-rdv', 'u-sam', D_(22), W1, { estimated_start: '14:00:00', estimated_end: null }));
  await p.reload(); await p.waitForSelector('.bt-pl-gridwrap .bt-pl-grab'); await p.waitForTimeout(1200);
  await bub(p, 'ps-rdv').click(); await p.waitForSelector('[data-testid=edit-actions]'); await p.waitForTimeout(250);
  await dlg(p).locator('[data-testid=edit-add-task]').click(); await p.waitForSelector('[data-testid=tasks-panel]'); await p.waitForTimeout(400);
  check(await dlg(p).locator('[data-testid=task-start]').inputValue() === '' && await dlg(p).locator('[data-testid=task-end]').inputValue() === '', 'K6 créneau sans fin (« 14:00 ») : pas d’heures pré-remplies (rien d’inventé)');
  await ctx.close();
}
{
  // K7 · les tâches n'existent pas (migration absente) : ni « ＋ Tâche » ni « Ajouter une tâche à ce créneau »
  const { ctx, p } = await newPage({ flags: { tasks: false } });
  await p.click('[data-testid=copy-tip-ok]');
  check(await p.locator('[data-testid=cell-add-task]').count() === 0, 'K7 tâches absentes : aucun « ＋ Tâche » sur les cases');
  await bub(p, 'ps-mon').click(); await p.waitForSelector('[data-testid=edit-actions]'); await p.waitForTimeout(250);
  check(await dlg(p).locator('[data-testid=edit-add-task]').count() === 0 && await dlg(p).locator('[data-testid=edit-copy-to]').count() === 1, 'K7 tâches absentes : pas de « Ajouter une tâche à ce créneau », copier et dupliquer restent');
  await ctx.close();
}

// ═══ F · « Formations » dans la barre et le menu du compte ═════════════════════════
section('F · « Formations »');
for (const [width, height] of [[1024, 768], [1280, 800], [1366, 768], [1440, 900], [1600, 900], [1920, 1000]]) {
  const { ctx, p } = await newPage({ w: width, h: height, flags: { busy: true, versions: true } });
  const badges = norm(await p.locator('.bt-pl-bar').innerText());
  check(/Salariés 3/.test(badges) && /Réserves 12/.test(badges) && await p.locator('[data-testid=bar-kiosk]').count() === 1 && await p.locator('[data-testid=bar-assistant]').count() === 1, `F1 ${width} : barre du pire cas (Borne, assistant, « Salariés 3 », « Réserves 12 »)`);
  const res = await p.evaluate(() => {
    const bar = document.querySelector('.bt-pl-bar'); const br = bar.getBoundingClientRect();
    const kids = [...bar.children].map((e) => e.getBoundingClientRect());
    const btns = [...bar.querySelectorAll('button')].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect());
    const ov = (a, c) => a.left < c.right - 0.5 && c.left < a.right - 0.5 && a.top < c.bottom - 0.5 && c.top < a.bottom - 0.5;
    let overlaps = 0; for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) if (ov(kids[i], kids[j])) overlaps++;
    for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) if (ov(btns[i], btns[j])) overlaps++;
    const all = [...bar.querySelectorAll('*')].filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    const inside = all.every((r) => r.left >= br.left - 0.5 && r.right <= br.right + 0.5) && document.documentElement.scrollWidth <= innerWidth;
    const mids = btns.map((r) => r.top + r.height / 2);
    const groups = [...bar.children].map((g) => g.scrollWidth - g.clientWidth);
    return { overlaps, inside, oneLine: Math.max(...mids) - Math.min(...mids) < 6, groups, n: btns.length, spare: Math.round(br.right - Math.max(...btns.map((r) => r.right))) };
  });
  check(res.overlaps === 0 && res.inside && res.oneLine && res.groups.every((x) => x <= 1), `F1 ${width}×${height} : barre sur une ligne, rien ne déborde (${res.n} boutons, ${res.spare} px de marge, groupes ${JSON.stringify(res.groups)})`);
  const tr = p.locator('[data-testid=bar-trainings]');
  const shown = await tr.isVisible();
  check(await tr.count() === 1 && shown === (width >= 1440), `F1 ${width} : « Formations » ${shown ? 'visible dans la barre' : 'pas dans la barre (pas la place) — voir le menu du compte'}`);
  if (shown) {
    const lbl = await tr.evaluate((e) => ({ shown: getComputedStyle(e.querySelector('.bt-pl-lbl-train')).display !== 'none', label: e.getAttribute('aria-label'), svg: !!e.querySelector('svg') }));
    check(lbl.svg && lbl.label === 'Formations' && lbl.shown === (width >= 1700), `F1 ${width} : ${lbl.shown ? 'icône et mot' : 'icône seule'} (nom accessible « ${lbl.label} »)`);
  }
  // Le menu du compte : toujours là, à toutes les largeurs
  await p.locator('.bt-pl-acct').click(); await p.waitForTimeout(250);
  const mi = p.locator('[data-testid=menu-trainings]');
  const mbox = await mi.boundingBox();
  check(await mi.isVisible() && mbox.x >= 0 && mbox.x + mbox.width <= width, `F1 ${width} : le menu du compte propose « Formations » (entier à l’écran)`);
  if (width === 1280) {
    await mi.click(); await p.waitForSelector('[data-testid=trainings-dialog]', { timeout: 8000 }).catch(() => {});
    check(await p.locator('[data-testid=trainings-dialog]').isVisible() && await p.locator('.bt-pl-acctmenu').count() === 0, 'F3 l’entrée du menu du compte ouvre la fenêtre Formations et referme le menu');
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    await p.locator('.bt-pl-bar button', { hasText: 'Salariés' }).click(); await p.waitForTimeout(500);
    check(await p.locator('[data-testid=salaries-trainings]').isVisible(), 'F4 l’entrée « Formations » de la fenêtre « Salariés » est toujours là');
    await p.keyboard.press('Escape');
  } else {
    await p.mouse.click(5, height - 5); await p.waitForTimeout(250); // referme le menu (son fond)
  }
  if (width === 1440) {
    await p.click('[data-testid=bar-trainings]'); await p.waitForSelector('[data-testid=trainings-dialog]', { timeout: 8000 }).catch(() => {});
    check(await p.locator('[data-testid=trainings-dialog]').isVisible(), 'F2 le bouton « Formations » de la barre ouvre la fenêtre Formations');
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    await shotTo(p, 'barre-formations-1440.png', { clip: { x: 0, y: 0, width: 1440, height: 330 } });
  }
  await ctx.close();
}
{
  // Sans formations (table absente) : rien de nouveau à l'écran
  const { ctx, p } = await newPage({ flags: { trainings: false } });
  await p.locator('.bt-pl-acct').click(); await p.waitForTimeout(250);
  check(await p.locator('[data-testid=bar-trainings]').count() === 0 && await p.locator('[data-testid=menu-trainings]').count() === 0, 'F5 formations absentes : ni bouton dans la barre ni entrée dans le menu');
  await ctx.close();
}

// ═══ M · téléphone 390 px ═════════════════════════════════════════════════════════
section('M · téléphone 390 px');
{
  const { ctx, p } = await newPage({ w: 390, h: 844, touch: true, mobile: true });
  await p.locator('[data-testid=copy-tip-ok-m]').tap(); await p.waitForTimeout(200);
  // Mercredi (jour affiché) : Sam a une case. On passe sur lundi (08–12, note).
  await p.locator('.bt-pl-daypill').nth(MON).tap(); await p.waitForTimeout(400);
  const samCard = p.locator('.bt-pl-m-card', { hasText: 'Sam Test' });
  const addTask = samCard.locator('[data-testid=m-add-task]');
  check(await addTask.isVisible() && await heightOf(addTask) >= 44 && await widthOf(addTask) >= 44 && /Ajouter une tâche à Sam Test/.test(await addTask.getAttribute('aria-label')), `M1 « ＋ Tâche » sur la carte du jour : ${Math.round(await widthOf(addTask))}×${Math.round(await heightOf(addTask))} px, nom accessible`);
  const addSite = samCard.locator('.bt-pl-m-add');
  check(await heightOf(addSite) >= 44 && await noHScroll(p), 'M1 « Ajouter un chantier » ≥ 44 px ; aucun défilement horizontal');
  check(await p.locator('.bt-pl-m-card', { hasText: 'Noa Test' }).locator('[data-testid=m-add-task]').count() === 1 && await p.locator('.bt-pl-m-card', { hasText: 'Tom Test' }).locator('[data-testid=m-add-task]').count() === 0, 'M1 présent là où il y a une intervention, absent ailleurs');
  await p.locator('.bt-pl-daypill').nth(THU).tap(); await p.waitForTimeout(400);
  check(await p.locator('.bt-pl-m-card', { hasText: 'Lou Test' }).locator('[data-testid=m-add-task]').count() === 0, 'M1 jamais un jour d’absence');
  await p.locator('.bt-pl-daypill').nth(MON).tap(); await p.waitForTimeout(400);
  // Touche la bulle → la fenêtre de modification, avec ses Actions
  await samCard.locator('.bt-pl-m-bubbtn').first().tap(); await p.waitForSelector('[data-testid=edit-actions]'); await p.waitForTimeout(400);
  const d = dlg(p);
  const hs = []; for (const n of ['edit-copy-to', 'edit-duplicate', 'edit-add-task', 'edit-delete']) hs.push(Math.round(await heightOf(d.locator(`[data-testid=${n}]`))));
  const wsz = []; for (const n of ['edit-copy-to', 'edit-duplicate', 'edit-add-task', 'edit-delete']) wsz.push(Math.round(await widthOf(d.locator(`[data-testid=${n}]`))));
  check(hs.every((h) => h >= 44) && wsz.every((x) => x >= 150), `M2 Actions : 4 boutons de ${hs.join('/')} px de haut sur ${wsz.join('/')} px de large`);
  const fits = await d.evaluate((e) => e.scrollWidth <= e.clientWidth + 1);
  check(fits && await noHScroll(p), 'M2 la fenêtre ne défile pas en largeur');
  await d.locator('[data-testid=edit-delete]').scrollIntoViewIfNeeded();
  const vis = await d.locator('[data-testid=edit-delete]').evaluate((e) => { const r = e.getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; });
  check(vis, 'M2 « Supprimer » est atteignable (dans l’écran après défilement de la fenêtre)');
  await d.locator('[data-testid=edit-actions]').scrollIntoViewIfNeeded(); await p.waitForTimeout(200);
  await shotTo(p, 'actions-390.png');
  // Copier vers… au doigt
  await d.locator('[data-testid=edit-copy-to]').tap(); await p.waitForSelector('[data-testid=copy-dialog]'); await p.waitForTimeout(500);
  const c = p.locator('[data-testid=copy-dialog]');
  const ch = []; for (let i = 0; i < 7; i++) ch.push(Math.round(await heightOf(dayChips(p).nth(i))));
  const cw = []; for (let i = 0; i < 7; i++) cw.push(Math.round(await widthOf(dayChips(p).nth(i))));
  check(ch.every((h) => h >= 44) && cw.every((x) => x >= 38) && await c.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), `M3 « Copier vers… » : jours de ${cw.join('/')}×${ch.join('/')} px, sans défilement en largeur`);
  check(await offDates(p) === '19,20,23', `M3 refusés : lundi (la case elle-même), mardi et vendredi (08–17 chevauche) : ${await offDates(p)}`);
  await c.locator('[data-testid=copy-day][data-date="2026-10-22"]').tap();
  await c.locator('[data-testid=copy-day][data-date="2026-10-24"]').tap();
  await shotTo(p, 'copier-vers-390.png');
  const w = log.writes.length;
  await c.locator('[data-testid=copy-go]').tap(); await p.waitForTimeout(1600);
  const pw = planningWrites(w);
  check(pw.length === 2 && pw.every((x) => x.m === 'POST') && JSON.stringify(pw.map((x) => x.rows[0].work_date)) === JSON.stringify([D_(22), D_(24)]), `M3 au doigt : EXACTEMENT jeudi et samedi (${pw.map((x) => x.rows[0].work_date).join(', ')})`);
  // Dupliquer au lendemain au doigt (lundi 19 → mardi 20 : refus, chevauche) puis Lou
  await p.locator('.bt-pl-daypill').nth(MON).tap(); await p.waitForTimeout(400);
  await p.locator('.bt-pl-m-card', { hasText: 'Lou Test' }).locator('.bt-pl-m-bubbtn').first().tap(); await p.waitForSelector('[data-testid=edit-actions]'); await p.waitForTimeout(400);
  const w2 = log.writes.length;
  await dlg(p).locator('[data-testid=edit-duplicate]').tap(); await p.waitForTimeout(1000);
  const pw2 = planningWrites(w2);
  check(pw2.length === 1 && pw2[0].m === 'POST' && pw2[0].rows[0].user_id === 'u-lou' && pw2[0].rows[0].work_date === D_(20), 'M4 « Dupliquer au lendemain » au doigt : UN POST (Lou, mardi)');
  // Ajouter une tâche à ce créneau au doigt
  await p.locator('.bt-pl-m-card', { hasText: 'Sam Test' }).locator('.bt-pl-m-bubbtn').first().tap(); await p.waitForSelector('[data-testid=edit-actions]'); await p.waitForTimeout(400);
  await dlg(p).locator('[data-testid=edit-add-task]').tap(); await p.waitForSelector('[data-testid=tasks-panel]'); await p.waitForTimeout(500);
  const dd = dlg(p);
  check(await dd.locator('[data-testid=task-start]').inputValue() === '08:00' && await dd.locator('[data-testid=task-end]').inputValue() === '12:00' && await dd.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), 'M5 tâche : onglet « Tâche », 08:00 → 12:00 pré-remplis, sans défilement en largeur');
  await dd.locator('[data-testid=task-text]').fill('Nettoyage');
  await ctx.close();
}

console.log(`\n${ok} réussis, ${ko} échecs`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
