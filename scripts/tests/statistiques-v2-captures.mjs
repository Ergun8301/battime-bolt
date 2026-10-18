// Captures côte à côte « planche | écran », même échelle, pour la page « Statistiques » v2 (?ui=2).
//   npm run build && LIBS_DIR=<dossier> node scripts/tests/statistiques-v2-captures.mjs out docs/design-brief/integration/captures-statistiques-v2 4451
// La planche (docs/design-brief/designer-statistiques/Planche.dc.html) est rendue par son moteur support.js, qui attend window.React et
// window.ReactDOM 18 : LIBS_DIR contient react.production.min.js et react-dom.production.min.js (react@18.3.1 / react-dom@18.3.1, umd ;
// cdnjs ou `npm pack react@18.3.1 react-dom@18.3.1`). Polices : la feuille Google de la planche est remplacée par public/fonts/fonts.css
// (Archivo + JetBrains Mono, les fichiers que sert l'appli) : planche et écran ont la même typographie.
// L'écran : la base simulée de bureau-sim.mjs (données réelles de l'appli, pas celles, inventées, de la planche).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { demarrer, CHROME } from './bureau-sim.mjs';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}
const [,, OUT = 'out', SH = 'docs/design-brief/integration/captures-statistiques-v2', PORT = '4451'] = process.argv;
const LIBS = process.env.LIBS_DIR;
if (!LIBS) { console.error('LIBS_DIR manquant (voir l’en-tête du script)'); process.exit(2); }
fs.mkdirSync(SH, { recursive: true });
const TMP = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'sx-cap-'));
const ROOT = path.resolve('docs/design-brief/designer-statistiques');
const PUB = path.resolve('public');
const PP = Number(PORT) + 1;
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png' };

// ── 1) La planche ──────────────────────────────────────────────────────────
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if (p === '/react.js') return r.end(fs.readFileSync(path.join(LIBS, 'react.production.min.js')));
  if (p === '/react-dom.js') return r.end(fs.readFileSync(path.join(LIBS, 'react-dom.production.min.js')));
  if (p.startsWith('/fonts/')) { r.writeHead(200, { 'Content-Type': T[path.extname(p)] }); return r.end(fs.readFileSync(path.join(PUB, p))); }
  if (p.startsWith('/tmp/')) { r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); return r.end(fs.readFileSync(path.join(TMP, path.basename(p)))); }
  const f = path.join(ROOT, p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    let body = fs.readFileSync(f);
    if (p.endsWith('.html')) body = Buffer.from(String(body).replace('<script src="./support.js"></script>', '<script src="/react.js"></script><script src="/react-dom.js"></script><script src="./support.js"></script>'));
    r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return r.end(body);
  }
  r.writeHead(404); r.end();
});
await new Promise((r) => srv.listen(PP, r));
const b = await chromium.launch({ executablePath: CHROME });
{
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
  const pg = await ctx.newPage();
  await pg.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ contentType: 'text/css', body: String(fs.readFileSync(path.join(PUB, 'fonts/fonts.css'))).replaceAll('url(/fonts/', `url(http://localhost:${PP}/fonts/`) }));
  await pg.route(/fonts\.gstatic\.com/, (r) => r.abort());
  await pg.goto(`http://localhost:${PP}/Planche.dc.html`, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForTimeout(5000);
  for (const id of ['1a', '1b', '2a', '2b']) {
    const el = await pg.evaluate((id) => {
      const e = document.getElementById(id); if (!e) return null;
      const k = [...e.querySelectorAll('div')].find((x) => { const r = x.getBoundingClientRect(); return (Math.round(r.width) === 1280 && r.height >= 800) || (Math.round(r.width) === 360 && Math.round(r.height) === 780); });
      if (!k) return null; const r = k.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
    }, id);
    if (!el) { console.log(`planche ${id} : cadre introuvable`); continue; }
    await pg.screenshot({ path: path.join(TMP, `planche-${id}.png`), fullPage: true, clip: el });
  }
  await ctx.close();
}

