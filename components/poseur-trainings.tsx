'use client';

// Formations (lot 6, oct. 2026) — côté SALARIÉ (et chef d'équipe) :
//  - useMyTrainings : mes formations (my_trainings), lues au chargement, toutes
//    les 60 s tant que la fonction existe, au retour sur l'appli (notification
//    touchée, onglet repris) et après chaque « Vue » ;
//  - TrainingsBanner : « 2 formations à voir › » sur « Ma journée » (même
//    habillage que « réserves à lever »), tant qu'il en reste à voir ;
//  - PoseurTrainings : la liste (components/poseur-trainings-list.tsx, chargée à l'ouverture de
//    l'onglet : lazyWindow dans app/poseur/page.tsx). « Ouvrir ↗ » est un VRAI lien (nouvel onglet,
//    rel="noopener noreferrer") — jamais d'iframe, aucune vidéo hébergée ici ;
//    « Vue » se coche à la main (set_training_seen), « Annuler » 10 s.
//  - Lot 13 : une vidéo envoyée par le bureau (kind 'upload') se regarde DANS
//    l'appli (« Regarder » : lecteur intégré, lien signé créé à l'ouverture,
//    components/training-video-player.tsx) ; « Vue » par set_training_video_seen.
// Tant que la migration n'est pas appliquée : rien du tout (ni bandeau, ni menu).
import { useCallback, useEffect, useRef, useState } from 'react';
import { keep } from '@/lib/same';
import { fetchMyTrainings, TRAININGS_CHANGED_EVENT, type MyTraining } from '@/lib/trainings';
import { toSeeLabel } from '@/supabase/functions/_shared/trainings';

interface State { available: boolean; items: MyTraining[] }
const OFF: State = { available: false, items: [] };
const POLL_MS = 60_000;

/** Mes formations. `available` = la migration est passée (sinon : rien ne s'affiche). */
export function useMyTrainings(userId: string | null | undefined) {
  const [st, setSt] = useState<State>(OFF);
  const seq = useRef(0);
  const availRef = useRef(false);
  const load = useCallback(async () => {
    if (!userId) return;
    const n = ++seq.current;
    const r = await fetchMyTrainings();
    if (n !== seq.current) return;
    if (r === 'missing') { availRef.current = false; setSt((prev) => (prev.available || prev.items.length ? OFF : prev)); return; }
    if (!r) return; // lecture en échec (réseau…) : on garde ce qu'on sait, sans message
    availRef.current = true;
    setSt((prev) => keep(prev, { available: true, items: r }));
  }, [userId]);
  useEffect(() => {
    load();
    // Toutes les minutes SEULEMENT si la fonction existe (avant la migration : pas
    // une requête en échec par minute) ; sinon au retour sur l'appli.
    const id = setInterval(() => { if (availRef.current && document.visibilityState !== 'hidden') load(); }, POLL_MS);
    const onBack = () => { if (document.visibilityState !== 'hidden') load(); };
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener(TRAININGS_CHANGED_EVENT, load);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onBack); window.removeEventListener(TRAININGS_CHANGED_EVENT, load); };
  }, [load]);
  /** Mise à jour sur place (case « Vue » cochée avant la réponse du serveur). */
  const patch = useCallback((id: string, seenAt: string | null) => {
    setSt((prev) => ({ ...prev, items: prev.items.map((t) => (t.id === id ? { ...t, seen_at: seenAt } : t)) }));
  }, []);
  const unseen = st.items.filter((t) => !t.seen_at).length;
  return { available: st.available, items: st.items, unseen, reload: load, patch };
}

/** « 2 formations à voir › » — même habillage que les autres bandeaux de « Ma journée ». */
export function TrainingsBanner({ count, onOpen }: { count: number; onOpen: () => void }) {
  if (count <= 0) return null;
  return (
    <button className="bt-alert" onClick={onOpen} aria-label={toSeeLabel(count)} data-testid="trainings-banner">
      <span className="bt-alert-badge">{count}</span>
      <span className="bt-alert-txt">{toSeeLabel(count)}</span>
      <span className="bt-alert-chev">›</span>
    </button>
  );
}
