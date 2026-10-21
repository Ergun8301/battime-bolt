// Zones d'indemnités de petits déplacements (BTP) — calcul PUR, partagé par le navigateur (exports, feuille
// d'heures, réglages) et les tests Deno (btp-zones.test.ts). Aucune lecture, aucune écriture ici.
//
// La règle (convention collective des ouvriers du bâtiment, art. 8-11) : la zone se lit à VOL D'OISEAU entre le
// point de départ (siège de l'entreprise par défaut, ou dépôt / agence) et le chantier. Zones concentriques jusqu'à
// 50 km ; au-delà : grand déplacement. Le texte national fait une zone 1 de 0 à 10 km ; la plupart des accords
// départementaux la coupent en 1A (0-5) et 1B (5-10) : c'est le défaut ici, modifiable entreprise par entreprise.
//
// Une journée avec plusieurs chantiers prend la zone la PLUS ÉLOIGNÉE du jour.
// Les montants sont une aide au calcul : vides par défaut, jamais inventés, à valider par le comptable.

/** Les zones, de la plus proche à la plus lointaine. GD = grand déplacement (au-delà de la dernière limite). */
export const BTP_ZONES = ['1A', '1B', '2', '3', '4', '5'] as const;
export type BtpZone = typeof BTP_ZONES[number] | 'GD';
/** Limite HAUTE de chaque zone, en km (5 km tout rond est encore en 1A). */
export const DEFAULT_LIMITS_KM: readonly number[] = [5, 10, 20, 30, 40, 50];
export const BTP_MENTION = 'Aide au calcul, à valider par le comptable.';
/** Les rôles qui ont droit aux indemnités : les ouvriers (salarié, chef d'équipe). Jamais le bureau. */
export const BTP_ROLES: readonly string[] = ['worker', 'lead'];

export interface BtpAmounts {
  /** Indemnité de trajet, par zone (€ / jour). */
  trajet: Partial<Record<BtpZone, number>>;
  /** Frais de transport, par zone (€ / jour). */
  transport: Partial<Record<BtpZone, number>>;
  /** Indemnité de repas (panier), € / jour coché. */
  panier: number | null;
}

export const emptyAmounts = (): BtpAmounts => ({ trajet: {}, transport: {}, panier: null });

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

/** Relit le jsonb de la base sans jamais faire confiance à sa forme : tout ce qui n'est pas un montant ≥ 0 disparaît. */
export function amountsFrom(raw: unknown): BtpAmounts {
  const out = emptyAmounts();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  for (const k of ['trajet', 'transport'] as const) {
    const t = r[k];
    if (!t || typeof t !== 'object') continue;
    for (const z of [...BTP_ZONES]) {
      const v = num((t as Record<string, unknown>)[z]);
      if (v !== null) out[k][z] = v;
    }
  }
  out.panier = num(r.panier);
  return out;
}

export const hasAmounts = (a: BtpAmounts) =>
  a.panier !== null || Object.keys(a.trajet).length > 0 || Object.keys(a.transport).length > 0;

/** Six limites croissantes, positives, au plus 1000 km. Sinon null (le réglage n'est pas enregistré). */
export function limitsFrom(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length !== BTP_ZONES.length) return null;
  const out: number[] = [];
  for (const v of raw) {
    const n = num(v);
    if (n === null || n > 1000) return null;
    if (out.length && n <= out[out.length - 1]) return null;
    out.push(n);
  }
  return out;
}

/** Distance à vol d'oiseau (haversine), en km, arrondie à 0,1 km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371.0088;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))) * 10) / 10;
}

export function zoneFor(km: number, limits: readonly number[] = DEFAULT_LIMITS_KM): BtpZone {
  for (let i = 0; i < BTP_ZONES.length; i++) if (km <= limits[i]) return BTP_ZONES[i];
  return 'GD';
}

const RANG: Record<BtpZone, number> = { '1A': 0, '1B': 1, '2': 2, '3': 3, '4': 4, '5': 5, GD: 6 };
export const farthest = (a: BtpZone, b: BtpZone): BtpZone => (RANG[b] > RANG[a] ? b : a);
export const zoneLabel = (z: BtpZone) => (z === 'GD' ? 'Grand dépl.' : `Zone ${z}`);

/** Clé d'adresse : ce qui a été géocodé. Une adresse modifiée change la clé, donc on regéocode. */
export function addressKey(parts: { address?: string | null; postal_code?: string | null; city?: string | null }): string {
  return [parts.address, parts.postal_code, parts.city]
    .map((s) => (s || '').trim().replace(/\s+/g, ' '))
    .filter(Boolean).join(' ').toLowerCase();
}

