'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { TimeEntry, Worksite, Planning } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus, Minus, Trash2, Send, Loader2, MapPin, Clock, Utensils,
  WifiOff, RefreshCw, AlertTriangle, Copy, Pencil,
} from 'lucide-react';
import { format, addDays, subDays, startOfWeek, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  addPendingEntry, getPendingEntries, removePendingEntry,
  generateLocalId, PendingEntry,
} from '@/lib/offline-store';
import { computeMissingDays } from '@/lib/work-status';

interface TimeEntryWithWorksite extends TimeEntry {
  worksite: Worksite;
}

function formatMinutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

function calculateTotalMinutes(start: string, end: string, breakMins: number): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const s = sh * 60 + sm;
  let e = eh * 60 + em;
  if (e < s) e += 24 * 60;
  return Math.max(0, e - s - breakMins);
}

// Suggested default break: 1h once the worked span exceeds 6h, else none.
function suggestBreak(start: string, end: string): number {
  if (!start || !end) return 0;
  const span = calculateTotalMinutes(start, end, 0);
  return span > 360 ? 60 : 0;
}

// Step a HH:MM string by ±delta minutes, wrapping within a 24h day.
// When empty, the first tap reveals the fallback default instead of stepping.
function stepTime(time: string, delta: number, fallback: string): string {
  if (!time) return fallback;
  const [h, m] = time.split(':').map(Number);
  let total = h * 60 + m + delta;
  total = ((total % 1440) + 1440) % 1440;
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${nh.toString().padStart(2, '0')}:${nm.toString().padStart(2, '0')}`;
}

// Normalise for fuzzy worksite-name matching (lowercase, strip accents/spaces).
function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Big touch-friendly time stepper (±15 min) replacing native time inputs.
function TimeStepper({
  label, value, onChange, fallback,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  fallback: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-14 w-14 shrink-0"
          onClick={() => onChange(stepTime(value, -15, fallback))}
          aria-label={`${label} moins 15 minutes`}
        >
          <Minus className="h-5 w-5" />
        </Button>
        <div className="flex-1 text-center rounded-md border bg-muted/30 py-3">
          <span className="text-2xl font-bold tabular-nums">{value || '--:--'}</span>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-14 w-14 shrink-0"
          onClick={() => onChange(stepTime(value, 15, fallback))}
          aria-label={`${label} plus 15 minutes`}
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

// Touch-friendly break stepper (±15 min, clamped 0..480).
function BreakStepper({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const mins = parseInt(value) || 0;
  const step = (delta: number) => onChange(String(Math.min(480, Math.max(0, mins + delta))));
  return (
    <div className="space-y-2">
      <Label>Pause</Label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-14 w-14 shrink-0"
          onClick={() => step(-15)}
          aria-label="Pause moins 15 minutes"
        >
          <Minus className="h-5 w-5" />
        </Button>
        <div className="flex-1 text-center rounded-md border bg-muted/30 py-3">
          <span className="text-2xl font-bold tabular-nums">{mins}</span>
          <span className="text-sm text-muted-foreground ml-1">min</span>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-14 w-14 shrink-0"
          onClick={() => step(15)}
          aria-label="Pause plus 15 minutes"
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

export default function PoseurDay() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TimeEntryWithWorksite[]>([]);
  const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([]);
  const [worksites, setWorksites] = useState<Worksite[]>([]);
  const [planning, setPlanning] = useState<(Planning & { worksite: Worksite })[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [missingDays, setMissingDays] = useState<string[]>([]);

  // Add-entry form
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newEntryType, setNewEntryType] = useState<'existing' | 'new'>('existing');
  const [selectedWorksiteId, setSelectedWorksiteId] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newProductType, setNewProductType] = useState('');
  const [newCity, setNewCity] = useState('');
  const [startTime, setStartTime] = useState('07:30');
  const [endTime, setEndTime] = useState('');
  const [breakMinutes, setBreakMinutes] = useState('0');
  const [breakTouched, setBreakTouched] = useState(false);
  const [mealAllowance, setMealAllowance] = useState(true);
  const [observation, setObservation] = useState('');
  const [saving, setSaving] = useState(false);

  // Coherence confirmation
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [coherenceWarnings, setCoherenceWarnings] = useState<string[]>([]);

  // Copy-yesterday
  const [copyingYesterday, setCopyingYesterday] = useState(false);

  // Edit an existing entry (the worker owns it until exported/locked)
  const [editingEntry, setEditingEntry] = useState<TimeEntryWithWorksite | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editBreak, setEditBreak] = useState('60');
  const [editMeal, setEditMeal] = useState(true);
  const [editObs, setEditObs] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

  // ─── Fetch server data ─────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const recentStart = format(subDays(new Date(), 14), 'yyyy-MM-dd');
      const [entriesRes, worksitesRes, planningRes, recentRes, recentPlanRes] = await Promise.all([
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
        // Recent declared days (not draft).
        supabase
          .from('time_entries')
          .select('work_date, status')
          .eq('user_id', user.id)
          .neq('status', 'draft')
          .gte('work_date', recentStart),
        // Recent planning (chantiers + absences) — a day is only "missing" if it
        // was a chantier day, not declared, and not an absence day.
        supabase
          .from('planning')
          .select('work_date, absence_type')
          .eq('user_id', user.id)
          .gte('work_date', recentStart),
      ]);

      if (entriesRes.error) throw entriesRes.error;
      if (worksitesRes.error) throw worksitesRes.error;
      if (planningRes.error) throw planningRes.error;

      setEntries(entriesRes.data || []);
      setWorksites(worksitesRes.data || []);
      setPlanning(planningRes.data || []);

      if (!recentRes.error && !recentPlanRes.error) {
        const declared = new Set<string>((recentRes.data || []).map((e: { work_date: string }) => e.work_date));
        const rows = (recentPlanRes.data || []) as { work_date: string; absence_type: string | null }[];
        const absenceDays = new Set<string>(rows.filter((p) => p.absence_type).map((p) => p.work_date));
        const planned = rows.filter((p) => !p.absence_type && !absenceDays.has(p.work_date)).map((p) => p.work_date);
        setMissingDays(computeMissingDays(planned, declared));
      }

      // Pre-fill form from planning if no entries yet
      if (planningRes.data?.length && !entriesRes.data?.length) {
        const first = planningRes.data[0];
        if (first.worksite_id) setSelectedWorksiteId(first.worksite_id);
        if (first.estimated_start) setStartTime(first.estimated_start.substring(0, 5));
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error('Impossible de charger vos données');
    } finally {
      setLoading(false);
    }
  }, [user, today]);

  // ─── Sync pending offline entries ─────────────────────────────────────────

  const syncPendingEntries = useCallback(async () => {
    if (!user || !navigator.onLine) return;
    const pending = getPendingEntries(user.id).filter(e => e.work_date === today);
    if (pending.length === 0) return;

    setSyncing(true);
    let synced = 0;
    for (const entry of pending) {
      try {
        const { error } = await supabase.from('time_entries').insert({
          company_id: entry.company_id,
          user_id: entry.user_id,
          worksite_id: entry.worksite_id,
          planning_id: entry.planning_id,
          work_date: entry.work_date,
          start_time: entry.start_time,
          end_time: entry.end_time,
          break_minutes: entry.break_minutes,
          // total_minutes is a generated column in Postgres — never send it.
          meal_allowance: entry.meal_allowance,
          observation: entry.observation,
          status: 'draft',
        });
        if (!error) {
          removePendingEntry(user.id, entry.localId);
          synced++;
        }
      } catch { /* continue with next */ }
    }
    setSyncing(false);

    if (synced > 0) {
      toast.success(`${synced} intervention${synced > 1 ? 's' : ''} synchronisée${synced > 1 ? 's' : ''}`);
      const remaining = getPendingEntries(user.id).filter(e => e.work_date === today);
      setPendingEntries(remaining);
      fetchData();
    }
  }, [user, today, fetchData]);

  // ─── Online / offline listeners ───────────────────────────────────────────

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      syncPendingEntries();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncPendingEntries]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Load today's pending entries from localStorage
  useEffect(() => {
    if (user) {
      const pending = getPendingEntries(user.id).filter(e => e.work_date === today);
      setPendingEntries(pending);
      // Try to sync on mount if online
      if (navigator.onLine && pending.length > 0) {
        syncPendingEntries();
      }
    }
  }, [user, today, syncPendingEntries]);

  // Smart default break: propose 1h once the day exceeds 6h (until the worker adjusts).
  useEffect(() => {
    if (!addDialogOpen || breakTouched) return;
    if (startTime && endTime) setBreakMinutes(String(suggestBreak(startTime, endTime)));
  }, [startTime, endTime, addDialogOpen, breakTouched]);

  // ─── Add entry ─────────────────────────────────────────────────────────────

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    try {
      let worksiteId = selectedWorksiteId;
      let worksiteName = '';
      let worksiteCity: string | null = null;

      if (newEntryType === 'new') {
        if (!newClientName.trim()) {
          toast.error('Le nom du client est requis');
          return;
        }
        worksiteName = newClientName.trim();
        worksiteCity = newCity.trim() || null;

        if (navigator.onLine) {
          const { data: newWs, error: wsErr } = await supabase
            .from('worksites')
            .insert({
              company_id: user.company_id,
              client_name: worksiteName,
              product_type: newProductType.trim() || null,
              city: worksiteCity,
              is_active: true,
            })
            .select()
            .single();
          if (wsErr) throw wsErr;
          worksiteId = newWs.id;
        } else {
          // Offline: we can't create a new worksite without network.
          toast.error('Impossible de créer un chantier hors-ligne. Utilisez un chantier existant.');
          return;
        }
      } else {
        const ws = worksites.find(w => w.id === worksiteId);
        worksiteName = ws?.client_name || '';
        worksiteCity = ws?.city || null;
      }

      if (!worksiteId) { toast.error('Sélectionnez un chantier'); return; }
      if (!startTime || !endTime) { toast.error('Les heures de début et fin sont requises'); return; }

      const totalMins = calculateTotalMinutes(startTime, endTime, parseInt(breakMinutes) || 0);
      const planningId = planning.find(p => p.worksite_id === worksiteId)?.id || null;

      if (!navigator.onLine) {
        // Save offline
        const pending: PendingEntry = {
          localId: generateLocalId(),
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
          _worksite_name: worksiteName,
          _worksite_city: worksiteCity,
          _saved_at: Date.now(),
        };
        addPendingEntry(user.id, pending);
        setPendingEntries(prev => [...prev, pending]);
        toast.success('Intervention enregistrée hors-ligne');
        setAddDialogOpen(false);
        resetForm();
        return;
      }

      // Online: save to Supabase
      const { error } = await supabase.from('time_entries').insert({
        company_id: user.company_id,
        user_id: user.id,
        worksite_id: worksiteId,
        planning_id: planningId,
        work_date: today,
        start_time: startTime,
        end_time: endTime,
        break_minutes: parseInt(breakMinutes) || 0,
        // total_minutes is a generated column in Postgres — never send it.
        meal_allowance: mealAllowance,
        observation: observation.trim() || null,
        status: 'draft',
      });
      if (error) throw error;

      toast.success('Intervention ajoutée');
      setAddDialogOpen(false);
      resetForm();
      fetchData();
    } catch (err) {
      console.error('Error adding entry:', err);
      toast.error("Impossible d'ajouter l'intervention");
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete entry ──────────────────────────────────────────────────────────

  const handleDeleteEntry = async (entryId: string) => {
    try {
      const { error } = await supabase
        .from('time_entries')
        .delete()
        .eq('id', entryId)
        .eq('user_id', user!.id);
      if (error) throw error;
      toast.success('Intervention supprimée');
      fetchData();
    } catch (err) {
      console.error('Error deleting entry:', err);
      toast.error('Impossible de supprimer');
    }
  };

  const handleDeletePending = (localId: string) => {
    removePendingEntry(user!.id, localId);
    setPendingEntries(prev => prev.filter(e => e.localId !== localId));
    toast.success('Intervention supprimée');
  };

  // ─── Edit an existing entry ──────────────────────────────────────────────────

  // An entry stays editable by its owner until it is exported/locked.
  const isEditable = (entry: TimeEntryWithWorksite) =>
    !entry.locked && !entry.exported_at;

  const openEdit = (entry: TimeEntryWithWorksite) => {
    if (!isEditable(entry)) return;
    setEditingEntry(entry);
    setEditStart(entry.start_time?.substring(0, 5) || '');
    setEditEnd(entry.end_time?.substring(0, 5) || '');
    setEditBreak(String(entry.break_minutes ?? 0));
    setEditMeal(entry.meal_allowance);
    setEditObs(entry.observation || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry || !user) return;
    if (!editStart || !editEnd) {
      toast.error('Les heures de début et fin sont requises');
      return;
    }
    setEditSaving(true);
    try {
      const { error } = await supabase
        .from('time_entries')
        .update({
          start_time: editStart,
          end_time: editEnd,
          break_minutes: parseInt(editBreak) || 0,
          // total_minutes is a generated column in Postgres — never send it.
          meal_allowance: editMeal,
          observation: editObs.trim() || null,
        })
        .eq('id', editingEntry.id)
        .eq('user_id', user.id);
      if (error) throw error;
      toast.success('Intervention modifiée');
      setEditingEntry(null);
      fetchData();
    } catch (err) {
      console.error('Error editing entry:', err);
      toast.error("Impossible de modifier l'intervention");
    } finally {
      setEditSaving(false);
    }
  };

  // ─── Copy yesterday ──────────────────────────────────────────────────────────

  const handleCopyYesterday = async () => {
    if (!user) return;
    if (!navigator.onLine) {
      toast.error('Copie indisponible hors-ligne');
      return;
    }
    setCopyingYesterday(true);
    try {
      const { data: yEntries, error } = await supabase
        .from('time_entries')
        .select('*')
        .eq('user_id', user.id)
        .eq('work_date', yesterday)
        .order('start_time');
      if (error) throw error;

      if (!yEntries || yEntries.length === 0) {
        toast.error("Aucune intervention hier à copier");
        return;
      }

      const rows = yEntries.map((e) => ({
        company_id: user.company_id,
        user_id: user.id,
        worksite_id: e.worksite_id,
        planning_id: planning.find(p => p.worksite_id === e.worksite_id)?.id || null,
        work_date: today,
        start_time: e.start_time,
        end_time: e.end_time,
        break_minutes: e.break_minutes,
        // total_minutes is a generated column in Postgres — never send it.
        meal_allowance: e.meal_allowance,
        observation: e.observation,
        status: 'draft' as const,
      }));

      const { error: insErr } = await supabase.from('time_entries').insert(rows);
      if (insErr) throw insErr;

      toast.success(`${rows.length} intervention${rows.length > 1 ? 's' : ''} copiée${rows.length > 1 ? 's' : ''} depuis hier`);
      fetchData();
    } catch (err) {
      console.error('Error copying yesterday:', err);
      toast.error("Impossible de copier la journée d'hier");
    } finally {
      setCopyingYesterday(false);
    }
  };

  // ─── Submit day ────────────────────────────────────────────────────────────

  const checkCoherenceWarnings = (): string[] => {
    const drafts = entries.filter(e => e.status === 'draft' && !e.locked);
    if (drafts.length === 0) return [];
    const warnings: string[] = [];
    const totalMins = drafts.reduce((s, e) => s + e.total_minutes, 0);
    if (totalMins > 600) {
      warnings.push(`Total du jour : ${formatMinutesToHours(totalMins)} (dépasse 10h). Vérifiez vos horaires.`);
    }
    const longNoBreak = drafts.filter(e => e.break_minutes === 0 && e.total_minutes >= 240);
    if (longNoBreak.length > 0) {
      warnings.push(
        `${longNoBreak.length > 1 ? `${longNoBreak.length} interventions dépassent` : 'Une intervention dépasse'} 4h sans aucune pause.`
      );
    }
    return warnings;
  };

  const handleSubmitDay = () => {
    const draftIds = entries.filter(e => e.status === 'draft' && !e.locked).map(e => e.id);
    if (draftIds.length === 0) {
      toast.error('Ajoutez au moins une intervention');
      return;
    }
    const warnings = checkCoherenceWarnings();
    if (warnings.length > 0) {
      setCoherenceWarnings(warnings);
      setConfirmOpen(true);
    } else {
      doSubmit();
    }
  };

  const doSubmit = async () => {
    const draftIds = entries.filter(e => e.status === 'draft' && !e.locked).map(e => e.id);
    if (draftIds.length === 0) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('time_entries')
        .update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .in('id', draftIds)
        .eq('user_id', user!.id)
        .eq('status', 'draft');
      if (error) throw error;
      toast.success('Journée envoyée');
      fetchData();
    } catch (err) {
      console.error('Error submitting day:', err);
      toast.error("Impossible d'envoyer");
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
    setBreakMinutes('0');
    setBreakTouched(false);
    setMealAllowance(true);
    setObservation('');
  };

  const openBlankAdd = () => { resetForm(); setAddDialogOpen(true); };

  const openAddFromPlanning = (p: Planning & { worksite: Worksite }) => {
    setNewEntryType('existing');
    setSelectedWorksiteId(p.worksite_id || '');
    setNewClientName(''); setNewProductType(''); setNewCity('');
    setStartTime(p.estimated_start ? p.estimated_start.substring(0, 5) : '07:30');
    setEndTime(p.estimated_end ? p.estimated_end.substring(0, 5) : '');
    setBreakMinutes('0');
    setBreakTouched(false);
    setMealAllowance(true);
    setObservation('');
    setAddDialogOpen(true);
  };

  const handlePickSuggestion = (ws: Worksite) => {
    setNewEntryType('existing');
    setSelectedWorksiteId(ws.id);
    setNewClientName('');
    setNewProductType('');
    setNewCity('');
  };

  // ─── Computed ──────────────────────────────────────────────────────────────

  const serverTotal = entries.reduce((s, e) => s + e.total_minutes, 0);
  const pendingTotal = pendingEntries.reduce((s, e) => s + e.total_minutes, 0);
  const totalMinutes = serverTotal + pendingTotal;
  const hasDrafts = entries.some(e => e.status === 'draft') || pendingEntries.length > 0;
  const allSubmitted = entries.length > 0 && entries.every(e => e.status !== 'draft') && pendingEntries.length === 0;
  const isEmpty = entries.length === 0 && pendingEntries.length === 0;
  // Planned chantiers not yet declared — stay actionable, drop off once declared.
  const declaredWorksiteIds = new Set<string>([
    ...(entries.map(e => e.worksite_id).filter(Boolean) as string[]),
    ...pendingEntries.map(e => e.worksite_id),
  ]);
  const plannedTodo = planning.filter(p => p.worksite_id && !declaredWorksiteIds.has(p.worksite_id));
  const mealCount = entries.filter(e => e.meal_allowance).length + pendingEntries.filter(e => e.meal_allowance).length;

  // Anti-duplicate: existing worksites whose name resembles what's being typed.
  const typedNorm = normalizeStr(newClientName);
  const similarWorksites =
    newEntryType === 'new' && typedNorm.length >= 2
      ? worksites
          .filter((w) => {
            const n = normalizeStr(w.client_name);
            return n.includes(typedNorm) || typedNorm.includes(n);
          })
          .slice(0, 4)
      : [];

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
      <div>
        <h2 className="text-xl font-bold capitalize">{format(new Date(), 'EEEE d MMMM', { locale: fr })}</h2>
      </div>

      {/* Unsent-days reminder (non-blocking) */}
      {missingDays.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-start gap-2 text-sm text-orange-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Tu n'as pas envoyé ta journée : {missingDays.map((d) => format(parseISO(d), 'EEE d MMM', { locale: fr })).join(', ')}.
          </span>
        </div>
      )}

      {/* Offline / syncing banner */}
      {!isOnline && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-center gap-2 text-sm text-orange-700">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>Mode hors-ligne — vos saisies seront synchronisées automatiquement au retour du réseau</span>
        </div>
      )}
      {isOnline && syncing && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2 text-sm text-blue-700">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span>Synchronisation des saisies hors-ligne...</span>
        </div>
      )}

      {/* Total card */}
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
              <p className="text-sm opacity-90">
                {entries.length + pendingEntries.length} intervention{entries.length + pendingEntries.length > 1 ? 's' : ''}
              </p>
              <p className="text-sm opacity-90">
                {mealCount} panier{mealCount > 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Planned chantiers still to declare — tap to declare (pre-filled) */}
      {plannedTodo.length > 0 && (
        <div className="space-y-2">
          {plannedTodo.map((p) => (
            <Card
              key={p.id}
              className="border-primary/30 bg-primary/5 cursor-pointer transition-colors hover:bg-primary/10"
              onClick={() => openAddFromPlanning(p)}
            >
              <CardContent className="py-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Chantier prévu</p>
                  <p className="font-semibold truncate flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    {p.worksite?.client_name}{p.worksite?.city ? ` — ${p.worksite.city}` : ''}
                  </p>
                  {p.estimated_start && p.estimated_end && (
                    <p className="text-xs text-muted-foreground mt-0.5">Prévu {p.estimated_start.substring(0, 5)}–{p.estimated_end.substring(0, 5)}</p>
                  )}
                </div>
                <span className="flex items-center gap-1 text-primary font-medium text-sm shrink-0">
                  <Plus className="h-4 w-4" /> Déclarer mes heures
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state — only when nothing planned and nothing declared */}
      {isEmpty && plannedTodo.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Aucune intervention aujourd'hui</p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center mt-4">
              <Button onClick={openBlankAdd}>
                <Plus className="h-4 w-4 mr-2" />
                Ajouter une intervention
              </Button>
              {isOnline && (
                <Button variant="outline" onClick={handleCopyYesterday} disabled={copyingYesterday}>
                  {copyingYesterday ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  Copier la journée d'hier
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Planned but nothing declared yet — still offer a free entry / copy */}
      {isEmpty && plannedTodo.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" className="flex-1" onClick={openBlankAdd}>
            <Plus className="h-4 w-4 mr-2" /> Autre intervention
          </Button>
          {isOnline && (
            <Button variant="outline" className="flex-1" onClick={handleCopyYesterday} disabled={copyingYesterday}>
              {copyingYesterday ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              Copier la journée d'hier
            </Button>
          )}
        </div>
      )}

      {/* Server entries */}
      {(entries.length > 0 || pendingEntries.length > 0) && (
        <div className="space-y-3">
          {entries.map((entry) => {
            const editable = isEditable(entry);
            return (
            <Card
              key={entry.id}
              className={editable ? 'cursor-pointer transition-colors hover:bg-muted/40' : ''}
              onClick={editable ? () => openEdit(entry) : undefined}
            >
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
                  <div className="flex items-center gap-1 shrink-0">
                    {editable && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); openEdit(entry); }}
                        aria-label="Modifier l'intervention"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {entry.status === 'draft' && !entry.locked && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={(e) => { e.stopPropagation(); handleDeleteEntry(entry.id); }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
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
                    <Badge variant="secondary" className="text-xs"><Utensils className="h-3 w-3 mr-1" />Panier</Badge>
                  )}
                  {entry.break_minutes > 0 && (
                    <Badge variant="outline" className="text-xs">Pause {entry.break_minutes}min</Badge>
                  )}
                  {entry.status === 'submitted' && <Badge variant="default" className="text-xs">Envoyé</Badge>}
                </div>
                {entry.observation && <p className="text-sm text-muted-foreground">{entry.observation}</p>}
              </CardContent>
            </Card>
            );
          })}

          {/* Pending (offline) entries */}
          {pendingEntries.map((entry) => (
            <Card key={entry.localId} className="border-orange-300 bg-orange-50/30">
              <CardContent className="py-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{entry._worksite_name}</p>
                    {entry._worksite_city && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {entry._worksite_city}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
                      <WifiOff className="h-3 w-3 mr-1" />
                      Hors-ligne
                    </Badge>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeletePending(entry.localId)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{entry.start_time.substring(0, 5)} - {entry.end_time.substring(0, 5)}</span>
                  </div>
                  <span className="font-bold text-primary">{formatMinutesToHours(entry.total_minutes)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {entry.meal_allowance && (
                    <Badge variant="secondary" className="text-xs"><Utensils className="h-3 w-3 mr-1" />Panier</Badge>
                  )}
                  {entry.break_minutes > 0 && (
                    <Badge variant="outline" className="text-xs">Pause {entry.break_minutes}min</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Action row */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={openBlankAdd}
            >
              <Plus className="h-4 w-4 mr-2" />
              Ajouter
            </Button>

            {hasDrafts && isOnline && (
              <Button
                className="flex-1"
                onClick={handleSubmitDay}
                disabled={submitting || pendingEntries.length > 0}
                title={pendingEntries.length > 0 ? 'Synchronisation en cours...' : undefined}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Envoyer ma journée
              </Button>
            )}

            {pendingEntries.length > 0 && isOnline && (
              <Button variant="outline" onClick={syncPendingEntries} disabled={syncing}>
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            )}
          </div>

          {allSubmitted && (
            <div className="text-center py-2">
              <p className="text-sm text-muted-foreground">Journée envoyée ✓</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={openBlankAdd}>
                <Plus className="h-4 w-4 mr-2" />
                Ajouter une intervention
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ─── Add entry dialog (single instance) ─────────────────────────────── */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nouvelle intervention</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddEntry} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Chantier</Label>
              <div className="flex gap-2 mb-2">
                <Button type="button" variant={newEntryType === 'existing' ? 'default' : 'outline'} size="sm" onClick={() => setNewEntryType('existing')} className="flex-1">Existant</Button>
                <Button type="button" variant={newEntryType === 'new' ? 'default' : 'outline'} size="sm" onClick={() => setNewEntryType('new')} className="flex-1">Nouveau</Button>
              </div>

              {newEntryType === 'existing' ? (
                <Select value={selectedWorksiteId} onValueChange={setSelectedWorksiteId} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez un chantier" />
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
                  <Input placeholder="Nom du client *" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} required />

                  {/* Anti-duplicate guard: suggest existing similar worksites */}
                  {similarWorksites.length > 0 && (
                    <div className="rounded-md border border-orange-200 bg-orange-50 p-2 space-y-1">
                      <p className="text-xs text-orange-700 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Chantiers existants similaires — évitez les doublons :
                      </p>
                      {similarWorksites.map((ws) => (
                        <button
                          key={ws.id}
                          type="button"
                          onClick={() => handlePickSuggestion(ws)}
                          className="w-full text-left text-sm bg-white border rounded px-2 py-1.5 hover:bg-orange-100 transition-colors flex items-center justify-between gap-2"
                        >
                          <span className="truncate">
                            {ws.client_name}{ws.city ? ` - ${ws.city}` : ''}
                          </span>
                          <span className="text-xs text-orange-600 shrink-0">Utiliser</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <Input placeholder="Type de produit (stores, volets...)" value={newProductType} onChange={(e) => setNewProductType(e.target.value)} />
                  <Input placeholder="Ville" value={newCity} onChange={(e) => setNewCity(e.target.value)} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <TimeStepper label="Heure début" value={startTime} onChange={setStartTime} fallback="07:30" />
              <TimeStepper label="Heure fin" value={endTime} onChange={setEndTime} fallback="17:00" />
            </div>

            {startTime && endTime && (
              <p className="text-center text-sm text-muted-foreground">
                Total travaillé : <strong className="text-foreground">{formatMinutesToHours(calculateTotalMinutes(startTime, endTime, parseInt(breakMinutes) || 0))}</strong>
              </p>
            )}

            <BreakStepper value={breakMinutes} onChange={(v) => { setBreakTouched(true); setBreakMinutes(v); }} />

            <div className="flex items-center space-x-2">
              <Checkbox id="meal" checked={mealAllowance} onCheckedChange={(v) => setMealAllowance(v as boolean)} />
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

      {/* ─── Coherence confirmation dialog ────────────────────────────────────── */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Vérification requise
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {coherenceWarnings.map((w, i) => (
              <p key={i} className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded p-2">{w}</p>
            ))}
            <p className="text-sm text-muted-foreground pt-1">Voulez-vous quand même envoyer votre journée ?</p>
          </div>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmOpen(false)}>
              Corriger
            </Button>
            <Button className="flex-1" onClick={() => { setConfirmOpen(false); doSubmit(); }}>
              Confirmer l'envoi
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Edit entry dialog ────────────────────────────────────────────────── */}
      <Dialog open={!!editingEntry} onOpenChange={(open) => { if (!open) setEditingEntry(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier l'intervention</DialogTitle>
          </DialogHeader>
          {editingEntry && (
            <form onSubmit={handleSaveEdit} className="space-y-4 pt-2">
              <div className="text-sm text-muted-foreground">
                {editingEntry.worksite?.client_name || 'Chantier'}
                {editingEntry.worksite?.city ? ` — ${editingEntry.worksite.city}` : ''}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <TimeStepper label="Heure début" value={editStart} onChange={setEditStart} fallback="07:30" />
                <TimeStepper label="Heure fin" value={editEnd} onChange={setEditEnd} fallback="17:00" />
              </div>

              {editStart && editEnd && (
                <p className="text-center text-sm text-muted-foreground">
                  Total travaillé : <strong className="text-foreground">{formatMinutesToHours(calculateTotalMinutes(editStart, editEnd, parseInt(editBreak) || 0))}</strong>
                </p>
              )}

              <BreakStepper value={editBreak} onChange={setEditBreak} />

              <div className="flex items-center space-x-2">
                <Checkbox id="edit-meal" checked={editMeal} onCheckedChange={(v) => setEditMeal(v as boolean)} />
                <Label htmlFor="edit-meal" className="cursor-pointer">Panier repas</Label>
              </div>

              <div className="space-y-2">
                <Label>Observation (optionnel)</Label>
                <Input placeholder="Note..." value={editObs} onChange={(e) => setEditObs(e.target.value)} />
              </div>

              <Button type="submit" className="w-full" disabled={editSaving}>
                {editSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Enregistrer
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
