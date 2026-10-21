// QR FIXE IMPRIMABLE + POSITION AU SCAN (lot 12, oct. 2026) — règles pures.
//
// UN SEUL FICHIER pour la fonction Edge `kiosk` (qui décide) et le site (qui
// affiche les mêmes seuils) : aucun import, aucune API propre à Deno ou au
// navigateur, seulement `crypto.subtle` (présent des deux côtés). Testé seul :
// fixed-qr.test.ts.
//
// LE PRINCIPE
//   · Le QR fixe est une ligne « fixe » de la table `kiosks` (colonne `kind`).
//     Son QR contient https://<site>/pointer#f=<id>.<signature> ; la signature
//     = HMAC(clé serveur, id, sel) n'est stockée nulle part : le bureau peut
//     réimprimer, et « Régénérer » (nouvelle ligne, l'ancienne retirée) fait
//     cesser l'ancien QR imprimé aussitôt. Le fragment (#) ne part jamais vers
//     le serveur du site : le jeton reste hors des journaux de l'hébergeur.
//   · Au scan, la position du téléphone est lue UNE fois (lib/position.ts),
//     envoyée avec le pointage et comparée PAR LE SERVEUR : distance au point
//     de référence posé par le bureau ≤ rayon + marge liée à la précision.
//     ATTENTION, ce que cela vaut : la position est DÉCLARÉE par le téléphone
//     (le serveur ne peut pas la contrôler) ; un navigateur de bureau avec des
//     coordonnées simulées, ou un appel direct à la fonction, la falsifie en
//     deux minutes. La zone est un FREIN (celui qui photographie le QR ne
//     pointe plus de chez lui sans effort), PAS une preuve de présence. Le
//     bureau en est averti en clair, et « dans la zone : oui » ne se présente
//     jamais comme une preuve.
//   · AUCUNE coordonnée n'est gardée : seulement « dans la zone : oui »
//     (kiosk_punches.in_zone) avec le pointage.
//   · Le QR de la tablette, qui change chaque minute, ne change PAS : aucune
//     position, aucun de ces contrôles.

/** Rayon par défaut autour du point de référence. */
export const FIXED_QR_RADIUS_DEFAULT_M = 200;
export const FIXED_QR_RADIUS_MIN_M = 100;
export const FIXED_QR_RADIUS_MAX_M = 1000;
/** Les rayons proposés au bureau (le serveur accepte tout entier de 100 à 1 000). */
export const FIXED_QR_RADIUS_CHOICES = [100, 200, 500, 1000];
/** Le point de référence du bureau doit être précis à 100 m ou mieux. */
export const FIXED_QR_POINT_MAX_ACCURACY_M = 100;
/**
 * Au scan, une position annoncée à plus de 150 m près est trop imprécise pour
 * dire « dans la zone » (Wi-Fi ou antenne, souvent à l'intérieur) : refus clair.
 */
export const FIXED_QR_SCAN_MAX_ACCURACY_M = 150;
/**
 * Marge accordée pour la précision annoncée : la position réelle peut être
 * jusqu'à « précision » mètres plus près. On l'ajoute au rayon, plafonnée à
 * 100 m (une précision de 140 m n'élargit pas la zone de 140 m).
 */
export const FIXED_QR_MARGIN_MAX_M = 100;
/** Le sel d'une ligne « fixe » commence par ceci (jamais celui d'une tablette). */
export const FIXED_SALT_PREFIX = 'fixe.';

/**
 * La phrase répétée à chaque refus : il existe toujours un autre moyen. Elle ne
 * parle de la tablette QUE si l'entreprise en a une de reliée (`hasTablet`) ;
 * `undefined` = on ne sait pas (jeton inconnu, base indisponible) : formule neutre.
 */
export function fixedAlternative(hasTablet?: boolean): string {
  if (hasTablet === true) return 'Scannez la tablette, ou ajoutez votre intervention à la main.';
  if (hasTablet === false) return 'Ajoutez votre intervention à la main.';
  return 'Ajoutez votre intervention à la main, ou scannez la tablette si votre entreprise en a une.';
}
/** La phrase demandée par Ergun (entreprise avec une tablette reliée). */
export const FIXED_QR_ALTERNATIVE = fixedAlternative(true);
/** La même, au milieu d'une phrase (« Vous pouvez refuser : … »). */
export const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export type FixedRefusal =
  | 'fixed_unavailable'
  | 'fixed_invalid'
  | 'fixed_revoked'
  | 'fixed_no_point'
  | 'position_missing'
  | 'position_imprecise'
  | 'out_of_zone'
  | 'point_imprecise'
  | 'confirm_required'
  | 'site_refused';

const FIXED_STEMS: Record<Exclude<FixedRefusal, 'point_imprecise' | 'confirm_required'>, string> = {
  fixed_unavailable: 'Le QR fixe n’est pas disponible pour l’instant.',
  fixed_invalid: 'Ce QR n’est pas valide.',
  fixed_revoked: 'Ce QR fixe a été remplacé ou désactivé par votre entreprise.',
  fixed_no_point: 'Le bureau n’a pas encore posé le point de référence de ce QR.',
  position_missing: 'Position non reçue (refusée ou introuvable).',
  position_imprecise: 'Position trop imprécise pour vérifier la zone.',
  out_of_zone: 'Vous êtes hors de la zone de ce QR.',
  // Réglage du chantier (fiche client) : vaut aussi pour la puce NFC, qui porte le même lien.
  site_refused: 'Sur ce chantier, votre entreprise n’accepte pas le QR fixe ni la puce NFC.',
};

