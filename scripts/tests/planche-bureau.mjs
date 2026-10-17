// Capture écran par écran de la planche du designer du BUREAU (docs/design-brief/designer-bureau/BEMEXO Bureau - Dossier.dc.html).
// La planche (186 écrans) est lourde et lente à ouvrir : `?ecran=HP20` n'affiche qu'un écran, qu'on découpe ici.
//   node scripts/tests/planche-bureau.mjs HP01,HP20,HM05 <dossier-de-sortie hors dépôt>
// La planche charge React 18.3.1 et Babel 7.29.0 depuis unpkg.com (réseau fermé dans l'environnement de travail) : on les sert depuis un dossier local.
//   LIBS_DIR = dossier qui contient react.production.min.js, react-dom.production.min.js (react@18.3.1/umd) et babel.min.js (@babel/standalone@7.29.0)
//   (npm view / npm pack suffisent : `npm pack react@18.3.1 react-dom@18.3.1 @babel/standalone@7.29.0` puis extraire).
// Les polices Google ne sont pas chargées (police de repli) : les images de fidélité comparent la mise en page, pas le dessin des lettres.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}
const ROOT = path.resolve('docs/design-brief/designer-bureau');
const LIBS = process.env.LIBS_DIR;
if (!LIBS) { console.error('LIBS_DIR manquant (voir l’en-tête du script)'); process.exit(2); }
const [, , liste, sortie = 'planche'] = process.argv;
const codes = (liste || '').split(',').filter(Boolean);
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  const f = path.join(ROOT, p === '/' ? 'BEMEXO Bureau - Dossier.dc.html' : p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); } else { r.writeHead(404); r.end(); }
});
await new Promise((r) => srv.listen(4999, r));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
fs.mkdirSync(sortie, { recursive: true });
const LOC = { 'babel.min.js': 'babel.min.js', 'react.production.min.js': 'react.production.min.js', 'react-dom.production.min.js': 'react-dom.production.min.js' };
for (const c of codes) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  await pg.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await pg.route(/unpkg\.com/, (r) => { const n = r.request().url().split('/').pop(); r.fulfill({ body: fs.readFileSync(path.join(LIBS, LOC[n])), contentType: 'text/javascript' }); });
  await pg.goto(`http://localhost:4999/?ecran=${c}`, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForTimeout(4000);
  const mob = /^(HM|PM|XM)/.test(c);
  const el = await pg.evaluate(([id, mob]) => {
    const e = document.getElementById(id); if (!e) return null;
    const k = [...e.querySelectorAll('*')].find((x) => { const r = x.getBoundingClientRect(); return mob ? (r.width >= 385 && r.width <= 420 && r.height >= 800 && r.height <= 900) : (r.width >= 380 && r.height >= 700 && getComputedStyle(x).overflow !== 'visible'); });
    if (!k) return null; const r = k.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
  }, [c, mob]);
  await pg.screenshot({ path: path.join(sortie, `${c}.png`), fullPage: true, ...(el ? { clip: el } : {}) });
  console.log(c, el ? `${Math.round(el.width)}×${Math.round(el.height)}` : 'page entière');
  await ctx.close();
}
await b.close(); srv.close();
