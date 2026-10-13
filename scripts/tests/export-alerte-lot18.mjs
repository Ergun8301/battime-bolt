// Lancer : node scripts/tests/export-alerte-lot18.mjs out docs/captures-alerte-export 42600 (après npm run build).
// (playwright-core doit être résoluble : copier le script à côté d'un node_modules qui l'a.)
// Lot 18 — l'alerte AVANT l'export d'équipe qui verrouille les heures, sur la VRAIE page planning
// (base simulée qui applique les écritures : rien n'est écrit en vrai) :
//  A) 1280 px : « Exporter ▾ › CSV » ouvre l'alerte avec les chiffres EXACTS (N lignes, M salariés, déjà verrouillées) ;
//     « Annuler » n'écrit rien, ne télécharge rien, rend le focus ; « sans verrouiller » télécharge SANS aucune écriture ;
//     « Exporter et verrouiller » télécharge le MÊME fichier et verrouille exactement N lignes (+ les déjà faites, comme avant) ;
//     tout est déjà verrouillé : pas d'alerte, l'export part comme avant ; période vide : pas d'alerte.
//  B) 390 px : l'alerte tient dans l'écran, boutons ≥ 44 px, focus piégé (Tab / Maj+Tab), Échap = annuler + focus rendu,
//     Excel et PDF passent aussi par l'alerte.
//  C) mode support (lecture seule) : pas d'alerte, le fichier sort, aucune écriture, aucun comptage.
//  D) « Envoyer au comptable » : alerte à 2 choix (pas de « sans verrouiller »), rien n'est envoyé avant le choix.
//  E) les chiffres ont bougé entre l'alerte et le clic : on remontre les chiffres, rien n'est exporté ni verrouillé.
//  F) comptage impossible : aucun export, aucune écriture, un message.
//  G) plus de 1000 lignes : le compte est exact (lecture paginée) et tout est verrouillé.
//  H) l'alerte ne charge ni Excel ni jsPDF et n'est pas dans le chargement de /admin (chunk à l'ouverture).
//  I) rien à verrouiller (alerte non affichée) mais une ligne arrive PENDANT les lectures de l'export : l'alerte s'ouvre, rien n'est verrouillé.
//  J) la période de l'alerte est celle de l'export (même si l'écran en change) ; boutons de période inactifs pendant le comptage.
//  K) le verrou échoue APRÈS le fichier (en totalité, ou en partie) : message honnête, jamais « Erreur lors de l'export ».
//  L) lectures de l'export : mêmes statuts partout, ordre complet (… start_time, id) pour des pages sans doublon ni trou.
// Captures (390 px, 4 au plus) : alerte, chiffres changés, comptable, export sans verrou.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { chromium } from 'playwright-core';
const [,, OUT, SH, PORT = '42600'] = process.argv;
const run = (n) => !process.env.ONLY || process.env.ONLY.split(',').includes(n); // ONLY=I,J,K,L : seulement ces parties fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT), r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ─── Dates (jour de Paris), horloge FIXÉE au 20 du mois en cours ───────────────
const today = `${new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }).slice(0, 8)}20`;
const FIXED_NOW = new Date(`${today}T10:00:00+02:00`);
const day = (n, from = today) => { const x = new Date(`${from}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const dow = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = dimanche
const WS = day(-((dow(today) + 6) % 7)); // lundi de la semaine du 20 (« Cette semaine »)
const WE = day(6, WS);
const fr = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const PERIODE = `du ${fr(WS)} au ${fr(WE)}`;

// ─── Base simulée ──────────────────────────────────────────────────────────────
const CO = 'c0000000-0000-0000-0000-000000000001'; const OTHER = 'c0000000-0000-0000-0000-0000000000ff';
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', is_active: true };
const u = (id, first_name, last_name, role = 'worker', company_id = CO) => ({ id, company_id, first_name, last_name, role, email: `${id}@x.fr`, is_active: true, created_at: '2026-01-01' });
const USERS = [u('u-admin', 'Paul', 'Martin', 'admin'), u('u-lucas', 'Lucas', 'Petit'), u('u-nina', 'Nina', 'Roux'), u('u-long', 'Maximilien-Alexandre', 'De La Fontaine-Beaumarchais'), u('u-ext', 'Eva', 'Autre', 'worker', OTHER)];
const nameOf = Object.fromEntries(USERS.map((x) => [x.id, { first_name: x.first_name, last_name: x.last_name }]));
const hh = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
const entry = (id, user_id, work_date, status, minutes, extra = {}) => ({
  id, company_id: CO, user_id, work_date, worksite_id: 'w1', planning_id: null, status, start_time: hh(8 * 60), end_time: hh(8 * 60 + minutes),
  break_minutes: 0, total_minutes: minutes, meal_allowance: false, observation: null, reception: null, gap_before: null,
  modified_at: null, exported_at: null, locked: false, reserve_resolved_at: null,
  worksite: { id: 'w1', client_name: W1.client_name, city: W1.city }, user: nameOf[user_id], ...extra,
});
const LOCKED = { locked: true, exported_at: `${day(-3)}T10:00:00Z` };
// À verrouiller (N = 4 lignes, M = 3 salariés) : a1 a2 (Lucas) a3 (Nina) a4 (Long).
// Déjà verrouillées (2) : a5 a6 (Nina). Jamais exportées : brouillon, retirée, hors période, autre entreprise.
const ENTRIES = () => [
  entry('a1', 'u-lucas', WS, 'submitted', 7 * 60),
  entry('a2', 'u-lucas', day(1, WS), 'validated', 8 * 60),
  entry('a3', 'u-nina', day(1, WS), 'submitted', 6 * 60),
  entry('a4', 'u-long', day(2, WS), 'submitted', 5 * 60),
  entry('a5', 'u-nina', WS, 'submitted', 4 * 60, LOCKED),
  entry('a6', 'u-nina', day(3, WS), 'validated', 3 * 60, LOCKED),
  entry('d1', 'u-lucas', day(2, WS), 'draft', 60),
  entry('c1', 'u-nina', day(2, WS), 'cancelled', 90),
  entry('o1', 'u-lucas', day(-1, WS), 'submitted', 9 * 60),
  entry('o2', 'u-lucas', day(7, WS), 'submitted', 9 * 60),
  { ...entry('x1', 'u-ext', WS, 'submitted', 8 * 60), company_id: OTHER },
];
const IN_FILE = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']; // ce que l'export lit (et verrouille, comme avant)
const TO_LOCK = ['a1', 'a2', 'a3', 'a4'];              // ce que l'alerte annonce
const COMPANY = { id: CO, name: 'Pizzeria Exemple', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, travel_paid: false, accountant_email: null };
const freshDb = ({ accountant = false } = {}) => ({
  users: USERS.map((x) => ({ ...x })),
  companies: [{ ...COMPANY, accountant_email: accountant ? 'compta@exemple.fr' : null }],
  worksites: [W1], planning: [], time_entries: ENTRIES(),
  user_payroll: [{ user_id: 'u-lucas', company_id: CO, payroll_id: '00042', weekly_hours: null }, { user_id: 'u-nina', company_id: CO, payroll_id: '00077', weekly_hours: null }],
  user_closures: [], active_sessions: [], month_closures: [], leave_requests: [], invitations: [], documents: [], certifications: [], push_subscriptions: [],
  kiosks: [], kiosk_settings: [], time_entry_corrections: [], time_entry_positions: [],
});

const now = Math.floor(Math.max(Date.now(), FIXED_NOW.getTime()) / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-admin', role: 'authenticated', exp: now + 36000, aal: 'aal1' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', expires_at: now + 36000, expires_in: 36000, token_type: 'bearer', user: { id: 'u-admin', email: 'paul@exemple.fr', aud: 'authenticated', role: 'authenticated' } };
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
      if (op === 'is') return val === 'null' ? cur == null : String(cur) === val;
      return true;
    });
  }
  return rows;
};
/**
 * `reads` : lectures de time_entries faites par le COMPTAGE de l'alerte (select = id,user_id,locked) ;
 * `writes` : TOUT ce qui n'est pas une lecture (PATCH, POST, fonctions) ; les PATCH time_entries sont APPLIQUÉS à la base simulée.
 */
const setup = async (ctx, { accountant = false, support = false, rows } = {}) => {
  const db = freshDb({ accountant }); if (rows) db.time_entries = rows;
  const writes = []; const reads = []; const allReads = [];
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  if (support) await ctx.addInitScript((v) => { sessionStorage.setItem('bemexo-support', JSON.stringify(v)); }, { staffId: 'u-admin', companyId: CO, name: 'Pizzeria Exemple', expiresAt: '2030-01-01T10:00:00Z' });
  await ctx.clock.setFixedTime(FIXED_NOW);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const req = r.request(); const url = new URL(req.url());
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/')) { let body = null; try { body = req.postDataJSON(); } catch { /* pas du JSON */ } writes.push({ m: 'FN', t: url.pathname, body }); return r.fulfill({ json: {} }); }
    if (url.pathname.endsWith('/rpc/support_enter')) return r.fulfill({ json: [{ name: 'Pizzeria Exemple', expires_at: '2030-01-01T10:00:00Z' }] });
    if (url.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
    const t = url.pathname.replace('/rest/v1/', ''); const m = req.method();
    if (m !== 'GET' && m !== 'HEAD') {
      let body = null; try { body = req.postDataJSON(); } catch { body = req.postData(); }
      writes.push({ m, t, q: url.search, body });
      if (t === 'time_entries' && m === 'PATCH') {
        db.patchN = (db.patchN || 0) + 1;
        if ((db.failLockAt || []).includes(db.patchN)) return r.fulfill({ status: 500, json: { message: 'boom', code: 'XX000' } });
        const hit = filterRows(db.time_entries, url.searchParams);
        for (const x of hit) Object.assign(x, body);
        return r.fulfill({ status: 204, body: '' });
      }
      return r.fulfill({ status: 201, json: {} });
    }
    if (t === 'time_entries') allReads.push({ select: url.searchParams.get('select'), order: url.searchParams.get('order'), status: url.searchParams.get('status'), wd: url.searchParams.getAll('work_date') });
    if (t === 'user_payroll' && db.inject) { const f = db.inject; db.inject = null; f(); } // une ligne arrive pendant les lectures de l'export
    if (t === 'time_entries' && url.searchParams.get('select') === 'id,user_id,locked') {
      reads.push(url.search);
      if (db.delayCount) await sleep(db.delayCount);
      if (db.failCount) return r.fulfill({ status: 500, json: { message: 'boom' } });
    }
    let rows = filterRows(db[t] || [], url.searchParams);
    const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
    if (off || lim) rows = rows.slice(off, lim ? off + Number(lim) : undefined);
    if ((req.headers()['accept'] || '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}`, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' } });
  });
  return { db, writes, reads, allReads };
};

