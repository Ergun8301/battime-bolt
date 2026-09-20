// A day is "missing" ONLY when the worker had a CHANTIER assignment that day
// (planning row, absence excluded) and hasn't declared their hours. No planning
// => never missing. An absence (congé/maladie/intempérie) => never missing.
// "Declared" = a time_entry whose status is not 'draft'.

import { format } from 'date-fns';

/**
 * @param plannedDates work_date (yyyy-MM-dd) of chantier assignments (absences already excluded)
 * @param declaredDates work_date of declared (non-draft) time entries
 * @returns the missing dates (planned, past, not declared), most recent first
 */
export function computeMissingDays(
  plannedDates: string[],
  declaredDates: Set<string>,
): string[] {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const missing = new Set<string>();
  for (const d of plannedDates) {
    if (d >= todayStr) continue;        // today/future not missing yet
    if (declaredDates.has(d)) continue; // already declared
    missing.add(d);
  }
  return Array.from(missing).sort((a, b) => (a < b ? 1 : -1));
}

/** Défauts repris de l'ouverture manuelle d'un chantier planifié. */
export const PLANNED_DEFAULT_START = '08:00';
export const PLANNED_DEFAULT_END = '17:00';

export interface PlanningLike {
  id: string;
  worksite_id?: string | null;
  absence_type?: string | null;
  estimated_start?: string | null;
  estimated_end?: string | null;
}

export interface MaterialisedLine {
  planningId: string;
  worksiteId: string;
  start: string;
  end: string;
}

/**
 * Quels chantiers prévus par le bureau deviennent des lignes de la feuille.
 *
 * Un chantier planifié EST une ligne valide : le salarié dont la journée s'est
 * passée comme prévu n'a pas à ouvrir chaque chantier pour appuyer sur un
 * bouton avant d'avoir le droit d'envoyer.
 *
 * Cette règle vit ici, et pas dans le composant, pour une raison simple : elle
 * décide de ce qui part en paie. Elle doit pouvoir être mise au banc.
 *
 * TROIS PIÈGES :
 *
 *  1. UNE ABSENCE N'EST JAMAIS DES HEURES. On filtre sur `absence_type` et pas
 *     seulement sur l'absence de chantier. Aujourd'hui aucune absence ne porte
 *     de chantier — vérifié, zéro sur toute la base — mais la colonne est
 *     nullable et rien ne l'interdit au bureau. S'appuyer sur l'état actuel des
 *     données, c'est transformer un congé en journée travaillée le jour où ça
 *     changera.
 *
 *  2. PLUSIEURS PLANNINGS LE MÊME JOUR. Chacun donne sa ligne — matin et
 *     après-midi sur deux chantiers, c'est bien deux lignes. Mais deux
 *     plannings qui produiraient exactement les mêmes heures sur le même
 *     chantier n'en donnent qu'une : sinon on fabrique un chevauchement que le
 *     salarié n'a pas commis, et l'alerte de cohérence l'accuse à tort.
 *
 *  3. Les horaires du bureau font foi, avec les mêmes défauts que l'ouverture
 *     manuelle : le salarié retrouve ce qu'il aurait vu en ouvrant la fiche.
 */
export function planningsToMaterialise(plannings: PlanningLike[]): MaterialisedLine[] {
  const out: MaterialisedLine[] = [];
  for (const p of plannings) {
    if (p.absence_type) continue;
    if (!p.worksite_id) continue;
    const start = (p.estimated_start || PLANNED_DEFAULT_START).slice(0, 5);
    const end = (p.estimated_end || PLANNED_DEFAULT_END).slice(0, 5);
    if (out.some((x) => x.worksiteId === p.worksite_id && x.start === start && x.end === end)) continue;
    out.push({ planningId: p.id, worksiteId: p.worksite_id, start, end });
  }
  return out;
}
