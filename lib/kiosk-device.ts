// Lot 2 (IA) — reconnaître la tablette de la borne en dehors de /borne.
//
// La borne garde son appairage dans le stockage du navigateur (`bx_kiosk_v1`,
// app/borne/page.tsx). Une tablette qui atterrit sur "/" ou /landing (ancienne
// icône d'écran d'accueil, qui ouvrait "/") est renvoyée sur /borne au lieu de
// la vitrine. Lecture seule : rien n'est jamais écrit ni effacé ici.

export const KIOSK_STORE_KEY = 'bx_kiosk_v1';

/** Une borne est reliée sur cet appareil (hors démo). Jamais d'exception. */
export function hasKioskPairing(): boolean {
  try {
    const raw = localStorage.getItem(KIOSK_STORE_KEY);
    if (!raw) return false;
    const p = JSON.parse(raw) as { token?: unknown; kioskId?: unknown; demo?: unknown };
    return typeof p?.token === 'string' && typeof p?.kioskId === 'string' && !p.demo;
  } catch { return false; }
}

/** Ouverte depuis une icône d'écran d'accueil (appli installée), pas dans un onglet. */
export function isInstalledApp(): boolean {
  try {
    if ((navigator as Navigator & { standalone?: boolean }).standalone) return true;
    return ['standalone', 'fullscreen', 'minimal-ui'].some((m) => window.matchMedia(`(display-mode: ${m})`).matches);
  } catch { return false; }
}
