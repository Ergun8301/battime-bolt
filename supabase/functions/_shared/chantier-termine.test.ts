// Chantier terminé + bilan (lot 23, oct. 2026) : règles pures.
//   npm run test:chantier-termine
import {
  budgetProgress, buildBilan, checkCompletionDate, choosableWorksites, completedDay, completionUi, countDrafts, countUpcoming, COUNTED,
  EXPENSE_CATEGORIES, EXPENSE_LABEL, finishButtonLabel, finishWarnings, fmtEur, fmtH, frDate, hasCompletionColumn, isCountedStatus,
  isWorksiteFinished, termineLe, todayParis, type BilanEntry, type LabourRow,
  canFinishWorksite, isOtherWorksite, OTHER_WORKSITE_NAME,
} from './chantier-termine.ts';
import { DOC_CATEGORY_NAMES } from './doc-categories.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
function ok(c: boolean, msg: string) { if (!c) throw new Error(msg); }
const read = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));

Deno.test('statut : terminé / en cours / colonne absente', () => {
  eq(hasCompletionColumn({ completed_at: null }), true, 'colonne présente, vide');
  eq(hasCompletionColumn({ completed_at: '2026-10-12T12:00:00+00:00' }), true, 'colonne présente, remplie');
  eq(hasCompletionColumn({}), false, 'colonne absente (migration pas appliquée) → la fonction reste cachée');
  eq(hasCompletionColumn(null), false, 'pas de chantier');
  eq(isWorksiteFinished({ completed_at: '2026-10-12T12:00:00+00:00' }), true, 'terminé');
  eq(isWorksiteFinished({ completed_at: null }), false, 'en cours');
  eq(isWorksiteFinished({}), false, 'colonne absente = en cours');
  eq(isWorksiteFinished(undefined), false, 'undefined');
});

Deno.test('le jour de fin se lit pareil que la base soit en timestamptz UTC ou en date', () => {
  eq(completedDay({ completed_at: '2026-10-12T12:00:00+00:00' }), '2026-10-12', 'timestamptz à midi UTC');
  eq(completedDay({ completed_at: '2026-10-12T12:00:00' }), '2026-10-12', 'sans fuseau');
  eq(completedDay({ completed_at: '2026-10-12' }), '2026-10-12', 'colonne de type date');
  eq(completedDay({ completed_at: null }), null, 'vide');
  eq(completedDay({ completed_at: 'n’importe quoi' }), null, 'illisible → pas de jour (jamais de date inventée)');
  eq(frDate('2026-10-13'), '13 octobre 2026', 'date en français');
  eq(frDate('2026-01-01'), '1 janvier 2026', 'pas de « 1er » (comme date-fns/fr)');
  eq(frDate('2026-08-05'), '5 août 2026', 'accent');
  eq(termineLe({ completed_at: '2026-10-12T12:00:00+00:00' }), 'Terminé le 12 octobre 2026', '« Terminé le … »');
  eq(termineLe({ completed_at: '2026-10-12T12:00:00+00:00' }, true), 'Terminé le 12/10/2026', 'version courte');
  eq(termineLe({ completed_at: null }), null, 'en cours → rien à afficher');
  eq(termineLe({}), null, 'colonne absente → rien à afficher');
});

Deno.test('date de fin : valide, jamais dans le futur', () => {
  const today = '2026-10-13';
  eq(checkCompletionDate('2026-10-13', today), null, 'aujourd’hui : ok');
  eq(checkCompletionDate('2026-10-01', today), null, 'dans le passé : ok');
  eq(checkCompletionDate('2026-10-14', today), 'La date de fin ne peut pas être dans le futur.', 'demain : refusé');
  eq(checkCompletionDate('2027-01-01', today), 'La date de fin ne peut pas être dans le futur.', 'l’an prochain : refusé');
  for (const bad of ['', '13/10/2026', '2026-13-01', '2026-02-30', '2026-00-10', '1999-12-31', 'abc']) eq(checkCompletionDate(bad, today), 'Date invalide.', `« ${bad} » : invalide`);
  eq(checkCompletionDate('2024-02-29', today), null, '29 février bissextile : ok');
  eq(checkCompletionDate('2026-02-29', today), 'Date invalide.', '29 février non bissextile : invalide');
  // Aujourd'hui à Paris, pas celui du fuseau de la machine : 23 h 30 UTC le 13 = 01 h 30 le 14 à Paris (été).
  eq(todayParis(new Date('2026-10-13T23:30:00Z')), '2026-10-14', 'minuit passé à Paris');
  eq(todayParis(new Date('2026-10-13T10:00:00Z')), '2026-10-13', 'en pleine journée');
  ok(/^\d{4}-\d{2}-\d{2}$/.test(todayParis()), 'format AAAA-MM-JJ');
});

