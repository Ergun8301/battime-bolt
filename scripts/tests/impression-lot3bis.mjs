// Lancer : node scripts/tests/impression-lot3bis.mjs out docs/captures-lot3bis [port] (après npm run build).
// Captures « avant » : AVANT=1 node scripts/tests/impression-lot3bis.mjs <build d'avant> docs/captures-lot3bis [port]
// (captures seulement, aucune vérification). playwright-core doit être résoluble.
// Les PDF gardés (impression-apres-*.pdf) se rastérisent à part, hors du dépôt.
//
// Lot 3bis (3) — « Imprimer » : n'importe quelle période, sur la VRAIE page planning (base
// simulée, horloge figée au mercredi 21 octobre 2026, 10:00 à Paris ; aucun appel réseau
// réel, rien n'est écrit) :
//   I1 par défaut la semaine affichée (« S-43 · 19 – 25 oct. », puis S-44 après ›) ; après
//      rechargement : de nouveau la semaine, la signature retenue (un ancien « Un jour » ignoré) ;
//   I2 changer de type : Jour = aujourd'hui (sinon le lundi), Demain, date vidée, Mois, ‹ ›, Semaine ;
//   I3 une autre semaine (‹) : lue à part (entreprise + dates, sans la jointure salarié), feuille
//      = grille de l'écran de cette semaine ; S-42 : chantier archivé écrit en entier, jamais « Autre » ;
//   I4 Jour + Demain hors de la semaine affichée : « Préparation… » (options figées, aria-busy),
//      puis 1 colonne = la colonne de l'écran ; I5 un jour de la semaine affichée : rien relu ;
//   I6 octobre : 31 jours × 9 salariés, codes + clé, créneaux, noir = envoyé, C / A, maladie jamais
//      écrite, retirée barrée, brouillon vide ignoré, heures hors planning, autre entreprise absente ;
//   I7 novembre (30 jours) ; I8 tient en largeur (A4 paysage, signature) ; I9 40 salariés : lecture
//      paginée, en-tête répété, lignes jamais coupées, rien de tronqué, PDF A4 paysage de 2 pages ;
//   I10 lecture en échec : message, menu ouvert, rien d'imprimé ; Échap / clic dehors pendant la lecture ;
//   I11 Ctrl+P : semaine affichée, encore après un mois ; rien tant que la semaine n'est pas chargée ;
//      pendant une lecture : menu fermé, une seule impression ; téléphone : le jour affiché ;
//   I12 portrait : le mois reste dans la page ; I13 toute lecture filtrée sur l'entreprise ;
//   I14 imprimer n'écrit rien (mesuré autour des impressions) ; I15 le menu tient à l'écran.
import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { chromium } from 'playwright-core';
const [,, OUT, SH, PORT = '5321'] = process.argv; fs.mkdirSync(SH, { recursive: true });
const AVANT = process.env.AVANT === '1';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'impression-lot3bis-'));
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT), r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ─── Horloge figée : mercredi 21 octobre 2026, 10:00 (Paris) — semaine 43 ────────
const NOW = new Date('2026-10-21T10:00:00+02:00');
const ISO = (m, d) => `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const D_ = (d) => ISO(10, d);
const S43 = [19, 20, 21, 22, 23, 24, 25].map(D_);

// ─── Base simulée (celle de planning-lot3, plus le reste d'octobre) ───────────────
const CO = 'c0000000-0000-0000-0000-000000000001', CO2 = 'c0000000-0000-0000-0000-000000000002';
const ws = (id, client_name, city, product_type = null, extra = {}) => ({ id, company_id: CO, client_name, city, product_type, is_active: true, ...extra });
const W1 = ws('w1', 'Villa Exemple', 'Lyon', 'Fenêtres'), W2 = ws('w2', 'Résidence Test', 'Villeurbanne', 'Portail');
const W3 = ws('w3', 'Maison Démo', 'Bron', 'Volets'), W4 = ws('w4', 'Atelier Fictif', 'Vénissieux'), W5 = ws('w5', 'Autre', null);
// Chantier ARCHIVÉ : absent de la liste de l'écran (is_active = true), cité par des heures sans créneau.
const W6 = ws('w6', 'Hangar Sample', 'Givors', null, { is_active: false });
// Une autre entreprise : rien d'elle ne doit sortir sur la feuille.
const W9 = { id: 'w9', company_id: CO2, client_name: 'Chantier Tiers', city: 'Paris', product_type: null, is_active: true };
const WS = { w1: W1, w2: W2, w3: W3, w4: W4, w5: W5, w6: W6, w9: W9 };
const u = (id, first_name, last_name, role = 'worker') => ({ id, company_id: CO, first_name, last_name, role, email: `${id}@exemple.fr`, is_active: true, created_at: '2026-01-01' });
const LONG = 'Maximilien-Alexandre De La Fontaine-Beaumarchais';
const WORKERS = [u('u-alex', 'Alex', 'Test'), u('u-bruno', 'Bruno', 'Essai'), u('u-chloe', 'Chloé', 'Exemple'), u('u-dina', 'Dina', 'Démo'),
  u('u-eli', 'Eli', 'Fictif'), u('u-fanny', 'Fanny', 'Modèle'), u('u-gabin', 'Gabin', 'Témoin'), u('u-hugo', 'Hugo', 'Proto'), u('u-max', 'Maximilien-Alexandre', 'De La Fontaine-Beaumarchais')];
const NAME = Object.fromEntries(WORKERS.map((w) => [w.id, `${w.first_name} ${w.last_name}`]));

const SLOTS = []; let seq = 0;
const slotAt = (id, user_id, date, w, start, end, extra = {}) => SLOTS.push({ id, company_id: CO, user_id, worksite_id: w?.id ?? null, work_date: date, absence_type: null, estimated_start: start, estimated_end: end,
  notes: null, position: null, added_by_worker: false, created_by: 'u-admin', created_at: new Date(Date.UTC(2026, 9, 1, 6, 0, seq++)).toISOString(), ...extra });
const slot = (id, user_id, day, w, start, end, extra = {}) => slotAt(id, user_id, D_(day), w, start, end, extra);
const absence = (id, user_id, date, type) => slotAt(id, user_id, date, null, null, null, { absence_type: type });
// Semaine 43 (planning-lot3)
slot('p-a1', 'u-alex', 19, W1, '08:00:00', '12:00:00'); slot('p-a2', 'u-alex', 19, W2, '13:30:00', '17:00:00');
slot('p-a3', 'u-alex', 20, W3, '13:00:00', '17:00:00'); slot('p-a4', 'u-alex', 21, W1, '08:00:00', '12:00:00'); slot('p-a5', 'u-alex', 22, W2, '14:00:00', null);
slot('p-b1', 'u-bruno', 19, W3, '11:59:00', null); slot('p-b2', 'u-bruno', 20, W1, '12:00:00', null); slot('p-b3', 'u-bruno', 20, W4, '18:00:00', '22:00:00');
slot('p-b4', 'u-bruno', 21, W2, '17:59:00', null); slot('p-b5', 'u-bruno', 22, W3, '18:00:00', null); slot('p-b6', 'u-bruno', 23, W1, '07:00:00', '13:00:00');
slot('p-c1', 'u-chloe', 19, W2, '11:00:00', '13:00:00'); slot('p-c2', 'u-chloe', 20, W3, '11:00:00', '15:00:00'); slot('p-c3', 'u-chloe', 21, W4, '16:00:00', '19:00:00');
slot('p-c4', 'u-chloe', 22, W1, '17:00:00', '20:00:00'); slot('p-c5', 'u-chloe', 23, W2, '10:30:00', '14:00:00');
slot('p-d1', 'u-dina', 19, W3, '08:00:00', '17:00:00'); slot('p-d2', 'u-dina', 20, W4, '10:00:00', '14:00:00'); slot('p-d3', 'u-dina', 21, W1, '16:00:00', '22:00:00');
absence('p-d4', 'u-dina', D_(22), 'maladie'); absence('p-d5', 'u-dina', D_(23), 'maladie');
slot('p-e1', 'u-eli', 19, W2, null, null); absence('p-e2', 'u-eli', D_(20), 'conge'); slot('p-e3', 'u-eli', 21, W3, null, null);
slot('p-f1', 'u-fanny', 19, W5, '09:00:00', '11:00:00', { notes: 'Formation sécurité' }); slot('p-f2', 'u-fanny', 20, W1, '13:30:00', '17:00:00');
slot('p-f3', 'u-fanny', 21, W2, '12:00:00', '12:00:00'); slot('p-f4', 'u-fanny', 22, W3, '09:00:00', '08:00:00');
for (const d of [19, 20, 21, 22, 23]) { slot(`p-g${d}m`, 'u-gabin', d, W4, '08:00:00', '12:00:00'); slot(`p-g${d}a`, 'u-gabin', d, W1, '13:30:00', '17:00:00'); }
for (const d of [19, 20, 21, 22, 23]) slot(`p-h${d}`, 'u-hugo', d, W2, '13:30:00', '17:00:00');
slot('p-h24', 'u-hugo', 24, W3, '18:00:00', '21:00:00');
for (const d of [19, 20, 21]) slot(`p-m${d}`, 'u-max', d, W4, '08:00:00', '17:00:00');
// Lot 3bis : le reste d'octobre et le début de novembre
slot('p-o1', 'u-alex', 1, W1, '08:00:00', '12:00:00');                       // 1er octobre, matin
slot('p-o2', 'u-bruno', 31, W3, '18:00:00', '21:00:00');                     // samedi 31, soir
slotAt('p-o3', 'u-chloe', ISO(11, 1), W2, null, null);                        // 1er novembre, sans horaire
for (const date of [D_(30), D_(31), ISO(11, 1), ISO(11, 2)]) absence(`p-oc${date.slice(5)}`, 'u-eli', date, 'conge');
slot('p-o8', 'u-fanny', 23, W4, '08:00:00', '12:00:00');                     // retirée par le salarié
slot('p-s1', 'u-alex', 27, W2, '08:00:00', '12:00:00');                       // semaine 44
slot('p-s2', 'u-hugo', 28, W3, '13:30:00', '17:00:00');

const entry = (id, user_id, date, w, status, start, end, minutes, extra = {}) => ({ id, company_id: CO, user_id, work_date: date, worksite_id: w?.id ?? null, planning_id: null, status, start_time: start, end_time: end, total_minutes: minutes, break_minutes: 0, reception: null, reserve_resolved_at: null, reserve_fixed_at: null, observation: null, locked: false, submitted_at: status === 'draft' ? null : `${date}T18:00:00Z`, ...extra });
const ENTRIES = [
  entry('e-a1', 'u-alex', D_(19), W1, 'submitted', '08:00:00', '12:00:00', 240, { planning_id: 'p-a1' }),   // envoyé → noir
  entry('e-e3', 'u-eli', D_(21), W3, 'draft', '18:00:00', '20:00:00', 120, { planning_id: 'p-e3' }),        // brouillon 18–20 → soir
  entry('e-e1', 'u-eli', D_(19), null, 'submitted', '15:00:00', '16:00:00', 60),                            // hors planning, sans chantier
  entry('e-o1', 'u-alex', D_(14), W4, 'submitted', '08:00:00', '12:00:00', 240),                            // chantier sans créneau
  entry('e-o2', 'u-bruno', D_(15), W6, 'validated', '13:00:00', '17:00:00', 240),                           // chantier ARCHIVÉ sans créneau
  entry('e-o3', 'u-fanny', D_(23), W4, 'cancelled', '08:00:00', '12:00:00', 0, { planning_id: 'p-o8' }),    // « je n'y suis pas allé »
  entry('e-o4', 'u-gabin', D_(23), W4, 'draft', '08:00:00', '08:00:00', 0, { planning_id: 'p-g23m' }),      // brouillon VIDE : ignoré
];
const LIVE = [{ user_id: 'u-alex', company_id: CO, worksite_id: 'w1', planning_id: 'p-a4', work_date: D_(21), started_at: '2026-10-21T05:45:00Z', positions: [] }];
const COMPANY = { id: CO, name: 'Entreprise Test', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, travel_paid: false, accountant_email: null };

// 40 salariés, 1 ou 2 interventions chaque jour ouvré d'octobre (≈ 1 300 lignes : 3 pages de lecture).
const FN = ['Alex', 'Bruno', 'Chloé', 'Dina', 'Eli', 'Fanny', 'Gabin', 'Hugo', 'Inès', 'Jules', 'Karim', 'Léa', 'Marc', 'Nina', 'Oscar', 'Paula', 'Quentin', 'Rose', 'Sami', 'Tara'];
const BIG = Array.from({ length: 40 }, (_, i) => (i === 3 ? u('u-b03', 'Maximilien-Alexandre', 'De La Fontaine-Beaumarchais') : u(`u-b${String(i).padStart(2, '0')}`, FN[i % 20], i < 20 ? 'Test' : 'Essai')));
const bigRows = () => {
  const planning = [], entries = []; let k = 0;
  const wsl = [W1, W2, W3, W4];
  for (const [i, w] of BIG.entries()) for (let d = 1; d <= 31; d++) {
    const wd = new Date(Date.UTC(2026, 9, d)).getUTCDay(); if (wd === 0 || wd === 6) continue;
    const two = (i + d) % 2 === 0;
    const pairs = two ? [['08:00:00', '12:00:00'], ['13:30:00', '17:00:00']] : [['08:00:00', '17:00:00']];
    pairs.forEach(([s0, e0], j) => {
      const id = `p-x${k++}`;
      planning.push({ id, company_id: CO, user_id: w.id, worksite_id: wsl[(i + d + j) % 4].id, work_date: D_(d), absence_type: null, estimated_start: s0, estimated_end: e0, notes: null, position: null, added_by_worker: false, created_by: 'u-admin', created_at: new Date(Date.UTC(2026, 8, 1, 6, 0, k)).toISOString() });
      if (d < 10 && j === 0) entries.push(entry(`e-x${k}`, w.id, D_(d), wsl[(i + d + j) % 4], 'submitted', s0, e0, 240, { planning_id: id }));
    });
  }
  return { planning, entries };
};
const fresh = (big = false) => {
  const B = big ? bigRows() : null;
  return {
    users: [u('u-admin', 'Sam', 'Test', 'admin'), ...(big ? BIG : WORKERS)],
    companies: [{ ...COMPANY }],
    worksites: Object.values(WS),
    planning: big ? B.planning : [...SLOTS.map((s) => ({ ...s })),
      { id: 'p-z1', company_id: CO2, user_id: 'u-alex', worksite_id: 'w9', work_date: D_(6), absence_type: null, estimated_start: '08:00:00', estimated_end: '12:00:00', notes: null, position: null, added_by_worker: false, created_by: 'x', created_at: '2026-10-01T06:00:00Z' }],
    time_entries: big ? B.entries : [...ENTRIES.map((e) => ({ ...e })), { ...entry('e-z1', 'u-alex', D_(7), W9, 'submitted', '08:00:00', '12:00:00', 240), company_id: CO2 }],
    active_sessions: big ? [] : LIVE.map((x) => ({ ...x })),
    documents: [{ id: 'd1', company_id: CO, worksite_id: 'w1', label: 'Plan', file_name: 'plan.pdf', mime_type: 'application/pdf', work_date: D_(20), created_at: '2026-10-20T08:00:00Z' }],
    leave_requests: [], invitations: [], month_closures: [], user_closures: [], certifications: [], push_subscriptions: [], kiosks: [], kiosk_settings: [], worksite_expenses: [], user_payroll: [],
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
const setup = async (ctx, big = false) => {
  const db = fresh(big);
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
const newPage = async (w, h, { mobile = false, big = false } = {}) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'fr-FR', timezoneId: 'Europe/Paris', ...(mobile ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
  await setup(ctx, big); const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('   [erreur page]', e.message));
  await p.goto(`http://localhost:${PORT}/admin`);
  await p.waitForSelector(mobile ? '.bt-pl-m-card' : '.bt-pl-gridwrap .bt-pl-name', { timeout: 25000 }); await p.waitForTimeout(1500);
  return { ctx, p };
};
const shot = async (p, name, opts = {}) => { await p.waitForTimeout(250); await p.screenshot({ path: path.join(SH, name), ...opts }); };
/** Capture du menu dans son coin de barre (de quoi voir l'icône 🖨 au-dessus). */
const menuShot = async (p, name) => {
  await p.mouse.move(5, p.viewportSize().height - 5); await p.waitForTimeout(200);
  const r = await p.locator('[data-testid=print-menu]').boundingBox(); const vw = p.viewportSize().width;
  const x = Math.max(0, Math.floor(r.x - 60));
  await shot(p, name, { clip: { x, y: 0, width: vw - x, height: Math.ceil(r.y + r.height + 18) } });
};

