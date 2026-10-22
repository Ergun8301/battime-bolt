// Zones d'indemnités BTP, côté navigateur du BUREAU : lecture du réglage, géocodage des adresses (une fois par
// adresse), contexte de calcul pour la feuille d'heures et les exports. Le calcul lui-même est pur :
// supabase/functions/_shared/btp-zones.ts.
//
// LECTURES À PART : btp_settings et worksite_geo sont deux tables neuves. Tant que la migration n'est pas passée
// (ou pour un compte qui n'est pas du bureau), la lecture échoue seule → réglage caché, aucune colonne « Zone ».
//
// Géocodage : API Adresse de l'État (gratuite, sans clé), désormais servie par la Géoplateforme de l'IGN
// (data.geopf.fr/geocodage) ; l'ancienne adresse api-adresse.data.gouv.fr sert de second essai. Un échec réseau
// n'écrit rien (on réessaiera) ; une adresse introuvable est notée (null), et n'est replacée que si elle change.
import { supabase } from '@/lib/supabase';
import {
  addressKey, amountsFrom, btpDays, btpRecap, dayKey, dayZoneText, hasAmounts, limitsFrom, zoneLabel,
  BTP_MENTION, BTP_ZONES, DEFAULT_LIMITS_KM,
  type BtpAmounts, type BtpContext, type BtpLine, type GeoPoint,
} from '@/supabase/functions/_shared/btp-zones';
import type { BtpExport } from '@/lib/export-utils';

export * from '@/supabase/functions/_shared/btp-zones';

export interface BtpSettings {
  enabled: boolean;
  /** null = l'adresse de l'entreprise. */
  originAddress: string | null;
  origin: GeoPoint | null;
  originGeocodedFor: string | null;
  limits: number[];
  amounts: BtpAmounts;
}

export const defaultBtpSettings = (): BtpSettings => ({
  enabled: false, originAddress: null, origin: null, originGeocodedFor: null,
  limits: [...DEFAULT_LIMITS_KM], amounts: amountsFrom({}),
});

type Row = {
  enabled?: boolean | null; origin_address?: string | null; origin_latitude?: number | null; origin_longitude?: number | null;
  origin_geocoded_for?: string | null; limits_km?: unknown; amounts?: unknown;
};

const pt = (lat: unknown, lng: unknown): GeoPoint | null =>
  typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null;

/** null = table absente ou illisible (migration pas passée, pas du bureau) : le réglage reste caché. */
export async function readBtpSettings(companyId: string): Promise<BtpSettings | null> {
  try {
    const { data, error } = await supabase.from('btp_settings')
      .select('enabled, origin_address, origin_latitude, origin_longitude, origin_geocoded_for, limits_km, amounts')
      .eq('company_id', companyId).maybeSingle();
    if (error) return null;
    if (!data) return defaultBtpSettings();
    const r = data as Row;
    return {
      enabled: !!r.enabled,
      originAddress: r.origin_address?.trim() ? r.origin_address.trim() : null,
      origin: pt(r.origin_latitude, r.origin_longitude),
      originGeocodedFor: r.origin_geocoded_for ?? null,
      limits: limitsFrom(r.limits_km) ?? [...DEFAULT_LIMITS_KM],
      amounts: amountsFrom(r.amounts),
    };
  } catch { return null; }
}

/** Enregistre le réglage (le point de départ est replacé au prochain calcul s'il a changé). */
export async function saveBtpSettings(companyId: string, userId: string | undefined, s: BtpSettings): Promise<{ error: string | null }> {
  const { error } = await supabase.from('btp_settings').upsert({
    company_id: companyId,
    enabled: s.enabled,
    origin_address: s.originAddress?.trim() || null,
    limits_km: s.limits,
    amounts: s.amounts,
    updated_at: new Date().toISOString(),
    updated_by: userId ?? null,
  }, { onConflict: 'company_id' });
  return { error: error ? error.message : null };
}

// ─── Géocodage ───────────────────────────────────────────────────────────────

const GEOCODERS = ['https://data.geopf.fr/geocodage/search', 'https://api-adresse.data.gouv.fr/search/'];
/** En dessous, l'adresse trouvée ne ressemble pas assez à celle tapée : on la dit introuvable plutôt que de deviner. */
const MIN_SCORE = 0.4;

export interface GeoResult { point: GeoPoint | null; label: string | null; score: number | null }