let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
let nShots = 0;
const shot = async (pg, name) => { nShots++; await pg.waitForTimeout(500); await pg.screenshot({ path: path.join(SH, name) }); };

// ─── Les chunks lourds (xlsx, jsPDF) et celui de l'alerte, reconnus par leur CONTENU dans out/ ───
const FINGER = { xlsx: /parse_xlscfb/, jspdf: /jsPDF\.API/, autotable: /autoTableSetDefaults/ };
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const HEAVY = new Map(); const ALERT = new Set();
for (const f of walk(path.join(OUT, '_next', 'static')).filter((x) => x.endsWith('.js'))) {
  const txt = fs.readFileSync(f, 'utf8'); const kinds = Object.keys(FINGER).filter((k) => FINGER[k].test(txt));
  const rel = '/' + path.relative(OUT, f).split(path.sep).join('/');
  if (kinds.length) HEAVY.set(rel, kinds);
  if (txt.includes('export-verrou-confirm')) ALERT.add(rel);
}
check(ALERT.size === 1, `le code de l'alerte est dans UN fichier à part (${[...ALERT].join(',')})`);
check(![...ALERT].some((f) => HEAVY.has(f)), 'ce fichier ne contient ni Excel ni jsPDF');
const watch = (pg) => { const seen = []; pg.on('request', (r) => { const p = new URL(r.url()).pathname; if (p.startsWith('/_next/static/') && p.endsWith('.js')) seen.push({ t: Date.now(), path: p }); }); return seen; };
const heavyOf = (seen, since = 0) => [...new Set(seen.filter((s) => s.t >= since && HEAVY.has(s.path)).flatMap((s) => HEAVY.get(s.path)))].sort();
const alertChunkSeen = (seen, since = 0) => seen.some((s) => s.t >= since && ALERT.has(s.path));

