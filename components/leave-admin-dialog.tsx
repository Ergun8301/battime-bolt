'use client';

// Demandes de congé côté ADMIN : liste des demandes (en attente d'abord), avec
// approbation / refus.
//
// Point clé : approuver réutilise EXACTEMENT le même chemin d'écriture que le
// dialogue « Statut » existant (delete des absences à partir de la date, puis
// INSERT de lignes `planning` avec absence_type). Une absence approuvée ici est
// donc rigoureusement identique à une absence posée à la main par l'admin — rien
// d'autre dans l'app (grille, export paie, feuilles d'heures) n'a besoin de
// changer, et aucune logique existante n'est modifiée.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LeaveRequest, LeaveType, User } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Check, X as XIcon, CalendarRange } from 'lucide-react';
import { format, parseISO, addDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId?: string;
  adminId?: string;
  workers: User[];
  onChanged?: () => void;
}

const TYPE_LABEL: Record<LeaveType, string> = { conge: 'Congé', maladie: 'Arrêt maladie', intemperie: 'Intempérie' };

const LA_CSS = `
.bt-la-row{display:flex;align-items:flex-start;gap:10px;border:1px solid rgba(21,18,15,.12);border-radius:12px;padding:11px 12px;background:#fff;margin-bottom:8px}
.bt-la-main{flex:1;min-width:0}
.bt-la-who{font-size:14px;font-weight:800;color:#15120F}
.bt-la-what{font-size:12.5px;font-weight:600;color:#3a352f;margin-top:2px}
.bt-la-when{font-family:'JetBrains Mono',monospace;font-size:11px;color:#8a8378;font-weight:600;margin-top:2px}
.bt-la-note{font-size:12px;color:#6E6A63;margin-top:4px;font-style:italic}
.bt-la-acts{display:flex;gap:6px;flex:none}
.bt-la-tag{font-size:11px;font-weight:800;padding:3px 8px;border-radius:99px;flex:none;align-self:flex-start}
.bt-la-tag.approved{background:#E4F2E9;color:#1F7A4D;border:1px solid #B7DCC4}
.bt-la-tag.rejected{background:#FBE3D8;color:#C0461F;border:1px solid #E8B79E}
.bt-la-kicker{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:#9a948a;margin:14px 2px 7px}
.bt-la-empty{text-align:center;color:#8a8378;font-size:13px;padding:22px 0}
`;

