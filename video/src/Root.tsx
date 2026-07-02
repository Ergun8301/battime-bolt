import { Composition } from 'remotion';
import { DemoVideo } from './DemoVideo';

// Deux formats livrés : 16:9 (site / YouTube) et 9:16 (réseaux sociaux).
// Durée provisoire (squelette) — passera à ~75 s une fois toutes les scènes montées.
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Demo169"
        component={DemoVideo}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={300}
        defaultProps={{ vertical: false }}
      />
      <Composition
        id="Demo916"
        component={DemoVideo}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={300}
        defaultProps={{ vertical: true }}
      />
    </>
  );
};
