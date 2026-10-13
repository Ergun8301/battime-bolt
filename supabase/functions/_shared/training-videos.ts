// Vidéos de formation envoyées directement (lot 13, oct. 2026) — les règles
// PURES, partagées par le bureau (components/trainings-admin.tsx), le salarié
// (components/poseur-trainings.tsx), lib/trainings.ts et les tests (Deno).
// Sans base, sans réseau.
//
// Forfait Supabase GRATUIT (décision D8) : 50 Mo par fichier (limite du forfait,
// non modifiable), 100 Mo par entreprise. 50 Mo : le bucket privé « formations »
// le refuse lui-même (taille et types ci-dessous). 100 Mo : start_training_video
// compte la vraie taille des fichiers + la taille annoncée des envois en cours ;
// GARANTI avec un navigateur normal, et borné à « 100 Mo + 3 fichiers » (moins de
// 250 Mo) avec un navigateur trafiqué : le stockage ne laisse pas la base voir la
// taille avant la fin de l'envoi (détail : en-tête de la migration). L'écran ne
// fait que prévenir plus tôt. Les valeurs sont recopiées de
// supabase/migrations/20261011160000_lot13_videos_envoi_direct.sql (le test
// vérifie qu'elles y sont mot pour mot).

/** Types acceptés (MP4, MOV de l'iPhone, WebM), dans l'ordre de la migration. */
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;
export type VideoMime = typeof VIDEO_MIME_TYPES[number];
/** La liste telle qu'écrite dans la migration (contrainte, bucket et fonctions). */
export const VIDEO_MIME_SQL = "('video/mp4', 'video/quicktime', 'video/webm')";
export const VIDEO_MIME_BUCKET_SQL = "ARRAY['video/mp4', 'video/quicktime', 'video/webm']";

const MO = 1024 * 1024;
/** 50 Mo par fichier : limite du forfait gratuit (lue aussi dans le bucket par training_video_limits). */
export const VIDEO_MAX_BYTES = 50 * MO; // 52428800
/** 100 Mo par entreprise (training_video_quota_bytes). */
export const VIDEO_QUOTA_BYTES = 100 * MO; // 104857600
/**
 * Lien signé de lecture : 10 minutes (une vidéo de 50 Mo au plus se charge largement
 * dedans), re-signé à la demande quand la lecture échoue (lien expiré, retour sur
 * l'appli). « Retirer » une vidéo coupe donc l'accès au plus tard 10 minutes plus tard.
 */
export const VIDEO_SIGN_SECONDS = 600;
/** Nouvelles places d'envoi par entreprise et par tranche de VIDEO_WINDOW_HOURS heures (start_training_video). */
export const VIDEO_NEW_PLACES_MAX = 3;
/** 15 min pour demander l'URL d'envoi + 2 h de validité de cette URL + marge. */
export const VIDEO_WINDOW_HOURS = 3;

/** Extension → type, pour un fichier que le navigateur n'a pas typé (Windows, certains Android). */
const EXT_MIME: Readonly<Record<string, VideoMime>> = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', qt: 'video/quicktime', webm: 'video/webm' };

/** Le type à annoncer pour ce fichier, ou null s'il n'est pas accepté. */
export function videoMimeOf(name: string | null | undefined, type: string | null | undefined): VideoMime | null {
  const t = String(type || '').toLowerCase().split(';')[0].trim();
  if ((VIDEO_MIME_TYPES as readonly string[]).includes(t)) return t as VideoMime;
  // Type inconnu ou vide : l'extension décide. Un autre type déclaré (image, PDF…) : refusé.
  if (t && t !== 'application/octet-stream') return null;
  const ext = String(name || '').toLowerCase().split('.').pop() || '';
  return EXT_MIME[ext] ?? null;
}

/** « 23 Mo », « 2,4 Mo », « 0,3 Mo » (1 Mo = 1 048 576 octets, comme les limites). */
export function formatMo(bytes: number | null | undefined): string {
  const n = Math.max(0, Number(bytes) || 0) / MO;
  if (n > 0 && n < 10) return `${(Math.round(n * 10) / 10).toString().replace('.', ',')} Mo`;
  return `${Math.round(n)} Mo`;
}

/** « 23 Mo utilisés sur 100 Mo ». */
export const quotaLabel = (used: number, quota: number) => `${formatMo(used)} utilisés sur ${formatMo(quota)}`;

/** Part utilisée, entre 0 et 1 (pour la jauge). */
export const quotaRatio = (used: number, quota: number) => (quota > 0 ? Math.min(1, Math.max(0, used / quota)) : 1);

