// Lot 11 — UNE définition de « réserve levée », partagée par tous les écrans
// (bureau, salarié, Assistant) : sinon la pastille dit 1 et la liste est vide.
//
//   · levée par le BUREAU   → reserve_resolved_at (RPC set_reserve_resolution)
//   · levée par le SALARIÉ  → reserve_fixed_at    (RPC mark_reserve_fixed, déjà en prod)
// Une réserve est « à lever » tant qu'aucune des deux n'est posée.
// (Étape 17 disait « le salarié ne se donne pas quitus » ; Ergun demande
//  désormais qu'il puisse lever. La trace reste : qui, quand, commentaire,
//  photo — et le bureau peut toujours « Rouvrir ».)

export interface ReserveLike {
  reserve_resolved_at?: string | null;
  reserve_resolution?: string | null;
  reserve_fixed_at?: string | null;
  reserve_fix_note?: string | null;
}

export const isReserveLifted = (e: ReserveLike) => !!(e.reserve_resolved_at || e.reserve_fixed_at);
export const liftedAt = (e: ReserveLike) => e.reserve_resolved_at ?? e.reserve_fixed_at ?? null;
export const liftedNote = (e: ReserveLike) => (e.reserve_resolved_at ? e.reserve_resolution : e.reserve_fix_note) ?? null;
export const liftedBy = (e: ReserveLike): 'bureau' | 'salarie' | null =>
  e.reserve_resolved_at ? 'bureau' : e.reserve_fixed_at ? 'salarie' : null;

/** Libellé des photos prises à la levée (le libellé d'un document ne change plus après l'envoi). */
export const RESERVE_LIFT_LABEL = 'Réserve levée';
