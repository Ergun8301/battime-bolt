// Fidélité à la planche du designer, lot 2 « Heures et paie » du BUREAU (HP01 à HP31, HM01 à HM07), sur les VRAIES pages /admin en `?ui=2`.
//
// Lancer (après `npm run build`) :
//   node scripts/tests/fidelite-bureau-heures.mjs out docs/design-brief/integration/captures-bureau-heures 4401
// Variables : PLANCHE_DIR = dossier des captures de la planche (PL…/HP….png, voir scripts/tests/planche-bureau.mjs) pour fabriquer les images
// « planche | implémentation » ; ONLY=HP01,HP20 pour ne rejouer que certains écrans ; CHROME = chemin de Chromium.
// Base simulée : aucune vraie base, aucun e-mail, aucune fonction déployée. Horloge fixée au jeudi 15 octobre 2026 (la date de la planche, semaine S-42).
//
// Mesures par écran (1440 × 900, 1024 × 768, 390 × 844 et 360 × 640 pour les fenêtres) : cibles ≥ 40 px au pointeur et ≥ 44 px au toucher (largeur ET hauteur),
// texte ≥ 11 px, contraste ≥ 4,5:1 (3:1 en grand texte), contour de focus visible au clavier, aucun défilement horizontal de la page ni de la fenêtre,
// rôle dialog / alertdialog, Échap qui ferme, focus piégé. Plus : la v1 (sans le drapeau) n'ouvre AUCUN fichier de la v2.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}
const [,, OUT = 'out', SH = 'docs/design-brief/integration/captures-bureau-heures', PORT = '4401'] = process.argv;
const PLANCHE = process.env.PLANCHE_DIR || '';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (c) => !ONLY || ONLY.includes(c);
fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const requetesStatiques = [];
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  requetesStatiques.push(p);
  for (const c of [p, `${p}.html`, path.join(p, 'index.html')]) {
    const f = path.join(OUT, c);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); }
  }
  r.writeHead(404); r.end();
});
await new Promise((r) => srv.listen(Number(PORT), r));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ─── Horloge et base simulée (la semaine S-42 de la planche) ───
const NOW = new Date('2026-10-15T10:00:00+02:00');
const CO = 'c0000000-0000-0000-0000-0000000000aa';
const ADMIN = 'u-admin';
const U = (id, first_name, last_name, role = 'worker', email = null) => ({ id, company_id: CO, first_name, last_name, role, email: email || `${first_name.toLowerCase()}@exemple.fr`, is_active: true, created_at: '2026-01-01', phone: null });
const USERS = [U(ADMIN, 'Sam', 'Patron', 'admin', 'sam@exemple.fr'), U('u-alex', 'Alex', 'Test', 'worker', 'alex.test@exemple.fr'), U('u-bruno', 'Bruno', 'Exemple'), U('u-camille', 'Camille', 'Démo', 'lead'), U('u-dina', 'Dina', 'Fictive'), U('u-fanny', 'Fanny', 'Essai'), U('u-hugo', 'Hugo', 'Modèle')];
const WS = [
  { id: 'w-villa', company_id: CO, client_name: 'Villa Exemple', city: 'Lyon', is_active: true, address: null, latitude: null, longitude: null },
  { id: 'w-maison', company_id: CO, client_name: 'Maison Démo', city: 'Bron', is_active: true, address: null, latitude: null, longitude: null },
  { id: 'w-autre', company_id: CO, client_name: 'Autre', city: '', is_active: true, address: null, latitude: null, longitude: null },
];
const hms = (t) => (t.length === 5 ? `${t}:00` : t);
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const E = (id, user_id, work_date, worksite_id, start, end, o = {}) => {
  const w = WS.find((x) => x.id === worksite_id); const u = USERS.find((x) => x.id === user_id);
  const total = toMin(end) - toMin(start) - (o.break_minutes || 0);
  return { id, company_id: CO, user_id, work_date, worksite_id, planning_id: o.planning_id ?? `p-${id}`, start_time: hms(start), end_time: hms(end), break_minutes: 0, total_minutes: total,
    meal_allowance: false, status: 'submitted', locked: false, exported_at: null, observation: null, reception: null, gap_before: null, source: null, exit_forgotten: false,
    corrected_at: null, modified_at: null, modified_by: null, lead_edited_by: null, lead_edited_at: null, submitted_at: `${work_date}T17:00:00+02:00`,
    created_at: `${work_date}T07:00:00+02:00`, worksite: { id: w.id, client_name: w.client_name, city: w.city }, user: { first_name: u.first_name, last_name: u.last_name }, ...o };
};
const freshDb = () => ({
  users: USERS.map((x) => ({ ...x })),
  companies: [{ id: CO, name: 'Entreprise Test', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, travel_paid: true, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, accountant_email: 'compta@cabinet-exemple.fr', overtime_rate_1: null, overtime_rate_2: null }],
  worksites: WS.map((x) => ({ ...x })), planning: [],
  time_entries: [
    E('a1', 'u-alex', '2026-10-12', 'w-villa', '07:30', '11:45', { break_minutes: 30, meal_allowance: true }),
    E('a2', 'u-alex', '2026-10-12', 'w-maison', '13:00', '17:00', { observation: 'Volet salon posé', gap_before: 'route' }),
    E('a3', 'u-alex', '2026-10-13', 'w-villa', '07:30', '16:30', { break_minutes: 60, meal_allowance: true, modified_at: '2026-10-14T09:12:00+02:00', modified_by: ADMIN, exported_at: '2026-10-12T09:14:00+02:00', locked: true }),
    E('a4', 'u-alex', '2026-10-14', 'w-maison', '07:30', '16:00', { break_minutes: 30, meal_allowance: true, source: 'qr' }),
    E('a5', 'u-alex', '2026-10-15', 'w-autre', '08:00', '08:00', { status: 'draft', planning_id: null, submitted_at: null }),
    E('b1', 'u-bruno', '2026-10-12', 'w-villa', '08:00', '16:00'),
    E('c1', 'u-camille', '2026-10-12', 'w-maison', '07:00', '12:00'),
  ],
  time_entry_edits: [{ id: 'ed1', entry_id: 'a3', work_date: '2026-10-13', kind: 'correction', reason: 'Oubli du quart d’heure de rangement', edited_by: ADMIN, edited_at: '2026-10-14T09:12:00+02:00',
    old_values: { end_time: '16:00' }, new_values: { end_time: '16:30' }, correction_id: null, notified_at: '2026-10-14T09:12:05+02:00', notify_error: null }],
  user_payroll: [{ user_id: 'u-alex', company_id: CO, payroll_id: '00001', hourly_rate: 32, weekly_hours: null }],
  user_closures: [], active_sessions: [], month_closures: [], invitations: [], documents: [], certifications: [], push_subscriptions: [], kiosks: [], kiosk_settings: [],
  time_entry_corrections: [], time_entry_positions: [], clients: [],
  leave_requests: [
    { id: 'l1', company_id: CO, user_id: 'u-fanny', type: 'conge', start_date: '2026-11-02', end_date: '2026-11-06', note: 'Vacances scolaires', status: 'pending', created_at: '2026-10-10T09:00:00Z', decision_note: null },
    { id: 'l2', company_id: CO, user_id: 'u-hugo', type: 'conge', start_date: '2026-10-23', end_date: '2026-10-23', note: null, status: 'pending', created_at: '2026-10-11T09:00:00Z', decision_note: null },
    { id: 'l3', company_id: CO, user_id: 'u-bruno', type: 'maladie', start_date: '2026-10-05', end_date: '2026-10-07', note: null, status: 'approved', created_at: '2026-10-03T09:00:00Z', decision_note: null },
  ],
});
const D = {};
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
      if (op === 'not' && val === 'is.null') return cur != null;
      return true;
    });
  }
  return rows;
};
const sortRows = (rows, order) => {
  if (!order) return rows;
  const keys = order.split(',').map((o) => { const [k, dir] = o.split('.'); return { k, desc: dir === 'desc' }; });
  return [...rows].sort((a, b) => { for (const { k, desc } of keys) { const x = String(a[k] ?? ''); const y = String(b[k] ?? ''); if (x !== y) return (x < y ? -1 : 1) * (desc ? -1 : 1); } return 0; });
};
const nowS = Math.floor(NOW.getTime() / 1000) + 3600; const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const session = { access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ADMIN, role: 'authenticated', exp: nowS + 36000, aal: 'aal1' })}.sig`, refresh_token: 'r', expires_at: nowS + 36000, expires_in: 36000, token_type: 'bearer', user: { id: ADMIN, email: 'sam@exemple.fr', aud: 'authenticated', role: 'authenticated' } };
const ecritures = [];
const newCtx = async (viewport, { ui2 = true } = {}) => {
  const tactile = viewport.width < 1024;
  const ctx = await b.newContext({ viewport, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true, ...(tactile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.clock.setFixedTime(NOW);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const req = r.request(); const url = new URL(req.url()); const m = req.method();
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/')) { ecritures.push({ m: 'FN', t: url.pathname }); return r.fulfill({ json: {} }); }
    if (url.pathname === '/rest/v1/rpc/company_has_kiosk') return r.fulfill({ json: false });
    if (url.pathname.startsWith('/rest/v1/rpc/')) { if (m !== 'GET') ecritures.push({ m, t: url.pathname }); return r.fulfill({ json: [] }); }
    const t = url.pathname.replace('/rest/v1/', '');
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const reply = (rows, status = 200) => {
      if (single) return rows.length ? r.fulfill({ status, json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none', details: null, hint: null } });
      return r.fulfill({ status, json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}`, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' } });
    };
    if (m === 'GET' || m === 'HEAD') {
      let rows = sortRows(filterRows(D[t] || [], url.searchParams), url.searchParams.get('order'));
      const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
      if (off || lim) rows = rows.slice(off, lim ? off + Number(lim) : undefined);
      return reply(rows);
    }
    ecritures.push({ m, t });
    return reply([], m === 'POST' ? 201 : 200);
  });
  void ui2;
  return ctx;
};

