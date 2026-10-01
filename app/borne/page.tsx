'use client';

// Borne de pointage — l'écran de la tablette posée à l'entrée (lot 1, lot 9).
//
// DEUX ÉTATS SEULEMENT :
//   1. pas encore appairée → un champ pour le code à 6 chiffres donné par le
//      bureau (Réglages → Borne de pointage) ;
//   2. appairée → le PLANNING DE LA SEMAINE, en lecture seule (la même grille
//      que le bureau), et un gros bouton jaune « Pointer (QR) » qui ouvre le QR
//      en plein écran. Retour au planning tout seul après 60 s, ou au toucher.
//
// LE QR NE DÉPEND JAMAIS D'INTERNET. Il est recalculé ici, chaque minute, à
// partir de la graine reçue à l'appairage (supabase/functions/_shared/
// kiosk-code.ts, le même fichier que le serveur). Si le réseau coupe, la borne
// continue d'afficher des QR valides ; seuls le planning et la vérification
// « borne retirée » attendent le retour du réseau.
//
// LE PLANNING passe UNIQUEMENT par la fonction kiosk (action `board`, avec le
// jeton de la borne) : prénom, nom, chantier, ville, horaires prévus et « en
// cours depuis ». Ni heure pointée, ni coût, ni motif d'absence. Relu toutes
// les 30 s (écran visible, borne réveillée, en ligne), gardé en cache pour
// rester affiché hors ligne. Les pastilles « en cours » s'effacent dès que ce
// cache a plus de 2 minutes : une information « en direct » périmée serait
// fausse. Si la fonction répond une erreur (ancienne version pas encore
// redéployée…), on garde le dernier planning, sinon « Planning indisponible » —
// le bouton « Pointer (QR) » marche dans tous les cas.
//
// Plein écran : un bouton toujours visible dans le coin, au-dessus du QR et de
// la veille. « Déconnecter » n'est plus affiché (c'est un geste du bureau) :
// appui long de 5 s sur le nom de la borne, puis confirmation. Le bureau peut
// aussi la retirer à distance.
//
// ?demo=1 : aperçu sans appairage (graine fictive, QR non valable, semaine
// fictive construite par le même `buildBoard` que la fonction), seulement sur
// une preview.

