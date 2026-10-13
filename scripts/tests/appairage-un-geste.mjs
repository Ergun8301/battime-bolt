// Lot 11 (IA) — appairage de la tablette en un seul geste : les ÉCRANS.
// Lancer : node scripts/tests/appairage-un-geste.mjs out docs/captures-appairage-lot11 (après npm run build).
//
//  T) La tablette (/borne non reliée) : QR + code de vérification, sondage 3 s puis
//     8 s, onglet caché, approbation → planning, secret jamais stocké, saisie en
//     cours (le QR ne passe pas devant les doigts), renouvellement (même code),
//     états expired/cancelled/used/suspended, arrêt d'inactivité à 30 min,
//     replis silencieux (400, 404, 501, available:false, 429, 5xx, réseau),
//     ?code=… sans demande, bandeaux « déconnectée », hauteur réduite, verrou
//     d'écran.
//  B) Le bureau : /admin#borne=… → « Associer cette tablette ? » (4 codes, second
//     geste pour une tablette en service, erreurs du serveur, mode support, patron
//     déconnecté qui revient après la connexion, vérification de bout en bout,
//     bannière cookies) puis la fenêtre « Borne » (code caché derrière « Relier
//     une autre tablette »).
//  E) Un parcours complet : la tablette affiche son QR, le patron confirme, la
//     tablette se relie.
// La fonction `kiosk` est simulée (ctx.route) ; ses vraies règles sont testées par
// npm run test:kiosk-fonction. Aucun message d'erreur ni `pageerror` dans les replis.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const { chromium } = await import('playwright-core')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.mjs'));
const [,, OUT = 'out', SH = 'docs/captures-appairage-lot11', PORT_ARG = '0'] = process.argv; fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT_ARG), r));
const PORT = srv.address().port;
const BASE = `http://localhost:${PORT}`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hscroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

// ── Données fictives ────────────────────────────────────────────────────────
const CO = 'c0000000-0000-0000-0000-000000000001';
const SECRET = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE'; // 43 signes (secret d'appareil fictif)
const CODE = 'K7M 4QX';
const CHOICES = [CODE, '3FD 9RT', 'HNW 2CE', 'PA6 VYG'];
/** Identifiant de demande fictif : 45 octets (version 1) en base64url = 60 signes. */
const makeRid = (n) => { const x = Buffer.alloc(45, n % 251); x[0] = 1; x.writeUInt32BE(1790000000 + n, 1); x[43] = n >> 8; x[44] = n & 255; return x.toString('base64url'); };
const SETTINGS = { show_planning: true, require_gps: false, active_from: null, active_until: null };
const SEED = 'ZGVtby1ib3JuZS1iZW1leG8tbmUtcGFzLXV0aWxpc2Vy';
const NOW = new Date('2026-10-01T07:30:00Z'); // jeudi 09:30 à Paris
const DAYS = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
const BOARD = {
  week_start: DAYS[0], today: DAYS[3], days: DAYS,
  workers: [{ k: 'w0', first_name: 'Karim', last_name: 'Haddad', tint: 3 }, { k: 'w1', first_name: 'Julie', last_name: 'Bernard', tint: 1 }],
  slots: DAYS.slice(0, 5).flatMap((d) => [
    { w: 'w0', date: d, title: 'Villa Dupont', sub: 'Lyon 6e', hours: '07:30–16:30', color: 4, live: null },
    { w: 'w1', date: d, title: 'Cuisine Martin', sub: 'Villeurbanne', hours: '08:00–17:00', color: 1, live: null },
  ]),
  absences: [], live_extra: [],
};
const APPROVED = { status: 'approved', kiosk_id: 'k-qr', token: 'jeton-qr-fictif', seed: SEED, step: 60, digits: 8, kiosk_name: 'Borne', company_name: 'Martin Menuiserie', settings: SETTINGS };
const NOTICE = 'Tablette déconnectée par le bureau (ou remplacée par une autre). Tapez un nouveau code pour la relier.';
const NOTICE_QR = 'Tablette déconnectée par le bureau (ou remplacée par une autre). Scannez le QR pour la relier de nouveau.';
const SUSPENDED_TEXT = 'Borne suspendue pour votre entreprise. La liaison reprendra dès qu’elle sera réactivée.';
const WAITING_TEXT = 'En attente de votre confirmation sur le téléphone…';

// ═══════════════════════════════════════════════════════════════════════════
// T) LA TABLETTE
// ═══════════════════════════════════════════════════════════════════════════
/**
 * La tablette avec une fonction `kiosk` simulée. `S` (modifiable par le test) :
 *  · S.request(body) / S.status(body) : réponse { status?, json } ou 'abort' ;
 *  · S.gate : promesse qui retient la réponse de `pair_request` ;
 *  · S.syncStatus : réponse de `sync` (410 = tablette déconnectée par le bureau).
 */
async function tablet({ width = 1280, height = 800, isMobile = false, cache = null, wakeLock = false } = {}) {
  const ctx = await b.newContext({ viewport: { width, height }, locale: 'fr-FR', timezoneId: 'Europe/Paris', hasTouch: isMobile, isMobile });
  await ctx.clock.install({ time: NOW });
  if (wakeLock) await ctx.addInitScript(() => {
    window.__wl = 0;
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { window.__wl++; return { released: false, release: async () => {}, addEventListener() {}, removeEventListener() {} }; } } });
  });
  if (cache) await ctx.addInitScript(([k, v]) => { if (!sessionStorage.getItem('init')) { localStorage.setItem(k, v); sessionStorage.setItem('init', '1'); } }, ['bx_kiosk_v1', JSON.stringify(cache)]);
  const fn = [];
  const S = {
    n: 0, gate: null, syncStatus: 200,
    request: (body) => {
      const n = ++S.n;
      return { json: { available: true, request_id: makeRid(n), ...(body.device_secret ? {} : { device_secret: SECRET }), display_code: CODE, expires_at: new Date(NOW.getTime() + 600e3).toISOString(), ttl_s: 600 } };
    },
    status: () => ({ json: { status: 'pending' } }),
  };
  const answer = (r, a) => (a === 'abort' ? r.abort('failed') : r.fulfill({ status: a.status || 200, json: a.json }));
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.startsWith('/functions/v1/kiosk')) {
      const body = JSON.parse(r.request().postData() || '{}');
      fn.push(body);
      if (body.action === 'pair_request') { if (S.gate) await S.gate; return answer(r, S.request(body)); }
      if (body.action === 'pair_status') return answer(r, S.status(body));
      if (body.action === 'sync') {
        if (S.syncStatus === 410) return r.fulfill({ status: 410, json: { error: 'Tablette déconnectée' } });
        return r.fulfill({ json: { revoked: false, kiosk_name: 'Borne', company_name: 'Martin Menuiserie', settings: SETTINGS, planning: [] } });
      }
      if (body.action === 'board') return r.fulfill({ json: BOARD });
      if (body.action === 'pair') {
        if (body.code !== '123456') return r.fulfill({ status: 400, json: { error: 'Code incorrect ou expiré.' } });
        return r.fulfill({ json: { kiosk_id: 'k-code', token: 'jeton-code', seed: SEED, step: 60, digits: 8, kiosk_name: 'Borne', company_name: 'Martin Menuiserie', settings: SETTINGS } });
      }
      return r.fulfill({ status: 400, json: { error: 'Action inconnue' } });
    }
    return r.fulfill({ json: {} });
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => { errs.push(e.message); console.log('   [erreur page]', e.message); });
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  const calls = (a) => fn.filter((c) => c.action === a);
  /** Avance l'horloge de la page seconde par seconde (les réponses réseau arrivent en temps réel entre deux pas). */
  const adv = async (ms, step = 1000) => { for (let t = 0; t < ms; t += step) { await p.clock.runFor(Math.min(step, ms - t)); await sleep(30); } await sleep(120); };
  /** Saute dans le temps (un seul passage des minuteries) : pour les longues durées. */
  const jump = async (ms) => { await p.clock.fastForward(ms); await sleep(250); };
  const open = async (url = '/borne') => { await p.goto(`${BASE}${url}`); };
  const waitQr = () => p.waitForSelector('[data-testid=kb-pair-qr]', { timeout: 8000 }).catch(() => {});
  return { ctx, p, fn, S, errs, calls, adv, jump, open, waitQr };
}
const jump21 = async (p) => { await p.clock.fastForward(21_000); await sleep(250); };
const qrCount = (p) => p.locator('[data-testid=kb-pair-qr]').count();
const bodyText = (p) => p.evaluate(() => document.body.innerText);
const legacyScreen = async (p, tag) => {
  const t = await bodyText(p);
  check(await qrCount(p) === 0 && await p.locator('[data-testid=kb-code-fallback]').count() === 0, `${tag} : pas de QR, pas de repli (écran d’avant)`);
  check(/Relier cette tablette/.test(t) && /Tapez le code à 6 chiffres affiché dans BEMEXO \(bouton 📟 Borne\)\./.test(t) && /Une seule tablette par entreprise/.test(t), `${tag} : écran actuel (code à 6 chiffres)`);
  check(!/erreur|impossible|indisponible|Action inconnue/i.test(t), `${tag} : aucun message à l’écran`);
  await p.focus('.kp-code');
  check(await p.evaluate(() => document.activeElement?.classList.contains('kp-code')), `${tag} : le champ du code se focalise`);
};

