/* Brand scenes: intro (270f), outro (240f), alsoStrip (« Et aussi… ») */
(function () {
  const E = window.Easing, R = window.R, B = window.BRAND;
  const C = (t) => E.clamp01(t);
  const eio = E.easeInOutCubic, eo = E.easeOutCubic;

  function wordmarkSVG(parent, k, parts) {
    const wm = B.wordmark;
    const svgs = {};
    (parts || ['beme', 'x', 'o']).forEach((name) => {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', wm.viewBox); s.setAttribute('width', (1061 * k).toFixed(2)); s.setAttribute('height', (166.2 * k).toFixed(2));
      s.style.position = 'absolute'; s.style.left = '0'; s.style.top = '0'; s.style.overflow = 'visible';
      s.innerHTML = '<g transform="translate(70 209.8)"><path d="' + wm.parts[name].d + '" fill="' + wm.parts[name].fill + '"/></g>';
      parent.appendChild(s); svgs[name] = s;
    });
    return svgs;
  }
  // place a wordmark container so that the visible glyph bounds are centred on (cx, cy)
  function wordmarkBox(parent, k, cx, cy) {
    const box = R.h('div', '', parent);
    const b = B.wordmark.bounds;
    const left = cx - ((b.x0 + b.x1) / 2) * k, top = cy - ((b.y0 + b.y1) / 2 - 58) * k;
    R.css(box, { position: 'absolute', left: left.toFixed(2) + 'px', top: top.toFixed(2) + 'px', width: 1061 * k + 'px', height: 166.2 * k + 'px' });
    return box;
  }
  R.wordmarkSVG = wordmarkSVG; R.wordmarkBox = wordmarkBox;

  function bg(el, variant) {
    const b = R.h('div', 'fill bg-' + (variant || 'black'), el);
    const n = R.h('div', 'fill bg-noise on-dark', b); n.style.backgroundImage = 'url(' + R.noise() + ')';
    return b;
  }

  // ======================= INTRO =======================
  /** props: kicker ('POINTAGE · PLANNING · PAIE — BTP'), chips (['FEUILLES PAPIER','SMS','RESSAISIE']), title ('Une seule saisie. {Tout suit.}') */
  R.register('intro', function (el, props, ctx) {
    const W = ctx.box.w, H = ctx.box.h;
    bg(el, 'black');
    const stage = R.h('div', 'fill', el);
    stage.style.transformOrigin = '50% 45%';

    // 1) ribbon pass (corner to corner)
    const ang = -Math.atan2(H, W) * 180 / Math.PI;
    const Lr = Math.hypot(W, H) + 240, th = 34;
    const rw = R.h('div', '', el);
    R.css(rw, { position: 'absolute', left: W / 2 + 'px', top: H / 2 + 'px', width: '0', height: '0', transform: 'rotate(' + ang.toFixed(3) + 'deg)' });
    const rib = R.h('div', '', rw);
    R.css(rib, { position: 'absolute', left: -Lr / 2 + 'px', top: -th / 2 + 'px', width: Lr + 'px', height: th + 'px',
      background: 'repeating-linear-gradient(' + (45 - ang).toFixed(3) + 'deg,#15120F 0 11px,#FFC21A 11px 22px)', boxShadow: '0 0 0 1px rgba(255,194,26,.25)' });

    // 2) X drawn with strokes
    const k = props.wordmarkScale || 0.95;
    const Ywm = props.wordmarkY || 418;
    const b = B.wordmark.bounds, xg = B.wordmark.xGlyph;
    const xs = 200; // px box of the stroke X (viewBox 120)
    const xWrap = R.h('div', '', stage);
    R.css(xWrap, { position: 'absolute', left: W / 2 - xs / 2 + 'px', top: Ywm - xs / 2 + 'px', width: xs + 'px', height: xs + 'px', zIndex: '2' });
    xWrap.innerHTML = '<svg viewBox="0 0 120 120" width="' + xs + '" height="' + xs + '" style="overflow:visible"><line class="la" x1="22.93" y1="22.93" x2="97.07" y2="97.07" stroke="#F2EDE3" stroke-width="20" stroke-linecap="butt" pathLength="100" stroke-dasharray="100 100"/><line class="lb" x1="22.93" y1="97.07" x2="97.07" y2="22.93" stroke="#FFC21A" stroke-width="20" stroke-linecap="butt" pathLength="100" stroke-dasharray="100 100"/></svg>';
    const la = xWrap.querySelector('.la'), lb = xWrap.querySelector('.lb');
    // glyph X target (screen)
    const gx = W / 2 + ((xg.x0 + xg.x1) / 2 - (b.x0 + b.x1) / 2) * k;
    const gy = Ywm + ((xg.y0 + xg.y1) / 2 - (b.y0 + b.y1) / 2) * k;
    const strokeExtent = (80 / 120) * xs; // visual extent of the stroke X
    const glyphH = (xg.y1 - xg.y0) * k;
    const endScale = (glyphH * 1.02) / strokeExtent;

    // 3) wordmark parts
    const wbox = wordmarkBox(stage, k, W / 2, Ywm);
    const parts = wordmarkSVG(wbox, k);
    // reveal: BEME uncovers leftwards from behind the X, O rightwards
    const bemeW = (xg.x0 - b.x0) * k, oW = (b.x1 - xg.x1) * k;

    // 4) kicker
    const kick = R.h('div', 'i-kicker', stage, R.esc(props.kicker || 'POINTAGE · PLANNING · PAIE — BTP').replace(/·/g, '<span class="sep">·</span>').replace(/—/g, '<span class="sep">—</span>'));
    kick.style.top = Ywm + 118 + 'px';

    // 5) chips
    const chipTexts = props.chips || ['FEUILLES PAPIER', 'SMS', 'RESSAISIE'];
    const row = R.h('div', '', stage);
    R.css(row, { position: 'absolute', left: '0', top: (props.chipsY || 668) + 'px', width: W + 'px', height: '64px' });
    const chips = chipTexts.map((t) => { const c = R.h('div', 'i-chip', row, '<span class="tx">' + R.esc(t) + '</span><span class="strike"></span>'); return c; });
    let laidOut = false;
    // 6) title
    const title = R.h('div', 'i-title', stage, R.rich(props.title || 'Une seule saisie. {Tout suit.}'));
    title.style.top = (props.titleY || 640) + 'px';

    const T = Object.assign({ ribbon: 0, xa: 34, xb: 50, merge: 78, kicker: 108, chips: 122, chipGap: 16, strike: 12, swap: 186 }, props.timing || {});
    return {
      update(lf) {
        if (!laidOut) {
          const ws = chips.map((c) => c.offsetWidth); const gap = 26; const tot = ws.reduce((a, b2) => a + b2, 0) + gap * (ws.length - 1);
          let x = (W - tot) / 2; chips.forEach((c, i) => { c.style.left = x + 'px'; x += ws[i] + gap; });
          laidOut = true;
        }
        // global slow push-in
        R.set(stage, 'transform', 'scale(' + (1 + 0.018 * eio(C(lf / 270))).toFixed(5) + ')');
        // ribbon
        const hp = eio(C((lf - T.ribbon - 2) / 30)), tp = eio(C((lf - T.ribbon - 16) / 30));
        R.set(rib, 'clipPath', 'inset(0 ' + ((1 - hp) * Lr).toFixed(1) + 'px 0 ' + (tp * Lr).toFixed(1) + 'px)');
        R.set(rw, 'display', lf > T.ribbon + 48 ? 'none' : '');
        // X strokes
        const pa = eio(C((lf - T.xa) / 20)), pb = eio(C((lf - T.xb) / 20));
        la.setAttribute('stroke-dashoffset', (100 - 100 * pa).toFixed(2)); R.set(la, 'opacity', pa > 0.001 ? '1' : '0');
        lb.setAttribute('stroke-dashoffset', (100 - 100 * pb).toFixed(2)); R.set(lb, 'opacity', pb > 0.001 ? '1' : '0');
        // merge into wordmark
        const pm = eio(C((lf - T.merge) / 24));
        const sc = 1 + (endScale - 1) * pm;
        R.set(xWrap, 'transform', 'translate(' + ((gx - W / 2) * pm).toFixed(2) + 'px,' + ((gy - Ywm) * pm).toFixed(2) + 'px) scale(' + sc.toFixed(5) + ')');
        const cross = C((lf - T.merge - 14) / 10);
        R.set(xWrap, 'opacity', (1 - cross).toFixed(4));
        R.set(parts.x, 'opacity', cross.toFixed(4));
        const rv = eo(C((lf - T.merge - 8) / 22));
        R.set(parts.beme, 'clipPath', 'inset(0 ' + ((1061 * k) - (xg.x0 * k)).toFixed(1) + 'px 0 ' + (b.x0 * k - 4 + (1 - rv) * bemeW).toFixed(1) + 'px)');
        R.set(parts.beme, 'transform', 'translateX(' + ((1 - rv) * 46).toFixed(2) + 'px)');
        R.set(parts.o, 'clipPath', 'inset(0 ' + ((1061 - b.x1) * k - 4 + (1 - rv) * oW).toFixed(1) + 'px 0 ' + (xg.x1 * k).toFixed(1) + 'px)');
        R.set(parts.o, 'transform', 'translateX(' + (-(1 - rv) * 46).toFixed(2) + 'px)');
        R.set(parts.beme, 'opacity', rv > 0 ? '1' : '0'); R.set(parts.o, 'opacity', rv > 0 ? '1' : '0');
        // kicker
        const pk = eo(C((lf - T.kicker) / 14));
        R.set(kick, 'opacity', pk.toFixed(4)); R.set(kick, 'transform', 'translateY(' + ((1 - pk) * 16).toFixed(2) + 'px)');
        // chips
        const out = C((lf - T.swap) / 9);
        chips.forEach((c, i) => {
          const t0 = T.chips + i * T.chipGap;
          const p = eo(C((lf - t0) / 10));
          const s = eio(C((lf - t0 - T.strike) / 9));
          R.set(c, 'opacity', (p * (1 - out)).toFixed(4));
          R.set(c, 'transform', 'translateY(' + ((1 - p) * 18 + out * 14).toFixed(2) + 'px)');
          R.set(c.lastChild, 'transform', 'scaleX(' + s.toFixed(4) + ')');
          R.set(c.firstChild, 'opacity', (1 - 0.38 * s).toFixed(3));
        });
        // title
        const pt = eo(C((lf - T.swap - 6) / 14));
        R.set(title, 'opacity', pt.toFixed(4)); R.set(title, 'transform', 'translateY(' + ((1 - pt) * 24).toFixed(2) + 'px)');
        R.sweepHL(title, lf, T.swap + 16, 12);
      },
    };
  });

  // ======================= OUTRO =======================
  /**
   * props: thumbs [{src|dir, label?, camera?}] x6, labels (default PLANIFIER…PAYER), line ('BEMEXO — Du chantier à la paie, {sans ressaisie.}'),
   *        url ('bemexo.com'), offer ('Essai gratuit 30 jours, sans engagement'), legal ('Données de démonstration fictives'), mosaicEnd (63)
   */
  R.register('outro', function (el, props, ctx) {
    const W = ctx.box.w, H = ctx.box.h;
    const labels = props.labels || ['PLANIFIER', 'POINTER', 'PROUVER', 'CONTRÔLER', 'PILOTER', 'PAYER'];
    const cut = props.mosaicEnd || 63;
    // phase A: mosaic
    const A = R.h('div', 'fill', el);
    bg(A, 'black');
    const grid = R.h('div', 'fill', A); grid.style.transformOrigin = '50% 50%';
    const cw = 540, chh = 304, gap = 30;
    const gx0 = (W - (3 * cw + 2 * gap)) / 2, gy0 = (H - (2 * chh + gap)) / 2;
    const cards = (props.thumbs || []).slice(0, 6).map((t, i) => {
      const c = R.h('div', 'o-card', grid);
      const x = gx0 + (i % 3) * (cw + gap), y = gy0 + Math.floor(i / 3) * (chh + gap);
      R.css(c, { left: x + 'px', top: y + 'px', width: cw + 'px', height: chh + 'px' });
      const inner = R.h('div', 'fill', c); inner.style.transformOrigin = '50% 50%';
      const view = t && (t._dir || t._src) ? R.mediaView(inner, Object.assign({ camera: 'cover' }, t), cw, chh) : null;
      R.h('div', 'lbl', c, '<span class="n">' + String(i + 1).padStart(2, '0') + '</span><span>·</span><span>' + R.esc((t && t.label) || labels[i] || '') + '</span>');
      return { c, inner, view };
    });
    // phase B: wipe (built-in)
    const wipe = new R.Layer({ type: 'ribbonWipe', from: cut - 7, duration: 14, props: props.wipe || {} }, el, { w: W, h: H });
    // phase C: end card
    const Cc = R.h('div', 'fill', el);
    bg(Cc, 'black');
    const wmY = props.wordmarkY || 400;
    const k = props.wordmarkScale || 0.8;
    const wbox = wordmarkBox(Cc, k, W / 2, wmY);
    wordmarkSVG(wbox, k);
    const line = R.h('div', 'o-line', Cc, R.rich(props.line || 'BEMEXO — Du chantier à la paie, {sans ressaisie.}'));
    line.style.top = wmY + 118 + 'px';
    const url = R.h('div', 'o-url', Cc, '<b>' + R.esc(props.url || 'bemexo.com') + '</b> <span class="sep">·</span> ' + R.esc(props.offer || 'Essai gratuit 30 jours, sans engagement'));
    url.style.top = wmY + 236 + 'px';
    const legal = R.h('div', 'o-legal', Cc, R.esc(props.legal || 'Données de démonstration fictives'));
    return {
      update(lf) {
        const inA = lf < cut;
        R.set(A, 'display', inA ? '' : 'none');
        R.set(Cc, 'display', inA ? 'none' : '');
        if (inA) {
          R.set(grid, 'transform', 'scale(' + (1.0 + 0.03 * eio(C(lf / cut))).toFixed(5) + ')');
          cards.forEach(({ c, inner, view }, i) => {
            const p = eo(C((lf - 2 - i * 4) / 10));
            R.set(c, 'opacity', p.toFixed(4));
            R.set(c, 'transform', 'translateY(' + ((1 - p) * 26).toFixed(2) + 'px) scale(' + (0.92 + 0.08 * p).toFixed(5) + ')');
            R.set(inner, 'transform', 'scale(' + (1 + 0.06 * C(lf / cut)).toFixed(5) + ')');
            if (view) view.update(lf);
          });
        } else {
          const l2 = lf - cut;
          R.set(wbox, 'opacity', eo(C((l2 - 2) / 18)).toFixed(4));
          R.set(wbox, 'transform', 'scale(' + (0.96 + 0.04 * eo(C((l2 - 2) / 22))).toFixed(5) + ')');
          const pl = eo(C((l2 - 22) / 14));
          R.set(line, 'opacity', pl.toFixed(4)); R.set(line, 'transform', 'translateY(' + ((1 - pl) * 24).toFixed(2) + 'px)');
          R.sweepHL(line, l2, 34, 12);
          const pu = eo(C((l2 - 44) / 14));
          R.set(url, 'opacity', pu.toFixed(4)); R.set(url, 'transform', 'translateY(' + ((1 - pu) * 18).toFixed(2) + 'px)');
          R.set(legal, 'opacity', eo(C((l2 - 56) / 12)).toFixed(4));
        }
        wipe.update(lf);
      },
    };
  });

  // ======================= « Et aussi… » strip =======================
  /** props: title ('Et aussi…'), kicker, items [{src|dir, label, camera, startFrame, ...}] (4), per (45), lead (0), theme ('light'|'dark') */
  R.register('alsoStrip', function (el, props, ctx) {
    const W = ctx.box.w, H = ctx.box.h;
    const dark = props.theme === 'dark';
    if (props.background !== false) {
      const b = R.h('div', 'fill bg-' + (dark ? 'black' : 'cream'), el);
      const n = R.h('div', 'fill bg-noise' + (dark ? ' on-dark' : ''), b); n.style.backgroundImage = 'url(' + R.noise() + ')';
      const wm = R.h('div', 'bg-watermark', b, R.X_SVG(dark ? '#F2EDE3' : '#15120F', dark ? '#FFC21A' : '#15120F'));
      R.css(wm, { width: '1400px', height: '1400px', left: W * 0.78 - 700 + 'px', top: H * 0.6 - 700 + 'px', opacity: dark ? '.06' : '.045', transform: 'rotate(12deg)' });
    }
    const per = props.per || 45, lead = props.lead || 0;
    const items = props.items || [];
    const cw = props.cardW || 1360, chh = Math.round(cw * 9 / 16);
    const cx0 = (W - cw) / 2, cy0 = props.cardY || 218;
    const kick = props.kicker ? R.h('div', 'ea-k', el, '<span class="rib"></span><span>' + R.esc(props.kicker) + '</span>') : null;
    if (kick) R.css(kick, { left: cx0 + 'px', top: '70px' });
    const title = R.h('div', 'ea-title' + (dark ? ' dark' : ''), el, R.rich(props.title || 'Et aussi…'));
    R.css(title, { left: cx0 + 'px', top: (kick ? 112 : 98) + 'px' });
    const prog = R.h('div', 'ea-prog' + (dark ? ' dark' : ''), el);
    const segs = items.map(() => R.h('i', '', R.h('div', 'seg', prog)));
    R.css(prog, { right: W - cx0 - cw + 'px', top: (kick ? 146 : 132) + 'px' });
    const cards = items.map((it, i) => {
      const c = R.h('div', 'ea-card', el);
      R.css(c, { left: cx0 + 'px', top: cy0 + 'px', width: cw + 'px', height: chh + 'px' });
      const inner = R.h('div', 'fill', c); inner.style.transformOrigin = '50% 50%';
      const view = it._dir || it._src ? R.mediaView(inner, Object.assign({ camera: 'cover' }, it), cw, chh) : null;
      const lbl = R.h('div', 'ea-lbl', el, '<span class="n">' + String(i + 1).padStart(2, '0') + '</span><span>' + R.rich(it.label || '') + '</span>');
      R.css(lbl, { left: cx0 + 36 + 'px', top: cy0 + chh - 36 - 68 + 'px' });
      return { c, inner, view, lbl };
    });
    return {
      update(lf, dur) {
        const pt = eo(C(lf / 12));
        R.set(title, 'opacity', pt.toFixed(4)); R.set(title, 'transform', 'translateY(' + ((1 - pt) * 24).toFixed(2) + 'px)');
        if (kick) R.set(kick, 'opacity', pt.toFixed(4));
        R.set(prog, 'opacity', pt.toFixed(4));
        const exitP = dur === Infinity ? 0 : C((lf - (dur - 8)) / 8);
        cards.forEach(({ c, inner, view, lbl }, i) => {
          const t0 = lead + i * per, t1 = t0 + per;
          const d = lf - t0;
          const isLast = i === cards.length - 1;
          let x;
          if (d < 0) x = W; // waiting on the right
          else if (i === 0 && d < 12) x = (1 - E.easeOutQuart(C(d / 12))) * 120; // first card: short settle
          else if (i > 0 && d < 12) x = (1 - E.easeOutQuart(C(d / 12))) * (W - cx0);
          else x = 0;
          if (!isLast && lf >= t1) x = -E.easeInOutCubic(C((lf - t1) / 12)) * (cx0 + cw + 60);
          const visible = d >= 0 && x > -(cx0 + cw + 40);
          R.set(c, 'display', visible ? '' : 'none'); R.set(lbl, 'display', visible ? '' : 'none');
          if (!visible) { R.set(segs[i], 'transform', 'scaleX(' + (lf >= t1 ? 1 : 0) + ')'); return; }
          const fadeIn = i === 0 ? eo(C(d / 12)) : 1;
          R.set(c, 'transform', 'translateX(' + x.toFixed(2) + 'px)');
          R.set(c, 'opacity', fadeIn.toFixed(4));
          R.set(inner, 'transform', 'scale(' + (1.0 + 0.05 * C(d / (per + 12))).toFixed(5) + ')');
          if (view) view.update(Math.max(0, d));
          const pl = eo(C((d - 8) / 10));
          R.set(lbl, 'transform', 'translateX(' + x.toFixed(2) + 'px) translateY(' + ((1 - pl) * 18).toFixed(2) + 'px)');
          R.set(lbl, 'opacity', (pl * (1 - exitP)).toFixed(4));
          R.set(segs[i], 'transform', 'scaleX(' + C(d / per).toFixed(4) + ')');
        });
      },
    };
  });
})();
