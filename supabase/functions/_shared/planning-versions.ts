// Lot 8 — VERSIONS DU PLANNING, retour en un clic : tout ce qui ne touche pas
// la base (navigateur et Deno, testé : planning-versions.test.ts).
//
// Une version = la copie des CASES de travail d'une semaine (lundi → dimanche)
// de toute l'entreprise, à un instant donné : V1 « initiale » (avant le premier
// changement de l'assistant sur cette semaine), puis les essais de l'assistant,
// les versions gardées à la main, l'état sauvé juste avant un retour en arrière.
// Les ABSENCES ne font pas partie d'une version : un retour ne les touche jamais
// (même règle que « Effacer le planning » : les absences restent).
//
// Revenir à une version = calculer la DIFFÉRENCE entre le planning actuel et la
// version (cases à retirer, à remettre, à modifier), puis l'appliquer avec les
// écritures du planning, dans le navigateur, avec les droits du bureau connecté
// (lib/planning-versions.ts). Ici : seulement le calcul et les mots.
//
// Jamais touchées (on les GARDE et on le dit) : une case qui porte des heures,
// une case d'un mois clôturé, une case avec un pointage en cours, une case
// ajoutée par le salarié (l'écran la dit « non supprimable »). Jamais remise :
// une case dans un mois clôturé, sur un jour où le salarié a une absence, pour
// un chantier supprimé ou un salarié archivé. On ne touche JAMAIS aux heures.
// Jamais lue ni écrite : une case d'une autre semaine ou d'une autre entreprise.

/** La demande faite à l'assistant, gardée avec sa version (D5 : 500 caractères au plus). */
export const REQUEST_MAX = 500;
/** Une courte précision (« Avant le retour à la V2 »). */
export const NOTE_MAX = 200;
/** Au plus tant de cases par version (au-delà, la base refuse). */
export const CELLS_MAX = 2000;
/** Au plus tant de semaines suivies par une seule action de l'assistant (« efface tout le trimestre »). */
export const WEEKS_MAX = 12;

export type VersionKind = 'initial' | 'assistant' | 'manuel' | 'avant_assistant' | 'avant_retour';
export const VERSION_KINDS: readonly VersionKind[] = ['initial', 'assistant', 'manuel', 'avant_assistant', 'avant_retour'];

/** Une case de travail, telle qu'une version la garde. */
export interface VersionCell {
  id: string;
  user_id: string;
  worksite_id: string | null;
  work_date: string;
  estimated_start: string | null;
  estimated_end: string | null;
  notes: string | null;
  created_by?: string | null;
  /** Ordre des bulles dans la case (facultatif). */
  position?: number | null;
  /** Ajoutée par le salarié : jamais retirée ni modifiée par un retour. */
  added_by_worker?: boolean;
}

export interface PlanningVersion {
  id: string;
  company_id: string;
  week_start: string;
  number: number;
  kind: VersionKind;
  request: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  user_ids: string[];
  cells: VersionCell[];
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
/** « 08:00 » / « 08:00:00 » → « 08:00:00 » (null si vide). */
const hms = (v: unknown): string | null => (str(v) ? `${String(v).trim().slice(0, 5)}:00` : null);

/** Une ligne de `planning` (select '*') → la case gardée dans une version (colonnes utiles seulement). */
export function toCell(row: Record<string, unknown>): VersionCell {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    worksite_id: str(row.worksite_id),
    work_date: String(row.work_date).slice(0, 10),
    estimated_start: hms(row.estimated_start),
    estimated_end: hms(row.estimated_end),
    notes: str(row.notes),
    created_by: str(row.created_by),
    ...(typeof row.position === 'number' ? { position: row.position } : {}),
    ...(row.added_by_worker === true ? { added_by_worker: true } : {}),
  };
}

