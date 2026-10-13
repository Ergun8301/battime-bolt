// Vidéos de formation envoyées directement (lot 13, oct. 2026), côté navigateur.
//
// TROIS RÈGLES :
//   · AVANT LA MIGRATION (20261011160000), RIEN NE CHANGE : la table manque
//     (PGRST205) ou la fonction manque (PGRST202) → l'option « Vidéo (téléphone
//     ou fichier) » reste cachée et le salarié ne voit que les formations du
//     lot 6. On ne redemande pas pendant la vie de la page (pas une requête en
//     échec à chaque ouverture). Toute AUTRE erreur (réseau…) garde l'état connu.
//   · ENVOI : start_training_video réserve la place (la base contrôle taille,
//     type et quota), puis une URL d'envoi signée (policy du bucket « formations »,
//     vérifiée à la création de l'URL) et un XHR — barre de progression réelle,
//     « Annuler » — puis publish_training_video (la base relit la vraie taille).
//     Jamais de clé de service : tout part avec les droits du bureau connecté.
//     Le quota de 100 Mo est tenu par la base (borne exacte : en-tête de la migration).
//   · RIEN NE S'EFFACE : « Retirer » = set_training_video_archived ; le fichier
//     reste (D12). Aucun appel de suppression de fichier dans ce lot.
//
// JAMAIS DES HEURES : rien ici ne lit ni n'écrit planning, time_entries ou
// active_sessions.
import { supabase, SUPABASE_ANON_KEY } from '@/lib/supabase';
import { fetchAllPaged } from '@/lib/fetch-all';
import { isMissingFunction, isMissingRelation, trainingErrorMessage, type ViewRow } from '@/supabase/functions/_shared/trainings';
import { parseFileAudit, uploadErrorMessage, VIDEO_MAX_BYTES, VIDEO_QUOTA_BYTES, VIDEO_SIGN_SECONDS, videoPathOk, type FileAudit, type Limits, type VideoMime } from '@/supabase/functions/_shared/training-videos';

export const VIDEO_BUCKET = 'formations';

export interface OfficeVideo {
  id: string;
  company_id: string;
  title: string;
  all_team: boolean;
  assignee_ids: string[];
  file_path: string;
  mime_type: string;
  size_bytes: number | null;
  duration_s: number | null;
  created_by: string | null;
  created_at: string;
  published_at: string | null;
  archived_at: string | null;
}
/** Un fichier arrivé dont la vidéo n'a jamais été publiée (envoi coupé, place fermée) : gardé, et compté dans la place. */
export interface OfficeLeftover {
  id: string;
  title: string;
  file_path: string;
  real_bytes: number;
  reserved_at: string;
  archived_at: string | null;
}
export interface MyVideo {
  id: string;
  title: string;
  file_path: string;
  mime_type: string;
  size_bytes: number | null;
  duration_s: number | null;
  created_at: string;
  seen_at: string | null;
}
export interface WriteResult { ok: boolean; message?: string }
type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

// Migration absente : connu une fois pour toute la vie de la page.
let missing = false;
const markMissing = (e: unknown) => { if (isMissingRelation(e) || isMissingFunction(e)) missing = true; return missing; };

const VIDEO_COLS = 'id, company_id, title, all_team, assignee_ids, file_path, mime_type, size_bytes, duration_s, created_by, created_at, published_at, archived_at';

// ─── Bureau ──────────────────────────────────────────────────────────────────

/**
 * Les vidéos PUBLIÉES de l'entreprise, leurs « Vue » actives (lecture paginée), et
 * les fichiers arrivés mais jamais publiés (ils comptent dans la place : le bureau
 * doit les voir). `missing` = migration pas appliquée.
 */
export async function fetchOfficeVideos(companyId: string): Promise<
  { ok: true; videos: OfficeVideo[]; views: ViewRow[]; leftovers: OfficeLeftover[] } | { ok: false; missing: boolean; message: string }
