'use client';

// Design du BUREAU (/admin) en v2 : le drapeau, seul. SÉPARÉ de celui du salarié (lib/use-ui2.ts) : l'un n'allume jamais l'autre.
//   · par défaut depuis la BASCULE (BUREAU_UI2_PAR_DEFAUT = true, accord d'Ergun) ;
//   · `?ui=1` remet le bureau d'avant (partout, mémorisé pour la session) ; `?ui=2` le rallume ;
//   · le rendu v1 reste octet pour octet le même sans drapeau : la v2 est un morceau chargé À LA DEMANDE (import dynamique),
//     jamais dans le premier chargement de /admin (budget de poids).
import { useSyncExternalStore } from 'react';

/** Le rendu par défaut du bureau : la v2 depuis la bascule. */
export const BUREAU_UI2_PAR_DEFAUT = true;

const CLE = 'bt-bureau-ui2';

/** Le choix de la session : `?ui=1` ou `?ui=2`, mémorisé ; sinon le défaut. Côté navigateur seulement. */
export function bureauUi2Maintenant(): boolean {
  if (typeof window === 'undefined') return BUREAU_UI2_PAR_DEFAUT;
  let q: string | null = null;
  try { q = new URLSearchParams(window.location.search).get('ui'); } catch { /* adresse illisible */ }
  try {
    if (q === '1') sessionStorage.setItem(CLE, '0');
    else if (q === '2') sessionStorage.setItem(CLE, '1');
    else {
      // `?ui=1` (retour au bureau d'avant) reste mémorisé pour la session partout, même en production : la porte de secours après la bascule.
      const m = sessionStorage.getItem(CLE);
      if (m === '0') return false;
      if (m === '1') return true;
    }
  } catch { /* stockage indisponible (navigation privée…) : l'adresse seule */ }
  if (q === '1') return false;
  if (q === '2') return true;
  return BUREAU_UI2_PAR_DEFAUT;
}

const jamais = (): (() => void) => () => {};
const defaut = (): boolean => BUREAU_UI2_PAR_DEFAUT;
/** Le drapeau pour un composant (rendu serveur et hydratation : le défaut, puis la valeur réelle). */
export function useBureauUi2(): boolean {
  return useSyncExternalStore(jamais, bureauUi2Maintenant, defaut);
}
