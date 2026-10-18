// Rendu de la maquette 2a (« Bureau · barre unique + plein écran ») de la planche d'essai du designer :
// docs/design-brief/designer-essai/Essai nouveau design Bemexo.dc.html (moteur dc : support.js, React/ReactDOM 18.3.1).
//   LIBS_DIR=<dossier> node scripts/tests/planche-essai-2a.mjs <dossier-de-sortie> [--plein-ecran]
//   LIBS_DIR=<dossier> node scripts/tests/planche-essai-2a.mjs <dossier-de-sortie> --telephone
// Écrit <sortie>/planche-2a-1440.png (la maquette 1440 × 900 découpée) et <sortie>/planche-2a-mesures.json (boîtes de la barre, des en-têtes, de la 1re ligne).
// --telephone : découpe les deux téléphones du TOUR 2 (cadre de 390 × 844, coque comprise) : planche-2b-jour.png (2b « Bureau · téléphone », vue Jour),
// planche-2b-semaine.png (la même après « Semaine »), planche-2c.png (2c « Panneau sous 1024 px ») et planche-2b-mesures.json (boîtes de l'écran 2b et de la feuille 2c).
//   LIBS_DIR=<dossier> node scripts/tests/planche-essai-2a.mjs <dossier-de-sortie> --1a
// --1a : la maquette 1a du TOUR 1 (« Bureau · ordinateur 1440 », réglages par défaut : cockpit et envoyées sombres allumés) : planche-1a-1440.png (le cadre de
// 1 440 px entier, hauteur réelle) et planche-1a-mesures.json (boîtes de la barre noire, de la ligne de semaine, des tuiles, des en-têtes et des lignes).
// Réseau fermé : React 18.3.1, ReactDOM 18.3.1 et Babel 7.29.0 (demandés par support.js à unpkg.com) sont servis depuis LIBS_DIR
// (`npm pack react@18.3.1 react-dom@18.3.1 @babel/standalone@7.29.0` puis extraire : react.production.min.js, react-dom.production.min.js, babel.min.js).
// Les polices Google (Archivo, JetBrains Mono) sont remplacées par les MÊMES fichiers, auto-hébergés dans public/fonts : la comparaison porte aussi sur le dessin des lettres.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}
const ROOT = path.resolve('docs/design-brief/designer-essai');
const FONTS = path.resolve('public/fonts');
const PAGE = 'Essai nouveau design Bemexo.dc.html';
const LIBS = process.env.LIBS_DIR;
if (!LIBS) { console.error('LIBS_DIR manquant (voir l’en-tête du script)'); process.exit(2); }
const args = process.argv.slice(2);
const sortie = args.find((a) => !a.startsWith('--')) || 'planche-2a';
const plein = args.includes('--plein-ecran');
const telephone = args.includes('--telephone');
const un_a = args.includes('--1a');
const PORT = Number(process.env.PORT_PLANCHE || 4998);
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  const f = p.startsWith('/fonts/') ? path.join(FONTS, p.slice(7)) : path.join(ROOT, p === '/' ? PAGE : p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); } else { r.writeHead(404); r.end(); }
});
await new Promise((r) => srv.listen(PORT, r));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
fs.mkdirSync(sortie, { recursive: true });
const LOC = { 'babel.min.js': 'babel.min.js', 'react.production.min.js': 'react.production.min.js', 'react-dom.production.min.js': 'react-dom.production.min.js' };
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const pg = await ctx.newPage();
const css = fs.readFileSync(path.join(FONTS, 'fonts.css'), 'utf8').replace(/url\(\/fonts\//g, `url(http://localhost:${PORT}/fonts/`);
await pg.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ body: css, contentType: 'text/css' }));
await pg.route(/fonts\.gstatic\.com/, (r) => r.abort());
await pg.route(/unpkg\.com/, (r) => { const n = r.request().url().split('/').pop(); r.fulfill({ body: fs.readFileSync(path.join(LIBS, LOC[n])), contentType: 'text/javascript' }); });
await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 120000 });
await pg.waitForFunction(() => !!document.querySelector('#\\32 a table tbody tr'), null, { timeout: 120000 });
await pg.evaluate(() => document.fonts.ready);
if (un_a) {
  await pg.waitForFunction(() => !!document.querySelector('#\\31 a table tbody tr'), null, { timeout: 120000 });
  await pg.waitForTimeout(1200);
  const m = await pg.evaluate(() => {
    const z = document.getElementById('1a');
    const cadre = [...z.querySelectorAll('div')].find((d) => Math.round(d.getBoundingClientRect().width) === 1440 && d.getBoundingClientRect().height >= 900);
    const o = cadre.getBoundingClientRect();
    const box = (e) => { const r = e.getBoundingClientRect(); return { t: (e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40), x: Math.round(r.x - o.x), y: Math.round(r.y - o.y), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
    const enfants = [...cadre.children].filter((e) => e.getBoundingClientRect().height > 0);
    const noire = enfants.find((e) => Math.round(e.getBoundingClientRect().height) === 60);
    const ligne = noire?.nextElementSibling;
    return {
      cadre: { x: o.x + scrollX, y: o.y + scrollY, width: 1440, height: Math.round(o.height) },
      noire: noire ? [...noire.querySelectorAll('button, span')].filter((e) => e.closest('button') === e || e.tagName === 'BUTTON' || (!e.closest('button') && e.children.length === 0)).map(box) : [],
      ligne: ligne ? [...ligne.querySelectorAll('button, div')].filter((e) => e.tagName === 'BUTTON' || /Chercher/.test(e.textContent) && e.children.length <= 1).map(box) : [],
      entetes: [...cadre.querySelectorAll('thead th')].map(box),
      lignes: [...cadre.querySelectorAll('tbody tr')].map(box),
    };
  });
  await pg.screenshot({ path: path.join(sortie, 'planche-1a-1440.png'), clip: m.cadre, fullPage: true });
  fs.writeFileSync(path.join(sortie, 'planche-1a-mesures.json'), JSON.stringify(m, null, 1));
  console.log(`planche 1a : cadre 1440 × ${m.cadre.height}, ${m.ligne.length} éléments de ligne de semaine, ${m.lignes.length} lignes`);
  await b.close(); srv.close(); process.exit(0);
}
if (telephone) {
  // Le cadre du téléphone : le premier <div> de 390 × 844 de la zone (coque noire de 10 px comprise, écran de 370 × 824).
  const cadre = (id) => pg.evaluate((id) => {
    const z = document.getElementById(id);
    const d = [...z.querySelectorAll('div')].find((e) => { const r = e.getBoundingClientRect(); return Math.round(r.width) === 390 && Math.round(r.height) === 844; });
    const r = d.getBoundingClientRect();
    return { x: r.x + scrollX, y: r.y + scrollY, width: 390, height: 844 };
  }, id);
  const mesurer = (id) => pg.evaluate((id) => {
    const z = document.getElementById(id);
    const d = [...z.querySelectorAll('div')].find((e) => { const r = e.getBoundingClientRect(); return Math.round(r.width) === 390 && Math.round(r.height) === 844; });
    const o = d.firstElementChild.getBoundingClientRect();
    const box = (e) => { const r = e.getBoundingClientRect(); return { t: (e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40), x: Math.round(r.x - o.x), y: Math.round(r.y - o.y), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
    return { ecran: { w: o.width, h: o.height }, boutons: [...d.querySelectorAll('button')].map(box), dialogue: [...d.querySelectorAll('[role=dialog]')].map(box) };
  }, id);
  await pg.waitForTimeout(800);
  await pg.screenshot({ path: path.join(sortie, 'planche-2b-jour.png'), clip: await cadre('2b'), fullPage: true });
  const m2b = await mesurer('2b');
  await pg.locator('#\\32 b').getByRole('button', { name: 'Semaine', exact: true }).click();
  await pg.waitForTimeout(600);
  await pg.screenshot({ path: path.join(sortie, 'planche-2b-semaine.png'), clip: await cadre('2b'), fullPage: true });
  const m2bs = await mesurer('2b');
  await pg.screenshot({ path: path.join(sortie, 'planche-2c.png'), clip: await cadre('2c'), fullPage: true });
  const m2c = await mesurer('2c');
  fs.writeFileSync(path.join(sortie, 'planche-2b-mesures.json'), JSON.stringify({ jour: m2b, semaine: m2bs, feuille: m2c }, null, 1));
  console.log(`planche 2b / 2c : ${m2b.boutons.length} boutons (Jour), ${m2bs.boutons.length} (Semaine), feuille ${JSON.stringify(m2c.dialogue[0] || null)}`);
  await b.close(); srv.close(); process.exit(0);
}
if (plein) { await pg.locator('#\\32 a').getByRole('button', { name: 'Plein écran', exact: true }).first().click(); }
await pg.waitForTimeout(1200);
const mesures = await pg.evaluate(() => {
  const z = document.getElementById('2a');
  const cadre = [...z.querySelectorAll('div')].find((d) => { const r = d.getBoundingClientRect(); return Math.round(r.width) === 1440 && Math.round(r.height) === 900; });
  const o = cadre.getBoundingClientRect();
  const box = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x - o.x), y: Math.round(r.y - o.y), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
  const barre = cadre.firstElementChild?.getBoundingClientRect().height === 64 ? cadre.firstElementChild : null;
  const elements = barre ? [...barre.querySelectorAll(':scope > *, :scope > div > *')].map((e) => ({ t: e.textContent.trim().slice(0, 30), ...box(e) })) : [];
  const th = [...cadre.querySelectorAll('thead th')].map((e) => ({ t: e.innerText.replace(/\s+/g, ' ').trim(), ...box(e) }));
  const lignes = [...cadre.querySelectorAll('tbody tr')].map((e) => box(e));
  return { cadre: { x: o.x + scrollX, y: o.y + scrollY, width: 1440, height: 900 }, barre: elements, entetes: th, lignes };
});
await pg.screenshot({ path: path.join(sortie, plein ? 'planche-2a-pleinecran-1440.png' : 'planche-2a-1440.png'), clip: mesures.cadre, fullPage: true });
fs.writeFileSync(path.join(sortie, plein ? 'planche-2a-pleinecran-mesures.json' : 'planche-2a-mesures.json'), JSON.stringify(mesures, null, 1));
console.log(`planche 2a${plein ? ' (plein écran)' : ''} : ${mesures.barre.length} éléments de barre, ${mesures.entetes.length} en-têtes, ${mesures.lignes.length} lignes`);
await b.close(); srv.close();
