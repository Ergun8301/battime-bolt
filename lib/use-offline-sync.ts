'use client';

// Déclenche l'envoi des saisies en attente et tient à jour le compteur affiché.
//
// Trois déclencheurs, parce qu'un seul ne suffit pas sur un téléphone de
// chantier : au montage (l'application est rouverte après une journée sans
// réseau), au retour du réseau, et au retour au premier plan (le salarié
// remonte de la cave, l'événement « online » n'est pas toujours émis).
//
// Le compteur suit aussi les écritures faites dans le même onglet : le
// navigateur n'émet `storage` que dans les AUTRES onglets, donc une saisie
// ajoutée ici n'aurait jamais rafraîchi le bandeau.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  countPendingEntries, countBlockedEntries, unblockPendingEntries,
  OFFLINE_CHANGED_EVENT,
} from '@/lib/offline-store';
import { syncAllPending } from '@/lib/offline-sync';

function fmtJour(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function useOfflineSync(userId: string | undefined) {
  const [pendingCount, setPendingCount] = useState(0);
  const [blockedCount, setBlockedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshCount = useCallback(() => {
    if (!userId) { setPendingCount(0); setBlockedCount(0); return; }
    setPendingCount(countPendingEntries(userId));
    setBlockedCount(countBlockedEntries(userId));
  }, [userId]);

  /**
   * @param manual déclenché par le salarié : on relance aussi les saisies que
   * l'envoi automatique avait abandonnées.
   */
  const syncNow = useCallback(async (manual = false) => {
    if (!userId || typeof window === 'undefined' || !navigator.onLine) return;
    if (manual) unblockPendingEntries(userId);
    if (countPendingEntries(userId) === 0) { refreshCount(); return; }

    setSyncing(true);
    const { synced, blocked } = await syncAllPending(userId);
    setSyncing(false);
    refreshCount();

    if (synced > 0) {
      toast.success(`${synced} intervention${synced > 1 ? 's' : ''} envoyée${synced > 1 ? 's' : ''}`);
    }
    // Seul un envoi demandé par le salarié annonce le blocage : sinon le même
    // message reviendrait à chaque ouverture de l'application.
    if (blocked.length > 0 && manual) {
      const jours = Array.from(new Set(blocked.map((b) => fmtJour(b.work_date)))).join(', ');
      toast.error(
        `${blocked.length} intervention${blocked.length > 1 ? 's' : ''} du ${jours} ne part${blocked.length > 1 ? 'ent' : ''} pas. Préviens le bureau.`,
        { duration: 10000 },
      );
    }
  }, [userId, refreshCount]);

  useEffect(() => {
    if (!userId) return;
    refreshCount();
    syncNow();

    const onOnline = () => { syncNow(); };
    const onVisible = () => { if (document.visibilityState === 'visible') syncNow(); };
    const onChanged = () => { refreshCount(); };
    window.addEventListener('online', onOnline);
    window.addEventListener(OFFLINE_CHANGED_EVENT, onChanged);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener(OFFLINE_CHANGED_EVENT, onChanged);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, syncNow, refreshCount]);

  return { pendingCount, blockedCount, syncing, syncNow, refreshCount };
}
