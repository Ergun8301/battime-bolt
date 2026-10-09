// Lancer : node scripts/tests/planning-lot3.mjs out docs/captures-planning-lot3 [port] (après npm run build).
// Captures « avant » : AVANT=1 node scripts/tests/planning-lot3.mjs <build d'avant> docs/captures-planning-lot3
// (captures seulement, aucune vérification ; le PDF Ctrl+P d'avant reste dans un dossier
// temporaire, sa 1re page est rastérisée à part en avant-ctrl-p-p1.png).
// playwright-core doit être résoluble.
//
// Lot 3 — sur la VRAIE page planning (base simulée, horloge figée au mercredi 21 octobre
// 2026, 10:00 à Paris ; rien n'est écrit, aucun appel réseau réel) :
//  (b) couleur des bulles selon le créneau
//   C1 chaque bulle prévue / à envoyer porte la teinte de son horaire (data-creneau + fond) ;
//      journée entière ou sans horaire : blanc ;
//   C2 heures envoyées : noir, sans teinte ; en cours : vert, sans teinte ; brouillon 18–20 : soir ;
//   C3 la barre de gauche garde la couleur du chantier ;
//   C4 légende (i) : 3 créneaux + « Blanc », « En cours (pointage en direct) » une seule fois ;
//   C5 rappel en ligne caché à 1440, visible à 1600, rien ne déborde ;
//   C6 téléphone 390 : bulles teintées, aucun défilement horizontal ;
//   C7 la bulle qu'on glisse garde sa teinte.
//  (a) « Imprimer »
//   P1 barre à 1024 / 1280 / 1366 avec Borne + assistant + 3 congés + 12 réserves : une ligne,
//      icône 🖨 seule (≤ 34 px), « Borne » réduit à 📟 sous 1366 ; menu ouvert sans débordement ;
//   P2 menu : jour par défaut = aujourd'hui, Échap ferme, « Un jour » et la signature retenus ;
//   P3 semaine + équipe : print() une fois, titre « Planning S-43 – Entreprise Test », feuille
//      cachée à l'écran, seule visible à l'impression, 7 jours × 9 salariés, rien de cliquable,
//      mêmes bulles que l'écran, noir gardé, nom long entier, maladie → « Absent » ;
//   P4 colonne signature ; P5 un jour + un salarié ; P6 un jour + équipe + signature, semaine + un
//      salarié ; P7 PDF A4 paysage (842,88 × 595,92), nombre de pages, feuille retirée après ;
//   P8 Ctrl+P sans le bouton : feuille par défaut ; fenêtre ouverte : impression inchangée ;
//   P9 semaine suivante → S-44 ; mode « Sélectionner » : aucune case à cocher sur papier ;
//   P10 portrait : la grille reste une grille ; P11 aucune écriture (aucune requête hors GET).
import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { chromium } from 'playwright-core';
const [,, OUT, SH, PORT = '4751'] = process.argv; fs.mkdirSync(SH, { recursive: true });
const AVANT = process.env.AVANT === '1';
// PDF de travail hors du dépôt ; seuls deux petits PDF sont gardés dans le dossier des captures.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'planning-lot3-'));
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT), r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ─── Horloge figée : mercredi 21 octobre 2026, 10:00 (Paris) — semaine 43 ────────
const NOW = new Date('2026-10-21T10:00:00+02:00');
const D_ = (d) => `2026-10-${String(d).padStart(2, '0')}`;
const DAYS = [19, 20, 21, 22, 23, 24, 25].map(D_);

// ─── Base simulée ────────────────────────────────────────────────────────────────
const CO = 'c0000000-0000-0000-0000-000000000001';
const ws = (id, client_name, city, product_type = null) => ({ id, company_id: CO, client_name, city, product_type, is_active: true });
const W1 = ws('w1', 'Villa Exemple', 'Lyon', 'Fenêtres'), W2 = ws('w2', 'Résidence Test', 'Villeurbanne', 'Portail');
const W3 = ws('w3', 'Maison Démo', 'Bron', 'Volets'), W4 = ws('w4', 'Atelier Fictif', 'Vénissieux'), W5 = ws('w5', 'Autre', null);
const WS = { w1: W1, w2: W2, w3: W3, w4: W4, w5: W5 };
const u = (id, first_name, last_name, role = 'worker') => ({ id, company_id: CO, first_name, last_name, role, email: `${id}@exemple.fr`, is_active: true, created_at: '2026-01-01' });
const LONG = 'Maximilien-Alexandre De La Fontaine-Beaumarchais';
// Déjà dans l'ordre des prénoms (la vraie requête trie, la base simulée non).
const WORKERS = [u('u-alex', 'Alex', 'Test'), u('u-bruno', 'Bruno', 'Essai'), u('u-chloe', 'Chloé', 'Exemple'), u('u-dina', 'Dina', 'Démo'),
  u('u-eli', 'Eli', 'Fictif'), u('u-fanny', 'Fanny', 'Modèle'), u('u-gabin', 'Gabin', 'Témoin'), u('u-hugo', 'Hugo', 'Proto'), u('u-max', 'Maximilien-Alexandre', 'De La Fontaine-Beaumarchais')];
const NAME = Object.fromEntries(WORKERS.map((w) => [w.id, `${w.first_name} ${w.last_name}`]));

