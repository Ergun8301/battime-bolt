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
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Loader2, AlertTriangle,
  GripVertical, Check, UserPlus, Building2, Archive,
} from 'lucide-react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { format, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { Slot, SLOT_TIMES, SLOT_LABELS, SLOT_SHORT, SLOT_ORDER, slotFromTimes } from '@/lib/slot';

// ─── helpers ─────────────────────────────────────────────────────────────────

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
const ABSENCE_PALETTE = { chip: 'bg-slate-100 border-slate-300 text-slate-600', dot: 'bg-slate-400' };
const ABSENCE_LABELS: Record<string, string> = { conge: 'Congé', maladie: 'Maladie', intemperie: 'Intempérie' };

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
const paletteFor = (p: PlanningWithWorksite) =>
  p.absence_type ? ABSENCE_PALETTE : CHANTIER_PALETTES[hashStr(p.worksite_id || p.id) % CHANTIER_PALETTES.length];

interface RealAgg { minutes: number; start: string; end: string; count: number }
const realKey = (userId: string, date: string, worksiteId: string | null) => `${userId}|${date}|${worksiteId}`;

// ─── compact bubble ──────────────────────────────────────────────────────────

function BubbleContent({ p, palette, real }: { p: PlanningWithWorksite; palette: string; real?: RealAgg }) {
  const isAbs = !!p.absence_type;
  const slot = slotFromTimes(p.estimated_start, p.estimated_end);
  return (
    <div className={`${palette} border rounded-md px-2 py-1 text-[11px] leading-tight`}>
      <div className="flex items-center gap-1">
        <span className="font-medium truncate flex-1">
          {isAbs ? (ABSENCE_LABELS[p.absence_type!] || p.absence_type) : (p.worksite?.client_name || 'Chantier')}
        </span>
        {!isAbs && <span className="opacity-70 shrink-0">{SLOT_SHORT[slot]}</span>}
      </div>
      {!isAbs && real && (
        <div className="flex items-center gap-1 mt-0.5 text-green-700">
          <Check className="h-3 w-3 shrink-0" />
          <span className="font-semibold">{formatMinutes(real.minutes)} réelles</span>
        </div>
      )}
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
      onClick={() => onEdit(p)}
      className={`cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40' : ''}`}
      title="Glisser pour déplacer · cliquer pour modifier"
    >
      <BubbleContent p={p} palette={palette} real={real} />
    </div>
  );
}

// A draggable client chip (the "palette"): drag onto a cell to create.
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

