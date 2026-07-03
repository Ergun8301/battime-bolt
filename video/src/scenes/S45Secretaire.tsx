import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { ARCHIVO, CREME, GRIS_TXT, JAUNE, MONO, NOIR, TEXTURE_CHANTIER, VERT_OK } from '../brand';
import { PlanningWindow } from '../ui/PlanningWindow';

// S4+S5 (780 images ≈ 26 s) — plan continu côté bureau :
// 0–60 entrée fenêtre 3D · 60–300 remplissage temps réel · 300–420 bascule titre
// 420–510 clic Exporter · 510–660 fichier + tampon verrou · 660–780 respiration.

const Cursor: React.FC<{ x: number; y: number; click: number }> = ({ x, y, click }) => (
  <div style={{ position: 'absolute', left: x, top: y, zIndex: 40, transform: `scale(${1 - click * 0.18})`, transformOrigin: 'top left' }}>
    <svg width="34" height="46" viewBox="0 0 34 46">
      <path d="M2 2 L2 36 L11 28 L17 43 L24 40 L18 25 L30 24 Z" fill={NOIR} stroke={CREME} strokeWidth="2.5" />
    </svg>
    {click > 0.03 && (
      <div style={{ position: 'absolute', top: -14, left: -14, width: 56, height: 56, borderRadius: '50%', border: `3px solid ${JAUNE}`, opacity: 1 - click, transform: `scale(${0.5 + click})` }} />
    )}
  </div>
);

