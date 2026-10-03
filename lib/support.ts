// Accès support BEMEXO (lot 5) — côté navigateur.
//
// DEUX CÔTÉS :
//   • le PATRON autorise (1 h / 24 h / 7 j), retire, et lit le journal ;
//   • le SUPPORT (compte inscrit par BEMEXO + double vérification) « entre »
//     dans une entreprise qui l'a autorisé : même interface, bandeau en haut.
//
// CE FICHIER NE DONNE AUCUN DROIT. Tout est vérifié par la base (migration
// lot 5) : l'état « mode support » gardé ici ne sert qu'à savoir QUELLE
// entreprise afficher. S'il est faux ou périmé, les lectures reviennent vides.
import { supabase } from '@/lib/supabase';
import { isPreviewHost } from '@/lib/hosting';

export type SupportHours = 1 | 24 | 168;
export const SUPPORT_DURATIONS: { hours: SupportHours; label: string }[] = [
  { hours: 1, label: '1 heure' },
  { hours: 24, label: '24 heures' },
  { hours: 168, label: '7 jours' },
];

export interface SupportGrant { created_at: string; expires_at: string }
export type SupportEvent = 'autorise' | 'retire' | 'entre' | 'sort';
export interface SupportLogRow { id: number | string; at: string; event: SupportEvent; actor_label: string; detail: string | null }
export interface SupportState { grant: SupportGrant | null; log: SupportLogRow[] }

/** Côté patron : même interface pour la base et pour la démo. */
export interface SupportAdminSource {
  demo: boolean;
  load(): Promise<SupportState>;
  grant(hours: SupportHours): Promise<void>;
  revoke(): Promise<void>;
}

const errMsg = (e: unknown, fallback: string) => (e as { message?: string } | null)?.message || fallback;

export const supabaseSupportSource: SupportAdminSource = {
  demo: false,
  async load() {
    const nowIso = new Date().toISOString();
    const [g, l] = await Promise.all([
      supabase.from('support_grants').select('created_at, expires_at')
        .is('revoked_at', null).gt('expires_at', nowIso).order('created_at', { ascending: false }).limit(1),
      supabase.from('support_access_log').select('id, at, event, actor_label, detail')
        .order('at', { ascending: false }).limit(20),
    ]);
    return {
      grant: ((g.data || [])[0] as SupportGrant | undefined) ?? null,
      log: (l.data || []) as SupportLogRow[],
    };
  },
  async grant(hours) {
    const { error } = await supabase.rpc('support_grant', { p_hours: hours });
    if (error) throw new Error(errMsg(error, 'Autorisation impossible.'));
  },
  async revoke() {
    const { error } = await supabase.rpc('support_revoke');
    if (error) throw new Error(errMsg(error, 'Retrait impossible.'));
  },
};

/** L'écrit du journal, du point de vue du patron. */
export function describeEvent(r: SupportLogRow): string {
  switch (r.event) {
    case 'autorise': return `${r.actor_label} a autorisé le support${r.detail ? ` (${r.detail})` : ''}`;
    case 'retire': return `${r.actor_label} a retiré l’accès`;
    case 'entre': return `${r.actor_label} est entré (lecture seule)`;
    case 'sort': return `${r.actor_label} est sorti`;
    default: return r.actor_label;
  }
}

