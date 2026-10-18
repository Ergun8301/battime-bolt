// Retouches 2 du bureau v2 (retours d'Ergun sur la préview) : images AVANT | APRÈS côte à côte (même écran, mêmes données), puis une planche « audit »
// de 8 vignettes APRÈS correction.
//   node scripts/tests/captures-retouches-2.mjs <out-avant> <out-apres> <dossier> [port]
// Données : bureau-sim.mjs, jeu « 2a » (horloge figée au jeudi 15 octobre 2026, 9 h 30).
import fs from 'node:fs'; import path from 'node:path';
import { demarrer } from './bureau-sim.mjs';

const [,, AVANT, APRES, DOSSIER = 'captures-retouches-2', PORT = '4501'] = process.argv;
if (!AVANT || !APRES) { console.error('usage : captures-retouches-2.mjs <out-avant> <out-apres> <dossier> [port]'); process.exit(2); }
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
const cliche = async (page, clip = null) => {
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.mouse.move(2, 2); await page.waitForTimeout(400);
  return page.screenshot(clip ? { clip } : {});
};
const zoneDe = async (page, sel, marge = 16) => {
  const b = await page.locator(sel).last().boundingBox(); const vp = page.viewportSize();
  const x = Math.max(0, b.x - marge); const y = Math.max(0, b.y - marge);
  return { x, y, width: Math.min(vp.width - x, b.width + 2 * marge), height: Math.min(vp.height - y, b.height + 2 * marge) };
};
const clic = async (page, sel, ms = 700) => { await page.locator(`${sel}:visible`).first().click(); await page.waitForTimeout(ms); };
const dehors = async (page) => { const b = await page.locator('.dzp-logo:visible').first().boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(500); };
const assistant = async (page, ctx) => {
  await ctx.route('**/functions/v1/assistant', (r) => r.fulfill({ json: { answer: 'Vous avez 8 salariés actifs cette semaine.', links: [], remaining: 42 } }));
  await page.click('[data-testid=bar-assistant]');
  await page.waitForSelector('[data-testid=assistant-panel] textarea', { timeout: 15000 });
  await page.fill('[data-testid=assistant-panel] textarea', 'Combien de salariés ?');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid=assistant-panel] .as-bot', { timeout: 15000 }); await page.waitForTimeout(400);
};

