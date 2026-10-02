// Lancer : node scripts/tests/admin-lot9.mjs out docs/captures-lot9 (après npm run build).
// Lot 9 — bureau, sur la VRAIE page planning (base simulée, aucune écriture) :
//  1) bandeau (lot 11 : « N j à relancer », mois en cours) = somme EXACTE des pastilles « X jours en
//     attente » des lignes (salariée absente aujourd'hui comprise ; compte désactivé et bureau exclus) ;
//     (lot 11 : « N h validée(s) » et « N en direct » ont quitté le cockpit — demande du gérant ;
//      les heures par chantier sont dans « Coût chantiers », la case verte reste la seule trace du direct) ;
//  2) « en cours depuis » : bulle désignée par planning_id, pastille verte quand le chantier pointé
//     n'est pas au planning, jour préfixé pour un chrono oublié, case verte, badge mobile « EN COURS » ;
//  3) sondage active_sessions (30 s, colonnes strictes, en pause onglet caché, relu au retour) :
//     un chrono fermé fait apparaître le brouillon SANS recharger la page.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { chromium } from 'playwright-core';
const [,, OUT, SH, PORT = '4198'] = process.argv; fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT), r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ─── Dates relatives (jour de Paris) ───────────────────────────────────────────
// Lot 11 : horloge FIGÉE (mercredi 21 octobre 2026, 10:00) — « À relancer » regarde le mois
// en cours ; sans horloge fixe, les jours J-2…J-6 tomberaient le mois d'avant en début de mois.
const NOW = new Date('2026-10-21T10:00:00+02:00');
const today = '2026-10-21';
const day = (n) => { const x = new Date(`${today}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const monday = day(-((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
const inWeek = (d) => d >= monday && d <= day(-((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7) + 6);
const hhmm = (iso) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
const ago = (h) => new Date(NOW.getTime() - h * 3600e3).toISOString();

// ─── Base simulée ──────────────────────────────────────────────────────────────
const CO = 'c0000000-0000-0000-0000-000000000001';
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', is_active: true };
const W2 = { id: 'w2', company_id: CO, client_name: 'Maison Garnier', city: 'Vienne', is_active: true };
const u = (id, first, last, role = 'worker', is_active = true) => ({ id, company_id: CO, first_name: first, last_name: last, role, email: `${id}@x.fr`, is_active, created_at: '2026-01-01' });
const slot = (id, user_id, work_date, ws, extra = {}) => ({ id, company_id: CO, user_id, worksite_id: ws?.id ?? null, work_date, absence_type: null, estimated_start: '08:00:00', estimated_end: '17:00:00', notes: null, created_at: `${work_date}T06:00:00Z`, worksite: ws ?? null, ...extra });
const entry = (id, user_id, work_date, ws, status, minutes, start = '08:00:00') => ({ id, company_id: CO, user_id, work_date, worksite_id: ws.id, status, start_time: start, end_time: `${String(Number(start.slice(0, 2)) + minutes / 60).padStart(2, '0')}:00:00`, total_minutes: minutes, reception: null, reserve_resolved_at: null, observation: null });
const sKevin = { user_id: 'u-kevin', company_id: CO, worksite_id: 'w1', planning_id: 'pl-kevin', work_date: today, started_at: ago(2), positions: [{ lat: 45.7, lng: 4.8 }] };
const sMarc = { user_id: 'u-marc', company_id: CO, worksite_id: 'w2', planning_id: null, work_date: today, started_at: ago(1), positions: [] };
const sNina = { user_id: 'u-nina', company_id: CO, worksite_id: 'w1', planning_id: 'pl-nina', work_date: day(-1), started_at: new Date(`${day(-1)}T05:45:00Z`).toISOString(), positions: [] };
const D = {
  users: [
    u('u-admin', 'Paul', 'Martin', 'admin'),
    u('u-kevin', 'Kevin', 'Roussel'), u('u-sara', 'Sara', 'Benali'), u('u-marc', 'Marc', 'Durand'), u('u-lea', 'Léa', 'Petit'), u('u-nina', 'Nina', 'Morel'),
    u('u-old', 'Ancien', 'Compte', 'worker', false), // désactivé : planning passé sans heures → exclu
  ],
  companies: [{ id: CO, name: 'Mister Grill Kebab', ai_enabled: true, kiosk_enabled: false, position_tracking_enabled: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35 }],
  worksites: [W1, W2],
  planning: [
    slot('pl-kevin', 'u-kevin', today, W1), slot('pk-2', 'u-kevin', day(-2), W1), slot('pk-3', 'u-kevin', day(-3), W1), // Kevin : 2 jours dus
    slot('ps-abs', 'u-sara', today, null, { absence_type: 'conge', estimated_start: null, estimated_end: null }), // Sara absente AUJOURD'HUI…
    slot('ps-4', 'u-sara', day(-4), W2), slot('ps-5', 'u-sara', day(-5), W2), slot('ps-6', 'u-sara', day(-6), W2), // …et 3 jours dus
    slot('pl-marc', 'u-marc', today, W1), // Marc pointe sur W2, pas au planning → pastille verte
    slot('pl-lea', 'u-lea', today, W1), // Léa : heures envoyées aujourd'hui
    slot('pl-nina', 'u-nina', day(-1), W1), // Nina : chrono oublié d'hier (1 jour dû)
    slot('po-2', 'u-old', day(-2), W1), slot('po-3', 'u-old', day(-3), W1), slot('po-4', 'u-old', day(-4), W1), slot('po-5', 'u-old', day(-5), W1),
    slot('pa-2', 'u-admin', day(-2), W1), // le bureau aussi : exclu
  ],
  time_entries: [
    entry('e1', 'u-lea', today, W1, 'submitted', 60), entry('e2', 'u-lea', today, W1, 'validated', 60, '09:00:00'), // 2 h validées
    entry('e3', 'u-lea', today, W2, 'draft', 180, '10:00:00'), // brouillon : ne compte pas
  ],
  active_sessions: [sKevin, sMarc, sNina],
  month_closures: [], leave_requests: [], invitations: [], documents: [], certifications: [], push_subscriptions: [],
};
const EXPECTED_WAITING = 2 + 3 + 1; // Kevin + Sara (absente) + Nina ; u-old et u-admin exclus

// ─── Session simulée + routes Supabase ─────────────────────────────────────────
const now = Math.floor(NOW.getTime() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
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
const log = { liveSelects: [], liveGets: 0, planningGets: 0, writes: 0 };
const setup = async (ctx) => {
  await ctx.clock.install({ time: NOW });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
    const t = url.pathname.replace('/rest/v1/', '');
    const m = r.request().method();
    if (m !== 'GET' && m !== 'HEAD') { log.writes++; console.log('   écriture', m, t); return r.fulfill({ status: 201, json: {} }); }
    if (t === 'active_sessions') { log.liveGets++; log.liveSelects.push(url.searchParams.get('select')); }
    if (t === 'planning' && (url.searchParams.get('select') || '').includes('worksite:worksites')) log.planningGets++;
    const rows = filterRows(D[t] || [], url.searchParams);
    if ((r.request().headers()['accept'] || '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
  });
};

let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const vis = (p, sel) => p.locator(`${sel}:visible`);

// ─── Bureau 1440×900 : bandeau, en cours, sondage ──────────────────────────────
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
await setup(ctx);
const p = await ctx.newPage();
const clockOk = true; // horloge installée sur le contexte (setup)
await p.goto(`http://localhost:${PORT}/admin`); await p.waitForSelector('[data-testid=stat-waiting]', { timeout: 20000 }); await p.waitForTimeout(1500);

// 1) Bandeau = somme des pastilles
const waitTxt = (await p.locator('[data-testid=stat-waiting]').innerText()).replace(/\s+/g, ' ').replace('▾', '').trim();
const waitN = Number((waitTxt.match(/^(\d+)/) || [])[1]);
const pastilles = await vis(p, '[data-testid=row-waiting]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-days'))));
const pastilleTexts = await vis(p, '[data-testid=row-waiting]').allInnerTexts();
const sum = pastilles.reduce((a, n) => a + n, 0);
check(/^\d+ j à relancer$/.test(waitTxt), `1) libellé du bandeau (lot 11) : « ${waitTxt} »`);
check(waitN === sum, `1) bandeau (${waitN}) = somme des pastilles (${pastilleTexts.join(' + ')} = ${sum})`);
check(waitN === EXPECTED_WAITING, `1) ${EXPECTED_WAITING} attendues (compte désactivé et bureau exclus) : ${waitN}`);
const saraRow = p.locator('tr', { has: p.locator('.bt-pl-name', { hasText: 'Sara Benali' }) }).first();
const saraStatus = (await saraRow.locator('.bt-pl-namebtn').innerText()).replace(/\s+/g, ' ');
check(/Congé/.test(saraStatus) && /3 jours en attente/.test(saraStatus), `1) Sara absente aujourd'hui garde sa pastille : « ${saraStatus.trim()} »`);
check(await p.locator('.bt-pl-name', { hasText: 'Ancien Compte' }).count() === 0, '1) le compte désactivé n’a pas de ligne');
// Lot 11 : « h validées » a quitté le cockpit (détail par chantier dans « Coût chantiers »).
check(await p.locator('[data-testid=stat-hours]').count() === 0, '1) lot 11 : plus de « h validées » dans le cockpit');
const waitTitle = await p.locator('[data-testid=stat-waiting]').getAttribute('title');
check(/en octobre/.test(waitTitle || ''), `1) infobulle : le mois en toutes lettres (« ${waitTitle} »)`);
await p.click('[data-testid=stat-waiting]'); await p.waitForTimeout(200);
// textContent (pas innerText) : l'en-tête du panneau est en capitales par CSS.
const panelTxt = await p.locator('.bt-pl-sp').textContent();
check(/À relancer · octobre/.test(panelTxt) && /ce mois-ci/.test(panelTxt) && !/Ancien/.test(panelTxt), '1) panneau : « À relancer · octobre », mois en cours, sans le compte désactivé');
await p.locator('.bt-pl-sp').screenshot({ path: `${SH}/admin-panneau-journees.png` });
await p.locator('.bt-pl-ddbackdrop').first().click(); await p.waitForTimeout(200);

