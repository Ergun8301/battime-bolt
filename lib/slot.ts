// Planning assignments use coarse slots (matin/après-midi/journée), not precise
// hours — the secretary assigns missions, workers declare real hours. We encode
// the slot in the existing planning.estimated_start/end columns (no schema
// change) via fixed sentinel times, and always display the label, never raw times.

export type Slot = 'morning' | 'afternoon' | 'day';

export const SLOT_TIMES: Record<Slot, { start: string; end: string }> = {
  morning: { start: '08:00:00', end: '12:00:00' },
  afternoon: { start: '13:00:00', end: '17:00:00' },
  day: { start: '08:00:00', end: '17:00:00' },
};

export const SLOT_LABELS: Record<Slot, string> = {
  morning: 'Matin',
  afternoon: 'Après-midi',
  day: 'Journée',
};

// Short label for compact bubbles.
export const SLOT_SHORT: Record<Slot, string> = {
  morning: 'Matin',
  afternoon: 'Aprèm',
  day: 'Journée',
};

export const SLOT_ORDER: Slot[] = ['morning', 'afternoon', 'day'];

// Map stored times back to a slot. Anything that isn't a known sentinel
// (legacy rows with free hours, or full-day) falls back to "journée".
export function slotFromTimes(start?: string | null, end?: string | null): Slot {
  const s = start?.substring(0, 5);
  const e = end?.substring(0, 5);
  if (s === '08:00' && e === '12:00') return 'morning';
  if (s === '13:00' && e === '17:00') return 'afternoon';
  return 'day';
}

export function slotLabel(start?: string | null, end?: string | null): string {
  return SLOT_LABELS[slotFromTimes(start, end)];
}
