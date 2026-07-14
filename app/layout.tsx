import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/components/auth-provider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://bemexo.com'),
  title: 'BEMEXO — Feuilles d\'heures BTP',
  description: 'Gestion simplifiée des feuilles d\'heures pour les entreprises du BTP',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'BEMEXO',
  },
  // Valeurs Open Graph / Twitter par défaut, héritées par les pages qui ne
  // définissent pas les leurs (pages légales, appli…). La landing et les pages
  // SEO fournissent leurs propres variantes.
  openGraph: {
    type: 'website',
    siteName: 'BEMEXO',
    locale: 'fr_FR',
    title: 'BEMEXO — Feuilles d\'heures BTP',
    description: 'Gestion simplifiée des feuilles d\'heures pour les entreprises du BTP',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'BEMEXO — Une seule saisie. Tout suit.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BEMEXO — Feuilles d\'heures BTP',
    description: 'Gestion simplifiée des feuilles d\'heures pour les entreprises du BTP',
    images: ['/og-image.png'],
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

// Donnée structurée globale : identité de l'éditeur (Organization).
const LD_ORGANIZATION = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'BEMEXO',
  legalName: 'K.HABITAT',
  url: 'https://bemexo.com',
  logo: 'https://bemexo.com/apple-touch-icon.png',
  email: 'contact@bemexo.com',
  description:
    'Logiciel de pointage, de planning d’équipe et d’export de paie pour les entreprises du bâtiment et des travaux publics.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#15120F" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(LD_ORGANIZATION) }} />
      </head>
      <body className={inter.className}>
        <AuthProvider>
          {children}
        </AuthProvider>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
