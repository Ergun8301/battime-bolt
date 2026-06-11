'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { TimeEntryWithWorksite, User } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format, parseISO, startOfWeek, endOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  Clock, Utensils, CheckCircle, Send, FileText, CalendarRange, AlertTriangle,
} from 'lucide-react';

type EntryWithUser = TimeEntryWithWorksite & { user: User };

function formatMinutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'draft':
      return <Badge variant="secondary"><FileText className="h-3 w-3 mr-1" />Brouillon</Badge>;
    case 'submitted':
      return <Badge variant="default" className="bg-blue-600"><Send className="h-3 w-3 mr-1" />Envoyé</Badge>;
    case 'validated':
      return <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Validé</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<EntryWithUser[]>([]);
  const [weekMinutes, setWeekMinutes] = useState(0);
  const [pendingValidation, setPendingValidation] = useState<EntryWithUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    if (!user?.company_id) return;

    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

      const [todayRes, weekRes, pendingRes] = await Promise.all([
        supabase
          .from('time_entries')
          .select(`*, worksite:worksites(*), user:users!user_id(*)`)
          .eq('company_id', user.company_id)
          .eq('work_date', today)
          .order('created_at', { ascending: true }),
        supabase
          .from('time_entries')
          .select('total_minutes')
          .eq('company_id', user.company_id)
          .gte('work_date', weekStart)
          .lte('work_date', weekEnd),
        supabase
          .from('time_entries')
          .select(`*, worksite:worksites(*), user:users!user_id(*)`)
          .eq('company_id', user.company_id)
          .eq('status', 'submitted')
          .order('work_date', { ascending: true })
          .limit(50),
      ]);

      if (todayRes.error) throw todayRes.error;
      if (weekRes.error) throw weekRes.error;
      if (pendingRes.error) throw pendingRes.error;

      setEntries(todayRes.data || []);
      setWeekMinutes((weekRes.data || []).reduce((s, e) => s + (e.total_minutes || 0), 0));
      setPendingValidation(pendingRes.data || []);
    } catch (err) {
      console.error('Error fetching entries:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.company_id]);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 60000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  const todayMinutes = entries.reduce((s, e) => s + e.total_minutes, 0);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold">Tableau de bord</h2>
        <p className="text-muted-foreground capitalize">
          {format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="bg-primary text-primary-foreground rounded-full p-3">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total aujourd'hui</p>
                <p className="text-3xl font-bold">{formatMinutesToHours(todayMinutes)}</p>
                <p className="text-xs text-muted-foreground">
                  {entries.length} saisie{entries.length > 1 ? 's' : ''} · {entries.filter(e => e.meal_allowance).length} panier{entries.filter(e => e.meal_allowance).length > 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="bg-muted rounded-full p-3">
                <CalendarRange className="h-6 w-6 text-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total semaine</p>
                <p className="text-3xl font-bold">{formatMinutesToHours(weekMinutes)}</p>
                <p className="text-xs text-muted-foreground">
                  {format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'd MMM', { locale: fr })} – {format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'd MMM', { locale: fr })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={pendingValidation.length > 0 ? 'border-orange-200 bg-orange-50/50' : ''}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`rounded-full p-3 ${pendingValidation.length > 0 ? 'bg-orange-500 text-white' : 'bg-muted text-foreground'}`}>
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">À valider</p>
                <p className="text-3xl font-bold">{pendingValidation.length}</p>
                <p className="text-xs text-muted-foreground">
                  {pendingValidation.length > 0 ? 'Onglet Validation' : 'Tout est à jour'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Validation queue */}
      {pendingValidation.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            File d'attente de validation
            <Badge variant="outline" className="text-orange-600 border-orange-300">{pendingValidation.length}</Badge>
          </h3>
          <Card>
            <CardContent className="p-0 divide-y">
              {pendingValidation.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 p-3">
                  <div className="text-xs text-muted-foreground w-20 shrink-0">
                    {format(parseISO(entry.work_date), 'EEE d MMM', { locale: fr })}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">
                      {entry.user?.first_name} {entry.user?.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {entry.worksite?.client_name || 'Chantier inconnu'}
                      {entry.worksite?.city ? ` · ${entry.worksite.city}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm shrink-0">
                    <span className="text-muted-foreground hidden sm:inline">
                      {entry.start_time?.substring(0, 5)}–{entry.end_time?.substring(0, 5)}
                    </span>
                    <span className="font-semibold">{formatMinutesToHours(entry.total_minutes)}</span>
                    {entry.meal_allowance && <Utensils className="h-4 w-4 text-muted-foreground" aria-label="Panier repas" />}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Today's entries */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Saisies du jour</h3>
        {entries.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Aucune saisie pour aujourd'hui</p>
              <p className="text-sm text-muted-foreground mt-2">
                Les poseurs apparaîtront ici dès qu'ils saisiront leurs heures
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {entries.map((entry) => (
              <Card key={entry.id} className="overflow-hidden">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{entry.user?.first_name} {entry.user?.last_name}</p>
                      <p className="text-sm text-muted-foreground">{entry.worksite?.client_name || 'Chantier inconnu'}</p>
                      {entry.worksite?.city && (
                        <p className="text-xs text-muted-foreground">{entry.worksite.city}</p>
                      )}
                    </div>
                    <StatusBadge status={entry.status} />
                  </div>

                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{entry.start_time?.substring(0, 5)} - {entry.end_time?.substring(0, 5)}</span>
                    </div>
                    <div className="font-medium">{formatMinutesToHours(entry.total_minutes)}</div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t">
                    {entry.meal_allowance && (
                      <Badge variant="outline" className="text-xs"><Utensils className="h-3 w-3 mr-1" />Panier</Badge>
                    )}
                    {entry.break_minutes > 0 && (
                      <Badge variant="outline" className="text-xs">Pause {entry.break_minutes}min</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
