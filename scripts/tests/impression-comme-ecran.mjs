// Lancer : node scripts/tests/impression-comme-ecran.mjs out [dossier des captures et des PDF, défaut : temporaire] [port] (après npm run build).
// Captures « avant » : AVANT=1 node scripts/tests/impression-comme-ecran.mjs <build d'avant> <dossier> [port]
// (PDF et captures de l'écran seulement, aucune vérification). playwright-core doit être résoluble.
// Les PDF écrits dans le dossier (impression-*.pdf) se rastérisent à part, hors du dépôt.
//
// « Imprimer comme à l'écran » — la feuille PDF du planning est le planning de l'écran, sans
// la barre d'outils : sur la VRAIE page /admin (base simulée, horloge figée au mercredi 21 octobre 2026,
// 10:00 à Paris ; aucun appel réseau réel, rien n'est écrit), mesuré sur les PDF réels :
//   C1 bandeau : la barre noire de l'écran — logo BEMEXO à gauche (image chargée, texte alternatif), la période
//      au centre, la pastille de l'entreprise à droite (nom + logo s'il y en a un, sinon le nom seul) ;
//      aucune barre d'outils, aucun bouton, aucun « + », aucun statut, aucun jour surligné, aucune sélection ;
//   C2 lignes équilibrées : un salarié à 5 cartes et deux sans carte → aucune ligne ne dépasse 2,2 × la plus petite,
//      aucun grand vide sous des cartes (≤ 8 mm hors minimum), mesuré sur le DESSIN du PDF (traits des lignes) ;
//   C3 une page quand elle tient (semaine, jour, mois), plusieurs pages sinon avec l'en-tête des colonnes répété,
//      lignes jamais coupées, marges de 10 mm sur chaque page ; texte ≥ 7 pt (nom d'une carte) ;
//   C4 en-têtes et pieds de page du navigateur : sur une page, rien dans les 10 mm du haut et du bas hors du dessin
//      (page.pdf avec displayHeaderFooter : le navigateur écrit sa date, son titre, l'adresse et « 1/1 » dans la
//      marge — témoin positif avec les marges de 10 mm, absents avec @page margin:0) ; sur plusieurs pages, les marges
//      de 10 mm de chaque page sont gardées ;
//   C5 photos : la feuille attend les photos des salariés avant d'imprimer (lente : on attend ; bloquée : 2 s puis on
//      imprime quand même ; cassée : les initiales), sans photo : les initiales sur la pastille de couleur ;
//   C6 la parité carte par carte avec l'écran (fonds, motifs, bordures, polices, tailles) est dans impression-cadre.mjs (K5) ; ici : bandeau = barre noire de l'écran ;
//   C7 captures : l'écran (ecran-*.png) et le PDF (impression-*.pdf) de cinq cas — semaine à 5 cartes, jour, mois, 22 salariés, signature —
//      sont rangés dans docs/captures-impression-comme-ecran/ ; le PDF se rastérise à part (hors du dépôt) pour le mettre à côté de l'écran.
//   C8 la feuille est chargée à part : pas dans le premier chargement de /admin ; fichier inaccessible → message, Ctrl+P comme avant, le clic suivant réessaie.
import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import zlib from 'node:zlib'; import { chromium } from 'playwright-core';
const [,, OUT, SH = fs.mkdtempSync(path.join(os.tmpdir(), 'impression-comme-ecran-')), PORT = '5323'] = process.argv; fs.mkdirSync(SH, { recursive: true });
const AVANT = process.env.AVANT === '1';
const ONLY = process.env.ONLY; // ONLY=<id d'un cas> : ne joue que ce cas (mise au point)
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT), r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ─── Horloge figée : mercredi 21 octobre 2026, 10:00 (Paris) — semaine 43 ────────
const NOW = new Date('2026-10-21T10:00:00+02:00');
const D_ = (d) => `2026-10-${String(d).padStart(2, '0')}`;
const WEEK = [19, 20, 21, 22, 23, 24, 25];

// ─── Base simulée ────────────────────────────────────────────────────────────────
const CO = 'c0000000-0000-0000-0000-000000000001';
const ws = (id, client_name, city, product_type = null) => ({ id, company_id: CO, client_name, city, product_type, is_active: true });
const W1 = ws('w1', 'Villa Exemple', 'Lyon', 'Fenêtres'), W2 = ws('w2', 'Résidence Test', 'Villeurbanne', 'Portail'), W3 = ws('w3', 'Maison Démo', 'Bron', 'Volets'), W4 = ws('w4', 'Atelier Fictif', 'Vénissieux');
const WS = { w1: W1, w2: W2, w3: W3, w4: W4 };
const u = (id, first_name, last_name, role = 'worker', extra = {}) => ({ id, company_id: CO, first_name, last_name, role, email: `${id}@exemple.fr`, is_active: true, created_at: '2026-01-01', ...extra });
const LONG = 'Maximilien-Alexandre De La Fontaine-Beaumarchais';
const PHOTO = { ok: '/apple-touch-icon.png', cors: 'https://photos.exemple.test/cors/photo.png', sanscors: 'https://photos.exemple.test/sans/photo.png', lente: '/photo-lente.png', bloquee: '/photo-bloquee.png', cassee: '/photo-cassee.png' };

let seq = 0;
const slotAt = (id, user_id, date, w, start, end, extra = {}) => ({ id, company_id: CO, user_id, worksite_id: w?.id ?? null, work_date: date, absence_type: null, estimated_start: start, estimated_end: end,
  notes: null, position: null, added_by_worker: false, created_by: 'u-admin', created_at: new Date(Date.UTC(2026, 9, 1, 6, 0, seq++)).toISOString(), ...extra });
const entry = (id, user_id, date, w, status, start, end, minutes, extra = {}) => ({ id, company_id: CO, user_id, work_date: date, worksite_id: w?.id ?? null, planning_id: null, status, start_time: start, end_time: end, total_minutes: minutes, break_minutes: 0, reception: null, reserve_resolved_at: null, reserve_fixed_at: null, observation: null, locked: false, submitted_at: status === 'draft' ? null : `${date}T18:00:00Z`, ...extra });

// Les scénarios. « eq » = le cas du patron : le 1er salarié a 5 cartes le lundi (et 4 ou 5 interventions sur sa semaine),
// les deux suivants n'ont rien.
const W9 = [u('u-alex', 'Alex', 'Test'), u('u-bruno', 'Bruno', 'Essai'), u('u-chloe', 'Chloé', 'Exemple'), u('u-dina', 'Dina', 'Démo'), u('u-eli', 'Eli', 'Fictif'),
  u('u-fanny', 'Fanny', 'Modèle'), u('u-gabin', 'Gabin', 'Témoin'), u('u-hugo', 'Hugo', 'Proto'), u('u-max', 'Maximilien-Alexandre', 'De La Fontaine-Beaumarchais')];