// ─── Gestes ────────────────────────────────────────────────────────────────────
const openAdmin = async (ctx) => {
  const pg = await ctx.newPage(); pg.on('pageerror', (e) => errors.push(e.message));
  const seen = watch(pg);
  await pg.goto(`http://localhost:${PORT}/admin`);
  await pg.locator('button:visible', { hasText: 'Lucas Petit' }).first().waitFor({ timeout: 25000 });
  await pg.waitForTimeout(800);
  return { pg, seen };
};
const openTeamExport = async (pg, mobile, période = 'Cette semaine') => {
  if (mobile) { await pg.locator('.bt-pl-m-ibtn[aria-label="Menu"]').click(); await pg.locator('[data-testid=mm-export]').click(); }
  else await pg.locator('[data-testid=bar-export]:visible').first().click();
  const team = pg.locator('[data-testid=team-export]'); await team.waitFor();
  await team.getByRole('button', { name: période, exact: true }).click();
  await pg.waitForTimeout(200);
  return team;
};
const pick = async (pg, team, kind) => { await team.locator('[data-testid=team-export-menu]').click(); await pg.locator(`[data-testid=team-export-menu-${kind}]`).click(); };
const alertBox = (pg) => pg.locator('[data-testid=export-verrou]');
const waitAlert = async (pg) => { await alertBox(pg).waitFor({ timeout: 8000 }); await pg.waitForTimeout(350); };
const alertText = (pg) => alertBox(pg).locator('[data-testid=export-verrou-texte]').innerText();
const closed = (pg) => alertBox(pg).waitFor({ state: 'detached', timeout: 5000 }).then(() => true).catch(() => false);
const focusId = (pg) => pg.evaluate(() => document.activeElement?.getAttribute('data-testid') || document.activeElement?.tagName);
const download = async (pg, click) => {
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 15000 }), click()]);
  return { name: dl.suggestedFilename(), buf: fs.readFileSync(await dl.path()) };
};
/** Vrai si AUCUN téléchargement n'arrive pendant `ms` après le geste. */
const noDownload = async (pg, click, ms = 1500) => { let got = false; const h = () => { got = true; }; pg.on('download', h); await click(); await pg.waitForTimeout(ms); pg.off('download', h); return !got; };
const toasts = (pg) => pg.locator('[data-sonner-toast]').allInnerTexts().then((a) => a.join(' | ')).catch(() => '');
const lockedIds = (db) => db.time_entries.filter((e) => e.locked).map((e) => e.id).sort();
const patches = (writes) => writes.filter((w) => w.m === 'PATCH' && w.t === 'time_entries');
const idsOf = (w) => ((/id=in\.\(([^)]*)\)/.exec(decodeURIComponent(w.q)) || [])[1] || '').split(',').map((x) => x.replace(/"/g, '')).filter(Boolean);
const hScroll = (pg) => pg.evaluate(() => {
  const out = []; const de = document.documentElement;
  if (de.scrollWidth > window.innerWidth + 1) out.push(`page ${de.scrollWidth} > ${window.innerWidth}`);
  for (const d of document.querySelectorAll('[role=dialog], [role=alertdialog]')) {
    if (d.scrollWidth > d.clientWidth + 1) out.push(`fenêtre ${d.scrollWidth} > ${d.clientWidth}`);
    const R = d.getBoundingClientRect(); if (R.left < -1 || R.right > window.innerWidth + 1) out.push(`fenêtre hors écran ${Math.round(R.left)}…${Math.round(R.right)}`);
    for (const el of d.querySelectorAll('*')) { const r = el.getBoundingClientRect(); if (r.width && r.right > R.right + 1) { out.push(`déborde : <${el.tagName.toLowerCase()}> « ${(el.textContent || '').trim().slice(0, 30)} »`); break; } }
  }
  return out;
});
const ctxOf = (w, h, mobile = false) => b.newContext({ viewport: { width: w, height: h }, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true, isMobile: mobile, hasTouch: mobile });
const phrase = (n, m) => `Cet export va verrouiller ${n} ligne${n > 1 ? 's' : ''} d’heures de ${m} salarié${m > 1 ? 's' : ''} (période ${PERIODE}). ${m > 1 ? 'Ils ne pourront' : 'Il ne pourra'} plus ${n > 1 ? 'les' : 'la'} modifier.`;

// ═══ A) 1280 × 800 — le parcours complet en CSV ════════════════════════════════
if (run('A')) {
  const ctx = await ctxOf(1280, 800);
  const { db, writes, reads } = await setup(ctx);
  const { pg, seen } = await openAdmin(ctx);
  check(!alertChunkSeen(seen), 'A) /admin chargé + repos : le fichier de l\'alerte n\'est PAS demandé (chargé à l\'ouverture de « Exporter l\'équipe »)');
  const team = await openTeamExport(pg, false);
  await pg.waitForTimeout(800);
  check(alertChunkSeen(seen), 'A) l\'ouverture de « Exporter l\'équipe » prépare le fichier de l\'alerte');
  check(await team.getByText('Exporter verrouille les heures de la période.').count() === 1, 'A) la fenêtre dit toujours « Exporter verrouille les heures de la période. »');

  // Annuler
  await pick(pg, team, 'csv'); await waitAlert(pg);
  const box = alertBox(pg);
  check(await box.getAttribute('role') === 'alertdialog', 'A) l\'alerte est une fenêtre d\'alerte (role=alertdialog)');
  check(await alertText(pg) === phrase(4, 3), `A) texte EXACT : « ${await alertText(pg)} »`);
  check(await box.locator('[data-testid=export-verrou-texte]').getAttribute('data-lignes') === '4' && await box.locator('[data-testid=export-verrou-texte]').getAttribute('data-salaries') === '3', 'A) N = 4 lignes (a1 a2 a3 a4), M = 3 salariés (Lucas, Nina, Maximilien)');
  check((await box.locator('[data-testid=export-verrou-deja]').innerText()) === '2 autres lignes de la période sont déjà verrouillées : elles le restent.', 'A) les 2 lignes déjà verrouillées sont dites à part (pas comptées dans N)');
  check(await box.innerText().then((t) => !/brouillon|retiré/i.test(t)), 'A) ni le brouillon, ni la ligne retirée, ni l\'autre entreprise, ni les jours hors période dans les chiffres');
  const buttons = await box.getByRole('button').allInnerTexts();
  check(JSON.stringify(buttons) === JSON.stringify(['Exporter et verrouiller', 'Exporter sans verrouiller', 'Annuler']), `A) trois choix : ${buttons.join(' / ')}`);
  check(reads.length === 1, `A) le compte se fait AU CLIC : une lecture (${reads.length})`);
  check(writes.length === 0, 'A) l\'alerte est ouverte : AUCUNE écriture n\'est partie');
  check(await focusId(pg) === 'export-verrou-annuler', 'A) le focus de départ est sur « Annuler » (le choix sans conséquence)');
  check(await noDownload(pg, () => box.locator('[data-testid=export-verrou-annuler]').click()), 'A) « Annuler » : aucun téléchargement');
  check(await closed(pg), 'A) « Annuler » : l\'alerte se ferme');
  check(writes.length === 0 && lockedIds(db).join() === 'a5,a6', 'A) « Annuler » : rien n\'est écrit, seules a5 et a6 restent verrouillées');
  await pg.waitForTimeout(300);
  check(await focusId(pg) === 'team-export-menu', `A) « Annuler » : le focus revient sur « Exporter ▾ » (${await focusId(pg)})`);

  // Exporter sans verrouiller
  await pick(pg, team, 'csv'); await waitAlert(pg);
  const sans = await download(pg, () => alertBox(pg).locator('[data-testid=export-verrou-sans]').click());
  await pg.waitForTimeout(800);
  check(/^bemexo-paie-.*\.csv$/.test(sans.name), `A) « sans verrouiller » : le CSV de paie est téléchargé (${sans.name})`);
  check(writes.length === 0, `A) « sans verrouiller » : AUCUNE écriture (ni PATCH, ni POST, ni fonction) — ${writes.length}`);
  check(lockedIds(db).join() === 'a5,a6', 'A) « sans verrouiller » : la base n\'a pas bougé');
  check(/rien n.a été verrouillé/.test(await toasts(pg)), `A) message : ${(await toasts(pg)).replace(/\s+/g, ' ').slice(0, 90)}`);
  check(await closed(pg), 'A) « sans verrouiller » : l\'alerte est refermée');
  check(await focusId(pg) === 'team-export-menu', `A) le focus revient sur « Exporter ▾ » (${await focusId(pg)})`);

  // Exporter et verrouiller : le MÊME fichier, exactement N lignes verrouillées
  await pg.waitForTimeout(500);
  await pick(pg, team, 'csv'); await waitAlert(pg);
  const w0 = writes.length;
  const avec = await download(pg, () => alertBox(pg).locator('[data-testid=export-verrou-confirm]').click());
  await pg.waitForTimeout(1200);
  check(avec.name === sans.name && avec.buf.equals(sans.buf), `A) « Exporter et verrouiller » : EXACTEMENT le même fichier que « sans verrouiller » (${avec.buf.length} o)`);
  const ps = patches(writes.slice(w0));
  check(ps.length === 1 && ps[0].body?.locked === true && !!ps[0].body?.exported_at && /company_id=eq\./.test(ps[0].q), 'A) un seul PATCH time_entries { locked: true, exported_at } limité à l\'entreprise');
  check(JSON.stringify(idsOf(ps[0]).sort()) === JSON.stringify(IN_FILE), `A) le verrou touche les lignes du fichier, comme avant (${idsOf(ps[0]).sort().join(',')})`);
  check(lockedIds(db).join() === IN_FILE.join(), `A) en base : verrouillées = ${lockedIds(db).join(',')} (pas le brouillon, ni la retirée, ni hors période, ni l'autre entreprise)`);
  const nouvelles = lockedIds(db).filter((id) => !['a5', 'a6'].includes(id));
  check(nouvelles.join() === TO_LOCK.join(), `A) exactement N = ${TO_LOCK.length} lignes nouvellement verrouillées : ${nouvelles.join(',')}`);
  check(/CSV de paie téléchargé — 4 saisies verrouillées/.test(await toasts(pg)), `A) message : ${(await toasts(pg)).replace(/\s+/g, ' ').slice(0, 90)}`);

  // Tout est déjà verrouillé : plus d'alerte, l'export part comme avant
  await pg.waitForTimeout(500);
  const w1 = writes.length;
  const encore = await download(pg, async () => { await pick(pg, team, 'csv'); });
  await pg.waitForTimeout(800);
  check(await alertBox(pg).count() === 0, 'A) plus rien à verrouiller : PAS d\'alerte');
  check(encore.buf.equals(sans.buf), 'A) … et l\'export part tout de suite, avec le même fichier');
  check(patches(writes.slice(w1)).length === 1, 'A) … avec le même écrit qu\'avant le lot (le verrou est reposé sur les lignes du fichier)');
  check(/6 saisies verrouillées/.test(await toasts(pg)), `A) … et le même message qu'avant (${(await toasts(pg)).replace(/\s+/g, ' ').slice(0, 80)})`);
  check(errors.length === 0, `A) aucune erreur JS (${errors.slice(0, 2).join(' | ')})`);
  await ctx.close();
}

// ═══ A bis) aucune ligne du tout : pas d'alerte, le message d'avant ══════════════
if (run('A')) {
  const ctx = await ctxOf(1280, 800);
  const { writes, reads } = await setup(ctx, { rows: [] });
  const { pg } = await openAdmin(ctx);
  const team = await openTeamExport(pg, false);
  const nd = await noDownload(pg, () => pick(pg, team, 'excel'), 2000);
  check(await alertBox(pg).count() === 0, 'A bis) période sans aucune heure : pas d\'alerte');
  check(nd && /Aucune saisie du/.test(await toasts(pg)), `A bis) … le message d'avant : « ${(await toasts(pg)).replace(/\s+/g, ' ').slice(0, 60)} », aucun fichier`);
  check(writes.length === 0 && reads.length === 1, `A bis) … aucune écriture (${writes.length}), un seul comptage (${reads.length})`);
  await ctx.close();
}

// ═══ B) 390 × 844 — téléphone ══════════════════════════════════════════════════
if (run('B')) {
  const ctx = await ctxOf(390, 844, true);
  const { db, writes } = await setup(ctx);
  const { pg } = await openAdmin(ctx);
  const team = await openTeamExport(pg, true);
  await pick(pg, team, 'excel'); await waitAlert(pg);
  const box = alertBox(pg);
  check(await alertText(pg) === phrase(4, 3), 'B) 390 px : le même texte exact (Excel)');
  const hs = await hScroll(pg);
  check(hs.length === 0, `B) 390 px : l'alerte tient dans l'écran, sans défilement horizontal ${JSON.stringify(hs)}`);
  const rects = await box.getByRole('button').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), l: Math.round(r.left), r: Math.round(r.right) }; }));
  check(rects.length === 3 && rects.every((r) => r.h >= 44), `B) 390 px : trois boutons de 44 px au moins (${rects.map((r) => r.h).join(', ')})`);
  check(rects.every((r) => r.l >= 0 && r.r <= 390), 'B) 390 px : boutons dans l\'écran');
  await shot(pg, 'alerte-export-390x844.png');
  // Focus piégé : 9 fois Tab, puis 9 fois Maj+Tab, jamais hors de l'alerte
  let dedans = true;
  for (let i = 0; i < 9; i++) { await pg.keyboard.press('Tab'); dedans = dedans && await pg.evaluate(() => !!document.activeElement?.closest('[data-testid=export-verrou]')); }
  for (let i = 0; i < 9; i++) { await pg.keyboard.press('Shift+Tab'); dedans = dedans && await pg.evaluate(() => !!document.activeElement?.closest('[data-testid=export-verrou]')); }
  check(dedans, 'B) le focus reste piégé dans l\'alerte (Tab et Maj+Tab)');
  // Échap = annuler
  check(await noDownload(pg, () => pg.keyboard.press('Escape')), 'B) Échap : aucun téléchargement');
  check(await closed(pg) && writes.length === 0, 'B) Échap annule : rien d\'écrit');
  await pg.waitForTimeout(300);
  check(await focusId(pg) === 'team-export-menu', `B) Échap : le focus revient sur « Exporter ▾ » (${await focusId(pg)})`);
  // Excel : sans verrou puis avec verrou
  await pick(pg, team, 'excel'); await waitAlert(pg);
  const x1 = await download(pg, () => alertBox(pg).locator('[data-testid=export-verrou-sans]').click());
  check(/\.xlsx$/.test(x1.name) && x1.buf.subarray(0, 2).toString() === 'PK' && writes.length === 0, `B) Excel sans verrouiller : ${x1.name}, aucune écriture`);
  await shot(pg, 'export-sans-verrouiller-390x844.png');
  await pg.waitForTimeout(500);
  await pick(pg, team, 'pdf'); await waitAlert(pg);
  const pdf = await download(pg, () => alertBox(pg).locator('[data-testid=export-verrou-confirm]').click());
  await pg.waitForTimeout(1000);
  check(/\.pdf$/.test(pdf.name) && pdf.buf.subarray(0, 5).toString() === '%PDF-', `B) PDF exporté et verrouillé : ${pdf.name}`);
  check(lockedIds(db).join() === IN_FILE.join() && patches(writes).length === 1, 'B) PDF : le verrou est posé sur les lignes du fichier');
  await ctx.close();
}

