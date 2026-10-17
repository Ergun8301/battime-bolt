'use client';

// Design bureau · lot 2 · HP01 à HP11, HM01 à HM03 : la fiche d'un salarié côté HEURES (« Feuille d'heures »), la fiche d'une ligne, « Corriger », « Renvoyer ».
//
// HABILLAGE SEULEMENT (écrans ◇ : contenu conservé). Ce fichier ne lit rien et n'écrit rien : tout ce qu'il affiche et chaque geste (corriger, renvoyer,
// supprimer un brouillon vide, attribuer un client, exporter sans verrou, relancer) viennent de components/worker-detail.tsx par `ctx` ; les états, les requêtes
// et les écritures sont ceux de l'interface actuelle, qui ne change pas. Chargé en différé quand `useBureauUi2()` est vrai.
//
// Ce que la planche dessine et que le code ne permet pas (donc PAS ajouté) :
//   · « + 7:00 prévues » sous le total, la ligne « PRÉVUE » (planning sans heures) et « EN DIRECT » : la fiche ne lit pas le planning ni le pointage en cours ;
//   · « Corriger » SANS prévenir (HP04) : le code ne sait que « Corriger et prévenir » (le salarié est toujours prévenu) ;
//   · « Route payée / Route non payée » comme CHOIX par ligne : la route payée est un réglage de l'entreprise ; la ligne ne choisit que « Route » ou « Pause avant » ;
//   · les heures de pause en liste déroulante : les puces de pause du code (PausePicker) sont gardées ;
//   · « Alex prévenu » / « Pas prévenu » en clair dans la ligne d'historique : le code garde « pas prévenu » avec son erreur, rien d'autre.
import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Bell, Loader2, Trash2 } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import type { User, Worksite } from '@/lib/types';
import type { ExportEntry } from '@/lib/export-utils';
import { isCounted } from '@/lib/status';
import { fmtHeure } from '@/lib/corrections';
import { isQrEntry, isExitToComplete, type QrFields } from '@/lib/qr-entry';
import type { LeadMark } from '@/lib/lead-trace';
import { isReturned, lastEdit, type EntryEdit } from '@/lib/office-edits';
import { changedAfterReturn, changedKeys, diffLabels, frozenLabel, reasonOk } from '@/supabase/functions/_shared/office-edits';
import { isDisposableDraft } from '@/lib/erase';
import { showMealCorrection } from '@/lib/meal-setting';
import { fmtCoord, fmtPrecision, positionUtile } from '@/lib/position';
import { parisHHmm } from '@/lib/utils';
import { spanMinutes } from '@/supabase/functions/_shared/day-hours';
import { TimeField } from '@/components/time-field';
import PausePicker from '@/components/pause-picker';
import { ActionDone, type UndoResult } from '@/components/action-done';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ExportPreload } from '@/components/export-menu';
import { weekStart as semaineDe } from '@/lib/week';
import { FenetreB, PanneauB, hmm, useTelephone } from './heures-fenetre';
import { ChoixPeriode, libellePeriodeV2 } from './exporter-v2';
import OngletsFicheV2 from './onglets-fiche-v2';

export interface CorrectionLigne {
  id: string; entry_id: string; corrected_by: string; corrected_by_role: 'admin' | 'lead'; corrected_at: string;
  old_start: string; old_end: string; new_start: string; new_end: string; notified_at: string | null; notify_error: string | null;
}
export interface PositionLigne { id: string; entry_id: string; moment: 'start' | 'end'; latitude: string; longitude: string; accuracy_m: number | null; captured_at: string }
type Semaine = { weekStart: string; weekEnd: string; minutes: number; overtimeMinutes: number };
type KindExport = 'pdf' | 'excel' | 'csv';

export interface FicheHeuresCtx {
  worker: User;
  onOpenChange: (o: boolean) => void;
  allerGerer: () => void;
  taux: string;
  range: DateRange | undefined;
  setRange: (r: DateRange | undefined) => void;
  loading: boolean;
  entries: ExportEntry[];
  liveEntries: ExportEntry[];
  totalMinutes: number;
  weeks: Semaine[];
  overtimeMinutes: number;
  effectiveWeeklyHours: number;
  ownWeekly: boolean;
  travelPaid: boolean;
  weekRoute: Map<string, number>;
  meId?: string;
  missingOpen: string[];
  closedUntil: string | null;
  exporting: boolean;
  doExport: (k: KindExport) => void | Promise<void>;
  /** Relancer ce salarié (même envoi que « À relancer » du planning) : absent = pas de bouton. */
  onRelancer?: () => void | Promise<unknown>;
  erasedDraft: { key: number; undo: () => Promise<UndoResult> } | null;
  deleteEmptyDraft: (e: ExportEntry) => void | Promise<void>;
  edits: Map<string, EntryEdit[]>;
  corrections: Map<string, CorrectionLigne[]>;
  qrFlags: Map<string, QrFields>;
  leadMarks: Map<string, LeadMark>;
  positions: Map<string, PositionLigne[]>;
  editsAvailable: boolean;
  worksites: Worksite[];
  reassigningId: string | null; setReassigningId: (v: string | null) => void;
  creatingFor: string | null; setCreatingFor: (v: string | null) => void;
  newClientName: string; setNewClientName: (v: string) => void;
  reassignEntry: (entryId: string, worksiteId: string) => void | Promise<void>;
  createAndAttribute: (entryId: string) => void | Promise<void>;
  correctingId: string | null; setCorrectingId: (v: string | null) => void;
  cStart: string; setCStart: (v: string) => void; cEnd: string; setCEnd: (v: string) => void;
  cBreak: number; setCBreak: (v: number) => void; cMeal: boolean; setCMeal: (v: boolean) => void;
  cGap: '' | 'route' | 'pause'; setCGap: (v: '' | 'route' | 'pause') => void;
  cReason: string; setCReason: (v: string) => void;
  setCBadStart: (v: boolean) => void; setCBadEnd: (v: boolean) => void; cBadStart: boolean; cBadEnd: boolean;
  cPauseErr: string | null; setCPauseErr: (v: string | null) => void;
  cSaving: boolean; cReturning: boolean;
  mealOn: boolean;
  previousEnd: (entry: ExportEntry, start: string) => string | null;
  actionErr: string | null; setActionErr: (v: string | null) => void;
  doCorrection: (e: ExportEntry) => Promise<unknown>;
  doReturn: (e: ExportEntry) => Promise<unknown>;
}

