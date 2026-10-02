// Lot 10 — la borne : aucun redessin visible pendant les rafraîchissements
// automatiques, en-tête discret (logo BEMEXO + entreprise), grille en lecture seule.
// Lancer : node scripts/tests/borne-lot10.mjs out docs/captures-lot10 (après npm run build).
//
// Même simulation que scripts/tests/borne-lot9.mjs (fonction `kiosk` simulée,
// horloge figée au jeudi 1er octobre 2026, 09:30 à Paris, page.clock).
// Un MutationObserver est posé APRÈS le premier affichage ; on déclenche les
// relectures (30 s, retour sur l'onglet, sync 5 min) avec des données
// IDENTIQUES et on compte ce qui bouge dans le DOM. Seules exceptions admises :
// le texte de l'horloge (.kb-clock) et le QR (.kb-qr, .kb-bar, change chaque minute).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const { chromium } = await import('playwright-core')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.mjs'));
const [,, OUT = 'out', SH = 'docs/captures-lot10', PORT_ARG = '0'] = process.argv; fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT_ARG), r));
const PORT = srv.address().port;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const NOW = new Date('2026-10-01T07:30:00Z'); // jeudi 09:30 à Paris
const DAYS = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
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
// Le même planning, avec UN changement réel : Lucas (w3) vient de scanner sur son chantier du jour.
const BOARD_LUCAS = { ...BOARD, slots: slots.map((s) => (s.w === 'w3' && s.date === DAYS[3] ? { ...s, live: '09:31' } : s)) };
const SETTINGS = { show_planning: true, require_gps: false, active_from: null, active_until: null };
const OLD_CACHE = { kioskId: 'k-test', token: 'jeton', seed: 'ZGVtby1ib3JuZS1iZW1leG8tbmUtcGFzLXV0aWxpc2Vy', companyName: 'Martin Menuiserie', kioskName: 'Entrée du dépôt', settings: SETTINGS, planning: [{ first_name: 'Karim', start: '07:30', end: '16:30' }], syncedAt: NOW.getTime() - 3600e3 };

let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };

/** Un contexte « tablette » : horloge figée, cache donné, fonction kiosk simulée (réponse modifiable). */
async function tablet({ width = 1280, height = 800, cache = OLD_CACHE, settings = SETTINGS, isMobile = false } = {}) {
  const ctx = await b.newContext({ viewport: { width, height }, locale: 'fr-FR', timezoneId: 'Europe/Paris', hasTouch: isMobile, isMobile });
  await ctx.clock.install({ time: NOW });
  if (cache) await ctx.addInitScript(([k, v]) => { if (!sessionStorage.getItem('init')) { localStorage.setItem(k, v); sessionStorage.setItem('init', '1'); } }, ['bx_kiosk_v1', JSON.stringify(cache)]);
  const calls = [];
  const server = { board: BOARD };
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith('/functions/v1/kiosk')) {
      const body = JSON.parse(r.request().postData() || '{}');
      calls.push(body.action);
      if (body.action === 'sync') return r.fulfill({ json: { revoked: false, kiosk_name: 'Entrée du dépôt', company_name: 'Martin Menuiserie', settings, planning: [{ first_name: 'Karim', start: '07:30', end: '16:30' }] } });
      if (body.action === 'board') return r.fulfill({ json: server.board });
      return r.fulfill({ status: 400, json: { error: 'Action inconnue' } });
    }
    return r.fulfill({ json: {} });
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('   [erreur page]', e.message));
  return { ctx, p, calls, server };
}

