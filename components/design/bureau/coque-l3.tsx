'use client';

// Design du bureau · lot 3, partie B (coûts, versions, historique, réglages, borne, abonnement, support) : la COQUE des fenêtres.
// Habillage seulement : le contenu, les états, les verrous et les appels restent dans les composants existants (cost-report, planning-versions-dialog,
// traces-dialog, company-settings, kiosk-admin, kiosk-pair-confirm, support-access, app/admin/page.tsx), qui passent ici leurs enfants tels quels.
// Chargée en différé, seulement quand `useBureauUi2()` est vrai : rien de ce fichier ni de sa feuille n'entre dans le premier chargement de /admin.
// La forme et les classes sont celles de fenetre-bureau.tsx (lots 1 et 2 : `dz-voile-fenetre`, `dz-fenetre`, `dz-bouton-b`, mêmes règles reprises dans
// lot3b-v2.css). Ce fichier n'importe PAS fenetre-bureau.tsx : partagé entre le planning, le lot 2 et ce lot, ce module et sa feuille seraient découpés
// en morceaux de plus, chargés par le chargeur commun de TOUTES les pages (budget de poids). Sous 1 024 px, le panneau devient une page plein écran
// (planche XM05, XM06, XM08, XM13, XM14) et la fenêtre centrée une feuille du bas.
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import './bureau-jetons.css';
import './lot3b-v2.css';

export type FormeL3 = 'centree' | 'panneau' | 'feuille';

export interface FenetreL3Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  forme?: FormeL3;
  large?: boolean;
  etroite?: boolean;
  kicker?: string;
  titre: ReactNode;
  testId?: string;
  pied?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Même fenêtre que FenetreBureau (fenetre-bureau.tsx) : titre obligatoire, Échap et clic sur le voile ferment, focus piégé, rendu dans <body>. */
export function FenetreL3({ open, onOpenChange, forme = 'centree', large, etroite, kicker, titre, testId, pied, children, className }: FenetreL3Props) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dz-voile-fenetre dz-portail" data-forme={forme} />
        <DialogPrimitive.Content
          className={`bt-skin dz-portail dz-fenetre dz-l3${className ? ` ${className}` : ''}`}
          data-forme={forme} data-largeur={large ? 'large' : etroite ? 'etroite' : undefined} data-testid={testId}
          aria-describedby={undefined}
        >
          <div className="dz-fenetre__tete">
            <div className="dz-fenetre__titres">
              {kicker ? <span className="dz-fenetre__kicker">{kicker}</span> : null}
              <DialogPrimitive.Title className="dz-fenetre__titre">{titre}</DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close className="dz-fenetre__fermer" aria-label="Fermer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </DialogPrimitive.Close>
          </div>
          <div className="dz-fenetre__corps">{children}</div>
          {pied ? <div className="dz-fenetre__pied">{pied}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Bouton de fenêtre (même classe que BoutonBureau) : `ton` = principal | sombre | destructif | destructif-doux ; sans ton : contour. */
export function BoutonL3({ ton, children, ...rest }: { ton?: 'principal' | 'sombre' | 'destructif' | 'destructif-doux'; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className="dz-bouton-b" data-ton={ton} {...rest}>{children}</button>;
}

export interface CoqueL3Props extends Omit<FenetreL3Props, 'className'> {
  /** Classe de portée de l'écran (ex. `dz-l3-reglages`) : la feuille lot3b-v2.css habille les classes existantes sous cette portée. */
  portee?: string;
}

export default function CoqueL3({ forme = 'panneau', portee, children, ...rest }: CoqueL3Props) {
  return <FenetreL3 forme={forme} className={portee} {...rest}>{children}</FenetreL3>;
}
