'use client';

// Design du bureau (v2, planche 2b / 2c) · deux petites choses partagées par le morceau v2, sans rien demander à admin-planning.tsx :
// 1. `useLargeur(requete)` : vrai quand la requête média répond (téléphone : moins de 768 px ; feuille 2c : 1 024 px et moins). Les deux mises en page restent
//    montées (le CSS montre l'une ou l'autre) ; ce crochet sert seulement aux morceaux qui ne doivent exister qu'UNE fois (menu Imprimer, contenu de la fiche).
// 2. Le PONT du menu ☰ : le menu est rendu par admin-planning.tsx avec ses propriétés d'avant (open, onOpenChange, gestionnaires) ; pour offrir au téléphone tout ce
//    que la barre et « Plus ⋯ » offrent à l'ordinateur (compteurs et leurs tuiles, recherche, semaine, Imprimer, Pièces jointes…), le planning v2 lui prête ici
//    le même contexte que reçoit la grille. Lecture seule : aucun état nouveau, aucune requête.
import { useSyncExternalStore } from 'react';
import type { PlanningCtx } from './contexte-v2';
import type { Chiffres } from './bandeau-v2';

/** Téléphone (planche 2b) : sous 768 px. La tablette (834, 1 024) garde la grille de l'ordinateur. */
export const REQ_TELEPHONE = '(max-width: 767px)';
/** Feuille du bas (planche 2c) : le panneau de droite devient une feuille à 1 024 px et moins (tablette en paysage comprise). */
export const REQ_FEUILLE = '(max-width: 1024px)';
/** Ordinateur (maquette 1a de la planche d'essai) : 1 024 px et plus. En dessous, la tablette garde la barre unique et la grille compacte 2a. */
export const REQ_ORDI = '(min-width: 1024px)';

export function useLargeur(requete: string): boolean {
  return useSyncExternalStore(
    (f) => { const mq = window.matchMedia(requete); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); },
    () => window.matchMedia(requete).matches,
    () => false,
  );
}

export interface Pont {
  c: PlanningCtx;
  recherche: string;
  setRecherche: (v: string) => void;
  chiffres: Chiffres;
  legende: () => void;
}

let pont: Pont | null = null;
const abonnes = new Set<() => void>();

/** Appelé par le planning v2 après chaque rendu. */
export function publierPont(p: Pont | null) {
  pont = p;
  abonnes.forEach((f) => f());
}

export function usePont(): Pont | null {
  return useSyncExternalStore((f) => { abonnes.add(f); return () => { abonnes.delete(f); }; }, () => pont, () => null);
}
