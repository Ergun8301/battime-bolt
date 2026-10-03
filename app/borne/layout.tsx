import type { Metadata } from 'next';

// Borne de pointage (lot 1) : écran d'usage, hors de l'index Google.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
