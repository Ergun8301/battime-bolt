// Coque v2 du design salarié (étape 3) sur la VRAIE page /poseur?ui=2 : contrôles + captures. Même banc que captures-reference-salarie.mjs (base SIMULÉE, horloge figée mercredi 14 octobre 2026, 390×844).
//   node scripts/tests/coque-v2-salarie.mjs out docs/design-brief/integration/captures-coque-v2 4391
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
// playwright-core du projet s'il est là, sinon celui installé globalement avec playwright.
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, OUT = 'out', SH = 'docs/design-brief/integration/captures-coque-v2', PORT = '4391'] = process.argv;
fs.mkdirSync(SH, { recursive: true });
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

const FIXED = new Date('2026-10-14T08:30:00Z'); // mercredi 14 octobre 2026, 10:30 à Paris (UTC+2)
const today = '2026-10-14';
const CO = 'c0000000-0000-0000-0000-000000000001';
const ME = 'u-karim';
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', is_active: true };
const W2 = { id: 'w2', company_id: CO, client_name: 'Maison Martin', city: 'Villeurbanne', is_active: true };
const W3 = { id: 'w3', company_id: CO, client_name: 'Dépôt Gerland', city: 'Lyon', is_active: true };
const AUTRE = { id: 'w-autre', company_id: CO, client_name: 'Autre', city: '', is_active: true };
const entry = (id, ws, s, e, extra = {}) => {
  const [sh, sm] = s.split(':').map(Number); const [eh, em] = e.split(':').map(Number);
  return { id, company_id: CO, user_id: ME, worksite_id: ws.id, planning_id: null, work_date: today, start_time: `${s}:00`, end_time: `${e}:00`,
    break_minutes: 0, total_minutes: (eh * 60 + em) - (sh * 60 + sm), meal_allowance: false, status: 'draft', locked: false, exported_at: null,
    observation: null, reception: null, gap_before: null, worksite: ws, ...extra };
};
const plan = (id, ws, s, e) => ({ id, company_id: CO, user_id: ME, worksite_id: ws.id, work_date: today, absence_type: null, estimated_start: `${s}:00`, estimated_end: `${e}:00`, notes: null, worksite: ws });

const D = {
  users: [
    { id: ME, company_id: CO, first_name: 'Karim', last_name: 'Benali', role: 'worker', email: 'karim@exemple.fr', is_active: true, created_at: '2026-01-01' },
    { id: 'u-lucas', company_id: CO, first_name: 'Lucas', last_name: 'Petit', role: 'worker', email: 'lucas@exemple.fr', is_active: true, created_at: '2026-01-01' },
    { id: 'u-nina', company_id: CO, first_name: 'Nina', last_name: 'Roux', role: 'worker', email: 'nina@exemple.fr', is_active: true, created_at: '2026-01-01' },
  ],
  companies: [{ id: CO, name: 'Benali Rénovation', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, travel_paid: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35 }],
  worksites: [W1, W2, W3, AUTRE],
  planning: [], time_entries: [], active_sessions: [],
  month_closures: [], leave_requests: [], documents: [], time_entry_corrections: [], time_entry_positions: [], push_subscriptions: [],
};
let trainings = []; // lignes de rpc:my_trainings

const b = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', reducedMotion: 'reduce' });
await ctx.clock.install(); await ctx.clock.setFixedTime(FIXED); // Date figée, les minuteries tournent
const now = Math.floor(Date.now() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ME, role: 'authenticated', exp: now + 36000, aal: 'aal1' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', expires_at: now + 36000, expires_in: 36000, token_type: 'bearer', user: { id: ME, email: 'karim@exemple.fr', aud: 'authenticated', role: 'authenticated' } };
await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);

const match = (rows, sp) => {
  let out = rows;
  for (const [k, v] of sp) {
    if (v.startsWith('eq.')) { const val = v.slice(3); out = out.filter((x) => !(k in x) || String(x[k]) === val); }
    if (v.startsWith('neq.')) { const val = v.slice(4); out = out.filter((x) => !(k in x) || String(x[k]) !== val); }
  }
  return out;
};
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

const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => { errors.push(e.message); console.log('   [erreur page]', e.message); });
let n = 0; const made = [];
let query = '';
const open = async (waitFor = '.bt-total') => { await p.goto(`http://localhost:${PORT}/poseur${query}`); await p.waitForSelector(waitFor, { timeout: 15000 }); await p.waitForTimeout(1200); };
const shot = async (name) => {
  // Le pointeur hors de l'écran utile : un élément qui apparaît sous un pointeur immobile (le calendrier de la fenêtre
  // « Copier cette journée ») prendrait son état « survolé » selon l'instant d'arrivée, ce qui n'est pas un rendu.
  await p.mouse.move(2, 2);
  await p.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur()).catch(() => {});
  await p.waitForTimeout(500);
  const f = `${SH}/${String(++n).padStart(2, '0')}-${name}.png`;
  await p.screenshot({ path: f, animations: 'disabled', caret: 'hide' });
  made.push(f); console.log('📸', f, `${(fs.statSync(f).size / 1000).toFixed(0)} ko`);
};


