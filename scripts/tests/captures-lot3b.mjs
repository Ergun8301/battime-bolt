// Images « côte à côte » du lot 3 B du bureau : à gauche la planche (rendue par scripts/tests/planche-bureau.mjs, support.js + React 18.3.1),
// à droite l'écran (captures « impl-* » de scripts/tests/bureau-lot3b-controles.mjs), À LA MÊME ÉCHELLE (1 px de planche = 1 px d'écran), réduites de moitié.
//   node scripts/tests/captures-lot3b.mjs <dossier-planche> <dossier-écran> [docs/design-brief/integration/captures-lot3b]
import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}
const [,, PL, IM, SORTIE = 'docs/design-brief/integration/captures-lot3b'] = process.argv;
fs.mkdirSync(SORTIE, { recursive: true });
// groupe → paires [code planche, capture écran]
const GROUPES = {
  'cout-chantiers': [['ST03', 'impl-ST03'], ['ST04', 'impl-ST04']],
  'versions': [['ST05', 'impl-ST05'], ['ST07', 'impl-ST07'], ['ST08', 'impl-ST08']],
  'interventions-supprimees': [['ST09', 'impl-ST09']],
  'reglages-entreprise': [['RG01', 'impl-RG01'], ['RG06', 'impl-RG06']],
  'reglages-heures-paie': [['RG02', 'impl-RG02']],
  'reglages-borne-pointage': [['RG03', 'impl-RG03']],
  'reglages-notifications-support': [['RG04', 'impl-RG04'], ['RG16', 'impl-RG16']],
  'borne': [['RG07', 'impl-RG07'], ['RG08', 'impl-RG08'], ['RG09', 'impl-RG09'], ['RG10', 'impl-RG10'], ['RG11', 'impl-RG11']],
  'abonnement-support': [['RG12', 'impl-RG12'], ['RG13', 'impl-RG13'], ['RG15', 'impl-RG15'], ['RG17', 'impl-RG17']],
  'telephone-xm': [['XM05', 'impl-XM05'], ['XM06', 'impl-XM06'], ['XM08', 'impl-XM08'], ['XM12', 'impl-XM12'], ['XM13', 'impl-XM13'], ['XM14', 'impl-XM14']],
};
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const data = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
for (const [nom, paires] of Object.entries(GROUPES)) {
  const lignes = paires.filter(([a, c]) => fs.existsSync(path.join(PL, `${a}.png`)) && fs.existsSync(path.join(IM, `${c}.png`)));
  if (!lignes.length) { console.log(nom, ': rien'); continue; }
  const html = `<!doctype html><html><body style="margin:0;background:#2b2724;font:600 22px system-ui;color:#F2EDE3">${lignes.map(([a, c]) => `
    <div style="display:flex;gap:24px;align-items:flex-start;padding:20px">
      <figure style="margin:0"><figcaption style="padding:0 0 8px">${a} · planche</figcaption><img src="${data(path.join(PL, `${a}.png`))}"></figure>
      <figure style="margin:0"><figcaption style="padding:0 0 8px">${a} · écran (?ui=2)</figcaption><img src="${data(path.join(IM, `${c}.png`))}"></figure>
    </div>`).join('')}</body></html>`;
  const ctx = await b.newContext({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: 0.5 });
  const p = await ctx.newPage();
  await p.setContent(html, { waitUntil: 'load' });
  const dims = await p.evaluate(() => ({ w: document.body.scrollWidth, h: document.body.scrollHeight }));
  await p.setViewportSize({ width: dims.w, height: Math.min(dims.h, 16000) });
  await p.screenshot({ path: path.join(SORTIE, `${nom}.jpg`), type: 'jpeg', quality: 72, fullPage: true });
  console.log(nom, `${lignes.length} paire(s)`);
  await ctx.close();
}
await b.close();
