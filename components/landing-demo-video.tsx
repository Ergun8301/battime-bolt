'use client';

import { useEffect, useRef, useState } from 'react';

// Section « Comment ça marche » de la landing — lecteur de la vidéo de démo.
// Purement additif : la landing statique reste intacte, ce composant est
// inséré entre deux blocs HTML existants (aucune section modifiée).
//
// Comportement :
//  - UNE seule vidéo 16:9 (ordinateur et mobile), jamais recadrée : le cadre
//    garde le 16:9 et rétrécit si l'écran est bas. Sur téléphone, le bouton
//    « Voir en plein écran » (sous la vidéo) l'ouvre en grand ; tourné en
//    paysage, tout se lit.
//  - autoplay + muet + boucle + playsinline, poster (zéro layout shift via
//    aspect-ratio), fichiers allégés (~17 Mo, lecture progressive) servis depuis /public.
//  - pause automatique hors écran, reprise quand la section revient
//    (sauf si l'utilisateur a mis pause lui-même).
//  - accessibilité : pas d'autoplay si prefers-reduced-motion.
//  - contrôle discret play/pause (pastille noir/jaune, coin bas droit).

const CSS = `
.lp-demo{background:#15120F;color:#F2EDE3;position:relative;scroll-margin-top:78px}
.lp-demo-inner{max-width:1080px;margin:0 auto;padding:52px 28px 60px}
.lp-demo-head{text-align:center;max-width:640px;margin:0 auto 30px}
.lp-demo-kicker{font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#FFC21A;margin-bottom:16px}
.lp-demo-h2{font-size:42px;line-height:1.04;font-weight:900;letter-spacing:-.02em;margin:0}
.lp-demo-sub{font-size:15.5px;line-height:1.5;color:#a59c86;font-weight:500;margin:14px 0 0}
/* Cadre net + halo : le lecteur reste toujours détaché du fond sombre de la
   section, même quand la vidéo elle-même est sombre (scène du début). Bordure
   crème fine (délimite le bord en toute circonstance) + léger halo chaud. */
.lp-demo-frame{position:relative;margin:0 auto;max-width:min(940px,calc(60vh * 16 / 9));aspect-ratio:16/9;border:1px solid rgba(242,237,227,.34);border-radius:18px;overflow:hidden;background:#0d0b09 center/cover no-repeat;background-image:url('/demo-16x9-poster.jpg');box-shadow:0 0 0 6px rgba(242,237,227,.05),0 34px 90px -34px rgba(0,0,0,.65),0 0 70px -14px rgba(255,194,26,.22)}
.lp-demo-frame video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}
.lp-demo-btn{position:absolute;right:14px;bottom:14px;z-index:3;width:46px;height:46px;border-radius:50%;border:1px solid rgba(242,237,227,.35);background:rgba(21,18,15,.72);color:#FFC21A;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:.85;transition:opacity .15s ease,transform .12s ease;padding:0}
.lp-demo-btn:hover{opacity:1;transform:scale(1.06)}
.lp-demo-btn:active{transform:scale(.96)}
.lp-demo-btn svg{display:block}
/* Plein écran : icône en haut à droite de la vidéo (coin libre : les titres
   de la vidéo sont en bas) ; sur mobile, bouton texte SOUS la vidéo. */
.lp-demo-fs{position:absolute;right:14px;top:14px;z-index:3;width:40px;height:40px;border-radius:50%;border:1px solid rgba(242,237,227,.35);background:rgba(21,18,15,.72);color:#F2EDE3;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:.8;transition:opacity .15s ease,transform .12s ease;padding:0}
.lp-demo-fs:hover{opacity:1;transform:scale(1.06)}
.lp-demo-fs:active{transform:scale(.96)}
.lp-demo-fs svg,.lp-demo-fsm svg{display:block;flex:none}
.lp-demo-fsm-row{display:none;text-align:center;margin-top:16px}
.lp-demo-fsm{display:inline-flex;align-items:center;gap:10px;height:44px;padding:0 20px;border-radius:22px;border:1px solid rgba(255,194,26,.55);background:transparent;color:#F2EDE3;cursor:pointer;font:600 13px/1 'JetBrains Mono',monospace;letter-spacing:.06em}
.lp-demo-fsm:active{transform:scale(.97)}
@media(max-width:880px){
  .lp-demo-inner{padding:40px 16px 52px}
  .lp-demo-h2{font-size:32px}
  .lp-demo-frame{max-width:100%;border-radius:14px}
  .lp-demo-btn{right:10px;bottom:10px;width:40px;height:40px}
  .lp-demo-fs{display:none}
  .lp-demo-fsm-row{display:block}
}
`;

