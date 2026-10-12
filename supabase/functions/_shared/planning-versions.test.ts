// Lot 8 — versions du planning : la différence, les cases gardées, les mots.
//   npm run test:versions
import {
  addDaysISO, cellsFromRows, cellsSignature, chunkByKey, clipNote, clipRequest, countsOf, diffCells, emptyProtection, inWeek, mondayOf, planIsEmpty, planRestore, planSignature,
  REASON_ABSENT, REASON_CLOSED, REASON_LIVE, REASON_SITE, REASON_USER, REASON_WORKER,
  mondaysOf, restoreSummary, sameContent, toCell, usersOf, versionSize, versionTitle, weekRange, weeksTouched, type VersionCell,
} from './planning-versions.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
function ok(c: boolean, msg: string) { if (!c) throw new Error(msg); }

const SAM = 'u-sam', ALEX = 'u-alex', LEA = 'u-lea';
const cell = (id: string, user_id: string, work_date: string, worksite_id: string | null = 'w1', extra: Partial<VersionCell> = {}): VersionCell => ({
  id, user_id, worksite_id, work_date, estimated_start: '08:00:00', estimated_end: '12:00:00', notes: null, created_by: 'u-admin', ...extra,
});
const ids = (a: { id: string }[]) => a.map((x) => x.id).sort();

Deno.test('semaines : lundi → dimanche, périodes, plafond', () => {
  eq(mondayOf('2026-10-14'), '2026-10-12', 'mercredi → lundi');
  eq(mondayOf('2026-10-12'), '2026-10-12', 'lundi → lui-même');
  eq(mondayOf('2026-10-18'), '2026-10-12', 'dimanche → lundi d’avant (la semaine finit le dimanche)');
  eq(mondayOf('2026-11-01'), '2026-10-26', 'changement d’heure et de mois');
  eq(weekRange('2026-10-12'), { from: '2026-10-12', to: '2026-10-18' }, '7 jours');
  eq(addDaysISO('2026-12-31', 1), '2027-01-01', 'année suivante');
  eq(weeksTouched('2026-10-14', '2026-10-16'), ['2026-10-12'], 'une semaine');
  eq(weeksTouched('2026-10-17', '2026-10-20'), ['2026-10-12', '2026-10-19'], 'à cheval sur deux semaines');
  eq(weeksTouched('2026-10-01', '2027-03-31').length, 12, 'au plus 12 semaines par action');
  eq(weeksTouched('2026-10-12', '2026-10-18'), ['2026-10-12'], 'lundi → dimanche : une seule semaine');
  eq(weeksTouched('2026-10-18', '2026-10-19'), ['2026-10-12', '2026-10-19'], 'dimanche + lundi : deux semaines');
  ok(inWeek('2026-10-12', '2026-10-12') && inWeek('2026-10-12', '2026-10-18'), 'lundi et dimanche sont dans la semaine');
  ok(!inWeek('2026-10-12', '2026-10-11') && !inWeek('2026-10-12', '2026-10-19'), 'dimanche d’avant et lundi d’après : dehors');
  eq(mondayOf('2026-03-29'), '2026-03-23', 'dimanche du changement d’heure (mars) : lundi d’avant');
  eq(mondayOf('2026-10-25'), '2026-10-19', 'dimanche du changement d’heure (octobre) : lundi d’avant');
  eq(weekRange('2026-10-26'), { from: '2026-10-26', to: '2026-11-01' }, 'semaine à cheval sur deux mois');
  eq(weeksTouched('2026-10-20', '2026-10-10'), [], 'période à l’envers : rien');
  eq(weeksTouched('', '2026-10-10'), [], 'date absente : rien');
  eq(mondaysOf(['2026-10-14', '2026-10-12', '2026-10-19', undefined, 'n’importe quoi', '2026-13-45', '2026-10-20T08:00:00Z']), ['2026-10-12', '2026-10-19'], 'lundis sans doublon ; un jour mal écrit est ignoré, jamais une erreur');
  eq(mondaysOf([]), [], 'aucun jour : aucune semaine');
});

