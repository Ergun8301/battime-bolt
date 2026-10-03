// Règles de la borne de pointage — sans base de données, sans réseau.
//
// La fonction Edge `kiosk` lit la base puis confie la DÉCISION à ces fonctions
// pures. Elles sont testées seules (kiosk.test.ts) : code expiré, borne
// retirée, autre entreprise, double scan, essais de code, lieu de l'arrivée.
//
// Lot 11 : plus de contrôle « le salarié est sur place » (GPS). La position du
// téléphone n'est plus demandée, celle de la tablette n'est plus relevée.

export const DOUBLE_SCAN_MS = 60 * 1000;
/** Essais de code d'appairage ratés tolérés en 10 minutes, depuis une même adresse. */
export const MAX_PAIR_FAILURES_PER_IP = 10;
/**
 * Lot 11 — et en tout, toutes adresses confondues. Relier une tablette
 * DÉCONNECTE l'ancienne : un code deviné ne s'ajouterait plus à côté, il
 * prendrait la place de la vraie. L'adresse IP pouvant être falsifiée, ce
 * plafond global borne le nombre d'essais quoi qu'il arrive.
 */
export const MAX_PAIR_FAILURES_GLOBAL = 60;

export type ScanRefusal =
  | 'kiosk_unknown'
  | 'kiosk_revoked'
  | 'kiosk_disabled'
  | 'wrong_company'
  | 'user_inactive'
  | 'double_scan';

export const REFUSAL_MESSAGES: Record<ScanRefusal | 'code_invalid' | 'ticket_invalid' | 'stale_session' | 'too_short' | 'month_closed', string> = {
  kiosk_unknown: 'Cette borne n’existe pas.',
  kiosk_revoked: 'Cette borne a été retirée par votre entreprise.',
  kiosk_disabled: 'La borne de pointage n’est pas activée pour cette entreprise.',
  wrong_company: 'Cette borne appartient à une autre entreprise.',
  user_inactive: 'Votre compte n’est pas actif.',
  double_scan: 'Déjà enregistré il y a moins d’une minute : votre pointage est bien pris en compte.',
  code_invalid: 'Ce QR a expiré. Scannez à nouveau la borne.',
  ticket_invalid: 'Ce lien a expiré. Scannez à nouveau la borne.',
  stale_session: 'Un pointage d’un autre jour est resté ouvert. Fermez-le dans l’appli BEMEXO.',
  // Ancien chemin seulement (fonction finish_active_session pas encore en base) :
  // ton neutre, ce n'est pas une faute du salarié.
  too_short: 'Départ trop proche de l’arrivée : rien à enregistrer pour l’instant. Votre pointage reste en cours.',
  // Lot 11 : le mois clôturé pour l'équipe ET la clôture d'un seul salarié
  // (« Clôturer jusqu'au… ») — dans les deux cas, ses heures sont fermées.
  month_closed: 'Heures clôturées par le bureau.',
};

/** Une erreur de la base qui veut dire « heures clôturées » (mois ou salarié). */
export function isClosedError(message: string | null | undefined): boolean {
  return /cl[ôo]tur/i.test(message || '');
}

export interface KioskRow {
  id: string;
  company_id: string;
  revoked_at: string | null;
}

export interface ScanContext {
  kiosk: KioskRow | null;
  companyKioskEnabled: boolean;
  user: { company_id: string; is_active: boolean | null } | null;
  lastPunchAt: string | null;
  nowMs: number;
}

/**
 * Tous les refus possibles avant d'écrire quoi que ce soit, dans l'ordre où on
 * veut les annoncer. `null` = le scan peut être enregistré.
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
  return null;
}

/**
 * Lot 11 — trop d'essais de code d'appairage ratés ces 10 dernières minutes ?
 * 10 depuis la même adresse, ou plus de 60 en tout.
 */
export function pairThrottled(failuresFromIp: number, failuresEverywhere: number): boolean {
  return failuresFromIp >= MAX_PAIR_FAILURES_PER_IP || failuresEverywhere > MAX_PAIR_FAILURES_GLOBAL;
}

export interface PlannedSlot {
  id: string;
  worksite_id: string | null;
  estimated_start?: string | null;
}

/**
 * Lot 11 — sur quel chantier enregistrer l'arrivée scannée à la borne ?
 *
 * La tablette n'a plus de « lieu » choisi : elle est rattachée au lieu
 * « Autre » de l'entreprise. Si le salarié a EXACTEMENT UN chantier prévu
 * aujourd'hui, l'arrivée va sur ce chantier (sa bulle passe au vert, les
 * heures et les coûts tombent au bon endroit). Sinon (aucun, ou plusieurs
 * chantiers), on garde la règle d'avant : le lieu de la borne, à défaut le
 * premier chantier prévu. Une borne rattachée à un vrai chantier (anciennes
 * bornes) garde ce chantier.
 *
 * `null` = aucun lieu possible (la fonction répond « Prévenez le bureau »).
 */
export function arrivalPlace(
  kioskWorksiteId: string | null,
  kioskIsOther: boolean,
  plans: PlannedSlot[],
): { worksiteId: string; planningId: string | null } | null {
  const planned = plans
    .filter((p) => !!p.worksite_id)
    .slice()
    .sort((a, b) => (a.estimated_start || '99').localeCompare(b.estimated_start || '99'));
  const sites = new Set(planned.map((p) => p.worksite_id));
  const generic = !kioskWorksiteId || kioskIsOther;
  const worksiteId = generic && sites.size === 1
    ? planned[0].worksite_id
    : kioskWorksiteId || planned[0]?.worksite_id || null;
  if (!worksiteId) return null;
  return { worksiteId, planningId: planned.find((p) => p.worksite_id === worksiteId)?.id ?? null };
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

/**
 * Lot 9 — le départ passe par `finish_active_session` (la même fermeture que
 * l'appli). Tant que la migration n'est pas passée, la fonction n'existe pas :
 * PostgREST répond PGRST202 (absente du cache de schéma), PostgreSQL 42883
 * (fonction inconnue). On retombe alors sur l'ancien `stop_active_session`.
 */
export function rpcMissing(err: { code?: string | null } | null | undefined): boolean {
  return !!err && (err.code === 'PGRST202' || err.code === '42883');
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

/** Lot 11 — « Jeudi 1 octobre » (heure de Paris), pour l'en-tête de la tablette. */
export function parisLongDate(nowMs: number): string {
  const s = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date(nowMs));
  return s.charAt(0).toUpperCase() + s.slice(1);
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
