// Lot 9 — la borne : planning de la semaine en lecture seule, QR en plein écran, plein écran.
// Lancer : node scripts/tests/borne-lot9.mjs out docs/captures-lot9 (après npm run build).
// La fonction `kiosk` est simulée (action `board` + `sync`) ; l'heure est figée au
// jeudi 1er octobre 2026, 09:30 à Paris, avec l'horloge de Playwright (page.clock).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const { chromium } = await import('playwright-core')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.mjs'));
const [,, OUT = 'out', SH = 'docs/captures-lot9', PORT_ARG = '0'] = process.argv; fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT_ARG), r));
const PORT = srv.address().port; // port libre par défaut : d'autres tests peuvent tourner en parallèle
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const NOW = new Date('2026-10-01T07:30:00Z'); // jeudi 09:30 à Paris
const DAYS = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
// Ce que rendrait la fonction (déjà réduit à la liste blanche par buildBoard).
const W = [['Inès', 'Garnier', 4], ['Julie', 'Bernard', 1], ['Karim', 'Haddad', 3], ['Lucas', 'Petit', 0], ['Sofia', 'Moreau', 5], ['Thomas', 'Lefèvre', 2]];
const slots = [];
const S = (w, i, title, sub, hours, color, live = null) => slots.push({ w: `w${w}`, date: DAYS[i], title, sub, hours, color, live });
for (let i = 0; i < 5; i++) {
  S(0, i, i < 3 ? 'Salle de bains Roche' : 'École Jean Moulin', i < 3 ? 'Caluire-et-Cuire' : 'Bron', '08:00–17:00', i < 3 ? 6 : 2);
  if (i < 2) { S(1, i, 'Cuisine Martin', 'Villeurbanne', '08:00–12:00', 1); S(1, i, 'École Jean Moulin', 'Bron', '13:30–17:00', 2); }
  else S(1, i, 'Cuisine Martin', 'Villeurbanne', '08:00–17:00', 1);
  S(2, i, 'Villa Dupont', 'Lyon 6e', '07:30–16:30', 4, i === 3 ? '07:42' : null);
  S(3, i, 'École Jean Moulin', 'Bron', '07:30–16:00', 2);
  if (i === 4) S(3, i, 'Dépôt', 'Vénissieux', '16:30', 0);
  if (i !== 2) S(4, i, 'Villa Dupont', 'Lyon 6e', '08:00–17:00', 4);
  if (i < 4) S(5, i, 'Cuisine Martin', 'Villeurbanne', '07:00–15:30', 1);
}
const BOARD = {
  week_start: DAYS[0], today: DAYS[3], days: DAYS,
  workers: W.map(([f, l, t], i) => ({ k: `w${i}`, first_name: f, last_name: l, tint: t })),
  slots, absences: [{ w: 'w4', date: DAYS[2] }],
  live_extra: [{ w: 'w5', date: DAYS[3], title: 'Dépôt', since: '06:58' }],
};
const SETTINGS = { show_planning: true, require_gps: false, active_from: null, active_until: null };
// Un cache d'AVANT le lot 9 : planning du jour, show_planning, pas de board.
const OLD_CACHE = { kioskId: 'k-test', token: 'jeton', seed: 'ZGVtby1ib3JuZS1iZW1leG8tbmUtcGFzLXV0aWxpc2Vy', companyName: 'Martin Menuiserie', kioskName: 'Entrée du dépôt', settings: SETTINGS, planning: [{ first_name: 'Karim', start: '07:30', end: '16:30' }], syncedAt: NOW.getTime() - 3600e3 };

let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };

/** Un contexte « tablette » : horloge figée, cache donné, fonction kiosk simulée. */
async function tablet({ width = 1280, height = 800, cache = OLD_CACHE, board = 'ok', settings = SETTINGS } = {}) {
  const ctx = await b.newContext({ viewport: { width, height }, locale: 'fr-FR', timezoneId: 'Europe/Paris', hasTouch: false });
  await ctx.clock.install({ time: NOW });
  if (cache) await ctx.addInitScript(([k, v]) => { if (!sessionStorage.getItem('init')) { localStorage.setItem(k, v); sessionStorage.setItem('init', '1'); } }, ['bx_kiosk_v1', JSON.stringify(cache)]);
  const calls = [];
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith('/functions/v1/kiosk')) {
      const body = JSON.parse(r.request().postData() || '{}');
      calls.push(body.action);
      if (body.action === 'sync') return r.fulfill({ json: { revoked: false, kiosk_name: 'Entrée du dépôt', company_name: 'Martin Menuiserie', settings, planning: [{ first_name: 'Karim', start: '07:30', end: '16:30' }] } });
      if (body.action === 'board') {
        if (board === 'ok') return r.fulfill({ json: BOARD });
        if (board === '400') return r.fulfill({ status: 400, json: { error: 'Action inconnue' } });
        if (board === '401') return r.fulfill({ status: 401, json: { error: 'Borne inconnue', revoked: true } });
      }
      return r.fulfill({ status: 400, json: { error: 'Action inconnue' } });
    }
    return r.fulfill({ json: {} });
  });
  const p = await ctx.newPage();
  return { ctx, p, calls };
}
const bodyText = (p) => p.evaluate(() => document.body.innerText);
const fits = (p) => p.evaluate(() => {
  const wk = document.querySelector('.kb-week'); const tb = document.querySelector('.kb-week table');
  const ths = [...document.querySelectorAll('.bt-pl-th')];
  const tooWide = ths.filter((th) => th.firstElementChild && th.firstElementChild.scrollWidth > th.clientWidth + 1).map((th) => th.innerText.replace(/\s+/g, ' '));
  return { page: document.documentElement.scrollWidth <= window.innerWidth, grid: !!wk && wk.scrollWidth <= wk.clientWidth, table: !!tb && tb.getBoundingClientRect().right <= wk.getBoundingClientRect().right + 0.5, tooWide };
});
const onTop = (p, sel) => p.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && (hit === el || el.contains(hit)); }, sel);