Deno.test('copie d’une case : colonnes utiles, heures et note propres', () => {
  const c = toCell({ id: 'p1', company_id: 'c', user_id: SAM, worksite_id: 'w1', work_date: '2026-10-14', estimated_start: '08:00', estimated_end: null, notes: '  ', absence_type: null, position: 3, created_by: 'u-admin', created_at: 'x' });
  eq(c, { id: 'p1', user_id: SAM, worksite_id: 'w1', work_date: '2026-10-14', estimated_start: '08:00:00', estimated_end: null, notes: null, created_by: 'u-admin', position: 3 }, 'case copiée');
  eq(toCell({ id: 'p2', user_id: SAM, worksite_id: null, work_date: '2026-10-14T00:00:00', added_by_worker: true }).added_by_worker, true, 'ajoutée par le salarié : gardée');
  ok(!('added_by_worker' in toCell({ id: 'p3', user_id: SAM, work_date: '2026-10-14', added_by_worker: false })), 'sinon, rien à écrire');
  eq(usersOf([cell('a', SAM, '2026-10-12'), cell('b', ALEX, '2026-10-12'), cell('c', SAM, '2026-10-13')]), [ALEX, SAM], 'salariés sans doublon');
});

Deno.test('demande : 500 caractères au plus, espaces propres', () => {
  eq(clipRequest('  Fais le planning\n de la  semaine '), 'Fais le planning de la semaine', 'espaces');
  eq(clipRequest('x'.repeat(800))!.length, 500, '500 caractères');
  eq(clipRequest(''), null, 'vide');
  eq(clipRequest(undefined), null, 'absente');
  eq(clipNote('y'.repeat(300))!.length, 200, 'note : 200');
  // La base compte des CARACTÈRES : une émoji coupée en deux ferait refuser la version.
  const emo = clipRequest('a'.repeat(499) + '😀😀')!;
  eq(Array.from(emo).length, 500, '500 caractères, émoji entière');
  ok(!/[\uD800-\uDBFF]$/.test(emo) && !/^[\uDC00-\uDFFF]/.test(emo), 'jamais de moitié d’émoji au bout');
  eq(Array.from(clipRequest('😀'.repeat(600))!).length, 500, '600 émojis → 500 caractères');
  eq(clipRequest('   \n  '), null, 'que des espaces : rien');
});

Deno.test('comparer : même contenu, empreinte sans identifiants', () => {
  ok(sameContent(cell('a', SAM, '2026-10-12'), cell('b', SAM, '2026-10-12', 'w1', { estimated_start: '08:00' })), 'mêmes valeurs, autre id, heure courte');
  ok(!sameContent(cell('a', SAM, '2026-10-12'), cell('a', SAM, '2026-10-12', 'w1', { notes: 'Clés chez le voisin' })), 'note différente');
  ok(!sameContent(cell('a', SAM, '2026-10-12'), cell('a', SAM, '2026-10-12', 'w2')), 'chantier différent');
  eq(cellsSignature([cell('a', SAM, '2026-10-12'), cell('b', ALEX, '2026-10-13')]), cellsSignature([cell('z', ALEX, '2026-10-13'), cell('y', SAM, '2026-10-12')]), 'ordre et id indifférents');
  ok(cellsSignature([cell('a', SAM, '2026-10-12')]) !== cellsSignature([cell('a', SAM, '2026-10-13')]), 'un jour de plus ou de moins : différent');
});

Deno.test('différence : à remettre, à retirer, à modifier', () => {
  const v1 = [cell('a', SAM, '2026-10-12'), cell('b', SAM, '2026-10-13'), cell('c', ALEX, '2026-10-12', 'w2'), cell('d', LEA, '2026-10-14')];
  // Maintenant : b effacée, c décalée au mardi, a avec une note, e et f ajoutées, d intacte.
  const now = [cell('a', SAM, '2026-10-12', 'w1', { notes: 'Apporter l’échelle' }), cell('c', ALEX, '2026-10-13', 'w2'), cell('d', LEA, '2026-10-14'), cell('e', SAM, '2026-10-14'), cell('f', ALEX, '2026-10-15', 'w2')];
  const d = diffCells(now, v1);
  eq(ids(d.add), ['b'], 'b revient');
  eq(ids(d.remove), ['e', 'f'], 'e et f partent');
  eq(d.update.map((u) => u.from.id).sort(), ['a', 'c'], 'a (note) et c (jour) changent');
  eq(d.same, 1, 'd ne bouge pas');
  const back = diffCells(v1, v1);
  eq([back.add.length, back.remove.length, back.update.length, back.same], [0, 0, 0, 4], 'identique : rien à faire');
});

