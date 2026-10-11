// Lot 2 (IA) — « la borne s'ouvre et reste allumée ».
// Lancer : node scripts/tests/borne-allumee.mjs out docs/captures-borne-allumee 42100 (après npm run build).
//
//  A) Manifeste : /borne a le sien (start_url /borne, scope /borne, plein écran,
//     orientation libre, icônes PNG 192 et 512) ; les autres pages gardent
//     /manifest.json (start_url "/").
//  B) Filet de sécurité : une tablette reliée qui arrive sur "/" repart sur
//     /borne ; sur /landing seulement si elle est ouverte comme appli
//     installée. Un vrai visiteur va toujours sur la vitrine.
//  C) Verrou d'écran (navigator.wakeLock simulé) : pris à l'ouverture, redemandé
//     à chaque toucher (souris : à l'appui ; doigt : au relâché), quand le
//     système le relâche (page visible), au retour sur la page et toutes les
//     60 s ; jamais deux verrous ; refusé ou absent → petit rappel discret.
//  D) Plein écran au premier toucher, une seule fois ; l'icône marche toujours.
//  E) 403 (borne désactivée pour l'entreprise) : « Borne suspendue », la
//     tablette reste reliée (bx_kiosk_v1 gardé), revérifie chaque minute et
//     repart toute seule. 401 et 410 : l'appairage est bien effacé.
//  F) Appairage : navigator.storage.persist() demandé (et sans erreur s'il
//     n'existe pas).
//  G) Fenêtre « Borne » du bureau : aide « Installer la tablette », repliée par
//     défaut, qui s'ouvre et se referme.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const { chromium } = await import('playwright-core')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.mjs'));
const [,, OUT = 'out', SH = 'docs/captures-borne-allumee', PORT_ARG = '42100'] = process.argv; fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT_ARG), r));
const PORT = srv.address().port;
const BASE = `http://localhost:${PORT}`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const errors = [];

// ── Données fictives (mêmes noms neutres que les autres tests de la borne) ──
const NOW = new Date('2026-10-01T07:30:00Z'); // jeudi 09:30 à Paris
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
const CACHE = { kioskId: 'k-test', token: 'jeton', seed: 'ZGVtby1ib3JuZS1iZW1leG8tbmUtcGFzLXV0aWxpc2Vy', companyName: 'Martin Menuiserie', kioskName: 'Entrée du dépôt', settings: SETTINGS, board: BOARD, boardAt: NOW.getTime(), syncedAt: NOW.getTime() };

// navigator.wakeLock simulé : `mode` = grant | deny | none (absent).
const WAKE_STUB = (mode) => {
  const w = { mode, requests: 0, sentinels: [] };
  window.__wl = w;
  w.active = () => w.sentinels.filter((s) => !s.released).length;
  w.systemRelease = () => w.sentinels.filter((s) => !s.released).forEach((s) => s.__fire());
  if (mode === 'none') { try { Object.defineProperty(navigator, 'wakeLock', { configurable: true, get: () => undefined }); } catch { /* */ } return; }
  const sentinel = () => {
    const ls = new Set();
    const s = {
      released: false, type: 'screen',
      addEventListener(t, f) { if (t === 'release') ls.add(f); },
      removeEventListener(t, f) { if (t === 'release') ls.delete(f); },
      async release() { if (!s.released) s.__fire(); },
      __fire() { s.released = true; ls.forEach((f) => f(new Event('release'))); },
    };
    return s;
  };
  const api = {
    async request() {
      w.requests++;
      if (w.mode === 'deny') { const e = new Error('Refusé'); e.name = 'NotAllowedError'; throw e; }
      const s = sentinel(); w.sentinels.push(s); return s;
    },
  };
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, get: () => api });
};
// navigator.storage.persist simulé (compteur), ou absent.
const PERSIST_STUB = (present) => {
  window.__persist = 0;
  const st = present ? { persist: async () => { window.__persist++; return true; }, persisted: async () => false } : undefined;
  try { Object.defineProperty(navigator, 'storage', { configurable: true, get: () => st }); } catch { /* */ }
};
// Appli installée : display-mode standalone.
const STANDALONE_STUB = () => {
  const orig = window.matchMedia.bind(window);
  window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : orig(q));
};

