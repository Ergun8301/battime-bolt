// Vidéos de formation envoyées directement (lot 13, oct. 2026) : règles pures.
//   npm run test:videos
import {
  BAD_FORMAT, checkVideoFile, formatDuration, formatMo, PLAY_RESIGN_MAX, QUOTA_FULL, quotaFull, quotaLabel, quotaRatio, TOO_BIG, UPLOAD_CANCELLED, UPLOAD_CUT,
  uploadErrorMessage, VIDEO_MAX_BYTES, VIDEO_MIME_BUCKET_SQL, VIDEO_MIME_SQL, VIDEO_MIME_TYPES, VIDEO_QUOTA_BYTES, videoMimeOf, videoPathOk, videoSummary,
} from './training-videos.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
function ok(c: boolean, msg: string) { if (!c) throw new Error(msg); }

/** La migration, trouvée par son suffixe. */
function migration(): string {
  const dir = new URL('../../migrations/', import.meta.url);
  for (const e of Deno.readDirSync(dir)) if (e.name.endsWith('_lot13_videos_envoi_direct.sql')) return Deno.readTextFileSync(new URL(e.name, dir));
  throw new Error('migration *_lot13_videos_envoi_direct.sql introuvable');
}

const MO = 1024 * 1024;
const L = { maxBytes: VIDEO_MAX_BYTES, quotaBytes: VIDEO_QUOTA_BYTES, usedBytes: 23 * MO };

Deno.test('les limites et les types sont ceux de la migration (jumeaux)', () => {
  const sql = migration();
  eq(VIDEO_MAX_BYTES, 52428800, '50 Mo = 52 428 800 octets');
  eq(VIDEO_QUOTA_BYTES, 104857600, '100 Mo = 104 857 600 octets');
  ok(sql.includes(`VALUES ('formations', 'formations', false, 52428800, ${VIDEO_MIME_BUCKET_SQL})`), 'bucket : 50 Mo et types de VIDEO_MIME_BUCKET_SQL, mot pour mot');
  ok(sql.includes('SELECT 104857600::bigint'), 'quota : 104857600 dans training_video_quota_bytes');
  ok(sql.includes(`CHECK (mime_type IN ${VIDEO_MIME_SQL})`), 'contrainte de la table : même liste');
  ok((sql.match(new RegExp(VIDEO_MIME_SQL.replace(/[()]/g, '\\$&'), 'g')) || []).length >= 3, 'même liste dans la contrainte, start_training_video et publish_training_video');
  eq(VIDEO_MIME_SQL, `(${VIDEO_MIME_TYPES.map((t) => `'${t}'`).join(', ')})`, 'VIDEO_MIME_SQL = VIDEO_MIME_TYPES');
  eq(VIDEO_MIME_BUCKET_SQL, `ARRAY[${VIDEO_MIME_TYPES.map((t) => `'${t}'`).join(', ')}]`, 'VIDEO_MIME_BUCKET_SQL = VIDEO_MIME_TYPES');
});

Deno.test('type : celui du navigateur, sinon l’extension ; jamais une image ou un PDF', () => {
  eq(videoMimeOf('a.mp4', 'video/mp4'), 'video/mp4', 'mp4');
  eq(videoMimeOf('IMG_0001.MOV', 'video/quicktime'), 'video/quicktime', 'mov de l’iPhone');
  eq(videoMimeOf('x.webm', 'video/webm;codecs=vp8'), 'video/webm', 'webm avec codecs');
  eq(videoMimeOf('VIDEO.MOV', ''), 'video/quicktime', 'type vide : extension .MOV');
  eq(videoMimeOf('clip.m4v', 'application/octet-stream'), 'video/mp4', 'octet-stream : extension .m4v');
  eq(videoMimeOf('film.mkv', ''), null, 'mkv refusé');
  eq(videoMimeOf('photo.mp4', 'image/jpeg'), null, 'image déclarée : refusée même nommée .mp4');
  eq(videoMimeOf('doc.pdf', 'application/pdf'), null, 'PDF refusé');
  eq(videoMimeOf('a.avi', 'video/x-msvideo'), null, 'AVI refusé');
  eq(videoMimeOf('a.3gp', 'video/3gpp'), null, '3GP refusé');
  eq(videoMimeOf(null, null), null, 'rien');
});

