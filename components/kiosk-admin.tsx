'use client';

// Bouton « 📟 Borne » du bureau (et Réglages → Borne & pointage) — lot 1, lot 11.
// Visible SEULEMENT si l'entreprise a `kiosk_enabled` (voir admin-planning.tsx
// et company-settings.tsx).
//
// Lot 11 — UNE tablette par entreprise, rien à configurer :
//   · le code à 6 chiffres s'affiche dès l'ouverture (avec un petit QR qui
//     ouvre /borne?code=… sur la tablette : rien à taper). Il se renouvelle
//     tout seul une minute avant d'expirer, tant que la fenêtre est visible ;
//     fermer la fenêtre (ou passer au code suivant) le périme ;
//   · lot 11 (IA) : c'est le SECOURS. Le plus simple est que la tablette affiche
//     son propre QR, que le patron scanne avec son téléphone (components/
//     kiosk-pair-confirm.tsx). Quand une tablette est déjà reliée, le code
//     reste caché derrière « Relier une autre tablette » : l'ouvrir ne remplace
//     plus la tablette en silence (un code est créé à chaque ouverture, et la
//     tablette qui le tape remplace l'ancienne) ;
//   · l'état, relu toutes les 5 s : « Tablette reliée — vue il y a X min »
//     (point vert, orange au-delà de 15 min) ou « Aucune tablette reliée » ;
//   · relier une nouvelle tablette remplace l'ancienne (la fonction `kiosk` le
//     fait ; en secours, tant que l'ancienne fonction tourne, cette fenêtre
//     déconnecte elle-même les anciennes) ;
//   · un seul lien discret « Déconnecter la tablette » (confirmation sur place) ;
//   · « Horaires d'ouverture » (facultatifs) : enregistrés dès qu'ils changent.
// Lot 2 (IA) : « Installer la tablette », une aide courte, repliée par défaut
// (icône d'écran d'accueil, verrouillage automatique sur « Jamais »…).
// Plus de liste, plus de « Ajouter une borne », plus de lieu ni de nom, plus de GPS.
//
// Lot 30 — l'ÉTAT DE L'ÉCRAN de la tablette, en clair sous « Tablette reliée » :
// « L'écran de la tablette peut s'éteindre : réglez la mise en veille sur
// Jamais », « Ouvrez la borne depuis l'icône installée », « Tablette hors ligne
// depuis … » (components/kiosk-health.tsx). Seulement si la tablette a envoyé son
// état (migration + fonction `kiosk` + page à jour) ; sinon rien, comme avant.
// La lecture tente les colonnes neuves, puis retombe sur celles d'avant (42703).
//
// Lot 12 — « QR fixe à imprimer » (option, désactivée par défaut) : une section
// repliée sous les horaires (components/kiosk-fixed-qr.tsx, chargée seulement
// quand la fenêtre s'ouvre). Le QR fixe est une ligne « fixe » de `kiosks` :
// elle n'est JAMAIS comptée ici comme une tablette (ni « Tablette reliée », ni
// déconnectée par « Déconnecter la tablette » ou par le secours ci-dessous).
// Tant que la migration n'est pas passée, la section n'apparaît pas.
//
// Toutes les écritures passent par la fonction `kiosk` (qui revérifie le rôle
// admin et l'interrupteur) ; ici on ne fait que LIRE, sous RLS. Les relectures
// gardent le même objet quand rien n'a changé (keep) : rien ne se redessine.

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import qrcode from 'qrcode-generator';
import { Check, Copy, MonitorSmartphone } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { keep } from '@/lib/same';
import { readSupportSession } from '@/lib/support';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InfoTip } from '@/components/ui/info-tip';
import { TimeField } from '@/components/time-field';
import { callKiosk, type KioskPairingCode, type KioskSettings } from '@/lib/kiosk-client';
import { kioskNotices } from '../supabase/functions/_shared/kiosk-client-state';
import { KioskNotices } from '@/components/kiosk-health';
import { useBureauUi2 } from '@/lib/use-bureau-ui2';

// Lot 12 : la section du QR fixe, chargée seulement à l'ouverture de la fenêtre.
const KioskFixedQr = dynamic(() => import('@/components/kiosk-fixed-qr'), { ssr: false });
// Design bureau (v2, ?ui=2 sur aperçu) : coque v2 (panneau, feuille lot3b-v2.css) et la question « Déconnecter la tablette ? » en fenêtre (RG10),
// chargées en différé seulement quand le drapeau est actif. Le contenu, l'état et les appels à la fonction `kiosk` sont les MÊMES.
const CoqueL3 = lazy(() => import('@/components/design/bureau/lot3b-v2').then((m) => ({ default: m.CoqueL3 })));
const DeconnecterV2 = lazy(() => import('@/components/design/bureau/lot3b-v2').then((m) => ({ default: m.DeconnecterV2 })));

