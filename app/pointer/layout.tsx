import type { Metadata } from 'next';
// Étape 7 : P00 à P04 de la planche, sous `.dz-pointer` (posée par la page seulement avec ?ui=2).
import '@/components/design/salarie/dz-jetons.css';
import '@/components/design/salarie/pointer-v2.css';

// Borne de pointage (lot 1) : écran d'usage, hors de l'index Google.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
