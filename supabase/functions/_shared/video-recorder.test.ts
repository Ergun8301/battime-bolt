// « Filmer dans BEMEXO » (lot 14, oct. 2026) : règles pures de l'enregistreur.
//   npm run test:enregistreur
import {
  baseMime, estimateRate, formatClock, pickRecorderMime, REC_ABORT, REC_AUDIO_BPS, REC_AUTO_SIZE, REC_AUTO_TIME, REC_BACK, REC_BUTTON, REC_COUNTDOWN, REC_COUNTDOWN_SECONDS,
  REC_CUT, REC_FAILED, REC_HINT, REC_MAX_LABEL, REC_MAX_SECONDS, REC_MIME_CANDIDATES, REC_MIN_ROOM_BYTES, REC_NO_GPS, REC_OPENING, REC_READY, REC_RUNNING, REC_START, REC_STOP,
  REC_TIMESLICE_MS, REC_VIDEO_BPS, recorderAvailable, recorderCapBytes, recorderErrorMessage, recorderFileName, stopDecision,
} from './video-recorder.ts';
import { VIDEO_MAX_BYTES, VIDEO_QUOTA_BYTES } from './training-videos.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
function ok(c: boolean, msg: string) { if (!c) throw new Error(msg); }

const MO = 1024 * 1024;
const L = { maxBytes: VIDEO_MAX_BYTES, quotaBytes: VIDEO_QUOTA_BYTES, usedBytes: 0 };

Deno.test('type de fichier : l’ordre exact, jamais « video/mp4 » seul', () => {
  eq([...REC_MIME_CANDIDATES], [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1',
    'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm',
  ], 'candidats');
  ok(!(REC_MIME_CANDIDATES as readonly string[]).includes('video/mp4'), '« video/mp4 » seul n’est pas un candidat');
  // Chromium répond oui à « video/mp4 » nu alors que le fichier serait du VP9 dans du MP4 : refusé.
  eq(pickRecorderMime((t) => t === 'video/mp4'), null, '« video/mp4 » nu refusé même si le navigateur dit oui');
  eq(pickRecorderMime((t) => t === 'video/mp4' || t === 'video/webm;codecs=vp8,opus'), 'video/webm;codecs=vp8,opus', 'Chromium sans H.264 : WebM VP8');
  // Safari : seul « video/mp4;codecs=avc1 » est vrai.
  eq(pickRecorderMime((t) => t === 'video/mp4;codecs=avc1'), 'video/mp4;codecs=avc1', 'Safari simulé : MP4 H.264');
  eq(pickRecorderMime(() => true), 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'tout est vrai : le premier');
  eq(pickRecorderMime(() => false), null, 'rien de vrai : null');
  eq(pickRecorderMime((t) => { if (t.startsWith('video/mp4')) throw new Error('boum'); return t === 'video/webm;codecs=vp9,opus'; }), 'video/webm;codecs=vp9,opus', 'isSupported qui lève = faux, candidat suivant');
  eq(pickRecorderMime((t) => t === 'video/webm'), 'video/webm', 'dernier recours : WebM nu');
});

Deno.test('type de base : coupé au « ; », minuscule, seulement MP4 ou WebM', () => {
  eq(baseMime('video/webm;codecs=vp8,opus'), 'video/webm', 'webm');
  eq(baseMime('VIDEO/MP4; codecs=avc1'), 'video/mp4', 'mp4, majuscules');
  eq(baseMime('video/mp4'), 'video/mp4', 'sans codec');
  eq(baseMime('video/x-matroska'), null, 'autre');
  eq(baseMime(''), null, 'vide');
  eq(baseMime(null), null, 'null');
  eq(baseMime(undefined), null, 'undefined');
});

Deno.test('plafond d’octets : le plus petit de 50 Mo et de la place restante, moins 6 %', () => {
  eq(recorderCapBytes(L), 49283072, '50 Mo × 0,94 = 49 283 072');
  eq(recorderCapBytes({ ...L, usedBytes: 90 * MO }), Math.floor(10 * MO * 0.94), 'place restante plus petite (10 Mo)');
  eq(recorderCapBytes({ ...L, usedBytes: 100 * MO }), 0, 'quota plein : 0');
  eq(recorderCapBytes({ ...L, usedBytes: 120 * MO }), 0, 'quota dépassé : jamais négatif');
  eq(recorderCapBytes({ maxBytes: 400000, quotaBytes: VIDEO_QUOTA_BYTES, usedBytes: 0 }), 376000, 'plafond de fichier réduit (test navigateur)');
  ok(recorderAvailable(L), 'place suffisante');
  ok(!recorderAvailable({ ...L, usedBytes: 100 * MO - Math.floor(1.9 * MO) }), '1,9 Mo restants : non');
  ok(recorderAvailable({ ...L, usedBytes: 100 * MO - REC_MIN_ROOM_BYTES }), '2 Mo restants : oui');
  ok(!recorderAvailable({ ...L, usedBytes: 100 * MO }), 'quota plein : non');
  ok(!recorderAvailable({ maxBytes: MO, quotaBytes: VIDEO_QUOTA_BYTES, usedBytes: 0 }), 'fichier limité à 1 Mo : non');
});

