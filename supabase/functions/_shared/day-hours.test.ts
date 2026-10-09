// `deno test supabase/functions/_shared/day-hours.test.ts` (npm run test:heures)
// Lot 1 — « une journée de 7h à 18h affiche 7h30 ». Les règles d'une journée.
import {
  bestPlanningFor, coveredMinutes, findOverlap, firstBlockingOverlap, firstOverlap, keptBreak, overlapMinutes, pauseAsks,
  plannedState, spanMinutes,
} from './day-hours.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}

const MATIN = { id: 'matin', worksite_id: 'salle', estimated_start: '08:00:00', estimated_end: '12:00:00' };
const APREM = { id: 'aprem', worksite_id: 'salle', estimated_start: '13:30:00', estimated_end: '17:00:00' };

Deno.test('durées : passage de minuit, chevauchement, couverture', () => {
  eq(spanMinutes({ start: '07:00', end: '18:00' }), 660, '07:00–18:00 = 11 h');
  eq(spanMinutes({ start: '22:00', end: '06:00' }), 480, 'nuit 22:00–06:00 = 8 h');
  eq(overlapMinutes({ start: '07:00', end: '13:00' }, { start: '12:00', end: '18:00' }), 60, '07–13 et 12–18 : 1 h commune');
  eq(overlapMinutes({ start: '08:07', end: '10:15' }, { start: '10:14', end: '12:01' }), 1, 'pointages qui se touchent : 1 min');
  eq(coveredMinutes({ start: '13:30', end: '17:00' }, [{ start: '07:00', end: '18:00' }]), 210, 'après-midi entièrement couvert');
  eq(coveredMinutes({ start: '08:00', end: '12:00' }, [{ start: '07:00', end: '09:00' }, { start: '08:30', end: '10:00' }, { start: '11:00', end: '11:30' }]), 150, 'union sans double compte');
});

Deno.test('chevauchements : refusés au-delà d’une minute (tolérance du lot 9)', () => {
  eq(findOverlap({ start: '12:00', end: '18:00' }, [{ start: '07:00', end: '13:00' }]), { start: '07:00', end: '13:00' }, '12–18 chevauche 07–13');
  eq(findOverlap({ start: '10:14', end: '12:01' }, [{ start: '08:07', end: '10:15' }]), null, '1 min de recouvrement tolérée');
  eq(findOverlap({ start: '12:30', end: '18:00' }, [{ start: '07:00', end: '12:30' }]), null, 'bout à bout : pas de chevauchement');
  eq(firstOverlap([{ start: '12:00', end: '18:00' }, { start: '07:00', end: '13:00' }])?.map((x) => x.start), ['07:00', '12:00'], 'la paire est trouvée, triée');
  eq(firstOverlap([{ start: '07:00', end: '12:00' }, { start: '13:00', end: '18:00' }]), null, 'matin + après-midi : rien');
  const locked = (start: string, end: string) => ({ start, end, editable: false });
  const draft = (start: string, end: string) => ({ start, end, editable: true });
  eq(firstBlockingOverlap([locked('07:00', '12:00'), locked('11:00', '16:00'), draft('17:00', '18:00')]), null, 'deux lignes verrouillées qui se chevauchent ne bloquent pas un nouveau brouillon');
  eq(firstBlockingOverlap([locked('07:00', '12:00'), draft('11:00', '16:00')])?.length, 2, 'un brouillon sur une ligne verrouillée : bloqué');
  eq(firstBlockingOverlap([draft('08:00', '12:00'), draft('11:00', '15:00')])?.map((x) => x.start), ['08:00', '11:00'], 'deux prévus confirmés 08–12 et 11–15 : bloqués');
});

Deno.test('le prévu du bureau face aux heures saisies', () => {
  const day = [{ start: '07:00', end: '18:00' }];
  eq(plannedState(MATIN, []), 'todo', 'rien de saisi : à confirmer');
  eq(plannedState(MATIN, day), 'covered', '07:00–18:00 couvre le matin');
  eq(plannedState(APREM, day), 'covered', '… et l’après-midi : il ne part plus en plus (14h30 → 11h)');
  eq(plannedState(APREM, [{ start: '07:00', end: '12:30' }, { start: '12:30', end: '18:00' }]), 'covered', 'journée coupée en deux : couvert');
  eq(plannedState(APREM, [{ start: '07:00', end: '14:00' }]), 'overlaps', 'en partie : affiché, jamais envoyé tel quel');
  eq(plannedState(APREM, [{ start: '07:00', end: '13:31' }]), 'todo', '1 min de recouvrement ne compte pas');
  eq(plannedState({ id: 'x', estimated_start: '09:30:00', estimated_end: null }, []), 'incomplete', 'début seul : plus de fin « 17:00 » inventée');
  eq(plannedState({ id: 'x', estimated_start: null, estimated_end: null }, []), 'incomplete', 'sans heures : à compléter');
  eq(plannedState({ id: 'x', estimated_start: '08:00:00', estimated_end: '08:00:00' }, []), 'incomplete', 'début = fin : à compléter');
});