// Chaque case porte ce que l'écran doit montrer : 'matin' | 'apres-midi' | 'soir' (teinte),
// null (blanc : journée entière ou sans horaire), 'reel' (noir), 'live' (vert).
const SLOTS = []; let seq = 0;
const slot = (id, user_id, day, w, start, end, want, extra = {}) => SLOTS.push({
  want, row: { id, company_id: CO, user_id, worksite_id: w?.id ?? null, work_date: D_(day), absence_type: null, estimated_start: start, estimated_end: end,
    notes: null, position: null, added_by_worker: false, created_by: 'u-admin', created_at: new Date(Date.UTC(2026, 9, 1, 6, 0, seq++)).toISOString(), ...extra },
});
const absence = (id, user_id, day, type) => slot(id, user_id, day, null, null, null, null, { absence_type: type });
// Alex : envoyé (noir), après-midi 13:30–17 et 13–17, en cours aujourd'hui, RDV 14:00
slot('p-a1', 'u-alex', 19, W1, '08:00:00', '12:00:00', 'reel');
slot('p-a2', 'u-alex', 19, W2, '13:30:00', '17:00:00', 'apres-midi');
slot('p-a3', 'u-alex', 20, W3, '13:00:00', '17:00:00', 'apres-midi');
slot('p-a4', 'u-alex', 21, W1, '08:00:00', '12:00:00', 'live');
slot('p-a5', 'u-alex', 22, W2, '14:00:00', null, 'apres-midi');
// Bruno : les seuils (11:59 / 12:00 / 17:59 / 18:00), soir 18–22, 07–13 = matin
slot('p-b1', 'u-bruno', 19, W3, '11:59:00', null, 'matin');
slot('p-b2', 'u-bruno', 20, W1, '12:00:00', null, 'apres-midi');
slot('p-b3', 'u-bruno', 20, W4, '18:00:00', '22:00:00', 'soir');
slot('p-b4', 'u-bruno', 21, W2, '17:59:00', null, 'apres-midi');
slot('p-b5', 'u-bruno', 22, W3, '18:00:00', null, 'soir');
slot('p-b6', 'u-bruno', 23, W1, '07:00:00', '13:00:00', 'matin');
// Chloé : 11–13 (égalité → matin), 11–15, 16–19, 17–20, 10:30–14
slot('p-c1', 'u-chloe', 19, W2, '11:00:00', '13:00:00', 'matin');
slot('p-c2', 'u-chloe', 20, W3, '11:00:00', '15:00:00', 'apres-midi');
slot('p-c3', 'u-chloe', 21, W4, '16:00:00', '19:00:00', 'apres-midi');
slot('p-c4', 'u-chloe', 22, W1, '17:00:00', '20:00:00', 'soir');
slot('p-c5', 'u-chloe', 23, W2, '10:30:00', '14:00:00', 'apres-midi');
// Dina : journées entières (blanc), puis arrêt maladie
slot('p-d1', 'u-dina', 19, W3, '08:00:00', '17:00:00', null);
slot('p-d2', 'u-dina', 20, W4, '10:00:00', '14:00:00', null);
slot('p-d3', 'u-dina', 21, W1, '16:00:00', '22:00:00', null);
absence('p-d4', 'u-dina', 22, 'maladie'); absence('p-d5', 'u-dina', 23, 'maladie');
// Eli : sans horaire (+ heures ajoutées hors planning), congé, brouillon 18–20 sur une case sans horaire
slot('p-e1', 'u-eli', 19, W2, null, null, null);
absence('p-e2', 'u-eli', 20, 'conge');
slot('p-e3', 'u-eli', 21, W3, null, null, 'soir');
// Fanny : « Autre » (titre = la note), documents (📎), fin = début, fin avant début
slot('p-f1', 'u-fanny', 19, W5, '09:00:00', '11:00:00', 'matin', { notes: 'Formation sécurité' });
slot('p-f2', 'u-fanny', 20, W1, '13:30:00', '17:00:00', 'apres-midi');
slot('p-f3', 'u-fanny', 21, W2, '12:00:00', '12:00:00', 'apres-midi');
slot('p-f4', 'u-fanny', 22, W3, '09:00:00', '08:00:00', 'matin');
// Gabin : matin + après-midi chaque jour ; Hugo : après-midi + un samedi soir ; Maximilien : journées
for (const d of [19, 20, 21, 22, 23]) { slot(`p-g${d}m`, 'u-gabin', d, W4, '08:00:00', '12:00:00', 'matin'); slot(`p-g${d}a`, 'u-gabin', d, W1, '13:30:00', '17:00:00', 'apres-midi'); }
for (const d of [19, 20, 21, 22, 23]) slot(`p-h${d}`, 'u-hugo', d, W2, '13:30:00', '17:00:00', 'apres-midi');
slot('p-h24', 'u-hugo', 24, W3, '18:00:00', '21:00:00', 'soir');
for (const d of [19, 20, 21]) slot(`p-m${d}`, 'u-max', d, W4, '08:00:00', '17:00:00', null);

