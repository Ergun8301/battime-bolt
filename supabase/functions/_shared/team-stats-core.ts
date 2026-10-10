// Lot 5 — « Statistiques » du bureau (lecture seule). Les règles PURES, sans
// base ni bibliothèque : importables par l'app (lib/team-stats.ts,
// lib/work-status.ts, le cockpit) ET par Deno (team-stats-core.test.ts).
//
// AUCUNE DEUXIÈME DÉFINITION. Ce fichier ne recalcule ni les heures, ni les
// heures supplémentaires, ni le coût :
//   · heures et heures sup = weeklyRecap de lib/export-utils.ts (le CSV de
//     paie), avec `payPeriod` — la semaine entière CLASSE, seuls les jours de
//     la période COMPTENT ; ici on ne fait que sommer ses lignes (recapByUser) ;
//   · coût = la fonction SQL my_worksite_labour (« Coût chantiers ») ; ici on
//     ne fait que sommer ses lignes par salarié (labourByUser) ;
//   · journées oubliées = la règle du cockpit « à relancer ». Ses deux briques
//     (missingDays, withIncomplete) VIVENT ICI depuis le lot 5 et
//     lib/work-status.ts les appelle : le cockpit, la fiche salarié et les
//     statistiques lisent la même fonction.
// Tâches et réunions (lot 4) vivent dans leurs propres tables : rien ici ne
// les lit, elles ne comptent jamais.
//
// Toutes les dates sont des chaînes 'yyyy-MM-dd' (jour de Paris, comme partout
// dans BEMEXO) ; le calcul se fait en UTC sur ces chaînes, donc sans piège
// d'heure d'été.

// Le calendrier (lundi d'une semaine, jour + n) est celui de la feuille imprimée
// (lot 3bis) : une seule arithmétique de dates pures dans _shared.
import { addDaysISO, weekStartISO } from './print-period.ts';

export type PeriodKind = 'week' | 'month' | 'year';
export interface Period { kind: PeriodKind; from: string; to: string }

const MS_DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
const toUTC = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/** Le lundi de la semaine BEMEXO (lundi → dimanche, lib/week.ts). */
export const mondayOf = weekStartISO;
/** Le dimanche de la semaine. */
export function sundayOf(iso: string): string { return addDaysISO(weekStartISO(iso), 6); }

/** Numéro de semaine ISO 8601 (celui affiché « S-43 » sur le planning). */
export function isoWeek(iso: string): number {
  const thursday = addDaysISO(mondayOf(iso), 3);
  const jan1 = `${thursday.slice(0, 4)}-01-01`;
  return Math.floor((toUTC(thursday) - toUTC(jan1)) / MS_DAY / 7) + 1;
}

/** La période qui contient `anchor` : semaine lundi → dimanche, mois civil, année civile. */
export function periodFor(kind: PeriodKind, anchor: string): Period {
  if (kind === 'week') return { kind, from: mondayOf(anchor), to: sundayOf(anchor) };
  const y = Number(anchor.slice(0, 4));
  if (kind === 'month') {
    const m = Number(anchor.slice(5, 7));
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { kind, from: `${anchor.slice(0, 7)}-01`, to: `${anchor.slice(0, 7)}-${pad(last)}` };
  }
  return { kind, from: `${y}-01-01`, to: `${y}-12-31` };
}

/** La période précédente (-1) ou suivante (+1), de même nature. */
export function shiftPeriod(p: Period, delta: number): Period {
  if (p.kind === 'week') return periodFor('week', addDaysISO(p.from, 7 * delta));
  const y = Number(p.from.slice(0, 4));
  if (p.kind === 'month') {
    const idx = y * 12 + (Number(p.from.slice(5, 7)) - 1) + delta;
    return periodFor('month', `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}-01`);
  }
  return periodFor('year', `${y + delta}-01-01`);
}

/** Une période qui commence après aujourd'hui : rien à compter, « › » grisé. */
export function isFuturePeriod(p: Period, today: string): boolean { return p.from > today; }

