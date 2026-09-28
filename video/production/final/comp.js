// BEMEXO — vidéo de présentation (16:9, 30 i/s). Montage final.
// Toutes les images d'application viennent des prises réelles (../takes/*),
// capturées sur le vrai code BEMEXO avec des données 100 % fictives.
const fs = require('fs');
const path = require('path');
const { wipeAt, at } = require('../compositor/lib/timeline');

const TAKES = path.resolve(__dirname, '../takes');
const dir = (t) => path.join(TAKES, t, 'frames');
const M = {};
const take = (t) => (M[t] = M[t] || JSON.parse(fs.readFileSync(path.join(TAKES, t, 'meta.json'), 'utf8')));
const mk = (t, label) => { const e = take(t).events.find((x) => x.type === 'mark' && x.label === label); if (!e) throw new Error(`mark ${t}:${label}`); return e.frame - 1; };
const evs = (t, type) => take(t).events.filter((x) => x.type === type);
const ev = (t, type, n = 0) => { const e = evs(t, type)[n]; if (!e) throw new Error(`event ${t}:${type}#${n}`); return e.frame - 1; };
const last = (t) => take(t).frames - 1;

// ── helpers ──────────────────────────────────────────────────────────────
const DESK_BOX = { x: 200, y: 138, w: 1520, h: 901 };
const R = (x, y, w) => ({ x, y, w, h: Math.round(w * 9 / 16) });    // 16:9 rect in 3200x1800 source px
const FULL = { x: 0, y: 0, w: 3200, h: 1800 };
const desk = (t, from, duration, props) => ({ type: 'seq', from, duration, box: DESK_BOX, props: { dir: dir(t), frame: 'browser', url: 'bemexo.com/admin', hold: 'last', ...props } });
const kicker = (text, from, duration, extra = {}) => ({ type: 'kicker', from, duration, props: { text, position: 'top-left', ...extra } });
const title = (text, from, duration, extra = {}) => ({ type: 'title', from, duration: Math.max(20, duration), props: { text, position: 'bottom-center', size: 46, ...extra } });
const cap = (from, duration, kick, text, body, extra = {}) => ({ type: 'caption', from, duration: Math.max(20, duration), props: { theme: 'light', kicker: kick, text, body, width: 720, ...extra } });
// piecewise-linear time map from [[local, src], ...] with speed segments
function tmap(points) { return points.map(([l, s]) => [Math.round(l), Math.round(s)]); }
// local frame for a source frame under a piecewise map
function localOf(map, src) {
  for (let i = 1; i < map.length; i++) {
    const [l0, s0] = map[i - 1], [l1, s1] = map[i];
    if (src <= s1) return Math.round(l0 + (s1 === s0 ? 0 : (src - s0) * (l1 - l0) / (s1 - s0)));
  }
  const [lz, sz] = map[map.length - 1];
  return lz + (src - sz);
}

