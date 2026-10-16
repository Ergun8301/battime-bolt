'use client';

// Design salarié (v2) : le drapeau, seul. Ce petit fichier est lu par la coque (components/design/salarie/shell-v2.tsx, qui le ré-exporte) ET par /pointer.
//
// BASCULE (étape 11) : le nouveau design est celui de TOUS les salariés (production comprise), sans `?ui=2`.
//   · UN SEUL INTERRUPTEUR pour revenir en arrière : `UI2_PAR_DEFAUT` ci-dessous (false = l'ancien rendu pour tout le monde, tant que le code v1 existe).
//   · PORTE DE SECOURS par personne : `?ui=1` force l'ancien rendu, mémorisé pour la session (sessionStorage) ; `?ui=2` le rallume.
import { useSyncExternalStore } from 'react';

/** Le rendu par défaut. `true` = v2 (bascule). Repasser à `false` rend l'ancienne interface à tout le monde (un seul commit à annuler). */
export const UI2_PAR_DEFAUT = true;

const CLE = 'bt-ui2';
/**
 * Le choix de la session : `?ui=1` (ancien rendu) ou `?ui=2` (nouveau) dans l'adresse, mémorisé pour la session ; sinon `UI2_PAR_DEFAUT`.
 * Lecture immédiate, côté navigateur seulement (au rendu serveur et à l'hydratation : le défaut, voir `useUi2`).
 */
export function ui2Maintenant(): boolean {
  if (typeof window === 'undefined') return UI2_PAR_DEFAUT;
  let q: string | null = null;
  try { q = new URLSearchParams(window.location.search).get('ui'); } catch { /* adresse illisible : pas de choix dans l'adresse */ }
  try {
    if (q === '1') sessionStorage.setItem(CLE, '0');
    else if (q === '2') sessionStorage.setItem(CLE, '1');
    else {
      const m = sessionStorage.getItem(CLE);
      if (m === '0') return false;
      if (m === '1') return true;
    }
  } catch { /* stockage indisponible (navigation privée…) : le choix de l'adresse seul, sinon le défaut */ }
  if (q === '1') return false;
  if (q === '2') return true;
  return UI2_PAR_DEFAUT;
}

const jamais = (): (() => void) => () => {};
const defaut = (): boolean => UI2_PAR_DEFAUT;
/**
 * Le drapeau pour un composant. `useSyncExternalStore` : le rendu serveur et l'hydratation lisent le défaut (aucun écart d'hydratation),
 * puis la valeur réelle est lue tout de suite ; un composant monté après coup (cas habituel : /poseur attend la connexion) la lit dès son premier rendu,
 * sans image intermédiaire de l'autre interface.
 */
export function useUi2(): boolean {
  return useSyncExternalStore(jamais, ui2Maintenant, defaut);
}
