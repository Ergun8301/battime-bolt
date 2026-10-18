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
import { dureePrevue, hm, plageAbsence, type TotauxSemaine } from '@/supabase/functions/_shared/bureau-vue';
import { ReunionV2, TachesV2 } from './missions-v2';
import { hashStr } from '@/components/planning-bubble';
import { BulleV2, Carte2a, duree2a, type DonneesBulle } from './bulle-v2';
import type { PlanningCtx } from './contexte-v2';

// Libellés des absences dans la case (planche 2a, `ABS`) : mono, capitales.
const LIB_ABS: Record<string, string> = { conge: 'CONGÉ', maladie: 'ABSENT · MALADIE', intemperie: 'INTEMPÉRIE', repos: 'REPOS' };
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

export function CaseDrop({ c, w, d, auj, live, clos, children }: { c: PlanningCtx; w: string; d: string; auj: boolean; live: boolean; clos: boolean; children: ReactNode }) {
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

/** Dégradés des jauges de jour (planche 2a, `grads`) : le jour i va de grads[i] à grads[i+1]. */
const DEGRADES = ['#FF4D8D', '#FF8A3D', '#FFC21A', '#9B6BFF', '#2F7BFF', '#2ED3A0', '#FF4D8D', '#FF8A3D'];
export const degradeJour = (i: number, angle = 90) => `linear-gradient(${angle}deg,${DEGRADES[i % 7]},${DEGRADES[(i % 7) + 1]})`;

/**
 * Charge d'un jour (planche 2a, `tot`) : heures envoyées + durée prévue des interventions qui n'ont encore aucune heure (mêmes exclusions que les totaux
 * de la semaine : absence, retirée, heures envoyées ou saisies). Lu sur ce que l'écran a déjà chargé, aucune requête.
 */
export function chargeJours(c: PlanningCtx, dates: string[], t: TotauxSemaine): number[] {
  const ids = new Set(c.displayWorkers.map((w) => w.id));
  const prevu = dates.map(() => 0);
  for (const p of c.planning) {
    const i = dates.indexOf(p.work_date);
    if (i < 0 || !ids.has(p.user_id) || p.absence_type || c.withdrawnIds.has(p.id) || c.realForPlanning(p) || c.draftForPlanning(p)) continue;
    prevu[i] += dureePrevue(p.estimated_start, p.estimated_end);
  }
  return dates.map((_, i) => t.jours[i] + prevu[i]);
}

/** Avatars : les huit teintes de la planche 2a (une par salarié, par hachage de l'identifiant, comme avant). */
const TEINTES = 8;

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

export function Grille({ c, totaux, recherche = '' }: { c: PlanningCtx; totaux: TotauxSemaine; recherche?: string }) {
  const dates = c.weekDays.map((d) => format(d, 'yyyy-MM-dd'));
  const toutCoche = (ids: string[]) => ids.length > 0 && ids.every((id) => c.selOn.has(id));
  const charge = chargeJours(c, dates, totaux);
  const max = Math.max(1, ...charge);
  return (
    <div className="dzp-defile">
      <table className="dzp-table" data-testid="grille">
        <colgroup><col /><col /><col /><col /><col /><col /><col /><col /></colgroup>
        <thead>
          <tr>
            <th className="dzp-th-nom" scope="col">
              <span className="dzp-th-nom__k">Salarié</span>
              <span className="dzp-th-nom__h"><b>{Math.round(totaux.envoyees / 60)} h</b><span>envoyées</span></span>
              {c.workers.length > 0 && c.copyTipHelpCorner}
            </th>
            {c.weekDays.map((day, i) => {
              const d = dates[i];
              const auj = d === c.todayStr;
              const clos = c.closedMonths.has(d.slice(0, 7));
              const ids: string[] = c.selectMode ? c.selectableIn((p: { work_date: string; user_id: string }) => p.work_date === d && c.displayWorkers.some((w) => w.id === p.user_id)) : [];
              const nom = format(day, 'EEE', { locale: fr }).replace('.', '');
              return (
                <th key={d} className="dzp-th-jour" scope="col" data-auj={auj ? '' : undefined} data-clos={clos ? '' : undefined} title={auj ? 'Aujourd’hui' : undefined}>
                  <div className="dzp-jour">
                    {c.selectMode && (
                      <button type="button" className="dzp-case-sel" data-on={toutCoche(ids) ? '' : undefined} data-testid="sel-day" title="Cocher toute cette journée" aria-label={`Cocher toute la journée du ${format(day, 'EEEE d', { locale: fr })}`}
                        onClick={() => c.toggleGroup(ids)}>{toutCoche(ids) ? '✓' : ''}</button>
                    )}
                    <span className="dzp-jour__l">{nom.charAt(0).toUpperCase() + nom.slice(1)}</span><span className="dzp-jour__n">{format(day, 'd')}</span>
                    {clos && <span className="dzp-etiq" data-clos="" title="Mois clôturé">CLOS</span>}
                    <span className="dzp-jour__h">{Math.round(charge[i] / 60)} h</span>
                  </div>
                  <div className="dzp-jour__jauge" aria-hidden="true"><span style={{ width: `${Math.round((charge[i] / max) * 100)}%`, background: degradeJour(i) }} /></div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {c.displayWorkers.map((worker) => <Ligne key={worker.id} c={c} worker={worker} dates={dates} totaux={totaux} />)}
          {c.displayWorkers.length === 0 && recherche && (
            <tr><td colSpan={8} className="dzp-aucun" data-testid="recherche-vide">Aucun salarié ni chantier ne correspond à « {recherche} ».</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Ligne({ c, worker, dates, totaux }: { c: PlanningCtx; worker: User; dates: string[]; totaux: TotauxSemaine }) {
  const absAuj = c.todayAbsence.get(worker.id);
  const manque = (c.missingEffective.get(worker.id) || []).length;
  const nomComplet = `${worker.first_name} ${worker.last_name}`;
  const t = totaux.parSalarie[worker.id] || { envoyees: 0, prevues: 0 };
  const idsLigne: string[] = c.selectMode ? c.selectableIn((p: { user_id: string }) => p.user_id === worker.id) : [];
  const coche = idsLigne.length > 0 && idsLigne.every((id) => c.selOn.has(id));
  // Jauge de la planche 2a : heures envoyées de la semaine sur 35 h (durée légale), plafonnée à 100 %.
  const pct = Math.min(100, Math.round((t.envoyees / 60 / 35) * 100));
  const heures = `${hm(t.envoyees)} h envoyées${t.prevues > 0 ? ` · +${hm(t.prevues)} prévues` : ''}${worker.role === 'lead' ? ' · chef d’équipe' : ''}`;
  return (
    <tr>
      <td className="dzp-td-nom">
        <div className="dzp-nom-haut">
          {c.selectMode && (
            <button type="button" className="dzp-case-sel" data-on={coche ? '' : undefined} title="Cocher toute sa semaine" aria-label={`Cocher toute la semaine de ${nomComplet}`} onClick={() => c.toggleGroup(idsLigne)}>{coche ? '✓' : ''}</button>
          )}
          <button type="button" className="dzp-nom-btn" data-guide="bureau-planning.nom" onClick={() => (c.selectMode ? c.toggleGroup(idsLigne) : c.setStatusTarget({ worker, fromStr: c.todayStr }))}
            title={c.selectMode ? 'Cocher toute sa semaine' : `${nomComplet} · ${heures} — cliquer pour le statut / la disponibilité`}>
            <span className="dzp-nom-haut">
              <span className="dzp-avatar" data-teinte={absAuj ? 'absent' : hashStr(worker.id) % TEINTES}>{worker.photo_url ? <img src={worker.photo_url} alt="" /> : <>{worker.first_name?.[0] || ''}{worker.last_name?.[0] || ''}</>}</span>
              <span className="dzp-nom-txt">
                <span className="dzp-nom">{nomComplet}</span>
                {manque > 0
                  ? <span className="dzp-etat" data-ton="attente" data-testid="row-waiting" data-days={manque}>● {manque} jour{manque > 1 ? 's' : ''} en attente</span>
                  : <span className="dzp-etat">● À jour</span>}
              </span>
            </span>
          </button>
        </div>
        <div className="dzp-jauge" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
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
  // Planche 2a : la réunion vient en tête de la case (avant les interventions) ; la pastille « Tâches » reste en bas.
  const reunions = meets.length > 0 ? <>{meets.map((m) => <ReunionV2 key={m.id} m={m} compacte inert={c.selectMode} onOpen={() => c.openMeeting(m, worker.id)} />)}</> : null;
  const chips = (meets.length > 0 || tasks.length > 0) ? (
    <>
      {absence && reunions}
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
          title={`${a.libelle}${a.sous ? ` · ${a.sous}` : ''} — ${c.selectMode ? 'à changer avec « Présent » (non supprimable ici)' : 'cliquer pour changer le statut'}`}>
          {c.selectMode && <span className="dzp-case-sel" aria-hidden="true">–</span>}
          <b>{a.libelle}</b>
        </button>
        {liveChip}{chips}
      </div>
    );
  } else {
    corps = (
      <div className="dzp-case" data-ferme={ferme ? '' : undefined} data-guide={vide ? 'bureau-planning.case' : undefined}
        onClick={ferme ? undefined : () => c.openAdd(worker.id, d)} title={c.selectMode || clos ? undefined : 'Cliquer pour ajouter une intervention'}>
        {reunions}
        {chantiers.map((p) => {
          const real = c.realForPlanning(p); const draft = c.draftForPlanning(p);
          const data: DonneesBulle = {
            p, real, draft, docs: c.docsByWorksite.get(p.worksite_id || '') || 0, live: c.liveForBubble(p), withdrawn: c.withdrawnIds.has(p.id),
            enRetard: !real && !draft && !c.withdrawnIds.has(p.id) && manquants.includes(d),
          };
          return <BulleV2 key={p.id} d={data} sel={c.selFor(p)} onEdit={c.openEdit} onToggle={c.toggleOne} />;
        })}
        {extra.map((x, i) => {
          // Heures ajoutées hors planning : la carte « AJOUTÉE PAR LE SALARIÉ » de la planche 2a (pointillés orange, « 1h00 · hors planning »).
          const puce = (
            <button key={`x${i}`} type="button" className="dzp-carte-btn dzp-hors" data-guide={x.worksiteId ? undefined : 'bureau-planning.autre'}
              onClick={(e) => { e.stopPropagation(); if (c.selectMode) { toast('Heures ajoutées par le salarié — non supprimable'); return; } c.setExtraTarget({ userId: worker.id, dateStr: d, worksiteId: x.worksiteId, name: x.name, minutes: x.minutes }); }}
              title={c.selectMode ? 'Heures ajoutées par le salarié — non supprimable' : `+${hm(x.minutes)} h sur ${x.name} · ${x.pending ? 'saisi, à envoyer' : 'ajouté par le salarié'} — cliquer pour les documents / attribuer un client`}>
              <Carte2a etat="ajoutee" creneau="ajoutee" titre={x.name} heure={`${duree2a(x.minutes)} · hors planning`} etiquette={x.pending ? 'À ENVOYER' : 'AJOUTÉE PAR LE SALARIÉ'} testId="extra-card" />
            </button>
          );
          return c.selectMode ? <div key={`x${i}`} className="dzp-bulle-wrap" data-sel="lock">{puce}</div> : puce;
        })}
        {liveChip}{chips}
        {vide && (clos ? <div className="dzp-clos-txt">Mois clôturé</div> : <div className="dzp-vide" aria-hidden="true">+</div>)}
        {/* La planche 2a ne dessine pas « + ajouter » dans une case pleine : il n'apparaît qu'au survol (hors du flux), pour garder le geste d'avant. */}
        {!vide && !ferme && <button type="button" className="dzp-ajouter" onClick={(e) => { e.stopPropagation(); c.openAdd(worker.id, d); }} data-guide="bureau-planning.ajouter" aria-label="Ajouter une intervention dans cette case">+ ajouter</button>}
      </div>
    );
  }
  return <CaseDrop c={c} w={worker.id} d={d} auj={d === c.todayStr} live={live} clos={clos}>{corps}</CaseDrop>;
}

