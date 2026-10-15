'use client';

// Design salarié · ÉTAPE 3 — la COQUE de la nouvelle interface (planche du designer) : en-tête avec le petit mot du jour, bande des 7 jours et barre du bas.
// Des composants de présentation : aucune lecture de base, aucune règle (les règles sont dans supabase/functions/_shared/salarie-vue.ts, testées).
// VISIBLE SEULEMENT avec `?ui=2` sur un hôte d'aperçu (jamais sur bemexo.com) : `useUi2()`. Rien ne change pour les salariés tant que ce n'est pas décidé.
// Le contenu (carte de pointage, chantiers, feuilles) reste celui d'aujourd'hui dans cette coque ; les étapes suivantes le remplaceront morceau par morceau.
import { useEffect, useState } from 'react';
import { isPreviewHost } from '@/lib/hosting';
import { kicker, type CaseBande, type EtatJour } from '@/supabase/functions/_shared/salarie-vue';

const CLE = 'bt-ui2';
/** `?ui=2` (mémorisé pour la session, `?ui=1` l'éteint) sur un hôte d'aperçu seulement. Lu après le montage : pas d'écart d'hydratation. */
export function useUi2(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    try {
      if (!isPreviewHost()) return;
      const q = new URLSearchParams(window.location.search).get('ui');
      if (q === '2') sessionStorage.setItem(CLE, '1');
      else if (q === '1') sessionStorage.removeItem(CLE);
      setOn(sessionStorage.getItem(CLE) === '1');
    } catch { /* stockage indisponible : ancienne interface */ }
  }, []);
  return on;
}

/** Le petit mot au-dessus de la date (AUJOURD'HUI, RENVOYÉE, jour de la semaine). */
export function Kicker({ date, aujourdhui, etat }: { date: string; aujourdhui: boolean; etat: EtatJour }) {
  return <div className="dz-kicker" data-testid="dz-kicker">{kicker({ date, aujourdhui, etat })}</div>;
}

const PASTILLE: Record<EtatJour, string> = { vide: '', prevu: '', 'a-envoyer': '●', renvoye: '!', oublie: '!', envoye: '✓', cloture: '', absence: '' };
const LIBELLE: Record<EtatJour, string> = {
  vide: 'rien de prévu', prevu: 'prévu', 'a-envoyer': 'à envoyer', renvoye: 'renvoyée par le bureau', oublie: 'sortie oubliée', envoye: 'envoyée', cloture: 'clôturée', absence: 'absence',
};

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
          <span className="dz-jour-p" aria-hidden="true">{j.lettre ?? PASTILLE[j.etat]}</span>
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
