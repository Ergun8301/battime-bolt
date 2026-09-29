// Code de la borne de pointage — UN SEUL FICHIER pour la tablette et le serveur.
//
// La tablette (app/borne) et la fonction Edge `kiosk` importent ce même
// fichier : ils ne peuvent donc pas calculer deux codes différents. Aucun
// import, aucune API propre à Deno ou au navigateur : seulement `crypto.subtle`,
// présent des deux côtés.
//
// Le principe est celui des applications d'authentification (TOTP, RFC 6238),
// avec HMAC-SHA-256, un pas de 60 secondes et 8 chiffres :
//   code = HMAC(graine, numéro de la minute) → 8 chiffres.
// La tablette calcule le code SEULE, sans réseau : l'affichage du QR ne dépend
// jamais d'internet. Le serveur recalcule et accepte la minute courante, la
// précédente et la suivante (±1 pas), pour absorber une horloge un peu décalée
// et le temps de scanner.

export const KIOSK_STEP_SECONDS = 60;
export const KIOSK_DIGITS = 8;
export const KIOSK_WINDOW = 1;

const enc = new TextEncoder();

export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(key: Uint8Array, msg: Uint8Array, hash: 'SHA-256' | 'SHA-1' = 'SHA-256'): Promise<Uint8Array> {
  // `as BufferSource` : les versions récentes de TypeScript distinguent
  // Uint8Array<ArrayBuffer> et Uint8Array<SharedArrayBuffer> ; les anciennes
  // (celle de Next) non. Le cast convient aux deux.
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, msg as BufferSource));
}

/** Numéro du pas de temps pour un instant donné (en millisecondes). */
export function stepAt(nowMs: number, stepSeconds = KIOSK_STEP_SECONDS): number {
  return Math.floor(nowMs / 1000 / stepSeconds);
}

/** HOTP (RFC 4226) : le code pour un numéro de pas donné. */
export async function codeForStep(
  seed: Uint8Array,
  step: number,
  digits = KIOSK_DIGITS,
  hash: 'SHA-256' | 'SHA-1' = 'SHA-256',
): Promise<string> {
  // Le compteur sur 8 octets, gros-boutiste. `step` reste bien sous 2^53.
  const counter = new Uint8Array(8);
  let v = step;
  for (let i = 7; i >= 0; i--) { counter[i] = v & 0xff; v = Math.floor(v / 256); }
  const mac = await hmac(seed, counter, hash);
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/** Le code affiché à l'instant `nowMs`. */
export async function codeAt(seed: Uint8Array, nowMs: number): Promise<string> {
  return codeForStep(seed, stepAt(nowMs));
}

/**
 * Le code reçu correspond-il à la minute courante, à la précédente ou à la
 * suivante ? Rend le décalage trouvé (-1, 0, +1) ou `null`.
 */
export async function verifyCode(seed: Uint8Array, code: string, nowMs: number, window = KIOSK_WINDOW): Promise<number | null> {
  if (!/^\d+$/.test(code) || code.length !== KIOSK_DIGITS) return null;
  const s = stepAt(nowMs);
  for (let d = -window; d <= window; d++) {
    if (await codeForStep(seed, s + d) === code) return d;
  }
  return null;
}

/**
 * La graine d'une borne, dérivée côté serveur : HMAC(clé serveur, id + sel).
 * Elle n'est stockée nulle part en base : la tablette la reçoit une fois, à
 * l'appairage, et le serveur la recalcule quand il vérifie un code.
 */
export async function deriveSeed(serverKey: string, kioskId: string, salt: string): Promise<Uint8Array> {
  return hmac(enc.encode(serverKey), enc.encode(`bemexo-kiosk-seed|${kioskId}|${salt}`));
}

/** Empreinte SHA-256 en hexadécimal (jeton de borne, code d'appairage). */
export async function sha256Hex(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** L'adresse encodée dans le QR : https://bemexo.com/pointer?k=<borne>&c=<code>. */
export function scanUrl(siteUrl: string, kioskId: string, code: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/pointer?k=${encodeURIComponent(kioskId)}&c=${code}`;
}
