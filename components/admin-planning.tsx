'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { PlanningWithWorksite, Worksite, User } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, Plus, MapPin } from 'lucide-react';
import { format, startOfWeek, addDays, addWeeks, subWeeks, parseISO } from 'date-fns';
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, [user]);

  useEffect(() => {
    if (user?.company_id) {
      fetchPlanning();
    }
  }, [currentWeekStart, user?.company_id]);

  const fetchData = async () => {
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
  };

  const fetchPlanning = async () => {
    if (!user?.company_id) return;

    const weekEnd = addDays(currentWeekStart, 6);

    try {
      const { data, error } = await supabase
        .from('planning')
        .select(`
          *,
          worksite:worksites(*),
          user:users(*)
        `)
        .eq('company_id', user.company_id)
        .gte('work_date', format(currentWeekStart, 'yyyy-MM-dd'))
        .lte('work_date', format(weekEnd, 'yyyy-MM-dd'))
        .order('work_date');

      if (error) throw error;
      setPlanning(data || []);
    } catch (err) {
      console.error('Error fetching planning:', err);
    }
  };

  const handleCreatePlanning = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.company_id || !selectedWorker || !selectedWorksite || !selectedDate) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('planning')
        .insert({
          company_id: user.company_id,
          user_id: selectedWorker,
          worksite_id: selectedWorksite,
          work_date: selectedDate,
          estimated_start: estimatedStart || null,
          estimated_end: estimatedEnd || null,
          created_by: user.id,
        });

      if (error) throw error;

      toast.success('Affectation creee');
      setDialogOpen(false);
      resetForm();
      fetchPlanning();
    } catch (err) {
      console.error('Error creating planning:', err);
      toast.error('Impossible de creer l\'affectation');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setSelectedWorker('');
    setSelectedWorksite('');
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
    setEstimatedStart('');
    setEstimatedEnd('');
  };

  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(currentWeekStart, i));

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
              {format(currentWeekStart, 'd MMMM', { locale: fr })} - {format(addDays(currentWeekStart, 4), 'd MMMM yyyy', { locale: fr })}
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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

                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} required />
                </div>

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

                <Button type="submit" className="w-full" disabled={saving}>
                  {saving ? 'Création...' : 'Créer l\'affectation'}
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
                      <th key={day.toISOString()} className={`p-3 text-center font-medium min-w-[150px] ${isToday ? 'bg-primary/10' : ''}`}>
                        <div className="text-xs text-muted-foreground">
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
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      Aucun salarié configuré
                    </td>
                  </tr>
                ) : (
                  workers.map((worker, index) => (
                    <tr key={worker.id} className="border-b last:border-b-0">
                      <td className="p-3 font-medium sticky left-0 bg-background">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${getWorkerColor(index).split(' ')[0]}`} />
                          <span className="truncate">{worker.first_name} {worker.last_name}</span>
                        </div>
                      </td>
                      {weekDays.map((day) => {
                        const dayPlanning = getPlanningForDay(worker.id, day);
                        const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                        return (
                          <td key={day.toISOString()} className={`p-2 align-top ${isToday ? 'bg-primary/5' : ''}`}>
                            {dayPlanning.map((p) => (
                              <div key={p.id} className={`${getWorkerColor(index)} rounded-md p-2 text-xs mb-1`}>
                                <div className="font-medium truncate">{p.worksite?.client_name || 'Chantier'}</div>
                                {p.estimated_start && p.estimated_end && (
                                  <div className="text-muted-foreground">
                                    {p.estimated_start.substring(0, 5)}-{p.estimated_end.substring(0, 5)}
                                  </div>
                                )}
                                {p.worksite?.city && (
                                  <div className="flex items-center gap-1 text-muted-foreground mt-1">
                                    <MapPin className="h-3 w-3" />
                                    <span className="truncate">{p.worksite.city}</span>
                                  </div>
                                )}
                              </div>
                            ))}
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
