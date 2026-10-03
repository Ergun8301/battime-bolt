'use client';

// Borne de pointage — l'écran de la tablette posée à l'entrée (lot 1, lot 9).
//
// DEUX ÉTATS SEULEMENT :
//   1. pas encore reliée → un champ pour le code à 6 chiffres affiché par le
//      bureau (bouton 📟 Borne). Lot 11 : le QR du bureau ouvre /borne?code=…
//      → code déjà rempli, un toucher sur « Relier ». UNE tablette par
//      entreprise : en relier une nouvelle déconnecte l'ancienne ;
//   2. reliée → le PLANNING DE LA SEMAINE, en lecture seule (la même grille
//      que le bureau), sous UNE barre fine (lot 11) : à gauche le logo BEMEXO
//      et le nom de l'entreprise (même taille) avec un petit point de
//      connexion, au centre la date et l'heure, à droite « QR » et l'icône
//      plein écran. Le QR s'affiche en grand ; retour au planning tout seul
//      après 30 s, ou au toucher.
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
// le bouton « QR » marche dans tous les cas.
//
// Plein écran : une petite icône toujours visible en haut à droite, au-dessus
// du QR et de la veille. « Déconnecter » n'est pas affiché (c'est un geste du
// bureau) : appui long de 5 s sur le logo / le nom de l'entreprise, puis
// confirmation ; la tablette prévient alors le serveur (action `unpair`) pour
// que le bureau la voie « Aucune tablette reliée ». Le bureau peut aussi la
// déconnecter à distance.
//
// Lot 10 : les relectures automatiques ne redessinent rien quand le planning
// n'a pas changé (même objet gardé, feuilles de style jamais réécrites). Lot 11 :
// la date et l'heure sont toutes deux dans `.kb-clock` (seule zone de la barre
// qui change avec le temps).
//
// ?demo=1 : aperçu sans appairage (graine fictive, QR non valable, semaine
// fictive construite par le même `buildBoard` que la fonction), seulement sur
// une preview.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { codeAt, fromBase64Url, scanUrl, stepAt } from '../../supabase/functions/_shared/kiosk-code';
import { isAsleep, parisLongDate, parisTime } from '../../supabase/functions/_shared/kiosk-rules';
import { buildBoard, isKioskBoard, parisWeek, type BoardPlanning, type BoardSession } from '../../supabase/functions/_shared/kiosk-board';
import { parisDay, parisHHmm } from '../../supabase/functions/_shared/live-place';
import { callKiosk, type KioskBoard, type KioskPlanningRow, type KioskSettings } from '@/lib/kiosk-client';
import KioskWeekGrid from '@/components/kiosk-week-grid';
import { isPreviewHost } from '@/lib/hosting';

const STORE_KEY = 'bx_kiosk_v1';
const SYNC_EVERY_MS = 5 * 60 * 1000;
const BOARD_EVERY_MS = 30 * 1000;
/** Au-delà, les « en cours depuis » du cache ne sont plus montrés. */
const LIVE_FRESH_MS = 2 * 60 * 1000;
/** Lot 11 : le QR reste affiché 30 s, puis la tablette revient au planning. */
const QR_SHOW_MS = 30 * 1000;
const WAKE_ON_TOUCH_MS = 60 * 1000;
/** Appui long sur le logo / le nom de l'entreprise pour déconnecter (geste du bureau). */
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
    { id: 'demo-thomas', first_name: 'Bastien', last_name: 'Lefèvre' },
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
    // Bastien est passé au dépôt, qui n'est pas à son planning → ligne à part
    // (en haut de la liste : visible sans faire défiler sur la capture).
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

/**
 * Même contenu ? (lot 10) Les relectures automatiques rendent presque toujours
 * le même planning : on garde alors l'objet déjà affiché, et la grille (memo)
 * ne se redessine pas. Objets JSON simples, rendus par la fonction kiosk.
 */
