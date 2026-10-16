'use client';

// Design salarié · étape 6 · la page « Mon compte » (E26 de la planche, qui l'appelait « Plus ») : le menu du compte, rendu en page, ouvert par l'avatar en haut à droite.
// Mêmes entrées, mêmes libellés et mêmes repères que l'ancien menu déroulant (role=menu / menuitem, data-guide, data-testid) ; ?ui=2 seulement.
// Aucune lecture, aucune règle : l'état et les gestes viennent de app/poseur/page.tsx, qui ne les a pas changés.
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { AlertTriangle, Bell, BellOff, Camera, GraduationCap, History, Info, Loader2, Palmtree, Users } from 'lucide-react';

/** Le petit rond jaune de chaque ligne (les mêmes icônes que l'ancien menu déroulant). */
const ICONES = { historique: History, reserves: AlertTriangle, formations: GraduationCap, conges: Palmtree, equipe: Users, photo: Camera, infos: Info, notifications: Bell, 'notifications-off': BellOff } as const;
export type IconeEntree = keyof typeof ICONES;

export type EntreePlus = {
  icone?: IconeEntree;
  id: string;
  label: string;
  onSelect: () => void;
  /** Repère de guide pas à pas (inchangé : ceux de l'ancien menu). */
  guide?: string;
  testid?: string;
  /** Compteur rouge (réserves à lever, formations à voir). */
  compteur?: number;
  compteurTestid?: string;
  /** Petite étiquette grise (rôle). */
  etiquette?: string;
  /** Ligne grisée (rien à lever) : reste dans la page, jamais cachée. */
  inactif?: boolean;
  /** Geste en cours (photo, notifications). */
  occupe?: boolean;
  /** Lien qui reste sur la page (photo, notifications) : pas de chevron de navigation. */
  surPlace?: boolean;
};

export function PagePlus({ heures, compte, onDeconnexion }: { heures: EntreePlus[]; compte: EntreePlus[]; onDeconnexion: () => void }) {
  const racine = useRef<HTMLDivElement>(null);
  // Flèches haut / bas : on passe d'une ligne à l'autre, comme dans l'ancien menu déroulant.
  const clavier = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    const lignes = Array.from(racine.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
    if (!lignes.length) return;
    e.preventDefault();
    const i = lignes.indexOf(document.activeElement as HTMLElement);
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? lignes.length - 1 : e.key === 'ArrowDown' ? (i + 1) % lignes.length : (i <= 0 ? lignes.length - 1 : i - 1);
    lignes[j].focus();
  };
  const ligne = (x: EntreePlus): ReactNode => (
    <button key={x.id} type="button" role="menuitem" className="dz-ligne-menu" {...(x.guide ? { 'data-guide': x.guide } : {})} data-testid={x.testid} data-nav={x.surPlace || x.occupe ? undefined : ''}
      aria-disabled={x.inactif || undefined} onClick={() => { if (!x.inactif) x.onSelect(); }}>
      {x.icone ? <span className="dz-ligne-menu__icone" aria-hidden="true">{(() => { const I = ICONES[x.icone]; return <I className="h-[18px] w-[18px]" />; })()}</span> : null}
      <span className="dz-ligne-menu__texte">{x.label}</span>
      {x.compteur ? <span className="dz-ligne-menu__compteur" data-testid={x.compteurTestid}>{x.compteur}</span> : null}
      {x.etiquette ? <span className="dz-ligne-menu__etiquette">{x.etiquette}</span> : null}
      {x.occupe ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
    </button>
  );
  return (
    <div ref={racine} className="dz-plus" role="menu" aria-label="Mon compte" data-testid="dz-plus" onKeyDown={clavier}>
      <p className="dz-plus__titre">MES HEURES</p>
      <div className="dz-plus__carte">{heures.map(ligne)}</div>
      <p className="dz-plus__titre">RÉGLAGES</p>
      <div className="dz-plus__carte">{compte.map(ligne)}</div>
      <button type="button" role="menuitem" className="dz-plus__sortie" onClick={onDeconnexion}>Déconnexion</button>
    </div>
  );
}
