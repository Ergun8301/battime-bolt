// Preuve de FIDÉLITÉ de l'écran salarié v2 (/poseur?ui=2) à la planche du designer : mêmes données de démonstration, deux rendus côte à côte.
//   npm run build && node scripts/tests/fidelite-salarie.mjs out docs/design-brief/integration/captures-fidelite 4392
// 1. La planche (docs/design-brief/designer-final/…dc.html, DONNÉES NON FIABLES) est copiée dans un dossier temporaire, ouverte dans un navigateur SANS RÉSEAU
//    (toute requête sortante est refusée), React servi depuis node_modules du dépôt ; on photographie l'écran voulu (E05, E04, E03, E25) à 390×844 et 360×640.
// 2. L'implémentation (build `out/`) tourne sur la base SIMULÉE du banc coque-v2 (horloge figée jeudi 15 octobre 2026 à 15:12, comme « 2:42 depuis 12:30 »).
// 3. Une image « planche | implémentation » par écran, en PNG de moins de 300 ko, dans le dossier de sortie ; contrôles de mesure (cibles ≥ 44 px, texte ≥ 12 px…).
import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [,, OUT = 'out', SH = 'docs/design-brief/integration/captures-fidelite', PORT = '4392'] = process.argv;
const CHROME = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
fs.mkdirSync(SH, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fidelite-'));

// ── 1. La planche, hors réseau ───────────────────────────────────────────────
const DESIGNER = path.join(RACINE, 'docs/design-brief/designer-final');
const planche = path.join(TMP, 'planche'); fs.mkdirSync(planche);
fs.copyFileSync(path.join(DESIGNER, 'BEMEXO Salari#U00e9 - Dossier.dc.html'), path.join(planche, 'dossier.html'));
// Les contrôles d'intégrité des scripts de React (18.3.1 sur unpkg) ne vaudraient pas pour les fichiers du dépôt (18.2) : retirés dans la COPIE.
fs.writeFileSync(path.join(planche, 'support.js'), fs.readFileSync(path.join(DESIGNER, 'support.js'), 'utf8').replace(/s\.integrity = [A-Za-z_]+;/g, '// intégrité retirée (copie locale)'));
const browser = await chromium.launch({ executablePath: CHROME });
const bloquees = [];
async function photographierPlanche(id, largeur, hauteur) {
  const ctx = await browser.newContext({ viewport: { width: 1800, height: 1400 }, deviceScaleFactor: 1 });
  await ctx.route('**/*', async (r) => {
    const u = r.request().url();
    if (u.startsWith('file://')) return r.continue();
    if (u.includes('react@18.3.1/umd/react.production')) return r.fulfill({ path: path.join(RACINE, 'node_modules/react/umd/react.production.min.js'), contentType: 'text/javascript' });
    if (u.includes('react-dom@18.3.1/umd/react-dom.production')) return r.fulfill({ path: path.join(RACINE, 'node_modules/react-dom/umd/react-dom.production.min.js'), contentType: 'text/javascript' });
    bloquees.push(u); return r.abort(); // aucune requête sortante
  });
  const p = await ctx.newPage();
  await p.goto(`file://${planche}/dossier.html`); await p.waitForTimeout(3500);
  // Polices de production (public/fonts) : les largeurs de texte sont celles de l'application.
  await p.addStyleTag({ content: fs.readFileSync(path.join(RACINE, 'public/fonts/fonts.css'), 'utf8').replace(/url\(\/?fonts\//g, `url(file://${RACINE}/public/fonts/`) });
  await p.waitForTimeout(800);
  const h = await p.evaluateHandle(([code, w, ht]) => {
    const cadre = [...document.querySelectorAll('div')].find((d) => d.offsetWidth === 390 && d.offsetHeight === 844 && d.style.borderRadius === '48px' && d.parentElement.innerText.split('\n')[0] === code);
    if (!cadre) return null;
    // Le cadre dessiné a 10 px de liseré : on l'agrandit pour que l'ÉCRAN fasse exactement la taille demandée.
    cadre.style.width = `${w + 20}px`; cadre.style.height = `${ht + 20}px`;
    return cadre.firstElementChild;
  }, [id, largeur, hauteur]);
  const el = h.asElement();
  if (!el) throw new Error(`écran ${id} introuvable dans la planche`);
  await p.waitForTimeout(300);
  const f = path.join(TMP, `planche-${id}-${largeur}x${hauteur}.png`);
  await el.screenshot({ path: f, animations: 'disabled' });
  await ctx.close(); return f;
}

// ── 2. L'implémentation, sur la base simulée ─────────────────────────────────
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  for (const c of [p, `${p}.html`, path.join(p, 'index.html')]) {
    const f = path.join(OUT, c);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); }
  }
  r.writeHead(404); r.end();
});
await new Promise((r) => srv.listen(Number(PORT), r));

const FIXED = new Date('2026-10-15T13:12:00Z'); // jeudi 15 octobre 2026, 15:12 à Paris : « 2:42 depuis 12:30 »
const today = '2026-10-15';
const CO = 'c0000000-0000-0000-0000-000000000001';
const ME = 'u-sam';
const W1 = { id: 'w1', company_id: CO, client_name: 'Maison Démo', city: 'Bron', is_active: true };
const W2 = { id: 'w2', company_id: CO, client_name: 'Villa Exemple', city: 'Lyon', is_active: true };
const AUTRE = { id: 'w-autre', company_id: CO, client_name: 'Autre', city: '', is_active: true };
const ligne = (id, date, ws, s, e, extra = {}) => {
  const [sh, sm] = s.split(':').map(Number); const [eh, em] = e.split(':').map(Number);
  return { id, company_id: CO, user_id: ME, worksite_id: ws.id, planning_id: null, work_date: date, start_time: `${s}:00`, end_time: `${e}:00`,
    break_minutes: 0, total_minutes: (eh * 60 + em) - (sh * 60 + sm), meal_allowance: false, status: 'draft', locked: false, exported_at: null,
    observation: null, reception: null, gap_before: null, worksite: ws, ...extra };
};
const prevu = (id, date, ws, s, e) => ({ id, company_id: CO, user_id: ME, worksite_id: ws.id, work_date: date, absence_type: null, estimated_start: `${s}:00`, estimated_end: `${e}:00`, notes: null, worksite: ws });
const envoyee = { status: 'submitted', submitted_at: '2026-10-12T16:05:00Z' };
const D = {
  users: [{ id: ME, company_id: CO, first_name: 'Sam', last_name: 'Gérard', role: 'worker', email: 'sam@exemple.fr', is_active: true, created_at: '2026-01-01' }],
  companies: [{ id: CO, name: 'Entreprise Exemple', ai_enabled: true, kiosk_enabled: true, position_tracking_enabled: false, travel_paid: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35 }],
  worksites: [W1, W2, AUTRE],
  planning: [], time_entries: [], active_sessions: [],
  month_closures: [], leave_requests: [], documents: [], time_entry_corrections: [], time_entry_positions: [], push_subscriptions: [],
};
let trainings = [];
const formation = (id, titre) => ({ id, title: titre, kind: 'video', video_url: 'https://www.youtube.com/watch?v=abc123', document_name: null, document_path: null, document_mime: null, created_at: '2026-10-11T08:00:00Z', seen_at: null });

// La semaine de la planche (E05) : lundi envoyé, mardi à envoyer, mercredi envoyé, jeudi en cours, vendredi congé, samedi prévu, dimanche vide.
function semaineE05() {
  D.time_entries = [
    ligne('lun-1', '2026-10-12', W1, '08:00', '12:00', { ...envoyee, reception: 'avec' }),
    ligne('lun-2', '2026-10-12', W2, '13:30', '17:00', envoyee),
    ligne('mar-1', '2026-10-13', W1, '08:00', '16:00', { status: 'draft', submitted_at: null }),
    ligne('mer-1', '2026-10-14', W1, '08:00', '12:00', { status: 'submitted', submitted_at: '2026-10-14T12:05:00Z' }),
    ligne('mer-2', '2026-10-14', W2, '13:00', '17:30', { status: 'submitted', submitted_at: '2026-10-14T17:35:00Z' }),
    // Jeudi : deux chantiers notés (brouillons) avec un trou d'une heure « c'était quoi ? », puis le pointage en cours depuis 12:30.
    ligne('jeu-1', today, W1, '07:30', '09:30', { status: 'draft', submitted_at: null }),
    ligne('jeu-2', today, W1, '10:30', '12:30', { status: 'draft', submitted_at: null }),
  ];
  D.planning = [
    { id: 'p17', company_id: CO, user_id: ME, worksite_id: W2.id, work_date: '2026-10-17', absence_type: null, estimated_start: '08:00:00', estimated_end: '12:00:00', notes: null, worksite: W2 },
    { id: 'p16', company_id: CO, user_id: ME, worksite_id: null, work_date: '2026-10-16', absence_type: 'conge', estimated_start: null, estimated_end: null, notes: 'vacances' },
  ];
  D.active_sessions = [{ user_id: ME, company_id: CO, worksite_id: W2.id, planning_id: null, work_date: today, started_at: '2026-10-15T10:30:00Z' }];
  trainings = [formation('t1', 'Port du harnais'), formation('t2', 'Gestes et postures')];
}
// E04 : planifiée, rien saisi (lundi à mercredi envoyés, jeudi prévu, vendredi et samedi prévus).
function semaineE04() {
  D.time_entries = [
    ligne('lun-1', '2026-10-12', W1, '08:00', '16:00', { ...envoyee, reception: 'avec' }),
    ligne('mar-1', '2026-10-13', W1, '08:00', '16:00', { status: 'submitted', submitted_at: '2026-10-13T16:05:00Z' }),
    ligne('mer-1', '2026-10-14', W1, '08:00', '16:30', { status: 'submitted', submitted_at: '2026-10-14T16:35:00Z' }),
  ];
  D.planning = [
    prevu('pj1', today, W1, '08:00', '12:00'), prevu('pj2', today, W2, '13:30', '17:00'),
    prevu('p16', '2026-10-16', W1, '08:00', '16:00'), prevu('p17', '2026-10-17', W2, '08:00', '12:00'),
  ];
  // Comme sur la planche : le badge rouge de « Plus » (une réserve à lever, des formations à voir).
  D.active_sessions = []; trainings = [formation('t1', 'Port du harnais'), formation('t2', 'Gestes et postures')];
}
// E03 : journée vide.
function semaineE03() {
  D.time_entries = [
    ligne('lun-1', '2026-10-12', W1, '08:00', '16:00', envoyee),
    ligne('mar-1', '2026-10-13', W1, '08:00', '16:00', { status: 'submitted', submitted_at: '2026-10-13T16:05:00Z' }),
    ligne('mer-1', '2026-10-14', W1, '08:00', '16:30', { status: 'submitted', submitted_at: '2026-10-14T16:35:00Z' }),
  ];
  D.planning = []; D.active_sessions = []; trainings = [];
}

// ── Cartes de chantier (étape 4) : une journée par état de ligne, comme E05b / E05c / E12 / E14 / E29 / E42 de la planche ──
const W3 = { id: 'w3', company_id: CO, client_name: 'Résidence Test', city: 'Villeurbanne', is_active: true };
const LONG = 'Résidence Les Jardins de la Doua - Bâtiment C lot 14';
D.worksites.push(W3);
const base = () => [
  ligne('lun-1', '2026-10-12', W1, '08:00', '16:00', envoyee),
  ligne('mar-1', '2026-10-13', W1, '08:00', '16:00', { status: 'submitted', submitted_at: '2026-10-13T16:05:00Z' }),
  ligne('mer-1', '2026-10-14', W1, '08:00', '16:30', { status: 'submitted', submitted_at: '2026-10-14T16:35:00Z' }),
];
// E05b / E05c : en cours, un trou, un prévu qui chevauche, la réunion, les tâches
function semaineE05c() {
  semaineE05();
  D.planning.push({ ...prevu('pj-w3', today, W3, '16:30', '17:00'), estimated_end: null });
  D.meetings = [{ id: 'm1', company_id: CO, title: 'Réunion sécurité', meeting_date: today, start_time: '17:15:00', end_time: null, place: 'Dépôt', all_team: true }];
  D.meeting_participants = [];
  const tache = (id, texte, part, fait, debut) => ({ id, company_id: CO, user_id: ME, work_date: today, text: texte, part, created_by: null, created_at: `2026-10-15T06:0${id.slice(1)}:00Z`, done_at: fait ? '2026-10-15T09:00:00Z' : null, done_by: fait ? ME : null, start_time: debut, end_time: null });
  D.day_tasks = [tache('t1', 'Ranger le dépôt', 'matin', true, null), tache('t2', 'Photos avant pose', null, false, null), tache('t3', 'Rendre la clé', null, false, '17:00:00')];
}
// E12 : journée envoyée (envoyé, retiré, envoyé avec « endroit noté »)
function semaineE12() {
  D.time_entries = [...base(),
    ligne('j-1', today, W1, '07:30', '11:30', { status: 'submitted', submitted_at: '2026-10-15T12:05:00Z' }),
    ligne('j-2', today, W3, '16:00', '16:30', { status: 'cancelled' }),
    ligne('j-3', today, W2, '12:00', '15:30', { status: 'submitted', submitted_at: '2026-10-15T12:05:00Z' }),
  ];
  D.time_entry_positions = [{ id: 'pos1', entry_id: 'j-3', moment: 'start', latitude: 45.7, longitude: 4.9, accuracy_m: 20, captured_at: '2026-10-15T10:00:00Z' }];
  D.planning = []; D.active_sessions = []; trainings = [];
}
// E42 : une réserve à lever, une levée par le bureau, une levée par le salarié
function semaineE42() {
  D.time_entries = [...base(),
    ligne('j-1', today, W3, '07:30', '11:30', { status: 'submitted', submitted_at: '2026-10-15T12:05:00Z', reception: 'avec', observation: 'Joint du portail' }),
    ligne('j-2', today, W1, '12:30', '15:00', { status: 'submitted', submitted_at: '2026-10-15T12:05:00Z', reception: 'avec', reserve_resolved_at: '2026-10-15T13:00:00Z' }),
    ligne('j-3', today, W2, '15:30', '17:00', { status: 'submitted', submitted_at: '2026-10-15T12:05:00Z', reception: 'avec', reserve_fixed_at: '2026-10-12T13:00:00Z' }),
  ];
  D.planning = []; D.active_sessions = []; trainings = [];
}
// E14 : mardi 13 renvoyée par le bureau (à corriger)
function semaineE14() {
  D.time_entries = [base()[0], ligne('mar-1', '2026-10-13', W1, '08:00', '16:00', { status: 'draft', submitted_at: '2026-10-13T16:05:00Z' }), base()[2]];
  D.planning = []; D.active_sessions = []; trainings = [];
}
// E29 : noms de 52 caractères (à envoyer, en cours, chez le comptable)
function semaineE29() {
  const L = (n) => ({ ...W1, id: `wl${n}`, client_name: LONG, city: ['Villeurbanne', 'Saint-Priest', 'Villeurbanne'][n] });
  D.worksites.push(L(0), L(1), L(2));
  D.time_entries = [...base(),
    ligne('j-1', today, L(0), '07:30', '11:30', { status: 'draft', submitted_at: null }),
    ligne('j-3', today, L(2), '13:00', '17:30', { status: 'submitted', submitted_at: '2026-10-15T12:05:00Z', locked: true }),
  ];
  D.planning = []; D.active_sessions = [{ user_id: ME, company_id: CO, worksite_id: 'wl1', planning_id: null, work_date: today, started_at: '2026-10-15T10:30:00Z' }]; trainings = [];
}

const now = Math.floor(Date.now() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ME, role: 'authenticated', exp: now + 36000, aal: 'aal1' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', expires_at: now + 36000, expires_in: 36000, token_type: 'bearer', user: { id: ME, email: 'sam@exemple.fr', aud: 'authenticated', role: 'authenticated' } };
const match = (rows, sp) => {
  let out = rows;
  for (const [k, v] of sp) {
    if (v.startsWith('eq.')) { const val = v.slice(3); out = out.filter((x) => !(k in x) || String(x[k]) === val); }
    if (v.startsWith('neq.')) { const val = v.slice(4); out = out.filter((x) => !(k in x) || String(x[k]) !== val); }
  }
  return out;
};
async function contexte(largeur, hauteur) {
  const ctx = await browser.newContext({ viewport: { width: largeur, height: hauteur }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', reducedMotion: 'reduce' });
  await ctx.clock.install(); await ctx.clock.setFixedTime(FIXED);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const req = r.request(); const u = new URL(req.url()); const method = req.method();
    if (u.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (u.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (u.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} });
    if (u.pathname === '/rest/v1/rpc/my_trainings') return r.fulfill({ json: trainings });
    if (u.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
    const t = u.pathname.replace('/rest/v1/', '');
    const rows = match(D[t] || [], u.searchParams);
    if (method === 'GET' || method === 'HEAD') return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
    return r.fulfill({ status: 201, json: rows.length ? rows[0] : { id: 'new-1' } });
  });
  return ctx;
}
const erreurs = [];
async function photographierImplementation(nom, largeur, hauteur, preparer, apres) {
  const ctx = await contexte(largeur, hauteur); preparer();
  const p = await ctx.newPage(); p.on('pageerror', (e) => erreurs.push(e.message));
  await p.goto(`http://localhost:${PORT}/poseur?ui=2`); await p.waitForSelector('.dz-bande', { timeout: 20000 }); await p.waitForTimeout(1800);
  if (apres) await apres(p);
  await p.mouse.move(2, 2); await p.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur()).catch(() => {});
  await p.waitForTimeout(500);
  const f = path.join(TMP, `impl-${nom}-${largeur}x${hauteur}.png`);
  await p.screenshot({ path: f, animations: 'disabled', caret: 'hide' });
  return { f, p, ctx };
}

// ── 3. Côte à côte ───────────────────────────────────────────────────────────
async function cote(nom, fPlanche, fImpl, titre) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const a = fs.readFileSync(fPlanche).toString('base64'); const i = fs.readFileSync(fImpl).toString('base64');
  await p.setContent(`<body style="margin:0;background:#E9E2D4;font:700 14px Archivo,system-ui,sans-serif;color:#15120F"><div style="display:flex;gap:24px;padding:12px 16px;align-items:flex-start"><figure style="margin:0"><figcaption style="padding:0 0 8px">Planche du designer · ${titre}</figcaption><img id="a" src="data:image/png;base64,${a}" style="display:block;box-shadow:0 0 0 1px #15120F"></figure><figure style="margin:0"><figcaption style="padding:0 0 8px">Implémentation (?ui=2)</figcaption><img id="i" src="data:image/png;base64,${i}" style="display:block;box-shadow:0 0 0 1px #15120F"></figure></div></body>`);
  await p.waitForFunction(() => [...document.images].every((m) => m.complete && m.naturalWidth > 0));
  const f = path.join(SH, `${nom}.png`);
  await p.screenshot({ path: f, fullPage: true });
  await ctx.close();
  const ko = (fs.statSync(f).size / 1000).toFixed(0);
  console.log('📸', f, `${ko} ko`);
  return Number(ko);
}

let ok = 0, ko = 0;
const verifie = (cond, msg) => { if (cond) { ok++; console.log('✅', msg); } else { ko++; console.log('❌', msg); } };
const mesures = async (p) => p.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const cibles = [...document.querySelectorAll('.bt-phdr button, .dz-onglet, .bt-day-dock button, .dz-rappels button, .dz-note, .dz-jour, .bt-lt-btn, button.bt-stat, .bt-alert, .bt-gap-b, .bt-iv-fixbtn, .bt-ghostbtn, .bt-dup, .dz-assistant')].filter(vis)
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5; }).map((e) => `${e.className} ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`);
  const petits = []; const w = document.createTreeWalker(document.querySelector('.bt-poseur'), NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.textContent.trim() || !n.parentElement || !vis(n.parentElement)) continue; const fs = parseFloat(getComputedStyle(n.parentElement).fontSize); if (fs < 11.99) petits.push(`${n.textContent.trim().slice(0, 24)} ${fs}px`); }
  const scroll = document.querySelector('.bt-day-scroll'); const dock = document.querySelector('.bt-day-dock, .dz-onglets');
  const premier = document.querySelector('[data-testid="card-entry"], [data-testid="card-planned"], [data-testid="card-live"]');
  const haut = dock ? dock.getBoundingClientRect().top : innerHeight;
  const r1 = premier ? premier.getBoundingClientRect() : null;
  // Contraste (WCAG) de chaque texte visible : couleur du texte contre le fond opaque le plus proche ; 4,5:1 (3:1 pour le grand texte). Les composants inactifs et les décors aria-hidden sont exclus.
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const rgba = (c) => { const m = c.match(/[\d.]+/g).map(Number); return [m[0], m[1], m[2], m[3] ?? 1]; };
  const melange = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
  const fondDe = (e) => { let c = [255, 255, 255]; const pile = []; for (let n = e; n; n = n.parentElement) { const st = getComputedStyle(n); if (st.backgroundImage !== 'none' && !st.backgroundImage.includes('gradient(') ) { /* image : ignorée */ } const b = rgba(st.backgroundColor); if (b[3] > 0) pile.push(b); if (b[3] >= 0.99) break; } for (const b of pile.reverse()) c = melange(b, [...c, 1]); return c; };
  const faibles = []; const w2 = document.createTreeWalker(document.querySelector('.bt-poseur'), NodeFilter.SHOW_TEXT);
  for (let n = w2.nextNode(); n; n = w2.nextNode()) {
    const e = n.parentElement; if (!n.textContent.trim() || !e || !vis(e) || e.closest('[aria-hidden="true"], button:disabled, .dz-sr, .dz-frise, .dz-barres')) continue;
    const st = getComputedStyle(e); const fond = fondDe(e); const fg = rgba(st.color); const texte = melange(fg, [...fond, 1]);
    const L1 = lum(texte), L2 = lum(fond); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const grand = parseFloat(st.fontSize) >= 24 || (parseFloat(st.fontSize) >= 18.66 && Number(st.fontWeight) >= 700);
    if (ratio < (grand ? 3 : 4.5)) faibles.push(`« ${n.textContent.trim().slice(0, 22)} » ${ratio.toFixed(2)}:1`);
  }
  return { cibles, petits, faibles, debordeX: document.documentElement.scrollWidth > innerWidth, premierVisible: !!r1 && r1.top < haut - 8, premierHaut: r1 ? Math.round(r1.top) : null, barreHaut: Math.round(haut), ...(scroll ? {} : {}) };
});