// ── 1) Planning de la semaine, 1280×800 ─────────────────────────────────────
{
  // `show_planning` à faux côté serveur : sans effet, la borne montre toujours la semaine.
  const { ctx, p, calls } = await tablet({ settings: { ...SETTINGS, show_planning: false } });
  await p.goto(`http://localhost:${PORT}/borne`);
  await p.waitForSelector('[data-testid=kb-week]', { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(800);
  check(calls.includes('board') && calls.includes('sync'), `1) la borne appelle « board » et « sync » : ${calls.join(', ')}`);
  const fs1 = p.locator('[data-testid=kb-fullscreen]');
  // Lot 11 : icône seule (le libellé est dans aria-label / title).
  check(await fs1.isVisible() && (await fs1.getAttribute('aria-label')) === 'Plein écran', '1) bouton « Plein écran » visible dans le coin');
  const workers = await p.locator('[data-testid=kb-worker]').allInnerTexts();
  check(['Inès Garnier', 'Julie Bernard', 'Karim Haddad', 'Lucas Petit', 'Sofia Moreau', 'Thomas Lefèvre'].every((n) => workers.includes(n)), `1) prénom + nom : ${workers.join(' / ')}`);
  const titles = await p.locator('[data-testid=bubble-title]').allInnerTexts();
  const subs = await p.locator('.kb-week .bt-pl-bub-sub').allInnerTexts();
  const hours = await p.locator('[data-testid=bubble-hours]').allInnerTexts();
  check(titles.includes('Villa Dupont') && titles.includes('Cuisine Martin') && titles.includes('École Jean Moulin'), '1) chantiers visibles');
  check(subs.includes('Lyon 6e') && subs.includes('Villeurbanne') && subs.includes('Bron'), '1) villes visibles');
  check(hours.includes('07:30–16:30') && hours.includes('16:30'), '1) horaires prévus visibles');
  const ths = await p.locator('.bt-pl-th').allInnerTexts();
  check(ths.length === 7 && /Lundi/.test(ths[0]) && /Dimanche/.test(ths[6]) && /Jeudi\s*1/.test(ths[3]), `1) lundi → dimanche : ${ths.map((t) => t.replace(/\s+/g, ' ')).join(' | ')}`);
  check(/Jeudi/.test(await p.locator('.bt-pl-th.today').innerText()), '1) aujourd’hui surligné (jeudi)');
  check((await p.locator('.bt-pl-corner-wk').innerText()).trim() === 'S-40', '1) coin « S-40 »');
  const txt = await bodyText(p);
  check(!txt.includes('€') && !/h point[ée]es/i.test(txt) && !/envoy/i.test(txt), '1) ni €, ni « h pointées », ni statut d’envoi');
  check(!/maladie|congé/i.test(txt) && (await p.locator('[data-testid=kb-absent]').count()) === 1, '1) absence neutre « Absent », sans motif');
  check(!/Aujourd.hui/.test(txt) && !/Déconnecter/.test(txt) && (await p.locator('.bt-pl-add').count()) === 0, '1) plus de liste « Aujourd’hui », ni « Déconnecter », ni « + »');
  check((await p.locator('[data-testid=bubble-live]').allInnerTexts()).some((t) => /en cours depuis 07:42/.test(t)), '1) bulle verte « en cours depuis 07:42 »');
  check((await p.locator('.bt-pl-bub-on').count()) === 1, '1) une seule bulle verte (celle de Karim)');
  const lx = await p.locator('[data-testid=live-extra]').allInnerTexts();
  check(lx.length === 1 && /Dépôt/.test(lx[0]) && /06:58/.test(lx[0]), `1) chantier pointé hors planning : ${lx.join(' / ')}`);
  check((await p.locator('.bt-pl-cell-live').count()) === 2, '1) deux cases vertes (Karim, Thomas)');
  const f = await fits(p);
  check(f.page && f.grid && f.table && f.tooWide.length === 0, `1) 7 jours sans défilement horizontal (1280×800) ${JSON.stringify(f)}`);
  await p.screenshot({ path: `${SH}/borne-planning-1280x800.png` });
  // Beaucoup de salariés : la grille défile, l'en-tête des jours reste collé en haut.
  const sticky = await p.evaluate(() => {
    const wk = document.querySelector('.kb-week'); wk.scrollTop = wk.scrollHeight;
    const th = document.querySelector('.kb-week thead th.bt-pl-th');
    return { scrolled: wk.scrollTop > 0, top: Math.round(th.getBoundingClientRect().top - wk.getBoundingClientRect().top) };
  });
  await p.waitForTimeout(200);
  check(sticky.scrolled && Math.abs(sticky.top) <= 1, `1) défilement vertical, en-tête collé ${JSON.stringify(sticky)}`);
  check(await p.locator('[data-testid=live-extra]').isVisible(), '1) en bas de la grille : la ligne « Dépôt · en cours depuis 06:58 »');
  await p.screenshot({ path: `${SH}/borne-planning-defile-1280x800.png` });
  await p.evaluate(() => { document.querySelector('.kb-week').scrollTop = 0; });

  // ── 2) « QR » : plein écran, retour au toucher et après 30 s (lot 11 ; 60 s au lot 9) ─
  await p.click('[data-testid=kb-pointer]');
  await p.waitForTimeout(300);
  check(await p.locator('[data-testid=kb-qr-overlay]').isVisible(), '2) « QR » ouvre le QR');
  check((await p.locator('[data-testid=kb-qr-overlay] .kb-qr svg').count()) === 1, '2) QR calculé hors ligne affiché');
  check(await onTop(p, '[data-testid=kb-fullscreen]'), '2) bouton plein écran au-dessus du QR');
  await p.screenshot({ path: `${SH}/borne-qr-1280x800.png` });
  await p.mouse.click(300, 400);
  await p.waitForTimeout(200);
  check((await p.locator('[data-testid=kb-qr-overlay]').count()) === 0 && await p.locator('[data-testid=kb-week]').isVisible(), '2) un toucher ramène au planning');
  await p.click('[data-testid=kb-pointer]');
  await p.waitForTimeout(200);
  await p.clock.fastForward(25_000);
  check(await p.locator('[data-testid=kb-qr-overlay]').isVisible(), '2) toujours affiché après 25 s');
  await p.clock.fastForward(6_000);
  await p.waitForTimeout(300);
  check((await p.locator('[data-testid=kb-qr-overlay]').count()) === 0, '2) retour automatique au planning après 30 s');

  // ── 3) Plein écran : bascule et libellé (aria-label : icône seule au lot 11) ─
  await p.click('[data-testid=kb-fullscreen]');
  await p.waitForTimeout(400);
  const isFull = await p.evaluate(() => !!document.fullscreenElement);
  const label = await p.locator('[data-testid=kb-fullscreen]').getAttribute('aria-label');
  check(isFull && label === 'Quitter le plein écran' && (await p.locator('[data-testid=kb-fullscreen]').getAttribute('aria-pressed')) === 'true', `3) plein écran → « ${label} »`);
  await p.click('[data-testid=kb-fullscreen]');
  await p.waitForTimeout(400);
  check(!(await p.evaluate(() => !!document.fullscreenElement)) && (await p.locator('[data-testid=kb-fullscreen]').getAttribute('aria-label')) === 'Plein écran', '3) « Quitter le plein écran » → retour à « Plein écran »');

  // ── 4) Déconnecter : caché derrière un appui long de 5 s (lot 11 : sur le logo / l'entreprise) ─
  const kn = await p.locator('[data-testid=kb-brand]').boundingBox();
  await p.mouse.move(kn.x + 10, kn.y + kn.height / 2); await p.mouse.down();
  await p.clock.fastForward(2000); await p.mouse.up();
  await p.clock.fastForward(4000);
  check((await p.locator('[data-testid=kb-unpair-confirm]').count()) === 0, '4) appui court : rien');
  await p.mouse.down(); await p.clock.fastForward(5200); await p.waitForTimeout(150);
  check(await p.locator('[data-testid=kb-unpair-confirm]').isVisible(), '4) appui long de 5 s → confirmation « Déconnecter »');
  await p.mouse.up();
  await p.click('text=Annuler');
  check((await p.locator('[data-testid=kb-week]').count()) === 1, '4) « Annuler » garde la borne');
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('bx_kiosk_v1') || 'null'));
  check(!!stored?.board && stored.board.week_start === '2026-09-28' && !('planning' in stored), '4) semaine gardée en cache (hors ligne), ancien planning du jour retiré');

  // ── 5) 1024×768 ─────────────────────────────────────────────────────────────
  await p.setViewportSize({ width: 1024, height: 768 });
  await p.waitForTimeout(400);
  const f2 = await fits(p);
  check(f2.page && f2.grid && f2.table && f2.tooWide.length === 0, `5) 7 jours sans défilement horizontal (1024×768) ${JSON.stringify(f2)}`);
  check(await p.locator('[data-testid=kb-pointer]').isVisible() && await p.locator('[data-testid=kb-fullscreen]').isVisible(), '5) « QR » et « Plein écran » visibles');
  await p.screenshot({ path: `${SH}/borne-planning-1024x768.png` });
  await ctx.close();
}

