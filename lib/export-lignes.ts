// Lot 18 — lecture des heures d'un export d'ÉQUIPE : UN SEUL filtre, pour le fichier, pour le verrou
// et pour l'alerte. Ainsi le nombre annoncé (« N lignes de M salariés ») est, par construction,
// celui des lignes que le code verrouille.
import { supabase } from '@/lib/supabase';
import { fetchAllPaged } from '@/lib/fetch-all';
import { compterVerrou, STATUTS_EXPORTES, type CompteVerrou, type LigneVerrou } from '@/lib/export-verrou';

/**
 * Les heures envoyées ou validées de l'entreprise sur la période (jours inclus), avec les colonnes
 * demandées. À compléter par l'appelant (`.order(...)`, `.range(...)`) : filtre seulement.
 */
export function lignesExportees(companyId: string, from: string, to: string, colonnes: string) {
  return supabase.from('time_entries')
    .select(colonnes)
    .eq('company_id', companyId)
    .in('status', [...STATUTS_EXPORTES])
    .gte('work_date', from).lte('work_date', to);
}

/**
 * Compte, AU CLIC, ce que l'export verrouillerait (lecture seule, paginée : au-delà de 1000 lignes
 * une requête simple serait tronquée sans erreur). Lève l'erreur de lecture : sans compte exact,
 * l'appelant n'exporte rien.
 */
export async function lireCompteVerrou(companyId: string, from: string, to: string): Promise<CompteVerrou> {
  // `id` en dernier critère : les pages se suivent sans trou ni doublon, même à égalité de jour et de salarié.
  const rows = await fetchAllPaged<LigneVerrou>((f, t) => lignesExportees(companyId, from, to, 'id, user_id, locked')
    .order('work_date').order('user_id').order('id')
    .range(f, t) as unknown as PromiseLike<{ data: LigneVerrou[] | null; error: { message: string } | null }>);
  return compterVerrou(rows);
}
