// Lot 4 — missions (tâches du jour) et réunions : règles pures.
//   npm run test:missions
import {
  cleanText, DB_PENDING, hhmm, isMissingColumn, isMissingFunction, isMissingRelation, jourComplet, MEETING_TINT, meetingNotices, meetingPushBody,
  meetingsFor, meetingTimeLabel, PUSH_MAX, sortTasks, taskOutsideMessage, taskOutsideSlots, taskPartFromTimes, taskPartInfo, taskProgress, tasksFor,
  taskTimeLabel, validateMeeting, validateTaskTimes, type MeetingState, type TaskLike,
} from './missions.ts';
import { DAY_PART_INK, DAY_PARTS, dayPartOf } from './day-part.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
function ok(c: boolean, msg: string) { if (!c) throw new Error(msg); }

const task = (id: string, part: TaskLike['part'], created_at: string, extra: Partial<TaskLike> = {}): TaskLike =>
  ({ id, user_id: 'u-sam', work_date: '2026-10-15', text: `Tâche ${id}`, part, created_at, done_at: null, ...extra });

Deno.test('tâches : matin < après-midi < soir < sans moment, puis ordre d’ajout', () => {
  const list = [
    task('a', null, '2026-10-14T08:00:00Z'), task('b', 'soir', '2026-10-14T07:00:00Z'), task('c', 'matin', '2026-10-14T09:00:00Z'),
    task('d', 'apres-midi', '2026-10-14T06:00:00Z'), task('e', 'matin', '2026-10-14T08:30:00Z'),
  ];
  eq(sortTasks(list).map((t) => t.id), ['e', 'c', 'd', 'b', 'a'], 'ordre');
  eq(list.map((t) => t.id), ['a', 'b', 'c', 'd', 'e'], 'la liste d’origine n’est pas modifiée');
  const cell = tasksFor([...list, task('x', 'matin', '2026-10-14T05:00:00Z', { user_id: 'u-alex' }), task('y', 'matin', '2026-10-14T05:00:00Z', { work_date: '2026-10-16' })], 'u-sam', '2026-10-15');
  eq(cell.map((t) => t.id), ['e', 'c', 'd', 'b', 'a'], 'une case : ce salarié, ce jour');
});

// ─── Lot 9 : heure de début et de fin ────────────────────────────────────────

Deno.test('lot 9 — tri : les tâches avec heure d’abord, par heure (puis fin), ensuite celles sans heure par moment', () => {
  const list = [
    task('sans-soir', 'soir', '2026-10-14T05:00:00Z'),
    task('h14', 'apres-midi', '2026-10-14T09:00:00Z', { start_time: '14:00:00', end_time: '15:00:00' }),
    task('sans-matin', 'matin', '2026-10-14T06:00:00Z'),
    task('h10-12', 'matin', '2026-10-14T08:00:00Z', { start_time: '10:00:00', end_time: '12:00:00' }),
    task('h10-11', 'matin', '2026-10-14T10:00:00Z', { start_time: '10:00', end_time: '11:00' }),
    task('h08', 'matin', '2026-10-14T11:00:00Z', { start_time: '08:00:00', end_time: '08:30:00' }),
    task('sans', null, '2026-10-14T04:00:00Z'),
    task('debut-seul', 'matin', '2026-10-14T03:00:00Z', { start_time: '07:00:00', end_time: null }),
  ];
  eq(sortTasks(list).map((t) => t.id), ['h08', 'h10-11', 'h10-12', 'h14', 'debut-seul', 'sans-matin', 'sans-soir', 'sans'], 'ordre');
  eq(sortTasks([task('b', null, '2', { start_time: '09:00', end_time: '10:00' }), task('a', null, '1', { start_time: '09:00', end_time: '10:00' })]).map((t) => t.id), ['a', 'b'],
    'même heure : ordre d’ajout');
  eq(tasksFor(list, 'u-sam', '2026-10-15')[0].id, 'h08', 'une case : triée de la même façon');
});