export interface GeoPoint { lat: number; lng: number }

export interface BtpContext {
  limits: number[];
  origin: GeoPoint | null;
  /** worksite_id → point (null = adresse introuvable ou absente). */
  geo: Map<string, GeoPoint | null>;
  /** user_id → rôle. Absent = inconnu : pas de zone (on ne paie rien en devinant). */
  roles: Map<string, string>;
  amounts: BtpAmounts;
}

/** La zone d'un chantier, ou null quand on ne peut pas la dire (pas de départ, adresse introuvable). */
export function worksiteZone(ctx: BtpContext, worksiteId: string | null | undefined): { zone: BtpZone; km: number } | null {
  if (!ctx.origin || !worksiteId) return null;
  const p = ctx.geo.get(worksiteId);
  if (!p) return null;
  const km = distanceKm(ctx.origin, p);
  return { zone: zoneFor(km, ctx.limits), km };
}

export interface BtpLine {
  id: string; user_id: string; work_date: string;
  worksite_id?: string | null; worksite?: { id?: string | null } | null;
  meal_allowance?: boolean | null;
}

/** Une journée d'un ouvrier : sa zone (la plus lointaine du jour), « à vérifier » si un chantier n'est pas placé. */
export interface BtpDay { userId: string; date: string; zone: BtpZone | null; aVerifier: boolean; panier: boolean }

export const dayKey = (userId: string, date: string) => `${userId}|${date}`;

/** Les journées des OUVRIERS seulement (rôle worker ou lead), clé `user|date`. */
export function btpDays(lines: readonly BtpLine[], ctx: BtpContext): Map<string, BtpDay> {
  const out = new Map<string, BtpDay>();
  for (const l of lines) {
    if (!BTP_ROLES.includes(ctx.roles.get(l.user_id) || '')) continue;
    const k = dayKey(l.user_id, l.work_date);
    const d = out.get(k) || { userId: l.user_id, date: l.work_date, zone: null, aVerifier: false, panier: false };
    const z = worksiteZone(ctx, l.worksite_id ?? l.worksite?.id);
    if (z) d.zone = d.zone ? farthest(d.zone, z.zone) : z.zone;
    else d.aVerifier = true;
    if (l.meal_allowance) d.panier = true;
    out.set(k, d);
  }
  return out;
}

/** Ce que l'on écrit dans la case « Zone » d'une ligne (la zone du JOUR). Vide pour le bureau. */
export function dayZoneText(day: BtpDay | undefined): string {
  if (!day) return '';
  if (day.zone && !day.aVerifier) return day.zone;
  if (day.zone) return `${day.zone} (à vérifier)`;
  return 'À vérifier';
}

export interface BtpRecapRow {
  userId: string;
  days: Partial<Record<BtpZone, number>>;
  aVerifier: number;
  paniers: number;
  /** null = aucun montant saisi pour cette rubrique. */
  trajet: number | null; transport: number | null; panier: number | null;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** Par ouvrier : jours par zone, jours à vérifier, paniers (jours cochés), et les montants SI l'entreprise les a remplis. */
export function btpRecap(days: Map<string, BtpDay>, amounts: BtpAmounts): BtpRecapRow[] {
  const by = new Map<string, BtpRecapRow>();
  days.forEach((d) => {
    const r = by.get(d.userId) || { userId: d.userId, days: {}, aVerifier: 0, paniers: 0, trajet: null, transport: null, panier: null };
    // Un jour « à vérifier » n'entre dans aucun montant : on ne paie pas une zone devinée.
    if (d.aVerifier || !d.zone) r.aVerifier += 1;
    else {
      r.days[d.zone] = (r.days[d.zone] || 0) + 1;
      for (const k of ['trajet', 'transport'] as const) {
        const v = amounts[k][d.zone];
        if (v != null) r[k] = cents((r[k] ?? 0) + v);
      }
    }
    if (d.panier) {
      r.paniers += 1;
      if (amounts.panier != null) r.panier = cents((r.panier ?? 0) + amounts.panier);
    }
    by.set(d.userId, r);
  });
  return Array.from(by.values());
}
