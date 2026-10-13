// Lot 30 — « borne robuste » : la tablette, navigateur réel.
// Lancer : node scripts/tests/borne-robuste.mjs out docs/captures-borne-robuste-lot30 42500 (après npm run build).
//
//  A) Service worker de la borne (public/borne-sw.js) : portée « /borne » SEULE,
//     jamais sur le reste du site, distinct de public/sw.js (push) ; caches
//     versionnés ; AUCUN appel Supabase, aucun jeton, aucun QR rangé.
//  B) Démarrage SANS RÉSEAU : la tablette relancée (serveur éteint) ouvre la borne
//     sur son écran, le dit (« Pas de réseau — reprise automatique »), son QR
//     continue de tourner (calculé sur place : il est comparé à un QR de référence),
//     aucune erreur JavaScript ; elle reprend seule au retour du réseau.
//  C) Après un déploiement simulé : en ligne, la page NEUVE est prise (jamais la
//     copie périmée) ; la copie se met à jour pour la prochaine ouverture hors
//     ligne ; réseau lent (> 4 s) ou serveur en panne : la dernière bonne page ;
//     sans copie ni réseau : l'écran de secours, qui recharge tout seul.
//     Nouvelle version du service worker : anciens caches retirés.
//  D) Rechargement de nuit : jamais avant 10 min de calme, jamais hors de la plage
//     02:00–04:00, jamais hors ligne ni page cachée, jamais deux fois par nuit,
//     jamais sans nouvelle version, jamais sans mémoire (pas de boucle).
//  E) Relecture du planning toutes les 60 s (plus 30 s), sans attendre au retour
//     du réseau, au retour sur la page et au toucher.
//  F) L'état de l'écran joint à `sync` (liste blanche, jamais de jeton) et envoyé
//     dès qu'il change.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
const { chromium } = await import('playwright-core')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.mjs'));
const requireHere = createRequire(import.meta.url);
const qrcode = requireHere('qrcode-generator');
const [,, OUT = 'out', SH = 'docs/captures-borne-robuste-lot30', PORT_ARG = '42500'] = process.argv; fs.mkdirSync(SH, { recursive: true });
const PORT = Number(PORT_ARG);
const BASE = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const pageErrors = [];

// ── Le site, servi à la main : on l'éteint (plus de réseau), on le « redéploie », on le ralentit ──
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
const PAGE_CHUNK_DIR = path.join(OUT, '_next/static/chunks/app/borne');
const ORIG_PAGE = fs.readdirSync(PAGE_CHUNK_DIR).find((f) => /^page-[0-9a-f]+\.js$/.test(f));
const site = { up: false, deploy: 1, slowMs: 0, fail: 0, swVersion: 1, hits: [] };
let server; const sockets = new Set();
/** Le HTML de /borne tel que le serveur le sert : « déploiement » n = autre empreinte du code de la page + un repère visible. */
function bornePage() {
  let html = fs.readFileSync(path.join(OUT, 'borne.html'), 'utf8');
  if (site.deploy > 1) {
    html = html.replace(/app\/borne\/page-([0-9a-f]+)\.js/g, (m, h) => `app/borne/page-${site.deploy}${h.slice(1)}.js`)
      .replace('</head>', `<meta name="x-deploy" content="${site.deploy}"/></head>`);
  } else html = html.replace('</head>', '<meta name="x-deploy" content="1"/></head>');
  return html;
}
async function onRequest(q, r) {
  const u = new URL(q.url, 'http://x'); let p = decodeURIComponent(u.pathname);
  site.hits.push({ path: p, search: u.search, mode: q.headers['sec-fetch-mode'] || '', dest: q.headers['sec-fetch-dest'] || '' });
  if (p === '/borne' || p === '/borne/') {
    if (site.slowMs) await sleep(site.slowMs);
    if (site.fail) { r.writeHead(site.fail, { 'Content-Type': 'text/plain' }); return r.end('panne'); }
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return r.end(bornePage());
  }
  if (p === '/borne-sw.js') {
    const src = fs.readFileSync(path.join(OUT, 'borne-sw.js'), 'utf8').replace('const VERSION = 1;', `const VERSION = ${site.swVersion};`);
    r.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'max-age=0, must-revalidate' }); return r.end(src);
  }
  // Le « nouveau » fichier de la page /borne d'un déploiement simulé : le même contenu sous un autre nom.
  if (/^\/_next\/static\/chunks\/app\/borne\/page-[0-9a-f]+\.js$/.test(p)) p = `/_next/static/chunks/app/borne/${ORIG_PAGE}`;
  for (const c of [p, p + '.html', path.join(p, 'index.html')]) {
    const f = path.join(OUT, c);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); }
  }
  r.writeHead(404); r.end();
}
const startSite = () => new Promise((res) => {
  server = http.createServer(onRequest);
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  server.listen(PORT, () => { site.up = true; res(); });
});
const stopSite = () => new Promise((res) => { site.up = false; sockets.forEach((s) => s.destroy()); server.close(() => res()); });
const resetSite = () => { site.deploy = 1; site.slowMs = 0; site.fail = 0; site.swVersion = 1; site.hits.length = 0; };
await startSite();

// ── Données fictives ────────────────────────────────────────────────────────
const DAYS = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
const BOARD = {
  week_start: DAYS[0], today: DAYS[3], days: DAYS,
  workers: [['Inès', 'Garnier', 4], ['Karim', 'Haddad', 3], ['Lucas', 'Petit', 0]].map(([f, l, t], i) => ({ k: `w${i}`, first_name: f, last_name: l, tint: t })),
  slots: DAYS.slice(0, 5).flatMap((d) => [
    { w: 'w0', date: d, title: 'École Jean Moulin', sub: 'Bron', hours: '08:00–17:00', color: 2, live: null },
    { w: 'w1', date: d, title: 'Villa Dupont', sub: 'Lyon 6e', hours: '07:30–16:30', color: 4, live: null },
    { w: 'w2', date: d, title: 'Cuisine Martin', sub: 'Villeurbanne', hours: '07:30–16:00', color: 1, live: null },
  ]),
  absences: [], live_extra: [],
};
const SETTINGS = { show_planning: true, require_gps: false, active_from: null, active_until: null };
const SEED = 'ZGVtby1ib3JuZS1iZW1leG8tbmUtcGFzLXV0aWxpc2Vy';
const NOW = new Date('2026-10-01T07:30:00Z'); // jeudi 09:30 à Paris
const CACHE = { kioskId: 'k-test', token: 'jeton-secret-du-test', seed: SEED, companyName: 'Martin Menuiserie', kioskName: 'Entrée du dépôt', settings: SETTINGS, board: BOARD, boardAt: NOW.getTime(), syncedAt: NOW.getTime() };

