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
/** Une ligne déjà posée sur la feuille (envoyée, brouillon, retirée ou en file). */
export interface LineLike {
  worksite_id?: string | null;
  planning_id?: string | null;
}

/**
 * Quels plannings n'ont ENCORE aucune ligne en face d'eux.
 *
 * LE PIÈGE, ET IL M'A EU. La version précédente comparait les `worksite_id` en
 * bloc : dès qu'une ligne existait pour un chantier, TOUS les plannings de ce
 * chantier disparaissaient. Le bureau prévoit « Dupont 08:00–12:00 » et
 * « Dupont 13:00–17:00 », le salarié remplit le matin — et l'après-midi
 * s'évapore, sans erreur, sans trace, sans paie.
 *
 * Mes onze cas de banc ne l'avaient pas vu parce qu'ils testaient
 * `planningsToMaterialise` sur une liste écrite à la main : la fonction gérait
 * bien deux créneaux sur un même chantier, mais on ne lui en donnait plus
 * qu'un. Tester l'unité et pas le chemin qui l'alimente, c'est prouver que la
 * serrure ferme sans regarder si la porte est posée.
 *
 * L'APPARIEMENT SE FAIT DONC LIGNE À LIGNE, en deux passes :
 *
 *  1. Par `planning_id` quand la ligne en désigne un — c'est le lien exact.
 *  2. Sinon au compteur, par chantier : deux plannings sur le même chantier
 *     demandent DEUX lignes pour disparaître tous les deux.
 *
 * La deuxième passe n'est pas un filet de confort : jusqu'ici le `planning_id`
 * posé à la création pointait systématiquement sur le PREMIER planning du
 * chantier, donc les données existantes ne sont pas fiables. Deux lignes
 * portant le même `planning_id` ne couvrent qu'un planning ; la seconde
 * retombe au compteur, où elle compte quand même.
 */
export function remainingPlannings<T extends PlanningLike>(plannings: T[], lines: LineLike[]): T[] {
  const planIds = new Set(plannings.map((p) => p.id));
  const named = new Set<string>();
  const loose = new Map<string, number>();

  for (const l of lines) {
    if (l.planning_id && planIds.has(l.planning_id) && !named.has(l.planning_id)) {
      named.add(l.planning_id);
      continue;
    }
    if (l.worksite_id) loose.set(l.worksite_id, (loose.get(l.worksite_id) || 0) + 1);
  }

  const out: T[] = [];
  for (const p of plannings) {
    if (named.has(p.id)) continue;
    const ws = p.worksite_id || '';
    const n = loose.get(ws) || 0;
    if (n > 0) { loose.set(ws, n - 1); continue; }
    out.push(p);
  }
  return out;
}

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
