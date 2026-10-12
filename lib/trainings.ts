// Formations (lot 6, oct. 2026), côté navigateur.
//
// TROIS RÈGLES :
//   · AVANT LA MIGRATION (20261010210000), RIEN NE CHANGE : la table manque
//     (PGRST205) ou la fonction manque (PGRST202) → la fonction se cache, au
//     bureau comme chez le salarié. Toute AUTRE erreur (réseau…) garde l'état
//     connu : un raté ne fait pas disparaître la liste.
//   · ÉCRITURES : une formation s'insère avec SEULEMENT les colonnes permises
//     (company_id, title, kind, video_url, document_id, all_team, assignee_ids —
//     jamais id, created_by, created_at ni archived_at) ; « Vue » passe par
//     set_training_seen. Rien ne s'efface : on « retire » (archived_at).
//   · NOTIFICATION : la branche « message du bureau » de send-push (déjà en
//     production). Jamais d'e-mail, jamais de mailto.
//
// LOT 13 (vidéos envoyées directement, lib/training-videos.ts) : le salarié
// reçoit UNE liste — ses formations du lot 6 et ses vidéos (kind 'upload') —
// lue en parallèle ; tant que la migration du lot 13 manque, la liste est
// exactement celle du lot 6.
//
// JAMAIS DES HEURES : rien ici ne lit ni n'écrit planning, time_entries ou
// active_sessions.
import { supabase } from '@/lib/supabase';
import { fetchAllPaged } from '@/lib/fetch-all';
import { signCompanyDocuments } from '@/lib/chantier-docs';
import { fetchMyVideos } from '@/lib/training-videos';
import {
  docPickable, isMissingFunction, isMissingRelation, trainingErrorMessage, trainingPushBody, type ViewRow,
} from '@/supabase/functions/_shared/trainings';

/** Une formation ajoutée, rafraîchie ou cochée : le bandeau et la liste suivent. */
export const TRAININGS_CHANGED_EVENT = 'bemexo:trainings-changed';
export const announceTrainingsChanged = () => { try { window.dispatchEvent(new Event(TRAININGS_CHANGED_EVENT)); } catch { /* hors navigateur */ } };

export interface OfficeTraining {
  id: string;
  company_id: string;
  title: string;
  kind: 'video' | 'document';
  video_url: string | null;
  document_id: string | null;
  all_team: boolean;
  assignee_ids: string[];
  created_by: string | null;
  created_at: string;
  archived_at: string | null;
  document?: { label: string | null; file_name: string | null; file_path: string; mime_type: string | null } | null;
}
export interface PickableDoc {
  id: string;
  label: string | null;
  file_name: string | null;
  file_path: string;
  mime_type: string | null;
  category?: string | null;
  created_at: string;
  worksite_id: string;
  worksite?: { client_name: string | null } | null;
}
export interface MyTraining {
  id: string;
  title: string;
  /** 'upload' : vidéo envoyée directement (lot 13), lue dans l'appli. */
  kind: 'video' | 'document' | 'upload';
  video_url: string | null;
  document_name: string | null;
  document_path: string | null;
  document_mime: string | null;
  created_at: string;
  seen_at: string | null;
  /** Lot 13 seulement (kind 'upload'). */
  video_path?: string | null;
  video_size?: number | null;
  video_duration?: number | null;
}

const TRAINING_COLS = 'id, company_id, title, kind, video_url, document_id, all_team, assignee_ids, created_by, created_at, archived_at, document:documents(label, file_name, file_path, mime_type)';
type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

// ─── Bureau ──────────────────────────────────────────────────────────────────

/**
 * La migration est-elle passée ? Le bouton « Formations » n'existe qu'à 'on'.
 * 'missing' = table absente (inutile de redemander) ; 'error' = autre échec (réseau…).
 */
export async function trainingsAvailable(companyId: string): Promise<'on' | 'missing' | 'error'> {
  try {
    const { error } = await supabase.from('trainings').select('id').eq('company_id', companyId).limit(1);
    if (!error) return 'on';
    return isMissingRelation(error) ? 'missing' : 'error';
  } catch {
    return 'error';
  }
}

/** Les formations de l'entreprise (document joint), puis les « Vue » de l'entreprise (lecture paginée). */
export async function fetchOfficeTrainings(companyId: string): Promise<
  { ok: true; trainings: OfficeTraining[]; views: ViewRow[] } | { ok: false; missing: boolean; message: string }
> {
  try {
    const { data, error } = await supabase.from('trainings').select(TRAINING_COLS)
      .eq('company_id', companyId).order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    const trainings = ((data || []) as unknown as OfficeTraining[]).map((t) => ({ ...t, assignee_ids: t.assignee_ids || [], document: one(t.document) }));
    const views = await fetchAllPaged<ViewRow>((f, t) => supabase.from('training_views').select('training_id, user_id, seen_at')
      .eq('company_id', companyId).order('training_id').order('user_id').range(f, t) as unknown as Page<ViewRow>);
    return { ok: true, trainings, views };
  } catch (e) {
    return { ok: false, missing: isMissingRelation(e), message: trainingErrorMessage(e, 'Impossible de charger les formations.') };
  }
}

