import { Composition } from 'remotion';
import { DemoVideo } from './DemoVideo';

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
        durationInFrames={2310}
        defaultProps={{ vertical: false }}
      />
      <Composition
        id="Demo916"
        component={DemoVideo}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={2310}
        defaultProps={{ vertical: true }}
      />
    </>
  );
};
