// Lancer : node scripts/tests/impression-cadre.mjs out [dossier des PDF et de la capture écran, défaut : temporaire] [port] (après npm run build).
// Captures « avant » : AVANT=1 node scripts/tests/impression-cadre.mjs <build d'avant> <dossier> [port]
// (PDF et captures seulement, aucune vérification). playwright-core doit être résoluble.
// Les PDF écrits dans le dossier (impression-*.pdf) se rastérisent à part, hors du dépôt.
//
// Mise en page de l'impression du planning (A4 paysage) — feuille réelle de la page /admin
// (base simulée, horloge figée au mercredi 21 octobre 2026, 10:00 à Paris ; aucun appel réseau
// réel, rien n'est écrit) :
//   K1 @page : margin:0 (Chrome n'a plus de marge où écrire sa date, son titre, l'adresse et « 1/1 »),
//      A4 paysage ; les 10 mm de marge sont ceux de la FEUILLE (K3, K6) ;
//   K2 cadre : trait extérieur gauche / droite / haut / bas, plus épais que les traits internes,
//      noir franc, sur la semaine, le jour (avec signature) et le mois ;
//   K3 centrage : la feuille fait 277 mm (10 mm de chaque côté), le tableau occupe toute sa largeur, écarts
//      gauche / droite égaux à 1 mm près, aucun débordement — peu de salariés, 9 salariés (nom très long),
//      22 salariés (plusieurs pages) ; lignes équilibrées (aucune hauteur imposée au tableau) ;
//   K4 pages : en-tête répété, aucune ligne coupée, un salarié aux noms très longs en entier ;
//   K5 couleurs, textures, POLICES et tailles IDENTIQUES à l'écran, carte par carte (fond, motif de rayures
//      des congés, bordures pointillées, barre du chantier, pastilles, police, taille, interligne, marges,
//      rayons) et print-color-adjust: exact partout ;
//   K6 PDF réel : A4 paysage, nombre de pages, marges (10 mm sur chaque page) et centrage mesurés sur le
//      dessin du PDF.
import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import zlib from 'node:zlib'; import { chromium } from 'playwright-core';
const [,, OUT, SH = fs.mkdtempSync(path.join(os.tmpdir(), 'impression-cadre-')), PORT = '5322'] = process.argv; fs.mkdirSync(SH, { recursive: true });
const AVANT = process.env.AVANT === '1';
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT), r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ─── Horloge figée : mercredi 21 octobre 2026, 10:00 (Paris) — semaine 43 ────────
const NOW = new Date('2026-10-21T10:00:00+02:00');
const D_ = (d) => `2026-10-${String(d).padStart(2, '0')}`;
const WEEK = [19, 20, 21, 22, 23, 24, 25];

// ─── Base simulée : 3, 9 (dont un nom très long) ou 22 salariés ───────────────────
const CO = 'c0000000-0000-0000-0000-000000000001';
const ws = (id, client_name, city, product_type = null) => ({ id, company_id: CO, client_name, city, product_type, is_active: true });
const W1 = ws('w1', 'Villa Exemple', 'Lyon', 'Fenêtres'), W2 = ws('w2', 'Résidence Test', 'Villeurbanne', 'Portail'), W3 = ws('w3', 'Maison Démo', 'Bron', 'Volets'), W4 = ws('w4', 'Atelier Fictif', 'Vénissieux');
const WS = { w1: W1, w2: W2, w3: W3, w4: W4 };
const u = (id, first_name, last_name, role = 'worker') => ({ id, company_id: CO, first_name, last_name, role, email: `${id}@exemple.fr`, is_active: true, created_at: '2026-01-01' });
const LONG = 'Maximilien-Alexandre De La Fontaine-Beaumarchais';
const W9 = [u('u-alex', 'Alex', 'Test'), u('u-bruno', 'Bruno', 'Essai'), u('u-chloe', 'Chloé', 'Exemple'), u('u-dina', 'Dina', 'Démo'), u('u-eli', 'Eli', 'Fictif'),
  u('u-fanny', 'Fanny', 'Modèle'), u('u-gabin', 'Gabin', 'Témoin'), u('u-hugo', 'Hugo', 'Proto'), u('u-max', 'Maximilien-Alexandre', 'De La Fontaine-Beaumarchais')];
const FN = ['Inès', 'Jules', 'Karim', 'Léa', 'Marc', 'Nina', 'Oscar', 'Paula', 'Quentin', 'Rose', 'Sami', 'Tara', 'Yann'];
const W22 = [...W9, ...FN.map((f, i) => u(`u-n${i}`, f, 'Équipe'))];
const WORKERS = { few: [W9[0], W9[1], W9[4]], std: W9, many: W22 };

let seq = 0;
const slotAt = (id, user_id, date, w, start, end, extra = {}) => ({ id, company_id: CO, user_id, worksite_id: w?.id ?? null, work_date: date, absence_type: null, estimated_start: start, estimated_end: end,
  notes: null, position: null, added_by_worker: false, created_by: 'u-admin', created_at: new Date(Date.UTC(2026, 9, 1, 6, 0, seq++)).toISOString(), ...extra });