const poids = [];
// E05 · pointage en cours
const pE05 = await photographierPlanche('E05', 390, 844);
let r = await photographierImplementation('E05', 390, 844, semaineE05);
verifie((await r.p.locator('.bt-total-big').textContent()) === '6:42', 'E05 : total 6:42 (4:00 notées + 2:42 de pointage depuis 12:30)');
verifie((await r.p.locator('.bt-lt .dz-pointage-temps').textContent()) === '2:42', 'E05 : chrono 2:42');
verifie((await r.p.locator('.dz-assistant').count()) === 1 && ((await r.p.locator('.dz-assistant').boundingBox())?.x ?? 0) > 230, 'E05 : le ✦ jaune rond est en haut à droite');
verifie(await r.p.evaluate(() => { const a = document.querySelector('.dz-assistant').getBoundingClientRect(), v = document.querySelector('.bt-phdr-id').getBoundingClientRect(); return a.right <= v.left + 0.5 && v.left - a.right < 16 && Math.abs(a.top - v.top) < 2; }), 'E05 : le ✦ est juste à gauche de l’avatar, à la même hauteur');
verifie((await r.p.locator('.bt-total').evaluate((e) => getComputedStyle(e).backgroundColor)) !== 'rgb(21, 18, 15)', 'E05 : la carte Total n’est pas noire');
verifie((await r.p.locator('.dz-barre-jour').count()) === 7, 'E05 : sept barres dans la carte Total');
verifie(((await r.p.locator('.dz-total-detail').first().textContent()) || '').includes('2 chantiers · semaine '), 'E05 : « 2 chantiers · semaine … »');
verifie((await r.p.locator('.dz-aide').textContent())?.toLowerCase().includes('pointage en cours ne part pas'), 'E05 : ligne d’aide « le pointage en cours ne part pas »');
verifie((await r.p.locator('[data-testid=scan-open]').count()) === 1, 'E05 : bouton QR dans la barre du bas');
let m = await mesures(r.p);
verifie(m.cibles.length === 0, `E05 : cibles ≥ 44 px (${m.cibles.join(' ; ') || 'toutes'})`);
verifie(m.petits.length === 0, `E05 : texte ≥ 12 px (${m.petits.join(' ; ') || 'tout'})`);
verifie(m.faibles.length === 0, `E05 : contrastes ≥ 4,5:1 (${m.faibles.join(' ; ') || 'tous'})`);
verifie(!m.debordeX, 'E05 : aucun défilement horizontal');
console.log(`   E05 : premier chantier à ${m.premierHaut} px, barre du bas à ${m.barreHaut} px`);
poids.push(await cote('01-E05-pointage-en-cours-390x844', pE05, r.f, 'E05 · en cours · 390 × 844'));
// ✦ ouvre l'assistant existant, en un geste
await r.p.locator('[data-testid=dock-assistant]').click(); await r.p.waitForTimeout(900);
verifie((await r.p.locator('[data-testid=assistant-panel]').count()) > 0, 'E05 : un seul toucher sur ✦ ouvre l’assistant existant');
await r.ctx.close();
// E05 à 360 × 640
const pE05s = await photographierPlanche('E05', 360, 640);
r = await photographierImplementation('E05', 360, 640, semaineE05);
m = await mesures(r.p);
verifie(m.cibles.length === 0, `E05 à 360 × 640 : cibles ≥ 44 px (${m.cibles.join(' ; ') || 'toutes'})`);
verifie(m.petits.length === 0, `E05 à 360 × 640 : texte ≥ 12 px (${m.petits.join(' ; ') || 'tout'})`);
verifie(!m.debordeX, 'E05 à 360 × 640 : aucun défilement horizontal');
poids.push(await cote('02-E05-pointage-en-cours-360x640', pE05s, r.f, 'E05 · en cours · 360 × 640'));
await r.ctx.close();

