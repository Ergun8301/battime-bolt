// Lot 1 — les heures d'UNE journée : ce qui compte, ce qui se chevauche, où
// demander la pause. Une seule règle pour l'écran du salarié, l'envoi (écran
// et Assistant) et les tests.
//
// LE BUG QUI A FAIT CE MODULE. Un salarié fait 07:00–18:00. Le bureau avait
// prévu « Matin » 08:00–12:00 et « Après-midi » 13:30–17:00. L'écran affichait
// 7h30 « travaillées » avant toute saisie, et « Envoyer » envoyait ces 7h30
// comme des heures faites. Trois règles en sortent :
//
//  1. Une heure PRÉVUE n'est pas une heure TRAVAILLÉE. Le total du salarié ne
//     compte que ses lignes. Le prévu s'affiche à part, et ne part qu'après un
//     « oui, je l'ai fait » explicite.
//  2. Un créneau prévu déjà couvert par les heures saisies n'existe plus (il ne
//     s'affiche plus, il ne part pas). S'il les chevauche en partie, il ne part
//     pas non plus : envoyer les deux compterait deux fois les mêmes minutes.
//  3. Plus de 6 h d'affilée sans pause : on demande la pause, que la ligne
//     vienne de la borne ou de la main.
//
// Fonctions pures, sans dépendance : importées par Deno ET par le navigateur.

/** Minutes depuis minuit d'un « HH:MM » ou « HH:MM:SS ». */
export const toMin = (t?: string | null): number => {
  const [h, m] = (t || '00:00').slice(0, 5).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export interface Span { start: string; end: string }

/** [début, fin] en minutes, la fin passant minuit si elle est avant le début. */
export function interval(s: Span): [number, number] {
  const a = toMin(s.start);
  let b = toMin(s.end);
  if (b < a) b += 24 * 60;
  return [a, b];
}

/** Durée d'un créneau (passage de minuit compris), pause NON déduite. */
export const spanMinutes = (s: Span): number => { const [a, b] = interval(s); return b - a; };

/**
 * Une minute de recouvrement est tolérée (lot 9) : la borne arrondit la fin à
 * la minute supérieure et tronque le début, deux pointages qui se suivent se
 * touchent d'une minute sans se chevaucher.
 */
export const OVERLAP_TOLERANCE = 1;

export function overlapMinutes(a: Span, b: Span): number {
  const [a1, a2] = interval(a);
  const [b1, b2] = interval(b);
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

/** Le premier créneau de `others` que `s` chevauche vraiment, ou null. */
export function findOverlap<T extends Span>(s: Span, others: T[]): T | null {
  return others.find((o) => overlapMinutes(s, o) > OVERLAP_TOLERANCE) ?? null;
}

/** Deux créneaux de la liste qui se chevauchent, ou null. */
export function firstOverlap<T extends Span>(spans: T[]): [T, T] | null {
  const sorted = [...spans].sort((x, y) => interval(x)[0] - interval(y)[0]);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (overlapMinutes(sorted[i], sorted[j]) > OVERLAP_TOLERANCE) return [sorted[i], sorted[j]];
    }
  }
  return null;
}

/**
 * Le chevauchement qui BLOQUE un envoi : au moins un des deux créneaux est
 * encore modifiable par le salarié (brouillon, file du téléphone, prévu à
 * confirmer). Deux lignes déjà envoyées et verrouillées par le bureau qui se
 * chevauchent ne bloquent pas sa journée : il ne pourrait rien y corriger.
 */
export function firstBlockingOverlap<T extends Span & { editable?: boolean }>(spans: T[]): [T, T] | null {
  const sorted = [...spans].sort((x, y) => interval(x)[0] - interval(y)[0]);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (!sorted[i].editable && !sorted[j].editable) continue;
      if (overlapMinutes(sorted[i], sorted[j]) > OVERLAP_TOLERANCE) return [sorted[i], sorted[j]];
    }
  }
  return null;
}

/** Minutes de [s] couvertes par l'union des créneaux `by`. */
export function coveredMinutes(s: Span, by: Span[]): number {
  const [a, b] = interval(s);
  const parts = by.map(interval).map(([x, y]) => [Math.max(a, x), Math.min(b, y)] as [number, number])
    .filter(([x, y]) => y > x).sort((p, q) => p[0] - q[0]);
  let total = 0; let cur = a;
  for (const [x, y] of parts) {
    if (y <= cur) continue;
    total += y - Math.max(x, cur);
    cur = y;
  }
  return total;
}

// ── Le prévu du bureau face aux heures saisies ──────────────────────────────

export interface PlannedLike {
  id: string;
  worksite_id?: string | null;
  absence_type?: string | null;
  estimated_start?: string | null;
  estimated_end?: string | null;
}

/**
 * Ce que devient un créneau prévu, face aux heures déjà saisies ce jour-là
 * (toutes les lignes vivantes, tous chantiers : on ne travaille pas à deux
 * endroits à la fois) :
 *  · 'covered'    — ses heures sont déjà saisies : il disparaît, ne part pas ;
 *  · 'overlaps'   — il en chevauche une partie : affiché, jamais envoyé tel quel ;
 *  · 'incomplete' — le bureau n'a pas mis de début ET de fin : à compléter
 *                   (plus de fin « 17:00 » inventée en silence) ;
 *  · 'todo'       — rien de saisi en face : peut partir, après confirmation.
 */
