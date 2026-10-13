// Lot 30 (borne robuste) — ce que la page /borne fait pour tenir sans réseau
// et rester visible du bureau. Aucun import de React ici : de simples fonctions,
// toutes sans exception (un navigateur qui refuse un service worker, un stockage
// bloqué, un mode privé : la borne marche exactement comme avant).
import { buildVersion, versionFromHtml } from '../supabase/functions/_shared/kiosk-version';
import { parseNightMarker, type NightMarker } from '../supabase/functions/_shared/kiosk-night-reload';
import type { KioskClientState } from '../supabase/functions/_shared/kiosk-client-state';

/** Le service worker de la borne (public/borne-sw.js) : portée « /borne » SEULE, distinct de public/sw.js (push). */
export const BORNE_SW_URL = '/borne-sw.js';
export const BORNE_SW_SCOPE = '/borne';
/** Marqueur de la dernière tentative de rechargement de nuit. */
export const NIGHT_KEY = 'bx_borne_night';

/** Cette page est-elle bien /borne ? (le service worker ne s'enregistre jamais ailleurs) */
export function isBornePath(pathname: string): boolean {
  return pathname === '/borne' || pathname === '/borne/';
}

/**
 * Enregistre le service worker de la borne, une fois la page chargée (il ne
 * ralentit pas l'affichage). Seulement sur /borne. Navigateur sans service
 * worker, page non sécurisée, enregistrement refusé : rien, sans bruit.
 */
export function registerBorneServiceWorker(): void {
  try {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (!isBornePath(window.location.pathname)) return;
    const go = () => {
      navigator.serviceWorker
        .register(BORNE_SW_URL, { scope: BORNE_SW_SCOPE, updateViaCache: 'none' })
        .catch(() => { /* refusé (mode privé, http…) : la borne marche comme avant */ });
    };
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
  } catch { /* rien à faire */ }
}

// ── La version de l'appli ───────────────────────────────────────────────────

let cachedVersion: string | null = null;
const seenResources: string[] = [];
let watching = false;
let delivered = false;

/**
 * Commence à noter les fichiers que la page charge (à appeler dès le démarrage de la page).
 * `PerformanceObserver` avec `buffered` rend aussi ceux déjà chargés ; il s'arrête au bout de 20 s
 * (seuls les fichiers du chargement comptent). Sans lui, `readClientVersion` se rabat sur
 * `performance.getEntriesByType`.
 */
export function watchLoadedFiles(): void {
  if (watching || typeof PerformanceObserver === 'undefined') return;
  watching = true;
  try {
    const obs = new PerformanceObserver((list) => {
      list.getEntries().forEach((e) => seenResources.push(e.name));
      delivered = true;
    });
    obs.observe({ type: 'resource', buffered: true });
    setTimeout(() => { try { obs.disconnect(); } catch { /* déjà arrêté */ } }, 20000);
  } catch { watching = false; }
}

/**
 * La version de la page ouverte (empreinte des fichiers de code de la borne), `''` tant qu'elle
 * n'est pas connue. Les <script> du document ne suffisent pas : Next retire du DOM ceux qui ont
 * fini de s'exécuter (le fichier de la page /borne n'y est plus). On y ajoute donc la liste des
 * fichiers que le navigateur a chargés (Resource Timing) : la même liste que dans le HTML du
 * serveur. Cette liste n'est complète qu'une fois la page chargée : avant, on répond `''` (le
 * bureau n'a pas besoin de la version à la première seconde) ; après, la valeur est figée.
 */
export function readClientVersion(): string {
  if (cachedVersion !== null) return cachedVersion;
  try {
    if (document.readyState !== 'complete') return '';
    if (typeof PerformanceObserver !== 'undefined' && watching && !delivered) return ''; // la première livraison n'est pas arrivée
    const urls = Array.from(document.scripts).map((s) => s.getAttribute('src') || '').filter(Boolean);
    seenResources.forEach((u) => urls.push(u));
    try { performance.getEntriesByType('resource').forEach((e) => urls.push(e.name)); } catch { /* pas de Resource Timing */ }
    cachedVersion = buildVersion(urls);
  } catch { cachedVersion = ''; }
  return cachedVersion;
}