const entry = (id, user_id, day, w, status, start, end, minutes, extra = {}) => ({ id, company_id: CO, user_id, work_date: D_(day), worksite_id: w?.id ?? null, planning_id: null, status, start_time: start, end_time: end, total_minutes: minutes, break_minutes: 0, reception: null, reserve_resolved_at: null, reserve_fixed_at: null, observation: null, ...extra });
const ENTRIES = [
  entry('e-a1', 'u-alex', 19, W1, 'submitted', '08:00:00', '12:00:00', 240, { planning_id: 'p-a1' }),   // envoyé → noir
  entry('e-e3', 'u-eli', 21, W3, 'draft', '18:00:00', '20:00:00', 120, { planning_id: 'p-e3' }),         // brouillon 18–20 → soir
  entry('e-e1', 'u-eli', 19, null, 'submitted', '15:00:00', '16:00:00', 60),                              // hors planning (sans chantier)
];
const LIVE = [{ user_id: 'u-alex', company_id: CO, worksite_id: 'w1', planning_id: 'p-a4', work_date: D_(21), started_at: '2026-10-21T05:45:00Z', positions: [] }];
const COMPANY = { id: CO, name: 'Entreprise Test', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, travel_paid: false, accountant_email: null };
// La plus grosse équipe en prod : 15 salariés actifs, jusqu'à 3 interventions par jour.
const EXTRA = [u('u-ines', 'Inès', 'Maquette'), u('u-jules', 'Jules', 'Brouillon'), u('u-karim', 'Karim', 'Esquisse'), u('u-lea', 'Léa', 'Ébauche'), u('u-marc', 'Marc', 'Croquis'), u('u-nina', 'Nina', 'Calque')];
const fresh = (busy = false, big = false) => {
  const db = {
    users: [u('u-admin', 'Sam', 'Test', 'admin'), ...WORKERS, ...(big ? EXTRA : [])],
    companies: [{ ...COMPANY, ...(busy ? { kiosk_enabled: true, ai_enabled: true } : {}) }],
    worksites: Object.values(WS),
    planning: SLOTS.map((s) => ({ ...s.row })),
    time_entries: ENTRIES.map((e) => ({ ...e })),
    active_sessions: LIVE.map((x) => ({ ...x })),
    documents: [{ id: 'd1', company_id: CO, worksite_id: 'w1', label: 'Plan', file_name: 'plan.pdf', mime_type: 'application/pdf', work_date: D_(20), created_at: '2026-10-20T08:00:00Z' }],
    leave_requests: [], invitations: [], month_closures: [], user_closures: [], certifications: [], push_subscriptions: [], kiosks: [], kiosk_settings: [], worksite_expenses: [], user_payroll: [],
  };
  if (big) {
    let k = 0;
    for (const w of EXTRA) for (const d of [19, 20, 21, 22, 23]) for (const [s0, e0, ws0] of [['07:30:00', '10:00:00', W1], ['10:30:00', '12:00:00', W2], ['13:30:00', '17:00:00', W3]]) {
      db.planning.push({ id: `p-x${k++}`, company_id: CO, user_id: w.id, worksite_id: ws0.id, work_date: D_(d), absence_type: null, estimated_start: s0, estimated_end: e0, notes: null, position: null, added_by_worker: false, created_by: 'u-admin', created_at: new Date(Date.UTC(2026, 9, 2, 6, 0, k)).toISOString() });
    }
  }
  if (busy) {
    // Le pire cas de tous les jours (admin-lot11) : 3 congés en attente, 12 réserves ouvertes.
    for (let i = 0; i < 3; i++) db.leave_requests.push({ id: `lr${i}`, company_id: CO, user_id: 'u-alex', status: 'pending', start_date: D_(26), end_date: D_(27), created_at: '2026-10-10T08:00:00Z' });
    for (let i = 0; i < 12; i++) db.time_entries.push(entry(`rsv${i}`, 'u-hugo', 1 + (i % 9), W2, 'submitted', '08:00:00', '09:00:00', 60, { reception: 'avec' }));
  }
  return db;
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
/** Toute requête autre qu'une lecture (P11 : imprimer n'écrit rien, ne verrouille rien). */
const nonGet = [];
const setup = async (ctx, busy = false, big = false) => {
  const db = fresh(busy, big);
  await ctx.clock.setFixedTime(NOW);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  // La vraie boîte d'impression bloquerait le test : on compte les appels et on note le titre.
  await ctx.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; window.__title = document.title; }; });
  // Aucun appel réseau réel : tout ce qui n'est ni la page locale ni la base simulée est coupé.
  await ctx.route((url) => url.hostname !== 'localhost' && !url.hostname.endsWith('.supabase.co'), (r) => r.abort());
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url()); const m = r.request().method();
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (m !== 'GET' && m !== 'HEAD') { nonGet.push(`${m} ${url.pathname}`); return r.fulfill({ status: 201, json: m === 'POST' && url.pathname.startsWith('/rest/v1/rpc/') ? [] : {} }); }
    const t = url.pathname.replace('/rest/v1/', '');
    const sel = url.searchParams.get('select') || '*';
    let all = filterRows(db[t] || [], url.searchParams).map((x) => {
      if (t !== 'planning') return x;
      return { ...x, ...(sel.includes('worksite:worksites') ? { worksite: x.worksite_id ? WS[x.worksite_id] : null } : {}), ...(sel.includes('user:users') ? { user: db.users.find((y) => y.id === x.user_id) || null } : {}) };
    });
    if ((r.request().headers()['accept'] || '').includes('vnd.pgrst.object')) return all.length ? r.fulfill({ json: all[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
    const total = all.length; all = all.slice(off, lim ? off + Number(lim) : undefined);
    return r.fulfill({ json: all, headers: { 'content-range': `${off}-${Math.max(off, off + all.length - 1)}/${total}`, 'access-control-expose-headers': 'content-range', 'access-control-allow-origin': '*' } });
  });
};

let ok = 0, ko = 0; const check = (c, m) => { if (AVANT) return; if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const newPage = async (w, h, { mobile = false, busy = false, big = false } = {}) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'fr-FR', timezoneId: 'Europe/Paris', ...(mobile ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
  await setup(ctx, busy, big); const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('   [erreur page]', e.message));
  await p.goto(`http://localhost:${PORT}/admin`);
  await p.waitForSelector(mobile ? '.bt-pl-m-card' : '.bt-pl-gridwrap .bt-pl-name', { timeout: 25000 }); await p.waitForTimeout(1500);
  return { ctx, p };
};
const shot = async (p, name, opts = {}) => { await p.waitForTimeout(250); await p.screenshot({ path: path.join(SH, name), ...opts }); };

// ─── Ce que la grille doit montrer, case par case ───────────────────────────────
const CHANTIER_BARS = ['#C9821F', '#A23E6B', '#2F8A5B', '#B5472E', '#7A5EA8', '#5E7A33', '#A8742A']; // planning-bubble.tsx
// Copie de hashStr (planning-bubble.tsx), comme kiosk-board.test.ts le vérifie côté borne.
const hashStr = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return Math.abs(h); };
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
const BG = { matin: 'rgb(218, 237, 251)', 'apres-midi': 'rgb(253, 227, 202)', soir: 'rgb(223, 204, 238)', null: 'rgb(255, 255, 255)', reel: 'rgb(21, 18, 15)', live: 'rgb(231, 246, 238)' };
const TINTS = new Set(['matin', 'apres-midi', 'soir']);
/** Sur papier, le direct n'existe pas : la bulle « en cours » y montre la teinte de son horaire. */
const expected = (paper) => {
  const out = {};
  for (const w of WORKERS) {
    out[NAME[w.id]] = DAYS.map((d) => SLOTS.filter((s) => s.row.user_id === w.id && s.row.work_date === d && !s.row.absence_type).map((s) => {
      const want = paper && s.want === 'live' ? 'matin' : s.want;
      const planned = !['reel'].includes(want) && !ENTRIES.some((e) => e.planning_id === s.row.id);
      const title = planned && s.row.worksite_id === 'w5' ? s.row.notes : WS[s.row.worksite_id].client_name;
      return { t: title, c: TINTS.has(want) ? want : null, bg: BG[want], bar: want === 'live' ? rgb('#2FA36B') : rgb(CHANTIER_BARS[hashStr(s.row.worksite_id) % 7]) };
    }));
  }
  return out;
};
/** Relevé de la grille (écran) ou de la feuille imprimée : par salarié, par jour. */
const readGrid = (p, where) => p.evaluate((where) => {
  const out = {};
  const rows = where === 'print' ? document.querySelectorAll('.bt-print tbody tr') : document.querySelectorAll('.bt-pl-gridwrap tbody:not(.bt-pl-ghostbody) tr');
  for (const tr of rows) {
    const name = (tr.querySelector('.bt-pl-name')?.textContent || '').trim();
    out[name] = [...tr.querySelectorAll('td.bt-pl-cell:not(.bt-print-sig)')].map((td) => ({
      bubs: [...td.querySelectorAll('.bt-pl-bub')].map((el) => ({ t: (el.querySelector('.bt-pl-bub-title')?.textContent || '').trim(), c: el.getAttribute('data-creneau'), bg: getComputedStyle(el).backgroundColor, bar: getComputedStyle(el.querySelector('.bt-pl-bub-bar')).backgroundColor })),
      extra: [...td.querySelectorAll('.bt-pl-extra-name')].map((e) => e.textContent.trim()),
      abs: (td.querySelector('.bt-pl-abs-lbl')?.textContent || '').trim() || null,
    }));
  }
  return out;
}, where);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Compare les bulles relevées à l'attendu ; renvoie les écarts lisibles. */
const diffBubs = (got, want, keys) => {
  const bad = [];
  for (const [name, days] of Object.entries(want)) days.forEach((list, i) => {
    const g = (got[name]?.[i]?.bubs || []).map((x) => Object.fromEntries(keys.map((k) => [k, x[k]])));
    const w = list.map((x) => Object.fromEntries(keys.map((k) => [k, x[k]])));
    if (!same(g, w)) bad.push(`${name} ${DAYS[i].slice(8)} : ${JSON.stringify(g)} ≠ ${JSON.stringify(w)}`);
  });
  return bad;
};
const pdfInfo = (buf) => {
  const s = buf.toString('latin1');
  return { pages: (s.match(/\/Type\s*\/Page(?!s)/g) || []).length, boxes: [...s.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [Number(m[3]), Number(m[4])]) };
};
const PDF_OPTS = { format: 'A4', landscape: true, printBackground: false, preferCSSPageSize: true };

