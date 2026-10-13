'use client';

// Lot 11 — la tablette non reliée affiche un QR (appairage « style télévision »).
//
// Le QR ouvre /admin#borne=<identifiant de demande> : le patron le scanne avec
// son téléphone, se connecte si besoin, touche le même CODE DE VÉRIFICATION que
// celui de la tablette, et la tablette reçoit son jeton toute seule (dans le
// stockage de la page qui tourne : l'icône installée sur iPad). Le code à 6
// chiffres, le lien /borne?code= et le QR du bureau restent le secours.
//
// Ce fichier ne contient QUE la machine à états (`usePairQr`) : ce qui est
// demandé à la fonction `kiosk` et quand. L'écran est dans page.tsx (Pairing).
//   · `pair_request` : un identifiant signé, valable 10 min (rien n'est écrit en
//     base). Renouvelé 60 s avant la fin, avec le MÊME secret d'appareil : le
//     code de vérification ne change pas pendant tout l'épisode.
//   · `pair_status` : toutes les 3 s (3 premières minutes), puis toutes les 8 s,
//     pour chaque identifiant encore dans son horizon (fin + 3 min : une
//     confirmation de dernière seconde est livrée). Rien tant que l'onglet est
//     caché ou hors ligne.
//   · 30 min sans toucher l'écran : plus de renouvellement, le dernier QR
//     s'éteint à son expiration (« Ce QR n’est plus actif. »). Une tablette
//     oubliée ne consomme plus rien (quota Supabase Free).
//   · Fonction ou migration pas encore en ligne (400, 404, 501, `available:
//     false`, deux 5xx de suite sur le sondage) : la voie se TAIT, sans message,
//     et l'écran reste exactement celui d'avant (code à 6 chiffres).
// Le secret d'appareil ne vit qu'ici, en mémoire : jamais dans le stockage, une
// adresse, un journal ou le QR.

import { useCallback, useEffect, useRef, useState } from 'react';
import { callKiosk } from '@/lib/kiosk-client';
import type { KioskSettings } from '@/lib/kiosk-client';
import { isDeviceSecret, pairUrl, ridDecode } from '../../supabase/functions/_shared/kiosk-pair';

/** Texte actuel du bandeau « déconnectée par le bureau » (lu par les tests, ne pas changer). */
export const NOTICE_FORGOTTEN = 'Tablette déconnectée par le bureau (ou remplacée par une autre). Tapez un nouveau code pour la relier.';
/** Même bandeau quand le QR est à l'écran : on n'y parle pas de taper un code. */
export const NOTICE_FORGOTTEN_QR = 'Tablette déconnectée par le bureau (ou remplacée par une autre). Scannez le QR pour la relier de nouveau.';

/** Réponse de `pair_status` une fois confirmée : les mêmes clés que `pair` (code à 6 chiffres). */
export interface KioskPairReply {
  kiosk_id: string;
  token: string;
  seed: string;
  kiosk_name: string;
  company_name: string;
  settings: KioskSettings;
}

interface PairRequestReply {
  available?: boolean;
  request_id?: string;
  device_secret?: string;
  display_code?: string;
  ttl_s?: number;
}

interface PairStatusReply extends Partial<KioskPairReply> {
  available?: boolean;
  status?: 'pending' | 'approved' | 'expired' | 'cancelled' | 'used' | 'suspended';
}

/** Ce que l'écran affiche : l'adresse du QR et le code de vérification (« K7M 4QX »). */
export interface PairView { url: string; code: string }

export interface PairQr {
  /** Le QR à montrer, sinon `null` (voie inactive, repli, QR périmé, arrêt d'inactivité). */
  view: PairView | null;
  /** Borne coupée par BEMEXO : la liaison reprendra dès sa réactivation. */
  suspended: boolean;
  /** 30 min sans toucher l'écran et le dernier QR a expiré. */
  inactive: boolean;
  /** « Afficher un nouveau QR ». */
  restart: () => void;
}

const SECOND = 1000;
/** Un QR est renouvelé 60 s avant d'expirer. */
const RENEW_BEFORE_MS = 60 * SECOND;
/** Après l'expiration, un identifiant est encore interrogé 3 min (confirmation de dernière seconde). */
const CLAIM_GRACE_MS = 3 * 60 * SECOND;
/** Plus de renouvellement 30 min après le début de l'épisode (remis à zéro par un toucher). */
const INACTIVITY_MS = 30 * 60 * SECOND;
const POLL_FAST_MS = 3 * SECOND;
const POLL_SLOW_MS = 8 * SECOND;
/** Les 3 premières minutes de l'épisode, on interroge vite. */
const FAST_PHASE_MS = 3 * 60 * SECOND;
/** Au plus une demande toutes les 5 s. */
const MIN_REQUEST_GAP_MS = 5 * SECOND;
/** Essais après un échec réseau ou un 5xx : 5 s, 15 s, puis 60 s. */
const RETRY_MS = [5 * SECOND, 15 * SECOND, 60 * SECOND];
/** Même garde-fou que `codeLife()` du bureau : horloge de CETTE tablette, jamais celle du serveur. */
const MIN_LIFE_MS = 90 * SECOND;
const MAX_LIFE_MS = 10 * 60 * SECOND;

/** Un identifiant de demande suivi par la tablette (heures en ms, horloge de la tablette). */
interface Request { rid: string; expiresAt: number; horizon: number; inflight: boolean; dead: boolean }

