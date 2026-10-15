'use client';

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { TimeEntry, Worksite, Planning } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Copy, AlertTriangle, FolderOpen, Trash2, Paperclip, Hammer, CheckCircle2, MapPin, Sparkles } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  addPendingEntry, getPendingEntries, removePendingEntry, updatePendingEntry, clearPendingEntriesForDate,
  generateLocalId, OFFLINE_CHANGED_EVENT, OFFLINE_SYNCED_EVENT, PendingEntry,
} from '@/lib/offline-store';
import { syncAllPending } from '@/lib/offline-sync';
import { insertWorkerEntry } from '@/lib/worker-entry';
import { planningsToMaterialise, remainingPlannings, sendablePlannings, visiblePlannings } from '@/lib/work-status';
import { copyLinesTo, materialisePlanned as materialiseDay, setDayMealOnline, submitDrafts } from '@/lib/worker-day';
import { useMealEnabled } from '@/lib/meal-setting';
import { useCompanySettings } from '@/lib/company-settings';
import { fmtHeure } from '@/lib/corrections';
import { fetchEntryEdits, lastEdit, type EntryEdit } from '@/lib/office-edits';
import { diffLabels } from '@/supabase/functions/_shared/office-edits';
import { positionUtile, fmtPrecision, fmtCoord } from '@/lib/position';
import { parisHHmm } from '@/lib/utils';
import { TimeCylinder, snapToGrid } from '@/components/time-cylinder';
import LiveTimer from '@/components/live-timer';
import { useOwnLiveSession, announceLiveChange, readOwnLiveSession, type OwnLiveSession } from '@/lib/live-session';
import { finishLiveAt } from '@/lib/live-end-at';
import { isExitToComplete, EXIT_TO_COMPLETE_MSG } from '@/lib/qr-entry';
import { bestPlanningFor, findOverlap, firstBlockingOverlap, isEmptyDraft, keptBreak, pauseAsks, spanMinutes, type PauseAsk, type PlannedState, type Span } from '@/supabase/functions/_shared/day-hours';
import { pauseError } from '@/supabase/functions/_shared/pause';
import { liveClash, parisClock, type LiveClash } from '@/supabase/functions/_shared/live-clash';
import { parseAfterScan, afterScanSpan, AFTER_SCAN_USE_MS, type AfterScanParams } from '@/supabase/functions/_shared/after-scan';
import PausePicker from '@/components/pause-picker';
import { LiveLine } from '@/components/planning-bubble';
import { placeLive, cellKey } from '@/supabase/functions/_shared/live-place';
import { ReserveLiftForm } from '@/components/reserve-lift-lazy';
import { lazyWindow } from '@/lib/lazy-window';
import type { CalendarProps } from '@/components/ui/calendar';
import { liftReserve, undoWorkerLift, liftErrorMessage, announceReservesChanged, RESERVES_CHANGED_EVENT } from '@/lib/reserve-lift';
import { fetchMyClosure } from '@/lib/worker-closure';
import { isReserveLifted } from '@/lib/reserves';
// Lot 23 : chantier terminé — plus proposé dans les listes de choix, « Terminé le … » sur ses cartes.
import TermineLe from '@/components/termine-le';
import { choosableWorksites } from '@/supabase/functions/_shared/chantier-statut';
// Design salarié, étape 4 : mini-frise de la journée (visible seulement avec ?ui=2).
import { MiniFrise, type SegFrise } from '@/components/design/salarie/mini-frise';
import { useUi2 } from '@/components/design/salarie/shell-v2';
import { etatLigne } from '@/supabase/functions/_shared/salarie-vue';
// Lot 4 : les réunions et les tâches du jour (lecture à part, rien sur les heures).
import { MyMeetings, MyTasks, useMyMissions } from '@/components/missions-worker';

// Chargés à l'ouverture, pas au premier affichage de /poseur (étape 1 du plan d'intégration du design salarié : le
// premier chargement ne porte plus ni le calendrier, ni les documents, ni « Mon équipe »). Même rendu qu'avant :
//  · « Mon équipe » : chef d'équipe seulement, donc préchauffé SEULEMENT quand il est monté (warm: 'mounted') ;
//  · les documents du chantier : fenêtre ouverte depuis la fiche (isOpen = open), préchauffée au repos ;
//  · le calendrier de « Dupliquer cette journée » (react-day-picker, ≈ 10 kB) : pas de préchauffage automatique,
//    le bouton « Dupliquer » le demande dès le doigt posé (CalendarLazy.preload) ; la fenêtre le montre dès qu'il est là.
const TeamDay = lazyWindow(() => import('@/components/team-day'), { isOpen: () => true, priority: 7, warm: 'mounted' });
const ChantierDocuments = lazyWindow(() => import('@/components/chantier-documents'), { isOpen: (p) => p.open, priority: 9 });
const CalendarLazy = lazyWindow<CalendarProps>(() => import('@/components/ui/calendar').then((m) => ({ default: m.Calendar })), { isOpen: () => true, warm: 'never' });

/** Une correction reçue du bureau, telle que la journée du salarié l'affiche. */
interface CorrectionVue {
  id: string;
  entry_id: string;
  old_start: string; old_end: string;
  new_start: string; new_end: string;
  corrected_at: string;
  /**
   * QUI A CORRIGÉ, AU SENS DU SALARIÉ : le bureau, ou son chef d'équipe.
   *
   * On lit le RÔLE, pas l'identifiant. Lire `corrected_by` et le comparer à
   * l'admin connu aurait affiché « le bureau » pour une correction faite par
   * le chef — et la notification reçue sur le téléphone, elle, disait « ton
   * chef ». Deux messages contradictoires sur la même correction, c'est
   * exactement le doute que cette étape existe pour lever.
   */
  corrected_by_role: 'admin' | 'lead';
}

/**
 * Un endroit enregistré sur MA journée (étape 26).
 *
 * Le salarié voit ce qui a été collecté sur lui, sans avoir à le demander.
 * Ce n'est pas une politesse : une donnée personnelle collectée en silence est
 * une donnée collectée illégalement, et elle ne prouverait plus rien.
 */
interface PositionVue {
  id: string;
  entry_id: string;
  moment: 'start' | 'end';
  latitude: string;
  longitude: string;
  accuracy_m: number | null;
  captured_at: string;
}

interface TimeEntryWithWorksite extends TimeEntry {
  worksite: Worksite;
}

