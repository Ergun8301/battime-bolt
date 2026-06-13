'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@/lib/types';
import { ExportEntry, exportEntriesToExcel, exportEntriesToPDF } from '@/lib/export-utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CalendarRange, Clock, Utensils, MapPin, FileSpreadsheet, FileText, Loader2,
} from 'lucide-react';
import {
  format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameDay,
} from 'date-fns';
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
  onOpenChange: (open: boolean) => void;
}

// Per-employee fiche. Opens on today; the secretary clicks the calendar (range,
// Booking style) or the Cette semaine / Ce mois shortcuts to consult any period,
// then exports exactly what's shown. Consultation only — no edits, no locking.
export default function WorkerDetailDialog({ worker, onOpenChange }: WorkerDetailDialogProps) {
  const [range, setRange] = useState<DateRange | undefined>(() => {
    const t = new Date();
    return { from: t, to: t };
  });
  const [entries, setEntries] = useState<ExportEntry[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Reset to today's view whenever a different worker is opened.
  useEffect(() => {
    if (worker) {
      const t = new Date();
      setRange({ from: t, to: t });
    }
  }, [worker?.id]);

  // Company name for the export header.
  useEffect(() => {
    if (!worker?.company_id) return;
    supabase.from('companies').select('name').eq('id', worker.company_id).maybeSingle()
      .then(({ data }) => setCompanyName(data?.name || ''));
  }, [worker?.company_id]);

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

  const totalMinutes = entries.reduce((s, e) => s + e.total_minutes, 0);

  const periodLabel = (() => {
    if (!range?.from) return '';
    const to = range.to ?? range.from;
    if (isSameDay(range.from, to)) return format(range.from, 'dd/MM/yyyy');
    return `${format(range.from, 'dd/MM/yyyy')} au ${format(to, 'dd/MM/yyyy')}`;
  })();

  const triggerLabel = (() => {
    if (!range?.from) return 'Choisir une période';
    const to = range.to ?? range.from;
    if (isSameDay(range.from, to)) {
      return isSameDay(range.from, new Date())
        ? "Aujourd'hui"
        : format(range.from, 'EEE d MMM yyyy', { locale: fr });
    }
    return `${format(range.from, 'd MMM')} – ${format(to, 'd MMM yyyy', { locale: fr })}`;
  })();

  const setWeek = () => setRange({
    from: startOfWeek(new Date(), { weekStartsOn: 1 }),
    to: endOfWeek(new Date(), { weekStartsOn: 1 }),
  });
  const setMonth = () => setRange({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  const doExport = (kind: 'excel' | 'pdf') => {
    if (!worker) return;
    if (entries.length === 0) { toast.error('Aucune saisie sur cette période'); return; }
    setExporting(true);
    try {
      const name = `${worker.first_name} ${worker.last_name}`;
      const fromStr = range?.from ? format(range.from, 'yyyy-MM-dd') : '';
      const toStr = range?.to ? format(range.to, 'yyyy-MM-dd') : fromStr;
      const fileName = `battime-${worker.last_name}-${worker.first_name}-${fromStr}_${toStr}`
        .toLowerCase().replace(/\s+/g, '-');
      const opts = {
        fileName,
        title: 'Battime — Relevé salarié',
        periodLabel,
        companyName,
        singleWorkerName: name,
      };
      if (kind === 'excel') exportEntriesToExcel(entries, opts);
      else exportEntriesToPDF(entries, opts);
      toast.success('Export téléchargé');
    } catch (err) {
      console.error('Error exporting worker:', err);
      toast.error("Erreur lors de l'export");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={!!worker} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{worker ? `${worker.first_name} ${worker.last_name}` : ''}</DialogTitle>
        </DialogHeader>

        {/* Period controls: calendar range (Booking style) + shortcuts + export */}
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start gap-2">
                <CalendarRange className="h-4 w-4" />
                {triggerLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={range}
                onSelect={setRange}
                numberOfMonths={1}
                locale={fr}
                defaultMonth={range?.from}
              />
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="sm" onClick={setWeek}>Cette semaine</Button>
          <Button variant="ghost" size="sm" onClick={setMonth}>Ce mois</Button>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => doExport('excel')} disabled={exporting || entries.length === 0}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              <span className="hidden sm:inline ml-1">Excel</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => doExport('pdf')} disabled={exporting || entries.length === 0}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              <span className="hidden sm:inline ml-1">PDF</span>
            </Button>
          </div>
        </div>

        {/* Period total */}
        <div className="flex items-center justify-between rounded-lg bg-primary/5 border border-primary/20 px-4 py-3">
          <span className="text-sm text-muted-foreground">Total de la période</span>
          <span className="text-xl font-bold">{formatMinutesToHours(totalMinutes)}</span>
        </div>

        {/* Entries, newest first */}
        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : entries.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            <Clock className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>Aucune intervention sur cette période</p>
          </div>
        ) : (
          <div className="divide-y rounded-lg border">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 p-3">
                <div className="w-24 shrink-0 text-xs text-muted-foreground capitalize">
                  {format(parseISO(entry.work_date), 'EEE d MMM', { locale: fr })}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{entry.worksite?.client_name || 'Chantier inconnu'}</p>
                  {entry.worksite?.city && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />{entry.worksite.city}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm">{entry.start_time?.substring(0, 5)}–{entry.end_time?.substring(0, 5)}</p>
                  <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                    {entry.break_minutes > 0 && <span>pause {entry.break_minutes}min</span>}
                    {entry.meal_allowance && <Utensils className="h-3 w-3" aria-label="Panier repas" />}
                  </div>
                </div>
                <div className="w-16 shrink-0 text-right font-semibold">{formatMinutesToHours(entry.total_minutes)}</div>
              </div>
            ))}
          </div>
        )}

        {entries.length > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            {entries.length} intervention{entries.length > 1 ? 's' : ''} · période {periodLabel}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