export default function LeaveAdminDialog({ open, onOpenChange, companyId, adminId, workers, onChanged }: Props) {
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const fetchRows = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase.from('leave_requests').select('*')
      .eq('company_id', companyId).order('created_at', { ascending: false });
    setRows((data || []) as LeaveRequest[]);
  }, [companyId]);

  useEffect(() => { if (open) { fetchRows(); setRejectingId(null); setRejectNote(''); } }, [open, fetchRows]);

  const nameOf = (userId: string) => {
    const w = workers.find((x) => x.id === userId);
    return w ? `${w.first_name} ${w.last_name}` : 'Salarié';
  };

  const notifyWorker = async (userId: string, title: string, body: string) => {
    // Notification best-effort : si le salarié n'a pas activé le push, il verra
    // simplement le statut dans « Mes congés ». On n'échoue jamais là-dessus.
    try {
      await supabase.functions.invoke('send-push', {
        body: { user_ids: [userId], title, body, url: '/poseur', tag: 'conge' },
      });
    } catch { /* silencieux : le push est un bonus, pas le canal de vérité */ }
  };

  const approve = async (r: LeaveRequest) => {
    if (!companyId || !adminId) return;
    setBusyId(r.id);
    try {
      // Mêmes opérations que confirmAbsence() côté planning : on purge d'abord les
      // absences existantes sur la période, puis on insère une ligne par jour.
      const dates: string[] = [];
      let d = parseISO(r.start_date);
      const endD = parseISO(r.end_date);
      let guard = 0;
      while (d <= endD && guard < 400) { dates.push(format(d, 'yyyy-MM-dd')); d = addDays(d, 1); guard++; }

      const { error: delErr } = await supabase.from('planning').delete()
        .eq('company_id', companyId).eq('user_id', r.user_id)
        .gte('work_date', r.start_date).lte('work_date', r.end_date)
        .not('absence_type', 'is', null);
      if (delErr) throw delErr;

      const planRows = dates.map((dt) => ({
        company_id: companyId, created_by: adminId, user_id: r.user_id,
        worksite_id: null, work_date: dt, estimated_start: null, estimated_end: null,
        notes: null, absence_type: r.type,
      }));
      const { error: insErr } = await supabase.from('planning').insert(planRows);
      if (insErr) throw insErr;

      const { error } = await supabase.from('leave_requests')
        .update({ status: 'approved', decided_at: new Date().toISOString(), decided_by: adminId })
        .eq('id', r.id);
      if (error) throw error;

      toast.success('Demande acceptée — absence posée sur le planning');
      notifyWorker(r.user_id, 'Congé accepté',
        `Ta demande du ${format(parseISO(r.start_date), 'd MMM', { locale: fr })} au ${format(parseISO(r.end_date), 'd MMM', { locale: fr })} a été acceptée.`);
      fetchRows();
      onChanged?.();
    } catch (e) {
      console.error('Error approving leave:', e);
      toast.error("Impossible d'accepter la demande");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (r: LeaveRequest) => {
    if (!adminId) return;
    setBusyId(r.id);
    try {
      const { error } = await supabase.from('leave_requests')
        .update({
          status: 'rejected', decided_at: new Date().toISOString(), decided_by: adminId,
          decision_note: rejectNote.trim() || null,
        })
        .eq('id', r.id);
      if (error) throw error;
      toast.success('Demande refusée');
      notifyWorker(r.user_id, 'Congé refusé',
        rejectNote.trim() || `Ta demande du ${format(parseISO(r.start_date), 'd MMM', { locale: fr })} n'a pas été retenue.`);
      setRejectingId(null); setRejectNote('');
      fetchRows();
    } catch {
      toast.error('Impossible de refuser la demande');
    } finally {
      setBusyId(null);
    }
  };

  const period = (r: LeaveRequest) => r.start_date === r.end_date
    ? format(parseISO(r.start_date), 'EEEE d MMMM yyyy', { locale: fr })
    : `${format(parseISO(r.start_date), 'd MMM', { locale: fr })} → ${format(parseISO(r.end_date), 'd MMM yyyy', { locale: fr })}`;

  const pending = rows.filter((r) => r.status === 'pending');
  const decided = rows.filter((r) => r.status !== 'pending');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bt-skin max-w-lg max-h-[85vh] overflow-y-auto">
        <style dangerouslySetInnerHTML={{ __html: LA_CSS }} />
        <DialogHeader><DialogTitle>Demandes de congé</DialogTitle></DialogHeader>

        {rows.length === 0 && <p className="bt-la-empty">Aucune demande pour le moment.</p>}

        {pending.length > 0 && <div className="bt-la-kicker">En attente ({pending.length})</div>}
        {pending.map((r) => (
          <div key={r.id} className="bt-la-row">
            <CalendarRange className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
            <div className="bt-la-main">
              <div className="bt-la-who">{nameOf(r.user_id)}</div>
              <div className="bt-la-what">{TYPE_LABEL[r.type]}</div>
              <div className="bt-la-when">{period(r)}</div>
              {r.note && <div className="bt-la-note">« {r.note} »</div>}
              {rejectingId === r.id && (
                <div className="flex gap-2 pt-2">
                  <Input className="h-8 text-sm" placeholder="Motif (facultatif)" value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)} />
                  <Button size="sm" variant="destructive" onClick={() => reject(r)} disabled={busyId === r.id}>
                    {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirmer'}
                  </Button>
                </div>
              )}
            </div>
            {rejectingId !== r.id && (
              <div className="bt-la-acts">
                <Button size="icon" variant="outline" className="h-8 w-8" title="Accepter"
                  onClick={() => approve(r)} disabled={busyId === r.id}>
                  {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Refuser"
                  onClick={() => { setRejectingId(r.id); setRejectNote(''); }} disabled={busyId === r.id}>
                  <XIcon className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        ))}

        {decided.length > 0 && <div className="bt-la-kicker">Traitées</div>}
        {decided.map((r) => (
          <div key={r.id} className="bt-la-row">
            <CalendarRange className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
            <div className="bt-la-main">
              <div className="bt-la-who">{nameOf(r.user_id)}</div>
              <div className="bt-la-what">{TYPE_LABEL[r.type]}</div>
              <div className="bt-la-when">{period(r)}</div>
              {r.decision_note && <div className="bt-la-note">« {r.decision_note} »</div>}
            </div>
            <span className={`bt-la-tag ${r.status}`}>{r.status === 'approved' ? 'Acceptée' : 'Refusée'}</span>
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}
