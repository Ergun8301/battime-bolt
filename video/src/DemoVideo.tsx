import { AbsoluteFill, Easing, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { S12Probleme } from './scenes/S12Probleme';
import { S3Poseur } from './scenes/S3Poseur';
import { S45Secretaire } from './scenes/S45Secretaire';
import { FinalCta } from './scenes/FinalCta';
import { NOIR, RUBAN } from './brand';

// Montage v2 (~81 s à 30 i/s = 2430 images) :
//    0– 450  S1+S2  Problème puis balayage marque (15 s)
//  450–1110  S3     Poseur : 3 gestes + hors-ligne (22 s) — variante A
// 1110–2010  S4+S5  Secrétaire : establishing + temps réel + relance + export (30 s)
// 2010–2430  S6     CTA final (14 s)
// Le ruban chantier n'apparaît QUE dans les transitions entre actes.
export const TIMELINE = {
  s12: { from: 0, duration: 450 },
  s3: { from: 450, duration: 660 },
  s45: { from: 1110, duration: 900 },
  s6: { from: 2010, duration: 420 },
};
export const TOTAL_FRAMES = 2430;

// Fondu court en tête de bloc (coutures douces).
const FadeIn: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

// Transition signature : panneau noir bordé de ruban chantier qui traverse
// l'écran (28 images), à cheval sur la coupe entre deux actes.
const RubanWipe: React.FC = () => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, 28], [0, 1], { easing: Easing.inOut(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const x = -145 + t * 290; // % — couvre tout l'écran à t=0.5 (pile sur la coupe)
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 50 }}>
      <div
        style={{
          position: 'absolute', top: '-30%', bottom: '-30%', left: `${x}%`, width: '140%',
          transform: 'rotate(-8deg)', background: NOIR,
          boxShadow: '0 0 110px rgba(0,0,0,.6)',
        }}
      >
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 26, background: RUBAN }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 26, background: RUBAN }} />
      </div>
    </AbsoluteFill>
  );
};

export const DemoVideo: React.FC<{ vertical?: boolean }> = ({ vertical = false }) => {
  return (
    <AbsoluteFill style={{ background: NOIR }}>
      <Sequence from={TIMELINE.s12.from} durationInFrames={TIMELINE.s12.duration}>
        <S12Probleme vertical={vertical} />
      </Sequence>
      <Sequence from={TIMELINE.s3.from} durationInFrames={TIMELINE.s3.duration}>
        <FadeIn>
          <S3Poseur vertical={vertical} />
        </FadeIn>
      </Sequence>
      <Sequence from={TIMELINE.s45.from} durationInFrames={TIMELINE.s45.duration}>
        <FadeIn>
          <S45Secretaire vertical={vertical} />
        </FadeIn>
      </Sequence>
      <Sequence from={TIMELINE.s6.from} durationInFrames={TIMELINE.s6.duration}>
        <FadeIn>
          <FinalCta vertical={vertical} />
        </FadeIn>
      </Sequence>

      {/* transitions ruban entre les actes (à cheval sur les coupes) */}
      <Sequence from={TIMELINE.s45.from - 14} durationInFrames={28}>
        <RubanWipe />
      </Sequence>
      <Sequence from={TIMELINE.s6.from - 14} durationInFrames={28}>
        <RubanWipe />
      </Sequence>
    </AbsoluteFill>
  );
};
