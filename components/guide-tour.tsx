'use client';

// Guide pas à pas (lot 7) — composant COMMUN : il ne connaît ni le salarié ni le
// bureau. On lui donne des étapes `{ cible, texte, ecran? }` ; `cible` est la
// valeur de l'attribut `data-guide="…"` du vrai bouton à entourer.
//
// Il MONTRE, il ne FAIT JAMAIS : aucun toucher à la place du salarié, rien
// d'envoyé, rien d'écrit, aucune donnée qui sort. L'anneau laisse passer les
// touchers (pointer-events: none) : le salarié peut toucher le vrai bouton lui-même
// et le guide avance tout seul (clic écouté en capture, sans l'empêcher).
//
// Cible introuvable (écran pas prêt, fonction éteinte, autre état) : on réessaie
// ~1,5 s, puis la carte parle sans anneau — « Suivant » marche toujours. Elle
// continue de chercher : si le bouton apparaît plus tard, l'anneau revient.
//
// L'écran à préparer (menu, semaine…) est l'affaire de `onStepEnter` : ici on ne
// sait rien de l'application.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export interface GuideStep { cible: string; texte: string; ecran?: string }

interface Props {
  steps: GuideStep[];
  /** À chaque étape affichée (la première comprise) : préparer l'écran (menu, page…). */
  onStepEnter?: (step: GuideStep, index: number) => void;
  onClose: () => void;
  /** Où remettre le focus à la fermeture si le bouton qui a lancé le guide n'existe plus. */
  returnFocus?: () => HTMLElement | null;
}

const SEARCH_MS = 1500;   // on réessaie ce temps-là avant de dire « je ne vois pas »
const GRACE_MS = 600;     // une cible qui disparaît un instant (animation) garde son anneau
const BURST_MS = 900;     // suivi image par image après un défilement / un changement
const POLL_MS = 200;      // filet de sécurité : une cible qui bouge sans événement
const PAD = 4;            // l'anneau déborde de la cible de 4 px de chaque côté
const Z_TOP = 60;         // au-dessus de l'écran ET des fenêtres de l'app (Radix : 50), pour qu'on puisse toujours continuer
const Z_YIELD = 45;       // …mais SOUS une boîte de confirmation ouverte (`data-guide-confirm`) qui ne contient pas la cible

const CSS = `
.gt-ring,.gt-card{z-index:var(--gt-z,60)}
.gt-ring{position:fixed;left:0;top:0;pointer-events:none;box-sizing:border-box;border-radius:14px;box-shadow:0 0 0 3px var(--gt-bg,#15120F),0 0 0 6px var(--gt-accent,#FFC21A),0 0 0 9px rgba(255,194,26,.35);animation:gt-pulse 1.4s ease-in-out infinite}
@keyframes gt-pulse{0%,100%{box-shadow:0 0 0 3px var(--gt-bg,#15120F),0 0 0 6px var(--gt-accent,#FFC21A),0 0 0 9px rgba(255,194,26,.35)}50%{box-shadow:0 0 0 3px var(--gt-bg,#15120F),0 0 0 6px var(--gt-accent,#FFC21A),0 0 0 15px rgba(255,194,26,0)}}
.gt-card{position:fixed;left:0;right:0;margin:0 auto;width:min(480px,calc(100% - 16px));box-sizing:border-box;pointer-events:auto;background:var(--gt-bg,#15120F);color:var(--gt-fg,#F2EDE3);border-radius:20px;border:1px solid var(--gt-line,rgba(242,237,227,.22));padding:12px 14px 14px;box-shadow:0 12px 40px rgba(21,18,15,.45);font-family:inherit;outline:none;animation:gt-rise .18s ease-out}
.gt-card[data-pos=bottom]{bottom:calc(env(safe-area-inset-bottom) + 8px)}
.gt-card[data-pos=top]{top:calc(env(safe-area-inset-top) + 8px)}
@keyframes gt-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.gt-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.gt-count{font-size:12.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--gt-muted,#CFC7B6)}
.gt-close{display:inline-flex;align-items:center;gap:4px;min-height:44px;min-width:44px;padding:0 6px 0 10px;margin:-6px -6px -6px 0;border:none;background:transparent;color:var(--gt-fg,#F2EDE3);font:inherit;font-size:14px;font-weight:700;cursor:pointer;border-radius:12px}
.gt-txt{margin:2px 0 12px;font-size:17px;line-height:1.4;font-weight:600}
.gt-miss{display:block;margin-bottom:4px;color:var(--gt-accent,#FFC21A);font-weight:800}
.gt-nav{display:flex;gap:8px}
.gt-btn{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:48px;padding:0 14px;border:none;border-radius:14px;font:inherit;font-size:16px;font-weight:800;cursor:pointer;background:var(--gt-accent,#FFC21A);color:var(--gt-accent-fg,#15120F)}
.gt-btn.ghost{background:transparent;color:var(--gt-fg,#F2EDE3);border:1.5px solid var(--gt-line,rgba(242,237,227,.35));flex:0 1 38%}
.gt-btn:disabled{opacity:.35;cursor:default}
.gt-card button:focus-visible{outline:3px solid var(--gt-fg,#F2EDE3);outline-offset:2px}
.gt-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (prefers-reduced-motion:reduce){.gt-ring,.gt-card{animation:none!important;transition:none!important}}
@media (forced-colors:active){.gt-ring{outline:4px solid Highlight}.gt-card{border:2px solid CanvasText}}
`;
// Objet FIXE (règle du lot 10) : pas de feuille réécrite à chaque rendu.
const CSS_HTML = { __html: CSS };

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
/** Affiché pour de bon (pas `display:none`, pas caché) ? */
const shown = (el: Element) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[data-guide-ui]');

