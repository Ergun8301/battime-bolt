'use client';

// Vidéos de formation (lot 13, oct. 2026) — le panneau sous « Filmer » / « Fichier » du formulaire
// « Ajouter une formation » (components/trainings-admin.tsx). Chargé SEULEMENT quand il y a quelque chose
// à montrer (next/dynamic) : l'écran du bureau ne grossit pas pour ceux qui ne s'en servent pas.
// Formations simplifiées (oct. 2026, décision du patron) : AUCUN texte d'aide statique. Les boutons de choix
// (et les sélecteurs de fichier, qui doivent s'ouvrir au même appui) sont dans le formulaire ; ici ne reste que
// ce qui apparaît quand il se passe quelque chose :
//  - la jauge « 83 Mo utilisés sur 100 Mo », seulement à partir de 80 % de la place (ou plus de place du tout) ;
//  - l'enregistreur intégré (lot 14 : 720p, jusqu'à 4 minutes), ouvert par le bouton « Filmer » ;
//  - l'alerte HEVC (lot 14) : un fichier d'iPhone au format récent peut ne pas se lire partout ;
//  - l'aperçu, la durée, la taille ; le refus clair (trop lourd, format, quota) ;
//  - la barre de progression RÉELLE de l'envoi (octets partis) et « Annuler l'envoi ».
// L'envoi lui-même (réserver, envoyer, publier) reste dans le formulaire.
// GPS : plus aucune mise en garde à l'écran (décision du patron : personne ne lit ces textes). Les prises de
// l'enregistreur n'ont de toute façon aucune position GPS ; un fichier de la galerie peut en contenir une.
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  formatDuration, formatMo, QUOTA_FULL, quotaFull, quotaLabel, quotaNear, quotaRatio, VIDEO_MAX_BYTES, VIDEO_QUOTA_BYTES, type Limits, type VideoMime,
} from '@/supabase/functions/_shared/training-videos';
import { REC_DONE, type RecAuto } from '@/supabase/functions/_shared/video-recorder';
import { HEVC_ALERT, HEVC_KEEP, HEVC_TIP_NO_REC, HEVC_TIP_REC, sniffVideoCodec, type VideoCodec } from '@/supabase/functions/_shared/video-sniff';

// Lot 14 : l'enregistreur ne se charge qu'à son ouverture.
const Recorder = dynamic(() => import('@/components/training-video-recorder'), {
  ssr: false,
  loading: () => <p className="bt-fo-muted"><Loader2 className="inline h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> Chargement…</p>,
});

/** `source: 'recorder'` = filmé dans BEMEXO (durée mesurée par le minuteur, format lisible partout : pas d'alerte HEVC). */
export interface PickedVideo { file: File; mime: VideoMime; url: string; duration: number | null; source?: 'recorder' }

const CSS = `
.bt-fo-up{display:flex;flex-direction:column;gap:8px}
.bt-fo-quota{display:flex;flex-direction:column;gap:4px}
.bt-fo-bar{display:block;height:6px;border-radius:999px;background:#ECE6DA;overflow:hidden}
.bt-fo-bar i{display:block;height:100%;background:#15120F;border-radius:999px;transition:width .3s ease}
.bt-fo-bar.full i{background:#C0461F}
.bt-fo-file{display:flex;gap:10px;align-items:flex-start;min-width:0}
.bt-fo-prev{flex:none;width:132px;max-height:100px;border-radius:9px;background:#15120F;object-fit:contain}
.bt-fo-fmeta{min-width:0;display:flex;flex-direction:column;gap:3px}
.bt-fo-fname{font-size:12.5px;font-weight:800;overflow-wrap:anywhere}
.bt-fo-prog{display:flex;flex-direction:column;gap:5px}
.bt-fo-prog .bt-fo-bar{height:8px}
.bt-fo-prog .bt-fo-bar i{background:#2F7A4B;transition:width .2s linear}
.bt-fo-progline{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;font-weight:700;flex-wrap:wrap}
.bt-fo-note{font-size:12.5px;font-weight:700;color:#6E6A63}
.bt-fo-warn{display:flex;gap:8px;align-items:flex-start;padding:8px 10px;border-radius:10px;background:#FFF6D9;border:1px solid #FFC21A;font-size:12.5px;color:#15120F}
.bt-fo-warn svg{flex:none;margin-top:1px;color:#B45309}
.bt-fo-warn strong{font-weight:800}
.bt-fo-warn span{display:block;margin-top:3px;font-weight:600}
.bt-fo-up .bt-fo-btn{height:auto;min-height:44px;padding:0 14px}
.bt-fo-up .bt-fo-link{display:inline-flex;align-items:center;min-height:44px}
@media (prefers-reduced-motion:reduce){.bt-fo-bar i,.bt-fo-prog .bt-fo-bar i{transition:none}}
`;
const CSS_HTML = { __html: CSS };
const NO_LIMITS: Limits = { maxBytes: VIDEO_MAX_BYTES, quotaBytes: VIDEO_QUOTA_BYTES, usedBytes: 0 };