// Plein écran : API standard (Android, ordinateur, iPad), sinon le lecteur
// natif d'iPhone (webkitEnterFullscreen). En plein écran, on demande le
// paysage quand le navigateur le permet (Android) ; sur iPhone, le lecteur
// natif suit la rotation du téléphone.
type FsVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };
type LockableOrientation = { lock?: (o: string) => Promise<void> };

function openFullscreen(v: FsVideo) {
  const landscape = () => {
    const o = (screen as unknown as { orientation?: LockableOrientation }).orientation;
    o?.lock?.('landscape').catch(() => {});
  };
  // iPhone : pas d'API Fullscreen standard (document.fullscreenEnabled faux),
  // on appelle le lecteur natif directement, pendant le geste de l'utilisateur.
  if (document.fullscreenEnabled && typeof v.requestFullscreen === 'function') {
    v.requestFullscreen().then(landscape).catch(() => {});
  } else {
    v.webkitEnterFullscreen?.();
  }
}

const FS_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1.5 5.5v-4h4M10.5 1.5h4v4M14.5 10.5v4h-4M5.5 14.5h-4v-4" />
  </svg>
);

export default function LandingDemoVideo() {
  // false = pas encore monté (SSR) : on n'affiche que le cadre + poster.
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const userPausedRef = useRef(false);
  const reducedRef = useRef(false);
  const frameRef = useRef<HTMLDivElement | null>(null);

  // montage côté client : on lit la préférence « réduire les animations »
  useEffect(() => {
    reducedRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReady(true);
  }, []);

  // Démarrage fiable : React pose `muted` en propriété APRÈS l'insertion du
  // <video>, donc Chrome évalue l'autoplay comme "avec son" et le bloque
  // (bug React connu). On force muted via la ref puis on lance play().
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !ready) return;
    v.muted = true;
    v.defaultMuted = true;
    if (!reducedRef.current && !userPausedRef.current) {
      v.play().catch(() => {});
    }
  }, [ready]);

  // lecture/pause automatique selon la visibilité de la section
  useEffect(() => {
    const el = frameRef.current;
    if (!el || !ready) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const v = videoRef.current;
        if (!v) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
          if (!userPausedRef.current && !reducedRef.current) v.play().catch(() => {});
        } else {
          if (!v.paused) v.pause();
        }
      },
      { threshold: [0, 0.35, 0.7] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ready]);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      userPausedRef.current = false;
      v.play().catch(() => {});
    } else {
      userPausedRef.current = true;
      v.pause();
    }
  };

  const fullscreen = () => {
    const v = videoRef.current;
    if (!v) return;
    userPausedRef.current = false;
    v.play().catch(() => {});
    openFullscreen(v);
  };

  // MP4 (H.264) servi en priorité — lu partout ;
  // WebM (VP9) en secours pour les navigateurs sans décodeur H.264.
  const base = '/demo-16x9';
  const poster = `${base}-poster.jpg`;

  return (
    <section id="demo" className="lp-demo">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="lp-demo-inner">
        <div className="lp-demo-head">
          <div className="lp-demo-kicker">La démo · 2 min 18</div>
          <h2 className="lp-demo-h2">Comment ça marche</h2>
          <p className="lp-demo-sub">De la saisie sur le chantier à l&apos;export paie — regardez, tout y est.</p>
        </div>

        <div className="lp-demo-frame" ref={frameRef}>
          {ready && (
            <video
              ref={videoRef}
              poster={poster}
              muted
              loop
              playsInline
              autoPlay={!reducedRef.current}
              preload="metadata"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onClick={toggle}
              aria-label="Vidéo de démonstration BEMEXO : saisie des heures sur le chantier, planning d'équipe, export paie"
            >
              <source src={`${base}.mp4`} type="video/mp4" />
              <source src={`${base}.webm`} type="video/webm" />
            </video>
          )}
          <button type="button" className="lp-demo-fs" onClick={fullscreen} aria-label="Voir la vidéo en plein écran">
            {FS_ICON}
          </button>
          <button type="button" className="lp-demo-btn" onClick={toggle} aria-label={playing ? 'Mettre la vidéo en pause' : 'Lire la vidéo'}>
            {playing ? (
              <svg width="15" height="16" viewBox="0 0 15 16" fill="currentColor" aria-hidden="true">
                <rect x="1.5" y="1" width="4.2" height="14" rx="1.2" />
                <rect x="9.3" y="1" width="4.2" height="14" rx="1.2" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M3.5 1.8c0-.9 1-1.5 1.8-1L14 6.9c.8.5.8 1.7 0 2.2L5.3 15.2c-.8.5-1.8-.1-1.8-1V1.8Z" />
              </svg>
            )}
          </button>
        </div>
        <div className="lp-demo-fsm-row">
          <button type="button" className="lp-demo-fsm" onClick={fullscreen}>
            {FS_ICON}
            Voir en plein écran
          </button>
        </div>
      </div>
    </section>
  );
}