// ─── Mesures ───
let ok = 0, ko = 0; const echecs = [];
const check = (c, m) => { if (c) { ok++; console.log('  ✅', m); } else { ko++; echecs.push(m); console.log('  ❌', m); } };
const MESURES = `(racine, tactile) => {
  const racineEl = typeof racine === 'string' ? document.querySelector(racine) : racine;
  const out = { petites: [], textes: [], contrastes: [], debordement: false };
  if (!racineEl) return { absent: true };
  const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
  const parse = (s) => { const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return { c: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 }; };
  const fond = (el) => { let cur = el; let acc = [255, 255, 255]; const pile = []; while (cur) { const p = parse(getComputedStyle(cur).backgroundColor); if (p && p.a > 0) { pile.push(p); if (p.a >= 1) break; } cur = cur.parentElement; } for (const p of pile.reverse()) acc = acc.map((v, i) => Math.round(p.c[i] * p.a + v * (1 - p.a))); return acc; };
  const min = tactile ? 44 : 40;
  const vu = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  racineEl.querySelectorAll('button, a[href], input:not([type=hidden]):not([type=checkbox]), select, textarea, [role=tab], [role=menuitem]').forEach((el) => {
    if (!vu(el)) return; const r = el.getBoundingClientRect();
    if (el.closest('[hidden], [aria-hidden=true]') && !el.matches('button')) return;
    if (r.height < min - .5 || r.width < min - .5) out.petites.push({ t: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) });
  });
  const walker = document.createTreeWalker(racineEl, NodeFilter.SHOW_TEXT);
  const vus = new Set();
  while (walker.nextNode()) {
    const n = walker.currentNode; const el = n.parentElement; const txt = (n.textContent || '').trim();
    if (!txt || !el || vus.has(el) || !vu(el) || el.closest('[hidden], .sr-only')) continue; vus.add(el);
    const s = getComputedStyle(el); const px = parseFloat(s.fontSize);
    if (px < 11 - .01) out.textes.push({ t: txt.slice(0, 30), px });
    const col = parse(s.color); if (!col) continue;
    const bg = fond(el); const a = col.a;
    const fg = col.c.map((v, i) => Math.round(v * a + bg[i] * (1 - a)));
    const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
    const grand = px >= 24 || (px >= 18.66 && parseInt(s.fontWeight, 10) >= 700);
    if (ratio < (grand ? 3 : 4.5) - .01 && !el.closest('[disabled], [aria-disabled=true]')) out.contrastes.push({ t: txt.slice(0, 30), ratio: Math.round(ratio * 100) / 100, px });
  }
  out.debordement = racineEl.scrollWidth > racineEl.clientWidth + 1 || document.documentElement.scrollWidth > window.innerWidth + 1;
  return out;
}`;
const mesurer = async (pg, sel, label, tactile) => {
  const m = await pg.evaluate(`(${MESURES})(${JSON.stringify(sel)}, ${tactile})`);
  if (m.absent) { check(false, `${label} : fenêtre introuvable (${sel})`); return; }
  check(m.petites.length === 0, `${label} : cibles ≥ ${tactile ? 44 : 40} px${m.petites.length ? ' — trop petites : ' + m.petites.slice(0, 4).map((x) => `${x.t} ${x.w}×${x.h}`).join(' ; ') : ''}`);
  check(m.textes.length === 0, `${label} : texte ≥ 11 px${m.textes.length ? ' — ' + m.textes.slice(0, 3).map((x) => `${x.t} ${x.px}px`).join(' ; ') : ''}`);
  check(m.contrastes.length === 0, `${label} : contrastes ≥ 4,5:1 (3:1 en grand texte)${m.contrastes.length ? ' — ' + m.contrastes.slice(0, 3).map((x) => `${x.t} ${x.ratio}`).join(' ; ') : ''}`);
  check(!m.debordement, `${label} : aucun défilement horizontal`);
};
const focusVisible = async (pg, label) => {
  let bon = false;
  for (let i = 0; i < 6 && !bon; i++) {
    await pg.keyboard.press('Tab');
    bon = await pg.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return false; const s = getComputedStyle(e); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2 && e.matches(':focus-visible'); });
  }
  check(bon, `${label} : contour de focus (2 px) visible au clavier`);
};