const CAS = [
  { nom: 'pleinecran-1440', l: 1440, h: 900, faire: async ({ page }) => { await clic(page, '[data-testid=bar-plein-ecran]', 400); return cliche(page); } },
  { nom: 'exporter-salarie-croix', l: 1440, h: 900, faire: async ({ page }) => { await clic(page, '[data-testid=bar-export]', 900); await clic(page, '[data-testid=export-one-worker]', 900); return cliche(page, await zoneDe(page, '[data-testid=export-worker]', 24)); } },
  { nom: 'exporter-bascule-1440', l: 1440, h: 900, faire: async ({ page }) => { await clic(page, '[data-testid=bar-export]', 900); return cliche(page); } },
  { nom: 'exporter-un-salarie-1440', apresSeul: true, l: 1440, h: 900, faire: async ({ page }) => { await clic(page, '[data-testid=bar-export]', 900); await clic(page, '[data-testid=export-bascule-salarie]', 500); return cliche(page); } },
  { nom: 'clients-autre-lieu', l: 1440, h: 900, faire: async ({ page }) => { await clic(page, '[data-guide="bureau-nav.clients"]', 500); return cliche(page, { x: 0, y: 0, width: 760, height: 900 }); } },
  { nom: 'plus-menu-1440', l: 1440, h: 900, faire: async ({ page }) => { await clic(page, '[data-testid=bar-plus]', 400); return cliche(page); } },
  { nom: 'plus-menu-1024', l: 1024, h: 768, faire: async ({ page }) => { await clic(page, '[data-testid=bar-plus]', 400); return cliche(page); } },
  { nom: 'telephone-menu-390', l: 390, h: 844, tactile: true, faire: async ({ page }) => { await clic(page, 'button[aria-label="Menu"]', 800); return cliche(page); } },
  { nom: 'tablette-834', l: 834, h: 1112, tactile: true, faire: async ({ page }) => { await clic(page, '[data-testid=bar-plein-ecran]', 400); return cliche(page); } },
  { nom: 'compteur-deplie-1440', l: 1440, h: 900, faire: async ({ page }) => { await clic(page, '[data-testid=stat-waiting]', 350); return cliche(page); } },
  { nom: 'compteur-replie-1440', l: 1440, h: 900, faire: async ({ page }) => { await clic(page, '[data-testid=haut-replier]', 400); await clic(page, '[data-testid=stat-waiting]', 500); return cliche(page, { x: 0, y: 0, width: 1440, height: 420 }); } },
  { nom: 'assistant-clic-dehors', l: 1440, h: 900, faire: async ({ page, ctx }) => { await assistant(page, ctx); await dehors(page); return cliche(page); } },
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

// ── Planche « audit » : 8 vignettes APRÈS correction (390, 834, 1024, 1440) ──
const AUDIT = [
  { t: '390 · planning (téléphone)', l: 390, h: 844, tactile: true, faire: async ({ page }) => cliche(page) },
  { t: '834 · tablette, Plus ⋯', l: 834, h: 1112, tactile: true, faire: async ({ page }) => { await clic(page, '[data-testid=bar-plus]', 400); return cliche(page); } },
  { t: '1024 · replié', l: 1024, h: 768, faire: async ({ page }) => { await clic(page, '[data-testid=haut-replier]', 400); return cliche(page); } },
  { t: '1440 · fiche intervention', l: 1440, h: 900, faire: async ({ page }) => { await clic(page, '.dzp-table .dzp-bulle', 900); return cliche(page); } },
  { t: '1440 · Coût chantiers', l: 1440, h: 900, faire: async ({ page }) => { await clic(page, '[data-testid=bar-plus]', 300); await clic(page, '[data-testid=bar-cost]', 1200); return cliche(page); } },
  { t: '1440 · Réglages', l: 1440, h: 900, faire: async ({ page }) => { await clic(page, '[data-testid=bar-compte]', 300); await clic(page, '[data-guide="bureau-nav.reglages"]', 1200); return cliche(page); } },
  { t: '1440 · Salariés', l: 1440, h: 900, faire: async ({ page }) => { await clic(page, '[data-guide="bureau-nav.salaries"]', 900); return cliche(page); } },
  { t: '1440 · assistant ouvert', l: 1440, h: 900, faire: async ({ page, ctx }) => { await assistant(page, ctx); return cliche(page); } },
];
const vignettes = [];
for (const a of AUDIT) {
  const r = await ouvrir(simB, a.l, a.h, !!a.tactile);
  try { vignettes.push({ t: a.t, im: await a.faire(r) }); } catch (e) { console.log(`audit ${a.t} : ${e.message.split('\n')[0]}`); vignettes.push({ t: a.t, im: await cliche(r.page) }); }
  await r.ctx.close();
}
await pg.setViewportSize({ width: 1840, height: 1000 });
await pg.setContent(`<body style="margin:0;padding:16px;background:#C9B998;font:700 14px system-ui;display:grid;grid-template-columns:repeat(4,1fr);gap:16px;align-items:start">${vignettes.map((v) => `
  <figure style="margin:0;background:#F2EDE3;border-radius:10px;overflow:hidden"><figcaption style="padding:8px 10px">${v.t}</figcaption><img src="${src(v.im)}" style="display:block;width:100%;height:auto"></figure>`).join('')}</body>`);
await pg.waitForTimeout(400);
await pg.screenshot({ path: path.join(DOSSIER, 'audit-planche.png'), fullPage: true });
console.log('audit-planche.png écrite');
await cote.close();
await simA.fermer(); await simB.fermer();
