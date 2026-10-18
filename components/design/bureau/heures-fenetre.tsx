'use client';

// Design bureau · lot 2 : les coques des fenêtres « Heures et paie » (panneau latéral, fenêtre centrée, alerte).
// Contenu SEULEMENT : aucune logique, aucune requête. Les fenêtres v2 (feuille d'heures, export, clôture, congés) les remplissent avec les
// états et les gestes de l'interface actuelle, qui ne change pas.
//
// Rôles : `dialog` pour le panneau et la fenêtre, `alertdialog` pour les questions qui engagent (verrou, clôture) : README §4.
import './bureau-jetons.css';
import './heures-v2.css';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as AlertPrimitive from '@radix-ui/react-alert-dialog';
import { useSyncExternalStore, type ReactNode } from 'react';

interface Commun {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kicker?: ReactNode;
  titre: ReactNode;
  sous?: ReactNode;
  testId?: string;
  children?: ReactNode;
  /** Pied fixe (boutons). */
  pied?: ReactNode;
  /** Boutons en colonne (alertes, téléphone). */
  pile?: boolean;
  pileTel?: boolean;
  /** Sous le titre, avant le corps qui défile (onglets). */
  sousTete?: ReactNode;
  onEscapeKeyDown?: (e: KeyboardEvent) => void;
  onInteractOutside?: (e: Event) => void;
  onCloseAutoFocus?: (e: Event) => void;
  onOpenAutoFocus?: (e: Event) => void;
  /** Nom accessible du ✕ (défaut « Fermer »). */
  fermer?: string;
}

function Fermer({ nom }: { nom: string }) {
  return (
    <>
      <span className="dz-hb-croix" aria-hidden="true">✕</span>
      <span className="dz-hb-retour" aria-hidden="true">‹</span>
      <span className="sr-only">{nom}</span>
    </>
  );
}

function Tete({ kicker, titre, sous, Titre, Fermeture, nom }: {
  kicker?: ReactNode; titre: ReactNode; sous?: ReactNode;
  Titre: typeof DialogPrimitive.Title; Fermeture: ReactNode; nom: string;
}) {
  void nom;
  return (
    <header className="dz-hb-tete">
      {kicker ? <p className="dz-hb-kicker">{kicker}</p> : null}
      <Titre className="dz-hb-titre">{titre}</Titre>
      {sous ? <p className="dz-hb-sous">{sous}</p> : null}
      {Fermeture}
    </header>
  );
}

/** Panneau latéral (480 px ; 760 px si `large`), page plein écran sous 1 024 px. `niveau` 2 = ouvert SUR un autre panneau. */
export function PanneauB({ open, onOpenChange, kicker, titre, sous, large, niveau, testId, children, pied, pile, pileTel, sousTete, fermer = 'Fermer',
  onEscapeKeyDown, onInteractOutside, onCloseAutoFocus, onOpenAutoFocus }: Commun & { large?: boolean; niveau?: 1 | 2 }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dz-portail dz-hb-voile" />
        <DialogPrimitive.Content
          className="bt-skin dz-portail dz-hb-panneau"
          data-large={large ? 'oui' : undefined}
          data-niveau={niveau === 2 ? '2' : undefined}
          data-testid={testId}
          aria-describedby={undefined}
          onEscapeKeyDown={onEscapeKeyDown}
          onInteractOutside={onInteractOutside}
          onCloseAutoFocus={onCloseAutoFocus}
          onOpenAutoFocus={onOpenAutoFocus}
        >
          <Tete kicker={kicker} titre={titre} sous={sous} Titre={DialogPrimitive.Title} nom={fermer}
            Fermeture={<DialogPrimitive.Close className="dz-hb-fermer"><Fermer nom={fermer} /></DialogPrimitive.Close>} />
          {sousTete}
          <div className="dz-hb-corps">{children}</div>
          {pied ? <div className="dz-hb-pied" data-pile={pile ? 'oui' : undefined} data-pile-tel={pileTel ? 'oui' : undefined}>{pied}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Fenêtre centrée (20 px de rayon). `feuille` : feuille du bas sous 1 024 px (correction, renvoi). `alerte` : rôle alertdialog (question qui engage). */
export function FenetreB({ open, onOpenChange, kicker, titre, sous, testId, children, pied, pile, pileTel, feuille, alerte, etroite, fermer = 'Fermer',
  onEscapeKeyDown, onInteractOutside, onCloseAutoFocus, onOpenAutoFocus }: Commun & { feuille?: boolean; alerte?: boolean; etroite?: boolean }) {
  const P = alerte ? AlertPrimitive : DialogPrimitive;
  const Titre = P.Title as unknown as typeof DialogPrimitive.Title;
  const Ferme = alerte
    ? <AlertPrimitive.Cancel className="dz-hb-fermer" data-testid={testId ? `${testId}-fermer` : undefined}><Fermer nom={fermer} /></AlertPrimitive.Cancel>
    : <DialogPrimitive.Close className="dz-hb-fermer"><Fermer nom={fermer} /></DialogPrimitive.Close>;
  return (
    <P.Root open={open} onOpenChange={onOpenChange}>
      <P.Portal>
        {/* Une question (alertdialog) : un clic à côté vaut « Annuler », comme Échap (rien ne part) ; pas pendant un envoi en cours. */}
        <P.Overlay className="dz-portail dz-hb-voile" data-ton="fenetre" onClick={alerte ? () => { if (!document.querySelector('[role=alertdialog] .animate-spin')) onOpenChange(false); } : undefined} />
        <P.Content
          className="bt-skin dz-portail dz-hb-fenetre"
          data-tel={feuille ? 'feuille' : undefined}
          data-largeur={etroite ? 'etroite' : undefined}
          data-testid={testId}
          aria-describedby={undefined}
          onEscapeKeyDown={onEscapeKeyDown}
          onCloseAutoFocus={onCloseAutoFocus}
          onOpenAutoFocus={onOpenAutoFocus}
          {...(alerte ? {} : { onInteractOutside })}
        >
          <Tete kicker={kicker} titre={titre} sous={sous} Titre={Titre} Fermeture={Ferme} nom={fermer} />
          <div className="dz-hb-corps">{children}</div>
          {pied ? <div className="dz-hb-pied" data-pile={pile ? 'oui' : undefined} data-pile-tel={pileTel ? 'oui' : undefined}>{pied}</div> : null}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

/** « 28:15 » : minutes → h:mm (chiffres de la planche). */
export function hmm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Vrai sous 1 024 px (téléphone et tablette en portrait : disposition « téléphone » de la planche). Lu côté navigateur seulement (ces fenêtres ne sont
 * montées qu'après une action) : une seule disposition est dans la page à la fois, jamais deux (pas de contenu en double pour les lecteurs d'écran).
 */
export function useTelephone(): boolean {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia('(max-width: 1023px)'); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia('(max-width: 1023px)').matches,
    () => false,
  );
}
