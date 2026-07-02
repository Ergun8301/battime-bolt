import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { ARCHIVO, CREME, GRIS_TXT, JAUNE, JAUNE_OMBRE, MONO, NOIR, RUBAN, TEXTURE_CHANTIER } from '../brand';

// Scène finale — CTA. Sert aussi de "preuve de style" (still) avant validation
// du storyboard : wordmark BEMEXO, slogan, bouton jaune signature, ruban chantier.
export const FinalCta: React.FC<{ vertical?: boolean }> = ({ vertical = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pop = (delay: number) =>
    spring({ frame: frame - delay, fps, config: { damping: 200, stiffness: 90 } });

  const logoIn = pop(5);
  const sloganIn = pop(22);
  const slogan2In = pop(34);
  const btnIn = pop(50);
  const footIn = interpolate(frame, [62, 76], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const logoW = vertical ? '72%' : '44%';

  return (
    <AbsoluteFill style={{ background: NOIR, fontFamily: ARCHIVO, alignItems: 'center', justifyContent: 'center' }}>
      <AbsoluteFill style={{ backgroundImage: TEXTURE_CHANTIER }} />

      {/* halo jaune discret, comme le panneau noir de l'inscription */}
      <div
        style={{
          position: 'absolute', top: '48%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 1100, height: 1100, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,194,26,.16), transparent 60%)', filter: 'blur(24px)',
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: vertical ? 54 : 44, zIndex: 2, padding: '0 6%' }}>
        <Img
          src={staticFile('bemexo-wordmark-light.svg')}
          style={{
            width: logoW,
            opacity: logoIn,
            transform: `translateY(${(1 - logoIn) * 40}px) scale(${0.92 + logoIn * 0.08})`,
          }}
        />

        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              color: CREME, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.08,
              fontSize: vertical ? 76 : 84,
              opacity: sloganIn, transform: `translateY(${(1 - sloganIn) * 30}px)`,
            }}
          >
            Une seule saisie.
          </div>
          <div
            style={{
              color: JAUNE, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.08,
              fontSize: vertical ? 76 : 84,
              opacity: slogan2In, transform: `translateY(${(1 - slogan2In) * 30}px)`,
            }}
          >
            Tout suit.
          </div>
        </div>

        <div
          style={{
            background: JAUNE, color: NOIR, fontWeight: 900,
            fontSize: vertical ? 44 : 40,
            padding: vertical ? '30px 64px' : '26px 58px',
            borderRadius: 22, boxShadow: `0 10px 0 ${JAUNE_OMBRE}`,
            opacity: btnIn, transform: `translateY(${(1 - btnIn) * 26}px) scale(${0.94 + btnIn * 0.06})`,
          }}
        >
          Essayer 30 jours gratuits →
        </div>

        <div style={{ fontFamily: MONO, color: GRIS_TXT, fontWeight: 700, fontSize: vertical ? 28 : 26, letterSpacing: '.06em', opacity: footIn }}>
          Sans carte bancaire · Prêt en 5 min · bemexo.fr
        </div>
      </div>

      {/* ruban chantier en pied */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 18, background: RUBAN }} />
    </AbsoluteFill>
  );
};