// Phone geometry (compositor phone: 390x844 screen, 34 px status bar, 10 px bezel)
const PHONE = { x: 1330, y: 548, height: 952 };
function phonePoint(ph, sx, sy) {
  const bodyW = 410, bodyH = 844 + 34 + 20, k = ph.height / bodyH;
  return { x: ph.x - (bodyW * k) / 2 + (10 + sx) * k, y: ph.y - (bodyH * k) / 2 + (10 + 34 + sy) * k, k };
}
// whole-phone "camera push": keys [{f, sx, sy, s, qx, qy, ease} | {f, reset:true, ease}]
// Dense keyframes: scale in log space, focus point and target interpolated
// together, so the phone never swings sideways during a zoom.
function phoneZoom(ph, keys) {
  const EZ = { smooth: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) };
  const state = (k) => {
    if (k.reset) { return { s: 1, px: ph.x, py: ph.y, qx: ph.x, qy: ph.y }; }
    const P = phonePoint(ph, k.sx, k.sy);
    return { s: k.s, px: P.x, py: P.y, qx: k.qx, qy: k.qy };
  };
  const xy = (st) => ({ x: st.qx - 960 - st.s * (st.px - 960), y: st.qy - 540 - st.s * (st.py - 540), scale: st.s });
  const out = { x: [], y: [], scale: [] };
  const push = (f, v) => { out.x.push([f, v.x]); out.y.push([f, v.y]); out.scale.push([f, v.scale]); };
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i], S = state(k);
    if (i === 0 || !k.ease) { push(k.f, xy(S)); continue; }
    const A = state(keys[i - 1]), f0 = keys[i - 1].f, f1 = k.f;
    for (let f = f0 + 2; f <= f1; f += 2) {
      const t = Math.min(1, (f - f0) / (f1 - f0)), e = (EZ[k.ease] || EZ.smooth)(t);
      const st = { s: Math.exp(Math.log(A.s) + (Math.log(S.s) - Math.log(A.s)) * e), px: A.px + (S.px - A.px) * e, py: A.py + (S.py - A.py) * e, qx: A.qx + (S.qx - A.qx) * e, qy: A.qy + (S.qy - A.qy) * e };
      push(f, xy(st));
    }
    push(f1, xy(S));
  }
  return out;
}
const tapsOf = (t, map) => evs(t, 'tap').filter((e) => !e.indicatorOnlyHidden).map((e) => ({ f: localOf(map, e.frame - 1) - 3, x: e.box.x + e.box.width / 2, y: e.box.y + e.box.height / 2 }));

// ─────────────────────────────────────────────────────────── 1 · PLANIFIER
function scenePlanifier() {
  const T = 'planning';
  const hold = 150, s0 = mk(T, 'clients-open');
  const map = tmap([[0, 0], [hold, s0], [hold + (last(T) - s0), last(T)]]);
  const L = (src) => localOf(map, src);
  const drop = ev(T, 'drop'), abs = mk(T, 'absences'), clk = ev(T, 'click');
  const D = L(last(T)) + 1;
  return {
    D,
    thumb: { dir: dir(T), startFrame: ev(T, 'drop') + 20, camera: R(0, 0, 2400) },
    layers: [
      { type: 'background', from: 0, duration: D, props: { variant: 'parchment', watermark: { opacity: 0.05 } } },
      desk(T, 0, D, {
        timeMap: map,
        camera: [
          { f: 0, ...FULL }, { f: 40, ...R(60, 34, 3080) },
          { f: 64, ...R(0, 0, 1860), ease: 'smooth' }, { f: 128, ...R(0, 0, 1860) },
          { f: 160, ...R(0, 0, 2640), ease: 'smooth' }, { f: L(drop) + 30, ...R(0, 0, 2640) },
          { f: L(abs) + 6, ...R(0, 60, 2300), ease: 'smooth' }, { f: D, ...R(0, 90, 2240) },
        ],
      }),
      kicker('01 · PLANIFIER', 0, D),
      title("Toute l'équipe, toute la semaine, {sur un seul écran.}", 14, 50),
      title('Les chiffres clés, {en direct.}', 70, 72),
      title("Glissez. Déposez. {C'est planifié.}", L(clk) - 4, L(drop) + 40 - (L(clk) - 4)),
      title("Congés, maladie, intempéries : {visibles d'un coup d'œil.}", L(abs) - 4, D - (L(abs) - 4)),
    ],
  };
}

