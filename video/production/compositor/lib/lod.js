// Level-of-detail proxies for big image sequences (render speed).
//
// A 3200x1800 capture shown in a 1440 px wide box is drawn at scale 0.45: Chromium decodes the full 5.8 MP JPEG
// every frame and then samples its half-size mip level anyway. We pre-build that half-size level once
// (ffmpeg, box/area filter = the same 2x2 average as a mip level) and the runtime picks, per frame, the smallest
// level that is still drawn at a scale <= 1 (never upscaled). The on-screen result is visually identical
// (measured 41-46 dB PSNR against the full-res path, differences = sub-pixel filtering) and big sequences decode
// 4x (level 1) or 16x (level 2) fewer pixels.
//
// Cache: compositor/.cache/lod/<hash of dir>/L1, L2 (frames renamed 000001.jpg… by index). It is rebuilt when a
// source file is added, removed, resized or touched. Disable with NO_LOD=1 or `lod: false` in the comp.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const FFMPEG = process.env.FFMPEG || path.resolve(__dirname, '../../pyff/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2');
const CACHE = path.resolve(__dirname, '../.cache/lod');
const MIN_PIXELS = 2.5e6; // below this (e.g. 1600x1200 photos) decoding is cheap enough
const MIN_LEVEL_PIXELS = 0.35e6; // do not build levels smaller than this
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

function ffmpeg(args) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + (r.stderr || '').toString().slice(0, 400));
}

function countFiles(dir) { return fs.readdirSync(dir).filter((f) => /\.jpg$/.test(f)).length; }

/**
 * Returns [{level, dir, width, height}] for a sequence, building the proxies if needed.
 * files: sorted file names in `dir`; width/height: source size.
 */
function ensureLod(dir, files, width, height) {
  if (process.env.NO_LOD || !width || !height || width * height < MIN_PIXELS) return [];
  const exts = new Set(files.map((f) => path.extname(f).toLowerCase()));
  if (exts.size !== 1) return [];
  const ext = [...exts][0];
  const sig = files.map((f) => { const st = fs.statSync(path.join(dir, f)); return f + ':' + st.size + ':' + Math.round(st.mtimeMs); }).join('|');
  const hash = sha1(sig + '|' + width + 'x' + height + '|v1');
  const base = path.join(CACHE, sha1(path.resolve(dir)).slice(0, 20));
  const manifestFile = path.join(base, 'manifest.json');
  try {
    const m = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    if (m.hash === hash && m.levels.every((l) => fs.existsSync(path.join(base, 'L' + l.level)))) return m.levels.map((l) => Object.assign({}, l, { dir: path.join(base, 'L' + l.level) }));
  } catch (e) { /* no cache yet */ }

  const t0 = Date.now();
  process.stderr.write(`[lod] building proxies for ${dir} (${files.length} frames ${width}x${height})… `);
  const tmp = base + '.tmp-' + process.pid;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
  // image2 needs a contiguous numbered pattern: symlink the (numerically sorted) files as 000001.ext…
  files.forEach((f, i) => fs.symlinkSync(path.resolve(dir, f), path.join(tmp, 'src', String(i + 1).padStart(6, '0') + ext)));
  const levels = [];
  let prevDir = path.join(tmp, 'src'), prevExt = ext, w = width, h = height;
  for (let level = 1; level <= 2; level++) {
    const nw = Math.floor(w / 2), nh = Math.floor(h / 2);
    if (nw * nh < MIN_LEVEL_PIXELS) break;
    const out = path.join(tmp, 'L' + level);
    fs.mkdirSync(out);
    ffmpeg(['-threads', '2', '-f', 'image2', '-framerate', '30', '-i', path.join(prevDir, '%06d' + prevExt),
      '-vf', `scale=${nw}:${nh}:flags=area`, '-q:v', '2', '-start_number', '1', path.join(out, '%06d.jpg')]);
    if (countFiles(out) !== files.length) throw new Error(`[lod] ${out}: expected ${files.length} frames, got ${countFiles(out)}`);
    levels.push({ level, width: nw, height: nh });
    prevDir = out; prevExt = '.jpg'; w = nw; h = nh;
  }
  fs.rmSync(path.join(tmp, 'src'), { recursive: true, force: true });
  fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify({ source: path.resolve(dir), hash, levels }, null, 1));
  // publish (a concurrent render may have built the same cache meanwhile: keep the one already in place)
  try {
    const m = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    if (m.hash === hash) { fs.rmSync(tmp, { recursive: true, force: true }); process.stderr.write('already built by another render\n'); return m.levels.map((l) => Object.assign({}, l, { dir: path.join(base, 'L' + l.level) })); }
  } catch (e) { /* not there */ }
  fs.rmSync(base, { recursive: true, force: true });
  try { fs.renameSync(tmp, base); } catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); }
  process.stderr.write(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
  return levels.map((l) => Object.assign({}, l, { dir: path.join(base, 'L' + l.level) }));
}

module.exports = { ensureLod, CACHE };
