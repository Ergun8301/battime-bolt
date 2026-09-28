// Node-side resolution of a composition: loads the comp module, resolves every asset path
// (keys `src`, `dir`, `file`) relative to the comp file, scans image-sequence folders,
// reads image sizes, parses CSV files, and serialises functions so the browser runtime can use them.
const fs = require('fs');
const path = require('path');
const { toUrl } = require('./server');
const { ensureLod } = require('./lod');

const IMG_RE = /\.(jpe?g|png|webp)$/i;

function imageSize(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(64 * 1024);
    const n = fs.readSync(fd, head, 0, head.length, 0);
    const b = head.subarray(0, n);
    if (b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i < b.length - 9) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
        const len = b.readUInt16BE(i + 2);
        i += 2 + len;
      }
      // SOF beyond first 64 KiB: read whole file
      const all = fs.readFileSync(file); let j = 2;
      while (j < all.length - 9) { if (all[j] !== 0xff) { j++; continue; } const m = all[j + 1]; if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) return { height: all.readUInt16BE(j + 5), width: all.readUInt16BE(j + 7) }; j += 2 + all.readUInt16BE(j + 2); }
    }
    if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
      const chunk = b.toString('ascii', 12, 16);
      if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
      if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
      if (chunk === 'VP8L') { const bits = b.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }; }
    }
    const txt = b.toString('utf8');
    if (/<svg[\s>]/i.test(txt)) {
      const vb = /viewBox="\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)/i.exec(txt);
      const w = /<svg[^>]*\swidth="([\d.]+)/i.exec(txt), h = /<svg[^>]*\sheight="([\d.]+)/i.exec(txt);
      if (w && h) return { width: +w[1], height: +h[1] };
      if (vb) return { width: +vb[3], height: +vb[4] };
    }
  } finally { fs.closeSync(fd); }
  return { width: 0, height: 0 };
}

function parseCSV(input) {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const first = text.split(/\r?\n/, 1)[0] || '';
  const count = (d) => first.split(d).length - 1;
  const delim = [';', ',', '\t'].sort((a, b) => count(b) - count(a))[0];
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += ch; }
    else if (ch === '"') inQ = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return { rows: rows.filter((r) => r.some((c) => c !== '')), delim, bom: input.charCodeAt(0) === 0xfeff };
}

const seqCache = new Map();
function scanSeq(dir, useLod = true) {
  const ck = dir + (useLod ? '#lod' : '');
  if (seqCache.has(ck)) return seqCache.get(ck);
  if (!fs.existsSync(dir)) throw new Error('Sequence dir not found: ' + dir);
  const files = fs.readdirSync(dir).filter((f) => IMG_RE.test(f)).sort((a, b) => {
    const na = parseInt(a, 10), nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  if (!files.length) throw new Error('Sequence dir has no images: ' + dir);
  const size = imageSize(path.join(dir, files[0]));
  const out = { url: toUrl(dir), files, count: files.length, width: size.width, height: size.height };
  // half / quarter resolution proxies, chosen per frame by the runtime from the on-screen scale (lib/lod.js)
  out.lod = useLod ? ensureLod(dir, files, size.width, size.height).map((l) => ({ level: l.level, url: toUrl(l.dir), width: l.width, height: l.height })) : [];
  seqCache.set(ck, out);
  return out;
}

function resolveComp(compPath) {
  const abs = path.resolve(compPath);
  delete require.cache[abs];
  let comp = require(abs);
  if (typeof comp === 'function') comp = comp();
  if (comp && comp.default) comp = comp.default;
  const useLod = comp.lod !== false;
  const baseDir = path.dirname(abs);
  const assetsList = []; // for preloading info
  const walk = (node, key) => {
    if (typeof node === 'function') return { __fn: node.toString() };
    if (Array.isArray(node)) return node.map((n) => walk(n, key));
    if (!node || typeof node !== 'object') return node;
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string' && (k === 'src' || k === 'dir' || k === 'file') && !/^(https?:|data:|\/assets\/|\/fs\/)/.test(v)) {
        const p = path.resolve(baseDir, v);
        out[k] = v;
        if (k === 'dir') { out._dir = scanSeq(p, useLod); assetsList.push(p); }
        else if (k === 'src') { if (!fs.existsSync(p)) throw new Error('Image not found: ' + p); out._src = Object.assign({ url: toUrl(p) }, imageSize(p)); assetsList.push(p); }
        else if (k === 'file') { if (!fs.existsSync(p)) throw new Error('File not found: ' + p); const buf = fs.readFileSync(p, 'utf8'); out._file = Object.assign({ url: toUrl(p), name: path.basename(p) }, /\.(csv|tsv|txt)$/i.test(p) ? parseCSV(buf) : {}); }
      } else out[k] = walk(v, k);
    }
    return out;
  };
  const resolved = walk(comp);
  resolved.fps = resolved.fps || 30;
  resolved.width = resolved.width || 1920;
  resolved.height = resolved.height || 1080;
  if (!resolved.layers && resolved.scenes) resolved.layers = resolved.scenes;
  if (!resolved.layers) throw new Error('Composition has no layers/scenes');
  if (!resolved.durationInFrames) {
    resolved.durationInFrames = resolved.layers.reduce((m, l) => Math.max(m, (l.from || 0) + (l.duration || 0)), 0);
  }
  return { comp: resolved, compPath: abs, assets: assetsList };
}

module.exports = { resolveComp, imageSize, parseCSV, scanSeq };
