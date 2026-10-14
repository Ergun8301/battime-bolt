// « Filmer » (enregistreur intégré, lot 14, oct. 2026) — les règles PURES de l'enregistreur
// de vidéos de formation (components/training-video-recorder.tsx) : type de
// fichier, plafond d'octets, arrêt automatique, nom du fichier, textes.
// Sans DOM, sans réseau : testé en Deno (video-recorder.test.ts).
//
// Pourquoi ces chiffres : le forfait gratuit limite chaque fichier à 50 Mo
// (training-videos.ts). En 720p à 1,5 Mbit/s + 64 kbit/s de son, une minute pèse
// environ 11,2 Mo : environ 4 minutes tiennent sous le plafond. Le débit
// demandé n'est qu'une CIBLE (une scène agitée dépasse) : l'arrêt automatique
// regarde les octets réellement reçus, pas seulement la durée.
import type { Limits } from './training-videos.ts';

export const REC_WIDTH = 1280, REC_HEIGHT = 720, REC_FPS = 30;
export const REC_VIDEO_BPS = 1_500_000, REC_AUDIO_BPS = 64_000;
/** 4 minutes. */
export const REC_MAX_SECONDS = 240;
/** Le compte à rebours s'affiche sous 30 s. */
export const REC_COUNTDOWN_SECONDS = 30;
/** 6 % de marge sous le plafond d'octets (le dernier morceau, l'en-tête du conteneur). */
export const REC_MARGIN = 0.06;
/** Sous 2 Mo de place restante, l'enregistreur n'est pas proposé. */
export const REC_MIN_ROOM_BYTES = 2 * 1024 * 1024;
/** Octets par seconde du débit demandé (vidéo + son) : 195 500. */
const REC_NOMINAL_BYTES_PER_S = (REC_VIDEO_BPS + REC_AUDIO_BPS) / 8;
/** Le lecteur d'écran n'annonce le compte à rebours qu'à ces paliers (secondes restantes). */
export const REC_ANNOUNCE_AT = [5, 10, REC_COUNTDOWN_SECONDS] as const;
/** Un morceau de fichier reçu par seconde (dataavailable). */
export const REC_TIMESLICE_MS = 1000;
/**
 * Types essayés dans l'ordre. JAMAIS « video/mp4 » seul : Chromium répond oui à
 * isTypeSupported('video/mp4') alors que le fichier serait du VP9 rangé dans du
 * MP4 (illisible sur iPhone). Un codec explicite est exigé.
 */
export const REC_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4;codecs=avc1',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9,opus',
  'video/webm',
] as const;

/** Le premier type accepté par le navigateur, ou null. Un isSupported qui lève compte pour « non ». */
export function pickRecorderMime(isSupported: (t: string) => boolean): string | null {
  for (const t of REC_MIME_CANDIDATES) {
    try { if (isSupported(t)) return t; } catch { /* ce type-là n'est pas utilisable */ }
  }
  return null;
}

/** « video/webm;codecs=vp8,opus » → « video/webm » (le type à annoncer au serveur). */
export function baseMime(t: string | null | undefined): 'video/mp4' | 'video/webm' | null {
  const b = String(t || '').split(';')[0].trim().toLowerCase();
  return b === 'video/mp4' || b === 'video/webm' ? b : null;
}

/** Le plafond d'octets de la prise : le plus petit de « 50 Mo » et « place restante », moins la marge. */
export const recorderCapBytes = (l: Limits): number =>
  Math.max(0, Math.floor(Math.min(l.maxBytes, l.quotaBytes - l.usedBytes) * (1 - REC_MARGIN)));

/** Assez de place pour filmer (au moins 2 Mo) ? */
export const recorderAvailable = (l: Limits): boolean => Math.min(l.maxBytes, l.quotaBytes - l.usedBytes) >= REC_MIN_ROOM_BYTES;

/** Durée réellement possible : 4 minutes au plus, moins quand la place restante est petite (arrondi à 5 s en dessous de 4 min). */
export function recorderMaxSeconds(l: Limits): number {
  const bySize = Math.floor(recorderCapBytes(l) / REC_NOMINAL_BYTES_PER_S);
  return bySize >= REC_MAX_SECONDS ? REC_MAX_SECONDS : Math.floor(bySize / 5) * 5;
}

/** « 40 s », « 2 min », « 2 min 30 s ». */
const durationText = (sec: number): string => (sec < 60 ? `${sec} s` : `${Math.floor(sec / 60)} min${sec % 60 ? ` ${sec % 60} s` : ''}`);

/** Le palier (30, 10 ou 5 s) où en est le compte à rebours : on ne l'annonce à voix haute qu'en changeant de palier. */
export function countdownBand(remainingS: number | null): number | null {
  return remainingS === null ? null : REC_ANNOUNCE_AT.find((t) => remainingS <= t) ?? null;
}

