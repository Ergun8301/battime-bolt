'use client';

// Design bureau · lot 2 · HP20 à HP22, HM06 : l'alerte « Cet export va verrouiller N lignes d'heures de M salariés ».
// Habillage seulement : les chiffres, les choix et les règles viennent de components/export-verrou-dialog.tsx (inchangé) et de lib/export-verrou.ts.
// Chargée en différé, seulement quand `useBureauUi2()` est vrai.
import * as AlertPrimitive from '@radix-ui/react-alert-dialog';
import { Loader2 } from 'lucide-react';
import { FenetreB } from './heures-fenetre';
import { choixSansVerrou, phraseDejaVerrouillees, type CompteVerrou, type ExportEquipe } from '@/lib/export-verrou';

const s = (n: number) => (n > 1 ? 's' : '');
// Repère (data-testid) du bouton principal : `export-verrou-valider` ET PAS `export-verrou-confirm` (celui de l'alerte d'avant) : scripts/tests/export-alerte-lot18.mjs reconnaît
// le chunk de l'alerte d'AVANT par ce texte et veut qu'il soit dans UN seul fichier ; la copie de rejeu ui2b- suit le nouveau repère (table ADAPTATIONS).
const ID_CONFIRMER = 'export-verrou-valider';
const FICHIER: Record<ExportEquipe, string> = { excel: 'Excel', pdf: 'PDF', csv: 'CSV paie', comptable: 'Envoi au comptable' };

export interface VerrouV2Props {
  ask: { kind: ExportEquipe; compte: CompteVerrou; periode: string; destinataire?: string; change?: boolean } | null;
  busy: boolean;
  onChoose: (verrouiller: boolean) => void;
  onCancel: () => void;
  /** data-testid du bouton à qui rendre le focus à la fermeture. */
  retour: string;
}

export default function VerrouV2({ ask, busy, onChoose, onCancel, retour }: VerrouV2Props) {
  const comptable = ask?.kind === 'comptable';
  const deja = ask ? phraseDejaVerrouillees(ask.compte) : '';
  const n = ask?.compte.lignes ?? 0;
  const m = ask?.compte.salaries ?? 0;
  return (
    <FenetreB
      alerte
      open={ask != null}
      onOpenChange={(o) => { if (!o && !busy) onCancel(); }}
      testId="export-verrou"
      kicker={comptable ? 'Avant l’envoi' : 'Avant l’export'}
      titre={<span data-testid="export-verrou-texte" data-lignes={ask?.compte.lignes} data-salaries={ask?.compte.salaries}>
        {ask ? `Cet export va verrouiller ${n} ligne${s(n)} d’heures de ${m} salarié${s(m)}` : ''}
      </span>}
      pileTel
      onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
      onOpenAutoFocus={(e) => {
        const a = document.querySelector<HTMLElement>('[data-testid="export-verrou-annuler"]');
        if (a) { e.preventDefault(); a.focus(); }
      }}
      onCloseAutoFocus={(e) => {
        const el = document.querySelector<HTMLElement>(`[data-testid="${retour}"]`);
        if (el && !el.hasAttribute('disabled')) { e.preventDefault(); el.focus(); }
      }}
      pied={(
        <>
          <AlertPrimitive.Cancel className="dz-hb-btn" disabled={busy} data-testid="export-verrou-annuler">Annuler</AlertPrimitive.Cancel>
          {ask && choixSansVerrou(ask.kind) && (
            <button type="button" className="dz-hb-btn" disabled={busy} data-testid="export-verrou-sans" onClick={() => onChoose(false)}>
              Exporter sans verrouiller
            </button>
          )}
          <button type="button" className="dz-hb-btn" data-ton="principal" data-taille="principal" disabled={busy} data-testid={ID_CONFIRMER} onClick={() => onChoose(true)}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {comptable ? 'Envoyer et verrouiller' : 'Exporter et verrouiller'}
          </button>
        </>
      )}
    >
      {ask?.change && (
        <div role="alert" className="dz-hb-note" data-ton="attention" data-testid="export-verrou-change">
          <b>Des heures ont changé entre-temps</b>
          <span>Voici les chiffres à jour : rien n’a été exporté ni verrouillé.</span>
        </div>
      )}
      {deja && (
        <div className="dz-hb-note" data-ton="attention" data-testid="export-verrou-deja">
          <b>Une partie de cette période est déjà partie</b>
          <span>{deja}</span>
        </div>
      )}
      <AlertPrimitive.Description asChild>
        <p>{m > 1 ? 'Les salariés ne pourront' : 'Le salarié ne pourra'} plus modifier {n > 1 ? 'ces heures' : 'cette heure'} ; le bureau le pourra encore, depuis leur fiche.
          {comptable ? ' L’envoi verrouille toujours : pas d’option « sans verrouiller ».' : ''}</p>
      </AlertPrimitive.Description>
      {ask && (
        <ul className="dz-hb-kv dz-hb-carte">
          <li>Période<b data-texte="ui">{ask.periode}</b></li>
          <li>Fichier<b data-texte="ui">{FICHIER[ask.kind]}</b></li>
          {comptable && ask.destinataire ? <li>Destinataire<b data-texte="ui">{ask.destinataire}</b></li> : null}
        </ul>
      )}
    </FenetreB>
  );
}
