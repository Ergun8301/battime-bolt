// BEMEXO — Du chantier à la paie, sans ressaisie. (assemblage final)
const { at, wipeAt } = require('../compositor/lib/timeline');
const C = require('./comp');
const path = require('path');

const INTRO = 270, OUTRO = 210;
const scenes = [C.scenePlanifier(), C.scenePointer(), C.sceneProuver(), C.sceneControler(), C.scenePiloter(), C.scenePayer(), C.sceneAussi()];
const layers = [{ type: 'intro', from: 0, duration: INTRO }];
const cuts = [];
let t = INTRO;
for (const s of scenes) { cuts.push(t); layers.push(...at(t, s.layers)); t += s.D; }
cuts.push(t);
const thumbs = [
  { ...scenes[0].thumb, label: 'PLANIFIER' },
  { ...scenes[1].thumb, label: 'POINTER' },
  { ...scenes[2].thumb, label: 'PROUVER' },
  { ...scenes[3].thumb, label: 'CONTRÔLER' },
  { ...scenes[4].thumb, label: 'PILOTER' },
  { dir: C.dir('paie'), startFrame: C.take('paie').frames - 40, camera: C.R(470, 290, 2260), label: 'PAYER' },
];
layers.push({ type: 'outro', from: t, duration: OUTRO, props: { thumbs, line: 'BEMEXO — Du chantier à la paie, {sans ressaisie.}' } });
for (const c of cuts) layers.push(wipeAt(c));

// French typography: no-break space before « ? ! : ; » and « % », inside guillemets; curly apostrophes.
const NB = '\u00a0';
const fr = (t) => (typeof t === 'string' ? t.replace(/ ([?!:;»])/g, NB + '$1').replace(/« /g, '«' + NB).replace(/(\d) %/g, '$1' + NB + '%').replace(/'/g, '\u2019') : t);
const walk = (o) => {
  if (!o || typeof o !== 'object') return;
  for (const k of Object.keys(o)) {
    if (['text', 'body', 'kicker', 'sub', 'line', 'label', 'title', 'offer'].includes(k) && typeof o[k] === 'string') o[k] = fr(o[k]);
    else if (typeof o[k] === 'object') walk(o[k]);
  }
};
layers.forEach((l) => walk(l.props));
const END = t + OUTRO;
if (require.main === module || process.env.PRINT_TIMELINE) console.error('cuts', cuts, 'END', END, (END / 30).toFixed(1) + 's');
module.exports = { fps: 30, width: 1920, height: 1080, durationInFrames: END, background: '#15120F', layers };
