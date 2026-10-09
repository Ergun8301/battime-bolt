// Lot 2 — le bureau corrige une journée ENVOYÉE (heures, pause, panier, route)
// ou la renvoie au salarié, toujours avec un MOTIF que le salarié lit.
//
// POURQUOI CE MODULE. Avant, la fiche salarié ne corrigeait que le début et la
// fin, sans motif. Une pause oubliée, un panier en trop ou une route mal
// qualifiée se changeaient par une écriture brute : aucune trace, et le
// salarié découvrait la différence sur sa fiche de paie. Les mêmes règles
// servent à trois endroits — l'écran du bureau (avant d'appeler le serveur),
// le texte de la notification, et la carte que le salarié voit sur sa journée —
// et sont reprises par `office_correct_entry` côté base, avec les mêmes
// messages (migration 20261009120000_lot2_corrections_bureau.sql). Deux copies de la
// règle finiraient par se contredire : l'écran dirait « OK », le serveur
// « refusé », et la secrétaire ne saurait plus qui croire.
//
// Fonctions pures, sans dépendance : importées par Deno ET par le navigateur.
import { findOverlap, spanMinutes, type Span } from './day-hours.ts';

/** Un motif d'un ou deux caractères (« ok », « . ») n'explique rien au salarié. */
export const REASON_MIN = 3;
export const REASON_MAX = 500;

/** Ce que le bureau peut changer sur une ligne envoyée (et rien d'autre). */
export const EDIT_KEYS = ['start_time', 'end_time', 'break_minutes', 'meal_allowance', 'gap_before'] as const;
export type EditKey = typeof EDIT_KEYS[number];
export type Gap = 'route' | 'pause' | null;

/** L'état d'une ligne tel que le journal le garde (avant / après). */
export interface EditState {
  start_time: string;
  end_time: string;
  break_minutes: number;
  meal_allowance: boolean;
  gap_before: Gap;
  status: string;
}

/** Une ligne d'heures, telle que l'écran la lit (heures « HH:MM » ou « HH:MM:SS »). */
export interface EntryLike {
  start_time: string;
  end_time: string;
  break_minutes?: number | null;
  meal_allowance?: boolean | null;
  gap_before?: Gap | string | null;
  status?: string;
}

/** Les changements envoyés au serveur : une clé présente = « change-la ». */
export type Changes = Partial<{ start_time: string; end_time: string; break_minutes: number; meal_allowance: boolean; gap_before: Gap }>;

const hhmm = (t?: string | null) => (t || '').slice(0, 5);
const gapOf = (g: unknown): Gap => (g === 'route' || g === 'pause' ? g : null);

/**
 * Ce qui a VRAIMENT changé entre la ligne et le formulaire.
 *
 * Une heure ne part que si son HH:MM change (même idée que `saveSlot` côté
 * salarié) : une ligne pointée à la minute (08:07:00) ne doit pas être
 * réécrite pour rien — le journal noterait une correction qui n'en est pas une.
 */
export function changedKeys(entry: EntryLike, form: { start_time: string; end_time: string; break_minutes: number; meal_allowance: boolean; gap_before: Gap | '' }): Changes {
  const out: Changes = {};
  if (hhmm(form.start_time) !== hhmm(entry.start_time)) out.start_time = hhmm(form.start_time);
  if (hhmm(form.end_time) !== hhmm(entry.end_time)) out.end_time = hhmm(form.end_time);
  const brk = Math.max(0, Math.round(Number(form.break_minutes) || 0));
  if (brk !== Math.round(Number(entry.break_minutes) || 0)) out.break_minutes = brk;
  if (!!form.meal_allowance !== !!entry.meal_allowance) out.meal_allowance = !!form.meal_allowance;
  if (gapOf(form.gap_before) !== gapOf(entry.gap_before)) out.gap_before = gapOf(form.gap_before);
  return out;
}

/** Le motif est-il assez long pour expliquer quelque chose au salarié ? */
export const reasonOk = (reason: string) => {
  const n = (reason || '').trim().length;
  return n >= REASON_MIN && n <= REASON_MAX;
};

/**
 * Les refus qu'on peut dire AVANT d'appeler le serveur, avec ses mots à lui.
 * `sameDay` = les autres lignes vivantes du salarié ce jour-là (pas celle-ci,
 * pas les retirées). Rend le message à afficher, ou null si rien ne bloque.
 *
 * Le serveur refait tout : ceci n'évite qu'un aller-retour, jamais un contrôle.
 */
