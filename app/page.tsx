import type { Metadata } from 'next';
import HomeRedirect from '@/components/home-redirect';

// La racine "/" ne sert qu'un aiguillage (loader + redirection) : pour les
// visiteurs non connectés, elle renvoie vers /landing. Sans signal, Google
// confond "/" et "/landing" (contenu identique après redirection) et peut
// choisir "/" comme original → /landing marquée « doublon ». On lève
// l'ambiguïté : "/" déclare explicitement /landing comme page canonique.
export const metadata: Metadata = {
  alternates: { canonical: 'https://bemexo.com/landing' },
};

export default function Home() {
  return <HomeRedirect />;
}
