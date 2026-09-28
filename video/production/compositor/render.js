#!/usr/bin/env node
/* BEMEXO compositor — deterministic frame renderer.
 *
 *   node render.js <comp.js> --out out.mp4 [--from N --to M] [--workers 2]
 *                  [--stills 0,45,300 --stills-dir dir [--stills-format png|jpg]]
 *                  [--contact-sheet sheet.png [--sheet-count 24 | --sheet-frames 0,30,...]]
 *                  [--crf 16] [--preset slow] [--quality 95] [--draft]
 *
 * Each frame: window.renderFrame(f) sets the DOM purely from f, waits for every <img> decode,
 * then a CDP JPEG screenshot (q95) is piped to ffmpeg (image2pipe -> libx264 yuv420p, 30 fps).
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { once } = require('events');
const { chromium } = require('playwright-core');
const { resolveComp } = require('./lib/resolve');
const server = require('./lib/server');

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FFMPEG = process.env.FFMPEG || path.resolve(__dirname, '../pyff/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2');

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) { const k = t.slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; a[k] = v; }
    else a._.push(t);
  }
  return a;
}
const STATS = { reused: 0 };
const NO_REUSE = !!process.env.NO_REUSE; // debug: always take a real screenshot
const numList = (s) => (s ? String(s).split(',').filter(Boolean).map((x) => parseInt(x, 10)) : []);

async function launch() {
  return chromium.launch({
    executablePath: CHROME,
    args: ['--disable-lcd-text', '--force-color-profile=srgb', '--hide-scrollbars', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--font-render-hinting=none', '--disable-features=PaintHolding,OptimizationHints,MediaRouter,Translate', '--no-first-run', '--mute-audio',
      // Zero network: Chrome's own background services (component updater, variations…) otherwise try
      // www.google.com / redirector.gvt1.com at startup through the environment proxy. A dead proxy makes every
      // non-loopback connection fail locally; loopback (the compositor server) is never proxied.
      '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>;127.0.0.1;localhost', '--disable-background-networking', '--disable-component-update',
      '--disable-domain-reliability', '--disable-client-side-phishing-detection', '--disable-sync', '--no-pings', '--no-default-browser-check',
      // Determinism: without this, Chromium re-rasters only the invalidated part of a tile and the result depends on
      // which frames were rendered before (±2 levels in whole 256 px tiles, 53-60 dB). With it, a frame renders the
      // same whether it is reached sequentially, by random access or by another worker (residual: ≤1 level on a few
      // edge pixels of elements that moved earlier, ~72 dB).
      '--disable-partial-raster',
      ...(process.env.CHROME_ARGS || '').split(' ').filter(Boolean)],
  });
}

async function openPage(browser, origin, comp) {
  const ctx = await browser.newContext({ viewport: { width: comp.width, height: comp.height }, deviceScaleFactor: 1, serviceWorkers: 'block', reducedMotion: 'no-preference' });
  // hard network guard: only the local compositor server
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(origin) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('[console]', m.text()); });
  await page.goto(origin + '/runtime/index.html');
  await page.evaluate((c) => window.R.load(c), comp);
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, cdp };
}

// Renders frame f and returns its encoded capture. When renderFrame() reports that nothing changed in the DOM
// since the previous capture on this page (same format), the previous buffer is reused: pixel-identical, no screenshot.
async function capture(p, f, quality, format) {
  const dirty = await p.page.evaluate((fr) => window.renderFrame(fr).then(() => window.R.dirty), f);
  const key = (format || 'jpeg') + (format === 'png' ? '' : quality);
  if (!dirty && !NO_REUSE && p.last && p.lastKey === key) { STATS.reused++; return p.last; }
  const r = await p.cdp.send('Page.captureScreenshot', { format: format || 'jpeg', quality: format === 'png' ? undefined : quality, optimizeForSpeed: true, captureBeyondViewport: false, fromSurface: true });
  p.last = Buffer.from(r.data, 'base64'); p.lastKey = key;
  return p.last;
}

function startFfmpeg(out, fps, opts) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-vf', 'scale=in_range=full:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p',
    '-c:v', 'libx264', '-preset', opts.preset || 'slow', '-crf', String(opts.crf || 16), '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-threads', String(opts.threads || 2), '-r', String(fps), '-movflags', '+faststart', out];
  const ff = spawn(FFMPEG, args, { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))));
  return { ff, done };
}

async function renderRange({ browser, origin, comp, from, to, out, opts, keep, onProgress }) {
  const p = await openPage(browser, origin, comp);
  const { ff, done } = out ? startFfmpeg(out, comp.fps, opts) : { ff: null, done: Promise.resolve() };
  const kept = new Map();
  for (let f = from; f < to; f++) {
    const buf = await capture(p, f, opts.quality);
    if (keep.has(f)) kept.set(f, buf);
    if (ff && !ff.stdin.write(buf)) await once(ff.stdin, 'drain');
    onProgress && onProgress(f);
  }
  if (ff) ff.stdin.end();
  await done;
  await p.ctx.close();
  return kept;
}

async function contactSheet(browser, frames, comp, file) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const cols = 4, tw = 460, th = Math.round((tw * comp.height) / comp.width);
  const cells = [...frames.entries()].sort((a, b) => a[0] - b[0]).map(([f, buf]) =>
    `<figure><img src="data:image/jpeg;base64,${buf.toString('base64')}" width="${tw}" height="${th}"><figcaption>f ${f} · ${(f / comp.fps).toFixed(2)} s</figcaption></figure>`).join('');
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#15120F;font:600 14px monospace;color:#F2EDE3">
    <div style="display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:14px;padding:16px;width:max-content">${cells}</div>
    <style>figure{margin:0}figcaption{padding:6px 2px 0;color:#BDB4A2}img{display:block;border-radius:4px}</style></body></html>`);
  await page.waitForTimeout(50);
  await page.screenshot({ path: file, fullPage: true });
  await ctx.close();
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const compPath = a._[0];
  if (!compPath) { console.error('usage: node render.js <comp.js> --out out.mp4 [--from N --to M] [--stills 0,45 --stills-dir dir] [--contact-sheet sheet.png] [--workers N]'); process.exit(2); }
  const { comp } = resolveComp(compPath);
  const from = a.from !== undefined ? parseInt(a.from, 10) : 0;
  const to = a.to !== undefined ? Math.min(parseInt(a.to, 10), comp.durationInFrames) : comp.durationInFrames;
  const stills = numList(a.stills);
  // --draft: fast preview encode (x264 veryfast, crf 20, JPEG q85 captures) for timeline iteration; final = medium/16/95 (x264 medium vs slow at crf 16: 54.3 vs 55.4 dB against the same source, same size, 30 % less encode CPU)
  const draft = !!a.draft;
  const opts = { crf: a.crf || (draft ? 20 : 16), preset: a.preset || (draft ? 'veryfast' : 'medium'), quality: parseInt(a.quality || (draft ? 85 : 95), 10) };
  // 2 pages in parallel by default for real encodes (measured on this shared 4-CPU VM: 9.0 -> 11.8 fps on the demo);
  // short ranges stay on 1 page. --workers 1 forces a single page.
  const workers = Math.max(1, parseInt(a.workers || (a.out && to - from >= 150 ? 2 : 1), 10));
  let sheetFrames = numList(a['sheet-frames']);
  if (a['contact-sheet'] && !sheetFrames.length) {
    const n = parseInt(a['sheet-count'] || 24, 10);
    for (let i = 0; i < n; i++) sheetFrames.push(Math.min(to - 1, Math.round(from + ((to - 1 - from) * i) / (n - 1))));
  }
  const keep = new Set([...stills, ...sheetFrames]);
  const { server: srv, origin } = await server.start(0);
  const browser = await launch();
  const t0 = Date.now();
  let kept = new Map();
  let rendered = 0;
  try {
    if (a.out) {
      const out = path.resolve(a.out);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const total = to - from;
      let last = 0;
      const onProgress = () => { rendered++; const now = Date.now(); if (now - last > 5000) { last = now; process.stderr.write(`  ${rendered}/${total} frames · ${(rendered / ((now - t0) / 1000)).toFixed(2)} fps\n`); } };
      if (workers === 1) kept = await renderRange({ browser, origin, comp, from, to, out, opts: Object.assign({ threads: 3 }, opts), keep, onProgress });
      else {
        const chunk = Math.ceil(total / workers);
        const tmpDir = fs.mkdtempSync(path.join(path.dirname(out), '.segs-'));
        const jobs = [];
        for (let w = 0; w < workers; w++) {
          const s = from + w * chunk, e = Math.min(to, s + chunk);
          if (s >= e) break;
          jobs.push(renderRange({ browser, origin, comp, from: s, to: e, out: path.join(tmpDir, `seg${w}.mp4`), opts: Object.assign({ threads: 1 }, opts), keep, onProgress }).then((m) => ({ w, m })));
        }
        const res = await Promise.all(jobs);
        for (const { m } of res) for (const [k, v] of m) kept.set(k, v);
        const list = path.join(tmpDir, 'list.txt');
        fs.writeFileSync(list, res.sort((x, y) => x.w - y.w).map(({ w }) => `file '${path.join(tmpDir, `seg${w}.mp4`)}'`).join('\n'));
        await new Promise((res2, rej) => spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out], { stdio: 'inherit' }).on('close', (c) => (c === 0 ? res2() : rej(new Error('concat failed')))));
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } else if (keep.size) {
      const p = await openPage(browser, origin, comp);
      for (const f of [...keep].sort((x, y) => x - y)) { kept.set(f, await capture(p, f, opts.quality)); rendered++; }
      if (a['stills-format'] === 'png') for (const f of stills) kept.set('png' + f, await capture(p, f, 0, 'png'));
      await p.ctx.close();
    }
    const secs = (Date.now() - t0) / 1000;
    if (stills.length) {
      const dir = path.resolve(a['stills-dir'] || 'stills');
      fs.mkdirSync(dir, { recursive: true });
      for (const f of stills) {
        const png = kept.get('png' + f);
        fs.writeFileSync(path.join(dir, `f${String(f).padStart(5, '0')}.${png ? 'png' : 'jpg'}`), png || kept.get(f));
      }
      console.log('stills ->', dir);
    }
    if (a['contact-sheet']) {
      const m = new Map(); for (const f of sheetFrames) if (kept.has(f)) m.set(f, kept.get(f));
      await contactSheet(browser, m, comp, path.resolve(a['contact-sheet']));
      console.log('contact sheet ->', path.resolve(a['contact-sheet']));
    }
    console.log(JSON.stringify({ frames: rendered, reusedStatic: STATS.reused, seconds: +secs.toFixed(2), fps: +(rendered / secs).toFixed(2), out: a.out ? path.resolve(a.out) : null, durationInFrames: comp.durationInFrames }));
  } finally {
    await browser.close();
    srv.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