/** Documents déjà téléversés que l'on peut proposer : ni photo, ni image, ni facture, ni devis. Plus récents d'abord. */
export async function fetchPickableDocuments(companyId: string): Promise<PickableDoc[] | null> {
  const cols = 'id, label, file_name, file_path, mime_type, created_at, worksite_id, worksite:worksites(client_name)';
  const read = (withCategory: boolean) => supabase.from('documents').select(withCategory ? `${cols}, category` : cols)
    .eq('company_id', companyId)
    // Les photos de chantier sont aussi dans `documents` : écartées AVANT la limite,
    // sinon 300 photos récentes cachent le livret PDF plus ancien.
    .or('mime_type.is.null,mime_type.not.ilike.image/*')
    .order('created_at', { ascending: false }).limit(300);
  // Avec la catégorie (lot 7) ; sans, si la colonne n'existe pas encore (comme « Documents »).
  let { data, error } = await read(true);
  if (error) ({ data, error } = await read(false));
  if (error) return null;
  return ((data || []) as unknown as PickableDoc[]).map((d) => ({ ...d, worksite: one(d.worksite) })).filter(docPickable);
}

export interface WriteResult { ok: boolean; message?: string }

/** Ajoute une formation. Seules les colonnes permises partent. */
export async function createTraining(p: {
  companyId: string; title: string; kind: 'video' | 'document'; videoUrl: string | null; documentId: string | null; allTeam: boolean; assigneeIds: string[];
}): Promise<WriteResult & { id?: string }> {
  const body = {
    company_id: p.companyId,
    title: p.title,
    kind: p.kind,
    video_url: p.kind === 'video' ? p.videoUrl : null,
    document_id: p.kind === 'document' ? p.documentId : null,
    all_team: p.allTeam,
    assignee_ids: p.allTeam ? [] : p.assigneeIds,
  };
  const { data, error } = await supabase.from('trainings').insert(body).select('id').single();
  if (error) return { ok: false, message: trainingErrorMessage(error, 'Impossible d’ajouter la formation.') };
  return { ok: true, id: (data as { id: string }).id };
}

/** « Retirer » (archived_at, heure du serveur) ou « Remettre ». 0 ligne = refusée par la RLS ou introuvable. */
export async function setTrainingArchived(id: string, archived: boolean): Promise<WriteResult> {
  const { data, error } = await supabase.from('trainings').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', id).select('id');
  if (error) return { ok: false, message: trainingErrorMessage(error) };
  return (data || []).length ? { ok: true } : { ok: false, message: 'Cette formation est introuvable.' };
}

/**
 * Prévient par notification (si le salarié l'a activée sur son téléphone), en
 * mode « bureau connecté ». Ids de démonstration (« demo-… ») jamais envoyés.
 * Ne lève jamais : `sent: 0` veut seulement dire que personne n'a activé les
 * notifications — ils la verront dans l'appli (bandeau « à voir »).
 */
export async function notifyTraining(p: { userIds: string[]; companyName: string; title: string; trainingId: string }): Promise<{ sent: number; error?: string }> {
  const ids = Array.from(new Set(p.userIds.filter((id) => !!id && !id.startsWith('demo-'))));
  if (!ids.length) return { sent: 0 };
  try {
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: { user_ids: ids, title: p.companyName || 'BEMEXO', body: trainingPushBody(p.title), url: '/poseur', tag: `formation-${p.trainingId}` },
    });
    if (error) throw error;
    return { sent: (data as { sent?: number } | null)?.sent ?? 0 };
  } catch (e) {
    return { sent: 0, error: (e as { message?: string })?.message || 'envoi impossible' };
  }
}

/** Le lien signé d'un document (1 h), pour « Ouvrir ↗ ». */
export async function signTrainingDocs(companyId: string, paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  return signCompanyDocuments(companyId, paths, 3600);
}

// ─── Salarié ─────────────────────────────────────────────────────────────────

/**
 * Mes formations : my_trainings, lue par un GET (fonction STABLE : une lecture,
 * pas une écriture). 'missing' = migration pas appliquée (la fonction se cache) ;
 * null = lecture en échec (on garde ce qu'on sait).
 */
export async function fetchMyTrainings(): Promise<MyTraining[] | 'missing' | null> {
  try {
    // Les deux lectures en parallèle ; celle des vidéos ne se refait plus une fois
    // la migration du lot 13 connue absente (lib/training-videos.ts).
    const [{ data, error }, videos] = await Promise.all([supabase.rpc('my_trainings', {}, { get: true }), fetchMyVideos()]);
    if (error) return isMissingFunction(error) || isMissingRelation(error) ? 'missing' : null;
    if (!Array.isArray(data)) return 'missing';
    if (videos === null) return null; // vidéos illisibles (réseau…) : on garde ce qu'on sait
    const uploads: MyTraining[] = videos === 'missing' ? [] : videos.map((v) => ({
      id: v.id, title: v.title, kind: 'upload', video_url: null, document_name: null, document_path: null, document_mime: null,
      created_at: v.created_at, seen_at: v.seen_at, video_path: v.file_path, video_size: v.size_bytes, video_duration: v.duration_s,
    }));
    return [...(data as MyTraining[]), ...uploads];
  } catch {
    return null;
  }
}

/** « Vue » (ou « Annuler ») : set_training_seen, sur MA ligne seulement. La date vient du serveur. */
export async function setTrainingSeen(id: string, seen: boolean): Promise<WriteResult & { seenAt?: string | null; gone?: boolean }> {
  try {
    const { data, error } = await supabase.rpc('set_training_seen', { p_training: id, p_seen: seen });
    if (error) {
      const gone = (error as { code?: string }).code === 'P0002';
      return { ok: false, gone, message: trainingErrorMessage(error) };
    }
    return { ok: true, seenAt: (data as string | null) ?? null };
  } catch (e) {
    return { ok: false, message: trainingErrorMessage(e) };
  }
}
