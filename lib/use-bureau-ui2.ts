'use client';

// Design bureau (v2) : le drapeau, seul. Calqué sur lib/use-ui2.ts (salarié), même contrat, pour le bureau (/admin).
//
//   · `BUREAU_UI2_PAR_DEFAUT = false` : tant que c'est faux, TOUT LE MONDE garde l'interface actuelle, octet pour octet.
//   · `?ui=2` dans l'adresse, sur un hôte d'APERÇU ou en local seulement (lib/hosting.ts : isPreviewHost), allume la v2 ;
//     le choix est mémorisé pour la session (sessionStorage). `?ui=1` l'éteint.
//   · Quand l'interface sera livrée, un seul commit change la constante (et le même `?ui=1` devient la porte de secours).
//
// Les composants v2 ne sont JAMAIS importés par la page : ils sont chargés en différé (import()) seulement quand ce drapeau est vrai,
// pour que le premier chargement de /admin ne grossisse pas.
import { useSyncExternalStore } from 'react';
import { isPreviewHost } from '@/lib/hosting';

/** Le rendu par défaut. `false` = l'interface actuelle pour tous. */
export const BUREAU_UI2_PAR_DEFAUT = false;

const CLE = 'bt-bureau-ui2';

/**
 * Le choix de la session : `?ui=2` (nouveau) ou `?ui=1` (actuel) dans l'adresse, mémorisé pour la session ; sinon `BUREAU_UI2_PAR_DEFAUT`.
 * Tant que le défaut est faux, la v2 n'existe que sur un hôte d'aperçu ou en local (jamais en production).
 * Lecture immédiate, côté navigateur seulement (au rendu serveur et à l'hydratation : le défaut, voir `useBureauUi2`).
 */
export function bureauUi2Maintenant(): boolean {
  if (typeof window === 'undefined') return BUREAU_UI2_PAR_DEFAUT;
  try {
    if (!BUREAU_UI2_PAR_DEFAUT && !isPreviewHost()) return false;
  } catch { return BUREAU_UI2_PAR_DEFAUT; }
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
  return BUREAU_UI2_PAR_DEFAUT;
}

const jamais = (): (() => void) => () => {};
const defaut = (): boolean => BUREAU_UI2_PAR_DEFAUT;
/**
 * Le drapeau pour un composant. `useSyncExternalStore` : le rendu serveur et l'hydratation lisent le défaut (aucun écart d'hydratation),
 * puis la valeur réelle est lue tout de suite.
 */
export function useBureauUi2(): boolean {
  return useSyncExternalStore(jamais, bureauUi2Maintenant, defaut);
}