Deno.test('différence : une case effacée puis reposée (autre id) n’est ni retirée ni remise', () => {
  const v1 = [cell('a', SAM, '2026-10-12')];
  const now = [cell('a2', SAM, '2026-10-12')];
  const d = diffCells(now, v1);
  eq([d.add.length, d.remove.length, d.update.length, d.same], [0, 0, 0, 1], 'même salarié, jour, chantier, heures : déjà là');
  const now2 = [cell('a2', SAM, '2026-10-12', 'w1', { estimated_start: '09:00:00' })];
  const d2 = diffCells(now2, v1);
  eq([d2.add.length, d2.remove.length, d2.update.length], [0, 0, 1], 'autre heure : modifiée, pas retirée + remise');
  // Deux cases identiques le même jour (matin et après-midi au même chantier) : appariées une à une.
  const v = [cell('m', SAM, '2026-10-12', 'w1'), cell('s', SAM, '2026-10-12', 'w1', { estimated_start: '13:30:00', estimated_end: '17:00:00' })];
  const n = [cell('s2', SAM, '2026-10-12', 'w1', { estimated_start: '13:30:00', estimated_end: '17:00:00' })];
  const d3 = diffCells(n, v);
  eq(ids(d3.add), ['m'], 'le matin revient');
  eq([d3.remove.length, d3.update.length, d3.same], [0, 0, 1], 'l’après-midi, déjà là, n’est pas touché');
});

Deno.test('cases gardées : heures, mois clôturé, pointage en cours, absence', () => {
  const v1 = [cell('a', SAM, '2026-10-12'), cell('b', SAM, '2026-10-13'), cell('g', ALEX, '2026-09-30')];
  const now = [cell('a', SAM, '2026-10-14'), cell('e', SAM, '2026-10-15'), cell('f', ALEX, '2026-10-15'), cell('h', LEA, '2026-10-16'), cell('i', LEA, '2026-10-17', 'w1', { notes: 'x' })];
  const p = emptyProtection();
  p.kept.set('e', 'heures déjà notées par le salarié');
  p.kept.set('f', REASON_LIVE);
  p.closedMonths.add('2026-09');
  const plan = planRestore(diffCells(now, v1), p);
  eq(ids(plan.remove), ['h', 'i'], 'retirées : celles sans heures');
  eq(plan.kept.map((k) => [k.cell.id, k.reason]).sort(), [['e', 'heures déjà notées par le salarié'], ['f', REASON_LIVE]], 'gardées : heures notées, pointage en cours');
  eq(plan.update.map((u) => [u.from.id, u.move]), [['a', true]], 'a revient au lundi : c’est un déplacement');
  eq(plan.add.map((a) => [a.cell.id, a.keepId]), [['b', true]], 'b revient avec son identifiant');
  eq(plan.skipped.map((s) => [s.cell.id, s.reason]), [['g', REASON_CLOSED]], 'g (septembre clôturé) ne revient pas');
  // Absence posée depuis : rien n'est remis ni déplacé sur ce jour.
  const p2 = emptyProtection();
  p2.absentDays.add(`${SAM}|2026-10-12`);
  p2.absentDays.add(`${SAM}|2026-10-13`);
  const plan2 = planRestore(diffCells(now, v1), p2);
  eq(plan2.kept.map((k) => [k.cell.id, k.reason]), [['a', REASON_ABSENT]], 'a reste où elle est (absence le lundi)');
  eq(plan2.skipped.map((s) => s.cell.id).sort(), ['b'], 'b ne revient pas (absence le mardi)');
  // Modifier une case qui porte des heures : elle reste, telle quelle.
  const p3 = emptyProtection();
  p3.kept.set('a', 'heures déjà envoyées');
  const plan3 = planRestore(diffCells([cell('a', SAM, '2026-10-12', 'w1', { notes: 'x' })], [cell('a', SAM, '2026-10-12')]), p3);
  eq([plan3.update.length, plan3.kept.length], [0, 1], 'une case avec des heures n’est jamais modifiée');
  // Déplacement vers un mois clôturé : non.
  const p4 = emptyProtection();
  p4.closedMonths.add('2026-09');
  const plan4 = planRestore(diffCells([cell('a', SAM, '2026-10-01')], [cell('a', SAM, '2026-09-30')]), p4);
  eq(plan4.kept.map((k) => k.reason), [REASON_CLOSED], 'pas de déplacement vers un mois clôturé');
});

