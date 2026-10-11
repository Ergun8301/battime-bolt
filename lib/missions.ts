// Lot 4 — missions (tâches du jour) et réunions, côté navigateur.
//
// TROIS RÈGLES :
//   · LECTURES = de simples GET (jamais une fonction) : tant que la migration
//     20261010170000 n'est pas appliquée, la table manque (PGRST205) et la
//     fonction se cache — planning, « Ma journée » et impression restent ceux
//     d'avant. Toute AUTRE erreur (réseau…) garde l'état connu : un raté ne fait
//     pas disparaître les réunions de l'écran.
//   · ÉCRITURES : une tâche s'insère avec SEULEMENT les colonnes permises
//     (company_id, user_id, work_date, text, part — jamais id, created_by,
//     done_at) ; « Fait » et les réunions passent par leurs fonctions. Fonction
//     absente (PGRST202) → « Mise à jour de la base en attente », rien d'écrit,
//     jamais de repli sur une écriture brute.
//   · LOT 9 (heures d'une tâche, migration 20261011130000) : les tâches sont
//     lues AVEC start_time / end_time ; colonne absente (42703) → relues une
//     fois sans, et on s'en souvient : les champs « de … à … » se cachent et
//     une tâche s'écrit EXACTEMENT comme au lot 4 (jamais start_time / end_time).
//   · NOTIFICATION : la branche « message du bureau » de send-push (déjà en
//     production, comme lib/office-edits.ts et lib/admin-writes.ts). Jamais
//     d'e-mail, jamais de mailto — et donc jamais sendReminder.
//
// JAMAIS DES HEURES : rien ici ne lit ni n'écrit planning, time_entries ou
// active_sessions. Les totaux, l'export, les coûts, les relances et la borne
// ne lisent pas ces tables (et ne doivent pas commencer).
import { supabase } from '@/lib/supabase';
import { chunk, fetchAllPaged } from '@/lib/fetch-all';
import {
  cleanText, DB_PENDING, isMissingColumn, isMissingFunction, isMissingRelation, meetingNotices, meetingPushBody, MEETING_PLACE_MAX, MEETING_TITLE_MAX,
  TASK_TEXT_MAX, type MeetingNoticeKind, type MeetingState, type TaskPart,
} from '@/supabase/functions/_shared/missions';

export interface DayTask {
  id: string;
  company_id: string;
  user_id: string;
  work_date: string;
  text: string;
  part: TaskPart;
  created_by: string | null;
  created_at: string;
  done_at: string | null;
  done_by: string | null;
  /** Lot 9 : « 10:00:00 » ou null ; absentes (undefined) tant que la migration n'est pas passée. */
  start_time?: string | null;
  end_time?: string | null;
}
export interface Meeting {
  id: string;
  company_id: string;
  title: string;
  meeting_date: string;
  start_time: string;
  end_time: string | null;
  place: string | null;
  all_team: boolean;
  created_at?: string;
  updated_at?: string;
}
export interface TaskTemplate { id: string; text: string }

/** Ce que le planning du bureau sait des tâches et des réunions d'une période. */
export interface MissionsState {
  tasksOn: boolean;
  /** Lot 9 : les colonnes start_time / end_time existent (champs « de … à … » affichés). */
  taskTimesOn: boolean;
  meetingsOn: boolean;
  tasks: DayTask[];
  meetings: Meeting[];
  /** id de réunion → ids des participants (vide pour « Toute l'équipe »). */
  participants: Record<string, string[]>;
}
export const MISSIONS_OFF: MissionsState = { tasksOn: false, taskTimesOn: false, meetingsOn: false, tasks: [], meetings: [], participants: {} };

const TASK_COLS = 'id, company_id, user_id, work_date, text, part, created_by, created_at, done_at, done_by';
const TASK_COLS_TIMES = `${TASK_COLS}, start_time, end_time`;
// Lot 9 : null = pas encore su ; false = colonnes absentes (migration pas passée).
let taskTimes: boolean | null = null;
/** Les heures d'une tâche existent en base (dernière lecture réussie avec elles). */
export const taskTimesOn = () => taskTimes === true;

