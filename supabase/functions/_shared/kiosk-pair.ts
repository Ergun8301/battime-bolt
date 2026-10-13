// APPAIRAGE DE LA TABLETTE EN UN SEUL GESTE (lot 11, oct. 2026) — règles pures.
//
// UN SEUL FICHIER pour la fonction Edge `kiosk` (qui décide), l'écran de la
// tablette (app/borne/pair-qr.tsx) et la fenêtre de confirmation du bureau
// (components/kiosk-pair-confirm.tsx) : aucune API propre à Deno ou au
// navigateur, seulement `crypto.subtle`. Imports relatifs permis : kiosk-code.ts
// (base64url, rien d'autre) et kiosk-rules.ts (seaux de débit). Testé seul :
// kiosk-pair.test.ts.
//
// LE PRINCIPE (style télévision : l'appareil demande, le patron confirme)
//   · La tablette non appairée demande un IDENTIFIANT DE DEMANDE à la fonction
//     (`pair_request`). Il est SIGNÉ par la fonction (HMAC) et ne vit nulle part
//     en base : version, expiration (10 min), nonce, empreinte du secret
//     d'appareil, signature = 45 octets = 60 signes base64url. Le QR contient
//     /admin#borne=<identifiant> : le fragment (#) ne part jamais au serveur.
//   · Le SECRET D'APPAREIL (256 bits) reste dans la mémoire de la tablette. Sans
//     lui, l'identifiant (visible dans le QR) ne rend aucun jeton.
//   · Le patron, connecté en administrateur, voit 4 CODES DE VÉRIFICATION et
//     touche celui qu'affiche SA tablette. Le vrai code se déduit du secret de
//     la tablette ; les trois leurres aussi (déterministes : on ne peut pas les
//     éliminer en comparant plusieurs appels).
//   · Ce que ce rapprochement protège : le clic réflexe de quelqu'un qui ne
//     connaît pas le code. Il ne protège PAS contre un faux écran qui relaie
//     son propre code, ni contre la photo du QR d'une vraie tablette (la photo
//     contient le code). D'où le second geste « Remplacer la tablette en
//     service » imposé par le serveur quand la tablette actuelle est vivante.

import { fromBase64Url, toBase64Url } from './kiosk-code.ts';
import { ticketBucket } from './kiosk-rules.ts';

/** Vie d'une demande (confirmable). */
export const PAIR_REQUEST_TTL_MS = 10 * 60 * 1000;
/** Une demande CONFIRMÉE reste livrable jusqu'à exp + 3 min (la tablette l'interroge jusque-là). */
export const PAIR_CLAIM_GRACE_MS = 3 * 60 * 1000;
/**
 * Le patron qui a scanné un QR proche de sa fin doit avoir le temps de se connecter :
 * `pair_lookup` et `pair_confirm` acceptent l'identifiant jusqu'à exp + 2 min (la
 * tablette renouvelle son QR 60 s avant la fin, le patron scanne l'ancien). Reste
 * inférieur à PAIR_CLAIM_GRACE_MS : une confirmation acceptée est toujours livrable.
 */
export const PAIR_CONFIRM_GRACE_MS = 2 * 60 * 1000;
/** Après la remise, le détenteur du secret peut la rejouer 3 min (réponse perdue). */
export const PAIR_REPLAY_WINDOW_MS = 3 * 60 * 1000;
/**
 * … et jusqu'à 30 min tant que la ligne `kiosks` dérivée n'a jamais servi (la
 * réponse s'est perdue et la tablette est restée hors ligne : wifi de chantier,
 * iPad en veille) : sinon une tablette fantôme resterait active, sans détenteur.
 */
