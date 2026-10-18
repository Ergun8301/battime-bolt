'use client';

// Design du bureau (v2) · LE PLANNING. Ordinateur (1 024 px et plus) : maquette 1a de la planche d'essai (barre noire, ligne de semaine, bandeau de chiffres, grille du
// lot 1), avec « Replier ▴ » et le plein écran ; tablette (768 à 1 023 px) : barre unique et grille compacte 2a ; téléphone : planche 2b.
// Chargé À LA DEMANDE par admin-planning.tsx quand le drapeau `?ui=2` est actif (jamais dans le premier chargement).
// Ce morceau ne lit rien et n'écrit rien : il reçoit de l'écran existant ses états et ses gestionnaires (contexte-v2.ts) et dessine la planche du designer.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ActionDone } from '@/components/action-done';
import { totauxSemaine } from '@/supabase/functions/_shared/bureau-vue';
import './bureau-jetons.css';
import './planning-v2.css';
import { BarreNoire1a, BarreUnique, LigneSemaine1a, PastillePleinEcran, TiroirClients } from './barres-v2';
import { ListePieces, PanneauChiffres } from './bandeau-v2';
import { chargeJours, Grille } from './grille-v2';
import { Grille1a } from './grille-1a';
import { Mobile } from './mobile-v2';
import { publierPont, useLargeur, REQ_ORDI, REQ_TELEPHONE } from './pont-v2';
import type { PlanningCtx } from './contexte-v2';

export { default as MenuMobileV2 } from './menu-mobile-v2';
export { Ghost } from './bulle-v2';
export { default as FicheV2 } from './fiche-v2';

const LEGENDE: { k: string; l: string }[] = [
  { k: 'matin', l: 'Matin (avant 12 h)' }, { k: 'apres-midi', l: 'Après-midi (12 h – 18 h)' }, { k: 'soir', l: 'Soir (après 18 h)' }, { k: 'journee', l: 'Journée entière ou sans horaire' },
  { k: 'prevue', l: 'Prévue (pointillés)' }, { k: 'a-envoyer', l: 'Saisie, à envoyer (ne compte pas)' }, { k: 'envoyee', l: 'Envoyée (compte)' }, { k: 'en-cours', l: 'En direct (pointage en cours)' },
  { k: 'ajoutee', l: 'Ajoutée par le salarié' }, { k: 'retiree', l: 'Retirée par le salarié (barrée)' }, { k: 'reunion', l: 'Réunion (hors heures)' },
  { k: 'absence', l: 'Absence (rayée)' }, { k: 'clos', l: 'Mois clôturé (CLOS)' }, { k: 'reserve', l: 'Réserve à traiter' },
];

/** La légende : la planche 2a ne la dessine pas au-dessus du planning ; elle s'ouvre depuis « Plus ⋯ » › Légende, sous la grille (Échap ou « LÉGENDE ▴ » la referme). */
function Legende({ ouverte, fermer, toujours = false }: { ouverte: boolean; fermer: () => void; toujours?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ouverte) ref.current?.scrollIntoView({ block: 'nearest' }); }, [ouverte]);
  return (
    <div className="dzp-legende" ref={ref} data-open={ouverte || toujours ? '' : undefined} data-toujours={toujours ? '' : undefined} data-testid="legende">
      {toujours ? <span className="dzp-legende__t">LÉGENDE</span> : <button type="button" className="dzp-legende__t" onClick={fermer} aria-expanded={true}>LÉGENDE ▴</button>}
      {LEGENDE.map((x) => <span key={x.k} className="dzp-legende__i"><span className="dzp-pastille" data-k={x.k} />{x.l}</span>)}
    </div>
  );
}