Deno.test('fichier choisi : refus clair au-delà de 50 Mo, du quota, d’un autre format', () => {
  eq(checkVideoFile({ name: 'a.mp4', type: 'video/mp4', size: 10 * MO }, L), { ok: true, mime: 'video/mp4' }, '10 Mo : accepté');
  eq(checkVideoFile({ name: 'a.mp4', type: 'video/mp4', size: 50 * MO }, { ...L, usedBytes: 0 }), { ok: true, mime: 'video/mp4' }, '50 Mo pile : accepté');
  const big = checkVideoFile({ name: 'a.mov', type: 'video/quicktime', size: 50 * MO + 1 }, { ...L, usedBytes: 0 });
  ok(!big.ok && big.error === TOO_BIG(VIDEO_MAX_BYTES) && big.error.startsWith('Vidéo trop lourde : 50 Mo maximum.'), `50 Mo + 1 octet : « ${!big.ok && big.error} »`);
  const q = checkVideoFile({ name: 'a.mp4', type: 'video/mp4', size: 31 * MO }, { ...L, usedBytes: 70 * MO });
  ok(!q.ok && q.error === QUOTA_FULL(70 * MO, VIDEO_QUOTA_BYTES) && q.error.includes('70 Mo utilisés sur 100 Mo'), `quota : « ${!q.ok && q.error} »`);
  eq(checkVideoFile({ name: 'a.mp4', type: 'video/mp4', size: 30 * MO }, { ...L, usedBytes: 70 * MO }).ok, true, '30 Mo avec 70 utilisés : 100 pile, accepté');
  const f = checkVideoFile({ name: 'a.pdf', type: 'application/pdf', size: 1 }, L);
  ok(!f.ok && f.error === BAD_FORMAT, 'PDF : format refusé');
  const z = checkVideoFile({ name: 'a.mp4', type: 'video/mp4', size: 0 }, L);
  ok(!z.ok && /vide/.test(z.error), 'fichier vide');
  ok(quotaFull({ ...L, usedBytes: 100 * MO }) && quotaFull({ ...L, usedBytes: 140 * MO }) && !quotaFull({ ...L, usedBytes: 99 * MO }), 'quota plein dès 100 Mo (et au-delà)');
});

Deno.test('affichage : Mo, jauge, durée, résumé', () => {
  eq(formatMo(23 * MO), '23 Mo', '23 Mo');
  eq(formatMo(2.44 * MO), '2,4 Mo', 'virgule française sous 10 Mo');
  eq(formatMo(0), '0 Mo', '0');
  eq(formatMo(300 * 1024), '0,3 Mo', '300 Ko');
  eq(formatMo(52428800), '50 Mo', '50 Mo');
  eq(quotaLabel(23 * MO, 100 * MO), '23 Mo utilisés sur 100 Mo', 'jauge');
  eq(quotaRatio(23 * MO, 100 * MO), 0.23, 'ratio');
  eq(quotaRatio(140 * MO, 100 * MO), 1, 'ratio plafonné à 1');
  eq(quotaRatio(1, 0), 1, 'quota nul : plein');
  eq(formatDuration(45), '45 s', '45 s');
  eq(formatDuration(130), '2 min 10', '2 min 10');
  eq(formatDuration(120), '2 min', '2 min');
  eq(formatDuration(3720), '1 h 02', '1 h 02');
  eq(formatDuration(Infinity), null, 'durée inconnue (WebM du navigateur)');
  eq(formatDuration(null), null, 'null');
  eq(videoSummary({ duration_s: 130, size_bytes: 38 * MO }), 'Vidéo · 2 min 10 · 38 Mo', 'résumé');
  eq(videoSummary({ duration_s: null, size_bytes: null }), 'Vidéo', 'résumé minimal');
});

Deno.test('chemin : seulement « {entreprise}/{uuid} » de l’entreprise', () => {
  const co = 'c0000000-0000-0000-0000-0000000000aa';
  ok(videoPathOk(co, `${co}/0b5e8f9a-1234-4cde-9f00-aabbccddeeff`), 'chemin valide');
  ok(!videoPathOk(co, `c0000000-0000-0000-0000-0000000000bb/0b5e8f9a-1234-4cde-9f00-aabbccddeeff`), 'autre entreprise');
  ok(!videoPathOk(co, `${co}/../x`) && !videoPathOk(co, `${co}/w1/a.pdf`) && !videoPathOk(co, null) && !videoPathOk(null, `${co}/x`), 'autres chemins refusés');
});

Deno.test('envoi : messages clairs (coupure, annulation, trop lourd, format, expiré)', () => {
  eq(uploadErrorMessage({ kind: 'network' }), UPLOAD_CUT, 'réseau coupé');
  eq(uploadErrorMessage({ kind: 'timeout' }), UPLOAD_CUT, 'délai');
  eq(uploadErrorMessage({ status: 0 }), UPLOAD_CUT, 'statut 0');
  eq(uploadErrorMessage({ kind: 'abort' }), UPLOAD_CANCELLED, 'Annuler');
  ok(uploadErrorMessage({ status: 413, body: { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' } }).startsWith('Vidéo trop lourde'), '413');
  ok(uploadErrorMessage({ status: 400, body: { error: 'invalid_mime_type', message: 'mime type video/x-matroska is not supported' } }) === BAD_FORMAT, 'type refusé par le bucket');
  ok(/touchez « Ajouter » à nouveau/.test(uploadErrorMessage({ status: 400, body: { error: 'InvalidSignature', message: 'jwt expired' } })), 'jeton expiré');
  ok(/vient de se terminer/.test(uploadErrorMessage({ status: 409, body: { error: 'Duplicate', message: 'The resource already exists' } })), 'déjà là');
  eq(uploadErrorMessage({ status: 500, body: {} }), 'L’envoi a échoué. Réessayez.', 'autre');
  eq(PLAY_RESIGN_MAX, 1, 'une seule re-signature avant « lecture impossible » (pas de boucle)');
});
