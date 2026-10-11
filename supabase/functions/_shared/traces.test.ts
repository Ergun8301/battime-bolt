// Lot 3 — « Interventions supprimées ou décalées » : mise en forme des traces.
//   npm run test:traces
import {
  dayLabel, daysAgoISO, hhmm, isSystemTrace, ORIGIN_LABEL, parisMidnightISO, parisTime, personIds, snapshotLabel, traceChange, traceConcerned,
  traceTitle, traceWho, whenLabel, worksiteIds, type TraceRow,
} from './traces.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
function ok(c: boolean, msg: string) { if (!c) throw new Error(msg); }

const SAM = 'u-sam', ADMIN = 'u-admin';
const names = { worksites: { w1: 'Villa Exemple', w2: 'Résidence Test' }, users: { [SAM]: 'Sam Test', [ADMIN]: 'Admin Test', 'u-alex': 'Alex Exemple' } };
const slot = (extra: Record<string, unknown> = {}) => ({ id: 'p1', user_id: SAM, work_date: '2026-10-14', worksite_id: 'w1', estimated_start: '08:00:00', estimated_end: '12:00:00', absence_type: null, ...extra });
const tr = (extra: Partial<TraceRow>): TraceRow => ({
  id: 1, company_id: 'c', user_id: SAM, actor_id: ADMIN, actor_role: 'admin', origin: 'ecran', action: 'supprimee', object_table: 'planning',
  object_id: 'p1', work_date: '2026-10-14', before: slot(), after: null, created_at: '2026-10-14T08:05:00Z', ...extra,
});

Deno.test('jours et heures en clair (Paris)', () => {
  eq(dayLabel('2026-10-14'), 'mer. 14/10', 'mercredi');
  eq(dayLabel('2026-10-18'), 'dim. 18/10', 'dimanche');
  eq(dayLabel(null), '', 'rien');
  eq(hhmm('08:00:00'), '08:00', 'heure courte');
  eq(parisTime('2026-10-14T06:05:00Z'), '08:05', 'été : UTC+2');
  eq(parisTime('2026-12-14T07:05:00Z'), '08:05', 'hiver : UTC+1');
  eq(whenLabel('2026-10-14T08:05:00Z'), '14/10 à 10:05', 'quand');
  eq(daysAgoISO('2026-10-14', 60), '2026-08-15', '60 jours avant');
  eq(parisMidnightISO('2026-10-14'), '2026-10-13T22:00:00.000Z', 'minuit à Paris en été');
  eq(parisMidnightISO('2026-12-14'), '2026-12-13T23:00:00.000Z', 'minuit à Paris en hiver');
});

Deno.test('titres : planning, absence, heures, pointage, tâche, réunion', () => {
  eq(traceTitle(tr({})), 'Intervention supprimée', 'case supprimée');
  eq(traceTitle(tr({ action: 'decalee', after: slot({ work_date: '2026-10-15' }) })), 'Intervention décalée', 'case décalée');
  eq(traceTitle(tr({ action: 'remise', before: null, after: slot() })), 'Intervention remise', 'case remise');
  eq(traceTitle(tr({ before: slot({ absence_type: 'conge', worksite_id: null }) })), 'Absence supprimée', 'absence');
  eq(traceTitle(tr({ object_table: 'time_entries' })), 'Heures supprimées', 'heures supprimées');
  eq(traceTitle(tr({ object_table: 'time_entries', action: 'decalee' })), 'Heures changées', 'heures changées');
  eq(traceTitle(tr({ object_table: 'time_entries', action: 'retiree' })), 'Heures retirées', 'ligne retirée');
  eq(traceTitle(tr({ object_table: 'active_sessions' })), 'Pointage en cours supprimé', 'chrono');
  eq(traceTitle(tr({ object_table: 'day_tasks' })), 'Tâche supprimée', 'tâche');
  eq(traceTitle(tr({ object_table: 'meetings', action: 'decalee' })), 'Réunion décalée', 'réunion');
});