/** Un point de la cible est-il bien ce qu'on voit (et pas une fenêtre posée par-dessus) ? */
function reachable(el: Element, r: DOMRect): boolean {
  const vw = window.innerWidth, vh = window.innerHeight;
  const left = Math.max(r.left, 0), right = Math.min(r.right, vw), top = Math.max(r.top, 0), bottom = Math.min(r.bottom, vh);
  if (right - left < 2 || bottom - top < 2) return true; // hors écran : on ne peut pas juger
  const w = right - left, h = bottom - top;
  for (const [fx, fy] of [[.5, .5], [.2, .5], [.8, .5], [.5, .2], [.5, .8]]) {
    const top1 = document.elementsFromPoint(left + w * fx, top + h * fy).find((n) => !n.closest('[data-guide-ui]'));
    if (top1 && (el.contains(top1) || top1.contains(el))) return true;
  }
  return false;
}

const TOUCHABLE = 'button, a[href], input, select, textarea, summary, [role="button"], [role="menuitem"]';
/** Combien de points d'un rectangle tombent sur quelque chose que le salarié peut toucher ? (la carte, elle, ne compte pas) */
function touchables(r: { x: number; y: number; w: number; h: number }): number {
  let n = 0;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
    const top = document.elementsFromPoint(r.x + (r.w * (i + .5)) / 6, r.y + (r.h * (j + .5)) / 3).find((e) => !e.closest('[data-guide-ui]'));
    if (top?.closest(TOUCHABLE)) n++;
  }
  return n;
}

/** Le plus haut calque (fenêtre, menu, informations…) qui contient la cible : le guide se pose au-dessus. */
function layerOf(el: Element): number {
  let z = 0;
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    const v = parseInt(getComputedStyle(n).zIndex, 10);
    if (!Number.isNaN(v)) z = Math.max(z, v);
  }
  return z;
}

/** Le défilement qui contient la cible, s'il y en a un vrai (jamais un conteneur `overflow:hidden`). */
function scrollerOf(el: Element): HTMLElement | null {
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
    if (cs.position === 'fixed') return null;
  }
  return null;
}

