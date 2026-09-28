'use strict';
// BEMEXO demo backend — ONE local server on http://localhost:4600:
//   • serves the static export app/out with clean URLs;
//   • fakes Supabase under /sb (PostgREST, RPC, GoTrue, Storage, Functions)
//     over an in-memory store seeded by fixtures.js;
//   • exposes a control API under /__demo (reset / clock / log / state / session).
// No external service, no proxying, nothing leaves this process.

const http = require('http');
const fs = require('fs');
const path = require('path');

const T = require('./lib/time');
const db = require('./lib/db');
const pg = require('./lib/postgrest');
const { FNS, VOID, SELF_HEAL, worksiteLabour } = require('./lib/rpc');
const auth = require('./lib/auth');
const storage = require('./lib/storage');
const { FUNCTIONS, outbox } = require('./lib/functions');
const fixtures = require('./fixtures');

const PORT = Number(process.env.DEMO_PORT || 4600);
const OUT = path.resolve(process.env.DEMO_OUT || path.join(__dirname, '..', 'app', 'out'));

// ─── request log ─────────────────────────────────────────────────────────────
let LOG = [];
let SEQ = 0;
let SCENE = null;
const QUIET = new Set(['/__demo/log', '/__demo/health', '/__demo/state', '/__demo/scenes']);
const NAME_BY_ID = () => Object.fromEntries(db.rows('users').map((u) => [u.id, `${u.first_name}`.toLowerCase()]));

