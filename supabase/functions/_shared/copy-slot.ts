// Lot 2 (d) — COPIER une intervention du planning en la glissant avec Ctrl, Alt
// (⌥) ou ⌘ maintenu ; un glisser simple DÉPLACE toujours.
//
// Les règles d'une case CIBLE, partagées par la copie et le déplacement. La
// base ne refuse rien ici (table planning : ni trigger, ni index unique, la
// seule RLS du bureau) : c'est donc l'écran qui dit non, AVANT toute écriture.
// Une copie ne crée qu'une ligne de planning : jamais d'heures (time_entries),
// ni documents, ni pointage.
//
// Fonctions pures, sans dépendance : importées par Deno ET par le navigateur.
import { findOverlap, plannedSpan, type PlannedLike, type Span } from './day-hours.ts';

/** Ce que l'écran sait de la case visée (salarié × jour). */
export interface TargetState {
  /** Une absence (congé, maladie…) est posée ce jour-là : la case n'affiche aucune bulle. */
  absent: boolean;
  /** Le mois est clôturé par le bureau. */
  monthClosed: boolean;
  /** Les heures de ce salarié sont clôturées jusqu'à cette date au moins. */
  workerClosed: boolean;
}

export type RefusalCode = 'absent' | 'month_closed' | 'worker_closed' | 'duplicate' | 'overlap';
export interface Refusal { code: RefusalCode; message: string }

/**
 * Déplacement OU copie vers une case où rien ne doit arriver. Sur une absence,
 * la bulle disparaissait de l'écran (une case absente n'affiche pas de bulle) ;
 * dans un mois ou chez un salarié clôturé, elle demanderait des heures que
 * personne ne pourra plus envoyer.
 */
export function targetRefusal(t: TargetState, done: 'copié' | 'déplacé' = 'copié'): Refusal | null {
  const tail = ` : rien n’a été ${done}.`;
  if (t.absent) return { code: 'absent', message: `Absent ce jour-là${tail}` };
  if (t.monthClosed) return { code: 'month_closed', message: `Mois clôturé${tail}` };
  if (t.workerClosed) return { code: 'worker_closed', message: `Heures clôturées pour ce salarié${tail}` };
  return null;
}

const hm = (v?: string | null): string | null => (v || '').slice(0, 5) || null;

/**
 * La copie de `src` posée dans une case qui contient déjà `cell`. null = elle
 * peut partir. Première règle qui s'applique :
 *  1–3. la case elle-même (absence, mois clôturé, salarié clôturé) ;
 *  4.   le même chantier aux mêmes heures y est déjà (sans heures = sans
 *       heures) — une copie dans sa propre case l'est toujours ;
 *  5.   ses heures prévues en chevauchent d'autres : depuis le lot 1, le salarié
 *       ne pourrait confirmer ni l'un ni l'autre (1 min de contact tolérée).
 * Le même chantier deux fois le même jour, matin ET après-midi, reste permis.
 */
export function copyRefusal(src: PlannedLike, cell: PlannedLike[], t: TargetState): Refusal | null {
  const target = targetRefusal(t, 'copié');
  if (target) return target;
  const slots = cell.filter((c) => !c.absence_type);
  const same = slots.some((c) => (c.worksite_id ?? null) === (src.worksite_id ?? null)
    && hm(c.estimated_start) === hm(src.estimated_start) && hm(c.estimated_end) === hm(src.estimated_end));
  if (same) return { code: 'duplicate', message: 'Déjà prévu dans cette case.' };
  const span = plannedSpan(src);
  if (span) {
    const hit = findOverlap(span, slots.map(plannedSpan).filter((s): s is Span => !!s));
    if (hit) return { code: 'overlap', message: `Chevauche ${hit.start}–${hit.end} déjà prévu ce jour-là.` };
  }
  return null;
}