Deno.test('listes de choix du salarié : les terminés sont retirés, sauf demande expresse', () => {
  const l = [{ id: 'a', completed_at: null }, { id: 'b', completed_at: '2026-10-12T12:00:00+00:00' }, { id: 'c' }, { id: 'd', completed_at: '2026-09-01T12:00:00+00:00' }];
  eq(choosableWorksites(l).map((w) => w.id), ['a', 'c'], 'seuls les chantiers en cours (colonne vide ou absente)');
  eq(choosableWorksites(l, ['d']).map((w) => w.id), ['a', 'c', 'd'], 'le chantier déjà choisi reste');
  eq(choosableWorksites([] as { id: string }[]).length, 0, 'liste vide');
  eq(l.length, 4, 'la liste d’origine n’est pas modifiée (les noms restent affichables partout ailleurs)');
});

Deno.test('« Autre » (travail non prévu) reste TOUJOURS proposé, même marqué terminé, et ne se termine pas', () => {
  eq(OTHER_WORKSITE_NAME, 'Autre', 'le nom que la base crée pour chaque entreprise (ensure_other_worksite)');
  const l = [{ id: 'x', client_name: 'Autre', completed_at: '2026-10-12T12:00:00+00:00' }, { id: 'y', client_name: 'Villa', completed_at: '2026-10-12T12:00:00+00:00' }, { id: 'z', client_name: 'Autre', completed_at: null }];
  eq(choosableWorksites(l).map((w) => w.id), ['x', 'z'], '« Autre » terminé par erreur reste dans les choix ; un vrai chantier terminé en sort');
  eq(choosableWorksites(l, [], '2026-10-20').map((w) => w.id), ['x', 'z'], 'même pour un jour postérieur à sa « fin »');
  eq([isOtherWorksite({ client_name: 'Autre' }), isOtherWorksite({ client_name: 'Autres' }), isOtherWorksite({ client_name: 'autre' }), isOtherWorksite({}), isOtherWorksite(null)], [true, false, false, false, false], 'reconnu comme le reste du code : nom exact « Autre »');
  eq([canFinishWorksite({ client_name: 'Autre' }), canFinishWorksite({ client_name: 'Villa Dupont' }), canFinishWorksite({})], [false, true, true], 'le bloc « Terminer » n’existe pas pour « Autre »');
});

Deno.test('un chantier terminé reste proposé pour un jour qui n’est pas APRÈS sa fin (saisie d’un jour oublié, jour passé du chef d’équipe)', () => {
  const fin = { id: 'f', completed_at: '2026-10-09T12:00:00+00:00' };
  eq(choosableWorksites([fin], [], '2026-10-08').length, 1, 'la veille de la fin : proposé');
  eq(choosableWorksites([fin], [], '2026-10-09').length, 1, 'le jour même de la fin : proposé (fin >= jour affiché)');
  eq(choosableWorksites([fin], [], '2026-10-10').length, 0, 'le lendemain : plus proposé');
  eq(choosableWorksites([fin], [], '2026-12-01').length, 0, 'bien après : plus proposé');
  eq(choosableWorksites([fin]).length, 0, 'sans jour précisé : comportement d’avant (retiré)');
  eq(choosableWorksites([fin], ['f'], '2026-12-01').length, 1, 'et le chantier déjà coché reste, quel que soit le jour');
  eq(choosableWorksites([{ id: 'g', completed_at: 'illisible' }], [], '2026-10-01').length, 0, 'une date de fin illisible ne rend pas le chantier proposé par accident');
  eq(choosableWorksites([{ id: 'h', completed_at: null }], [], '2026-12-01').length, 1, 'un chantier en cours l’est pour tous les jours');
});