let ok = 0, ko = 0;
const verifie = (cond, msg) => { if (cond) { ok++; console.log('✅', msg); } else { ko++; console.log('❌', msg); } };
const cls = async (d) => (await p.locator(`[data-testid="dz-jour-${d}"]`).getAttribute('class')) || '';

// A · Sans ?ui=2 : l'ancienne interface, aucune pièce de la coque v2
query = '?ui=1'; await open();
verifie((await p.locator('.dz-bande').count()) === 0 && (await p.locator('.dz-onglets').count()) === 0 && (await p.locator('.dz-kicker').count()) === 0, 'A) sans ?ui=2 : ni bande des jours, ni barre du bas, ni petit mot');
await shot('a-ancienne-interface');

// B · Avec ?ui=2 : la semaine du mercredi 14 octobre — lundi envoyé, mardi renvoyé, aujourd'hui à envoyer, jeudi prévu, vendredi congé
const J = (d, ws, s, e, extra = {}) => ({ ...entry(`e-${d}`, ws, s, e, extra), work_date: d });
D.time_entries = [
  J('2026-10-12', W1, '08:00', '16:00', { status: 'submitted', submitted_at: '2026-10-12T16:05:00Z' }),
  J('2026-10-13', W1, '08:00', '12:00', { status: 'draft', submitted_at: '2026-10-13T12:05:00Z' }),
  J('2026-10-14', W2, '08:00', '12:00', { status: 'draft' }),
];
D.planning = [
  { ...plan('p15', W1, '08:00', '17:00'), work_date: '2026-10-15' },
  { id: 'p16', company_id: CO, user_id: ME, worksite_id: null, work_date: '2026-10-16', absence_type: 'conge', estimated_start: null, estimated_end: null, notes: null },
];
query = '?ui=2'; await open('.dz-bande');
await p.waitForTimeout(1500);
verifie((await p.locator('.dz-jour').count()) === 7, 'B) la bande a 7 jours');
verifie((await p.locator('.dz-jour-l').allTextContents()).join('') === 'LMMJVSD', 'B) lundi → dimanche (LMMJVSD)');
verifie((await cls('2026-10-12')).includes('dz-jour-envoye'), 'B) lundi 12 : envoyé');
verifie((await cls('2026-10-13')).includes('dz-jour-renvoye'), 'B) mardi 13 : renvoyé par le bureau');
verifie((await cls('2026-10-14')).includes('dz-jour-a-envoyer') && (await cls('2026-10-14')).includes('is-today') && (await cls('2026-10-14')).includes('is-shown'), 'B) mercredi 14 : à envoyer, aujourd’hui et affiché');
verifie((await cls('2026-10-15')).includes('dz-jour-prevu'), 'B) jeudi 15 : prévu');
verifie((await cls('2026-10-16')).includes('dz-jour-absence') && (await p.locator('[data-testid="dz-jour-2026-10-16"] .dz-jour-p').textContent()) === 'C', 'B) vendredi 16 : congé (lettre C)');
verifie((await cls('2026-10-17')).includes('dz-jour-vide'), 'B) samedi 17 : vide');
verifie((await p.locator('[data-testid=dz-kicker]').textContent()) === 'AUJOURD’HUI', 'B) petit mot : AUJOURD’HUI');
verifie((await p.locator('.dz-onglet').allTextContents()).join('|') === 'Journée|Semaine|Mois|Plus', 'B) barre du bas : Journée · Semaine · Mois · Plus');
verifie((await p.locator('.dz-onglet.is-on').textContent()) === 'Journée', 'B) « Journée » est l’onglet actif');
// cibles tactiles de 44 px au moins
const petites = await p.evaluate(() => [...document.querySelectorAll('.dz-jour, .dz-onglet')].filter((e) => { const r = e.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).length);
verifie(petites === 0, 'B) toutes les cibles de la bande et de la barre font 44 px au moins');
// pas de défilement horizontal
verifie(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'B) aucun défilement horizontal à 390 px');
await shot('b-coque-v2-journee');

// C · Navigation : un jour de la bande, puis l'onglet Semaine, puis « Plus » (le menu du compte)
await p.locator('[data-testid="dz-jour-2026-10-13"]').click();
await p.waitForSelector('.bt-phdr-back', { timeout: 10000 });
verifie((await p.locator('.bt-phdr-date').first().textContent())?.toLowerCase().includes('13 octobre'), 'C) toucher mardi 13 ouvre ce jour');
verifie((await cls('2026-10-13')).includes('is-shown'), 'C) le jour affiché est marqué dans la bande');
await shot('c-jour-ouvert');
await p.locator('[data-testid=dz-onglet-week]').click();
await p.waitForTimeout(1200);
verifie((await p.locator('.dz-onglet.is-on').textContent()) === 'Semaine', 'C) l’onglet Semaine devient actif');
await shot('c-semaine');
await p.locator('[data-testid=dz-onglet-plus]').click();
await p.waitForTimeout(600);
verifie((await p.getByText('Mes congés').count()) > 0, 'C) « Plus » ouvre le menu du compte');
await shot('c-plus-menu');
await p.keyboard.press('Escape');
await p.locator('[data-testid=dz-onglet-day]').click();
await p.waitForSelector('.dz-kicker');
verifie((await p.locator('[data-testid=dz-kicker]').textContent()) === 'AUJOURD’HUI', 'C) retour à la journée');


// E · Mini-frise de la journée (étape 4) : fait, en cours, à envoyer, prévu — et absente sans ?ui=2
D.time_entries = [
  J('2026-10-14', W1, '07:00', '08:30', { id: 'e-fait', status: 'submitted', submitted_at: '2026-10-14T06:35:00Z' }),
  J('2026-10-14', W2, '13:00', '15:00', { id: 'e-draft', status: 'draft' }),
];
D.planning = [{ ...plan('p-soir', W3, '16:00', '17:00'), work_date: '2026-10-14' }];
D.active_sessions = [{ user_id: ME, company_id: CO, worksite_id: 'w1', planning_id: null, work_date: today, started_at: new Date(FIXED.getTime() - 60 * 60000).toISOString() }];
query = '?ui=2'; await open('.dz-bande');
await p.waitForSelector('[data-testid=dz-frise]', { timeout: 10000 });
for (const t of ['fait', 'en-cours', 'a-envoyer', 'prevu']) verifie((await p.locator(`[data-testid=dz-frise-seg-${t}]`).count()) === 1, `E) la frise montre un segment « ${t} »`);
const larg = await p.evaluate(() => [...document.querySelectorAll('.dz-frise-seg')].map((e) => Math.round(e.getBoundingClientRect().width)));
verifie(larg.every((w) => w >= 6), `E) aucun segment invisible (largeurs ${larg.join(', ')} px)`);
verifie(((await p.locator('[data-testid=dz-frise]').getAttribute('aria-label')) || '').includes('en cours'), 'E) la frise a une description pour les lecteurs d’écran');
await shot('e-frise');
query = '?ui=1'; await open();
verifie((await p.locator('[data-testid=dz-frise]').count()) === 0, 'E) sans ?ui=2 : pas de frise');
D.active_sessions = []; D.time_entries = []; D.planning = [];


// F · Une ligne renvoyée par le bureau (brouillon déjà envoyé une fois) : « À corriger » avec ?ui=2, « À envoyer » sans
D.time_entries = [J('2026-10-14', W1, '08:00', '12:00', { id: 'e-renvoyee', status: 'draft', submitted_at: '2026-10-13T12:05:00Z' })];
query = '?ui=2'; await open('.dz-bande');
await p.waitForSelector('[data-testid=card-entry]', { timeout: 10000 });
verifie((await p.locator('[data-testid=badge-renvoyee]').textContent()) === '● À corriger', 'F) avec ?ui=2 : « À corriger » sur la ligne renvoyée');
query = '?ui=1'; await open(); await p.waitForSelector('[data-testid=card-entry]', { timeout: 10000 });
verifie((await p.locator('[data-testid=badge-renvoyee]').count()) === 0 && ((await p.locator('.bt-badge-wait').first().textContent()) || '').includes('À envoyer'), 'F) sans ?ui=2 : « À envoyer » comme avant');
D.time_entries = [];

// D · Le mode est mémorisé pour la session ; ?ui=1 l'éteint
query = '?ui=2'; await open('.dz-bande');
query = ''; await open('.dz-bande');
verifie((await p.locator('.dz-bande').count()) === 1, 'D) ?ui=2 est mémorisé pour la session');
query = '?ui=1'; await open();
verifie((await p.locator('.dz-bande').count()) === 0, 'D) ?ui=1 revient à l’ancienne interface');

verifie(errors.length === 0, `aucune erreur de page (${errors.length})`);
console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
