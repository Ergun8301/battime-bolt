// Vidéos de formation envoyées directement (lot 13, oct. 2026) : règles pures.
//   npm run test:videos
import {
  BAD_FORMAT, checkVideoFile, formatDuration, formatMo, leftoverNote, leftoverSummary, PLAY_RESIGN_MAX, QUOTA_FULL, QUOTA_NEAR_RATIO, quotaFull, quotaLabel, quotaNear, quotaRatio, TOO_BIG,
  UPLOAD_CANCELLED, UPLOAD_CUT, uploadErrorMessage, VIDEO_MAX_BYTES, VIDEO_MIME_BUCKET_SQL, VIDEO_MIME_SQL, VIDEO_MIME_TYPES, VIDEO_NEW_PLACES_MAX, VIDEO_QUOTA_BYTES,
  VIDEO_SIGN_SECONDS, VIDEO_WINDOW_HOURS, videoMimeOf, videoPathOk, videoSummary,
  AUDIT_BYTES, AUDIT_LINK, AUDIT_MISSING_NOTE, AUDIT_MISSING_ROW, AUDIT_MISSING_TITLE, AUDIT_MORE, AUDIT_NOTE, AUDIT_ORPHAN_ROW, AUDIT_ORPHANS_NOTE, AUDIT_ORPHANS_TITLE,
  parseFileAudit, shortDate,
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

Deno.test('lien de lecture court ; plafond de nouvelles places et fenêtre : mêmes valeurs dans la migration', () => {
  const sql = migration();
  eq(VIDEO_SIGN_SECONDS, 600, 'lien de lecture : 10 minutes');
  ok(VIDEO_SIGN_SECONDS <= 900, 'lien de lecture court (15 minutes au plus)');
  eq([VIDEO_NEW_PLACES_MAX, VIDEO_WINDOW_HOURS], [3, 3], '3 nouvelles places par tranche de 3 heures');
  // La tranche couvre 15 min (demande de l'URL) + 2 h (validité de l'URL) : jamais moins.
  ok(VIDEO_WINDOW_HOURS * 60 >= 15 + 120, 'la tranche couvre la demande de l’URL et sa validité');
  ok(sql.includes(`v.reserved_at > now() - interval '${VIDEO_WINDOW_HOURS} hours'`), 'la migration compte les places sur cette tranche');
  ok(sql.includes(`ORDER BY v.reserved_at DESC LIMIT ${VIDEO_NEW_PLACES_MAX}) r;`) && sql.includes(`IF v_recent >= ${VIDEO_NEW_PLACES_MAX} THEN`), 'la migration refuse la nouvelle place au-delà du plafond');
  // La place « retirée » ou fermée reste comptée (usage) et une place non publiée ne se retire pas.
  const usage = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.training_video_usage'), sql.indexOf('-- ── 5) Policies du bucket'));
  ok(usage.includes('AND v.published_at IS NULL') && !/archived_at/.test(usage.slice(usage.indexOf('SELECT\n')) ), 'usage : une place retirée (archived_at) reste comptée');
  const archived = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.set_training_video_archived'), sql.indexOf('-- ── 9 bis)'));
  ok(archived.includes('AND v.published_at IS NOT NULL\n    RETURNING v.archived_at INTO v_at;\n  ELSE'), 'retirer : seulement une vidéo publiée');
  const upload = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.training_video_upload_ok'), sql.indexOf('-- Lecture (lien signé)'));
  ok(upload.includes("NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'formations' AND o.name = p_name)"), 'policy d’envoi : refuse un chemin dont le fichier existe déjà');
  ok(!/FOR UPDATE TO|FOR DELETE|FOR ALL/.test(sql.replace(/^--.*$/gm, '').replace(/SELECT[^;]*FOR UPDATE;/g, '')), 'aucune policy UPDATE, DELETE ni ALL');
});

