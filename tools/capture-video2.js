/*
 * Export MP4 de la vidéo 2 (public/video-2/index.html) — image par image.
 *
 * La page expose window.__seek(t) (timeline déterministe) : on capture donc
 * 30 images/seconde EXACTES, indépendamment de la vitesse de la machine.
 *
 * Usage (après validation visuelle sur la preview) :
 *   1) npm i --no-save playwright-core @ffmpeg-installer/ffmpeg
 *   2) node tools/capture-video2.js            → frames/ (3000 PNG, ~100 s)
 *   3) node -e "const f=require('@ffmpeg-installer/ffmpeg').path;const{execFileSync}=require('child_process');execFileSync(f,['-y','-framerate','30','-i','frames/f%05d.png','-c:v','libx264','-crf','20','-preset','slow','-pix_fmt','yuv420p','-movflags','+faststart','bemexo-video2-16x9.mp4'],{stdio:'inherit'})"
 *
 * (Chromium : utiliser le binaire préinstallé du conteneur ou un Chrome local
 *  via executablePath. Rendu 1920×1080 natif → deviceScaleFactor 1.)
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const FPS = 30;
const OUTDIR = path.join(__dirname, '..', 'frames');
const PAGE = 'file://' + path.join(__dirname, '..', 'public', 'video-2', 'index.html') + '?export=1';

(async () => {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--disable-gpu', '--force-device-scale-factor=1'],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(PAGE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  const DUR = await page.evaluate(() => window.__DUR);
  const total = Math.round(DUR * FPS);
  console.log(`Capture : ${total} images à ${FPS} i/s (${DUR}s)…`);
  for (let i = 0; i < total; i++) {
    await page.evaluate(t => window.__seek(t), i / FPS);
    await page.screenshot({ path: path.join(OUTDIR, `f${String(i).padStart(5, '0')}.png`) });
    if (i % 300 === 0) console.log(`  ${i}/${total} (${Math.round(i / total * 100)} %)`);
  }
  console.log('OK — frames dans', OUTDIR);
  await browser.close();
})();
