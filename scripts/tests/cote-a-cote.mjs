// Assemble des images « planche | écran » côte à côte, à la même échelle (largeur commune), en JPG.
//   node scripts/tests/cote-a-cote.mjs <dossier-planche> <dossier-écran> <dossier-sortie> CL05=CL05-fiche-client-1440 EQ01=EQ01-salaries-1440 …
// Chaque paire `CODE=fichier` prend <planche>/CODE.png et <écran>/fichier.png ; la sortie est <sortie>/CODE-cote-a-cote.jpg.
import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}
const [, , PL, EC, OUT, ...paires] = process.argv;
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
const uri = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
for (const p of paires) {
  const [code, fichier] = p.split('=');
  const a = path.join(PL, `${code}.png`); const e = path.join(EC, `${fichier}.png`);
  if (!fs.existsSync(a) || !fs.existsSync(e)) { console.log('manque', code, fs.existsSync(a), fs.existsSync(e)); continue; }
  const mobile = /^XM/.test(code);
  const w = mobile ? 390 : 1440;
  await page.setViewportSize({ width: w * 2 + 48, height: 900 });
  await page.setContent(`<body style="margin:0;background:#2b2622;font:600 15px system-ui;color:#F2EDE3">
    <div style="display:flex;gap:16px;padding:16px;align-items:flex-start">
      <figure style="margin:0;width:${w}px"><figcaption style="padding:0 0 8px">Planche · ${code}</figcaption><img src="${uri(a)}" style="width:${w}px;display:block"></figure>
      <figure style="margin:0;width:${w}px"><figcaption style="padding:0 0 8px">Écran (/admin?ui=2) · ${fichier}</figcaption><img src="${uri(e)}" style="width:${w}px;display:block"></figure>
    </div></body>`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, `${code}-cote-a-cote.jpg`), type: 'jpeg', quality: 72, fullPage: true });
  console.log(code);
}
await b.close();
