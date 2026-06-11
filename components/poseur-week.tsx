'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { TimeEntry, Worksite, Planning } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChevronLeft, ChevronRight, MapPin, Clock, Utensils,
  CheckCircle, Send, AlertTriangle,
} from 'lucide-react';
import { format, addDays, startOfWeek, addWeeks, subWeeks, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

interface TimeEntryWithWorksite extends TimeEntry {
  worksite: Worksite | null;
}
interface PlanningWithWorksite extends Planning {
  worksite: Worksite | null;
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

const ABSENCE_LABELS: Record<string, string> = {
  conge: 'Congé',
  maladie: 'Maladie',
  intemperie: 'Intempérie',
};

export default function PoseurWeek() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [planning, setPlanning] = useState<PlanningWithWorksite[]>([]);
  const [entries, setEntries] = useState<TimeEntryWithWorksite[]>([]);
  const [loading, setLoading] = useState(true);

  const weekEnd = addDays(weekStart, 5); // Mon–Sat

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const startStr = format(weekStart, 'yyyy-MM-dd');
      const endStr = format(weekEnd, 'yyyy-MM-dd');

      const [planningRes, entriesRes] = await Promise.all([
        supabase
          .from('planning')
          .select('*, worksite:worksites(*)')
          .eq('user_id', user.id)
          .gte('work_date', startStr)
          .lte('work_date', endStr),
        supabase
          .from('time_entries')
          .select('*, worksite:worksites(*)')
          .eq('user_id', user.id)
          .gte('work_date', startStr)
          .lte('work_date', endStr)
          .order('start_time'),
      ]);

      if (planningRes.error) throw planningRes.error;
      if (entriesRes.error) throw entriesRes.error;

      setPlanning(planningRes.data || []);
      setEntries(entriesRes.data || []);
    } catch (err) {
      console.error('Error fetching week:', err);
    } finally {
      setLoading(false);
    }
  }, [user, weekStart]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const weekDays = Array.from({ length: 6 }, (_, i) => addDays(weekStart, i));
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const totalValidated = entries
    .filter(e => e.status === 'validated')
    .reduce((s, e) => s + e.total_minutes, 0);
  const totalSubmitted = entries
    .filter(e => e.status === 'submitted' || e.status === 'validated')
    .reduce((s, e) => s + e.total_minutes, 0);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center">
          <p className="font-semibold text-sm">
            {format(weekStart, 'd MMMM', { locale: fr })} – {format(weekEnd, 'd MMMM yyyy', { locale: fr })}
          </p>
          {(totalValidated > 0 || totalSubmitted > 0) && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {totalSubmitted > 0 ? `${formatMinutes(totalSubmitted)} soumises` : ''}
              {totalValidated > 0 ? ` · ${formatMinutes(totalValidated)} validées` : ''}
            </p>
          )}
        </div>
        <Button variant="outline" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Day-by-day list */}
      <div className="space-y-3">
        {weekDays.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isToday = dateStr === todayStr;
          const dayPlanning = planning.filter(p => p.work_date === dateStr);
          const dayEntries = entries.filter(e => e.work_date === dateStr);
          const hasContent = dayPlanning.length > 0 || dayEntries.length > 0;

          return (
            <div
              key={dateStr}
              className={`rounded-lg border p-3 space-y-2 ${isToday ? 'border-primary bg-primary/5' : 'bg-card'}`}
            >
              {/* Day header */}
              <div className="flex items-center gap-2">
                <p className={`font-semibold capitalize text-sm ${isToday ? 'text-primary' : ''}`}>
                  {format(day, 'EEEE d MMMM', { locale: fr })}
                </p>
                {isToday && (
                  <Badge variant="default" className="text-xs py-0">Aujourd'hui</Badge>
                )}
              </div>

              {/* Planning assignments */}
              {dayPlanning.map((p) => (
                <div key={p.id}>
                  {p.absence_type ? (
                    <div className="flex items-center gap-2 text-sm bg-gray-100 rounded p-2 text-gray-700">
                      <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
                      <span className="font-medium">{ABSENCE_LABELS[p.absence_type] || p.absence_type}</span>
                      {p.notes && <span className="text-gray-500 text-xs">— {p.notes}</span>}
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 text-sm bg-blue-50 border border-blue-200 rounded p-2 text-blue-800">
                      <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium truncate block">{p.worksite?.client_name || 'Chantier'}</span>
                        {p.worksite?.city && <span className="text-blue-600 text-xs">{p.worksite.city}</span>}
                      </div>
                      {p.estimated_start && p.estimated_end && (
                        <span className="text-blue-600 text-xs shrink-0">
                          {p.estimated_start.substring(0, 5)}–{p.estimated_end.substring(0, 5)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Time entries */}
              {dayEntries.map((entry) => {
                const statusColor =
                  entry.status === 'validated' ? 'bg-green-50 border-green-200 text-green-800' :
                  entry.status === 'submitted' ? 'bg-blue-50 border-blue-200 text-blue-800' :
                  'bg-gray-50 border-gray-200 text-gray-700';

                return (
                  <div key={entry.id} className={`flex items-start gap-2 text-sm border rounded p-2 ${statusColor}`}>
                    <Clock className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium truncate block">{entry.worksite?.client_name || 'Chantier inconnu'}</span>
                      <span className="text-xs opacity-75">
                        {entry.start_time?.substring(0, 5)}–{entry.end_time?.substring(0, 5)}
                        {entry.break_minutes > 0 ? ` · pause ${entry.break_minutes}min` : ''}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="font-semibold">{formatMinutes(entry.total_minutes)}</span>
                      <div className="flex items-center gap-1">
                        {entry.meal_allowance && (
                          <Utensils className="h-3 w-3 opacity-60" aria-label="Panier repas" />
                        )}
                        {entry.status === 'submitted' && (
                          <Send className="h-3 w-3 opacity-70" aria-label="Envoyé" />
                        )}
                        {entry.status === 'validated' && (
                          <CheckCircle className="h-3 w-3 opacity-70" aria-label="Validé" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {!hasContent && (
                <p className="text-sm text-muted-foreground text-center py-1">Aucune affectation</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
