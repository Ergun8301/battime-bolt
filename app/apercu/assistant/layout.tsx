import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Aperçu assistant — BEMEXO',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
