// Lot 3 — « Interventions supprimées ou décalées » : la mise en forme des
// traces, sans dépendance (navigateur et Deno). Les traces sont écrites par la
// base (supabase/migrations/20261011120000_lot3_traces_suppressions.sql) ; ici
// on ne fait que les DIRE en clair : quoi, qui, quand, avant → après.
//
// LECTURE SEULE : rien ici n'écrit, rien ne restaure (la restauration viendra
// avec les versions du planning, lot 8).

export type TraceAction = 'supprimee' | 'decalee' | 'modifiee' | 'retiree' | 'remise';
export type TraceTable = 'planning' | 'time_entries' | 'active_sessions' | 'day_tasks' | 'meetings';
export type TraceOrigin = 'ecran' | 'assistant' | 'borne' | 'systeme' | 'restauration';
type Snap = Record<string, unknown>;

export interface TraceRow {
  id: number;
  company_id: string;
  user_id: string | null;
  actor_id: string | null;
  actor_role: string | null;
  origin: TraceOrigin;
  action: TraceAction;
  object_table: TraceTable;
  object_id: string;
  work_date: string | null;
  before: Snap | null;
  after: Snap | null;
  created_at: string;
}

/** Les noms à afficher : chantiers (id → nom) et, au bureau, personnes (id → « Prénom Nom »). */
export interface TraceNames { worksites: Record<string, string>; users?: Record<string, string> }

/** Le salarié voit les 60 derniers jours. */
export const WORKER_DAYS = 60;

