/* BEMEXO compositor — easing + interpolation helpers.
 * UMD: usable from Node (require) and from the browser runtime (window.Easing).
 * Everything is a pure function of the frame number (deterministic).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Easing = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

  // Critically-damped-ish spring normalised to reach 1 at t=1 (no real time involved).
  function springFactory(opts) {
    const o = Object.assign({ damping: 12, stiffness: 180, mass: 1 }, opts || {});
    const w0 = Math.sqrt(o.stiffness / o.mass);
    const zeta = o.damping / (2 * Math.sqrt(o.stiffness * o.mass));
    const T = 1.0; // normalised duration in "seconds" of the simulated spring
    const raw = (t) => {
      const x = t * T * 1.6; // pace so that the settle happens before t=1
      if (zeta < 1) {
        const wd = w0 * Math.sqrt(1 - zeta * zeta);
        return 1 - Math.exp(-zeta * w0 * x) * (Math.cos(wd * x) + (zeta * w0 / wd) * Math.sin(wd * x));
      }
      return 1 - Math.exp(-w0 * x) * (1 + w0 * x);
    };
    const end = raw(1);
    return (t) => { t = clamp01(t); if (t === 1) return 1; return raw(t) / end; };
  }

  const E = {
    linear: (t) => t,
    easeInQuad: (t) => t * t,
    easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
    easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    easeInCubic: (t) => t * t * t,
    easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
    easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    easeInQuart: (t) => t * t * t * t,
    easeOutQuart: (t) => 1 - Math.pow(1 - t, 4),
    easeInOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
    easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
    easeInExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
    easeOutExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    easeInOutExpo: (t) => (t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
    easeOutBack: (t) => { const c1 = 1.2, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    // "calm" premium curve used by default for camera moves (like cubic-bezier(.45,0,.2,1))
    smooth: (t) => { t = clamp01(t); return t * t * (3 - 2 * t) * 0.35 + (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) * 0.65; },
    spring: springFactory({ damping: 14, stiffness: 170 }),
    springSoft: springFactory({ damping: 20, stiffness: 120 }),
    springBouncy: springFactory({ damping: 9, stiffness: 180 }),
    wipe: (t) => 0.5 * t + 0.5 * (-(Math.cos(Math.PI * t) - 1) / 2),
  };
  E.springFactory = springFactory;

  function getEasing(e) {
    if (typeof e === 'function') return e;
    if (!e) return E.easeInOutCubic;
    if (E[e]) return E[e];
    const m = /^cubicBezier\(([^)]+)\)$/.exec(e);
    if (m) { const [a, b, c, d] = m[1].split(',').map(Number); return cubicBezier(a, b, c, d); }
    throw new Error('Unknown easing: ' + e);
  }

  function cubicBezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t;
    const sy = (t) => ((ay * t + by) * t + cy) * t;
    const dsx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
      let t = x;
      for (let i = 0; i < 8; i++) { const d = sx(t) - x; if (Math.abs(d) < 1e-6) break; const dd = dsx(t); if (Math.abs(dd) < 1e-6) break; t -= d / dd; }
      return sy(clamp01(t));
    };
  }

  /**
   * interpolate(frame, [in0, in1, ...], [out0, out1, ...], { easing, clamp })
   * Like Remotion's interpolate. easing may be a name, a function, or an array (one per segment).
   * clamp: true (default) | false | 'left' | 'right'
   */
  function interpolate(frame, inputs, outputs, opts) {
    opts = opts || {};
    const clampMode = opts.clamp === undefined ? true : opts.clamp;
    if (inputs.length !== outputs.length) throw new Error('interpolate: inputs/outputs length mismatch');
    const n = inputs.length;
    if (n === 1) return outputs[0];
    if (frame <= inputs[0] && (clampMode === true || clampMode === 'left')) return outputs[0];
    if (frame >= inputs[n - 1] && (clampMode === true || clampMode === 'right')) return outputs[n - 1];
    let i = 0;
    while (i < n - 2 && frame > inputs[i + 1]) i++;
    const span = inputs[i + 1] - inputs[i];
    let t = span === 0 ? 1 : (frame - inputs[i]) / span;
    const easeSpec = Array.isArray(opts.easing) ? opts.easing[i] : opts.easing;
    const ease = getEasing(easeSpec || 'linear');
    const te = t >= 0 && t <= 1 ? ease(t) : t;
    return outputs[i] + (outputs[i + 1] - outputs[i]) * te;
  }

  /**
   * Keyframe track: [[frame, value, easingIntoThisKey?], ...] or [{f, v, ease}] -> value at frame.
   * value may be a number or an object of numbers (interpolated key by key).
   */
  function track(keys, frame, defaultEase) {
    if (keys === undefined || keys === null) return undefined;
    if (typeof keys === 'number') return keys;
    const ks = keys.map((k) => (Array.isArray(k) ? { f: k[0], v: k[1], ease: k[2] } : { f: k.f, v: k.v !== undefined ? k.v : k, ease: k.ease }));
    if (!ks.length) return undefined;
    if (frame <= ks[0].f) return ks[0].v;
    if (frame >= ks[ks.length - 1].f) return ks[ks.length - 1].v;
    let i = 0;
    while (i < ks.length - 2 && frame >= ks[i + 1].f) i++;
    const a = ks[i], b = ks[i + 1];
    const t = (frame - a.f) / (b.f - a.f || 1);
    const te = getEasing(b.ease || defaultEase || 'easeInOutCubic')(clamp01(t));
    return lerpAny(a.v, b.v, te);
  }

  function lerpAny(a, b, t) {
    if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
    if (a && b && typeof a === 'object') {
      const o = {};
      for (const k of Object.keys(b)) o[k] = typeof a[k] === 'number' && typeof b[k] === 'number' ? a[k] + (b[k] - a[k]) * t : t < 1 ? (a[k] !== undefined ? a[k] : b[k]) : b[k];
      return o;
    }
    return t < 1 ? a : b;
  }

  // Deterministic PRNG (mulberry32)
  function rng(seed) {
    let s = seed >>> 0;
    return function () { s += 0x6d2b79f5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  const FPS = 30;
  const sec = (s, fps) => Math.round(s * (fps || FPS));

  return Object.assign({}, E, { E, getEasing, cubicBezier, interpolate, track, lerpAny, clamp01, rng, sec });
});