import { useCallback, useEffect, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { codeAt, fromBase64Url, scanUrl, stepAt } from '../../supabase/functions/_shared/kiosk-code';
import { isAsleep, parisTime } from '../../supabase/functions/_shared/kiosk-rules';
import { buildBoard, isKioskBoard, parisWeek, type BoardPlanning, type BoardSession } from '../../supabase/functions/_shared/kiosk-board';
import { parisDay, parisHHmm } from '../../supabase/functions/_shared/live-place';
import { callKiosk, type KioskBoard, type KioskPlanningRow, type KioskSettings } from '@/lib/kiosk-client';
import KioskWeekGrid from '@/components/kiosk-week-grid';
import { demanderPosition } from '@/lib/position';
import { isPreviewHost } from '@/lib/hosting';

const STORE_KEY = 'bx_kiosk_v1';
const SYNC_EVERY_MS = 5 * 60 * 1000;
const BOARD_EVERY_MS = 30 * 1000;
/** Au-delà, les « en cours depuis » du cache ne sont plus montrés. */
const LIVE_FRESH_MS = 2 * 60 * 1000;
/** Le QR reste affiché 60 s, puis la borne revient au planning. */
const QR_SHOW_MS = 60 * 1000;
const WAKE_ON_TOUCH_MS = 60 * 1000;
/** Appui long sur le nom de la borne pour la déconnecter (geste du bureau). */
const UNPAIR_PRESS_MS = 5 * 1000;

interface Paired {
  kioskId: string;
  token: string;
  seed: string;
  companyName: string;
  kioskName: string;
  settings: KioskSettings;
  /** Ancien planning du jour (caches d'avant le lot 9) : plus affiché. */
  planning?: KioskPlanningRow[];
  /** Lot 9 : la semaine, telle que la fonction l'a rendue la dernière fois. */
  board?: KioskBoard | null;
  /** Heure (ms) du dernier `board` réussi. */
  boardAt?: number | null;
  syncedAt: number | null;
  demo?: boolean;
}

// ── Démo : une vraie semaine fictive, passée par le MÊME constructeur ────────

/** « 07:42 » le jour `day`, heure de Paris → ISO (été comme hiver). */
function parisIso(day: string, hhmm: string): string {
  for (const off of ['+02:00', '+01:00']) {
    const iso = new Date(`${day}T${hhmm}:00${off}`).toISOString();
    if (parisHHmm(iso) === hhmm && parisDay(Date.parse(iso)) === day) return iso;
  }
  return new Date(`${day}T${hhmm}:00+01:00`).toISOString();
}

function demoBoard(nowMs: number): KioskBoard {
  const { days, today } = parisWeek(nowMs);
  const users = [
    { id: 'demo-ines', first_name: 'Inès', last_name: 'Garnier' },
    { id: 'demo-julie', first_name: 'Julie', last_name: 'Bernard' },
    { id: 'demo-karim', first_name: 'Karim', last_name: 'Haddad' },
    { id: 'demo-lucas', first_name: 'Lucas', last_name: 'Petit' },
    { id: 'demo-sofia', first_name: 'Sofia', last_name: 'Moreau' },
    { id: 'demo-thomas', first_name: 'Thomas', last_name: 'Lefèvre' },
  ];
  const worksites = [
    { id: 'demo-w-dupont', client_name: 'Villa Dupont', city: 'Lyon 6e' },
    { id: 'demo-w-martin', client_name: 'Cuisine Martin', city: 'Villeurbanne' },
    { id: 'demo-w-ecole', client_name: 'École Jean Moulin', city: 'Bron' },
    { id: 'demo-w-garnier', client_name: 'Salle de bains Roche', city: 'Caluire-et-Cuire' },
    { id: 'demo-w-depot', client_name: 'Dépôt', city: 'Vénissieux' },
  ];
  const planning: BoardPlanning[] = [];
  const add = (user: string, day: string, site: string | null, start: string | null, end: string | null, absence: string | null = null) =>
    planning.push({
      id: `demo-p${planning.length}`, user_id: `demo-${user}`, worksite_id: site ? `demo-w-${site}` : null, work_date: day,
      estimated_start: start, estimated_end: end, absence_type: absence, position: null, created_at: `2026-01-01T00:00:${String(planning.length).padStart(2, '0')}Z`,
    });
  days.forEach((d, i) => {
    const weekend = i >= 5;
    if (weekend && d !== today) return;
    add('karim', d, 'dupont', '07:30', '16:30');
    add('lucas', d, 'ecole', '07:30', '16:00');
    if (i === 4) add('lucas', d, 'depot', '16:30', null);
    if (weekend) return;
    if (i < 2) { add('julie', d, 'martin', '08:00', '12:00'); add('julie', d, 'ecole', '13:30', '17:00'); }
    else add('julie', d, 'martin', '08:00', '17:00');
    add('ines', d, i < 3 ? 'garnier' : 'ecole', '08:00', '17:00');
    if (i === 2) add('sofia', d, null, null, null, 'conge');
    else add('sofia', d, 'dupont', '08:00', '17:00');
    if (i < 4) add('thomas', d, 'martin', '07:00', '15:30');
  });
  const karimToday = planning.find((p) => p.user_id === 'demo-karim' && p.work_date === today);
  const sessions: BoardSession[] = [
    // Karim a scanné à 07:42 sur son chantier prévu → bulle verte.
    { user_id: 'demo-karim', worksite_id: 'demo-w-dupont', planning_id: karimToday?.id ?? null, work_date: today, started_at: parisIso(today, '07:42') },
    // Thomas est passé au dépôt, qui n'est pas à son planning → ligne à part.
    { user_id: 'demo-thomas', worksite_id: 'demo-w-depot', planning_id: null, work_date: today, started_at: parisIso(today, '06:58') },
  ];
  return buildBoard({ users, planning, worksites, sessions, nowMs });
}

const DEMO: Paired = {
  kioskId: 'demo', token: 'demo', seed: 'ZGVtby1ib3JuZS1iZW1leG8tbmUtcGFzLXV0aWxpc2Vy',
  companyName: 'Martin Menuiserie', kioskName: 'Entrée du dépôt',
  settings: { require_gps: false, active_from: null, active_until: null },
  board: null, boardAt: null, syncedAt: null, demo: true,
};

function readStore(): Paired | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Paired) : null;
  } catch { return null; }
}
function writeStore(p: Paired | null) {
  try {
    if (p) localStorage.setItem(STORE_KEY, JSON.stringify(p));
    else localStorage.removeItem(STORE_KEY);
  } catch { /* stockage indisponible : la borne marche pour la session */ }
}

