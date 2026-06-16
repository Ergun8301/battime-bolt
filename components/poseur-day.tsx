'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { TimeEntry, Worksite, Planning } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus, Trash2, Send, Loader2, MapPin, Clock, Utensils, WifiOff, RefreshCw, AlertTriangle, Copy, ArrowLeft,
} from 'lucide-react';
import { format, subDays, addDays, startOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  addPendingEntry, getPendingEntries, removePendingEntry, clearPendingEntriesForDate,
  generateLocalId, PendingEntry,
} from '@/lib/offline-store';
import { TimeCylinder, snapToGrid } from '@/components/time-cylinder';

interface TimeEntryWithWorksite extends TimeEntry {
  worksite: Worksite;
}

function formatMinutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m.toString().padStart(2, '0')}`;
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

// Pauses = the gaps between consecutive (sorted) slots. Computed, never stored.
function computePauses(slots: { start: string; end: string }[]) {
  const sorted = slots.filter((s) => s.start && s.end).sort((a, b) => a.start.localeCompare(b.start));
  const out: { start: string; end: string; minutes: number }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = toMin(sorted[i].start) - toMin(sorted[i - 1].end);
    if (gap > 0) out.push({ start: sorted[i - 1].end, end: sorted[i].start, minutes: gap });
  }
  return out;
}

// (The intervention editor is a full-screen sheet, rendered inline in the component below.)

// ─── main ──────────────────────────────────────────────────────────────────────

type SlotTarget =
  | { kind: 'planned'; planningId: string }
  | { kind: 'entry'; entryId: string }
  | { kind: 'pending'; localId: string }
  | { kind: 'new' };

export default function PoseurDay({ date: dateProp }: { date?: string } = {}) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TimeEntryWithWorksite[]>([]);
  const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([]);
  const [worksites, setWorksites] = useState<Worksite[]>([]);
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
  const [fSaving, setFSaving] = useState(false);
  // Chantier picker (existing chantiers only — workers don't create clients)
  const [fWorksiteId, setFWorksiteId] = useState('');

  // Coherence confirmation
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [coherenceWarnings, setCoherenceWarnings] = useState<string[]>([]);

  // Copy-yesterday
  const [copyingYesterday, setCopyingYesterday] = useState(false);

  // Repeat this day onto other days (same chantier for several days).
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  // Correction mode: a sent day is frozen; tapping an intervention asks to confirm.
  const [correcting, setCorrecting] = useState(false);
  const [confirmCorrectOpen, setConfirmCorrectOpen] = useState(false);
  const [pendingEditId, setPendingEditId] = useState<string | null>(null);
  const [lateOpen, setLateOpen] = useState(false);

  const date = dateProp || format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(subDays(new Date(`${date}T00:00:00`), 1), 'yyyy-MM-dd');
  // Payroll cutoff: a day in a past month is locked — corrections go through the secretary.
  const monthLocked = date.slice(0, 7) < format(new Date(), 'yyyy-MM');

  // A sent day is frozen again whenever we switch day.
  useEffect(() => { setCorrecting(false); }, [date]);

  // ─── Fetch server data ─────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const [entriesRes, worksitesRes, planningRes] = await Promise.all([
        supabase.from('time_entries').select('*, worksite:worksites(*)').eq('user_id', user.id).eq('work_date', date).order('start_time'),
        supabase.from('worksites').select('*').eq('company_id', user.company_id).eq('is_active', true).order('client_name'),
        supabase.from('planning').select('*, worksite:worksites(*)').eq('user_id', user.id).eq('work_date', date),
      ]);
      if (entriesRes.error) throw entriesRes.error;
      if (worksitesRes.error) throw worksitesRes.error;
      if (planningRes.error) throw planningRes.error;

      setEntries(entriesRes.data || []);
      setWorksites(worksitesRes.data || []);
      setPlanning(planningRes.data || []);

      const pendForToday = getPendingEntries(user.id).filter((e) => e.work_date === date);
      setDayMeal((entriesRes.data || []).some((e: TimeEntryWithWorksite) => e.meal_allowance) || pendForToday.some((e) => e.meal_allowance));
    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error('Impossible de charger vos données');
    } finally {
      setLoading(false);
    }
  }, [user, date]);

  // ─── Sync pending offline entries ─────────────────────────────────────────

  const syncPendingEntries = useCallback(async () => {
    if (!user || !navigator.onLine) return;
    const pending = getPendingEntries(user.id).filter((e) => e.work_date === date);
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
          break_minutes: 0,
          // total_minutes is a generated column in Postgres — never send it.
          meal_allowance: entry.meal_allowance,
          observation: entry.observation,
          status: 'draft',
        });
        if (!error) {
          removePendingEntry(user.id, entry.localId);
          synced++;
        }
      } catch { /* continue */ }
    }
    setSyncing(false);

    if (synced > 0) {
      toast.success(`${synced} intervention${synced > 1 ? 's' : ''} synchronisée${synced > 1 ? 's' : ''}`);
      setPendingEntries(getPendingEntries(user.id).filter((e) => e.work_date === date));
      fetchData();
    }
  }, [user, date, fetchData]);

  // ─── Online / offline listeners ───────────────────────────────────────────

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => { setIsOnline(true); syncPendingEntries(); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncPendingEntries]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (user) {
      const pending = getPendingEntries(user.id).filter((e) => e.work_date === date);
      setPendingEntries(pending);
      if (navigator.onLine && pending.length > 0) syncPendingEntries();
    }
  }, [user, date, syncPendingEntries]);

  // ─── Day meal: keep exactly one flagged row per day (no migration) ──────────

  const applyDayMeal = useCallback(async (value: boolean) => {
    if (!user) return;
    if (navigator.onLine) {
      const { data } = await supabase.from('time_entries').select('id, start_time, meal_allowance').eq('user_id', user.id).eq('work_date', date);
      const rows = [...(data || [])].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
      const ups = [];
      for (let i = 0; i < rows.length; i++) {
        const target = i === 0 ? value : false;
        if (rows[i].meal_allowance !== target) {
          ups.push(supabase.from('time_entries').update({ meal_allowance: target }).eq('id', rows[i].id).eq('user_id', user.id));
        }
      }
      if (ups.length) await Promise.all(ups);
    }
    const pend = getPendingEntries(user.id).filter((e) => e.work_date === date);
    if (pend.length > 0) {
      const sorted = [...pend].sort((a, b) => a.start_time.localeCompare(b.start_time));
      clearPendingEntriesForDate(user.id, date);
      sorted.forEach((e, i) => addPendingEntry(user.id, { ...e, meal_allowance: i === 0 ? value : false }));
      setPendingEntries(getPendingEntries(user.id).filter((e) => e.work_date === date));
    }
  }, [user, date]);

  const toggleDayMeal = async (value: boolean) => {
    setDayMeal(value);
    try {
      await applyDayMeal(value);
      if (navigator.onLine) fetchData();
    } catch (err) {
      console.error('Error setting meal:', err);
    }
  };

  // ─── Inline editor open / save / delete ─────────────────────────────────────

  const openPlanned = (p: Planning & { worksite: Worksite }) => {
    if (monthLocked) { setLateOpen(true); return; }
    setOpenSlot({ kind: 'planned', planningId: p.id });
    setFStart(snapToGrid(p.estimated_start ? p.estimated_start.substring(0, 5) : '08:00'));
    setFEnd(snapToGrid(p.estimated_end ? p.estimated_end.substring(0, 5) : '17:00'));
    setFObs('');
  };
  const openEntry = (e: TimeEntryWithWorksite) => {
    setOpenSlot({ kind: 'entry', entryId: e.id });
    setFStart(snapToGrid(e.start_time?.substring(0, 5) || '08:00'));
    setFEnd(snapToGrid(e.end_time?.substring(0, 5) || '17:00'));
    setFObs(e.observation || '');
  };
  const openPending = (e: PendingEntry) => {
    setOpenSlot({ kind: 'pending', localId: e.localId });
    setFStart(snapToGrid(e.start_time.substring(0, 5)));
    setFEnd(snapToGrid(e.end_time.substring(0, 5)));
    setFObs(e.observation || '');
  };
  const openNew = () => {
    if (monthLocked) { setLateOpen(true); return; }
    setOpenSlot({ kind: 'new' });
    setFWorksiteId('');
    // First slot of the day → morning ; otherwise → afternoon. Worker adjusts if needed.
    const hasContent = entries.length + pendingEntries.length > 0;
    if (hasContent) { setFStart('13:00'); setFEnd('17:00'); }
    else { setFStart('08:00'); setFEnd('12:00'); }
    setFObs('');
  };
  const cancelSlot = () => setOpenSlot(null);

  // Tap a sent intervention (or the meal) → confirm → unlock the day, then open the slot.
  const askCorrect = (entryId: string | null) => { setPendingEditId(entryId); setConfirmCorrectOpen(true); };
  const confirmCorrect = () => {
    setCorrecting(true);
    setConfirmCorrectOpen(false);
    if (pendingEditId) {
      const e = entries.find((x) => x.id === pendingEditId);
      setPendingEditId(null);
      if (e) openEntry(e);
    }
  };

  const saveSlot = async () => {
    if (!user || !openSlot) return;
    if (!fStart || !fEnd) { toast.error("Indique l'heure de début et de fin"); return; }
    setFSaving(true);
    try {
      const totalMins = calculateTotalMinutes(fStart, fEnd, 0);
      let savedMsg = 'Heures enregistrées';

      // ── Update an existing entry ──
      if (openSlot.kind === 'entry') {
        const wasSubmitted = entries.find((e) => e.id === openSlot.entryId)?.status === 'submitted';
        if (wasSubmitted) savedMsg = 'Modification enregistrée — la secrétaire est prévenue';
        const { error } = await supabase.from('time_entries').update({
          start_time: fStart, end_time: fEnd, break_minutes: 0, observation: fObs.trim() || null,
          // Editing an already-sent entry: flag it so the secretary sees the change.
          ...(wasSubmitted ? { modified_at: new Date().toISOString(), modified_by: user.id } : {}),
        }).eq('id', openSlot.entryId).eq('user_id', user.id);
        if (error) throw error;
      } else if (openSlot.kind === 'pending') {
        const pend = getPendingEntries(user.id).find((e) => e.localId === openSlot.localId);
        if (pend) {
          removePendingEntry(user.id, openSlot.localId);
          addPendingEntry(user.id, { ...pend, start_time: fStart, end_time: fEnd, break_minutes: 0, total_minutes: totalMins, observation: fObs.trim() || null });
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

        const planningId = planning.find((p) => p.worksite_id === worksiteId)?.id || null;

        if (!navigator.onLine) {
          const pending: PendingEntry = {
            localId: generateLocalId(), company_id: user.company_id, user_id: user.id, worksite_id: worksiteId,
            planning_id: planningId, work_date: date, start_time: fStart, end_time: fEnd, break_minutes: 0,
            total_minutes: totalMins, meal_allowance: false, observation: fObs.trim() || null,
            _worksite_name: worksiteName, _worksite_city: worksiteCity, _saved_at: Date.now(),
          };
          addPendingEntry(user.id, pending);
        } else {
          const { error } = await supabase.from('time_entries').insert({
            company_id: user.company_id, user_id: user.id, worksite_id: worksiteId, planning_id: planningId,
            work_date: date, start_time: fStart, end_time: fEnd, break_minutes: 0,
            meal_allowance: false, observation: fObs.trim() || null, status: 'draft',
          });
          if (error) throw error;
        }
      }

      setOpenSlot(null);
      await applyDayMeal(dayMeal);
      if (navigator.onLine) fetchData();
      setPendingEntries(getPendingEntries(user.id).filter((e) => e.work_date === date));
      toast.success(savedMsg);
    } catch (err) {
      console.error('Error saving slot:', err);
      toast.error("Impossible d'enregistrer");
    } finally {
      setFSaving(false);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase.from('time_entries').delete().eq('id', entryId).eq('user_id', user.id);
      if (error) throw error;
      toast.success('Intervention supprimée');
      if (openSlot?.kind === 'entry' && openSlot.entryId === entryId) setOpenSlot(null);
      await applyDayMeal(dayMeal);
      fetchData();
    } catch (err) {
      console.error('Error deleting entry:', err);
      toast.error('Impossible de supprimer');
    }
  };

  const handleDeletePending = (localId: string) => {
    if (!user) return;
    removePendingEntry(user.id, localId);
    setPendingEntries((prev) => prev.filter((e) => e.localId !== localId));
    if (openSlot?.kind === 'pending' && openSlot.localId === localId) setOpenSlot(null);
    toast.success('Intervention supprimée');
  };

  // ─── Copy yesterday ──────────────────────────────────────────────────────────

  const handleCopyYesterday = async () => {
    if (!user) return;
    if (!navigator.onLine) { toast.error('Copie indisponible hors-ligne'); return; }
    setCopyingYesterday(true);
    try {
      const { data: yEntries, error } = await supabase.from('time_entries').select('*').eq('user_id', user.id).eq('work_date', yesterday).order('start_time');
      if (error) throw error;
      if (!yEntries || yEntries.length === 0) { toast.error('Aucune intervention hier à copier'); return; }

      const rows = yEntries.map((e) => ({
        company_id: user.company_id, user_id: user.id, worksite_id: e.worksite_id,
        planning_id: planning.find((p) => p.worksite_id === e.worksite_id)?.id || null,
        work_date: date, start_time: e.start_time, end_time: e.end_time, break_minutes: 0,
        // total_minutes is a generated column in Postgres — never send it.
        meal_allowance: false, observation: e.observation, status: 'draft' as const,
      }));
      const { error: insErr } = await supabase.from('time_entries').insert(rows);
      if (insErr) throw insErr;

      toast.success(`${rows.length} intervention${rows.length > 1 ? 's' : ''} copiée${rows.length > 1 ? 's' : ''} depuis hier`);
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

  const base = new Date(`${date}T00:00:00`);
  const tomorrowStr = format(addDays(base, 1), 'yyyy-MM-dd');
  const tomorrowLabel = format(addDays(base, 1), 'EEEE d MMMM', { locale: fr });
  const saturday = addDays(startOfWeek(base, { weekStartsOn: 1 }), 5); // Mon→Sat work week
  const restOfWeekStrs: string[] = [];
  for (let d = addDays(base, 1); d <= saturday; d = addDays(d, 1)) restOfWeekStrs.push(format(d, 'yyyy-MM-dd'));

  const copyToDates = async (targetStrs: string[]) => {
    if (!user) return;
    if (!navigator.onLine) { toast.error('Copie indisponible hors-ligne'); return; }
    const targets = Array.from(new Set(targetStrs)).filter((d) => d !== date);
    const sources = [
      ...entries.map((e) => ({ worksite_id: e.worksite_id, start_time: e.start_time, end_time: e.end_time, meal_allowance: e.meal_allowance, observation: e.observation })),
      ...pendingEntries.map((e) => ({ worksite_id: e.worksite_id, start_time: e.start_time, end_time: e.end_time, meal_allowance: e.meal_allowance, observation: e.observation })),
    ];
    if (sources.length === 0) { toast.error('Aucune intervention à copier'); return; }
    if (targets.length === 0) { toast.error('Aucun jour à remplir'); return; }
    setCopying(true);
    try {
      // Link planning_id where the target day already has that chantier planned.
      const { data: plan } = await supabase.from('planning').select('id, work_date, worksite_id').eq('user_id', user.id).in('work_date', targets);
      const planMap = new Map<string, string>();
      (plan || []).forEach((p: { id: string; work_date: string; worksite_id: string | null }) => {
        if (p.worksite_id) planMap.set(`${p.work_date}|${p.worksite_id}`, p.id);
      });
      const rows = targets.flatMap((td) => sources.map((s) => ({
        company_id: user.company_id, user_id: user.id, worksite_id: s.worksite_id,
        planning_id: planMap.get(`${td}|${s.worksite_id}`) || null,
        work_date: td, start_time: s.start_time, end_time: s.end_time, break_minutes: 0,
        meal_allowance: s.meal_allowance, observation: s.observation || null, status: 'draft' as const,
      })));
      const { error } = await supabase.from('time_entries').insert(rows);
      if (error) throw error;
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
    if (drafts.length === 0) return [];
    const warnings: string[] = [];
    if (plannedTodo.length > 0) {
      warnings.push(`Il reste ${plannedTodo.length} chantier${plannedTodo.length > 1 ? 's' : ''} prévu${plannedTodo.length > 1 ? 's' : ''} sans heures.`);
    }
    const totalMins = drafts.reduce((s, e) => s + e.total_minutes, 0);
    if (totalMins > 600) warnings.push(`Total : ${formatMinutesToHours(totalMins)} (dépasse 10h). Vérifie tes horaires.`);
    const slots = [...entries, ...pendingEntries]
      .map((e) => ({ s: (e.start_time || '').slice(0, 5), e: (e.end_time || '').slice(0, 5) }))
      .filter((x) => x.s && x.e)
      .sort((a, b) => a.s.localeCompare(b.s));
    if (slots.some((x, i) => i > 0 && toMin(x.s) < toMin(slots[i - 1].e))) {
      warnings.push('Certaines interventions se chevauchent. Vérifie tes heures.');
    }
    return warnings;
  };

  const handleSubmitDay = () => {
    const draftIds = entries.filter((e) => e.status === 'draft' && !e.locked).map((e) => e.id);
    if (draftIds.length === 0) { toast.error('Ajoute au moins une intervention'); return; }
    const warnings = checkCoherenceWarnings();
    if (warnings.length > 0) { setCoherenceWarnings(warnings); setConfirmOpen(true); } else { doSubmit(); }
  };

  const doSubmit = async () => {
    if (!user) return;
    const draftIds = entries.filter((e) => e.status === 'draft' && !e.locked).map((e) => e.id);
    if (draftIds.length === 0) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('time_entries').update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .in('id', draftIds).eq('user_id', user.id).eq('status', 'draft');
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

  // ─── Computed ──────────────────────────────────────────────────────────────

  const serverTotal = entries.reduce((s, e) => s + e.total_minutes, 0);
  const pendingTotal = pendingEntries.reduce((s, e) => s + e.total_minutes, 0);
  const totalMinutes = serverTotal + pendingTotal;
  const nbInterventions = entries.length + pendingEntries.length;
  const hasDrafts = entries.some((e) => e.status === 'draft') || pendingEntries.length > 0;
  const allSubmitted = entries.length > 0 && entries.every((e) => e.status !== 'draft') && pendingEntries.length === 0;
  const frozen = allSubmitted && !correcting; // a sent day is read-only until "Corriger"
  const isEmpty = entries.length === 0 && pendingEntries.length === 0;
  const isEditable = (e: TimeEntryWithWorksite) => !e.locked && !e.exported_at;

  const declaredWorksiteIds = new Set<string>([
    ...(entries.map((e) => e.worksite_id).filter(Boolean) as string[]),
    ...pendingEntries.map((e) => e.worksite_id),
  ]);
  const plannedTodo = planning.filter((p) => p.worksite_id && !declaredWorksiteIds.has(p.worksite_id));

  const pauses = computePauses(
    [...entries, ...pendingEntries].map((e) => ({ start: (e.start_time || '').slice(0, 5), end: (e.end_time || '').slice(0, 5) })),
  );

  // "Autre" is a real worksite pinned at the top of the picker (created once per
  // company in Supabase) — for work the secretary hasn't listed / the worker can't name.
  const OTHER_NAME = 'Autre';
  const sortedWorksites = [...worksites].sort((a, b) => {
    if (a.client_name === OTHER_NAME) return -1;
    if (b.client_name === OTHER_NAME) return 1;
    return a.client_name.localeCompare(b.client_name);
  });

  // Unified list of the day's slots — planned-not-yet-declared, declared entries, and pending
  // (offline) entries — sorted by start time. The card position stays put as soon as the slot
  // has a start time, so filling a planned card no longer makes it jump to the bottom.
  type DayItem =
    | { kind: 'planned'; sort: string; key: string; data: Planning & { worksite: Worksite } }
    | { kind: 'entry'; sort: string; key: string; data: TimeEntryWithWorksite }
    | { kind: 'pending'; sort: string; key: string; data: PendingEntry };
  const items: DayItem[] = [
    ...plannedTodo.map((p): DayItem => ({ kind: 'planned', sort: (p.estimated_start || '99:99').slice(0, 5), key: `p:${p.id}`, data: p })),
    ...entries.map((e): DayItem => ({ kind: 'entry', sort: (e.start_time || '99:99').slice(0, 5), key: `e:${e.id}`, data: e })),
    ...pendingEntries.map((pe): DayItem => ({ kind: 'pending', sort: (pe.start_time || '99:99').slice(0, 5), key: `pe:${pe.localId}`, data: pe })),
  ].sort((a, b) => a.sort.localeCompare(b.sort));

  const titleName = !openSlot ? ''
    : openSlot.kind === 'planned' ? (planning.find((p) => p.id === openSlot.planningId)?.worksite?.client_name || '')
    : openSlot.kind === 'entry' ? (entries.find((e) => e.id === openSlot.entryId)?.worksite?.client_name || '')
    : openSlot.kind === 'pending' ? (pendingEntries.find((e) => e.localId === openSlot.localId)?._worksite_name || '')
    : '';
  const slotTitle = !openSlot ? ''
    : openSlot.kind === 'new' ? 'Nouvelle intervention'
    : titleName ? `Chantier ${titleName}` : 'Intervention';

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Offline / syncing */}
      {!isOnline && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-center gap-2 text-sm text-orange-700">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>Mode hors-ligne — tes saisies seront synchronisées au retour du réseau</span>
        </div>
      )}
      {isOnline && syncing && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2 text-sm text-blue-700">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span>Synchronisation…</span>
        </div>
      )}

      {/* Total + récap (interventions / repas / pause) */}
      <Card className="bg-primary text-primary-foreground">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <Clock className="h-6 w-6 shrink-0" />
            <div>
              <p className="text-sm opacity-90">Total travaillé</p>
              <p className="text-2xl font-bold">{formatMinutesToHours(totalMinutes)}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span>🧱 {nbInterventions} intervention{nbInterventions > 1 ? 's' : ''}</span>
            <span>🍽️ {dayMeal ? 'Panier repas' : 'Sans panier'}</span>
            <span>☕ {pauses.length > 0 ? `Pause ${pauses.map((p) => `${p.start}–${p.end} (${formatMinutesToHours(p.minutes)})`).join(' · ')}` : 'Aucune pause'}</span>
          </div>
        </CardContent>
      </Card>

      {/* Duplicate this day — clear, labelled, discreet */}
      {!isEmpty && !openSlot && !monthLocked && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setRepeatOpen(true)}>
            <Copy className="h-4 w-4 mr-2" /> Dupliquer cette journée
          </Button>
        </div>
      )}

      {/* Panier repas — once per day */}
      <Card>
        <CardContent className="py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Utensils className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Panier repas <span className="text-muted-foreground font-normal">(pour la journée)</span></span>
          </div>
          <Switch checked={dayMeal} onCheckedChange={(v) => { if (monthLocked) { setLateOpen(true); return; } if (frozen) { askCorrect(null); return; } toggleDayMeal(v); }} />
        </CardContent>
      </Card>

      {/* Interventions — unified, sorted by start time so a card stays put when filled */}
      <div className="space-y-2">
        {items.map((item) => {
          if (item.kind === 'planned') {
            const p = item.data;
            return (
              <Card key={item.key} className="border-primary/30 bg-primary/5 cursor-pointer transition-colors hover:bg-primary/10" onClick={() => openPlanned(p)}>
                <CardContent className="py-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">À déclarer</p>
                    <p className="font-semibold truncate flex items-center gap-1"><MapPin className="h-4 w-4 text-muted-foreground shrink-0" />{p.worksite?.client_name}{p.worksite?.city ? ` — ${p.worksite.city}` : ''}</p>
                    {p.estimated_start && p.estimated_end && <p className="text-xs text-muted-foreground mt-0.5">Prévu {p.estimated_start.substring(0, 5)}–{p.estimated_end.substring(0, 5)}</p>}
                  </div>
                  <span className="flex items-center gap-1 text-primary font-medium text-sm shrink-0"><Plus className="h-4 w-4" /> Mes heures</span>
                </CardContent>
              </Card>
            );
          }
          if (item.kind === 'entry') {
            const entry = item.data;
            const tappable = isEditable(entry);
            const onTap = !tappable ? undefined : monthLocked ? () => setLateOpen(true) : frozen ? () => askCorrect(entry.id) : () => openEntry(entry);
            return (
              <Card key={item.key} className={tappable ? 'cursor-pointer transition-colors hover:bg-muted/40' : ''} onClick={onTap}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{entry.worksite?.client_name || OTHER_NAME}</p>
                      {entry.worksite?.city && <p className="text-xs text-muted-foreground truncate">{entry.worksite.city}</p>}
                      <p className="text-sm flex items-center gap-1 mt-0.5"><Clock className="h-3.5 w-3.5 text-muted-foreground" />{entry.start_time?.substring(0, 5)}–{entry.end_time?.substring(0, 5)} · <span className="font-semibold text-primary">{formatMinutesToHours(entry.total_minutes)}</span></p>
                      {entry.observation && <p className="text-sm text-muted-foreground mt-0.5">{entry.observation}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {entry.status === 'submitted' && <Badge variant="default" className="text-xs">Envoyé</Badge>}
                      {entry.status === 'draft' && !entry.locked && (
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteEntry(entry.id); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          }
          // pending (offline)
          const entry = item.data;
          return (
            <Card key={item.key} className="border-orange-300 bg-orange-50/30 cursor-pointer hover:bg-orange-50/60 transition-colors" onClick={() => openPending(entry)}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{entry._worksite_name}</p>
                    <p className="text-sm flex items-center gap-1 mt-0.5"><Clock className="h-3.5 w-3.5 text-muted-foreground" />{entry.start_time.substring(0, 5)}–{entry.end_time.substring(0, 5)} · <span className="font-semibold text-primary">{formatMinutesToHours(entry.total_minutes)}</span></p>
                </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant="outline" className="text-xs text-orange-600 border-orange-300"><WifiOff className="h-3 w-3 mr-1" />Hors-ligne</Badge>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={(e) => { e.stopPropagation(); handleDeletePending(entry.localId); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* + Ajouter une intervention */}
        <Button variant="outline" className="w-full" onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" /> Ajouter une intervention
        </Button>
      </div>

      {/* Empty hint + copy yesterday */}
      {isEmpty && plannedTodo.length === 0 && !openSlot && (
        <div className="text-center text-sm text-muted-foreground pt-2">
          <p>Aucune intervention aujourd'hui.</p>
          {isOnline && !monthLocked && (
            <Button variant="outline" size="sm" className="mt-2" onClick={handleCopyYesterday} disabled={copyingYesterday}>
              {copyingYesterday ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Copy className="h-4 w-4 mr-2" />} Copier la journée d'hier
            </Button>
          )}
        </div>
      )}

      {/* Submit / sync */}
      {!openSlot && (hasDrafts || pendingEntries.length > 0) && (
        <div className="flex gap-2">
          {hasDrafts && isOnline && (
            <Button className="flex-1" onClick={handleSubmitDay} disabled={submitting || pendingEntries.length > 0} title={pendingEntries.length > 0 ? 'Synchronisation en cours…' : undefined}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />} Envoyer ma journée
            </Button>
          )}
          {pendingEntries.length > 0 && isOnline && (
            <Button variant="outline" onClick={syncPendingEntries} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          )}
        </div>
      )}

      {allSubmitted && !openSlot && (
        <div className="text-center py-2">
          <p className="text-sm text-muted-foreground">Journée envoyée ✓</p>
          {monthLocked
            ? <p className="text-xs text-muted-foreground mt-0.5">Mois clôturé — vois avec la secrétaire pour modifier.</p>
            : frozen
              ? <p className="text-xs text-muted-foreground mt-0.5">Touche une intervention pour la corriger.</p>
              : <p className="text-xs text-orange-600 mt-0.5">Mode correction — tes changements sont signalés à la secrétaire.</p>}
        </div>
      )}

      {/* Full-screen intervention editor — closes only via ← / Annuler / Enregistrer */}
      {openSlot && (
        <div className="fixed inset-0 z-[60] bg-background">
          <div className="mx-auto flex h-full w-full max-w-md flex-col safe-top safe-bottom">
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 border-b px-2 py-2">
              <Button variant="ghost" size="sm" className="h-10 px-2" onClick={cancelSlot} aria-label="Retour">
                <ArrowLeft className="h-5 w-5 mr-1" /> Retour
              </Button>
              <p className="font-semibold text-center truncate">{slotTitle}</p>
              <span className="w-[88px]" aria-hidden />
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {openSlot.kind === 'new' && (
                <div className="space-y-1.5">
                  <Select value={fWorksiteId} onValueChange={setFWorksiteId}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Choisir un chantier" /></SelectTrigger>
                    <SelectContent className="z-[70]">
                      {sortedWorksites.map((ws) => (
                        <SelectItem key={ws.id} value={ws.id}>
                          {ws.client_name === OTHER_NAME
                            ? <span className="italic">{ws.client_name}</span>
                            : <>{ws.client_name}{ws.city ? ` - ${ws.city}` : ''}</>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 overflow-hidden rounded-lg border bg-background">
                <div className="p-2">
                  <Label className="mb-1 block text-center text-sm text-muted-foreground">Début</Label>
                  <TimeCylinder value={fStart} onChange={setFStart} />
                </div>
                <div className="border-l p-2">
                  <Label className="mb-1 block text-center text-sm text-muted-foreground">Fin</Label>
                  <TimeCylinder value={fEnd} onChange={setFEnd} />
                </div>
              </div>
              {fStart && fEnd && (
                <p className="text-center text-base">Durée : <strong>{formatMinutesToHours(calculateTotalMinutes(fStart, fEnd, 0))}</strong></p>
              )}

              <div className="space-y-1.5">
                <Label>Note (optionnel)</Label>
                <Input value={fObs} onChange={(e) => setFObs(e.target.value)} placeholder="Lieu, chef d'équipe, détail…" />
              </div>
            </div>

            <div className="flex gap-2 border-t p-4">
              <Button variant="outline" className="h-12 flex-1 text-base" onClick={cancelSlot} disabled={fSaving}>Annuler</Button>
              <Button className="h-12 flex-1 text-base" onClick={saveSlot} disabled={fSaving}>
                {fSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Enregistrer
              </Button>
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
          <p className="text-sm text-muted-foreground">Recopier les mêmes interventions (chantier + heures) sur :</p>
          <div className="space-y-2">
            <Button variant="outline" className="w-full h-12 justify-start capitalize" disabled={copying} onClick={() => copyToDates([tomorrowStr])}>
              Demain — {tomorrowLabel}
            </Button>
            <Button variant="outline" className="w-full h-12 justify-start" disabled={copying || restOfWeekStrs.length === 0} onClick={() => copyToDates(restOfWeekStrs)}>
              Reste de la semaine{restOfWeekStrs.length > 0 ? ` (${restOfWeekStrs.length} j)` : ''}
            </Button>
          </div>
          {copying && <p className="text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Copie…</p>}
        </DialogContent>
      </Dialog>

      {/* Month closed — too late to edit */}
      <Dialog open={lateOpen} onOpenChange={setLateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-orange-500" /> Mois clôturé</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Cette journée appartient à un mois déjà clôturé. Pour toute modification, rapproche-toi de la secrétaire.</p>
          <Button className="w-full mt-2" onClick={() => setLateOpen(false)}>Compris</Button>
        </DialogContent>
      </Dialog>

      {/* Confirm correcting an already-sent day */}
      <Dialog open={confirmCorrectOpen} onOpenChange={(o) => { setConfirmCorrectOpen(o); if (!o) setPendingEditId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-orange-500" /> Journée déjà envoyée</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Cette feuille a déjà été envoyée. Si tu la corriges, la secrétaire en sera informée.</p>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => { setConfirmCorrectOpen(false); setPendingEditId(null); }}>Annuler</Button>
            <Button className="flex-1" onClick={confirmCorrect}>Corriger</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Coherence confirmation */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-orange-500" /> Vérification</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {coherenceWarnings.map((w, i) => <p key={i} className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded p-2">{w}</p>)}
            <p className="text-sm text-muted-foreground pt-1">Envoyer quand même ta journée ?</p>
          </div>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmOpen(false)}>Corriger</Button>
            <Button className="flex-1" onClick={() => { setConfirmOpen(false); doSubmit(); }}>Confirmer l'envoi</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
