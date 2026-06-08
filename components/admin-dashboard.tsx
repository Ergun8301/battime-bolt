'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { TimeEntry, TimeEntryWithWorksite, User, Worksite } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Clock, Utensils, CheckCircle, Send, FileText, Users } from 'lucide-react';

function formatMinutesToHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h${mins.toString().padStart(2, '0')}`;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'draft':
      return <Badge variant="secondary"><FileText className="h-3 w-3 mr-1" />Brouillon</Badge>;
    case 'submitted':
      return <Badge variant="default"><Send className="h-3 w-3 mr-1" />Envoye</Badge>;
    case 'validated':
      return <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Valide</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<(TimeEntryWithWorksite & { user: User })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTodayEntries = useCallback(async () => {
    if (!user?.company_id) return;

    try {
      const today = format(new Date(), 'yyyy-MM-dd');

      const { data: entriesData, error: entriesError } = await supabase
        .from('time_entries')
        .select(`
          *,
          worksite:worksites(*),
          user:users(*)
        `)
        .eq('company_id', user.company_id)
        .eq('work_date', today)
        .order('created_at', { ascending: true });

      if (entriesError) throw entriesError;

      setEntries(entriesData || []);
    } catch (err) {
      console.error('Error fetching entries:', err);
      setError('Impossible de charger les saisies');
    } finally {
      setLoading(false);
    }
  }, [user?.company_id]);

  useEffect(() => {
    fetchTodayEntries();

    const interval = setInterval(fetchTodayEntries, 60000);

    return () => clearInterval(interval);
  }, [fetchTodayEntries]);

  const totalMinutes = entries.reduce((sum, entry) => sum + entry.total_minutes, 0);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold">Saisies du jour</h2>
        <p className="text-muted-foreground">
          {format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}
        </p>
      </div>

      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary text-primary-foreground rounded-full p-3">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total heures du jour</p>
                <p className="text-3xl font-bold">{formatMinutesToHours(totalMinutes)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">{entries.length} saisie{entries.length > 1 ? 's' : ''}</p>
              <p className="text-sm text-muted-foreground">
                {entries.filter(e => e.meal_allowance).length} panier{entries.filter(e => e.meal_allowance).length > 1 ? 's' : ''} repas
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Aucune saisie pour aujourd'hui</p>
            <p className="text-sm text-muted-foreground mt-2">
              Les poseurs apparaitront ici des qu'ils saisiront leurs heures
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
                    <p className="font-semibold">
                      {entry.user?.first_name} {entry.user?.last_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {entry.worksite?.client_name || 'Chantier inconnu'}
                    </p>
                    {entry.worksite?.city && (
                      <p className="text-xs text-muted-foreground">
                        {entry.worksite.city}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={entry.status} />
                </div>

                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{entry.start_time?.substring(0, 5)} - {entry.end_time?.substring(0, 5)}</span>
                  </div>
                  <div className="font-medium">
                    {formatMinutesToHours(entry.total_minutes)}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="flex items-center gap-2">
                    {entry.meal_allowance && (
                      <Badge variant="outline" className="text-xs">
                        <Utensils className="h-3 w-3 mr-1" />
                        Panier
                      </Badge>
                    )}
                    {entry.break_minutes > 0 && (
                      <Badge variant="outline" className="text-xs">
                        Pause {entry.break_minutes}min
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
