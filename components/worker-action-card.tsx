'use client';

// Carte de confirmation d'une action salarié préparée par l'Assistant BEMEXO
// (lot 3 bis) : congé, début / fin de pointage, réserve. Modifiable ; rien ne
// s'exécute avant « Confirmer ».

import { useMemo, useState } from 'react';
import { CheckCircle2, Loader2, CalendarOff, Play, Square, AlertTriangle, FolderInput, Paperclip } from 'lucide-react';
import {
  checkWorkerAction, LEAVE_KINDS, LEAVE_LABEL, type WorkerActionDraft, type WorkerLive, type WorkerSnapshot,
} from '@/supabase/functions/_shared/worker-assistant-core';
import type { WorkerActionExtra } from '@/lib/worker-assistant';
import type { WorkerActionExecutor } from '@/lib/worker-actions';

const CSS = `
.wa{margin-top:10px;border:1px solid rgba(21,18,15,.14);border-radius:14px;background:#FBF8F2;padding:11px}
.wa-h{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:900;color:#15120F;margin:0 0 8px}
.wa-h .i{width:26px;height:26px;border-radius:8px;background:#15120F;color:#FFC21A;display:flex;align-items:center;justify-content:center;flex:none}
.wa-f{display:flex;flex-direction:column;gap:6px}
.wa-row{display:flex;gap:6px}.wa-row>*{flex:1;min-width:0}
.wa label{font-size:10.5px;font-weight:800;color:#6E6A63;text-transform:uppercase;letter-spacing:.05em;display:block;margin:0 0 2px}
.wa input,.wa select,.wa textarea{width:100%;font-family:inherit;font-size:14px;border:1.5px solid rgba(21,18,15,.16);border-radius:8px;padding:7px 8px;background:#fff;color:#15120F;box-sizing:border-box}
.wa .todo{border-color:#F1B84A;background:#FFFBF0}
.wa-att{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:#56514a;margin:-4px 0 8px}
.wa .wa-check{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:800;color:#15120F;text-transform:none;letter-spacing:0}
.wa .wa-check input{width:18px;height:18px}
.wa-info{font-size:13px;color:#15120F;font-weight:700}
.wa-p{font-size:12.5px;color:#9a3b14;font-weight:700;margin:6px 0 0}
.wa-foot{display:flex;gap:8px;justify-content:flex-end;margin-top:9px}
.wa-b{border:none;border-radius:10px;padding:8px 13px;font-weight:800;font-size:14px;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px}
.wa-b.ok{background:#15120F;color:#FBF8F2}.wa-b.ok:disabled{opacity:.35;cursor:default}
.wa-b.no{background:transparent;color:#6E6A63}
.wa-done{display:flex;align-items:center;gap:8px;color:#0F7A43;font-weight:800;font-size:14px;margin-top:10px}
`;

const HEAD: Record<WorkerActionDraft['type'], [string, typeof Play, string]> = {
  demander_conge: ['Demande de congé', CalendarOff, 'Envoyer la demande'],
  commencer_pointage: ['Commencer le pointage', Play, 'Je commence'],
  terminer_pointage: ['Terminer le pointage', Square, 'J’ai fini'],
  signaler_reserve: ['Signaler une réserve', AlertTriangle, 'Confirmer'],
  ranger_photo: ['Ranger sur le chantier', FolderInput, 'Confirmer'],
};
const hhmm = (iso: string) => (iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }) : '');

interface Props { extra: WorkerActionExtra; execute: WorkerActionExecutor; onDone?: () => void }

