'use client';

// Design du bureau (v2) · barre noire, barre de semaine, menus (Plus ⋯, compte) et tiroir Clients.
// Un seul accès par fonction (README du designer §1) : Formations et « Envoyer par e-mail » sont dans « Plus ⋯ » seulement, Réglages dans le menu du compte.
import { useState } from 'react';
import { addDays, format, getISOWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useDraggable } from '@dnd-kit/core';
import { Pencil, Printer } from 'lucide-react';
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

export function BarreNoire({ c }: { c: PlanningCtx }) {
  const { trial } = c;
  return (
    <header className="dzp-noire" data-testid="barre-noire">
      <div className="dzp-noire__g">
        <span className="dzp-logo">BEME<b>X</b>O</span>
        <nav className="dzp-onglets" aria-label="Pages du bureau">
          <span className="dzp-onglet" aria-current="page">Planning</span>
          <button type="button" className="dzp-onglet" onClick={() => c.setStatsOpen(true)} data-testid="stat-stats" title="Statistiques de l'équipe — lecture seule">Statistiques</button>
        </nav>
      </div>
      <div className="dzp-noire__d">
        {trial?.inTrial && !trial.expired && trial.daysLeft !== null && (
          <span className="dzp-essai">Essai · {trial.daysLeft} jour{trial.daysLeft > 1 ? 's' : ''}<button type="button" onClick={c.onSubscribe} data-guide="bureau-nav.abonner">S&apos;abonner</button></span>
        )}
        {trial?.inTrial && trial.expired && (
          <span className="dzp-essai" data-fini="">Essai terminé<button type="button" onClick={c.onSubscribe} data-guide="bureau-nav.abonner">S&apos;abonner</button></span>
        )}
        {c.aiOn && c.isAdmin && (
          <button type="button" className="dzp-assistant" onClick={() => c.setAssistantOpen(true)} title="Assistant BEMEXO" aria-label="Assistant BEMEXO" data-testid="bar-assistant" data-guide="bureau-nav.assistant">✦ Assistant</button>
        )}
        <div className="dzp-compte">
          <button type="button" className="dzp-compte__btn" onClick={() => c.setAccountMenuOpen(!c.accountMenuOpen)} aria-expanded={c.accountMenuOpen} title="Compte entreprise" data-guide="bureau-nav.compte">
            <span className="dzp-avatar">{c.companyLogo ? <img src={c.companyLogo} alt="" /> : c.companyInitials}</span>
            <span>{c.companyLabel}</span><span aria-hidden="true">▾</span>
          </button>
          {c.accountMenuOpen && (
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
          )}
        </div>
      </div>
    </header>
  );
}

