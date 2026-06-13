// Helpers to figure out which recent business days a worker hasn't sent yet.
// Used by the admin dashboard (per-worker status) and the poseur banner.
// "Sent" = a time_entry whose status is not 'draft' (submitted; legacy 'validated').

import { subDays, isWeekend, format } from 'date-fns';

/** Business days (Mon–Fri) within the last `windowDays` calendar days, excluding today. */
export function recentBusinessDays(windowDays = 7, refDate: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = 1; i <= windowDays; i++) {
    const d = subDays(refDate, i);
    if (!isWeekend(d)) out.push(format(d, 'yyyy-MM-dd'));
  }
  return out;
}

/** Recent business days (most recent first) that have no sent entry. */
export function missingBusinessDays(
  sentDates: Set<string>,
  windowDays = 7,
  refDate: Date = new Date(),
): string[] {
  return recentBusinessDays(windowDays, refDate).filter((d) => !sentDates.has(d));
}
