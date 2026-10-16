'use client';

// Design salarié · ÉTAPE 3 — la COQUE de la nouvelle interface (planche du designer) : en-tête avec le petit mot du jour, bande des 7 jours et barre du bas.
// Des composants de présentation : aucune lecture de base, aucune règle (les règles sont dans supabase/functions/_shared/salarie-vue.ts, testées).
// VISIBLE SEULEMENT avec `?ui=2` sur un hôte d'aperçu (jamais sur bemexo.com) : `useUi2()`. Rien ne change pour les salariés tant que ce n'est pas décidé.
// Le contenu (carte de pointage, chantiers, feuilles) reste celui d'aujourd'hui dans cette coque ; les étapes suivantes le remplaceront morceau par morceau.
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { kicker, type CaseBande, type EtatJour } from '@/supabase/functions/_shared/salarie-vue';

// useUi2 vit dans lib/use-ui2.ts (un petit module : /pointer le lit sans tirer toute la coque).
export { useUi2 } from '@/lib/use-ui2';

/** Le petit mot au-dessus de la date (AUJOURD'HUI, RENVOYÉE, jour de la semaine). */
export function Kicker({ date, aujourdhui, etat }: { date: string; aujourdhui: boolean; etat: EtatJour }) {
  return <div className="dz-kicker" data-testid="dz-kicker">{kicker({ date, aujourdhui, etat })}</div>;
}

const PASTILLE: Record<EtatJour, string> = { vide: '', prevu: '·', 'a-envoyer': '!', renvoye: '↺', oublie: '!', envoye: '✓', cloture: '▣', absence: '' };
const LIBELLE: Record<EtatJour, string> = {
  vide: 'rien de prévu', prevu: 'prévu', 'a-envoyer': 'à envoyer', renvoye: 'renvoyée par le bureau', oublie: 'sortie oubliée', envoye: 'envoyée', cloture: 'clôturée', absence: 'absence',
};

/** Aujourd'hui, pas encore envoyé : un anneau (la journée est en cours), comme sur la planche. */
const anneau = (j: CaseBande) => !j.lettre && j.aujourdhui && (j.etat === 'vide' || j.etat === 'prevu' || j.etat === 'a-envoyer');

/** Les 7 jours de la semaine, lundi → dimanche : l'état de chaque jour d'un coup d'œil. */
export function BandeJours({ jours, onSelect }: { jours: CaseBande[]; onSelect: (date: string) => void }) {
  return (
    <div className="dz-bande" role="group" aria-label="Les jours de la semaine" data-testid="dz-bande">
      {jours.map((j) => (
        <button
          key={j.date} type="button" onClick={() => onSelect(j.date)}
          className={`dz-jour dz-jour-${j.etat}${j.aujourdhui ? ' is-today' : ''}${j.affiche ? ' is-shown' : ''}`}
          aria-current={j.affiche ? 'date' : undefined}
          aria-label={`${j.jour === 'L' ? 'lundi' : j.jour === 'J' ? 'jeudi' : j.jour === 'V' ? 'vendredi' : j.jour === 'S' ? 'samedi' : j.jour === 'D' ? 'dimanche' : 'jour'} ${j.numero}${j.aujourdhui ? ', aujourd’hui' : ''} : ${LIBELLE[j.etat]}`}
          data-testid={`dz-jour-${j.date}`}
        >
          <span className="dz-jour-l">{j.jour}</span>
          <span className="dz-jour-n">{j.numero}</span>
          <span className={`dz-jour-p${anneau(j) ? ' dz-jour-anneau' : ''}`} aria-hidden="true">{j.lettre ?? (anneau(j) ? '' : PASTILLE[j.etat])}</span>
        </button>
      ))}
    </div>
  );
}

export type OngletBas = 'day' | 'week' | 'month' | 'plus';
/** La barre du bas : Journée · Semaine · Mois · Plus (le menu du compte). Cibles de 44 px au moins. */
export function OngletsBas({ actif, onGo, badgePlus }: { actif: OngletBas | null; onGo: (o: OngletBas) => void; badgePlus?: number }) {
  const items: { id: OngletBas; label: string }[] = [{ id: 'day', label: 'Journée' }, { id: 'week', label: 'Semaine' }, { id: 'month', label: 'Mois' }, { id: 'plus', label: 'Plus' }];
  return (
    <nav className="dz-onglets" aria-label="Navigation" data-testid="dz-onglets">
      {items.map((o) => (
        <button key={o.id} type="button" className={`dz-onglet${actif === o.id ? ' is-on' : ''}`} aria-current={actif === o.id ? 'page' : undefined} onClick={() => onGo(o.id)} data-testid={`dz-onglet-${o.id}`}>
          {o.label}
          {o.id === 'plus' && !!badgePlus && badgePlus > 0 && <span className="dz-onglet-badge" aria-label={`${badgePlus} à voir`}>{badgePlus}</span>}
        </button>
      ))}
    </nav>
  );
}

/** Le bouton ✦ rond jaune de l'en-tête : ouvre l'assistant existant (même repère que l'ancien bouton de la barre du bas, que les guides et les scripts visent). */
export function BoutonAssistant({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="dz-assistant" aria-label="Assistant BEMEXO" onClick={onClick} data-testid="dock-assistant" data-guide="journee.assistant">✦</button>
  );
}

/** La note de l'en-tête noir (« Mardi 13 à envoyer · Ouvrir › »). Peut servir de déclencheur à une fenêtre Radix (`asChild`). */
export const NoteEntete = forwardRef<HTMLButtonElement, { texte: ReactNode; label: string; action?: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>>(
  function NoteEntete({ texte, label, action = 'Ouvrir ›', ...rest }, ref) {
    return (
      <button ref={ref} type="button" className="dz-note" aria-label={label} data-testid="dz-note-entete" {...rest}>
        <span className="dz-note-point" aria-hidden="true" />
        <span>{texte}</span>
        <span className="dz-note-action" aria-hidden="true">{action}</span>
      </button>
    );
  },
);
