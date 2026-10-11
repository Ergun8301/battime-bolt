// Lot 4 — missions (tâches du jour) et réunions : les règles PURES, partagées
// par le bureau (admin-planning, impression), le salarié (« Ma journée »,
// « Semaine ») et les tests. Sans base, sans réseau, sans Intl : le même texte
// partout.
//
// NE COMPTE JAMAIS COMME HEURES. Rien ici ne calcule d'heures : une réunion ou
// une tâche n'est jamais une ligne de planning ni une ligne d'heures (tables à
// part, voir supabase/migrations/20261010170000_lot4_missions_reunions.sql).
// Totaux, export, coûts, relances et borne ne lisent jamais ces données — et ne
// doivent pas commencer à le faire (statistiques futures comprises).
import { DAY_PART_INK, DAY_PARTS, dayPartOf, toMinutes, type DayPart } from './day-part.ts';
import { jourMois } from './office-edits.ts';

export type TaskPart = DayPart | null;
/** Ordre d'affichage : matin, après-midi, soir, puis sans moment. */
export const TASK_PART_ORDER: TaskPart[] = ['matin', 'apres-midi', 'soir', null];
export const TASK_TEXT_MAX = 200;
export const MEETING_TITLE_MAX = 120;
export const MEETING_PLACE_MAX = 160;

/** Le moment d'une tâche, à l'écran : mêmes libellés et couleurs que les créneaux du planning. */
export function taskPartInfo(part: TaskPart): { label: string; bg: string; edge: string } | null {
  const d = DAY_PARTS.find((x) => x.key === part);
  return d ? { label: d.label, bg: d.bg, edge: d.edge } : null;
}

export interface TaskLike {
  id: string;
  user_id: string;
  work_date: string;
  text: string;
  part: TaskPart;
  created_at: string;
  done_at: string | null;
  /** Lot 9 : heures facultatives (« 10:00:00 »), les deux ou aucune. Absentes tant que la migration n'est pas passée. */
  start_time?: string | null;
  end_time?: string | null;
}

/** Espaces en trop retirés ; null si vide ; coupé à `max` caractères. */
export function cleanText(s: string | null | undefined, max: number): string | null {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max).trim() : t;
}

/**
 * Lot 9 : d'abord les tâches AVEC heure, par heure de début (puis de fin) ;
 * ensuite celles sans heure, par moment (matin → soir → sans moment). À
 * égalité : l'ordre d'ajout.
 */
export function sortTasks<T extends TaskLike>(tasks: T[]): T[] {
  const rank = (p: TaskPart) => { const i = TASK_PART_ORDER.indexOf(p ?? null); return i < 0 ? TASK_PART_ORDER.length : i; };
  const at = (t: TaskLike) => (taskTimeLabel(t) ? toMinutes(t.start_time) : null);
  return [...tasks].sort((a, b) => {
    const sa = at(a), sb = at(b);
    if (sa !== null && sb !== null) { if (sa !== sb) return sa - sb; }
    else if (sa !== null || sb !== null) return sa !== null ? -1 : 1;
    return (sa !== null ? (toMinutes(a.end_time) ?? 0) - (toMinutes(b.end_time) ?? 0) : rank(a.part) - rank(b.part))
      || String(a.created_at).localeCompare(String(b.created_at))
      || String(a.id).localeCompare(String(b.id));
  });
}

// ─── Lot 9 : tâches avec heure de début et de fin ───────────────────────────

/** « 10:00–11:30 » quand la tâche a ses deux heures (lisibles) ; sinon ''. */
export function taskTimeLabel(t: { start_time?: string | null; end_time?: string | null }): string {
  const s = hhmm(t.start_time), e = hhmm(t.end_time);
  return s && e ? `${s}–${e}` : '';
}

/**
 * Le moment déduit des heures, avec la MÊME règle que la couleur des créneaux
 * (day-part.ts) : 10:00–11:30 → matin, 14:00–15:00 → après-midi. Sur deux
 * créneaux (08:00–17:00) ou sans heures lisibles → sans moment.
 */
export function taskPartFromTimes(start?: string | null, end?: string | null): TaskPart {
  if (!hhmm(start) || !hhmm(end)) return null;
  const p = dayPartOf(start, end);
  return p === 'journee' ? null : p;
}

/** Mêmes refus que la contrainte day_tasks_times_check. '' = pas d'heure. */
export function validateTaskTimes(start?: string | null, end?: string | null): string | null {
  const s = hhmm(start), e = hhmm(end);
  if (!s && !e) return null;
  if (!s || !e) return 'Indiquez l’heure de début et l’heure de fin (ou aucune).';
  if ((toMinutes(e) ?? 0) <= (toMinutes(s) ?? 0)) return 'La fin doit être après le début.';
  return null;
}

export interface PlannedSlot { start?: string | null; end?: string | null }