// Tous les types de cases : matin, après-midi, soir, journée entière / sans horaire (blanc), congé, maladie (« Absent »).
const SLOTS = [
  slotAt('p-a1', 'u-alex', D_(19), W1, '08:00:00', '12:00:00'), slotAt('p-a2', 'u-alex', D_(19), W2, '13:30:00', '17:00:00'), slotAt('p-a3', 'u-alex', D_(20), W3, '13:00:00', '17:00:00'),
  slotAt('p-a4', 'u-alex', D_(22), W2, '14:00:00', null), slotAt('p-a5', 'u-alex', D_(23), W4, '18:00:00', '21:00:00'),
  slotAt('p-b1', 'u-bruno', D_(19), W3, '18:00:00', '21:00:00'), slotAt('p-b2', 'u-bruno', D_(20), W1, '07:00:00', '13:00:00'), slotAt('p-b3', 'u-bruno', D_(21), W2, null, null),
  slotAt('p-b4', 'u-bruno', D_(24), W3, '18:00:00', '21:00:00'),
  slotAt('p-c1', 'u-chloe', D_(19), W2, '11:00:00', '13:00:00'), slotAt('p-c2', 'u-chloe', D_(20), W3, '11:00:00', '15:00:00'), slotAt('p-c3', 'u-chloe', D_(25), W2, null, null),
  slotAt('p-d1', 'u-dina', D_(19), W3, '08:00:00', '17:00:00'), slotAt('p-d2', 'u-dina', D_(21), W1, '16:00:00', '22:00:00'),
  slotAt('p-d4', 'u-dina', D_(22), null, null, null, { absence_type: 'maladie' }), slotAt('p-d5', 'u-dina', D_(23), null, null, null, { absence_type: 'maladie' }),
  slotAt('p-e1', 'u-eli', D_(19), W2, null, null), slotAt('p-e3', 'u-eli', D_(21), W3, '18:00:00', '20:00:00'),
  ...[23, 24, 25].map((d) => slotAt(`p-ec${d}`, 'u-eli', D_(d), null, null, null, { absence_type: 'conge' })),
  slotAt('p-f1', 'u-fanny', D_(19), W4, '09:00:00', '11:00:00'), slotAt('p-f2', 'u-fanny', D_(20), W1, '13:30:00', '17:00:00'),
  ...[19, 20, 21, 22, 23].map((d) => slotAt(`p-g${d}`, 'u-gabin', D_(d), W4, '08:00:00', '12:00:00')),
  ...[19, 20, 21, 22, 23].map((d) => slotAt(`p-h${d}`, 'u-hugo', D_(d), W2, '13:30:00', '17:00:00')),
  ...[19, 20, 21].map((d) => slotAt(`p-m${d}`, 'u-max', D_(d), W4, '08:00:00', '17:00:00')),
  // Les 13 salariés de « many » : une ou deux interventions par jour ouvré, un congé.
  ...FN.flatMap((_, i) => WEEK.slice(0, 5).flatMap((d) => (i + d) % 4 === 0 ? [] : [
    slotAt(`p-n${i}-${d}`, `u-n${i}`, D_(d), [W1, W2, W3, W4][(i + d) % 4], (i + d) % 3 === 0 ? '08:00:00' : (i + d) % 3 === 1 ? '13:30:00' : '18:00:00', (i + d) % 3 === 0 ? '12:00:00' : (i + d) % 3 === 1 ? '17:00:00' : '21:00:00')])),
  ...[22, 23].map((d) => slotAt(`p-nc${d}`, 'u-n3', D_(d), null, null, null, { absence_type: 'conge' })),
];
const entry = (id, user_id, date, w, status, start, end, minutes, extra = {}) => ({ id, company_id: CO, user_id, work_date: date, worksite_id: w?.id ?? null, planning_id: null, status, start_time: start, end_time: end, total_minutes: minutes, break_minutes: 0, reception: null, reserve_resolved_at: null, reserve_fixed_at: null, observation: null, locked: false, submitted_at: status === 'draft' ? null : `${date}T18:00:00Z`, ...extra });
const ENTRIES = [
  entry('e-a1', 'u-alex', D_(19), W1, 'submitted', '08:00:00', '12:00:00', 240, { planning_id: 'p-a1' }),   // envoyé → noir
  entry('e-b2', 'u-bruno', D_(20), W1, 'validated', '07:00:00', '13:00:00', 360, { planning_id: 'p-b2' }),  // validé → noir
  entry('e-e3', 'u-eli', D_(21), W3, 'draft', '18:00:00', '20:00:00', 120, { planning_id: 'p-e3' }),        // brouillon 18–20 → soir
  entry('e-e1', 'u-eli', D_(19), null, 'submitted', '15:00:00', '16:00:00', 60),                            // hors planning, sans chantier
];
const COMPANY = { id: CO, name: 'Entreprise Test', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, travel_paid: false, accountant_email: null };
const fresh = (mode) => {
  const users = WORKERS[mode], ids = new Set(users.map((x) => x.id));
  return {
    users: [u('u-admin', 'Sam', 'Test', 'admin'), ...users], companies: [{ ...COMPANY }], worksites: Object.values(WS),
    planning: SLOTS.filter((s) => ids.has(s.user_id)).map((s) => ({ ...s })), time_entries: ENTRIES.filter((e) => ids.has(e.user_id)).map((e) => ({ ...e })),
    active_sessions: [], documents: [], leave_requests: [], invitations: [], month_closures: [], user_closures: [], certifications: [], push_subscriptions: [], kiosks: [], kiosk_settings: [], worksite_expenses: [], user_payroll: [],
  };
};
// ─── Session simulée + routes Supabase ───────────────────────────────────────────
const now = Math.floor(NOW.getTime() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-admin', role: 'authenticated', exp: now + 864000, aal: 'aal1' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', expires_at: now + 864000, expires_in: 864000, token_type: 'bearer', user: { id: 'u-admin', email: 'sam@exemple.fr', aud: 'authenticated', role: 'authenticated' } };
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
/** Toute requête autre qu'une lecture (imprimer n'écrit rien, ne verrouille rien). */
const nonGet = [];
/** Toutes les lectures : table + paramètres (I3, I9, I13). */
const gets = [];
/** Panne ou lenteur simulée : { match(table, params), delay?, status? }. */
let fault = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const setup = async (ctx, mode) => {
  const db = fresh(mode);
  await ctx.clock.setFixedTime(NOW);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; window.__title = document.title; }; });
  await ctx.route((url) => url.hostname !== 'localhost' && !url.hostname.endsWith('.supabase.co'), (r) => r.abort());
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url()); const m = r.request().method();
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (m !== 'GET' && m !== 'HEAD') { nonGet.push(`${m} ${url.pathname}`); return r.fulfill({ status: 201, json: m === 'POST' && url.pathname.startsWith('/rest/v1/rpc/') ? [] : {} }); }
    const t = url.pathname.replace('/rest/v1/', '');
    gets.push({ t, q: url.searchParams.toString(), p: new URLSearchParams(url.searchParams) });
    const f = fault && fault.match(t, url.searchParams) ? fault : null;
    if (f?.delay) await sleep(f.delay);
    if (f?.status) return r.fulfill({ status: f.status, json: { code: 'XX000', message: 'panne simulée', details: null, hint: null } }).catch(() => {});
    const sel = url.searchParams.get('select') || '*';
    let all = filterRows(db[t] || [], url.searchParams).map((x) => {
      if (t !== 'planning') return x;
      return { ...x, ...(sel.includes('worksite:worksites') ? { worksite: x.worksite_id ? WS[x.worksite_id] : null } : {}), ...(sel.includes('user:users') ? { user: db.users.find((y) => y.id === x.user_id) || null } : {}) };
    });
    if ((r.request().headers()['accept'] || '').includes('vnd.pgrst.object')) return all.length ? r.fulfill({ json: all[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
    const total = all.length; all = all.slice(off, lim ? off + Number(lim) : undefined);
    return r.fulfill({ json: all, headers: { 'content-range': `${off}-${Math.max(off, off + all.length - 1)}/${total}`, 'access-control-expose-headers': 'content-range', 'access-control-allow-origin': '*' } }).catch(() => {});
  });
};