> {
  if (missing) return { ok: false, missing: true, message: '' };
  try {
    const { data, error } = await supabase.from('training_videos').select(VIDEO_COLS)
      .eq('company_id', companyId).not('published_at', 'is', null).order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    const videos = ((data || []) as unknown as OfficeVideo[]).map((v) => ({ ...v, assignee_ids: v.assignee_ids || [] }));
    const raw = await fetchAllPaged<{ video_id: string; user_id: string; seen_at: string }>((f, t) => supabase.from('training_video_views').select('video_id, user_id, seen_at')
      .eq('company_id', companyId).is('undone_at', null).order('video_id').order('user_id').range(f, t) as unknown as Page<{ video_id: string; user_id: string; seen_at: string }>);
    // Les fichiers non publiés : demandés seulement une fois la migration confirmée (une seule lecture en échec avant).
    // Si cette lecture échoue, la liste des vidéos publiées reste affichée.
    const leftovers = await fetchOfficeLeftovers();
    // Même forme que les « Vue » du lot 6 : seenSummary s'en sert tel quel.
    return { ok: true, videos, views: raw.map((v) => ({ training_id: v.video_id, user_id: v.user_id, seen_at: v.seen_at })), leftovers };
  } catch (e) {
    return { ok: false, missing: markMissing(e), message: trainingErrorMessage(e, 'Impossible de charger les vidéos.') };
  }
}

async function fetchOfficeLeftovers(): Promise<OfficeLeftover[]> {
  try {
    const { data, error } = await supabase.rpc('training_video_leftovers', {}, { get: true });
    if (error || !Array.isArray(data)) return [];
    return (data as OfficeLeftover[]).map((l) => ({ ...l, real_bytes: Number(l.real_bytes) || 0 }));
  } catch {
    return [];
  }
}

// Lot 14 : fonction de la migration 20261013143711, propre à cette lecture. Elle n'appelle JAMAIS
// markMissing : son absence ne doit pas cacher les vidéos du lot 13.
let auditMissing = false;

/**
 * Les fichiers à vérifier (DÉTECTION SEULEMENT, rien n'est supprimé) : fichiers du dossier privé sans
 * formation, formations dont le fichier manque. null = rien à montrer, fonction absente, droit refusé
 * ou réseau : aucune erreur n'est affichée.
 */
export async function fetchVideoFilesAudit(): Promise<FileAudit | null> {
  if (missing || auditMissing) return null;
  try {
    const { data, error } = await supabase.rpc('video_files_audit', {}, { get: true });
    if (error) { if (isMissingFunction(error)) auditMissing = true; return null; }
    return parseFileAudit(data);
  } catch {
    return null;
  }
}

/** La jauge : 50 Mo par fichier, 100 Mo par entreprise ; `usedBytes` = fichiers + envoi en cours. null = lecture impossible. */
export async function fetchVideoLimits(): Promise<Limits | null> {
  try {
    const { data, error } = await supabase.rpc('training_video_limits', {}, { get: true });
    if (error) { markMissing(error); return null; }
    const r = (Array.isArray(data) ? data[0] : data) as { max_file_bytes?: number; quota_bytes?: number; used_bytes?: number; reserved_bytes?: number } | null;
    if (!r) return null;
    return {
      maxBytes: Number(r.max_file_bytes) || VIDEO_MAX_BYTES,
      quotaBytes: Number(r.quota_bytes) || VIDEO_QUOTA_BYTES,
      usedBytes: (Number(r.used_bytes) || 0) + (Number(r.reserved_bytes) || 0),
    };
  } catch {
    return null;
  }
}

