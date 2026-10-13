'use client';

// « Filmer dans BEMEXO » (lot 14, oct. 2026) — l'enregistreur intégré du panneau
// « Vidéo (téléphone ou fichier) » (components/training-video-upload.tsx).
//  - getUserMedia (caméra arrière si possible, 720p) + MediaRecorder ;
//  - minuteur, compte à rebours, arrêt automatique avant 50 Mo ou 4 minutes ;
//  - écran maintenu allumé pendant la prise (Wake Lock) ;
//  - la caméra et le micro sont coupés dès l'arrêt, l'abandon, ou si le composant
//    disparaît (démontage). Pendant la prise, le formulaire parent verrouille ses
//    onglets, « Annuler » et la fermeture de la fenêtre (onRecording) : une prise de
//    plusieurs minutes ne se perd pas d'un seul toucher, et « Abandonner » demande
//    une confirmation.
// Rien n'est créé ni envoyé ici : la prise devient un File remis à onDone, puis suit le
// chemin du lot 13 (mêmes contrôles de taille et de type, aperçu, « Ajouter »).
// Le minuteur utilise performance.now() (jamais Date.now()).
import { useEffect, useRef, useState } from 'react';
import {
  baseMime, countdownBand, estimateRate, formatClock, pickRecorderMime, REC_ABORT, REC_ABORT_ASK, REC_ABORT_NO, REC_ABORT_YES, REC_AUDIO_BPS, REC_BACK, REC_COUNTDOWN,
  REC_COUNTDOWN_SECONDS, REC_FAILED, REC_FPS, REC_HEIGHT, REC_OPENING, REC_READY, REC_RUNNING, REC_START, REC_STOP, REC_TIMESLICE_MS, REC_VIDEO_BPS, REC_WIDTH,
  recorderCapBytes, recorderErrorMessage, recorderFileName, recorderMaxLabel, recorderMaxSeconds, stopDecision,
} from '@/supabase/functions/_shared/video-recorder';
import type { Limits } from '@/supabase/functions/_shared/training-videos';

type Auto = 'size' | 'time' | 'cut' | null;
/** Avant ce délai (secondes), « Abandonner » jette la prise sans demander : il n'y a encore rien à perdre. */
const CONFIRM_AFTER_S = 3;

const CSS = `
.bt-fo-rec{display:flex;flex-direction:column;gap:8px;min-width:0}
.bt-fo-rec-live{display:block;width:100%;max-height:52vh;object-fit:contain;background:#15120F;border-radius:10px}
.bt-fo-rec-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.bt-fo-rec-row .bt-fo-btn{min-height:44px}
.bt-fo-rec-abort{margin-top:14px}
.bt-fo-rec-ask{font-size:13px;font-weight:800}
.bt-fo-rec .bt-fo-link{min-height:44px;padding:0 8px}
.bt-fo-rec-dot{flex:none;width:12px;height:12px;border-radius:50%;background:#D62B1F;animation:bt-fo-rec-pulse 1.2s ease-in-out infinite}
.bt-fo-rec-time{font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:800;min-width:3.2ch}
.bt-fo-rec-state{font-size:13px;font-weight:800}
.bt-fo-rec-count{font-size:13px;font-weight:800;color:#C0461F}
.bt-fo-rec button:focus-visible{outline:2px solid #FFC21A;outline-offset:1px}
@keyframes bt-fo-rec-pulse{50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){.bt-fo-rec-dot{animation:none}}
`;
const CSS_HTML = { __html: CSS };

type WakeSentinel = { released?: boolean; release: () => Promise<void> };

