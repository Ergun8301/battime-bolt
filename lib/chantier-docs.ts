// Envoi d'un document de chantier (bouton « Documents »), partagé entre
// l'écran Documents (components/chantier-documents.tsx) et l'Assistant BEMEXO
// (lot 3 bis, pièces jointes). Code sorti tel quel : un seul chemin.
import { supabase } from '@/lib/supabase';

export const DOC_MAX_BYTES = 15 * 1024 * 1024;

export async function uploadWorksiteDocument(p: {
  companyId: string; userId: string; worksiteId: string; file: File; workDate?: string | null; timeEntryId?: string | null;
}): Promise<{ image: boolean }> {
  const { file } = p;
  if (file.size > DOC_MAX_BYTES) throw new Error('Fichier trop lourd (15 Mo max).');
  // Le classement suit le TYPE du fichier, jamais le bouton cliqué.
  const image = (file.type || '').startsWith('image/');
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `${p.companyId}/${p.worksiteId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from('chantier-docs').upload(path, file, { contentType: file.type || undefined });
  if (upErr) throw upErr;
  const { error: insErr } = await supabase.from('documents').insert({
    company_id: p.companyId, worksite_id: p.worksiteId, uploaded_by: p.userId,
    // Nom : celui du fichier pour un document choisi, RIEN pour une photo —
    // la base le compose alors elle-même, à son heure à elle.
    label: image ? null : file.name,
    file_path: path, file_name: file.name, mime_type: file.type || null, size_bytes: file.size,
    // Le jour et l'intervention : la base revérifie et rectifie la date
    // d'après l'intervention, elle ne fait pas confiance au navigateur.
    work_date: p.workDate ?? null, time_entry_id: p.timeEntryId ?? null,
  });
  if (insErr) {
    // Le fichier est déjà dans le bucket : sans ce nettoyage, il y resterait
    // sans aucune ligne pour le retrouver ni le supprimer.
    await supabase.storage.from('chantier-docs').remove([path]);
    throw insErr;
  }
  return { image };
}