// ─── Relevés ─────────────────────────────────────────────────────────────────────
const BG = { matin: 'rgb(218, 237, 251)', 'apres-midi': 'rgb(253, 227, 202)', soir: 'rgb(223, 204, 238)', white: 'rgb(255, 255, 255)', reel: 'rgb(21, 18, 15)', live: 'rgb(231, 246, 238)' };
const CHANTIER_BARS = ['#C9821F', '#A23E6B', '#2F8A5B', '#B5472E', '#7A5EA8', '#5E7A33', '#A8742A'];
const hashStr = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return Math.abs(h); };
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
/** Grille de l'écran ou feuille semaine / jour : par salarié, par jour (comme planning-lot3). */
const readGrid = (p, where) => p.evaluate((where) => {
  const out = {};
  const rows = where === 'print' ? document.querySelectorAll('.bt-print tbody tr') : document.querySelectorAll('.bt-pl-gridwrap tbody:not(.bt-pl-ghostbody) tr');
  for (const tr of rows) {
    const name = (tr.querySelector('.bt-pl-name')?.textContent || '').trim();
    out[name] = [...tr.querySelectorAll('td.bt-pl-cell:not(.bt-print-sig)')].map((td) => ({
      bubs: [...td.querySelectorAll('.bt-pl-bub')].map((el) => ({ t: (el.querySelector('.bt-pl-bub-title')?.textContent || '').trim(), c: el.getAttribute('data-creneau'), bg: getComputedStyle(el).backgroundColor, bar: getComputedStyle(el.querySelector('.bt-pl-bub-bar')).backgroundColor, txt: el.innerText.replace(/\s+/g, ' ').trim() })),
      extra: [...td.querySelectorAll('.bt-pl-extra')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
      abs: (td.querySelector('.bt-pl-abs-lbl')?.textContent || '').trim() || null,
    }));
  }
  return out;
}, where);
/** L'écran tel que le papier doit le rendre : pas de direct (teinte de l'horaire), maladie → « Absent ». */
const asPaper = (grid) => {
  const g = JSON.parse(JSON.stringify(grid));
  for (const days of Object.values(g)) for (const c of days) {
    if (c.abs === 'Maladie') c.abs = 'Absent';
    for (const x of c.bubs) x.txt = x.txt.replace(/\s*en cours depuis \d\d:\d\d/, '');
  }
  const live = g['Alex Test']?.[2]?.bubs?.[0];
  if (live) Object.assign(live, { c: 'matin', bg: BG.matin, bar: rgb(CHANTIER_BARS[hashStr('w1') % 7]) });
  return g;
};
/** La feuille du mois : par salarié, par jour ISO, l'absence ou les blocs. */
const readMonth = (p) => p.evaluate(() => {
  const out = {};
  for (const tr of document.querySelectorAll('.bt-print [data-testid=print-m-row]')) {
    out[tr.querySelector('td.n').textContent.trim()] = Object.fromEntries([...tr.querySelectorAll('td[data-day]')].map((td) => [td.getAttribute('data-day'), {
      abs: td.querySelector('[data-testid=print-m-abs]')?.textContent.trim() || null,
      b: [...td.querySelectorAll('[data-testid=print-m-slot]')].map((e) => ({ code: e.textContent.trim(), st: e.getAttribute('data-state'), c: e.getAttribute('data-creneau'), bg: getComputedStyle(e).backgroundColor, deco: getComputedStyle(e).textDecorationLine })),
    }]));
  }
  return out;
});
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const diffGrid = (got, want, label) => {
  const bad = [];
  for (const [name, days] of Object.entries(want)) days.forEach((c, i) => { if (!same(got[name]?.[i], c)) bad.push(`${name} ${label(i)} : ${JSON.stringify(got[name]?.[i])} ≠ ${JSON.stringify(c)}`); });
  if (Object.keys(got).length !== Object.keys(want).length) bad.push(`lignes ${Object.keys(got).length} ≠ ${Object.keys(want).length}`);
  return bad;
};
const pdfInfo = (buf) => {
  const s = buf.toString('latin1');
  return { pages: (s.match(/\/Type\s*\/Page(?!s)/g) || []).length, boxes: [...s.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [Number(m[3]), Number(m[4])]) };
};
const a4Land = (info) => info.boxes.length > 0 && info.boxes.every(([w, h]) => Math.abs(w - 841.89) <= 1.5 && Math.abs(h - 595.28) <= 1.5);
const PDF_OPTS = { format: 'A4', landscape: true, printBackground: false, preferCSSPageSize: true };

// ─── Imprimer depuis le menu ─────────────────────────────────────────────────────
const printed = (p) => p.evaluate(() => window.__printed || 0);
const openMenu = async (p) => { await p.click('[data-testid=bar-print]'); await p.waitForSelector('[data-testid=print-menu]'); };
const label = (p) => p.locator('[data-testid=print-period-label]').innerText().then((s) => s.trim());
/** Écritures pendant les impressions seulement (I14) : l'écran, lui, peut réparer un créneau. */
let printNonGet = 0;
/** Ouvre le menu, règle les options, clique « Imprimer » et attend l'appel à print(). */
const printWith = async (p, { kind = 'week', moves = 0, date = null, tomorrow = false, who = 'all', signature = false } = {}) => {
  const n = await printed(p); const w0 = nonGet.length;
  await openMenu(p);
  await p.click(`[data-testid=print-scope-${kind}]`);
  for (let i = 0; i < Math.abs(moves); i++) await p.click(`[data-testid=print-${moves < 0 ? 'prev' : 'next'}]`);
  if (date) await p.fill('[data-testid=print-date]', date);
  if (tomorrow) await p.click('[data-testid=print-tomorrow]');
  await p.selectOption('[data-testid=print-who]', who);
  if (await p.isChecked('[data-testid=print-sig]') !== signature) await p.click('[data-testid=print-sig]');
  await p.click('[data-testid=print-go]');
  await p.waitForFunction((n) => (window.__printed || 0) === n + 1, n, { timeout: 15000 });
  await p.waitForTimeout(150);
  printNonGet += nonGet.length - w0;
  return p.evaluate(() => window.__title);
};
const closePrint = (p) => p.evaluate(() => window.dispatchEvent(new Event('afterprint')));
/** Rendu « papier » à l'écran : largeur imprimable d'un A4 paysage (281 mm ≈ 1062 px). */
const paper = async (p, fn, { w = 1062, h = 733 } = {}) => {
  const vp = p.viewportSize();
  await p.setViewportSize({ width: w, height: h }); await p.emulateMedia({ media: 'print' }); await p.waitForTimeout(300);
  try { return await fn(); } finally { await p.emulateMedia({ media: null }); await p.setViewportSize(vp); await p.waitForTimeout(200); }
};
const toastText = (p) => p.locator('[data-sonner-toast]').allInnerTexts().then((l) => l.join(' | '));
/** Les GET d'une table depuis l'indice i0 ; `loader` : seulement ceux de la lecture d'impression
 *  (triés date puis id, ce que l'écran ne fait pas). */
const getsOf = (t, i0 = 0) => gets.slice(i0).filter((g) => g.t === t && /id\.asc/.test(g.p.get('order') || ''));

// ═══ AVANT : captures du build d'avant (aucune vérification) ═════════════════════
if (AVANT) {
  const { ctx, p } = await newPage(1440, 900);
  await openMenu(p); await menuShot(p, 'impression-avant-menu-1440.png');
  await p.click('[data-testid=print-scope-day]'); await menuShot(p, 'impression-avant-menu-un-jour.png');
  await p.click('[data-testid=print-scope-week]');
  const n = await printed(p);
  await p.click('[data-testid=print-go]'); await p.waitForFunction((n) => (window.__printed || 0) === n + 1, n, { timeout: 15000 });
  await paper(p, () => shot(p, 'impression-avant-semaine.png', { fullPage: true }));
  await ctx.close();
  console.log(`captures « avant » dans ${SH}`);
  await b.close(); srv.close(); fs.rmSync(TMP, { recursive: true, force: true }); process.exit(0);
}

// ═══ I1, I2, I15 (1440), I3, I4, I5, I6, I7, I8, I10, I11, I12 : bureau 1440×900 ══
{
  const { ctx, p } = await newPage(1440, 900);
  const screen43 = await readGrid(p, 'screen');
  check(Object.keys(screen43).length === 9 && screen43['Fanny Modèle'][4].bubs.length === 1 && screen43['Gabin Témoin'][4].bubs[0].c === 'matin', 'base : 9 salariés à l’écran, la case retirée de Fanny, Gabin matin (brouillon vide ignoré)');

  // I1 par défaut : la semaine affichée
  await openMenu(p);
  check(await p.locator('[data-testid=print-scope-week]').getAttribute('aria-pressed') === 'true' && await label(p) === 'S-43 · 19 – 25 oct.', `I1 par défaut « Semaine » et « ${await label(p)} »`);
  check((await p.locator('.bt-pl-pr-opt').allInnerTexts()).map((s) => s.trim()).join('|') === 'Semaine|Jour|Mois', 'I1 trois choix : Semaine · Jour · Mois');
  check(await p.evaluate(() => document.activeElement?.getAttribute('data-testid')) === 'print-go', 'I1 « Imprimer » a le focus (Entrée imprime)');
  check(await p.locator('[data-testid=print-prev]').getAttribute('aria-label') === 'Semaine précédente' && await p.locator('[data-testid=print-next]').getAttribute('aria-label') === 'Semaine suivante', 'I1 ‹ › nommés « Semaine précédente / suivante »');
  await menuShot(p, 'impression-apres-menu-semaine-1440.png');
  await p.click('[data-testid=print-prev]');
  check(await label(p) === 'S-42 · 12 – 18 oct.', `I1 ‹ dans le menu : « ${await label(p)} » (l’écran ne bouge pas)`);
  await menuShot(p, 'impression-apres-menu-semaine-precedente.png');
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  check(await p.locator('[data-testid=print-menu]').count() === 0 && (await p.locator('.bt-pl-datebox-wk').innerText()).includes('43'), 'I1 Échap ferme le menu ; l’écran est resté en S-43');
  await p.click('button[aria-label="Semaine suivante"]'); await p.waitForTimeout(900);
  await openMenu(p);
  check(await label(p) === 'S-44 · 26 oct. – 1 nov.', `I1 écran en S-44 : le menu s’ouvre sur « ${await label(p)} »`);
  await p.click('[data-testid=print-sig]'); await p.keyboard.press('Escape');
  // Un ancien réglage du lot 3 (« Un jour » retenu) ne doit plus rien imposer.
  await p.evaluate(() => localStorage.setItem('bemexo_print', JSON.stringify({ scope: 'day', signature: true })));
  await p.reload(); await p.waitForSelector('.bt-pl-gridwrap .bt-pl-name'); await p.waitForTimeout(1200);
  await openMenu(p);
  check(await p.locator('[data-testid=print-scope-week]').getAttribute('aria-pressed') === 'true' && await label(p) === 'S-43 · 19 – 25 oct.' && await p.isChecked('[data-testid=print-sig]'),
    'I1 après rechargement : de nouveau la semaine affichée (ancien « Un jour » ignoré), la signature retenue');
  await p.click('[data-testid=print-sig]');

  // I2 changer de type
  await p.click('[data-testid=print-scope-day]');
  check(await p.locator('[data-testid=print-date]').inputValue() === '2026-10-21' && await p.locator('[data-testid=print-today]').getAttribute('aria-pressed') === 'true' && await p.locator('[data-testid=print-tomorrow]').getAttribute('aria-pressed') === 'false', 'I2 Jour : aujourd’hui (21 oct.), « Aujourd’hui » enfoncé');
  check(await p.locator('[data-testid=print-date]').getAttribute('aria-label') === 'Jour à imprimer' && await p.locator('[data-testid=print-period-label]').count() === 0, 'I2 Jour : un champ date « Jour à imprimer », pas de ‹ ›');
  await menuShot(p, 'impression-apres-menu-jour.png');
  await p.click('[data-testid=print-tomorrow]');
  check(await p.locator('[data-testid=print-date]').inputValue() === '2026-10-22' && await p.locator('[data-testid=print-tomorrow]').getAttribute('aria-pressed') === 'true', 'I2 « Demain » : 22 oct.');
  await p.fill('[data-testid=print-date]', '');
  check(await p.locator('[data-testid=print-date]').inputValue() === '2026-10-22', 'I2 champ vidé : le dernier jour reste (jamais de période vide)');
  await p.fill('[data-testid=print-date]', '2026-11-05');
  check(await p.locator('[data-testid=print-tomorrow]').getAttribute('aria-pressed') === 'false' && await p.locator('[data-testid=print-today]').getAttribute('aria-pressed') === 'false', 'I2 une autre date : ni Aujourd’hui ni Demain enfoncé');
  await p.click('[data-testid=print-scope-month]');
  check(await label(p) === 'Novembre 2026' && await p.locator('[data-testid=print-prev]').getAttribute('aria-label') === 'Mois précédent', `I2 Jour (5 nov.) → Mois : « ${await label(p)} », ‹ « Mois précédent »`);
  await p.click('[data-testid=print-prev]');
  check(await label(p) === 'Octobre 2026', 'I2 ‹ : « Octobre 2026 »');
  await menuShot(p, 'impression-apres-menu-mois.png');
  await p.click('[data-testid=print-next]');
  check(await label(p) === 'Novembre 2026', 'I2 › : « Novembre 2026 »');
  await p.click('[data-testid=print-scope-week]');
  check(await label(p) === 'S-45 · 2 – 8 nov.', `I2 Novembre → Semaine : « ${await label(p)} » (semaine du 1er jeudi)`);
  await p.click('[data-testid=print-scope-month]'); await p.click('[data-testid=print-scope-day]');
  check(await p.locator('[data-testid=print-date]').inputValue() === '2026-11-01', 'I2 Mois (novembre) → Jour : le 1er');
  await p.keyboard.press('Escape');
  await p.click('button[aria-label="Semaine suivante"]'); await p.waitForTimeout(900);
  await openMenu(p); await p.click('[data-testid=print-scope-day]');
  check(await p.locator('[data-testid=print-date]').inputValue() === '2026-10-26', 'I2 écran en S-44 → Jour : le lundi 26 (aujourd’hui hors de la semaine)');
  await p.click('[data-testid=print-scope-month]');
  check(await label(p) === 'Octobre 2026', 'I2 S-44 → Jour 26 → Mois : octobre');
  await p.keyboard.press('Escape');

  // I15 (1440) le menu tient à l'écran, pour chaque type
  const fit = async (w) => {
    await openMenu(p); const res = [];
    for (const k of ['week', 'day', 'month']) {
      await p.click(`[data-testid=print-scope-${k}]`);
      res.push(await p.evaluate(() => {
        const m = document.querySelector('[data-testid=print-menu]').getBoundingClientRect();
        const cur = document.querySelector('[data-testid=print-period-label]');
        const kids = [...document.querySelectorAll('[data-testid=print-menu] *')].filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect());
        return { l: Math.round(m.left), r: Math.round(m.right), b: Math.round(m.bottom), inside: kids.every((x) => x.left >= m.left - 0.5 && x.right <= m.right + 0.5), page: document.documentElement.scrollWidth <= innerWidth, cut: cur ? cur.scrollWidth > cur.clientWidth : false, vh: innerHeight };
      }));
    }
    await p.keyboard.press('Escape');
    check(res.every((x) => x.l >= 0 && x.r <= w && x.b <= x.vh && x.inside && x.page && !x.cut), `I15 ${w} : menu entier à l’écran pour Semaine / Jour / Mois, libellé jamais coupé ${JSON.stringify(res.map((x) => [x.l, x.r, x.b]))}`);
  };
  await fit(1440);

  // I3 une autre semaine (‹) : écran en S-44, feuille de S-43 lue à part
  const g0 = gets.length;
  const title3 = await printWith(p, { moves: -1 });
  check(title3 === 'Planning S-43 – Entreprise Test', `I3 titre « ${title3} »`);
  const pg = getsOf('planning', g0), te = getsOf('time_entries', g0);
  check(pg.length >= 1 && pg[0].p.get('offset') === '0' && pg.every((g) => g.p.get('company_id') === `eq.${CO}` && g.p.getAll('work_date').join(' ') === 'gte.2026-10-19 lte.2026-10-25' && g.p.get('limit') === '500'),
    `I3 planning relu : entreprise + 19 → 25 oct., page de 500 (${pg.map((g) => g.q.replace(/select=[^&]*&?/, '')).join(' ; ')})`);
  check(pg.every((g) => /worksite:worksites/.test(g.p.get('select')) && !/user:users/.test(g.p.get('select'))), 'I3 sans la jointure salarié (la feuille ne la lit pas)');
  const st = [...new Set(te.map((g) => g.p.get('status')))].sort();
  check(same(st, ['eq.cancelled', 'eq.draft', 'in.(submitted,validated)'].sort()) && te.every((g) => g.p.get('company_id') === `eq.${CO}` && g.p.getAll('work_date').join(' ') === 'gte.2026-10-19 lte.2026-10-25'),
    `I3 heures relues : envoyées, brouillons, retirées — entreprise + mêmes dates (${st.join(', ')})`);
  await paper(p, async () => {
    check(await p.locator('.bt-print thead th.bt-pl-th').count() === 7 && await p.locator('.bt-print tbody tr').count() === 9, 'I3 7 jours × 9 salariés');
    const got = await readGrid(p, 'print');
    const bad = diffGrid(got, asPaper(screen43), (i) => S43[i].slice(8));
    check(bad.length === 0, `I3 la feuille = la grille de l’écran en S-43 (bulles, teintes, fonds, barres, textes, retirée, hors planning, absences)${bad.length ? `\n   ${bad.slice(0, 6).join('\n   ')}` : ''}`);
    check((await p.locator('[data-testid=print-what]').innerText()) === 'Planning · semaine 43 · 19 – 25 octobre 2026', 'I3 en-tête « Planning · semaine 43 · 19 – 25 octobre 2026 »');
    await shot(p, 'impression-apres-semaine-chargee.png', { fullPage: true });
  });
  await closePrint(p); await p.waitForTimeout(150);
  check(await p.locator('.bt-print').count() === 0, 'I3 après impression : feuille retirée');

  // I3 bis : S-42, jamais affichée — chantier archivé, heures sans créneau
  const g1 = gets.length;
  await printWith(p, { moves: -2 });
  const wsGet = gets.slice(g1).filter((g) => g.t === 'worksites' && g.p.get('id'));
  // Les chantiers cités par des heures sans créneau : l'archivé, et Atelier Fictif (aucune bulle en S-42).
  check(wsGet.length === 1 && wsGet[0].p.get('id') === 'in.(w4,w6)' && wsGet[0].p.get('select') === 'id,client_name' && wsGet[0].p.get('company_id') === `eq.${CO}`, `I3 S-42 : noms des chantiers sans bulle lus, archivé compris (entreprise + id) (${wsGet.map((g) => decodeURIComponent(g.q)).join(' ; ')})`);
  await paper(p, async () => {
    const got = await readGrid(p, 'print');
    check(same(got['Bruno Essai'][3].extra, ['Hangar Sample 4h00 · ajouté par le salarié']), `I3 S-42 jeudi 15 : chantier archivé écrit en entier, pas « Autre » (${JSON.stringify(got['Bruno Essai'][3].extra)})`);
    check(same(got['Alex Test'][2].extra, ['Atelier Fictif 4h00 · ajouté par le salarié']) && got['Alex Test'][2].bubs.length === 0, `I3 S-42 mercredi 14 : heures sans créneau → « ajouté par le salarié » (${JSON.stringify(got['Alex Test'][2].extra)})`);
    check(!(await p.locator('.bt-print').innerText()).includes('Chantier Tiers'), 'I3 S-42 : rien de l’autre entreprise');
  });
  await closePrint(p);

  // I4 Jour + Demain hors de la semaine affichée (écran en S-44), lecture lente
  const n4 = await printed(p); const w4 = nonGet.length; const g4 = gets.length;
  fault = { match: (t, q) => t === 'planning' && q.getAll('work_date').includes('gte.2026-10-22'), delay: 1200 };
  await openMenu(p); await p.click('[data-testid=print-scope-day]'); await p.click('[data-testid=print-tomorrow]');
  await p.click('[data-testid=print-go]');
  await p.waitForFunction(() => document.querySelector('[data-testid=print-go]')?.textContent.includes('Préparation'), null, { timeout: 3000 });
  const busy = await p.evaluate(() => { const g = document.querySelector('[data-testid=print-go]'); return { txt: g.textContent.trim(), dis: g.disabled, aria: g.getAttribute('aria-busy'), fs: document.querySelector('.bt-pl-pr-fs').disabled, spin: !!g.querySelector('.animate-spin') }; });
  check(busy.txt === 'Préparation…' && busy.dis && busy.aria === 'true' && busy.fs && busy.spin, `I4 pendant la lecture : « Préparation… », bouton inactif, aria-busy, options figées ${JSON.stringify(busy)}`);
  const foot = await p.evaluate(() => ({ note: document.querySelector('.bt-pl-pr-note').textContent, go: Math.round(document.querySelector('[data-testid=print-go]').getBoundingClientRect().height), lines: document.querySelector('[data-testid=print-go]').getClientRects().length }));
  check(foot.note === '' && foot.go === 32, `I4 pendant la lecture, la note s’efface : « Préparation… » sur une ligne ${JSON.stringify(foot)}`);
  await menuShot(p, 'impression-apres-menu-preparation.png');
  check(await printed(p) === n4, 'I4 rien n’est imprimé avant la fin de la lecture');
  await p.waitForFunction((n) => (window.__printed || 0) === n + 1, n4, { timeout: 8000 }); await p.waitForTimeout(150);
  fault = null; printNonGet += nonGet.length - w4;
  const title4 = await p.evaluate(() => window.__title);
  check(title4 === 'Planning jeudi 22 octobre – Entreprise Test' && await p.locator('[data-testid=print-menu]').count() === 0, `I4 puis print() : « ${title4} », menu fermé`);
  check(getsOf('planning', g4).every((g) => g.p.getAll('work_date').join(' ') === 'gte.2026-10-22 lte.2026-10-22'), 'I4 lecture du seul 22 octobre');
  await paper(p, async () => {
    check(await p.locator('.bt-print thead th.bt-pl-th').count() === 1 && await p.locator('.bt-print tbody tr').count() === 9 && await p.locator('.bt-print--day').count() === 1, 'I4 une colonne, 9 lignes');
    check((await p.locator('[data-testid=print-what]').innerText()) === 'Jeudi 22 octobre 2026 · semaine 43', `I4 en-tête « ${await p.locator('[data-testid=print-what]').innerText()} »`);
    const got = await readGrid(p, 'print'); const want = asPaper(screen43);
    const bad = Object.keys(want).filter((n) => !same(got[n]?.[0], want[n][3]));
    check(bad.length === 0, `I4 chaque case = la colonne « jeudi 22 » de l’écran${bad.length ? ` (écarts : ${bad.join(', ')})` : ''}`);
    await shot(p, 'impression-apres-jour-demain.png', { fullPage: true });
  });
  await closePrint(p);

  // I5 un jour de la semaine affichée : rien n'est relu (écran revenu en S-43)
  await p.click('button[aria-label="Semaine précédente"]'); await p.waitForTimeout(900);
  const g5 = gets.length;
  const title5 = await printWith(p, { kind: 'day', date: '2026-10-20' });
  check(getsOf('planning', g5).length === 0 && getsOf('time_entries', g5).length === 0, `I5 mardi 20 (semaine affichée) : rien relu, les données de l’écran`);
  await paper(p, async () => {
    const got = await readGrid(p, 'print'); const want = asPaper(screen43);
    check(title5 === 'Planning mardi 20 octobre – Entreprise Test' && Object.keys(want).every((n) => same(got[n]?.[0], want[n][1])), `I5 feuille du lot 3 : « ${title5} », cases = colonne « mardi 20 »`);
  });
  await closePrint(p);

  // I6 mois d'octobre
  const g6 = gets.length;
  const title6 = await printWith(p, { kind: 'month' });
  check(title6 === 'Planning octobre 2026 – Entreprise Test', `I6 titre « ${title6} »`);
  check(getsOf('planning', g6).length >= 1 && getsOf('planning', g6).every((g) => g.p.getAll('work_date').join(' ') === 'gte.2026-10-01 lte.2026-10-31'), 'I6 lecture du 1er au 31 octobre');
  await paper(p, async () => {
    check(await p.locator('.bt-print--month [data-testid=print-m-day]').count() === 31 && await p.locator('[data-testid=print-m-row]').count() === 9, 'I6 31 jours × 9 salariés');
    const m = await readMonth(p);
    const cell = (n, iso) => m[n][iso];
    const b = (n, iso) => cell(n, iso).b.map((x) => `${x.code}:${x.st}:${x.c ?? '-'}`);
    check(same(b('Alex Test', D_(19)), ['VE:real:-', 'RT:planned:apres-midi']) && cell('Alex Test', D_(19)).b[0].bg === BG.reel, `I6 Alex 19 : « VE » envoyé (noir), « RT » après-midi (${b('Alex Test', D_(19))})`);
    check(same(b('Bruno Essai', D_(20)), ['VE:planned:apres-midi', 'AF:planned:soir']) && cell('Bruno Essai', D_(20)).b[1].bg === BG.soir, `I6 Bruno 20 : « VE » après-midi, « AF » soir (${b('Bruno Essai', D_(20))})`);
    check(same(b('Alex Test', D_(21)), ['VE:planned:matin']), 'I6 Alex 21 (en cours à l’écran) : sa teinte « matin » sur papier');
    check(same(b('Eli Fictif', D_(21)), ['MD:draft:soir']) && same(b('Eli Fictif', D_(19)), ['RT:planned:-', 'AU:extra:-']), `I6 Eli : brouillon 18–20 « soir » ; 19 : sans horaire (blanc) + heures sans chantier « AU » (${b('Eli Fictif', D_(19))})`);
    check(cell('Dina Démo', D_(22)).abs === 'A' && cell('Dina Démo', D_(23)).abs === 'A', 'I6 Dina 22 et 23 (maladie) : « A »');
    const txt = await p.locator('.bt-print').innerText();
    check(!/Maladie|maladie/.test(txt) && !txt.includes('🤒'), 'I6 ni « Maladie » ni 🤒 sur la feuille');
    check(['20', '30', '31'].every((d) => cell('Eli Fictif', D_(Number(d))).abs === 'C'), 'I6 Eli 20, 30 et 31 : « C »');
    check(same(b('Alex Test', D_(14)), ['AF:extra:-']), `I6 Alex 14 : heures sans créneau « AF » (${b('Alex Test', D_(14))})`);
    check(same(b('Bruno Essai', D_(15)), ['HS:extra:-']), `I6 Bruno 15 : chantier archivé « HS », pas « AU » (${b('Bruno Essai', D_(15))})`);
    const fo = cell('Fanny Modèle', D_(23)).b[0];
    check(fo && fo.st === 'off' && fo.deco === 'line-through' && fo.bg === BG.white && fo.code === 'AF', `I6 Fanny 23 : retirée par le salarié, éteinte et barrée (${JSON.stringify(fo)})`);
    check(same(b('Gabin Témoin', D_(23)), ['AF:planned:matin', 'VE:planned:apres-midi']), `I6 Gabin 23 : « matin » prévu, le brouillon vide ignoré (${b('Gabin Témoin', D_(23))})`);
    check(same(b('Bruno Essai', D_(31)), ['MD:planned:soir']) && same(b('Alex Test', D_(1)), ['VE:planned:matin']) && !m['Chloé Exemple'][ISO(11, 1)], 'I6 Bruno samedi 31 (soir) et Alex le 1er (matin) présents ; Chloé 1er novembre hors feuille');
    check(m['Alex Test'][D_(6)].b.length === 0 && m['Alex Test'][D_(7)].b.length === 0 && !txt.includes('Chantier Tiers'), 'I6 rien de l’autre entreprise (Alex 6 et 7 vides)');
    check(same(b('Fanny Modèle', D_(19)), ['FS:planned:matin']), 'I6 Fanny 19 : « Autre » prévu → la note « Formation sécurité » (FS)');
    const key = await p.locator('[data-testid=print-m-key] [data-code]').evaluateAll((l) => l.map((e) => e.textContent.replace(/^ · /, '').trim()));
    check(same(key, ['AF Atelier Fictif', 'AU Autre', 'FS Formation sécurité', 'HS Hangar Sample', 'MD Maison Démo', 'RT Résidence Test', 'VE Villa Exemple']) && (await p.locator('[data-testid=print-m-key]').innerText()).startsWith('Chantiers :'),
      `I6 clé « Chantiers : » exacte, triée par code (${key.join(' · ')})`);
    const days = await p.locator('[data-testid=print-m-day]').evaluateAll((l) => l.map((e) => ({ t: e.innerText.replace(/\s+/g, ''), we: e.classList.contains('we'), bg: getComputedStyle(e).backgroundColor })));
    check(days[0].t === 'J1' && days[2].t === 'S3' && days[2].we && days[3].we && !days[4].we && days[2].bg === 'rgb(244, 241, 234)' && days.filter((d) => d.we).length === 9, `I6 jours « J 1 … », samedis et dimanches grisés (9) (${days.slice(0, 5).map((d) => d.t).join(' ')})`);
    const leg = await p.locator('.bt-print--month .bt-print-leg').innerText();
    check(/Noir : heures envoyées/.test(leg) && /C congé · I intempérie · A absent · R repos/.test(leg) && await p.locator('.bt-print--month .bt-print-sw').count() === 3, 'I6 légende : 3 créneaux, noir = envoyé, C · I · A · R');
    check((await p.locator('.bt-print--month [data-testid=print-what]').innerText()) === 'Planning · octobre 2026', 'I6 en-tête « Planning · octobre 2026 »');
    const nm = await p.locator('[data-testid=print-m-row] td.n', { hasText: 'Maximilien' }).evaluate((e) => ({ t: e.textContent, cut: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1 }));
    check(nm.t === LONG && !nm.cut, 'I6 nom long en entier, jamais coupé');
    await shot(p, 'impression-apres-mois-octobre.png', { fullPage: true });
  });
  const pdfOct = await p.pdf(PDF_OPTS);
  fs.writeFileSync(path.join(SH, 'impression-apres-mois-octobre.pdf'), pdfOct);
  const iOct = pdfInfo(pdfOct);
  check(a4Land(iOct) && iOct.pages === 1, `I6 PDF : A4 paysage, ${iOct.pages} page (9 salariés)`);

  // I7 novembre
  await printWith(p, { kind: 'month', moves: 1 });
  await paper(p, async () => {
    const m = await readMonth(p);
    check(await p.locator('[data-testid=print-m-day]').count() === 30 && (await p.locator('[data-testid=print-what]').innerText()) === 'Planning · novembre 2026', 'I7 novembre : 30 jours');
    check(same(m['Chloé Exemple'][ISO(11, 1)].b.map((x) => `${x.code}:${x.st}:${x.bg}`), [`RT:planned:${BG.white}`]) && m['Eli Fictif'][ISO(11, 1)].abs === 'C' && m['Eli Fictif'][ISO(11, 2)].abs === 'C', 'I7 Chloé le 1er (sans horaire, blanc), Eli « C » le 1er et le 2');
    await shot(p, 'impression-apres-mois-novembre-30j.png', { fullPage: true });
  });
  await closePrint(p);

  // I8 tient en largeur : octobre + signature, papier 1062 × 733
  await printWith(p, { kind: 'month', signature: true });
  await paper(p, async () => {
    const r = await p.evaluate(() => {
      const t = document.querySelector('[data-testid=print-month]').getBoundingClientRect();
      const ths = [...document.querySelectorAll('[data-testid=print-m-day]')].map((e) => e.getBoundingClientRect().width);
      const last = document.querySelector('[data-testid=print-month] thead tr:last-child th:last-child');
      const clipped = [...document.querySelectorAll('[data-testid=print-m-slot], [data-testid=print-m-abs]')].filter((e) => e.scrollWidth > e.clientWidth + 0.5).length;
      return { w: t.width, dmin: Math.min(...ths), last: last.textContent.trim(), lw: last.getBoundingClientRect().width, clipped, rows: [...document.querySelectorAll('[data-testid=print-m-row]')].map((e) => e.getBoundingClientRect().height) };
    });
    check(r.w <= 1062 + 1, `I8 la grille du mois tient dans un A4 paysage (${Math.round(r.w)} px ≤ 1062)`);
    check(r.dmin >= 28, `I8 colonne d’un jour ≥ 28 px avec signature (${r.dmin.toFixed(1)} px)`);
    check(r.clipped === 0, `I8 aucun code coupé (${r.clipped})`);
    check(r.last === 'Signature' && r.lw >= 60, `I8 dernière colonne « Signature », ${Math.round(r.lw)} px`);
    check(Math.min(...r.rows) >= 29, `I8 avec signature, lignes d’au moins 8 mm (${Math.round(Math.min(...r.rows))} px)`);
  });
  // I12 portrait (navigateur qui ignore @page) : le mois reste dans la page
  await paper(p, async () => {
    const w = await p.locator('[data-testid=print-month]').evaluate((e) => e.getBoundingClientRect().width);
    check(w <= 718 + 1 && await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `I12 portrait 718 px : la grille du mois tient (${Math.round(w)} px)`);
    await shot(p, 'impression-apres-mois-portrait.png', { fullPage: true });
  }, { w: 718, h: 1047 });
  await closePrint(p);

  // I10 lecture en échec : rien d'imprimé, le menu reste ouvert, on peut réessayer
  const n10 = await printed(p);
  fault = { match: (t, q) => t === 'planning' && q.getAll('work_date').includes('gte.2026-12-01'), status: 500 };
  await openMenu(p); await p.click('[data-testid=print-scope-month]'); await p.click('[data-testid=print-next]'); await p.click('[data-testid=print-next]');
  check(await label(p) === 'Décembre 2026', 'I10 « Décembre 2026 »');
  await p.click('[data-testid=print-go]');
  await p.waitForFunction(() => [...document.querySelectorAll('[data-sonner-toast]')].some((t) => /Impossible de préparer l'impression/.test(t.textContent)), null, { timeout: 8000 });
  await p.waitForTimeout(300);
  const t10 = await toastText(p);
  const go10 = await p.evaluate(() => { const g = document.querySelector('[data-testid=print-go]'); return { txt: g?.textContent.trim(), dis: g?.disabled, focus: document.activeElement === g }; });
  check(/Impossible de préparer l'impression\. Réessayez\./.test(t10) && await p.locator('[data-testid=print-menu]').count() === 1, `I10 panne : « ${t10} », menu toujours ouvert`);
  check(await printed(p) === n10 && await p.locator('.bt-print').count() === 0, 'I10 rien d’imprimé, aucune feuille montée');
  check(go10.txt === 'Imprimer' && !go10.dis && go10.focus && await label(p) === 'Décembre 2026', `I10 « Imprimer » de nouveau actif et focalisé, période gardée ${JSON.stringify(go10)}`);
  await p.mouse.move(5, 895); await shot(p, 'impression-apres-menu-erreur.png'); // écran entier : le message est en bas
  fault = null;
  // Échap pendant une lecture lente : plus rien ne s'imprime ensuite
  fault = { match: (t, q) => t === 'planning' && q.getAll('work_date').includes('gte.2026-12-01'), delay: 1200 };
  await p.click('[data-testid=print-go]');
  await p.waitForFunction(() => document.querySelector('[data-testid=print-go]')?.textContent.includes('Préparation'), null, { timeout: 3000 });
  await p.keyboard.press('Escape'); await p.waitForTimeout(1800);
  check(await p.locator('[data-testid=print-menu]').count() === 0 && await printed(p) === n10 && await p.locator('.bt-print').count() === 0, 'I10 Échap pendant la lecture : menu fermé, rien d’imprimé après la réponse');
  // Clic sur l'icône 🖨 (fermer) pendant la lecture : idem
  await openMenu(p); await p.click('[data-testid=print-scope-month]'); await p.click('[data-testid=print-next]'); await p.click('[data-testid=print-next]');
  await p.click('[data-testid=print-go]'); await p.waitForTimeout(200);
  await p.click('.bt-pl-ddbackdrop', { position: { x: 20, y: 600 } }); await p.waitForTimeout(1800);
  check(await p.locator('[data-testid=print-menu]').count() === 0 && await printed(p) === n10 && await p.locator('.bt-print').count() === 0, 'I10 clic en dehors pendant la lecture : rien d’imprimé');
  await openMenu(p);
  check(await p.locator('[data-testid=print-go]').isEnabled() && await p.locator('.bt-pl-pr-fs').evaluate((e) => !e.disabled), 'I10 rouvert ensuite : menu utilisable (plus « Préparation… »)');
  await p.keyboard.press('Escape');
  fault = null;

  // I11 Ctrl+P : la semaine affichée (écran en S-44)
  await p.click('button[aria-label="Semaine suivante"]'); await p.waitForTimeout(900);
  await p.evaluate(() => { window.__bp = []; window.addEventListener('beforeprint', () => window.__bp.push({ rows: document.querySelectorAll('.bt-print tbody tr').length, kind: document.querySelector('.bt-print')?.className || null, what: document.querySelector('[data-testid=print-what]')?.textContent || null, title: document.title, menu: !!document.querySelector('[data-testid=print-menu]') })); });
  const w11 = nonGet.length;
  const pCtrl = await p.pdf(PDF_OPTS);
  const bp = await p.evaluate(() => window.__bp);
  check(bp[0] && bp[0].rows === 9 && /bt-print--week/.test(bp[0].kind) && bp[0].title === 'Planning S-44 – Entreprise Test' && /26 octobre – 1 novembre 2026/.test(bp[0].what), `I11 Ctrl+P en S-44 : la semaine affichée (${JSON.stringify(bp[0])})`);
  fs.writeFileSync(path.join(SH, 'impression-apres-ctrl-p-semaine-affichee.pdf'), pCtrl);
  check(a4Land(pdfInfo(pCtrl)) && await p.locator('.bt-print').count() === 0, 'I11 PDF A4 paysage ; feuille retirée après');
  // Après un mois imprimé puis refermé, Ctrl+P imprime de nouveau la semaine
  await printWith(p, { kind: 'month' }); await closePrint(p); await p.waitForTimeout(150);
  await p.pdf(PDF_OPTS);
  const bp2 = (await p.evaluate(() => window.__bp)).at(-1);
  check(/bt-print--week/.test(bp2.kind) && bp2.rows === 9 && bp2.title === 'Planning S-44 – Entreprise Test', `I11 après un mois : Ctrl+P = la semaine affichée (${bp2.kind})`);
  // Pendant une lecture (menu « Préparation… ») : Ctrl+P ferme le menu, une seule impression
  const n11 = await printed(p);
  fault = { match: (t, q) => t === 'planning' && q.getAll('work_date').includes('gte.2026-10-01'), delay: 1500 };
  await openMenu(p); await p.click('[data-testid=print-scope-month]'); await p.click('[data-testid=print-go]');
  await p.waitForFunction(() => document.querySelector('[data-testid=print-go]')?.textContent.includes('Préparation'), null, { timeout: 3000 });
  await p.pdf(PDF_OPTS);
  const bp3 = (await p.evaluate(() => window.__bp)).at(-1);
  await p.waitForTimeout(2200); fault = null;
  check(/bt-print--week/.test(bp3.kind) && !bp3.menu, `I11 Ctrl+P pendant une lecture : menu fermé, feuille de la semaine (${JSON.stringify(bp3)})`);
  check(await printed(p) === n11 && await p.locator('.bt-print').count() === 0, 'I11 … et la réponse tardive n’imprime rien (pas de double impression)');
  // Semaine pas encore chargée (lecture lente de S-45) : pas de feuille, le navigateur imprime comme avant
  fault = { match: (t, q) => t === 'planning' && q.getAll('work_date').includes('gte.2026-11-02'), delay: 1800 };
  await p.click('button[aria-label="Semaine suivante"]'); await p.waitForTimeout(150);
  await p.pdf(PDF_OPTS);
  const bp4 = (await p.evaluate(() => window.__bp)).at(-1);
  check(bp4.rows === 0 && bp4.kind === null, `I11 semaine S-45 pas encore chargée : aucune feuille (${JSON.stringify(bp4)})`);
  await p.waitForTimeout(2200); fault = null;
  await p.pdf(PDF_OPTS);
  const bp5 = (await p.evaluate(() => window.__bp)).at(-1);
  check(/bt-print--week/.test(bp5.kind) && bp5.title === 'Planning S-45 – Entreprise Test', `I11 une fois chargée : la semaine S-45 (${bp5.title})`);
  printNonGet += nonGet.length - w11;
  await ctx.close();
}

// ═══ I15 1024 + capture du menu ══════════════════════════════════════════════════
{
  const { ctx, p } = await newPage(1024, 768);
  await openMenu(p); const res = [];
  for (const k of ['week', 'day', 'month']) {
    await p.click(`[data-testid=print-scope-${k}]`);
    res.push(await p.evaluate(() => { const m = document.querySelector('[data-testid=print-menu]').getBoundingClientRect(); const cur = document.querySelector('[data-testid=print-period-label]'); return { l: Math.round(m.left), r: Math.round(m.right), b: Math.round(m.bottom), page: document.documentElement.scrollWidth <= innerWidth, cut: cur ? cur.scrollWidth > cur.clientWidth : false }; }));
  }
  check(res.every((x) => x.l >= 0 && x.r <= 1024 && x.b <= 768 && x.page && !x.cut), `I15 1024 : menu entier à l’écran pour Semaine / Jour / Mois ${JSON.stringify(res.map((x) => [x.l, x.r, x.b]))}`);
  await p.click('[data-testid=print-scope-week]'); await menuShot(p, 'impression-apres-menu-1024.png');
  await p.keyboard.press('Escape');
  await ctx.close();
}

// ═══ I9 40 salariés, mois + signature : pagination, en-tête répété, PDF ══════════
{
  const { ctx, p } = await newPage(1440, 900, { big: true });
  const db = fresh(true);
  const octRows = db.planning.filter((x) => x.work_date >= '2026-10-01' && x.work_date <= '2026-10-31');
  const g9 = gets.length;
  await printWith(p, { kind: 'month', signature: true });
  const offs = getsOf('planning', g9).map((g) => Number(g.p.get('offset'))).sort((x, y) => x - y);
  const want = []; for (let o = 0; o < octRows.length; o += 500) want.push(o); want.push(octRows.length);
  check(same(offs, want), `I9 planning lu par pages de 500 : offsets ${offs.join(', ')} (${octRows.length} lignes)`);
  await paper(p, async () => {
    const r = await p.evaluate(() => ({
      rows: document.querySelectorAll('[data-testid=print-m-row]').length,
      thead: getComputedStyle(document.querySelector('[data-testid=print-month] thead')).display,
      avoid: [...document.querySelectorAll('[data-testid=print-m-row]')].every((tr) => getComputedStyle(tr).breakInside === 'avoid'),
      blocks: document.querySelectorAll('[data-testid=print-m-slot]').length,
      real: document.querySelectorAll('[data-testid=print-m-slot][data-state=real]').length,
    }));
    check(r.rows === 40 && r.thead === 'table-header-group' && r.avoid, `I9 40 lignes, en-tête répété (${r.thead}), aucune ligne coupée (break-inside: avoid)`);
    check(r.blocks === octRows.length && r.real === db.time_entries.length, `I9 rien de tronqué : ${r.blocks} blocs = ${octRows.length} interventions, ${r.real} envoyées`);
    await shot(p, 'impression-apres-mois-40-salaries-ecran.png', { clip: { x: 0, y: 0, width: 1062, height: 733 } });
  });
  const pdf9 = await p.pdf(PDF_OPTS);
  const i9 = pdfInfo(pdf9);
  fs.writeFileSync(path.join(SH, 'impression-apres-mois-40-salaries-signature.pdf'), pdf9);
  check(a4Land(i9) && i9.pages === 2, `I9 PDF : chaque page A4 paysage, ${i9.pages} pages (40 salariés + signature)`);
  await ctx.close();
}

// ═══ I11 téléphone 390×844 : Ctrl+P imprime le jour affiché ══════════════════════
{
  const { ctx, p } = await newPage(390, 844, { mobile: true });
  await p.evaluate(() => { window.__bp = []; window.addEventListener('beforeprint', () => window.__bp.push({ kind: document.querySelector('.bt-print')?.className || null, cols: document.querySelectorAll('.bt-print thead th.bt-pl-th').length, rows: document.querySelectorAll('.bt-print tbody tr').length, title: document.title })); });
  const w = nonGet.length;
  const pdf = await p.pdf(PDF_OPTS);
  printNonGet += nonGet.length - w;
  const bp = await p.evaluate(() => window.__bp);
  check(bp[0] && /bt-print--day/.test(bp[0].kind) && bp[0].cols === 1 && bp[0].rows === 9 && bp[0].title === 'Planning mercredi 21 octobre – Entreprise Test', `I11 téléphone : Ctrl+P = le jour affiché (${JSON.stringify(bp[0])})`);
  check(a4Land(pdfInfo(pdf)), 'I11 téléphone : PDF A4 paysage');
  await ctx.close();
}

// ═══ I13, I14 ════════════════════════════════════════════════════════════════════
// Les lectures faites pour imprimer : planning / heures (triées date puis id) et noms de chantiers.
const scoped = gets.filter((g) => (['planning', 'time_entries'].includes(g.t) && /id\.asc/.test(g.p.get('order') || '')) || (g.t === 'worksites' && g.p.get('id')));
const unscoped = scoped.filter((g) => g.p.get('company_id') !== `eq.${CO}`);
check(scoped.length > 0 && unscoped.length === 0, `I13 chaque lecture planning / heures / chantiers filtrée sur l’entreprise (${scoped.length} lectures${unscoped.length ? ` ; sans filtre : ${unscoped.slice(0, 3).map((g) => `${g.t}?${g.q}`).join(' ; ')}` : ''})`);
check(printNonGet === 0, `I14 imprimer n’écrit rien : aucune requête hors GET pendant les impressions (${printNonGet})`);
console.log(`   (pour mémoire : requêtes hors GET de l’écran pendant tout le test : ${nonGet.length})`);
console.log(`\n${ok} ✅ / ${ko} ❌`);
fs.rmSync(TMP, { recursive: true, force: true });
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
