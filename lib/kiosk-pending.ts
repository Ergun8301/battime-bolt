// Scan de borne mis de côté pendant la connexion. Fichier à part : la page de
// connexion l'importe sans embarquer le générateur de QR.

/** Scan mis de côté le temps de la connexion (retour automatique au pointage). */
export const PENDING_SCAN_KEY = 'bemexo.kiosk.pending';

export function readPendingScan(): { b: string; c: string } | null {
  try {
    const raw = sessionStorage.getItem(PENDING_SCAN_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { b?: string; c?: string; at?: number };
    // Au-delà de 10 minutes, le code est de toute façon expiré.
    if (!v.b || !v.c || !v.at || Date.now() - v.at > 10 * 60_000) return null;
    return { b: v.b, c: v.c };
  } catch {
    return null;
  }
}
