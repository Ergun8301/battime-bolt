import { Composition } from 'remotion';
import { DemoVideo } from './DemoVideo';
import { PhoneShowcase } from './scenes/PhoneShowcase';

// Deux formats livrés : 16:9 (site / YouTube) et 9:16 (réseaux sociaux).
// 2310 images à 30 i/s ≈ 77 s (storyboard validé + beat hors-ligne).
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Demo169"
        component={DemoVideo}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={2430}
        defaultProps={{ vertical: false }}
      />
      <Composition
        id="Demo916"
        component={DemoVideo}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={2430}
        defaultProps={{ vertical: true }}
      />
      {/* Compos de validation (stills variantes téléphone v2) */}
      <Composition id="PhoneA" component={PhoneShowcase} width={1920} height={1080} fps={30} durationInFrames={60} defaultProps={{ variant: 'A' as const }} />
      <Composition id="PhoneB" component={PhoneShowcase} width={1920} height={1080} fps={30} durationInFrames={60} defaultProps={{ variant: 'B' as const }} />
    </>
  );
};