// ── 6) Fonction pas encore redéployée (400 « Action inconnue ») ────────────────
{
  const { ctx, p } = await tablet({ board: '400' });
  await p.goto(`http://localhost:${PORT}/borne`);
  await p.waitForTimeout(1500);
  check((await p.locator('[data-testid=kb-unavailable]').innerText()).includes('Planning indisponible'), '6) sans cache : « Planning indisponible »');
  await p.click('[data-testid=kb-pointer]');
  await p.waitForTimeout(300);
  check((await p.locator('[data-testid=kb-qr-overlay] .kb-qr svg').count()) === 1, '6) « QR » marche quand même');
  check((await p.locator('.kp').count()) === 0, '6) la borne n’est pas oubliée pour une erreur 400');
  await ctx.close();
}
{
  // Cache d'il y a 5 minutes + erreur : le planning reste, sans « en cours ».
  const cache = { ...OLD_CACHE, planning: undefined, board: BOARD, boardAt: NOW.getTime() - 5 * 60e3 };
  const { ctx, p } = await tablet({ board: '400', cache });
  await p.goto(`http://localhost:${PORT}/borne`);
  await p.waitForTimeout(1500);
  check((await p.locator('[data-testid=kb-worker]').count()) === 6, '6) avec cache : le planning reste affiché');
  check((await p.locator('[data-testid=bubble-live]').count()) === 0 && (await p.locator('[data-testid=live-extra]').count()) === 0 && (await p.locator('.bt-pl-cell-live').count()) === 0, '6) cache de plus de 2 min : aucune pastille « en cours »');
  check(/Planning du/.test(await bodyText(p)), '6) l’heure du planning affiché est indiquée');
  await ctx.close();
}
{
  // Cache d'une AUTRE semaine (frais) : pas de « en cours ».
  const LAST = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'];
  const cache = { ...OLD_CACHE, board: { ...BOARD, week_start: LAST[0], today: LAST[3], days: LAST }, boardAt: NOW.getTime() - 10e3 };
  const { ctx, p } = await tablet({ board: '400', cache });
  await p.goto(`http://localhost:${PORT}/borne`);
  await p.waitForTimeout(1200);
  check((await p.locator('[data-testid=bubble-live]').count()) === 0, '6) semaine en cache ≠ semaine courante : aucune pastille « en cours »');
  await ctx.close();
}