let ok = 0, ko = 0; const check = (c, m) => { if (AVANT) return; if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const newPage = async (mode, w = 1440, h = 900) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await setup(ctx, mode); const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('   [erreur page]', e.message));
  await p.goto(`http://localhost:${PORT}/admin`);
  await p.waitForSelector('.bt-pl-gridwrap .bt-pl-name', { timeout: 25000 }); await p.waitForTimeout(1500);
  return { ctx, p };
};
const pdfInfo = (buf) => {
  const s = buf.toString('latin1');
  return { pages: (s.match(/\/Type\s*\/Page(?!s)/g) || []).length, boxes: [...s.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [Number(m[3]), Number(m[4])]) };
};
const a4Land = (info) => info.boxes.length > 0 && info.boxes.every(([w, h]) => Math.abs(w - 841.89) <= 1.5 && Math.abs(h - 595.28) <= 1.5);
// Sans « Graphiques d'arrière-plan » (printBackground: false) : seules les règles print-color-adjust gardent les couleurs.
const PDF_OPTS = { format: 'A4', landscape: true, printBackground: false, preferCSSPageSize: true };
const MM = 96 / 25.4;

// ─── Imprimer depuis le menu (la feuille reste montée jusqu'à « afterprint ») ─────
const printed = (p) => p.evaluate(() => window.__printed || 0);
const printWith = async (p, { kind = 'week', moves = 0, tomorrow = false, signature = false } = {}) => {
  const n = await printed(p);
  await p.click('[data-testid=bar-print]'); await p.waitForSelector('[data-testid=print-menu]');
  await p.click(`[data-testid=print-scope-${kind}]`);
  for (let i = 0; i < Math.abs(moves); i++) await p.click(`[data-testid=print-${moves < 0 ? 'prev' : 'next'}]`);
  if (tomorrow) await p.click('[data-testid=print-tomorrow]');
  if (await p.isChecked('[data-testid=print-sig]') !== signature) await p.click('[data-testid=print-sig]');
  await p.click('[data-testid=print-go]');
  await p.waitForFunction((n) => (window.__printed || 0) === n + 1, n, { timeout: 15000 });
  await p.waitForTimeout(150);
};
const closePrint = async (p) => { await p.evaluate(() => window.dispatchEvent(new Event('afterprint'))); await p.waitForTimeout(150); };

