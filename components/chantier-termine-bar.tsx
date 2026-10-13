'use client';

// Lot 23 : le bloc « Chantier terminé » de la fiche client (bureau).
//
// Petit exprès : il est dans le premier chargement du bureau. Tout ce qui pèse (le contrôle avant de
// terminer, le bilan) vit dans components/chantier-termine.tsx, chargé à l'ouverture (lib/lazy-window.tsx).
//
// CACHÉ, SANS MESSAGE, tant que la migration n'est pas appliquée : la fonction « suis-je prête ? » manque
// ou la colonne n'est pas dans la ligne lue. Rien ne s'écrit d'ici ; les boutons d'écriture (Terminer,
// Rouvrir) disparaissent en mode support (lecture seule), le bilan, lui, se lit.
import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InfoTip } from '@/components/ui/info-tip';
import { completionKnownReady, completionReady } from '@/lib/chantier-termine-ready';
import { readSupportSession } from '@/lib/support';
import { canFinishWorksite, completionUi, hasCompletionColumn, termineLe } from '@/supabase/functions/_shared/chantier-statut';
import type { Worksite } from '@/lib/types';

export type TermineMode = 'terminer' | 'rouvrir' | 'bilan';

export default function ChantierTermineBar({ worksite, onOpen }: { worksite: Worksite; onOpen: (mode: TermineMode) => void }) {
  const [ready, setReady] = useState(completionKnownReady());
  const hasColumn = hasCompletionColumn(worksite);
  useEffect(() => {
    // Colonne absente de la ligne lue (migration pas appliquée) : inutile d'interroger la base (une requête 404 par fiche ouverte).
    if (!hasColumn) return;
    let live = true;
    completionReady().then((r) => { if (live) setReady(r); });
    return () => { live = false; };
  }, [worksite.id, hasColumn]);

  const ui = completionUi({ ready, hasColumn, supportMode: !!readSupportSession() });
  if (!ui.bilan) return null;
  const fin = termineLe(worksite);

  return (
    <div className="rounded-md border bg-muted/30 p-2 space-y-2" data-testid="chantier-termine-bar">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {fin
          ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 shrink-0" /><span className="text-foreground font-semibold" data-testid="ct-statut">{fin}</span></>
          : <span data-testid="ct-statut">Chantier en cours</span>}
        <InfoTip text={fin
          ? 'Le chantier n’est plus proposé aux salariés pour une nouvelle intervention ou un nouveau pointage. Ses heures, son historique et ses documents restent visibles et exacts. « Rouvrir » le remet comme avant.'
          : 'Terminer ne supprime rien et ne modifie aucune heure : le chantier n’est simplement plus proposé aux salariés pour une nouvelle intervention. Vous pouvez le rouvrir à tout moment.'} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => onOpen('bilan')} data-testid="ct-bilan">
          <ClipboardList className="h-4 w-4 mr-1" /> Bilan du chantier
        </Button>
        {/* « Autre » (travail non prévu) ne se termine pas : seul « Rouvrir » reste, au cas où il aurait été terminé avant. */}
        {ui.write && (fin
          ? <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => onOpen('rouvrir')} data-testid="ct-rouvrir"><RotateCcw className="h-4 w-4 mr-1" /> Rouvrir le chantier</Button>
          : canFinishWorksite(worksite) && <Button size="sm" className="min-h-[44px]" onClick={() => onOpen('terminer')} data-testid="ct-terminer"><CheckCircle2 className="h-4 w-4 mr-1" /> Terminer le chantier</Button>)}
      </div>
    </div>
  );
}
