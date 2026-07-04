import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { ARCHIVO, CREME, GRIS_TXT, JAUNE, MONO, NOIR, RUBAN } from '../brand';
import { CineBackdrop } from '../ui/CineBackdrop';

// S1 (0→330) : le problème — papier, WhatsApp, Excel s'empilent de travers.
// S2 (330→450) : le ruban de chantier balaie tout, le X BEMEXO se pose.
// Fusionnées pour que le balayage emporte réellement les éléments de S1.

const Paper: React.FC<{ s: number }> = ({ s }) => (
  <div style={{ width: 420 * s, background: '#FFFDF7', borderRadius: 10 * s, boxShadow: '0 30px 60px -20px rgba(21,18,15,.35)', padding: 24 * s, border: '1px solid rgba(21,18,15,.08)' }}>
    <div style={{ fontFamily: MONO, fontSize: 15 * s, fontWeight: 700, color: NOIR, letterSpacing: '.05em', marginBottom: 12 * s }}>
      FEUILLE D&apos;HEURES — SEM. 25
    </div>
    {[
      ['Lundi', '7h30 ?'],
      ['Mardi', '— (perdu)'],
      ['Mercredi', '8h ou 9h…'],
    ].map(([d, v], i) => (
      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1.5px solid rgba(21,18,15,.14)', padding: `${10 * s}px 2px`, fontSize: 19 * s, fontWeight: 700, color: i === 1 ? '#B04A2E' : GRIS_TXT, fontStyle: i > 0 ? 'italic' : 'normal' }}>
        <span>{d}</span>
        <span>{v}</span>
      </div>
    ))}
    <div style={{ marginTop: 12 * s, fontSize: 15 * s, fontWeight: 600, color: '#B04A2E', fontStyle: 'italic', transform: 'rotate(-2deg)' }}>
      ⚠ à confirmer avec Karim…
    </div>
  </div>
);

const Whats: React.FC<{ s: number }> = ({ s }) => (
  <div style={{ width: 400 * s }}>
    <div style={{ background: '#E4F7CF', borderRadius: `${18 * s}px ${18 * s}px ${4 * s}px ${18 * s}px`, padding: `${16 * s}px ${18 * s}px`, boxShadow: '0 24px 50px -18px rgba(21,18,15,.35)' }}>
      <div style={{ fontSize: 20 * s, fontWeight: 700, color: '#1c1a17' }}>T&apos;as fait combien d&apos;heures lundi ?</div>
      <div style={{ textAlign: 'right', fontSize: 13 * s, color: '#7d8a6e', fontWeight: 600, marginTop: 6 * s }}>19:47 ✓✓</div>
    </div>
    <div style={{ background: '#fff', width: '82%', borderRadius: `${18 * s}px ${18 * s}px ${18 * s}px ${4 * s}px`, padding: `${14 * s}px ${16 * s}px`, marginTop: 10 * s, boxShadow: '0 24px 50px -18px rgba(21,18,15,.3)' }}>
      <div style={{ fontSize: 18 * s, fontWeight: 700, color: '#3c3934' }}>je sais plus chef 😅</div>
    </div>
  </div>
);

const Excel: React.FC<{ s: number }> = ({ s }) => {
  const cell: React.CSSProperties = { border: '1px solid #d5d2ca', padding: `${8 * s}px ${10 * s}px`, fontSize: 15 * s, fontWeight: 600, color: '#3c3934', background: '#fff' };
  return (
    <div style={{ width: 430 * s, borderRadius: 10 * s, overflow: 'hidden', boxShadow: '0 30px 60px -20px rgba(21,18,15,.35)', border: '1px solid #d5d2ca' }}>
      <div style={{ background: '#1E6B41', color: '#fff', fontWeight: 800, fontSize: 15 * s, padding: `${9 * s}px ${12 * s}px`, fontFamily: MONO }}>
        recap_heures_juin_V7_FINAL(2).xlsx
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr' }}>
        <div style={{ ...cell, fontWeight: 800, background: '#EFEDE6' }}>Salarié</div>
        <div style={{ ...cell, fontWeight: 800, background: '#EFEDE6' }}>Lun</div>
        <div style={{ ...cell, fontWeight: 800, background: '#EFEDE6' }}>Mar</div>
        <div style={cell}>Karim B.</div>
        <div style={{ ...cell, color: '#C0392B', fontWeight: 800 }}>#REF!</div>
        <div style={cell}>7,5</div>
        <div style={cell}>Julien M.</div>
        <div style={cell}>8</div>
        <div style={{ ...cell, color: '#C0392B', fontWeight: 800 }}>??</div>
      </div>
    </div>
  );
};

