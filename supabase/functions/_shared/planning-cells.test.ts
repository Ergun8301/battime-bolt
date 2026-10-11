// Lot 3bis — règles d'une case du planning, partagées par l'écran et la feuille imprimée.
//   npm run test:impression
import {
  aggregateEntries, bubbleTitleOf, extraDeclared, makeBubbleKeyOf, makePrintSource, orderCmp, withdrawnSet,
  type EntryRow, type SlotLike,
} from '../../../lib/planning-cells.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
function ok(c: boolean, msg: string) { if (!c) throw new Error(msg); }

const WS: Record<string, { client_name: string }> = { w1: { client_name: 'Villa Exemple' }, w2: { client_name: 'Résidence Test' }, w5: { client_name: 'Autre' } };
const slot = (id: string, user_id: string, work_date: string, worksite_id: string | null, o: Partial<SlotLike> = {}): SlotLike => ({
  id, user_id, work_date, worksite_id, absence_type: null, added_by_worker: false, created_at: '2026-10-01T06:00:00Z', position: null,
  notes: null, worksite: worksite_id ? WS[worksite_id] ?? null : null, ...o,
});
const entry = (user_id: string, work_date: string, worksite_id: string | null, o: Partial<EntryRow> = {}): EntryRow => ({
  user_id, work_date, worksite_id, planning_id: null, start_time: '08:00:00', end_time: '12:00:00', total_minutes: 240,
  reception: null, reserve_resolved_at: null, reserve_fixed_at: null, observation: null, ...o,
});

Deno.test('quelle bulle porte quelles heures', () => {
  const planning = [
    slot('p-b', 'u1', '2026-10-21', 'w1', { created_at: '2026-10-01T07:00:00Z' }),
    slot('p-a', 'u1', '2026-10-21', 'w1', { created_at: '2026-10-01T08:00:00Z' }),
    slot('p-abs', 'u1', '2026-10-22', null, { absence_type: 'conge' }),
  ];
  const keyOf = makeBubbleKeyOf(planning);
  eq(keyOf(entry('u1', '2026-10-21', 'w1', { planning_id: 'p-a' })), 'p:p-a', 'son planning_id l’emporte');
  eq(keyOf(entry('u1', '2026-10-21', 'w1')), 'p:p-b', 'sans lien : la plus ancienne');
  eq(makeBubbleKeyOf([...planning, slot('p-w', 'u1', '2026-10-21', 'w1', { added_by_worker: true, created_at: '2026-10-09T00:00:00Z' })])(entry('u1', '2026-10-21', 'w1')), 'p:p-w', 'sans lien : « ajoutée par le salarié » d’abord');
  const tie = makeBubbleKeyOf([slot('p-z', 'u1', '2026-10-21', 'w1'), slot('p-y', 'u1', '2026-10-21', 'w1')]);
  eq(tie(entry('u1', '2026-10-21', 'w1')), 'p:p-y', 'même date de création : le plus petit id');
  eq(keyOf(entry('u1', '2026-10-22', null)), 'u1|2026-10-22|null', 'une absence ne porte jamais d’heures');
  eq(keyOf(entry('u1', '2026-10-21', 'w2')), 'u1|2026-10-21|w2', 'autre chantier : clé de case (hors planning)');
  eq(keyOf(entry('u1', '2026-10-21', 'w1', { planning_id: 'ailleurs' })), 'p:p-b', 'planning_id inconnu de la case : la bulle propriétaire');
});