// ═══ C) mode support (lecture seule) ═══════════════════════════════════════════
if (run('C')) {
  const ctx = await ctxOf(1280, 800);
  const { db, writes, reads } = await setup(ctx, { support: true });
  const { pg } = await openAdmin(ctx);
  check(await pg.locator('[data-testid=support-banner]').count() === 1, 'C) le bandeau « Mode support » est affiché');
  const team = await openTeamExport(pg, false);
  const f = await download(pg, () => pick(pg, team, 'csv'));
  await pg.waitForTimeout(800);
  check(/^bemexo-paie-.*\.csv$/.test(f.name) && await alertBox(pg).count() === 0, 'C) mode support : pas d\'alerte, le CSV sort');
  check(writes.filter((w) => w.m !== 'GET').length === 0 && lockedIds(db).join() === 'a5,a6', 'C) mode support : aucune écriture, rien n\'est verrouillé');
  check(reads.length === 0, 'C) mode support : pas même de comptage');
  check(/rien n.a été verrouillé/.test(await toasts(pg)) && !/saisies? verrouillées?/.test((await toasts(pg)).replace(/rien n.a été verrouillé/, '')), `C) message honnête : « ${(await toasts(pg)).replace(/\s+/g, ' ').slice(0, 80)} »`);
  await ctx.close();
}

