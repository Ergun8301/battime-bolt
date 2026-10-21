'use client';

// Design du bureau (v2, planche 2a) · le MENU DES CHIFFRES et le BANDEAU : les quatre tuiles compactes du 1a (heures envoyées avec les barres par jour,
// À relancer, En direct, Absents) ; les noms ne s'affichent que dans la liste déroulante ouverte au clic sur une tuile (retouches 4). La liste des pièces jointes
// (ancienne tuile « Pièces ») s'ouvre depuis « Plus ⋯ » au même endroit. Les chiffres viennent de ce que l'écran a DÉJÀ lu (aucune requête de plus) ; règles pures de bureau-vue.ts.
import { Fragment, useCallback, useEffect, useId, useRef, useState } from 'react';
import { Building2, CheckCheck, FileText, Image as ImageIcon } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { degradeJour } from './grille-v2';
import { useBloquePage } from './barres-v2';
import type { PlanningCtx } from './contexte-v2';

const LIB_ABS: Record<string, string> = { conge: 'congé', maladie: 'arrêt maladie', intemperie: 'intempérie', repos: 'repos' };
const LETTRES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export interface Chiffres {
  envoyees: number; aVenir: number;
  /** Charge de chaque jour (minutes envoyées + prévues), comme l'en-tête des jours. */
  charge: number[];
  relances: { id: string; name: string; days: string[] }[];
}

/** Ferme au clic dehors (hors du panneau et hors des déclencheurs marqués `data-ouvre-chiffres`) ; Échap est géré par PlanningV2. */
function useClicDehors(ref: React.RefObject<HTMLElement>, fermer: () => void, actif = true) {
  useEffect(() => {
    if (!actif) return;
    const f = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || ref.current?.contains(t) || t.closest('[data-ouvre-chiffres]') || t.closest('[role="dialog"],[role="alertdialog"],[data-guide-ui]')) return;
      fermer();
    };
    document.addEventListener('pointerdown', f, true);
    return () => document.removeEventListener('pointerdown', f, true);
  }, [ref, fermer, actif]);
}

/** La liste déroulante ouverte sous une tuile (une seule à la fois) : « À relancer », « En direct » ou « Absents ». */
export type ListeChiffres = 'relance' | 'direct' | 'absents' | null;

/** Liste déroulante d'une tuile : un clic dehors (hors de la tuile et hors des compteurs `data-ouvre-chiffres`) la ferme ; Échap aussi, AVANT tout le reste
 *  (le menu des chiffres ou la feuille qui la porte restent ouverts : un 2e Échap les ferme), et le focus revient sur la tuile s'il était dans la liste. */
function useDeroulant(ref: React.RefObject<HTMLElement>, ouvert: boolean, fermer: () => void) {
  useEffect(() => {
    if (!ouvert) return;
    const clic = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      // La carte du guide pas à pas (data-guide-ui) ne referme pas la liste qu'elle montre.
      if (!t || ref.current?.contains(t) || t.closest('[data-ouvre-chiffres]') || t.closest('[data-guide-ui]')) return;
      fermer();
    };
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      const dedans = !!ref.current?.contains(document.activeElement);
      fermer();
      if (dedans) ref.current?.querySelector<HTMLElement>('.dzp-tuile__corps')?.focus();
    };
    document.addEventListener('pointerdown', clic, true);
    window.addEventListener('keydown', touche, true);
    return () => { document.removeEventListener('pointerdown', clic, true); window.removeEventListener('keydown', touche, true); };
  }, [ref, ouvert, fermer]);
}

/** Une tuile compacte (titre, grand chiffre, une ligne). S'il y a des noms à montrer (`liste`), toute la tuile est un bouton qui ouvre sa liste déroulante
 *  JUSTE SOUS elle, par-dessus la grille ; la tuile ne change ni de taille ni de forme. Sinon, aucun clic. */