Deno.test('additionner les heures d’une bulle', () => {
  const keyOf = makeBubbleKeyOf([slot('p1', 'u1', '2026-10-21', 'w1')]);
  const m = aggregateEntries([
    entry('u1', '2026-10-21', 'w1', { start_time: '13:00:00', end_time: '17:00:00', reception: 'sans', observation: 'porte' }),
    entry('u1', '2026-10-21', 'w1', { start_time: '07:30:00', end_time: '12:00:00', total_minutes: 270, reception: 'avec', observation: 'fenêtre' }),
    entry('u1', '2026-10-21', 'w1', { start_time: '18:00:00', end_time: '19:00:00', total_minutes: 60, reception: 'en_cours' }),
  ], keyOf);
  eq(m.get('p:p1'), { minutes: 570, start: '07:30:00', end: '19:00:00', count: 3, reception: 'avec', reserveOpen: true, note: 'porte · fenêtre' }, 'somme, bornes, réception la plus forte, notes');
  const lifted = aggregateEntries([entry('u1', '2026-10-21', 'w1', { reception: 'avec', reserve_fixed_at: '2026-10-22T08:00:00Z' })], keyOf);
  eq(lifted.get('p:p1')?.reserveOpen, false, 'réserve levée par le salarié : plus ouverte');
  const office = aggregateEntries([entry('u1', '2026-10-21', 'w1', { reception: 'avec', reserve_resolved_at: '2026-10-22T08:00:00Z' })], keyOf);
  eq(office.get('p:p1')?.reserveOpen, false, 'réserve levée par le bureau : plus ouverte');
});

Deno.test('la feuille lit les mêmes règles que la grille', () => {
  const planning = [
    slot('p2', 'u1', '2026-10-21', 'w2', { created_at: '2026-10-01T09:00:00Z' }),
    slot('p1', 'u1', '2026-10-21', 'w1', { created_at: '2026-10-01T10:00:00Z', position: 0 }),
    slot('p5', 'u1', '2026-10-21', 'w5', { notes: 'Formation sécurité', created_at: '2026-10-01T11:00:00Z' }),
    slot('abs1', 'u2', '2026-10-21', null, { absence_type: 'maladie' }),
    slot('abs2', 'u2', '2026-10-21', null, { absence_type: 'conge' }),
    slot('p3', 'u2', '2026-10-22', 'w1'),
  ];
  const real = [entry('u1', '2026-10-21', 'w1', { planning_id: 'p1' }), entry('u2', '2026-10-22', 'w2', { total_minutes: 60 }), entry('u2', '2026-10-22', null, { total_minutes: 30 })];
  const drafts = [entry('u1', '2026-10-21', 'w1', { planning_id: 'p1', total_minutes: 15 }), entry('u1', '2026-10-21', 'w2', { planning_id: 'p2', total_minutes: 45 }), entry('u2', '2026-10-22', 'w2', { total_minutes: 20 })];
  const src = makePrintSource({ planning, real, drafts, withdrawn: withdrawnSet([{ planning_id: 'p5' }, { planning_id: null }]) }, new Map([['w1', 'Villa Exemple'], ['w2', 'Résidence Test']]));
  eq(src.slots('u1', '2026-10-21').map((p) => p.id), ['p1', 'p2', 'p5'], 'bulles triées comme à l’écran (position, puis création), sans absence');
  eq(src.absence('u2', '2026-10-21')?.id, 'abs1', 'la première absence de la case');
  eq(src.slots('u2', '2026-10-21'), [], 'une case d’absence n’a pas de bulle');
  eq(src.real(planning[1])?.minutes, 240, 'heures envoyées sur la bulle');
  eq(src.draft(planning[1]), undefined, 'brouillon caché quand la bulle a des heures envoyées');
  eq(src.draft(planning[0])?.minutes, 45, 'brouillon montré sinon');
  ok(src.withdrawn('p5') && !src.withdrawn('p1'), 'case retirée par le salarié');
  eq(src.extra('u2', '2026-10-22'), [
    { worksiteId: 'w2', name: 'Résidence Test', minutes: 60, pending: false },
    { worksiteId: null, name: 'Autre', minutes: 30, pending: false },
    { worksiteId: 'w2', name: 'Résidence Test', minutes: 20, pending: true },
  ], 'heures hors planning : chantier non prévu, « Autre » sans chantier, brouillon à part');
  eq(src.extra('u1', '2026-10-21'), [], 'chantier prévu dans la case : déjà porté par sa bulle');
  eq([src.titleOf(planning[1]), src.titleOf(planning[0]), src.titleOf(planning[2])], ['Villa Exemple', 'Résidence Test', 'Formation sécurité'], 'titre : chantier si heures, la note pour « Autre » prévu');
  eq(bubbleTitleOf({ worksite: null, notes: null }), 'Chantier', 'sans chantier');
  eq(src.titleOf(slot('px', 'u9', '2026-10-21', 'w5', { notes: '  ' })), 'Autre', '« Autre » sans note');
});

