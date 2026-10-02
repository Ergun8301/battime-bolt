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
//   · l'état, relu toutes les 5 s : « Tablette reliée — vue il y a X min »
//     (point vert, orange au-delà de 15 min) ou « Aucune tablette reliée » ;
//   · relier une nouvelle tablette remplace l'ancienne (la fonction `kiosk` le
//     fait ; en secours, tant que l'ancienne fonction tourne, cette fenêtre
//     déconnecte elle-même les anciennes) ;
//   · un seul lien discret « Déconnecter la tablette » (confirmation sur place) ;
//   · « Horaires d'ouverture » (facultatifs) : enregistrés dès qu'ils changent.
// Plus de liste, plus de « Ajouter une borne », plus de lieu ni de nom, plus de GPS.
//
// Toutes les écritures passent par la fonction `kiosk` (qui revérifie le rôle
// admin et l'interrupteur) ; ici on ne fait que LIRE, sous RLS. Les relectures
// gardent le même objet quand rien n'a changé (keep) : rien ne se redessine.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { MonitorSmartphone } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { keep } from '@/lib/same';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InfoTip } from '@/components/ui/info-tip';
import { TimeField } from '@/components/time-field';
import { callKiosk, type KioskPairingCode, type KioskSettings } from '@/lib/kiosk-client';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; companyId: string }

interface KioskRow { id: string; created_at: string; last_seen_at: string | null }
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
.ka-digits{display:block;font-family:'JetBrains Mono',monospace;font-size:clamp(32px,9vw,46px);letter-spacing:.12em;color:#FFC21A;line-height:1.15;font-weight:700;white-space:nowrap;margin:4px 0 4px}
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
@media(max-width:420px){.ka-qr{width:76px;height:76px}.ka-code{padding:14px;gap:12px}}
`;

// Objet FIXE : un `{ __html }` neuf à chaque rendu fait réécrire la feuille
// de style par React (re-calcul de la page, polices rechargées → flash).
const CSS_HTML = { __html: CSS };

type HoursState = 'idle' | 'saving' | 'saved' | 'half-from' | 'half-until' | 'error';

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
  // Seule la minute compte pour « vue il y a X min » : un rendu par minute.
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60000));

  const openRef = useRef(false);
  const pairingRef = useRef<Pairing | null>(null);
  const codeSeq = useRef(0);
  const knownIds = useRef<Set<string> | null>(null);
  const polling = useRef(false);
  const renewPending = useRef(false);
  const hoursSeq = useRef(0);
  /** Lot 9 : relu puis renvoyé tel quel (une ancienne fonction écrirait sinon « faux »). */
  const showPlanning = useRef<boolean | undefined>(undefined);

  const readKiosks = useCallback(async (): Promise<KioskRow[] | null> => {
    const { data, error } = await supabase.from('kiosks')
      .select('id, created_at, last_seen_at')
      .eq('company_id', companyId).is('revoked_at', null).order('created_at', { ascending: true });
    if (error) return null;
    return (data || []) as KioskRow[];
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
      if (!rows || !openRef.current) return;
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
      // Le code vient de servir : un nouveau, pour la suite.
      if (openRef.current) void newCode();
    } finally {
      polling.current = false;
    }
  }, [readKiosks, newCode]);

  // Ouverture : l'état, les horaires, et tout de suite un code. Fermeture : le
  // code est périmé, les minuteries s'arrêtent.
  useEffect(() => {
    if (!open) return;
    openRef.current = true;
    knownIds.current = null;
    renewPending.current = false;
    setKiosks(null); setPairing(null); setCodeErr(null); setHours(null); setHoursState('idle');
    setConfirmDisc(false); setDiscBusy(false); setMinute(Math.floor(Date.now() / 60000));
    void poll();
    void (async () => {
      const { data } = await supabase.from('kiosk_settings')
        .select('show_planning, active_from, active_until').eq('company_id', companyId).maybeSingle();
      if (!openRef.current) return;
      const s = data as Partial<KioskSettings> | null;
      showPlanning.current = s?.show_planning ?? undefined;
      setHours({ from: s?.active_from?.slice(0, 5) || '', until: s?.active_until?.slice(0, 5) || '' });
    })();
    void newCode();
    return () => {
      openRef.current = false;
      codeSeq.current++;
      const p = pairingRef.current;
      pairingRef.current = null;
      cancelCode(p);
      setPairing(null);
    };
  }, [open, companyId, poll, newCode]);

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
      if (renewPending.current || !pairingRef.current) { renewPending.current = false; void newCode(); }
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bt-skin max-w-md">
        <style dangerouslySetInnerHTML={CSS_HTML} />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MonitorSmartphone className="h-5 w-5" /> Borne de pointage</DialogTitle>
          <DialogDescription className="sr-only">Code pour relier la tablette de pointage, état de la tablette et horaires d’ouverture.</DialogDescription>
        </DialogHeader>
        <div className="ka">
          <div className="ka-status" data-testid="ka-status">
            <span className={`ka-dot${latest ? (late ? ' late' : ' on') : ''}`} aria-hidden="true" />
            <span className="ka-status-t" data-testid="ka-status-text">
              {kiosks === null
                ? <span className="ka-muted">Recherche de la tablette…</span>
                : latest ? `Tablette reliée — ${seenLabel(seenAgo)}` : 'Aucune tablette reliée'}
            </span>
            {latest && !confirmDisc && (
              <button type="button" className="ka-link" data-testid="ka-disconnect" onClick={() => setConfirmDisc(true)}>
                Déconnecter la tablette
              </button>
            )}
            {latest && confirmDisc && (
              <span className="ka-confirm" data-testid="ka-disconnect-confirm">
                <button type="button" className="ka-btn danger" onClick={disconnect} disabled={discBusy}>
                  {discBusy ? 'Déconnexion…' : 'Oui, déconnecter'}
                </button>
                <button type="button" className="ka-btn" onClick={() => setConfirmDisc(false)} disabled={discBusy}>Non</button>
              </span>
            )}
          </div>

          <div className="ka-code" data-testid="ka-code-block">
            <div className="ka-code-main">
              <span className="ka-code-l">
                Code pour relier la tablette
                <InfoTip testId="ka-info" text="Le code change tout seul. Relier une nouvelle tablette remplace l’ancienne. Vous pouvez aussi scanner le QR avec la tablette : le code se remplit tout seul." />
              </span>
              {codeErr && !code ? (
                <>
                  <div className="ka-err" data-testid="ka-code-error">Code indisponible</div>
                  <p className="ka-how">{codeErr}</p>
                  <button type="button" className="ka-retry" onClick={() => { setCodeErr(null); void newCode(); }}>Réessayer</button>
                </>
              ) : (
                <>
                  <b className={`ka-digits${code ? '' : ' wait'}`} data-testid="ka-code" aria-live="polite" aria-busy={!code}>
                    {code ? `${code.slice(0, 3)} ${code.slice(3)}` : '··· ···'}
                  </b>
                  <p className="ka-how">Sur la tablette, ouvrez <b>bemexo.com/borne</b> et tapez ce code.</p>
                </>
              )}
            </div>
            {qrHtml && (
              <div className="ka-qr" data-testid="ka-qr" data-url={qrUrl ?? undefined} role="img" aria-label="QR : ouvre la page de la tablette avec le code" dangerouslySetInnerHTML={qrHtml} />
            )}
          </div>

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
        </div>
      </DialogContent>
    </Dialog>
  );
}
