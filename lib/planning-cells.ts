// Lot 3bis — ce que montre UNE case du planning (salarié × jour), partagé par
// l'écran (admin-planning) et la feuille imprimée (planning-print) : quelle
// bulle porte quelles heures, brouillons, heures ajoutées hors planning, cases
// retirées. Déplacé tel quel depuis admin-planning.tsx : l'écran et le papier
// lisent la MÊME règle, ils ne peuvent plus diverger.
//
// Pur, sans base ni React. Import relatif avec extension (comme copy-slot.ts) :
// testé par Deno (supabase/functions/_shared/planning-cells.test.ts).
import { isReserveLifted } from './reserves.ts';

/** Ce que ces règles lisent d'une ligne de planning (PlanningWithWorksite convient). */
export interface SlotLike {
  id: string; user_id: string; work_date: string; worksite_id: string | null;
  absence_type?: string | null; added_by_worker?: boolean; created_at: string; position?: number | null;
  notes?: string | null; worksite?: { client_name: string } | null;
}

export type ReceptionStatus = 'sans' | 'avec' | 'en_cours' | null;
export const RECEPTION_RANK: Record<string, number> = { avec: 3, en_cours: 2, sans: 1 };
export interface RealAgg { minutes: number; start: string; end: string; count: number; reception: ReceptionStatus;
  /** Au moins une réserve de cette case n'a pas encore été levée par le bureau. */
  reserveOpen: boolean; note: string }
export const realKey = (userId: string, date: string, worksiteId: string | null) => `${userId}|${date}|${worksiteId}`;
/** Une ligne d'heures envoyées (submitted / validated) telle que la grille la lit. */
export interface EntryRow {
  user_id: string; work_date: string; worksite_id: string | null; planning_id?: string | null; start_time: string; end_time: string;
  total_minutes: number; reception: string | null; reserve_resolved_at: string | null; reserve_fixed_at?: string | null; observation: string | null;
}
export const SENT_COLS = 'user_id, work_date, worksite_id, planning_id, start_time, end_time, total_minutes, reception, reserve_resolved_at, reserve_fixed_at, observation';
/** Un brouillon tel que la grille le lit (lot 2 : de quoi reconnaître le brouillon vide). */
export interface DraftRow {
  id?: string; status?: string; user_id: string; work_date: string; worksite_id: string | null; planning_id?: string | null;
  start_time: string; end_time: string; total_minutes: number; reception: string | null; reserve_resolved_at: string | null;
  reserve_fixed_at?: string | null; observation: string | null; locked?: boolean; exit_forgotten?: boolean | null; submitted_at?: string | null;
}
// `exit_forgotten` (lot 12) peut manquer en base : la lecture est refaite sans elle.
export const DRAFT_COLS = 'id, status, user_id, work_date, worksite_id, planning_id, start_time, end_time, total_minutes, reception, reserve_resolved_at, reserve_fixed_at, observation, locked, submitted_at';

/** Lot 11 : identifiants des cases retirées par le salarié, triés (keep() compare le contenu ET l'ordre). */
export const withdrawnSet = (rows: { planning_id: string | null }[] | null): Set<string> =>
  new Set((rows || []).map((r) => r.planning_id).filter((id): id is string => !!id).sort());

/** Lot 1 : ce que la fenêtre « Supprimer ? » du planning annonce. */
export interface EraseAsk { count: number; days: { date: string; n: number }[]; withHours: number }
/**
 * Lot 1 (heures sûres, décision D3) : supprimer depuis le planning. UNE case
 * sans heures → tout de suite, avec « Annuler ». PLUSIEURS cases, ou une case
 * qui porte des heures (retirées par le salarié : ces heures restent, seul le
 * lien avec la case disparaît) → on demande d'abord. Une case avec des heures
 * notées ou envoyées n'arrive jamais ici : elle n'est pas supprimable.
 * Rend null (supprimer tout de suite) ou ce que la fenêtre doit dire.
 */
export function eraseConfirmation(slots: Pick<SlotLike, 'id' | 'work_date'>[], ids: string[], withdrawn: Set<string>): EraseAsk | null {
  const want = new Set(ids);
  const pick = slots.filter((s) => want.has(s.id));
  const withHours = pick.filter((s) => withdrawn.has(s.id)).length;
  if (pick.length <= 1 && !withHours) return null;
  const by = new Map<string, number>();
  for (const s of pick) by.set(s.work_date, (by.get(s.work_date) || 0) + 1);
  return { count: pick.length, days: Array.from(by.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, n]) => ({ date, n })), withHours };
}
/** Le jour suivant, « AAAA-MM-JJ » (calcul en UTC : pas de piège d'heure d'été). */
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
/**
 * Lot 1 : « Présent à partir du… » met fin à l'absence EN COURS ce jour-là —
 * les jours d'absence qui se suivent depuis `from`. Une absence posée plus
 * tard (un congé de décembre) n'est pas touchée : `later` = son premier jour.
 * Une absence est posée jour par jour, week-ends compris (setAbsence).
 */