const FN = ['Inès', 'Jules', 'Karim', 'Léa', 'Marc', 'Nina', 'Oscar', 'Paula', 'Quentin', 'Rose', 'Sami', 'Tara', 'Yann'];
const EQ = [u('u-alex', 'Alex', 'Test'), u('u-bruno', 'Bruno', 'Essai'), u('u-chloe', 'Chloé', 'Exemple')];
const SLOTS_EQ = [
  slotAt('q1', 'u-alex', D_(19), W1, '07:00:00', '09:00:00'), slotAt('q2', 'u-alex', D_(19), W2, '09:30:00', '12:00:00'), slotAt('q3', 'u-alex', D_(19), W3, '13:30:00', '15:00:00'),
  slotAt('q4', 'u-alex', D_(19), W4, '15:00:00', '17:00:00'), slotAt('q5', 'u-alex', D_(19), W1, '18:00:00', '21:00:00'),
  slotAt('q6', 'u-alex', D_(20), W2, '08:00:00', '12:00:00'), slotAt('q7', 'u-alex', D_(20), W3, '13:30:00', '17:00:00'), slotAt('q8', 'u-alex', D_(21), W4, null, null),
  slotAt('q9', 'u-alex', D_(22), W1, '08:00:00', '12:00:00'),
];
const SLOTS_STD = [
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
];
const W22 = [...W9, ...FN.map((f, i) => u(`u-n${i}`, f, 'Équipe'))];
const SLOTS_MANY = [...SLOTS_STD,
  ...FN.flatMap((_, i) => WEEK.slice(0, 5).flatMap((d) => (i + d) % 4 === 0 ? [] : [
    slotAt(`p-n${i}-${d}`, `u-n${i}`, D_(d), [W1, W2, W3, W4][(i + d) % 4], (i + d) % 3 === 0 ? '08:00:00' : (i + d) % 3 === 1 ? '13:30:00' : '18:00:00', (i + d) % 3 === 0 ? '12:00:00' : (i + d) % 3 === 1 ? '17:00:00' : '21:00:00')])),
  ...[22, 23].map((d) => slotAt(`p-nc${d}`, 'u-n3', D_(d), null, null, null, { absence_type: 'conge' })),
];
const ENTRIES_STD = [
  entry('e-a1', 'u-alex', D_(19), W1, 'submitted', '08:00:00', '12:00:00', 240, { planning_id: 'p-a1' }),
  entry('e-b2', 'u-bruno', D_(20), W1, 'validated', '07:00:00', '13:00:00', 360, { planning_id: 'p-b2' }),
  entry('e-e3', 'u-eli', D_(21), W3, 'draft', '18:00:00', '20:00:00', 120, { planning_id: 'p-e3' }),
  entry('e-e1', 'u-eli', D_(19), null, 'submitted', '15:00:00', '16:00:00', 60),
];
const ENTRIES_EQ = [entry('e-q1', 'u-alex', D_(19), W1, 'submitted', '07:00:00', '09:00:00', 120, { planning_id: 'q1' })];
// « eqs » : les mêmes 5 interventions ÉTALÉES sur la semaine (au plus 2 par jour) — le cas « 4 ou 5 interventions sur son planning ».
const SLOTS_EQS = [
  slotAt('s1', 'u-alex', D_(19), W1, '07:00:00', '09:00:00'), slotAt('s2', 'u-alex', D_(19), W2, '13:30:00', '17:00:00'), slotAt('s3', 'u-alex', D_(20), W3, '08:00:00', '12:00:00'),
  slotAt('s4', 'u-alex', D_(22), W4, '18:00:00', '21:00:00'), slotAt('s5', 'u-alex', D_(23), W1, null, null),
];
// « tight » : juste trop haut pour une page à l'échelle .8, mais qui tient à .75 (Alex : 5 cartes le lundi, Bruno : 4 le mardi, Chloé : 1 le lundi).
const SLOTS_TIGHT = [
  ...SLOTS_EQ.filter((x) => x.work_date === D_(19)),
  slotAt('t1', 'u-bruno', D_(20), W1, '07:00:00', '09:00:00'), slotAt('t2', 'u-bruno', D_(20), W2, '09:30:00', '12:00:00'), slotAt('t3', 'u-bruno', D_(20), W3, '13:30:00', '17:00:00'), slotAt('t4', 'u-bruno', D_(20), W4, '18:00:00', '21:00:00'),
  slotAt('t5', 'u-chloe', D_(19), W2, '08:00:00', '12:00:00'),
];
const SCEN = {
  eq: { users: EQ, slots: SLOTS_EQ, entries: ENTRIES_EQ },
  eqs: { users: EQ, slots: SLOTS_EQS, entries: [] },
  tight: { users: EQ, slots: SLOTS_TIGHT, entries: [] },
  std: { users: W9, slots: SLOTS_STD, entries: ENTRIES_STD },
  many: { users: W22, slots: SLOTS_MANY, entries: ENTRIES_STD },
};
const COMPANY = { id: CO, name: 'Entreprise Test', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, travel_paid: false, accountant_email: null };
let companyLogo = null;
const fresh = (mode, photos = {}) => {
  const sc = SCEN[mode], ids = new Set(sc.users.map((x) => x.id));
  return {
    users: [u('u-admin', 'Sam', 'Test', 'admin'), ...sc.users.map((x) => (photos[x.id] ? { ...x, photo_url: photos[x.id].startsWith('http') ? photos[x.id] : `http://localhost:${PORT}${photos[x.id]}` } : x))],
    companies: [{ ...COMPANY }], worksites: Object.values(WS),
    planning: sc.slots.filter((s) => ids.has(s.user_id)).map((s) => ({ ...s })), time_entries: sc.entries.filter((e) => ids.has(e.user_id)).map((e) => ({ ...e })),
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
const nonGet = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PNG = fs.existsSync(path.join(OUT, 'apple-touch-icon.png')) ? fs.readFileSync(path.join(OUT, 'apple-touch-icon.png')) : Buffer.alloc(0);
/** Requêtes de photos servies pendant la page (lente / bloquée / cassée), avec l'heure. */
const photoHits = [];
const setup = async (ctx, mode, photos) => {
  const db = fresh(mode, photos);
  await ctx.clock.setFixedTime(NOW);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  // window.print() de test : note le moment, le titre et l'état des images de la feuille À CET INSTANT.
  await ctx.addInitScript(() => {
    window.print = () => {
      window.__printed = (window.__printed || 0) + 1; window.__title = document.title; window.__printAt = performance.now();
      window.__printImgs = [...document.querySelectorAll('.bt-print img')].map((i) => ({ src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0, alt: i.getAttribute('alt') }));
      window.__printAvatars = [...document.querySelectorAll('.bt-print .bt-pl-avatar')].map((a) => ({ img: !!a.querySelector('img'), txt: a.textContent.trim() }));
    };
  });
  // La photo « lente » n'est pas encore préparée au moment d'imprimer : la préparation à l'avance (fetch) traîne bien plus
  // longtemps que l'image de la page — la feuille doit alors attendre l'image elle-même (bouton « Imprimer »).
  await ctx.route('**/photo-lente.png', async (r) => { photoHits.push({ k: 'lente', t: Date.now() }); await sleep(r.request().resourceType() === 'fetch' ? 6000 : 900); await r.fulfill({ status: 200, contentType: 'image/png', body: PNG, headers: { 'cache-control': 'no-store' } }).catch(() => {}); });
  await ctx.route('**/photo-bloquee.png', async (r) => { photoHits.push({ k: 'bloquee', t: Date.now() }); await sleep(8000); await r.abort().catch(() => {}); });
  await ctx.route('**/photo-cassee.png', async (r) => { photoHits.push({ k: 'cassee', t: Date.now() }); await r.fulfill({ status: 404, body: 'non' }).catch(() => {}); });
  // La photo « ok » est servie comme en vrai : avec un cache (Cache-Control max-age=3600), déjà chargée par l'écran.
  await ctx.route('**/apple-touch-icon.png', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG, headers: { 'cache-control': 'public, max-age=3600' } }).catch(() => {}));
  await ctx.route('**/logo-entreprise.png', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }).catch(() => {}));
  await ctx.route((url) => url.hostname !== 'localhost' && !url.hostname.endsWith('.supabase.co'), (r) => r.abort());
  // Photos hébergées AILLEURS que la page (comme le stockage de Supabase) : l'une répond avec CORS (« access-control-allow-origin: * »), l'autre sans.
  await ctx.route('https://photos.exemple.test/**', (r) => {
    const cors = r.request().url().includes('/cors/');
    // Sans CORS, le navigateur refuse la LECTURE (fetch) d'une image d'un autre site, tout en l'affichant dans une balise <img> :
    // Playwright ajoute lui-même les en-têtes CORS aux réponses simulées, on simule donc le refus en coupant le fetch.
    if (!cors && r.request().resourceType() === 'fetch') return r.abort().catch(() => {});
    r.fulfill({ status: 200, contentType: 'image/png', body: PNG, headers: { 'cache-control': 'public, max-age=3600', ...(cors ? { 'access-control-allow-origin': '*' } : {}) } }).catch(() => {});
  });
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url()); const m = r.request().method();
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (m !== 'GET' && m !== 'HEAD') { nonGet.push(`${m} ${url.pathname}`); return r.fulfill({ status: 201, json: m === 'POST' && url.pathname.startsWith('/rest/v1/rpc/') ? [] : {} }); }
    const t = url.pathname.replace('/rest/v1/', '');
    const sel = url.searchParams.get('select') || '*';
    let all = filterRows(db[t] || [], url.searchParams).map((x) => {
      if (t === 'companies' && companyLogo) return { ...x, logo_url: companyLogo };
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
const newPage = async (mode, { w = 1440, h = 900, photos = {} } = {}) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await setup(ctx, mode, photos); const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('   [erreur page]', e.message));
  await p.goto(`http://localhost:${PORT}/admin`);
  await p.waitForSelector('.bt-pl-gridwrap .bt-pl-name', { timeout: 25000 }); await p.waitForTimeout(1500);
  return { ctx, p };
};

