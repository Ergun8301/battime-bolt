'use client';

// Design du bureau (v2) · le bandeau de chiffres (repliable : déplié = 5 tuiles, replié = une ligne de 40 px ; le choix est gardé par utilisateur).
// Les chiffres viennent de ce que l'écran a DÉJÀ lu (aucune requête de plus) ; le total d'heures et ses 7 barres sont les règles pures de bureau-vue.ts.
import { Fragment, useEffect, useState } from 'react';
import { Building2, FileText, Image as ImageIcon } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { hauteursBarres, hm, resumeRelance } from '@/supabase/functions/_shared/bureau-vue';
import type { PlanningCtx } from './contexte-v2';

const LIB_ABS: Record<string, string> = { conge: 'congé', maladie: 'arrêt maladie', intemperie: 'intempérie', repos: 'repos' };
const LETTRES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const CLE = 'bt-bureau-bandeau-replie';

/** Le choix « replié / déplié », gardé par utilisateur dans ce navigateur (localStorage, jamais bloquant). */
function useReplie(userId: string | undefined): [boolean, (v: boolean) => void] {
  const [replie, setReplie] = useState(false);
  useEffect(() => {
    try { setReplie(window.localStorage.getItem(`${CLE}:${userId || ''}`) === '1'); } catch { /* stockage indisponible : déplié */ }
  }, [userId]);
  const poser = (v: boolean) => {
    setReplie(v);
    try { if (v) window.localStorage.setItem(`${CLE}:${userId || ''}`, '1'); else window.localStorage.removeItem(`${CLE}:${userId || ''}`); } catch { /* ignoré */ }
  };
  return [replie, poser];
}

export interface Chiffres {
  envoyees: number; aVenir: number; jours: number[];
  relances: { id: string; name: string; days: string[] }[];
}

