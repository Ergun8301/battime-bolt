import { VITRINE_FONT_FACES, VITRINE_MAIN_FONT } from '@/lib/vitrine-fonts';

// Polices de la vitrine, servies depuis bemexo.com (voir lib/vitrine-fonts.ts).
// Remplace l'ancien @import vers fonts.googleapis.com : préchargement de la
// police principale + déclarations @font-face locales.
export default function VitrineFonts() {
  return (
    <>
      <link rel="preload" href={VITRINE_MAIN_FONT} as="font" type="font/woff2" crossOrigin="anonymous" />
      <style dangerouslySetInnerHTML={{ __html: VITRINE_FONT_FACES }} />
    </>
  );
}
