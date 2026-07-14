import type { Metadata } from 'next';

// Page utilitaire (connexion) : on la garde crawlable mais hors de l'index
// Google — c'est un écran d'application sans valeur SEO, inutile de « polluer »
// l'indexation. Purement additif : la page /connexion (client) est intacte,
// ce layout ne fait que passer les enfants et poser la balise noindex.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function ConnexionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
