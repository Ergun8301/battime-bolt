// Une seule définition de « ce qui compte » pour la paie et le bureau.
//
// 'submitted'  = heures déclarées par le salarié → comptées partout.
// 'validated'  = reliquat historique (l'étape de validation n'existe plus) →
//                traité exactement comme 'submitted'.
// 'draft'      = brouillon jamais envoyé → visible du salarié seulement.
// 'cancelled'  = intervention retirée après envoi → jamais exportée,
//                verrouillée, comptée ni copiée.

export const COUNTED_STATUSES = ['submitted', 'validated'] as const;

export function isCounted(status: string | null | undefined): boolean {
  return status === 'submitted' || status === 'validated';
}
