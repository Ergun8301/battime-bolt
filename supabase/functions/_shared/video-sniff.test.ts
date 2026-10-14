// Alerte HEVC (lot 14, oct. 2026) : détection du codec par lecture des boîtes MP4 / MOV.
//   npm run test:enregistreur
import { HEVC_ALERT, HEVC_KEEP, HEVC_TIP_NO_REC, HEVC_TIP_REC, sniffVideoCodec } from './video-sniff.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
function ok(c: boolean, msg: string) { if (!c) throw new Error(msg); }

const MO = 1024 * 1024;
const enc = new TextEncoder();
const u32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((s, x) => s + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
/** Une boîte : taille (4) + type (4) + contenu. */
const box = (type: string, ...payload: Uint8Array[]) => { const body = cat(...payload); return cat(u32(8 + body.length), enc.encode(type), body); };
/** Une entrée d'échantillon : taille + format + 78 octets de décor. */
const entry = (fmt: string) => cat(u32(86), enc.encode(fmt), new Uint8Array(78));
const stsd = (...formats: string[]) => box('stsd', u32(0), u32(formats.length), ...formats.map(entry));
/** moov > trak > mdia > minf > stbl > stsd, une piste par table. */
const moovOf = (...tables: string[][]) => box('moov', box('mvhd', new Uint8Array(100)),
  ...tables.map((f) => box('trak', box('tkhd', new Uint8Array(84)), box('mdia', box('mdhd', new Uint8Array(24)), box('minf', box('stbl', stsd(...f)))))));
const ftyp = (brand = 'qt  ') => box('ftyp', enc.encode(brand), u32(0), enc.encode(brand));
const mdat = (bytes: number, fill = 0) => box('mdat', new Uint8Array(bytes).fill(fill));

/** Un « fichier » en mémoire et le journal de ses lectures. */
function source(bytes: Uint8Array) {
  const reads: [number, number][] = [];
  return { reads, size: bytes.length, read: async (s: number, e: number) => { reads.push([s, e]); return bytes.slice(s, e); } };
}
const sniff = async (bytes: Uint8Array) => { const s = source(bytes); return { codec: await sniffVideoCodec(s.read, s.size), reads: s.reads }; };

Deno.test('.mov d’iPhone : moov APRÈS un mdat de 3 Mo, hvc1 → hevc', async () => {
  const file = cat(ftyp(), mdat(3 * MO), moovOf(['hvc1'], ['mp4a']));
  const { codec, reads } = await sniff(file);
  eq(codec, 'hevc', 'hvc1');
  const mdatStart = ftyp().length, mdatEnd = mdatStart + 8 + 3 * MO;
  // Seul l'en-tête de la boîte (16 octets lus à son début) est lu : jamais son contenu.
  ok(reads.every(([s, e]) => e <= mdatStart || s >= mdatEnd || (s === mdatStart && e - s <= 16)), 'aucune lecture du contenu de mdat');
  ok(reads.every(([s, e]) => e - s <= 4 * MO), 'jamais plus de 4 Mo par lecture');
  ok(reads.length <= 64 + 1, 'quelques petites lectures seulement');
});

Deno.test('hev1, moov avant mdat, dolby vision : hevc', async () => {
  eq((await sniff(cat(ftyp(), mdat(3 * MO), moovOf(['hev1'])))).codec, 'hevc', 'hev1');
  eq((await sniff(cat(ftyp(), moovOf(['hvc1']), mdat(2 * MO)))).codec, 'hevc', 'moov au début');
  eq((await sniff(cat(ftyp('isom'), moovOf(['dvh1']), mdat(1000)))).codec, 'hevc', 'dvh1');
  eq((await sniff(cat(ftyp('isom'), moovOf(['dvhe']), mdat(1000)))).codec, 'hevc', 'dvhe');
});

Deno.test('autres codecs : h264, autre, webm', async () => {
  eq((await sniff(cat(ftyp('isom'), mdat(2 * MO), moovOf(['avc1'])))).codec, 'h264', 'avc1');
  eq((await sniff(cat(ftyp('isom'), moovOf(['avc3']), mdat(1000)))).codec, 'h264', 'avc3');
  eq((await sniff(cat(ftyp('isom'), moovOf(['av01']), mdat(1000)))).codec, 'autre', 'av01');
  eq((await sniff(cat(ftyp('isom'), moovOf(['vp09']), mdat(1000)))).codec, 'autre', 'vp09');
  eq((await sniff(cat(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), new Uint8Array(4096)))).codec, 'autre', 'WebM (EBML)');
  eq((await sniff(cat(ftyp('isom'), moovOf(['jpeg']), mdat(1000)))).codec, 'inconnu', 'format inconnu');
});

Deno.test('plusieurs pistes : l’audio est ignoré, hevc l’emporte', async () => {
  eq((await sniff(cat(ftyp(), mdat(5000), moovOf(['mp4a'], ['hvc1'])))).codec, 'hevc', 'audio mp4a avant la vidéo hvc1');
  eq((await sniff(cat(ftyp(), mdat(5000), moovOf(['sowt'], ['lpcm'], ['ac-3'], ['alac'])))).codec, 'inconnu', 'audio seul');
  eq((await sniff(cat(ftyp(), mdat(5000), moovOf(['avc1'], ['hvc1'])))).codec, 'hevc', 'les deux : hevc l’emporte');
  eq((await sniff(cat(ftyp(), mdat(5000), moovOf(['mp4a', 'avc1'])))).codec, 'h264', 'plusieurs entrées dans une même table');
});

