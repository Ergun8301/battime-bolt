// Lot 3bis — « Imprimer » : la PÉRIODE imprimée (semaine, jour ou mois), au choix
// dans le menu, par défaut celle de l'écran. Pur, sans dépendance : importé par
// Deno (print-period.test.ts) ET par le navigateur (planning-print, admin-planning).
//
// Dates en chaînes ISO « yyyy-MM-dd », calculées en UTC : aucun passage à l'heure
// d'été ou d'hiver ne peut faire sauter ou doubler un jour (une semaine d'octobre
// a toujours 7 jours distincts).

export type PeriodKind = 'week' | 'day' | 'month';
/** start = le lundi (semaine), le jour (jour), le 1er (mois). */
export interface PrintPeriod { kind: PeriodKind; start: string }

export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const toUTC = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const fromUTC = (t: number) => new Date(t).toISOString().slice(0, 10);

export function addDaysISO(iso: string, n: number): string {
  return fromUTC(toUTC(iso) + n * 86400000);
}
/** Le lundi de la semaine qui contient `iso` (même règle que lib/week.ts). */
export function weekStartISO(iso: string): string {
  const wd = (new Date(toUTC(iso)).getUTCDay() + 6) % 7; // lundi = 0 … dimanche = 6
  return addDaysISO(iso, -wd);
}
export function monthStartISO(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}
/** Le 1er du mois suivant (ou précédent) : n = ±1, ±2… */
function addMonthsISO(iso: string, n: number): string {
  const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)) - 1 + n;
  return fromUTC(Date.UTC(y, m, 1));
}
/** Remet `start` à sa place : lundi pour une semaine, 1er pour un mois. */
export function normalizePeriod(p: PrintPeriod): PrintPeriod {
  if (p.kind === 'week') return { kind: 'week', start: weekStartISO(p.start) };
  if (p.kind === 'month') return { kind: 'month', start: monthStartISO(p.start) };
  return { kind: 'day', start: p.start };
}

/** Les jours imprimés : 7 (semaine), 1 (jour), 28 à 31 (mois). */
export function periodDays(p: PrintPeriod): string[] {
  const n = normalizePeriod(p);
  if (n.kind === 'day') return [n.start];
  if (n.kind === 'week') return Array.from({ length: 7 }, (_, i) => addDaysISO(n.start, i));
  const out: string[] = [];
  for (let d = n.start; d.slice(0, 7) === n.start.slice(0, 7); d = addDaysISO(d, 1)) out.push(d);
  return out;
}
/** Bornes incluses de la période (lecture en base : gte from, lte to). */
export function periodRange(p: PrintPeriod): { from: string; to: string } {
  const days = periodDays(p);
  return { from: days[0], to: days[days.length - 1] };
}

/** ‹ › du menu : semaine ±7 jours, jour ±1, mois ±1 (toujours le 1er). */
export function shiftPeriod(p: PrintPeriod, dir: number): PrintPeriod {
  const n = normalizePeriod(p);
  if (n.kind === 'week') return { kind: 'week', start: addDaysISO(n.start, 7 * dir) };
  if (n.kind === 'day') return { kind: 'day', start: addDaysISO(n.start, dir) };
  return { kind: 'month', start: addMonthsISO(n.start, dir) };
}

const inside = (iso: string, p: PrintPeriod) => { const r = periodRange(p); return iso >= r.from && iso <= r.to; };

/**
 * Passer d'un type de période à l'autre sans perdre l'endroit où l'on est :
 *  - semaine → jour : aujourd'hui s'il est dans la semaine, sinon le lundi (comme le lot 3) ;
 *  - semaine → mois : le mois d'aujourd'hui s'il est dans la semaine, sinon celui du jeudi
 *    (la semaine du 28 septembre appartient à octobre, comme la numérotation ISO) ;
 *  - jour → semaine / mois : la semaine / le mois de ce jour ;
 *  - mois → semaine : la semaine d'aujourd'hui s'il est dans le mois, sinon celle du 1er jeudi ;
 *  - mois → jour : aujourd'hui s'il est dans le mois, sinon le 1er.
 */
export function switchKind(p: PrintPeriod, kind: PeriodKind, today: string): PrintPeriod {
  const n = normalizePeriod(p);
  if (n.kind === kind) return n;
  const here = inside(today, n);
  if (n.kind === 'week') {
    if (kind === 'day') return { kind: 'day', start: here ? today : n.start };
    return { kind: 'month', start: monthStartISO(here ? today : addDaysISO(n.start, 3)) };
  }
  if (n.kind === 'day') return normalizePeriod({ kind, start: n.start });
  if (kind === 'day') return { kind: 'day', start: here ? today : n.start };
  if (here) return { kind: 'week', start: weekStartISO(today) };
  const wd = (new Date(toUTC(n.start)).getUTCDay() + 6) % 7; // jour du 1er (lundi = 0)
  return { kind: 'week', start: weekStartISO(addDaysISO(n.start, (3 - wd + 7) % 7)) };
}

/** Chaque jour de `inner` est dans `outer` (un mois n'est jamais dans une semaine). */
export function withinPeriod(inner: PrintPeriod, outer: PrintPeriod): boolean {
  const a = periodRange(inner), b = periodRange(outer);
  return a.from >= b.from && a.to <= b.to;
}

/**
 * La lettre d'une absence sur la feuille du mois. Une maladie s'écrit « A »
 * (absent) : donnée de santé, la feuille s'affiche au dépôt (comme le lot 3).
 */
export function absenceCode(t?: string | null): string {
  if (t === 'conge') return 'C';
  if (t === 'intemperie') return 'I';
  if (t === 'repos') return 'R';
  return 'A';
}

const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'à', 'au', 'aux', 'en', 'sur']);
const upper = (s: string) => s.toLocaleUpperCase('fr');
function baseCode(title: string): string {
  const words = title.split(/[\s\-'’.,/()&+]+/).filter(Boolean);
  const kept = words.filter((w) => !STOP.has(w.toLocaleLowerCase('fr')));
  const ws = kept.length ? kept : words;
  if (!ws.length) return '?';
  if (ws.length === 1) return upper(Array.from(ws[0]).slice(0, 2).join(''));
  return upper(ws.slice(0, 3).map((w) => Array.from(w)[0]).join(''));
}

/**
 * Le code court d'un chantier dans une case du mois (« VE » pour Villa Exemple),
 * expliqué par la clé « Chantiers : » en tête de chaque page. Stable pour une
 * même liste, quel que soit l'ordre d'arrivée : titres triés (fr), puis initiales
 * de 3 mots au plus (sans « de, la, et… »), 2 lettres pour un seul mot. Deux
 * chantiers au même code : le second (dans l'ordre alphabétique) prend un chiffre
 * (VE, VE2). Jamais plus de 4 caractères.
 */
export function worksiteCodes(titles: Iterable<string>): Map<string, string> {
  const list = Array.from(new Set(Array.from(titles))).sort((a, b) => a.localeCompare(b, 'fr'));
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const t of list) {
    const base = baseCode(t);
    let code = base;
    for (let i = 2; used.has(code); i++) code = `${Array.from(base).slice(0, 4 - String(i).length).join('')}${i}`;
    used.add(code);
    out.set(t, code);
  }
  return out;
}
