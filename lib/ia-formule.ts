// Lot 6 — formule IA (« essai » ou « payant ») côté navigateur.
//
// La source de vérité est le secret AI_CONFIG des fonctions Edge : l'écran ne la
// devine jamais, il la DEMANDE (corps { statut: true } : aucun quota, aucun appel
// au modèle).
//
// À la demande d'Ergun, plus RIEN n'est affiché aux patrons ni aux salariés
// (le bandeau « Mode essai » a été retiré des assistants et de la lecture d'un
// bulletin). Cette lecture ne sert plus qu'au SUPPORT BEMEXO : une ligne
// discrète « IA : formule essai / payant » sur sa console (app/support).
import { supabase } from '@/lib/supabase';

/** La formule active, demandée à une fonction d'IA ; null si inconnue (erreur, vieille version, panne). */
export async function iaFormule(fn: 'assistant' | 'worker-assistant' | 'payslip-read'): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke(fn, { body: { statut: true } });
    if (error) return null;
    const f = (data as { formule?: unknown } | null)?.formule;
    return f === 'essai' || f === 'payant' ? f : null;
  } catch {
    return null;
  }
}