function MenuPlus({ c, fermer }: { c: PlanningCtx; fermer: () => void }) {
  const go = (f: () => void) => () => { fermer(); f(); };
  return (
    <>
      <div className="dzp-fond-menu" onClick={fermer} />
      <div className="dzp-menu" data-testid="menu-plus" role="menu">
        <span className="dzp-menu__titre">Suivi</span>
        <div className="dzp-menu__groupe">
          <button type="button" role="menuitem" className="dzp-menu__item" onClick={go(() => c.setCostOpen(true))} data-testid="bar-cost" data-guide="bureau-nav.couts">Coût chantiers<i aria-hidden="true">›</i></button>
          {c.versionsOn && c.isAdmin && (
            <button type="button" role="menuitem" className="dzp-menu__item" onClick={go(() => c.setVersionsOpen(true))} data-testid="corner-versions" data-guide="bureau-nav.versions">Versions du planning<i aria-hidden="true">›</i></button>
          )}
          {c.tracesOn && (
            <button type="button" role="menuitem" className="dzp-menu__item" onClick={go(() => c.setTracesOpen(true))} data-testid="menu-traces">Interventions supprimées ou décalées<i aria-hidden="true">›</i></button>
          )}
        </div>
        {(c.trainingsOn || c.emailAllowed) && <span className="dzp-menu__titre">Équipe</span>}
        {(c.trainingsOn || c.emailAllowed) && (
          <div className="dzp-menu__groupe">
            {c.trainingsOn && (
              <button type="button" role="menuitem" className="dzp-menu__item" onClick={go(() => c.setTrainingsOpen(true))} onPointerEnter={c.preloadTrainings} onFocus={c.preloadTrainings} data-testid="menu-trainings">Formations<i aria-hidden="true">›</i></button>
            )}
            {c.emailAllowed && (
              <button type="button" role="menuitem" className="dzp-menu__item" onClick={go(() => c.setEmailOpen(true))} onPointerEnter={c.preloadEmail} onFocus={c.preloadEmail} data-testid="menu-email">Envoyer par e-mail<i aria-hidden="true">›</i></button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export function BarreSemaine({ c }: { c: PlanningCtx }) {
  const [plusOuvert, setPlusOuvert] = useState(false);
  const sem = getISOWeek(c.currentWeekStart);
  const kicker = c.isCurrentWeek ? 'Semaine actuelle' : c.currentWeekStart < c.thisWeekStart ? 'Semaine passée' : 'Semaine à venir';
  return (
    <div className="dzp-semaine" data-testid="barre-semaine">
      <div className="dzp-semaine__g" data-guide="bureau-semaine.nav">
        <div className="dzp-semaine__t">
          <span className="dzp-kicker">{kicker}</span>
          <div className="dzp-semaine__nb"><span className="dzp-semaine__s">S-{sem}</span><span className="dzp-semaine__p">{periodeSemaine(c.currentWeekStart)}</span></div>
        </div>
        <div className="dzp-fleches">
          <button type="button" className="dzp-rond" aria-label="Semaine précédente" onClick={() => c.changeWeek(addDays(c.currentWeekStart, -7))}>←</button>
          <button type="button" className="dzp-rond" aria-label="Semaine suivante" onClick={() => c.changeWeek(addDays(c.currentWeekStart, 7))}>→</button>
          <button type="button" className="dzp-pilule dzp-pilule--noire" onClick={() => c.changeWeek(c.thisWeekStart)} aria-disabled={c.isCurrentWeek} data-courante={c.isCurrentWeek ? '' : undefined}
            title={c.isCurrentWeek ? undefined : 'Revenir à la semaine actuelle'}>Aujourd&apos;hui</button>
        </div>
      </div>
      <div className="dzp-semaine__d">
        <div className="dzp-relatif">
          <button type="button" className="dzp-pilule" aria-expanded={c.chantierMenuOpen} onClick={() => { c.setChantierMenuOpen(!c.chantierMenuOpen); c.setClientsQuery(''); }} data-guide="bureau-nav.clients">Clients</button>
        </div>
        <button type="button" className={`dzp-pilule${c.pendingLeaves + c.pendingInvites > 0 ? ' dzp-pilule--badge' : ''}`} onClick={() => c.setSalariesOpen(true)} data-guide="bureau-nav.salaries">
          Salariés{c.pendingLeaves + c.pendingInvites > 0 && <span className="dzp-badge" title={`${c.pendingLeaves} demande(s) de congé, ${c.pendingInvites} invitation(s) en attente`}>{c.pendingLeaves + c.pendingInvites}</span>}
        </button>
        <button type="button" className={`dzp-pilule${c.openReserves > 0 ? ' dzp-pilule--badge' : ''}`} onClick={() => c.setReservesOpen(true)} title="Réserves de chantier à traiter" data-guide="bureau-nav.reserves">
          Réserves{c.openReserves > 0 && <span className="dzp-badge" data-ton="rouge">{c.openReserves}</span>}
        </button>
        <button type="button" className="dzp-pilule" aria-pressed={c.selectMode} data-testid="bar-select" data-guide="bureau-nav.selection"
          title={c.selectMode ? 'Terminer la sélection' : 'Cocher des interventions pour les supprimer'} onClick={() => (c.selectMode ? c.exitSelect() : c.enterSelect())}>Sélectionner</button>
        <span className="dzp-sep" aria-hidden="true" />
        <div className="dzp-relatif">
          <button type="button" className="dzp-rond dzp-rond--petit" onClick={() => (c.printOpen ? c.closePrintMenu() : c.setPrintOpen(true))} title="Imprimer le planning" aria-label="Imprimer le planning"
            aria-expanded={c.printOpen} data-testid="bar-print" disabled={c.displayWorkers.length === 0}><Printer className="h-4 w-4" aria-hidden /></button>
          {c.printMenu}
        </div>
        {c.kioskOn && c.user?.company_id && (
          <button type="button" className="dzp-pilule" onClick={() => c.setKioskOpen(true)} title="Tablette de pointage : code pour la relier, état" data-testid="bar-kiosk" data-guide="bureau-nav.borne">Borne</button>
        )}
        <div className="dzp-relatif">
          <button type="button" className="dzp-pilule" aria-expanded={plusOuvert} aria-haspopup="menu" onClick={() => setPlusOuvert((o) => !o)} data-testid="bar-plus">Plus ⋯</button>
          {plusOuvert && <MenuPlus c={c} fermer={() => setPlusOuvert(false)} />}
        </div>
        <button type="button" className="dzp-pilule dzp-pilule--jaune" onClick={() => c.setExportOpen(true)} data-testid="bar-export" data-guide="bureau-nav.exporter">↓ Exporter</button>
      </div>
    </div>
  );
}

/** Une ligne du tiroir : on l'attrape (glisser → crée une intervention). Mêmes identifiants que la ligne d'avant : `palette-new-<id>`. */
function LigneClient({ ws }: { ws: Worksite }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette-new-${ws.id}`, data: { type: 'new', worksiteId: ws.id } });
  const autre = ws.client_name === 'Autre';
  const sous = [autre ? 'Chantier non listé — le salarié le nomme' : [ws.product_type, ws.city].filter(Boolean).join(' · '), termineLe(ws, true)].filter(Boolean).join(' · ');
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={`dzp-client dzp-c${indexCouleur(ws.id, 'x')}`} data-glisse={isDragging ? '' : undefined} title="Glisser sur une case du planning">
      <span className="dzp-client__prise" aria-hidden="true"><i /><i /><i /></span>
      <span className="dzp-bulle__pastille" aria-hidden="true" />
      <span className="dzp-client__txt"><b>{ws.client_name}</b>{sous ? <span>{sous}</span> : null}</span>
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
        <span className="dzp-tiroir__aide">Glissez un client sur le planning ↘</span>
        <div className="dzp-tiroir__liste">
          {c.filteredClients.length === 0 ? <div className="dzp-tiroir__vide">Aucun client</div> : c.filteredClients.map((ws) => (
            <div key={ws.id} className="bt-pl-clientrow">
              <LigneClient ws={ws} />
              <button type="button" className="bt-pl-clientedit" title="Modifier la fiche" aria-label={`Modifier la fiche de ${ws.client_name}`} onClick={() => { c.setChantierMenuOpen(false); c.openClientFiche(ws); }} data-guide="bureau-clients.crayon"><Pencil className="h-3.5 w-3.5" aria-hidden /></button>
            </div>
          ))}
        </div>
        <button type="button" className="dzp-pilule dzp-pilule--jaune" onClick={() => { c.setChantierMenuOpen(false); c.setClientOpen(true); }} data-guide="bureau-clients.nouveau">+ Nouveau client</button>
        <button type="button" className="dzp-pilule" onClick={() => { c.setChantierMenuOpen(false); c.setImportOpen(true); }} data-guide="bureau-clients.importer">Importer (CSV/Excel)</button>
      </aside>
    </>
  );
}

