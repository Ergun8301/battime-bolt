'use client';

// Design du bureau (v2) · le menu ☰ du téléphone (planche 2b : « ☰ en haut à droite ») : le point d'entrée UNIQUE de tout ce que l'ordinateur montre dans sa barre
// et dans « Plus ⋯ » — semaine précédente / suivante, recherche, compteurs avec leur détail (les quatre tuiles du 1a), Clients, Salariés, Sélectionner, Exporter,
// Imprimer, Réserves, Pièces jointes, Coût chantiers, Borne, Demandes de congé, Statistiques, Formations, Envoyer par e-mail, Interventions supprimées,
// Légende, essai et S'abonner, Réglages, Déconnexion (« Versions du planning » n'est plus offert en v2). Mêmes propriétés et mêmes gestes que le menu d'avant
// (components/admin-mobile-menu.tsx) ; le contexte du planning arrive par le pont (pont-v2.ts), en lecture seule. Groupes et intitulés de « Plus ⋯ ».
// RÈGLE : chaque ligne FERME le menu avant d'ouvrir sa cible ; ce qui n'a pas d'écran à soi (chiffres, pièces jointes, légende) s'ouvre dans une petite
// feuille du bas, jamais déplié dans le menu ni en faisant défiler la page.
import { useState } from 'react';
import { addDays, format, getISOWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Search } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { AdminMobileMenuProps } from '@/components/admin-mobile-menu';
import { ListePieces, PanneauChiffres } from './bandeau-v2';
import { usePont } from './pont-v2';
import './bureau-jetons.css';
import './planning-v2.css';

const LEGENDE: { k: string; l: string }[] = [
  { k: 'matin', l: 'Matin (avant 12 h)' }, { k: 'apres-midi', l: 'Après-midi (12 h – 18 h)' }, { k: 'soir', l: 'Soir (après 18 h)' }, { k: 'journee', l: 'Journée entière ou sans horaire' },
  { k: 'prevue', l: 'Prévue (pointillés)' }, { k: 'a-envoyer', l: 'Saisie, à envoyer (ne compte pas)' }, { k: 'envoyee', l: 'Envoyée (compte)' }, { k: 'en-cours', l: 'En direct (pointage en cours)' },
  { k: 'ajoutee', l: 'Ajoutée par le salarié' }, { k: 'retiree', l: 'Retirée par le salarié (barrée)' }, { k: 'reunion', l: 'Réunion (hors heures)' },
  { k: 'absence', l: 'Absence (rayée)' }, { k: 'clos', l: 'Mois clôturé (CLOS)' }, { k: 'reserve', l: 'Réserve à traiter' },
];

function Rang({ onClick, children, ton, badge, testId, guide, disabled }: { onClick: () => void; children: string; ton?: 'danger'; badge?: number | string; testId?: string; guide?: string; disabled?: boolean }) {
  return (
    <button type="button" className="dzp-mm__item" data-ton={ton} onClick={onClick} data-testid={testId} data-guide={guide} disabled={disabled}>
      <span className="dzp-mm__txt">{children}</span>
      {badge ? <span className="dzp-mm__badge">{badge}</span> : null}
      <i aria-hidden="true">›</i>
    </button>
  );
}

type Feuille = 'chiffres' | 'pieces' | 'legende';
const TITRES: Record<Feuille, string> = { chiffres: 'Chiffres de la semaine', pieces: 'Pièces jointes', legende: 'Légende' };

