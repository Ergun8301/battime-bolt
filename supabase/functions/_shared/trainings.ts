// Formations (lot 6, oct. 2026) — les règles PURES, partagées par le bureau
// (components/trainings-admin.tsx), le salarié (components/poseur-trainings.tsx)
// et les tests (Deno), comme missions.ts. Sans base, sans réseau.
//
// PAS D'HÉBERGEMENT VIDÉO, PAS D'IFRAME : on ne garde qu'un lien https vers
// YouTube, Vimeo ou Google Drive, ouvert dans un nouvel onglet. La base refuse
// elle-même tout autre lien (contrainte de
// supabase/migrations/20261010210000_lot6_formations.sql, recopiée ci-dessous ;
// le test vérifie que les deux sont identiques).
import { isMissingFunction, isMissingRelation } from './missions.ts';

export type TrainingProvider = 'youtube' | 'vimeo' | 'drive';

/** Hôtes acceptés, EXACTEMENT (pas de sous-domaine libre, pas de youtube-nocookie, Loom ou Dailymotion). */
export const TRAINING_HOSTS: Readonly<Record<string, TrainingProvider>> = {
  'www.youtube.com': 'youtube', 'm.youtube.com': 'youtube', 'youtube.com': 'youtube', 'youtu.be': 'youtube',
  'vimeo.com': 'vimeo', 'www.vimeo.com': 'vimeo', 'player.vimeo.com': 'vimeo',
  'drive.google.com': 'drive', 'docs.google.com': 'drive',
};
export const PROVIDER_LABEL: Readonly<Record<TrainingProvider, string>> = { youtube: 'YouTube', vimeo: 'Vimeo', drive: 'Google Drive' };