// E04 · journée planifiée, SANS pointage en cours
const pE04 = await photographierPlanche('E04', 390, 844);
r = await photographierImplementation('E04', 390, 844, semaineE04);
verifie((await r.p.locator('.bt-total').evaluate((e) => getComputedStyle(e).backgroundColor)) !== 'rgb(21, 18, 15)', 'E04 : sans pointage, le Total est la carte crème compacte (jamais un bloc noir)');
verifie((await r.p.locator('.bt-total').evaluate((e) => e.getBoundingClientRect().height)) < 160, 'E04 : la carte Total (avec la ligne « prévues ») fait moins de 160 px de haut');
verifie((await r.p.locator('.bt-lt').count()) === 0, 'E04 : pas de carte de pointage');
verifie((await r.p.locator('.dz-onglet-badge').textContent()) === '2', 'E04 : la pastille rouge de « Plus » est là (2 rubriques à voir : réserves, formations), comme sur E05');
verifie((await r.p.locator('.dz-aide').count()) === 0, 'E04 : pas de ligne d’aide quand elle n’a rien à dire');
m = await mesures(r.p);
verifie(m.premierVisible, `E04 : le premier chantier du jour est visible sans défiler (haut ${m.premierHaut} px, barre du bas ${m.barreHaut} px)`);
verifie(m.cibles.length === 0, `E04 : cibles ≥ 44 px (${m.cibles.join(' ; ') || 'toutes'})`);
verifie(m.petits.length === 0, `E04 : texte ≥ 12 px (${m.petits.join(' ; ') || 'tout'})`);
verifie(m.faibles.length === 0, `E04 : contrastes ≥ 4,5:1 (${m.faibles.join(' ; ') || 'tous'})`);
poids.push(await cote('03-E04-sans-pointage-390x844', pE04, r.f, 'E04 · planifiée, sans pointage · 390 × 844'));
// la bande reste cliquable : un jour → la journée de ce jour
await r.p.locator('[data-testid="dz-jour-2026-10-13"]').click(); await r.p.waitForSelector('.bt-phdr-back', { timeout: 10000 });
verifie(((await r.p.locator('.bt-phdr-date').first().textContent()) || '').toLowerCase().includes('13 octobre'), 'bande : toucher mardi 13 ouvre la journée du 13');
await r.ctx.close();
const pE04s = await photographierPlanche('E04', 360, 640);
r = await photographierImplementation('E04', 360, 640, semaineE04);
m = await mesures(r.p);
verifie(m.cibles.length === 0 && m.petits.length === 0 && !m.debordeX, `E04 à 360 × 640 : cibles, texte, débordement conformes (${m.cibles.concat(m.petits).join(' ; ') || 'ok'})`);
console.log(`   E04 à 360 × 640 : premier chantier à ${m.premierHaut} px, barre du bas à ${m.barreHaut} px`);
poids.push(await cote('04-E04-sans-pointage-360x640', pE04s, r.f, 'E04 · planifiée, sans pointage · 360 × 640'));
await r.ctx.close();