// ─── Composition « planche | implémentation » ───
const compo = async (code, tag, implPng) => {
  const planchePng = PLANCHE ? path.join(PLANCHE, `${code}.png`) : '';
  if (!planchePng || !fs.existsSync(planchePng)) { fs.writeFileSync(path.join(SH, `${code}-${tag}-impl.jpg`), await toJpg(implPng)); return; }
  const a = fs.readFileSync(planchePng).toString('base64'); const i = implPng.toString('base64');
  const pg = await b.newPage({ viewport: { width: 1500, height: 600 } });
  await pg.setContent(`<body style="margin:0;background:#E9E2D4;font:600 13px monospace;color:#15120F"><div style="display:flex;gap:12px;padding:10px;align-items:flex-start"><div style="flex:1"><div style="padding:0 0 6px">PLANCHE ${code}</div><img style="width:100%;display:block" src="data:image/png;base64,${a}"></div><div style="flex:1"><div style="padding:0 0 6px">IMPLÉMENTATION ?ui=2 · ${tag}</div><img style="width:100%;display:block" src="data:image/png;base64,${i}"></div></div></body>`);
  await pg.waitForLoadState('load');
  const h = await pg.evaluate(() => document.body.scrollHeight);
  await pg.setViewportSize({ width: 1500, height: h });
  fs.writeFileSync(path.join(SH, `${code}-${tag}.jpg`), await pg.screenshot({ type: 'jpeg', quality: 62 }));
  await pg.close();
};
const toJpg = async (png) => {
  const pg = await b.newPage({ viewport: { width: 1000, height: 700 } });
  await pg.setContent(`<body style="margin:0"><img id=i style="display:block;max-width:100%" src="data:image/png;base64,${png.toString('base64')}"></body>`);
  await pg.waitForLoadState('load'); const s = await pg.locator('#i').boundingBox();
  await pg.setViewportSize({ width: Math.ceil(s.width), height: Math.ceil(s.height) });
  const j = await pg.screenshot({ type: 'jpeg', quality: 62 }); await pg.close(); return j;
};