export function usePairQr(enabled: boolean, onApproved: (reply: KioskPairReply) => void): PairQr {
  const [view, setView] = useState<PairView | null>(null);
  const [suspended, setSuspended] = useState(false);
  const [inactive, setInactive] = useState(false);
  const approvedRef = useRef(onApproved);
  approvedRef.current = onApproved;
  const restartRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let secret: string | null = null;
    let requests: Request[] = [];
    let shown: Request | null = null;
    let episodeStart = Date.now();
    let requesting = false;
    let ended = false;
    let fails = 0;
    let pollFails = 0;
    let nextRequestAt = 0;
    let nextPollAt = 0;

    const stop = () => {
      alive = false;
      clearInterval(heartbeat);
      document.removeEventListener('pointerdown', onTouch, true);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
    /** La voie se tait : l'écran redevient celui du code à 6 chiffres, sans message. */
    const giveUp = () => { stop(); secret = null; setView(null); setSuspended(false); };

    async function request() {
      requesting = true;
      const startedAt = Date.now();
      nextRequestAt = Math.max(nextRequestAt, startedAt + MIN_REQUEST_GAP_MS);
      const { data, status } = await callKiosk<PairRequestReply>({ action: 'pair_request', ...(secret ? { device_secret: secret } : {}) });
      requesting = false;
      if (!alive) return;
      if (!data) {
        // Voie absente (fonction pas encore à jour) : on se tait. Réseau, 429, 5xx : on réessaie, sans rien dire.
        if (status === 400 || status === 404 || status === 501) { giveUp(); return; }
        fails++;
        nextRequestAt = Date.now() + (status === 429 ? RETRY_MS[2] : RETRY_MS[Math.min(fails - 1, RETRY_MS.length - 1)]);
        return;
      }
      if (data.device_secret && isDeviceSecret(data.device_secret)) secret = data.device_secret;
      if (data.available !== true || !secret || !data.request_id || !ridDecode(data.request_id) || typeof data.display_code !== 'string') { giveUp(); return; }
      fails = 0;
      const now = Date.now();
      const life = Math.min(Math.max((data.ttl_s ?? 0) * SECOND, MIN_LIFE_MS), MAX_LIFE_MS);
      const fresh: Request = { rid: data.request_id, expiresAt: now + life, horizon: now + life + CLAIM_GRACE_MS, inflight: false, dead: false };
      // L'ancien reste interrogé tant qu'il est dans son horizon (au plus un précédent).
      requests = [...(shown && !shown.dead && now < shown.horizon ? [shown] : []), fresh];
      shown = fresh;
      setInactive(false);
      setView({ url: pairUrl(window.location.origin, fresh.rid), code: data.display_code });
    }

    async function poll(r: Request) {
      r.inflight = true;
      const { data, status } = await callKiosk<PairStatusReply>({ action: 'pair_status', request_id: r.rid, device_secret: secret });
      r.inflight = false;
      if (!alive) return;
      if (!data) {
        if (status === 400 || status === 404 || status === 501) { giveUp(); return; }
        if (status && status >= 500 && ++pollFails >= 2) giveUp();
        return;
      }
      pollFails = 0;
      if (data.available === false) { giveUp(); return; }
      switch (data.status) {
        case 'approved':
          if (!data.kiosk_id || !data.token || !data.seed || !data.settings) return;
          stop();
          secret = null;
          approvedRef.current({
            kiosk_id: data.kiosk_id, token: data.token, seed: data.seed,
            kiosk_name: data.kiosk_name ?? '', company_name: data.company_name ?? '', settings: data.settings,
          });
          return;
        case 'suspended':
          if (r === shown) setSuspended(true);
          return;
        case 'expired': case 'cancelled': case 'used':
          // Le QR affiché ne servira plus : un neuf tout de suite (au plus un toutes les 5 s).
          r.dead = true;
          requests = requests.filter((x) => x !== r);
          tick();
          return;
        default:
          if (r === shown) setSuspended(false);
      }
    }

    function tick() {
      if (!alive || document.visibilityState !== 'visible' || !navigator.onLine) return;
      const now = Date.now();
      const idle = now - episodeStart >= INACTIVITY_MS;
      requests = requests.filter((r) => now < r.horizon);

      if (shown && now >= shown.expiresAt && !ended) {
        setView(null);
        if (idle) { ended = true; setInactive(true); }
      }
      const due = !shown || shown.dead || now >= shown.expiresAt - RENEW_BEFORE_MS;
      if (due && !idle && !ended && !requesting && now >= nextRequestAt) void request();

      if (now >= nextPollAt) {
        const live = requests.filter((r) => !r.inflight);
        if (live.length) {
          nextPollAt = now + (now - episodeStart < FAST_PHASE_MS ? POLL_FAST_MS : POLL_SLOW_MS);
          for (const r of live) void poll(r);
        }
      }
    }

    const onTouch = () => { if (!ended) episodeStart = Date.now(); };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!ended) episodeStart = Date.now();
      nextPollAt = 0;
      tick();
    };
    const onOnline = () => { nextRequestAt = 0; nextPollAt = 0; tick(); };

    const heartbeat = setInterval(tick, SECOND);
    document.addEventListener('pointerdown', onTouch, true);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    restartRef.current = () => {
      ended = false;
      episodeStart = Date.now();
      nextRequestAt = 0;
      setInactive(false);
      tick();
    };
    tick();
    return () => { stop(); secret = null; };
  }, [enabled]);

  const restart = useCallback(() => restartRef.current(), []);
  return { view, suspended, inactive, restart };
}