// ─── Imprimer depuis le menu ─────────────────────────────────────────────────────
const openMenu = async (p) => { await p.click('[data-testid=bar-print]'); await p.waitForSelector('[data-testid=print-menu]'); };
/** Ouvre le menu, règle les options, clique « Imprimer » et attend l'appel à print(). */
const printWith = async (p, { scope = 'week', day = null, who = 'all', signature = false } = {}) => {
  const n = await p.evaluate(() => window.__printed || 0);
  await openMenu(p);
  await p.click(`[data-testid=print-scope-${scope}]`);
  if (scope === 'day' && day !== null) await p.locator('[data-testid=print-day]').nth(day).click();
  await p.selectOption('[data-testid=print-who]', who);
  if (await p.isChecked('[data-testid=print-sig]') !== signature) await p.click('[data-testid=print-sig]');
  await p.click('[data-testid=print-go]');
  await p.waitForFunction((n) => (window.__printed || 0) === n + 1, n, { timeout: 8000 });
  return p.evaluate(() => window.__title);
};
/** La boîte d'impression se referme (ce que fait le navigateur après l'impression). */
const closePrint = (p) => p.evaluate(() => window.dispatchEvent(new Event('afterprint')));
/** Rendu « papier » à l'écran : largeur imprimable d'un A4 paysage (281 mm ≈ 1062 px). */
const paper = async (p, fn, { w = 1062, h = 733 } = {}) => {
  const vp = p.viewportSize();
  await p.setViewportSize({ width: w, height: h }); await p.emulateMedia({ media: 'print' }); await p.waitForTimeout(300);
  // media: null (et non 'screen') : sinon page.pdf() garderait le rendu écran.
  try { return await fn(); } finally { await p.emulateMedia({ media: null }); await p.setViewportSize(vp); await p.waitForTimeout(200); }
};
const visible = (p, sel) => p.evaluate((sel) => [...document.querySelectorAll(sel)].some((e) => e.getClientRects().length > 0), sel);

// ═══ AVANT : captures du build d'avant (aucune vérification) ═════════════════════
if (AVANT) {
  const { ctx, p } = await newPage(1440, 900);
  await p.mouse.move(720, 890); await shot(p, 'avant-planning-1440x900.png');
  await p.click('button[aria-label="Légende des icônes"]'); await p.waitForTimeout(250);
  await p.locator('.bt-pl-dd').first().screenshot({ path: path.join(SH, 'avant-legende.png') });
  await p.keyboard.press('Escape'); await p.locator('.bt-pl-ddbackdrop').first().click();
  // Ctrl+P d'avant : toute l'appli, sur 3 pages. PDF lourd (polices) : gardé hors du dépôt,
  // seule sa 1re page rastérisée est versée (avant-ctrl-p-p1.png).
  fs.writeFileSync(path.join(TMP, 'avant-ctrl-p.pdf'), await p.pdf(PDF_OPTS));
  console.log(`PDF Ctrl+P d'avant : ${path.join(TMP, 'avant-ctrl-p.pdf')}`);
  await ctx.close();
  const bar = await newPage(1024, 768, { busy: true });
  await bar.p.mouse.move(512, 760); await shot(bar.p, 'avant-barre-1024x768.png', { clip: { x: 0, y: 0, width: 1024, height: 160 } });
  await bar.ctx.close();
  const mob = await newPage(390, 844, { mobile: true });
  await shot(mob.p, 'avant-mobile-390x844.png');
  await mob.ctx.close();
  console.log(`captures « avant » dans ${SH}`);
  await b.close(); srv.close(); process.exit(0);
}