// ─── Gestes ───
const VIEWS = { pc: { width: 1440, height: 900 }, tablette: { width: 1024, height: 768 }, tel: { width: 390, height: 844 }, petit: { width: 360, height: 640 } };
const ouvrirAdmin = async (ctx, url = '/admin?ui=2') => {
  const pg = await ctx.newPage(); pg.on('pageerror', (e) => console.log('   [erreur page]', e.message));
  await pg.goto(`http://localhost:${PORT}${url}`);
  await pg.locator('button:visible', { hasText: 'Alex Test' }).first().waitFor({ timeout: 25000 });
  await pg.waitForTimeout(900);
  // Mise au point seulement : CSS_DEV=chemin superpose une feuille locale au CSS construit (jamais utilisé pour les preuves).
  if (process.env.CSS_DEV) await pg.addStyleTag({ content: fs.readFileSync(process.env.CSS_DEV, 'utf8') });
  return pg;
};
const ouvrirFiche = async (pg) => {
  await pg.locator('button:visible', { hasText: 'Alex Test' }).first().click();
  await pg.getByRole('button', { name: /Feuille d.heures/ }).click();
  await pg.locator('[data-testid=worker-fiche]').waitFor({ timeout: 8000 });
  await pg.locator('[data-testid=fiche-ligne]:visible, [data-testid=fiche-cartes] button:visible').first().waitFor({ timeout: 8000 });
  await pg.waitForTimeout(500);
};
const cliquerCette = async (pg, scope) => { await scope.getByRole('button', { name: /Cette semaine|Semaine/ }).first().click(); await pg.waitForTimeout(500); };
const ouvrirExport = async (pg, tel) => {
  if (tel) { await pg.locator('.bt-pl-m-ibtn[aria-label="Menu"]').click(); await pg.locator('[data-testid=mm-export]').click(); }
  else await pg.locator('[data-testid=bar-export]:visible').first().click();
  await pg.locator('[data-testid=team-export]').waitFor({ timeout: 8000 }); await pg.waitForTimeout(400);
};
const shot = async (pg, code, tag) => { await pg.waitForTimeout(450); const png = await pg.screenshot(); await compo(code, tag, png); };