// "h" format for the editor duration boxes (ex: 4h00).
function formatMinutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m.toString().padStart(2, '0')}`;
}
// ":" format used everywhere on « Ma journée » (ex: 6:45).
function fmtHM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}

// Worked duration of a slot (break is always 0 in the slot model).
function calculateTotalMinutes(start: string, end: string, breakMins: number): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const s = sh * 60 + sm;
  let e = eh * 60 + em;
  if (e < s) e += 24 * 60;
  return Math.max(0, e - s - breakMins);
}

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };

/**
 * Au-delà de ce trou, on ne demande plus « Route ou Pause ? ».
 *
 * CE QUI A ÉTÉ VU EN VRAI : « 5:00 entre 17:00 et 22:00 — c'était quoi ? »
 * Personne ne fait cinq heures de route entre deux chantiers. Un trou de cette
 * taille ne raconte pas un trajet ni une pause : il raconte que la journée
 * s'est arrêtée puis a repris.
 *
 * POURQUOI 2 h ET PAS 1 h 30. Une pause déjeuner de deux heures existe
 * réellement dans le bâtiment, et un trajet vers un chantier éloigné peut
 * friser les deux heures. Couper à 1 h 30 ferait disparaître la question sur
 * des trous que le salarié aurait légitimement qualifiés — et, chez une
 * entreprise qui paie le trajet, ce trajet cesserait d'être payable sans que
 * personne ne s'en aperçoive. À 2 h, on ne supprime que l'absurde.
 *
 * C'est un seuil de PRODUIT, pas une vérité : une ligne à changer si tu veux
 * 1 h 30 ou 3 h.
 *
 * CE QUE LE PLAFOND NE FAIT PAS : effacer une réponse déjà donnée. Un trou
 * qu'un salarié a qualifié reste affiché et reste compté, même au-dessus du
 * seuil. On arrête de poser des questions absurdes ; on ne réécrit pas
 * silencieusement ce qu'un humain a répondu.
 */
const GAP_ASK_MAX_MINUTES = 120;

/**
 * Le panier coché sur une journée ENCORE VIDE (lot 9).
 *
 * Le panier vit sur une ligne d'heures (`meal_allowance`, une seule par jour).
 * Sans ligne, il n'y avait rien sur quoi l'écrire : le salarié cochait, aucune
 * erreur, et la relecture suivante le décochait sans un mot. L'intention est
 * maintenant gardée (à l'écran, et sur le téléphone par commodité) et posée
 * sur la première ligne qui apparaît : « J'ai fini », « OK », envoi du prévu.
 */
const mealIntentKey = (userId: string, date: string) => `bemexo-panier-v1:${userId}:${date}`;
function readMealIntent(userId: string, date: string): boolean | null {
  try {
    const v = window.localStorage.getItem(mealIntentKey(userId, date));
    return v === '1' ? true : v === '0' ? false : null;
  } catch { return null; }
}
function writeMealIntent(userId: string, date: string, value: boolean) {
  try { window.localStorage.setItem(mealIntentKey(userId, date), value ? '1' : '0'); } catch { /* stockage indisponible : l'écran garde l'intention */ }
}
function clearMealIntent(userId: string, date: string) {
  try { window.localStorage.removeItem(mealIntentKey(userId, date)); } catch { /* rien à faire */ }
}

// Pauses = the gaps between consecutive (sorted) slots. Computed, never stored.
// Les créneaux sont replacés sur une ligne de temps absolue : une intervention
// qui franchit minuit se prolonge sur le jour suivant, exactement comme dans
// calculateTotalMinutes. Sans ça, un poste de nuit fabriquait une pause fantôme
// de plusieurs heures. On avance aussi la borne de fin au plus tard rencontré,
// pour que deux créneaux qui se chevauchent n'inventent pas de trou entre eux.
type GapSlot = { start: string; end: string; key: string; gap: 'route' | 'pause' | null };
type Gap = { start: string; end: string; minutes: number; key: string; gap: 'route' | 'pause' | null };

function computePauses(slots: GapSlot[]): Gap[] {
  const abs = slots
    .filter((s) => s.start && s.end)
    .map((s) => {
      const start = toMin(s.start);
      let end = toMin(s.end);
      if (end < start) end += 24 * 60; // franchit minuit
      return { start, end, endLabel: s.end, startLabel: s.start, key: s.key, gap: s.gap };
    })
    .sort((a, b) => a.start - b.start);

  const out: Gap[] = [];
  let prevEnd = -1;
  let prevEndLabel = '';
  for (const slot of abs) {
    if (prevEnd >= 0 && slot.start > prevEnd) {
      // `key` désigne le créneau QUI SUIT le trou : c'est sur lui que la
      // réponse « route ou pause » est enregistrée.
      out.push({ start: prevEndLabel, end: slot.startLabel, minutes: slot.start - prevEnd, key: slot.key, gap: slot.gap });
    }
    if (slot.end > prevEnd) { prevEnd = slot.end; prevEndLabel = slot.endLabel; }
  }
  return out;
}

/**
 * Même contenu ? (lot 10) Les relectures automatiques (chrono, retour sur
 * l'onglet) rendent presque toujours les mêmes lignes : on garde alors l'objet
 * déjà affiché, React n'a rien à redessiner. Données JSON simples (Supabase) ;
 * les Map sont comparées par leurs entrées.
 */
function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const plain = (v: unknown) => (v instanceof Map ? Array.from(v.entries()) : v);
  try { return JSON.stringify(plain(a)) === JSON.stringify(plain(b)); } catch { return false; }
}
/** `setX(keep(next))` : garde l'état précédent s'il est identique (aucun rendu pour rien). */
const keep = <T,>(next: T) => (prev: T): T => (sameData(prev, next) ? prev : next);

// ─── main ──────────────────────────────────────────────────────────────────────

type SlotTarget =
  | { kind: 'planned'; planningId: string }
  | { kind: 'entry'; entryId: string }
  | { kind: 'pending'; localId: string }
  | { kind: 'new' };

/** Lot 10 : l'intervention saisie chevauche le pointage EN COURS (fenêtre d'alerte). */
type LiveAsk = {
  span: { start: string; end: string };   // HH:MM
  liveStart: string;                       // HH:MM Paris du début du chrono
  startedAt: string;                       // started_at ISO du chrono vu à l'ouverture
  workDate: string;                        // work_date du chrono (AAAA-MM-JJ)
  now: string;                             // HH:MM Paris à l'ouverture (texte « Il est … »)
  result: Exclude<LiveClash, null>;
  action: 'add' | 'update';                // 'update' = openSlot.kind 'entry' ou 'pending'
};

/**
 * Lot 10 : le raccourci touché sur /pointer, lu dans l'adresse puis effacée.
 * Variable de MODULE : elle survit au remontage de la journée (`key={dayKey}`).
 * Remise à null dès qu'elle est prise, quelle que soit la suite.
 */
let afterScanPending: (AfterScanParams & { readAt: number }) | null = null;

/** Messages longs sur un état à vérifier (pointage fermé ou incertain) : ils restent le temps de les lire. */
const LONG_TOAST = { duration: 10000 } as const;

/** Relit le chrono du salarié ; `undefined` si la lecture échoue ou dépasse `ms` (jamais « aucun chrono »). */
async function readLiveWithin(userId: string, ms: number): Promise<OwnLiveSession | null | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), ms); });
  try {
    return await Promise.race([readOwnLiveSession(userId), slow]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export default function PoseurDay({ date: dateProp, topBanner, onAssistant }: { date?: string; topBanner?: ReactNode; /** Lot 6 : bouton ✨ dans la barre (si l'assistant est activé). */ onAssistant?: () => void } = {}) {
  const ui2 = useUi2();
  const { user } = useAuth();
  const [entries, setEntries] = useState<TimeEntryWithWorksite[]>([]);
  // Ce que le bureau (ou le chef) a corrigé sur MES heures. Le salarié doit le
  // voir sur sa journée, même s'il n'a pas activé les notifications — une
  // correction qu'on ne découvre qu'en fin de mois est un litige en préparation.
  const [mesCorrections, setMesCorrections] = useState<Map<string, CorrectionVue[]>>(new Map());
  // Lot 2 : les gestes du bureau AVEC MOTIF (corrections, renvoi de la journée).
  // Vide tant que la migration n'est pas passée : rien ne s'affiche de plus.
  const [mesRetouches, setMesRetouches] = useState<Map<string, EntryEdit[]>>(new Map());
  // Les endroits enregistrés sur mes journées (étape 26). Vide tant que
  // l'entreprise n'a pas activé le réglage — et c'est le cas par défaut.
  const [mesPositions, setMesPositions] = useState<Map<string, PositionVue[]>>(new Map());
  const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([]);
  const [worksites, setWorksites] = useState<Worksite[]>([]);
  const [docsByWorksite, setDocsByWorksite] = useState<Map<string, number>>(new Map()); // nb de documents par chantier (pastille 📎)
  const [planning, setPlanning] = useState<(Planning & { worksite: Worksite })[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Day-level panier repas (one per day).
  const [dayMeal, setDayMeal] = useState(false);

  // Inline slot editor
  const [openSlot, setOpenSlot] = useState<SlotTarget | null>(null);
  const [fStart, setFStart] = useState('');
  const [fEnd, setFEnd] = useState('');
  const [fObs, setFObs] = useState('');
  // Lot 1 : la pause de la ligne (minutes), gardée quand on corrige les heures.
  const [fBreak, setFBreak] = useState(0);
  // Lot 3bis : « Autre » illisible, ou pause plus longue que la ligne → OK refusé (plus de remise à 0 en silence).
  const [fPauseErr, setFPauseErr] = useState<string | null>(null);
  // Une fiche ouverte = un sélecteur neuf (rien de tapé dans « Autre » ne passe d'une ligne à l'autre).
  const [fOpenSeq, setFOpenSeq] = useState(0);
  const [fReception, setFReception] = useState<'sans' | 'avec' | 'en_cours' | ''>(''); // statut du chantier : en cours / sans / avec réserve (facultatif)
  const [fSaving, setFSaving] = useState(false);
  // Les heures telles qu'elles étaient à l'ouverture de la fiche (lot 9). Une
  // ligne pointée à la minute (08:07–16:52) ne doit pas revenir 08:00–16:45
  // parce qu'on l'a ouverte puis validée : on n'envoie que ce qui a changé.
  const [fInit, setFInit] = useState<{ start: string; end: string } | null>(null);
  // Chantier picker. « Autre » choisi, le salarié peut dire de quoi il s'agit :
  // le nom qu'il tape devient un vrai chantier de l'entreprise (la policy
  // worksites_worker_insert_own_company l'autorise depuis l'étape 2). Laissé
  // vide, on reste sur « Autre » — un nom qui manque ne retient pas des heures.
  const [fWorksiteId, setFWorksiteId] = useState('');
  const [nomLibre, setNomLibre] = useState('');
  const [villeLibre, setVilleLibre] = useState('');
  const [creationChantier, setCreationChantier] = useState(false);
  const [chantierQuery, setChantierQuery] = useState(''); // recherche dans la liste des chantiers (nouvelle intervention)
  // Tiroir molette (purement présentation : quelle roue on règle)
  const [drawerField, setDrawerField] = useState<'start' | 'end' | null>(null);
  // Lot 1 : deux sortes de pause. Un TROU entre deux lignes (computePauses,
  // « Route » ou « Pause ») ; et une pause DANS une ligne (break_minutes),
  // choisie dans la fiche ou demandée à l'envoi après 6 h d'affilée. Avant,
  // break_minutes était remis à 0 à chaque enregistrement : une journée
  // 07:00–18:00 comptait 11 h, pause jamais demandée ni déduite.

  // Coherence confirmation
  const [confirmOpen, setConfirmOpen] = useState(false);
  // « Tu as pris une pause ? » — la plage de plus de 6 h et la ligne qui reçoit la réponse.
  const [pauseAsk, setPauseAsk] = useState<PauseAsk | null>(null);
  // Lot 1 : « Le bureau avait prévu… tu l'as fait ? » avant d'envoyer du prévu.
  const [plannedAsk, setPlannedAsk] = useState(false);
  // Lot 10 : l'intervention saisie recouvre le pointage en cours ; et « Envoyer ma
  // journée » venu du raccourci de /pointer (toujours confirmé avant d'envoyer).
  const [liveAsk, setLiveAsk] = useState<LiveAsk | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);
  const liveBusyRef = useRef(false);          // verrou SYNCHRONE (deux touchers rapides)
  // Le focus d'ouverture des deux fenêtres va au choix SANS conséquence : une touche Entrée ne ferme jamais le pointage ni n'envoie la journée.
  const liveFixRef = useRef<HTMLButtonElement>(null);
  const sendNoRef = useRef<HTMLButtonElement>(null);
  const slotBusyRef = useRef(false);          // verrou de la relecture du chrono dans saveSlot
  const openSlotRef = useRef<SlotTarget | null>(null);  // la fiche ouverte à ce rendu : saveSlot vérifie qu'elle n'a pas été fermée pendant la relecture
  const skipLiveRef = useRef(false);          // vrai pendant le saveSlot qui suit la fermeture
  const finishMissingRef = useRef(false);     // finish_active_session absente, constaté
  const saveSlotRef = useRef<() => Promise<void>>(async () => {});  // réaffecté à chaque rendu
  const loadedRef = useRef(false);            // la journée a été chargée au moins une fois sans erreur
  const [sendAsk, setSendAsk] = useState(false);
  // Réponses de l'envoi en cours : prévu confirmé, pauses posées (sur une ligne ou un prévu).
  const sendCtx = useRef<{ plannedOk: boolean; breaks: Map<string, number>; asked: Set<string> }>({ plannedOk: false, breaks: new Map(), asked: new Set() });
  const [coherenceWarnings, setCoherenceWarnings] = useState<string[]>([]);

  // Copy-yesterday
  const [copyingYesterday, setCopyingYesterday] = useState(false);

  // Repeat this day onto other days (same chantier for several days).
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyDates, setCopyDates] = useState<Date[]>([]);
  // A sent day is frozen; every change re-asks for confirmation (secretary informed).
  const [confirmCorrectOpen, setConfirmCorrectOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [lateOpen, setLateOpen] = useState(false);
  // Panneau Documents du chantier (photos/fichiers, consultable côté secrétaire aussi).
  // Le panneau Documents garde le contexte du moment où il a été ouvert :
  // l'éditeur d'intervention peut se refermer derrière lui, la pièce doit
  // rester rattachée à l'intervention depuis laquelle on l'a prise.
  const [docsWs, setDocsWs] = useState<{ id: string; name: string; entryId: string | null } | null>(null);
  // Lot 11 : la carte dont le formulaire « Lever la réserve » est ouvert.
  const [liftingId, setLiftingId] = useState<string | null>(null);
  // Suppression d'une intervention : jamais sans confirmation (gant de chantier,
  // écran mouillé — un appui involontaire ne doit pas effacer une demi-journée).
  const [confirmDel, setConfirmDel] = useState<
    | { kind: 'entry'; entry: TimeEntryWithWorksite; sent: boolean }
    | { kind: 'pending'; localId: string }
    | null
  >(null);

  // « Ma journée » ne bascule pas au lendemain au beau milieu d'une saisie (la
  // date était recalculée à chaque rendu → heures enregistrées sur le mauvais
  // jour). Mais une appli laissée ouverte toute la nuit doit bien repasser sur
  // le nouveau jour : on rafraîchit au retour au premier plan et chaque minute,
  // seulement quand aucune fiche n'est ouverte.
  const [mountedToday, setMountedToday] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const date = dateProp || mountedToday;
  const editingOpen = openSlot !== null;
  // Lot 4 : mes réunions et mes tâches du jour. Lecture séparée de fetchData,
  // relue au retour sur l'appli ; vide (rien d'affiché) tant que la migration
  // n'est pas passée. Ne touche ni aux totaux, ni à l'envoi, ni au hors-ligne.
  const missions = useMyMissions(user, date);
  useEffect(() => {
    if (dateProp) return;
    const refresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const today = format(new Date(), 'yyyy-MM-dd');
      setMountedToday((prev) => (prev === today || editingOpen ? prev : today));
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    const id = window.setInterval(refresh, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      window.clearInterval(id);
    };
  }, [dateProp, editingOpen]);
  const yesterday = format(subDays(new Date(`${date}T00:00:00`), 1), 'yyyy-MM-dd');
  // Payroll cutoff: a day in a past month is locked — corrections go through the secretary.
  // Mois clos : c'est le bureau qui le décide, pas le calendrier. Avant, tout
  // mois passé était déclaré « clôturé » sur le téléphone alors que personne
  // n'avait rien clôturé et que la base laissait écrire.
  const [closedMonths, setClosedMonths] = useState<Set<string>>(new Set());
  // Lot 11 : « Clôturer jusqu'au… » — le bureau peut clôturer les heures d'UN
  // salarié (fin de contrat en cours de mois). Même effet à l'écran qu'un mois
  // clôturé, jusqu'à cette date incluse. null = aucune clôture (ou table pas
  // encore créée : tout se comporte comme avant).
  const [closedUntil, setClosedUntil] = useState<string | null>(null);
  // Lot 10 : les deux lectures de clôture ont répondu (même vides). Le raccourci venu de
  // /pointer attend ce moment : avant, `monthLocked` vaut faux et la fiche s'ouvrirait sur une journée fermée.
  const [monthsRead, setMonthsRead] = useState(false);
  const [mineRead, setMineRead] = useState(false);
  const closuresRead = monthsRead && mineRead;
  const [closuresLate, setClosuresLate] = useState(false);   // repli : lecture trop lente, le raccourci ne l'attend plus
  const userLocked = !!closedUntil && date <= closedUntil;
  const monthLocked = closedMonths.has(date.slice(0, 7)) || userLocked;
  const closedUntilLabel = closedUntil ? format(new Date(`${closedUntil}T12:00:00`), 'd MMMM', { locale: fr }) : '';

  /**
   * Met un refus du serveur en français de chantier.
   *
   * Les gardes posés en base parlent technique (« time_entries: le mois est
   * clôturé… »). Sans ça le salarié voyait « Impossible d'enregistrer » et ne
   * savait ni pourquoi, ni quoi faire. Le cas le plus fréquent : le bureau a
   * clôturé le mois pendant que l'application était ouverte.
   */
  const explainWriteError = (err: unknown, fallback: string): string => {
    const msg = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err ?? '');
    // Clôture de CE salarié (« … clôturées par le bureau jusqu'au 2026-10-15 ») :
    // testée AVANT celle du mois — le message contient aussi « clôturé », et
    // fermer tout le mois à l'écran serait faux.
    if (/jusqu/i.test(msg) && /clôtur/i.test(msg)) {
      const m = /(\d{4})-(\d{2})-(\d{2})/.exec(msg);
      const fr2 = !m ? /(\d{2})\/(\d{2})\/(\d{4})/.exec(msg) : null;
      const until = m ? `${m[1]}-${m[2]}-${m[3]}` : fr2 ? `${fr2[3]}-${fr2[2]}-${fr2[1]}` : null;
      if (until) setClosedUntil((prev) => (prev && prev >= until ? prev : until));
      else if (user?.id) fetchMyClosure(user.id).then((d) => { if (d) setClosedUntil(d); });
      const label = until ? format(new Date(`${until}T12:00:00`), 'd MMMM', { locale: fr }) : closedUntilLabel;
      return `Le bureau a clôturé tes heures${label ? ` jusqu'au ${label}` : ''}. Rapproche-toi de la secrétaire.`;
    }
    if (msg.includes('clôturé')) {
      setClosedMonths((prev) => new Set(prev).add(date.slice(0, 7)));
      return 'Le bureau vient de clôturer ce mois. Rapproche-toi de la secrétaire.';
    }
    if (msg.includes('ne redevient pas brouillon')) return 'Journée déjà envoyée : tu peux la corriger ou la retirer.';
    // Lot 2 : des heures envoyées une fois (même renvoyées par le bureau) ne s'effacent plus.
    if (msg.includes('se retirent')) return 'Ces heures ont déjà été envoyées : retire-les plutôt.';
    if (msg.includes('ne se réactive pas')) return 'Ce chantier a été retiré : ajoute-le à nouveau.';
    if (msg.includes('chantier hors de votre entreprise')) return "Ce chantier n'existe plus dans ton entreprise. Choisis-en un autre.";
    return fallback;
  };

  // Mois clôturés de l'entreprise. Lecture seule pour le salarié : il doit
  // savoir pourquoi c'est fermé plutôt que de se heurter à un refus muet.
  useEffect(() => {
    if (!user?.company_id) return;
    let stale = false;
    supabase.from('month_closures').select('month').eq('company_id', user.company_id)
      .then(({ data }) => {
        if (stale) return;
        setMonthsRead(true);
        if (data) setClosedMonths(new Set((data as { month: string }[]).map((m) => m.month.slice(0, 7))));
      });
    return () => { stale = true; };
  }, [user?.company_id]);

  // Ma clôture à moi (lot 11), lue une fois, comme les mois clôturés.
  useEffect(() => {
    if (!user?.id) return;
    let stale = false;
    fetchMyClosure(user.id).then((d) => { if (!stale) { setClosedUntil(d); setMineRead(true); } });
    return () => { stale = true; };
  }, [user?.id]);

  // Réglages de l'entreprise : UNE lecture partagée par tout l'écran (lot 29, lib/company-settings.ts).
  // Avant, cet écran relisait la ligne `companies` deux fois à chaque affichage de « Ma journée ».
  const cs = useCompanySettings(user?.company_id);
  // Le temps de route est-il payé ? Réglage de l'entreprise, pas du logiciel.
  const travelPaid = !!cs?.travelPaid;

  // Lot 3 bis : l'entreprise utilise-t-elle le panier repas ? Lecture À PART
  // (lib/meal-setting.ts). « Non » explicite : la case disparaît et l'écran
  // n'écrit plus jamais `meal_allowance` (ni pose, ni retrait, ni déplacement
  // d'un panier resté). Null (pas encore lu) : comme avant.
  const meal = useMealEnabled(user?.company_id);

  /**
   * L'entreprise enregistre-t-elle l'endroit au pointage ? (étape 26)
   *
   * Lu avec les autres réglages (lib/company-settings.ts), dont la lecture REPLIE sur de petits
   * groupes si une colonne manque : un réglage neuf ne peut pas casser un réglage qui marche
   * (`travel_paid` reste lu même si `position_tracking_enabled` n'existe pas encore).
   */
  const positionActive = !!cs?.positionTrackingEnabled;

  // L'ÉCRAN PLEIN ÉCRAN D'INFORMATION A ÉTÉ RETIRÉ (étape 28). Un mur noir
  // avant de pouvoir pointer faisait peur et freinait, pour une obligation qui
  // se tient très bien en une phrase à l'endroit du pointage plus le détail
  // dans la politique de confidentialité. `positionActive` redevient la seule
  // condition côté écran, comme `position_tracking_enabled` l'est côté base.

  // ─── Fetch server data ─────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const [entriesRes, worksitesRes, planningRes, docsRes] = await Promise.all([
        supabase.from('time_entries').select('*, worksite:worksites(*)').eq('user_id', user.id).eq('work_date', date).order('start_time'),
        supabase.from('worksites').select('*').eq('company_id', user.company_id).eq('is_active', true).order('client_name'),
        supabase.from('planning').select('*, worksite:worksites(*)').eq('user_id', user.id).eq('work_date', date),
        supabase.from('documents').select('worksite_id').eq('company_id', user.company_id),
      ]);
      if (entriesRes.error) throw entriesRes.error;
      if (worksitesRes.error) throw worksitesRes.error;
      if (planningRes.error) throw planningRes.error;

      const docCounts = new Map<string, number>();
      for (const d of (docsRes.data || []) as { worksite_id: string | null }[]) {
        if (d.worksite_id) docCounts.set(d.worksite_id, (docCounts.get(d.worksite_id) || 0) + 1);
      }
      setDocsByWorksite(keep(docCounts));

      let worksitesData = worksitesRes.data || [];
      // Filet de sécurité (règle d'or : l'heure n'est jamais bloquée par le client) :
      // le chantier « Autre / Client inconnu » doit TOUJOURS exister. S'il manque,
      // on le (re)crée côté serveur (idempotent) puis on recharge la liste.
      if (!worksitesData.some((w) => w.client_name === 'Autre')) {
        await supabase.rpc('ensure_other_worksite');
        const reload = await supabase.from('worksites').select('*').eq('company_id', user.company_id).eq('is_active', true).order('client_name');
        if (!reload.error && reload.data) worksitesData = reload.data;
      }

      setEntries(keep<TimeEntryWithWorksite[]>(entriesRes.data || []));

      // Les corrections des lignes du jour, le journal du bureau et les endroits enregistrés :
      // trois lectures qui ne dépendent que des lignes du jour (lot 29 : EN PARALLÈLE, un seul
      // aller-retour au lieu de trois à la file).
      const idsDuJour = ((entriesRes.data || []) as TimeEntryWithWorksite[]).map((e) => e.id);
      if (idsDuJour.length > 0) {
        const [{ data: corr }, ret, { data: pos }] = await Promise.all([
          // La RLS ne me montre que les miennes : pas besoin de filtrer par salarié ici.
          supabase.from('time_entry_corrections')
            .select('id, entry_id, old_start, old_end, new_start, new_end, corrected_at, corrected_by_role')
            .in('entry_id', idsDuJour)
            .order('corrected_at', { ascending: true }),
          // Lot 2 : le journal du bureau (motifs, renvoi). Requête à part, erreurs
          // ignorées : table absente → carte et journée exactement comme avant.
          fetchEntryEdits(supabase as never, idsDuJour),
          // Requête à part : tant que la table n'existe pas, celle-ci échoue
          // seule, la carte reste vide, et la journée s'affiche normalement.
          supabase.from('time_entry_positions')
            .select('id, entry_id, moment, latitude, longitude, accuracy_m, captured_at')
            .in('entry_id', idsDuJour),
        ]);
        const m = new Map<string, CorrectionVue[]>();
        for (const c of (corr || []) as CorrectionVue[]) {
          const l = m.get(c.entry_id) || [];
          l.push(c);
          m.set(c.entry_id, l);
        }
        setMesCorrections(keep(m));
        setMesRetouches(keep(ret.byEntry));
        const mp = new Map<string, PositionVue[]>();
        for (const p of (pos || []) as PositionVue[]) {
          const l = mp.get(p.entry_id) || [];
          l.push(p);
          mp.set(p.entry_id, l);
        }
        setMesPositions(keep(mp));
      } else {
        setMesCorrections(keep(new Map<string, CorrectionVue[]>()));
        setMesRetouches(keep(new Map<string, EntryEdit[]>()));
        setMesPositions(keep(new Map<string, PositionVue[]>()));
      }
      setWorksites(keep<Worksite[]>(worksitesData));
      setPlanning(keep<(Planning & { worksite: Worksite })[]>(planningRes.data || []));

      const pendForToday = getPendingEntries(user.id).filter((e) => e.work_date === date);
      const serverMeal = (entriesRes.data || []).some((e: TimeEntryWithWorksite) => e.meal_allowance) || pendForToday.some((e) => e.meal_allowance);
      // Un panier coché sur une journée vide reste coché à l'écran : il sera
      // posé sur la première ligne (effet plus bas), jamais décoché en silence.
      const intent = readMealIntent(user.id, date);
      setDayMeal(intent ?? serverMeal);
      loadedRef.current = true;
    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error('Impossible de charger tes données');
    } finally {
      setLoading(false);
    }
  }, [user, date]);

  /**
   * Le salarié dit ce qu'était le trou : route entre deux chantiers, ou pause.
   * Enregistré sur l'intervention QUI SUIT le trou. Tant qu'il n'a pas répondu,
   * rien n'est compté comme travail — on ne décide pas à sa place.
   */
  const setGapKind = async (key: string, kind: 'route' | 'pause') => {
    if (!user) return;
    const [sort, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    try {
      if (sort === 'pe') {
        const pend = getPendingEntries(user.id).find((e) => e.localId === id);
        if (!pend) return;
        removePendingEntry(user.id, id);
        addPendingEntry(user.id, { ...pend, gap_before: kind });
        setPendingEntries(getPendingEntries(user.id).filter((e) => e.work_date === date));
        return;
      }
      const { data: upd, error } = await supabase.from('time_entries')
        .update({ gap_before: kind }).eq('id', id).eq('user_id', user.id).select('id');
      if (error) throw error;
      if (!upd || upd.length === 0) { toast.error('Journée verrouillée : impossible de changer.'); return; }
      fetchData();
    } catch (err) {
      console.error('Error setting gap kind:', err);
      toast.error(explainWriteError(err, 'Impossible de garder ta réponse'));
    }
  };

  /**
   * Répondre reste possible après l'envoi de la journée.
   *
   * Sinon une journée envoyée avant d'avoir répondu gardait la question
   * affichée sans moyen d'y répondre, et la route déjà faite ne pouvait plus
   * entrer dans la paie. Sur une journée envoyée, ça passe par la même
   * confirmation qu'un changement d'horaire — la secrétaire voit la retouche.
   */
  const askGapKind = (key: string, kind: 'route' | 'pause') => {
    if (frozen) { askCorrect(() => setGapKind(key, kind)); return; }
    setGapKind(key, kind);
  };

  // ─── Envoi des saisies faites sans réseau ─────────────────────────────────
  // L'envoi lui-même est dans lib/offline-sync.ts et porte sur TOUS les jours en
  // attente, pas seulement celui affiché : une journée saisie lundi sans réseau
  // ne partait autrefois que si le salarié rouvrait ce lundi-là.

  const syncPendingEntries = useCallback(async () => {
    if (!user || !navigator.onLine) return;
    if (getPendingEntries(user.id).length === 0) return;

    setSyncing(true);
    const { synced, blocked } = await syncAllPending(user.id);
    setSyncing(false);

    setPendingEntries(keep(getPendingEntries(user.id).filter((e) => e.work_date === date)));
    if (blocked.length > 0) {
      const jours = Array.from(new Set(blocked.map((b) => b.work_date.split('-').reverse().join('/')))).join(', ');
      toast.error(`${blocked.length} chantier${blocked.length > 1 ? 's' : ''} du ${jours} ne part${blocked.length > 1 ? 'ent' : ''} pas. Préviens le bureau.`, { duration: 10000 });
    }
    if (synced > 0) {
      toast.success(`${synced} chantier${synced > 1 ? 's' : ''} envoyé${synced > 1 ? 's' : ''}`);
      fetchData();
    }
  }, [user, date, fetchData]);

  // ─── Online / offline listeners ───────────────────────────────────────────

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => { setIsOnline(true); syncPendingEntries(); };
    const handleOffline = () => setIsOnline(false);
    // La synchronisation peut partir d'ailleurs (le compte à rebours de la page
    // salarié, le retour au premier plan). Sans ces deux écoutes, la carte
    // « en attente » restait affichée et comptée alors que la ligne était déjà
    // partie, et le bouton d'envoi ne faisait plus rien.
    const handleChanged = () => {
      if (!user) return;
      setPendingEntries(keep(getPendingEntries(user.id).filter((e) => e.work_date === date)));
    };
    const handleSynced = () => { handleChanged(); fetchData(); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener(OFFLINE_CHANGED_EVENT, handleChanged);
    window.addEventListener(OFFLINE_SYNCED_EVENT, handleSynced);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener(OFFLINE_CHANGED_EVENT, handleChanged);
      window.removeEventListener(OFFLINE_SYNCED_EVENT, handleSynced);
    };
  }, [syncPendingEntries, user, date, fetchData]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Le chrono du salarié, tenu à jour sans recharger (lot 9) : toutes les
  // 30 s, au retour au premier plan, et quand un autre écran annonce un
  // changement. Fermé ailleurs (borne, tablette, Assistant) → la journée est
  // relue : la ligne créée par la fermeture y apparaît.
  const live = useOwnLiveSession(user?.id, () => { fetchData(); });
  // Le total du jour compte aussi le chrono en cours (affichage seul, rien
  // n'est écrit) : sans ça, « 0:00 travaillées » pendant toute la journée
  // pointée. Recalculé chaque minute, et tout de suite au début du chrono.
  const liveStartedAt = live.session?.started_at ?? null;
  const [liveNow, setLiveNow] = useState(() => Date.now());
  useEffect(() => {
    if (!liveStartedAt) return;
    setLiveNow(Date.now());
    const id = window.setInterval(() => setLiveNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [liveStartedAt]);

  useEffect(() => {
    if (user) {
      const pending = getPendingEntries(user.id).filter((e) => e.work_date === date);
      setPendingEntries(keep(pending));
      if (navigator.onLine && pending.length > 0) syncPendingEntries();
    }
  }, [user, date, syncPendingEntries]);

  // Reset the editor sub-state when the editor closes.
  useEffect(() => {
    if (!openSlot) setDrawerField(null);
  }, [openSlot]);

  // ─── Bouton « retour » du téléphone ─────────────────────────────────────────
  // En PWA installée, le geste retour d'Android quitte l'application si personne
  // ne consomme l'événement : le salarié se retrouve éjecté au lieu de refermer
  // son écran. On empile une entrée d'historique tant qu'une couche est ouverte
  // et on referme celle du dessus à chaque retour.
  const anyLayerOpen = !!(openSlot || drawerField || docsWs || confirmDel || confirmOpen || confirmCorrectOpen || lateOpen || repeatOpen || liveAsk || sendAsk);
  const [histTick, setHistTick] = useState(0);
  const closeTopLayer = useRef<() => void>(() => {});
  // Réassigné après chaque rendu, de la couche la plus haute à la plus basse.
  useEffect(() => {
    closeTopLayer.current = () => {
      if (sendAsk) { setSendAsk(false); return; }
      if (liveAsk) { if (!liveBusyRef.current) setLiveAsk(null); return; }
      if (drawerField) { setDrawerField(null); return; }
      if (confirmDel) { setConfirmDel(null); return; }
      if (confirmOpen) { setConfirmOpen(false); return; }
      if (confirmCorrectOpen) { setConfirmCorrectOpen(false); setPendingAction(null); return; }
      if (lateOpen) { setLateOpen(false); return; }
      if (repeatOpen) { setRepeatOpen(false); return; }
      if (docsWs) { setDocsWs(null); return; }
      if (openSlot) { setOpenSlot(null); }
    };
  });

  useEffect(() => {
    if (!anyLayerOpen || typeof window === 'undefined') return;
    let consumed = false;
    // On hérite de l'état posé par Next (marqueur __NA + arbre) : une entrée
    // sans ce marqueur ferait recharger toute la page si le navigateur y revenait.
    window.history.pushState({ ...(window.history.state || {}), btLayer: true }, '');
    const onPop = () => { consumed = true; closeTopLayer.current(); setHistTick((t) => t + 1); };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Refermé depuis l'interface : on retire l'entrée qu'on avait empilée,
      // sinon le prochain retour ne ferait rien de visible. On ne le fait que si
      // cette entrée est toujours la courante : si l'utilisateur a quitté /poseur
      // entre-temps (déconnexion…), on ne doit surtout pas le renvoyer en arrière.
      if (!consumed && (window.history.state as { btLayer?: boolean } | null)?.btLayer) window.history.back();
    };
  }, [anyLayerOpen, histTick]);

  // ─── Day meal: keep exactly one flagged row per day (no migration) ──────────

  // Renvoie false si le panier n'a pas pu être écrit (ligne verrouillée, réseau…).
  const applyDayMeal = useCallback(async (value: boolean, flagModified = false): Promise<boolean> => {
    if (!user) return false;
    if (meal === false) return true; // lot 3 bis : panier non utilisé → rien n'est écrit
    let ok = true;
    // En ligne : lib/worker-day.ts (même chemin que l'Assistant BEMEXO).
    if (navigator.onLine) ok = await setDayMealOnline(user, date, value, flagModified);
    const pend = getPendingEntries(user.id).filter((e) => e.work_date === date);
    if (pend.length > 0) {
      const sorted = [...pend].sort((a, b) => a.start_time.localeCompare(b.start_time));
      clearPendingEntriesForDate(user.id, date);
      sorted.forEach((e, i) => addPendingEntry(user.id, { ...e, meal_allowance: i === 0 ? value : false }));
      setPendingEntries(getPendingEntries(user.id).filter((e) => e.work_date === date));
    }
    return ok;
  }, [user, date, meal]);

  const toggleDayMeal = async (value: boolean, flagModified = false) => {
    if (!user || meal === false) return;
    setDayMeal(value);
    // Journée encore vide : rien sur quoi écrire. On GARDE l'intention, posée
    // sur la première ligne qui apparaîtra (effet ci-dessous) — jamais perdue.
    const writable = liveEntries.some((e) => !e.locked && !e.exported_at) || pendingEntries.length > 0;
    if (!writable) {
      writeMealIntent(user.id, date, value);
      toast.message(value ? 'Panier noté — il sera compté avec ta première ligne d’heures.' : 'Panier retiré.');
      return;
    }
    clearMealIntent(user.id, date);
    try {
      const ok = await applyDayMeal(value, flagModified);
      if (!ok) {
        setDayMeal(!value);
        toast.error("Panier non pris en compte (journée verrouillée ou hors-ligne)");
      }
      if (navigator.onLine) fetchData();
    } catch (err) {
      console.error('Error setting meal:', err);
      setDayMeal(!value);
      toast.error('Panier non pris en compte');
    }
  };

  // La première ligne du jour vient d'apparaître (« J'ai fini », « OK », envoi
  // du prévu, borne…) et un panier attendait : on le pose, UNE fois. Échec →
  // on le dit (journée verrouillée) plutôt que de le décocher en silence.
  useEffect(() => {
    // Lot 3 bis : seulement une fois le « oui » connu. Une intention restée d'avant
    // le réglage n'est ni posée ni effacée (gardée par jour, sans effet).
    if (!user || loading || meal !== true) return;
    const intent = readMealIntent(user.id, date);
    if (intent === null) return;
    // Seulement les lignes DE CE JOUR : juste après un changement de jour,
    // l'état contient encore celles du jour précédent (l'intention serait
    // effacée ou appliquée à tort).
    const vivantes = entries.filter((e) => e.work_date === date && e.status !== 'cancelled');
    const pend = pendingEntries.filter((e) => e.work_date === date);
    if (!vivantes.some((e) => !e.locked && !e.exported_at) && pend.length === 0) return;
    clearMealIntent(user.id, date);
    const actuel = vivantes.some((e) => e.meal_allowance) || pend.some((e) => e.meal_allowance);
    if (actuel === intent) { setDayMeal(intent); return; }
    applyDayMeal(intent).then((ok) => {
      if (!ok) toast.error('Panier non pris en compte (journée verrouillée ou hors-ligne)');
      else setDayMeal(intent);
      if (navigator.onLine) fetchData();
    }).catch(() => { toast.error('Panier non pris en compte'); });
  }, [user, date, loading, meal, entries, pendingEntries, applyDayMeal, fetchData]);

  // ─── Inline editor open / save / delete ─────────────────────────────────────

  // L'ARRONDI NE PÉNALISE JAMAIS (lot 9). Les fiches s'ouvrent sur l'heure
  // ENREGISTRÉE, à la minute — plus de `snapToGrid` à l'ouverture. Avant, une
  // ligne pointée 08:07–16:52, simplement ouverte puis validée, repartait en
  // 08:00–16:45 : un quart d'heure perdu sans que personne n'ait rien changé.
  // La molette n'affiche que les quarts d'heure ; l'heure exacte est rappelée
  // dessous, et elle ne bouge que si on tourne la molette.
  const setTimes = (start: string, end: string) => { setFStart(start); setFEnd(end); setFInit({ start, end }); setFOpenSeq((n) => n + 1); };
  const openPlanned = (p: Planning & { worksite: Worksite }) => {
    if (monthLocked) { setLateOpen(true); return; }
    setOpenSlot({ kind: 'planned', planningId: p.id });
    setTimes(p.estimated_start ? p.estimated_start.substring(0, 5) : '08:00', p.estimated_end ? p.estimated_end.substring(0, 5) : '17:00');
    setFObs('');
    setFReception('');
    setFBreak(0);
  };
  const openEntry = (e: TimeEntryWithWorksite) => {
    setOpenSlot({ kind: 'entry', entryId: e.id });
    setTimes(e.start_time?.substring(0, 5) || '08:00', e.end_time?.substring(0, 5) || '17:00');
    setFObs(e.observation || '');
    setFReception(e.reception || '');
    setFBreak(e.break_minutes || 0);
  };
  const openPending = (e: PendingEntry) => {
    setOpenSlot({ kind: 'pending', localId: e.localId });
    setTimes(e.start_time.substring(0, 5), e.end_time.substring(0, 5));
    setFObs(e.observation || '');
    setFReception(e.reception || '');
    setFBreak(e.break_minutes || 0);
  };
  const openNew = () => {
    if (monthLocked) { setLateOpen(true); return; }
    setOpenSlot({ kind: 'new' });
    setFBreak(0);
    setFOpenSeq((n) => n + 1);
    setFWorksiteId('');
    setChantierQuery('');
    // Heure de début pré-remplie à MAINTENANT (heure de Paris) ; fin = début + 1 h
    // (durée 1 h par défaut). Le salarié peut changer début ET fin aussitôt OU après
    // coup (ces possibilités existent déjà et restent inchangées). On ne touche à rien
    // d'autre dans la gestion des heures.
    const rawParis = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    let startParis = snapToGrid(rawParis);
    // Fin de soirée : 23:53 s'arrondit à 00:00, ce qui serait le début du jour →
    // on le ramène à 23:45. La fin reste « début + 1 h », quitte à franchir
    // minuit : une intervention qui déborde sur le lendemain est gérée (durée
    // calculée sur une ligne de temps absolue, comme les pauses de nuit).
    if (rawParis >= '23:00' && startParis === '00:00') startParis = '23:45';
    const [sh, sm] = startParis.split(':').map(Number);
    const endMin = (sh * 60 + sm + 60) % (24 * 60);
    const endParis = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
    setFStart(startParis);
    setFEnd(endParis);
    setFInit(null);
    setFObs('');
    setFReception('');
  };
  const cancelSlot = () => { setDrawerField(null); setOpenSlot(null); };

  // On a sent (frozen) day, any touch — edit a sent entry OR declare a remaining
  // chantier OR the meal — goes through this confirm, then unlocks the day.
  const askCorrect = (action: (() => void) | null) => { setPendingAction(() => action); setConfirmCorrectOpen(true); };
  const confirmCorrect = () => {
    setConfirmCorrectOpen(false);
    const action = pendingAction;
    setPendingAction(null);
    action?.();
  };

  /**
   * « Lever la réserve » (lot 11, demande d'Ergun) : le salarié lève lui-même,
   * depuis son téléphone, avec le MÊME formulaire que le bureau (commentaire et
   * photo facultatifs). La réserve passe dans « Levées » côté bureau, avec son
   * nom, la date, le commentaire et la photo — et le bureau peut la rouvrir.
   * Passe par mark_reserve_fixed (déjà en production), qui marche aussi sur un
   * mois clôturé : ce n'est pas une écriture d'heures.
   *
   * Pendant 10 s, « Annuler » la remet à lever (refusé si le bureau l'a levée
   * entre-temps : la fonction serveur le dit).
   */
  const liftFromCard = async (entry: TimeEntryWithWorksite, note: string, photo: File | null) => {
    if (!user) return;
    try {
      const res = await liftReserve({
        role: 'worker', companyId: user.company_id, userId: user.id,
        entryId: entry.id, worksiteId: entry.worksite_id, note, photo,
      });
      setLiftingId(null);
      toast.success('Réserve levée', {
        duration: 10_000,
        action: {
          label: 'Annuler',
          onClick: async () => {
            try {
              await undoWorkerLift(entry.id, res.photo);
              toast.success('Réserve remise à lever');
            } catch (e) {
              toast.error(liftErrorMessage(e, true));
            }
            await fetchData();
            announceReservesChanged();
          },
        },
      });
      await fetchData();
      announceReservesChanged();
    } catch (e) {
      toast.error(liftErrorMessage(e, true));
      throw e; // le formulaire reste ouvert, avec la saisie
    }
  };

  // Une réserve levée depuis le bandeau « réserves à lever » : la carte du jour
  // se met à jour aussi (relecture silencieuse, keep()).
  useEffect(() => {
    const onChanged = () => { fetchData(); };
    window.addEventListener(RESERVES_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(RESERVES_CHANGED_EVENT, onChanged);
  }, [fetchData]);

  const saveSlot = async () => {
    if (!user || !openSlot) return;
    if (slotBusyRef.current) return;   // lot 10 : relecture du pointage en cours (double toucher sur « OK »)
    if (!fStart || !fEnd) { toast.error("Indique l'heure de début et de fin"); return; }
    // Lot 2 : 0 minute n'est pas une saisie. Ce brouillon vide restait « à envoyer »
    // et verrouillait l'intervention au bureau.
    if (fStart.slice(0, 5) === fEnd.slice(0, 5)) { toast.error('Le début et la fin sont identiques.'); return; }
    // Lot 6 (règle d'Ergun) : le détail des réserves est FACULTATIF. « Avec
    // réserve » suffit ; le détail et les photos aident, sans jamais bloquer « OK ».
    // Lot 1 : deux lignes qui se chevauchent compteraient deux fois les mêmes
    // minutes (07:00–13:00 + 12:00–18:00 = 12 h pour 11 h de présence). Refusé
    // ici, la fiche reste ouverte avec la saisie.
    const selfId = openSlot.kind === 'entry' ? openSlot.entryId : null;
    const selfLocal = openSlot.kind === 'pending' ? openSlot.localId : null;
    // `editable` sert à l'alerte du pointage en cours (lot 10) : une ligne déjà
    // envoyée ne se corrige pas depuis le téléphone.
    const autres = [
      ...entries.filter((e) => e.id !== selfId && e.status !== 'cancelled' && e.start_time && e.end_time && !isExitToComplete(e))
        .map((e) => ({ start: e.start_time.slice(0, 5), end: e.end_time.slice(0, 5), editable: e.status === 'draft' && !e.locked })),
      ...pendingEntries.filter((e) => e.localId !== selfLocal).map((e) => ({ start: e.start_time.slice(0, 5), end: e.end_time.slice(0, 5), editable: true })),
    ];
    const clash = findOverlap({ start: fStart, end: fEnd }, autres);
    if (clash) { toast.error(`Ces heures chevauchent ${clash.start}–${clash.end}, déjà noté. Corrige le début ou la fin.`); return; }
    // Lot 3bis : une pause illisible ou plus longue que la ligne bloque, la fiche
    // reste ouverte. Avant, keptBreak la remettait à 0 sans un mot.
    const pErr = fPauseErr ?? pauseError(fBreak, spanMinutes({ start: fStart, end: fEnd }));
    if (pErr) { toast.error(pErr); return; }

    // ── Lot 10 : ces heures recouvrent-elles le pointage EN COURS ? ──
    // Toutes les validations locales sont passées : on ne propose jamais de
    // fermer le pointage pour se heurter ensuite à un refus de la fiche.
    // Le chantier se contrôle donc ICI (le contrôle plus bas reste, identique).
    const plannedWorksite = openSlot.kind === 'planned' ? planning.find((pp) => pp.id === openSlot.planningId)?.worksite_id : null;
    if ((openSlot.kind === 'new' && !fWorksiteId) || (openSlot.kind === 'planned' && !plannedWorksite)) { toast.error('Choisis un chantier'); return; }
    // Seulement si les heures ont CHANGÉ : noter une observation, une pause ou
    // une réception sur une ligne qui chevauchait déjà reste possible.
    const hoursChanged = openSlot.kind === 'new' || openSlot.kind === 'planned' || !fInit || fStart !== fInit.start || fEnd !== fInit.end;
    let clashOffline = false;
    if (!skipLiveRef.current && !monthLocked && hoursChanged) {
      slotBusyRef.current = true; setFSaving(true);
      let seen: OwnLiveSession | null | undefined;
      try {
        // En ligne, on relit : un pointage lancé à la borne il y a quelques secondes n'est pas encore
        // connu. Délai court : sur un réseau lent, chaque « OK » attend au plus 1,5 s, puis le dernier pointage relu fait foi.
        if (navigator.onLine) seen = await readLiveWithin(user.id, 1500);
      } finally { slotBusyRef.current = false; setFSaving(false); }
      // La fiche peut être fermée (« Annuler », retour du téléphone) pendant la relecture :
      // on n'écrit rien et on n'ouvre aucune alerte sans fiche derrière.
      if (openSlotRef.current !== openSlot) return;
      const session = seen !== undefined ? seen : live.known ? live.session : null;
      // La date de PARIS (pas celle du téléphone) : un pointage d'un autre jour est une sortie oubliée.
      const pc = parisClock(Date.now());
      if (session && session.work_date === date && date === pc.date) {
        const lc = liveClash({
          span: { start: fStart.slice(0, 5), end: fEnd.slice(0, 5) },
          liveStart: parisClock(session.started_at).hm,
          now: pc.hm,
          others: autres,
          finishAvailable: !finishMissingRef.current,
        });
        if (lc && navigator.onLine) {
          setLiveAsk({
            span: { start: fStart.slice(0, 5), end: fEnd.slice(0, 5) }, liveStart: parisClock(session.started_at).hm,
            startedAt: session.started_at, workDate: session.work_date, now: pc.hm, result: lc,
            action: openSlot.kind === 'entry' || openSlot.kind === 'pending' ? 'update' : 'add',
          });
          return;
        }
        // Hors ligne on n'empêche jamais d'enregistrer : le contrôle de l'envoi prendra le relais.
        clashOffline = !!lc;
      }
    }
    setFSaving(true);
    try {
      // Lot 1 : la pause de la ligne est GARDÉE (et déduite), jamais remise à 0.
      const brk = keptBreak({ start: fStart, end: fEnd }, fBreak);
      const totalMins = calculateTotalMinutes(fStart, fEnd, brk);
      let savedMsg = "C'est noté";

      // ── Update an existing entry ──
      if (openSlot.kind === 'entry') {
        const wasSubmitted = entries.find((e) => e.id === openSlot.entryId)?.status === 'submitted';
        if (wasSubmitted) savedMsg = 'Correction envoyée — la secrétaire est prévenue';
        // On n'envoie une heure que si elle a CHANGÉ : la ligne pointée à la
        // minute garde sa minute (voir `setTimes`).
        const { data: upd, error } = await supabase.from('time_entries').update({
          ...(!fInit || fStart !== fInit.start ? { start_time: fStart } : {}),
          ...(!fInit || fEnd !== fInit.end ? { end_time: fEnd } : {}),
          break_minutes: brk, observation: fObs.trim() || null,
          reception: fReception || null,
          // Editing an already-sent entry: flag it so the secretary sees the change.
          ...(wasSubmitted ? { modified_at: new Date().toISOString(), modified_by: user.id } : {}),
        }).eq('id', openSlot.entryId).eq('user_id', user.id).select('id');
        if (error) throw error;
        // 0 ligne = la RLS a refusé (verrouillée, exportée…) : ce n'est pas un succès.
        if (!upd || upd.length === 0) { toast.error('Ce chantier n’a pas changé : il est verrouillé par le bureau.'); return; }
      } else if (openSlot.kind === 'pending') {
        const pend = getPendingEntries(user.id).find((e) => e.localId === openSlot.localId);
        if (pend) {
          removePendingEntry(user.id, openSlot.localId);
          addPendingEntry(user.id, { ...pend, start_time: fStart, end_time: fEnd, break_minutes: brk, total_minutes: totalMins, observation: fObs.trim() || null, reception: fReception || null });
        }
      } else {
        // ── Create a new slot (planned chantier or free intervention) ──
        let worksiteId = '';
        let worksiteName = '';
        let worksiteCity: string | null = null;

        if (openSlot.kind === 'planned') {
          const p = planning.find((pp) => pp.id === openSlot.planningId);
          worksiteId = p?.worksite_id || '';
          worksiteName = p?.worksite?.client_name || '';
          worksiteCity = p?.worksite?.city || null;
        } else {
          worksiteId = fWorksiteId;
          const ws = worksites.find((w) => w.id === worksiteId);
          worksiteName = ws?.client_name || ''; worksiteCity = ws?.city || null;
        }
        if (!worksiteId) { toast.error('Choisis un chantier'); return; }

        // Le planning EXACT qu'on a ouvert, pas « le premier de ce chantier » :
        // avec deux créneaux prévus sur le même chantier, l'ancien code liait les
        // deux lignes au premier, et l'appariement ne s'y retrouvait plus.
        // Lot 1 : même règle pour le « + » — le planning de ce chantier que la
        // ligne recouvre le plus (supabase/functions/_shared/day-hours.ts).
        const planningId = openSlot.kind === 'planned'
          ? openSlot.planningId
          : bestPlanningFor({ start: fStart, end: fEnd, worksite_id: worksiteId }, planning);

        // Un identifiant est posé dès la saisie, en ligne comme hors ligne : si la
        // réponse du serveur se perd, la même saisie ne peut pas entrer deux fois.
        const localId = generateLocalId();
        const pending: PendingEntry = {
          localId, company_id: user.company_id, user_id: user.id, worksite_id: worksiteId,
          planning_id: planningId, work_date: date, start_time: fStart, end_time: fEnd, break_minutes: brk,
          total_minutes: totalMins, meal_allowance: false, observation: fObs.trim() || null, reception: fReception || null,
          _worksite_name: worksiteName, _worksite_city: worksiteCity, _saved_at: Date.now(),
        };

        // Le chemin d'enregistrement vit dans lib/worker-entry.ts, partagé avec
        // l'Assistant BEMEXO : même insertion, même repli hors ligne.
        const sent = await insertWorkerEntry(pending);
        // Le réseau a lâché en plein envoi : la saisie reste sur le téléphone
        // plutôt que d'être perdue, elle partira toute seule.
        if (sent === 'queued') toast.message('Réseau instable — ça partira tout seul.');
      }

      setDrawerField(null);
      setOpenSlot(null);
      await applyDayMeal(dayMeal);
      if (navigator.onLine) fetchData();
      setPendingEntries(getPendingEntries(user.id).filter((e) => e.work_date === date));
      toast.success(savedMsg);
      if (clashOffline) toast.message('Votre pointage est encore en cours : ces heures seront vérifiées au retour du réseau.', LONG_TOAST);
    } catch (err) {
      console.error('Error saving slot:', err);
      toast.error(explainWriteError(err, "Impossible d'ajouter ce chantier"));
    } finally {
      setFSaving(false);
    }
  };

  saveSlotRef.current = saveSlot;
  openSlotRef.current = openSlot;

  /**
   * Lot 10 — « Terminer le pointage à HH:MM, puis ajouter ».
   *
   * ORDRE IMPÉRATIF : fermer le pointage PUIS enregistrer l'intervention. Le
   * trigger de la base marque `qr` toute ligne insérée tant qu'un pointage `qr`
   * du même jour, chantier et minute existe : fermé d'abord, seule la ligne du
   * pointage porte cette origine. La fermeture est celle, atomique, de
   * « Terminer ma journée » (`finish_active_session`) ; rien n'est écrit en direct.
   *
   * Jamais « rien n'a été modifié » sans l'avoir vérifié : si la réponse se perd,
   * on relit le pointage avant de parler.
   */
  const finishThenSave = async () => {
    const ask = liveAsk;
    if (!user || !ask || ask.result.can !== 'finish') return;
    if (liveBusyRef.current) return;
    // Sans fiche, saveSlot ne ferait rien après la fermeture : le pointage serait terminé sans que rien soit ajouté.
    if (!openSlotRef.current) {
      setLiveAsk(null);
      toast.message('La fiche a été fermée : rien n\'a été modifié. Touchez « + » pour ajouter l\'intervention.', LONG_TOAST);
      return;
    }
    liveBusyRef.current = true; setLiveBusy(true);
    const at = ask.result.at;
    const staleMsg = 'Ce pointage était déjà fermé ailleurs. Vos heures sont à jour : vérifiez-les, puis réessayez.';
    /** La fenêtre se ferme, la fiche reste ouverte avec la saisie, le pointage n'est jamais rouvert. */
    const giveUp = (message: () => void, refresh = false) => {
      setLiveAsk(null);
      message();
      if (refresh) { announceLiveChange(); void fetchData(); }
    };
    try {
      const pc = parisClock(Date.now());
      if (pc.date !== ask.workDate || at > pc.hm) {
        giveUp(() => toast.message(`Il est ${pc.hm} : le pointage ne peut pas être terminé à ${at}, c'est plus tard. Corrigez les heures.`, LONG_TOAST));
        return;
      }
      const cur = await readLiveWithin(user.id, 8000);
      if (cur === undefined) { giveUp(() => toast.error('Impossible de vérifier votre pointage pour l\'instant. Rien n\'a été modifié.', LONG_TOAST)); return; }
      if (!cur || cur.started_at !== ask.startedAt) { giveUp(() => toast.message(staleMsg, LONG_TOAST), true); return; }

      // Aucun autre `await` entre la relecture et la fermeture : la borne ne doit pas avoir le temps de changer le pointage.
      let r: Awaited<ReturnType<typeof finishLiveAt>>;
      try {
        r = await finishLiveAt(at);
      } catch (e) {
        console.error('Error finishing live session:', e instanceof Error ? e.message : 'erreur');
        const after = await readLiveWithin(user.id, 8000);
        void fetchData();
        setLiveAsk(null);
        if (after === undefined) toast.error('La réponse n\'est pas arrivée : vérifiez votre pointage et vos heures avant de réessayer.', LONG_TOAST);
        else if (!after || after.started_at !== ask.startedAt) {
          // La fermeture a abouti, seule la réponse s'est perdue : rien n'est ajouté (la ligne du pointage existe peut-être).
          toast.message('Le pointage semble avoir été terminé : vérifiez vos heures avant de réessayer.', LONG_TOAST);
          announceLiveChange();
        } else toast.error(explainWriteError(e, 'Le pointage n\'a pas pu être terminé. Il est toujours en cours.'), LONG_TOAST);
        return;
      }

      if (r.kind === 'stale') { giveUp(() => toast.message(staleMsg, LONG_TOAST), true); return; }
      if (r.kind === 'cancelled') { giveUp(() => toast.message('Le pointage a été annulé ou a changé. Vérifiez votre journée avant de réessayer.', LONG_TOAST), true); return; }
      if (r.kind === 'unavailable') {
        finishMissingRef.current = true;
        giveUp(() => toast.message('Terminer le pointage à une heure précise n\'est pas disponible pour l\'instant. Corrigez les heures.', LONG_TOAST));
        return;
      }
      const closedAt = r.end_time.slice(0, 5);
      if (closedAt !== at) {
        giveUp(() => toast.message(`Le pointage a été fermé à ${closedAt}. Vérifiez vos heures avant d'ajouter l'intervention.`, LONG_TOAST), true);
        return;
      }
      announceLiveChange();
      setLiveAsk(null);
      toast.success(`Pointage terminé : ${ask.liveStart} à ${at} (heure choisie par vous)`);

      // Le pointage est fermé : on enregistre l'intervention par le chemin habituel (mêmes validations, sans refaire le contrôle du pointage).
      skipLiveRef.current = true;
      try { await saveSlotRef.current(); } finally { skipLiveRef.current = false; }
    } finally {
      liveBusyRef.current = false; setLiveBusy(false);
    }
  };

  // Remove a wrong intervention. Draft → delete. Sent → soft-cancel (stays
  // visible "Retirée", excluded from the total, secretary informed).
  // `.select('id')` sur chaque écriture : 0 ligne = refus RLS (verrouillée), pas
  // un succès.
  // Lot 2 : un brouillon DÉJÀ ENVOYÉ une fois (renvoyé par le bureau,
  // `submitted_at` posé) se retire aussi — l'effacer ferait disparaître des
  // heures que le bureau a vues, et la base le refuse désormais.
  const handleRetire = async (entry: TimeEntryWithWorksite) => {
    if (!user) return;
    try {
      if (entry.status === 'submitted' || (entry.status === 'draft' && !!entry.submitted_at)) {
        const { data: upd, error } = await supabase.from('time_entries')
          .update({ status: 'cancelled', modified_at: new Date().toISOString(), modified_by: user.id })
          .eq('id', entry.id).eq('user_id', user.id).select('id');
        if (error) throw error;
        if (!upd || upd.length === 0) { toast.error('Impossible de retirer : chantier verrouillé par le bureau.'); return; }
        toast.success('Chantier retiré — la secrétaire est prévenue');
      } else {
        const { data: del, error } = await supabase.from('time_entries').delete().eq('id', entry.id).eq('user_id', user.id).select('id');
        if (error) throw error;
        if (!del || del.length === 0) { toast.error('Impossible de retirer : chantier verrouillé par le bureau.'); fetchData(); return; }
        toast.success('Chantier retiré');
      }
      setOpenSlot(null);
      await applyDayMeal(dayMeal);
      fetchData();
    } catch (err) {
      console.error('Error retiring entry:', err);
      toast.error(explainWriteError(err, 'Impossible de retirer'));
    }
  };

  const handleDeletePending = (localId: string) => {
    if (!user) return;
    removePendingEntry(user.id, localId);
    setPendingEntries((prev) => prev.filter((e) => e.localId !== localId));
    if (openSlot?.kind === 'pending' && openSlot.localId === localId) setOpenSlot(null);
    toast.success('Chantier supprimé');
  };

  // ─── Copy yesterday ──────────────────────────────────────────────────────────

  const handleCopyYesterday = async () => {
    if (!user) return;
    if (!navigator.onLine) { toast.error('Copie indisponible hors-ligne'); return; }
    setCopyingYesterday(true);
    try {
      // Une intervention retirée hier ne se recopie pas.
      const { data: yEntries, error } = await supabase.from('time_entries').select('*').eq('user_id', user.id).eq('work_date', yesterday).neq('status', 'cancelled').order('start_time');
      if (error) throw error;
      if (!yEntries || yEntries.length === 0) { toast.error('Aucun chantier hier à copier'); return; }

      // lib/worker-day.ts : même chemin que l'Assistant BEMEXO (planning du jour rattaché).
      const rows = await copyLinesTo(user, yEntries.map((e) => ({ worksite_id: e.worksite_id, start_time: e.start_time, end_time: e.end_time, break_minutes: e.break_minutes, observation: e.observation })), [date]);
      // Lot 2 : une ligne de 0 minute (fin à compléter) ne se recopie pas.
      if (rows.length === 0) { toast.error('Rien à copier : les heures d’hier sont à compléter.'); return; }

      toast.success(`${rows.length} chantier${rows.length > 1 ? 's' : ''} copié${rows.length > 1 ? 's' : ''} depuis hier`);
      await applyDayMeal(dayMeal);
      fetchData();
    } catch (err) {
      console.error('Error copying yesterday:', err);
      toast.error("Impossible de copier la journée d'hier");
    } finally {
      setCopyingYesterday(false);
    }
  };

  // ─── Repeat this day onto other days ─────────────────────────────────────────

  const copyTargetStrs = copyDates.map((d) => format(d, 'yyyy-MM-dd')).filter((d) => d !== date);

  const copyToDates = async (targetStrs: string[]) => {
    if (!user) return;
    if (!navigator.onLine) { toast.error('Copie indisponible hors-ligne'); return; }
    const targets = Array.from(new Set(targetStrs)).filter((d) => d !== date);
    // Les interventions retirées ne se copient pas ; le panier non plus (il se
    // coche jour par jour, et un seul par jour est accepté en base).
    const sources = [
      ...liveEntries.map((e) => ({ worksite_id: e.worksite_id, start_time: e.start_time, end_time: e.end_time, break_minutes: e.break_minutes, meal_allowance: false, observation: e.observation })),
      ...pendingEntries.map((e) => ({ worksite_id: e.worksite_id, start_time: e.start_time, end_time: e.end_time, break_minutes: e.break_minutes, meal_allowance: false, observation: e.observation })),
    ];
    if (sources.length === 0) { toast.error('Aucun chantier à copier'); return; }
    if (targets.length === 0) { toast.error('Aucun jour à remplir'); return; }
    setCopying(true);
    try {
      // lib/worker-day.ts : planning du jour cible rattaché, panier non copié.
      const ids = await copyLinesTo(user, sources, targets);
      if (ids.length === 0) { toast.error('Rien à copier : les heures sont à compléter.'); return; }
      toast.success(`Copié sur ${targets.length} jour${targets.length > 1 ? 's' : ''}`);
      setRepeatOpen(false);
    } catch (err) {
      console.error('Error repeating day:', err);
      toast.error('Impossible de copier');
    } finally {
      setCopying(false);
    }
  };

  // ─── Submit day ────────────────────────────────────────────────────────────

  const checkCoherenceWarnings = (): string[] => {
    const drafts = entries.filter((e) => e.status === 'draft' && !e.locked);
    // Les chantiers prévus CONFIRMÉS partent eux aussi : ils entrent dans les contrôles.
    const planned = confirmedPlanned();
    if (drafts.length === 0 && planned.length === 0) return [];
    const warnings: string[] = [];
    // Pause répondue à l'instant : déjà en base, pas encore relue ici.
    const minutesOf = (e: TimeEntryWithWorksite) => {
      const b = sendCtx.current.breaks.get(e.id);
      return b == null ? e.total_minutes : e.total_minutes + (e.break_minutes || 0) - b;
    };

    // L'ancien avertissement « il reste N chantiers prévus sans heures » a
    // disparu : il ne reste plus rien, ces chantiers partent avec la feuille.
    // Le garder aurait fait surgir une fenêtre de confirmation à chaque envoi
    // d'une journée conforme au planning — exactement le geste qu'on supprime.
    const plannedMins = planned.reduce((s, p) => s + calculateTotalMinutes(p.start, p.end, p.breakMinutes || 0), 0);
    const totalMins = drafts.reduce((s, e) => s + minutesOf(e), 0) + plannedMins;
    if (totalMins > 600) warnings.push(`Total : ${formatMinutesToHours(totalMins)} (dépasse 10h). Vérifie tes horaires.`);
    // Lot 1 : un chevauchement n'est plus un simple avertissement — il bloque
    // l'envoi plus haut (handleSubmitDay), avec la même tolérance d'une minute.
    return warnings;
  };

  /** Les créneaux prévus que le salarié a confirmés pour CET envoi, avec leur pause. */
  const confirmedPlanned = () => (sendCtx.current.plannedOk
    ? plannedToSend.map((p) => ({ ...p, breakMinutes: sendCtx.current.breaks.get(`plan:${p.planningId}`) || 0 }))
    : []);

  /** Les heures du jour qui partiraient (lignes, file du téléphone, prévu confirmé). */
  const sendSpans = (): (Span & { id: string; editable: boolean; break_minutes: number })[] => [
    ...entries.filter((e) => e.status !== 'cancelled' && e.start_time && e.end_time && !isExitToComplete(e)).map((e) => ({
      id: e.id, start: e.start_time.slice(0, 5), end: e.end_time.slice(0, 5),
      editable: e.status === 'draft' && !e.locked, break_minutes: sendCtx.current.breaks.get(e.id) ?? (e.break_minutes || 0),
    })),
    ...pendingEntries.map((e) => ({
      id: `pending:${e.localId}`, start: e.start_time.slice(0, 5), end: e.end_time.slice(0, 5),
      editable: true, break_minutes: sendCtx.current.breaks.get(`pending:${e.localId}`) ?? (e.break_minutes || 0),
    })),
    ...confirmedPlanned().map((p) => ({ id: `plan:${p.planningId}`, start: p.start, end: p.end, editable: true, break_minutes: p.breakMinutes })),
  ];

  const handleSubmitDay = () => {
    // Lot 12 : une sortie oubliée sans heure de fin ne part pas (la base le
    // refuse aussi) — on ouvre la ligne pour qu'il la complète.
    const toComplete = entries.find((e) => e.status === 'draft' && !e.locked && isExitToComplete(e));
    if (toComplete) { toast.error(EXIT_TO_COMPLETE_MSG); openEntry(toComplete); return; }
    sendCtx.current = { plannedOk: false, breaks: new Map(), asked: new Set() };
    // Lot 1 : deux lignes qui se chevauchent ne partent pas — les mêmes minutes
    // seraient payées deux fois. Le salarié corrige l'une des deux.
    if (overlapBlocks()) return;
    // Lot 1 : des heures PRÉVUES par le bureau ne partent jamais sans un « oui ».
    if (plannedToSend.length > 0) { setPlannedAsk(true); return; }
    askNextPause();
  };

  /** Un chevauchement que le salarié peut corriger (au moins une des deux lignes modifiable) → envoi refusé. */
  const overlapBlocks = (): boolean => {
    const clash = firstBlockingOverlap(sendSpans());
    if (!clash) return false;
    toast.error(`Deux chantiers se chevauchent : ${clash[0].start}–${clash[0].end} et ${clash[1].start}–${clash[1].end}. Corrige l'un des deux avant d'envoyer.`);
    return true;
  };

  /** Réponse à « Le bureau avait prévu… » : envoyer ces horaires, envoyer sans, ou corriger. */
  const answerPlanned = (choice: 'send' | 'skip' | 'fix') => {
    setPlannedAsk(false);
    if (choice === 'fix') return;
    sendCtx.current.plannedOk = choice === 'send';
    // Deux créneaux prévus qui se chevauchent (deux chantiers 08–12 et 11–15) :
    // les confirmer enverrait deux fois la même heure.
    if (sendCtx.current.plannedOk && overlapBlocks()) { sendCtx.current.plannedOk = false; return; }
    askNextPause();
  };

  /** Plus de 6 h d'affilée sans pause notée → « Tu as pris une pause ? » (une plage à la fois). */
  const askNextPause = () => {
    const ask = pauseAsks(sendSpans()).find((a) => !sendCtx.current.asked.has(a.id));
    if (ask) { setPauseAsk(ask); return; }
    continueSubmit();
  };

  /** Pause choisie (puce ou « Autre », toute durée plus courte que la ligne) : posée sur la plus longue ligne de la plage, puis l'envoi continue. */
  const answerPause = async (minutes: number) => {
    const ask = pauseAsk;
    setPauseAsk(null);
    if (!ask || !user) return;
    const ctx = sendCtx.current;
    ctx.asked.add(ask.id);
    if (minutes > 0) {
      if (ask.id.startsWith('plan:')) {
        sendCtx.current.breaks.set(ask.id, minutes);
      } else if (ask.id.startsWith('pending:')) {
        const localId = ask.id.slice('pending:'.length);
        const pe = pendingEntries.find((e) => e.localId === localId);
        if (pe) {
          updatePendingEntry(user.id, localId, { break_minutes: minutes, total_minutes: calculateTotalMinutes(pe.start_time.slice(0, 5), pe.end_time.slice(0, 5), minutes) });
          setPendingEntries(getPendingEntries(user.id).filter((e) => e.work_date === date));
        }
        sendCtx.current.breaks.set(ask.id, minutes);
      } else {
        const { data: upd, error } = await supabase.from('time_entries').update({ break_minutes: minutes })
          .eq('id', ask.id).eq('user_id', user.id).eq('status', 'draft').select('id');
        if (error || !upd || upd.length === 0) { toast.error(explainWriteError(error, 'Pause non enregistrée')); fetchData(); return; }
        ctx.breaks.set(ask.id, minutes);
        // L'écran suit tout de suite (total, fiche, nouvelle question) : sinon
        // « Corriger » puis « Envoyer » reposait la question sur la ligne d'avant.
        setEntries((prev) => prev.map((e) => (e.id === ask.id
          ? { ...e, total_minutes: e.total_minutes + (e.break_minutes || 0) - minutes, break_minutes: minutes } : e)));
      }
    }
    // Un nouvel appui sur « Envoyer » pendant l'écriture a relancé l'envoi : celui-ci s'arrête.
    if (sendCtx.current !== ctx) return;
    askNextPause();
  };

  const continueSubmit = () => {
    const draftIds = entries.filter((e) => e.status === 'draft' && !e.locked).map((e) => e.id);
    // Un chantier prévu CONFIRMÉ (« oui, je l'ai fait ») est une ligne de la
    // feuille. On ne refuse que si la journée est réellement vide.
    if (draftIds.length === 0 && confirmedPlanned().length === 0 && pendingEntries.length === 0) {
      toast.error('Ajoute un chantier');
      return;
    }
    const warnings = checkCoherenceWarnings();
    if (warnings.length > 0) { setCoherenceWarnings(warnings); setConfirmOpen(true); } else { doSubmit(); }
  };

  /**
   * Matérialise les chantiers prévus non ouverts, et rend les identifiants des
   * lignes créées pour qu'elles partent avec les autres.
   *
   * EN DEUX TEMPS, ET CE N'EST PAS UN CHOIX. La politique RLS
   * `time_entries_worker_insert` impose `status = 'draft'` : un salarié ne peut
   * pas insérer une ligne déjà envoyée. Rejoué en base avant d'écrire cette
   * fonction — l'insert direct en « envoyée » est refusé. On insère donc en
   * brouillon, puis la bascule se fait avec le reste. C'est d'ailleurs ce
   * chemin qui fait poser `submitted_at` par le garde en base, lequel efface
   * cette colonne à toute insertion.
   */
  const materialisePlanned = async (): Promise<string[]> => {
    const planned = confirmedPlanned();
    if (!user || planned.length === 0) return [];
    // lib/worker-day.ts : identifiant stable dérivé du planning, reprise sur 23505.
    return materialiseDay(user, date, planned);
  };

  const doSubmit = async () => {
    if (!user) return;
    const draftIds = entries.filter((e) => e.status === 'draft' && !e.locked).map((e) => e.id);

    // ── Sans réseau ──────────────────────────────────────────────────────────
    // On ne peut rien écrire, mais le geste du salarié ne doit pas se perdre.
    // Les chantiers prévus rejoignent la file du téléphone, et TOUTES les lignes
    // du jour déjà en file sont marquées « à envoyer dès qu'il y a du réseau ».
    // Sans ça, un salarié qui envoie sa journée depuis un sous-sol la retrouve
    // en brouillon le lendemain — son geste effacé sans un mot.
    if (!navigator.onLine) {
      for (const p of confirmedPlanned()) {
        const ws = worksites.find((w) => w.id === p.worksiteId);
        const brk = keptBreak(p, p.breakMinutes);
        addPendingEntry(user.id, {
          localId: generateLocalId(), company_id: user.company_id, user_id: user.id,
          worksite_id: p.worksiteId, planning_id: p.planningId, work_date: date,
          start_time: p.start, end_time: p.end, break_minutes: brk,
          total_minutes: calculateTotalMinutes(p.start, p.end, brk),
          meal_allowance: false, observation: null, reception: null,
          _worksite_name: ws?.client_name || '', _worksite_city: ws?.city || null,
          _saved_at: Date.now(), submit_after_sync: true,
        });
      }
      for (const pe of getPendingEntries(user.id).filter((e) => e.work_date === date)) {
        updatePendingEntry(user.id, pe.localId, { submit_after_sync: true });
      }
      setPendingEntries(getPendingEntries(user.id).filter((e) => e.work_date === date));
      toast.success('Journée gardée sur le téléphone — elle partira dès que tu auras du réseau.');
      return;
    }

    setSubmitting(true);
    try {
      const newIds = await materialisePlanned();
      const allIds = [...draftIds, ...newIds];
      if (allIds.length === 0) { toast.error('Ajoute un chantier'); return; }

      // LE PANIER, une fois les lignes créées et pas avant.
      //
      // Sur une journée sans aucune ligne, `applyDayMeal` n'a rien sur quoi
      // écrire : il ne trouve aucune ligne, n'écrit rien — et renvoie `ok`.
      // Le salarié cochait le panier, ne voyait aucune erreur, et le panier
      // n'existait nulle part. Encore « pas d'erreur, donc c'est passé ».
      // Maintenant que les lignes existent, on le pose pour de bon, avant la
      // bascule (sur une ligne envoyée, il préviendrait la secrétaire).
      if (newIds.length > 0 && dayMeal) await applyDayMeal(true);

      // On compare au nombre attendu : une ligne verrouillée entre-temps est
      // silencieusement ignorée par la RLS.
      const n = await submitDrafts(user, allIds);
      if (n === 0) toast.error("Rien n'a été envoyé : la journée est verrouillée ou a changé. Recharge.");
      else if (n < allIds.length) toast.error(`${n} chantier${n > 1 ? 's' : ''} envoyé${n > 1 ? 's' : ''} sur ${allIds.length} — les autres sont verrouillés.`);
      else toast.success('Journée envoyée');
      fetchData();
    } catch (err) {
      console.error('Error submitting day:', err);
      toast.error(explainWriteError(err, "Impossible d'envoyer"));
      // On recharge même en cas d'échec : la matérialisation a pu passer avant
      // que la bascule n'échoue. Sans ça l'écran garde des cartes « prévu »
      // pour des lignes qui existent déjà en base, et la tentative suivante
      // travaille sur une vue périmée.
      fetchData();
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Computed ──────────────────────────────────────────────────────────────

  const liveEntries = entries.filter((e) => e.status !== 'cancelled');
  const cancelledEntries = entries.filter((e) => e.status === 'cancelled');
  // Lot 2 : une ligne encore en brouillon dont le dernier geste du bureau est
  // un renvoi → la journée attend le salarié (le plus récent motif s'affiche).
  const returnedBy = liveEntries
    .filter((e) => e.status === 'draft')
    .map((e) => lastEdit(mesRetouches.get(e.id)))
    .filter((x): x is EntryEdit => x?.kind === 'return')
    .sort((a, b) => (a.edited_at < b.edited_at ? 1 : -1))[0] ?? null;
  const serverTotal = liveEntries.reduce((s, e) => s + e.total_minutes, 0);
  const pendingTotal = pendingEntries.reduce((s, e) => s + e.total_minutes, 0);
  const totalMinutes = serverTotal + pendingTotal;
  const nbChantiers = liveEntries.length + pendingEntries.length;
  const hasRealDrafts = liveEntries.some((e) => e.status === 'draft' && !e.locked);
  const allSubmitted = liveEntries.length > 0 && liveEntries.every((e) => e.status !== 'draft') && pendingEntries.length === 0;
  const frozen = allSubmitted; // a sent day stays frozen; every change re-asks to confirm
  const isEmpty = liveEntries.length === 0 && pendingEntries.length === 0;
  const isEditable = (e: TimeEntryWithWorksite) => !e.locked && !e.exported_at;
  // Toutes les lignes du jour sont chez le comptable : le panier ne se pose plus nulle part.
  const mealLocked = liveEntries.length > 0 && pendingEntries.length === 0 && liveEntries.every((e) => !isEditable(e));

  // Appariement LIGNE À LIGNE, et pas « ce chantier a déjà une ligne » : deux
  // créneaux prévus sur le même chantier demandent deux lignes pour disparaître
  // tous les deux. Voir `remainingPlannings`.
  //
  // Les lignes RETIRÉES comptent toujours : un chantier prévu puis retiré ne
  // doit pas resurgir comme s'il restait à faire (il s'affiche « Retiré »).
  //
  // ON FILTRE AVANT D'APPARIER. `remainingPlannings` ne juge que « ce planning
  // a-t-il déjà sa ligne » ; il ne sait pas ce qu'est une absence. Lui donner
  // le planning brut faisait remonter les congés et les lignes sans chantier
  // comme des cartes « prévu » vides, qu'on ne pouvait qu'ouvrir pour se faire
  // répondre « Choisis un chantier ». C'est moi qui l'avais cassé en passant
  // de l'ancien filtre `p.worksite_id && …` à l'appariement.
  const plannedRemaining = remainingPlannings(
    planning.filter((p) => p.worksite_id && !p.absence_type),
    [
      ...entries.map((e) => ({ worksite_id: e.worksite_id, planning_id: e.planning_id })),
      ...pendingEntries.map((e) => ({ worksite_id: e.worksite_id, planning_id: e.planning_id })),
    ],
  );
  // Lot 1 : un créneau prévu dont les heures sont DÉJÀ saisies (même sur une
  // ligne rattachée à un autre planning) disparaît. Exemple : Matin 08–12 et
  // Après-midi 13:30–17 prévus, le salarié note 07:00–18:00 — l'après-midi
  // restait « à faire » et partait en plus, 14h30 pour 11 h de présence.
  const daySpans: Span[] = [
    ...liveEntries.filter((e) => e.start_time && e.end_time && !isExitToComplete(e))
      .map((e) => ({ start: e.start_time.slice(0, 5), end: e.end_time.slice(0, 5) })),
    ...pendingEntries.map((e) => ({ start: e.start_time.slice(0, 5), end: e.end_time.slice(0, 5) })),
  ];
  const plannedTodo = visiblePlannings(plannedRemaining, daySpans);
  // Design salarié, étape 4 (?ui=2) : les segments de la mini-frise — lignes notées (envoyées / à envoyer / sortie oubliée), prévu pas encore noté, pointage en cours.
  const friseSegments: SegFrise[] = !ui2 ? [] : (() => {
    const segs: SegFrise[] = [
      ...liveEntries.filter((e) => e.start_time && e.end_time && e.status !== 'cancelled').map((e): SegFrise => {
        const et = etatLigne(e);
        return { debut: e.start_time.slice(0, 5), fin: e.end_time.slice(0, 5), type: et === 'envoyee' || et === 'comptable' ? 'fait' : et === 'fin-a-completer' || et === 'sortie-oubliee' ? 'oublie' : 'a-envoyer' };
      }),
      ...pendingEntries.map((e): SegFrise => ({ debut: e.start_time.slice(0, 5), fin: e.end_time.slice(0, 5), type: 'a-envoyer' })),
      ...plannedTodo.filter((p) => p.estimated_start).map((p): SegFrise => {
        const d = p.estimated_start!.slice(0, 5);
        const f = p.estimated_end ? p.estimated_end.slice(0, 5) : `${String(Math.min(23, Number(d.slice(0, 2)) + 4)).padStart(2, '0')}${d.slice(2)}`;
        return { debut: d, fin: f, type: 'prevu' };
      }),
    ];
    const ouvert = live.session;
    if (ouvert?.started_at) { const c = parisClock(ouvert.started_at); if (c.date === date) segs.push({ debut: c.hm, fin: parisClock(Date.now()).hm, type: 'en-cours' }); }
    // Dans l'ordre de la journée (une nuit à cheval garde l'ordre reçu : l'axe sait la lire).
    return segs.some((s) => s.fin < s.debut) ? segs : segs.sort((a, b) => a.debut.localeCompare(b.debut));
  })();

  /**
   * Le chrono ouvert, placé sur SA carte (lot 9) — même règle que le bureau et
   * la borne (`placeLive`, supabase/functions/_shared/live-place.ts) : le
   * planning du chrono, sinon le même chantier, JAMAIS « la première carte ».
   * Seules les cartes « prévu » sont candidates : une ligne déjà notée est du
   * travail fini, pas ce qui tourne. Chantier pointé sans carte (borne,
   * « Autre ») → une carte verte à part. Même jour seulement.
   */
  const liveSession = live.session;
  const liveHere = !!user && !!liveSession && liveSession.work_date === date;
  const livePlace = liveHere && user && liveSession
    ? placeLive([liveSession], plannedTodo.map((p) => ({ id: p.id, user_id: user.id, worksite_id: p.worksite_id, work_date: date })))
      .get(cellKey(user.id, date))
    : undefined;
  const liveSlotId = livePlace?.slotId ?? null;
  const liveSince = livePlace?.since ?? '';
  const liveSynthetic = !!livePlace && !liveSlotId;
  /**
   * Les chantiers prévus par le bureau que le salarié n'a pas ouverts : ils
   * partent AVEC le reste de la feuille.
   *
   * La règle (absence exclue, doublons fondus, horaires du bureau) vit dans
   * `lib/work-status.ts` — elle décide de ce qui part en paie, donc elle doit
   * pouvoir être mise au banc plutôt que se cacher dans un rendu.
   *
   * La carte « en cours » ne part PAS (lot 9) : ses heures seront écrites par
   * « J'ai fini ». La matérialiser les compterait deux fois.
   */
  // Lot 1 : seuls les créneaux sans rien de saisi en face, avec un début ET une
  // fin, peuvent partir — et seulement après le « oui » du salarié (plannedAsk).
  const plannedToSend = planningsToMaterialise(sendablePlannings(plannedTodo.filter((p) => p.id !== liveSlotId), daySpans));

  /**
   * Y a-t-il quelque chose à envoyer ?
   *
   * LE PIÈGE, et il m'a eu : corriger `handleSubmitDay` ne sert à rien si le
   * bouton reste grisé. Il ne s'activait que sur `hasRealDrafts` — donc une
   * journée uniquement planifiée le laissait désactivé et le nouveau code
   * n'était JAMAIS atteint. Tout compilait, tout se testait vert, et le salarié
   * voyait exactement ce qu'il voyait avant. La même porte oubliée que dans
   * `app/poseur/layout.tsx` : on répare la serrure et on laisse le verrou.
   */
  const canSend = hasRealDrafts || plannedToSend.length > 0;

  /**
   * Lot 1 : « travaillées » = les heures SAISIES (lignes, file du téléphone,
   * chrono en cours). Avant, le prévu du bureau y était ajouté : avec les
   * préréglages Matin 08:00–12:00 + Après-midi 13:30–17:00, l'écran disait
   * « 7:30 travaillées » avant toute saisie, et « Envoyer » envoyait ces 7h30.
   * Le prévu s'affiche maintenant à part (« + 7:30 prévues »), et l'envoi
   * demande d'abord s'il a été fait (plannedAsk).
   */
  const plannedMinutes = plannedToSend.reduce((s, p) => s + calculateTotalMinutes(p.start, p.end, 0), 0);
  const liveMinutes = liveHere && liveSession
    ? Math.max(0, Math.floor((liveNow - new Date(liveSession.started_at).getTime()) / 60000))
    : 0;
  const shownMinutes = totalMinutes + liveMinutes;
  const shownChantiers = nbChantiers;

  const gaps = computePauses([
    ...liveEntries.map((e) => ({
      start: (e.start_time || '').slice(0, 5), end: (e.end_time || '').slice(0, 5),
      key: `e:${e.id}`, gap: (e.gap_before ?? null) as 'route' | 'pause' | null,
    })),
    ...pendingEntries.map((e) => ({
      start: (e.start_time || '').slice(0, 5), end: (e.end_time || '').slice(0, 5),
      key: `pe:${e.localId}`, gap: (e.gap_before ?? null) as 'route' | 'pause' | null,
    })),
  ]);
  // Un trou non qualifié n'est NI une pause NI de la route : tant que le
  // salarié n'a pas répondu, on ne décide pas à sa place, et on ne le fait pas
  // entrer dans le total des pauses affiché juste au-dessus de la question.
  const pauses = gaps.filter((g) => g.gap === 'pause');
  // Lot 1 : + les pauses notées DANS les lignes (break_minutes), déjà déduites du total.
  const breakMinutes = liveEntries.reduce((s, e) => s + (e.break_minutes || 0), 0) + pendingEntries.reduce((s, e) => s + (e.break_minutes || 0), 0);
  const breakCount = liveEntries.filter((e) => (e.break_minutes || 0) > 0).length + pendingEntries.filter((e) => (e.break_minutes || 0) > 0).length;
  const pauseMinutes = pauses.reduce((s, p) => s + p.minutes, 0) + breakMinutes;
  const routeMinutes = gaps.filter((g) => g.gap === 'route').reduce((s, p) => s + p.minutes, 0);
  /**
   * Les trous sur lesquels on pose encore la question.
   *
   * Un trou déjà qualifié reste dans la liste quelle que soit sa taille : le
   * salarié a répondu, on ne lui reprend pas sa réponse. Seul le trou SANS
   * réponse et plus long que le seuil disparaît — c'est la question qu'on
   * supprime, pas le temps.
   */
  const askableGaps = gaps.filter((g) => g.gap !== null || g.minutes <= GAP_ASK_MAX_MINUTES);
  const unansweredGaps = askableGaps.filter((g) => g.gap === null).length;

  // "Autre" is a real worksite pinned at the top of the picker (created once per
  // company in Supabase) — for work the secretary hasn't listed / the worker can't name.
  const OTHER_NAME = 'Autre';
  const sortedWorksites = [...worksites].sort((a, b) => {
    if (a.client_name === OTHER_NAME) return -1;
    if (b.client_name === OTHER_NAME) return 1;
    return a.client_name.localeCompare(b.client_name);
  });
  // Lot 23 : un chantier TERMINÉ n'est plus proposé pour une nouvelle intervention ni un nouveau pointage — sauf pour un jour
  // qui n'est pas après sa fin (journée oubliée) ; « Autre » reste toujours proposé. Seules les listes de CHOIX sont
  // filtrées : `worksites` / `sortedWorksites` gardent tout (noms des cartes, pointage en cours).
  const choosable = choosableWorksites(sortedWorksites, [fWorksiteId], date);
  const cq = chantierQuery.trim().toLowerCase();
  const filteredWorksites = cq
    ? choosable.filter((w) => w.client_name.toLowerCase().includes(cq) || (w.city || '').toLowerCase().includes(cq))
    : choosable;
  const autreId = worksites.find((w) => w.client_name === OTHER_NAME)?.id || '';

  /**
   * « Autre » nommé : on en fait un vrai chantier.
   *
   * Hors ligne, l'insertion échouerait et on perdrait le nom tapé : dans ce cas
   * on ne bloque pas, on garde « Autre » et on le dit. Les heures partent quand
   * même — c'est la règle d'or, le chantier ne retient jamais l'heure.
   */
  const creerChantierLibre = async () => {
    const nom = nomLibre.trim();
    if (!nom || !user?.company_id || creationChantier) return;
    setCreationChantier(true);
    try {
      const { data, error } = await supabase.from('worksites')
        .insert({ company_id: user.company_id, client_name: nom, city: villeLibre.trim(), is_active: true })
        .select('*').single();
      if (error) throw error;
      setWorksites((prev) => [...prev, data as Worksite]);
      setFWorksiteId((data as Worksite).id);
      setNomLibre(''); setVilleLibre('');
      toast.success(`Chantier « ${nom} » ajouté`);
    } catch {
      toast.error('Le chantier n’a pas pu être ajouté. Vos heures partiront sur « Autre ».');
    } finally {
      setCreationChantier(false);
    }
  };

  /** La carte où le chrono tourne n'ouvre pas de fiche : ses heures s'écrivent à « J'ai fini ». */
  const tapLive = () => toast.message('Pointage en cours : touche « J’ai fini » en haut quand tu as terminé.');

  // Unified list of the day's slots — planned-not-yet-declared, declared entries, and pending
  // (offline) entries — sorted by start time. The card position stays put as soon as the slot
  // has a start time, so filling a planned card no longer makes it jump to the bottom.
  type DayItem =
    | { kind: 'live'; sort: string; key: string; data: { worksiteId: string | null; since: string } }
    | { kind: 'planned'; sort: string; key: string; data: Planning & { worksite: Worksite; state?: PlannedState } }
    | { kind: 'entry'; sort: string; key: string; data: TimeEntryWithWorksite }
    | { kind: 'pending'; sort: string; key: string; data: PendingEntry }
    | { kind: 'cancelled'; sort: string; key: string; data: TimeEntryWithWorksite };
  const items: DayItem[] = [
    ...(liveSynthetic ? [{ kind: 'live', sort: liveSince || '99:99', key: 'live', data: { worksiteId: livePlace?.worksite_id ?? null, since: liveSince } } as DayItem] : []),
    ...plannedTodo.map((p): DayItem => ({ kind: 'planned', sort: (p.estimated_start || '99:99').slice(0, 5), key: `p:${p.id}`, data: p })),
    ...liveEntries.map((e): DayItem => ({ kind: 'entry', sort: (e.start_time || '99:99').slice(0, 5), key: `e:${e.id}`, data: e })),
    ...pendingEntries.map((pe): DayItem => ({ kind: 'pending', sort: (pe.start_time || '99:99').slice(0, 5), key: `pe:${pe.localId}`, data: pe })),
    ...cancelledEntries.map((e): DayItem => ({ kind: 'cancelled', sort: (e.start_time || '99:99').slice(0, 5), key: `c:${e.id}`, data: e })),
  ].sort((a, b) => a.sort.localeCompare(b.sort));

  // Le trou se dessine juste avant l'intervention qui le suit.
  const gapByKey = new Map(askableGaps.map((g) => [g.key, g]));

  const titleName = !openSlot ? ''
    : openSlot.kind === 'planned' ? (planning.find((p) => p.id === openSlot.planningId)?.worksite?.client_name || '')
    : openSlot.kind === 'entry' ? (entries.find((e) => e.id === openSlot.entryId)?.worksite?.client_name || '')
    : openSlot.kind === 'pending' ? (pendingEntries.find((e) => e.localId === openSlot.localId)?._worksite_name || '')
    : '';
  const titleCity = !openSlot ? ''
    : openSlot.kind === 'planned' ? (planning.find((p) => p.id === openSlot.planningId)?.worksite?.city || '')
    : openSlot.kind === 'entry' ? (entries.find((e) => e.id === openSlot.entryId)?.worksite?.city || '')
    : openSlot.kind === 'pending' ? (pendingEntries.find((e) => e.localId === openSlot.localId)?._worksite_city || '')
    : '';
  const slotWorksiteId = !openSlot ? null
    : openSlot.kind === 'new' ? (fWorksiteId || null)
    : openSlot.kind === 'planned' ? (planning.find((p) => p.id === openSlot.planningId)?.worksite?.id || null)
    : openSlot.kind === 'entry' ? (entries.find((e) => e.id === openSlot.entryId)?.worksite_id || null)
    : null;
  const slotWorksiteName = openSlot?.kind === 'new'
    ? (worksites.find((w) => w.id === fWorksiteId)?.client_name || OTHER_NAME)
    : (titleName || OTHER_NAME);
  const slotTitle = !openSlot ? ''
    : openSlot.kind === 'new' ? 'Nouveau chantier'
    : titleName ? `Chantier ${titleName}` : 'Chantier';

  const editorEntry = openSlot?.kind === 'entry' ? entries.find((x) => x.id === openSlot.entryId) : undefined;
  // Lot 1 : la durée affichée déduit la pause de la ligne.
  const durMin = (fStart && fEnd) ? calculateTotalMinutes(fStart, fEnd, keptBreak({ start: fStart, end: fEnd }, fBreak)) : 0;

  // ─── Lot 10 : raccourcis venus de /pointer (après un scan) ────────────────────
  // LECTURE dans un effet, une seule fois : pendant le rendu, `window.location`
  // n'est pas encore à jour avec la navigation cliente de Next. L'adresse est
  // nettoyée aussitôt : un rechargement ou un retour arrière ne rejoue rien.
  useEffect(() => {
    const search = window.location.search;
    const p = parseAfterScan(search, Date.now());
    if (new URLSearchParams(search).has('a')) window.history.replaceState(window.history.state, '', window.location.pathname);
    if (p) afterScanPending = { ...p, readAt: Date.now() };
  }, []);

  // GESTE, une fois la journée chargée. Remis à null dans TOUS les cas
  // (consommé, expiré, autre compte, autre jour) : il ne resservira pas.
  // Il part à la fin du chargement ET des lectures de clôture (au plus 2 s de plus),
  // et lit les valeurs de CE rendu : les autres dépendances sont volontairement absentes.
  useEffect(() => {
    if (loading || !user || !afterScanPending) return;
    if (!closuresRead && !closuresLate) {
      const id = setTimeout(() => setClosuresLate(true), 2000);
      return () => clearTimeout(id);
    }
    const p = afterScanPending;
    afterScanPending = null;
    if (Date.now() - p.readAt > AFTER_SCAN_USE_MS) {
      toast.message(p.a === 'envoyer' ? 'Ce raccourci a expiré : touchez « Envoyer ma journée ».' : 'Ce raccourci a expiré : touchez « + » pour ajouter une intervention.', LONG_TOAST);
      return;
    }
    if (p.u !== user.id) return;                       // ce n'est pas le compte qui a scanné
    if (dateProp || date !== mountedToday) return;     // une autre journée que celle d'aujourd'hui
    if (p.a === 'envoyer') {
      // La chaîne du bouton « Envoyer ma journée », avec un message à chaque branche.
      // Jamais d'envoi direct : le bouton du dock n'a pas de confirmation propre.
      if (!navigator.onLine) toast.message('Pas de réseau : envoyez votre journée quand il revient.', LONG_TOAST);
      else if (pendingEntries.length > 0) toast.message('Envoyez d\'abord ce qui reste en attente (bouton en bas).', LONG_TOAST);
      else if (submitting) return;
      else if (!loadedRef.current) toast.message('Vos heures n\'ont pas pu être chargées. Réessayez dans un instant.', LONG_TOAST);
      else if (canSend) setSendAsk(true);
      else toast.message(allSubmitted ? 'Journée déjà envoyée.' : 'Rien à envoyer pour l\'instant.');
      return;
    }
    // Le geste du bouton « + » (journée envoyée : même confirmation), puis la plage proposée.
    const kind = p.a;
    const go = () => {
      openNew();
      if (monthLocked) return;
      const span = afterScanSpan(kind, p.h!);
      if (span) setTimes(span.start, span.end);
    };
    if (frozen && !monthLocked) askCorrect(go); else go();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, closuresRead, closuresLate]);

  if (loading) {
    return (
      <div className="bt-day">
        <div className="bt-day-scroll space-y-3">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="bt-day">

      {/* ===== BANDEAU RÉSEAU ===== */}
      {!isOnline && (
        <div className="bt-net bt-net-off">
          <span className="bt-net-dot" />
          <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Hors-ligne, tout est gardé{pendingEntries.length > 0 ? ` · ${pendingEntries.length} en attente` : ''}
          </span>
        </div>
      )}
      {isOnline && syncing && (
        <div className="bt-net bt-net-sync">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          <span>Envoi en cours…</span>
        </div>
      )}

      {/* ===== ZONE SCROLLABLE ===== */}
      <div className="bt-day-scroll">

        {/* rappel « jours oubliés » (rendu par le parent) — défile avec la liste */}
        {topBanner}

        {/* Feuille d'heures d'équipe — chef d'équipe uniquement, affichée sur
            le jour courant ; le chef y choisit lui-même le jour (7 derniers)
            et le salarié (lot 14). La RLS décide seule de ce qu'il peut voir
            et écrire : cet écran n'ajoute aucun filtre de sécurité. */}
        {user?.role === 'lead' && user?.company_id && date === mountedToday && (
          <TeamDay
            me={user}
            today={mountedToday}
            worksites={worksites}
            onChanged={() => { fetchData(); }}
          />
        )}

        {/* Le chrono qui tourne (« J'ai fini », « Annuler »), SEULEMENT sur le
            jour courant. Lot 9 : plus de bloc « Pointer en direct » — on
            démarre depuis la carte du chantier (« Je commence »). Un chrono
            resté ouvert d'un autre jour s'affiche quand même, pour qu'on
            puisse le fermer. */}
        {user?.id && date === mountedToday && (
          <LiveTimer
            userId={user.id}
            session={live.session}
            today={date}
            worksites={sortedWorksites}
            positionActive={positionActive}
          />
        )}
        {/* ----- TOTAL DU JOUR ----- */}
        <div className="bt-total">
          <div className="bt-total-ruban" />
          <div className="bt-total-k">Total aujourd&apos;hui</div>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span className="bt-total-big">{fmtHM(shownMinutes)}</span>
            <span className="bt-total-unit">travaillées</span>
          </div>
          {plannedMinutes > 0 && (
            <div className="bt-total-prevu" data-testid="total-prevu">
              + {fmtHM(plannedMinutes)} prévue{plannedMinutes >= 120 ? 's' : ''} par le bureau, pas encore confirmée{plannedMinutes >= 120 ? 's' : ''}
            </div>
          )}
          <div className="bt-stats">
            <div className="bt-stat">
              <div className="bt-stat-n">{shownChantiers}</div>
              <div className="bt-stat-l">chantier{shownChantiers > 1 ? 's' : ''}</div>
            </div>
            <div className="bt-stat">
              <div className="bt-stat-n">{fmtHM(pauseMinutes)}</div>
              <div className="bt-stat-l">
                pause{pauses.length + breakCount > 1 ? 's' : ''}
                {unansweredGaps > 0 && ` · ${unansweredGaps} à préciser`}
              </div>
            </div>
            {routeMinutes > 0 && (
              <div className="bt-stat">
                <div className="bt-stat-n">{fmtHM(routeMinutes)}</div>
                <div className="bt-stat-l">route{travelPaid ? ' · payée' : ''}</div>
              </div>
            )}
            {/* PANIER REPAS — la case EST l'interrupteur (lot 9) : un appui,
                pris / non pris. Mêmes données qu'avant (meal_allowance, une
                ligne par jour), mêmes garde-fous : mois clos → fenêtre « Mois
                clôturé », journée envoyée → confirmation, lignes chez le
                comptable → grisée. La ligne blanche « Panier repas » a disparu.
                Lot 3 bis : absente si l'entreprise n'utilise pas le panier. */}
            {meal !== false && (
            <button
              type="button"
              className={`bt-stat${dayMeal ? ' on' : ''}`}
              aria-label="Panier repas"
              aria-pressed={dayMeal}
              data-testid="panier"
              data-guide="journee.panier"
              disabled={mealLocked}
              title={mealLocked ? 'Journée chez le comptable : vois avec la secrétaire.' : undefined}
              onClick={() => {
                if (monthLocked) { setLateOpen(true); return; }
                if (frozen) { askCorrect(() => toggleDayMeal(!dayMeal, true)); return; }
                toggleDayMeal(!dayMeal);
              }}
            >
              <span className="bt-stat-n">{dayMeal ? 'Panier ✓' : 'Panier'}</span>
              <span className="bt-stat-l">{dayMeal ? 'repas pris' : 'non pris'}</span>
            </button>
            )}
          </div>
          {ui2 && <MiniFrise segments={friseSegments} />}
        </div>

        {/* Lot 4 : les réunions du jour, au-dessus des chantiers (jamais des heures). */}
        <MyMeetings meetings={missions.meetings} />

        {/* ----- INTERVENTIONS ----- */}
        <div className="bt-sec">Chantiers du jour</div>

        {/* Lot 2 : le bureau a renvoyé la journée. En haut des cartes, avec SON
            motif : c'est la première chose à lire avant de corriger. */}
        {returnedBy && (
          <div className="bt-retour" data-testid="day-returned">
            <AlertTriangle className="h-4 w-4" />
            <div>Le bureau t&apos;a renvoyé cette journée : « {returnedBy.reason} ». Corrige si besoin, puis envoie-la.</div>
          </div>
        )}

        {items.map((item) => {
          const g = gapByKey.get(item.key);
          const gapRow = g ? (
            <div className="bt-gap" key={`${item.key}:gap`}>
              <div className="bt-gap-t">
                <span className="bt-gap-d">{fmtHM(g.minutes)}</span>{' '}
                entre {g.start} et {g.end} —{' '}
                {g.gap === null
                  ? <span className="bt-gap-ask">c'était quoi ?</span>
                  : g.gap === 'route' ? `route${travelPaid ? ' (payée)' : ' (non payée)'}` : 'pause'}
              </div>
              {!monthLocked && (
                <div className="bt-gap-btns" data-guide="journee.trou">
                  <button type="button" className={`bt-gap-b${g.gap === 'route' ? ' on' : ''}`} onClick={() => askGapKind(g.key, 'route')}>Route</button>
                  <button type="button" className={`bt-gap-b${g.gap === 'pause' ? ' on' : ''}`} onClick={() => askGapKind(g.key, 'pause')}>Pause</button>
                </div>
              )}
            </div>
          ) : null;

          const withGap = (node: ReactNode) => gapRow ? <div key={item.key}>{gapRow}{node}</div> : node;

          // Chantier pointé qui n'a pas de carte ce jour-là (scan de la borne,
          // « Autre », planning d'un autre chantier) : il se voit quand même.
          if (item.kind === 'live') {
            const ws = worksites.find((w) => w.id === item.data.worksiteId);
            return (
              <div key={item.key} className="bt-iv live bt-iv-tap" onClick={tapLive} data-testid="card-live">
                <div className="bt-iv-live-k">Pointage en cours</div>
                <div className="bt-iv-top">
                  <span className="bt-iv-name">{ws?.client_name || 'Chantier'}</span>
                </div>
                {ws?.city && <div className="bt-iv-city">{ws.city}</div>}
                <TermineLe ws={ws} />
                <LiveLine since={item.data.since} />
              </div>
            );
          }

          if (item.kind === 'planned') {
            const p = item.data;
            const isLive = p.id === liveSlotId;
            const onTap = isLive ? tapLive : monthLocked ? () => setLateOpen(true) : frozen ? () => askCorrect(() => openPlanned(p)) : () => openPlanned(p);
            return (
              <div key={item.key} className={`bt-iv-plan bt-iv-tap${isLive ? ' live' : ''}`} onClick={onTap} data-testid={isLive ? 'card-live' : 'card-planned'} data-guide={isLive ? undefined : 'journee.chantier'}>
                <div className="bt-plan-k" style={isLive ? { color: '#1F7A4D' } : undefined}>
                  {/* Lot 11 : une heure de début seule (« à 14:00 ») se voit aussi. */}
                  {p.estimated_start && p.estimated_end
                    ? `Prévu · ${p.estimated_start.substring(0, 5)}–${p.estimated_end.substring(0, 5)}`
                    : p.estimated_start ? `Prévu · ${p.estimated_start.substring(0, 5)} · fin à préciser` : 'Prévu · heures à préciser'}
                </div>
                <div className="bt-iv-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="bt-iv-name">{p.worksite?.client_name}</div>
                    {p.worksite?.city && <div className="bt-iv-city">{p.worksite.city}</div>}
                    <TermineLe ws={p.worksite} />
                  </div>
                  {p.worksite?.id && (docsByWorksite.get(p.worksite.id) || 0) > 0 && (
                    <span className="bt-iv-docs"><Paperclip className="h-3 w-3" />{docsByWorksite.get(p.worksite.id)}</span>
                  )}
                  {!isLive && <span className="bt-iv-cta">Mes heures ›</span>}
                </div>
                {/* Lot 1 : ce prévu ne partira pas tel quel — dire pourquoi. */}
                {!isLive && p.state === 'overlaps' && (
                  <div className="bt-plan-warn" data-testid="card-planned-overlap">Chevauche tes heures notées : ne sera pas envoyé. Ouvre-le pour le corriger.</div>
                )}
                {!isLive && p.state === 'incomplete' && (
                  <div className="bt-plan-warn" data-testid="card-planned-incomplete">Heures à préciser : ouvre-le pour les mettre.</div>
                )}
                {isLive ? <LiveLine since={liveSince} /> : null}
              </div>
            );
          }

          if (item.kind === 'entry') {
            const entry = item.data;
            const tappable = isEditable(entry);
            const isDraft = entry.status === 'draft' && !entry.locked;
            const onTap = !tappable ? undefined : monthLocked ? () => setLateOpen(true) : frozen ? () => askCorrect(() => openEntry(entry)) : () => openEntry(entry);
            return withGap(
              <div key={item.key} className={`bt-iv${entry.locked ? ' ok' : entry.status === 'submitted' ? ' sent' : isDraft ? ' draft' : ''}${onTap ? ' bt-iv-tap' : ''}`} onClick={onTap} data-testid="card-entry" data-guide={onTap ? 'journee.chantier' : undefined}>
                <div className="bt-iv-top">
                  <span className="bt-iv-name">{entry.worksite?.client_name || OTHER_NAME}</span>
                  {entry.worksite_id && (docsByWorksite.get(entry.worksite_id) || 0) > 0 && (
                    <span className="bt-iv-docs"><Paperclip className="h-3 w-3" />{docsByWorksite.get(entry.worksite_id)}</span>
                  )}
                  {/* « Exporté » était du vocabulaire de comptable : un salarié
                      ne sait pas ce qu'est un export, il sait où vont ses
                      heures. Même mot sur « Mon équipe ». */}
                  {entry.locked ? (
                    <div className="bt-badge bt-badge-ok"><span className="dot">✓</span> Chez le comptable</div>
                  ) : entry.status === 'submitted' ? (
                    <div className="bt-badge bt-badge-sent"><span className="dot">✓</span> Envoyé</div>
                  ) : isDraft && ui2 && etatLigne(entry) === 'renvoyee' ? (
                    <div className="bt-badge bt-badge-wait dz-badge-renvoye" data-testid="badge-renvoyee">● À corriger</div>
                  ) : isDraft ? (
                    <div className="bt-badge bt-badge-wait">● À envoyer</div>
                  ) : null}
                </div>
                <TermineLe ws={entry.worksite} />
                <div className="bt-iv-times">
                  {entry.worksite?.city && <span className="bt-iv-city">{entry.worksite.city}</span>}
                  {isExitToComplete(entry)
                    ? <span className="bt-iv-times-v">{entry.start_time?.substring(0, 5)} → <b style={{ color: '#C0461F' }}>fin à compléter</b></span>
                    : <span className="bt-iv-times-v">{entry.start_time?.substring(0, 5)} → {entry.end_time?.substring(0, 5)} · {fmtHM(entry.total_minutes)}</span>}
                </div>
                {/* Lot 12 : sortie oubliée (chrono fermé la nuit) — dit simplement. */}
                {entry.exit_forgotten && entry.status === 'draft' && (
                  <div className="bt-iv-reserve avec" data-testid="card-exit-forgotten" data-guide="journee.sortie-oubliee">
                    ⚠ Sortie oubliée{isExitToComplete(entry) ? ' — mets ton heure de fin' : ' — vérifie ton heure de fin'}
                  </div>
                )}
                {/* CE QUE LE BUREAU A CORRIGÉ. Affiché ici même, et pas
                    seulement envoyé en notification : le salarié qui n'a pas
                    activé les notifications doit le voir quand même. Chaque
                    correction garde sa ligne — deux corrections successives se
                    lisent comme une suite, pas comme un état final. */}
                {/* Lot 2 : une correction du bureau AVEC MOTIF remplace la
                    ligne « heures » qu'elle a aussi écrite dans l'ancien journal
                    (correction_id) — une seule ligne par geste, dans l'ordre. */}
                {(() => {
                  const retouches = (mesRetouches.get(entry.id) || []).filter((x) => x.kind === 'correction');
                  const liees = new Set(retouches.map((x) => x.correction_id).filter(Boolean));
                  return [
                    ...(mesCorrections.get(entry.id) || []).filter((c) => !liees.has(c.id)).map((c) => ({ at: c.corrected_at, node: (
                      <div key={c.id} className="bt-iv-corr">
                        <Hammer className="h-3.5 w-3.5 shrink-0" style={{ color: '#8a6d05' }} />
                        <div className="bt-iv-corr-t">
                          {c.corrected_by_role === 'lead' ? 'Ton chef a corrigé' : 'Le bureau a corrigé'} :{' '}
                          <span className="bt-iv-corr-v">{fmtHeure(c.old_start)}–{fmtHeure(c.old_end)}</span>
                          {' → '}
                          <span className="bt-iv-corr-v">{fmtHeure(c.new_start)}–{fmtHeure(c.new_end)}</span>
                        </div>
                      </div>
                    ) })),
                    ...retouches.map((x) => ({ at: x.edited_at, node: (
                      <div key={x.id} className="bt-iv-corr" data-testid="card-office-edit">
                        <Hammer className="h-3.5 w-3.5 shrink-0" style={{ color: '#8a6d05' }} />
                        <div className="bt-iv-corr-t">
                          Le bureau a corrigé : <span className="bt-iv-corr-v">{diffLabels(x.old_values, x.new_values).join(' · ')}</span>
                          {' · '}« {x.reason} »
                        </div>
                      </div>
                    ) })),
                  ].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)).map((r) => r.node);
                })()}
                {/* CE QUI A ÉTÉ GARDÉ SUR LUI — LES MÊMES CHIFFRES QUE LE BUREAU.
                    Je n'affichais d'abord que l'heure et la précision : le
                    salarié savait qu'un endroit avait été noté, sans savoir
                    LEQUEL. C'était une demi-mesure, et la pire des deux — il ne
                    pouvait ni reconnaître son chantier, ni contester un point
                    faux, alors que le bureau, lui, voyait les coordonnées.
                    Cette asymétrie était exactement ce que « le salarié voit ce
                    qui est enregistré sur lui » devait empêcher.

                    Une journée sans endroit n'affiche RIEN : pas de « aucune
                    position », qui ferait du refus une absence à justifier. */}
                {(mesPositions.get(entry.id) || []).length > 0 && (
                  <div className="bt-iv-geo">
                    <MapPin className="h-3.5 w-3.5" />
                    <div>
                      <div>Endroit noté :</div>
                      {(mesPositions.get(entry.id) || [])
                        .slice()
                        .sort((a, b) => (a.moment === 'start' ? -1 : 1) - (b.moment === 'start' ? -1 : 1))
                        .map((p) => (
                          <div key={p.id}>
                            {p.moment === 'start' ? 'départ' : 'fin'} {parisHHmm(p.captured_at)}
                            {' · '}
                            <span className="bt-iv-geo-v">{fmtCoord(p.latitude, p.longitude)}</span>
                            {' '}
                            {positionUtile(p.accuracy_m)
                              ? fmtPrecision(p.accuracy_m)
                              : `${fmtPrecision(p.accuracy_m)} — trop imprécis`}
                          </div>
                        ))}
                    </div>
                  </div>
                )}
                {entry.reception === 'avec' && (
                  // Lot 11 — trois états, une définition (lib/reserves.ts) :
                  // à lever (bouton + formulaire sous la carte), levée par le
                  // bureau, levée par moi. Les gestes ici n'ouvrent jamais la fiche.
                  <div onClick={(ev) => ev.stopPropagation()} data-testid="card-reserve">
                    {isReserveLifted(entry) ? (
                      entry.reserve_resolved_at
                        ? <div className="bt-iv-reserve levee">✓ Réserve levée par le bureau</div>
                        : <div className="bt-iv-reserve corrige">✓ Réserve levée le {format(new Date(entry.reserve_fixed_at!), 'd MMM', { locale: fr })}</div>
                    ) : (
                      <>
                        <div className="bt-iv-reserve avec">⚠ Avec réserve</div>
                        {liftingId === entry.id ? (
                          <ReserveLiftForm tu onSubmit={(note, photo) => liftFromCard(entry, note, photo)} onCancel={() => setLiftingId(null)} />
                        ) : (
                          <div>
                            <button type="button" className="bt-iv-fixbtn" data-testid="card-lift" disabled={!isOnline}
                              onClick={() => setLiftingId(entry.id)}>
                              ✓ Lever la réserve
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                {entry.reception === 'sans' && <div className="bt-iv-reserve sans">✓ Sans réserve</div>}
                {entry.reception === 'en_cours' && <div className="bt-iv-reserve encours">🔨 Chantier en cours</div>}
                {entry.observation && <div className="bt-iv-note">{entry.observation}</div>}
              </div>
            );
          }

          if (item.kind === 'cancelled') {
            const entry = item.data;
            return (
              <div key={item.key} className="bt-iv-cancel">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="bt-cancel-name">{entry.worksite?.client_name || OTHER_NAME}</div>
                  <div className="bt-cancel-time">{entry.start_time?.substring(0, 5)} → {entry.end_time?.substring(0, 5)} · {fmtHM(entry.total_minutes)}</div>
                </div>
                <div className="bt-cancel-badge">Retiré</div>
              </div>
            );
          }

          // pending (offline)
          const entry = item.data;
          return withGap(
            <div key={item.key} className="bt-iv off">
              <div className="bt-iv-top">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="bt-iv-name">{entry._worksite_name}</div>
                  {entry._worksite_city && <div className="bt-iv-city">{entry._worksite_city}</div>}
                </div>
                <div className="bt-badge bt-badge-off">● Sur le téléphone</div>
              </div>
              <div className="bt-iv-times">
                <span>{entry.start_time.substring(0, 5)} → {entry.end_time.substring(0, 5)}</span>
                <span className="dot" />
                <span>{fmtHM(entry.total_minutes)}</span>
              </div>
              <div className="bt-iv-acts">
                <button type="button" className="bt-iv-mod" onClick={() => openPending(entry)}>Modifier</button>
                <button type="button" className="bt-iv-del" onClick={() => setConfirmDel({ kind: 'pending', localId: entry.localId })}>Retirer</button>
              </div>
            </div>
          );
        })}

        {/* Vide → astuce + copier hier */}
        {isEmpty && plannedTodo.length === 0 && !liveSynthetic && (
          <div className="bt-empty">
            <div>Aucun chantier aujourd&apos;hui.</div>
            {isOnline && !monthLocked && (
              <button type="button" className="bt-ghostbtn" data-guide="journee.copier" onClick={handleCopyYesterday} disabled={copyingYesterday}>
                {copyingYesterday ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />} Copier la journée d&apos;hier
              </button>
            )}
          </div>
        )}

        {/* Lot 4 : les tâches du jour ajoutées par le bureau, « Fait » à cocher. */}
        <MyTasks tasks={missions.tasks} online={isOnline} busyId={missions.busyId} onToggle={missions.toggle} />

        {/* Dupliquer cette journée */}
        {!isEmpty && !monthLocked && (
          <div style={{ textAlign: 'center' }}>
            <button type="button" className="bt-dup" data-guide="journee.copier" onPointerDown={() => CalendarLazy.preload()} onClick={() => { setCopyDates([]); setRepeatOpen(true); }}>
              <Copy className="h-4 w-4" /> Dupliquer cette journée
            </button>
          </div>
        )}

        {/* Journée envoyée — note de correction */}
        {allSubmitted && (
          <div className="bt-sentnote">
            {monthLocked
              ? (userLocked && !closedMonths.has(date.slice(0, 7))
                ? `Heures clôturées jusqu'au ${closedUntilLabel} — vois avec la secrétaire pour modifier.`
                : 'Mois clôturé — vois avec la secrétaire pour modifier.')
              : 'Touche un chantier pour le corriger (la secrétaire sera prévenue).'}
          </div>
        )}
      </div>

      {/* ===== BARRE D'ACTION DOCKÉE (bas) ===== */}
      <div className={`bt-day-dock${onAssistant ? ' with-ai' : ''}`}>
        <button
          type="button"
          className="bt-fab"
          data-guide="journee.plus"
          aria-label="Ajouter un chantier"
          onClick={frozen && !monthLocked ? () => askCorrect(openNew) : openNew}
        >
          +
        </button>

        {!isOnline ? (
          <button type="button" className="bt-send" data-guide="journee.envoyer" disabled>Envoyer ma journée</button>
        ) : pendingEntries.length > 0 ? (
          <button type="button" className="bt-send" data-guide="journee.envoyer" onClick={syncPendingEntries} disabled={syncing}>
            {syncing && <Loader2 className="h-4 w-4 animate-spin" />} Envoyer ce qui reste ({pendingEntries.length})
          </button>
        ) : canSend ? (
          <button type="button" className="bt-send" data-guide="journee.envoyer" onClick={frozen ? () => askCorrect(handleSubmitDay) : handleSubmitDay} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Envoyer ma journée <span style={{ fontSize: 19 }}>→</span>
          </button>
        ) : allSubmitted ? (
          <button type="button" className="bt-send done" data-guide="journee.envoyer" disabled>Journée envoyée ✓</button>
        ) : (
          <button type="button" className="bt-send" data-guide="journee.envoyer" disabled>Envoyer ma journée <span style={{ fontSize: 19 }}>→</span></button>
        )}

        {/* Lot 6 : l'assistant vit DANS la barre, plus de bouton flottant qui
            recouvre « Envoyer ma journée ». Absent si l'assistant est coupé :
            « Envoyer » reprend alors toute la largeur (flex:1). */}
        {onAssistant && (
          <button type="button" className="bt-ai" aria-label="Assistant BEMEXO" onClick={onAssistant} data-testid="dock-assistant" data-guide="journee.assistant">
            <Sparkles className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* ===== ÉDITEUR PLEIN ÉCRAN — Ajouter / modifier une intervention ===== */}
      {openSlot && (
        <div className="bt-ed">
          <div className="bt-ed-inner">
            <div className="bt-ed-hdr">
              <button type="button" className="bt-ed-cancel" onClick={cancelSlot}>Annuler</button>
              <div className="bt-ed-title">{slotTitle}</div>
              <span style={{ width: 54, flex: 'none' }} aria-hidden />
            </div>

            <div className="bt-ed-scroll">

              {/* 1 · Chantier */}
              <div className="bt-sec">1 · Chantier</div>
              {openSlot.kind === 'new' ? (
                <>
                <input className="bt-site-search" placeholder="Rechercher un chantier…" value={chantierQuery} onChange={(e) => setChantierQuery(e.target.value)} />
                {filteredWorksites.length === 0 && <div className="bt-site-empty">Aucun chantier trouvé</div>}
                {filteredWorksites.map((ws) => {
                  const isOther = ws.client_name === OTHER_NAME;
                  const on = fWorksiteId === ws.id;
                  return (
                    <button
                      key={ws.id}
                      type="button"
                      className={`bt-site${on ? ' on' : ''}${isOther ? ' other' : ''}`}
                      data-guide={isOther ? 'editeur.autre' : 'editeur.chantier'}
                      onClick={() => setFWorksiteId(ws.id)}
                    >
                      {isOther && !on ? <span className="bt-rdo-plus">+</span> : null}
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="bt-site-name">{isOther ? 'Autre chantier' : ws.client_name}</span>
                        <span className="bt-site-city">{isOther ? 'Travail non prévu, à préciser' : (ws.city || '')}</span>
                      </span>
                      {!(isOther && !on) && <span className="bt-rdo">{on ? '✓' : ''}</span>}
                    </button>
                  );
                })}
                {/* « Autre » coché : de quoi s'agissait-il ? Un restaurant, un
                    dépôt, une adresse que le bureau n'a pas listée. Le nom tapé
                    crée le chantier ; laissé vide, on reste sur « Autre ». */}
                {fWorksiteId && fWorksiteId === autreId && (
                  <div className="bt-nommer">
                    <div className="bt-nommer-t">C&apos;était quoi ?</div>
                    <input
                      className="bt-nommer-in"
                      placeholder="Restaurant Le Central, dépôt, Villa Martin…"
                      value={nomLibre}
                      maxLength={80}
                      onChange={(e) => setNomLibre(e.target.value)}
                    />
                    <input
                      className="bt-nommer-in"
                      placeholder="Ville (facultatif)"
                      value={villeLibre}
                      maxLength={60}
                      onChange={(e) => setVilleLibre(e.target.value)}
                    />
                    <button
                      type="button"
                      className="bt-nommer-go"
                      data-guide="editeur.ajouter-chantier"
                      disabled={!nomLibre.trim() || creationChantier}
                      onClick={creerChantierLibre}
                    >
                      {creationChantier ? 'Ajout…' : 'Ajouter ce chantier'}
                    </button>
                    <span className="bt-nommer-s">Le bureau le verra sous ce nom. Vous pouvez aussi ne rien mettre et rester sur « Autre ».</span>
                  </div>
                )}
                </>
              ) : (
                <div className="bt-site on">
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="bt-site-name">{titleName || OTHER_NAME}</span>
                    {titleCity && <span className="bt-site-city">{titleCity}</span>}
                  </span>
                  <span className="bt-rdo">✓</span>
                </div>
              )}

              {/* 2 · Horaires */}
              <div className="bt-sec">2 · Horaires</div>
              <div className="bt-times">
                <button type="button" className="bt-timecard" data-guide="editeur.horaires" onClick={() => setDrawerField('start')}>
                  <span className="k">Début</span>
                  <span className="v">{fStart}</span>
                </button>
                <button type="button" className="bt-timecard" data-guide="editeur.horaires" onClick={() => setDrawerField('end')}>
                  <span className="k">Fin</span>
                  <span className="v">{fEnd}</span>
                </button>
                <div className="bt-dur">
                  <span className="k">Durée</span>
                  <span className="v">{formatMinutesToHours(durMin)}</span>
                </div>
              </div>
              <div className="bt-times-hint">Touche une heure pour la régler</div>

              {/* Lot 1 : la pause DANS ces heures (déduite de la durée). Les trous
                  entre deux lignes restent comptés à part (Route / Pause).
                  Lot 3bis : le TOTAL des pauses de la ligne — l'indice le dit,
                  pour qu'un salarié à deux lignes ne mette pas sa journée sur chacune. */}
              <div className="bt-sec">Total des pauses</div>
              <PausePicker
                key={fOpenSeq}
                testId="ed-pause"
                label={null}
                hint="Pendant ces heures. Plusieurs pauses ? Additionne-les."
                value={fBreak}
                onChange={setFBreak}
                maxExclusive={fStart && fEnd && fStart !== fEnd ? spanMinutes({ start: fStart, end: fEnd }) : undefined}
                onErrorChange={setFPauseErr}
              />

              {/* 3 · Statut du chantier — en cours / sans / avec réserve (facultatif) */}
              <div className="bt-sec">3 · Statut du chantier <span style={{ textTransform: 'none', letterSpacing: 0, color: '#a39d92' }}>(facultatif)</span></div>
              <div className="bt-recep">
                <button type="button" className={`bt-recep-b encours${fReception === 'en_cours' ? ' on' : ''}`} onClick={() => setFReception(fReception === 'en_cours' ? '' : 'en_cours')}>
                  <Hammer className="h-[18px] w-[18px]" /> En cours
                </button>
                <button type="button" className={`bt-recep-b sans${fReception === 'sans' ? ' on' : ''}`} onClick={() => setFReception(fReception === 'sans' ? '' : 'sans')}>
                  <CheckCircle2 className="h-[18px] w-[18px]" /> Sans réserve
                </button>
                <button type="button" className={`bt-recep-b avec${fReception === 'avec' ? ' on' : ''}`} data-guide="editeur.reserve" onClick={() => setFReception(fReception === 'avec' ? '' : 'avec')}>
                  <AlertTriangle className="h-[18px] w-[18px]" /> Avec réserve
                </button>
              </div>

              {/* 4 · Note (devient « Détail des réserves » si avec réserve) */}
              <div className="bt-sec">4 · {fReception === 'avec' ? 'Détail des réserves' : 'Note'} <span style={{ textTransform: 'none', letterSpacing: 0, color: '#a39d92' }}>(facultatif)</span></div>
              <textarea
                className="bt-note"
                data-guide="editeur.note"
                rows={2}
                placeholder={fReception === 'avec' ? 'Ex. : fissure mur sud' : 'Préciser le travail effectué…'}
                value={fObs}
                onChange={(e) => setFObs(e.target.value)}
              />
            </div>

            {/* Barre d'action dockée */}
            <div className="bt-ed-dock">
              {(slotWorksiteId || (openSlot.kind === 'entry' && editorEntry)) && (
                <div className="bt-ed-dock-row">
                  {slotWorksiteId && (
                    <button type="button" className="bt-ed-doc" data-guide="editeur.documents" onClick={() => setDocsWs({ id: slotWorksiteId, name: slotWorksiteName, entryId: openSlot.kind === 'entry' ? openSlot.entryId : null })}>
                      <FolderOpen className="h-4 w-4" /> Documents
                    </button>
                  )}
                  {openSlot.kind === 'entry' && editorEntry && (
                    <button type="button" className="bt-ed-trash" data-guide="editeur.retirer" disabled={fSaving} onClick={() => setConfirmDel({ kind: 'entry', entry: editorEntry, sent: editorEntry.status === 'submitted' || !!editorEntry.submitted_at })} aria-label="Retirer ce chantier" title="Retirer ce chantier">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
              {/* Bloqué aussi pendant la création d'un chantier : sur une
                  connexion lente, le salarié pouvait taper « Ajouter ce
                  chantier » puis « OK » avant la réponse. fWorksiteId valait
                  encore « Autre » — les heures partaient sur « Autre » et le
                  chantier créé restait orphelin, les deux messages de succès
                  s'affichant côte à côte. Trouvé par Codex sur la PR 104. */}
              <button type="button" className="bt-save" data-guide="editeur.ok" onClick={saveSlot} disabled={fSaving || creationChantier}
                title={creationChantier ? 'Ajout du chantier en cours…' : undefined}>
                {(fSaving || creationChantier) && <Loader2 className="h-4 w-4 animate-spin" />}
                OK <span style={{ fontSize: 18 }}>✓</span>
              </button>
            </div>

            {/* ===== TIROIR MOLETTE ===== */}
            <div className={`bt-overlay${drawerField ? ' open' : ''}`} onClick={() => setDrawerField(null)} />
            <div className={`bt-sheet${drawerField ? ' open' : ''}`}>
              <div className="bt-grip" />
              <div className="bt-seg">
                <button type="button" className={`bt-segb${drawerField !== 'end' ? ' on' : ''}`} onClick={() => setDrawerField('start')}>
                  <span className="lbl">Début</span>
                  <span className="v">{fStart}</span>
                </button>
                <button type="button" className={`bt-segb${drawerField === 'end' ? ' on' : ''}`} onClick={() => setDrawerField('end')}>
                  <span className="lbl">Fin</span>
                  <span className="v">{fEnd}</span>
                </button>
              </div>
              <div className="bt-sheet-dur">
                <span className="k">Durée totale</span>
                <span className="v">{formatMinutesToHours(durMin)}</span>
              </div>
              <div className="bt-molette">
                {/* La molette TimeCylinder et sa mécanique restent intactes. */}
                <TimeCylinder
                  value={drawerField === 'end' ? fEnd : fStart}
                  onChange={(v) => (drawerField === 'end' ? setFEnd(v) : setFStart(v))}
                />
              </div>
              {(() => {
                const cur = drawerField === 'end' ? fEnd : fStart;
                return cur && snapToGrid(cur) !== cur ? (
                  <div className="bt-molette-exact" data-testid="heure-exacte">
                    Heure exacte gardée : <b>{cur}</b> — la molette ne montre que les quarts d&apos;heure.
                  </div>
                ) : null;
              })()}
              <button type="button" className="bt-save" style={{ marginTop: 14 }} onClick={() => setDrawerField(null)}>
                Valider les heures ✓
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Repeat this day onto other days */}
      <Dialog open={repeatOpen} onOpenChange={setRepeatOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Copy className="h-5 w-5" /> Dupliquer cette journée</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Choisis les jours où copier cette journée (mêmes chantiers + heures).</p>
          <div className="flex justify-center">
            <CalendarLazy mode="multiple" selected={copyDates} onSelect={(d) => setCopyDates(d || [])} locale={fr} weekStartsOn={1} disabled={{ before: new Date() }} />
          </div>
          <Button className="w-full h-11" data-guide="copier.valider" disabled={copying || copyTargetStrs.length === 0} onClick={() => copyToDates(copyTargetStrs)}>
            {copying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
            Copier{copyTargetStrs.length > 0 ? ` (${copyTargetStrs.length})` : ''}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Month closed — too late to edit */}
      <Dialog open={lateOpen} onOpenChange={setLateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" /> {userLocked && !closedMonths.has(date.slice(0, 7)) ? 'Heures clôturées' : 'Mois clôturé'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {userLocked && !closedMonths.has(date.slice(0, 7))
              ? `Le bureau a clôturé tes heures jusqu'au ${closedUntilLabel}. Pour toute correction, rapproche-toi de la secrétaire.`
              : 'Le bureau a clôturé ce mois : la paie est partie. Pour toute correction, rapproche-toi de la secrétaire — elle peut rouvrir le mois.'}
          </p>
          <Button className="w-full mt-2" onClick={() => setLateOpen(false)}>Compris</Button>
        </DialogContent>
      </Dialog>

      {/* Confirm correcting an already-sent day */}
      <Dialog open={confirmCorrectOpen} onOpenChange={(o) => { setConfirmCorrectOpen(o); if (!o) setPendingAction(null); }}>
        <DialogContent className="max-w-sm" data-guide-confirm>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-orange-500" /> Journée déjà envoyée</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Cette journée a déjà été envoyée. Si tu y touches, la secrétaire en sera informée.</p>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => { setConfirmCorrectOpen(false); setPendingAction(null); }}>Annuler</Button>
            <Button className="flex-1" onClick={confirmCorrect}>Continuer</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lot 1 : le prévu du bureau ne part qu'après un « oui ». */}
      <Dialog open={plannedAsk} onOpenChange={(o) => { if (!o) setPlannedAsk(false); }}>
        <DialogContent className="max-w-sm" data-testid="planned-confirm" data-guide-confirm>
          <DialogHeader>
            <DialogTitle>Horaires prévus par le bureau</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Tu n&apos;as pas noté d&apos;heures pour :</p>
          <ul className="space-y-1 text-sm font-semibold" data-testid="planned-confirm-list">
            {plannedToSend.map((p) => (
              <li key={p.planningId}>
                {worksites.find((w) => w.id === p.worksiteId)?.client_name || 'Chantier'} · {p.start}–{p.end} ({formatMinutesToHours(calculateTotalMinutes(p.start, p.end, 0))})
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">Tu as travaillé exactement ces horaires&nbsp;?</p>
          <div className="grid gap-2 pt-1">
            <Button className="h-11 font-black" data-testid="planned-confirm-send" onClick={() => answerPlanned('send')}>Oui, envoyer ces horaires</Button>
            <Button variant="outline" className="h-11" data-testid="planned-confirm-fix" onClick={() => answerPlanned('fix')}>Non, je corrige mes heures</Button>
            {(hasRealDrafts || pendingEntries.length > 0) && (
              <Button variant="ghost" className="h-10 text-sm" data-testid="planned-confirm-skip" onClick={() => answerPlanned('skip')}>Envoyer seulement mes heures notées</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Plus de 6 h d'affilée sans pause (borne OU saisie à la main) — un seul toucher
          sur une puce ; « Autre » (h:mm) part avec « OK ». Les lignes du QR passent ici. */}
      <Dialog open={!!pauseAsk} onOpenChange={(o) => { if (!o) setPauseAsk(null); }}>
        <DialogContent className="max-w-sm" data-testid="pause-ask" data-guide-confirm>
          <DialogHeader>
            <DialogTitle>Tu as pris une pause&nbsp;?</DialogTitle>
          </DialogHeader>
          {pauseAsk && (
            <p className="text-sm text-muted-foreground" data-testid="pause-ask-range">
              {pauseAsk.start}–{pauseAsk.end} : {formatMinutesToHours(pauseAsk.minutes)} d&apos;affilée, sans pause notée.
            </p>
          )}
          {pauseAsk && (
            <PausePicker
              key={pauseAsk.id}
              testId="pause"
              value={null}
              zeroLabel="Non"
              confirmLabel="OK"
              hint="Pendant cette plage. Plusieurs pauses ? Additionne-les."
              maxExclusive={pauseAsk.lineMinutes}
              onChange={(m) => void answerPause(m)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Coherence confirmation */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm" data-guide-confirm>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-orange-500" /> Vérification</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {coherenceWarnings.map((w, i) => <p key={i} className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded p-2">{w}</p>)}
            <p className="text-sm text-muted-foreground pt-1">Envoyer quand même ta journée ?</p>
          </div>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmOpen(false)}>Corriger</Button>
            <Button className="flex-1" onClick={() => { setConfirmOpen(false); doSubmit(); }}>Confirmer l&apos;envoi</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation avant de retirer une intervention */}
      <Dialog open={!!confirmDel} onOpenChange={(o) => { if (!o) setConfirmDel(null); }}>
        <DialogContent className="max-w-sm" data-guide-confirm>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-orange-500" /> Retirer ce chantier ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmDel?.kind === 'entry' && confirmDel.sent
              ? 'Il a déjà été envoyé : il restera visible comme « Retiré » et la secrétaire en sera informée.'
              : confirmDel?.kind === 'entry' && isEmptyDraft(confirmDel.entry) && !confirmDel.entry.submitted_at
                ? 'Brouillon vide : il sera supprimé.'
                : 'Les heures seront perdues.'}
          </p>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmDel(null)}>Non</Button>
            <Button
              className="flex-1"
              data-guide="confirmer.retirer"
              onClick={() => {
                const c = confirmDel;
                setConfirmDel(null);
                if (!c) return;
                if (c.kind === 'entry') handleRetire(c.entry); else handleDeletePending(c.localId);
              }}
            >
              Oui, retirer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lot 10 : l'intervention saisie recouvre le pointage en cours. Tout est dit
          ici (heure, ce qui sera compté, consigne pour la borne) : le bouton
          « Terminer le pointage à … » vaut confirmation. Jamais de refus muet. */}
      <Dialog open={!!liveAsk} onOpenChange={(o) => { if (!o && !liveBusyRef.current) setLiveAsk(null); }}>
        <DialogContent className="max-w-sm" data-testid="live-clash" data-guide-confirm onOpenAutoFocus={(e) => { e.preventDefault(); liveFixRef.current?.focus(); }}>
          {liveAsk && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-orange-500" /> Votre pointage est encore en cours</DialogTitle>
                {/* Le problème ET la proposition sont décrits : un lecteur d'écran lit les deux à l'ouverture. */}
                <DialogDescription asChild className="space-y-4 text-foreground">
                  <div>
                    <p data-testid="live-clash-text">
                      {`Vous êtes pointé depuis ${liveAsk.liveStart} et le pointage n'est pas terminé. Vos heures ${liveAsk.span.start}–${liveAsk.span.end} le chevauchent : la journée serait bloquée à l'envoi quand vous terminerez votre pointage.`}
                    </p>
                    <div className="space-y-2 text-left text-muted-foreground" data-testid="live-clash-why">
                      {liveAsk.result.can === 'finish' ? (
                        <>
                          <p>{`Vous pouvez terminer le pointage à ${liveAsk.result.at}, l'heure où commence cette intervention : il comptera de ${liveAsk.liveStart} à ${liveAsk.result.at}.`}</p>
                          {/* L'intervention finit avant maintenant (sans passer minuit) : rien ne couvrira le temps qui reste, il faut le dire. */}
                          {liveAsk.span.end > liveAsk.span.start && liveAsk.span.end < liveAsk.now && (
                            <p data-testid="live-clash-gap">{`Après ${liveAsk.span.end}, rien ne sera compté : si vous avez continué à travailler jusqu'à ${liveAsk.now}, ajoutez ces heures ensuite.`}</p>
                          )}
                          <p>Ensuite, si vous pointez à la borne, ne scannez plus en partant : ajoutez vos dernières heures à la main, sinon la borne ouvrira un nouveau pointage.</p>
                        </>
                      ) : liveAsk.result.why === 'before' ? (
                        <p>{`Cette intervention recouvre le début de votre pointage (${liveAsk.liveStart}). Terminez-la à ${liveAsk.liveStart} au plus tard. Si vous avez vraiment commencé plus tôt, fermez cette fiche, touchez « Terminer ma journée », puis corrigez les heures de la ligne créée.`}</p>
                      ) : liveAsk.result.why === 'at-start' ? (
                        <p>{`Cette intervention commence à ${liveAsk.span.start}, presque en même temps que votre pointage (${liveAsk.liveStart}) : le terminer à ${liveAsk.span.start} ne lui laisserait aucune durée. Corrigez l'heure de début. Si cette intervention est votre travail en cours, touchez « Terminer ma journée » plutôt que de l'ajouter ici.`}</p>
                      ) : liveAsk.result.why === 'future' ? (
                        <p>{`Il est ${liveAsk.now} : cette intervention commence à ${liveAsk.span.start}, plus tard. Corrigez les heures. Si vous avez fini votre journée, fermez cette fiche et touchez « Terminer ma journée », puis ajoutez l'intervention.`}</p>
                      ) : liveAsk.result.why === 'collision' ? (
                        <p>
                          {`Terminer le pointage à ${liveAsk.span.start} chevaucherait ${liveAsk.result.with?.start}–${liveAsk.result.with?.end}, déjà noté. Modifiez ou retirez d'abord cette ligne dans votre journée (fermer la fiche perd la saisie en cours), ou corrigez les heures.`}
                          {liveAsk.result.with?.editable === false && ' Cette ligne est déjà envoyée : seule la secrétaire peut la corriger.'}
                        </p>
                      ) : (
                        <p>Terminer le pointage à une heure précise n&apos;est pas disponible pour l&apos;instant. Corrigez les heures, ou fermez cette fiche et touchez « Terminer ma journée ».</p>
                      )}
                    </div>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2 pt-1">
                {liveAsk.result.can === 'finish' && (
                  <Button className="min-h-11 h-auto py-2 whitespace-normal text-center font-black" data-testid="live-clash-finish" disabled={liveBusy} aria-busy={liveBusy} onClick={finishThenSave}>
                    {liveBusy
                      ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Un instant…</>
                      : `Terminer le pointage à ${liveAsk.result.at}, puis ${liveAsk.action === 'add' ? 'ajouter' : 'enregistrer'}`}
                  </Button>
                )}
                <Button ref={liveFixRef} variant={liveAsk.result.can === 'finish' ? 'outline' : 'default'} className="min-h-11 h-auto py-2 whitespace-normal text-center" data-testid="live-clash-fix" disabled={liveBusy} onClick={() => setLiveAsk(null)}>
                  Corriger les heures
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Lot 10 : « Envoyer ma journée » venu du raccourci de /pointer. Rien ne part
          sans ce « oui » ; ensuite l'envoi garde toutes ses questions habituelles. */}
      <Dialog open={sendAsk} onOpenChange={(o) => { if (!o) setSendAsk(false); }}>
        <DialogContent className="max-w-sm" data-testid="send-ask" data-guide-confirm onOpenAutoFocus={(e) => { e.preventDefault(); sendNoRef.current?.focus(); }}>
          <DialogHeader>
            <DialogTitle>Envoyer votre journée maintenant&nbsp;?</DialogTitle>
            <DialogDescription>Votre journée compte {formatMinutesToHours(totalMinutes)}. Une fois envoyée, la modifier prévient la secrétaire.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 pt-1">
            <Button className="min-h-11 h-auto py-2 whitespace-normal font-black" data-testid="send-ask-yes"
              onClick={() => { setSendAsk(false); if (frozen) askCorrect(handleSubmitDay); else handleSubmitDay(); }}>
              Oui, envoyer ma journée
            </Button>
            <Button ref={sendNoRef} variant="outline" className="min-h-11" data-testid="send-ask-no" onClick={() => setSendAsk(false)}>Pas maintenant</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* La pièce est rattachée au jour affiché, et à l'intervention quand elle
          existe déjà en base. Un créneau prévu ou une saisie encore hors ligne
          n'ont pas d'identifiant : la pièce reste alors rattachée au jour. */}
      <ChantierDocuments
        worksiteId={docsWs?.id || null}
        worksiteName={docsWs?.name}
        workDate={date}
        timeEntryId={docsWs?.entryId || null}
        open={!!docsWs}
        onOpenChange={(o) => { if (!o) setDocsWs(null); }}
      />
    </div>
  );
}
