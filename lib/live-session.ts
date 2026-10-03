// Pointage EN DIRECT (« Je commence » / « J'ai fini »), partagé entre l'écran
// du salarié (components/poseur-day.tsx, components/live-timer.tsx) et
// l'Assistant BEMEXO (lot 3 bis). Un seul chemin pour tout le monde.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { demanderPosition, FENETRE_POSITION_MS } from '@/lib/position';
import { geoInfoSeen } from '@/lib/position-info';

/** Le chrono ouvert d'un salarié (au plus un : la clé primaire est `user_id`). */
export interface OwnLiveSession {
  user_id: string;
  worksite_id: string;
  planning_id: string | null;
  work_date: string;
  started_at: string;
}

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
 * Efface UN pointage précis, sans rien écrire dans les heures.
 *
 * ON VISE LE CHRONO AFFICHÉ (`user_id` ET `started_at`), PAS « le chrono de ce
 * salarié » : un nouveau pointage remplace l'ancien (clé primaire `user_id`),
 * et une confirmation périmée effacerait sinon ce qui tourne à l'instant.
 * `.select('user_id')` : une suppression filtrée par la RLS renvoie zéro ligne
 * SANS erreur. Renvoie false quand rien n'a été effacé (ce n'est plus ce
 * chrono-là qui tourne). Aucune migration nécessaire : la policy
 * `active_sessions_delete` autorise le salarié à effacer le sien.
 */
export async function cancelLiveSession(p: { userId: string; startedAt: string }): Promise<boolean> {
  const { data, error } = await supabase.from('active_sessions')
    .delete().eq('user_id', p.userId).eq('started_at', p.startedAt).select('user_id');
  if (error) throw error;
  return !!data && data.length > 0;
}

/** En dessous, « J'ai fini » n'est pas du travail : c'est un appui de trop. */
export const MIN_LIVE_MS = 60_000;

export type FinishResult =
  /** La ligne d'heures est créée, à la minute (début tronqué, fin arrondie au-dessus). */
  | { kind: 'saved'; start_time: string; end_time: string }
  /** Moins d'une minute (ou fin ≤ début) : chrono effacé, rien n'est compté. */
  | { kind: 'cancelled' }
  /** Serveur pas encore migré, début et fin dans le même quart d'heure (BT001) : rien n'est écrit, le chrono reste ouvert. */
  | { kind: 'too_short' }
  /** Ce n'est plus ce chrono-là qui tourne (fermé ou remplacé ailleurs). */
  | { kind: 'stale' };

/** La fonction n'existe pas (encore) côté serveur : PostgREST (PGRST202) ou Postgres (42883). */
const missingFunction = (e: { code?: string } | null) => !!e && (e.code === 'PGRST202' || e.code === '42883');
/** Plus de chrono côté serveur : fermé entre-temps (borne, autre appareil). */
const noSession = (e: { message?: string } | null) => /Aucun pointage en cours/i.test(e?.message || '');

/**
 * « J'ai fini », À N'IMPORTE QUEL MOMENT, et l'heure réelle est gardée.
 *
 *   · `finish_active_session` (lot 9, une seule transaction côté serveur)
 *     décide TOUT, avec l'horloge du SERVEUR : moins d'une minute → chrono
 *     effacé sans erreur (`cancelled`) ; sinon début tronqué à la minute, fin
 *     arrondie au-dessus — jamais une minute contre le salarié. (L'horloge du
 *     téléphone peut retarder : s'y fier effacerait de vraies minutes.)
 *   · Fonction pas encore déployée (PGRST202 / 42883) : moins d'une minute à
 *     l'horloge du téléphone (et seulement si elle est plausible) → on efface
 *     le chrono comme « Annuler » ; sinon on retombe sur `stop_active_session`,
 *     exactement comme hier (quart d'heure) ; son refus BT001 devient
 *     `too_short`, que l'écran dit en UNE ligne neutre.
 *   · L'endroit de fin n'est demandé que si le salarié a vu l'information
 *     (CNIL) sur cet appareil — un chrono lancé à la borne ne la montre pas.
 *
 * `endTime` = heure de fin donnée par le salarié (pointage oublié).
 */
