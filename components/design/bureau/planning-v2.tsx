'use client';

// Design du bureau (v2) · LE PLANNING. Ordinateur (1 024 px et plus) : maquette 1a de la planche d'essai (barre noire, ligne de semaine, bandeau de chiffres, grille du
// lot 1), avec « Replier ▴ » (barre noire) et le plein écran ; tablette (768 à 1 023 px) : barre unique et grille compacte 2a ; téléphone : planche 2b.
// Chargé À LA DEMANDE par admin-planning.tsx quand le drapeau `?ui=2` est actif (jamais dans le premier chargement).
// Ce morceau ne lit rien et n'écrit rien : il reçoit de l'écran existant ses états et ses gestionnaires (contexte-v2.ts) et dessine la planche du designer.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { addDays, format } from 'date-fns';
import { toast } from 'sonner';
import { ActionDone } from '@/components/action-done';
import { totauxSemaine } from '@/supabase/functions/_shared/bureau-vue';
import './bureau-jetons.css';
import './planning-v2.css';
import { BarreNoire1a, BarreUnique, LigneSemaine1a, NavSemainePleinEcran, SortiePleinEcran, TiroirClients } from './barres-v2';
import { ListePieces, PanneauChiffres, type ListeChiffres } from './bandeau-v2';
import { chargeJours, Grille } from './grille-v2';
import { Grille1a } from './grille-1a';
import { Mobile } from './mobile-v2';
import { useObjectifs } from './objectif-v2';
import { publierPont, useLargeur, REQ_ORDI, REQ_TELEPHONE } from './pont-v2';
import type { PlanningCtx } from './contexte-v2';

export { default as MenuMobileV2 } from './menu-mobile-v2';
export { Ghost } from './bulle-v2';
export { default as FicheV2 } from './fiche-v2';
// Les fiches du guide pas à pas du bureau v2 : chargées avec ce morceau, jamais dans le premier chargement de /admin.
export { findAdminTourV2 } from '@/supabase/functions/_shared/admin-tours-v2';

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

/** Les messages passagers disparaissent seuls : 6 s avec un bouton « Annuler », 3,5 s sinon ; la minuterie s'arrête au survol (ou pendant qu'on touche le
 *  message) et repart à la sortie ; la croix ferme plus tôt. */
const DUREE_ANNULER = 6000;
const DUREE_SIMPLE = 3500;