/**
 * Une lecture de day_tasks AVEC les heures ; « colonne absente » (42703) → la
 * même lecture sans elles, une seule fois, et on s'en souvient pour la suite.
 * `run` lève toute erreur.
 */
async function withTaskTimes<T>(run: (cols: string) => Promise<T>): Promise<T> {
  const tried = taskTimes !== false;
  try {
    const r = await run(tried ? TASK_COLS_TIMES : TASK_COLS);
    if (tried) taskTimes = true;
    return r;
  } catch (e) {
    if (!tried || !isMissingColumn(e)) throw e;
    taskTimes = false;
    return run(TASK_COLS);
  }
}

const MEETING_COLS = 'id, company_id, title, meeting_date, start_time, end_time, place, all_team, created_at, updated_at';
type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Les tâches d'une entreprise sur une période. 'missing' = table absente ; toute autre erreur est levée. */
async function readTasks(companyId: string, from: string, to: string): Promise<DayTask[] | 'missing'> {
  try {
    return await withTaskTimes((cols) => fetchAllPaged<DayTask>((f, t) => supabase.from('day_tasks').select(cols)
      .eq('company_id', companyId).gte('work_date', from).lte('work_date', to)
      .order('work_date').order('id').range(f, t) as unknown as Page<DayTask>));
  } catch (e) {
    if (isMissingRelation(e)) return 'missing';
    throw e;
  }
}

/** Les réunions d'une entreprise sur une période, puis leurs participants (lus à part : deux GET simples). */
async function readMeetings(companyId: string, from: string, to: string): Promise<{ meetings: Meeting[]; participants: Record<string, string[]> } | 'missing'> {
  let meetings: Meeting[];
  try {
    meetings = await fetchAllPaged<Meeting>((f, t) => supabase.from('meetings').select(MEETING_COLS)
      .eq('company_id', companyId).gte('meeting_date', from).lte('meeting_date', to)
      .order('meeting_date').order('id').range(f, t) as unknown as Page<Meeting>);
  } catch (e) {
    if (isMissingRelation(e)) return 'missing';
    throw e;
  }
  const participants: Record<string, string[]> = {};
  const ids = meetings.filter((m) => !m.all_team).map((m) => m.id);
  for (const part of chunk(ids, 100)) {
    const { data, error } = await supabase.from('meeting_participants').select('meeting_id, user_id').eq('company_id', companyId).in('meeting_id', part);
    if (error) throw error;
    for (const r of (data || []) as { meeting_id: string; user_id: string }[]) (participants[r.meeting_id] ||= []).push(r.user_id);
  }
  for (const k of Object.keys(participants)) participants[k].sort();
  return { meetings, participants };
}

/**
 * Le planning du bureau : tâches + réunions de la semaine affichée. `prev` =
 * l'état connu, gardé partie par partie quand une lecture échoue pour une autre
 * raison que « table absente ».
 */
export async function fetchOfficeMissions(companyId: string, from: string, to: string, prev: MissionsState): Promise<{ state: MissionsState; complete: boolean }> {
  const [t, m] = await Promise.all([
    readTasks(companyId, from, to).catch(() => null),
    readMeetings(companyId, from, to).catch(() => null),
  ]);
  const next: MissionsState = { ...prev };
  if (t === 'missing') Object.assign(next, { tasksOn: false, taskTimesOn: false, tasks: [] });
  else if (t) Object.assign(next, { tasksOn: true, taskTimesOn: taskTimesOn(), tasks: t });
  if (m === 'missing') Object.assign(next, { meetingsOn: false, meetings: [], participants: {} });
  else if (m) Object.assign(next, { meetingsOn: true, meetings: m.meetings, participants: m.participants });
  // complete = les deux lectures ont répondu pour CETTE période (sinon l'état gardé est celui d'avant).
  return { state: next, complete: t !== null && m !== null };
}