// ── 2) L'écran (base simulée) ──────────────────────────────────────────────
const sim = await demarrer({ out: OUT, port: Number(PORT) });
const ouvrir = async (w, h) => {
  const { page, ctx } = await sim.page({ ui: 2, largeur: w, hauteur: h, attente: '.dzp-table .dzp-bulle, .dzp-m-menu', hasTouch: w < 400 });
  if (await page.locator('.dzp-m-menu').first().isVisible()) { await page.click('.dzp-m-menu'); await page.waitForTimeout(400); await page.click('[data-testid="mm-stats"]'); } else await page.click('[data-testid="stat-stats"]');
  await page.waitForSelector('[data-testid="stats-v2"][data-etat="ok"]', { timeout: 20000 });
  await page.waitForTimeout(1500);
  return { page, ctx };
};
const pret = async (page) => { await page.waitForSelector('[data-testid="stats-v2"][data-etat="ok"]', { timeout: 20000 }); await page.waitForTimeout(1500); };
{ // 1a : ordinateur, Semaine
  const { page, ctx } = await ouvrir(1280, 900);
  await page.screenshot({ path: path.join(TMP, 'ecran-1a.png') });
  // 2a : fiche ordinateur, Mois
  await page.click('[data-testid="sx-vue-mois"]'); await pret(page);
  await page.locator('[data-testid="sx-ligne"]', { hasText: 'Camille' }).click(); await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(TMP, 'ecran-2a.png') });
  await ctx.close();
}
{ // 1b : téléphone, Mois ; 2b : fiche téléphone, Semaine
  const { page, ctx } = await ouvrir(360, 780);
  await page.click('[data-testid="sx-vue-mois"]'); await pret(page);
  await page.screenshot({ path: path.join(TMP, 'ecran-1b.png') });
  await page.click('[data-testid="sx-vue-semaine"]'); await pret(page);
  await page.locator('[data-testid="sx-ligne"]', { hasText: 'Camille' }).click(); await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(TMP, 'ecran-2b.png') });
  await ctx.close();
}
await sim.fermer();

// ── 3) Côte à côte ────────────────────────────────────────────────────────
const paires = [['1a', 'compare-1a-1280.png', 1280, 900], ['1b', 'compare-1b-360.png', 360, 780], ['2a', 'compare-2a-fiche-1280.png', 1280, 900], ['2b', 'compare-2b-fiche-360.png', 360, 780]];
for (const [id, nom, w, h] of paires) {
  if (!fs.existsSync(path.join(TMP, `planche-${id}.png`))) continue;
  const gap = 32, pad = 24, lab = 34;
  const W = pad * 2 + w * 2 + gap, H = pad * 2 + lab + h;
  const ctx = await b.newContext({ viewport: { width: W, height: H } });
  const pg = await ctx.newPage();
  await pg.setContent(`<!doctype html><html><body style="margin:0;background:#CFC6B6;font:700 15px system-ui,sans-serif;color:#15120F">
    <div style="display:flex;gap:${gap}px;padding:${pad}px">
      <figure style="margin:0;width:${w}px"><figcaption style="height:${lab}px">Planche ${id}</figcaption><img src="http://localhost:${PP}/tmp/planche-${id}.png" style="display:block;width:${w}px;height:${h}px"></figure>
      <figure style="margin:0;width:${w}px"><figcaption style="height:${lab}px">Écran (?ui=2, base simulée)</figcaption><img src="http://localhost:${PP}/tmp/ecran-${id}.png" style="display:block;width:${w}px;height:${h}px"></figure>
    </div></body></html>`, { waitUntil: 'load' });
  await pg.screenshot({ path: path.join(SH, nom) });
  console.log('écrit', path.join(SH, nom));
  await ctx.close();
}
await b.close(); srv.close();
fs.rmSync(TMP, { recursive: true, force: true });
