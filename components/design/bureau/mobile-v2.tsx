'use client';

// Design du bureau (v2) · TÉLÉPHONE, planche d'essai 2b (« Bureau · téléphone ») : sous 768 px (la tablette garde la grille de l'ordinateur).
// En-tête sombre : logo, ✦ jaune rond, ☰ ; S-42 et les dates ; bascule « Jour / Semaine ». En Jour : la bande des 7 jours (jour choisi en jaune) et une carte par
// salarié (avatar, nom, « N J EN ATTENTE » ou « À JOUR », ses interventions du jour, « + Ajouter un chantier »). En Semaine : la mosaïque (une pastille par
// intervention) ; toucher une colonne ouvre ce jour. Tout le reste (semaine précédente / suivante, compteurs et leurs tuiles, recherche, Clients, Salariés,
// Sélectionner, Exporter, Imprimer, Statistiques…) est dans le menu ☰ (menu-mobile-v2.tsx). Mêmes données et mêmes gestionnaires qu'avant (contexte-v2.ts).
import { useState } from 'react';
import { format, getISOWeek, addDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import type { PlanningWithWorksite, User } from '@/lib/types';
import { closedFor } from '@/lib/worker-closure';
import { meetingTimeLabel } from '@/supabase/functions/_shared/missions';
import { TachesV2 } from './missions-v2';
import { hashStr } from '@/components/planning-bubble';
import { CaseCoche, duree2a, lireBulle2a, type DonneesBulle } from './bulle-v2';
import { useLargeur, REQ_TELEPHONE } from './pont-v2';
import type { PlanningCtx } from './contexte-v2';

// Libellés des absences (planche, `ABS`) : mono, capitales.
const LIB_ABS: Record<string, string> = { conge: 'CONGÉ', maladie: 'ABSENT · MALADIE', intemperie: 'INTEMPÉRIE', repos: 'REPOS' };
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const LETTRES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** « 12–18 oct. » (sur deux mois : « 28 sept.–4 oct. »), comme la barre de l'ordinateur. */
function datesSemaine(debut: Date) {
  const fin = addDays(debut, 6);
  const meme = fin.getMonth() === debut.getMonth();
  return `${format(debut, meme ? 'd' : 'd MMM', { locale: fr })}–${format(fin, 'd MMM', { locale: fr })}`;
}

/** Une carte d'intervention de la planche 2b : liseré de 5 px, titre à gauche, horaire en mono à droite. Couleurs : `styleItem` du script (envoyées sombres). */
function CarteTel({ etat, creneau, titre, heure, sel }: { etat: string; creneau: string; titre: string; heure: string; sel?: { on: boolean; lock: string | null } }) {
  return (
    <div className="dzp-mc" data-etat={etat} data-creneau={creneau} data-testid="bubble">
      <span className="dzp-mc__lisere" aria-hidden="true" />
      <span className="dzp-mc__titre" data-testid="bubble-title">{titre}</span>
      <span className="dzp-mc__heure" data-testid="bubble-hours">{heure}</span>
      {sel && <CaseCoche sel={sel} classe="dzp-bulle__case dzp-mc__case" />}
    </div>
  );
}

/** Les cases de la mosaïque (planche 2b, `blk`) : une pastille par élément de la case. */
function pastilles(c: PlanningCtx, w: User, d: string): { k: string; etat: string; creneau: string }[] {
  if (c.absenceForDay(w.id, d)) return [{ k: 'abs', etat: 'absence', creneau: '' }];
  const out: { k: string; etat: string; creneau: string }[] = [];
  for (const m of c.cells.meetings(w.id, d)) out.push({ k: `m${m.id}`, etat: 'reunion', creneau: '' });
  const chantiers = c.cellChantiers(w.id, d) as PlanningWithWorksite[];
  let vivant = false;
  for (const p of chantiers) {
    const b = lireBulle2a({ p, real: c.realForPlanning(p), draft: c.draftForPlanning(p), docs: 0, live: c.liveForBubble(p), withdrawn: c.withdrawnIds.has(p.id) });
    if (b.etat === 'en-cours') vivant = true;
    out.push({ k: p.id, etat: b.etat, creneau: b.creneau });
  }
  (c.extraDeclaredForCell(w.id, d) as unknown[]).forEach((_, i) => out.push({ k: `x${i}`, etat: 'prevue', creneau: 'journee' }));
  if (!vivant && c.liveForCell(w.id, d)) out.push({ k: 'live', etat: 'en-cours', creneau: '' });
  return out;
}

function Semaine({ c, gens, ouvrirJour }: { c: PlanningCtx; gens: User[]; ouvrirJour: (i: number) => void }) {
  const dates = c.weekDays.map((d) => format(d, 'yyyy-MM-dd'));
  return (
    <div className="dzp-m2-corps dzp-m2-corps--semaine" data-testid="m-semaine">
      <div className="dzp-mos" role="grid" aria-label="Semaine en mosaïque">
        <span />
        {c.weekDays.map((day, i) => (
          <button key={dates[i]} type="button" className="dzp-mos__tete" data-auj={dates[i] === c.todayStr ? '' : undefined} onClick={() => ouvrirJour(i)}
            aria-label={`Ouvrir ${format(day, 'EEEE d MMMM', { locale: fr })}`} data-testid="m-mos-jour">
            <span>{LETTRES[i]}</span><b>{format(day, 'd')}</b>
          </button>
        ))}
        {gens.map((w) => {
          const manque = (c.missingEffective.get(w.id) || []).length;
          return (
            <div key={w.id} className="dzp-mos__ligne" role="row">
              <div className="dzp-mos__nom">
                <b>{w.first_name}</b>
                <span data-ton={manque > 0 ? 'attente' : undefined}>{manque > 0 ? `${manque} j` : 'à jour'}</span>
              </div>
              {dates.map((d, i) => {
                const ps = pastilles(c, w, d);
                return (
                  <button key={d} type="button" className="dzp-mos__case" data-auj={d === c.todayStr ? '' : undefined} onClick={() => ouvrirJour(i)}
                    aria-label={`${w.first_name}, ${format(c.weekDays[i], 'EEEE d', { locale: fr })} : ${ps.length === 0 ? 'rien' : ps[0].etat === 'absence' ? 'absent' : `${ps.length} élément${ps.length > 1 ? 's' : ''}`} — ouvrir ce jour`}>
                    {ps.map((p) => <span key={p.k} className="dzp-mos__p" data-etat={p.etat} data-creneau={p.creneau} />)}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="dzp-mos__legende" aria-label="Légende de la mosaïque">
        <span><i data-etat="envoyee" />envoyée</span>
        <span><i data-etat="prevue" data-creneau="matin" />prévue matin</span>
        <span><i data-etat="prevue" data-creneau="apres-midi" />après-midi</span>
        <span><i data-etat="en-cours" />en direct</span>
        <span><i data-etat="absence" />absent</span>
      </div>
    </div>
  );
}

export function Mobile({ c, gens, nbRecherche }: { c: PlanningCtx; gens: User[]; nbRecherche: string }) {
  const [vue, setVue] = useState<'jour' | 'semaine'>('jour');
  const telephone = useLargeur(REQ_TELEPHONE);
  const jour = c.weekDays[c.mobileDayIdx];
  const d = format(jour, 'yyyy-MM-dd');
  const clos = c.closedMonths.has(d.slice(0, 7));
  const badgeMenu = c.pendingLeaves + c.pendingInvites + c.openReserves;
  const ouvrirJour = (i: number) => { c.setMobileDayIdx(i); setVue('jour'); };
  return (
    <div className="dzp-mobile dzp-m2" data-testid="planning-mobile" data-vue={vue}>
      <header className="dzp-m2-tete">
        <div className="dzp-m2-ligne">
          <span className="dzp-logo">BEME<b>X</b>O</span>
          <div className="dzp-m2-ronds">
            {c.aiOn && c.isAdmin && <button type="button" className="dzp-m2-rond" data-ton="jaune" aria-label="Assistant" title="Assistant BEMEXO" onClick={() => c.setAssistantOpen(true)} data-testid="m-assistant" data-guide="bureau-nav.assistant">✦</button>}
            <button type="button" className="dzp-m2-rond" aria-label="Menu" title="Menu" onClick={() => c.setMobileMenuOpen(true)} data-guide="bureau-nav.menu" data-testid="m-menu">
              ☰{badgeMenu > 0 && <span className="dzp-m-badge" aria-hidden="true">{badgeMenu}</span>}
            </button>
          </div>
        </div>
        <div className="dzp-m2-ligne">
          <div className="dzp-m2-sem"><b>S-{getISOWeek(c.currentWeekStart)}</b><span>{datesSemaine(c.currentWeekStart)}</span></div>
          <div className="dzp-m2-bascule" role="group" aria-label="Affichage">
            <button type="button" aria-pressed={vue === 'jour'} onClick={() => setVue('jour')} data-testid="m-vue-jour">Jour</button>
            <button type="button" aria-pressed={vue === 'semaine'} onClick={() => setVue('semaine')} data-testid="m-vue-semaine">Semaine</button>
          </div>
        </div>
        {vue === 'jour' && (
          <div className="dzp-m2-jours" role="group" aria-label="Jour affiché">
            {c.weekDays.map((day, i) => {
              const ds = format(day, 'yyyy-MM-dd');
              return (
                <button key={ds} type="button" className="dzp-m-jour" aria-pressed={i === c.mobileDayIdx} data-auj={ds === c.todayStr ? '' : undefined} data-clos={c.closedMonths.has(ds.slice(0, 7)) ? '' : undefined}
                  aria-label={format(day, 'EEEE d MMMM', { locale: fr })} onClick={() => c.setMobileDayIdx(i)}>
                  <span>{JOURS[i]}</span><span>{format(day, 'd')}</span>
                </button>
              );
            })}
          </div>
        )}
      </header>

      {vue === 'semaine' ? <Semaine c={c} gens={gens} ouvrirJour={ouvrirJour} /> : (
        <div className="dzp-m2-corps">
          {nbRecherche && <div className="dzp-m2-filtre" role="status" data-testid="m-filtre">{nbRecherche}</div>}
          {c.workers.length > 0 && !c.selectMode && c.copyTipMobile}
          {c.workers.length === 0 ? (
            <div className="dzp-m-noadd" data-testid="m-vide">Aucun salarié. Ajoutez le premier avec « Salariés » dans le menu ☰.</div>
          ) : gens.map((worker) => {
            const absence = c.absenceForDay(worker.id, d);
            const chantiers = c.cellChantiers(worker.id, d) as PlanningWithWorksite[];
            const extra = c.extraDeclaredForCell(worker.id, d) as { worksiteId: string | null; name: string; minutes: number; pending: boolean }[];
            const live = !!c.liveForCell(worker.id, d);
            const liveChip = c.liveChipFor(worker.id, d);
            const meets = c.cells.meetings(worker.id, d);
            const tasks = c.cells.tasks(worker.id, d);
            const manque = (c.missingEffective.get(worker.id) || []);
            const nomComplet = `${worker.first_name} ${worker.last_name}`;
            const fermee = clos || !!closedFor(c.workerClosures, worker.id, d);
            const reunions = meets.map((m) => {
              const quand = meetingTimeLabel(m.start_time, m.end_time);
              return (
                <button key={m.id} type="button" className="dzp-m-bulle" data-testid="meeting-chip" data-meeting={m.id}
                  aria-label={`Réunion · ${quand} · ${m.title}${m.place ? ` · ${m.place}` : ''}${m.all_team ? ' · toute l’équipe' : ''} — ne compte pas dans les heures`}
                  onClick={() => { if (c.selectMode) { toast('Réunion / tâches — hors sélection'); return; } c.openMeeting(m, worker.id); }}>
                  <CarteTel etat="reunion" creneau="reunion" titre={m.title} heure={quand} />
                </button>
              );
            });
            const taches = tasks.length > 0 ? <TachesV2 tasks={tasks} inert={c.selectMode} onOpen={() => c.openTasks(worker.id, d, !!absence)} /> : null;
            return (
              <div key={worker.id} className="dzp-m-carte" data-live={live ? '1' : undefined}>
                <button type="button" className="dzp-m-haut" data-guide="bureau-planning.nom"
                  onClick={() => (c.selectMode ? c.toggleGroup(c.selectableIn((p: { user_id: string; work_date: string }) => p.user_id === worker.id && p.work_date === d)) : c.setStatusTarget({ worker, fromStr: d }))}
                  title={c.selectMode ? 'Cocher ses interventions du jour' : 'Présence, absence ou fiche'}>
                  <span className="dzp-avatar" data-teinte={hashStr(worker.id) % 8}>{worker.photo_url ? <img src={worker.photo_url} alt="" /> : <>{worker.first_name?.[0] || ''}{worker.last_name?.[0] || ''}</>}</span>
                  <span className="dzp-m-nom">{nomComplet}</span>
                  <span className="dzp-m-etat" data-ton={manque.length > 0 ? 'attente' : undefined} data-testid={manque.length > 0 ? 'row-waiting' : undefined}>{manque.length > 0 ? `${manque.length} J EN ATTENTE` : 'À JOUR'}</span>
                </button>
                {absence ? (
                  <>
                    <button type="button" className="dzp-m-absence" data-type={absence.absence_type} data-testid="absence" onClick={() => (c.selectMode ? toast('Absence — à changer avec « Présent »') : c.setStatusTarget({ worker, fromStr: d }))}
                      title={absence.notes ? `${absence.notes} — changer le statut` : 'Changer le statut'}>
                      <b>{LIB_ABS[absence.absence_type as string] || String(absence.absence_type || '').toUpperCase()}</b>
                    </button>
                    {reunions}{liveChip}{taches}
                  </>
                ) : (
                  <>
                    {reunions}
                    {chantiers.map((p) => {
                      const sel = c.selFor(p);
                      const real = c.realForPlanning(p); const draft = c.draftForPlanning(p);
                      const data: DonneesBulle = { p, real, draft, docs: c.docsByWorksite.get(p.worksite_id || '') || 0, live: c.liveForBubble(p), withdrawn: c.withdrawnIds.has(p.id), enRetard: !real && !draft && !c.withdrawnIds.has(p.id) && manque.includes(d) };
                      const b = lireBulle2a(data);
                      const act = () => (sel ? c.toggleOne(p, sel.lock) : c.openEdit(p));
                      return (
                        <div key={p.id} className="dzp-m-bulle dzp-bulle-wrap" role="button" tabIndex={0} data-guide="bureau-planning.bulle" data-sel={sel ? (sel.lock ? 'lock' : sel.on ? 'on' : 'off') : undefined} data-pid={sel ? p.id : undefined}
                          title={b.sous || undefined} onClick={act} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } }}>
                          <CarteTel etat={b.etat} creneau={b.creneau} titre={b.titre} heure={b.heure} sel={sel} />
                        </div>
                      );
                    })}
                    {extra.map((x, i) => (
                      <button key={`x${i}`} type="button" className="dzp-m-bulle dzp-hors" data-guide={x.worksiteId ? undefined : 'bureau-planning.autre'}
                        title={`+${duree2a(x.minutes)} sur ${x.name} · ${x.pending ? 'saisi, à envoyer' : 'ajouté par le salarié'}`}
                        onClick={() => (c.selectMode ? toast('Heures ajoutées par le salarié — non supprimable') : c.setExtraTarget({ userId: worker.id, dateStr: d, worksiteId: x.worksiteId, name: x.name, minutes: x.minutes }))}>
                        <CarteTel etat="ajoutee" creneau="ajoutee" titre={x.name} heure={`${duree2a(x.minutes)} · hors planning`} />
                      </button>
                    ))}
                    {liveChip}{taches}
                    {fermee
                      ? <span className="dzp-m-noadd">Mois clôturé : pas d&apos;ajout.</span>
                      : <button type="button" className="dzp-m-ajouter" onClick={() => c.openAdd(worker.id, d)} data-guide="bureau-planning.ajouter">+ Ajouter un chantier</button>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      {telephone && c.printMenu ? <div className="dzp-m-imprimer">{c.printMenu}</div> : null}
    </div>
  );
}
