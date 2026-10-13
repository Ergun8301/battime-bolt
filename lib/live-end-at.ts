// Lot 10 : fermer le pointage EN COURS à une heure donnée par le salarié.
//
// Même fonction serveur que « Terminer ma journée » (`finish_active_session`),
// mais SANS le repli de `finishLiveSession` : quand la fonction n'existe pas
// encore, ce repli (`stop_active_session`) arrondit au quart d'heure et ferme
// de façon irréversible, ce qui ne convient pas à une heure choisie à la minute.
import { supabase } from '@/lib/supabase';

export type EndAtResult =
  | { kind: 'saved'; start_time: string; end_time: string }
  | { kind: 'cancelled' }          // le serveur a effacé le chrono (fin <= début du chrono courant) : rien compté
  | { kind: 'stale' }              // « Aucun pointage en cours »
  | { kind: 'unavailable' };       // PGRST202 / 42883 : la fonction n'existe pas, RIEN n'a été écrit

/** Ferme le chrono du salarié connecté à `endTime` (HH:MM, Paris). Lève l'erreur réseau/serveur telle quelle. */
export async function finishLiveAt(endTime: string): Promise<EndAtResult> {
  const { data, error } = await supabase.rpc('finish_active_session', { p_end: `${endTime}:00` });
  if (error) {
    if (/Aucun pointage en cours/i.test(error.message || '')) return { kind: 'stale' };
    if (error.code === 'PGRST202' || error.code === '42883') return { kind: 'unavailable' };
    throw error;
  }
  const row = (Array.isArray(data) ? data[0] : data) as { start_time: string | null; end_time: string | null; cancelled: boolean } | null;
  if (!row || row.cancelled || !row.start_time || !row.end_time) return { kind: 'cancelled' };
  return { kind: 'saved', start_time: row.start_time, end_time: row.end_time };
}