// ═══ D) « Envoyer au comptable » ═══════════════════════════════════════════════
if (run('D')) {
  const ctx = await ctxOf(390, 844, true);
  const { db, writes } = await setup(ctx, { accountant: true });
  const { pg } = await openAdmin(ctx);
  const team = await openTeamExport(pg, true);
  const send = pg.locator('[data-testid=send-accountant]');
  await send.click(); await waitAlert(pg);
  const box = alertBox(pg);
  check(await alertText(pg) === phrase(4, 3), 'D) comptable : le même texte exact');
  check(await box.locator('h2').innerText() === 'Envoyer et verrouiller les heures ?', 'D) comptable : « Envoyer et verrouiller les heures ? »');
  const btns = await box.getByRole('button').allInnerTexts();
  check(JSON.stringify(btns) === JSON.stringify(['Envoyer et verrouiller', 'Annuler']), `D) comptable : deux choix seulement, pas de « sans verrouiller » (l'envoi écrit en base) : ${btns.join(' / ')}`);
  check(await box.innerText().then((t) => t.includes('compta@exemple.fr')), 'D) comptable : l\'adresse du destinataire est dite');
  check(writes.length === 0, 'D) comptable : rien n\'est envoyé tant que le bureau n\'a pas choisi');
  await shot(pg, 'alerte-comptable-390x844.png');
  await box.locator('[data-testid=export-verrou-annuler]').click(); await closed(pg); await pg.waitForTimeout(300);
  check(writes.length === 0, 'D) comptable : « Annuler » → ni e-mail, ni verrou');
  check(await focusId(pg) === 'send-accountant', `D) comptable : le focus revient sur « Envoyer à… » (${await focusId(pg)})`);
  await send.click(); await waitAlert(pg);
  await alertBox(pg).locator('[data-testid=export-verrou-confirm]').click();
  await pg.waitForFunction(() => document.querySelectorAll('[data-testid=export-verrou]').length === 0, null, { timeout: 15000 });
  await pg.waitForTimeout(500);
  const fn = writes.filter((w) => w.m === 'FN' && /send-payroll-export/.test(w.t));
  const xb = fn[0]?.body?.contentBase64 ? Buffer.from(fn[0].body.contentBase64, 'base64') : null;
  check(fn.length === 1 && !!xb && xb.subarray(0, 2).toString() === 'PK', `D) comptable : l'envoi part UNE fois avec un vrai classeur (${xb ? xb.length : 0} o)`);
  const idxFn = writes.findIndex((w) => w.m === 'FN'); const idxPatch = writes.findIndex((w) => w.m === 'PATCH');
  check(idxFn >= 0 && idxPatch > idxFn && lockedIds(db).join() === IN_FILE.join(), 'D) comptable : le verrou vient APRÈS l\'envoi, sur les lignes du fichier');
  await ctx.close();
}

