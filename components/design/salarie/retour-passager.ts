'use client';

// Design salarié · étape 6 · retour passager (Sonner) comme dans la planche : juste AU-DESSUS de la barre du bas.
// La page pose le drapeau `?ui=2` (lib/ui2-flag.ts, lu par le Toaster) et publie la hauteur réelle de la barre dans `--dz-barre-h` (la planche écrit 170 px en dur :
// la barre change de hauteur avec la ligne d'aide, l'écran de 360 × 640 et la barre « Journée · Semaine · Mois · Plus »). Rien n'est lu en base, rien n'est écrit.
import { useEffect } from 'react';
import { setUi2Flag } from '@/lib/ui2-flag';

export function useRetourPassager(actif: boolean): void {
  useEffect(() => {
    if (!actif) return;
    setUi2Flag(true);
    const racine = document.documentElement;
    let suivis: Element[] = [];
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => mesurer());
    function mesurer() {
      const barres = Array.from(document.querySelectorAll('.bt-ui2 .dz-onglets, .bt-ui2 .bt-day-dock'));
      const h = barres.reduce((t, e) => t + (e as HTMLElement).offsetHeight, 0);
      racine.style.setProperty('--dz-barre-h', `${h}px`);
      if (ro && (barres.length !== suivis.length || barres.some((e, i) => e !== suivis[i]))) { ro.disconnect(); barres.forEach((e) => ro.observe(e)); suivis = barres; }
    }
    mesurer();
    const mo = new MutationObserver(mesurer); // la journée apporte ou retire sa barre d'envoi selon l'écran
    const phone = document.querySelector('.bt-ui2');
    if (phone) mo.observe(phone, { childList: true, subtree: true });
    window.addEventListener('resize', mesurer);
    return () => { mo.disconnect(); ro?.disconnect(); window.removeEventListener('resize', mesurer); racine.style.removeProperty('--dz-barre-h'); setUi2Flag(false); };
  }, [actif]);
}
