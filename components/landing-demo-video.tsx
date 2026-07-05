'use client';

import { useEffect, useRef, useState } from 'react';

// Section « Comment ça marche » de la landing — lecteur de la vidéo de démo.
// Purement additif : la landing statique reste intacte, ce composant est
// inséré entre deux blocs HTML existants (aucune section modifiée).
//
// Comportement :
//  - 16:9 sur ordinateur, 9:16 sur mobile (breakpoint 880px, celui du site) ;
//    UN SEUL <video> monté à la fois => pas de double téléchargement.
//  - autoplay + muet + boucle + playsinline, poster (zéro layout shift via
//    aspect-ratio), fichiers allégés (~3,5 Mo) servis depuis /public.
//  - pause automatique hors écran, reprise quand la section revient
//    (sauf si l'utilisateur a mis pause lui-même).
//  - accessibilité : pas d'autoplay si prefers-reduced-motion.
//  - contrôle discret play/pause (pastille noir/jaune, coin bas droit).

const CSS = `
.lp-demo{background:#15120F;color:#F2EDE3;position:relative}
.lp-demo-inner{max-width:1080px;margin:0 auto;padding:84px 28px 92px}
.lp-demo-head{text-align:center;max-width:640px;margin:0 auto 46px}
.lp-demo-kicker{font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#FFC21A;margin-bottom:16px}
.lp-demo-h2{font-size:42px;line-height:1.04;font-weight:900;letter-spacing:-.02em;margin:0}
.lp-demo-sub{font-size:15.5px;line-height:1.5;color:#a59c86;font-weight:500;margin:14px 0 0}
.lp-demo-frame{position:relative;margin:0 auto;max-width:940px;aspect-ratio:16/9;border-radius:18px;overflow:hidden;background:#0d0b09 center/cover no-repeat;background-image:url('/demo-16x9-poster.jpg');box-shadow:0 46px 100px -34px rgba(0,0,0,.7)}
.lp-demo-frame video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.lp-demo-btn{position:absolute;right:14px;bottom:14px;z-index:3;width:46px;height:46px;border-radius:50%;border:1px solid rgba(242,237,227,.35);background:rgba(21,18,15,.72);color:#FFC21A;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:.85;transition:opacity .15s ease,transform .12s ease;padding:0}
.lp-demo-btn:hover{opacity:1;transform:scale(1.06)}
.lp-demo-btn:active{transform:scale(.96)}
.lp-demo-btn svg{display:block}
@media(max-width:880px){
  .lp-demo-inner{padding:64px 22px 72px}
  .lp-demo-h2{font-size:32px}
  .lp-demo-frame{max-width:390px;aspect-ratio:9/16;border-radius:22px;background-image:url('/demo-9x16-poster.jpg')}
}
`;

export default function LandingDemoVideo() {
  // null = pas encore monté (SSR) : on n'affiche que le cadre + poster.
  const [mobile, setMobile] = useState<boolean | null>(null);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const userPausedRef = useRef(false);
  const reducedRef = useRef(false);
  const frameRef = useRef<HTMLDivElement | null>(null);

  // breakpoint : un seul <video> monté selon la taille d'écran
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 880px)');
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedRef.current = rm.matches;
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Démarrage fiable : React pose `muted` en propriété APRÈS l'insertion du
  // <video>, donc Chrome évalue l'autoplay comme "avec son" et le bloque
  // (bug React connu). On force muted via la ref puis on lance play().
  useEffect(() => {
    const v = videoRef.current;
    if (!v || mobile === null) return;
    v.muted = true;
    v.defaultMuted = true;
    if (!reducedRef.current && !userPausedRef.current) {
      v.play().catch(() => {});
    }
  }, [mobile]);

  // lecture/pause automatique selon la visibilité de la section
  useEffect(() => {
    const el = frameRef.current;
    if (!el || mobile === null) return;
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
  }, [mobile]);

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

  // MP4 (H.264) servi en priorité — le plus léger ici et lu partout ;
  // WebM (VP9) en secours pour les navigateurs sans décodeur H.264.
  const base = mobile ? '/demo-9x16' : '/demo-16x9';
  const poster = `${base}-poster.jpg`;

  return (
    <section id="demo" className="lp-demo">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="lp-demo-inner">
        <div className="lp-demo-head">
          <div className="lp-demo-kicker">La démo · 1 min 30</div>
          <h2 className="lp-demo-h2">Comment ça marche</h2>
          <p className="lp-demo-sub">Du pointage sur le chantier à l&apos;export paie — regardez, tout y est.</p>
        </div>

        <div className="lp-demo-frame" ref={frameRef}>
          {mobile !== null && (
            <video
              key={base}
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
              aria-label="Vidéo de démonstration BEMEXO : pointage sur le chantier, planning en temps réel, export paie"
            >
              <source src={`${base}.mp4`} type="video/mp4" />
              <source src={`${base}.webm`} type="video/webm" />
            </video>
          )}
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
      </div>
    </section>
  );
}