/** La contrainte de la base, recopiée mot pour mot (le test vérifie qu'elle est dans la migration). */
export const TRAINING_URL_SQL = '^https://(www\\.youtube\\.com|m\\.youtube\\.com|youtube\\.com|youtu\\.be|vimeo\\.com|www\\.vimeo\\.com|player\\.vimeo\\.com|drive\\.google\\.com|docs\\.google\\.com)/[^[:space:]<>"\\\\]*$';
/** La même, en JavaScript (dernier filet avant d'afficher un lien). */
export const TRAINING_URL_RE = /^https:\/\/(www\.youtube\.com|m\.youtube\.com|youtube\.com|youtu\.be|vimeo\.com|www\.vimeo\.com|player\.vimeo\.com|drive\.google\.com|docs\.google\.com)\/[^\s<>"\\]*$/;
export const TRAINING_URL_MAX = 500;
export const TRAINING_TITLE_MIN = 2;
export const TRAINING_TITLE_MAX = 120;

export type LinkCheck = { ok: true; url: string; provider: TrainingProvider } | { ok: false; error: string };

export const LINK_REFUSED = 'Lien refusé : YouTube, Vimeo ou Google Drive uniquement.';

/** Lien collé par le bureau → lien propre (https), ou la raison du refus. */
export function parseTrainingLink(raw: string | null | undefined): LinkCheck {
  const s = String(raw ?? '').trim();
  if (!s) return { ok: false, error: 'Collez le lien de la vidéo.' };
  if (s.length > TRAINING_URL_MAX) return { ok: false, error: 'Lien trop long (500 caractères au plus).' };
  if (/[\s<>"\\]/.test(s)) return { ok: false, error: 'Lien illisible.' };
  // Un « @ » avant le chemin = identifiant dans l'adresse (https://youtube.com@autre.site) : refusé.
  if (/^(https?:\/\/)?[^/?#]*@/i.test(s)) return { ok: false, error: LINK_REFUSED };
  // javascript:, data:, file:, ftp:, intent:, vbscript:… : seuls http et https passent.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(s);
  if (hasScheme && !/^https?:\/\//i.test(s)) return { ok: false, error: LINK_REFUSED };
  let u: URL;
  try { u = new URL(hasScheme ? s : `https://${s.replace(/^\/+/, '')}`); } catch { return { ok: false, error: 'Lien illisible.' }; }
  if (u.protocol === 'http:') u.protocol = 'https:';
  if (u.protocol !== 'https:') return { ok: false, error: LINK_REFUSED };
  if (u.username || u.password || u.port) return { ok: false, error: LINK_REFUSED };
  // Égalité EXACTE après lecture de l'adresse : un sosie (lettres cyrilliques) devient xn--… et ne passe pas.
  const provider = TRAINING_HOSTS[u.hostname.toLowerCase()];
  if (!provider) return { ok: false, error: LINK_REFUSED };
  if (u.pathname === '/' && !u.search) return { ok: false, error: 'Ce lien ne mène pas à une vidéo.' };
  const url = u.toString();
  if (url.length > TRAINING_URL_MAX || !TRAINING_URL_RE.test(url)) return { ok: false, error: 'Lien illisible.' };
  return { ok: true, url, provider };
}

/** Lien lu en base, avant de l'afficher : jamais autre chose qu'un https autorisé (sinon null : pas de lien). */
export const safeTrainingUrl = (url: string | null | undefined): string | null =>
  typeof url === 'string' && url.length <= TRAINING_URL_MAX && TRAINING_URL_RE.test(url) ? url : null;

export const providerOf = (url: string | null | undefined): TrainingProvider | null => {
  const ok = safeTrainingUrl(url);
  if (!ok) return null;
  try { return TRAINING_HOSTS[new URL(ok).hostname] ?? null; } catch { return null; }
};

/** Titre nettoyé (espaces en trop retirés), ou la raison du refus — mêmes bornes que la base. */
export function checkTrainingTitle(raw: string | null | undefined): { ok: true; title: string } | { ok: false; error: string } {
  const t = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (t.length < TRAINING_TITLE_MIN || t.length > TRAINING_TITLE_MAX) return { ok: false, error: 'Titre : 2 à 120 caractères.' };
  return { ok: true, title: t };
}

// ─── Qui doit la voir, qui l'a vue ───────────────────────────────────────────
export interface TrainingAudienceRow { all_team: boolean; assignee_ids: string[] | null }
export interface Person { id: string; first_name?: string | null; last_name?: string | null }
export interface ViewRow { training_id: string; user_id: string; seen_at: string }

const byName = (a: Person, b: Person) =>
  String(a.first_name || '').localeCompare(String(b.first_name || ''), 'fr', { sensitivity: 'base' })
  || String(a.last_name || '').localeCompare(String(b.last_name || ''), 'fr', { sensitivity: 'base' })
  || a.id.localeCompare(b.id);

/**
 * Qui doit la voir, parmi les salariés et chefs d'équipe ACTIFS (`active`) :
 * « Toute l'équipe » = tous (y compris un nouveau venu) ; sinon la liste. Un
 * salarié parti ne compte plus ; un compte bureau n'est jamais dans `active`.
 */
export function audienceOf<P extends Person>(t: TrainingAudienceRow, active: P[]): P[] {
  if (t.all_team) return [...active];
  const ids = new Set(t.assignee_ids || []);
  return active.filter((p) => ids.has(p.id));
}

/** « 2/7 vues » et la liste, par prénom (ordre français), pour le bureau. Une « Vue » hors du public est ignorée. */
export function seenSummary<P extends Person>(t: TrainingAudienceRow & { id: string }, active: P[], views: ViewRow[]) {
  const seen = new Map(views.filter((v) => v.training_id === t.id).map((v) => [v.user_id, v.seen_at] as const));
  const rows = audienceOf(t, active).sort(byName).map((p) => ({ person: p, seen_at: seen.get(p.id) ?? null }));
  return { seen: rows.filter((r) => r.seen_at).length, total: rows.length, rows };
}

/** « 1 formation à voir » / « 3 formations à voir ». */
export const toSeeLabel = (n: number) => `${n} formation${n > 1 ? 's' : ''} à voir`;

// ─── Documents proposés au bureau ────────────────────────────────────────────
/** Jamais une photo, une facture ou un devis : on n'envoie pas une facture à toute l'équipe. */
export const DOC_EXCLUDED_CATEGORIES = ['photo', 'facture', 'facture_payee', 'devis'] as const;
export function docPickable(d: { mime_type?: string | null; category?: string | null }): boolean {
  if (String(d.mime_type || '').toLowerCase().startsWith('image/')) return false;
  return !(DOC_EXCLUDED_CATEGORIES as readonly string[]).includes(String(d.category || ''));
}

// ─── Notification ────────────────────────────────────────────────────────────
export const TRAINING_PUSH_MAX = 80;
/** « Nouvelle formation : Port du harnais » (80 caractères au plus). Jamais de lien, jamais d'e-mail. */
export function trainingPushBody(title: string): string {
  const t = String(title || '').replace(/\s+/g, ' ').trim() || 'Formation';
  const s = `Nouvelle formation : ${t}`;
  return s.length > TRAINING_PUSH_MAX ? `${s.slice(0, TRAINING_PUSH_MAX - 1).trimEnd()}…` : s;
}

// ─── Messages d'erreur (sur le CODE, jamais sur le statut HTTP) ──────────────
export const TRAININGS_DB_PENDING = 'Mise à jour de la base en attente : rien n’a été enregistré.';
export const TRAINING_GONE = 'Cette formation n’est plus disponible.';
export const NO_NETWORK = 'Pas de réseau : réessayez.';
type PgErr = { code?: string; message?: string } | null | undefined;
/**
 * Un 404 peut être « migration pas appliquée » (PGRST202 / PGRST205) OU
 * « formation retirée » (P0002) : on lit donc le code.
 */
export function trainingErrorMessage(e: unknown, fallback = 'Impossible d’enregistrer. Réessayez.'): string {
  const code = String((e as PgErr)?.code || '');
  const msg = String((e as PgErr)?.message || '');
  if (isMissingRelation(e) || isMissingFunction(e)) return TRAININGS_DB_PENDING;
  if (code === '23514') {
    if (/video_url/.test(msg)) return LINK_REFUSED;
    if (/title/.test(msg)) return 'Titre : 2 à 120 caractères.';
    if (/audience/.test(msg)) return 'Choisissez au moins un salarié.';
    return fallback;
  }
  if (code === 'P0002') return TRAINING_GONE;
  if (/row-level security|permission denied/i.test(msg)) return 'Réservé au bureau de l’entreprise.';
  // Messages de la garde et des fonctions : déjà en français (« Choisissez un document. »…).
  if (['22023', '42501', 'P0001'].includes(code) && msg) return msg;
  if (!code && /fetch|network|réseau|load failed/i.test(msg)) return NO_NETWORK;
  return fallback;
}
export { isMissingFunction, isMissingRelation };
