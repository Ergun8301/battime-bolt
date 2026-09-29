// Enregistrer UNE intervention du salarié — le chemin de la saisie manuelle.
//
// Sorti tel quel de `components/poseur-day.tsx` pour que l'Assistant BEMEXO
// (lot 4) passe EXACTEMENT par le même chemin : mêmes colonnes, statut
// « draft », identifiant local anti-doublon, repli hors ligne, même RLS.
import { supabase } from '@/lib/supabase';
import { addPendingEntry, type PendingEntry } from '@/lib/offline-store';

/**
 * - 'online'  : enregistré sur le serveur ;
 * - 'offline' : pas de réseau, gardé sur le téléphone (partira tout seul) ;
 * - 'queued'  : le serveur a refusé ou le réseau a lâché en plein envoi — gardé
 *               sur le téléphone plutôt que perdu.
 */
export async function insertWorkerEntry(pending: PendingEntry): Promise<'online' | 'offline' | 'queued'> {
  if (!navigator.onLine) {
    addPendingEntry(pending.user_id, pending);
    return 'offline';
  }
  const row = {
    company_id: pending.company_id, user_id: pending.user_id, worksite_id: pending.worksite_id, planning_id: pending.planning_id ?? null,
    work_date: pending.work_date, start_time: pending.start_time, end_time: pending.end_time, break_minutes: pending.break_minutes,
    meal_allowance: pending.meal_allowance, observation: pending.observation ?? null, reception: pending.reception ?? null, status: 'draft' as const,
  };
  let { error } = await supabase.from('time_entries').insert({ ...row, client_id: pending.localId });
  if (error && error.code === 'PGRST204' && error.message?.includes('client_id')) {
    ({ error } = await supabase.from('time_entries').insert(row));
  }
  if (error) {
    addPendingEntry(pending.user_id, pending);
    return 'queued';
  }
  return 'online';
}
