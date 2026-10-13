// Lot 23 : « Terminé le 12 octobre 2026 », là où le salarié voit un chantier terminé (cartes de la journée,
// semaine, mois, historique, pointage en cours). Ne rend RIEN tant que le chantier est en cours ou que la
// colonne n'existe pas : les écrans sont alors exactement ceux d'avant. Minuscule exprès (premier chargement
// de /poseur) : aucune dépendance, aucun style à charger.
import { termineLe, type CompletionLike } from '@/supabase/functions/_shared/chantier-statut';

/** `dark` : sur un fond sombre (le chrono qui tourne). */
export default function TermineLe({ ws, court = false, dark = false }: { ws?: CompletionLike | null; court?: boolean; dark?: boolean }) {
  const t = termineLe(ws, court);
  if (!t) return null;
  return <span data-testid="termine-le" style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: dark ? '#D9D2C2' : '#6E6A63', lineHeight: 1.3, marginTop: 1 }}>{t}</span>;
}
