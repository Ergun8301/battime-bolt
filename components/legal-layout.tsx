import Link from 'next/link';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';

// Shared chrome for the legal pages (mentions légales, confidentialité, CGU).
// The descendant selectors style plain <h2>/<p>/<ul> so the page content stays
// readable, without a class on every element.
export default function LegalLayout({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background safe-top safe-bottom">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/connexion" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 mr-1" /> Retour
          </Link>
          <span className="font-bold">Battime</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold">{title}</h1>
        {updated && <p className="mt-1 text-xs text-muted-foreground">Dernière mise à jour : {updated}</p>}

        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            <strong>Modèle à finaliser.</strong> Ce texte est un brouillon généré à titre indicatif. Les champs{' '}
            <code className="rounded bg-amber-100 px-1">[À COMPLÉTER]</code> doivent être renseignés, et l'ensemble{' '}
            <strong>relu par un professionnel du droit</strong> avant toute mise en ligne commerciale.
          </p>
        </div>

        <article className="mt-6 pb-16 [&_h2]:mt-6 [&_h2]:mb-1 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_p]:mt-2 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted-foreground [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ul]:text-sm [&_ul]:text-muted-foreground [&_strong]:text-foreground [&_a]:underline">
          {children}
        </article>
      </main>
    </div>
  );
}