export type PlannedState = 'covered' | 'overlaps' | 'incomplete' | 'todo';

export const plannedSpan = (p: PlannedLike): Span | null => {
  const s = (p.estimated_start || '').slice(0, 5);
  const e = (p.estimated_end || '').slice(0, 5);
  return s && e && s !== e ? { start: s, end: e } : null;
};

export function plannedState(p: PlannedLike, lines: Span[]): PlannedState {
  const span = plannedSpan(p);
  if (!span) return 'incomplete';
  const len = spanMinutes(span);
  const covered = coveredMinutes(span, lines);
  if (covered >= len - OVERLAP_TOLERANCE) return 'covered';
  if (covered > OVERLAP_TOLERANCE) return 'overlaps';
  return 'todo';
}

/**
 * Le planning auquel rattacher une ligne saisie au « + » : celui du MÊME
 * chantier que la ligne recouvre le plus. Aucun ne la recouvre → un seul
 * planning sur ce chantier ce jour-là : celui-là ; sinon aucun. Avant, c'était
 * toujours le PREMIER du chantier : avec « Matin » + « Après-midi », une ligne
 * 13:00–18:00 se rattachait au matin et l'après-midi restait « à faire ».
 */
export function bestPlanningFor(line: Span & { worksite_id: string | null }, plannings: PlannedLike[]): string | null {
  const same = plannings.filter((p) => !p.absence_type && p.worksite_id && p.worksite_id === line.worksite_id);
  let best: string | null = null; let bestMin = 0;
  for (const p of same) {
    const span = plannedSpan(p);
    const m = span ? overlapMinutes(line, span) : 0;
    if (m > bestMin) { bestMin = m; best = p.id; }
  }
  if (best) return best;
  return same.length === 1 ? same[0].id : null;
}

// ── La pause ────────────────────────────────────────────────────────────────

/** Au-delà de 6 h d'affilée sans pause, on demande « Tu as pris une pause ? ». */
export const PAUSE_ASK_MINUTES = 360;
/** Un trou de 20 min ou plus entre deux lignes coupe la journée (pause légale : 20 min). */
export const PAUSE_GAP_MINUTES = 20;
export const PAUSE_CHOICES = [0, 30, 60] as const;

export interface PauseLine extends Span {
  id: string;
  /** Ligne sur laquelle la pause peut être posée (brouillon modifiable, ou prévu à envoyer). */
  editable: boolean;
  break_minutes?: number | null;
}

export interface PauseAsk {
  /** La ligne qui recevra la pause (la plus longue de la plage). */
  id: string;
  /** La plage continue concernée, pour la question (« 07:00–18:00 »). */
  start: string;
  end: string;
  /** Minutes travaillées dans la plage. */
  minutes: number;
  /** Durée de la ligne qui reçoit la pause : un choix plus long n'est pas proposé. */
  lineMinutes: number;
}

/**
 * Les plages de plus de 6 h d'affilée (trous de moins de 20 min) où aucune
 * pause n'est notée, et la ligne qui recevra la réponse. Une plage sans ligne
 * modifiable (déjà envoyée, verrouillée) n'est pas redemandée.
 */
export function pauseAsks(lines: PauseLine[]): PauseAsk[] {
  const sorted = [...lines].sort((a, b) => interval(a)[0] - interval(b)[0]);
  const stretches: PauseLine[][] = [];
  let lastEnd = -Infinity;
  for (const l of sorted) {
    const [a, b] = interval(l);
    if (stretches.length && a - lastEnd < PAUSE_GAP_MINUTES) stretches[stretches.length - 1].push(l);
    else stretches.push([l]);
    lastEnd = Math.max(lastEnd, b);
  }
  const out: PauseAsk[] = [];
  for (const st of stretches) {
    if (st.some((l) => (l.break_minutes || 0) > 0)) continue;
    const minutes = st.reduce((s, l) => s + spanMinutes(l), 0);
    if (minutes <= PAUSE_ASK_MINUTES) continue;
    const smallest = Math.min(...PAUSE_CHOICES.filter((m) => m > 0));
    const target = st.filter((l) => l.editable && spanMinutes(l) > smallest)
      .sort((a, b) => spanMinutes(b) - spanMinutes(a))[0];
    if (!target) continue;
    const end = st.reduce((m, l) => (interval(l)[1] > interval(m)[1] ? l : m), st[0]).end;
    out.push({ id: target.id, start: st[0].start.slice(0, 5), end: end.slice(0, 5), minutes, lineMinutes: spanMinutes(target) });
  }
  return out;
}

/** Pause gardée à la modification d'une ligne : jamais plus longue que la ligne. */
export const keptBreak = (s: Span, breakMinutes?: number | null): number => {
  const b = Math.max(0, Math.round(Number(breakMinutes) || 0));
  return b < spanMinutes(s) ? b : 0;
};
