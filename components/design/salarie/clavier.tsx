'use client';

// Clavier du téléphone (R5 du plan d'intégration) : sur iOS, et par défaut sur Chrome Android, le clavier ne change pas la mise en page,
// il rétrécit seulement la « fenêtre visuelle ». Une feuille ancrée en bas serait cachée derrière lui, avec son bouton « OK ».
// Tant qu'une feuille est ouverte, la variable `--dz-kb-h` (sur <html>) dit la hauteur masquée ; la feuille se lève d'autant et sa hauteur maximale suit.
import { useEffect } from 'react';

let actives = 0;
let retirer: (() => void) | null = null;

function suivre(): () => void {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!vv) return () => {};
  const racine = document.documentElement;
  const maj = () => {
    const h = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    // Moins de 80 px : une barre d'adresse qui bouge, pas un clavier.
    racine.style.setProperty('--dz-kb-h', h > 80 ? `${h}px` : '0px');
  };
  maj();
  vv.addEventListener('resize', maj); vv.addEventListener('scroll', maj);
  return () => { vv.removeEventListener('resize', maj); vv.removeEventListener('scroll', maj); racine.style.removeProperty('--dz-kb-h'); };
}

export function useClavier(actif: boolean): void {
  useEffect(() => {
    if (!actif) return;
    if (actives === 0) retirer = suivre();
    actives++;
    return () => { actives--; if (actives === 0 && retirer) { retirer(); retirer = null; } };
  }, [actif]);
}
