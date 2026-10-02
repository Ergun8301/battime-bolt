// Lancer : node scripts/tests/export-lot11.mjs out docs/captures-lot11 (après npm run build).
// (playwright-core doit être résoluble : copier le script à côté d'un node_modules qui l'a.)
// Lot 11 — items 12 et 13, sur la VRAIE page planning (base simulée, rien n'est écrit en vrai) :
//  12) le MÊME menu « Exporter ▾ » partout : PDF, Excel, CSV, dans cet ordre (fiche salarié ;
//      fenêtre de l'équipe si elle l'a déjà dans ce build). CSV ajouté à la fiche : en-tête,
//      Nom / Prénom séparés, matricule ENREGISTRÉ, seuls les jours de la période payés, et
//      identique au CSV de l'équipe réduit à ce salarié. « Sans verrou » : aucune écriture.
//  13) « Clôturer jusqu'au… » : jours futurs grisés, confirmation (brouillons signalés),
//      upsert user_closures (closed_until, closed_by), pastille « Heures clôturées jusqu'au … ·
//      Rouvrir », période passée au 1er du mois → date, « Rouvrir » = PATCH reopened_at (rien
//      n'est supprimé). « Archiver » propose d'abord la clôture. Table absente (404 PGRST205) :
//      le bouton est caché, le reste marche.
//      La ligne rouge « N jours en attente » de la fiche ne réclame plus les jours clôturés
//      (seuls ceux APRÈS la date restent) et revient après « Rouvrir ».
//  7)  aucun défilement horizontal (fiche, menu, calendrier, confirmation) à 390 / 768 / 1024 / 1280.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { chromium } from 'playwright-core';
const [,, OUT, SH, PORT = '4331'] = process.argv; fs.mkdirSync(SH, { recursive: true });
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
  entry('e-today', 'u-lucas', today, 'submitted', 4 * 60 + 30),     // aujourd'hui
  entry('e-draft', 'u-lucas', today, 'draft', 60, 14 * 60),         // brouillon : jamais payé, signalé à la clôture
  entry('e-prev', 'u-lucas', prevLast, 'submitted', 9 * 60),        // mois précédent : JAMAIS dans le CSV
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
const lucasMissing = PLANNING.filter((p) => p.user_id === 'u-lucas' && !lucasSent.has(p.work_date)).length; // ≥ 1
const enAttente = (n) => `${n} jour${n > 1 ? 's' : ''} en attente`;
// Les heures de Lucas réellement PAYÉES après « clôturer jusqu'à aujourd'hui » (1er → aujourd'hui).
const paidAfterClose = ENTRIES.filter((e) => e.user_id === 'u-lucas' && e.status === 'submitted' && e.work_date >= first && e.work_date <= today)
  .reduce((s, e) => s + e.total_minutes, 0);
const paidToday = ENTRIES.filter((e) => e.user_id === 'u-lucas' && e.status === 'submitted' && e.work_date === today).reduce((s, e) => s + e.total_minutes, 0);