// ─── Scénarios ───
const ECRANS = [
  { code: 'HP01', vues: ['pc', 'tablette', 'tel'], run: async (pg, tel) => { await ouvrirFiche(pg); await cliquerCette(pg, pg.locator('[data-testid=worker-fiche]')); return { sel: '[data-testid=worker-fiche]', planche: tel ? 'HM01' : 'HP01' }; } },
  { code: 'HP03', vues: ['pc', 'tel'], run: async (pg, tel) => { await ouvrirFiche(pg); await cliquerCette(pg, pg.locator('[data-testid=worker-fiche]')); await pg.locator(tel ? '[data-testid=fiche-cartes] button' : '[data-testid=fiche-ligne]').nth(2).click(); await pg.locator('[data-testid=fiche-ligne-detail]').waitFor(); return { sel: '[data-testid=fiche-ligne-detail]' }; } },
  { code: 'HP04', vues: ['pc', 'tel', 'petit'], run: async (pg, tel) => { await ouvrirFiche(pg); await cliquerCette(pg, pg.locator('[data-testid=worker-fiche]')); await pg.locator(tel ? '[data-testid=fiche-cartes] button' : '[data-testid=fiche-ligne]').nth(2).click(); await pg.locator('[data-testid=correct-open]').click(); await pg.locator('[data-testid=correct-panel]').waitFor(); await pg.locator('[data-testid=correct-reason]').fill('Oubli du quart d’heure de rangement'); return { sel: '[data-testid=correct-panel]', planche: tel ? 'HM02' : 'HP06' }; } },
  { code: 'HP05', vues: ['pc'], run: async (pg, tel) => { await ouvrirFiche(pg); await cliquerCette(pg, pg.locator('[data-testid=worker-fiche]')); await pg.locator(tel ? '[data-testid=fiche-cartes] button' : '[data-testid=fiche-ligne]').nth(2).click(); await pg.locator('[data-testid=correct-open]').click(); await pg.locator('[data-testid=correct-panel]').waitFor(); await pg.locator('[data-testid=correct-reason]').fill('ok'); return { sel: '[data-testid=correct-panel]' }; } },
  { code: 'HP08', vues: ['pc', 'tel'], run: async (pg, tel) => { await ouvrirFiche(pg); await cliquerCette(pg, pg.locator('[data-testid=worker-fiche]')); await pg.locator(tel ? '[data-testid=fiche-cartes] button' : '[data-testid=fiche-ligne]').nth(2).click(); await pg.locator('[data-testid=correct-return]').click(); await pg.locator('[data-testid=renvoi-fenetre]').waitFor(); await pg.locator('[data-testid=renvoi-motif]').fill('Il manque l’après-midi chez Maison Démo.'); return { sel: '[data-testid=renvoi-fenetre]', planche: tel ? 'HM03' : 'HP08' }; } },
  { code: 'HP12', vues: ['pc', 'tel'], run: async (pg, tel) => { if (tel) { await pg.locator('.bt-pl-m-ibtn[aria-label="Menu"]').click(); await pg.getByRole('button', { name: /congé/i }).first().click(); } else { await pg.getByRole('button', { name: /^Salariés/ }).first().click(); await pg.locator('[data-guide="bureau-salaries.conges"]').click(); } await pg.locator('[data-testid=leave-admin]').waitFor(); await pg.waitForTimeout(500); return { sel: '[data-testid=leave-admin]', planche: tel ? 'HM04' : 'HP12' }; } },
  { code: 'HP13', vues: ['pc'], run: async (pg, tel) => { await pg.getByRole('button', { name: /^Salariés/ }).first().click(); await pg.locator('[data-guide="bureau-salaries.conges"]').click(); await pg.locator('[data-testid=leave-admin]').waitFor(); await pg.locator('button[title=Refuser]').first().click(); await pg.locator('[data-testid=leave-refuse]').waitFor(); await pg.waitForTimeout(400); return { sel: '[data-testid=leave-refuse]' }; } },
  { code: 'HP16', vues: ['pc'], prep: (d) => { d.leave_requests = []; }, run: async (pg, tel) => { await pg.getByRole('button', { name: /^Salariés/ }).first().click(); await pg.locator('[data-guide="bureau-salaries.conges"]').click(); await pg.locator('[data-testid=leave-admin]').waitFor(); await pg.waitForTimeout(500); return { sel: '[data-testid=leave-admin]' }; } },
  { code: 'HP19', vues: ['pc'], prep: (d) => { d.companies[0].accountant_email = null; }, run: async (pg, tel) => { await ouvrirExport(pg, tel); await cliquerCette(pg, pg.locator('[data-testid=team-export]')); return { sel: '[data-testid=team-export]' }; } },
  { code: 'HP29', vues: ['pc'], prep: (d) => { d.month_closures = [{ month: '2026-09-01', company_id: CO, closed_by: ADMIN, closed_at: '2026-10-15T09:00:00+02:00' }]; }, run: async (pg, tel) => { await ouvrirExport(pg, tel); await cliquerCette(pg, pg.locator('[data-testid=team-export]')); return { sel: '[data-testid=team-export]' }; } },
  { code: 'HP17', vues: ['pc', 'tablette'], run: async (pg, tel) => { await ouvrirExport(pg, tel); return { sel: '[data-testid=team-export]' }; } },
  { code: 'HP18', vues: ['pc', 'tel'], run: async (pg, tel) => { await ouvrirExport(pg, tel); await cliquerCette(pg, pg.locator('[data-testid=team-export]')); return { sel: '[data-testid=team-export]', planche: tel ? 'HM05' : 'HP18' }; } },
  { code: 'HP20', vues: ['pc', 'tel'], run: async (pg, tel) => { await ouvrirExport(pg, tel); await cliquerCette(pg, pg.locator('[data-testid=team-export]')); await pg.locator('[data-testid=team-export-menu-excel]').click(); await pg.locator('[data-testid=export-verrou]').waitFor({ timeout: 8000 }); await pg.waitForTimeout(500); return { sel: '[data-testid=export-verrou]', planche: tel ? 'HM06' : 'HP20' }; } },
  { code: 'HP28', vues: ['pc', 'tel'], run: async (pg, tel) => { await ouvrirExport(pg, tel); await pg.locator('[data-testid^=cloturer-]').first().click(); await pg.locator('[data-testid=closure-confirm]').waitFor({ timeout: 8000 }); await pg.waitForTimeout(400); return { sel: '[data-testid=closure-confirm]', planche: tel ? 'HM07' : 'HP28' }; } },
  { code: 'HP31', vues: ['pc'], run: async (pg, tel) => { await ouvrirExport(pg, tel); await pg.locator('[data-testid=export-one-worker]').click(); await pg.locator('[data-testid=export-worker]').waitFor(); return { sel: '[data-testid=export-worker]' }; } },
];