// ═══ E) les chiffres ont bougé entre l'alerte et le clic ═══════════════════════
if (run('E')) {
  const ctx = await ctxOf(390, 844, true);
  const { db, writes } = await setup(ctx);
  const { pg } = await openAdmin(ctx);
  const team = await openTeamExport(pg, true);
  await pick(pg, team, 'csv'); await waitAlert(pg);
  check(await alertText(pg) === phrase(4, 3), 'E) l\'alerte annonce 4 lignes, 3 salariés');
  // Pendant ce temps, un salarié envoie ses heures.
  db.time_entries.push(entry('a7', 'u-nina', day(4, WS), 'submitted', 2 * 60));
  const nd = await noDownload(pg, () => alertBox(pg).locator('[data-testid=export-verrou-confirm]').click(), 2000);
  check(nd && writes.length === 0, 'E) « Exporter et verrouiller » avec des chiffres périmés : rien n\'est exporté ni verrouillé');
  check(await alertBox(pg).count() === 1 && await alertText(pg) === phrase(5, 3), `E) l'alerte reste et montre les chiffres à jour : « ${await alertText(pg)} »`);
  check(await alertBox(pg).locator('[data-testid=export-verrou-change]').count() === 1, 'E) … avec une phrase qui dit pourquoi');
  await shot(pg, 'alerte-chiffres-changes-390x844.png');
  const f = await download(pg, () => alertBox(pg).locator('[data-testid=export-verrou-confirm]').click());
  await pg.waitForTimeout(1000);
  check(/^bemexo-paie-.*\.csv$/.test(f.name) && lockedIds(db).filter((id) => !['a5', 'a6'].includes(id)).join() === 'a1,a2,a3,a4,a7', 'E) 2ᵉ clic : exporté et verrouillé, 5 lignes nouvelles = ce que disait l\'alerte');
  await ctx.close();
}

// ═══ F) comptage impossible ════════════════════════════════════════════════════
if (run('F')) {
  const ctx = await ctxOf(1280, 800);
  const { db, writes } = await setup(ctx);
  db.failCount = true;
  const { pg } = await openAdmin(ctx);
  const team = await openTeamExport(pg, false);
  const nd = await noDownload(pg, () => pick(pg, team, 'csv'), 2000);
  check(nd && await alertBox(pg).count() === 0 && writes.length === 0, 'F) comptage impossible : ni alerte, ni fichier, ni écriture');
  check(/Impossible de vérifier les heures/.test(await toasts(pg)), `F) … un message : « ${(await toasts(pg)).replace(/\s+/g, ' ').slice(0, 90)} »`);
  check(await team.locator('[data-testid=team-export-menu]').isEnabled(), 'F) … « Exporter ▾ » est de nouveau utilisable');
  await ctx.close();
}