// ═══ C1–C4, C7, P2–P11 : bureau 1440×900 ═════════════════════════════════════════
{
  const { ctx, p } = await newPage(1440, 900);
  const screen = await readGrid(p, 'screen');
  const wantScreen = expected(false);
  const badC1 = diffBubs(screen, wantScreen, ['t', 'c', 'bg']);
  check(badC1.length === 0, `C1 chaque bulle : titre, data-creneau et fond attendus (${SLOTS.filter((s) => !s.row.absence_type).length} bulles)${badC1.length ? `\n   ${badC1.join('\n   ')}` : ''}`);
  const cnt = (c) => Object.values(screen).flat().flatMap((d) => d.bubs).filter((x) => x.c === c).length;
  check(cnt('matin') > 0 && cnt('apres-midi') > 0 && cnt('soir') > 0, `C1 les trois teintes présentes (matin ${cnt('matin')}, après-midi ${cnt('apres-midi')}, soir ${cnt('soir')})`);
  const alexMon = screen['Alex Test'][0].bubs[0], alexWed = screen['Alex Test'][2].bubs[0], eliWed = screen['Eli Fictif'][2].bubs[0];
  check(alexMon.bg === BG.reel && alexMon.c === null, `C2 heures envoyées : noir ${alexMon.bg}, sans teinte`);
  check(alexWed.bg === BG.live && alexWed.c === null, `C2 en cours : vert ${alexWed.bg}, sans teinte`);
  check(eliWed.c === 'soir' && eliWed.bg === BG.soir && /18:00–20:00/.test(await p.locator('.bt-pl-bub-draft').first().innerText()), 'C2 brouillon 18:00–20:00 sur une case sans horaire : « soir »');
  const badC3 = diffBubs(screen, wantScreen, ['bar']);
  check(badC3.length === 0, `C3 la barre de gauche garde la couleur du chantier (hashStr % 7)${badC3.length ? `\n   ${badC3.join('\n   ')}` : ''}`);
  const inks = await p.evaluate(() => [...document.querySelectorAll('.bt-pl-gridwrap .bt-pl-bub[data-creneau]')].map((b) => [b.querySelector('.bt-pl-bub-sub'), b.querySelector('.bt-pl-hour'), b.querySelector('.bt-pl-bub-draft')].filter(Boolean).map((e) => getComputedStyle(e).color)).flat());
  check(inks.length > 0 && inks.every((c) => c === 'rgb(87, 82, 74)'), `C1 sur une teinte, sous-ligne et heures à l'encre #57524A (${new Set(inks).size} couleur(s))`);
  check(screen['Dina Démo'][3].abs === 'Maladie' && screen['Eli Fictif'][1].abs === 'Congé', 'écran inchangé : « Maladie », « Congé »');

  // C4 légende (i)
  await p.click('button[aria-label="Légende des icônes"]'); await p.waitForTimeout(250);
  const leg = await p.locator('[data-testid=leg-creneau]').allInnerTexts();
  check(leg.length === 3 && /Matin/.test(leg[0]) && /Après-midi/.test(leg[1]) && /Soir/.test(leg[2]) && await p.locator('[data-testid=leg-blanc]').count() === 1, `C4 légende : ${leg.map((t) => t.replace(/\s+/g, ' ')).join(' | ')} + « Blanc »`);
  check(await p.locator('.bt-pl-legrow', { hasText: 'En cours (pointage en direct)' }).count() === 1, 'C4 « En cours (pointage en direct) » une seule fois');
  await p.locator('.bt-pl-dd').first().screenshot({ path: path.join(SH, 'apres-legende.png') });
  await p.locator('.bt-pl-ddbackdrop').first().click(); await p.waitForTimeout(150);
  check(await p.locator('[data-testid=leg-mini]').evaluate((e) => getComputedStyle(e).display) === 'none', 'C5 1440 : rappel en ligne caché');
  await p.mouse.move(720, 890); await shot(p, 'apres-planning-1440x900.png');

  // C7 glisser : la bulle sous le pointeur garde sa teinte (Échap annule, rien n'est écrit)
  const n0 = nonGet.length;
  const src = p.locator('tr', { has: p.locator('.bt-pl-name', { hasText: 'Bruno Essai' }) }).locator('td.bt-pl-cell').nth(4).locator('.bt-pl-grab').first(); // ven. 07–13
  await src.scrollIntoViewIfNeeded();
  const bb = await src.boundingBox();
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down();
  await p.mouse.move(bb.x + bb.width / 2 + 30, bb.y + bb.height / 2 + 20, { steps: 4 }); await p.mouse.move(bb.x + bb.width / 2 + 60, bb.y + bb.height / 2 + 40, { steps: 4 });
  await p.waitForTimeout(200);
  const ov = await p.locator('.bt-pl-overlay .bt-pl-bub').evaluate((e) => ({ c: e.getAttribute('data-creneau'), bg: getComputedStyle(e).backgroundColor })).catch(() => null);
  check(ov && ov.c === 'matin' && ov.bg === BG.matin, `C7 bulle glissée teintée « matin » (${JSON.stringify(ov)})`);
  await p.keyboard.press('Escape'); await p.mouse.up(); await p.waitForTimeout(300);
  check(nonGet.length === n0, 'C7 glisser puis Échap : rien d’écrit');

  // P2 le menu
  await openMenu(p);
  check(await p.locator('[data-testid=print-scope-week]').getAttribute('aria-pressed') === 'true' && (await p.locator('[data-testid=print-scope-week]').innerText()).trim() === 'Semaine 43', 'P2 par défaut : « Semaine 43 »');
  check(await p.locator('[data-testid=print-who]').inputValue() === 'all' && (await p.locator('[data-testid=print-who] option').count()) === 10, 'P2 « Toute l’équipe » puis les 9 salariés');
  check(await p.evaluate(() => document.activeElement?.getAttribute('data-testid')) === 'print-go', 'P2 « Imprimer » a le focus (Entrée imprime)');
  await p.mouse.move(1000, 600); await shot(p, 'apres-menu-imprimer-1440.png', { clip: { x: 700, y: 0, width: 740, height: 480 } });
  await p.click('[data-testid=print-scope-day]');
  check(await p.locator('[data-testid=print-day]').count() === 7 && await p.locator('[data-testid=print-day][aria-pressed=true]').getAttribute('aria-label') === 'mercredi 21 octobre', 'P2 « Un jour » : 7 jours, aujourd’hui (mer 21) choisi');
  await p.click('[data-testid=print-sig]');
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  check(await p.locator('[data-testid=print-menu]').count() === 0, 'P2 Échap ferme le menu');
  await p.reload(); await p.waitForSelector('.bt-pl-gridwrap .bt-pl-name'); await p.waitForTimeout(1200);
  await openMenu(p);
  check(await p.locator('[data-testid=print-scope-day]').getAttribute('aria-pressed') === 'true' && await p.isChecked('[data-testid=print-sig]') && await p.locator('[data-testid=print-who]').inputValue() === 'all', 'P2 après rechargement : « Un jour » et la signature retenus, salarié revenu à « Toute l’équipe »');
  await p.click('[data-testid=print-scope-week]');
  check(await p.locator('[data-testid=print-day]').count() === 0 && await p.locator('[data-testid=print-scope-week]').getAttribute('aria-pressed') === 'true', 'P2 retour à « Semaine 43 »');
  await p.click('[data-testid=print-sig]'); await p.keyboard.press('Escape');

  // P3 semaine, toute l'équipe, sans signature
  const title3 = await printWith(p);
  check(title3 === 'Planning S-43 – Entreprise Test', `P3 print() appelé une fois, titre « ${title3} »`);
  check(await p.locator('[data-testid=print-menu]').count() === 0, 'P3 le menu se ferme');
  check(await p.locator('.bt-print').evaluate((e) => getComputedStyle(e).display) === 'none', 'P3 à l’écran : feuille cachée');
  check(await p.evaluate(() => document.querySelector('.bt-print')?.parentElement === document.body), 'P3 feuille posée directement dans <body>');
  await paper(p, async () => {
    check(await visible(p, '.bt-print') && !(await visible(p, '.bt-admin')) && !(await visible(p, 'section[aria-label]')), 'P3 à l’impression : seule la feuille (ni l’appli, ni les petits messages)');
    check(await p.locator('.bt-print thead th.bt-pl-th').count() === 7 && await p.locator('.bt-print tbody tr').count() === 9, 'P3 7 jours × 9 salariés');
    const forbidden = await p.locator('.bt-print').evaluate((s) => [...s.querySelectorAll('button, input, select, a, [tabindex], .bt-pl-add, .bt-pl-cell-today, .bt-pl-cell-live, [data-testid=bubble-live], [data-testid=live-chip], .bt-pl-selbox, .bt-pl-sellock, .today, .bt-pl-status')].map((e) => e.className || e.tagName));
    check(forbidden.length === 0, `P3 rien de cliquable ni d’écran seul (« + », jour J, direct, sélection, statut) ${JSON.stringify(forbidden.slice(0, 4))}`);
    const printed = await readGrid(p, 'print');
    const wantPaper = expected(true);
    const bad = diffBubs(printed, wantPaper, ['t', 'c', 'bg', 'bar']);
    check(bad.length === 0, `P3 mêmes bulles que l’écran (titre, teinte, fond, barre), « en cours » montré avec sa teinte${bad.length ? `\n   ${bad.join('\n   ')}` : ''}`);
    const titlesOf = (g) => Object.fromEntries(Object.entries(g).map(([n, d]) => [n, d.map((c) => [c.bubs.map((x) => x.t), c.extra])]));
    check(same(titlesOf(printed), titlesOf(screen)), 'P3 écran et papier : mêmes interventions dans chaque case (et heures ajoutées par le salarié)');
    check(printed['Alex Test'][0].bubs[0].bg === BG.reel, 'P3 bulle envoyée gardée en noir sur papier');
    check(printed['Dina Démo'][3].abs === 'Absent' && printed['Dina Démo'][4].abs === 'Absent' && printed['Eli Fictif'][1].abs === 'Congé', `P3 maladie → « Absent », congé → « Congé » (${printed['Dina Démo'][3].abs} / ${printed['Eli Fictif'][1].abs})`);
    check(!(await p.locator('.bt-print').innerText()).includes('Maladie') && await p.locator('.bt-print [data-testid=print-absence]', { hasText: '🤒' }).count() === 0, 'P3 ni le mot ni l’icône de la maladie sur papier');
    const nm = await p.locator('.bt-print .bt-pl-name', { hasText: 'Maximilien' }).evaluate((e) => { const lh = parseFloat(getComputedStyle(e).lineHeight); return { lines: Math.round(e.clientHeight / lh), clipped: e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1, text: e.textContent }; });
    check(nm.text === LONG && !nm.clipped && nm.lines >= 2, `P3 nom long en entier, sur ${nm.lines} lignes, sans « … »`);
    const wk = await p.locator('.bt-print .bt-pl-corner-wk').boundingBox(), sal = await p.locator('.bt-print .bt-pl-corner-sal').boundingBox(), cn = await p.locator('.bt-print .bt-pl-th-name').boundingBox();
    check([wk, sal].every((x) => x.x >= cn.x - 1 && x.x + x.width <= cn.x + cn.width + 1), 'P3 coin « S-43 / Salarié » dans sa case');
    const what = await p.locator('[data-testid=print-what]').innerText();
    check(what === 'Planning · semaine 43 · 19 – 25 octobre 2026' && /Imprimé le 21 oct\. 2026 à 10:00/.test(await p.locator('.bt-print-at').innerText()), `P3 en-tête : « ${what} », « Imprimé le … »`);
    check(await p.locator('.bt-print-leg .bt-print-sw').count() === 3 && /Noir : heures envoyées/.test(await p.locator('.bt-print-leg').innerText()), 'P3 légende des couleurs en tête de feuille');
    const tb = await p.locator('.bt-print .bt-pl-table').boundingBox();
    check(tb.width <= 1062 + 1, `P3 la grille tient dans la largeur d’un A4 paysage (${Math.round(tb.width)} px)`);
    await shot(p, 'apres-impression-semaine-equipe.png', { fullPage: true });
  });
  await closePrint(p); await p.waitForTimeout(150);
  check(await p.locator('.bt-print').count() === 0 && await p.title() !== title3, 'P3 boîte refermée (afterprint) : feuille retirée, titre de l’onglet remis');

  // P4 colonne signature + P7 PDF
  await printWith(p, { signature: true });
  await paper(p, async () => {
    const ths = await p.locator('.bt-print thead tr:last-child th').allInnerTexts();
    check(ths.length === 9 && ths[8].trim() === 'Signature', `P4 dernière colonne « Signature » (${ths.length} colonnes)`);
    const sig = await p.locator('.bt-print tbody tr').evaluateAll((trs) => trs.map((tr) => { const td = tr.lastElementChild; return { cls: td.classList.contains('bt-print-sig'), empty: td.textContent.trim() === '' && td.children.length === 0, w: td.getBoundingClientRect().width }; }));
    check(sig.length === 9 && sig.every((x) => x.cls && x.empty && x.w >= 80), `P4 chaque ligne finit par une case vide ≥ 80 px (${Math.round(Math.min(...sig.map((x) => x.w)))} px)`);
    const tb = await p.locator('.bt-print .bt-pl-table').boundingBox();
    check(tb.width <= 1062 + 1, `P4 avec signature, la grille tient en largeur (${Math.round(tb.width)} px)`);
    await shot(p, 'apres-impression-semaine-signature.png', { fullPage: true });
  });
  const titleBefore = await p.evaluate(() => window.__title);
  const pdf = await p.pdf(PDF_OPTS);
  fs.writeFileSync(path.join(SH, 'apres-semaine-signature.pdf'), pdf);
  const info = pdfInfo(pdf);
  // A4 paysage = 297 × 210 mm = 841,89 × 595,28 pt ; Chrome arrondit au pixel (841,92 × 594,96 avec le @page).
  check(info.boxes.length > 0 && info.boxes.every(([w, h]) => Math.abs(w - 841.89) <= 1.5 && Math.abs(h - 595.28) <= 1.5), `P7 PDF A4 paysage, chaque page : ${[...new Set(info.boxes.map(([w, h]) => `${w} × ${h} pt`))].join(', ')}`);
  check(info.pages === 2, `P7 semaine + équipe + signature : ${info.pages} pages (9 salariés ; ≤ 3 pour les 15 de la plus grosse équipe)`);
  check(await p.locator('.bt-print').count() === 0 && await p.title() !== titleBefore, 'P7 après le PDF (afterprint) : feuille retirée, titre remis');

  // P5 un jour + un salarié (mardi 20, Bruno)
  const title5 = await printWith(p, { scope: 'day', day: 1, who: 'u-bruno' });
  check(title5 === 'Planning mardi 20 octobre – Entreprise Test – Bruno Essai', `P5 titre « ${title5} »`);
  await paper(p, async () => {
    check(await p.locator('.bt-print thead th.bt-pl-th').count() === 1 && await p.locator('.bt-print tbody tr').count() === 1, 'P5 une colonne, une ligne');
    const what = await p.locator('[data-testid=print-what]').innerText();
    check(what.includes('Mardi 20 octobre 2026') && what.includes('Bruno Essai'), `P5 en-tête « ${what} »`);
    const got = await readGrid(p, 'print');
    check(same(got['Bruno Essai'][0], screen['Bruno Essai'][1]), `P5 la case = celle de l’écran (${got['Bruno Essai'][0].bubs.map((x) => `${x.t}:${x.c}`).join(', ')})`);
    await shot(p, 'apres-impression-jour-salarie.png', { fullPage: true });
  });
  const pdf5 = pdfInfo(await p.pdf(PDF_OPTS));
  check(pdf5.pages === 1, `P5 un jour, un salarié : ${pdf5.pages} page`);

  // P6 un jour + équipe + signature ; semaine + un salarié
  await printWith(p, { scope: 'day', day: 2, signature: true });
  await paper(p, async () => {
    const ths = await p.locator('.bt-print thead tr:last-child th').allInnerTexts();
    check(ths.length === 3 && /Mercredi/.test(ths[1]) && ths[2].trim() === 'Signature' && await p.locator('.bt-print tbody tr').count() === 9, `P6 un jour + équipe + signature : ${ths.length} colonnes, 9 lignes`);
    await shot(p, 'apres-impression-jour-equipe-signature.png', { fullPage: true });
  });
  await closePrint(p);
  const title6 = await printWith(p, { who: 'u-gabin' });
  await paper(p, async () => {
    check(await p.locator('.bt-print thead th.bt-pl-th').count() === 7 && await p.locator('.bt-print tbody tr').count() === 1 && title6 === 'Planning S-43 – Entreprise Test – Gabin Témoin', `P6 semaine + un salarié : 7 jours, 1 ligne, « ${title6} »`);
  });
  await closePrint(p);

  // P8 Ctrl+P sans le bouton : la feuille par défaut est montée avant l'impression.
  // Référence : la même feuille (semaine, équipe, sans signature) imprimée par le bouton.
  await printWith(p);
  const pBtn = await p.pdf(PDF_OPTS);
  check(await p.locator('.bt-print').count() === 0, 'P8 référence imprimée par le bouton, feuille retirée');
  await p.evaluate(() => { window.__bp = []; window.addEventListener('beforeprint', () => window.__bp.push({ rows: document.querySelectorAll('.bt-print tbody tr').length, week: !!document.querySelector('.bt-print--week'), sig: document.querySelectorAll('.bt-print th.bt-print-sig').length, title: document.title })); });
  // Le bandeau cookies (role=dialog, dans #cc-main) peut rester ouvert : il ne bloque pas la feuille.
  await p.evaluate(() => { const d = document.createElement('div'); d.id = 'cc-main'; d.innerHTML = '<div class="cm" role="dialog" aria-modal="true">Cookies</div>'; document.body.appendChild(d); });
  const pCtrl = await p.pdf(PDF_OPTS);
  await p.evaluate(() => document.getElementById('cc-main')?.remove());
  const bp = await p.evaluate(() => window.__bp);
  check(bp[0] && bp[0].rows === 9 && bp[0].week && bp[0].sig === 0 && bp[0].title === 'Planning S-43 – Entreprise Test', `P8 Ctrl+P (bandeau cookies ouvert) : semaine, toute l’équipe, sans signature (${JSON.stringify(bp[0])})`);
  check(await p.locator('.bt-print').count() === 0, 'P8 après Ctrl+P : feuille retirée');
  const [iB, iC] = [pdfInfo(pBtn), pdfInfo(pCtrl)];
  check(iC.pages === 2 && iC.pages === iB.pages && Math.abs(pCtrl.length - pBtn.length) / pBtn.length < 0.02, `P8 PDF Ctrl+P = PDF du bouton (${iC.pages} pages, ${Math.round(pCtrl.length / 1024)} Ko / ${Math.round(pBtn.length / 1024)} Ko)`);
  fs.writeFileSync(path.join(TMP, 'apres-ctrl-p.pdf'), pCtrl);
  await p.locator('.bt-pl-gridwrap .bt-pl-namebtn', { hasText: 'Alex Test' }).click(); await p.waitForSelector('[role=dialog]');
  await p.pdf(PDF_OPTS);
  const bp2 = await p.evaluate(() => window.__bp);
  check(bp2.length === 2 && bp2[1].rows === 0, 'P8 une fenêtre ouverte : Ctrl+P imprime comme avant (pas de feuille)');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // P9 semaine suivante ; mode « Sélectionner »
  await p.click('button[aria-label="Semaine suivante"]'); await p.waitForTimeout(800);
  const title9 = await printWith(p);
  check(title9 === 'Planning S-44 – Entreprise Test', `P9 semaine suivante : « ${title9} »`);
  await paper(p, async () => { check((await p.locator('[data-testid=print-what]').innerText()).includes('26 octobre – 1 novembre 2026'), 'P9 en-tête : « 26 octobre – 1 novembre 2026 »'); });
  await closePrint(p);
  await p.click('button[aria-label="Semaine précédente"]'); await p.waitForTimeout(800);
  await p.click('[data-testid=bar-select]'); await p.waitForTimeout(200);
  await printWith(p);
  await paper(p, async () => {
    check(await p.locator('.bt-print [data-sel], .bt-print .bt-pl-selbox, .bt-print .bt-pl-sellock').count() === 0 && await p.locator('.bt-print tbody tr').count() === 9, 'P9 mode « Sélectionner » : aucune case à cocher sur papier');
  });
  await closePrint(p);
  await p.click('[data-testid=sel-done]'); await p.waitForTimeout(200);

  // P10 portrait (navigateur qui ignore @page) : toujours la grille, jamais les cartes mobiles
  await printWith(p);
  await paper(p, async () => {
    check(await visible(p, '.bt-print .bt-pl-table') && await p.locator('.bt-print thead th.bt-pl-th').count() === 7 && !(await visible(p, '.bt-pl-mobile')), 'P10 portrait 794 px : la grille 7 jours, pas les cartes du téléphone');
  }, { w: 794, h: 1123 });
  await closePrint(p);
  await ctx.close();
}

