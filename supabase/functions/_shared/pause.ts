// Lot 3bis — la pause d'une ligne d'heures (time_entries.break_minutes).
//
// UNE seule lecture de ce que l'on tape, UN seul affichage, UNE seule règle de
// longueur, pour tous les endroits où une pause se note : la fiche du salarié,
// la question à l'envoi (lignes de la borne comprises), la correction du
// bureau et la carte de l'Assistant. Avant, chaque écran avait sa liste
// (0 / 30 / 1 h côté salarié, une liste déroulante côté bureau, un nombre de
// minutes dans l'Assistant) : une pause de 45 min ou d'1 h 15 ne se disait pas
// partout.
//
// LA RÈGLE NE CHANGE PAS : une pause est plus courte que la ligne. C'est celle
// de keptBreak (day-hours.ts), de precheck (office-edits.ts) et de la base
// (office_correct_entry), avec le MÊME message.
//
// Fonctions pures, sans dépendance : importées par Deno ET par le navigateur.

/** Les puces proposées partout (minutes). « Autre » permet toute durée h:mm. */
export const PAUSE_QUICK = [0, 15, 30, 45, 60, 90, 120] as const;

/** Garde-fou contre une faute de frappe (12 h) ; la vraie limite reste la ligne. */
export const PAUSE_MAX_MINUTES = 720;

/** Texte EXACT de la base (migration 20261009120000_lot2_corrections_bureau.sql). */
export const PAUSE_TOO_LONG = 'La pause doit être plus courte que la journée.';
export const PAUSE_UNREADABLE = 'Durée non comprise. Ex. 1:15 ou 45 min.';
/**
 * « 1 » ou « 2 » tapé sous « h:mm » : une heure ou une minute ? On ne devine
 * pas. Un nombre seul de 1 à 9 est refusé ; à partir de 10, ce sont des minutes.
 */
export const PAUSE_BARE_DIGIT = 'Écris 1:00 pour une heure, ou 5 min.';
export const PAUSE_BARE_DIGIT_VOUS = 'Écrivez 1:00 pour une heure, ou 5 min.';

export type PauseRead =
  | { kind: 'empty' }
  | { kind: 'ok'; minutes: number }
  | { kind: 'bad'; message: string };

const MIN = '(?:minutes?|min|mn|m)';
const RE_MIN = new RegExp(`^(\\d{1,3})(${MIN})?$`);
const RE_H = new RegExp(`^(\\d{1,2})(?:h|heures?)(?:(\\d{2})${MIN}?)?$`);
const RE_SEP = /^(\d{1,2})[:.,](\d{2})$/;

/**
 * Ce que l'on a tapé, lu comme une durée :
 *  « 45 », « 45 min », « 30 minutes »        → minutes ;
 *  « 1h », « 1 h 30 », « 1h15min », « 1 heure 15 » → heures (+ minutes sur 2 chiffres) ;
 *  « 1:15 », « 0:45 », « 1,15 », « 1.30 »     → h:mm.
 * Refusé exprès : « 1:5 », « 1h5 », « 1,5 » (ambigus), « 1:75 », « -15 », « abc »,
 * plus de 12 h, et un nombre seul de 1 à 9 (voir PAUSE_BARE_DIGIT).
 */
export function readPauseInput(raw: string | null | undefined, vous = false): PauseRead {
  const t = String(raw ?? '').toLowerCase().replace(/\s+/g, '');
  if (!t) return { kind: 'empty' };
  let m: number | null = null;
  let r = RE_MIN.exec(t);
  if (r) {
    m = Number(r[1]);
    if (!r[2] && m >= 1 && m <= 9) return { kind: 'bad', message: vous ? PAUSE_BARE_DIGIT_VOUS : PAUSE_BARE_DIGIT };
  } else if ((r = RE_H.exec(t) ?? RE_SEP.exec(t))) {
    const mm = Number(r[2] || 0);
    if (mm < 60) m = Number(r[1]) * 60 + mm;
  }
  if (m === null) return { kind: 'bad', message: PAUSE_UNREADABLE };
  if (m > PAUSE_MAX_MINUTES) return { kind: 'bad', message: PAUSE_TOO_LONG };
  return { kind: 'ok', minutes: m };
}

/** La durée lue, ou null (vide, illisible, trop longue). */
export function parsePauseInput(raw: string | null | undefined): number | null {
  const r = readPauseInput(raw);
  return r.kind === 'ok' ? r.minutes : null;
}

/** 0 → « 0 min », 45 → « 45 min », 60 → « 1 h », 75 → « 1 h 15 », 125 → « 2 h 05 ». */
export function formatPause(minutes: number): string {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60); const r = m % 60;
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
}

/** 75 → « 1:15 », 20 → « 0:20 » : pré-remplit « Autre ». */
export function formatPauseInput(minutes: number): string {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** Même règle que keptBreak / precheck / la base : plus courte que la ligne (`span`, pause non déduite). */
export function pauseFits(minutes: number, span?: number | null): boolean {
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= PAUSE_MAX_MINUTES
    && (minutes === 0 || span == null || minutes < span);
}

/** null si la pause tient dans la ligne, sinon le message à afficher. */
export function pauseError(minutes: number, span?: number | null): string | null {
  if (!Number.isInteger(minutes) || minutes < 0) return PAUSE_UNREADABLE;
  return pauseFits(minutes, span) ? null : PAUSE_TOO_LONG;
}
