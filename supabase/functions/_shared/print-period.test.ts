// Lot 3bis — période imprimée (semaine / jour / mois) et codes des chantiers du mois.
//   npm run test:impression
import {
  absenceCode, addDaysISO, monthStartISO, normalizePeriod, periodDays, periodRange, shiftPeriod, switchKind,
  weekStartISO, withinPeriod, worksiteCodes, type PrintPeriod,
} from './print-period.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
function ok(c: boolean, msg: string) { if (!c) throw new Error(msg); }
const W = (start: string): PrintPeriod => ({ kind: 'week', start });
const D = (start: string): PrintPeriod => ({ kind: 'day', start });
const M = (start: string): PrintPeriod => ({ kind: 'month', start });

Deno.test('semaine : du lundi au dimanche, depuis n’importe quel jour', () => {
  eq(periodDays(W('2026-10-21')), ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'], 'semaine du 21 octobre');
  eq(periodDays(W('2026-12-31')), ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'], 'semaine à cheval sur l’année');
  eq(weekStartISO('2026-10-25'), '2026-10-19', 'dimanche → lundi précédent');
  eq(weekStartISO('2026-10-19'), '2026-10-19', 'lundi → lui-même');
  // Changement d'heure (29 mars et 25 octobre 2026) : 7 jours consécutifs et distincts.
  for (const start of ['2026-03-23', '2026-10-19']) {
    const days = periodDays(W(start));
    eq(days.length, 7, `${start} : 7 jours`);
    eq(new Set(days).size, 7, `${start} : 7 jours distincts`);
    days.slice(1).forEach((d, i) => eq(d, addDaysISO(days[i], 1), `${start} : jours consécutifs`));
  }
  eq(periodDays(W('2026-03-23'))[6], '2026-03-29', 'semaine du passage à l’heure d’été');
  eq(periodDays(W('2026-10-19'))[6], '2026-10-25', 'semaine du passage à l’heure d’hiver');
});

Deno.test('mois : 28 à 31 jours ; jour : un seul', () => {
  eq(periodDays(M('2026-10-01')).length, 31, 'octobre 2026');
  eq(periodDays(M('2026-11-01')).length, 30, 'novembre 2026');
  eq(periodDays(M('2027-02-01')).length, 28, 'février 2027');
  eq(periodDays(M('2028-02-01')).length, 29, 'février 2028 (bissextile)');
  eq(periodDays(M('2026-10-17'))[0], '2026-10-01', 'un mois commence toujours le 1er');
  eq(periodDays(D('2026-10-22')), ['2026-10-22'], 'un jour');
  eq(monthStartISO('2026-10-31'), '2026-10-01', 'début du mois');
  eq(normalizePeriod(M('2026-10-21')), M('2026-10-01'), 'mois remis au 1er');
  eq(normalizePeriod(W('2026-10-21')), W('2026-10-19'), 'semaine remise au lundi');
});

Deno.test('bornes de lecture (incluses)', () => {
  eq(periodRange(W('2026-10-19')), { from: '2026-10-19', to: '2026-10-25' }, 'semaine');
  eq(periodRange(D('2026-10-22')), { from: '2026-10-22', to: '2026-10-22' }, 'jour');
  eq(periodRange(M('2026-10-01')), { from: '2026-10-01', to: '2026-10-31' }, 'mois');
  eq(periodRange(M('2026-12-01')), { from: '2026-12-01', to: '2026-12-31' }, 'décembre');
});

Deno.test('‹ › : semaine ±7 jours, jour ±1, mois ±1 (toujours le 1er)', () => {
  eq(shiftPeriod(W('2026-12-28'), 1), W('2027-01-04'), 'semaine suivante, nouvelle année');
  eq(shiftPeriod(W('2027-01-04'), -1), W('2026-12-28'), 'semaine précédente, année d’avant');
  eq(shiftPeriod(D('2026-12-31'), 1), D('2027-01-01'), 'jour suivant');
  eq(shiftPeriod(M('2026-12-01'), 1), M('2027-01-01'), 'décembre → janvier');
  eq(shiftPeriod(M('2027-01-01'), -1), M('2026-12-01'), 'janvier → décembre');
  eq(shiftPeriod(M('2026-01-31'), 1), M('2026-02-01'), 'depuis un 31 : le 1er du mois suivant, jamais un 3 mars');
  let p = M('2026-10-01');
  for (let i = 0; i < 14; i++) { p = shiftPeriod(p, 1); ok(p.start.endsWith('-01'), `mois +${i + 1} : ${p.start}`); }
});

Deno.test('changer de type de période', () => {
  const CASES: [PrintPeriod, PrintPeriod['kind'], string, PrintPeriod, string][] = [
    [W('2026-10-19'), 'day', '2026-10-21', D('2026-10-21'), 'semaine → jour : aujourd’hui s’il est dedans'],
    [W('2026-10-26'), 'day', '2026-10-21', D('2026-10-26'), 'semaine → jour : sinon le lundi'],
    [W('2026-09-28'), 'month', '2026-10-21', M('2026-10-01'), 'semaine → mois : le mois du jeudi (1er octobre)'],
    [W('2026-10-26'), 'month', '2026-11-01', M('2026-11-01'), 'semaine → mois : le mois d’aujourd’hui (1er novembre)'],
    [W('2026-10-26'), 'month', '2026-10-21', M('2026-10-01'), 'semaine → mois : aujourd’hui hors semaine, jeudi 29 octobre'],
    [M('2026-11-01'), 'week', '2026-10-21', W('2026-11-02'), 'mois → semaine : celle du 1er jeudi (5 novembre)'],
    [M('2026-10-01'), 'week', '2026-10-21', W('2026-10-19'), 'mois → semaine : celle d’aujourd’hui'],
    [M('2026-10-01'), 'week', '2026-12-01', W('2026-09-28'), 'mois → semaine : le 1er est un jeudi'],
    [D('2026-10-22'), 'week', '2026-10-21', W('2026-10-19'), 'jour → semaine : le lundi de ce jour'],
    [D('2026-11-02'), 'month', '2026-10-21', M('2026-11-01'), 'jour → mois : le mois de ce jour'],
    [M('2026-11-01'), 'day', '2026-10-21', D('2026-11-01'), 'mois → jour : le 1er'],
    [M('2026-10-01'), 'day', '2026-10-21', D('2026-10-21'), 'mois → jour : aujourd’hui'],
    [W('2026-10-19'), 'week', '2026-10-21', W('2026-10-19'), 'même type : identique'],
    [D('2026-10-22'), 'day', '2026-10-21', D('2026-10-22'), 'même type : identique'],
    [M('2026-10-01'), 'month', '2026-10-21', M('2026-10-01'), 'même type : identique'],
  ];
  for (const [from, kind, today, want, msg] of CASES) eq(switchKind(from, kind, today), want, msg);
  // Aller-retour semaine → mois → semaine : stable.
  for (const [start, today] of [['2026-10-19', '2026-10-21'], ['2026-11-02', '2026-10-21'], ['2026-09-28', '2026-10-21'], ['2026-12-28', '2026-10-21']]) {
    const m = switchKind(W(start), 'month', today);
    const back = switchKind(m, 'week', today);
    eq(switchKind(back, 'month', today), m, `aller-retour depuis ${start}`);
  }
});

Deno.test('une période dans une autre', () => {
  ok(withinPeriod(D('2026-10-21'), W('2026-10-19')), 'un jour de la semaine');
  ok(!withinPeriod(D('2026-10-26'), W('2026-10-19')), 'un jour hors de la semaine');
  ok(withinPeriod(W('2026-10-19'), W('2026-10-19')), 'la même semaine');
  ok(!withinPeriod(W('2026-10-26'), W('2026-10-19')), 'une autre semaine');
  ok(!withinPeriod(M('2026-10-01'), W('2026-10-19')), 'un mois n’est jamais dans une semaine');
  ok(withinPeriod(W('2026-10-19'), M('2026-10-01')), 'une semaine dans son mois');
});

Deno.test('lettre des absences : C / I / A (maladie) / R / A', () => {
  eq(['conge', 'intemperie', 'maladie', 'repos', null, 'autre'].map(absenceCode), ['C', 'I', 'A', 'R', 'A', 'A'], 'codes');
});

Deno.test('codes des chantiers', () => {
  const titles = ['Villa Exemple', 'Résidence Test', 'Maison Démo', 'Atelier Fictif', 'Formation sécurité', 'Autre', 'Chantier',
    'Maison de la Fontaine', 'Dupont', 'Écurie Bâtiment'];
  const c = worksiteCodes(titles);
  eq(titles.map((t) => c.get(t)), ['VE', 'RT', 'MD', 'AF', 'FS', 'AU', 'CH', 'MF', 'DU', 'ÉB'], 'initiales, mots vides retirés, un seul mot = 2 lettres');
  eq(worksiteCodes(["L'Atelier du Port", 'Rue de la Paix (lot 2)']).get("L'Atelier du Port"), 'AP', 'apostrophe et « du »');
  eq(worksiteCodes(['Rue de la Paix (lot 2)']).get('Rue de la Paix (lot 2)'), 'RPL', '3 mots au plus');
  // Collision : ordre alphabétique, quel que soit l'ordre d'arrivée.
  const a = worksiteCodes(['Villa Exemple', 'Vente Express']), b = worksiteCodes(['Vente Express', 'Villa Exemple', 'Vente Express']);
  eq([a.get('Vente Express'), a.get('Villa Exemple')], ['VE', 'VE2'], 'VE puis VE2');
  eq([...b.entries()], [...a.entries()], 'même résultat dans l’autre ordre (doublons ignorés)');
  eq(worksiteCodes(['']).get(''), '?', 'titre vide');
  const many = Array.from({ length: 14 }, (_, i) => `Bâtiment Central ${String.fromCharCode(65 + i)}`);
  const cm = worksiteCodes(many);
  ok([...cm.values()].every((x) => Array.from(x).length <= 4), `jamais plus de 4 caractères : ${[...cm.values()].join(' ')}`);
  eq(new Set(cm.values()).size, many.length, 'codes tous différents');
});
