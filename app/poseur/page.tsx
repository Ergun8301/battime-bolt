'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Menu, Clock, CalendarDays, History, LogOut, AlertTriangle, Check } from 'lucide-react';
import { format, subDays, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { computeMissingDays } from '@/lib/work-status';
import PoseurDay from '@/components/poseur-day';
import PoseurWeek from '@/components/poseur-week';
import PoseurHistory from '@/components/poseur-history';

const TABS = [
  { value: 'day', label: 'Ma journée', icon: Clock },
  { value: 'week', label: 'Ma semaine', icon: CalendarDays },
  { value: 'history', label: 'Historique', icon: History },
];

export default function PoseurPage() {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('day');
  const [pending, setPending] = useState<string[]>([]); // days "en attente"

  const fetchPending = useCallback(async () => {
    if (!user) return;
    const windowStart = format(subDays(new Date(), 21), 'yyyy-MM-dd');
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

  const todayLabel = format(new Date(), 'EEEE d MMMM', { locale: fr });

  return (
    <div className="min-h-screen bg-background safe-top safe-bottom">
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-2xl lg:max-w-5xl mx-auto px-4 py-3 flex items-center gap-2">
          {/* left: today's date */}
          <p className="font-bold text-base capitalize shrink-0">{todayLabel}</p>

          {/* middle: discreet "en attente" indicator (gentle pulse) */}
          <div className="flex-1 flex justify-center">
            {pending.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-orange-500 hover:bg-orange-50 animate-pulse"
                    aria-label="Journées en attente"
                    title="Journées en attente"
                  >
                    <AlertTriangle className="h-5 w-5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="center" className="w-64">
                  <p className="text-sm font-medium">En attente</p>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-2">Ces journées ne sont pas encore envoyées :</p>
                  <ul className="space-y-1 text-sm">
                    {pending.map((d) => <li key={d} className="capitalize">{format(parseISO(d), 'EEEE d MMMM', { locale: fr })}</li>)}
                  </ul>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* right: hamburger menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0" aria-label="Menu">
                <Menu className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="truncate">{user?.first_name} {user?.last_name}</DropdownMenuLabel>
              {TABS.map((t) => (
                <DropdownMenuItem key={t.value} onClick={() => setActiveTab(t.value)}>
                  <t.icon className="h-4 w-4 mr-2" /> {t.label}
                  {activeTab === t.value && <Check className="h-4 w-4 ml-auto" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut}><LogOut className="h-4 w-4 mr-2" /> Déconnexion</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="max-w-2xl lg:max-w-5xl mx-auto px-4 py-4">
        <Tabs value={activeTab} className="w-full">
          <TabsContent value="day">
            <div className="lg:max-w-2xl lg:mx-auto"><PoseurDay /></div>
          </TabsContent>
          <TabsContent value="week">
            <PoseurWeek />
          </TabsContent>
          <TabsContent value="history">
            <div className="lg:max-w-2xl lg:mx-auto"><PoseurHistory /></div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
