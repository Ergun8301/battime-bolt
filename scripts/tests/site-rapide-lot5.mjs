// Lancer : node scripts/tests/site-rapide-lot5.mjs out <dossier-captures-hors-depot> [port 42200-42299] (après npm run build).
// Lot 5 « site rapide 1 » — sur les VRAIES pages /admin et /poseur (export statique, base Supabase SIMULÉE, rien n'est écrit en vrai) :
//  a) au chargement de /admin et de /poseur (+ 3 s de repos) AUCUNE requête vers un chunk xlsx / jsPDF / jspdf-autotable ;
//  b) ces chunks arrivent à l'ouverture du menu « Exporter ▾ » ou de la fenêtre d'export (et PAS avant) ; PDF / Excel / « Envoyer au comptable » téléchargent de vrais fichiers ;
//  c) une fenêtre différée (Réglages, fiche salarié) s'ouvre SANS clignoter (jamais vide, jamais 1→0→1) et montre ses données ; 2e ouverture : aucun chunk de plus ;
//  d) (chunk d'export qui ne charge pas) message d'erreur, AUCUNE écriture (pas de verrouillage sans fichier) ;
//  e) onglets salarié (semaine, mois, historique), réseau coupé APRÈS le repos (tout se rouvre), chunk de fenêtre bloqué (message, pas d'erreur, réessai) ;
//     onglet dont le code tarde (blocs gris), onglet en échec (texte, nouvelle tentative au retour du réseau / de l'onglet), assistant en échec de fond (silence tant qu'il n'est pas ouvert) ;
//  f) téléphone (390 px) : chaque fenêtre du menu ☰ s'ouvre du premier coup, sans clignoter ni déborder.
// Les chunks lourds sont reconnus dans out/ par une EMPREINTE de leur contenu (noms hachés = changent à chaque build).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { chromium } from 'playwright-core';
import { lireToasts, ouvrirVue } from './navigation-salarie.mjs';
const XLSX = createRequire(import.meta.url)('xlsx'); // lecture des classeurs téléchargés (même méthode que panier-lot3bis.mjs)
const [,, OUT = 'out', SH = 'docs/captures-site-rapide-1', PORT = '42250'] = process.argv; fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT), r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ─── Dates relatives (jour de Paris) ───────────────────────────────────────────
// Horloge FIXÉE au 20 du mois en cours (lot 11 : « jours en attente » = mois en
// cours) : les jours relatifs du jeu de données restent dans le mois, quel que
// soit le jour où le test tourne.
const today = `${new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }).slice(0, 8)}20`;
const FIXED_NOW = new Date(`${today}T10:00:00+02:00`);
const day = (n, from = today) => { const x = new Date(`${from}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const first = `${today.slice(0, 8)}01`;
const prevLast = day(-1, first); // dernier jour du mois précédent : HORS période
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// ─── Base simulée ──────────────────────────────────────────────────────────────
const CO = 'c0000000-0000-0000-0000-000000000001';
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', is_active: true };
const u = (id, first_name, last_name, role = 'worker') => ({ id, company_id: CO, first_name, last_name, role, email: `${id}@x.fr`, is_active: true, created_at: '2026-01-01' });
const LONG = ['Maximilien-Alexandre', 'De La Fontaine-Beaumarchais'];
const USERS = [u('u-admin', 'Paul', 'Martin', 'admin'), u('u-lucas', 'Lucas', 'Petit'), u('u-nina', 'Nina', 'Roux'), u('u-long', LONG[0], LONG[1])];
const nameOf = Object.fromEntries(USERS.map((x) => [x.id, { first_name: x.first_name, last_name: x.last_name }]));
const hh = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
const entry = (id, user_id, work_date, status, minutes, start = 8 * 60) => ({
  id, company_id: CO, user_id, work_date, worksite_id: 'w1', planning_id: null, status, start_time: hh(start), end_time: hh(start + minutes),
  break_minutes: 0, total_minutes: minutes, meal_allowance: false, observation: null, reception: null, gap_before: null,
  modified_at: null, exported_at: null, locked: false, reserve_resolved_at: null,
  worksite: { id: 'w1', client_name: W1.client_name, city: W1.city }, user: nameOf[user_id],
});
const ENTRIES = [
  entry('e-first', 'u-lucas', first, 'submitted', 7 * 60),          // 1er du mois : dans la période après clôture
  { ...entry('e-today', 'u-lucas', today, 'submitted', 4 * 60 + 30), source: 'qr', corrected_at: `${today}T12:00:00Z`, lead_edited_by: 'u-nina', lead_edited_at: `${today}T18:00:00Z` }, // aujourd'hui (lot 12 : QR, corrigé ; lot 14 : par le chef d'équipe)
  { ...entry('e-draft', 'u-lucas', today, 'draft', 60, 14 * 60), source: 'qr', exit_forgotten: true }, // brouillon : jamais payé, signalé à la clôture (lot 12 : sortie oubliée)
  entry('e-prev', 'u-lucas', prevLast, 'submitted', 9 * 60),        // mois précédent : JAMAIS dans le CSV
  // Lot 12 : sortie oubliée « fin à compléter » (début = fin, fermée la nuit) — jamais payée,
  // jamais exportée, signalée à la clôture, comptée dans les jours en attente.
  { ...entry('e-incomplet', 'u-lucas', day(-2), 'draft', 0, 8 * 60), source: 'qr', exit_forgotten: true },
  entry('n-today', 'u-nina', today, 'submitted', 6 * 60),
  entry('l-today', 'u-long', today, 'submitted', 8 * 60),
];
// Planning sans heures envoyées (→ « jours en attente » de la fiche). Lucas : 3 jours passés
// (ceux qui tombent sur un jour où il a envoyé ses heures ne comptent pas — calculé plus bas).
// u-long (clôturé jusqu'à J-3) : J-4 (clôturé → plus réclamé) et J-2 (après la date → réclamé).
const slot = (id, user_id, work_date) => ({ id, company_id: CO, user_id, worksite_id: 'w1', work_date, absence_type: null, estimated_start: '08:00:00', estimated_end: '17:00:00', notes: null, created_at: `${work_date}T06:00:00Z`, worksite: W1 });
const PLANNING = [
  slot('p-l4', 'u-lucas', day(-4)), slot('p-l5', 'u-lucas', day(-5)), slot('p-l6', 'u-lucas', day(-6)),
  slot('p-g4', 'u-long', day(-4)), slot('p-g2', 'u-long', day(-2)),
];
const lucasSent = new Set(ENTRIES.filter((e) => e.user_id === 'u-lucas' && e.status !== 'draft').map((e) => e.work_date));
const lucasPlannedMissing = PLANNING.filter((p) => p.user_id === 'u-lucas' && !lucasSent.has(p.work_date)).map((p) => p.work_date);
const lucasMissing = new Set([...lucasPlannedMissing, day(-2)]).size; // ≥ 1 ; lot 12 : + le jour « fin à compléter »
const enAttente = (n) => `${n} jour${n > 1 ? 's' : ''} en attente`;
// Les heures de Lucas réellement PAYÉES après « clôturer jusqu'à aujourd'hui » (1er → aujourd'hui).
const paidAfterClose = ENTRIES.filter((e) => e.user_id === 'u-lucas' && e.status === 'submitted' && e.work_date >= first && e.work_date <= today)
  .reduce((s, e) => s + e.total_minutes, 0);
const paidToday = ENTRIES.filter((e) => e.user_id === 'u-lucas' && e.status === 'submitted' && e.work_date === today).reduce((s, e) => s + e.total_minutes, 0);

const COMPANY = { id: CO, name: 'Pizzeria Exemple', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, travel_paid: false, accountant_email: null };
const freshDb = () => ({
  users: USERS.map((x) => ({ ...x })),
  companies: [{ ...COMPANY }],
  worksites: [W1],
  planning: PLANNING.map((p) => ({ ...p })),
  time_entries: ENTRIES.map((e) => ({ ...e })),
  user_payroll: [
    { user_id: 'u-lucas', company_id: CO, payroll_id: '00042', weekly_hours: null, hourly_rate: null, social_security_number: null, hire_date: null, contract_type: null },
    { user_id: 'u-nina', company_id: CO, payroll_id: '00077', weekly_hours: null, hourly_rate: null, social_security_number: null, hire_date: null, contract_type: null },
  ],
  // u-long : déjà clôturé jusqu'à J-3 (pastille), u-nina : une ancienne clôture ROUVERTE (sans effet).
  user_closures: [
    { user_id: 'u-long', company_id: CO, closed_until: day(-3), closed_at: `${day(-3)}T17:00:00Z`, closed_by: 'u-admin', reopened_at: null },
    { user_id: 'u-nina', company_id: CO, closed_until: day(-3), closed_at: `${day(-3)}T17:00:00Z`, closed_by: 'u-admin', reopened_at: `${day(-2)}T08:00:00Z` },
  ],
  active_sessions: [], month_closures: [], leave_requests: [], invitations: [], documents: [], certifications: [], push_subscriptions: [],
  kiosks: [], kiosk_settings: [], time_entry_corrections: [], time_entry_positions: [],
});

// ─── Session simulée + routes Supabase ─────────────────────────────────────────
const now = Math.floor(Math.max(Date.now(), FIXED_NOW.getTime()) / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const mkSession = (uid, mail) => { const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', exp: now + 36000, aal: 'aal1' })}.sig`; return { access_token: jwt, refresh_token: 'r', expires_at: now + 36000, expires_in: 36000, token_type: 'bearer', user: { id: uid, email: mail, aud: 'authenticated', role: 'authenticated' } }; };
let session = mkSession('u-admin', 'paul@exemple.fr');
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
      if (op === 'lt') return String(cur) < val;
      if (op === 'is') return val === 'null' ? cur == null : String(cur) === val;
      return true;
    });
  }
  return rows;
};
/** closures : 'ok' (table présente) ou 'absent' (migration pas encore passée → 404 PGRST205). */
const setup = async (ctx, { closures = 'ok', as, accountant = false, ai = false } = {}) => {
  session = as ? mkSession(as.id, as.email) : mkSession('u-admin', 'paul@exemple.fr');
  const db = freshDb(); if (accountant) db.companies[0].accountant_email = 'compta@exemple.fr'; if (ai) db.companies[0].ai_enabled = true;
  const writes = [];
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.clock.setFixedTime(FIXED_NOW);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const req = r.request();
    const url = new URL(req.url());
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/')) { let body = null; try { body = req.postDataJSON(); } catch { /* pas du JSON */ } writes.push({ m: 'FN', t: url.pathname, body }); return r.fulfill({ json: {} }); }
    // « Coût chantiers » et Statistiques lisent my_worksite_labour : des heures fictives de l'entreprise de test (Lucas 11 h 30, Nina 6 h sur Villa Dupont).
    if (url.pathname === '/rest/v1/rpc/my_worksite_labour') return r.fulfill({ json: [
      { worksite_id: 'w1', user_id: 'u-lucas', worked_minutes: 690, route_minutes: 0, paid_minutes: 690, cost: 207, unpriced_minutes: 0 },
      { worksite_id: 'w1', user_id: 'u-nina', worked_minutes: 360, route_minutes: 0, paid_minutes: 360, cost: 126, unpriced_minutes: 0 },
    ] });
    if (url.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
    const t = url.pathname.replace('/rest/v1/', '');
    const m = req.method();
    if (t === 'user_closures' && closures === 'absent') {
      return r.fulfill({ status: 404, json: { code: 'PGRST205', details: null, hint: null, message: "Could not find the table 'public.user_closures' in the schema cache" } });
    }
    if (m !== 'GET' && m !== 'HEAD') {
      let body = null; try { body = req.postDataJSON(); } catch { body = req.postData(); }
      writes.push({ m, t, q: url.search, body });
      if (t === 'user_closures' && m === 'POST') {
        const row = Array.isArray(body) ? body[0] : body;
        db.user_closures = db.user_closures.filter((x) => x.user_id !== row.user_id).concat([{ ...row }]);
        return r.fulfill({ status: 201, json: [] });
      }
      if (t === 'user_closures' && m === 'PATCH') {
        const hit = filterRows(db.user_closures, url.searchParams);
        for (const x of hit) Object.assign(x, body);
        return r.fulfill({ status: 200, json: hit.map((x) => ({ user_id: x.user_id })) });
      }
      return r.fulfill({ status: 201, json: {} });
    }
    let rows = filterRows(db[t] || [], url.searchParams);
    // .range() → offset/limit (fetchAllPaged s'arrête sur une page vide).
    const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
    if (off || lim) rows = rows.slice(off, lim ? off + Number(lim) : undefined);
    if ((req.headers()['accept'] || '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    // content-range exposé (CORS) : c'est là que supabase-js lit un `count` (head: true).
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}`, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' } });
  });
  return { db, writes };
};

let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (pg, name) => { await pg.waitForTimeout(450); await pg.screenshot({ path: path.join(SH, name) }); };

// ─── Les chunks lourds, reconnus par leur CONTENU dans out/ (empreintes = noms d'export/méthodes de la bibliothèque,
//     jamais présents dans le code de l'appli : l'appel `new jsPDF` / `book_append_sheet` n'est PAS une empreinte) ───
const FINGER = { xlsx: /parse_xlscfb/, jspdf: /jsPDF\.API/, autotable: /autoTableSetDefaults/ };
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const HEAVY = new Map(); // '/_next/static/chunks/xxx.js' → ['xlsx', ...]
for (const f of walk(path.join(OUT, '_next', 'static')).filter((x) => x.endsWith('.js'))) {
  const txt = fs.readFileSync(f, 'utf8'); const kinds = Object.keys(FINGER).filter((k) => FINGER[k].test(txt));
  if (kinds.length) HEAVY.set('/' + path.relative(OUT, f).split(path.sep).join('/'), kinds);
}
const kindsFound = new Set([...HEAVY.values()].flat());
check(Object.keys(FINGER).every((k) => kindsFound.has(k)), `empreintes valides : xlsx, jspdf, autotable retrouvés dans out/ (${[...HEAVY].map(([f, k]) => `${f.split('/').pop()}=${k}`).join(' ')})`);
const watch = (pg) => { const seen = []; pg.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/_next/static/') && u.pathname.endsWith('.js')) seen.push({ t: Date.now(), path: u.pathname }); }); return seen; };
const heavyOf = (seen, since = 0) => [...new Set(seen.filter((s) => s.t >= since && HEAVY.has(s.path)).flatMap((s) => HEAVY.get(s.path)))].sort();
const errors = [];
const mon = (pg) => { pg.on('pageerror', (e) => errors.push(e.message)); };
const download = async (pg, click) => {
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 15000 }), click()]);
  return { name: dl.suggestedFilename(), buf: fs.readFileSync(await dl.path()) };
};
const waitHeavy = async (seen, since, n, timeout = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (heavyOf(seen, since).length >= n) return true; await sleep(100); } return false; };
/** Échantillonne chaque image : fenêtres visibles, leur texte, pour détecter clignotement / coquille vide. */
const sampler = (pg) => pg.evaluate(() => {
  window.__fr = []; window.__stop = false;
  const tick = () => { const ds = [...document.querySelectorAll('[role=dialog]')].filter((d) => d.getClientRects().length && !d.closest('#cc-main'));
    window.__fr.push({ n: ds.length, empty: ds.some((d) => (d.textContent || '').trim().length < 3) , txt: ds.map((d) => (d.textContent || '').length).join(',') });
    if (!window.__stop) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
const sampled = (pg) => pg.evaluate(() => { window.__stop = true; return window.__fr; });
const flicker = (fr) => { let seenOpen = false, closedAfter = false, empty = 0; for (const f of fr) { if (f.n > 0) { if (closedAfter) return 'rouvre après avoir disparu'; seenOpen = true; if (f.empty) empty++; } else if (seenOpen) closedAfter = true; } return empty ? `${empty} image(s) avec une fenêtre VIDE` : closedAfter ? 'disparaît' : null; };

const admin = async (viewport = { width: 1280, height: 800 }, opts = {}) => {
  const ctx = await b.newContext({ viewport, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true });
  const st = await setup(ctx, opts); const pg = await ctx.newPage(); mon(pg); const seen = watch(pg);
  await pg.goto(`http://localhost:${PORT}/admin`);
  await pg.locator('button:visible', { hasText: 'Lucas Petit' }).first().waitFor({ timeout: 25000 });
  return { ctx, pg, seen, ...st };
};

// ═══ a/b/d) /admin — chargement, menu « Exporter ▾ » de la fiche, fichiers, échec de chargement ═══════════════
{
  const { ctx, pg, seen, writes } = await admin();
  await pg.waitForTimeout(3000); // repos : un préchargement « au repos » aurait eu le temps de partir
  const eager = heavyOf(seen);
  check(eager.length === 0, `a) /admin : aucune requête xlsx / jsPDF / autotable au chargement + 3 s de repos (vu : ${eager.join(',') || 'rien'} ; ${seen.length} scripts au total)`);
  await pg.locator('button:visible', { hasText: 'Lucas Petit' }).first().click();
  await pg.getByRole('button', { name: /Feuille d.heures/ }).click();
  const dlg = pg.locator('[role=dialog]').filter({ has: pg.locator('h2', { hasText: 'Lucas Petit' }) });
  await dlg.waitFor(); await pg.waitForTimeout(900);
  check(heavyOf(seen).length === eager.length, `a) l'ouverture de la fiche salarié n'amène pas non plus xlsx / jsPDF (vu : ${heavyOf(seen).join(',') || 'rien'})`);
  const t0 = Date.now();
  await dlg.locator('[data-testid=export-menu]').click();
  const arrived = await waitHeavy(seen, t0, 3, 5000);
  check(eager.length === 0 ? arrived : false, `b) les 3 chunks (xlsx, jspdf, autotable) arrivent à l'OUVERTURE du menu « Exporter ▾ », avant le choix (vu après le clic : ${heavyOf(seen, t0).join(',') || 'rien'})`);
  const pdf = await download(pg, () => pg.locator('[data-testid=export-menu-pdf]').click());
  check(/\.pdf$/.test(pdf.name) && pdf.buf.subarray(0, 5).toString() === '%PDF-', `b) PDF de la fiche : vrai fichier (${pdf.name}, ${pdf.buf.length} o)`);
  check(pdf.buf.toString('latin1').includes('BEMEXO'), 'b) PDF de la fiche : le titre BEMEXO est dans le fichier');
  await dlg.locator('[data-testid=export-menu]').click();
  const xl = await download(pg, () => pg.locator('[data-testid=export-menu-excel]').click());
  const wb = XLSX.read(xl.buf, { type: 'buffer' });
  check(/\.xlsx$/.test(xl.name) && wb.SheetNames.includes('Détail') && XLSX.utils.sheet_to_json(wb.Sheets['Détail'], { header: 1 }).length > 1, `b) Excel de la fiche : classeur lisible, feuille « Détail » remplie (${xl.name}, ${wb.SheetNames.join('/')})`);
  await dlg.locator('[data-testid=export-menu]').click();
  const csv = await download(pg, () => pg.locator('[data-testid=export-menu-csv]').click());
  check(/\.csv$/.test(csv.name) && csv.buf.toString('utf8').includes('Matricule'), 'b) CSV de la fiche : inchangé (aucun chunk lourd requis)');
  check(errors.length === 0, `aucune erreur JS (${errors.slice(0, 2).join(' | ')})`);
  await ctx.close();
}
// b) export d'ÉQUIPE : Excel, PDF et « Envoyer au comptable » (jamais testé ailleurs : excelAsBase64) + verrou APRÈS le fichier
{
  const { ctx, pg, seen, writes } = await admin(undefined, { accountant: true });
  check(heavyOf(seen).length === 0, 'b) équipe : rien de lourd avant l\'ouverture de la fenêtre « Exporter »');
  const t0 = Date.now();
  await pg.click('[data-testid=bar-export]');
  const team = pg.locator('[data-testid=team-export]'); await team.waitFor();
  check(await waitHeavy(seen, t0, 3, 5000), `b) équipe : les chunks arrivent à l'ouverture de la fenêtre « Exporter » (« Envoyer au comptable » en a besoin aussi) (vu : ${heavyOf(seen, t0).join(',') || 'rien'})`);
  await team.getByRole('button', { name: 'Cette semaine', exact: true }).click(); await pg.waitForTimeout(300);
  await team.locator('[data-testid=team-export-menu]').click();
  const w0 = writes.length;
  // Lot 18 : l'export d'équipe passe par l'alerte « Cet export va verrouiller… » : on la confirme (« Exporter et verrouiller » = le comportement d'avant).
  const confirmer = async () => { const c = pg.locator('[data-testid=export-verrou-confirm]'); await c.waitFor({ timeout: 10000 }); await c.click(); };
  const x = await download(pg, async () => { await pg.locator('[data-testid=team-export-menu-excel]').click(); await confirmer(); });
  check(/\.xlsx$/.test(x.name) && XLSX.read(x.buf, { type: 'buffer' }).SheetNames.includes('Détail'), `b) équipe : Excel lisible (${x.name})`);
  await pg.waitForTimeout(800);
  check(writes.slice(w0).some((w) => w.m === 'PATCH' && w.t === 'time_entries'), 'b) équipe : le verrouillage des heures part APRÈS le fichier (comme avant)');
  await team.waitFor({ state: 'visible' }).catch(() => {});
  for (let i = 0; i < 3 && await team.isVisible().catch(() => false); i++) { await pg.keyboard.press('Escape'); await pg.waitForTimeout(400); }
  // Envoyer au comptable : le classeur part en base64 (xlsx = zip « PK »)
  await pg.click('[data-testid=bar-export]'); await team.waitFor();
  await team.getByRole('button', { name: 'Cette semaine', exact: true }).click(); await pg.waitForTimeout(300);
  const send = pg.locator('[data-testid=send-accountant]');
  if (await send.count()) {
    const w1 = writes.length;
    await send.first().click(); await confirmer(); await pg.waitForTimeout(1500);
    const fn = writes.slice(w1).filter((w) => w.m === 'FN' && /send-payroll-export/.test(w.t));
    const sent = fn[0]?.body; const xb = sent?.contentBase64 ? Buffer.from(sent.contentBase64, 'base64') : null;
    check(fn.length === 1 && !!xb && xb.subarray(0, 2).toString() === 'PK' && XLSX.read(xb, { type: 'buffer' }).SheetNames.includes('Détail') && /\.xlsx$/.test(sent.fileName || ''),
      `b) équipe : « Envoyer à … » → send-payroll-export reçoit un VRAI classeur .xlsx en base64 (excelAsBase64) : ${fn.length} appel, ${sent?.fileName}, ${xb ? xb.length : 0} o`);
  } else console.log('⚠️  « Envoyer à … » introuvable (pas d\'e-mail comptable dans le jeu de données) — chemin excelAsBase64 NON couvert');
  await ctx.close();
}
// d) le chunk d'export ne charge pas (réseau coupé / ancien déploiement) : erreur claire, AUCUN verrouillage sans fichier
{
  const { ctx, pg, seen, writes } = await admin();
  if (heavyOf(seen).length) console.log('⚠️  d) ignoré : les chunks lourds sont déjà chargés au démarrage (build d\'avant le lot)');
  else {
    await ctx.route((u) => HEAVY.has(new URL(u).pathname), (r) => r.abort());
    await pg.click('[data-testid=bar-export]');
    const team = pg.locator('[data-testid=team-export]'); await team.waitFor();
    await team.getByRole('button', { name: 'Cette semaine', exact: true }).click(); await pg.waitForTimeout(300);
    await team.locator('[data-testid=team-export-menu]').click(); await pg.waitForTimeout(800);
    const w0 = writes.length; let got = null;
    pg.once('download', (d) => { got = d; });
    await pg.locator('[data-testid=team-export-menu-excel]').click();
    // Lot 18 : l'alerte s'ouvre (elle n'a pas besoin d'Excel) ; c'est APRÈS « Exporter et verrouiller » que l'outil manque.
    { const c = pg.locator('[data-testid=export-verrou-confirm]'); await c.waitFor({ timeout: 10000 }); await c.click(); }
    await pg.waitForTimeout(2500);
    check(!got, 'd) chunk Excel bloqué : aucun téléchargement');
    check(writes.slice(w0).filter((w) => w.m !== 'GET' && w.t === 'time_entries').length === 0, 'd) chunk Excel bloqué : AUCUN verrouillage des heures (pas de verrou sans fichier)');
    check(/Impossible de charger l.outil d.export/i.test(await lireToasts(pg).then((a) => a.join(' ')).catch(() => '')), 'd) chunk Excel bloqué : un message d\'erreur est affiché');
  }
  await ctx.close();
}

// ═══ c) fenêtre différée : s'ouvre sans clignoter, avec ses données, 2e ouverture sans nouveau chunk ═══════════
{
  const { ctx, pg, seen } = await admin();
  await pg.waitForTimeout(1200);
  for (const [nom, open, ready] of [
    ['Réglages', async () => { await pg.locator('.bt-pl-acct').first().click(); await pg.waitForTimeout(250); await pg.locator('button.bt-pl-acct-item', { hasText: 'Réglages' }).first().click(); }, async () => (await pg.locator('[role=dialog] input').evaluateAll((els) => els.map((e) => e.value))).includes('Pizzeria Exemple')],
    ['Fiche salarié', async () => { await pg.locator('button:visible', { hasText: 'Lucas Petit' }).first().click(); await pg.getByRole('button', { name: /Feuille d.heures/ }).click(); }, async () => (await pg.locator('[role=dialog]').innerText().catch(() => '')).includes('Villa Dupont')],
  ]) {
    for (const fois of [1, 2]) {
      const before = seen.length;
      await sampler(pg); await open();
      let shown = false; for (let i = 0; i < 40 && !shown; i++) { await sleep(100); shown = await ready().catch(() => false); }
      await sleep(500); const fr = await sampled(pg);
      check(shown, `c) ${nom} (${fois}ʳᵉ ouverture) : la fenêtre s'ouvre avec ses données`);
      check(flicker(fr) === null, `c) ${nom} (${fois}ʳᵉ ouverture) : pas de clignotement (${flicker(fr) || 'ok'} ; ${fr.length} images)`);
      if (fois === 2) check(seen.length === before, `c) ${nom} : la 2ᵉ ouverture ne télécharge aucun script de plus (${seen.length - before})`);
      for (let i = 0; i < 3 && await pg.locator('[role=dialog]').count(); i++) { await pg.keyboard.press('Escape'); await pg.waitForTimeout(500); }
    }
  }
  check(errors.length === 0, `aucune erreur JS (${errors.slice(0, 2).join(' | ')})`);
  await ctx.close();
}

// ═══ a/b) /poseur — chargement sans jsPDF ; l'Historique et son PDF ══════════════════════════════════════════
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true, isMobile: true, hasTouch: true });
  await setup(ctx, { as: { id: 'u-lucas', email: 'lucas@exemple.fr' } });
  const pg = await ctx.newPage(); mon(pg); const seen = watch(pg);
  await pg.goto(`http://localhost:${PORT}/poseur`); await pg.waitForSelector('.bt-total', { timeout: 25000 }); await pg.waitForTimeout(3000);
  check(heavyOf(seen).length === 0, `a) /poseur : aucune requête xlsx / jsPDF / autotable au chargement + 3 s de repos (vu : ${heavyOf(seen).join(',') || 'rien'} ; ${seen.length} scripts)`);
  await ouvrirVue(pg, 'Historique', { attente: 250 });
  await pg.waitForSelector('h2:has-text("Historique")', { timeout: 10000 }); await pg.waitForTimeout(900);
  const t0 = Date.now(); const pre = heavyOf(seen);
  console.log(`   (info) Historique ouvert : chunks PDF déjà demandés avant le clic « PDF » : ${pre.join(',') || 'aucun'}`);
  const pdf = await download(pg, () => pg.getByRole('button', { name: 'PDF' }).click());
  check(/^bemexo-historique-.*\.pdf$/.test(pdf.name) && pdf.buf.subarray(0, 5).toString() === '%PDF-' && pdf.buf.toString('latin1').includes('Total :'), `b) /poseur Historique : PDF réel (${pdf.name}, ${pdf.buf.length} o)`);
  check(heavyOf(seen).includes('jspdf') && heavyOf(seen).includes('autotable'), `b) /poseur : jsPDF + autotable ont fini par arriver (${heavyOf(seen).join(',')}), xlsx jamais (${!heavyOf(seen).includes('xlsx')})`);
  await ctx.close();
}
// ═══ e) fenêtres différées : onglets salarié, hors ligne après le repos, chunk de fenêtre bloqué ═══════════════
const LAZY = 'Impossible de charger cette fenêtre. Vérifiez votre connexion ou rechargez la page.';
const dialogTexts = (pg) => pg.locator('[role=dialog]').allInnerTexts().then((a) => a.join(' | ')).catch(() => '');
const waitText = async (pg, re, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (re.test(await dialogTexts(pg))) return true; await sleep(150); } return false; };
const closeAll = async (pg) => { for (let i = 0; i < 3 && await pg.locator('[role=dialog]:visible').count(); i++) { await pg.keyboard.press('Escape'); await pg.waitForTimeout(450); } };
/** La police Archivo est bien chargée (le @import retiré ne doit pas renvoyer l'écran en police système). */
const archivoOk = (pg) => pg.evaluate(async () => { await document.fonts.ready; return [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Archivo' && f.status === 'loaded'); });
const toasts = (pg) => lireToasts(pg).then((a) => a.join(' ')).catch(() => '');
{
  // e1/e2) salarié : Ma semaine → Mon mois → Historique après 3 s de repos, puis RÉSEAU COUPÉ : tout se rouvre
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', isMobile: true, hasTouch: true });
  await setup(ctx, { as: { id: 'u-lucas', email: 'lucas@exemple.fr' } });
  const pg = await ctx.newPage(); mon(pg);
  const err0 = errors.length;
  await pg.goto(`http://localhost:${PORT}/poseur`); await pg.waitForSelector('.bt-total', { timeout: 25000 }); await pg.waitForTimeout(3000);
  const goTab = async (label) => { await ouvrirVue(pg, label, { attente: 250, apres: 700 }); };
  const bodyText = () => pg.evaluate(() => document.body.innerText);
  for (const [label, titre] of [['Ma semaine', /semaine/i], ['Mon mois', /mois/i], ['Historique', /Historique/]]) {
    await goTab(label);
    const t = await bodyText();
    check(titre.test(t) && t.length > 200 && !t.includes("Cet écran n'a pas pu se charger"), `e1) salarié : « ${label} » s'affiche avec son contenu après 3 s de repos (${t.length} caractères)`);
    if (label === 'Mon mois') await shot(pg, 'salarie-mon-mois.png');
  }
  check(errors.length === err0, `e1) salarié : aucune erreur JS en changeant d'onglet (${errors.slice(err0, err0 + 2).join(' | ')})`);
  check(await archivoOk(pg), 'e1) /poseur : la police Archivo est chargée (feuille fonts.css en <link> du layout)');
  await pg.waitForTimeout(2500); // laisse finir la file de préchauffage
  await ctx.setOffline(true);
  await goTab('Ma journée'); await goTab('Mon mois');
  const tm = await bodyText();
  check(/mois/i.test(tm) && tm.length > 200 && !tm.includes("Cet écran n'a pas pu se charger"), 'e2) salarié hors ligne : « Mon mois » se rouvre');
  await goTab('Historique'); await goTab('Ma semaine');
  check((await bodyText()).length > 200, 'e2) salarié hors ligne : « Ma semaine » se rouvre');
  await ouvrirVue(pg, 'Mes congés', { attente: 250 });
  check(await waitText(pg, /Mes congés/), 'e2) salarié hors ligne : la fenêtre « Mes congés » s\'ouvre');
  check(!/Impossible de charger/.test(await toasts(pg)), 'e2) salarié hors ligne : aucun message d\'échec de chargement');
  await shot(pg, 'salarie-conges-hors-ligne.png');
  check(errors.length === err0, `e2) salarié hors ligne : aucune erreur JS (${errors.slice(err0, err0 + 2).join(' | ')})`);
  await ctx.close();
}
{
  // e2) bureau : Réserves, Réglages, Coûts se rouvrent réseau coupé (APRÈS le repos)
  const { ctx, pg } = await admin(); const err0 = errors.length;
  await pg.waitForTimeout(6000);
  await ctx.setOffline(true);
  await pg.locator('.bt-pl-out:visible', { hasText: 'Réserves' }).first().click();
  check(await waitText(pg, /Réserves de chantier/), 'e2) bureau hors ligne : « Réserves » s\'ouvre'); await closeAll(pg);
  await pg.locator('[data-testid=bar-cost]').click();
  check(await waitText(pg, /Coût par chantier/), 'e2) bureau hors ligne : « Coûts » s\'ouvre'); await closeAll(pg);
  await pg.locator('.bt-pl-acct').first().click(); await pg.waitForTimeout(250); await pg.locator('button.bt-pl-acct-item', { hasText: 'Réglages' }).first().click();
  check(await waitText(pg, /Réglages|Pizzeria Exemple/) || (await pg.locator('[role=dialog] input').evaluateAll((els) => els.map((e) => e.value))).includes('Pizzeria Exemple'), 'e2) bureau hors ligne : « Réglages » s\'ouvre'); await closeAll(pg);
  check(!/Impossible de charger/.test(await toasts(pg)), 'e2) bureau hors ligne : aucun message d\'échec de chargement');
  check(errors.length === err0, `e2) bureau hors ligne : aucune erreur JS (${errors.slice(err0, err0 + 2).join(' | ')})`);
  await ctx.close();
}
{
  // e3) le chunk d'une fenêtre (Réserves) ne charge pas : message clair, rien ne casse, le clic suivant réessaie
  const own = [...HEAVY.keys()]; void own;
  const chunk = walk(path.join(OUT, '_next', 'static', 'chunks')).filter((f) => f.endsWith('.js') && /rr-tab-open/.test(fs.readFileSync(f, 'utf8'))).map((f) => '/' + path.relative(OUT, f).split(path.sep).join('/'));
  check(chunk.length === 1 && !/^\/_next\/static\/chunks\/app\/admin\/page-/.test(chunk[0]), `e3) le code de « Réserves » est dans un chunk à part (${chunk.join(',') || 'introuvable'})`);
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await setup(ctx); const pg = await ctx.newPage(); mon(pg); const err0 = errors.length;
  let block = true;
  await ctx.route((u) => chunk.includes(new URL(u).pathname), (r) => (block ? r.abort() : r.continue()));
  await pg.goto(`http://localhost:${PORT}/admin`);
  await pg.locator('button:visible', { hasText: 'Lucas Petit' }).first().waitFor({ timeout: 25000 }); await pg.waitForTimeout(3000);
  await pg.locator('.bt-pl-out:visible', { hasText: 'Réserves' }).first().click(); await pg.waitForTimeout(1200);
  check(new RegExp(LAZY.slice(0, 40)).test(await toasts(pg)), `e3) chunk bloqué : le message « ${LAZY.slice(0, 33)}… » est affiché`);
  check(await pg.locator('[role=dialog]:visible').count() === 0, 'e3) chunk bloqué : aucune fenêtre vide ni cassée');
  check(errors.length === err0, `e3) chunk bloqué : aucune erreur JS (${errors.slice(err0, err0 + 2).join(' | ')})`);
  block = false; await pg.waitForTimeout(300);
  await pg.locator('.bt-pl-out:visible', { hasText: 'Réserves' }).first().click();
  check(await waitText(pg, /Réserves de chantier/, 8000), 'e3) après déblocage, le clic suivant ouvre la fenêtre');
  check(errors.length === err0, `e3) aucune erreur JS après réessai (${errors.slice(err0, err0 + 2).join(' | ')})`);
  await ctx.close();
}
// ═══ e4/e5/e6) onglets du salarié et assistant : attente, échec, nouvelle tentative, échec silencieux ═══════════
/** Chunks de /_next/static/chunks dont le contenu contient `re` (un seul attendu). */
const chunksWith = (re) => walk(path.join(OUT, '_next', 'static', 'chunks')).filter((f) => f.endsWith('.js') && re.test(fs.readFileSync(f, 'utf8'))).map((f) => '/' + path.relative(OUT, f).split(path.sep).join('/'));
const MONTH = chunksWith(/Aucune affectation ce mois-ci/);
const ASSIST = chunksWith(/Gestes simples faits tout de suite/);
check(MONTH.length === 1 && ASSIST.length === 1, `e4) chunks à part retrouvés : Mon mois (${MONTH.join(',') || 'introuvable'}), assistant salarié (${ASSIST.join(',') || 'introuvable'})`);
const SALARIE = { as: { id: 'u-lucas', email: 'lucas@exemple.fr' } };
const salarie = async (opts = {}, route) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', isMobile: true, hasTouch: true });
  await setup(ctx, { ...SALARIE, ...opts });
  if (route) await ctx.route((u) => route.chunks.includes(new URL(u).pathname), route.handler);
  const pg = await ctx.newPage(); mon(pg);
  await pg.goto(`http://localhost:${PORT}/poseur`); await pg.waitForSelector('.bt-total', { timeout: 25000 });
  return { ctx, pg };
};
const goTab = async (pg, label) => { await ouvrirVue(pg, label, { attente: 250, apres: 700 }); }; // 700 ms : laisse le menu se refermer avant de le rouvrir
const zone = (pg) => pg.evaluate(() => { const z = document.querySelector('.bt-phscroll'); return z ? { text: z.innerText, gris: z.querySelectorAll('.animate-pulse').length, statut: [...z.querySelectorAll('[role=status]')].map((e) => e.innerText).join(' ') } : null; });
const waitZone = async (pg, pred, ms = 8000) => { const t0 = Date.now(); let z = null; while (Date.now() - t0 < ms) { z = await zone(pg); if (z && pred(z)) return z; await sleep(150); } return z; };
const ANNEE = String(new Date(FIXED_NOW).getFullYear());
{
  // e4) le code de « Mon mois » n'est pas encore là (téléchargement lent) : des blocs gris, jamais une zone blanche, puis le contenu
  const err0 = errors.length;
  const { ctx, pg } = await salarie({}, { chunks: MONTH, handler: async (r) => { await sleep(3000); await r.continue(); } });
  await goTab(pg, 'Mon mois');
  const t0 = Date.now(); const attente = await waitZone(pg, (z) => z.gris >= 4, 2500);
  check(!!attente && attente.gris >= 4 && !/Cet écran n'a pas pu se charger/.test(attente.text), `e4) « Mon mois » attend son code : blocs gris à l'écran (${attente?.gris ?? 0} blocs), pas de message d'échec`);
  const pret = await waitZone(pg, (z) => z.gris === 0 && z.text.includes(ANNEE), 9000);
  check(!!pret && pret.gris === 0 && pret.text.includes(ANNEE), `e4) « Mon mois » : le contenu remplace les blocs gris dès que le code arrive (${Date.now() - t0} ms)`);
  check(!/Impossible de charger/.test(await toasts(pg)) && errors.length === err0, `e4) aucun message flottant ni erreur JS (${errors.slice(err0, err0 + 2).join(' | ')})`);
  await ctx.close();
}
for (const mode of ['réseau', 'onglet']) {
  // e5) le code de « Mon mois » ne vient pas : le texte à sa place (sans message flottant), puis NOUVELLE TENTATIVE
  //     (retour du réseau, ou retour sur l'onglet) — avant la correction : écran en échec jusqu'au rechargement
  const err0 = errors.length; let block = true;
  const { ctx, pg } = await salarie({}, { chunks: MONTH, handler: (r) => (block ? r.abort() : r.continue()) });
  await pg.waitForTimeout(2500);
  await goTab(pg, 'Mon mois');
  const ko = await waitZone(pg, (z) => /Cet écran n'a pas pu se charger/.test(z.statut), 6000);
  check(!!ko && /Cet écran n'a pas pu se charger/.test(ko.statut) && ko.gris === 0, `e5) (${mode}) code de « Mon mois » bloqué : le texte d'échec est annoncé (role=status) à la place des blocs gris`);
  check(!/Impossible de charger/.test(await toasts(pg)), `e5) (${mode}) pas de message flottant en plus pour un onglet`);
  block = false;
  if (mode === 'réseau') await pg.evaluate(() => window.dispatchEvent(new Event('online')));
  else { await goTab(pg, 'Ma journée'); await pg.waitForTimeout(400); await goTab(pg, 'Mon mois'); }
  const ok2 = await waitZone(pg, (z) => z.gris === 0 && z.text.includes(ANNEE) && !/Cet écran/.test(z.text), 8000);
  check(!!ok2 && ok2.text.includes(ANNEE) && !/Cet écran/.test(ok2.text), `e5) (${mode}) une nouvelle tentative a lieu et « Mon mois » s'affiche`);
  check(errors.length === err0, `e5) (${mode}) aucune erreur JS (${errors.slice(err0, err0 + 2).join(' | ')})`);
  await ctx.close();
}
{
  // e6) l'assistant du salarié se charge en fond, FERMÉ : s'il échoue, aucun message tant qu'on ne l'a pas ouvert ; au clic : message ; puis il s'ouvre
  const err0 = errors.length; let block = true;
  const { ctx, pg } = await salarie({ ai: true }, { chunks: ASSIST, handler: (r) => (block ? r.abort() : r.continue()) });
  await pg.waitForSelector('[data-testid=dock-assistant]', { timeout: 10000 }); await pg.waitForTimeout(3500);
  check(!/Impossible de charger/.test(await toasts(pg)), 'e6) chargement de fond de l\'assistant en échec : AUCUN message rouge sans geste de l\'utilisateur');
  check(errors.length === err0, `e6) aucune erreur JS (${errors.slice(err0, err0 + 2).join(' | ')})`);
  await pg.locator('[data-testid=dock-assistant]').click();
  let msg = false; for (let i = 0; i < 25 && !msg; i++) { await sleep(150); msg = /Impossible de charger cette fenêtre/.test(await toasts(pg)); }
  check(msg, 'e6) au clic sur l\'assistant, le chargement échoue : le message apparaît alors');
  block = false; await pg.waitForTimeout(500);
  await pg.locator('[data-testid=dock-assistant]').click();
  // Le panneau de l'assistant n'est pas un role=dialog : on lit le texte de la page (« Dites-moi vos heures… » = panneau ouvert).
  let ouvert = false; for (let i = 0; i < 50 && !ouvert; i++) { await sleep(150); ouvert = /Dites-moi vos heures/.test(await pg.evaluate(() => document.body.innerText)); }
  check(ouvert, 'e6) après déblocage, le clic suivant ouvre l\'assistant');
  check(errors.length === err0, `e6) aucune erreur JS après réessai (${errors.slice(err0, err0 + 2).join(' | ')})`);
  await ctx.close();
}
// ═══ f) téléphone (390 px) : chaque fenêtre du menu ☰ s'ouvre du premier coup, sans clignoter ni déborder ═══════
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris', isMobile: true, hasTouch: true, acceptDownloads: true });
  await setup(ctx, { accountant: true }); const pg = await ctx.newPage(); mon(pg); const err0 = errors.length;
  await pg.goto(`http://localhost:${PORT}/admin`);
  await pg.waitForSelector('button[aria-label="Menu"]', { timeout: 25000 });
  // Pas de repos : on ouvre tout de suite, comme un patron pressé (le code des fenêtres peut ne pas être arrivé).
  const noHScroll = () => pg.evaluate(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((x) => x.getClientRects().length && !x.closest('#cc-main')).pop(); return d ? d.scrollWidth <= d.clientWidth + 1 : true; });
  const viaMenu = async (item, re, nom, snap, then) => {
    await sampler(pg);
    await pg.locator('button[aria-label="Menu"]:visible').first().click();
    await pg.locator('.bt-mm-item', { hasText: item }).first().click();
    const shown = await waitText(pg, re, 10000); await sleep(600);
    const fr = await sampled(pg);
    check(shown, `f) 390 px : ☰ → ${nom} s'ouvre avec son contenu`);
    check(flicker(fr) === null, `f) 390 px : ☰ → ${nom} sans clignotement (${flicker(fr) || 'ok'} ; ${fr.length} images)`);
    check(await noHScroll(), `f) 390 px : ☰ → ${nom} sans défilement horizontal`);
    if (then) await then();
    if (snap) await shot(pg, snap);
    await closeAll(pg);
  };
  check(await archivoOk(pg), 'f) /admin : la police Archivo est chargée (feuille fonts.css en <link> du layout)');
  await viaMenu('Réglages', /Pizzeria Exemple|Réglages/, 'Réglages', 'bureau-reglages-390.png');
  await viaMenu('Coût chantiers', /Coût par chantier/, 'Coûts', 'bureau-couts-390.png', async () => {
    await sleep(500); const t = await dialogTexts(pg);
    check(/Villa Dupont/.test(t) && /333/.test(t) && !/Aucune heure déclarée/.test(t), `f) 390 px : « Coûts » affiche les heures et le coût fictifs (Villa Dupont, 333 €) — pas une fenêtre vide`);
  });
  await viaMenu('Statistiques', /Statistiques/, 'Statistiques');
  await viaMenu('Demandes de congé', /Demandes de congé/, 'Congés');
  await viaMenu('Réserves', /Réserves de chantier/, 'Réserves');
  await viaMenu('Salariés', /Salariés/, 'Salariés', 'bureau-fiche-salarie-390.png', async () => {
    await pg.locator('[role=dialog] button', { hasText: 'Lucas Petit' }).first().click();
    check(await waitText(pg, /Lucas Petit/, 8000) && !/Salariés\s*\|/.test(await dialogTexts(pg)), 'f) 390 px : fiche salarié ouverte depuis la liste');
    await sleep(700);
  });
  await viaMenu('Exporter', /Exporter|Cette semaine/, 'Exporter', 'bureau-exporter-390.png', async () => {
    await pg.locator('[data-testid=team-export]').getByRole('button', { name: 'Cette semaine', exact: true }).click(); await sleep(300);
    await pg.locator('[data-testid=team-export-menu]').click(); await sleep(500);
  });
  check(errors.length === err0, `f) 390 px : aucune erreur JS (${errors.slice(err0, err0 + 2).join(' | ')})`);
  await ctx.close();
}
console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