// ── Plein écran (avec les préfixes de Safari sur iPad) ──────────────────────

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void; webkitFullscreenEnabled?: boolean };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };
const fsDoc = () => document as FsDoc;
const isFullscreen = () => !!(document.fullscreenElement || fsDoc().webkitFullscreenElement);
function fsSupported(): boolean {
  const el = document.documentElement as FsEl;
  if (!el.requestFullscreen && !el.webkitRequestFullscreen) return false;
  // Méthode présente mais interdite (cadre sans autorisation…) : c'est « non pris en charge ».
  return document.fullscreenEnabled !== false || fsDoc().webkitFullscreenEnabled === true;
}
function enterFullscreen() {
  const el = document.documentElement as FsEl;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  else el.webkitRequestFullscreen?.();
}
function exitFullscreen() {
  if (document.exitFullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else fsDoc().webkitExitFullscreen?.();
}

const CSS = `
@import url('/fonts/fonts.css');
.kb{position:fixed;inset:0;background:#15120F;color:#F2EDE3;font-family:'Archivo',system-ui,sans-serif;-webkit-font-smoothing:antialiased;overflow:hidden;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.kb *{box-sizing:border-box}
.kb-grid{height:100%;display:grid;grid-template-rows:auto minmax(0,1fr) auto;padding:clamp(12px,2vmin,22px) 16px clamp(8px,1.2vmin,12px);gap:clamp(10px,1.6vmin,16px)}
.kb-top{display:flex;align-items:center;gap:clamp(12px,2.2vmin,26px);min-width:0}
.kb-brand{display:flex;align-items:center;gap:12px;min-width:0;flex:1}
.kb-brand img{height:clamp(22px,3.4vmin,32px);width:auto;flex:none}
.kb-place{min-width:0}
.kb-company{font-weight:900;font-size:clamp(18px,2.8vmin,26px);letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kb-kname{display:inline-block;max-width:100%;font-family:'JetBrains Mono',monospace;font-size:clamp(11px,1.5vmin,13px);color:#a59c86;letter-spacing:.08em;text-transform:uppercase;margin-top:2px;padding:3px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:default}
.kb-clock{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:clamp(28px,5vmin,52px);letter-spacing:-.03em;line-height:1;color:#FFC21A;flex:none}
.kb-go{display:inline-flex;align-items:center;gap:12px;flex:none;border:none;cursor:pointer;background:#FFC21A;color:#15120F;font-family:inherit;font-weight:900;font-size:clamp(18px,2.8vmin,26px);letter-spacing:-.01em;line-height:1;padding:clamp(13px,2vmin,20px) clamp(20px,3.2vmin,34px);border-radius:16px;box-shadow:0 5px 0 #C99300}
.kb-go:active{transform:translateY(3px);box-shadow:0 2px 0 #C99300}
.kb-go svg{width:1.25em;height:1.25em;flex:none}
.kb-main{min-height:0;display:flex;flex-direction:column}
.kb-main>.kb-week{flex:1}
.kb-unavail{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;border:1.5px dashed rgba(242,237,227,.2);border-radius:16px;text-align:center;padding:24px;font-weight:900;font-size:clamp(20px,3vmin,30px)}
.kb-unavail small{font-weight:600;font-size:clamp(13px,1.8vmin,16px);color:#a59c86}
.kb-foot{display:flex;align-items:center;gap:14px;min-height:34px;padding-right:230px;font-size:clamp(12px,1.6vmin,14px);color:#a59c86;font-weight:600;min-width:0}
.kb-status{display:inline-flex;align-items:center;gap:8px;white-space:nowrap}
.kb-dot{width:9px;height:9px;border-radius:50%;background:#2FD584;box-shadow:0 0 0 4px rgba(47,213,132,.15);flex:none}
.kb-dot.off{background:#F0915A;box-shadow:0 0 0 4px rgba(240,145,90,.15)}
.kb-stamp{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kb-btn{border:1.5px solid rgba(242,237,227,.25);background:transparent;color:#F2EDE3;border-radius:10px;padding:10px 16px;font:inherit;font-weight:800;cursor:pointer}
.kb-btn.yes{background:#15120F;border-color:#15120F;color:#F2EDE3}
.kb-btn.no{color:#15120F;border-color:rgba(21,18,15,.3)}
.kb-demo{position:absolute;top:8px;left:50%;transform:translateX(-50%);z-index:35;background:#FFC21A;color:#15120F;font-weight:900;font-size:12px;letter-spacing:.08em;text-transform:uppercase;border-radius:99px;padding:5px 12px;pointer-events:none}
/* Le QR, en plein écran, par-dessus le planning */
.kb-qrview{position:absolute;inset:0;z-index:30;background:#15120F;display:grid;grid-template-rows:auto minmax(0,1fr) auto;padding:clamp(14px,2.4vmin,28px) 16px clamp(12px,2vmin,22px);gap:clamp(10px,1.8vmin,18px);cursor:pointer}
.kb-qrhead{display:flex;align-items:center;justify-content:space-between;gap:16px;min-width:0}
.kb-qrmain{display:flex;align-items:center;justify-content:center;min-height:0}
.kb-qrcard{background:#fff;border-radius:clamp(18px,3vmin,32px);padding:clamp(14px,2.2vmin,24px);box-shadow:0 30px 80px -30px rgba(0,0,0,.8),0 0 0 6px rgba(255,194,26,.9);display:flex;flex-direction:column;align-items:center;gap:clamp(8px,1.4vmin,14px);max-height:100%}
.kb-qr{width:min(56vmin,540px);aspect-ratio:1/1}
.kb-qr svg{width:100%;height:100%;display:block}
.kb-hint{font-weight:800;color:#15120F;font-size:clamp(15px,2.2vmin,22px);text-align:center;letter-spacing:-.01em}
.kb-bar{width:100%;height:5px;border-radius:99px;background:#EDE6D8;overflow:hidden}
.kb-bar i{display:block;height:100%;background:#FFC21A;border-radius:99px;transition:width 1s linear}
.kb-back{text-align:center;color:#a59c86;font-weight:700;font-size:clamp(14px,2vmin,18px)}
.kb-back b{color:#F2EDE3}
.kb-sleep{position:absolute;inset:0;z-index:40;background:#000;display:flex;align-items:flex-end;justify-content:center;padding:40px;color:#3a352f;font-weight:700;font-size:14px;cursor:pointer}
.kb-confirm{position:absolute;inset:0;z-index:45;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:24px}
.kb-confirm-card{background:#F2EDE3;color:#15120F;border-radius:18px;padding:26px;max-width:440px;text-align:center;box-shadow:0 30px 60px -30px rgba(0,0,0,.7)}
.kb-confirm-card h2{margin:0 0 8px;font-size:22px;font-weight:900;letter-spacing:-.02em}
.kb-confirm-card p{margin:0 0 18px;color:#56514a;font-weight:600;line-height:1.45}
.kb-confirm-card div{display:flex;gap:10px;justify-content:center}
/* Plein écran : toujours visible, au-dessus du QR, de la veille et de l'appairage */
.kb-fs{position:fixed;right:16px;bottom:10px;z-index:60;display:inline-flex;align-items:center;gap:8px;border:1.5px solid rgba(242,237,227,.3);background:rgba(21,18,15,.9);color:#F2EDE3;border-radius:10px;padding:7px 12px;font-family:'Archivo',system-ui,sans-serif;font-weight:800;font-size:13px;line-height:1.2;cursor:pointer;-webkit-tap-highlight-color:transparent}
.kb-fs svg{width:15px;height:15px;flex:none}
/* Portrait : le planning garde ses 7 jours, plus serrés. */
@media (orientation:portrait){
  .kb-top{flex-wrap:wrap}
  .kb-brand{flex-basis:100%}
  .kb-go{flex:1;justify-content:center}
  .kb-qr{width:min(80vw,560px)}
}
/* Appairage */
.kp{position:fixed;inset:0;background:#F2EDE3;color:#15120F;font-family:'Archivo',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px}
.kp-card{width:100%;max-width:520px;background:#fff;border:1px solid rgba(21,18,15,.12);border-radius:22px;padding:clamp(24px,5vw,40px);box-shadow:0 30px 60px -30px rgba(21,18,15,.35);text-align:center}
.kp-logo{display:inline-flex;background:#15120F;border-radius:14px;padding:13px 22px;margin-bottom:22px}
.kp-logo img{width:150px;height:auto;display:block}
.kp-h1{font-size:clamp(24px,4vw,32px);font-weight:900;letter-spacing:-.02em;margin:0 0 8px}
.kp-p{color:#6E6A63;font-weight:500;font-size:16px;line-height:1.5;margin:0 0 22px}
.kp-code{width:100%;font-family:'JetBrains Mono',monospace;font-size:clamp(34px,7vw,48px);font-weight:700;letter-spacing:.35em;text-align:center;padding:14px 10px 14px calc(10px + .35em);border:2px solid rgba(21,18,15,.18);border-radius:16px;background:#FBF8F2;outline:none;color:#15120F}
.kp-code:focus{border-color:#15120F;background:#fff}
.kp-btn{margin-top:16px;width:100%;border:none;cursor:pointer;background:#FFC21A;color:#15120F;font-family:inherit;font-weight:900;font-size:18px;padding:16px;border-radius:14px;box-shadow:0 4px 0 #C99300}
.kp-btn:disabled{opacity:.6;cursor:default}
.kp-err{background:#fce8e6;border:1px solid #f3b4ad;color:#9a2820;font-size:14px;font-weight:700;border-radius:12px;padding:11px 14px;margin:0 0 14px;text-align:left}
.kp-note{font-size:13px;color:#9a948a;font-weight:600;margin:16px 0 0;line-height:1.45}
`;

function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const take = async () => {
      try { if (nav.wakeLock && document.visibilityState === 'visible') lock = await nav.wakeLock.request('screen'); } catch { /* refusé : l'écran suivra le réglage de la tablette */ }
    };
    take();
    const onVis = () => { if (document.visibilityState === 'visible') take(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); lock?.release().catch(() => {}); };
  }, [active]);
}