export function absenceRunFrom(rows: { id: string; work_date: string }[], from: string): { ids: string[]; days: string[]; later: string | null } {
  const byDay = new Map<string, string[]>();
  for (const r of rows) if (r.work_date >= from) { const l = byDay.get(r.work_date); if (l) l.push(r.id); else byDay.set(r.work_date, [r.id]); }
  const ids: string[] = [], days: string[] = [];
  for (let d = from; byDay.has(d); d = nextDay(d)) { days.push(d); ids.push(...byDay.get(d)!); }
  const end = days.length ? days[days.length - 1] : '';
  const later = Array.from(byDay.keys()).filter((d) => d > from && d > end).sort()[0] ?? null;
  return { ids, days, later };
}
// « Autre » (intervention hors client, ajoutée par l'assistant) : son titre est la note.
export const bubbleTitleOf = (p: Pick<SlotLike, 'worksite' | 'notes'>): string =>
  (p.worksite?.client_name === 'Autre' && p.notes?.trim()) || p.worksite?.client_name || 'Chantier';

// Display order inside a cell: manual position first (asc), then creation order.
export const orderCmp = (a: Pick<SlotLike, 'position' | 'created_at'>, b: Pick<SlotLike, 'position' | 'created_at'>) => {
  const pa = a.position ?? null;
  const pb = b.position ?? null;
  if (pa !== null && pb !== null) return pa - pb;
  if (pa !== null) return -1;
  if (pb !== null) return 1;
  return (a.created_at || '').localeCompare(b.created_at || '');
};

type EntryKey = { user_id: string; work_date: string; worksite_id: string | null; planning_id?: string | null };

/**
 * La bulle qui porte une ligne d'heures : celle de son planning_id, sinon, pour
 * les heures sans lien d'un chantier, la bulle « ajoutée par le salarié », sinon
 * la plus ANCIENNE (lot 2), à égalité le plus petit id. Une absence ne porte rien.
 * Sans bulle du même chantier ce jour-là : la clé de case (heures « hors planning »).
 */
export function makeBubbleKeyOf(planning: SlotLike[]): (e: EntryKey) => string {
  const groups = new Map<string, Set<string>>();
  const owner = new Map<string, SlotLike>(); // case → bulle des heures sans lien
  const first = (a: SlotLike, b: SlotLike) => (
    !!a.added_by_worker !== !!b.added_by_worker ? !!a.added_by_worker
      : (a.created_at || '') !== (b.created_at || '') ? (a.created_at || '') < (b.created_at || '') : a.id < b.id);
  for (const p of planning) {
    if (p.absence_type) continue;
    const k = realKey(p.user_id, p.work_date, p.worksite_id);
    const set = groups.get(k);
    if (set) set.add(p.id); else groups.set(k, new Set([p.id]));
    const cur = owner.get(k);
    if (!cur || first(p, cur)) owner.set(k, p);
  }
  return (e) => {
    const k = realKey(e.user_id, e.work_date, e.worksite_id);
    const set = groups.get(k);
    if (!set) return k;
    return `p:${e.planning_id && set.has(e.planning_id) ? e.planning_id : owner.get(k)!.id}`;
  };
}

/** Additionne les lignes de chaque bulle : minutes, début le plus tôt, fin la plus tardive, réception la plus forte, notes. */
export function aggregateEntries(rows: EntryRow[], keyOf: (e: EntryKey) => string): Map<string, RealAgg> {
  const m = new Map<string, RealAgg>();
  for (const e of rows) {
    const k = keyOf(e);
    const cur = m.get(k);
    // Une réserve « ouverte » = déclarée ET pas encore levée (par le bureau ou,
    // lot 11, par le salarié : lib/reserves isReserveLifted). Sans cette
    // distinction, le triangle d'alerte resterait allumé à vie sur la case.
    const stillOpen = e.reception === 'avec' && !isReserveLifted(e);
    if (!cur) m.set(k, { minutes: e.total_minutes, start: e.start_time, end: e.end_time, count: 1, reception: (e.reception as ReceptionStatus) || null, reserveOpen: stillOpen, note: e.observation || '' });
    else {
      cur.minutes += e.total_minutes;
      if (e.start_time && e.start_time < cur.start) cur.start = e.start_time;
      if (e.end_time && e.end_time > cur.end) cur.end = e.end_time;
      cur.count += 1;
      // garde le statut le plus « fort » (avec > en_cours > sans) + cumule les notes
      if ((RECEPTION_RANK[e.reception || ''] || 0) > (RECEPTION_RANK[cur.reception || ''] || 0)) cur.reception = (e.reception as ReceptionStatus) || cur.reception;
      if (stillOpen) cur.reserveOpen = true;
      if (e.observation) cur.note = cur.note ? `${cur.note} · ${e.observation}` : e.observation;
    }
  }
  return m;
}

