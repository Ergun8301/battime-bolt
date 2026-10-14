// Lot 30 (borne robuste) — le rechargement de nuit, côté page.
// Les RÈGLES (plage 02:00–04:00, 10 min de calme, une fois par nuit) sont dans
// supabase/functions/_shared/kiosk-night-reload.ts ; ici on ne fait que les
// interroger une fois par minute et, si tout est bon, recharger la page.
//
// Ordre voulu, pour ne jamais boucler ni gêner un pointage :
//   1. les règles disent « oui » (plage fermée, en ligne, page visible, rien à
//      l'écran, aucun toucher depuis 10 min, pas déjà fait cette nuit) ;
//   2. la nuit est MARQUÉE tout de suite — marqueur écrit puis relu ; s'il ne
//      tient pas (stockage bloqué), on ne recharge JAMAIS ;
//   3. on demande au serveur la version qu'il sert : pas de réponse → rien
//      (réessai la nuit suivante) ; même version que la page ouverte → rien à
//      récupérer, donc pas de rechargement inutile ; version inconnue d'un côté
//      ou de l'autre → on recharge (comportement de base : une fois par nuit) ;
//   4. les règles sont reposées une dernière fois (quelqu'un s'est peut-être
//      approché pendant la vérification) : alors la nuit est rendue, la minute
//      suivante réessaie ;
//   5. window.location.reload() — une seule fois : la page neuve est « calme »
//      depuis son ouverture et la nuit est marquée.
import { useEffect, useRef } from 'react';
import { NIGHT_CHECK_MS, nightReloadVerdict } from '../../supabase/functions/_shared/kiosk-night-reload';
import { NIGHT_KEY, fetchServerVersion, readClientVersion, readNightMarker, writeNightMarker } from '@/lib/kiosk-offline';

const TOUCH_EVENTS = ['pointerdown', 'pointerup', 'keydown', 'touchstart'];

/**
 * `enabled` : la tablette est reliée (jamais en démo). `isBusy` : quelque chose
 * est ouvert à l'écran (le QR de pointage, une confirmation, l'appairage en attente).
 */
export function useNightReload(enabled: boolean, isBusy: () => boolean): void {
  const lastTouch = useRef(Date.now());
  const busy = useRef(isBusy);
  busy.current = isBusy;

  // Le dernier toucher (ou, à défaut, l'ouverture de la page).
  useEffect(() => {
    lastTouch.current = Date.now();
    const touch = () => { lastTouch.current = Date.now(); };
    TOUCH_EVENTS.forEach((e) => document.addEventListener(e, touch, true));
    return () => TOUCH_EVENTS.forEach((e) => document.removeEventListener(e, touch, true));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let running = false;
    const verdict = (marker: ReturnType<typeof readNightMarker>) => {
      const now = Date.now();
      return nightReloadVerdict({
        nowMs: now,
        online: navigator.onLine !== false,
        visible: document.visibilityState === 'visible',
        idleMs: now - lastTouch.current,
        busy: busy.current(),
        marker,
      });
    };
    const check = async () => {
      if (running) return;
      const v = verdict(readNightMarker());
      if (!v.reload) return;
      running = true;
      try {
        if (!writeNightMarker(v.day, Date.now())) return; // pas de mémoire : jamais de rechargement
        const server = await fetchServerVersion();
        if (server === null) return; // pas de réponse : réessai la nuit suivante
        const mine = readClientVersion();
        if (server && mine && server === mine) return; // même version : rien à récupérer
        if (!verdict(null).reload) {
          // Quelqu'un s'est approché : on ne recharge pas, et la nuit n'est pas perdue.
          try { localStorage.setItem(NIGHT_KEY, '{}'); } catch { /* le marqueur reste : tant pis pour cette nuit */ }
          return;
        }
        window.location.reload();
      } finally { running = false; }
    };
    const id = setInterval(() => { void check(); }, NIGHT_CHECK_MS);
    return () => clearInterval(id);
  }, [enabled]);
}