// ── Mesure des mutations ──────────────────────────────────────────────────────
const ALLOWED = ['.kb-clock', '.kb-qr', '.kb-bar'];
async function observe(p) {
  await p.evaluate((allowed) => {
    const desc = (el) => {
      const parts = [];
      for (let e = el, i = 0; e && e !== document.body && i < 5; e = e.parentElement, i++) {
        parts.unshift(e.tagName.toLowerCase() + (e.classList.length ? `.${[...e.classList].join('.')}` : '') + (e.dataset?.testid ? `[${e.dataset.testid}]` : ''));
      }
      return parts.join(' > ');
    };
    window.__muts = [];
    window.__mo?.disconnect();
    window.__mo = new MutationObserver((ms) => {
      for (const m of ms) {
        const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        if (!el) continue;
        const td = el.closest('.kb-week td');
        const tr = td && td.parentElement;
        window.__muts.push({
          type: m.type, attr: m.attributeName || null, target: desc(el),
          allowed: allowed.some((s) => el.closest(s)),
          cell: td ? `${[...tr.parentElement.children].indexOf(tr)}:${td.cellIndex}` : null,
          added: m.addedNodes.length, removed: m.removedNodes.length,
        });
      }
    });
    window.__mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    // Repères d'identité : un élément remonté (re-keyé) perdrait sa marque.
    document.querySelectorAll('.kb-week, .kb-week tr, .kb-week td, .kb-week .bt-pl-bub, .kb-top, .kb-main').forEach((e) => { e.__lot10 = true; });
    window.__marked = document.querySelectorAll('.kb-week, .kb-week tr, .kb-week td, .kb-week .bt-pl-bub, .kb-top, .kb-main').length;
  }, ALLOWED);
}
const collect = (p) => p.evaluate(() => {
  const all = window.__muts.splice(0);
  const kept = [...document.querySelectorAll('.kb-week, .kb-week tr, .kb-week td, .kb-week .bt-pl-bub, .kb-top, .kb-main')].filter((e) => e.__lot10).length;
  return { all, other: all.filter((m) => !m.allowed), kept, marked: window.__marked };
});
const summary = (ms) => {
  const by = new Map();
  for (const m of ms) { const k = `${m.type}${m.attr ? `[${m.attr}]` : ''} ${m.target}`; by.set(k, (by.get(k) || 0) + 1); }
  return [...by].map(([k, n]) => `${n}× ${k}`).slice(0, 12).join('\n      ');
};
const setVisible = (p, visible) => p.evaluate((v) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (v ? 'visible' : 'hidden') });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => !v });
  document.dispatchEvent(new Event('visibilitychange'));
  if (v) window.dispatchEvent(new Event('focus'));
}, visible);
const report = {};