/**
 * Les SEMAINES ENTIÈRES qui recouvrent la période — ce que lit l'export de
 * paie (recapEntries) pour classer les heures supplémentaires.
 */
export function wholeWeeks(from: string, to: string): { from: string; to: string } {
  return { from: mondayOf(from), to: sundayOf(to) };
}

/** Découpe [from, to] en tranches contiguës de `maxDays` jours au plus (lectures en parallèle). */
export function dayChunks(from: string, to: string, maxDays = 31): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (let cur = from; cur <= to; cur = addDaysISO(cur, maxDays)) {
    const end = addDaysISO(cur, maxDays - 1);
    out.push({ from: cur, to: end < to ? end : to });
  }
  return out;
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** « S-43 · 19–25 oct. » · « octobre 2026 » · « 2026 ». */
export function periodLabel(p: Period): string {
  if (p.kind === 'year') return p.from.slice(0, 4);
  if (p.kind === 'month') return `${MONTHS[Number(p.from.slice(5, 7)) - 1]} ${p.from.slice(0, 4)}`;
  const d = (iso: string) => String(Number(iso.slice(8, 10)));
  const m = (iso: string) => MONTHS_SHORT[Number(iso.slice(5, 7)) - 1];
  const span = p.from.slice(0, 7) === p.to.slice(0, 7)
    ? `${d(p.from)}–${d(p.to)} ${m(p.to)}`
    : `${d(p.from)} ${m(p.from)} – ${d(p.to)} ${m(p.to)}`;
  return `S-${isoWeek(p.from)} · ${span}`;
}

// ─── Journées oubliées : la règle du cockpit « à relancer » ──────────────────

/**
 * Jours planifiés (absences déjà retirées) PASSÉS et sans heure envoyée, du
 * plus récent au plus ancien. Corps de lib/work-status computeMissingDays,
 * avec `today` explicite (l'app passe la date du jour).
 */
export function missingDays(plannedDates: string[], declaredDates: Set<string>, today: string): string[] {
  const missing = new Set<string>();
  for (const d of plannedDates) {
    if (d >= today) continue;            // aujourd'hui et après : pas encore en retard
    if (declaredDates.has(d)) continue;  // déjà envoyé
    missing.add(d);
  }
  return Array.from(missing).sort((a, b) => (a < b ? 1 : -1));
}

/**
 * Lot 12 : ajoute les jours portant une sortie oubliée « à compléter » (passés
 * seulement). Corps de lib/work-status withIncompleteDays, `today` explicite.
 */
export function withIncomplete(missing: string[], incomplete: string[], today: string): string[] {
  const all = new Set([...missing, ...incomplete.filter((d) => d < today)]);
  return Array.from(all).sort((a, b) => (a < b ? 1 : -1));
}

export interface PlanRowLike { id: string; user_id: string; work_date: string; absence_type?: string | null }
export interface UserDayLike { user_id: string; work_date: string }

/**
 * L'assemblage du cockpit (components/admin-planning.tsx, fetchExtras), mot
 * pour mot : une case planifiée qui n'est ni une absence ni RETIRÉE par le
 * salarié réclame ses heures ; un jour d'absence ne réclame rien ; puis les
 * sorties oubliées « à compléter ». `incompleteRows` arrivent déjà filtrées
 * (lib/qr-entry isExitToComplete).
 *
 * L'ORDRE DE LA MAP EST CELUI DU COCKPIT (salariés planifiés dans l'ordre de
 * lecture, puis ceux qui n'ont qu'une sortie oubliée) : le planning compare
 * ses états avec `keep()` (contenu ET ordre) pour ne rien redessiner pour rien.
 */