const COMPANY = { id: CO, name: 'Mister Grill Kebab', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, travel_paid: false, accountant_email: null };
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
      if (op === 'gt') return String(cur) > val;
      if (op === 'lt') return String(cur) < val;
      if (op === 'is') return val === 'null' ? cur == null : String(cur) === val;
      return true;
    });
  }
  return rows;
};
/** closures : 'ok' (table présente) ou 'absent' (migration pas encore passée → 404 PGRST205). */
const setup = async (ctx, { closures = 'ok' } = {}) => {
  const db = freshDb();
  const writes = [];
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.clock.setFixedTime(FIXED_NOW);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const req = r.request();
    const url = new URL(req.url());
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/')) { writes.push({ m: 'FN', t: url.pathname }); return r.fulfill({ json: {} }); }
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
// Les fenêtres et menus s'ouvrent en fondu : on attend la fin de l'animation avant la capture.
const shot = async (pg, name) => { await pg.waitForTimeout(450); await pg.screenshot({ path: path.join(SH, name) }); };

const openAdmin = async (ctx) => {
  const pg = await ctx.newPage();
  await pg.goto(`http://localhost:${PORT}/admin`);
  await pg.locator('button:visible', { hasText: 'Lucas Petit' }).first().waitFor({ timeout: 25000 });
  await pg.waitForTimeout(800);
  return pg;
};
const fiche = (pg) => pg.locator('[role=dialog]').filter({ has: pg.locator('h2', { hasText: /Lucas Petit|Maximilien|Nina Roux/ }) }).last();
/** Fiche « heures » : clic sur le nom → « Feuille d'heures » (desktop ET mobile). */
const openHours = async (pg, name = 'Lucas Petit') => {
  await pg.locator('button:visible', { hasText: name }).first().click();
  await pg.getByRole('button', { name: /Feuille d.heures/ }).click();
  await pg.locator('[role=dialog] h2', { hasText: name }).waitFor();
  await pg.waitForTimeout(900);
  return pg.locator('[role=dialog]').filter({ has: pg.locator('h2', { hasText: name }) });
};
/** Fiche « gérer » : panneau « Salariés » → nom. */
const openManage = async (pg, name = 'Lucas Petit') => {
  await pg.locator('.bt-pl-segbtn:visible', { hasText: 'Salariés' }).first().click();
  await pg.locator('[role=dialog] button', { hasText: name }).first().click();
  await pg.locator('[role=dialog] h2', { hasText: name }).waitFor();
  await pg.waitForTimeout(900);
  return pg.locator('[role=dialog]').filter({ has: pg.locator('h2', { hasText: name }) });
};
const menuItems = async (pg) => pg.locator('[role=menu]:visible [role=menuitem]').evaluateAll((els) => els.map((e) => e.innerText.split('\n')[0].trim()));
const download = async (pg, click) => {
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 10000 }), click()]);
  const p = await dl.path();
  return { name: dl.suggestedFilename(), text: fs.readFileSync(p, 'utf8') };
};
/** Défilement horizontal : la page, chaque fenêtre ouverte (et ce qui dépasse son bord droit), chaque menu/popover. */
const hScroll = (pg) => pg.evaluate(() => {
  const out = [];
  const de = document.documentElement;
  if (de.scrollWidth > window.innerWidth + 1) out.push(`page ${de.scrollWidth} > ${window.innerWidth}`);
  for (const d of document.querySelectorAll('[role=dialog], [role=alertdialog]')) {
    if (d.scrollWidth > d.clientWidth + 1) out.push(`fenêtre « ${(d.querySelector('h2')?.textContent || '').slice(0, 30)} » ${d.scrollWidth} > ${d.clientWidth}`);
    const R = d.getBoundingClientRect();
    if (R.left < -1 || R.right > window.innerWidth + 1) out.push(`fenêtre hors écran ${Math.round(R.left)}…${Math.round(R.right)}`);
    for (const el of d.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > R.right + 1 && !el.closest('[data-radix-popper-content-wrapper]')) { out.push(`déborde : <${el.tagName.toLowerCase()}> « ${(el.textContent || '').trim().slice(0, 30)} » ${Math.round(r.right)} > ${Math.round(R.right)}`); break; }
    }
  }
  for (const p of document.querySelectorAll('[data-radix-popper-content-wrapper] > *')) {
    const r = p.getBoundingClientRect();
    if (r.width && (r.left < -1 || r.right > window.innerWidth + 1)) out.push(`menu/popover hors écran ${Math.round(r.left)}…${Math.round(r.right)}`);
  }
  return out;
});
const parseCsv = (text) => text.replace(/^﻿/, '').trim().split(/\r\n/).map((l) => l.split(';'));
const HEAD = 'Matricule;Nom;Prenom;Semaine du;Semaine au;Heures normales;Heures sup 25%;Heures sup 50%;Dont route payee;Total heures;Base hebdo;Controle h:min';
const centi = (min) => (min / 60).toFixed(2).replace('.', ',');

