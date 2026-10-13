// Lot 29 — sondage qui se met en pause quand l'onglet est caché.
//
// Avant, `setInterval(fn, 60000)` tournait même onglet caché : ~40 requêtes en 4 minutes
// pour rien, sur un téléphone en poche. Modèle : le sondage des chronos du planning (fetchLive).
import { useEffect, useRef } from 'react';

/** Retour sur l'onglet : relecture immédiate seulement après AU MOINS ce temps caché (évite la rafale à chaque va-et-vient). */
export const POLL_MIN_HIDDEN_MS = 30_000;

/**
 * Appelle `fn` tout de suite, puis toutes les `ms` tant que l'onglet est visible.
 *  - onglet caché : minuteur arrêté, zéro requête ;
 *  - retour sur l'onglet : `fn` relancée si l'onglet est resté caché 30 s ou plus ; sinon le prochain
 *    appel garde son échéance d'avant (jamais plus de `ms` entre deux lectures, caché ou non).
 * Le premier appel part même si l'onglet est caché (une page ouverte en arrière-plan ne reste pas vide).
 * `fn` peut changer d'identité sans rien relancer ; seuls `key`, `enabled` et `ms` relancent le sondage.
 * `key` vide (pas encore d'entreprise) : rien ne part.
 */
export function useVisiblePoll(
  fn: () => unknown, ms: number, opts: { key: string | null | undefined; enabled?: boolean },
): void {
  const ref = useRef(fn);
  ref.current = fn;
  const actif = !!opts.key && opts.enabled !== false;
  useEffect(() => {
    if (!actif) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    let reste: ReturnType<typeof setTimeout> | null = null; // attente avant le 1er appel après un court passage en arrière-plan
    let hiddenAt: number | null = null;
    let lastRun = Date.now();
    const run = () => { lastRun = Date.now(); void ref.current(); };
    const start = () => { if (timer === null) timer = setInterval(run, ms); };
    const stop = () => {
      if (timer !== null) { clearInterval(timer); timer = null; }
      if (reste !== null) { clearTimeout(reste); reste = null; }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') { stop(); hiddenAt = Date.now(); return; }
      if (timer !== null || reste !== null) return; // déjà en marche (événement en double)
      const longtemps = hiddenAt !== null && Date.now() - hiddenAt >= POLL_MIN_HIDDEN_MS;
      hiddenAt = null;
      if (longtemps) { run(); start(); return; }
      // Court passage en arrière-plan : pas de rafale, mais l'échéance d'avant est tenue.
      const attente = ms - (Date.now() - lastRun);
      if (attente <= 0) { run(); start(); return; }
      reste = setTimeout(() => { reste = null; run(); start(); }, attente);
    };
    run();
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [opts.key, actif, ms]);
}
