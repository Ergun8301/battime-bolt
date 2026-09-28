// Key frames for still checks: caption/title midpoints of every scene layer, plus camera keys.
const m = require('./main.js');
const out = new Set();
for (const l of m.layers) {
  if (['caption', 'title', 'chip', 'csvTable', 'alsoStrip', 'outro', 'intro'].includes(l.type) || (l.type === 'phone' && l.anim)) {
    out.add(l.from + Math.min(l.duration - 1, 24));
    if (l.duration > 60) out.add(l.from + Math.round(l.duration * 0.7));
  }
}
console.log([...out].sort((a, b) => a - b).filter((f) => f < m.durationInFrames).join(','));