// ═══ A) Fiche salarié — 1280×800 : menu, CSV, clôture, Rouvrir ═════════════════
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true });
  const { writes, db } = await setup(ctx);
  const pg = await openAdmin(ctx);
  let dlg = await openHours(pg);
  await shot(pg, 'fiche-heures-1280x800.png');

  // 12) le menu
  check(await dlg.locator('[data-testid=export-menu]').count() === 1, 'A) fiche : un seul bouton « Exporter ▾ »');
  check(await dlg.getByRole('button', { name: /^(Excel|PDF)$/ }).count() === 0, 'A) fiche : plus de boutons Excel / PDF séparés');
  await dlg.locator('[data-testid=export-menu]').click();
  await pg.locator('[role=menu]').waitFor();
  const itemsFiche = await menuItems(pg);
  check(JSON.stringify(itemsFiche) === JSON.stringify(['PDF', 'Excel', 'CSV']), `A) fiche : menu = PDF, Excel, CSV dans cet ordre (${itemsFiche.join(', ')})`);
  await shot(pg, 'fiche-exporter-menu-1280x800.png');
  check((await hScroll(pg)).length === 0, `A) 1280 : menu ouvert, aucun défilement horizontal ${JSON.stringify(await hScroll(pg))}`);
  await pg.keyboard.press('Escape');
  check(await dlg.locator('[data-testid=fiche-sans-verrou]').innerText().then((t) => /Sans verrou/.test(t)), 'A) fiche : une ligne « Sans verrou » avec ⓘ');

  // CSV « Aujourd'hui » de la fiche
  const w0 = writes.length;
  await dlg.locator('[data-testid=export-menu]').click();
  const csvToday = await download(pg, () => pg.locator('[data-testid=export-menu-csv]').click());
  const rowsT = parseCsv(csvToday.text);
  check(rowsT[0].join(';') === HEAD, 'A) CSV fiche : en-tête du CSV de paie (Matricule;Nom;Prenom;…)');
  check(rowsT.length === 2 && rowsT[1][0] === '00042' && rowsT[1][1] === 'Petit' && rowsT[1][2] === 'Lucas',
    `A) CSV fiche : matricule ENREGISTRÉ 00042, Nom = Petit, Prénom = Lucas (${rowsT[1]?.slice(0, 3).join(' / ')})`);
  check(rowsT[1]?.[9] === centi(paidToday), `A) CSV fiche (aujourd'hui) : ${centi(paidToday)} h payées, brouillon exclu (${rowsT[1]?.[9]})`);
  check(/-paie\.csv$/.test(csvToday.name), `A) fichier nommé …-paie.csv (${csvToday.name})`);
  check(!writes.slice(w0).some((w) => w.t === 'time_entries'), 'A) export de la fiche : aucune écriture (sans verrou)');

  // « Jours en attente » AVANT la clôture : le planning sans heures envoyées.
  const missingTxt = async () => (await dlg.locator('[data-testid=fiche-missing]').count()) ? (await dlg.locator('[data-testid=fiche-missing]').innerText()) : '';
  check((await missingTxt()).includes(enAttente(lucasMissing)), `A) avant clôture : « ${enAttente(lucasMissing)} » (« ${(await missingTxt()).replace(/\s+/g, ' ')} »)`);

  // 13) « Clôturer jusqu'au… »
  check(await dlg.locator('[data-testid=closure-open]').isVisible(), 'A) « Clôturer jusqu’au… » à côté d’« Exporter »');
  await dlg.locator('[data-testid=closure-open]').click();
  const cal = pg.locator('[data-testid=closure-calendar]');
  await cal.waitFor();
  const days = await cal.locator('button[name=day]').evaluateAll((els, d) => {
    const list = els.map((e) => ({ n: Number(e.textContent.trim()), outside: /day-outside/.test(e.className), dis: e.disabled || e.getAttribute('aria-disabled') === 'true' }));
    const i = list.findIndex((x) => !x.outside && x.n === d);
    return { i, today: list[i], after: list.slice(i + 1), before: list.slice(0, i).filter((x) => !x.outside) };
  }, Number(today.slice(8, 10)));
  check(days.i >= 0 && !days.today.dis, 'A) calendrier : aujourd’hui est cliquable');
  check(days.after.length === 0 || days.after.every((x) => x.dis), `A) calendrier : les jours futurs sont grisés (${days.after.length} jour(s) après aujourd’hui, tous désactivés)`);
  check(days.before.every((x) => !x.dis), 'A) calendrier : les jours passés du mois restent cliquables');
  await shot(pg, 'fiche-cloture-calendrier-1280x800.png');
  await cal.locator('button[name=day]').nth(days.i).click();
  const conf = pg.locator('[data-testid=closure-confirm]');
  await conf.waitFor();
  const confTitle = await conf.locator('h2').innerText();
  const dLong = new Date(`${today}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  check(confTitle.includes(`Clôturer les heures de Lucas jusqu'au ${dLong}`), `A) confirmation : « ${confTitle} »`);
  check(await conf.getByText('Il ne pourra plus rien saisir ni envoyer jusqu’à cette date. Vous gardez la main.'.replace('’', "'")).count() === 1,
    'A) confirmation : « Il ne pourra plus rien saisir ni envoyer jusqu’à cette date. Vous gardez la main. »');
  check(await conf.locator('[data-testid=closure-drafts]').innerText().then((t) => /1 journée en brouillon/.test(t)), 'A) confirmation : le brouillon d’aujourd’hui est signalé (orange)');
  await shot(pg, 'fiche-cloture-confirmation-1280x800.png');
  const w1 = writes.length;
  await conf.locator('[data-testid=closure-confirm-btn]').click();
  await dlg.locator('[data-testid=closure-chip]').waitFor({ timeout: 5000 });
  const post = writes.slice(w1).find((w) => w.t === 'user_closures' && w.m === 'POST');
  const body = post && (Array.isArray(post.body) ? post.body[0] : post.body);
  check(!!post && /on_conflict=user_id/.test(post.q), 'A) « Clôturer » : upsert sur user_closures (on_conflict=user_id)');
  check(body?.user_id === 'u-lucas' && body?.company_id === CO && body?.closed_until === today && body?.closed_by === 'u-admin' && body?.reopened_at === null,
    `A) upsert : closed_until = ${today}, closed_by = le bureau, reopened_at vidé (${JSON.stringify(body)})`);
  const chip = await dlg.locator('[data-testid=closure-chip]').innerText();
  check(chip.includes(`Heures clôturées jusqu'au ${ddmm(today)}`) && chip.includes('Rouvrir'), `A) pastille « ${chip.replace(/\s+/g, ' ')} »`);
  const period = await dlg.getByText(/^Période :/).innerText();
  const expectPeriod = first === today ? /Aujourd/ : new RegExp(`1 ${new Date(`${today}T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' }).replace('.', '\\.?')}`, 'i');
  check(expectPeriod.test(period), `A) la période passe au 1er du mois → ${ddmm(today)} (« ${period} »)`);
  check(await dlg.locator('[data-testid=fiche-missing]').count() === 0, `A) après clôture : plus aucun jour clôturé réclamé (« ${(await missingTxt()).replace(/\s+/g, ' ')} »)`);
  await pg.waitForTimeout(600);
  await shot(pg, 'fiche-cloturee-1280x800.png');

  // « Exporter » juste à côté : le relevé final (1er → date de clôture).
  await dlg.locator('[data-testid=export-menu]').click();
  const csvFinal = await download(pg, () => pg.locator('[data-testid=export-menu-csv]').click());
  const rowsF = parseCsv(csvFinal.text);
  const totalF = rowsF.slice(1).reduce((s, r) => s + Number(r[9].replace(',', '.')), 0);
  check(rowsF.slice(1).every((r) => r[0] === '00042' && r[1] === 'Petit' && r[2] === 'Lucas'), 'A) relevé final : chaque ligne porte 00042 / Petit / Lucas');
  check(Math.abs(totalF - paidAfterClose / 60) < 0.001, `A) relevé final : ${centi(paidAfterClose)} h payées = seuls les jours du 1er au ${ddmm(today)} (le ${ddmm(prevLast)} du mois précédent exclu ; lu ${totalF.toFixed(2)})`);

  // Rouvrir
  const w2 = writes.length;
  await dlg.locator('[data-testid=closure-reopen]').click();
  await dlg.locator('[data-testid=closure-open]').waitFor({ timeout: 5000 });
  const patch = writes.slice(w2).find((w) => w.t === 'user_closures' && w.m === 'PATCH');
  check(!!patch && !!patch.body?.reopened_at && /user_id=eq\.u-lucas/.test(patch.q) && /reopened_at=is\.null/.test(patch.q),
    `A) « Rouvrir » : PATCH reopened_at (rien n’est supprimé) ${patch ? patch.q : ''}`);
  check(!writes.some((w) => w.t === 'user_closures' && w.m === 'DELETE'), 'A) aucune suppression sur user_closures');
  check(db.user_closures.find((x) => x.user_id === 'u-lucas')?.reopened_at != null, 'A) la ligne reste, datée « rouverte »');
  check((await missingTxt()).includes(enAttente(lucasMissing)), `A) après « Rouvrir » : les jours en attente reviennent (« ${(await missingTxt()).replace(/\s+/g, ' ')} »)`);

  // Le CSV de l'équipe, réduit à Lucas, est IDENTIQUE au CSV de la fiche (même période : aujourd'hui).
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
  await pg.locator('.bt-pl-fill:visible', { hasText: 'Exporter' }).first().click();
  const teamItem = pg.getByRole('button', { name: /Exporter l.équipe/ });
  if (await teamItem.count()) await teamItem.first().click();
  const team = pg.locator('[role=dialog]').filter({ has: pg.locator('h2', { hasText: /Exporter l.équipe/ }) });
  await team.waitFor();
  await team.getByRole('button', { name: "Aujourd'hui", exact: true }).click();
  const teamMenu = team.locator('[data-testid=team-export-menu]');
  check(await teamMenu.count() === 1, 'A) équipe : un seul bouton « Exporter ▾ »');
  await teamMenu.click();
  const itemsTeam = await menuItems(pg);
  check(JSON.stringify(itemsTeam) === JSON.stringify(itemsFiche), `A) équipe : le MÊME menu que la fiche (${itemsTeam.join(', ')})`);
  const csvTeam = await download(pg, () => pg.locator('[data-testid=team-export-menu-csv]').click());
  const teamLucas = parseCsv(csvTeam.text).filter((r) => r[0] === '00042');
  check(parseCsv(csvTeam.text)[0].join(';') === HEAD, 'A) équipe : même en-tête');
  check(JSON.stringify(teamLucas) === JSON.stringify(rowsT.slice(1)),
    `A) CSV fiche = CSV équipe réduit à Lucas (${JSON.stringify(rowsT.slice(1))} / ${JSON.stringify(teamLucas)})`);
  await ctx.close();
}

// ═══ B) Fiche « gérer » : « Archiver » propose d'abord « Clôturer jusqu'au… » ══
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const { writes } = await setup(ctx);
  const pg = await openAdmin(ctx);
  const dlg = await openManage(pg);
  check(await dlg.locator('[data-testid=closure-open]').isVisible(), 'B) gérer : « Clôturer jusqu’au… » à côté d’« Archiver »');
  check(await dlg.getByText('remplis seulement ce que tu as').count() === 0, 'B) gérer : plus de « tu » côté bureau (Infos paie)');
  await dlg.locator('[data-testid=worker-archive]').click();
  const ask = pg.locator('[data-testid=archive-ask]');
  await ask.waitFor();
  check(await ask.locator('[data-testid=closure-calendar]').count() === 1 && await ask.getByRole('button', { name: 'Archiver sans clôturer' }).count() === 1,
    'B) « Archiver » : propose d’abord de clôturer ses heures (calendrier) ou d’archiver sans clôturer');
  await shot(pg, 'fiche-gerer-archiver-1280x800.png');
  check((await hScroll(pg)).length === 0, `B) 1280 : aucun défilement horizontal ${JSON.stringify(await hScroll(pg))}`);
  await ask.getByRole('button', { name: 'Annuler' }).click();
  await pg.waitForTimeout(300);
  check(!writes.some((w) => w.t === 'users'), 'B) « Annuler » : rien n’est archivé');
  await ctx.close();
}