/** Le message d'un refus du QR fixe, avec le bon « autre moyen » (voir `fixedAlternative`). */
export function fixedRefusalMessage(code: FixedRefusal, hasTablet?: boolean): string {
  if (code === 'point_imprecise') return 'Précision insuffisante : il faut 100 m ou mieux. Approchez-vous d’une fenêtre ou sortez, puis réessayez.';
  if (code === 'confirm_required') return 'Confirmation requise.';
  return `${FIXED_STEMS[code]} ${fixedAlternative(hasTablet)}`;
}

/** Les messages quand on ne sait pas si l'entreprise a une tablette (formule neutre). */
export const FIXED_REFUSAL_MESSAGES: Record<FixedRefusal, string> = {
  fixed_unavailable: fixedRefusalMessage('fixed_unavailable'),
  fixed_invalid: fixedRefusalMessage('fixed_invalid'),
  fixed_revoked: fixedRefusalMessage('fixed_revoked'),
  fixed_no_point: fixedRefusalMessage('fixed_no_point'),
  position_missing: fixedRefusalMessage('position_missing'),
  position_imprecise: fixedRefusalMessage('position_imprecise'),
  out_of_zone: fixedRefusalMessage('out_of_zone'),
  site_refused: fixedRefusalMessage('site_refused'),
  point_imprecise: fixedRefusalMessage('point_imprecise'),
  confirm_required: fixedRefusalMessage('confirm_required'),
};

export interface GeoPoint { lat: number; lng: number }
export interface ScanPosition extends GeoPoint { accuracy: number | null }

/** Distance en mètres entre deux points (formule de haversine, Terre sphérique). */
export function distanceM(a: GeoPoint, b: GeoPoint): number {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/**
 * La position envoyée par le téléphone ({ lat, lng, accuracy }) — ou `null` si
 * elle manque ou n'a pas de sens (hors bornes, précision négative).
 */
export function parsePosition(body: Record<string, unknown>): ScanPosition | null {
  const lat = num(body.lat), lng = num(body.lng);
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const acc = num(body.accuracy);
  return { lat, lng, accuracy: acc === null || acc < 0 ? null : acc };
}

export type FixedPositionVerdict = 'ok' | 'fixed_no_point' | 'position_missing' | 'position_imprecise' | 'out_of_zone';

/**
 * Le salarié est-il dans la zone ? `ok` si la distance au point de référence
 * est au plus rayon + min(précision, 100 m). Précision inconnue ou au-delà de
 * 150 m : « trop imprécise ». Point de référence pas encore posé : refus.
 */
export function checkFixedPosition(ref: GeoPoint | null, radiusM: number, pos: ScanPosition | null): FixedPositionVerdict {
  if (!ref) return 'fixed_no_point';
  if (!pos) return 'position_missing';
  if (pos.accuracy === null || pos.accuracy > FIXED_QR_SCAN_MAX_ACCURACY_M) return 'position_imprecise';
  const margin = Math.min(pos.accuracy, FIXED_QR_MARGIN_MAX_M);
  return distanceM(ref, pos) <= radiusM + margin ? 'ok' : 'out_of_zone';
}

/**
 * Le chantier accepte-t-il le QR fixe (et la puce NFC) ? Seul un `false` écrit
 * par le bureau refuse : colonne absente (migration pas passée), chantier
 * introuvable ou valeur vide → accepté, comme avant.
 */
export function siteAcceptsFixed(row: { fixed_qr_allowed?: boolean | null } | null | undefined): boolean {
  return row?.fixed_qr_allowed !== false;
}

/** Un rayon accepté (entier de 100 à 1 000 m), sinon `null`. */
export function parseRadius(v: unknown): number | null {
  const n = num(v);
  if (n === null || !Number.isInteger(n) || n < FIXED_QR_RADIUS_MIN_M || n > FIXED_QR_RADIUS_MAX_M) return null;
  return n;
}

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** La signature du QR fixe : HMAC-SHA-256(clé serveur, « bemexo-fixed-qr|id|sel »). */
export async function fixedQrSignature(serverKey: string, id: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(serverKey) as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(`bemexo-fixed-qr|${id}|${salt}`) as BufferSource);
  return b64url(new Uint8Array(sig));
}

/** Le jeton imprimé : « <id>.<signature> ». */
export async function fixedQrToken(serverKey: string, id: string, salt: string): Promise<string> {
  return `${id}.${await fixedQrSignature(serverKey, id, salt)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Découpe un jeton ; `null` s'il n'a pas la bonne forme (rien n'est lu en base). */
export function splitFixedToken(token: string): { id: string; sig: string } | null {
  const m = /^([^.]+)\.([A-Za-z0-9_-]{43})$/.exec(String(token || '').trim());
  if (!m || !UUID.test(m[1])) return null;
  return { id: m[1].toLowerCase(), sig: m[2] };
}

/** Comparaison en temps constant (la signature n'est pas devinable caractère par caractère). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** L'adresse encodée dans le QR imprimé : https://<site>/pointer#f=<jeton>. */
export function fixedQrUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/pointer#f=${token}`;
}

/** Référence courte imprimée sous le QR (4 caractères) : dit au bureau quelle feuille est la bonne. */
export function fixedQrRef(id: string): string {
  return id.replace(/[^0-9a-f]/gi, '').slice(-4).toUpperCase();
}
