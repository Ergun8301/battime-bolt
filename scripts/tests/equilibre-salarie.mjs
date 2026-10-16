// Équilibre visuel entre les pages du salarié (Journée / Semaine / Mois / Historique / menu « Mon compte »), à 390×844 et 360×640.
//   npm run build && node scripts/tests/equilibre-salarie.mjs out docs/design-brief/integration/captures-equilibre 4393
// Mêmes données simulées que fidelite-salarie.mjs (horloge figée jeudi 15 octobre 2026, 15:12) ; un mois d'octobre plus rempli pour juger le résumé du Mois.
import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [,, OUT = 'out', SH = 'docs/design-brief/integration/captures-equilibre', PORT = '4393'] = process.argv;
const CHROME = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
fs.mkdirSync(SH, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'equilibre-'));
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
let delaiEcriture = 0; // ms : retarde les écritures simulées (pour voir « Envoi en cours… »)
// Étapes 6 et 7 : la fonction Edge `kiosk` (page /pointer) et le stockage des documents sont simulés par l'écran qui en a besoin.
let kioskReponse = (r) => r.fulfill({ json: {} });
let VIDEO = null; // une vraie petite vidéo WebM (lecteur des formations), fabriquée par le navigateur au premier besoin
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
async function contexte(largeur, hauteur, { sansSession = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: largeur, height: hauteur }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', reducedMotion: 'reduce' });
  await ctx.clock.install(); await ctx.clock.setFixedTime(FIXED);
  if (!sansSession) await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const req = r.request(); const u = new URL(req.url()); const method = req.method();
    if (u.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (u.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (u.pathname.startsWith('/functions/v1/kiosk')) return kioskReponse(r);
    if (u.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} });
    if (u.pathname === '/storage/v1/object/sign/chantier-docs' && method === 'POST') { let b = {}; try { b = req.postDataJSON() || {}; } catch { /* corps vide */ } return r.fulfill({ json: (b.paths || []).map((x) => ({ path: x, signedURL: `/object/sign/chantier-docs/${x}?token=t`, error: null })) }); }
    if (u.pathname.startsWith('/storage/v1/object/sign/formations')) return method === 'POST' ? r.fulfill({ json: { signedURL: '/object/sign/formations/v.webm?token=t' } }) : r.fulfill({ status: 200, contentType: 'video/webm', body: VIDEO || PNG });
    if (u.pathname.startsWith('/storage/v1/')) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    if (u.pathname === '/rest/v1/rpc/my_trainings') return r.fulfill({ json: trainings });
    if (u.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
    const t = u.pathname.replace('/rest/v1/', '');
    const rows = match(D[t] || [], u.searchParams);
    if (method === 'GET' || method === 'HEAD') return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
    if (delaiEcriture) await new Promise((ok) => setTimeout(ok, delaiEcriture));
    return r.fulfill({ status: 201, json: rows.length ? rows[0] : { id: 'new-1' } });
  });
  return ctx;
}
const erreurs = [];