const OTHER_NAME = 'Autre';
const cap = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const jourCourt = (iso: string) => `${cap(format(parseISO(iso), 'EEE', { locale: fr }).replace('.', ''))} ${format(parseISO(iso), 'd')}`;
const jourLong = (iso: string) => format(parseISO(iso), 'EEEE d', { locale: fr });
const hhmm = (t?: string | null) => (t ? t.substring(0, 5) : '');
const dureeCourte = (m: number) => (m < 60 ? `0:${String(m).padStart(2, '0')}` : hmm(m));

/** L'état d'une ligne, lu comme components/worker-detail.tsx le lisait (mêmes règles, mêmes mots). */
function etatLigne(entry: ExportEntry, c: FicheHeuresCtx) {
  const isCancelled = entry.status === 'cancelled';
  const isUnknown = entry.worksite?.client_name === OTHER_NAME;
  const isWorkerAdded = !isCancelled && !entry.planning_id;
  const qr = c.qrFlags.get(entry.id);
  const isEmptyDraft = isDisposableDraft({ ...entry, exit_forgotten: qr?.exit_forgotten });
  const lineEdits = c.edits.get(entry.id) || [];
  const returned = isReturned(entry.status, lineEdits);
  const lastRet = lastEdit(lineEdits)?.kind === 'return' ? lastEdit(lineEdits) : undefined;
  const afterReturn = lastRet && isCounted(entry.status) ? changedAfterReturn(lastRet.old_values, entry) : [];
  const retNewer = !!lastRet && (!entry.modified_at || Date.parse(lastRet.edited_at) > Date.parse(entry.modified_at));
  const lead = c.leadMarks.get(entry.id);
  const changedBy = (afterReturn.length > 0 && retNewer) || !entry.modified_at || !entry.modified_by || entry.modified_by === c.worker.id ? 'worker'
    : (c.corrections.get(entry.id) || []).some((x) => x.corrected_by === entry.modified_by && x.corrected_by_role === 'lead') || lead?.lead_edited_by === entry.modified_by ? 'lead' : 'office';
  const chips: { etat: string; texte: string; testId?: string; titre?: string }[] = [];
  if (isCancelled) chips.push({ etat: 'retiree', texte: 'Retirée' });
  else if (isEmptyDraft) chips.push({ etat: 'brouillon', texte: 'brouillon vide', testId: 'badge-empty-draft', titre: 'Début = fin : ne compte nulle part' });
  else if (entry.status === 'draft') chips.push({ etat: 'brouillon', texte: 'brouillon', testId: 'badge-draft' });
  else chips.push({ etat: 'envoye', texte: 'Envoyé' });
  if (returned) chips.push({ etat: 'renvoyee', texte: 'renvoyée · en attente du salarié', testId: 'badge-returned' });
  if (isWorkerAdded) chips.push({ etat: 'ajoute', texte: 'ajouté par le salarié' });
  if (!isCancelled && afterReturn.length > 0) chips.push({ etat: 'renvoyee', texte: 'modifié après renvoi', testId: 'badge-after-return' });
  if (!isCancelled && !afterReturn.length && entry.modified_at && changedBy === 'worker') chips.push({ etat: 'renvoyee', texte: 'modifié après envoi' });
  if (!isCancelled && !afterReturn.length && entry.modified_at && changedBy === 'office') chips.push({ etat: 'corrigee', texte: 'corrigé par le bureau', testId: 'badge-office' });
  if (!isCancelled && !afterReturn.length && entry.modified_at && changedBy === 'lead' && !lead) chips.push({ etat: 'corrigee', texte: 'corrigé par le chef d’équipe' });
  if (!isCancelled && lead) chips.push({ etat: 'corrigee', texte: 'par le chef d’équipe', testId: 'badge-lead', titre: `Saisie ou corrigée par le chef d’équipe le ${format(new Date(lead.lead_edited_at || Date.now()), 'd MMM à HH:mm', { locale: fr })}` });
  if (!isCancelled && isQrEntry(qr ?? {})) chips.push({ etat: 'qr', texte: 'QR', testId: 'badge-qr', titre: 'Ligne venue d’un pointage à la tablette (QR)' });
  if (!isCancelled && qr?.corrected_at) chips.push({ etat: 'corrigee', texte: 'corrigé', testId: 'badge-corrected', titre: 'Heures du pointage QR changées après coup' });
  if (!isCancelled && qr?.exit_forgotten) chips.push({ etat: 'alerte', texte: isExitToComplete(qr ?? {}) ? 'sortie oubliée · fin à compléter' : 'sortie oubliée', testId: 'badge-exit-forgotten', titre: 'Le salarié n’a pas rescanné en partant : chrono fermé la nuit' });
  if (!isCancelled && entry.reception === 'avec') chips.push({ etat: 'reserve', texte: 'Avec réserve' });
  if (!isCancelled && entry.reception === 'sans') chips.push({ etat: 'sans-reserve', texte: 'Sans réserve' });
  if (!isCancelled && entry.reception === 'en_cours') chips.push({ etat: 'a-envoyer', texte: 'Chantier en cours' });
  return { isCancelled, isUnknown, isEmptyDraft, lineEdits, returned, afterReturn, qr, chips, lead };
}

