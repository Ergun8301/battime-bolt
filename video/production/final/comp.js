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
// Desktop window: leaves a clean band under it for the lower-thirds.
const DESK_BOX = { x: 280, y: 124, w: 1360, h: 806 };
const R = (x, y, w) => ({ x, y, w, h: Math.round(w * 9 / 16) });    // 16:9 rect in 3200x1800 source px
const FULL = { x: 0, y: 0, w: 3200, h: 1800 };
const desk = (t, from, duration, props) => ({ type: 'seq', from, duration, box: DESK_BOX, props: { dir: dir(t), frame: 'browser', url: 'bemexo.com/admin', hold: 'last', ...props } });
const kicker = (text, from, duration, extra = {}) => ({ type: 'kicker', from, duration, props: { text, position: 'top-left', ...extra } });
const title = (text, from, duration, extra = {}) => ({ type: 'title', from, duration: Math.max(20, duration), props: { text, position: 'bottom-center', size: 46, margin: 40, ...extra } });
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
const tapsOf = (t, map) => evs(t, 'tap').filter((e) => !e.indicatorOnlyHidden).map((e) => ({ f: localOf(map, e.frame - 1) - 7, x: e.box.x + e.box.width / 2, y: e.box.y + e.box.height / 2 }));

// ─────────────────────────────────────────────────────────── 1 · PLANIFIER
function scenePlanifier() {
  const T = 'planning';
  const hold = 190, s0 = mk(T, 'clients-open');
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
          { f: 0, ...FULL }, { f: 96, ...FULL },
          { f: 120, ...R(0, 0, 1860), ease: 'smooth' }, { f: 168, ...R(0, 0, 1860) },
          { f: 196, ...R(0, 0, 2640), ease: 'smooth' }, { f: L(drop) + 30, ...R(0, 0, 2640) },
          { f: L(abs) + 6, ...R(0, 250, 2560), ease: 'smooth' }, { f: D, ...R(0, 262, 2520) },
        ],
      }),
      kicker('01 · PLANIFIER', 0, D),
      title("Toute l'équipe, {toute la semaine.}", 14, 86),
      title('Les chiffres clés, {en direct.}', 106, 76),
      title("Glissez. Déposez. {C'est planifié.}", L(clk) - 4, L(drop) + 40 - (L(clk) - 4)),
      title("Congés, maladie, intempéries : {visibles d'un coup d'œil.}", L(abs) - 4, D - (L(abs) - 4)),
    ],
  };
}

