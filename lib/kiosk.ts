// Borne de pointage QR — côté navigateur.
//
// Le calcul du QR vient de `supabase/functions/_shared/kiosk-core.ts`, le MÊME
// fichier que celui qu'exécute le serveur : la tablette et la vérification ne
// peuvent pas diverger.
import qrcode from 'qrcode-generator';
import { supabase } from '@/lib/supabase';

export * from '@/supabase/functions/_shared/kiosk-core';

export type KioskResult<T> = { ok: true; data: T; error: null; status: number; reason?: undefined }
  | { ok: false; data: null; error: string; status: number; reason?: string };

/** Appelle l'Edge Function `kiosk`. Ne lève jamais : l'erreur revient en clair. */
export async function callKiosk<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<KioskResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke('kiosk', { body });
    if (!error) return { ok: true, data: data as T, error: null, status: 200 };
    const ctx = (error as { context?: Response }).context;
    let payload: { error?: string; reason?: string } = {};
    let status = 0;
    if (ctx && typeof ctx.json === 'function') {
      status = ctx.status;
      payload = await ctx.json().catch(() => ({}));
    }
    // 2xx « métier » renvoyé comme erreur par certains clients : sans objet ici.
    return { ok: false, data: null, error: payload.error || 'Connexion impossible. Vérifiez le réseau.', status, reason: payload.reason };
  } catch {
    return { ok: false, data: null, error: 'Connexion impossible. Vérifiez le réseau.', status: 0 };
  }
}

/** Un QR en chemin SVG (une seule forme, net à toutes les tailles). */
export function qrSvgPath(text: string): { path: string; size: number } {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  let path = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (q.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`;
    }
  }
  return { path, size: n };
}

/** Position du téléphone, ou null (refus, délai, pas de GPS). Ne rejette jamais. */
export function getPosition(timeoutMs = 8000): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}

export { PENDING_SCAN_KEY, readPendingScan } from '@/lib/kiosk-pending';
