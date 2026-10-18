// Retouches 3 du bureau v2 (simplifier : un comportement par élément) : images AVANT | APRÈS côte à côte (même écran, mêmes données, même geste).
//   node scripts/tests/captures-retouches-3.mjs <out-avant> <out-apres> <dossier> [port]
// Données : bureau-sim.mjs, jeu « 2a » (horloge figée au jeudi 15 octobre 2026, 9 h 30 ; pilotée pour le message de 0 s à 7 s).
import fs from 'node:fs'; import path from 'node:path';
import { demarrer } from './bureau-sim.mjs';

const [,, AVANT, APRES, DOSSIER = 'captures-retouches-3', PORT = '4541'] = process.argv;
if (!AVANT || !APRES) { console.error('usage : captures-retouches-3.mjs <out-avant> <out-apres> <dossier> [port]'); process.exit(2); }
fs.mkdirSync(DOSSIER, { recursive: true });
const simA = await demarrer({ out: AVANT, port: Number(PORT), jeu: '2a' });
const simB = await demarrer({ out: APRES, port: Number(PORT) + 1, jeu: '2a' });

const ouvrir = async (sim, largeur, hauteur, tactile = false) => {
  sim.reinitialiser();
  const r = await sim.page({ ui: 2, largeur, hauteur, hasTouch: tactile, attente: largeur < 768 ? '.dzp-m-carte' : '.dzp-table' });
  for (const id of ['copy-tip-ok-m', 'copy-tip-ok']) { const b = r.page.locator(`[data-testid=${id}]:visible`); if (await b.count()) { await b.first().click().catch(() => {}); await r.page.waitForTimeout(200); } }
  await r.page.evaluate(() => window.scrollTo(0, 0));
  return r;
};
const cliche = async (page, { clip = null, souris = true } = {}) => {
  await page.evaluate(() => document.activeElement?.blur?.());
  if (souris) await page.mouse.move(2, 2);
  await page.waitForTimeout(300);
  return page.screenshot(clip ? { clip } : {});
};
const clic = async (page, sel, ms = 700) => { await page.locator(`${sel}:visible`).first().click(); await page.waitForTimeout(ms); };
/** Ctrl + glisser : la case d'Alex du vendredi copiée sur le samedi (même geste avant et après). */
const copier = async (page) => {
  const ligne = page.locator('.dzp-table tbody tr', { has: page.locator('.dzp-nom', { hasText: 'Alex Test' }) }).first();
  const a = await ligne.locator('td').nth(5).locator('[data-bub]').first().boundingBox(); const z = await ligne.locator('td').nth(6).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.keyboard.down('Control'); await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 4, { steps: 4 }); await page.mouse.move(z.x + z.width / 2, z.y + z.height - 12, { steps: 14 });
  await page.waitForTimeout(200); await page.mouse.up(); await page.keyboard.up('Control'); await page.waitForTimeout(900);
  await page.mouse.move(700, 120);
};
const BAS = { x: 360, y: 560, width: 720, height: 340 };

const CAS = [
  // Haut déplié, juste après un clic sur le compteur « à relancer » (AVANT : la tuile grandit, fond orange ; APRÈS : même tuile, anneau discret)
  { nom: 'tuile-relancer-1440', l: 1440, h: 900, faire: async ({ page }) => { await clic(page, '[data-testid=stat-waiting]', 250); return cliche(page, { clip: { x: 0, y: 0, width: 1440, height: 420 }, souris: false }); } },
  // Exporter, le bas du panneau (AVANT : le lien « Un seul salarié ? » en double de la bascule ; APRÈS : la bascule seule)
  { nom: 'exporter-1440', l: 1440, h: 900, faire: async ({ page }) => {
    await clic(page, '[data-testid=bar-export]', 900);
    await page.evaluate(() => { const p = document.querySelector('[data-testid=team-export]'); for (const e of [p, ...p.querySelectorAll('*')]) if (e.scrollHeight > e.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(e).overflowY)) e.scrollTop = e.scrollHeight; });
    return cliche(page);
  } },
  { nom: 'plus-menu-1440', l: 1440, h: 900, faire: async ({ page }) => { await clic(page, '[data-testid=bar-plus]', 400); return cliche(page, { souris: false }); } },
  { nom: 'toast-copie-0s', l: 1440, h: 900, faire: async ({ page }) => { await copier(page); return cliche(page, { clip: BAS, souris: false }); } },
  { nom: 'toast-copie-7s', l: 1440, h: 900, faire: async ({ page }) => { await copier(page); await page.clock.fastForward(7000); await page.waitForTimeout(500); return cliche(page, { clip: BAS, souris: false }); } },
  { nom: 'telephone-menu-390', l: 390, h: 844, tactile: true, faire: async ({ page }) => { await clic(page, 'button[aria-label="Menu"]', 800); return cliche(page); } },
  { nom: 'telephone-legende-390', apresSeul: true, l: 390, h: 844, tactile: true, faire: async ({ page }) => { await clic(page, 'button[aria-label="Menu"]', 800); await clic(page, '[data-testid=mm-legende]', 900); return cliche(page); } },
];

const dims = (b) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });
const cote = await simB.browser.newContext({ viewport: { width: 400, height: 300 } });
const pg = await cote.newPage();
const src = (x) => `data:image/png;base64,${x.toString('base64')}`;
for (const c of CAS) {
  const images = [];
  for (const sim of c.apresSeul ? [simB] : [simA, simB]) {
    const r = await ouvrir(sim, c.l, c.h, !!c.tactile);
    try { images.push(await c.faire(r)); } catch (e) { console.log(`${c.nom} (${sim === simA ? 'avant' : 'après'}) : ${e.message.split('\n')[0]}`); images.push(await cliche(r.page)); }
    await r.ctx.close();
  }
  const ds = images.map(dims);
  const W = ds.reduce((t, d) => t + d.w, 0) + 24 * (ds.length - 1); const H = Math.max(...ds.map((d) => d.h)) + 44;
  await pg.setViewportSize({ width: W, height: H });
  const noms = c.apresSeul ? ['APRÈS'] : ['AVANT', 'APRÈS'];
  await pg.setContent(`<body style="margin:0;background:#C9B998;font:700 15px system-ui;display:flex;gap:24px;align-items:flex-start">${images.map((im, i) => `
    <figure style="margin:0"><figcaption style="height:44px;display:flex;align-items:center;padding-left:12px">${noms[i]} · ${c.nom}</figcaption><img src="${src(im)}" width="${ds[i].w}" height="${ds[i].h}"></figure>`).join('')}</body>`);
  await pg.waitForTimeout(200);
  await pg.screenshot({ path: path.join(DOSSIER, `${c.nom}.png`) });
  console.log(`${c.nom}.png écrite`);
}
await cote.close();
await simA.fermer(); await simB.fermer();
