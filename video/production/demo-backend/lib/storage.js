'use strict';
// Fake Supabase Storage. Fixture objects point at local asset files that are
// resolved at request time (so photos generated later by another agent are
// picked up without a reset); uploads are kept in memory.

const fs = require('fs');
const path = require('path');

const SCRATCH = path.resolve(__dirname, '..', '..');
const ASSETS = path.join(SCRATCH, 'assets');
const STATIC = path.resolve(__dirname, '..', 'static');

const objects = new Map(); // "bucket/path" -> { bytes?: Buffer, asset?: string, fallback: 'jpg'|'pdf'|'svg', contentType }

function reset(fixtureObjects) {
  objects.clear();
  for (const o of fixtureObjects) objects.set(`${o.bucket}/${o.path}`, { asset: o.asset, fallback: o.fallback, contentType: o.contentType, title: o.title });
}

// ─── fallbacks ───────────────────────────────────────────────────────────────
let placeholderJpg = null;
function placeholderJpeg() {
  if (!placeholderJpg) placeholderJpg = fs.readFileSync(path.join(STATIC, 'placeholder.jpg'));
  return placeholderJpg;
}

/** A tiny but valid one-page PDF with a title line. */
function tinyPdf(title) {
  const txt = String(title || 'Document de démonstration').replace(/[()\\]/g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const stream = `BT /F1 22 Tf 72 760 Td (${txt}) Tj ET\nBT /F1 11 Tf 72 736 Td (Document fictif - donnees de demonstration) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
<rect width="256" height="256" rx="56" fill="#15120F"/>
<text x="128" y="160" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="104" font-weight="900" fill="#FFC21A">DR</text>
</svg>`;

function readObject(bucket, p) {
  const key = `${bucket}/${p}`;
  const o = objects.get(key);
  if (!o) return null;
  if (o.bytes) return { bytes: o.bytes, contentType: o.contentType || 'application/octet-stream' };
  if (o.asset) {
    const file = path.join(ASSETS, o.asset);
    try { return { bytes: fs.readFileSync(file), contentType: o.contentType, source: `assets/${o.asset}` }; } catch { /* fallback below */ }
  }
  if (o.fallback === 'pdf') return { bytes: tinyPdf(o.title || path.basename(p)), contentType: 'application/pdf', source: 'fallback-pdf' };
  if (o.fallback === 'svg') return { bytes: Buffer.from(LOGO_SVG), contentType: 'image/svg+xml', source: 'fallback-svg' };
  return { bytes: placeholderJpeg(), contentType: 'image/jpeg', source: 'fallback-jpg' };
}

function writeObject(bucket, p, bytes, contentType, { upsert = false } = {}) {
  const key = `${bucket}/${p}`;
  if (objects.has(key) && !upsert) return { error: 'Duplicate', status: 409 };
  objects.set(key, { bytes, contentType });
  return { ok: true };
}

function removeObjects(bucket, prefixes) {
  const out = [];
  for (const p of prefixes || []) {
    const key = `${bucket}/${p}`;
    if (objects.delete(key)) out.push({ name: p, bucket_id: bucket, id: null });
  }
  return out;
}

/** Minimal multipart/form-data parser: returns the first part that carries a file (or the last part). */
function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) return null;
  const boundary = Buffer.from(`--${m[1] || m[2]}`);
  const parts = [];
  let idx = buf.indexOf(boundary);
  while (idx >= 0) {
    const start = idx + boundary.length;
    if (buf.slice(start, start + 2).toString() === '--') break;
    const next = buf.indexOf(boundary, start);
    if (next < 0) break;
    const part = buf.slice(start + 2, next - 2); // skip CRLF after boundary, drop CRLF before next
    const sep = part.indexOf('\r\n\r\n');
    if (sep >= 0) {
      const head = part.slice(0, sep).toString('utf8');
      const body = part.slice(sep + 4);
      const name = (/name="([^"]*)"/i.exec(head) || [])[1];
      const filename = (/filename="([^"]*)"/i.exec(head) || [])[1];
      const ctype = (/content-type:\s*([^\r\n]+)/i.exec(head) || [])[1];
      parts.push({ name, filename, contentType: ctype, body });
    }
    idx = next;
  }
  return parts.find((x) => x.filename !== undefined) || parts.find((x) => x.name === '') || parts[parts.length - 1] || null;
}

module.exports = { reset, readObject, writeObject, removeObjects, parseMultipart, tinyPdf, objects, LOGO_SVG, ASSETS };