export default function GuideTour({ steps, onStepEnter, onClose, returnFocus }: Props) {
  const [index, setIndex] = useState(0);
  // search = on cherche encore · ok = anneau · missing = pas trouvé · covered = caché par une fenêtre
  const [phase, setPhase] = useState<'search' | 'ok' | 'missing' | 'covered'>('search');
  const [pos, setPos] = useState<'bottom' | 'top'>('bottom');
  const ringRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [opener] = useState(() => (typeof document === 'undefined' ? null : document.activeElement));
  const last = steps.length - 1;
  const step = steps[Math.min(index, last)];

  // Les parents passent des fonctions neuves à chaque rendu : on garde la dernière.
  const live = useRef({ onStepEnter, onClose, returnFocus });
  live.current = { onStepEnter, onClose, returnFocus };

  // L'étape courante vit aussi dans une ref : un toucher sur la cible et un « Suivant » presque
  // simultanés ne sautent pas deux étapes, et rien d'impur dans `setIndex`.
  const at = useRef(0);
  const close = useCallback(() => live.current.onClose(), []);
  const go = useCallback((d: number) => {
    const n = at.current + d;
    if (n > last) { live.current.onClose(); return; }
    if (n < 0) return;
    at.current = n;
    setPhase('search');
    setIndex(n);
  }, [last]);

  // ── À l'ouverture : focus sur la carte ; à la fermeture : retour au bouton de départ.
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
    return () => {
      const back = () => (opener && opener !== document.body && opener.isConnected ? opener as HTMLElement : live.current.returnFocus?.());
      back()?.focus?.({ preventScroll: true });
      // Un menu ou une fenêtre qui se referme en même temps reprend le focus un instant : si le focus est perdu, on le rend.
      const returnTo = back();
      setTimeout(() => { const a = document.activeElement; if (!a || a === document.body) (returnTo?.isConnected ? returnTo : back())?.focus?.({ preventScroll: true }); }, 400);
    };
  }, [opener]);

  // ── La carte est HORS des fenêtres de l'app (Radix) : un toucher ou un focus sur
  // elle ne doit ni fermer une fenêtre ouverte, ni rendre le focus à celle-ci.
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const stop = (e: Event) => e.stopPropagation();
    card.addEventListener('pointerdown', stop);
    card.addEventListener('focusin', stop);
    return () => { card.removeEventListener('pointerdown', stop); card.removeEventListener('focusin', stop); };
  }, []);

  // ── Échap ferme le guide (et lui seul : la fenêtre ouverte dessous reste).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      live.current.onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // ── Une étape : préparer l'écran, chercher la cible, l'entourer, la suivre.
  useEffect(() => {
    const sel = `[data-guide="${step.cible.replace(/["\\]/g, '')}"]`;
    const ring = ringRef.current, root = rootRef.current;
    if (!ring || !root) return;
    live.current.onStepEnter?.(step, index);

    const t0 = performance.now();
    let alive = true, raf = 0, burstUntil = 0, badSince = 0, scrolledFor: Element | null = null, coverScrolled: Element | null = null;
    let lastPlace = 0;
    let cur: Element | null = null, curLayer = 0, curZ = 0, ph: 'search' | 'ok' | 'missing' | 'covered' = 'search', where: 'bottom' | 'top' = 'bottom';
    const setPh = (p: typeof ph) => { if (p !== ph) { ph = p; setPhase(p); } };
    setPos('bottom');

    // Pas de focus perdu : si l'écran a changé et que le focus est tombé sur la page, la carte le reprend.
    const refocus = setTimeout(() => {
      const a = document.activeElement;
      if (alive && (!a || a === document.body)) cardRef.current?.focus({ preventScroll: true });
    }, 150);

    /**
     * Haut ou bas de l'écran ? Jamais sur la cible, et du côté où elle cache le moins de boutons
     * (une feuille de molette en bas, un bouton collé en bas…). Le bas reste le côté par défaut.
     */
    const place = (target: DOMRect | null) => {
      const now = performance.now();
      const card = cardRef.current;
      // On ne juge que sur une carte déjà dessinée à l'endroit qu'on croit (sinon on mesure l'ancien côté).
      if (!card || now - lastPlace < 300 || card.getAttribute('data-pos') !== where) return;
      lastPlace = now;
      const cb = card.getBoundingClientRect(), vh = window.innerHeight;
      const here = { x: cb.x, y: cb.y, w: cb.width, h: cb.height };
      const gap = where === 'bottom' ? vh - cb.bottom : cb.top;
      const there = { ...here, y: where === 'bottom' ? gap : vh - gap - cb.height };
      const onTarget = (r: typeof here) => !!target && r.x < target.right + 10 && target.left - 10 < r.x + r.w && r.y < target.bottom + 10 && target.top - 10 < r.y + r.h;
      const cost = (r: typeof here) => (onTarget(r) ? 1000 : 0) + touchables(r);
      const a = cost(here), b = cost(there);
      if (b + 3 <= a) { where = where === 'bottom' ? 'top' : 'bottom'; setPos(where); }
    };

    /** Centre la cible dans son défilement, au-dessus de la carte (une fois par cible). */
    const center = (el: Element, r: DOMRect) => {
      const sc = scrollerOf(el);
      if (!sc) return;
      const sr = sc.getBoundingClientRect();
      const bottom = Math.min(sr.bottom, window.innerHeight - (cardRef.current?.offsetHeight ?? 160) - 16);
      const top = Math.max(sr.top, 0);
      const delta = r.top + r.height / 2 - (top + bottom) / 2;
      sc.scrollTo({ top: sc.scrollTop + delta, behavior: reducedMotion() ? 'auto' : 'smooth' });
      burst();
    };

    const probe = () => {
      if (!alive || document.hidden) return;
      const all = Array.from(document.querySelectorAll(sel)).filter(shown);
      let el: Element | null = null, covered = false;
      for (const c of all) { if (reachable(c, c.getBoundingClientRect())) { el = c; break; } }
      if (!el && all.length) { el = all[0]; covered = true; }

      if (el !== cur) { cur = el; curLayer = el ? layerOf(el) + 1 : 0; }
      // Au-dessus de tout, sauf d'une boîte de confirmation (retirer, envoyer…) qui doit rester lisible et cliquable.
      const box = document.querySelector('[data-guide-confirm]');
      const z = box && !(cur && box.contains(cur)) ? Z_YIELD : Math.max(Z_TOP, curLayer);
      if (z !== curZ) { curZ = z; root.style.setProperty('--gt-z', String(z)); }
      const r = el ? el.getBoundingClientRect() : null;
      const vh = window.innerHeight, cardH = cardRef.current?.offsetHeight ?? 160;
      // Entièrement hors de l'écran (et rien à faire défiler) : comme introuvable, pas d'anneau collé au bord.
      const off = !!r && (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > window.innerWidth);
      if (el && r && scrolledFor !== el) {
        scrolledFor = el;
        // Hors de la zone libre (au-dessus de la carte) : on fait défiler pour le centrer.
        if (r.top < 8 || r.bottom > vh - cardH - 16) center(el, r);
      }
      // Caché par un bandeau fixe ou une fenêtre : un seul essai de défilement avant de le dire.
      if (el && r && covered && coverScrolled !== el) { coverScrolled = el; center(el, r); }

      if (el && r && !covered && !off) {
        badSince = 0;
        // L'anneau : la cible + PAD, gardé dans l'écran.
        const x = Math.max(r.left - PAD, 3), y = Math.max(r.top - PAD, 3);
        const w = Math.max(Math.min(r.right + PAD, window.innerWidth - 3) - x, 8), h = Math.max(Math.min(r.bottom + PAD, vh - 3) - y, 8);
        const rad = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 10;
        ring.style.transform = `translate3d(${x}px,${y}px,0)`;
        ring.style.width = `${w}px`; ring.style.height = `${h}px`;
        ring.style.borderRadius = `${Math.min(rad + PAD, w / 2, h / 2)}px`;
        place(r);
        setPh('ok');
      } else if (ph === 'ok' && performance.now() - (badSince ||= performance.now()) < GRACE_MS) {
        // un instant sans cible (animation) : l'anneau reste où il était
      } else if (performance.now() - t0 >= SEARCH_MS) {
        setPh(covered ? 'covered' : 'missing');
        place(null);
      } else if (ph !== 'search') setPh('search');
    };

    function burst() {
      burstUntil = performance.now() + BURST_MS;
      if (!raf) raf = requestAnimationFrame(loop);
    }
    function loop() {
      raf = 0;
      probe();
      if (performance.now() < burstUntil) raf = requestAnimationFrame(loop);
    }
    const kick = () => burst();

    // Le vrai bouton touché par le salarié : le guide avance (après son geste à lui, jamais avant).
    // Deux détecteurs, un seul pas : le clic sur la cible, et le toucher (appui + relâché sur la cible) pour
    // les boutons qui réagissent dès l'appui (le menu du compte se ferme sur lui-même : le clic n'arrive plus à la cible).
    let fired = false, downIn = false;
    const fire = () => { if (fired || !alive) return; fired = true; setTimeout(() => { if (alive) go(1); }, 0); };
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t?.closest || t.closest('[data-guide-ui]') || !t.closest(sel)) return;
      fire();
    };
    const inTarget = (x: number, y: number) => {
      if (ph !== 'ok' || !cur) return false;
      const r = cur.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    const onDown = (e: PointerEvent) => { downIn = !(e.target as Element | null)?.closest?.('[data-guide-ui]') && inTarget(e.clientX, e.clientY); };
    const onUp = (e: PointerEvent) => { if (downIn && inTarget(e.clientX, e.clientY)) fire(); downIn = false; };

    const vv = window.visualViewport;
    window.addEventListener('scroll', kick, { capture: true, passive: true });
    window.addEventListener('resize', kick);
    window.addEventListener('orientationchange', kick);
    vv?.addEventListener('resize', kick);
    vv?.addEventListener('scroll', kick);
    document.addEventListener('transitionend', kick, true);
    document.addEventListener('animationend', kick, true);
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointerup', onUp, true);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(kick);
    ro?.observe(document.body);
    const poll = setInterval(probe, POLL_MS);
    burst();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearInterval(poll);
      clearTimeout(refocus);
      ro?.disconnect();
      window.removeEventListener('scroll', kick, true);
      window.removeEventListener('resize', kick);
      window.removeEventListener('orientationchange', kick);
      vv?.removeEventListener('resize', kick);
      vv?.removeEventListener('scroll', kick);
      document.removeEventListener('transitionend', kick, true);
      document.removeEventListener('animationend', kick, true);
      document.removeEventListener('click', onDocClick, true);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointerup', onUp, true);
      setPh('search');
    };
  }, [index, step, go]); // eslint-disable-line react-hooks/exhaustive-deps

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div ref={rootRef} data-guide-ui data-testid="guide-root">
      <style dangerouslySetInnerHTML={CSS_HTML} />
      <div ref={ringRef} className="gt-ring" hidden={phase !== 'ok'} aria-hidden="true" data-testid="guide-ring" data-cible={step.cible} />
      <div ref={cardRef} className="gt-card" data-pos={pos} role="dialog" aria-modal="false" aria-label="Guide pas à pas" tabIndex={-1} data-testid="guide-card">
        <div className="gt-head">
          <span className="gt-count" data-testid="guide-count">Étape {index + 1} sur {steps.length}</span>
          <button type="button" className="gt-close" onClick={close} data-testid="guide-close"><X size={18} aria-hidden="true" /> Fermer</button>
        </div>
        <p className="gt-txt" aria-live="polite" aria-atomic="true" data-testid="guide-text" data-phase={phase}>
          <span className="gt-sr">Étape {index + 1} sur {steps.length}. </span>
          {phase === 'missing' && <span className="gt-miss" data-testid="guide-missing">Je ne vois pas ce bouton sur votre écran.</span>}
          {phase === 'covered' && <span className="gt-miss" data-testid="guide-covered">Ce bouton est caché par une fenêtre. Fermez-la pour le voir.</span>}
          {step.texte}
        </p>
        <div className="gt-nav">
          <button type="button" className="gt-btn ghost" onClick={() => go(-1)} disabled={index === 0} data-testid="guide-prev"><ChevronLeft size={18} aria-hidden="true" /> Précédent</button>
          <button type="button" className="gt-btn" onClick={() => go(1)} data-testid="guide-next">{index === last ? 'Terminer' : <>Suivant <ChevronRight size={18} aria-hidden="true" /></>}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