// 2) En cours depuis
check(log.liveSelects.length > 0 && log.liveSelects.every((s) => s === 'user_id,worksite_id,planning_id,work_date,started_at'), `2) active_sessions : colonnes strictes, jamais positions (${log.liveSelects[0]})`);
const kevinRow = p.locator('tr', { has: p.locator('.bt-pl-name', { hasText: 'Kevin Roussel' }) }).first();
const kevinLive = kevinRow.locator('[data-testid=bubble-live]');
check(await kevinLive.count() === 1 && (await kevinLive.innerText()).includes(`en cours depuis ${hhmm(sKevin.started_at)}`), `2) bulle de Kevin (planning_id) : « ${await kevinLive.first().innerText().catch(() => '—')} »`);
check(await kevinRow.locator('td.bt-pl-cell-live').count() === 1, '2) case de Kevin verte (bt-pl-cell-live)');
const marcRow = p.locator('tr', { has: p.locator('.bt-pl-name', { hasText: 'Marc Durand' }) }).first();
const chip = marcRow.locator('[data-testid=live-chip]');
// textContent : dans la case étroite, le « · » est masqué et le chantier passe à la ligne.
const chipTxt = ((await chip.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
check(await chip.count() === 1 && chipTxt === `en cours depuis ${hhmm(sMarc.started_at)} · Maison Garnier`, `2) pastille verte de Marc (chantier hors planning) : « ${chipTxt} »`);
check(await marcRow.locator('[data-testid=bubble-live]').count() === 0, '2) aucune bulle de Marc faussement « en cours » (jamais « la première bulle »)');
if (inWeek(day(-1))) {
  const ninaLive = p.locator('tr', { has: p.locator('.bt-pl-name', { hasText: 'Nina Morel' }) }).first().locator('[data-testid=bubble-live]');
  const t = (await ninaLive.innerText().catch(() => '')).trim();
  check(new RegExp(`^en cours depuis [a-zéû]+\\. ${hhmm(sNina.started_at)}$`).test(t), `2) chrono oublié : jour préfixé « ${t} »`);
} else console.log('   (hier n’est pas dans la semaine affichée : préfixe du jour non vérifié)');
check(await p.locator('[data-testid=stat-live]').count() === 0, '2) lot 11 : plus de compteur « en direct » (la case verte suffit)');
await p.click('button[aria-label="Légende des icônes"]'); await p.waitForTimeout(200);
check(await p.locator('.bt-pl-legrow', { hasText: 'En cours (pointage en direct)' }).count() === 1, '2) légende : « En cours (pointage en direct) »');
await p.locator('.bt-pl-dd').first().screenshot({ path: `${SH}/admin-legende.png` });
await p.locator('.bt-pl-ddbackdrop').first().click(); await p.waitForTimeout(200);
const sameLine = async (pg) => { const a = await pg.locator('[data-testid=stat-waiting]').boundingBox(); const l = await pg.locator('[data-testid=stat-docs]').boundingBox(); return !!a && !!l && Math.abs(a.y - l.y) < 4; };
check(await sameLine(p), '1440×900 : les 2 indicateurs du cockpit tiennent sur une ligne');
await p.mouse.move(720, 50); await p.waitForTimeout(150);
await p.screenshot({ path: `${SH}/admin-planning-1440x900.png` });

// 3) Sondage : Kevin ferme son chrono → brouillon visible sans recharger
await p.evaluate(() => { window.__sansRecharge = 1; });
D.active_sessions = D.active_sessions.filter((s) => s.user_id !== 'u-kevin');
D.time_entries.push(entry('e4', 'u-kevin', today, W1, 'draft', 120));
const g0 = log.liveGets, pl0 = log.planningGets;
if (clockOk) { await p.clock.fastForward(31000); } else { console.log('   (page.clock indisponible : déclenchement par visibilitychange)'); }
await p.waitForTimeout(clockOk ? 1500 : 0);
if (!clockOk) await p.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
await p.waitForTimeout(1500);
check(log.liveGets > g0, `3) le sondage relit active_sessions après 30 s (${log.liveGets - g0} lecture)`);
check(log.planningGets > pl0, '3) chrono disparu → planning relu (fetchPlanning)');
check(await kevinRow.locator('[data-testid=bubble-live]').count() === 0 && await kevinRow.locator('td.bt-pl-cell-live').count() === 0, '3) Kevin n’est plus « en cours »');
check((await kevinRow.locator('.bt-pl-bub-draft').innerText().catch(() => '')).includes('à envoyer'), '3) son brouillon apparaît (« à envoyer »)');
check(await p.evaluate(() => window.__sansRecharge === 1), '3) sans rechargement de la page');
check(await p.locator('[data-testid=stat-live]').count() === 0, '3) toujours aucun compteur « en direct » dans le cockpit');
check(Number(((await p.locator('[data-testid=stat-waiting]').innerText()).match(/\d+/) || [])[0]) === EXPECTED_WAITING, '3) le brouillon de Kevin ne change pas « À relancer » (un brouillon n’est pas envoyé, et c’est aujourd’hui)');

// 3 bis) Onglet caché : sondage en pause ; retour → relu tout de suite
const setVis = (state) => p.evaluate((s) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s }); document.dispatchEvent(new Event('visibilitychange')); }, state);
await setVis('hidden'); await p.waitForTimeout(200);
const g1 = log.liveGets;
if (clockOk) { await p.clock.fastForward(65000); await p.waitForTimeout(800); check(log.liveGets === g1, '3) onglet caché : aucune lecture pendant 65 s'); }
D.active_sessions.push({ user_id: 'u-lea', company_id: CO, worksite_id: 'w1', planning_id: null, work_date: today, started_at: ago(0.5), positions: [] });
await setVis('visible'); await p.waitForTimeout(1200);
check(log.liveGets > g1, '3) retour sur l’onglet : relu immédiatement');
const leaRow = p.locator('tr', { has: p.locator('.bt-pl-name', { hasText: 'Léa Petit' }) }).first();
check(await leaRow.locator('[data-testid=bubble-live]').count() === 1, '3) Léa (même chantier, sans planning_id) : sa bulle passe « en cours »');
check(log.writes === 0, `aucune écriture en base (${log.writes})`);
await ctx.close();