Deno.test('fichiers non terminés : textes clairs', () => {
  eq(leftoverSummary(45 * MO, false), 'Envoi non terminé · 45 Mo · fichier gardé', 'envoi non terminé (place ouverte)');
  eq(leftoverSummary(6 * MO, true), 'Envoi non terminé · 6 Mo · place fermée · fichier gardé', 'envoi non terminé (place fermée)');
  eq(leftoverNote(VIDEO_QUOTA_BYTES), 'Ce fichier est arrivé, mais la vidéo n’a pas été publiée : les salariés ne la voient pas. Le fichier est gardé et compte dans les 100 Mo.', 'explication');
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
  // La jauge n'est montrée qu'à partir de 80 % de la place (décision du patron : formations simplifiées).
  const at = (used: number) => ({ maxBytes: VIDEO_MAX_BYTES, quotaBytes: VIDEO_QUOTA_BYTES, usedBytes: used });
  eq(QUOTA_NEAR_RATIO, 0.8, 'seuil de la jauge : 80 %');
  eq([0, 23 * MO, 79 * MO, 79.9 * MO].map((u) => quotaNear(at(u))), [false, false, false, false], 'sous 80 % : pas de jauge');
  eq([80 * MO, 85 * MO, 100 * MO, 140 * MO].map((u) => quotaNear(at(u))), [true, true, true, true], '80 % et plus (plein compris) : jauge');
  ok(quotaFull(at(100 * MO)) && quotaNear(at(100 * MO)), 'plein : la jauge est aussi montrée');
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

// ─── Lot 14 : fichiers à vérifier (détection seulement) ──────────────────────
const fichier = (n: number, extra: Record<string, unknown> = {}) => ({ kind: 'fichier_sans_formation', video_id: null, title: null, file_path: `c0/aaaaaaaa-0000-4000-8000-00000000000${n}`,
  real_bytes: 5 * MO, occurred_at: '2026-10-12T12:00:00Z', archived: null, total_n: 1, total_bytes: 5 * MO, ...extra });
const manque = (n: number, extra: Record<string, unknown> = {}) => ({ kind: 'formation_sans_fichier', video_id: `v${n}`, title: `Formation ${n}`, file_path: `c0/v${n}`,
  real_bytes: 4 * MO, occurred_at: '2026-10-13T12:00:00Z', archived: false, total_n: 1, total_bytes: 0, ...extra });

Deno.test('fichiers à vérifier : la réponse de la base en deux listes', () => {
  eq(parseFileAudit([]), null, 'tableau vide : rien à montrer');
  eq(parseFileAudit(null), null, 'null');
  eq(parseFileAudit({ kind: 'fichier_sans_formation' }), null, 'ce n’est pas un tableau');
  eq(parseFileAudit('x'), null, 'chaîne');
  eq(parseFileAudit([null, 3, 'x', { kind: 'autre_chose' }]), null, 'lignes inconnues ignorées : rien');
  const a = parseFileAudit([fichier(1), fichier(2, { total_n: 2, total_bytes: 11 * MO }), manque(1), manque(2, { archived: true, total_n: 2 })]);
  ok(!!a, 'deux sortes');
  eq([a!.orphans.length, a!.orphanTotal, a!.orphanBytes, a!.missing.length, a!.missingTotal], [2, 1, 5 * MO, 2, 1], 'les totaux sont ceux de la PREMIÈRE ligne de la sorte');
  const t = parseFileAudit([fichier(1, { total_n: 150, total_bytes: 59411175 }), fichier(2, { total_n: 150, total_bytes: 59411175 }), manque(1, { total_n: 130 })]);
  eq([t!.orphans.length, t!.orphanTotal, t!.orphanBytes, t!.missing.length, t!.missingTotal], [2, 150, 59411175, 1, 130], 'totaux supérieurs aux lignes montrées (100 au plus par sorte)');
  const s = parseFileAudit([fichier(1, { real_bytes: '1048576', total_n: '7', total_bytes: '7340032' })]);
  eq([s!.orphans[0].real_bytes, s!.orphanTotal, s!.orphanBytes], [1048576, 7, 7340032], 'nombres reçus en chaînes (bigint)');
  eq(s!.missing, [], 'une seule sorte : l’autre liste est vide');
  eq(s!.missingTotal, 0, 'et son total vaut 0');
  const u = parseFileAudit([{ kind: 'fichier_sans_formation', file_path: 'c0/x' }]);
  eq(u!.orphans[0], { kind: 'fichier_sans_formation', video_id: null, title: null, file_path: 'c0/x', real_bytes: 0, occurred_at: null, archived: null }, 'champs absents : valeurs neutres');
  eq([u!.orphanTotal, u!.orphanBytes], [1, 0], 'sans total_n ni total_bytes : longueur et somme');
  const k = parseFileAudit([{ kind: 'effacer_tout', file_path: 'c0/x' }, manque(1)]);
  eq(k!.orphans, [], 'un kind inconnu est ignoré');
  eq(parseFileAudit([fichier(1, { total_n: 0, total_bytes: 0 })]), null, 'les deux totaux à 0 : rien à montrer');
});

Deno.test('fichiers à vérifier : textes exacts', () => {
  eq(AUDIT_LINK(9, false), 'Fichiers vidéo à vérifier (9)', 'lien replié');
  eq(AUDIT_LINK(9, true), 'Masquer les fichiers vidéo à vérifier', 'lien déplié');
  eq(AUDIT_NOTE, 'Rien n’est supprimé automatiquement : ces fichiers sont seulement signalés. Pour en retirer un, contactez BEMEXO.', 'note');
  eq(AUDIT_ORPHANS_TITLE(7), 'Fichiers sans formation (7)', 'titre fichiers');
  eq(AUDIT_ORPHANS_NOTE(VIDEO_QUOTA_BYTES), 'Le fichier est dans votre dossier vidéo, mais aucune formation ne l’utilise. Il compte dans les 100 Mo.', 'note fichiers');
  eq(AUDIT_MISSING_TITLE(2), 'Formations dont le fichier manque (2)', 'titre formations');
  eq(AUDIT_MISSING_NOTE, 'Les salariés ne peuvent pas lire ces vidéos : le fichier est introuvable.', 'note formations');
  eq(AUDIT_MORE(1), '+ 1 autre', '+ 1 autre');
  eq(AUDIT_MORE(2), '+ 2 autres', '+ 2 autres');
  eq(AUDIT_BYTES(35 * MO), 'Ensemble : 35 Mo', 'ensemble');
  // Dates à midi UTC : le même jour partout de Paris à Honolulu.
  eq(shortDate('2026-10-12T12:00:00Z'), '12/10', 'date courte');
  eq(shortDate('pas une date'), '', 'date illisible');
  eq(shortDate(null), '', 'date absente');
  // La date et la taille d'abord (le titre de la section dit déjà « Fichiers sans formation »), la référence en fin de ligne.
  eq(AUDIT_ORPHAN_ROW({ real_bytes: 5 * MO, occurred_at: '2026-10-12T12:00:00Z', file_path: 'c0/aaaaaaaa-0000-4000-8000-0000deadbeef' }),
    '12/10 · 5 Mo · réf. deadbeef', 'ligne fichier');
  eq(AUDIT_ORPHAN_ROW({ real_bytes: 1.5 * MO, occurred_at: null, file_path: 'c0/abcdefgh12345678' }), '1,5 Mo · réf. 12345678', 'ligne fichier sans date');
  eq(AUDIT_MISSING_ROW({ title: 'Gestes et postures', occurred_at: '2026-10-13T12:00:00Z', archived: false }), 'Gestes et postures · publiée le 13/10', 'ligne formation');
  eq(AUDIT_MISSING_ROW({ title: 'Ancienne consigne', occurred_at: '2026-10-13T12:00:00Z', archived: true }), 'Ancienne consigne · publiée le 13/10 · retirée', 'ligne formation retirée');
});

Deno.test('fichiers à vérifier : jumelle de la migration (nom de fonction, aucune suppression)', () => {
  const dir = new URL('../../migrations/', import.meta.url);
  let sql = '';
  for (const e of Deno.readDirSync(dir)) if (e.name.endsWith('_videos_fichiers_a_verifier.sql')) sql = Deno.readTextFileSync(new URL(e.name, dir));
  ok(sql.includes('CREATE OR REPLACE FUNCTION public.video_files_audit()'), 'la migration définit video_files_audit()');
  ok(sql.includes("kind text, video_id uuid, title text, file_path text, real_bytes bigint,\n                occurred_at timestamptz, archived boolean, total_n bigint, total_bytes bigint"), 'mêmes colonnes que FileAuditRow + totaux');
  ok(sql.includes("'fichier_sans_formation'::text") && sql.includes("'formation_sans_fichier'::text"), 'mêmes deux sortes');
  const code = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  ok(!/DROP|DELETE|TRUNCATE|CASCADE/i.test(code), 'aucune suppression hors commentaires');
});