Deno.test('cohérence : le débit nominal sur 4 minutes tient sous le plafond de 50 Mo', () => {
  const nominal = (REC_VIDEO_BPS + REC_AUDIO_BPS) / 8; // octets par seconde
  eq(nominal, 195500, '195 500 octets par seconde');
  ok(nominal * REC_MAX_SECONDS < recorderCapBytes(L), `${nominal * REC_MAX_SECONDS} octets en 4 min < ${recorderCapBytes(L)}`);
  ok(Math.abs(nominal * 60 / MO - 11.2) < 0.05, 'environ 11,2 Mo par minute');
  eq([REC_MAX_SECONDS, REC_COUNTDOWN_SECONDS, REC_TIMESLICE_MS], [240, 30, 1000], '4 minutes, compte à rebours sous 30 s, un morceau par seconde');
});

Deno.test('débit récent : octets par seconde sur les 5 dernières secondes', () => {
  eq(estimateRate([]), 0, 'aucun point');
  eq(estimateRate([{ t: 1, bytes: 100 }]), 0, 'un seul point');
  eq(estimateRate([{ t: 1, bytes: 0 }, { t: 2, bytes: 200000 }]), 200000, 'deux points');
  // Début lent (10 000 o/s), puis 300 000 o/s sur les 5 dernières secondes.
  const s = [{ t: 0, bytes: 0 }, { t: 1, bytes: 10000 }, { t: 2, bytes: 20000 }, { t: 3, bytes: 30000 }, { t: 4, bytes: 40000 }, { t: 5, bytes: 50000 },
    { t: 6, bytes: 350000 }, { t: 7, bytes: 650000 }, { t: 8, bytes: 950000 }, { t: 9, bytes: 1250000 }, { t: 10, bytes: 1550000 }];
  eq(estimateRate(s), (1550000 - 50000) / 5, 'seule la fenêtre de 5 s compte');
  eq(estimateRate(s, 2), 300000, 'fenêtre de 2 s');
  eq(estimateRate([{ t: 3, bytes: 5 }, { t: 3, bytes: 9 }]), 0, 'même instant : 0, pas de division par zéro');
});

Deno.test('arrêt automatique : 4 minutes, plafond d’octets avec un morceau d’avance, compte à rebours', () => {
  const cap = 49283072;
  eq(stopDecision({ bytes: 1000, elapsedS: 10, rate: 195500 }, cap), { stop: false, reason: null, remainingS: 240 - 10 }, 'avant tout seuil : le temps est le plus proche');
  eq(stopDecision({ bytes: 0, elapsedS: 0, rate: 0 }, cap), { stop: false, reason: null, remainingS: 240 }, 'au début : 240 s, débit inconnu');
  eq(stopDecision({ bytes: 5e7 / 2, elapsedS: 239.5, rate: 1000 }, cap).stop, false, 'pas encore 240 s');
  eq(stopDecision({ bytes: 1, elapsedS: 240, rate: 1 }, cap), { stop: true, reason: 'time', remainingS: 0 }, 'à 240 s : temps');
  eq(stopDecision({ bytes: 1, elapsedS: 300, rate: 1 }, cap).reason, 'time', 'au-delà de 240 s : temps');
  // Taille : on anticipe un morceau (1 s) au débit récent.
  eq(stopDecision({ bytes: cap - 1_000_001, elapsedS: 100, rate: 1_000_000 }, cap).stop, false, 'il reste de la place pour le prochain morceau');
  eq(stopDecision({ bytes: cap - 1_000_000, elapsedS: 100, rate: 1_000_000 }, cap), { stop: true, reason: 'size', remainingS: 1 }, 'le prochain morceau dépasserait : taille');
  eq(stopDecision({ bytes: cap, elapsedS: 100, rate: 0 }, cap), { stop: true, reason: 'size', remainingS: 0 }, 'plafond atteint, débit nul');
  eq(stopDecision({ bytes: 0, elapsedS: 0, rate: 0 }, 0), { stop: true, reason: 'size', remainingS: 0 }, 'plafond nul (quota plein) : arrêt immédiat');
  eq(stopDecision({ bytes: cap, elapsedS: 240, rate: 1 }, cap).reason, 'time', 'à égalité, le temps est prioritaire');
  // Compte à rebours : le plus proche des deux.
  eq(stopDecision({ bytes: 0, elapsedS: 215, rate: 100 }, cap).remainingS, 25, 'par le temps : 25 s');
  eq(stopDecision({ bytes: cap - 1_500_000, elapsedS: 60, rate: 500_000 }, cap).remainingS, 3, 'par la taille : 3 s');
  eq(stopDecision({ bytes: 0, elapsedS: 239.2, rate: 0 }, cap).remainingS, 1, 'arrondi vers le haut');
});