export interface ExtraDeclared { worksiteId: string | null; name: string; minutes: number; pending: boolean }
// Declared hours that DON'T match a planned chantier of the cell (hors-planning) —
// shown as a distinct "déclaré par le salarié" chip on the grid.
export function extraDeclared(planning: SlotLike[], real: EntryRow[], drafts: EntryRow[], wsNames: Map<string, string>, workerId: string, dateStr: string): ExtraDeclared[] {
  const plannedWs = new Set(
    planning.filter((p) => p.user_id === workerId && p.work_date === dateStr && !p.absence_type).map((p) => p.worksite_id),
  );
  const agg = new Map<string, ExtraDeclared>();
  const add = (rows: EntryRow[], pending: boolean) => {
    for (const e of rows) {
      if (e.user_id !== workerId || e.work_date !== dateStr) continue;
      if (e.worksite_id && plannedWs.has(e.worksite_id)) continue; // déjà porté par sa bulle
      const key = `${e.worksite_id || 'none'}|${pending ? 'd' : 'r'}`;
      const name = (e.worksite_id && wsNames.get(e.worksite_id)) || 'Autre';
      const cur = agg.get(key);
      if (cur) cur.minutes += e.total_minutes;
      else agg.set(key, { worksiteId: e.worksite_id, name, minutes: e.total_minutes, pending });
    }
  };
  add(real, false);
  add(drafts, true);
  return Array.from(agg.values());
}

/** Ce que la feuille imprimée lit d'une période : les lignes, déjà filtrées comme à l'écran. */
export interface PrintRowsIn<P extends SlotLike> { planning: P[]; real: EntryRow[]; drafts: EntryRow[]; withdrawn: Set<string> }
export interface PrintSource<P extends SlotLike> {
  /** Les bulles de la case, dans l'ordre de l'écran (sans les absences). */
  slots: (uid: string, iso: string) => P[];
  /** La première absence de la case (comme planning.find à l'écran). */
  absence: (uid: string, iso: string) => P | undefined;
  real: (p: P) => RealAgg | undefined;
  /** Brouillon montré seulement s'il n'y a pas déjà des heures envoyées. */
  draft: (p: P) => RealAgg | undefined;
  withdrawn: (id: string) => boolean;
  extra: (uid: string, iso: string) => ExtraDeclared[];
  /** Le titre écrit sur la bulle (BubbleContent : chantier si heures, sinon bubbleTitleOf). */
  titleOf: (p: P) => string;
}

/**
 * Les mêmes règles que la grille, indexées une fois par case : une feuille d'un
 * mois pour 40 salariés lit 1 240 cases sans reparcourir toutes les lignes.
 */
export function makePrintSource<P extends SlotLike>(d: PrintRowsIn<P>, wsNames: Map<string, string>): PrintSource<P> {
  const keyOf = makeBubbleKeyOf(d.planning);
  const realMap = aggregateEntries(d.real, keyOf);
  const draftMap = aggregateEntries(d.drafts, keyOf);
  const cell = (uid: string, iso: string) => `${uid}|${iso}`;
  const slotsBy = new Map<string, P[]>();
  const absBy = new Map<string, P>();
  for (const p of d.planning) {
    const k = cell(p.user_id, p.work_date);
    if (p.absence_type) { if (!absBy.has(k)) absBy.set(k, p); continue; }
    const l = slotsBy.get(k);
    if (l) l.push(p); else slotsBy.set(k, [p]);
  }
  slotsBy.forEach((l) => l.sort(orderCmp));
  const rowsBy = (rows: EntryRow[]) => {
    const m = new Map<string, EntryRow[]>();
    for (const e of rows) { const k = cell(e.user_id, e.work_date); const l = m.get(k); if (l) l.push(e); else m.set(k, [e]); }
    return m;
  };
  const realBy = rowsBy(d.real), draftBy = rowsBy(d.drafts);
  const NONE: never[] = [];
  const real = (p: P) => (p.absence_type ? undefined : realMap.get(`p:${p.id}`));
  const draft = (p: P) => (p.absence_type || realMap.has(`p:${p.id}`) ? undefined : draftMap.get(`p:${p.id}`));
  return {
    slots: (uid, iso) => slotsBy.get(cell(uid, iso)) || NONE,
    absence: (uid, iso) => absBy.get(cell(uid, iso)),
    real,
    draft,
    withdrawn: (id) => d.withdrawn.has(id),
    extra: (uid, iso) => {
      const k = cell(uid, iso);
      return extraDeclared(slotsBy.get(k) || NONE, realBy.get(k) || NONE, draftBy.get(k) || NONE, wsNames, uid, iso);
    },
    titleOf: (p) => (real(p) || draft(p) ? p.worksite?.client_name || 'Chantier' : bubbleTitleOf(p)),
  };
}
