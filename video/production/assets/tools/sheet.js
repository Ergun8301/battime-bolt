// tiny helper: montage of images -> png (for quick visual checks)
const fs = require('fs'); const path = require('path');
const { chromium } = require('../../compositor/node_modules/playwright-core');
(async () => {
  const [out, ...files] = process.argv.slice(2);
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1300, height: 400 } });
  const cells = files.map((f) => `<figure><img src="data:image/jpeg;base64,${fs.readFileSync(f).toString('base64')}"><figcaption>${path.basename(f)}</figcaption></figure>`).join('');
  await p.setContent(`<body style="margin:0;background:#222;color:#ddd;font:12px monospace"><div style="display:grid;grid-template-columns:repeat(3,420px);gap:6px;padding:6px">${cells}</div><style>figure{margin:0}img{width:420px;display:block}</style></body>`);
  await p.screenshot({ path: out, fullPage: true }); await b.close();
})();