// ─────────────────────────────────────────────────── 2 · POINTER (+ hors-ligne)
function scenePointer() {
  const P = 'pointage', O = 'offline';
  const ph = PHONE;
  // pointage: 1:1 from p0
  const p0 = 40;
  const pGeo = mk(P, 'geo'), pStart = mk(P, 'start'), pRun = mk(P, 'running'), pFin = mk(P, 'finish'), pEnd = last(P);
  const pMap = tmap([[0, p0], [pEnd - p0, pEnd]]);
  const pl = (s) => localOf(pMap, s);
  const C = pEnd - p0 + 1;
  const insetFrom = pl(pRun) + 10, insetDur = 70;
  // offline: skip the idle start, editor at 2.2x, rest 1:1, trim the tail
  const oOff = mk(O, 'offline'), oPhone = mk(O, 'on-phone'), oOnline = mk(O, 'online'), oGap = mk(O, 'gap'), oPan = mk(O, 'panier');
  const ed0 = ev(O, 'tap', 0) - 6;
  const oEnd = Math.min(last(O), ev(O, 'tap', evs(O, 'tap').length - 1) + 42);
  const o0 = oOff - 8;
  const oMap = tmap([[0, o0], [ed0 - o0, ed0], [ed0 - o0 + (oPhone - ed0) / 2.6, oPhone], [ed0 - o0 + (oPhone - ed0) / 2.6 + (oEnd - oPhone) / 1.15, oEnd]]);
  const ol = (s) => localOf(oMap, s);
  const oDur = oMap[oMap.length - 1][0] + 1;
  const D = C + oDur;
  const zP = phoneZoom(ph, [
    { f: 0, reset: true },
    { f: pl(pGeo) - 4, reset: true },
    { f: pl(pGeo) + 14, sx: 195, sy: 190, s: 1.6, qx: 1430, qy: 520, ease: 'smooth' },
    { f: pl(pStart) - 14, sx: 195, sy: 190, s: 1.6, qx: 1430, qy: 520 },
    { f: pl(pStart) + 2, reset: true, ease: 'smooth' },
    { f: pl(pRun) - 2, reset: true },
    { f: pl(pRun) + 12, sx: 195, sy: 110, s: 1.75, qx: 1320, qy: 470, ease: 'smooth' },
    { f: pl(pFin) - 6, sx: 195, sy: 110, s: 1.75, qx: 1320, qy: 470 },
    { f: pl(pFin) + 10, reset: true, ease: 'smooth' },
    { f: C - 40, reset: true },
    { f: C - 14, sx: 195, sy: 560, s: 1.45, qx: 1330, qy: 520, ease: 'smooth' },
  ]);
  const zO = phoneZoom(ph, [
    { f: 0, reset: true },
    { f: ol(oGap) - 4, reset: true },
    { f: ol(oGap) + 12, sx: 195, sy: 560, s: 1.55, qx: 1320, qy: 560, ease: 'smooth' },
    { f: ol(oPan) - 4, sx: 195, sy: 560, s: 1.55, qx: 1320, qy: 560 },
    { f: ol(oPan) + 12, sx: 195, sy: 250, s: 1.5, qx: 1320, qy: 470, ease: 'smooth' },
  ]);
  return {
    D,
    thumb: { dir: dir(P), startFrame: pRun + 20, camera: { cover: true, ay: 0.12 } },
    layers: [
      { type: 'background', from: 0, duration: D, props: { variant: 'cream', watermark: true } },
      kicker('02 · POINTER', 0, D, { theme: 'light' }),
      {
        type: 'phone', from: 0, duration: C, anim: zP, enter: { preset: 'fromRight', dur: 22, distance: 1000, ease: 'easeOutCubic' },
        props: { ...ph, statusBar: { time: '07:29' }, screen: { dir: dir(P), timeMap: pMap }, taps: tapsOf(P, pMap) },
      },
      cap(18, pl(pGeo) - 18, 'Sur le chantier', 'Le planning est\n{déjà dans sa poche.}'),
      cap(pl(pGeo), pl(pStart) - pl(pGeo) + 4, 'Géolocalisation', '2 points :\n{départ et fin.}', 'En option. Le salarié est informé\net peut refuser.'),
      cap(pl(pStart) + 4, insetFrom - pl(pStart) - 4, 'Pointage en direct', 'Un geste\n{pour commencer.}'),
      { type: 'chip', from: pl(pRun) - 2, duration: 46, props: { text: '10:42', icon: 'clock', position: 'top-center' } },
      {
        type: 'seq', from: insetFrom, duration: insetDur, box: { x: 96, y: 430, w: 820, h: 461 },
        enter: { preset: 'rise', dur: 14 }, exit: { preset: 'fade', dur: 10 },
        props: { dir: dir('liveAdmin'), frame: 'card', hold: 'last', camera: R(0, 0, 1900) },
      },
      cap(insetFrom, insetDur, 'Au bureau', '{Le bureau voit} qui pointe.', undefined, { y: 300, size: 56, width: 900 }),
      { type: 'chip', from: pl(pFin) - 2, duration: 46, props: { text: '12:00', icon: 'clock', position: 'top-center' } },
      cap(insetFrom + insetDur, C - insetFrom - insetDur, 'Fin du pointage', 'Un geste\n{pour finir.}', "Arrondi au quart d'heure,\njamais deviné."),
      // ── 16:30 · sous-sol, sans réseau

      {
        type: 'phone', from: C, duration: oDur, anim: zO,
        props: { ...ph, statusBar: { time: '16:31' }, screen: { dir: dir(O), timeMap: oMap }, taps: tapsOf(O, oMap) },
      },
      { type: 'chip', from: C, duration: 60, z: 60, props: { text: '16:30', sub: 'Au sous-sol, sans réseau', icon: 'clock', variant: 'card', dim: 0.45 } },
      cap(C + 56, ol(oOnline) - 56, 'Hors-ligne', 'Pas de réseau ?\n{Tout est gardé.}', 'La saisie part toute seule\nau retour du réseau.'),
      cap(C + ol(oOnline), ol(oGap) - ol(oOnline) + 2, 'Retour du réseau', 'Envoyé\n{automatiquement.}'),
      cap(C + ol(oGap) + 2, ol(oPan) - ol(oGap), 'Entre deux chantiers', "Route ou pause ?\n{Il répond d'un tap.}"),
      cap(C + ol(oPan) + 2, oDur - ol(oPan) - 2, 'Calculés tout seuls', 'Pauses, route,\n{panier repas.}'),
    ],
  };
}

