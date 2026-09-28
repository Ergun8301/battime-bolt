/* Media components: seq, still, phone, split, notification, image */
(function () {
  const E = window.Easing, R = window.R;

  // ---------- camera ----------
  // Fit a requested source rect to the viewport aspect (the requested rect stays fully visible).
  function fitRect(r, aspect, src) {
    let x, y, w, h;
    if (r === 'full' || !r) { x = 0; y = 0; w = src.width; h = src.height; }
    else if (r === 'cover' || (r && r.cover)) {
      // largest centred rect with the viewport aspect inside the source (optionally zoomed / anchored)
      const zoom = (r && r.zoom) || 1;
      let cw = src.width, ch = src.width / aspect;
      if (ch > src.height) { ch = src.height; cw = ch * aspect; }
      cw /= zoom; ch /= zoom;
      const ax = r && r.ax !== undefined ? r.ax : 0.5, ay = r && r.ay !== undefined ? r.ay : 0.5;
      return { cx: cw / 2 + (src.width - cw) * ax, cy: ch / 2 + (src.height - ch) * ay, w: cw, h: ch };
    }
    else if (r.cx !== undefined) {
      const zoom = r.zoom || 1;
      // zoom 1 = the whole source fitted ("contain") in the viewport
      const baseW = src.width / src.height > aspect ? src.width : src.height * aspect;
      w = baseW / zoom; h = w / aspect; return { cx: r.cx, cy: r.cy, w, h };
    } else { x = r.x || 0; y = r.y || 0; w = r.w || src.width; h = r.h || src.height; }
    if (w / h > aspect) { const nh = w / aspect; y -= (nh - h) / 2; h = nh; } else { const nw = h * aspect; x -= (nw - w) / 2; w = nw; }
    return { cx: x + w / 2, cy: y + h / 2, w, h };
  }
  function clampView(v, src, mode) {
    if (!mode) return v;
    const o = Object.assign({}, v);
    if (o.w <= src.width) o.cx = Math.min(Math.max(o.cx, o.w / 2), src.width - o.w / 2); else o.cx = src.width / 2;
    if (o.h <= src.height) o.cy = Math.min(Math.max(o.cy, o.h / 2), src.height - o.h / 2); else o.cy = src.height / 2;
    return o;
  }
  // camera spec: rect | 'full' | [{f, x,y,w,h | cx,cy,zoom, ease}]
  function makeCamera(spec, aspect, src, clamp) {
    const norm = (k) => clampView(fitRect(k, aspect, src), src, clamp);
    if (!Array.isArray(spec)) { const v = norm(spec); return () => v; }
    const keys = spec.map((k) => Object.assign({ f: k.f || 0, ease: k.ease, hold: k.hold }, norm(k.rect || k)));
    return function (lf) {
      if (lf <= keys[0].f) return keys[0];
      const last = keys[keys.length - 1];
      if (lf >= last.f) return last;
      let i = 0; while (i < keys.length - 2 && lf >= keys[i + 1].f) i++;
      const a = keys[i], b = keys[i + 1];
      const t = E.getEasing(b.ease || 'smooth')(E.clamp01((lf - a.f) / (b.f - a.f)));
      const w = Math.exp(Math.log(a.w) + (Math.log(b.w) - Math.log(a.w)) * t);
      const h = w / aspect;
      if (Math.abs(b.w - a.w) / Math.max(a.w, b.w) < 0.02) {
        return { cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t, w, h };
      }
      // zoom about the fixed point (screen position shared by both rects): natural camera move
      const ax = a.cx - a.w / 2, bx = b.cx - b.w / 2, ay = a.cy - a.h / 2, by = b.cy - b.h / 2;
      const px = (ax * b.w - bx * a.w) / (b.w - a.w), py = (ay * b.h - by * a.h) / (b.h - a.h);
      const ux = (px - ax) / a.w, uy = (py - ay) / a.h;
      return { cx: px - ux * w + w / 2, cy: py - uy * h + h / 2, w, h };
    };
  }
  R.makeCamera = makeCamera;

  // source frame index for a sequence at local frame lf
  function seqIndex(props, lf) {
    const d = props._dir; if (!d) return 0;
    let sf;
    if (props.timeMap) sf = E.track(props.timeMap, lf, 'linear');
    else {
      const rate = props.rate !== undefined ? props.rate : 1;
      const start = props.startFrame || 0;
      const t = props.freezeAt !== undefined && lf >= props.freezeAt ? props.freezeAt : lf;
      sf = start + t * rate;
      if (props.freezeAt !== undefined && lf >= props.freezeAt && props.freezeFrame !== undefined) sf = props.freezeFrame;
    }
    sf = Math.floor(sf + 1e-6);
    if (sf >= d.count) { if (props.hold === 'loop') sf = sf % d.count; else if (props.hold === 'none') return -1; else sf = d.count - 1; }
    return Math.max(0, sf);
  }
  R.seqIndex = seqIndex;

  /**
   * mediaView: renders a seq/still in `parent` sized w x h, returns update(lf).
   * props: dir|src, camera, startFrame, rate, hold, freezeAt, freezeFrame, timeMap, clamp(true), background
   */
  function mediaView(parent, props, w, h) {
    const vp = R.h('div', 'media', parent);
    R.css(vp, { width: w + 'px', height: h + 'px', background: props.background || '#0d0c0b' });
    const cam = R.h('div', 'cam', vp);
    const img = R.h('img', '', cam);
    img.decoding = 'sync';
    const src = props._dir ? { width: props._dir.width, height: props._dir.height } : props._src ? { width: props._src.width, height: props._src.height } : { width: w, height: h };
    R.css(cam, { width: src.width + 'px', height: src.height + 'px' });
    R.css(img, { width: src.width + 'px', height: src.height + 'px' });
    const camera = makeCamera(props.camera || 'full', w / h, src, props.clamp !== false);
    const lod = props._dir && props._dir.lod && props._dir.lod.length ? props._dir.lod : null;
    let lastIdx = -2, lastLevel = -1;
    // Level of detail: the <img> keeps the full source size in CSS (camera maths unchanged); only its URL switches to
    // a half / quarter resolution proxy when the image is drawn small enough that the proxy is never upscaled.
    const showFrame = (idx, level, lf) => {
      R.setImg(img, R.mediaUrl(props, idx, level));
      for (let k = 1; k <= 6; k++) { const n = seqIndex(props, lf + k); if (n >= 0 && n !== idx) R.preload(R.mediaUrl(props, n, level)); }
    };
    return {
      el: vp,
      update(lf) {
        if (props._dir) {
          const idx = seqIndex(props, lf);
          if (idx < 0) { if (lastIdx !== idx) { lastIdx = idx; R.set(img, 'visibility', 'hidden'); } }
          else {
            R.set(img, 'visibility', '');
            if (!lod) { if (idx !== lastIdx) showFrame(idx, 0, lf); lastIdx = idx; }
            else {
              R.lodQueue.push({
                measure: () => img.getBoundingClientRect().width / src.width, // on-screen px per source px (all transforms)
                apply: (scale) => {
                  let level = 0;
                  for (const l of lod) if (scale > 0 && scale * (src.width / l.width) <= 1.001) level = l.level;
                  if (!(scale > 0)) level = lod[lod.length - 1].level;
                  if (idx !== lastIdx || level !== lastLevel) showFrame(idx, level, lf);
                  lastIdx = idx; lastLevel = level;
                },
              });
            }
          }
        } else R.setImg(img, R.mediaUrl(props, 0));
        const v = camera(lf);
        const s = w / v.w;
        R.set(cam, 'transform', 'translate(' + (-(v.cx - v.w / 2) * s).toFixed(3) + 'px,' + (-(v.cy - v.h / 2) * s).toFixed(3) + 'px) scale(' + s.toFixed(6) + ')');
      },
    };
  }
  R.mediaView = mediaView;

  // decorated media: frame 'none' | 'card' | 'browser' (+ theme 'dark')
  function decoratedMedia(el, props, box) {
    const frame = props.frame || 'none';
    const radius = props.radius !== undefined ? props.radius : frame === 'none' ? 0 : 18;
    if (frame === 'browser') {
      const b = R.h('div', 'browser' + (props.theme === 'dark' ? ' dark' : ''), el);
      const barH = props.barHeight || 46;
      const bar = R.h('div', 'browser-bar', b); bar.style.height = barH + 'px';
      for (let i = 0; i < 3; i++) R.h('div', 'browser-dot', bar);
      const url = props.url || 'app.bemexo.com';
      const u = R.h('div', 'browser-url', bar, '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg><span>' + R.esc(url).replace(/^([^/]+)/, '<b>$1</b>') + '</span>');
      const inner = R.h('div', '', b); R.css(inner, { position: 'absolute', left: '0', top: barH + 'px', width: box.w + 'px', height: box.h - barH + 'px', overflow: 'hidden' });
      return mediaView(inner, props, box.w, box.h - barH);
    }
    const wrap = R.h('div', frame === 'card' ? 'media-card' : '', el);
    R.css(wrap, { position: 'absolute', inset: '0', overflow: 'hidden', borderRadius: radius + 'px' });
    return mediaView(wrap, props, box.w, box.h);
  }

  R.register('seq', function (el, props, ctx) { return decoratedMedia(el, props, ctx.box); });
  R.register('still', function (el, props, ctx) { return decoratedMedia(el, props, ctx.box); });

  // simple positioned image (logos, overlays). props: src, fit ('contain'|'cover'), opacity
  R.register('image', function (el, props, ctx) {
    const img = R.h('img', '', el);
    R.css(img, { width: '100%', height: '100%', objectFit: props.fit || 'contain' });
    return { update() { R.setImg(img, R.mediaUrl(props, 0)); } };
  });

  // ---------- notification ----------
  const X_ICON = '<svg width="24" height="24" viewBox="0 0 120 120"><line x1="30" y1="30" x2="90" y2="90" stroke="#F2EDE3" stroke-width="20" stroke-linecap="square"/><line x1="30" y1="90" x2="90" y2="30" stroke="#FFC21A" stroke-width="20" stroke-linecap="square"/></svg>';
  function notification(parent, n, width) {
    const el = R.h('div', 'notif', parent);
    el.style.width = width + 'px';
    el.innerHTML = '<div class="notif-ic">' + X_ICON + '</div><div><div class="notif-head"><span>' + R.esc(n.app || 'BEMEXO') + '</span><span class="t">' + R.esc(n.time || 'maintenant') + '</span></div>' +
      '<div class="notif-title">' + R.esc(n.title || '') + '</div>' + (n.body ? '<div class="notif-body">' + R.esc(n.body) + '</div>' : '') + '</div>';
    return el;
  }
  // position of a notification at local frame (relative to its own `from`)
  function notifState(lf, dur, height) {
    const inD = 20, outD = 12;
    let y, o = 1;
    if (lf < inD) { const p = E.springSoft(lf / inD); y = -(height + 30) * (1 - p); o = E.clamp01(lf / 5); }
    else if (lf > dur - outD) { const p = E.easeInCubic(E.clamp01((lf - (dur - outD)) / outD)); y = -(height + 30) * p; o = 1 - E.clamp01((lf - (dur - 4)) / 4); }
    else y = 0;
    return { y, o };
  }
  R.notification = notification; R.notifState = notifState;

  // standalone notification layer. props: title, body, app, time, width(380), scale
  R.register('notification', function (el, props, ctx) {
    const width = props.width || 380;
    const n = notification(el, props, width);
    R.css(n, { left: '0', top: '0', transformOrigin: '0 0' });
    const sc = props.scale || 1;
    return {
      update(lf, dur) {
        const st = notifState(lf, dur === Infinity ? 1e9 : dur, n.offsetHeight || 90);
        R.set(n, 'transform', 'translateY(' + (st.y * sc).toFixed(2) + 'px) scale(' + sc + ')');
        R.set(n, 'opacity', String(st.o.toFixed(3)));
      },
    };
  });

  // ---------- phone ----------
  /**
   * props: screen {type:'seq'|'still', dir|src, camera, ...}, height (px, default 900), x, y (centre, px in layer box; default centre),
   * statusBar (true|{time, bg, color}), taps [{f, x, y}], notifications [{from, duration, title, body, app, time}], tilt
   */
  R.register('phone', function (el, props, ctx) {
    const SW = 390, SH = 844;
    const sb = props.statusBar === false ? null : Object.assign({ time: '08:12', bg: '#15120F', color: '#F2EDE3', height: 34 }, props.statusBar === true || !props.statusBar ? {} : props.statusBar);
    const sbh = sb ? sb.height : 0;
    const bez = 10, side = 2;
    const screenW = SW, screenH = SH + sbh;
    const bodyW = screenW + 2 * bez, bodyH = screenH + 2 * bez;
    const targetH = props.height || 900;
    const scale = targetH / bodyH;
    const cx = props.x !== undefined ? props.x : ctx.box.w / 2, cy = props.y !== undefined ? props.y : ctx.box.h / 2;
    const ph = R.h('div', 'phone', el);
    R.css(ph, { width: bodyW + 'px', height: bodyH + 'px' });
    ph.style.transform = 'translate(' + (cx - (bodyW * scale) / 2) + 'px,' + (cy - (bodyH * scale) / 2) + 'px) scale(' + scale + ')';
    R.h('div', 'phone-shadow', ph);
    // side buttons (right: volume rocker + power) — generic, not an Apple lookalike
    const b1 = R.h('div', 'phone-btn', ph); R.css(b1, { right: -side - 2 + 'px', top: '176px', height: '96px' });
    const b2 = R.h('div', 'phone-btn', ph); R.css(b2, { right: -side - 2 + 'px', top: '300px', height: '58px' });
    R.h('div', 'phone-body', ph);
    const scr = R.h('div', 'phone-screen', ph);
    R.css(scr, { left: bez + 'px', top: bez + 'px', width: screenW + 'px', height: screenH + 'px', background: sb ? sb.bg : '#15120F' });
    if (sb) {
      const st = R.h('div', 'phone-status', scr);
      R.css(st, { height: sbh + 'px', color: sb.color, background: sb.bg });
      const c = sb.color;
      // statusBar.offline: no bars, no Wi-Fi (the « sans réseau » cue of the offline beat)
      const bo = sb.offline ? '.25' : '1', b4 = sb.offline ? '.25' : '.35';
      st.innerHTML = '<span>' + R.esc(sb.time) + '</span><span class="icons">' +
        '<svg width="17" height="12" viewBox="0 0 17 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="' + c + '" opacity="' + bo + '"/><rect x="4.5" y="5.5" width="3" height="6.5" rx="1" fill="' + c + '" opacity="' + bo + '"/><rect x="9" y="3" width="3" height="9" rx="1" fill="' + c + '" opacity="' + bo + '"/><rect x="13.5" y="0" width="3" height="12" rx="1" fill="' + c + '" opacity="' + b4 + '"/></svg>' +
        (sb.offline ? '' : '<svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 11.5 1 4.2a10 10 0 0 1 14 0Z" fill="' + c + '"/></svg>') +
        '<svg width="26" height="13" viewBox="0 0 26 13"><rect x=".75" y=".75" width="21.5" height="11.5" rx="3.2" fill="none" stroke="' + c + '" stroke-opacity=".5" stroke-width="1.2"/><rect x="2.6" y="2.6" width="14.5" height="7.8" rx="1.8" fill="' + c + '"/><rect x="23.4" y="4.3" width="1.8" height="4.4" rx=".9" fill="' + c + '" opacity=".5"/></svg></span>';
    }
    const punch = R.h('div', 'phone-punch', ph);
    R.css(punch, { left: bodyW / 2 - 6.5 + 'px', top: bez + (sbh ? (sbh - 13) / 2 : 10) + 'px' });
    const content = R.h('div', 'phone-content', scr);
    R.css(content, { top: sbh + 'px', height: SH + 'px' });
    const screen = props.screen || {};
    const view = screen._dir || screen._src ? mediaView(content, screen, SW, SH) : null;
    // taps
    const taps = (props.taps || []).map((t) => { const dot = R.h('div', 'tap', content); const ring = R.h('div', 'tap-ring', content); R.css(dot, { left: t.x + 'px', top: t.y + 'px' }); R.css(ring, { left: t.x + 'px', top: t.y + 'px' }); return { t, dot, ring }; });
    // notifications (over status bar + content)
    const notifs = (props.notifications || []).map((n) => { const e = notification(scr, n, SW - 16); R.css(e, { left: '8px', top: sbh + 6 + 'px', zIndex: '9' }); return { n, e }; });
    R.h('div', 'phone-glass', scr);
    return {
      update(lf) {
        if (view) view.update(lf);
        for (const { t, dot, ring } of taps) {
          const d = lf - t.f;
          if (d < 0 || d > 22) { R.set(dot, 'display', 'none'); R.set(ring, 'display', 'none'); continue; }
          R.set(dot, 'display', ''); R.set(ring, 'display', '');
          const pin = E.easeOutCubic(E.clamp01(d / 5));
          const pout = E.clamp01((d - 9) / 10);
          R.set(dot, 'transform', 'scale(' + (0.55 + 0.45 * pin - 0.12 * E.clamp01((d - 2) / 5) * (1 - pout)).toFixed(3) + ')');
          R.set(dot, 'opacity', String(Math.min(pin, 1 - pout).toFixed(3)));
          const r = E.easeOutCubic(E.clamp01((d - 2) / 18));
          R.set(ring, 'transform', 'scale(' + (1 + 1.1 * r).toFixed(3) + ')');
          R.set(ring, 'opacity', String((d < 2 ? 0 : 0.9 * (1 - r)).toFixed(3)));
        }
        for (const { n, e } of notifs) {
          const d = lf - (n.from || 0), dur = n.duration || 90;
          if (d < 0 || d >= dur) { R.set(e, 'display', 'none'); continue; }
          R.set(e, 'display', '');
          const st = notifState(d, dur, e.offsetHeight || 90);
          R.set(e, 'transform', 'translateY(' + st.y.toFixed(2) + 'px)');
          R.set(e, 'opacity', String(st.o.toFixed(3)));
        }
      },
    };
  });

  // ---------- split screen ----------
  // props: left {type, props}, right {type, props}, ratio (0.5), gap (0), divider {color, width, draw (frames)}
  R.register('split', function (el, props, ctx) {
    const ratio = props.ratio || 0.5, gap = props.gap || 0;
    const dv = Object.assign({ color: '#FFC21A', width: 6, draw: 14 }, props.divider || {});
    const lw = Math.round(ctx.box.w * ratio - gap / 2), rw = ctx.box.w - lw - gap;
    const mk = (spec, x, w) => new R.Layer(Object.assign({ from: 0 }, spec, { box: Object.assign({ x, y: 0, w, h: ctx.box.h }, spec.box || {}) }), el, { w, h: ctx.box.h });
    const L = mk(props.left, 0, lw), Rt = mk(props.right, lw + gap, rw);
    const d = R.h('div', 'split-div', el);
    R.css(d, { left: lw + gap / 2 - dv.width / 2 + 'px', width: dv.width + 'px', height: ctx.box.h + 'px', background: dv.color, transformOrigin: '50% 50%', zIndex: '5' });
    return {
      update(lf) {
        L.update(lf); Rt.update(lf);
        const p = dv.draw ? E.easeInOutCubic(E.clamp01(lf / dv.draw)) : 1;
        R.set(d, 'transform', 'scaleY(' + p.toFixed(4) + ')');
      },
    };
  });
})();
