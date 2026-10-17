'use client';

// Design du bureau (v2) : fenêtre / panneau / feuille RÉUTILISABLES (lots 1, 2 et 3). Contenu seulement : les états, les verrous et les appels
// restent dans les composants existants. Un `Dialog` Radix : titre obligatoire (nomme la fenêtre), Échap et clic sur le voile ferment,
// focus piégé et rendu dans <body> (portée `.dz-portail`, jetons de bureau-jetons.css).
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import './bureau-jetons.css';
import './fenetres-bureau.css';

export type FormeFenetre = 'centree' | 'panneau' | 'feuille';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `centree` (20 px de rayon), `panneau` (latéral 480 px, `large` : 760 px), `feuille` (du bas). Sous 1 024 px : toujours une feuille du bas. */
  forme?: FormeFenetre;
  large?: boolean;
  etroite?: boolean;
  /** Petit mot au-dessus du titre (majuscules). */
  kicker?: string;
  titre: ReactNode;
  testId?: string;
  /** Rangée de boutons fixe en bas (le bouton principal y reste visible). */
  pied?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function FenetreBureau({ open, onOpenChange, forme = 'centree', large, etroite, kicker, titre, testId, pied, children, className }: Props) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dz-voile-fenetre dz-portail" data-forme={forme} />
        <DialogPrimitive.Content
          className={`bt-skin dz-portail dz-fenetre${className ? ` ${className}` : ''}`}
          data-forme={forme} data-largeur={large ? 'large' : etroite ? 'etroite' : undefined} data-testid={testId}
          aria-describedby={undefined}
        >
          <div className="dz-fenetre__tete">
            <div className="dz-fenetre__titres">
              {kicker ? <span className="dz-fenetre__kicker">{kicker}</span> : null}
              <DialogPrimitive.Title className="dz-fenetre__titre">{titre}</DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close className="dz-fenetre__fermer" aria-label="Fermer"><X className="h-4 w-4" aria-hidden /></DialogPrimitive.Close>
          </div>
          <div className="dz-fenetre__corps">{children}</div>
          {pied ? <div className="dz-fenetre__pied">{pied}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Bouton de fenêtre (jetons) : `ton` = principal | sombre | destructif | destructif-doux ; sans ton : contour. */
export function BoutonBureau({ ton, children, ...rest }: { ton?: 'principal' | 'sombre' | 'destructif' | 'destructif-doux'; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className="dz-bouton-b" data-ton={ton} {...rest}>{children}</button>;
}
