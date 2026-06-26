'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { User, Worksite } from '@/lib/types';
import { ExportEntry, exportEntriesToExcel, exportEntriesToPDF } from '@/lib/export-utils';
import { computeMissingDays } from '@/lib/work-status';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CalendarRange, Clock, Utensils, MapPin, FileSpreadsheet, FileText, Loader2,
  Settings2, Archive, ArchiveRestore, Trash2, Link2, User as UserIcon, AlertTriangle,
} from 'lucide-react';
import { format, parseISO, isSameDay, subDays, startOfWeek, addDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import type { DateRange } from 'react-day-picker';

function formatMinutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

interface WorkerDetailDialogProps {
  worker: User | null;
  mode?: 'hours' | 'manage';
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

const MISSING_WINDOW_DAYS = 30;
const OTHER_NAME = 'Autre';

// Per-employee fiche: opens on today, Booking-style range calendar, interventions
// + total, planning-based missing-days detail, per-period export (no lock), and
// worker management (modify / archive / reactivate / delete-if-empty).
export default function WorkerDetailDialog({ worker, mode = 'hours', onOpenChange, onChanged }: WorkerDetailDialogProps) {
  const [range, setRange] = useState<DateRange | undefined>(() => {
    const t = new Date();
    return { from: t, to: t };
  });
  const [entries, setEntries] = useState<ExportEntry[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [worksites, setWorksites] = useState<Worksite[]>([]);
  const [reassigningId, setReassigningId] = useState<string | null>(null);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [newClientName, setNewClientName] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [missing, setMissing] = useState<string[]>([]);

  // management
  const [mFirst, setMFirst] = useState('');
  const [mLast, setMLast] = useState('');
  const [mPhone, setMPhone] = useState('');
  const [mNir, setMNir] = useState('');
  const [mHireDate, setMHireDate] = useState('');
  const [mContract, setMContract] = useState('');
  const [mSaving, setMSaving] = useState(false);
  const [mBusy, setMBusy] = useState(false);

  // Reset per worker.
  useEffect(() => {
    if (!worker) return;
    const t = new Date();
    setRange({ from: t, to: t });
    setMFirst(worker.first_name || '');
    setMLast(worker.last_name || '');
    setMPhone(worker.phone || '');
    setMNir(worker.social_security_number || '');
    setMHireDate(worker.hire_date || '');
    setMContract(worker.contract_type || '');
  }, [worker?.id]);

  useEffect(() => {
    if (!worker?.company_id) return;
    supabase.from('companies').select('name').eq('id', worker.company_id).maybeSingle()
      .then(({ data }) => setCompanyName(data?.name || ''));
    supabase.from('worksites').select('*').eq('company_id', worker.company_id).eq('is_active', true).order('client_name')
      .then(({ data }) => setWorksites(data || []));
  }, [worker?.company_id]);

  // Reassign an "Autre" entry to a real client.
  const reassignEntry = async (entryId: string, newWorksiteId: string) => {
    if (!worker) return;
    try {
      const { error } = await supabase.from('time_entries').update({ worksite_id: newWorksiteId })
        .eq('id', entryId).eq('user_id', worker.id);
      if (error) throw error;
      toast.success('Client attribué');
      setReassigningId(null);
      fetchEntries();
    } catch (err) {
      console.error('Error reassigning worksite:', err);
      toast.error("Impossible d'attribuer le client");
    }
  };

  // Create a client on the fly (the worker couldn't find it in the list → the
  // secretary creates it here) and attribute it to the intervention.
  const createAndAttribute = async (entryId: string) => {
    if (!worker?.company_id || !newClientName.trim()) return;
    try {
      const { data: ws, error } = await supabase.from('worksites')
        .insert({ company_id: worker.company_id, client_name: newClientName.trim(), city: '', is_active: true })
        .select().single();
      if (error) throw error;
      setWorksites((prev) => [...prev, ws]);
      setNewClientName('');
      setCreatingFor(null);
      await reassignEntry(entryId, ws.id);
    } catch (err) {
      console.error('Error creating client:', err);
      toast.error('Impossible de créer le client');
    }
  };

  // Planning-based missing days (recent window).
  const fetchMissing = useCallback(async () => {
    if (!worker) return;
    const windowStart = format(subDays(new Date(), MISSING_WINDOW_DAYS), 'yyyy-MM-dd');
    const [planRes, entRes] = await Promise.all([
      supabase.from('planning').select('work_date, absence_type').eq('user_id', worker.id).gte('work_date', windowStart),
      supabase.from('time_entries').select('work_date, status').eq('user_id', worker.id).in('status', ['submitted', 'validated']).gte('work_date', windowStart),
    ]);
    const rows = (planRes.data || []) as { work_date: string; absence_type: string | null }[];
    const absenceDays = new Set<string>(rows.filter((p) => p.absence_type).map((p) => p.work_date));
    const planned = rows.filter((p) => !p.absence_type && !absenceDays.has(p.work_date)).map((p) => p.work_date);
    const declared = new Set<string>((entRes.data || []).map((e: { work_date: string }) => e.work_date));
    setMissing(computeMissingDays(planned, declared));
  }, [worker?.id]);

  useEffect(() => { fetchMissing(); }, [fetchMissing]);

  const fetchEntries = useCallback(async () => {
    if (!worker || !range?.from) return;
    const from = range.from;
    const to = range.to ?? range.from;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('time_entries')
        .select('*, worksite:worksites(*), user:users!user_id(*)')
        .eq('user_id', worker.id)
        .eq('company_id', worker.company_id)
        .gte('work_date', format(from, 'yyyy-MM-dd'))
        .lte('work_date', format(to, 'yyyy-MM-dd'))
        .order('work_date', { ascending: false })
        .order('start_time', { ascending: false });
      if (error) throw error;
      setEntries(data || []);
    } catch (err) {
      console.error('Error fetching worker entries:', err);
      toast.error('Impossible de charger les saisies');
    } finally {
      setLoading(false);
    }
  }, [worker, range?.from, range?.to]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const liveEntries = entries.filter((e) => e.status !== 'cancelled');
  const totalMinutes = liveEntries.reduce((s, e) => s + e.total_minutes, 0);

  const periodLabel = (() => {
    if (!range?.from) return '';
    const to = range.to ?? range.from;
    return isSameDay(range.from, to) ? format(range.from, 'dd/MM/yyyy') : `${format(range.from, 'dd/MM/yyyy')} au ${format(to, 'dd/MM/yyyy')}`;
  })();

  const triggerLabel = (() => {
    if (!range?.from) return 'Choisir une période';
    const to = range.to ?? range.from;
    if (isSameDay(range.from, to)) {
      return isSameDay(range.from, new Date()) ? "Aujourd'hui" : format(range.from, 'EEE d MMM yyyy', { locale: fr });
    }
    return `${format(range.from, 'd MMM')} – ${format(to, 'd MMM yyyy', { locale: fr })}`;
  })();

  const doExport = (kind: 'excel' | 'pdf') => {
    if (!worker) return;
    if (liveEntries.length === 0) { toast.error('Aucune saisie sur cette période'); return; }
    setExporting(true);
    try {
      const name = `${worker.first_name} ${worker.last_name}`;
      const fromStr = range?.from ? format(range.from, 'yyyy-MM-dd') : '';
      const toStr = range?.to ? format(range.to, 'yyyy-MM-dd') : fromStr;
      const fileName = `battime-${worker.last_name}-${worker.first_name}-${fromStr}_${toStr}`.toLowerCase().replace(/\s+/g, '-');
      const opts = { fileName, title: 'Battime — Relevé salarié', periodLabel, companyName, singleWorkerName: name };
      if (kind === 'excel') exportEntriesToExcel(liveEntries, opts);
      else exportEntriesToPDF(liveEntries, opts);
      toast.success('Export téléchargé');
    } catch (err) {
      console.error('Error exporting worker:', err);
      toast.error("Erreur lors de l'export");
    } finally {
      setExporting(false);
    }
  };

  // ─── management ────────────────────────────────────────────────────────────

  const saveWorker = async () => {
    if (!worker) return;
    if (!mFirst.trim() || !mLast.trim()) { toast.error('Prénom et nom requis'); return; }
    setMSaving(true);
    try {
      const { error } = await supabase.from('users').update({
        first_name: mFirst.trim(), last_name: mLast.trim(), phone: mPhone.trim() || null,
        social_security_number: mNir.trim() || null,
        hire_date: mHireDate || null,
        contract_type: mContract.trim() || null,
      }).eq('id', worker.id).eq('company_id', worker.company_id);
      if (error) throw error;
      toast.success('Salarié modifié');
      onChanged?.();
    } catch (err) {
      console.error('Error updating worker:', err);
      toast.error('Impossible de modifier le salarié');
    } finally {
      setMSaving(false);
    }
  };

  const toggleArchive = async () => {
    if (!worker) return;
    setMBusy(true);
    try {
      const { error } = await supabase.from('users').update({ is_active: !worker.is_active })
        .eq('id', worker.id).eq('company_id', worker.company_id);
      if (error) throw error;
      toast.success(worker.is_active ? 'Salarié archivé' : 'Salarié réactivé');
      onChanged?.();
      onOpenChange(false);
    } catch (err) {
      console.error('Error archiving worker:', err);
      toast.error('Impossible de mettre à jour le salarié');
    } finally {
      setMBusy(false);
    }
  };

  // Delete only if the worker is an empty shell (no entries, no planning).
  const deleteWorker = async () => {
    if (!worker) return;
    setMBusy(true);
    try {
      const [{ count: entryCount, error: e1 }, { count: planCount, error: e2 }] = await Promise.all([
        supabase.from('time_entries').select('*', { count: 'exact', head: true }).eq('user_id', worker.id),
        supabase.from('planning').select('*', { count: 'exact', head: true }).eq('user_id', worker.id),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if ((entryCount || 0) > 0 || (planCount || 0) > 0) {
        toast.error('Ce salarié a des données. Archivez-le plutôt.');
        return;
      }
      const { error } = await supabase.from('users').delete().eq('id', worker.id).eq('company_id', worker.company_id);
      if (error) throw error;
      toast.success('Salarié supprimé');
      onChanged?.();
      onOpenChange(false);
    } catch (err) {
      console.error('Error deleting worker:', err);
      toast.error('Impossible de supprimer le salarié');
    } finally {
      setMBusy(false);
    }
  };

  return (
    <Dialog open={!!worker} onOpenChange={onOpenChange}>
      <DialogContent className="bt-skin max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {worker ? `${worker.first_name} ${worker.last_name}` : ''}
            {worker && !worker.is_active && <Badge variant="secondary" className="text-xs">Archivé</Badge>}
          </DialogTitle>
        </DialogHeader>

        {/* Management — only in "manage" mode (settings) */}
        {mode === 'manage' && worker && (
          <div className="rounded-lg border p-3 space-y-3">
            <p className="flex items-center gap-2 text-sm font-medium"><Settings2 className="h-4 w-4" /> Gérer le salarié</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="space-y-1"><Label className="text-xs">Prénom</Label><Input value={mFirst} onChange={(e) => setMFirst(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Nom</Label><Input value={mLast} onChange={(e) => setMLast(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Téléphone</Label><Input value={mPhone} onChange={(e) => setMPhone(e.target.value)} /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Email (identifiant de connexion)</Label><Input value={worker.email || ''} readOnly className="bg-muted/50" /></div>
            {/* Optional payroll info — clearly facultatif */}
            <div className="rounded-md border bg-muted/30 p-2 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Infos paie — <span className="italic">facultatif</span> (remplis seulement ce que tu as)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="space-y-1"><Label className="text-xs">N° de sécurité sociale</Label><Input value={mNir} onChange={(e) => setMNir(e.target.value)} placeholder="1 23 45…" /></div>
                <div className="space-y-1"><Label className="text-xs">Date d'embauche</Label><Input type="date" value={mHireDate} onChange={(e) => setMHireDate(e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Type de contrat</Label><Input value={mContract} onChange={(e) => setMContract(e.target.value)} placeholder="CDI, CDD, Intérim…" /></div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={saveWorker} disabled={mSaving}>
                {mSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Enregistrer
              </Button>
              <Button size="sm" variant="outline" onClick={toggleArchive} disabled={mBusy}>
                {worker.is_active ? <Archive className="h-4 w-4 mr-1" /> : <ArchiveRestore className="h-4 w-4 mr-1" />}
                {worker.is_active ? 'Archiver' : 'Réactiver'}
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={deleteWorker} disabled={mBusy} title="Supprimer (seulement si aucune donnée)">
                <Trash2 className="h-4 w-4 mr-1" /> Supprimer
              </Button>
            </div>
          </div>
        )}

        {/* Missing days — discreet inline line */}
        {missing.length > 0 && (
          <p className="flex items-start gap-2 text-sm">
            <span className="mt-1.5 h-2 w-2 rounded-full bg-red-500 shrink-0" />
            <span>
              <span className="font-medium">{missing.length} jour{missing.length > 1 ? 's' : ''} en attente</span>
              <span className="text-muted-foreground"> · {missing.map((d) => format(parseISO(d), 'EEE d MMM', { locale: fr })).join(', ')}</span>
            </span>
          </p>
        )}

        {/* Timesheet — only in "hours" mode (consult + export) */}
        {mode === 'hours' && (<>
        {/* Period controls — same options as the team export */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { const t = new Date(); setRange({ from: t, to: t }); }}>Aujourd'hui</Button>
            <Button variant="outline" size="sm" onClick={() => { const m = startOfWeek(new Date(), { weekStartsOn: 1 }); setRange({ from: m, to: addDays(m, 5) }); }}>Cette semaine</Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm"><CalendarRange className="h-4 w-4 mr-1" /> Créneau</Button>
              </PopoverTrigger>
              <PopoverContent className="bt-skin w-auto p-0" align="start">
                <Calendar mode="range" selected={range} onSelect={setRange} numberOfMonths={1} locale={fr} defaultMonth={range?.from} />
              </PopoverContent>
            </Popover>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => doExport('excel')} disabled={exporting || liveEntries.length === 0}>
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}<span className="hidden sm:inline ml-1">Excel</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => doExport('pdf')} disabled={exporting || liveEntries.length === 0}>
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}<span className="hidden sm:inline ml-1">PDF</span>
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Période : <span className="font-medium text-foreground capitalize">{triggerLabel}</span></p>
        </div>

        {/* Total */}
        <div className="flex items-center justify-between rounded-lg bg-primary/5 border border-primary/20 px-4 py-3">
          <span className="text-sm text-muted-foreground">Total de la période</span>
          <span className="text-xl font-bold">{formatMinutesToHours(totalMinutes)}</span>
        </div>

        {/* Entries */}
        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : entries.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            <Clock className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>Aucune intervention sur cette période</p>
          </div>
        ) : (
          <div className="divide-y rounded-lg border">
            {entries.map((entry) => {
              const isUnknown = entry.worksite?.client_name === OTHER_NAME;
              const isCancelled = entry.status === 'cancelled';
              const isWorkerAdded = !isCancelled && !entry.planning_id;
              const realWorksites = worksites.filter((w) => w.client_name !== OTHER_NAME);
              return (
                <div key={entry.id} className={`p-4 ${isCancelled ? 'opacity-60' : isUnknown ? 'bg-amber-50/60' : ''}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-xs text-muted-foreground capitalize">{format(parseISO(entry.work_date), 'EEEE d MMM', { locale: fr })}</p>
                    <p className="shrink-0 text-lg font-bold">{formatMinutesToHours(entry.total_minutes)}</p>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className={`font-semibold ${isCancelled ? 'line-through text-muted-foreground' : isUnknown ? 'text-amber-700' : ''}`}>
                      {entry.worksite?.client_name || OTHER_NAME}
                    </p>
                    {isCancelled && <Badge variant="outline" className="text-[10px] py-0">Retirée</Badge>}
                    {isWorkerAdded && (
                      <Badge variant="outline" className="text-[10px] py-0 gap-1 text-muted-foreground">
                        <UserIcon className="h-2.5 w-2.5" /> ajouté par le salarié
                      </Badge>
                    )}
                    {!isCancelled && entry.modified_at && (
                      <Badge variant="outline" className="text-[10px] py-0 text-amber-700 border-amber-300">modifié après envoi</Badge>
                    )}
                    {!isCancelled && entry.reception === 'avec' && (
                      <Badge variant="outline" className="text-[10px] py-0 gap-1 text-[#C0461F] border-[#E8B79E] bg-[#FBE3D8]">
                        <AlertTriangle className="h-2.5 w-2.5" /> Avec réserve
                      </Badge>
                    )}
                    {!isCancelled && entry.reception === 'sans' && (
                      <Badge variant="outline" className="text-[10px] py-0 text-[#1F7A4D] border-[#B7DCC4] bg-[#E4F2E9]">Sans réserve</Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{entry.start_time?.substring(0, 5)}–{entry.end_time?.substring(0, 5)}</span>
                    {entry.worksite?.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{entry.worksite.city}</span>}
                    {entry.meal_allowance && <span className="flex items-center gap-1"><Utensils className="h-3.5 w-3.5" />panier</span>}
                  </div>
                  {entry.observation && <p className="mt-1 text-sm text-muted-foreground">« {entry.observation} »</p>}

                  {!isCancelled && isUnknown && (
                    reassigningId === entry.id ? (
                      <div className="mt-3 space-y-2 rounded-md border bg-background p-2">
                        <p className="text-xs font-medium">Attribuer un client à cette intervention</p>
                        <Select onValueChange={(v) => { if (v === '__new__') setCreatingFor(entry.id); else reassignEntry(entry.id, v); }}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Choisir un client existant…" /></SelectTrigger>
                          <SelectContent className="bt-skin">
                            {realWorksites.map((ws) => (
                              <SelectItem key={ws.id} value={ws.id}>{ws.client_name}{ws.city ? ` - ${ws.city}` : ''}</SelectItem>
                            ))}
                            <SelectItem value="__new__">+ Créer un nouveau client</SelectItem>
                          </SelectContent>
                        </Select>
                        {creatingFor === entry.id && (
                          <div className="flex items-center gap-2">
                            <Input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} placeholder="Nom du nouveau client" className="h-9" />
                            <Button size="sm" onClick={() => createAndAttribute(entry.id)} disabled={!newClientName.trim()}>Créer</Button>
                          </div>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => { setReassigningId(null); setCreatingFor(null); setNewClientName(''); }}>Annuler</Button>
                      </div>
                    ) : (
                      <Button variant="outline" size="sm" className="mt-2 h-8 text-xs" onClick={() => setReassigningId(entry.id)}>
                        <Link2 className="h-3 w-3 mr-1" /> Attribuer un client
                      </Button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        )}

        {entries.length > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            {liveEntries.length} intervention{liveEntries.length > 1 ? 's' : ''} · période {periodLabel}
          </p>
        )}
        </>)}
      </DialogContent>
    </Dialog>
  );
}