// ═══ P7 bis : 15 salariés, 3 interventions par jour (le maximum vu en prod) ═══════
{
  const { ctx, p } = await newPage(1440, 900, { big: true });
  await printWith(p, { signature: true });
  const rows = await p.locator('.bt-print tbody tr').count();
  const info = pdfInfo(await p.pdf(PDF_OPTS));
  check(rows === 15 && info.pages <= 4, `P7 15 salariés dont 6 à 3 interventions par jour, avec signature : ${info.pages} pages`);
  await ctx.close();
}

// ═══ C5 1600 : rappel des couleurs en ligne, barre chargée ════════════════════════
{
  const { ctx, p } = await newPage(1600, 900, { busy: true });
  check(await p.locator('[data-testid=leg-mini]').isVisible() && (await p.locator('[data-testid=leg-mini]').innerText()).replace(/\s+/g, ' ').trim() === 'Matin Après-midi Soir', 'C5 1600 : rappel « Matin · Après-midi · Soir » visible');
  const r = await p.evaluate(() => { const bar = document.querySelector('.bt-pl-bar'); const br = bar.getBoundingClientRect(); return { groups: [...bar.children].every((g) => g.scrollWidth <= g.clientWidth + 1), inside: [...bar.querySelectorAll('*')].filter((e) => e.getClientRects().length).every((e) => { const x = e.getBoundingClientRect(); return !x.width || (x.left >= br.left - 0.5 && x.right <= br.right + 0.5); }) }; });
  check(r.groups && r.inside, `C5 1600 : rien ne déborde dans la barre ${JSON.stringify(r)}`);
  await ctx.close();
}

