'use client';

// Design du bureau (v2, planche d'essai 2a) · la barre UNIQUE de 64 px, « Plus ⋯ », le menu du compte, la pastille du plein écran et le tiroir Clients.
// Un seul accès par fonction : tout ce qui n'est pas dans la barre est dans « Plus ⋯ » (Statistiques, Imprimer, Borne, Réserves, Pièces jointes, Formations,
// Coût chantiers, Interventions supprimées, Envoyer par e-mail, essai) ; Réglages et Déconnexion dans le menu de l'avatar. Chaque ligne d'un menu le FERME
// avant d'ouvrir sa cible, et aucune ne fait défiler la page (la légende s'ouvre par le petit bouton ⓘ de la barre ; « Versions du planning » n'est plus offert en v2).
import { useEffect, useRef, useState } from 'react';
import { addDays, format, getISOWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useDraggable } from '@dnd-kit/core';
import { Pencil, Search } from 'lucide-react';
import type { Worksite } from '@/lib/types';
import { termineLe } from '@/supabase/functions/_shared/chantier-statut';
import { indexCouleur } from './bulle-v2';
import type { PlanningCtx } from './contexte-v2';

/** « 12 – 18 octobre 2026 » ; sur deux mois : « 28 septembre – 4 octobre 2026 ». */
export function periodeSemaine(debut: Date): string {
  const fin = addDays(debut, 6);
  const memeMois = debut.getMonth() === fin.getMonth();
  return `${format(debut, memeMois ? 'd' : 'd MMMM', { locale: fr })} – ${format(fin, 'd MMMM yyyy', { locale: fr })}`;
}

/**
 * Pendant qu'un menu déroulant est ouvert (Plus ⋯, compte, chiffres), la page derrière ne défile plus : la molette au-dessus du menu ne fait pas défiler le
 * planning (le menu lui-même a `overscroll-behavior: contain`). La gouttière de la barre de défilement est gardée : rien ne bouge en ouvrant.
 */
export function useBloquePage(actif: boolean) {
  useEffect(() => {
    if (!actif) return;
    const h = document.documentElement;
    const avant = { o: h.style.overflow, g: h.style.scrollbarGutter, b: document.body.style.overflow };
    const garder = h.scrollHeight > h.clientHeight;
    // `clip` et non `hidden` sur le corps : `hidden` en ferait un conteneur de défilement et la barre collante (position: sticky) partirait avec la page, menu compris.
    h.style.overflow = 'hidden'; document.body.style.overflow = 'clip';
    if (garder) h.style.scrollbarGutter = 'stable';
    h.setAttribute('data-dz-page-bloquee', '');
    return () => { h.style.overflow = avant.o; h.style.scrollbarGutter = avant.g; document.body.style.overflow = avant.b; h.removeAttribute('data-dz-page-bloquee'); };
  }, [actif]);
}

/** Garde un menu déroulant entier dans l'écran (16 px de marge) : il est accroché sous son bouton, à droite ; on le décale s'il dépasse d'un côté. */
function useDansLEcran(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.translate = '';
    const r = el.getBoundingClientRect();
    const d = r.left < 16 ? 16 - r.left : r.right > window.innerWidth - 16 ? window.innerWidth - 16 - r.right : 0;
    if (d) el.style.translate = `${Math.round(d)}px 0`;
  }, [ref]);
}

/** Le menu du compte (avatar de la barre) : Réglages de l'entreprise et Déconnexion, comme au lot 1. */
function MenuCompte({ c }: { c: PlanningCtx }) {
  useBloquePage(!!c.accountMenuOpen);
  if (!c.accountMenuOpen) return null;
  return (
    <>
      <div className="dzp-fond-menu" onClick={() => c.setAccountMenuOpen(false)} />
      <div className="dzp-menu dzp-menu-compte" data-testid="menu-compte">
        <div className="dzp-menu-compte__tete">
          <div className="dzp-menu-compte__co">{c.companyLabel}</div>
          <div className="dzp-menu-compte__u">{c.user?.first_name} {c.user?.last_name}</div>
        </div>
        <div className="dzp-menu__groupe">
          <button type="button" className="dzp-menu__item" onClick={() => { c.setAccountMenuOpen(false); c.setSettingsOpen(true); }} data-guide="bureau-nav.reglages">Réglages de l&apos;entreprise</button>
          <button type="button" className="dzp-menu__item" data-ton="danger" onClick={() => { c.setAccountMenuOpen(false); c.signOut(); }}>Déconnexion</button>
        </div>
      </div>
    </>
  );
}

/**
 * « Plus ⋯ » (planche 2a : « Statistiques et les autres fonctions passent dans Plus ») : TOUT ce que les deux barres du lot 1 montraient et que la barre unique
 * ne garde pas, sans en perdre une. Groupes et intitulés de la planche (CHANTIERS, ÉQUIPE, PLANNING) ; une ligne est absente quand la fonction n'existe pas (migration, droits).
 */