/** Réserve la place d'un envoi. `uploaded` = le fichier est déjà arrivé (réseau coupé avant la publication) : il reste à publier. */
export async function startVideoUpload(p: { title: string; allTeam: boolean; assigneeIds: string[]; mime: VideoMime; size: number; duration: number | null }):
  Promise<{ ok: true; id: string; path: string; uploaded: boolean } | { ok: false; message: string }> {
  try {
    const { data, error } = await supabase.rpc('start_training_video', {
      p_title: p.title, p_all_team: p.allTeam, p_assignee_ids: p.allTeam ? [] : p.assigneeIds, p_mime: p.mime, p_size: p.size,
      p_duration: p.duration != null && Number.isFinite(p.duration) ? Math.round(p.duration) : null,
    });
    if (error) return { ok: false, message: trainingErrorMessage(error, 'Impossible de préparer l’envoi.') };
    const r = (Array.isArray(data) ? data[0] : data) as { video_id?: string; video_path?: string; uploaded?: boolean } | null;
    if (!r?.video_id || !r.video_path) return { ok: false, message: 'Impossible de préparer l’envoi.' };
    return { ok: true, id: r.video_id, path: r.video_path, uploaded: !!r.uploaded };
  } catch (e) {
    return { ok: false, message: trainingErrorMessage(e, 'Impossible de préparer l’envoi.') };
  }
}

export type UploadOutcome = { ok: true } | { ok: false; kind: 'abort' | 'network' | 'refused'; message: string };
export interface UploadRun {
  /** Fin de l'envoi : ok, ou le message à montrer (`kind` : annulé, coupé, refusé). */
  done: Promise<UploadOutcome>;
  /** « Annuler » : coupe l'envoi en cours (rien n'est publié). */
  cancel: () => void;
}

/**
 * Envoie le fichier à SA place : URL d'envoi signée (2 h, une seule place, jamais
 * en mode « écraser »), puis un XHR (fetch ne donne pas l'avancement de l'envoi). `onProgress` reçoit
 * les octets partis et le total. Même format que supabase-js (FormData).
 */
export function uploadVideoFile(path: string, file: File, mime: VideoMime, onProgress: (loaded: number, total: number) => void): UploadRun {
  let xhr: XMLHttpRequest | null = null;
  let cancelled = false;
  const done: UploadRun['done'] = (async (): Promise<UploadOutcome> => {
    const { data, error } = await supabase.storage.from(VIDEO_BUCKET).createSignedUploadUrl(path);
    if (cancelled) return { ok: false, kind: 'abort', message: uploadErrorMessage({ kind: 'abort' }) };
    if (error || !data?.signedUrl) {
      const msg = String((error as { message?: string } | null)?.message || '');
      if (!msg || /fetch|network|load failed/i.test(msg)) return { ok: false, kind: 'network', message: uploadErrorMessage({ kind: 'network' }) };
      return { ok: false, kind: 'refused', message: uploadErrorMessage({ status: 403, body: { message: msg } }) };
    }
    const { data: s } = await supabase.auth.getSession();
    // Le type exact part avec le fichier : le bucket n'accepte que MP4, MOV, WebM.
    const body = new FormData();
    body.append('cacheControl', '3600');
    body.append('', file.type === mime ? file : new File([file], file.name || 'video', { type: mime }));
    return new Promise<UploadOutcome>((resolve) => {
      const x = new XMLHttpRequest();
      xhr = x;
      x.open('PUT', data.signedUrl);
      x.setRequestHeader('apikey', SUPABASE_ANON_KEY);
      x.setRequestHeader('authorization', `Bearer ${s.session?.access_token || SUPABASE_ANON_KEY}`);
      x.setRequestHeader('x-upsert', 'false');
      x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.min(e.loaded, file.size), file.size); };
      x.onload = () => {
        if (x.status >= 200 && x.status < 300) { onProgress(file.size, file.size); resolve({ ok: true }); return; }
        let parsed: unknown = null;
        try { parsed = JSON.parse(x.responseText || 'null'); } catch { /* corps illisible */ }
        resolve({ ok: false, kind: 'refused', message: uploadErrorMessage({ status: x.status, body: parsed }) });
      };
      x.onerror = () => resolve({ ok: false, kind: 'network', message: uploadErrorMessage({ kind: 'network' }) });
      x.ontimeout = () => resolve({ ok: false, kind: 'network', message: uploadErrorMessage({ kind: 'timeout' }) });
      x.onabort = () => resolve({ ok: false, kind: 'abort', message: uploadErrorMessage({ kind: 'abort' }) });
      if (cancelled) { resolve({ ok: false, kind: 'abort', message: uploadErrorMessage({ kind: 'abort' }) }); return; }
      x.send(body);
    });
  })().catch((): UploadOutcome => ({ ok: false, kind: 'network', message: uploadErrorMessage({ kind: 'network' }) }));
  return { done, cancel: () => { cancelled = true; try { xhr?.abort(); } catch { /* déjà fini */ } } };
}

