'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { User } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle, AlertTriangle, Clock, Bell, ChevronRight, Users } from 'lucide-react';
import { format, parseISO, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { missingBusinessDays } from '@/lib/work-status';
import WorkerDetailDialog from '@/components/worker-detail';

// Window for "recent" missing business days shown on the dashboard.
const WINDOW_DAYS = 7;

interface WorkerStatus {
  worker: User;
  sentToday: boolean;
  missing: string[]; // yyyy-MM-dd, most recent first
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [statuses, setStatuses] = useState<WorkerStatus[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedWorker, setSelectedWorker] = useState<User | null>(null);

  const fetchDashboard = useCallback(async () => {
    if (!user?.company_id) return;
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const windowStart = format(subDays(new Date(), WINDOW_DAYS), 'yyyy-MM-dd');

      const [workersRes, entriesRes, companyRes] = await Promise.all([
        supabase.from('users').select('*')
          .eq('company_id', user.company_id).eq('role', 'worker').eq('is_active', true)
          .order('first_name'),
        // "Sent" = anything that isn't a draft (submitted; legacy validated).
        supabase.from('time_entries').select('user_id, work_date, status')
          .eq('company_id', user.company_id).neq('status', 'draft')
          .gte('work_date', windowStart),
        supabase.from('companies').select('name').eq('id', user.company_id).maybeSingle(),
      ]);
      if (workersRes.error) throw workersRes.error;
      if (entriesRes.error) throw entriesRes.error;

      const sentByUser = new Map<string, Set<string>>();
      for (const e of entriesRes.data || []) {
        if (!sentByUser.has(e.user_id)) sentByUser.set(e.user_id, new Set());
        sentByUser.get(e.user_id)!.add(e.work_date);
      }

      const list: WorkerStatus[] = (workersRes.data || []).map((worker: User) => {
        const sent = sentByUser.get(worker.id) || new Set<string>();
        return {
          worker,
          sentToday: sent.has(today),
          missing: missingBusinessDays(sent, WINDOW_DAYS),
        };
      });

      // Late first (most missing days), then waiting, then up-to-date; alpha within.
      list.sort((a, b) => {
        const rank = (s: WorkerStatus) => (s.missing.length > 0 ? 0 : s.sentToday ? 2 : 1);
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        if (ra === 0 && a.missing.length !== b.missing.length) return b.missing.length - a.missing.length;
        return a.worker.first_name.localeCompare(b.worker.first_name);
      });

      setStatuses(list);
      setCompanyName(companyRes.data?.name || '');
    } catch (err) {
      console.error('Error fetching dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.company_id]);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 60000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  // Reminder via the secretary's own mail client (prefilled). Zero infra.
  const sendReminder = (e: React.MouseEvent, s: WorkerStatus) => {
    e.stopPropagation();
    const { worker, missing } = s;
    if (!worker.email) { toast.error(`Pas d'email pour ${worker.first_name}`); return; }
    const jours = missing.map((d) => format(parseISO(d), 'EEEE d MMMM', { locale: fr })).join(', ');
    const subject = encodeURIComponent('Rappel : pense à envoyer tes heures');
    const body = encodeURIComponent(
      `Bonjour ${worker.first_name},\n\n`
      + `Il manque l'envoi de tes heures pour : ${jours || 'des journées récentes'}.\n`
      + `Merci de les saisir et de les envoyer dès que possible depuis l'application Battime.\n\n`
      + `— ${companyName || "L'équipe"}`,
    );
    window.location.href = `mailto:${worker.email}?subject=${subject}&body=${body}`;
    toast.success(`Rappel préparé pour ${worker.first_name}`);
  };

  const received = statuses.filter((s) => s.missing.length === 0 && s.sentToday).length;
  const late = statuses.filter((s) => s.missing.length > 0).length;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
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

      {statuses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Aucun salarié actif</p>
            <p className="text-sm text-muted-foreground mt-2">
              Invitez vos poseurs depuis l'onglet Salariés
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {statuses.length} salarié{statuses.length > 1 ? 's' : ''} actif{statuses.length > 1 ? 's' : ''}
            {' · '}{received} à jour
            {late > 0 ? ` · ${late} en retard` : ''}
          </p>

          <div className="space-y-2">
            {statuses.map((s) => {
              const isLate = s.missing.length > 0;
              return (
                <Card
                  key={s.worker.id}
                  className="cursor-pointer transition-colors hover:bg-muted/40"
                  onClick={() => setSelectedWorker(s.worker)}
                >
                  <CardContent className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{s.worker.first_name} {s.worker.last_name}</p>
                      {s.worker.email && (
                        <p className="text-xs text-muted-foreground truncate">{s.worker.email}</p>
                      )}
                    </div>

                    {isLate ? (
                      <Badge variant="default" className="bg-red-600 hover:bg-red-600 shrink-0">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {s.missing.length} jour{s.missing.length > 1 ? 's' : ''} manquant{s.missing.length > 1 ? 's' : ''}
                      </Badge>
                    ) : s.sentToday ? (
                      <Badge variant="default" className="bg-green-600 hover:bg-green-600 shrink-0">
                        <CheckCircle className="h-3 w-3 mr-1" />Reçu
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="shrink-0">
                        <Clock className="h-3 w-3 mr-1" />En attente d'aujourd'hui
                      </Badge>
                    )}

                    {isLate && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={(e) => sendReminder(e, s)}
                        title={s.worker.email ? `Envoyer un rappel à ${s.worker.email}` : "Pas d'email"}
                      >
                        <Bell className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Rappel</span>
                      </Button>
                    )}

                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <WorkerDetailDialog
        worker={selectedWorker}
        onOpenChange={(open) => { if (!open) setSelectedWorker(null); }}
      />
    </div>
  );
}