Deno.test('avant → après : jour, heures, chantier', () => {
  const moved = tr({ action: 'decalee', after: slot({ work_date: '2026-10-15', estimated_start: '09:00:00', estimated_end: '13:00:00', worksite_id: 'w2' }) });
  eq(traceChange(moved, names), { before: 'mer. 14/10 · 08:00–12:00 · Villa Exemple', after: 'jeu. 15/10 · 09:00–13:00 · Résidence Test' }, 'case décalée');
  eq(traceChange(tr({}), names), { before: 'mer. 14/10 · 08:00–12:00 · Villa Exemple', after: null }, 'suppression : un avant seulement');
  eq(traceChange(tr({ action: 'remise', before: null, after: slot() }), names).before, null, 'remise : un après seulement');
  eq(snapshotLabel('planning', slot({ absence_type: 'maladie', worksite_id: null }), names), 'mer. 14/10 · Arrêt maladie', 'absence');
  eq(snapshotLabel('planning', slot({ estimated_start: null, estimated_end: null }), names), 'mer. 14/10 · Villa Exemple', 'sans heure');
  eq(snapshotLabel('planning', slot({ worksite_id: 'w-inconnu' }), names), 'mer. 14/10 · 08:00–12:00 · Chantier', 'chantier illisible');
  const entry = { work_date: '2026-10-14', start_time: '07:30:00', end_time: '16:00:00', break_minutes: 30, worksite_id: 'w1', status: 'submitted' };
  eq(snapshotLabel('time_entries', entry, names), 'mer. 14/10 · 07:30–16:00 (pause 30 min) · Villa Exemple', 'heures avec pause');
  eq(snapshotLabel('time_entries', { ...entry, break_minutes: 0, status: 'cancelled' }, names), 'mer. 14/10 · 07:30–16:00 · Villa Exemple · retirée', 'ligne retirée');
  eq(snapshotLabel('active_sessions', { work_date: '2026-10-14', started_at: '2026-10-14T05:58:00Z', worksite_id: 'w2' }, names), 'mer. 14/10 · commencé à 07:58 · Résidence Test', 'chrono');
  eq(snapshotLabel('day_tasks', { work_date: '2026-10-14', part: 'apres-midi', text: 'Ranger le dépôt' }, names), 'mer. 14/10 · après-midi · « Ranger le dépôt »', 'tâche');
  eq(snapshotLabel('meetings', { meeting_date: '2026-10-16', start_time: '14:00:00', end_time: null, title: 'Point sécurité', place: 'Dépôt' }, names), 'ven. 16/10 · 14:00 · « Point sécurité » · Dépôt', 'réunion');
  eq(snapshotLabel('planning', null, names), '', 'rien');
});

Deno.test('qui : vu par le salarié', () => {
  const me = { id: SAM, office: false };
  eq(traceWho(tr({}), me, names), 'le bureau', 'le bureau');
  eq(traceWho(tr({ actor_id: SAM, actor_role: 'worker' }), me, names), 'vous', 'lui-même');
  eq(traceWho(tr({ actor_id: SAM, actor_role: 'worker', origin: 'assistant' }), me, names), 'l’assistant, à votre demande', 'son assistant');
  eq(traceWho(tr({ origin: 'assistant' }), me, names), 'l’assistant du bureau', 'assistant du bureau');
  eq(traceWho(tr({ actor_id: 'u-chef', actor_role: 'lead' }), me, names), 'le chef d’équipe', 'chef d’équipe');
  eq(traceWho(tr({ actor_id: null, actor_role: null, origin: 'systeme', created_at: '2026-10-14T00:30:00Z' }), me, names), 'automatiquement, la nuit', 'cron de nuit');
  eq(traceWho(tr({ actor_id: null, actor_role: null, origin: 'systeme', created_at: '2026-10-14T10:30:00Z' }), me, names), 'automatiquement', 'service en journée');
});

Deno.test('qui, et pour qui : vu par le bureau', () => {
  const office = { id: ADMIN, office: true };
  eq(traceWho(tr({ actor_id: SAM, actor_role: 'worker' }), office, names), 'Sam Test', 'le nom');
  eq(traceWho(tr({ origin: 'assistant' }), office, names), 'Admin Test, par l’assistant', 'par l’assistant');
  eq(traceWho(tr({ actor_id: 'u-parti', actor_role: 'admin' }), office, { worksites: {}, users: {} }), 'le bureau', 'compte supprimé : le rôle');
  eq(traceConcerned(tr({}), names), 'Sam Test', 'salarié concerné');
  eq(traceConcerned(tr({ user_id: 'u-parti' }), names), 'Salarié supprimé', 'salarié supprimé');
  const meeting = tr({ object_table: 'meetings', user_id: null, before: { meeting_date: '2026-10-16', all_team: false, participants: [SAM, 'u-alex'] } });
  eq(traceConcerned(meeting, names), 'Sam Test, Alex Exemple', 'participants d’une réunion');
  eq(traceConcerned(tr({ object_table: 'meetings', user_id: null, before: { all_team: true, participants: [] } }), names), 'Toute l’équipe', 'toute l’équipe');
  eq(ORIGIN_LABEL.systeme, 'Automatique', 'origine');
  ok(isSystemTrace(tr({ actor_id: null })) && !isSystemTrace(tr({})), 'système : sans auteur');
});

Deno.test('noms à lire en une fois', () => {
  const rows = [tr({}), tr({ action: 'decalee', after: slot({ worksite_id: 'w2' }) }), tr({ object_table: 'meetings', user_id: null, before: { participants: ['u-alex'] } })];
  eq(worksiteIds(rows).sort(), ['w1', 'w2'], 'chantiers');
  ok(personIds(rows).includes('u-alex') && personIds(rows).includes(SAM) && personIds(rows).includes(ADMIN), 'personnes : auteurs, concernés, participants');
});
