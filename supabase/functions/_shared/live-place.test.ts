// `deno test -A supabase/functions/_shared/live-place.test.ts`
import { cellKey, parisDay, parisHHmm, placeLive } from './live-place.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}

Deno.test('Lot 9 : heure de Paris (été / hiver)', () => {
  eq(parisHHmm('2026-10-01T05:45:12Z'), '07:45', 'été : UTC+2');
  eq(parisHHmm('2026-12-01T06:45:00Z'), '07:45', 'hiver : UTC+1');
  eq(parisHHmm('n/a'), '', 'date invalide');
  eq(parisDay(Date.parse('2026-09-30T22:30:00Z')), '2026-10-01', 'minuit à Paris');
});

Deno.test('Lot 9 : placement — planning_id, puis chantier, jamais « la première bulle »', () => {
  const slots = [
    { id: 'a', user_id: 'k', worksite_id: 'dupont', work_date: '2026-10-01' },
    { id: 'b', user_id: 'k', worksite_id: 'martin', work_date: '2026-10-01' },
    { id: 'c', user_id: 's', worksite_id: 'dupont', work_date: '2026-10-01' },
    { id: 'd', user_id: 'k', worksite_id: null, work_date: '2026-10-02', absence: true },
  ];
  const base = { user_id: 'k', work_date: '2026-10-01', started_at: '2026-10-01T05:45:00Z' };
  eq(placeLive([{ ...base, worksite_id: 'dupont', planning_id: 'b' }], slots).get(cellKey('k', '2026-10-01'))?.slotId, 'b', 'planning_id d’abord');
  eq(placeLive([{ ...base, worksite_id: 'martin', planning_id: null }], slots).get(cellKey('k', '2026-10-01'))?.slotId, 'b', 'puis même chantier');
  const autre = placeLive([{ ...base, worksite_id: 'autre', planning_id: null }], slots).get(cellKey('k', '2026-10-01'));
  eq([autre?.slotId, autre?.since], [null, '07:45'], 'chantier hors planning : case verte, aucune bulle');
  eq(placeLive([{ ...base, worksite_id: 'dupont', planning_id: null }], slots).has(cellKey('s', '2026-10-01')), false, 'jamais la case d’un collègue');
  eq(placeLive([{ ...base, work_date: '2026-10-02', worksite_id: 'x', planning_id: null }], slots).get(cellKey('k', '2026-10-02'))?.slotId, null, 'une absence n’est pas une bulle');
});
