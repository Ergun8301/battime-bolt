// Lot 5 — statistiques du bureau : règles pures.
//   npm run test:stats
// Les chiffres eux-mêmes (heures, sup, coût) viennent des fonctions existantes
// (weeklyRecap du CSV de paie, my_worksite_labour de « Coût chantiers ») ; ici on
// prouve que les sommes, les périodes, les absences, les journées oubliées (la
// règle du cockpit, qui vit désormais ici), le classement et les barres sont
// justes. L'égalité avec le CSV, « Coût chantiers » et le cockpit sur la vraie
// page est prouvée par scripts/tests/statistiques-lot5.mjs.
import {
  absencesByUser, barWidths, countByUser, dayChunks, distinctUserDays, isFuturePeriod, isoWeek, labourByUser, missingDays,
  missingDaysFrom, mondayOf, periodFor, periodLabel, rankBy, recapByUser, shiftPeriod, sundayOf, wholeWeeks, withIncomplete,
  type Period, type PlanRowLike, type RecapRowLike,
} from './team-stats-core.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
function ok(c: boolean, msg: string) { if (!c) throw new Error(msg); }
const P = (kind: Period['kind'], from: string, to: string): Period => ({ kind, from, to });

// ─── Périodes ────────────────────────────────────────────────────────────────
Deno.test('semaine : lundi → dimanche, y compris à cheval sur deux mois et deux années', () => {
  eq(periodFor('week', '2026-10-21'), P('week', '2026-10-19', '2026-10-25'), 'mercredi 21 octobre');
  eq(periodFor('week', '2026-10-19'), P('week', '2026-10-19', '2026-10-25'), 'lundi : début de sa semaine');
  eq(periodFor('week', '2026-10-25'), P('week', '2026-10-19', '2026-10-25'), 'dimanche : fin de SA semaine (pas de la suivante)');
  eq(periodFor('week', '2026-10-01'), P('week', '2026-09-28', '2026-10-04'), 'semaine septembre / octobre');
  eq(periodFor('week', '2026-12-31'), P('week', '2026-12-28', '2027-01-03'), 'semaine 2026 / 2027');
});

Deno.test('mois : 28, 29, 30 et 31 jours ; année civile', () => {
  eq(periodFor('month', '2026-02-14'), P('month', '2026-02-01', '2026-02-28'), 'février 2026');
  eq(periodFor('month', '2028-02-10'), P('month', '2028-02-01', '2028-02-29'), 'février 2028 (bissextile)');
  eq(periodFor('month', '2026-04-30'), P('month', '2026-04-01', '2026-04-30'), 'avril');
  eq(periodFor('month', '2026-10-21'), P('month', '2026-10-01', '2026-10-31'), 'octobre');
  eq(periodFor('year', '2026-10-21'), P('year', '2026-01-01', '2026-12-31'), 'année');
});

Deno.test('‹ › : période précédente / suivante, et rien dans le futur', () => {
  eq(shiftPeriod(P('month', '2026-01-01', '2026-01-31'), -1), P('month', '2025-12-01', '2025-12-31'), 'janvier ‹ décembre de l’année d’avant');
  eq(shiftPeriod(P('month', '2026-12-01', '2026-12-31'), 1), P('month', '2027-01-01', '2027-01-31'), 'décembre › janvier');
  eq(shiftPeriod(P('month', '2026-03-01', '2026-03-31'), -1), P('month', '2026-02-01', '2026-02-28'), 'mars ‹ février (28 j)');
  eq(shiftPeriod(P('week', '2026-12-28', '2027-01-03'), 1), P('week', '2027-01-04', '2027-01-10'), 'semaine suivante');
  eq(shiftPeriod(P('week', '2026-10-19', '2026-10-25'), -1), P('week', '2026-10-12', '2026-10-18'), 'semaine précédente');
  eq(shiftPeriod(P('year', '2026-01-01', '2026-12-31'), -1), P('year', '2025-01-01', '2025-12-31'), 'année précédente');
  const now = '2026-10-21';
  ok(!isFuturePeriod(periodFor('month', now), now), 'le mois en cours n’est pas futur');
  ok(isFuturePeriod(shiftPeriod(periodFor('month', now), 1), now), 'le mois prochain est futur (› grisé)');
  ok(isFuturePeriod(shiftPeriod(periodFor('week', now), 1), now) && !isFuturePeriod(periodFor('week', now), now), 'semaine : idem');
  ok(isFuturePeriod(shiftPeriod(periodFor('year', now), 1), now), 'année : idem');
});

