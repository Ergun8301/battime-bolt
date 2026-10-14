// Alerte HEVC (lot 14, oct. 2026) — quel codec vidéo contient un fichier MP4 / MOV
// choisi, lu AVANT l'envoi. Règles PURES (sans DOM) : la lecture des octets est
// passée en paramètre (le navigateur donne `file.slice(...)`), le test donne un
// tampon fabriqué à la main.
//
// Pourquoi lire les « boîtes » : le format de l'image (hvc1 / hev1 = HEVC, avc1 =
// H.264) n'est PAS dans le début du fichier (« ftyp ») mais dans moov > … > stsd.
// Sur un iPhone, moov est probablement APRÈS le gros bloc de données (mdat) : on
// saute mdat par sa taille, sans jamais en lire le contenu, puis on lit moov
// (4 Mo au plus). Non confirmé faute de vrai fichier d'iPhone : voir
// docs/enregistreur-video.md. Ne lève jamais : tout doute = « inconnu » = aucune alerte.

export type VideoCodec = 'hevc' | 'h264' | 'autre' | 'inconnu';

type Read = (start: number, end: number) => Promise<Uint8Array>;

/** Au plus 4 Mo de moov lus. */
const MOOV_MAX = 4 * 1024 * 1024;
/** Au plus 64 boîtes de premier niveau parcourues. */
const BOXES_MAX = 64;
/** Au plus 8 formats par table d'échantillons. */
const ENTRIES_MAX = 8;

const HEVC = new Set(['hvc1', 'hev1', 'dvh1', 'dvhe']);
const H264 = new Set(['avc1', 'avc3']);
const AUTRE = new Set(['av01', 'vp09']);

const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const tag = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

/** Les formats vidéo trouvés dans les tables « stsd » d'un bloc moov (les formats audio ne sont pas retenus). */
function sampleFormats(moov: Uint8Array): string[] {
  const found: string[] = [];
  for (let i = 0; i + 4 <= moov.length; i++) {
    if (moov[i] !== 0x73 || moov[i + 1] !== 0x74 || moov[i + 2] !== 0x73 || moov[i + 3] !== 0x64) continue; // « stsd »
    // stsd : type (i), version+flags (4), nombre d'entrées (4), puis les entrées : taille (4) + format (4) + …
    if (i + 12 > moov.length) break;
    const n = Math.min(u32(moov, i + 8), ENTRIES_MAX);
    let p = i + 12;
    for (let k = 0; k < n && p + 8 <= moov.length; k++) {
      const size = u32(moov, p);
      found.push(tag(moov, p + 4));
      if (size < 8) break;
      p += size;
    }
  }
  return found;
}

/** Le codec de l'image d'un fichier MP4 / MOV ; WebM = « autre ». Ne lève jamais. */
export async function sniffVideoCodec(read: Read, size: number): Promise<VideoCodec> {
  try {
    if (!(size >= 16)) return 'inconnu';
    const head = await read(0, 16);
    if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'autre'; // EBML : WebM
    let o = 0;
    for (let n = 0; n < BOXES_MAX && o + 8 <= size; n++) {
      const h = await read(o, Math.min(o + 16, size));
      if (h.length < 8) return 'inconnu';
      let boxSize = u32(h, 0);
      if (boxSize === 1) {
        if (h.length < 16 || u32(h, 8) !== 0) return 'inconnu'; // taille sur 64 bits : au-delà de 4 Go, hors sujet
        boxSize = u32(h, 12);
      } else if (boxSize === 0) {
        boxSize = size - o;
      }
      if (boxSize < 8 || o + boxSize > size) return 'inconnu';
      if (tag(h, 4) === 'moov') {
        const moov = await read(o, o + Math.min(boxSize, MOOV_MAX));
        const formats = sampleFormats(moov);
        if (formats.some((f) => HEVC.has(f))) return 'hevc';
        if (formats.some((f) => H264.has(f))) return 'h264';
        if (formats.some((f) => AUTRE.has(f))) return 'autre';
        return 'inconnu';
      }
      o += boxSize;
    }
    return 'inconnu';
  } catch {
    return 'inconnu';
  }
}

// ─── Textes ──────────────────────────────────────────────────────────────────
export const HEVC_ALERT = 'Cette vidéo est au format HEVC (le format récent des iPhone). Elle peut ne pas se lire sur certains téléphones Android ou ordinateurs.';
/** L'enregistreur intégré (« Filmer ») est proposé. */
export const HEVC_TIP_REC = 'Conseil : touchez « Changer de vidéo », puis « Filmer », qui produit un format lisible partout.';
export const HEVC_TIP_NO_REC = 'Conseil : sur l’iPhone, choisissez Réglages > Appareil photo > Formats > « Le plus compatible », puis filmez à nouveau.';
export const HEVC_KEEP = 'Vous pouvez quand même ajouter cette vidéo.';