Deno.test('lot 9 — libellé « 10:00–11:30 », seulement avec les deux heures', () => {
  eq(taskTimeLabel({ start_time: '10:00:00', end_time: '11:30:00' }), '10:00–11:30', 'deux heures');
  eq(taskTimeLabel({ start_time: '8:05', end_time: '9:00' }), '08:05–09:00', 'sans zéro devant');
  eq(taskTimeLabel({ start_time: '10:00', end_time: null }), '', 'début seul (impossible en base)');
  eq(taskTimeLabel({}), '', 'tâche du lot 4 (colonnes absentes)');
});

Deno.test('lot 9 — moment déduit des heures : même règle que la couleur des créneaux (day-part.ts)', () => {
  eq(taskPartFromTimes('10:00', '11:30'), 'matin', 'matin');
  eq(taskPartFromTimes('11:00', '13:00'), 'matin', '11–13 : à égalité, le plus tôt');
  eq(taskPartFromTimes('14:00', '15:00'), 'apres-midi', 'après-midi');
  eq(taskPartFromTimes('17:00', '20:00'), 'soir', '17–20 : le soir porte le plus de minutes');
  eq(taskPartFromTimes('19:00', '21:00'), 'soir', 'soir');
  eq(taskPartFromTimes('08:00', '17:00'), null, 'journée entière : sans moment (bulle blanche)');
  eq(taskPartFromTimes('10:00', ''), null, 'une seule heure : sans moment');
  eq(taskPartFromTimes(null, null), null, 'sans heure');
  for (const [a, b] of [['07:00', '09:00'], ['12:30', '16:00'], ['18:30', '22:00'], ['10:00', '14:00'], ['16:00', '22:00']]) {
    const d = dayPartOf(a, b);
    eq(taskPartFromTimes(a, b), d === 'journee' ? null : d, `${a}–${b} : identique à dayPartOf`);
  }
});

Deno.test('lot 9 — heures : les deux ou aucune, la fin après le début (comme day_tasks_times_check)', () => {
  eq(validateTaskTimes('', ''), null, 'aucune');
  eq(validateTaskTimes(null, undefined), null, 'aucune (null)');
  eq(validateTaskTimes('10:00', '11:30'), null, 'valide');
  eq(validateTaskTimes('10:00', ''), 'Indiquez l’heure de début et l’heure de fin (ou aucune).', 'début seul');
  eq(validateTaskTimes('', '11:00'), 'Indiquez l’heure de début et l’heure de fin (ou aucune).', 'fin seule');
  eq(validateTaskTimes('11:00', '11:00'), 'La fin doit être après le début.', 'fin = début');
  eq(validateTaskTimes('17:00', '08:00'), 'La fin doit être après le début.', 'pas de tâche de nuit');
  const sql = Deno.readTextFileSync(new URL('../../migrations/20261011130000_lot9_taches_avec_heures.sql', import.meta.url));
  ok(/start_time IS NULL AND end_time IS NULL\)\s+OR \(start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time\)/.test(sql), 'même règle que la contrainte SQL');
});