// E03 · journée vide
const pE03 = await photographierPlanche('E03', 390, 844);
r = await photographierImplementation('E03', 390, 844, semaineE03);
verifie((await r.p.locator('.bt-total').evaluate((e) => getComputedStyle(e).backgroundColor)) !== 'rgb(21, 18, 15)', 'E03 : journée vide, Total crème');
verifie(((await r.p.locator('.bt-empty').textContent()) || '').includes('Aucun chantier aujourd’hui.') && ((await r.p.locator('.bt-empty').evaluate((e) => getComputedStyle(e).borderTopStyle)) === 'dashed'), 'E03 : « Aucun chantier aujourd’hui. » dans un cadre en pointillé');
verifie((await r.p.locator('.bt-empty .bt-ghostbtn').boundingBox())?.height >= 43.5 && (await r.p.locator('.bt-sec').first().isHidden()), 'E03 : « Copier la journée d’hier » de 44 px, sans titre « Chantiers du jour »');
m = await mesures(r.p);
verifie(m.cibles.length === 0 && m.petits.length === 0 && m.faibles.length === 0, `E03 : cibles, texte, contrastes conformes (${m.cibles.concat(m.petits, m.faibles).join(' ; ') || 'ok'})`);
poids.push(await cote('05-E03-journee-vide-390x844', pE03, r.f, 'E03 · journée vide · 390 × 844'));
await r.ctx.close();