export default function TrainingVideoRecorder({ limits, onDone, onError, onCancel, onRecording }: {
  /** Relu à chaque rendu : la jauge peut arriver pendant la prise. */
  limits: Limits;
  onDone: (file: File, durationS: number, auto: Auto) => void;
  /** Le panneau ferme l'enregistreur et montre le message. */
  onError: (message: string) => void;
  onCancel: () => void;
  /** Vrai pendant la prise : le parent verrouille ce qui la jetterait sans prévenir (onglets du formulaire, « Annuler », fermeture). */
  onRecording?: (recording: boolean) => void;
}) {
  const [phase, setPhase] = useState<'opening' | 'ready' | 'recording'>('opening');
  const [elapsed, setElapsed] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [announce, setAnnounce] = useState(''); // lu à voix haute à 30, 10 et 5 s seulement
  const [confirming, setConfirming] = useState(false); // « Jeter cette prise ? »
  const latest = useRef({ limits, onDone, onError, onCancel, onRecording });
  latest.current = { limits, onDone, onError, onCancel, onRecording };
  const band = useRef<number | null>(null);
  const videoEl = useRef<HTMLVideoElement | null>(null);
  const startBtn = useRef<HTMLButtonElement | null>(null);
  const stopBtn = useRef<HTMLButtonElement | null>(null);
  const keepBtn = useRef<HTMLButtonElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const bytes = useRef(0);
  const samples = useRef<{ t: number; bytes: number }[]>([]);
  const t0 = useRef(0); // secondes (performance.now() / 1000) au démarrage
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const wake = useRef<WakeSentinel | null>(null);
  const auto = useRef<Auto>(null);
  const stopping = useRef(false);
  const discard = useRef(false);
  const closed = useRef(false); // onDone / onError / onCancel déjà appelé

  const nowS = () => performance.now() / 1000;
  const releaseWake = () => { const w = wake.current; wake.current = null; if (w) w.release().catch(() => { /* déjà relâché */ }); };
  const requestWake = async () => {
    try {
      const w = (await navigator.wakeLock?.request('screen')) ?? null; // API absente ou refusée : on filme quand même
      if (w && (closed.current || stopping.current)) { w.release().catch(() => { /* déjà relâché */ }); return; } // la prise s'est arrêtée entre-temps
      wake.current = w;
    } catch { wake.current = null; }
  };
  /** Caméra, micro, minuteurs et écran allumé : tout est relâché. */
  const release = () => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    stream.current?.getTracks().forEach((t) => { t.onended = null; t.stop(); });
    stream.current = null;
    if (videoEl.current) videoEl.current.srcObject = null;
    releaseWake();
  };
  /** Arrête la prise et JETTE tout (abandon, panne, démontage). */
  const dropRecorder = () => {
    discard.current = true;
    const rec = recorder.current;
    if (rec && rec.state !== 'inactive') { try { rec.stop(); } catch { /* déjà arrêté */ } }
    chunks.current = [];
  };
  const fail = (message: string) => {
    if (closed.current) return;
    closed.current = true;
    dropRecorder(); release();
    latest.current.onError(message);
  };

  // Ouverture de la caméra (une fois) ; tout est relâché au démontage.
  useEffect(() => {
    let alive = true;
    closed.current = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: REC_WIDTH }, height: { ideal: REC_HEIGHT }, frameRate: { ideal: REC_FPS, max: REC_FPS } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (!alive) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        // Caméra reprise par une autre application avant la prise : on le dit au lieu de laisser un aperçu figé.
        s.getTracks().forEach((t) => { t.onended = () => fail(recorderErrorMessage('NotReadableError')); });
        setPhase('ready');
      } catch (e) {
        if (alive) fail(recorderErrorMessage((e as { name?: string } | null)?.name));
      }
    })();
    return () => {
      alive = false;
      closed.current = true;
      dropRecorder(); release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aperçu direct : muted (écho) et playsInline (iPhone) obligatoires.
  useEffect(() => {
    const v = videoEl.current;
    if (phase === 'opening' || !v || !stream.current) return;
    if (v.srcObject !== stream.current) {
      v.srcObject = stream.current;
      v.muted = true;
      v.play().catch(() => { /* démarre à l'affichage */ });
    }
    if (phase === 'ready') startBtn.current?.focus();
  }, [phase]);

  // Le focus suit le bouton qui remplace le précédent (« Démarrer » → « Arrêter » → question « Jeter ? »).
  useEffect(() => {
    if (phase === 'recording') (confirming ? keepBtn : stopBtn).current?.focus();
  }, [phase, confirming]);

  // Pendant la prise : le parent verrouille la sortie, et fermer l'onglet du navigateur demande confirmation.
  useEffect(() => {
    if (phase !== 'recording') return;
    latest.current.onRecording?.(true);
    const leave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', leave);
    return () => { window.removeEventListener('beforeunload', leave); latest.current.onRecording?.(false); };
  }, [phase]);

  // Écran allumé : redemandé au retour sur la page (le système le relâche quand elle est cachée).
  useEffect(() => {
    if (phase !== 'recording') return;
    const back = () => { if (document.visibilityState === 'visible' && (!wake.current || wake.current.released)) void requestWake(); };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, [phase]);

  const decide = () => {
    const d = stopDecision({ bytes: bytes.current, elapsedS: nowS() - t0.current, rate: estimateRate(samples.current) }, recorderCapBytes(latest.current.limits));
    setRemaining(d.remainingS);
    const b = countdownBand(d.remainingS);
    // À sens unique : l'estimation oscille autour de 30 / 10 / 5 s, une tranche déjà annoncée ne l'est jamais deux fois.
    if (b !== null && (band.current === null || b < band.current)) { band.current = b; setAnnounce(REC_COUNTDOWN(d.remainingS as number)); }
    if (d.stop) stopWith(d.reason);
  };

  /** Arrêt de la prise : le fichier est remis à l'événement « stop » (après le dernier morceau). */
  const stopWith = (why: Auto) => {
    const rec = recorder.current;
    if (stopping.current) return;
    stopping.current = true;
    auto.current = why;
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (rec && rec.state !== 'inactive') { try { rec.stop(); } catch { /* déjà arrêté */ } }
  };

  const start = () => {
    const s = stream.current;
    if (!s || recorder.current) return;
    const mimeType = pickRecorderMime((t) => MediaRecorder.isTypeSupported(t));
    if (!mimeType) { fail(REC_FAILED); return; }
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(s, { mimeType, videoBitsPerSecond: REC_VIDEO_BPS, audioBitsPerSecond: REC_AUDIO_BPS });
    } catch {
      try { rec = new MediaRecorder(s, { mimeType }); } catch { fail(REC_FAILED); return; }
    }
    const base = baseMime(rec.mimeType || mimeType);
    if (!base) { fail(REC_FAILED); return; }
    recorder.current = rec;
    chunks.current = []; bytes.current = 0; samples.current = [{ t: 0, bytes: 0 }];
    rec.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0 || discard.current) return;
      chunks.current.push(e.data);
      bytes.current += e.data.size;
      const t = nowS() - t0.current;
      samples.current = [...samples.current.filter((x) => x.t >= t - 6), { t, bytes: bytes.current }];
      if (!stopping.current) decide();
    };
    rec.onerror = () => fail(REC_FAILED);
    rec.onstop = () => {
      const end = nowS();
      // Arrêt venu ni du bouton ni d'une décision (ordre des événements variable d'un navigateur à l'autre quand la caméra se coupe) : prise écourtée.
      const why = auto.current ?? (stopping.current ? null : 'cut');
      release();
      if (discard.current || closed.current) { chunks.current = []; return; }
      closed.current = true;
      if (bytes.current === 0) { latest.current.onError(REC_FAILED); return; }
      const file = new File(chunks.current, recorderFileName(new Date(), base), { type: base });
      chunks.current = [];
      latest.current.onDone(file, Math.max(1, Math.round(end - t0.current)), why);
    };
    // Une piste coupée pendant la prise (appel, verrouillage, caméra reprise) : ce qui est filmé est gardé.
    s.getTracks().forEach((t) => { t.onended = () => stopWith('cut'); });
    stopping.current = false; auto.current = null; discard.current = false;
    t0.current = nowS();
    void requestWake(); // au geste « Démarrer »
    rec.start(REC_TIMESLICE_MS);
    band.current = null; setAnnounce(''); setConfirming(false);
    setElapsed(0); setRemaining(null); setPhase('recording');
    timer.current = setInterval(() => { setElapsed(Math.floor(nowS() - t0.current)); decide(); }, 250);
  };

  /** « Abandonner » : après quelques secondes de prise, on demande avant de jeter. */
  const askAbort = () => { if (nowS() - t0.current >= CONFIRM_AFTER_S) setConfirming(true); else abort(); };

  const abort = () => {
    if (closed.current) return;
    closed.current = true;
    dropRecorder(); release();
    latest.current.onCancel();
  };

  const countdown = phase === 'recording' && remaining !== null && remaining <= REC_COUNTDOWN_SECONDS;
  return (
    <div className="bt-fo-rec" data-testid="tr-rec">
      <style dangerouslySetInnerHTML={CSS_HTML} />
      {phase === 'opening' ? (
        <>
          <p className="bt-fo-muted" role="status" data-testid="tr-rec-opening">{REC_OPENING}</p>
          {/* Sortie possible si la demande d'autorisation reste sans réponse. */}
          <div className="bt-fo-rec-row">
            <button type="button" className="bt-fo-btn ghost" onClick={abort} data-testid="tr-rec-cancel">{REC_BACK}</button>
          </div>
        </>
      ) : (
        <>
          <video ref={videoEl} className="bt-fo-rec-live" muted playsInline autoPlay aria-label="Aperçu de la caméra" data-testid="tr-rec-live" />
          {phase === 'ready' ? (
            <>
              <p className="bt-fo-muted">{REC_READY}</p>
              <div className="bt-fo-rec-row">
                <button ref={startBtn} type="button" className="bt-fo-btn" onClick={start} data-testid="tr-rec-start">{REC_START}</button>
                <button type="button" className="bt-fo-btn ghost" onClick={abort} data-testid="tr-rec-cancel">{REC_BACK}</button>
              </div>
            </>
          ) : (
            <>
              <div className="bt-fo-rec-row">
                <span className="bt-fo-rec-dot" aria-hidden="true" />
                <span className="bt-fo-rec-time" aria-live="off" data-testid="tr-rec-timer">{formatClock(elapsed)}</span>
                <span role="status" className="bt-fo-rec-state">{REC_RUNNING}</span>
              </div>
              <span className="bt-fo-muted" data-testid="tr-rec-max">{recorderMaxLabel(recorderMaxSeconds(limits))}</span>
              {/* Le texte qui change chaque seconde est muet pour les lecteurs d'écran : ils n'entendent que les paliers de la zone ci-dessous. */}
              {countdown && <p className="bt-fo-rec-count" aria-hidden="true" data-testid="tr-rec-countdown">{REC_COUNTDOWN(remaining as number)}</p>}
              <p className="sr-only" role="status" data-testid="tr-rec-announce">{announce}</p>
              {confirming ? (
                <div className="bt-fo-rec-row" role="group" aria-label={REC_ABORT_ASK}>
                  <span className="bt-fo-rec-ask">{REC_ABORT_ASK}</span>
                  <button ref={keepBtn} type="button" className="bt-fo-btn" onClick={() => setConfirming(false)} data-testid="tr-rec-abort-no">{REC_ABORT_NO}</button>
                  <button type="button" className="bt-fo-btn danger" onClick={abort} data-testid="tr-rec-abort-yes">{REC_ABORT_YES}</button>
                </div>
              ) : (
                <>
                  <div className="bt-fo-rec-row">
                    <button ref={stopBtn} type="button" className="bt-fo-btn" onClick={() => stopWith(null)} data-testid="tr-rec-stop">{REC_STOP}</button>
                  </div>
                  {/* À part d'« Arrêter » : une main qui tremble ou des gants ne doivent pas jeter la prise. */}
                  <div className="bt-fo-rec-row bt-fo-rec-abort">
                    <button type="button" className="bt-fo-link" onClick={askAbort} data-testid="tr-rec-abort">{REC_ABORT}</button>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