// ── 1) Rafraîchissements avec des données IDENTIQUES : zéro redessin ─────────
{
  const { ctx, p, calls, server } = await tablet();
  await p.goto(`http://localhost:${PORT}/borne`);
  await p.waitForSelector('[data-testid=kb-week]', { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(1000);
  check((await p.locator('[data-testid=kb-worker]').count()) === 6, '0) planning affiché (6 salariés)');

  // A · relecture toutes les 30 s
  await observe(p);
  let n0 = calls.filter((c) => c === 'board').length;
  await p.clock.fastForward(30_000);
  await p.waitForTimeout(1200);
  let r = await collect(p);
  const polled = calls.filter((c) => c === 'board').length > n0;
  report.poll30 = { total: r.all.length, other: r.other.length };
  console.log(`   A · 30 s : board relu=${polled}, mutations=${r.all.length} (hors exceptions : ${r.other.length})${r.other.length ? `\n      ${summary(r.other)}` : ''}`);
  check(polled, 'A) le planning est bien relu au bout de 30 s');
  check(r.other.length === 0, `A) relecture 30 s, données identiques : 0 mutation hors horloge/QR (${r.other.length})`);
  check(r.kept === r.marked, `A) aucun élément remonté (${r.kept}/${r.marked} gardés)`);

  // B · onglet caché puis de retour (après plus de 30 s : la borne relit)
  await observe(p);
  n0 = calls.filter((c) => c === 'board').length;
  await setVisible(p, false);
  await p.clock.fastForward(31_000);
  await p.waitForTimeout(300);
  await setVisible(p, true);
  await p.waitForTimeout(1200);
  r = await collect(p);
  const polledB = calls.filter((c) => c === 'board').length > n0;
  report.visibility = { total: r.all.length, other: r.other.length };
  console.log(`   B · retour sur l'onglet : board relu=${polledB}, mutations=${r.all.length} (hors exceptions : ${r.other.length})${r.other.length ? `\n      ${summary(r.other)}` : ''}`);
  check(polledB, 'B) retour sur l’onglet : le planning est relu');
  check(r.other.length === 0, `B) retour sur l’onglet, données identiques : 0 mutation hors horloge/QR (${r.other.length})`);
  check(r.kept === r.marked, `B) aucun élément remonté (${r.kept}/${r.marked} gardés)`);

  // C · « sync » toutes les 5 min (nom de borne, entreprise, réglages identiques)
  await observe(p);
  n0 = calls.filter((c) => c === 'sync').length;
  // Par pas de 30 s, comme en vrai : la borne relit le planning à chaque pas
  // (un saut de 5 min d'un coup rendrait le planning « périmé » le temps d'une relecture).
  for (let i = 0; i < 10; i++) { await p.clock.fastForward(30_000); await p.waitForTimeout(250); }
  await p.waitForTimeout(1000);
  r = await collect(p);
  const synced = calls.filter((c) => c === 'sync').length > n0;
  report.sync5 = { total: r.all.length, other: r.other.length };
  console.log(`   C · sync 5 min : sync=${synced}, mutations=${r.all.length} (hors exceptions : ${r.other.length})${r.other.length ? `\n      ${summary(r.other)}` : ''}`);
  check(synced, 'C) la « sync » 5 min est bien passée');
  check(r.other.length === 0, `C) sync 5 min, données identiques : 0 mutation hors horloge/QR (${r.other.length})`);
  check((await p.locator('[data-testid=kb-unavailable]').count()) === 0, 'A–C) jamais « Chargement du planning… » pendant une relecture');

  // D · un VRAI changement : seule la case de Lucas, aujourd'hui, bouge
  await observe(p);
  server.board = BOARD_LUCAS;
  await p.clock.fastForward(30_000);
  await p.waitForTimeout(1200);
  r = await collect(p);
  const cells = [...new Set(r.other.map((m) => m.cell))];
  report.realChange = { total: r.all.length, other: r.other.length, cells };
  console.log(`   D · Lucas en cours : mutations=${r.all.length} (hors exceptions : ${r.other.length}), cases touchées : ${cells.join(', ')}\n      ${summary(r.other)}`);
  check((await p.locator('[data-testid=bubble-live]').allInnerTexts()).some((t) => /09:31/.test(t)), 'D) la bulle de Lucas passe « en cours depuis 09:31 »');
  check(r.other.length > 0 && cells.length === 1 && cells[0] === '3:4', `D) seule la case Lucas × jeudi est modifiée (${cells.join(', ')})`);
  check(r.kept === r.marked, `D) aucun autre élément remonté (${r.kept}/${r.marked} gardés)`);
  await ctx.close();
}

// ── 2) En-tête discret + grille en lecture seule ─────────────────────────────
for (const [w, h] of [[1280, 800], [1024, 768]]) {
  const { ctx, p } = await tablet({ width: w, height: h, cache: { ...OLD_CACHE, planning: undefined, board: BOARD, boardAt: NOW.getTime() } });
  await p.goto(`http://localhost:${PORT}/borne`);
  await p.waitForSelector('[data-testid=kb-week]', { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(1000);
  const hdr = await p.evaluate(() => {
    const logo = document.querySelector('.kb-top [data-testid=kb-logo]');
    const co = document.querySelector('.kb-top [data-testid=kb-company]');
    const kn = document.querySelector('.kb-top [data-testid=kb-kname]');
    const clock = document.querySelector('.kb-top .kb-clock');
    const go = document.querySelector('.kb-top [data-testid=kb-pointer]');
    const cs = co && getComputedStyle(co);
    return {
      logoAlt: logo?.getAttribute('alt') || '', logoH: logo ? Math.round(logo.getBoundingClientRect().height) : 0,
      logoSrc: logo?.getAttribute('src') || '',
      company: co?.textContent || '', coSize: cs ? parseFloat(cs.fontSize) : 0, coWeight: cs ? Number(cs.fontWeight) : 0, coColor: cs?.color || '',
      kname: kn?.textContent || '', knVisible: !!kn && kn.getBoundingClientRect().width > 0,
      clock: !!clock && clock.getBoundingClientRect().height > 0, go: !!go && go.getBoundingClientRect().height > 0,
      clockSize: clock ? parseFloat(getComputedStyle(clock).fontSize) : 0,
    };
  });
  check(/BEMEXO/.test(hdr.logoAlt) && /bemexo-wordmark/.test(hdr.logoSrc) && hdr.logoH > 0 && hdr.logoH <= 22, `2) ${w}×${h} : petit logo BEMEXO (${hdr.logoH}px de haut)`);
  check(hdr.company === 'Martin Menuiserie' && hdr.coSize <= 16 && hdr.coWeight < 900 && hdr.coColor !== 'rgb(242, 237, 227)', `2) ${w}×${h} : nom de l’entreprise discret (${hdr.coSize}px, ${hdr.coWeight}, ${hdr.coColor})`);
  check(hdr.kname === 'Entrée du dépôt' && hdr.knVisible, `2) ${w}×${h} : nom de la borne toujours là (appui long)`);
  check(hdr.clock && hdr.go && hdr.clockSize > hdr.coSize * 1.5, `2) ${w}×${h} : horloge et « Pointer (QR) » gardés`);
  const ro = await p.evaluate(() => {
    const wk = document.querySelector('.kb-week');
    const interactive = wk.querySelectorAll('button, a, input, select, textarea, [tabindex], [onclick], [role=button], [contenteditable]').length;
    const els = [wk, ...wk.querySelectorAll('*')];
    const notDefault = [...new Set(els.filter((e) => getComputedStyle(e).cursor !== 'default').map((e) => e.className || e.tagName))];
    const cells = wk.querySelectorAll('td, th, .bt-pl-namebtn, .bt-pl-bub, .bt-pl-abs, .bt-pl-cellfill').length;
    return { interactive, notDefault, cells, focusable: [...wk.querySelectorAll('*')].filter((e) => e.tabIndex >= 0).length };
  });
  check(ro.interactive === 0 && ro.focusable === 0, `2) ${w}×${h} : aucun button/a/[tabindex]/[onclick] ni élément focusable dans .kb-week (${ro.interactive}, ${ro.focusable})`);
  check(ro.cells > 0 && ro.notDefault.length === 0, `2) ${w}×${h} : curseur « default » partout dans la grille (${ro.notDefault.join(', ') || 'ok'})`);
  // Survol : rien ne change (ni fond, ni ombre, ni bordure) sur une case, un nom, une bulle.
  const targets = ['.kb-week tbody tr:nth-child(3) .bt-pl-namebtn', '.kb-week tbody tr:nth-child(3) td:nth-child(5) .bt-pl-bub', '.kb-week tbody tr:nth-child(3) td:nth-child(5)', '.kb-week [data-testid=kb-absent]'];
  const styleOf = (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const c = getComputedStyle(e); return [c.backgroundColor, c.backgroundImage, c.boxShadow, c.borderColor, c.transform, c.opacity, c.cursor, c.color].join('|'); }, sel);
  let hoverSame = true; const diffs = [];
  for (const sel of targets) {
    await p.mouse.move(5, h - 5);
    const before = await styleOf(sel);
    const box = await p.locator(sel).first().boundingBox();
    if (!box || before == null) { hoverSame = false; diffs.push(`${sel}: introuvable`); continue; }
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.waitForTimeout(250);
    const after = await styleOf(sel);
    if (before !== after) { hoverSame = false; diffs.push(`${sel}: ${before} → ${after}`); }
  }
  check(hoverSame, `2) ${w}×${h} : aucun effet au survol dans la grille ${diffs.join(' ; ')}`);
  // Toucher une case : rien ne s'ouvre, rien ne change.
  await observe(p);
  await p.click('.kb-week tbody tr:nth-child(3) td:nth-child(5)');
  await p.click('.kb-week tbody tr:nth-child(3) .bt-pl-namebtn');
  await p.waitForTimeout(300);
  const rc = await collect(p);
  check(rc.other.length === 0 && (await p.locator('[data-testid=kb-qr-overlay]').count()) === 0, `2) ${w}×${h} : toucher une case ou un nom ne fait rien (${rc.other.length} mutation)`);
  // Appui long de 5 s sur le nom de la borne : toujours la confirmation.
  await p.mouse.move(5, h - 5);
  const kn = await p.locator('[data-testid=kb-kname]').boundingBox();
  await p.mouse.move(kn.x + Math.min(10, kn.width / 2), kn.y + kn.height / 2); await p.mouse.down();
  await p.clock.fastForward(5200); await p.waitForTimeout(150);
  check(await p.locator('[data-testid=kb-unpair-confirm]').isVisible(), `2) ${w}×${h} : appui long 5 s sur le nom de la borne → confirmation`);
  await p.mouse.up();
  await p.click('text=Annuler');
  await p.mouse.move(5, h - 5);
  await p.waitForTimeout(200);
  await p.screenshot({ path: `${SH}/borne-${w}x${h}.png` });
  await ctx.close();
}

// ── 3) Si la borne est ouverte sur un téléphone (portrait) : rien ne déborde ──
{
  const { ctx, p } = await tablet({ width: 390, height: 844, isMobile: true, cache: { ...OLD_CACHE, planning: undefined, board: BOARD, boardAt: NOW.getTime() } });
  await p.goto(`http://localhost:${PORT}/borne`);
  await p.waitForSelector('[data-testid=kb-week]', { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(1000);
  const m = await p.evaluate(() => ({ page: document.documentElement.scrollWidth <= window.innerWidth, go: !!document.querySelector('[data-testid=kb-pointer]')?.getBoundingClientRect().height, logo: !!document.querySelector('[data-testid=kb-logo]') }));
  check(m.page && m.go && m.logo, `3) téléphone 390×844 : pas de défilement horizontal de la page, logo et « Pointer (QR) » présents ${JSON.stringify(m)}`);
  // Pas de capture : la borne est une tablette ; la grille de la semaine n'est pas
  // faite pour un téléphone (on vérifie seulement que rien ne déborde de la page).
  await ctx.close();
}

console.log(`\nMUTATIONS ${JSON.stringify(report)}`);
console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