// ── 7) Borne retirée (401) : oubliée comme avec « sync » ───────────────────────
{
  const { ctx, p } = await tablet({ board: '401' });
  await p.goto(`http://localhost:${PORT}/borne`);
  await p.waitForTimeout(1500);
  check((await p.locator('.kp').count()) === 1 && /Tablette déconnectée par le bureau/.test(await bodyText(p)), '7) 401 → retour à l’appairage, message clair (lot 11 : « Tablette déconnectée par le bureau (ou remplacée par une autre) »)');
  check(await p.locator('[data-testid=kb-fullscreen]').isVisible(), '7) plein écran disponible aussi pendant l’installation');
  await ctx.close();
}

// ── 8) Veille : un toucher ouvre directement le QR ─────────────────────────────
{
  const sleepy = { ...SETTINGS, active_from: '22:00', active_until: '23:00' };
  const { ctx, p } = await tablet({ cache: { ...OLD_CACHE, settings: sleepy }, settings: sleepy });
  await p.goto(`http://localhost:${PORT}/borne`);
  await p.waitForTimeout(1200);
  check((await p.locator('[data-testid=kb-sleep]').innerText()).includes('Touchez l’écran pour pointer') || (await p.locator('[data-testid=kb-sleep]').innerText()).includes("Touchez l'écran pour pointer"), '8) veille : « Touchez l’écran pour pointer »');
  check(await onTop(p, '[data-testid=kb-fullscreen]'), '8) bouton plein écran au-dessus de la veille');
  await p.mouse.click(400, 300);
  await p.waitForTimeout(300);
  check(await p.locator('[data-testid=kb-qr-overlay]').isVisible(), '8) toucher la veille → le QR, directement');
  await ctx.close();
}

// ── 9) Démo (?demo=1, preview seulement — localhost en est une) ────────────────
{
  const { ctx, p } = await tablet({ cache: null });
  await p.goto(`http://localhost:${PORT}/borne?demo=1`);
  await p.waitForTimeout(1200);
  const n = await p.locator('[data-testid=kb-worker]').count();
  check(n >= 5 && n <= 6, `9) démo : ${n} salariés`);
  check((await p.locator('[data-testid=bubble-live]').allInnerTexts()).some((t) => /07:42/.test(t)), '9) démo : bulle « en cours depuis 07:42 »');
  check((await p.locator('[data-testid=live-extra]').count()) === 1 && (await p.locator('[data-testid=kb-absent]').count()) === 1, '9) démo : un chantier hors planning, une absence');
  check(new Set(await p.locator('.kb-week .bt-pl-bub-sub').allInnerTexts()).size >= 4, '9) démo : plusieurs chantiers avec leur ville');
  await p.screenshot({ path: `${SH}/borne-demo-1280x800.png` });
  await ctx.close();
}

// ── 10) Téléphone : départ moins d'une minute après l'arrivée → écran neutre ──
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const now = Math.floor(Date.now() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-karim', role: 'authenticated', exp: now + 36000, aal: 'aal1' })}.sig`;
  const session = { access_token: jwt, refresh_token: 'r', expires_at: now + 36000, expires_in: 36000, token_type: 'bearer', user: { id: 'u-karim', email: 'karim@exemple.fr', aud: 'authenticated', role: 'authenticated' } };
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (u.pathname.startsWith('/functions/v1/kiosk')) {
      const body = JSON.parse(r.request().postData() || '{}');
      if (body.action === 'ticket') return r.fulfill({ json: { ticket: 'tk', kiosk_name: 'Entrée du dépôt', company_name: 'Martin Menuiserie', needs_gps: false } });
      if (body.action === 'punch') return r.fulfill({ json: { kind: 'departure', cancelled: true, range: null, time: '09:31', first_name: 'Karim', kiosk_name: 'Entrée du dépôt', worksite_name: null } });
    }
    return r.fulfill({ json: {} });
  });
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${PORT}/pointer?k=k-test&c=12345678`);
  await p.waitForSelector('[data-testid=punch-cancelled]', { timeout: 8000 }).catch(() => {});
  const t = await bodyText(p);
  check(/Pointage annulé \(moins d.une minute\)/.test(t), '10) départ < 1 min : « Pointage annulé (moins d’une minute) »');
  check(!/non enregistré|⚠️|quart d/i.test(t) && (await p.locator('main.kx.bad').count()) === 0, '10) écran neutre, sans style d’erreur');
  await p.screenshot({ path: `${SH}/borne-pointage-annule-390x844.png` });
  await ctx.close();
}

console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