// ── Semaines ────────────────────────────────────────────────────────────────
const dayUTC = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
export function addDaysISO(iso: string, n: number): string {
  const d = dayUTC(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return isoOf(d);
}
/** Le lundi de la semaine qui contient ce jour (même semaine que lib/week.ts : lundi → dimanche). */
export function mondayOf(iso: string): string {
  const d = dayUTC(iso);
  return addDaysISO(iso, -((d.getUTCDay() + 6) % 7));
}
/** Lundi → dimanche. */
export const weekRange = (monday: string) => ({ from: monday, to: addDaysISO(monday, 6) });
/** Les lundis (sans doublon, dans l'ordre) des jours donnés ; un jour mal écrit est ignoré. */
export function mondaysOf(days: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const d of days) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(d || '') || Number.isNaN(Date.parse(`${String(d).slice(0, 10)}T12:00:00Z`))) continue;
    const m = mondayOf(String(d));
    if (!out.includes(m)) out.push(m);
  }
  return out;
}
/** Les lundis des semaines touchées par la période (au plus `max`). */
export function weeksTouched(du: string, au: string, max = WEEKS_MAX): string[] {
  if (!/^\d{4}-\d{2}-\d{2}/.test(du || '') || !/^\d{4}-\d{2}-\d{2}/.test(au || '') || au < du) return [];
  const out: string[] = [];
  for (let m = mondayOf(du); m <= au && out.length < max; m = addDaysISO(m, 7)) out.push(m);
  return out;
}

/**
 * Texte propre, coupé à `max` CARACTÈRES (comme la base : char_length). On coupe
 * sur les caractères entiers : une émoji n'est jamais coupée en deux (la base
 * refuserait le texte, et la version ne serait pas gardée).
 */
function clip(t: unknown, max: number): string | null {
  const s = typeof t === 'string' ? t.replace(/\s+/g, ' ').trim() : '';
  if (!s) return null;
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, max).join('').trim() : s;
}
/** La demande, propre et coupée à 500 caractères (null si vide). */
export const clipRequest = (t: unknown) => clip(t, REQUEST_MAX);
export const clipNote = (t: unknown) => clip(t, NOTE_MAX);
/** Les salariés présents dans la copie (sans doublon, triés). */
export const usersOf = (cells: VersionCell[]) => Array.from(new Set(cells.map((c) => c.user_id))).sort();

/** Un jour de la semaine qui commence ce lundi. */
export const inWeek = (monday: string, iso: string) => {
  const { from, to } = weekRange(monday);
  const d = String(iso).slice(0, 10);
  return d >= from && d <= to;
};

/**
 * Les lignes de `planning` lues pour UNE semaine d'UNE entreprise → les cases de
 * travail et les jours d'absence. Toute ligne d'une autre entreprise ou d'une
 * autre semaine est écartée (et comptée) : elle ne peut jamais entrer dans une
 * copie ni dans un retour, même si une lecture en rendait trop.
 */
export function cellsFromRows(rows: Record<string, unknown>[], scope: { companyId: string; monday: string }) {
  const cells: VersionCell[] = [];
  const absentDays = new Set<string>();
  let foreign = 0;
  for (const r of rows) {
    if (r.company_id !== undefined && r.company_id !== scope.companyId) { foreign++; continue; }
    if (!r.work_date || !inWeek(scope.monday, String(r.work_date))) { foreign++; continue; }
    if (r.absence_type) absentDays.add(`${r.user_id}|${String(r.work_date).slice(0, 10)}`);
    else cells.push(toCell(r));
  }
  return { cells, absentDays, foreign };
}

