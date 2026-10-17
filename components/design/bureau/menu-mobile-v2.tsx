'use client';

// Design du bureau (v2) · le menu ☰ du téléphone : le point d'entrée unique, avec les intitulés du cahier, plus « Légende ».
// Mêmes propriétés et mêmes gestes que le menu d'avant (components/admin-mobile-menu.tsx) ; seul l'habillage change.
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { AdminMobileMenuProps } from '@/components/admin-mobile-menu';
import './planning-v2.css';

const LEGENDE: { k: string; l: string }[] = [
  { k: 'matin', l: 'Matin (avant 12 h)' }, { k: 'apres-midi', l: 'Après-midi (12 h – 18 h)' }, { k: 'soir', l: 'Soir (après 18 h)' }, { k: 'journee', l: 'Journée entière ou sans horaire' },
  { k: 'prevue', l: 'Prévue (pointillés)' }, { k: 'a-envoyer', l: 'Saisie, à envoyer (ne compte pas)' }, { k: 'envoyee', l: 'Envoyée (compte)' }, { k: 'en-cours', l: 'En direct (pointage en cours)' },
  { k: 'ajoutee', l: 'Ajoutée par le salarié' }, { k: 'retiree', l: 'Retirée par le salarié (barrée)' }, { k: 'reunion', l: 'Réunion (hors heures)' },
];

function Rang({ onClick, children, ton, badge, testId, guide }: { onClick: () => void; children: string; ton?: 'danger'; badge?: number; testId?: string; guide?: string }) {
  return (
    <button type="button" className="dzp-mm__item" data-ton={ton} onClick={onClick} data-testid={testId} data-guide={guide}>
      <span>{children}</span>{badge ? <span className="dzp-badge" data-ton="rouge">{badge}</span> : null}
    </button>
  );
}

export default function MenuMobileV2(p: AdminMobileMenuProps) {
  const { open, onOpenChange, user, trial } = p;
  const [legende, setLegende] = useState(false);
  const go = (fn: () => void) => () => { onOpenChange(false); fn(); };
  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setLegende(false); }}>
      <SheetContent side="right" className="bt-skin dz-bureau dzp-mm" onCloseAutoFocus={(e) => { if (p.holdFocus?.()) e.preventDefault(); }}>
        <SheetHeader className="sr-only"><SheetTitle>Menu</SheetTitle></SheetHeader>
        <div className="dzp-mm__tete">
          <div className="dzp-mm__marque">
            <span className="dzp-avatar">{p.companyLogo ? <img src={p.companyLogo} alt="" /> : p.companyInitials}</span>
            <div><div className="dzp-mm__co">{p.companyLabel}</div><div className="dzp-mm__u">{user?.first_name} {user?.last_name}</div></div>
          </div>
          {trial?.inTrial && !trial.expired && trial.daysLeft !== null && (
            <div className="dzp-mm-essai">Essai · {trial.daysLeft} j restants<button type="button" onClick={go(() => p.onSubscribe?.())}>S&apos;abonner</button></div>
          )}
          {trial?.inTrial && trial.expired && (
            <div className="dzp-mm-essai">Essai terminé<button type="button" onClick={go(() => p.onSubscribe?.())}>S&apos;abonner</button></div>
          )}
        </div>
        <nav className="dzp-mm__corps" aria-label="Menu du bureau">
          <Rang onClick={go(p.onOpenSalaries)} guide="bureau-nav.salaries" badge={p.pendingLeaves}>Salariés</Rang>
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
          <button type="button" className="dzp-mm__item" aria-expanded={legende} onClick={() => setLegende((l) => !l)} data-testid="mm-legende"><span>Légende {legende ? '▴' : '▾'}</span></button>
          {legende && (
            <div className="dzp-mm__legende" data-testid="legende-mobile">
              {LEGENDE.map((x) => <span key={x.k} className="dzp-legende__i"><span className="dzp-pastille" data-k={x.k} />{x.l}</span>)}
            </div>
          )}
          <div className="dzp-mm__sep" />
          <Rang onClick={go(p.onSignOut)} ton="danger">Déconnexion</Rang>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