interface Props { open: boolean; onOpenChange: (o: boolean) => void; companyId: string }

interface KioskRow {
  id: string; created_at: string; last_seen_at: string | null; kind?: string | null;
  /** Lot 30 : l'état de l'écran de la tablette (absent tant que la migration n'est pas passée). */
  client_state?: unknown; client_state_at?: string | null;
}
/** Lot 30 : colonnes lues, de la plus complète à la lecture d'avant (colonne absente = 42703, on descend d'un cran). */
const KIOSK_COLUMNS = [
  'id, created_at, last_seen_at, kind, client_state, client_state_at',
  'id, created_at, last_seen_at, kind',
  'id, created_at, last_seen_at',
];
interface Pairing extends KioskPairingCode { receivedAt: number }

/** Durée de vie d'un code côté serveur (fonction kiosk : PAIRING_TTL_MS). */
const PAIRING_TTL_MS = 10 * 60 * 1000;
/** Le code est remplacé une minute avant d'expirer. */
const RENEW_BEFORE_MS = 60 * 1000;
/** Relecture de l'état de la tablette, fenêtre ouverte. */
const POLL_MS = 5 * 1000;
/** Au-delà, le point passe à l'orange (la tablette se signale toutes les 5 min). */
const LATE_MS = 15 * 60 * 1000;

/** « vue à l'instant », « vue il y a 3 min », « vue il y a 2 h », « vue il y a 4 j ». */
export function seenLabel(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60000);
  if (min < 1) return 'vue à l’instant';
  if (min < 60) return `vue il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vue il y a ${h} h`;
  return `vue il y a ${Math.floor(h / 24)} j`;
}

