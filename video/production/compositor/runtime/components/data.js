/* csvTable component */
(function () {
  const E = window.Easing, R = window.R;
  // numbers, French decimals (151,67), dates (21/09/2026), durations (26h00, 7 h 45), amounts (3 845,16 €), percentages
  const NUM_RE = /^[-+−]?\d[\d\s\u00a0\u202f.,:\/-]*(\s?(h\s?\d{2}|h|€|%|min|j|mn))?$/i;

  let mctx = null;
  function measure(text, font, letterSpacingEm, size) {
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    mctx.font = font;
    return mctx.measureText(text).width + (letterSpacingEm || 0) * size * text.length;
  }

  /**
   * props: file (CSV path, `;` separator, optional BOM), caption (default: file name), meta (default: "N lignes · séparateur ;"),
   *        columns (header names or indices to show), highlight (header names), highlightRows (data row indices),
   *        scroll [[f, rowOffset, ease]], rowHeight (54), headerHeight (60), fontSize (19), labels {header: 'Display name'}
   */
  R.register('csvTable', function (el, props, ctx) {
    const f = props._file || { rows: [], name: 'export.csv' };
    const all = f.rows || [];
    const header = all[0] || [];
    let cols = header.map((_, i) => i);
    if (props.columns) cols = props.columns.map((c) => (typeof c === 'number' ? c : header.indexOf(c))).filter((i) => i >= 0);
    const hiSet = new Set((props.highlight || []).map((c) => (typeof c === 'number' ? c : header.indexOf(c))));
    const hiRows = new Set(props.highlightRows || []);
    const data = all.slice(1);
    // identifiers (matricule 00017, S-0012): mono but left-aligned, never treated as quantities
    const CODE_RE = /^(0\d+|[A-Z]{1,4}-\d+)$/i;
    const code = cols.map((ci) => { const vals = data.map((r) => (r[ci] || '').trim()).filter(Boolean); return vals.length > 0 && vals.filter((v) => CODE_RE.test(v)).length / vals.length >= 0.6; });
    const numeric = cols.map((ci, k) => { if (code[k]) return false; const vals = data.map((r) => (r[ci] || '').trim()).filter(Boolean); return vals.length > 0 && vals.filter((v) => NUM_RE.test(v)).length / vals.length >= 0.6; });
    const labels = props.labels || {};

    const wrap = R.h('div', 'csv-wrap', el);
    const cap = R.h('div', 'csv-cap', wrap);
    const capName = props.caption || f.name;
    const ext = (capName.split('.').pop() || 'csv').toUpperCase();
    cap.innerHTML = '<span class="file"><span class="ext">' + R.esc(ext) + '</span>' + R.esc(capName) + '</span><span class="meta">' + R.esc(props.meta !== undefined ? props.meta : data.length + ' lignes · séparateur ' + (f.delim === '\t' ? 'tab' : f.delim || ';') + (f.bom ? ' · UTF-8 BOM' : ' · UTF-8')) + '</span>';
    const card = R.h('div', 'csv-card', wrap);
    const rh = props.rowHeight || 54, hh = props.headerHeight || 60;
    // a short file gives a card that hugs its rows instead of a tall empty sheet
    card.style.maxHeight = hh + (all.length - 1) * rh + 'px';
    let fs = props.fontSize || 19;

    // column widths from measured text
    const cardW = ctx.box.w;
    const widths = cols.map((ci, k) => {
      const hLabel = labels[header[ci]] || header[ci] || '';
      let w = measure(hLabel.toUpperCase(), '700 15px "JetBrains Mono"', 0.1, 15);
      for (const r of data) { const v = r[ci] || ''; const mono = numeric[k] || code[k]; w = Math.max(w, measure(v, '600 ' + fs + 'px ' + (mono ? '"JetBrains Mono"' : 'Archivo'), mono ? -0.01 : 0, fs)); }
      return w + 34;
    });
    let total = widths.reduce((a, b) => a + b, 0);
    let scale = 1;
    if (total > cardW) { scale = Math.max(0.62, cardW / total); fs = Math.floor(fs * scale * 10) / 10; }
    const extra = Math.max(0, cardW - total * scale);
    const finalW = widths.map((w) => w * scale + extra / widths.length);
    const tpl = finalW.map((w) => w.toFixed(1) + 'px').join(' ');

    const head = R.h('div', 'csv-head', card);
    R.css(head, { gridTemplateColumns: tpl, height: hh + 'px' });
    const ths = cols.map((ci, k) => { const th = R.h('div', 'th' + (numeric[k] ? ' num' : '') + (hiSet.has(ci) ? ' hi' : ''), head, R.esc(labels[header[ci]] || header[ci] || '')); if (scale < 1) th.style.fontSize = Math.max(11, 15 * scale).toFixed(1) + 'px'; return th; });
    const body = R.h('div', 'csv-body', card);
    body.style.top = hh + 'px';
    const rows = data.map((r, ri) => {
      const row = R.h('div', 'csv-row' + (hiRows.has(ri) ? ' hi-row' : ''), body);
      R.css(row, { gridTemplateColumns: tpl, height: rh + 'px' });
      cols.forEach((ci, k) => { const td = R.h('div', 'td' + (numeric[k] ? ' num' : '') + (code[k] ? ' code' : '') + (hiSet.has(ci) ? ' hi' : ''), row, R.esc(r[ci] || '')); td.style.fontSize = fs + 'px'; });
      return row;
    });
    const fade = R.h('div', 'csv-fade', card);
    let visible = Math.ceil((ctx.box.h - hh) / rh) + 1, maxOff = null;
    return {
      update(lf, dur) {
        if (maxOff === null) {
          // real body height (card minus header): the scroll can never go past the last row
          const bodyH = card.clientHeight - hh;
          maxOff = Math.max(0, data.length - bodyH / rh);
          visible = Math.ceil(bodyH / rh) + 1;
        }
        const p = E.easeOutCubic(E.clamp01(lf / 14));
        const out = dur === Infinity ? 0 : E.clamp01((lf - (dur - 8)) / 8);
        R.set(wrap, 'transform', 'translateY(' + ((1 - p) * 24).toFixed(2) + 'px)');
        R.set(wrap, 'opacity', (p * (1 - out)).toFixed(4));
        const off = Math.min(maxOff, Math.max(0, props.scroll ? E.track(props.scroll, lf, 'easeInOutCubic') || 0 : 0));
        R.set(body, 'transform', 'translateY(' + (-off * rh).toFixed(2) + 'px)');
        const first = Math.floor(off);
        rows.forEach((row, i) => {
          const vis = i >= first - 1 && i <= first + visible + 1;
          R.set(row, 'visibility', vis ? '' : 'hidden');
          if (!vis) return;
          const rp = E.easeOutCubic(E.clamp01((lf - 6 - (i - first) * 1.4) / 10));
          R.set(row, 'opacity', rp.toFixed(4));
        });
        ths.forEach((th) => { if (th.classList.contains('hi')) R.setVar(th, '--u', E.easeInOutCubic(E.clamp01((lf - 16) / 12)).toFixed(4)); });
        R.set(fade, 'opacity', off >= maxOff - 0.2 ? '0' : '1');
      },
    };
  });
})();