/**
 * La tâche sort-elle du (des) créneau(x) prévu(s) du salarié ce jour-là ?
 * Créneau = une intervention du planning avec début ET fin estimés ; les
 * créneaux qui se touchent ou se chevauchent n'en font qu'un (08:00–12:00 +
 * 12:00–17:00 = 08:00–17:00). Fin avant le début = poste de nuit, coupé à
 * minuit (comme day-part.ts). Sans aucun créneau horaire (pas de planning, un
 * rendez-vous « à 14:00 » seul…) : rien à comparer, pas d'alerte.
 * `label` = les créneaux tels qu'écrits sur les bulles : « 08:00–12:00, 13:30–17:00 ».
 */
export function taskOutsideSlots(start: string | null | undefined, end: string | null | undefined, slots: PlannedSlot[]): { outside: boolean; label: string } {
  const spans = slots
    .map((x) => {
      const a = toMinutes(x.start), b = toMinutes(x.end);
      if (a === null || b === null || a === b) return null;
      return { a, b: b < a ? 24 * 60 : b, label: `${hhmm(x.start)}–${hhmm(x.end)}` };
    })
    .filter((x): x is { a: number; b: number; label: string } => !!x)
    .sort((x, y) => x.a - y.a || x.b - y.b);
  const label = Array.from(new Set(spans.map((x) => x.label))).join(', ');
  const s = toMinutes(start), e = toMinutes(end);
  if (!spans.length || s === null || e === null) return { outside: false, label };
  const merged: { a: number; b: number }[] = [];
  for (const x of spans) {
    const last = merged[merged.length - 1];
    if (last && x.a <= last.b) last.b = Math.max(last.b, x.b);
    else merged.push({ a: x.a, b: x.b });
  }
  return { outside: !merged.some((m) => s >= m.a && e <= m.b), label };
}

/** « Cette tâche dépasse le créneau prévu (08:00–12:00). Ajouter quand même ? » */
export function taskOutsideMessage(label: string): string {
  return `Cette tâche dépasse ${label.includes(',') ? 'les créneaux prévus' : 'le créneau prévu'} (${label}). Ajouter quand même ?`;
}

/** « 1/3 » : faites / toutes. */
export function taskProgress(tasks: { done_at: string | null }[]): { done: number; total: number; label: string } {
  const done = tasks.filter((t) => !!t.done_at).length;
  return { done, total: tasks.length, label: `${done}/${tasks.length}` };
}

/** Les tâches d'une case salarié × jour, triées. */
export function tasksFor<T extends TaskLike>(tasks: T[], userId: string, date: string): T[] {
  return sortTasks(tasks.filter((t) => t.user_id === userId && t.work_date === date));
}

// ─── Réunions ────────────────────────────────────────────────────────────────

/**
 * La couleur À PART d'une réunion : un rose, ni jaune (aujourd'hui, sélection),
 * ni vert (pointage en direct), ni l'une des trois teintes des créneaux. Bordure
 * PLEINE et pas de barre à gauche : elle ne passe jamais pour un chantier. La
 * couleur ne suffit pas (daltonisme) : la pastille dit toujours « 👥 » et
 * « Réunion ». Contrastes et écarts vérifiés dans missions.test.ts.
 */
export const MEETING_TINT = { bg: '#F9D6E0', edge: '#9E2A55', ink: DAY_PART_INK } as const;

export interface MeetingLike {
  id: string;
  title: string;
  meeting_date: string;
  start_time: string;
  end_time: string | null;
  place: string | null;
  all_team: boolean;
}

/** « 14:00:00 » → « 14:00 » ; tout le reste → ''. */
export const hhmm = (t?: string | null) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '').trim()); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''; };

/** « 14:00 » ou « 14:00–15:00 ». */
export function meetingTimeLabel(start?: string | null, end?: string | null): string {
  const s = hhmm(start), e = hhmm(end);
  return s && e ? `${s}–${e}` : s;
}

/**
 * Les réunions d'une personne, un jour donné, par heure : « Toute l'équipe »
 * (si la personne fait partie de l'équipe : salarié ou chef d'équipe), ou
 * celles où elle est invitée.
 */
export function meetingsFor<M extends MeetingLike>(
  meetings: M[], participants: Record<string, string[]>, userId: string, date: string, teamMember = true,
): M[] {
  return meetings
    .filter((m) => m.meeting_date === date && ((m.all_team && teamMember) || (participants[m.id] || []).includes(userId)))
    .sort((a, b) => hhmm(a.start_time).localeCompare(hhmm(b.start_time)) || a.title.localeCompare(b.title, 'fr') || a.id.localeCompare(b.id));
}

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

