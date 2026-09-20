// Une seule règle pour les heures supplémentaires dans tout BEMEXO.
//
// Décision métier : horaire hebdomadaire de base défini par l'entreprise,
// exception possible salarié par salarié, et calcul À LA SEMAINE — jamais au
// jour, jamais au mois. Une semaine de 4 jours à 10 h ne fabrique pas d'heures
// supplémentaires si la base est 40 ; une semaine de 6 jours à 7 h en fabrique
// 2 si la base est 40. Compter au jour donnerait l'inverse dans les deux cas.
//
// La semaine est celle de lib/week.ts : lundi → dimanche.

import { format } from 'date-fns';
import { weekStart, weekEnd } from '@/lib/week';

/** Horaire hebdomadaire de base quand ni l'entreprise ni le salarié n'en ont fixé. */
export const DEFAULT_WEEKLY_HOURS = 35;

export type WeekTotal = {
  /** Lundi de la semaine, en yyyy-MM-dd. */
  weekStart: string;
  /** Dimanche de la semaine, en yyyy-MM-dd. */
  weekEnd: string;
  /** Minutes travaillées et déclarées, route payée comprise. */
  minutes: number;
  /** Minutes au-delà de l'horaire de base. Jamais négatif. */
  overtimeMinutes: number;
  /** Minutes dans la limite de l'horaire de base. */
  normalMinutes: number;
};

/**
 * L'horaire de base qui s'applique à un salarié : son exception si elle
 * existe, sinon celui de l'entreprise, sinon 35 h.
 *
 * Une exception à 0 est une valeur volontaire (salarié non soumis à un horaire
 * hebdomadaire), pas une absence de réglage — d'où le test sur null et non sur
 * la valeur elle-même.
 */
export function weeklyHoursFor(
  workerWeeklyHours: number | null | undefined,
  companyWeeklyHours: number | null | undefined,
): number {
  if (workerWeeklyHours !== null && workerWeeklyHours !== undefined) return workerWeeklyHours;
  if (companyWeeklyHours !== null && companyWeeklyHours !== undefined) return companyWeeklyHours;
  return DEFAULT_WEEKLY_HOURS;
}

/**
 * Regroupe des minutes datées par semaine et calcule les heures supplémentaires.
 *
 * `rows` ne doit contenir QUE des heures déclarées (voir lib/status.ts) : un
 * brouillon ne fait pas d'heures supplémentaires.
 */
export function weeklyTotals(
  rows: { work_date: string; minutes: number }[],
  weeklyHours: number,
): WeekTotal[] {
  const base = Math.max(0, Math.round(weeklyHours * 60));
  const byWeek = new Map<string, number>();
  for (const r of rows) {
    const d = new Date(`${r.work_date}T00:00:00`);
    const k = format(weekStart(d), 'yyyy-MM-dd');
    byWeek.set(k, (byWeek.get(k) || 0) + (r.minutes || 0));
  }
  return Array.from(byWeek.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([start, minutes]) => {
      const overtimeMinutes = Math.max(0, minutes - base);
      return {
        weekStart: start,
        weekEnd: format(weekEnd(new Date(`${start}T00:00:00`)), 'yyyy-MM-dd'),
        minutes,
        overtimeMinutes,
        normalMinutes: minutes - overtimeMinutes,
      };
    });
}
