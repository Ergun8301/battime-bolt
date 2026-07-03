import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { ARCHIVO, CREME, CREME_TXT_DIM, JAUNE, MONO, NOIR, ROUILLE, TEXTURE_CHANTIER } from '../brand';
import { PhoneMaJournee } from '../ui/PhoneMaJournee';
import { clamp01 } from '../ui/helpers';

// S3 (660 images ≈ 22 s) : le poseur pointe en 3 gestes + beat hors-ligne.
// 0–90 entrée 3D · 90–240 ① chantier · 240–420 ② heures · 420–480 hors-ligne · 480–630 ③ envoyer

const END_START = 450; // 07:30
const END_FINAL = 690; // 11:30

export const S3Poseur: React.FC<{ vertical?: boolean }> = ({ vertical = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // entrée du téléphone : incliné 3D -> droit
  const enter = spring({ frame, fps, config: { damping: 60, stiffness: 60 }, durationInFrames: 80 });
  const tilt = (1 - enter) * (vertical ? 26 : 32);
  const rise = (1 - enter) * 220;

  // ① feuille chantier
  const sheet =
    interpolate(frame, [104, 126], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) *
    interpolate(frame, [196, 214], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const tapPulse = interpolate(frame, [150, 186], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const selected = spring({ frame: frame - 214, fps, config: { damping: 200 } });

  // ② molette des heures
  const wheel = interpolate(frame, [268, 388], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const wheelEased = 1 - Math.pow(1 - wheel, 2.2);
  const endMinutes = END_START + Math.round((wheelEased * (END_FINAL - END_START)) / 15) * 15;

  // beat hors-ligne
  const offline =
    interpolate(frame, [420, 436], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) *
    interpolate(frame, [560, 590], [1, 0.0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // ③ envoyer
  const pressed =
    interpolate(frame, [508, 518], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) *
    interpolate(frame, [524, 534], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const sent = spring({ frame: frame - 534, fps, config: { damping: 12, stiffness: 160 } });

  // étape active pour les libellés
  const step = frame < 240 ? 1 : frame < 420 ? 2 : frame < 480 ? 0 : 3; // 0 = beat hors-ligne
  const titleIn = spring({ frame: frame - 8, fps, config: { damping: 200 } });

  const stepDefs = [
    { n: '①', label: 'Choisir le chantier', active: step === 1, at: 92 },
    { n: '②', label: 'Régler les heures', active: step === 2, at: 244 },
    { n: '③', label: 'Envoyer', active: step === 3, at: 484 },
  ];

  const phoneState = {
    sheet,
    tapPulse,
    selected,
    endMinutes: selected > 0.1 ? endMinutes : END_START,
    pressed,
    sent: frame > 534 ? sent : 0,
    offline,
  };

  const offlineCard = (big: boolean) => (
    <div
      style={{
        opacity: clamp01(offline),
        transform: `translateY(${(1 - clamp01(offline)) * 22}px)`,
        background: 'rgba(192,70,31,.14)',
        border: `2px solid ${ROUILLE}`,
        borderRadius: 18,
        padding: big ? '24px 30px' : '20px 24px',
        display: 'flex', alignItems: 'center', gap: 20,
      }}
    >
      <div style={{ fontSize: big ? 42 : 36, lineHeight: 1 }}>📡</div>
      <div>
        <div style={{ fontSize: big ? 37 : 32, fontWeight: 900, color: CREME, letterSpacing: '-.015em', lineHeight: 1.16, whiteSpace: 'nowrap' }}>
          Pas de réseau ?<br />Ça pointe quand même.
        </div>
        <div style={{ fontFamily: MONO, fontSize: big ? 19 : 17, fontWeight: 700, color: CREME_TXT_DIM, marginTop: 8 }}>
          Synchronisé au retour du signal.
        </div>
      </div>
    </div>
  );

  // ============ 9:16 ============
  if (vertical) {
    return (
      <AbsoluteFill style={{ background: NOIR, fontFamily: ARCHIVO, overflow: 'hidden' }}>
        <AbsoluteFill style={{ backgroundImage: TEXTURE_CHANTIER }} />
        <div style={{ position: 'absolute', top: 74, left: 0, right: 0, textAlign: 'center', padding: '0 60px', opacity: titleIn }}>
          <span style={{ fontSize: 62, fontWeight: 900, color: CREME, letterSpacing: '-.02em', lineHeight: 1.1 }}>
            Sur le chantier :<br /><span style={{ color: JAUNE }}>3 gestes</span>, montre en main.
          </span>
        </div>

        <div style={{ position: 'absolute', top: 310, bottom: 250, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ transform: `perspective(1700px) translateY(${rise}px) rotateY(${-tilt}deg) rotateX(${tilt / 4}deg)` }}>
            <PhoneMaJournee width={620} state={phoneState} />
          </div>
        </div>

        {/* libellé d'étape / beat hors-ligne en bas */}
        <div style={{ position: 'absolute', bottom: 96, left: 0, right: 0, display: 'flex', justifyContent: 'center', padding: '0 54px' }}>
          {step === 0 ? (
            offlineCard(false)
          ) : (
            <div style={{ display: 'flex', gap: 14 }}>
              {stepDefs.map((sd) => {
                const on = spring({ frame: frame - sd.at, fps, config: { damping: 200 } });
                return (
                  <div
                    key={sd.n}
                    style={{
                      opacity: 0.35 + (sd.active ? 0.65 : 0) * on,
                      background: sd.active ? JAUNE : 'rgba(242,237,227,.1)',
                      color: sd.active ? NOIR : CREME,
                      border: `1.5px solid ${sd.active ? JAUNE : 'rgba(242,237,227,.25)'}`,
                      borderRadius: 999, padding: '16px 26px', fontWeight: 900, fontSize: 27,
                      transform: `scale(${sd.active ? 0.94 + on * 0.06 : 1})`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {sd.n} {sd.label}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </AbsoluteFill>
    );
  }

  // ============ 16:9 ============
  return (
    <AbsoluteFill style={{ background: NOIR, fontFamily: ARCHIVO, overflow: 'hidden' }}>
      <AbsoluteFill style={{ backgroundImage: TEXTURE_CHANTIER }} />
      {/* halo derrière le téléphone */}
      <div style={{ position: 'absolute', top: '50%', left: '68%', transform: 'translate(-50%,-50%)', width: 1000, height: 1000, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,194,26,.13), transparent 60%)', filter: 'blur(22px)' }} />

      {/* colonne texte gauche */}
      <div style={{ position: 'absolute', left: '7%', top: 0, bottom: 0, width: '38%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 34 }}>
        <div style={{ opacity: titleIn, transform: `translateY(${(1 - titleIn) * 24}px)` }}>
          <span style={{ fontSize: 64, fontWeight: 900, color: CREME, letterSpacing: '-.02em', lineHeight: 1.08 }}>
            Sur le chantier :<br /><span style={{ color: JAUNE }}>3 gestes</span>,<br />montre en main.
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
          {stepDefs.map((sd) => {
            const on = spring({ frame: frame - sd.at, fps, config: { damping: 200 } });
            const done = (sd.n === '①' && frame > 240) || (sd.n === '②' && frame > 420) || (sd.n === '③' && frame > 560 && sent > 0.6);
            return (
              <div
                key={sd.n}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  opacity: 0.3 + 0.7 * on,
                  transform: `translateX(${(1 - on) * -26}px)`,
                }}
              >
                <span
                  style={{
                    width: 58, height: 58, borderRadius: 16, flex: 'none',
                    background: sd.active ? JAUNE : done ? 'rgba(47,163,107,.18)' : 'rgba(242,237,227,.08)',
                    border: `2px solid ${sd.active ? JAUNE : done ? '#2FA36B' : 'rgba(242,237,227,.22)'}`,
                    color: sd.active ? NOIR : done ? '#7fd3a8' : CREME,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 900, fontSize: 26,
                  }}
                >
                  {done ? '✓' : sd.n.replace(/[①②③]/, (m) => ({ '①': '1', '②': '2', '③': '3' }[m] as string))}
                </span>
                <span style={{ fontSize: 37, fontWeight: 800, color: sd.active ? CREME : CREME_TXT_DIM, letterSpacing: '-.01em' }}>
                  {sd.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* beat hors-ligne : carte qui remplace momentanément la liste visuellement */}
        <div style={{ position: 'absolute', bottom: 90, left: 0 }}>{step === 0 || offline > 0.02 ? offlineCard(true) : null}</div>
      </div>

      {/* téléphone à droite, entrée en perspective */}
      <div
        style={{
          position: 'absolute', top: '50%', left: '68%',
          transform: `translate(-50%,-50%) perspective(1800px) translateY(${rise * 0.4}px) rotateY(${-tilt}deg) rotateX(${tilt / 3.5}deg)`,
        }}
      >
        <PhoneMaJournee width={470} state={phoneState} />
      </div>
    </AbsoluteFill>
  );
};