export default function WorkerActionCard({ extra, execute, onDone }: Props) {
  const [d, setD] = useState<WorkerActionDraft>(extra.workerAction.draft);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const snap: WorkerSnapshot = useMemo(() => ({ aujourdhui: '', chantiers: extra.chantiers, semaine: [], planning: [] }), [extra.chantiers]);
  const live: WorkerLive = useMemo(() => ({
    enCours: extra.workerAction.draft.type === 'terminer_pointage' && extra.workerAction.draft.depuis
      ? { chantier_id: '', chantier: extra.workerAction.draft.chantier, depuis: extra.workerAction.draft.depuis } : null,
    lignes: extra.workerAction.draft.type === 'signaler_reserve' ? extra.workerAction.draft.choix
      : extra.workerAction.draft.type === 'ranger_photo' ? extra.workerAction.draft.lignes : [],
  }), [extra.workerAction.draft]);
  // Un « déjà en cours » vu par le serveur reste un blocage ici.
  const problems = useMemo(() => {
    const p = checkWorkerAction(d, snap, live);
    return d.type === 'commencer_pointage' ? Array.from(new Set([...p, ...extra.workerAction.problems.filter((x) => x.startsWith('Un pointage'))])) : p;
  }, [d, snap, live, extra.workerAction.problems]);
  const set = (patch: Partial<WorkerActionDraft>) => setD((x) => ({ ...x, ...patch } as WorkerActionDraft));

  if (done) return <div className="wa-done"><style>{CSS}</style><CheckCircle2 className="h-5 w-5" /> {done}</div>;
  if (cancelled) return <p className="wa-info" style={{ fontWeight: 600, color: '#6E6A63', fontSize: 12.5 }}>Annulé : rien n’a été fait.</p>;
  const [title, Icon, confirm] = HEAD[d.type];

  let body: React.ReactNode = null;
  switch (d.type) {
    case 'demander_conge':
      body = (<>
        <div><label>Type</label>
          <select value={d.conge_type} onChange={(e) => set({ conge_type: e.target.value })}>
            {LEAVE_KINDS.map((k) => <option key={k} value={k}>{LEAVE_LABEL[k]}</option>)}
          </select>
        </div>
        <div className="wa-row">
          <div><label>Du</label><input type="date" value={d.du} className={d.du ? '' : 'todo'} onChange={(e) => set({ du: e.target.value, au: d.au && d.au >= e.target.value ? d.au : e.target.value })} /></div>
          <div><label>Au</label><input type="date" value={d.au} className={d.au ? '' : 'todo'} onChange={(e) => set({ au: e.target.value })} /></div>
        </div>
        <div><label>Mot pour le bureau (facultatif)</label><input value={d.note} onChange={(e) => set({ note: e.target.value })} /></div>
      </>);
      break;
    case 'commencer_pointage':
      body = (
        <div><label>Chantier</label>
          <select value={d.worksite_id ?? ''} className={d.worksite_id ? '' : 'todo'} onChange={(e) => set({ worksite_id: e.target.value || null })} aria-label="Chantier">
            <option value="">{d.chantier_texte ? `« ${d.chantier_texte} » → choisir…` : 'Choisir le chantier…'}</option>
            {extra.chantiers.map((c) => <option key={c.id} value={c.id}>{c.nom}{c.ville ? ` · ${c.ville}` : ''}</option>)}
          </select>
        </div>
      );
      break;
    case 'terminer_pointage':
      body = (<>
        {d.depuis && <p className="wa-info">{d.chantier} · depuis {hhmm(d.depuis)}</p>}
        <div><label>Heure de fin (vide = maintenant)</label><input type="time" value={d.fin} onChange={(e) => set({ fin: e.target.value })} /></div>
      </>);
      break;
    case 'signaler_reserve':
      body = (<>
        {d.choix.length > 1 ? (
          <div><label>Chantier</label>
            <select value={d.entry_id ?? ''} className={d.entry_id ? '' : 'todo'} onChange={(e) => set({ entry_id: e.target.value || null })}>
              <option value="">Choisir…</option>
              {d.choix.map((c) => <option key={c.id} value={c.id}>{c.chantier} · {c.debut}–{c.fin}</option>)}
            </select>
          </div>
        ) : d.choix[0] ? <p className="wa-info">{d.choix[0].chantier} · {d.choix[0].debut}–{d.choix[0].fin}</p> : null}
        <div><label>Détail des réserves (facultatif)</label>
          <textarea rows={2} value={d.detail} placeholder="Ex. : fissure mur sud" onChange={(e) => set({ detail: e.target.value })} />
        </div>
      </>);
      break;
 case 'ranger_photo':
      body = (<>
        <div><label>Chantier</label>
          <select value={d.worksite_id ?? ''} className={d.worksite_id ? '' : 'todo'} onChange={(e) => set({ worksite_id: e.target.value || null })} aria-label="Chantier">
            <option value="">{d.chantier_texte ? `« ${d.chantier_texte} » → choisir…` : 'Choisir le chantier…'}</option>
            {extra.chantiers.map((c) => <option key={c.id} value={c.id}>{c.nom}{c.ville ? ` · ${c.ville}` : ''}</option>)}
          </select>
        </div>
        <label className="wa-check"><input type="checkbox" checked={d.reserve} onChange={(e) => set({ reserve: e.target.checked })} /> Avec réserve</label>
        {d.reserve && (
          <div><label>Détail des réserves (facultatif)</label>
            <textarea rows={2} value={d.detail} placeholder="Ex. : fissure mur sud" onChange={(e) => set({ detail: e.target.value })} />
          </div>
        )}
      </>);
      break;
  }

  return (
    <div className="wa" data-testid="worker-action-card" data-type={d.type}>
      <style>{CSS}</style>
      <p className="wa-h"><span className="i"><Icon className="h-3.5 w-3.5" /></span>{title}</p>
      {extra.attachment && <p className="wa-att"><Paperclip className="h-3.5 w-3.5" /> {extra.attachment.name}</p>}
      <div className="wa-f">{body}</div>
      {problems.map((p) => <p key={p} className="wa-p">{p}</p>)}
      {err && <p className="wa-p">{err}</p>}
      <div className="wa-foot">
        <button type="button" className="wa-b no" disabled={busy} onClick={() => setCancelled(true)}>Annuler</button>
        <button
          type="button" className="wa-b ok" disabled={busy || problems.length > 0} data-testid="worker-action-confirm"
          onClick={async () => {
            setBusy(true); setErr(null);
            const r = await execute(d, extra.attachment);
            setBusy(false);
            if (r.ok) { setDone(r.message); onDone?.(); } else setErr(r.message);
          }}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {confirm}
        </button>
      </div>
    </div>
  );
}
