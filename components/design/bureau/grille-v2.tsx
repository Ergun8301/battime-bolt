'use client';

// Design du bureau (v2) · la grille de la semaine : en-têtes de jour (total d'heures du jour, CLOS), lignes de salariés (jauge, état), cases, absences.
// Mêmes gestes que la grille d'avant : cliquer une case ajoute, une bulle s'ouvre, on glisse / copie (Ctrl, Alt, ⌘), on coche en mode « Sélectionner ».
// Les lignes vides sous le dernier salarié n'existent plus (décision validée dans le README).
import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import type { User } from '@/lib/types';
import { closedFor } from '@/lib/worker-closure';
import { hm, plageAbsence, pourcentJauge, type TotauxSemaine } from '@/supabase/functions/_shared/bureau-vue';
import { ReunionV2, TachesV2 } from './missions-v2';
import { hashStr } from '@/components/planning-bubble';
import { BulleV2, type DonneesBulle } from './bulle-v2';
import type { PlanningCtx } from './contexte-v2';

const LIB_ABS: Record<string, string> = { conge: 'Congé', maladie: 'Arrêt maladie', intemperie: 'Intempérie', repos: 'Repos' };
const LIB_ABS_COURT: Record<string, string> = { conge: 'congé', maladie: 'arrêt maladie', intemperie: 'intempérie', repos: 'repos' };
const COURT: Record<string, string> = { absent: 'absent ce jour-là', month_closed: 'mois clôturé', worker_closed: 'heures clôturées', duplicate: 'déjà prévu dans cette case', overlap: 'chevauche un horaire prévu' };

/** Pourquoi la case visée refuse ce qu'on tient (null = elle l'accepte). Les règles sont celles du dépôt (copyRefusal, targetRefusal, moveLock), lues à l'écran avant le lâcher. */
export function raisonDeRefus(c: PlanningCtx, w: string, d: string): string | null {
  const drag = c.activeDrag;
  if (!drag) return null;
  const absent = !!c.absenceForDay(w, d);
  const mois = c.closedMonths.has(d.slice(0, 7));
  const salarie = !!closedFor(c.workerClosures, w, d);
  const cible = absent ? COURT.absent : mois ? COURT.month_closed : salarie ? COURT.worker_closed : null;
  if (drag.type === 'new') return cible;
  const src = c.planning.find((p) => p.id === drag.id);
  if (!src) return null;
  if (c.copying) { const r = c.copyRefusalAt(src, w, d); return r ? (COURT[r.code as string] || 'refusé') : null; }
  if (src.user_id === w && src.work_date === d) return null;
  const lock: string | null = c.moveLock(src);
  if (lock) return lock.replace(/ — non déplaçable$/, '').replace(/^./, (x) => x.toLowerCase());
  return cible;
}

