'use client';

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { PlanningWithWorksite, Worksite, User, Invitation, TimeEntryWithWorksite } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Loader2, AlertTriangle, GripVertical, Check,
  UserPlus, Building2, Archive, CalendarRange, Download, FileSpreadsheet, FileText,
  Bell, Clock, Mail, RefreshCw, X, Pencil,
} from 'lucide-react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks, subDays, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { Slot, SLOT_TIMES, SLOT_SHORT, slotFromTimesOrNull } from '@/lib/slot';
import { computeMissingDays } from '@/lib/work-status';
import { exportEntriesToExcel, exportEntriesToPDF } from '@/lib/export-utils';
import WorkerDetailDialog from '@/components/worker-detail';

// ─── helpers / constants ──────────────────────────────────────────────────────

const WINDOW_DAYS = 21; // how far back the "planned but not declared" dot looks

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

// Colour belongs to the CHANTIER (stable pastel all week), not the poseur.
const CHANTIER_PALETTES = [
  { chip: 'bg-blue-100 border-blue-300 text-blue-800',      dot: 'bg-blue-400' },
  { chip: 'bg-orange-100 border-orange-300 text-orange-700', dot: 'bg-orange-400' },
  { chip: 'bg-green-100 border-green-300 text-green-700',    dot: 'bg-green-400' },
  { chip: 'bg-violet-100 border-violet-300 text-violet-700', dot: 'bg-violet-400' },
  { chip: 'bg-cyan-100 border-cyan-300 text-cyan-700',       dot: 'bg-cyan-400' },
  { chip: 'bg-pink-100 border-pink-300 text-pink-700',       dot: 'bg-pink-400' },
  { chip: 'bg-amber-100 border-amber-300 text-amber-800',    dot: 'bg-amber-400' },
];

const ABSENCE_LABELS: Record<string, string> = { conge: 'Congé', maladie: 'Maladie', intemperie: 'Intempérie', repos: 'Repos' };
const ABSENCE_STATUS_LABELS: Record<string, string> = { conge: 'Congé', maladie: 'Arrêt maladie', intemperie: 'Intempérie', repos: 'Repos' };
const ABSENCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'conge', label: 'Congé' },
  { value: 'maladie', label: 'Arrêt maladie' },
  { value: 'intemperie', label: 'Intempérie' },
  { value: 'repos', label: 'Repos' },
];

type SlotChoice = Slot | 'none';
const SLOT_OPTIONS: { value: SlotChoice; label: string }[] = [
  { value: 'none', label: 'Aucun' },
  { value: 'morning', label: 'Matin' },
  { value: 'afternoon', label: 'Après-midi' },
  { value: 'day', label: 'Journée' },
];
// The affectation popup offers only the 3 real slots (no precise hours).
const SLOT_3 = SLOT_OPTIONS.filter((s) => s.value !== 'none');
const timesForChoice = (c: SlotChoice) =>
  c === 'none' ? { start: null, end: null } : { start: SLOT_TIMES[c].start, end: SLOT_TIMES[c].end };

// Open-ended absences are materialised up to this horizon (no DB column to store
// an "until further notice" flag); the secretary ends them by setting "Présent".
const HORIZON_DAYS = 90;

const HATCH_STYLE = {
  backgroundImage:
    'repeating-linear-gradient(45deg, rgba(100,116,139,0.18) 0, rgba(100,116,139,0.18) 5px, transparent 5px, transparent 10px)',
};
// Trick to let a child `h-full` stretch to the table-row height.
const CELL_HEIGHT_HACK = { height: '1px' } as const;

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
const paletteFor = (p: PlanningWithWorksite) =>
  CHANTIER_PALETTES[hashStr(p.worksite_id || p.id) % CHANTIER_PALETTES.length];

interface RealAgg { minutes: number; start: string; end: string; count: number }
const realKey = (userId: string, date: string, worksiteId: string | null) => `${userId}|${date}|${worksiteId}`;

// ─── compact one-line chantier bubble ──────────────────────────────────────────

function BubbleContent({ p, palette, real }: { p: PlanningWithWorksite; palette: string; real?: RealAgg }) {
  const slot = slotFromTimesOrNull(p.estimated_start, p.estimated_end);
  return (
    <div className={`${palette} border rounded px-2 py-1 text-[11px] leading-tight flex items-center gap-1`}>
      <span className="font-medium truncate flex-1">{p.worksite?.client_name || 'Chantier'}</span>
      {real ? (
        <span className="flex items-center gap-0.5 text-green-700 shrink-0">
          <Check className="h-3 w-3" />{formatMinutes(real.minutes)}
        </span>
      ) : slot ? (
        <span className="opacity-70 shrink-0">{SLOT_SHORT[slot]}</span>
      ) : null}
    </div>
  );
}

function DraggableBubble({
  p, palette, real, onEdit,
}: {
  p: PlanningWithWorksite;
  palette: string;
  real?: RealAgg;
  onEdit: (p: PlanningWithWorksite) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: p.id, data: { type: 'move' } });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => { e.stopPropagation(); onEdit(p); }}
      className={`cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40' : ''}`}
      title="Glisser pour déplacer · cliquer pour modifier"
    >
      <BubbleContent p={p} palette={palette} real={real} />
    </div>
  );
}

// Draggable client chip: appears once a client is chosen, drag it onto a cell.
function PaletteChip({ worksite }: { worksite: Worksite }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: 'palette-new',
    data: { type: 'new', worksiteId: worksite.id },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-1.5 rounded-md border px-3 h-9 text-sm select-none cursor-grab active:cursor-grabbing bg-primary/5 border-primary/30 text-foreground ${isDragging ? 'opacity-40' : ''}`}
      title="Glisser sur une case du planning"
    >
      <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="truncate max-w-[150px]">{worksite.client_name}</span>
    </div>
  );
}

// A droppable day cell whose content fills the full row height.
function DroppableCell({
  workerId, dateStr, isToday, children,
}: {
  workerId: string;
  dateStr: string;
  isToday: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${workerId}|${dateStr}` });
  return (
    <td
      ref={setNodeRef}
      style={CELL_HEIGHT_HACK}
      className={`p-1.5 align-top transition-colors ${
        isOver
          ? 'bg-primary/10 outline-dashed outline-2 -outline-offset-2 outline-primary'
          : isToday ? 'bg-primary/5' : ''
      }`}
    >
      <div className="h-full min-h-[3.25rem]">{children}</div>
    </td>
  );
}