/**
 * Impression d'une période hors de l'écran (lib/planning-print-data.ts) : même
 * lecture, mais toute erreur autre que « table absente » est LEVÉE — une feuille
 * incomplète ne doit jamais avoir l'air complète.
 */
export async function loadMissionsForPrint(companyId: string, from: string, to: string, want: { tasks: boolean; meetings: boolean }): Promise<MissionsState> {
  const [t, m] = await Promise.all([
    want.tasks ? readTasks(companyId, from, to) : Promise.resolve('missing' as const),
    want.meetings ? readMeetings(companyId, from, to) : Promise.resolve('missing' as const),
  ]);
  return {
    tasksOn: t !== 'missing', taskTimesOn: t !== 'missing' && taskTimesOn(), tasks: t === 'missing' ? [] : t,
    meetingsOn: m !== 'missing', meetings: m === 'missing' ? [] : m.meetings, participants: m === 'missing' ? {} : m.participants,
  };
}

// ─── Écritures du bureau ─────────────────────────────────────────────────────
export interface WriteResult { ok: boolean; message?: string }
const fail = (e: unknown, fallback: string): WriteResult => ({
  ok: false,
  message: isMissingFunction(e) || isMissingRelation(e) ? DB_PENDING : ((e as { message?: string })?.message || fallback),
});

/**
 * Ajoute une tâche à la journée d'un salarié. Seules les colonnes permises
 * partent. Lot 9 : start_time / end_time partent SEULEMENT si les deux heures
 * sont données ET que les colonnes existent ; sans heure, le corps est celui du
 * lot 4, mot pour mot. Heures données mais colonnes absentes : rien n'est écrit
 * (jamais une tâche sans ses heures en silence).
 */
export async function addDayTask(p: { companyId: string; userId: string; date: string; text: string; part: TaskPart; start?: string | null; end?: string | null }): Promise<WriteResult & { task?: DayTask }> {
  const text = cleanText(p.text, TASK_TEXT_MAX);
  if (!text) return { ok: false, message: 'Écrivez la tâche.' };
  const timed = !!p.start && !!p.end;
  if (timed && !taskTimesOn()) return { ok: false, message: DB_PENDING };
  const body = { company_id: p.companyId, user_id: p.userId, work_date: p.date, text, part: p.part ?? null, ...(timed ? { start_time: p.start, end_time: p.end } : {}) };
  const insert = (cols: string) => supabase.from('day_tasks').insert(body).select(cols).single();
  let { data, error } = await insert(timed || taskTimes !== false ? TASK_COLS_TIMES : TASK_COLS);
  if (error && isMissingColumn(error)) {
    // Colonnes retirées depuis la lecture : rien n'a été écrit (une seule requête).
    taskTimes = false;
    if (timed) return { ok: false, message: DB_PENDING };
    ({ data, error } = await insert(TASK_COLS));
  }
  if (error) return fail(error, "Impossible d'ajouter la tâche.");
  return { ok: true, task: data as unknown as DayTask };
}

/** Retire une tâche (confirmation à l'écran : pas d'« Annuler » générique). */
export async function deleteDayTask(companyId: string, id: string): Promise<WriteResult> {
  const { data, error } = await supabase.from('day_tasks').delete().eq('company_id', companyId).eq('id', id).select('id');
  if (error) return fail(error, 'Impossible de retirer la tâche.');
  return (data || []).length ? { ok: true } : { ok: false, message: 'Cette tâche n’existe plus.' };
}