Deno.test('identifiant déjà pris ailleurs : la case revient avec un nouvel identifiant', () => {
  const p = emptyProtection();
  p.takenIds.add('b');
  const plan = planRestore(diffCells([], [cell('a', SAM, '2026-10-12'), cell('b', SAM, '2026-10-13')]), p);
  eq(plan.add.map((a) => [a.cell.id, a.keepId]), [['a', true], ['b', false]], 'b déplacée vers une autre semaine depuis : on ne la reprend pas, on en pose une nouvelle');
});

Deno.test('les mots : « 12 cases remises, 3 retirées, 2 gardées (heures déjà notées) »', () => {
  const base = { added: 0, removed: 0, changed: 0, kept: 0, keptReasons: [] as string[], skipped: 0, skippedReasons: [] as string[] };
  eq(restoreSummary({ ...base, added: 12, removed: 3, kept: 2, keptReasons: ['heures déjà notées'] }), '12 cases remises, 3 retirées, 2 gardées (heures déjà notées).', 'exemple du plan');
  eq(restoreSummary({ ...base, added: 1 }), '1 case remise.', 'singulier');
  eq(restoreSummary({ ...base, removed: 3, changed: 1 }), '3 cases retirées, 1 modifiée.', 'le mot « case » devant le premier nombre');
  eq(restoreSummary(base), 'Rien à changer : le planning est déjà comme cette version.', 'rien');
  eq(restoreSummary({ ...base, kept: 2, keptReasons: ['heures déjà envoyées', REASON_LIVE] }), 'Rien à changer : 2 cases gardées (heures déjà envoyées, pointage en cours).', 'tout est gardé : on le dit');
  eq(restoreSummary({ ...base, added: 2, skipped: 1, skippedReasons: [REASON_CLOSED] }), '2 cases remises, 1 non remise (mois clôturé).', 'non remise');
  const c = countsOf({ add: [], remove: [], update: [], same: 0, skipped: [], kept: [
    { cell: cell('a', SAM, '2026-10-12'), reason: 'heures déjà notées par le salarié, mois clôturé' }, { cell: cell('b', SAM, '2026-10-13'), reason: 'mois clôturé' }] });
  eq(c.keptReasons, ['heures déjà notées par le salarié', 'mois clôturé'], 'raisons sans doublon');
});

Deno.test('titres des versions', () => {
  eq(versionTitle({ number: 1, kind: 'initial', note: null }), 'V1 · Initiale', 'V1');
  eq(versionTitle({ number: 2, kind: 'assistant', note: 'Planning appliqué' }), 'V2 · Essai de l’assistant', 'essai');
  eq(versionTitle({ number: 3, kind: 'manuel', note: null }), 'V3 · Gardée', 'gardée');
  eq(versionTitle({ number: 4, kind: 'avant_retour', note: 'Avant le retour à la V2' }), 'V4 · Avant le retour à la V2', 'avant un retour');
  eq(versionTitle({ number: 5, kind: 'avant_assistant', note: null }), 'V5 · Avant l’assistant', 'avant l’assistant');
  eq(versionSize([cell('a', SAM, '2026-10-12'), cell('b', ALEX, '2026-10-12')]), '2 cases · 2 salariés', 'taille');
  eq(versionSize([]), 'Aucune case', 'vide');
});


