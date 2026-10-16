'use client';

// Retour Android (R6 du plan) : une feuille ouverte pose une entrée dans l'historique ; le retour du téléphone la referme au lieu de quitter l'écran.
// Même mécanique que `anyLayerOpen` de poseur-day.tsx (même marqueur `btLayer`, lu par app/poseur/page.tsx) pour une feuille qui vit dans son propre composant.
import { useEffect, useRef } from 'react';

export function useRetourFerme(actif: boolean, fermer: () => void): void {
  const f = useRef(fermer);
  f.current = fermer;
  useEffect(() => {
    if (!actif || typeof window === 'undefined') return;
    let consomme = false;
    window.history.pushState({ ...(window.history.state || {}), btLayer: true }, '');
    const onPop = () => { consomme = true; f.current(); };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Fermée depuis l'interface : on retire l'entrée posée, seulement si elle est encore la courante.
      if (!consomme && (window.history.state as { btLayer?: boolean } | null)?.btLayer) window.history.back();
    };
  }, [actif]);
}