// ═══ P1 barre : 1024 / 1280 / 1366, Borne + assistant + 3 congés + 12 réserves ═══
for (const [width, height] of [[1024, 768], [1280, 800], [1366, 768]]) {
  const { ctx, p } = await newPage(width, height, { busy: true });
  const badges = (await p.locator('.bt-pl-bar').innerText()).replace(/\s+/g, ' ');
  check(/Salariés 3/.test(badges) && /Réserves 12/.test(badges) && await p.locator('[data-testid=bar-kiosk]').count() === 1 && await p.locator('[data-testid=bar-assistant]').count() === 1, `P1 ${width} : Borne, assistant, « Salariés 3 », « Réserves 12 »`);
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
  check(res.overlaps === 0 && res.inside && res.oneLine && res.groups.every((x) => x <= 1), `P1 ${width}×${height} : barre sur une ligne, rien ne déborde (${res.n} boutons, ${res.spare} px de marge, groupes ${JSON.stringify(res.groups)})`);
  const pb = await p.locator('[data-testid=bar-print]').evaluate((e) => ({ text: e.innerText.trim(), svg: !!e.querySelector('svg'), h: e.getBoundingClientRect().height, label: e.getAttribute('aria-label') }));
  check(pb.text === '' && pb.svg && pb.h <= 34 && pb.label === 'Imprimer le planning', `P1 ${width} : 🖨 icône seule, ${pb.h} px, « ${pb.label} »`);
  const borne = await p.locator('[data-testid=bar-kiosk]').evaluate((e) => ({ shown: getComputedStyle(e.querySelector('.bt-pl-lbl-borne')).display !== 'none', label: e.getAttribute('aria-label') }));
  check(borne.shown === (width >= 1366) && borne.label === 'Borne', `P1 ${width} : « Borne » ${borne.shown ? 'écrit' : 'réduit à 📟'} (nom accessible « ${borne.label} »)`);
  if (width === 1024) { await p.mouse.move(512, 760); await shot(p, 'apres-barre-1024x768.png', { clip: { x: 0, y: 0, width: 1024, height: 160 } }); }
  await openMenu(p);
  const m = await p.evaluate(() => { const r = document.querySelector('[data-testid=print-menu]').getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), page: document.documentElement.scrollWidth <= innerWidth }; });
  check(m.l >= 0 && m.r <= width && m.page, `P1 ${width} : menu entier à l’écran (${m.l}…${m.r}), aucun défilement horizontal`);
  if (width === 1024) { await p.click('[data-testid=print-scope-day]'); await p.mouse.move(300, 600); await shot(p, 'apres-menu-imprimer-1024.png', { clip: { x: 404, y: 0, width: 620, height: 520 } }); await p.click('[data-testid=print-scope-week]'); }
  await p.keyboard.press('Escape');
  await ctx.close();
}