Deno.test('lecture d’une semaine : rien d’une autre entreprise ni d’une autre semaine n’entre', () => {
  const CO = 'co-1', OTHER = 'co-2', MON = '2026-10-12';
  const row = (id: string, work_date: string, extra: Record<string, unknown> = {}) => ({ id, company_id: CO, user_id: SAM, worksite_id: 'w1', work_date, absence_type: null, estimated_start: '08:00:00', estimated_end: null, notes: null, ...extra });
  const rows = [
    row('a', '2026-10-12'), row('b', '2026-10-18'),                       // lundi et dimanche : dedans
    row('c', '2026-10-11'), row('d', '2026-10-19'),                       // la veille, le lendemain : dehors
    row('e', '2026-10-14', { company_id: OTHER }),                        // une autre entreprise : dehors
    row('f', '2026-10-13', { absence_type: 'conge', worksite_id: null }), // une absence : un jour d’absence, pas une case
  ];
  const r = cellsFromRows(rows, { companyId: CO, monday: MON });
  eq(r.cells.map((c) => c.id), ['a', 'b'], 'seules les cases de la semaine, de l’entreprise');
  eq([...r.absentDays], [`${SAM}|2026-10-13`], 'l’absence est un jour, pas une case');
  eq(r.foreign, 3, 'les trois lignes de trop sont comptées');
});

Deno.test('un plan ne contient jamais une case d’une autre semaine', () => {
  const MON = '2026-10-12';
  // Une version abîmée ou trop large : des cases de la semaine d’avant et d’après.
  const target = [cell('a', SAM, '2026-10-12'), cell('x1', SAM, '2026-10-05'), cell('x2', ALEX, '2026-10-19'), cell('x3', ALEX, '2026-10-11')];
  const now = [cell('b', SAM, '2026-10-13'), cell('y1', SAM, '2026-10-06'), cell('y2', LEA, '2026-10-20')];
  const d = diffCells(now, target, { monday: MON });
  eq(ids(d.add), ['a'], 'seule la case de la semaine revient');
  eq(ids(d.remove), ['b'], 'seule la case de la semaine part');
  const plan = planRestore(d, emptyProtection());
  const all = [...plan.add.map((x) => x.cell), ...plan.remove, ...plan.update.flatMap((u) => [u.from, u.to]), ...plan.kept.map((k) => k.cell), ...plan.skipped.map((s) => s.cell)];
  ok(all.every((c) => inWeek(MON, c.work_date)), 'aucune case du plan n’est hors de la semaine');
  // Sans périmètre (cas d’avant), le calcul reste le même sur une semaine propre.
  eq(ids(diffCells([cell('b', SAM, '2026-10-13')], [cell('a', SAM, '2026-10-12')]).add), ['a'], 'sans périmètre : inchangé');
});

Deno.test('cases ajoutées par le salarié, chantier supprimé, salarié archivé', () => {
  const p = emptyProtection();
  p.goneWorksites.add('w-gone');
  p.goneUsers.add(LEA);
  const v1 = [cell('a', SAM, '2026-10-12', 'w-gone'), cell('b', LEA, '2026-10-12'), cell('c', ALEX, '2026-10-12'), cell('d', SAM, '2026-10-13', 'w1', { notes: 'avant' })];
  const now = [cell('w', SAM, '2026-10-15', 'w1', { added_by_worker: true }), cell('z', ALEX, '2026-10-16'), cell('d', SAM, '2026-10-13', 'w1', { notes: 'après', added_by_worker: true })];
  const plan = planRestore(diffCells(now, v1), p);
  eq(plan.add.map((a) => a.cell.id), ['c'], 'seule la case saine revient');
  eq(plan.skipped.map((s) => [s.cell.id, s.reason]).sort(), [['a', REASON_SITE], ['b', REASON_USER]], 'chantier supprimé, salarié archivé : non remises, et dit');
  eq(plan.remove.map((c) => c.id), ['z'], 'la case du bureau part');
  eq(plan.kept.map((k) => [k.cell.id, k.reason]).sort(), [['d', REASON_WORKER], ['w', REASON_WORKER]], 'ajoutée par le salarié : ni retirée ni modifiée');
  eq(plan.update.length, 0, 'et rien n’est modifié');
  // Une case dont le NOUVEAU chantier est supprimé reste comme elle est.
  const p2 = emptyProtection();
  p2.goneWorksites.add('w-gone');
  const plan2 = planRestore(diffCells([cell('a', SAM, '2026-10-12', 'w1')], [cell('a', SAM, '2026-10-12', 'w-gone')]), p2);
  eq(plan2.kept.map((k) => k.reason), [REASON_SITE], 'changer pour un chantier supprimé : non');
});

