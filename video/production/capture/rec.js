// Deterministic frame-by-frame capture of the real BEMEXO UI.
//
// Principle: the page runs on a FAKE clock (Playwright clock) and every
// CSS/Web animation is paused and advanced by exactly 1/30 s per frame, so a
// take always produces the same frames whatever the machine speed. Frames are
// JPEG screenshots written to takes/<name>/frames/000001.jpg …, plus a
// meta.json with the scripted events (for zooms in the edit).
//
// Zero network outside localhost: every request not on localhost is aborted
// (Google Fonts are served from the local cache when available).

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const SP = '/tmp/claude-0/-home-user-battime-bolt/b6baaada-fc21-5d66-ac7f-b2db8e8c4cd7/scratchpad';
const BASE = process.env.DEMO_BASE || 'http://localhost:4600';
// Private backend instance (same code, other port) so that other tools using
// :4600 are never disturbed. The browser still believes it talks to :4600.
const CTRL = process.env.DEMO_CTRL || 'http://localhost:4601';
const FPS = 30;
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const EMAILS = {
  admin: 'sophie.durand@delorme-renovation.example',
  karim: 'karim.benali@delorme-renovation.example',
  julien: 'julien.morel@delorme-renovation.example',
};

// ---------------------------------------------------------------- in-page
// Injected before any app script: fake cursor, click ripple, tap indicator,
// and the animation stepper.
const INIT = () => {
  const install = () => {
    if (document.getElementById('__rec_layer')) return;
    const st = document.createElement('style');
    st.textContent = `
#__rec_layer{position:fixed;inset:0;pointer-events:none;z-index:2147483647}
#__rec_cursor{position:absolute;left:0;top:0;width:26px;height:26px;transform:translate(-3px,-2px);display:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
#__rec_cursor.on{display:block}
.__rec_ripple{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #FFC21A;background:rgba(255,194,26,.22);animation:__rec_rip .55s cubic-bezier(.2,.7,.3,1) forwards}
@keyframes __rec_rip{from{transform:scale(.35);opacity:1}to{transform:scale(1.35);opacity:0}}
.__rec_tap{position:absolute;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:rgba(255,194,26,.38);border:2px solid rgba(255,194,26,.95);animation:__rec_tapa .5s cubic-bezier(.2,.7,.3,1) forwards}
@keyframes __rec_tapa{0%{transform:scale(.4);opacity:1}60%{opacity:.9}100%{transform:scale(1.15);opacity:0}}
`;
    document.documentElement.appendChild(st);
    const layer = document.createElement('div');
    layer.id = '__rec_layer';
    layer.innerHTML = `<svg id="__rec_cursor" viewBox="0 0 26 26"><path d="M3 2 L3 21 L8.2 16.4 L11.6 24 L15 22.5 L11.7 15 L18.6 15 Z" fill="#fff" stroke="#15120F" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    document.documentElement.appendChild(layer);
  };
  const ready = () => { install(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();

  window.__rec = {
    cursor(x, y, show = true) {
      install();
      const c = document.getElementById('__rec_cursor');
      c.classList.toggle('on', !!show);
      c.style.left = x + 'px'; c.style.top = y + 'px';
    },
    ripple(x, y) {
      install();
      const d = document.createElement('div'); d.className = '__rec_ripple';
      d.style.left = x + 'px'; d.style.top = y + 'px';
      document.getElementById('__rec_layer').appendChild(d);
      d.addEventListener('animationend', () => d.remove());
    },
    tap(x, y) {
      install();
      const d = document.createElement('div'); d.className = '__rec_tap';
      d.style.left = x + 'px'; d.style.top = y + 'px';
      document.getElementById('__rec_layer').appendChild(d);
      d.addEventListener('animationend', () => d.remove());
    },
    // Advance every document animation by dt ms (they stay paused between frames).
    seen: new WeakSet(),
    step(dt) {
      for (const a of document.getAnimations()) {
        const ps = a.playState;
        if (ps === 'finished' || ps === 'idle') continue;
        let end = Infinity;
        try { end = a.effect.getComputedTiming().endTime; } catch (e) {}
        if (!this.seen.has(a)) { this.seen.add(a); a.pause(); a.currentTime = 0; }
        const next = (Number(a.currentTime) || 0) + dt;
        if (Number.isFinite(end) && next >= end) { try { a.finish(); } catch (e) { a.currentTime = end; } }
        else { a.pause(); a.currentTime = next; }
      }
    },
  };
};

// ---------------------------------------------------------------- helpers
const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function http(method, url, body) {
  try {
    const res = await fetch(CTRL + url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const txt = await res.text();
    try { return JSON.parse(txt); } catch { return txt; }
  } catch (e) { return null; }
}

function loadFontMap() {
  const f = path.join(SP, 'assets/fonts/route-map.json');
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

// ---------------------------------------------------------------- recorder
class Take {
  constructor(opts) {
    this.opts = opts;
    this.name = opts.name;
    this.kind = opts.kind || 'desktop';
    this.dir = path.join(SP, 'takes', this.name);
    this.frameNo = 0;
    this.events = [];
    this.mouse = { x: opts.cursorStart?.[0] ?? 800, y: opts.cursorStart?.[1] ?? 520 };
    this.inflight = 0;
    this.violations = [];
    this.tickIdx = 0;
    this.nowMs = new Date(opts.now).getTime();
  }

  async open() {
    const o = this.opts;
    fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(this.dir, 'frames'), { recursive: true });
    if (o.scene) await http('POST', '/__demo/reset', { scene: o.scene, now: o.now });
    else await http('POST', '/__demo/clock', { now: o.now });

    this.browser = await chromium.launch({ executablePath: CHROME, args: ['--no-proxy-server', '--disable-lcd-text', '--font-render-hinting=none', '--lang=fr-FR', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--disable-domain-reliability', '--metrics-recording-only'], env: { ...process.env, LANG: 'fr_FR.UTF-8', LANGUAGE: 'fr_FR:fr' } });
    const mobile = this.kind === 'mobile';
    const ctxOpts = mobile
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
      : { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 };
    this.context = await this.browser.newContext({
      ...ctxOpts,
      locale: 'fr-FR', timezoneId: 'Europe/Paris', colorScheme: 'light',
      serviceWorkers: 'block', acceptDownloads: true,
      geolocation: o.geolocation || { latitude: 45.8994, longitude: 6.1281, accuracy: 12 },
      permissions: ['geolocation'],
      reducedMotion: 'no-preference',
    });
    const fontMap = loadFontMap();
    await this.context.route('**/*', async (route) => {
      const url = route.request().url();
      const u = new URL(url);
      if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && u.origin === BASE && CTRL !== BASE) {
        const req = route.request();
        // Multipart uploads: Playwright does not expose the file part of the body,
        // so the take tells us which file it attached and we forward it ourselves.
        if (req.method() === 'POST' && /\/sb\/storage\/v1\/object\/(?!sign\/)/.test(u.pathname) && this.uploadFile) {
          const fd = new FormData();
          fd.append('cacheControl', '3600');
          fd.append('', new Blob([fs.readFileSync(this.uploadFile)], { type: 'image/jpeg' }), path.basename(this.uploadFile));
          const h = { ...req.headers() }; delete h['content-type']; delete h['content-length'];
          const res = await fetch(CTRL + u.pathname + u.search, { method: 'POST', headers: h, body: fd });
          const body = Buffer.from(await res.arrayBuffer());
          return route.fulfill({ status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json' }, body });
        }
        const resp = await route.fetch({ url: CTRL + u.pathname + u.search, maxRedirects: 0 }).catch((e) => { this.violations.push('FORWARD-FAILED ' + url + ' ' + e.message); return null; });
        if (!resp) return route.abort();
        return route.fulfill({ response: resp });
      }
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return route.continue();
      if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') {
        const mapped = fontMap && fontMap[url] ? path.resolve(SP, 'assets', fontMap[url]) : null;
        if (mapped && fs.existsSync(mapped)) {
          const file = mapped;
          const ct = file.endsWith('.css') ? 'text/css; charset=utf-8' : 'font/woff2';
          return route.fulfill({ status: 200, contentType: ct, headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(file) });
        }
        return route.continue(); // free public font CDN (no data sent) until the local cache exists
      }
      this.violations.push(url);
      return route.abort();
    });
    await this.context.routeWebSocket(/.*/, (ws) => ws.close());

    if (o.session) {
      const email = EMAILS[o.session] || o.session;
      const sess = await http('GET', `/__demo/session?email=${encodeURIComponent(email)}`);
      const key = sess.storageKey || 'sb-localhost-auth-token';
      const value = sess.storageValue ? sess.storageValue : JSON.stringify(sess.session || sess);
      await this.context.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) {} }, [key, value]);
    }
    if (o.localStorage) {
      await this.context.addInitScript((pairs) => { for (const [k, v] of pairs) try { localStorage.setItem(k, v); } catch (e) {} }, Object.entries(o.localStorage));
    }
    await this.context.addInitScript(INIT);
    this.page = await this.context.newPage();
    this.pending = new Set();
    this.page.on('request', (r) => { if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(r.url())) { this.pending.add(r); this.inflight = this.pending.size; } });
    const done = (r) => { this.pending.delete(r); this.inflight = this.pending.size; };
    this.page.on('requestfinished', done);
    this.page.on('requestfailed', (r) => { done(r); this.events.push({ frame: this.frameNo, type: 'requestfailed', message: r.url().slice(0, 200) + ' ' + (r.failure()?.errorText || '') }); });
    this.page.on('pageerror', (e) => this.events.push({ frame: this.frameNo, type: 'pageerror', message: String(e) }));
    this.page.on('console', (m) => { if (m.type() === 'error') this.events.push({ frame: this.frameNo, type: 'console', message: m.text().slice(0, 300) }); });
    this.page.on('dialog', (d) => d.accept());
    await this.page.clock.install({ time: new Date(o.now) });
    await this.page.goto(BASE + o.url, { waitUntil: 'domcontentloaded' });
    await this.settle(o.settleMs ?? 2500);
    if (!mobile) await this.page.evaluate(([x, y]) => window.__rec.cursor(x, y, false), [this.mouse.x, this.mouse.y]);
    return this;
  }

  // Let the page finish loading WITHOUT recording (fake time advances too).
  async settle(ms) {
    const steps = Math.ceil(ms / 50);
    for (let i = 0; i < steps; i++) {
      await this.page.clock.runFor(50);
      await this.page.evaluate(() => window.__rec && window.__rec.step(50)).catch(() => {});
      await this.waitNet();
    }
    await this.page.evaluate(() => document.fonts.ready).catch(() => {});
    await this.waitNet();
  }

  async waitNet() {
    let waited = 0;
    let had = false;
    while (this.inflight > 0 && waited < 4000) { had = true; await sleep(15); waited += 15; }
    if (had) await sleep(60); // React commit after the response (MessageChannel, real time)
    else await sleep(4);
  }

  // One output frame: advance fake time 1/30 s, step animations, snapshot.
  async frame() {
    const dt = [33, 33, 34][this.tickIdx++ % 3];
    await this.page.clock.runFor(dt);
    await this.page.evaluate((d) => window.__rec && window.__rec.step(d), dt).catch(() => {});
    await this.waitNet();
    this.frameNo++;
    this.recording = true;
    const file = path.join(this.dir, 'frames', String(this.frameNo).padStart(6, '0') + '.jpg');
    await this.page.screenshot({ path: file, type: 'jpeg', quality: 92, caret: 'initial', animations: 'allow', timeout: 60000 });
  }

  async hold(sec) { const n = Math.round(sec * FPS); for (let i = 0; i < n; i++) await this.frame(); }
  mark(label, extra = {}) { this.events.push({ frame: this.frameNo + 1, type: 'mark', label, ...extra }); }

  async box(target) {
    if (Array.isArray(target)) return { x: target[0], y: target[1], width: 0, height: 0 };
    const base = typeof target === 'string' ? this.page.locator(target) : target;
    // Poll from Node (never rely on in-page waits: the page clock is fake).
    for (let attempt = 0; attempt < 60; attempt++) {
      const n = await base.count().catch(() => 0);
      for (let i = 0; i < n; i++) {
        const loc = base.nth(i);
        if (!(await loc.isVisible().catch(() => false))) continue;
        let b = await loc.boundingBox().catch(() => null);
        if (!(b && b.width > 0 && b.height > 0)) continue;
        const vp = this.page.viewportSize();
        const margin = this.kind === 'mobile' ? 150 : 60;
        const clipped = await loc.evaluate((el, m) => {
          const r = el.getBoundingClientRect();
          let top = 0, bottom = innerHeight;
          for (let p = el.parentElement; p; p = p.parentElement) {
            const cs = getComputedStyle(p);
            if (/(auto|scroll|hidden)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 2) {
              const pr = p.getBoundingClientRect(); top = Math.max(top, pr.top); bottom = Math.min(bottom, pr.bottom);
            }
          }
          return r.top < top + 8 || r.bottom > bottom - m;
        }, this.kind === 'mobile' ? 90 : 24).catch(() => false);
        if (!this.opts.noAutoScroll && (clipped || b.y < 50 || b.y + b.height > vp.height - margin)) {
          // Smooth scroll so the target sits in the middle, frame by frame.
          const plan = await loc.evaluate((el) => {
            let p = el.parentElement;
            while (p && !(p.scrollHeight > p.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
            const sc = p || document.scrollingElement;
            const r = el.getBoundingClientRect();
            const vh = sc === document.scrollingElement ? innerHeight : sc.getBoundingClientRect().height;
            const top0 = sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top;
            const delta = (r.top - top0) + r.height / 2 - vh * 0.45;
            const from = sc.scrollTop;
            const to = Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight, from + delta));
            sc.setAttribute('data-rec-scroll', '1');
            return { from, to };
          });
          if (Math.abs(plan.to - plan.from) > 4) {
            const n = Math.max(8, Math.min(24, Math.round(Math.abs(plan.to - plan.from) / 40)));
            for (let k = 1; k <= n; k++) {
              const e = k / n, v = plan.from + (plan.to - plan.from) * (e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2);
              await this.page.evaluate((top) => { const sc = document.querySelector('[data-rec-scroll]') || document.scrollingElement; sc.scrollTop = top; }, v);
              if (this.recording) await this.frame(); else await this.page.clock.runFor(33);
            }
          }
          await this.page.evaluate(() => { const sc = document.querySelector('[data-rec-scroll]'); if (sc) sc.removeAttribute('data-rec-scroll'); });
          b = await loc.boundingBox().catch(() => null);
          if (!(b && b.width > 0)) continue;
        }
        return b;
      }
      await this.page.clock.runFor(50);
      await this.page.evaluate(() => window.__rec && window.__rec.step(50)).catch(() => {});
      await this.waitNet();
    }
    throw new Error('no visible box for ' + target);
  }
  center(b, dx = 0.5, dy = 0.5) { return [b.x + b.width * dx, b.y + b.height * dy]; }

  // Smoothly move the fake cursor + real mouse.
  async moveTo(target, sec = 0.7, opts = {}) {
    const b = await this.box(target);
    const [tx, ty] = this.center(b, opts.dx ?? 0.5, opts.dy ?? 0.5);
    const n = Math.max(1, Math.round(sec * FPS));
    const [sx, sy] = [this.mouse.x, this.mouse.y];
    // slight arc for a human feel
    const cx = (sx + tx) / 2 + (ty - sy) * 0.08, cy = (sy + ty) / 2 - (tx - sx) * 0.08;
    for (let i = 1; i <= n; i++) {
      const t = ease.inOut(i / n);
      const x = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cx + t * t * tx;
      const y = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cy + t * t * ty;
      this.mouse = { x, y };
      await this.page.mouse.move(x, y);
      await this.page.evaluate(([a, c]) => window.__rec.cursor(a, c, true), [x, y]);
      await this.frame();
    }
    this.events.push({ frame: this.frameNo, type: 'move', target: String(target), box: b });
    return b;
  }

  async click(target, opts = {}) {
    const b = await this.moveTo(target, opts.moveSec ?? 0.7, opts);
    await this.hold(opts.pauseBefore ?? 0.15);
    await this.page.mouse.down();
    await this.page.evaluate(([a, c]) => window.__rec.ripple(a, c), [this.mouse.x, this.mouse.y]);
    await this.frame(); await this.frame();
    await this.page.mouse.up();
    this.events.push({ frame: this.frameNo, type: 'click', target: String(target), box: b });
    await this.hold(opts.after ?? 0.4);
    return b;
  }

  // Drag with the real pointer (dnd-kit needs ≥ 8 px travel, steps).
  async drag(from, to, sec = 1.4, opts = {}) {
    await this.moveTo(from, opts.moveSec ?? 0.7, opts.fromOpts || {});
    await this.hold(0.2);
    await this.page.mouse.down();
    await this.page.evaluate(([a, c]) => window.__rec.ripple(a, c), [this.mouse.x, this.mouse.y]);
    await this.hold(0.15);
    const b = await this.box(to);
    const [tx, ty] = this.center(b, opts.dx ?? 0.5, opts.dy ?? 0.5);
    const n = Math.round(sec * FPS);
    const [sx, sy] = [this.mouse.x, this.mouse.y];
    for (let i = 1; i <= n; i++) {
      const t = ease.inOut(i / n);
      const x = sx + (tx - sx) * t, y = sy + (ty - sy) * t - Math.sin(Math.PI * t) * 30;
      this.mouse = { x, y };
      await this.page.mouse.move(x, y);
      await this.page.evaluate(([a, c]) => window.__rec.cursor(a, c, true), [x, y]);
      await this.frame();
    }
    await this.hold(opts.hover ?? 0.5);
    await this.page.mouse.up();
    this.events.push({ frame: this.frameNo, type: 'drop', target: String(to), box: b });
    await this.hold(opts.after ?? 0.5);
  }

  // Smoothly scroll the first scrollable element inside `sel` by dy px.
  async scrollIn(sel, dy, sec = 0.8) {
    const plan = await this.page.evaluate(([q, d]) => {
      const root = document.querySelector(q);
      if (!root) return null;
      const all = [root, ...root.querySelectorAll('*')];
      const sc = all.find((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 2);
      if (!sc) return null;
      sc.setAttribute('data-rec-scroll', '1');
      return { from: sc.scrollTop, to: Math.min(sc.scrollHeight - sc.clientHeight, sc.scrollTop + d) };
    }, [sel, dy]);
    if (!plan) return;
    const n = Math.round(sec * FPS);
    for (let k = 1; k <= n; k++) {
      const e = k / n, v = plan.from + (plan.to - plan.from) * (e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2);
      await this.page.evaluate((top) => { const sc = document.querySelector('[data-rec-scroll]'); if (sc) sc.scrollTop = top; }, v);
      await this.frame();
    }
    await this.page.evaluate(() => { const sc = document.querySelector('[data-rec-scroll]'); if (sc) sc.removeAttribute('data-rec-scroll'); });
  }

  async typeText(text, cps = 14, opts = {}) {
    const per = FPS / cps;
    let acc = 0;
    for (const ch of text) {
      await this.page.keyboard.type(ch);
      acc += per;
      while (acc >= 1) { await this.frame(); acc -= 1; }
    }
    await this.hold(opts.after ?? 0.3);
  }

  // Mobile tap with a visible indicator.
  async tap(target, opts = {}) {
    const b = await this.box(target);
    const [x, y] = this.center(b, opts.dx ?? 0.5, opts.dy ?? 0.5);
    await this.hold(opts.before ?? 0.2);
    await this.page.evaluate(([a, c]) => window.__rec.tap(a, c), [x, y]);
    await this.frame(); await this.frame(); await this.frame();
    if (!opts.indicatorOnly) await this.page.touchscreen.tap(x, y);
    this.events.push({ frame: this.frameNo, type: 'tap', target: String(target), box: b });
    await this.hold(opts.after ?? 0.5);
    return b;
  }

  // Jump the clock (browser + backend) without recording, e.g. 07:30 -> 10:42.
  async jump(ms, settleMs = 400) {
    await this.page.clock.fastForward(ms);
    this.nowMs += ms;
    await http('POST', '/__demo/clock', { now: new Date(this.nowMs + this.frameNo * 1000 / FPS).toISOString() });
    await this.settle(settleMs);
  }

  // Jump to an absolute wall time of the demo day (ISO string).
  async jumpTo(iso, settleMs = 400) {
    const now = await this.page.evaluate(() => Date.now());
    const target = new Date(iso).getTime();
    if (target <= now) throw new Error('jumpTo in the past ' + iso);
    await this.page.clock.fastForward(target - now);
    await http('POST', '/__demo/clock', { now: new Date(target).toISOString() });
    await this.settle(settleMs);
  }

  async syncServerClock() {
    const now = await this.page.evaluate(() => Date.now());
    await http('POST', '/__demo/clock', { now: new Date(now).toISOString() });
  }

  async screenshotStill(name) {
    const file = path.join(this.dir, name + '.png');
    await this.page.screenshot({ path: file, type: 'png', caret: 'hide' });
    return file;
  }

  async close() {
    const log = await http('GET', '/__demo/log').catch(() => null);
    const unknown = Array.isArray(log?.unknown) ? log.unknown : [];
    const meta = {
      name: this.name, kind: this.kind, fps: FPS, frames: this.frameNo,
      viewport: this.kind === 'mobile' ? { w: 390, h: 844, dpr: 3 } : { w: 1600, h: 900, dpr: 2 },
      events: this.events, violations: this.violations, backendUnknown: unknown,
    };
    fs.writeFileSync(path.join(this.dir, 'meta.json'), JSON.stringify(meta, null, 2));
    await this.browser.close();
    const errs = this.events.filter((e) => e.type === 'pageerror');
    console.log(`[${this.name}] ${this.frameNo} frames · violations ${this.violations.length} · pageerrors ${errs.length} · backend unknown ${unknown.length}`);
    if (this.violations.length) console.log('  VIOLATIONS', this.violations.slice(0, 5));
    return meta;
  }
}

module.exports = { Take, http, FPS, SP, BASE, EMAILS, sleep };
