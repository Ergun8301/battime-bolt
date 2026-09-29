// Pointage EN DIRECT (« Je commence » / « J'ai fini »), partagé entre l'écran
// du salarié (components/live-timer.tsx) et l'Assistant BEMEXO (lot 3 bis).
// Le code est celui de live-timer.tsx, sorti tel quel : un seul chemin.
import { supabase } from '@/lib/supabase';
import { demanderPosition, FENETRE_POSITION_MS } from '@/lib/position';

/**
 * Démarre un pointage. `{ running: true }` si un chrono tourne déjà (23505).
 * Les autres erreurs sont levées.
 */
export async function startLiveSession(p: {
  userId: string; companyId: string; worksiteId: string; planningId: string | null; workDate: string; positionActive: boolean;
}): Promise<{ running: boolean }> {
  // L'ENDROIT, AVANT L'ÉCRITURE, ET JAMAIS AU PRIX DU POINTAGE.
  // `demanderPosition` rend toujours la main — refus, sous-sol, vieux
  // téléphone donnent `null`. Un salarié qui refuse pointe exactement comme
  // avant : c'est ce qui rend son refus réellement libre.
  const pos = p.positionActive ? await demanderPosition() : null;

  // ── LES COLONNES NE SONT AJOUTÉES QUE S'IL Y A QUELQUE CHOSE À METTRE ──
  //
  // CE N'EST PAS UNE COQUETTERIE. Tant que la migration de l'étape 26 n'est
  // pas appliquée, ces colonnes n'existent pas : les nommer ferait échouer
  // l'insertion avec un PGRST204, et PLUS PERSONNE NE POURRAIT DÉMARRER UN
  // POINTAGE. Quand la position est absente — interrupteur éteint, refus,
  // colonnes pas encore là — l'écriture est identique au mot près à celle d'hier.
  const { error } = await supabase.from('active_sessions').insert({
    user_id: p.userId, company_id: p.companyId, worksite_id: p.worksiteId,
    planning_id: p.planningId, work_date: p.workDate,
    // L'HEURE DE LA PRISE N'EST PAS ENVOYÉE D'ICI, ET C'EST DÉLIBÉRÉ : c'est le
    // trigger qui pose `now()`, côté serveur (jamais l'horloge du téléphone).
    ...(pos ? {
      start_lat: pos.lat,
      start_lng: pos.lng,
      start_accuracy_m: pos.accuracy == null ? null : Math.round(pos.accuracy),
    } : {}),
  });
  if (error) {
    // 23505 = un chrono tourne déjà.
    if (error.code === '23505') return { running: true };
    throw error;
  }
  return { running: false };
}

/**
 * Ferme le chrono et crée l'intervention, EN UNE SEULE ÉCRITURE côté serveur
 * (`stop_active_session`). Renvoie les heures retenues, ou null.
 */
export async function stopLiveSession(p: { startedAt: string; positionActive: boolean; endTime?: string }) {
  // ON NE DEMANDE MÊME PAS L'ENDROIT SUR UN POINTAGE OUBLIÉ : au-delà de la
  // fenêtre, la position serait celle du domicile. `startedAt` vient du serveur.
  const ecoule = Date.now() - new Date(p.startedAt).getTime();
  const tropVieux = ecoule > FENETRE_POSITION_MS;
  // Même règle qu'au départ : on ne passe les paramètres que si on a une
  // position. Sans eux, l'appel est exactement celui d'hier.
  const pos = p.positionActive && !tropVieux ? await demanderPosition() : null;
  const { data, error } = await supabase.rpc('stop_active_session', {
    p_end: p.endTime ? `${p.endTime}:00` : null,
    ...(pos ? {
      p_lat: pos.lat,
      p_lng: pos.lng,
      p_accuracy: pos.accuracy == null ? null : Math.round(pos.accuracy),
    } : {}),
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as { start_time: string; end_time: string } | null;
}

/** Prévient les écrans ouverts qu'un pointage a démarré ou s'est fermé ailleurs. */
export const LIVE_CHANGED = 'bemexo:live-changed';
export function announceLiveChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LIVE_CHANGED));
}