function Chips({ chips }: { chips: ReturnType<typeof etatLigne>['chips'] }) {
  return (
    <span className="dz-hb-etats">
      {chips.map((x) => <span key={x.texte} className="dz-hb-chip" data-etat={x.etat} data-testid={x.testId} title={x.titre}>{x.texte}</span>)}
    </span>
  );
}

export default function FicheHeuresV2({ ctx: c }: { ctx: FicheHeuresCtx }) {
  const w = c.worker;
  const tel = useTelephone();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [renvoiId, setRenvoiId] = useState<string | null>(null);
  const range = c.range?.from ? { from: c.range.from, to: c.range.to ?? c.range.from } : null;
  const semaine = useMemo(() => semaineDe(), []);
  const compte = useMemo(() => c.liveEntries.filter((e) => isCounted(e.status)), [c.liveEntries]);
  const paniers = compte.filter((e) => e.meal_allowance).length;
  const routeTotale = compte.reduce((s, e) => s + (c.weekRoute.get(e.id) || 0), 0);
  // La planche lit la semaine du lundi au dimanche (la fiche d'avant montrait le plus récent en premier) : même lignes, autre ordre.
  const lignes = useMemo(() => [...c.entries].sort((a, b) => (a.work_date + (a.start_time || '')).localeCompare(b.work_date + (b.start_time || ''))), [c.entries]);
  const detail = c.entries.find((e) => e.id === detailId) || null;
  const corrige = c.entries.find((e) => e.id === c.correctingId) || null;
  const renvoi = c.entries.find((e) => e.id === renvoiId) || null;
  const role = w.role === 'lead' ? 'Chef d’équipe' : 'Salarié';
  const sous = [role, w.email, c.taux.trim() ? `taux ${c.taux.trim().replace('.', ',')} € / h chargé` : ''].filter(Boolean).join(' · ');

  const ouvrirCorrection = (entry: ExportEntry) => {
    c.setCorrectingId(entry.id);
    c.setCStart(entry.start_time?.slice(0, 5) || '08:00');
    c.setCEnd(entry.end_time?.slice(0, 5) || '17:00');
    c.setCBreak(entry.break_minutes || 0);
    c.setCMeal(!!entry.meal_allowance);
    c.setCGap(entry.gap_before === 'route' || entry.gap_before === 'pause' ? entry.gap_before : '');
    c.setCReason('');
    c.setActionErr(null);
  };
  const ouvrirRenvoi = (entry: ExportEntry) => { c.setCReason(''); c.setActionErr(null); setRenvoiId(entry.id); };

  const onglets = <OngletsFicheV2 mode="hours" onGerer={c.allerGerer} onHeures={() => {}} />;

  const pied = (
    <>
      {c.onRelancer && c.missingOpen.length > 0 ? (
        <button type="button" className="dz-hb-btn" data-testid="fiche-relancer" onClick={() => { void c.onRelancer?.(); }}>
          <Bell className="h-4 w-4" aria-hidden="true" /> Relancer
        </button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="dz-hb-btn" data-ton="principal" data-testid="export-menu" data-guide="bureau-fiche.exporter" aria-label="Exporter ce salarié (sans verrou)" disabled={c.liveEntries.length === 0 || c.exporting}>
            {c.exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            <span className="dz-hb-long">Exporter ce salarié (sans verrou)</span><span className="dz-hb-court" aria-hidden="true">Exporter</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bt-skin dz-portail dz-hb-menu">
          {([['pdf', 'PDF', 'À lire ou imprimer'], ['excel', 'Excel', 'Tableau détaillé'], ['csv', 'CSV paie', 'Pour le logiciel de paie']] as const).map(([k, nom, sub]) => (
            <DropdownMenuItem key={k} data-testid={`export-menu-${k}`} onSelect={() => { void c.doExport(k); }}>
              <span><b>{nom}</b><small>{sub}</small></span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  return (
    <>
      <PanneauB open onOpenChange={c.onOpenChange} large kicker="Fiche salarié" testId="worker-fiche"
        titre={<>{w.first_name} {w.last_name}{!w.is_active ? <> <span className="dz-hb-chip" data-etat="clos">Archivé</span></> : null}</>}
        sous={sous} sousTete={onglets} pied={pied}>
        <ExportPreload />
        <ChoixPeriode periode={range} setPeriode={(p) => c.setRange({ from: p.from, to: p.to })} semaine={semaine} popoverAlign="start" />
        <p className="dz-hb-aide" data-testid="fiche-sans-verrou">Cet export (PDF, Excel ou CSV) ne verrouille pas les heures. Le verrou de paie se pose à l’export de l’équipe.</p>

        <div className="dz-hb-stats">
          <div className="dz-hb-stat"><span>Total envoyé</span><b data-testid="fiche-total">{hmm(c.totalMinutes)}<small>h</small></b><small>{c.liveEntries.length} intervention{c.liveEntries.length > 1 ? 's' : ''}</small></div>
          <div className="dz-hb-stat"><span>Heures sup</span><b>{hmm(c.overtimeMinutes)}<small>h</small></b><small>base {c.effectiveWeeklyHours} h{c.ownWeekly ? ' (propre à ce salarié)' : ''}</small></div>
          <div className="dz-hb-stat"><span>Paniers</span><b>{paniers}</b></div>
          <div className="dz-hb-stat"><span>Route</span><b>{hmm(routeTotale)}<small>h</small></b><small>{c.travelPaid ? 'payée' : 'non payée'}</small></div>
        </div>

        {c.missingOpen.length > 0 ? (
          <p className="dz-hb-attente" data-testid="fiche-missing">
            <b>{c.missingOpen.length} jour{c.missingOpen.length > 1 ? 's' : ''} en attente</b> · {c.missingOpen.map((d) => format(parseISO(d), 'EEE d MMM', { locale: fr })).join(', ')}
          </p>
        ) : null}
        {c.closedUntil ? (
          <div className="dz-hb-note" data-testid="closure-chip">
            <b>Heures clôturées jusqu’au {format(parseISO(c.closedUntil), 'dd/MM')}</b>
            <span>Il ne peut plus rien saisir ni envoyer sur ces jours. Pour rouvrir : onglet « Gérer ».</span>
          </div>
        ) : null}

        <div className="dz-hb-ligne-semaine">
          <p className="dz-hb-etiquette capitalize">{range ? `Semaine ${libellePeriodeV2(range, semaine)}`.replace(/^Semaine (S-\d+)/, 'Semaine $1') : ''}</p>
          <b>{hmm(c.totalMinutes)} h</b>
        </div>

        {c.erasedDraft ? <ActionDone key={c.erasedDraft.key} message="brouillon vide supprimé" undo={c.erasedDraft.undo} /> : null}

        {c.loading ? (
          <div className="dz-hb-corps-sq">{[1, 2, 3].map((i) => <div key={i} className="dz-hb-squelette" />)}</div>
        ) : c.entries.length === 0 ? (
          <div className="dz-hb-carte"><p className="dz-hb-vide">Aucune intervention sur cette période</p></div>
        ) : (
          <>
            {!tel ? (
            <div className="dz-hb-tableau">
              <table>
                <thead><tr><th>Date</th><th>Client</th><th>Début–fin</th><th>Durée</th><th>Panier</th><th>Pause</th><th>Route</th><th>État</th></tr></thead>
                <tbody>
                  {lignes.map((entry) => {
                    const e = etatLigne(entry, c);
                    const route = c.weekRoute.get(entry.id) || 0;
                    return (
                      <tr key={entry.id} data-cliquable="oui" data-etat={e.isCancelled ? 'retiree' : undefined} data-testid="fiche-ligne" onClick={() => setDetailId(entry.id)}>
                        <td className="dz-hb-date">{jourCourt(entry.work_date)}</td>
                        <td className="dz-hb-client">
                          <button type="button" className="dz-hb-ouvrir" aria-label={`Ouvrir la ligne : ${entry.worksite?.client_name || OTHER_NAME}, ${jourLong(entry.work_date)}`} data-testid="fiche-ligne-ouvrir"
                            onClick={(ev) => { ev.stopPropagation(); setDetailId(entry.id); }}>
                            <span className="dz-hb-client">
                              <b>{entry.worksite?.client_name || OTHER_NAME}</b>
                              {entry.observation ? <small>« {entry.observation} »</small> : entry.worksite?.city ? <small>{entry.worksite.city}</small> : null}
                            </span>
                          </button>
                        </td>
                        <td className="dz-hb-heures">{hhmm(entry.start_time)}–{hhmm(entry.end_time)}</td>
                        <td className="dz-hb-duree">{hmm(entry.total_minutes)}</td>
                        <td>{entry.meal_allowance ? 'Oui' : '—'}</td>
                        <td data-testid={(entry.break_minutes || 0) > 0 ? 'line-break' : undefined}>{(entry.break_minutes || 0) > 0 ? dureeCourte(entry.break_minutes) : '—'}</td>
                        <td data-testid={route > 0 ? 'line-route' : undefined}>{route > 0 ? <>{dureeCourte(route)}<br />{c.travelPaid ? 'payée' : 'non payée'}</> : '—'}</td>
                        <td>
                          <Chips chips={e.chips} />
                          {e.isEmptyDraft ? (
                            <button type="button" className="dz-hb-lien" data-testid="delete-empty-draft" onClick={(ev) => { ev.stopPropagation(); void c.deleteEmptyDraft(entry); }}>
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />&nbsp;Supprimer
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            ) : (
            <ul className="dz-hb-cartes" data-testid="fiche-cartes">
              {lignes.map((entry) => {
                const e = etatLigne(entry, c);
                const route = c.weekRoute.get(entry.id) || 0;
                const infos = [`${hhmm(entry.start_time)}–${hhmm(entry.end_time)}`, entry.meal_allowance ? 'panier' : '', (entry.break_minutes || 0) > 0 ? `pause ${dureeCourte(entry.break_minutes)}` : '', route > 0 ? `route ${dureeCourte(route)}` : ''].filter(Boolean).join(' · ');
                return (
                  <li key={entry.id}>
                    <button type="button" className="dz-hb-carte-ligne" onClick={() => setDetailId(entry.id)}>
                      <span><b>{jourCourt(entry.work_date)} · {entry.worksite?.client_name || OTHER_NAME}</b><small>{infos}</small><Chips chips={e.chips} /></span>
                      <i>{hmm(entry.total_minutes)}</i><i aria-hidden="true">›</i>
                    </button>
                    {e.isEmptyDraft ? <button type="button" className="dz-hb-lien" onClick={() => { void c.deleteEmptyDraft(entry); }}>Supprimer le brouillon vide</button> : null}
                  </li>
                );
              })}
            </ul>
            )}
          </>
        )}

        {c.weeks.length > 0 ? (
          <div className="dz-hb-carte">
            <ul className="dz-hb-kv">
              <li><span className="dz-hb-etiquette" data-ton="neutre">Semaine par semaine</span><b data-texte="ui">base {c.effectiveWeeklyHours} h{c.ownWeekly ? ' (propre à ce salarié)' : ''}</b></li>
              {c.weeks.map((s) => (
                <li key={s.weekStart}>
                  <span>{format(parseISO(s.weekStart), 'd MMM', { locale: fr })} → {format(parseISO(s.weekEnd), 'd MMM', { locale: fr })}</span>
                  <b>{hmm(s.minutes)} h{s.overtimeMinutes > 0 ? ` · +${hmm(s.overtimeMinutes)} sup.` : ''}</b>
                </li>
              ))}
              {c.overtimeMinutes > 0 ? <li><span>Heures supplémentaires sur la période</span><b>{hmm(c.overtimeMinutes)} h</b></li> : null}
            </ul>
          </div>
        ) : null}
        {c.entries.length > 0 ? <p className="dz-hb-aide">{c.liveEntries.length} intervention{c.liveEntries.length > 1 ? 's' : ''} · période {range ? libellePeriodeV2(range, semaine) : ''}</p> : null}
      </PanneauB>

      {detail ? (
        <LigneV2 c={c} entry={detail} fermer={() => setDetailId(null)} corriger={() => ouvrirCorrection(detail)} renvoyer={() => ouvrirRenvoi(detail)} />
      ) : null}
      {corrige ? <CorrectionV2 c={c} entry={corrige} apres={() => setDetailId(null)} /> : null}
      {renvoi ? <RenvoiV2 c={c} entry={renvoi} fermer={() => setRenvoiId(null)} apres={() => { setRenvoiId(null); setDetailId(null); }} /> : null}
    </>
  );
}

/** La fiche d'une ligne (HP03) : ses chiffres, ce qu'on peut en faire, et son historique, dans l'ordre. */
function LigneV2({ c, entry, fermer, corriger, renvoyer }: { c: FicheHeuresCtx; entry: ExportEntry; fermer: () => void; corriger: () => void; renvoyer: () => void }) {
  const e = etatLigne(entry, c);
  const route = c.weekRoute.get(entry.id) || 0;
  const corrigeable = isCounted(entry.status);
  const linkedCorr = new Set(e.lineEdits.map((x) => x.correction_id).filter(Boolean));
  const history = [
    ...(c.corrections.get(entry.id) || []).filter((x) => !linkedCorr.has(x.id)).map((x) => ({ at: x.corrected_at, c: x, x: null as EntryEdit | null })),
    ...e.lineEdits.map((x) => ({ at: x.edited_at, c: null as CorrectionLigne | null, x })),
  ].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const pos = (c.positions.get(entry.id) || []).slice().sort((a, b) => (a.moment === 'start' ? -1 : 1) - (b.moment === 'start' ? -1 : 1));
  const realWorksites = c.worksites.filter((x) => x.client_name !== OTHER_NAME);
  return (
    <PanneauB open onOpenChange={(o) => { if (!o) fermer(); }} niveau={2} testId="fiche-ligne-detail"
      kicker={`${w2(c)} · ${cap(format(parseISO(entry.work_date), 'EEEE d MMMM', { locale: fr }))}`}
      titre={<>{entry.worksite?.client_name || OTHER_NAME} · {hmm(entry.total_minutes)}</>}
      sous={`${hhmm(entry.start_time)} → ${hhmm(entry.end_time)}${(entry.break_minutes || 0) > 0 ? ` · pause ${dureeCourte(entry.break_minutes)}` : ''}${entry.meal_allowance ? ' · panier' : ''}`}
      pied={corrigeable ? (
        <>
          {c.editsAvailable ? <button type="button" className="dz-hb-btn" data-testid="correct-return" onClick={renvoyer}>Renvoyer au salarié</button> : null}
          <button type="button" className="dz-hb-btn" data-ton="principal" data-guide="bureau-fiche.corriger" data-testid="correct-open" onClick={corriger}>Corriger</button>
        </>
      ) : undefined}>
      <Chips chips={e.chips} />
      <ul className="dz-hb-kv dz-hb-carte">
        <li>Début<b>{hhmm(entry.start_time)}</b></li>
        <li>Fin<b>{hhmm(entry.end_time)}</b></li>
        <li>Pause<b>{(entry.break_minutes || 0) > 0 ? dureeCourte(entry.break_minutes) : '—'}</b></li>
        <li>Panier<b data-texte="ui">{entry.meal_allowance ? 'Oui' : '—'}</b></li>
        <li>Route<b>{route > 0 ? `${dureeCourte(route)} ${c.travelPaid ? 'payée' : '(non payée)'}` : '—'}</b></li>
        {entry.worksite?.city ? <li>Lieu<b data-texte="ui">{entry.worksite.city}</b></li> : null}
        {entry.observation ? <li>Observation<b data-texte="ui">« {entry.observation} »</b></li> : null}
        {e.qr && isQrEntry(e.qr) ? <li>Pointage<b data-texte="ui">QR à la borne</b></li> : null}
      </ul>

      {!e.isCancelled && e.isUnknown ? (
        c.reassigningId === entry.id ? (
          <div className="dz-hb-carte">
            <div className="dz-hb-corps-int">
              <div className="dz-hb-champ">
                <label htmlFor="dz-hb-attribuer">Attribuer un client à cette intervention</label>
                <select id="dz-hb-attribuer" defaultValue="" onChange={(ev) => { const v = ev.target.value; if (v === '__new__') c.setCreatingFor(entry.id); else if (v) void c.reassignEntry(entry.id, v); }}>
                  <option value="" disabled>Choisir un client existant…</option>
                  {realWorksites.map((x) => <option key={x.id} value={x.id}>{x.client_name}{x.city ? ` - ${x.city}` : ''}</option>)}
                  <option value="__new__">+ Créer un nouveau client</option>
                </select>
              </div>
              {c.creatingFor === entry.id ? (
                <div className="dz-hb-champ">
                  <label htmlFor="dz-hb-nouveau-client">Nom du nouveau client</label>
                  <input id="dz-hb-nouveau-client" type="text" value={c.newClientName} onChange={(ev) => c.setNewClientName(ev.target.value)} />
                  <button type="button" className="dz-hb-btn" data-ton="principal" disabled={!c.newClientName.trim()} onClick={() => { void c.createAndAttribute(entry.id); }}>Créer</button>
                </div>
              ) : null}
              <button type="button" className="dz-hb-btn" onClick={() => { c.setReassigningId(null); c.setCreatingFor(null); c.setNewClientName(''); }}>Annuler</button>
            </div>
          </div>
        ) : (
          <button type="button" className="dz-hb-btn" onClick={() => c.setReassigningId(entry.id)}>Attribuer un client</button>
        )
      ) : null}

      {pos.length > 0 ? (
        <>
          <p className="dz-hb-etiquette" data-ton="neutre">Endroit enregistré au pointage</p>
          <ul className="dz-hb-kv dz-hb-carte">
            {pos.map((p) => (
              <li key={p.id}>
                <span>{p.moment === 'start' ? 'Départ' : 'Fin'} · {parisHHmm(p.captured_at)}</span>
                <b data-texte="ui">
                  {positionUtile(p.accuracy_m)
                    ? <>{fmtCoord(p.latitude, p.longitude)} {fmtPrecision(p.accuracy_m)}</>
                    : <>{fmtCoord(p.latitude, p.longitude)} — {fmtPrecision(p.accuracy_m)}, trop imprécis pour situer un chantier</>}
                </b>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="dz-hb-etiquette">Historique</p>
      <ol className="dz-hb-histo" data-testid="fiche-historique">
        {history.map(({ x, c: corr }) => (x ? (
          <li key={x.id} data-testid="edit-row">
            <small>{format(parseISO(x.edited_at), 'dd/MM HH:mm')} · {x.edited_by === c.meId ? 'vous' : 'le bureau'}</small>
            <b>{x.kind === 'return' ? 'Renvoyée au salarié' : cap(diffLabels(x.old_values, x.new_values).join(' · ')) || 'Corrigée'}</b>
            <span>Motif : {x.reason}.</span>
            {!x.notified_at ? <span data-ton="alerte">Pas prévenu{x.notify_error ? ` (${x.notify_error})` : ''}</span> : null}
            {x.kind === 'return' && frozenLabel(x.old_values) ? <span data-testid="return-frozen">{frozenLabel(x.old_values)}</span> : null}
          </li>
        ) : corr ? (
          <li key={corr.id}>
            <small>{format(parseISO(corr.corrected_at), 'dd/MM HH:mm')} · {corr.corrected_by === c.meId ? 'vous' : corr.corrected_by_role === 'lead' ? 'le chef d’équipe' : 'le bureau'}</small>
            <b>{fmtHeure(corr.old_start)}–{fmtHeure(corr.old_end)} → {fmtHeure(corr.new_start)}–{fmtHeure(corr.new_end)}</b>
            {!corr.notified_at ? <span data-ton="alerte">Pas prévenu{corr.notify_error ? ` (${corr.notify_error})` : ''}</span> : null}
          </li>
        ) : null))}
        {entry.submitted_at ? (
          <li><small>{format(new Date(entry.submitted_at), 'dd/MM HH:mm')} · {c.worker.first_name} {c.worker.last_name}</small><b>Envoyée</b></li>
        ) : null}
        {history.length === 0 && !entry.submitted_at ? <li><b>Pas encore envoyée</b></li> : null}
      </ol>
      {e.afterReturn.length > 0 ? <p className="dz-hb-aide" data-testid="after-return">Changé après renvoi : {e.afterReturn.join(' · ')}</p> : null}
    </PanneauB>
  );
}
const w2 = (c: FicheHeuresCtx) => `${c.worker.first_name} ${c.worker.last_name}`.toUpperCase();

/** « Corriger » (HP04 à HP07) : heures, pause, panier, route, et le motif que le salarié lira. Les états sont ceux de la fiche d'avant. */
function CorrectionV2({ c, entry, apres }: { c: FicheHeuresCtx; entry: ExportEntry; apres: () => void }) {
  const pending = c.editsAvailable
    ? changedKeys(entry, { start_time: c.cStart, end_time: c.cEnd, break_minutes: c.cBreak, meal_allowance: c.cMeal, gap_before: c.cGap })
    : {};
  const prevEnd = c.editsAvailable ? c.previousEnd(entry, c.cStart) : null;
  const cadre = (entry.exported_at || entry.locked);
  const occupe = c.cSaving || c.cReturning;
  const jour = cap(format(parseISO(entry.work_date), 'EEE d', { locale: fr }).replace('.', '.'));
  return (
    <FenetreB feuille open onOpenChange={(o) => { if (!o && !occupe) { c.setCorrectingId(null); c.setActionErr(null); } }} testId="correct-panel"
      kicker={`Corriger · ${w2(c)} · ${jour}`} titre={entry.worksite?.client_name || OTHER_NAME}
      pied={(
        <>
          <button type="button" className="dz-hb-btn" disabled={occupe} onClick={() => { c.setCorrectingId(null); c.setActionErr(null); }}>Annuler</button>
          <button type="button" className="dz-hb-btn" data-ton="principal" data-testid="correct-submit" data-guide="bureau-fiche.corriger-valider"
            disabled={occupe || (c.editsAvailable && (!reasonOk(c.cReason) || Object.keys(pending).length === 0 || !!c.cPauseErr))}
            onClick={() => { void c.doCorrection(entry).then((ok) => { if (ok) apres(); }); }}>
            {c.cSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null} Corriger et prévenir
          </button>
        </>
      )}>
      {cadre ? (
        <div className="dz-hb-note" data-ton="attention">
          {entry.exported_at ? (
            <>
              <b>Cette journée est déjà partie chez le comptable</b>
              <span>Envoyée le {format(parseISO(entry.exported_at), 'd MMMM', { locale: fr })}. La corriger ici ne corrige pas le fichier qu’il a reçu : il faudra le lui renvoyer.</span>
            </>
          ) : (
            <>
              <b>Cette journée est verrouillée</b>
              <span>Sans date d’export connue. La correction reste possible, mais mieux vaut savoir ce qui l’a verrouillée avant.</span>
            </>
          )}
        </div>
      ) : null}
      <div className="dz-hb-champs">
        <div className="dz-hb-champ"><span className="dz-hb-nom">Début</span><TimeField value={c.cStart} onChange={c.setCStart} ariaLabel="Heure de début" onBadChange={c.setCBadStart} /></div>
        <div className="dz-hb-champ"><span className="dz-hb-nom">Fin</span><TimeField value={c.cEnd} onChange={c.setCEnd} ariaLabel="Heure de fin" onBadChange={c.setCBadEnd} /></div>
      </div>
      <p className="dz-hb-aide">Était {fmtHeure(entry.start_time)}–{fmtHeure(entry.end_time)}</p>
      {c.editsAvailable ? (
        <>
          <PausePicker variant="phone" testId="correct-break" vous
            hint="Pendant ces heures. Plusieurs pauses : additionnez-les."
            value={c.cBreak} onChange={c.setCBreak}
            maxExclusive={!c.cBadStart && !c.cBadEnd && c.cStart && c.cEnd && c.cStart !== c.cEnd ? spanMinutes({ start: c.cStart, end: c.cEnd }) : undefined}
            onErrorChange={c.setCPauseErr} />
          {showMealCorrection(c.mealOn, entry.meal_allowance) ? (
            <div className="dz-hb-interrupteur">
              <label>
                <span>Panier</span>
                <input type="checkbox" checked={c.cMeal} onChange={(ev) => c.setCMeal(ev.target.checked)} data-testid="correct-meal" />
                <em>{c.cMeal ? 'Activé' : 'Désactivé'}</em>
                <span className="dz-hb-bouton" aria-hidden="true" />
              </label>
            </div>
          ) : null}
          {prevEnd ? (
            <fieldset className="dz-hb-groupe" data-testid="correct-gap">
              <legend>Temps entre deux chantiers · de {prevEnd} à {c.cStart}</legend>
              <div className="dz-hb-trois">
                <button type="button" aria-pressed={c.cGap === ''} onClick={() => c.setCGap('')}>Aucun</button>
                <button type="button" aria-pressed={c.cGap === 'route'} onClick={() => c.setCGap('route')}>{c.travelPaid ? 'Route payée' : 'Route non payée'}</button>
                <button type="button" aria-pressed={c.cGap === 'pause'} onClick={() => c.setCGap('pause')}>Pause avant</button>
              </div>
            </fieldset>
          ) : null}
          <div className="dz-hb-champ">
            <div className="dz-hb-compteur"><label htmlFor="dz-hb-motif">Motif (lu par le salarié)</label><small>{c.cReason.length}/500</small></div>
            <textarea id="dz-hb-motif" value={c.cReason} onChange={(ev) => c.setCReason(ev.target.value)} maxLength={500} placeholder="ex. : pause oubliée" data-testid="correct-reason"
              aria-invalid={c.cReason.length > 0 && !reasonOk(c.cReason) ? true : undefined} aria-describedby={c.cReason.length > 0 && !reasonOk(c.cReason) ? 'dz-hb-motif-aide' : undefined} />
            {c.cReason.length > 0 && !reasonOk(c.cReason) ? <p id="dz-hb-motif-aide" className="dz-hb-erreur-champ" data-testid="correct-motif-court">Écrivez au moins 3 caractères : le salarié lira ce motif.</p> : null}
          </div>
        </>
      ) : null}
      <p className="dz-hb-aide">Le salarié est prévenu : il reçoit une notification et voit la correction sur sa journée.</p>
      {c.actionErr ? <div role="alert" className="dz-hb-note" data-ton="erreur" data-testid="correct-erreur"><b>Correction non enregistrée</b><span>{c.actionErr}</span></div> : null}
    </FenetreB>
  );
}

/** « Renvoyer la journée du mardi 13 à Alex ? » (HP08, HP09) : la journée repasse en brouillon, le motif est lu par le salarié. */
function RenvoiV2({ c, entry, fermer, apres }: { c: FicheHeuresCtx; entry: ExportEntry; fermer: () => void; apres: () => void }) {
  const [vers, setVers] = useState(false);
  const occupe = c.cReturning || vers;
  const envoyer = async () => {
    setVers(true);
    try { const ok = await c.doReturn(entry); if (ok) apres(); } finally { setVers(false); }
  };
  return (
    <FenetreB open onOpenChange={(o) => { if (!o && !occupe) { fermer(); c.setActionErr(null); } }} testId="renvoi-fenetre"
      kicker="Renvoyer au salarié" titre={`Renvoyer la journée du ${jourLong(entry.work_date)} à ${c.worker.first_name} ?`}
      pied={(
        <>
          <button type="button" className="dz-hb-btn" disabled={occupe} onClick={() => { fermer(); c.setActionErr(null); }}>Annuler</button>
          <button type="button" className="dz-hb-btn" data-ton="encre" data-testid="renvoi-confirmer" disabled={occupe || !reasonOk(c.cReason)} onClick={() => { void envoyer(); }}>
            {occupe ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null} Renvoyer
          </button>
        </>
      )}>
      <p>Elle repasse en brouillon et ne compte plus tant que {c.worker.first_name} ne l’a pas renvoyée. Il voit votre motif.</p>
      <div className="dz-hb-champ">
        <div className="dz-hb-compteur"><label htmlFor="dz-hb-motif-renvoi">Motif (3 à 500 caractères)</label><small>{c.cReason.length}/500</small></div>
        <textarea id="dz-hb-motif-renvoi" value={c.cReason} onChange={(ev) => c.setCReason(ev.target.value)} maxLength={500} data-testid="renvoi-motif"
          aria-invalid={c.cReason.length > 0 && !reasonOk(c.cReason) ? true : undefined} aria-describedby={c.cReason.length > 0 && !reasonOk(c.cReason) ? 'dz-hb-motif-renvoi-aide' : undefined} />
        {c.cReason.length > 0 && !reasonOk(c.cReason) ? <p id="dz-hb-motif-renvoi-aide" className="dz-hb-erreur-champ">Écrivez au moins 3 caractères : le salarié lira ce motif.</p> : null}
      </div>
      {c.actionErr ? <div role="alert" className="dz-hb-note" data-ton="erreur" data-testid="renvoi-erreur"><b>Journée non renvoyée</b><span>{c.actionErr}</span></div> : null}
    </FenetreB>
  );
}

