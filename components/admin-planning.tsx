'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { PlanningWithWorksite, Worksite, User } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronLeft, ChevronRight, Plus, MapPin, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { format, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';

const WORKER_COLORS = [
  'bg-red-100 border-red-300 text-red-800',
  'bg-blue-100 border-blue-300 text-blue-800',
  'bg-green-100 border-green-300 text-green-800',
  'bg-yellow-100 border-yellow-300 text-yellow-800',
  'bg-orange-100 border-orange-300 text-orange-800',
  'bg-cyan-100 border-cyan-300 text-cyan-800',
  'bg-pink-100 border-pink-300 text-pink-800',
  'bg-lime-100 border-lime-300 text-lime-800',
];

const ABSENCE_LABELS: Record<string, string> = {
  conge: 'Congé',
  maladie: 'Maladie',
  intemperie: 'Intempérie',
};

const ABSENCE_COLORS = 'bg-gray-100 border-gray-300 text-gray-700';

export default function AdminPlanning() {
  const { user } = useAuth();
  const [workers, setWorkers] = useState<User[]>([]);
  const [worksites, setWorksites] = useState<Worksite[]>([]);
  const [planning, setPlanning] = useState<PlanningWithWorksite[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [dialogOpen, setDialogOpen] = useState(false);
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

  const handleCreatePlanning = async (e: React.FormEvent) => {
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
      const { error } = await supabase.from('planning').insert({
        company_id: user.company_id,
        user_id: selectedWorker,
        worksite_id: isAbsence ? null : selectedWorksite,
        work_date: selectedDate,
        estimated_start: estimatedStart || null,
        estimated_end: estimatedEnd || null,
        notes: notes.trim() || null,
        absence_type: isAbsence ? absenceType : null,
        created_by: user.id,
      });
      if (error) throw error;
      toast.success(isAbsence ? 'Absence enregistree' : 'Affectation creee');
      setDialogOpen(false);
      resetForm();
      fetchPlanning();
    } catch (err) {
      console.error('Error creating planning:', err);
      toast.error("Impossible de creer l'affectation");
    } finally {
      setSaving(false);
    }
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
  const getWorkerColor = (index: number) => WORKER_COLORS[index % WORKER_COLORS.length];

  const getPlanningForDay = (workerId: string, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return planning.filter(p => p.user_id === workerId && p.work_date === dateStr);
  };

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
          <p className="text-muted-foreground">Organisez les chantiers de la semaine</p>
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

          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="ml-2">
                <Plus className="h-4 w-4 mr-2" />
                Affecter
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nouvelle affectation</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreatePlanning} className="space-y-4 pt-4">
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
                  {isAbsence ? "Enregistrer l'absence" : "Créer l'affectation"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

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
                        <div className={`text-lg ${isToday ? 'font-bold text-primary' : ''}`}>
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
                  workers.map((worker, index) => (
                    <tr key={worker.id} className="border-b last:border-b-0">
                      <td className="p-3 font-medium sticky left-0 bg-background z-10">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${getWorkerColor(index).split(' ')[0]}`} />
                          <span className="truncate text-sm">{worker.first_name} {worker.last_name}</span>
                        </div>
                      </td>
                      {weekDays.map((day) => {
                        const dayPlanning = getPlanningForDay(worker.id, day);
                        const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                        return (
                          <td key={day.toISOString()} className={`p-2 align-top ${isToday ? 'bg-primary/5' : ''}`}>
                            {dayPlanning.map((p) => {
                              const isAbs = !!p.absence_type;
                              const colorClass = isAbs ? ABSENCE_COLORS : getWorkerColor(index);
                              return (
                                <div key={p.id} className={`${colorClass} border rounded-md p-2 text-xs mb-1 group relative`}>
                                  <div className="flex items-start justify-between gap-1">
                                    <div className="font-medium truncate flex-1">
                                      {isAbs
                                        ? (ABSENCE_LABELS[p.absence_type!] || p.absence_type)
                                        : (p.worksite?.client_name || 'Chantier')}
                                    </div>
                                    <button
                                      onClick={() => handleDeletePlanning(p.id)}
                                      disabled={deletingId === p.id}
                                      className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 shrink-0 hover:text-red-600"
                                    >
                                      {deletingId === p.id
                                        ? <Loader2 className="h-3 w-3 animate-spin" />
                                        : <Trash2 className="h-3 w-3" />}
                                    </button>
                                  </div>
                                  {!isAbs && p.estimated_start && p.estimated_end && (
                                    <div className="opacity-70 mt-0.5">
                                      {p.estimated_start.substring(0, 5)}-{p.estimated_end.substring(0, 5)}
                                    </div>
                                  )}
                                  {!isAbs && p.worksite?.city && (
                                    <div className="flex items-center gap-1 opacity-70 mt-0.5">
                                      <MapPin className="h-3 w-3 shrink-0" />
                                      <span className="truncate">{p.worksite.city}</span>
                                    </div>
                                  )}
                                  {p.notes && (
                                    <div className="opacity-70 mt-0.5 italic truncate">{p.notes}</div>
                                  )}
                                </div>
                              );
                            })}
                          </td>
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
    </div>
  );
}