/** Les marges de l'@page de la feuille montée (mm), lues dans la feuille de style : null si absentes. */
const pageMargins = (p) => p.evaluate(() => {
  const find = (rules) => { for (const r of rules) { if (r.constructor.name === 'CSSPageRule') return r; if (r.cssRules) { const f = find(r.cssRules); if (f) return f; } } return null; };
  for (const ss of document.styleSheets) {
    let rules; try { rules = ss.cssRules; } catch { continue; }
    const r = find(rules); if (!r) continue;
    const g = (k) => r.style.getPropertyValue(k).trim();
    const sh = g('margin').split(/\s+/).filter(Boolean);
    const [t, rr = t, bb = t, l = rr] = sh;
    const pick = (side, fb) => g(`margin-${side}`) || fb;
    return { top: pick('top', t), right: pick('right', rr), bottom: pick('bottom', bb), left: pick('left', l), size: g('size') };
  }
  return null;
});
const mmOf = (v) => (typeof v === 'string' && /^-?[\d.]+(mm|px)?$/.test(v) ? (v.endsWith('px') ? parseFloat(v) / MM : parseFloat(v)) : NaN);
/** Rendu « papier » à l'écran : la zone utile d'un A4 paysage (297 × 210 mm moins les marges de l'@page : 0 — les 10 mm sont ceux de la feuille). */
const paper = async (p, fn) => {
  const m = await pageMargins(p); const vp = p.viewportSize();
  const ml = mmOf(m?.left), mr = mmOf(m?.right), mt = mmOf(m?.top), mb = mmOf(m?.bottom);
  const w = Math.round((297 - (ml || 0) - (mr || 0)) * MM), h = Math.round((210 - (mt || 0) - (mb || 0)) * MM);
  await p.setViewportSize({ width: w, height: h }); await p.emulateMedia({ media: 'print' }); await p.waitForTimeout(300);
  try { return await fn({ w, h, margins: m }); } finally { await p.emulateMedia({ media: null }); await p.setViewportSize(vp); await p.waitForTimeout(200); }
};