for (const ec of ECRANS) {
  if (!want(ec.code)) continue;
  console.log(`\n═══ ${ec.code}`);
  for (const v of ec.vues) {
    const vp = VIEWS[v]; const tel = vp.width < 1024;
    D.users = undefined; Object.assign(D, freshDb()); if (ec.prep) ec.prep(D);
    const ctx = await newCtx(vp); const pg = await ouvrirAdmin(ctx); ecritures.length = 0;
    try {
      const r = await ec.run(pg, tel);
      if (process.env.DEBUG_DOM) console.log(await pg.evaluate(() => { const t = document.querySelector('.dz-hb-tableau'); const c = document.querySelector('.dz-hb-corps'); const r = (e) => e && JSON.stringify(e.getBoundingClientRect()); return `tableau ${r(t)} sh=${t?.scrollHeight} corps ${r(c)} sh=${c?.scrollHeight} ch=${c?.clientHeight}`; }));
      const png = await (async () => { await pg.waitForTimeout(450); return pg.screenshot(); })();
      const codePlanche = r.planche || ec.code;
      if (v === 'pc' || v === 'tel') await compo(codePlanche, `${vp.width}x${vp.height}`, png);
      else fs.writeFileSync(path.join(SH, `${ec.code}-${vp.width}x${vp.height}-impl.jpg`), await toJpg(png));
      const role = await pg.evaluate((s) => document.querySelector(s)?.getAttribute('role'), r.sel);
      const attendu = ec.code === 'HP20' || ec.code === 'HP28' ? 'alertdialog' : 'dialog';
      check(role === attendu, `${ec.code} ${v} : rôle ${attendu} (lu : ${role})`);
      await mesurer(pg, r.sel, `${ec.code} ${v} ${vp.width}×${vp.height}`, tel);
      if (v === 'pc') await focusVisible(pg, `${ec.code} ${v}`);
      check(ecritures.length === 0, `${ec.code} ${v} : rien n'est écrit en ouvrant l'écran (${ecritures.length} écriture)`);
      await pg.keyboard.press('Escape'); await pg.waitForTimeout(500);
      check(await pg.locator(r.sel).count() === 0 || ['HP03', 'HP04', 'HP05', 'HP08', 'HP13'].includes(ec.code), `${ec.code} ${v} : Échap ferme la fenêtre du dessus`);
    } catch (e) { check(false, `${ec.code} ${v} : ${String(e.message).split('\n')[0]}`); }
    await ctx.close();
  }
}