function DroppableCell({
  workerId, dateStr, isToday, onAdd, children,
}: {
  workerId: string;
  dateStr: string;
  isToday: boolean;
  onAdd: (workerId: string, dateStr: string) => void;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${workerId}|${dateStr}` });
  return (
    <td
      ref={setNodeRef}
      className={`p-1.5 align-top transition-colors ${
        isOver ? 'bg-primary/10 outline-dashed outline-2 -outline-offset-2 outline-primary' : isToday ? 'bg-primary/5' : ''
      }`}
    >
      {/* Fixed height so a worker row never grows — bubbles scroll within. */}
      <div className="flex flex-col h-28">
        <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">{children}</div>
        <button
          type="button"
          onClick={() => onAdd(workerId, dateStr)}
          className="mt-1 h-5 shrink-0 rounded text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex items-center justify-center gap-1"
        >
          <Plus className="h-3 w-3" /> Ajouter
        </button>
      </div>
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
  const [loading, setLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));

  // palette
  const [paletteWorksiteId, setPaletteWorksiteId] = useState<string>('');
  const [activeDrag, setActiveDrag] = useState<{ id: string; type: 'move' | 'new'; worksiteId?: string } | null>(null);

  // drop slot picker (after dragging a client onto a cell)
  const [dropOpen, setDropOpen] = useState(false);
  const [dropTarget, setDropTarget] = useState<{ workerId: string; date: string; worksiteId: string } | null>(null);
  const [dropSlot, setDropSlot] = useState<Slot>('day');
  const [dropNote, setDropNote] = useState('');
  const [dropSaving, setDropSaving] = useState(false);

  // cell "+" add dialog (client or absence)
  const [addOpen, setAddOpen] = useState(false);
  const [addTarget, setAddTarget] = useState<{ workerId: string; date: string } | null>(null);
  const [addMode, setAddMode] = useState<'client' | 'absence'>('client');
  const [addWorksite, setAddWorksite] = useState('');
  const [addSlot, setAddSlot] = useState<Slot>('day');
  const [addAbsenceType, setAddAbsenceType] = useState('');
  const [addNote, setAddNote] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  // bubble edit dialog
  const [editing, setEditing] = useState<PlanningWithWorksite | null>(null);
  const [editWorksiteId, setEditWorksiteId] = useState('');
  const [editSlot, setEditSlot] = useState<Slot>('day');
  const [editAbsenceType, setEditAbsenceType] = useState('');
  const [editNote, setEditNote] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingEdit, setDeletingEdit] = useState(false);
  // worksite (chantier) edit fields inside the bubble dialog
  const [wsName, setWsName] = useState('');
  const [wsProduct, setWsProduct] = useState('');
  const [wsPhone, setWsPhone] = useState('');
  const [wsCity, setWsCity] = useState('');
  const [wsAddress, setWsAddress] = useState('');
  const [wsDesc, setWsDesc] = useState('');
  const [savingWs, setSavingWs] = useState(false);
  const [wsBusy, setWsBusy] = useState(false);

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
        // Declared real hours for the week, to overlay on the bubbles.
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

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchPlanning(); }, [fetchPlanning]);

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

  // ─── drag ────────────────────────────────────────────────────────────────────

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

    if (drag?.type === 'new') {
      if (!drag.worksiteId) return;
      setDropTarget({ workerId, date: dateStr, worksiteId: drag.worksiteId });
      setDropSlot('day');
      setDropNote('');
      setDropOpen(true);
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

  const confirmDrop = async () => {
    if (!user?.company_id || !dropTarget) return;
    setDropSaving(true);
    try {
      const { error } = await supabase.from('planning').insert({
        company_id: user.company_id,
        created_by: user.id,
        user_id: dropTarget.workerId,
        worksite_id: dropTarget.worksiteId,
        work_date: dropTarget.date,
        estimated_start: SLOT_TIMES[dropSlot].start,
        estimated_end: SLOT_TIMES[dropSlot].end,
        notes: dropNote.trim() || null,
        absence_type: null,
      });
      if (error) throw error;
      toast.success('Affectation créée');
      setDropOpen(false);
      setDropTarget(null);
      fetchPlanning();
    } catch (err) {
      console.error('Error creating planning:', err);
      toast.error("Impossible de créer l'affectation");
    } finally {
      setDropSaving(false);
    }
  };

  // ─── cell "+" add ─────────────────────────────────────────────────────────────

  const openAdd = (workerId: string, dateStr: string) => {
    setAddTarget({ workerId, date: dateStr });
    setAddMode('client');
    setAddWorksite(paletteWorksiteId || '');
    setAddSlot('day');
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
      const { error } = await supabase.from('planning').insert({
        company_id: user.company_id,
        created_by: user.id,
        user_id: addTarget.workerId,
        worksite_id: isAbs ? null : addWorksite,
        work_date: addTarget.date,
        estimated_start: isAbs ? null : SLOT_TIMES[addSlot].start,
        estimated_end: isAbs ? null : SLOT_TIMES[addSlot].end,
        notes: addNote.trim() || null,
        absence_type: isAbs ? addAbsenceType : null,
      });
      if (error) throw error;
      toast.success(isAbs ? 'Absence enregistrée' : 'Affectation créée');
      setAddOpen(false);
      setAddTarget(null);
      fetchPlanning();
    } catch (err) {
      console.error('Error adding planning:', err);
      toast.error("Impossible d'enregistrer");
    } finally {
      setAddSaving(false);
    }
  };

  // ─── bubble edit ──────────────────────────────────────────────────────────────

  const openEdit = (p: PlanningWithWorksite) => {
    setEditing(p);
    setEditWorksiteId(p.worksite_id || '');
    setEditSlot(slotFromTimes(p.estimated_start, p.estimated_end));
    setEditAbsenceType(p.absence_type || '');
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
    const isAbs = !!editing.absence_type;
    if (!isAbs && !editWorksiteId) { toast.error('Choisissez un chantier'); return; }
    if (isAbs && !editAbsenceType) { toast.error("Choisissez le type d'absence"); return; }
    setSavingEdit(true);
    try {
      const payload = isAbs
        ? { absence_type: editAbsenceType, notes: editNote.trim() || null }
        : {
            worksite_id: editWorksiteId,
            estimated_start: SLOT_TIMES[editSlot].start,
            estimated_end: SLOT_TIMES[editSlot].end,
            notes: editNote.trim() || null,
          };
      const { error } = await supabase.from('planning').update(payload).eq('id', editing.id).eq('company_id', user.company_id);
      if (error) throw error;
      toast.success('Affectation modifiée');
      closeEdit();
      fetchPlanning();
    } catch (err) {
      console.error('Error saving affectation:', err);
      toast.error("Impossible de modifier l'affectation");
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
      toast.success('Affectation supprimée');
      closeEdit();
      fetchPlanning();
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
        client_name: wsName.trim(),
        product_type: wsProduct.trim() || null,
        client_phone: wsPhone.trim() || null,
        city: wsCity.trim() || null,
        address: wsAddress.trim() || null,
        description: wsDesc.trim() || null,
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

  // Delete the worksite only if it's an empty shell (no entries, no other planning).
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
      const others = (planCount || 0) - 1; // exclude the current assignment
      if ((entryCount || 0) > 0 || others > 0) {
        toast.error('Chantier utilisé ailleurs. Archivez-le plutôt.');
        return;
      }
      // remove this assignment then the empty worksite
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
        company_id: user.company_id,
        client_name: cName.trim(),
        product_type: cProduct.trim() || null,
        client_phone: cPhone.trim() || null,
        city: cCity.trim() || null,
        address: cAddress.trim() || null,
        description: cDesc.trim() || null,
        is_active: true,
      }).select().single();
      if (error) throw error;
      toast.success('Client créé — glisse-le sur le planning');
      setClientOpen(false);
      resetClient();
      await fetchData();
      if (data?.id) setPaletteWorksiteId(data.id); // ready to drag immediately
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
        body: {
          email: wEmail,
          first_name: wFirst,
          last_name: wLast,
          phone: wPhone || null,
          company_id: user.company_id,
          role: 'worker',
        },
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
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const getPlanningForDay = (workerId: string, dateStr: string) =>
    planning
      .filter(p => p.user_id === workerId && p.work_date === dateStr)
      .sort((a, b) => (a.estimated_start || '99:99').localeCompare(b.estimated_start || '99:99'));

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
          <p className="text-muted-foreground text-sm">Glisse un client sur une case · clique une bulle pour modifier</p>
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
                    <th className="p-3 text-left font-medium w-32 sm:w-40 sticky left-0 bg-muted/50 z-10">Salarié</th>
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
                    workers.map(worker => (
                      <tr key={worker.id} className="border-b last:border-b-0">
                        <td className="p-3 font-medium sticky left-0 bg-background z-10">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground shrink-0">
                              {((worker.first_name?.[0] || '') + (worker.last_name?.[0] || '')).toUpperCase()}
                            </span>
                            <span className="truncate text-sm">{worker.first_name} {worker.last_name}</span>
                          </div>
                        </td>
                        {weekDays.map(day => {
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const dayPlanning = getPlanningForDay(worker.id, dateStr);
                          return (
                            <DroppableCell key={dateStr} workerId={worker.id} dateStr={dateStr} isToday={dateStr === todayStr} onAdd={openAdd}>
                              {dayPlanning.map(p => (
                                <DraggableBubble key={p.id} p={p} palette={paletteFor(p).chip} real={realForPlanning(p)} onEdit={openEdit} />
                              ))}
                            </DroppableCell>
                          );
                        })}
                      </tr>
                    ))
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

      {/* Drop slot picker */}
      <Dialog open={dropOpen} onOpenChange={(o) => { setDropOpen(o); if (!o) setDropTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{worksites.find(w => w.id === dropTarget?.worksiteId)?.client_name || 'Affectation'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Créneau</Label>
              <div className="grid grid-cols-3 gap-2">
                {SLOT_ORDER.map(s => (
                  <Button key={s} type="button" variant={dropSlot === s ? 'default' : 'outline'} onClick={() => setDropSlot(s)}>
                    {SLOT_LABELS[s]}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Note (optionnel)</Label>
              <Textarea value={dropNote} onChange={(e) => setDropNote(e.target.value)} rows={2} placeholder="Infos complémentaires…" />
            </div>
            <Button className="w-full" onClick={confirmDrop} disabled={dropSaving}>
              {dropSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Créer l'affectation
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cell "+" add (client or absence) */}
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
                  <div className="grid grid-cols-3 gap-2">
                    {SLOT_ORDER.map(s => (
                      <Button key={s} type="button" variant={addSlot === s ? 'default' : 'outline'} onClick={() => setAddSlot(s)}>{SLOT_LABELS[s]}</Button>
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
                    <SelectItem value="conge">Congé</SelectItem>
                    <SelectItem value="maladie">Maladie</SelectItem>
                    <SelectItem value="intemperie">Intempérie</SelectItem>
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

      {/* Bubble edit */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) closeEdit(); }}>
        <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.absence_type ? 'Absence' : (editing?.worksite?.client_name || 'Affectation')}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-5 pt-2">
              {/* Affectation */}
              <div className="space-y-3">
                {editing.absence_type ? (
                  <div className="space-y-2">
                    <Label>Type d'absence</Label>
                    <Select value={editAbsenceType} onValueChange={setEditAbsenceType}>
                      <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="conge">Congé</SelectItem>
                        <SelectItem value="maladie">Maladie</SelectItem>
                        <SelectItem value="intemperie">Intempérie</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <>
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
                      <div className="grid grid-cols-3 gap-2">
                        {SLOT_ORDER.map(s => (
                          <Button key={s} type="button" size="sm" variant={editSlot === s ? 'default' : 'outline'} onClick={() => setEditSlot(s)}>{SLOT_LABELS[s]}</Button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
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

              {/* Réel déclaré */}
              {!editing.absence_type && (
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
              )}

              {/* Chantier (worksite) management */}
              {!editing.absence_type && editing.worksite_id && (
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
