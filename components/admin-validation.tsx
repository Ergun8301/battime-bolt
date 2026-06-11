'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { TimeEntryWithWorksite, User } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ChevronLeft, ChevronRight, CheckCircle, XCircle,
  Pencil, Clock, Utensils, Loader2, Lock, AlertTriangle,
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, parseISO, addWeeks, subWeeks } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';

type EntryWithUser = TimeEntryWithWorksite & { user: User };

function formatMinutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

function calcTotal(start: string, end: string, breakMins: number): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let s = sh * 60 + sm;
  let e = eh * 60 + em;
  if (e < s) e += 24 * 60;
  return Math.max(0, e - s - breakMins);
}

function StatusBadge({ status, locked }: { status: string; locked?: boolean }) {
  if (locked) return <Badge variant="outline" className="text-xs gap-1"><Lock className="h-3 w-3" />Exporté</Badge>;
  switch (status) {
    case 'draft': return <Badge variant="secondary" className="text-xs">Brouillon</Badge>;
    case 'submitted': return <Badge variant="default" className="text-xs bg-blue-600">À valider</Badge>;
    case 'validated': return <Badge variant="default" className="text-xs bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Validé</Badge>;
    default: return <Badge variant="secondary" className="text-xs">{status}</Badge>;
  }
}