Deno.test('qui voit quoi : sans la migration rien ; en mode support aucun bouton d’écriture', () => {
  eq(completionUi({ ready: false, hasColumn: true, supportMode: false }), { bilan: false, write: false }, 'fonction absente → tout caché');
  eq(completionUi({ ready: true, hasColumn: false, supportMode: false }), { bilan: false, write: false }, 'colonne absente → tout caché');
  eq(completionUi({ ready: true, hasColumn: true, supportMode: false }), { bilan: true, write: true }, 'bureau normal');
  eq(completionUi({ ready: true, hasColumn: true, supportMode: true }), { bilan: true, write: false }, 'support : le bilan se lit, rien ne s’écrit');
});

Deno.test('avertissements : quatre, dans l’ordre, jamais un blocage', () => {
  eq(finishWarnings({ reserves: 0, live: 0, drafts: 0, future: 0 }), [], 'rien à signaler');
  eq(finishButtonLabel([]), 'Terminer le chantier', 'bouton simple');
  const w = finishWarnings({ reserves: 2, live: 1, drafts: 3, future: 4 });
  eq(w.map((x) => x.key), ['reserves', 'live', 'drafts', 'future'], 'ordre de la demande');
  eq(w.map((x) => x.title), ['2 réserves non levées', '1 pointage en cours', '3 brouillons non envoyés', '4 interventions planifiées à venir'], 'titres, pluriels');
  eq(finishWarnings({ reserves: 1, live: 2, drafts: 1, future: 1 }).map((x) => x.title), ['1 réserve non levée', '2 pointages en cours', '1 brouillon non envoyé', '1 intervention planifiée à venir'], 'singuliers');
  eq(finishButtonLabel(w), 'Terminer quand même', 'avec avertissement : « Terminer quand même »');
  ok(w.every((x) => x.detail.length > 10), 'chaque avertissement explique ce qui se passe');
  eq(w.map((x) => x.detail.split(' ')[0]), ['Elles', 'Il', 'Ces', 'Elles'], 'le détail s’accorde (2 réserves, 1 pointage, 3 brouillons, 4 interventions)');
  eq(finishWarnings({ reserves: 1, live: 1, drafts: 1, future: 1 }).map((x) => x.detail.split(' ')[0]), ['Elle', 'Il', 'Ces', 'Elle'], 'et tout au singulier');
  eq(finishWarnings({ reserves: 0, live: 3, drafts: 0, future: 0 })[0].detail.split(' ')[0], 'Ils', 'plusieurs pointages : « Ils continuent »');
  eq(finishWarnings({ reserves: 0, live: 0, drafts: 2, future: 0 }).map((x) => x.key), ['drafts'], 'un seul avertissement possible');
});

Deno.test('comptage : brouillons (vides ignorés), interventions à venir (absences ignorées, aujourd’hui déjà fait ignoré)', () => {
  eq(countDrafts([
    { status: 'draft', total_minutes: 240 }, { status: 'draft', total_minutes: 0 }, { status: 'submitted', total_minutes: 480 },
    { status: 'cancelled', total_minutes: 60 }, { status: 'draft', total_minutes: 15 },
  ]), 2, 'deux brouillons non vides');
  const plan = [
    { id: 'p1', work_date: '2026-10-12' }, // hier
    { id: 'p2', work_date: '2026-10-13' }, // aujourd'hui, déjà pointée
    { id: 'p3', work_date: '2026-10-13' }, // aujourd'hui, à faire
    { id: 'p4', work_date: '2026-10-14' }, // demain
    { id: 'p5', work_date: '2026-10-20', absence_type: 'conge' }, // une absence n'est pas une intervention
    { id: 'p6', work_date: '2026-11-02', absence_type: null },
  ];
  eq(countUpcoming(plan, '2026-10-13', ['p2']), 3, 'p3, p4 et p6');
  eq(countUpcoming(plan, '2026-10-13'), 4, 'sans information sur aujourd’hui : p2 compte aussi');
  eq(countUpcoming([], '2026-10-13'), 0, 'rien');
});