Deno.test('le « + » se rattache au planning qu’il recouvre le plus (plus jamais « le premier »)', () => {
  const plans = [MATIN, APREM, { id: 'autre', worksite_id: 'depot', estimated_start: '13:00:00', estimated_end: '18:00:00' }];
  eq(bestPlanningFor({ start: '13:00', end: '18:00', worksite_id: 'salle' }, plans), 'aprem', '13–18 → après-midi');
  eq(bestPlanningFor({ start: '07:00', end: '18:00', worksite_id: 'salle' }, plans), 'matin', '07–18 → le plus recouvert (matin 4 h > 3h30)');
  eq(bestPlanningFor({ start: '18:00', end: '20:00', worksite_id: 'salle' }, plans), null, 'aucun recouvert, deux plannings : aucun');
  eq(bestPlanningFor({ start: '06:00', end: '07:00', worksite_id: 'depot' }, plans), 'autre', 'un seul planning sur ce chantier : celui-là');
  eq(bestPlanningFor({ start: '08:00', end: '12:00', worksite_id: 'ailleurs' }, plans), null, 'autre chantier : aucun');
  eq(bestPlanningFor({ start: '08:00', end: '12:00', worksite_id: 'salle' }, [{ ...MATIN, absence_type: 'conge' }]), null, 'une absence n’est jamais un planning d’heures');
});

Deno.test('la pause : demandée après 6 h d’affilée, à la main comme à la borne', () => {
  const l = (id: string, start: string, end: string, extra: Record<string, unknown> = {}) => ({ id, start, end, editable: true, break_minutes: 0, ...extra });
  eq(pauseAsks([l('a', '07:00', '18:00')]), [{ id: 'a', start: '07:00', end: '18:00', minutes: 660, lineMinutes: 660 }], '07:00–18:00 saisi à la main : demandée');
  eq(pauseAsks([l('a', '07:00', '18:00', { break_minutes: 60 })]), [], 'pause déjà notée : pas de question');
  eq(pauseAsks([l('a', '07:00', '12:00'), l('b', '13:00', '18:00')]), [], 'trou d’1 h à midi : la pause est là');
  eq(pauseAsks([l('a', '07:00', '12:30'), l('b', '12:30', '18:00')]), [{ id: 'a', start: '07:00', end: '18:00', minutes: 660, lineMinutes: 330 }], 'coupée en deux SANS trou : demandée, sur la plus longue');
  eq(pauseAsks([l('a', '07:00', '12:00'), l('b', '12:10', '18:00')]).length, 1, 'trou de 10 min : pas une pause (moins de 20 min)');
  eq(pauseAsks([l('a', '07:00', '13:00')]), [], '6 h pile : pas de question');
  eq(pauseAsks([l('a', '07:00', '13:01')]).length, 1, '6 h 01 : question');
  eq(pauseAsks([l('a', '07:00', '18:00', { editable: false })]), [], 'ligne déjà envoyée : on ne la redemande pas');
  eq(pauseAsks([l('a', '06:00', '13:00'), l('b', '14:00', '21:00')]).map((x) => x.id), ['a', 'b'], 'deux plages de 7 h : deux questions');
  eq(pauseAsks([l('a', '07:00', '07:50'), l('b', '07:50', '08:30'), l('c', '08:30', '09:20'), l('d', '09:20', '10:10'), l('e', '10:10', '11:00'), l('f', '11:00', '11:50'), l('g', '11:50', '12:40'), l('h', '12:40', '13:30')])[0]?.minutes, 390, 'huit petites lignes bout à bout = 6h30 d’affilée');
  eq(pauseAsks([l('a', '07:00', '07:25'), l('b', '07:25', '07:50'), l('c', '07:50', '13:30', { editable: false })]), [], 'seules des lignes trop courtes pour une pause sont modifiables : pas de question');
  eq(pauseAsks([l('plan:x', '08:00', '17:00')]), [{ id: 'plan:x', start: '08:00', end: '17:00', minutes: 540, lineMinutes: 540 }], 'un prévu confirmé 08–17 : demandée aussi');
});

Deno.test('une correction garde la pause (elle était remise à 0)', () => {
  eq(keptBreak({ start: '07:00', end: '17:00' }, 60), 60, '07–18 pause 1 h corrigé en 07–17 : la pause reste');
  eq(keptBreak({ start: '07:00', end: '07:30' }, 60), 0, 'ligne plus courte que la pause : pause retirée');
  eq(keptBreak({ start: '07:00', end: '17:00' }, null), 0, 'pas de pause');
  eq(keptBreak({ start: '07:00', end: '17:00' }, -5), 0, 'jamais négative');
});