// ═══ C) Table absente (migration pas encore passée) : le bouton est caché ═════
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true });
  const { writes } = await setup(ctx, { closures: 'absent' });
  const pg = await openAdmin(ctx);
  let dlg = await openHours(pg);
  check(await dlg.locator('[data-testid=closure-open], [data-testid=closure-chip]').count() === 0, 'C) 404 PGRST205 : « Clôturer jusqu’au… » caché (heures)');
  check(await dlg.locator('[data-testid=export-menu]').count() === 1, 'C) … « Exporter ▾ » toujours là');
  await dlg.locator('[data-testid=export-menu]').click();
  const csv = await download(pg, () => pg.locator('[data-testid=export-menu-csv]').click());
  check(parseCsv(csv.text)[1]?.[0] === '00042', 'C) … et le CSV sort normalement');
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
  dlg = await openManage(pg);
  check(await dlg.locator('[data-testid=closure-open], [data-testid=closure-chip]').count() === 0, 'C) 404 PGRST205 : caché aussi en mode « gérer »');
  await dlg.locator('[data-testid=worker-archive]').click();
  await pg.waitForTimeout(600);
  check(await pg.locator('[data-testid=archive-ask]').count() === 0 && writes.some((w) => w.t === 'users' && w.m === 'PATCH'),
    'C) sans la table, « Archiver » archive directement (comme avant)');
  await ctx.close();
}