Deno.test('mêmes règles que Coût chantiers : formats et pourcentage de budget', () => {
  eq(fmtH(0), '0 h', '0');
  eq(fmtH(480), '8 h', '8 h pile');
  eq(fmtH(510), '8 h 30', '8 h 30');
  eq(fmtH(65), '1 h 05', 'minutes sur deux chiffres');
  eq(fmtEur(1234.56).replace(/\s/g, ' '), '1 235 €', 'arrondi à l’euro, séparateur français');
  eq(fmtEur(0), '0 €', '0');
  eq(budgetProgress({ hours: null, amount: null, usedMinutes: 600, usedCost: 100 }), null, 'pas de budget');
  eq(budgetProgress({ hours: 0, amount: 0, usedMinutes: 600, usedCost: 100 }), null, 'budget à zéro = pas de suivi');
  const a = budgetProgress({ hours: 10, amount: null, usedMinutes: 420, usedCost: 0 })!;
  eq([Math.round(a.pct), a.tone, a.label], [70, 'soft', '7 h / 10 h'], '70 % → jaune');
  eq(budgetProgress({ hours: 10, amount: null, usedMinutes: 480, usedCost: 0 })!.tone, 'warn', '80 % → orange');
  eq(budgetProgress({ hours: 10, amount: null, usedMinutes: 600, usedCost: 0 })!.tone, 'over', '100 % → rouge');
  eq(budgetProgress({ hours: 10, amount: null, usedMinutes: 300, usedCost: 0 })!.tone, '', '50 % → vert');
  const both = budgetProgress({ hours: 10, amount: 1000, usedMinutes: 300, usedCost: 900 })!;
  eq([Math.round(both.pct), both.tone], [90, 'warn'], 'le plus avancé des deux (euros ici)');
  eq(both.label.replace(/\s/g, ' '), '5 h / 10 h', 'l’étiquette suit les heures quand il y en a');
  const eurOnly = budgetProgress({ hours: null, amount: 1500, usedMinutes: 600, usedCost: 1200 })!;
  eq(eurOnly.label.replace(/\s/g, ' '), '1 200 € / 1 500 €', 'étiquette en euros sans budget d’heures');
  eq(COUNTED, ['submitted', 'validated'], 'statuts qui comptent');
  eq([isCountedStatus('submitted'), isCountedStatus('validated'), isCountedStatus('draft'), isCountedStatus('cancelled'), isCountedStatus(null)], [true, true, false, false, false], 'brouillon et retirée ne comptent pas');
});