// ─── Captures : tablette paysage 1280×800, mobile 390×844 ──────────────────────
D.active_sessions = [sKevin, sMarc, sNina]; D.time_entries = D.time_entries.filter((e) => e.id !== 'e4');
const tab = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
await setup(tab); const pt = await tab.newPage();
await pt.goto(`http://localhost:${PORT}/admin`); await pt.waitForSelector('[data-testid=stat-waiting]', { timeout: 20000 }); await pt.waitForTimeout(1500);
check(await vis(pt, '[data-testid=bubble-live]').count() >= 1 && await vis(pt, '[data-testid=live-chip]').count() === 1, '1280×800 : bulle « en cours » et pastille verte visibles');
check(await sameLine(pt), '1280×800 : les chiffres du cockpit tiennent sur une ligne');
const chipBox = await vis(pt, '[data-testid=live-chip]').boundingBox(); const cellBox = await vis(pt, 'td.bt-pl-cell-live:has([data-testid=live-chip])').boundingBox();
check(!!chipBox && !!cellBox && chipBox.x + chipBox.width <= cellBox.x + cellBox.width, '1280×800 : la pastille verte ne déborde pas de sa case');
const chipScroll = await vis(pt, '[data-testid=live-chip]').evaluate((e) => e.scrollWidth <= e.clientWidth + 1);
check(chipScroll, '1280×800 : le texte de la pastille ne déborde pas');
await pt.mouse.move(640, 50); await pt.waitForTimeout(150);
await pt.screenshot({ path: `${SH}/admin-planning-1280x800.png` });
await tab.close();
const mob = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
await setup(mob); const pm = await mob.newPage();
await pm.goto(`http://localhost:${PORT}/admin`); await pm.waitForSelector('.bt-pl-m-card', { timeout: 20000 }); await pm.waitForTimeout(1500);
const kCard = pm.locator('.bt-pl-m-card', { hasText: 'Kevin Roussel' }).first();
const lCard = pm.locator('.bt-pl-m-card', { hasText: 'Léa Petit' }).first();
const mCard = pm.locator('.bt-pl-m-card', { hasText: 'Marc Durand' }).first();
check(await kCard.locator('[data-testid=m-badge-live]').count() === 1 && await kCard.locator('[data-testid=bubble-live]').count() === 1, 'mobile : Kevin « EN COURS » + bulle « en cours depuis »');
check(await mCard.locator('[data-testid=m-badge-live]').count() === 1 && await mCard.locator('[data-testid=live-chip]').count() === 1, 'mobile : Marc « EN COURS » + pastille verte');
// Lot 11 (item 8) : le vert est réservé au vrai pointage — « ✓ POINTÉ » vert devient « ✓ ENVOYÉ » neutre.
check((await lCard.innerText()).includes('✓ ENVOYÉ') && await lCard.locator('[data-testid=m-badge-live]').count() === 0, 'mobile : Léa (pas en direct) : « ✓ ENVOYÉ » (lot 11)');
await pm.screenshot({ path: `${SH}/admin-mobile-390x844.png` });
await mob.close();