function logReq(e) {
  e.i = ++SEQ;
  LOG.push(e);
  if (LOG.length > 20000) LOG = LOG.slice(-15000);
  if (e.flag && e.flag !== 'self-heal') {
    console.error(`\x1b[31m[DEMO ${e.flag.toUpperCase()}]\x1b[0m ${e.method} ${e.path} -> ${e.status} ${e.note || ''}`);
  } else if (e.flag === 'self-heal') {
    console.warn(`[demo self-heal] ${e.method} ${e.path} ${e.note || ''}`);
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'authorization,apikey,content-type,prefer,accept,accept-profile,content-profile,range,x-client-info,x-upsert,x-supabase-api-version,x-region,cache-control,x-retry-count',
  'Access-Control-Expose-Headers': 'Content-Range,Content-Location,X-Supabase-Api-Version',
  'Access-Control-Max-Age': '86400',
};

function send(res, status, body, headers = {}) {
  const h = { ...CORS, ...headers };
  if (body !== '' && body !== undefined && body !== null && !h['Content-Type']) h['Content-Type'] = 'application/json; charset=utf-8';
  res.writeHead(status, h);
  res.end(body === undefined || body === null ? '' : body);
}
const sendJson = (res, status, obj, headers = {}) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', ...headers });

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function unsupported(res, e, note) {
  e.flag = 'unsupported';
  e.note = note;
  e.status = 501;
  sendJson(res, 501, { code: 'DEMO501', message: `Demo backend: not implemented — ${note}`, details: null, hint: 'Extend demo-backend (see README).' });
}

// ─── budgets: calibrated on the scene's own history ──────────────────────────
function calibrateBudgets() {
  const used = new Map();
  for (const r of worksiteLabour(fixtures.COMPANY_ID, null, null)) used.set(r.worksite_id, (used.get(r.worksite_id) || 0) + r.paid_minutes);
  const out = {};
  for (const [k, s] of Object.entries(fixtures.SITES)) {
    const w = db.rows('worksites').find((x) => x.id === fixtures.W[k]);
    if (!w) continue;
    if (!s.budgetTarget) { w.budget_hours = null; continue; }
    const u = used.get(w.id) || 0;
    w.budget_hours = fixtures.calibrateBudget(u, s.budgetTarget);
    out[s.name] = { used_h: +(u / 60).toFixed(2), budget_h: w.budget_hours, pct: Math.round((u / 60 / w.budget_hours) * 100) };
  }
  return out;
}

function resetScene(scene, nowIso) {
  const b = fixtures.build(scene);
  db.load(b.tables);
  storage.reset(b.storage);
  const budgets = calibrateBudgets();
  const nowMs = nowIso ? Date.parse(nowIso) : b.nowMs;
  if (!Number.isFinite(nowMs)) throw new Error(`bad now: ${nowIso}`);
  T.clock.set(nowMs);
  LOG = [];
  outbox.length = 0;
  SCENE = { scene, title: b.title, presetNow: T.iso(b.nowMs), clock: T.iso(nowMs), budgets };
  return SCENE;
}

// ─── /sb handlers ────────────────────────────────────────────────────────────
function handleRest(req, res, u, body, c, e) {
  const rest = u.pathname.slice('/sb/rest/v1/'.length);
  if (rest.startsWith('rpc/')) {
    const fn = rest.slice(4);
    const impl = FNS[fn];
    if (!impl) return unsupported(res, e, `rpc ${fn}`);
    let args = {};
    if (req.method === 'POST') {
      if (body.length) { try { args = JSON.parse(body.toString('utf8')); } catch { throw new db.PgError('PGRST102', 'Empty or invalid json'); } }
    } else if (req.method === 'GET') args = Object.fromEntries(u.searchParams);
    else return unsupported(res, e, `rpc ${fn} with ${req.method}`);
    if (SELF_HEAL.has(fn)) { e.flag = 'self-heal'; e.note = JSON.stringify(args); }
    const out = impl(args, c);
    e.status = out === VOID ? 204 : 200;
    if (out === VOID) return send(res, 204, '');
    if (/vnd\.pgrst\.object\+json/.test(req.headers.accept || '') && Array.isArray(out)) {
      if (out.length !== 1) throw new db.PgError('PGRST116', 'JSON object requested, multiple (or no) rows returned', { details: `The result contains ${out.length} rows`, status: 406 });
      return sendJson(res, 200, out[0]);
    }
    return sendJson(res, 200, out);
  }
  if (rest === '' || rest.includes('/')) return unsupported(res, e, `rest path /${rest}`);
  const r = pg.handleTable(req.method, rest, u, req.headers, body.length ? body.toString('utf8') : '', c);
  e.status = r.status;
  return send(res, r.status, r.body, r.headers);
}

function handleAuth(req, res, u, body, c, e) {
  const p = u.pathname.slice('/sb/auth/v1/'.length);
  const hdr = { 'X-Supabase-Api-Version': '2024-01-01' };
  const json = () => { try { return body.length ? JSON.parse(body.toString('utf8')) : {}; } catch { return {}; } };
  const err = (status, code, msg) => { e.status = status; return sendJson(res, status, { code, error_code: code, msg, message: msg }, hdr); };

  if (p === 'token' && req.method === 'POST') {
    const gt = u.searchParams.get('grant_type');
    const b = json();
    let user = null;
    if (gt === 'password') user = auth.findUserByEmail(b.email);
    else if (gt === 'refresh_token') {
      const m = /^demo-refresh-(.+)$/.exec(String(b.refresh_token || ''));
      user = m ? db.rows('users').find((x) => x.id === m[1]) : null;
      if (!user) return err(400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
    } else return unsupported(res, e, `auth grant_type=${gt}`);
    if (!user) return err(400, 'invalid_credentials', 'Invalid login credentials');
    e.status = 200;
    e.note = `session for ${user.email}`;
    return sendJson(res, 200, auth.sessionFor(user), hdr);
  }
  if (p === 'user' && (req.method === 'GET' || req.method === 'PUT')) {
    if (!c.user) return err(403, 'bad_jwt', 'invalid JWT: unable to parse or verify signature');
    e.status = 200;
    return sendJson(res, 200, auth.authUser(c.user), hdr);
  }
  if (p === 'logout' && req.method === 'POST') { e.status = 204; return send(res, 204, '', hdr); }
  if ((p === 'recover' || p === 'resend' || p === 'otp') && req.method === 'POST') { e.status = 200; return sendJson(res, 200, {}, hdr); }
  if (p === 'settings' && req.method === 'GET') {
    e.status = 200;
    return sendJson(res, 200, { external: { email: true, phone: false }, disable_signup: true, mailer_autoconfirm: false, phone_autoconfirm: false, sms_provider: '', saml_enabled: false }, hdr);
  }
  return unsupported(res, e, `auth ${req.method} /${p}`);
}

function handleStorage(req, res, u, body, c, e) {
  const p = decodeURIComponent(u.pathname.slice('/sb/storage/v1/'.length));
  const serveObj = (bucket, key) => {
    const o = storage.readObject(bucket, key);
    if (!o) { e.status = 400; e.flag = 'storage-miss'; e.note = `${bucket}/${key}`; return sendJson(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' }); }
    e.status = 200; e.note = o.source;
    return send(res, 200, req.method === 'HEAD' ? '' : o.bytes, { 'Content-Type': o.contentType, 'Content-Length': String(o.bytes.length), 'Cache-Control': 'max-age=3600' });
  };
  let m;
  if ((m = /^object\/sign\/([^/]+)$/.exec(p)) && req.method === 'POST') {
    const bucket = m[1];
    const b = JSON.parse(body.toString('utf8') || '{}');
    if (!c.user) { e.status = 400; return sendJson(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'Unauthorized' }); }
    const out = (b.paths || []).map((key) => {
      const ok = String(key).startsWith(`${c.company}/`) && storage.readObject(bucket, key);
      return ok ? { path: key, signedURL: `/object/sign/${bucket}/${key}?token=demo-${c.uid.slice(0, 8)}`, error: null }
        : { path: key, signedURL: null, error: 'Either the object does not exist or you do not have access to it' };
    });
    e.status = 200;
    return sendJson(res, 200, out);
  }
  if ((m = /^object\/sign\/([^/]+)\/(.+)$/.exec(p))) {
    const [, bucket, key] = m;
    if (req.method === 'POST') {
      if (!c.user || !storage.readObject(bucket, key)) { e.status = 400; return sendJson(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' }); }
      e.status = 200;
      return sendJson(res, 200, { signedURL: `/object/sign/${bucket}/${key}?token=demo-${c.uid.slice(0, 8)}` });
    }
    if (req.method === 'GET' || req.method === 'HEAD') return serveObj(bucket, key);
  }
  if ((m = /^object\/(public|authenticated)\/([^/]+)\/(.+)$/.exec(p)) && (req.method === 'GET' || req.method === 'HEAD')) return serveObj(m[2], m[3]);
  if ((m = /^object\/([^/]+)$/.exec(p)) && req.method === 'DELETE') {
    const b = JSON.parse(body.toString('utf8') || '{}');
    if (!c.user) { e.status = 400; return sendJson(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'Unauthorized' }); }
    const out = storage.removeObjects(m[1], b.prefixes);
    e.status = 200; e.note = `removed ${out.length}`;
    return sendJson(res, 200, out);
  }
  if ((m = /^object\/([^/]+)\/(.+)$/.exec(p)) && (req.method === 'POST' || req.method === 'PUT')) {
    const [, bucket, key] = m;
    if (!c.user) { e.status = 400; return sendJson(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' }); }
    let bytes = body; let ctype = req.headers['content-type'] || 'application/octet-stream';
    let fileName = null;
    if (/multipart\/form-data/i.test(ctype)) {
      const part = storage.parseMultipart(body, ctype);
      if (!part) return unsupported(res, e, 'unparsable multipart upload');
      bytes = part.body; ctype = part.contentType || 'application/octet-stream'; fileName = part.filename || null;
    }
    // A DISK file given to Playwright's setInputFiles reaches a route.fetch() proxy
    // with its multipart part EMPTY (Chromium does not expose file-backed bodies to
    // interception). When the part still names a file that exists in ../assets
    // (e.g. chantier-01.jpg), store those bytes instead of a 0-byte object.
    let substituted = null;
    if (!bytes.length && fileName) {
      const a = storage.assetByName(fileName);
      if (a) { bytes = a.bytes; substituted = a.rel; if (ctype === 'application/octet-stream') ctype = a.contentType; }
    }
    const upsert = req.method === 'PUT' || String(req.headers['x-upsert'] || '') === 'true';
    const r = storage.writeObject(bucket, key, bytes, ctype, { upsert });
    if (r.error) { e.status = 400; return sendJson(res, 400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' }); }
    e.status = 200; e.note = `stored ${bytes.length} bytes (${ctype})${substituted ? ` — empty part "${fileName}" (proxied disk file) → ${substituted}` : ''}`;
    if (!bytes.length) e.flag = 'empty-upload';
    return sendJson(res, 200, { Key: `${bucket}/${key}`, Id: db.uuid() });
  }
  if ((m = /^object\/([^/]+)\/(.+)$/.exec(p)) && (req.method === 'GET' || req.method === 'HEAD')) return serveObj(m[1], m[2]);
  return unsupported(res, e, `storage ${req.method} /${p}`);
}

function handleFunctions(req, res, u, body, c, e) {
  const name = u.pathname.slice('/sb/functions/v1/'.length);
  const fn = FUNCTIONS[name];
  if (!fn) return unsupported(res, e, `function ${name}`);
  let b = {};
  try { b = body.length ? JSON.parse(body.toString('utf8')) : {}; } catch { b = {}; }
  const r = fn(b, c);
  e.status = r.status;
  e.note = `function ${name}`;
  return sendJson(res, r.status, r.body);
}

// ─── control API ─────────────────────────────────────────────────────────────
function handleDemo(req, res, u, body, e) {
  const p = u.pathname;
  const q = Object.fromEntries(u.searchParams);
  const json = () => { try { return body.length ? JSON.parse(body.toString('utf8')) : {}; } catch { return {}; } };
  if (p === '/__demo/reset' && (req.method === 'POST' || req.method === 'GET')) {
    const b = { ...q, ...json() };
    const scene = b.scene || 's1';
    if (!fixtures.SCENES[scene]) { e.status = 400; return sendJson(res, 400, { error: `unknown scene ${scene}`, scenes: Object.keys(fixtures.SCENES) }); }
    const info = resetScene(scene, b.now);
    e.status = 200;
    return sendJson(res, 200, { ok: true, ...info });
  }
  if (p === '/__demo/clock') {
    if (req.method === 'POST') {
      const b = { ...q, ...json() };
      const ms = Date.parse(b.now);
      if (!Number.isFinite(ms)) { e.status = 400; return sendJson(res, 400, { error: 'now must be an ISO timestamp (with offset)' }); }
      T.clock.set(ms, { frozen: b.frozen === true || b.frozen === 'true' });
    }
    e.status = 200;
    return sendJson(res, 200, { now: T.clock.nowIso(), paris: `${T.clock.today()} ${T.parisTime(T.clock.now())}`, frozen: T.clock.frozen });
  }
  if (p === '/__demo/log') {
    let list = LOG;
    if (q.since) list = list.filter((x) => x.i > Number(q.since));
    if (q.flagged) list = list.filter((x) => x.flag);
    if (q.sb) list = list.filter((x) => x.path.startsWith('/sb/'));
    const flagged = LOG.filter((x) => x.flag && x.flag !== 'self-heal');
    return sendJson(res, 200, { scene: SCENE, count: LOG.length, flaggedCount: flagged.length, unknown501: LOG.filter((x) => x.status === 501).length, unknown: flagged, entries: list });
  }
  if (p === '/__demo/state') {
    if (q.table === '__outbox') return sendJson(res, 200, outbox);
    if (q.table === '__storage') return sendJson(res, 200, [...storage.objects.entries()].map(([k, v]) => ({ key: k, asset: v.asset || null, bytes: v.bytes ? v.bytes.length : null, contentType: v.contentType })));
    if (!q.table) return sendJson(res, 200, { scene: SCENE, clock: T.clock.nowIso(), tables: Object.fromEntries(Object.entries(db.store.tables).map(([k, v]) => [k, v.length])) });
    const rowsOf = db.store.tables[q.table];
    if (!rowsOf) { e.status = 404; return sendJson(res, 404, { error: `unknown table ${q.table}` }); }
    let list = rowsOf;
    for (const [k, v] of Object.entries(q)) if (k !== 'table' && k !== 'limit') list = list.filter((r) => String(r[k]) === v);
    if (q.limit) list = list.slice(0, Number(q.limit));
    return sendJson(res, 200, list);
  }
  if (p === '/__demo/session') {
    const who = q.email || (q.user && fixtures.DEMO_USERS[q.user] && fixtures.DEMO_USERS[q.user].email);
    const user = auth.findUserByEmail(who);
    if (!user) { e.status = 404; return sendJson(res, 404, { error: `no demo user ${who}`, users: fixtures.DEMO_USERS }); }
    e.status = 200;
    return sendJson(res, 200, auth.sessionFor(user));
  }
  if (p === '/__demo/scenes') return sendJson(res, 200, Object.fromEntries(Object.entries(fixtures.SCENES).map(([k, v]) => [k, { now: T.parisIso(...v.now), title: v.title }])));
  if (p === '/__demo/users') return sendJson(res, 200, fixtures.DEMO_USERS);
  if (p === '/__demo/health') return sendJson(res, 200, { ok: true, instance: process.env.DEMO_INSTANCE || null, pid: process.pid, port: PORT, scene: SCENE, clock: T.clock.nowIso(), out: OUT, outExists: fs.existsSync(path.join(OUT, 'index.html')) });
  e.status = 404;
  return sendJson(res, 404, { error: 'unknown control route', routes: ['POST /__demo/reset {scene, now?}', 'POST /__demo/clock {now}', 'GET /__demo/log', 'GET /__demo/state?table=x', 'GET /__demo/session?email=|user=', 'GET /__demo/scenes', 'GET /__demo/users', 'GET /__demo/health'] });
}

// ─── static export ───────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.xml': 'application/xml; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.map': 'application/json; charset=utf-8', '.pdf': 'application/pdf',
};
function fileIfExists(p) { try { const st = fs.statSync(p); return st.isFile() ? p : null; } catch { return null; } }
function serveStatic(req, res, u, e) {
  let p;
  try { p = decodeURIComponent(u.pathname); } catch { e.status = 400; return send(res, 400, 'bad path', { 'Content-Type': 'text/plain' }); }
  if (p.includes('..') || p.includes('\0')) { e.status = 400; return send(res, 400, 'bad path', { 'Content-Type': 'text/plain' }); }
  const base = path.join(OUT, p);
  const cands = p.endsWith('/') ? [path.join(base, 'index.html')] : [base, `${base}.html`, path.join(base, 'index.html')];
  const file = cands.map(fileIfExists).find(Boolean);
  if (!file) {
    e.status = 404; e.flag = 'static-404'; e.note = p;
    const nf = fileIfExists(path.join(OUT, '404.html'));
    return send(res, 404, nf ? fs.readFileSync(nf) : 'Not found', { 'Content-Type': 'text/html; charset=utf-8' });
  }
  const ext = path.extname(file).toLowerCase();
  const data = fs.readFileSync(file);
  const immutable = p.startsWith('/_next/static/');
  e.status = 200;
  return send(res, 200, req.method === 'HEAD' ? '' : data, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': String(data.length),
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-store',
  });
}

// ─── server ──────────────────────────────────────────────────────────────────
async function handler(req, res) {
  const t0 = Date.now();
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const e = { t: T.clock.nowIso(), method: req.method, path: u.pathname + (u.search || ''), status: 0 };
  let body = Buffer.alloc(0);
  try {
    body = await readBody(req);
    if (req.method === 'OPTIONS') { e.status = 204; send(res, 204, ''); return; }
    if (u.pathname.startsWith('/__demo/')) { handleDemo(req, res, u, body, e); return; }
    if (u.pathname === '/sb' || u.pathname.startsWith('/sb/')) {
      const uid = auth.uidFromAuthHeader(req.headers.authorization);
      const c = db.ctxFor(uid);
      e.who = uid ? (NAME_BY_ID()[uid] || uid) : 'anon';
      if (req.method !== 'GET' && req.method !== 'HEAD' && body.length && body.length < 4000 && !/multipart/.test(req.headers['content-type'] || '')) {
        e.body = body.toString('utf8').slice(0, 1500);
      }
      if (u.pathname.startsWith('/sb/rest/v1/')) return handleRest(req, res, u, body, c, e);
      if (u.pathname.startsWith('/sb/auth/v1/')) return handleAuth(req, res, u, body, c, e);
      if (u.pathname.startsWith('/sb/storage/v1/')) return handleStorage(req, res, u, body, c, e);
      if (u.pathname.startsWith('/sb/functions/v1/')) return handleFunctions(req, res, u, body, c, e);
      return unsupported(res, e, `unknown Supabase route ${u.pathname}`);
    }
    return serveStatic(req, res, u, e);
  } catch (err) {
    if (err instanceof pg.Unsupported) return unsupported(res, e, err.message);
    if (err instanceof db.PgError) {
      e.status = err.status;
      e.note = `${err.code} ${err.message}`;
      if (['42703', 'PGRST204', '42P01', 'PGRST202', '428C9'].includes(err.code)) e.flag = 'schema';
      return sendJson(res, err.status, err.toJSON());
    }
    e.status = 500; e.flag = 'server-error'; e.note = String(err && err.stack || err).slice(0, 600);
    return sendJson(res, 500, { code: 'DEMO500', message: String(err && err.message || err), details: null, hint: null });
  } finally {
    e.ms = Date.now() - t0;
    if (!QUIET.has(u.pathname)) logReq(e);
  }
}

if (require.main === module) {
  resetScene(process.env.DEMO_SCENE || 's1');
  // Loopback only, IPv4 and IPv6 (Chromium may try ::1 first for "localhost").
  const hosts = process.env.DEMO_HOST ? [process.env.DEMO_HOST] : ['127.0.0.1', '::1'];
  let up = 0;
  for (const h of hosts) {
    const srv = http.createServer(handler);
    srv.on('error', (err) => {
      if (h === '::1' && (err.code === 'EADDRNOTAVAIL' || err.code === 'EAFNOSUPPORT')) return;
      console.error(`listen ${h}:${PORT} failed:`, err.message);
      process.exit(1);
    });
    srv.listen(PORT, h, () => {
      if (++up === 1) {
        console.log(`BEMEXO demo backend on http://localhost:${PORT}  (static: ${OUT})`);
        console.log(`scene ${SCENE.scene} — ${SCENE.title} — clock ${SCENE.clock}`);
      }
    });
  }
}

module.exports = { handler, resetScene };