Deno.test('lot 9 — dépassement du créneau prévu (planning du salarié ce jour-là)', () => {
  const matin = [{ start: '08:00:00', end: '12:00:00' }];
  eq(taskOutsideSlots('10:00', '11:30', matin), { outside: false, label: '08:00–12:00' }, 'dans le créneau');
  eq(taskOutsideSlots('08:00', '12:00', matin).outside, false, 'bornes comprises');
  eq(taskOutsideSlots('11:00', '12:30', matin), { outside: true, label: '08:00–12:00' }, 'dépasse la fin');
  eq(taskOutsideSlots('07:30', '09:00', matin).outside, true, 'commence avant');
  eq(taskOutsideSlots('14:00', '15:00', matin).outside, true, 'complètement dehors');
  const deux = [{ start: '13:30:00', end: '17:00:00' }, { start: '08:00:00', end: '12:00:00' }];
  eq(taskOutsideSlots('14:00', '15:00', deux), { outside: false, label: '08:00–12:00, 13:30–17:00' }, 'deux créneaux : dans le second, libellé dans l’ordre');
  eq(taskOutsideSlots('11:00', '14:00', deux).outside, true, 'à cheval sur la pause de midi : dehors');
  eq(taskOutsideSlots('11:00', '14:00', [{ start: '08:00', end: '12:00' }, { start: '12:00', end: '17:00' }]).outside, false, 'créneaux qui se touchent : un seul');
  eq(taskOutsideSlots('09:00', '10:00', [{ start: '08:00', end: '12:00' }, { start: '08:00', end: '12:00' }]).label, '08:00–12:00', 'même créneau deux fois : écrit une fois');
  eq(taskOutsideSlots('22:00', '23:30', [{ start: '20:00', end: '02:00' }]).outside, false, 'poste de nuit : coupé à minuit');
  eq(taskOutsideSlots('10:00', '11:00', []), { outside: false, label: '' }, 'pas de planning : rien à comparer');
  eq(taskOutsideSlots('10:00', '11:00', [{ start: '14:00', end: null }, { start: null, end: null }]), { outside: false, label: '' }, 'rendez-vous « à 14:00 » seul ou sans horaire : pas d’alerte');
  eq(taskOutsideSlots(null, null, matin).outside, false, 'tâche sans heure : pas d’alerte');
  eq(taskOutsideMessage('08:00–12:00'), 'Cette tâche dépasse le créneau prévu (08:00–12:00). Ajouter quand même ?', 'message, un créneau');
  eq(taskOutsideMessage('08:00–12:00, 13:30–17:00'), 'Cette tâche dépasse les créneaux prévus (08:00–12:00, 13:30–17:00). Ajouter quand même ?', 'message, deux créneaux');
});

Deno.test('lot 9 — colonne absente (migration pas passée) : 42703 en lecture, PGRST204 en écriture', () => {
  ok(isMissingColumn({ code: '42703', message: 'column day_tasks.start_time does not exist' }), 'lecture');
  ok(isMissingColumn({ code: 'PGRST204', message: "Could not find the 'start_time' column of 'day_tasks' in the schema cache" }), 'écriture');
  ok(!isMissingColumn({ code: 'PGRST205' }) && !isMissingColumn({ code: '23514' }) && !isMissingColumn(null), 'table absente, contrainte, rien : pas « colonne absente »');
});

Deno.test('tâches : avancement « 0/0 », « 1/3 », « 3/3 »', () => {
  eq(taskProgress([]), { done: 0, total: 0, label: '0/0' }, 'aucune');
  eq(taskProgress([{ done_at: 'x' }, { done_at: null }, { done_at: null }]).label, '1/3', 'une sur trois');
  eq(taskProgress([{ done_at: 'x' }, { done_at: 'y' }, { done_at: 'z' }]), { done: 3, total: 3, label: '3/3' }, 'toutes');
});

Deno.test('texte nettoyé : espaces, vide → null, coupé à 200 / 120 / 160', () => {
  eq(cleanText('  Ranger   le\n dépôt  ', 200), 'Ranger le dépôt', 'espaces');
  eq(cleanText('   ', 200), null, 'vide');
  eq(cleanText(null, 200), null, 'null');
  eq(cleanText('a'.repeat(250), 200)?.length, 200, '200');
  eq(cleanText('b'.repeat(130), 120)?.length, 120, '120');
  eq(cleanText('c'.repeat(170), 160)?.length, 160, '160');
});

Deno.test('moment d’une tâche : mêmes libellés et couleurs que les créneaux', () => {
  eq(taskPartInfo('matin'), { label: 'Matin', bg: DAY_PARTS[0].bg, edge: DAY_PARTS[0].edge }, 'matin');
  eq(taskPartInfo('apres-midi')?.label, 'Après-midi', 'après-midi');
  eq(taskPartInfo(null), null, 'sans moment');
});

Deno.test('heure d’une réunion : « 14:00 » ou « 14:00–15:00 »', () => {
  eq(meetingTimeLabel('14:00:00', null), '14:00', 'début seul');
  eq(meetingTimeLabel('14:00', '15:00:00'), '14:00–15:00', 'début et fin');
  eq(hhmm('8:05'), '08:05', '8:05');
  eq(hhmm('8:05:00'), '08:05', '8:05:00');
  eq(hhmm('n’importe quoi'), '', 'illisible');
});

