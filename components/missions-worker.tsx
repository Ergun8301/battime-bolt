'use client';

// Lot 4 — côté SALARIÉ, dans « Ma journée » :
//  - les réunions du jour (carte rose, au-dessus des chantiers) : ni heures, ni
//    « Je commence », ni « Envoyer » — une réunion ne compte pas comme heures ;
//  - « Tâches du jour » : les tâches que le bureau a ajoutées, et une petite case
//    « Fait » (set_day_task_done). Hors-ligne : la case attend le réseau.
// Lecture À PART de celle de la journée (jamais de « Impossible de charger tes
// données » à cause d'elle), relue au retour sur l'appli (notification touchée,
// onglet repris). Rien ne s'affiche tant que la migration n'est pas passée, ni
// quand il n'y a rien.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchMyMissions, setTaskDone, type DayTask, type Meeting } from '@/lib/missions';
import { keep } from '@/lib/same';
import { MEETING_TINT, meetingsFor, meetingTimeLabel, sortTasks, taskPartInfo } from '@/supabase/functions/_shared/missions';

const CSS = `
.bt-meet{background:${MEETING_TINT.bg};border:1.5px solid ${MEETING_TINT.edge};border-radius:14px;padding:11px 14px;margin-bottom:9px}
.bt-meet-k{font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:${MEETING_TINT.edge};font-weight:800;margin-bottom:3px}
.bt-meet-t{font-size:15.5px;font-weight:800;letter-spacing:-.01em;color:#15120F;overflow-wrap:anywhere}
.bt-meet-s{font-size:12.5px;font-weight:600;color:${MEETING_TINT.ink};margin-top:2px;overflow-wrap:anywhere}
.bt-tasks{margin:14px 0 6px}
.bt-tasks-h{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.bt-tasks-n{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:800;color:#6E6A63}
.bt-task{display:flex;align-items:center;gap:9px;background:#fff;border:1px solid rgba(21,18,15,.12);border-radius:12px;padding:8px 8px 8px 12px;margin-bottom:7px}
.bt-task.done{background:#F7F4EC}
.bt-task.done .bt-task-t{color:#6E6A63;text-decoration:line-through}
.bt-task-t{flex:1;min-width:0;font-size:14px;font-weight:700;color:#15120F;overflow-wrap:anywhere;line-height:1.25}
.bt-task-p{flex:none;font-size:10.5px;font-weight:800;padding:2px 6px;border-radius:6px;border:1px solid;color:#15120F}
.bt-task-ok{flex:none;display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 11px;border-radius:10px;border:1.5px solid rgba(21,18,15,.25);background:#fff;font-family:inherit;font-size:13px;font-weight:800;color:#15120F;cursor:pointer}
.bt-task-ok .bx{width:16px;height:16px;border-radius:4px;border:1.5px solid #15120F;display:inline-flex;align-items:center;justify-content:center;background:#fff}
.bt-task-ok[aria-pressed="true"]{border-color:#15120F}
.bt-task-ok[aria-pressed="true"] .bx{background:#15120F;color:#FFC21A}
.bt-task-ok:disabled{opacity:.55;cursor:default}
.bt-tasks-off{font-size:12px;font-weight:600;color:#6E6A63;margin:0 0 7px}
`;
const CSS_HTML = { __html: CSS };

interface State { on: boolean; tasks: DayTask[]; meetings: Meeting[]; participants: Record<string, string[]> }
const EMPTY: State = { on: false, tasks: [], meetings: [], participants: {} };