export function precheck(entry: EntryLike, changes: Changes, sameDay: Span[], reason: string): string | null {
  const r = (reason || '').trim();
  if (r.length < REASON_MIN) return 'Indiquez un motif (3 caractères au moins).';
  if (r.length > REASON_MAX) return `Motif trop long (${REASON_MAX} caractères au plus).`;
  if (Object.keys(changes).length === 0) return 'Rien n\'a changé.';
  const start = changes.start_time ?? hhmm(entry.start_time);
  const end = changes.end_time ?? hhmm(entry.end_time);
  if (start === end) return 'Le début et la fin sont identiques.';
  const span = spanMinutes({ start, end });
  const brk = changes.break_minutes ?? Math.round(Number(entry.break_minutes) || 0);
  if (brk < 0 || brk >= span) return 'La pause doit être plus courte que la journée.';
  if ('gap_before' in changes && changes.gap_before !== null && changes.gap_before !== 'route' && changes.gap_before !== 'pause') {
    return 'Avant ce chantier : route ou pause.';
  }
  // Les heures ne bougent pas → pas de nouveau chevauchement possible. Une
  // ligne qui en chevauchait déjà une autre doit pouvoir recevoir sa pause.
  if ('start_time' in changes || 'end_time' in changes) {
    const others = sameDay.filter((s) => hhmm(s.start) !== hhmm(s.end));
    const clash = findOverlap({ start, end }, others);
    if (clash) return `Ces heures chevauchent ${hhmm(clash.start)}–${hhmm(clash.end)} du même jour.`;
  }
  return null;
}

/** « 8h00 », comme dans le reste de l'application (lib/corrections.ts). */
export const fmtH = (t: string) => {
  const [h, m] = hhmm(t).split(':');
  return `${Number(h)}h${m ?? '00'}`;
};
const gapLabel = (g: unknown) => (g === 'route' ? 'route' : g === 'pause' ? 'pause' : '—');
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * Ce qui a changé, en mots de chantier, dans l'ordre de la fiche :
 * « 8h00–17h00 → 8h00–16h30 », « pause 0 → 30 min », « panier ajouté »,
 * « avant : — → route ». Un journal partiel (le panier retiré d'une autre
 * ligne ne garde que `meal_allowance`) ne produit que ce qu'il contient.
 */
export function diffLabels(oldV: Partial<EditState>, newV: Partial<EditState>): string[] {
  const out: string[] = [];
  const o = oldV || {}; const n = newV || {};
  if (has(o, 'start_time') && has(n, 'start_time') && has(o, 'end_time') && has(n, 'end_time')
      && (hhmm(o.start_time) !== hhmm(n.start_time) || hhmm(o.end_time) !== hhmm(n.end_time))) {
    out.push(`${fmtH(o.start_time!)}–${fmtH(o.end_time!)} → ${fmtH(n.start_time!)}–${fmtH(n.end_time!)}`);
  }
  if (has(o, 'break_minutes') && has(n, 'break_minutes') && Number(o.break_minutes || 0) !== Number(n.break_minutes || 0)) {
    out.push(`pause ${Number(o.break_minutes || 0)} → ${Number(n.break_minutes || 0)} min`);
  }
  if (has(o, 'meal_allowance') && has(n, 'meal_allowance') && !!o.meal_allowance !== !!n.meal_allowance) {
    out.push(n.meal_allowance ? 'panier ajouté' : 'panier retiré');
  }
  if (has(o, 'gap_before') && has(n, 'gap_before') && gapOf(o.gap_before) !== gapOf(n.gap_before)) {
    out.push(`avant : ${gapLabel(o.gap_before)} → ${gapLabel(n.gap_before)}`);
  }
  return out;
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « 8 octobre » — sans Intl : le même texte sur le téléphone, le serveur et les tests. */
export const jourMois = (iso: string) => {
  const [, m, d] = (iso || '').slice(0, 10).split('-').map(Number);
  return m >= 1 && m <= 12 && d ? `${d} ${MOIS[m - 1]}` : iso;
};

/** Un motif très long reste lisible dans une notification (il est entier sur la journée). */
const court = (s: string, max = 160) => {
  const t = (s || '').trim().replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/**
 * Le texte de la notification. Le salarié la lit sur son téléphone, souvent
 * sans ouvrir l'application : elle dit QUOI et POURQUOI, en une phrase.
 */
export function pushBody(p: { kind: 'correction' | 'return'; date: string; labels?: string[]; reason: string }): string {
  const jour = jourMois(p.date);
  const motif = court(p.reason);
  if (p.kind === 'return') {
    return `Le bureau t'a renvoyé ta journée du ${jour} : « ${motif} ». Corrige si besoin, puis renvoie-la.`;
  }
  const what = (p.labels || []).join(', ');
  return `Le bureau a corrigé ta journée du ${jour}${what ? ` : ${what}` : ''}. Motif : « ${motif} »`;
}
