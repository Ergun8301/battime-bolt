// `deno test supabase/functions/_shared/live-clash.test.ts` (npm run test:pointage-regles)
// Lot 10 — une intervention saisie face au pointage en cours.
import { liveClash, parisClock, type LiveClash } from './live-clash.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}

/** Chrono ouvert à 08:02, il est 10:30, la fonction de fermeture existe, aucune autre ligne — sauf mention. */
const clash = (start: string, end: string, o: Partial<Parameters<typeof liveClash>[0]> = {}): LiveClash =>
  liveClash({ span: { start, end }, liveStart: '08:02', now: '10:30', others: [], finishAvailable: true, ...o });

Deno.test('liveClash : pas de chevauchement, une minute tolérée', () => {
  eq(clash('06:00', '07:30'), null, '06:00–07:30 finit avant le chrono');
  eq(clash('06:00', '08:03'), null, '1 min de recouvrement tolérée');
  eq(clash('06:00', '08:04'), { can: 'fix', why: 'before' }, '2 min de recouvrement : refusé, commence avant le chrono');
});

Deno.test('liveClash : commence avant ou au début du chrono → "before"', () => {
  eq(clash('07:00', '09:00'), { can: 'fix', why: 'before' }, '07:00–09:00');
  eq(clash('08:02', '09:00'), { can: 'fix', why: 'before' }, '08:02–09:00 : même minute');
  eq(clash('08:03', '09:00'), { can: 'fix', why: 'before' }, '08:03–09:00 : 1 min après le début, la fermeture annulerait');
  eq(clash('08:04', '09:00'), { can: 'finish', at: '08:04' }, '08:04–09:00 : 2 min de pointage possibles');
});

Deno.test('liveClash : terminer le pointage à l’heure de début', () => {
  eq(clash('09:00', '10:00'), { can: 'finish', at: '09:00' }, '09:00–10:00');
  eq(clash('10:30', '11:30'), { can: 'finish', at: '10:30' }, 'début = maintenant accepté');
});

Deno.test('liveClash : pas dans le futur', () => {
  eq(clash('10:31', '11:30'), { can: 'fix', why: 'future' }, '10:31 > 10:30');
  eq(clash('14:00', '15:00'), { can: 'fix', why: 'future' }, '14:00');
});

Deno.test('liveClash : passage de minuit', () => {
  eq(clash('22:00', '02:00', { now: '23:00' }), { can: 'finish', at: '22:00' }, '22:00–02:00 à 23:00');
  eq(clash('22:00', '02:00', { now: '10:30' }), { can: 'fix', why: 'future' }, '22:00–02:00 à 10:30');
});

Deno.test('liveClash : collision avec une ligne déjà notée', () => {
  const r = clash('10:00', '12:00', { liveStart: '07:42', others: [{ start: '08:00', end: '09:00' }] });
  eq(r, { can: 'fix', why: 'collision', with: { start: '08:00', end: '09:00' } }, 'ligne 08:00–09:00 entre le chrono et l’intervention');
  const sent = clash('10:00', '12:00', { liveStart: '07:42', others: [{ start: '08:00', end: '09:00', editable: false }] });
  eq(sent && 'with' in sent ? sent.with?.editable : undefined, false, 'ligne envoyée : editable === false');
  eq(clash('09:00', '10:00', { others: [{ start: '11:00', end: '12:00' }] }), { can: 'finish', at: '09:00' }, 'ligne plus tard : pas de collision');
  eq(clash('09:00', '10:00', { liveStart: '07:42', others: [{ start: '07:00', end: '07:42' }] }), { can: 'finish', at: '09:00' }, 'ligne qui touche le début du chrono : pas de collision');
});

Deno.test('liveClash : fonction de fermeture absente', () => {
  eq(clash('09:00', '10:00', { finishAvailable: false }), { can: 'fix', why: 'unavailable' }, 'cas finish → unavailable');
  eq(clash('07:00', '09:00', { finishAvailable: false }), { can: 'fix', why: 'before' }, 'la raison de fond prime');
  eq(clash('06:00', '07:30', { finishAvailable: false }), null, 'pas de chevauchement : rien à dire');
});

Deno.test('parisClock : jamais « 24:05 », fuseau de Paris, été et hiver', () => {
  eq(parisClock('2026-10-20T22:05:00Z'), { date: '2026-10-21', hm: '00:05' }, '00:05 le lendemain (heure d’été)');
  eq(parisClock('2026-10-20T21:59:00Z'), { date: '2026-10-20', hm: '23:59' }, '23:59');
  // Passage à l'heure d'hiver le 25 octobre 2026 à 03:00 → 02:00.
  eq(parisClock('2026-10-24T22:30:00Z'), { date: '2026-10-25', hm: '00:30' }, 'veille du changement (UTC+2)');
  eq(parisClock('2026-10-25T23:30:00Z'), { date: '2026-10-26', hm: '00:30' }, 'après le changement (UTC+1)');
  eq(parisClock('2026-01-15T08:00:00Z'), { date: '2026-01-15', hm: '09:00' }, 'hiver UTC+1');
  eq(parisClock('2026-07-15T08:00:00Z'), { date: '2026-07-15', hm: '10:00' }, 'été UTC+2');
  eq(parisClock('2026-10-20T22:05:00Z'), parisClock(Date.parse('2026-10-20T22:05:00Z')), 'chaîne ISO et nombre');
});
