'use client';

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { PlanningWithWorksite, Worksite, User } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Loader2, AlertTriangle, GripVertical, Check,
  UserPlus, Building2, Archive, ArchiveRestore, Settings2, Pencil, CalendarRange,
} from 'lucide-react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { format, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { Slot, SLOT_TIMES, SLOT_SHORT, slotFromTimesOrNull } from '@/lib/slot';

// ─── helpers / constants ──────────────────────────────────────────────────────

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
const timesForChoice = (c: SlotChoice) =>
  c === 'none' ? { start: null, end: null } : { start: SLOT_TIMES[c].start, end: SLOT_TIMES[c].end };

// Open-ended absences are materialised up to this horizon (no DB column to store
// an "until further notice" flag); the secretary ends them by setting "Présent".
const HORIZON_DAYS = 90;

// Grey hatch for absence cells.
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

// Draggable client chip ("palette"): drag onto a cell to create directly.
function PaletteChip({ worksite }: { worksite: Worksite | null }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: 'palette-new',
    data: { type: 'new', worksiteId: worksite?.id },
    disabled: !worksite,
  });
  return (
    <div
      ref={setNodeRef}
      {...(worksite ? attributes : {})}
      {...(worksite ? listeners : {})}
      className={`flex items-center gap-1.5 rounded-md border px-3 h-10 text-sm select-none ${
        worksite
          ? 'cursor-grab active:cursor-grabbing bg-primary/5 border-primary/30 text-foreground'
          : 'opacity-50 cursor-not-allowed bg-muted border-dashed'
      } ${isDragging ? 'opacity-40' : ''}`}
      title={worksite ? 'Glisser sur une case du planning' : 'Choisis un client à glisser'}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="truncate max-w-[160px]">{worksite ? worksite.client_name : 'Choisis un client…'}</span>
    </div>
  );
}