// ═══ D) Aucun défilement horizontal + captures : 390 / 768 / 1024 / 1280 ══════
for (const [w, h, name] of [[390, 844, '390x844'], [768, 1024, '768x1024'], [1024, 768, '1024x768'], [1280, 800, '1280x800']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'fr-FR', timezoneId: 'Europe/Paris', isMobile: w < 800, hasTouch: w < 1100 });
  await setup(ctx);
  const pg = await openAdmin(ctx);
  // Le nom le plus long, avec sa pastille « Heures clôturées jusqu'au … · Rouvrir ».
  let dlg = await openHours(pg, LONG[0]);
  check(await dlg.locator('[data-testid=closure-chip]').isVisible(), `D) ${name} : pastille de clôture affichée`);
  {
    const ms = (await dlg.locator('[data-testid=fiche-missing]').count()) ? (await dlg.locator('[data-testid=fiche-missing]').innerText()).replace(/\s+/g, ' ') : '';
    check(ms.includes(enAttente(1)), `D) ${name} : clôturé jusqu'au ${ddmm(day(-3))} → seul le ${ddmm(day(-2))} reste réclamé, plus le ${ddmm(day(-4))} (« ${ms} »)`);
  }
  let hs = await hScroll(pg);
  check(hs.length === 0, `D) ${name} : fiche (nom long + pastille) sans défilement horizontal ${JSON.stringify(hs)}`);
  if (w !== 1280) await shot(pg, `fiche-cloturee-${name}.png`);
  await dlg.locator('[data-testid=export-menu]').click();
  await pg.locator('[role=menu]').waitFor();
  hs = await hScroll(pg);
  check(hs.length === 0, `D) ${name} : menu « Exporter ▾ » dans l’écran ${JSON.stringify(hs)}`);
  if (w !== 1280) await shot(pg, `fiche-exporter-menu-${name}.png`);
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(500);
  // Lucas (pas clôturé) : bouton, calendrier, confirmation.
  dlg = await openHours(pg, 'Lucas Petit');
  if (w !== 1280) await shot(pg, `fiche-heures-${name}.png`);
  hs = await hScroll(pg);
  check(hs.length === 0, `D) ${name} : fiche « heures » sans défilement horizontal ${JSON.stringify(hs)}`);
  await dlg.locator('[data-testid=closure-open]').click();
  await pg.locator('[data-testid=closure-calendar]').waitFor();
  hs = await hScroll(pg);
  check(hs.length === 0, `D) ${name} : calendrier de clôture dans l’écran ${JSON.stringify(hs)}`);
  const iToday = await pg.locator('[data-testid=closure-calendar] button[name=day]').evaluateAll((els, d) => els.findIndex((e) => !/day-outside/.test(e.className) && Number(e.textContent.trim()) === d), Number(today.slice(8, 10)));
  await pg.locator('[data-testid=closure-calendar] button[name=day]').nth(iToday).click();
  await pg.locator('[data-testid=closure-confirm]').waitFor();
  await pg.waitForTimeout(300);
  hs = await hScroll(pg);
  check(hs.length === 0, `D) ${name} : confirmation sans défilement horizontal ${JSON.stringify(hs)}`);
  if (w !== 1280) await shot(pg, `fiche-cloture-confirmation-${name}.png`);
  await ctx.close();
}

await b.close(); srv.close();
console.log(`\n${ok} ok / ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