Deno.test('« hvc1 » écrit ailleurs que dans stsd : pas hevc', async () => {
  // dans mdat (jamais lu), même avec un vrai moov H.264
  eq((await sniff(cat(ftyp(), mdat(2 * MO, 0x68), moovOf(['avc1'])))).codec, 'h264', 'mdat plein de « h »');
  const hvcInMdat = box('mdat', enc.encode('hvc1stsd....hvc1'), new Uint8Array(1000));
  eq((await sniff(cat(ftyp(), hvcInMdat, moovOf(['avc1'])))).codec, 'h264', 'hvc1 dans mdat');
  // dans moov mais hors d'une table stsd
  const hors = box('moov', box('udta', enc.encode('hvc1 hvc1 hev1')));
  eq((await sniff(cat(ftyp(), hors))).codec, 'inconnu', 'hvc1 dans un commentaire de moov');
});

Deno.test('fichiers louches : « inconnu », jamais d’exception', async () => {
  eq((await sniff(new Uint8Array(4096))).codec, 'inconnu', 'octets nuls');
  eq((await sniff(new Uint8Array([1, 2, 3, 4, 5]))).codec, 'inconnu', '5 octets');
  eq((await sniff(new Uint8Array(0))).codec, 'inconnu', 'vide');
  eq((await sniff(cat(u32(4), enc.encode('free'), new Uint8Array(100)))).codec, 'inconnu', 'taille de boîte < 8');
  eq((await sniff(cat(u32(0), enc.encode('mdat'), new Uint8Array(100)))).codec, 'inconnu', 'taille 0 : jusqu’à la fin, pas de moov');
  eq((await sniff(cat(u32(1), enc.encode('mdat'), u32(0), u32(120), new Uint8Array(104)))).codec, 'inconnu', 'taille 64 bits sans moov');
  eq((await sniff(cat(u32(1), enc.encode('mdat'), u32(1), u32(0), new Uint8Array(104)))).codec, 'inconnu', 'taille 64 bits énorme');
  eq((await sniff(cat(u32(1), enc.encode('mdat'), u32(0), u32(8), new Uint8Array(104)))).codec, 'inconnu', 'taille 64 bits trop petite');
  eq((await sniff(cat(u32(9_999_999), enc.encode('moov'), new Uint8Array(100)))).codec, 'inconnu', 'boîte plus grande que le fichier');
  eq((await sniff(cat(ftyp(), box('moov', new Uint8Array(0))))).codec, 'inconnu', 'moov vide');
  // moov tronqué au milieu d'une table : pas d'exception
  const trunc = moovOf(['hvc1']); const cut = trunc.slice(0, trunc.length - 60);
  eq((await sniff(cat(ftyp(), cut.length >= 8 ? cat(u32(cut.length), cut.slice(4)) : cut))).codec, 'hevc', 'moov coupé APRÈS le premier format : lu quand même');
  // Plus de 64 boîtes avant moov
  let many = ftyp(); for (let i = 0; i < 70; i++) many = cat(many, box('free', new Uint8Array(4)));
  eq((await sniff(cat(many, moovOf(['hvc1'])))).codec, 'inconnu', 'plus de 64 boîtes');
  let sixty = ftyp(); for (let i = 0; i < 40; i++) sixty = cat(sixty, box('free', new Uint8Array(4)));
  eq((await sniff(cat(sixty, moovOf(['hvc1'])))).codec, 'hevc', '41 boîtes puis moov : lu');
  // Lecture qui échoue
  eq(await sniffVideoCodec(() => Promise.reject(new Error('lecture impossible')), 1000), 'inconnu', 'lecture en erreur');
  eq(await sniffVideoCodec(() => { throw new Error('synchrone'); }, 1000), 'inconnu', 'lecture qui lève');
  eq(await sniffVideoCodec(async () => new Uint8Array(3), 1000), 'inconnu', 'lecture trop courte');
});

Deno.test('lectures : jamais dans mdat, jamais plus de 4 Mo, moov de 5 Mo coupé à 4 Mo', async () => {
  const gros = cat(ftyp(), box('moov', box('free', new Uint8Array(5 * MO)), box('trak', box('mdia', box('minf', box('stbl', stsd('hvc1')))))), mdat(1000));
  const { codec, reads } = await sniff(gros);
  eq(codec, 'inconnu', 'hvc1 après les 4 premiers Mo de moov : non vu (limite assumée)');
  ok(reads.every(([s, e]) => e - s <= 4 * MO), 'aucune lecture au-delà de 4 Mo');
  const gros2 = cat(ftyp(), box('moov', box('trak', box('mdia', box('minf', box('stbl', stsd('hvc1'))))), box('free', new Uint8Array(5 * MO))), mdat(1000));
  eq((await sniff(gros2)).codec, 'hevc', 'hvc1 dans les 4 premiers Mo de moov : vu');
});

Deno.test('textes exacts', () => {
  eq(HEVC_ALERT, 'Cette vidéo est au format HEVC (le format récent des iPhone). Elle peut ne pas se lire sur certains téléphones Android ou ordinateurs.', 'alerte');
  eq(HEVC_TIP_REC, 'Conseil : touchez « Changer de vidéo », puis « Filmer », qui produit un format lisible partout.', 'conseil avec l’enregistreur');
  eq(HEVC_TIP_NO_REC, 'Conseil : sur l’iPhone, choisissez Réglages > Appareil photo > Formats > « Le plus compatible », puis filmez à nouveau.', 'conseil sans le bouton');
  eq(HEVC_KEEP, 'Vous pouvez quand même ajouter cette vidéo.', 'on peut quand même ajouter');
});