export function missingDaysFrom(p: {
  planRows: PlanRowLike[];
  declaredRows: UserDayLike[];
  withdrawnIds: Set<string>;
  incompleteRows: UserDayLike[];
  today: string;
}): Map<string, string[]> {
  const planned = new Map<string, Set<string>>();
  const absence = new Map<string, Set<string>>();
  for (const r of p.planRows) {
    if (r.absence_type) {
      if (!absence.has(r.user_id)) absence.set(r.user_id, new Set());
      absence.get(r.user_id)!.add(r.work_date);
    } else if (!p.withdrawnIds.has(r.id)) {
      if (!planned.has(r.user_id)) planned.set(r.user_id, new Set());
      planned.get(r.user_id)!.add(r.work_date);
    }
  }
  const declared = new Map<string, Set<string>>();
  for (const e of p.declaredRows) {
    if (!declared.has(e.user_id)) declared.set(e.user_id, new Set());
    declared.get(e.user_id)!.add(e.work_date);
  }
  const miss = new Map<string, string[]>();
  planned.forEach((days, uid) => {
    const m = missingDays(Array.from(days).filter((d) => !absence.get(uid)?.has(d)), declared.get(uid) || new Set<string>(), p.today);
    if (m.length) miss.set(uid, m);
  });
  const incByUser = new Map<string, string[]>();
  for (const r of p.incompleteRows) incByUser.set(r.user_id, [...(incByUser.get(r.user_id) || []), r.work_date]);
  incByUser.forEach((days, uid) => { miss.set(uid, withIncomplete(miss.get(uid) || [], days, p.today)); });
  return miss;
}

// ─── Absences ────────────────────────────────────────────────────────────────

export interface AbsenceCount {
  conge: number; maladie: number; intemperie: number; autre: number;
  /** Jours distincts d'absence, jusqu'à aujourd'hui inclus. */
  total: number;
  /** Jours distincts d'absence de la période APRÈS aujourd'hui (« à venir »), hors total. */
  upcoming: number;
}
const ABSENCE_TYPES = ['conge', 'maladie', 'intemperie'] as const;

/**
 * Absences du planning (une ligne par jour CALENDAIRE, week-end compris, comme
 * le planning les pose) : jours DISTINCTS par type et au total, du début de la
 * période à aujourd'hui inclus. Les jours à venir de la période sont comptés à
 * part et n'entrent pas dans le total.
 */
export function absencesByUser(rows: PlanRowLike[], from: string, to: string, today: string): Map<string, AbsenceCount> {
  const days = new Map<string, { all: Set<string>; up: Set<string>; byType: Map<string, Set<string>> }>();
  for (const r of rows) {
    if (!r.absence_type || r.work_date < from || r.work_date > to) continue;
    let u = days.get(r.user_id);
    if (!u) { u = { all: new Set(), up: new Set(), byType: new Map() }; days.set(r.user_id, u); }
    if (r.work_date > today) { u.up.add(r.work_date); continue; }
    u.all.add(r.work_date);
    const t = (ABSENCE_TYPES as readonly string[]).includes(r.absence_type) ? r.absence_type : 'autre';
    if (!u.byType.has(t)) u.byType.set(t, new Set());
    u.byType.get(t)!.add(r.work_date);
  }
  const out = new Map<string, AbsenceCount>();
  days.forEach((u, uid) => {
    out.set(uid, {
      conge: u.byType.get('conge')?.size || 0,
      maladie: u.byType.get('maladie')?.size || 0,
      intemperie: u.byType.get('intemperie')?.size || 0,
      autre: u.byType.get('autre')?.size || 0,
      total: u.all.size,
      upcoming: u.up.size,
    });
  });
  return out;
}

// ─── Heures et heures sup : les lignes du CSV de paie, sommées ───────────────

/** Une ligne de weeklyRecap (lib/export-utils.ts) : un salarié, une semaine. */
export interface RecapRowLike {
  userId: string; minutes: number; normalMinutes: number;
  overtime1Minutes: number; overtime2Minutes: number; routeMinutes: number;
  base: number | null;
}
export interface RecapSum { minutes: number; normal: number; t1: number; t2: number; route: number; base: number | null }

/**
 * Σ des semaines du récapitulatif de paie, par salarié : « Total heures » et
 * « Heures sup 25 % » + « Heures sup 50 % » du CSV, exactement.
 */
