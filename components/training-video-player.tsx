'use client';

// Vidéos de formation (lot 13, oct. 2026) — le lecteur intégré, partagé par le
// bureau (components/trainings-admin.tsx) et le salarié
// (components/poseur-trainings.tsx). Rien n'est signé avant l'ouverture : le
// lien de lecture (10 min) est créé quand on touche « Regarder ». Si la lecture
// échoue (lien expiré en pause ou au retour sur l'appli, réseau), on re-signe UNE
// fois par panne et on reprend où on en était ; ensuite un message clair (pas de
// boucle : le compteur ne repart à zéro que quand la lecture a vraiment avancé).
// preload="metadata" : seule l'en-tête du fichier part avant « lecture ».
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { signVideo } from '@/lib/training-videos';
import { PLAY_FAILED, PLAY_RESIGN_MAX } from '@/supabase/functions/_shared/training-videos';

const CSS = `
.bt-vp{display:flex;flex-direction:column;gap:6px;width:100%;min-width:0}
.bt-vp video{display:block;width:100%;max-height:320px;border-radius:10px;background:#15120F}
.bt-vp-msg{font-size:12px;font-weight:700;color:#6E6A63}
.bt-vp-err{font-size:12px;font-weight:700;color:#C0461F}
`;
const CSS_HTML = { __html: CSS };

export default function TrainingVideoPlayer({ companyId, path, title, onEnded }: {
  companyId: string | null | undefined; path: string; title: string; onEnded?: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const resigned = useRef(0);
  const resumeAt = useRef(0);
  const ref = useRef<HTMLVideoElement | null>(null);

  const sign = useCallback(async () => {
    const url = await signVideo(companyId, path);
    if (!url) { setFailed(true); return; }
    setSrc(url);
  }, [companyId, path]);

  useEffect(() => {
    resigned.current = 0; resumeAt.current = 0; setFailed(false); setSrc(null);
    sign();
  }, [sign]);

  const onError = () => {
    if (resigned.current >= PLAY_RESIGN_MAX) { setFailed(true); return; }
    resigned.current += 1;
    resumeAt.current = ref.current?.currentTime || 0;
    setSrc(null);
    sign();
  };
  const onLoaded = () => {
    if (resumeAt.current > 0 && ref.current) { try { ref.current.currentTime = resumeAt.current; } catch { /* pas encore cherchable */ } }
  };
  // La lecture a avancé d'au moins 1 s depuis la panne : un lien expiré plus tard pourra être re-signé de nouveau.
  const onTime = () => {
    if (resigned.current > 0 && (ref.current?.currentTime || 0) > resumeAt.current + 1) resigned.current = 0;
  };

  return (
    <div className="bt-vp" data-testid="video-player">
      <style dangerouslySetInnerHTML={CSS_HTML} />
      {failed ? (
        <p className="bt-vp-err" role="alert" data-testid="video-failed">{PLAY_FAILED}</p>
      ) : src ? (
        <video ref={ref} src={src} controls preload="metadata" playsInline aria-label={title} data-testid="video-el"
          onError={onError} onLoadedMetadata={onLoaded} onTimeUpdate={onTime} onEnded={onEnded} />
      ) : (
        <p className="bt-vp-msg"><Loader2 className="inline h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> Chargement de la vidéo…</p>
      )}
    </div>
  );
}
