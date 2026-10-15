'use client';

// Lot 4 — côté SALARIÉ, dans « Ma journée » :
//  - les réunions du jour (carte rose, au-dessus des chantiers) : ni heures, ni
//    « Je commence », ni « Envoyer » — une réunion ne compte pas comme heures ;
//  - « Tâches du jour » : les tâches que le bureau a ajoutées, et une petite case
//    « Fait » (set_day_task_done). Hors-ligne : la case attend le réseau.
//    Lot 9 : une tâche avec heure affiche « 10:00–11:30 » (teinté comme son
//    moment) ; celles avec heure d'abord, par heure, puis les autres.
// Lecture À PART de celle de la journée (jamais de « Impossible de charger tes
// données » à cause d'elle), relue au retour sur l'appli (notification touchée,
// onglet repris). Rien ne s'affiche tant que la migration n'est pas passée, ni
// quand il n'y a rien.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchMyMissions, setTaskDone, type DayTask, type Meeting } from '@/lib/missions';
import { keep } from '@/lib/same';
import { meetingsFor, meetingTimeLabel, sortTasks, taskPartInfo, taskTimeLabel } from '@/supabase/functions/_shared/missions';

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
      <div className="bt-tasks-h">
        <div className="bt-sec">Tâches du jour</div>
        <span className="bt-tasks-n">{done}/{tasks.length}</span>
      </div>
      {!online && <p className="bt-tasks-off" data-testid="my-tasks-offline">Hors-ligne : coche quand le réseau revient.</p>}
      {tasks.map((t) => {
        const pi = taskPartInfo(t.part);
        const when = taskTimeLabel(t);
        return (
          <div key={t.id} className={`bt-task${t.done_at ? ' done' : ''}`} data-testid="my-task" data-done={t.done_at ? '1' : '0'}>
            {when ? <span className="bt-task-p tm" style={pi ? { background: pi.bg, borderColor: pi.edge } : undefined} data-testid="my-task-time">{when}</span>
              : pi && <span className="bt-task-p" style={{ background: pi.bg, borderColor: pi.edge }}>{pi.label}</span>}
            <span className="bt-task-t">{t.text}</span>
            <button type="button" className="bt-task-ok" aria-pressed={!!t.done_at} disabled={!online || busyId === t.id} data-testid="my-task-done"
              aria-label={`${when ? `${when} · ` : ''}${t.text} : ${t.done_at ? 'fait (toucher pour décocher)' : 'pas fait'}`} onClick={() => onToggle(t)}>
              <span className="bx">{busyId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : t.done_at ? <Check className="h-3 w-3" strokeWidth={3.5} /> : null}</span>
              Fait
            </button>
          </div>
        );
      })}
    </div>
  );
}
