'use client';

// Lot 18 — l'alerte « Cet export va verrouiller N lignes d'heures de M salariés ».
//
// Chargée à l'OUVERTURE (lib/lazy-window.tsx) : elle n'est pas dans le premier chargement de
// /admin, et elle n'importe NI Excel NI jsPDF (ils restent chargés par le menu « Exporter »).
// Ce composant ne décide de rien et n'écrit rien : il affiche les chiffres qu'on lui donne et
// renvoie le choix du bureau (annuler, exporter et verrouiller, exporter sans verrouiller).
//
// Accessibilité : fenêtre d'alerte (role="alertdialog"), focus piégé dedans, premier focus sur
// « Annuler » (le choix sans conséquence), Échap = annuler, retour du focus sur le bouton qui a
// lancé l'export, boutons de 44 px de haut.
import { lazy, Suspense, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useBureauUi2 } from '@/lib/use-bureau-ui2';
import { choixSansVerrou, phraseDejaVerrouillees, phraseVerrou, type CompteVerrou, type ExportEquipe } from '@/lib/export-verrou';

// Design bureau (v2, ?ui=2 sur aperçu) : habillage de l'alerte, chargé en différé seulement quand le drapeau est actif.
const VerrouV2 = lazy(() => import('@/components/design/bureau/verrou-v2'));

export interface VerrouAsk {
  kind: ExportEquipe;
  compte: CompteVerrou;
  /** « du 01/10/2026 au 31/10/2026 » (lib/export-verrou.ts : libellePeriode). */
  periode: string;
  /** La période annoncée : l'export porte TOUJOURS dessus, même si l'écran en change pendant que l'alerte est ouverte. */
  range: { from: Date; to: Date };
  /** data-testid du bouton à qui rendre le focus à la fermeture. */
  retour: string;
  /** Adresse du comptable (kind = comptable). */
  destinataire?: string;
  /** Vrai quand les chiffres ont bougé entre l'alerte et le clic : on les remontre avant de rien faire. */
  change?: boolean;
}

export default function ExportVerrouDialog({ ask, busy, onChoose, onCancel }: {
  ask: VerrouAsk | null;
  busy: boolean;
  /** true = « Exporter et verrouiller » (comportement d'avant le lot 18), false = « Exporter sans verrouiller ». */
  onChoose: (verrouiller: boolean) => void;
  onCancel: () => void;
}) {
  // L'alerte se ferme avec `ask` = null : on garde le dernier bouton à qui rendre le focus.
  const retour = useRef('');
  if (ask) retour.current = ask.retour;
  const comptable = ask?.kind === 'comptable';
  const deja = ask ? phraseDejaVerrouillees(ask.compte) : '';
  const ui2 = useBureauUi2();
  if (ui2) return <Suspense fallback={null}><VerrouV2 ask={ask} busy={busy} onChoose={onChoose} onCancel={onCancel} retour={retour.current} /></Suspense>;

  return (
    <AlertDialog open={ask != null} onOpenChange={(o) => { if (!o && !busy) onCancel(); }}>
      <AlertDialogContent
        className="bt-skin max-w-sm"
        data-testid="export-verrou"
        onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
        onCloseAutoFocus={(e) => {
          const el = document.querySelector<HTMLElement>(`[data-testid="${retour.current}"]`);
          if (el && !el.hasAttribute('disabled')) { e.preventDefault(); el.focus(); }
        }}
      >
        <AlertDialogHeader className="text-left sm:text-left">
          <AlertDialogTitle>{comptable ? 'Envoyer et verrouiller les heures ?' : 'Verrouiller les heures exportées ?'}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-left text-sm">
              {ask?.change && (
                <p role="alert" className="rounded-md border border-orange-300 bg-orange-50 p-2 text-orange-900" data-testid="export-verrou-change">
                  Des heures ont changé entre-temps. Voici les chiffres à jour : rien n’a été exporté ni verrouillé.
                </p>
              )}
              <p className="font-semibold text-foreground" data-testid="export-verrou-texte" data-lignes={ask?.compte.lignes} data-salaries={ask?.compte.salaries}>
                {ask ? phraseVerrou(ask.compte, ask.periode) : ''}
              </p>
              {deja && <p data-testid="export-verrou-deja">{deja}</p>}
              <p>Vous gardez la main : vous pourrez toujours corriger leurs heures depuis leur fiche.</p>
              {comptable && ask?.destinataire && <p>Le fichier part chez {ask.destinataire}.</p>}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button type="button" className="h-11 w-full whitespace-normal" disabled={busy} data-testid="export-verrou-confirm" onClick={() => onChoose(true)}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {comptable ? 'Envoyer et verrouiller' : 'Exporter et verrouiller'}
          </Button>
          {ask && choixSansVerrou(ask.kind) && (
            <>
              <Button type="button" variant="outline" className="h-11 w-full whitespace-normal" disabled={busy} data-testid="export-verrou-sans" onClick={() => onChoose(false)}>
                Exporter sans verrouiller
              </Button>
              <p className="text-center text-xs text-muted-foreground">Export de contrôle : même fichier, rien n’est verrouillé ni écrit.</p>
            </>
          )}
          <AlertDialogCancel className="mt-0 h-11 w-full" disabled={busy} data-testid="export-verrou-annuler">Annuler</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
