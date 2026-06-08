'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { TimeEntry, Worksite, Planning, User } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Trash2, Send, Loader2, MapPin, Clock, Utensils } from 'lucide-react';
import { format, addDays, startOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';

interface TimeEntryWithWorksite extends TimeEntry {
  worksite: Worksite;
}

function formatMinutesToHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h${mins.toString().padStart(2, '0')}`;
}

function calculateTotalMinutes(startTime: string, endTime: string, breakMinutes: number): number {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);

  const startTotal = startH * 60 + startM;
  let endTotal = endH * 60 + endM;

  if (endTotal < startTotal) {
    endTotal += 24 * 60;
  }

  return Math.max(0, endTotal - startTotal - breakMinutes);
}

export default function PoseurDay() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TimeEntryWithWorksite[]>([]);
  const [worksites, setWorksites] = useState<Worksite[]>([]);
  const [planning, setPlanning] = useState<(Planning & { worksite: Worksite })[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [newEntryType, setNewEntryType] = useState<'existing' | 'new'>('existing');
  const [selectedWorksiteId, setSelectedWorksiteId] = useState<string>('');
  const [newClientName, setNewClientName] = useState('');
  const [newProductType, setNewProductType] = useState('');
  const [newCity, setNewCity] = useState('');
  const [startTime, setStartTime] = useState('07:30');
  const [endTime, setEndTime] = useState('');
  const [breakMinutes, setBreakMinutes] = useState('60');
  const [mealAllowance, setMealAllowance] = useState(true);
  const [observation, setObservation] = useState('');
  const [saving, setSaving] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');

  const fetchData = useCallback(async () => {
    if (!user) return;

    try {
      const [entriesRes, worksitesRes, planningRes] = await Promise.all([
        supabase
          .from('time_entries')
          .select('*, worksite:worksites(*)')
          .eq('user_id', user.id)
          .eq('work_date', today)
          .order('start_time'),
        supabase
          .from('worksites')
          .select('*')
          .eq('company_id', user.company_id)
          .eq('is_active', true)
          .order('client_name'),
        supabase
          .from('planning')
          .select('*, worksite:worksites(*)')
          .eq('user_id', user.id)
          .eq('work_date', today),
      ]);

      if (entriesRes.error) throw entriesRes.error;
      if (worksitesRes.error) throw worksitesRes.error;
      if (planningRes.error) throw planningRes.error;

      setEntries(entriesRes.data || []);
      setWorksites(worksitesRes.data || []);
      setPlanning(planningRes.data || []);

      if (planningRes.data && planningRes.data.length > 0 && !entriesRes.data?.length) {
        if (planningRes.data[0].worksite) {
          setSelectedWorksiteId(planningRes.data[0].worksite_id);
        }
        if (planningRes.data[0].estimated_start) {
          setStartTime(planningRes.data[0].estimated_start!.substring(0, 5));
        }
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error('Impossible de charger vos donnees');
    } finally {
      setLoading(false);
    }
  }, [user, today]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    try {
      let worksiteId = selectedWorksiteId;

      if (newEntryType === 'new') {
        if (!newClientName.trim()) {
          toast.error('Le nom du client est requis');
          setSaving(false);
          return;
        }

        const { data: newWorksite, error: wsError } = await supabase
          .from('worksites')
          .insert({
            company_id: user.company_id,
            client_name: newClientName.trim(),
            product_type: newProductType.trim() || null,
            city: newCity.trim() || null,
            is_active: true,
          })
          .select()
          .single();

        if (wsError) throw wsError;
        worksiteId = newWorksite.id;
      }

      if (!worksiteId) {
        toast.error('Selectionnez un chantier');
        setSaving(false);
        return;
      }

      if (!startTime || !endTime) {
        toast.error('Les heures de debut et fin sont requises');
        setSaving(false);
        return;
      }

      const totalMins = calculateTotalMinutes(startTime, endTime, parseInt(breakMinutes) || 0);

      const planningId = planning.find(p => p.worksite_id === worksiteId)?.id || null;

      const { error: entryError } = await supabase
        .from('time_entries')
        .insert({
          company_id: user.company_id,
          user_id: user.id,
          worksite_id: worksiteId,
          planning_id: planningId,
          work_date: today,
          start_time: startTime,
          end_time: endTime,
          break_minutes: parseInt(breakMinutes) || 0,
          total_minutes: totalMins,
          meal_allowance: mealAllowance,
          observation: observation.trim() || null,
          status: 'draft',
        });

      if (entryError) throw entryError;

      toast.success('Intervention ajoutee');
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (err) {
      console.error('Error adding entry:', err);
      toast.error('Impossible d\'ajouter l\'intervention');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    try {
      const { error } = await supabase
        .from('time_entries')
        .delete()
        .eq('id', entryId);

      if (error) throw error;
      toast.success('Intervention supprimee');
      fetchData();
    } catch (err) {
      console.error('Error deleting entry:', err);
      toast.error('Impossible de supprimer');
    }
  };

  const handleSubmitDay = async () => {
    if (entries.length === 0) {
      toast.error('Ajoutez au moins une intervention');
      return;
    }

    setSubmitting(true);
    try {
      const now = new Date().toISOString();

      const { error } = await supabase
        .from('time_entries')
        .update({
          status: 'submitted',
          submitted_at: now,
        })
        .in('id', entries.map(e => e.id))
        .eq('user_id', user!.id);

      if (error) throw error;

      toast.success('Journee envoyee');
      fetchData();
    } catch (err) {
      console.error('Error submitting day:', err);
      toast.error('Impossible d\'envoyer');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setNewEntryType('existing');
    setSelectedWorksiteId('');
    setNewClientName('');
    setNewProductType('');
    setNewCity('');
    setStartTime('07:30');
    setEndTime('');
    setBreakMinutes('60');
    setMealAllowance(true);
    setObservation('');
  };

  const totalMinutes = entries.reduce((sum, e) => sum + e.total_minutes, 0);
  const hasDrafts = entries.some(e => e.status === 'draft');

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{format(new Date(), 'EEEE d MMMM', { locale: fr })}</h2>
        </div>
      </div>

      <Card className="bg-primary text-primary-foreground">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="h-6 w-6" />
              <div>
                <p className="text-sm opacity-90">Total du jour</p>
                <p className="text-2xl font-bold">{formatMinutesToHours(totalMinutes)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm opacity-90">{entries.length} intervention{entries.length > 1 ? 's' : ''}</p>
              <p className="text-sm opacity-90">
                {entries.filter(e => e.meal_allowance).length} panier{entries.filter(e => e.meal_allowance).length > 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {planning.length > 0 && entries.length === 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Chantiers prevus aujourd'hui</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {planning.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{p.worksite?.client_name}</span>
                {p.worksite?.city && <span className="text-muted-foreground">- {p.worksite.city}</span>}
                {p.estimated_start && p.estimated_end && (
                  <Badge variant="outline" className="ml-auto">
                    {p.estimated_start.substring(0, 5)}-{p.estimated_end.substring(0, 5)}
                  </Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Aucune intervention aujourd'hui</p>
            <Button className="mt-4" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Ajouter une intervention
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <Card key={entry.id}>
              <CardContent className="py-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{entry.worksite?.client_name || 'Chantier inconnu'}</p>
                    {entry.worksite?.city && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {entry.worksite.city}
                      </p>
                    )}
                  </div>
                  {entry.status === 'draft' && (
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteEntry(entry.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{entry.start_time?.substring(0, 5)} - {entry.end_time?.substring(0, 5)}</span>
                  </div>
                  <span className="font-bold text-primary">{formatMinutesToHours(entry.total_minutes)}</span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {entry.meal_allowance && (
                    <Badge variant="secondary" className="text-xs">
                      <Utensils className="h-3 w-3 mr-1" />
                      Panier
                    </Badge>
                  )}
                  {entry.break_minutes > 0 && (
                    <Badge variant="outline" className="text-xs">
                      Pause {entry.break_minutes}min
                    </Badge>
                  )}
                  {entry.status === 'submitted' && (
                    <Badge variant="default" className="text-xs">Envoye</Badge>
                  )}
                </div>

                {entry.observation && (
                  <p className="text-sm text-muted-foreground">{entry.observation}</p>
                )}
              </CardContent>
            </Card>
          ))}

          {hasDrafts && (
            <div className="flex gap-2">
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="flex-1">
                    <Plus className="h-4 w-4 mr-2" />
                    Ajouter
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Nouvelle intervention</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddEntry} className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>Chantier</Label>
                      <div className="flex gap-2 mb-2">
                        <Button
                          type="button"
                          variant={newEntryType === 'existing' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setNewEntryType('existing')}
                          className="flex-1"
                        >
                          Existant
                        </Button>
                        <Button
                          type="button"
                          variant={newEntryType === 'new' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setNewEntryType('new')}
                          className="flex-1"
                        >
                          Nouveau
                        </Button>
                      </div>

                      {newEntryType === 'existing' ? (
                        <Select value={selectedWorksiteId} onValueChange={setSelectedWorksiteId} required>
                          <SelectTrigger>
                            <SelectValue placeholder="Selectionnez un chantier" />
                          </SelectTrigger>
                          <SelectContent>
                            {worksites.map((ws) => (
                              <SelectItem key={ws.id} value={ws.id}>
                                {ws.client_name} {ws.city ? `- ${ws.city}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="space-y-3">
                          <Input
                            placeholder="Nom du client *"
                            value={newClientName}
                            onChange={(e) => setNewClientName(e.target.value)}
                            required
                          />
                          <Input
                            placeholder="Type de produit (stores, volets...)"
                            value={newProductType}
                            onChange={(e) => setNewProductType(e.target.value)}
                          />
                          <Input
                            placeholder="Ville"
                            value={newCity}
                            onChange={(e) => setNewCity(e.target.value)}
                          />
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Heure debut</Label>
                        <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Heure fin</Label>
                        <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Pause (minutes)</Label>
                      <Input type="number" value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} min="0" step="15" />
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox id="meal" checked={mealAllowance} onCheckedChange={(checked) => setMealAllowance(checked as boolean)} />
                      <Label htmlFor="meal" className="cursor-pointer">Panier repas</Label>
                    </div>

                    <div className="space-y-2">
                      <Label>Observation (optionnel)</Label>
                      <Input placeholder="Note..." value={observation} onChange={(e) => setObservation(e.target.value)} />
                    </div>

                    <Button type="submit" className="w-full" disabled={saving}>
                      {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Ajouter
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>

              <Button className="flex-1" onClick={handleSubmitDay} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Envoyer ma journee
              </Button>
            </div>
          )}
        </div>
      )}

      {entries.length > 0 && entries.every(e => e.status !== 'draft') && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Ajouter une intervention
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Nouvelle intervention</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddEntry} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Chantier</Label>
                <div className="flex gap-2 mb-2">
                  <Button
                    type="button"
                    variant={newEntryType === 'existing' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setNewEntryType('existing')}
                    className="flex-1"
                  >
                    Existant
                  </Button>
                  <Button
                    type="button"
                    variant={newEntryType === 'new' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setNewEntryType('new')}
                    className="flex-1"
                  >
                    Nouveau
                  </Button>
                </div>

                {newEntryType === 'existing' ? (
                  <Select value={selectedWorksiteId} onValueChange={setSelectedWorksiteId} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Selectionnez un chantier" />
                    </SelectTrigger>
                    <SelectContent>
                      {worksites.map((ws) => (
                        <SelectItem key={ws.id} value={ws.id}>
                          {ws.client_name} {ws.city ? `- ${ws.city}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="space-y-3">
                    <Input
                      placeholder="Nom du client *"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      required
                    />
                    <Input
                      placeholder="Type de produit (stores, volets...)"
                      value={newProductType}
                      onChange={(e) => setNewProductType(e.target.value)}
                    />
                    <Input
                      placeholder="Ville"
                      value={newCity}
                      onChange={(e) => setNewCity(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Heure debut</Label>
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Heure fin</Label>
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Pause (minutes)</Label>
                <Input type="number" value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} min="0" step="15" />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox id="meal2" checked={mealAllowance} onCheckedChange={(checked) => setMealAllowance(checked as boolean)} />
                <Label htmlFor="meal2" className="cursor-pointer">Panier repas</Label>
              </div>

              <div className="space-y-2">
                <Label>Observation (optionnel)</Label>
                <Input placeholder="Note..." value={observation} onChange={(e) => setObservation(e.target.value)} />
              </div>

              <Button type="submit" className="w-full" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Ajouter
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
