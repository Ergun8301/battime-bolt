// Surfaces du BUREAU : capacité (B1…) → clés de code qui la portent (rpc:, table:, fenetre:, ancre:…).
// Couche volatile du registre : un redesign ne touche que ce fichier et son pendant salarié.
// Vide en 3a-1 (socle) ; rempli à partir de l'interface par la tâche de remplissage.
export const SURFACES_BUREAU: Record<string, string[]> = {};
