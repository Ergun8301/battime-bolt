import { assertEquals } from 'jsr:@std/assert@1';
import { dureePrevue, hauteursBarres, hm, plageAbsence, pourcentJauge, resumeRelance, totauxSemaine } from './bureau-vue.ts';

Deno.test('hm : heures:minutes', () => {
  assertEquals(hm(0), '0:00'); assertEquals(hm(255), '4:15'); assertEquals(hm(8535), '142:15'); assertEquals(hm(-5), '0:00');
});

Deno.test('dureePrevue : seulement début et fin valides', () => {
  assertEquals(dureePrevue('08:00:00', '12:00:00'), 240);
  assertEquals(dureePrevue('08:00', null), 0);
  assertEquals(dureePrevue('17:00', '08:00'), 0);
});

Deno.test('totauxSemaine : envoyées par jour et par salarié, prévues sans heures', () => {
  const dates = ['2026-10-12', '2026-10-13', '2026-10-14'];
  const t = totauxSemaine(dates, ['a', 'b'],
    [{ user_id: 'a', work_date: '2026-10-12', total_minutes: 255 }, { user_id: 'a', work_date: '2026-10-13', total_minutes: 480 }, { user_id: 'b', work_date: '2026-10-12', total_minutes: 60 }, { user_id: 'z', work_date: '2026-10-12', total_minutes: 99 }, { user_id: 'a', work_date: '2026-11-01', total_minutes: 99 }],
    [{ id: 'p1', user_id: 'b', work_date: '2026-10-14', estimated_start: '13:30', estimated_end: '17:00' }, { id: 'p2', user_id: 'b', work_date: '2026-10-14', estimated_start: '08:00', estimated_end: '12:00', absence_type: 'conge' }, { id: 'p3', user_id: 'b', work_date: '2026-10-13', estimated_start: '08:00', estimated_end: '09:00' }],
    new Set(['p3']));
  assertEquals(t.jours, [315, 480, 0]);
  assertEquals(t.parSalarie.a, { envoyees: 735, prevues: 0 });
  assertEquals(t.parSalarie.b, { envoyees: 60, prevues: 210 });
  assertEquals(t.envoyees, 795); assertEquals(t.aVenir, 210);
});

Deno.test('hauteursBarres et jauge', () => {
  assertEquals(hauteursBarres([60, 30, 0]), [100, 50, 0]);
  assertEquals(hauteursBarres([0, 0]), [0, 0]);
  assertEquals(pourcentJauge(1695, 420), 80); assertEquals(pourcentJauge(0, 0), 0);
});

Deno.test('resumeRelance : les plus en retard d’abord, trois puis « … »', () => {
  assertEquals(resumeRelance([{ prenom: 'Eli', jours: 1 }, { prenom: 'Fanny', jours: 2 }, { prenom: 'Bruno', jours: 2 }]), 'Bruno ×2, Fanny ×2, Eli');
  assertEquals(resumeRelance([{ prenom: 'A', jours: 1 }, { prenom: 'B', jours: 1 }, { prenom: 'C', jours: 1 }, { prenom: 'D', jours: 1 }]), 'A, B, C, …');
  assertEquals(resumeRelance([{ prenom: 'A', jours: 0 }]), '');
});

Deno.test('plageAbsence : jours consécutifs du même type', () => {
  const abs = new Set(['2026-10-12', '2026-10-13', '2026-10-14']);
  const type = (d: string) => (abs.has(d) ? 'maladie' : null);
  assertEquals(plageAbsence('2026-10-13', type), { du: '2026-10-12', au: '2026-10-14', jours: 3 });
  assertEquals(plageAbsence('2026-10-20', type), { du: '2026-10-20', au: '2026-10-20', jours: 1 });
});