Deno.test('semaines entières (celles que lit l’export de paie) = lib/week weekStart / weekEnd', () => {
  // Valeurs relevées avec date-fns startOfWeek / endOfWeek (weekStartsOn: 1), figées ici.
  const table: [string, string, string][] = [
    ['2026-10-01', '2026-09-28', '2026-10-04'], ['2026-10-31', '2026-10-26', '2026-11-01'], ['2026-01-01', '2025-12-29', '2026-01-04'],
    ['2026-03-29', '2026-03-23', '2026-03-29'], ['2026-03-30', '2026-03-30', '2026-04-05'], ['2028-02-29', '2028-02-28', '2028-03-05'],
    ['2024-12-31', '2024-12-30', '2025-01-05'], ['2026-10-25', '2026-10-19', '2026-10-25'],
  ];
  for (const [d, mon, sun] of table) eq([mondayOf(d), sundayOf(d)], [mon, sun], `semaine de ${d}`);
  eq(wholeWeeks('2026-10-01', '2026-10-31'), { from: '2026-09-28', to: '2026-11-01' }, 'octobre 2026 → 28/09 – 01/11');
  eq(wholeWeeks('2026-01-01', '2026-12-31'), { from: '2025-12-29', to: '2027-01-03' }, 'année 2026');
  // Propriété sur 3 ans : un lundi, au plus 6 jours avant, et le dimanche 6 jours après.
  for (let t = Date.UTC(2025, 0, 1); t < Date.UTC(2028, 0, 1); t += 86400000) {
    const d = new Date(t).toISOString().slice(0, 10);
    const m = mondayOf(d);
    const gap = (Date.parse(`${d}T00:00:00Z`) - Date.parse(`${m}T00:00:00Z`)) / 86400000;
    if (new Date(`${m}T00:00:00Z`).getUTCDay() !== 1 || gap < 0 || gap > 6) throw new Error(`lundi faux pour ${d} : ${m}`);
  }
});