// ── T1 · le QR, le code, le sondage, l'approbation ─────────────────────────
{
  const { ctx, p, fn, S, errs, calls, adv, open, waitQr } = await tablet({ wakeLock: true });
  await open();
  await waitQr();
  const url = await p.locator('[data-testid=kb-pair-qr]').getAttribute('data-url');
  check(new RegExp(`^${BASE}/admin#borne=[A-Za-z0-9_-]{60}$`).test(url || ''), `T1) le QR encode ${BASE}/admin#borne=<60 signes> (${(url || '').slice(0, 40)}…)`);
  check(await p.locator('[data-testid=kb-pair-qr] svg').count() === 1 && await p.locator('[data-testid=kb-pair-qr]').getAttribute('role') === 'img'
    && await p.locator('[data-testid=kb-pair-qr]').getAttribute('aria-label') === 'QR pour relier cette tablette', 'T1) le QR est une image avec son texte alternatif');
  check((await p.locator('[data-testid=kb-pair-code]').innerText()).trim() === CODE, `T1) code de vérification « ${CODE} » en vrai texte`);
  const t = await bodyText(p);
  check(/Relier cette tablette/.test(t) && /Scannez ce QR avec votre téléphone, connectez-vous à BEMEXO si besoin, puis touchez le même code de vérification que celui-ci\./.test(t), 'T1) titre et consigne');
  check(/Code de vérification/i.test(t) && (await p.locator('[data-testid=kb-pair-status]').innerText()).trim() === WAITING_TEXT, 'T1) « Code de vérification » + « En attente de votre confirmation sur le téléphone… »');
  check(await p.locator('[data-testid=kb-pairing]').isVisible() && await p.locator('[data-testid=kb-code-fallback]').getAttribute('open') === null && await p.locator('.kp-code').count() === 1, 'T1) le formulaire est là, le secours est FERMÉ, le champ du code est dans le DOM');
  check(/Pas de téléphone sous la main \? Taper un code à 6 chiffres/.test(await p.locator('[data-testid=kb-code-fallback] summary').innerText()), 'T1) « Pas de téléphone sous la main ? Taper un code à 6 chiffres »');
  const req = calls('pair_request');
  check(req.length === 1 && JSON.stringify(Object.keys(req[0])) === '["action"]', `T1) UN pair_request, sans secret la première fois (${JSON.stringify(req[0])})`);
  check(await p.evaluate(() => window.__wl) >= 1, 'T1) verrou d’écran demandé pendant que le QR attend');
  check(await p.evaluate(() => document.activeElement?.tagName !== 'INPUT'), 'T1) aucun champ focalisé (pas de clavier devant le QR)');
  await p.screenshot({ path: `${SH}/tablette-qr-1280x800.png` });
  // Sondage : toutes les 3 s pendant 3 min.
  const n0 = calls('pair_status').length;
  await adv(10_000);
  const n1 = calls('pair_status').length - n0;
  check(n1 >= 3 && n1 <= 4, `T1) pair_status toutes les ~3 s (${n1} en 10 s)`);
  const st = calls('pair_status')[0];
  check(JSON.stringify(Object.keys(st).sort()) === '["action","device_secret","request_id"]' && st.device_secret === SECRET && st.request_id === url.split('#borne=')[1], 'T1) pair_status envoie l’identifiant ET le secret d’appareil');
  // Onglet caché : plus aucun sondage ; reprise tout de suite au retour.
  const setVis = (v) => p.evaluate((x) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => x }); document.dispatchEvent(new Event('visibilitychange')); }, v);
  await setVis('hidden');
  await sleep(200);
  const n2 = calls('pair_status').length;
  await adv(15_000);
  check(calls('pair_status').length === n2, `T1) onglet caché : aucun sondage en 15 s (${calls('pair_status').length - n2})`);
  await setVis('visible');
  await sleep(300);
  check(calls('pair_status').length > n2, 'T1) retour sur l’onglet : sondage immédiat');
  // Après 3 min : toutes les 8 s.
  await p.clock.runFor(190_000); await sleep(200);
  const n3 = calls('pair_status').length;
  await adv(24_000);
  const n4 = calls('pair_status').length - n3;
  check(n4 >= 2 && n4 <= 4, `T1) au-delà de 3 min : toutes les ~8 s (${n4} en 24 s)`);
  // Approbation → planning, appairage gardé, aucun secret stocké.
  S.status = () => ({ json: APPROVED });
  await adv(9_000);
  await p.waitForSelector('[data-testid=kb-week]', { timeout: 8000 }).catch(() => {});
  check(await p.locator('[data-testid=kb-week]').isVisible(), 'T1) approuvée : le planning s’affiche');
  const store = await p.evaluate(() => ({ ls: JSON.stringify(Object.entries(localStorage)), ss: JSON.stringify(Object.entries(sessionStorage)), href: location.href }));
  const saved = JSON.parse(await p.evaluate(() => localStorage.getItem('bx_kiosk_v1')));
  check(saved?.kioskId === 'k-qr' && saved?.token === 'jeton-qr-fictif' && saved?.companyName === 'Martin Menuiserie', 'T1) bx_kiosk_v1 écrit comme avec le code à 6 chiffres');
  check(![SECRET, url.split('#borne=')[1]].some((x) => store.ls.includes(x) || store.ss.includes(x) || store.href.includes(x)), 'T1) ni le secret d’appareil ni l’identifiant dans localStorage, sessionStorage ou l’adresse');
  const n5 = calls('pair_status').length; const r5 = calls('pair_request').length;
  await adv(30_000, 5000);
  check(calls('pair_status').length === n5 && calls('pair_request').length === r5, 'T1) plus aucun pair_status ni pair_request après la liaison');
  check(errs.length === 0, `T1) aucune erreur de page (${errs.length})`);
  await ctx.close();
}

// ── T2 · saisie en cours : le QR ne passe pas devant les doigts ─────────────
{
  const { ctx, p, S, errs, calls, jump, open } = await tablet();
  let release; S.gate = new Promise((res) => { release = res; });
  await open();
  await p.waitForSelector('.kp-code', { timeout: 8000 });
  await p.click('.kp-code'); await p.keyboard.type('123');
  release(); await sleep(500);
  check(await calls('pair_request').length === 1 && await qrCount(p) === 0 && await p.inputValue('.kp-code') === '123', 'T2) 3 chiffres tapés, la demande arrive : le QR n’est PAS affiché, la saisie est gardée');
  // Clavier encore ouvert (champ focalisé, chiffres tapés) : 20 s de pause ne font pas sauter l'écran.
  await jump(21_000);
  await sleep(200);
  check(await qrCount(p) === 0 && await p.inputValue('.kp-code') === '123' && await p.evaluate(() => document.activeElement?.classList.contains('kp-code')),
    'T2) 20 s de pause, champ encore actif : le QR n’est PAS affiché, le focus (clavier) et la saisie sont gardés');
  // Au bout de 2 min sans toucher à rien, le QR apparaît quand même (tablette laissée avec une saisie).
  await jump(100_000);
  await p.waitForSelector('[data-testid=kb-pair-qr]', { timeout: 5000 }).catch(() => {});
  check(await qrCount(p) === 1, 'T2) 2 min de silence, champ actif : le QR apparaît');
  check(await p.locator('[data-testid=kb-code-fallback]').getAttribute('open') !== null && await p.inputValue('.kp-code') === '123', 'T2) le secours s’ouvre et contient toujours les 3 chiffres');
  // Taper dans le secours ne fait pas disparaître le QR.
  await p.focus('.kp-code'); await p.keyboard.press('End'); await p.keyboard.type('45');
  await sleep(200);
  check(await qrCount(p) === 1 && await p.inputValue('.kp-code') === '12345', 'T2) taper dans le secours : le QR reste affiché');
  check(errs.length === 0, 'T2) aucune erreur de page');
  await ctx.close();
}
{
  // Champ quitté avec des chiffres : 20 s suffisent.
  const { ctx, p, S, open } = await tablet();
  let release; S.gate = new Promise((res) => { release = res; });
  await open();
  await p.waitForSelector('.kp-code', { timeout: 8000 });
  await p.click('.kp-code'); await p.keyboard.type('123');
  release(); await sleep(500);
  await p.evaluate(() => document.querySelector('.kp-code').blur());
  await jump21(p);
  await p.waitForSelector('[data-testid=kb-pair-qr]', { timeout: 5000 }).catch(() => {});
  check(await qrCount(p) === 1 && await p.inputValue('.kp-code') === '123', 'T2) champ quitté avec des chiffres : 20 s plus tard, le QR apparaît, la saisie est gardée');
  await ctx.close();
}
{
  const { ctx, p, S, open } = await tablet();
  let release; S.gate = new Promise((res) => { release = res; });
  await open();
  await p.waitForSelector('.kp-code', { timeout: 8000 });
  await p.focus('.kp-code');
  release();
  await p.waitForSelector('[data-testid=kb-pair-qr]', { timeout: 5000 }).catch(() => {});
  check(await qrCount(p) === 1 && await p.evaluate(() => document.activeElement?.tagName !== 'INPUT'), 'T2) champ focalisé mais vide : le QR s’affiche et le focus est retiré');
  await ctx.close();
}

// ── T3 · renouvellement, états, arrêt d'inactivité ──────────────────────────
{
  const { ctx, p, S, errs, calls, adv, jump, open, waitQr } = await tablet({ width: 390, height: 844, isMobile: true });
  await open(); await waitQr();
  const rid1 = (await p.locator('[data-testid=kb-pair-qr]').getAttribute('data-url')).split('#borne=')[1];
  const startMs = await p.evaluate(() => Date.now());
  // À 9 min : un 2e pair_request qui renvoie le secret détenu, même code, ancien QR remplacé.
  await jump(541_000);
  await p.waitForFunction(() => document.querySelector('[data-testid=kb-pair-qr]')?.getAttribute('data-url') && true, null, { timeout: 5000 }).catch(() => {});
  await sleep(300);
  const reqs = calls('pair_request');
  const rid2 = (await p.locator('[data-testid=kb-pair-qr]').getAttribute('data-url')).split('#borne=')[1];
  check(reqs.length === 2 && reqs[1].device_secret === SECRET && rid2 !== rid1, `T3) à 9 min : un 2e pair_request avec le secret déjà détenu, nouvel identifiant (${reqs.length} demandes)`);
  check((await p.locator('[data-testid=kb-pair-code]').innerText()).trim() === CODE, 'T3) même code de vérification avant et après le renouvellement');
  await adv(9000);
  const lastPolls = calls('pair_status').slice(-6).map((c) => c.request_id);
  check(lastPolls.includes(rid1) && lastPolls.includes(rid2), 'T3) pendant le recouvrement, les DEUX identifiants sont interrogés');
  const nBeforeJump = calls('pair_status').length;
  await jump(250_000);
  await adv(9000);
  const lastPolls2 = calls('pair_status').slice(nBeforeJump).map((c) => c.request_id);
  check(lastPolls2.length > 0 && !lastPolls2.includes(rid1) && lastPolls2.includes(rid2), 'T3) l’ancien identifiant n’est plus interrogé après sa fin + 3 min');
  // expired / cancelled / used sur l'identifiant courant : nouvelle demande, sans message.
  for (const kind of ['expired', 'cancelled', 'used']) {
    const before = calls('pair_request').length;
    S.status = (body) => ({ json: { status: body.request_id === S.lastRid ? kind : 'pending' } });
    S.lastRid = (await p.locator('[data-testid=kb-pair-qr]').getAttribute('data-url')).split('#borne=')[1];
    await adv(11_000);
    const after = calls('pair_request').length;
    const txt = await bodyText(p);
    check(after > before && !/expir|annul|servi|erreur/i.test(txt.replace(/Code de vérification/, '')), `T3) « ${kind} » sur le QR courant : un nouveau QR, aucun message (${after - before} demande)`);
    S.status = () => ({ json: { status: 'pending' } });
  }
  // Au plus une demande toutes les 5 s, même si tout est refusé.
  S.status = () => ({ json: { status: 'cancelled' } });
  const b0 = calls('pair_request').length;
  await adv(12_000);
  const burst = calls('pair_request').length - b0;
  check(burst >= 1 && burst <= 3, `T3) toujours refusé : au plus une demande toutes les 5 s (${burst} en 12 s)`);
  S.status = () => ({ json: { status: 'pending' } });
  await adv(8000);
  // Borne suspendue : le texte, rien n'est effacé, puis retour à l'attente.
  S.status = () => ({ json: { status: 'suspended' } });
  await adv(9000);
  check((await p.locator('[data-testid=kb-pair-status]').innerText()).trim() === SUSPENDED_TEXT && await p.locator('[data-testid=kb-pair-qr]').count() === 1, 'T3) « suspended » : « Borne suspendue pour votre entreprise… », le QR reste');
  const nS = calls('pair_status').length;
  await adv(17_000, 1000);
  check(calls('pair_status').length > nS && await p.evaluate(() => localStorage.getItem('bx_kiosk_v1')) === null, 'T3) suspendue : on continue d’interroger, rien n’est écrit ni effacé');
  S.status = () => ({ json: { status: 'pending' } });
  await adv(10_000);
  check((await p.locator('[data-testid=kb-pair-status]').innerText()).trim() === WAITING_TEXT, 'T3) réactivée : de nouveau « En attente de votre confirmation… »');
  // Arrêt d'inactivité : 30 min sans toucher.
  let minutes = 0;
  while (await p.locator('[data-testid=kb-pair-restart]').count() === 0 && minutes < 70) { await jump(60_000); minutes++; }
  await adv(2000);
  const elapsedMin = ((await p.evaluate(() => Date.now())) - startMs) / 60000;
  check(elapsedMin >= 30 && elapsedMin <= 41 && await p.locator('[data-testid=kb-pair-restart]').count() === 1 && /Ce QR n’est plus actif\./.test(await bodyText(p)) && await qrCount(p) === 0, `T3) 30 min sans toucher (le dernier QR s’éteint à ${elapsedMin.toFixed(0)} min) : « Ce QR n’est plus actif. » + « Afficher un nouveau QR »`);
  check(await p.locator('[data-testid=kb-pair-restart]').getAttribute('type') === 'button', 'T3) le bouton est de type « button » (ne soumet pas le formulaire)');
  await p.screenshot({ path: `${SH}/tablette-inactive-390x844.png` });
  const reqEnd = calls('pair_request').length; const nA = calls('pair_status').length;
  for (let i = 0; i < 2; i++) await jump(60_000);
  const nB = calls('pair_status').length;
  for (let i = 0; i < 5; i++) await jump(60_000);
  const nC = calls('pair_status').length;
  for (let i = 0; i < 4; i++) await jump(60_000);
  await adv(2000);
  check(nB > nA && calls('pair_status').length === nC && calls('pair_request').length === reqEnd, `T3) le dernier identifiant est interrogé en silence jusqu’à fin + 3 min (${nB - nA} appels), puis plus aucun appel`);
  const r0 = calls('pair_request').length;
  await p.click('[data-testid=kb-pair-restart]');
  await p.waitForSelector('[data-testid=kb-pair-qr]', { timeout: 5000 }).catch(() => {});
  check(calls('pair_request').length === r0 + 1 && await qrCount(p) === 1 && calls('pair').length === 0 && await p.locator('[data-testid=kb-pairing]').count() === 1, 'T3) « Afficher un nouveau QR » : une nouvelle demande, le formulaire n’est pas soumis');
  check(errs.length === 0, `T3) aucune erreur de page (${errs.join(' | ')})`);
  await ctx.close();
}