function Pairing({ onPaired, notice }: { onPaired: (p: Paired) => void; notice: string | null }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(notice);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) { setErr('Le code fait 6 chiffres.'); return; }
    setBusy(true); setErr(null);
    // La position de la tablette sert au contrôle « sur place » (si le bureau
    // l'active). Facultative : un refus n'empêche pas l'appairage.
    const pos = await demanderPosition(6000);
    const { data, error } = await callKiosk<{
      kiosk_id: string; token: string; seed: string; kiosk_name: string; company_name: string; settings: KioskSettings;
    }>({ action: 'pair', code, lat: pos?.lat, lng: pos?.lng, accuracy: pos?.accuracy });
    setBusy(false);
    if (!data) { setErr(error || 'Appairage impossible.'); return; }
    onPaired({
      kioskId: data.kiosk_id, token: data.token, seed: data.seed,
      companyName: data.company_name, kioskName: data.kiosk_name,
      settings: data.settings, board: null, boardAt: null, syncedAt: Date.now(),
    });
  };

  return (
    <div className="kp">
      <form className="kp-card" onSubmit={submit}>
        <div className="kp-logo"><img src="/bemexo-wordmark-light.svg" alt="BEMEXO" /></div>
        <h1 className="kp-h1">Installer la borne</h1>
        <p className="kp-p">Saisissez le code à 6 chiffres affiché dans BEMEXO,<br />Réglages → Borne de pointage.</p>
        {err && <div className="kp-err" role="alert">{err}</div>}
        <input
          className="kp-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
          aria-label="Code d'appairage" placeholder="000000"
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
        <button className="kp-btn" type="submit" disabled={busy || code.length !== 6}>{busy ? 'Appairage…' : 'Appairer cette tablette'}</button>
        <p className="kp-note">Aucun compte ni mot de passe sur la tablette. Le bureau peut retirer la borne à tout moment.</p>
      </form>
    </div>
  );
}

const QrIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3M21 14v.01M14 21h.01M17 21h4v-4" />
  </svg>
);

function Display({ paired, online, boardErr, awakeUntil, onWake, onUnpair }: {
  paired: Paired;
  online: boolean;
  boardErr: boolean;
  awakeUntil: number;
  onWake: (until: number) => void;
  onUnpair: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [svg, setSvg] = useState('');
  const [qrUntil, setQrUntil] = useState(0);
  const [confirmUnpair, setConfirmUnpair] = useState(false);
  const lastStep = useRef<number | null>(null);
  const seed = useRef<Uint8Array>(fromBase64Url(paired.seed));
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { seed.current = fromBase64Url(paired.seed); lastStep.current = null; }, [paired.seed]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Nouveau QR à chaque changement de minute, calculé ici, sans réseau.
  useEffect(() => {
    const step = stepAt(now);
    if (step === lastStep.current) return;
    lastStep.current = step;
    let stale = false;
    codeAt(seed.current, now).then((code) => {
      if (stale) return;
      const qr = qrcode(0, 'M');
      qr.addData(scanUrl(window.location.origin, paired.kioskId, code));
      qr.make();
      setSvg(qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true }));
    });
    return () => { stale = true; };
  }, [now, paired.kioskId]);

  // Retour au planning 60 s après l'ouverture du QR.
  useEffect(() => {
    if (!qrUntil) return;
    const t = setTimeout(() => setQrUntil(0), Math.max(0, qrUntil - Date.now()));
    return () => clearTimeout(t);
  }, [qrUntil]);

  // La confirmation « Déconnecter » ne reste pas affichée indéfiniment.
  useEffect(() => {
    if (!confirmUnpair) return;
    const t = setTimeout(() => setConfirmUnpair(false), 20 * 1000);
    return () => clearTimeout(t);
  }, [confirmUnpair]);

  const openQr = () => {
    const t = Date.now();
    setNow(t);
    setQrUntil(t + QR_SHOW_MS);
    onWake(t + Math.max(QR_SHOW_MS, WAKE_ON_TOUCH_MS));
  };
  const closeQr = () => setQrUntil(0);
  const cancelPress = () => { if (press.current) clearTimeout(press.current); press.current = null; };
  const startPress = () => { cancelPress(); press.current = setTimeout(() => { press.current = null; setConfirmUnpair(true); }, UNPAIR_PRESS_MS); };
  useEffect(() => () => { if (press.current) clearTimeout(press.current); }, []);

  const hhmm = parisTime(now);
  const qrOpen = qrUntil > 0;
  const asleep = !qrOpen && isAsleep(hhmm, paired.settings.active_from, paired.settings.active_until) && now > awakeUntil;
  const secondsLeft = 60 - (Math.floor(now / 1000) % 60);
  const backIn = Math.max(0, Math.ceil((qrUntil - now) / 1000));

  const board = isKioskBoard(paired.board) ? paired.board : null;
  const today = parisDay(now);
  // « En cours depuis » : seulement si le planning est frais ET de cette semaine.
  const fresh = !!paired.demo || (!!paired.boardAt && now - paired.boardAt < LIVE_FRESH_MS);
  const showLive = !!board && fresh && board.days.includes(today);
  const stale = !!board && !paired.demo && !!paired.boardAt && now - paired.boardAt >= LIVE_FRESH_MS;

  return (
    <div className="kb">
      {paired.demo && <div className="kb-demo">Mode démo · QR non valable</div>}
      <div className="kb-grid">
        <header className="kb-top">
          <div className="kb-brand">
            <img src="/bemexo-x-light.svg" alt="" aria-hidden="true" />
            <div className="kb-place">
              <div className="kb-company">{paired.companyName || 'BEMEXO'}</div>
              <div
                className="kb-kname"
                data-testid="kb-kname"
                onPointerDown={startPress}
                onPointerUp={cancelPress}
                onPointerLeave={cancelPress}
                onPointerCancel={cancelPress}
                onContextMenu={(e) => e.preventDefault()}
              >
                {paired.kioskName}
              </div>
            </div>
          </div>
          <div className="kb-clock" aria-label={`Il est ${hhmm}`}>{hhmm}</div>
          <button type="button" className="kb-go" data-testid="kb-pointer" onClick={openQr}>
            <QrIcon />Pointer (QR)
          </button>
        </header>

        <main className="kb-main">
          {board ? (
            <KioskWeekGrid board={board} today={today} showLive={showLive} />
          ) : (
            <div className="kb-unavail" data-testid="kb-unavailable">
              {boardErr || !online ? 'Planning indisponible' : 'Chargement du planning…'}
              <small>Pour pointer, touchez « Pointer (QR) ».</small>
            </div>
          )}
        </main>

        <footer className="kb-foot">
          <span className="kb-status">
            <span className={`kb-dot${online ? '' : ' off'}`} />
            {online ? 'Borne active' : 'Hors ligne — le QR reste valable'}
          </span>
          {stale && paired.boardAt && (
            <span className="kb-stamp">Planning du {new Date(paired.boardAt).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short' })} à {parisTime(paired.boardAt)}</span>
          )}
        </footer>
      </div>

      {qrOpen && (
        <div className="kb-qrview" data-testid="kb-qr-overlay" onClick={closeQr} role="dialog" aria-label="QR de pointage">
          <div className="kb-qrhead">
            <div className="kb-company">{paired.companyName || 'BEMEXO'}</div>
            <div className="kb-clock">{hhmm}</div>
          </div>
          <div className="kb-qrmain">
            <div className="kb-qrcard">
              <div className="kb-qr" aria-label="QR de pointage" dangerouslySetInnerHTML={{ __html: svg }} />
              <div className="kb-hint">Scannez avec l&apos;appareil photo de votre téléphone</div>
              <div className="kb-bar" aria-hidden="true"><i style={{ width: `${(secondsLeft / 60) * 100}%` }} /></div>
            </div>
          </div>
          <div className="kb-back">Touchez l&apos;écran pour revenir au planning · <b>retour automatique dans {backIn} s</b></div>
        </div>
      )}

      {asleep && (
        <div className="kb-sleep" data-testid="kb-sleep" onClick={openQr} role="button" tabIndex={0}>
          Touchez l&apos;écran pour pointer
        </div>
      )}

      {confirmUnpair && (
        <div className="kb-confirm" role="dialog" aria-label="Déconnecter la borne">
          <div className="kb-confirm-card" data-testid="kb-unpair-confirm">
            <h2>Déconnecter cette tablette ?</h2>
            <p>Il faudra un nouveau code du bureau pour la réinstaller. Le bureau peut aussi la retirer à distance.</p>
            <div>
              <button type="button" className="kb-btn yes" onClick={onUnpair}>Oui, déconnecter</button>
              <button type="button" className="kb-btn no" onClick={() => setConfirmUnpair(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const FsIcon = ({ out }: { out: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {out
      ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
  </svg>
);

/** Toujours visible (sauf navigateur sans plein écran). Échap marche aussi, nativement. */
function FullscreenToggle() {
  const [supported, setSupported] = useState(false);
  const [full, setFull] = useState(false);
  useEffect(() => {
    setSupported(fsSupported());
    const on = () => setFull(isFullscreen());
    document.addEventListener('fullscreenchange', on);
    document.addEventListener('webkitfullscreenchange', on);
    on();
    return () => {
      document.removeEventListener('fullscreenchange', on);
      document.removeEventListener('webkitfullscreenchange', on);
    };
  }, []);
  if (!supported) return null;
  return (
    <button
      type="button"
      className="kb-fs"
      data-testid="kb-fullscreen"
      aria-pressed={full}
      onClick={(e) => { e.stopPropagation(); if (isFullscreen()) exitFullscreen(); else enterFullscreen(); }}
    >
      <FsIcon out={full} />{full ? 'Quitter le plein écran' : 'Plein écran'}
    </button>
  );
}

export default function BornePage() {
  const [paired, setPaired] = useState<Paired | null>(null);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [boardErr, setBoardErr] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [awakeUntil, setAwakeUntil] = useState(0);
  // Les boucles lisent toujours la DERNIÈRE version (le stockage peut être indisponible).
  const pairedRef = useRef<Paired | null>(null);
  const awakeRef = useRef(0);

  const commit = useCallback((next: Paired | null) => {
    // La démo n'écrit jamais : elle ne doit pas effacer une vraie borne de la tablette.
    const demo = (next ?? pairedRef.current)?.demo;
    pairedRef.current = next;
    if (!demo) writeStore(next);
    setPaired(next);
  }, []);

  useEffect(() => {
    // Le mode démo n'existe QUE sur une preview : sur bemexo.com, `?demo=1` est ignoré.
    const demo = isPreviewHost() && new URLSearchParams(window.location.search).get('demo') === '1';
    const p = demo ? { ...DEMO, board: demoBoard(Date.now()), boardAt: Date.now() } : readStore();
    pairedRef.current = p;
    setPaired(p);
    setReady(true);
  }, []);

  useWakeLock(!!paired);

  // Retirée par le bureau (ou activation coupée) : on oublie tout, tout de
  // suite. Une panne réseau, elle, ne fait rien perdre.
  const forget = useCallback((status: number) => {
    commit(null);
    setNotice(status === 403 ? 'La borne de pointage a été désactivée pour cette entreprise.' : 'Cette borne a été retirée par le bureau. Saisissez un nouveau code pour la réinstaller.');
  }, [commit]);

  const sync = useCallback(async (p: Paired) => {
    if (p.demo) return;
    const { data, status } = await callKiosk<{
      revoked: boolean; kiosk_name: string; company_name: string; settings: KioskSettings;
    }>({ action: 'sync', kiosk_id: p.kioskId, token: p.token });
    const cur = pairedRef.current;
    if (!cur || cur.kioskId !== p.kioskId) return;
    if (data && !data.revoked) {
      // L'ancien planning du jour (`planning`) n'est plus gardé.
      const { planning: _old, ...rest } = cur;
      void _old;
      commit({ ...rest, kioskName: data.kiosk_name, companyName: data.company_name, settings: data.settings, syncedAt: Date.now() });
      setOnline(true);
      return;
    }
    if (status === 401 || status === 410 || status === 403) { forget(status); return; }
    setOnline(false);
  }, [commit, forget]);

  const fetchBoard = useCallback(async (p: Paired) => {
    if (p.demo) return;
    const { data, status } = await callKiosk<KioskBoard>({ action: 'board', kiosk_id: p.kioskId, token: p.token });
    const cur = pairedRef.current;
    if (!cur || cur.kioskId !== p.kioskId) return;
    if (data && isKioskBoard(data)) {
      commit({ ...cur, board: data, boardAt: Date.now() });
      setBoardErr(false); setOnline(true);
      return;
    }
    if (status === 401 || status === 410 || status === 403) { forget(status); return; }
    // Toute autre erreur (réseau, « Action inconnue » d'une fonction pas encore
    // redéployée…) : on garde le dernier planning ; sans lui, « indisponible ».
    setBoardErr(true);
    if (!status) setOnline(false);
  }, [commit, forget]);

  const awake = () => {
    const p = pairedRef.current;
    if (!p) return false;
    return Date.now() <= awakeRef.current || !isAsleep(parisTime(Date.now()), p.settings.active_from, p.settings.active_until);
  };
  const tickBoard = useRef<() => void>(() => {});
  tickBoard.current = () => {
    const p = pairedRef.current;
    if (!p || p.demo) return;
    if (document.visibilityState !== 'visible' || !navigator.onLine || !awake()) return;
    fetchBoard(p);
  };

  useEffect(() => {
    const p0 = pairedRef.current;
    if (!p0 || p0.demo) return;
    sync(p0);
    fetchBoard(p0);
    const idSync = setInterval(() => { const p = pairedRef.current; if (p) sync(p); }, SYNC_EVERY_MS);
    const idBoard = setInterval(() => tickBoard.current(), BOARD_EVERY_MS);
    const onOnline = () => { const p = pairedRef.current; if (p) { sync(p); fetchBoard(p); } };
    const onOffline = () => setOnline(false);
    const onVis = () => {
      const p = pairedRef.current;
      if (document.visibilityState === 'visible' && p && (!p.boardAt || Date.now() - p.boardAt >= BOARD_EVERY_MS)) tickBoard.current();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(idSync); clearInterval(idBoard);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVis);
    };
    // Une seule boucle par appairage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paired?.kioskId, sync, fetchBoard]);

  const onWake = useCallback((until: number) => {
    awakeRef.current = until;
    setAwakeUntil(until);
    // Réveillée après la veille : le planning a pu changer, on le relit sans attendre.
    const p = pairedRef.current;
    if (p && !p.demo && (!p.boardAt || Date.now() - p.boardAt >= BOARD_EVERY_MS)) tickBoard.current();
  }, []);

  if (!ready) return <style dangerouslySetInnerHTML={{ __html: CSS }} />;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {paired ? (
        <Display
          paired={paired}
          online={online}
          boardErr={boardErr}
          awakeUntil={awakeUntil}
          onWake={onWake}
          onUnpair={() => { commit(null); setNotice(null); setBoardErr(false); }}
        />
      ) : (
        <Pairing onPaired={(p) => { commit(p); setNotice(null); setBoardErr(false); }} notice={notice} />
      )}
      <FullscreenToggle />
    </>
  );
}
