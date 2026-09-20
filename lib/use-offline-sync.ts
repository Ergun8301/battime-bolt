'use client';

// Déclenche l'envoi des saisies en attente et tient à jour le compteur affiché.
//
// Trois déclencheurs, parce qu'un seul ne suffit pas sur un téléphone de
// chantier : au montage (l'application est rouverte après une journée sans
// réseau), au retour du réseau, et au retour au premier plan (le salarié
// remonte de la cave, l'événement « online » n'est pas toujours émis).

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { countPendingEntries } from '@/lib/offline-store';
import { syncAllPending } from '@/lib/offline-sync';

function fmtJour(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function useOfflineSync(userId: string | undefined, onSynced?: () => void) {
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  // Gardé dans une ref : la fonction de synchronisation ne doit pas changer
  // d'identité à chaque rendu, sinon les écouteurs se réinstallent en boucle.
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  const refreshCount = useCallback(() => {
    if (!userId) { setPendingCount(0); return; }
    setPendingCount(countPendingEntries(userId));
  }, [userId]);

  const syncNow = useCallback(async () => {
    if (!userId || typeof window === 'undefined' || !navigator.onLine) return;
    if (countPendingEntries(userId) === 0) { setPendingCount(0); return; }

    setSyncing(true);
    const { synced, blocked } = await syncAllPending(userId);
    setSyncing(false);
    refreshCount();

    if (synced > 0) {
      toast.success(`${synced} intervention${synced > 1 ? 's' : ''} envoyée${synced > 1 ? 's' : ''}`);
      onSyncedRef.current?.();
    }
    if (blocked.length > 0) {
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
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, syncNow, refreshCount]);

  return { pendingCount, syncing, syncNow, refreshCount };
}