Deno.test('réunions d’une personne, un jour : toute l’équipe ou invitée, par heure', () => {
  const M = (id: string, start: string, all_team: boolean, meeting_date = '2026-10-15') => ({ id, title: id, meeting_date, start_time: start, end_time: null, place: null, all_team });
  const meetings = [M('tard', '16:00:00', false), M('equipe', '08:00:00', true), M('sam', '14:00:00', false), M('autre-jour', '09:00:00', true, '2026-10-16')];
  const parts = { tard: ['u-sam'], sam: ['u-sam', 'u-chef'] };
  eq(meetingsFor(meetings, parts, 'u-sam', '2026-10-15').map((m) => m.id), ['equipe', 'sam', 'tard'], 'Sam : équipe + ses deux, par heure');
  eq(meetingsFor(meetings, parts, 'u-alex', '2026-10-15').map((m) => m.id), ['equipe'], 'Alex : seulement toute l’équipe');
  eq(meetingsFor(meetings, parts, 'u-chef', '2026-10-15').map((m) => m.id), ['equipe', 'sam'], 'chef invité');
  eq(meetingsFor(meetings, parts, 'u-sam', '2026-10-17'), [], 'autre jour : rien');
  eq(meetingsFor(meetings, parts, 'u-admin', '2026-10-15', false).map((m) => m.id), [], 'un compte bureau ne fait pas partie de « toute l’équipe »');
});

Deno.test('réunion : mêmes refus et mêmes mots que le SQL', () => {
  const base = { title: 'Point sécurité', date: '2026-10-15', start: '14:00', end: null, place: 'Dépôt', allTeam: false, userIds: ['u-sam'] };
  eq(validateMeeting(base), null, 'valide');
  eq(validateMeeting({ ...base, title: '   ' }), 'Donnez un titre (120 caractères au plus).', 'titre vide');
  eq(validateMeeting({ ...base, title: 'x'.repeat(121) }), 'Donnez un titre (120 caractères au plus).', 'titre trop long');
  eq(validateMeeting({ ...base, start: '' }), 'Indiquez la date et l’heure.', 'sans heure');
  eq(validateMeeting({ ...base, date: '' }), 'Indiquez la date et l’heure.', 'sans date');
  eq(validateMeeting({ ...base, end: '14:00' }), 'La fin doit être après le début.', 'fin = début');
  eq(validateMeeting({ ...base, end: '13:00' }), 'La fin doit être après le début.', 'fin avant');
  eq(validateMeeting({ ...base, place: 'l'.repeat(161) }), 'Lieu trop long (160 caractères au plus).', 'lieu trop long');
  eq(validateMeeting({ ...base, userIds: [] }), 'Choisissez au moins un participant.', 'personne');
  eq(validateMeeting({ ...base, userIds: [], allTeam: true }), null, 'toute l’équipe sans liste');
  // Le SQL dit la même chose (texte recopié du fichier de migration).
  const sql = Deno.readTextFileSync(new URL('../../migrations/20261010170000_lot4_missions_reunions.sql', import.meta.url));
  for (const m of ['Donnez un titre (120 caractères au plus).', 'La fin doit être après le début.', 'Lieu trop long (160 caractères au plus).', 'Choisissez au moins un participant.']) {
    ok(sql.includes(m), `message identique dans le SQL : « ${m} »`);
  }
  ok(sql.includes("Indiquez la date et l''heure."), 'message identique dans le SQL : « Indiquez la date et l’heure. »');
});