export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('fr-FR', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

// ── Mode support (côté compte support) ──────────────────────────────────────
// Gardé dans sessionStorage : fermer l'onglet = sortir. Jamais dans localStorage.
const KEY = 'bemexo-support';
export interface SupportSession { staffId: string; companyId: string; name: string; expiresAt: string }

export function readSupportSession(): SupportSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SupportSession;
    if (!s.staffId || !s.companyId || !s.expiresAt || new Date(s.expiresAt).getTime() <= Date.now()) {
      window.sessionStorage.removeItem(KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

function writeSupportSession(s: SupportSession | null) {
  try {
    if (s) window.sessionStorage.setItem(KEY, JSON.stringify(s));
    else window.sessionStorage.removeItem(KEY);
  } catch { /* stockage indisponible : on reste simplement hors mode support */ }
}

/**
 * Profil connecté → profil affiché. Hors mode support (cas de TOUS les
 * utilisateurs normaux) : renvoyé tel quel. En mode support, seul le
 * `company_id` change, et seulement pour le compte qui est entré.
 */
export function withSupportCompany<T extends { id: string; company_id: string } | null>(profile: T): T {
  if (!profile) return profile;
  const s = readSupportSession();
  if (!s || s.staffId !== profile.id) return profile;
  return { ...profile, company_id: s.companyId };
}

export interface SupportCompany { company_id: string; name: string; expires_at: string }

export async function supportIsStaff(): Promise<boolean> {
  const { data, error } = await supabase.rpc('support_is_staff');
  return !error && data === true;
}

export async function supportMyCompanies(): Promise<SupportCompany[]> {
  const { data, error } = await supabase.rpc('support_my_companies');
  if (error) throw new Error(errMsg(error, 'Liste indisponible.'));
  return (data || []) as SupportCompany[];
}

/** « Entrer » : noté dans le journal du client, puis mode support. */
export async function supportEnter(staffId: string, companyId: string): Promise<SupportSession> {
  const { data, error } = await supabase.rpc('support_enter', { p_company: companyId, p_log: true });
  const row = (data || [])[0] as { name: string; expires_at: string } | undefined;
  if (error || !row) throw new Error(errMsg(error, 'Accès refusé ou expiré.'));
  const s = { staffId, companyId, name: row.name, expiresAt: row.expires_at };
  writeSupportSession(s);
  return s;
}

/** Revérifie auprès de la base sans rien noter (rechargement de page). */
export async function supportStillValid(companyId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('support_enter', { p_company: companyId, p_log: false });
  return !error && Array.isArray(data) && data.length > 0;
}

/** « Quitter » : noté dans le journal, puis retour à la console support. */
export async function supportExit(companyId: string | null, log = true): Promise<void> {
  writeSupportSession(null);
  if (log && companyId) await supabase.rpc('support_exit', { p_company: companyId });
}

// ── Démo (préviews uniquement) ──────────────────────────────────────────────
export function isSupportDemo(): boolean {
  if (typeof window === 'undefined' || !isPreviewHost()) return false;
  return new URLSearchParams(window.location.search).get('demo') === 'support';
}

export function demoSupportSource(onChange?: () => void): SupportAdminSource & { enterAsSupport(): void; exitAsSupport(): void } {
  let grant: SupportGrant | null = null;
  let seq = 3;
  const t0 = Date.now();
  const log: SupportLogRow[] = [
    { id: 2, at: new Date(t0 - 26 * 3600e3).toISOString(), event: 'sort', actor_label: 'Ergun — support BEMEXO', detail: null },
    { id: 1, at: new Date(t0 - 26.5 * 3600e3).toISOString(), event: 'entre', actor_label: 'Ergun — support BEMEXO', detail: null },
  ];
  const push = (event: SupportEvent, actor_label: string, detail: string | null = null) => {
    log.unshift({ id: seq++, at: new Date().toISOString(), event, actor_label, detail });
    onChange?.();
  };
  const wait = () => new Promise((r) => setTimeout(r, 350));
  return {
    demo: true,
    async load() { await wait(); return { grant: grant && new Date(grant.expires_at) > new Date() ? { ...grant } : null, log: log.slice() }; },
    async grant(hours) {
      await wait();
      grant = { created_at: new Date().toISOString(), expires_at: new Date(Date.now() + hours * 3600e3).toISOString() };
      push('autorise', 'Paul Martin', SUPPORT_DURATIONS.find((d) => d.hours === hours)?.label ?? null);
    },
    async revoke() { await wait(); if (grant) { grant = null; push('retire', 'Paul Martin'); } },
    enterAsSupport() { push('entre', 'Ergun — support BEMEXO'); },
    exitAsSupport() { push('sort', 'Ergun — support BEMEXO'); },
  };
}
