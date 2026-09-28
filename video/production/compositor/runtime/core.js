/* BEMEXO compositor — browser runtime core.
 * The DOM is a pure function of the frame number: window.renderFrame(f) sets every style from f.
 * No CSS transitions / animations are used (they are globally disabled in styles.css).
 */
(function () {
  const E = window.Easing;
  const R = (window.R = { components: {}, comp: null, pending: [], imgCache: new Map(), cacheOrder: [], frame: -1, lodQueue: [], dirty: true });

  R.register = function (type, factory) { R.components[type] = factory; };

  // ---------- helpers exposed to components ----------
  R.h = function (tag, cls, parent, html) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html !== undefined) el.innerHTML = html;
    if (parent) parent.appendChild(el);
    return el;
  };
  R.css = function (el, styles) { for (const k in styles) { const v = styles[k]; if (el.style[k] !== v) el.style[k] = v; } };
  R.set = function (el, prop, v) { if (el._s === undefined) el._s = {}; if (el._s[prop] !== v) { el._s[prop] = v; el.style[prop] = v; } };
  // CSS custom property (el.style['--x'] = v does not work; setProperty does), cached like R.set
  R.setVar = function (el, name, v) { if (el._s === undefined) el._s = {}; if (el._s[name] !== v) { el._s[name] = v; el.style.setProperty(name, v); } };
  R.esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  // "Une seule saisie. {Tout suit.}" -> highlighted span; "\n" -> <br>
  // Markup: <span class="hl"><span class="hl-t">Tout suit.</span></span>. The outer span carries the yellow marker
  // (swept by --hl), the inner span paints the glyphs with a text-clipped gradient: ink under the marker, the
  // surrounding text colour (--hl-base) elsewhere, so the words stay readable before and during the sweep.
  // A highlight that opens a line gets .hl-first: the marker bleeds left and the glyphs stay on the text edge.
  R.rich = function (text, hlClass) {
    const parts = String(text).split(/(\{[^}]*\})/g);
    return parts.map((p, i) => {
      if (!(p.startsWith('{') && p.endsWith('}'))) return R.esc(p);
      const prev = parts.slice(0, i).join('');
      const first = prev === '' || /\n\s*$/.test(prev);
      return '<span class="hl' + (first ? ' hl-first' : '') + (hlClass ? ' ' + hlClass : '') + '"><span class="hl-t">' + R.esc(p.slice(1, -1)) + '</span></span>';
    }).join('').replace(/\n/g, '<br>');
  };
  R.revive = function (node) {
    if (Array.isArray(node)) return node.map(R.revive);
    if (node && typeof node === 'object') {
      if (node.__fn) return new Function('return (' + node.__fn + ')')();
      const o = {};
      for (const k in node) o[k] = R.revive(node[k]);
      return o;
    }
    return node;
  };

  // ---------- images ----------
  // A frame waits until every changed <img> has its bytes (load event). It does NOT call img.decode():
  // decode() decodes at natural size on a worker, and the raster then decodes again at the drawn scale
  // (double work for big sequences). Every media <img> is decoding="sync", so the raster decodes it
  // synchronously inside the screenshot: the captured frame always contains the image (deterministic).
  R.whenLoaded = function (img) {
    if (img.complete && img.naturalWidth) return Promise.resolve();
    return new Promise((res) => { img.addEventListener('load', res, { once: true }); img.addEventListener('error', res, { once: true }); });
  };
  R.setImg = function (img, url) {
    if (!url) return;
    if (img._url === url) return;
    img._url = url;
    if (!img.decoding || img.decoding === 'auto') img.decoding = 'sync';
    img.src = url;
    R.pending.push(R.whenLoaded(img));
  };
  // Preload = fetch the bytes into Blink's memory cache only (no decode: decoding 6 frames ahead of two
  // 3200x1800 sequences thrashed the decode cache and cost ~35 % of the render time).
  R.preload = function (url) {
    if (!url || R.imgCache.has(url)) return;
    const im = new Image();
    im.src = url;
    R.imgCache.set(url, im);
    R.cacheOrder.push(url);
    if (R.cacheOrder.length > 160) R.imgCache.delete(R.cacheOrder.shift());
  };
  R.mediaUrl = function (props, idx, level) {
    if (props._dir) {
      const d = props._dir; const i = Math.max(0, Math.min(d.count - 1, idx));
      const l = level && d.lod ? d.lod.find((x) => x.level === level) : null;
      if (l) return l.url + '/' + String(i + 1).padStart(6, '0') + '.jpg'; // LOD proxies are renamed by index
      return d.url + '/' + encodeURIComponent(d.files[i]);
    }
    if (props._src) return props._src.url;
    if (typeof props.src === 'string' && /^(\/|https?:|data:)/.test(props.src)) return props.src;
    return null;
  };

  // ---------- noise tile (deterministic) ----------
  let noiseUrl = null;
  R.noise = function () {
    if (noiseUrl) return noiseUrl;
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d'); const img = ctx.createImageData(256, 256); const rnd = E.rng(1234);
    for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (rnd() - 0.5) * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    noiseUrl = c.toDataURL('image/png');
    return noiseUrl;
  };

  // ---------- enter / exit presets ----------
  const PRESETS = {
    fade: (p, d) => ({ opacity: p }),
    rise: (p, d) => ({ opacity: p, y: (1 - p) * (d || 24) }),
    drop: (p, d) => ({ opacity: p, y: -(1 - p) * (d || 24) }),
    fromRight: (p, d) => ({ x: (1 - p) * (d || 1200) }),
    fromLeft: (p, d) => ({ x: -(1 - p) * (d || 1200) }),
    fromBottom: (p, d) => ({ y: (1 - p) * (d || 1100) }),
    fromTop: (p, d) => ({ y: -(1 - p) * (d || 1100) }),
    fadeRight: (p, d) => ({ opacity: p, x: (1 - p) * (d || 60) }),
    fadeLeft: (p, d) => ({ opacity: p, x: -(1 - p) * (d || 60) }),
    scale: (p, d) => ({ opacity: p, scale: 1 - (1 - p) * (d || 0.06) }),
    zoom: (p, d) => ({ opacity: p, scale: 1 + (1 - p) * (d || 0.06) }),
    none: () => ({}),
  };
  const EXIT_ALIASES = { toRight: 'fromRight', toLeft: 'fromLeft', toBottom: 'fromBottom', toTop: 'fromTop', fall: 'rise', lift: 'drop' };
  R.PRESETS = PRESETS;

  function presetValues(spec, lf, duration, isExit) {
    if (!spec) return null;
    if (typeof spec === 'string') spec = { preset: spec };
    const dur = spec.dur !== undefined ? spec.dur : isExit ? 8 : 12;
    const delay = spec.delay || 0;
    let t;
    if (!isExit) t = (lf - delay) / dur;
    else { const at = spec.at !== undefined ? spec.at : duration - dur; t = 1 - (lf - at) / dur; }
    if (t >= 1) return null;
    t = E.clamp01(t);
    const ease = E.getEasing(spec.ease || (isExit ? 'easeInCubic' : 'easeOutCubic'));
    const name = EXIT_ALIASES[spec.preset] || spec.preset || 'fade';
    const fn = PRESETS[name];
    if (!fn) throw new Error('Unknown preset ' + name);
    return fn(isExit ? 1 - ease(1 - t) : ease(t), spec.distance);
  }

  // Resolves a layer's transform/opacity/filter at local frame lf.
  R.animState = function (spec, lf, duration) {
    const a = spec.anim || {};
    const s = {
      x: E.track(a.x, lf) || 0, y: E.track(a.y, lf) || 0,
      scale: a.scale !== undefined ? E.track(a.scale, lf) : 1,
      rotate: E.track(a.rotate, lf) || 0,
      opacity: a.opacity !== undefined ? E.track(a.opacity, lf) : 1,
      dim: E.track(a.dim, lf) || 0, blur: E.track(a.blur, lf) || 0,
      brightness: a.brightness !== undefined ? E.track(a.brightness, lf) : 1,
    };
    for (const [pv, isExit] of [[presetValues(spec.enter, lf, duration, false), false], [presetValues(spec.exit, lf, duration, true), true]]) {
      if (!pv) continue;
      if (pv.opacity !== undefined) s.opacity *= pv.opacity;
      if (pv.x) s.x += pv.x; if (pv.y) s.y += pv.y;
      if (pv.scale !== undefined) s.scale *= pv.scale;
    }
    return s;
  };

  R.applyAnim = function (el, st) {
    const tf = (st.x || st.y ? 'translate(' + st.x.toFixed(2) + 'px,' + st.y.toFixed(2) + 'px) ' : '') + (st.scale !== 1 ? 'scale(' + st.scale.toFixed(5) + ') ' : '') + (st.rotate ? 'rotate(' + st.rotate.toFixed(3) + 'deg)' : '');
    R.set(el, 'transform', tf.trim() || 'none');
    R.set(el, 'opacity', st.opacity >= 0.999 ? '' : String(Math.max(0, st.opacity).toFixed(4)));
    const br = st.brightness * (st.dimMode === 'overlay' ? 1 : 1 - st.dim);
    const warm = st.dimMode !== 'overlay' && st.dim > 0.001 ? 'sepia(' + (st.dim * 0.35).toFixed(4) + ') ' : '';
    const f = (br !== 1 ? 'brightness(' + br.toFixed(4) + ') ' : '') + warm + (st.blur > 0.05 ? 'blur(' + st.blur.toFixed(2) + 'px)' : '');
    R.set(el, 'filter', f.trim() || 'none');
    R.set(el, 'visibility', st.opacity <= 0.001 ? 'hidden' : '');
  };

  // ---------- Layer ----------
  class Layer {
    constructor(spec, parentEl, parentBox) {
      this.spec = spec;
      this.from = spec.from || 0;
      this.duration = spec.duration !== undefined ? spec.duration : Infinity;
      const box = Object.assign({ x: 0, y: 0, w: parentBox.w, h: parentBox.h }, spec.box || {});
      this.box = box;
      this.el = R.h('div', 'layer layer-' + spec.type + (spec.className ? ' ' + spec.className : ''), parentEl);
      R.css(this.el, { left: box.x + 'px', top: box.y + 'px', width: box.w + 'px', height: box.h + 'px', zIndex: spec.z !== undefined ? String(spec.z) : '' });
      if (spec.origin) this.el.style.transformOrigin = spec.origin;
      if (spec.clip) R.css(this.el, { overflow: 'hidden', borderRadius: (spec.radius || 0) + 'px' });
      this.el.style.display = 'none';
      this.shown = false;
      const factory = R.components[spec.type];
      if (!factory) throw new Error('Unknown layer type: ' + spec.type);
      this.inst = factory(this.el, spec.props || {}, { box, layer: this, spec, comp: R.comp }) || {};
    }
    update(frame) {
      const lf = frame - this.from + (this.spec.trimStart || 0);
      const vis = frame - this.from >= 0 && frame - this.from < this.duration;
      if (!vis) { if (this.shown) { this.el.style.display = 'none'; this.shown = false; } return; }
      if (!this.shown) { this.el.style.display = ''; this.shown = true; }
      if (this.spec.type === 'html' || this.spec.alwaysDirty) R.forceDirty = true;
      const dur = this.duration + (this.spec.trimStart || 0);
      const st = R.animState(this.spec, lf, dur);
      st.dimMode = this.spec.dimMode || 'filter';
      R.applyAnim(this.el, st);
      // dimMode 'overlay': warm ink overlay (#15120F) over the whole layer box (use only for opaque full-box layers)
      if (st.dimMode === 'overlay' && (st.dim > 0.001 || this.dimEl)) {
        if (!this.dimEl) { this.dimEl = R.h('div', 'dim', this.el); R.css(this.dimEl, { position: 'absolute', inset: '0', background: this.spec.dimColor || '#15120F', zIndex: '50', pointerEvents: 'none', borderRadius: (this.spec.radius || 0) + 'px' }); }
        R.set(this.dimEl, 'opacity', st.dim.toFixed(4));
        R.set(this.dimEl, 'display', st.dim > 0.001 ? '' : 'none');
      }
      if (this.inst.update) this.inst.update(lf, dur);
    }
  }
  R.Layer = Layer;

  // group: children with frames relative to the group start
  R.register('group', function (el, props, ctx) {
    const children = (ctx.spec.children || props.children || []).map((c) => new Layer(c, el, ctx.box));
    if (props.background) el.style.background = props.background;
    if (props.clip) R.css(el, { overflow: 'hidden', borderRadius: (props.radius || 0) + 'px' });
    return { update(lf) { for (const c of children) c.update(lf); }, children };
  });

  // ---------- boot ----------
  R.load = async function (comp) {
    comp = R.revive(comp);
    R.comp = comp;
    const stage = document.getElementById('stage');
    stage.innerHTML = '';
    R.css(stage, { width: comp.width + 'px', height: comp.height + 'px', background: comp.background || '#000' });
    const fontsToLoad = ['400', '500', '600', '700', '800', '900'].map((w) => w + ' 40px Archivo').concat(['400', '500', '600', '700', '800'].map((w) => w + ' 40px "JetBrains Mono"'));
    await Promise.all(fontsToLoad.map((f) => document.fonts.load(f, 'AaÉéèàçœ€«»…—’·0123456789').catch(() => {})));
    R.layers = comp.layers.map((l) => new Layer(l, stage, { w: comp.width, h: comp.height }));
    await document.fonts.ready;
    // Change detection: a frame whose renderFrame() mutated nothing in the DOM is pixel-identical to the
    // previous one, so the renderer can reuse the previous capture (holds cost ~nothing).
    if (R.observer) R.observer.disconnect();
    R.observer = new MutationObserver(() => {});
    R.observer.observe(stage, { subtree: true, childList: true, attributes: true, characterData: true });
    R.observer.observe(document.head, { subtree: true, childList: true, attributes: true, characterData: true });
    R.frame = -1;
    return { width: comp.width, height: comp.height, fps: comp.fps, durationInFrames: comp.durationInFrames };
  };

  window.renderFrame = async function (f) {
    R.pending = [];
    R.forceDirty = R.frame < 0; // first frame of a page is always captured
    R.frame = f;
    if (R.observer) R.observer.takeRecords();
    R.lodQueue = [];
    for (const l of R.layers) l.update(f);
    // sequences with LOD proxies choose their level from the final on-screen geometry of this frame
    if (R.lodQueue.length) { const q = R.lodQueue; R.lodQueue = []; const scales = q.map((fn) => fn.measure()); q.forEach((fn, i) => fn.apply(scales[i])); }
    if (R.pending.length) await Promise.all(R.pending);
    if (document.fonts.status !== 'loaded') await document.fonts.ready;
    // dirty = the DOM changed (style/attribute/text/children) or a layer that can paint without touching
    // the DOM (html layers may draw into a <canvas>) is visible.
    const records = R.observer ? R.observer.takeRecords().length : 1;
    R.dirty = R.forceDirty || records > 0 || R.pending.length > 0;
    return f;
  };
})();