Deno.test('notification : jour et date en français, jamais d’e-mail ni de lien, 180 caractères au plus', () => {
  eq(jourComplet('2026-10-15'), 'jeudi 15 octobre', 'jeudi 15 octobre');
  eq(jourComplet('2026-11-01'), 'dimanche 1 novembre', 'dimanche 1 novembre');
  eq(meetingPushBody({ kind: 'new', title: 'Point sécurité', date: '2026-10-15', start: '14:00:00', place: 'Dépôt' }),
    'Réunion « Point sécurité » jeudi 15 octobre à 14:00 · Dépôt', 'nouvelle');
  eq(meetingPushBody({ kind: 'change', title: 'Point sécurité', date: '2026-10-15', start: '15:00', place: null }),
    'Réunion modifiée : « Point sécurité » jeudi 15 octobre à 15:00', 'modifiée, sans lieu');
  eq(meetingPushBody({ kind: 'cancel', title: 'Point sécurité', date: '2026-10-15', start: '15:00', place: 'Dépôt' }),
    'Réunion annulée : « Point sécurité » du jeudi 15 octobre', 'annulée');
  const long = meetingPushBody({ kind: 'change', title: 'T'.repeat(120), date: '2026-10-15', start: '14:00', place: 'L'.repeat(160) });
  ok(long.length <= PUSH_MAX, `longue : ${long.length} caractères`);
  ok(long.includes('jeudi 15 octobre à 14:00'), 'longue : la date et l’heure restent lisibles');
  for (const kind of ['new', 'change', 'cancel'] as const) {
    const b = meetingPushBody({ kind, title: 'Réunion chantier', date: '2026-10-15', start: '07:30', place: 'Dépôt' });
    ok(!/mailto|@|https?:|www\./i.test(b), `${kind} : ni e-mail ni lien (${b})`);
    ok(b.startsWith('Réunion'), `${kind} : commence par « Réunion »`);
  }
});

Deno.test('qui prévenir : nouveaux → « nouvelle », retirés → « annulée », restés → « modifiée » si ça change', () => {
  const team = ['u-sam', 'u-alex', 'u-chef'];
  const s = (o: Partial<MeetingState>): MeetingState => ({ title: 'Point', date: '2026-10-15', start: '14:00', end: null, place: 'Dépôt', allTeam: false, userIds: ['u-sam', 'u-alex'], ...o });
  eq(meetingNotices(null, s({}), team), { new: ['u-sam', 'u-alex'], change: [], cancel: [] }, 'création');
  eq(meetingNotices(null, s({ allTeam: true, userIds: [] }), team), { new: team, change: [], cancel: [] }, 'création, toute l’équipe');
  eq(meetingNotices(s({}), s({ start: '15:00' }), team), { new: [], change: ['u-sam', 'u-alex'], cancel: [] }, 'heure changée');
  eq(meetingNotices(s({}), s({}), team), { new: [], change: [], cancel: [] }, 'rien de changé : personne');
  eq(meetingNotices(s({}), s({ userIds: ['u-alex', 'u-chef'] }), team), { new: ['u-chef'], change: [], cancel: ['u-sam'] }, 'liste changée seulement');
  eq(meetingNotices(s({}), s({ userIds: ['u-alex', 'u-chef'], place: 'Atelier' }), team), { new: ['u-chef'], change: ['u-alex'], cancel: ['u-sam'] }, 'liste et lieu changés');
  eq(meetingNotices(s({ allTeam: true, userIds: [] }), s({ userIds: ['u-sam'] }), team), { new: [], change: [], cancel: ['u-alex', 'u-chef'] }, 'toute l’équipe → Sam seul');
  eq(meetingNotices(s({}), null, team), { new: [], change: [], cancel: ['u-sam', 'u-alex'] }, 'retrait');
  eq(meetingNotices(null, s({ userIds: [] }), team), { new: [], change: [], cancel: [] }, 'personne à prévenir : liste vide');
});

Deno.test('table ou fonction absente (migration pas appliquée)', () => {
  ok(isMissingRelation({ code: 'PGRST205' }) && isMissingRelation({ code: '42P01' }), 'table absente');
  ok(!isMissingRelation({ code: 'PGRST202' }) && !isMissingRelation(null) && !isMissingRelation({ code: '500' }), 'autre erreur : pas « absente »');
  ok(isMissingFunction({ code: 'PGRST202' }) && isMissingFunction({ code: '42883' }), 'fonction absente');
  ok(!isMissingFunction({ code: 'P0002' }) && !isMissingFunction(undefined), 'refus métier : pas « absente »');
  eq(DB_PENDING, 'Mise à jour de la base en attente : rien n’a été modifié.', 'même message que le lot 2');
});