// ═══ C6 téléphone 390×844 : bulles teintées, aucun défilement horizontal ═════════
{
  const { ctx, p } = await newPage(390, 844, { mobile: true });
  const cards = await p.evaluate(() => [...document.querySelectorAll('.bt-pl-m-card')].map((c) => ({ name: c.querySelector('.bt-pl-name')?.textContent.trim(), bubs: [...c.querySelectorAll('.bt-pl-bub')].map((b) => b.getAttribute('data-creneau')) })));
  const by = Object.fromEntries(cards.map((c) => [c.name, c.bubs]));
  check(same(by['Bruno Essai'], ['apres-midi']) && same(by['Eli Fictif'], ['soir']) && same(by['Gabin Témoin'], ['matin', 'apres-midi']) && same(by['Dina Démo'], [null]) && same(by['Alex Test'], [null]), `C6 cartes du jour teintées (Bruno ${by['Bruno Essai']}, Eli ${by['Eli Fictif']}, Gabin ${by['Gabin Témoin']}, Dina journée ${by['Dina Démo']}, Alex en cours ${by['Alex Test']})`);
  check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'C6 aucun défilement horizontal');
  await shot(p, 'apres-mobile-390x844.png');
  await ctx.close();
}

check(nonGet.length === 0, `P11 aucune écriture en base pendant tout le test (${nonGet.length}${nonGet.length ? ` : ${nonGet.slice(0, 4).join(', ')}` : ''})`);
console.log(`\n${ok} ✅ / ${ko} ❌`);
fs.rmSync(TMP, { recursive: true, force: true });
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
