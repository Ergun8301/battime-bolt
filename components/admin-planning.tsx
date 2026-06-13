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
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronLeft, ChevronRight, Plus, MapPin, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { format, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';

// Colour belongs to the CHANTIER, not the poseur — each worksite keeps the
// same pastel all week, even when its bubble is dragged between poseurs/days.
const CHANTIER_PALETTES = [
  { chip: 'bg-blue-100 border-blue-300 text-blue-800',     dot: 'bg-blue-400' },
  { chip: 'bg-orange-100 border-orange-300 text-orange-700', dot: 'bg-orange-400' },
  { chip: 'bg-green-100 border-green-300 text-green-700',   dot: 'bg-green-400' },
  { chip: 'bg-violet-100 border-violet-300 text-violet-700', dot: 'bg-violet-400' },
  { chip: 'bg-cyan-100 border-cyan-300 text-cyan-700',      dot: 'bg-cyan-400' },
  { chip: 'bg-pink-100 border-pink-300 text-pink-700',      dot: 'bg-pink-400' },
  { chip: 'bg-amber-100 border-amber-300 text-amber-800',   dot: 'bg-amber-400' },
];
const ABSENCE_PALETTE = { chip: 'bg-slate-100 border-slate-300 text-slate-600', dot: 'bg-slate-400' };

const ABSENCE_LABELS: Record<string, string> = {
  conge: 'Congé',
  maladie: 'Maladie',
  intemperie: 'Intempérie',
};

// Stable hash so a worksite always maps to the same pastel.
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
const paletteFor = (p: PlanningWithWorksite) =>
  p.absence_type ? ABSENCE_PALETTE : CHANTIER_PALETTES[hashStr(p.worksite_id || p.id) % CHANTIER_PALETTES.length];

// The visual chantier bubble (used both in-cell and in the drag overlay).
function BubbleContent({ p, palette }: { p: PlanningWithWorksite; palette: string }) {
  const isAbs = !!p.absence_type;
  return (
    <div className={`${palette} border rounded-md p-2 text-xs`}>
      <div className="font-medium truncate pr-3">
        {isAbs
          ? (ABSENCE_LABELS[p.absence_type!] || p.absence_type)
          : (p.worksite?.client_name || 'Chantier')}
      </div>
      {!isAbs && p.estimated_start && p.estimated_end && (
        <div className="opacity-70 mt-0.5 tabular">
          {p.estimated_start.substring(0, 5)}-{p.estimated_end.substring(0, 5)}
        </div>
      )}
      {!isAbs && p.worksite?.city && (
        <div className="flex items-center gap-1 opacity-70 mt-0.5">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{p.worksite.city}</span>
        </div>
      )}
      {p.notes && <div className="opacity-70 mt-0.5 italic truncate">{p.notes}</div>}
    </div>
  );
}

// A draggable bubble. A plain click opens the edit dialog (drag only starts
// after the pointer moves past the sensor's activation distance).
function DraggableBubble({
  p, palette, onEdit, onDelete, deleting,
}: {
  p: PlanningWithWorksite;
  palette: string;
  onEdit: (p: PlanningWithWorksite) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: p.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onEdit(p)}
      className={`relative group mb-1 cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40' : ''}`}
      title="Glisser pour déplacer · cliquer pour modifier"
    >
      <BubbleContent p={p} palette={palette} />
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
        onPointerDown={(e) => e.stopPropagation()}
        disabled={deleting}
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-600"
      >
        {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
      </button>
    </div>
  );
}

// A droppable worker×day cell.
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
      className={`p-2 align-top transition-colors ${
        isOver
          ? 'bg-primary/10 outline-dashed outline-2 -outline-offset-2 outline-primary'
          : isToday
          ? 'bg-primary/5'
          : ''
      }`}
    >
      {children}
    </td>
  );
}

