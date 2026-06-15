'use client';

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
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
  Plus, Trash2, Send, Loader2, MapPin, Clock, Utensils, WifiOff, RefreshCw, AlertTriangle, Copy,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
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

// Normalise for fuzzy worksite-name matching.
function normalizeStr(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

// ─── Inline slot editor (replaces the old modals) ──────────────────────────────

function SlotEditor({
  start, end, obs, onStart, onEnd, onObs, onSave, onCancel, saving, clientPicker,
}: {
  start: string; end: string; obs: string;
  onStart: (v: string) => void; onEnd: (v: string) => void; onObs: (v: string) => void;
  onSave: () => void; onCancel: () => void; saving: boolean; clientPicker?: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const total = start && end ? calculateTotalMinutes(start, end, 0) : 0;

  // Clicking in the empty space (outside) closes the editor — Radix popups excepted.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !rootRef.current || rootRef.current.contains(t)) return;
      if (t.closest('[data-radix-popper-content-wrapper]') || t.closest('[role="dialog"]')) return;
      onCancel();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [onCancel]);

  return (
    <div ref={rootRef} className="rounded-lg border bg-muted/20 p-3 space-y-3">
      {clientPicker}
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border bg-background">
        <div className="p-2">
          <Label className="mb-1 block text-center text-xs text-muted-foreground">Début</Label>
          <TimeCylinder value={start} onChange={onStart} />
        </div>
        <div className="border-l p-2">
          <Label className="mb-1 block text-center text-xs text-muted-foreground">Fin</Label>
          <TimeCylinder value={end} onChange={onEnd} />
        </div>
      </div>
      {start && end && (
        <p className="text-center text-sm">Durée : <strong className="text-foreground">{formatMinutesToHours(total)}</strong></p>
      )}
      <div className="space-y-1.5">
        <Label>Observation (optionnel)</Label>
        <Input value={obs} onChange={(e) => onObs(e.target.value)} placeholder="Note…" />
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={onSave} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Enregistrer
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving}>Annuler</Button>
      </div>
    </div>
  );
}

// ─── main ──────────────────────────────────────────────────────────────────────