// E25 · Semaine (l'onglet « Semaine » montre le planning de la semaine)
const pE25 = await photographierPlanche('E25', 390, 844);
r = await photographierImplementation('E25', 390, 844, semaineE05, async (p) => { await p.locator('[data-testid=dz-onglet-week]').click(); await p.waitForSelector('[data-testid=dz-semaine]', { timeout: 10000 }); await p.waitForTimeout(1200); });
verifie((await r.p.locator('.dz-sem-jour').count()) === 7, 'E25 : sept jours dans la Semaine');
verifie((await r.p.locator('.dz-sem-carte .dz-barre-jour').count()) === 7, 'E25 : la carte de la Semaine porte les 7 barres');
verifie((await r.p.locator('.dz-assistant').count()) === 1, 'E25 : ✦ présent dans l’en-tête de la Semaine');
await r.p.locator('.dz-sem-jour').nth(1).click(); await r.p.waitForSelector('.bt-phdr-back', { timeout: 10000 });
verifie(((await r.p.locator('.bt-phdr-date').first().textContent()) || '').toLowerCase().includes('13 octobre'), 'E25 : toucher une ligne ouvre la journée de ce jour');
await r.ctx.close();
r = await photographierImplementation('E25', 390, 844, semaineE05, async (p) => { await p.locator('[data-testid=dz-onglet-week]').click(); await p.waitForSelector('[data-testid=dz-semaine]', { timeout: 10000 }); await p.waitForTimeout(1200); });
poids.push(await cote('06-E25-semaine-390x844', pE25, r.f, 'E25 · Semaine · 390 × 844'));
await r.ctx.close();