export const PAIR_REPLAY_UNSEEN_MS = 30 * 60 * 1000;
/** Une tablette est « en service » si elle a été vue il y a moins de 15 min. */
export const PAIR_REPLACE_ALIVE_MS = 15 * 60 * 1000;
export const PAIR_THROTTLE_WINDOW_MS = 10 * 60 * 1000;
/** `pair_request` : par seau d'adresse, par 10 min. */
export const MAX_PAIR_REQUESTS_PER_BUCKET = 30;
/** `pair_lookup` + `pair_confirm` : par seau d'entreprise, par 10 min. */
export const MAX_PAIR_ADMIN_OPS_PER_COMPANY = 20;
/** Seaux 0-2047 : demandes anonymes des tablettes. */
export const PAIR_REQ_BUCKET_BASE = 0;
/** Seaux 2048-4095 : opérations du bureau (jamais bloquées par un déluge de demandes anonymes). */
export const PAIR_CO_BUCKET_BASE = 2048;
/** Longueur de l'identifiant de demande : 45 octets en base64url. */
export const PAIR_RID_LENGTH = 60;
/** 27 signes : sans 0 O 1 I L U ni S Z B (confondus avec 5 2 8). */
export const PAIR_CODE_ALPHABET = '23456789ACDEFGHJKMNPQRTVWXY';
/** ≈ 28,5 bits. */
export const PAIR_CODE_LENGTH = 6;
export const PAIR_FRAGMENT_RE = /^#borne=([A-Za-z0-9_-]{60})$/;
export const SUPPORT_READONLY_MESSAGE = 'Compte support BEMEXO : lecture seule. Utilisez le compte du patron pour associer une tablette.';

const RID_VERSION = 1;
const RID_BODY_LENGTH = 29; // version (1) + expiration (4) + nonce (8) + empreinte du secret (16)
const RID_MAC_LENGTH = 16;
/** 243 = 9 × 27 : au-delà, un octet favoriserait les premiers signes de l'alphabet. */
const CODE_BYTE_LIMIT = 243;

/** 6 signes tirés d'octets aléatoires ou d'un HMAC, sans biais (les octets ≥ 243 sont écartés). Lève si 32 octets ne suffisent pas (probabilité nulle). */
export function displayCodeFromBytes(bytes: Uint8Array): string {
  let code = '';
  for (let i = 0; i < bytes.length && code.length < PAIR_CODE_LENGTH; i++) {
    if (bytes[i] < CODE_BYTE_LIMIT) code += PAIR_CODE_ALPHABET[bytes[i] % PAIR_CODE_ALPHABET.length];
  }
  if (code.length < PAIR_CODE_LENGTH) throw new Error('Octets insuffisants pour un code de vérification');
  return code;
}

/** « K7M4QX » → « K7M 4QX ». */
export function formatDisplayCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/** Majuscules, sans espace ni tiret ; '' si un signe n'est pas dans l'alphabet. */
export function normalizeDisplayCode(input: string): string {
  const s = String(input ?? '').toUpperCase().replace(/[\s-]+/g, '');
  for (const c of s) if (!PAIR_CODE_ALPHABET.includes(c)) return '';
  return s;
}

/** Nombre de positions où deux codes de 6 signes diffèrent. */
export function hammingDistance(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < PAIR_CODE_LENGTH; i++) if (a.charAt(i) !== b.charAt(i)) d++;
  return d;
}

/** Corps de l'identifiant : 29 octets = 0x01 | exp (uint32 gros-boutiste, secondes) | nonce (8) | empreinte du secret (16). */
export function ridBody(exp: number, nonce: Uint8Array, sh: Uint8Array): Uint8Array {
  const body = new Uint8Array(RID_BODY_LENGTH);
  body[0] = RID_VERSION;
  new DataView(body.buffer).setUint32(1, exp, false);
  body.set(nonce.subarray(0, 8), 5);
  body.set(sh.subarray(0, 16), 13);
  return body;
}

/** base64url(corps de 29 octets + signature de 16 octets) = 60 caractères. */
export function ridEncode(body: Uint8Array, mac: Uint8Array): string {
  const all = new Uint8Array(RID_BODY_LENGTH + RID_MAC_LENGTH);
  all.set(body, 0);
  all.set(mac.subarray(0, RID_MAC_LENGTH), RID_BODY_LENGTH);
  return toBase64Url(all);
}

/** `null` si longueur ≠ 60, signes hors base64url, ou version ≠ 1. Rend le corps, la signature, `exp` (secondes) et `sh` (base64url, 22 signes). */
export function ridDecode(rid: string): { body: Uint8Array; mac: Uint8Array; exp: number; sh: string } | null {
  if (typeof rid !== 'string' || rid.length !== PAIR_RID_LENGTH || !/^[A-Za-z0-9_-]+$/.test(rid)) return null;
  const all = fromBase64Url(rid);
  if (all.length !== RID_BODY_LENGTH + RID_MAC_LENGTH || all[0] !== RID_VERSION) return null;
  const body = all.slice(0, RID_BODY_LENGTH);
  return {
    body,
    mac: all.slice(RID_BODY_LENGTH),
    exp: new DataView(body.buffer).getUint32(1, false),
    sh: toBase64Url(body.slice(13, 29)),
  };
}

