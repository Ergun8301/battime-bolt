// Retouches du planning ordinateur 1a (retours d'Ergun sur la préview) : images AVANT | APRÈS côte à côte, même écran, mêmes données.
//   node scripts/tests/captures-retouches.mjs <out-avant> <out-apres> <dossier> [port]
// <out-avant> : export statique de la branche avant les retouches ; <out-apres> : celui de la branche retouchée.
// Données : bureau-sim.mjs, jeu « 2a » (horloge figée au jeudi 15 octobre 2026, 9 h 30) ; `deplie-1440` utilise aussi un jeu proche de la capture
// d'Ergun (trois salariés, un seul avec des interventions).
import fs from 'node:fs'; import path from 'node:path';
import { demarrer } from './bureau-sim.mjs';

const [,, AVANT, APRES, DOSSIER = 'captures-retouches', PORT = '4471'] = process.argv;
if (!AVANT || !APRES) { console.error('usage : captures-retouches.mjs <out-avant> <out-apres> <dossier> [port]'); process.exit(2); }
fs.mkdirSync(DOSSIER, { recursive: true });
const simA = await demarrer({ out: AVANT, port: Number(PORT), jeu: '2a' });
const simB = await demarrer({ out: APRES, port: Number(PORT) + 1, jeu: '2a' });

/** Jeu « capture d'Ergun » : les trois premiers salariés du jeu 2a ; seul le premier a des interventions (les deux autres n'ont rien cette semaine). */
const troisSalaries = (D) => {
  const salaries = D.users.filter((u) => u.role !== 'admin');
  const vides = new Set(salaries.slice(1).map((u) => u.id));
  D.users = D.users.filter((u) => u.role === 'admin' || salaries.slice(0, 3).some((s) => s.id === u.id));
  for (const [t, rows] of Object.entries(D)) {
    if (t === 'users' || !Array.isArray(rows)) continue;
    D[t] = rows.filter((r) => !r || typeof r !== 'object' || !('user_id' in r) || !vides.has(r.user_id));
  }
};

const fermerAstuce = async (page) => {
  for (const id of ['copy-tip-ok-m', 'copy-tip-ok']) {
    const b = page.locator(`[data-testid=${id}]:visible`);
    if (await b.count()) { await b.first().click().catch(() => {}); await page.waitForTimeout(200); }
  }
  await page.evaluate(() => window.scrollTo(0, 0));
};
const ouvrir = async (sim, largeur, hauteur, opts = {}) => {
  sim.reinitialiser(); if (opts.avant) opts.avant(sim.D);
  const r = await sim.page({ ui: 2, largeur, hauteur, hasTouch: !!opts.tactile, attente: '.dzp-table' });
  await fermerAstuce(r.page);
  return r;
};
/** Une zone autour d'un élément (marge en px), bornée à l'écran. */
const zone = async (page, sel, marge = 16) => {
  const b = await page.locator(sel).first().boundingBox();
  const vp = page.viewportSize();
  const x = Math.max(0, b.x - marge); const y = Math.max(0, b.y - marge);
  return { x, y, width: Math.min(vp.width - x, b.width + 2 * marge), height: Math.min(vp.height - y, b.height + 2 * marge) };
};
const cliche = async (page, clip = null, garderFocus = false) => {
  if (!garderFocus) await page.evaluate(() => document.activeElement?.blur?.());
  await page.mouse.move(2, 2); await page.waitForTimeout(350);
  return page.screenshot(clip ? { clip } : {});
};

const assistant = async (page, ctx) => {
  await ctx.route('**/functions/v1/assistant', (r) => r.fulfill({ json: { answer: 'La liste de vos salariés est dans « Salariés ».', links: [{ label: 'Salariés', action: 'salaries' }], remaining: 42 } }));
  await page.click('[data-testid=bar-assistant]');
  await page.waitForSelector('[data-testid=assistant-panel] textarea', { timeout: 15000 });
  await page.fill('[data-testid=assistant-panel] textarea', 'Où sont mes salariés ?');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid=assistant-panel] .as-links button', { timeout: 15000 });
  await page.click('[data-testid=assistant-panel] .as-links button'); await page.waitForTimeout(700);
};