// ── Comparer ────────────────────────────────────────────────────────────────
const hm = (v: string | null | undefined) => (v ? v.slice(0, 5) : '');
const keyOf = (c: VersionCell) => `${c.user_id}|${c.work_date}|${c.worksite_id ?? ''}`;
/** Même salarié, jour, chantier, heures prévues et note. */
export function sameContent(a: VersionCell, b: VersionCell): boolean {
  return keyOf(a) === keyOf(b) && hm(a.estimated_start) === hm(b.estimated_start) && hm(a.estimated_end) === hm(b.estimated_end)
    && (a.notes ?? '') === (b.notes ?? '');
}
/** L'empreinte du CONTENU d'une semaine (les identifiants n'y comptent pas). */
export function cellsSignature(cells: VersionCell[]): string {
  return JSON.stringify(cells.map((c) => [c.work_date, c.user_id, c.worksite_id ?? '', hm(c.estimated_start), hm(c.estimated_end), c.notes ?? '']).sort());
}

export interface VersionDiff {
  /** Dans la version, plus au planning : à remettre. */
  add: VersionCell[];
  /** Au planning, pas dans la version : à retirer. */
  remove: VersionCell[];
  /** La même case, autrement : à modifier (`from` = le planning, `to` = la version). */
  update: { from: VersionCell; to: VersionCell }[];
  /** Cases déjà comme dans la version. */
  same: number;
}

/**
 * La différence entre le planning actuel et une version. Une case se reconnaît
 * d'abord à son identifiant ; sinon, au même salarié, même jour, même chantier
 * (une case effacée puis reposée ailleurs dans la semaine n'est ni retirée ni
 * remise : elle est déjà là).
 */
export function diffCells(current0: VersionCell[], target0: VersionCell[], scope?: { monday: string }): VersionDiff {
  // Avec un périmètre : seules les cases de CETTE semaine comptent, des deux côtés.
  const current = scope ? current0.filter((c) => inWeek(scope.monday, c.work_date)) : current0;
  const target = scope ? target0.filter((c) => inWeek(scope.monday, c.work_date)) : target0;
  const byId = new Map(current.map((c) => [c.id, c]));
  const pairs: { from: VersionCell; to: VersionCell }[] = [];
  const used = new Set<string>();
  const restT: VersionCell[] = [];
  for (const t of target) {
    const c = byId.get(t.id);
    if (c && !used.has(c.id)) { pairs.push({ from: c, to: t }); used.add(c.id); } else restT.push(t);
  }
  const byKey = new Map<string, VersionCell[]>();
  for (const c of current) if (!used.has(c.id)) { const k = keyOf(c); byKey.set(k, [...(byKey.get(k) || []), c]); }
  // D'abord les cases identiques, puis le reste du même salarié, jour et chantier
  // (deux cases le même jour au même chantier : le matin va avec le matin).
  const add: VersionCell[] = [];
  const take = (t: VersionCell, exact: boolean) => {
    const list = byKey.get(keyOf(t)) || [];
    const i = exact ? list.findIndex((c) => sameContent(c, t)) : list.length ? 0 : -1;
    if (i < 0) return false;
    const [c] = list.splice(i, 1);
    used.add(c.id);
    pairs.push({ from: c, to: t });
    return true;
  };
  const loose = restT.filter((t) => !take(t, true));
  for (const t of loose) if (!take(t, false)) add.push(t);
  const remove = current.filter((c) => !used.has(c.id));
  const update = pairs.filter((p) => !sameContent(p.from, p.to));
  return { add, remove, update, same: pairs.length - update.length };
}

// ── Ce qui reste, ce qui ne revient pas ─────────────────────────────────────
export interface Protection {
  /** Cases du planning qui ne bougent pas, et pourquoi (heures notées ou envoyées, mois clôturé, pointage en cours). */
  kept: Map<string, string>;
  /** Mois clôturés (« aaaa-mm ») : rien n'y est remis ni déplacé. */
  closedMonths: Set<string>;
  /** « salarié|jour » avec une absence posée : aucune case de travail n'y est remise. */
  absentDays: Set<string>;
  /** Identifiants déjà utilisés ailleurs dans le planning (autre semaine) : la case revient avec un nouvel identifiant. */
  takenIds: Set<string>;
  /** Chantiers de la version qui n'existent plus : aucune case n'y revient. */
  goneWorksites: Set<string>;
  /** Salariés de la version supprimés ou archivés : aucune case ne leur revient. */
  goneUsers: Set<string>;
}
export const emptyProtection = (): Protection => ({
  kept: new Map(), closedMonths: new Set(), absentDays: new Set(), takenIds: new Set(), goneWorksites: new Set(), goneUsers: new Set(),
});

