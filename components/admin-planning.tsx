'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Fragment, type ReactNode } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { PlanningWithWorksite, Worksite, User, Invitation, TimeEntryWithWorksite } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { Textarea } from '@/components/ui/textarea';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Loader2,
  UserPlus, Users, Building2, Archive, CalendarRange, Download, FileSpreadsheet, FileText,
  Bell, Mail, Pencil, LogOut, Settings, User as UserIcon, Paperclip, AlertTriangle, Info, Hammer, CheckCircle2, Menu, TrendingUp, Palmtree,
  Check, CheckSquare,
  Image as ImageIcon,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, pointerWithin, rectIntersection,
  type DragEndEvent, type DragStartEvent, type CollisionDetection,
} from '@dnd-kit/core';
import { format, addDays, addWeeks, subWeeks, subMonths, endOfMonth, parseISO, getISOWeek } from 'date-fns';
import { DAYS_IN_WEEK, weekDays as buildWeekDays, weekDayIndex, weekStart } from '@/lib/week';
import { DEFAULT_WEEKLY_HOURS, DEFAULT_OVERTIME_RATES, weeklyHoursFor } from '@/lib/overtime';
import { weekStart as weekStartOf, weekEnd as weekEndOf } from '@/lib/week';
import { fr } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { toast } from 'sonner';
import { computeMissingDays, missingWindowStart, withIncompleteDays } from '@/lib/work-status';
import { isExitToComplete, type QrFields } from '@/lib/qr-entry';
import { exportEntriesToExcel, exportEntriesToPDF, exportEntriesToCSV, excelAsBase64 } from '@/lib/export-utils';
import { fetchAllPaged, chunk } from '@/lib/fetch-all';
import { isPreviewHost } from '@/lib/hosting';
import WorkerDetailDialog from '@/components/worker-detail';
import ChantierDocuments from '@/components/chantier-documents';
import { TimeField, TIME_HINT } from '@/components/time-field';
import { TIME_PRESETS } from '@/lib/time-input';
import { InfoTip } from '@/components/ui/info-tip';
import { ExportMenu } from '@/components/export-menu';
import { ActionDone, type UndoResult } from '@/components/action-done';
import { erasePlanning, isDisposableDraft, prepareMove, undoErase, undoMovePrep, type EraseResult, type MovePrep } from '@/lib/erase';
import { fetchCompanyClosures, closedFor } from '@/lib/worker-closure';
import { isReserveLifted } from '@/lib/reserves';
import CompanySettings from '@/components/company-settings';
import AssistantPanel from '@/components/assistant-panel';
import PendingInvitations from '@/components/pending-invitations';
import { attributeEntries, closeMonth as closeMonthWrite, sendHoursReminder, setUserRole, setWorksiteActive, updatePlanningSlot, updateWorksite } from '@/lib/admin-writes';
import { addPlanningSlot, createWorksite, inviteWorker, setAbsence } from '@/lib/planning-writes';
import { supabaseAssistantSource } from '@/lib/assistant';
import AssistantActionCard from '@/components/assistant-action-card';
import { makeActionExecutor, type ActionExtra } from '@/lib/assistant-actions';
import { useAiEnabled } from '@/lib/real-cost';
import AdminMobileMenu from '@/components/admin-mobile-menu';
import ImportDialog from '@/components/import-dialog';
import CostReport from '@/components/cost-report';
import ReservesReport from '@/components/reserves-report';
import ImportWorkersDialog from '@/components/import-workers-dialog';
import LeaveAdminDialog from '@/components/leave-admin-dialog';
import { CHANTIER_PALETTES, hashStr, LiveLine, PL_GRID_CSS, PlannedBubbleView, type ChantierPalette } from '@/components/planning-bubble';
import { cellKey, parisDay, placeLive, type LivePlace, type LiveSessionLike } from '@/supabase/functions/_shared/live-place';
import { copyRefusal, targetRefusal } from '@/supabase/functions/_shared/copy-slot';
import KioskAdmin from '@/components/kiosk-admin';
import { keep } from '@/lib/same';

// ─── helpers / constants ──────────────────────────────────────────────────────

// « À relancer » : mois précédent + mois en cours (lot 12, lib/work-status missingWindowStart).
// Lot 9 : « en cours depuis » relu toutes les 30 s (en pause quand l'onglet est caché).
const LIVE_POLL_MS = 30000;

// « 1 journée non envoyée » / « 8 journées non envoyées ».
const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m.toString().padStart(2, '0')}`;
}
/**
 * Empreinte de l'envoi au comptable : entreprise + période + contenu exact du
 * tableur. Deux clics sur le MÊME export donnent la même clé — le serveur
 * reconnaît alors un envoi déjà parti plutôt que d'en expédier un second. Un
 * export refait après correction des heures donne une clé différente, et part.
 *
 * Ce n'est pas un usage cryptographique : sur un navigateur sans `crypto.subtle`
 * (contexte non sécurisé), on retombe sur un condensé maison. Deux fichiers
 * distincts de la même entreprise et de la même période auraient alors une
 * chance négligeable de se confondre, et le pire serait un envoi non répété.
 */
async function sendKey(companyId: string, from: string, to: string, content: string): Promise<string> {
  const seed = `${companyId}|${from}|${to}|${content.length}|${content}`;
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < seed.length; i++) {
      h1 = Math.imul(h1 ^ seed.charCodeAt(i), 0x01000193) >>> 0;
      h2 = Math.imul(h2 + seed.charCodeAt(i), 0x85ebca6b) >>> 0;
    }
    return `f${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}${companyId.slice(0, 8)}${from}${to}`;
  }
}

// Format compact pour les stats du cockpit (30000 -> "30k").
function fmtStat(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '').replace('.', ',')}k`;
  return String(n);
}

// Colour belongs to the CHANTIER (stable all week), not the poseur.
// Palette BTP noir/jaune : barre de couleur du chantier + tag « Prévu » assorti.
// (palette et empreinte partagées avec la borne : components/planning-bubble.tsx)

const ABSENCE_LABELS: Record<string, string> = { conge: 'Congé', maladie: 'Maladie', intemperie: 'Intempérie', repos: 'Repos' };
const ABSENCE_STATUS_LABELS: Record<string, string> = { conge: 'Congé', maladie: 'Arrêt maladie', intemperie: 'Intempérie', repos: 'Repos' };
const ABSENCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'conge', label: 'Congé' },
  { value: 'maladie', label: 'Arrêt maladie' },
  { value: 'intemperie', label: 'Intempérie' },
  // « Repos » n'est pas proposé : la base le refuse (planning_absence_type_check).
];

// Open-ended absences are materialised up to this horizon (no DB column to store
// an "until further notice" flag); the secretary ends them by setting "Présent".
const HORIZON_DAYS = 90;

const HATCH_STYLE = {
  backgroundImage:
    'repeating-linear-gradient(45deg, rgba(110,106,99,0.18) 0, rgba(110,106,99,0.18) 5px, transparent 5px, transparent 10px)',
};
// Trick to let a child `h-full` stretch to the table-row height.
const CELL_HEIGHT_HACK = { height: '1px' } as const;
// Hauteur d'une ligne « fantôme » de remplissage (≈ une ligne salarié vide standard).
const GHOST_ROW_H = 105;

// Lot 11 : « Horaire prévu : début – fin », les deux facultatifs. Une fin sans
// début est refusée (la borne et l'écran du salarié lisent le début d'abord).
const scheduleError = (start: string, end: string): string | null => {
  if (end && !start) return 'Indiquez aussi le début';
  if (start && end && end <= start) return 'La fin doit être après le début';
  return null;
};
const EMPTY_SET: Set<string> = new Set();
/** Lot 11 : identifiants des cases retirées par le salarié, triés (keep() compare le contenu ET l'ordre). */
const withdrawnSet = (rows: { planning_id: string | null }[] | null): Set<string> =>
  new Set((rows || []).map((r) => r.planning_id).filter((id): id is string => !!id).sort());
// Lot 7 : horaire prévu affiché sur la bulle — « 14:00 » (RDV) ou « 14:00–18:00 ».
const plannedHoursOf = (p: PlanningWithWorksite): string | null =>
  p.estimated_start ? `${p.estimated_start.slice(0, 5)}${p.estimated_end ? `–${p.estimated_end.slice(0, 5)}` : ''}` : null;
// « Autre » (intervention hors client, ajoutée par l'assistant) : son titre est la note.
const bubbleTitleOf = (p: PlanningWithWorksite): string =>
  (p.worksite?.client_name === 'Autre' && p.notes?.trim()) || p.worksite?.client_name || 'Chantier';

// Display order inside a cell: manual position first (asc), then creation order.
const orderCmp = (a: PlanningWithWorksite, b: PlanningWithWorksite) => {
  const pa = a.position ?? null;
  const pb = b.position ?? null;
  if (pa !== null && pb !== null) return pa - pb;
  if (pa !== null) return -1;
  if (pb !== null) return 1;
  return (a.created_at || '').localeCompare(b.created_at || '');
};

// Prefer a bubble droppable under the pointer, else fall back to the cell.
const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  const bub = within.find((c) => String(c.id).startsWith('bub|'));
  if (bub) return [bub];
  if (within.length) return within;
  return rectIntersection(args);
};

const paletteFor = (p: PlanningWithWorksite) =>
  CHANTIER_PALETTES[hashStr(p.worksite_id || p.id) % CHANTIER_PALETTES.length];

type ReceptionStatus = 'sans' | 'avec' | 'en_cours' | null;
const RECEPTION_RANK: Record<string, number> = { avec: 3, en_cours: 2, sans: 1 };
interface RealAgg { minutes: number; start: string; end: string; count: number; reception: ReceptionStatus;
  /** Au moins une réserve de cette case n'a pas encore été levée par le bureau. */
  reserveOpen: boolean; note: string }
const realKey = (userId: string, date: string, worksiteId: string | null) => `${userId}|${date}|${worksiteId}`;
/** Un brouillon tel que la grille le lit (lot 2 : de quoi reconnaître le brouillon vide). */
interface DraftRow {
  id?: string; status?: string; user_id: string; work_date: string; worksite_id: string | null; planning_id?: string | null;
  start_time: string; end_time: string; total_minutes: number; reception: string | null; reserve_resolved_at: string | null;
  reserve_fixed_at?: string | null; observation: string | null; locked?: boolean; exit_forgotten?: boolean | null; submitted_at?: string | null;
}
// `exit_forgotten` (lot 12) peut manquer en base : la lecture est refaite sans elle.
const DRAFT_COLS = 'id, status, user_id, work_date, worksite_id, planning_id, start_time, end_time, total_minutes, reception, reserve_resolved_at, reserve_fixed_at, observation, locked, submitted_at';

/** Une pièce jointe telle que le panneau « pièces » du cockpit la montre. */
interface DocLine {
  id: string;
  worksite_id: string | null;
  label: string | null;
  file_name: string | null;
  mime_type: string | null;
  work_date: string | null;
  created_at: string;
}

// ─── compact one-line chantier bubble ──────────────────────────────────────────

function BubbleContent({ p, palette, real, draft, docCount = 0, live, withdrawn }: { p: PlanningWithWorksite; palette: ChantierPalette; real?: RealAgg; draft?: RealAgg; docCount?: number;
  /** Lot 9 : pointage en direct ouvert sur cette bulle → « en cours depuis HH:MM ». */
  live?: string;
  /** Lot 2 : le salarié l'a retirée (« je n'y suis pas allé ») — bulle éteinte, supprimable. */
  withdrawn?: boolean }) {
  const hour = plannedHoursOf(p);
  const isOther = p.worksite?.client_name === 'Autre' && !!p.notes?.trim();
  const sub = isOther ? 'Autre' : [p.worksite?.product_type, p.worksite?.city].filter(Boolean).join(' · ');
  // Repères compacts (icônes, pas de texte) alignés à droite du nom — voir la légende.
  const docs = docCount > 0 ? (
    <span className="bt-pl-bub-docs" title={`${docCount} document${docCount > 1 ? 's' : ''}`}><Paperclip className="h-2.5 w-2.5" />{docCount}</span>
  ) : null;
  if (real) {
    // Pointé (réel) — fond noir, heures réelles en mono jaune.
    return (
      <div className="bt-pl-bub" style={{ background: '#15120F', color: '#F2EDE3' }}>
        <span className="bt-pl-bub-bar" style={{ background: palette.bar }} />
        <div className="bt-pl-bub-name">
          <span className="bt-pl-bub-title">{p.worksite?.client_name || 'Chantier'}</span>
          <span className="bt-pl-bub-ic">
            {p.added_by_worker && <span className="bt-pl-ic" title="Ajouté par le salarié" style={{ color: '#FFC21A' }}><UserIcon className="h-3 w-3" /></span>}
            {real.reception === 'avec' && (
              real.reserveOpen
                ? <span className="bt-pl-ic" title="Réception avec réserve — à traiter" style={{ color: '#F0915A' }}><AlertTriangle className="h-3 w-3" /></span>
                : <span className="bt-pl-ic" title="Réception avec réserve — levée" style={{ color: '#8a8378' }}><AlertTriangle className="h-3 w-3" /></span>
            )}
            {real.reception === 'sans' && <span className="bt-pl-ic" title="Réceptionné sans réserve" style={{ color: '#46C281' }}><CheckCircle2 className="h-3 w-3" /></span>}
            {real.reception === 'en_cours' && <span className="bt-pl-ic" title="Chantier en cours" style={{ color: '#E6B23C' }}><Hammer className="h-3 w-3" /></span>}
            {docs}
          </span>
        </div>
        {sub && <div className="bt-pl-bub-sub" style={{ color: '#a59c86' }}>{sub}</div>}
        <div className="bt-pl-bub-real">
          <span className="bt-pl-check">✓</span>
          <span className="bt-pl-real-txt">{real.start.slice(0, 5)}–{real.end.slice(0, 5)} · {formatMinutes(real.minutes)}</span>
        </div>
        {live && <LiveLine since={live} dark />}
      </div>
    );
  }
  // Saisi mais pas encore envoyé — le bureau doit le voir, sinon des heures
  // existent sans que personne le sache (elles ne comptent nulle part tant
  // qu'elles ne sont pas envoyées : ni total, ni export).
  if (draft) {
    return (
      <div className="bt-pl-bub" style={{ background: '#fff', border: `1.5px dashed ${palette.bar}`, color: '#15120F' }}>
        <span className="bt-pl-bub-bar" style={{ background: palette.bar }} />
        <div className="bt-pl-bub-name">
          <span className="bt-pl-bub-title">{p.worksite?.client_name || 'Chantier'}</span>
          <span className="bt-pl-bub-ic">
            {p.added_by_worker && <span className="bt-pl-ic" title="Ajouté par le salarié" style={{ color: '#caa01a' }}><UserIcon className="h-3 w-3" /></span>}
            {docs}
          </span>
        </div>
        {sub && <div className="bt-pl-bub-sub" style={{ color: '#6E6A63' }}>{sub}</div>}
        <div className="bt-pl-bub-draft" title="Le salarié a saisi ses heures mais ne les a pas encore envoyées">
          {draft.start.slice(0, 5)}–{draft.end.slice(0, 5)} · {formatMinutes(draft.minutes)} · à envoyer
        </div>
        {live && <LiveLine since={live} />}
      </div>
    );
  }
  // Prévu — fond blanc, pointillé couleur chantier (même rendu que la borne).
  return <PlannedBubbleView title={bubbleTitleOf(p)} sub={sub} hours={hour} palette={palette} docs={docs} live={live} withdrawn={withdrawn} />;
}

/** Lot 11 : état d'une bulle en mode « Sélectionner » (absent hors de ce mode). */
interface SelState { on: boolean; lock: string | null }

/** La case à cocher (ou le 🔒 et sa raison) posée sur une bulle en mode « Sélectionner ». */
function SelMark({ sel }: { sel: SelState }) {
  return sel.lock
    ? <span className="bt-pl-sellock" aria-hidden="true">🔒</span>
    : <span className="bt-pl-selbox" aria-hidden="true">{sel.on && <Check className="h-3 w-3" strokeWidth={3.5} />}</span>;
}
const selClass = (sel: SelState) => `bt-pl-sel${sel.lock ? ' lock' : sel.on ? ' on' : ''}`;
const selAttr = (sel: SelState) => (sel.lock ? 'lock' : sel.on ? 'on' : 'off');

// A bubble is both draggable (move/reorder) and droppable (reorder target).
// Lot 11 : en mode « Sélectionner » (sel défini), le clic coche au lieu d'ouvrir,
// et le glisser est coupé. Hors de ce mode, le rendu est EXACTEMENT celui d'avant.
// Lot 2 : Ctrl ou Alt (⌥) maintenu pendant le glisser = COPIER. `data-bub` reste
// posé en permanence (repère des tests) : `data-pid` n'existe qu'en sélection.
function DraggableBubble({
  p, palette, real, draft, onEdit, docCount = 0, live, sel, onToggle, withdrawn,
}: {
  p: PlanningWithWorksite;
  palette: ChantierPalette;
  real?: RealAgg;
  draft?: RealAgg;
  onEdit: (p: PlanningWithWorksite) => void;
  docCount?: number;
  /** Lot 9 : bulle désignée par placeLive → « en cours depuis HH:MM ». */
  live?: string;
  sel?: SelState;
  onToggle?: (p: PlanningWithWorksite, lock: string | null) => void;
  withdrawn?: boolean;
}) {
  const drag = useDraggable({ id: p.id, data: { type: 'move' }, disabled: !!sel });
  const drop = useDroppable({ id: `bub|${p.id}` });
  return (
    <div ref={drop.setNodeRef} className={sel ? selClass(sel) : drop.isOver ? 'bt-pl-bub-over' : ''}
      data-sel={sel ? selAttr(sel) : undefined} data-pid={sel ? p.id : undefined} data-bub={p.id}>
      <div
        ref={drag.setNodeRef}
        {...drag.attributes}
        {...drag.listeners}
        onClick={(e) => { e.stopPropagation(); if (sel) onToggle?.(p, sel.lock); else onEdit(p); }}
        className={`bt-pl-grab ${drag.isDragging ? 'bt-pl-dragging' : ''}`}
        title={sel ? (sel.lock || (sel.on ? 'Cliquer pour décocher' : 'Cliquer pour cocher')) : 'Glisser pour déplacer · Ctrl ou Alt (⌥) + glisser pour copier · cliquer pour modifier'}
      >
        <BubbleContent p={p} palette={palette} real={real} draft={draft} docCount={docCount} live={live} withdrawn={withdrawn} />
      </div>
      {sel && <SelMark sel={sel} />}
    </div>
  );
}

// Lot 11 : « Horaire prévu : début – fin » — saisie simple (« 14h », « 14:30 » ou
// liste au quart d'heure), plus de roulette. Préréglages en un toucher.
function ScheduleRow({ start, end, onStart, onEnd, testId, onBadChange }: {
  start: string; end: string; onStart: (v: string) => void; onEnd: (v: string) => void; testId: string;
  /** Une heure tapée mais illisible : l'enregistrement est bloqué (sinon l'ancienne heure partirait en silence). */
  onBadChange?: (bad: boolean) => void;
}) {
  const [badStart, setBadStart] = useState(false);
  const [badEnd, setBadEnd] = useState(false);
  // Préréglage / « Effacer » : les champs repartent de zéro, même si la valeur ne change pas (« 7h75 » tapé sur 08:00).
  const [rev, setRev] = useState(0);
  const bad = badStart || badEnd;
  useEffect(() => { onBadChange?.(bad); }, [bad]); // eslint-disable-line react-hooks/exhaustive-deps
  const err = bad ? `Heure non comprise. ${TIME_HINT}` : scheduleError(start, end);
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <div className="flex items-center gap-1.5">
        <Label>Horaire prévu</Label>
        <span className="text-xs text-muted-foreground">facultatif</span>
        <InfoTip testId={`${testId}-info`} text="Tapez « 14h » ou « 14:30 », ou choisissez dans la liste. Rendez-vous à heure fixe : mettez aussi une fin, sinon le salarié ne voit pas l'heure." />
      </div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1"><TimeField key={`s${rev}`} value={start} onChange={onStart} ariaLabel="Début" placeholder="début" testId={`${testId}-start`} onBadChange={setBadStart} /></div>
        <span aria-hidden="true" className="font-bold text-muted-foreground">–</span>
        <div className="min-w-0 flex-1"><TimeField key={`e${rev}`} value={end} onChange={onEnd} ariaLabel="Fin" placeholder="fin" testId={`${testId}-end`} invalid={!bad && !!err} onBadChange={setBadEnd} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {TIME_PRESETS.map((t) => (
          <button key={t.label} type="button" data-testid={`${testId}-preset`}
            onClick={() => { onStart(t.debut); onEnd(t.fin); setRev((r) => r + 1); }}
            className={`rounded-full border px-2.5 py-1 text-[12px] font-bold ${start === t.debut && end === t.fin ? 'border-[#15120F] bg-[#FFC21A] text-[#15120F]' : 'border-[#15120F]/20 bg-white hover:border-[#15120F]/60'}`}>
            {t.label} <span className="font-mono text-[11px] font-semibold opacity-70">{t.debut}–{t.fin}</span>
          </button>
        ))}
        {(start || end || bad) && (
          <button type="button" className="px-1 text-[12px] font-semibold text-muted-foreground underline hover:text-foreground"
            onClick={() => { onStart(''); onEnd(''); setRev((r) => r + 1); }}>Effacer</button>
        )}
      </div>
      {err && <p className="text-[12.5px] font-semibold text-[#C0461F]" role="alert" data-testid={`${testId}-error`}>{err}</p>}
    </div>
  );
}

// Lot 9 : pointage en direct sur un chantier ABSENT du planning de ce jour
// (scan de la borne, « Autre »…). La case passe en vert et on dit où il est —
// sans l'accrocher à une bulle qui n'est pas la sienne.
function LiveChip({ since, name }: { since: string; name: string }) {
  return (
    <div className="bt-pl-livechip" data-testid="live-chip"
      title="Pointage en direct — compté nulle part tant que la journée n'est pas fermée"
      onClick={(e) => e.stopPropagation()}>
      <span className="bt-pl-live-dot" aria-hidden />
      <span style={{ minWidth: 0 }}>
        <span className="t">en cours depuis <span style={{ whiteSpace: 'nowrap' }}>{since}</span></span>
        <span className="sep"> · </span><span className="nm">{name}</span>
      </span>
    </div>
  );
}

// Une ligne du menu « + Chantier » : attrapable (drag → crée une affectation).
// Chaque ligne porte son propre worksiteId ; les handlers dnd lisent data.worksiteId.
function PaletteRow({ worksite, color }: { worksite: Worksite; color: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-new-${worksite.id}`,
    data: { type: 'new', worksiteId: worksite.id },
  });
  // « Autre » est le fourre-tout créé par la base pour chaque entreprise : il
  // n'a pas de ville, et il ne doit pas en afficher une. S'il en porte une,
  // c'est qu'elle a été saisie à la main — elle ne décrit alors plus rien, et
  // on ne la montre pas. Le salarié qui le choisit peut, lui, le nommer.
  const isOther = worksite.client_name === 'Autre';
  const sub = isOther
    ? 'Chantier non listé — le salarié le nomme'
    : [worksite.product_type, worksite.city].filter(Boolean).join(' · ');
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`bt-pl-ddrow ${isDragging ? 'bt-pl-dragging' : ''}`}
      title="Glisser sur une case du planning"
    >
      <span className="bt-pl-grip"><span /><span /><span /></span>
      <span className="bt-pl-pilldot" style={{ background: color }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="bt-pl-ddname">{worksite.client_name}</span>
        {sub && <span className="bt-pl-ddsub">{sub}</span>}
      </span>
    </div>
  );
}

function DroppableCell({
  workerId, dateStr, isToday, live = false, children,
}: {
  workerId: string;
  dateStr: string;
  isToday: boolean;
  /** Lot 9 : le salarié a un pointage en direct ouvert ce jour-là → case verte. */
  live?: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${workerId}|${dateStr}` });
  return (
    <td
      ref={setNodeRef}
      style={CELL_HEIGHT_HACK}
      className={`bt-pl-cell ${isOver ? 'bt-pl-cell-over' : live ? 'bt-pl-cell-live' : isToday ? 'bt-pl-cell-today' : ''}`}
      data-live={live ? '1' : undefined}
    >
      <div className="bt-pl-cellinner">
        {children}
        {isOver && (
          // Lot 2 : « Copier ici » remplace « Déposer ici » quand Ctrl / Alt est
          // maintenu — basculé par la classe .bt-pl--copying, sans prop de plus.
          <div className="bt-pl-drop">
            <span className="bt-pl-drop-arrow"><span className="mv">↓</span><span className="cp">+</span></span>
            <span className="mv">Déposer ici</span><span className="cp">Copier ici</span>
          </div>
        )}
      </div>
    </td>
  );
}

// Stable colour for a chantier (legend + mobile) — same hash as paletteFor.
const colorForWorksite = (worksiteId: string | null | undefined): ChantierPalette =>
  CHANTIER_PALETTES[hashStr(worksiteId || 'x') % CHANTIER_PALETTES.length];

// Avatar « haut de gamme » : pastille pastel propre à CHAQUE personne (tagBg,
// le pastel conçu avec la palette) + initiales noir marque — lisibles sur les
// 7 teintes (les tons colorés passaient sous le seuil de contraste AA en 13 px).
// Absent = grisé, comme avant. Sans lien avec la couleur des bulles (chantier).
const avatarTint = (personId: string, absent: boolean) => {
  if (absent) return { background: '#c4bdae', color: '#15120F' };
  return { background: CHANTIER_PALETTES[hashStr(personId) % CHANTIER_PALETTES.length].tagBg, color: '#15120F' };
};

const ABSENCE_VISUAL: Record<string, { icon: string; bg: string; fg: string }> = {
  conge: { icon: '🌴', bg: 'repeating-linear-gradient(45deg,#E7E1D5 0 8px,#DDD5C6 8px 16px)', fg: '#7c766c' },
  repos: { icon: '💤', bg: 'repeating-linear-gradient(45deg,#ECE6DA 0 7px,#E4DCCE 7px 14px)', fg: '#9a948a' },
  intemperie: { icon: '🌧️', bg: 'repeating-linear-gradient(45deg,#E0E4E7 0 8px,#D2D7DB 8px 16px)', fg: '#5e6a72' },
  maladie: { icon: '🤒', bg: 'repeating-linear-gradient(45deg,#EBE0DC 0 8px,#E0D2CD 8px 16px)', fg: '#8a6a60' },
};