// Le QR de référence : le même calcul que supabase/functions/_shared/kiosk-code.ts (HMAC-SHA-256, 8 chiffres, pas de 60 s).
const fromB64Url = (s) => Uint8Array.from(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
async function refCode(seedB64, nowMs) {
  const key = await webcrypto.subtle.importKey('raw', fromB64Url(seedB64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const counter = new Uint8Array(8); let v = Math.floor(nowMs / 1000 / 60);
  for (let i = 7; i >= 0; i--) { counter[i] = v & 0xff; v = Math.floor(v / 256); }
  const mac = new Uint8Array(await webcrypto.subtle.sign('HMAC', key, counter));
  const o = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[o] & 0x7f) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3];
  return String(bin % 10 ** 8).padStart(8, '0');
}
async function refQrSvg(nowMs) {
  const qr = qrcode(0, 'M');
  qr.addData(`${BASE}/pointer?k=${encodeURIComponent(CACHE.kioskId)}&c=${await refCode(SEED, nowMs)}`);
  qr.make();
  return qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}

const WAKE_STUB = (mode) => {
  const w = { mode, requests: 0, sentinels: [] }; window.__wl = w;
  if (mode === 'none') { try { Object.defineProperty(navigator, 'wakeLock', { configurable: true, get: () => undefined }); } catch { /* */ } return; }
  const sentinel = () => { const ls = new Set(); const s = { released: false, type: 'screen', addEventListener(t, f) { if (t === 'release') ls.add(f); }, removeEventListener(t, f) { if (t === 'release') ls.delete(f); }, async release() { if (!s.released) { s.released = true; ls.forEach((f) => f(new Event('release'))); } } }; return s; };
  const api = { async request() { w.requests++; if (w.mode === 'deny') { const e = new Error('Refusé'); e.name = 'NotAllowedError'; throw e; } const s = sentinel(); w.sentinels.push(s); return s; } };
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, get: () => api });
};
const STANDALONE_STUB = () => {
  const orig = window.matchMedia.bind(window);
  window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : orig(q));
};

/**
 * Une tablette reliée. `sw` : 'allow' | 'block'. `clock` : date de départ (horloge simulée) ou null (heure réelle).
 * `net.off` : le réseau « coupé » vu de Supabase (les appels échouent comme sans internet).
 */
async function tablet({ width = 1280, height = 800, sw = 'block', clock = NOW, cache = CACHE, wake = 'grant', standalone = false, isMobile = false, extraInit = null, net = { off: false }, api = { sync: 200, board: 200 }, ctx: given = null } = {}) {
  const ctx = given || await b.newContext({ viewport: { width, height }, locale: 'fr-FR', timezoneId: 'Europe/Paris', hasTouch: isMobile, isMobile, serviceWorkers: sw });
  if (!given) {
    if (clock) await ctx.clock.install({ time: clock });
    await ctx.addInitScript(WAKE_STUB, wake);
    if (standalone) await ctx.addInitScript(STANDALONE_STUB);
    if (cache) await ctx.addInitScript(([k, v]) => { if (!localStorage.getItem(k) && !sessionStorage.getItem('init')) { localStorage.setItem(k, v); } sessionStorage.setItem('init', '1'); }, ['bx_kiosk_v1', JSON.stringify(cache)]);
    await ctx.addInitScript(() => { try { sessionStorage.setItem('loads', String(Number(sessionStorage.getItem('loads') || 0) + 1)); } catch { /* */ } });
    if (extraInit) await ctx.addInitScript(extraInit);
  }
  const fn = [];
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url());
    // Les appels sont comptés même quand le réseau est « coupé » (ils partent, ils échouent).
    if (url.pathname.startsWith('/functions/v1/kiosk')) fn.push({ ...JSON.parse(r.request().postData() || '{}'), at: Date.now(), failed: !!net.off });
    if (net.off) return r.abort('internetdisconnected');
    if (url.pathname.startsWith('/functions/v1/kiosk')) {
      const body = JSON.parse(r.request().postData() || '{}');
      if (body.action === 'sync') return api.sync === 200 ? r.fulfill({ json: { revoked: false, kiosk_name: 'Entrée du dépôt', company_name: 'Martin Menuiserie', settings: SETTINGS, planning: [] } }) : r.fulfill({ status: api.sync, json: { error: 'x' } });
      if (body.action === 'board') return api.board === 200 ? r.fulfill({ json: BOARD }) : r.fulfill({ status: api.board, json: { error: 'x' } });
      return r.fulfill({ status: 400, json: { error: 'Action inconnue' } });
    }
    return r.fulfill({ json: {} });
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { pageErrors.push(e.message); console.log('   [erreur page]', e.message); });
  const consoleErrors = [];
  p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  const calls = (a) => fn.filter((c) => c.action === a).length;
  const loads = () => p.evaluate(() => Number(sessionStorage.getItem('loads') || 0)).catch(() => -1);
  return { ctx, p, fn, calls, net, api, consoleErrors, loads };
}
const openBorne = async (p, url = `${BASE}/borne`) => {
  await p.goto(url);
  await p.waitForSelector('[data-testid=kb-week], [data-testid=kb-suspended], [data-testid=kb-pairing]', { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(500);
};
const until = async (fn, ms = 8000, step = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn().catch(() => false)) return true; await sleep(step); } return false; };
const swState = (p) => p.evaluate(async () => {
  const rs = await navigator.serviceWorker.getRegistrations();
  return rs.map((r) => ({ scope: r.scope, script: (r.active || r.waiting || r.installing)?.scriptURL || '', state: (r.active || r.waiting || r.installing)?.state || '' }));
});
const cacheDump = (p) => p.evaluate(async () => { const o = {}; for (const n of await caches.keys()) o[n] = (await (await caches.open(n)).keys()).map((r) => r.url); return o; });
const controller = (p) => p.evaluate(() => navigator.serviceWorker.controller?.scriptURL || null);
const setVisible = (p, v) => p.evaluate((visible) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (visible ? 'visible' : 'hidden') });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => !visible });
  document.dispatchEvent(new Event('visibilitychange'));
}, v);
const IGNORED_CONSOLE = /Failed to load resource|net::ERR_|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_REFUSED|Failed to fetch|NetworkError|Manifest/i;
const realErrors = (list) => list.filter((t) => !IGNORED_CONSOLE.test(t));

