// Procedural construction-site photos (fictional, no people / text / plates / logos).
// node assets/tools/gen-photos.js [1,2,3] [--sheet preview.png]
const path = require('path');
const fs = require('fs');
const { chromium } = require('../../compositor/node_modules/playwright-core');
const OUT = path.resolve(__dirname, '../photos');
const args = process.argv.slice(2);
const which = (args[0] && !args[0].startsWith('--') ? args[0].split(',').map(Number) : Array.from({ length: 12 }, (_, i) => i + 1));
const sheetIdx = args.indexOf('--sheet');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--disable-lcd-text', '--force-color-profile=srgb', '--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.route(/^https?:/, (r) => r.abort());
  await page.goto('file://' + path.join(__dirname, 'photos/photos.html'));
  const files = [];
  for (const i of which) {
    const t0 = Date.now();
    await page.evaluate((n) => window.SCENES[n](), i);
    await page.waitForTimeout(80);
    const f = path.join(OUT, 'chantier-' + String(i).padStart(2, '0') + '.jpg');
    await page.locator('#wrap').screenshot({ path: f, type: 'jpeg', quality: 90 });
    files.push(f);
    console.log(path.basename(f), Date.now() - t0, 'ms');
  }
  if (sheetIdx >= 0) {
    const p2 = await browser.newPage({ viewport: { width: 1640, height: 900 } });
    const cells = files.map((f) => `<figure><img src="data:image/jpeg;base64,${fs.readFileSync(f).toString('base64')}"><figcaption>${path.basename(f)}</figcaption></figure>`).join('');
    await p2.setContent(`<body style="margin:0;background:#222;color:#ddd;font:13px monospace"><div style="display:grid;grid-template-columns:repeat(4,400px);gap:8px;padding:8px">${cells}</div><style>figure{margin:0}img{width:400px;height:300px;display:block}</style></body>`);
    await p2.screenshot({ path: args[sheetIdx + 1], fullPage: true });
  }
  await browser.close();
})();