Deno.test('index par case = filtre de l’écran (200 lignes au hasard)', () => {
  let seed = 7;
  const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const users = ['u1', 'u2', 'u3', 'u4'], days = ['2026-10-19', '2026-10-20', '2026-10-21'], wss = ['w1', 'w2', 'w5', null];
  const planning: SlotLike[] = Array.from({ length: 200 }, (_, i) => slot(`p${i}`, users[rnd(4)], days[rnd(3)], wss[rnd(4)], {
    absence_type: rnd(9) === 0 ? 'conge' : null, position: rnd(4) === 0 ? rnd(3) : null, added_by_worker: rnd(6) === 0,
    created_at: `2026-10-01T0${rnd(10)}:00:00Z`, notes: rnd(3) === 0 ? 'Note' : null,
  }));
  const real = Array.from({ length: 80 }, () => entry(users[rnd(4)], days[rnd(3)], wss[rnd(4)], { planning_id: rnd(2) ? `p${rnd(200)}` : null, total_minutes: 30 + rnd(300) }));
  const drafts = Array.from({ length: 60 }, () => entry(users[rnd(4)], days[rnd(3)], wss[rnd(4)], { planning_id: rnd(2) ? `p${rnd(200)}` : null, total_minutes: rnd(300) }));
  const names = new Map([['w1', 'Villa Exemple'], ['w2', 'Résidence Test']]);
  const src = makePrintSource({ planning, real, drafts, withdrawn: new Set(['p3', 'p40']) }, names);
  // Ce que fait la grille (admin-planning) : filtres sur toutes les lignes.
  const keyOf = makeBubbleKeyOf(planning), realMap = aggregateEntries(real, keyOf), draftMap = aggregateEntries(drafts, keyOf);
  let cells = 0;
  for (const u of users) for (const d of days) {
    const want = planning.filter((p) => p.user_id === u && p.work_date === d && !p.absence_type).sort(orderCmp);
    eq(src.slots(u, d).map((p) => p.id), want.map((p) => p.id), `${u} ${d} : bulles`);
    eq(src.absence(u, d)?.id, planning.find((p) => p.user_id === u && p.work_date === d && p.absence_type)?.id, `${u} ${d} : absence`);
    eq(src.extra(u, d), extraDeclared(planning, real, drafts, names, u, d), `${u} ${d} : heures hors planning`);
    for (const p of want) {
      eq(src.real(p), realMap.get(`p:${p.id}`), `${p.id} : heures envoyées`);
      eq(src.draft(p), realMap.has(`p:${p.id}`) ? undefined : draftMap.get(`p:${p.id}`), `${p.id} : brouillon`);
    }
    cells++;
  }
  eq(cells, 12, '12 cases comparées');
});

// ── Lot 1 (heures sûres) : « Supprimer ? » sur le planning ──
import { eraseConfirmation } from '../../../lib/planning-cells.ts';

Deno.test('Lot 1 — planning : une case seule sans heures → directe ; plusieurs, ou des heures retirées → on demande', () => {
  const slots = [
    { id: 'a', work_date: '2026-10-13' }, { id: 'b', work_date: '2026-10-13' }, { id: 'c', work_date: '2026-10-14' }, { id: 'r', work_date: '2026-10-15' },
  ];
  const withdrawn = new Set(['r']);
  eq(eraseConfirmation(slots, ['a'], withdrawn), null, 'une case sans heures : tout de suite, avec « Annuler »');
  eq(eraseConfirmation(slots, ['a', 'b', 'c'], withdrawn), { count: 3, days: [{ date: '2026-10-13', n: 2 }, { date: '2026-10-14', n: 1 }], withHours: 0 }, 'plusieurs cases : combien, quels jours');
  eq(eraseConfirmation(slots, ['r'], withdrawn), { count: 1, days: [{ date: '2026-10-15', n: 1 }], withHours: 1 }, 'une case qui porte des heures (retirées) : on demande');
  eq(eraseConfirmation(slots, ['c', 'r'], withdrawn)!.withHours, 1, 'le nombre de cases avec des heures est dit');
  eq(eraseConfirmation(slots, ['zz'], withdrawn), null, 'case disparue entre-temps : rien à demander');
});