/** « 45 s », « 2 min 10 », « 1 h 02 » ; null si la durée est inconnue. */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null) return null;
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return null;
  const t = Math.round(s);
  if (t < 60) return `${t} s`;
  const m = Math.floor(t / 60), r = t % 60;
  if (m < 60) return r ? `${m} min ${String(r).padStart(2, '0')}` : `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

/** « Vidéo · 2 min 10 · 38 Mo » (ce qui est connu seulement). */
export function videoSummary(v: { duration_s?: number | null; size_bytes?: number | null }): string {
  return ['Vidéo', formatDuration(v.duration_s), v.size_bytes ? formatMo(v.size_bytes) : null].filter(Boolean).join(' · ');
}

export interface Limits { maxBytes: number; quotaBytes: number; usedBytes: number }
/**
 * Vie privée : un MP4 ou un MOV filmé au téléphone peut contenir la position GPS
 * du lieu de tournage ; le fichier part tel quel et chaque destinataire peut le
 * lire. Montré sous « Filmer » / « Choisir un fichier ».
 */
export const GPS_NOTE = 'Attention : une vidéo filmée au téléphone peut contenir la position GPS du lieu, lisible par tous ceux qui la reçoivent. Désactivez la localisation de l’appareil photo avant de filmer.';
/** Un fichier arrivé dont la vidéo n'a jamais été publiée : gardé, et compté dans la place. */
export const leftoverSummary = (bytes: number | null | undefined, closed: boolean) =>
  ['Envoi non terminé', bytes ? formatMo(bytes) : null, closed ? 'place fermée' : null, 'fichier gardé'].filter(Boolean).join(' · ');
export const leftoverNote = (quota: number) =>
  `Ce fichier est arrivé, mais la vidéo n’a pas été publiée : les salariés ne la voient pas. Le fichier est gardé et compte dans les ${formatMo(quota)}.`;
export const TOO_BIG = (max: number) =>
  `Vidéo trop lourde : ${formatMo(max)} maximum. Raccourcissez-la, filmez en 720p, ou collez un lien YouTube, Vimeo ou Google Drive.`;
export const BAD_FORMAT = 'Format refusé : une vidéo MP4, MOV ou WebM.';
export const QUOTA_FULL = (used: number, quota: number) =>
  `Plus assez de place : ${quotaLabel(used, quota)}. Collez plutôt un lien YouTube, Vimeo ou Google Drive.`;

/** Le fichier choisi : accepté (avec le type à annoncer) ou la raison du refus, AVANT tout envoi. */
export function checkVideoFile(f: { name?: string | null; type?: string | null; size: number }, l: Limits):
  { ok: true; mime: VideoMime } | { ok: false; error: string } {
  const mime = videoMimeOf(f.name, f.type);
  if (!mime) return { ok: false, error: BAD_FORMAT };
  if (!(f.size > 0)) return { ok: false, error: 'Ce fichier est vide.' };
  if (f.size > l.maxBytes) return { ok: false, error: TOO_BIG(l.maxBytes) };
  if (l.usedBytes + f.size > l.quotaBytes) return { ok: false, error: QUOTA_FULL(l.usedBytes, l.quotaBytes) };
  return { ok: true, mime };
}

/** Quota plein : plus aucun envoi possible (même une vidéo minuscule). */
export const quotaFull = (l: Limits) => l.usedBytes >= l.quotaBytes;

/** Un chemin de vidéo de CETTE entreprise : `{companyId}/{uuid}` (jamais autre chose n'est signé). */
export const videoPathOk = (companyId: string | null | undefined, path: string | null | undefined) =>
  !!companyId && typeof path === 'string' && new RegExp(`^${companyId.replace(/[^0-9a-f-]/gi, '')}/[0-9a-f-]{36}$`, 'i').test(path);

// ─── Envoi (XHR vers l'URL d'envoi signée) ───────────────────────────────────
export const UPLOAD_CUT = 'La connexion a été coupée pendant l’envoi : rien n’est publié. Réessayez quand le réseau revient.';
export const UPLOAD_CANCELLED = 'Envoi annulé : rien n’est publié.';
/**
 * Réponse du stockage → message. `kind` : 'network' (coupure), 'abort'
 * (« Annuler »), 'timeout' ; sinon le statut HTTP et le corps JSON du stockage.
 */
export function uploadErrorMessage(r: { kind?: 'network' | 'abort' | 'timeout'; status?: number; body?: unknown }, maxBytes = VIDEO_MAX_BYTES): string {
  if (r.kind === 'abort') return UPLOAD_CANCELLED;
  if (r.kind === 'network' || r.kind === 'timeout' || r.status === 0) return UPLOAD_CUT;
  const b = (r.body || {}) as { error?: string; message?: string; statusCode?: string | number };
  const txt = `${b.error || ''} ${b.message || ''}`.toLowerCase();
  if (r.status === 413 || /too large|exceeded the maximum|entity too large|payload too large/.test(txt)) return TOO_BIG(maxBytes);
  if (/mime|invalid_mime_type|not supported/.test(txt)) return BAD_FORMAT;
  if (r.status === 409 || /already exists|duplicate/.test(txt)) return 'Un envoi précédent vient de se terminer : touchez « Ajouter » à nouveau.';
  if (r.status === 401 || r.status === 403 || /signature|expired|unauthorized|row-level security/.test(txt)) return 'Autorisation d’envoi expirée : touchez « Ajouter » à nouveau.';
  return 'L’envoi a échoué. Réessayez.';
}

// ─── Lecture (salarié et bureau) ─────────────────────────────────────────────
/** Combien de fois on re-signe après une erreur de lecture, avant de dire « impossible » (pas de boucle). */
export const PLAY_RESIGN_MAX = 1;
export const PLAY_FAILED = 'Lecture impossible sur cet appareil. Réessayez plus tard, ou demandez la vidéo au bureau.';

// ─── Fichiers à vérifier (lot 14, oct. 2026) — détection SEULEMENT ────────────
// Lecture de video_files_audit() (migration 20261013143711) : (a) les fichiers du
// dossier privé « formations » de l'entreprise qu'aucune formation n'utilise ;
// (b) les formations publiées dont le fichier manque. Rien n'est supprimé (D12) :
// on montre, le bureau décide avec BEMEXO.
export interface FileAuditRow {
  kind: 'fichier_sans_formation' | 'formation_sans_fichier';
  video_id: string | null;
  title: string | null;
  file_path: string;
  real_bytes: number;
  occurred_at: string | null;
  archived: boolean | null;
}
export interface FileAudit { orphans: FileAuditRow[]; orphanTotal: number; orphanBytes: number; missing: FileAuditRow[]; missingTotal: number }

/** La réponse de video_files_audit en listes prêtes à afficher ; null si elle est illisible ou si les deux listes sont vides. Ne lève jamais. */
export function parseFileAudit(data: unknown): FileAudit | null {
  if (!Array.isArray(data)) return null;
  const orphans: FileAuditRow[] = [], missing: FileAuditRow[] = [];
  let orphanTotal: number | null = null, orphanBytes: number | null = null, missingTotal: number | null = null;
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  for (const raw of data) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (r.kind !== 'fichier_sans_formation' && r.kind !== 'formation_sans_fichier') continue;
    const row: FileAuditRow = {
      kind: r.kind, video_id: typeof r.video_id === 'string' ? r.video_id : null, title: typeof r.title === 'string' ? r.title : null,
      file_path: String(r.file_path ?? ''), real_bytes: num(r.real_bytes) ?? 0, occurred_at: typeof r.occurred_at === 'string' ? r.occurred_at : null,
      archived: typeof r.archived === 'boolean' ? r.archived : null,
    };
    if (r.kind === 'fichier_sans_formation') {
      if (!orphans.length) { orphanTotal = num(r.total_n); orphanBytes = num(r.total_bytes); }
      orphans.push(row);
    } else {
      if (!missing.length) missingTotal = num(r.total_n);
      missing.push(row);
    }
  }
  const out: FileAudit = {
    orphans, orphanTotal: orphanTotal ?? orphans.length, orphanBytes: orphanBytes ?? orphans.reduce((s, o) => s + o.real_bytes, 0),
    missing, missingTotal: missingTotal ?? missing.length,
  };
  return out.orphanTotal === 0 && out.missingTotal === 0 ? null : out;
}

/** Date courte « 14/10 » (heure locale) ; '' si illisible. */
export function shortDate(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const AUDIT_LINK = (n: number, open: boolean) => (open ? 'Masquer les fichiers vidéo à vérifier' : `Fichiers vidéo à vérifier (${n})`);
export const AUDIT_NOTE = 'Rien n’est supprimé automatiquement : ces fichiers sont seulement signalés. Pour en retirer un, contactez BEMEXO.';
export const AUDIT_ORPHANS_TITLE = (n: number) => `Fichiers sans formation (${n})`;
export const AUDIT_ORPHANS_NOTE = (quota: number) => `Le fichier est dans votre dossier vidéo, mais aucune formation ne l’utilise. Il compte dans les ${formatMo(quota)}.`;
export const AUDIT_ORPHAN_ROW = (r: Pick<FileAuditRow, 'real_bytes' | 'occurred_at' | 'file_path'>) => {
  const d = shortDate(r.occurred_at);
  return ['Fichier sans formation', formatMo(r.real_bytes), d ? `envoyé le ${d}` : null, `réf. ${r.file_path.slice(-8)}`].filter(Boolean).join(' · ');
};
export const AUDIT_MISSING_TITLE = (n: number) => `Formations dont le fichier manque (${n})`;
export const AUDIT_MISSING_NOTE = 'Les salariés ne peuvent pas lire ces vidéos : le fichier est introuvable.';
export const AUDIT_MISSING_ROW = (r: Pick<FileAuditRow, 'title' | 'occurred_at' | 'archived'>) => {
  const d = shortDate(r.occurred_at);
  return `${r.title || 'Vidéo'}${d ? ` · publiée le ${d}` : ''}${r.archived ? ' · retirée' : ''}`;
};
export const AUDIT_MORE = (n: number) => `+ ${n} autre${n > 1 ? 's' : ''}`;
export const AUDIT_BYTES = (n: number) => `Ensemble : ${formatMo(n)}`;
