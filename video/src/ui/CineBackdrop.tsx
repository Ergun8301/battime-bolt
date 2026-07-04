import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { NOIR } from '../brand';

// Ambiance de fond v2 — "cinéma sobre" :
// noir profond #15120F + dégradé radial subtil (point chaud décentré) +
// grain cinématographique léger (bruit SVG, jitter par image) + vignettage doux.
// Le ruban chantier n'apparaît plus JAMAIS en fond permanent (transitions only).

const GRAIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="280" height="280" filter="url(#n)" opacity="0.6"/></svg>`;
const GRAIN = `url("data:image/svg+xml,${encodeURIComponent(GRAIN_SVG)}")`;

export const CineBackdrop: React.FC<{ warmth?: number }> = ({ warmth = 1 }) => {
  const frame = useCurrentFrame();
  // le grain "vit" : décalage pseudo-aléatoire toutes les 2 images
  const step = Math.floor(frame / 2);
  const gx = ((step * 97) % 280);
  const gy = ((step * 61) % 280);

  return (
    <AbsoluteFill style={{ background: NOIR }}>
      {/* point chaud décentré, très subtil */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 92% at 50% 36%, rgba(255,194,26,${0.055 * warmth}) 0%, rgba(255,194,26,${0.02 * warmth}) 32%, rgba(0,0,0,0) 62%)`,
        }}
      />
      {/* remontée chaude depuis le bas, à peine perceptible */}
      <AbsoluteFill
        style={{
          background: 'radial-gradient(140% 100% at 50% 112%, rgba(46,38,26,.55) 0%, rgba(0,0,0,0) 55%)',
        }}
      />
      {/* grain cinématographique */}
      <AbsoluteFill
        style={{
          backgroundImage: GRAIN,
          backgroundSize: '280px 280px',
          backgroundPosition: `${gx}px ${gy}px`,
          opacity: 0.055,
          mixBlendMode: 'overlay',
        }}
      />
      {/* vignettage doux */}
      <AbsoluteFill
        style={{
          background: 'radial-gradient(125% 125% at 50% 48%, rgba(0,0,0,0) 52%, rgba(0,0,0,.44) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};