/** undefined = l'API n'a pas répondu (réseau) : on n'écrit rien. */
export async function geocode(q: string): Promise<GeoResult | undefined> {
  const query = q.trim().slice(0, 200);
  if (query.length < 3) return { point: null, label: null, score: null };
  for (const base of GEOCODERS) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`${base}?q=${encodeURIComponent(query)}&limit=1`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) continue;
      const j = await res.json() as { features?: { geometry?: { coordinates?: [number, number] }; properties?: { label?: string; score?: number } }[] };
      const f = j.features?.[0];
      const c = f?.geometry?.coordinates;
      const score = typeof f?.properties?.score === 'number' ? f.properties.score : null;
      if (!f || !c || score === null || score < MIN_SCORE) return { point: null, label: f?.properties?.label ?? null, score };
      return { point: { lng: c[0], lat: c[1] }, label: f.properties?.label ?? null, score };
    } catch { /* essai suivant */ }
  }
  return undefined;
}

interface WorksiteAddr { id: string; address?: string | null; postal_code?: string | null; city?: string | null }
interface GeoRow { worksite_id: string; geocoded_for: string; latitude: number | null; longitude: number | null }

/** Le point de départ : celui enregistré, replacé si l'adresse (entreprise ou dépôt) a changé. */
async function ensureOrigin(companyId: string, s: BtpSettings): Promise<GeoPoint | null> {
  let key = '';
  if (s.originAddress) key = addressKey({ address: s.originAddress });
  else {
    const { data } = await supabase.from('companies').select('address, postal_code, city').eq('id', companyId).maybeSingle();
    key = addressKey((data || {}) as WorksiteAddr);
  }
  if (!key) return null;
  if (s.originGeocodedFor === key) return s.origin;
  const g = await geocode(key);
  if (g === undefined) return s.originGeocodedFor ? s.origin : null;
  await supabase.from('btp_settings').upsert({
    company_id: companyId, origin_geocoded_for: key,
    origin_latitude: g.point?.lat ?? null, origin_longitude: g.point?.lng ?? null,
  }, { onConflict: 'company_id' });
  return g.point;
}

/** Les positions des chantiers ; ceux qui manquent (ou dont l'adresse a changé) sont placés maintenant. */
async function ensureWorksites(companyId: string, ids: string[] | null): Promise<Map<string, GeoPoint | null>> {
  let q = supabase.from('worksites').select('id, address, postal_code, city').eq('company_id', companyId);
  if (ids) q = q.in('id', ids.slice(0, 300));
  const [{ data: ws }, { data: geo, error: geoErr }] = await Promise.all([
    q,
    supabase.from('worksite_geo').select('worksite_id, geocoded_for, latitude, longitude').eq('company_id', companyId),
  ]);
  const known = new Map<string, GeoRow>(((geoErr ? [] : geo) || []).map((g) => [(g as GeoRow).worksite_id, g as GeoRow]));
  const out = new Map<string, GeoPoint | null>();
  const todo: { id: string; key: string }[] = [];
  for (const w of (ws || []) as WorksiteAddr[]) {
    const key = addressKey(w);
    const g = known.get(w.id);
    if (!key) { out.set(w.id, null); continue; }
    if (g && g.geocoded_for === key) { out.set(w.id, pt(g.latitude, g.longitude)); continue; }
    todo.push({ id: w.id, key });
  }
  // Quatre à la fois : l'API accepte 50 demandes par seconde, on reste très en dessous.
  for (let i = 0; i < todo.length; i += 4) {
    const lot = todo.slice(i, i + 4);
    const res = await Promise.all(lot.map((t) => geocode(t.key)));
    const rows = lot.flatMap((t, k) => {
      const g = res[k];
      if (g === undefined) { const old = known.get(t.id); out.set(t.id, old ? pt(old.latitude, old.longitude) : null); return []; }
      out.set(t.id, g.point);
      return [{
        worksite_id: t.id, company_id: companyId, geocoded_for: t.key,
        latitude: g.point?.lat ?? null, longitude: g.point?.lng ?? null,
        label: g.label?.slice(0, 300) ?? null, score: g.score, geocoded_at: new Date().toISOString(),
      }];
    });
    if (rows.length) await supabase.from('worksite_geo').upsert(rows, { onConflict: 'worksite_id' });
  }
  return out;
}

/**
 * Le contexte de calcul, ou null quand le réglage est éteint (ou illisible) : alors rien ne change à l'écran ni
 * dans les fichiers. `worksiteIds` limite le géocodage aux chantiers utiles (null = tous ceux de l'entreprise).
 */