// ── Étape 4 · pointage en cours : la ligne des pastilles se masque, « Réserves à lever » et « Formations à voir » vivent dans « Plus » ──
r = await photographierImplementation('E05-plus', 390, 844, semaineE05);
verifie(!(await r.p.locator('.dz-rappels').first().isVisible()), 'pointage en cours : la ligne des deux pastilles (réserves, formations) est masquée');
verifie(((await r.p.locator('.dz-aide').boundingBox())?.height ?? 99) < 22, 'pointage en cours : « Le pointage en cours ne part pas » tient sur UNE ligne (390 px)');
await r.p.locator('[data-testid=dz-onglet-plus]').click(); await r.p.waitForSelector('[data-testid=menu-reserves]', { timeout: 10000 });
verifie(((await r.p.locator('[data-testid=menu-reserves]').textContent()) || '').includes('Réserves à lever') && (await r.p.locator('[data-testid=menu-reserves-compteur]').textContent()) === '1', 'menu Plus : « Réserves à lever » avec son compteur (1), pendant un pointage');
verifie(((await r.p.locator('[data-testid=menu-formations]').textContent()) || '').includes('Formations à voir') && (await r.p.locator('[data-testid=menu-formations-badge]').textContent()) === '2', 'menu Plus : « Formations à voir » avec son compteur (2), pendant un pointage');
await r.p.locator('[data-testid=menu-reserves]').click(); await r.p.waitForSelector('[data-testid=reserves-dialog]', { timeout: 10000 });
verifie((await r.p.locator('[data-testid=wr-item]').count()) === 1, 'menu Plus → « Réserves à lever » ouvre la liste existante des réserves (1 réserve, bouton « Lever »)');
await r.ctx.close();
r = await photographierImplementation('E05-formations', 390, 844, semaineE05, async (p) => { await p.locator('[data-testid=dz-onglet-plus]').click(); await p.waitForSelector('[data-testid=menu-formations]', { timeout: 10000 }); await p.locator('[data-testid=menu-formations]').click(); await p.waitForTimeout(1500); });
verifie(((await r.p.locator('.bt-phscroll').textContent()) || '').includes('Port du harnais'), 'menu Plus → « Formations à voir » ouvre la liste existante des formations');
await r.ctx.close();
r = await photographierImplementation('E04-rappels', 390, 844, semaineE04);
verifie((await r.p.locator('.dz-rappels').first().isVisible()) && (await r.p.locator('.dz-rappels button').count()) === 2, 'sans pointage en cours : les deux pastilles restent affichées (1 réserve, 2 formations)');
await r.ctx.close();

