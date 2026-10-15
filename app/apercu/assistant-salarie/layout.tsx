import type { Metadata } from 'next';
// Information d'endroit (carte de l'assistant) : feuille de style au niveau de la route (voir app/poseur/layout.tsx).
import '@/components/geo-info-dialog.css';

export const metadata: Metadata = {
  title: 'Aperçu assistant salarié — BEMEXO',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