// ═══ G) plus de 1000 lignes : compte exact, tout est verrouillé ════════════════
if (run('G')) {
  const rows = Array.from({ length: 1203 }, (_, i) => entry(`m${i}`, `u${i % 7}`, day(i % 7, WS), i % 2 ? 'validated' : 'submitted', 60, { user: { first_name: `S${i % 7}`, last_name: 'Test' } }));
  rows.push(entry('ok1', 'u-lucas', WS, 'submitted', 60, LOCKED));
  const ctx = await ctxOf(1280, 800);
  const { db, writes } = await setup(ctx, { rows });
  const { pg } = await openAdmin(ctx);
  const team = await openTeamExport(pg, false);
  await pick(pg, team, 'csv'); await waitAlert(pg);
  check(await alertText(pg) === phrase(1203, 7), `G) 1203 lignes / 7 salariés comptées EXACTEMENT, au-delà du plafond de 1000 : « ${await alertText(pg)} »`);
  check((await alertBox(pg).locator('[data-testid=export-verrou-deja]').innerText()).startsWith('1 autre ligne'), 'G) … et 1 ligne déjà verrouillée à part');
  await download(pg, () => alertBox(pg).locator('[data-testid=export-verrou-confirm]').click());
  await pg.waitForTimeout(1500);
  check(patches(writes).length === 7 && db.time_entries.filter((e) => e.locked).length === 1204, `G) toutes les lignes verrouillées par lots de 200 (${patches(writes).length} PATCH, ${db.time_entries.filter((e) => e.locked).length} verrouillées)`);
  await ctx.close();
}

// ═══ H) l'alerte ne charge ni Excel ni jsPDF ═══════════════════════════════════
if (run('H')) {
  const ctx = await ctxOf(1280, 800);
  await setup(ctx);
  const { pg, seen } = await openAdmin(ctx);
  await pg.waitForTimeout(2500);
  check(heavyOf(seen).length === 0 && !alertChunkSeen(seen), `H) /admin + 2,5 s de repos : ni Excel, ni jsPDF, ni l'alerte (vu : ${heavyOf(seen).join(',') || 'rien'})`);
  const team = await openTeamExport(pg, false);
  await pg.waitForTimeout(1500);
  const avant = heavyOf(seen);
  const t0 = Date.now();
  await pick(pg, team, 'csv'); await waitAlert(pg);
  check(JSON.stringify(heavyOf(seen, t0)) === '[]', `H) l'ouverture de l'alerte ne demande aucune bibliothèque d'export de plus (nouveaux chunks lourds : ${heavyOf(seen, t0).join(',') || 'aucun'} ; déjà là : ${avant.join(',') || 'aucun'})`);
  await ctx.close();
}

// ═══ I) rien à verrouiller, mais une ligne arrive PENDANT l'export ═════════════
if (run('I')) {
  const ctx = await ctxOf(1280, 800);
  const rows = ENTRIES().filter((e) => ['a5', 'a6'].includes(e.id)); // tout est déjà verrouillé : comptage = 0, pas d'alerte
  const { db, writes } = await setup(ctx, { rows });
  const { pg } = await openAdmin(ctx);
  const team = await openTeamExport(pg, false);
  // Un salarié envoie sa journée entre le comptage et la lecture des lignes de l'export (réglages, paie, récapitulatif…).
  db.inject = () => db.time_entries.push(entry('a7', 'u-lucas', day(2, WS), 'submitted', 3 * 60));
  const nd = await noDownload(pg, () => pick(pg, team, 'csv'), 2500);
  check(await alertBox(pg).count() === 1, 'I) N = 0 au comptage, une ligne arrive pendant l\'export : l\'alerte S\'OUVRE');
  check(await alertText(pg) === phrase(1, 1), `I) … avec les chiffres à jour : « ${await alertText(pg)} »`);
  check(await alertBox(pg).locator('[data-testid=export-verrou-change]').count() === 1, 'I) … et la phrase qui explique pourquoi');
  check(nd && writes.length === 0 && lockedIds(db).join() === 'a5,a6', 'I) … rien n\'est téléchargé, rien n\'est écrit, la ligne a7 n\'est PAS verrouillée');
  const f = await download(pg, () => alertBox(pg).locator('[data-testid=export-verrou-confirm]').click());
  await pg.waitForTimeout(1000);
  check(/^bemexo-paie-.*\.csv$/.test(f.name) && lockedIds(db).join() === 'a5,a6,a7', 'I) après « Exporter et verrouiller » : exporté, et a7 verrouillée parce que le bureau l\'a su');
  await ctx.close();
}
if (run('I')) {
  // Même scénario, mais tout reste déjà verrouillé (rien n'arrive) : aucune alerte, comme avant le lot.
  const ctx = await ctxOf(1280, 800);
  const { writes } = await setup(ctx, { rows: ENTRIES().filter((e) => ['a5', 'a6'].includes(e.id)) });
  const { pg } = await openAdmin(ctx);
  const team = await openTeamExport(pg, false);
  await download(pg, () => pick(pg, team, 'csv'));
  await pg.waitForTimeout(600);
  check(await alertBox(pg).count() === 0 && patches(writes).length === 1, 'I) rien à verrouiller et rien de nouveau : pas d\'alerte, l\'export part (comme avant le lot)');
  await ctx.close();
}