/** La carte « Fait — … · Annuler » du bas d'écran : 6 s, en pause au survol ; après un clic dedans (Annuler), 3,5 s pour lire le résultat. */
function useMinuterie(cle: number | undefined, fermer: () => void) {
  const reste = useRef(DUREE_ANNULER);
  const depart = useRef(0);
  const t = useRef<number | undefined>(undefined);
  const fermerRef = useRef(fermer);
  fermerRef.current = fermer;
  const arreter = () => { if (t.current !== undefined) { window.clearTimeout(t.current); t.current = undefined; reste.current = Math.max(0, reste.current - (Date.now() - depart.current)); } };
  const lancer = () => { if (t.current !== undefined) return; depart.current = Date.now(); t.current = window.setTimeout(() => { t.current = undefined; fermerRef.current(); }, reste.current); };
  useEffect(() => {
    if (cle === undefined) return;
    reste.current = DUREE_ANNULER; t.current = undefined; lancer();
    return () => { if (t.current !== undefined) window.clearTimeout(t.current); t.current = undefined; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
  return {
    onPointerEnter: arreter, onPointerLeave: lancer, onFocus: arreter, onBlur: lancer,
    // Un clic dans la carte (Annuler) : le résultat reste 3,5 s, comptées à partir de la sortie du pointeur.
    onClick: () => { arreter(); reste.current = DUREE_SIMPLE; },
  };
}

/** Les retours passagers (Sonner) du bureau v2 : 3,5 s, 6 s s'ils portent un bouton, une croix pour fermer plus tôt ; Sonner les met déjà en pause au survol.
 *  Le Toaster du site (app/layout.tsx, partagé par toutes les pages) ne change pas, ni rien du premier chargement : quand un retour apparaît à l'écran, il est
 *  repris ici une fois (même identifiant) avec ces réglages. Un message d'erreur qui a demandé plus de temps (12 s : une explication à lire) le garde, avec la croix. */
function useRetoursBureau() {
  useEffect(() => {
    const vus = new Set<string | number>();
    const reprendre = () => {
      for (const t of toast.getHistory()) {
        if (vus.has(t.id)) continue;
        vus.add(t.id);
        if ('dismiss' in t || t.type === 'loading' || t.promise || t.delete) continue;
        const long = typeof t.duration === 'number' && Number.isFinite(t.duration) && t.duration > DUREE_ANNULER;
        toast(t.title as string, { ...t, id: t.id, closeButton: true, duration: long ? t.duration : (t.action || t.cancel ? DUREE_ANNULER : DUREE_SIMPLE) });
      }
    };
    // Les retours déjà affichés avant l'ouverture du planning v2 gardent leurs réglages.
    for (const t of toast.getHistory()) vus.add(t.id);
    const mo = new MutationObserver(reprendre);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
}

function Dock({ c }: { c: PlanningCtx }) {
  const minuterie = useMinuterie(c.undoCard?.key, () => c.setUndoCard(null));
  if (!c.selectMode && !c.undoCard) return null;
  const n = c.selIds.length;
  const idsSemaine: string[] = c.selectMode ? c.selectableIn((p: { user_id: string }) => c.displayWorkers.some((w) => w.id === p.user_id)) : [];
  const jour = format(c.weekDays[c.mobileDayIdx], 'yyyy-MM-dd');
  const idsJour: string[] = c.selectMode ? c.selectableIn((p: { work_date: string; user_id: string }) => p.work_date === jour && c.workers.some((w) => w.id === p.user_id)) : [];
  const tout = (ids: string[]) => ids.length > 0 && ids.every((id) => c.selOn.has(id));
  return (
    <div className="dzp-dock">
      {c.undoCard && (
        <div className="dzp-undo" data-testid="undo-card" key={c.undoCard.key} {...minuterie}>
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

/** Défilement doux jusqu'à la tuile « À relancer » du bandeau quand elle n'est pas à l'écran (sa liste déroulante s'ouvre juste dessous). */
function montrerRelance() {
  requestAnimationFrame(() => {
    const t = document.querySelector<HTMLElement>('[data-testid=bandeau] [data-testid=stat-relance]');
    if (!t) return;
    t.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
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
  // « Compris » sur l'astuce : le focus passe au lien « Astuce : copier une case », au bout de la légende (planning-copier.tsx) ; la page ne saute pas jusqu'à lui.
  useEffect(() => {
    const f = (e: MouseEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.('[data-testid=copy-tip-ok]')) return;
      const x = window.scrollX; const y = window.scrollY;
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(x, y)));
    };
    document.addEventListener('click', f, true);
    return () => document.removeEventListener('click', f, true);
  }, []);
  const [pleinEcranDemande, setPleinEcran] = useState(false);
  // Téléphone : jamais de plein écran (la touche F n'y fait rien ; un plein écran ouvert à la tablette se défait en passant sous 768 px).
  const telephone = useLargeur(REQ_TELEPHONE);
  const pleinEcran = pleinEcranDemande && !telephone;
  const cRef = useRef(c);
  cRef.current = c;
  const [recherche, setRecherche] = useState('');
  const ordi = useLargeur(REQ_ORDI);
  const [replie, poserReplie] = useHautReplie(c.user?.id);
  // Échap ferme les menus, le tiroir Clients, le menu des chiffres, puis le plein écran (les fenêtres, elles, se ferment toutes seules : Radix).
  const { accountMenuOpen, chantierMenuOpen, statPanel, setAccountMenuOpen, setChantierMenuOpen, setStatPanel } = c;
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (accountMenuOpen || chantierMenuOpen || statPanel) { setAccountMenuOpen(false); setChantierMenuOpen(false); setStatPanel(null); return; }
        if (pleinEcran && !document.querySelector('[role="dialog"],[role="alertdialog"]')) setPleinEcran(false);
        return;
      }
      // Plein écran : ← → changent de semaine (jamais dans un champ, jamais sous une fenêtre, jamais avec une touche de commande).
      if (pleinEcran && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !dansUnChamp(e.target)
        && !document.querySelector('[role="dialog"],[role="alertdialog"]')) {
        e.preventDefault();
        const k = cRef.current;
        k.changeWeek(addDays(k.currentWeekStart, e.key === 'ArrowLeft' ? -7 : 7));
        return;
      }
      if (telephone) return;
      // Planche 2a : « Plein écran : touche ⤢ ou F ». Jamais pendant une saisie, jamais avec une touche de commande, jamais sous une fenêtre ouverte.
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey && !dansUnChamp(e.target) && !document.querySelector('[role="dialog"],[role="alertdialog"]')) {
        e.preventDefault(); setPleinEcran((v) => !v);
      }
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [accountMenuOpen, chantierMenuOpen, statPanel, pleinEcran, telephone, setAccountMenuOpen, setChantierMenuOpen, setStatPanel]);
  const dates = c.weekDays.map((d) => format(d, 'yyyy-MM-dd'));
  const totaux = useMemo(() => {
    const exclure = new Set<string>();
    for (const p of c.planning) if (c.realForPlanning(p) || c.draftForPlanning(p) || c.withdrawnIds.has(p.id)) exclure.add(p.id);
    return totauxSemaine(dates, c.displayWorkers.map((w) => w.id), c.realEntries, c.planning, exclure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates.join('|'), c.displayWorkers, c.realEntries, c.planning, c.draftEntries, c.withdrawnIds]);
  const objectifs = useObjectifs(c);
  const relances = (c.waitingByWorker as { id: string; name: string; days: string[] }[]) || [];
  // La grille ne montre que les salariés retenus par la recherche (affichage seulement : la sélection « toute la semaine » garde toute l'équipe).
  const visibles = useMemo(() => filtrer(c, recherche, dates),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c.displayWorkers, c.planning, recherche, dates.join('|')]);
  const cGrille = visibles === c.displayWorkers ? c : { ...c, displayWorkers: visibles };
  // Téléphone (planche 2b) : la même recherche (elle se tape dans le menu ☰) filtre les cartes et la mosaïque ; la liste du téléphone reste `workers` (comme avant).
  const gens = useMemo(() => filtrer(c, recherche, dates, c.workers),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c.workers, c.planning, recherche, dates.join('|')]);
  const nbRecherche = recherche.trim() ? `${gens.length} salarié${gens.length > 1 ? 's' : ''} pour « ${recherche.trim()} »` : '';
  const chiffres = { envoyees: totaux.envoyees, aVenir: totaux.aVenir, charge: chargeJours(c, dates, totaux), relances };
  // Le menu ☰ (rendu par admin-planning.tsx) reçoit le même contexte, en lecture seule, pour offrir au téléphone tout ce que la barre et « Plus ⋯ » offrent.
  // Après CHAQUE rendu (pas de liste : le contexte change à chaque rendu de l'écran) ; rien n'est appelé ici, setRecherche est seulement prêté au menu.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { publierPont({ c, recherche, setRecherche, chiffres }); });
  useEffect(() => () => publierPont(null), []);
  // Les compteurs de la barre noire (ordinateur), UN geste chacun, haut déplié ou replié : congés → Salariés, pièces → liste des pièces, réserves → Réserves
  // (ces trois-là n'ont pas de tuile). « à relancer » : haut DÉPLIÉ, la liste déroulante de la tuile « À relancer » du bandeau, juste sous la tuile (la même
  // qu'au clic sur la tuile ; un 2e clic la referme ; la tuile ne change pas) ; haut REPLIÉ, le panneau des tuiles sous la barre (un 2e clic le referme).
  const deplie = ordi && !replie && !pleinEcran;
  const [liste, setListe] = useState<ListeChiffres>(null);
  useEffect(() => { if (!deplie) setListe(null); }, [deplie]);
  const signaler = (id: string) => {
    if (id === 'compteur-conges') { c.setSalariesOpen(true); return; }
    if (id === 'compteur-reserves') { c.setReservesOpen(true); return; }
    if (id === 'compteur-pieces') { setStatPanel((p: string | null) => (p === 'docs' ? null : 'docs')); return; }
    if (replie) { setStatPanel((p: string | null) => (p === 'waiting' ? null : 'waiting')); return; }
    if (liste !== 'relance') montrerRelance();
    setListe(liste === 'relance' ? null : 'relance');
  };
  // Une demande d'ouvrir la liste « À relancer » venue d'ailleurs (l'assistant) pendant que le haut est déplié : la même liste déroulante, rien d'autre.
  useEffect(() => {
    if (deplie && statPanel === 'waiting') { setStatPanel(null); setListe('relance'); montrerRelance(); }
  }, [deplie, statPanel, setStatPanel]);
  useRetoursBureau();
  return (
    <>
      <div className="dzp-bureau-desk" data-plein-ecran={pleinEcran ? '' : undefined} data-mise={ordi ? '1a' : '2a'} data-replie={ordi && replie ? '' : undefined}>
        {pleinEcran
          ? <SortiePleinEcran quitter={() => setPleinEcran(false)} />
          : ordi ? (
            <>
              <div className="dzp-haut dzp-haut--1a">
                <BarreNoire1a c={c} replie={replie} deplier={() => { setStatPanel(null); poserReplie(false); }} replier={() => { setStatPanel(null); poserReplie(true); }} recherche={recherche} setRecherche={setRecherche} signaler={signaler} relanceOuverte={replie ? c.statPanel === 'waiting' : liste === 'relance'} />
                {!replie && <LigneSemaine1a c={c} recherche={recherche} setRecherche={setRecherche} pleinEcran={() => setPleinEcran(true)} />}
                {replie && c.statPanel === 'waiting' && <PanneauChiffres c={c} chiffres={chiffres} fermer={() => setStatPanel(null)} />}
                {c.statPanel === 'docs' && <ListePieces c={c} />}
              </div>
              {!replie && (
                <section className="dzp-cockpit" aria-label="Chiffres de la semaine">
                  <PanneauChiffres c={c} chiffres={chiffres} fermer={() => setStatPanel(null)} enLigne liste={liste} setListe={setListe} />
                </section>
              )}
            </>
          ) : (
            <div className="dzp-haut">
              <BarreUnique c={telephone ? { ...c, printMenu: null } : c} recherche={recherche} setRecherche={setRecherche} pleinEcran={() => setPleinEcran(true)} />
              {!telephone && c.statPanel === 'waiting' && <PanneauChiffres c={c} chiffres={chiffres} fermer={() => setStatPanel(null)} />}
              {!telephone && c.statPanel === 'docs' && <ListePieces c={c} />}
            </div>
          )}
        <TiroirClients c={c} />
        {c.workers.length > 0 && !c.selectMode && !(ordi && pleinEcran) && <div className="dzp-astuce">{c.copyTipDesk}</div>}
        <div className="dzp-zone">
          <Aide c={c} />
          {ordi ? <Grille1a c={cGrille} totaux={totaux} objectifs={objectifs} recherche={recherche.trim()} navPE={pleinEcran ? <NavSemainePleinEcran c={c} /> : null} />
            : <Grille c={cGrille} totaux={totaux} objectifs={objectifs} recherche={recherche.trim()} navPE={pleinEcran ? <NavSemainePleinEcran c={c} /> : null} />}
        </div>
      </div>
      <Mobile c={c} gens={gens} nbRecherche={nbRecherche} objectifs={objectifs} />
      <Dock c={c} />
    </>
  );
}
