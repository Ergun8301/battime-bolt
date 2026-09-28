// Tiny static server for the compositor runtime.
//   /runtime/*  -> compositor/runtime
//   /lib/*      -> compositor/lib
//   /assets/*   -> scratchpad/assets
//   /fs/<abs>   -> any file under the scratchpad root (absolute path, URL-encoded)
// Usage (preview): node lib/server.js [port]   (default 4700, the port reserved for the compositor)
const http = require('http');
const fs = require('fs');
const path = require('path');

const COMP_DIR = path.resolve(__dirname, '..');
const SCRATCH = path.resolve(COMP_DIR, '..');
const ASSETS = path.join(SCRATCH, 'assets');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.csv': 'text/csv; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf', '.mp4': 'video/mp4',
};

function resolveUrl(pathname) {
  const p = decodeURIComponent(pathname);
  let file = null;
  if (p.startsWith('/runtime/')) file = path.join(COMP_DIR, 'runtime', p.slice(9));
  else if (p.startsWith('/lib/')) file = path.join(COMP_DIR, 'lib', p.slice(5));
  else if (p.startsWith('/assets/')) file = path.join(ASSETS, p.slice(8));
  else if (p.startsWith('/fs/')) file = path.resolve('/', p.slice(4));
  else if (p === '/' || p === '/index.html') file = path.join(COMP_DIR, 'runtime', 'index.html');
  if (!file) return null;
  file = path.resolve(file);
  if (!file.startsWith(SCRATCH + path.sep) && !file.startsWith('/opt/') ) return null; // sandbox
  return file;
}

function toUrl(absPath) {
  const abs = path.resolve(absPath);
  if (abs.startsWith(ASSETS + path.sep)) return '/assets/' + abs.slice(ASSETS.length + 1).split(path.sep).map(encodeURIComponent).join('/');
  return '/fs' + abs.split(path.sep).map(encodeURIComponent).join('/');
}

function createServer() {
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/comp') {
      // resolved composition as JSON (for runtime/preview.html)
      try {
        const { resolveComp } = require('./resolve');
        const compPath = path.resolve(u.searchParams.get('path') || '');
        if (!compPath.startsWith(SCRATCH + path.sep)) throw new Error('comp must live under ' + SCRATCH);
        const { comp } = resolveComp(compPath);
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(JSON.stringify(comp));
      } catch (e) { res.writeHead(500, { 'content-type': 'text/plain' }); return res.end(String(e && e.stack || e)); }
    }
    const file = resolveUrl(u.pathname);
    if (!file) { res.writeHead(404); return res.end('not found'); }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'content-length': st.size,
        'cache-control': 'public, max-age=31536000, immutable',
        'access-control-allow-origin': '*',
      });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    });
  });
}

function start(port) {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(port || 0, '127.0.0.1', () => resolve({ server: srv, port: srv.address().port, origin: 'http://127.0.0.1:' + srv.address().port }));
  });
}

module.exports = { start, toUrl, resolveUrl, COMP_DIR, SCRATCH, ASSETS };

if (require.main === module) {
  const port = Number(process.argv[2] || 4700);
  start(port).then(({ origin }) => console.log('compositor preview server on ' + origin + '/runtime/preview.html?comp=' + path.join(COMP_DIR, 'demo-comp.js')));
}
