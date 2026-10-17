'use client';

// Design du bureau (v2b) · téléphone et tablette (< 1 024 px) : un jour à la fois, tout sombre. En-tête (logo, ✦, « Menu »), « Jeudi 15 octobre » + semaine ‹ ›,
// bande de 7 jours (rond jaune = aujourd'hui, point rouge = heures à envoyer ce jour-là), carte rouge « N journées à relancer › », puis la liste par salarié
// (ordre actuel) avec les bulles en grand (mêmes couleurs d'état). Le menu ☰ « Menu » reste le point d'entrée unique (menu-mobile-v2.tsx).
import { addDays, format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { closedFor } from '@/lib/worker-closure';
import { ReunionV2, TachesV2 } from './missions-v2';
import { CarteBulle, type DonneesBulle } from './bulle-v2';
import { HorsPlanning } from './grille-v2';
import type { PlanningCtx } from './contexte-v2';

const LIB_ABS: Record<string, string> = { conge: 'Congé', maladie: 'Maladie', intemperie: 'Intempérie', repos: 'Repos' };

export function Mobile({ c }: { c: PlanningCtx }) {
  const jour = c.weekDays[c.mobileDayIdx];
  const d = format(jour, 'yyyy-MM-dd');
  const sem = format(c.currentWeekStart, 'I');
  const { trial } = c;
  const clos = c.closedMonths.has(d.slice(0, 7));
  const vivants = Array.from(c.livePlaces.values()).filter((l) => c.workers.some((w) => w.id === l.user_id)).length;
  const badgeMenu = c.pendingLeaves + c.pendingInvites + c.openReserves;
  const nb = c.cockpitStats.waiting;
  const titreJour = format(jour, 'EEEE d MMMM', { locale: fr });
  // Point rouge sous un jour : un salarié de la liste a ce jour-là en attente (mêmes données que la pastille des lignes).
  const enAttente = new Set<string>();
  for (const w of c.workers) for (const x of c.missingEffective.get(w.id) || []) enAttente.add(x);
  return (
    <div className="dzp-mobile" data-testid="planning-mobile">
      <header className="dzp-m-tete">
        <div className="dzp-m-ligne">
          <div className="dzp-m-id">
            <span className="dzp-logo">BEME<b>X</b>O</span>
            <span className="dzp-m-co">
              {c.companyLabel}
              {trial?.inTrial && !trial.expired && trial.daysLeft !== null && <> · essai {trial.daysLeft} j · <button type="button" onClick={c.onSubscribe} data-guide="bureau-nav.abonner">S&apos;abonner</button></>}
              {trial?.inTrial && trial.expired && <> · essai terminé · <button type="button" onClick={c.onSubscribe} data-guide="bureau-nav.abonner">S&apos;abonner</button></>}
            </span>
          </div>
          {c.aiOn && c.isAdmin && <button type="button" className="dzp-m-rond" aria-label="Assistant BEMEXO" title="Assistant BEMEXO" onClick={() => c.setAssistantOpen(true)} data-testid="m-assistant" data-guide="bureau-nav.assistant">✦</button>}
          <button type="button" className="dzp-m-menu" aria-label="Menu" title="Menu" onClick={() => c.setMobileMenuOpen(true)} data-guide="bureau-nav.menu">
            Menu{badgeMenu > 0 && <span className="dzp-m-badge">{badgeMenu}</span>}
          </button>
        </div>
        <div className="dzp-m-ligne" data-guide="bureau-semaine.nav">
          <span className="dzp-m-jourtitre">{titreJour.charAt(0).toUpperCase() + titreJour.slice(1)}{clos ? ' · clôturé' : ''}</span>
          <button type="button" className="dzp-m-fleche" aria-label="Semaine précédente" onClick={() => c.changeWeek(addDays(c.currentWeekStart, -7))}>‹</button>
          <span className="dzp-m-sem">Semaine {sem}</span>
          <button type="button" className="dzp-m-fleche" aria-label="Semaine suivante" onClick={() => c.changeWeek(addDays(c.currentWeekStart, 7))}>›</button>
        </div>
        <div className="dzp-m-jours" role="group" aria-label="Jour affiché">
          {c.weekDays.map((day, i) => {
            const ds = format(day, 'yyyy-MM-dd');
            const nom = format(day, 'EEEEE', { locale: fr }).toUpperCase();
            return (
              <button key={ds} type="button" className="dzp-m-jour" aria-pressed={i === c.mobileDayIdx} aria-label={format(day, 'EEEE d', { locale: fr })} data-auj={ds === c.todayStr ? '' : undefined}
                data-clos={c.closedMonths.has(ds.slice(0, 7)) ? '' : undefined} onClick={() => c.setMobileDayIdx(i)}>
                <span>{nom}</span><span className="dzp-m-jour__n">{format(day, 'd')}</span>
                <i className="dzp-m-jour__point" data-on={enAttente.has(ds) ? '' : undefined} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </header>

      <div className="dzp-m-corps">
        {nb > 0 && (
          <button type="button" className="dzp-m-relance" data-testid="m-stat-waiting" data-guide="bureau-stat.relance" onClick={c.openRelance}
            title={`${nb} journée(s) planifiée(s) non envoyée(s) en ${c.monthLabel}`}><span>{nb} journée{nb > 1 ? 's' : ''} à relancer</span><span aria-hidden="true">›</span></button>
        )}
        {vivants > 0 && <span className="dzp-m-direct" data-testid="m-stat-direct"><span className="dzp-point" aria-hidden="true" />{vivants} {vivants > 1 ? 'pointent' : 'pointe'} en ce moment</span>}
        {c.workers.length > 0 && !c.selectMode && c.copyTipMobile}
        {c.workers.length > 0 && !c.selectMode && (
          <div className="dzp-m-outils">
            {c.copyTipHelpMobile}
            <button type="button" className="dzp-m-bouton" onClick={c.enterSelect} data-testid="m-select">Sélectionner</button>
          </div>
        )}
        {c.workers.length === 0 ? (
          <div className="dzp-m-noadd" data-testid="m-vide">Aucun salarié. Ajoutez le premier avec « Salariés » dans le Menu.</div>
        ) : (
          <div className="dzp-m-cartes">
            {c.workers.map((worker) => {
              const absence = c.absenceForDay(worker.id, d);
              const chantiers = c.cellChantiers(worker.id, d) as import('@/lib/types').PlanningWithWorksite[];
              const extra = c.extraDeclaredForCell(worker.id, d) as { worksiteId: string | null; name: string; minutes: number; pending: boolean }[];
              const live = !!c.liveForCell(worker.id, d);
              const liveChip = c.liveChipFor(worker.id, d);
              const meets = c.cells.meetings(worker.id, d);
              const tasks = c.cells.tasks(worker.id, d);
              const manque = (c.missingEffective.get(worker.id) || []);
              const nomComplet = `${worker.first_name} ${worker.last_name}`;
              const fermee = clos || !!closedFor(c.workerClosures, worker.id, d);
              const rien = !absence && chantiers.length === 0 && extra.length === 0 && !liveChip && meets.length === 0 && tasks.length === 0;
              const chips = (meets.length > 0 || tasks.length > 0) ? (
                <>
                  {meets.map((m) => <ReunionV2 key={m.id} m={m} grande inert={c.selectMode} onOpen={() => c.openMeeting(m, worker.id)} />)}
                  {tasks.length > 0 && <TachesV2 tasks={tasks} inert={c.selectMode} onOpen={() => c.openTasks(worker.id, d, !!absence)} />}
                </>
              ) : null;
              return (
                <div key={worker.id} className="dzp-m-carte" data-live={live ? '1' : undefined}>
                  <div className="dzp-m-haut">
                    <button type="button" className="dzp-m-nom" data-guide="bureau-planning.nom"
                      onClick={() => (c.selectMode ? c.toggleGroup(c.selectableIn((p: { user_id: string; work_date: string }) => p.user_id === worker.id && p.work_date === d)) : c.setStatusTarget({ worker, fromStr: d }))}
                      title={c.selectMode ? 'Cocher ses interventions du jour' : 'Présence, absence ou fiche'}>
                      <span className="dzp-nom">{nomComplet}</span>
                      {manque.length > 0 && <span className="dzp-pastille-rouge" role="img" aria-label={`${manque.length} jour${manque.length > 1 ? 's' : ''} en attente`}>{manque.length}</span>}
                    </button>
                    {!absence && !fermee && !c.selectMode && (
                      <>
                        {chantiers.length > 0 && c.missions.tasksOn && (
                          <button type="button" className="dzp-m-plus" data-ton="tache" data-testid="m-add-task" aria-label={`Ajouter une tâche à ${nomComplet}`} title="Ajouter une tâche" onClick={() => c.openTaskAdd(worker.id, d)}>☐</button>
                        )}
                        <button type="button" className="dzp-m-plus" onClick={() => c.openAdd(worker.id, d)} data-guide="bureau-planning.ajouter" aria-label={`Ajouter un chantier à ${nomComplet}`} title="Ajouter un chantier">+</button>
                      </>
                    )}
                  </div>
                  {absence && <div className="dzp-m-absence" data-type={absence.absence_type}><b>{LIB_ABS[absence.absence_type as string] || absence.absence_type}</b>{absence.notes ? <span>{absence.notes}</span> : null}</div>}
                  {absence && (liveChip || chips) && <div className="dzp-m-liste">{liveChip}{chips}</div>}
                  {!absence && (
                    <div className="dzp-m-liste">
                      {chantiers.map((p) => {
                        const sel = c.selFor(p);
                        const real = c.realForPlanning(p); const draft = c.draftForPlanning(p);
                        const data: DonneesBulle = { p, real, draft, docs: c.docsByWorksite.get(p.worksite_id || '') || 0, live: c.liveForBubble(p), withdrawn: c.withdrawnIds.has(p.id), enRetard: !real && !draft && !c.withdrawnIds.has(p.id) && manque.includes(d) };
                        const act = () => (sel ? c.toggleOne(p, sel.lock) : c.openEdit(p));
                        return (
                          <div key={p.id} className="dzp-m-bulle dzp-bulle-wrap" role="button" tabIndex={0} data-guide="bureau-planning.bulle" data-sel={sel ? (sel.lock ? 'lock' : sel.on ? 'on' : 'off') : undefined} data-pid={sel ? p.id : undefined}
                            onClick={act} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } }}>
                            <CarteBulle d={data} sel={sel} grand />
                          </div>
                        );
                      })}
                      {extra.map((x, i) => <HorsPlanning key={`x${i}`} c={c} worker={worker} d={d} x={x} grand />)}
                      {liveChip}{chips}
                      {rien && <span className="dzp-m-rien">{fermee ? 'Mois clôturé : pas d’ajout' : 'Rien de prévu'}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
