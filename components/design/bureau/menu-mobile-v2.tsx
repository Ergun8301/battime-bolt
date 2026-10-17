'use client';

// Design du bureau (v2) · le menu ☰ du téléphone : le point d'entrée unique, avec les intitulés du cahier, plus « Légende » (feuille du bas de la planche, PM03 / PM04).
// Mêmes propriétés et mêmes gestes que le menu d'avant (components/admin-mobile-menu.tsx) ; seul l'habillage change. Le nom de l'entreprise, l'essai et « S'abonner »
// sont dans l'en-tête noir du planning (une seule place) ; le badge de « Salariés » = congés + invitations, celui de « Réserves de chantier » = les réserves à traiter.
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { AdminMobileMenuProps } from '@/components/admin-mobile-menu';
import './bureau-jetons.css';
import './planning-v2.css';

const LEGENDE: { k: string; l: string }[] = [
  { k: 'matin', l: 'Matin (avant 12 h)' }, { k: 'apres-midi', l: 'Après-midi (12 h – 18 h)' }, { k: 'soir', l: 'Soir (après 18 h)' }, { k: 'journee', l: 'Journée entière ou sans horaire' },
  { k: 'prevue', l: 'Prévue (pointillés)' }, { k: 'a-envoyer', l: 'Saisie, à envoyer (ne compte pas)' }, { k: 'envoyee', l: 'Envoyée (compte)' }, { k: 'en-cours', l: 'En direct (pointage en cours)' },
  { k: 'ajoutee', l: 'Ajoutée par le salarié' }, { k: 'retiree', l: 'Retirée par le salarié (barrée)' }, { k: 'reunion', l: 'Réunion (hors heures)' },
  { k: 'absence', l: 'Absence (rayée)' }, { k: 'clos', l: 'Mois clôturé (CLOS)' }, { k: 'reserve', l: 'Réserve à traiter' },
];

function Rang({ onClick, children, ton, badge, testId, guide, ouvert }: { onClick: () => void; children: string; ton?: 'danger'; badge?: number; testId?: string; guide?: string; ouvert?: boolean }) {
  return (
    <button type="button" className="dzp-mm__item" data-ton={ton} onClick={onClick} data-testid={testId} data-guide={guide} aria-expanded={ouvert}>
      <span className="dzp-mm__txt">{children}</span>
      {badge ? <span className="dzp-mm__badge">{badge}</span> : null}
      <i aria-hidden="true">{ouvert === undefined ? '›' : ouvert ? '▴' : '▾'}</i>
    </button>
  );
}

export default function MenuMobileV2(p: AdminMobileMenuProps) {
  const { open, onOpenChange } = p;
  const [legende, setLegende] = useState(false);
  const go = (fn: () => void) => () => { onOpenChange(false); fn(); };
  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setLegende(false); }}>
      <SheetContent side="bottom" className="bt-skin dz-bureau dzp-mm" onCloseAutoFocus={(e) => { if (p.holdFocus?.()) e.preventDefault(); }}>
        <SheetHeader className="dzp-mm__tete"><SheetTitle className="dzp-mm__titre">Menu</SheetTitle></SheetHeader>
        <nav className="dzp-mm__corps" aria-label="Menu du bureau">
          <div className="dzp-mm__groupe">
            <Rang onClick={go(p.onOpenSalaries)} guide="bureau-nav.salaries" badge={(p.pendingLeaves ?? 0) + (p.pendingInvites ?? 0)}>Salariés</Rang>
            <Rang onClick={go(p.onOpenChantiers)} guide="bureau-nav.clients">Chantiers</Rang>
            <Rang onClick={go(p.onOpenLeaves)} badge={p.pendingLeaves}>Demandes de congé</Rang>
            {p.onOpenTrainings && <Rang onClick={go(p.onOpenTrainings)} testId="mm-trainings">Formations</Rang>}
            <Rang onClick={go(p.onOpenReserves)} guide="bureau-nav.reserves" badge={p.openReserves}>Réserves de chantier</Rang>
            {p.onOpenKiosk && <Rang onClick={go(p.onOpenKiosk)} testId="mm-kiosk" guide="bureau-nav.borne">Borne</Rang>}
            <Rang onClick={go(p.onOpenCost)} guide="bureau-nav.couts">Coût chantiers</Rang>
            {p.onOpenStats && <Rang onClick={go(p.onOpenStats)} testId="mm-stats">Statistiques</Rang>}
            <Rang onClick={go(p.onOpenExportTeam)} testId="mm-export" guide="bureau-nav.exporter">Exporter</Rang>
            {p.onOpenEmail && <Rang onClick={go(p.onOpenEmail)} testId="mm-email">Envoyer par e-mail</Rang>}
            {p.onOpenSelect && <Rang onClick={go(p.onOpenSelect)} testId="mm-select" guide="bureau-nav.selection">Sélectionner des interventions</Rang>}
            <Rang onClick={go(p.onOpenSettings)} guide="bureau-nav.reglages">Réglages de l&apos;entreprise</Rang>
            {p.onOpenVersions && <Rang onClick={go(p.onOpenVersions)} testId="mm-versions" guide="bureau-nav.versions">Versions du planning</Rang>}
            {p.onOpenTraces && <Rang onClick={go(p.onOpenTraces)} testId="mm-traces">Interventions supprimées ou décalées</Rang>}
            <Rang onClick={() => setLegende((l) => !l)} testId="mm-legende" ouvert={legende}>Légende</Rang>
          </div>
          {legende && (
            <div className="dzp-mm__legende" data-testid="legende-mobile">
              {LEGENDE.map((x) => <span key={x.k} className="dzp-legende__i"><span className="dzp-pastille" data-k={x.k} />{x.l}</span>)}
            </div>
          )}
          <div className="dzp-mm__groupe">
            <Rang onClick={go(p.onSignOut)} ton="danger">Déconnexion</Rang>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
