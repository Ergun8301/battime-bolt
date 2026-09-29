// Borne de pointage QR — le cœur, partagé MOT POUR MOT entre la tablette
// (navigateur, `app/borne`) et le serveur (Edge Function `kiosk`).
//
// POURQUOI UN SEUL FICHIER. Le QR est calculé sur la tablette et vérifié sur
// le serveur. Deux implémentations finiraient par diverger — un arrondi, un
// encodage — et la borne afficherait des codes que le serveur refuse, sans que
// rien ne dise pourquoi. Ici, les deux côtés exécutent le même code.
//
// Aucune dépendance, aucune API propre à Deno ou au navigateur : seulement Web
// Crypto (`crypto.subtle`), présent dans les deux, et dans Node pour les tests.

/** Durée d'un pas du QR, en secondes. */
export const KIOSK_STEP_SECONDS = 60;
/** Pas acceptés de part et d'autre du pas courant (horloges décalées, scan lent). */
export const KIOSK_STEP_TOLERANCE = 1;
/** Chiffres du code porté par le QR. */
export const KIOSK_CODE_DIGITS = 8;
/** Durée de validité d'un code d'appairage. */
export const KIOSK_PAIRING_MINUTES = 10;
/** Deux scans du même salarié à moins de 60 s : le second est un doublon. */
export const KIOSK_DUPLICATE_SECONDS = 60;
/** Distance maximale entre le téléphone et la borne quand l'option GPS est active. */
export const KIOSK_MAX_DISTANCE_M = 200;

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(key: string, message: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(message));
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(value)));
}

/** Chaîne aléatoire hexadécimale (secret de borne). */
export function randomHex(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Code d'appairage à 6 chiffres. */
export function randomPairingCode(): string {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1_000_000).padStart(6, '0');
}

/**
 * La clé du QR, DÉRIVÉE du secret de la borne.
 *
 * La tablette ne détient qu'un secret. Le serveur n'en garde que deux
 * empreintes : `sha256(secret)` pour reconnaître la tablette, et cette clé
 * dérivée pour vérifier les QR. Ni l'une ni l'autre ne permet de retrouver le
 * secret : une fuite de la table ne donne pas les moyens de se faire passer
 * pour la borne auprès du serveur.
 */
export function deriveTotpKey(secret: string): Promise<string> {
  return hmac(secret, 'bemexo-kiosk-totp-v1').then(toHex);
}

export function stepAt(nowMs: number): number {
  return Math.floor(nowMs / 1000 / KIOSK_STEP_SECONDS);
}

/** Le code d'un pas donné (HOTP, troncature dynamique RFC 4226, sur SHA-256). */
export async function codeForStep(totpKey: string, step: number): Promise<string> {
  const h = new Uint8Array(await hmac(totpKey, String(step)));
  const o = h[h.length - 1] & 0x0f;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** KIOSK_CODE_DIGITS).padStart(KIOSK_CODE_DIGITS, '0');
}

/** Vrai si `code` correspond au pas courant, au précédent ou au suivant. */
export async function verifyCode(totpKey: string, code: string, nowMs: number): Promise<boolean> {
  if (!new RegExp(`^\\d{${KIOSK_CODE_DIGITS}}$`).test(code)) return false;
  const s = stepAt(nowMs);
  for (let d = -KIOSK_STEP_TOLERANCE; d <= KIOSK_STEP_TOLERANCE; d++) {
    if ((await codeForStep(totpKey, s + d)) === code) return true;
  }
  return false;
}

/** L'adresse encodée dans le QR. `origin` = l'adresse du site servant la borne. */
export function scanUrl(origin: string, deviceId: string, code: string): string {
  return `${origin}/pointer?b=${deviceId}&c=${code}`;
}

/** Distance en mètres entre deux points (haversine). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/**
 * L'écran doit-il être en veille ? `from`/`until` au format "HH:MM" (heure
 * locale de la tablette). Sans horaires : jamais en veille. Une plage qui passe
 * minuit (22:00 → 06:00) est gérée.
 */
export function isAsleep(from: string | null | undefined, until: string | null | undefined, now: Date): boolean {
  if (!from || !until) return false;
  const m = (s: string) => { const [h, mi] = s.split(':').map(Number); return h * 60 + (mi || 0); };
  const a = m(from), b = m(until), t = now.getHours() * 60 + now.getMinutes();
  if (a === b) return false;
  const awake = a < b ? t >= a && t < b : t >= a || t < b;
  return !awake;
}

export type ScanRefusal =
  | 'device_unknown'
  | 'revoked'
  | 'kiosk_off'
  | 'other_company'
  | 'code_invalid'
  | 'duplicate'
  | 'need_position'
  | 'too_far';

export interface ScanInput {
  device: {
    company_id: string;
    revoked_at: string | null;
    totp_key: string;
    latitude: number | null;
    longitude: number | null;
  } | null;
  /** `companies.kiosk_enabled` de l'entreprise de la borne. */
  kioskEnabled: boolean;
  /** Le salarié qui scanne (profil `users`). */
  user: { company_id: string | null; is_active: boolean | null } | null;
  code: string;
  nowMs: number;
  /** Dernier scan de ce salarié (ms), ou null. */
  lastScanAtMs: number | null;
  /** Option « Vérifier que le salarié est sur place ». */
  requireGps: boolean;
  position: { lat: number; lng: number } | null;
}

/**
 * La décision, sans aucune écriture : toutes les règles du scan en un seul
 * endroit testable. L'ordre compte — on ne dit rien de la borne (révoquée,
 * position) à quelqu'un qui n'est pas de l'entreprise.
 */
export async function checkScan(i: ScanInput): Promise<{ ok: true; distance: number | null } | { ok: false; reason: ScanRefusal }> {
  if (!i.device) return { ok: false, reason: 'device_unknown' };
  if (!i.user || i.user.is_active === false || i.user.company_id !== i.device.company_id) {
    return { ok: false, reason: 'other_company' };
  }
  if (!i.kioskEnabled) return { ok: false, reason: 'kiosk_off' };
  if (i.device.revoked_at) return { ok: false, reason: 'revoked' };
  if (!(await verifyCode(i.device.totp_key, i.code, i.nowMs))) return { ok: false, reason: 'code_invalid' };
  if (i.lastScanAtMs != null && i.nowMs - i.lastScanAtMs < KIOSK_DUPLICATE_SECONDS * 1000) {
    return { ok: false, reason: 'duplicate' };
  }
  let distance: number | null = null;
  // Borne sans position enregistrée (permission refusée à l'appairage) : la
  // vérification est impossible, on ne bloque pas les salariés pour autant.
  // L'écran d'administration le signale à côté de la borne.
  if (i.requireGps && i.device.latitude != null && i.device.longitude != null) {
    if (!i.position) return { ok: false, reason: 'need_position' };
    distance = Math.round(distanceM(i.position, { lat: Number(i.device.latitude), lng: Number(i.device.longitude) }));
    if (distance > KIOSK_MAX_DISTANCE_M) return { ok: false, reason: 'too_far' };
  }
  return { ok: true, distance };
}