/**
 * Durée d'un fichier vidéo choisi (null si illisible). Le WebM d'un navigateur
 * annonce parfois une durée « infinie » : on la fait calculer en cherchant loin.
 */
function probeDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    let settled = false;
    const end = (d: number | null) => { if (settled) return; settled = true; v.removeAttribute('src'); v.load(); resolve(d); };
    const timer = setTimeout(() => end(null), 5000);
    v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => {
      if (Number.isFinite(v.duration)) { clearTimeout(timer); end(v.duration); return; }
      v.ondurationchange = () => { if (Number.isFinite(v.duration)) { clearTimeout(timer); end(v.duration); } };
      try { v.currentTime = 1e7; } catch { clearTimeout(timer); end(null); }
    };
    v.onerror = () => { clearTimeout(timer); end(null); };
    v.src = url;
  });
}

export default function TrainingVideoUpload({
  limits, file, fileError, progress, note, recOpen, recAuto, recError, recAvailable,
  onClear, onCancel, onDuration, onRecording, onRecDone, onRecError, onRecClose,
}: {
  limits: Limits | null;
  file: PickedVideo | null;
  fileError: string | null;
  progress: { loaded: number; total: number } | null;
  note: string | null;
  /** L'enregistreur est ouvert (bouton « Filmer » du formulaire). */
  recOpen: boolean;
  /** Message d'arrêt automatique de la dernière prise, et refus de la caméra. */
  recAuto: string | null;
  recError: string | null;
  /** « Filmer » est l'enregistreur intégré (et non la caméra native) : l'alerte HEVC y renvoie. */
  recAvailable: boolean;
  onClear: () => void;
  onCancel: () => void;
  onDuration: (url: string, seconds: number | null) => void;
  /** Lot 14 : vrai pendant une prise (le formulaire verrouille alors ce qui la jetterait). */
  onRecording?: (recording: boolean) => void;
  onRecDone: (f: File, durationS: number, auto: RecAuto | null) => void;
  onRecError: (message: string) => void;
  onRecClose: () => void;
}) {
  const lim = limits || NO_LIMITS;
  const full = quotaFull(lim);
  const showGauge = !!limits && (full || quotaNear(limits));
  const pct = progress && progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 0;
  const busy = !!progress;
  // La durée du fichier choisi, lue une fois par fichier.
  const probed = useRef<string | null>(null);
  useEffect(() => {
    if (!file || file.duration !== null || probed.current === file.url) return;
    probed.current = file.url;
    probeDuration(file.url).then((d) => onDuration(file.url, d));
  }, [file, onDuration]);
  // Alerte HEVC : le codec du fichier choisi, lu une fois par fichier (jamais pour une prise de l'enregistreur).
  const [codec, setCodec] = useState<VideoCodec | null>(null);
  const sniffed = useRef<string | null>(null);
  useEffect(() => {
    if (!file || file.source === 'recorder') { sniffed.current = null; setCodec(null); return; }
    if (sniffed.current === file.url) return;
    const url = file.url, f = file.file;
    sniffed.current = url;
    setCodec(null);
    sniffVideoCodec(async (a, b) => new Uint8Array(await f.slice(a, b).arrayBuffer()), f.size).then((c) => { if (sniffed.current === url) setCodec(c); });
  }, [file]);
  // Le focus suit : « Changer de vidéo » quand la prise est devenue la vidéo choisie (sinon c'est le formulaire qui rend le focus à « Filmer »).
  const changeBtn = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !recOpen) changeBtn.current?.focus();
    wasOpen.current = recOpen;
  }, [recOpen, file]);

  return (
    <div className="bt-fo-up" data-testid="tr-upload">
      <style dangerouslySetInnerHTML={CSS_HTML} />
      {showGauge && limits && (
        <div className="bt-fo-quota">
          <span className="bt-fo-muted" data-testid="tr-quota">{quotaLabel(lim.usedBytes, lim.quotaBytes)}</span>
          <span className={`bt-fo-bar${full ? ' full' : ''}`} aria-hidden="true"><i style={{ width: `${Math.round(quotaRatio(lim.usedBytes, lim.quotaBytes) * 100)}%` }} /></span>
        </div>
      )}
      {full && !file ? (
        <p className="bt-fo-err" data-testid="tr-quota-full">{QUOTA_FULL(lim.usedBytes, lim.quotaBytes)}</p>
      ) : !file && recOpen ? (
        <Recorder limits={lim} onDone={onRecDone} onError={onRecError} onCancel={onRecClose} onRecording={onRecording} />
      ) : file ? (
        <div className="bt-fo-file" data-testid="tr-file-ready">
          <video className="bt-fo-prev" src={file.url} preload="metadata" muted playsInline controls aria-label="Aperçu de la vidéo" data-testid="tr-preview" />
          <div className="bt-fo-fmeta">
            <span className="bt-fo-fname">{file.file.name || 'Vidéo'}</span>
            <span className="bt-fo-muted" data-testid="tr-file-meta">{[formatDuration(file.duration), formatMo(file.file.size)].filter(Boolean).join(' · ')}</span>
            {!busy && <button ref={changeBtn} type="button" className="bt-fo-link" onClick={onClear} data-testid="tr-file-change">Changer de vidéo</button>}
          </div>
        </div>
      ) : null}
      {file?.source === 'recorder' && <span className="sr-only" role="status">{REC_DONE}</span>}
      {file && recAuto && <p className="bt-fo-note" role="status" data-testid="tr-rec-auto">{recAuto}</p>}
      {file && codec === 'hevc' && (
        <div className="bt-fo-warn" role="status" data-testid="tr-hevc-alert">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <div><strong>{HEVC_ALERT}</strong> <span>{recAvailable ? HEVC_TIP_REC : HEVC_TIP_NO_REC}</span> <span>{HEVC_KEEP}</span></div>
        </div>
      )}
      {!file && recError && <p className="bt-fo-err" role="alert" data-testid="tr-rec-error">{recError}</p>}
      {fileError && <p className="bt-fo-err" role="alert" data-testid="tr-file-error">{fileError}</p>}
      {progress && (
        <div className="bt-fo-prog" data-testid="tr-progress">
          <span className="bt-fo-bar" role="progressbar" aria-label="Envoi de la vidéo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <i style={{ width: `${pct}%` }} />
          </span>
          <span className="bt-fo-progline">
            <span data-testid="tr-progress-text">Envoi… {pct} % ({formatMo(progress.loaded)} sur {formatMo(progress.total)})</span>
            <button type="button" className="bt-fo-btn ghost sm" onClick={onCancel} data-testid="tr-upload-cancel">Annuler l’envoi</button>
          </span>
        </div>
      )}
      {note && <p className="bt-fo-note" data-testid="tr-upload-note">{note}</p>}
    </div>
  );
}