/** Les tâches habituelles (lues quand l'onglet « Tâche » s'ouvre). null = table absente ou illisible. */
export async function fetchTemplates(companyId: string): Promise<TaskTemplate[] | null> {
  const { data, error } = await supabase.from('task_templates').select('id, text').eq('company_id', companyId).order('text');
  if (error) return null;
  return (data || []) as TaskTemplate[];
}
/** Garde un texte dans les tâches habituelles. Déjà présent (23505) : rien à faire. */
export async function addTemplate(companyId: string, text: string): Promise<WriteResult> {
  const t = cleanText(text, TASK_TEXT_MAX);
  if (!t) return { ok: false };
  const { error } = await supabase.from('task_templates').insert({ company_id: companyId, text: t });
  if (error && (error as { code?: string }).code !== '23505') return fail(error, 'Impossible de garder la tâche.');
  return { ok: true };
}
export async function deleteTemplate(companyId: string, id: string): Promise<WriteResult> {
  const { error } = await supabase.from('task_templates').delete().eq('company_id', companyId).eq('id', id);
  return error ? fail(error, 'Impossible de retirer la tâche habituelle.') : { ok: true };
}

/** Pose ou modifie une réunion, d'un bloc (réunion + participants) : office_save_meeting, ses 8 arguments nommés. */
export async function saveMeeting(id: string | null, s: MeetingState): Promise<WriteResult & { meeting?: Meeting }> {
  const { data, error } = await supabase.rpc('office_save_meeting', {
    p_id: id,
    p_title: cleanText(s.title, MEETING_TITLE_MAX) || '',
    p_date: s.date,
    p_start: s.start,
    p_end: s.end || null,
    p_place: cleanText(s.place, MEETING_PLACE_MAX),
    p_all_team: s.allTeam,
    p_user_ids: s.allTeam ? [] : s.userIds,
  });
  if (error) return fail(error, "Impossible d'enregistrer la réunion.");
  const row = (Array.isArray(data) ? data[0] : data) as Meeting | null;
  return row ? { ok: true, meeting: row } : { ok: false, message: "Impossible d'enregistrer la réunion." };
}
export async function deleteMeeting(id: string): Promise<WriteResult> {
  const { error } = await supabase.rpc('office_delete_meeting', { p_id: id });
  return error ? fail(error, 'Impossible de retirer la réunion.') : { ok: true };
}

/**
 * Prévient par notification (si le salarié l'a activée sur son téléphone) :
 * un appel send-push par sorte de message (nouvelle / modifiée / annulée), en
 * mode « bureau connecté ». Ids de démonstration (« demo-… ») jamais envoyés.
 * JAMAIS d'e-mail : `sent: 0` veut seulement dire que personne n'a activé les
 * notifications — ils la verront dans « Ma journée ».
 */
export async function notifyMeeting(p: {
  meetingId: string; companyName: string; prev: MeetingState | null; next: MeetingState | null; team: string[];
}): Promise<{ sent: number; called: number; error?: string }> {
  const real = (ids: string[]) => ids.filter((id) => !!id && !id.startsWith('demo-'));
  const notices = meetingNotices(p.prev, p.next, real(p.team));
  let sent = 0, called = 0; let error: string | undefined;
  for (const kind of ['new', 'change', 'cancel'] as MeetingNoticeKind[]) {
    const ids = real(notices[kind]);
    if (!ids.length) continue;
    const s = kind === 'cancel' ? (p.prev || p.next)! : (p.next || p.prev)!;
    called++;
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('send-push', {
        body: {
          user_ids: ids, title: p.companyName || 'BEMEXO', url: '/poseur', tag: `reunion-${p.meetingId}`,
          body: meetingPushBody({ kind, title: s.title, date: s.date, start: s.start, place: s.place }),
        },
      });
      if (fnErr) throw fnErr;
      sent += (data as { sent?: number } | null)?.sent ?? 0;
    } catch (e) {
      error = (e as { message?: string })?.message || 'envoi impossible';
    }
  }
  return { sent, called, error };
}

// ─── Côté salarié ────────────────────────────────────────────────────────────
export interface MyMissions { on: boolean; tasks: DayTask[]; meetings: Meeting[]; participants: Record<string, string[]> }

