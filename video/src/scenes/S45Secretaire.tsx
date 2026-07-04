import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { ARCHIVO, CREME, GRIS_TXT, JAUNE, MONO, NOIR, VERT_OK } from '../brand';
import { CineBackdrop } from '../ui/CineBackdrop';
import { PlanningWindow } from '../ui/PlanningWindow';

// S4+S5 v2 (900 images ≈ 30 s) — plan continu côté bureau, caméra pilotée :
//   0– 75  entrée frontale (variante A) : fenêtre ENTIÈRE, lisible
//  75–135  ESTABLISHING SHOT tenu ~2 s (1re saisie arrive déjà + ping)
// 135–330  zoom caméra sur les cellules, remplissage en cascade, "Zéro ressaisie."
// 330–490  beat RELANCE : cellule "En attente" pulse → clic cloche → toast + "Relancé ✓"
// 490–640  recadrage header : menu Exporter → clic "Exporter l'équipe"
// 640–810  fichier paie glisse au premier plan + tampon "Mois verrouillé"
// 810–900  respiration / sortie

const easeIO = Easing.inOut(Easing.cubic);

export const S45Secretaire: React.FC<{ vertical?: boolean }> = ({ vertical = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ===== entrée variante A : montée douce + settle, AUCUNE rotation =====
  const enter = spring({ frame, fps, config: { damping: 19, stiffness: 80, mass: 1 } });

  // ===== remplissage + ping (démarre pendant le plan large) =====
  const fill = interpolate(frame, [90, 320], [0, 1], { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ping =
    spring({ frame: frame - 104, fps, config: { damping: 13, stiffness: 150 } }) *
    interpolate(frame, [265, 300], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // ===== caméra (scale / translation) — courbes douces, jamais linéaires =====
  const KF = [0, 135, 330, 490, 640, 810] as const;
  const cam = (vals: readonly number[]) =>
    interpolate(frame, KF as unknown as number[], vals as unknown as number[], {
      easing: easeIO, extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
  const camS = vertical ? cam([0.70, 0.70, 0.98, 1.0, 0.86, 0.72]) : cam([1.0, 1.0, 1.26, 1.28, 1.12, 1.0]);
  const camX = vertical ? cam([0, 0, 190, -285, -255, 0]) : cam([0, 0, 170, -265, -235, 0]);
  const camY = vertical ? cam([6, 6, 90, -40, 90, 0]) : cam([26, 26, 84, -46, 74, 8]);

  // ===== beat relance =====
  const pendingPulse =
    interpolate(frame, [332, 460], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) > 0
      ? (Math.sin(frame / 8) + 1) / 2 * interpolate(frame, [332, 348, 430, 460], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
      : 0;
  const bellClick =
    interpolate(frame, [398, 406], [0, 1], { easing: easeIO, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) *
    interpolate(frame, [410, 420], [1, 0], { easing: easeIO, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const relanced = spring({ frame: frame - 418, fps, config: { damping: 13, stiffness: 170 } });
  const toastIn =
    spring({ frame: frame - 424, fps, config: { damping: 15, stiffness: 120 } }) *
    interpolate(frame, [492, 512], [1, 0], { easing: easeIO, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // ===== export =====
  const menuOpen = spring({ frame: frame - 576, fps, config: { damping: 200 } });
  const menuHot = interpolate(frame, [598, 608], [0, 1], { easing: easeIO, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const menuGone = interpolate(frame, [620, 632], [1, 0], { easing: easeIO, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fileOut = spring({ frame: frame - 648, fps, config: { damping: 16, stiffness: 90 } });
  const stamp = spring({ frame: frame - 700, fps, config: { damping: 11, stiffness: 190 } });

  // ===== curseur (coordonnées fenêtre 0..1 — suit la caméra) =====
  const curX = interpolate(frame, [345, 392, 545, 592, 640], [0.62, 0.885, 0.918, 0.80, 0.80], { easing: easeIO, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const curY = interpolate(frame, [345, 392, 545, 592, 640], [0.97, 0.845, 0.145, 0.30, 0.30], { easing: easeIO, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const click1 = frame >= 398 && frame < 416 ? interpolate(frame, [398, 415], [0, 1]) : 0;
  const click2 = frame >= 566 && frame < 584 ? interpolate(frame, [566, 583], [0, 1]) : 0;
  const click3 = frame >= 602 && frame < 620 ? interpolate(frame, [602, 619], [0, 1]) : 0;
  const curVis =
    interpolate(frame, [340, 356], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) *
    interpolate(frame, [634, 650], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // ===== titres (3 temps) =====
  const t1In = spring({ frame: frame - 16, fps, config: { damping: 200 } });
  const t1Out = interpolate(frame, [312, 334], [1, 0], { easing: easeIO, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const sub1 = spring({ frame: frame - 175, fps, config: { damping: 200 } }) * t1Out;
  const t2In = interpolate(frame, [338, 360], [0, 1], { easing: easeIO, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const t2Out = interpolate(frame, [472, 494], [1, 0], { easing: easeIO, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const t3In = interpolate(frame, [498, 520], [0, 1], { easing: easeIO, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const winW = 1500;
  const baseTop = vertical ? '46%' : '56%';

  const planningState = {
    fill,
    ping,
    menuOpen: menuOpen * menuGone,
    menuHot: menuHot * menuGone,
    plannedIn: enter,
    pendingPulse,
    bellClick,
    relanced: frame > 418 ? relanced : 0,
    cursor: { x: curX, y: curY, click: Math.max(click1, click2, click3), visible: curVis },
  };

  const titleFs = vertical ? 58 : 58;

  return (
    <AbsoluteFill style={{ fontFamily: ARCHIVO, overflow: 'hidden' }}>
      <CineBackdrop />

      {/* parallaxe discrète du halo (couche arrière) */}
      <div
        style={{
          position: 'absolute', top: '60%', left: `${50 + Math.sin(frame / 90) * 2 - camX * 0.012}%`,
          transform: 'translate(-50%,-50%)', width: 1500, height: 1500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,194,26,.10), transparent 60%)', filter: 'blur(30px)',
        }}
      />

      {/* titres */}
      <div style={{ position: 'absolute', top: vertical ? 110 : 62, left: 0, right: 0, textAlign: 'center', padding: '0 6%', zIndex: 20 }}>
        <div style={{ position: 'relative', height: vertical ? 200 : 112 }}>
          <div style={{ position: 'absolute', inset: 0, opacity: t1In * t1Out, transform: `translateY(${(1 - t1In) * 22}px)` }}>
            <span style={{ fontSize: titleFs, fontWeight: 900, color: CREME, letterSpacing: '-.02em', lineHeight: 1.1 }}>
              Au bureau : tout arrive <span style={{ color: JAUNE }}>en temps réel</span>.
            </span>
          </div>
          <div style={{ position: 'absolute', inset: 0, opacity: t2In * t2Out, transform: `translateY(${(1 - t2In) * 22}px)` }}>
            <span style={{ fontSize: titleFs, fontWeight: 900, color: CREME, letterSpacing: '-.02em', lineHeight: 1.1 }}>
              Une saisie manque ? <span style={{ color: JAUNE }}>Relance en un tap</span>.
            </span>
          </div>
          <div style={{ position: 'absolute', inset: 0, opacity: t3In, transform: `translateY(${(1 - t3In) * 22}px)` }}>
            <span style={{ fontSize: titleFs, fontWeight: 900, color: CREME, letterSpacing: '-.02em', lineHeight: 1.1 }}>
              Fin du mois : <span style={{ color: JAUNE }}>export paie en un clic</span>.
            </span>
          </div>
        </div>
        <div style={{ marginTop: vertical ? 4 : 8, opacity: sub1 }}>
          <span style={{ fontFamily: MONO, fontSize: vertical ? 27 : 25, fontWeight: 700, color: '#a59c86', letterSpacing: '.04em' }}>
            Zéro ressaisie.
          </span>
        </div>
      </div>

      {/* fenêtre planning — entrée frontale + caméra */}
      <div
        style={{
          position: 'absolute', top: baseTop, left: '50%',
          transform: `translate(-50%,-50%) translate(${camX}px, ${camY + (1 - enter) * 190}px) scale(${camS * (0.94 + enter * 0.06)})`,
          opacity: Math.min(1, enter * 1.3),
        }}
      >
        <PlanningWindow width={winW} state={planningState} />
      </div>

      {/* toast relance (glisse du bord droit) */}
      {frame > 424 && toastIn > 0.02 && (
        <div
          style={{
            position: 'absolute',
            right: vertical ? 40 : 70,
            bottom: vertical ? 220 : 110,
            zIndex: 30,
            transform: `translateX(${(1 - toastIn) * 420}px)`,
            opacity: Math.min(1, toastIn * 1.4),
          }}
        >
          <div
            style={{
              background: NOIR, border: '1px solid rgba(242,237,227,.16)', borderRadius: 18,
              padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 16,
              boxShadow: '0 30px 60px -18px rgba(0,0,0,.7)',
            }}
          >
            <span style={{ width: 44, height: 44, flex: 'none', borderRadius: '50%', background: 'rgba(47,163,107,.16)', border: `2px solid ${VERT_OK}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
              📣
            </span>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: CREME }}>Relance envoyée à Julien M.</div>
              <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: '#a59c86', marginTop: 3 }}>notification poussée sur son téléphone</div>
            </div>
            <span style={{ marginLeft: 8, color: VERT_OK, fontWeight: 900, fontSize: 26 }}>✓</span>
          </div>
        </div>
      )}

      {/* fichier exporté + tampon */}
      {frame > 648 && (
        <div
          style={{
            position: 'absolute', left: '50%', top: vertical ? '55%' : '56%', zIndex: 30,
            transform: `translate(-50%,-50%) translateY(${(1 - fileOut) * 240}px) scale(${0.6 + fileOut * 0.4}) rotate(${(1 - fileOut) * 6}deg)`,
            opacity: Math.min(1, fileOut * 1.5),
            filter: 'drop-shadow(0 50px 80px rgba(0,0,0,.7))',
          }}
        >
          <div style={{ background: '#fff', borderRadius: 20, padding: '30px 38px', display: 'flex', alignItems: 'center', gap: 22, position: 'relative' }}>
            <div style={{ width: 74, height: 74, borderRadius: 16, background: '#1E6B41', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 26, fontFamily: MONO }}>
              XLS
            </div>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 25, fontWeight: 700, color: NOIR }}>paie_juin_2026.xlsx</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: GRIS_TXT, marginTop: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, background: VERT_OK, borderRadius: '50%' }} /> Prêt pour le comptable
              </div>
            </div>
            <div
              style={{
                position: 'absolute', top: -34, right: -46,
                transform: `rotate(-9deg) scale(${0.4 + stamp * 0.6})`, opacity: Math.min(1, stamp * 1.3),
                background: NOIR, color: JAUNE, border: `3px solid ${JAUNE}`,
                borderRadius: 14, padding: '12px 20px', fontWeight: 900, fontSize: 24,
                boxShadow: '0 18px 40px -10px rgba(0,0,0,.55)', whiteSpace: 'nowrap',
              }}
            >
              🔒 Mois verrouillé
            </div>
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