export const S45Secretaire: React.FC<{ vertical?: boolean }> = ({ vertical = false }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // entrée fenêtre
  const enter = spring({ frame, fps, config: { damping: 60, stiffness: 60 }, durationInFrames: 70 });
  const tilt = (1 - enter) * 22;

  // remplissage + ping
  const fill = interpolate(frame, [70, 290], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ping =
    spring({ frame: frame - 96, fps, config: { damping: 14, stiffness: 140 } }) *
    interpolate(frame, [260, 292], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // titres
  const t1In = spring({ frame: frame - 14, fps, config: { damping: 200 } });
  const t1Out = interpolate(frame, [316, 340], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const sub1In = spring({ frame: frame - 170, fps, config: { damping: 200 } });
  const t2In = interpolate(frame, [348, 372], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // export : menu + clic + fichier + tampon
  const menuOpen = spring({ frame: frame - 452, fps, config: { damping: 200 } });
  const menuHot = interpolate(frame, [488, 500], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const menuGone = interpolate(frame, [516, 528], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fileOut = spring({ frame: frame - 528, fps, config: { damping: 16, stiffness: 90 } });
  const stamp = spring({ frame: frame - 576, fps, config: { damping: 11, stiffness: 190 } });

  // curseur (16:9) : trajectoire vers "Exporter ▾" puis vers l'entrée du menu
  const cx = interpolate(frame, [386, 448, 480, 500], [width * 0.46, width * 0.762, width * 0.746, width * 0.746], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const cy = interpolate(frame, [386, 448, 480, 500], [height * 0.78, height * 0.242, height * 0.335, height * 0.335], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const click1 = frame >= 448 && frame < 466 ? interpolate(frame, [448, 465], [0, 1]) : 0;
  const click2 = frame >= 500 && frame < 518 ? interpolate(frame, [500, 517], [0, 1]) : 0;
  const cursorVisible = interpolate(frame, [380, 396], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) * interpolate(frame, [560, 580], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const planningState = {
    fill,
    ping,
    menuOpen: menuOpen * menuGone,
    menuHot: menuHot * menuGone,
  };

  const winW = vertical ? 1180 : 1230;
  // 9:16 : pan latéral pendant le remplissage, puis recadrage sur le coin Exporter
  const panX = vertical
    ? interpolate(frame, [70, 300, 420, 470], [30, -140, -140, -430], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 0;

  const fileCard = (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: vertical ? '58%' : '56%',
        zIndex: 30,
        transform: `translate(-50%,-50%) translateY(${(1 - fileOut) * 240}px) scale(${0.6 + fileOut * 0.4}) rotate(${(1 - fileOut) * 6}deg)`,
        opacity: Math.min(1, fileOut * 1.5),
        filter: 'drop-shadow(0 50px 80px rgba(0,0,0,.7))',
      }}
    >
      <div style={{ background: '#fff', borderRadius: 20, padding: '30px 38px', display: 'flex', alignItems: 'center', gap: 22, position: 'relative', fontFamily: ARCHIVO }}>
        <div style={{ width: 74, height: 74, borderRadius: 16, background: '#1E6B41', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 26, fontFamily: MONO }}>
          XLS
        </div>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 25, fontWeight: 700, color: NOIR }}>paie_juin_2026.xlsx</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: GRIS_TXT, marginTop: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, background: VERT_OK, borderRadius: '50%' }} /> Prêt pour le comptable
          </div>
        </div>
        {/* tampon verrou */}
        <div
          style={{
            position: 'absolute', top: -34, right: -46,
            transform: `rotate(-9deg) scale(${0.4 + stamp * 0.6})`, opacity: Math.min(1, stamp * 1.3),
            background: NOIR, color: JAUNE, border: `3px solid ${JAUNE}`,
            borderRadius: 14, padding: '12px 20px', fontWeight: 900, fontSize: 24, fontFamily: ARCHIVO,
            boxShadow: '0 18px 40px -10px rgba(0,0,0,.55)', whiteSpace: 'nowrap',
          }}
        >
          🔒 Mois verrouillé
        </div>
      </div>
    </div>
  );

  return (
    <AbsoluteFill style={{ background: NOIR, fontFamily: ARCHIVO, overflow: 'hidden' }}>
      <AbsoluteFill style={{ backgroundImage: TEXTURE_CHANTIER }} />
      <div style={{ position: 'absolute', top: '58%', left: '50%', transform: 'translate(-50%,-50%)', width: 1300, height: 1300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,194,26,.11), transparent 62%)', filter: 'blur(26px)' }} />

      {/* titres */}
      <div style={{ position: 'absolute', top: vertical ? 96 : 64, left: 0, right: 0, textAlign: 'center', padding: '0 6%', zIndex: 20 }}>
        <div style={{ position: 'relative', height: vertical ? 190 : 110 }}>
          <div style={{ position: 'absolute', inset: 0, opacity: t1In * t1Out, transform: `translateY(${(1 - t1In) * 22}px)` }}>
            <span style={{ fontSize: vertical ? 60 : 58, fontWeight: 900, color: CREME, letterSpacing: '-.02em', lineHeight: 1.1 }}>
              Au bureau : tout arrive <span style={{ color: JAUNE }}>en temps réel</span>.
            </span>
          </div>
          <div style={{ position: 'absolute', inset: 0, opacity: t2In, transform: `translateY(${(1 - t2In) * 22}px)` }}>
            <span style={{ fontSize: vertical ? 60 : 58, fontWeight: 900, color: CREME, letterSpacing: '-.02em', lineHeight: 1.1 }}>
              Fin du mois : <span style={{ color: JAUNE }}>export paie en un clic</span>.
            </span>
          </div>
        </div>
        {/* sous-titre S4 */}
        <div style={{ marginTop: vertical ? 6 : 8, opacity: sub1In * t1Out }}>
          <span style={{ fontFamily: MONO, fontSize: vertical ? 27 : 25, fontWeight: 700, color: '#a59c86', letterSpacing: '.04em' }}>
            Zéro ressaisie.
          </span>
        </div>
      </div>

      {/* fenêtre planning */}
      <div
        style={{
          position: 'absolute', top: vertical ? '54%' : '58%', left: '50%',
          transform: `translate(-50%,-50%) translateX(${panX}px) perspective(2100px) rotateY(${tilt}deg) rotateX(${tilt / 3}deg) translateY(${(1 - enter) * 160}px)`,
        }}
      >
        <PlanningWindow width={winW} state={planningState} />
      </div>

      {/* fichier exporté + tampon */}
      {frame > 528 && fileCard}

      {/* curseur (16:9 uniquement — en 9:16 le recadrage suffit) */}
      {!vertical && cursorVisible > 0.02 && <div style={{ opacity: cursorVisible }}><Cursor x={cx} y={cy} click={Math.max(click1, click2)} /></div>}
    </AbsoluteFill>
  );
};