// ─── Sans le drapeau : la v1 n'ouvre aucun fichier de la v2 ───
if (want('V1')) {
  console.log('\n═══ V1 sans drapeau');
  Object.assign(D, freshDb());
  const ctx = await newCtx(VIEWS.pc);
  const pg = await ctx.newPage(); const vus = [];
  pg.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/_next/static/')) vus.push(u.pathname); });
  await pg.goto(`http://localhost:${PORT}/admin?ui=1`);
  await pg.locator('button:visible', { hasText: 'Alex Test' }).first().waitFor({ timeout: 25000 });
  await pg.waitForTimeout(800);
  await pg.locator('[data-testid=bar-export]:visible').first().click(); await pg.locator('[data-testid=team-export]').waitFor();
  await pg.waitForTimeout(500);
  const v2css = await pg.evaluate(() => [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => r.cssText.includes('dz-hb-')); } catch { return false; } }));
  check(!v2css, 'sans drapeau : aucune règle CSS `dz-hb-` n\'est chargée');
  const dialogV1 = await pg.locator('[data-testid=team-export-menu]').count();
  check(dialogV1 === 1, 'sans drapeau : « Exporter l\'équipe » garde son menu « Exporter ▾ » (interface actuelle)');
  const chunksV2 = vus.filter((p) => p.endsWith('.js'));
  const lourds = [];
  for (const p of chunksV2) { try { const txt = fs.readFileSync(path.join(OUT, p), 'utf8'); if (txt.includes('dz-hb-fenetre') || txt.includes('dz-hb-panneau')) lourds.push(p); } catch { /* absent */ } }
  check(lourds.length === 0, `sans drapeau : aucun chunk de la v2 n'est téléchargé (${lourds.join(',') || 'aucun'})`);
  await ctx.close();
}

console.log(`\n${ok} ✅ / ${ko} ❌`);
if (echecs.length) console.log('Échecs :\n- ' + echecs.join('\n- '));
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