/** Publie la vidéo arrivée : la base lit la vraie taille et le vrai type dans le stockage. */
export async function publishVideo(id: string): Promise<WriteResult & { bytes?: number }> {
  try {
    const { data, error } = await supabase.rpc('publish_training_video', { p_id: id });
    if (error) return { ok: false, message: trainingErrorMessage(error, 'La vidéo est arrivée mais n’est pas encore publiée : touchez « Ajouter » à nouveau.') };
    const r = (Array.isArray(data) ? data[0] : data) as { real_bytes?: number } | null;
    return { ok: true, bytes: Number(r?.real_bytes) || undefined };
  } catch (e) {
    return { ok: false, message: trainingErrorMessage(e, 'La vidéo est arrivée mais n’est pas encore publiée : touchez « Ajouter » à nouveau.') };
  }
}

/** « Retirer » (archived_at + archived_by, heure du serveur ; le fichier reste) ou « Remettre ». */
export async function setVideoArchived(id: string, archived: boolean): Promise<WriteResult> {
  try {
    const { error } = await supabase.rpc('set_training_video_archived', { p_id: id, p_archived: archived });
    if (error) return { ok: false, message: trainingErrorMessage(error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, message: trainingErrorMessage(e) };
  }
}

/** Lien signé de LECTURE (10 min), créé à l'ouverture du lecteur et re-signé si la lecture échoue ; seulement pour un chemin de l'entreprise. null = refusé ou réseau. */
export async function signVideo(companyId: string | null | undefined, path: string, seconds = VIDEO_SIGN_SECONDS): Promise<string | null> {
  if (!videoPathOk(companyId, path)) return null;
  try {
    const { data, error } = await supabase.storage.from(VIDEO_BUCKET).createSignedUrl(path, seconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

// ─── Salarié ─────────────────────────────────────────────────────────────────

/** Mes vidéos (my_training_videos, lue par un GET). 'missing' = migration pas appliquée ; null = lecture en échec. */
export async function fetchMyVideos(): Promise<MyVideo[] | 'missing' | null> {
  if (missing) return 'missing';
  try {
    const { data, error } = await supabase.rpc('my_training_videos', {}, { get: true });
    if (error) return markMissing(error) ? 'missing' : null;
    if (!Array.isArray(data)) return null;
    return data as MyVideo[];
  } catch {
    return null;
  }
}

/** « Vue » (ou « Annuler ») sur MA ligne : set_training_video_seen. La date vient du serveur ; « Annuler » ne s'efface pas, il est daté. */
export async function setVideoSeen(id: string, seen: boolean): Promise<WriteResult & { seenAt?: string | null; gone?: boolean }> {
  try {
    const { data, error } = await supabase.rpc('set_training_video_seen', { p_video: id, p_seen: seen });
    if (error) {
      const gone = (error as { code?: string }).code === 'P0002';
      return { ok: false, gone, message: trainingErrorMessage(error) };
    }
    return { ok: true, seenAt: (data as string | null) ?? null };
  } catch (e) {
    return { ok: false, message: trainingErrorMessage(e) };
  }
}
