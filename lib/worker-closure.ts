// Lot 11 — « Clôturer jusqu'au… » : la clôture des heures d'UN salarié (fin de
// contrat en cours de mois), en plus de la clôture du mois pour l'équipe.
//
// Table `user_closures` (migration 20261002120000_lot11_cloture_salarie.sql) :
// une ligne par salarié, `closed_until` = dernier jour clôturé. « Rouvrir » ne
// supprime rien : il pose `reopened_at` (la trace reste). Tant que la
// migration n'est pas appliquée, la lecture échoue et tout se comporte comme
// avant (aucune clôture).
import { supabase } from '@/lib/supabase';

export interface UserClosure { user_id: string; closed_until: string; closed_at?: string | null; closed_by?: string | null; reopened_at?: string | null }

/** Clôtures ACTIVES de l'entreprise (bureau). null = table absente / illisible. */
export async function fetchCompanyClosures(companyId: string): Promise<Map<string, string> | null> {
  const { data, error } = await supabase.from('user_closures').select('user_id, closed_until, reopened_at').eq('company_id', companyId);
  if (error) return null;
  const m = new Map<string, string>();
  for (const r of (data || []) as UserClosure[]) if (!r.reopened_at) m.set(r.user_id, r.closed_until);
  return m;
}

/** Ma clôture active (salarié). null = aucune (ou table absente). */
export async function fetchMyClosure(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('user_closures').select('closed_until, reopened_at').eq('user_id', userId).maybeSingle();
  if (error || !data) return null;
  const r = data as UserClosure;
  return r.reopened_at ? null : r.closed_until;
}

/** Ce jour est-il clôturé pour ce salarié ? */
export const closedFor = (closures: Map<string, string> | null | undefined, userId: string, date: string) => {
  const until = closures?.get(userId);
  return !!until && date <= until;
};

/** Clôture (ou déplace la date) — bureau seulement (RLS + garde en base). */
export async function closeWorkerUntil(companyId: string, userId: string, adminId: string, until: string): Promise<void> {
  const { error } = await supabase.from('user_closures').upsert(
    { user_id: userId, company_id: companyId, closed_until: until, closed_by: adminId, closed_at: new Date().toISOString(), reopened_at: null },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
}

/** Rouvre : rien n'est supprimé, la ligne garde sa trace (reopened_at). */
export async function reopenWorker(companyId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('user_closures').update({ reopened_at: new Date().toISOString() })
    .eq('company_id', companyId).eq('user_id', userId).is('reopened_at', null).select('user_id');
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