export default function AdminPlanning() {
  const { user } = useAuth();
  const [workers, setWorkers] = useState<User[]>([]);
  const [worksites, setWorksites] = useState<Worksite[]>([]);
  const [planning, setPlanning] = useState<PlanningWithWorksite[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedWorker, setSelectedWorker] = useState<string>('');
  const [selectedWorksite, setSelectedWorksite] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [estimatedStart, setEstimatedStart] = useState<string>('');
  const [estimatedEnd, setEstimatedEnd] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isAbsence, setIsAbsence] = useState(false);
  const [absenceType, setAbsenceType] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const fetchData = useCallback(async () => {
    if (!user?.company_id) return;
    try {
      const [workersRes, worksitesRes] = await Promise.all([
        supabase
          .from('users')
          .select('*')
          .eq('company_id', user.company_id)
          .eq('role', 'worker')
          .eq('is_active', true)
          .order('first_name'),
        supabase
          .from('worksites')
          .select('*')
          .eq('company_id', user.company_id)
          .eq('is_active', true)
          .order('client_name'),
      ]);
      if (workersRes.error) throw workersRes.error;
      if (worksitesRes.error) throw worksitesRes.error;
      setWorkers(workersRes.data || []);
      setWorksites(worksitesRes.data || []);
    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error('Impossible de charger les donnees');
    } finally {
      setLoading(false);
    }
  }, [user?.company_id]);

  const fetchPlanning = useCallback(async () => {
    if (!user?.company_id) return;
    const weekEnd = addDays(currentWeekStart, 6);
    try {
      const { data, error } = await supabase
        .from('planning')
        .select(`*, worksite:worksites(*), user:users!user_id(*)`)
        .eq('company_id', user.company_id)
        .gte('work_date', format(currentWeekStart, 'yyyy-MM-dd'))
        .lte('work_date', format(weekEnd, 'yyyy-MM-dd'))
        .order('work_date');
      if (error) throw error;
      setPlanning(data || []);
    } catch (err) {
      console.error('Error fetching planning:', err);
    }
  }, [user?.company_id, currentWeekStart]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchPlanning(); }, [fetchPlanning]);

  const handleSubmitPlanning = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.company_id || !selectedWorker || !selectedDate) return;
    if (!isAbsence && !selectedWorksite) {
      toast.error('Selectionnez un chantier');
      return;
    }
    if (isAbsence && !absenceType) {
      toast.error("Selectionnez le type d'absence");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        user_id: selectedWorker,
        worksite_id: isAbsence ? null : selectedWorksite,
        work_date: selectedDate,
        estimated_start: estimatedStart || null,
        estimated_end: estimatedEnd || null,
        notes: notes.trim() || null,
        absence_type: isAbsence ? absenceType : null,
      };

      if (editingId) {
        const { error } = await supabase
          .from('planning')
          .update(payload)
          .eq('id', editingId)
          .eq('company_id', user.company_id);
        if (error) throw error;
        toast.success('Affectation modifiee');
      } else {
        const { error } = await supabase.from('planning').insert({
          ...payload,
          company_id: user.company_id,
          created_by: user.id,
        });
        if (error) throw error;
        toast.success(isAbsence ? 'Absence enregistree' : 'Affectation creee');
      }

      setDialogOpen(false);
      resetForm();
      setEditingId(null);
      fetchPlanning();
    } catch (err) {
      console.error('Error saving planning:', err);
      toast.error("Impossible d'enregistrer l'affectation");
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    resetForm();
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (p: PlanningWithWorksite) => {
    setEditingId(p.id);
    setSelectedWorker(p.user_id);
    setSelectedDate(p.work_date);
    setEstimatedStart(p.estimated_start ? p.estimated_start.substring(0, 5) : '');
    setEstimatedEnd(p.estimated_end ? p.estimated_end.substring(0, 5) : '');
    setNotes(p.notes || '');
    if (p.absence_type) {
      setIsAbsence(true);
      setAbsenceType(p.absence_type);
      setSelectedWorksite('');
    } else {
      setIsAbsence(false);
      setAbsenceType('');
      setSelectedWorksite(p.worksite_id || '');
    }
    setDialogOpen(true);
  };

  const handleDeletePlanning = async (id: string) => {
    if (!user?.company_id) return;
    setDeletingId(id);
    try {
      const { error } = await supabase
        .from('planning')
        .delete()
        .eq('id', id)
        .eq('company_id', user.company_id);
      if (error) throw error;
      toast.success('Affectation supprimee');
      fetchPlanning();
    } catch (err) {
      console.error('Error deleting planning:', err);
      toast.error("Impossible de supprimer l'affectation");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || !user?.company_id) return;
    const planningId = String(active.id);
    const [newWorkerId, newDate] = String(over.id).split('|');
    const item = planning.find(p => p.id === planningId);
    if (!item || (item.user_id === newWorkerId && item.work_date === newDate)) return;

    // Optimistic move; revert on failure.
    const prev = planning;
    setPlanning(ps => ps.map(p => p.id === planningId ? { ...p, user_id: newWorkerId, work_date: newDate } : p));
    try {
      const { error } = await supabase
        .from('planning')
        .update({ user_id: newWorkerId, work_date: newDate })
        .eq('id', planningId)
        .eq('company_id', user.company_id);
      if (error) throw error;
      toast.success('Affectation déplacée');
    } catch (err) {
      console.error('Error moving planning:', err);
      toast.error("Impossible de déplacer l'affectation");
      setPlanning(prev);
    }
  };

  const resetForm = () => {
    setSelectedWorker('');
    setSelectedWorksite('');
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
    setEstimatedStart('');
    setEstimatedEnd('');
    setNotes('');
    setIsAbsence(false);
    setAbsenceType('');
  };

  const weekDays = Array.from({ length: 6 }, (_, i) => addDays(currentWeekStart, i));

  const getPlanningForDay = (workerId: string, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return planning
      .filter(p => p.user_id === workerId && p.work_date === dateStr)
      // Chronological order; entries without a start time fall to the bottom.
      .sort((a, b) => (a.estimated_start || '99:99').localeCompare(b.estimated_start || '99:99'));
  };

  // Distinct worksites on the board this week → colour key (legend).
  const chantierLegend = useMemo(() => {
    const map = new Map<string, { id: string; name: string; dot: string }>();
    planning.forEach(p => {
      if (p.absence_type || !p.worksite_id || map.has(p.worksite_id)) return;
      map.set(p.worksite_id, {
        id: p.worksite_id,
        name: p.worksite?.client_name || 'Chantier',
        dot: paletteFor(p).dot,
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [planning]);

  const activePlanning = activeId ? planning.find(p => p.id === activeId) || null : null;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Planning</h2>
          <p className="text-muted-foreground">Glissez les bulles chantiers pour affecter la semaine</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentWeekStart(subWeeks(currentWeekStart, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center min-w-[200px]">
            <p className="font-medium">
              {format(currentWeekStart, 'd MMMM', { locale: fr })} -{' '}
              {format(addDays(currentWeekStart, 5), 'd MMMM yyyy', { locale: fr })}
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>

          <Button className="ml-2" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Affecter
          </Button>

          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { resetForm(); setEditingId(null); } }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? "Modifier l'affectation" : 'Nouvelle affectation'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmitPlanning} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Salarié</Label>
                  <Select value={selectedWorker} onValueChange={setSelectedWorker} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir un salarié" />
                    </SelectTrigger>
                    <SelectContent>
                      {workers.map((worker) => (
                        <SelectItem key={worker.id} value={worker.id}>
                          {worker.first_name} {worker.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="absence-toggle"
                    checked={isAbsence}
                    onCheckedChange={(v) => { setIsAbsence(v as boolean); setSelectedWorksite(''); setAbsenceType(''); }}
                  />
                  <Label htmlFor="absence-toggle" className="cursor-pointer flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    Absence (congé, maladie, intempérie)
                  </Label>
                </div>

                {isAbsence ? (
                  <div className="space-y-2">
                    <Label>Type d'absence</Label>
                    <Select value={absenceType} onValueChange={setAbsenceType} required>
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir le type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="conge">Congé</SelectItem>
                        <SelectItem value="maladie">Maladie</SelectItem>
                        <SelectItem value="intemperie">Intempérie</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Chantier</Label>
                    <Select value={selectedWorksite} onValueChange={setSelectedWorksite} required>
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir un chantier" />
                      </SelectTrigger>
                      <SelectContent>
                        {worksites.map((ws) => (
                          <SelectItem key={ws.id} value={ws.id}>
                            {ws.client_name} {ws.city ? `- ${ws.city}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} required />
                </div>

                {!isAbsence && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Heure début (optionnel)</Label>
                      <Input type="time" value={estimatedStart} onChange={(e) => setEstimatedStart(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Heure fin (optionnel)</Label>
                      <Input type="time" value={estimatedEnd} onChange={(e) => setEstimatedEnd(e.target.value)} />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Note (optionnel)</Label>
                  <Textarea
                    placeholder="Informations complémentaires..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {editingId ? 'Enregistrer' : (isAbsence ? "Enregistrer l'absence" : "Créer l'affectation")}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Chantier colour legend — colour is per-chantier, so the board needs a key */}
      {chantierLegend.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card p-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Chantiers de la semaine
          </span>
          {chantierLegend.map((c) => (
            <div key={c.id} className="flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded-[3px] ${c.dot}`} />
              <span className="text-xs text-foreground">{c.name}</span>
            </div>
          ))}
        </div>
      )}

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left font-medium w-32 sm:w-40 sticky left-0 bg-muted/50 z-10">
                      Salarié
                    </th>
                    {weekDays.map((day) => {
                      const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                      return (
                        <th key={day.toISOString()} className={`p-3 text-center font-medium min-w-[130px] ${isToday ? 'bg-primary/10' : ''}`}>
                          <div className="text-xs text-muted-foreground capitalize">
                            {format(day, 'EEEE', { locale: fr })}
                          </div>
                          <div className={`text-lg tabular ${isToday ? 'font-bold text-primary' : ''}`}>
                            {format(day, 'd')}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {workers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        Aucun salarié configuré
                      </td>
                    </tr>
                  ) : (
                    workers.map((worker) => (
                      <tr key={worker.id} className="border-b last:border-b-0">
                        <td className="p-3 font-medium sticky left-0 bg-background z-10">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground shrink-0">
                              {((worker.first_name?.[0] || '') + (worker.last_name?.[0] || '')).toUpperCase()}
                            </span>
                            <span className="truncate text-sm">{worker.first_name} {worker.last_name}</span>
                          </div>
                        </td>
                        {weekDays.map((day) => {
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const dayPlanning = getPlanningForDay(worker.id, day);
                          const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');
                          return (
                            <DroppableCell key={dateStr} workerId={worker.id} dateStr={dateStr} isToday={isToday}>
                              {dayPlanning.map((p) => (
                                <DraggableBubble
                                  key={p.id}
                                  p={p}
                                  palette={paletteFor(p).chip}
                                  onEdit={openEdit}
                                  onDelete={handleDeletePlanning}
                                  deleting={deletingId === p.id}
                                />
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
          {activePlanning ? (
            <div className="rotate-[-2deg] scale-105 shadow-xl cursor-grabbing">
              <BubbleContent p={activePlanning} palette={paletteFor(activePlanning).chip} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
