'use client';

// Lot 5 « site rapide 1 » — fenêtres et écrans chargés à l'ouverture, pas au premier affichage.
//
// Pourquoi un helper maison plutôt que next/dynamic : next/dynamic rend un cycle vide
// (Suspense) au premier affichage, donc la fenêtre clignote, et il fait planter le rendu
// quand le fichier manque (hors ligne, ancien déploiement). Ici :
//  · rendu SYNCHRONE dès que le code est déjà là (le cas normal, grâce au préchauffage) ;
//  · jamais d'indicateur de chargement : une fenêtre n'apparaît que quand elle est prête ;
//  · si le fichier ne vient pas : un message, la fenêtre se referme, le clic suivant réessaie.
import { useEffect, useReducer, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { toast } from 'sonner';

export const LAZY_ERROR = 'Impossible de charger cette fenêtre. Vérifiez votre connexion ou rechargez la page.';

type Opts<P> = {
  /** La fenêtre est-elle voulue ? Ex. (p) => p.open ; fiche salarié : (p) => p.worker != null ; onglet : () => true. */
  isOpen: (p: P) => boolean;
  /** Appelé si le chargement échoue (défaut : p.onOpenChange?.(false)), pour que le prochain clic réessaie. */
  close?: (p: P) => void;
  /** Plus petit = préchauffé d'abord. */
  priority?: number;
  /** 'always' : inscrit dès la création du module ; 'mounted' : inscrit au montage du wrapper (fenêtres déjà conditionnées par aiOn / kioskOn / trainingsOn) ; 'never'. */
  warm?: 'always' | 'mounted' | 'never';
  /** 'open' : monté à la première ouverture, puis jamais démonté (garde saisies et animation de fermeture) ; 'warm' : monté dès que le code est arrivé, même fermé (assistants : mémoire de la conversation). */
  mount?: 'open' | 'warm';
  /** Seulement pour les onglets (rien à fermer) : affiché si le chargement échoue. */
  errorFallback?: ReactNode;
};

const registry = new Set<() => Promise<unknown>>();
const jobs: { load: () => Promise<unknown>; priority: number }[] = [];
let armed = false;
let running = false;

const slowLink = () => {
  const c = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (c.saveData === true || /(^|-)2g$/.test(c.effectiveType ?? ''));
};
// Safari/iOS n'a pas requestIdleCallback : repli sur un court délai.
const idle = (cb: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(cb, { timeout: 400 }) : window.setTimeout(cb, 200));

/** UN fichier à la fois, 100 ms entre deux, au repos du navigateur : le préchauffage ne gêne jamais l'écran. */
function pump() {
  if (running || !armed) return;
  running = true;
  const step = () => {
    const job = jobs.shift();
    if (!job) { running = false; return; }
    job.load().catch(() => {}).finally(() => window.setTimeout(() => idle(step), 100));
  };
  idle(step);
}

function register(load: () => Promise<unknown>, priority: number) {
  registry.add(load);
  if (slowLink()) return; // économie de données / 2g : pas de préchauffage automatique
  jobs.push({ load, priority });
  jobs.sort((a, b) => a.priority - b.priority);
  pump();
}

/**
 * Démarrage d'un guide pas à pas : tout charger TOUT DE SUITE (le guide ne cherche
 * sa cible que 1,5 s). Ignore l'économie de données : c'est un geste explicite.
 */
export function warmAll() {
  jobs.length = 0;
  registry.forEach((l) => { void l().catch(() => {}); });
}

export function lazyWindow<P extends object>(loader: () => Promise<{ default: ComponentType<P> }>, o: Opts<P>) {
  let Comp: ComponentType<P> | null = null;
  let pending: Promise<void> | null = null;
  // Une promesse rejetée n'est JAMAIS gardée : le clic suivant réessaie.
  const load = (): Promise<void> => (Comp ? Promise.resolve() : (pending ??= loader().then((m) => { Comp = m.default; }).catch((e) => { pending = null; throw e; })));
  const warm = o.warm ?? 'always';
  const priority = o.priority ?? 50;
  if (warm === 'always' && typeof window !== 'undefined') register(load, priority);

  function Wrapper(props: P) {
    // Montage collant : une fois voulue, la fenêtre n'est plus démontée.
    const wanted = useRef(o.mount === 'warm');
    const propsRef = useRef(props);
    propsRef.current = props;
    const [failed, setFailed] = useState(false);
    const [, rerender] = useReducer((n: number) => n + 1, 0);
    const open = o.isOpen(props);
    if (open) wanted.current = true;
    const need = wanted.current && !Comp;

    useEffect(() => {
      armed = true;
      if (warm === 'mounted') register(load, priority);
      pump();
    }, []);

    useEffect(() => {
      if (!need) return;
      let live = true;
      load().then(() => { if (live) rerender(); }).catch(() => {
        if (!live) return;
        setFailed(true);
        toast.error(LAZY_ERROR);
        (o.close ?? ((p: P) => (p as { onOpenChange?: (v: boolean) => void }).onOpenChange?.(false)))(propsRef.current);
        wanted.current = false;
      });
      return () => { live = false; };
    }, [need, open]);

    if (wanted.current && Comp) {
      const C = Comp;
      return <C {...props} />;
    }
    return <>{failed ? o.errorFallback ?? null : null}</>;
  }

  return Object.assign(Wrapper, { preload: () => { void load().catch(() => {}); } });
}
