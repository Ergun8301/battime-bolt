// Lot 30 (borne robuste) — le RECHARGEMENT DE NUIT, sans risque.
// Règles pures : la page de la borne les interroge une fois par minute.
//
// POURQUOI. Une borne reste ouverte des semaines : sans rechargement, elle fait
// tourner l'ancienne version du site pour toujours. Une fois par nuit, elle se
// recharge d'elle-même — mais seulement quand cela ne gêne personne.
//
// LES CONDITIONS (toutes à la fois, sinon on ne fait rien et on réessaie plus tard) :
//   · dans la plage fermée de nuit : 02:00–04:00, heure de Paris (la même heure
//     que l'horloge de la borne et que ses heures d'ouverture) ;
//   · la tablette est en ligne ET la page est visible ;
//   · aucune interaction depuis 10 minutes (un QR affiché, c'est un salarié qui
//     est en train de pointer : son ticket vit 5 minutes, la marge est double) ;
//   · rien d'ouvert à l'écran (QR, confirmation, appairage en attente) ;
//   · pas déjà fait cette nuit.
//
// PAS DE BOUCLE. La nuit est marquée AVANT toute tentative (jour de Paris +
// heure). Si le marqueur ne peut pas être écrit (stockage refusé), on ne
// recharge jamais. Une tentative qui échoue (réseau coupé au mauvais moment)
// n'est pas refaite avant la nuit suivante. Après le rechargement, la page est
// neuve : sa « dernière interaction » est son ouverture, donc 10 minutes de calme.
import { parisDate, parisTime } from './kiosk-rules.ts';

export const NIGHT_FROM = '02:00';
export const NIGHT_UNTIL = '04:00';
/** Silence exigé avant de recharger. */
export const NIGHT_IDLE_MS = 10 * 60 * 1000;
/** La page se pose la question une fois par minute. */
export const NIGHT_CHECK_MS = 60 * 1000;

/** `hhmm` est-il dans [from, until[ ? (plage du même jour, pas à cheval sur minuit) */
export function inNightWindow(hhmm: string, from: string = NIGHT_FROM, until: string = NIGHT_UNTIL): boolean {
  const t = hhmm.slice(0, 5);
  return t >= from && t < until;
}

export interface NightMarker { day: string; at: number }

export interface NightInput {
  nowMs: number;
  online: boolean;
  visible: boolean;
  /** Millisecondes écoulées depuis le dernier toucher / la dernière touche (ou l'ouverture de la page). */
  idleMs: number;
  /** Un QR, une confirmation ou un appairage en attente est à l'écran. */
  busy: boolean;
  /** Le marqueur de la dernière tentative (jour de Paris), `null` = aucun. */
  marker: NightMarker | null;
}

export type NightWhy = 'hors_plage' | 'hors_ligne' | 'cachee' | 'occupee' | 'actif_recent' | 'deja_fait';
export type NightVerdict = { reload: true; day: string } | { reload: false; why: NightWhy };

export function nightReloadVerdict(i: NightInput): NightVerdict {
  const day = parisDate(i.nowMs);
  if (!inNightWindow(parisTime(i.nowMs))) return { reload: false, why: 'hors_plage' };
  if (i.marker && i.marker.day === day) return { reload: false, why: 'deja_fait' };
  if (!i.online) return { reload: false, why: 'hors_ligne' };
  if (!i.visible) return { reload: false, why: 'cachee' };
  if (i.busy) return { reload: false, why: 'occupee' };
  if (i.idleMs < NIGHT_IDLE_MS) return { reload: false, why: 'actif_recent' };
  return { reload: true, day };
}

/** Lecture sûre du marqueur (JSON du stockage) ; `null` = aucun ou illisible. */
export function parseNightMarker(raw: string | null | undefined): NightMarker | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { day?: unknown; at?: unknown };
    return typeof o?.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.day) ? { day: o.day, at: Number(o.at) || 0 } : null;
  } catch { return null; }
}