const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const ABSENCES: Record<string, string> = { conge: 'Congé', maladie: 'Arrêt maladie', intemperie: 'Intempérie', repos: 'Repos' };
const PARTS: Record<string, string> = { matin: 'matin', 'apres-midi': 'après-midi', soir: 'soir' };

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
/** « 08:00:00 » → « 08:00 ». */
export const hhmm = (v: unknown): string | null => (str(v) ? String(v).slice(0, 5) : null);
/** « 2026-10-14 » → « mer. 14/10 ». */
export function dayLabel(iso: unknown): string {
  const s = str(iso);
  if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return '';
  const d = new Date(`${s.slice(0, 10)}T12:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${s.slice(8, 10)}/${s.slice(5, 7)}`;
}
const parisParts = (iso: string) => {
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { day: g('day'), month: g('month'), hour: g('hour') === '24' ? '00' : g('hour'), minute: g('minute') };
};
/** Heure de Paris d'un horodatage : « 08:05 ». */
export function parisTime(iso: unknown): string | null {
  const s = str(iso);
  if (!s || Number.isNaN(Date.parse(s))) return null;
  const p = parisParts(s);
  return `${p.hour}:${p.minute}`;
}
/** Quand la trace a été écrite : « 14/10 à 10:05 » (heure de Paris). */
export function whenLabel(iso: string): string {
  if (Number.isNaN(Date.parse(iso))) return '';
  const p = parisParts(iso);
  return `${p.day}/${p.month} à ${p.hour}:${p.minute}`;
}

const isAbsence = (t: TraceRow) => t.object_table === 'planning' && !!str((t.before ?? t.after)?.absence_type);

/** Le titre de la ligne : « Intervention supprimée », « Heures changées »… */
export function traceTitle(t: TraceRow): string {
  const a = t.action;
  switch (t.object_table) {
    case 'planning': {
      const what = isAbsence(t) ? 'Absence' : 'Intervention';
      return `${what} ${{ supprimee: 'supprimée', decalee: 'décalée', modifiee: 'modifiée', retiree: 'retirée', remise: 'remise' }[a]}`;
    }
    case 'time_entries':
      return { supprimee: 'Heures supprimées', decalee: 'Heures changées', modifiee: 'Heures modifiées', retiree: 'Heures retirées', remise: 'Heures remises' }[a];
    case 'active_sessions':
      return a === 'remise' ? 'Pointage en cours remis' : 'Pointage en cours supprimé';
    case 'day_tasks':
      return a === 'remise' ? 'Tâche remise' : 'Tâche supprimée';
    case 'meetings':
      return { supprimee: 'Réunion supprimée', decalee: 'Réunion décalée', modifiee: 'Réunion modifiée', retiree: 'Réunion retirée', remise: 'Réunion remise' }[a];
  }
  return 'Changement';
}

/** Une version (avant OU après) dite en clair : jour, heures, chantier. */
export function snapshotLabel(table: TraceTable, s: Snap | null, names: TraceNames): string {
  if (!s) return '';
  const site = str(s.worksite_id) ? names.worksites[String(s.worksite_id)] || 'Chantier' : null;
  const parts: (string | null)[] = [];
  switch (table) {
    case 'planning': {
      parts.push(dayLabel(s.work_date));
      const abs = str(s.absence_type);
      if (abs) { parts.push(ABSENCES[abs] || abs); break; }
      const a = hhmm(s.estimated_start), b = hhmm(s.estimated_end);
      parts.push(a && b ? `${a}–${b}` : a ? `à ${a}` : b ? `jusqu’à ${b}` : null);
      parts.push(site);
      break;
    }
    case 'time_entries': {
      parts.push(dayLabel(s.work_date));
      const a = hhmm(s.start_time), b = hhmm(s.end_time);
      const pause = Number(s.break_minutes) > 0 ? ` (pause ${Number(s.break_minutes)} min)` : '';
      parts.push(a && b ? `${a}–${b}${pause}` : null);
      parts.push(site);
      if (s.status === 'cancelled') parts.push('retirée');
      break;
    }
    case 'active_sessions': {
      parts.push(dayLabel(s.work_date));
      const t = parisTime(s.started_at);
      parts.push(t ? `commencé à ${t}` : null);
      parts.push(site);
      break;
    }
    case 'day_tasks': {
      parts.push(dayLabel(s.work_date));
      parts.push(str(s.part) ? PARTS[String(s.part)] || String(s.part) : null);
      parts.push(str(s.text) ? `« ${s.text} »` : null);
      break;
    }
    case 'meetings': {
      parts.push(dayLabel(s.meeting_date));
      const a = hhmm(s.start_time), b = hhmm(s.end_time);
      parts.push(a && b ? `${a}–${b}` : a);
      parts.push(str(s.title) ? `« ${s.title} »` : null);
      parts.push(str(s.place));
      break;
    }
  }
  return parts.filter(Boolean).join(' · ');
}

/** Avant → après : ce qui est montré sous le titre. Une suppression n'a qu'un avant, une remise qu'un après. */
export function traceChange(t: TraceRow, names: TraceNames): { before: string | null; after: string | null } {
  const b = t.action === 'remise' ? null : snapshotLabel(t.object_table, t.before, names) || null;
  const a = t.action === 'supprimee' ? null : snapshotLabel(t.object_table, t.after, names) || null;
  return { before: b, after: a };
}

const night = (iso: string) => { const h = Number(parisParts(iso).hour); return h < 6 || h >= 22; };

/** Personne n'a agi : le système (cron de nuit, service). */
export const isSystemTrace = (t: TraceRow) => !t.actor_id || t.origin === 'systeme';

/**
 * Qui a agi, du point de vue de celui qui lit (l'écran écrit « par … » devant,
 * sauf pour le système).
 *  · le salarié : « vous », « le bureau », « le chef d’équipe », « l’assistant… » ;
 *  · le bureau : le nom de la personne (repli sur son rôle) ;
 *  · le système : « automatiquement, la nuit » (ou « automatiquement »).
 */
export function traceWho(t: TraceRow, viewer: { id: string; office: boolean }, names: TraceNames): string {
  const actor = t.actor_id;
  if (!actor || isSystemTrace(t)) return night(t.created_at) ? 'automatiquement, la nuit' : 'automatiquement';
  const role = t.actor_role === 'admin' ? 'le bureau' : t.actor_role === 'lead' ? 'le chef d’équipe' : 'un salarié';
  if (viewer.office) {
    const name = names.users?.[actor] || (actor === viewer.id ? 'vous' : role);
    return t.origin === 'assistant' ? `${name}, par l’assistant` : name;
  }
  if (actor === viewer.id) return t.origin === 'assistant' ? 'l’assistant, à votre demande' : 'vous';
  if (t.origin === 'assistant') return t.actor_role === 'admin' ? 'l’assistant du bureau' : 'l’assistant';
  return role;
}

/** L'origine, pour le bureau. */
export const ORIGIN_LABEL: Record<TraceOrigin, string> = {
  ecran: 'Écran', assistant: 'Assistant', borne: 'Borne', systeme: 'Automatique', restauration: 'Restauration',
};

/** Le salarié concerné (bureau) : le nom, sinon « Toute l’équipe » / la liste des participants d'une réunion. */
export function traceConcerned(t: TraceRow, names: TraceNames): string {
  if (t.user_id) return names.users?.[t.user_id] || 'Salarié supprimé';
  if (t.object_table === 'meetings') {
    const s = t.before ?? t.after;
    if (s?.all_team === true) return 'Toute l’équipe';
    const ids = Array.isArray(s?.participants) ? (s!.participants as unknown[]).map(String) : [];
    const list = ids.map((id) => names.users?.[id] || 'Salarié supprimé');
    return list.length ? list.join(', ') : 'Réunion';
  }
  return '';
}

/** Les chantiers cités par des traces (pour lire leurs noms en une fois). */
export function worksiteIds(rows: TraceRow[]): string[] {
  const out = new Set<string>();
  for (const t of rows) for (const s of [t.before, t.after]) if (s && str(s.worksite_id)) out.add(String(s.worksite_id));
  return Array.from(out);
}

/** Les personnes citées (auteurs, salariés concernés, participants) — au bureau. */
export function personIds(rows: TraceRow[]): string[] {
  const out = new Set<string>();
  for (const t of rows) {
    if (t.actor_id) out.add(t.actor_id);
    if (t.user_id) out.add(t.user_id);
    const p = (t.before ?? t.after)?.participants;
    if (Array.isArray(p)) for (const id of p) out.add(String(id));
  }
  return Array.from(out);
}

/** « aaaa-mm-jj » il y a n jours (jour de Paris). */
export function daysAgoISO(today: string, n: number): string {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Un jour de Paris « aaaa-mm-jj » → l'instant de son début (minuit à Paris), en ISO. */
export function parisMidnightISO(day: string): string {
  // Minuit à Paris = 22:00 ou 23:00 UTC la veille : on cherche le décalage du jour.
  const offset = Number(parisParts(`${day}T12:00:00Z`).hour) - 12; // +1 (hiver) ou +2 (été)
  return new Date(Date.parse(`${day}T00:00:00Z`) - offset * 3600_000).toISOString();
}
