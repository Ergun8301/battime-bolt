'use client';

// Vidéos de formation (lot 13, oct. 2026) — le panneau « Vidéo (téléphone ou
// fichier) » du formulaire « Ajouter une formation » (components/trainings-admin.tsx).
// Chargé SEULEMENT quand on choisit cette option (next/dynamic) : l'écran du
// bureau ne grossit pas pour ceux qui ne s'en servent pas.
//  - la jauge « 23 Mo utilisés sur 100 Mo » ;
//  - « Filmer » (caméra du téléphone) et « Choisir un fichier » ;
//  - l'aperçu, la durée, la taille ; le refus clair (trop lourd, format, quota) ;
//  - la barre de progression RÉELLE de l'envoi (octets partis) et « Annuler l'envoi ».
// L'envoi lui-même (réserver, envoyer, publier) reste dans le formulaire.
import { useEffect, useRef } from 'react';
import { Camera, FolderOpen } from 'lucide-react';
import {
  formatDuration, formatMo, GPS_NOTE, QUOTA_FULL, quotaFull, quotaLabel, quotaRatio, VIDEO_MAX_BYTES, VIDEO_QUOTA_BYTES, type Limits, type VideoMime,
} from '@/supabase/functions/_shared/training-videos';

export interface PickedVideo { file: File; mime: VideoMime; url: string; duration: number | null }

const CSS = `
.bt-fo-up{display:flex;flex-direction:column;gap:8px}
.bt-fo-quota{display:flex;flex-direction:column;gap:4px}
.bt-fo-bar{display:block;height:6px;border-radius:999px;background:#ECE6DA;overflow:hidden}
.bt-fo-bar i{display:block;height:100%;background:#15120F;border-radius:999px;transition:width .3s ease}
.bt-fo-bar.full i{background:#C0461F}
.bt-fo-pick{display:flex;flex-wrap:wrap;gap:6px}
.bt-fo-pick label{position:relative;cursor:pointer}
.bt-fo-pick label:focus-within{outline:2px solid #FFC21A;outline-offset:1px}
.bt-fo-pick label[aria-disabled="true"]{opacity:.5;cursor:default}
.bt-fo-filein{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.bt-fo-filein:disabled{cursor:default}
.bt-fo-file{display:flex;gap:10px;align-items:flex-start;min-width:0}
.bt-fo-prev{flex:none;width:132px;max-height:100px;border-radius:9px;background:#15120F;object-fit:contain}
.bt-fo-fmeta{min-width:0;display:flex;flex-direction:column;gap:3px}
.bt-fo-fname{font-size:12.5px;font-weight:800;overflow-wrap:anywhere}
.bt-fo-prog{display:flex;flex-direction:column;gap:5px}
.bt-fo-prog .bt-fo-bar{height:8px}
.bt-fo-prog .bt-fo-bar i{background:#2F7A4B;transition:width .2s linear}
.bt-fo-progline{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;font-weight:700;flex-wrap:wrap}
.bt-fo-note{font-size:12.5px;font-weight:700;color:#6E6A63}
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

export default function TrainingVideoUpload({ limits, file, fileError, progress, note, onPick, onClear, onCancel, onDuration }: {
  limits: Limits | null;
  file: PickedVideo | null;
  fileError: string | null;
  progress: { loaded: number; total: number } | null;
  note: string | null;
  onPick: (f: File | null | undefined) => void;
  onClear: () => void;
  onCancel: () => void;
  onDuration: (url: string, seconds: number | null) => void;
}) {
  const lim = limits || NO_LIMITS;
  const full = quotaFull(lim);
  const pct = progress && progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 0;
  const busy = !!progress;
  // La durée du fichier choisi, lue une fois par fichier.
  const probed = useRef<string | null>(null);
  useEffect(() => {
    if (!file || file.duration !== null || probed.current === file.url) return;
    probed.current = file.url;
    probeDuration(file.url).then((d) => onDuration(file.url, d));
  }, [file, onDuration]);

  return (
    <div className="bt-fo-up" data-testid="tr-upload">
      <style dangerouslySetInnerHTML={CSS_HTML} />
      <div className="bt-fo-quota">
        <span className="bt-fo-muted" data-testid="tr-quota">{limits ? quotaLabel(lim.usedBytes, lim.quotaBytes) : 'Place disponible…'}</span>
        <span className={`bt-fo-bar${full ? ' full' : ''}`} aria-hidden="true"><i style={{ width: `${Math.round(quotaRatio(lim.usedBytes, lim.quotaBytes) * 100)}%` }} /></span>
      </div>
      {full && !file ? (
        <p className="bt-fo-err" data-testid="tr-quota-full">{QUOTA_FULL(lim.usedBytes, lim.quotaBytes)}</p>
      ) : !file ? (
        <>
          <div className="bt-fo-pick">
            <label className="bt-fo-btn ghost sm" aria-disabled={busy}>
              <Camera className="h-3.5 w-3.5" aria-hidden="true" /> Filmer
              {/* capture : ouvre la caméra sur un téléphone ; ignoré sur un ordinateur (comme les photos de « Documents »). */}
              <input type="file" accept="video/*" capture="environment" className="bt-fo-filein" disabled={busy} aria-label="Filmer une vidéo"
                onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ''; }} data-testid="tr-film" />
            </label>
            <label className="bt-fo-btn ghost sm" aria-disabled={busy}>
              <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" /> Choisir un fichier
              <input type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.m4v,.mov,.webm" className="bt-fo-filein" disabled={busy} aria-label="Choisir un fichier vidéo"
                onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ''; }} data-testid="tr-file" />
            </label>
          </div>
          <span className="bt-fo-muted">MP4, MOV ou WebM · {formatMo(lim.maxBytes)} maximum (environ 50 s filmées en 1080p sur iPhone, plus en 720p).</span>
        </>
      ) : (
        <div className="bt-fo-file" data-testid="tr-file-ready">
          <video className="bt-fo-prev" src={file.url} preload="metadata" muted playsInline controls aria-label="Aperçu de la vidéo" data-testid="tr-preview" />
          <div className="bt-fo-fmeta">
            <span className="bt-fo-fname">{file.file.name || 'Vidéo'}</span>
            <span className="bt-fo-muted" data-testid="tr-file-meta">{[formatDuration(file.duration), formatMo(file.file.size)].filter(Boolean).join(' · ')}</span>
            {!busy && <button type="button" className="bt-fo-link" onClick={onClear} data-testid="tr-file-change">Changer de vidéo</button>}
          </div>
        </div>
      )}
      {!full && !busy && <p className="bt-fo-muted" data-testid="tr-gps-note">{GPS_NOTE}</p>}
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
