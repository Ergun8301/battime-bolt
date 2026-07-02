import { AbsoluteFill, Sequence } from 'remotion';
import { FinalCta } from './scenes/FinalCta';
import { NOIR } from './brand';

// Montage principal — les scènes seront ajoutées ici une fois le storyboard
// validé (S1 problème → S2 marque → S3 poseur → S4 planning → S5 export → S6 CTA).
// Pour l'instant : squelette + scène finale (preuve de style / test de rendu).
export const DemoVideo: React.FC<{ vertical?: boolean }> = ({ vertical = false }) => {
  return (
    <AbsoluteFill style={{ background: NOIR }}>
      <Sequence from={0} durationInFrames={300}>
        <FinalCta vertical={vertical} />
      </Sequence>
    </AbsoluteFill>
  );
};