// ─────────────────────────────────────────────────── 2 · POINTER (+ hors-ligne)
function scenePointer() {
  const P = 'pointage', O = 'offline';
  const ph = PHONE;
  // pointage: hold the day screen (the planned card), then 1:1
  const p0 = 40, pHold = 90;
  const pGeo = mk(P, 'geo'), pStart = mk(P, 'start'), pRun = mk(P, 'running'), pFin = mk(P, 'finish'), pEnd = last(P);
  const pMap = tmap([[0, p0], [pHold, p0], [pHold + pEnd - p0, pEnd]]);
  const pl = (s) => localOf(pMap, s);
  const C = pHold + pEnd - p0 + 1;
  const insetFrom = pl(pRun) + 10, insetDur = 70;
  // offline: skip the idle start, editor at 2.6x, rest 1.15x, a beat on the route/pause question, a hold at the end
  const oOff = mk(O, 'offline'), oPhone = mk(O, 'on-phone'), oOnline = mk(O, 'online'), oGap = mk(O, 'gap'), oPan = mk(O, 'panier');
  const ed0 = ev(O, 'tap', 0) - 6;
  const oEnd = Math.min(last(O), ev(O, 'tap', evs(O, 'tap').length - 1) + 54);
  const o0 = oOff - 8;
  const q = oGap + 12;                              // the unanswered question, just before the « Route » tap
  const a1 = ed0 - o0, a2 = a1 + (oPhone - ed0) / 2.6, a3 = a2 + (q - oPhone) / 1.15, a4 = a3 + 30, a5 = a4 + (oEnd - q) / 1.15;
  const oMap = tmap([[0, o0], [a1, ed0], [a2, oPhone], [a3, q], [a4, q], [a5, oEnd], [a5 + 50, oEnd]]);
  const ol = (s) => localOf(oMap, s);
  const oDur = oMap[oMap.length - 1][0] + 1;
  const D = C + oDur;
  // Zooms keep the « Total aujourd'hui » card out of frame: before « J'ai fini » it counts the planned 07:30–12:00.
  const GEO = { sx: 195, sy: 200, s: 2.3, qx: 1430, qy: 860 };
  const RUN = { sx: 195, sy: 200, s: 2.2, qx: 1400, qy: 830 };
  const zP = phoneZoom(ph, [
    { f: 0, reset: true },
    { f: 26, reset: true },
    // the dotted « PRÉVU · 07:30-12:00 » card, with the Total card above it out of frame
    { f: 50, sx: 195, sy: 665, s: 2.0, qx: 1440, qy: 330, ease: 'smooth' },
    { f: pl(pGeo) - 10, sx: 195, sy: 665, s: 2.0, qx: 1440, qy: 330 },
    { f: pl(pGeo) + 18, ...GEO, ease: 'smooth' },
    { f: pl(pStart) - 14, ...GEO },
    { f: pl(pStart) + 2, reset: true, ease: 'smooth' },
    { f: pl(pRun) - 2, reset: true },
    { f: pl(pRun) + 12, ...RUN, ease: 'smooth' },
    { f: pl(pFin) - 6, ...RUN },
    { f: pl(pFin) + 10, reset: true, ease: 'smooth' },
    { f: C, reset: true },
  ]);
  const zO = phoneZoom(ph, [
    { f: 0, reset: true },
    { f: ol(oPhone) - 6, reset: true },
    { f: ol(oPhone) + 10, sx: 195, sy: 30, s: 1.9, qx: 1420, qy: 430, ease: 'smooth' },
    { f: ol(oOnline) + 30, sx: 195, sy: 30, s: 1.9, qx: 1420, qy: 430 },
    { f: ol(oGap) + 10, sx: 195, sy: 560, s: 1.55, qx: 1440, qy: 560, ease: 'smooth' },
    { f: ol(oPan) - 4, sx: 195, sy: 560, s: 1.55, qx: 1440, qy: 560 },
    { f: ol(oPan) + 12, sx: 195, sy: 250, s: 1.5, qx: 1320, qy: 470, ease: 'smooth' },
  ]);
  // one phone per status-bar time; trimStart keeps screen, zoom and taps continuous
  const pPhone = (from, to, time, extra = {}) => ({
    type: 'phone', from, duration: to - from, trimStart: from, anim: zP, ...extra,
    props: { ...ph, statusBar: { time }, screen: { dir: dir(P), timeMap: pMap }, taps: tapsOf(P, pMap) },
  });
  const oPhoneL = (from, to, statusBar) => ({
    type: 'phone', from: C + from, duration: to - from, trimStart: from, anim: zO,
    props: { ...ph, statusBar, screen: { dir: dir(O), timeMap: oMap }, taps: tapsOf(O, oMap) },
  });
  return {
    D,
    thumb: { dir: dir(P), startFrame: pRun + 20, camera: { cover: true, ay: 0.12 } },
    layers: [
      { type: 'background', from: 0, duration: D, props: { variant: 'cream', watermark: true } },
      kicker('02 · POINTER', 0, D, { theme: 'light' }),
      { ...pPhone(0, pl(pRun) - 2, '07:29', { enter: { preset: 'fromRight', dur: 22, distance: 1000, ease: 'easeOutCubic' } }), trimStart: 0 },
      pPhone(pl(pRun) - 2, pl(pFin) - 2, '10:42'),
      pPhone(pl(pFin) - 2, C, '12:00'),
      cap(18, pl(pGeo) - 26, 'Sur le chantier', 'Le planning est\n{déjà dans sa poche.}', 'Le prévu s’affiche.\nLe réel le remplacera.'),
      cap(pl(pGeo) - 6, pl(pStart) - pl(pGeo) + 10, 'Géolocalisation', 'Deux relevés :\n{au départ, à la fin.}', 'En option. Le salarié est informé\net peut refuser.', { size: 76 }),
      cap(pl(pStart) + 4, insetFrom - pl(pStart) - 4, 'Pointage en direct', 'Un geste\n{pour commencer.}'),
      { type: 'chip', from: pl(pRun) - 2, duration: 46, props: { text: '10:42', icon: 'clock', position: 'top-center' } },
      {
        type: 'seq', from: insetFrom, duration: insetDur, box: { x: 96, y: 430, w: 820, h: 461 },
        enter: { preset: 'rise', dur: 14 }, exit: { preset: 'fade', dur: 10 },
        props: { dir: dir('liveAdmin'), frame: 'card', hold: 'last', camera: [{ f: 0, ...R(0, 0, 1900) }, { f: 24, ...R(560, 0, 840), ease: 'smooth' }] },
      },
      cap(insetFrom, insetDur, 'Pendant ce temps', '{Le bureau voit} qui pointe.', undefined, { y: 300, size: 56, width: 900 }),
      { type: 'chip', from: pl(pFin) - 2, duration: 46, props: { text: '12:00', icon: 'clock', position: 'top-center' } },
      cap(insetFrom + insetDur, C - insetFrom - insetDur, 'Fin du pointage', 'Un geste\n{pour finir.}', 'Arrondi au quart d’heure.\nJamais d’heure inventée.'),
      // ── 16:31 · sous-sol, sans réseau
      oPhoneL(0, ol(oOnline), { time: '16:31', offline: true }),
      oPhoneL(ol(oOnline), oDur, { time: '16:31' }),
      { type: 'chip', from: C, duration: 60, z: 60, props: { text: '16:31', sub: 'Au sous-sol, sans réseau', icon: 'clock', variant: 'card', dim: 0.45, cardX: 560 } },
      cap(C + 56, ol(oOnline) - 56, 'Hors-ligne', 'Pas de réseau ?\n{Tout est gardé.}', 'Les saisies restent\nsur le téléphone.'),
      cap(C + ol(oOnline), ol(oGap) - ol(oOnline) - 6, 'Retour du réseau', 'La saisie se synchronise\n{toute seule.}', 'Elle attend ensuite\n« Envoyer ma journée ».', { size: 66 }),
      cap(C + ol(oGap) - 6, ol(oPan) - ol(oGap) - 2, 'Entre deux chantiers', 'Route ou pause ?\n{Il répond d’une touche.}', undefined, { size: 72 }),
      cap(C + ol(oPan) - 8, oDur - ol(oPan) + 8, 'Total du jour', 'Le total\n{se calcule seul.}', 'Route payée comprise,\npanier repas coché.'),
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
  // typing 1.3x, the photo list → « OK » stretch 2x, rest 1:1
  const tType = ev(T, 'tap', 2);
  const b1 = tType - t0, b2 = b1 + (docs - tType) / 1.3, b3 = b2 + (listed + 10 - docs), b4 = b3 + (send - 10 - listed - 10) / 2, b5 = b4 + (tEnd - send + 10);
  const map = tmap([[0, t0], [b1, tType], [b2, docs], [b3, listed + 10], [b4, send - 10], [b5, tEnd]]);
  const L = (s) => localOf(map, s);
  const D = map[map.length - 1][0] + 1;
  const z = phoneZoom(ph, [
    { f: 0, reset: true },
    { f: L(rsv) - 10, reset: true },
    { f: L(rsv) + 8, sx: 195, sy: 470, s: 1.45, qx: 1350, qy: 560, ease: 'smooth' },
    { f: L(docs) - 6, sx: 195, sy: 470, s: 1.45, qx: 1350, qy: 560 },
    { f: L(docs) + 8, reset: true, ease: 'smooth' },
    { f: L(tPhoto) + 4, reset: true },
    // the new « Photo 1 » row: push in with the phone's right side outside the frame
    { f: L(tPhoto) + 30, sx: 120, sy: 368, s: 2.1, qx: 1480, qy: 560, ease: 'smooth' },
    { f: L(listed) + 6, sx: 120, sy: 368, s: 2.1, qx: 1480, qy: 560 },
    { f: L(listed) + 26, reset: true, ease: 'smooth' },
    { f: L(send) + 6, reset: true },
    { f: L(send) + 22, sx: 195, sy: 690, s: 1.4, qx: 1320, qy: 600, ease: 'smooth' },
  ]);
  return {
    D,
    thumb: { dir: dir(T), startFrame: listed, camera: { cover: true, ay: 0.3 } },
    layers: [
      { type: 'background', from: 0, duration: D, props: { variant: 'cream', watermark: true } },
      kicker('03 · PROUVER', 0, D, { theme: 'light' }),
      { type: 'chip', from: 0, duration: 44, props: { text: '16:44', icon: 'clock', position: 'top-center' } },
      { type: 'phone', from: 0, duration: D, anim: z, props: { ...ph, statusBar: { time: '16:44' }, screen: { dir: dir(T), timeMap: map }, taps: tapsOf(T, map) } },
      cap(10, L(docs) - 10, 'Sur le chantier', 'Une réserve ?\n{Il la signale sur place.}', undefined, { size: 72 }),
      cap(L(docs), L(send) - L(docs), 'Photos', 'Rangées par chantier\n{et par jour.}', 'Nom, date et heure\nautomatiques.'),
      cap(L(send), D - L(send), 'Fin de journée', 'Journée envoyée.\n{Rien à ressaisir.}'),
    ],
  };
}

// ─────────────────────────────────────────────────────────── 4 · CONTRÔLER
// Push a phone layer (full-frame box) on a point: scale s anchored on P, so P stays put on screen.
const pushOn = (P, sc) => ({ x: (1 - sc) * (P[0] - 960), y: (1 - sc) * (P[1] - 540) });

function sceneControler() {
  const T = 'controle', B = 'beforeSend';
  const pop = mk(T, 'popup'), fiche = mk(T, 'fiche'), week = mk(T, 'week'), corr = mk(T, 'correct'), prev = mk(T, 'prevenir'), tEnd = last(T);
  const clkSem = ev(T, 'click', 3);
  const morph = 44;
  // A: planning → Cèdres popup, 1:1, frozen on the open popup
  const popHold = fiche - 21;
  const mapA = tmap([[0, 0], [morph, 0], [morph + popHold, popHold], [morph + popHold + 40, popHold]]);
  const LA = (s) => localOf(mapA, s);
  // B: dissolve straight into the fiche (the status menu and « Aujourd'hui » are skipped),
  // a beat on the week, then the correction
  const xf = morph + popHold - 4;
  const w0 = 12, w1 = w0 + (week - clkSem - 10) / 1.25, w2 = w1 + 64, w3 = w2 + (corr - week) / 1.25, w4 = w3 + (tEnd - corr) / 1.15;
  const mapB = tmap([[0, clkSem - 8], [w0, clkSem + 10], [w1, week], [w2, week], [w3, corr], [w4, tEnd]]);
  const LB = (s) => localOf(mapB, s);
  const bDur = mapB[mapB.length - 1][0] + 1;
  const Dd = xf + bDur;
  const phoneIn = xf + LB(prev) + 26;
  const D = phoneIn + 112;
  const cell = R(1180, 640, 1260);
  const popCrop = R(470, 250, 2260);
  const WEEK = R(880, 510, 1440), CORR = R(880, 600, 1440);
  const NOTIF = [1620, 175], LINE = [1620, 614], SC = 1.5;
  return {
    D,
    thumb: { dir: dir(T), startFrame: week + 30, camera: WEEK },
    layers: [
      { type: 'background', from: 0, duration: D, props: { variant: 'parchment', watermark: { opacity: 0.05 } } },
      desk(B, 0, morph + 12, { freezeAt: 0, freezeFrame: last(B), camera: cell }),
      {
        ...desk(T, morph - 4, xf + 16 - (morph - 4), {
          timeMap: mapA.map(([l, s2]) => [l - (morph - 4), s2]).filter(([l]) => l >= 0),
          camera: [{ f: 0, ...cell }, { f: 10, ...cell }, { f: LA(pop) + 6 - (morph - 4), ...cell }, { f: LA(pop) + 30 - (morph - 4), ...popCrop, ease: 'smooth' }],
        }),
        enter: { preset: 'fade', dur: 16 },
      },
      {
        ...desk(T, xf, bDur, {
          timeMap: mapB,
          camera: [{ f: 0, ...WEEK }, { f: LB(corr) + 2, ...WEEK }, { f: LB(corr) + 22, ...CORR, ease: 'smooth' }],
        }),
        enter: { preset: 'fade', dur: 14 },
      },
      { ...desk(T, Dd, D - Dd, { freezeAt: 0, freezeFrame: tEnd, camera: CORR }) },
      kicker('04 · CONTRÔLER', 0, D),
      title('Au bureau, {tout arrive déjà rempli.}', 8, LA(pop) - 8),
      title('Prévu, réel, réserve, photos : {tout au même endroit.}', LA(pop) + 6, xf + 8 - LA(pop) - 6),
      title('Heures sup {calculées à la semaine.}', xf + LB(week) - 6, LB(corr) - LB(week) + 6, { position: 'bottom-left', size: 42, sub: 'Base 35 h · route payée comprise' }),
      title('Une correction ? {Tracée, et le salarié est prévenu.}', xf + LB(corr), D - xf - LB(corr), { position: 'bottom-left', size: 42 }),
      {
        type: 'phone', from: phoneIn, duration: D - phoneIn, enter: { preset: 'fromRight', dur: 18, distance: 900, ease: 'easeOutCubic' },
        anim: {
          scale: [[24, 1], [44, SC], [96, SC], [116, SC]],
          x: [[24, 0], [44, pushOn(NOTIF, SC).x], [96, pushOn(NOTIF, SC).x], [116, pushOn(LINE, SC).x]],
          y: [[24, 0], [44, pushOn(NOTIF, SC).y], [96, pushOn(NOTIF, SC).y], [116, pushOn(LINE, SC).y]],
        },
        props: {
          x: 1620, y: 500, height: 800, statusBar: { time: '17:07' },
          screen: { dir: dir('corrige'), freezeAt: 0, freezeFrame: last('corrige') },
          notifications: [{ from: 8, duration: 86, title: 'Delorme Rénovation', body: 'Le bureau a corrigé tes heures du 24 septembre : 12h45–16h30 → 12h45–16h45', time: 'maintenant' }],
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
          { f: rs + 38, ...R(640, 300, 1920), ease: 'smooth' }, { f: cost - 20, ...R(640, 300, 1920) },
          { f: cost + 4, ...FULL, ease: 'smooth' }, { f: cost + 20, ...FULL },
          { f: cost + 36, ...R(760, 160, 1680), ease: 'smooth' }, { f: exp + 8, ...R(760, 160, 1680) },
          { f: exp + 36, ...R(760, 620, 1680), ease: 'smooth' }, { f: D, ...R(760, 620, 1680) },
        ],
      }),
      kicker('05 · PILOTER', 0, D),
      title("Chaque réserve {suivie jusqu'à sa levée.}", 8, cost - 8),
      title('Le vrai coût {de chaque chantier.}', cost + 4, exp - cost - 4),
      title('Budget suivi, {alerte e-mail à 70 %, 80 % et 100 %.}', exp, D - exp),
    ],
  };
}

// ─────────────────────────────────────────────────────────── 6 · PAYER
function scenePayer() {
  const T = 'paie', CSV = path.join(TAKES, 'paie', 'bemexo-paie.csv');
  const exp = mk(T, 'export'), csv = mk(T, 'csv'), send = mk(T, 'send'), clo = mk(T, 'cloture'), tEnd = last(T);
  const intro = 50;                                 // time-jump card
  const A = 1.9, B = 1.35;
  // part A: menus + calendar fast, CSV click 1:1, a beat on the (short-lived) « CSV de paie téléchargé » toast
  const aFast = csv + 8, aEnd = send - 10;
  const toast = ev(T, 'click', 6) + 10;            // click « CSV pour la paie » → toast on screen
  const a1 = intro + (aFast - exp) / A, a2 = a1 + (toast - aFast), a3 = a2 + 40;
  const aMap = tmap([[0, exp], [intro, exp], [a1, aFast], [a2, toast], [a3, toast], [a3 + (aEnd - toast), aEnd]]);
  const aDur = aMap[aMap.length - 1][0];
  const LA = (s) => localOf(aMap, s);
  const tableDur = 126;
  const bStart = aDur + tableDur;
  const bMap = tmap([[0, send - 6], [(tEnd - send + 6) / B, tEnd]]);
  const LB = (s) => localOf(bMap, s);
  const bDur = bMap[1][0];
  const phoneIn = bStart + bDur - 16;
  const D = phoneIn + 96;
  const dlg = R(470, 290, 2260), WIDE = R(300, 0, 2600);
  const PILLS = [1620, 600], SC = 1.5;
  // Karim's week of 21/09 in the real export
  const rows = fs.readFileSync(CSV, 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/).slice(1).map((l) => l.split(';'));
  const karim = rows.findIndex((r) => r[1] === 'Benali' && r[3] === '21/09/2026');
  if (karim < 0) throw new Error('paie: Karim 21/09 not in CSV');
  return {
    D,
    layers: [
      { type: 'background', from: 0, duration: D, props: { variant: 'parchment', watermark: { opacity: 0.05 } } },
      desk(T, 0, aDur, {
        timeMap: aMap,
        camera: [
          { f: 0, ...FULL }, { f: LA(ev(T, 'click', 1)) + 4, ...FULL }, { f: LA(ev(T, 'click', 1)) + 22, ...dlg, ease: 'smooth' },
          { f: LA(csv) + 2, ...dlg }, { f: LA(csv) + 16, ...WIDE, ease: 'smooth' }, { f: aDur, ...WIDE },
        ],
      }),
      { type: 'chip', from: 0, duration: intro + 4, props: { text: '30 sept.', sub: 'Fin du mois', icon: 'calendar', variant: 'card', dim: 0.5 } },
      kicker('06 · PAYER', 0, D),
      title('La paie du mois, {sans rien retaper.}', intro + 4, LA(csv) - intro - 4),
      title('Excel, PDF ou {CSV de paie.}', LA(csv), aDur - LA(csv)),
      {
        type: 'csvTable', from: aDur, duration: tableDur, box: { x: 150, y: 150, w: 1620, h: 800 },
        enter: { preset: 'fade', dur: 12 }, exit: { preset: 'fade', dur: 10 },
        props: {
          file: CSV, caption: 'bemexo-paie-2026-09-01.csv',
          columns: ['Matricule', 'Nom', 'Prenom', 'Semaine du', 'Heures normales', 'Heures sup 25%', 'Heures sup 50%', 'Dont route payee', 'Total heures'],
          highlight: ['Matricule', 'Heures sup 25%'], highlightRows: [karim],
          scroll: [[18, 0], [96, Math.max(0, karim - 4.5), 'easeInOutCubic']],
        },
      },
      title('À importer dans {Silae, Sage, Cegid…}', aDur + 16, tableDur - 16, { sub: 'Colonnes à régler une seule fois' }),
      desk(T, bStart, D - bStart, {
        timeMap: bMap,
        camera: [{ f: 0, ...dlg }, { f: LB(clo) + 4, ...dlg }, { f: LB(clo) + 20, ...WIDE, ease: 'smooth' }],
      }),
      title('Ou l’Excel, {envoyé directement au comptable.}', bStart, LB(clo)),
      title('Mois clôturé, {heures verrouillées.}', bStart + LB(clo) + 4, phoneIn - bStart - LB(clo) - 4),
      {
        type: 'phone', from: phoneIn, duration: D - phoneIn, enter: { preset: 'fromRight', dur: 18, distance: 900, ease: 'easeOutCubic' },
        anim: { scale: [[26, 1], [48, SC]], x: [[26, 0], [48, pushOn(PILLS, SC).x]], y: [[26, 0], [48, pushOn(PILLS, SC).y]] },
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
            { dir: dir('chef'), startFrame: last('chef'), camera: { x: 0, y: 226, w: 1170, h: 658 }, label: "Chef d'équipe · Mon équipe aujourd'hui" },
            { dir: dir('conges'), startFrame: last('conges'), camera: { x: 0, y: 820, w: 1170, h: 658 }, label: 'Congés · demande et suivi' },
            { dir: dir('habil'), startFrame: last('habil'), camera: R(900, 1000, 1400), label: 'Habilitations · alerte avant expiration' },
            { dir: dir('importe'), startFrame: last('importe'), camera: R(880, 440, 1440), label: 'Import Excel · clients et chantiers' },
          ],
        },
      },
    ],
  };
}

module.exports = { scenePlanifier, scenePointer, sceneProuver, sceneControler, scenePiloter, scenePayer, sceneAussi, dir, take, last, R };