/**
 * La version que le serveur sert MAINTENANT (le HTML de /borne, hors cache du
 * navigateur — le service worker laisse passer cette demande). `null` = pas de
 * réponse (réseau, serveur) : on ne recharge pas.
 */
export async function fetchServerVersion(timeoutMs = 8000): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ctl = new AbortController();
    timer = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch('/borne', { cache: 'no-store', signal: ctl.signal, credentials: 'same-origin' });
    if (!res.ok) return null;
    return versionFromHtml(await res.text());
  } catch { return null; } finally { if (timer) clearTimeout(timer); }
}

// ── Le marqueur de la nuit ──────────────────────────────────────────────────

export function readNightMarker(): NightMarker | null {
  try { return parseNightMarker(localStorage.getItem(NIGHT_KEY)); } catch { return null; }
}

/** Écrit le marqueur ET le relit : faux = le stockage ne tient pas (alors on ne recharge JAMAIS : risque de boucle). */
export function writeNightMarker(day: string, nowMs: number): boolean {
  try {
    localStorage.setItem(NIGHT_KEY, JSON.stringify({ day, at: nowMs }));
    return readNightMarker()?.day === day;
  } catch { return false; }
}

// ── L'état de l'écran, envoyé au bureau avec `sync` ─────────────────────────

type FsDoc = Document & { webkitFullscreenElement?: Element | null };

/** Plein écran, par l'API (un toucher) ou parce que l'appli installée l'est d'office. */
function isFull(): boolean {
  try {
    const d = document as FsDoc;
    return !!(d.fullscreenElement || d.webkitFullscreenElement) || window.matchMedia('(display-mode: fullscreen)').matches;
  } catch { return false; }
}

/**
 * La borne est-elle ouverte depuis l'icône installée ? iPad : `navigator.standalone`.
 * Ailleurs : mode « standalone » ou « minimal-ui », ou « fullscreen » QUAND ce
 * n'est pas l'API plein écran d'un onglet (l'appli installée en plein écran n'a
 * pas d'élément plein écran ; un onglet passé en plein écran en a un).
 */
function isInstalled(): boolean {
  try {
    if ((navigator as Navigator & { standalone?: boolean }).standalone) return true;
    const mm = (q: string) => window.matchMedia(q).matches;
    if (mm('(display-mode: standalone)') || mm('(display-mode: minimal-ui)')) return true;
    const d = document as FsDoc;
    return mm('(display-mode: fullscreen)') && !d.fullscreenElement && !d.webkitFullscreenElement;
  } catch { return false; }
}

/**
 * Ce qui, en changeant, vaut un envoi au bureau sans attendre les 5 minutes :
 * le verrou d'écran et l'icône installée (c'est ce que le bureau traduit en
 * phrases). Le plein écran, la version et « en ligne » suivent le prochain `sync`.
 */
export function clientStateKey(st: KioskClientState): string {
  return `${st.wake ?? '-'}|${st.standalone === undefined ? '-' : st.standalone ? '1' : '0'}`;
}

/** Le verrou d'écran vu de la page : 'pending' = pas encore su (rien n'est dit au bureau). */
export type WakeSeen = 'pending' | 'active' | 'denied' | 'unsupported';

/** L'objet joint à `sync`. Chaque champ a une valeur sûre ; jamais de texte libre. */
export function buildClientState(wake: WakeSeen): KioskClientState {
  const st: KioskClientState = {
    standalone: isInstalled(),
    fullscreen: isFull(),
    online: typeof navigator !== 'undefined' ? navigator.onLine !== false : true,
  };
  if (wake === 'active') st.wake = 'held';
  else if (wake === 'denied' || wake === 'unsupported') st.wake = wake;
  const version = readClientVersion();
  if (version) st.version = version;
  return st;
}
