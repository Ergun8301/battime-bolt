// Catégorie d'un document de chantier (lot 24, oct. 2026), côté navigateur.
//
// DEUX RÈGLES :
//   · AVANT LA MIGRATION (20261013120200), RIEN NE CHANGE : la fonction
//     document_category_ready() manque, ou la requête échoue pour une raison
//     quelconque → « pas prêt », sans message ni trace dans la console. Le panneau
//     Documents reste exactement celui d'avant. Seul un « oui » est gardé pour la
//     vie de la page ; un « non » se retente à la prochaine ouverture du panneau.
//   · UN SEUL CHAMP : on n'écrit jamais autre chose que `category`. La base le
//     garantit aussi (déclencheur + droits de colonne), mais on ne compte pas dessus.
//
// RIEN NE S'EFFACE : aucun appel de suppression ici. « Annuler » = remettre
// l'ancienne catégorie par un second changement (la base garde les deux dans sa trace).
import { supabase } from '@/lib/supabase';
import { GONE_TEXT } from '@/supabase/functions/_shared/doc-categories';

let ready = false;

/** La migration a-t-elle déjà répondu « oui » sur cette page ? Sert d'état de départ : le bouton est là dès le premier rendu. */
export const docCategoryKnownReady = (): boolean => ready;

/** La migration est-elle appliquée ? Faux au moindre doute, en silence. */
export async function docCategoryReady(): Promise<boolean> {
  if (ready) return true;
  try {
    const { data, error } = await supabase.rpc('document_category_ready', {}, { get: true });
    if (!error && data === true) ready = true;
  } catch { /* réseau coupé : comme « pas prêt », sans bruit */ }
  return ready;
}

export interface CategoryChange { id: string; category: string | null }

/**
 * Change la catégorie d'UN document. L'ancienne valeur n'est pas relue ici : l'appelant garde celle qu'il a
 * affichée à l'ouverture (sinon, après une réponse perdue puis « Réessayer », « Annuler » remettrait la
 * nouvelle valeur). L'erreur de la base est relancée telle quelle.
 */
export async function setDocumentCategory(id: string, category: string | null): Promise<CategoryChange> {
  const { data, error } = await supabase.from('documents').update({ category }).eq('id', id).select('id, category');
  if (error) throw error;
  // Aucune ligne rendue : la base a répondu « rien » sans erreur (document passé en facture, supprimé, d'un autre…).
  if (!data || data.length === 0) throw Object.assign(new Error(GONE_TEXT), { code: 'GONE' });
  return { id, category: (data[0].category as string | null) ?? null };
}