function MenuPlus({ c, fermer, ordi = false }: { c: PlanningCtx; fermer: () => void; ordi?: boolean }) {
  const go = (f: () => void) => () => { fermer(); f(); };
  const { trial } = c;
  const ref = useRef<HTMLDivElement>(null);
  useBloquePage(true);
  useDansLEcran(ref);
  // Les rubriques (Chantiers, Équipe, Planning) côte à côte, lignes de 40 px : le menu tient entier à l'écran (1440 × 900, 1280 × 800, 1024 × 768), sans défilement.
  return (
    <>
      <div className="dzp-fond-menu" onClick={fermer} />
      <div className="dzp-menu dzp-menu-plus" data-testid="menu-plus" role="menu" ref={ref}>
        {trial?.inTrial && trial.daysLeft !== null && (
          <div className="dzp-menu-essai" data-fini={trial.expired ? '' : undefined}>
            <span>{trial.expired ? 'Essai terminé' : `Essai · ${trial.daysLeft} jour${trial.daysLeft > 1 ? 's' : ''}`}</span>
            <button type="button" onClick={go(() => c.onSubscribe?.())} data-guide="bureau-nav.abonner">S&apos;abonner</button>
          </div>
        )}
        {/* Tablette (768 à 1 023 px) : la barre n'a pas la place de Clients, Salariés et Sélectionner ; ils passent ici (cachés au-delà : ils sont dans la barre). */}
        <div className="dzp-menu__groupe dzp-menu__tablette">
          <button type="button" role="menuitem" className="dzp-menu__item" onClick={go(() => { c.setChantierMenuOpen(true); c.setClientsQuery(''); })} data-testid="menu-clients">Clients<i aria-hidden="true">›</i></button>
          <button type="button" role="menuitem" className="dzp-menu__item" onClick={go(() => c.setSalariesOpen(true))} data-testid="menu-salaries">Salariés{c.pendingLeaves + c.pendingInvites > 0 ? <small>{c.pendingLeaves + c.pendingInvites}</small> : <i aria-hidden="true">›</i>}</button>
          <button type="button" role="menuitem" className="dzp-menu__item" onClick={go(() => (c.selectMode ? c.exitSelect() : c.enterSelect()))} data-testid="menu-select">{c.selectMode ? 'Terminer la sélection' : 'Sélectionner'}<i aria-hidden="true">›</i></button>
        </div>
        <div className="dzp-menu__col">
        <span className="dzp-menu__titre">Chantiers</span>
        <div className="dzp-menu__groupe">
          <button type="button" role="menuitem" className="dzp-menu__item" onClick={go(() => c.setReservesOpen(true))} title="Réserves de chantier à traiter" data-guide="bureau-nav.reserves" data-testid="menu-reserves">Réserves{c.openReserves > 0 ? <small>{c.openReserves}</small> : <i aria-hidden="true">›</i>}</button>
          <button type="button" role="menuitem" className="dzp-menu__item" onClick={go(() => c.setStatPanel('docs'))} data-testid="stat-docs" title={`${c.cockpitStats.docs} pièce(s) jointe(s) — voir lesquelles, et sur quel chantier`}>Pièces jointes{c.cockpitStats.docs > 0 ? <small>{c.cockpitStats.docs}</small> : <i aria-hidden="true">›</i>}</button>
          <button type="button" role="menuitem" className="dzp-menu__item" onClick={go(() => c.setCostOpen(true))} data-testid="bar-cost" data-guide="bureau-nav.couts">Coût chantiers<i aria-hidden="true">›</i></button>
          {c.kioskOn && c.user?.company_id && (
            <button type="button" role="menuitem" className="dzp-menu__item" onClick={go(() => c.setKioskOpen(true))} title="Tablette de pointage : code pour la relier, état" data-testid="bar-kiosk" data-guide="bureau-nav.borne">Borne<i aria-hidden="true">›</i></button>
          )}
        </div>
        </div>
        <div className="dzp-menu__col">
        <span className="dzp-menu__titre">Équipe</span>
        <div className="dzp-menu__groupe">
          {/* Ordinateur (1a) : Statistiques est un onglet de la barre noire ; un seul accès. */}
          {!ordi && <button type="button" role="menuitem" className="dzp-menu__item" onClick={go(() => c.setStatsOpen(true))} data-testid="stat-stats" title="Statistiques de l'équipe — lecture seule">Statistiques<i aria-hidden="true">›</i></button>}
          {c.trainingsOn && (
            <button type="button" role="menuitem" className="dzp-menu__item" onClick={go(() => c.setTrainingsOpen(true))} onPointerEnter={c.preloadTrainings} onFocus={c.preloadTrainings} data-testid="menu-trainings">Formations<i aria-hidden="true">›</i></button>
          )}
          {c.emailAllowed && (
            <button type="button" role="menuitem" className="dzp-menu__item" onClick={go(() => c.setEmailOpen(true))} onPointerEnter={c.preloadEmail} onFocus={c.preloadEmail} data-testid="menu-email">Envoyer par e-mail<i aria-hidden="true">›</i></button>
          )}
        </div>
        </div>
        <div className="dzp-menu__col">
        <span className="dzp-menu__titre">Planning</span>
        <div className="dzp-menu__groupe">
          <button type="button" role="menuitem" className="dzp-menu__item" onClick={go(() => c.setPrintOpen(true))} data-testid="bar-print" disabled={c.displayWorkers.length === 0} title="Imprimer le planning">Imprimer<small>⌘P</small></button>
          {c.tracesOn && (
            <button type="button" role="menuitem" className="dzp-menu__item" onClick={go(() => c.setTracesOpen(true))} data-testid="menu-traces">Interventions supprimées ou décalées<i aria-hidden="true">›</i></button>
          )}
        </div>
        </div>
      </div>
    </>
  );
}

