// Une seule définition de la semaine dans tout BEMEXO : LUNDI → DIMANCHE, 7 jours.
//
// Pourquoi une règle unique : le code en avait cinq (planning bureau sur 6 jours,
// « Ma semaine » sur 6 jours, export « Cette semaine » sur 6 jours, rapport de
// coûts sur 7, relances du lundi au vendredi). Résultat : des heures saisies un
// dimanche existaient en base mais n'apparaissaient nulle part et sortaient de
// l'export. Des métiers travaillent le samedi et le dimanche — restauration,
// dépannage, astreinte — et un jour travaillé ne doit jamais disparaître entre
// deux écrans.
//
// Toute vue « semaine » passe par ce fichier. Aucun écran ne recalcule sa
// propre semaine.

import { addDays, startOfWeek as dfStartOfWeek, format } from 'date-fns';

/** Nombre de jours affichés et comptés dans une semaine. */
export const DAYS_IN_WEEK = 7;

/** Premier jour de la semaine, au sens de date-fns (1 = lundi). */
export const WEEK_STARTS_ON = 1 as const;

/** Le lundi de la semaine qui contient `d`. */
export function weekStart(d: Date = new Date()): Date {
  return dfStartOfWeek(d, { weekStartsOn: WEEK_STARTS_ON });
}

/** Le dimanche de la semaine qui contient `d`. */
export function weekEnd(d: Date = new Date()): Date {
  return addDays(weekStart(d), DAYS_IN_WEEK - 1);
}

/** Les 7 jours de la semaine commençant à `start`, du lundi au dimanche. */
export function weekDays(start: Date): Date[] {
  return Array.from({ length: DAYS_IN_WEEK }, (_, i) => addDays(start, i));
}

/** Position du jour dans la semaine : lundi = 0 … dimanche = 6. */
export function weekDayIndex(d: Date = new Date()): number {
  return (d.getDay() + 6) % DAYS_IN_WEEK;
}

/** La semaine de `d` sous forme de deux dates `yyyy-MM-dd` (bornes incluses). */
export function weekRangeISO(d: Date = new Date()): { from: string; to: string } {
  const start = weekStart(d);
  return {
    from: format(start, 'yyyy-MM-dd'),
    to: format(addDays(start, DAYS_IN_WEEK - 1), 'yyyy-MM-dd'),
  };
}
