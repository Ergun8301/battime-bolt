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
