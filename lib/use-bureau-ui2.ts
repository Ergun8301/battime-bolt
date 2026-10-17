'use client';

// Design du BUREAU (/admin) en v2 : le drapeau, seul. SÉPARÉ de celui du salarié (lib/use-ui2.ts) : l'un n'allume jamais l'autre.
//   · jamais par défaut (BUREAU_UI2_PAR_DEFAUT = false) : des patrons utilisent le bureau actuel en production ;
//   · `?ui=2` l'allume SEULEMENT sur un aperçu ou en local (isPreviewHost), mémorisé pour la session ; `?ui=1` l'éteint ;
//   · le rendu v1 reste octet pour octet le même sans drapeau : la v2 est un morceau chargé À LA DEMANDE (import dynamique),
//     jamais dans le premier chargement de /admin (budget de poids).
import { useSyncExternalStore } from 'react';
import { isPreviewHost } from '@/lib/hosting';

/** Le rendu par défaut du bureau. Reste `false` jusqu'à la bascule décidée par le patron. */
export const BUREAU_UI2_PAR_DEFAUT = false;

const CLE = 'bt-bureau-ui2';

/** Le choix de la session : `?ui=2` (aperçu / local seulement) ou `?ui=1`, mémorisé ; sinon le défaut. Côté navigateur seulement. */
export function bureauUi2Maintenant(): boolean {
  if (typeof window === 'undefined') return BUREAU_UI2_PAR_DEFAUT;
  let q: string | null = null;
  try { q = new URLSearchParams(window.location.search).get('ui'); } catch { /* adresse illisible */ }
  const permis = isPreviewHost();
  try {
    if (q === '1') sessionStorage.setItem(CLE, '0');
    else if (q === '2' && permis) sessionStorage.setItem(CLE, '1');
    else if (permis) {
      const m = sessionStorage.getItem(CLE);
      if (m === '0') return false;
      if (m === '1') return true;
    }
  } catch { /* stockage indisponible (navigation privée…) : l'adresse seule */ }
  if (q === '1') return false;
  if (q === '2' && permis) return true;
  return BUREAU_UI2_PAR_DEFAUT;
}

const jamais = (): (() => void) => () => {};
const defaut = (): boolean => BUREAU_UI2_PAR_DEFAUT;
/** Le drapeau pour un composant (rendu serveur et hydratation : le défaut, puis la valeur réelle). */
export function useBureauUi2(): boolean {
  return useSyncExternalStore(jamais, bureauUi2Maintenant, defaut);
}