/** Pastille ronde de 38 px de la barre (✦, ⤢, loupe), comme sur la planche 2a. */
function Rond({ ton, className, ...reste }: React.ButtonHTMLAttributes<HTMLButtonElement> & { ton?: 'jaune' }) {
  return <button type="button" className={`dzp-b-rond${className ? ` ${className}` : ''}`} data-ton={ton} {...reste} />;
}

/** Les codes visuels de la grille (couleurs, pointillés, pastilles) : la liste de la petite fenêtre « ⓘ ». */
const LEGENDE: { k: string; l: string }[] = [
  { k: 'matin', l: 'Matin (avant 12 h)' }, { k: 'apres-midi', l: 'Après-midi (12 h – 18 h)' }, { k: 'soir', l: 'Soir (après 18 h)' }, { k: 'journee', l: 'Journée entière ou sans horaire' },
  { k: 'prevue', l: 'Prévue (pointillés)' }, { k: 'a-envoyer', l: 'Saisie, à envoyer (ne compte pas)' }, { k: 'envoyee', l: 'Envoyée (compte)' }, { k: 'en-cours', l: 'En direct (pointage en cours)' },
  { k: 'ajoutee', l: 'Ajoutée par le salarié' }, { k: 'retiree', l: 'Retirée par le salarié (barrée)' }, { k: 'reunion', l: 'Réunion (hors heures)' },
  { k: 'absence', l: 'Absence (rayée)' }, { k: 'clos', l: 'Mois clôturé (CLOS)' }, { k: 'reserve', l: 'Réserve à traiter' },
];

/**
 * La légende : un petit « ⓘ » dans la barre (jamais affichée en permanence). Il ouvre une petite fenêtre sous le bouton, comme les autres menus ; un clic ailleurs
 * ou Échap la ferme. Ordinateur : « Astuce : copier une case » est au bas de la fenêtre. Au téléphone, la légende est dans le menu ☰ (menu-mobile-v2.tsx).
 */
function BoutonLegende({ c, astuce = false }: { c: PlanningCtx; astuce?: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useBloquePage(ouvert);
  useDansLEcran(ref);
  useEffect(() => {
    if (!ouvert) return;
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [ouvert]);
  return (
    <div className="dzp-relatif">
      <Rond aria-label="Légende" title="Légende des couleurs" aria-expanded={ouvert} aria-haspopup="dialog" data-testid="bar-legende" data-guide="bureau-nav.legende" onClick={() => setOuvert((o) => !o)}>ⓘ</Rond>
      {ouvert && (
        <>
          <div className="dzp-fond-menu" onClick={() => setOuvert(false)} />
          <div className="dzp-menu dzp-menu-legende" role="dialog" aria-label="Légende" data-testid="legende" ref={ref}>
            <div className="dzp-menu__titre">Légende</div>
            <div className="dzp-menu-legende__liste">
              {LEGENDE.map((x) => <span key={x.k} className="dzp-legende__i"><span className="dzp-pastille" data-k={x.k} />{x.l}</span>)}
            </div>
            {astuce && c.workers.length > 0 ? <span className="dzp-legende__astuce" data-testid="legende-astuce">{c.copyTipHelpCorner}</span> : null}
          </div>
        </>
      )}
    </div>
  );
}

/** La loupe (seul ajout de mise en page autorisé) : au clic, elle s'ouvre en champ « Chercher un salarié, un client… » posé sur la barre ; le planning se filtre en direct. */
function Loupe({ q, setQ }: { q: string; setQ: (v: string) => void }) {
  const [ouvert, setOuvert] = useState(false);
  const champ = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ouvert) champ.current?.focus(); }, [ouvert]);
  return (
    <div className="dzp-relatif dzp-loupe" data-ouvert={ouvert ? '' : undefined}>
      <Rond aria-label="Chercher un salarié, un client" title={q ? `Recherche : « ${q} »` : 'Chercher un salarié, un client'} aria-expanded={ouvert} data-actif={q ? '' : undefined}
        onClick={() => setOuvert((o) => !o)} data-testid="bar-recherche"><Search className="h-4 w-4" aria-hidden /></Rond>
      {ouvert && (
        <div className="dzp-loupe__champ">
          <Search className="h-4 w-4" aria-hidden />
          <input ref={champ} type="search" value={q} placeholder="Chercher un salarié, un client…" aria-label="Chercher un salarié, un client" data-testid="recherche-champ"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); if (q) setQ(''); else setOuvert(false); } if (e.key === 'Enter') setOuvert(false); }}
            onBlur={() => setOuvert(false)} />
          {q && <button type="button" className="dzp-loupe__x" aria-label="Effacer la recherche" onMouseDown={(e) => e.preventDefault()} onClick={() => setQ('')}>✕</button>}
        </div>
      )}
    </div>
  );
}

/** Compteur de la barre (masqué à 0), un geste chacun, comme à l'ordinateur : « à relancer » ouvre (ou referme) le menu des chiffres sous la barre ;
 *  congés → Salariés, pièces → liste des pièces, réserves → Réserves (le menu des chiffres ne les montre pas). */