export default function MenuMobileV2(p: AdminMobileMenuProps) {
  const { open, onOpenChange } = p;
  const pont = usePont();
  const c = pont?.c;
  // La petite feuille ouverte depuis le menu (le menu, lui, est déjà fermé).
  const [feuille, setFeuille] = useState<Feuille | null>(null);
  const go = (fn: () => void) => () => { onOpenChange(false); fn(); };
  const ouvrirFeuille = (f: Feuille) => () => { onOpenChange(false); if (f === 'pieces') c?.setStatPanel('docs'); setFeuille(f); };
  const fermerFeuille = () => { if (feuille === 'pieces' && c?.statPanel) c.setStatPanel(null); setFeuille(null); };
  const trial = p.trial;
  const sem = c ? getISOWeek(c.currentWeekStart) : null;
  const fin = c ? addDays(c.currentWeekStart, 6) : null;
  const dates = c && fin ? `${format(c.currentWeekStart, fin.getMonth() === c.currentWeekStart.getMonth() ? 'd' : 'd MMM', { locale: fr })}–${format(fin, 'd MMM', { locale: fr })}` : '';
  const compteurs = c ? [
    { n: c.cockpitStats.waiting, l: 'j à relancer', ton: 'relance', id: 'mm-stat-waiting' },
    { n: c.pendingLeaves, l: c.pendingLeaves > 1 ? 'congés' : 'congé', id: 'mm-compteur-conges' },
    { n: c.cockpitStats.docs, l: c.cockpitStats.docs > 1 ? 'pièces' : 'pièce', id: 'mm-compteur-pieces' },
    { n: c.openReserves, l: c.openReserves > 1 ? 'réserves' : 'réserve', id: 'mm-compteur-reserves' },
  ].filter((x) => x.n > 0) : [];
  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bt-skin dz-bureau dzp-mm" onCloseAutoFocus={(e) => { if (p.holdFocus?.()) e.preventDefault(); }}>
        <SheetHeader className="dzp-mm__tete">
          <SheetTitle className="dzp-mm__titre">Menu</SheetTitle>
          {p.companyLabel ? <span className="dzp-mm__co">{p.companyLabel}</span> : null}
        </SheetHeader>
        <nav className="dzp-mm__corps" aria-label="Menu du bureau">
          {trial?.inTrial && trial.daysLeft !== null && p.onSubscribe && (
            <div className="dzp-menu-essai" data-fini={trial.expired ? '' : undefined}>
              <span>{trial.expired ? 'Essai terminé' : `Essai · ${trial.daysLeft} jour${trial.daysLeft > 1 ? 's' : ''}`}</span>
              <button type="button" onClick={go(() => p.onSubscribe?.())} data-guide="bureau-nav.abonner">S&apos;abonner</button>
            </div>
          )}

          {c && (
            <div className="dzp-mm__semaine" role="group" aria-label="Semaine affichée" data-guide="bureau-semaine.nav" data-testid="mm-semaine">
              <button type="button" className="dzp-mm__fleche" aria-label="Semaine précédente" onClick={() => c.changeWeek(addDays(c.currentWeekStart, -7))}>←</button>
              <span className="dzp-mm__sem"><b>S-{sem}</b><span>{dates}</span></span>
              <button type="button" className="dzp-mm__fleche" aria-label="Semaine suivante" onClick={() => c.changeWeek(addDays(c.currentWeekStart, 7))}>→</button>
              {c.isCurrentWeek
                ? <span className="dzp-mm__actuelle">ACTUELLE</span>
                : <button type="button" className="dzp-mm__actuelle" data-retour="" onClick={() => c.changeWeek(c.thisWeekStart)}>AUJOURD&apos;HUI</button>}
            </div>
          )}

          {pont && (
            <label className="dzp-mm__recherche">
              <Search className="h-4 w-4" aria-hidden />
              <input type="search" value={pont.recherche} placeholder="Chercher un salarié, un client…" aria-label="Chercher un salarié, un client" data-testid="mm-recherche"
                onChange={(e) => pont.setRecherche(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onOpenChange(false); }} />
              {pont.recherche && <button type="button" className="dzp-loupe__x" aria-label="Effacer la recherche" onClick={() => pont.setRecherche('')}>✕</button>}
            </label>
          )}

          {c && pont && (
            <div className="dzp-mm__chiffres">
              <button type="button" className="dzp-mm__compteurs" onClick={ouvrirFeuille('chiffres')} data-testid="mm-chiffres" data-guide="bureau-stat.relance">
                <span className="dzp-mm__compteurs-t">Chiffres de la semaine</span>
                <span className="dzp-mm__compteurs-l">
                  {compteurs.length === 0 ? <span className="dzp-mm__compteur">rien à signaler</span> : compteurs.map((x) => (
                    <span key={x.id} className="dzp-mm__compteur" data-ton={x.ton} data-testid={x.id}><b>{x.n}</b> {x.l}</span>
                  ))}
                </span>
                <i aria-hidden="true">›</i>
              </button>
            </div>
          )}

          <span className="dzp-menu__titre">Planning</span>
          <div className="dzp-mm__groupe">
            <Rang onClick={go(p.onOpenChantiers)} guide="bureau-nav.clients" testId="mm-clients">Clients</Rang>
            <Rang onClick={go(p.onOpenSalaries)} guide="bureau-nav.salaries" badge={(p.pendingLeaves ?? 0) + (p.pendingInvites ?? 0)} testId="mm-salaries">Salariés</Rang>
            {p.onOpenSelect && <Rang onClick={go(p.onOpenSelect)} testId="mm-select" guide="bureau-nav.selection">Sélectionner des interventions</Rang>}
            <Rang onClick={go(p.onOpenExportTeam)} testId="mm-export" guide="bureau-nav.exporter">Exporter</Rang>
            {c && <Rang onClick={go(() => c.setPrintOpen(true))} testId="mm-print" disabled={c.displayWorkers.length === 0}>Imprimer</Rang>}
            {p.onOpenTraces && <Rang onClick={go(p.onOpenTraces)} testId="mm-traces">Interventions supprimées ou décalées</Rang>}
            <Rang onClick={ouvrirFeuille('legende')} testId="mm-legende">Légende</Rang>
          </div>

          <span className="dzp-menu__titre">Chantiers</span>
          <div className="dzp-mm__groupe">
            <Rang onClick={go(p.onOpenReserves)} guide="bureau-nav.reserves" badge={p.openReserves}>Réserves de chantier</Rang>
            {c && <Rang onClick={ouvrirFeuille('pieces')} testId="mm-pieces" badge={c.cockpitStats.docs}>Pièces jointes</Rang>}
            <Rang onClick={go(p.onOpenCost)} guide="bureau-nav.couts">Coût chantiers</Rang>
            {p.onOpenKiosk && <Rang onClick={go(p.onOpenKiosk)} testId="mm-kiosk" guide="bureau-nav.borne">Borne</Rang>}
          </div>

          <span className="dzp-menu__titre">Équipe</span>
          <div className="dzp-mm__groupe">
            <Rang onClick={go(p.onOpenLeaves)} badge={p.pendingLeaves}>Demandes de congé</Rang>
            {p.onOpenStats && <Rang onClick={go(p.onOpenStats)} testId="mm-stats">Statistiques</Rang>}
            {p.onOpenTrainings && <Rang onClick={go(p.onOpenTrainings)} testId="mm-trainings">Formations</Rang>}
            {p.onOpenEmail && <Rang onClick={go(p.onOpenEmail)} testId="mm-email">Envoyer par e-mail</Rang>}
          </div>

          <span className="dzp-menu__titre">Compte</span>
          <div className="dzp-mm__groupe">
            <Rang onClick={go(p.onOpenSettings)} guide="bureau-nav.reglages">Réglages de l&apos;entreprise</Rang>
            <Rang onClick={go(p.onSignOut)} ton="danger">Déconnexion</Rang>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
    <Sheet open={feuille !== null} onOpenChange={(o) => { if (!o) fermerFeuille(); }}>
      <SheetContent side="bottom" className="bt-skin dz-bureau dzp-mm dzp-mm--feuille" data-testid={feuille ? `mm-feuille-${feuille}` : undefined}>
        <SheetHeader className="dzp-mm__tete">
          <SheetTitle className="dzp-mm__titre">{feuille ? TITRES[feuille] : ''}</SheetTitle>
        </SheetHeader>
        <div className="dzp-mm__corps">
          {feuille === 'chiffres' && c && pont && <PanneauChiffres c={c} chiffres={pont.chiffres} fermer={fermerFeuille} />}
          {feuille === 'pieces' && c && <div className="dzp-mm__pieces"><ListePieces c={c} /></div>}
          {feuille === 'legende' && (
            <div className="dzp-mm__legende" data-testid="legende-mobile">
              {LEGENDE.map((x) => <span key={x.k} className="dzp-legende__i"><span className="dzp-pastille" data-k={x.k} />{x.l}</span>)}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
    </>
  );
}
