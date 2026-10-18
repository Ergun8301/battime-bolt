// Retouches 4 du bureau v2 (tuiles compactes, liste déroulante sous la tuile, « Autre lieu / client ») : images AVANT | APRÈS côte à côte (même écran, mêmes
// données, même geste).
//   node scripts/tests/captures-retouches-4.mjs <out-avant> <out-apres> <dossier> [port]
// Données : bureau-sim.mjs, jeu « 2a » (horloge figée au jeudi 15 octobre 2026, 9 h 30) ; « relancer-ouvert-1440 » : jeu « 2a-relances » (15 salariés à relancer).
import fs from 'node:fs'; import path from 'node:path';
import { demarrer } from './bureau-sim.mjs';

const [,, AVANT, APRES, DOSSIER = 'captures-retouches-4', PORT = '4561'] = process.argv;
if (!AVANT || !APRES) { console.error('usage : captures-retouches-4.mjs <out-avant> <out-apres> <dossier> [port]'); process.exit(2); }
fs.mkdirSync(DOSSIER, { recursive: true });
const simA = await demarrer({ out: AVANT, port: Number(PORT), jeu: '2a' });
const simB = await demarrer({ out: APRES, port: Number(PORT) + 1, jeu: '2a' });

const ouvrir = async (sim, largeur, hauteur, tactile = false, jeu = '2a') => {
  sim.reinitialiser(jeu);
  const r = await sim.page({ ui: 2, largeur, hauteur, hasTouch: tactile, attente: largeur < 768 ? '.dzp-m-carte' : '.dzp-table' });
  for (const id of ['copy-tip-ok-m', 'copy-tip-ok']) { const b = r.page.locator(`[data-testid=${id}]:visible`); if (await b.count()) { await b.first().click().catch(() => {}); await r.page.waitForTimeout(200); } }
  await r.page.evaluate(() => window.scrollTo(0, 0));
  return r;
};
const cliche = async (page, { clip = null } = {}) => {
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.mouse.move(2, 2);
  await page.waitForTimeout(300);
  return page.screenshot(clip ? { clip } : {});
};
const clic = async (page, sel, ms = 700) => { await page.locator(`${sel}:visible`).first().click(); await page.waitForTimeout(ms); };
/** Ouvre la liste « À relancer » du bandeau (APRÈS : clic sur la tuile ; AVANT : la liste est déjà dans la tuile, un clic n'y change rien). */
const ouvrirRelance = async (page) => {
  const apres = page.locator('[data-testid=bandeau] [data-testid=stat-relance] button.dzp-tuile__corps');
  if (await apres.count()) { await apres.click(); await page.waitForTimeout(400); }
};

const CAS = [
  { nom: 'bandeau-1440', l: 1440, h: 900, faire: async ({ page }) => cliche(page, { clip: { x: 0, y: 0, width: 1440, height: 520 } }) },
  { nom: 'relancer-ouvert-1440', jeu: '2a-relances', l: 1440, h: 900, faire: async ({ page }) => { await ouvrirRelance(page); return cliche(page, { clip: { x: 0, y: 0, width: 1440, height: 640 } }); } },
  { nom: 'bandeau-1024', l: 1024, h: 768, faire: async ({ page }) => cliche(page, { clip: { x: 0, y: 0, width: 1024, height: 480 } }) },
  { nom: 'bandeau-tablette-834', l: 834, h: 1112, tactile: true, faire: async ({ page }) => { await clic(page, '[data-testid=stat-waiting]', 600); return cliche(page, { clip: { x: 0, y: 0, width: 834, height: 760 } }); } },
  { nom: 'clients-autre-lieu-client', l: 1440, h: 900, faire: async ({ page }) => { await clic(page, '[data-guide="bureau-nav.clients"]', 600); return cliche(page, { clip: { x: 0, y: 0, width: 560, height: 900 } }); } },
];

const dims = (b) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });
const cote = await simB.browser.newContext({ viewport: { width: 400, height: 300 } });
const pg = await cote.newPage();
const src = (x) => `data:image/png;base64,${x.toString('base64')}`;
for (const c of CAS) {
  const images = [];
  for (const sim of [simA, simB]) {
    const r = await ouvrir(sim, c.l, c.h, !!c.tactile, c.jeu || '2a');
    try { images.push(await c.faire(r)); } catch (e) { console.log(`${c.nom} (${sim === simA ? 'avant' : 'après'}) : ${e.message.split('\n')[0]}`); images.push(await cliche(r.page)); }
    await r.ctx.close();
  }
  const ds = images.map(dims);
  const W = ds.reduce((t, d) => t + d.w, 0) + 24 * (ds.length - 1); const H = Math.max(...ds.map((d) => d.h)) + 44;
  await pg.setViewportSize({ width: W, height: H });
  await pg.setContent(`<body style="margin:0;background:#C9B998;font:700 15px system-ui;display:flex;gap:24px;align-items:flex-start">${images.map((im, i) => `
    <figure style="margin:0"><figcaption style="height:44px;display:flex;align-items:center;padding-left:12px">${['AVANT', 'APRÈS'][i]} · ${c.nom}</figcaption><img src="${src(im)}" width="${ds[i].w}" height="${ds[i].h}"></figure>`).join('')}</body>`);
  await pg.waitForTimeout(200);
  await pg.screenshot({ path: path.join(DOSSIER, `${c.nom}.png`) });
  console.log(`${c.nom}.png écrite`);
}
await cote.close();
await simA.fermer(); await simB.fermer();