export function recapByUser(rows: RecapRowLike[]): Map<string, RecapSum> {
  const out = new Map<string, RecapSum>();
  for (const r of rows) {
    const cur = out.get(r.userId) || { minutes: 0, normal: 0, t1: 0, t2: 0, route: 0, base: r.base };
    cur.minutes += r.minutes; cur.normal += r.normalMinutes;
    cur.t1 += r.overtime1Minutes; cur.t2 += r.overtime2Minutes; cur.route += r.routeMinutes;
    out.set(r.userId, cur);
  }
  return out;
}

// ─── Coût : les lignes de my_worksite_labour, sommées par salarié ────────────

/** Une ligne de my_worksite_labour : un salarié sur un chantier (numeric → nombre ou chaîne). */
export interface LabourRowLike {
  user_id: string;
  paid_minutes: number | string | null; route_minutes: number | string | null;
  cost: number | string | null; unpriced_minutes: number | string | null;
}
export interface LabourSum { paid: number; route: number; cost: number; unpriced: number; priced: boolean }

/**
 * Le coût « Coût chantiers » par salarié : Σ des lignes chantier × salarié
 * (heures × taux horaire ACTUEL, route payée comprise, sans majoration —
 * exactement le « Main d'œuvre » de l'écran Coût chantiers). `priced` = au
 * moins une minute chiffrée ; sans taux horaire, unpriced = paid.
 */
export function labourByUser(rows: LabourRowLike[]): Map<string, LabourSum> {
  const out = new Map<string, LabourSum>();
  for (const r of rows) {
    const cur = out.get(r.user_id) || { paid: 0, route: 0, cost: 0, unpriced: 0, priced: false };
    const paid = Number(r.paid_minutes || 0);
    const unpriced = Number(r.unpriced_minutes || 0);
    cur.paid += paid; cur.route += Number(r.route_minutes || 0);
    cur.cost += Number(r.cost || 0); cur.unpriced += unpriced;
    if (paid > unpriced) cur.priced = true;
    out.set(r.user_id, cur);
  }
  return out;
}

// ─── Petits comptes ──────────────────────────────────────────────────────────

/** Jours distincts par salarié dans [from, to] (renvois du bureau : 3 lignes le même jour = 1). */
export function distinctUserDays(rows: UserDayLike[], from: string, to: string): Map<string, number> {
  const s = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.work_date < from || r.work_date > to) continue;
    if (!s.has(r.user_id)) s.set(r.user_id, new Set());
    s.get(r.user_id)!.add(r.work_date);
  }
  const out = new Map<string, number>();
  s.forEach((d, uid) => out.set(uid, d.size));
  return out;
}

/** Nombre de lignes par salarié (relances du journal). */
export function countByUser(rows: { user_id: string }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.user_id, (out.get(r.user_id) || 0) + 1);
  return out;
}

// ─── Classement et barres ────────────────────────────────────────────────────

export type Metric = 'hours' | 'overtime' | 'absences' | 'forgotten' | 'cost';

/**
 * Classement décroissant ; à égalité, ordre alphabétique français ; rang « de
 * compétition » (1, 2, 2, 4). Une valeur nulle n'a pas de rang (null) et
 * passe en dernier.
 */
export function rankBy<T>(rows: T[], value: (r: T) => number, name: (r: T) => string): { row: T; rank: number | null; value: number }[] {
  const sorted = rows.map((row) => ({ row, value: value(row) || 0 }))
    .sort((a, b) => (b.value - a.value) || name(a.row).localeCompare(name(b.row), 'fr'));
  let rank = 0;
  return sorted.map((x, i) => {
    if (i === 0 || x.value !== sorted[i - 1].value) rank = i + 1;
    return { ...x, rank: x.value > 0 ? rank : null };
  });
}

/** Largeur des barres en % du plus grand ; tout à 0 si tout est nul ; une valeur non nulle a au moins 2 %. */
export function barWidths(values: number[]): number[] {
  const max = Math.max(0, ...values);
  if (max <= 0) return values.map(() => 0);
  return values.map((v) => (v > 0 ? Math.max(2, (v / max) * 100) : 0));
}