/** Empreinte du secret d'appareil : SHA-256, 16 premiers octets, base64url (22 signes). */
export async function secretFingerprint(secret: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret) as BufferSource));
  return toBase64Url(d.slice(0, 16));
}

/** Forme d'un secret d'appareil : 43 signes base64url. */
export const isDeviceSecret = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s);

/**
 * 3 leurres parmi des candidats déjà calculés (24 empreintes HMAC du serveur, dans l'ordre) :
 * le premier candidat dont la distance de Hamming avec le vrai code ET avec les leurres déjà retenus est ≥ 3.
 * S'il en manque (probabilité négligeable), complète avec les premiers candidats restants.
 */
export function pickDecoys(real: string, candidates: string[]): string[] {
  const out: string[] = [];
  for (const c of candidates) {
    if (out.length === 3) break;
    if (hammingDistance(c, real) >= 3 && out.every((d) => hammingDistance(c, d) >= 3)) out.push(c);
  }
  for (const c of candidates) {
    if (out.length === 3) break;
    if (c !== real && !out.includes(c)) out.push(c);
  }
  return out;
}

/** Les 4 codes montrés au patron : les 3 leurres, dont le vrai est inséré au rang `slot` (0-3). */
export function buildChoices(real: string, decoys: string[], slot: number): string[] {
  const out = decoys.slice(0, 3);
  out.splice(Math.min(Math.max(slot, 0), 3), 0, real);
  return out;
}

/** Numéro de seau (0-4095) : `scope` 'req' → 0-2047, 'co' → 2048-4095 ; `hash` = HMAC base64url (11 bits utiles). */
export function pairBucket(scope: 'req' | 'co', hash: string): number {
  return (scope === 'req' ? PAIR_REQ_BUCKET_BASE : PAIR_CO_BUCKET_BASE) + (ticketBucket(hash) >> 1);
}

/** Plafond de débit (même logique que les seaux du QR fixe, mais plafond paramétré et colonne `hits`). */
export interface PairThrottleRow { hits: number; window_start: string }

export function pairThrottleFull(row: PairThrottleRow | null | undefined, nowMs: number, max: number): boolean {
  if (!row) return false;
  const start = Date.parse(row.window_start);
  return Number.isFinite(start) && nowMs - start < PAIR_THROTTLE_WINDOW_MS && row.hits >= max;
}

export function pairThrottleNext(row: PairThrottleRow | null | undefined, nowMs: number): PairThrottleRow {
  const start = row ? Date.parse(row.window_start) : NaN;
  if (row && Number.isFinite(start) && nowMs - start < PAIR_THROTTLE_WINDOW_MS) {
    return { hits: row.hits + 1, window_start: row.window_start };
  }
  return { hits: 1, window_start: new Date(nowMs).toISOString() };
}

/** L'adresse encodée dans le QR de la tablette : https://<site>/admin#borne=<identifiant>. */
export const pairUrl = (siteUrl: string, rid: string): string => `${siteUrl.replace(/\/+$/, '')}/admin#borne=${rid}`;

/** « moins d’une minute » (< 60 s) ou « 2 min » (arrondi). */
export function minutesLabel(seconds: number): string {
  if (seconds < 60) return 'moins d’une minute';
  return `${Math.round(seconds / 60)} min`;
}

/** Refus du nouveau chemin (fusionnés dans MESSAGES de la fonction, repris tels quels par la fenêtre du bureau). */
export const PAIR_REFUSAL_MESSAGES: Record<string, string> = {
  pair_request_invalid: 'Ce QR n’est pas valable. Scannez celui qui s’affiche sur la tablette.',
  pair_request_expired: 'Ce QR a expiré. Scannez celui qui s’affiche sur la tablette.',
  pair_request_used: 'Ce QR a déjà servi. Scannez celui qui s’affiche sur la tablette.',
  pair_code_wrong: 'Ce n’est pas le bon code. La demande est annulée : scannez le nouveau QR sur la tablette.',
  replace_required: 'La tablette actuelle est en service. Confirmez son remplacement.',
  pair_throttled: 'Trop d’essais. Réessayez dans quelques minutes.',
  support_readonly: SUPPORT_READONLY_MESSAGE,
};
