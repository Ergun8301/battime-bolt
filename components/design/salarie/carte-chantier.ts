// Design salarié · étape 4 — les repères d'une CARTE de chantier (planche : étiquette d'état en haut, liseré par créneau).
// Des attributs seulement : la mise en forme est dans shell-v2.css (`[data-dz-creneau]`, `[data-dz-etat]`). Sans ?ui=2 on ne pose RIEN :
// l'ancienne interface garde exactement le même DOM.
import { dayPartOf } from '@/supabase/functions/_shared/day-part';

export type CreneauCarte = 'matin' | 'apres-midi' | 'soir';
/** Le créneau d'un horaire (day-part.ts) ; une journée entière ou sans horaire reste blanche (undefined). */
export function creneauCarte(debut?: string | null, fin?: string | null): CreneauCarte | undefined {
  const k = dayPartOf(debut, fin);
  return k && k !== 'journee' ? k : undefined;
}
/** Les attributs de la carte : `{}` hors ?ui=2. `etat` = un des états de la planche (envoyee, a-envoyer, renvoyee, comptable, retiree, prevue, en-cours…). */
export function reperesCarte(ui2: boolean, etat: string, debut?: string | null, fin?: string | null): { 'data-dz-etat'?: string; 'data-dz-creneau'?: string } {
  if (!ui2) return {};
  const c = creneauCarte(debut, fin);
  return { 'data-dz-etat': etat, ...(c ? { 'data-dz-creneau': c } : {}) };
}