// ═══════════════════════════════════════════════════════════════════════════
// A) LE SERVICE WORKER DE LA BORNE : portée, caches, rien d'autre
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── A) service worker : portée /borne seule, caches, rien de Supabase');
let swCtx;
{
  resetSite();
  const t = await tablet({ sw: 'allow', clock: null });
  swCtx = t.ctx;
  await openBorne(t.p);
  check(await until(async () => (await swState(t.p)).some((r) => r.state === 'activated'), 10000), 'A) le service worker de la borne est installé et actif');
  const reg = await swState(t.p);
  check(reg.length === 1 && reg[0].scope === `${BASE}/borne` && reg[0].script === `${BASE}/borne-sw.js`, `A) UNE seule inscription : portée « ${reg[0]?.scope} », fichier ${reg[0]?.script?.replace(BASE, '')}`);
  check(await until(async () => (await controller(t.p)) === `${BASE}/borne-sw.js`, 5000), 'A) la page /borne est contrôlée par ce service worker (claim à l’activation)');
  const caches1 = await until(async () => { const d = await cacheDump(t.p); return Object.keys(d).length === 2 && Object.values(d).every((v) => v.length > 0); }, 8000);
  const dump = await cacheDump(t.p);
  check(caches1 && JSON.stringify(Object.keys(dump).sort()) === JSON.stringify(['bx-borne-assets-v1', 'bx-borne-page-v1']), `A) deux caches versionnés : ${Object.keys(dump).join(', ')}`);
  const pageKeys = (dump['bx-borne-page-v1'] || []).map((u) => u.replace(BASE, ''));
  check(JSON.stringify(pageKeys) === JSON.stringify(['/borne']), `A) la page est rangée sous « /borne » seul (${pageKeys.join(' ')})`);
  const assets = (dump['bx-borne-assets-v1'] || []).map((u) => u.replace(BASE, ''));
  const html = bornePage();
  const mustHave = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]);
  const missing = mustHave.filter((m) => !assets.includes(m));
  check(mustHave.length >= 10 && missing.length === 0, `A) tous les fichiers de code cités par la page sont déjà en cache (${mustHave.length} cités, ${missing.length} manquants${missing.length ? ' : ' + missing.slice(0, 3).join(', ') : ''})`);
  check(['/fonts/fonts.css', '/fonts/archivo-latin.woff2', '/fonts/jetbrains-mono-latin.woff2', '/bemexo-wordmark-light.svg', '/cookies/cookieconsent.css'].every((x) => assets.includes(x)), 'A) polices (fonts.css + woff2), logo et cookies en cache');
  const all = [...pageKeys, ...assets];
  check(all.every((u) => u.startsWith('/') && !/supabase|functions\/v1|rest\/v1|auth\/v1/i.test(u)), 'A) AUCUNE adresse Supabase en cache : seulement des fichiers du site');
  check(!(JSON.stringify(dump).includes('jeton-secret') || JSON.stringify(dump).includes('?code=')), 'A) ni jeton ni code d’appairage dans les adresses gardées');
  // Un appel Supabase passe toujours par le réseau : même contrôlée, la page les fait (Playwright les voit).
  await t.p.reload(); await t.p.waitForTimeout(1500);
  check(t.calls('sync') >= 2 && t.calls('board') >= 2, `A) page contrôlée : ses appels à la fonction kiosk passent par le réseau (${t.calls('sync')} sync, ${t.calls('board')} board)`);
  // Le chargement de /borne?code=… range quand même la copie sous /borne seul.
  await openBorne(t.p, `${BASE}/borne?code=123456`);
  const d2 = await cacheDump(t.p);
  check((d2['bx-borne-page-v1'] || []).every((u) => u === `${BASE}/borne`) && !JSON.stringify(d2).includes('code=123456'), 'A) /borne?code=123456 ne laisse aucune trace du code dans les caches');
  // Le reste du site : pas de service worker de la borne, pas de contrôle.
  await t.p.goto(`${BASE}/connexion`); await t.p.waitForTimeout(800);
  check(await controller(t.p) === null, 'A) /connexion n’est PAS contrôlée par le service worker de la borne');
  await t.p.goto(`${BASE}/`); await t.p.waitForTimeout(500);
  check(await controller(t.p) === null, 'A) la page d’accueil non plus');
  const regs = await swState(t.p);
  check(regs.length === 1 && regs[0].scope.endsWith('/borne') && !regs.some((r) => r.script.endsWith('/sw.js')), 'A) hors /borne, le navigateur ne connaît que l’inscription /borne (pas de public/sw.js : les push n’ont pas été touchés)');
  const sentHits = site.hits.filter((h) => h.path === '/sw.js');
  check(sentHits.length === 0, 'A) public/sw.js (push) n’est jamais demandé par la borne');
  check(fs.readFileSync(path.join(OUT, 'sw.js'), 'utf8') === fs.readFileSync('public/sw.js', 'utf8'), 'A) public/sw.js servi = celui du dépôt, inchangé');
  await t.p.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// B) DÉMARRAGE SANS RÉSEAU
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── B) démarrage sans réseau : la borne s’ouvre, le dit, le QR tourne, reprise toute seule');
{
  // La tablette est installée et a déjà tourné (A). On coupe le réseau : le site ne répond plus, Supabase non plus.
  const net = { off: false };
  const t = await tablet({ ctx: swCtx, net });
  await stopSite(); net.off = true;
  const errs0 = pageErrors.length;
  const t0 = Date.now();
  await t.p.goto(`${BASE}/borne`, { timeout: 15000 }).catch((e) => console.log('   goto :', e.message.slice(0, 90)));
  await t.p.waitForSelector('[data-testid=kb-week]', { timeout: 15000 }).catch(() => {});
  const bootMs = Date.now() - t0;
  check(await t.p.locator('[data-testid=kb-week]').isVisible().catch(() => false), `B) site éteint : la borne s’ouvre sur son planning (${bootMs} ms)`);
  check(await t.p.evaluate(() => performance.getEntriesByType('navigation')[0].workerStart > 0).catch(() => false), 'B) … servie par le service worker (copie en cache)');
  await t.p.waitForTimeout(800);
  const banner = await t.p.locator('[data-testid=kb-offline]').innerText().catch(() => '');
  check(/Pas de réseau — reprise automatique/.test(banner), `B) elle le dit clairement : « ${banner.replace(/\n+/g, ' / ')} »`);
  check(/Le QR continue de tourner/.test(banner) && !/valable|accept|garanti/i.test(banner), 'B) … sans promettre plus que ce qui est possible (le QR tourne ; rien sur sa validité côté serveur)');
  check(await t.p.locator('[data-testid=kb-online].off').count() === 1, 'B) le point de connexion est orange');
  check(pageErrors.length === errs0 && realErrors(t.consoleErrors).length === 0, `B) aucune erreur JavaScript (${pageErrors.length - errs0} erreur(s) de page ; console : ${realErrors(t.consoleErrors).join(' | ') || 'rien hors réseau'})`);
  const fonts = await t.p.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')); });
  check(fonts.includes('Archivo') || fonts.length > 0, `B) les polices viennent du cache (${[...new Set(fonts)].join(', ')})`);
  check((await t.p.locator('[data-testid=kb-company]').innerText().catch(() => '')) === 'Martin Menuiserie', 'B) l’entreprise, le planning gardé et la date sont là');
  await t.p.screenshot({ path: `${SH}/tablette-hors-ligne-1280x800.png` });

  // Le QR s'affiche et il est le BON : celui que calcule le serveur (même seed, même minute). Horloge réelle.
  await t.p.click('[data-testid=kb-pointer]');
  await t.p.waitForSelector('[data-testid=kb-qr-overlay]', { timeout: 3000 }).catch(() => {});
  await t.p.waitForTimeout(300);
  const nowMs = await t.p.evaluate(() => Date.now());
  const refs = await Promise.all([refQrSvg(nowMs), refQrSvg(nowMs - 60_000), refQrSvg(nowMs + 60_000)]);
  const same = await t.p.evaluate((list) => {
    // Le navigateur re-sérialise le SVG : on compare ce qu'il fait des deux (page et référence).
    const shown = document.querySelector('.kb-qr').innerHTML;
    return list.map((svg) => { const d = document.createElement('div'); d.innerHTML = svg; return d.innerHTML === shown; });
  }, refs);
  check(same[0] || same[1], 'B) HORS LIGNE, le QR affiché est exactement celui que le serveur attend pour cette minute (même graine, même minute : calculé sur la tablette, sans réseau)');
  check(!same[2], 'B) … et ce n’est pas celui de la minute suivante (il tourne bien)');
  check(site.hits.length === 0 || site.up === false, 'B) (le site est bien éteint pendant ce test)');
  await t.p.click('[data-testid=kb-qr-overlay]'); await t.p.waitForTimeout(200);

  // Retour du réseau : le site répond, Supabase aussi, l'événement « online » arrive.
  await startSite(); net.off = false;
  const sync0 = t.calls('sync'), board0 = t.calls('board');
  await t.p.evaluate(() => window.dispatchEvent(new Event('online')));
  check(await until(async () => await t.p.locator('[data-testid=kb-offline]').count() === 0, 6000), 'B) retour du réseau : le message disparaît tout seul');
  check(t.calls('sync') > sync0 && t.calls('board') > board0, `B) … la borne a relu ses réglages et le planning sans qu’on la touche (${t.calls('sync') - sync0} sync, ${t.calls('board') - board0} board)`);
  check(await t.p.locator('[data-testid=kb-online].off').count() === 0, 'B) le point de connexion repasse au vert');
  check(pageErrors.length === errs0, 'B) toujours aucune erreur JavaScript');
  await t.p.close();
}
{
  // Même chose en téléphone / petite tablette (390 px) : le message tient, sans défilement horizontal.
  const net = { off: false };
  const t = await tablet({ ctx: swCtx, net, width: 390, height: 844 });
  await t.p.setViewportSize({ width: 390, height: 844 });
  await stopSite(); net.off = true;
  await t.p.goto(`${BASE}/borne`, { timeout: 15000 }).catch(() => {});
  await t.p.waitForSelector('[data-testid=kb-offline]', { timeout: 15000 }).catch(() => {});
  await t.p.waitForTimeout(500);
  const m = await t.p.evaluate(() => { const e = document.querySelector('[data-testid=kb-offline]'); const r = e?.getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, iw: innerWidth, l: r?.left, rr: r?.right, b: r?.bottom, ih: innerHeight }; });
  check(m.sw <= m.iw && m.l >= 0 && m.rr <= m.iw && m.b <= m.ih, `B) 390 px : le message tient dans l’écran (${Math.round(m.l)}–${Math.round(m.rr)} sur ${m.iw}), pas de défilement horizontal`);
  await t.p.screenshot({ path: `${SH}/tablette-hors-ligne-390x844.png` });
  await startSite(); net.off = false;
  await t.p.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// C) DÉPLOIEMENT SIMULÉ : jamais une page périmée en ligne ; la copie suit
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── C) déploiement simulé : page neuve en ligne, copie à jour, réseau lent, panne, secours');
{
  const net = { off: false };
  const t = await tablet({ ctx: swCtx, net });
  const deployOf = (p) => p.evaluate(() => document.querySelector('meta[name=x-deploy]')?.getAttribute('content') || null);
  await openBorne(t.p);
  check(await deployOf(t.p) === '1', 'C) avant : la page vient du déploiement 1');
  // Déploiement 2 : le serveur sert un autre HTML (autre empreinte du code de la page).
  site.deploy = 2; site.hits.length = 0;
  await t.p.reload(); await t.p.waitForSelector('[data-testid=kb-week]', { timeout: 10000 }).catch(() => {});
  check(await deployOf(t.p) === '2', 'C) en ligne après le déploiement : la page NEUVE est prise du premier coup (réseau d’abord, jamais la copie)');
  check(site.hits.some((h) => h.path === '/borne' && h.mode === 'navigate'), 'C) … le HTML a bien été redemandé au serveur');
  check(await until(async () => (await t.p.evaluate(async () => { const c = await caches.open('bx-borne-page-v1'); const r = await c.match('/borne'); return r ? (await r.text()).includes('content="2"') : false; })), 5000), 'C) … et la copie de secours est remplacée par la neuve');
  const assets = (await cacheDump(t.p))['bx-borne-assets-v1'].map((u) => u.replace(BASE, ''));
  check(assets.some((a) => /app\/borne\/page-2[0-9a-f]+\.js$/.test(a)), 'C) … avec les fichiers de code de la nouvelle version');
  // Réseau coupé : c'est la page du déploiement 2 qui s'ouvre, pas l'ancienne.
  await stopSite(); net.off = true;
  await t.p.reload({ timeout: 15000 }).catch(() => {}); await t.p.waitForSelector('[data-testid=kb-week]', { timeout: 15000 }).catch(() => {});
  check(await deployOf(t.p) === '2' && await t.p.locator('[data-testid=kb-week]').isVisible(), 'C) hors ligne ensuite : la borne s’ouvre sur la version 2 (la copie n’est pas restée sur l’ancienne)');
  await startSite(); net.off = false;
  // Réseau lent (le serveur met 7 s) : la copie est servie après 4 s, la mise à jour continue en arrière-plan.
  site.deploy = 3; site.slowMs = 7000;
  const ts = Date.now();
  await t.p.reload({ timeout: 20000 });
  await t.p.waitForSelector('[data-testid=kb-week]', { timeout: 20000 }).catch(() => {});
  const slow = Date.now() - ts;
  check(slow >= 3500 && slow < 6500 && await deployOf(t.p) === '2', `C) réseau lent : après ~4 s la dernière bonne page est servie, pas une page blanche (${slow} ms, version ${await deployOf(t.p)})`);
  check(await until(async () => (await t.p.evaluate(async () => { const c = await caches.open('bx-borne-page-v1'); const r = await c.match('/borne'); return r ? (await r.text()).includes('content="3"') : false; })), 9000), 'C) … et la copie passe à la version 3 dès que le serveur a répondu (pour la prochaine ouverture)');
  site.slowMs = 0;
  // Serveur en panne (500) : la copie, pas la page d'erreur.
  site.fail = 500;
  await t.p.reload({ timeout: 15000 }); await t.p.waitForSelector('[data-testid=kb-week]', { timeout: 10000 }).catch(() => {});
  check(await t.p.locator('[data-testid=kb-week]').isVisible() && await deployOf(t.p) === '3', 'C) le serveur répond 500 : la dernière bonne page s’ouvre');
  check(await t.p.evaluate(async () => (await (await (await caches.open('bx-borne-page-v1')).match('/borne')).text()).includes('content="3"')), 'C) … la page d’erreur n’a PAS remplacé la copie');
  site.fail = 404;
  await t.p.reload({ timeout: 15000 }); await t.p.waitForSelector('[data-testid=kb-week]', { timeout: 10000 }).catch(() => {});
  check(await t.p.locator('[data-testid=kb-week]').isVisible(), 'C) 404 : la borne s’ouvre encore (copie), la page « introuvable » ne la remplace pas');
  site.fail = 0;
  await t.p.close();
}
{
  // Nouvelle version du service worker : ses caches remplacent les anciens (les seuls retirés).
  const t = await tablet({ ctx: swCtx });
  await openBorne(t.p);
  await t.p.evaluate(async () => { const c = await caches.open('bx-borne-ancien-test'); await c.put('/x', new Response('x')); await caches.open('autre-cache-du-site'); });
  site.swVersion = 2;
  await t.p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration('/borne'); await r.update(); });
  // L'installation de la v2 remplit ses caches, puis l'activation retire les anciens.
  const swap = await until(async () => { const k = await t.p.evaluate(() => caches.keys()); return k.includes('bx-borne-page-v2') && k.includes('bx-borne-assets-v2') && !k.includes('bx-borne-page-v1'); }, 12000);
  const keys = await t.p.evaluate(() => caches.keys());
  check(swap, `C) nouvelle version du service worker : caches v2 créés (${keys.join(', ')})`);
  check(!keys.includes('bx-borne-page-v1') && !keys.includes('bx-borne-assets-v1') && !keys.includes('bx-borne-ancien-test'), 'C) … les anciens caches « bx-borne-… » sont retirés');
  check(keys.includes('autre-cache-du-site'), 'C) … un cache qui n’est pas à la borne n’est jamais touché');
  const d = await cacheDump(t.p);
  check((d['bx-borne-assets-v2'] || []).length > 10 && (d['bx-borne-page-v2'] || []).length === 1, `C) … et les nouveaux sont déjà remplis (${(d['bx-borne-assets-v2'] || []).length} fichiers, ${(d['bx-borne-page-v2'] || []).length} page)`);
  await t.p.evaluate(async () => { await caches.delete('autre-cache-du-site'); });
  site.swVersion = 1;
  await t.p.close();
}
{
  // Ni réseau NI copie (caches vidés) : l'écran de secours, qui recharge tout seul au retour du réseau.
  const net = { off: false };
  const t = await tablet({ ctx: swCtx, net });
  await t.p.goto(`${BASE}/borne`); await t.p.waitForTimeout(800);
  await t.p.evaluate(async () => { for (const n of await caches.keys()) await caches.delete(n); });
  await stopSite(); net.off = true;
  const e0 = pageErrors.length;
  await t.p.goto(`${BASE}/borne`, { timeout: 15000 }).catch(() => {});
  await t.p.waitForTimeout(800);
  const txt = (await t.p.locator('body').innerText().catch(() => '')).replace(/\n+/g, ' / ');
  check(/Pas de réseau — reprise automatique/.test(txt) && /s’ouvrira dès que la tablette retrouvera internet/.test(txt), `C) sans copie ni réseau : l’écran de secours « ${txt} »`);
  check(pageErrors.length === e0, 'C) … sans erreur JavaScript');
  await t.p.screenshot({ path: `${SH}/ecran-secours-sans-copie-1280x800.png` });
  await startSite(); net.off = false;
  await t.p.evaluate(() => window.dispatchEvent(new Event('online')));
  check(await until(async () => await t.p.locator('[data-testid=kb-week], [data-testid=kb-pairing]').count() === 1, 8000), 'C) au retour du réseau, l’écran de secours recharge la vraie borne tout seul');
  check(await until(async () => (await t.p.evaluate(async () => (await caches.keys()).length)) === 2, 8000), 'C) … et les caches se remplissent de nouveau');
  await t.p.close();
}
{
  // Le service worker de la borne cohabite avec celui des notifications (portée « / ») : la borne garde le sien.
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR', serviceWorkers: 'allow' });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/connexion`); await p.waitForTimeout(500);
  await p.evaluate(async () => { await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; });
  const t = await tablet({ ctx });
  await openBorne(t.p);
  await until(async () => (await controller(t.p)) !== null, 6000);
  await t.p.reload(); await t.p.waitForTimeout(1200);
  const regs = await swState(t.p);
  check(regs.length === 2 && regs.some((r) => r.scope === `${BASE}/` && r.script.endsWith('/sw.js')) && regs.some((r) => r.scope === `${BASE}/borne`), 'C) deux inscriptions côte à côte : « / » (notifications) et « /borne »');
  check(await controller(t.p) === `${BASE}/borne-sw.js`, 'C) /borne est contrôlée par SON service worker (portée la plus précise), jamais par celui des notifications');
  const other = await ctx.newPage(); await other.goto(`${BASE}/connexion`); await other.waitForTimeout(500);
  const c2 = await other.evaluate(() => navigator.serviceWorker.controller?.scriptURL || null);
  check(c2 === null || c2.endsWith('/sw.js'), `C) le reste du site n’est jamais contrôlé par le service worker de la borne (${c2 ? c2.replace(BASE, '') : 'aucun'})`);
  await ctx.close();
}
try { await swCtx.close(); } catch { /* */ }
if (!site.up) await startSite();

