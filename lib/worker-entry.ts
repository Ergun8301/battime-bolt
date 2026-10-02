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

/**
 * « Avec réserve » sur une de SES lignes (Assistant BEMEXO, lot 3 bis). Mêmes
 * colonnes que l'éditeur de journée (`reception`, `observation`) et même
 * marquage qu'une modification d'une journée déjà envoyée. Le détail est
 * FACULTATIF : sans texte, la note existante n'est pas touchée.
 * Renvoie false si la RLS a refusé (ligne verrouillée par le bureau).
 */
export async function markEntryReserve(p: { userId: string; entryId: string; detail?: string | null; wasSubmitted: boolean }): Promise<boolean> {
  const detail = (p.detail ?? '').trim();
  const { data, error } = await supabase.from('time_entries').update({
    reception: 'avec',
    ...(detail ? { observation: detail } : {}),
    ...(p.wasSubmitted ? { modified_at: new Date().toISOString(), modified_by: p.userId } : {}),
  }).eq('id', p.entryId).eq('user_id', p.userId).select('id, reserve_fixed_at, reserve_resolved_at');
  if (error) throw error;
  const row = (data as { reserve_fixed_at: string | null; reserve_resolved_at: string | null }[] | null)?.[0];
  // Lot 11 : un nouveau problème signalé sur une ligne que le salarié avait
  // levée repart « à traiter » (sinon la réserve naîtrait déjà levée).
  if (row?.reserve_fixed_at && !row.reserve_resolved_at) {
    await supabase.rpc('mark_reserve_fixed', { p_entry_id: p.entryId, p_fixed: false, p_note: null });
  }
  return !!data && data.length > 0;
}

/**
 * Nouveaux horaires d'une de SES lignes (tiroir « OK ✓ » sur une ligne
 * existante), même marquage qu'à l'écran si la journée est déjà envoyée.
 * Renvoie false si la RLS a refusé (ligne verrouillée par le bureau).
 */
export async function updateEntryTimes(p: { userId: string; entryId: string; start: string; end: string; wasSubmitted: boolean }): Promise<boolean> {
  const { data, error } = await supabase.from('time_entries').update({
    start_time: p.start, end_time: p.end,
    ...(p.wasSubmitted ? { modified_at: new Date().toISOString(), modified_by: p.userId } : {}),
  }).eq('id', p.entryId).eq('user_id', p.userId).select('id');
  if (error) throw error;
  return !!data && data.length > 0;
}