// ─── PDF : pages, dessin, texte ──────────────────────────────────────────────────
const PDF_OPTS = { format: 'A4', landscape: true, printBackground: false, preferCSSPageSize: true };
const PT = 25.4 / 72; // 1 pt en mm
const pdfInfo = (buf) => {
  const s = buf.toString('latin1');
  return { pages: (s.match(/\/Type\s*\/Page(?!s)/g) || []).length, boxes: [...s.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [Number(m[3]), Number(m[4])]) };
};
const a4Land = (info) => info.boxes.length > 0 && info.boxes.every(([w, h]) => Math.abs(w - 841.89) <= 1.5 && Math.abs(h - 595.28) <= 1.5);
const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
/**
 * Lit le dessin de chaque page du PDF (flux de contenu décompressés) :
 *  - rects : les remplissages et traits (mm depuis le coin HAUT-gauche du papier) avec leur couleur de remplissage ;
 *  - texts : l'origine de chaque texte écrit (mm depuis le haut-gauche) et sa taille réelle en pt.
 */
const pdfPages = (buf) => {
  const s = buf.toString('latin1'), H = Number(/\/MediaBox\s*\[\s*0\s+0\s+[\d.]+\s+([\d.]+)/.exec(s)?.[1]);
  const content = (n) => {
    const m = new RegExp(`(?:^|[\\r\\n])${n} 0 obj`).exec(s); if (!m) return '';
    const st = s.indexOf('stream', m.index), a = st + (s[st + 6] === '\r' ? 8 : 7);
    try { return zlib.inflateSync(buf.subarray(a, s.indexOf('endstream', a))).toString('latin1'); } catch { return ''; }
  };
  return [...s.matchAll(/\d+ 0 obj\s*<<\s*\/Type\s*\/Page(?!s)([\s\S]*?)endobj/g)].map((pg) => {
    const t = content(Number(/\/Contents\s+(\d+)\s+0\s+R/.exec(pg[1])?.[1]));
    let ctm = [1, 0, 0, 1, 0, 0], nums = [], path = [], fill = '0,0,0'; const stack = [], rects = [], texts = [];
    let tm = [1, 0, 0, 1, 0, 0], fs_ = 0;
    const pt = (x, y) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
    for (const k of t.match(/\((?:\\.|[^\\)])*\)|<[0-9a-fA-F\s]*>|\[|\]|\/[^\s\[\]()<>/]+|[-+]?\d*\.?\d+(?:e[-+]?\d+)?|[A-Za-z*'"]+/g) || []) {
      if (/^[-+]?\d*\.?\d+(?:e[-+]?\d+)?$/.test(k)) { nums.push(Number(k)); continue; }
      if (k === '[' || k === ']' || k.startsWith('/') || k.startsWith('(') || k.startsWith('<')) { if (k.startsWith('/')) nums = []; continue; }
      const n = nums;
      if (k === 'q') stack.push([ctm, fill]); else if (k === 'Q') { const o = stack.pop(); if (o) [ctm, fill] = o; } else if (k === 'cm') ctm = mul(n.slice(-6), ctm);
      else if (k === 'rg') fill = n.slice(-3).map((v) => Math.round(v * 255)).join(',');
      else if (k === 'm' || k === 'l') path.push(pt(n.at(-2), n.at(-1)));
      else if (k === 'c') path.push(pt(n.at(-6), n.at(-5)), pt(n.at(-4), n.at(-3)), pt(n.at(-2), n.at(-1)));
      else if (k === 're') { path.push(pt(n.at(-4), n.at(-3)), pt(n.at(-4) + n.at(-2), n.at(-3) + n.at(-1))); }
      else if (/^(f|F|f\*|S|s|B|B\*|b|b\*)$/.test(k)) {
        if (path.length) rects.push({ x0: Math.min(...path.map((p) => p[0])) * PT, x1: Math.max(...path.map((p) => p[0])) * PT, y0: (H - Math.max(...path.map((p) => p[1]))) * PT, y1: (H - Math.min(...path.map((p) => p[1]))) * PT, fill, op: k });
        path = [];
      } else if (k === 'n') path = [];
      else if (k === 'BT') { tm = [1, 0, 0, 1, 0, 0]; }
      else if (k === 'Tf') fs_ = n.at(-1);
      else if (k === 'Tm') tm = n.slice(-6);
      else if (k === 'Td' || k === 'TD') tm = [tm[0], tm[1], tm[2], tm[3], tm[4] + n.at(-2) * tm[0] + n.at(-1) * tm[2], tm[5] + n.at(-2) * tm[1] + n.at(-1) * tm[3]];
      else if (k === 'Tj' || k === 'TJ' || k === "'" || k === '"') {
        const m2 = mul(tm, ctm); const [x, y] = [m2[4], m2[5]];
        texts.push({ x: x * PT, y: (H - y) * PT, pt: Math.abs(fs_ * Math.hypot(m2[2], m2[3])) });
      }
      nums = [];
    }
    return { rects, texts };
  });
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ─── Imprimer depuis le menu (la feuille reste montée jusqu'à « afterprint ») ─────
const printed = (p) => p.evaluate(() => window.__printed || 0);
const printWith = async (p, { kind = 'week', moves = 0, tomorrow = false, signature = false, tasks = false } = {}) => {
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

// ─── Rendu « papier » à l'écran : la page A4 entière (297 × 210 mm : @page margin:0, les marges sont celles de la feuille) ───
const MM = 96 / 25.4;
const paper = async (p, fn) => {
  const vp = p.viewportSize();
  await p.setViewportSize({ width: Math.round(297 * MM), height: Math.round(210 * MM) }); await p.emulateMedia({ media: 'print' }); await p.waitForTimeout(300);
  try { return await fn(); } finally { await p.emulateMedia({ media: null }); await p.setViewportSize(vp); await p.waitForTimeout(200); }
};
const lum = (rgb) => { const [r, g, bl] = rgb.match(/\d+/g).slice(0, 3).map((v) => { const c = Number(v) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
const contrast = (a, c) => { const [x, y] = [lum(a), lum(c)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

// ─── Le dessin du PDF : traits horizontaux du tableau (cadre, bas de l'en-tête, séparateurs de lignes) ───
/** Traits horizontaux d'une page, y en mm, triés ; deux traits à moins de 1 mm n'en font qu'un (le séparateur de la dernière ligne
 *  d'une page touche le pied du cadre). `thick` = trait de cadre (≥ 0,6 mm). */
const hRules = (pg) => {
  const by = new Map();
  for (const r of pg.rects) {
    if (r.y1 - r.y0 > 1.6 || r.x1 - r.x0 < 15) continue;
    const k = Math.round(((r.y0 + r.y1) / 2) / 0.3);
    const o = by.get(k) || { y: (r.y0 + r.y1) / 2, w: 0, h: 0 }; o.w += r.x1 - r.x0; o.h = Math.max(o.h, r.y1 - r.y0); by.set(k, o);
  }
  const l = [...by.values()].filter((o) => o.w >= 250).sort((a, c) => a.y - c.y), out = [];
  for (const o of l) { const last = out.at(-1); if (last && o.y - last.y < 1) { if (o.h > last.h) { last.h = o.h; last.y = o.y; } } else out.push({ ...o }); }
  return out.map((o) => ({ y: o.y, thick: o.h >= 0.6 }));
};
/** Hauteurs (mm) des lignes de salariés d'une page : du trait sous l'en-tête des colonnes au pied du cadre. */
const bodyRows = (pg) => { const r = hRules(pg).map((x) => x.y); return r.slice(1).map((y, i, a) => (i ? y - a[i - 1] : null)).slice(1); };
/** Pour chaque ligne de salarié d'une page : { h : hauteur, vide : du dernier texte de la ligne au trait du bas }. */
const rowDetail = (pg) => {
  const ys = hRules(pg).map((x) => x.y); const out = [];
  for (let i = 1; i < ys.length - 1; i++) {
    const top = ys[i], bot = ys[i + 1];
    const t = pg.texts.filter((x) => x.y > top + 0.5 && x.y < bot).map((x) => x.y);
    out.push({ h: bot - top, vide: t.length ? bot - Math.max(...t) : bot - top });
  }
  return out;
};
/** Étendue du dessin d'une page SANS les remplissages blancs (les marges de la feuille sont blanches). */
const inkEdges = (pg) => {
  const r = pg.rects.filter((x) => x.fill !== '255,255,255');
  return { l: Math.min(...r.map((x) => x.x0)), r: 297 - Math.max(...r.map((x) => x.x1)), t: Math.min(...r.map((x) => x.y0)), b: 210 - Math.max(...r.map((x) => x.y1)) };
};
const bandText = (pg) => pg.texts.filter((x) => x.y < 10 || x.y > 200).length;

// ─── Relevés du DOM (rendu « papier », A4 entier) ────────────────────────────────
const readSheet = () => {
  const sh = document.querySelector('.bt-print'), z = sh.querySelector('.bt-print-z'), cs = (e) => getComputedStyle(e);
  const bar = sh.querySelector('.bt-print-bar'), logo = bar.querySelector('.bt-print-logo'), what = bar.querySelector('.bt-print-what'), pill = bar.querySelector('.bt-print-co');
  const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
  const forbidden = [...sh.querySelectorAll('button, input, select, textarea, a, [tabindex], .bt-pl-add, .bt-pl-cell-today, .bt-pl-cell-live, .bt-pl-th.today, .today, .bt-pl-status, .bt-pl-selbox, .bt-pl-sellock, [data-testid=bubble-live], [data-testid=live-chip]')].map((e) => e.className || e.tagName);
  const txt = sh.innerText;
  const heads = [...sh.querySelectorAll('thead th.bt-pl-th')].map((e) => ({ bg: cs(e).backgroundColor, sh: cs(e).boxShadow }));
  const title = sh.querySelector('.bt-pl-bub-title');
  // Tout texte de la feuille, à sa taille EFFECTIVE sur le papier (taille calculée × échelle) : liste de ceux qui font moins de 7 pt.
  const zz = Number(cs(z).getPropertyValue('--bt-z')), small = new Set(); let nText = 0, minPx = 1e9;
  const walker = document.createTreeWalker(sh, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const e = n.parentElement;
    if (!n.textContent.trim() || !e || e.closest('style')) continue;
    const px = parseFloat(cs(e).fontSize) * zz; nText++; minPx = Math.min(minPx, px);
    if (px * 72 / 96 < 6.95) small.add(`${(e.className && String(e.className)) || e.tagName} ${(px * 72 / 96).toFixed(1)} pt`);
  }
  return {
    small: [...small], nText, minPt: minPx * 72 / 96,
    zoom: Number(cs(z).getPropertyValue('--bt-z')), pages: sh.getAttribute('data-pages'), cls: sh.className,
    bar: { bg: cs(bar).backgroundColor, radius: parseFloat(cs(bar).borderTopLeftRadius), r: R(bar) },
    logo: { alt: logo.getAttribute('alt'), src: logo.getAttribute('src').slice(0, 24), ok: logo.complete && logo.naturalWidth > 0, r: R(logo) },
    what: { t: what.innerText, color: cs(what).color, r: R(what), size: parseFloat(cs(what).fontSize), weight: cs(what).fontWeight },
    pill: { t: pill.innerText.trim(), img: !!pill.querySelector('img'), imgOk: [...pill.querySelectorAll('img')].every((i) => i.complete && i.naturalWidth > 0), r: R(pill), border: cs(pill).borderTopColor, size: parseFloat(cs(pill).fontSize), weight: cs(pill).fontWeight, color: cs(pill).color, av: pill.querySelector('.bt-print-co-av') ? cs(pill.querySelector('.bt-print-co-av')).backgroundColor : null },
    leg: { h: R(sh.querySelector('.bt-print-leg')).h, at: sh.querySelector('.bt-print-at')?.innerText || '', atSize: parseFloat(cs(sh.querySelector('.bt-print-at')).fontSize), sw: sh.querySelectorAll('.bt-print-leg .bt-print-sw').length },
    forbidden, txt, heads,
    titleEff: title ? parseFloat(cs(title).fontSize) * Number(cs(z).getPropertyValue('--bt-z')) : null,
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    sheetW: R(sh).w, sheetL: R(sh).l, vw: document.documentElement.clientWidth,
    rows: [...sh.querySelectorAll('tbody tr')].map((tr) => R(tr).h),
  };
};
/** Le bandeau noir de l'ÉCRAN (barre du haut) : fond, texte, pastille de l'entreprise — pour comparer. */
const readScreenBar = () => {
  const cs = (e) => getComputedStyle(e), ck = document.querySelector('.bt-pl-cockpit'), acct = ck.querySelector('.bt-pl-acct'), nm = ck.querySelector('.bt-pl-acct-name'), av = ck.querySelector('.bt-pl-acct-av');
  return { bg: cs(ck).backgroundColor, color: cs(ck).color, border: cs(acct).borderTopColor, size: parseFloat(cs(nm).fontSize), weight: cs(nm).fontWeight, nameColor: cs(nm).color, av: cs(av).backgroundColor };
};

// ─── Les cas ─────────────────────────────────────────────────────────────────────
// pages : nombre exact (1 = « tient sur une page »), minPages : plusieurs pages.
const CASES = [
  { id: 'semaine-5-cartes', mode: 'eq', opts: { kind: 'week' }, what: 'semaine, 1er salarié à 5 cartes le lundi, 2 salariés sans carte', pages: 1, rows: 3, vide: true, cap: true },
  { id: 'semaine-5-cartes-etalees', mode: 'eqs', opts: { kind: 'week' }, what: 'semaine, 1er salarié à 5 cartes étalées, 2 salariés sans carte', pages: 1, rows: 3, ratio: true },
  { id: 'semaine-juste', mode: 'tight', opts: { kind: 'week' }, what: 'semaine à peine trop haute à .8 : réduite pour tenir sur une page', pages: 1, rows: 3, reduced: true },
  { id: 'semaine', mode: 'std', opts: { kind: 'week' }, what: 'semaine, 9 salariés dont un nom très long', minPages: 2, rows: 9, parity: true, bar: true },
  { id: 'jour', mode: 'eq', opts: { kind: 'day' }, what: 'jour, 3 salariés', pages: 1, rows: 3, cap: true },
  { id: 'jour-9', mode: 'std', opts: { kind: 'day' }, what: 'jour, 9 salariés', minPages: 2, rows: 9 },
  { id: 'mois', mode: 'std', opts: { kind: 'month' }, what: 'mois, 9 salariés', pages: 1, rows: 9, cap: true },
  { id: '22-salaries', mode: 'many', opts: { kind: 'week' }, what: 'semaine, 22 salariés sur plusieurs pages', minPages: 3, rows: 22, cap: true },
  { id: 'signature', mode: 'std', opts: { kind: 'week', signature: true }, what: 'semaine + signature', minPages: 2, rows: 9, cap: true },
];
const SCREEN_DIR = SH;
const LONGEST = (rows) => Math.max(...rows);

if (AVANT) {
  for (const c of CASES) {
    const { ctx, p } = await newPage(c.mode);
    await p.screenshot({ path: path.join(SH, `ecran-${c.id}.png`), fullPage: true });
    await printWith(p, c.opts);
    const pdf = await p.pdf(PDF_OPTS); fs.writeFileSync(path.join(SH, `impression-${c.id}.pdf`), pdf);
    const pg = pdfPages(pdf);
    console.log(`${c.id} : ${pg.length} page(s), lignes (mm) ${pg.map((x) => bodyRows(x).map((v) => v.toFixed(1)).join(' / ')).join(' | ')}`);
    await closePrint(p); await ctx.close();
  }
  console.log(`captures « avant » dans ${SH}`);
  await b.close(); srv.close(); process.exit(0);
}

let screenBar = null;
for (const c of CASES.filter((x) => !ONLY || x.id === ONLY)) {
  const { ctx, p } = await newPage(c.mode);
  if (c.cap) await p.screenshot({ path: path.join(SH, `ecran-${c.id}.png`), fullPage: true }); // l'écran, à côté du PDF (C7)
  if (!screenBar) screenBar = await p.evaluate(readScreenBar);
  const n0 = nonGet.length;
  await printWith(p, c.opts);
  const W = `${c.id} (${c.what})`;
  // ── DOM, rendu papier ──
  const dom = await paper(p, async () => {
    const r = await p.evaluate(readSheet);
    // C1 — le bandeau
    check(r.bar.bg === 'rgb(21, 18, 15)' && r.bar.radius >= 10 && Math.abs(r.bar.r.w - r.sheetW) <= 8, `C1 ${W} : bandeau noir de l'écran (fond ${r.bar.bg}, coins arrondis ${r.bar.radius}px), aussi large que le tableau (${Math.round(r.bar.r.w)} / ${Math.round(r.sheetW)} px, le cadre déborde de sa demi-épaisseur)`);
    check(r.logo.alt === 'BEMEXO' && r.logo.ok && /^data:image\/svg\+xml/.test(r.logo.src) && r.logo.r.h >= 14 * r.zoom && r.logo.r.l - r.bar.r.l < 40, `C1 ${W} : logo BEMEXO à gauche, chargé (texte alternatif « ${r.logo.alt} », ${Math.round(r.logo.r.w)}×${Math.round(r.logo.r.h)} px)`);
    const what = c.opts.kind === 'month' ? 'Planning · octobre 2026' : c.opts.kind === 'day' ? 'Mercredi 21 octobre 2026 · semaine 43' : 'Planning · semaine 43 · 19 – 25 octobre 2026';
    check(r.what.t === what && Math.abs((r.what.r.l + r.what.r.r) / 2 - (r.bar.r.l + r.bar.r.r) / 2) <= 6, `C1 ${W} : période au centre « ${r.what.t} »`);
    check(r.pill.t === 'Entreprise Test' && !r.pill.img && r.pill.r.r >= r.bar.r.r - 24 && r.pill.r.l > r.what.r.r, `C1 ${W} : pastille de l'entreprise à droite, son nom seul (pas de logo : ${r.pill.t})`);
    check(contrast(r.what.color, r.bar.bg) >= 7 && contrast(r.pill.color, r.bar.bg) >= 7, `C1 ${W} : texte du bandeau lisible : contraste ${contrast(r.what.color, r.bar.bg).toFixed(1)} : 1 (≥ 7)`);
    check(r.forbidden.length === 0, `C1 ${W} : aucun bouton, champ, lien, « + », statut, jour surligné ni sélection sur la feuille ${JSON.stringify(r.forbidden.slice(0, 4))}`);
    const bad = ['à relancer', 'pièces', 'statistiques', 'Exporter', 'Salariés', 'Clients', 'en attente', 'À jour', 'Tâche', 'Aujourd', 'Congés', 'Versions'].filter((w) => r.txt.includes(w));
    check(bad.length === 0 && !/(^|\s)\+(\s|$)/.test(r.txt), `C1 ${W} : aucun texte de barre d'outils ni de statut (${bad.join(', ') || 'rien'}), aucun « + »`);
    if (c.opts.kind !== 'month') check(r.heads.length > 0 && r.heads.every((h) => h.bg === 'rgb(255, 255, 255)' && h.sh === 'none'), `C1 ${W} : aucune colonne du jour surlignée (en-têtes tous blancs, sans trait jaune)`);
    check(r.leg.h <= 26 * r.zoom + 6 && r.leg.sw === 3 && /^Imprimé le 21 oct\. 2026 à 10:00$/.test(r.leg.at) && r.leg.atSize * r.zoom <= 10, `C1 ${W} : légende sur UNE ligne (${Math.round(r.leg.h)} px), « ${r.leg.at} » discret (${(r.leg.atSize * r.zoom).toFixed(1)} px effectifs, 7 pt)`);
    check(r.page <= 1 && Math.abs(r.sheetL - (r.vw - r.sheetL - r.sheetW)) <= 1.5 && Math.abs(r.sheetW - 277 * MM) <= 1.5, `C3 ${W} : feuille de 277 mm centrée sur le papier, aucun débordement (gauche ${r.sheetL.toFixed(1)} px, largeur ${r.sheetW.toFixed(0)} px)`);
    check(r.small.length === 0 && r.nText > 20, `C3 ${W} : tout texte de la feuille fait au moins 7 pt sur le papier (${r.nText} textes, le plus petit ${r.minPt.toFixed(2)} pt)${r.small.length ? `\n   trop petits : ${r.small.slice(0, 8).join(' ; ')}` : ''}`);
    if (c.opts.kind !== 'month') check(r.zoom >= 0.75 && r.zoom <= (c.opts.kind === 'week' ? 0.8 : 1) && (!r.titleEff || r.titleEff >= 7 * 96 / 72 - 0.05), `C3 ${W} : échelle ${r.zoom.toFixed(3)}, nom d'une carte à ${r.titleEff ? (r.titleEff * 72 / 96).toFixed(2) : '—'} pt (≥ 7 pt)`);
    if (c.reduced) check(r.zoom < 0.8 && r.zoom >= 0.75 && r.pages === '1', `C3 ${W} : réduite à ${r.zoom.toFixed(3)} (< .8) pour tenir sur UNE page`);
    if (c.opts.kind === 'month') {
      const mx = Math.max(...r.rows), mn = Math.min(...r.rows);
      check(mx <= 2.2 * mn, `C2 ${W} : lignes du mois équilibrées : ${mn.toFixed(0)} à ${mx.toFixed(0)} px (≤ 2,2 ×)`);
    }
    return r;
  });
  // ── PDF réel ──
  const pdf = await p.pdf(PDF_OPTS);
  if (c.cap) fs.writeFileSync(path.join(SH, `impression-${c.id}.pdf`), pdf);
  const info = pdfInfo(pdf), pages = pdfPages(pdf);
  check(a4Land(info) && info.pages === pages.length && (c.pages ? info.pages === c.pages : info.pages >= c.minPages), `C3 ${W} : PDF A4 paysage, ${info.pages} page(s)${c.pages === 1 ? ' (UNE page)' : ''}`);
  const minPdf = Math.min(...pages.flatMap((pg) => pg.texts.map((t) => t.pt)));
  check(pages.every((pg) => pg.texts.length > 20) && minPdf >= 6.95, `C3 ${W} : dans le PDF réel, aucun texte sous 7 pt (le plus petit : ${minPdf.toFixed(2)} pt sur ${pages.reduce((n, pg) => n + pg.texts.length, 0)} textes)`);
  const edges = pages.map(inkEdges);
  // Marges de 10 mm sur CHAQUE page (0,6 mm de tolérance : la moitié extérieure du trait du cadre déborde) et dessin centré.
  check(edges.every((e) => e.l >= 9.4 && e.r >= 9.4 && e.t >= 9.4 && e.b >= 9.4 && Math.abs(e.l - e.r) <= 1), `C3 ${W} : marges de 10 mm sur chaque page, mesurées sur le dessin (g/d/h/b mm) : ${edges.map((e) => [e.l, e.r, e.t, e.b].map((v) => v.toFixed(1)).join('/')).join(' ; ')}`);
  if (c.opts.kind !== 'month') {
    // Le bandeau et l'en-tête des colonnes reviennent en haut de chaque page, à la même place ; le cadre se referme en bas de chaque page.
    const bars = pages.map((pg) => pg.rects.filter((x) => x.fill === '21,18,15' && x.x1 - x.x0 > 250 && x.y1 - x.y0 > 5));
    const tops = pages.map((pg) => hRules(pg).filter((x) => x.thick).map((x) => x.y));
    check(bars.every((l) => l.length === 1 && Math.abs(l[0].y0 - bars[0][0].y0) < 0.3) && tops.every((l) => l.length === 2 && Math.abs(l[0] - tops[0][0]) < 0.3), `C3 ${W} : bandeau noir et en-tête des colonnes en haut de chaque page, cadre refermé en bas de chaque page (${tops.map((l) => l.map((v) => v.toFixed(0)).join('→')).join(' ; ')} mm)`);
    // Une ligne n'est jamais coupée : toutes les lignes de toutes les pages ont au moins la hauteur minimale d'une ligne (22 mm × échelle), et le compte est juste.
    const all = pages.flatMap((pg) => rowDetail(pg).map((d) => d.h));
    check(all.length === c.rows && Math.min(...all) >= 20 * (dom.zoom / 0.8) - 0.6, `C3 ${W} : ${all.length} lignes de salariés sur ${pages.length} page(s) (attendu ${c.rows}), la plus petite ${Math.min(...all).toFixed(1)} mm (aucune ligne coupée)`);
  }
  if (c.ratio) {
    const h = rowDetail(pages[0]).map((d) => d.h), mx = Math.max(...h), mn = Math.min(...h);
    check(mx <= 2.2 * mn, `C2 ${W} : lignes ${h.map((v) => v.toFixed(1)).join(' / ')} mm, la plus haute = ${(mx / mn).toFixed(2)} × la plus petite (≤ 2,2) — sur le dessin du PDF`);
  }
  if (c.vide) {
    const d = rowDetail(pages[0]), mn = Math.min(...d.map((x) => x.h));
    const big = d.filter((x) => x.h > mn + 1);
    check(big.length > 0 && big.every((x) => x.vide <= 8), `C2 ${W} : aucun grand vide sous les cartes : vide sous le dernier texte des lignes plus hautes que le minimum (${mn.toFixed(1)} mm) = ${big.map((x) => x.vide.toFixed(1)).join(', ')} mm (≤ 8) — sur le dessin du PDF`);
  }
  check(nonGet.length === n0, `C0 ${W} : imprimer n'écrit rien (aucune requête hors lecture)`);
  await closePrint(p); await ctx.close();
}

if (ONLY) { console.log(`\n${ok} ✅ / ${ko} ❌ (cas ${ONLY} seulement)`); await b.close(); srv.close(); process.exit(ko ? 1 : 0); }
// ═══ C1 (suite) : la pastille de l'entreprise avec son logo ; barre de l'écran = bandeau ═══════
{
  companyLogo = `http://localhost:${PORT}/logo-entreprise.png`;
  const { ctx, p } = await newPage('eq');
  await printWith(p, { kind: 'week' });
  const r = await paper(p, () => p.evaluate(readSheet));
  check(r.pill.t === 'Entreprise Test' && r.pill.img && r.pill.imgOk && r.pill.av === 'rgb(255, 194, 26)', `C1 pastille avec logo : le logo de l'entreprise chargé, dans un rond jaune comme à l'écran, puis son nom (${r.pill.t})`);
  const sb = await p.evaluate(readScreenBar);
  check(r.bar.bg === sb.bg && r.what.color === sb.color && r.pill.border === sb.border && r.pill.size === sb.size && r.pill.weight === sb.weight && r.pill.color === sb.nameColor && r.pill.av === sb.av,
    `C1 bandeau = barre noire de l'écran : mêmes fond ${sb.bg}, texte ${sb.color}, trait de la pastille ${sb.border}, police ${sb.size}px / ${sb.weight}, rond ${sb.av}`);
  await closePrint(p); await ctx.close();
  companyLogo = null;
}

// ═══ C4 : en-têtes et pieds de page du navigateur ═════════════════════════════════
// page.pdf({ displayHeaderFooter: true }) demande à Chrome sa date, son titre, l'adresse et « 1/1 » : il les écrit dans la marge
// de la page. Témoin positif : la même feuille avec une marge @page de 10 mm → du texte apparaît dans les 10 mm du haut et du bas.
for (const [id, mode, opts] of [['semaine-5-cartes', 'eq', { kind: 'week' }], ['semaine-9', 'std', { kind: 'week' }], ['mois', 'std', { kind: 'month' }], ['22-salaries', 'many', { kind: 'week', signature: true }]]) {
  const { ctx, p } = await newPage(mode);
  await printWith(p, opts);
  const sans = await p.pdf({ ...PDF_OPTS, displayHeaderFooter: false });
  await printWith(p, opts);
  const avec = await p.pdf({ ...PDF_OPTS, displayHeaderFooter: true });
  await printWith(p, opts);
  await p.evaluate(() => { const st = document.createElement('style'); st.textContent = '@page{size:A4 landscape;margin:10mm}'; document.body.append(st); });
  const temoin = await p.pdf({ ...PDF_OPTS, displayHeaderFooter: true });
  const A = pdfPages(sans), B = pdfPages(avec), C = pdfPages(temoin);
  check(B.length === A.length && B.every((pg, i) => bandText(pg) === 0 && pg.texts.length === A[i].texts.length), `C4 ${id} : avec « En-têtes et pieds de page » le PDF n'a aucun texte dans les 10 mm du haut et du bas (${B.length} page(s), ${B.map((pg) => pg.texts.length).join('+')} textes = ceux du PDF sans en-têtes)`);
  check(C.every((pg) => bandText(pg) > 0), `C4 ${id} : témoin positif — avec des marges @page de 10 mm, Chrome écrit bien sa date, son titre, l'adresse et la pagination dans ces marges (${C.map(bandText).join(' / ')} textes)`);
  check(B.every((pg) => { const e = inkEdges(pg); return e.t >= 9.4 && e.b >= 9.4; }), `C4 ${id} : sans en-têtes du navigateur, chaque page garde ses marges de 10 mm en haut et en bas`);
  await closePrint(p); await ctx.close();
}

// ═══ C5 : photos des salariés et logo — chargés avant d'imprimer ═══════════════════
{
  const meta = (p) => p.evaluate(() => ({ t: window.__printAt, imgs: window.__printImgs, av: window.__printAvatars }));
  // Photo LENTE (900 ms, jamais en cache) : on attend, puis on imprime.
  let t0;
  {
    const { ctx, p } = await newPage('std', { photos: { 'u-alex': PHOTO.lente, 'u-bruno': PHOTO.ok } });
    const hits0 = photoHits.filter((h) => h.k === 'lente').length;
    t0 = Date.now(); await printWith(p, { kind: 'week' }); const dt = Date.now() - t0;
    const m = await meta(p);
    check(m.imgs.filter((i) => i.alt === '').length >= 2 && m.imgs.every((i) => i.ok), `C5 photo lente : à l'instant de window.print() toutes les images de la feuille sont chargées (${m.imgs.length} images)`);
    check(m.av[0].img && m.av[0].txt === '' && m.av[1].img && m.av[1].txt === '' && !m.av[2].img && m.av[2].txt === 'CE', `C5 photo lente : Alex et Bruno ont leur photo (plus d'initiales dessous), Chloé, sans photo, ses initiales « ${m.av[2].txt} »`);
    check(dt >= 800 && dt <= 2600 && photoHits.filter((h) => h.k === 'lente').length - hits0 >= 1, `C5 photo lente : la feuille a attendu la photo avant d'imprimer (${dt} ms ; photo redemandée pour la feuille, jamais en cache)`);
    await closePrint(p); await ctx.close();
  }
  // Photo BLOQUÉE : 2 s au plus, puis on imprime quand même — avec les initiales, jamais un rond vide.
  {
    const { ctx, p } = await newPage('std', { photos: { 'u-alex': PHOTO.bloquee } });
    t0 = Date.now(); await printWith(p, { kind: 'week' }); const dt = Date.now() - t0;
    const m = await meta(p);
    check(dt >= 1900 && dt <= 4500 && m.av[0].txt === 'AT', `C5 photo bloquée : attente plafonnée à 2 s (${dt} ms), on imprime quand même, Alex avec ses initiales « ${m.av[0].txt} »`);
    await closePrint(p); await ctx.close();
  }
  // Photo CASSÉE (404) : les initiales. Sans photo : les initiales sur la pastille de couleur de l'écran.
  {
    const { ctx, p } = await newPage('std', { photos: { 'u-alex': PHOTO.cassee } });
    await printWith(p, { kind: 'week' });
    const m = await meta(p);
    const tint = await paper(p, () => p.evaluate(() => [...document.querySelectorAll('.bt-print .bt-pl-avatar')].map((a) => ({ t: a.textContent.trim(), bg: getComputedStyle(a).backgroundColor, img: !!a.querySelector('img') }))));
    const screen = await p.evaluate(() => [...document.querySelectorAll('.bt-pl-gridwrap tbody:not(.bt-pl-ghostbody) .bt-pl-avatar')].map((a) => ({ t: a.textContent.trim(), bg: getComputedStyle(a).backgroundColor })));
    check(m.av.every((a) => a.txt.length === 2) && tint.every((a, i) => a.t.length === 2 && a.bg === screen[i].bg && (i === 0 || a.t === screen[i].t)), `C5 sans photo (ou photo cassée) : les initiales sur la pastille de couleur de l'écran, aucun rond vide (${tint.map((a) => a.t).join(' ')})`);
    await closePrint(p); await ctx.close();
  }
  // Ctrl+P (rien à attendre) : jamais un rond vide ni un logo absent.
  {
    const { ctx, p } = await newPage('std', { photos: { 'u-alex': PHOTO.lente, 'u-bruno': PHOTO.ok } });
    await p.evaluate(() => { window.__bp = []; window.addEventListener('beforeprint', () => window.__bp.push({
      logo: (() => { const l = document.querySelector('.bt-print .bt-print-logo'); return !!l && l.complete && l.naturalWidth > 0; })(),
      av: [...document.querySelectorAll('.bt-print .bt-pl-avatar')].map((a) => { const i = a.querySelector('img'); return a.textContent.trim().length > 0 || (!!i && i.complete && i.naturalWidth > 0); }),
      margin: [...document.querySelectorAll('.bt-print style')].map((s) => s.textContent).join(' ').match(/@page\{[^}]*\}/)?.[0] || null,
    })); });
    const pdf = await p.pdf(PDF_OPTS);
    const bp = await p.evaluate(() => window.__bp);
    check(bp.length === 1 && bp[0].logo && bp[0].av.length === 9 && bp[0].av.every(Boolean), `C5 Ctrl+P : la feuille est montée et imprimée aussitôt — logo prêt, aucune pastille vide (${bp[0]?.av.filter(Boolean).length}/9)`);
    check(bp[0]?.margin === '@page{size:A4 landscape;margin:0}' && pdfInfo(pdf).pages === 2 && pdfPages(pdf).every((pg) => bandText(pg) === 0), `C5 Ctrl+P : @page margin:0 aussi sur plusieurs pages (${bp[0]?.margin}), PDF de 2 pages`);
    await ctx.close();
  }
}

// ═══ C5 (suite) : Ctrl+P avec des photos que l'écran montre DÉJÀ ═════════════════════
// Le cas du patron : l'écran affiche la photo d'Alex et de Bruno et le logo de l'entreprise (déjà chargés). Ctrl+P monte la feuille
// et imprime aussitôt, sans rien attendre : le PDF doit contenir les photos et le logo, comme le bouton « Imprimer » — pas les initiales.
// Compte des images du PDF : objets « /Subtype /Image » du fichier (le logo BEMEXO est un SVG : dessin vectoriel, pas une image).
{
  const images = (buf) => (buf.toString('latin1').match(/\/Subtype\s*\/Image/g) || []).length;
  companyLogo = `http://localhost:${PORT}/logo-entreprise.png`;
  // Sans photo ni logo d'entreprise (témoin) : aucune image dans le PDF.
  let base;
  {
    companyLogo = null;
    const { ctx, p } = await newPage('eq');
    base = images(await p.pdf(PDF_OPTS));
    await ctx.close();
    companyLogo = `http://localhost:${PORT}/logo-entreprise.png`;
  }
  const { ctx, p } = await newPage('eq', { photos: { 'u-alex': PHOTO.ok, 'u-bruno': PHOTO.ok } });
  await p.evaluate(() => { window.__bp = []; window.addEventListener('beforeprint', () => window.__bp.push({
    av: [...document.querySelectorAll('.bt-print .bt-pl-avatar')].map((a) => ({ txt: a.textContent.trim(), img: (() => { const i = a.querySelector('img'); return !!i && i.complete && i.naturalWidth > 0; })() })),
    pill: (() => { const i = document.querySelector('.bt-print .bt-print-co img'); return { img: !!i && i.complete && i.naturalWidth > 0, txt: document.querySelector('.bt-print .bt-print-co').textContent.trim() }; })(),
  })); });
  const pdf = await p.pdf(PDF_OPTS);
  const bp = await p.evaluate(() => window.__bp), n = images(pdf);
  check(bp.length === 1 && bp[0].av[0].img && bp[0].av[0].txt === '' && bp[0].av[1].img && bp[0].av[1].txt === '' && bp[0].av[2].txt === 'CE' && !bp[0].av[2].img,
    `C5 Ctrl+P, photos déjà vues à l'écran : à l'instant d'imprimer, Alex et Bruno ont leur photo chargée (plus d'initiales), Chloé, sans photo, ses initiales ${JSON.stringify(bp[0]?.av)}`);
  check(bp[0]?.pill.img, `C5 Ctrl+P, logo de l'entreprise déjà vu à l'écran : le logo est chargé dans la pastille du bandeau (${JSON.stringify(bp[0]?.pill)})`);
  check(base === 0 && n >= 2, `C5 Ctrl+P : le PDF contient les photos et le logo (${n} image(s), contre ${base} pour la même feuille sans photo ni logo)`);
  // Le bouton « Imprimer » donne la même feuille (mêmes images).
  await printWith(p, { kind: 'week' });
  const n2 = images(await p.pdf(PDF_OPTS));
  check(n2 >= n, `C5 le bouton « Imprimer » : au moins autant d'images dans le PDF (${n2} contre ${n} par Ctrl+P)`);
  await closePrint(p); await ctx.close();
  companyLogo = null;
  // Photos hébergées sur un AUTRE site (le stockage) : avec CORS, Ctrl+P a la photo ; sans CORS, elle ne se lit pas à l'avance —
  // Ctrl+P garde les initiales (jamais un rond vide), le bouton « Imprimer » attend l'image elle-même et l'imprime.
  {
    const { ctx, p } = await newPage('eq', { photos: { 'u-alex': PHOTO.cors, 'u-bruno': PHOTO.sanscors } });
    await p.evaluate(() => { window.__bp = []; window.addEventListener('beforeprint', () => window.__bp.push([...document.querySelectorAll('.bt-print .bt-pl-avatar')].map((a) => { const i = a.querySelector('img'); return { txt: a.textContent.trim(), img: !!i && i.complete && i.naturalWidth > 0 }; }))); });
    const nCors = images(await p.pdf(PDF_OPTS));
    const bp = await p.evaluate(() => window.__bp);
    check(bp.length === 1 && bp[0][0].img && bp[0][0].txt === '' && !bp[0][1].img && bp[0][1].txt === 'BE' && nCors >= 1,
      `C5 Ctrl+P, photos sur un autre site : avec CORS la photo d'Alex est prête et imprimée (${nCors} image(s) dans le PDF) ; sans CORS Bruno garde ses initiales, jamais un rond vide ${JSON.stringify(bp[0])}`);
    await printWith(p, { kind: 'week' });
    const m = await p.evaluate(() => window.__printAvatars);
    check(m[0].img && m[0].txt === '' && m[1].img && m[1].txt === '', `C5 bouton « Imprimer », photos sur un autre site : la photo de Bruno (sans CORS) est attendue puis imprimée comme celle d'Alex`);
    await closePrint(p); await ctx.close();
  }
}

// ═══ C8 : la feuille est chargée à part (hors du premier chargement de /admin) ══════════════
{
  const chunks = path.join(OUT, '_next/static/chunks');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const files = walk(chunks).filter((f) => f.endsWith('.js')), has = (f, w) => fs.readFileSync(f, 'utf8').includes(w);
  const sheet = files.filter((f) => has(f, 'bt-measuring')), page = files.filter((f) => /[\\/]app[\\/]admin[\\/]page-/.test(f));
  check(sheet.length === 1 && page.length === 1 && !has(page[0], 'bt-measuring') && !has(page[0], 'bt-print-bar'), `C8 la feuille (CSS, mise en page, bandeau) est dans un fichier à part (${path.basename(sheet[0] || '?')}), pas dans celui de /admin (${path.basename(page[0] || '?')})`);
  const name = path.basename(sheet[0]);
  // Fichier de la feuille inaccessible (hors ligne, ancien déploiement) : « Imprimer » le dit et ne casse rien ; Ctrl+P imprime comme avant.
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await setup(ctx, 'eq', {});
  let down = true;
  await ctx.route(`**/${name}`, (r) => (down ? r.abort() : r.continue()));
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${PORT}/admin`);
  await p.waitForSelector('.bt-pl-gridwrap .bt-pl-name', { timeout: 25000 }); await p.waitForTimeout(1800);
  await p.evaluate(() => { window.__bp = []; window.addEventListener('beforeprint', () => window.__bp.push(document.querySelectorAll('.bt-print').length)); });
  const pdf = await p.pdf(PDF_OPTS);
  check(pdfInfo(pdf).pages >= 1 && (await p.evaluate(() => window.__bp))[0] === 0, 'C8 feuille pas chargée : Ctrl+P imprime comme avant (aucune feuille montée, pas de page blanche)');
  await p.click('[data-testid=bar-print]'); await p.waitForSelector('[data-testid=print-menu]');
  await p.click('[data-testid=print-go]');
  await p.waitForFunction(() => [...document.querySelectorAll('[data-sonner-toast]')].some((t) => /Impossible de préparer l'impression/.test(t.textContent)), null, { timeout: 8000 });
  const go = await p.evaluate(() => { const g = document.querySelector('[data-testid=print-go]'); return { txt: g?.textContent.trim(), dis: g?.disabled, menu: !!document.querySelector('[data-testid=print-menu]'), printed: window.__printed || 0, sheet: document.querySelectorAll('.bt-print').length }; });
  check(go.menu && go.txt === 'Imprimer' && !go.dis && go.printed === 0 && go.sheet === 0, `C8 feuille inaccessible : message, menu ouvert, « Imprimer » de nouveau actif, rien d'imprimé ${JSON.stringify(go)}`);
  down = false;
  await p.click('[data-testid=print-go]');
  await p.waitForFunction(() => (window.__printed || 0) === 1, null, { timeout: 15000 });
  check(await p.locator('.bt-print').count() === 1, 'C8 le clic suivant recharge la feuille et imprime');
  await closePrint(p); await ctx.close();
}

console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
