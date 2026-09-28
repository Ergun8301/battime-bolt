import type { Metadata } from 'next';

// Écrans ouverts depuis un e-mail : hors de l'index Google.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function EmailLinkLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
