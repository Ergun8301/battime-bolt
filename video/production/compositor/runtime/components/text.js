/* Background, text overlays, chip / time-jump card, ribbon wipe, custom html */
(function () {
  const E = window.Easing, R = window.R;
  const X_SVG = (a, b, sw) => '<svg viewBox="0 0 120 120" width="100%" height="100%"><line x1="30" y1="30" x2="90" y2="90" stroke="' + a + '" stroke-width="' + (sw || 20) + '" stroke-linecap="square"/><line x1="30" y1="90" x2="90" y2="30" stroke="' + b + '" stroke-width="' + (sw || 20) + '" stroke-linecap="square"/></svg>';
  R.X_SVG = X_SVG;

  // generic text in/out (rise 24px + fade 12f, exit fade 8f)
  function textIO(lf, dur, o) {
    o = o || {};
    const inD = o.inDur || 12, outD = o.outDur || 8, delay = o.delay || 0, rise = o.rise !== undefined ? o.rise : 24;
    const p = E.easeOutCubic(E.clamp01((lf - delay) / inD));
    let op = p;
    if (dur !== Infinity && o.exit !== false) op *= 1 - E.clamp01((lf - (dur - outD)) / outD);
    return { y: (1 - p) * rise, opacity: op };
  }
  R.textIO = textIO;
  // highlighter sweep: 0..1 -> --hl background-size
  // --hl (percentage) sizes the yellow marker, --hlp (0..1) moves the ink/base colour split of the glyphs with it.
  function sweepHL(root, lf, start, dur) {
    const p = E.easeInOutCubic(E.clamp01((lf - start) / (dur || 10)));
    if (!root._hlBase) {
      root._hlBase = true;
      root.querySelectorAll('.hl').forEach((h) => { h.style.setProperty('--hl-base', getComputedStyle(h.parentElement).color); });
    }
    R.setVar(root, '--hl', (p * 100).toFixed(2) + '%');
    R.setVar(root, '--hlp', p.toFixed(4));
  }
  R.sweepHL = sweepHL;

  function place(el, pos, box, margin) {
    // pos: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'center' | {x, y, anchor}
    const m = margin !== undefined ? margin : 72;
    const w = el.offsetWidth, h = el.offsetHeight;
    let x, y;
    if (pos && typeof pos === 'object') {
      const an = pos.anchor || 'top-left';
      x = pos.x; y = pos.y;
      if (/center$/.test(an) || an === 'center') x -= w / 2; else if (/right$/.test(an)) x -= w;
      if (/^bottom/.test(an)) y -= h; else if (an === 'center' || /^middle/.test(an)) y -= h / 2;
    } else {
      const p = pos || 'bottom-center';
      x = /left/.test(p) ? m : /right/.test(p) ? box.w - m - w : (box.w - w) / 2;
      y = /^top/.test(p) ? m : /^bottom/.test(p) ? box.h - m - h : (box.h - h) / 2;
    }
    R.css(el, { left: Math.round(x) + 'px', top: Math.round(y) + 'px' });
  }
  R.place = place;

  // ---------- background ----------
  // props: variant 'black'|'ink'|'cream'|'parchment'|'color', color, watermark (bool|{opacity,size,x,y,rotate,drift}), noise (bool)
  R.register('background', function (el, props, ctx) {
    const v = props.variant || 'black';
    const bg = R.h('div', 'fill bg-' + (v === 'color' ? 'ink' : v), el);
    if (v === 'color' || props.color) bg.style.background = props.color;
    const dark = v === 'black' || v === 'ink' || (v === 'color' && props.dark);
    let wm = null, wmo = null;
    if (props.watermark !== false && props.watermark !== undefined) {
      wmo = Object.assign({ opacity: dark ? 0.06 : 0.05, size: 1500, x: ctx.box.w * 0.72, y: ctx.box.h * 0.62, rotate: 12, drift: 0.035 }, props.watermark === true ? {} : props.watermark);
      wm = R.h('div', 'bg-watermark', bg, dark ? X_SVG('#F2EDE3', '#FFC21A') : X_SVG('#15120F', '#15120F'));
      R.css(wm, { width: wmo.size + 'px', height: wmo.size + 'px', left: wmo.x - wmo.size / 2 + 'px', top: wmo.y - wmo.size / 2 + 'px', opacity: String(wmo.opacity) });
    }
    if (props.noise !== false) {
      const n = R.h('div', 'fill bg-noise' + (dark ? ' on-dark' : ''), bg);
      n.style.backgroundImage = 'url(' + R.noise() + ')';
    }
    if (props.ribbon) {
      const r = R.h('div', 'hatch', bg);
      const rb = Object.assign({ edge: 'top-right', w: 220, h: 10 }, props.ribbon === true ? {} : props.ribbon);
      R.css(r, { position: 'absolute', width: rb.w + 'px', height: rb.h + 'px', background: 'repeating-linear-gradient(45deg,#15120F 0 8px,#FFC21A 8px 16px)' });
      if (/top/.test(rb.edge)) r.style.top = '0'; else r.style.bottom = '0';
      if (/right/.test(rb.edge)) r.style.right = '0'; else r.style.left = '0';
    }
    return {
      update(lf, dur) {
        if (wm) {
          const t = dur === Infinity ? 0 : lf / Math.max(1, dur);
          const s = 1 + wmo.drift * t;
          R.set(wm, 'transform', 'rotate(' + (wmo.rotate + 2 * t).toFixed(3) + 'deg) scale(' + s.toFixed(5) + ')');
        }
      },
    };
  });

  // ---------- (a) kicker « 03 · PROUVER » ----------
  // props: text ('03 · PROUVER') | num + label, position ('top-left'), theme ('dark'|'light'), ribbon (true), margin
  R.register('kicker', function (el, props, ctx) {
    const k = R.h('div', 'kicker' + (props.theme === 'light' ? ' light' : ''), el);
    let num = props.num, label = props.label;
    if (props.text && num === undefined) { const m = /^(\d+)\s*·\s*(.*)$/.exec(props.text); if (m) { num = m[1]; label = m[2]; } else label = props.text; }
    k.innerHTML = (props.ribbon !== false ? '<span class="rib"></span>' : '') + (num !== undefined ? '<span class="num">' + R.esc(num) + '</span><span class="sep">·</span>' : '') + '<span>' + R.esc(label || '') + '</span>';
    let placed = false;
    return {
      update(lf, dur) {
        if (!placed) { place(k, props.position || 'top-left', ctx.box, props.margin !== undefined ? props.margin : 64); placed = true; }
        const io = textIO(lf, dur, { rise: 0, inDur: 12 });
        const x = (1 - E.easeOutCubic(E.clamp01(lf / 14))) * -18;
        R.set(k, 'transform', 'translateX(' + x.toFixed(2) + 'px)');
        R.set(k, 'opacity', io.opacity.toFixed(4));
      },
    };
  });

  // ---------- (b) title / lower-third ----------
  // props: text ('Le bureau voit {tout}'), sub, position ('bottom-center'|'bottom-left'|...), size (50), theme ('dark'|'light'), ribbon (true), maxWidth, margin
  R.register('title', function (el, props, ctx) {
    const t = R.h('div', 'lt' + (props.theme === 'light' ? ' light' : ''), el);
    t.innerHTML = (props.ribbon !== false ? '<span class="rib"></span>' : '') + '<span class="main">' + R.rich(props.text || '') + '</span>' + (props.sub ? '<span class="sub">' + R.rich(props.sub) + '</span>' : '');
    if (props.size) t.style.fontSize = props.size + 'px';
    if (props.maxWidth) { t.style.whiteSpace = 'normal'; t.style.maxWidth = props.maxWidth + 'px'; }
    let placed = false;
    return {
      update(lf, dur) {
        if (!placed) { place(t, props.position || 'bottom-center', ctx.box, props.margin !== undefined ? props.margin : 64); placed = true; }
        const io = textIO(lf, dur, { delay: props.delay || 0 });
        R.set(t, 'transform', 'translateY(' + io.y.toFixed(2) + 'px)');
        R.set(t, 'opacity', io.opacity.toFixed(4));
        sweepHL(t, lf, (props.delay || 0) + 7, 11);
      },
    };
  });

  // ---------- (c) side caption for phone scenes ----------
  // props: kicker, text (lines separated by \n, {highlight}), body, theme ('light' = dark text on cream | 'dark'), x, y (top-left), width, size (84), align
  R.register('caption', function (el, props, ctx) {
    if (props.scrim) {
      // soft gradient behind the text (dark theme: ink, light theme: cream) so it reads over busy content
      const sc = R.h('div', 'fill', el);
      const col = props.theme === 'dark' ? '21,18,15' : '242,237,227';
      const a = typeof props.scrim === 'number' ? props.scrim : 0.8;
      sc.style.background = 'linear-gradient(90deg, rgba(' + col + ',' + a + ') 0%, rgba(' + col + ',' + a * 0.85 + ') 38%, rgba(' + col + ',0) 62%)';
      el._scrim = sc;
    }
    const c = R.h('div', 'cap' + (props.theme === 'dark' ? ' dark' : ''), el);
    const x = props.x !== undefined ? props.x : 150, y = props.y;
    R.css(c, { left: x + 'px', width: (props.width || 760) + 'px', textAlign: props.align || 'left' });
    const parts = [];
    if (props.kicker) { const k = R.h('div', 'cap-k', c, '<span class="rib"></span><span>' + R.esc(props.kicker) + '</span>'); parts.push(k); }
    const tt = R.h('div', 'cap-t', c);
    if (props.size) tt.style.fontSize = props.size + 'px';
    String(props.text || '').split('\n').forEach((line) => parts.push(R.h('span', 'line', tt, R.rich(line))));
    if (props.body) parts.push(R.h('div', 'cap-b', c, R.rich(props.body)));
    let placed = false;
    return {
      update(lf, dur) {
        if (!placed) { const h = c.offsetHeight; c.style.top = (y !== undefined ? y : (ctx.box.h - h) / 2) + 'px'; placed = true; }
        parts.forEach((p, i) => {
          const io = textIO(lf, dur, { delay: (props.delay || 0) + i * 5, outDur: 8 });
          R.set(p, 'transform', 'translateY(' + io.y.toFixed(2) + 'px)');
          R.set(p, 'opacity', io.opacity.toFixed(4));
        });
        sweepHL(c, lf, (props.delay || 0) + parts.length * 5 + 4, 12);
        if (el._scrim) R.set(el._scrim, 'opacity', textIO(lf, dur, { delay: props.delay || 0, inDur: 16 }).opacity.toFixed(4));
      },
    };
  });

  // ---------- (d) chip « 16:45 » / time-jump card ----------
  // props: text, sub, icon ('clock'|'calendar'|'none'), variant ('chip'|'card'), position ('top-center'), margin, dim (card only, 0.62)
  const ICONS = {
    clock: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="#FFC21A" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/></svg>',
    calendar: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="#FFC21A" stroke-width="2.2" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    none: '',
  };
  R.register('chip', function (el, props, ctx) {
    if (props.variant === 'card') {
      const dim = R.h('div', 'jump-dim', el);
      if (props.dim !== undefined) dim.style.background = 'rgba(21,18,15,' + props.dim + ')';
      const card = R.h('div', 'jump-card', el, '<span class="rib"></span><div class="big">' + R.esc(props.text || '') + '</div>' + (props.sub ? '<div class="lbl">' + R.esc(props.sub) + '</div>' : ''));
      if (props.size) card.querySelector('.big').style.fontSize = props.size + 'px';
      return {
        update(lf, dur) {
          const p = E.easeOutCubic(E.clamp01(lf / 12));
          const out = dur === Infinity ? 0 : E.clamp01((lf - (dur - 8)) / 8);
          R.set(dim, 'opacity', (E.clamp01(lf / 8) * (1 - out)).toFixed(4));
          R.set(card, 'transform', 'translate(-50%,-50%) scale(' + (0.94 + 0.06 * p).toFixed(5) + ')');
          R.set(card, 'opacity', (p * (1 - out)).toFixed(4));
        },
      };
    }
    const c = R.h('div', 'chip', el, (ICONS[props.icon || 'clock'] || '') + '<span>' + R.esc(props.text || '') + '</span>' + (props.sub ? '<span class="sub">' + R.esc(props.sub) + '</span>' : ''));
    let placed = false;
    return {
      update(lf, dur) {
        if (!placed) { place(c, props.position || 'top-center', ctx.box, props.margin !== undefined ? props.margin : 64); placed = true; }
        const p = E.easeOutCubic(E.clamp01(lf / 12));
        const out = dur === Infinity ? 0 : E.clamp01((lf - (dur - 8)) / 8);
        R.set(c, 'transform', 'translateY(' + (-(1 - p) * 14).toFixed(2) + 'px) scale(' + (0.96 + 0.04 * p).toFixed(4) + ')');
        R.set(c, 'opacity', (p * (1 - out)).toFixed(4));
      },
    };
  });

  // ---------- ribbon wipe ----------
  // Place it so that its middle frame is the cut: from = cut - floor(duration/2). Covers the whole frame around the middle.
  // props: fill ('#15120F'), hatch (px, 110), stripe (px, 16), hold (px of extra solid, 520), direction ('down-right'|'up-right'), ease ('wipe')
  R.register('ribbonWipe', function (el, props, ctx) {
    const W = ctx.box.w, H = ctx.box.h;
    const hatch = props.hatch !== undefined ? props.hatch : 110, stripe = props.stripe || 16, hold = props.hold !== undefined ? props.hold : 520;
    const D = (W + H) / Math.SQRT2; // extent of the frame along the diagonal axis
    const B = D + 2 * hold; // solid body length
    const T = hatch * 2 + B;
    const L = (W + H) * 1.2; // band length (long side)
    el.style.overflow = 'hidden';
    const rot = R.h('div', '', el);
    const dir = props.direction || 'down-right';
    // axis u points down-right (or up-right); band perpendicular to u
    const ang = dir === 'up-right' ? -45 : 45;
    R.css(rot, { position: 'absolute', left: '0', top: dir === 'up-right' ? H + 'px' : '0', width: '0', height: '0', transform: 'rotate(' + ang + 'deg)' });
    const band = R.h('div', '', rot);
    R.css(band, { position: 'absolute', top: -L / 2 + 'px', height: L + 'px', width: T + 'px', display: 'flex' });
    const h1 = R.h('div', '', band), body = R.h('div', '', band), h2 = R.h('div', '', band);
    // stripes at 45° on screen: in the rotated frame they must be at 0/90deg; we rotate them back by -ang so the stripes keep the brand 45° look
    const brand = 'repeating-linear-gradient(' + (45 - ang) + 'deg,#15120F 0 ' + stripe / 2 + 'px,#FFC21A ' + stripe / 2 + 'px ' + stripe + 'px)';
    R.css(h1, { width: hatch + 'px', height: '100%', background: brand, flex: 'none' });
    R.css(body, { width: B + 'px', height: '100%', background: props.fill || '#15120F', flex: 'none' });
    R.css(h2, { width: hatch + 'px', height: '100%', background: brand, flex: 'none' });
    const ease = E.getEasing(props.ease || 'wipe');
    return {
      update(lf, dur) {
        const d = dur === Infinity ? 14 : dur;
        const t = ease(E.clamp01((lf + 0.5) / d));
        const s = -T + (D + T) * t; // band start along the axis
        R.set(band, 'transform', 'translateX(' + s.toFixed(2) + 'px)');
      },
    };
  });

  // ---------- generic text ----------
  // props: html | text, style {css}, className, io (true: rise/fade in-out)
  R.register('text', function (el, props, ctx) {
    const t = R.h('div', props.className || '', el, props.html || R.rich(props.text || ''));
    R.css(t, Object.assign({ position: 'absolute' }, props.style || {}));
    return {
      update(lf, dur) {
        if (props.io === false) return;
        const io = textIO(lf, dur, { delay: props.delay || 0 });
        R.set(t, 'transform', 'translateY(' + io.y.toFixed(2) + 'px)');
        R.set(t, 'opacity', io.opacity.toFixed(4));
        sweepHL(t, lf, (props.delay || 0) + 7, 11);
      },
    };
  });

  // ---------- custom html layer ----------
  // props: html, css; render(lf, el, props, R, E) — a self-contained function (it is serialised with toString())
  R.register('html', function (el, props, ctx) {
    if (props.css) { const s = document.createElement('style'); s.textContent = props.css; document.head.appendChild(s); }
    if (props.html) el.innerHTML = props.html;
    const fn = ctx.spec.render || props.render;
    let state = {};
    if (props.mount) props.mount(el, props, R, E, state);
    return { update(lf, dur) { if (fn) fn(lf, el, props, R, E, state, dur); } };
  });
})();
