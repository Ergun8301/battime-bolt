'use client';

// Design du bureau (v2b) · le bandeau de chiffres. REPLIÉ par défaut (une ligne de 44 px) : seulement « N journées à relancer · Bruno 2, Fanny 1 » (rouge)
// et « N pointent en ce moment » (vert) ; un élément à 0 est absent, tout à 0 = pas de bandeau (la grille remonte).
// DÉPLIÉ : tuile sombre « Heures envoyées » (7 barres violettes), tuile rouge « À relancer », tuile verte « En direct » ; Absents et Pièces seulement si > 0.
// « Jours en attente » / « journées à relancer » n'est écrit en toutes lettres qu'ici (planche v2b §5). Le choix replié / déplié est gardé par utilisateur.
// Les chiffres viennent de ce que l'écran a DÉJÀ lu (aucune requête de plus) ; total d'heures et barres = règles pures de bureau-vue.ts.
import { Fragment, useEffect, useState } from 'react';
import { Building2, FileText, Image as ImageIcon } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { hauteursBarres } from '@/supabase/functions/_shared/bureau-vue';
import { dureeFr } from './bulle-v2';
import type { PlanningCtx } from './contexte-v2';

const LIB_ABS: Record<string, string> = { conge: 'congé', maladie: 'maladie', intemperie: 'intempérie', repos: 'repos' };
const LETTRES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const CLE = 'bt-bureau-bandeau-v2b';

/** Le choix « déplié », gardé par utilisateur dans ce navigateur (localStorage, jamais bloquant). Replié par défaut (planche v2b). */
export function useDeplie(userId: string | undefined): [boolean, (v: boolean) => void] {
  const [deplie, setDeplie] = useState(false);
  useEffect(() => {
    try { setDeplie(window.localStorage.getItem(`${CLE}:${userId || ''}`) === 'deplie'); } catch { /* stockage indisponible : replié */ }
  }, [userId]);
  const poser = (v: boolean) => {
    setDeplie(v);
    try { if (v) window.localStorage.setItem(`${CLE}:${userId || ''}`, 'deplie'); else window.localStorage.removeItem(`${CLE}:${userId || ''}`); } catch { /* ignoré */ }
  };
  return [deplie, poser];
}

export interface Chiffres {
  envoyees: number; aVenir: number; jours: number[];
  relances: { id: string; name: string; days: string[] }[];
}

const prenom = (n: string) => n.split(' ')[0];
const pluriel = (n: number, mot: string) => `${mot}${n > 1 ? 's' : ''}`;

/** La liste « À relancer » (gestes et lignes de l'écran d'avant), ouverte depuis le bandeau replié ou la tuile rouge. */
function PanneauRelance({ c, nb }: { c: PlanningCtx; nb: number }) {
  return (
    <div className="dzp-panneau-stat" data-testid="relance-panel">
      <div className="bt-pl-sp-h">À relancer · {c.monthLabel} <span className="n">{nb} j</span></div>
      <div className="bt-pl-sp-list" data-guide="bureau-stat.liste">{c.renderRelanceRows(() => c.setStatPanel(null))}</div>
      <div className="bt-pl-sp-foot">Journées planifiées sans heures envoyées (ce mois-ci et le mois dernier, sauf mois clôturé).</div>
    </div>
  );
}

