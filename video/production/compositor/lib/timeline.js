// Authoring helpers for compositions (Node side). All values are frames at 30 fps unless stated.
const Easing = require('./easing');

const FPS = 30;
const s = (sec) => Math.round(sec * FPS);

/** Ribbon wipe centred on a cut: the frame is fully covered around `cut`. */
function wipeAt(cut, opts = {}) {
  const dur = opts.dur || 14;
  return { type: 'ribbonWipe', from: cut - Math.floor(dur / 2), duration: dur, z: opts.z !== undefined ? opts.z : 100, props: opts.props || {} };
}

/**
 * Phone slide-in transition (and optional reverse) — returns the anim for the desktop layer/group and
 * the enter/exit presets for the phone layer. `at` is relative to the desktop layer's own start.
 *   const t = phoneSlide({ at: 80, dur: 20, outAt: 170 });
 *   { type:'group', anim: t.desktopAnim, children:[...] }
 *   { type:'phone', from: sceneFrom + 80, enter: t.phoneEnter, exit: t.phoneExit, ... }
 */
function phoneSlide({ at, dur = 20, outAt, outDur = 16, scale = 0.94, dim = 0.74, distance = 1000 }) {
  const desktopAnim = {
    scale: [[at, 1], [at + dur, scale, 'easeInOutCubic']],
    dim: [[at, 0], [at + dur, dim, 'easeInOutCubic']],
  };
  if (outAt !== undefined) {
    desktopAnim.scale.push([outAt, scale], [outAt + outDur, 1, 'easeInOutCubic']);
    desktopAnim.dim.push([outAt, dim], [outAt + outDur, 0, 'easeInOutCubic']);
  }
  return {
    desktopAnim,
    phoneEnter: { preset: 'fromRight', dur, distance, ease: 'easeOutCubic' },
    phoneExit: outAt !== undefined ? { preset: 'toRight', dur: outDur, distance, ease: 'easeInCubic' } : undefined,
  };
}

/** Shift every layer of a scene by `offset` frames (build scenes at 0, then place them). */
function at(offset, layers) {
  return layers.map((l) => Object.assign({}, l, { from: (l.from || 0) + offset }));
}

module.exports = { FPS, s, wipeAt, phoneSlide, at, Easing };
