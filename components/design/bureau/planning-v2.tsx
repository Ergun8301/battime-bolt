'use client';

// Design du bureau (v2b « Couleur ») · LE PLANNING. Chargé À LA DEMANDE par admin-planning.tsx quand le drapeau `?ui=2` est actif (jamais dans le premier chargement).
// Ce morceau ne lit rien et n'écrit rien : il reçoit de l'écran existant ses états et ses gestionnaires (contexte-v2.ts) et dessine la planche v2b
// (docs/design-brief/designer-planning-v2/ : README, SPEC-v2b.md, tokens.css bloc `.dz-planning-v2b`).
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ActionDone } from '@/components/action-done';
import { totauxSemaine } from '@/supabase/functions/_shared/bureau-vue';
import './bureau-jetons.css';
import './planning-v2.css';
import { BarreNoire, BarreSemaine, TiroirClients } from './barres-v2';
import { Bandeau, useDeplie } from './bandeau-v2';
import { Grille } from './grille-v2';
import { Mobile } from './mobile-v2';
import { LEGENDE } from './menu-mobile-v2';
import type { PlanningCtx } from './contexte-v2';

export { default as MenuMobileV2 } from './menu-mobile-v2';
export { Ghost } from './bulle-v2';
export { default as FicheV2 } from './fiche-v2';

function Legende() {
  const [ouverte, setOuverte] = useState(false);
  return (
    <div className="dzp-legende-zone">
      <button type="button" className="dzp-legende-bouton" aria-expanded={ouverte} onClick={() => setOuverte((o) => !o)} data-testid="legende-ouvrir">Légende {ouverte ? '▴' : '▾'}</button>
      {ouverte && (
        <div className="dzp-legende" data-open="" data-testid="legende">
          {LEGENDE.map((x) => <span key={x.k} className="dzp-legende__i"><span className="dzp-pastille" data-k={x.k} />{x.l}</span>)}
        </div>
      )}
    </div>
  );
}

function Aide({ c }: { c: PlanningCtx }) {
  const vide = c.workers.length === 0 || c.worksites.length === 0;
  if (c.coachHidden || c.selectMode || !vide) return null;
  return (
    <div className="dzp-aide" data-testid="aide-demarrage">
      <button type="button" className="dzp-aide__x" onClick={c.dismissCoach} aria-label="Fermer le guide" title="Fermer">✕</button>
      <span className="dzp-aide__k">Pour démarrer</span>
      <h3 className="dzp-aide__t">Deux étapes, et tout roule.</h3>
      <button type="button" className="dzp-aide__etape" data-fait={c.workers.length > 0 ? '' : undefined} onClick={() => { if (c.workers.length === 0) c.setWorkerOpen(true); }}>
        <span className="dzp-aide__n">{c.workers.length > 0 ? '✓' : '1'}</span><span><b>Ajoutez un salarié</b><br /><small>Il reçoit une invitation par email</small></span>
      </button>
      <button type="button" className="dzp-aide__etape" data-fait={c.worksites.length > 0 ? '' : undefined} onClick={() => { if (c.worksites.length === 0) c.setClientOpen(true); }}>
        <span className="dzp-aide__n">{c.worksites.length > 0 ? '✓' : '2'}</span><span><b>Créez un client</b><br /><small>Puis glissez-le sur le planning</small></span>
      </button>
    </div>
  );
}