/**
 * « Ma journée » (ou une semaine) : MES tâches et les réunions que je peux voir.
 * La RLS filtre déjà (mes tâches, mes réunions ou « Toute l'équipe ») ; mes
 * participations sont relues pour le cas d'un compte qui en voit plus.
 * 'missing' = tables absentes ; null = lecture en échec (on garde l'état connu).
 * `tasks: 'timed'` (« Ma semaine », lot 9) : les tâches seulement si leurs
 * heures existent. Une seule lecture tant qu'on ne sait pas (colonnes absentes
 * → aucune tâche, pas de relecture), aucune ensuite ; une lecture des tâches en
 * échec n'emporte jamais les réunions (comme au lot 4, où la semaine ne lisait
 * pas les tâches).
 */
export async function fetchMyMissions(userId: string, companyId: string, from: string, to: string, opts: { tasks?: boolean | 'timed' } = {}): Promise<MyMissions | 'missing' | null> {
  try {
    const noTasks = { data: [] as DayTask[], error: null as { code?: string; message?: string } | null };
    const select = (cols: string) => supabase.from('day_tasks').select(cols).eq('company_id', companyId).eq('user_id', userId).gte('work_date', from).lte('work_date', to).order('created_at');
    // Lot 9 : avec les heures si elles existent (relu sans, une fois, sinon).
    const myTasks = () => withTaskTimes(async (cols) => {
      const r = await select(cols);
      if (r.error) throw r.error;
      return { data: (r.data || []) as unknown as DayTask[], error: null };
    }).catch((e) => ({ data: null, error: e as { code?: string; message?: string } }));
    // Lot 9, semaine : avec les heures ou rien.
    const timedTasks = async () => {
      if (taskTimes === false) return noTasks;
      const r = await select(TASK_COLS_TIMES);
      if (!r.error) { taskTimes = true; return { data: (r.data || []) as unknown as DayTask[], error: null }; }
      if (isMissingColumn(r.error)) taskTimes = false;
      return noTasks;
    };
    const skipTasks = opts.tasks === false || opts.tasks === 'timed';
    const [tRes, mRes] = await Promise.all([
      opts.tasks === false ? Promise.resolve(noTasks) : opts.tasks === 'timed' ? timedTasks().catch(() => noTasks) : myTasks(),
      supabase.from('meetings').select(MEETING_COLS).eq('company_id', companyId).gte('meeting_date', from).lte('meeting_date', to).order('start_time'),
    ]);
    const tMissing = !!tRes.error && isMissingRelation(tRes.error);
    const mMissing = !!mRes.error && isMissingRelation(mRes.error);
    if (mMissing && (tMissing || skipTasks)) return 'missing';
    if ((tRes.error && !tMissing) || (mRes.error && !mMissing)) return null;
    const meetings = (mMissing ? [] : (mRes.data || [])) as Meeting[];
    const participants: Record<string, string[]> = {};
    const ids = meetings.filter((m) => !m.all_team).map((m) => m.id);
    if (ids.length) {
      const { data, error } = await supabase.from('meeting_participants').select('meeting_id, user_id').eq('user_id', userId).in('meeting_id', ids);
      if (error) return null;
      for (const r of (data || []) as { meeting_id: string; user_id: string }[]) (participants[r.meeting_id] ||= []).push(r.user_id);
    }
    return { on: true, tasks: (tMissing ? [] : (tRes.data || [])) as DayTask[], meetings, participants };
  } catch {
    return null;
  }
}

/** « Fait » (ou plus fait) : set_day_task_done, sur MA tâche seulement. */
export async function setTaskDone(id: string, done: boolean): Promise<WriteResult & { task?: DayTask; gone?: boolean }> {
  const { data, error } = await supabase.rpc('set_day_task_done', { p_task_id: id, p_done: done });
  if (error) {
    if ((error as { code?: string }).code === 'P0002') return { ok: false, gone: true, message: 'Cette tâche a été retirée par le bureau.' };
    return fail(error, 'Impossible d’enregistrer. Réessaie.');
  }
  const row = (Array.isArray(data) ? data[0] : data) as DayTask | null;
  return { ok: true, task: row || undefined };
}
