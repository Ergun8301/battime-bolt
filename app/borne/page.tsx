'use client';

// La tablette posée à l'entrée. Deux écrans : l'appairage (code à 6 chiffres),
// puis le QR, pour toujours.
//
// LE QR NE DEMANDE RIEN AU SERVEUR. Il est recalculé chaque minute à partir de
// la clé dérivée du secret de la borne : la tablette peut perdre internet, les
// salariés pointent quand même (c'est leur téléphone qui parle au serveur).
// Le serveur n'est contacté que toutes les 5 minutes, pour le nom de
// l'établissement, le planning du jour et savoir si la borne a été retirée.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize, WifiOff, Loader2 } from 'lucide-react';
import {
  callKiosk, codeForStep, deriveTotpKey, getPosition, isAsleep, qrSvgPath, scanUrl, stepAt,
} from '@/lib/kiosk';
import { isPreviewHost } from '@/lib/hosting';

const STORE = 'bemexo.kiosk.device';
const SYNC_MS = 5 * 60_000;
const WAKE_MS = 2 * 60_000;

type PlanRow = { first_name: string; start: string | null; end: string | null };
type Stored = {
  device_id: string;
  secret: string;
  totp_key: string;
  name: string;
  company_name: string;
  settings: { show_planning: boolean; awake_from: string | null; awake_until: string | null };
  planning: PlanRow[];
  planning_date: string;
  /** Écart horloge serveur − horloge tablette (ms). */
  offset: number;
};
type SyncResponse = {
  server_time: number;
  device: { id: string; name: string };
  company_name: string;
  settings: Stored['settings'];
  planning: PlanRow[];
  needs_position: boolean;
};

function load(): Stored | null {
  try { const raw = localStorage.getItem(STORE); return raw ? (JSON.parse(raw) as Stored) : null; } catch { return null; }
}
function save(s: Stored | null) {
  try { if (s) localStorage.setItem(STORE, JSON.stringify(s)); else localStorage.removeItem(STORE); } catch { /* navigation privée */ }
}
const today = () => new Date().toLocaleDateString('sv-SE');

const CSS = `
.kb{position:fixed;inset:0;background:#15120F;color:#FBF8F2;font-family:inherit;overflow:hidden;user-select:none;-webkit-user-select:none}
.kb-pair{height:100%;display:flex;align-items:center;justify-content:center;padding:24px}
.kb-card{width:100%;max-width:440px;text-align:center}
.kb-logo{height:30px;margin:0 auto 28px;display:block}
.kb-h{font-size:28px;font-weight:800;letter-spacing:-.02em;margin:0 0 8px}
.kb-p{font-size:15px;color:#bdb6aa;margin:0 0 26px;line-height:1.5}
.kb-code{width:100%;font-size:44px;font-weight:800;letter-spacing:.35em;text-align:center;padding:16px 0 16px .35em;border-radius:16px;border:2px solid rgba(251,248,242,.18);background:rgba(251,248,242,.06);color:#FBF8F2;outline:none;font-variant-numeric:tabular-nums}
.kb-code:focus{border-color:#FFC21A}
.kb-btn{margin-top:16px;width:100%;background:#FFC21A;color:#15120F;border:none;border-radius:14px;padding:16px;font-size:18px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-family:inherit}
.kb-btn:disabled{opacity:.5}
.kb-err{margin-top:14px;color:#ffb199;font-weight:700;font-size:14px}
.kb-screen{height:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5vmin;align-items:center;padding:6vmin}
.kb-side{min-width:0;display:flex;flex-direction:column;gap:3vmin;height:100%;justify-content:center}
.kb-co{font-size:4.2vmin;font-weight:800;letter-spacing:-.01em;color:#FBF8F2;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kb-clock{font-size:17vmin;font-weight:800;line-height:.9;letter-spacing:-.04em;font-variant-numeric:tabular-nums;margin:0}
.kb-date{font-size:3.2vmin;color:#bdb6aa;font-weight:600;margin:0;text-transform:capitalize}
.kb-hint{display:flex;align-items:center;gap:1.6vmin;font-size:3vmin;font-weight:700;color:#FFC21A;margin:1vmin 0 0}
.kb-plan{margin-top:1vmin;border-top:1px solid rgba(251,248,242,.12);padding-top:2.4vmin;min-height:0;overflow:hidden}
.kb-plan h3{font-size:2.2vmin;letter-spacing:.12em;text-transform:uppercase;color:#8d867b;margin:0 0 1.4vmin;font-weight:800}
.kb-plan ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(30vmin,1fr));gap:1vmin 3vmin}
.kb-plan li{display:flex;justify-content:space-between;gap:2vmin;font-size:2.8vmin;font-weight:700}
.kb-plan li span:last-child{color:#bdb6aa;font-variant-numeric:tabular-nums;font-weight:600}
.kb-qr{background:#fff;border-radius:4vmin;padding:3.2vmin;box-shadow:0 2vmin 8vmin rgba(0,0,0,.35)}
.kb-qr svg{display:block;width:min(62vmin,calc(100vw - 60vmin));height:auto;aspect-ratio:1}
.kb-bar{position:absolute;top:2vmin;right:2vmin;display:flex;gap:1.4vmin;align-items:center}
.kb-chip{display:flex;align-items:center;gap:6px;background:rgba(251,248,242,.08);color:#bdb6aa;border:none;border-radius:999px;padding:8px 12px;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer}
.kb-name{position:absolute;bottom:2vmin;right:3vmin;font-size:12px;color:#6e675c;font-weight:600}
.kb-sleep{position:absolute;inset:0;background:#000;z-index:10;cursor:pointer}
@media (orientation:portrait){
  .kb-screen{grid-template-columns:1fr;grid-template-rows:none;align-content:center;justify-items:center;text-align:center;gap:3vmin;padding:6vmin}
  .kb-side{display:contents}
  .kb-co{font-size:5vmin;max-width:100%;order:1}
  .kb-clock{font-size:16vmin;order:2}
  .kb-date{font-size:3.6vmin;order:3;margin-top:-1vmin}
  .kb-qr{order:4}
  .kb-qr svg{width:62vmin}
  .kb-hint{order:5;font-size:3.6vmin;justify-content:center}
  .kb-plan{order:6;width:100%;text-align:left;margin-top:0}
  .kb-plan h3{font-size:2.8vmin}
  .kb-plan li{font-size:3.2vmin}
  .kb-plan ul{grid-template-columns:repeat(auto-fill,minmax(38vmin,1fr))}
}
`;

