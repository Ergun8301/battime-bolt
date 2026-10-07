// Envoi d'un document de chantier (bouton « Documents »), partagé entre
// l'écran Documents (components/chantier-documents.tsx) et l'Assistant BEMEXO
// (lot 3 bis, pièces jointes). Code sorti tel quel : un seul chemin.
import { supabase } from '@/lib/supabase';

export const DOC_MAX_BYTES = 15 * 1024 * 1024;

export async function uploadWorksiteDocument(p: {
  companyId: string; userId: string; worksiteId: string; file: File; workDate?: string | null; timeEntryId?: string | null;
  /** Lot 7 : catégorie (facture payée, devis, réserve…) et nom lisible, posés par l'assistant. */
  category?: string | null; label?: string | null;
}): Promise<{ image: boolean; id: string; path: string }> {
  const { file } = p;
  if (file.size > DOC_MAX_BYTES) throw new Error('Fichier trop lourd (15 Mo max).');
  // Le classement suit le TYPE du fichier, jamais le bouton cliqué.
  const image = (file.type || '').startsWith('image/');
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `${p.companyId}/${p.worksiteId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from('chantier-docs').upload(path, file, { contentType: file.type || undefined });
  if (upErr) throw upErr;
  const { data: row, error: insErr } = await supabase.from('documents').insert({
    company_id: p.companyId, worksite_id: p.worksiteId, uploaded_by: p.userId,
    // Nom : celui du fichier pour un document choisi, RIEN pour une photo —
    // la base le compose alors elle-même, à son heure à elle.
    label: p.label ?? (image ? null : file.name),
    file_path: path, file_name: file.name, mime_type: file.type || null, size_bytes: file.size,
    // Le jour et l'intervention : la base revérifie et rectifie la date
    // d'après l'intervention, elle ne fait pas confiance au navigateur.
    work_date: p.workDate ?? null, time_entry_id: p.timeEntryId ?? null,
    // La colonne n'est nommée que si on a une catégorie : l'envoi reste celui
    // d'hier tant que la migration du lot 7 n'est pas appliquée.
    ...(p.category ? { category: p.category } : {}),
  }).select('id').single();
  if (insErr) {
    // Le fichier est déjà dans le bucket : sans ce nettoyage, il y resterait
    // sans aucune ligne pour le retrouver ni le supprimer.
    await supabase.storage.from('chantier-docs').remove([path]);
    throw insErr;
  }
  return { image, id: (row as { id: string }).id, path };
}

/** Retire un document (même geste que la corbeille de « Documents ») : ligne puis fichier. */
export async function removeWorksiteDocument(id: string, path: string) {
  const { error } = await supabase.from('documents').delete().eq('id', id).select('id');
  if (error) throw error;
  await supabase.storage.from('chantier-docs').remove([path]);
}

/**
 * Lot 11 — photo prise sur le chantier, réduite AVANT l'envoi (~1600 px, JPEG).
 * Une photo de téléphone pèse 3 à 6 Mo ; en 4G sur un chantier, c'est la
 * différence entre « envoyé » et « ça tourne ». En cas de doute (format que le
 * navigateur ne sait pas lire, image déjà petite), on envoie l'original : la
 * réduction ne doit jamais empêcher l'envoi.
 */
export async function downscaleImage(file: File, maxSide = 1600, quality = 0.85): Promise<File> {
  const type = file.type || '';
  if (!type.startsWith('image/') || /gif|svg/.test(type) || typeof createImageBitmap !== 'function') return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && type === 'image/jpeg' && file.size <= 1.5 * 1024 * 1024) { bmp.close(); return file; }
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bmp.close(); return file; }
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob || (scale === 1 && blob.size >= file.size)) return file;
    const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}
