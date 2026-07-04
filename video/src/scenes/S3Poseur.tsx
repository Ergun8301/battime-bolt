import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { ARCHIVO, CREME, CREME_TXT_DIM, JAUNE, MONO, NOIR, ROUILLE } from '../brand';
import { CineBackdrop } from '../ui/CineBackdrop';
import { PhoneMaJournee } from '../ui/PhoneMaJournee';
import { clamp01 } from '../ui/helpers';

// S3 v2 (660 images ≈ 22 s) — VARIANTE A : téléphone frontal flottant (zéro
// rotation), élévation (ombres larges diffuses), flottement léger, parallaxe
// multicouche discrète. 3 gestes + beat hors-ligne.
// 0–90 entrée · 90–240 ① chantier · 240–420 ② heures · 420–480 hors-ligne · 480–630 ③ envoyer

const easeIO = Easing.inOut(Easing.cubic);
const END_START = 450; // 07:30
const END_FINAL = 690; // 11:30

export const S3Poseur: React.FC<{ vertical?: boolean }> = ({ vertical = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // entrée variante A : montée douce avec léger dépassement, PAS de rotation
  const enter = spring({ frame: frame - 4, fps, config: { damping: 17, stiffness: 84, mass: 1 } });
  const rise = (1 - enter) * 300;
  // flottement d'élévation permanent (très léger)
  const float = Math.sin(frame / 36) * 5 * enter;

  // ① feuille chantier
  const sheet =
    interpolate(frame, [104, 128], [0, 1], { easing: easeIO, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) *
    interpolate(frame, [196, 216], [1, 0], { easing: easeIO, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const tapPulse = interpolate(frame, [150, 186], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const selected = spring({ frame: frame - 216, fps, config: { damping: 200 } });

  // ② molette des heures
  const wheel = interpolate(frame, [268, 388], [0, 1], { easing: Easing.out(Easing.quad), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const endMinutes = END_START + Math.round((wheel * (END_FINAL - END_START)) / 15) * 15;

  // beat hors-ligne
  const offline =
    interpolate(frame, [420, 438], [0, 1], { easing: easeIO, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) *
    interpolate(frame, [560, 590], [1, 0], { easing: easeIO, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // ③ envoyer
  const pressed =
    interpolate(frame, [508, 518], [0, 1], { easing: easeIO, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) *
    interpolate(frame, [524, 534], [1, 0], { easing: easeIO, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const sent = spring({ frame: frame - 534, fps, config: { damping: 12, stiffness: 160 } });
  // pulsation du badge ✓ Envoyé après apparition
  const sentPulse = frame > 560 ? 1 + Math.sin((frame - 560) / 9) * 0.035 * Math.max(0, 1 - (frame - 560) / 90) : 1;

  const step = frame < 240 ? 1 : frame < 420 ? 2 : frame < 480 ? 0 : 3;
  const titleIn = spring({ frame: frame - 10, fps, config: { damping: 200 } });

  const stepDefs = [
    { n: '1', label: 'Choisir le chantier', active: step === 1, at: 92, done: frame > 240 },
    { n: '2', label: 'Régler les heures', active: step === 2, at: 244, done: frame > 420 },
    { n: '3', label: 'Envoyer', active: step === 3, at: 484, done: frame > 560 && sent > 0.6 },
  ];

  const phoneState = {
    sheet,
    tapPulse,
    selected,
    endMinutes: selected > 0.1 ? endMinutes : END_START,
    pressed,
    sent: frame > 534 ? sent * sentPulse : 0,
    offline,
  };

  const phone = (width: number) => (
    <div style={{ transform: `translateY(${rise + float}px)`, opacity: Math.min(1, enter * 1.35) }}>
      {/* halo d'élévation (couche parallaxe proche) */}
      <div
        style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: `translate(-50%,-50%) translateY(${-float * 0.4}px)`,
          width: width * 1.9, height: width * 1.9, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,194,26,.10), transparent 58%)', filter: 'blur(32px)',
        }}
      />
      <div style={{ filter: 'drop-shadow(0 80px 110px rgba(0,0,0,.62)) drop-shadow(0 26px 42px rgba(0,0,0,.42))', position: 'relative' }}>
        <PhoneMaJournee width={width} state={phoneState} />
      </div>
    </div>
  );

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
      <AbsoluteFill style={{ fontFamily: ARCHIVO, overflow: 'hidden' }}>
        <CineBackdrop />
        <div style={{ position: 'absolute', top: 84, left: 0, right: 0, textAlign: 'center', padding: '0 60px', opacity: titleIn, transform: `translateY(${(1 - titleIn) * 22}px)` }}>
          <span style={{ fontSize: 62, fontWeight: 900, color: CREME, letterSpacing: '-.02em', lineHeight: 1.1 }}>
            Sur le chantier :<br /><span style={{ color: JAUNE }}>3 gestes</span>, montre en main.
          </span>
        </div>

        <div style={{ position: 'absolute', top: 330, bottom: 250, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative' }}>{phone(600)}</div>
        </div>

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
                    {sd.done ? '✓' : sd.n} {sd.label}
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
    <AbsoluteFill style={{ fontFamily: ARCHIVO, overflow: 'hidden' }}>
      <CineBackdrop />
      {/* halo de fond (couche parallaxe lointaine — bouge à l'inverse du flottement) */}
      <div
        style={{
          position: 'absolute', top: '50%', left: `${67 + Math.sin(frame / 80) * 0.8}%`,
          transform: `translate(-50%,-50%) translateY(${float * -0.5}px)`,
          width: 1050, height: 1050, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,194,26,.09), transparent 60%)', filter: 'blur(26px)',
        }}
      />

      {/* colonne texte gauche (couche intermédiaire) */}
      <div style={{ position: 'absolute', left: '7%', top: 0, bottom: 0, width: '38%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 34, transform: `translateY(${float * 0.25}px)` }}>
        <div style={{ opacity: titleIn, transform: `translateY(${(1 - titleIn) * 24}px)` }}>
          <span style={{ fontSize: 64, fontWeight: 900, color: CREME, letterSpacing: '-.02em', lineHeight: 1.08 }}>
            Sur le chantier :<br /><span style={{ color: JAUNE }}>3 gestes</span>,<br />montre en main.
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
          {stepDefs.map((sd) => {
            const on = spring({ frame: frame - sd.at, fps, config: { damping: 200 } });
            return (
              <div key={sd.n} style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: 0.3 + 0.7 * on, transform: `translateX(${(1 - on) * -26}px)` }}>
                <span
                  style={{
                    width: 58, height: 58, borderRadius: 16, flex: 'none',
                    background: sd.active ? JAUNE : sd.done ? 'rgba(47,163,107,.18)' : 'rgba(242,237,227,.08)',
                    border: `2px solid ${sd.active ? JAUNE : sd.done ? '#2FA36B' : 'rgba(242,237,227,.22)'}`,
                    color: sd.active ? NOIR : sd.done ? '#7fd3a8' : CREME,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 900, fontSize: 26,
                    transform: sd.active ? `scale(${1 + Math.sin(frame / 11) * 0.03})` : 'none',
                  }}
                >
                  {sd.done ? '✓' : sd.n}
                </span>
                <span style={{ fontSize: 37, fontWeight: 800, color: sd.active ? CREME : CREME_TXT_DIM, letterSpacing: '-.01em' }}>
                  {sd.label}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ position: 'absolute', bottom: 90, left: 0 }}>{step === 0 || offline > 0.02 ? offlineCard(true) : null}</div>
      </div>

      {/* téléphone frontal flottant (couche avant) */}
      <div style={{ position: 'absolute', top: '50%', left: '68%', transform: 'translate(-50%,-50%)' }}>
        <div style={{ position: 'relative' }}>{phone(452)}</div>
      </div>
    </AbsoluteFill>
  );
};