const CSS = `
.ka{display:flex;flex-direction:column;gap:14px;font-family:'Archivo',sans-serif;color:#15120F;min-width:0}
.ka-status{display:flex;align-items:center;flex-wrap:wrap;gap:8px 10px;font-size:14.5px;font-weight:800;min-width:0;min-height:30px}
.ka-dot{width:10px;height:10px;border-radius:50%;flex:none;background:#c4bdae}
.ka-dot.on{background:#2FD584;box-shadow:0 0 0 4px rgba(47,213,132,.18)}
.ka-dot.late{background:#F0915A;box-shadow:0 0 0 4px rgba(240,145,90,.2)}
.ka-status-t{min-width:0}
.ka-muted{color:#8a8378;font-weight:600}
.ka-link{margin-left:auto;background:none;border:0;padding:4px 0;font:inherit;font-size:13px;font-weight:700;color:#8a8378;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.ka-link:hover{color:#C0461F}
.ka-confirm{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-left:auto;font-size:13px;font-weight:700}
.ka-btn{display:inline-flex;align-items:center;gap:6px;border:1.5px solid #15120F;background:#fff;border-radius:10px;padding:6px 11px;font-weight:800;font-size:13px;color:#15120F;cursor:pointer;font-family:inherit;white-space:nowrap}
.ka-btn.danger{border-color:rgba(192,70,31,.45);color:#C0461F}
.ka-btn:disabled{opacity:.6;cursor:default}
.ka-code{background:#15120F;color:#F2EDE3;border-radius:16px;padding:16px 18px;display:flex;align-items:center;gap:16px;min-width:0}
.ka-code-main{flex:1;min-width:0}
.ka-code-l{display:flex;align-items:center;gap:4px;font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#a59c86;font-weight:700}
.ka-code-l button{color:#a59c86!important}
.ka-code-l button:hover{color:#F2EDE3!important}
.ka-digrow{display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;margin:4px 0}
/* Lot 13 : 6 chiffres SANS caractère espace (copier-coller exact) ; l'écart
   visuel entre les deux groupes est une marge CSS, pas un espace. */
.ka-digits{display:block;font-family:'JetBrains Mono',monospace;font-size:clamp(32px,9vw,46px);letter-spacing:.12em;color:#FFC21A;line-height:1.15;font-weight:700;white-space:nowrap;user-select:all;-webkit-user-select:all}
.ka-digits .ka-d3{margin-right:.4em}
.ka-copy{display:inline-flex;align-items:center;gap:6px;border:1.5px solid rgba(242,237,227,.4);background:transparent;color:#F2EDE3;border-radius:10px;padding:6px 10px;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;white-space:nowrap}
.ka-copy:hover{border-color:#F2EDE3}
.ka-copy.ok{border-color:#2FD584;color:#2FD584}
.ka-how a{color:#F2EDE3;font-weight:800;text-decoration:underline;text-underline-offset:2px;overflow-wrap:anywhere}
.ka-howrow{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px}
.ka-qrfig{flex:none;margin:0;display:flex;flex-direction:column;align-items:center;gap:6px}
.ka-qrcap{font-size:11px;font-weight:700;color:#a59c86;text-align:center;max-width:110px;line-height:1.3}
.ka-intro{margin:0;font-size:13.5px;font-weight:600;line-height:1.45;color:#3d3933}
.ka-replace-warn{margin:0;font-size:13.5px;font-weight:800;line-height:1.45;color:#C0461F}
.ka-another{display:flex;flex-direction:column;align-items:flex-start;gap:10px}
.ka-another p{margin:0;font-size:13.5px;font-weight:600;line-height:1.45;color:#3d3933}
.ka-another .ka-btn{min-height:44px;background:#FFC21A;border-color:#FFC21A}
.ka-digits.wait{opacity:.3}
.ka-how{font-size:13px;color:#cfc7b6;font-weight:600;line-height:1.45;margin:0}
.ka-how b{color:#F2EDE3;font-weight:800}
.ka-err{font-weight:900;font-size:18px;color:#F2EDE3;margin:6px 0 4px}
.ka-retry{margin-top:8px;border:none;background:#FFC21A;color:#15120F;font:inherit;font-weight:900;font-size:13px;border-radius:10px;padding:7px 12px;cursor:pointer;box-shadow:0 3px 0 #C99300}
.ka-qr{width:92px;height:92px;flex:none;background:#fff;border-radius:10px;padding:6px}
.ka-qr svg{width:100%;height:100%;display:block}
.ka-sec{background:#FBF8F2;border:1px solid rgba(21,18,15,.1);border-radius:14px;padding:12px 14px}
.ka-l{display:flex;align-items:center;gap:6px;font-weight:800;font-size:14px;margin:0 0 8px}
.ka-l small{font-weight:600;color:#9a948a;font-size:13px}
.ka-hours{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.ka-tf{width:7.5rem;flex:none}
.ka-chip{border:1.5px solid rgba(21,18,15,.22);background:#fff;border-radius:99px;padding:7px 12px;font:inherit;font-size:13px;font-weight:800;color:#15120F;cursor:pointer;white-space:nowrap}
.ka-chip[aria-pressed=true]{background:#FFC21A;border-color:#FFC21A}
.ka-save{font-size:12.5px;font-weight:700;color:#8a8378;margin:8px 0 0;min-height:1.2em}
.ka-save.ok{color:#1F7A4D}
.ka-save.bad{color:#C0461F}
.ka-help{border:1px solid rgba(21,18,15,.1);border-radius:14px;background:#fff}
.ka-help summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;padding:10px 14px;font-weight:800;font-size:14px}
.ka-help summary::-webkit-details-marker{display:none}
.ka-help summary::after{content:'';margin-left:auto;width:7px;height:7px;border-right:2px solid #8a8378;border-bottom:2px solid #8a8378;transform:rotate(45deg) translateY(-2px)}
.ka-help[open] summary::after{transform:rotate(-135deg) translateY(-2px)}
.ka-help summary small{font-weight:600;color:#9a948a;font-size:13px}
.ka-help ol{margin:0;padding:0 14px 12px 32px;list-style:decimal;display:flex;flex-direction:column;gap:7px;font-size:13px;line-height:1.45;color:#3d3933;font-weight:500}
.ka-help li::marker{font-weight:800;color:#8a8378}
.ka-help li b{font-weight:800;color:#15120F}
.ka-help .ka-muted{font-weight:500}
@media(max-width:420px){.ka-qr{width:76px;height:76px}.ka-code{padding:14px;gap:12px}}
`;

// Objet FIXE : un `{ __html }` neuf à chaque rendu fait réécrire la feuille
// de style par React (re-calcul de la page, polices rechargées → flash).
const CSS_HTML = { __html: CSS };

type HoursState = 'idle' | 'saving' | 'saved' | 'half-from' | 'half-until' | 'error';
/** Lecture des tablettes à l'ouverture : elle décide si le code est montré ou caché. */
type ReadState = 'loading' | 'ok' | 'failed';

/** Périme un code qui n'est plus affiché (sans attendre la réponse). */
function cancelCode(p: KioskPairingCode | null) {
  if (p?.pairing_id) void callKiosk({ action: 'cancel_pairing', pairing_id: p.pairing_id });
}

/**
 * Durée de vie d'un code, mesurée avec l'horloge de CET ordinateur (qui peut
 * différer de celle du serveur) : jamais plus de 10 min, jamais moins de 90 s
 * (pas de boucle de renouvellement si l'heure de l'ordinateur est fausse).
 */
