import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { S12Probleme } from './scenes/S12Probleme';
import { S3Poseur } from './scenes/S3Poseur';
import { S45Secretaire } from './scenes/S45Secretaire';
import { FinalCta } from './scenes/FinalCta';
import { NOIR } from './brand';

// Montage (~77 s à 30 i/s = 2310 images) — storyboard validé + beat hors-ligne :
//    0– 450  S1+S2  Problème puis balayage marque (15 s)
//  450–1110  S3     Poseur : 3 gestes + hors-ligne (22 s)
// 1110–1890  S4+S5  Secrétaire : temps réel + export paie (26 s)
// 1890–2310  S6     CTA final (14 s)
export const TIMELINE = {
  s12: { from: 0, duration: 450 },
  s3: { from: 450, duration: 660 },
  s45: { from: 1110, duration: 780 },
  s6: { from: 1890, duration: 420 },
};
export const TOTAL_FRAMES = 2310;

// Fondu court entre les blocs pour des coutures douces.
const FadeIn: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
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
    </AbsoluteFill>
  );
};
