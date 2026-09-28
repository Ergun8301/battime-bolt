// BEMEXO — Du chantier à la paie, sans ressaisie. (assemblage final)
const { at, wipeAt } = require('../compositor/lib/timeline');
const C = require('./comp');
const path = require('path');

const INTRO = 270, OUTRO = 240;
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
const END = t + OUTRO;
if (require.main === module || process.env.PRINT_TIMELINE) console.error('cuts', cuts, 'END', END, (END / 30).toFixed(1) + 's');
module.exports = { fps: 30, width: 1920, height: 1080, durationInFrames: END, background: '#15120F', layers };
