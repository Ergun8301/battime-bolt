'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Menu, Clock, CalendarDays, CalendarRange, History, LogOut, AlertTriangle, Check, ArrowLeft } from 'lucide-react';
import { format, subDays, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { computeMissingDays } from '@/lib/work-status';
import PoseurDay from '@/components/poseur-day';
import PoseurWeek from '@/components/poseur-week';
import PoseurMonth from '@/components/poseur-month';
import PoseurHistory from '@/components/poseur-history';

const TABS = [
  { value: 'day', label: 'Ma journée', icon: Clock },
  { value: 'week', label: 'Ma semaine', icon: CalendarDays },
  { value: 'month', label: 'Mon mois', icon: CalendarRange },
  { value: 'history', label: 'Historique', icon: History },
];

export default function PoseurPage() {
  const { user, signOut } = useAuth();
  const [view, setView] = useState('day');
  const [selectedDate, setSelectedDate] = useState<string | null>(null); // declare a specific day
  const [pending, setPending] = useState<string[]>([]); // days "en attente"
  const [pendingOpen, setPendingOpen] = useState(false); // "jours à déclarer" popover

  const fetchPending = useCallback(async () => {
    if (!user) return;
    // Look back far enough to catch any planned-but-not-declared day still open.
    const windowStart = format(subDays(new Date(), 60), 'yyyy-MM-dd');
    const [planRes, entRes] = await Promise.all([
      supabase.from('planning').select('work_date, absence_type').eq('user_id', user.id).gte('work_date', windowStart),
      supabase.from('time_entries').select('work_date').eq('user_id', user.id).neq('status', 'draft').gte('work_date', windowStart),
    ]);
    const rows = (planRes.data || []) as { work_date: string; absence_type: string | null }[];
    const absenceDays = new Set(rows.filter((p) => p.absence_type).map((p) => p.work_date));
    const planned = rows.filter((p) => !p.absence_type && !absenceDays.has(p.work_date)).map((p) => p.work_date);
    const declared = new Set<string>((entRes.data || []).map((e: { work_date: string }) => e.work_date));
    setPending(computeMissingDays(planned, declared));
  }, [user]);

  useEffect(() => {
    fetchPending();
    const id = setInterval(fetchPending, 60000);
    return () => clearInterval(id);
  }, [fetchPending]);

  const openDay = (d: string) => { setSelectedDate(d); setPendingOpen(false); };
  const goHome = () => { setSelectedDate(null); setView('day'); fetchPending(); };
  const goTo = (v: string) => { setSelectedDate(null); setView(v); };

  const todayLabel = format(new Date(), 'EEEE d MMMM', { locale: fr });

  return (
    <div className="min-h-screen bg-background safe-top safe-bottom">
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-2xl lg:max-w-5xl mx-auto px-4 py-3 flex items-center gap-2">
          {view === 'day' && !selectedDate ? (
            <p className="font-bold text-base capitalize shrink-0">{todayLabel}</p>
          ) : (
            <button
              onClick={goHome}
              className="inline-flex items-center gap-1 font-bold text-base shrink-0 text-primary hover:opacity-80"
            >
              <ArrowLeft className="h-4 w-4" /> Ma journée
            </button>
          )}

          <div className="flex-1 flex justify-center">
            {pending.length > 0 && (
              <Popover open={pendingOpen} onOpenChange={setPendingOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-orange-500 hover:bg-orange-50 animate-pulse"
                    aria-label="Jours à déclarer"
                    title="Jours à déclarer"
                  >
                    <AlertTriangle className="h-5 w-5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="center" className="w-72">
                  <p className="text-sm font-medium mb-2">Jours à déclarer</p>
                  <div className="space-y-1.5">
                    {pending.map((d) => (
                      <button
                        key={d}
                        onClick={() => openDay(d)}
                        className="w-full truncate rounded-md border px-3 py-2.5 text-left text-sm font-medium capitalize hover:bg-muted/50 transition-colors"
                      >
                        {format(parseISO(d), 'EEEE d MMMM', { locale: fr })}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0" aria-label="Menu">
                <Menu className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="truncate">{user?.first_name} {user?.last_name}</DropdownMenuLabel>
              {TABS.map((t) => (
                <DropdownMenuItem key={t.value} onClick={() => goTo(t.value)}>
                  <t.icon className="h-4 w-4 mr-2" /> {t.label}
                  {!selectedDate && view === t.value && <Check className="h-4 w-4 ml-auto" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut}><LogOut className="h-4 w-4 mr-2" /> Déconnexion</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="max-w-2xl lg:max-w-5xl mx-auto px-4 py-4">
        {selectedDate ? (
          <div className="lg:max-w-2xl lg:mx-auto">
            <p className="font-semibold capitalize mb-2">{format(parseISO(selectedDate), 'EEEE d MMMM', { locale: fr })}</p>
            <PoseurDay date={selectedDate} />
          </div>
        ) : view === 'day' ? (
          <div className="lg:max-w-2xl lg:mx-auto"><PoseurDay /></div>
        ) : view === 'week' ? (
          <PoseurWeek onSelectDay={openDay} />
        ) : view === 'month' ? (
          <div className="lg:max-w-2xl lg:mx-auto"><PoseurMonth onSelectDay={openDay} /></div>
        ) : (
          <div className="lg:max-w-2xl lg:mx-auto"><PoseurHistory /></div>
        )}
      </main>
    </div>
  );
}