// Scoped noir/jaune styling for the planning. Logic-free — appearance only.
const PL_CSS = `
@import url('/fonts/fonts.css');
.bt-pl{font-family:'Archivo',sans-serif;color:#15120F;flex:1 0 auto;display:flex;flex-direction:column;border-radius:16px;box-shadow:0 26px 64px -36px rgba(21,18,15,.6)}
.bt-pl *{box-sizing:border-box}
.bt-pl .mono{font-family:'JetBrains Mono',monospace}
/* ===== BARRE UNIQUE pleine largeur (sticky) — pas de cadre ===== */
/* groupes logiques : [légende·Salariés·Clients]  [semaine]  [Exporter·compte] */
.bt-pl-ai{color:#15120F}.bt-pl-ai svg{color:#C99300}
.bt-pl-bar{position:sticky;top:0;z-index:30;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;background:#fff;border-bottom:2px solid #15120F;padding:9px 16px;border-radius:0}
.bt-pl-bar>.bt-pl-group:last-child{justify-self:end}
.bt-pl-group{display:flex;align-items:center;gap:10px}
/* ===== COCKPIT : tableau de bord sombre ===== */
/* Lot 9 : « journées non envoyées » / « h validées » + « en direct » allongent les
   chiffres. Sous 1280 px (iPad paysage 1024, toujours en mise en page bureau), les
   chiffres passent sur deux lignes : forcer leur largeur poussait la colonne de droite
   (essai + compte) par-dessus le logo. Dès 1280 px, la 1re colonne garde leur largeur
   (logo un peu décalé si besoin) plutôt que de renvoyer « en direct » seul sur une
   2e ligne ; la colonne de droite reste en 1fr (jamais sous la largeur de son contenu). */
.bt-pl-cockpit{display:grid;grid-template-columns:minmax(max-content,1fr) auto minmax(max-content,1fr);align-items:center;gap:14px;background:#15120F;color:#F2EDE3;padding:5px 14px 5px 18px;min-height:44px;border-radius:16px 16px 0 0}
/* Lot 10 : barre plus fine et rangée — logo à gauche, chiffres au centre, entreprise
   à droite. Les chiffres restent sur UNE ligne (nowrap) ; sous 1280 px (iPad paysage
   1024) tout se resserre un peu au lieu de passer sur deux lignes. */
.bt-pl-logo{font-family:'Archivo',sans-serif;font-weight:900;letter-spacing:-.03em;font-size:25px;line-height:1;color:#fff;white-space:nowrap;flex:none}
.bt-pl-cockpit .bt-pl-logo{font-size:21px;justify-self:start}
.bt-pl-logo .x{color:#FFC21A}
.bt-pl-stats{display:flex;align-items:center;gap:2px;flex-wrap:nowrap;min-width:0;justify-self:center}
.bt-pl-stat{display:inline-flex;align-items:center;gap:7px;padding:3px 11px;white-space:nowrap;position:relative}
@media (max-width:1279px){
  .bt-pl-cockpit{gap:10px;padding:5px 10px 5px 14px}
  .bt-pl-cockpit .bt-pl-logo{font-size:18px}
  .bt-pl-cockpit .bt-pl-stat{gap:5px;padding:3px 6px}
  .bt-pl-cockpit .bt-pl-stat .v{font-size:13.5px}
  .bt-pl-cockpit .bt-pl-stat .l{font-size:10.5px}
  .bt-pl-cockpit button.bt-pl-stat .ch{display:none}
  .bt-pl-cockpit .bt-pl-trial{gap:6px;padding:3px 4px 3px 10px;font-size:11px}
  .bt-pl-cockpit .bt-pl-trial .cta{padding:4px 10px;font-size:11px}
  .bt-pl-cockpit .bt-pl-acct-name{max-width:96px}
  .bt-pl-cockpit-right{gap:8px}
  /* Barre d'actions : mêmes boutons, un peu resserrés (place pour « Borne »). */
  .bt-pl-bar{grid-template-columns:minmax(max-content,1fr) auto minmax(max-content,1fr);gap:8px;padding:9px 10px}
  .bt-pl-bar .bt-pl-group{gap:6px}
  .bt-pl-bar .bt-pl-out{padding:7px 9px}
  .bt-pl-bar .bt-pl-fill{padding:8px 10px}
  .bt-pl-bar .bt-pl-segbtn{padding:7px 8px}
  .bt-pl-bar .bt-pl-seg{gap:4px}
  .bt-pl-bar .bt-pl-datebox{padding:0 10px;gap:7px}
}
/* Le trait vertical se trace entre deux CONTENEURS : depuis que le panneau est
   le frère du bouton, c'est le conteneur qui se répète, plus le chiffre. */
.bt-pl-statwrap{position:relative}
.bt-pl-statwrap + .bt-pl-statwrap::before{content:"";position:absolute;left:0;top:50%;transform:translateY(-50%);width:1px;height:18px;background:rgba(242,237,227,.15)}
.bt-pl-stat .sd{width:7px;height:7px;border-radius:50%;flex:none}
.bt-pl-stat .v{font-family:'JetBrains Mono',monospace;font-weight:800;font-size:15px;color:#F2EDE3;font-variant-numeric:tabular-nums}
.bt-pl-stat .l{font-size:11px;font-weight:600;color:#a59c86}
.bt-pl-stat.warn .v{color:#FFC21A}

/* Un chiffre du cockpit qui s'ouvre. Le bouton EST le .bt-pl-stat, pour ne pas
   casser le séparateur « .bt-pl-stat + .bt-pl-stat::before » : un conteneur
   intermédiaire aurait supprimé les traits verticaux entre les chiffres. */
button.bt-pl-stat{font:inherit;background:none;border:0;border-radius:9px;cursor:pointer;-webkit-appearance:none}
button.bt-pl-stat:hover{background:rgba(242,237,227,.09)}
button.bt-pl-stat[aria-expanded="true"]{background:rgba(242,237,227,.14)}
button.bt-pl-stat:focus-visible{outline:2px solid #FFC21A;outline-offset:1px}
button.bt-pl-stat .ch{opacity:0;font-size:9px;color:#a59c86;margin-left:-3px;transition:opacity .12s}
button.bt-pl-stat:hover .ch,button.bt-pl-stat[aria-expanded="true"] .ch{opacity:1}

/* Le panneau d'un chiffre. Aligné à gauche sous son chiffre, jamais au-delà
   du bord de l'écran sur un portable posé en paysage. */
.bt-pl-sp{position:absolute;top:calc(100% + 9px);left:0;z-index:45;width:330px;max-width:min(330px,92vw);white-space:normal;text-align:left;background:#fff;color:#15120F;border:1px solid rgba(21,18,15,.14);border-radius:14px;box-shadow:0 24px 50px -18px rgba(21,18,15,.45);overflow:hidden;cursor:default}
.bt-pl-sp-h{display:flex;align-items:baseline;gap:6px;padding:9px 13px 7px;border-bottom:1px solid rgba(21,18,15,.08);font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#9a948a;font-weight:700}
.bt-pl-sp-h .n{font-size:11px;color:#15120F}
.bt-pl-sp-list{max-height:330px;overflow-y:auto}
.bt-pl-sp-empty{padding:20px 13px;text-align:center;color:#9a948a;font-size:12.5px;font-weight:600;line-height:1.45}
.bt-pl-sp-row{display:flex;align-items:center;gap:9px;width:100%;padding:8px 13px;border:0;background:none;font:inherit;text-align:left;border-top:1px solid rgba(21,18,15,.05)}
.bt-pl-sp-list > *:first-child{border-top:0}
button.bt-pl-sp-row{cursor:pointer}
button.bt-pl-sp-row:hover{background:#F9F5EC}
.bt-pl-sp-row .nm{flex:1;min-width:0;font-size:13.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-pl-sp-row .sub{display:block;font-size:11px;font-weight:500;color:#8a8378;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-pl-sp-row .amt{font-family:'JetBrains Mono',monospace;font-size:12.5px;font-weight:800;color:#15120F;flex:none;font-variant-numeric:tabular-nums}
.bt-pl-sp-row .amt.warn{color:#B5472E}
/* Lot 11 : « À relancer » — une ligne = le nom (ouvre la fiche), ses jours, « Relancer ». */
.bt-pl-sp-who{flex:1;min-width:0;display:flex;align-items:center;background:none;border:0;padding:0;font:inherit;text-align:left;cursor:pointer;color:inherit}
.bt-pl-sp-who:hover .nm{text-decoration:underline}
.bt-pl-sp-act{flex:none;display:inline-flex;align-items:center;gap:5px;border:1.5px solid rgba(21,18,15,.18);background:#fff;color:#15120F;border-radius:8px;padding:4px 9px;font:inherit;font-size:12px;font-weight:800;cursor:pointer}
.bt-pl-sp-act:hover{border-color:#15120F}
.bt-pl-sp-act:disabled{opacity:.5;cursor:default}
.bt-pl-sp-done{flex:none;font-size:12px;font-weight:800;color:#1F7A4D;white-space:nowrap}
.bt-pl-sp-grp{display:flex;align-items:center;gap:7px;width:100%;padding:7px 13px 5px;border:0;background:#FBF8F1;font:inherit;text-align:left;cursor:pointer;border-top:1px solid rgba(21,18,15,.05)}
.bt-pl-sp-grp:hover{background:#F4EEE1}
.bt-pl-sp-grp .nm{flex:1;min-width:0;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;color:#6b6459;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-pl-sp-grp .amt{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:800;color:#9a948a}
.bt-pl-sp-doc{display:flex;align-items:center;gap:8px;padding:6px 13px 6px 22px;font-size:12.5px}
.bt-pl-sp-doc .nm{flex:1;min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-pl-sp-doc .dt{font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#9a948a;flex:none}
.bt-pl-sp-foot{padding:7px 13px;border-top:1px solid rgba(21,18,15,.08);background:#FBF8F1;font-size:11px;color:#8a8378;font-weight:600;line-height:1.4}

.bt-pl-cockpit-right{justify-self:end;display:flex;align-items:center;gap:11px;min-width:max-content}
.bt-pl-trial{display:inline-flex;align-items:center;gap:8px;background:#211B14;border:1px solid rgba(255,194,26,.4);color:#F2EDE3;border-radius:999px;padding:4px 5px 4px 13px;font-size:12px;font-weight:600;white-space:nowrap}
.bt-pl-trial .d{width:7px;height:7px;border-radius:50%;background:#FFC21A;box-shadow:0 0 9px rgba(255,194,26,.8);flex:none}
.bt-pl-trial b{color:#FFC21A;font-weight:800}
.bt-pl-trial.expired{border-color:rgba(216,90,48,.55)}
.bt-pl-trial.expired .d{background:#D85A30;box-shadow:0 0 9px rgba(216,90,48,.8)}
.bt-pl-trial .cta{background:linear-gradient(180deg,#FFCB3D,#F5B400);color:#15120F;border:none;font-family:inherit;font-weight:800;font-size:11.5px;padding:5px 12px;border-radius:999px;cursor:pointer}
.bt-pl-trial.expired .cta{background:linear-gradient(180deg,#E8794D,#D85A30);color:#fff}
/* compte, version cockpit sombre */
.bt-pl-cockpit .bt-pl-acct{border-color:rgba(242,237,227,.22);height:31px}
.bt-pl-cockpit .bt-pl-acctmenu{top:39px}
.bt-pl-cockpit .bt-pl-acct:hover{border-color:rgba(242,237,227,.55);background:rgba(242,237,227,.06)}
.bt-pl-cockpit .bt-pl-acct-av{background:#FFC21A;color:#15120F}
.bt-pl-cockpit .bt-pl-acct-name{color:#F2EDE3}
.bt-pl-cockpit .bt-pl-acct-car{color:#a59c86}
/* entête mobile : logo + essai */
.bt-pl-m-brand{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.bt-pl-m-brand .bt-pl-logo{font-size:18px}
/* Lot 10 : en-tête mobile rangé — logo + entreprise à gauche, essai, actions à droite,
   puis les chiffres du cockpit en version compacte (une ligne, cinq colonnes). */
.bt-pl-m-id{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.bt-pl-m-co{font-size:11.5px;font-weight:700;color:#a59c86;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.bt-pl-m-actions{display:flex;gap:8px;flex:none}
.bt-pl-m-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px;margin:0 0 12px;padding:7px 2px;border:1px solid rgba(242,237,227,.12);border-radius:12px;background:rgba(242,237,227,.04)}
.bt-pl-m-stat{display:flex;flex-direction:column;align-items:center;gap:1px;min-width:0;text-align:center}
button.bt-pl-m-stat{font:inherit;background:none;border:0;padding:0;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
.bt-pl-m-stat + .bt-pl-m-stat{border-left:1px solid rgba(242,237,227,.12)}
.bt-pl-m-stat b{display:inline-flex;align-items:center;gap:4px;font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:800;color:#F2EDE3;font-variant-numeric:tabular-nums;white-space:nowrap}
.bt-pl-m-stat small{font-size:9.5px;font-weight:600;color:#a59c86;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.bt-pl-m-stat.warn b{color:#FFC21A}
.bt-pl-m-stat .dot{width:7px;height:7px;border-radius:50%;flex:none}
.bt-pl-gridwrap{overflow-x:auto;background:#fff;border-radius:0 0 16px 16px;flex:1 0 auto;position:relative}
.bt-pl-nav{display:flex;align-items:center;gap:6px}
/* ===== Zone centrale : navigation de date (cadres blanc-crème) ===== */
.bt-pl-datenav{display:inline-flex;align-items:center;gap:7px}
.bt-pl-datearr{width:32px;height:34px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;font-size:16px;line-height:1;cursor:pointer;border:1.5px solid rgba(21,18,15,.16);background:#FAF7F0;color:#15120F;font-family:inherit;transition:border-color .14s ease,background .14s ease,transform .08s ease}
.bt-pl-datearr:hover{border-color:#15120F;background:#fff}
.bt-pl-datearr:active{transform:translateY(1px)}
.bt-pl-datebox{display:inline-flex;align-items:center;gap:9px;height:34px;padding:0 13px;border-radius:10px;border:1.5px solid rgba(21,18,15,.16);background:#FAF7F0;cursor:pointer;font-family:inherit;transition:border-color .14s ease,background .14s ease}
.bt-pl-datebox:hover{border-color:#15120F;background:#fff}
.bt-pl-datebox-wk{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:#15120F;letter-spacing:.02em}
.bt-pl-datebox-dot{width:8px;height:8px;border-radius:50%;flex:none}
.bt-pl-datebox-dot.is-now{background:#1D9E75}
.bt-pl-datebox-dot.is-away{background:#D85A30}
.bt-pl-datebox-rg{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:#15120F;white-space:nowrap}
.bt-pl-seg{display:inline-flex;align-items:center;gap:8px}
/* Petit trait vertical flottant entre Salariés et Clients (n'atteint ni le haut ni le bas). */
.bt-pl-segdiv{width:1.5px;height:18px;background:#15120F;border-radius:2px;flex:none}
.bt-pl-segbtn{font-family:inherit;font-weight:700;font-size:13px;border:none;background:transparent;color:#3D382F;padding:7px 11px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:background .14s ease,color .14s ease}
.bt-pl-segbtn:hover{color:#15120F;background:rgba(21,18,15,.06)}
.bt-pl-badge{min-width:17px;height:17px;padding:0 5px;border-radius:99px;background:#B5472E;color:#fff;font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;line-height:1}
.bt-pl-out{background:transparent;border:1.5px solid rgba(21,18,15,.3);color:#15120F;border-radius:10px;padding:7px 13px;height:33px;font-size:12.5px;font-weight:800;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;transition:border-color .14s ease,background .14s ease,transform .08s ease}
.bt-pl-out:hover{border-color:#15120F;background:rgba(21,18,15,.04)}
.bt-pl-out:active{transform:translateY(1px)}
/* pastille de comptage (réserves à traiter) — même code couleur que l'alerte */
.bt-pl-outbadge{min-width:18px;height:18px;padding:0 5px;border-radius:99px;background:#B5472E;color:#fff;font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;line-height:1;flex:none}
.bt-pl-fill{background:linear-gradient(180deg,#FFCB3D,#F5B400);color:#15120F;border:none;box-shadow:0 10px 22px -10px rgba(214,158,0,.65);border-radius:10px;padding:8px 14px;height:33px;font-size:12.5px;font-weight:800;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;transition:transform .12s ease,box-shadow .12s ease}
.bt-pl-fill:hover{transform:translateY(-1px);box-shadow:0 14px 28px -10px rgba(214,158,0,.75)}
.bt-pl-fill:active{transform:translateY(1px);box-shadow:0 6px 14px -8px rgba(214,158,0,.6)}
/* dropdown « + Chantier » — lignes attrapables */
.bt-pl-ddwrap{position:relative}
.bt-pl-ddbackdrop{position:fixed;inset:0;z-index:35}
.bt-pl-dd{position:absolute;top:42px;right:0;z-index:40;width:300px;background:#fff;border:1px solid rgba(21,18,15,.14);border-radius:14px;box-shadow:0 24px 50px -18px rgba(21,18,15,.45);overflow:hidden}
/* Variante ancrée à gauche (menu Clients, désormais à gauche de la barre) */
.bt-pl-dd.bt-pl-dd--start{left:0;right:auto}
.bt-pl-dd-h{padding:9px 13px 7px;border-bottom:1px solid rgba(21,18,15,.08);font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#9a948a;font-weight:700}
.bt-pl-legrow{display:flex;align-items:center;gap:9px;padding:8px 13px;font-size:12.5px;font-weight:600;color:#15120F}
.bt-pl-legrow + .bt-pl-legrow{border-top:1px solid rgba(21,18,15,.05)}
.bt-pl-legic{flex:none;display:inline-flex;align-items:center;justify-content:center;width:18px}
.bt-pl-ddrow{display:flex;align-items:center;gap:10px;padding:10px 13px;cursor:grab;background:#fff;border:none;width:100%;text-align:left;font-family:inherit;transition:background .12s ease}
.bt-pl-ddrow:hover{background:#FBF6EA}
.bt-pl-ddrow:active{cursor:grabbing}
.bt-pl-grip{display:flex;flex-direction:column;gap:2px;flex:none}
.bt-pl-grip span{display:block;width:11px;height:1.7px;background:#c4bdae;border-radius:2px}
.bt-pl-pilldot{width:11px;height:11px;border-radius:50%;flex:none}
.bt-pl-ddname{display:block;font-size:13.5px;font-weight:800;line-height:1.1;color:#15120F}
.bt-pl-ddsub{display:block;font-size:11px;color:#9a948a;font-weight:600}
.bt-pl-ddcreate{display:flex;align-items:center;gap:9px;padding:11px 13px;border-top:1px solid rgba(21,18,15,.1);background:#FBF6EA;cursor:pointer;border:none;width:100%;text-align:left;font-family:inherit;color:#15120F;font-size:13.5px;font-weight:800}
.bt-pl-ddcreate-ico{width:22px;height:22px;background:#FFC21A;color:#15120F;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14px;flex:none}
.bt-pl-exitem{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:#fff;border:none;border-top:1px solid rgba(21,18,15,.07);padding:11px 13px;cursor:pointer;font-family:inherit;color:#15120F}
.bt-pl-exitem:first-of-type{border-top:none}
.bt-pl-exitem:hover{background:#FBF6EA}
.bt-pl-exitem-t{display:block;font-size:13.5px;font-weight:800}
.bt-pl-exitem-s{display:block;font-size:11px;font-weight:600;color:#9a948a}
.bt-pl-dd-search{padding:9px 10px;border-bottom:1px solid rgba(21,18,15,.08)}
.bt-pl-dd-input{width:100%;font-family:inherit;font-size:13.5px;font-weight:600;padding:8px 11px;border:1.5px solid rgba(21,18,15,.16);border-radius:9px;background:#F9F5EC;color:#15120F;outline:none}
.bt-pl-dd-input::placeholder{color:#a89f8d;font-weight:500}
.bt-pl-dd-input:focus{border-color:#15120F}
.bt-pl-dd-list{max-height:300px;overflow-y:auto}
.bt-pl-dd-empty{padding:18px 13px;text-align:center;color:#9a948a;font-size:12.5px;font-weight:600}
.bt-pl-clientrow{display:flex;align-items:center;gap:2px;border-bottom:1px solid rgba(21,18,15,.05)}
.bt-pl-clientrow:last-child{border-bottom:none}
.bt-pl-clientrow .bt-pl-ddrow{flex:1;min-width:0;width:auto}
.bt-pl-clientedit{flex:none;border:none;background:transparent;color:#9a948a;cursor:pointer;padding:8px 11px;display:flex;align-items:center;border-radius:8px}
.bt-pl-clientedit:hover{background:#F1E8D6;color:#15120F}
.bt-pl-dragchip{display:inline-flex;align-items:center;gap:9px;background:#fff;border:1px solid rgba(21,18,15,.16);border-radius:11px;padding:8px 13px;box-shadow:0 16px 30px -12px rgba(21,18,15,.55);font-weight:800;font-size:13.5px;color:#15120F}

/* compte entreprise (remplace le bouton Déconnexion) */
.bt-pl-sep{width:1px;height:24px;background:rgba(21,18,15,.16)}
.bt-pl-acctwrap{position:relative}
.bt-pl-acct{display:inline-flex;align-items:center;gap:8px;background:transparent;border:1.5px solid rgba(21,18,15,.18);border-radius:10px;padding:4px 10px 4px 4px;cursor:pointer;font-family:inherit;height:33px;transition:border-color .14s ease,background .14s ease}
.bt-pl-acct:hover{border-color:#15120F;background:rgba(21,18,15,.04)}
.bt-pl-acct-av{width:24px;height:24px;border-radius:50%;background:#15120F;color:#FFC21A;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:10px;flex:none;overflow:hidden}
.bt-pl-acct-av-img{width:100%;height:100%;object-fit:cover;display:block}
.bt-pl-acct-name{font-size:13px;font-weight:800;color:#15120F;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-pl-acct-car{font-size:10px;color:#9a948a}
.bt-pl-acctmenu{position:absolute;top:42px;right:0;z-index:40;width:232px;background:#fff;border:1px solid rgba(21,18,15,.14);border-radius:13px;box-shadow:0 24px 50px -18px rgba(21,18,15,.45);overflow:hidden}
.bt-pl-acctmenu-h{padding:11px 13px;border-bottom:1px solid rgba(21,18,15,.08)}
.bt-pl-acctmenu-co{font-size:13.5px;font-weight:900;color:#15120F}
.bt-pl-acctmenu-u{font-size:11.5px;color:#6E6A63;font-weight:600}
.bt-pl-acct-item{display:flex;align-items:center;gap:9px;width:100%;padding:11px 13px;background:#fff;border:none;cursor:pointer;font-family:inherit;font-size:13.5px;font-weight:800;color:#15120F;text-align:left;transition:background .12s ease}
.bt-pl-acct-item:hover{background:#FBF6EA}
.bt-pl-acct-item.danger{color:#C0461F}

${PL_GRID_CSS}
/* Lot 9 : pastille « en cours » — dans une case étroite de la grille, le chantier
   passe sous « en cours depuis HH:MM » au lieu de déborder ; en ligne sur mobile. */
.bt-pl-livechip{align-items:flex-start}
.bt-pl-livechip .bt-pl-live-dot{margin-top:3px}
.bt-pl-livechip .t{white-space:normal}
.bt-pl-cellinner .bt-pl-livechip .sep{display:none}
.bt-pl-cellinner .bt-pl-livechip .nm{display:block;margin-top:2px}

/* mobile */
.bt-pl-mobile{display:none;flex-direction:column;border:1.5px solid #15120F;border-radius:14px;overflow:hidden;background:#fff}
.bt-pl-m-headrow{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
/* invitations en attente : une instance pour l'ordinateur (sous la barre), une pour le
   téléphone (sous l'en-tête noir) — components/pending-invitations.tsx */
.bt-pl-inv-mob{display:none}
@media (max-width:1023px){.bt-pl-cockpit,.bt-pl-bar,.bt-pl-gridwrap,.bt-pl-inv-desk{display:none}.bt-pl-mobile{display:flex}.bt-pl-inv-mob{display:block}}
.bt-pl-kicker{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#FFC21A;margin-bottom:3px;font-weight:700}
.bt-pl-m-ibtn{flex:none;width:40px;height:40px;border-radius:11px;border:1px solid rgba(242,237,227,.25);background:rgba(242,237,227,.06);color:#F2EDE3;display:inline-flex;align-items:center;justify-content:center;font-size:17px;cursor:pointer;font-family:inherit}
.bt-pl-m-ibtn:hover{background:rgba(242,237,227,.08)}
.bt-pl-m-head{background:#15120F;color:#F2EDE3;padding:12px 14px 12px}
.bt-pl-m-date{font-size:21px;font-weight:900;letter-spacing:-.02em;text-transform:capitalize}
.bt-pl-m-days{display:flex;gap:7px;margin-top:13px}
.bt-pl-daypill{flex:1;min-width:0;border-radius:12px;padding:9px 2px;text-align:center;border:1px solid rgba(242,237,227,.2);cursor:pointer;background:transparent;color:#F2EDE3;font-family:inherit}
.bt-pl-daypill-d{font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#a59c86;font-weight:700;text-transform:uppercase}
.bt-pl-daypill-n{font-size:15px;font-weight:800}
.bt-pl-daypill.on{background:linear-gradient(180deg,#FFCB3D,#F5B400);border-color:#F5B400;box-shadow:0 8px 18px -8px rgba(214,158,0,.6)}
.bt-pl-daypill.on .bt-pl-daypill-d{color:#7a5e00}
.bt-pl-daypill.on .bt-pl-daypill-n{color:#15120F}
.bt-pl-m-list{padding:13px 12px 22px;display:flex;flex-direction:column;gap:10px;background:#F7F4EE;flex:1}
.bt-pl-m-card{background:#fff;border:1px solid rgba(21,18,15,.07);border-radius:15px;padding:13px 14px;box-shadow:0 10px 26px -18px rgba(21,18,15,.4)}
/* Lot 9 : la carte du jour = la case (salarié × jour) — verte quand il pointe en direct */
.bt-pl-m-card.bt-pl-cell-live{background:#EEF9F2;border-color:rgba(47,163,107,.45)}
.bt-pl-m-top{display:flex;align-items:center;gap:10px;width:100%;background:none;border:none;padding:0;text-align:left;font-family:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
.bt-pl-m-badge{display:flex;align-items:center;gap:5px;border-radius:7px;padding:4px 8px;font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:700}
.bt-pl-m-bubs{margin-top:11px;display:flex;flex-direction:column;gap:8px}
.bt-pl-m-bubbtn{display:block;width:100%;text-align:left;background:none;border:none;padding:0;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent}
.bt-pl-m-empty{font-size:12.5px;color:#9a948a;font-weight:600;margin-top:8px}
.bt-pl-m-add{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin-top:11px;padding:9px 10px;border:1.5px dashed rgba(21,18,15,.22);border-radius:11px;background:none;color:#6E6A63;font-family:inherit;font-weight:800;font-size:12.5px;cursor:pointer;transition:border-color .14s ease,color .14s ease}
.bt-pl-m-add:hover{border-color:rgba(21,18,15,.4);color:#15120F}
.bt-pl-m-add:active{background:rgba(21,18,15,.04)}
/* ===== COACH DE DÉMARRAGE (0 salarié ou 0 client) : checklist discrète, FERMABLE.
   Esthétique « haut de gamme » : blanc, hairline, filet or, ombre douce — zéro
   rubalise. Desktop = carte flottante bas-droite ; mobile = carte dans la liste. ===== */
.bt-pl-coach{position:fixed;right:22px;bottom:22px;z-index:25;width:296px;background:#fff;border:1px solid rgba(21,18,15,.08);border-radius:16px;box-shadow:0 28px 70px -28px rgba(21,18,15,.5);overflow:hidden;font-family:'Archivo',sans-serif;text-align:left}
.bt-pl-coach--flow{position:static;width:100%;margin-top:6px;box-shadow:0 16px 40px -22px rgba(21,18,15,.35)}
.bt-pl-coach-gold{height:3px;background:linear-gradient(90deg,#FFC21A,#F5B400 55%,rgba(255,194,26,.15))}
.bt-pl-coach-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:14px 12px 0 16px}
.bt-pl-coach-kicker{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#9a8a3a;font-weight:700;margin:0 0 2px}
.bt-pl-coach-title{font-size:16px;font-weight:900;letter-spacing:-.015em;color:#15120F;margin:0}
.bt-pl-coach-x{flex:none;width:28px;height:28px;border-radius:8px;border:none;background:transparent;color:#9a948a;font-size:15px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;transition:background .12s ease,color .12s ease}
.bt-pl-coach-x:hover{background:rgba(21,18,15,.06);color:#15120F}
.bt-pl-coach-steps{padding:12px 12px 14px;display:flex;flex-direction:column;gap:8px}
.bt-pl-coach-step{display:flex;align-items:center;gap:11px;padding:11px 12px;border:1px solid rgba(21,18,15,.08);border-radius:12px;background:#FBF8F2;cursor:pointer;text-align:left;font-family:inherit;width:100%;transition:border-color .13s ease,box-shadow .13s ease,background .13s ease}
.bt-pl-coach-step:hover{border-color:rgba(255,194,26,.65);background:#fff;box-shadow:0 10px 24px -14px rgba(21,18,15,.3)}
.bt-pl-coach-step.done{cursor:default;background:#fff;border-color:rgba(21,18,15,.06);opacity:.62}
.bt-pl-coach-step.done:hover{box-shadow:none;border-color:rgba(21,18,15,.06)}
.bt-pl-coach-n{width:24px;height:24px;flex:none;border-radius:50%;background:#15120F;color:#FFC21A;display:inline-flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:900}
.bt-pl-coach-step.done .bt-pl-coach-n{background:#1D9E75;color:#fff}
.bt-pl-coach-t{min-width:0}
.bt-pl-coach-t b{display:block;font-size:13.5px;font-weight:800;letter-spacing:-.01em;color:#15120F}
.bt-pl-coach-t small{display:block;font-size:11.5px;color:#8a8378;font-weight:500;margin-top:1px}
.bt-pl-coach-step.done .bt-pl-coach-t b{text-decoration:line-through;text-decoration-thickness:1.5px;color:#56514a}


/* ===== MOUVEMENT / EFFETS (apparence seulement — dnd-kit non touché) ===== */
.bt-pl-bub{transition:box-shadow .16s ease, transform .12s ease}
.bt-pl-grab{transition:transform .12s ease}
.bt-pl-grab:hover .bt-pl-bub{transform:translateY(-1px);box-shadow:0 8px 18px -8px rgba(21,18,15,.45)}
.bt-pl-dragging{opacity:.35}
.bt-pl-dragging .bt-pl-bub{box-shadow:none;transform:none}
.bt-pl-overlay{transform:rotate(-2.5deg) scale(1.06);filter:drop-shadow(0 16px 22px rgba(21,18,15,.5));cursor:grabbing}
/* Lot 2 : Ctrl / Alt maintenu = COPIER. La bulle d'origine reste pleine (elle ne
   part pas), le curseur et une pastille « + » jaune le disent sur la copie. */
.bt-pl--copying .bt-pl-dragging{opacity:1}
.bt-pl--copying .bt-pl-overlay{cursor:copy}
.bt-pl-overlay{position:relative}
.bt-pl-copybadge{position:absolute;top:-8px;right:-8px;z-index:3;width:18px;height:18px;border-radius:50%;background:#FFC21A;color:#15120F;border:1.5px solid #15120F;font-size:14px;font-weight:900;line-height:1;display:flex;align-items:center;justify-content:center;pointer-events:none}
.bt-pl-drop .cp,.bt-pl--copying .bt-pl-drop .mv{display:none}
.bt-pl--copying .bt-pl-drop .cp{display:inline}
.bt-pl-extra{transition:box-shadow .16s ease, transform .12s ease}
.bt-pl-extra:hover{transform:translateY(-1px);box-shadow:0 8px 18px -8px rgba(181,71,46,.4)}
.bt-pl-cell{transition:background .14s ease}
.bt-pl-cellfill{transition:background .14s ease}
.bt-pl-cellfill:hover{background:rgba(21,18,15,.028)}
.bt-pl-add{transition:border-color .14s ease, color .14s ease, background .14s ease}
.bt-pl-cellfill:hover .bt-pl-add{border-color:rgba(21,18,15,.34);color:#9a8a3a;background:rgba(255,194,26,.06)}
.bt-pl-namebtn{transition:background .14s ease}
.bt-pl-chip{transition:box-shadow .16s ease, transform .12s ease}
.bt-pl-chip:hover{transform:translateY(-1px);box-shadow:0 8px 18px -8px rgba(21,18,15,.45)}
.bt-pl-chip:active{transform:translateY(0) scale(.98)}
.bt-pl-abs{transition:filter .12s ease}
.bt-pl-abs:hover{filter:brightness(.97)}
.bt-pl-daypill{transition:background .14s ease, border-color .14s ease, transform .08s ease}
.bt-pl-daypill:active{transform:translateY(1px)}

/* ===== Lot 11 : « Sélectionner » → « Supprimer (N) » → « Annuler » ===== */
.bt-pl-segbtn[aria-pressed="true"]{background:#FFC21A;color:#15120F}
.bt-pl-lbl-short{display:none}
.bt-pl-datebox-wk,.bt-pl-datebox-rg{white-space:nowrap}
/* Sous 1280 px (iPad paysage 1024) : « Coûts » et des marges resserrées, pour que la
   barre garde UNE ligne avec « Sélectionner » — pastilles « Réserves » comprises. */
@media (max-width:1279px){
  .bt-pl-lbl-long{display:none}.bt-pl-lbl-short{display:inline}
  .bt-pl-bar .bt-pl-seg{gap:2px}
  .bt-pl-bar .bt-pl-segbtn{padding:7px 6px;gap:5px}
  .bt-pl-bar .bt-pl-out{padding:7px 8px}
  .bt-pl-bar .bt-pl-fill{padding:8px 9px}
  .bt-pl-bar .bt-pl-datenav{gap:5px}
  .bt-pl-bar .bt-pl-datebox{padding:0 8px;gap:6px}
  /* Les compteurs (congés en attente, réserves) passent en pastille d'angle : la
     barre garde la même largeur quel que soit le nombre — elle ne déborde plus. */
  .bt-pl-bar .bt-pl-segbtn,.bt-pl-bar .bt-pl-out{position:relative}
  .bt-pl-bar .bt-pl-badge,.bt-pl-bar .bt-pl-outbadge{position:absolute;top:-8px;right:-7px;z-index:1;box-shadow:0 0 0 2px #fff;pointer-events:none}
}
.bt-pl--select .bt-pl-cellfill{cursor:default}
.bt-pl--select .bt-pl-cellfill:hover{background:transparent}
.bt-pl--select .bt-pl-add{visibility:hidden}
.bt-pl--select .bt-pl-m-add{display:none}
.bt-pl--select .bt-pl-abs{position:relative;opacity:.42;cursor:not-allowed}
.bt-pl--select .bt-pl-abs::after{content:"🔒";position:absolute;top:4px;right:5px;font-size:11px;line-height:1}
.bt-pl--select .bt-pl-th{cursor:pointer}
.bt-pl--select .bt-pl-th:hover{background:#FFF8E1}
.bt-pl--select .bt-pl-gridwrap,.bt-pl--undo .bt-pl-gridwrap{padding-bottom:84px}
.bt-pl--select .bt-pl-m-list,.bt-pl--undo .bt-pl-m-list{padding-bottom:150px}
.bt-pl-sel{position:relative;cursor:pointer;-webkit-tap-highlight-color:transparent}
.bt-pl-sel .bt-pl-grab{cursor:pointer}
.bt-pl-sel .bt-pl-grab:hover .bt-pl-bub{transform:none}
.bt-pl-sel.on .bt-pl-bub,.bt-pl-sel.on .bt-pl-extra{box-shadow:0 0 0 2.5px #FFC21A,0 8px 18px -10px rgba(21,18,15,.5)}
.bt-pl-sel.lock{opacity:.42;cursor:not-allowed}
.bt-pl-sel.lock .bt-pl-grab,.bt-pl-sel.lock .bt-pl-extra{cursor:not-allowed}
.bt-pl-selbox{position:absolute;top:5px;right:5px;z-index:2;width:18px;height:18px;border-radius:5px;border:2px solid #15120F;background:#fff;display:flex;align-items:center;justify-content:center;color:#15120F;pointer-events:none}
.bt-pl-sel.on .bt-pl-selbox{background:#FFC21A}
.bt-pl-sellock{position:absolute;top:4px;right:5px;z-index:2;font-size:11px;line-height:1;pointer-events:none}
.bt-pl-sel .bt-pl-bub-ic{margin-right:18px}
.bt-pl-dock{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:45;display:flex;flex-direction:column;align-items:center;gap:8px;width:max-content;max-width:calc(100vw - 24px);font-family:'Archivo',sans-serif}
.bt-pl-selbar{display:flex;align-items:center;flex-wrap:wrap;justify-content:center;gap:8px;background:#15120F;color:#F2EDE3;border-radius:14px;padding:9px 10px 9px 16px;box-shadow:0 22px 50px -18px rgba(21,18,15,.75);max-width:100%}
.bt-pl-selbar-n{font-weight:800;font-size:13.5px;white-space:nowrap;margin-right:4px;font-variant-numeric:tabular-nums}
.bt-pl-selbar-btn{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px;border-radius:10px;border:1.5px solid rgba(242,237,227,.28);background:transparent;color:#F2EDE3;font:inherit;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap}
.bt-pl-selbar-btn:hover{border-color:#F2EDE3}
.bt-pl-selbar-del{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:10px;border:0;background:#C0461F;color:#fff;font:inherit;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap}
.bt-pl-selbar-del:hover{background:#A63A17}
.bt-pl-selbar-del:disabled{opacity:.4;cursor:default}
.bt-pl-selbar-ok{background:#FFC21A;color:#15120F;border-color:#FFC21A}
.bt-pl-selbar-ok:hover{border-color:#fff}
.bt-pl-selbar .dy{display:none}
@media (max-width:1023px){.bt-pl-selbar .wk{display:none}.bt-pl-selbar .dy{display:inline-flex}.bt-pl-selbar{padding:9px 10px}}
.bt-pl-undo{position:relative;width:380px;max-width:100%;background:#fff;border-radius:16px;padding:0 36px 10px 10px;box-shadow:0 22px 50px -18px rgba(21,18,15,.6);border:1px solid rgba(21,18,15,.1)}
.bt-pl-undo-x{position:absolute;top:8px;right:8px;width:26px;height:26px;border-radius:8px;border:0;background:transparent;color:#6E6A63;font-size:14px;line-height:1;cursor:pointer;font-family:inherit}
.bt-pl-undo-x:hover{background:rgba(21,18,15,.06);color:#15120F}
.bt-pl-m-tools{display:flex;justify-content:flex-end;margin:-3px 0 -2px}
.bt-pl-m-selbtn{display:inline-flex;align-items:center;gap:6px;border:1.5px solid rgba(21,18,15,.2);background:#fff;color:#15120F;border-radius:10px;padding:6px 11px;font-family:inherit;font-size:12.5px;font-weight:800;cursor:pointer}
`;