// ─── Couleurs : contraste WCAG et écart perçu (CIE76), calculés ici ─────────────
// (mêmes formules que day-part.test.ts, recopiées : elles y sont locales)
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex: string) => { const [r, g, b] = rgb(hex).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const lab = (hex: string) => {
  const [r, g, b] = rgb(hex).map(lin);
  const xyz = [
    (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047,
    0.2126 * r + 0.7152 * g + 0.0722 * b,
    (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883,
  ].map((t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116));
  return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])];
};
const dE = (a: string, b: string) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
// Couleurs déjà à l'écran (components/planning-bubble.tsx, admin-planning.tsx).
const CHANTIER_BARS = ['#C9821F', '#A23E6B', '#2F8A5B', '#B5472E', '#7A5EA8', '#5E7A33', '#A8742A'];
const AVATARS = ['#F1E3CB', '#EFD9E2', '#D5E8DD', '#F4D9D1', '#E7DEF2', '#E5E8CF', '#EFE2CC'];

Deno.test('réunion : couleur lisible (titre ≥ 7:1, encre ≥ 4,5:1, bordure ≥ 4,5:1)', () => {
  ok(contrast('#15120F', MEETING_TINT.bg) >= 7, `titre ${contrast('#15120F', MEETING_TINT.bg).toFixed(2)}`);
  ok(contrast(DAY_PART_INK, MEETING_TINT.bg) >= 4.5, `encre ${contrast(DAY_PART_INK, MEETING_TINT.bg).toFixed(2)}`);
  ok(contrast(MEETING_TINT.edge, MEETING_TINT.bg) >= 4.5, `bordure ${contrast(MEETING_TINT.edge, MEETING_TINT.bg).toFixed(2)}`);
  eq(MEETING_TINT.ink, DAY_PART_INK, 'même encre que les créneaux');
});

Deno.test('réunion : couleur À PART des créneaux, du blanc, du jour J, du vert « en cours »', () => {
  for (const d of DAY_PARTS) {
    ok((MEETING_TINT.bg as string) !== d.bg, `différente du ${d.label}`);
    ok(dE(MEETING_TINT.bg, d.bg) >= 10, `${d.label} : ΔE ${dE(MEETING_TINT.bg, d.bg).toFixed(1)}`);
  }
  for (const [n, c] of [['blanc', '#FFFFFF'], ['jour J', '#FFF6DB'], ['vert', '#E7F6EE'], ['vert case', '#EEF9F2'], ['absence', '#E7E1D5'], ['badge envoyé', '#EFEAE0']]) {
    ok(dE(MEETING_TINT.bg, c) >= 10, `${n} : ΔE ${dE(MEETING_TINT.bg, c).toFixed(1)}`);
  }
});

Deno.test('réunion : jamais prise pour un chantier (barres et pastilles mesurées, forme différente)', () => {
  // Fond rose contre les barres de chantier : très loin (fond pâle / barre foncée).
  for (const bar of CHANTIER_BARS) ok(dE(MEETING_TINT.bg, bar) >= 25, `fond / barre ${bar} : ΔE ${dE(MEETING_TINT.bg, bar).toFixed(1)}`);
  // La bordure (#9E2A55) est proche de la barre rose d'un chantier (#A23E6B, ΔE ≈ 9,7) et le
  // fond proche d'une pastille d'initiales (#EFD9E2, ΔE ≈ 4,8) : mesurés et ACCEPTÉS, parce que
  // la pastille réunion n'a pas de barre à gauche, a une bordure pleine (la bulle prévue :
  // pointillés), et dit toujours « 👥 » et « Réunion ».
  const nearBar = Math.min(...CHANTIER_BARS.map((b) => dE(MEETING_TINT.edge, b)));
  const nearAvatar = Math.min(...AVATARS.map((a) => dE(MEETING_TINT.bg, a)));
  ok(nearBar > 8 && nearBar < 12, `bordure / barre la plus proche : ΔE ${nearBar.toFixed(1)} (connu, accepté)`);
  ok(nearAvatar > 4 && nearAvatar < 6, `fond / pastille d’initiales la plus proche : ΔE ${nearAvatar.toFixed(1)} (connu, accepté : pas au même endroit)`);
});