export const REASON_CLOSED = 'mois clôturé';
export const REASON_ABSENT = 'absence posée ce jour-là';
export const REASON_LIVE = 'pointage en cours';
export const REASON_WORKER = 'ajoutée par le salarié';
export const REASON_SITE = 'chantier supprimé';
export const REASON_USER = 'salarié archivé';

export interface RestorePlan {
  /** À remettre ; `keepId` : avec son identifiant d'origine (sinon un nouveau). */
  add: { cell: VersionCell; keepId: boolean }[];
  remove: VersionCell[];
  /** `move` : la case change de jour ou de salarié (même règle que le glisser du planning). */
  update: { from: VersionCell; to: VersionCell; move: boolean }[];
  /** Cases du planning qui auraient changé, et qui RESTENT comme elles sont. */
  kept: { cell: VersionCell; reason: string }[];
  /** Cases de la version qui ne reviennent pas. */
  skipped: { cell: VersionCell; reason: string }[];
  same: number;
}

const monthOf = (iso: string) => iso.slice(0, 7);
const dayKey = (c: VersionCell) => `${c.user_id}|${c.work_date}`;

/** Pourquoi une case de la version ne peut pas être (re)posée telle quelle, ou null. */
function unusable(c: VersionCell, p: Protection): string | null {
  if (p.closedMonths.has(monthOf(c.work_date))) return REASON_CLOSED;
  if (p.goneUsers.has(c.user_id)) return REASON_USER;
  if (c.worksite_id && p.goneWorksites.has(c.worksite_id)) return REASON_SITE;
  if (p.absentDays.has(dayKey(c))) return REASON_ABSENT;
  return null;
}

/** Applique les règles de garde à une différence : ce qui sera vraiment écrit. */
export function planRestore(diff: VersionDiff, p: Protection): RestorePlan {
  const out: RestorePlan = { add: [], remove: [], update: [], kept: [], skipped: [], same: diff.same };
  // Une case ajoutée par le salarié ne part jamais (l'écran la dit « non supprimable »).
  const holds = (c: VersionCell) => p.kept.get(c.id) ?? (c.added_by_worker ? REASON_WORKER : undefined);
  for (const r of diff.remove) {
    const why = holds(r);
    if (why) out.kept.push({ cell: r, reason: why }); else out.remove.push(r);
  }
  for (const u of diff.update) {
    const why = holds(u.from);
    const move = u.from.user_id !== u.to.user_id || u.from.work_date !== u.to.work_date;
    // Un simple changement d'horaire ou de note sur un jour d'absence est permis ; un déplacement non.
    const blocked = unusable(u.to, { ...p, absentDays: move ? p.absentDays : new Set() });
    if (why) out.kept.push({ cell: u.from, reason: why });
    else if (blocked) out.kept.push({ cell: u.from, reason: blocked });
    else out.update.push({ ...u, move });
  }
  for (const a of diff.add) {
    const why = unusable(a, p);
    if (why) out.skipped.push({ cell: a, reason: why });
    else out.add.push({ cell: a, keepId: !p.takenIds.has(a.id) });
  }
  return out;
}

/** L'empreinte d'un plan : les cases concernées, pas les mots. Le retour ne part que si l'aperçu confirmé est toujours vrai. */
export function planSignature(p: RestorePlan): string {
  const ids = (a: { id: string }[]) => a.map((x) => x.id).sort();
  return JSON.stringify([ids(p.add.map((a) => a.cell)), ids(p.remove), ids(p.update.map((u) => u.from)), ids(p.kept.map((k) => k.cell)), ids(p.skipped.map((k) => k.cell))]);
}
/** Rien à écrire : tout est déjà comme la version, ou gardé. */
export const planIsEmpty = (p: RestorePlan) => !p.add.length && !p.remove.length && !p.update.length;