function Tuile({ classe = '', testId, guideRelance = false, ouvert, basculer, fermer, libelle, liste, children }: {
  classe?: string; testId: string; guideRelance?: boolean; ouvert: boolean; basculer: () => void; fermer: () => void; libelle: string; liste: React.ReactNode | null; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useDeroulant(ref, ouvert && !!liste, fermer);
  return (
    <div ref={ref} className={`dzp-tuile ${classe}`} data-testid={testId} data-guide={guideRelance ? 'bureau-stat.tuile' : undefined} data-ouvert={ouvert && liste ? '' : undefined}>
      {liste ? (
        <button type="button" className="dzp-tuile__corps" aria-expanded={ouvert} aria-controls={id} onClick={basculer}
          title={ouvert ? 'Refermer la liste' : `Voir la liste : ${libelle}`}>{children}</button>
      ) : <div className="dzp-tuile__corps">{children}</div>}
      {liste && ouvert && <div className="dzp-deroulant" id={id} role="region" aria-label={libelle} data-testid="liste-deroulante">{liste}</div>}
    </div>
  );
}

/**
 * Les quatre tuiles du 1a, COMPACTES (titre en petites capitales, grand chiffre, une ligne au plus), en quatre colonnes égales. `enLigne` (ordinateur, haut
 * déplié) : le BANDEAU posé sous la ligne de semaine. Sinon : le menu des chiffres, posé sous la barre noire (haut replié, tablette) ou dans la feuille du téléphone.
 * Aucune liste de noms au repos : un clic sur « À relancer » (ou « En direct », « Absents » quand il y a des noms) ouvre sa liste déroulante sous la tuile ;
 * clic dehors, Échap ou nouveau clic sur la tuile la referment. `liste` / `setListe` : l'état tenu par PlanningV2 (le compteur de la barre noire ouvre la même).
 */
export function PanneauChiffres({ c, chiffres, fermer, enLigne = false, liste: listeParent, setListe: setListeParent }: {
  c: PlanningCtx; chiffres: Chiffres; fermer: () => void; enLigne?: boolean; liste?: ListeChiffres; setListe?: (l: ListeChiffres) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [listeInterne, setListeInterne] = useState<ListeChiffres>(null);
  const liste = listeParent !== undefined ? listeParent : listeInterne;
  const poserListe = setListeParent ?? setListeInterne;
  const fermerListe = useCallback(() => poserListe(null), [poserListe]);
  const basculer = (l: Exclude<ListeChiffres, null>) => () => poserListe(liste === l ? null : l);
  // Menu des chiffres : un clic dehors le ferme, la page derrière ne défile pas tant qu'il est ouvert. Le bandeau, lui, fait partie de la page.
  useClicDehors(ref, fermer, !enLigne);
  useBloquePage(!enLigne);
  const sem = c.weekDays.map((d) => format(d, 'yyyy-MM-dd'));
  const indexAuj = sem.indexOf(c.todayStr);
  const max = Math.max(1, ...chiffres.charge);
  const passee = c.currentWeekStart < c.thisWeekStart;
  const vivants = Array.from(c.livePlaces.values()).filter((l) => c.displayWorkers.some((w) => w.id === l.user_id));
  const chantiersVivants = new Set(vivants.map((l) => l.worksite_id || '')).size;
  const absents = c.displayWorkers.filter((w) => c.todayAbsence.has(w.id));
  const libAbs = (id: string) => LIB_ABS[c.todayAbsence.get(id) || ''] || c.todayAbsence.get(id) || '';
  const parType = new Map<string, number>();
  for (const w of absents) parType.set(libAbs(w.id), (parType.get(libAbs(w.id)) || 0) + 1);
  const nomDe = (w: { first_name?: string | null; last_name?: string | null }) => `${w.first_name || ''} ${w.last_name || ''}`.trim();
  const nb = c.cockpitStats.waiting;
  const nbSal = chiffres.relances.length;
  // Les lignes de l'écran d'avant (mêmes gestionnaires : Relancer, « ✓ relancé ») ; le nom n'ouvre rien ici (voir onClickCapture).
  const lignes = c.renderRelanceRows(fermer);
  const toutes = Array.isArray(lignes) ? lignes : [];
  return (
    <div className={`dzp-chiffres${enLigne ? ' dzp-chiffres--ligne' : ''}`} ref={ref} role="region" aria-label="Chiffres de la semaine" data-testid={enLigne ? 'bandeau' : 'menu-chiffres'}>
      <div className="dzp-tuile dzp-tuile--sombre" data-testid="stat-heures">
        <span className="dzp-tuile__k">Heures envoyées · S-{format(c.currentWeekStart, 'I')}</span>
        <div className="dzp-total">
          <div className="dzp-total__n"><b>{Math.round(chiffres.envoyees / 60)}</b><span>h</span></div>
          <div className="dzp-barres" aria-hidden="true">
            {chiffres.charge.map((m, i) => (
              <div key={sem[i]} className="dzp-barre" data-auj={i === indexAuj ? '' : undefined}>
                <span className="dzp-barre__n">{Math.round(m / 60)}h</span>
                <div className="dzp-barre__b" style={{ height: `${Math.round((m / max) * 40)}px`, background: degradeJour(i, 180) }} />
                {/* « L 12 » quand la colonne a la place, sinon la lettre seule (règle CSS sur la largeur de la colonne) : jamais coupé. */}
                <span className="dzp-barre__l" title={format(c.weekDays[i], 'EEEE d', { locale: fr })}>{LETTRES[i]}<span className="dzp-barre__j"> {format(c.weekDays[i], 'd')}</span></span>
              </div>
            ))}
          </div>
        </div>
        <span className="dzp-total__s">{passee ? 'Semaine passée' : `+ ${Math.round(chiffres.aVenir / 60)} h prévues${c.isCurrentWeek ? ' à venir' : ''}`}</span>
      </div>

      <Tuile classe="dzp-tuile--relance" testId="stat-relance" guideRelance libelle="À relancer"
        ouvert={liste === 'relance'} basculer={basculer('relance')} fermer={fermerListe}
        liste={toutes.length === 0 ? null : (
          <>
            <div className="dzp-deroulant__liste" data-testid="relance-panel" data-guide="bureau-stat.liste"
              onClickCapture={(e) => { if ((e.target as HTMLElement).closest('.bt-pl-sp-who')) { e.preventDefault(); e.stopPropagation(); } }}>
              {toutes}
            </div>
            {c.openValiderTout ? (
              <button type="button" className="dzp-deroulant__valider" data-testid="relance-valider-tout" onClick={() => { fermerListe(); if (!enLigne) fermer(); c.openValiderTout?.(); }}>
                <CheckCheck className="h-[18px] w-[18px]" aria-hidden="true" /> Tout valider d’un coup
              </button>
            ) : null}
            <button type="button" className="dzp-deroulant__tous" data-testid="relance-tous" onClick={() => { fermerListe(); if (!enLigne) fermer(); c.setSalariesOpen(true); }}>
              Voir tous dans Salariés
            </button>
          </>
        )}>
        <span className="dzp-tuile__k">À relancer</span>
        <span className="dzp-tuile__v"><b>{nb}</b><span>journée{nb > 1 ? 's' : ''}</span></span>
        <span className="dzp-tuile__s">{nb === 0 ? `Tout est envoyé en ${c.monthLabel}.` : nbSal > 0 ? `${nbSal} salarié${nbSal > 1 ? 's' : ''} concerné${nbSal > 1 ? 's' : ''}` : 'Planifiées sans heures envoyées.'}</span>
      </Tuile>

      <Tuile classe="dzp-tuile--direct" testId="stat-direct" libelle="En direct" ouvert={liste === 'direct'} basculer={basculer('direct')} fermer={fermerListe}
        liste={vivants.length === 0 ? null : (
          <div className="dzp-deroulant__liste" data-testid="direct-liste">
            {vivants.map((l) => {
              const w = c.displayWorkers.find((x) => x.id === l.user_id);
              return (
                <div key={l.user_id} className="bt-pl-sp-row" data-testid="direct-row">
                  <span className="nm">{w ? nomDe(w) : ''}<span className="sub">{(l.worksite_id && c.worksiteNameById.get(l.worksite_id)) || 'Chantier non précisé'}</span></span>
                  <span className="amt">depuis {l.since}</span>
                </div>
              );
            })}
          </div>
        )}>
        <span className="dzp-tuile__k">En direct</span>
        <span className="dzp-tuile__v"><span className="dzp-point" aria-hidden="true" /><b>{vivants.length}</b><span>pointe{vivants.length > 1 ? 'nt' : ''}</span></span>
        <span className="dzp-tuile__s">{vivants.length === 0 ? 'Personne ne pointe en ce moment' : `Sur ${chantiersVivants} chantier${chantiersVivants > 1 ? 's' : ''}`}</span>
      </Tuile>

      <Tuile testId="stat-absents" libelle="Absents aujourd'hui" ouvert={liste === 'absents'} basculer={basculer('absents')} fermer={fermerListe}
        liste={absents.length === 0 ? null : (
          <div className="dzp-deroulant__liste" data-testid="absents-liste">
            {absents.map((w) => (
              <div key={w.id} className="bt-pl-sp-row" data-testid="absent-row">
                <span className="nm">{nomDe(w)}<span className="sub">{libAbs(w.id)}</span></span>
              </div>
            ))}
          </div>
        )}>
        <span className="dzp-tuile__k">Absents aujourd&apos;hui</span>
        <span className="dzp-tuile__v"><b>{absents.length}</b><span>sur {c.displayWorkers.length}</span></span>
        <span className="dzp-tuile__s">{absents.length === 0 ? 'Tout le monde est là' : Array.from(parType, ([t, n]) => `${n} ${t}`).join(' · ')}</span>
      </Tuile>
    </div>
  );
}

/** La liste des pièces jointes (ancienne tuile « Pièces » du lot 1), ouverte depuis « Plus ⋯ » ; même contenu, mêmes gestes. */
export function ListePieces({ c }: { c: PlanningCtx }) {
  const ref = useRef<HTMLDivElement>(null);
  const fermer = () => c.setStatPanel(null);
  useClicDehors(ref, fermer);
  return (
    <div className="dzp-panneau-stat dzp-pieces" ref={ref} data-testid="liste-pieces">
      <div className="bt-pl-sp-h">Pièces jointes <span className="n">{c.cockpitStats.docs}</span></div>
      <div className="bt-pl-sp-list">
        {c.docListState === 'loading' ? (
          <div className="bt-pl-sp-empty">Lecture…</div>
        ) : c.docListState === 'ko' ? (
          <div className="bt-pl-sp-empty">La liste n&apos;a pas pu être lue.<br />Refermez et rouvrez pour réessayer.</div>
        ) : c.docsByChantier.length === 0 ? (
          <div className="bt-pl-sp-empty">Aucune pièce jointe.<br />Photos et documents se déposent depuis le chantier.</div>
        ) : c.docsByChantier.map((g) => (
          <Fragment key={g.id || 'sans'}>
            <button type="button" className="bt-pl-sp-grp" title={g.id ? 'Ouvrir les documents de ce chantier' : 'Chantier inconnu'}
              disabled={!c.worksites.some((w) => w.id === g.id)}
              onClick={() => { const ws = c.worksites.find((w) => w.id === g.id); if (!ws) return; c.setStatPanel(null); c.setDocsWorksite({ ws, day: null }); }}>
              <Building2 className="h-3 w-3" aria-hidden /><span className="nm">{g.name}</span><span className="amt">{g.docs.length}</span>
            </button>
            {g.docs.map((d) => (
              <div key={d.id} className="bt-pl-sp-doc">
                {(d.mime_type || '').startsWith('image/') ? <ImageIcon className="h-3.5 w-3.5" aria-hidden /> : <FileText className="h-3.5 w-3.5" aria-hidden />}
                <span className="nm">{d.label || d.file_name || 'Document'}</span>
                <span className="dt">{format(parseISO((d.work_date || d.created_at).slice(0, 10)), 'dd/MM')}</span>
              </div>
            ))}
          </Fragment>
        ))}
      </div>
      {c.docsByChantier.length > 0 && <div className="bt-pl-sp-foot">Cliquez un chantier pour ouvrir ses pièces.</div>}
    </div>
  );
}
