// « Envoyer à sa place » : le bureau envoie les heures qu'un salarié a saisies sans les envoyer. Module à part, chargé au clic (import différé) depuis le
// planning et la fiche d'une ligne, pour ne pas alourdir le premier chargement de /admin.
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { notifyWorker } from '@/lib/admin-writes';

/**
 * « Envoyer à sa place » : le bureau envoie une ligne que le salarié a saisie sans l'envoyer (brouillon). Elle compte alors comme n'importe quelle journée envoyée.
 * Jamais sans trace : `submitted_by` porte la personne du bureau. Une ligne déjà envoyée, retirée, verrouillée ou renvoyée au salarié n'est pas touchée (0 ligne = false).
 * Le salarié est prévenu (notification, un plus jamais bloquant).
 */
export async function sendDraftForWorker(companyId: string, entryId: string, officeUserId: string): Promise<boolean> {
  const { data, error } = await supabase.from('time_entries')
    .update({ status: 'submitted', submitted_at: new Date().toISOString(), submitted_by: officeUserId })
    .eq('id', entryId).eq('company_id', companyId).eq('status', 'draft').eq('locked', false).is('submitted_at', null)
    .select('id, user_id, work_date, start_time, end_time');
  if (error) throw error;
  const row = (data as { user_id: string; work_date: string; start_time: string; end_time: string }[] | null)?.[0];
  if (!row) return false;
  const jour = new Date(`${row.work_date}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  await notifyWorker(row.user_id, 'Heures envoyées par le bureau',
    `Vos heures du ${jour} (${row.start_time.slice(0, 5)} – ${row.end_time.slice(0, 5)}) ont été envoyées pour vous par le bureau.`, 'heures');
  return true;
}

/** Toutes les lignes en brouillon d'une case du planning ; renvoie le nombre de lignes réellement envoyées (0 = déjà changées). */
export async function sendDraftsForWorker(companyId: string, entryIds: string[], officeUserId: string): Promise<number> {
  let n = 0;
  for (const id of entryIds) if (await sendDraftForWorker(companyId, id, officeUserId)) n++;
  return n;
}

/** Le geste complet, messages compris (planning et fiche d'une ligne) : vrai si au moins une ligne est partie. */
export async function envoyerAPlace(p: { companyId: string; entryIds: string[]; officeUserId: string; prenom: string }): Promise<boolean> {
  try {
    if (await sendDraftsForWorker(p.companyId, p.entryIds, p.officeUserId)) { toast.success(`Heures envoyées pour ${p.prenom} : il est prévenu`); return true; }
    toast.error('Ces heures ont déjà changé (envoyées ou renvoyées) : rechargez.');
  } catch (err) {
    const msg = (err as { message?: string })?.message || 'Envoi impossible';
    toast.error(/submitted_by/.test(msg) ? 'Mise à jour de la base en attente : envoi impossible pour le moment.' : msg);
  }
  return false;
}
