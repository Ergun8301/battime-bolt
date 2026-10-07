import { assertEquals } from 'jsr:@std/assert@1';
import { computeMissingDays, REMINDED_ROLES } from './missing-days.ts';

const TODAY = '2026-10-07';

Deno.test('relances : le chef d’équipe est relancé comme le salarié', () => {
  assertEquals([...REMINDED_ROLES], ['worker', 'lead']);
});

Deno.test('relances : jour planifié non envoyé = manquant ; envoyé ou absence = non', () => {
  const m = computeMissingDays(
    [
      { user_id: 'a', work_date: '2026-10-05', absence_type: null },
      { user_id: 'a', work_date: '2026-10-06', absence_type: null },
      { user_id: 'b', work_date: '2026-10-06', absence_type: 'conge' },
      { user_id: 'b', work_date: '2026-10-06', absence_type: null },
    ],
    [{ user_id: 'a', work_date: '2026-10-06' }],
    [],
    TODAY,
  );
  assertEquals(m.get('a'), ['2026-10-05']);
  assertEquals(m.has('b'), false);
});

Deno.test('relances : brouillon d’un jour passé hors planning (sortie oubliée) = manquant', () => {
  const m = computeMissingDays([], [], [{ user_id: 'c', work_date: '2026-10-04' }], TODAY);
  assertEquals(m.get('c'), ['2026-10-04']);
});

Deno.test('relances : brouillon du jour = pas un manque (rappel du jour à part)', () => {
  const m = computeMissingDays([{ user_id: 'd', work_date: TODAY, absence_type: null }], [], [{ user_id: 'd', work_date: TODAY }], TODAY);
  assertEquals(m.has('d'), false);
});

Deno.test('relances : brouillon + ligne envoyée le même jour = rien ; pas de doublon planning + brouillon', () => {
  const m = computeMissingDays(
    [{ user_id: 'e', work_date: '2026-10-03', absence_type: null }],
    [{ user_id: 'f', work_date: '2026-10-02' }],
    [{ user_id: 'e', work_date: '2026-10-03' }, { user_id: 'f', work_date: '2026-10-02' }],
    TODAY,
  );
  assertEquals(m.get('e'), ['2026-10-03']);
  assertEquals(m.has('f'), false);
});

Deno.test('relances : brouillon un jour d’absence = rien', () => {
  const m = computeMissingDays([{ user_id: 'g', work_date: '2026-10-01', absence_type: 'maladie' }], [], [{ user_id: 'g', work_date: '2026-10-01' }], TODAY);
  assertEquals(m.has('g'), false);
});