export default function BornePage() {
  const [dev, setDev] = useState<Stored | null>(null);
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [wakeUntil, setWakeUntil] = useState(0);
  const [isFull, setIsFull] = useState(false);
  const devRef = useRef<Stored | null>(null);
  devRef.current = dev;

  // `?demo=1`, SUR UNE PREVIEW SEULEMENT : une borne fictive, sans serveur, pour
  // vérifier l'écran avant que la migration et la fonction soient en place.
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    if (isPreviewHost() && new URLSearchParams(window.location.search).has('demo')) {
      setDemo(true);
      deriveTotpKey('demo').then((k) => {
        setDev({
          device_id: '00000000-0000-4000-8000-000000000000', secret: 'demo', totp_key: k, name: 'Entrée (démo)',
          company_name: 'Restaurant Le Comptoir', settings: { show_planning: true, awake_from: null, awake_until: null },
          planning: [
            { first_name: 'Karim', start: '08:00', end: '16:00' }, { first_name: 'Sofia', start: '09:00', end: '17:00' },
            { first_name: 'Lucas', start: '11:00', end: '15:00' }, { first_name: 'Inès', start: '17:00', end: '23:00' },
          ],
          planning_date: today(), offset: 0,
        });
        setReady(true);
      });
      return;
    }
    setDev(load()); setReady(true);
  }, []);

  // ── Horloge : chaque seconde. Le QR, seulement quand la minute change. ──
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const serverNow = now + (dev?.offset ?? 0);
  const step = stepAt(serverNow);
  useEffect(() => {
    if (!dev) { setQrCode(null); return; }
    let stale = false;
    codeForStep(dev.totp_key, step).then((c) => { if (!stale) setQrCode(c); });
    return () => { stale = true; };
  }, [dev, step]);

  // ── Synchronisation légère, toutes les 5 minutes ──
  const sync = useCallback(async () => {
    const cur = devRef.current;
    if (!cur) return;
    const t0 = Date.now();
    const r = await callKiosk<SyncResponse>({ action: 'sync', secret: cur.secret });
    if (!r.ok) {
      if (r.status === 401) {
        save(null); setDev(null);
        setErr('Cette borne a été retirée depuis BEMEXO. Saisissez un nouveau code.');
      } else {
        setOffline(true);
      }
      return;
    }
    const d = r.data;
    const offset = Math.abs(d.server_time - (t0 + Date.now()) / 2) > 2000 ? d.server_time - (t0 + Date.now()) / 2 : 0;
    const next: Stored = {
      ...cur, name: d.device.name, company_name: d.company_name, settings: d.settings,
      planning: d.planning, planning_date: today(), offset,
    };
    save(next); setDev(next); setOffline(false);
    // Option GPS activée après coup, sans position enregistrée : on la fournit une fois.
    if (d.needs_position) {
      const p = await getPosition();
      if (p) await callKiosk({ action: 'sync', secret: cur.secret, lat: p.lat, lng: p.lng, accuracy: p.accuracy });
    }
  }, []);
  const paired = !!dev && !demo;
  useEffect(() => {
    if (!paired) return;
    sync();
    const id = setInterval(sync, SYNC_MS);
    const onOnline = () => sync();
    window.addEventListener('online', onOnline);
    return () => { clearInterval(id); window.removeEventListener('online', onOnline); };
  }, [paired, sync]);

  // ── Écran toujours allumé (Wake Lock), repris au retour au premier plan ──
  useEffect(() => {
    if (!paired) return;
    type WL = { release: () => Promise<void> };
    let lock: WL | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WL> } };
    const acquire = async () => { try { lock = (await nav.wakeLock?.request('screen')) ?? null; } catch { /* refusé */ } };
    const onVis = () => { if (document.visibilityState === 'visible') acquire(); };
    acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); lock?.release().catch(() => {}); };
  }, [paired]);

  useEffect(() => {
    const onFs = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const goFull = () => { document.documentElement.requestFullscreen?.().catch(() => {}); };

  const pair = async () => {
    if (code.length !== 6) return;
    setBusy(true); setErr(null);
    const p = await getPosition();
    const r = await callKiosk<{ device_id: string; secret: string }>({
      action: 'pair', code, ...(p ? { lat: p.lat, lng: p.lng, accuracy: p.accuracy } : {}),
    });
    if (!r.ok) { setErr(r.error); setBusy(false); return; }
    const s: Stored = {
      device_id: r.data.device_id, secret: r.data.secret, totp_key: await deriveTotpKey(r.data.secret),
      name: '', company_name: '', settings: { show_planning: false, awake_from: null, awake_until: null },
      planning: [], planning_date: '', offset: 0,
    };
    save(s); setDev(s); setCode(''); setBusy(false);
    goFull();
  };

  const qr = useMemo(() => {
    if (!dev || !qrCode || typeof window === 'undefined') return null;
    return qrSvgPath(scanUrl(window.location.origin, dev.device_id, qrCode));
  }, [dev, qrCode]);

  if (!ready) return <div className="kb" />;

  if (!dev) {
    return (
      <div className="kb">
        <style>{CSS}</style>
        <div className="kb-pair">
          <div className="kb-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="kb-logo" src="/bemexo-wordmark-light.svg" alt="BEMEXO" />
            <h1 className="kb-h">Borne de pointage</h1>
            <p className="kb-p">Dans BEMEXO : <b>Paramètres → Borne de pointage → Ajouter une borne</b>, puis saisissez le code ici.</p>
            <input
              className="kb-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000"
              value={code} autoFocus aria-label="Code d'appairage"
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => { if (e.key === 'Enter') pair(); }}
            />
            <button type="button" className="kb-btn" disabled={busy || code.length !== 6} onClick={pair}>
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null} Associer cette tablette
            </button>
            {err && <p className="kb-err">{err}</p>}
          </div>
        </div>
      </div>
    );
  }

  const d = new Date(serverNow);
  const asleep = isAsleep(dev.settings.awake_from, dev.settings.awake_until, d) && now > wakeUntil;
  const planning = dev.settings.show_planning && dev.planning_date === today() ? dev.planning : [];

  return (
    <div className="kb">
      <style>{CSS}</style>
      <div className="kb-screen">
        <div className="kb-side">
          <p className="kb-co">{dev.company_name || 'BEMEXO'}</p>
          <p className="kb-clock">{d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
          <p className="kb-date">{d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <p className="kb-hint">📱 Scannez avec l&apos;appareil photo pour pointer</p>
          {planning.length > 0 && (
            <div className="kb-plan">
              <h3>Aujourd&apos;hui</h3>
              <ul>
                {planning.map((p, i) => (
                  <li key={i}><span>{p.first_name}</span><span>{p.start && p.end ? `${p.start} – ${p.end}` : p.start || ''}</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="kb-qr" aria-label="QR de pointage">
          {qr ? (
            <svg viewBox={`-1 -1 ${qr.size + 2} ${qr.size + 2}`} shapeRendering="crispEdges">
              <path d={qr.path} fill="#15120F" />
            </svg>
          ) : <svg viewBox="0 0 1 1" />}
        </div>
      </div>
      <div className="kb-bar">
        {offline && <span className="kb-chip"><WifiOff className="h-4 w-4" /> Hors ligne — le QR fonctionne</span>}
        {!isFull && <button type="button" className="kb-chip" onClick={goFull}><Maximize className="h-4 w-4" /> Plein écran</button>}
      </div>
      {dev.name && <span className="kb-name">{dev.name}</span>}
      {asleep && <div className="kb-sleep" onClick={() => setWakeUntil(Date.now() + WAKE_MS)} aria-label="Toucher pour réveiller" />}
    </div>
  );
}
