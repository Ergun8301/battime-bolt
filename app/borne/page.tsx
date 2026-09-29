'use client';

// Borne de pointage — l'écran de la tablette posée à l'entrée (lot 1).
//
// DEUX ÉTATS SEULEMENT :
//   1. pas encore appairée → un champ pour le code à 6 chiffres donné par le
//      bureau (Réglages → Borne de pointage) ;
//   2. appairée → un grand QR, l'heure, le nom de l'établissement.
//
// LE QR NE DÉPEND JAMAIS D'INTERNET. Il est recalculé ici, chaque minute, à
// partir de la graine reçue à l'appairage (supabase/functions/_shared/
// kiosk-code.ts, le même fichier que le serveur). Si le réseau coupe, la borne
// continue d'afficher des QR valides ; seuls le planning et la vérification
// « borne retirée » attendent le retour du réseau.
//
// Rien de sensible n'est affiché : ni heures, ni paie, ni coût. Le planning
// (option) ne montre que le prénom et l'horaire prévu.
//
// ?demo=1 : aperçu sans appairage (graine fictive, QR non valable), pour
// montrer l'écran avant d'installer une vraie borne.

import { useCallback, useEffect, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { codeAt, fromBase64Url, scanUrl, stepAt } from '../../supabase/functions/_shared/kiosk-code';
import { isAsleep, parisTime } from '../../supabase/functions/_shared/kiosk-rules';
import { callKiosk, type KioskPlanningRow, type KioskSettings } from '@/lib/kiosk-client';
import { demanderPosition } from '@/lib/position';

const STORE_KEY = 'bx_kiosk_v1';
const SYNC_EVERY_MS = 5 * 60 * 1000;
const WAKE_ON_TOUCH_MS = 60 * 1000;

interface Paired {
  kioskId: string;
  token: string;
  seed: string;
  companyName: string;
  kioskName: string;
  settings: KioskSettings;
  planning: KioskPlanningRow[];
  syncedAt: number | null;
  demo?: boolean;
}

const DEMO: Paired = {
  kioskId: 'demo', token: 'demo', seed: 'ZGVtby1ib3JuZS1iZW1leG8tbmUtcGFzLXV0aWxpc2Vy',
  companyName: 'Martin Menuiserie', kioskName: 'Entrée du dépôt',
  settings: { show_planning: true, require_gps: false, active_from: null, active_until: null },
  planning: [
    { first_name: 'Karim', start: '07:30', end: '16:30' },
    { first_name: 'Julie', start: '08:00', end: '17:00' },
    { first_name: 'Thomas', start: '08:00', end: '17:00' },
    { first_name: 'Sofia', start: '13:00', end: '21:00' },
  ],
  syncedAt: Date.now(), demo: true,
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

const CSS = `
@import url('/fonts/fonts.css');
.kb{position:fixed;inset:0;background:#15120F;color:#F2EDE3;font-family:'Archivo',system-ui,sans-serif;-webkit-font-smoothing:antialiased;overflow:hidden;user-select:none}
.kb *{box-sizing:border-box}
.kb-grid{height:100%;display:grid;grid-template-rows:auto 1fr auto;padding:clamp(18px,3.2vmin,40px);gap:clamp(12px,2.4vmin,28px)}
.kb-top{display:flex;align-items:center;justify-content:space-between;gap:16px;min-width:0}
.kb-brand{display:flex;align-items:center;gap:12px;min-width:0}
.kb-brand img{height:clamp(22px,3.4vmin,34px);width:auto;flex:none}
.kb-place{min-width:0}
.kb-company{font-weight:900;font-size:clamp(18px,3vmin,30px);letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kb-kname{font-family:'JetBrains Mono',monospace;font-size:clamp(11px,1.5vmin,14px);color:#a59c86;letter-spacing:.08em;text-transform:uppercase;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kb-clock{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:clamp(34px,7vmin,84px);letter-spacing:-.03em;line-height:1;color:#FFC21A;flex:none}
.kb-main{display:flex;align-items:center;justify-content:center;gap:clamp(18px,4vmin,56px);min-height:0}
.kb-qrcard{background:#fff;border-radius:clamp(18px,3vmin,32px);padding:clamp(14px,2.4vmin,26px);box-shadow:0 30px 80px -30px rgba(0,0,0,.8),0 0 0 6px rgba(255,194,26,.9);display:flex;flex-direction:column;align-items:center;gap:clamp(8px,1.4vmin,14px)}
.kb-qr{width:min(62vmin,560px);aspect-ratio:1/1}
.kb-qr svg{width:100%;height:100%;display:block}
.kb-hint{font-weight:800;color:#15120F;font-size:clamp(14px,2.2vmin,22px);text-align:center;letter-spacing:-.01em}
.kb-bar{width:100%;height:5px;border-radius:99px;background:#EDE6D8;overflow:hidden}
.kb-bar i{display:block;height:100%;background:#FFC21A;border-radius:99px;transition:width 1s linear}
.kb-side{width:min(34vw,380px);max-height:100%;display:flex;flex-direction:column;min-height:0}
.kb-side h2{font-family:'JetBrains Mono',monospace;font-size:clamp(11px,1.5vmin,14px);letter-spacing:.12em;text-transform:uppercase;color:#a59c86;margin:0 0 10px;font-weight:700}
.kb-plan{list-style:none;margin:0;padding:0;overflow:hidden;display:flex;flex-direction:column;gap:8px}
.kb-plan li{display:flex;justify-content:space-between;gap:12px;background:rgba(242,237,227,.06);border:1px solid rgba(242,237,227,.08);border-radius:12px;padding:clamp(9px,1.4vmin,14px) clamp(12px,1.8vmin,18px);font-size:clamp(15px,2.2vmin,22px);font-weight:800}
.kb-plan li span:last-child{font-family:'JetBrains Mono',monospace;color:#FFC21A;font-weight:700;white-space:nowrap}
.kb-empty{color:#a59c86;font-weight:600;font-size:clamp(14px,2vmin,18px)}
.kb-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:clamp(12px,1.6vmin,15px);color:#a59c86;font-weight:600}
.kb-status{display:inline-flex;align-items:center;gap:8px}
.kb-dot{width:9px;height:9px;border-radius:50%;background:#2FD584;box-shadow:0 0 0 4px rgba(47,213,132,.15)}
.kb-dot.off{background:#F0915A;box-shadow:0 0 0 4px rgba(240,145,90,.15)}
.kb-btn{border:1.5px solid rgba(242,237,227,.25);background:transparent;color:#F2EDE3;border-radius:10px;padding:8px 14px;font:inherit;font-weight:800;cursor:pointer}
.kb-link{background:none;border:0;color:#6E6A63;font:inherit;font-weight:700;cursor:pointer;padding:6px}
.kb-demo{position:absolute;top:12px;left:50%;transform:translateX(-50%);background:#FFC21A;color:#15120F;font-weight:900;font-size:12px;letter-spacing:.08em;text-transform:uppercase;border-radius:99px;padding:5px 12px}
.kb-sleep{position:absolute;inset:0;background:#000;display:flex;align-items:flex-end;justify-content:center;padding:40px;color:#3a352f;font-weight:700;font-size:14px;cursor:pointer}
/* Portrait : le planning passe sous le QR. */
@media (orientation:portrait){
  .kb-main{flex-direction:column}
  .kb-qr{width:min(78vw,560px)}
  .kb-side{width:min(86vw,560px);max-height:26vh}
  .kb-plan{display:grid;grid-template-columns:1fr 1fr;gap:8px}
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
      settings: data.settings, planning: [], syncedAt: Date.now(),
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

function Display({ paired, online, onUnpair }: { paired: Paired; online: boolean; onUnpair: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [svg, setSvg] = useState('');
  const [awakeUntil, setAwakeUntil] = useState(0);
  const [confirmUnpair, setConfirmUnpair] = useState(false);
  const lastStep = useRef<number | null>(null);
  const seed = useRef<Uint8Array>(fromBase64Url(paired.seed));

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

  const hhmm = parisTime(now);
  const asleep = isAsleep(hhmm, paired.settings.active_from, paired.settings.active_until) && now > awakeUntil;
  const secondsLeft = 60 - (Math.floor(now / 1000) % 60);
  const showPlan = paired.settings.show_planning;

  return (
    <div className="kb">
      {paired.demo && <div className="kb-demo">Mode démo · QR non valable</div>}
      <div className="kb-grid">
        <header className="kb-top">
          <div className="kb-brand">
            <img src="/bemexo-x-light.svg" alt="" aria-hidden="true" />
            <div className="kb-place">
              <div className="kb-company">{paired.companyName || 'BEMEXO'}</div>
              <div className="kb-kname">{paired.kioskName}</div>
            </div>
          </div>
          <div className="kb-clock" aria-label={`Il est ${hhmm}`}>{hhmm}</div>
        </header>

        <main className="kb-main">
          <div className="kb-qrcard">
            <div className="kb-qr" aria-label="QR de pointage" dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="kb-hint">Scannez avec l&apos;appareil photo de votre téléphone</div>
            <div className="kb-bar" aria-hidden="true"><i style={{ width: `${(secondsLeft / 60) * 100}%` }} /></div>
          </div>
          {showPlan && (
            <aside className="kb-side">
              <h2>Aujourd&apos;hui</h2>
              {paired.planning.length ? (
                <ul className="kb-plan">
                  {paired.planning.slice(0, 12).map((p, i) => (
                    <li key={`${p.first_name}-${i}`}>
                      <span>{p.first_name}</span>
                      <span>{p.start && p.end ? `${p.start} – ${p.end}` : p.start || ''}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="kb-empty">Personne n&apos;est prévu aujourd&apos;hui.</p>}
            </aside>
          )}
        </main>

        <footer className="kb-foot">
          <span className="kb-status">
            <span className={`kb-dot${online ? '' : ' off'}`} />
            {online ? 'Borne active' : 'Hors ligne — le QR reste valable'}
          </span>
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <FullscreenButton />
            {confirmUnpair ? (
              <>
                <button type="button" className="kb-btn" onClick={onUnpair}>Oui, déconnecter</button>
                <button type="button" className="kb-link" onClick={() => setConfirmUnpair(false)}>Annuler</button>
              </>
            ) : (
              <button type="button" className="kb-link" onClick={() => setConfirmUnpair(true)}>Déconnecter</button>
            )}
          </span>
        </footer>
      </div>
      {asleep && (
        <div className="kb-sleep" onClick={() => setAwakeUntil(Date.now() + WAKE_ON_TOUCH_MS)} role="button" tabIndex={0}>
          Touchez l&apos;écran pour pointer
        </div>
      )}
    </div>
  );
}

function FullscreenButton() {
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    on();
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  if (full || typeof document === 'undefined' || !document.documentElement.requestFullscreen) return null;
  return (
    <button type="button" className="kb-btn" onClick={() => document.documentElement.requestFullscreen().catch(() => {})}>
      Plein écran
    </button>
  );
}

export default function BornePage() {
  const [paired, setPaired] = useState<Paired | null>(null);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const demo = new URLSearchParams(window.location.search).get('demo') === '1';
    setPaired(demo ? DEMO : readStore());
    setReady(true);
  }, []);

  useWakeLock(!!paired);

  const sync = useCallback(async (p: Paired) => {
    if (p.demo) return;
    const { data, status } = await callKiosk<{
      revoked: boolean; kiosk_name: string; company_name: string; settings: KioskSettings; planning: KioskPlanningRow[];
    }>({ action: 'sync', kiosk_id: p.kioskId, token: p.token });
    if (data && !data.revoked) {
      const next: Paired = { ...p, kioskName: data.kiosk_name, companyName: data.company_name, settings: data.settings, planning: data.planning, syncedAt: Date.now() };
      writeStore(next); setPaired(next); setOnline(true);
      return;
    }
    // Retirée par le bureau (ou activation coupée) : on oublie tout, tout de
    // suite. Une panne réseau, elle, ne fait rien perdre.
    if (status === 401 || status === 410 || status === 403) {
      writeStore(null); setPaired(null);
      setNotice(status === 403 ? 'La borne de pointage a été désactivée pour cette entreprise.' : 'Cette borne a été retirée par le bureau. Saisissez un nouveau code pour la réinstaller.');
      return;
    }
    setOnline(false);
  }, []);

  useEffect(() => {
    if (!paired || paired.demo) return;
    sync(paired);
    const id = setInterval(() => { const p = readStore(); if (p) sync(p); }, SYNC_EVERY_MS);
    const onOnline = () => { const p = readStore(); if (p) sync(p); };
    window.addEventListener('online', onOnline);
    return () => { clearInterval(id); window.removeEventListener('online', onOnline); };
    // Une seule boucle par appairage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paired?.kioskId, sync]);

  if (!ready) return <style dangerouslySetInnerHTML={{ __html: CSS }} />;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {paired ? (
        <Display
          paired={paired}
          online={online}
          onUnpair={() => { writeStore(null); setPaired(null); setNotice(null); }}
        />
      ) : (
        <Pairing onPaired={(p) => { writeStore(p); setNotice(null); setPaired(p); }} notice={notice} />
      )}
    </>
  );
}