export async function loadBtpContext(companyId: string, worksiteIds: string[] | null = null): Promise<BtpContext | null> {
  try {
    const s = await readBtpSettings(companyId);
    if (!s?.enabled) return null;
    const [origin, geo, { data: users }] = await Promise.all([
      ensureOrigin(companyId, s),
      ensureWorksites(companyId, worksiteIds),
      supabase.from('users').select('id, role').eq('company_id', companyId),
    ]);
    return {
      limits: s.limits, origin, geo, amounts: s.amounts,
      roles: new Map(((users || []) as { id: string; role: string }[]).map((u) => [u.id, u.role])),
    };
  } catch { return null; }
}

// ─── Préparation pour l'export (Excel, PDF) ──────────────────────────────────

interface ExportLine extends BtpLine { user?: { first_name?: string | null; last_name?: string | null } | null }

const euros = (n: number | null) => (n == null ? '-' : n.toFixed(2).replace('.', ',') + ' €');

/**
 * Tout ce que lib/export-utils.ts écrit des zones BTP, déjà calculé : la case « Zone » de chaque ligne et le tableau
 * « Indemnités BTP » (par ouvrier : jours par zone, à vérifier, paniers, et montants SEULEMENT s'ils sont remplis).
 */
export function btpExport(ctx: BtpContext, lines: readonly ExportLine[], singleWorkerName?: string): BtpExport {
  const jours = btpDays(lines, ctx);
  const noms = new Map<string, string>();
  for (const l of lines) {
    if (!noms.has(l.user_id)) noms.set(l.user_id, singleWorkerName || `${l.user?.first_name ?? ''} ${l.user?.last_name ?? ''}`.trim() || 'Salarié');
  }
  const zones = [...BTP_ZONES, 'GD'] as const;
  const recap = btpRecap(jours, ctx.amounts).sort((a, b) => (noms.get(a.userId) || '').localeCompare(noms.get(b.userId) || ''));
  const montants = hasAmounts(ctx.amounts);
  const head = ['Salarié', ...zones.map((z) => zoneLabel(z)), 'À vérifier', 'Paniers',
    ...(montants ? ['Trajet (€)', 'Transport (€)', 'Paniers (€)', 'Total (€)'] : [])];
  const rows: (string | number)[][] = recap.map((r) => {
    const total = [r.trajet, r.transport, r.panier].some((v) => v != null)
      ? Math.round(((r.trajet ?? 0) + (r.transport ?? 0) + (r.panier ?? 0)) * 100) / 100 : null;
    return [noms.get(r.userId) || 'Salarié', ...zones.map((z) => r.days[z] || 0), r.aVerifier, r.paniers,
      ...(montants ? [euros(r.trajet), euros(r.transport), euros(r.panier), euros(total)] : [])];
  });
  const notes: string[][] = [
    [BTP_MENTION],
    ['Zone du jour : distance à vol d\'oiseau entre le point de départ et le chantier ; plusieurs chantiers le même jour : le plus éloigné.'],
    ['GD : grand déplacement (au-delà de la dernière zone), à traiter à part.'],
    ['« À vérifier » : adresse du chantier ou du point de départ introuvable. Ces jours n\'entrent dans aucun montant.'],
    ...(montants ? [] : [['Montants : à remplir dans Réglages › Heures & paie › Indemnités BTP (facultatif).']]),
    [],
  ];
  return {
    zoneOf: (e) => dayZoneText(jours.get(dayKey(e.user_id, e.work_date))) || '-',
    sheet: [...notes, head, ...rows],
    sheetCols: [22, ...zones.map(() => 11), 11, 9, ...(montants ? [12, 13, 12, 11] : [])],
    pdfTitle: `Indemnités BTP (jours par zone) — ${BTP_MENTION}`,
    pdfHead: ['Salarié', ...zones, 'À vérifier', 'Paniers'],
    pdfBody: recap.map((r) => [noms.get(r.userId) || 'Salarié', ...zones.map((z) => String(r.days[z] || 0)), String(r.aVerifier), String(r.paniers)]),
  };
}

/** Lit le réglage, place les adresses utiles et prépare l'export ; null = réglage éteint (fichier inchangé). */
export async function loadBtpExport(companyId: string, lines: readonly ExportLine[], singleWorkerName?: string): Promise<BtpExport | null> {
  const ids = Array.from(new Set(lines.map((l) => l.worksite_id ?? l.worksite?.id).filter((x): x is string => !!x)));
  const ctx = await loadBtpContext(companyId, ids);
  return ctx ? btpExport(ctx, lines, singleWorkerName) : null;
}