// Lot 10 : objet FIXE. React (canari de Next 14) réécrit le contenu d'un <style>
// dès que l'objet `dangerouslySetInnerHTML` change d'identité — à chaque rendu
// avec `{{ __html: … }}` en ligne. Le navigateur recalculait alors toute la page
// (et relisait les polices de l'@import) à chaque sondage : le « flash ».
const PL_STYLE = { __html: PL_CSS };

// ─── main ────────────────────────────────────────────────────────────────────

interface AdminPlanningProps {
  trial?: { inTrial: boolean; expired: boolean; daysLeft: number | null };
  onSubscribe?: () => void;
}
export default function AdminPlanning({ trial, onSubscribe }: AdminPlanningProps = {}) {
  const { user, signOut } = useAuth();
  const [workers, setWorkers] = useState<User[]>([]);
  // Les personnes du BUREAU (rôle admin). Séparées des salariés : elles ne
  // pointent pas sur le planning, mais elles doivent rester visibles quelque
  // part — sinon quelqu'un qu'on vient de nommer disparaît de l'écran et plus
  // personne ne peut le rétrograder.
  const [officeUsers, setOfficeUsers] = useState<User[]>([]);
  const [roleBusyId, setRoleBusyId] = useState<string | null>(null);
  const [worksites, setWorksites] = useState<Worksite[]>([]);
  const [planning, setPlanning] = useState<PlanningWithWorksite[]>([]);
  const [realEntries, setRealEntries] = useState<{ user_id: string; work_date: string; worksite_id: string | null; planning_id?: string | null; start_time: string; end_time: string; total_minutes: number; reception: string | null; reserve_resolved_at: string | null; reserve_fixed_at?: string | null; observation: string | null }[]>([]);
  // Saisies pas encore envoyées : affichées en pointillé, jamais comptées.
  const [draftEntries, setDraftEntries] = useState<DraftRow[]>([]);
  // Lot 2 : brouillons VIDES (0 minute, jamais envoyés), gardés à part : ils ne
  // s'affichent plus « 0h00 · à envoyer » et ne verrouillent plus leur intervention.
  const [emptyDrafts, setEmptyDrafts] = useState<DraftRow[]>([]);
  // Lot 11 : cases de la semaine que le salarié a RETIRÉES (sa ligne 'cancelled' la
  // désigne encore, la base refuse donc de l'effacer) → 🔒 en mode « Sélectionner ».
  const [withdrawnIds, setWithdrawnIds] = useState<Set<string>>(EMPTY_SET);
  const [docsByWorksite, setDocsByWorksite] = useState<Map<string, number>>(new Map()); // nb de documents par chantier (pastille 📎)
  // Le chiffre du cockpit ouvert, s'il y en a un. Les quatre chiffres se lisent
  // tous de la même façon : un clic, un panneau, la liste qui compose le total.
  // Lot 11 : deux indicateurs seulement — 🟠 « À relancer » et 📎 « Pièces ».
  const [statPanel, setStatPanel] = useState<null | 'waiting' | 'docs'>(null);
  // Le détail des pièces jointes — chargé seulement à l'ouverture du panneau.
  // Le compte par chantier (docsByWorksite) reste une requête légère : une
  // entreprise avec des milliers de photos ne doit pas les charger pour une
  // pastille. null = pas encore lu ; 'ko' = lecture en échec (on le dit).
  const [docList, setDocList] = useState<DocLine[] | null>(null);
  const [docListState, setDocListState] = useState<'idle' | 'loading' | 'ok' | 'ko'>('idle');
  const [todayAbsence, setTodayAbsence] = useState<Map<string, string>>(new Map());
  const [missingByWorker, setMissingByWorker] = useState<Map<string, string[]>>(new Map());
  // Lot 11 : « Clôturer jusqu'au… » par salarié (user_closures) — ses jours clôturés
  // ne peuvent plus être envoyés, donc on ne les lui réclame plus.
  const [workerClosures, setWorkerClosures] = useState<Map<string, string>>(new Map());
  // « À relancer » : qui a déjà reçu un rappel pendant cette session.
  const [remindedIds, setRemindedIds] = useState<Set<string>>(new Set());
  const [relanceOpen, setRelanceOpen] = useState(false); // mobile : la liste « À relancer »
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [companyName, setCompanyName] = useState('');
  // Réglage entreprise : la route entre deux chantiers est-elle payée ?
  const [travelPaid, setTravelPaid] = useState(false);
  const [companyWeeklyHours, setCompanyWeeklyHours] = useState(DEFAULT_WEEKLY_HOURS);
  // Taux de majoration de l'entreprise — ils partent dans l'export, en en-tête
  // des colonnes, pour que le comptable sache quoi appliquer sans demander.
  const [overtimeRates, setOvertimeRates] = useState(DEFAULT_OVERTIME_RATES);
  const [accountantEmail, setAccountantEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState(weekStart());
  const [positionWarned, setPositionWarned] = useState(false);
  // Mobile (consultation seule) — jour affiché. Par défaut aujourd'hui (lundi = 0 … dimanche = 6).
  const [mobileDayIdx, setMobileDayIdx] = useState(() => weekDayIndex());

  // client to place on the planning
  const [paletteWorksiteId, setPaletteWorksiteId] = useState<string>('');
  const [chantierMenuOpen, setChantierMenuOpen] = useState(false); // dropdown « + Chantier »
  const [accountMenuOpen, setAccountMenuOpen] = useState(false); // menu compte (entreprise → Déconnexion)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false); // menu hamburger mobile (Sheet)
  const [assistantOpen, setAssistantOpen] = useState(false); // lot 6 : ✨ dans la barre / l'en-tête
  const [mobileChantiersOpen, setMobileChantiersOpen] = useState(false); // liste « Chantiers » mobile (équivalent du dropdown Clients desktop)
  const [importOpen, setImportOpen] = useState(false); // import CSV/Excel de clients/chantiers
  const [costOpen, setCostOpen] = useState(false); // rapport coût & heures par chantier
  const [reservesOpen, setReservesOpen] = useState(false); // registre des réserves de chantier
  const [openReserves, setOpenReserves] = useState(0); // compteur pour la pastille
  // Lot 10 : « 📟 Borne » dans la barre — même condition que les réglages
  // (company-settings.tsx) : le bouton n'existe que si l'entreprise a `kiosk_enabled`.
  const [kioskOn, setKioskOn] = useState(false);
  const [kioskOpen, setKioskOpen] = useState(false);
  const [importWorkersOpen, setImportWorkersOpen] = useState(false); // import CSV/Excel de salariés (invitations en masse)
  const [leaveOpen, setLeaveOpen] = useState(false); // demandes de congé des salariés
  const [pendingLeaves, setPendingLeaves] = useState(0); // compteur pour la pastille
  // Qui pointe EN CE MOMENT. Purement informatif : un chrono en cours n'est
  // pas une heure travaillée, il n'entre dans aucun total ni dans la paie.
  // Lot 9 : relu par son propre sondage (30 s), plus par fetchExtras.
  const [liveNow, setLiveNow] = useState<LiveSessionLike[]>([]);
  const [activeDrag, setActiveDrag] = useState<{ id: string; type: 'move' | 'new'; worksiteId?: string } | null>(null);
  // Lot 2 : Ctrl / Alt (⌥) / ⌘ maintenu AU DÉPÔT = copier au lieu de déplacer.
  // dnd-kit ne transmet que le premier appui (activatorEvent) : l'état des touches
  // est suivi à part, lu par handleDragEnd dans la ref (synchrone), affiché par l'état.
  const copyRef = useRef(false);
  const [copying, setCopying] = useState(false);
  const setCopy = useCallback((on: boolean) => {
    if (copyRef.current === on) return; // pas de redessin à chaque mouvement de souris
    copyRef.current = on;
    setCopying(on);
  }, []);

  // disponibilité popup + worker fiche + management screens
  const [statusTarget, setStatusTarget] = useState<{ worker: User; fromStr: string } | null>(null);
  const [ficheWorker, setFicheWorker] = useState<User | null>(null);
  const [ficheMode, setFicheMode] = useState<'hours' | 'manage'>('hours');
  // Assistant BEMEXO (lot 3) : n'existe que si l'entreprise a `ai_enabled`.
  const aiOn = useAiEnabled(user?.company_id);
  const [salariesOpen, setSalariesOpen] = useState(false);
  const [clientsQuery, setClientsQuery] = useState('');
  const [salariesQuery, setSalariesQuery] = useState('');
  const [companyLogo, setCompanyLogo] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false); // popover légende des icônes de bulle

  // team export
  const [exportOpen, setExportOpen] = useState(false);
  // Clôture du mois : décision explicite du bureau, refusée en base aux salariés.
  const [closedMonths, setClosedMonths] = useState<Set<string>>(new Set());
  const [closureBusy, setClosureBusy] = useState(false);
  const [closureTarget, setClosureTarget] = useState<{ month: string; drafts: number } | null>(null);
  const [exportWorkerOpen, setExportWorkerOpen] = useState(false);
  const [exportRange, setExportRange] = useState<{ from: Date; to: Date } | null>(null);
  const [attributeTarget, setAttributeTarget] = useState<{ userId: string; dateStr: string; worksiteId: string | null; label: string } | null>(null);
  // Intervention ajoutée par le salarié (hors-planning) : popup avec Documents + attribution
  // (au lieu de forcer directement l'attribution).
  const [extraTarget, setExtraTarget] = useState<{ userId: string; dateStr: string; worksiteId: string | null; name: string; minutes: number } | null>(null);
  const [attrBusy, setAttrBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  // invitation row actions
  const [remindingId, setRemindingId] = useState<string | null>(null);

  // cell add dialog (a client on a specific day)
  const [addOpen, setAddOpen] = useState(false);
  const [addTarget, setAddTarget] = useState<{ workerId: string; date: string } | null>(null);
  const [addWorksite, setAddWorksite] = useState('');
  const [addNote, setAddNote] = useState('');
  const [addStart, setAddStart] = useState('');
  const [addTimeBad, setAddTimeBad] = useState(false);
  const [addEnd, setAddEnd] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  // affectation (bubble) edit dialog
  const [editing, setEditing] = useState<PlanningWithWorksite | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editTimeBad, setEditTimeBad] = useState(false);
  const [editEnd, setEditEnd] = useState('');
  const [editNote, setEditNote] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingEdit, setDeletingEdit] = useState(false);

  // Lot 11 : « Sélectionner » → cocher des bulles → « Supprimer (N) » → « Annuler ».
  // La sélection n'existe qu'en mode sélection ; elle n'est jamais « nettoyée » par
  // un setState au fil des sondages (lot 10 : zéro redessin) — on la croise au rendu.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(EMPTY_SET);
  const [eraseBusy, setEraseBusy] = useState(false);
  // La carte « N intervention(s) supprimée(s) · Annuler » reste jusqu'à sa croix.
  const [undoCard, setUndoCard] = useState<{ key: number; message: string; strong: boolean; undo: () => Promise<UndoResult> } | null>(null);

  // separate client fiche (permanent data)
  const [clientFiche, setClientFiche] = useState<Worksite | null>(null);
  // Panneau Documents : le chantier, et le JOUR quand on l'ouvre depuis une
  // case du planning. Depuis la fiche client, il n'y a pas de jour — et lui
  // coller la date d'aujourd'hui inventerait une information.
  const [docsWorksite, setDocsWorksite] = useState<{ ws: Worksite; day: string | null } | null>(null);
  const [wsName, setWsName] = useState('');
  const [wsProduct, setWsProduct] = useState('');
  const [wsPhone, setWsPhone] = useState('');
  const [wsEmail, setWsEmail] = useState('');
  const [wsCity, setWsCity] = useState('');
  const [wsAddress, setWsAddress] = useState('');
  const [wsDesc, setWsDesc] = useState('');
  // Budget main-d'œuvre (facultatif) — alertes de dépassement à 70/80/100 %.
  const [wsBudgetH, setWsBudgetH] = useState('');
  const [wsBudgetE, setWsBudgetE] = useState('');
  const [savingWs, setSavingWs] = useState(false);
  const [wsBusy, setWsBusy] = useState(false);

  // absence start dialog (optional end date via calendar)
  const [pendingAbsence, setPendingAbsence] = useState<{ worker: User; type: string; fromStr: string } | null>(null);
  const [absRange, setAbsRange] = useState<DateRange | undefined>(undefined);
  const [absSaving, setAbsSaving] = useState(false);

  // Coach de démarrage : fermé définitivement via localStorage (clé dédiée,
  // indépendante de battime_offline_*). Visible tant qu'il manque un salarié
  // OU un client, et que l'utilisateur ne l'a pas fermé.
  const [coachHidden, setCoachHidden] = useState(true);
  useEffect(() => {
    try { setCoachHidden(localStorage.getItem('bemexo_admin_coach') === 'off'); } catch { setCoachHidden(false); }
  }, []);
  const dismissCoach = () => {
    setCoachHidden(true);
    try { localStorage.setItem('bemexo_admin_coach', 'off'); } catch { /* stockage indisponible : fermé pour la session */ }
  };

  // create client / worker dialogs
  const [clientOpen, setClientOpen] = useState(false);
  const [cName, setCName] = useState('');
  const [cProduct, setCProduct] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cCity, setCCity] = useState('');
  const [cAddress, setCAddress] = useState('');
  const [cDesc, setCDesc] = useState('');
  const [cSaving, setCSaving] = useState(false);

  const [workerOpen, setWorkerOpen] = useState(false);

  // ── Lignes « fantômes » : remplissent l'espace vide sous le dernier salarié avec des
  //    lignes vierges (quadrillage continu + « + » pour ajouter un salarié). Le nombre
  //    est calculé sur la hauteur de FENÊTRE (stable) : ajouter de vrais salariés
  //    agrandit la page normalement, jamais bloqué, et les fantômes ne s'emballent pas.
  const [ghostCount, setGhostCount] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const realBodyRef = useRef<HTMLTableSectionElement>(null);
  useEffect(() => {
    const recompute = () => {
      const grid = gridRef.current, head = theadRef.current, body = realBodyRef.current;
      if (!grid || !head || !body) return;
      const gridTopDoc = grid.getBoundingClientRect().top + window.scrollY;
      const avail = window.innerHeight - gridTopDoc - 6; // 6 = padding bas de .bt-admin
      const real = head.offsetHeight + body.offsetHeight;
      const n = Math.floor((avail - real) / GHOST_ROW_H);
      setGhostCount(n > 0 ? n : 0);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    if (gridRef.current) ro.observe(gridRef.current);
    if (realBodyRef.current) ro.observe(realBodyRef.current);
    window.addEventListener('resize', recompute);
    return () => { ro.disconnect(); window.removeEventListener('resize', recompute); };
  }, [loading, workers.length]);

  // Démo (preview UNIQUEMENT) : ?demo=N affiche N salariés fictifs — AUCUNE écriture en
  // base (prod intacte). Sert juste à visualiser le planning rempli.
  const demoCount = useMemo(() => {
    if (typeof window === 'undefined') return 0;
    if (!isPreviewHost()) return 0;
    const n = parseInt(new URLSearchParams(window.location.search).get('demo') || '0', 10);
    return Number.isFinite(n) ? Math.max(0, Math.min(n, 30)) : 0;
  }, []);
  const demoWorkers = useMemo<User[]>(() => {
    if (demoCount === 0) return [];
    const FN = ['Lucas', 'Hugo', 'Léo', 'Nathan', 'Enzo', 'Louis', 'Gabriel', 'Jules', 'Adam', 'Raphaël', 'Arthur', 'Maël', 'Sacha', 'Noah', 'Tom', 'Paul'];
    const LN = ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Garcia', 'Roux'];
    return Array.from({ length: demoCount }, (_, i) => ({
      id: `demo-${i}`, company_id: user?.company_id || '', first_name: FN[i % FN.length],
      last_name: LN[i % LN.length], role: 'worker' as const, email: '', is_active: true, created_at: '',
    }));
  }, [demoCount, user?.company_id]);

  const [wFirst, setWFirst] = useState('');
  const [wLast, setWLast] = useState('');
  const [wEmail, setWEmail] = useState('');
  const [wPhone, setWPhone] = useState('');
  const [wSaving, setWSaving] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // ─── data ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!user?.company_id) return;
    try {
      const [workersRes, worksitesRes, officeRes] = await Promise.all([
        // Les chefs d'équipe travaillent sur le chantier comme les autres : ils
        // restent dans le planning et dans la liste. Les exclure les aurait fait
        // disparaître de l'écran, sans moyen de les rétrograder — le piège déjà
        // rencontré avec les comptes passés au bureau.
        supabase.from('users').select('*').eq('company_id', user.company_id).in('role', ['worker', 'lead']).eq('is_active', true).order('first_name'),
        supabase.from('worksites').select('*').eq('company_id', user.company_id).eq('is_active', true).order('client_name'),
        supabase.from('users').select('*').eq('company_id', user.company_id).eq('role', 'admin').eq('is_active', true).order('first_name'),
      ]);
      if (workersRes.error) throw workersRes.error;
      if (worksitesRes.error) throw worksitesRes.error;
      // Lot 10 : keep() garde l'objet déjà affiché quand rien n'a changé (aucun redessin).
      setWorkers((prev) => keep(prev, (workersRes.data || []) as User[]));
      if (!officeRes.error) setOfficeUsers((prev) => keep(prev, (officeRes.data || []) as User[]));
      setWorksites((prev) => keep(prev, (worksitesRes.data || []) as Worksite[]));
    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error('Impossible de charger les données');
    } finally {
      setLoading(false);
    }
  }, [user?.company_id]);

  const fetchPlanning = useCallback(async () => {
    if (!user?.company_id) return;
    const weekEnd = addDays(currentWeekStart, DAYS_IN_WEEK - 1);
    const from = format(currentWeekStart, 'yyyy-MM-dd');
    const to = format(weekEnd, 'yyyy-MM-dd');
    try {
      const [planRes, realRes, draftRes, cancelledRes] = await Promise.all([
        supabase.from('planning').select('*, worksite:worksites(*), user:users!user_id(*)')
          .eq('company_id', user.company_id).gte('work_date', from).lte('work_date', to).order('work_date'),
        supabase.from('time_entries').select('user_id, work_date, worksite_id, planning_id, start_time, end_time, total_minutes, reception, reserve_resolved_at, reserve_fixed_at, observation')
          .eq('company_id', user.company_id).in('status', ['submitted', 'validated']).gte('work_date', from).lte('work_date', to),
        (async () => {
          const q = (cols: string) => supabase.from('time_entries').select(cols)
            .eq('company_id', user.company_id).eq('status', 'draft').gte('work_date', from).lte('work_date', to);
          const r = await q(`${DRAFT_COLS}, exit_forgotten`);
          return r.error && /exit_forgotten/.test(r.error.message || '') ? q(DRAFT_COLS) : r;
        })(),
        supabase.from('time_entries').select('planning_id')
          .eq('company_id', user.company_id).eq('status', 'cancelled').not('planning_id', 'is', null).gte('work_date', from).lte('work_date', to),
      ]);
      if (planRes.error) throw planRes.error;
      const planRows = planRes.data || [];
      const realRows = realRes.error ? [] : (realRes.data || []);
      setPlanning((prev) => keep(prev, planRows));
      if (!realRes.error) setRealEntries((prev) => keep(prev, realRows));
      if (!draftRes.error) {
        // Lot 2 : un brouillon VIDE (0 minute, jamais envoyé) ne compte nulle part
        // et ne bloque plus rien : supprimer son intervention l'emporte (lib/erase).
        const drafts = (draftRes.data || []) as unknown as DraftRow[];
        setDraftEntries((prev) => keep(prev, drafts.filter((e) => !isDisposableDraft(e))));
        setEmptyDrafts((prev) => keep(prev, drafts.filter((e) => isDisposableDraft(e))));
      }
      if (!cancelledRes.error) setWithdrawnIds((prev) => keep(prev, withdrawnSet(cancelledRes.data)));

      // Unification : toute heure déclarée sur un chantier sans créneau planning → on
      // crée le créneau (idempotent, côté serveur) pour qu'elle devienne une bulle
      // normale (glissable + même pop-up), repérée « salarié ». Auto-réparé une fois.
      const planKey = new Set(planRows.filter((p) => p.worksite_id).map((p) => `${p.user_id}|${p.work_date}|${p.worksite_id}`));
      const missing = new Map<string, { u: string; d: string; w: string }>();
      for (const e of realRows) {
        if (!e.worksite_id) continue;
        const k = `${e.user_id}|${e.work_date}|${e.worksite_id}`;
        if (!planKey.has(k)) missing.set(k, { u: e.user_id, d: e.work_date, w: e.worksite_id });
      }
      if (missing.size > 0) {
        await Promise.all(Array.from(missing.values()).map((x) =>
          supabase.rpc('ensure_planning_slot', { p_user_id: x.u, p_work_date: x.d, p_worksite_id: x.w })));
        const { data: planAgain } = await supabase.from('planning').select('*, worksite:worksites(*), user:users!user_id(*)')
          .eq('company_id', user.company_id).gte('work_date', from).lte('work_date', to).order('work_date');
        if (planAgain) setPlanning((prev) => keep(prev, planAgain));
      }
    } catch (err) {
      console.error('Error fetching planning:', err);
    }
  }, [user?.company_id, currentWeekStart]);

  // Today's absence (cell tint) + planned-but-undeclared dots + company + invitations.
  const fetchExtras = useCallback(async () => {
    if (!user?.company_id) return;
    // Lot 11 : le mois en cours (du 1er à aujourd'hui inclus : l'absence du jour
    // en a besoin). Borné des deux côtés : les absences « jusqu'au retour » sont
    // posées 90 jours à l'avance et auraient rempli la lecture pour rien.
    const windowStart = missingWindowStart();
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const [planRes, entRes, compRes, invRes, docRes, leaveRes, resRes, closures, cancelledRes] = await Promise.all([
      supabase.from('planning').select('id, user_id, work_date, absence_type').eq('company_id', user.company_id).gte('work_date', windowStart).lte('work_date', todayKey),
      supabase.from('time_entries').select('user_id, work_date').eq('company_id', user.company_id).in('status', ['submitted', 'validated']).gte('work_date', windowStart).lte('work_date', todayKey),
      supabase.from('companies').select('name, logo_url, travel_paid, weekly_hours, accountant_email, overtime_rate_1, overtime_rate_2').eq('id', user.company_id).maybeSingle(),
      supabase.from('invitations').select('*').eq('company_id', user.company_id).is('accepted_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }),
      // Paginé, pour la même raison que la liste détaillée : au-delà de 1000
      // documents, la pastille 📎 et le total « pièces » se figeaient à 1000
      // sans rien signaler. Une lecture en échec propage l'erreur plutôt que
      // d'annoncer zéro pièce.
      fetchAllPaged<{ worksite_id: string | null }>((f, t) => supabase.from('documents')
        .select('worksite_id').eq('company_id', user.company_id)
        .range(f, t) as unknown as PromiseLike<{ data: { worksite_id: string | null }[] | null; error: { message: string } | null }>)
        .then((data) => ({ data, error: null as { message: string } | null }))
        .catch((error: { message: string }) => ({ data: null as { worksite_id: string | null }[] | null, error })),
      supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('company_id', user.company_id).eq('status', 'pending'),
      // Réserves encore à traiter. Mêmes statuts que partout : un brouillon ou
      // une intervention retirée ne crée pas une réserve à poursuivre.
      // Lot 11 (lib/reserves isReserveLifted) : levée par le bureau OU par le salarié.
      supabase.from('time_entries').select('id', { count: 'exact', head: true })
        .eq('company_id', user.company_id).eq('reception', 'avec')
        .in('status', ['submitted', 'validated']).is('reserve_resolved_at', null).is('reserve_fixed_at', null),
      // Lot 11 : clôtures par salarié (null = table pas encore en base → aucune).
      fetchCompanyClosures(user.company_id),
      // Lot 11 : cases RETIRÉES par le salarié (« je n'y suis pas allé ») : rien à
      // lui réclamer pour elles.
      supabase.from('time_entries').select('planning_id').eq('company_id', user.company_id).eq('status', 'cancelled')
        .not('planning_id', 'is', null).gte('work_date', windowStart).lte('work_date', todayKey),
      // (active_sessions : lu par son propre sondage de 30 s, voir fetchLive.)
    ]);
    if (closures) setWorkerClosures((prev) => keep(prev, closures));
    setPendingLeaves(leaveRes.count || 0); // nombre : React ne redessine pas une valeur égale
    // Une erreur de lecture laisse la pastille inchangée : afficher 0 dirait
    // « aucune réserve », ce qui est précisément le message à ne pas donner.
    if (!resRes.error) setOpenReserves(resRes.count || 0);

    // Pastille 📎 : nombre de documents par chantier. Comme pour les réserves,
    // une erreur de lecture laisse la pastille inchangée — afficher 0 dirait
    // « aucune pièce », le message exactement inverse de la vérité.
    if (!docRes.error) {
      const docCounts = new Map<string, number>();
      for (const d of (docRes.data || []) as { worksite_id: string | null }[]) {
        if (d.worksite_id) docCounts.set(d.worksite_id, (docCounts.get(d.worksite_id) || 0) + 1);
      }
      setDocsByWorksite((prev) => keep(prev, docCounts));
    }

    const planned = new Map<string, Set<string>>();
    const absence = new Map<string, Set<string>>();
    const today = new Map<string, string>();
    // Lecture en échec : comme avant (aucune case comptée comme retirée).
    const withdrawn = cancelledRes.error ? EMPTY_SET : withdrawnSet(cancelledRes.data);
    for (const p of planRes.data || []) {
      if (p.absence_type) {
        if (!absence.has(p.user_id)) absence.set(p.user_id, new Set());
        absence.get(p.user_id)!.add(p.work_date);
        if (p.work_date === todayKey) today.set(p.user_id, p.absence_type);
      } else if (!withdrawn.has(p.id)) {
        // Une case retirée par le salarié ne réclame rien ; une autre case du
        // même jour, elle, réclame toujours ses heures.
        if (!planned.has(p.user_id)) planned.set(p.user_id, new Set());
        planned.get(p.user_id)!.add(p.work_date);
      }
    }
    const declared = new Map<string, Set<string>>();
    for (const e of entRes.data || []) {
      if (!declared.has(e.user_id)) declared.set(e.user_id, new Set());
      declared.get(e.user_id)!.add(e.work_date);
    }
    const miss = new Map<string, string[]>();
    planned.forEach((days, uid) => {
      const m = computeMissingDays(Array.from(days).filter((d) => !absence.get(uid)?.has(d)), declared.get(uid) || new Set<string>());
      if (m.length) miss.set(uid, m);
    });
    // Lot 12 : une sortie oubliée « à compléter » compte aussi. Lecture à part,
    // silencieuse (colonne absente tant que la migration n'est pas passée).
    const incRes = await supabase.from('time_entries').select('user_id, work_date, start_time, end_time, exit_forgotten')
      .eq('company_id', user.company_id).eq('exit_forgotten', true).eq('status', 'draft')
      .gte('work_date', windowStart).lte('work_date', todayKey);
    const incByUser = new Map<string, string[]>();
    for (const r of (incRes.error ? [] : incRes.data || []) as (QrFields & { user_id: string; work_date: string })[]) {
      if (!isExitToComplete(r)) continue;
      incByUser.set(r.user_id, [...(incByUser.get(r.user_id) || []), r.work_date]);
    }
    incByUser.forEach((days, uid) => { miss.set(uid, withIncompleteDays(miss.get(uid) || [], days)); });
    setTodayAbsence((prev) => keep(prev, today));
    setMissingByWorker((prev) => keep(prev, miss));
    setCompanyName(compRes.data?.name || '');
    const comp = compRes.data as { travel_paid?: boolean; weekly_hours?: number | null; accountant_email?: string | null; overtime_rate_1?: number | null; overtime_rate_2?: number | null } | null;
    setTravelPaid(!!comp?.travel_paid);
    setCompanyWeeklyHours(comp?.weekly_hours ?? DEFAULT_WEEKLY_HOURS);
    setOvertimeRates((prev) => keep(prev, {
      tier1: comp?.overtime_rate_1 ?? DEFAULT_OVERTIME_RATES.tier1,
      tier2: comp?.overtime_rate_2 ?? DEFAULT_OVERTIME_RATES.tier2,
    }));
    setAccountantEmail((comp?.accountant_email || '').trim());
    setCompanyLogo((compRes.data as { logo_url?: string | null } | null)?.logo_url || '');
    setInvitations((prev) => keep(prev, (invRes.data || []) as Invitation[]));
  }, [user?.company_id]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchPlanning(); }, [fetchPlanning]);
  useEffect(() => {
    fetchExtras();
    const id = setInterval(fetchExtras, 60000);
    return () => clearInterval(id);
  }, [fetchExtras]);

  // ─── Lot 9 : « en cours depuis » — sondage dédié des chronos ouverts ─────────
  // Toutes les 30 s, en pause quand l'onglet est caché, relu tout de suite au
  // retour. Colonnes STRICTEMENT utiles : jamais `positions` (une position est
  // une donnée personnelle — le planning n'en a pas besoin pour dire « depuis »).
  // Quand un chrono connu disparaît, le salarié a fermé : sa journée existe
  // maintenant en brouillon → on relit le planning pour qu'elle apparaisse
  // sans recharger la page.
  const fetchPlanningRef = useRef(fetchPlanning);
  useEffect(() => { fetchPlanningRef.current = fetchPlanning; }, [fetchPlanning]);
  const liveKeysRef = useRef<Set<string> | null>(null);
  const fetchLive = useCallback(async () => {
    if (!user?.company_id) return;
    // Lot 12 : seulement les chronos ouverts AUJOURD'HUI (une sortie oubliée
    // d'un jour précédent n'allume rien ; elle est fermée la nuit).
    const { data, error } = await supabase.from('active_sessions')
      .select('user_id, worksite_id, planning_id, work_date, started_at')
      .eq('company_id', user.company_id).eq('work_date', format(new Date(), 'yyyy-MM-dd'));
    // Lecture en échec : on garde l'état connu (dire « personne » serait faux).
    if (error) return;
    const rows = (data || []) as LiveSessionLike[];
    // Clé = salarié + départ : fermer A puis ouvrir B entre deux lectures est
    // aussi une fermeture (un brouillon est né pour A).
    const next = new Set(rows.map((r) => `${r.user_id}|${r.started_at}`));
    const prev = liveKeysRef.current;
    liveKeysRef.current = next;
    setLiveNow((prev) => keep(prev, rows));
    if (prev && Array.from(prev).some((k) => !next.has(k))) fetchPlanningRef.current();
  }, [user?.company_id]);
  useEffect(() => {
    if (!user?.company_id) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (timer === null) timer = setInterval(fetchLive, LIVE_POLL_MS); };
    const stop = () => { if (timer !== null) { clearInterval(timer); timer = null; } };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') { stop(); return; }
      fetchLive();
      start();
    };
    fetchLive();
    if (document.visibilityState !== 'hidden') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [fetchLive, user?.company_id]);

  const fetchClosures = useCallback(async () => {
    if (!user?.company_id) return;
    const { data } = await supabase.from('month_closures').select('month').eq('company_id', user.company_id);
    const next = new Set(((data || []) as { month: string }[]).map((m) => m.month.slice(0, 7)));
    setClosedMonths((prev) => keep(prev, next));
  }, [user?.company_id]);

  useEffect(() => { fetchClosures(); }, [fetchClosures]);

  // Interrupteur de la borne : lecture SÉPARÉE, comme dans les réglages — tant que
  // la colonne n'existe pas en base, la requête échoue seule et rien ne s'affiche.
  useEffect(() => {
    if (!user?.company_id) return;
    let stale = false;
    supabase.from('companies').select('kiosk_enabled').eq('id', user.company_id).maybeSingle()
      .then(({ data }) => {
        if (!stale) setKioskOn(!!(data as { kiosk_enabled?: boolean } | null)?.kiosk_enabled);
      });
    return () => { stale = true; };
  }, [user?.company_id]);

  const refresh = () => { fetchPlanning(); fetchExtras(); fetchClosures(); };
  // Lot 11 : « Annuler » peut être cliqué bien après (la carte reste) — peut-être sur
  // une autre semaine : il relit alors la semaine AFFICHÉE, pas celle de la suppression.
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; });

  // Les deux mois que le bureau est susceptible de clôturer : celui qui vient
  // de finir et celui en cours. Au-delà, ça relève de l'historique.
  const closableMonths = useMemo(() => {
    const now = new Date();
    return [subMonths(now, 1), now].map((d) => format(d, 'yyyy-MM'));
  }, []);

  // Avant de clôturer : compter ce qui resterait bloqué. Une journée en
  // brouillon dans un mois clos ne pourra plus jamais être envoyée par le
  // salarié — il faut le dire avant, pas après.
  const askClosure = async (month: string) => {
    if (!user?.company_id) return;
    const from = `${month}-01`;
    const to = format(endOfMonth(new Date(`${from}T00:00:00`)), 'yyyy-MM-dd');
    const { count } = await supabase.from('time_entries')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', user.company_id).eq('status', 'draft')
      .gte('work_date', from).lte('work_date', to);
    setClosureTarget({ month, drafts: count || 0 });
  };

  const closeMonth = async (month: string) => {
    if (!user?.company_id) return;
    setClosureBusy(true);
    try {
      await closeMonthWrite(user.company_id, user.id, month);
      toast.success(`${format(new Date(`${month}-01T00:00:00`), 'MMMM yyyy', { locale: fr })} clôturé`);
      setClosureTarget(null);
      fetchClosures();
    } catch (err) {
      console.error('Error closing month:', err);
      toast.error('Impossible de clôturer ce mois');
    } finally { setClosureBusy(false); }
  };

  const reopenMonth = async (month: string) => {
    if (!user?.company_id) return;
    setClosureBusy(true);
    try {
      const { data, error } = await supabase.from('month_closures').delete()
        .eq('company_id', user.company_id).eq('month', `${month}-01`).select('month');
      if (error) throw error;
      if (!data || data.length === 0) { toast.error('Mois déjà rouvert'); fetchClosures(); return; }
      toast.success(`${format(new Date(`${month}-01T00:00:00`), 'MMMM yyyy', { locale: fr })} rouvert`);
      fetchClosures();
    } catch (err) {
      console.error('Error reopening month:', err);
      toast.error('Impossible de rouvrir ce mois');
    } finally { setClosureBusy(false); }
  };

  /**
   * Lot 1 : la bulle qui PORTE une ligne d'heures. Avec deux créneaux du même
   * chantier le même jour (« Matin » + « Après-midi »), les deux bulles
   * affichaient chacune le total des deux : « 08:00–17:00 · 7h30 » deux fois,
   * 15 h à l'œil pour 7h30 payées. Chaque ligne n'est plus montrée qu'une fois :
   * sur la bulle de son planning_id, sinon sur la première bulle de ce chantier.
   */
  const bubbleKeyOf = useMemo(() => {
    const groups = new Map<string, string[]>();
    const sorted = [...planning].filter((p) => !p.absence_type)
      .sort((a, b) => (a.estimated_start || '99').localeCompare(b.estimated_start || '99') || a.id.localeCompare(b.id));
    for (const p of sorted) {
      const k = realKey(p.user_id, p.work_date, p.worksite_id);
      const list = groups.get(k);
      if (list) list.push(p.id); else groups.set(k, [p.id]);
    }
    return (e: { user_id: string; work_date: string; worksite_id: string | null; planning_id?: string | null }) => {
      const k = realKey(e.user_id, e.work_date, e.worksite_id);
      const list = groups.get(k);
      if (!list) return k;
      return `p:${e.planning_id && list.includes(e.planning_id) ? e.planning_id : list[0]}`;
    };
  }, [planning]);

  const aggregate = (rows: typeof realEntries) => {
    const m = new Map<string, RealAgg>();
    for (const e of rows) {
      const k = bubbleKeyOf(e);
      const cur = m.get(k);
      // Une réserve « ouverte » = déclarée ET pas encore levée (par le bureau ou,
      // lot 11, par le salarié : lib/reserves isReserveLifted). Sans cette
      // distinction, le triangle d'alerte resterait allumé à vie sur la case.
      const stillOpen = e.reception === 'avec' && !isReserveLifted(e);
      if (!cur) m.set(k, { minutes: e.total_minutes, start: e.start_time, end: e.end_time, count: 1, reception: (e.reception as ReceptionStatus) || null, reserveOpen: stillOpen, note: e.observation || '' });
      else {
        cur.minutes += e.total_minutes;
        if (e.start_time && e.start_time < cur.start) cur.start = e.start_time;
        if (e.end_time && e.end_time > cur.end) cur.end = e.end_time;
        cur.count += 1;
        // garde le statut le plus « fort » (avec > en_cours > sans) + cumule les notes
        if ((RECEPTION_RANK[e.reception || ''] || 0) > (RECEPTION_RANK[cur.reception || ''] || 0)) cur.reception = (e.reception as ReceptionStatus) || cur.reception;
        if (stillOpen) cur.reserveOpen = true;
        if (e.observation) cur.note = cur.note ? `${cur.note} · ${e.observation}` : e.observation;
      }
    }
    return m;
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const realMap = useMemo(() => aggregate(realEntries), [realEntries, bubbleKeyOf]);
  // Les brouillons ne sont JAMAIS mélangés aux heures déclarées : ils ne
  // comptent ni dans le total du cockpit, ni dans l'export. On les montre
  // seulement pour que le bureau sache qu'une saisie existe.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const draftMap = useMemo(() => aggregate(draftEntries), [draftEntries, bubbleKeyOf]);
  // Lot 2 : interventions qui ne portent qu'un brouillon vide (la fenêtre le dit :
  // « Supprimer » l'emporte), et celles dont le brouillon est une sortie oubliée
  // à compléter (gardées : son heure d'arrivée compte).
  const emptyDraftPids = useMemo(() => {
    const out = new Set<string>();
    for (const e of emptyDrafts) { const k = bubbleKeyOf(e); if (k.startsWith('p:')) out.add(k.slice(2)); }
    return out;
  }, [emptyDrafts, bubbleKeyOf]);
  const exitDraftKeys = useMemo(() => new Set(draftEntries.filter((e) => e.exit_forgotten).map((e) => bubbleKeyOf(e))), [draftEntries, bubbleKeyOf]);

  /**
   * Lot 11 : les jours qu'on peut ENCORE réclamer. Un jour d'un mois clôturé, ou
   * d'un salarié clôturé jusqu'à cette date (« Clôturer jusqu'au… »), ne peut plus
   * être envoyé : le compter le laisserait « à relancer » pour toujours. Même
   * Map pour les pastilles des lignes, le bandeau et la liste « Salariés ».
   */
  const missingEffective = useMemo(() => {
    if (closedMonths.size === 0 && workerClosures.size === 0) return missingByWorker;
    const out = new Map<string, string[]>();
    missingByWorker.forEach((days, uid) => {
      const open = days.filter((d) => !closedMonths.has(d.slice(0, 7)) && !closedFor(workerClosures, uid, d));
      if (open.length) out.set(uid, open);
    });
    return out;
  }, [missingByWorker, closedMonths, workerClosures]);

  /** Qui doit encore des heures, et pour quels jours. */
  // Lot 9 : calculé sur `workers` — EXACTEMENT les lignes de la grille. fetchExtras
  // lit le planning de toute l'entreprise (comptes désactivés, bureau compris) :
  // compter tout missingByWorker donnait un bandeau plus gros que la somme des
  // pastilles « X jours en attente », sans que personne puisse savoir pourquoi.
  const waitingByWorker = useMemo(() => {
    const out: { id: string; name: string; days: string[] }[] = [];
    for (const w of workers) {
      const days = missingEffective.get(w.id) || [];
      if (days.length) out.push({ id: w.id, name: `${w.first_name} ${w.last_name}`, days: [...days].sort() });
    }
    return out.sort((a, b) => b.days.length - a.days.length);
  }, [workers, missingEffective]);

  // Stats du cockpit (tableau de bord). Lot 11 : deux indicateurs seulement.
  // « À relancer » = somme des pastilles des lignes (journées planifiées du mois
  // en cours, sans heures envoyées) ; « Pièces » = pièces jointes de l'entreprise.
  // (« X salariés » : le bouton « Salariés » existe ; les heures par chantier
  // sont dans « Coût chantiers ».)
  const cockpitStats = useMemo(() => {
    const waiting = waitingByWorker.reduce((n, r) => n + r.days.length, 0);
    let docs = 0; docsByWorksite.forEach((n) => { docs += n; });
    return { waiting, docs };
  }, [waitingByWorker, docsByWorksite]);
  // « octobre » : le mois regardé par « À relancer », écrit en toutes lettres.
  // Recalculé à chaque rendu : un onglet resté ouvert au changement de mois suit les données (relues toutes les 60 s).
  // Lot 12 : mois précédent + mois en cours (« septembre et octobre »).
  const monthLabel = `${format(subMonths(new Date(), 1), 'MMMM', { locale: fr })} et ${format(new Date(), 'MMMM', { locale: fr })}`;

  /** Les pièces jointes rangées par chantier — le classement qu'on n'avait pas. */
  const docsByChantier = useMemo(() => {
    if (!docList) return [];
    const m = new Map<string, DocLine[]>();
    for (const d of docList) {
      const k = d.worksite_id || '';
      const arr = m.get(k); if (arr) arr.push(d); else m.set(k, [d]);
    }
    return Array.from(m.entries())
      .map(([id, docs]) => ({ id, docs, name: id ? (worksites.find((w) => w.id === id)?.client_name || 'Chantier supprimé') : 'Sans chantier' }))
      .sort((a, b) => b.docs.length - a.docs.length);
  }, [docList, worksites]);

  // Le détail des pièces se lit à l'ouverture du panneau, à chaque ouverture :
  // une liste gardée en mémoire aurait fini par montrer un document supprimé
  // ailleurs. Une ouverture est un geste volontaire, une requête indexée par
  // company_id la paie sans effort.
  useEffect(() => {
    if (statPanel !== 'docs' || !user?.company_id) return;
    let cancelled = false;
    setDocListState('loading');
    (async () => {
      try {
        // PAGINÉ. Au-delà du plafond PostgREST (1000 lignes), une requête
        // simple RÉUSSIT en renvoyant un jeu tronqué, sans la moindre erreur :
        // le panneau aurait présenté une liste incomplète comme complète, et
        // les photos les plus anciennes — celles d'un litige — auraient
        // disparu les premières. Trouvé par Codex sur la PR 104.
        const rows = await fetchAllPaged<DocLine>((f, t) => supabase.from('documents')
          .select('id,worksite_id,label,file_name,mime_type,work_date,created_at')
          .eq('company_id', user.company_id)
          .order('created_at', { ascending: false })
          .range(f, t) as unknown as PromiseLike<{ data: DocLine[] | null; error: { message: string } | null }>);
        if (cancelled) return;
        setDocList(rows);
        setDocListState('ok');
      } catch {
        // Une erreur de lecture ne doit pas se lire « aucune pièce » : c'est le
        // contresens exact qu'on veut éviter dans un dossier de litige.
        if (!cancelled) setDocListState('ko');
      }
    })();
    return () => { cancelled = true; };
  }, [statPanel, user?.company_id]);

  const realForPlanning = (p: PlanningWithWorksite): RealAgg | undefined =>
    p.absence_type ? undefined : realMap.get(`p:${p.id}`);

  // Brouillon affiché seulement s'il n'y a pas déjà des heures envoyées.
  const draftForPlanning = (p: PlanningWithWorksite): RealAgg | undefined => {
    if (p.absence_type) return undefined;
    const k = `p:${p.id}`;
    return realMap.has(k) ? undefined : draftMap.get(k);
  };

  // Declared hours that DON'T match a planned chantier of the cell (hors-planning) —
  // shown as a distinct "déclaré par le salarié" chip on the grid.
  const worksiteNameById = useMemo(() => {
    const m = new Map<string, string>();
    worksites.forEach((w) => m.set(w.id, w.client_name));
    return m;
  }, [worksites]);
  const extraDeclaredForCell = (workerId: string, dateStr: string) => {
    const plannedWs = new Set(
      planning.filter((p) => p.user_id === workerId && p.work_date === dateStr && !p.absence_type).map((p) => p.worksite_id),
    );
    const agg = new Map<string, { worksiteId: string | null; name: string; minutes: number; pending: boolean }>();
    const add = (rows: typeof realEntries, pending: boolean) => {
      for (const e of rows) {
        if (e.user_id !== workerId || e.work_date !== dateStr) continue;
        if (e.worksite_id && plannedWs.has(e.worksite_id)) continue; // déjà porté par sa bulle
        const key = `${e.worksite_id || 'none'}|${pending ? 'd' : 'r'}`;
        const name = (e.worksite_id && worksiteNameById.get(e.worksite_id)) || 'Autre';
        const cur = agg.get(key);
        if (cur) cur.minutes += e.total_minutes;
        else agg.set(key, { worksiteId: e.worksite_id, name, minutes: e.total_minutes, pending });
      }
    };
    add(realEntries, false);
    add(draftEntries, true);
    return Array.from(agg.values());
  };

  // ─── Lot 9 : où afficher « en cours depuis » ─────────────────────────────────
  // UNE règle, partagée avec la borne et le salarié (placeLive) : la case
  // salarié × jour passe en vert ; la bulle désignée est celle du planning_id
  // du chrono, sinon celle du même chantier — jamais « la première » par défaut.
  // L'état en direct n'entre dans AUCUN total ni export : il ne sert qu'ici.
  const livePlaces = useMemo(() => placeLive(
    liveNow,
    planning.map((p) => ({ id: p.id, user_id: p.user_id, worksite_id: p.worksite_id, work_date: p.work_date, absence: !!p.absence_type })),
  ), [liveNow, planning]);
  const liveForCell = (workerId: string, dateStr: string): LivePlace | undefined => livePlaces.get(cellKey(workerId, dateStr));
  // « 07:45 », ou « lun. 07:45 » quand le chrono date d'un jour passé (oubli de
  // fermeture) : « depuis 07:45 » laisserait croire qu'il a commencé ce matin.
  const liveSinceLabel = (workDate: string, since: string): string =>
    workDate < parisDay(Date.now()) ? `${format(parseISO(workDate), 'EEE', { locale: fr })} ${since}` : since;
  const liveForBubble = (p: PlanningWithWorksite): string | undefined => {
    const lp = liveForCell(p.user_id, p.work_date);
    return lp && lp.slotId === p.id ? liveSinceLabel(lp.work_date, lp.since) : undefined;
  };
  // Chantier pointé hors planning de ce jour → pastille verte dans la case.
  const liveChipFor = (workerId: string, dateStr: string) => {
    const lp = liveForCell(workerId, dateStr);
    if (!lp || lp.slotId) return null;
    return <LiveChip since={liveSinceLabel(lp.work_date, lp.since)} name={(lp.worksite_id && worksiteNameById.get(lp.worksite_id)) || 'chantier'} />;
  };

  // ─── Lot 11 : « Sélectionner » → « Supprimer (N) » → « Annuler » ───────────────
  // Ce qui ne s'efface JAMAIS d'ici (et le dit) : des heures envoyées ou notées,
  // un pointage en cours, un mois clôturé (ou un salarié clôturé à cette date).
  // Lot 2 : une case RETIRÉE par le salarié se supprime désormais — sa ligne
  // retirée est détachée, ses heures restent (lib/erase) ; un brouillon vide part
  // avec la case.
  const hardLock = (p: PlanningWithWorksite): string | null => {
    if (realForPlanning(p)) return 'Heures envoyées — non supprimable';
    if (draftForPlanning(p)) return exitDraftKeys.has(`p:${p.id}`) ? 'Sortie oubliée à compléter — non supprimable' : 'Heures notées par le salarié — non supprimable';
    if (liveForBubble(p)) return 'Pointage en cours — non supprimable';
    if (closedMonths.has(p.work_date.slice(0, 7))) return 'Mois clôturé — non supprimable';
    if (closedFor(workerClosures, p.user_id, p.work_date)) return 'Heures clôturées pour ce salarié — non supprimable';
    return null;
  };
  // En sélection, on garde aussi les absences (elles se gèrent par « Présent » :
  // « Tout sélectionner » ne doit jamais effacer un arrêt maladie) et les
  // interventions ajoutées par le salarié.
  const lockReason = (p: PlanningWithWorksite): string | null => {
    if (p.absence_type) return 'Absence — à changer avec « Présent »';
    if (p.added_by_worker) return 'Ajoutée par le salarié — non supprimable';
    return hardLock(p);
  };
  // Lot 2 : ce qu'un glisser simple ne DÉPLACE plus vers une autre case. Une ligne
  // d'heures (envoyée, notée) désigne sa case par planning_id : déplacée, la case
  // laissait la ligne pointer un autre jour, et le chargement suivant recréait
  // une bulle « ajoutée par le salarié » à l'ancienne place (ensure_planning_slot).
  // Une case retirée par le salarié, ou qui ne porte qu'un brouillon vide, se
  // déplace : comme pour « Supprimer », la ligne retirée est détachée et le
  // brouillon vide effacé avant (prepareMove). La COPIE (Ctrl / Alt), elle,
  // reste toujours possible.
  const moveLock = (p: PlanningWithWorksite): string | null => {
    if (realForPlanning(p)) return 'Heures envoyées — non déplaçable';
    if (draftForPlanning(p)) return exitDraftKeys.has(`p:${p.id}`) ? 'Sortie oubliée à compléter — non déplaçable' : 'Heures notées par le salarié — non déplaçable';
    if (liveForBubble(p)) return 'Pointage en cours — non déplaçable';
    if (closedMonths.has(p.work_date.slice(0, 7))) return 'Mois clôturé — non déplaçable';
    if (closedFor(workerClosures, p.user_id, p.work_date)) return 'Heures clôturées pour ce salarié — non déplaçable';
    return null;
  };
  // La sélection affichée = la sélection ∩ ce qui est encore au planning et
  // supprimable. Calculée au rendu : aucun setState quand un sondage relit.
  const selIds: string[] = selectMode
    ? planning.filter((p) => selected.has(p.id) && !lockReason(p)).map((p) => p.id)
    : [];
  const selOn = selectMode ? new Set(selIds) : EMPTY_SET;
  const selFor = (p: PlanningWithWorksite): SelState | undefined => {
    if (!selectMode) return undefined;
    const lock = lockReason(p);
    return { on: !lock && selOn.has(p.id), lock };
  };
  const selectableIn = (pred: (p: PlanningWithWorksite) => boolean) =>
    planning.filter((p) => !p.absence_type && pred(p) && !lockReason(p)).map((p) => p.id);
  /** Coche tout le groupe ; s'il est déjà entièrement coché, le décoche. */
  const toggleGroup = (ids: string[]) => {
    if (!ids.length) { toast('Rien à cocher ici : aucune intervention supprimable.'); return; }
    const allOn = ids.every((id) => selOn.has(id));
    setSelected(() => {
      const next = new Set(selIds);
      for (const id of ids) { if (allOn) next.delete(id); else next.add(id); }
      return next;
    });
  };
  const toggleOne = (p: PlanningWithWorksite, lock: string | null) => {
    if (lock) { toast(lock); return; }
    toggleGroup([p.id]);
  };
  const enterSelect = () => {
    setStatPanel(null); setChantierMenuOpen(false); setLegendOpen(false);
    setSelected(EMPTY_SET); setSelectMode(true);
  };
  const exitSelect = () => { setSelectMode(false); setSelected(EMPTY_SET); };
  // Changer de semaine vide la sélection (« Tout sélectionner » = la semaine affichée).
  const changeWeek = (d: Date) => {
    setCurrentWeekStart(d);
    if (selected.size) setSelected(EMPTY_SET);
  };
  useEffect(() => {
    if (!selectMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSelectMode(false); setSelected(EMPTY_SET); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectMode]);

  /** La carte « N intervention(s) supprimée(s) · Annuler » : elle reste jusqu'à sa croix. */
  const showUndo = (r: EraseResult) => {
    const k = r.deleted.length;
    setUndoCard({
      key: Date.now(),
      message: `${k} intervention${k > 1 ? 's' : ''} supprimée${k > 1 ? 's' : ''}`
        + (r.skipped ? ` · ${r.skipped} gardée${r.skipped > 1 ? 's' : ''} (${r.reason})` : ''),
      strong: k > 1,
      undo: async () => {
        try {
          // Lot 2 : l'intervention, puis ses brouillons vides, puis le lien des lignes retirées.
          await undoErase(r);
          refreshRef.current();
          return { ok: true, message: k > 1 ? 'Annulé : tout est remis au planning.' : 'Annulé : l’intervention est remise au planning.' };
        } catch (err) {
          console.error('Error restoring planning:', err);
          return { ok: false, message: 'Impossible de tout remettre pour le moment. Réessayez.' };
        }
      },
    });
  };
  const deleteSelected = async () => {
    if (!user?.company_id) return;
    // Recalculé AU MOMENT du clic : des heures ont pu être envoyées entre-temps.
    const ids = planning.filter((p) => selOn.has(p.id) && !lockReason(p)).map((p) => p.id);
    if (!ids.length) return;
    setEraseBusy(true);
    try {
      const r = await erasePlanning(user.company_id, { ids });
      if (!r.deleted.length) { toast.error(`Rien n’a été supprimé${r.reason ? ` (${r.reason})` : ''}.`); return; }
      const gone = new Set(r.deleted.map((x) => x.id));
      setPlanning((ps) => ps.filter((p) => !gone.has(p.id)));
      exitSelect();
      showUndo(r);
      refresh();
    } catch (err) {
      console.error('Error erasing planning:', err);
      toast.error('Impossible de supprimer pour le moment. Rien n’a été effacé.');
    } finally {
      setEraseBusy(false);
    }
  };

  // Attribute a real client to a worker-added intervention (from the grid).
  const attributeClient = async (newWorksiteId: string) => {
    if (!user?.company_id || !attributeTarget) return;
    setAttrBusy(true);
    try {
      await attributeEntries(user.company_id, { userId: attributeTarget.userId, date: attributeTarget.dateStr, fromWorksiteId: attributeTarget.worksiteId ?? null, toWorksiteId: newWorksiteId });
      toast.success('Client attribué');
      setAttributeTarget(null);
      fetchPlanning();
    } catch (err) {
      console.error('Error attributing client:', err);
      toast.error("Impossible d'attribuer le client");
    } finally {
      setAttrBusy(false);
    }
  };
  const cellChantiers = useCallback((workerId: string, dateStr: string) =>
    planning.filter(p => p.user_id === workerId && p.work_date === dateStr && !p.absence_type).sort(orderCmp),
  [planning]);

  // ─── drag: create (palette) · move (cross-cell) · reorder (within cell) ──────
  // Lot 2 : + copier (Ctrl / Alt / ⌘ maintenu au dépôt).

  // Les touches pendant qu'une bulle est en main, écoutées sur la fenêtre (phase
  // de capture). Appuyer ou relâcher en cours de route compte : c'est l'état au
  // moment du dépôt qui décide. Alt seul ouvrirait la barre de menus de Firefox.
  useEffect(() => {
    if (activeDrag?.type !== 'move') return;
    const held = (e: KeyboardEvent | PointerEvent) => e.ctrlKey || e.altKey || e.metaKey;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Alt') e.preventDefault();
      setCopy(held(e));
    };
    const onMove = (e: PointerEvent) => setCopy(held(e));
    const onBlur = () => setCopy(false); // fenêtre quittée : la touche a pu être relâchée ailleurs
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [activeDrag?.type, setCopy]);

  const handleDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as { type?: 'move' | 'new'; worksiteId?: string } | undefined;
    const type = data?.type === 'new' ? 'new' : 'move';
    const ev = e.activatorEvent as PointerEvent | null;
    setCopy(type === 'move' && !!ev && (ev.ctrlKey || ev.altKey || ev.metaKey));
    setActiveDrag({ id: String(e.active.id), type, worksiteId: data?.worksiteId });
  };

  // L'ordre d'une case (au mieux : il faut la colonne `position`).
  const persistOrder = async (ids: string[]) => {
    if (!user?.company_id) return;
    try {
      const results = await Promise.all(ids.map((id, i) =>
        supabase.from('planning').update({ position: i }).eq('id', id).eq('company_id', user.company_id)));
      const bad = results.find(r => r.error);
      if (bad?.error) throw bad.error;
    } catch (err) {
      console.warn('Order not persisted (run the SQL migration?):', err);
      if (!positionWarned) {
        toast('Astuce : exécutez le SQL « position » pour mémoriser l\'ordre des chantiers.');
        setPositionWarned(true);
      }
    }
  };

  /**
   * Lot 2 : COPIER une intervention (Ctrl / Alt au dépôt). Une seule ligne de
   * planning neuve, par le même chemin que « Ajouter au planning » : chantier,
   * horaire prévu et note. Jamais les heures du salarié, ni ses documents, ni
   * l'ordre, ni « ajoutée par le salarié ». L'original n'est pas touché.
   */
  const copySlot = async (src: PlanningWithWorksite, tWorker: string, tDate: string, overBubbleId: string | null) => {
    if (!user?.company_id || !src.worksite_id) return;
    const cell = cellChantiers(tWorker, tDate);
    const refusal = copyRefusal(src, cell, {
      absent: !!absenceForDay(tWorker, tDate),
      monthClosed: closedMonths.has(tDate.slice(0, 7)),
      workerClosed: !!closedFor(workerClosures, tWorker, tDate),
    });
    if (refusal) { toast.error(refusal.message); return; }
    let newId: string;
    try {
      newId = await addPlanningSlot({
        companyId: user.company_id, createdBy: user.id, userId: tWorker, worksiteId: src.worksite_id, workDate: tDate,
        notes: src.notes, estimatedStart: src.estimated_start, estimatedEnd: src.estimated_end,
      });
    } catch (err) {
      console.error('Error copying planning:', err);
      toast.error('Impossible de copier : rien n’a été ajouté.');
      return;
    }
    // Déposée SUR une bulle : la copie prend sa place, comme un déplacement.
    if (overBubbleId) {
      const ids = cell.map((p) => p.id);
      const i = ids.indexOf(overBubbleId);
      ids.splice(i < 0 ? ids.length : i, 0, newId);
      await persistOrder(ids);
    }
    const who = workers.find((w) => w.id === tWorker)?.first_name || 'Salarié';
    const companyId = user.company_id;
    setUndoCard({
      key: Date.now(),
      message: `Intervention copiée · ${who} · ${format(parseISO(tDate), 'EEE d MMM', { locale: fr })}`,
      strong: false,
      // Les mêmes gardes que « Supprimer » : des heures notées depuis sur la copie,
      // ou un mois clôturé entre-temps, la gardent — et on le dit.
      undo: async () => {
        try {
          const r = await erasePlanning(companyId, { ids: [newId] });
          refreshRef.current();
          if (!r.deleted.length) return { ok: false, message: `Impossible d’annuler : ${r.reason || 'la copie n’est plus au planning'}.` };
          return { ok: true, message: 'Annulé : la copie est retirée du planning.' };
        } catch (err) {
          console.error('Error undoing copy:', err);
          return { ok: false, message: 'Impossible d’annuler pour le moment. Réessayez.' };
        }
      },
    });
    fetchPlanning();
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const copy = copyRef.current; // l'état des touches AU DÉPÔT, avant tout le reste
    setCopy(false);
    const drag = activeDrag;
    setActiveDrag(null);
    const { active, over } = e;
    if (!over || !user?.company_id) return;

    const overId = String(over.id);
    let tWorker: string;
    let tDate: string;
    let overBubbleId: string | null = null;
    if (overId.startsWith('bub|')) {
      overBubbleId = overId.slice(4);
      const ob = planning.find(p => p.id === overBubbleId);
      if (!ob) return;
      tWorker = ob.user_id; tDate = ob.work_date;
    } else {
      [tWorker, tDate] = overId.split('|');
    }

    // Create a new affectation by dropping a client.
    if (drag?.type === 'new') {
      if (!drag.worksiteId) return;
      const ws = worksites.find(w => w.id === drag.worksiteId);
      try {
        await addPlanningSlot({ companyId: user.company_id, createdBy: user.id, userId: tWorker, worksiteId: drag.worksiteId, workDate: tDate });
        toast.success(`${ws?.client_name || 'Client'} ajouté au planning`);
        fetchPlanning();
      } catch (err) {
        console.error('Error creating planning:', err);
        toast.error("Impossible d'ajouter au planning");
      }
      return;
    }

    // Move / reorder an existing chantier bubble.
    const draggedId = String(active.id);
    const dragged = planning.find(p => p.id === draggedId);
    if (!dragged || dragged.absence_type) return;
    if (copy) { await copySlot(dragged, tWorker, tDate, overBubbleId); return; }
    if (overBubbleId === draggedId) return;

    const sameCell = dragged.user_id === tWorker && dragged.work_date === tDate;
    // Lot 2 : vers une AUTRE case, d'abord ce que la bulle porte, puis la case visée.
    // Réordonner dans la même case ne change rien de tout ça : toujours permis.
    if (!sameCell) {
      const lock = moveLock(dragged);
      if (lock) { toast.error(`${lock} · maintenez Ctrl ou Alt pour copier`); return; }
      const refusal = targetRefusal({
        absent: !!absenceForDay(tWorker, tDate),
        monthClosed: closedMonths.has(tDate.slice(0, 7)),
        workerClosed: !!closedFor(workerClosures, tWorker, tDate),
      }, 'déplacé');
      if (refusal) { toast.error(refusal.message); return; }
    }
    const target = cellChantiers(tWorker, tDate).filter(p => p.id !== draggedId);
    const idx = overBubbleId ? (() => { const i = target.findIndex(p => p.id === overBubbleId); return i < 0 ? target.length : i; })() : target.length;
    const newIds = target.map(p => p.id);
    newIds.splice(idx, 0, draggedId);
    if (sameCell && newIds.every((id, i) => (cellChantiers(tWorker, tDate)[i]?.id === id))) return; // no change

    // Optimistic reorder/move.
    const prev = planning;
    setPlanning(ps => ps.map(p => {
      if (p.id === draggedId) return { ...p, user_id: tWorker, work_date: tDate, position: newIds.indexOf(draggedId) };
      const i = newIds.indexOf(p.id);
      return i >= 0 ? { ...p, position: i } : p;
    }));

    // 1) The move itself (user_id/date) must work even without the position column.
    if (!sameCell) {
      // Lot 2 : la base d'abord, pas seulement ce que l'écran affiche. Des heures
      // notées depuis le dernier chargement gardent la case ; une ligne retirée
      // est détachée, un brouillon vide effacé (lib/erase), remis si le
      // déplacement échoue.
      let prep: MovePrep;
      try {
        prep = await prepareMove(user.company_id, draggedId);
      } catch (err) {
        console.error('Error preparing move:', err);
        toast.error('Impossible de déplacer');
        setPlanning(prev);
        return;
      }
      if (prep.reason) {
        toast.error(`Rien n’a été déplacé : ${prep.reason} · maintenez Ctrl ou Alt pour copier`);
        setPlanning(prev);
        fetchPlanning();
        return;
      }
      const error = await updatePlanningSlot(user.company_id, draggedId, { userId: tWorker, workDate: tDate }).then(() => null, (e: unknown) => e);
      if (error) {
        console.error('Error moving planning:', error);
        await undoMovePrep(prep).catch((e) => console.error('Remise après échec impossible :', e));
        toast.error('Impossible de déplacer');
        setPlanning(prev);
        return;
      }
      if (prep.drafts.length || prep.detached.length) fetchPlanning();
    }
    // 2) Persist the order (best-effort — requires the `position` column).
    await persistOrder(newIds);
  };

  // ─── cell add (click) ─────────────────────────────────────────────────────────

  const openAdd = (workerId: string, dateStr: string) => {
    setAddTarget({ workerId, date: dateStr });
    setAddWorksite(paletteWorksiteId || '');
    setAddNote('');
    setAddStart(''); setAddEnd('');
    setAddOpen(true);
  };

  const confirmAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.company_id || !addTarget) return;
    if (!addWorksite) { toast.error('Choisissez un client'); return; }
    const timeErr = addTimeBad ? `Heure non comprise. ${TIME_HINT}` : scheduleError(addStart, addEnd);
    if (timeErr) { toast.error(timeErr); return; }
    setAddSaving(true);
    try {
      await addPlanningSlot({
        companyId: user.company_id, createdBy: user.id, userId: addTarget.workerId,
        worksiteId: addWorksite, workDate: addTarget.date, notes: addNote,
        estimatedStart: addStart || null, estimatedEnd: addEnd || null,
      });
      toast.success('Ajouté au planning');
      setAddOpen(false);
      setAddTarget(null);
      refresh();
    } catch (err) {
      console.error('Error adding planning:', err);
      toast.error("Impossible d'enregistrer");
    } finally {
      setAddSaving(false);
    }
  };

  // ─── status / absence ───────────────────────────────────────────────────────

  const fromLabel = (fromStr: string) =>
    fromStr === todayStr ? "aujourd'hui" : format(new Date(`${fromStr}T00:00:00`), 'EEEE d MMMM', { locale: fr });

  const setPresentFrom = async (workerId: string, fromStr: string) => {
    if (!user?.company_id) return;
    try {
      const { error } = await supabase.from('planning').delete()
        .eq('company_id', user.company_id).eq('user_id', workerId)
        .gte('work_date', fromStr).not('absence_type', 'is', null);
      if (error) throw error;
      toast.success(fromStr === todayStr ? 'Salarié présent' : `Présent à partir du ${format(new Date(`${fromStr}T00:00:00`), 'd MMM', { locale: fr })}`);
      refresh();
    } catch (err) {
      console.error('Error setting present:', err);
      toast.error('Impossible de mettre à jour le statut');
    }
  };

  const chooseAbsence = (worker: User, type: string, fromStr: string) => {
    setStatusTarget(null);
    setAbsRange({ from: new Date(`${fromStr}T00:00:00`), to: undefined });
    setPendingAbsence({ worker, type, fromStr });
  };

  const confirmAbsence = async () => {
    if (!user?.company_id || !pendingAbsence) return;
    const { worker, type } = pendingAbsence;
    const fromD = absRange?.from ?? new Date(`${pendingAbsence.fromStr}T00:00:00`);
    const fromStr = format(fromD, 'yyyy-MM-dd');
    const endStr = absRange?.to ? format(absRange.to, 'yyyy-MM-dd') : format(addDays(fromD, HORIZON_DAYS), 'yyyy-MM-dd');
    if (endStr < fromStr) { toast.error('La date de fin est avant le début'); return; }
    setAbsSaving(true);
    try {
      // Même geste que l'Assistant BEMEXO : lib/planning-writes.ts.
      await setAbsence({ companyId: user.company_id, createdBy: user.id, userId: worker.id, type, from: fromStr, to: endStr });

      toast.success(absRange?.to ? "Absence enregistrée jusqu'à la date de fin" : 'Absence enregistrée (jusqu\'au retour « Présent »)');
      setPendingAbsence(null);
      refresh();
    } catch (err) {
      console.error('Error saving absence:', err);
      toast.error("Impossible d'enregistrer l'absence : rien n'a été changé");
    } finally {
      setAbsSaving(false);
    }
  };

  // Rappel « heures manquantes » : vraie notification push sur le téléphone du
  // salarié (avant, ça n'ouvrait qu'un brouillon mailto sur le poste de l'admin —
  // rien n'était réellement envoyé si l'admin ne cliquait pas « Envoyer »).
  // Repli mailto conservé si le salarié n'a activé le push sur aucun appareil.
  /**
   * Nommer quelqu'un au bureau, ou l'en retirer.
   *
   * La base tient l'invariant : une entreprise garde toujours au moins un
   * administrateur ACTIF. On ne le revérifie pas ici pour « faire joli » — on
   * affiche le message que le serveur renvoie, parce que c'est lui qui sait,
   * y compris quand deux personnes cliquent en même temps.
   */
  const changeRole = async (target: User, role: 'admin' | 'lead' | 'worker') => {
    const label = `${target.first_name || ''} ${target.last_name || ''}`.trim() || 'cette personne';
    if (typeof window !== 'undefined') {
      const q = role === 'admin'
        ? `Donner à ${label} l'accès complet au bureau ? Cette personne pourra voir les taux horaires, sortir la paie et modifier les réglages.`
        : role === 'lead'
        ? `Faire de ${label} un chef d'équipe ? Il pourra saisir et corriger les heures de tous les salariés de l'entreprise sur les 7 derniers jours (jamais une journée validée ou clôturée), envoyées au bureau et marquées « par le chef d'équipe ». Le salarié peut encore corriger tant que ce n'est pas validé. Il ne verra ni les taux horaires, ni le coût des chantiers, ni la paie, ni les réglages.`
        : `Repasser ${label} en simple salarié ? Il ne verra plus que ses propres heures.`;
      if (!window.confirm(q)) return;
    }
    setRoleBusyId(target.id);
    try {
      await setUserRole(target.id, role);
      toast.success(
        role === 'admin' ? `${label} a rejoint le bureau`
        : role === 'lead' ? `${label} est chef d'équipe`
        : `${label} est redevenu salarié`
      );
      await fetchData();
      // Se retirer soi-même du bureau change ce que l'on a le droit de voir :
      // laisser l'écran d'administration ouvert montrerait des boutons qui ne
      // marchent plus. On recharge pour repartir sur la bonne interface.
      if (role === 'worker' && target.id === user?.id && typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch (e) {
      toast.error((e as { message?: string })?.message || 'Changement de rôle impossible.');
    } finally {
      setRoleBusyId(null);
    }
  };

  // Lot 11 : renvoie vrai quand le rappel est parti (notification, ou e-mail
  // préparé) — la ligne « À relancer » affiche alors « ✓ relancé ».
  const sendReminder = async (worker: User): Promise<boolean> => {
    const missing = [...(missingEffective.get(worker.id) || [])].sort();
    const jours = missing.map((d) => format(parseISO(d), 'EEEE d MMMM', { locale: fr })).join(', ');
    setRemindingId(worker.id);
    const done = () => { setRemindedIds((prev) => new Set(prev).add(worker.id)); return true; };
    try {
      const sent = await sendHoursReminder(worker.id, jours);
      if (sent > 0) { toast.success(`Rappel envoyé à ${worker.first_name}`); return done(); }

      // Aucun appareil abonné → on retombe sur l'ancien comportement (mailto).
      if (!worker.email) { toast.error(`${worker.first_name} n'a pas activé les notifications`); return false; }
      const subject = encodeURIComponent('Rappel : pense à envoyer tes heures');
      const body = encodeURIComponent(
        `Bonjour ${worker.first_name},\n\n`
        + `Il manque l'envoi de tes heures pour : ${jours || 'des journées planifiées'}.\n`
        + `Merci de les saisir et de les envoyer dès que possible depuis l'application BEMEXO.\n\n`
        + `— ${companyName || "L'équipe"}`,
      );
      window.location.href = `mailto:${worker.email}?subject=${subject}&body=${body}`;
      toast.success(`${worker.first_name} n'a pas le push : e-mail préparé`);
      return done();
    } catch (err) {
      console.error('Error sending reminder:', err);
      toast.error("Impossible d'envoyer le rappel");
      return false;
    } finally {
      setRemindingId(null);
    }
  };

  // ─── team export (locks) ──────────────────────────────────────────────────────

  const runExport = async (kind: 'excel' | 'pdf' | 'csv' | 'comptable') => {
    if (!user?.company_id) { toast.error('Profil non chargé'); return; }
    setExporting(true);
    try {
      if (!exportRange) { toast.error('Choisissez une période'); return; }
      const from = format(exportRange.from, 'yyyy-MM-dd');
      const to = format(exportRange.to, 'yyyy-MM-dd');
      // Lecture PAGINÉE : au-delà du plafond PostgREST (1000 lignes par défaut),
      // une requête simple renverrait un jeu tronqué SANS erreur → export de paie
      // silencieusement incomplet. Et `select` réduit aux seuls champs utilisés :
      // `users(*)` embarquait le n° de sécurité sociale et le taux horaire de
      // chaque salarié, dupliqués sur chaque ligne et inutiles ici (RGPD).
      // Seules les heures ENVOYÉES partent en paie et sont verrouillées : un
      // brouillon ou une intervention retirée n'entre jamais dans l'export.
      // Les horaires de base sont relus MAINTENANT, pas au chargement de la
      // page : une lecture ratée doit arrêter l'export, pas le laisser
      // appliquer l'horaire de l'entreprise à tout le monde et annoncer des
      // heures supplémentaires fausses pour ceux qui ont une exception.
      //
      // Le matricule (payroll_id) vient d'une migration qui peut ne pas encore
      // être appliquée : PostgREST répond alors « colonne inconnue » et
      // ferait échouer TOUT l'export. On relit sans lui, et la colonne
      // Matricule du CSV reste vide. Une vraie erreur de lecture, elle, fait
      // toujours échouer la seconde tentative et arrête l'export.
      const avecMatricule = await supabase.from('user_payroll')
        .select('user_id, weekly_hours, payroll_id').eq('company_id', user.company_id);
      const { data: payroll, error: payErr } = avecMatricule.error
        ? await supabase.from('user_payroll').select('user_id, weekly_hours').eq('company_id', user.company_id)
        : avecMatricule;
      if (payErr) {
        toast.error("Horaires de base illisibles : export annulé plutôt que d'annoncer des heures supplémentaires fausses.");
        return;
      }
      const payRows = (payroll || []) as { user_id: string; weekly_hours: number | null; payroll_id?: string | null }[];
      const overrides = new Map(
        payRows.filter((r) => r.weekly_hours != null).map((r) => [r.user_id, r.weekly_hours as number]),
      );
      // Un matricule vide ne doit pas devenir la chaîne « null » dans le CSV.
      const payrollIdByWorker = new Map(
        payRows.filter((r) => (r.payroll_id || '').trim() !== '')
          .map((r) => [r.user_id, (r.payroll_id as string).trim()]),
      );

      // Semaines ENTIÈRES recouvrant la période, pour le récapitulatif seul :
      // une période commençant en milieu de semaine sous-estimerait les heures
      // supplémentaires si on ne comptait que les jours exportés.
      const recapEntries = await fetchAllPaged<TimeEntryWithWorksite & { user: User }>((f, t2) => supabase
        .from('time_entries')
        .select('id, user_id, work_date, start_time, end_time, total_minutes, status, gap_before, user:users!user_id(first_name, last_name)')
        .eq('company_id', user.company_id)
        .in('status', ['submitted', 'validated'])
        .gte('work_date', format(weekStartOf(exportRange.from), 'yyyy-MM-dd'))
        .lte('work_date', format(weekEndOf(exportRange.to), 'yyyy-MM-dd'))
        .order('work_date').order('user_id')
        .range(f, t2) as unknown as PromiseLike<{ data: (TimeEntryWithWorksite & { user: User })[] | null; error: { message: string } | null }>);

      // La table est construite sur les salariés PRÉSENTS dans la période, pas
      // sur la liste des actifs : un salarié archivé depuis garde ses heures
      // dans un export d'un mois passé, et doit garder son horaire de base.
      const weeklyHoursByWorker = new Map<string, number>(
        Array.from(new Set(recapEntries.map((e) => e.user_id)))
          .map((id) => [id, weeklyHoursFor(overrides.get(id) ?? null, companyWeeklyHours)]),
      );

      const entries = await fetchAllPaged<TimeEntryWithWorksite & { user: User }>((f, t2) => supabase
        .from('time_entries')
        .select('id, user_id, work_date, start_time, end_time, break_minutes, total_minutes, meal_allowance, status, observation, gap_before, worksite:worksites(client_name, city), user:users!user_id(first_name, last_name)')
        .eq('company_id', user.company_id)
        .in('status', ['submitted', 'validated'])
        .gte('work_date', from).lte('work_date', to)
        .order('work_date', { ascending: false }).order('user_id')
        .range(f, t2) as unknown as PromiseLike<{ data: (TimeEntryWithWorksite & { user: User })[] | null; error: { message: string } | null }>);
      if (entries.length === 0) { toast.error(`Aucune saisie du ${format(exportRange.from, 'dd/MM')} au ${format(exportRange.to, 'dd/MM')}`); return; }

      const opts = {
        fileName: `bemexo-${kind === 'pdf' ? 'rapport' : kind === 'csv' ? 'paie' : 'export'}-${from}`,
        title: 'BEMEXO - Rapport hebdomadaire',
        periodLabel: `${format(exportRange.from, 'dd/MM/yyyy')} au ${format(exportRange.to, 'dd/MM/yyyy')}`,
        companyName,
        travelPaid,
        weeklyHoursByWorker,
        recapEntries,
        overtimeRates,
        payrollIdByWorker,
      };
      // Message final : dépend de ce que le serveur répond (envoyé / déjà parti).
      let sentNote = '';
      if (kind === 'comptable') {
        // Le fichier part en pièce jointe, pas en lien : le comptable ne doit
        // rien avoir à ouvrir ni à installer. Le destinataire n'est pas
        // transmis — la fonction le relit dans les réglages de l'entreprise.
        //
        // La clé d'idempotence est l'empreinte du fichier RÉELLEMENT expédié :
        // recliquer après une coupure renvoie la même clé, donc le serveur
        // reconnaît l'envoi au lieu d'en faire un second. Un export refait
        // après correction des heures donne une autre clé, et part bien.
        const content = excelAsBase64(entries, opts);
        const idempotencyKey = await sendKey(user.company_id, from, to, content);
        const { data: sendData, error: sendErr } = await supabase.functions.invoke('send-payroll-export', {
          body: {
            fileName: `${opts.fileName}.xlsx`,
            contentBase64: content,
            periodLabel: opts.periodLabel,
            idempotencyKey,
          },
        });
        if (sendErr) {
          // Le message utile est dans le corps de la réponse, pas dans
          // `sendErr.message` qui dit seulement « non-2xx ».
          let detail = '';
          try {
            const ctx = (sendErr as { context?: Response }).context;
            if (ctx && typeof ctx.json === 'function') {
              const body = await ctx.json();
              detail = typeof body?.error === 'string' ? body.error : '';
            }
          } catch { /* corps illisible : on garde le message générique */ }
          toast.error(detail || "L'envoi au comptable a échoué. Les heures restent modifiables. Recliquez : si l'e-mail était déjà parti, il ne partira pas deux fois.");
          // Pas d'envoi confirmé, donc pas de verrouillage : sans ça le bureau
          // croirait la paie partie et ne pourrait plus rien corriger.
          return;
        }
        const r = (sendData || {}) as { duplicate?: boolean; alreadySentAt?: string | null; previousSendAt?: string | null };
        if (r.duplicate) {
          // Le fichier était déjà parti — la fois d'avant, la réponse s'était
          // perdue. On ne renvoie pas, et on verrouille ce qui aurait dû l'être.
          sentNote = r.alreadySentAt
            ? `Déjà envoyé le ${format(new Date(r.alreadySentAt), 'dd/MM \'à\' HH:mm')} — non renvoyé`
            : 'Déjà envoyé — non renvoyé';
        } else if (r.previousSendAt) {
          sentNote = `Envoyé à ${accountantEmail} — attention, un export de cette période était déjà parti le ${format(new Date(r.previousSendAt), 'dd/MM \'à\' HH:mm')}`;
        } else {
          sentNote = `Envoyé à ${accountantEmail}`;
        }
      } else if (kind === 'excel') {
        exportEntriesToExcel(entries, opts);
      } else if (kind === 'csv') {
        // Le CSV se construit sur les SEMAINES ENTIÈRES (recapEntries), pas sur
        // les jours de la période : sans ça, une période qui commence un jeudi
        // ferait passer pour normales des heures déjà supplémentaires.
        // Sans récapitulatif, il n'y a rien à importer — et un fichier à
        // en-têtes seuls, le comptable l'importerait sans rien voir.
        if (recapEntries.length === 0) {
          toast.error('Aucune heure envoyée sur ces semaines : rien à importer en paie.');
          return;
        }
        // `payPeriod` borne ce qui est PAYÉ aux jours choisis, alors que la
        // semaine entière continue de servir à classer les heures. Sans ça, le
        // CSV de septembre paierait le lundi 31/08 — que l'export d'août
        // paierait une seconde fois, et que le verrou ci-dessous ne couvre pas
        // puisqu'il ne porte que sur la période. Trouvé par Codex sur la PR 104.
        exportEntriesToCSV({ ...opts, payPeriod: { from, to } });
      } else {
        exportEntriesToPDF(entries, opts);
      }

      // Verrouillage PAR LOTS : un `.in('id', [...])` avec des centaines d'UUID
      // dépasse la longueur d'URL admise par la passerelle et échoue. L'erreur
      // n'était pas vérifiée : le mois s'affichait « clôturé » alors que rien
      // n'était verrouillé. On découpe, et on remonte toute erreur.
      const stamp = new Date().toISOString();
      for (const ids of chunk(entries.map((e) => e.id), 200)) {
        const { error: lockErr } = await supabase.from('time_entries')
          .update({ exported_at: stamp, locked: true })
          .in('id', ids).eq('company_id', user.company_id);
        if (lockErr) throw lockErr;
      }

      const lockLabel = `${entries.length} saisie${entries.length > 1 ? 's' : ''} verrouillée${entries.length > 1 ? 's' : ''}`;
      toast.success(kind === 'comptable'
        ? `${sentNote} — ${lockLabel}`
        : kind === 'csv'
          ? `CSV de paie téléchargé — ${lockLabel}`
          : `Export téléchargé — ${lockLabel}`);
    } catch (err) {
      console.error('Error exporting team:', err);
      toast.error("Erreur lors de l'export");
    } finally {
      setExporting(false);
    }
  };

  // ─── invitations ──────────────────────────────────────────────────────────────

  // Envoi, renvoi et suppression : components/pending-invitations.tsx.

  // ─── affectation popup (this day only) ──────────────────────────────────────

  const openEdit = (p: PlanningWithWorksite) => {
    setEditing(p);
    setEditStart(p.estimated_start ? p.estimated_start.slice(0, 5) : '');
    setEditEnd(p.estimated_start && p.estimated_end ? p.estimated_end.slice(0, 5) : '');
    setEditNote(p.notes || '');
  };

  const closeEdit = () => { setEditing(null); };

  const openClientFiche = (ws: Worksite | null | undefined) => {
    if (!ws) return;
    setWsName(ws.client_name || '');
    setWsEmail(ws.client_email || '');
    setWsProduct(ws.product_type || '');
    setWsPhone(ws.client_phone || '');
    setWsCity(ws.city || '');
    setWsAddress(ws.address || '');
    setWsDesc(ws.description || '');
    setWsBudgetH(ws.budget_hours != null ? String(ws.budget_hours) : '');
    setWsBudgetE(ws.budget_amount != null ? String(ws.budget_amount) : '');
    setEditing(null);
    setClientFiche(ws);
  };

  const saveAffectation = async () => {
    if (!user?.company_id || !editing) return;
    const timeErr = editTimeBad ? `Heure non comprise. ${TIME_HINT}` : scheduleError(editStart, editEnd);
    if (timeErr) { toast.error(timeErr); return; }
    setSavingEdit(true);
    try {
      await updatePlanningSlot(user.company_id, editing.id, { estimatedStart: editStart || null, estimatedEnd: editEnd || null, notes: editNote });
      toast.success('Enregistré');
      closeEdit();
      refresh();
    } catch (err) {
      console.error('Error saving affectation:', err);
      toast.error("Impossible d'enregistrer");
    } finally {
      setSavingEdit(false);
    }
  };

  // Lot 11 : « Supprimer » (une seule intervention) = même chemin que « Supprimer (N) » :
  // la ligne est lue en entier avant d'être effacée, et la carte « Annuler » la
  // remet à l'identique. Plus d'effacement immédiat et définitif.
  const deleteAffectation = async () => {
    if (!user?.company_id || !editing) return;
    const why = hardLock(editing);
    if (why) { toast.error(why); return; }
    const id = editing.id;
    setDeletingEdit(true);
    try {
      const r = await erasePlanning(user.company_id, { ids: [id] });
      if (!r.deleted.length) { toast.error(`Impossible de supprimer${r.reason ? ` : ${r.reason}` : ''}.`); return; }
      setPlanning((ps) => ps.filter((p) => p.id !== id));
      closeEdit();
      showUndo(r);
      refresh();
    } catch (err) {
      console.error('Error deleting affectation:', err);
      toast.error('Impossible de supprimer pour le moment. Rien n’a été effacé.');
    } finally {
      setDeletingEdit(false);
    }
  };

  // ─── client fiche (permanent) ───────────────────────────────────────────────

  const saveClientFiche = async () => {
    if (!user?.company_id || !clientFiche) return;
    if (!wsName.trim()) { toast.error('Le nom du client est requis'); return; }
    // Budgets facultatifs : vide = pas de suivi. Virgule acceptée (saisie FR).
    const parseBudget = (v: string): number | null | 'invalid' => {
      const t = v.trim();
      if (!t) return null;
      const n = Number(t.replace(',', '.'));
      return isNaN(n) || n < 0 ? 'invalid' : n;
    };
    const bH = parseBudget(wsBudgetH);
    const bE = parseBudget(wsBudgetE);
    if (bH === 'invalid' || bE === 'invalid') { toast.error('Budget invalide'); return; }
    setSavingWs(true);
    try {
      // lib/admin-writes.ts (même chemin que l'Assistant BEMEXO ; ville vide = '' car NOT NULL).
      await updateWorksite(user.company_id, clientFiche.id, {
        client_name: wsName, product_type: wsProduct, client_phone: wsPhone, client_email: wsEmail,
        city: wsCity, address: wsAddress, description: wsDesc, budget_hours: bH, budget_amount: bE,
      });
      toast.success('Fiche client enregistrée');
      fetchData();
      fetchPlanning();
    } catch (err) {
      console.error('Error saving client:', err);
      toast.error("Impossible d'enregistrer la fiche client");
    } finally {
      setSavingWs(false);
    }
  };

  const archiveClientFiche = async () => {
    if (!user?.company_id || !clientFiche) return;
    setWsBusy(true);
    try {
      await setWorksiteActive(user.company_id, clientFiche.id, false);
      toast.success('Client archivé');
      setClientFiche(null);
      fetchData();
      fetchPlanning();
    } catch (err) {
      console.error('Error archiving client:', err);
      toast.error("Impossible d'archiver");
    } finally {
      setWsBusy(false);
    }
  };

  const deleteClientFiche = async () => {
    if (!user?.company_id || !clientFiche) return;
    const worksiteId = clientFiche.id;
    setWsBusy(true);
    try {
      const [{ count: entryCount, error: e1 }, { count: planCount, error: e2 }] = await Promise.all([
        supabase.from('time_entries').select('*', { count: 'exact', head: true }).eq('worksite_id', worksiteId),
        supabase.from('planning').select('*', { count: 'exact', head: true }).eq('worksite_id', worksiteId),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if ((entryCount || 0) > 0 || (planCount || 0) > 0) {
        toast.error('Client utilisé dans le planning. Archivez-le plutôt.');
        return;
      }
      const { error } = await supabase.from('worksites').delete().eq('id', worksiteId).eq('company_id', user.company_id);
      if (error) throw error;
      toast.success('Client supprimé');
      setClientFiche(null);
      fetchData();
      fetchPlanning();
    } catch (err) {
      console.error('Error deleting client:', err);
      toast.error('Impossible de supprimer le client');
    } finally {
      setWsBusy(false);
    }
  };

  // ─── create client / worker ─────────────────────────────────────────────────

  const resetClient = () => { setCName(''); setCProduct(''); setCPhone(''); setCEmail(''); setCCity(''); setCAddress(''); setCDesc(''); };

  const createClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.company_id) return;
    if (!cName.trim()) { toast.error('Le nom du client est requis'); return; }
    setCSaving(true);
    try {
      const data = await createWorksite(user.company_id, {
        client_name: cName, product_type: cProduct, client_phone: cPhone, client_email: cEmail,
        city: cCity, address: cAddress, description: cDesc,
      });
      setClientOpen(false);
      resetClient();
      await fetchData();
      if (attributeTarget && data?.id) {
        await attributeClient(data.id);
      } else {
        toast.success('Client créé — glissez-le sur le planning');
        if (data?.id) setPaletteWorksiteId(data.id);
      }
    } catch (err) {
      console.error('Error creating client:', err);
      toast.error('Impossible de créer le client');
    } finally {
      setCSaving(false);
    }
  };

  const resetWorker = () => { setWFirst(''); setWLast(''); setWEmail(''); setWPhone(''); };

  const createWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.company_id) return;
    setWSaving(true);
    try {
      await inviteWorker({ companyId: user.company_id, email: wEmail, firstName: wFirst, lastName: wLast, phone: wPhone });
      toast.success('Invitation envoyée');
      setWorkerOpen(false);
      resetWorker();
      fetchData();
      fetchExtras();
    } catch (err) {
      console.error('Error inviting worker:', err);
      toast.error("Impossible d'envoyer l'invitation");
    } finally {
      setWSaving(false);
    }
  };

  // ─── derived ──────────────────────────────────────────────────────────────────

  const weekDays = buildWeekDays(currentWeekStart);
  const displayWorkers = demoWorkers.length ? [...workers, ...demoWorkers] : workers;
  const thisWeekStart = weekStart();
  const isCurrentWeek = format(currentWeekStart, 'yyyy-MM-dd') === format(thisWeekStart, 'yyyy-MM-dd');
  const dayShort = (d: Date) => format(d, 'EEE', { locale: fr }).replace('.', '');
  const dayFull = (d: Date) => { const s = format(d, 'EEEE', { locale: fr }); return s.charAt(0).toUpperCase() + s.slice(1); };
  // Nom + initiales de l'entreprise connectée (bouton compte).
  const companyLabel = companyName || `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'Mon compte';
  const companyInitials = (companyLabel.replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/).map((w) => w[0]).join('') || 'BT').slice(0, 2).toUpperCase();

  const absenceForDay = (workerId: string, dateStr: string) =>
    planning.find(p => p.user_id === workerId && p.work_date === dateStr && p.absence_type);

  // Une invitation reste « en attente » tant que l'invité ne s'est pas connecté
  // (accepted_at est posé par la base à sa première connexion). Le compte, lui,
  // existe dès l'invitation : filtrer sur la liste des salariés cachait tout.
  const pendingInvites = invitations;
  // Recherche en direct (panneaux Clients et Salariés).
  const cq = clientsQuery.trim().toLowerCase();
  const filteredClients = cq ? worksites.filter((w) => w.client_name.toLowerCase().includes(cq)) : worksites;
  const sq = salariesQuery.trim().toLowerCase();
  const filteredWorkers = sq ? workers.filter((w) => `${w.first_name} ${w.last_name}`.toLowerCase().includes(sq)) : workers;

  const editRealAgg = editing ? realForPlanning(editing) : undefined;

  /** Lot 11 : les lignes « À relancer » (panneau du cockpit ET fenêtre mobile). */
  const renderRelanceRows = (onOpen: () => void) => (
    waitingByWorker.length === 0 ? (
      <div className="bt-pl-sp-empty">Tout le monde est à jour.</div>
    ) : waitingByWorker.map((r) => {
      const w = workers.find((x) => x.id === r.id);
      return (
        <div key={r.id} className="bt-pl-sp-row" data-testid="relance-row">
          <button type="button" className="bt-pl-sp-who" title="Ouvrir sa fiche"
            onClick={() => { if (!w) return; onOpen(); setFicheMode('manage'); setFicheWorker(w); }}>
            <span className="nm">{r.name}
              <span className="sub">{r.days.map((d) => format(parseISO(d), 'EEE d', { locale: fr })).join(' · ')}</span>
            </span>
          </button>
          <span className="amt warn">{r.days.length} j</span>
          {remindedIds.has(r.id) ? (
            <span className="bt-pl-sp-done" data-testid="relance-done">✓ relancé</span>
          ) : (
            <button type="button" className="bt-pl-sp-act" data-testid="relance-btn" disabled={!w || remindingId === r.id}
              title={`Envoyer un rappel à ${r.name}`} onClick={() => { if (w) sendReminder(w); }}>
              {remindingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />} Relancer
            </button>
          )}
        </div>
      );
    })
  );

  if (loading) {
    // Chargement brandé (PL_CSS pas encore injecté ici → styles inline ;
    // .bt-spin vient d'ADMIN_CSS, déjà présent sur la page).
    return (
      <div style={{ flex: '1 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: 16, minHeight: 420 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="bt-spin" />
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#6E6A63', fontWeight: 700 }}>Chargement du planning…</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bt-pl${selectMode ? ' bt-pl--select' : ''}${undoCard ? ' bt-pl--undo' : ''}${copying ? ' bt-pl--copying' : ''}`}>
      <style dangerouslySetInnerHTML={PL_STYLE} />

      <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragEnd={(e) => { handleDragEnd(e); setChantierMenuOpen(false); }} onDragCancel={() => { setCopy(false); setActiveDrag(null); setChantierMenuOpen(false); }}>
        {/* Barre UNIQUE pleine largeur, figée (sticky) — tout aligné sur une ligne */}
        {/* COCKPIT : tableau de bord sombre. Lot 10 : rangé de gauche à droite —
            logo · chiffres (au centre) · essai + entreprise. Mêmes informations. */}
        <div className="bt-pl-cockpit">
          <span className="bt-pl-logo">BEME<span className="x">X</span>O</span>
          {/* Lot 11 : DEUX indicateurs seulement — 🟠 « À relancer » et 📎 « Pièces ».
              Un clic ouvre la liste qui compose le chiffre. Chaque chiffre vit dans
              un .bt-pl-statwrap et le panneau est son FRÈRE, pas son enfant : un
              <button> dans un <button> est du HTML invalide.
              (Lot 11, item 8 : plus de compteur « en direct » — la case verte et
              « en cours depuis » restent, nourries par le seul vrai pointage.) */}
          <div className="bt-pl-stats">
            <div className="bt-pl-statwrap">
              <button className={`bt-pl-stat${cockpitStats.waiting > 0 ? ' warn' : ''}`} aria-expanded={statPanel === 'waiting'} data-testid="stat-waiting"
                title={cockpitStats.waiting === 0 ? `Tout est envoyé en ${monthLabel}` : `${cockpitStats.waiting} ${plural(cockpitStats.waiting, 'journée planifiée non envoyée', 'journées planifiées non envoyées')} en ${monthLabel} — cliquez pour savoir qui`}
                onClick={() => setStatPanel((p) => (p === 'waiting' ? null : 'waiting'))}>
                <span className="sd" style={{ background: cockpitStats.waiting > 0 ? '#E0A21C' : '#4a453d' }} /><span className="v">{fmtStat(cockpitStats.waiting)} j</span><span className="l">à relancer</span><span className="ch">▾</span>
              </button>
              {statPanel === 'waiting' && (
                <div className="bt-pl-sp" data-testid="relance-panel">
                  <div className="bt-pl-sp-h">À relancer · {monthLabel} <span className="n">{cockpitStats.waiting} j</span></div>
                  <div className="bt-pl-sp-list">{renderRelanceRows(() => setStatPanel(null))}</div>
                  <div className="bt-pl-sp-foot">Journées planifiées sans heures envoyées (ce mois-ci et le mois dernier, sauf mois clôturé).</div>
                </div>
              )}
            </div>

            <div className="bt-pl-statwrap">
              <button className="bt-pl-stat" aria-expanded={statPanel === 'docs'} data-testid="stat-docs"
                title={`${cockpitStats.docs} pièce(s) jointe(s) — cliquez pour voir lesquelles, et sur quel chantier`}
                onClick={() => setStatPanel((p) => (p === 'docs' ? null : 'docs'))}>
                <Paperclip className="h-3.5 w-3.5" style={{ opacity: 0.75 }} /><span className="v">{fmtStat(cockpitStats.docs)}</span><span className="l">pièces</span><span className="ch">▾</span>
              </button>
              {statPanel === 'docs' && (
                <div className="bt-pl-sp">
                  <div className="bt-pl-sp-h">Pièces jointes <span className="n">{cockpitStats.docs}</span></div>
                  <div className="bt-pl-sp-list">
                    {docListState === 'loading' ? (
                      <div className="bt-pl-sp-empty">Lecture…</div>
                    ) : docListState === 'ko' ? (
                      <div className="bt-pl-sp-empty">La liste n&apos;a pas pu être lue.<br />Refermez et rouvrez pour réessayer.</div>
                    ) : docsByChantier.length === 0 ? (
                      <div className="bt-pl-sp-empty">Aucune pièce jointe.<br />Photos et documents se déposent depuis le chantier.</div>
                    ) : docsByChantier.map((g) => (
                      <Fragment key={g.id || 'sans'}>
                        <button className="bt-pl-sp-grp"
                          title={g.id ? 'Ouvrir les documents de ce chantier' : 'Chantier inconnu'}
                          disabled={!worksites.some((w) => w.id === g.id)}
                          onClick={() => {
                            const ws = worksites.find((w) => w.id === g.id);
                            if (!ws) return;
                            setStatPanel(null);
                            setDocsWorksite({ ws, day: null });
                          }}>
                          <Building2 className="h-3 w-3" style={{ opacity: 0.6, flex: 'none' }} />
                          <span className="nm">{g.name}</span>
                          <span className="amt">{g.docs.length}</span>
                        </button>
                        {g.docs.map((d) => (
                          <div key={d.id} className="bt-pl-sp-doc">
                            {(d.mime_type || '').startsWith('image/')
                              ? <ImageIcon className="h-3.5 w-3.5" style={{ opacity: 0.55, flex: 'none' }} />
                              : <FileText className="h-3.5 w-3.5" style={{ opacity: 0.55, flex: 'none' }} />}
                            <span className="nm">{d.label || d.file_name || 'Document'}</span>
                            <span className="dt">{format(parseISO((d.work_date || d.created_at).slice(0, 10)), 'dd/MM')}</span>
                          </div>
                        ))}
                      </Fragment>
                    ))}
                  </div>
                  {docsByChantier.length > 0 && <div className="bt-pl-sp-foot">Cliquez un chantier pour ouvrir ses pièces.</div>}
                </div>
              )}
            </div>

            {statPanel && <div className="bt-pl-ddbackdrop" onClick={() => setStatPanel(null)} />}
          </div>
          <div className="bt-pl-cockpit-right">
            {trial?.inTrial && !trial.expired && trial.daysLeft !== null && (
              <div className="bt-pl-trial"><span className="d" /> Essai · <b>{trial.daysLeft} j</b> <button className="cta" onClick={onSubscribe}>S&apos;abonner</button></div>
            )}
            {trial?.inTrial && trial.expired && (
              <div className="bt-pl-trial expired"><span className="d" /> Essai terminé <button className="cta" onClick={onSubscribe}>S&apos;abonner</button></div>
            )}
          <div className="bt-pl-acctwrap">
              <button className="bt-pl-acct" onClick={() => setAccountMenuOpen((o) => !o)} title="Compte entreprise">
                <span className="bt-pl-acct-av">
                  {companyLogo ? <img className="bt-pl-acct-av-img" src={companyLogo} alt="" /> : companyInitials}
                </span>
                <span className="bt-pl-acct-name">{companyLabel}</span>
                <span className="bt-pl-acct-car">▾</span>
              </button>
              {accountMenuOpen && (
                <>
                  <div className="bt-pl-ddbackdrop" onClick={() => setAccountMenuOpen(false)} />
                  <div className="bt-pl-acctmenu">
                    <div className="bt-pl-acctmenu-h">
                      <div className="bt-pl-acctmenu-co">{companyLabel}</div>
                      <div className="bt-pl-acctmenu-u">{user?.first_name} {user?.last_name}</div>
                    </div>
                    <button className="bt-pl-acct-item" onClick={() => { setAccountMenuOpen(false); setSettingsOpen(true); }}>
                      <Settings className="h-4 w-4" /> Réglages de l&apos;entreprise
                    </button>
                    <button className="bt-pl-acct-item danger" onClick={() => { setAccountMenuOpen(false); signOut(); }}>
                      <LogOut className="h-4 w-4" /> Déconnexion
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="bt-pl-bar">
          <div className="bt-pl-group">
          <div className="bt-pl-ddwrap">
            <button className="bt-pl-datearr" onClick={() => setLegendOpen((o) => !o)} title="Légende des icônes" aria-label="Légende des icônes"><Info className="h-4 w-4" /></button>
            {legendOpen && (
              <>
                <div className="bt-pl-ddbackdrop" onClick={() => setLegendOpen(false)} />
                <div className="bt-pl-dd bt-pl-dd--start">
                  <div className="bt-pl-dd-h">Légende des bulles</div>
                  <div className="bt-pl-legrow"><span className="bt-pl-check">✓</span> Heures déclarées par le salarié</div>
                  <div className="bt-pl-legrow"><span className="bt-pl-legic" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 800, color: '#8a8378' }}>⋯</span> Saisi, pas encore envoyé — ne compte pas</div>
                  <div className="bt-pl-legrow"><span className="bt-pl-legic" style={{ color: '#1F7A4D' }}><CheckCircle2 className="h-3.5 w-3.5" /></span> Réceptionné sans réserve</div>
                  <div className="bt-pl-legrow"><span className="bt-pl-legic" style={{ color: '#C0461F' }}><AlertTriangle className="h-3.5 w-3.5" /></span> Réception avec réserve</div>
                  <div className="bt-pl-legrow"><span className="bt-pl-legic" style={{ color: '#C98A12' }}><Hammer className="h-3.5 w-3.5" /></span> Chantier en cours</div>
                  <div className="bt-pl-legrow"><span className="bt-pl-legic" style={{ color: '#caa01a' }}><UserIcon className="h-3.5 w-3.5" /></span> Intervention ajoutée par le salarié</div>
                  <div className="bt-pl-legrow"><span className="bt-pl-legic"><Paperclip className="h-3.5 w-3.5" /></span> Documents du chantier</div>
                  <div className="bt-pl-legrow"><span className="bt-pl-legic"><span className="bt-pl-live-dot" /></span> En cours (pointage en direct)</div>
                </div>
              </>
            )}
          </div>
          <div className="bt-pl-ddwrap">
            <div className="bt-pl-seg">
              <button className="bt-pl-segbtn" onClick={() => setSalariesOpen(true)}>
                <Users className="h-3.5 w-3.5" /> Salariés
                {pendingLeaves > 0 && <span className="bt-pl-badge" title={`${pendingLeaves} demande(s) de congé en attente`}>{pendingLeaves}</span>}
              </button>
              <span className="bt-pl-segdiv" aria-hidden="true" />
              <button className="bt-pl-segbtn" onClick={() => { setChantierMenuOpen((o) => !o); setClientsQuery(''); }}><Building2 className="h-3.5 w-3.5" /> Clients</button>
              <span className="bt-pl-segdiv" aria-hidden="true" />
              {/* Lot 11 : cocher des interventions une par une (ou « Tout sélectionner »),
                  puis « Supprimer (N) » — « Annuler » remet tout. */}
              <button className="bt-pl-segbtn" aria-pressed={selectMode} data-testid="bar-select"
                title={selectMode ? 'Terminer la sélection' : 'Cocher des interventions pour les supprimer'}
                onClick={() => (selectMode ? exitSelect() : enterSelect())}>
                <CheckSquare className="h-3.5 w-3.5" /> Sélectionner
              </button>
            </div>
            {chantierMenuOpen && (
              <>
                <div className="bt-pl-ddbackdrop" onClick={() => setChantierMenuOpen(false)} />
                <div className="bt-pl-dd bt-pl-dd--start">
                  <div className="bt-pl-dd-search">
                    <input className="bt-pl-dd-input" placeholder="Rechercher un client…" value={clientsQuery} onChange={(e) => setClientsQuery(e.target.value)} autoFocus />
                  </div>
                  <div className="bt-pl-dd-h">Glissez un client sur le planning ↘</div>
                  <div className="bt-pl-dd-list">
                    {filteredClients.length === 0 ? (
                      <div className="bt-pl-dd-empty">Aucun client</div>
                    ) : filteredClients.map((ws) => (
                      <div key={ws.id} className="bt-pl-clientrow">
                        <PaletteRow worksite={ws} color={colorForWorksite(ws.id).bar} />
                        <button className="bt-pl-clientedit" title="Modifier la fiche" onClick={() => { setChantierMenuOpen(false); openClientFiche(ws); }}><Pencil className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                  </div>
                  <button className="bt-pl-ddcreate" onClick={() => { setChantierMenuOpen(false); setClientOpen(true); }}>
                    <span className="bt-pl-ddcreate-ico">＋</span> Nouveau client
                  </button>
                  <button className="bt-pl-ddcreate" onClick={() => { setChantierMenuOpen(false); setImportOpen(true); }}>
                    <span className="bt-pl-ddcreate-ico"><FileSpreadsheet className="h-3.5 w-3.5" /></span> Importer (CSV/Excel)
                  </button>
                </div>
              </>
            )}
          </div>
          </div>
          <div className="bt-pl-datenav">
            <button className="bt-pl-datearr" aria-label="Semaine précédente" onClick={() => changeWeek(subWeeks(currentWeekStart, 1))}>‹</button>
            <button
              className="bt-pl-datebox"
              onClick={() => changeWeek(thisWeekStart)}
              title={isCurrentWeek ? undefined : 'Revenir à la semaine actuelle'}
            >
              <span className="bt-pl-datebox-wk">S-{getISOWeek(currentWeekStart)}</span>
              <span className={`bt-pl-datebox-dot ${isCurrentWeek ? 'is-now' : 'is-away'}`} />
              <span className="bt-pl-datebox-rg">{format(currentWeekStart, 'd', { locale: fr })}–{format(addDays(currentWeekStart, DAYS_IN_WEEK - 1), 'd MMM', { locale: fr })}</span>
            </button>
            <button className="bt-pl-datearr" aria-label="Semaine suivante" onClick={() => changeWeek(addWeeks(currentWeekStart, 1))}>›</button>
          </div>
          <div className="bt-pl-group">
          {/* Lot 6 : l'assistant est ICI, dans la barre — plus de bouton flottant sur le planning. */}
          {aiOn && user?.role === 'admin' && (
            <button className="bt-pl-out bt-pl-ai" onClick={() => setAssistantOpen(true)} title="Assistant BEMEXO" aria-label="Assistant BEMEXO" data-testid="bar-assistant">
              <Sparkles className="h-4 w-4" />
            </button>
          )}
          <button className="bt-pl-out" onClick={() => setReservesOpen(true)} title="Réserves de chantier à traiter">
            <AlertTriangle className="h-4 w-4" /> Réserves
            {openReserves > 0 && <span className="bt-pl-outbadge">{openReserves}</span>}
          </button>
          {kioskOn && user?.company_id && (
            <button className="bt-pl-out" onClick={() => setKioskOpen(true)} title="Tablette de pointage : code pour la relier, état" data-testid="bar-kiosk">
              <span aria-hidden="true">📟</span> Borne
            </button>
          )}
          {/* « Coût chantiers » (« Coûts » sous 1280 px) : les heures par chantier y sont. */}
          <button className="bt-pl-out" onClick={() => setCostOpen(true)} title="Heures et coût par chantier" data-testid="bar-cost"><TrendingUp className="h-4 w-4" /> <span className="bt-pl-lbl-long">Coût chantiers</span><span className="bt-pl-lbl-short">Coûts</span></button>
          {/* Lot 11 : « Exporter » ouvre directement l'export de l'équipe (un seul
              menu « Exporter ▾ » ensuite : PDF, Excel, CSV). Un seul salarié : lien
              discret dans la fenêtre. */}
          <button className="bt-pl-fill" onClick={() => setExportOpen(true)} data-testid="bar-export"><Download className="h-4 w-4" /> Exporter</button>
          </div>
        </div>

        {/* Invitations en attente (sous la barre) : UNE ligne repliée, le planning
            reste visible dès l'arrivée (components/pending-invitations.tsx). */}
        {user?.company_id && (
          <div className="bt-pl-inv-desk">
            <PendingInvitations
              companyId={user.company_id}
              invitations={pendingInvites}
              onChanged={() => { fetchData(); fetchExtras(); }}
            />
          </div>
        )}

        {/* GRILLE — desktop (glisser-déposer) */}
        <div className="bt-pl-gridwrap" ref={gridRef}>
          <table className="bt-pl-table">
            <thead ref={theadRef}>
              <tr>
                <th className="bt-pl-th-name">
                  <span className="bt-pl-corner-wk">S-{getISOWeek(currentWeekStart)}</span>
                  <span className="bt-pl-corner-sal">Salarié</span>
                </th>
                {weekDays.map(day => {
                  const isToday = format(day, 'yyyy-MM-dd') === todayStr;
                  const dStr = format(day, 'yyyy-MM-dd');
                  return (
                    <th key={day.toISOString()} className={`bt-pl-th ${isToday ? 'today' : ''}`}
                      onClick={selectMode ? () => toggleGroup(selectableIn((p) => p.work_date === dStr && displayWorkers.some((w) => w.id === p.user_id))) : undefined}
                      title={selectMode ? 'Cocher toute cette journée' : undefined}
                      data-testid={selectMode ? 'sel-day' : undefined}>
                      <div className="bt-pl-th-cell">
                        <span className="bt-pl-th-day">{dayFull(day)}</span>
                        <span className="bt-pl-th-num">{format(day, 'd')}</span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
                <tbody ref={realBodyRef}>
                  {/* 0 salarié : AUCUNE ligne ici — les lignes fantômes dessinent un
                      quadrillage uniforme (fini la bande colSpan qui coupait la colonne
                      sticky et recevait la bordure noire de fin) ; le coach .bt-pl-coach
                      guide en bas à droite, sans jamais bloquer la grille. */}
                  {displayWorkers.map(worker => {
                      const absToday = todayAbsence.get(worker.id);
                      const missCount = (missingEffective.get(worker.id) || []).length;
                      const isLate = missCount > 0;
                      const fullName = `${worker.first_name} ${worker.last_name}`;
                      return (
                        <tr key={worker.id}>
                          {/* Cellule nom : avatar + nom + statut (en attente / à jour / absence). */}
                          <td className="bt-pl-namecell" style={absToday ? { ...CELL_HEIGHT_HACK, ...HATCH_STYLE } : CELL_HEIGHT_HACK}>
                            <button
                              onClick={() => (selectMode
                                ? toggleGroup(selectableIn((p) => p.user_id === worker.id))
                                : setStatusTarget({ worker, fromStr: todayStr }))}
                              className="bt-pl-namebtn"
                              title={selectMode ? 'Cocher toute sa semaine' : 'Cliquer pour le statut / la disponibilité'}
                            >
                              <span className="bt-pl-nametop">
                                <span className="bt-pl-avatar" style={avatarTint(worker.id, !!absToday)}>
                                  {worker.photo_url ? <img className="bt-pl-avatar-img" src={worker.photo_url} alt="" /> : <>{(worker.first_name?.[0] || '')}{(worker.last_name?.[0] || '')}</>}
                                </span>
                                <span className="bt-pl-name">{fullName}</span>
                              </span>
                              {/* Lot 9 : absent aujourd'hui ET des journées dues → les deux, sur
                                  deux lignes. Masquer la pastille sous l'absence rendait le
                                  bandeau « N journées non envoyées » impossible à retrouver. */}
                              {absToday && (
                                <span className="bt-pl-status"><span className="bt-pl-status-txt" style={{ color: '#6E6A63' }}>{ABSENCE_LABELS[absToday] || absToday}</span></span>
                              )}
                              {isLate ? (
                                <span className="bt-pl-status" data-testid="row-waiting" data-days={missCount}><span className="bt-pl-status-dot" style={{ background: '#D85A30' }} /><span className="bt-pl-status-txt" style={{ color: '#D85A30' }}>{missCount} jour{missCount > 1 ? 's' : ''} en attente</span></span>
                              ) : !absToday && (
                                <span className="bt-pl-status"><span className="bt-pl-status-dot" style={{ background: '#1D9E75' }} /><span className="bt-pl-status-txt" style={{ color: '#1D9E75' }}>À jour</span></span>
                              )}
                            </button>
                          </td>

                          {weekDays.map(day => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const absence = absenceForDay(worker.id, dateStr);
                            const chantiers = cellChantiers(worker.id, dateStr);
                            const extra = extraDeclaredForCell(worker.id, dateStr);
                            const liveHere = !!liveForCell(worker.id, dateStr);
                            const liveChip = liveChipFor(worker.id, dateStr);
                            return (
                              <DroppableCell key={dateStr} workerId={worker.id} dateStr={dateStr} isToday={dateStr === todayStr} live={liveHere}>
                                {absence ? (() => {
                                  const av = ABSENCE_VISUAL[absence.absence_type!] || ABSENCE_VISUAL.conge;
                                  return (
                                    <>
                                      <button
                                        style={{ background: av.bg, color: av.fg, ...(liveChip ? { height: 'auto', flex: 1, minHeight: 56, marginBottom: 7 } : null) }}
                                        onClick={() => (selectMode ? toast('Absence — à changer avec « Présent »') : setStatusTarget({ worker, fromStr: dateStr }))}
                                        className="bt-pl-abs"
                                        title={selectMode ? 'Absence — à changer avec « Présent » (non supprimable ici)' : 'Absence — cliquer pour changer le statut'}
                                      >
                                        <span className="bt-pl-abs-ico">{av.icon}</span>
                                        <span className="bt-pl-abs-lbl">{ABSENCE_LABELS[absence.absence_type!] || absence.absence_type}</span>
                                      </button>
                                      {/* Absent mais pointe quand même : on le dit, sans trancher. */}
                                      {liveChip}
                                    </>
                                  );
                                })() : (
                                  <div
                                    className="bt-pl-cellfill"
                                    onClick={selectMode ? undefined : () => openAdd(worker.id, dateStr)}
                                    title={selectMode ? undefined : 'Cliquer pour ajouter une intervention'}
                                  >
                                    {chantiers.map(p => (
                                      <DraggableBubble key={p.id} p={p} palette={paletteFor(p)} real={realForPlanning(p)} draft={draftForPlanning(p)} onEdit={openEdit} docCount={docsByWorksite.get(p.worksite_id || '') || 0} live={liveForBubble(p)} sel={selFor(p)} onToggle={toggleOne} withdrawn={withdrawnIds.has(p.id)} />
                                    ))}
                                    {extra.map((x, i) => {
                                      const chip = (
                                        <button
                                          key={`xd${i}`}
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); if (selectMode) { toast('Heures ajoutées par le salarié — non supprimable'); return; } setExtraTarget({ userId: worker.id, dateStr, worksiteId: x.worksiteId, name: x.name, minutes: x.minutes }); }}
                                          title={selectMode ? 'Heures ajoutées par le salarié — non supprimable' : 'Ajouté par le salarié — cliquer pour les documents / attribuer un client'}
                                          className="bt-pl-extra"
                                        >
                                          <span className="bt-pl-bub-bar" style={{ background: x.pending ? '#8a8378' : '#B5472E' }} />
                                          <span className="bt-pl-extra-top">
                                            <span className="bt-pl-extra-name">{x.name}</span>
                                          </span>
                                          <span className="bt-pl-extra-by" style={x.pending ? { color: '#6E6A63' } : undefined}><UserIcon className="h-2.5 w-2.5 shrink-0" /> {formatMinutes(x.minutes)} · {x.pending ? 'saisi, à envoyer' : 'ajouté par le salarié'}</span>
                                        </button>
                                      );
                                      return selectMode
                                        ? <div key={`xd${i}`} className="bt-pl-sel lock" data-sel="lock">{chip}<SelMark sel={{ on: false, lock: 'Heures ajoutées par le salarié' }} /></div>
                                        : chip;
                                    })}
                                    {liveChip}
                                    {chantiers.length === 0 && extra.length === 0 && !liveChip && <div className="bt-pl-add">+</div>}
                                  </div>
                                )}
                              </DroppableCell>
                            );
                          })}
                        </tr>
                      );
                  })}
                </tbody>
                {/* Lignes vierges de remplissage : prolongent le quadrillage jusqu'en bas,
                    chacune avec un « + » pour ajouter un salarié. Inertes (pas de dépôt). */}
                {ghostCount > 0 && (
                  <tbody className="bt-pl-ghostbody" aria-hidden="true">
                    {Array.from({ length: ghostCount }).map((_, i) => (
                      <tr key={`ghost-${i}`} className="bt-pl-ghostrow">
                        <td className="bt-pl-namecell">
                          <button className="bt-pl-ghost-add" onClick={() => (workers.length === 0 ? setWorkerOpen(true) : setSalariesOpen(true))} title="Ajouter un salarié">
                            <UserPlus className="h-4 w-4" />
                          </button>
                        </td>
                        {weekDays.map((day) => {
                          const isToday = format(day, 'yyyy-MM-dd') === todayStr;
                          return <td key={day.toISOString()} className={`bt-pl-cell ${isToday ? 'bt-pl-cell-today' : ''}`} />;
                        })}
                      </tr>
                    ))}
                  </tbody>
                )}
            </table>
            {/* Coach de démarrage : checklist discrète et FERMABLE (croix), flottante
                bas-droite — la grille reste pleinement visible et utilisable. Les
                étapes se cochent toutes seules ; tout fait → il disparaît. */}
            {!coachHidden && !selectMode && (workers.length === 0 || worksites.length === 0) && (
              <div className="bt-pl-coach">
                <div className="bt-pl-coach-gold" />
                <div className="bt-pl-coach-head">
                  <div>
                    <p className="bt-pl-coach-kicker">Pour démarrer</p>
                    <h3 className="bt-pl-coach-title">Deux étapes, et tout roule.</h3>
                  </div>
                  <button className="bt-pl-coach-x" onClick={dismissCoach} aria-label="Fermer le guide" title="Fermer">✕</button>
                </div>
                <div className="bt-pl-coach-steps">
                  <button className={`bt-pl-coach-step${workers.length > 0 ? ' done' : ''}`} onClick={() => { if (workers.length === 0) setWorkerOpen(true); }}>
                    <span className="bt-pl-coach-n">{workers.length > 0 ? '✓' : '1'}</span>
                    <span className="bt-pl-coach-t"><b>Ajoutez un salarié</b><small>Il reçoit une invitation par email</small></span>
                  </button>
                  <button className={`bt-pl-coach-step${worksites.length > 0 ? ' done' : ''}`} onClick={() => { if (worksites.length === 0) setClientOpen(true); }}>
                    <span className="bt-pl-coach-n">{worksites.length > 0 ? '✓' : '2'}</span>
                    <span className="bt-pl-coach-t"><b>Créez un client</b><small>Puis glissez-le sur le planning</small></span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* MOBILE — consultation jour par jour (pas de glisser-déposer) */}
          <div className="bt-pl-mobile">
            <div className="bt-pl-m-head">
              <div className="bt-pl-m-brand">
                <div className="bt-pl-m-id">
                  <span className="bt-pl-logo">BEME<span className="x">X</span>O</span>
                  <span className="bt-pl-m-co" title={companyLabel}>{companyLabel}</span>
                </div>
                {trial?.inTrial && !trial.expired && trial.daysLeft !== null && (
                  <div className="bt-pl-trial"><span className="d" /> <b>{trial.daysLeft} j</b> <button className="cta" onClick={onSubscribe}>S&apos;abonner</button></div>
                )}
                {trial?.inTrial && trial.expired && (
                  <div className="bt-pl-trial expired"><span className="d" /> <button className="cta" onClick={onSubscribe}>S&apos;abonner</button></div>
                )}
                <div className="bt-pl-m-actions">
                  {aiOn && user?.role === 'admin' && (
                    <button className="bt-pl-m-ibtn bt-pl-ai" aria-label="Assistant BEMEXO" title="Assistant BEMEXO" onClick={() => setAssistantOpen(true)} data-testid="m-assistant">
                      <Sparkles className="h-4 w-4" />
                    </button>
                  )}
                  <button className="bt-pl-m-ibtn" aria-label="Menu" title="Menu" onClick={() => setMobileMenuOpen(true)}>
                    <Menu className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {/* Lot 11 : les deux indicateurs, compacts. « À relancer » ouvre la même
                  liste que sur ordinateur, avec « Relancer » sur chaque ligne. */}
              <div className="bt-pl-m-stats">
                <button type="button" className={`bt-pl-m-stat${cockpitStats.waiting > 0 ? ' warn' : ''}`} data-testid="m-stat-waiting"
                  title={cockpitStats.waiting === 0 ? `Tout est envoyé en ${monthLabel}` : `${cockpitStats.waiting} ${plural(cockpitStats.waiting, 'journée planifiée non envoyée', 'journées planifiées non envoyées')} en ${monthLabel}`}
                  onClick={() => setRelanceOpen(true)}>
                  <b><span className="dot" style={{ background: cockpitStats.waiting > 0 ? '#E0A21C' : '#4a453d' }} />{fmtStat(cockpitStats.waiting)} j</b><small>à relancer</small>
                </button>
                <span className="bt-pl-m-stat" data-testid="m-stat-docs" title={`${cockpitStats.docs} pièce(s) jointe(s)`}>
                  <b><Paperclip className="h-3 w-3" style={{ opacity: 0.75 }} />{fmtStat(cockpitStats.docs)}</b><small>pièces</small>
                </span>
              </div>
              <div className="bt-pl-m-headrow">
                <div>
                  <div className="bt-pl-kicker">Planning · Sem. {getISOWeek(currentWeekStart)}</div>
                  <div className="bt-pl-m-date">{format(weekDays[mobileDayIdx], 'EEEE d MMMM', { locale: fr })}</div>
                </div>
                <div className="bt-pl-nav">
                  <button className="bt-pl-m-ibtn" aria-label="Semaine précédente" onClick={() => changeWeek(subWeeks(currentWeekStart, 1))}>‹</button>
                  <button className="bt-pl-m-ibtn" aria-label="Semaine suivante" onClick={() => changeWeek(addWeeks(currentWeekStart, 1))}>›</button>
                  <button className="bt-pl-m-ibtn" aria-label="Déconnexion" title="Déconnexion" onClick={signOut}><LogOut className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="bt-pl-m-days">
                {weekDays.map((day, i) => (
                  <button key={day.toISOString()} className={`bt-pl-daypill ${i === mobileDayIdx ? 'on' : ''}`} onClick={() => setMobileDayIdx(i)}>
                    <div className="bt-pl-daypill-d">{dayShort(day)}</div>
                    <div className="bt-pl-daypill-n">{format(day, 'd')}</div>
                  </button>
                ))}
              </div>
            </div>
            {/* Invitations en attente, sous l'en-tête (téléphone) : la même ligne repliée. */}
            {user?.company_id && (
              <div className="bt-pl-inv-mob">
                <PendingInvitations
                  companyId={user.company_id}
                  invitations={pendingInvites}
                  onChanged={() => { fetchData(); fetchExtras(); }}
                />
              </div>
            )}
            <div className="bt-pl-m-list">
              {/* Lot 11 : « Sélectionner » aussi sur téléphone (« Tout sélectionner » = le jour affiché). */}
              {workers.length > 0 && !selectMode && (
                <div className="bt-pl-m-tools">
                  <button type="button" className="bt-pl-m-selbtn" onClick={enterSelect} data-testid="m-select">
                    <CheckSquare className="h-3.5 w-3.5" /> Sélectionner
                  </button>
                </div>
              )}
              {workers.length === 0 ? (
                !coachHidden ? (
                  <div className="bt-pl-coach bt-pl-coach--flow">
                    <div className="bt-pl-coach-gold" />
                    <div className="bt-pl-coach-head">
                      <div>
                        <p className="bt-pl-coach-kicker">Pour démarrer</p>
                        <h3 className="bt-pl-coach-title">Deux étapes, et tout roule.</h3>
                      </div>
                      <button className="bt-pl-coach-x" onClick={dismissCoach} aria-label="Fermer le guide" title="Fermer">✕</button>
                    </div>
                    <div className="bt-pl-coach-steps">
                      <button className="bt-pl-coach-step" onClick={() => setWorkerOpen(true)}>
                        <span className="bt-pl-coach-n">1</span>
                        <span className="bt-pl-coach-t"><b>Ajoutez un salarié</b><small>Il reçoit une invitation par email</small></span>
                      </button>
                      <button className={`bt-pl-coach-step${worksites.length > 0 ? ' done' : ''}`} onClick={() => { if (worksites.length === 0) setClientOpen(true); }}>
                        <span className="bt-pl-coach-n">{worksites.length > 0 ? '✓' : '2'}</span>
                        <span className="bt-pl-coach-t"><b>Créez un client</b><small>Puis planifiez depuis l'ordinateur</small></span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bt-pl-m-empty">Aucun salarié — bouton « Salariés » sur ordinateur.</div>
                )
              ) : workers.map(worker => {
                const dateStr = format(weekDays[mobileDayIdx], 'yyyy-MM-dd');
                const absence = absenceForDay(worker.id, dateStr);
                const chantiers = cellChantiers(worker.id, dateStr);
                const extra = extraDeclaredForCell(worker.id, dateStr);
                const av = absence ? (ABSENCE_VISUAL[absence.absence_type!] || ABSENCE_VISUAL.conge) : null;
                const anyReal = chantiers.some(p => realForPlanning(p));
                // Lot 9 : la carte du jour est la case salarié × jour — même règle que la grille.
                const liveHere = !!liveForCell(worker.id, dateStr);
                const liveChip = liveChipFor(worker.id, dateStr);
                return (
                  <div key={worker.id} className={`bt-pl-m-card${liveHere ? ' bt-pl-cell-live' : ''}`} data-live={liveHere ? '1' : undefined}>
                    {/* Taper le salarié → présence / absence / fiche (même dialogue que le clic
                        sur le nom côté desktop : setStatusTarget). */}
                    <button type="button" className="bt-pl-m-top"
                      onClick={() => (selectMode
                        ? toggleGroup(selectableIn((p) => p.user_id === worker.id && p.work_date === dateStr))
                        : setStatusTarget({ worker, fromStr: dateStr }))}
                      title={selectMode ? 'Cocher ses interventions du jour' : 'Présence, absence ou fiche'}>
                      <span className="bt-pl-avatar" style={avatarTint(worker.id, !!absence)}>{worker.photo_url ? <img className="bt-pl-avatar-img" src={worker.photo_url} alt="" /> : <>{(worker.first_name?.[0] || '')}{(worker.last_name?.[0] || '')}</>}</span>
                      <span style={{ flex: 1, minWidth: 0 }}><span className="bt-pl-name" style={{ display: 'block' }}>{worker.first_name} {worker.last_name}</span></span>
                      {absence ? (
                        <span className="bt-pl-m-badge" style={{ background: '#EFE7DA', color: av!.fg }}>{av!.icon} {(ABSENCE_LABELS[absence.absence_type!] || '').toUpperCase()}</span>
                      ) : liveHere ? (
                        // « EN COURS » passe avant « ✓ ENVOYÉ » : la journée n'est pas finie.
                        <span className="bt-pl-m-badge" data-testid="m-badge-live" style={{ background: '#2FA36B', color: '#fff' }}><span className="bt-pl-live-dot" style={{ background: '#fff' }} aria-hidden />EN COURS</span>
                      ) : anyReal ? (
                        // Lot 11 : le vert est réservé au vrai pointage en cours ; des heures
                        // envoyées gardent une couleur neutre et disent ce qu'elles sont.
                        <span className="bt-pl-m-badge" data-testid="m-badge-sent" style={{ background: '#EFEAE0', color: '#3D382F' }}>✓ ENVOYÉ</span>
                      ) : null}
                    </button>
                    {absence && liveChip && <div className="bt-pl-m-bubs">{liveChip}</div>}
                    {!absence && (
                      <>
                        {(chantiers.length > 0 || extra.length > 0 || liveChip) && (
                          <div className="bt-pl-m-bubs">
                            {/* Taper une bulle → modifier l'affectation (openEdit, comme desktop). */}
                            {chantiers.map(p => {
                              // Lot 11 : en mode « Sélectionner », taper coche (ou dit pourquoi c'est verrouillé).
                              const sel = selFor(p);
                              const act = () => (sel ? toggleOne(p, sel.lock) : openEdit(p));
                              return (
                                <div key={p.id} className={`bt-pl-m-bubbtn${sel ? ` ${selClass(sel)}` : ''}`} role="button" tabIndex={0}
                                  data-sel={sel ? selAttr(sel) : undefined} data-pid={sel ? p.id : undefined}
                                  onClick={act} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } }}>
                                  <BubbleContent p={p} palette={paletteFor(p)} real={realForPlanning(p)} draft={draftForPlanning(p)} docCount={docsByWorksite.get(p.worksite_id || '') || 0} live={liveForBubble(p)} withdrawn={withdrawnIds.has(p.id)} />
                                  {sel && <SelMark sel={sel} />}
                                </div>
                              );
                            })}
                            {/* Taper une intervention ajoutée par le salarié → attribution / documents. */}
                            {extra.map((x, i) => {
                              const chip = (
                                <button type="button" key={`mx${i}`} className="bt-pl-extra" onClick={() => (selectMode ? toast('Heures ajoutées par le salarié — non supprimable') : setExtraTarget({ userId: worker.id, dateStr, worksiteId: x.worksiteId, name: x.name, minutes: x.minutes }))}>
                                  <span className="bt-pl-bub-bar" style={{ background: x.pending ? '#8a8378' : '#B5472E' }} />
                                  <span className="bt-pl-extra-top"><span className="bt-pl-extra-name">{x.name}</span></span>
                                  <span className="bt-pl-extra-by" style={x.pending ? { color: '#6E6A63' } : undefined}><UserIcon className="h-2.5 w-2.5 shrink-0" /> {formatMinutes(x.minutes)} · {x.pending ? 'saisi, à envoyer' : 'ajouté par le salarié'}</span>
                                </button>
                              );
                              return selectMode
                                ? <div key={`mx${i}`} className="bt-pl-sel lock" data-sel="lock">{chip}<SelMark sel={{ on: false, lock: 'Heures ajoutées par le salarié' }} /></div>
                                : chip;
                            })}
                            {liveChip}
                          </div>
                        )}
                        {/* Ajouter un chantier à ce salarié pour ce jour (openAdd → même dialogue que
                            le glisser-déposer côté desktop, sans le drag). */}
                        <button type="button" className="bt-pl-m-add" onClick={() => openAdd(worker.id, dateStr)}>
                          <Plus className="h-3.5 w-3.5" /> Ajouter un chantier
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        <DragOverlay>
          {activeDrag?.type === 'new' ? (() => {
            const ws = worksites.find((w) => w.id === activeDrag.worksiteId);
            return ws ? (
              <div className="bt-pl-dragchip"><span className="bt-pl-pilldot" style={{ background: colorForWorksite(ws.id).bar }} />{ws.client_name}</div>
            ) : null;
          })() : activeDrag?.type === 'move' ? (
            (() => {
              const p = planning.find(x => x.id === activeDrag.id);
              // Lot 2 : en copie, la bulle tenue montre ce qui sera créé — le prévu,
              // sans les heures ni le pointage de l'original — et une pastille « + ».
              return p ? (
                <div className="bt-pl-overlay" data-testid="drag-overlay">
                  {copying && <span className="bt-pl-copybadge" aria-hidden="true">+</span>}
                  {copying
                    ? <BubbleContent p={p} palette={paletteFor(p)} docCount={docsByWorksite.get(p.worksite_id || '') || 0} />
                    : <BubbleContent p={p} palette={paletteFor(p)} real={realForPlanning(p)} docCount={docsByWorksite.get(p.worksite_id || '') || 0} live={liveForBubble(p)} withdrawn={withdrawnIds.has(p.id)} />}
                </div>
              ) : null;
            })()
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Lot 11 : en bas de l'écran — la barre de sélection (mode « Sélectionner »)
          et la carte « N intervention(s) supprimée(s) · Annuler » (jusqu'à sa croix). */}
      {(selectMode || undoCard) && (() => {
        const n = selIds.length;
        const weekIds = selectMode ? selectableIn((p) => displayWorkers.some((w) => w.id === p.user_id)) : [];
        const dayStr = format(weekDays[mobileDayIdx], 'yyyy-MM-dd');
        const dayIds = selectMode ? selectableIn((p) => p.work_date === dayStr && workers.some((w) => w.id === p.user_id)) : [];
        const allOn = (ids: string[]) => ids.length > 0 && ids.every((id) => selOn.has(id));
        return (
          <div className="bt-pl-dock">
            {undoCard && (
              <div className="bt-pl-undo" data-testid="undo-card" key={undoCard.key}>
                <ActionDone message={undoCard.message} strongUndo={undoCard.strong} undo={undoCard.undo} />
                <button type="button" className="bt-pl-undo-x" aria-label="Fermer" title="Fermer" data-testid="undo-close" onClick={() => setUndoCard(null)}>✕</button>
              </div>
            )}
            {selectMode && (
              <div className="bt-pl-selbar" role="toolbar" aria-label="Sélection" data-testid="sel-bar">
                <span className="bt-pl-selbar-n" data-testid="sel-count">{n} sélectionnée{n > 1 ? 's' : ''}</span>
                <button type="button" className="bt-pl-selbar-btn wk" data-testid="sel-all" onClick={() => toggleGroup(weekIds)}>
                  {allOn(weekIds) ? 'Tout désélectionner' : 'Tout sélectionner'}
                </button>
                <button type="button" className="bt-pl-selbar-btn dy" data-testid="sel-all-day" onClick={() => toggleGroup(dayIds)}>
                  {allOn(dayIds) ? 'Tout désélectionner' : 'Tout sélectionner'}
                </button>
                <button type="button" className="bt-pl-selbar-del" data-testid="sel-delete" disabled={n === 0 || eraseBusy} onClick={deleteSelected}>
                  {eraseBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Supprimer ({n})
                </button>
                <button type="button" className="bt-pl-selbar-btn bt-pl-selbar-ok" data-testid="sel-done" onClick={exitSelect}>Terminer</button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Lot 11 : « À relancer » sur téléphone — la même liste que sur ordinateur. */}
      <Dialog open={relanceOpen} onOpenChange={setRelanceOpen}>
        <DialogContent className="bt-skin max-w-sm">
          <DialogHeader><DialogTitle>À relancer · {monthLabel}</DialogTitle></DialogHeader>
          <div className="bt-pl-sp-list overflow-hidden rounded-lg border" data-testid="relance-list">{renderRelanceRows(() => setRelanceOpen(false))}</div>
          <p className="text-xs text-muted-foreground">Journées planifiées sans heures envoyées (ce mois-ci et le mois dernier, sauf mois clôturé).</p>
        </DialogContent>
      </Dialog>

      {/* Disponibilité popup — 5 buttons + fiche link */}
      <Dialog open={!!statusTarget} onOpenChange={(o) => { if (!o) setStatusTarget(null); }}>
        <DialogContent className="bt-skin max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {statusTarget ? `Statut de ${statusTarget.worker.first_name} à partir ${statusTarget.fromStr === todayStr ? "d'aujourd'hui" : `du ${fromLabel(statusTarget.fromStr)}`}` : ''}
            </DialogTitle>
          </DialogHeader>
          {statusTarget && (
            <div className="space-y-2 pt-1">
              <Button variant="outline" className="w-full justify-start h-11 text-[15px]" onClick={() => { setPresentFrom(statusTarget.worker.id, statusTarget.fromStr); setStatusTarget(null); }}>
                <span className="h-3 w-3 rounded-full mr-3" style={{ background: '#1D9E75' }} /> Présent
              </Button>
              {ABSENCE_OPTIONS.map(opt => (
                <Button key={opt.value} variant="outline" className="w-full justify-start h-11 text-[15px]" onClick={() => chooseAbsence(statusTarget.worker, opt.value, statusTarget.fromStr)}>
                  <span className="h-3 w-3 rounded-full mr-3" style={{ background: '#E0A21C' }} /> {opt.label}
                </Button>
              ))}
              <div className="border-t pt-2 mt-1">
                <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={() => { setFicheMode('hours'); setFicheWorker(statusTarget.worker); setStatusTarget(null); }}>
                  <FileText className="h-4 w-4 mr-2" /> Feuille d'heures
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Worker fiche (detailed — management + hours) */}
      <WorkerDetailDialog
        worker={ficheWorker}
        mode={ficheMode}
        onOpenChange={(open) => { if (!open) setFicheWorker(null); }}
        onChanged={() => { fetchData(); refresh(); }}
      />

      <CompanySettings open={settingsOpen} onOpenChange={setSettingsOpen} onSaved={fetchData} />

      <AdminMobileMenu
        open={mobileMenuOpen}
        onOpenChange={setMobileMenuOpen}
        user={user}
        companyLabel={companyLabel}
        companyLogo={companyLogo}
        companyInitials={companyInitials}
        trial={trial}
        onSubscribe={onSubscribe}
        onOpenSalaries={() => setSalariesOpen(true)}
        onOpenChantiers={() => { setClientsQuery(''); setMobileChantiersOpen(true); }}
        onOpenExportTeam={() => setExportOpen(true)}
        onOpenSelect={workers.length > 0 ? enterSelect : undefined}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenCost={() => setCostOpen(true)}
        onOpenLeaves={() => setLeaveOpen(true)}
        pendingLeaves={pendingLeaves}
        onOpenReserves={() => setReservesOpen(true)}
        openReserves={openReserves}
        onOpenKiosk={kioskOn && user?.company_id ? () => setKioskOpen(true) : undefined}
        onSignOut={signOut}
      />

      {/* Lot 10 : la gestion des bornes, ouverte directement depuis la barre — le MÊME
          composant que dans les réglages (KioskAdmin est lui-même la fenêtre). */}
      {kioskOn && user?.company_id && (
        <KioskAdmin open={kioskOpen} onOpenChange={setKioskOpen} companyId={user.company_id} />
      )}

      {/* Salariés — administrative management */}
      <Dialog open={salariesOpen} onOpenChange={setSalariesOpen}>
        <DialogContent className="bt-skin max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Salariés</DialogTitle></DialogHeader>
          <div className="pt-1">
            <Button size="sm" className="mb-2 w-full font-bold" onClick={() => { setSalariesOpen(false); setWorkerOpen(true); }}>
              <UserPlus className="h-4 w-4 mr-1.5" /> Nouveau salarié
            </Button>
            <Button size="sm" variant="outline" className="mb-2 w-full font-bold" onClick={() => { setSalariesOpen(false); setImportWorkersOpen(true); }}>
              <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Importer (CSV/Excel)
            </Button>
            <Button size="sm" variant="outline" className="mb-2 w-full font-bold" onClick={() => { setSalariesOpen(false); setLeaveOpen(true); }}>
              <Palmtree className="h-4 w-4 mr-1.5" /> Demandes de congé
              {pendingLeaves > 0 && <span className="bt-pl-badge ml-1.5">{pendingLeaves}</span>}
            </Button>

            {/* LE BUREAU. Une entreprise n'avait qu'un seul administrateur, celui
                qui a créé le compte : si le patron est sur un toit, personne ne
                sort la paie. On peut maintenant en nommer d'autres — et surtout
                les revoir ici, alors qu'une personne promue disparaissait de la
                liste des salariés et ne pouvait plus être rétrogradée. */}
            <div className="mb-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" /> Bureau · accès complet
              </div>
              <div className="space-y-1">
                {officeUsers.map((o) => (
                  <div key={o.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm" style={{ background: '#FBF7EF' }}>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {o.first_name} {o.last_name}
                      {o.id === user?.id && <span className="ml-1.5 text-xs text-muted-foreground">(vous)</span>}
                    </span>
                    <Button
                      variant="outline" size="sm" className="h-7 text-xs"
                      disabled={roleBusyId === o.id || officeUsers.length <= 1}
                      title={officeUsers.length <= 1
                        ? "Dernier accès bureau : nommez quelqu'un d'autre avant de le retirer"
                        : 'Retirer du bureau'}
                      onClick={() => changeRole(o, 'worker')}
                    >
                      {roleBusyId === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Retirer'}
                    </Button>
                  </div>
                ))}
                {officeUsers.length <= 1 && (
                  <div className="flex items-center gap-1.5 px-1 pt-1 text-[11.5px] font-semibold text-muted-foreground">
                    <span>Un seul accès bureau.</span>
                    <InfoTip text="Si cette personne est indisponible, plus personne ne sort la paie. Nommez un second « Bureau » dans la liste ci-dessous." />
                  </div>
                )}
              </div>
            </div>

            <Input placeholder="Rechercher un salarié…" value={salariesQuery} onChange={(e) => setSalariesQuery(e.target.value)} className="mb-2" />
            <div className="space-y-1">
              {workers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Aucun salarié pour le moment — cliquez sur « Nouveau salarié » ci-dessus pour envoyer la première invitation.</p>
              ) : filteredWorkers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Aucun résultat</p>
              ) : (
                filteredWorkers.map(w => {
                  const miss = (missingEffective.get(w.id) || []).length;
                  const closedUntil = workerClosures.get(w.id);
                  return (
                    <div key={w.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <button className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => { setSalariesOpen(false); setFicheMode('manage'); setFicheWorker(w); }}>
                        <span className="font-medium truncate">{w.first_name} {w.last_name}</span>
                        {w.role === 'lead' && <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: '#F1E8D6', color: '#6b5a2e' }}>CHEF</span>}
                        {/* Lot 11 : « Clôturer jusqu'au… » — on voit d'un coup d'œil qui est parti. */}
                        {closedUntil && <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: '#ECE8E1', color: '#6E6A63' }} data-testid="closure-chip" title="Heures clôturées jusqu'à cette date">clôturé au {format(parseISO(closedUntil), 'dd/MM')}</span>}
                        {miss > 0 && <span className="h-2 w-2 rounded-full shrink-0" style={{ background: '#B5472E' }} title={`${miss} jour(s) en attente`} />}
                      </button>
                      {miss > 0 && (
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => sendReminder(w)} title="Envoyer un rappel" disabled={remindingId === w.id}>
                          {remindingId === w.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                      {/* Trois rôles, un seul endroit pour en changer. Le chef
                          d'équipe n'est PAS un bureau au rabais : il saisit les
                          heures de son équipe du jour, rien de plus. */}
                      <select
                        className="h-7 rounded-md border px-1.5 text-xs font-bold"
                        value={w.role === 'lead' ? 'lead' : 'worker'}
                        disabled={roleBusyId === w.id}
                        onChange={(e) => changeRole(w, e.target.value as 'admin' | 'lead' | 'worker')}
                      >
                        <option value="worker">Salarié</option>
                        <option value="lead">Chef d&apos;équipe</option>
                        <option value="admin">Bureau</option>
                      </select>
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        companyId={user?.company_id}
        existingNames={worksites.map((w) => w.client_name)}
        onImported={fetchData}
      />

      <CostReport open={costOpen} onOpenChange={setCostOpen} companyId={user?.company_id} />

      {aiOn && user?.role === 'admin' && (
        <AssistantPanel
          source={supabaseAssistantSource}
          memoryKey={`bureau:${user.id}`}
          attachments
          open={assistantOpen}
          onOpenChange={setAssistantOpen}
          launcher={false}
          onNavigate={(action) => {
            if (action === 'couts') setCostOpen(true);
            else if (action === 'conges') setLeaveOpen(true);
            else if (action === 'salaries') setSalariesOpen(true);
            else if (action === 'nouveau_salarie') setWorkerOpen(true);
            else if (action === 'nouveau_client') setClientOpen(true);
            else if (action === 'import_clients') setImportOpen(true);
            else if (action === 'reserves') setReservesOpen(true);
            else if (action === 'export') setExportOpen(true);
            else if (action === 'reglages') setSettingsOpen(true);
            else if (action === 'planning') setAssistantOpen(false);
            else if (action === 'clients') {
              if (window.matchMedia('(max-width: 640px)').matches) setMobileChantiersOpen(true); else setChantierMenuOpen(true);
            }
            else if (action.startsWith('salarie:')) {
              const w = workers.find((x) => x.id === action.slice(8));
              if (w) { setFicheMode('hours'); setFicheWorker(w); }
            }
          }}
          renderExtra={(extra, ctl) => (
            <AssistantActionCard
              extra={extra as ActionExtra}
              ctl={ctl}
              execute={makeActionExecutor({ id: user.id, company_id: user.company_id })}
              onDone={() => { fetchData(); fetchExtras(); }}
            />
          )}
        />
      )}

      {/* Registre des réserves — ouvre le module Documents du chantier pour les
          photos. Après une levée, `refresh` recharge le planning ET les extras :
          sans le premier, le triangle de la case garderait sa couleur d'alerte ;
          sans le second, la pastille resterait fausse jusqu'au prochain sondage. */}
      <ReservesReport
        open={reservesOpen}
        onOpenChange={setReservesOpen}
        companyId={user?.company_id}
        onOpenDocs={(id, name) => {
          // Depuis le registre des réserves on ouvre le dossier DU CHANTIER,
          // sans jour : une réserve porte sa propre date, et coller ici celle
          // d'aujourd'hui rangerait la pièce au mauvais endroit.
          const ws = worksites.find((w) => w.id === id);
          setDocsWorksite({ ws: ws || ({ id, client_name: name } as Worksite), day: null });
        }}
        onChanged={refresh}
      />

      <ImportWorkersDialog
        open={importWorkersOpen}
        onOpenChange={setImportWorkersOpen}
        existingEmails={[...workers.map((w) => w.email), ...invitations.map((i) => i.email)]}
        onImported={() => { fetchData(); fetchExtras(); }}
      />

      <LeaveAdminDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        companyId={user?.company_id}
        adminId={user?.id}
        workers={workers}
        onChanged={() => { fetchExtras(); refresh(); }}
      />

      {/* Chantiers — mobile equivalent of the desktop "Clients" dropdown (list +
          search + edit fiche + create). Same data/functions as desktop, no drag
          (placement on the grid is a desktop-only, mouse-drag interaction). */}
      <Dialog open={mobileChantiersOpen} onOpenChange={setMobileChantiersOpen}>
        <DialogContent className="bt-skin max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Chantiers</DialogTitle></DialogHeader>
          <div className="pt-1">
            <Button size="sm" className="mb-2 w-full font-bold" onClick={() => { setMobileChantiersOpen(false); setClientOpen(true); }}>
              <Building2 className="h-4 w-4 mr-1.5" /> Nouveau client
            </Button>
            <Button size="sm" variant="outline" className="mb-2 w-full font-bold" onClick={() => { setMobileChantiersOpen(false); setImportOpen(true); }}>
              <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Importer (CSV/Excel)
            </Button>
            <Input placeholder="Rechercher un client…" value={clientsQuery} onChange={(e) => setClientsQuery(e.target.value)} className="mb-2" />
            <div className="space-y-1">
              {worksites.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Aucun chantier pour le moment — cliquez sur « Nouveau client » ci-dessus.</p>
              ) : filteredClients.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Aucun résultat</p>
              ) : (
                filteredClients.map((ws) => {
                  const sub = [ws.product_type, ws.city].filter(Boolean).join(' · ');
                  return (
                    <button
                      key={ws.id}
                      className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm text-left"
                      onClick={() => { setMobileChantiersOpen(false); openClientFiche(ws); }}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="font-medium truncate block">{ws.client_name}</span>
                        {sub && <span className="text-xs text-muted-foreground truncate block">{sub}</span>}
                      </span>
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Attribute a client to a worker-added intervention (clicked from the grid) */}
      <Dialog open={!!attributeTarget && !clientOpen} onOpenChange={(o) => { if (!o) setAttributeTarget(null); }}>
        <DialogContent className="bt-skin max-w-sm">
          <DialogHeader><DialogTitle>Attribuer un client</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground">Intervention <strong>« {attributeTarget?.label} »</strong> ajoutée par le salarié. Choisissez le client.</p>
            <Select onValueChange={(v) => attributeClient(v)} disabled={attrBusy}>
              <SelectTrigger><SelectValue placeholder="Choisir un client existant…" /></SelectTrigger>
              <SelectContent className="bt-skin">
                {worksites.filter((w) => w.id !== attributeTarget?.worksiteId)
                  .slice().sort((a, b) => (a.client_name === 'Autre' ? -1 : b.client_name === 'Autre' ? 1 : 0))
                  .map((ws) => (
                  <SelectItem key={ws.id} value={ws.id}>{ws.client_name}{ws.city ? ` — ${ws.city}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" className="w-full" disabled={attrBusy} onClick={() => setClientOpen(true)}>
              <Building2 className="h-4 w-4 mr-2" /> Créer un nouveau client…
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Intervention ajoutée par le salarié : popup avec Documents + attribution (au lieu de forcer l'attribution) */}
      <Dialog open={!!extraTarget} onOpenChange={(o) => { if (!o) setExtraTarget(null); }}>
        <DialogContent className="bt-skin max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-start gap-2"><UserIcon className="h-4 w-4 mt-1 shrink-0" /> <span className="min-w-0 break-words">{extraTarget?.name}</span></DialogTitle>
          </DialogHeader>
          {extraTarget && (
            <div className="space-y-3 pt-1">
              <p className="text-sm text-muted-foreground">{formatMinutes(extraTarget.minutes)} · ajouté par le salarié.</p>
              <Button variant="outline" className="w-full justify-start" disabled={!extraTarget.worksiteId}
                onClick={() => { const ws = worksites.find((w) => w.id === extraTarget.worksiteId); if (ws) { setDocsWorksite({ ws, day: extraTarget.dateStr }); setExtraTarget(null); } }}>
                <FileText className="h-4 w-4 mr-2" /> Documents du chantier
              </Button>
              <Button variant="outline" className="w-full justify-start"
                onClick={() => { setAttributeTarget({ userId: extraTarget.userId, dateStr: extraTarget.dateStr, worksiteId: extraTarget.worksiteId, label: extraTarget.name }); setExtraTarget(null); }}>
                <Building2 className="h-4 w-4 mr-2" /> Attribuer / changer le client
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Team export — lot 11 : « Exporter » de la barre ouvre directement cette fenêtre ;
          un seul menu « Exporter ▾ » (PDF, Excel, CSV), le même que dans la fiche. */}
      <Dialog open={exportOpen} onOpenChange={(o) => { setExportOpen(o); if (o) setExportRange(null); }}>
        <DialogContent className="bt-skin max-w-sm" data-testid="team-export">
          <DialogHeader><DialogTitle>Exporter l&apos;équipe</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => { const t = new Date(); setExportRange({ from: t, to: t }); }}>Aujourd'hui</Button>
              <Button variant="outline" size="sm" onClick={() => setExportRange({ from: currentWeekStart, to: addDays(currentWeekStart, DAYS_IN_WEEK - 1) })}>Cette semaine</Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm"><CalendarRange className="h-4 w-4 mr-1" /> Créneau</Button>
                </PopoverTrigger>
                <PopoverContent className="bt-skin w-auto p-0" align="end">
                  <Calendar mode="range" numberOfMonths={1} locale={fr}
                    selected={exportRange ?? undefined}
                    onSelect={(r) => { if (r?.from) setExportRange({ from: r.from, to: r.to ?? r.from }); }} />
                </PopoverContent>
              </Popover>
            </div>
            {exportRange
              ? <p className="text-center text-sm font-medium capitalize">{format(exportRange.from, 'd MMM', { locale: fr })} → {format(exportRange.to, 'd MMM yyyy', { locale: fr })}</p>
              : <p className="text-center text-sm text-muted-foreground">Choisissez une période.</p>}
            <div className="flex">
              <ExportMenu onPick={(k) => runExport(k)} disabled={exporting || !exportRange} busy={exporting} align="start" testId="team-export-menu" />
            </div>
            <Button
              variant="outline"
              className="w-full min-w-0 justify-start"
              onClick={() => runExport('comptable')}
              disabled={exporting || !exportRange || !accountantEmail}
              data-testid="send-accountant"
              title={accountantEmail
                ? `Envoyer le tableur à ${accountantEmail}`
                : "Enregistrez l'adresse de votre comptable dans les réglages"}
            >
              {exporting ? <Loader2 className="h-4 w-4 shrink-0 animate-spin mr-2" /> : <Mail className="h-4 w-4 shrink-0 mr-2" />}
              <span className="min-w-0 truncate">{accountantEmail ? `Envoyer à ${accountantEmail}` : 'Envoyer au comptable'}</span>
            </Button>
            {!accountantEmail && (
              <p className="text-xs text-muted-foreground">Ajoutez l&apos;adresse du comptable dans les réglages.</p>
            )}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Exporter verrouille les heures de la période.</span>
              <InfoTip text="Excel, PDF ou CSV pour la paie : les heures exportées sont verrouillées, les salariés ne peuvent plus les modifier. Vous gardez la main." />
            </div>

            {/* Clôture du mois — après l'export, on ferme. Un salarié ne peut
                alors plus rien écrire sur ce mois ; le bureau, si. */}
            <div className="border-t pt-3 space-y-2">
              <p className="text-sm font-semibold">Clôture du mois</p>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Les salariés ne pourront plus rien y changer.</span>
                <InfoTip text="Vous gardez la main et pouvez rouvrir à tout moment." />
              </div>
              {closableMonths.map((m) => {
                const label = format(new Date(`${m}-01T00:00:00`), 'MMMM yyyy', { locale: fr });
                const closed = closedMonths.has(m);
                return (
                  <div key={m} className="flex items-center justify-between gap-2">
                    <span className="text-sm capitalize">{label}{closed ? ' · clos' : ''}</span>
                    <Button
                      variant={closed ? 'outline' : 'default'}
                      size="sm"
                      disabled={closureBusy}
                      onClick={() => (closed ? reopenMonth(m) : askClosure(m))}
                    >
                      {closed ? 'Rouvrir' : 'Clôturer'}
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className="text-center">
              <button type="button" className="text-xs font-semibold text-muted-foreground underline hover:text-foreground" data-testid="export-one-worker"
                onClick={() => { setExportOpen(false); setExportWorkerOpen(true); }}>
                Un seul salarié ?
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation de clôture : on annonce ce qui restera bloqué. */}
      <Dialog open={!!closureTarget} onOpenChange={(o) => { if (!o) setClosureTarget(null); }}>
        <DialogContent className="bt-skin max-w-sm">
          <DialogHeader>
            <DialogTitle className="capitalize">
              Clôturer {closureTarget ? format(new Date(`${closureTarget.month}-01T00:00:00`), 'MMMM yyyy', { locale: fr }) : ''} ?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground">
              Les salariés ne pourront plus rien saisir, modifier ni envoyer sur ce mois. Vous gardez la main et pouvez rouvrir à tout moment.
            </p>
            {closureTarget && closureTarget.drafts > 0 && (
              <div className="rounded-md border border-orange-300 bg-orange-50 p-3 text-sm text-orange-900">
                <b>{closureTarget.drafts} journée{closureTarget.drafts > 1 ? 's' : ''} en brouillon</b> dans ce mois.
                Elles ne sont pas envoyées, donc pas dans l'export — et après la clôture, le salarié ne pourra plus les envoyer.
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setClosureTarget(null)}>Annuler</Button>
              <Button className="flex-1" disabled={closureBusy} onClick={() => closureTarget && closeMonth(closureTarget.month)}>
                {closureBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Clôturer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Export one worker — pick a worker, then their fiche (calendar + Excel/PDF, no lock) */}
      <Dialog open={exportWorkerOpen} onOpenChange={setExportWorkerOpen}>
        <DialogContent className="bt-skin max-w-sm max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Exporter un salarié</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground">Choisissez un salarié. Cet export ne verrouille rien.</p>
            <div className="space-y-1">
              {workers.length === 0 ? (
                <div className="py-5 text-center">
                  <p className="text-sm text-muted-foreground mb-3">Aucun salarié à exporter pour le moment.</p>
                  <Button size="sm" variant="outline" onClick={() => { setExportWorkerOpen(false); setWorkerOpen(true); }}>
                    <UserPlus className="h-4 w-4 mr-1.5" /> Ajouter un salarié
                  </Button>
                </div>
              ) : (
                workers.map(w => (
                  <button
                    key={w.id}
                    onClick={() => { setExportWorkerOpen(false); setFicheMode('hours'); setFicheWorker(w); }}
                    className="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors"
                  >
                    <span className="font-medium truncate">{w.first_name} {w.last_name}</span>
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cell add — a client on a specific day */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setAddTarget(null); }}>
        <DialogContent className="bt-skin max-w-sm">
          <DialogHeader><DialogTitle>Ajouter une intervention</DialogTitle></DialogHeader>
          <form onSubmit={confirmAdd} className="space-y-4 pt-2" data-testid="add-form">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={addWorksite} onValueChange={setAddWorksite}>
                <SelectTrigger><SelectValue placeholder="Choisir un client" /></SelectTrigger>
                <SelectContent className="bt-skin">
                  {worksites.map(ws => <SelectItem key={ws.id} value={ws.id}>{ws.client_name}{ws.city ? ` — ${ws.city}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <ScheduleRow start={addStart} end={addEnd} onStart={setAddStart} onEnd={setAddEnd} testId="add-time" onBadChange={setAddTimeBad} />
            <div className="space-y-2">
              <Label>Note pour le poseur (optionnel)</Label>
              <Textarea value={addNote} onChange={(e) => setAddNote(e.target.value)} rows={2} placeholder="Ex : code portail 1234…" />
            </div>
            <Button type="submit" className="w-full" disabled={addSaving}>
              {addSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Ajouter au planning
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Absence start — optional end date via calendar */}
      <Dialog open={!!pendingAbsence} onOpenChange={(o) => { if (!o) setPendingAbsence(null); }}>
        <DialogContent className="bt-skin max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {pendingAbsence ? `${ABSENCE_STATUS_LABELS[pendingAbsence.type] || pendingAbsence.type} — ${pendingAbsence.worker.first_name}` : ''}
            </DialogTitle>
          </DialogHeader>
          {pendingAbsence && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span>Touchez le 1er jour, puis le dernier.</span>
                <InfoTip text="Sans dernier jour : jusqu'au retour « Présent »." />
              </div>
              <div className="flex justify-center">
                <Calendar
                  mode="range"
                  selected={absRange}
                  onSelect={setAbsRange}
                  numberOfMonths={1}
                  locale={fr}
                  weekStartsOn={1}
                  defaultMonth={absRange?.from || new Date(`${pendingAbsence.fromStr}T00:00:00`)}
                />
              </div>
              <p className="text-center text-sm">
                {absRange?.from
                  ? <>Du <strong className="capitalize">{format(absRange.from, 'd MMM', { locale: fr })}</strong>{absRange.to ? <> au <strong className="capitalize">{format(absRange.to, 'd MMM yyyy', { locale: fr })}</strong></> : <span className="text-muted-foreground"> (jusqu'au retour)</span>}</>
                  : <span className="text-muted-foreground">Aucune date choisie</span>}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setStatusTarget({ worker: pendingAbsence.worker, fromStr: pendingAbsence.fromStr }); setPendingAbsence(null); }}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Retour
                </Button>
                <Button className="flex-1" onClick={confirmAbsence} disabled={absSaving || !absRange?.from}>
                  {absSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Enregistrer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Affectation popup — ONLY this day's assignment */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) closeEdit(); }}>
        <DialogContent className="bt-skin max-w-md max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.worksite?.client_name || 'Intervention'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3 pt-1">
              {/* Client (read-only) + link to the separate fiche */}
              <div className="rounded-lg border bg-[#FBF7EF] p-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-base font-semibold truncate">{editing.worksite?.client_name || 'Client'}</p>
                  {(editing.worksite?.address || editing.worksite?.city) && (
                    <p className="text-xs text-muted-foreground truncate">
                      {[editing.worksite?.address, editing.worksite?.city].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
                {editing.worksite && (
                  <div className="flex flex-col items-stretch gap-1.5 shrink-0">
                    <Button variant="outline" size="sm" className="justify-start h-8" onClick={() => openClientFiche(editing.worksite)}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" /> Fiche
                    </Button>
                    <Button variant="outline" size="sm" className="justify-start h-8" onClick={() => { if (editing.worksite) setDocsWorksite({ ws: editing.worksite, day: editing.work_date }); }}>
                      <FileText className="h-3.5 w-3.5 mr-1.5" /> Documents
                    </Button>
                  </div>
                )}
              </div>

              {/* Lot 11 : « Horaire prévu : début – fin » (facultatifs), plus de roulette. */}
              <ScheduleRow start={editStart} end={editEnd} onStart={setEditStart} onEnd={setEditEnd} testId="edit-time" onBadChange={setEditTimeBad} />

              {/* Note for the poseur */}
              <div className="space-y-1.5">
                <Label>Note pour le poseur</Label>
                <Textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} rows={2} placeholder="Ex : code portail 1234, attention au chien…" />
              </div>

              {/* Real hours (read-only) */}
              <div className="rounded-lg border bg-[#FBF7EF] p-2.5 text-sm">
                <span className="font-medium">Heures déclarées : </span>
                {editRealAgg ? (
                  <span style={{ color: '#1F7A4D' }}>{editRealAgg.start?.substring(0, 5)}–{editRealAgg.end?.substring(0, 5)} · <strong>{formatMinutes(editRealAgg.minutes)} réelles</strong>{editRealAgg.count > 1 ? ` (${editRealAgg.count} saisies)` : ''}</span>
                ) : (
                  <span className="text-muted-foreground">pas encore déclaré</span>
                )}
                {/* Lot 2 : ce qui part avec « Supprimer », dit avant le clic. */}
                {!editRealAgg && withdrawnIds.has(editing.id) && (
                  <div className="mt-1 text-[13px] text-muted-foreground" data-testid="edit-withdrawn">Retirée par le salarié : ses heures retirées restent dans sa fiche.</div>
                )}
                {!editRealAgg && emptyDraftPids.has(editing.id) && (
                  <div className="mt-1 text-[13px] text-muted-foreground" data-testid="edit-empty-draft">Brouillon vide du salarié (0 min) : supprimé avec l’intervention.</div>
                )}
                {editRealAgg?.reception === 'avec' && (
                  editRealAgg.reserveOpen ? (
                    <div className="mt-1.5 flex items-center gap-1.5 font-semibold text-[#C0461F]"><AlertTriangle className="h-3.5 w-3.5" /> Réception avec réserve — à traiter</div>
                  ) : (
                    <div className="mt-1.5 flex items-center gap-1.5 font-semibold text-[#1F7A4D]"><CheckCircle2 className="h-3.5 w-3.5" /> Réception avec réserve — levée</div>
                  )
                )}
                {editRealAgg?.reception === 'sans' && (
                  <div className="mt-1.5 flex items-center gap-1.5 font-semibold text-[#1F7A4D]"><CheckCircle2 className="h-3.5 w-3.5" /> Réceptionné sans réserve</div>
                )}
                {editRealAgg?.reception === 'en_cours' && (
                  <div className="mt-1.5 flex items-center gap-1.5 font-semibold text-[#8a6d05]"><Hammer className="h-3.5 w-3.5" /> Chantier en cours</div>
                )}
                {editRealAgg?.note && (
                  <div className="mt-1 text-[13px] text-[#15120F]">« {editRealAgg.note} »</div>
                )}
                {editRealAgg?.reception === 'avec' && editing.worksite && (
                  <button type="button" className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[#a87c1e] underline" onClick={() => { if (editing.worksite) setDocsWorksite({ ws: editing.worksite, day: editing.work_date }); }}>
                    <FileText className="h-3.5 w-3.5" /> Voir les photos / documents
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <Button className="flex-1" onClick={saveAffectation} disabled={savingEdit}>
                  {savingEdit && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Enregistrer
                </Button>
                <Button variant="outline" className="text-destructive" onClick={deleteAffectation} disabled={deletingEdit} data-testid="edit-delete">
                  {deletingEdit ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />} Supprimer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Client fiche — permanent client data (separate) */}
      <Dialog open={!!clientFiche} onOpenChange={(o) => { if (!o) setClientFiche(null); }}>
        <DialogContent className="bt-skin max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Fiche client</DialogTitle>
          </DialogHeader>
          {clientFiche && (
            <div className="space-y-2 pt-1">
              <div className="space-y-1"><Label>Nom du client</Label><Input value={wsName} onChange={(e) => setWsName(e.target.value)} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1"><Label>Type de produit</Label><Input value={wsProduct} onChange={(e) => setWsProduct(e.target.value)} /></div>
                <div className="space-y-1"><Label>Téléphone</Label><Input type="tel" value={wsPhone} onChange={(e) => setWsPhone(e.target.value)} /></div>
              </div>
              <div className="space-y-1"><Label>Email</Label><Input type="email" value={wsEmail} onChange={(e) => setWsEmail(e.target.value)} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1"><Label>Ville</Label><Input value={wsCity} onChange={(e) => setWsCity(e.target.value)} /></div>
                <div className="space-y-1"><Label>Adresse</Label><Input value={wsAddress} onChange={(e) => setWsAddress(e.target.value)} /></div>
              </div>
              <div className="space-y-1"><Label>Description</Label><Textarea value={wsDesc} onChange={(e) => setWsDesc(e.target.value)} rows={2} /></div>

              {/* Budget MAIN-D'ŒUVRE (hors matériaux) — libellé volontairement
                  explicite : comparer un budget total aux seules heures ne
                  déclencherait jamais d'alerte. Heures mises en avant car
                  toujours exploitables, même sans taux horaire renseigné. */}
              <div className="rounded-md border bg-muted/30 p-2 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span>Budget main-d&apos;œuvre — <span className="italic">facultatif</span> · alerte à 70 %, 80 % et 100 %</span>
                  <InfoTip text="Hors matériaux et sous-traitance. Le montant en € n'est juste que si tous les salariés ont un taux horaire — sinon, utilisez les heures." />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Heures prévues</Label>
                    <Input type="text" inputMode="decimal" value={wsBudgetH} onChange={(e) => setWsBudgetH(e.target.value)} placeholder="ex. 48" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Montant prévu (€)</Label>
                    <Input type="text" inputMode="decimal" value={wsBudgetE} onChange={(e) => setWsBudgetE(e.target.value)} placeholder="ex. 1500" />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button onClick={saveClientFiche} disabled={savingWs}>
                  {savingWs && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Enregistrer
                </Button>
                <Button variant="outline" onClick={() => setDocsWorksite({ ws: clientFiche, day: null })}>
                  <FileText className="h-4 w-4 mr-1" /> Documents
                </Button>
                <Button variant="outline" onClick={archiveClientFiche} disabled={wsBusy}>
                  <Archive className="h-4 w-4 mr-1" /> Archiver
                </Button>
                <Button variant="ghost" className="text-destructive" onClick={deleteClientFiche} disabled={wsBusy} title="Supprimer (seulement si aucune donnée rattachée)">
                  <Trash2 className="h-4 w-4 mr-1" /> Supprimer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ChantierDocuments
        worksiteId={docsWorksite?.ws.id || null}
        worksiteName={docsWorksite?.ws.client_name}
        workDate={docsWorksite?.day || null}
        open={!!docsWorksite}
        onOpenChange={(o) => { if (!o) setDocsWorksite(null); }}
      />

      {/* Clients list — open any client fiche */}
      {/* Panneau « Clients » fusionné dans le menu déroulant de la barre
          (recherche + clients glissables + crayon d'édition + création). */}

      {/* Nouveau client */}
      <Dialog open={clientOpen} onOpenChange={(o) => { setClientOpen(o); if (!o) resetClient(); }}>
        <DialogContent className="bt-skin max-w-md">
          <DialogHeader><DialogTitle>Nouveau client / chantier</DialogTitle></DialogHeader>
          <form onSubmit={createClient} className="space-y-3 pt-2">
            <div className="space-y-2"><Label>Nom du client *</Label><Input value={cName} onChange={(e) => setCName(e.target.value)} required disabled={cSaving} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Type de produit</Label><Input placeholder="Stores, volets…" value={cProduct} onChange={(e) => setCProduct(e.target.value)} disabled={cSaving} /></div>
              <div className="space-y-2"><Label>Téléphone</Label><Input type="tel" value={cPhone} onChange={(e) => setCPhone(e.target.value)} disabled={cSaving} /></div>
            </div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} disabled={cSaving} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Ville</Label><Input value={cCity} onChange={(e) => setCCity(e.target.value)} disabled={cSaving} /></div>
              <div className="space-y-2"><Label>Adresse</Label><Input value={cAddress} onChange={(e) => setCAddress(e.target.value)} disabled={cSaving} /></div>
            </div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={cDesc} onChange={(e) => setCDesc(e.target.value)} rows={2} disabled={cSaving} /></div>
            <Button type="submit" className="w-full" disabled={cSaving}>
              {cSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Créer le client
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Nouveau salarié */}
      <Dialog open={workerOpen} onOpenChange={(o) => { setWorkerOpen(o); if (!o) resetWorker(); }}>
        <DialogContent className="bt-skin max-w-md">
          <DialogHeader><DialogTitle>Nouveau salarié</DialogTitle></DialogHeader>
          <form onSubmit={createWorker} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Prénom *</Label><Input value={wFirst} onChange={(e) => setWFirst(e.target.value)} required disabled={wSaving} /></div>
              <div className="space-y-2"><Label>Nom *</Label><Input value={wLast} onChange={(e) => setWLast(e.target.value)} required disabled={wSaving} /></div>
            </div>
            <div className="space-y-2"><Label>Email *</Label><Input type="email" value={wEmail} onChange={(e) => setWEmail(e.target.value)} required disabled={wSaving} /></div>
            <div className="space-y-2"><Label>Téléphone</Label><Input type="tel" value={wPhone} onChange={(e) => setWPhone(e.target.value)} disabled={wSaving} /></div>
            <Button type="submit" className="w-full font-bold" disabled={wSaving}>
              {wSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Envoyer l'invitation
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