// Un mois d'octobre rempli : jours envoyés (avec panier), deux congés, la semaine en cours de la planche.
function octobre() {
  semaineE05(); // la semaine du 12 au 18 (en cours jeudi)
  const e = (id, d, ws, s, f, extra = {}) => ligne(id, d, ws, s, f, { ...envoyee, ...extra });
  D.time_entries.push(
    e('o1', '2026-10-01', W1, '08:00', '17:00', { meal_allowance: true }), e('o2', '2026-10-02', W1, '08:00', '16:00'),
    e('o5', '2026-10-05', W2, '08:00', '16:30', { meal_allowance: true }), e('o6', '2026-10-06', W2, '08:00', '17:00', { meal_allowance: true }),
    e('o7', '2026-10-07', W1, '08:00', '12:00'), e('o8', '2026-10-08', W1, '08:00', '16:00', { meal_allowance: true }),
    e('o9', '2026-10-09', W2, '08:00', '15:00'),
  );
  D.planning.push(
    { id: 'c1', company_id: CO, user_id: ME, worksite_id: null, work_date: '2026-10-03', absence_type: 'conge', estimated_start: null, estimated_end: null, notes: null },
    { id: 'c2', company_id: CO, user_id: ME, worksite_id: null, work_date: '2026-10-04', absence_type: 'conge', estimated_start: null, estimated_end: null, notes: null },
  );
}
const ROLE = process.env.ROLE || 'worker';
const sorties = [];
async function prise(nom, largeur, hauteur, aller) {
  const ctx = await contexte(largeur, hauteur);
  D.worksites = [W1, W2, AUTRE, W3]; D.month_closures = []; D.meetings = []; D.day_tasks = [];
  octobre(); D.users[0].role = ROLE;
  const p = await ctx.newPage(); p.on('pageerror', (er) => erreurs.push(er.message));
  await p.goto(`http://localhost:${PORT}/poseur`); await p.waitForSelector('.dz-bande', { timeout: 20000 }); await p.waitForTimeout(1500);
  if (aller) await aller(p);
  await p.mouse.move(2, 2); await p.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur()).catch(() => {});
  await p.waitForTimeout(500);
  const f = path.join(SH, `${nom}-${largeur}x${hauteur}.png`);
  await p.screenshot({ path: f, animations: 'disabled', caret: 'hide' });
  const infos = await p.evaluate(() => ({ menu: [...document.querySelectorAll('.dz-plus [role=menuitem]')].map((x) => x.textContent.trim()), onglets: [...document.querySelectorAll('.dz-onglet')].map((x) => x.textContent.trim()), kicker: document.querySelector('.bt-phdr .dz-kicker')?.textContent ?? null, titre: document.querySelector('.bt-phdr-date')?.textContent ?? null, assistant: !!document.querySelector('.dz-assistant') }));
  console.log('📸', f, JSON.stringify(infos));
  sorties.push({ nom, largeur, infos });
  if (nom === 'acces') fs.rmSync(f, { force: true });
  return { p, infos, ctx };
}
let ok = 0, ko = 0;
const verifie = (cond, msg) => { if (cond) { ok++; console.log('✅', msg); } else { ko++; console.log('❌', msg); } };
const aller = {
  journee: async () => {},
  semaine: async (p) => { await p.locator('[data-testid=dz-onglet-week]').click(); await p.waitForTimeout(1500); },
  mois: async (p) => { await p.locator('[data-testid=dz-onglet-month]').click(); await p.waitForTimeout(1500); },
  historique: async (p) => { await p.locator('button[aria-label^="Mon compte"]').click(); await p.waitForTimeout(500); await p.locator('[data-guide="menu.historique"]').click(); await p.waitForTimeout(1800); },
  menu: async (p) => { await p.locator('button[aria-label^="Mon compte"]').click(); await p.waitForTimeout(800); },
};
const fond = (p, sel) => p.locator(sel).first().evaluate((e) => getComputedStyle(e).backgroundColor);
const SOMBRE = 'rgb(27, 23, 19)';
// Les contrôles propres à chaque page (la même grammaire que la Journée : petit mot jaune, cartes, barre du bas à 3 onglets, ✦ visible, pastille sur l'avatar).
const controles = {
  journee: async (p, l) => {
    verifie(((await p.locator('.bt-phdr .dz-kicker').textContent()) || '') === 'AUJOURD’HUI', `Journée ${l} : petit mot jaune AUJOURD’HUI`);
  },
  semaine: async (p, l) => {
    verifie(((await p.locator('.bt-phdr .dz-kicker').textContent()) || '') === 'MES HEURES' && (await p.locator('.bt-phdr-back').count()) === 0, `Semaine ${l} : petit mot jaune MES HEURES, pas de flèche (la barre du bas suffit)`);
    verifie((await fond(p, '.dz-sem-carte')) === SOMBRE, `Semaine ${l} : carte de total sombre, comme le pointage de la Journée`);
  },
  mois: async (p, l) => {
    verifie(((await p.locator('.bt-phdr .dz-kicker').textContent()) || '') === 'MES HEURES', `Mois ${l} : petit mot jaune MES HEURES`);
    verifie((await fond(p, '[data-testid=dz-mois-total]')) === SOMBRE, `Mois ${l} : résumé du mois sur carte sombre`);
    const t = async (id) => ((await p.locator(`[data-testid=${id}] .bt-stat-n`).textContent()) || '').trim();
    verifie(((await p.locator('[data-testid=dz-mois-total] .bt-total-big').textContent()) || '') === '69:30', `Mois ${l} : heures du mois 69:30 (envoyées)`);
    verifie((await t('mois-jours')) === '9' && (await t('mois-paniers')) === '4' && (await t('mois-conges')) === '3' && (await t('mois-a-envoyer')) === '2', `Mois ${l} : 9 jours, 4 paniers, 3 congés, 2 jours à envoyer`);
    verifie(((await p.locator('[data-testid=dz-mois-total]').textContent()) || '').includes('12h00 à envoyer'), `Mois ${l} : « + 12h00 à envoyer » (brouillons)`);
    verifie(await p.evaluate(() => { const r = document.querySelector('[data-testid=dz-mois-stats]').getBoundingClientRect(); return r.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('[data-testid=dz-mois-stats] .dz-compteur-cle')].every((e) => e.getBoundingClientRect().height < 16); }), `Mois ${l} : tuiles sur une ligne, sans débordement`);
    verifie((await p.locator('.dz-mois .dz-sem-pastille[data-etat=absence]').count()) === 3, `Mois ${l} : un congé affiche la pastille CONGÉ (3 jours), plus « À déclarer »`);
  },
  historique: async (p, l) => {
    verifie(((await p.locator('.bt-phdr .dz-kicker').textContent()) || '') === 'MES HEURES' && (await p.locator('.bt-phdr-back').count()) === 1, `Historique ${l} : petit mot jaune, flèche de retour`);
  },
  menu: async (p, l) => {
    const noms = (await p.locator('[role=menu] [role=menuitem]').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
    const attendu = ['Historique', 'Réserves à lever', 'Formations à voir', 'Mes congés', ...(ROLE === 'lead' ? ['Mon équipe'] : []), 'Changer ma photo', 'Informations', 'Activer les notifications', 'Déconnexion'];
    verifie(attendu.every((n) => noms.some((x) => x.startsWith(n))) && noms.length === attendu.length, `Menu ${l} : exactement ${attendu.length} lignes (${noms.join(' | ')})`);
    verifie(!noms.some((x) => /^(Ma journée|Ma semaine|Mon mois|Assistant)/.test(x)), `Menu ${l} : ni Journée/Semaine/Mois ni Assistant (doublons)`);
    verifie(((await p.locator('.bt-phdr-date').first().textContent()) || '') === 'Mon compte', `Menu ${l} : titre « Mon compte »`);
  },
};
for (const [l, h] of [[390, 844], [360, 640]]) for (const nom of ['journee', 'semaine', 'mois', 'historique', 'menu']) {
  const { p, ctx } = await prise(nom, l, h, aller[nom]);
  const lab = `${l}×${h}`;
  verifie((await p.locator('.dz-onglet').allTextContents()).join('|') === 'Journée|Semaine|Mois', `${nom} ${lab} : barre du bas = Journée · Semaine · Mois (plus de « Plus »)`);
  verifie((await p.locator('.dz-assistant').count()) === 1 && (await p.locator('.dz-assistant').evaluate((e) => { const r = e.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && r.right <= innerWidth && getComputedStyle(e).backgroundColor === 'rgb(255, 194, 26)'; })), `${nom} ${lab} : le ✦ jaune (assistant) est visible dans l’en-tête, 44 px`);
  verifie(((await p.locator('.dz-avatar-badge').textContent()) || '') === '2', `${nom} ${lab} : pastille rouge « 2 à voir » sur l’avatar`);
  verifie(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `${nom} ${lab} : aucun défilement horizontal`);
  await controles[nom](p, lab);
  await ctx.close();
}
// Rien d'essentiel ne devient inaccessible : chaque rubrique s'ouvre depuis « Mon compte » (chef d'équipe : « Mon équipe » aussi).
{
  const { p, ctx } = await prise('acces', 390, 844, aller.menu);
  const ligne = (n) => p.getByRole('menuitem', { name: n });
  const rouvrir = async () => { if (!(await p.locator('[data-testid=dz-plus]').count())) { await p.locator('button[aria-label^="Mon compte"]').click(); await p.waitForTimeout(500); } };
  await ligne('Historique').click(); await p.waitForTimeout(1200);
  verifie((await p.locator('.dz-histo').count()) === 1, 'Accès : « Historique » s’ouvre depuis Mon compte'); await rouvrir();
  await ligne('Réserves à lever').click(); await p.waitForTimeout(1200);
  verifie((await p.locator('[data-testid=reserves-dialog]').count()) === 1, 'Accès : « Réserves à lever » ouvre la liste des réserves'); await p.keyboard.press('Escape'); await p.waitForTimeout(400); await rouvrir();
  await ligne('Formations à voir').click(); await p.waitForTimeout(1200);
  verifie((await p.locator('.bt-tr-row').count()) >= 1, 'Accès : « Formations à voir » ouvre la liste'); await rouvrir();
  await ligne('Mes congés').click(); await p.waitForTimeout(1200);
  verifie((await p.locator('[role=dialog]').count()) >= 1, 'Accès : « Mes congés » ouvre la feuille'); await p.keyboard.press('Escape'); await p.waitForTimeout(500); await rouvrir();
  await ligne('Informations').click(); await p.waitForTimeout(800);
  verifie((await p.locator('.bt-info').count()) === 1, 'Accès : « Informations » (l’endroit au pointage) ouvre la feuille'); await p.locator('.bt-info button').click(); await p.waitForTimeout(400); await rouvrir();
  verifie((await ligne('Changer ma photo').count()) === 1 && (await ligne('Déconnexion').count()) === 1, 'Accès : « Changer ma photo » et « Déconnexion » sont là');
  if (ROLE === 'lead') { await ligne('Mon équipe').click(); await p.waitForSelector('[data-testid=team-day]', { timeout: 10000 }); verifie(true, 'Accès : « Mon équipe » (chef) s’ouvre'); }
  await ctx.close();
}
if (erreurs.length) { ko++; console.log('❌ erreurs de page', erreurs); }
console.log(`${ok} ✅ / ${ko} ❌`);
await browser.close(); srv.close();