// ── Étape 4 · cartes de chantier à plusieurs états, comparées à la planche ──
const rgb = (c) => c.replace(/\s/g, '');
const lisere = (p, sel) => p.locator(sel).first().evaluate((e) => getComputedStyle(e, '::before').backgroundColor);
const defilerVers = (sel) => async (p) => { await p.evaluate((sel) => { const sc = document.querySelector('.bt-day-scroll'); const el = document.querySelector(sel); const h = document.querySelector('.bt-phdr').getBoundingClientRect().bottom; sc.scrollTop += el.getBoundingClientRect().top - h - 10; }, sel); await p.waitForTimeout(400); };
async function ecranCartes(fichier, code, titre, fixture, apres, controles) {
  const pl = await photographierPlanche(code, 390, 844);
  const x = await photographierImplementation(code, 390, 844, fixture, apres);
  const mm = await mesures(x.p);
  verifie(mm.cibles.length === 0, `${code} : cibles ≥ 44 px (${mm.cibles.join(' ; ') || 'toutes'})`);
  verifie(mm.petits.length === 0, `${code} : texte ≥ 12 px (${mm.petits.join(' ; ') || 'tout'})`);
  verifie(mm.faibles.length === 0, `${code} : contrastes ≥ 4,5:1 (3:1 grand texte) (${mm.faibles.join(' ; ') || 'tous'})`);
  verifie(!mm.debordeX, `${code} : aucun défilement horizontal`);
  if (controles) await controles(x.p);
  poids.push(await cote(fichier, pl, x.f, titre));
  await x.ctx.close();
}
await ecranCartes('07-E05b-chantiers-390x844', 'E05b', 'E05b · chantiers, trou, prévu', semaineE05c, defilerVers('.bt-sec'), async (p) => {
  verifie(rgb(await lisere(p, '[data-testid=card-entry]')) === 'rgb(74,143,224)', 'E05b : liseré du matin (07:30) = bleu de tokens.css');
  verifie((await p.locator('[data-testid=card-entry]').first().evaluate((e) => getComputedStyle(e).backgroundColor.replace(/\s/g, ''))) === 'rgb(221,235,250)', 'E05b : la carte du matin a le fond « matin » de tokens.css');
  verifie(/^À ENVOYER$|^● À ENVOYER$/.test(((await p.locator('[data-testid=card-entry] .bt-badge').first().textContent()) || '').trim().toUpperCase().replace(/\s+/g, ' ')), 'E05b : étiquette d’état « À ENVOYER » en haut de la carte');
  verifie(await p.evaluate(() => { const c = document.querySelector('[data-testid=card-entry]').getBoundingClientRect(), b = document.querySelector('[data-testid=card-entry] .bt-badge').getBoundingClientRect(), n = document.querySelector('[data-testid=card-entry] .bt-iv-name').getBoundingClientRect(); return b.bottom <= n.top + 1 && b.top - c.top < 20; }), 'E05b : l’étiquette est AU-DESSUS du nom, en haut de la carte');
  verifie((await p.locator('.bt-gap-b').first().boundingBox())?.height >= 43.5, 'E05b : « Route » et « Pause » du trou font 44 px');
  verifie(rgb(await p.locator('[data-testid=card-live] .dz-etiquette, [data-testid=card-live] .bt-iv-live-k').first().evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgb(31,122,77)', 'E05b : étiquette « EN COURS » verte');
  verifie((await p.locator('[data-testid=card-planned]').first().evaluate((e) => getComputedStyle(e).borderStyle)) === 'dashed', 'E05b : le prévu est en pointillé');
  verifie(rgb(await p.locator('[data-testid=card-planned-incomplete]').evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgb(252,228,225)', 'E05b : l’avertissement du prévu est un encadré rouge pâle');
});
await ecranCartes('08-E05c-reunion-taches-390x844', 'E05c', 'E05c · réunion, tâches, Dupliquer', semaineE05c, async (p) => { await p.evaluate(() => { document.querySelector('.bt-day-scroll').scrollTop = 99999; }); await p.waitForTimeout(400); }, async (p) => {
  const m = p.locator('.bt-meet').first();
  verifie((await m.evaluate((e) => getComputedStyle(e).boxShadow)) === 'none' && (await m.evaluate((e) => getComputedStyle(e, '::before').content)) === 'none', 'E05c : la carte réunion n’a pas de barre à gauche');
  verifie(rgb(await m.evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgb(255,226,236)', 'E05c : réunion rose de tokens.css');
  const lignes = await p.locator('.bt-task').evaluateAll((es) => es.map((e) => Math.round(e.getBoundingClientRect().height)));
  verifie(lignes.length === 3 && lignes.every((h) => h >= 44), `E05c : trois lignes de tâche de 44 px au moins (${lignes.join(', ')})`);
  verifie((await p.locator('.bt-task-ok .bx').first().evaluate((e) => Math.round(e.getBoundingClientRect().width))) === 26, 'E05c : la case dessinée fait 26 px');
  verifie(await p.evaluate(() => [...document.querySelectorAll('.bt-task')].every((row) => { const r = row.getBoundingClientRect(); return [[r.left + 6, r.top + 4], [r.left + r.width / 2, r.top + r.height / 2], [r.right - 6, r.bottom - 4]].every(([x, y]) => document.elementFromPoint(x, y)?.closest('.bt-task-ok')); })), 'E05c : toute la ligne de tâche (gauche, milieu, droite) est la cible de la case');
  verifie(((await p.locator('.bt-tasks-h').textContent()) || '').includes('1/3'), 'E05c : compteur « 1/3 » dans la carte des tâches');
});
await ecranCartes('09-E12-journee-envoyee-390x844', 'E12', 'E12 · journée envoyée (envoyé, retiré, endroit noté)', semaineE12, defilerVers('.bt-sec'), async (p) => {
  const e0 = p.locator('[data-testid=card-entry]').first();
  verifie(rgb(await e0.evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgb(21,18,15)', 'E12 : la ligne envoyée est noire');
  verifie(rgb(await e0.locator('.bt-iv-times-v').evaluate((e) => getComputedStyle(e).color)) === 'rgb(255,194,26)', 'E12 : ses heures sont jaunes');
  verifie(((await e0.locator('.bt-badge').textContent()) || '').toUpperCase().includes('ENVOYÉ'), 'E12 : étiquette « ENVOYÉ ✓ »');
  verifie((await p.locator('.bt-iv-cancel .bt-cancel-name').evaluate((e) => getComputedStyle(e).textDecorationLine)) === 'line-through' && ((await p.locator('.bt-iv-cancel .bt-cancel-badge').textContent()) || '').toUpperCase().includes('RETIRÉ'), 'E12 : la ligne retirée est barrée avec l’étiquette « RETIRÉ »');
  verifie(rgb(await p.locator('.bt-iv-geo').evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgb(230,221,205)', 'E12 : « Endroit noté » est un encadré sable');
  verifie(((await p.locator('.bt-send').textContent()) || '').includes('Journée envoyée'), 'E12 : bouton « Journée envoyée ✓ »');
});
await ecranCartes('10-E42-reserves-390x844', 'E42', 'E42 · réserve à lever / levée par le bureau / levée le …', semaineE42, defilerVers('.bt-sec'), async (p) => {
  const fond = (sel) => p.locator(sel).first().evaluate((e) => getComputedStyle(e).backgroundColor.replace(/\s/g, ''));
  verifie((await fond('.bt-iv-reserve.avec')) === 'rgb(252,228,225)', 'E42 : réserve à lever = encadré rouge pâle');
  verifie((await fond('.bt-iv-reserve.levee')) === 'rgb(231,246,238)', 'E42 : levée par le bureau = encadré vert pâle');
  verifie((await fond('.bt-iv-reserve.corrige')) === 'rgb(230,221,205)', 'E42 : levée par le salarié = encadré sable');
  verifie((await p.locator('[data-testid=card-lift]').boundingBox())?.height >= 43.5, 'E42 : « Lever la réserve » fait 44 px');
});
await ecranCartes('11-E14-a-corriger-390x844', 'E14', 'E14 · renvoyée par le bureau (à corriger)', semaineE14, async (p) => { await p.locator('[data-testid="dz-jour-2026-10-13"]').click(); await p.waitForSelector('.bt-phdr-back', { timeout: 10000 }); await p.waitForTimeout(1200); }, async (p) => {
  verifie(rgb(await p.locator('[data-testid=badge-renvoyee]').evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgb(252,228,225)' && ((await p.locator('[data-testid=badge-renvoyee]').textContent()) || '').toUpperCase().includes('À CORRIGER'), 'E14 : étiquette « À CORRIGER » rouge pâle');
  verifie(rgb(await p.locator('[data-testid=card-entry]').evaluate((e) => getComputedStyle(e).borderTopColor)) === 'rgb(198,40,40)', 'E14 : la carte renvoyée a le contour rouge');
});
await ecranCartes('12-E29-noms-52-caracteres-390x844', 'E29', 'E29 · noms de 52 caractères', semaineE29, defilerVers('.bt-sec'), async (p) => {
  verifie(await p.evaluate(() => [...document.querySelectorAll('.bt-iv-name')].every((e) => e.getBoundingClientRect().height <= parseFloat(getComputedStyle(e).lineHeight) * 2 + 1)), 'E29 : un nom de 52 caractères tient sur 2 lignes au plus');
});

verifie(poids.every((k) => k < 300), `chaque image côte à côte pèse moins de 300 ko (${poids.join(', ')} ko)`);
verifie(bloquees.length > 0 && bloquees.every((u) => !u.includes('claude')), `la planche a tourné sans réseau (${bloquees.length} requêtes sortantes refusées, 0 passée)`);
verifie(erreurs.length === 0, `aucune erreur de page (${erreurs.length}) ${erreurs.slice(0, 2).join(' | ')}`);
console.log(`\n${ok} ✅ / ${ko} ❌`);
await browser.close(); srv.close(); fs.rmSync(TMP, { recursive: true, force: true });
process.exit(ko ? 1 : 0);