export function Bandeau({ c, chiffres, deplie, poser }: { c: PlanningCtx; chiffres: Chiffres; deplie: boolean; poser: (v: boolean) => void }) {
  const sem = c.weekDays.map((d) => format(d, 'yyyy-MM-dd'));
  const indexAuj = sem.indexOf(c.todayStr);
  const hauteurs = hauteursBarres(chiffres.jours);
  const vivants = Array.from(c.livePlaces.values()).filter((l) => c.displayWorkers.some((w) => w.id === l.user_id));
  const nomDe = (id: string) => c.displayWorkers.find((w) => w.id === id)?.first_name || '';
  const absents = c.displayWorkers.filter((w) => c.todayAbsence.has(w.id));
  const nb = c.cockpitStats.waiting;
  const docs = c.cockpitStats.docs;
  const chantiersAvecPieces = Array.from(c.docsByWorksite.values()).filter((n) => n > 0).length;
  const noms = chiffres.relances.filter((r) => r.days.length > 0).map((r) => `${prenom(r.name)} ${r.days.length}`).join(', ');
  const ouvrirRelance = () => c.setStatPanel((p: string | null) => (p === 'waiting' ? null : 'waiting'));
  const titreRelance = `${nb} journée${nb > 1 ? 's' : ''} planifiée${nb > 1 ? 's' : ''} non envoyée${nb > 1 ? 's' : ''} en ${c.monthLabel} — cliquez pour savoir qui`;

  if (!deplie) {
    // Tout à 0 : pas de bandeau ; on peut quand même déplier les chiffres par le lien de la barre de semaine.
    if (nb === 0 && vivants.length === 0) return null;
    return (
      <section className="dzp-replie" aria-label="Chiffres de la semaine" data-testid="bandeau-replie">
        {nb > 0 && (
          <div className="dzp-relatif dzp-replie__rel">
            <button type="button" className="dzp-replie__item" data-ton="rouge" aria-expanded={c.statPanel === 'waiting'} data-testid="stat-waiting" data-guide="bureau-stat.relance" title={titreRelance} onClick={ouvrirRelance}>
              <span className="dzp-point" data-ton="rouge" aria-hidden="true" /><b>{nb} {pluriel(nb, 'journée')} à relancer</b>{noms && <span className="dzp-replie__noms">{noms}</span>}
            </button>
            {c.statPanel === 'waiting' && <PanneauRelance c={c} nb={nb} />}
          </div>
        )}
        {nb > 0 && vivants.length > 0 && <span className="dzp-replie__sep" aria-hidden="true" />}
        {vivants.length > 0 && (
          <span className="dzp-replie__item" data-ton="vert" data-testid="stat-direct" title={vivants.map((l) => `${nomDe(l.user_id)}${l.worksite_id && c.worksiteNameById.get(l.worksite_id) ? ` · ${c.worksiteNameById.get(l.worksite_id)}` : ''} depuis ${l.since}`).join(', ')}>
            <span className="dzp-point" aria-hidden="true" /><b>{vivants.length} {vivants.length > 1 ? 'pointent' : 'pointe'} en ce moment</b>
          </span>
        )}
        <button type="button" className="dzp-deplier" onClick={() => poser(true)} aria-expanded={false}>Déplier ▾</button>
        {c.statPanel && <div className="dzp-fond-menu" onClick={() => c.setStatPanel(null)} />}
      </section>
    );
  }

  return (
    <section className="dzp-bandeau" aria-label="Chiffres de la semaine" data-testid="bandeau">
      <div className="dzp-tuile dzp-tuile--sombre" data-testid="stat-heures">
        <div className="dzp-total">
          <span className="dzp-tuile__k">Heures envoyées</span>
          <b className="dzp-total__n">{dureeFr(chiffres.envoyees)}</b>
          {chiffres.envoyees + chiffres.aVenir > 0 && <span className="dzp-total__s">sur {dureeFr(chiffres.envoyees + chiffres.aVenir)} prévues</span>}
        </div>
        <div className="dzp-barres" aria-hidden="true">
          {chiffres.jours.map((m, i) => (
            <div key={sem[i]} className="dzp-barre" data-auj={i === indexAuj ? '' : undefined}>
              <div className="dzp-barre__fond"><div className="dzp-barre__b" style={{ height: `${hauteurs[i]}%` }} /></div>
              <span className="dzp-barre__l">{LETTRES[i]}</span>
            </div>
          ))}
        </div>
      </div>

      {nb > 0 && (
        <div className="dzp-relatif">
          <button type="button" className="dzp-tuile dzp-tuile--relance" aria-expanded={c.statPanel === 'waiting'} data-testid="stat-waiting" data-guide="bureau-stat.relance" title={titreRelance} onClick={ouvrirRelance}>
            <span className="dzp-tuile__k">À relancer</span>
            <span className="dzp-tuile__v"><b>{nb}</b> {pluriel(nb, 'journée')}</span>
            <span className="dzp-tuile__liste">
              {chiffres.relances.filter((r) => r.days.length > 0).slice(0, 4).map((r) => (
                <span key={r.id}><b>{prenom(r.name)}</b> {r.days.slice(0, 3).map(jourCourt).join(', ')}{r.days.length > 3 ? '…' : ''}</span>
              ))}
            </span>
          </button>
          {c.statPanel === 'waiting' && <PanneauRelance c={c} nb={nb} />}
        </div>
      )}

      {vivants.length > 0 && (
        <div className="dzp-tuile dzp-tuile--direct" data-testid="stat-direct">
          <span className="dzp-tuile__k">En direct</span>
          <span className="dzp-tuile__v"><span className="dzp-point" aria-hidden="true" /><b>{vivants.length}</b> {vivants.length > 1 ? 'pointent' : 'pointe'}</span>
          <span className="dzp-tuile__liste">
            {vivants.slice(0, 4).map((l) => <span key={l.user_id}><b>{nomDe(l.user_id)}</b>{l.worksite_id && c.worksiteNameById.get(l.worksite_id) ? ` · ${c.worksiteNameById.get(l.worksite_id)}` : ''} depuis {l.since}</span>)}
          </span>
        </div>
      )}

      {absents.length > 0 && (
        <div className="dzp-tuile" data-testid="stat-absents">
          <span className="dzp-tuile__k">Absents aujourd&apos;hui</span>
          <span className="dzp-tuile__v"><b>{absents.length}</b> sur {c.displayWorkers.length}</span>
          <span className="dzp-tuile__liste">{absents.slice(0, 3).map((w) => <span key={w.id}><b>{w.first_name}</b> · {LIB_ABS[c.todayAbsence.get(w.id) || ''] || c.todayAbsence.get(w.id)}</span>)}</span>
        </div>
      )}

      {docs > 0 && (
        <div className="dzp-relatif">
          <button type="button" className="dzp-tuile" aria-expanded={c.statPanel === 'docs'} data-testid="stat-docs"
            title={`${docs} pièce(s) jointe(s) — cliquez pour voir lesquelles, et sur quel chantier`}
            onClick={() => c.setStatPanel((p: string | null) => (p === 'docs' ? null : 'docs'))}>
            <span className="dzp-tuile__k">Pièces</span>
            <span className="dzp-tuile__v"><b>{docs}</b> {pluriel(docs, 'document')}</span>
            <span className="dzp-tuile__liste"><span>sur {chantiersAvecPieces} {pluriel(chantiersAvecPieces, 'chantier')}</span></span>
          </button>
          {c.statPanel === 'docs' && (
            <div className="dzp-panneau-stat">
              <div className="bt-pl-sp-h">Pièces jointes <span className="n">{docs}</span></div>
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
      )}
      <button type="button" className="dzp-replier" onClick={() => poser(false)} aria-expanded={true}>Replier ▴</button>
      {c.statPanel && <div className="dzp-fond-menu" onClick={() => c.setStatPanel(null)} />}
    </section>
  );
}

const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
/** « mar. 13 » (sans dépendance de langue : la date est une chaîne AAAA-MM-JJ). */
function jourCourt(d: string): string {
  const x = parseISO(d);
  return `${JOURS[x.getDay()]} ${x.getDate()}`;
}