// ═══ J) la période annoncée est celle de l'export ═══════════════════════════════
if (run('J')) {
  const ctx = await ctxOf(1280, 800);
  const { db, writes, allReads } = await setup(ctx);
  db.delayCount = 1500;
  const { pg } = await openAdmin(ctx);
  const team = await openTeamExport(pg, false);
  await team.locator('[data-testid=team-export-menu]').click();
  await pg.locator('[data-testid=team-export-menu-csv]').click();
  await pg.waitForTimeout(300);
  const off = await Promise.all([team.getByRole('button', { name: "Aujourd'hui", exact: true }), team.getByRole('button', { name: 'Cette semaine', exact: true }), team.getByRole('button', { name: /Créneau/ })].map((l) => l.isDisabled()));
  check(off.every(Boolean), `J) pendant le comptage, les trois boutons de période sont inactifs (${off.join(',')})`);
  await waitAlert(pg);
  db.delayCount = 0;
  check(await alertText(pg) === phrase(4, 3), 'J) l\'alerte annonce la semaine (4 lignes, 3 salariés)');
  // L'écran change de période PENDANT que l'alerte est ouverte (clic programmatique : l'alerte bloque la souris).
  await pg.evaluate(() => { [...document.querySelectorAll('[data-testid=team-export] button')].find((x) => x.textContent.trim() === "Aujourd'hui").click(); });
  await pg.waitForTimeout(300);
  const n0 = allReads.length;
  const f = await download(pg, () => alertBox(pg).locator('[data-testid=export-verrou-confirm]').click());
  await pg.waitForTimeout(1000);
  const lues = allReads.slice(n0).filter((r) => r.select && r.select.includes('worksite:worksites'));
  check(lues.length === 1 && lues[0].wd.join() === `gte.${WS},lte.${WE}`, `J) l'export lit la période ANNONCÉE (${lues[0]?.wd.join(' ')}), pas celle de l'écran`);
  check(lockedIds(db).join() === IN_FILE.join() && patches(writes).length === 1, 'J) … et verrouille les lignes annoncées, pas seulement celles d\'aujourd\'hui');
  check(/^bemexo-paie-.*\.csv$/.test(f.name) && f.name.includes(WS), `J) … le fichier porte la période annoncée (${f.name})`);
  await ctx.close();
}

// ═══ K) le verrou échoue APRÈS le fichier ═══════════════════════════════════════
if (run('K')) {
  const ctx = await ctxOf(1280, 800);
  const { db, writes } = await setup(ctx);
  db.failLockAt = [1];
  const { pg } = await openAdmin(ctx);
  const team = await openTeamExport(pg, false);
  await pick(pg, team, 'csv'); await waitAlert(pg);
  const f = await download(pg, () => alertBox(pg).locator('[data-testid=export-verrou-confirm]').click());
  await pg.waitForTimeout(1000);
  const tt = await toasts(pg);
  check(/^bemexo-paie-/.test(f.name), 'K) le fichier est bien téléchargé');
  check(/Fichier téléchargé, mais le verrouillage a échoué : les heures restent modifiables\. Recommencez\./.test(tt), `K) message honnête : « ${tt.replace(/\s+/g, ' ').slice(0, 130)} »`);
  check(!/Erreur lors de l.export/.test(tt) && !/saisies? verrouillées?/.test(tt.replace(/le verrouillage/g, '')), 'K) … jamais « Erreur lors de l\'export », jamais un faux « N saisies verrouillées »');
  check(lockedIds(db).join() === 'a5,a6' && patches(writes).length === 1, 'K) rien n\'est verrouillé de plus (la seule tentative a échoué)');
  check(await closed(pg), 'K) l\'alerte se referme, « Exporter ▾ » est de nouveau utilisable');
  await ctx.close();
}
if (run('K')) {
  const rows = Array.from({ length: 1203 }, (_, i) => entry(`m${i}`, `u${i % 7}`, day(i % 7, WS), i % 2 ? 'validated' : 'submitted', 60, { user: { first_name: `S${i % 7}`, last_name: 'Test' } }));
  const ctx = await ctxOf(1280, 800);
  const { db, writes } = await setup(ctx, { rows });
  db.failLockAt = [3]; // 7 lots de 200 : les 2 premiers passent, le 3e échoue
  const { pg } = await openAdmin(ctx);
  const team = await openTeamExport(pg, false);
  await pick(pg, team, 'csv'); await waitAlert(pg);
  await download(pg, () => alertBox(pg).locator('[data-testid=export-verrou-confirm]').click());
  await pg.waitForTimeout(1500);
  const tt = await toasts(pg);
  check(/verrouillage n.est fait qu.en partie \(400 lignes sur 1203\)/.test(tt), `K) verrou à moitié posé : « ${tt.replace(/\s+/g, ' ').slice(0, 150)} »`);
  check(db.time_entries.filter((e) => e.locked).length === 400 && patches(writes).length === 3, `K) … 400 lignes verrouillées exactement, on s'arrête au 1er échec (${patches(writes).length} tentatives)`);
  await ctx.close();
}

// ═══ L) les lectures de l'export : mêmes statuts, ordre complet ═════════════════
if (run('L')) {
  const ctx = await ctxOf(1280, 800);
  const { allReads } = await setup(ctx);
  const { pg } = await openAdmin(ctx);
  const team = await openTeamExport(pg, false);
  const n0 = allReads.length;
  await pick(pg, team, 'csv'); await waitAlert(pg);
  await download(pg, () => alertBox(pg).locator('[data-testid=export-verrou-confirm]').click());
  await pg.waitForTimeout(800);
  const lec = allReads.slice(n0);
  const comptage = lec.find((r) => r.select === 'id,user_id,locked');
  const recap = lec.find((r) => r.select && r.select.includes('gap_before') && !r.select.includes('worksite:worksites'));
  const lignes = lec.find((r) => r.select && r.select.includes('worksite:worksites'));
  check(!!comptage && !!recap && !!lignes, 'L) les trois lectures sont faites : comptage, récapitulatif, lignes exportées');
  check([comptage, recap, lignes].every((r) => r?.status === 'in.(submitted,validated)'), 'L) mêmes statuts partout : in.(submitted,validated)');
  check([comptage, recap, lignes].every((r) => /,id\.asc$/.test(r?.order || '')), `L) ordre complet, terminé par id : ${[comptage, recap, lignes].map((r) => r?.order).join(' | ')}`);
  check(lignes?.order === 'work_date.desc,user_id.asc,start_time.asc,id.asc', 'L) les lignes exportées gardent leur ordre (jour décroissant, salarié) avec un départage complet');
  await ctx.close();
}

await b.close(); srv.close();
check(nShots <= 4, `${nShots} capture(s) d'écran (4 au plus)`);
console.log(`\n${ok} ok / ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
