// Appels à la fonction Edge `kiosk` (borne de pointage QR, lot 1), depuis le
// navigateur. Rend toujours { data } ou { error, code, status } : jamais
// d'exception, pour que chaque écran affiche un message clair.
import { supabase } from '@/lib/supabase';

export interface KioskResult<T> {
  data?: T;
  error?: string;
  code?: string;
  status?: number;
}

export async function callKiosk<T>(body: Record<string, unknown>): Promise<KioskResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke('kiosk', { body });
    if (!error) return { data: data as T };
    const res = (error as { context?: Response }).context;
    let payload: { error?: string; code?: string } = {};
    try { payload = res ? await res.json() : {}; } catch { /* réponse non JSON */ }
    return {
      error: payload.error || 'Connexion impossible. Vérifiez internet et réessayez.',
      code: payload.code,
      status: res?.status,
    };
  } catch {
    return { error: 'Connexion impossible. Vérifiez internet et réessayez.' };
  }
}

export interface KioskSettings {
  /**
   * Lot 9 : la borne ne s'en sert plus (elle affiche toujours la semaine). Le
   * bureau le relit et le RENVOIE tel quel : l'ancienne fonction, tant qu'elle
   * est en production, écrirait sinon « faux » à la place d'un « vrai ».
   */
  show_planning?: boolean;
  /** Lot 11 : plus de contrôle GPS. La fonction renvoie toujours `false` ; personne ne le lit plus. */
  require_gps?: boolean;
  active_from: string | null;
  active_until: string | null;
}

/** Réponse de `create_pairing` (fenêtre « Borne » du bureau). */
export interface KioskPairingCode {
  code: string;
  expires_at: string;
  /** Lot 11 : pour périmer ce code (`cancel_pairing`). Absent avec l'ancienne fonction. */
  pairing_id?: string | null;
}

/** Ancien planning du jour (`sync`) : gardé pour lire les caches des tablettes d'avant le lot 9. */
export interface KioskPlanningRow {
  first_name: string;
  start: string | null;
  end: string | null;
}

// Lot 9 — le planning de la semaine (`board`) : une seule définition, celle du
// constructeur partagé avec la fonction kiosk.
export type {
  KioskBoard, KioskBoardWorker, KioskBoardSlot, KioskBoardAbsence, KioskBoardLiveExtra,
} from '@/supabase/functions/_shared/kiosk-board';

/** Réponse de `punch` (page /pointer). */
export interface KioskPunchResult {
  kind: 'arrival' | 'departure';
  time: string;
  first_name: string;
  kiosk_name: string;
  worksite_name: string | null;
  range: { start: string; end: string } | null;
  /** Lot 9 : départ moins d'une minute après l'arrivée → rien n'est enregistré. */
  cancelled?: boolean;
}
