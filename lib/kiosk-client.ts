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
  show_planning: boolean;
  require_gps: boolean;
  active_from: string | null;
  active_until: string | null;
}

export interface KioskPlanningRow {
  first_name: string;
  start: string | null;
  end: string | null;
}