/** Octets par seconde sur les `windowS` dernières secondes. `t` en secondes, `bytes` cumulés. 0 si moins de 2 points. */
export function estimateRate(samples: { t: number; bytes: number }[], windowS = 5): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  const inWindow = samples.filter((s) => s.t >= last.t - windowS);
  if (inWindow.length < 2) return 0;
  const first = inWindow[0];
  const dt = last.t - first.t;
  return dt > 0 ? Math.max(0, (last.bytes - first.bytes) / dt) : 0;
}

/**
 * Faut-il arrêter ? `time` à 4 minutes ; `size` quand le prochain morceau (une seconde
 * au débit récent) ferait passer sous la marge. `time` prioritaire à égalité.
 * `remainingS` : secondes avant l'arrêt automatique (pour le compte à rebours).
 */
export function stopDecision(s: { bytes: number; elapsedS: number; rate: number }, capBytes: number):
  { stop: boolean; reason: 'size' | 'time' | null; remainingS: number | null } {
  const byTime = s.elapsedS >= REC_MAX_SECONDS;
  const bySize = s.bytes + s.rate * (REC_TIMESLICE_MS / 1000) >= capBytes;
  const sizeLeft = s.bytes >= capBytes ? 0 : s.rate > 0 ? (capBytes - s.bytes) / s.rate : Infinity;
  const left = Math.min(REC_MAX_SECONDS - s.elapsedS, sizeLeft);
  return {
    stop: byTime || bySize,
    reason: byTime ? 'time' : bySize ? 'size' : null,
    remainingS: Number.isFinite(left) ? Math.max(0, Math.ceil(left)) : null,
  };
}

/** « filmer-bemexo-20261014-0930.mp4 » (heure locale de l'appareil). */
export function recorderFileName(d: Date, base: 'video/mp4' | 'video/webm'): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `filmer-bemexo-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${base === 'video/mp4' ? 'mp4' : 'webm'}`;
}

/** « 0:42 », « 3:05 ». */
export function formatClock(seconds: number): string {
  const t = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

// ─── Textes ──────────────────────────────────────────────────────────────────
export const REC_OPENING = 'Ouverture de la caméra…';
export const REC_READY = 'Cadrez, puis touchez « Démarrer ». Tenez le téléphone dans le même sens pendant toute la prise.';
export const REC_START = 'Démarrer';
export const REC_STOP = 'Arrêter';
export const REC_ABORT = 'Abandonner';
export const REC_ABORT_ASK = 'Jeter cette prise ?';
export const REC_ABORT_YES = 'Oui, jeter';
export const REC_ABORT_NO = 'Non, continuer';
/** Pas « Annuler » : le formulaire du dessous peut avoir un bouton « Annuler ». */
export const REC_BACK = 'Fermer la caméra';
export const REC_RUNNING = 'Enregistrement en cours';
export const REC_DONE = 'Enregistrement terminé';
export const REC_MAX_LABEL = 'Durée maximale : 4 min';
/** « Durée maximale : environ 40 s » quand la place restante réduit la prise. */
export const recorderMaxLabel = (maxSeconds: number): string => (maxSeconds >= REC_MAX_SECONDS ? REC_MAX_LABEL : `Durée maximale : environ ${durationText(maxSeconds)}`);
export const REC_COUNTDOWN = (n: number) => `Arrêt automatique dans ${n} s`;
export const REC_AUTO_SIZE = 'L’enregistrement s’est arrêté tout seul : la taille maximale est atteinte. La vidéo est gardée.';
export const REC_AUTO_TIME = 'L’enregistrement s’est arrêté tout seul : 4 minutes atteintes. La vidéo est gardée.';
export const REC_CUT = 'L’enregistrement s’est arrêté (caméra interrompue). Ce qui a été filmé est gardé.';
/** Pourquoi la prise s'est arrêtée toute seule, et le message gardé à côté du fichier. */
export type RecAuto = 'size' | 'time' | 'cut';
export const REC_AUTO_TEXT: Record<RecAuto, string> = { size: REC_AUTO_SIZE, time: REC_AUTO_TIME, cut: REC_CUT };
export const REC_FAILED = 'L’enregistrement a échoué. Réessayez, ou touchez « Fichier ».';

/** Refus d'autorisation et pannes de caméra, en français simple. */
export function recorderErrorMessage(name: string | undefined): string {
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'L’appareil photo ou le micro est refusé. Autorisez-les pour BEMEXO dans les réglages du navigateur (sur iPhone : le bouton « aA » de la barre d’adresse, puis « Réglages du site »), puis réessayez. Vous pouvez aussi toucher « Fichier ».';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Aucune caméra n’a été trouvée sur cet appareil. Touchez « Fichier ».';
    case 'NotReadableError':
    case 'AbortError':
      return 'La caméra est déjà utilisée par une autre application. Fermez-la, puis réessayez.';
    default:
      return 'La caméra n’a pas pu démarrer. Touchez « Fichier ».';
  }
}