const CAS = [
  { nom: 'deplie-1440', l: 1440, h: 900, opts: { avant: troisSalaries }, faire: async ({ page }) => cliche(page) },
  { nom: 'deplie-1440-jeu-2a', l: 1440, h: 900, faire: async ({ page }) => cliche(page) },
  { nom: 'replie-1440', l: 1440, h: 900, faire: async ({ page }) => { await page.click('[data-testid=haut-replier]'); await page.waitForTimeout(300); return cliche(page); } },
  { nom: 'recherche-focus-1440', l: 1440, h: 900, faire: async ({ page }) => { await page.click('[data-testid=recherche-champ]'); await page.waitForTimeout(200); return cliche(page, await zone(page, '.dzp-recherche', 28), true); } },
  { nom: 'tuile-heures-1440', l: 1440, h: 900, faire: async ({ page }) => cliche(page, await zone(page, '[data-testid=bandeau] [data-testid=stat-heures]', 20)) },
  { nom: 'tuile-heures-1024', l: 1024, h: 768, faire: async ({ page }) => cliche(page, await zone(page, '[data-testid=bandeau] [data-testid=stat-heures]', 20)) },
  { nom: 'ligne-salarie-1440', l: 1440, h: 900, faire: async ({ page }) => { await page.locator('.dzp-table tbody tr').first().scrollIntoViewIfNeeded(); return cliche(page, await zone(page, '.dzp-table tbody tr:first-child', 8)); } },
  { nom: 'pleinecran-1440', l: 1440, h: 900, faire: async ({ page }) => { await page.click('[data-testid=bar-plein-ecran]'); await page.waitForTimeout(300); return cliche(page); } },
  { nom: 'tablette-834', l: 834, h: 1112, opts: { tactile: true }, faire: async ({ page }) => { await page.click('[data-testid=bar-plein-ecran]'); await page.waitForTimeout(300); return cliche(page); } },
  { nom: 'assistant-ouvre-salaries-1440', l: 1440, h: 900, faire: async ({ page, ctx }) => { await assistant(page, ctx); return cliche(page); } },
];

const dims = (b) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });
const cote = await simB.browser.newContext({ viewport: { width: 400, height: 300 } });
const pg = await cote.newPage();
for (const c of CAS) {
  const images = [];
  for (const sim of [simA, simB]) {
    const r = await ouvrir(sim, c.l, c.h, c.opts);
    images.push(await c.faire(r));
    await r.ctx.close();
  }
  const [a, b] = images.map(dims);
  const W = a.w + b.w + 24; const H = Math.max(a.h, b.h) + 44;
  await pg.setViewportSize({ width: W, height: H });
  const src = (x) => `data:image/png;base64,${x.toString('base64')}`;
  await pg.setContent(`<body style="margin:0;background:#C9B998;font:700 15px system-ui;display:flex;gap:24px;align-items:flex-start">
    <figure style="margin:0"><figcaption style="height:44px;display:flex;align-items:center;padding-left:12px">AVANT · ${c.nom}</figcaption><img src="${src(images[0])}" width="${a.w}" height="${a.h}"></figure>
    <figure style="margin:0"><figcaption style="height:44px;display:flex;align-items:center;padding-left:12px">APRÈS · ${c.nom}</figcaption><img src="${src(images[1])}" width="${b.w}" height="${b.h}"></figure></body>`);
  await pg.waitForTimeout(200);
  await pg.screenshot({ path: path.join(DOSSIER, `${c.nom}.png`) });
  console.log(`${c.nom}.png écrite`);
}
await cote.close();
await simA.fermer(); await simB.fermer();