/** Mêmes refus, mêmes mots que office_save_meeting (le serveur vérifie de toute façon). */
export function validateMeeting(p: { title: string; date: string; start: string; end?: string | null; place?: string | null; allTeam: boolean; userIds: string[] }): string | null {
  const title = (p.title || '').trim();
  if (title.length < 1 || title.length > MEETING_TITLE_MAX) return 'Donnez un titre (120 caractères au plus).';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '') || !hhmm(p.start)) return 'Indiquez la date et l’heure.';
  if (hhmm(p.end) && toMin(hhmm(p.end)) <= toMin(hhmm(p.start))) return 'La fin doit être après le début.';
  if ((p.place || '').trim().length > MEETING_PLACE_MAX) return 'Lieu trop long (160 caractères au plus).';
  if (!p.allTeam && p.userIds.filter(Boolean).length === 0) return 'Choisissez au moins un participant.';
  return null;
}

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
/** « jeudi 15 octobre » — jour de la semaine calculé en UTC (le même partout). */
export function jourComplet(iso: string): string {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : `${JOURS[d.getUTCDay()]} ${jourMois(iso)}`;
}

export type MeetingNoticeKind = 'new' | 'change' | 'cancel';
export const PUSH_MAX = 180;
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/**
 * Le texte de la notification (une phrase, lue souvent sans ouvrir l'appli).
 * Jamais d'adresse, de lien ni d'e-mail : seulement la réunion.
 *   « Réunion « Point sécurité » jeudi 15 octobre à 14:00 · Dépôt »
 *   « Réunion modifiée : « Point sécurité » jeudi 15 octobre à 15:00 · Dépôt »
 *   « Réunion annulée : « Point sécurité » du jeudi 15 octobre »
 */
export function meetingPushBody(p: { kind: MeetingNoticeKind; title: string; date: string; start: string; place?: string | null }): string {
  const title = clip(cleanText(p.title, MEETING_TITLE_MAX) || 'Réunion', 70);
  const jour = jourComplet(p.date);
  if (p.kind === 'cancel') return clip(`Réunion annulée : « ${title} » du ${jour}`, PUSH_MAX);
  const place = cleanText(p.place, MEETING_PLACE_MAX);
  const head = p.kind === 'change' ? 'Réunion modifiée : ' : 'Réunion ';
  return clip(`${head}« ${title} » ${jour} à ${hhmm(p.start)}${place ? ` · ${place}` : ''}`, PUSH_MAX);
}

export interface MeetingState { title: string; date: string; start: string; end: string | null; place: string | null; allTeam: boolean; userIds: string[] }

/**
 * Qui prévenir, et avec quel texte, après un enregistrement :
 *  - nouvelle réunion : tous ses participants → « nouvelle » ;
 *  - modification : les ajoutés → « nouvelle », les retirés → « annulée »,
 *    les autres → « modifiée » seulement si le titre, la date, l'heure ou le
 *    lieu ont changé ;
 *  - retrait (next = null) : tous → « annulée ».
 * `team` = les salariés et chefs d'équipe actifs (« Toute l'équipe »).
 */
export function meetingNotices(prev: MeetingState | null, next: MeetingState | null, team: string[]): Record<MeetingNoticeKind, string[]> {
  const who = (s: MeetingState | null) => (!s ? [] : Array.from(new Set(s.allTeam ? team : s.userIds)));
  const before = who(prev), after = who(next);
  if (!next) return { new: [], change: [], cancel: before };
  if (!prev) return { new: after, change: [], cancel: [] };
  const changed = prev.title.trim() !== next.title.trim() || prev.date !== next.date || hhmm(prev.start) !== hhmm(next.start)
    || hhmm(prev.end) !== hhmm(next.end) || (prev.place || '').trim() !== (next.place || '').trim();
  return {
    new: after.filter((id) => !before.includes(id)),
    change: changed ? after.filter((id) => before.includes(id)) : [],
    cancel: before.filter((id) => !after.includes(id)),
  };
}

// ─── Tables pas encore créées (migration pas appliquée) ──────────────────────
type PgErr = { code?: string; message?: string } | null | undefined;
/** Table absente : PostgREST (PGRST205) ou Postgres (42P01). La fonction se cache. */
export const isMissingRelation = (e: unknown) => ['PGRST205', '42P01'].includes(String((e as PgErr)?.code || ''));
/**
 * Lot 9 : colonne absente (start_time / end_time pas encore créées) — Postgres
 * en lecture (42703), PostgREST en écriture (PGRST204). On relit sans les heures.
 */
export const isMissingColumn = (e: unknown) => ['42703', 'PGRST204'].includes(String((e as PgErr)?.code || ''));
/** Fonction absente : PostgREST (PGRST202) ou Postgres (42883). Rien n'est écrit. */
export const isMissingFunction = (e: unknown) => ['PGRST202', '42883'].includes(String((e as PgErr)?.code || ''));
export const DB_PENDING = 'Mise à jour de la base en attente : rien n’a été modifié.';
