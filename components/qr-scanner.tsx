'use client';

// Scanner du QR de la borne, DANS l'appli (lot 6). Le QR contient l'adresse
// /pointer?k=…&c=… (lot 1) : on l'ouvre, et c'est exactement le même flux que
// le scan avec l'appareil photo du téléphone.
//
// Lecture : BarcodeDetector quand le navigateur l'a (Android / Chrome) ; sinon
// jsQR, chargé seulement à ce moment-là. Rien n'est enregistré : l'image reste
// dans le téléphone.

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

const CSS = `
.qs{position:fixed;inset:0;z-index:96;background:#000;display:flex;flex-direction:column}
.qs video{flex:1;width:100%;object-fit:cover}
.qs-top{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:calc(env(safe-area-inset-top) + 12px) 16px 12px;color:#fff;font-weight:900;font-size:16px}
.qs-top button{border:none;background:rgba(255,255,255,.18);color:#fff;width:40px;height:40px;border-radius:999px;display:flex;align-items:center;justify-content:center;cursor:pointer}
.qs-frame{position:absolute;left:50%;top:50%;width:min(64vw,280px);aspect-ratio:1;transform:translate(-50%,-50%);border:3px solid #FFC21A;border-radius:22px;box-shadow:0 0 0 999px rgba(0,0,0,.35)}
.qs-msg{position:absolute;left:16px;right:16px;bottom:calc(env(safe-area-inset-bottom) + 24px);text-align:center;color:#fff;font-weight:700;font-size:14px}
`;

type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };

/** Adresse de pointage lue sur le QR → chemin interne, ou null si ce n'est pas un QR de borne. */
export function pointerPathFromQr(text: string): string | null {
  try {
    const u = new URL(text, typeof window !== 'undefined' ? window.location.origin : 'https://bemexo.com');
    if (u.pathname.replace(/\/+$/, '') !== '/pointer') return null;
    if (!u.searchParams.get('k') || !u.searchParams.get('c')) return null;
    return `/pointer?k=${encodeURIComponent(u.searchParams.get('k')!)}&c=${encodeURIComponent(u.searchParams.get('c')!)}`;
  } catch {
    return null;
  }
}

export default function QrScanner({ onClose, onPath }: { onClose: () => void; onPath: (path: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [msg, setMsg] = useState('Visez le QR de la borne');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const canvas = document.createElement('canvas');
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch {
        setMsg('Caméra refusée. Autorisez-la, ou scannez avec l’appareil photo du téléphone.');
        return;
      }
      const v = videoRef.current!;
      v.srcObject = stream; await v.play().catch(() => {});
      const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      const detector: Detector | null = BD ? new BD({ formats: ['qr_code'] }) : null;
      const jsQR = detector ? null : (await import('jsqr')).default;
      const tick = async () => {
        if (stop) return;
        let text: string | null = null;
        if (v.videoWidth) {
          if (detector) {
            const r = await detector.detect(v).catch(() => []);
            text = r[0]?.rawValue ?? null;
          } else if (jsQR) {
            const w = 480, h = Math.round((v.videoHeight / v.videoWidth) * 480);
            canvas.width = w; canvas.height = h;
            const g = canvas.getContext('2d', { willReadFrequently: true })!;
            g.drawImage(v, 0, 0, w, h);
            text = jsQR(g.getImageData(0, 0, w, h).data, w, h)?.data ?? null;
          }
        }
        if (text) {
          const path = pointerPathFromQr(text);
          if (path) { stop = true; onPath(path); return; }
          setMsg('Ce QR n’est pas celui d’une borne BEMEXO.');
        }
        timer = setTimeout(tick, 200);
      };
      tick();
    })();
    return () => { stop = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [onPath]);

  return (
    <div className="qs" data-testid="qr-scanner">
      <style>{CSS}</style>
      <video ref={videoRef} playsInline muted />
      <div className="qs-frame" />
      <div className="qs-top"><span>Scanner la borne</span><button type="button" onClick={onClose} aria-label="Fermer"><X className="h-5 w-5" /></button></div>
      <p className="qs-msg">{msg}</p>
    </div>
  );
}
