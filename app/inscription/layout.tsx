import type { Metadata } from 'next';

// Page utilitaire (création de compte) : hors de l'index Google. La landing
// et les pages de contenu SEO sont les portes d'entrée du référencement ; le
// formulaire d'inscription est atteint via un CTA, pas via la recherche.
// Purement additif : la page /inscription (client) est intacte, ce layout ne
// fait que passer les enfants et poser la balise noindex.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function InscriptionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