// ── T3b · pannes passagères, hors ligne, borne suspendue, erreur du secours ─
{
  // Une confirmation ne se perd pas sur une panne passagère : un sondage a déjà répondu, puis 5xx, puis « approved ».
  const { ctx, p, S, errs, calls, adv, open, waitQr } = await tablet({ width: 1024, height: 768 });
  let n = 0;
  S.status = () => { n++; return n <= 2 ? { json: { status: 'pending' } } : n <= 4 ? { status: 500, json: { error: 'Appairage impossible' } } : { json: APPROVED }; };
  await open(); await waitQr();
  await adv(40_000, 2000);
  await p.waitForSelector('[data-testid=kb-week]', { timeout: 8000 }).catch(() => {});
  check(await p.locator('[data-testid=kb-week]').isVisible(), `T3b) « pending » puis 2 × 500 « Appairage impossible » puis « approved » : la tablette se relie quand même (${calls('pair_status').length} sondages)`);
  check(errs.length === 0, 'T3b) … sans erreur de page');
  await ctx.close();
}
{
  // Pendant le recouvrement de deux identifiants, UNE rafale de 5xx (les deux sondages d'un même tour) ne fait pas abandonner.
  const { ctx, p, S, errs, calls, adv, jump, open, waitQr } = await tablet({ width: 1024, height: 768 });
  await open(); await waitQr();
  await adv(7000);
  await jump(541_000);
  await sleep(500);
  let burst = 2;
  S.status = () => (burst-- > 0 ? { status: 503, json: { error: 'Service indisponible' } } : { json: APPROVED });
  await adv(30_000, 2000);
  await p.waitForSelector('[data-testid=kb-week]', { timeout: 8000 }).catch(() => {});
  check(calls('pair_request').length === 2 && await p.locator('[data-testid=kb-week]').isVisible(), 'T3b) deux sondages en 503 dans le MÊME tour (recouvrement) : un seul échec compté, la tablette se relie ensuite');
  check(errs.length === 0, 'T3b) … sans erreur de page');
  await ctx.close();
}
{
  // Borne suspendue sur l'ancien identifiant : le QR renouvelé ne l'efface pas.
  const { ctx, p, S, calls, adv, jump, open, waitQr } = await tablet({ width: 390, height: 844, isMobile: true });
  await open(); await waitQr();
  const rid1 = (await p.locator('[data-testid=kb-pair-qr]').getAttribute('data-url')).split('#borne=')[1];
  S.status = (body) => ({ json: { status: body.request_id === rid1 ? 'suspended' : 'pending' } });
  await adv(7000);
  await jump(541_000);
  await sleep(500);
  await adv(9000);
  const rid2 = (await p.locator('[data-testid=kb-pair-qr]').getAttribute('data-url')).split('#borne=')[1];
  check(calls('pair_request').length === 2 && rid2 !== rid1 && (await p.locator('[data-testid=kb-pair-status]').innerText()).trim() === SUSPENDED_TEXT,
    'T3b) l’ancien QR est « suspendu », le nouveau répond « en attente » : l’écran garde « Borne suspendue… »');
  S.status = () => ({ json: { status: 'pending' } });
  await adv(9000);
  check((await p.locator('[data-testid=kb-pair-status]').innerText()).trim() === WAITING_TEXT, 'T3b) réactivée : de nouveau « En attente… »');
  await ctx.close();
}
{
  // Hors ligne : le texte le dit, le QR périmé disparaît tout seul, le retour du réseau le remet.
  const { ctx, p, errs, calls, adv, jump, open, waitQr } = await tablet({ width: 1024, height: 768 });
  await open(); await waitQr();
  await ctx.setOffline(true);
  await adv(2000);
  check((await p.locator('[data-testid=kb-pair-status]').innerText()).trim() === 'La tablette n’a plus de réseau. Reconnectez-la au wifi.', 'T3b) hors ligne : « La tablette n’a plus de réseau. Reconnectez-la au wifi. »');
  await p.screenshot({ path: `${SH}/tablette-hors-ligne-1024x768.png` });
  const before = calls('pair_status').length;
  await adv(10_000, 2000);
  check(calls('pair_status').length === before, 'T3b) hors ligne : aucun appel');
  await jump(11 * 60_000);
  await adv(2000);
  check(await qrCount(p) === 0 && await p.locator('.kp-code').count() === 1, 'T3b) hors ligne plus de 10 min : le QR périmé disparaît (écran du code à 6 chiffres)');
  await ctx.setOffline(false);
  await p.evaluate(() => window.dispatchEvent(new Event('online')));
  await p.waitForSelector('[data-testid=kb-pair-qr]', { timeout: 8000 }).catch(() => {});
  check(await qrCount(p) === 1 && (await p.locator('[data-testid=kb-pair-status]').innerText()).trim() === WAITING_TEXT, 'T3b) réseau revenu : un QR neuf, « En attente… »');
  check(errs.length === 0, 'T3b) aucune erreur de page');
  await ctx.close();
}
for (const [w, h, mobile] of [[390, 844, true], [768, 1024, false]]) {
  // Un code refusé dans le secours : l'erreur s'affiche juste sous « Relier », dans l'écran.
  const { ctx, p, errs, open, waitQr } = await tablet({ width: w, height: h, isMobile: mobile });
  await open(); await waitQr();
  await p.click('[data-testid=kb-code-fallback] summary');
  await p.fill('.kp-code', '999999');
  await p.click('.kp-btn');
  await p.waitForSelector('.kp-err-fallback', { timeout: 5000 }).catch(() => {});
  const m = await p.evaluate(() => { const e = document.querySelector('.kp-err-fallback'); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vh: innerHeight, text: e.textContent, role: e.getAttribute('role'), inTop: !!document.querySelector('.kp > .kp-card > .kp-err') }; });
  check(!!m && m.top >= 0 && m.bottom <= m.vh && m.text === 'Code incorrect ou expiré.' && m.role === 'alert' && !m.inTop, `T3b) ${w}×${h} : « Code incorrect ou expiré. » est visible à l’écran, sous « Relier » (haut ${Math.round(m?.top)} / bas ${Math.round(m?.bottom)} sur ${h}), pas en haut de la carte`);
  if (w === 390) await p.screenshot({ path: `${SH}/tablette-secours-erreur-390x844.png` });
  check(errs.length === 0, `T3b) ${w}×${h} : aucune erreur de page`);
  await ctx.close();
}

// ── T4 · replis : la tablette garde son écran d'avant, sans un mot ──────────
for (const [name, reply] of [
  ['400 « Action inconnue »', { status: 400, json: { error: 'Action inconnue' } }],
  ['200 available:false', { json: { available: false } }],
  ['404', { status: 404, json: {} }],
  ['501', { status: 501, json: {} }],
  ['200 {} (réponse sans rien)', { json: {} }],
]) {
  const { ctx, p, S, errs, calls, adv, open } = await tablet({ width: 1024, height: 768 });
  S.request = () => reply;
  await open();
  await p.waitForSelector('[data-testid=kb-pairing]', { timeout: 8000 });
  await sleep(300);
  await adv(70_000, 5000);
  check(calls('pair_request').length === 1 && calls('pair_status').length === 0, `T4) ${name} : UN seul pair_request puis plus rien (${calls('pair_request').length})`);
  await legacyScreen(p, `T4) ${name}`);
  check(errs.length === 0, `T4) ${name} : aucune erreur de page`);
  if (name.startsWith('400')) await p.screenshot({ path: `${SH}/tablette-repli-1024x768.png` });
  await ctx.close();
}
{
  // Deux 500 de suite sur pair_status : retour à l'écran d'avant.
  const { ctx, p, S, errs, calls, adv, open, waitQr } = await tablet({ width: 1024, height: 768 });
  S.status = () => ({ status: 500, json: { error: 'Erreur serveur' } });
  await open(); await waitQr();
  await adv(10_000);
  const n = calls('pair_status').length;
  check(n === 2 && await qrCount(p) === 0, `T4) deux 500 de suite sur pair_status : le QR disparaît (${n} sondages)`);
  await adv(20_000);
  check(calls('pair_status').length === n, 'T4) … et plus aucun appel');
  await legacyScreen(p, 'T4) pair_status 500 ×2');
  check(errs.length === 0, 'T4) pair_status 500 ×2 : aucune erreur de page');
  await ctx.close();
}
{
  // 429 : nouvel essai après 60 s.
  const { ctx, p, S, errs, calls, adv, open } = await tablet({ width: 1024, height: 768 });
  S.request = () => ({ status: 429, json: { error: 'Trop d’essais. Réessayez dans quelques minutes.', code: 'pair_throttled' } });
  await open();
  await p.waitForSelector('[data-testid=kb-pairing]', { timeout: 8000 });
  await adv(55_000, 5000);
  check(calls('pair_request').length === 1, `T4) 429 : pas de nouvel essai avant 60 s (${calls('pair_request').length})`);
  await adv(10_000, 5000);
  check(calls('pair_request').length === 2, `T4) 429 : nouvel essai après 60 s (${calls('pair_request').length})`);
  await legacyScreen(p, 'T4) 429');
  check(errs.length === 0, 'T4) 429 : aucune erreur de page');
  await ctx.close();
}
for (const [name, reply] of [['500', { status: 500, json: { error: 'Erreur serveur' } }], ['réseau coupé', 'abort']]) {
  // Essais espacés : 5 s, puis 15 s, puis 60 s.
  const { ctx, p, S, errs, calls, adv, open } = await tablet({ width: 1024, height: 768 });
  S.request = () => reply;
  await open();
  await p.waitForSelector('[data-testid=kb-pairing]', { timeout: 8000 });
  await sleep(300);
  const c = () => calls('pair_request').length;
  const seen = [];
  for (const wait of [4000, 3000, 8000, 10_000, 45_000, 25_000]) { await adv(wait, wait > 10_000 ? 5000 : 1000); seen.push(c()); }
  check(JSON.stringify(seen) === '[1,2,2,3,3,4]', `T4) ${name} : essais à ~5 s, ~15 s (après le 2e), puis ~60 s (${seen.join('/')} à 4, 7, 15, 25, 70, 95 s)`);
  await legacyScreen(p, `T4) ${name}`);
  // L'événement « online » relance tout de suite.
  const before = c();
  await p.evaluate(() => window.dispatchEvent(new Event('online')));
  await sleep(300);
  check(c() === before + 1, `T4) ${name} : l’événement « online » relance l’essai tout de suite`);
  check(errs.length === 0, `T4) ${name} : aucune erreur de page (${errs.join(' | ')})`);
  await ctx.close();
}

