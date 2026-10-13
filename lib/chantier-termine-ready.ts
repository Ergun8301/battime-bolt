// Lot 23 : « la migration est-elle appliquée ? » — SEUL morceau de lib/chantier-termine.ts qui est dans le premier
// chargement du bureau (le bloc de la fiche client). Fichier à part exprès : le reste (lectures du bilan, contrôle
// avant de terminer) est chargé avec la fenêtre, à l'ouverture (lib/lazy-window.tsx).
//
// AVANT LA MIGRATION (20261013180000), RIEN NE CHANGE : la fonction worksite_completion_ready() manque, ou la
// requête échoue pour une raison quelconque → « pas prêt », sans message ni trace dans la console. Seul un « oui »
// est gardé pour la vie de la page ; un « non » se retente à la prochaine ouverture d'une fiche client.
import { supabase } from '@/lib/supabase';

let ready = false;

/** La migration a-t-elle déjà répondu « oui » sur cette page ? Sert d'état de départ : le bloc est là dès le premier rendu. */
export const completionKnownReady = (): boolean => ready;

/** La migration est-elle appliquée ? Faux au moindre doute, en silence. */
export async function completionReady(): Promise<boolean> {
  if (ready) return true;
  try {
    const { data, error } = await supabase.rpc('worksite_completion_ready', {}, { get: true });
    if (!error && data === true) ready = true;
  } catch { /* réseau coupé : comme « pas prêt », sans bruit */ }
  return ready;
}