export default function AdminValidation() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [entries, setEntries] = useState<EntryWithUser[]>([]);
  const [workers, setWorkers] = useState<User[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);

  // Edit dialog state
  const [editingEntry, setEditingEntry] = useState<EntryWithUser | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editBreak, setEditBreak] = useState('');
  const [editMeal, setEditMeal] = useState(false);
  const [editObs, setEditObs] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

  const fetchWorkers = useCallback(async () => {
    if (!user?.company_id) return;
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('company_id', user.company_id)
      .eq('role', 'worker')
      .order('first_name');
    setWorkers(data || []);
  }, [user?.company_id]);

  const fetchEntries = useCallback(async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      let query = supabase
        .from('time_entries')
        .select(`*, worksite:worksites(*), user:users!user_id(*)`)
        .eq('company_id', user.company_id)
        .gte('work_date', format(weekStart, 'yyyy-MM-dd'))
        .lte('work_date', format(weekEnd, 'yyyy-MM-dd'))
        .order('work_date')
        .order('user_id');

      if (selectedWorker !== 'all') {
        query = query.eq('user_id', selectedWorker);
      }

      const { data, error } = await query;
      if (error) throw error;
      setEntries(data || []);
    } catch (err) {
      console.error('Error fetching entries:', err);
      toast.error('Impossible de charger les saisies');
    } finally {
      setLoading(false);
    }
  }, [user?.company_id, weekStart, weekEnd, selectedWorker]);

  useEffect(() => { fetchWorkers(); }, [fetchWorkers]);
  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const handleValidate = async (entry: EntryWithUser) => {
    if (!user?.company_id || entry.status !== 'submitted') return;
    setActioningId(entry.id);
    try {
      const { error } = await supabase
        .from('time_entries')
        .update({
          status: 'validated',
          validated_at: new Date().toISOString(),
          validated_by: user.id,
        })
        .eq('id', entry.id)
        .eq('company_id', user.company_id);
      if (error) throw error;

      // Best-effort: set locked=true (requires SQL Bloc 1)
      await supabase
        .from('time_entries')
        .update({ locked: true })
        .eq('id', entry.id)
        .eq('company_id', user.company_id);

      toast.success('Saisie validée');
      fetchEntries();
    } catch (err) {
      console.error('Error validating:', err);
      toast.error('Impossible de valider');
    } finally {
      setActioningId(null);
    }
  };

  const handleUnvalidate = async (entry: EntryWithUser) => {
    if (!user?.company_id || entry.status !== 'validated') return;
    if (entry.exported_at) {
      toast.error('Cette saisie a été exportée et ne peut plus être modifiée');
      return;
    }
    setActioningId(entry.id);
    try {
      const { error } = await supabase
        .from('time_entries')
        .update({
          status: 'submitted',
          validated_at: null,
          validated_by: null,
        })
        .eq('id', entry.id)
        .eq('company_id', user.company_id);
      if (error) throw error;

      // Best-effort: set locked=false
      await supabase
        .from('time_entries')
        .update({ locked: false })
        .eq('id', entry.id)
        .eq('company_id', user.company_id);

      toast.success('Validation annulée');
      fetchEntries();
    } catch (err) {
      console.error('Error unvalidating:', err);
      toast.error("Impossible d'annuler la validation");
    } finally {
      setActioningId(null);
    }
  };

  const openEdit = (entry: EntryWithUser) => {
    setEditingEntry(entry);
    setEditStart(entry.start_time?.substring(0, 5) || '');
    setEditEnd(entry.end_time?.substring(0, 5) || '');
    setEditBreak(entry.break_minutes.toString());
    setEditMeal(entry.meal_allowance);
    setEditObs(entry.observation || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry || !user?.company_id) return;
    if (!editStart || !editEnd) { toast.error('Les heures sont requises'); return; }

    setEditSaving(true);
    try {
      const totalMins = calcTotal(editStart, editEnd, parseInt(editBreak) || 0);

      const { error } = await supabase
        .from('time_entries')
        .update({
          start_time: editStart,
          end_time: editEnd,
          break_minutes: parseInt(editBreak) || 0,
          total_minutes: totalMins,
          meal_allowance: editMeal,
          observation: editObs.trim() || null,
        })
        .eq('id', editingEntry.id)
        .eq('company_id', user.company_id);
      if (error) throw error;

      // Best-effort admin trace (requires SQL Bloc 1)
      await supabase
        .from('time_entries')
        .update({ modified_by: user.id, modified_at: new Date().toISOString() })
        .eq('id', editingEntry.id)
        .eq('company_id', user.company_id);

      toast.success('Saisie corrigée');
      setEditingEntry(null);
      fetchEntries();
    } catch (err) {
      console.error('Error saving edit:', err);
      toast.error('Impossible de corriger la saisie');
    } finally {
      setEditSaving(false);
    }
  };

  // Group entries by worker_id
  const grouped: Record<string, { worker: User; entries: EntryWithUser[] }> = {};
  for (const entry of entries) {
    if (!grouped[entry.user_id]) {
      grouped[entry.user_id] = { worker: entry.user, entries: [] };
    }
    grouped[entry.user_id].entries.push(entry);
  }

  const toValidateCount = entries.filter(e => e.status === 'submitted').length;
  const validatedCount = entries.filter(e => e.status === 'validated').length;
  const totalMinutes = entries.filter(e => e.status === 'validated').reduce((s, e) => s + e.total_minutes, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Validation</h2>
          <p className="text-muted-foreground">Vérifiez et validez les heures de la semaine</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center min-w-[200px]">
            <p className="font-medium text-sm">
              {format(weekStart, 'd MMMM', { locale: fr })} – {format(weekEnd, 'd MMMM yyyy', { locale: fr })}
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats + worker filter row */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="flex gap-3 flex-wrap">
          {toValidateCount > 0 && (
            <div className="flex items-center gap-1.5 text-sm">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <span className="font-medium text-orange-700">{toValidateCount} à valider</span>
            </div>
          )}
          {validatedCount > 0 && (
            <div className="flex items-center gap-1.5 text-sm">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="font-medium text-green-700">{validatedCount} validées — {formatMinutesToHours(totalMinutes)}</span>
            </div>
          )}
          {entries.length === 0 && !loading && (
            <span className="text-sm text-muted-foreground">Aucune saisie pour cette semaine</span>
          )}
        </div>

        <div className="sm:ml-auto w-full sm:w-48">
          <Select value={selectedWorker} onValueChange={setSelectedWorker}>
            <SelectTrigger>
              <SelectValue placeholder="Tous les salariés" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les salariés</SelectItem>
              {workers.map(w => (
                <SelectItem key={w.id} value={w.id}>{w.first_name} {w.last_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Aucune saisie pour cette période</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.values(grouped).map(({ worker, entries: wEntries }) => {
            const wValidated = wEntries.filter(e => e.status === 'validated').reduce((s, e) => s + e.total_minutes, 0);
            const wToValidate = wEntries.filter(e => e.status === 'submitted').length;
            return (
              <div key={worker.id} className="space-y-3">
                <div className="flex items-center gap-3 border-b pb-2">
                  <h3 className="font-semibold text-lg">{worker.first_name} {worker.last_name}</h3>
                  <span className="text-sm text-muted-foreground">{formatMinutesToHours(wValidated)} validées</span>
                  {wToValidate > 0 && (
                    <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs">
                      {wToValidate} à valider
                    </Badge>
                  )}
                </div>

                <div className="space-y-2">
                  {wEntries.map((entry) => {
                    const canEdit = !entry.locked && !entry.exported_at;
                    const isActioning = actioningId === entry.id;
                    return (
                      <div
                        key={entry.id}
                        className={`rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center gap-3 ${
                          entry.status === 'validated' ? 'bg-green-50/50' :
                          entry.status === 'submitted' ? 'bg-blue-50/50' : 'bg-muted/30'
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="shrink-0 text-xs text-muted-foreground w-20">
                            {format(parseISO(entry.work_date), 'EEE d MMM', { locale: fr })}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">
                              {entry.worksite?.client_name || 'Chantier inconnu'}
                            </p>
                            {entry.worksite?.city && (
                              <p className="text-xs text-muted-foreground">{entry.worksite.city}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm shrink-0">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{entry.start_time?.substring(0, 5)}–{entry.end_time?.substring(0, 5)}</span>
                            <span className="font-semibold">{formatMinutesToHours(entry.total_minutes)}</span>
                          </div>
                          {entry.meal_allowance && (
                            <Utensils className="h-4 w-4 text-muted-foreground shrink-0" aria-label="Panier repas" />
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <StatusBadge status={entry.status} locked={entry.locked} />

                          {canEdit && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEdit(entry)}
                              disabled={isActioning}
                            >
                              <Pencil className="h-3 w-3 mr-1" />
                              Corriger
                            </Button>
                          )}

                          {entry.status === 'submitted' && !entry.locked && (
                            <Button
                              size="sm"
                              onClick={() => handleValidate(entry)}
                              disabled={isActioning}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              {isActioning
                                ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                : <CheckCircle className="h-3 w-3 mr-1" />}
                              Valider
                            </Button>
                          )}

                          {entry.status === 'validated' && !entry.exported_at && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUnvalidate(entry)}
                              disabled={isActioning}
                              className="text-orange-600 border-orange-300 hover:bg-orange-50"
                            >
                              {isActioning
                                ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                : <XCircle className="h-3 w-3 mr-1" />}
                              Dévalider
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editingEntry} onOpenChange={(open) => { if (!open) setEditingEntry(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Corriger la saisie</DialogTitle>
          </DialogHeader>
          {editingEntry && (
            <form onSubmit={handleSaveEdit} className="space-y-4 pt-2">
              <div className="text-sm text-muted-foreground">
                {editingEntry.user?.first_name} {editingEntry.user?.last_name} —{' '}
                {format(parseISO(editingEntry.work_date), 'EEEE d MMMM yyyy', { locale: fr })}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Heure début</Label>
                  <Input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)} required disabled={editSaving} />
                </div>
                <div className="space-y-2">
                  <Label>Heure fin</Label>
                  <Input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} required disabled={editSaving} />
                </div>
              </div>
              {editStart && editEnd && (
                <p className="text-sm text-muted-foreground">
                  Total: <strong>{formatMinutesToHours(calcTotal(editStart, editEnd, parseInt(editBreak) || 0))}</strong>
                </p>
              )}
              <div className="space-y-2">
                <Label>Pause (minutes)</Label>
                <Input type="number" value={editBreak} onChange={(e) => setEditBreak(e.target.value)} min="0" step="15" disabled={editSaving} />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="edit-meal" checked={editMeal} onCheckedChange={(v) => setEditMeal(v as boolean)} disabled={editSaving} />
                <Label htmlFor="edit-meal" className="cursor-pointer">Panier repas</Label>
              </div>
              <div className="space-y-2">
                <Label>Observation</Label>
                <Input placeholder="Note..." value={editObs} onChange={(e) => setEditObs(e.target.value)} disabled={editSaving} />
              </div>
              <Button type="submit" className="w-full" disabled={editSaving}>
                {editSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Enregistrer la correction
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
