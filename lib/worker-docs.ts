// Documents d'un salarié (bulletins, contrat, justificatifs…) : le même code pour la fiche salarié du bureau et « Mes documents » de l'appli salarié.
// Table `worker_documents` + bucket PRIVÉ `worker-docs` (migration 20261021140000) : chemin `<entreprise>/<salarié>/<uuid>.<ext>`, URLs signées de 2 minutes.
// Les droits sont ceux de la base : le bureau gère tous les salariés de son entreprise ; un salarié voit les siens et ne retire que ceux qu'il a déposés.
import { supabase } from '@/lib/supabase';
import { notifyWorker } from '@/lib/admin-writes';

export const WORKER_DOC_MAX_BYTES = 15 * 1024 * 1024;
export type WorkerDocCategory = 'bulletin' | 'contrat' | 'autre';
export const WORKER_DOC_CATEGORIES: { k: WorkerDocCategory; label: string; pluriel: string }[] = [
  { k: 'bulletin', label: 'Bulletin de paie', pluriel: 'Bulletins' },
  { k: 'contrat', label: 'Contrat', pluriel: 'Contrat' },
  { k: 'autre', label: 'Autre document', pluriel: 'Autres' },
];

export interface WorkerDoc {
  id: string; company_id: string; user_id: string; uploaded_by: string; category: WorkerDocCategory; label: string; path: string;
  mime: string | null; size_bytes: number | null; created_at: string; ai_read_at: string | null;
}

/** Les documents d'un salarié, du plus récent au plus ancien. `available` faux = la base n'a pas encore la table (migration en attente). */
export async function listWorkerDocuments(userId: string): Promise<{ available: boolean; docs: WorkerDoc[] }> {
  const { data, error } = await supabase.from('worker_documents')
    .select('id, company_id, user_id, uploaded_by, category, label, path, mime, size_bytes, created_at, ai_read_at')
    .eq('user_id', userId).order('created_at', { ascending: false });
  if (error) return { available: false, docs: [] };
  return { available: true, docs: (data || []) as WorkerDoc[] };
}

/**
 * Déposer un document pour un salarié (le bureau) ou pour soi (le salarié). N'importe quel fichier jusqu'à 15 Mo ; la catégorie et le nom sont un simple
 * rangement. Le fichier part d'abord, puis la ligne ; si la ligne échoue, le fichier est retiré (rien d'orphelin). Le salarié est prévenu quand c'est le bureau.
 */
export async function uploadWorkerDocument(p: {
  companyId: string; userId: string; uploadedBy: string; file: File; category: WorkerDocCategory; label?: string | null;
}): Promise<WorkerDoc> {
  const { file } = p;
  if (file.size > WORKER_DOC_MAX_BYTES) throw new Error('Fichier trop lourd (15 Mo max).');
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `${p.companyId}/${p.userId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from('worker-docs').upload(path, file, { contentType: file.type || undefined });
  if (upErr) throw upErr;
  const label = (p.label || '').trim() || file.name.replace(/\.[^.]+$/, '') || 'Document';
  const { data, error } = await supabase.from('worker_documents').insert({
    company_id: p.companyId, user_id: p.userId, uploaded_by: p.uploadedBy, category: p.category, label: label.slice(0, 200), path,
    mime: file.type || null, size_bytes: file.size,
  }).select('id, company_id, user_id, uploaded_by, category, label, path, mime, size_bytes, created_at, ai_read_at').single();
  if (error || !data) {
    await supabase.storage.from('worker-docs').remove([path]);
    throw error || new Error('Document non enregistré');
  }
  if (p.uploadedBy !== p.userId) await notifyWorker(p.userId, 'Nouveau document', `Le bureau a ajouté « ${label} » dans Mes documents.`, 'documents');
  return data as WorkerDoc;
}

/** Ouvrir / télécharger : une URL signée de 2 minutes (le bucket est privé). */
export async function workerDocumentUrl(doc: Pick<WorkerDoc, 'path' | 'label'>, download = false): Promise<string> {
  const { data, error } = await supabase.storage.from('worker-docs').createSignedUrl(doc.path, 120, download ? { download: doc.label } : undefined);
  if (error || !data?.signedUrl) throw error || new Error('Lien indisponible');
  return data.signedUrl;
}

/** Retirer un document : la ligne d'abord (c'est elle que la base protège), puis le fichier. */
export async function deleteWorkerDocument(doc: Pick<WorkerDoc, 'id' | 'path'>): Promise<boolean> {
  const { data, error } = await supabase.from('worker_documents').delete().eq('id', doc.id).select('id');
  if (error) throw error;
  if (!data?.length) return false;
  await supabase.storage.from('worker-docs').remove([doc.path]);
  return true;
}