// ─── Relevés du DOM (rendu « papier », dans la zone utile de l'@page) ─────────────
/** Cadre, largeur et position du tableau de la feuille montée. */
const measureSheet = (long) => {
  const sheet = document.querySelector('.bt-print'), table = sheet.querySelector('table');
  const cs = (e) => getComputedStyle(e);
  const edge = (cell, side) => ({ w: parseFloat(cs(cell)[`border${side}Width`]) || 0, s: cs(cell)[`border${side}Style`], c: cs(cell)[`border${side}Color`] });
  const head = [...table.rows].filter((r) => r.parentElement.tagName === 'THEAD' && !r.classList.contains('bt-print-title'));
  const body = [...table.tBodies].flatMap((t) => [...t.rows]);
  const all = [...head, ...body], last = body[body.length - 1];
  const left = all.map((r) => edge(r.cells[0], 'Left')), right = all.map((r) => edge(r.cells[r.cells.length - 1], 'Right'));
  const top = [...head[0].cells].map((c) => edge(c, 'Top')), bottom = [...last.cells].map((c) => edge(c, 'Bottom'));
  // Traits internes : entre deux lignes (bas des cases) et entre deux colonnes (droite des cases).
  const inner = [...body.slice(0, -1).flatMap((r) => [...r.cells].map((c) => edge(c, 'Bottom'))), ...body.flatMap((r) => [...r.cells].slice(0, -1).map((c) => edge(c, 'Right')))];
  const solid = (e) => e.s === 'solid' && /^rgb\((\d+), (\d+), (\d+)\)$/.test(e.c) && e.c.match(/\d+/g).map(Number).every((v) => v <= 60);
  const side = (l) => ({ min: Math.min(...l.map((e) => e.w)), ok: l.every(solid) });
  const tb = table.getBoundingClientRect(), tf = table.tFoot;
  return {
    vw: document.documentElement.clientWidth, vh: innerHeight, left: tb.left, right: tb.right, width: tb.width, height: tb.height,
    over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    l: side(left), r: side(right), t: side(top), b: side(bottom), innerMax: Math.max(0, ...inner.map((e) => e.w)),
    thead: cs(table.tHead).display, avoid: body.every((r) => cs(r).breakInside === 'avoid'),
    tfoot: tf ? { display: cs(tf).display, w: parseFloat(cs(tf.rows[0].cells[0]).borderTopWidth) || 0 } : null,
    rows: body.length, rowH: body.map((r) => r.getBoundingClientRect().height),
    // Le nom très long s'imprime en entier (il passe à la ligne, jamais « … » ni coupé).
    longName: (() => { const e = [...sheet.querySelectorAll('.bt-pl-name, td.n')].find((x) => x.textContent.trim() === long); return e ? { cut: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1, ellipsis: cs(e).textOverflow === 'ellipsis' } : null; })(),
  };
};
/** Styles calculés des cases, par salarié : mêmes sélecteurs à l'écran et sur papier (K5). */
const STYLE_SEL = ['.bt-pl-bub', '.bt-pl-bub-bar', '.bt-pl-bub-title', '.bt-pl-bub-sub', '.bt-pl-bub-real', '.bt-pl-real-txt', '.bt-pl-bub-draft', '.bt-pl-check', '.bt-pl-extra', '.bt-pl-abs', '.bt-pl-avatar'];
const STYLE_PROPS = ['background-color', 'background-image', 'border-top-style', 'border-top-color', 'border-right-style', 'border-right-color', 'border-bottom-style', 'border-bottom-color', 'border-left-style', 'border-left-color', 'color', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius', 'opacity',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'box-shadow']; // (l'épaisseur du pointillé : à part, elle suit l'échelle — K5 taille relative)
// Les textes : police, taille, graisse, interligne, espacement, soulignement — identiques à l'écran (la feuille n'est réduite que par l'échelle, jamais par une autre taille).
const TEXT_SEL = ['.bt-pl-bub-title', '.bt-pl-bub-sub', '.bt-pl-hour', '.bt-pl-real-txt', '.bt-pl-bub-draft', '.bt-pl-extra-name', '.bt-pl-extra-by', '.bt-pl-abs-lbl'];
const TEXT_PROPS = ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-transform', 'text-decoration-line', 'color'];
const readStyles = ([where, sel, props]) => {
  const rows = where === 'print' ? document.querySelectorAll('.bt-print tbody tr') : document.querySelectorAll('.bt-pl-gridwrap tbody:not(.bt-pl-ghostbody) tr');
  const out = {};
  for (const tr of rows) {
    const name = (tr.querySelector('.bt-pl-name')?.textContent || '').trim();
    out[name] = [...tr.querySelectorAll(sel.join(','))].map((e) => ({ k: sel.find((x) => e.matches(x)), t: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40), st: Object.fromEntries(props.map((p) => [p, getComputedStyle(e).getPropertyValue(p)])) }));
  }
  return out;
};
/** print-color-adjust sur la feuille ET chaque élément : la valeur « exact » garde fonds, rayures et bordures colorées. */
const readAdjust = () => {
  const els = [document.querySelector('.bt-print'), ...document.querySelectorAll('.bt-print *')];
  const bad = els.filter((e) => { const c = getComputedStyle(e); return c.getPropertyValue('print-color-adjust') !== 'exact' || c.getPropertyValue('-webkit-print-color-adjust') !== 'exact'; });
  const painted = els.filter((e) => { const c = getComputedStyle(e); return (c.backgroundColor !== 'rgba(0, 0, 0, 0)') || c.backgroundImage !== 'none'; }).length;
  return { n: els.length, bad: bad.slice(0, 3).map((e) => e.className || e.tagName), painted };
};
/** Les couleurs de remplissage (rg) écrites dans le PDF : sans « Graphiques d'arrière-plan », elles n'y sont que si print-color-adjust: exact agit. */
const pdfFills = (buf) => {
  const out = new Set(); const re = /stream\r?\n/g; let m;
  while ((m = re.exec(buf.toString('latin1')))) {
    const st = m.index + m[0].length, en = buf.indexOf('endstream', st); let d;
    try { d = zlib.inflateSync(buf.subarray(st, en)).toString('latin1'); } catch { continue; }
    for (const c of d.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) rg\b/g)) out.add([c[1], c[2], c[3]].map((v) => Math.round(Number(v) * 255)).join(','));
  }
  return out;
};
/** Dessin réel du PDF : pour chaque page, bord gauche et bord droit (mm depuis le bord du papier) de ce qui est peint
 *  (remplissages et traits, le texte et les fonds BLANCS exclus : la marge de la feuille est blanche) — le cadre du tableau
 *  en est le point le plus à l'extérieur. */