export const S12Probleme: React.FC<{ vertical?: boolean }> = ({ vertical = false }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const s = vertical ? 0.92 : 1;

  // chute des 3 éléments (rebond léger)
  const drop = (delay: number) =>
    spring({ frame: frame - delay, fps, config: { damping: 13, stiffness: 110, mass: 0.9 } });
  const d1 = drop(14);
  const d2 = drop(48);
  const d3 = drop(84);

  // textes S1
  const t1In = spring({ frame: frame - 4, fps, config: { damping: 200 } });
  const t1Out = interpolate(frame, [150, 168], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const t2In = interpolate(frame, [168, 186], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // S2 : balayage (335→410), X + texte (395→450)
  const wipe = interpolate(frame, [335, 408], [0, 1], { easing: Easing.inOut(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const eased = wipe;
  const push = eased * (vertical ? height : width) * 1.35;
  const xIn = spring({ frame: frame - 396, fps, config: { damping: 15, stiffness: 120 } });
  const txtIn = spring({ frame: frame - 412, fps, config: { damping: 200 } });

  const itemWrap = (p: number, rot: number, extra?: React.CSSProperties): React.CSSProperties => ({
    transform: `translateY(${(1 - p) * -560}px) translateX(${push}px) rotate(${rot + (1 - p) * -10}deg)`,
    opacity: Math.min(1, p * 1.4),
    ...extra,
  });

  return (
    <AbsoluteFill style={{ background: CREME, fontFamily: ARCHIVO, overflow: 'hidden' }}>
      {/* vignettage doux côté crème (cohérence ciné avec le reste du film) */}
      <AbsoluteFill style={{ background: 'radial-gradient(130% 130% at 50% 45%, rgba(21,18,15,0) 58%, rgba(21,18,15,.14) 100%)', pointerEvents: 'none' }} />
      {/* ===== S1 : titres ===== */}
      <div style={{ position: 'absolute', top: vertical ? '9%' : '10%', left: 0, right: 0, textAlign: 'center', padding: '0 7%' }}>
        <div style={{ position: 'relative', height: vertical ? 220 : 130 }}>
          <div style={{ position: 'absolute', inset: 0, opacity: t1In * t1Out, transform: `translateY(${(1 - t1In) * 26}px)` }}>
            <span style={{ fontSize: vertical ? 74 : 72, fontWeight: 900, color: NOIR, letterSpacing: '-.02em', lineHeight: 1.05 }}>
              Chaque fin de mois,<br />la même galère.
            </span>
          </div>
          <div style={{ position: 'absolute', inset: 0, opacity: t2In * (1 - eased), transform: `translateY(${(1 - t2In) * 26}px)` }}>
            <span style={{ fontFamily: MONO, fontSize: vertical ? 34 : 34, fontWeight: 700, color: GRIS_TXT, letterSpacing: '.02em', lineHeight: 1.5 }}>
              Papier perdu · Ressaisie Excel<br />Relances WhatsApp
            </span>
          </div>
        </div>
      </div>

      {/* ===== S1 : les 3 galères ===== */}
      {vertical ? (
        <div style={{ position: 'absolute', top: '33%', left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34 }}>
          <div style={itemWrap(d1, -6)}><Paper s={s * 1.05} /></div>
          <div style={itemWrap(d2, 4, { marginLeft: 90 })}><Whats s={s * 1.05} /></div>
          <div style={itemWrap(d3, -3, { marginRight: 60 })}><Excel s={s * 1.05} /></div>
        </div>
      ) : (
        <div style={{ position: 'absolute', top: '39%', left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: 70 }}>
          <div style={itemWrap(d1, -7, { marginTop: 60 })}><Paper s={s} /></div>
          <div style={itemWrap(d2, 3)}><Whats s={s} /></div>
          <div style={itemWrap(d3, 5, { marginTop: 90 })}><Excel s={s} /></div>
        </div>
      )}

      {/* ===== S2 : panneau noir + ruban qui balaie (le ruban ne sert QUE de transition) ===== */}
      <div
        style={{
          position: 'absolute', top: '-25%', bottom: '-25%', left: '-40%', width: '190%',
          transform: `translateX(${(-1.08 + eased * 1.08) * 100}%) rotate(${vertical ? -4 : -7}deg)`,
          background: NOIR,
          boxShadow: '40px 0 120px rgba(0,0,0,.45)',
        }}
      >
        <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 30, background: RUBAN }} />
      </div>

      {/* une fois couvert : ambiance ciné v2 par-dessus le panneau */}
      {frame > 392 && (
        <AbsoluteFill style={{ opacity: interpolate(frame, [396, 424], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
          <CineBackdrop />
        </AbsoluteFill>
      )}

      {/* ===== S2 : X + texte ===== */}
      {frame > 390 && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: vertical ? 46 : 40 }}>
            <Img
              src={staticFile('bemexo-x-light.svg')}
              style={{
                width: vertical ? 210 : 190,
                opacity: xIn,
                transform: `scale(${0.4 + xIn * 0.6}) rotate(${(1 - xIn) * 90}deg)`,
              }}
            />
            <div style={{ fontSize: vertical ? 66 : 62, fontWeight: 900, color: CREME, letterSpacing: '-.02em', opacity: txtIn, transform: `translateY(${(1 - txtIn) * 24}px)` }}>
              Il y a plus simple.
            </div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
