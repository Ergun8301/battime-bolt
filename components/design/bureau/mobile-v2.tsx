'use client';

// Design du bureau (v2) · téléphone et tablette (< 1 024 px) : un jour à la fois. En-tête noir (entreprise, essai + S'abonner, ✦, ☰), semaine ← →, 7 jours,
// compteurs (à relancer, en direct, absent), une carte par salarié. Le menu ☰ est le point d'entrée unique (menu-mobile-v2.tsx).
import { addDays, format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { closedFor } from '@/lib/worker-closure';
import { ReunionV2, TachesV2 } from './missions-v2';
import { hashStr } from '@/components/planning-bubble';
import { CarteBulle, type DonneesBulle } from './bulle-v2';
import { periodeSemaine } from './barres-v2';
import type { PlanningCtx } from './contexte-v2';

const LIB_ABS: Record<string, string> = { conge: 'Congé', maladie: 'Arrêt maladie', intemperie: 'Intempérie', repos: 'Repos' };

export function Mobile({ c }: { c: PlanningCtx }) {
  const jour = c.weekDays[c.mobileDayIdx];
  const d = format(jour, 'yyyy-MM-dd');
  const sem = format(c.currentWeekStart, 'I');
  const { trial } = c;
  const clos = c.closedMonths.has(d.slice(0, 7));
  const vivants = Array.from(c.livePlaces.values()).filter((l) => c.workers.some((w) => w.id === l.user_id)).length;
  const absents = c.workers.filter((w) => c.todayAbsence.has(w.id)).length;
  const badgeMenu = c.pendingLeaves + c.pendingInvites + c.openReserves;
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
          {c.aiOn && c.isAdmin && <button type="button" className="dzp-m-rond" data-ton="jaune" aria-label="Assistant BEMEXO" title="Assistant BEMEXO" onClick={() => c.setAssistantOpen(true)} data-testid="m-assistant" data-guide="bureau-nav.assistant">✦</button>}
          <button type="button" className="dzp-m-rond" aria-label="Menu" title="Menu" onClick={() => c.setMobileMenuOpen(true)} data-guide="bureau-nav.menu">
            ☰{badgeMenu > 0 && <span className="dzp-m-badge">{badgeMenu}</span>}
          </button>
        </div>
        <div className="dzp-m-ligne" data-guide="bureau-semaine.nav">
          <button type="button" className="dzp-m-rond" data-ton="fleche" aria-label="Semaine précédente" onClick={() => c.changeWeek(addDays(c.currentWeekStart, -7))}>←</button>
          <div className="dzp-m-sem"><b>S-{sem}</b><span>{periodeSemaine(c.currentWeekStart)}</span></div>
          <button type="button" className="dzp-m-rond" data-ton="fleche" aria-label="Semaine suivante" onClick={() => c.changeWeek(addDays(c.currentWeekStart, 7))}>→</button>
        </div>
        <div className="dzp-m-jours" role="group" aria-label="Jour affiché">
          {c.weekDays.map((day, i) => {
            const ds = format(day, 'yyyy-MM-dd');
            const nom = format(day, 'EEE', { locale: fr }).replace('.', '');
            return (
              <button key={ds} type="button" className="dzp-m-jour" aria-pressed={i === c.mobileDayIdx} data-auj={ds === c.todayStr ? '' : undefined} data-clos={c.closedMonths.has(ds.slice(0, 7)) ? '' : undefined} onClick={() => c.setMobileDayIdx(i)}>
                <span>{nom.charAt(0).toUpperCase() + nom.slice(1)}</span><span>{format(day, 'd')}</span>
              </button>
            );
          })}
        </div>
      </header>

      <div className="dzp-m-corps">
        <div className="dzp-m-compteurs">
          <button type="button" className="dzp-m-compteur" data-ton={c.cockpitStats.waiting > 0 ? 'relance' : undefined} data-testid="m-stat-waiting" data-guide="bureau-stat.relance" onClick={c.openRelance}
            title={c.cockpitStats.waiting === 0 ? `Tout est envoyé en ${c.monthLabel}` : `${c.cockpitStats.waiting} journée(s) planifiée(s) non envoyée(s) en ${c.monthLabel}`}><b>{c.cockpitStats.waiting}</b> à relancer</button>
          <span className="dzp-m-compteur" data-ton={vivants > 0 ? 'direct' : undefined} data-testid="m-stat-direct"><b>{vivants}</b> en direct</span>
          <span className="dzp-m-compteur" data-testid="m-stat-docs" title={`${c.cockpitStats.docs} pièce(s) jointe(s)`}><b>{absents}</b> absent{absents > 1 ? 's' : ''}</span>
        </div>
        <span className="dzp-m-titre-jour">{format(jour, 'EEEE d MMMM', { locale: fr })}{clos ? ' · CLOS' : ''}</span>
        {c.workers.length > 0 && !c.selectMode && c.copyTipMobile}
        {c.workers.length > 0 && !c.selectMode && (
          <div className="dzp-m-outils">
            {c.copyTipHelpMobile}
            <button type="button" className="dzp-pilule" onClick={c.enterSelect} data-testid="m-select">Sélectionner</button>
          </div>
        )}
        {c.workers.length === 0 ? (
          <div className="dzp-m-noadd" data-testid="m-vide">Aucun salarié. Ajoutez le premier avec le bouton « Salariés » du menu ☰.</div>
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
              const anyReal = chantiers.some((p) => c.realForPlanning(p));
              const fermee = clos || !!closedFor(c.workerClosures, worker.id, d);
              const chips = (meets.length > 0 || tasks.length > 0) ? (
                <>
                  {meets.map((m) => <ReunionV2 key={m.id} m={m} grande inert={c.selectMode} onOpen={() => c.openMeeting(m, worker.id)} />)}
                  {tasks.length > 0 && <TachesV2 tasks={tasks} inert={c.selectMode} onOpen={() => c.openTasks(worker.id, d, !!absence)} />}
                </>
              ) : null;
              return (
                <div key={worker.id} className="dzp-m-carte" data-live={live ? '1' : undefined}>
                  <button type="button" className="dzp-m-haut" data-guide="bureau-planning.nom"
                    onClick={() => (c.selectMode ? c.toggleGroup(c.selectableIn((p: { user_id: string; work_date: string }) => p.user_id === worker.id && p.work_date === d)) : c.setStatusTarget({ worker, fromStr: d }))}
                    title={c.selectMode ? 'Cocher ses interventions du jour' : 'Présence, absence ou fiche'}>
                    <span className="dzp-avatar" data-teinte={absence ? 'absent' : hashStr(worker.id) % 8}>{worker.photo_url ? <img src={worker.photo_url} alt="" /> : <>{worker.first_name?.[0] || ''}{worker.last_name?.[0] || ''}</>}</span>
                    <span className="dzp-nom-txt">
                      <span className="dzp-nom">{nomComplet}</span>
                      <span className="dzp-nom-etat">
                        {worker.role === 'lead' && <span className="dzp-chef">CHEF</span>}
                        {manque.length > 0 && <span className="dzp-etat" data-ton="attente">{manque.length} jour{manque.length > 1 ? 's' : ''} en attente</span>}
                      </span>
                    </span>
                    {absence ? <span className="dzp-m-statut">{(LIB_ABS[absence.absence_type as string] || '').toUpperCase()}</span>
                      : live ? <span className="dzp-m-statut" data-ton="direct" data-testid="m-badge-live">EN COURS</span>
                      : anyReal ? <span className="dzp-m-statut" data-testid="m-badge-sent">ENVOYÉ</span> : null}
                  </button>
                  {absence && (
                    <div className="dzp-m-absence" data-type={absence.absence_type}><b>{(LIB_ABS[absence.absence_type as string] || '').toUpperCase()}</b>{absence.notes || ''}</div>
                  )}
                  {absence && (liveChip || chips) && <div className="dzp-m-cartes">{liveChip}{chips}</div>}
                  {!absence && (
                    <>
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
                      {extra.map((x, i) => (
                        <button key={`x${i}`} type="button" className="dzp-hors" data-guide={x.worksiteId ? undefined : 'bureau-planning.autre'}
                          onClick={() => (c.selectMode ? toast('Heures ajoutées par le salarié — non supprimable') : c.setExtraTarget({ userId: worker.id, dateStr: d, worksiteId: x.worksiteId, name: x.name, minutes: x.minutes }))}>
                          {`+${Math.floor(x.minutes / 60)}:${String(x.minutes % 60).padStart(2, '0')} h sur ${x.name} · ${x.pending ? 'saisi, à envoyer' : 'ajouté par le salarié'}`}
                        </button>
                      ))}
                      {liveChip}{chips}
                      {fermee ? <span className="dzp-m-noadd">Mois clôturé : pas d&apos;ajout.</span> : (
                        <div className="dzp-m-ajout">
                          <button type="button" onClick={() => c.openAdd(worker.id, d)} data-guide="bureau-planning.ajouter">+ Ajouter un chantier</button>
                          {chantiers.length > 0 && c.missions.tasksOn && !c.selectMode && (
                            <button type="button" data-testid="m-add-task" aria-label={`Ajouter une tâche à ${nomComplet}`} onClick={() => c.openTaskAdd(worker.id, d)}>+ Tâche</button>
                          )}
                        </div>
                      )}
                    </>
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

