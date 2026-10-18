'use client';

// Design du bureau (v2, planche 2a) · le MENU DES CHIFFRES : plus de bandeau au-dessus du planning ; un clic sur un compteur de la barre noire ouvre, sous la barre,
// les quatre tuiles du 1a (heures envoyées avec les barres par jour, À relancer avec la liste, En direct, Absents). La liste des pièces jointes (ancienne tuile « Pièces »)
// s'ouvre depuis « Plus ⋯ » au même endroit. Les chiffres viennent de ce que l'écran a DÉJÀ lu (aucune requête de plus) ; règles pures de bureau-vue.ts.
import { Fragment, useEffect, useRef } from 'react';
import { Building2, FileText, Image as ImageIcon } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { resumeRelance } from '@/supabase/functions/_shared/bureau-vue';
import { degradeJour } from './grille-v2';
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
function useClicDehors(ref: React.RefObject<HTMLElement>, fermer: () => void) {
  useEffect(() => {
    const f = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || ref.current?.contains(t) || t.closest('[data-ouvre-chiffres]') || t.closest('[role="dialog"],[role="alertdialog"]')) return;
      fermer();
    };
    document.addEventListener('pointerdown', f, true);
    return () => document.removeEventListener('pointerdown', f, true);
  }, [ref, fermer]);
}

export function PanneauChiffres({ c, chiffres, fermer }: { c: PlanningCtx; chiffres: Chiffres; fermer: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useClicDehors(ref, fermer);
  const sem = c.weekDays.map((d) => format(d, 'yyyy-MM-dd'));
  const indexAuj = sem.indexOf(c.todayStr);
  const max = Math.max(1, ...chiffres.charge);
  const passee = c.currentWeekStart < c.thisWeekStart;
  const vivants = Array.from(c.livePlaces.values()).filter((l) => c.displayWorkers.some((w) => w.id === l.user_id));
  const premier = vivants[0];
  const premierNom = premier ? c.displayWorkers.find((w) => w.id === premier.user_id) : undefined;
  const absents = c.displayWorkers.filter((w) => c.todayAbsence.has(w.id));
  const nb = c.cockpitStats.waiting;
  const resume = resumeRelance(chiffres.relances.map((r) => ({ prenom: r.name.split(' ')[0], jours: r.days.length })));
  return (
    <div className="dzp-chiffres" ref={ref} role="region" aria-label="Chiffres de la semaine" data-testid="menu-chiffres">
      <div className="dzp-tuile dzp-tuile--sombre" data-testid="stat-heures">
        <div className="dzp-total">
          <span className="dzp-tuile__k">Heures envoyées · S-{format(c.currentWeekStart, 'I')}</span>
          <div className="dzp-total__n"><b>{Math.round(chiffres.envoyees / 60)}</b><span>h</span></div>
          <span className="dzp-total__s">{passee ? 'Semaine passée' : `+ ${Math.round(chiffres.aVenir / 60)} h prévues${c.isCurrentWeek ? ' à venir' : ''}`}</span>
        </div>
        <div className="dzp-barres" aria-hidden="true">
          {chiffres.charge.map((m, i) => (
            <div key={sem[i]} className="dzp-barre" data-auj={i === indexAuj ? '' : undefined}>
              <span className="dzp-barre__n">{Math.round(m / 60)}h</span>
              <div className="dzp-barre__b" style={{ height: `${Math.round((m / max) * 58)}px`, background: degradeJour(i, 180) }} />
              <span className="dzp-barre__l">{LETTRES[i]} {format(c.weekDays[i], 'd')}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="dzp-tuile dzp-tuile--relance" data-testid="stat-relance" data-guide="bureau-stat.relance">
        <span className="dzp-tuile__k">À relancer</span>
        <span className="dzp-tuile__v"><b>{nb}</b><span>journée{nb > 1 ? 's' : ''}</span></span>
        <span className="dzp-tuile__s">{nb === 0 ? `Tout est envoyé en ${c.monthLabel}.` : `${resume}. Planifiées sans heures envoyées.`}</span>
        <div className="dzp-tuile__liste" data-testid="relance-panel" data-guide="bureau-stat.liste">{c.renderRelanceRows(fermer)}</div>
      </div>

      <div className="dzp-tuile dzp-tuile--direct" data-testid="stat-direct">
        <span className="dzp-tuile__k">En direct</span>
        <span className="dzp-tuile__v"><span className="dzp-point" aria-hidden="true" /><b>{vivants.length}</b><span>pointe{vivants.length > 1 ? 'nt' : ''}</span></span>
        <span className="dzp-tuile__s">{premier ? `${premierNom?.first_name || ''}${premier.worksite_id && c.worksiteNameById.get(premier.worksite_id) ? ` · ${c.worksiteNameById.get(premier.worksite_id)}` : ''} depuis ${premier.since}${vivants.length > 1 ? ` · +${vivants.length - 1}` : ''}` : 'Personne ne pointe en ce moment'}</span>
      </div>

      <div className="dzp-tuile" data-testid="stat-absents">
        <span className="dzp-tuile__k">Absents aujourd&apos;hui</span>
        <span className="dzp-tuile__v"><b>{absents.length}</b><span>sur {c.displayWorkers.length}</span></span>
        <span className="dzp-tuile__s">{absents.length === 0 ? 'Tout le monde est là' : absents.slice(0, 2).map((w) => `${w.first_name} · ${LIB_ABS[c.todayAbsence.get(w.id) || ''] || c.todayAbsence.get(w.id)}`).join(', ') + (absents.length > 2 ? ', …' : '')}</span>
      </div>
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