function CaseDrop({ c, w, d, auj, live, clos, children }: { c: PlanningCtx; w: string; d: string; auj: boolean; live: boolean; clos: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${w}|${d}` });
  const refus = isOver ? raisonDeRefus(c, w, d) : null;
  const libelle = c.activeDrag?.type === 'new' ? 'Déposer ici · sans horaire' : null;
  return (
    <td ref={setNodeRef} className="dzp-td" data-auj={auj ? '' : undefined} data-live={live ? '1' : undefined} data-clos={clos ? '' : undefined} data-cible={isOver ? (refus ? 'refus' : 'ok') : undefined}>
      {isOver && (refus
        ? <span className="dzp-cible-msg" data-refus="">Refusé : {refus}</span>
        : <span className="dzp-cible-msg">{libelle ? <><span className="mv">{libelle}</span><span className="cp">Copier ici</span></> : <><span className="mv">Déposer ici</span><span className="cp">Copier ici</span></>}</span>)}
      {children}
    </td>
  );
}

function sousJour(date: string, c: PlanningCtx, t: TotauxSemaine, i: number): string {
  const m = t.jours[i];
  const n = date === c.todayStr ? c.livePlaces.size : 0;
  const base = m > 0 ? `${hm(m)} h` : '—';
  return n > 0 ? `${base} · ${n} en direct` : base;
}

function nomAbsence(c: PlanningCtx, worker: User, date: string) {
  const a = c.absenceForDay(worker.id, date);
  if (!a) return null;
  const type = a.absence_type as string;
  const plage = plageAbsence(date, (x) => { const r = c.absenceForDay(worker.id, x); return r ? (r.absence_type as string) : null; });
  const memeMois = plage.du.slice(0, 7) === plage.au.slice(0, 7);
  const jour = (x: string) => format(parseISO(x), memeMois ? 'd' : 'd MMM', { locale: fr });
  const sous = plage.jours > 1 ? `du ${jour(plage.du)} au ${jour(plage.au)}` : (a.notes || '');
  return { type, libelle: LIB_ABS[type] || type, sous };
}

export function Grille({ c, totaux }: { c: PlanningCtx; totaux: TotauxSemaine }) {
  const dates = c.weekDays.map((d) => format(d, 'yyyy-MM-dd'));
  const toutCoche = (ids: string[]) => ids.length > 0 && ids.every((id) => c.selOn.has(id));
  return (
    <div className="dzp-defile">
      <table className="dzp-table" data-testid="grille">
        <colgroup><col /><col /><col /><col /><col /><col /><col /><col /></colgroup>
        <thead>
          <tr>
            <th className="dzp-th-nom" scope="col">Salarié · heures S-{format(c.currentWeekStart, 'I')}</th>
            {c.weekDays.map((day, i) => {
              const d = dates[i];
              const auj = d === c.todayStr;
              const clos = c.closedMonths.has(d.slice(0, 7));
              const ids: string[] = c.selectMode ? c.selectableIn((p: { work_date: string; user_id: string }) => p.work_date === d && c.displayWorkers.some((w) => w.id === p.user_id)) : [];
              const nom = format(day, 'EEE', { locale: fr }).replace('.', '');
              return (
                <th key={d} className="dzp-th-jour" scope="col" data-auj={auj ? '' : undefined} data-clos={clos ? '' : undefined}>
                  <div className="dzp-jour">
                    {c.selectMode && (
                      <button type="button" className="dzp-case-sel" data-on={toutCoche(ids) ? '' : undefined} data-testid="sel-day" title="Cocher toute cette journée" aria-label={`Cocher toute la journée du ${format(day, 'EEEE d', { locale: fr })}`}
                        onClick={() => c.toggleGroup(ids)}>{toutCoche(ids) ? '✓' : ''}</button>
                    )}
                    <span className="dzp-jour__l">{nom.charAt(0).toUpperCase() + nom.slice(1)}</span><span className="dzp-jour__n">{format(day, 'd')}</span>
                    {auj && <span className="dzp-etiq">AUJ.</span>}
                    {clos && <span className="dzp-etiq" data-clos="" title="Mois clôturé">CLOS</span>}
                  </div>
                  <span className="dzp-jour__sub">{clos && totaux.jours[i] === 0 ? 'CLOS' : sousJour(d, c, totaux, i)}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {c.displayWorkers.map((worker) => <Ligne key={worker.id} c={c} worker={worker} dates={dates} totaux={totaux} />)}
        </tbody>
      </table>
    </div>
  );
}

const TEINTES = 8;
function Ligne({ c, worker, dates, totaux }: { c: PlanningCtx; worker: User; dates: string[]; totaux: TotauxSemaine }) {
  const absAuj = c.todayAbsence.get(worker.id);
  const manque = (c.missingEffective.get(worker.id) || []).length;
  const nomComplet = `${worker.first_name} ${worker.last_name}`;
  const t = totaux.parSalarie[worker.id] || { envoyees: 0, prevues: 0 };
  const idsLigne: string[] = c.selectMode ? c.selectableIn((p: { user_id: string }) => p.user_id === worker.id) : [];
  const coche = idsLigne.length > 0 && idsLigne.every((id) => c.selOn.has(id));
  const heures = t.envoyees === 0 && t.prevues === 0 && absAuj ? `0:00 h · ${LIB_ABS_COURT[absAuj] || absAuj}` : `${hm(t.envoyees)} h envoyées${t.prevues > 0 ? ` · +${hm(t.prevues)} prévues` : ''}`;
  return (
    <tr>
      <td className="dzp-td-nom">
        <div className="dzp-nom-haut">
          {c.selectMode && (
            <button type="button" className="dzp-case-sel" data-on={coche ? '' : undefined} title="Cocher toute sa semaine" aria-label={`Cocher toute la semaine de ${nomComplet}`} onClick={() => c.toggleGroup(idsLigne)}>{coche ? '✓' : ''}</button>
          )}
          <button type="button" className="dzp-nom-btn" data-guide="bureau-planning.nom" onClick={() => (c.selectMode ? c.toggleGroup(idsLigne) : c.setStatusTarget({ worker, fromStr: c.todayStr }))}
            title={c.selectMode ? 'Cocher toute sa semaine' : 'Cliquer pour le statut / la disponibilité'}>
            <span className="dzp-nom-haut">
              <span className="dzp-avatar" data-teinte={absAuj ? 'absent' : hashStr(worker.id) % TEINTES}>{worker.photo_url ? <img src={worker.photo_url} alt="" /> : <>{worker.first_name?.[0] || ''}{worker.last_name?.[0] || ''}</>}</span>
              <span className="dzp-nom-txt">
                <span className="dzp-nom">{nomComplet}</span>
                <span className="dzp-nom-etat">
                  {worker.role === 'lead' && <span className="dzp-chef">CHEF</span>}
                  {manque > 0
                    ? <span className="dzp-etat" data-ton="attente" data-testid="row-waiting" data-days={manque}>{manque} jour{manque > 1 ? 's' : ''} en attente</span>
                    : <span className="dzp-etat">À jour</span>}
                </span>
              </span>
            </span>
          </button>
        </div>
        <div className="dzp-heures">
          <div className="dzp-jauge" aria-hidden="true"><span style={{ width: `${pourcentJauge(t.envoyees, t.prevues)}%` }} /></div>
          <span className="dzp-heures__t">{heures}</span>
        </div>
      </td>
      {dates.map((d, i) => <Cellule key={d} c={c} worker={worker} d={d} jour={c.weekDays[i]} />)}
    </tr>
  );
}

function Cellule({ c, worker, d, jour }: { c: PlanningCtx; worker: User; d: string; jour: Date }) {
  const absence = c.absenceForDay(worker.id, d);
  const chantiers = c.cellChantiers(worker.id, d) as import('@/lib/types').PlanningWithWorksite[];
  const extra = c.extraDeclaredForCell(worker.id, d) as { worksiteId: string | null; name: string; minutes: number; pending: boolean }[];
  const live = !!c.liveForCell(worker.id, d);
  const liveChip = c.liveChipFor(worker.id, d);
  const meets = c.cells.meetings(worker.id, d);
  const tasks = c.cells.tasks(worker.id, d);
  const clos = c.closedMonths.has(d.slice(0, 7)) || !!closedFor(c.workerClosures, worker.id, d);
  const manquants = c.missingEffective.get(worker.id) || [];
  const chips = (meets.length > 0 || tasks.length > 0) ? (
    <>
      {meets.map((m) => <ReunionV2 key={m.id} m={m} inert={c.selectMode} onOpen={() => c.openMeeting(m, worker.id)} />)}
      {tasks.length > 0 && <TachesV2 tasks={tasks} inert={c.selectMode} onOpen={() => c.openTasks(worker.id, d, !!absence)} />}
    </>
  ) : null;
  const nbElements = chantiers.length + extra.length + (liveChip ? 1 : 0) + (chips ? 1 : 0);
  const vide = nbElements === 0;
  const ferme = clos || c.selectMode;
  let corps: ReactNode;
  if (absence) {
    const a = nomAbsence(c, worker, d)!;
    corps = (
      <div className="dzp-case" data-ferme="">
        <button type="button" className="dzp-absence" data-type={a.type} data-testid="absence"
          onClick={() => (c.selectMode ? toast('Absence — à changer avec « Présent »') : c.setStatusTarget({ worker, fromStr: d }))}
          title={c.selectMode ? 'Absence — à changer avec « Présent » (non supprimable ici)' : 'Absence — cliquer pour changer le statut'}>
          {c.selectMode && <span className="dzp-case-sel" aria-hidden="true">–</span>}
          <b>{a.libelle}</b>{a.sous ? <span>{a.sous}</span> : null}
        </button>
        {liveChip}{chips}
      </div>
    );
  } else {
    corps = (
      <div className="dzp-case" data-ferme={ferme ? '' : undefined} data-guide={vide ? 'bureau-planning.case' : undefined}
        onClick={ferme ? undefined : () => c.openAdd(worker.id, d)} title={c.selectMode || clos ? undefined : 'Cliquer pour ajouter une intervention'}>
        {chantiers.map((p) => {
          const real = c.realForPlanning(p); const draft = c.draftForPlanning(p);
          const data: DonneesBulle = {
            p, real, draft, docs: c.docsByWorksite.get(p.worksite_id || '') || 0, live: c.liveForBubble(p), withdrawn: c.withdrawnIds.has(p.id),
            enRetard: !real && !draft && !c.withdrawnIds.has(p.id) && manquants.includes(d),
          };
          return <BulleV2 key={p.id} d={data} sel={c.selFor(p)} onEdit={c.openEdit} onToggle={c.toggleOne} />;
        })}
        {extra.map((x, i) => {
          const texte = `+${hm(x.minutes)} h sur ${x.name} · ${x.pending ? 'saisi, à envoyer' : 'ajouté par le salarié'}`;
          const puce = (
            <button key={`x${i}`} type="button" className="dzp-hors" data-guide={x.worksiteId ? undefined : 'bureau-planning.autre'}
              onClick={(e) => { e.stopPropagation(); if (c.selectMode) { toast('Heures ajoutées par le salarié — non supprimable'); return; } c.setExtraTarget({ userId: worker.id, dateStr: d, worksiteId: x.worksiteId, name: x.name, minutes: x.minutes }); }}
              title={c.selectMode ? 'Heures ajoutées par le salarié — non supprimable' : 'Ajouté par le salarié — cliquer pour les documents / attribuer un client'}>{texte}</button>
          );
          return c.selectMode ? <div key={`x${i}`} className="dzp-bulle-wrap" data-sel="lock">{puce}</div> : puce;
        })}
        {liveChip}{chips}
        {vide && (clos ? <div className="dzp-clos-txt">Mois clôturé</div> : <div className="dzp-vide" aria-hidden="true">+</div>)}
        {!vide && !ferme && nbElements < 3 && <button type="button" className="dzp-ajouter" onClick={(e) => { e.stopPropagation(); c.openAdd(worker.id, d); }} data-guide="bureau-planning.ajouter">+ ajouter</button>}
      </div>
    );
  }
  return <CaseDrop c={c} w={worker.id} d={d} auj={d === c.todayStr} live={live} clos={clos}>{corps}</CaseDrop>;
}