function codeLife(p: Pairing): number {
  const exp = Date.parse(p.expires_at);
  return Number.isFinite(exp)
    ? Math.min(Math.max(exp - p.receivedAt, RENEW_BEFORE_MS + 30_000), PAIRING_TTL_MS)
    : PAIRING_TTL_MS;
}

export default function KioskAdmin({ open, onOpenChange, companyId }: Props) {
  /** Tablettes actives (null = pas encore lu). */
  const [kiosks, setKiosks] = useState<KioskRow[] | null>(null);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [hours, setHours] = useState<{ from: string; until: string } | null>(null);
  const [hoursState, setHoursState] = useState<HoursState>('idle');
  const [confirmDisc, setConfirmDisc] = useState(false);
  const [discBusy, setDiscBusy] = useState(false);
  const [readState, setReadState] = useState<ReadState>('loading');
  /** « Relier une autre tablette » touché : le code est montré malgré la tablette reliée. */
  const [reveal, setReveal] = useState(false);
  // Seule la minute compte pour « vue il y a X min » : un rendu par minute.
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60000));

  const openRef = useRef(false);
  const pairingRef = useRef<Pairing | null>(null);
  const codeSeq = useRef(0);
  const knownIds = useRef<Set<string> | null>(null);
  const polling = useRef(false);
  const renewPending = useRef(false);
  const hoursSeq = useRef(0);
  const wantCodeRef = useRef(false);
  /** Lot 9 : relu puis renvoyé tel quel (une ancienne fonction écrirait sinon « faux »). */
  const showPlanning = useRef<boolean | undefined>(undefined);
  /** Lot 30 : colonnes qui répondent (0 = tout, 2 = lecture d'avant) ; remis à zéro à chaque ouverture. */
  const columnsLevel = useRef(0);
  /** Lot 30 : l'aide « Installer la tablette » (ouverte aussi par « Voir comment »). */
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef<HTMLDetailsElement>(null);

  // Mode support : lecture seule, aucun code (le serveur refuse aussi).
  const support = useMemo(() => open && !!readSupportSession(), [open]);
  // Une tablette déjà reliée : le code reste caché derrière « Relier une autre tablette ».
  const another = !support && readState === 'ok' && !reveal && !!kiosks && kiosks.length > 0;
  const wantCode = !support && readState !== 'loading' && !another;
  wantCodeRef.current = wantCode;

  const readKiosks = useCallback(async (): Promise<KioskRow[] | null> => {
    const read = (cols: string) => supabase.from('kiosks')
      .select(cols)
      .eq('company_id', companyId).is('revoked_at', null).order('created_at', { ascending: true });
    // Lot 12 : avec le type, pour écarter le QR fixe (ce n'est pas une tablette).
    // Lot 30 : et l'état de l'écran. Colonne absente (42703 : migration pas passée)
    // ou pas ouverte (42501) : on descend d'un cran, jusqu'à la lecture d'avant, et
    // on s'en souvient (pas deux requêtes à chaque relecture de 5 s). Toute autre
    // erreur : comme avant (rien).
    let level = columnsLevel.current;
    let { data, error } = await read(KIOSK_COLUMNS[level]);
    while ((error?.code === '42703' || (level === 0 && error?.code === '42501')) && level < KIOSK_COLUMNS.length - 1) {
      level += 1;
      columnsLevel.current = level;
      ({ data, error } = await read(KIOSK_COLUMNS[level]));
    }
    if (error) return null;
    return ((data || []) as unknown as KioskRow[]).filter((r) => r.kind !== 'fixe');
  }, [companyId]);

  /** Un code neuf. L'ancien reste affiché jusqu'à l'arrivée du nouveau, puis il est périmé. */
  const newCode = useCallback(async () => {
    const seq = ++codeSeq.current;
    const { data, error } = await callKiosk<KioskPairingCode>({ action: 'create_pairing' });
    if (seq !== codeSeq.current || !openRef.current) {
      // Fenêtre fermée (ou un autre code demandé entre-temps) : celui-ci ne sera jamais affiché.
      cancelCode(data ?? null);
      return;
    }
    if (!data?.code) {
      const cur = pairingRef.current;
      const stillValid = !!cur && Date.now() < cur.receivedAt + codeLife(cur);
      if (stillValid) {
        // Renouvellement raté (réseau) : l'ancien code vaut encore un peu ; on réessaie dans 20 s.
        setTimeout(() => { if (openRef.current && seq === codeSeq.current) void newCode(); }, 20_000);
        return;
      }
      pairingRef.current = null;
      setPairing(null);
      setCodeErr(error || 'Connexion impossible. Vérifiez internet et réessayez.');
      return;
    }
    const old = pairingRef.current;
    const next: Pairing = { ...data, receivedAt: Date.now() };
    pairingRef.current = next;
    setPairing(next);
    setCodeErr(null);
    if (old && old.pairing_id !== next.pairing_id) cancelCode(old);
  }, []);

  /** Relecture des tablettes ; une tablette apparue depuis l'ouverture = « Tablette reliée ». */
  const poll = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      const rows = await readKiosks();
      if (!openRef.current) return;
      // La première lecture décide : réussie → le code se cache si une tablette est reliée ;
      // en échec → le code reste montré (comme avant le lot 11 IA).
      setReadState((st) => (st !== 'loading' ? st : rows ? 'ok' : 'failed'));
      if (!rows) return;
      if (!knownIds.current) {
        // Première lecture réussie : c'est la référence, rien n'est « nouveau ».
        knownIds.current = new Set(rows.map((r) => r.id));
        setKiosks((prev) => keep(prev, rows));
        return;
      }
      const fresh = rows.filter((r) => !knownIds.current!.has(r.id));
      rows.forEach((r) => knownIds.current!.add(r.id));
      if (!fresh.length) { setKiosks((prev) => keep(prev, rows)); return; }
      toast.success('Tablette reliée');
      // Secours : tant que l'ancienne fonction tourne, elle ne déconnecte pas
      // les tablettes précédentes. On le fait ici (la plus récente reste).
      const newest = rows.reduce((a, b) => (b.created_at > a.created_at ? b : a));
      const older = rows.filter((r) => r.id !== newest.id && r.created_at < newest.created_at);
      for (const r of older) await callKiosk({ action: 'revoke', kiosk_id: r.id });
      const after = older.length ? (await readKiosks()) ?? rows : rows;
      if (openRef.current) setKiosks((prev) => keep(prev, after));
      // Le code vient de servir : il est périmé (l'effet « code voulu » le fait) et caché.
      if (openRef.current) setReveal(false);
    } finally {
      polling.current = false;
    }
  }, [readKiosks]);

  // Ouverture : l'état, les horaires, et tout de suite un code. Fermeture : le
  // code est périmé, les minuteries s'arrêtent.
  useEffect(() => {
    if (!open) return;
    openRef.current = true;
    knownIds.current = null;
    renewPending.current = false;
    columnsLevel.current = 0;
    setHelpOpen(false);
    setKiosks(null); setPairing(null); setCodeErr(null); setHours(null); setHoursState('idle');
    setConfirmDisc(false); setDiscBusy(false); setMinute(Math.floor(Date.now() / 60000));
    setReadState('loading'); setReveal(false);
    void poll();
    void (async () => {
      const { data } = await supabase.from('kiosk_settings')
        .select('show_planning, active_from, active_until').eq('company_id', companyId).maybeSingle();
      if (!openRef.current) return;
      const s = data as Partial<KioskSettings> | null;
      showPlanning.current = s?.show_planning ?? undefined;
      setHours({ from: s?.active_from?.slice(0, 5) || '', until: s?.active_until?.slice(0, 5) || '' });
    })();
    return () => {
      openRef.current = false;
      codeSeq.current++;
      const p = pairingRef.current;
      pairingRef.current = null;
      cancelCode(p);
      setPairing(null);
      // Rouverte, la fenêtre repart de zéro (pas d'ancien état qui montrerait un code).
      setReadState('loading'); setReveal(false);
    };
  }, [open, companyId, poll]);

  // Le code n'est créé QUE s'il est montré (jamais un code « caché » qui remplacerait
  // la tablette en silence) ; dès qu'il ne l'est plus, il est périmé.
  useEffect(() => {
    if (!open) return;
    if (wantCode) { void newCode(); return; }
    codeSeq.current++; // un code en cours de création ne sera jamais affiché
    const p = pairingRef.current;
    if (!p) return;
    pairingRef.current = null;
    setPairing(null); setCodeErr(null);
    cancelCode(p);
  }, [open, wantCode, newCode]);

  // L'état de la tablette, toutes les 5 s (onglet visible seulement), et la minute.
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      setMinute(Math.floor(Date.now() / 60000));
      if (document.visibilityState === 'visible') void poll();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [open, poll]);

  // Renouvellement : une minute avant l'expiration, si la fenêtre est visible ;
  // sinon dès le retour sur l'onglet.
  useEffect(() => {
    if (!open || !pairing) return;
    const wait = pairing.receivedAt + codeLife(pairing) - RENEW_BEFORE_MS - Date.now();
    const t = setTimeout(() => {
      if (document.visibilityState === 'visible') void newCode();
      else renewPending.current = true;
    }, Math.max(0, wait));
    return () => clearTimeout(t);
  }, [open, pairing, newCode]);

  useEffect(() => {
    if (!open) return;
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      setMinute(Math.floor(Date.now() / 60000));
      void poll();
      if (wantCodeRef.current && (renewPending.current || !pairingRef.current)) { renewPending.current = false; void newCode(); }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [open, poll, newCode]);

  const disconnect = async () => {
    setDiscBusy(true);
    // Toutes les tablettes encore actives (il peut en rester plusieurs d'avant le lot 11).
    const rows = (await readKiosks()) ?? kiosks ?? [];
    let failed = 0;
    for (const r of rows) {
      const { data } = await callKiosk<{ revoked: number }>({ action: 'revoke', kiosk_id: r.id });
      if (!data) failed++;
    }
    const after = await readKiosks();
    setDiscBusy(false);
    setConfirmDisc(false);
    if (after && openRef.current) setKiosks((prev) => keep(prev, after));
    if (failed) toast.error('Déconnexion incomplète. Réessayez.');
    else toast.success('Tablette déconnectée : ses QR ne fonctionnent plus.');
  };

  /** Horaires : enregistrés dès qu'ils sont complets (les deux heures, ou aucune). */
  const saveHours = async (next: { from: string; until: string }) => {
    setHours(next);
    if (next.from && !next.until) { setHoursState('half-until'); return; }
    if (!next.from && next.until) { setHoursState('half-from'); return; }
    const seq = ++hoursSeq.current;
    setHoursState('saving');
    const { data, error } = await callKiosk<{ settings: KioskSettings }>({
      action: 'settings', active_from: next.from || null, active_until: next.until || null,
      ...(showPlanning.current !== undefined ? { show_planning: showPlanning.current } : {}),
    });
    if (seq !== hoursSeq.current) return;
    if (!data) { setHoursState('error'); toast.error(error || 'Enregistrement impossible'); return; }
    setHoursState('saved');
  };

  // Le QR du code : ouvre /borne?code=… sur la tablette (même site que celui-ci).
  const code = pairing?.code ?? null;
  const qrUrl = code ? `${window.location.origin}/borne?code=${code}` : null;
  // Lot 13 : l'adresse de la page tablette, construite sur le site EN COURS
  // (bemexo.com en prod, l'adresse de la préview sur une préview).
  const borneUrl = `${window.location.origin}/borne`;
  const borneLabel = `${window.location.host}/borne`;
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);
  const copy = async (what: 'code' | 'link', text: string) => {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch {
      // Repli (navigateur sans presse-papiers asynchrone) : sélection + copie.
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
    }
    if (!ok) { toast.error('Copie impossible : sélectionnez le texte à la main.'); return; }
    setCopied(what);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), 2000);
  };
  const qrHtml = useMemo(() => {
    if (!qrUrl) return null;
    const qr = qrcode(0, 'M');
    qr.addData(qrUrl);
    qr.make();
    return { __html: qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true }) };
  }, [qrUrl]);

  // L'état : la tablette vue le plus récemment.
  const latest = kiosks && kiosks.length
    ? kiosks.reduce((a, b) => ((b.last_seen_at || b.created_at) > (a.last_seen_at || a.created_at) ? b : a))
    : null;
  void minute; // rendu à chaque nouvelle minute (« vue il y a X min »)
  const seenAgo = latest ? Date.now() - new Date(latest.last_seen_at || latest.created_at).getTime() : 0;
  const late = !!latest && seenAgo > LATE_MS;
  const alwaysOn = !!hours && !hours.from && !hours.until;
  // Lot 30 : ce que la tablette dit de son écran (rien tant qu'elle n'a rien envoyé).
  const notices = latest ? kioskNotices(latest, Date.now()) : [];
  const showHelp = () => {
    setHelpOpen(true);
    // Une fois l'aide ouverte, on la ramène à l'écran (la fenêtre défile sur un petit téléphone).
    setTimeout(() => helpRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }), 50);
  };

  const ui2 = useBureauUi2();
  // Fermer (Échap, ✕, clic à côté) quitte d'abord le champ d'heure en cours :
  // l'heure tapée est enregistrée, pas perdue.
  const fermer = (o: boolean) => { if (!o) (document.activeElement as HTMLElement | null)?.blur?.(); onOpenChange(o); };
  const corps = (
        <div className="ka">
          <div className="ka-status" data-testid="ka-status">
            <span className={`ka-dot${latest ? (late ? ' late' : ' on') : ''}`} aria-hidden="true" />
            <span className="ka-status-t" data-testid="ka-status-text">
              {kiosks === null
                ? <span className="ka-muted">Recherche de la tablette…</span>
                : latest ? `Tablette reliée — ${seenLabel(seenAgo)}` : 'Aucune tablette reliée'}
            </span>
            {latest && !confirmDisc && (
              <button type="button" className="ka-link" data-testid="ka-disconnect" data-guide="bureau-borne.deconnecter" onClick={() => setConfirmDisc(true)}>
                Déconnecter la tablette
              </button>
            )}
            {latest && confirmDisc && !ui2 && (
              <span className="ka-confirm" data-testid="ka-disconnect-confirm">
                <button type="button" className="ka-btn danger" onClick={disconnect} disabled={discBusy}>
                  {discBusy ? 'Déconnexion…' : 'Oui, déconnecter'}
                </button>
                <button type="button" className="ka-btn" onClick={() => setConfirmDisc(false)} disabled={discBusy}>Non</button>
              </span>
            )}
          </div>

          {notices.length > 0 && <KioskNotices notices={notices} onHelp={showHelp} />}

          {support ? (
            <p className="ka-intro" data-testid="ka-support-note">Mode support : lecture seule, impossible de relier une tablette.</p>
          ) : another ? (
            <div className="ka-sec ka-another" data-testid="ka-another">
              <p>Si la tablette affiche un QR, scannez-le avec votre téléphone : c’est le plus simple.</p>
              <p>Une seule tablette par entreprise : en relier une nouvelle déconnecte l’ancienne.</p>
              {/* Le guide « borne » montre ce bouton à la place du code, tant que le code est caché. */}
              <button type="button" className="ka-btn" data-testid="ka-link-another" onClick={() => setReveal(true)}>Relier une autre tablette</button>
            </div>
          ) : (
            <>
              {reveal && kiosks && kiosks.length > 0 && (
                <p className="ka-replace-warn" data-testid="ka-replace-warn">L’ancienne tablette sera déconnectée dès que la nouvelle sera reliée.</p>
              )}
              <p className="ka-intro" data-testid="ka-pair-intro">Si la tablette affiche un QR, scannez-le avec votre téléphone : c’est le plus simple. Sinon, tapez le code ci-dessous sur la tablette.</p>
              <div className="ka-code" data-testid="ka-code-block">
                <div className="ka-code-main">
                  <span className="ka-code-l">
                    Code pour relier la tablette
                    <InfoTip testId="ka-info" text="Le code change tout seul. Relier une nouvelle tablette remplace l’ancienne. Le plus simple : la tablette affiche un QR, scannez-le avec votre téléphone. Sinon, tapez ce code sur la tablette ou scannez le QR ci-contre avec elle." />
                  </span>
                  {codeErr && !code ? (
                    <>
                      <div className="ka-err" data-testid="ka-code-error">Code indisponible</div>
                      <p className="ka-how">{codeErr}</p>
                      <button type="button" className="ka-retry" onClick={() => { setCodeErr(null); void newCode(); }}>Réessayer</button>
                    </>
                  ) : (
                    <>
                      <div className="ka-digrow">
                        <b className={`ka-digits${code ? '' : ' wait'}`} data-testid="ka-code" data-guide="bureau-borne.code" aria-live="polite" aria-busy={!code}>
                          {code
                            ? code.split('').map((d, i) => <span key={i} className={i === 2 ? 'ka-d3' : undefined}>{d}</span>)
                            : <><span className="ka-d3">···</span><span>···</span></>}
                        </b>
                        {code && (
                          <button type="button" className={`ka-copy${copied === 'code' ? ' ok' : ''}`} data-testid="ka-copy-code" onClick={() => void copy('code', code)}>
                            {copied === 'code' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied === 'code' ? 'Copié' : 'Copier le code'}
                          </button>
                        )}
                      </div>
                      <div className="ka-howrow">
                        <p className="ka-how">
                          Sur la tablette, ouvrez{' '}
                          <a href={borneUrl} target="_blank" rel="noopener noreferrer" data-testid="ka-borne-link">{borneLabel}</a>{' '}
                          et tapez ce code, fenêtre ouverte.
                        </p>
                        <button type="button" className={`ka-copy${copied === 'link' ? ' ok' : ''}`} data-testid="ka-copy-link" onClick={() => void copy('link', borneUrl)}>
                          {copied === 'link' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied === 'link' ? 'Copié' : 'Copier le lien'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {qrHtml && (
                  <figure className="ka-qrfig">
                    <div className="ka-qr" data-testid="ka-qr" data-url={qrUrl ?? undefined} role="img" aria-label="QR : ouvre la page de la tablette avec le code" dangerouslySetInnerHTML={qrHtml} />
                    <figcaption className="ka-qrcap" data-testid="ka-qr-caption">Secours : à scanner avec la tablette</figcaption>
                  </figure>
                )}
              </div>
            </>
          )}

          <div className="ka-sec" data-testid="ka-hours">
            <div className="ka-l">
              <span>Horaires d&apos;ouverture <small>(facultatif)</small></span>
              <InfoTip testId="ka-hours-info" text="En dehors de ces heures, l’écran de la tablette reste noir. Un toucher affiche le QR pour pointer." />
            </div>
            {hours && (
              <>
                <div className="ka-hours">
                  <span className="ka-tf"><TimeField value={hours.from} ariaLabel="Ouverture" testId="ka-from" onChange={(v) => saveHours({ ...hours, from: v })} /></span>
                  <span className="ka-muted">à</span>
                  <span className="ka-tf"><TimeField value={hours.until} ariaLabel="Fermeture" testId="ka-until" onChange={(v) => saveHours({ ...hours, until: v })} /></span>
                  <button type="button" className="ka-chip" aria-pressed={alwaysOn} data-testid="ka-always"
                    onClick={() => { if (!alwaysOn) void saveHours({ from: '', until: '' }); }}>
                    Toujours allumée
                  </button>
                </div>
                <p className={`ka-save${hoursState === 'saved' ? ' ok' : hoursState === 'error' ? ' bad' : ''}`} data-testid="ka-save" aria-live="polite">
                  {hoursState === 'saving' ? 'Enregistrement…'
                    : hoursState === 'saved' ? '✓ Enregistré'
                      : hoursState === 'half-until' ? 'Indiquez aussi l’heure de fermeture.'
                        : hoursState === 'half-from' ? 'Indiquez aussi l’heure d’ouverture.'
                          : hoursState === 'error' ? 'Non enregistré. Réessayez.' : ''}
                </p>
              </>
            )}
          </div>

          {/* Lot 2 (IA) : aide d'installation, repliée par défaut. */}
          <details ref={helpRef} className="ka-help" data-testid="ka-install" open={helpOpen} onToggle={(e) => setHelpOpen(e.currentTarget.open)}>
            <summary>Installer la tablette <small>(aide)</small></summary>
            <ol>
              <li>Sur la tablette, ouvrez <b>{borneLabel}</b>, puis <b>Ajouter à l’écran d’accueil</b> <span className="ka-muted">(iPad : bouton Partager ; Android : menu ⋮ → Installer l’application)</span>.</li>
              <li>Ouvrez la borne <b>depuis l’icône installée</b> et reliez-la : elle affiche un QR à scanner avec votre téléphone ou, à défaut, un code à 6 chiffres (ci-dessus). Sur iPad, l’icône a sa propre mémoire : reliez-la depuis l’icône, pas depuis Safari.</li>
              <li>Réglez la <b>mise en veille de l’écran sur « Jamais »</b> <span className="ka-muted">(iPad : Réglages › Luminosité et affichage › verrouillage automatique sur « Jamais » ; Android : Paramètres › Affichage › Mise en veille de l’écran, au maximum)</span> et laissez la tablette branchée.</li>
              <li>Facultatif : <b>Accès guidé</b> (iPad) ou <b>Épinglage d’application</b> (Android) pour que la tablette reste sur la borne.</li>
              <li>Déjà une ancienne icône BEMEXO sur la tablette ? Supprimez-la et ajoutez-la de nouveau depuis {borneLabel} : elle ouvrira directement la borne, en plein écran.</li>
            </ol>
          </details>
          {open && <KioskFixedQr />}
        </div>
  );
  if (ui2) {
    let question: ReactNode = null;
    if (latest && confirmDisc) question = <DeconnecterV2 busy={discBusy} onConfirm={disconnect} onCancel={() => setConfirmDisc(false)} />;
    return (
      <Suspense fallback={null}>
        <CoqueL3 open={open} onOpenChange={fermer} kicker="Borne" titre="Borne de pointage" testId="borne-v2" portee="dz-l3-borne">
          <style dangerouslySetInnerHTML={CSS_HTML} />
          {corps}
          {question}
        </CoqueL3>
      </Suspense>
    );
  }

  return (
    <Dialog open={open} onOpenChange={fermer}>
      <DialogContent className="bt-skin max-w-md">
        <style dangerouslySetInnerHTML={CSS_HTML} />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MonitorSmartphone className="h-5 w-5" /> Borne de pointage</DialogTitle>
          <DialogDescription className="sr-only">Code pour relier la tablette de pointage, état de la tablette et horaires d’ouverture.</DialogDescription>
        </DialogHeader>
        {corps}
      </DialogContent>
    </Dialog>
  );
}
