'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { TimeEntry, Worksite, Planning } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, MapPin, Clock, Send } from 'lucide-react';
import { format, startOfMonth, endOfMonth, addMonths, subMonths, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

interface EntryW extends TimeEntry { worksite: Worksite | null }
interface PlanW extends Planning { worksite: Worksite | null }

function fmt(m: number) { return `${Math.floor(m / 60)}h${(m % 60).toString().padStart(2, '0')}`; }
const ABS: Record<string, string> = { conge: 'Congé', maladie: 'Maladie', intemperie: 'Intempérie', repos: 'Repos' };

// Monthly view: navigate months (◀▶), month total, and a tappable list of the
// days that have planning/entries — tap a day to declare/edit it.
export default function PoseurMonth({ onSelectDay }: { onSelectDay?: (date: string) => void } = {}) {
  const { user } = useAuth();
  const [monthStart, setMonthStart] = useState(startOfMonth(new Date()));
  const [planning, setPlanning] = useState<PlanW[]>([]);
  const [entries, setEntries] = useState<EntryW[]>([]);
  const [loading, setLoading] = useState(true);

  const monthEnd = endOfMonth(monthStart);
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const from = format(monthStart, 'yyyy-MM-dd');
      const to = format(monthEnd, 'yyyy-MM-dd');
      const [planRes, entRes] = await Promise.all([
        supabase.from('planning').select('*, worksite:worksites(*)').eq('user_id', user.id).gte('work_date', from).lte('work_date', to),
        supabase.from('time_entries').select('*, worksite:worksites(*)').eq('user_id', user.id).gte('work_date', from).lte('work_date', to).order('start_time'),
      ]);
      if (!planRes.error) setPlanning(planRes.data || []);
      if (!entRes.error) setEntries(entRes.data || []);
    } catch (err) {
      console.error('Error fetching month:', err);
    } finally {
      setLoading(false);
    }
  }, [user, monthStart, monthEnd]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalSent = entries.filter((e) => e.status !== 'draft').reduce((s, e) => s + e.total_minutes, 0);
  const dayKeys = Array.from(new Set([...planning.map((p) => p.work_date), ...entries.map((e) => e.work_date)])).sort();

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-full" />{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={() => setMonthStart(subMonths(monthStart, 1))}><ChevronLeft className="h-4 w-4" /></Button>
        <div className="text-center">
          <p className="font-semibold text-sm capitalize">{format(monthStart, 'MMMM yyyy', { locale: fr })}</p>
          {totalSent > 0 && <p className="text-xs text-muted-foreground mt-0.5">{fmt(totalSent)} envoyées</p>}
        </div>
        <Button variant="outline" size="icon" onClick={() => setMonthStart(addMonths(monthStart, 1))}><ChevronRight className="h-4 w-4" /></Button>
      </div>

      {dayKeys.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">Aucune affectation ce mois-ci.</p>
      ) : (
        <div className="space-y-2">
          {dayKeys.map((d) => {
            const dPlan = planning.filter((p) => p.work_date === d);
            const dEnt = entries.filter((e) => e.work_date === d);
            const dayTotal = dEnt.reduce((s, e) => s + e.total_minutes, 0);
            const declared = dEnt.some((e) => e.status !== 'draft');
            const isToday = d === todayStr;
            return (
              <button
                key={d}
                onClick={() => onSelectDay?.(d)}
                className={`w-full text-left rounded-lg border p-3 transition-colors hover:border-primary/60 ${isToday ? 'border-primary bg-primary/5' : 'bg-card'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold capitalize text-sm">{format(parseISO(d), 'EEEE d MMMM', { locale: fr })}</p>
                  {dayTotal > 0
                    ? <span className="text-sm font-semibold text-primary flex items-center gap-1">{declared && <Send className="h-3 w-3 opacity-70" />}{fmt(dayTotal)}</span>
                    : <span className="text-xs text-orange-600">À déclarer</span>}
                </div>
                <div className="mt-1 space-y-0.5">
                  {dPlan.map((p) => (
                    <p key={p.id} className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                      {p.absence_type ? (ABS[p.absence_type] || p.absence_type) : <><MapPin className="h-3 w-3 shrink-0" />{p.worksite?.client_name || 'Chantier'}</>}
                    </p>
                  ))}
                  {dEnt.map((e) => (
                    <p key={e.id} className="text-xs text-muted-foreground flex items-center gap-1 truncate"><Clock className="h-3 w-3 shrink-0" />{e.worksite?.client_name || 'Chantier'} · {e.start_time?.substring(0, 5)}–{e.end_time?.substring(0, 5)}</p>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