type SlotTarget =
  | { kind: 'planned'; planningId: string }
  | { kind: 'entry'; entryId: string }
  | { kind: 'pending'; localId: string }
  | { kind: 'new' };

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

  // Day-level panier repas (one per day).
  const [dayMeal, setDayMeal] = useState(false);

  // Inline slot editor
  const [openSlot, setOpenSlot] = useState<SlotTarget | null>(null);
  const [fStart, setFStart] = useState('');
  const [fEnd, setFEnd] = useState('');
  const [fObs, setFObs] = useState('');
  const [fSaving, setFSaving] = useState(false);
  // 'new' client picker
  const [fMode, setFMode] = useState<'existing' | 'new'>('existing');
  const [fWorksiteId, setFWorksiteId] = useState('');
  const [fClientName, setFClientName] = useState('');
  const [fProductType, setFProductType] = useState('');
  const [fCity, setFCity] = useState('');

  // Coherence confirmation
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [coherenceWarnings, setCoherenceWarnings] = useState<string[]>([]);

  // Copy-yesterday
  const [copyingYesterday, setCopyingYesterday] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

  // ─── Fetch server data ─────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const [entriesRes, worksitesRes, planningRes] = await Promise.all([
        supabase.from('time_entries').select('*, worksite:worksites(*)').eq('user_id', user.id).eq('work_date', today).order('start_time'),
        supabase.from('worksites').select('*').eq('company_id', user.company_id).eq('is_active', true).order('client_name'),
        supabase.from('planning').select('*, worksite:worksites(*)').eq('user_id', user.id).eq('work_date', today),
      ]);
      if (entriesRes.error) throw entriesRes.error;
      if (worksitesRes.error) throw worksitesRes.error;
      if (planningRes.error) throw planningRes.error;

      setEntries(entriesRes.data || []);
      setWorksites(worksitesRes.data || []);
      setPlanning(planningRes.data || []);

      const pendForToday = getPendingEntries(user.id).filter((e) => e.work_date === today);
      setDayMeal((entriesRes.data || []).some((e: TimeEntryWithWorksite) => e.meal_allowance) || pendForToday.some((e) => e.meal_allowance));
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
    const pending = getPendingEntries(user.id).filter((e) => e.work_date === today);
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
      setPendingEntries(getPendingEntries(user.id).filter((e) => e.work_date === today));
      fetchData();
    }
  }, [user, today, fetchData]);

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
      const pending = getPendingEntries(user.id).filter((e) => e.work_date === today);
      setPendingEntries(pending);
      if (navigator.onLine && pending.length > 0) syncPendingEntries();
    }
  }, [user, today, syncPendingEntries]);

  // ─── Day meal: keep exactly one flagged row per day (no migration) ──────────

  const applyDayMeal = useCallback(async (value: boolean) => {
    if (!user) return;
    if (navigator.onLine) {
      const { data } = await supabase.from('time_entries').select('id, start_time, meal_allowance').eq('user_id', user.id).eq('work_date', today);
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
    const pend = getPendingEntries(user.id).filter((e) => e.work_date === today);
    if (pend.length > 0) {
      const sorted = [...pend].sort((a, b) => a.start_time.localeCompare(b.start_time));
      clearPendingEntriesForDate(user.id, today);
      sorted.forEach((e, i) => addPendingEntry(user.id, { ...e, meal_allowance: i === 0 ? value : false }));
      setPendingEntries(getPendingEntries(user.id).filter((e) => e.work_date === today));
    }
  }, [user, today]);

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
    setOpenSlot({ kind: 'new' });
    setFMode('existing'); setFWorksiteId(''); setFClientName(''); setFProductType(''); setFCity('');
    setFStart('08:00'); setFEnd('17:00'); setFObs('');
  };
  const cancelSlot = () => setOpenSlot(null);

  const pickSuggestion = (ws: Worksite) => { setFMode('existing'); setFWorksiteId(ws.id); };

  const saveSlot = async () => {
    if (!user || !openSlot) return;
    if (!fStart || !fEnd) { toast.error("Indique l'heure de début et de fin"); return; }
    setFSaving(true);
    try {
      const totalMins = calculateTotalMinutes(fStart, fEnd, 0);

      // ── Update an existing entry ──
      if (openSlot.kind === 'entry') {
        const { error } = await supabase.from('time_entries').update({
          start_time: fStart, end_time: fEnd, break_minutes: 0, observation: fObs.trim() || null,
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
        } else if (fMode === 'new') {
          if (!fClientName.trim()) { toast.error('Le nom du client est requis'); return; }
          if (!navigator.onLine) { toast.error('Impossible de créer un chantier hors-ligne. Choisis un chantier existant.'); return; }
          const { data: newWs, error: wsErr } = await supabase.from('worksites').insert({
            company_id: user.company_id, client_name: fClientName.trim(), product_type: fProductType.trim() || null, city: fCity.trim() || null, is_active: true,
          }).select().single();
          if (wsErr) throw wsErr;
          worksiteId = newWs.id; worksiteName = newWs.client_name; worksiteCity = newWs.city || null;
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
            planning_id: planningId, work_date: today, start_time: fStart, end_time: fEnd, break_minutes: 0,
            total_minutes: totalMins, meal_allowance: false, observation: fObs.trim() || null,
            _worksite_name: worksiteName, _worksite_city: worksiteCity, _saved_at: Date.now(),
          };
          addPendingEntry(user.id, pending);
        } else {
          const { error } = await supabase.from('time_entries').insert({
            company_id: user.company_id, user_id: user.id, worksite_id: worksiteId, planning_id: planningId,
            work_date: today, start_time: fStart, end_time: fEnd, break_minutes: 0,
            meal_allowance: false, observation: fObs.trim() || null, status: 'draft',
          });
          if (error) throw error;
        }
      }

      setOpenSlot(null);
      await applyDayMeal(dayMeal);
      if (navigator.onLine) fetchData();
      setPendingEntries(getPendingEntries(user.id).filter((e) => e.work_date === today));
      toast.success('Heures enregistrées');
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
        work_date: today, start_time: e.start_time, end_time: e.end_time, break_minutes: 0,
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

  // ─── Submit day ────────────────────────────────────────────────────────────

  const checkCoherenceWarnings = (): string[] => {
    const drafts = entries.filter((e) => e.status === 'draft' && !e.locked);
    if (drafts.length === 0) return [];
    const warnings: string[] = [];
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

  // Anti-duplicate suggestions for the "new" client form.
  const typedNorm = normalizeStr(fClientName);
  const similarWorksites =
    openSlot?.kind === 'new' && fMode === 'new' && typedNorm.length >= 2
      ? worksites.filter((w) => { const n = normalizeStr(w.client_name); return n.includes(typedNorm) || typedNorm.includes(n); }).slice(0, 4)
      : [];

  const editorProps = {
    start: fStart, end: fEnd, obs: fObs,
    onStart: setFStart, onEnd: setFEnd, onObs: setFObs,
    onSave: saveSlot, onCancel: cancelSlot, saving: fSaving,
  };

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

      {/* Total + pauses */}
      <Card className="bg-primary text-primary-foreground">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="h-6 w-6" />
              <div>
                <p className="text-sm opacity-90">Total travaillé</p>
                <p className="text-2xl font-bold">{formatMinutesToHours(totalMinutes)}</p>
              </div>
            </div>
            <p className="text-sm opacity-90">{nbInterventions} intervention{nbInterventions > 1 ? 's' : ''}</p>
          </div>
          {pauses.length > 0 && (
            <p className="mt-2 text-sm opacity-90">
              {pauses.map((p, i) => (
                <span key={i}>{i > 0 ? ' · ' : ''}Pause {p.start}–{p.end} ({formatMinutesToHours(p.minutes)})</span>
              ))}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Panier repas — once per day */}
      <Card>
        <CardContent className="py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Utensils className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Panier repas <span className="text-muted-foreground font-normal">(pour la journée)</span></span>
          </div>
          <Switch checked={dayMeal} onCheckedChange={toggleDayMeal} />
        </CardContent>
      </Card>

      {/* Interventions */}
      <div className="space-y-2">
        {/* Planned chantiers still to declare */}
        {plannedTodo.map((p) => (
          openSlot?.kind === 'planned' && openSlot.planningId === p.id ? (
            <div key={p.id} className="space-y-1">
              <p className="text-sm font-medium flex items-center gap-1"><MapPin className="h-4 w-4 text-muted-foreground" />{p.worksite?.client_name}{p.worksite?.city ? ` — ${p.worksite.city}` : ''}</p>
              <SlotEditor {...editorProps} />
            </div>
          ) : (
            <Card key={p.id} className="border-primary/30 bg-primary/5 cursor-pointer transition-colors hover:bg-primary/10" onClick={() => openPlanned(p)}>
              <CardContent className="py-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">À déclarer</p>
                  <p className="font-semibold truncate flex items-center gap-1"><MapPin className="h-4 w-4 text-muted-foreground shrink-0" />{p.worksite?.client_name}{p.worksite?.city ? ` — ${p.worksite.city}` : ''}</p>
                  {p.estimated_start && p.estimated_end && <p className="text-xs text-muted-foreground mt-0.5">Prévu {p.estimated_start.substring(0, 5)}–{p.estimated_end.substring(0, 5)}</p>}
                </div>
                <span className="flex items-center gap-1 text-primary font-medium text-sm shrink-0"><Plus className="h-4 w-4" /> Mes heures</span>
              </CardContent>
            </Card>
          )
        ))}

        {/* Declared (server) entries */}
        {entries.map((entry) => {
          const editable = isEditable(entry);
          if (openSlot?.kind === 'entry' && openSlot.entryId === entry.id) {
            return (
              <div key={entry.id} className="space-y-1">
                <p className="text-sm font-medium">{entry.worksite?.client_name || 'Chantier'}</p>
                <SlotEditor {...editorProps} />
              </div>
            );
          }
          return (
            <Card key={entry.id} className={editable ? 'cursor-pointer transition-colors hover:bg-muted/40' : ''} onClick={editable ? () => openEntry(entry) : undefined}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{entry.worksite?.client_name || 'Chantier inconnu'}</p>
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
        })}

        {/* Pending (offline) entries */}
        {pendingEntries.map((entry) => (
          openSlot?.kind === 'pending' && openSlot.localId === entry.localId ? (
            <div key={entry.localId} className="space-y-1">
              <p className="text-sm font-medium">{entry._worksite_name}</p>
              <SlotEditor {...editorProps} />
            </div>
          ) : (
            <Card key={entry.localId} className="border-orange-300 bg-orange-50/30 cursor-pointer hover:bg-orange-50/60 transition-colors" onClick={() => openPending(entry)}>
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
          )
        ))}

        {/* + Ajouter une intervention */}
        {openSlot?.kind === 'new' ? (
          <SlotEditor
            {...editorProps}
            clientPicker={(
              <div className="space-y-2">
                <Label>Chantier</Label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={fMode === 'existing' ? 'default' : 'outline'} className="flex-1" onClick={() => setFMode('existing')}>Existant</Button>
                  <Button type="button" size="sm" variant={fMode === 'new' ? 'default' : 'outline'} className="flex-1" onClick={() => setFMode('new')}>Nouveau</Button>
                </div>
                {fMode === 'existing' ? (
                  <Select value={fWorksiteId} onValueChange={setFWorksiteId}>
                    <SelectTrigger><SelectValue placeholder="Choisir un chantier" /></SelectTrigger>
                    <SelectContent>{worksites.map((ws) => <SelectItem key={ws.id} value={ws.id}>{ws.client_name}{ws.city ? ` - ${ws.city}` : ''}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <div className="space-y-2">
                    <Input placeholder="Nom du client *" value={fClientName} onChange={(e) => setFClientName(e.target.value)} />
                    {similarWorksites.length > 0 && (
                      <div className="rounded-md border border-orange-200 bg-orange-50 p-2 space-y-1">
                        <p className="text-xs text-orange-700 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Chantiers similaires — évite les doublons :</p>
                        {similarWorksites.map((ws) => (
                          <button key={ws.id} type="button" onClick={() => pickSuggestion(ws)} className="w-full text-left text-sm bg-white border rounded px-2 py-1.5 hover:bg-orange-100 flex items-center justify-between gap-2">
                            <span className="truncate">{ws.client_name}{ws.city ? ` - ${ws.city}` : ''}</span>
                            <span className="text-xs text-orange-600 shrink-0">Utiliser</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <Input placeholder="Type de produit (stores, volets...)" value={fProductType} onChange={(e) => setFProductType(e.target.value)} />
                    <Input placeholder="Ville" value={fCity} onChange={(e) => setFCity(e.target.value)} />
                  </div>
                )}
              </div>
            )}
          />
        ) : (
          <Button variant="outline" className="w-full" onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" /> Ajouter une intervention
          </Button>
        )}
      </div>

      {/* Empty hint + copy yesterday */}
      {isEmpty && plannedTodo.length === 0 && !openSlot && (
        <div className="text-center text-sm text-muted-foreground pt-2">
          <p>Aucune intervention aujourd'hui.</p>
          {isOnline && (
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
        <p className="text-center text-sm text-muted-foreground py-2">Journée envoyée ✓</p>
      )}

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