/**
 * Découpe en paquets d'au plus `size` cases SANS séparer les cases d'un même
 * salarié, jour et chantier : « Supprimer » (lib/erase.ts) décide d'une case en
 * regardant ses voisines du même endroit, et ne le peut que si elles sont lues
 * ensemble.
 */
export function chunkByKey(cells: VersionCell[], size = 100): VersionCell[][] {
  const groups = new Map<string, VersionCell[]>();
  for (const c of cells) {
    const k = c.worksite_id ? keyOf(c) : `solo|${c.id}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const out: VersionCell[][] = [];
  let cur: VersionCell[] = [];
  for (const g of Array.from(groups.values())) {
    if (cur.length && cur.length + g.length > size) { out.push(cur); cur = []; }
    cur.push(...g);
  }
  if (cur.length) out.push(cur);
  return out;
}

// ── Les mots ────────────────────────────────────────────────────────────────
export interface RestoreCounts { added: number; removed: number; changed: number; kept: number; keptReasons: string[]; skipped: number; skippedReasons: string[] }
export const countsOf = (p: RestorePlan): RestoreCounts => ({
  added: p.add.length, removed: p.remove.length, changed: p.update.length,
  kept: p.kept.length, keptReasons: uniq(p.kept.map((k) => k.reason)),
  skipped: p.skipped.length, skippedReasons: uniq(p.skipped.map((k) => k.reason)),
});
function uniq(a: string[]): string[] { return Array.from(new Set(a.flatMap((x) => x.split(', ')).filter(Boolean))); }
export const nothingToDo = (c: RestoreCounts) => !c.added && !c.removed && !c.changed;

/**
 * « 12 cases remises, 3 retirées, 2 gardées (heures déjà notées) ». Le mot
 * « case » une fois, devant le premier nombre. Rien à changer : on le dit.
 */
export function restoreSummary(c: RestoreCounts): string {
  const parts: [number, string, string, string?][] = [
    [c.added, 'remise', 'remises'], [c.removed, 'retirée', 'retirées'], [c.changed, 'modifiée', 'modifiées'],
    [c.kept, 'gardée', 'gardées', c.keptReasons.join(', ')], [c.skipped, 'non remise', 'non remises', c.skippedReasons.join(', ')],
  ];
  const shown = parts.filter(([n]) => n > 0);
  if (!shown.length) return 'Rien à changer : le planning est déjà comme cette version.';
  const txt = shown.map(([n, one, many, why], i) => `${n} ${i === 0 ? (n > 1 ? 'cases ' : 'case ') : ''}${n > 1 ? many : one}${why ? ` (${why})` : ''}`).join(', ');
  return nothingToDo(c) ? `Rien à changer : ${txt}.` : `${txt}.`;
}

const TITLE: Record<VersionKind, string> = {
  initial: 'Initiale', assistant: 'Essai de l’assistant', manuel: 'Gardée', avant_assistant: 'Avant l’assistant', avant_retour: 'Avant un retour en arrière',
};
/** « V1 · Initiale », « V3 · Essai de l’assistant »… */
export function versionTitle(v: Pick<PlanningVersion, 'number' | 'kind' | 'note'>): string {
  const t = v.kind === 'avant_retour' && v.note ? v.note : TITLE[v.kind] ?? 'Version';
  return `V${v.number} · ${t}`;
}
/** « 12 cases · 4 salariés ». */
export function versionSize(cells: VersionCell[]): string {
  const n = cells.length;
  const u = usersOf(cells).length;
  return n ? `${n} case${n > 1 ? 's' : ''} · ${u} salarié${u > 1 ? 's' : ''}` : 'Aucune case';
}
