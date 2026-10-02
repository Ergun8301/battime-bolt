// `deno test supabase/functions/_shared/time-input.test.ts`
import { filterQuarterHours, parseTimeInput, QUARTER_HOURS } from '../../../lib/time-input.ts';
function eq(a: unknown, b: unknown, m: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`); }
Deno.test('Lot 11 : saisie d’heure simple', () => {
  for (const [i, o] of [['14h', '14:00'], ['14h30', '14:30'], ['14:30', '14:30'], ['14.30', '14:30'], ['1430', '14:30'], ['830', '08:30'], ['8', '08:00'], ['8h5', '08:50'], ['midi', '12:00'], ['', ''], ['  ', ''], ['25h', null], ['abc', null], ['14:75', null]] as const) eq(parseTimeInput(i), o, i);
  eq(QUARTER_HOURS[0], '05:00', 'début de liste'); eq(QUARTER_HOURS[QUARTER_HOURS.length - 1], '22:00', 'fin de liste');
  eq(filterQuarterHours('14'), ['14:00', '14:15', '14:30', '14:45'], 'filtre « 14 »');
});