// ─── main ────────────────────────────────────────────────────────────────────

export default function AdminPlanning() {
  const { user } = useAuth();
  const [workers, setWorkers] = useState<User[]>([]);
  const [worksites, setWorksites] = useState<Worksite[]>([]);
  const [planning, setPlanning] = useState<PlanningWithWorksite[]>([]);
  const [realEntries, setRealEntries] = useState<{ user_id: string; work_date: string; worksite_id: string | null; start_time: string; end_time: string; total_minutes: number }[]>([]);
  const [todayAbsence, setTodayAbsence] = useState<Map<string, string>>(new Map());
  const [missingByWorker, setMissingByWorker] = useState<Map<string, string[]>>(new Map());
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));

  // client to place on the planning
  const [paletteWorksiteId, setPaletteWorksiteId] = useState<string>('');
  const [activeDrag, setActiveDrag] = useState<{ id: string; type: 'move' | 'new'; worksiteId?: string } | null>(null);

  // status popup (5 buttons) — opened from a worker cell (today) or an absence day
  const [statusTarget, setStatusTarget] = useState<{ worker: User; fromStr: string } | null>(null);
  // worker fiche
  const [ficheWorker, setFicheWorker] = useState<User | null>(null);

  // team export
  const [exportOpen, setExportOpen] = useState(false);
  const [exportWeek, setExportWeek] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [exporting, setExporting] = useState(false);

  // invitation row actions
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // cell add dialog (client or absence on a specific day)
  const [addOpen, setAddOpen] = useState(false);
  const [addTarget, setAddTarget] = useState<{ workerId: string; date: string } | null>(null);
  const [addMode, setAddMode] = useState<'client' | 'absence'>('client');
  const [addWorksite, setAddWorksite] = useState('');
  const [addSlot, setAddSlot] = useState<SlotChoice>('none');
  const [addAbsenceType, setAddAbsenceType] = useState('');
  const [addNote, setAddNote] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  // affectation (bubble) edit dialog
  const [editing, setEditing] = useState<PlanningWithWorksite | null>(null);
  const [editSlot, setEditSlot] = useState<SlotChoice>('none');
  const [editNote, setEditNote] = useState('');
  // separate client fiche (permanent data) + clients list
  const [clientFiche, setClientFiche] = useState<Worksite | null>(null);
  const [clientsListOpen, setClientsListOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingEdit, setDeletingEdit] = useState(false);
  const [wsName, setWsName] = useState('');
  const [wsProduct, setWsProduct] = useState('');
  const [wsPhone, setWsPhone] = useState('');
  const [wsCity, setWsCity] = useState('');
  const [wsAddress, setWsAddress] = useState('');
  const [wsDesc, setWsDesc] = useState('');
  const [savingWs, setSavingWs] = useState(false);
  const [wsBusy, setWsBusy] = useState(false);

  // absence start dialog (optional end date via calendar)
  const [pendingAbsence, setPendingAbsence] = useState<{ worker: User; type: string; fromStr: string } | null>(null);
  const [absEndDate, setAbsEndDate] = useState<Date | undefined>(undefined);
  const [absSaving, setAbsSaving] = useState(false);

  // create client / worker dialogs
  const [clientOpen, setClientOpen] = useState(false);
  const [cName, setCName] = useState('');
  const [cProduct, setCProduct] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cCity, setCCity] = useState('');
  const [cAddress, setCAddress] = useState('');
  const [cDesc, setCDesc] = useState('');
  const [cSaving, setCSaving] = useState(false);

  const [workerOpen, setWorkerOpen] = useState(false);
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
      const [workersRes, worksitesRes] = await Promise.all([
        supabase.from('users').select('*').eq('company_id', user.company_id).eq('role', 'worker').eq('is_active', true).order('first_name'),
        supabase.from('worksites').select('*').eq('company_id', user.company_id).eq('is_active', true).order('client_name'),
      ]);
      if (workersRes.error) throw workersRes.error;
      if (worksitesRes.error) throw worksitesRes.error;
      setWorkers(workersRes.data || []);
      setWorksites(worksitesRes.data || []);
    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error('Impossible de charger les données');
    } finally {
      setLoading(false);
    }
  }, [user?.company_id]);

  const fetchPlanning = useCallback(async () => {
    if (!user?.company_id) return;
    const weekEnd = addDays(currentWeekStart, 6);
    const from = format(currentWeekStart, 'yyyy-MM-dd');
    const to = format(weekEnd, 'yyyy-MM-dd');
    try {
      const [planRes, realRes] = await Promise.all([
        supabase.from('planning').select('*, worksite:worksites(*), user:users!user_id(*)')
          .eq('company_id', user.company_id).gte('work_date', from).lte('work_date', to).order('work_date'),
        supabase.from('time_entries').select('user_id, work_date, worksite_id, start_time, end_time, total_minutes')
          .eq('company_id', user.company_id).neq('status', 'draft').gte('work_date', from).lte('work_date', to),
      ]);
      if (planRes.error) throw planRes.error;
      setPlanning(planRes.data || []);
      if (!realRes.error) setRealEntries(realRes.data || []);
    } catch (err) {
      console.error('Error fetching planning:', err);
    }
  }, [user?.company_id, currentWeekStart]);

  // Today's absence (status libellé) + planned-but-undeclared dots + company + invitations.
  const fetchExtras = useCallback(async () => {
    if (!user?.company_id) return;
    const windowStart = format(subDays(new Date(), WINDOW_DAYS), 'yyyy-MM-dd');
    const [planRes, entRes, compRes, invRes] = await Promise.all([
      supabase.from('planning').select('user_id, work_date, absence_type').eq('company_id', user.company_id).gte('work_date', windowStart),
      supabase.from('time_entries').select('user_id, work_date').eq('company_id', user.company_id).neq('status', 'draft').gte('work_date', windowStart),
      supabase.from('companies').select('name').eq('id', user.company_id).maybeSingle(),
      supabase.from('invitations').select('*').eq('company_id', user.company_id).is('accepted_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }),
    ]);

    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const planned = new Map<string, Set<string>>();
    const absence = new Map<string, Set<string>>();
    const today = new Map<string, string>();
    for (const p of planRes.data || []) {
      if (p.absence_type) {
        if (!absence.has(p.user_id)) absence.set(p.user_id, new Set());
        absence.get(p.user_id)!.add(p.work_date);
        if (p.work_date === todayKey) today.set(p.user_id, p.absence_type);
      } else {
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
    setTodayAbsence(today);
    setMissingByWorker(miss);
    setCompanyName(compRes.data?.name || '');
    setInvitations((invRes.data || []) as Invitation[]);
  }, [user?.company_id]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchPlanning(); }, [fetchPlanning]);
  useEffect(() => {
    fetchExtras();
    const id = setInterval(fetchExtras, 60000);
    return () => clearInterval(id);
  }, [fetchExtras]);

  const refresh = () => { fetchPlanning(); fetchExtras(); };

  const realMap = useMemo(() => {
    const m = new Map<string, RealAgg>();
    for (const e of realEntries) {
      const k = realKey(e.user_id, e.work_date, e.worksite_id);
      const cur = m.get(k);
      if (!cur) m.set(k, { minutes: e.total_minutes, start: e.start_time, end: e.end_time, count: 1 });
      else {
        cur.minutes += e.total_minutes;
        if (e.start_time && e.start_time < cur.start) cur.start = e.start_time;
        if (e.end_time && e.end_time > cur.end) cur.end = e.end_time;
        cur.count += 1;
      }
    }
    return m;
  }, [realEntries]);

  const realForPlanning = (p: PlanningWithWorksite): RealAgg | undefined =>
    p.absence_type ? undefined : realMap.get(realKey(p.user_id, p.work_date, p.worksite_id));

  // ─── drag (move existing / create new directly, no popup) ───────────────────

  const handleDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as { type?: 'move' | 'new'; worksiteId?: string } | undefined;
    setActiveDrag({ id: String(e.active.id), type: data?.type === 'new' ? 'new' : 'move', worksiteId: data?.worksiteId });
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const drag = activeDrag;
    setActiveDrag(null);
    const { active, over } = e;
    if (!over || !user?.company_id) return;
    const [workerId, dateStr] = String(over.id).split('|');

    // Create directly on drop. Slot/notes set later via the bubble.
    if (drag?.type === 'new') {
      if (!drag.worksiteId) return;
      const ws = worksites.find(w => w.id === drag.worksiteId);
      try {
        const { error } = await supabase.from('planning').insert({
          company_id: user.company_id, created_by: user.id, user_id: workerId, worksite_id: drag.worksiteId,
          work_date: dateStr, estimated_start: null, estimated_end: null, notes: null, absence_type: null,
        });
        if (error) throw error;
        toast.success(`${ws?.client_name || 'Client'} ajouté au planning`);
        fetchPlanning();
      } catch (err) {
        console.error('Error creating planning:', err);
        toast.error("Impossible d'ajouter au planning");
      }
      return;
    }

    // Move an existing assignment.
    const planningId = String(active.id);
    const item = planning.find(p => p.id === planningId);
    if (!item || (item.user_id === workerId && item.work_date === dateStr)) return;
    const prev = planning;
    setPlanning(ps => ps.map(p => p.id === planningId ? { ...p, user_id: workerId, work_date: dateStr } : p));
    try {
      const { error } = await supabase.from('planning').update({ user_id: workerId, work_date: dateStr })
        .eq('id', planningId).eq('company_id', user.company_id);
      if (error) throw error;
    } catch (err) {
      console.error('Error moving planning:', err);
      toast.error('Impossible de déplacer');
      setPlanning(prev);
    }
  };

  // ─── cell add (click) ─────────────────────────────────────────────────────────

  const openAdd = (workerId: string, dateStr: string) => {
    setAddTarget({ workerId, date: dateStr });
    setAddMode('client');
    setAddWorksite(paletteWorksiteId || '');
    setAddSlot('none');
    setAddAbsenceType('');
    setAddNote('');
    setAddOpen(true);
  };

  const confirmAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.company_id || !addTarget) return;
    if (addMode === 'client' && !addWorksite) { toast.error('Choisissez un client'); return; }
    if (addMode === 'absence' && !addAbsenceType) { toast.error("Choisissez le motif d'absence"); return; }
    setAddSaving(true);
    try {
      const isAbs = addMode === 'absence';
      const times = isAbs ? { start: null, end: null } : timesForChoice(addSlot);
      const { error } = await supabase.from('planning').insert({
        company_id: user.company_id, created_by: user.id, user_id: addTarget.workerId,
        worksite_id: isAbs ? null : addWorksite, work_date: addTarget.date,
        estimated_start: times.start, estimated_end: times.end,
        notes: addNote.trim() || null, absence_type: isAbs ? addAbsenceType : null,
      });
      if (error) throw error;
      toast.success(isAbs ? 'Absence enregistrée' : 'Ajouté au planning');
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

  // Mark present FROM a given date (clears absence rows on/after it).
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

  // Choose an absence motif from the status popup → ask for the optional end date.
  const chooseAbsence = (worker: User, type: string, fromStr: string) => {
    setStatusTarget(null);
    setAbsEndDate(undefined);
    setPendingAbsence({ worker, type, fromStr });
  };

  const confirmAbsence = async () => {
    if (!user?.company_id || !pendingAbsence) return;
    const { worker, type, fromStr } = pendingAbsence;
    const endStr = absEndDate ? format(absEndDate, 'yyyy-MM-dd') : format(addDays(new Date(`${fromStr}T00:00:00`), HORIZON_DAYS), 'yyyy-MM-dd');
    if (endStr < fromStr) { toast.error('La date de fin est avant le début'); return; }
    setAbsSaving(true);
    try {
      // One planning absence row per day — no DB column needed.
      const dates: string[] = [];
      let d = new Date(`${fromStr}T00:00:00`);
      const endD = new Date(`${endStr}T00:00:00`);
      let guard = 0;
      while (d <= endD && guard < 400) { dates.push(format(d, 'yyyy-MM-dd')); d = addDays(d, 1); guard++; }

      // Replace any existing absence from the start day forward, then insert the run.
      const { error: delErr } = await supabase.from('planning').delete()
        .eq('company_id', user.company_id).eq('user_id', worker.id)
        .gte('work_date', fromStr).not('absence_type', 'is', null);
      if (delErr) throw delErr;

      const rows = dates.map((dt) => ({
        company_id: user.company_id, created_by: user.id, user_id: worker.id,
        worksite_id: null, work_date: dt, estimated_start: null, estimated_end: null,
        notes: null, absence_type: type,
      }));
      const { error } = await supabase.from('planning').insert(rows);
      if (error) throw error;

      toast.success(absEndDate ? "Absence enregistrée jusqu'à la date de fin" : 'Absence enregistrée (jusqu\'au retour « Présent »)');
      setPendingAbsence(null);
      refresh();
    } catch (err) {
      console.error('Error saving absence:', err);
      toast.error("Impossible d'enregistrer l'absence (si « Repos », ta base la refuse peut-être encore)");
    } finally {
      setAbsSaving(false);
    }
  };

  // mailto reminder for a worker's undeclared days
  const sendReminder = (worker: User) => {
    const missing = missingByWorker.get(worker.id) || [];
    if (!worker.email) { toast.error(`Pas d'email pour ${worker.first_name}`); return; }
    const jours = missing.map((d) => format(parseISO(d), 'EEEE d MMMM', { locale: fr })).join(', ');
    const subject = encodeURIComponent('Rappel : pense à envoyer tes heures');
    const body = encodeURIComponent(
      `Bonjour ${worker.first_name},\n\n`
      + `Il manque l'envoi de tes heures pour : ${jours || 'des journées planifiées'}.\n`
      + `Merci de les saisir et de les envoyer dès que possible depuis l'application Battime.\n\n`
      + `— ${companyName || "L'équipe"}`,
    );
    window.location.href = `mailto:${worker.email}?subject=${subject}&body=${body}`;
    toast.success(`Rappel préparé pour ${worker.first_name}`);
  };

  // ─── team export (locks) ──────────────────────────────────────────────────────

  const runExport = async (kind: 'excel' | 'pdf') => {
    if (!user?.company_id) { toast.error('Profil non chargé'); return; }
    setExporting(true);
    try {
      const weekEnd = endOfWeek(exportWeek, { weekStartsOn: 1 });
      const from = format(exportWeek, 'yyyy-MM-dd');
      const to = format(weekEnd, 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('time_entries')
        .select('*, worksite:worksites(*), user:users!user_id(*)')
        .eq('company_id', user.company_id)
        .gte('work_date', from).lte('work_date', to)
        .order('work_date', { ascending: false }).order('user_id');
      if (error) throw error;
      const entries = (data || []) as (TimeEntryWithWorksite & { user: User })[];
      if (entries.length === 0) { toast.error(`Aucune saisie du ${format(exportWeek, 'dd/MM')} au ${format(weekEnd, 'dd/MM')}`); return; }

      const opts = {
        fileName: `battime-${kind === 'pdf' ? 'rapport' : 'export'}-${from}`,
        title: 'Battime - Rapport hebdomadaire',
        periodLabel: `${format(exportWeek, 'dd/MM/yyyy')} au ${format(weekEnd, 'dd/MM/yyyy')}`,
        companyName,
      };
      if (kind === 'excel') exportEntriesToExcel(entries, opts);
      else exportEntriesToPDF(entries, opts);

      await supabase.from('time_entries').update({ exported_at: new Date().toISOString(), locked: true })
        .in('id', entries.map(e => e.id)).eq('company_id', user.company_id);

      toast.success(`Export téléchargé — ${entries.length} saisie${entries.length > 1 ? 's' : ''} verrouillée${entries.length > 1 ? 's' : ''}`);
    } catch (err) {
      console.error('Error exporting team:', err);
      toast.error("Erreur lors de l'export");
    } finally {
      setExporting(false);
    }
  };

  // ─── invitations ──────────────────────────────────────────────────────────────

  const resendInvitation = async (inv: Invitation) => {
    if (!user?.company_id) return;
    setResendingId(inv.id);
    try {
      const { error } = await supabase.functions.invoke('invite-worker', {
        body: { email: inv.email, first_name: inv.first_name, last_name: inv.last_name, phone: inv.phone || null, company_id: user.company_id, role: 'worker' },
      });
      if (error) throw error;
      toast.success('Invitation renvoyée');
      fetchExtras();
    } catch (err) {
      console.error('Error resending invitation:', err);
      toast.error("Impossible de renvoyer l'invitation");
    } finally {
      setResendingId(null);
    }
  };

  const cancelInvitation = async (inv: Invitation) => {
    if (!user?.company_id) return;
    setCancellingId(inv.id);
    try {
      const { error } = await supabase.from('invitations').delete().eq('id', inv.id).eq('company_id', user.company_id);
      if (error) throw error;
      toast.success('Invitation annulée');
      fetchExtras();
    } catch (err) {
      console.error('Error cancelling invitation:', err);
      toast.error("Impossible d'annuler l'invitation");
    } finally {
      setCancellingId(null);
    }
  };

  // ─── affectation popup (this day only) ──────────────────────────────────────

  const openEdit = (p: PlanningWithWorksite) => {
    setEditing(p);
    setEditSlot(slotFromTimesOrNull(p.estimated_start, p.estimated_end) ?? 'none');
    setEditNote(p.notes || '');
  };

  // Open the separate client fiche (permanent data). Closing it returns to the planning.
  const openClientFiche = (ws: Worksite | null | undefined) => {
    if (!ws) return;
    setWsName(ws.client_name || '');
    setWsProduct(ws.product_type || '');
    setWsPhone(ws.client_phone || '');
    setWsCity(ws.city || '');
    setWsAddress(ws.address || '');
    setWsDesc(ws.description || '');
    setEditing(null);
    setClientFiche(ws);
  };

  const closeEdit = () => { setEditing(null); };

  const saveAffectation = async () => {
    if (!user?.company_id || !editing) return;
    setSavingEdit(true);
    try {
      const times = timesForChoice(editSlot);
      const { error } = await supabase.from('planning').update({
        estimated_start: times.start, estimated_end: times.end, notes: editNote.trim() || null,
      }).eq('id', editing.id).eq('company_id', user.company_id);
      if (error) throw error;
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

  const deleteAffectation = async () => {
    if (!user?.company_id || !editing) return;
    setDeletingEdit(true);
    try {
      const { error } = await supabase.from('planning').delete().eq('id', editing.id).eq('company_id', user.company_id);
      if (error) throw error;
      toast.success('Retiré du planning');
      closeEdit();
      refresh();
    } catch (err) {
      console.error('Error deleting affectation:', err);
      toast.error('Impossible de retirer du planning');
    } finally {
      setDeletingEdit(false);
    }
  };

  const saveClientFiche = async () => {
    if (!user?.company_id || !clientFiche) return;
    if (!wsName.trim()) { toast.error('Le nom du client est requis'); return; }
    setSavingWs(true);
    try {
      const patch = {
        client_name: wsName.trim(), product_type: wsProduct.trim() || null, client_phone: wsPhone.trim() || null,
        city: wsCity.trim() || null, address: wsAddress.trim() || null, description: wsDesc.trim() || null,
      };
      const { error } = await supabase.from('worksites').update(patch).eq('id', clientFiche.id).eq('company_id', user.company_id);
      if (error) throw error;
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
      const { error } = await supabase.from('worksites').update({ is_active: false })
        .eq('id', clientFiche.id).eq('company_id', user.company_id);
      if (error) throw error;
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

  // Delete only if nothing is linked to the client; otherwise archive.
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

  const resetClient = () => { setCName(''); setCProduct(''); setCPhone(''); setCCity(''); setCAddress(''); setCDesc(''); };

  const createClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.company_id) return;
    if (!cName.trim()) { toast.error('Le nom du client est requis'); return; }
    setCSaving(true);
    try {
      const { data, error } = await supabase.from('worksites').insert({
        company_id: user.company_id, client_name: cName.trim(), product_type: cProduct.trim() || null,
        client_phone: cPhone.trim() || null, city: cCity.trim() || null, address: cAddress.trim() || null,
        description: cDesc.trim() || null, is_active: true,
      }).select().single();
      if (error) throw error;
      toast.success('Client créé — glisse-le sur le planning');
      setClientOpen(false);
      resetClient();
      await fetchData();
      if (data?.id) setPaletteWorksiteId(data.id);
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
      const { error } = await supabase.functions.invoke('invite-worker', {
        body: { email: wEmail, first_name: wFirst, last_name: wLast, phone: wPhone || null, company_id: user.company_id, role: 'worker' },
      });
      if (error) throw error;
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

  const weekDays = Array.from({ length: 6 }, (_, i) => addDays(currentWeekStart, i));

  const chantiersForDay = (workerId: string, dateStr: string) =>
    planning
      .filter(p => p.user_id === workerId && p.work_date === dateStr && !p.absence_type)
      .sort((a, b) => {
        const sa = a.estimated_start || '99:99:99';
        const sb = b.estimated_start || '99:99:99';
        if (sa !== sb) return sa.localeCompare(sb);
        return (a.created_at || '').localeCompare(b.created_at || '');
      });

  const absenceForDay = (workerId: string, dateStr: string) =>
    planning.find(p => p.user_id === workerId && p.work_date === dateStr && p.absence_type);

  const chantierLegend = useMemo(() => {
    const map = new Map<string, { id: string; name: string; dot: string }>();
    planning.forEach(p => {
      if (p.absence_type || !p.worksite_id || map.has(p.worksite_id)) return;
      map.set(p.worksite_id, { id: p.worksite_id, name: p.worksite?.client_name || 'Chantier', dot: paletteFor(p).dot });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [planning]);

  const workerEmails = useMemo(() => new Set(workers.map(w => w.email.toLowerCase())), [workers]);
  const pendingInvites = invitations.filter(inv => !workerEmails.has(inv.email.toLowerCase()));

  const paletteWorksite = worksites.find(w => w.id === paletteWorksiteId) || null;
  const editRealAgg = editing ? realForPlanning(editing) : undefined;
  const statusMissing = statusTarget ? (missingByWorker.get(statusTarget.worker.id) || []) : [];

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Planning</h2>
        <p className="text-muted-foreground text-sm">Glisse un client sur une case · clique une case pour ajouter · clique un salarié pour son statut</p>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveDrag(null)}>
        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
          <Button variant="outline" size="sm" onClick={() => setWorkerOpen(true)}>
            <UserPlus className="h-4 w-4 mr-1.5" /> Nouveau salarié
          </Button>
          <Button variant="outline" size="sm" onClick={() => setClientOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Nouveau client
          </Button>
          <Button variant="outline" size="sm" onClick={() => setClientsListOpen(true)}>
            <Building2 className="h-4 w-4 mr-1.5" /> Clients
          </Button>
          <Select value={paletteWorksiteId} onValueChange={setPaletteWorksiteId}>
            <SelectTrigger className="h-9 w-[190px]"><SelectValue placeholder="Choisir un client" /></SelectTrigger>
            <SelectContent>
              {worksites.map(ws => (
                <SelectItem key={ws.id} value={ws.id}>{ws.client_name}{ws.city ? ` — ${ws.city}` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {paletteWorksite && <PaletteChip worksite={paletteWorksite} />}
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
            <Download className="h-4 w-4 mr-1.5" /> Exporter
          </Button>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setCurrentWeekStart(subWeeks(currentWeekStart, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center min-w-[170px] text-sm font-medium">
              {format(currentWeekStart, 'd MMM', { locale: fr })} – {format(addDays(currentWeekStart, 5), 'd MMM yyyy', { locale: fr })}
            </div>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Pending invitations (kept from the old dashboard) */}
        {pendingInvites.length > 0 && (
          <div className="mt-3 space-y-1.5 rounded-lg border border-yellow-200 bg-yellow-50/50 p-2.5">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Invitations en attente</p>
            {pendingInvites.map(inv => (
              <div key={inv.id} className="flex items-center gap-2 text-sm">
                <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="min-w-0 flex-1 truncate">{inv.first_name} {inv.last_name} · {inv.email}</span>
                <Button variant="outline" size="sm" className="h-7" onClick={() => resendInvitation(inv)} disabled={resendingId === inv.id || cancellingId === inv.id}>
                  {resendingId === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  <span className="hidden sm:inline ml-1">Relancer</span>
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => cancelInvitation(inv)} disabled={resendingId === inv.id || cancellingId === inv.id}>
                  {cancellingId === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Legend */}
        {chantierLegend.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card p-3 mt-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chantiers de la semaine</span>
            {chantierLegend.map(c => (
              <div key={c.id} className="flex items-center gap-1.5">
                <span className={`h-3 w-3 rounded-[3px] ${c.dot}`} />
                <span className="text-xs">{c.name}</span>
              </div>
            ))}
          </div>
        )}

        <Card className="mt-3">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left font-medium w-36 sm:w-44 sticky left-0 bg-muted/50 z-10">Salarié</th>
                    {weekDays.map(day => {
                      const isToday = format(day, 'yyyy-MM-dd') === todayStr;
                      return (
                        <th key={day.toISOString()} className={`p-2 text-center font-medium min-w-[140px] ${isToday ? 'bg-primary/10' : ''}`}>
                          <div className="text-xs text-muted-foreground capitalize">{format(day, 'EEEE', { locale: fr })}</div>
                          <div className={`text-lg tabular ${isToday ? 'font-bold text-primary' : ''}`}>{format(day, 'd')}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {workers.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Aucun salarié — utilise « Nouveau salarié »</td></tr>
                  ) : (
                    workers.map(worker => {
                      const abs = todayAbsence.get(worker.id);
                      const missingCount = (missingByWorker.get(worker.id) || []).length;
                      const fullName = `${worker.first_name} ${worker.last_name}`;
                      return (
                        <tr key={worker.id} className="border-b last:border-b-0">
                          {/* Whole left cell opens the status popup */}
                          <td style={CELL_HEIGHT_HACK} className="p-0 align-top sticky left-0 bg-background z-10">
                            <button
                              onClick={() => setStatusTarget({ worker, fromStr: todayStr })}
                              className="flex h-full w-full items-start gap-2 p-3 text-left hover:bg-muted/50 transition-colors"
                              title="Cliquer pour le statut et la fiche"
                            >
                              <span className="relative shrink-0">
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                                  {((worker.first_name?.[0] || '') + (worker.last_name?.[0] || '')).toUpperCase()}
                                </span>
                                {missingCount > 0 && (
                                  <span
                                    className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-bold text-white"
                                    title={`${missingCount} jour(s) planifié(s) non déclaré(s)`}
                                  >
                                    {missingCount}
                                  </span>
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{fullName}</span>
                                <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <span className={`h-2 w-2 rounded-full ${abs ? 'bg-orange-500' : 'bg-green-500'}`} />
                                  {abs ? (ABSENCE_STATUS_LABELS[abs] || abs) : 'Présent'}
                                </span>
                              </span>
                            </button>
                          </td>

                          {weekDays.map(day => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const absence = absenceForDay(worker.id, dateStr);
                            const chantiers = chantiersForDay(worker.id, dateStr);
                            return (
                              <DroppableCell key={dateStr} workerId={worker.id} dateStr={dateStr} isToday={dateStr === todayStr}>
                                {absence ? (
                                  // Absence fills the whole cell; click → status popup from that day.
                                  <button
                                    style={HATCH_STYLE}
                                    onClick={() => setStatusTarget({ worker, fromStr: dateStr })}
                                    className="flex h-full min-h-[3.25rem] w-full items-center justify-center rounded border border-slate-300 px-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-600 hover:border-slate-400"
                                    title="Absence — cliquer pour changer le statut"
                                  >
                                    {ABSENCE_LABELS[absence.absence_type!] || absence.absence_type}
                                  </button>
                                ) : (
                                  // Empty / chantier cell: whole area clickable to add.
                                  <div
                                    className="group flex h-full min-h-[3.25rem] cursor-pointer flex-col gap-1 rounded p-0.5 hover:bg-muted/40 transition-colors"
                                    onClick={() => openAdd(worker.id, dateStr)}
                                    title="Cliquer pour ajouter une intervention"
                                  >
                                    {chantiers.map(p => (
                                      <DraggableBubble key={p.id} p={p} palette={paletteFor(p).chip} real={realForPlanning(p)} onEdit={openEdit} />
                                    ))}
                                    <div className="flex flex-1 items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Plus className="h-4 w-4 text-muted-foreground/50" />
                                    </div>
                                  </div>
                                )}
                              </DroppableCell>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <DragOverlay>
          {activeDrag?.type === 'new' && paletteWorksite ? (
            <div className="rotate-[-2deg] scale-105 shadow-xl"><PaletteChip worksite={paletteWorksite} /></div>
          ) : activeDrag?.type === 'move' ? (
            (() => {
              const p = planning.find(x => x.id === activeDrag.id);
              return p ? <div className="rotate-[-2deg] scale-105 shadow-xl"><BubbleContent p={p} palette={paletteFor(p).chip} real={realForPlanning(p)} /></div> : null;
            })()
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Status popup — 5 clear buttons + fiche + reminder */}
      <Dialog open={!!statusTarget} onOpenChange={(o) => { if (!o) setStatusTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {statusTarget ? `Statut de ${statusTarget.worker.first_name} à partir ${statusTarget.fromStr === todayStr ? "d'aujourd'hui" : `du ${fromLabel(statusTarget.fromStr)}`}` : ''}
            </DialogTitle>
          </DialogHeader>
          {statusTarget && (
            <div className="space-y-2 pt-1">
              <Button variant="outline" className="w-full justify-start h-11 text-[15px]" onClick={() => { setPresentFrom(statusTarget.worker.id, statusTarget.fromStr); setStatusTarget(null); }}>
                <span className="h-3 w-3 rounded-full bg-green-500 mr-3" /> Présent
              </Button>
              {ABSENCE_OPTIONS.map(opt => (
                <Button key={opt.value} variant="outline" className="w-full justify-start h-11 text-[15px]" onClick={() => chooseAbsence(statusTarget.worker, opt.value, statusTarget.fromStr)}>
                  <span className="h-3 w-3 rounded-full bg-orange-500 mr-3" /> {opt.label}
                </Button>
              ))}

              <div className="border-t pt-2 mt-1 space-y-1">
                <Button variant="ghost" className="w-full justify-start" onClick={() => { setFicheWorker(statusTarget.worker); setStatusTarget(null); }}>
                  <Clock className="h-4 w-4 mr-2" /> Voir les heures / la fiche
                </Button>
                {statusMissing.length > 0 && (
                  <Button variant="ghost" className="w-full justify-start text-orange-600 hover:text-orange-700" onClick={() => sendReminder(statusTarget.worker)}>
                    <Bell className="h-4 w-4 mr-2" /> Envoyer un rappel ({statusMissing.length} jour{statusMissing.length > 1 ? 's' : ''} non déclaré{statusMissing.length > 1 ? 's' : ''})
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Worker fiche (detailed) */}
      <WorkerDetailDialog
        worker={ficheWorker}
        onOpenChange={(open) => { if (!open) setFicheWorker(null); }}
        onChanged={() => { fetchData(); refresh(); }}
      />

      {/* Team export */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Exporter les heures de l'équipe</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>Semaine du {format(exportWeek, 'd MMM yyyy', { locale: fr })}</Label>
              <Input
                type="date"
                value={format(exportWeek, 'yyyy-MM-dd')}
                onChange={(e) => { if (e.target.value) setExportWeek(startOfWeek(parseISO(`${e.target.value}T00:00:00`), { weekStartsOn: 1 })); }}
              />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => runExport('excel')} disabled={exporting}>
                {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />} Excel
              </Button>
              <Button className="flex-1" variant="outline" onClick={() => runExport('pdf')} disabled={exporting}>
                {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />} PDF
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Verrouille les saisies exportées (paie).</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cell add (client or absence on a specific day) */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setAddTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ajouter au planning</DialogTitle></DialogHeader>
          <form onSubmit={confirmAdd} className="space-y-4 pt-2">
            <div className="flex gap-2">
              <Button type="button" variant={addMode === 'client' ? 'default' : 'outline'} className="flex-1" onClick={() => setAddMode('client')}>Client</Button>
              <Button type="button" variant={addMode === 'absence' ? 'default' : 'outline'} className="flex-1" onClick={() => setAddMode('absence')}>Absence</Button>
            </div>
            {addMode === 'client' ? (
              <>
                <div className="space-y-2">
                  <Label>Client</Label>
                  <Select value={addWorksite} onValueChange={setAddWorksite}>
                    <SelectTrigger><SelectValue placeholder="Choisir un client" /></SelectTrigger>
                    <SelectContent>
                      {worksites.map(ws => <SelectItem key={ws.id} value={ws.id}>{ws.client_name}{ws.city ? ` — ${ws.city}` : ''}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Créneau</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {SLOT_OPTIONS.map(s => (
                      <Button key={s.value} type="button" variant={addSlot === s.value ? 'default' : 'outline'} onClick={() => setAddSlot(s.value)}>{s.label}</Button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label className="flex items-center gap-1"><AlertTriangle className="h-4 w-4 text-orange-500" /> Motif d'absence</Label>
                <Select value={addAbsenceType} onValueChange={setAddAbsenceType}>
                  <SelectTrigger><SelectValue placeholder="Choisir le motif" /></SelectTrigger>
                  <SelectContent>
                    {ABSENCE_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Note (optionnel)</Label>
              <Textarea value={addNote} onChange={(e) => setAddNote(e.target.value)} rows={2} />
            </div>
            <Button type="submit" className="w-full" disabled={addSaving}>
              {addSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Enregistrer
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Absence start — optional end date via calendar */}
      <Dialog open={!!pendingAbsence} onOpenChange={(o) => { if (!o) setPendingAbsence(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {pendingAbsence ? `${ABSENCE_STATUS_LABELS[pendingAbsence.type] || pendingAbsence.type} — ${pendingAbsence.worker.first_name}` : ''}
            </DialogTitle>
          </DialogHeader>
          {pendingAbsence && (
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                Début {pendingAbsence.fromStr === todayStr ? "aujourd'hui" : `le ${fromLabel(pendingAbsence.fromStr)}`}.
              </p>
              <div className="space-y-1">
                <Label>Date de fin (optionnel)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start font-normal">
                      <CalendarRange className="h-4 w-4 mr-2" />
                      {absEndDate ? format(absEndDate, 'EEEE d MMMM yyyy', { locale: fr }) : 'Choisir une date…'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={absEndDate}
                      onSelect={setAbsEndDate}
                      numberOfMonths={1}
                      locale={fr}
                      disabled={{ before: new Date(`${pendingAbsence.fromStr}T00:00:00`) }}
                      defaultMonth={absEndDate || new Date(`${pendingAbsence.fromStr}T00:00:00`)}
                    />
                  </PopoverContent>
                </Popover>
                <div className="flex items-center justify-between pt-0.5">
                  <p className="text-xs text-muted-foreground">Laisser vide si indéterminé</p>
                  {absEndDate && (
                    <Button type="button" variant="ghost" size="sm" className="h-auto p-0 text-xs" onClick={() => setAbsEndDate(undefined)}>Effacer</Button>
                  )}
                </div>
              </div>
              <Button className="w-full" onClick={confirmAbsence} disabled={absSaving}>
                {absSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Enregistrer l'absence
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Affectation popup — ONLY this day's assignment */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) closeEdit(); }}>
        <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.worksite?.client_name || 'Intervention'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 pt-1">
              {/* Client (read-only) + link to the separate fiche */}
              <div className="rounded-lg border bg-muted/30 p-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-base font-semibold truncate">{editing.worksite?.client_name || 'Client'}</p>
                  {(editing.worksite?.address || editing.worksite?.city) && (
                    <p className="text-xs text-muted-foreground truncate">
                      {[editing.worksite?.address, editing.worksite?.city].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
                {editing.worksite && (
                  <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground" onClick={() => openClientFiche(editing.worksite)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Fiche client
                  </Button>
                )}
              </div>

              {/* Slot — Matin / Après-midi / Journée (no precise hours) */}
              <div className="space-y-2">
                <Label>Créneau</Label>
                <div className="grid grid-cols-3 gap-2">
                  {SLOT_3.map(s => (
                    <Button key={s.value} type="button" size="sm" variant={editSlot === s.value ? 'default' : 'outline'} onClick={() => setEditSlot(s.value)}>{s.label}</Button>
                  ))}
                </div>
              </div>

              {/* Note for the poseur */}
              <div className="space-y-2">
                <Label>Note pour le poseur</Label>
                <Textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} rows={2} placeholder="Ex : code portail 1234, prendre la grande échelle, attention au chien…" />
                <p className="text-xs text-muted-foreground">Consigne visible par le poseur sur son mobile.</p>
              </div>

              {/* Real hours (read-only) */}
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-medium mb-1">Heures déclarées</p>
                {editRealAgg ? (
                  <div className="flex items-center gap-2 text-green-700">
                    <Check className="h-4 w-4" />
                    <span>{editRealAgg.start?.substring(0, 5)}–{editRealAgg.end?.substring(0, 5)} · <strong>{formatMinutes(editRealAgg.minutes)} réelles</strong>{editRealAgg.count > 1 ? ` (${editRealAgg.count} saisies)` : ''}</span>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Pas encore déclaré par le salarié</p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Button onClick={saveAffectation} disabled={savingEdit}>
                  {savingEdit && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Enregistrer
                </Button>
                <Button variant="outline" className="text-destructive" onClick={deleteAffectation} disabled={deletingEdit}>
                  {deletingEdit ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />} Retirer du planning
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Client fiche — permanent client data (separate) */}
      <Dialog open={!!clientFiche} onOpenChange={(o) => { if (!o) setClientFiche(null); }}>
        <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Fiche client</DialogTitle>
          </DialogHeader>
          {clientFiche && (
            <div className="space-y-3 pt-1">
              <div className="space-y-2"><Label>Nom du client</Label><Input value={wsName} onChange={(e) => setWsName(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2"><Label>Type de produit</Label><Input value={wsProduct} onChange={(e) => setWsProduct(e.target.value)} /></div>
                <div className="space-y-2"><Label>Téléphone</Label><Input type="tel" value={wsPhone} onChange={(e) => setWsPhone(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2"><Label>Ville</Label><Input value={wsCity} onChange={(e) => setWsCity(e.target.value)} /></div>
                <div className="space-y-2"><Label>Adresse</Label><Input value={wsAddress} onChange={(e) => setWsAddress(e.target.value)} /></div>
              </div>
              <div className="space-y-2"><Label>Description</Label><Textarea value={wsDesc} onChange={(e) => setWsDesc(e.target.value)} rows={2} /></div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button onClick={saveClientFiche} disabled={savingWs}>
                  {savingWs && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Enregistrer
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

      {/* Clients list — open any client fiche */}
      <Dialog open={clientsListOpen} onOpenChange={setClientsListOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Clients</DialogTitle></DialogHeader>
          <div className="space-y-1 pt-1">
            {worksites.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Aucun client — utilise « Nouveau client »</p>
            ) : (
              worksites.map(ws => (
                <button
                  key={ws.id}
                  onClick={() => { setClientsListOpen(false); openClientFiche(ws); }}
                  className="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{ws.client_name}</span>
                    {(ws.city || ws.product_type) && <span className="block truncate text-xs text-muted-foreground">{[ws.product_type, ws.city].filter(Boolean).join(' · ')}</span>}
                  </span>
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Nouveau client */}
      <Dialog open={clientOpen} onOpenChange={(o) => { setClientOpen(o); if (!o) resetClient(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nouveau client / chantier</DialogTitle></DialogHeader>
          <form onSubmit={createClient} className="space-y-4 pt-2">
            <div className="space-y-2"><Label>Nom du client *</Label><Input value={cName} onChange={(e) => setCName(e.target.value)} required disabled={cSaving} /></div>
            <div className="space-y-2"><Label>Type de produit</Label><Input placeholder="Stores, volets, pergola…" value={cProduct} onChange={(e) => setCProduct(e.target.value)} disabled={cSaving} /></div>
            <div className="space-y-2"><Label>Téléphone</Label><Input type="tel" value={cPhone} onChange={(e) => setCPhone(e.target.value)} disabled={cSaving} /></div>
            <div className="space-y-2"><Label>Ville</Label><Input value={cCity} onChange={(e) => setCCity(e.target.value)} disabled={cSaving} /></div>
            <div className="space-y-2"><Label>Adresse</Label><Input value={cAddress} onChange={(e) => setCAddress(e.target.value)} disabled={cSaving} /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={cDesc} onChange={(e) => setCDesc(e.target.value)} rows={2} disabled={cSaving} /></div>
            <Button type="submit" className="w-full" disabled={cSaving}>
              {cSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Créer le client
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Nouveau salarié */}
      <Dialog open={workerOpen} onOpenChange={(o) => { setWorkerOpen(o); if (!o) resetWorker(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nouveau salarié</DialogTitle></DialogHeader>
          <form onSubmit={createWorker} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Prénom *</Label><Input value={wFirst} onChange={(e) => setWFirst(e.target.value)} required disabled={wSaving} /></div>
              <div className="space-y-2"><Label>Nom *</Label><Input value={wLast} onChange={(e) => setWLast(e.target.value)} required disabled={wSaving} /></div>
            </div>
            <div className="space-y-2"><Label>Email *</Label><Input type="email" value={wEmail} onChange={(e) => setWEmail(e.target.value)} required disabled={wSaving} /></div>
            <div className="space-y-2"><Label>Téléphone</Label><Input type="tel" value={wPhone} onChange={(e) => setWPhone(e.target.value)} disabled={wSaving} /></div>
            <Button type="submit" className="w-full" disabled={wSaving}>
              {wSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Envoyer l'invitation
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