/** Mes tâches et mes réunions d'un jour, relues au retour sur l'appli. */
export function useMyMissions(user: { id: string; company_id: string; role?: string } | null | undefined, date: string) {
  const [st, setSt] = useState<State>(EMPTY);
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!user?.id || !user.company_id) return;
    const n = ++seq.current;
    const r = await fetchMyMissions(user.id, user.company_id, date, date);
    if (n !== seq.current) return;
    if (r === 'missing') { setSt(EMPTY); return; }
    if (!r) return; // lecture en échec : on garde ce qu'on sait, sans message
    setSt((prev) => keep(prev, { on: r.on, tasks: r.tasks, meetings: r.meetings, participants: r.participants }));
  }, [user?.id, user?.company_id, date]);
  useEffect(() => {
    // Jour changé : on n'affiche pas les tâches de la veille le temps de relire.
    setSt((prev) => (prev.tasks.some((t) => t.work_date !== date) || prev.meetings.some((m) => m.meeting_date !== date) ? { ...prev, tasks: [], meetings: [] } : prev));
    load();
    const onBack = () => { if (document.visibilityState !== 'hidden') load(); };
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    return () => { document.removeEventListener('visibilitychange', onBack); window.removeEventListener('focus', onBack); };
  }, [load, date]);

  const [busyId, setBusyId] = useState<string | null>(null);
  const toggle = async (t: DayTask) => {
    if (busyId) return;
    const done = !t.done_at;
    setBusyId(t.id);
    // Optimiste : la case change tout de suite, et revient si le serveur refuse.
    setSt((prev) => ({ ...prev, tasks: prev.tasks.map((x) => (x.id === t.id ? { ...x, done_at: done ? new Date().toISOString() : null } : x)) }));
    try {
      const r = await setTaskDone(t.id, done);
      if (r.ok) {
        if (r.task) setSt((prev) => ({ ...prev, tasks: prev.tasks.map((x) => (x.id === t.id ? { ...x, ...r.task } : x)) }));
        return;
      }
      setSt((prev) => ({ ...prev, tasks: prev.tasks.map((x) => (x.id === t.id ? { ...x, done_at: t.done_at } : x)) }));
      toast.error(r.message || 'Impossible d’enregistrer. Réessaie.');
      if (r.gone) load();
    } finally {
      setBusyId(null);
    }
  };
  const teamMember = user?.role !== 'admin';
  return {
    on: st.on,
    tasks: sortTasks(st.tasks.filter((t) => t.work_date === date)),
    meetings: user ? meetingsFor(st.meetings, st.participants, user.id, date, teamMember) : [],
    busyId,
    toggle,
  };
}

/** Les réunions du jour : une carte rose chacune, sans heures à saisir. */
export function MyMeetings({ meetings }: { meetings: Meeting[] }) {
  if (!meetings.length) return null;
  return (
    <div data-testid="my-meetings">
      <style dangerouslySetInnerHTML={CSS_HTML} />
      {meetings.map((m) => (
        <div key={m.id} className="bt-meet" data-testid="my-meeting">
          <div className="bt-meet-k"><span aria-hidden="true">👥 </span>Réunion · {meetingTimeLabel(m.start_time, m.end_time)}</div>
          <div className="bt-meet-t">{m.title}</div>
          {(m.place || m.all_team) && (
            <div className="bt-meet-s">{[m.place, m.all_team ? 'Toute l’équipe' : null].filter(Boolean).join(' · ')}</div>
          )}
        </div>
      ))}
    </div>
  );
}

/** « Tâches du jour » : une petite case « Fait » par tâche. */
export function MyTasks({ tasks, online, busyId, onToggle }: { tasks: DayTask[]; online: boolean; busyId: string | null; onToggle: (t: DayTask) => void }) {
  if (!tasks.length) return null;
  const done = tasks.filter((t) => t.done_at).length;
  return (
    <div className="bt-tasks" data-testid="my-tasks">
      <style dangerouslySetInnerHTML={CSS_HTML} />
      <div className="bt-tasks-h">
        <div className="bt-sec">Tâches du jour</div>
        <span className="bt-tasks-n">{done}/{tasks.length}</span>
      </div>
      {!online && <p className="bt-tasks-off" data-testid="my-tasks-offline">Hors-ligne : coche quand le réseau revient.</p>}
      {tasks.map((t) => {
        const pi = taskPartInfo(t.part);
        return (
          <div key={t.id} className={`bt-task${t.done_at ? ' done' : ''}`} data-testid="my-task" data-done={t.done_at ? '1' : '0'}>
            {pi && <span className="bt-task-p" style={{ background: pi.bg, borderColor: pi.edge }}>{pi.label}</span>}
            <span className="bt-task-t">{t.text}</span>
            <button type="button" className="bt-task-ok" aria-pressed={!!t.done_at} disabled={!online || busyId === t.id} data-testid="my-task-done"
              aria-label={`${t.text} : ${t.done_at ? 'fait (toucher pour décocher)' : 'pas fait'}`} onClick={() => onToggle(t)}>
              <span className="bx">{busyId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : t.done_at ? <Check className="h-3 w-3" strokeWidth={3.5} /> : null}</span>
              Fait
            </button>
          </div>
        );
      })}
    </div>
  );
}
