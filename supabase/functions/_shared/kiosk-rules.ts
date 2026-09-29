// Règles de la borne de pointage — sans base de données, sans réseau.
//
// La fonction Edge `kiosk` lit la base puis confie la DÉCISION à ces fonctions
// pures. Elles sont testées seules (kiosk.test.ts) : code expiré, borne
// retirée, autre entreprise, double scan, distance.

export const DOUBLE_SCAN_MS = 60 * 1000;
export const GPS_RADIUS_M = 200;
/** Au-delà, on ne tient compte que de 150 m d'imprécision annoncée. */
export const GPS_ACCURACY_CAP_M = 150;

export type ScanRefusal =
  | 'kiosk_unknown'
  | 'kiosk_revoked'
  | 'kiosk_disabled'
  | 'wrong_company'
  | 'user_inactive'
  | 'double_scan'
  | 'gps_missing'
  | 'gps_too_far';

export const REFUSAL_MESSAGES: Record<ScanRefusal | 'code_invalid' | 'ticket_invalid' | 'stale_session' | 'too_short' | 'month_closed', string> = {
  kiosk_unknown: 'Cette borne n’existe pas.',
  kiosk_revoked: 'Cette borne a été retirée par votre entreprise.',
  kiosk_disabled: 'La borne de pointage n’est pas activée pour cette entreprise.',
  wrong_company: 'Cette borne appartient à une autre entreprise.',
  user_inactive: 'Votre compte n’est pas actif.',
  double_scan: 'Déjà enregistré il y a moins d’une minute.',
  gps_missing: 'Autorisez la localisation pour pointer sur cette borne.',
  gps_too_far: 'Vous êtes trop loin de la borne pour pointer.',
  code_invalid: 'Ce QR a expiré. Scannez à nouveau la borne.',
  ticket_invalid: 'Ce lien a expiré. Scannez à nouveau la borne.',
  stale_session: 'Un pointage d’un autre jour est resté ouvert. Fermez-le dans l’appli BEMEXO.',
  too_short: 'Moins d’un quart d’heure depuis votre arrivée : rien à enregistrer.',
  month_closed: 'Ce mois est clôturé par le bureau.',
};

export interface KioskRow {
  id: string;
  company_id: string;
  revoked_at: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface ScanContext {
  kiosk: KioskRow | null;
  companyKioskEnabled: boolean;
  user: { company_id: string; is_active: boolean | null } | null;
  lastPunchAt: string | null;
  requireGps: boolean;
  position: { lat: number; lng: number; accuracy: number | null } | null;
  nowMs: number;
}

/** Distance à vol d'oiseau, en mètres (formule de haversine). */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Le salarié est-il à moins de 200 m de la borne ?
 * On retire de la distance l'imprécision annoncée par le téléphone (plafonnée à
 * 150 m) : à l'intérieur d'un bâtiment le GPS annonce souvent 50 à 100 m, et
 * refuser quelqu'un qui est devant la borne serait pire qu'inutile.
 */
export function withinRadius(
  kiosk: { latitude: number | null; longitude: number | null },
  pos: { lat: number; lng: number; accuracy: number | null },
): boolean {
  if (kiosk.latitude == null || kiosk.longitude == null) return true;
  const d = distanceM(Number(kiosk.latitude), Number(kiosk.longitude), pos.lat, pos.lng);
  const slack = Math.min(Math.max(pos.accuracy ?? 0, 0), GPS_ACCURACY_CAP_M);
  return d - slack <= GPS_RADIUS_M;
}

/**
 * Tous les refus possibles avant d'écrire quoi que ce soit, dans l'ordre où on
 * veut les annoncer. `null` = le scan peut être enregistré.
 *
 * Une borne sans position enregistrée ne peut pas contrôler la distance : on
 * laisse passer (l'admin voit « position non relevée » dans ses réglages).
 */
export function checkScan(ctx: ScanContext): ScanRefusal | null {
  const { kiosk, user } = ctx;
  if (!kiosk) return 'kiosk_unknown';
  if (kiosk.revoked_at) return 'kiosk_revoked';
  if (!ctx.companyKioskEnabled) return 'kiosk_disabled';
  if (!user) return 'wrong_company';
  if (user.company_id !== kiosk.company_id) return 'wrong_company';
  if (user.is_active === false) return 'user_inactive';
  if (ctx.lastPunchAt && ctx.nowMs - new Date(ctx.lastPunchAt).getTime() < DOUBLE_SCAN_MS) return 'double_scan';
  if (ctx.requireGps && kiosk.latitude != null && kiosk.longitude != null) {
    if (!ctx.position) return 'gps_missing';
    if (!withinRadius(kiosk, ctx.position)) return 'gps_too_far';
  }
  return null;
}

/**
 * Arrivée ou départ ? La même règle que l'appli : pas de pointage en cours →
 * arrivée ; un pointage en cours AUJOURD'HUI → départ ; un pointage resté
 * ouvert d'un autre jour → on ne ferme pas à l'aveugle (l'appli demande
 * l'heure de fin, la borne ne le peut pas).
 */
export function decideAction(
  session: { work_date: string } | null,
  todayParis: string,
): 'arrival' | 'departure' | 'stale_session' {
  if (!session) return 'arrival';
  return session.work_date === todayParis ? 'departure' : 'stale_session';
}

/** La date du jour à Paris (aaaa-mm-jj), quelle que soit l'horloge du serveur. */
export function parisDate(nowMs: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(nowMs));
}

/** L'heure à Paris (hh:mm). */
export function parisTime(nowMs: number): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(nowMs));
}

/**
 * La borne est-elle en veille à cette heure ? Elle est allumée de `from` à
 * `until` (hh:mm, heure de Paris), en veille en dehors. La plage peut passer
 * minuit (22:00 → 06:00). Sans horaires, elle n'est jamais en veille.
 */
export function isAsleep(hhmm: string, from: string | null, until: string | null): boolean {
  if (!from || !until || from.slice(0, 5) === until.slice(0, 5)) return false;
  const t = hhmm.slice(0, 5);
  const f = from.slice(0, 5);
  const u = until.slice(0, 5);
  const open = f < u ? t >= f && t < u : t >= f || t < u;
  return !open;
}
