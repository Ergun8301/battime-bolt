'use client';

// Design salarié : le drapeau `?ui=2`, seul. Ce petit fichier est lu par la coque (components/design/salarie/shell-v2.tsx, qui le ré-exporte) ET par /pointer.
import { useEffect, useState } from 'react';
import { isPreviewHost } from '@/lib/hosting';

const CLE = 'bt-ui2';
/** `?ui=2` (mémorisé pour la session, `?ui=1` l'éteint) sur un hôte d'aperçu seulement. Lecture immédiate, côté navigateur seulement (jamais pendant le rendu : écart d'hydratation). */
export function ui2Maintenant(): boolean {
  try {
    if (typeof window === 'undefined' || !isPreviewHost()) return false;
    const q = new URLSearchParams(window.location.search).get('ui');
    if (q === '2') sessionStorage.setItem(CLE, '1');
    else if (q === '1') sessionStorage.removeItem(CLE);
    return sessionStorage.getItem(CLE) === '1';
  } catch { return false; /* stockage indisponible : ancienne interface */ }
}

/** Le drapeau pour un composant, lu après le montage : pas d'écart d'hydratation. */
export function useUi2(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(ui2Maintenant()); }, []);
  return on;
}