Deno.test('nom du fichier, minuteur', () => {
  const d = new Date(2026, 9, 14, 9, 30, 12); // heure locale : 14/10/2026 09:30
  eq(recorderFileName(d, 'video/mp4'), 'filmer-bemexo-20261014-0930.mp4', 'nom mp4');
  eq(recorderFileName(d, 'video/webm'), 'filmer-bemexo-20261014-0930.webm', 'nom webm');
  eq(recorderFileName(new Date(2026, 0, 2, 3, 4), 'video/webm'), 'filmer-bemexo-20260102-0304.webm', 'zéros devant');
  eq([formatClock(0), formatClock(42), formatClock(185), formatClock(240), formatClock(59.9), formatClock(-3), formatClock(NaN)], ['0:00', '0:42', '3:05', '4:00', '0:59', '0:00', '0:00'], 'minuteur');
});

Deno.test('textes exacts', () => {
  eq(REC_BUTTON, 'Filmer dans BEMEXO', 'bouton');
  eq(REC_HINT, '« Filmer dans BEMEXO » : image 720p, jusqu’à 4 minutes, lisible partout. « Filmer » : l’appareil photo du téléphone, qualité maximale mais fichier plus lourd.', 'aide');
  eq(REC_OPENING, 'Ouverture de la caméra…', 'ouverture');
  eq(REC_READY, 'Cadrez, puis touchez « Démarrer ». Tenez le téléphone dans le même sens pendant toute la prise.', 'prêt');
  eq([REC_START, REC_STOP, REC_ABORT, REC_BACK], ['Démarrer', 'Arrêter', 'Abandonner', 'Annuler'], 'boutons');
  eq(REC_RUNNING, 'Enregistrement en cours', 'en cours');
  eq(REC_MAX_LABEL, 'Durée maximale : 4 min', 'durée maximale');
  eq(REC_COUNTDOWN(12), 'Arrêt automatique dans 12 s', 'compte à rebours');
  eq(REC_AUTO_SIZE, 'L’enregistrement s’est arrêté tout seul : la taille maximale est atteinte. La vidéo est gardée.', 'arrêt taille');
  eq(REC_AUTO_TIME, 'L’enregistrement s’est arrêté tout seul : 4 minutes atteintes. La vidéo est gardée.', 'arrêt durée');
  eq(REC_CUT, 'L’enregistrement s’est arrêté (caméra interrompue). Ce qui a été filmé est gardé.', 'caméra coupée');
  eq(REC_FAILED, 'L’enregistrement a échoué. Réessayez, ou touchez « Filmer ».', 'échec');
  eq(REC_NO_GPS, 'Filmée dans BEMEXO : aucune position GPS n’est ajoutée à la vidéo.', 'GPS');
});

Deno.test('refus d’autorisation et pannes : un message clair par cas', () => {
  const refus = 'L’appareil photo ou le micro est refusé. Autorisez-les pour BEMEXO dans les réglages du navigateur (sur iPhone : le bouton « aA » de la barre d’adresse, puis « Réglages du site »), puis réessayez. Vous pouvez aussi toucher « Filmer » ou « Choisir un fichier ».';
  eq(recorderErrorMessage('NotAllowedError'), refus, 'NotAllowedError');
  eq(recorderErrorMessage('SecurityError'), refus, 'SecurityError');
  const absente = 'Aucune caméra n’a été trouvée sur cet appareil. Touchez « Choisir un fichier ».';
  eq(recorderErrorMessage('NotFoundError'), absente, 'NotFoundError');
  eq(recorderErrorMessage('OverconstrainedError'), absente, 'OverconstrainedError');
  const prise = 'La caméra est déjà utilisée par une autre application. Fermez-la, puis réessayez.';
  eq(recorderErrorMessage('NotReadableError'), prise, 'NotReadableError');
  eq(recorderErrorMessage('AbortError'), prise, 'AbortError');
  const autre = 'La caméra n’a pas pu démarrer. Touchez « Filmer » ou « Choisir un fichier ».';
  eq(recorderErrorMessage('TypeError'), autre, 'erreur inconnue');
  eq(recorderErrorMessage(undefined), autre, 'sans nom');
});
