import { assertEquals } from 'jsr:@std/assert@1';
import { dureePrevue, hauteursBarres, heuresCourtes, hm, lignesObjectif, plageAbsence, pourcentJauge, prevuSemaine, resumeRelance, totauxSemaine } from './bureau-vue.ts';

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

Deno.test('objectif hebdo : prévu de la semaine, part passée, lignes courtes', () => {
  const dates = ['2026-10-12', '2026-10-13', '2026-10-14'];
  const pv = prevuSemaine(dates, ['a', 'b'], [
    { id: 'p1', user_id: 'a', work_date: '2026-10-12', estimated_start: '08:00', estimated_end: '12:00' },
    { id: 'p2', user_id: 'a', work_date: '2026-10-13', estimated_start: '08:00', estimated_end: '10:00' },
    { id: 'p3', user_id: 'a', work_date: '2026-10-13', estimated_start: '14:00', estimated_end: '18:30' },
    { id: 'p4', user_id: 'a', work_date: '2026-10-14', estimated_start: '08:00', estimated_end: '17:00' },
    { id: 'p5', user_id: 'a', work_date: '2026-10-14', absence_type: 'conge', estimated_start: '08:00', estimated_end: '17:00' },
    { id: 'p6', user_id: 'a', work_date: '2026-10-12', estimated_start: '13:00', estimated_end: '14:00' },
  ], new Set(['p6']), '2026-10-13', '11:00');
  assertEquals(pv.a, { prevu: 240 + 120 + 270 + 540, prevuEcoule: 240 + 120, absences: 1 });
  assertEquals(pv.b, { prevu: 0, prevuEcoule: 0, absences: 0 });
  const absent = lignesObjectif(35, { prevu: 0, prevuEcoule: 0, absences: 5 }, 0);
  assertEquals([absent.prevu, absent.ecartObjectif, absent.ton, absent.pointe], ['Prévu 0 / 35 h', 'absent 5 j', 'absent', null]);
  assertEquals(heuresCourtes(1800), '30 h'); assertEquals(heuresCourtes(450), '7h30'); assertEquals(heuresCourtes(-120), '2 h'); assertEquals(heuresCourtes(45), '45 min'); assertEquals(heuresCourtes(0), '0 h');
  const manque = lignesObjectif(35, { prevu: 1800, prevuEcoule: 1800 }, 1680);
  assertEquals([manque.prevu, manque.ecartObjectif, manque.ton, manque.pointe, manque.ecartPointe], ['Prévu 30 / 35 h', 'manque 5 h', 'manque', 'Pointé 28 h', 'écart −2 h']);
  const dessus = lignesObjectif(17, { prevu: 1200, prevuEcoule: 0 }, 0);
  assertEquals([dessus.prevu, dessus.ecartObjectif, dessus.ton, dessus.pointe], ['Prévu 20 / 17 h', '+ 3 h', 'dessus', null]);
  const pile = lignesObjectif(35, { prevu: 2100, prevuEcoule: 600 }, 630);
  assertEquals([pile.ecartObjectif, pile.ton, pile.ecartPointe], ['objectif atteint', 'atteint', 'écart +30 min']);
  const sans = lignesObjectif(0, { prevu: 450, prevuEcoule: 0 }, 0);
  assertEquals([sans.prevu, sans.ecartObjectif, sans.ton], ['Prévu 7h30', '', null]);
  assertEquals(lignesObjectif(35, { prevu: 1830, prevuEcoule: 0 }, 0).prevu, 'Prévu 30h30 / 35 h');
});