Deno.test('tranches de lecture : contiguës, sans recouvrement, ≤ 31 jours, couvrent tout', () => {
  for (const [from, to] of [['2025-12-29', '2027-01-03'], ['2026-09-28', '2026-11-01'], ['2026-10-19', '2026-10-25'], ['2026-10-21', '2026-10-21']]) {
    const c = dayChunks(from, to);
    eq(c[0].from, from, `${from}→${to} : commence au début`);
    eq(c[c.length - 1].to, to, `${from}→${to} : finit à la fin`);
    let days = 0;
    for (let i = 0; i < c.length; i++) {
      const n = (Date.parse(`${c[i].to}T00:00:00Z`) - Date.parse(`${c[i].from}T00:00:00Z`)) / 86400000 + 1;
      ok(n >= 1 && n <= 31, `tranche ${c[i].from}→${c[i].to} : ${n} jours`);
      days += n;
      if (i > 0) eq(Date.parse(`${c[i].from}T00:00:00Z`) - Date.parse(`${c[i - 1].to}T00:00:00Z`), 86400000, 'contiguës');
    }
    eq(days, (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1, `${from}→${to} : tous les jours, une fois`);
  }
  eq(dayChunks('2025-12-29', '2027-01-03').length, 12, 'année 2026 en semaines entières : 371 jours → 12 tranches');
});

Deno.test('libellés : « S-43 · 19–25 oct. », « octobre 2026 », « 2026 »', () => {
  eq(isoWeek('2026-10-21'), 43, 'semaine ISO 43');
  eq(isoWeek('2026-01-01'), 1, '1er janvier 2026 (jeudi) : semaine 1');
  eq(isoWeek('2027-01-01'), 53, '1er janvier 2027 (vendredi) : semaine 53 de 2026');
  eq(isoWeek('2021-01-03'), 53, '3 janvier 2021 (dimanche) : semaine 53 de 2020');
  eq(periodLabel(periodFor('week', '2026-10-21')), 'S-43 · 19–25 oct.', 'semaine');
  eq(periodLabel(periodFor('week', '2026-10-01')), 'S-40 · 28 sept. – 4 oct.', 'semaine à cheval');
  eq(periodLabel(periodFor('month', '2026-10-21')), 'octobre 2026', 'mois');
  eq(periodLabel(periodFor('month', '2026-02-01')), 'février 2026', 'mois accentué');
  eq(periodLabel(periodFor('year', '2026-10-21')), '2026', 'année');
});

// ─── Journées oubliées : la règle du cockpit ─────────────────────────────────
Deno.test('missingDays / withIncomplete : passés seulement, envoyés exclus, plus récent d’abord, sans doublon', () => {
  const today = '2026-10-21';
  eq(missingDays(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-19'], new Set(['2026-10-20']), today), ['2026-10-19'],
    'aujourd’hui et demain : pas encore en retard ; le 20 envoyé ; le 19 une seule fois');
  eq(withIncomplete(['2026-10-19'], ['2026-10-15', '2026-10-19', '2026-10-21'], today), ['2026-10-19', '2026-10-15'],
    'sortie oubliée : ajoutée si passée, sans doublon, aujourd’hui exclu');
});

Deno.test('missingDaysFrom = l’assemblage du cockpit (absences, cases retirées, sorties oubliées, ORDRE de la Map)', () => {
  const today = '2026-10-21';
  const plan: PlanRowLike[] = [
    { id: 'p1', user_id: 'b', work_date: '2026-10-19' },                         // B : planifié, rien envoyé → oublié
    { id: 'p2', user_id: 'a', work_date: '2026-10-19' },                         // A : envoyé → rien
    { id: 'p3', user_id: 'a', work_date: '2026-10-20' },                         // A : retiré par le salarié → rien
    { id: 'p4', user_id: 'a', work_date: '2026-10-20' },                         // … mais une autre case le même jour → réclamée
    { id: 'p5', user_id: 'b', work_date: '2026-10-16' },                         // B : jour d'absence → rien
    { id: 'p6', user_id: 'b', work_date: '2026-10-16', absence_type: 'conge' },
    { id: 'p7', user_id: 'b', work_date: '2026-10-21' },                         // aujourd'hui : pas encore
    { id: 'p8', user_id: 'c', work_date: '2026-10-15' },                         // C : retiré, seul → rien
    { id: 'p9', user_id: 'a', work_date: '2026-10-14', absence_type: 'maladie' },
  ];
  const miss = missingDaysFrom({
    planRows: plan,
    declaredRows: [{ user_id: 'a', work_date: '2026-10-19' }, { user_id: 'c', work_date: '2026-10-01' }],
    withdrawnIds: new Set(['p3', 'p8']),
    incompleteRows: [{ user_id: 'd', work_date: '2026-10-13' }, { user_id: 'b', work_date: '2026-10-12' }, { user_id: 'e', work_date: '2026-10-21' }],
    today,
  });
  eq(Array.from(miss.entries()), [
    ['b', ['2026-10-19', '2026-10-12']],
    ['a', ['2026-10-20']],
    ['d', ['2026-10-13']],
    ['e', []], // comme le cockpit : une sortie oubliée d'aujourd'hui laisse une entrée vide
  ], 'jours et ordre identiques au cockpit');
});

// ─── Absences ────────────────────────────────────────────────────────────────
Deno.test('absences : jours distincts par type, week-end compris, à venir à part, hors période ignorés', () => {
  const rows: PlanRowLike[] = [
    { id: '1', user_id: 'u', work_date: '2026-10-03', absence_type: 'conge' },      // samedi
    { id: '2', user_id: 'u', work_date: '2026-10-04', absence_type: 'conge' },      // dimanche
    { id: '3', user_id: 'u', work_date: '2026-10-04', absence_type: 'conge' },      // doublon
    { id: '4', user_id: 'u', work_date: '2026-10-05', absence_type: 'maladie' },
    { id: '5', user_id: 'u', work_date: '2026-10-06', absence_type: 'intemperie' },
    { id: '6', user_id: 'u', work_date: '2026-10-21', absence_type: 'conge' },      // aujourd'hui : compte
    { id: '7', user_id: 'u', work_date: '2026-10-22', absence_type: 'conge' },      // demain : à venir
    { id: '8', user_id: 'u', work_date: '2026-10-23', absence_type: 'conge' },
    { id: '9', user_id: 'u', work_date: '2026-09-30', absence_type: 'conge' },      // hors période
    { id: '10', user_id: 'u', work_date: '2026-10-07' },                            // un chantier, pas une absence
    { id: '11', user_id: 'v', work_date: '2026-10-08', absence_type: 'repos' },
    { id: '12', user_id: 'v', work_date: '2026-10-08', absence_type: 'maladie' },   // deux absences le même jour : 1 jour
  ];
  const a = absencesByUser(rows, '2026-10-01', '2026-10-31', '2026-10-21');
  eq(a.get('u'), { conge: 3, maladie: 1, intemperie: 1, autre: 0, total: 5, upcoming: 2 }, 'salarié u');
  eq(a.get('v'), { conge: 0, maladie: 1, intemperie: 0, autre: 1, total: 1, upcoming: 0 }, 'salarié v : total en jours distincts');
  const sep = absencesByUser(rows, '2026-09-01', '2026-09-30', '2026-10-21');
  eq(sep.get('u')?.total, 1, 'septembre : le 30 seulement');
});

// ─── Heures, sup, coût : les sommes des fonctions existantes ─────────────────
Deno.test('heures et sup = Σ des lignes du CSV de paie (« Total heures », « Heures sup 25 % » + « 50 % »)', () => {
  // Ce que weeklyRecap sort pour octobre (payPeriod 01/10 → 31/10) quand un salarié fait 5 × 9 h
  // la semaine du 28/09 (base 35 h) : la SEMAINE classe (35 h normales, 8 h à 25 %, 2 h à 50 %),
  // seuls jeudi 1er et vendredi 2 comptent en octobre ; lundi → mercredi sont payés en septembre.
  const oct: RecapRowLike[] = [
    { userId: 'u', minutes: 1080, normalMinutes: 480, overtime1Minutes: 480, overtime2Minutes: 120, routeMinutes: 0, base: 35 },
    { userId: 'u', minutes: 2400, normalMinutes: 2100, overtime1Minutes: 300, overtime2Minutes: 0, routeMinutes: 45, base: 35 },
    { userId: 'z', minutes: 420, normalMinutes: 0, overtime1Minutes: 420, overtime2Minutes: 0, routeMinutes: 0, base: 0 },
  ];
  const sep: RecapRowLike[] = [{ userId: 'u', minutes: 1620, normalMinutes: 1620, overtime1Minutes: 0, overtime2Minutes: 0, routeMinutes: 0, base: 35 }];
  const r = recapByUser(oct);
  eq(r.get('u'), { minutes: 3480, normal: 2580, t1: 780, t2: 120, route: 45, base: 35 }, 'salarié u, octobre');
  eq(r.get('z'), { minutes: 420, normal: 0, t1: 420, t2: 0, route: 0, base: 0 }, 'base 0 h : tout en sup (réglage volontaire)');
  // La semaine du 28/09 coupée en deux mois redonne la semaine entière (additivité, comme l'export).
  const week = recapByUser([oct[0], ...sep]).get('u')!;
  eq([week.minutes, week.normal, week.t1, week.t2], [2700, 2100, 480, 120], 'septembre + octobre = la semaine entière : 45 h = 35 + 8 + 2');
});

Deno.test('coût = « Main d’œuvre » de Coût chantiers : Σ des lignes chantier × salarié, taux manquant signalé', () => {
  const rows = [
    { user_id: 'u', worksite_id: 'w1', paid_minutes: 600, route_minutes: 30, cost: '150.00', unpriced_minutes: 0 },
    { user_id: 'u', worksite_id: 'w2', paid_minutes: 120, route_minutes: 0, cost: 30, unpriced_minutes: 0 },
    { user_id: 'v', worksite_id: 'w1', paid_minutes: 300, route_minutes: 0, cost: 0, unpriced_minutes: 300 },
  ];
  const l = labourByUser(rows);
  eq(l.get('u'), { paid: 720, route: 30, cost: 180, unpriced: 0, priced: true }, 'salarié chiffré (numeric en chaîne accepté)');
  eq(l.get('v'), { paid: 300, route: 0, cost: 0, unpriced: 300, priced: false }, 'sans taux horaire : « à renseigner »');
  let total = 0; l.forEach((x) => { total += x.cost; });
  eq(total, rows.reduce((s, r) => s + Number(r.cost), 0), 'Σ par salarié = Σ des lignes (le total de Coût chantiers)');
});

Deno.test('renvois : jours distincts ; relances : une ligne = une relance', () => {
  const d = distinctUserDays([
    { user_id: 'u', work_date: '2026-10-05' }, { user_id: 'u', work_date: '2026-10-05' }, { user_id: 'u', work_date: '2026-10-05' },
    { user_id: 'u', work_date: '2026-10-06' }, { user_id: 'u', work_date: '2026-11-01' },
  ], '2026-10-01', '2026-10-31');
  eq(d.get('u'), 2, '3 lignes le même jour = 1 jour ; novembre hors période');
  eq(Array.from(countByUser([{ user_id: 'u' }, { user_id: 'v' }, { user_id: 'u' }]).entries()), [['u', 2], ['v', 1]], 'relances par salarié');
});

// ─── Classement et barres ────────────────────────────────────────────────────
Deno.test('classement : décroissant, égalité par nom (français), rangs 1, 1, 3, zéro sans rang et en dernier', () => {
  const rows = [
    { name: 'Emma Test', v: 20 }, { name: 'Bruno Essai', v: 5 }, { name: 'Élodie Démo', v: 20 },
    { name: 'Zoé Zéro', v: 0 }, { name: 'Alex Exemple', v: 0 }, { name: 'Chris Test', v: 12 },
  ];
  const r = rankBy(rows, (x) => x.v, (x) => x.name);
  eq(r.map((x) => [x.row.name, x.rank]), [
    ['Élodie Démo', 1], ['Emma Test', 1], ['Chris Test', 3], ['Bruno Essai', 4], ['Alex Exemple', null], ['Zoé Zéro', null],
  ], 'ordre et rangs');
});

Deno.test('barres : % du plus grand, tout à 0 si rien, au moins 2 % pour une petite valeur', () => {
  eq(barWidths([0, 0]), [0, 0], 'rien');
  eq(barWidths([]), [], 'vide');
  eq(barWidths([50, 25, 0]), [100, 50, 0], 'proportionnel');
  eq(barWidths([10000, 1]), [100, 2], 'petite valeur visible');
});