Deno.test('rien à faire : tout est déjà comme la version, ou gardé', () => {
  const v1 = [cell('a', SAM, '2026-10-12'), cell('b', SAM, '2026-10-13')];
  ok(planIsEmpty(planRestore(diffCells(v1, v1), emptyProtection())), 'identique : rien à écrire');
  const p = emptyProtection();
  p.kept.set('e', 'heures déjà notées par le salarié');
  const plan = planRestore(diffCells([...v1, cell('e', SAM, '2026-10-14')], v1), p);
  ok(planIsEmpty(plan) && plan.kept.length === 1, 'une seule case en trop, avec des heures : gardée, rien à écrire');
  eq(restoreSummary(countsOf(plan)), 'Rien à changer : 1 case gardée (heures déjà notées par le salarié).', 'et c’est dit');
});

Deno.test('empreinte d’un plan : change si les cases concernées changent', () => {
  const v1 = [cell('a', SAM, '2026-10-12'), cell('b', SAM, '2026-10-13')];
  const base = planRestore(diffCells([cell('b', SAM, '2026-10-13')], v1), emptyProtection());
  const same = planRestore(diffCells([cell('b', SAM, '2026-10-13')], [...v1].reverse()), emptyProtection());
  eq(planSignature(base), planSignature(same), 'même plan, même empreinte (l’ordre ne compte pas)');
  const moved = planRestore(diffCells([cell('b', SAM, '2026-10-13'), cell('e', ALEX, '2026-10-14')], v1), emptyProtection());
  ok(planSignature(base) !== planSignature(moved), 'une case de plus à retirer : autre empreinte (l’aperçu confirmé n’est plus vrai)');
  const p = emptyProtection();
  p.kept.set('b', 'heures déjà notées par le salarié');
  const kept = planRestore(diffCells([cell('b', SAM, '2026-10-13', 'w1', { notes: 'x' })], v1), p);
  ok(planSignature(kept) !== planSignature(planRestore(diffCells([cell('b', SAM, '2026-10-13', 'w1', { notes: 'x' })], v1), emptyProtection())), 'des heures notées entre-temps : autre empreinte');
});

Deno.test('paquets : jamais une case séparée de ses voisines (même salarié, jour, chantier)', () => {
  const cells: VersionCell[] = [];
  for (let i = 0; i < 230; i++) cells.push(cell(`c${i}`, `u${i % 40}`, '2026-10-12', `w${i % 3}`, { estimated_start: `${String(7 + (i % 3)).padStart(2, '0')}:00:00` }));
  const chunks = chunkByKey(cells, 100);
  eq(chunks.flat().length, 230, 'aucune case perdue');
  ok(chunks.every((c) => c.length <= 100 + 5), 'paquets bornés');
  const where = new Map<string, number>();
  chunks.forEach((c, i) => c.forEach((x) => {
    const k = `${x.user_id}|${x.work_date}|${x.worksite_id}`;
    if (where.has(k) && where.get(k) !== i) throw new Error(`le groupe ${k} est coupé en deux paquets`);
    where.set(k, i);
  }));
  eq(chunkByKey([], 100), [], 'rien : aucun paquet');
  eq(chunkByKey([cell('a', SAM, '2026-10-12', null), cell('b', SAM, '2026-10-12', null)], 100).length, 1, 'sans chantier : chacune seule, mais tenant dans un paquet');
});