/** La page /borne, fonction kiosk simulée ; `api.sync` / `api.board` = statut HTTP à rendre. */
async function tablet({ width = 1280, height = 800, cache = CACHE, isMobile = false, wake = 'grant', persist = true, standalone = false, api = { sync: 200, board: 200 } } = {}) {
  const ctx = await b.newContext({ viewport: { width, height }, locale: 'fr-FR', timezoneId: 'Europe/Paris', hasTouch: isMobile, isMobile });
  await ctx.clock.install({ time: NOW });
  await ctx.addInitScript(WAKE_STUB, wake);
  await ctx.addInitScript(PERSIST_STUB, persist);
  if (standalone) await ctx.addInitScript(STANDALONE_STUB);
  if (cache) await ctx.addInitScript(([k, v]) => { if (!sessionStorage.getItem('init')) { localStorage.setItem(k, v); sessionStorage.setItem('init', '1'); } }, ['bx_kiosk_v1', JSON.stringify(cache)]);
  const fn = [];
  const refusal = (s) => (s === 403 ? { error: 'La borne de pointage est désactivée pour cette entreprise.', disabled: true }
    : s === 410 ? { error: 'Cette borne a été retirée par le bureau.', revoked: true } : { error: 'Borne inconnue', revoked: true });
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.startsWith('/functions/v1/kiosk')) {
      const body = JSON.parse(r.request().postData() || '{}');
      fn.push(body);
      if (body.action === 'sync') return api.sync === 200 ? r.fulfill({ json: { revoked: false, kiosk_name: 'Borne', company_name: 'Martin Menuiserie', settings: SETTINGS, planning: [] } }) : r.fulfill({ status: api.sync, json: refusal(api.sync) });
      if (body.action === 'board') return api.board === 200 ? r.fulfill({ json: BOARD }) : r.fulfill({ status: api.board, json: refusal(api.board) });
      if (body.action === 'pair') return r.fulfill({ json: { kiosk_id: 'k-neuve', token: 'jeton-neuf', seed: CACHE.seed, step: 60, digits: 8, kiosk_name: 'Borne', company_name: 'Martin Menuiserie', settings: SETTINGS } });
      return r.fulfill({ status: 400, json: { error: 'Action inconnue' } });
    }
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    return r.fulfill({ json: [] });
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { errors.push(e.message); console.log('   [erreur page]', e.message); });
  const calls = (a) => fn.filter((c) => c.action === a).length;
  return { ctx, p, fn, calls, api };
}
const stored = (p) => p.evaluate(() => localStorage.getItem('bx_kiosk_v1'));
const wl = (p) => p.evaluate(() => ({ requests: window.__wl.requests, active: window.__wl.active() }));
const setVisible = (p, visible) => p.evaluate((v) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (v ? 'visible' : 'hidden') });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => !v });
  document.dispatchEvent(new Event('visibilitychange'));
}, visible);
const openBorne = async (p) => {
  await p.goto(`${BASE}/borne`);
  await p.waitForSelector('[data-testid=kb-week], [data-testid=kb-suspended], [data-testid=kb-pairing]', { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(500);
};

// ═══════════════════════════════════════════════════════════════════════════
// A) MANIFESTE PROPRE À /borne
// ═══════════════════════════════════════════════════════════════════════════
{
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  const links = {};
  for (const route of ['/borne', '/', '/landing', '/admin', '/poseur', '/pointer', '/connexion']) {
    const r = await ctx.request.get(`${BASE}${route}`);
    const html = await r.text();
    links[route] = [...html.matchAll(/<link rel="manifest" href="([^"]+)"/g)].map((m) => m[1]);
  }
  check(JSON.stringify(links['/borne']) === '["/borne.webmanifest"]', `A) /borne lie UNIQUEMENT son manifeste (${links['/borne']})`);
  const others = Object.entries(links).filter(([k]) => k !== '/borne');
  check(others.every(([, l]) => JSON.stringify(l) === '["/manifest.json"]'), `A) les autres pages gardent /manifest.json (${others.map(([k, l]) => `${k}=${l}`).join(', ')})`);
  const bm = await (await ctx.request.get(`${BASE}/borne.webmanifest`)).json();
  check(bm.start_url === '/borne' && bm.scope === '/borne' && bm.id === '/borne', `A) manifeste borne : start_url ${bm.start_url}, scope ${bm.scope}, id ${bm.id}`);
  check(bm.name === 'BEMEXO Borne' && bm.display === 'fullscreen' && JSON.stringify(bm.display_override) === '["fullscreen","standalone"]' && bm.orientation === 'any',
    `A) « ${bm.name} », display ${bm.display} (repli ${bm.display_override}), orientation ${bm.orientation}`);
  const pngs = [];
  for (const ic of bm.icons.filter((i) => i.type === 'image/png')) {
    const r = await ctx.request.get(`${BASE}${ic.src}`);
    const buf = await r.body();
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    pngs.push({ sizes: ic.sizes, ok: r.ok() && buf.subarray(1, 4).toString() === 'PNG' && `${w}x${h}` === ic.sizes, purpose: ic.purpose || 'any' });
  }
  check(pngs.some((x) => x.sizes === '192x192' && x.ok) && pngs.some((x) => x.sizes === '512x512' && x.ok && x.purpose === 'any') && pngs.every((x) => x.ok),
    `A) icônes PNG réelles et aux bonnes tailles (${pngs.map((x) => `${x.sizes}/${x.purpose}:${x.ok ? 'ok' : 'KO'}`).join(', ')})`);
  const mm = await (await ctx.request.get(`${BASE}/manifest.json`)).json();
  check(mm.start_url === '/' && mm.display === 'standalone' && mm.icons.some((i) => i.src === '/icon-192.png') && mm.icons.some((i) => i.src === '/icon-512.png'),
    `A) manifeste du site : start_url « ${mm.start_url} » inchangé, icônes PNG ajoutées`);
  // Sur la page /borne elle-même, le navigateur voit bien le manifeste borne et le titre iPad.
  await p.goto(`${BASE}/borne`);
  const head = await p.evaluate(() => ({ m: [...document.querySelectorAll('link[rel=manifest]')].map((l) => l.getAttribute('href')), t: document.querySelector('meta[name=apple-mobile-web-app-title]')?.content }));
  check(JSON.stringify(head.m) === '["/borne.webmanifest"]' && head.t === 'BEMEXO Borne', `A) dans la page /borne : ${head.m}, titre d’icône iPad « ${head.t} »`);
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// B) UNE TABLETTE RELIÉE QUI ARRIVE SUR "/" OU /landing
// ═══════════════════════════════════════════════════════════════════════════
{
  const { ctx, p } = await tablet();
  await p.goto(`${BASE}/`);
  await p.waitForURL(/\/borne$/, { timeout: 10000 }).catch(() => {});
  check(new URL(p.url()).pathname === '/borne', `B) tablette reliée, ouverte sur « / » (ancienne icône) → ${new URL(p.url()).pathname}`);
  await p.waitForSelector('[data-testid=kb-week]', { timeout: 8000 }).catch(() => {});
  check(await p.locator('[data-testid=kb-week]').isVisible() && (await stored(p)) !== null, 'B) … et la borne affiche son planning, appairage intact');
  await ctx.close();
}
{
  const { ctx, p } = await tablet({ cache: null });
  await p.goto(`${BASE}/`);
  await p.waitForURL(/\/landing$/, { timeout: 10000 }).catch(() => {});
  check(new URL(p.url()).pathname === '/landing', `B) vrai visiteur (aucune borne reliée) sur « / » → ${new URL(p.url()).pathname} (inchangé)`);
  await ctx.close();
}
{
  const { ctx, p } = await tablet();
  await p.goto(`${BASE}/landing`);
  await p.waitForTimeout(1500);
  check(new URL(p.url()).pathname === '/landing', `B) /landing dans un onglet, même avec une borne reliée : on reste sur la vitrine (${new URL(p.url()).pathname})`);
  await ctx.close();
}
{
  const { ctx, p } = await tablet({ standalone: true });
  await p.goto(`${BASE}/landing`);
  await p.waitForURL(/\/borne$/, { timeout: 10000 }).catch(() => {});
  check(new URL(p.url()).pathname === '/borne', `B) /landing ouverte comme appli installée sur la tablette reliée → ${new URL(p.url()).pathname}`);
  await ctx.close();
}
{
  const { ctx, p } = await tablet({ cache: null, standalone: true });
  await p.goto(`${BASE}/landing`);
  await p.waitForTimeout(1500);
  check(new URL(p.url()).pathname === '/landing', 'B) appli installée sans borne reliée : la vitrine reste affichée');
  await ctx.close();
}
{
  // Une démo (?demo=1) laissée en mémoire ne compte pas comme une borne reliée.
  const { ctx, p } = await tablet({ cache: { ...CACHE, demo: true } });
  await p.goto(`${BASE}/`);
  await p.waitForURL(/\/landing$/, { timeout: 10000 }).catch(() => {});
  check(new URL(p.url()).pathname === '/landing', 'B) cache de démo : pas de renvoi vers /borne');
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// C) VERROU D'ÉCRAN
// ═══════════════════════════════════════════════════════════════════════════
{
  const { ctx, p } = await tablet();
  await openBorne(p);
  let s = await wl(p);
  check(s.requests === 1 && s.active === 1, `C) verrou pris à l’ouverture (${s.requests} demande, ${s.active} tenu)`);
  check(await p.locator('[data-testid=kb-wake-hint]').count() === 0, 'C) verrou tenu : aucun rappel affiché');
  await p.mouse.click(640, 500);
  await p.waitForTimeout(200);
  s = await wl(p);
  check(s.requests === 2 && s.active === 1, `C) toucher (souris) : verrou redemandé, l’ancien libéré — jamais deux (${s.requests} demandes, ${s.active} tenu)`);
  await p.click('[data-testid=kb-pointer]');
  await p.waitForTimeout(200);
  s = await wl(p);
  check(s.requests === 3 && s.active === 1 && await p.locator('[data-testid=kb-qr-overlay]').isVisible(), `C) toucher « QR » : redemandé aussi, et le QR s’ouvre (${s.requests}, ${s.active})`);
  await p.mouse.click(300, 400); // ferme le QR
  await p.waitForTimeout(200);
  // Le système relâche le verrou (batterie faible…) : repris tout seul, page visible.
  const before = (await wl(p)).requests;
  await p.evaluate(() => window.__wl.systemRelease());
  await p.waitForTimeout(200);
  s = await wl(p);
  check(s.requests === before + 1 && s.active === 1, `C) relâché par le système, page visible → repris tout seul (${s.requests - before} demande, ${s.active} tenu)`);
  // Page cachée : rien ; retour sur la page → repris.
  await setVisible(p, false);
  await p.evaluate(() => window.__wl.systemRelease());
  await p.waitForTimeout(200);
  const hidden = await wl(p);
  check(hidden.requests === s.requests && hidden.active === 0, `C) page cachée : pas de demande inutile (${hidden.requests - s.requests})`);
  await setVisible(p, true);
  await p.waitForTimeout(200);
  s = await wl(p);
  check(s.requests === hidden.requests + 1 && s.active === 1, 'C) retour sur la page : verrou repris');
  // Vérification toutes les 60 s : rien de plus si le verrou est tenu.
  await p.clock.fastForward(61_000);
  await p.waitForTimeout(200);
  const kept = await wl(p);
  check(kept.requests === s.requests && kept.active === 1, `C) vérification 60 s, verrou tenu : rien de plus (${kept.requests - s.requests})`);
  // Refusé : le rappel apparaît, sans le mot « borne » ; la vérification 60 s le reprend dès que possible.
  await p.evaluate(() => { window.__wl.mode = 'deny'; window.__wl.systemRelease(); });
  await p.waitForTimeout(300);
  const hint = p.locator('[data-testid=kb-wake-hint]');
  const hintText = await hint.innerText().catch(() => '');
  check(await hint.isVisible() && /Jamais/.test(hintText) && !/borne/i.test(hintText), `C) refusé → petit rappel « ${hintText} »`);
  const box = await hint.boundingBox();
  check(!!box && box.height <= 32 && box.width < 640 && box.y > 800 - 50 && box.x > 1280 / 2, `C) rappel discret : petit, en bas à droite (${box && `${Math.round(box.width)}×${Math.round(box.height)} à ${Math.round(box.x)},${Math.round(box.y)}`})`);
  await p.screenshot({ path: `${SH}/apres-borne-rappel-veille-1280x800.png` });
  await p.evaluate(() => { window.__wl.mode = 'grant'; });
  await p.clock.fastForward(61_000);
  await p.waitForTimeout(300);
  s = await wl(p);
  check(s.active === 1 && await hint.count() === 0, 'C) vérification 60 s : verrou repris, le rappel disparaît');
  // Le QR passe au-dessus du rappel.
  await p.evaluate(() => { window.__wl.mode = 'deny'; window.__wl.systemRelease(); });
  await p.waitForTimeout(200);
  await p.click('[data-testid=kb-pointer]');
  await p.waitForTimeout(200);
  const onTop = await p.evaluate(() => { const r = document.querySelector('[data-testid=kb-wake-hint]')?.getBoundingClientRect(); if (!r) return true; const e = document.elementFromPoint(r.left + 5, r.top + 5); return !!e?.closest('[data-testid=kb-qr-overlay]'); });
  check(onTop, 'C) le QR recouvre le rappel');
  await ctx.close();
}
{
  // Écran tactile : UNE demande par toucher, au doigt relâché (c'est là que l'iPad accorde le geste).
  const { ctx, p } = await tablet({ width: 1024, height: 768, isMobile: true });
  await openBorne(p);
  const s0 = await wl(p);
  await p.touchscreen.tap(500, 500);
  await p.waitForTimeout(200);
  const s1 = await wl(p);
  check(s1.requests === s0.requests + 1 && s1.active === 1, `C) toucher au doigt : une seule demande (${s1.requests - s0.requests}), un seul verrou`);
  await ctx.close();
}
{
  // Navigateur sans verrou d'écran : rappel discret, masqué d'un toucher.
  const { ctx, p } = await tablet({ wake: 'none' });
  await openBorne(p);
  const hint = p.locator('[data-testid=kb-wake-hint]');
  check(await hint.isVisible(), 'C) verrou non pris en charge → rappel affiché');
  check(await p.locator('[data-testid=kb-week]').isVisible(), 'C) … et le planning reste affiché derrière');
  await hint.click();
  await p.waitForTimeout(200);
  check(await hint.count() === 0, 'C) un toucher sur le rappel le masque');
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// D) PLEIN ÉCRAN AU PREMIER TOUCHER
// ═══════════════════════════════════════════════════════════════════════════
{
  const { ctx, p } = await tablet();
  await openBorne(p);
  const full = () => p.evaluate(() => !!document.fullscreenElement);
  check(!(await full()), 'D) à l’ouverture : pas de plein écran (il faut un geste)');
  await p.mouse.click(640, 500);
  await p.waitForTimeout(400);
  check(await full(), 'D) premier toucher → plein écran');
  check(await p.locator('[data-testid=kb-fullscreen]').getAttribute('aria-label') === 'Quitter le plein écran', 'D) l’icône suit (« Quitter le plein écran »)');
  await p.click('[data-testid=kb-fullscreen]');
  await p.waitForTimeout(400);
  check(!(await full()), 'D) l’icône fait quitter le plein écran');
  await p.mouse.click(640, 500);
  await p.waitForTimeout(400);
  check(!(await full()), 'D) une seule fois : un toucher suivant ne le remet pas');
  await p.click('[data-testid=kb-fullscreen]');
  await p.waitForTimeout(400);
  check(await full(), 'D) l’icône le remet quand on veut');
  await ctx.close();
}
{
  // Premier toucher SUR l'icône : elle met en plein écran (pas d'aller-retour).
  const { ctx, p } = await tablet();
  await openBorne(p);
  await p.click('[data-testid=kb-fullscreen]');
  await p.waitForTimeout(400);
  check(await p.evaluate(() => !!document.fullscreenElement), 'D) premier toucher sur l’icône : plein écran (pas d’entrée-sortie)');
  await ctx.close();
}
{
  // Pas de plein écran (iPhone) : aucune erreur, aucune icône.
  const { ctx, p } = await tablet({ width: 390, height: 844, isMobile: true });
  await ctx.addInitScript(() => {
    for (const k of ['requestFullscreen', 'webkitRequestFullscreen']) { try { Object.defineProperty(Element.prototype, k, { configurable: true, value: undefined }); } catch { /* */ } }
  });
  const n = errors.length;
  await openBorne(p);
  await p.touchscreen.tap(200, 500);
  await p.waitForTimeout(300);
  check(errors.length === n && await p.locator('[data-testid=kb-fullscreen]').count() === 0 && await p.locator('[data-testid=kb-week]').isVisible(), 'D) sans plein écran (iPhone) : aucune erreur, rien de visible');
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// E) 403 = « BORNE SUSPENDUE » ; 401 / 410 = APPAIRAGE EFFACÉ
// ═══════════════════════════════════════════════════════════════════════════
{
  const { ctx, p, calls, api } = await tablet({ api: { sync: 403, board: 403 } });
  await openBorne(p);
  await p.waitForSelector('[data-testid=kb-suspended]', { timeout: 5000 }).catch(() => {});
  const txt = await p.locator('[data-testid=kb-suspended]').innerText().catch(() => '');
  check(/Borne suspendue/.test(txt) && /Le bureau l.a mise en pause/.test(txt), `E) 403 → « Borne suspendue — le bureau l’a mise en pause » (${txt.replace(/\n+/g, ' / ')})`);
  check(/Vérifié à 09:30/.test(txt) && /nouvel essai chaque minute/.test(txt), 'E) heure de la dernière vérification affichée');
  check((await stored(p)) !== null && JSON.parse(await stored(p)).token === 'jeton', 'E) l’appairage est GARDÉ (bx_kiosk_v1 intact)');
  check(await p.locator('[data-testid=kb-pairing]').count() === 0 && await p.locator('[data-testid=kb-pointer]').count() === 0, 'E) ni écran « Relier », ni QR (il serait refusé)');
  check(await p.locator('[data-testid=kb-fullscreen]').isVisible(), 'E) l’icône plein écran reste là');
  await p.screenshot({ path: `${SH}/apres-borne-suspendue-1280x800.png` });
  const s0 = calls('sync'), b0 = calls('board');
  await p.clock.fastForward(61_000);
  await p.waitForTimeout(300);
  check(calls('sync') === s0 + 1, `E) nouvel essai au bout d’une minute (${calls('sync') - s0} sync)`);
  await p.clock.fastForward(61_000);
  await p.waitForTimeout(300);
  check(calls('sync') === s0 + 2 && calls('board') === b0, `E) un essai par minute, et pas de relecture du planning pendant la pause (${calls('board') - b0} board)`);
  check((await stored(p)) !== null && await p.locator('[data-testid=kb-suspended]').isVisible(), 'E) toujours suspendue, toujours reliée');
  // L'entreprise réactive la borne : elle repart toute seule, planning relu tout de suite.
  api.sync = 200; api.board = 200;
  await p.clock.fastForward(61_000);
  await p.waitForSelector('[data-testid=kb-week]', { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(300);
  check(await p.locator('[data-testid=kb-suspended]').count() === 0 && await p.locator('[data-testid=kb-week]').isVisible() && calls('board') > b0, 'E) réactivée : la borne repart toute seule, planning relu aussitôt');
  check(await p.locator('[data-testid=kb-pointer]').isVisible(), 'E) … et le bouton « QR » revient');
  await ctx.close();
}
{
  // 403 seulement sur `board` (la relecture de 30 s) : même écran, rien d'effacé.
  const { ctx, p, api } = await tablet({ api: { sync: 200, board: 200 } });
  await openBorne(p);
  api.board = 403; api.sync = 403;
  await p.clock.fastForward(31_000);
  await p.waitForSelector('[data-testid=kb-suspended]', { timeout: 5000 }).catch(() => {});
  check(await p.locator('[data-testid=kb-suspended]').isVisible() && (await stored(p)) !== null, 'E) 403 sur la relecture du planning : suspendue, appairage gardé');
  await ctx.close();
}
for (const st of [401, 410]) {
  const { ctx, p } = await tablet({ api: { sync: st, board: st } });
  await openBorne(p);
  await p.waitForSelector('[data-testid=kb-pairing]', { timeout: 5000 }).catch(() => {});
  const txt = await p.locator('body').innerText();
  check(await p.locator('[data-testid=kb-pairing]').isVisible() && (await stored(p)) === null && /Tablette déconnectée par le bureau/.test(txt) && !/suspendue/i.test(txt),
    `E) ${st} (${st === 401 ? 'tablette inconnue' : 'déconnectée par le bureau'}) : appairage effacé, écran « Relier » (inchangé)`);
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// F) APPAIRAGE : STOCKAGE PERSISTANT
// ═══════════════════════════════════════════════════════════════════════════
for (const present of [true, false]) {
  const { ctx, p, calls } = await tablet({ cache: null, persist: present, width: 1024, height: 768 });
  const n = errors.length;
  await p.goto(`${BASE}/borne?code=123456`);
  await p.waitForSelector('[data-testid=kb-pairing]', { timeout: 10000 }).catch(() => {});
  await p.click('.kp-btn');
  await p.waitForSelector('[data-testid=kb-week]', { timeout: 8000 }).catch(() => {});
  const persisted = await p.evaluate(() => window.__persist);
  if (present) check(persisted === 1 && calls('pair') === 1 && (await stored(p)) !== null, `F) appairage : stockage persistant demandé (${persisted} appel)`);
  else check(errors.length === n && await p.locator('[data-testid=kb-week]').isVisible(), 'F) navigateur sans navigator.storage : appairage normal, aucune erreur');
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// G) FENÊTRE « BORNE » DU BUREAU : AIDE D'INSTALLATION
// ═══════════════════════════════════════════════════════════════════════════
const CO = 'c0000000-0000-0000-0000-000000000001';
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', is_active: true };
const u = (id, first, last, role = 'worker') => ({ id, company_id: CO, first_name: first, last_name: last, role, email: `${id}@x.fr`, is_active: true, created_at: '2026-01-01' });
const COMPANY = { id: CO, name: 'Martin Menuiserie', ai_enabled: true, kiosk_enabled: true, position_tracking_enabled: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35 };
const nowS = Math.floor(Date.now() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const SESSION = { access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-admin', role: 'authenticated', exp: nowS + 36000, aal: 'aal1' })}.sig`, refresh_token: 'r', expires_at: nowS + 36000, expires_in: 36000, token_type: 'bearer', user: { id: 'u-admin', email: 'paul@exemple.fr', aud: 'authenticated', role: 'authenticated' } };
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const filterRows = (rows, params) => {
  for (const [k, v] of params) {
    if (SKIP.has(k)) continue;
    const dot = v.indexOf('.'); const op = v.slice(0, dot); const val = v.slice(dot + 1);
    rows = rows.filter((x) => !(k in x) || (op === 'eq' ? String(x[k]) === val : op === 'is' ? (val === 'null' ? x[k] == null : String(x[k]) === val) : true));
  }
  return rows;
};
async function adminPage({ width = 1440, height = 900, isMobile = false } = {}) {
  const ctx = await b.newContext({ viewport: { width, height }, locale: 'fr-FR', timezoneId: 'Europe/Paris', isMobile, hasTouch: isMobile });
  const D = {
    users: [u('u-admin', 'Paul', 'Martin', 'admin'), u('u-kevin', 'Kevin', 'Roussel')], companies: [{ ...COMPANY }], worksites: [W1],
    planning: [{ id: 'pl1', company_id: CO, user_id: 'u-kevin', worksite_id: 'w1', work_date: today, absence_type: null, estimated_start: '08:00:00', estimated_end: '17:00:00', notes: null, created_at: `${today}T06:00:00Z`, worksite: W1 }],
    time_entries: [], active_sessions: [], month_closures: [], leave_requests: [], invitations: [], documents: [], certifications: [], push_subscriptions: [],
    kiosks: [{ id: 'k-1', company_id: CO, revoked_at: null, created_at: new Date(Date.now() - 86400e3).toISOString(), last_seen_at: new Date(Date.now() - 120e3).toISOString() }], kiosk_settings: [],
  };
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(SESSION)]);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: SESSION.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/kiosk')) {
      const body = JSON.parse(r.request().postData() || '{}');
      if (body.action === 'create_pairing') return r.fulfill({ json: { code: '123456', expires_at: new Date(Date.now() + 600e3).toISOString(), pairing_id: 'pair-1' } });
      if (body.action === 'cancel_pairing') return r.fulfill({ json: { success: true, cancelled: 1 } });
      return r.fulfill({ status: 400, json: { error: 'Action inconnue' } });
    }
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
    const t = url.pathname.replace('/rest/v1/', '');
    if (r.request().method() !== 'GET' && r.request().method() !== 'HEAD') return r.fulfill({ status: 201, json: {} });
    const rows = filterRows(D[t] || [], url.searchParams);
    if ((r.request().headers()['accept'] || '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { errors.push(e.message); console.log('   [erreur page]', e.message); });
  await p.goto(`${BASE}/admin`);
  await p.waitForSelector('[data-testid=stat-waiting], .bt-pl-m-ibtn', { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1200);
  return { ctx, p };
}
for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true]]) {
  const { ctx, p } = await adminPage({ width: w, height: h, isMobile: mobile });
  if (mobile) { await p.locator('.bt-pl-m-ibtn[aria-label=Menu]').first().click(); await p.waitForTimeout(500); await p.click('[data-testid=mm-kiosk]'); }
  else await p.click('[data-testid=bar-kiosk]');
  await p.waitForSelector('[data-testid=ka-install]', { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(500);
  const help = p.locator('[data-testid=ka-install]');
  const isOpen = () => help.evaluate((d) => d.open).catch(() => null);
  const dlg = () => p.locator('[role=dialog]').innerText().catch(() => '');
  check(await help.count() === 1 && (await isOpen()) === false, `G) ${w}px : aide « Installer la tablette » présente, repliée par défaut`);
  check(/Installer la tablette/.test(await dlg()) && !/verrouillage automatique/i.test(await dlg()), `G) ${w}px : repliée = une seule ligne, le détail est caché`);
  await p.click('[data-testid=ka-install] summary');
  await p.waitForTimeout(300);
  const t = await dlg();
  const host = new URL(BASE).host;
  check((await isOpen()) === true && /Ajouter à l’écran d’accueil/.test(t) && /depuis l’icône installée/.test(t) && /verrouillage automatique sur « Jamais »/.test(t) && /reliez-la depuis l’icône, pas depuis Safari/.test(t) && t.includes(`${host}/borne`),
    `G) ${w}px : ouverte → écran d’accueil, icône installée, verrouillage « Jamais », iPad depuis l’icône, adresse ${host}/borne`);
  const hs = await p.evaluate(() => { const d = document.querySelector('[role=dialog]'); return document.documentElement.scrollWidth > window.innerWidth || d.scrollWidth > d.clientWidth + 1; });
  check(!hs, `G) ${w}px : pas de défilement horizontal`);
  await help.scrollIntoViewIfNeeded();
  await p.mouse.move(5, 5);
  await p.screenshot({ path: `${SH}/apres-bureau-aide-installation-${w}x${h}.png` });
  await p.click('[data-testid=ka-install] summary');
  await p.waitForTimeout(300);
  check((await isOpen()) === false, `G) ${w}px : un toucher la referme`);
  if (w === 1440) await p.screenshot({ path: `${SH}/apres-bureau-borne-1440x900.png` });
  await ctx.close();
}

// Capture : la borne normale (verrou tenu, aucun rappel).
{
  const { ctx, p } = await tablet();
  await openBorne(p);
  await p.screenshot({ path: `${SH}/apres-borne-1280x800.png` });
  await ctx.close();
}

check(errors.length === 0, `aucune erreur dans les pages (${errors.length})`);
console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
