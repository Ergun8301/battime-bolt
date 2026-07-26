// Helpers Web Push côté navigateur : enregistrement du service worker, demande
// de permission, abonnement/désabonnement. Tout est défensif — le push n'est PAS
// supporté partout (notamment iOS < 16.4, ou Safari si l'app n'a pas été ajoutée
// à l'écran d'accueil), donc chaque écran doit pouvoir fonctionner sans.

import { supabase } from '@/lib/supabase';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

export function pushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

// La clé VAPID publique voyage en base64url ; l'API navigateur veut un Uint8Array.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try { return await navigator.serviceWorker.register('/sw.js'); }
  catch { return null; }
}

export async function currentPushState(): Promise<'unsupported' | 'denied' | 'on' | 'off'> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return sub ? 'on' : 'off';
  } catch { return 'off'; }
}

// Retourne un message d'erreur lisible, ou null si tout s'est bien passé.
export async function enablePush(): Promise<string | null> {
  if (!pushSupported()) return "Ton navigateur ne gère pas les notifications. Sur iPhone, ajoute d'abord BEMEXO à l'écran d'accueil.";
  if (!VAPID_PUBLIC_KEY) return 'Notifications non configurées (clé manquante côté serveur).';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'Notifications refusées. Tu peux les réactiver dans les réglages de ton navigateur.';

  const reg = await getRegistration();
  if (!reg) return "Impossible d'activer les notifications sur cet appareil.";
  await navigator.serviceWorker.ready;

  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return "Abonnement incomplet, réessaie.";

    const { error } = await supabase.rpc('save_push_subscription', {
      p_endpoint: json.endpoint,
      p_p256dh: json.keys.p256dh,
      p_auth: json.keys.auth,
      p_user_agent: navigator.userAgent.slice(0, 300),
    });
    if (error) return "Impossible d'enregistrer l'abonnement. Réessaie.";
    return null;
  } catch {
    return "Impossible d'activer les notifications sur cet appareil.";
  }
}

export async function disablePush(): Promise<string | null> {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
    }
    return null;
  } catch {
    return 'Impossible de désactiver les notifications.';
  }
}