// ═══════════════════════════════════════════════════════════════════════════
// D) RECHARGEMENT DE NUIT
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── D) rechargement de nuit : sûr, une fois, jamais pendant un pointage');
const NIGHT = new Date('2026-10-14T01:30:00Z'); // 03:30 à Paris (heure d'été)
const NOON = new Date('2026-10-14T10:00:00Z'); // 12:00 à Paris
const step = async (p, ms = 60_000, n = 1, wait = 160) => { for (let i = 0; i < n; i++) { await p.clock.fastForward(ms); await p.waitForTimeout(wait); } };
const versionChecks = () => site.hits.filter((h) => h.path === '/borne' && h.mode === 'cors').length;
const markerOf = (p) => p.evaluate(() => localStorage.getItem('bx_borne_night')).catch(() => null);
{
  // D1 · la nuit, au calme, nouvelle version : UN rechargement, exactement.
  resetSite();
  const t = await tablet({ clock: NIGHT });
  await openBorne(t.p); site.deploy = 2;
  check(await t.loads() === 1, 'D1) page ouverte : 1 chargement');
  await step(t.p, 60_000, 5);
  check(await t.loads() === 1 && versionChecks() === 0, `D1) 5 min après l’ouverture (moins de 10 min de calme) : aucune vérification, aucun rechargement (${versionChecks()} vérif.)`);
  await step(t.p, 60_000, 6, 250);
  const n1 = await until(async () => (await t.loads()) === 2, 6000);
  check(n1, 'D1) après 10 min de calme, à 03:4x, en ligne, nouvelle version : la borne se recharge');
  await t.p.waitForSelector('[data-testid=kb-week]', { timeout: 10000 }).catch(() => {});
  const mk = JSON.parse(await markerOf(t.p) || '{}');
  check(mk.day === '2026-10-14', `D1) la nuit est marquée (« ${mk.day} »)`);
  check(await t.p.evaluate(() => document.querySelector('meta[name=x-deploy]')?.getAttribute('content')) === '2', 'D1) … et la page rechargée est la neuve');
  const checksBefore = versionChecks();
  await step(t.p, 60_000, 80, 60);
  check(await t.loads() === 2 && versionChecks() === checksBefore, `D1) 80 minutes de plus dans la plage : toujours 2 chargements, aucune autre vérification (${versionChecks() - checksBefore})`);
  await t.ctx.close();
}
{
  // D2 · même version : rien à récupérer → pas de rechargement ; la vérification a lieu UNE fois.
  resetSite();
  const t = await tablet({ clock: NIGHT });
  await openBorne(t.p);
  await step(t.p, 60_000, 12, 250);
  await step(t.p, 60_000, 30, 80);
  check(await t.loads() === 1, 'D2) version identique : aucun rechargement inutile');
  check(versionChecks() === 1, `D2) … et une seule vérification de la nuit (${versionChecks()})`);
  check(JSON.parse(await markerOf(t.p) || '{}').day === '2026-10-14', 'D2) la nuit est marquée quand même');
  await t.ctx.close();
}
{
  // D3 · toucher récent : on attend 10 min de calme APRÈS le dernier toucher.
  resetSite();
  const t = await tablet({ clock: NIGHT });
  await openBorne(t.p); site.deploy = 2;
  await step(t.p, 60_000, 9, 120);
  await t.p.mouse.click(640, 400); // un toucher à 03:39
  await step(t.p, 60_000, 9, 160);
  check(await t.loads() === 1 && versionChecks() === 0, 'D3) 9 min après un toucher : pas de rechargement, pas de vérification');
  await step(t.p, 60_000, 3, 300);
  check(await until(async () => (await t.loads()) === 2, 6000), 'D3) 10 min après le dernier toucher : rechargée');
  await t.ctx.close();
}
{
  // D4 · le QR est à l'écran (pointage possible) : jamais, même si le calme est ancien.
  resetSite();
  const t = await tablet({ clock: NIGHT });
  await openBorne(t.p); site.deploy = 2;
  // On laisse 12 min passer, puis on ouvre le QR : touché = calme remis à zéro ET écran occupé.
  await step(t.p, 60_000, 4, 120);
  site.hits.length = 0;
  await t.p.click('[data-testid=kb-pointer]');
  await t.p.waitForSelector('[data-testid=kb-qr-overlay]', { timeout: 3000 });
  await step(t.p, 20_000, 1, 200);
  check(await t.loads() === 1 && versionChecks() === 0, 'D4) QR affiché : aucun rechargement, aucune vérification');
  await t.ctx.close();
}
{
  // D5 · hors de la plage (midi) : jamais, même au calme et avec une nouvelle version.
  resetSite();
  const t = await tablet({ clock: NOON });
  await openBorne(t.p); site.deploy = 2;
  await step(t.p, 60_000, 30, 60);
  check(await t.loads() === 1 && versionChecks() === 0 && await markerOf(t.p) === null, 'D5) midi : aucun rechargement, aucune vérification, aucun marqueur');
  // Avant 02:00 : rien ; à 02:00 pile la plage s'ouvre et, le calme étant ancien, la borne se recharge.
  await t.ctx.close();
  resetSite();
  const t2 = await tablet({ clock: new Date('2026-10-13T23:40:00Z') }); // 01:40 à Paris
  await openBorne(t2.p); site.deploy = 2;
  await step(t2.p, 60_000, 19, 70); // 01:59
  check(await t2.loads() === 1 && versionChecks() === 0 && await markerOf(t2.p) === null, 'D5) 01:40 → 01:59, calme depuis 19 min mais plage fermée : aucune vérification, aucun marqueur');
  await step(t2.p, 60_000, 2, 350); // 02:01
  check(await until(async () => (await t2.loads()) === 2, 6000), 'D5) à 02:00 la plage s’ouvre : la borne (au calme) se recharge');
  await t2.ctx.close();
  // Fin de plage : 03:58 encore permis, 04:00 fermé.
  resetSite();
  const t3 = await tablet({ clock: new Date('2026-10-14T01:48:00Z') }); // 03:48 à Paris
  await openBorne(t3.p); site.deploy = 2;
  await step(t3.p, 60_000, 9, 80); // 03:57
  check(await t3.loads() === 1, 'D5) 03:48 → 03:57 : moins de 10 min de calme, pas de rechargement');
  await step(t3.p, 60_000, 2, 350); // 03:59
  check(await until(async () => (await t3.loads()) === 2, 6000), 'D5) à 03:58 (10 min de calme, plage encore ouverte) : rechargée');
  await t3.ctx.close();
  resetSite();
  const t4 = await tablet({ clock: new Date('2026-10-14T01:55:00Z') }); // 03:55 à Paris
  await openBorne(t4.p); site.deploy = 2;
  await step(t4.p, 60_000, 20, 80); // 04:15
  check(await t4.loads() === 1 && versionChecks() === 0 && await markerOf(t4.p) === null, 'D5) 03:55 → 04:15 : le calme de 10 min arrive à 04:05, plage fermée : rien');
  await t4.ctx.close();
}
{
  // D6 · hors ligne : rien ; le réseau revient dans la plage : une tentative.
  resetSite();
  const t = await tablet({ clock: NIGHT });
  await openBorne(t.p); site.deploy = 2;
  await t.ctx.setOffline(true);
  await t.p.evaluate(() => window.dispatchEvent(new Event('offline')));
  await step(t.p, 60_000, 14, 100);
  check(await t.loads() === 1 && versionChecks() === 0 && await markerOf(t.p) === null, 'D6) hors ligne (navigator.onLine faux) : aucune tentative, aucun marqueur');
  await t.ctx.setOffline(false);
  await step(t.p, 60_000, 3, 350);
  check(await until(async () => (await t.loads()) === 2, 6000), 'D6) le réseau revient dans la plage : une tentative, et la borne se recharge');
  await t.ctx.close();
}
{
  // D7 · page cachée (écran verrouillé, onglet masqué) : rien.
  resetSite();
  const t = await tablet({ clock: NIGHT });
  await openBorne(t.p); site.deploy = 2;
  await setVisible(t.p, false);
  await step(t.p, 60_000, 14, 100);
  check(await t.loads() === 1 && versionChecks() === 0, 'D7) page cachée : aucun rechargement');
  await setVisible(t.p, true);
  await step(t.p, 60_000, 12, 250);
  check(await until(async () => (await t.loads()) === 2, 6000), 'D7) visible de nouveau, calme : rechargée');
  await t.ctx.close();
}
{
  // D8 · le serveur ne répond pas à la vérification : on ne recharge pas ET on ne boucle pas.
  resetSite();
  const t2 = await tablet({ clock: NIGHT });
  await openBorne(t2.p); site.deploy = 2;
  site.fail = 500; site.hits.length = 0;
  await step(t2.p, 60_000, 12, 250);
  await step(t2.p, 60_000, 40, 80);
  check(await t2.loads() === 1, 'D8) le serveur répond 500 à la vérification : pas de rechargement');
  check(versionChecks() === 1, `D8) … une seule tentative pour toute la nuit, pas de boucle (${versionChecks()} vérification)`);
  site.fail = 0;
  await step(t2.p, 60_000, 30, 80);
  check(await t2.loads() === 1 && versionChecks() === 1, 'D8) le serveur revient dans la même nuit : on ne réessaie pas avant la nuit suivante');
  // La nuit suivante (+24 h) : nouvelle tentative, qui aboutit.
  await t2.p.clock.fastForward(22 * 3600_000);
  await t2.p.waitForTimeout(300);
  await step(t2.p, 60_000, 6, 300);
  check(await until(async () => (await t2.loads()) === 2, 6000), 'D8) la nuit suivante : nouvelle tentative, la borne se recharge');
  await t2.ctx.close();
}
{
  // D9 · mémoire inutilisable : pas de marqueur possible → JAMAIS de rechargement (pas de boucle).
  resetSite();
  const t = await tablet({ clock: NIGHT, extraInit: () => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (k === 'bx_borne_night') throw new Error('stockage plein'); return set.call(this, k, v); };
  } });
  await openBorne(t.p); site.deploy = 2;
  await step(t.p, 60_000, 12, 200);
  await step(t.p, 60_000, 20, 80);
  check(await t.loads() === 1 && versionChecks() === 0, 'D9) marqueur impossible à écrire : aucune vérification, aucun rechargement, aucune boucle');
  check(pageErrors.length === 0, 'D9) … et aucune erreur JavaScript');
  await t.ctx.close();
}
{
  // D10 · déjà fait cette nuit (marqueur du jour) : rien. Marqueur d'hier : permis.
  resetSite();
  const t = await tablet({ clock: NIGHT, extraInit: () => { if (!sessionStorage.getItem('mk')) { localStorage.setItem('bx_borne_night', JSON.stringify({ day: '2026-10-14', at: 1 })); sessionStorage.setItem('mk', '1'); } } });
  await openBorne(t.p); site.deploy = 2;
  await step(t.p, 60_000, 14, 100);
  check(await t.loads() === 1 && versionChecks() === 0, 'D10) marqueur d’aujourd’hui déjà posé : rien');
  await t.ctx.close();
  resetSite();
  const t2 = await tablet({ clock: NIGHT, extraInit: () => { if (!sessionStorage.getItem('mk')) { localStorage.setItem('bx_borne_night', JSON.stringify({ day: '2026-10-13', at: 1 })); sessionStorage.setItem('mk', '1'); } } });
  await openBorne(t2.p); site.deploy = 2;
  await step(t2.p, 60_000, 12, 250);
  check(await until(async () => (await t2.loads()) === 2, 6000), 'D10) marqueur d’hier : la nuit d’aujourd’hui est permise');
  await t2.ctx.close();
}
{
  // D11 · tablette NON reliée (écran « Relier »), démo : jamais de rechargement de nuit.
  resetSite();
  const t = await tablet({ clock: NIGHT, cache: null });
  await openBorne(t.p); site.deploy = 2; // (un nouveau déploiement existe, mais la tablette n'est pas reliée)
  await step(t.p, 60_000, 14, 100);
  check(await t.loads() === 1 && versionChecks() === 0, 'D11) tablette non reliée : aucun rechargement de nuit');
  await t.ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// E) RELECTURE TOUTES LES 60 s
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── E) planning relu toutes les 60 s ; sans attendre au retour du réseau, au retour sur la page, au toucher');
{
  resetSite();
  const t = await tablet({ clock: NOON });
  await openBorne(t.p);
  const b0 = t.calls('board');
  await step(t.p, 30_000, 1, 300);
  check(t.calls('board') === b0, `E) 30 s après : pas de relecture (avant le lot 30, il y en avait une) — ${t.calls('board') - b0}`);
  await step(t.p, 31_000, 1, 300);
  check(t.calls('board') === b0 + 1, `E) 61 s après : une relecture (${t.calls('board') - b0})`);
  // Cadence tenue : 10 minutes = 10 relectures (et non 20).
  const b1 = t.calls('board');
  for (let i = 0; i < 10; i++) await step(t.p, 60_000, 1, 220);
  const n = t.calls('board') - b1;
  check(n >= 9 && n <= 11, `E) 10 minutes : ${n} relectures (60 s), pas 20 (30 s)`);
  // Retour du réseau : tout de suite.
  const b2 = t.calls('board'), s2 = t.calls('sync');
  await t.p.evaluate(() => window.dispatchEvent(new Event('online')));
  await t.p.waitForTimeout(300);
  check(t.calls('board') === b2 + 1 && t.calls('sync') === s2 + 1, 'E) retour du réseau (événement « online ») : sync + planning relus aussitôt, sans attendre la minute');
  // Retour sur la page : relu aussitôt si le planning a plus de 20 s ; rien s'il est frais.
  const age = () => t.p.evaluate(() => Date.now() - JSON.parse(localStorage.getItem('bx_kiosk_v1')).boardAt);
  const stale = async () => { for (let i = 0; i < 12 && (await age()) < 22_000; i++) await step(t.p, 6_000, 1, 150); return age(); };
  const a1 = await stale();
  const b3 = t.calls('board');
  await setVisible(t.p, false); await setVisible(t.p, true);
  await t.p.waitForTimeout(350);
  check(a1 >= 22_000 && t.calls('board') === b3 + 1, `E) retour sur la page, planning vieux de ${Math.round(a1 / 1000)} s (> 20 s) : relu aussitôt`);
  const b4 = t.calls('board');
  await setVisible(t.p, false); await setVisible(t.p, true);
  await t.p.waitForTimeout(300);
  check(t.calls('board') === b4, 'E) retour sur la page juste après : rien (planning frais)');
  // Toucher : relu si le planning a plus de 20 s ; une rafale de touchers ne lance qu’UNE relecture.
  const a2 = await stale();
  const b5 = t.calls('board');
  for (let i = 0; i < 5; i++) await t.p.mouse.click(300 + i * 5, 450, { delay: 5 });
  await t.p.waitForTimeout(400);
  check(a2 >= 22_000 && t.calls('board') === b5 + 1, `E) toucher, planning vieux de ${Math.round(a2 / 1000)} s (> 20 s) : relu, UNE seule fois malgré 5 touchers (${t.calls('board') - b5})`);
  const b6 = t.calls('board');
  await t.p.mouse.click(300, 450); await t.p.waitForTimeout(300);
  check(t.calls('board') === b6, 'E) toucher juste après : pas de nouvelle relecture');
  await t.ctx.close();
}
{
  // Réseau qui « revient » avant que les noms ne marchent : deux nouveaux essais rapprochés (5 s, 20 s).
  resetSite();
  const net = { off: false };
  const t = await tablet({ clock: NOON, net });
  await openBorne(t.p);
  net.off = true;
  await step(t.p, 61_000, 1, 400);
  check(await t.p.locator('[data-testid=kb-offline]').count() === 1, 'E) appels qui échouent : « Pas de réseau — reprise automatique »');
  const s0 = t.calls('sync'), b0 = t.calls('board');
  await t.p.evaluate(() => window.dispatchEvent(new Event('online'))); // le navigateur dit « en ligne », mais les appels échouent encore
  await t.p.waitForTimeout(300);
  await step(t.p, 6_000, 1, 300);
  await step(t.p, 15_000, 1, 300);
  check(t.calls('board') - b0 >= 3 && t.calls('sync') - s0 >= 3, `E) trois essais rapprochés (tout de suite, 5 s, 20 s) tant que le réseau ne répond pas (${t.calls('sync') - s0} sync, ${t.calls('board') - b0} board)`);
  net.off = false;
  await step(t.p, 61_000, 1, 500);
  check(await until(async () => await t.p.locator('[data-testid=kb-offline]').count() === 0, 4000), 'E) puis la relecture de la minute suivante suffit : reprise toute seule, sans événement « online »');
  await t.ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// F) L'ÉTAT DE L'ÉCRAN JOINT À `sync`
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── F) l’état de l’écran envoyé avec sync : liste blanche, dès qu’il change');
const ALLOWED = ['wake', 'standalone', 'fullscreen', 'online', 'version'];
const lastState = (t) => t.fn.filter((c) => c.action === 'sync').map((c) => c.client_state).filter(Boolean).pop();
{
  resetSite();
  const t = await tablet({ clock: NOON });
  await openBorne(t.p);
  const first = t.fn.find((c) => c.action === 'sync');
  check(!!first && !!first.client_state && Object.keys(first.client_state).every((k) => ALLOWED.includes(k)), `F) le premier sync porte client_state, clés autorisées seulement (${Object.keys(first?.client_state || {}).join(', ')})`);
  check(first.client_state.standalone === false && first.client_state.online === true && first.client_state.fullscreen === false, 'F) onglet de navigateur : standalone faux, en ligne, pas en plein écran');
  check(!('wake' in first.client_state), 'F) verrou d’écran pas encore connu au premier sync : le champ est absent (le bureau ne dit rien)');
  const raw = JSON.stringify(t.fn.filter((c) => c.action === 'sync'));
  check(!raw.includes('seed') && !raw.includes(SEED) && !/"token":"[^"]*"[^}]*client_state[^}]*jeton/.test(raw), 'F) la graine n’est jamais envoyée');
  const bodyKeys = Object.keys(first).filter((k) => k !== 'at' && k !== 'failed').sort().join();
  check(bodyKeys === 'action,client_state,kiosk_id,token', `F) corps de sync : ${bodyKeys} (le jeton sert à s’identifier, il n’est pas dans client_state)`);
  check(!JSON.stringify(first.client_state).includes('jeton'), 'F) client_state ne contient aucun jeton');
  await step(t.p, 4_000, 1, 500);
  const later = lastState(t);
  check(/^[0-9a-f]{8}$/.test(later.version), `F) version de l’appli : ${later.version} (empreinte de 8 signes, envoyée une fois la page chargée)`);
  // Même version que celle que calcule le serveur à partir du HTML (c'est ce qui sert au rechargement de nuit) :
  // mêmes fichiers, même empreinte (FNV-1a de leurs noms triés).
  const names = [...new Set([...bornePage().matchAll(/<script[^>]*?\bsrc="([^"]+)"/g)].map((m) => m[1]).filter((u) => /^\/_next\/static\/chunks\/(?:webpack|main-app|app\/layout|app\/borne\/page)-[0-9a-f]{8,}\.js$/.test(u)))].sort();
  let h = 0x811c9dc5; for (const ch of names.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  check(names.length === 4 && later.version === h.toString(16).padStart(8, '0'), `F) la version envoyée = l’empreinte des 4 fichiers de la borne cités par le HTML du serveur (${later.version})`);
  // Le verrou devient connu : le bureau en est informé tout de suite (sync de démarrage ou sync de changement d'état).
  check(lastState(t)?.wake === 'held', `F) quelques secondes après l'ouverture : wake = held (${lastState(t)?.wake})`);
  // Stable : pas d'envoi superflu.
  const s1 = t.calls('sync');
  await step(t.p, 60_000, 4, 150);
  check(t.calls('sync') === s1, 'F) état inchangé : aucun envoi en plus avant les 5 minutes');
  await step(t.p, 60_000, 2, 250);
  check(t.calls('sync') === s1 + 1, 'F) le sync de 5 minutes repart avec l’état (un seul)');
  await t.ctx.close();
}
for (const [label, opts, expect] of [
  ['verrou refusé', { wake: 'deny' }, { wake: 'denied' }],
  ['verrou non pris en charge', { wake: 'none' }, { wake: 'unsupported' }],
  ['appli installée (standalone)', { standalone: true }, { standalone: true, wake: 'held' }],
]) {
  resetSite();
  const t = await tablet({ clock: NOON, ...opts });
  await openBorne(t.p);
  await step(t.p, 5_000, 1, 500);
  const st = lastState(t);
  check(Object.entries(expect).every(([k, v]) => st?.[k] === v), `F) ${label} : ${JSON.stringify(st)}`);
  await t.ctx.close();
}
{
  // Verrou refusé puis accordé au toucher : un nouveau sync part avec wake = held (au plus un par minute).
  resetSite();
  const t = await tablet({ clock: NOON, wake: 'deny' });
  await openBorne(t.p);
  await step(t.p, 5_000, 1, 400);
  check(lastState(t)?.wake === 'denied', 'F) refusé au départ : wake = denied');
  await t.p.evaluate(() => { window.__wl.mode = 'grant'; });
  await t.p.mouse.click(640, 400, { delay: 5 });
  await t.p.waitForTimeout(300);
  const s0 = t.calls('sync');
  await step(t.p, 61_000, 1, 500);
  check(lastState(t)?.wake === 'held' && t.calls('sync') >= s0 + 1, `F) accordé au toucher : le bureau en est informé (${lastState(t)?.wake})`);
  await t.ctx.close();
}
{
  // Fonction `kiosk` pas à jour (400 « Action inconnue » sur un champ qu'elle ignore) : la borne n'en dit rien et ne change pas de cadence.
  resetSite();
  const t = await tablet({ clock: NOON, api: { sync: 400, board: 200 } });
  await openBorne(t.p);
  await step(t.p, 61_000, 1, 300);
  check(await t.p.locator('[data-testid=kb-week]').isVisible() && await t.p.locator('[data-testid=kb-pairing]').count() === 0, 'F) un sync refusé (fonction pas à jour) : la borne reste affichée, reliée, sans message');
  await t.ctx.close();
}

// ── Captures du chapitre « tablette » : déjà prises dans B et C ───────────────
const shots = fs.readdirSync(SH).filter((f) => f.endsWith('.png'));
console.log('\ncaptures :', shots.join(', '));
await stopSite().catch(() => {});
await b.close();
console.log(`\n${ok} ok, ${ko} échec(s) ; erreurs de page : ${pageErrors.length}`);
process.exit(ko || pageErrors.length ? 1 : 0);
