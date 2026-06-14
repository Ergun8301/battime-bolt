'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { User, Invitation, TimeEntryWithWorksite } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Bell, ChevronRight, Users, Mail, Phone, RefreshCw, X, Loader2,
  FileSpreadsheet, FileText, Clock,
} from 'lucide-react';
import { format, parseISO, subDays, startOfWeek, endOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { exportEntriesToExcel, exportEntriesToPDF } from '@/lib/export-utils';
import { computeMissingDays } from '@/lib/work-status';
import WorkerDetailDialog from '@/components/worker-detail';

const WINDOW_DAYS = 21; // how far back the "planned but not declared" dot looks

interface WorkerStatus {
  worker: User;
  missing: string[]; // planned, undeclared, past dates (most recent first)
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [statuses, setStatuses] = useState<WorkerStatus[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedWorker, setSelectedWorker] = useState<User | null>(null);

  // global export
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [exporting, setExporting] = useState(false);

  // invitation row actions
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    if (!user?.company_id) return;
    try {
      const windowStart = format(subDays(new Date(), WINDOW_DAYS), 'yyyy-MM-dd');
      const [workersRes, planRes, entriesRes, companyRes, invRes] = await Promise.all([
        supabase.from('users').select('*').eq('company_id', user.company_id).eq('role', 'worker').eq('is_active', true).order('first_name'),
        // Planned chantier days (absences excluded → never "missing").
        supabase.from('planning').select('user_id, work_date, absence_type').eq('company_id', user.company_id).is('absence_type', null).gte('work_date', windowStart),
        supabase.from('time_entries').select('user_id, work_date, status').eq('company_id', user.company_id).neq('status', 'draft').gte('work_date', windowStart),
        supabase.from('companies').select('name').eq('id', user.company_id).maybeSingle(),
        supabase.from('invitations').select('*').eq('company_id', user.company_id).is('accepted_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }),
      ]);
      if (workersRes.error) throw workersRes.error;

      const plannedByUser = new Map<string, string[]>();
      for (const p of planRes.data || []) {
        if (!plannedByUser.has(p.user_id)) plannedByUser.set(p.user_id, []);
        plannedByUser.get(p.user_id)!.push(p.work_date);
      }
      const declaredByUser = new Map<string, Set<string>>();
      for (const e of entriesRes.data || []) {
        if (!declaredByUser.has(e.user_id)) declaredByUser.set(e.user_id, new Set());
        declaredByUser.get(e.user_id)!.add(e.work_date);
      }

      const list: WorkerStatus[] = (workersRes.data || []).map((worker: User) => ({
        worker,
        missing: computeMissingDays(plannedByUser.get(worker.id) || [], declaredByUser.get(worker.id) || new Set()),
      }));
      // Workers with missing days first.
      list.sort((a, b) => (b.missing.length > 0 ? 1 : 0) - (a.missing.length > 0 ? 1 : 0) || a.worker.first_name.localeCompare(b.worker.first_name));

      const activeEmails = new Set((workersRes.data || []).map((w: User) => w.email.toLowerCase()));
      const pending = (invRes.data || []).filter((inv: Invitation) => !activeEmails.has(inv.email.toLowerCase()));

      setStatuses(list);
      setInvitations(pending);
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

  const sendReminder = (e: React.MouseEvent, s: WorkerStatus) => {
    e.stopPropagation();
    const { worker, missing } = s;
    if (!worker.email) { toast.error(`Pas d'email pour ${worker.first_name}`); return; }
    const jours = missing.map((d) => format(parseISO(d), 'EEEE d MMMM', { locale: fr })).join(', ');
    const subject = encodeURIComponent('Rappel : pense à envoyer tes heures');
    const body = encodeURIComponent(
      `Bonjour ${worker.first_name},\n\n`
      + `Il manque l'envoi de tes heures pour : ${jours || 'des journées planifiées'}.\n`
      + `Merci de les saisir et de les envoyer dès que possible depuis l'application Battime.\n\n`
      + `— ${companyName || "L'équipe"}`,
    );
    window.location.href = `mailto:${worker.email}?subject=${subject}&body=${body}`;
    toast.success(`Rappel préparé pour ${worker.first_name}`);
  };

  // ─── global team export (locks) ──────────────────────────────────────────────

  const runExport = async (kind: 'excel' | 'pdf') => {
    if (!user?.company_id) { toast.error('Profil non chargé'); return; }
    setExporting(true);
    try {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const from = format(weekStart, 'yyyy-MM-dd');
      const to = format(weekEnd, 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('time_entries')
        .select('*, worksite:worksites(*), user:users!user_id(*)')
        .eq('company_id', user.company_id)
        .gte('work_date', from).lte('work_date', to)
        .order('work_date', { ascending: false }).order('user_id');
      if (error) throw error;
      const entries = (data || []) as (TimeEntryWithWorksite & { user: User })[];
      if (entries.length === 0) { toast.error(`Aucune saisie du ${format(weekStart, 'dd/MM')} au ${format(weekEnd, 'dd/MM')}`); return; }

      const opts = {
        fileName: `battime-${kind === 'pdf' ? 'rapport' : 'export'}-${from}`,
        title: 'Battime - Rapport hebdomadaire',
        periodLabel: `${format(weekStart, 'dd/MM/yyyy')} au ${format(weekEnd, 'dd/MM/yyyy')}`,
        companyName,
      };
      if (kind === 'excel') exportEntriesToExcel(entries, opts);
      else exportEntriesToPDF(entries, opts);

      await supabase.from('time_entries').update({ exported_at: new Date().toISOString(), locked: true })
        .in('id', entries.map(e => e.id)).eq('company_id', user.company_id);

      toast.success(`Export téléchargé — ${entries.length} saisie${entries.length > 1 ? 's' : ''} verrouillée${entries.length > 1 ? 's' : ''}`);
    } catch (err) {
      console.error('Error exporting team:', err);
      toast.error("Erreur lors de l'export");
    } finally {
      setExporting(false);
    }
  };

  // ─── invitation actions ──────────────────────────────────────────────────────

  const resendInvitation = async (inv: Invitation) => {
    if (!user?.company_id) return;
    setResendingId(inv.id);
    try {
      const { error } = await supabase.functions.invoke('invite-worker', {
        body: { email: inv.email, first_name: inv.first_name, last_name: inv.last_name, phone: inv.phone || null, company_id: user.company_id, role: 'worker' },
      });
      if (error) throw error;
      toast.success('Invitation renvoyée');
      fetchDashboard();
    } catch (err) {
      console.error('Error resending invitation:', err);
      toast.error("Impossible de renvoyer l'invitation");
    } finally {
      setResendingId(null);
    }
  };

  const cancelInvitation = async (inv: Invitation) => {
    if (!user?.company_id) return;
    setCancellingId(inv.id);
    try {
      const { error } = await supabase.from('invitations').delete().eq('id', inv.id).eq('company_id', user.company_id);
      if (error) throw error;
      toast.success('Invitation annulée');
      fetchDashboard();
    } catch (err) {
      console.error('Error cancelling invitation:', err);
      toast.error("Impossible d'annuler l'invitation");
    } finally {
      setCancellingId(null);
    }
  };

  const late = statuses.filter((s) => s.missing.length > 0).length;

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-64" />{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold">Tableau de bord</h2>
        <p className="text-muted-foreground capitalize">{format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}</p>
      </div>

      {/* Global team export (payroll — locks) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> Exporter toute l'équipe</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Semaine du {format(weekStart, 'd MMM yyyy', { locale: fr })}</label>
            <input
              type="date"
              value={format(weekStart, 'yyyy-MM-dd')}
              onChange={(e) => { if (e.target.value) setWeekStart(startOfWeek(parseISO(e.target.value + 'T00:00:00'), { weekStartsOn: 1 })); }}
              className="block px-3 py-2 border rounded-md text-sm"
            />
          </div>
          <Button onClick={() => runExport('excel')} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />} Excel
          </Button>
          <Button variant="outline" onClick={() => runExport('pdf')} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />} PDF
          </Button>
          <p className="text-xs text-muted-foreground w-full">Verrouille les saisies exportées (paie).</p>
        </CardContent>
      </Card>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" /> Invitations en attente
          </h3>
          <div className="space-y-2">
            {invitations.map((inv) => (
              <Card key={inv.id} className="border-yellow-200 bg-yellow-50/40">
                <CardContent className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{inv.first_name} {inv.last_name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-2 truncate">
                      <Mail className="h-3 w-3" />{inv.email}{inv.phone ? <><Phone className="h-3 w-3 ml-1" />{inv.phone}</> : null}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => resendInvitation(inv)} disabled={resendingId === inv.id || cancellingId === inv.id}>
                    {resendingId === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    <span className="hidden sm:inline ml-1">Relancer</span>
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => cancelInvitation(inv)} disabled={resendingId === inv.id || cancellingId === inv.id}>
                    {cancellingId === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Workers */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground">Salariés ({statuses.length})</h3>
          {late > 0 && <span className="text-xs text-orange-600">{late} avec jour(s) non déclaré(s)</span>}
        </div>

        {statuses.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Aucun salarié actif</p>
              <p className="text-sm text-muted-foreground mt-2">Invitez vos poseurs depuis le Planning (« Nouveau salarié »)</p>
            </CardContent>
          </Card>
        ) : (
          statuses.map((s) => {
            const isLate = s.missing.length > 0;
            return (
              <Card key={s.worker.id} className="cursor-pointer transition-colors hover:bg-muted/40" onClick={() => setSelectedWorker(s.worker)}>
                <CardContent className="flex items-center gap-3 py-3">
                  {/* discreet orange dot if planned-but-undeclared days exist */}
                  <span
                    className={`h-2.5 w-2.5 rounded-full shrink-0 ${isLate ? 'bg-orange-500' : 'bg-transparent border border-muted'}`}
                    title={isLate ? `${s.missing.length} jour(s) planifié(s) non déclaré(s)` : 'À jour'}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{s.worker.first_name} {s.worker.last_name}</p>
                    {s.worker.email && <p className="text-xs text-muted-foreground truncate">{s.worker.email}</p>}
                  </div>
                  {isLate && (
                    <Button variant="outline" size="sm" className="shrink-0" onClick={(e) => sendReminder(e, s)} title={`Rappel à ${s.worker.email || ''}`}>
                      <Bell className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Rappel</span>
                    </Button>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <WorkerDetailDialog
        worker={selectedWorker}
        onOpenChange={(open) => { if (!open) setSelectedWorker(null); }}
        onChanged={fetchDashboard}
      />
    </div>
  );
}