// ── T5 · ?code=… sans demande ; bandeaux « déconnectée » ────────────────────
{
  const { ctx, p, calls, adv, open } = await tablet({ width: 1024, height: 768 });
  await open('/borne?code=123456');
  await p.waitForSelector('[data-testid=kb-pairing]', { timeout: 8000 });
  await adv(15_000, 5000);
  check(calls('pair_request').length === 0 && await p.inputValue('.kp-code') === '123456' && await qrCount(p) === 0, 'T5) /borne?code=123456 : AUCUN pair_request, code pré-rempli, écran d’avant');
  await p.click('.kp-btn');
  await p.waitForSelector('[data-testid=kb-week]', { timeout: 8000 }).catch(() => {});
  check(calls('pair').length === 1 && await p.locator('[data-testid=kb-week]').isVisible(), 'T5) un toucher « Relier » : relié avec le code à 6 chiffres comme avant');
  await ctx.close();
}
{
  const cache = { kioskId: 'k-test', token: 'jeton', seed: SEED, companyName: 'Martin Menuiserie', kioskName: 'Borne', settings: SETTINGS, board: BOARD, boardAt: NOW.getTime(), syncedAt: NOW.getTime() };
  // Déconnectée par le bureau, la voie QR absente : le texte d'avant, exact.
  const a = await tablet({ width: 1024, height: 768, cache });
  a.S.syncStatus = 410; a.S.request = () => ({ status: 400, json: { error: 'Action inconnue' } });
  await a.open();
  await a.p.waitForSelector('[data-testid=kb-pairing]', { timeout: 10000 });
  await sleep(300);
  check((await a.p.locator('.kp-err').innerText()).trim() === NOTICE, 'T5) déconnectée, sans QR : le bandeau d’avant, mot pour mot');
  await a.ctx.close();
  // Même chose avec le QR à l'écran : le bandeau parle du QR.
  const c = await tablet({ width: 1024, height: 768, cache });
  c.S.syncStatus = 410;
  await c.open();
  await c.p.waitForSelector('[data-testid=kb-pair-qr]', { timeout: 10000 });
  check((await c.p.locator('.kp-err').innerText()).trim() === NOTICE_QR, 'T5) déconnectée, QR affiché : « … Scannez le QR pour la relier de nouveau. »');
  await c.p.screenshot({ path: `${SH}/tablette-deconnectee-1024x768.png` });
  await c.ctx.close();
}

// ── T6 · tailles d'écran : tout est visible, ça défile à hauteur réduite ────
for (const [w, h, mobile, file] of [[1280, 800, false, 'tablette-qr-1280x800'], [1024, 768, false, 'tablette-qr-1024x768'], [768, 1024, false, 'tablette-qr-768x1024'], [390, 844, true, 'tablette-qr-390x844']]) {
  const { ctx, p, errs, open, waitQr } = await tablet({ width: w, height: h, isMobile: mobile });
  await open(); await waitQr();
  await sleep(300);
  const m = await p.evaluate(() => {
    const q = document.querySelector('[data-testid=kb-pair-qr]').getBoundingClientRect();
    const c = document.querySelector('[data-testid=kb-pair-code]').getBoundingClientRect();
    const s = document.querySelector('[data-testid=kb-code-fallback] summary').getBoundingClientRect();
    const kp = document.querySelector('.kp');
    return { qTop: q.top, qBottom: q.bottom, qW: q.width, cBottom: c.bottom, sBottom: s.bottom, sTop: s.top, vh: innerHeight, vw: innerWidth, scrolls: kp.scrollHeight > kp.clientHeight + 1, hs: document.documentElement.scrollWidth > innerWidth, qRight: q.right };
  });
  const big = w >= 760;
  check(m.qTop >= 0 && m.qBottom <= m.vh && m.cBottom <= m.vh && !m.hs, `T6) ${w}×${h} : QR et code visibles sans défilement, pas de défilement horizontal (QR ${Math.round(m.qW)} px)`);
  if (big) check(m.sBottom <= m.vh, `T6) ${w}×${h} : le secours est visible sans défiler (${Math.round(m.sBottom)} / ${m.vh})`);
  if (w === 1280 || w === 1024) check(m.qRight < m.vw / 2 + 60, `T6) ${w}×${h} (paysage) : deux colonnes, le QR à gauche`);
  await p.screenshot({ path: `${SH}/${file}.png` });
  check(errs.length === 0, `T6) ${w}×${h} : aucune erreur de page`);
  await ctx.close();
}
for (const [w, h, mobile, file] of [[390, 500, true, 'tablette-qr-390x500'], [768, 420, false, 'tablette-clavier-768x420']]) {
  const { ctx, p, open, waitQr } = await tablet({ width: w, height: h, isMobile: mobile });
  await open(); await waitQr();
  await sleep(300);
  await p.screenshot({ path: `${SH}/${file}.png` });
  await p.click('[data-testid=kb-code-fallback] summary');
  await sleep(200);
  const r = await p.evaluate(() => {
    const kp = document.querySelector('.kp');
    const reach = (sel) => { const e = document.querySelector(sel); e.scrollIntoView({ block: 'center' }); const rc = e.getBoundingClientRect(); const hit = document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2); return !!hit && (hit === e || e.contains(hit)); };
    const top = reach('[data-testid=kb-pair-qr]'); const bottom = reach('.kp-btn');
    return { scrolls: kp.scrollHeight > kp.clientHeight + 1, top, bottom, hs: document.documentElement.scrollWidth > innerWidth };
  });
  check(r.scrolls && r.top && r.bottom && !r.hs, `T6) ${w}×${h} (hauteur réduite) : l’écran défile, le QR (haut) et « Relier » (bas) sont atteignables, rien ne déborde`);
  await ctx.close();
}
{
  // Le secours ouvert avec une saisie, sur téléphone.
  const { ctx, p, open, waitQr } = await tablet({ width: 390, height: 844, isMobile: true });
  await open(); await waitQr();
  await p.click('[data-testid=kb-code-fallback] summary');
  await p.fill('.kp-code', '482');
  await sleep(200);
  check(await qrCount(p) === 1 && await hscroll(p), 'T6) 390×844 : secours ouvert et saisie en cours, le QR reste, rien ne déborde');
  await p.screenshot({ path: `${SH}/tablette-secours-390x844.png` });
  await ctx.close();
}