// ─────────────────────────────────────────────────────────── 3 · PROUVER
function sceneProuver() {
  const T = 'preuve', ph = PHONE;
  const t0 = ev(T, 'tap', 0) - 16;
  const rsv = mk(T, 'reserve'), docs = mk(T, 'docs'), listed = mk(T, 'photo-listed'), send = mk(T, 'send');
  const tPhoto = ev(T, 'tap', 3);                 // tap « Photo »
  const tEnd = last(T);
  // compress typing a little (1.3x), rest 1:1
  const tType = ev(T, 'tap', 2);
  const map = tmap([[0, t0], [tType - t0, tType], [tType - t0 + (docs - tType) / 1.3, docs], [tType - t0 + (docs - tType) / 1.3 + (tEnd - docs), tEnd]]);
  const L = (s) => localOf(map, s);
  const D = map[map.length - 1][0] + 1;
  const z = phoneZoom(ph, [
    { f: 0, reset: true },
    { f: L(rsv) - 10, reset: true },
    { f: L(rsv) + 8, sx: 195, sy: 470, s: 1.45, qx: 1300, qy: 560, ease: 'smooth' },
    { f: L(docs) - 6, sx: 195, sy: 470, s: 1.45, qx: 1300, qy: 560 },
    { f: L(docs) + 8, reset: true, ease: 'smooth' },
    { f: L(tPhoto) + 4, reset: true },
    // new « Photo 3 » row: push in with the phone's right side outside the frame
    { f: L(tPhoto) + 30, sx: 120, sy: 355, s: 2.1, qx: 1480, qy: 560, ease: 'smooth' },
    { f: L(listed) + 24, sx: 120, sy: 355, s: 2.1, qx: 1480, qy: 560 },
    { f: L(listed) + 44, reset: true, ease: 'smooth' },
    { f: L(send) + 6, reset: true },
    { f: L(send) + 22, sx: 195, sy: 790, s: 1.4, qx: 1320, qy: 640, ease: 'smooth' },
  ]);
  return {
    D,
    thumb: { dir: dir(T), startFrame: listed, camera: { cover: true, ay: 0.3 } },
    layers: [
      { type: 'background', from: 0, duration: D, props: { variant: 'cream', watermark: true } },
      kicker('03 · PROUVER', 0, D, { theme: 'light' }),
      { type: 'chip', from: 0, duration: 44, props: { text: '16:44', icon: 'clock', position: 'top-center' } },
      { type: 'phone', from: 0, duration: D, anim: z, props: { ...ph, statusBar: { time: '16:44' }, screen: { dir: dir(T), timeMap: map }, taps: tapsOf(T, map) } },
      cap(10, L(docs) - 10, 'Sur le chantier', 'Une réserve ?\n{Il la signale sur place.}'),
      cap(L(docs), L(send) - L(docs), 'Photos', 'Rangées par chantier\n{et par jour.}', 'Nom, date et heure\nautomatiques.'),
      cap(L(send), D - L(send), 'Fin de journée', 'Journée envoyée.\n{Rien à ressaisir.}'),
    ],
  };
}

