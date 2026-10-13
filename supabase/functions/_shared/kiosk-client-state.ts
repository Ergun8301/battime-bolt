// Lot 30 (borne robuste) — l'ÉTAT DE L'ÉCRAN de la tablette, vu du bureau.
// Règles pures : sans base de données, sans réseau, sans navigateur.
//
// La tablette joint un petit objet `client_state` à son appel `sync` (toutes les
// 5 minutes, et dès qu'il change). La fonction `kiosk` le VALIDE ici avant de
// l'écrire dans `kiosks.client_state` ; la fenêtre « Borne » du bureau le relit
// et le traduit en phrases (kioskNotices), seulement s'il est récent.
//
// CE QUI EST GARDÉ (liste blanche, rien d'autre ne passe) :
//   · wake       le verrou d'écran : tenu / refusé / non pris en charge ;
//   · standalone la borne est ouverte depuis l'icône installée ;
//   · fullscreen la borne occupe tout l'écran ;
//   · online     la tablette se croit en ligne ;
//   · version    l'empreinte de la version de l'appli (8 signes, voir kiosk-version.ts).
// JAMAIS de texte libre, de jeton, de graine, d'adresse, d'identifiant ni de
// position. La taille de ce qui est écrit est bornée (CLIENT_STATE_MAX_BYTES)
// quoi que la tablette envoie ; un objet invalide est ignoré EN ENTIER (le
// `sync` répond comme avant, rien n'est écrit).
import { parisDate, parisTime } from './kiosk-rules.ts';

export type WakeReport = 'held' | 'denied' | 'unsupported';

export interface KioskClientState {
  wake?: WakeReport;
  standalone?: boolean;
  fullscreen?: boolean;
  online?: boolean;
  version?: string;
}

const WAKE_VALUES: readonly string[] = ['held', 'denied', 'unsupported'];
const BOOL_KEYS = ['standalone', 'fullscreen', 'online'] as const;
const VERSION_RE = /^[A-Za-z0-9._-]{1,24}$/;

/** Au-delà, l'objet reçu est rejeté sans être lu (la tablette n'envoie jamais ça). */
export const CLIENT_STATE_MAX_INPUT_CHARS = 1024;
/** Taille maximale de l'objet ÉCRIT (une fois nettoyé) : très au-dessus du réel (~90 octets). */
export const CLIENT_STATE_MAX_BYTES = 256;

/** Un état plus vieux que ça n'est plus « récent » : le bureau n'en dit plus rien (la tablette se signale toutes les 5 min). */
export const CLIENT_STATE_FRESH_MS = 15 * 60 * 1000;

/**
 * L'état reçu de la tablette, nettoyé — ou `null` s'il n'est pas valable
 * (pas un objet, trop gros, un champ du mauvais type, aucun champ connu).
 * Les champs inconnus sont IGNORÉS (une page plus récente peut en envoyer
 * davantage) ; un champ connu mal formé fait rejeter l'objet entier.
 */
export function parseClientState(raw: unknown): KioskClientState | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  let size: number;
  try { size = JSON.stringify(raw).length; } catch { return null; }
  if (size > CLIENT_STATE_MAX_INPUT_CHARS) return null;
  const src = raw as Record<string, unknown>;
  const has = (k: string) => Object.prototype.hasOwnProperty.call(src, k) && src[k] !== undefined;
  const out: KioskClientState = {};

  if (has('wake')) {
    if (typeof src.wake !== 'string' || !WAKE_VALUES.includes(src.wake)) return null;
    out.wake = src.wake as WakeReport;
  }
  for (const k of BOOL_KEYS) {
    if (!has(k)) continue;
    if (typeof src[k] !== 'boolean') return null;
    out[k] = src[k] as boolean;
  }
  if (has('version')) {
    if (typeof src.version !== 'string' || !VERSION_RE.test(src.version)) return null;
    out.version = src.version;
  }
  if (Object.keys(out).length === 0) return null;
  // Ceinture et bretelles : l'objet écrit tient toujours dans la borne.
  if (JSON.stringify(out).length > CLIENT_STATE_MAX_BYTES) return null;
  return out;
}

// ── Ce que le bureau en dit ──────────────────────────────────────────────────

export type KioskNoticeId = 'offline' | 'wake' | 'install';

export interface KioskNotice {
  id: KioskNoticeId;
  /** La phrase, en clair. */
  text: string;
  /** Une précision courte, facultative (petite). */
  hint?: string;
  /** Vrai = un bouton « Voir comment » ouvre l'aide d'installation. */
  help?: boolean;
}

export const NOTICE_WAKE = 'L’écran de la tablette peut s’éteindre : réglez la mise en veille (verrouillage automatique) sur « Jamais ».';
export const NOTICE_INSTALL = 'Ouvrez la borne depuis l’icône installée.';
export const NOTICE_OFFLINE_HINT = 'Réseau coupé ou écran éteint.';

/** « depuis 14:32 » (aujourd'hui), « depuis hier 14:32 », « depuis le 11 oct. à 14:32 » — heure de Paris. */
export function sinceLabel(atMs: number, nowMs: number): string {
  const hhmm = parisTime(atMs);
  const day = parisDate(atMs);
  const today = parisDate(nowMs);
  if (day === today) return `depuis ${hhmm}`;
  if (day === parisDate(nowMs - 24 * 3600 * 1000)) return `depuis hier ${hhmm}`;
  const d = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short' }).format(new Date(atMs));
  return `depuis le ${d} à ${hhmm}`;
}

/**
 * Les phrases à montrer au bureau pour UNE tablette. Rien (liste vide) tant
 * que la tablette n'a jamais envoyé son état : ancienne page, fonction ou
 * migration pas encore en ligne — le bureau marche comme avant.
 *
 *   · état récent (moins de 15 min) → « l'écran peut s'éteindre » si le verrou
 *     est refusé ou non pris en charge ; « ouvrez la borne depuis l'icône » si
 *     elle n'est pas installée ;
 *   · état périmé → « Tablette hors ligne depuis … » (la dernière fois qu'elle
 *     s'est signalée : c'est `client_state_at`, écrit seulement par la tablette,
 *     jamais par un pointage). Les autres phrases ne sont plus vraies : rien.
 */
export function kioskNotices(
  row: { client_state?: unknown; client_state_at?: string | null },
  nowMs: number,
): KioskNotice[] {
  const at = row.client_state_at ? Date.parse(row.client_state_at) : NaN;
  if (!Number.isFinite(at)) return [];
  // L'ordinateur du bureau peut avoir quelques secondes d'écart avec le serveur.
  const age = Math.max(0, nowMs - at);
  if (age >= CLIENT_STATE_FRESH_MS) {
    return [{ id: 'offline', text: `Tablette hors ligne ${sinceLabel(at, nowMs)}`, hint: NOTICE_OFFLINE_HINT }];
  }
  const st = parseClientState(row.client_state);
  if (!st) return [];
  const out: KioskNotice[] = [];
  if (st.wake === 'denied' || st.wake === 'unsupported') out.push({ id: 'wake', text: NOTICE_WAKE, help: true });
  if (st.standalone === false) out.push({ id: 'install', text: NOTICE_INSTALL, help: true });
  return out;
}