export function Bandeau({ c, chiffres }: { c: PlanningCtx; chiffres: Chiffres }) {
  const [replie, poser] = useReplie(c.user?.id);
  const sem = c.weekDays.map((d) => format(d, 'yyyy-MM-dd'));
  const indexAuj = sem.indexOf(c.todayStr);
  const hauteurs = hauteursBarres(chiffres.jours);
  const passee = c.currentWeekStart < c.thisWeekStart;
  const vivants = Array.from(c.livePlaces.values()).filter((l) => c.displayWorkers.some((w) => w.id === l.user_id));
  const premier = vivants[0];
  const premierNom = premier ? c.displayWorkers.find((w) => w.id === premier.user_id) : undefined;
  const absents = c.displayWorkers.filter((w) => c.todayAbsence.has(w.id));
  const nbSemaine = c.cockpitStats.waiting;
  const sousRelance = resumeRelance(chiffres.relances.map((r) => ({ prenom: r.name.split(' ')[0], jours: r.days.length })));
  const chantiersAvecPieces = Array.from(c.docsByWorksite.values()).filter((n) => n > 0).length;
  const sansHeures = chiffres.envoyees === 0;

  if (replie) {
    return (
      <section className="dzp-replie" aria-label="Chiffres de la semaine" data-testid="bandeau-replie">
        <div className="dzp-replie__ligne">
          <span className="dzp-kicker">Chiffres S-{format(c.currentWeekStart, 'I')}</span>
          <span><b>{hm(chiffres.envoyees)} h</b> envoyées</span>
          <span className="dzp-replie__rel"><b>{nbSemaine} j</b> à relancer</span>
          <span className="dzp-replie__dir"><span className="dzp-point" aria-hidden="true" /><b>{vivants.length}</b> en direct</span>
          <span><b>{absents.length}</b> absent{absents.length > 1 ? 's' : ''}</span>
          <span><b>{c.cockpitStats.docs}</b> pièce{c.cockpitStats.docs > 1 ? 's' : ''}</span>
          <button type="button" className="dzp-deplier" onClick={() => poser(false)} aria-expanded={false}>Déplier ▾</button>
        </div>
      </section>
    );
  }

  return (
    <section className="dzp-bandeau" aria-label="Chiffres de la semaine" data-testid="bandeau">
      <div className="dzp-tuile dzp-tuile--sombre" data-testid="stat-heures">
        <div className="dzp-total">
          <span className="dzp-tuile__k">Heures envoyées · S-{format(c.currentWeekStart, 'I')}</span>
          <div className="dzp-total__n"><b>{hm(chiffres.envoyees)}</b><span>h</span></div>
          <span className="dzp-total__s">{passee ? 'Semaine passée' : sansHeures && chiffres.aVenir === 0 ? 'Rien d’envoyé' : `+ ${hm(chiffres.aVenir)} h prévues${c.isCurrentWeek ? ' à venir' : ''}`}</span>
        </div>
        <div className="dzp-barres" aria-hidden="true">
          {chiffres.jours.map((m, i) => (
            <div key={sem[i]} className="dzp-barre" data-auj={i === indexAuj ? '' : undefined} data-zero={m === 0 ? '' : undefined}>
              <span className="dzp-barre__n">{m > 0 ? `${Math.round(m / 60)}h` : ''}</span>
              <div className="dzp-barre__b" style={{ height: `${Math.max(hauteurs[i], 3)}%` }} />
              <span className="dzp-barre__l">{LETTRES[i]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="dzp-relatif">
        <button type="button" className="dzp-tuile dzp-tuile--relance" aria-expanded={c.statPanel === 'waiting'} data-testid="stat-waiting" data-guide="bureau-stat.relance"
          title={nbSemaine === 0 ? `Tout est envoyé en ${c.monthLabel}` : `${nbSemaine} journée${nbSemaine > 1 ? 's' : ''} planifiée${nbSemaine > 1 ? 's' : ''} non envoyée${nbSemaine > 1 ? 's' : ''} en ${c.monthLabel} — cliquez pour savoir qui`}
          onClick={() => c.setStatPanel((p: string | null) => (p === 'waiting' ? null : 'waiting'))}>
          <span className="dzp-tuile__k">À relancer</span>
          <span className="dzp-tuile__v"><b>{nbSemaine}</b><span>journée{nbSemaine > 1 ? 's' : ''}</span></span>
          <span className="dzp-tuile__s">{nbSemaine === 0 ? 'Tout est envoyé' : sousRelance}</span>
        </button>
        {c.statPanel === 'waiting' && (
          <div className="dzp-panneau-stat" data-testid="relance-panel">
            <div className="bt-pl-sp-h">À relancer · {c.monthLabel} <span className="n">{nbSemaine} j</span></div>
            <div className="bt-pl-sp-list" data-guide="bureau-stat.liste">{c.renderRelanceRows(() => c.setStatPanel(null))}</div>
            <div className="bt-pl-sp-foot">Journées planifiées sans heures envoyées (ce mois-ci et le mois dernier, sauf mois clôturé).</div>
          </div>
        )}
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

      <div className="dzp-relatif">
        <button type="button" className="dzp-tuile" aria-expanded={c.statPanel === 'docs'} data-testid="stat-docs"
          title={`${c.cockpitStats.docs} pièce(s) jointe(s) — cliquez pour voir lesquelles, et sur quel chantier`}
          onClick={() => c.setStatPanel((p: string | null) => (p === 'docs' ? null : 'docs'))}>
          <span className="dzp-tuile__k">Pièces</span>
          <span className="dzp-tuile__v"><b>{c.cockpitStats.docs}</b><span>document{c.cockpitStats.docs > 1 ? 's' : ''}</span></span>
          <span className="dzp-tuile__s">{c.cockpitStats.docs === 0 ? 'Aucune pièce jointe' : `sur ${chantiersAvecPieces} chantier${chantiersAvecPieces > 1 ? 's' : ''}`}</span>
        </button>
        {c.statPanel === 'docs' && (
          <div className="dzp-panneau-stat">
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
        )}
      </div>
      <button type="button" className="dzp-replier" onClick={() => poser(true)} aria-expanded={true}>Replier ▴</button>
      {c.statPanel && <div className="dzp-fond-menu" onClick={() => c.setStatPanel(null)} />}
    </section>
  );
}