// ─────────────────────────────────────────────────────────── 4 · CONTRÔLER
function sceneControler() {
  const T = 'controle', B = 'beforeSend';
  const pop = mk(T, 'popup'), fiche = mk(T, 'fiche'), week = mk(T, 'week'), corr = mk(T, 'correct'), prev = mk(T, 'prevenir'), tEnd = last(T);
  const clkName = ev(T, 'click', 1), clkSem = ev(T, 'click', 3);
  // speed through opening the fiche (name → status → Feuille d'heures → Cette semaine) at 1.8x
  const morph = 44;
  const f1 = morph + clkName, f2 = f1 + (clkSem + 10 - clkName) / 2.3;
  const map = tmap([[0, 0], [morph, 0], [f1, clkName], [f2, clkSem + 10], [f2 + (corr - clkSem - 10) / 1.25, corr], [f2 + (corr - clkSem - 10) / 1.25 + (tEnd - corr) / 1.15, tEnd]]);
  const L = (s) => localOf(map, s);
  const Dd = map[map.length - 1][0] + 1;
  const phoneIn = L(prev) + 26;
  const D = phoneIn + 90;
  const cell = R(1500, 640, 1560);
  const camera = [
    { f: 0, ...cell }, { f: morph + 6, ...cell },
    { f: L(pop) + 6, ...cell },
    { f: L(pop) + 30, ...R(470, 250, 2260), ease: 'smooth' },
    { f: L(fiche) - 6, ...R(470, 250, 2260) },
    { f: L(fiche) + 16, ...FULL, ease: 'smooth' },
    { f: L(week) - 4, ...FULL },
    { f: L(week) + 18, ...R(800, 0, 1600), ease: 'smooth' },
    { f: L(week) + 60, ...R(800, 0, 1600) },
    { f: L(week) + 84, ...R(800, 820, 1600), ease: 'smooth' },
    { f: L(corr) - 2, ...R(800, 820, 1600) },
    { f: L(corr) + 14, ...R(800, 800, 1600), ease: 'smooth' },
    { f: Dd, ...R(800, 800, 1600) },
  ];
  return {
    D,
    thumb: { dir: dir(T), startFrame: L(week) + 30, camera: R(800, 0, 1600) },
    layers: [
      { type: 'background', from: 0, duration: D, props: { variant: 'parchment', watermark: { opacity: 0.05 } } },
      desk(B, 0, morph + 12, { freezeAt: 0, freezeFrame: last(B), camera: cell }),
      { ...desk(T, morph - 4, Dd - morph + 4, { timeMap: map.map(([l, s]) => [l - (morph - 4), s]).filter(([l]) => l >= 0), camera: camera.map((k) => ({ ...k, f: Math.max(0, k.f - (morph - 4)) })) }), enter: { preset: 'fade', dur: 16 } },
      { ...desk(T, Dd, D - Dd, { freezeAt: 0, freezeFrame: tEnd, camera: R(800, 800, 1600) }) },
      kicker('04 · CONTRÔLER', 0, D),
      title('Au bureau, {tout arrive déjà rempli.}', 8, L(pop) - 8),
      title('Prévu, réel, réserve, photos : {tout au même endroit.}', L(pop) + 6, L(fiche) - L(pop) - 6),
      title('Heures sup {calculées à la semaine.}', L(week), L(corr) - L(week)),
      title('Une correction ? {Tracée, et le salarié est prévenu.}', L(corr), D - L(corr), { position: 'bottom-left', size: 42 }),
      {
        type: 'phone', from: phoneIn, duration: D - phoneIn, enter: { preset: 'fromRight', dur: 18, distance: 900, ease: 'easeOutCubic' },
        props: {
          x: 1620, y: 500, height: 800, statusBar: { time: '17:07' },
          screen: { dir: dir('corrige'), freezeAt: 0, freezeFrame: last('corrige') },
          notifications: [{ from: 8, duration: 80, title: 'Delorme Rénovation', body: 'Le bureau a corrigé tes heures du 24 septembre : 12h45–16h30 → 12h45–16h00', time: 'maintenant' }],
        },
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────── 5 · PILOTER
function scenePiloter() {
  const T = 'piloter', SP = 1.45;
  const rs0 = mk(T, 'reserves'), cost0 = mk(T, 'cost'), exp0 = mk(T, 'expand'), tEnd = last(T);
  const map = tmap([[0, 0], [tEnd / SP, tEnd]]);
  const L = (s) => localOf(map, s);
  const rs = L(rs0), cost = L(cost0), exp = L(exp0);
  const D = L(tEnd) + 1;
  return {
    D,
    thumb: { dir: dir(T), startFrame: exp0 + 40, camera: R(760, 100, 1680) },
    layers: [
      { type: 'background', from: 0, duration: D, props: { variant: 'parchment', watermark: { opacity: 0.05 } } },
      desk(T, 0, D, {
        timeMap: map,
        camera: [
          { f: 0, ...FULL }, { f: rs + 20, ...FULL },
          { f: rs + 38, ...R(640, 560, 1920), ease: 'smooth' }, { f: cost - 6, ...R(640, 560, 1920) },
          { f: cost + 4, ...FULL, ease: 'smooth' }, { f: cost + 20, ...FULL },
          { f: cost + 36, ...R(760, 100, 1680), ease: 'smooth' }, { f: D, ...R(760, 160, 1680) },
        ],
      }),
      kicker('05 · PILOTER', 0, D),
      title("Chaque réserve {suivie jusqu'à sa levée.}", 8, cost - 8),
      title('Le vrai coût {de chaque chantier.}', cost + 4, exp - cost - 4),
      title('Budget suivi, {alerte e-mail à 70, 80 et 100 %.}', exp, D - exp),
    ],
  };
}

// ─────────────────────────────────────────────────────────── 6 · PAYER
function scenePayer() {
  const T = 'paie', CSV = path.join(TAKES, 'paie', 'bemexo-paie.csv');
  const exp = mk(T, 'export'), csv = mk(T, 'csv'), send = mk(T, 'send'), clo = mk(T, 'cloture'), tEnd = last(T);
  const intro = 50;                                 // time-jump card
  const A = 1.9, B = 1.35;
  // part A: menus + calendar fast, CSV click + toast 1:1
  const aFast = csv + 8, aEnd = send - 10;
  const aMap = tmap([[0, exp], [intro, exp], [intro + (aFast - exp) / A, aFast], [intro + (aFast - exp) / A + (aEnd - aFast), aEnd]]);
  const aDur = aMap[aMap.length - 1][0];
  const LA = (s) => localOf(aMap, s);
  const tableDur = 126;
  const bStart = aDur + tableDur;
  const bMap = tmap([[0, send - 6], [(tEnd - send + 6) / B, tEnd]]);
  const LB = (s) => localOf(bMap, s);
  const bDur = bMap[1][0];
  const phoneIn = bStart + bDur - 16;
  const D = phoneIn + 84;
  const dlg = R(470, 290, 2260);
  return {
    D,
    layers: [
      { type: 'background', from: 0, duration: D, props: { variant: 'parchment', watermark: { opacity: 0.05 } } },
      desk(T, 0, aDur, {
        timeMap: aMap,
        camera: [{ f: 0, ...FULL }, { f: LA(ev(T, 'click', 1)) + 4, ...FULL }, { f: LA(ev(T, 'click', 1)) + 22, ...dlg, ease: 'smooth' }, { f: aDur, ...dlg }],
      }),
      { type: 'chip', from: 0, duration: intro + 4, props: { text: '30 septembre', sub: 'Fin du mois', icon: 'calendar', variant: 'card', dim: 0.5 } },
      kicker('06 · PAYER', 0, D),
      title('La paie du mois, {en un clic.}', intro + 4, LA(csv) - intro - 4),
      title('Excel, PDF ou {CSV de paie.}', LA(csv), aDur - LA(csv)),
      {
        type: 'csvTable', from: aDur, duration: tableDur, box: { x: 150, y: 150, w: 1620, h: 800 },
        enter: { preset: 'fade', dur: 12 }, exit: { preset: 'fade', dur: 10 },
        props: {
          file: CSV, caption: 'bemexo-paie-2026-09.csv',
          columns: ['Matricule', 'Nom', 'Prenom', 'Semaine du', 'Heures normales', 'Heures sup 25%', 'Heures sup 50%', 'Dont route payee', 'Total heures'],
          highlight: ['Matricule', 'Heures sup 25%'], highlightRows: [12],
          scroll: [[18, 0], [96, 7.5, 'easeInOutCubic']],
        },
      },
      title('Prêt à importer : {Silae, Sage, Cegid…}', aDur + 16, tableDur - 16),
      desk(T, bStart, D - bStart, { timeMap: bMap, camera: [{ f: 0, ...dlg }, { f: LB(clo) + 6, ...dlg }, { f: LB(clo) + 26, ...R(470, 560, 2260), ease: 'smooth' }] }),
      title("Ou l'Excel, {envoyé direct au comptable.}", bStart, LB(clo)),
      title('Mois clôturé, {heures verrouillées.}', bStart + LB(clo) + 4, phoneIn - bStart - LB(clo) - 4),
      {
        type: 'phone', from: phoneIn, duration: D - phoneIn, enter: { preset: 'fromRight', dur: 18, distance: 900, ease: 'easeOutCubic' },
        props: { x: 1620, y: 500, height: 800, statusBar: { time: '17:06' }, screen: { dir: dir('comptable'), freezeAt: 0, freezeFrame: last('comptable') } },
      },
      title('{Et le salarié le sait.}', phoneIn + 8, D - phoneIn - 8, { position: 'bottom-left' }),
    ],
  };
}

// ─────────────────────────────────────────────────────────── 7 · ET AUSSI
function sceneAussi() {
  const per = 45;
  const D = 4 * per + 14;
  return {
    D,
    layers: [
      {
        type: 'alsoStrip', from: 0, duration: D,
        props: {
          title: 'Et aussi…', kicker: 'Fonctions incluses', per, theme: 'light',
          items: [
            { dir: dir('chef'), startFrame: last('chef'), camera: { x: 0, y: 190, w: 1170, h: 658 }, label: "Chef d'équipe · Mon équipe aujourd'hui" },
            { dir: dir('conges'), startFrame: last('conges'), camera: { x: 0, y: 820, w: 1170, h: 658 }, label: 'Congés · demande et suivi' },
            { dir: dir('habil'), startFrame: last('habil'), camera: R(880, 1180, 1100), label: 'Habilitations · alerte avant expiration' },
            { dir: dir('importe'), startFrame: last('importe'), camera: R(700, 340, 1800), label: 'Import Excel · clients et salariés' },
          ],
        },
      },
    ],
  };
}

module.exports = { scenePlanifier, scenePointer, sceneProuver, sceneControler, scenePiloter, scenePayer, sceneAussi, dir, take, last, R };