// ─── Cockpit, entreprise en essai (pastille « Essai · S'abonner ») : iPad paysage 1024×768
//     (encore en mise en page bureau) et 1280×800, avec et sans pointage en cours : chiffres, logo
//     et colonne de droite ne se chevauchent jamais et restent dans le cockpit. ─────────────
D.companies[0].subscription_status = 'trialing'; D.companies[0].trial_ends_at = day(12);
const overlap = (a, c) => a.x < c.x + c.width - 0.5 && c.x < a.x + a.width - 0.5 && a.y < c.y + c.height - 0.5 && c.y < a.y + a.height - 0.5;
for (const [width, height] of [[1024, 768], [1280, 800]]) for (const live of [false, true]) {
  D.active_sessions = live ? [sKevin, sMarc, sNina] : [];
  const c = await b.newContext({ viewport: { width, height }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await setup(c); const pg = await c.newPage();
  await pg.goto(`http://localhost:${PORT}/admin`); await pg.waitForSelector('[data-testid=stat-waiting]', { timeout: 20000 }); await pg.waitForTimeout(1500);
  const [ck, st, lg, rt] = await Promise.all(['.bt-pl-cockpit', '.bt-pl-stats', '.bt-pl-cockpit .bt-pl-logo', '.bt-pl-cockpit-right'].map((s) => vis(pg, s).first().boundingBox()));
  const trialOn = await vis(pg, '.bt-pl-cockpit .bt-pl-trial').count() === 1;
  const liveOn = await vis(pg, '[data-testid=bubble-live]').count() > 0; // la case verte, pas un compteur
  const inside = [st, lg, rt].every((x) => x && x.x >= ck.x - 0.5 && x.x + x.width <= ck.x + ck.width + 0.5);
  const fmt = (x) => `${Math.round(x.x)}–${Math.round(x.x + x.width)}`;
  check(trialOn && liveOn === live && await vis(pg, '[data-testid=stat-live]').count() === 0 && st && lg && rt && !overlap(st, lg) && !overlap(lg, rt) && !overlap(st, rt) && inside,
    `${width}×${height} essai${live ? ' + 3 pointages en cours' : ''} : chiffres ${fmt(st)}, logo ${fmt(lg)}, droite ${fmt(rt)} — aucun chevauchement`);
  if (width === 1024 && live) { await pg.mouse.move(512, 300); await pg.waitForTimeout(150); await pg.screenshot({ path: `${SH}/admin-planning-1024x768-essai.png` }); }
  await c.close();
}

console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