function Compteur({ n, unite, libelle, ton, c, testId, titre }: { n: number; unite?: string; libelle: string; ton?: 'relance'; c: PlanningCtx; testId: string; titre: string }) {
  if (n <= 0) return null;
  const ouvert = c.statPanel === 'waiting';
  const geste = testId === 'compteur-conges' ? () => c.setSalariesOpen(true) : testId === 'compteur-reserves' ? () => c.setReservesOpen(true)
    : testId === 'compteur-pieces' ? () => c.setStatPanel((p: string | null) => (p === 'docs' ? null : 'docs')) : () => c.setStatPanel((p: string | null) => (p === 'waiting' ? null : 'waiting'));
  return (
    <button type="button" className="dzp-compteur" data-ton={ton} data-ouvre-chiffres="" aria-expanded={ton === 'relance' ? ouvert : undefined} data-testid={testId} data-guide={ton === 'relance' ? 'bureau-stat.relance' : undefined} title={titre}
      onClick={geste}>
      {ton === 'relance' && <span className="dzp-compteur__point" aria-hidden="true" />}<b>{n}{unite ? ` ${unite}` : ''}</b><span className="dzp-compteur__l">{libelle}</span>
    </button>
  );
}

/**
 * LA BARRE UNIQUE de la planche 2a (64 px, noire), dans l'ordre exact : logo | ← S-42 12–18 oct. → ACTUELLE | compteurs | (espace) | loupe, Clients, Salariés,
 * Sélectionner, Plus ⋯, ↓ Exporter, ✦, ⤢, avatar. Mêmes gestionnaires que les deux barres du lot 1 (rien de neuf côté données).
 */