function Dock({ c }: { c: PlanningCtx }) {
  if (!c.selectMode && !c.undoCard) return null;
  const n = c.selIds.length;
  const idsSemaine: string[] = c.selectMode ? c.selectableIn((p: { user_id: string }) => c.displayWorkers.some((w) => w.id === p.user_id)) : [];
  const jour = format(c.weekDays[c.mobileDayIdx], 'yyyy-MM-dd');
  const idsJour: string[] = c.selectMode ? c.selectableIn((p: { work_date: string; user_id: string }) => p.work_date === jour && c.workers.some((w) => w.id === p.user_id)) : [];
  const tout = (ids: string[]) => ids.length > 0 && ids.every((id) => c.selOn.has(id));
  return (
    <div className="dzp-dock">
      {c.undoCard && (
        <div className="dzp-undo" data-testid="undo-card" key={c.undoCard.key}>
          <ActionDone message={c.undoCard.message} strongUndo={c.undoCard.strong} undo={c.undoCard.undo as never} />
          <button type="button" className="dzp-undo__x" aria-label="Fermer" title="Fermer" data-testid="undo-close" onClick={() => c.setUndoCard(null)}>✕</button>
        </div>
      )}
      {c.selectMode && (
        <div className="dzp-selbar" role="toolbar" aria-label="Sélection" data-testid="sel-bar">
          <span className="dzp-selbar__n" data-testid="sel-count">{n} sélectionnée{n > 1 ? 's' : ''}</span>
          <button type="button" data-semaine="" data-testid="sel-all" data-guide="bureau-selection.tout" onClick={() => c.toggleGroup(idsSemaine)}>{tout(idsSemaine) ? 'Tout désélectionner' : 'Tout sélectionner'}</button>
          <button type="button" data-jour="" data-testid="sel-all-day" data-guide="bureau-selection.tout" onClick={() => c.toggleGroup(idsJour)}>{tout(idsJour) ? 'Tout désélectionner' : 'Tout sélectionner'}</button>
          <button type="button" className="dzp-selbar__sup" data-testid="sel-delete" data-guide="bureau-selection.supprimer" disabled={n === 0 || c.eraseBusy} onClick={() => c.deleteSelected()}>
            {c.eraseBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />} Supprimer ({n})
          </button>
          <button type="button" className="dzp-selbar__ok" data-testid="sel-done" onClick={c.exitSelect}>Terminer</button>
        </div>
      )}
    </div>
  );
}

export default function PlanningV2({ c }: { c: PlanningCtx }) {
  // Le drapeau posé sur <html> habille aussi les fenêtres Radix (rendues dans <body>) : voir la fin de planning-v2.css.
  useEffect(() => {
    document.documentElement.setAttribute('data-dz-bureau', '');
    return () => document.documentElement.removeAttribute('data-dz-bureau');
  }, []);
  // Échap ferme les menus, le tiroir Clients et les panneaux de chiffres (les fenêtres, elles, se ferment toutes seules : Radix).
  const { accountMenuOpen, chantierMenuOpen, statPanel, setAccountMenuOpen, setChantierMenuOpen, setStatPanel } = c;
  useEffect(() => {
    if (!accountMenuOpen && !chantierMenuOpen && !statPanel) return;
    const f = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; setAccountMenuOpen(false); setChantierMenuOpen(false); setStatPanel(null); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [accountMenuOpen, chantierMenuOpen, statPanel, setAccountMenuOpen, setChantierMenuOpen, setStatPanel]);
  const [deplie, poserDeplie] = useDeplie(c.user?.id);
  const dates = c.weekDays.map((d) => format(d, 'yyyy-MM-dd'));
  const totaux = useMemo(() => {
    const exclure = new Set<string>();
    for (const p of c.planning) if (c.realForPlanning(p) || c.draftForPlanning(p) || c.withdrawnIds.has(p.id)) exclure.add(p.id);
    return totauxSemaine(dates, c.displayWorkers.map((w) => w.id), c.realEntries, c.planning, exclure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates.join('|'), c.displayWorkers, c.realEntries, c.planning, c.draftEntries, c.withdrawnIds]);
  const relances = (c.waitingByWorker as { id: string; name: string; days: string[] }[]) || [];
  return (
    <div className="dz-planning-v2b">
      <div className="dzp-bureau-desk">
        <BarreNoire c={c} />
        <BarreSemaine c={c} envoyees={totaux.envoyees} prevues={totaux.aVenir} ouvrirChiffres={() => poserDeplie(!deplie)} />
        <Bandeau c={c} chiffres={{ envoyees: totaux.envoyees, aVenir: totaux.aVenir, jours: totaux.jours, relances }} deplie={deplie} poser={poserDeplie} />
        <TiroirClients c={c} />
        <div className="dzp-zone">
          <Aide c={c} />
          <Grille c={c} totaux={totaux} />
          {/* L'astuce « Copier une case » ne recouvre plus la grille : sous la grille, à gauche, tant qu'on ne l'a pas fermée (« ? » dans le coin pour la revoir). */}
          <div className="dzp-pied">
            {c.workers.length > 0 && !c.selectMode && <div className="dzp-astuce">{c.copyTipDesk}</div>}
            <Legende />
          </div>
        </div>
      </div>
      <Mobile c={c} />
      <Dock c={c} />
    </div>
  );
}