function sameData<T>(a: T, b: T): boolean {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

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
/* Lot 11 — UNE barre fine en haut, le planning prend tout le reste.
   --kb-logo : hauteur du logo BEMEXO ; le nom de l'entreprise est réglé pour
   paraître de la même taille (les lettres du logo occupent ~83 % de sa hauteur). */
:root{--kb-bar-h:clamp(48px,7vmin,64px);--kb-pad-top:8px;--kb-logo:clamp(15px,2.4vmin,22px)}
.kb-grid{height:100%;display:grid;grid-template-rows:auto minmax(0,1fr);padding:var(--kb-pad-top) 12px 10px;gap:8px}
.kb-top{height:var(--kb-bar-h);display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:16px;min-width:0}
/* Gauche : logo + entreprise + point de connexion. Porte l'appui long de 5 s
   (déconnexion, geste du bureau). */
.kb-brand{display:flex;align-items:center;gap:calc(var(--kb-logo) * .55);min-width:0;height:100%;overflow:hidden;padding-left:4px;margin-left:-4px;cursor:default;-webkit-tap-highlight-color:transparent}
.kb-logo{height:var(--kb-logo);width:auto;flex:none;display:block}
.kb-company{font-weight:800;font-size:calc(var(--kb-logo) * 1.15);line-height:1.1;letter-spacing:-.01em;color:#F2EDE3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.kb-dot{width:8px;height:8px;border-radius:50%;background:#2FD584;box-shadow:0 0 0 3px rgba(47,213,132,.18);flex:none}
.kb-dot.off{background:#F0915A;box-shadow:0 0 0 3px rgba(240,145,90,.2)}
/* Planning affiché ancien (hors ligne) : son heure passe avant la fin du nom. */
.kb-stamp{font-size:12px;font-weight:700;color:#F0915A;white-space:nowrap;flex:none}
/* Centre : la date et l'heure, bien lisibles (toutes deux dans .kb-clock). */
.kb-clock{display:flex;align-items:baseline;justify-content:center;gap:.55em;white-space:nowrap;line-height:1}
.kb-date{font-weight:700;font-size:calc(var(--kb-logo) * 1.1);color:#e2dacb;letter-spacing:-.005em}
.kb-time{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:clamp(24px,4.6vmin,40px);letter-spacing:-.03em;color:#FFC21A}
/* Droite : « QR ». La place de l'icône plein écran (fixe) est réservée. */
.kb-right{display:flex;justify-content:flex-end;align-items:center;min-width:0}
.kb-has-fs .kb-right{padding-right:46px}
.kb-go{display:inline-flex;align-items:center;gap:.5em;flex:none;border:none;cursor:pointer;background:#FFC21A;color:#15120F;font-family:inherit;font-weight:900;font-size:calc(var(--kb-logo) * 1.1);letter-spacing:.02em;line-height:1;padding:calc(var(--kb-bar-h) * .2) calc(var(--kb-bar-h) * .34);border-radius:12px;box-shadow:0 4px 0 #C99300}
.kb-go:active{transform:translateY(3px);box-shadow:0 1px 0 #C99300}
.kb-go svg{width:1.2em;height:1.2em;flex:none}
.kb-main{min-height:0;display:flex;flex-direction:column}
.kb-main>.kb-week{flex:1}
.kb-unavail{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;border:1.5px dashed rgba(242,237,227,.2);border-radius:16px;text-align:center;padding:24px;font-weight:900;font-size:clamp(20px,3vmin,30px)}
.kb-unavail small{font-weight:600;font-size:clamp(13px,1.8vmin,16px);color:#a59c86}
.kb-btn{border:1.5px solid rgba(242,237,227,.25);background:transparent;color:#F2EDE3;border-radius:10px;padding:10px 16px;font:inherit;font-weight:800;cursor:pointer}
.kb-btn.yes{background:#15120F;border-color:#15120F;color:#F2EDE3}
.kb-btn.no{color:#15120F;border-color:rgba(21,18,15,.3)}
.kb-demo{position:absolute;top:8px;left:50%;transform:translateX(-50%);z-index:35;background:#FFC21A;color:#15120F;font-weight:900;font-size:12px;letter-spacing:.08em;text-transform:uppercase;border-radius:99px;padding:5px 12px;pointer-events:none}
/* Le QR, en plein écran, par-dessus le planning */
.kb-qrview{position:absolute;inset:0;z-index:30;background:#15120F;display:grid;grid-template-rows:auto minmax(0,1fr) auto;padding:var(--kb-pad-top) 12px clamp(12px,2vmin,22px);gap:clamp(10px,1.8vmin,18px);cursor:pointer}
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
/* Plein écran : petite icône, toujours visible en haut à droite (centrée sur
   la barre), au-dessus du QR, de la veille et de l'appairage. */
.kb-fs{position:fixed;right:12px;top:calc(var(--kb-pad-top) + (var(--kb-bar-h) - 36px) / 2);z-index:60;width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;border:1.5px solid rgba(242,237,227,.28);background:rgba(21,18,15,.9);color:#F2EDE3;border-radius:10px;padding:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
.kb-fs svg{width:16px;height:16px;flex:none}
/* Portrait : date au-dessus de l'heure (plus de place pour le nom). */
@media (orientation:portrait){
  :root{--kb-logo:clamp(13px,2.1vmin,18px)}
  .kb-clock{flex-direction:column;align-items:center;gap:3px}
  .kb-date{font-size:calc(var(--kb-logo) * 1.05)}
  .kb-time{font-size:clamp(22px,3.6vmin,32px)}
  .kb-qr{width:min(80vw,560px)}
}
/* Téléphone : l'heure seule au centre. */
@media (max-width:600px){
  .kb-date,.kb-stamp{display:none}
  .kb-top{gap:10px}
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

// Toujours le MÊME objet : React réécrit le contenu d'un <style> dès que l'objet
// `dangerouslySetInnerHTML` change, et une feuille réécrite recharge son
// `@import` des polices → texte qui clignote à chaque relecture du planning.
const CSS_HTML = { __html: CSS };

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

function Pairing({ onPaired, notice, initialCode }: { onPaired: (p: Paired) => void; notice: string | null; initialCode: string }) {
  // Lot 11 : ouverte depuis le QR du bureau (/borne?code=123456), le code est
  // déjà rempli : un seul toucher sur « Relier ».
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(notice);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) { setErr('Le code fait 6 chiffres.'); return; }
    setBusy(true); setErr(null);
    // Lot 11 : plus de position (plus de contrôle « sur place »).
    const { data, error } = await callKiosk<{
      kiosk_id: string; token: string; seed: string; kiosk_name: string; company_name: string; settings: KioskSettings;
    }>({ action: 'pair', code });
    setBusy(false);
    if (!data) { setErr(error || 'Liaison impossible.'); return; }
    onPaired({
      kioskId: data.kiosk_id, token: data.token, seed: data.seed,
      companyName: data.company_name, kioskName: data.kiosk_name,
      settings: data.settings, board: null, boardAt: null, syncedAt: Date.now(),
    });
  };

  return (
    <div className="kp">
      <form className="kp-card" onSubmit={submit} data-testid="kb-pairing">
        <div className="kp-logo"><img src="/bemexo-wordmark-light.svg" alt="BEMEXO" /></div>
        <h1 className="kp-h1">Relier cette tablette</h1>
        <p className="kp-p">Tapez le code à 6 chiffres affiché dans BEMEXO (bouton 📟 Borne).</p>
        {err && <div className="kp-err" role="alert">{err}</div>}
        <input
          className="kp-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus={!initialCode}
          aria-label="Code à 6 chiffres" placeholder="000000"
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
        <button className="kp-btn" type="submit" autoFocus={!!initialCode} disabled={busy || code.length !== 6}>{busy ? 'Liaison…' : 'Relier'}</button>
        <p className="kp-note">Une seule tablette par entreprise : en relier une nouvelle déconnecte l&apos;ancienne.</p>
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

type PressHandlers = Pick<React.HTMLAttributes<HTMLDivElement>, 'onPointerDown' | 'onPointerUp' | 'onPointerLeave' | 'onPointerCancel' | 'onContextMenu'>;

/**
 * Lot 11 — la seule barre de la tablette. Gauche : logo + entreprise + point
 * de connexion (et, si le planning affiché est ancien, son heure). Centre :
 * date + heure. Droite : « QR » (absent sur l'écran du QR lui-même).
 * `main` : la barre du planning (repères de test, appui long).
 */
function TopBar({ main, companyName, online, stamp, dateText, hhmm, onQr, press }: {
  main: boolean;
  companyName: string;
  online: boolean;
  stamp: string | null;
  dateText: string;
  hhmm: string;
  onQr?: () => void;
  press?: PressHandlers;
}) {
  const tid = (id: string) => (main ? id : undefined);
  const dotLabel = online ? 'Connectée' : 'Hors ligne — le QR reste valable';
  return (
    <header className="kb-top" data-testid={tid('kb-top')}>
      <div className="kb-brand" data-testid={tid('kb-brand')} {...press}>
        <img className="kb-logo" data-testid={tid('kb-logo')} src="/bemexo-wordmark-light.svg" alt="BEMEXO" draggable={false} />
        {companyName && <span className="kb-company" data-testid={tid('kb-company')}>{companyName}</span>}
        <span className={`kb-dot${online ? '' : ' off'}`} data-testid={tid('kb-online')} role="img" aria-label={dotLabel} title={dotLabel} />
        {stamp && <span className="kb-stamp">{stamp}</span>}
      </div>
      <div className="kb-clock" aria-label={`${dateText}, il est ${hhmm}`}>
        <span className="kb-date" data-testid={tid('kb-date')}>{dateText}</span>
        <span className="kb-time" data-testid={tid('kb-time')}>{hhmm}</span>
      </div>
      <div className="kb-right">
        {onQr && (
          <button type="button" className="kb-go" data-testid="kb-pointer" onClick={onQr} aria-label="Afficher le QR pour pointer">
            <QrIcon />QR
          </button>
        )}
      </div>
    </header>
  );
}

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

  // Retour au planning 30 s après l'ouverture du QR (ou au toucher).
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

  // Même objet tant que le QR ne change pas : la borne se redessine chaque
  // seconde (horloge), le QR, lui, seulement à chaque nouvelle minute.
  const qrHtml = useMemo(() => ({ __html: svg }), [svg]);

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
  const stamp = stale && paired.boardAt
    ? `Planning du ${new Date(paired.boardAt).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short' })} à ${parisTime(paired.boardAt)}`
    : null;
  // La date ne change qu'à minuit : recalculée seulement quand le jour change.
  const dateText = useMemo(() => parisLongDate(Date.parse(`${today}T12:00:00Z`)), [today]);
  const pressHandlers: PressHandlers = {
    onPointerDown: startPress, onPointerUp: cancelPress, onPointerLeave: cancelPress, onPointerCancel: cancelPress,
    onContextMenu: (e) => e.preventDefault(),
  };

  return (
    <div className="kb">
      {paired.demo && <div className="kb-demo">Mode démo · QR non valable</div>}
      <div className="kb-grid">
        <TopBar main companyName={paired.companyName} online={online} stamp={stamp} dateText={dateText} hhmm={hhmm} onQr={openQr} press={pressHandlers} />

        <main className="kb-main">
          {board ? (
            <KioskWeekGrid board={board} today={today} showLive={showLive} />
          ) : (
            <div className="kb-unavail" data-testid="kb-unavailable">
              {boardErr || !online ? 'Planning indisponible' : 'Chargement du planning…'}
              <small>Pour pointer, touchez « QR ».</small>
            </div>
          )}
        </main>
      </div>

      {qrOpen && (
        <div className="kb-qrview" data-testid="kb-qr-overlay" onClick={closeQr} role="dialog" aria-label="QR de pointage">
          <TopBar main={false} companyName={paired.companyName} online={online} stamp={null} dateText={dateText} hhmm={hhmm} />
          <div className="kb-qrmain">
            <div className="kb-qrcard">
              <div className="kb-qr" aria-label="QR de pointage" dangerouslySetInnerHTML={qrHtml} />
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
        <div className="kb-confirm" role="dialog" aria-label="Déconnecter la tablette">
          <div className="kb-confirm-card" data-testid="kb-unpair-confirm">
            <h2>Déconnecter cette tablette ?</h2>
            <p>Il faudra un nouveau code du bureau pour la relier. Le bureau peut aussi la déconnecter à distance.</p>
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

/**
 * Lot 11 : petite icône seule, toujours visible (sauf navigateur sans plein
 * écran, ex. iPhone). Échap marche aussi, nativement. Quand elle existe, la
 * barre lui réserve sa place à droite (classe `kb-has-fs` sur <html>).
 */
function FullscreenToggle() {
  const [supported, setSupported] = useState(false);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const ok = fsSupported();
    setSupported(ok);
    document.documentElement.classList.toggle('kb-has-fs', ok);
    const on = () => setFull(isFullscreen());
    document.addEventListener('fullscreenchange', on);
    document.addEventListener('webkitfullscreenchange', on);
    on();
    return () => {
      document.documentElement.classList.remove('kb-has-fs');
      document.removeEventListener('fullscreenchange', on);
      document.removeEventListener('webkitfullscreenchange', on);
    };
  }, []);
  if (!supported) return null;
  const label = full ? 'Quitter le plein écran' : 'Plein écran';
  return (
    <button
      type="button"
      className="kb-fs"
      data-testid="kb-fullscreen"
      aria-pressed={full}
      aria-label={label}
      title={label}
      onClick={(e) => { e.stopPropagation(); if (isFullscreen()) exitFullscreen(); else enterFullscreen(); }}
    >
      <FsIcon out={full} />
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
  /** Lot 11 : code arrivé par le QR du bureau (/borne?code=…), pré-rempli. */
  const [urlCode, setUrlCode] = useState('');
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
    const q = new URLSearchParams(window.location.search);
    const demo = isPreviewHost() && q.get('demo') === '1';
    // Lot 11 : le QR de la fenêtre « Borne » du bureau ouvre /borne?code=123456.
    // Le code ne doit pas rester dans l'adresse (historique, retour arrière) :
    // on l'en retire tout de suite, comme /pointer le fait pour le QR de pointage.
    if (q.has('code')) {
      const c = (q.get('code') || '').replace(/\D/g, '').slice(0, 6);
      if (c.length === 6) setUrlCode(c);
      q.delete('code');
      const rest = q.toString();
      window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
    }
    const p = demo ? { ...DEMO, board: demoBoard(Date.now()), boardAt: Date.now() } : readStore();
    pairedRef.current = p;
    setPaired(p);
    setReady(true);
  }, []);

  useWakeLock(!!paired);

  // Déconnectée par le bureau ou remplacée par une autre tablette (ou
  // activation coupée) : on oublie tout, tout de suite. Une panne réseau, elle,
  // ne fait rien perdre.
  const forget = useCallback((status: number) => {
    commit(null);
    setNotice(status === 403 ? 'La borne de pointage a été désactivée pour cette entreprise.' : 'Tablette déconnectée par le bureau (ou remplacée par une autre). Tapez un nouveau code pour la relier.');
  }, [commit]);

  // Lot 11 : « Oui, déconnecter » sur la tablette. On prévient le serveur
  // (avec le jeton de la tablette) pour que le bureau voie « Aucune tablette
  // reliée », puis on oublie tout ici, sans attendre (hors ligne aussi).
  const unpairHere = useCallback(() => {
    const p = pairedRef.current;
    if (p && !p.demo) void callKiosk({ action: 'unpair', kiosk_id: p.kioskId, token: p.token });
    commit(null); setNotice(null); setBoardErr(false);
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
      // Réglages identiques : on garde le même objet (rien à redessiner).
      const settings = sameData(rest.settings, data.settings) ? rest.settings : data.settings;
      commit({ ...rest, kioskName: data.kiosk_name, companyName: data.company_name, settings, syncedAt: Date.now() });
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
      // Planning identique : on garde l'objet affiché (seule l'heure de fraîcheur avance).
      commit({ ...cur, board: cur.board && sameData(cur.board, data) ? cur.board : data, boardAt: Date.now() });
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

  if (!ready) return <style dangerouslySetInnerHTML={CSS_HTML} />;

  return (
    <>
      <style dangerouslySetInnerHTML={CSS_HTML} />
      {paired ? (
        <Display
          paired={paired}
          online={online}
          boardErr={boardErr}
          awakeUntil={awakeUntil}
          onWake={onWake}
          onUnpair={unpairHere}
        />
      ) : (
        <Pairing
          key={urlCode}
          initialCode={urlCode}
          onPaired={(p) => { commit(p); setNotice(null); setBoardErr(false); setUrlCode(''); }}
          notice={notice}
        />
      )}
      <FullscreenToggle />
    </>
  );
}