export function BarreUnique({ c, recherche, setRecherche, pleinEcran }: { c: PlanningCtx; recherche: string; setRecherche: (v: string) => void; pleinEcran: () => void }) {
  const [plusOuvert, setPlusOuvert] = useState(false);
  useEffect(() => {
    if (!plusOuvert) return;
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') setPlusOuvert(false); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [plusOuvert]);
  const sem = getISOWeek(c.currentWeekStart);
  const fin = addDays(c.currentWeekStart, 6);
  const memeMois = fin.getMonth() === c.currentWeekStart.getMonth();
  const dates = `${format(c.currentWeekStart, memeMois ? 'd' : 'd MMM', { locale: fr })}–${format(fin, 'd MMM', { locale: fr })}`;
  const conges = c.pendingLeaves;
  return (
    <header className="dzp-barre2a dz-sombre" data-testid="barre-noire">
      <span className="dzp-logo">BEME<b>X</b>O</span>
      <span className="dzp-b-sep" aria-hidden="true" />
      <div className="dzp-b-semaine" data-testid="barre-semaine" data-guide="bureau-semaine.nav">
        <button type="button" className="dzp-b-fleche" aria-label="Semaine précédente" onClick={() => c.changeWeek(addDays(c.currentWeekStart, -7))}>←</button>
        <span className="dzp-b-s" title={periodeSemaine(c.currentWeekStart)}>S-{sem}</span>
        <span className="dzp-b-dates">{dates}</span>
        <button type="button" className="dzp-b-fleche" aria-label="Semaine suivante" onClick={() => c.changeWeek(addDays(c.currentWeekStart, 7))}>→</button>
        {c.isCurrentWeek
          ? <span className="dzp-b-actuelle">ACTUELLE</span>
          : <button type="button" className="dzp-b-actuelle" data-retour="" onClick={() => c.changeWeek(c.thisWeekStart)} title="Revenir à la semaine actuelle">AUJOURD&apos;HUI</button>}
      </div>
      <span className="dzp-b-sep" aria-hidden="true" />
      <div className="dzp-b-compteurs">
        <Compteur c={c} n={c.cockpitStats.waiting} unite="j" libelle="à relancer" ton="relance" testId="stat-waiting"
          titre={`${c.cockpitStats.waiting} journée(s) planifiée(s) non envoyée(s) en ${c.monthLabel} — cliquer pour voir qui relancer`} />
        <Compteur c={c} n={conges} libelle={conges > 1 ? 'congés' : 'congé'} testId="compteur-conges" titre={`${conges} demande(s) de congé en attente — cliquer pour ouvrir « Salariés »`} />
        <Compteur c={c} n={c.cockpitStats.docs} libelle={c.cockpitStats.docs > 1 ? 'pièces' : 'pièce'} testId="compteur-pieces" titre={`${c.cockpitStats.docs} pièce(s) jointe(s) — cliquer pour voir lesquelles`} />
        <Compteur c={c} n={c.openReserves} libelle={c.openReserves > 1 ? 'réserves' : 'réserve'} testId="compteur-reserves" titre={`${c.openReserves} réserve(s) à traiter — cliquer pour ouvrir « Réserves »`} />
      </div>
      <span className="dzp-b-espace" />
      <div className="dzp-b-actions">
        <Loupe q={recherche} setQ={setRecherche} />
        <button type="button" className="dzp-b-pilule" data-tablette-cache="" aria-expanded={c.chantierMenuOpen} onClick={() => { c.setChantierMenuOpen(!c.chantierMenuOpen); c.setClientsQuery(''); }} data-guide="bureau-nav.clients">Clients</button>
        <button type="button" className="dzp-b-pilule" data-tablette-cache="" onClick={() => c.setSalariesOpen(true)} data-guide="bureau-nav.salaries"
          title={c.pendingLeaves + c.pendingInvites > 0 ? `${c.pendingLeaves} demande(s) de congé, ${c.pendingInvites} invitation(s) en attente` : undefined}>Salariés</button>
        <button type="button" className="dzp-b-pilule" data-tablette-cache="" aria-pressed={c.selectMode} data-testid="bar-select" data-guide="bureau-nav.selection"
          title={c.selectMode ? 'Terminer la sélection' : 'Cocher des interventions pour les supprimer'} onClick={() => (c.selectMode ? c.exitSelect() : c.enterSelect())}>Sélectionner</button>
        <div className="dzp-relatif">
          <button type="button" className="dzp-b-pilule" aria-expanded={plusOuvert} aria-haspopup="menu" onClick={() => setPlusOuvert((o) => !o)} data-testid="bar-plus" data-guide="bureau-nav.plus">Plus ⋯</button>
          {plusOuvert && <MenuPlus c={c} fermer={() => setPlusOuvert(false)} />}
          {c.printMenu}
        </div>
        <button type="button" className="dzp-b-pilule dzp-b-pilule--jaune" onClick={() => c.setExportOpen(true)} data-testid="bar-export" data-guide="bureau-nav.exporter">↓ Exporter</button>
        {c.aiOn && c.isAdmin && (
          <Rond ton="jaune" onClick={() => c.setAssistantOpen(true)} title="Assistant BEMEXO" aria-label="Assistant BEMEXO" data-testid="bar-assistant" data-guide="bureau-nav.assistant">✦</Rond>
        )}
        <BoutonLegende c={c} />
        <Rond onClick={pleinEcran} aria-label="Plein écran" title="Plein écran (F)" data-testid="bar-plein-ecran">⤢</Rond>
        <div className="dzp-relatif">
          {/* L'avatar de la planche (initiales ou logo) ; le nom de l'entreprise reste le nom accessible du bouton (texte masqué à l'écran, lu par les lecteurs d'écran). */}
          <button type="button" className="dzp-b-avatar dzp-compte__btn" onClick={() => c.setAccountMenuOpen(!c.accountMenuOpen)} aria-expanded={c.accountMenuOpen} title={c.companyLabel} data-guide="bureau-nav.compte" data-testid="bar-compte">
            <span className="dzp-b-avatar__i" aria-hidden="true">{c.companyLogo ? <img src={c.companyLogo} alt="" /> : c.companyInitials}</span>
            <span className="dzp-vh">{c.companyLabel}</span>
          </button>
          <MenuCompte c={c} />
        </div>
      </div>
    </header>
  );
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ORDINATEUR (1 024 px et plus) : planche d'essai, maquette 1a « Bureau · ordinateur 1440 » (cockpit allumé, envoyées sombres), retenue par Ergun.
 * Barre noire de 60 px (logo, onglets, compteurs, ✦ Assistant, compte) ; ligne de semaine (S-42, ← →, Aujourd'hui, recherche, Clients, Salariés, Sélectionner,
 * Plus ⋯, ↓ Exporter, ⤢). « Replier ▴ » masque la ligne de semaine ET le bandeau : la barre noire reprend alors, compacts (pilules de la barre 2a), la semaine,
 * la loupe, Exporter et « Déplier ▾ ». Mêmes gestionnaires que la barre unique 2a (rien de neuf côté données).
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Compteur de la barre noire du 1a (36 px, chiffre jaune en mono ; masqué à 0) : un clic ouvre le menu des chiffres sous la barre, comme dans la barre 2a. */
function Compteur1a({ n, unite, libelle, ton, c, testId, titre, signaler, ouvert }: { n: number; unite?: string; libelle: string; ton?: 'relance'; c: PlanningCtx; testId: string; titre: string; signaler?: (id: string) => void; ouvert?: boolean }) {
  if (n <= 0) return null;
  return (
    <button type="button" className="dzp-n-compteur" data-ton={ton} data-ouvre-chiffres="" aria-expanded={ton === 'relance' ? (ouvert ?? c.statPanel === 'waiting') : undefined} data-testid={testId}
      data-guide={ton === 'relance' ? 'bureau-stat.relance' : undefined} title={titre}
      onClick={() => (signaler ? signaler(testId) : c.setStatPanel((p: string | null) => (p === 'waiting' ? null : 'waiting')))}>
      {ton === 'relance' && <span className="dzp-n-compteur__point" aria-hidden="true" />}<b>{n}{unite ? ` ${unite}` : ''}</b><span className="dzp-n-compteur__l">{libelle}</span>
    </button>
  );
}

/** « 12–18 oct. » (sur deux mois : « 28 sept.–4 oct. »), comme la barre 2a. */
function datesCourtes(debut: Date) {
  const fin = addDays(debut, 6);
  const meme = fin.getMonth() === debut.getMonth();
  return `${format(debut, meme ? 'd' : 'd MMM', { locale: fr })}–${format(fin, 'd MMM', { locale: fr })}`;
}

export function BarreNoire1a({ c, replie, deplier, replier, recherche, setRecherche, signaler, relanceOuverte }: {
  c: PlanningCtx; replie: boolean; deplier: () => void; replier: () => void; recherche: string; setRecherche: (v: string) => void;
  /** Un compteur ouvre sa liste (haut déplié : la liste déroulante de la tuile « À relancer ») au lieu du panneau des tuiles par-dessus (voir PlanningV2). */
  signaler?: (id: string) => void;
  /** La liste « À relancer » est ouverte (liste déroulante ou panneau des tuiles) : `aria-expanded` du compteur. */
  relanceOuverte?: boolean;
}) {
  const conges = c.pendingLeaves;
  return (
    <header className="dzp-noire dz-sombre" data-testid="barre-noire" data-replie={replie ? '' : undefined}>
      <div className="dzp-noire__g">
        <span className="dzp-logo">BEME<b>X</b>O</span>
        <nav className="dzp-onglets" aria-label="Pages du bureau">
          <span className="dzp-onglet" aria-current="page">Planning</span>
          <button type="button" className="dzp-onglet" onClick={() => c.setStatsOpen(true)} data-testid="stat-stats" title="Statistiques de l'équipe — lecture seule">Statistiques</button>
        </nav>
        {replie && (
          <div className="dzp-b-semaine" data-testid="semaine-compacte" data-guide="bureau-semaine.nav">
            <button type="button" className="dzp-b-fleche" aria-label="Semaine précédente" onClick={() => c.changeWeek(addDays(c.currentWeekStart, -7))}>←</button>
            <span className="dzp-b-s" title={periodeSemaine(c.currentWeekStart)}>S-{getISOWeek(c.currentWeekStart)}</span>
            <span className="dzp-b-dates">{datesCourtes(c.currentWeekStart)}</span>
            <button type="button" className="dzp-b-fleche" aria-label="Semaine suivante" onClick={() => c.changeWeek(addDays(c.currentWeekStart, 7))}>→</button>
          </div>
        )}
      </div>
      <div className="dzp-noire__c" data-testid="compteurs">
        <Compteur1a c={c} signaler={signaler} ouvert={relanceOuverte} n={c.cockpitStats.waiting} unite="j" libelle="à relancer" ton="relance" testId="stat-waiting"
          titre={`${c.cockpitStats.waiting} journée(s) planifiée(s) non envoyée(s) en ${c.monthLabel} — cliquer pour voir qui relancer`} />
        <Compteur1a c={c} signaler={signaler} n={conges} libelle={conges > 1 ? 'congés en attente' : 'congé en attente'} testId="compteur-conges" titre={`${conges} demande(s) de congé en attente — cliquer pour ouvrir « Salariés »`} />
        <Compteur1a c={c} signaler={signaler} n={c.cockpitStats.docs} libelle={c.cockpitStats.docs > 1 ? 'pièces' : 'pièce'} testId="compteur-pieces" titre={`${c.cockpitStats.docs} pièce(s) jointe(s) — cliquer pour voir lesquelles`} />
        <Compteur1a c={c} signaler={signaler} n={c.openReserves} libelle="Réserves" testId="compteur-reserves" titre={`${c.openReserves} réserve(s) à traiter — cliquer pour ouvrir « Réserves »`} />
      </div>
      <div className="dzp-noire__d">
        {replie && (
          <>
            <Loupe q={recherche} setQ={setRecherche} />
            <button type="button" className="dzp-b-pilule dzp-b-pilule--jaune" onClick={() => c.setExportOpen(true)} data-testid="bar-export" data-guide="bureau-nav.exporter">↓ Exporter</button>
          </>
        )}
        <BoutonLegende c={c} astuce />
        {/* « Replier ▴ » / « Déplier ▾ » : toujours ici, juste avant « ✦ Assistant », même pilule dans les deux états. */}
        {replie
          ? <button type="button" className="dzp-b-pilule dzp-b-pilule--repli" onClick={deplier} aria-expanded={false} data-testid="haut-deplier" title="Afficher la ligne de semaine et les chiffres">Déplier ▾</button>
          : <button type="button" className="dzp-b-pilule dzp-b-pilule--repli" onClick={replier} aria-expanded={true} data-testid="haut-replier" title="Masquer la ligne de semaine et les chiffres (la barre noire garde la semaine, la recherche et Exporter)">Replier ▴</button>}
        {c.aiOn && c.isAdmin && (
          <button type="button" className="dzp-assistant" onClick={() => c.setAssistantOpen(true)} title="Assistant BEMEXO" aria-label="Assistant BEMEXO" data-testid="bar-assistant" data-guide="bureau-nav.assistant">✦<span className="dzp-assistant__l">{'\u00a0'}Assistant</span></button>
        )}
        <div className="dzp-compte">
          <button type="button" className="dzp-compte__btn" onClick={() => c.setAccountMenuOpen(!c.accountMenuOpen)} aria-expanded={c.accountMenuOpen} title="Compte entreprise" data-guide="bureau-nav.compte" data-testid="bar-compte">
            <span className="dzp-avatar">{c.companyLogo ? <img src={c.companyLogo} alt="" /> : c.companyInitials}</span>
            <span>{c.companyLabel}</span><span aria-hidden="true">▾</span>
          </button>
          <MenuCompte c={c} />
        </div>
      </div>
    </header>
  );
}

/**
 * La LIGNE DE SEMAINE du 1a, dans l'ordre exact de la planche : SEMAINE ACTUELLE / S-42 12 – 18 octobre 2026, ← →, Aujourd'hui, le champ « Chercher un salarié,
 * un chantier… », puis Clients, Salariés (pastille), Sélectionner, | , Plus ⋯ (pastille rouge des réserves), ↓ Exporter, ⤢. Ce que la planche ne montre pas ici
 * (Réserves, Borne, Imprimer, Coût chantiers…) est dans « Plus ⋯ ». « Replier ▴ » (à la place de « Replier les chiffres » de la planche) est dans la barre noire.
 */
export function LigneSemaine1a({ c, recherche, setRecherche, pleinEcran }: {
  c: PlanningCtx; recherche: string; setRecherche: (v: string) => void; pleinEcran: () => void;
}) {
  const [plusOuvert, setPlusOuvert] = useState(false);
  useEffect(() => {
    if (!plusOuvert) return;
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') setPlusOuvert(false); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [plusOuvert]);
  const sem = getISOWeek(c.currentWeekStart);
  const kicker = c.isCurrentWeek ? 'Semaine actuelle' : c.currentWeekStart < c.thisWeekStart ? 'Semaine passée' : 'Semaine à venir';
  const attente = c.pendingLeaves + c.pendingInvites;
  return (
    <div className="dzp-semaine" data-testid="barre-semaine">
      <div className="dzp-semaine__t" data-guide="bureau-semaine.nav">
        <span className="dzp-kicker">{kicker}</span>
        <div className="dzp-semaine__nb"><span className="dzp-semaine__s">S-{sem}</span><span className="dzp-semaine__p">{periodeSemaine(c.currentWeekStart)}</span></div>
      </div>
      <div className="dzp-fleches">
        <button type="button" className="dzp-rond" aria-label="Semaine précédente" onClick={() => c.changeWeek(addDays(c.currentWeekStart, -7))}>←</button>
        <button type="button" className="dzp-rond" aria-label="Semaine suivante" onClick={() => c.changeWeek(addDays(c.currentWeekStart, 7))}>→</button>
        <button type="button" className="dzp-pilule dzp-pilule--noire" onClick={() => c.changeWeek(c.thisWeekStart)} aria-disabled={c.isCurrentWeek} data-courante={c.isCurrentWeek ? '' : undefined}
          title={c.isCurrentWeek ? undefined : 'Revenir à la semaine actuelle'}>Aujourd&apos;hui</button>
      </div>
      <label className="dzp-recherche" data-actif={recherche ? '' : undefined}>
        <span className="dzp-recherche__i" aria-hidden="true">⌕</span>
        <input type="search" value={recherche} placeholder="Chercher un salarié, un chantier…" aria-label="Chercher un salarié, un chantier" data-testid="recherche-champ"
          onChange={(e) => setRecherche(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape' && recherche) { e.stopPropagation(); setRecherche(''); } }} />
        {recherche && <button type="button" className="dzp-loupe__x" aria-label="Effacer la recherche" onClick={() => setRecherche('')}>✕</button>}
      </label>
      <div className="dzp-semaine__d">
        <button type="button" className="dzp-pilule" aria-expanded={c.chantierMenuOpen} onClick={() => { c.setChantierMenuOpen(!c.chantierMenuOpen); c.setClientsQuery(''); }} data-guide="bureau-nav.clients">Clients</button>
        <button type="button" className={`dzp-pilule${attente > 0 ? ' dzp-pilule--badge' : ''}`} onClick={() => c.setSalariesOpen(true)} data-guide="bureau-nav.salaries">
          Salariés{attente > 0 && <span className="dzp-badge" title={`${c.pendingLeaves} demande(s) de congé, ${c.pendingInvites} invitation(s) en attente`}>{attente}</span>}
        </button>
        <button type="button" className="dzp-pilule" data-ordi-etroit-cache="" aria-pressed={c.selectMode} data-testid="bar-select" data-guide="bureau-nav.selection"
          title={c.selectMode ? 'Terminer la sélection' : 'Cocher des interventions pour les supprimer'} onClick={() => (c.selectMode ? c.exitSelect() : c.enterSelect())}>Sélectionner</button>
        <span className="dzp-sep" aria-hidden="true" />
        <div className="dzp-relatif">
          <button type="button" className="dzp-pilule" aria-expanded={plusOuvert} aria-haspopup="menu" onClick={() => setPlusOuvert((o) => !o)} data-testid="bar-plus" data-guide="bureau-nav.plus">
            Plus ⋯{c.openReserves > 0 && <span className="dzp-pastille-plus" title={`${c.openReserves} réserve(s) à traiter`}>{c.openReserves}</span>}
          </button>
          {plusOuvert && <MenuPlus c={c} fermer={() => setPlusOuvert(false)} ordi />}
          {c.printMenu}
        </div>
        <button type="button" className="dzp-pilule dzp-pilule--jaune" onClick={() => c.setExportOpen(true)} data-testid="bar-export" data-guide="bureau-nav.exporter">↓ Exporter</button>
        <button type="button" className="dzp-rond" onClick={pleinEcran} aria-label="Planning en plein écran" title="Plein écran (F)" data-testid="bar-plein-ecran">⤢</button>
      </div>
    </div>
  );
}

/**
 * Plein écran : un seul petit bouton rond de 40 px en haut à droite (icône « réduire », infobulle « Quitter le plein écran (Échap) »). Le changement de
 * semaine passe dans la case d'en-tête « SALARIÉ » de la grille (NavSemainePleinEcran) et aux flèches ← → du clavier. Ordinateur et tablette ; jamais au téléphone.
 */
export function SortiePleinEcran({ quitter }: { quitter: () => void }) {
  return (
    <button type="button" className="dzp-sortie-pe" onClick={quitter} aria-label="Quitter le plein écran (Échap)" title="Quitter le plein écran (Échap)" data-testid="quitter-plein-ecran">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
      </svg>
    </button>
  );
}

/** « ‹ S-42 › » : la navigation discrète de la case « SALARIÉ » en plein écran (flèches de 28 px, style des en-têtes). */
export function NavSemainePleinEcran({ c }: { c: PlanningCtx }) {
  return (
    <span className="dzp-pe-nav" role="group" aria-label="Semaine" data-testid="pe-semaine">
      <button type="button" aria-label="Semaine précédente" onClick={() => c.changeWeek(addDays(c.currentWeekStart, -7))}>‹</button>
      <span className="dzp-pe-nav__s" title={periodeSemaine(c.currentWeekStart)}>S-{getISOWeek(c.currentWeekStart)}</span>
      <button type="button" aria-label="Semaine suivante" onClick={() => c.changeWeek(addDays(c.currentWeekStart, 7))}>›</button>
    </span>
  );
}

/** Le texte affiché d'un client : le chantier « Autre » (son NOM EN BASE, comparé partout dans la logique et lu par l'assistant) s'affiche « Autre lieu / client ». */
const nomAffiche = (ws: Worksite) => (ws.client_name === 'Autre' ? 'Autre lieu / client' : ws.client_name);

/** Une ligne du tiroir : on l'attrape (glisser → crée une intervention). Mêmes identifiants que la ligne d'avant : `palette-new-<id>`. */
function LigneClient({ ws }: { ws: Worksite }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette-new-${ws.id}`, data: { type: 'new', worksiteId: ws.id } });
  const autre = ws.client_name === 'Autre';
  const sous = [autre ? 'Lieu non listé : le salarié le précise' : [ws.product_type, ws.city].filter(Boolean).join(' · '), termineLe(ws, true)].filter(Boolean).join(' · ');
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={`dzp-client dzp-c${indexCouleur(ws.id, 'x')}`} data-glisse={isDragging ? '' : undefined} title="Glisser sur une case du planning">
      <span className="dzp-client__prise" aria-hidden="true"><i /><i /><i /></span>
      <span className="dzp-bulle__pastille" aria-hidden="true" />
      <span className="dzp-client__txt"><b>{nomAffiche(ws)}</b>{sous ? <span>{sous}</span> : null}</span>
    </div>
  );
}

/** Tiroir « Clients » (380 px, à gauche) : on glisse un client sur le planning ; mêmes gestes que la liste d'avant. */
export function TiroirClients({ c }: { c: PlanningCtx }) {
  if (!c.chantierMenuOpen) return null;
  return (
    <>
      <div className="dzp-fond-menu" onClick={() => c.setChantierMenuOpen(false)} />
      <aside className="dzp-tiroir" aria-label="Clients" data-testid="tiroir-clients">
        <input className="dzp-tiroir__champ" placeholder="Rechercher un client…" aria-label="Rechercher un client" value={c.clientsQuery} onChange={(e) => c.setClientsQuery(e.target.value)} autoFocus />
        <span className="dzp-tiroir__lieux" data-testid="tiroir-aide-lieux">Ajoutez aussi vos lieux fixes : bureau, atelier, restaurant…</span>
        <span className="dzp-tiroir__aide">Glissez un client sur le planning ↘</span>
        <div className="dzp-tiroir__liste">
          {c.filteredClients.length === 0 ? <div className="dzp-tiroir__vide">Aucun client</div> : c.filteredClients.map((ws) => (
            <div key={ws.id} className="bt-pl-clientrow">
              <LigneClient ws={ws} />
              <button type="button" className="bt-pl-clientedit" title="Modifier la fiche" aria-label={`Modifier la fiche de ${nomAffiche(ws)}`} onClick={() => { c.setChantierMenuOpen(false); c.openClientFiche(ws); }} data-guide="bureau-clients.crayon"><Pencil className="h-3.5 w-3.5" aria-hidden /></button>
            </div>
          ))}
        </div>
        <button type="button" className="dzp-pilule dzp-pilule--jaune" onClick={() => { c.setChantierMenuOpen(false); c.setClientOpen(true); }} data-guide="bureau-clients.nouveau">+ Nouveau client ou lieu</button>
        <button type="button" className="dzp-pilule" onClick={() => { c.setChantierMenuOpen(false); c.setImportOpen(true); }} data-guide="bureau-clients.importer">Importer (CSV/Excel)</button>
      </aside>
    </>
  );
}