// A droppable day cell. Content fills the full row height (so an absence covers
// the whole cell, and the empty area is fully clickable to add).
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
  const [loading, setLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));

  // palette
  const [paletteWorksiteId, setPaletteWorksiteId] = useState<string>('');
  const [activeDrag, setActiveDrag] = useState<{ id: string; type: 'move' | 'new'; worksiteId?: string } | null>(null);

  // cell add dialog (client or absence on a specific day)
  const [addOpen, setAddOpen] = useState(false);
  const [addTarget, setAddTarget] = useState<{ workerId: string; date: string } | null>(null);
  const [addMode, setAddMode] = useState<'client' | 'absence'>('client');
  const [addWorksite, setAddWorksite] = useState('');
  const [addSlot, setAddSlot] = useState<SlotChoice>('none');
  const [addAbsenceType, setAddAbsenceType] = useState('');
  const [addNote, setAddNote] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  // bubble edit dialog
  const [editing, setEditing] = useState<PlanningWithWorksite | null>(null);
  const [editWorksiteId, setEditWorksiteId] = useState('');
  const [editSlot, setEditSlot] = useState<SlotChoice>('none');
  const [editNote, setEditNote] = useState('');
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
  const [pendingAbsence, setPendingAbsence] = useState<{ worker: User; type: string } | null>(null);
  const [absEndDate, setAbsEndDate] = useState<Date | undefined>(undefined);
  const [absSaving, setAbsSaving] = useState(false);

  // worker management dialog (modify name)
  const [manageWorker, setManageWorker] = useState<User | null>(null);
  const [mFirst, setMFirst] = useState('');
  const [mLast, setMLast] = useState('');
  const [mPhone, setMPhone] = useState('');
  const [mSaving, setMSaving] = useState(false);
  const [mBusy, setMBusy] = useState(false);

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

  // Worker status libellé reflects TODAY's state (current absence, if any).
  const fetchTodayStatus = useCallback(async () => {
    if (!user?.company_id) return;
    const { data } = await supabase.from('planning').select('user_id, absence_type')
      .eq('company_id', user.company_id).eq('work_date', format(new Date(), 'yyyy-MM-dd')).not('absence_type', 'is', null);
    const m = new Map<string, string>();
    for (const r of data || []) if (r.absence_type) m.set(r.user_id, r.absence_type);
    setTodayAbsence(m);
  }, [user?.company_id]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchPlanning(); }, [fetchPlanning]);
  useEffect(() => { fetchTodayStatus(); }, [fetchTodayStatus]);

  const refresh = () => { fetchPlanning(); fetchTodayStatus(); };

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

    // Create directly on drop — no slot popup. Slot/notes set later via the bubble.
    if (drag?.type === 'new') {
      if (!drag.worksiteId) return;
      const ws = worksites.find(w => w.id === drag.worksiteId);
      try {
        const { error } = await supabase.from('planning').insert({
          company_id: user.company_id, created_by: user.id, user_id: workerId, worksite_id: drag.worksiteId,
          work_date: dateStr, estimated_start: null, estimated_end: null, notes: null, absence_type: null,
        });
        if (error) throw error;
        toast.success(`${ws?.client_name || 'Chantier'} affecté`);
        fetchPlanning();
      } catch (err) {
        console.error('Error creating planning:', err);
        toast.error("Impossible de créer l'affectation");
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
      toast.error("Impossible de déplacer l'affectation");
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
    if (addMode === 'client' && !addWorksite) { toast.error('Choisissez un chantier'); return; }
    if (addMode === 'absence' && !addAbsenceType) { toast.error("Choisissez le type d'absence"); return; }
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
      toast.success(isAbs ? 'Absence enregistrée' : 'Affectation créée');
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

  // Mark the worker present FROM a given date (clears absence rows on/after it).
  // Earlier days stay marked absent. Works even for open-ended absences.
  const setPresentFrom = async (workerId: string, fromStr: string) => {
    if (!user?.company_id) return;
    try {
      const { error } = await supabase.from('planning').delete()
        .eq('company_id', user.company_id).eq('user_id', workerId)
        .gte('work_date', fromStr).not('absence_type', 'is', null);
      if (error) throw error;
      toast.success(fromStr === todayStr
        ? 'Salarié repassé présent'
        : `Présent à partir du ${format(new Date(`${fromStr}T00:00:00`), 'd MMM', { locale: fr })}`);
      refresh();
    } catch (err) {
      console.error('Error setting present:', err);
      toast.error('Impossible de mettre à jour le statut');
    }
  };

  const askAbsence = (worker: User, type: string) => {
    setPendingAbsence({ worker, type });
    setAbsEndDate(undefined);
  };

  const confirmAbsence = async () => {
    if (!user?.company_id || !pendingAbsence) return;
    const endStr = absEndDate ? format(absEndDate, 'yyyy-MM-dd') : format(addDays(new Date(), HORIZON_DAYS), 'yyyy-MM-dd');
    if (endStr < todayStr) { toast.error("La date de fin est avant aujourd'hui"); return; }
    setAbsSaving(true);
    try {
      // One planning absence row per day — no DB column needed.
      const dates: string[] = [];
      let d = new Date(`${todayStr}T00:00:00`);
      const endD = new Date(`${endStr}T00:00:00`);
      let guard = 0;
      while (d <= endD && guard < 400) { dates.push(format(d, 'yyyy-MM-dd')); d = addDays(d, 1); guard++; }

      // Replace any existing absence from today forward, then insert the new run.
      const { error: delErr } = await supabase.from('planning').delete()
        .eq('company_id', user.company_id).eq('user_id', pendingAbsence.worker.id)
        .gte('work_date', todayStr).not('absence_type', 'is', null);
      if (delErr) throw delErr;

      const rows = dates.map((dt) => ({
        company_id: user.company_id, created_by: user.id, user_id: pendingAbsence.worker.id,
        worksite_id: null, work_date: dt, estimated_start: null, estimated_end: null,
        notes: null, absence_type: pendingAbsence.type,
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

  // Change the absence type from a given day onward (for the current run).
  const changeAbsenceFrom = async (workerId: string, fromStr: string, type: string) => {
    if (!user?.company_id) return;
    try {
      const { error } = await supabase.from('planning').update({ absence_type: type })
        .eq('company_id', user.company_id).eq('user_id', workerId)
        .gte('work_date', fromStr).not('absence_type', 'is', null);
      if (error) throw error;
      toast.success("Type d'absence mis à jour");
      refresh();
    } catch (err) {
      console.error('Error changing absence type:', err);
      toast.error("Impossible de changer le type (si « Repos », ta base la refuse peut-être encore)");
    }
  };

  const deleteAbsenceDay = async (planningId: string) => {
    if (!user?.company_id) return;
    try {
      const { error } = await supabase.from('planning').delete().eq('id', planningId).eq('company_id', user.company_id);
      if (error) throw error;
      toast.success("Jour d'absence supprimé");
      refresh();
    } catch (err) {
      console.error('Error deleting absence day:', err);
      toast.error('Impossible de supprimer');
    }
  };

  // ─── worker management (mirror of the fiche) ────────────────────────────────

  const openManage = (w: User) => {
    setManageWorker(w);
    setMFirst(w.first_name || '');
    setMLast(w.last_name || '');
    setMPhone(w.phone || '');
  };

  const saveWorkerName = async () => {
    if (!user?.company_id || !manageWorker) return;
    if (!mFirst.trim() || !mLast.trim()) { toast.error('Prénom et nom requis'); return; }
    setMSaving(true);
    try {
      const { error } = await supabase.from('users').update({
        first_name: mFirst.trim(), last_name: mLast.trim(), phone: mPhone.trim() || null,
      }).eq('id', manageWorker.id).eq('company_id', user.company_id);
      if (error) throw error;
      toast.success('Salarié modifié');
      setManageWorker(null);
      fetchData();
    } catch (err) {
      console.error('Error updating worker:', err);
      toast.error('Impossible de modifier le salarié');
    } finally {
      setMSaving(false);
    }
  };

  const toggleArchiveWorker = async (w: User) => {
    if (!user?.company_id) return;
    setMBusy(true);
    try {
      const { error } = await supabase.from('users').update({ is_active: !w.is_active })
        .eq('id', w.id).eq('company_id', user.company_id);
      if (error) throw error;
      toast.success(w.is_active ? 'Salarié archivé' : 'Salarié réactivé');
      fetchData();
    } catch (err) {
      console.error('Error archiving worker:', err);
      toast.error('Impossible de mettre à jour le salarié');
    } finally {
      setMBusy(false);
    }
  };

  // Delete only if the worker is an empty shell (no entries, no planning).
  const deleteWorkerRow = async (w: User) => {
    if (!user?.company_id) return;
    setMBusy(true);
    try {
      const [{ count: entryCount, error: e1 }, { count: planCount, error: e2 }] = await Promise.all([
        supabase.from('time_entries').select('*', { count: 'exact', head: true }).eq('user_id', w.id),
        supabase.from('planning').select('*', { count: 'exact', head: true }).eq('user_id', w.id),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if ((entryCount || 0) > 0 || (planCount || 0) > 0) {
        toast.error('Ce salarié a des données. Archivez-le plutôt.');
        return;
      }
      const { error } = await supabase.from('users').delete().eq('id', w.id).eq('company_id', user.company_id);
      if (error) throw error;
      toast.success('Salarié supprimé');
      fetchData();
    } catch (err) {
      console.error('Error deleting worker:', err);
      toast.error('Impossible de supprimer le salarié');
    } finally {
      setMBusy(false);
    }
  };

  // ─── bubble edit (chantier) ─────────────────────────────────────────────────

  const openEdit = (p: PlanningWithWorksite) => {
    setEditing(p);
    setEditWorksiteId(p.worksite_id || '');
    setEditSlot(slotFromTimesOrNull(p.estimated_start, p.estimated_end) ?? 'none');
    setEditNote(p.notes || '');
    const ws = p.worksite;
    setWsName(ws?.client_name || '');
    setWsProduct(ws?.product_type || '');
    setWsPhone(ws?.client_phone || '');
    setWsCity(ws?.city || '');
    setWsAddress(ws?.address || '');
    setWsDesc(ws?.description || '');
  };

  const closeEdit = () => { setEditing(null); };

  const saveAffectation = async () => {
    if (!user?.company_id || !editing) return;
    if (!editWorksiteId) { toast.error('Choisissez un chantier'); return; }
    setSavingEdit(true);
    try {
      const times = timesForChoice(editSlot);
      const { error } = await supabase.from('planning').update({
        worksite_id: editWorksiteId, estimated_start: times.start, estimated_end: times.end, notes: editNote.trim() || null,
      }).eq('id', editing.id).eq('company_id', user.company_id);
      if (error) throw error;
      toast.success('Modifié');
      closeEdit();
      refresh();
    } catch (err) {
      console.error('Error saving affectation:', err);
      toast.error('Impossible de modifier');
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
      toast.success('Supprimé');
      closeEdit();
      refresh();
    } catch (err) {
      console.error('Error deleting affectation:', err);
      toast.error('Impossible de supprimer');
    } finally {
      setDeletingEdit(false);
    }
  };

  const saveWorksite = async () => {
    if (!user?.company_id || !editing?.worksite_id) return;
    if (!wsName.trim()) { toast.error('Le nom du client est requis'); return; }
    setSavingWs(true);
    try {
      const { error } = await supabase.from('worksites').update({
        client_name: wsName.trim(), product_type: wsProduct.trim() || null, client_phone: wsPhone.trim() || null,
        city: wsCity.trim() || null, address: wsAddress.trim() || null, description: wsDesc.trim() || null,
      }).eq('id', editing.worksite_id).eq('company_id', user.company_id);
      if (error) throw error;
      toast.success('Chantier modifié');
      fetchData();
      fetchPlanning();
    } catch (err) {
      console.error('Error saving worksite:', err);
      toast.error('Impossible de modifier le chantier');
    } finally {
      setSavingWs(false);
    }
  };

  const archiveWorksite = async () => {
    if (!user?.company_id || !editing?.worksite_id) return;
    setWsBusy(true);
    try {
      const { error } = await supabase.from('worksites').update({ is_active: false })
        .eq('id', editing.worksite_id).eq('company_id', user.company_id);
      if (error) throw error;
      toast.success('Chantier archivé');
      closeEdit();
      fetchData();
      fetchPlanning();
    } catch (err) {
      console.error('Error archiving worksite:', err);
      toast.error("Impossible d'archiver le chantier");
    } finally {
      setWsBusy(false);
    }
  };

  const deleteWorksite = async () => {
    if (!user?.company_id || !editing?.worksite_id) return;
    const worksiteId = editing.worksite_id;
    setWsBusy(true);
    try {
      const [{ count: entryCount, error: e1 }, { count: planCount, error: e2 }] = await Promise.all([
        supabase.from('time_entries').select('*', { count: 'exact', head: true }).eq('worksite_id', worksiteId),
        supabase.from('planning').select('*', { count: 'exact', head: true }).eq('worksite_id', worksiteId),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const others = (planCount || 0) - 1;
      if ((entryCount || 0) > 0 || others > 0) {
        toast.error('Chantier utilisé ailleurs. Archivez-le plutôt.');
        return;
      }
      await supabase.from('planning').delete().eq('id', editing.id).eq('company_id', user.company_id);
      const { error } = await supabase.from('worksites').delete().eq('id', worksiteId).eq('company_id', user.company_id);
      if (error) throw error;
      toast.success('Chantier supprimé');
      closeEdit();
      fetchData();
      fetchPlanning();
    } catch (err) {
      console.error('Error deleting worksite:', err);
      toast.error('Impossible de supprimer le chantier');
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

  const paletteWorksite = worksites.find(w => w.id === paletteWorksiteId) || null;
  const editRealAgg = editing ? realForPlanning(editing) : undefined;

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header + actions */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Planning</h2>
          <p className="text-muted-foreground text-sm">Glisse un client sur une case · clique une case pour ajouter · clique un salarié pour son statut</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setClientOpen(true)}>
            <Building2 className="h-4 w-4 mr-2" /> Nouveau client
          </Button>
          <Button variant="outline" onClick={() => setWorkerOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" /> Nouveau salarié
          </Button>
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveDrag(null)}>
        {/* Palette + week nav */}
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Select value={paletteWorksiteId} onValueChange={setPaletteWorksiteId}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Choisir un client à affecter" /></SelectTrigger>
              <SelectContent>
                {worksites.map(ws => (
                  <SelectItem key={ws.id} value={ws.id}>{ws.client_name}{ws.city ? ` — ${ws.city}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <PaletteChip worksite={paletteWorksite} />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCurrentWeekStart(subWeeks(currentWeekStart, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center min-w-[190px] text-sm font-medium">
              {format(currentWeekStart, 'd MMM', { locale: fr })} – {format(addDays(currentWeekStart, 5), 'd MMM yyyy', { locale: fr })}
            </div>
            <Button variant="outline" size="icon" onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

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
                      const fullName = `${worker.first_name} ${worker.last_name}`;
                      return (
                        <tr key={worker.id} className="border-b last:border-b-0">
                          {/* Whole left cell is the status + settings menu */}
                          <td style={CELL_HEIGHT_HACK} className="p-0 align-top sticky left-0 bg-background z-10">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="flex h-full w-full items-start gap-2 p-3 text-left hover:bg-muted/50 transition-colors">
                                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground shrink-0">
                                    {((worker.first_name?.[0] || '') + (worker.last_name?.[0] || '')).toUpperCase()}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium">{fullName}</span>
                                    <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                      <span className={`h-2 w-2 rounded-full ${abs ? 'bg-orange-500' : 'bg-green-500'}`} />
                                      {abs ? (ABSENCE_STATUS_LABELS[abs] || abs) : 'Présent'}
                                    </span>
                                  </span>
                                  <Settings2 className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-56">
                                <DropdownMenuLabel className="truncate">{fullName}</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => setPresentFrom(worker.id, todayStr)}>
                                  <span className="h-2 w-2 rounded-full bg-green-500 mr-2" /> Présent
                                </DropdownMenuItem>
                                {ABSENCE_OPTIONS.map(opt => (
                                  <DropdownMenuItem key={opt.value} onClick={() => askAbsence(worker, opt.value)}>
                                    <span className="h-2 w-2 rounded-full bg-orange-500 mr-2" /> {opt.label}
                                  </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => openManage(worker)}>
                                  <Pencil className="h-3.5 w-3.5 mr-2" /> Modifier le nom
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => toggleArchiveWorker(worker)}>
                                  {worker.is_active
                                    ? <><Archive className="h-3.5 w-3.5 mr-2" /> Archiver</>
                                    : <><ArchiveRestore className="h-3.5 w-3.5 mr-2" /> Réactiver</>}
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteWorkerRow(worker)}>
                                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Supprimer
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>

                          {weekDays.map(day => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const absence = absenceForDay(worker.id, dateStr);
                            const chantiers = chantiersForDay(worker.id, dateStr);
                            return (
                              <DroppableCell key={dateStr} workerId={worker.id} dateStr={dateStr} isToday={dateStr === todayStr}>
                                {absence ? (
                                  // Absence fills the whole cell; click to reactivate / change / remove.
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        style={HATCH_STYLE}
                                        className="flex h-full min-h-[3.25rem] w-full items-center justify-center rounded border border-slate-300 px-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-600 hover:border-slate-400"
                                        title="Absence — cliquer pour gérer"
                                      >
                                        {ABSENCE_LABELS[absence.absence_type!] || absence.absence_type}
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="w-60">
                                      <DropdownMenuItem onClick={() => setPresentFrom(worker.id, dateStr)}>
                                        <span className="h-2 w-2 rounded-full bg-green-500 mr-2" /> Présent à partir de ce jour
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">Changer le type (à partir de ce jour)</DropdownMenuLabel>
                                      {ABSENCE_OPTIONS.map(opt => (
                                        <DropdownMenuItem key={opt.value} onClick={() => changeAbsenceFrom(worker.id, dateStr, opt.value)}>
                                          <span className="h-2 w-2 rounded-full bg-orange-500 mr-2" /> {opt.label}
                                        </DropdownMenuItem>
                                      ))}
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteAbsenceDay(absence.id)}>
                                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Supprimer ce jour
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
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

      {/* Cell add (client or absence on a specific day) */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setAddTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ajouter au planning</DialogTitle></DialogHeader>
          <form onSubmit={confirmAdd} className="space-y-4 pt-2">
            <div className="flex gap-2">
              <Button type="button" variant={addMode === 'client' ? 'default' : 'outline'} className="flex-1" onClick={() => setAddMode('client')}>Chantier</Button>
              <Button type="button" variant={addMode === 'absence' ? 'default' : 'outline'} className="flex-1" onClick={() => setAddMode('absence')}>Absence</Button>
            </div>
            {addMode === 'client' ? (
              <>
                <div className="space-y-2">
                  <Label>Chantier</Label>
                  <Select value={addWorksite} onValueChange={setAddWorksite}>
                    <SelectTrigger><SelectValue placeholder="Choisir un chantier" /></SelectTrigger>
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
                <Label className="flex items-center gap-1"><AlertTriangle className="h-4 w-4 text-orange-500" /> Type d'absence</Label>
                <Select value={addAbsenceType} onValueChange={setAddAbsenceType}>
                  <SelectTrigger><SelectValue placeholder="Choisir le type" /></SelectTrigger>
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
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Début aujourd'hui ({format(new Date(), 'EEEE d MMMM', { locale: fr })}).
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
                    disabled={{ before: new Date() }}
                    defaultMonth={absEndDate || new Date()}
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
        </DialogContent>
      </Dialog>

      {/* Worker management — modify name */}
      <Dialog open={!!manageWorker} onOpenChange={(o) => { if (!o) setManageWorker(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Modifier le salarié</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Prénom</Label><Input value={mFirst} onChange={(e) => setMFirst(e.target.value)} disabled={mSaving} /></div>
              <div className="space-y-2"><Label>Nom</Label><Input value={mLast} onChange={(e) => setMLast(e.target.value)} disabled={mSaving} /></div>
            </div>
            <div className="space-y-2"><Label>Téléphone</Label><Input type="tel" value={mPhone} onChange={(e) => setMPhone(e.target.value)} disabled={mSaving} /></div>
            <Button className="w-full" onClick={saveWorkerName} disabled={mSaving || mBusy}>
              {mSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bubble edit (chantier) */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) closeEdit(); }}>
        <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.worksite?.client_name || 'Affectation'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-5 pt-2">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Chantier</Label>
                  <Select value={editWorksiteId} onValueChange={setEditWorksiteId}>
                    <SelectTrigger><SelectValue placeholder="Chantier" /></SelectTrigger>
                    <SelectContent>
                      {worksites.map(ws => <SelectItem key={ws.id} value={ws.id}>{ws.client_name}{ws.city ? ` — ${ws.city}` : ''}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Créneau</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {SLOT_OPTIONS.map(s => (
                      <Button key={s.value} type="button" size="sm" variant={editSlot === s.value ? 'default' : 'outline'} onClick={() => setEditSlot(s.value)}>{s.label}</Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Note</Label>
                  <Textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} rows={2} />
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={saveAffectation} disabled={savingEdit}>
                    {savingEdit && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Enregistrer
                  </Button>
                  <Button variant="outline" className="text-destructive" onClick={deleteAffectation} disabled={deletingEdit}>
                    {deletingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

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

              {editing.worksite_id && (
                <div className="space-y-3 border-t pt-4">
                  <p className="font-medium text-sm flex items-center gap-2"><Building2 className="h-4 w-4" /> Modifier ce chantier</p>
                  <div className="space-y-2"><Label>Nom du client</Label><Input value={wsName} onChange={(e) => setWsName(e.target.value)} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2"><Label>Type produit</Label><Input value={wsProduct} onChange={(e) => setWsProduct(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Téléphone</Label><Input value={wsPhone} onChange={(e) => setWsPhone(e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2"><Label>Ville</Label><Input value={wsCity} onChange={(e) => setWsCity(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Adresse</Label><Input value={wsAddress} onChange={(e) => setWsAddress(e.target.value)} /></div>
                  </div>
                  <div className="space-y-2"><Label>Description</Label><Textarea value={wsDesc} onChange={(e) => setWsDesc(e.target.value)} rows={2} /></div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={saveWorksite} disabled={savingWs}>
                      {savingWs && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Enregistrer le chantier
                    </Button>
                    <Button size="sm" variant="outline" onClick={archiveWorksite} disabled={wsBusy}>
                      <Archive className="h-4 w-4 mr-1" /> Archiver
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={deleteWorksite} disabled={wsBusy} title="Supprimer (seulement si aucune donnée rattachée)">
                      <Trash2 className="h-4 w-4 mr-1" /> Supprimer
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
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
