'use client';

// Demande de congé côté SALARIÉ : formulaire (type + période + mot facultatif)
// et historique de ses propres demandes. L'écriture passe par la RPC
// `request_leave` (SECURITY DEFINER) qui force company_id/user_id côté serveur —
// un salarié ne peut donc jamais déposer une demande au nom d'un autre.
// Rien n'est écrit dans `planning` ici : c'est l'admin, à l'approbation, qui pose
// l'absence, exactement comme il le fait déjà à la main aujourd'hui.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LeaveRequest, LeaveType } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Trash2, CalendarRange } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId?: string;
}

const LEAVE_TYPES: { key: LeaveType; label: string }[] = [
  { key: 'conge', label: 'Congé' },
  { key: 'maladie', label: 'Arrêt maladie' },
  { key: 'intemperie', label: 'Intempérie' },
];
const TYPE_LABEL: Record<LeaveType, string> = { conge: 'Congé', maladie: 'Arrêt maladie', intemperie: 'Intempérie' };

const LR_CSS = `
.bt-lr-seg{display:flex;gap:6px;margin-bottom:12px}
.bt-lr-segbtn{flex:1;padding:9px 6px;border-radius:10px;border:1.5px solid rgba(21,18,15,.18);background:#fff;font-family:inherit;font-weight:800;font-size:12.5px;color:#15120F;cursor:pointer}
.bt-lr-segbtn.on{background:#FFC21A;border-color:#15120F;box-shadow:0 2px 0 #C99300}
.bt-lr-l{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:#6E6A63;font-weight:700;margin:0 0 3px;display:block}
.bt-lr-i{width:100%;font-family:'Archivo',sans-serif;font-size:14px;font-weight:500;padding:9px 11px;border:1.5px solid rgba(21,18,15,.18);border-radius:10px;background:#fff;outline:none;color:#15120F}
.bt-lr-i:focus{border-color:#15120F}
.bt-lr-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
.bt-lr-row{display:flex;align-items:center;gap:9px;border:1px solid rgba(21,18,15,.12);border-radius:11px;padding:9px 11px;background:#fff;margin-bottom:6px}
.bt-lr-row-main{flex:1;min-width:0}
.bt-lr-row-t{font-size:13.5px;font-weight:800;color:#15120F}
.bt-lr-row-d{font-family:'JetBrains Mono',monospace;font-size:11px;color:#8a8378;font-weight:600;margin-top:2px}
.bt-lr-tag{font-size:11px;font-weight:800;padding:3px 8px;border-radius:99px;flex:none}
.bt-lr-tag.pending{background:#FFF6E0;color:#8a6d05;border:1px solid #EAD08A}
.bt-lr-tag.approved{background:#E4F2E9;color:#1F7A4D;border:1px solid #B7DCC4}
.bt-lr-tag.rejected{background:#FBE3D8;color:#C0461F;border:1px solid #E8B79E}
.bt-lr-empty{text-align:center;color:#8a8378;font-size:13px;padding:18px 0}
.bt-lr-note{font-size:12px;color:#8a8378;margin-top:3px}
`;

export default function LeaveRequestDialog({ open, onOpenChange, userId }: Props) {
  const [type, setType] = useState<LeaveType>('conge');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [adding, setAdding] = useState(false);

  const fetchRows = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('leave_requests').select('*')
      .eq('user_id', userId).order('created_at', { ascending: false });
    setRows((data || []) as LeaveRequest[]);
  }, [userId]);

  useEffect(() => { if (open) { fetchRows(); setAdding(false); } }, [open, fetchRows]);

  const submit = async () => {
    if (!start || !end) { toast.error('Choisis les dates de début et de fin'); return; }
    if (end < start) { toast.error('La date de fin est avant le début'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('request_leave', {
        p_type: type, p_start_date: start, p_end_date: end, p_note: note.trim() || null,
      });
      if (error) throw error;
      toast.success('Demande envoyée');
      setStart(''); setEnd(''); setNote(''); setType('conge'); setAdding(false);
      fetchRows();
    } catch (e) {
      toast.error((e as Error)?.message || "Impossible d'envoyer la demande");
    } finally {
      setSaving(false);
    }
  };

  const cancelRequest = async (id: string) => {
    try {
      const { error } = await supabase.from('leave_requests').delete().eq('id', id);
      if (error) throw error;
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch {
      toast.error("Impossible d'annuler la demande");
    }
  };

  const period = (r: LeaveRequest) => {
    const s = format(parseISO(r.start_date), 'd MMM', { locale: fr });
    const e = format(parseISO(r.end_date), 'd MMM yyyy', { locale: fr });
    return r.start_date === r.end_date ? format(parseISO(r.start_date), 'd MMM yyyy', { locale: fr }) : `${s} → ${e}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bt-skin max-w-md max-h-[88vh] overflow-y-auto">
        <style dangerouslySetInnerHTML={{ __html: LR_CSS }} />
        <DialogHeader><DialogTitle>Mes congés</DialogTitle></DialogHeader>

        {!adding && (
          <Button className="w-full font-bold" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Faire une demande
          </Button>
        )}

        {adding && (
          <div className="pt-1">
            <span className="bt-lr-l">Type</span>
            <div className="bt-lr-seg">
              {LEAVE_TYPES.map((t) => (
                <button key={t.key} type="button" className={`bt-lr-segbtn${type === t.key ? ' on' : ''}`} onClick={() => setType(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="bt-lr-grid">
              <div>
                <span className="bt-lr-l">Du</span>
                <input className="bt-lr-i" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div>
                <span className="bt-lr-l">Au</span>
                <input className="bt-lr-i" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <span className="bt-lr-l">Mot pour le bureau (facultatif)</span>
            <input className="bt-lr-i" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex. mariage de ma sœur" />
            <div className="flex gap-2 pt-3">
              <Button variant="outline" onClick={() => setAdding(false)} disabled={saving}>Annuler</Button>
              <Button className="flex-1 font-bold" onClick={submit} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Envoyer la demande
              </Button>
            </div>
          </div>
        )}

        <div className="pt-2">
          <span className="bt-lr-l">Mes demandes</span>
          {rows.length === 0 ? (
            <p className="bt-lr-empty">Aucune demande pour le moment.</p>
          ) : rows.map((r) => (
            <div key={r.id} className="bt-lr-row">
              <CalendarRange className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="bt-lr-row-main">
                <div className="bt-lr-row-t">{TYPE_LABEL[r.type]}</div>
                <div className="bt-lr-row-d">{period(r)}</div>
                {r.status === 'rejected' && r.decision_note && <div className="bt-lr-note">« {r.decision_note} »</div>}
              </div>
              <span className={`bt-lr-tag ${r.status}`}>
                {r.status === 'pending' ? 'En attente' : r.status === 'approved' ? 'Acceptée' : 'Refusée'}
              </span>
              {r.status === 'pending' && (
                <button type="button" onClick={() => cancelRequest(r.id)} title="Annuler ma demande"
                  className="shrink-0 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
