import type { Metadata } from 'next';

// Borne de pointage (lot 1) : écran d'usage, hors de l'index Google.
//
// Lot 2 (IA) — SON PROPRE MANIFESTE. Le manifeste du site (start_url "/")
// était hérité ici : l'icône ajoutée depuis /borne ouvrait "/", puis la
// vitrine. Celui-ci (public/borne.webmanifest) ouvre /borne, en plein écran,
// dans les deux sens de la tablette. Il ne remplace le manifeste du site que
// sur /borne ; les autres pages gardent public/manifest.json.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  manifest: '/borne.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black',
    title: 'BEMEXO Borne',
  },
};

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