Deno.test('copies de règles : identiques à celles du reste du projet (lues dans les fichiers)', () => {
  // lib/status.ts : COUNTED_STATUSES
  const status = read('../../../lib/status.ts');
  const m = /COUNTED_STATUSES\s*=\s*\[([^\]]*)\]/.exec(status);
  ok(!!m, 'COUNTED_STATUSES trouvé');
  eq((m![1].match(/'([^']+)'/g) || []).map((x) => x.slice(1, -1)), [...COUNTED], 'COUNTED = lib/status.ts');
  // Dépenses : mêmes catégories et mêmes mots que la contrainte de la base
  const mig = read('../../migrations/20260920210000_etape13_cout_chantier.sql');
  const inList = /CHECK \(category IN \(([^)]*)\)\)/.exec(mig);
  ok(!!inList, 'contrainte de catégorie trouvée');
  eq((inList![1].match(/'([^']+)'/g) || []).map((x) => x.slice(1, -1)), EXPENSE_CATEGORIES.map((c) => c.key), 'catégories de dépenses = contrainte de la base');
  // cost-report.tsx importe les formules partagées au lieu d'en garder une copie
  const cost = read('../../../components/cost-report.tsx');
  ok(/from '@\/supabase\/functions\/_shared\/chantier-termine'/.test(cost), 'cost-report importe chantier-termine');
  ok(/budgetProgress\(/.test(cost) && /fmtH/.test(cost) && /fmtEur/.test(cost), 'cost-report appelle budgetProgress, fmtH et fmtEur');
  ok(!/const fmtH\s*=/.test(cost) && !/const fmtEur\s*=/.test(cost), 'cost-report ne redéfinit plus fmtH / fmtEur');
  // Les libellés de dépenses affichés par Coût chantiers
  for (const c of EXPENSE_CATEGORIES) ok(cost.includes(`'${c.key}'`) || cost.includes(`EXPENSE_CATEGORIES`), `Coût chantiers connaît ${c.key}`);
  eq(EXPENSE_LABEL, { materiaux: 'Matériaux', sous_traitance: 'Sous-traitance', location: 'Location', autre: 'Divers' }, 'libellés');
  // Réserve levée : UNE définition (lib/reserves.ts), jamais redéfinie ici
  const chantier = read('./chantier-termine.ts');
  ok(!/reserve_resolved_at|reserve_fixed_at/.test(chantier), 'chantier-termine ne redéfinit pas « réserve levée »');
  const lib = read('../../../lib/chantier-termine.ts');
  ok(/isReserveLifted/.test(lib), 'lib/chantier-termine.ts utilise isReserveLifted (lib/reserves.ts)');
  ok(/my_worksite_labour/.test(lib), 'les heures viennent de my_worksite_labour');
  ok(!/total_minutes\s*[*+]|\/\s*60/.test(lib), 'lib/chantier-termine.ts ne recalcule aucune heure');
  // La fonction de coût est lue PAGINÉE (plafond de 1000 lignes de l'API, sans erreur) et triée, comme lib/team-stats.ts.
  ok(/my_worksite_labour[^\n]*\n?\s*\.order\('user_id'\)\.order\('worksite_id'\)\.range\(/.test(lib), 'lib/chantier-termine.ts : my_worksite_labour est lue paginée et triée (order user_id, worksite_id, range)');
  ok(/fetchAllPaged<LabourRow>/.test(lib) && /namesUnavailable/.test(lib), 'les noms illisibles sont signalés (namesUnavailable), pas répétés « Salarié » en silence');
  // Le bloc de la fiche : « Autre » ne se termine pas, et la fonction « prête » n'est interrogée que si la colonne est là.
  const bar = read('../../../components/chantier-termine-bar.tsx');
  ok(/canFinishWorksite\(worksite\)/.test(bar) && /if \(!hasColumn\) return;/.test(bar), 'le bloc de la fiche : pas de « Terminer » pour « Autre », pas de requête sans la colonne');
  // Les listes de choix reçoivent le JOUR affiché.
  ok(/choosableWorksites\(sortedWorksites, \[fWorksiteId\], date\)/.test(read('../../../components/poseur-day.tsx')), 'poseur-day passe le jour affiché au filtre');
  const td = read('../../../components/team-day.tsx');
  ok((td.match(/choosableWorksites\([^)]*, day\)/g) || []).length === 2, 'team-day passe le jour au filtre (liste ET chantier par défaut)');
});

// ── Un jeu de données fictif complet ────────────────────────────────────────────

const WS = 'ws-1';
const names = { sam: 'Sam Girard', alex: 'Alex Roux', lea: 'Léa Petit' };
// Lignes de my_worksite_labour : toute la vie de l'entreprise (deux chantiers), comme cost-report les lit.
const labour: LabourRow[] = [
  { worksite_id: WS, user_id: 'sam', worked_minutes: 960, route_minutes: 60, paid_minutes: 1020, cost: 408, unpriced_minutes: 0 },
  { worksite_id: WS, user_id: 'alex', worked_minutes: 480, route_minutes: 0, paid_minutes: 480, cost: 0, unpriced_minutes: 480 },
  { worksite_id: 'ws-2', user_id: 'sam', worked_minutes: 600, route_minutes: 0, paid_minutes: 600, cost: 240, unpriced_minutes: 0 },
];
const entries: BilanEntry[] = [
  { id: 'e1', user_id: 'sam', work_date: '2026-09-14', status: 'submitted', total_minutes: 480, reception: 'en_cours' },
  { id: 'e2', user_id: 'sam', work_date: '2026-09-15', status: 'validated', total_minutes: 480, reception: 'avec', lifted: false, observation: 'Joint à reprendre côté cuisine' },
  { id: 'e3', user_id: 'alex', work_date: '2026-10-02', status: 'submitted', total_minutes: 480, reception: 'avec', lifted: true, observation: 'Rayure vitre' },
  { id: 'e4', user_id: 'lea', work_date: '2026-10-05', status: 'draft', total_minutes: 180 },
  { id: 'e5', user_id: 'lea', work_date: '2026-10-06', status: 'draft', total_minutes: 0 },
  { id: 'e6', user_id: 'sam', work_date: '2026-10-07', status: 'cancelled', total_minutes: 480, reception: 'avec', lifted: false },
  { id: 'e7', user_id: 'sam', work_date: '2026-10-08', status: 'draft', total_minutes: 60, reception: 'avec', lifted: false }, // brouillon : pas une réserve pour le bureau
];
const expenses = [
  { category: 'materiaux', amount: 820.5 }, { category: 'materiaux', amount: 179.5 }, { category: 'location', amount: 150 },
  { category: 'autre', amount: -50 }, // un avoir
];
const docs = [
  { category: 'devis' }, { category: 'facture' }, { category: 'facture_payee' }, { category: 'photo' }, { category: 'photo' }, { category: 'reserve' },
  { category: null }, { category: 'pv_reception' },
];

Deno.test('bilan : les heures sont celles de my_worksite_labour, par salarié, brouillons à part', () => {
  const b = buildBilan({ worksiteId: WS, completedDay: '2026-10-09', labour, entries, names, expenses, docs, budget: { hours: 30, amount: 600 }, office: true });
  // Les heures : exactement la somme des lignes de CE chantier (Coût chantiers fait la même somme, champ par champ).
  eq(b.hours.paidMinutes, 1020 + 480, 'heures comptées = somme des paid_minutes du chantier (l’autre chantier n’y est pas)');
  eq(b.hours.routeMinutes, 60, 'dont route payée');
  eq(b.hours.cost, 408, 'coût de main-d’œuvre');
  eq(b.hours.unpricedMinutes, 480, 'minutes sans taux horaire : le coût est annoncé incomplet');
  eq(b.hours.workers.map((w) => [w.name, w.paidMinutes, w.routeMinutes, w.draftMinutes]), [['Sam Girard', 1020, 60, 60], ['Alex Roux', 480, 0, 0], ['Léa Petit', 0, 0, 180]], 'par salarié, le plus d’heures d’abord ; Léa n’a que du brouillon');
  eq(b.hours.draftMinutes, 240, 'brouillons : 180 + 60 (le brouillon vide et la ligne retirée ne comptent pas)');
  eq(b.hours.paidMinutes, 1500, 'les brouillons (240 min) ne sont JAMAIS ajoutés aux heures comptées');
  eq(b.hours.workers.reduce((s, w) => s + w.paidMinutes, 0), b.hours.paidMinutes, 'la somme par salarié = le total');
  // Période : les interventions qui comptent, et la date de fin.
  eq(b.period, { first: '2026-09-14', last: '2026-10-02', completed: '2026-10-09' }, 'première et dernière intervention comptées, date de fin');
});

Deno.test('bilan : dépenses, réserves, documents, budget', () => {
  const b = buildBilan({ worksiteId: WS, completedDay: null, labour, entries, names, expenses, docs, budget: { hours: 30, amount: 600 }, office: true });
  eq(b.expenses.total, 1100, 'dépenses : 820,50 + 179,50 + 150 − 50 (avoir)');
  eq(b.expenses.count, 4, '4 lignes');
  eq(b.expenses.byCategory.map((c) => [c.key, c.label, c.total, c.count]), [['materiaux', 'Matériaux', 1000, 2], ['location', 'Location', 150, 1], ['autre', 'Divers', -50, 1]], 'par catégorie, mots de Coût chantiers, ordre fixe, sans catégorie vide');
  eq(b.totalCost, 408 + 1100, 'total = main-d’œuvre + dépenses (carte « Total » de Coût chantiers)');
  // Réserves : même définition que le registre (réception « avec », heures qui comptent ; levée = lifted).
  eq([b.reserves.open, b.reserves.lifted], [1, 1], '1 ouverte (e2), 1 levée (e3) ; le brouillon et la ligne retirée n’y sont pas');
  eq(b.reserves.openList.map((r) => [r.id, r.who, r.text]), [['e2', 'Sam Girard', 'Joint à reprendre côté cuisine']], 'la réserve à traiter, avec qui et quoi');
  // Documents : par catégorie, factures comprises pour le bureau.
  eq(b.documents.total, 8, '8 documents');
  eq(b.documents.byCategory.map((c) => [c.key, c.count]), [['devis', 1], ['pv_reception', 1], ['photo', 2], ['reserve', 1], ['facture', 1], ['facture_payee', 1], ['sans_categorie', 1]], 'ordre du choix de catégorie, « Sans catégorie » en dernier');
  eq(b.documents.byCategory.find((c) => c.key === 'facture')?.label, 'Facture', 'libellé du lot 24');
  // Budget : prévu contre réel, avec la règle de Coût chantiers.
  eq(b.budget.hoursLine && [b.budget.hoursLine.used, b.budget.hoursLine.planned, Math.round(b.budget.hoursLine.pct)], [1500, 30, 83], '25 h sur 30 h prévues');
  eq(b.budget.amountLine && [b.budget.amountLine.used, b.budget.amountLine.planned, Math.round(b.budget.amountLine.pct), b.budget.amountLine.incomplete], [408, 600, 68, true], '408 € sur 600 € prévus, incomplet (un salarié sans taux)');
  eq(b.budget.progress && [Math.round(b.budget.progress.pct), b.budget.progress.tone], [83, 'warn'], 'même pourcentage et même couleur que Coût chantiers');
  // Le même calcul que Coût chantiers, appelé directement avec les mêmes sommes.
  eq(b.budget.progress, budgetProgress({ hours: 30, amount: 600, usedMinutes: 1500, usedCost: 408 }), 'budgetProgress identique');
});

Deno.test('bilan : les factures n’apparaissent que pour le bureau', () => {
  const base = { worksiteId: WS, completedDay: null, labour, entries, names, expenses, docs, budget: { hours: null, amount: null } };
  const office = buildBilan({ ...base, office: true });
  const worker = buildBilan({ ...base, office: false });
  ok(office.documents.byCategory.some((c) => c.key === 'facture') && office.documents.byCategory.some((c) => c.key === 'facture_payee'), 'bureau : factures comptées');
  ok(!worker.documents.byCategory.some((c) => c.key === 'facture' || c.key === 'facture_payee'), 'sans droit du bureau : aucune facture, même en nombre');
  eq(worker.documents.total, 6, 'et le total les exclut aussi');
  ok(buildBilan({ ...base, office: true }).budget.progress === null && buildBilan({ ...base, office: true }).budget.hoursLine === null, 'sans budget : aucune ligne de budget');
});

Deno.test('bilan : chantier vide, catégories inconnues, valeurs étranges', () => {
  const e = buildBilan({ worksiteId: 'vide', completedDay: null, labour, entries: [], names: {}, expenses: [], docs: [], budget: { hours: null, amount: null }, office: true });
  eq(e.hours.workers, [], 'aucun salarié');
  eq([e.hours.paidMinutes, e.hours.draftMinutes, e.expenses.total, e.reserves.open, e.reserves.lifted, e.documents.total, e.totalCost], [0, 0, 0, 0, 0, 0, 0], 'tout à zéro');
  eq(e.period, { first: null, last: null, completed: null }, 'pas de période');
  const odd = buildBilan({
    worksiteId: WS, completedDay: null, labour: [{ ...labour[0], paid_minutes: '60' as unknown as number, cost: '12.5' as unknown as number, route_minutes: null as unknown as number }], entries: [], names: {},
    expenses: [{ category: 'inconnue', amount: '10.25' as unknown as number }], docs: [{ category: 'exotique' }], budget: { hours: null, amount: null }, office: true,
  });
  eq([odd.hours.paidMinutes, odd.hours.cost, odd.hours.routeMinutes], [60, 12.5, 0], 'nombres reçus en texte ou nuls : lus comme Coût chantiers (Number(…) || 0)');
  eq(odd.hours.workers[0].name, 'Salarié', 'nom inconnu → « Salarié »');
  eq(odd.expenses.byCategory.map((c) => [c.key, c.total]), [['inconnue', 10.25]], 'catégorie de dépense inconnue : gardée, jamais perdue');
  eq(odd.documents.byCategory.map((c) => c.key), ['exotique'], 'catégorie de document inconnue : gardée');
});

Deno.test('les documents du bilan suivent les 8 catégories du lot 24', () => {
  const all = DOC_CATEGORY_NAMES.map((c) => ({ category: c as string | null }));
  const b = buildBilan({ worksiteId: WS, completedDay: null, labour: [], entries: [], names: {}, expenses: [], docs: all, budget: { hours: null, amount: null }, office: true });
  eq(b.documents.byCategory.map((c) => c.key), [...DOC_CATEGORY_NAMES], 'une ligne par catégorie, dans l’ordre du choix');
});