export async function finishLiveSession(p: {
  userId: string; startedAt: string; positionActive: boolean; endTime?: string;
}): Promise<FinishResult> {
  const ecoule = Date.now() - new Date(p.startedAt).getTime();
  // ON NE DEMANDE MÊME PAS L'ENDROIT SUR UN POINTAGE OUBLIÉ : au-delà de la
  // fenêtre, la position serait celle du domicile. `startedAt` vient du serveur.
  const tropVieux = ecoule > FENETRE_POSITION_MS;
  // Même règle qu'au départ : on ne passe les paramètres que si on a une
  // position. Sans eux, l'appel est exactement celui d'hier.
  const pos = p.positionActive && !tropVieux && geoInfoSeen(p.userId) ? await demanderPosition() : null;
  const args = {
    p_end: p.endTime ? `${p.endTime}:00` : null,
    ...(pos ? {
      p_lat: pos.lat,
      p_lng: pos.lng,
      p_accuracy: pos.accuracy == null ? null : Math.round(pos.accuracy),
    } : {}),
  };
  const first = await supabase.rpc('finish_active_session', args);
  if (!first.error) {
    const row = (Array.isArray(first.data) ? first.data[0] : first.data) as
      { start_time: string | null; end_time: string | null; cancelled: boolean } | null;
    if (!row || row.cancelled || !row.start_time || !row.end_time) return { kind: 'cancelled' };
    return { kind: 'saved', start_time: row.start_time, end_time: row.end_time };
  }
  if (noSession(first.error)) return { kind: 'stale' };
  if (!missingFunction(first.error)) throw first.error;

  // Repli : la migration du lot 9 n'est pas encore passée.
  if (!p.endTime && ecoule >= 0 && ecoule < MIN_LIVE_MS) {
    return (await cancelLiveSession({ userId: p.userId, startedAt: p.startedAt })) ? { kind: 'cancelled' } : { kind: 'stale' };
  }
  const { data, error } = await supabase.rpc('stop_active_session', args);
  if (error) {
    if (error.code === 'BT001') return { kind: 'too_short' };
    if (noSession(error)) return { kind: 'stale' };
    throw error;
  }
  const row = (Array.isArray(data) ? data[0] : data) as { start_time: string; end_time: string } | null;
  return row ? { kind: 'saved', start_time: row.start_time, end_time: row.end_time } : { kind: 'cancelled' };
}

/** Prévient les écrans ouverts qu'un pointage a démarré ou s'est fermé ailleurs. */
export const LIVE_CHANGED = 'bemexo:live-changed';
export function announceLiveChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LIVE_CHANGED));
}

/** Lit le chrono du salarié. `undefined` = lecture impossible (réseau) : surtout pas « aucun chrono ». */
export async function readOwnLiveSession(userId: string): Promise<OwnLiveSession | null | undefined> {
  const { data, error } = await supabase.from('active_sessions')
    .select('user_id, worksite_id, planning_id, work_date, started_at')
    .eq('user_id', userId).maybeSingle();
  if (error) return undefined;
  return (data as OwnLiveSession) || null;
}

/**
 * Le chrono du salarié, TENU À JOUR SANS RECHARGER (lot 9).
 *
 * Le pointage peut s'ouvrir ou se fermer AILLEURS : à la borne, sur la
 * tablette, par l'Assistant. On relit donc toutes les 30 s, au retour au
 * premier plan, et sur `LIVE_CHANGED`. `known` reste faux tant qu'aucune
 * lecture n'a abouti : on ne propose pas « Je commence » sur une inconnue
 * (un chrono par salarié). `onGone` est appelé quand le chrono affiché a
 * disparu (fermé ou remplacé) : la journée doit alors être relue, la ligne
 * créée par la fermeture y est.
 */
export function useOwnLiveSession(userId: string | undefined, onGone?: () => void) {
  const [session, setSession] = useState<OwnLiveSession | null>(null);
  const [known, setKnown] = useState(false);
  const shown = useRef<string | null>(null);
  const goneRef = useRef(onGone);
  goneRef.current = onGone;
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    if (!userId) return;
    const s = await readOwnLiveSession(userId);
    if (!mounted.current || s === undefined) return;
    const before = shown.current;
    shown.current = s?.started_at ?? null;
    // Même chrono qu'avant : on garde le même objet (pas de rendu pour rien toutes les 30 s).
    setSession((prev) => (prev && s && prev.started_at === s.started_at && prev.worksite_id === s.worksite_id
      && prev.planning_id === s.planning_id && prev.work_date === s.work_date ? prev : s));
    setKnown(true);
    if (before && before !== shown.current) goneRef.current?.();
  }, [userId]);

  useEffect(() => {
    mounted.current = true;
    reload();
    // Onglet caché : on ne relit pas (relecture au retour, via visibilitychange).
    const id = window.setInterval(() => { if (document.visibilityState !== 'hidden') reload(); }, 30_000);
    const onVisible = () => { if (document.visibilityState !== 'hidden') reload(); };
    window.addEventListener(LIVE_CHANGED, reload);
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mounted.current = false;
      window.clearInterval(id);
      window.removeEventListener(LIVE_CHANGED, reload);
      window.removeEventListener('focus', reload);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);

  return { session, known, reload };
}
