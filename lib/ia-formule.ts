// Lot 6 — formule IA (« essai » ou « payant ») côté navigateur.
//
// La source de vérité est le secret AI_CONFIG des fonctions Edge : l'écran ne la
// devine jamais, il la DEMANDE (corps { statut: true } : aucun quota, aucun appel
// au modèle). Règle de prudence : tant qu'on ne sait pas, le bandeau « Mode
// essai » est AFFICHÉ (fonction injoignable, ancienne version encore déployée,
// réponse inattendue). Il ne disparaît que sur un « payant » explicite.
import { supabase } from '@/lib/supabase';

export const TRIAL_TEXT = 'Mode essai (Gemini gratuit) : données fictives uniquement. Google peut relire et réutiliser ce que vous envoyez.';

/** Bandeau visible sauf si la fonction a répondu « payant ». */
export const showTrialBanner = (formule: string | null | undefined): boolean => formule !== 'payant';

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