const pdfPaintEdges = (buf) => {
  const s = buf.toString('latin1'), W = Number(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)/.exec(s)?.[1]);
  const content = (n) => {
    const m = new RegExp(`(?:^|[\\r\\n])${n} 0 obj`).exec(s); if (!m) return '';
    const st = s.indexOf('stream', m.index), a = st + (s[st + 6] === '\r' ? 8 : 7);
    try { return zlib.inflateSync(buf.subarray(a, s.indexOf('endstream', a))).toString('latin1'); } catch { return ''; }
  };
  const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
  return [...s.matchAll(/\d+ 0 obj\s*<<\s*\/Type\s*\/Page(?!s)([\s\S]*?)endobj/g)].map((pg) => {
    const t = content(Number(/\/Contents\s+(\d+)\s+0\s+R/.exec(pg[1])?.[1]));
    let ctm = [1, 0, 0, 1, 0, 0], nums = [], path = [], x0 = Infinity, x1 = -Infinity, white = false; const stack = [];
    const pt = (x, y) => ctm[0] * x + ctm[2] * y + ctm[4];
    for (const k of t.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?|[A-Za-z*']+/g) || []) {
      if (/^[-+]?\d*\.?\d+(?:e[-+]?\d+)?$/.test(k)) { nums.push(Number(k)); continue; }
      const n = nums;
      if (k === 'q') stack.push([ctm, white]); else if (k === 'Q') { const o = stack.pop(); if (o) [ctm, white] = o; } else if (k === 'cm') ctm = mul(n.slice(-6), ctm);
      else if (k === 'rg') white = n.slice(-3).every((v) => v > 0.99);
      else if (k === 'm' || k === 'l') path.push(pt(n.at(-2), n.at(-1)));
      else if (k === 'c') path.push(pt(n.at(-6), n.at(-5)), pt(n.at(-4), n.at(-3)), pt(n.at(-2), n.at(-1)));
      else if (k === 're') path.push(pt(n.at(-4), n.at(-3)), pt(n.at(-4) + n.at(-2), n.at(-3) + n.at(-1)));
      else if (/^(f|F|f\*|S|s|B|B\*|b|b\*)$/.test(k)) { if (!(white && /^(f|F|f\*)$/.test(k))) for (const x of path) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); } path = []; } else if (k === 'n') path = [];
      nums = [];
    }
    return { left: x0 * 25.4 / 72, right: (W - x1) * 25.4 / 72 };
  });
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Le premier élément qui diffère et SEULEMENT ses propriétés qui diffèrent : { sorte, texte, propriété : [écran, feuille] }. */
const firstDiff = (a, b) => {
  const i = a.findIndex((x, j) => !same(x, b?.[j]));
  if (i < 0) return [a.length, b?.length];
  const x = a[i], y = b?.[i];
  return { k: x.k, t: x.t, ...(y ? Object.fromEntries(Object.keys(x.st).filter((q) => x.st[q] !== y.st[q]).map((q) => [q, [x.st[q], y.st[q]]])) : { absent: true }) };
};
const MM1 = MM; // 1 mm en px