// ── T7 · portrait 768×1024 : la tablette posée verticalement ───────────────
{
  const { ctx, p, open, waitQr } = await tablet({ width: 768, height: 1024 });
  await open(); await waitQr();
  const dir = await p.evaluate(() => getComputedStyle(document.querySelector('.kp-pair')).flexDirection);
  check(dir === 'column', 'T7) portrait : une colonne (QR, code, état, secours)');
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// B) LE BUREAU
// ═══════════════════════════════════════════════════════════════════════════
const u = (id, first, last, role = 'worker') => ({ id, company_id: CO, first_name: first, last_name: last, role, email: `${id}@x.fr`, is_active: true, created_at: '2026-01-01' });
const COMPANY = { id: CO, name: 'Martin Menuiserie', ai_enabled: true, kiosk_enabled: true, position_tracking_enabled: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35 };
const nowS = Math.floor(Date.now() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwtFor = (sub) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', exp: nowS + 36000, aal: 'aal1' })}.sig`;
const sessionFor = (sub, email) => ({ access_token: jwtFor(sub), refresh_token: 'r', expires_at: nowS + 36000, expires_in: 36000, token_type: 'bearer', user: { id: sub, email, aud: 'authenticated', role: 'authenticated' } });
const ADMIN_SESSION = sessionFor('u-admin', 'paul@exemple.fr');
const AUTH_KEY = 'sb-sdperbcquvneohotjono-auth-token';
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const filterRows = (rows, params) => {
  for (const [k, v] of params) {
    if (SKIP.has(k)) continue;
    const dot = v.indexOf('.'); const op = v.slice(0, dot); const val = v.slice(dot + 1);
    rows = rows.filter((x) => {
      if (!(k in x)) return true;
      const cur = x[k];
      if (op === 'eq') return String(cur) === val;
      if (op === 'is') return val === 'null' ? cur == null : String(cur) === val;
      return true;
    });
  }
  return rows;
};
const isoAgo = (min) => new Date(Date.now() - min * 60e3).toISOString();
const RID_A = makeRid(1001); const RID_B = makeRid(1002);
const LOOKUP = { available: true, company_name: 'Martin Menuiserie', choices: CHOICES, expires_at: new Date(Date.now() + 480e3).toISOString(), age_s: 120, replaces: null };
const ERR = {
  pair_request_invalid: [400, 'Ce QR n’est pas valable. Scannez celui qui s’affiche sur la tablette.'],
  pair_request_expired: [410, 'Ce QR a expiré. Scannez celui qui s’affiche sur la tablette.'],
  pair_request_used: [409, 'Ce QR a déjà servi. Scannez celui qui s’affiche sur la tablette.'],
  pair_code_wrong: [409, 'Ce n’est pas le bon code. La demande est annulée : scannez le nouveau QR sur la tablette.'],
  pair_throttled: [429, 'Trop d’essais. Réessayez dans quelques minutes.'],
  support_readonly: [403, 'Compte support BEMEXO : lecture seule. Utilisez le compte du patron pour associer une tablette.'],
  kiosk_disabled: [403, 'La borne de pointage n’est pas activée pour cette entreprise.'],
};

/**
 * Une page du bureau avec la base simulée. `lookup` / `confirm` : fonctions (corps → réponse) pour pair_lookup /
 * pair_confirm ; `kioskRead` : 'ok' | 'fail' | Promise (lecture des tablettes retenue).
 */
async function adminPage({ width = 390, height = 844, isMobile = true, kiosks = [], session = ADMIN_SESSION, hash = '', path: pathName = '/admin', support = false, stash = null, lookup = null, confirm = null, kioskRead = 'ok', goto = true } = {}) {
  const ctx = await b.newContext({ viewport: { width, height }, locale: 'fr-FR', timezoneId: 'Europe/Paris', isMobile, hasTouch: isMobile });
  await ctx.clock.install({ time: new Date() });
  const state = {
    D: {
      users: [u('u-admin', 'Paul', 'Martin', 'admin'), u('u-kevin', 'Kevin', 'Roussel')],
      companies: [{ ...COMPANY }], worksites: [], planning: [], time_entries: [], active_sessions: [], month_closures: [], leave_requests: [], invitations: [], documents: [], certifications: [], push_subscriptions: [],
      kiosks: kiosks.map((k) => ({ company_id: CO, revoked_at: null, kind: 'tablette', ...k })), kiosk_settings: [],
    },
    fn: [], codeN: 0, offset: 0, restWrites: 0,
    lookup: lookup || (() => ({ json: LOOKUP })),
    confirm: confirm || (() => ({ json: { ok: true, company_name: 'Martin Menuiserie', replaces: false } })),
    kioskRead, session,
  };
  if (session) await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, [AUTH_KEY, JSON.stringify(session)]);
  if (support) await ctx.addInitScript((v) => { sessionStorage.setItem('bemexo-support', JSON.stringify(v)); }, { staffId: 'u-admin', companyId: CO, name: 'Martin Menuiserie', expiresAt: '2030-01-01T10:00:00Z' });
  if (stash) await ctx.addInitScript(([k, v]) => { if (!sessionStorage.getItem('stash-done')) { sessionStorage.setItem(k, JSON.stringify({ rid: v, at: Date.now() })); sessionStorage.setItem('stash-done', '1'); } }, ['bx_borne_req', stash]);
  // `wait` : promesse qui retient la réponse (pour voir l'écran « Envoi… »).
  const answer = async (r, a) => { if (a !== 'abort' && a.wait) await a.wait; return a === 'abort' ? r.abort('failed') : r.fulfill({ status: a.status || 200, json: a.json }); };
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.startsWith('/auth/v1/user')) return state.session ? r.fulfill({ json: state.session.user }) : r.fulfill({ status: 401, json: {} });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/kiosk')) {
      const body = JSON.parse(r.request().postData() || '{}');
      state.fn.push(body);
      const browserNow = Date.now() + state.offset;
      if (body.action === 'pair_lookup') return answer(r, state.lookup(body));
      if (body.action === 'pair_confirm') return answer(r, state.confirm(body));
      if (body.action === 'create_pairing') { const n = state.codeN++; return r.fulfill({ json: { code: ['123456', '654321', '246810'][n % 3], expires_at: new Date(browserNow + 600e3).toISOString(), pairing_id: `pair-${n + 1}` } }); }
      if (body.action === 'cancel_pairing') return r.fulfill({ json: { success: true, cancelled: 1 } });
      if (body.action === 'revoke') { const k = state.D.kiosks.find((x) => x.id === body.kiosk_id && !x.revoked_at); if (k) k.revoked_at = new Date(browserNow).toISOString(); return r.fulfill({ json: { success: true, revoked: k ? 1 : 0 } }); }
      if (body.action === 'settings') return r.fulfill({ json: { success: true, settings: SETTINGS } });
      return r.fulfill({ status: 400, json: { error: 'Action inconnue' } });
    }
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      if (url.pathname.endsWith('/support_enter')) return r.fulfill({ json: [{ name: 'Martin Menuiserie', expires_at: '2030-01-01T10:00:00Z' }] });
      return r.fulfill({ json: [] });
    }
    const t = url.pathname.replace('/rest/v1/', '');
    const m = r.request().method();
    if (m !== 'GET' && m !== 'HEAD') { state.restWrites++; return r.fulfill({ status: 201, json: {} }); }
    if (t === 'kiosks') {
      if (state.kioskRead === 'fail') return r.fulfill({ status: 500, json: { code: 'XX000', message: 'erreur' } });
      if (state.kioskRead && typeof state.kioskRead.then === 'function') await state.kioskRead;
    }
    const rows = filterRows(state.D[t] || [], url.searchParams);
    if ((r.request().headers()['accept'] || '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => { errs.push(e.message); console.log('   [erreur page]', e.message); });
  if (goto) await p.goto(`${BASE}${pathName}${hash}`);
  const ff = async (ms) => { state.offset += ms; await p.clock.fastForward(ms); await sleep(450); };
  const calls = (a) => state.fn.filter((c) => c.action === a);
  return { ctx, p, state, errs, ff, calls };
}
const kpc = (p) => p.locator('[data-testid=kpc]');
const waitKpc = async (p, t = 15000) => { await p.waitForSelector('[data-testid=kpc]', { timeout: t }).catch(() => {}); await sleep(500); };
const kpcText = async (p) => (await kpc(p).innerText().catch(() => '')).replace(/\s+/g, ' ');

// ── B1 · le parcours normal : les 4 codes, un geste, la vérification ────────
{
  const { ctx, p, state, errs, ff, calls } = await adminPage({ hash: `#borne=${RID_A}` });
  await waitKpc(p);
  const t = await kpcText(p);
  const href = await p.evaluate(() => location.href);
  check(!href.includes(RID_A) && await p.evaluate(() => location.hash) === '', 'B1) le fragment #borne= est retiré de la barre d’adresse');
  check(calls('pair_lookup').length === 1 && JSON.stringify(Object.keys(calls('pair_lookup')[0]).sort()) === '["action","request_id"]' && calls('pair_lookup')[0].request_id === RID_A, 'B1) UN pair_lookup, corps { action, request_id }');
  check(/Associer cette tablette \?/.test(await p.locator('[role=dialog]').innerText()) && /Entreprise : Martin Menuiserie/.test(t), 'B1) « Associer cette tablette ? » + « Entreprise : Martin Menuiserie » (valeur du serveur)');
  check((await p.locator('[data-testid=kpc-age]').innerText()).trim() === 'QR affiché il y a 2 min', 'B1) âge du QR : « QR affiché il y a 2 min »');
  check(/La tablette affiche un code de vérification\. Touchez le même\./.test(t) && /Cette tablette affichera le planning de la semaine \(prénoms, chantiers\) et le QR de pointage\./.test(t), 'B1) consigne et conséquence');
  const choices = await p.locator('[data-testid=kpc-choice]').allInnerTexts();
  check(JSON.stringify(choices) === JSON.stringify(CHOICES), `B1) 4 codes en boutons (${choices.join(' · ')})`);
  check(await p.locator('[role=group][aria-label="Codes proposés"]').count() === 1 && await p.locator('[data-testid=kpc-choice]').first().getAttribute('aria-label') === `Code ${CODE}`, 'B1) groupe « Codes proposés », aria-label « Code K7M 4QX »');
  const geo = await p.evaluate(() => [...document.querySelectorAll('[data-testid=kpc-choice]')].map((e) => { const r = e.getBoundingClientRect(); return { h: r.height, x: Math.round(r.left) }; }));
  check(geo.every((g) => g.h >= 56) && new Set(geo.map((g) => g.x)).size === 2, 'B1) boutons de 56 px au moins, grille à 2 colonnes');
  check(await p.locator('[role=dialog] [data-testid=kpc-alive], [role=dialog] [data-testid=kpc-dead]').count() === 0, 'B1) sans tablette : aucun avertissement de remplacement');
  check(!(await p.locator('[role=dialog]').innerText()).includes(RID_A), 'B1) l’identifiant de demande n’est jamais affiché');
  check(await hscroll(p), 'B1) 390 px : aucun défilement horizontal');
  await p.screenshot({ path: `${SH}/bureau-associer-390x844.png` });
  // Un seul geste : toucher le bon code envoie la confirmation.
  await p.locator('[data-testid=kpc-choice]').first().click();
  await sleep(500);
  const cf = calls('pair_confirm');
  check(cf.length === 1 && JSON.stringify(Object.keys(cf[0]).sort()) === '["action","code","confirm","request_id"]' && cf[0].code === 'K7M4QX' && cf[0].confirm === true && cf[0].request_id === RID_A, `B1) pair_confirm : seulement { action, request_id, code, confirm } (${JSON.stringify(cf[0])})`);
  check(/C’est confirmé\. Regardez la tablette : elle doit afficher le planning\./.test(await kpcText(p)) && /Vérification…/.test(await kpcText(p)), 'B1) « C’est confirmé… » + « Vérification… »');
  check(await p.evaluate(() => sessionStorage.getItem('bx_borne_req')) === null, 'B1) la mémoire du QR est nettoyée');
  const fnBefore = state.fn.length;
  // La tablette apparaît dans la base : « Tablette reliée. »
  state.D.kiosks.push({ id: 'k-neuve', company_id: CO, revoked_at: null, kind: 'tablette', created_at: new Date(Date.now() + state.offset).toISOString(), last_seen_at: null });
  await ff(3200);
  const t2 = await kpcText(p);
  check(/Tablette reliée\./.test(t2) && await p.locator('button', { hasText: 'Terminé' }).count() === 1, 'B1) tablette neuve vue dans la base : « Tablette reliée. » + « Terminé »');
  check(await p.locator('[data-sonner-toast]', { hasText: 'Tablette reliée' }).count() >= 1, 'B1) toast « Tablette reliée »');
  check(state.fn.length === fnBefore, 'B1) aucun appel à la fonction kiosk pendant la vérification');
  await p.screenshot({ path: `${SH}/bureau-associer-verifie-390x844.png` });
  await p.click('button:has-text("Terminé")');
  await sleep(400);
  check(await p.locator('[role=dialog]').count() === 0, 'B1) « Terminé » ferme la fenêtre');
  check(errs.length === 0 && state.restWrites === 0, 'B1) aucune erreur de page, aucune écriture directe en base');
  await ctx.close();
}

// ── B2 · tablette introuvable pendant 30 s ; lecture impossible ─────────────
{
  const { ctx, p, state, ff, calls } = await adminPage({ hash: `#borne=${RID_A}` });
  await waitKpc(p);
  await p.locator('[data-testid=kpc-choice]').nth(1).click();
  await sleep(400);
  for (let i = 0; i < 11; i++) await ff(3100);
  check(/La tablette n’a pas répondu : réveillez-la, sinon scannez de nouveau son QR\./.test(await kpcText(p)) && await p.locator('button', { hasText: 'Terminé' }).count() === 1, 'B2) aucune tablette neuve en 30 s : « La tablette n’a pas répondu… » + « Terminé »');
  check(calls('pair_confirm')[0].code === '3FD9RT', 'B2) le code touché est envoyé sans espace (3FD9RT)');
  await ctx.close();
}
{
  const { ctx, p, state, ff } = await adminPage({ hash: `#borne=${RID_A}`, kioskRead: 'fail' });
  await waitKpc(p);
  await p.locator('[data-testid=kpc-choice]').first().click();
  await sleep(400);
  await ff(3200);
  const t = await kpcText(p);
  check(/C’est confirmé/.test(t) && !/Vérification…/.test(t) && !/n’a pas répondu/.test(t) && !/Tablette reliée\./.test(t), 'B2) lecture des tablettes impossible : le texte de confirmation reste seul');
  await ctx.close();
}

// ── B3 · une tablette en service : le second geste ──────────────────────────
const ALIVE = { ...LOOKUP, replaces: { alive: true, seen_ago_s: 180 } };
{
  const { ctx, p, errs, calls } = await adminPage({ hash: `#borne=${RID_A}`, kiosks: [{ id: 'k-old', created_at: isoAgo(3 * 24 * 60), last_seen_at: isoAgo(3) }], lookup: () => ({ json: ALIVE }) });
  await waitKpc(p);
  const warn = p.locator('[data-testid=kpc-alive]');
  check((await warn.innerText()).trim() === '⚠ La tablette actuelle est en service (vue il y a 3 min). Elle sera déconnectée.', 'B3) « ⚠ La tablette actuelle est en service (vue il y a 3 min). Elle sera déconnectée. »');
  check(await warn.evaluate((e) => getComputedStyle(e).color) === 'rgb(192, 70, 31)', 'B3) en #C0461F (lisible sur blanc)');
  await p.locator('[data-testid=kpc-choice]').first().click();
  await sleep(400);
  check(calls('pair_confirm').length === 0 && await p.locator('[data-testid=kpc-replace-panel]').isVisible(), 'B3) toucher un code : rien n’est envoyé, le panneau « Remplacer la tablette en service ? » s’affiche');
  const pt = await p.locator('[data-testid=kpc-replace-panel]').innerText();
  check(/Remplacer la tablette en service \?/.test(pt) && /La tablette actuelle sera déconnectée dès que la nouvelle sera reliée\./.test(pt) && /K7M 4QX/.test(pt), 'B3) textes du panneau, avec le code choisi');
  await p.screenshot({ path: `${SH}/bureau-associer-remplace-390x844.png` });
  await p.click('button:has-text("Annuler")');
  await sleep(300);
  check(calls('pair_confirm').length === 0 && await p.locator('[data-testid=kpc-choice]').count() === 4 && await p.locator('[data-testid=kpc-replace-panel]').count() === 0, 'B3) « Annuler » : retour au choix, aucun appel');
  await p.locator('[data-testid=kpc-choice]').nth(2).click();
  await sleep(300);
  await p.click('[data-testid=kpc-replace]');
  await sleep(500);
  const cf = calls('pair_confirm');
  check(cf.length === 1 && cf[0].replace === true && cf[0].code === 'HNW2CE' && JSON.stringify(Object.keys(cf[0]).sort()) === '["action","code","confirm","replace","request_id"]', `B3) « Remplacer la tablette en service » : pair_confirm avec replace:true (${JSON.stringify(cf[0])})`);
  check(/C’est confirmé/.test(await kpcText(p)) && errs.length === 0, 'B3) confirmée');
  await ctx.close();
}
{
  // Le serveur impose le second geste alors que la fenêtre croyait la tablette muette.
  let n = 0;
  const { ctx, p, calls } = await adminPage({
    hash: `#borne=${RID_A}`, kiosks: [{ id: 'k-old', created_at: isoAgo(3 * 24 * 60), last_seen_at: isoAgo(40) }],
    lookup: () => ({ json: { ...LOOKUP, replaces: { alive: false, seen_ago_s: 7200 } } }),
    confirm: (body) => (++n === 1 ? { status: 409, json: { error: 'La tablette actuelle est en service. Confirmez son remplacement.', code: 'replace_required' } } : { json: { ok: true, company_name: 'Martin Menuiserie', replaces: true } }),
  });
  await waitKpc(p);
  check((await p.locator('[data-testid=kpc-dead]').innerText()).trim() === 'La tablette actuelle (vue il y a 2 h) sera déconnectée.', 'B3) tablette muette : « La tablette actuelle (vue il y a 2 h) sera déconnectée. »');
  check(await p.locator('[data-testid=kpc-alive]').count() === 0, 'B3) … sans avertissement rouge');
  await p.locator('[data-testid=kpc-choice]').first().click();
  await sleep(500);
  check(calls('pair_confirm').length === 1 && calls('pair_confirm')[0].replace === undefined && await p.locator('[data-testid=kpc-replace-panel]').isVisible(), 'B3) un seul geste d’abord ; le serveur répond replace_required : le panneau s’affiche avec le code déjà choisi');
  await p.click('[data-testid=kpc-replace]');
  await sleep(500);
  check(calls('pair_confirm').length === 2 && calls('pair_confirm')[1].replace === true && calls('pair_confirm')[1].code === 'K7M4QX' && /C’est confirmé/.test(await kpcText(p)), 'B3) puis le second geste : confirmée avec replace:true');
  await ctx.close();
}

// ── B4 · les refus du serveur, mot pour mot ─────────────────────────────────
for (const [code, [status, message]] of Object.entries(ERR)) {
  const lookupFails = code !== 'pair_code_wrong';
  const { ctx, p, errs } = await adminPage({
    hash: `#borne=${RID_A}`,
    lookup: lookupFails ? () => ({ status, json: { error: message, code } }) : null,
    confirm: lookupFails ? null : () => ({ status, json: { error: message, code } }),
  });
  await waitKpc(p);
  if (!lookupFails) { await p.locator('[data-testid=kpc-choice]').nth(3).click(); await sleep(500); }
  const e = p.locator('[data-testid=kpc-error]');
  check((await e.innerText()).trim() === message && await e.getAttribute('role') === 'alert', `B4) ${code} : « ${message.slice(0, 48)}… » affiché tel quel, en role="alert"`);
  check(errs.length === 0, `B4) ${code} : aucune erreur de page`);
  if (code === 'pair_code_wrong') await p.screenshot({ path: `${SH}/bureau-associer-erreur-390x844.png` });
  await ctx.close();
}
for (const [status, message] of [[401, 'Non authentifié'], [403, "Réservé à l'administrateur"]]) {
  const { ctx, p } = await adminPage({ hash: `#borne=${RID_A}`, lookup: () => ({ status, json: { error: message } }) });
  await waitKpc(p);
  check((await p.locator('[data-testid=kpc-error]').innerText()).trim() === message, `B4) ${status} : « ${message} » (chacun son texte)`);
  await ctx.close();
}
{
  const { ctx, p } = await adminPage({ hash: `#borne=${RID_A}`, lookup: () => ({ json: { available: false } }) });
  await waitKpc(p);
  check((await p.locator('[data-testid=kpc-unavailable]').innerText()).trim() === 'Cette fonction n’est pas encore disponible. Sur la tablette, tapez le code à 6 chiffres (bouton 📟 Borne).', 'B4) available:false : « Cette fonction n’est pas encore disponible… »');
  await ctx.close();
}
{
  const { ctx, p } = await adminPage({ hash: `#borne=${RID_A}`, lookup: () => ({ status: 400, json: { error: 'Action inconnue' } }) });
  await waitKpc(p);
  check(await p.locator('[data-testid=kpc-unavailable]').count() === 1, 'B4) ancienne fonction (« Action inconnue ») : « pas encore disponible »');
  await p.click('button:has-text("Fermer")');
  await sleep(300);
  check(await p.locator('[role=dialog]').count() === 0 && await p.evaluate(() => sessionStorage.getItem('bx_borne_req')) === null, 'B4) « Fermer » ferme et nettoie la mémoire');
  await ctx.close();
}
{
  // Réseau coupé : le texte de connexion, « Réessayer » relance pair_lookup.
  let n = 0;
  const { ctx, p, calls } = await adminPage({ hash: `#borne=${RID_A}`, lookup: () => (++n === 1 ? 'abort' : { json: LOOKUP }) });
  await waitKpc(p);
  check((await p.locator('[data-testid=kpc-error]').innerText()).trim() === 'Connexion impossible. Vérifiez internet et réessayez.' && await p.locator('button', { hasText: 'Réessayer' }).count() === 1, 'B4) réseau : « Connexion impossible… » + « Réessayer »');
  await p.click('button:has-text("Réessayer")');
  await sleep(700);
  check(calls('pair_lookup').length === 2 && await p.locator('[data-testid=kpc-choice]').count() === 4, 'B4) « Réessayer » : nouveau pair_lookup, les 4 codes');
  await ctx.close();
}

// ── B5 · refus, Échap, mode support ─────────────────────────────────────────
{
  const { ctx, p, calls } = await adminPage({ hash: `#borne=${RID_A}` });
  await waitKpc(p);
  await p.click('button:has-text("Non, ce n’est pas ma tablette")');
  await sleep(500);
  const d = calls('pair_confirm');
  check(d.length === 1 && JSON.stringify(Object.keys(d[0]).sort()) === '["action","decline","request_id"]' && d[0].decline === true && await p.locator('[role=dialog]').count() === 0, 'B5) « Non, ce n’est pas ma tablette » : pair_confirm { decline:true }, la fenêtre se ferme');
  await ctx.close();
}
{
  const { ctx, p, calls } = await adminPage({ hash: `#borne=${RID_A}` });
  await waitKpc(p);
  await p.keyboard.press('Escape');
  await sleep(400);
  check(await p.locator('[role=dialog]').count() === 0 && await p.evaluate(() => sessionStorage.getItem('bx_borne_req')) === null && calls('pair_confirm').length === 0, 'B5) Échap ferme, sans rien envoyer, la mémoire est nettoyée');
  await ctx.close();
}
{
  const { ctx, p, state, calls } = await adminPage({ hash: `#borne=${RID_A}`, support: true });
  await waitKpc(p);
  check((await p.locator('[data-testid=kpc-support]').innerText()).trim() === 'Compte support BEMEXO : lecture seule. Utilisez le compte du patron pour associer une tablette.', 'B5) mode support : texte « Compte support BEMEXO : lecture seule… »');
  check(state.fn.filter((c) => c.action?.startsWith('pair_')).length === 0 && await p.evaluate(() => sessionStorage.getItem('bx_borne_req')) === null, 'B5) mode support : aucun appel pair_*, mémoire nettoyée');
  await p.screenshot({ path: `${SH}/bureau-associer-support-390x844.png` });
  await ctx.close();
}

// ── B6 · patron déconnecté (le cas normal), mémoire, salarié, sans fragment ─
{
  const { ctx, p, state, calls } = await adminPage({ hash: `#borne=${RID_A}`, session: null });
  await p.waitForURL(/\/connexion/, { timeout: 15000 }).catch(() => {});
  await sleep(500);
  const mem = await p.evaluate(() => ({ s: sessionStorage.getItem('bx_borne_req'), href: location.href }));
  check(/\/connexion/.test(mem.href) && !mem.href.includes(RID_A) && JSON.parse(mem.s || '{}').rid === RID_A, `B6) non connecté : renvoyé vers /connexion, adresse sans fragment, identifiant gardé en mémoire (${mem.href.replace(BASE, '')})`);
  check(state.fn.filter((c) => c.action?.startsWith('pair_')).length === 0, 'B6) … et aucun appel pair_* tant qu’on n’est pas connecté');
  // Connexion simulée → retour sur /admin dans le même onglet → la fenêtre s'ouvre.
  await p.evaluate(([k, v]) => localStorage.setItem(k, v), [AUTH_KEY, JSON.stringify(ADMIN_SESSION)]);
  state.session = ADMIN_SESSION;
  await p.goto(`${BASE}/admin`);
  await waitKpc(p);
  check(await kpc(p).count() === 1 && calls('pair_lookup').length === 1 && calls('pair_lookup')[0].request_id === RID_A, 'B6) après la connexion : retour sur /admin → « Associer cette tablette ? » s’ouvre, avec le même QR');
  await ctx.close();
}
{
  const { ctx, p, calls } = await adminPage({ stash: RID_A });
  await waitKpc(p);
  check(await kpc(p).count() === 1 && calls('pair_lookup').length === 1, 'B6) mémoire posée + /admin : la fenêtre s’ouvre');
  await ctx.close();
}
{
  const { ctx, p, state } = await adminPage({ hash: `#borne=${RID_A}`, session: sessionFor('u-kevin', 'kevin@exemple.fr') });
  await sleep(3000);
  check(await kpc(p).count() === 0 && state.fn.filter((c) => c.action?.startsWith('pair_')).length === 0, 'B6) un salarié qui scanne : pas de fenêtre, aucun appel');
  await ctx.close();
}
{
  const { ctx, p, state } = await adminPage({});
  await sleep(3500);
  check(await kpc(p).count() === 0 && state.fn.length === 0, `B6) sans fragment : ni fenêtre, ni aucun appel à la fonction kiosk (${state.fn.length})`);
  await ctx.close();
}
{
  // Un fragment mal formé (59 ou 61 signes, ou autre clé) n'ouvre rien.
  for (const bad of [`#borne=${RID_A.slice(1)}`, `#borne=${RID_A}x`, `#Borne=${RID_A}`, `#borne=${RID_A}&x=1`]) {
    const { ctx, p, state } = await adminPage({ hash: bad });
    await sleep(2500);
    check(await kpc(p).count() === 0 && state.fn.length === 0, `B6) fragment invalide (${bad.slice(0, 12)}…${bad.length} car.) : rien ne s’ouvre`);
    await ctx.close();
  }
}

// ── B6b · pannes passagères, lien dans un /admin déjà ouvert, envoi, focus, ✕ ──
const USED = [409, 'Ce QR a déjà servi. Scannez celui qui s’affiche sur la tablette.'];
{
  // Réponse perdue pendant la confirmation : le QR est gardé, « Réessayer », puis « a déjà servi » = c'est la nôtre.
  let n = 0;
  const { ctx, p, state, ff, calls } = await adminPage({
    hash: `#borne=${RID_A}`,
    confirm: () => (++n === 1 ? 'abort' : { status: USED[0], json: { error: USED[1], code: 'pair_request_used' } }),
  });
  await waitKpc(p);
  await p.locator('[data-testid=kpc-choice]').first().click();
  await sleep(600);
  check((await p.locator('[data-testid=kpc-error]').innerText()).trim() === 'Connexion impossible. Vérifiez internet et réessayez.' && await p.locator('button', { hasText: 'Réessayer' }).count() === 1,
    'B6b) confirmation sans réponse : « Connexion impossible… » + « Réessayer »');
  check(JSON.parse(await p.evaluate(() => sessionStorage.getItem('bx_borne_req')) || '{}').rid === RID_A, 'B6b) … et la mémoire du QR est GARDÉE (elle ne servait plus à rien d’effacée)');
  await p.click('button:has-text("Réessayer")');
  await sleep(600);
  const cf = calls('pair_confirm');
  check(cf.length === 2 && JSON.stringify(cf[0]) === JSON.stringify(cf[1]), 'B6b) « Réessayer » renvoie la même confirmation');
  check(await p.locator('[data-testid=kpc-done]').count() === 1 && await p.locator('[data-testid=kpc-error]').count() === 0, 'B6b) « a déjà servi » après une réponse perdue : « C’est confirmé… » (pas d’erreur sèche)');
  check(/Vérification…/.test(await kpcText(p)) && await p.locator('button', { hasText: 'Terminé' }).count() === 1, 'B6b) « Terminé » est là dès la vérification');
  check(await p.evaluate(() => document.activeElement?.getAttribute('data-testid')) === 'kpc-done', 'B6b) le focus passe à la phrase de confirmation (annoncée)');
  state.D.kiosks.push({ id: 'k-neuve', company_id: CO, revoked_at: null, kind: 'tablette', created_at: new Date(Date.now() + state.offset).toISOString(), last_seen_at: null });
  await ff(3200);
  check(/Tablette reliée\./.test(await kpcText(p)), 'B6b) la vérification de bout en bout trouve la tablette neuve');
  await ctx.close();
}
{
  // « A déjà servi » SANS panne avant : une vraie erreur, rien à réessayer.
  const { ctx, p } = await adminPage({ hash: `#borne=${RID_A}`, confirm: () => ({ status: USED[0], json: { error: USED[1], code: 'pair_request_used' } }) });
  await waitKpc(p);
  await p.locator('[data-testid=kpc-choice]').first().click();
  await sleep(500);
  check((await p.locator('[data-testid=kpc-error]').innerText()).trim() === USED[1] && await p.locator('button', { hasText: 'Réessayer' }).count() === 0
    && await p.evaluate(() => sessionStorage.getItem('bx_borne_req')) === null, 'B6b) 409 « a déjà servi » d’emblée : erreur du serveur, pas de « Réessayer », mémoire nettoyée');
  await ctx.close();
}
for (const [status, message] of [[401, 'Non authentifié'], [429, 'Trop d’essais. Réessayez dans quelques minutes.'], [500, 'Erreur serveur']]) {
  // 401 (jeton pas encore rafraîchi), 429, 5xx : le QR est encore valable, on le garde et on propose « Réessayer ».
  let n = 0;
  const { ctx, p, calls } = await adminPage({ hash: `#borne=${RID_A}`, lookup: () => (++n === 1 ? { status, json: { error: message } } : { json: LOOKUP }) });
  await waitKpc(p);
  check((await p.locator('[data-testid=kpc-error]').innerText()).trim() === message && await p.locator('button', { hasText: 'Réessayer' }).count() === 1
    && JSON.parse(await p.evaluate(() => sessionStorage.getItem('bx_borne_req')) || '{}').rid === RID_A, `B6b) pair_lookup ${status} : « ${message} », « Réessayer » et la mémoire du QR est gardée`);
  await p.click('button:has-text("Réessayer")');
  await sleep(700);
  check(calls('pair_lookup').length === 2 && await p.locator('[data-testid=kpc-choice]').count() === 4, `B6b) pair_lookup ${status} : « Réessayer » ouvre le choix`);
  await ctx.close();
}
{
  // Le premier code est focalisé à l'ouverture du choix ; le ✕ est large et en français.
  const { ctx, p } = await adminPage({ hash: `#borne=${RID_A}` });
  await waitKpc(p);
  check(await p.evaluate(() => document.activeElement?.getAttribute('data-testid')) === 'kpc-choice', 'B6b) le focus passe au premier code quand le choix s’affiche');
  const x = await p.evaluate(() => { const b = document.querySelector('[role=dialog] .kpc-x'); const r = b?.getBoundingClientRect(); const visible = [...document.querySelectorAll('[role=dialog] button')].filter((e) => getComputedStyle(e).display !== 'none'); return { w: r?.width, h: r?.height, label: b?.getAttribute('aria-label'), english: visible.some((e) => /^Close$/.test(e.textContent.trim())), allVisible: visible.filter((e) => e.matches('.kpc-x')).length }; });
  check(x.w >= 44 && x.h >= 44 && x.label === 'Fermer' && !x.english && x.allVisible === 1, `B6b) croix de fermeture : ${x.w}×${x.h} px, libellé « ${x.label} », une seule croix visible`);
  await p.click('.kpc-x');
  await sleep(300);
  check(await p.locator('[role=dialog]').count() === 0, 'B6b) la croix ferme la fenêtre');
  await ctx.close();
}
{
  // « Non, ce n’est pas ma tablette » : un double toucher n'envoie qu'un refus, tout est bloqué pendant l'envoi.
  let release; const gate = new Promise((res) => { release = res; });
  const { ctx, p, calls } = await adminPage({ hash: `#borne=${RID_A}`, confirm: () => ({ json: { ok: true, declined: true }, wait: gate }) });
  await waitKpc(p);
  const no = p.locator('button', { hasText: 'Non, ce n’est pas ma tablette' });
  await no.click();
  await no.click({ force: true, timeout: 1500 }).catch(() => {});
  await sleep(400);
  const dis = await p.evaluate(() => [...document.querySelectorAll('[data-testid=kpc-choice], .kpc-text')].map((e) => e.disabled));
  check(calls('pair_confirm').length === 1 && dis.length === 5 && dis.every(Boolean) && /Envoi…/.test(await kpcText(p)), `B6b) refus en cours : un seul pair_confirm, les 4 codes et « Non » désactivés, « Envoi… » affiché (${calls('pair_confirm').length} appel)`);
  release(); await sleep(500);
  check(await p.locator('[role=dialog]').count() === 0, 'B6b) le refus abouti ferme la fenêtre');
  await ctx.close();
}
{
  // Pendant « Envoi… » d'une confirmation : la ligne d'état est là.
  let release; const gate = new Promise((res) => { release = res; });
  const { ctx, p } = await adminPage({ hash: `#borne=${RID_A}`, confirm: () => ({ json: { ok: true, company_name: 'Martin Menuiserie', replaces: false }, wait: gate }) });
  await waitKpc(p);
  await p.locator('[data-testid=kpc-choice]').first().click();
  await sleep(400);
  check(await p.locator('[role=dialog] [role=status]', { hasText: 'Envoi…' }).count() === 1, 'B6b) confirmation en cours : « Envoi… » (role="status")');
  release(); await sleep(400);
  await ctx.close();
}
{
  // Un lien /admin#borne=… ouvert dans un /admin DÉJÀ chargé (PWA, adresse collée) : pas de rechargement, la fenêtre s'ouvre quand même.
  const { ctx, p, calls } = await adminPage({});
  await sleep(2500);
  check(await kpc(p).count() === 0, 'B6b) /admin sans fragment : aucune fenêtre');
  await p.evaluate((h) => { location.hash = h; }, `#borne=${RID_A}`);
  await waitKpc(p);
  check(await kpc(p).count() === 1 && calls('pair_lookup').length === 1 && calls('pair_lookup')[0].request_id === RID_A
    && await p.evaluate(() => location.hash) === '' && await p.evaluate(() => sessionStorage.getItem('bx_borne_req')) !== null, 'B6b) le fragment arrive dans le document déjà chargé : fenêtre ouverte, un pair_lookup, fragment retiré de l’adresse');
  // Un second QR scanné pendant que la fenêtre est ouverte : elle repart sur le dernier.
  await p.evaluate((h) => { location.hash = h; }, `#borne=${RID_B}`);
  await sleep(1200);
  check(calls('pair_lookup').length === 2 && calls('pair_lookup')[1].request_id === RID_B && await kpc(p).count() === 1, 'B6b) un nouveau QR scanné : la fenêtre repart sur le dernier');
  await ctx.close();
}

// ── B7 · bannière cookies : les 4 codes restent touchables ──────────────────
{
  const { ctx, p } = await adminPage({ hash: `#borne=${RID_A}` });
  await waitKpc(p);
  await p.evaluate(() => { const d = document.createElement('div'); d.id = 'faux-cookies'; d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:120px;background:#fff;border-top:2px solid #000;z-index:2147483647'; document.body.appendChild(d); });
  const reach = await p.evaluate(() => [...document.querySelectorAll('[data-testid=kpc-choice]')].map((e) => {
    e.scrollIntoView({ block: 'center' });
    const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === e || e.contains(hit));
  }));
  check(reach.length === 4 && reach.every(Boolean), `B7) bannière cookies de 120 px en bas : les 4 codes sont touchables (${reach.join(',')})`);
  const last = await p.evaluate(() => { const c = document.querySelector('[role=dialog]'); c.scrollTop = c.scrollHeight; const e = [...document.querySelectorAll('[role=dialog] button')].find((x) => /Non, ce n/.test(x.textContent)); const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && (hit === e || e.contains(hit)); });
  check(last, 'B7) … et « Non, ce n’est pas ma tablette », tout en bas, aussi (marge de 96 px)');
  await p.screenshot({ path: `${SH}/bureau-associer-banniere-390x844.png` });
  await ctx.close();
}

// ── B8 · la fenêtre « Borne » : le code caché derrière « Relier une autre tablette » ──
const openBorne = async (p) => { await p.click('[data-testid=bar-kiosk]'); await sleep(900); };
const OLD = { id: 'k-old', created_at: isoAgo(3 * 24 * 60), last_seen_at: isoAgo(3) };
{
  const { ctx, p, state, calls } = await adminPage({ width: 1440, height: 900, isMobile: false });
  await p.waitForSelector('[data-testid=bar-kiosk]', { timeout: 20000 });
  await sleep(1200);
  await openBorne(p);
  const t = await p.locator('[role=dialog]').innerText();
  check(calls('create_pairing').length === 1 && /^\d{6}$/.test((await p.locator('[data-testid=ka-code]').innerText()).trim()), 'B8) sans tablette : le code s’affiche comme avant (1 create_pairing)');
  check((await p.locator('[data-testid=ka-pair-intro]').innerText()).trim() === 'Si la tablette affiche un QR, scannez-le avec votre téléphone : c’est le plus simple. Sinon, tapez le code ci-dessous sur la tablette.', 'B8) ligne d’introduction au-dessus du code');
  check((await p.locator('[data-testid=ka-qr-caption]').innerText()).trim() === 'Secours : à scanner avec la tablette' && await p.locator('[data-testid=ka-link-another]').count() === 0, 'B8) légende « Secours : à scanner avec la tablette », pas de « Relier une autre tablette »');
  const help = await p.locator('[data-testid=ka-install]').textContent();
  check(help.includes('depuis l’icône installée') && help.includes('elle affiche un QR à scanner avec votre téléphone ou, à défaut, un code à 6 chiffres') && help.includes('reliez-la depuis l’icône, pas depuis Safari'), 'B8) aide « Installer la tablette » : le QR d’abord, le code à défaut');
  await ctx.close();
}
{
  // Pendant la lecture des tablettes : le bloc d'attente, aucun code.
  let release; const gate = new Promise((res) => { release = res; });
  const { ctx, p, calls } = await adminPage({ width: 1440, height: 900, isMobile: false, kiosks: [OLD], kioskRead: gate });
  await p.waitForSelector('[data-testid=bar-kiosk]', { timeout: 20000 });
  await sleep(1200);
  await openBorne(p);
  check(await p.locator('[data-testid=ka-code]').getAttribute('class') === 'ka-digits wait' && calls('create_pairing').length === 0, 'B8) pendant la lecture des tablettes : chiffres « ··· ··· » en attente, 0 create_pairing');
  release();
  await sleep(1500);
  check(calls('create_pairing').length === 0 && await p.locator('[data-testid=ka-link-another]').count() === 1, 'B8) lecture terminée avec une tablette : toujours 0 create_pairing, « Relier une autre tablette »');
  await ctx.close();
}
{
  const { ctx, p, state, ff, calls } = await adminPage({ width: 1440, height: 900, isMobile: false, kiosks: [OLD] });
  await p.waitForSelector('[data-testid=bar-kiosk]', { timeout: 20000 });
  await sleep(1200);
  await openBorne(p);
  const t = await p.locator('[role=dialog]').innerText();
  check(calls('create_pairing').length === 0 && await p.locator('[data-testid=ka-code-block]').count() === 0, 'B8) tablette reliée : 0 create_pairing à l’ouverture, pas de bloc de code');
  check(/Tablette reliée — vue il y a 3 min/.test(t) && t.includes('Si la tablette affiche un QR, scannez-le avec votre téléphone : c’est le plus simple.') && t.includes('Une seule tablette par entreprise : en relier une nouvelle déconnecte l’ancienne.') && await p.locator('[data-testid=ka-link-another]').innerText() === 'Relier une autre tablette', 'B8) les deux phrases et le bouton « Relier une autre tablette »');
  await p.click('[data-testid=ka-link-another]');
  await sleep(900);
  const t2 = await p.locator('[role=dialog]').innerText();
  check(calls('create_pairing').length === 1 && /^\d{6}$/.test((await p.locator('[data-testid=ka-code]').innerText()).trim()) && t2.includes('L’ancienne tablette sera déconnectée dès que la nouvelle sera reliée.'), 'B8) « Relier une autre tablette » : 1 create_pairing, le code et « L’ancienne tablette sera déconnectée… »');
  const ids = ['ka-code-block', 'ka-code', 'ka-qr', 'ka-copy-code', 'ka-copy-link', 'ka-borne-link', 'ka-qr-caption', 'ka-pair-intro'];
  const present = await Promise.all(ids.map((id) => p.locator(`[data-testid=${id}]`).count()));
  check(present.every((n) => n === 1), `B8) tous les repères d’avant sont là (${ids.filter((_, i) => present[i] !== 1).join(', ') || 'ok'})`);
  // Une tablette neuve pendant que le code est affiché : toast, code périmé, bloc replié.
  const nCancel = calls('cancel_pairing').length;
  state.D.kiosks.push({ id: 'k-new', company_id: CO, revoked_at: null, kind: 'tablette', created_at: new Date(Date.now() + state.offset).toISOString(), last_seen_at: new Date(Date.now() + state.offset).toISOString() });
  await ff(5200);
  await sleep(600);
  check(await p.locator('[data-sonner-toast]', { hasText: 'Tablette reliée' }).count() >= 1, 'B8) tablette neuve : toast « Tablette reliée »');
  check(calls('cancel_pairing').length > nCancel && calls('cancel_pairing').at(-1).pairing_id === 'pair-1', 'B8) le code inutilisé est périmé (cancel_pairing)');
  check(calls('create_pairing').length === 1 && await p.locator('[data-testid=ka-link-another]').count() === 1 && await p.locator('[data-testid=ka-code-block]').count() === 0, 'B8) aucun nouveau code : le bloc se replie derrière « Relier une autre tablette »');
  check(calls('revoke').map((c) => c.kiosk_id).includes('k-old'), 'B8) l’ancienne tablette est déconnectée (secours inchangé)');
  await ctx.close();
}
{
  // Lecture des tablettes en échec : le code reste montré (comportement d'avant).
  const { ctx, p, calls } = await adminPage({ width: 1440, height: 900, isMobile: false, kiosks: [OLD], kioskRead: 'fail' });
  await p.waitForSelector('[data-testid=bar-kiosk]', { timeout: 20000 });
  await sleep(1200);
  await openBorne(p);
  check(calls('create_pairing').length === 1 && /^\d{6}$/.test((await p.locator('[data-testid=ka-code]').innerText()).trim()), 'B8) lecture des tablettes en échec : le code reste visible (1 create_pairing)');
  await ctx.close();
}
{
  // Mode support : aucun create_pairing, la phrase de lecture seule.
  const { ctx, p, calls } = await adminPage({ width: 1440, height: 900, isMobile: false, support: true });
  await p.waitForSelector('[data-testid=bar-kiosk]', { timeout: 20000 });
  await sleep(1200);
  await openBorne(p);
  check(calls('create_pairing').length === 0 && (await p.locator('[data-testid=ka-support-note]').innerText()).trim() === 'Mode support : lecture seule, impossible de relier une tablette.' && await p.locator('[data-testid=ka-code-block]').count() === 0, 'B8) mode support : 0 create_pairing, « Mode support : lecture seule, impossible de relier une tablette. »');
  await ctx.close();
}
for (const [mode, file] of [['linked', 'bureau-borne-tablette-reliee-390x844'], ['revealed', 'bureau-borne-code-revele-390x844']]) {
  const { ctx, p } = await adminPage({ kiosks: [OLD] });
  await p.locator('.bt-pl-m-ibtn[aria-label=Menu]').first().click();
  await sleep(500);
  await p.click('[data-testid=mm-kiosk]');
  await sleep(1200);
  if (mode === 'revealed') { await p.click('[data-testid=ka-link-another]'); await sleep(900); }
  const m = await p.evaluate(() => { const d = document.querySelector('[role=dialog]'); return { sw: d.scrollWidth - d.clientWidth, page: document.documentElement.scrollWidth <= innerWidth }; });
  check(m.sw <= 1 && m.page, `B8) 390×844 (${mode === 'linked' ? 'tablette reliée' : 'code révélé'}) : aucun défilement horizontal`);
  await p.screenshot({ path: `${SH}/${file}.png` });
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// E) UN PARCOURS COMPLET : la tablette affiche son QR, le patron confirme, la tablette se relie
// ═══════════════════════════════════════════════════════════════════════════
{
  // La même « fonction » pour les deux appareils.
  const shared = { approved: new Set(), rids: [] };
  const T = await tablet({ width: 1024, height: 768 });
  const baseRequest = T.S.request;
  T.S.request = (body) => { const a = baseRequest(body); shared.rids.push(a.json.request_id); return a; };
  T.S.status = (body) => (shared.approved.has(body.request_id) ? { json: APPROVED } : { json: { status: 'pending' } });
  await T.open(); await T.waitQr();
  const ridA = (await T.p.locator('[data-testid=kb-pair-qr]').getAttribute('data-url')).split('#borne=')[1];
  const shown = (await T.p.locator('[data-testid=kb-pair-code]').innerText()).trim();
  // Le patron scanne (QR → adresse), ouvre la fenêtre sur SON téléphone ; pendant ce temps la tablette renouvelle son QR.
  const A = await adminPage({
    hash: `#borne=${ridA}`,
    lookup: () => ({ json: { ...LOOKUP, choices: CHOICES } }),
    confirm: (body) => { shared.approved.add(body.request_id); return { json: { ok: true, company_name: 'Martin Menuiserie', replaces: false } }; },
  });
  await waitKpc(A.p);
  await T.jump(541_000);
  await sleep(300);
  const ridB = (await T.p.locator('[data-testid=kb-pair-qr]').getAttribute('data-url')).split('#borne=')[1];
  const shownAfter = (await T.p.locator('[data-testid=kb-pair-code]').innerText()).trim();
  const choices = await A.p.locator('[data-testid=kpc-choice]').allInnerTexts();
  check(ridB !== ridA && shownAfter === shown && choices.includes(shownAfter), `E) la tablette a renouvelé son QR (nouvel identifiant) : son code ${shownAfter} figure toujours parmi les 4 de la fenêtre ouverte`);
  const idx = choices.indexOf(shownAfter);
  await A.p.locator('[data-testid=kpc-choice]').nth(idx).click();
  await sleep(500);
  check(A.calls('pair_confirm').length === 1 && A.calls('pair_confirm')[0].request_id === ridA, 'E) la confirmation de l’ancien QR est acceptée');
  await T.adv(6000);
  await T.p.waitForSelector('[data-testid=kb-week]', { timeout: 8000 }).catch(() => {});
  check(await T.p.locator('[data-testid=kb-week]').isVisible() && JSON.parse(await T.p.evaluate(() => localStorage.getItem('bx_kiosk_v1'))).kioskId === 'k-qr', 'E) la tablette reçoit son jeton toute seule et affiche le planning');
  check(T.errs.length === 0 && A.errs.length === 0, 'E) aucune erreur de page, ni côté tablette ni côté bureau');
  await T.ctx.close(); await A.ctx.close();
}

console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
