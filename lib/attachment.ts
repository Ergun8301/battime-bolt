// Pièce jointe de l'Assistant BEMEXO (lot 3 bis) : photo ou PDF.
// Contrôle du type, compression des photos SUR LE TÉLÉPHONE, encodage pour
// l'envoi. Rien n'est stocké à cette étape : le fichier vit dans l'écran
// jusqu'à ce que l'action soit confirmée (ou oubliée).

export const ATTACH_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif';
export const ATTACH_MAX_BYTES = 8 * 1024 * 1024;
const OK = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']);

/** Type réel, y compris HEIC que certains téléphones envoient sans type. */
export function attachmentMime(file: File): string | null {
  const t = (file.type || '').toLowerCase();
  if (OK.has(t)) return t;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'heic') return 'image/heic';
  if (ext === 'heif') return 'image/heif';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return null;
}

export function attachmentError(file: File): string | null {
  if (!attachmentMime(file)) return 'Format non accepté : photo (JPG, PNG, HEIC) ou PDF.';
  return null;
}

/**
 * Photo trop grande → réduite (1600 px, JPEG 80 %). HEIC ou image illisible
 * par le navigateur → envoyée telle quelle. PDF → tel quel.
 */
export async function compressAttachment(file: File): Promise<File> {
  const mime = attachmentMime(file);
  if (!mime || !mime.startsWith('image/') || mime === 'image/heic' || mime === 'image/heif') return file;
  if (file.size < 700 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.8));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...Array.from(buf.subarray(i, i + 0x8000)));
  return btoa(bin);
}

/** Pour l'envoi à la fonction serveur. */
export async function attachmentPayload(file: File): Promise<{ mime: string; base64: string; name: string }> {
  return { mime: attachmentMime(file)!, base64: await fileToBase64(file), name: file.name.slice(0, 120) };
}
