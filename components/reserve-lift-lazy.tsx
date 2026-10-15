'use client';

// Le formulaire « Lever la réserve » (components/reserve-lift-form.tsx), chargé à l'ouverture et non au
// premier affichage de /poseur : la carte de « Ma journée » et la fenêtre « Réserves à lever » l'affichent
// seulement quand on touche « Lever la réserve ». Préchauffé au repos du navigateur (lib/lazy-window.tsx),
// donc prêt dans la quasi-totalité des cas ; jamais d'indicateur de chargement.
// Une seule définition pour les deux écrans (le bureau, lui, importe directement le formulaire).
import { lazyWindow } from '@/lib/lazy-window';

export const ReserveLiftForm = lazyWindow(() => import('@/components/reserve-lift-form'), { isOpen: () => true, priority: 8 });