// ─── Les cas imprimés ─────────────────────────────────────────────────────────────
const CASES = [
  { id: 'semaine-peu', mode: 'few', opts: { kind: 'week' }, what: 'semaine, 3 salariés', pages: 1 },
  { id: 'semaine', mode: 'std', opts: { kind: 'week' }, what: 'semaine, 9 salariés dont un nom très long', screen: true, styles: true },
  { id: 'semaine-signature', mode: 'std', opts: { kind: 'week', signature: true }, what: 'semaine + signature' },
  { id: 'plusieurs-pages', mode: 'many', opts: { kind: 'week', signature: true }, what: 'semaine, 22 salariés + signature', minPages: 2 },
  { id: 'jour', mode: 'std', opts: { kind: 'day', signature: true }, what: 'jour + signature' },
  { id: 'mois', mode: 'std', opts: { kind: 'month' }, what: 'mois, 9 salariés', pages: 1 },
  { id: 'mois-signature', mode: 'many', opts: { kind: 'month', signature: true }, what: 'mois, 22 salariés + signature' },
];
// Couleurs de remplissage attendues dans le PDF (RGB de l'écran : matin, après-midi, soir, noir « envoyé »).
const FILLS = { matin: '218,237,251', 'après-midi': '253,227,202', soir: '223,204,238', 'noir (envoyé)': '21,18,15' };
let screenStyles = null, screenText = null, screenGeom = null;
/** Taille relative : la taille du texte d'une carte rapportée à la largeur du tableau, la largeur d'une carte rapportée à sa colonne. */
const readGeom = (where) => {
  const root = where === 'print' ? document.querySelector('.bt-print') : document.querySelector('.bt-pl-gridwrap');
  const t = root.querySelector('.bt-pl-bub[data-creneau] .bt-pl-bub-title'), tb = root.querySelector('.bt-pl-table'), bub = t.closest('.bt-pl-bub'), td = bub.closest('td');
  const z = where === 'print' ? Number(getComputedStyle(root.querySelector('.bt-print-z')).getPropertyValue('--bt-z')) : 1;
  return { txt: parseFloat(getComputedStyle(t).fontSize) * z / tb.getBoundingClientRect().width, card: bub.getBoundingClientRect().width / td.getBoundingClientRect().width, bw: parseFloat(getComputedStyle(bub).borderTopWidth), z };
};
for (const c of CASES) {
  const { ctx, p } = await newPage(c.mode);
  if (c.screen) await p.locator('.bt-pl-gridwrap').screenshot({ path: path.join(SH, `ecran-${c.id}.png`) });
  if (c.styles && !AVANT) { screenStyles = await p.evaluate(readStyles, ['screen', STYLE_SEL, STYLE_PROPS]); screenText = await p.evaluate(readStyles, ['screen', TEXT_SEL, TEXT_PROPS]); screenGeom = await p.evaluate(readGeom, 'screen'); }
  await printWith(p, c.opts);
  if (!AVANT) await paper(p, async (area) => {
    const m = area.margins, W = `${c.id} (${c.what})`;
    const sides = ['top', 'right', 'bottom', 'left'].map((k) => mmOf(m?.[k]));
    check(sides.every((v) => v === 0) && /a4 landscape/i.test(m?.size || ''), `K1 ${W} : @page margin:0, A4 paysage (« ${m?.size} », marges ${sides.join(' / ')} mm) — le navigateur n'a plus de marge où écrire son en-tête et son pied`);
    const r = await p.evaluate(measureSheet, LONG);
    const inset = (r.vw - 277 * MM) / 2;
    check(Math.abs(r.left - inset) <= MM1 && Math.abs(r.left - (r.vw - r.right)) <= MM1 && Math.abs(r.width - 277 * MM) <= MM1, `K3 ${W} : feuille de 277 mm, 10 mm de chaque côté, tableau centré sur toute sa largeur (gauche ${r.left.toFixed(1)} px, droite ${(r.vw - r.right).toFixed(1)} px, largeur ${r.width.toFixed(0)} px)`);
    check(r.over <= MM1, `K3 ${W} : aucun débordement horizontal (${r.over} px)`);
    const fr = [['gauche', r.l], ['droite', r.r], ['haut', r.t], ['bas', r.b]];
    check(fr.every(([, e]) => e.min >= 2 && e.ok) && fr.every(([, e]) => e.min > r.innerMax), `K2 ${W} : cadre noir sur les 4 côtés, plus épais que les traits internes (${fr.map(([n, e]) => `${n} ${e.min}px`).join(', ')} > ${r.innerMax}px)`);
    check(r.tfoot && r.tfoot.display === 'table-footer-group' && r.tfoot.w >= 2, `K2 ${W} : pied de tableau qui referme le cadre en bas de chaque page (${JSON.stringify(r.tfoot)})`);
    check(r.thead === 'table-header-group' && r.avoid, `K4 ${W} : en-tête répété (${r.thead}), aucune ligne coupée (break-inside: avoid)`);
    if (c.mode !== 'few') check(r.longName && !r.longName.cut && !r.longName.ellipsis, `K4 ${W} : le nom très long « ${LONG} » s'imprime en entier, sans « … » (${JSON.stringify(r.longName)})`);
    if (c.id === 'semaine-peu') check(Math.max(...r.rowH) <= 2.2 * Math.min(...r.rowH), `K3 ${W} : aucune hauteur imposée au tableau, lignes équilibrées : ${r.rowH.map((v) => v.toFixed(0)).join(' / ')} px (la plus haute ≤ 2,2 × la plus petite)`);
    const adj = await p.evaluate(readAdjust);
    check(adj.bad.length === 0 && adj.painted > 0, `K5 ${W} : print-color-adjust: exact sur la feuille et ses ${adj.n} éléments (${adj.painted} avec fond ou motif) ${JSON.stringify(adj.bad)}`);
    if (c.styles) {
      const got = await p.evaluate(readStyles, ['print', STYLE_SEL, STYLE_PROPS]);
      // La maladie s'imprime « Absent » (neutre, voulu depuis le lot 3) : on la compare à part.
      const strip = (g) => Object.fromEntries(Object.entries(g).map(([n, l]) => [n, l.filter((x) => !(x.k === '.bt-pl-abs' && /Maladie|Absent/.test(x.t)))]));
      const a = strip(screenStyles), bb = strip(got), bad = [];
      for (const n of Object.keys(a)) { if (!same(a[n], bb[n])) bad.push(`${n} : ${JSON.stringify(firstDiff(a[n], bb[n]))}`); }
      const kinds = new Set(Object.values(a).flat().map((x) => x.k));
      check(bad.length === 0 && Object.keys(a).length === 9 && kinds.has('.bt-pl-abs') && kinds.has('.bt-pl-extra') && kinds.has('.bt-pl-check'), `K5 ${W} : fonds, motifs, bordures, couleurs de texte IDENTIQUES à l'écran sur ${Object.values(a).flat().length} éléments (${[...kinds].length} sortes)${bad.length ? `\n   ${bad.slice(0, 3).join('\n   ')}` : ''}`);
      const bg = (arr, sel2) => new Set(arr.flat().filter((x) => x.k === sel2).map((x) => x.st['background-color'] + '|' + x.st['background-image']));
      const sc = Object.values(a), pr = Object.values(bb);
      check(same([...bg(sc, '.bt-pl-bub')].sort(), [...bg(pr, '.bt-pl-bub')].sort()) && bg(pr, '.bt-pl-bub').size >= 4 && bg(pr, '.bt-pl-abs').size >= 1 && [...bg(pr, '.bt-pl-abs')].every((x) => /repeating-linear-gradient/.test(x)), `K5 ${W} : mêmes fonds de cases qu'à l'écran (${bg(pr, '.bt-pl-bub').size} fonds de bulles, rayures des congés « repeating-linear-gradient »)`);
      // Les textes : police, graisse, couleur, casse… identiques à l'écran, et la TAILLE aussi — sauf le plancher de lisibilité :
      // la taille sur la feuille est max(taille de l'écran, 7 pt / échelle), jamais autre chose (un texte assez grand est à la taille de l'écran ;
      // interligne et espacement des lettres suivent la taille, comme à l'écran, en proportion). La maladie « Absent » est comparée à part.
      const geom = await p.evaluate(readGeom, 'print');
      const gotT = await p.evaluate(readStyles, ['print', TEXT_SEL, TEXT_PROPS]);
      const stripT = (g) => Object.fromEntries(Object.entries(g).map(([n, l]) => [n, l.filter((x) => !(x.k === '.bt-pl-abs-lbl' && /Maladie|Absent/.test(x.t)))]));
      const FLOOR = 9.35 / geom.z; // 7 pt effectifs, en px de la feuille avant réduction
      const prop = (st, wanted) => {
        const fs = wanted ?? parseFloat(st['font-size']), o = { ...st };
        o['font-size'] = fs.toFixed(2);
        for (const q of ['line-height', 'letter-spacing']) o[q] = /px$/.test(st[q]) ? (parseFloat(st[q]) / parseFloat(st['font-size'])).toFixed(3) : st[q];
        return o;
      };
      const aT = Object.fromEntries(Object.entries(stripT(screenText)).map(([n, l]) => [n, l.map((x) => ({ ...x, st: prop(x.st, Math.max(parseFloat(x.st['font-size']), FLOOR)) }))]));
      const bT = Object.fromEntries(Object.entries(stripT(gotT)).map(([n, l]) => [n, l.map((x) => ({ ...x, st: prop(x.st) }))])), badT = [];
      for (const n of Object.keys(aT)) { if (!same(aT[n], bT[n])) badT.push(`${n} : ${JSON.stringify(firstDiff(aT[n], bT[n]))}`); }
      const kindsT = new Set(Object.values(aT).flat().map((x) => x.k));
      const raised = Object.values(stripT(screenText)).flat().filter((x) => parseFloat(x.st['font-size']) < FLOOR - 0.01).length;
      check(badT.length === 0 && kindsT.size >= 7, `K5 ${W} : polices, graisses, couleurs, interlignes IDENTIQUES à l'écran et tailles IDENTIQUES ou relevées à 7 pt (max(écran, 9,35 px / ${geom.z.toFixed(2)} = ${FLOOR.toFixed(2)} px)) sur ${Object.values(aT).flat().length} textes (${kindsT.size} sortes, ${raised} relevés)${badT.length ? `\n   ${badT.slice(0, 3).join('\n   ')}` : ''}`);
      check(Math.abs(geom.txt / screenGeom.txt - 1) <= 0.15 && Math.abs(geom.card - screenGeom.card) <= 0.03, `K5 ${W} : taille relative comme à l'écran : texte / largeur du tableau ${geom.txt.toFixed(5)} (écran ${screenGeom.txt.toFixed(5)}), carte / colonne ${geom.card.toFixed(3)} (écran ${screenGeom.card.toFixed(3)})`);
      // Le pointillé de 1,5 px de l'écran (affiché 1 px sur un écran à 1×) suit l'échelle de la feuille : 1,5 × .8 = 1,2 px.
      check(Math.abs(geom.bw - 1.5 * geom.z) <= 0.25 && screenGeom.bw >= 1 && screenGeom.bw <= 1.5, `K5 ${W} : épaisseur du pointillé des cartes proportionnelle à l'échelle (${geom.bw}px = 1,5 × ${geom.z.toFixed(2)} ; écran ${screenGeom.bw}px)`);
      const sw = await p.evaluate(() => [...document.querySelectorAll('.bt-print-sw')].map((e) => getComputedStyle(e).backgroundColor));
      check(same(sw, ['rgb(218, 237, 251)', 'rgb(253, 227, 202)', 'rgb(223, 204, 238)']), `K5 ${W} : pastilles de la légende = couleurs matin / après-midi / soir de l'écran (${sw.join(' ; ')})`);
    }
  });
  const pdf = await p.pdf(PDF_OPTS);
  fs.writeFileSync(path.join(SH, `impression-${c.id}.pdf`), pdf);
  const info = pdfInfo(pdf);
  check(a4Land(info) && (!c.pages || info.pages === c.pages) && info.pages >= (c.minPages || 1), `K6 ${c.id} : PDF A4 paysage, ${info.pages} page(s)`);
  // Le dessin réel du PDF : sur CHAQUE page, le cadre est à 10 mm du bord (9,5 mm de tolérance : la moitié extérieure du
  // trait déborde de ~0,2 mm) à gauche comme à droite, à 1 mm près.
  const edges = pdfPaintEdges(pdf);
  check(edges.length === info.pages && edges.every((e) => e.left >= 9.5 && e.right >= 9.5 && Math.abs(e.left - e.right) <= 1), `K6 ${c.id} : dessin du PDF centré sur chaque page, marges gauche / droite en mm : ${edges.map((e) => `${e.left.toFixed(1)}/${e.right.toFixed(1)}`).join(', ')}`);
  if (c.styles) {
    const fills = pdfFills(pdf);
    check(Object.entries(FILLS).every(([, v]) => fills.has(v)), `K5 ${c.id} : le PDF sans « Graphiques d'arrière-plan » contient quand même les couleurs ${Object.entries(FILLS).map(([k, v]) => `${k} (${v})`).join(', ')}`);
  }
  await closePrint(p);
  await ctx.close();
}
console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