function Aide({ c }: { c: PlanningCtx }) {
  const vide = c.workers.length === 0 || c.worksites.length === 0;
  if (c.coachHidden || c.selectMode || !vide) return null;
  return (
    <div className="dzp-aide" data-testid="aide-demarrage">
      <button type="button" className="dzp-aide__x" onClick={c.dismissCoach} aria-label="Fermer le guide" title="Fermer">✕</button>
      <span className="dzp-kicker">Pour démarrer</span>
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

const CLE_HAUT = 'bt-bureau-haut-replie';
/** « Replier ▴ » (ordinateur) : le choix est gardé par utilisateur dans ce navigateur, comme l'était le repli des chiffres du lot 1 (localStorage, jamais bloquant). */
function useHautReplie(userId: string | undefined): [boolean, (v: boolean) => void] {
  const [replie, setReplie] = useState(false);
  useEffect(() => {
    try { setReplie(window.localStorage.getItem(`${CLE_HAUT}:${userId || ''}`) === '1'); } catch { /* stockage indisponible : déplié */ }
  }, [userId]);
  const poser = (v: boolean) => {
    setReplie(v);
    try { if (v) window.localStorage.setItem(`${CLE_HAUT}:${userId || ''}`, '1'); else window.localStorage.removeItem(`${CLE_HAUT}:${userId || ''}`); } catch { /* ignoré */ }
  };
  return [replie, poser];
}

/** Une frappe dans un champ de saisie (la touche F n'y passe jamais en plein écran). */
const dansUnChamp = (t: EventTarget | null) => {
  const e = t as HTMLElement | null;
  return !!e && (e.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName) || !!e.closest('[role="dialog"],[role="alertdialog"],[role="menu"]'));
};

/** Recherche : même règle que les listes « Clients » et « Salariés » d'aujourd'hui (minuscules, « contient ») ; un salarié reste si son nom OU un chantier de sa semaine correspond. */
function filtrer(c: PlanningCtx, q: string, dates: string[], liste = c.displayWorkers) {
  const t = q.trim().toLowerCase();
  if (!t) return liste;
  return liste.filter((w) => `${w.first_name} ${w.last_name}`.toLowerCase().includes(t)
    || c.planning.some((p) => p.user_id === w.id && dates.includes(p.work_date) && (p.worksite?.client_name || '').toLowerCase().includes(t)));
}

export default function PlanningV2({ c }: { c: PlanningCtx }) {
  // Le drapeau posé sur <html> habille aussi les fenêtres Radix (rendues dans <body>) : voir la fin de planning-v2.css.
  useEffect(() => {
    document.documentElement.setAttribute('data-dz-bureau', '');
    return () => document.documentElement.removeAttribute('data-dz-bureau');
  }, []);
  const [pleinEcran, setPleinEcran] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [legende, setLegende] = useState(false);
  const ordi = useLargeur(REQ_ORDI);
  const [replie, poserReplie] = useHautReplie(c.user?.id);
  // Échap ferme les menus, le tiroir Clients, le menu des chiffres, la légende, puis le plein écran (les fenêtres, elles, se ferment toutes seules : Radix).
  const { accountMenuOpen, chantierMenuOpen, statPanel, setAccountMenuOpen, setChantierMenuOpen, setStatPanel } = c;
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (accountMenuOpen || chantierMenuOpen || statPanel) { setAccountMenuOpen(false); setChantierMenuOpen(false); setStatPanel(null); return; }
        if (legende) { setLegende(false); return; }
        if (pleinEcran && !document.querySelector('[role="dialog"],[role="alertdialog"]')) setPleinEcran(false);
        return;
      }
      // Planche 2a : « Plein écran : touche ⤢ ou F ». Jamais pendant une saisie, jamais avec une touche de commande, jamais sous une fenêtre ouverte.
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey && !dansUnChamp(e.target) && !document.querySelector('[role="dialog"],[role="alertdialog"]')) {
        e.preventDefault(); setPleinEcran((v) => !v);
      }
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [accountMenuOpen, chantierMenuOpen, statPanel, legende, pleinEcran, setAccountMenuOpen, setChantierMenuOpen, setStatPanel]);
  const dates = c.weekDays.map((d) => format(d, 'yyyy-MM-dd'));
  const totaux = useMemo(() => {
    const exclure = new Set<string>();
    for (const p of c.planning) if (c.realForPlanning(p) || c.draftForPlanning(p) || c.withdrawnIds.has(p.id)) exclure.add(p.id);
    return totauxSemaine(dates, c.displayWorkers.map((w) => w.id), c.realEntries, c.planning, exclure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates.join('|'), c.displayWorkers, c.realEntries, c.planning, c.draftEntries, c.withdrawnIds]);
  const relances = (c.waitingByWorker as { id: string; name: string; days: string[] }[]) || [];
  // La grille ne montre que les salariés retenus par la recherche (affichage seulement : la sélection « toute la semaine » garde toute l'équipe).
  const visibles = useMemo(() => filtrer(c, recherche, dates),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c.displayWorkers, c.planning, recherche, dates.join('|')]);
  const cGrille = visibles === c.displayWorkers ? c : { ...c, displayWorkers: visibles };
  // Téléphone (planche 2b) : la même recherche (elle se tape dans le menu ☰) filtre les cartes et la mosaïque ; la liste du téléphone reste `workers` (comme avant).
  const telephone = useLargeur(REQ_TELEPHONE);
  const gens = useMemo(() => filtrer(c, recherche, dates, c.workers),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c.workers, c.planning, recherche, dates.join('|')]);
  const nbRecherche = recherche.trim() ? `${gens.length} salarié${gens.length > 1 ? 's' : ''} pour « ${recherche.trim()} »` : '';
  const chiffres = { envoyees: totaux.envoyees, aVenir: totaux.aVenir, charge: chargeJours(c, dates, totaux), relances };
  // Le menu ☰ (rendu par admin-planning.tsx) reçoit le même contexte, en lecture seule, pour offrir au téléphone tout ce que la barre et « Plus ⋯ » offrent.
  // Après CHAQUE rendu (pas de liste : le contexte change à chaque rendu de l'écran) ; rien n'est appelé ici, setRecherche est seulement prêté au menu.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { publierPont({ c, recherche, setRecherche, chiffres, legende: () => setLegende(true) }); });
  useEffect(() => () => publierPont(null), []);
  return (
    <>
      <div className="dzp-bureau-desk" data-plein-ecran={pleinEcran ? '' : undefined} data-mise={ordi ? '1a' : '2a'} data-replie={ordi && replie ? '' : undefined}>
        {pleinEcran
          ? <PastillePleinEcran c={c} quitter={() => setPleinEcran(false)} ordi={ordi} />
          : ordi ? (
            <>
              <div className="dzp-haut dzp-haut--1a">
                <BarreNoire1a c={c} replie={replie} deplier={() => poserReplie(false)} recherche={recherche} setRecherche={setRecherche} />
                {!replie && <LigneSemaine1a c={c} recherche={recherche} setRecherche={setRecherche} pleinEcran={() => setPleinEcran(true)} legende={() => setLegende(true)} />}
                {c.statPanel === 'waiting' && <PanneauChiffres c={c} chiffres={chiffres} fermer={() => setStatPanel(null)} />}
                {c.statPanel === 'docs' && <ListePieces c={c} />}
              </div>
              {!replie && (
                <section className="dzp-cockpit" aria-label="Chiffres de la semaine">
                  <div className="dzp-cockpit__replier">
                    <button type="button" className="dzp-replier" onClick={() => { setStatPanel(null); poserReplie(true); }} aria-expanded={true} data-testid="haut-replier"
                      title="Masquer la ligne de semaine et les chiffres (la barre noire garde la semaine, la recherche et Exporter)">Replier ▴</button>
                  </div>
                  <PanneauChiffres c={c} chiffres={chiffres} fermer={() => setStatPanel(null)} enLigne />
                </section>
              )}
            </>
          ) : (
            <div className="dzp-haut">
              <BarreUnique c={telephone ? { ...c, printMenu: null } : c} recherche={recherche} setRecherche={setRecherche} pleinEcran={() => setPleinEcran(true)} legende={() => setLegende(true)} />
              {!telephone && c.statPanel === 'waiting' && <PanneauChiffres c={c} chiffres={chiffres} fermer={() => setStatPanel(null)} />}
              {!telephone && c.statPanel === 'docs' && <ListePieces c={c} />}
            </div>
          )}
        <TiroirClients c={c} />
        {c.workers.length > 0 && !c.selectMode && !(ordi && pleinEcran) && <div className="dzp-astuce">{c.copyTipDesk}</div>}
        <div className="dzp-zone">
          <Aide c={c} />
          {ordi ? <Grille1a c={cGrille} totaux={totaux} recherche={recherche.trim()} /> : <Grille c={cGrille} totaux={totaux} recherche={recherche.trim()} />}
          {/* Ordinateur (planche 1a) : la légende est toujours posée sous la grille ; tablette (2a) : elle s'ouvre depuis « Plus ⋯ ». */}
          <Legende ouverte={legende} toujours={ordi} fermer={() => setLegende(false)} />
        </div>
      </div>
      <Mobile c={c} gens={gens} nbRecherche={nbRecherche} />
      <Dock c={c} />
    </>
  );
}
