'use client';

// Lot 4 — côté BUREAU : les tâches courtes de la journée d'un salarié et les
// réunions, dans le « + » du planning (aucune page neuve, aucun bouton de barre).
//  - AddKindSwitch : « Intervention · Tâche · Réunion », petites pastilles en tête
//    de la fenêtre « + » (seulement quand la migration est passée) ;
//  - DayTasksPanel : les tâches du jour (fait / pas fait), l'ajout, les tâches
//    habituelles ; pas de renommage (on retire et on remet) ;
//  - MeetingForm : titre, date, heure, lieu, participants, notification ;
//  - MeetingChip / TasksBadge : ce que montre la case du planning ;
//  - PrintTasks / MeetingChip print : la feuille imprimée.
// Les écritures et la notification sont dans lib/missions.ts. Rien ici ne touche
// aux heures : une réunion n'est jamais une intervention.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { TimeField, TIME_HINT } from '@/components/time-field';
import { parisHHmm } from '@/lib/utils';
import {
  addDayTask, addTemplate, deleteDayTask, deleteMeeting, deleteTemplate, fetchTemplates, notifyMeeting, saveMeeting,
  type DayTask, type Meeting, type TaskTemplate,
} from '@/lib/missions';
import {
  MEETING_PLACE_MAX, MEETING_TINT, MEETING_TITLE_MAX, meetingTimeLabel, sortTasks, TASK_TEXT_MAX, taskPartInfo, taskProgress, hhmm,
  validateMeeting, type MeetingState, type TaskPart,
} from '@/supabase/functions/_shared/missions';

export type AddKind = 'intervention' | 'tache' | 'reunion';

// Écran ET papier : la page du planning garde ce CSS monté pendant l'impression.
export const MISSIONS_CSS = `
.bt-ms-kind{display:flex;gap:6px;margin:2px 0 4px}
.bt-ms-kind button{flex:1;height:28px;border-radius:8px;border:1.5px solid rgba(21,18,15,.16);background:#FAF7F0;font:inherit;font-size:12.5px;font-weight:800;color:#15120F;cursor:pointer;padding:0 6px;white-space:nowrap}
.bt-ms-kind button[aria-pressed="true"]{background:#FFC21A;border-color:#15120F}
.bt-ms-kind button:focus-visible,.bt-ms-pill:focus-visible,.bt-ms-chip:focus-visible{outline:2px solid #FFC21A;outline-offset:1px}
.bt-ms{display:flex;flex-direction:column;gap:12px;padding-top:4px;font-size:13px;color:#15120F}
.bt-ms-lbl{display:block;font-size:12px;font-weight:800;color:#15120F;margin-bottom:5px}
.bt-ms-lbl small{font-weight:600;color:#6E6A63;margin-left:4px}
.bt-ms-muted{font-size:12px;color:#6E6A63;font-weight:600;line-height:1.35}
.bt-ms-err{font-size:12.5px;font-weight:700;color:#C0461F}
.bt-ms-input{width:100%;height:36px;border-radius:9px;border:1.5px solid rgba(21,18,15,.18);background:#fff;font:inherit;font-size:13.5px;font-weight:600;color:#15120F;padding:0 10px;outline:none;min-width:0}
.bt-ms-input:focus{border-color:#15120F}
.bt-ms-row{display:flex;gap:6px;align-items:center;min-width:0}
.bt-ms-pills{display:flex;flex-wrap:wrap;gap:5px}
.bt-ms-pill{height:26px;padding:0 9px;border-radius:999px;border:1.5px solid rgba(21,18,15,.16);background:#fff;font:inherit;font-size:12px;font-weight:700;color:#15120F;cursor:pointer;white-space:nowrap}
.bt-ms-pill[aria-pressed="true"]{border-color:#15120F;box-shadow:inset 0 0 0 1px #15120F}
.bt-ms-btn{height:34px;padding:0 13px;border-radius:9px;border:0;background:#15120F;color:#fff;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;flex:none}
.bt-ms-btn:disabled{opacity:.6;cursor:default}
.bt-ms-btn.ghost{background:#fff;color:#15120F;border:1.5px solid rgba(21,18,15,.2)}
.bt-ms-btn.danger{background:#fff;color:#C0461F;border:1.5px solid rgba(192,70,31,.45)}
.bt-ms-chk{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700;color:#15120F;cursor:pointer}
.bt-ms-chk input{width:15px;height:15px;accent-color:#15120F;flex:none}
.bt-ms-list{display:flex;flex-direction:column;border:1px solid rgba(21,18,15,.12);border-radius:10px;overflow:hidden}
.bt-ms-task{display:flex;align-items:center;gap:7px;padding:7px 9px;border-top:1px solid rgba(21,18,15,.08);min-width:0}
.bt-ms-task:first-child{border-top:0}
.bt-ms-task .t{flex:1;min-width:0;font-weight:700;overflow-wrap:anywhere;line-height:1.25}
.bt-ms-part{flex:none;font-size:10.5px;font-weight:800;padding:2px 6px;border-radius:6px;border:1px solid;color:#15120F}
.bt-ms-st{flex:none;font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:800;white-space:nowrap}
.bt-ms-st.done{color:#15120F}
.bt-ms-st.todo{color:#8a8378}
.bt-ms-x{flex:none;width:24px;height:24px;border:0;border-radius:6px;background:none;color:#8a8378;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.bt-ms-x:hover{background:rgba(21,18,15,.06);color:#15120F}
.bt-ms-confirm{display:flex;align-items:center;gap:5px;flex:none;font-size:11.5px;font-weight:800}
.bt-ms-confirm button{height:24px;padding:0 8px;border-radius:6px;border:1.5px solid rgba(21,18,15,.2);background:#fff;font:inherit;font-size:11.5px;font-weight:800;cursor:pointer}
.bt-ms-confirm button.yes{background:#15120F;color:#fff;border-color:#15120F}
.bt-ms-chips{display:flex;flex-wrap:wrap;gap:5px}
.bt-ms-chip{display:inline-flex;align-items:center;gap:2px;max-width:100%;height:26px;border-radius:7px;border:1px dashed rgba(21,18,15,.3);background:#FBF6EA;font:inherit;font-size:12px;font-weight:700;color:#15120F;padding:0 2px 0 8px}
.bt-ms-chip>span{cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.bt-ms-chip .bt-ms-x{width:20px;height:20px}
.bt-ms-people{max-height:150px;overflow:auto;border:1px solid rgba(21,18,15,.12);border-radius:9px;padding:4px 8px;display:flex;flex-direction:column;gap:2px}
.bt-ms-people .bt-ms-chk{padding:3px 0;font-weight:600}
.bt-ms-times{display:grid;grid-template-columns:1fr 1fr;gap:8px}
/* La case du planning : la réunion (couleur à part, bordure PLEINE, pas de barre :
   jamais prise pour un chantier) et le compteur de tâches (neutre : le vert reste
   au pointage en direct). Une ligne chacun, coupée par « … ». */
.bt-pl-meet{display:flex;align-items:center;gap:4px;width:100%;min-width:0;border-radius:8px;padding:4px 7px;background:${MEETING_TINT.bg};border:1.5px solid ${MEETING_TINT.edge};color:#15120F;font-family:'Archivo',sans-serif;font-size:11.5px;font-weight:800;line-height:1.2;text-align:left;cursor:pointer}
.bt-pl-meet .h{flex:none;font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:800;color:${MEETING_TINT.edge}}
.bt-pl-meet .nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bt-pl-meet .pl{font-weight:600;color:${MEETING_TINT.ink}}
.bt-pl-meet.inert{cursor:default}
.bt-pl-meet.big{padding:7px 10px;font-size:12.5px}
.bt-pl-tasks{align-self:flex-start;display:inline-flex;align-items:center;gap:4px;border:0;border-radius:6px;padding:2px 7px;background:#EFEAE0;color:#3D382F;font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:800;cursor:pointer;white-space:nowrap}
.bt-pl-tasks.inert{cursor:default}
.bt-print-tasks{display:flex;flex-direction:column;gap:1px;font-size:10.5px;font-weight:700;color:#15120F;line-height:1.25}
.bt-print-tasks .k{font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:800;color:#6E6A63;text-transform:uppercase;letter-spacing:.04em}
.bt-print-tasks .ln{overflow-wrap:anywhere}
.bt-print-tasks .pt{font-weight:600;color:${MEETING_TINT.ink}}
.bt-print .bt-pl-meet{cursor:default}
.bt-print .bt-pl-meet .nm{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
@media print{.bt-print--day .bt-pl-cellfill>.bt-print-tasks{flex:0 0 100%}}
`;

/** Les trois pastilles de la fenêtre « + ». Une pastille par table présente. */
export function AddKindSwitch({ value, onChange, tasksOn, meetingsOn }: { value: AddKind; onChange: (k: AddKind) => void; tasksOn: boolean; meetingsOn: boolean }) {
  const kinds: { k: AddKind; label: string; on: boolean }[] = [
    { k: 'intervention', label: 'Intervention', on: true },
    { k: 'tache', label: 'Tâche', on: tasksOn },
    { k: 'reunion', label: 'Réunion', on: meetingsOn },
  ];
  return (
    <div className="bt-ms-kind" role="group" aria-label="Ajouter" data-testid="add-kind">
      {kinds.filter((x) => x.on).map((x) => (
        <button key={x.k} type="button" aria-pressed={value === x.k} data-testid={`add-kind-${x.k}`} onClick={() => onChange(x.k)}>{x.label}</button>
      ))}
    </div>
  );
}

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

/** Une réunion dans une case (une ligne) : « 👥 14:00 Point sécurité ». */
export function MeetingChip({ m, onOpen, inert = false, big = false, print = false }: { m: Meeting; onOpen?: () => void; inert?: boolean; big?: boolean; print?: boolean }) {
  const when = meetingTimeLabel(m.start_time, m.end_time);
  const full = `Réunion · ${when} · ${m.title}${m.place ? ` · ${m.place}` : ''}${m.all_team ? ' · toute l’équipe' : ''} — ne compte pas dans les heures`;
  const body: ReactNode = (
    <>
      <span aria-hidden="true">👥</span>
      <span className="h">{print || big ? when : hhmm(m.start_time)}</span>
      <span className="nm">{big && 'Réunion · '}{m.title}{(print || big) && m.place ? <span className="pl"> · {m.place}</span> : null}</span>
    </>
  );
  if (print) return <div className="bt-pl-meet" data-testid="print-meeting" data-meeting={m.id}>{body}</div>;
  return (
    <button type="button" className={`bt-pl-meet${inert ? ' inert' : ''}${big ? ' big' : ''}`} title={full} aria-label={full} data-testid="meeting-chip" data-meeting={m.id}
      onPointerDown={stop} onClick={(e) => { e.stopPropagation(); if (inert) { toast('Réunion / tâches — hors sélection'); return; } onOpen?.(); }}>
      {body}
    </button>
  );
}

/** « ☐ 1/3 tâches » — « ✓ 3/3 tâches » quand tout est fait. */
export function TasksBadge({ tasks, onOpen, inert = false }: { tasks: { done_at: string | null }[]; onOpen?: () => void; inert?: boolean }) {
  const p = taskProgress(tasks);
  const all = p.total > 0 && p.done === p.total;
  return (
    <button type="button" className={`bt-pl-tasks${inert ? ' inert' : ''}`} data-testid="tasks-badge" data-done={p.done} data-total={p.total}
      title={`${p.done} faite(s) sur ${p.total} — cliquer pour voir les tâches`}
      onPointerDown={stop} onClick={(e) => { e.stopPropagation(); if (inert) { toast('Réunion / tâches — hors sélection'); return; } onOpen?.(); }}>
      {all ? '✓' : '☐'} {p.label} {p.total > 1 ? 'tâches' : 'tâche'}
    </button>
  );
}

/** Sur la feuille imprimée, sous la case : « ☐ Ranger le dépôt · Matin ». */
export function PrintTasks({ tasks }: { tasks: DayTask[] }) {
  if (!tasks.length) return null;
  return (
    <div className="bt-print-tasks" data-testid="print-tasks">
      <span className="k">Tâches</span>
      {sortTasks(tasks).map((t) => {
        const part = taskPartInfo(t.part);
        return <span key={t.id} className="ln" data-done={t.done_at ? '1' : '0'}>{t.done_at ? '☑' : '☐'} {t.text}{part && <span className="pt"> · {part.label}</span>}</span>;
      })}
    </div>
  );
}

const PARTS: { key: TaskPart; label: string }[] = [{ key: null, label: '—' }, { key: 'matin', label: 'Matin' }, { key: 'apres-midi', label: 'Après-midi' }, { key: 'soir', label: 'Soir' }];

/**
 * Les tâches du jour d'un salarié : la liste (fait / pas fait), l'ajout, les
 * tâches habituelles. `canAdd` faux (jour d'absence) : on voit et on retire,
 * on n'ajoute pas.
 */
export function DayTasksPanel({ companyId, workerId, date, tasks, canAdd, onChanged }: {
  companyId: string; workerId: string; date: string; tasks: DayTask[]; canAdd: boolean; onChanged: () => Promise<void> | void;
}) {
  const [text, setText] = useState('');
  const [part, setPart] = useState<TaskPart>(null);
  const [keepIt, setKeepIt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<TaskTemplate[] | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadTemplates = async () => setTemplates(await fetchTemplates(companyId));
  useEffect(() => { if (canAdd) loadTemplates(); }, [companyId, canAdd]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => sortTasks(tasks), [tasks]);

  const add = async (raw: string, keep: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      const r = await addDayTask({ companyId, userId: workerId, date, text: raw, part });
      if (!r.ok) { toast.error(r.message || "Impossible d'ajouter la tâche."); return; }
      if (keep) { await addTemplate(companyId, raw); await loadTemplates(); }
      setText('');
      await onChanged();
      inputRef.current?.focus();
    } finally {
      setSaving(false);
    }
  };
  const remove = async (id: string) => {
    setConfirmId(null);
    const r = await deleteDayTask(companyId, id);
    if (!r.ok) toast.error(r.message || 'Impossible de retirer la tâche.');
    await onChanged();
  };
  const dropTemplate = async (id: string) => {
    const r = await deleteTemplate(companyId, id);
    if (!r.ok) toast.error(r.message || 'Impossible de retirer la tâche habituelle.');
    await loadTemplates();
  };

  return (
    <div className="bt-ms" data-testid="tasks-panel">
      {list.length > 0 ? (
        <div className="bt-ms-list" data-testid="tasks-list">
          {list.map((t) => {
            const pi = taskPartInfo(t.part);
            return (
              <div key={t.id} className="bt-ms-task" data-testid="task-row" data-done={t.done_at ? '1' : '0'}>
                {pi && <span className="bt-ms-part" style={{ background: pi.bg, borderColor: pi.edge }}>{pi.label}</span>}
                <span className="t">{t.text}</span>
                {confirmId === t.id ? (
                  <span className="bt-ms-confirm">Retirer ?
                    <button type="button" className="yes" data-testid="task-del-yes" onClick={() => remove(t.id)}>Oui</button>
                    <button type="button" onClick={() => setConfirmId(null)}>Non</button>
                  </span>
                ) : (
                  <>
                    <span className={`bt-ms-st ${t.done_at ? 'done' : 'todo'}`} data-testid="task-status">{t.done_at ? `✓ Fait ${parisHHmm(t.done_at)}` : 'Pas fait'}</span>
                    <button type="button" className="bt-ms-x" aria-label={`Retirer « ${t.text} »`} title="Retirer" data-testid="task-del" onClick={() => setConfirmId(t.id)}><X className="h-3.5 w-3.5" /></button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="bt-ms-muted">{canAdd ? 'Aucune tâche ce jour-là.' : 'Aucune tâche.'}</p>
      )}
      {!canAdd ? (
        <p className="bt-ms-muted" data-testid="tasks-absent">Absent ce jour-là : pas d’ajout.</p>
      ) : (
        <>
          <form className="bt-ms" style={{ paddingTop: 0, gap: 8 }} onSubmit={(e) => { e.preventDefault(); add(text, keepIt); }}>
            <label className="bt-ms-lbl" htmlFor="bt-ms-new" style={{ marginBottom: 0 }}>Nouvelle tâche</label>
            <div className="bt-ms-row">
              <input id="bt-ms-new" ref={inputRef} className="bt-ms-input" data-testid="task-text" maxLength={TASK_TEXT_MAX} value={text}
                placeholder="Ex : ranger le dépôt" onChange={(e) => setText(e.target.value)} autoComplete="off" />
              <button type="submit" className="bt-ms-btn" data-testid="task-add" disabled={saving || !text.trim()}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Ajouter
              </button>
            </div>
            <div className="bt-ms-pills" role="group" aria-label="Moment (facultatif)">
              {PARTS.map((p) => {
                const pi = taskPartInfo(p.key);
                return (
                  <button key={p.label} type="button" className="bt-ms-pill" aria-pressed={part === p.key} data-testid={`task-part-${p.key ?? 'aucun'}`}
                    style={pi ? { background: pi.bg } : undefined} title={p.key ? p.label : 'Sans moment'} onClick={() => setPart(p.key)}>{p.label}</button>
                );
              })}
            </div>
            <label className="bt-ms-chk">
              <input type="checkbox" checked={keepIt} onChange={(e) => setKeepIt(e.target.checked)} data-testid="task-keep" />
              Garder dans mes tâches habituelles
            </label>
          </form>
          {templates && templates.length > 0 && (
            <div>
              <span className="bt-ms-lbl">Tâches habituelles <small>un clic l’ajoute à ce jour</small></span>
              <div className="bt-ms-chips" data-testid="task-templates">
                {templates.map((tp) => (
                  <span key={tp.id} className="bt-ms-chip" data-testid="task-template">
                    <span role="button" tabIndex={0} title={`Ajouter « ${tp.text} »`}
                      onClick={() => add(tp.text, false)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); add(tp.text, false); } }}>{tp.text}</span>
                    <button type="button" className="bt-ms-x" aria-label={`Retirer « ${tp.text} » des tâches habituelles`} title="Retirer de la liste" onClick={() => dropTemplate(tp.id)}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * La réunion : nouvelle (depuis le « + » d'une case, le salarié de la case
 * coché) ou existante (depuis sa pastille). Ne compte jamais dans les heures.
 */
export function MeetingForm({ workers, date, defaultWorkerId, meeting, participants, companyName, onSaved }: {
  workers: { id: string; name: string }[];
  date: string;
  defaultWorkerId?: string | null;
  meeting?: Meeting | null;
  participants?: string[];
  companyName: string;
  onSaved: () => Promise<void> | void;
}) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [title, setTitle] = useState(meeting?.title || '');
  const [day, setDay] = useState(meeting?.meeting_date || date);
  const [start, setStart] = useState(hhmm(meeting?.start_time));
  const [end, setEnd] = useState(hhmm(meeting?.end_time));
  const [place, setPlace] = useState(meeting?.place || '');
  const [allTeam, setAllTeam] = useState(!!meeting?.all_team);
  const [picked, setPicked] = useState<string[]>(() => (meeting ? (participants || []) : defaultWorkerId ? [defaultWorkerId] : []));
  const [notify, setNotify] = useState((meeting?.meeting_date || date) >= today);
  const [badS, setBadS] = useState(false);
  const [badE, setBadE] = useState(false);
  const bad = badS || badE;
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const team = workers.map((w) => w.id);
  const prev: MeetingState | null = meeting ? {
    title: meeting.title, date: meeting.meeting_date, start: hhmm(meeting.start_time), end: hhmm(meeting.end_time) || null,
    place: meeting.place, allTeam: meeting.all_team, userIds: participants || [],
  } : null;
  const state: MeetingState = { title, date: day, start, end: end || null, place: place || null, allTeam, userIds: picked };

  const tell = async (meetingId: string, next: MeetingState | null, what: string) => {
    if (!notify) { toast.success(what); return; }
    const r = await notifyMeeting({ meetingId, companyName, prev, next, team });
    if (r.called === 0) toast.success(what);
    else if (r.error) toast.warning(`${what}, notification impossible`);
    else if (r.sent > 0) toast.success(`${what} — notification envoyée (${r.sent} appareil${r.sent > 1 ? 's' : ''})`);
    else toast.success(`${what}. Aucun participant n’a activé les notifications : ils la verront dans « Ma journée ».`);
  };
  const save = async () => {
    if (saving) return;
    const err = bad ? `Heure non comprise. ${TIME_HINT}` : validateMeeting({ title, date: day, start, end, place, allTeam, userIds: picked });
    setError(err);
    if (err) return;
    setSaving(true);
    try {
      const r = await saveMeeting(meeting?.id ?? null, state);
      if (!r.ok || !r.meeting) { setError(r.message || "Impossible d'enregistrer la réunion."); return; }
      await onSaved();
      await tell(r.meeting.id, state, 'Réunion enregistrée');
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!meeting || saving) return;
    setSaving(true);
    try {
      const r = await deleteMeeting(meeting.id);
      if (!r.ok) { setError(r.message || 'Impossible de retirer la réunion.'); setConfirmDel(false); return; }
      await onSaved();
      await tell(meeting.id, null, 'Réunion retirée');
    } finally {
      setSaving(false);
    }
  };
  const toggle = (id: string) => setPicked((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const dayLabel = /^\d{4}-\d{2}-\d{2}$/.test(day) ? format(parseISO(day), 'EEEE d MMMM', { locale: fr }) : '';

  return (
    <form className="bt-ms" data-testid="meeting-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div>
        <label className="bt-ms-lbl" htmlFor="bt-ms-title">Titre</label>
        <input id="bt-ms-title" className="bt-ms-input" data-testid="meeting-title" maxLength={MEETING_TITLE_MAX} value={title}
          placeholder="Ex : point sécurité" onChange={(e) => setTitle(e.target.value)} autoComplete="off" />
      </div>
      <div>
        <label className="bt-ms-lbl" htmlFor="bt-ms-date">Date <small>{dayLabel}</small></label>
        <input id="bt-ms-date" type="date" className="bt-ms-input" data-testid="meeting-date" value={day}
          onChange={(e) => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setDay(e.target.value); }} />
      </div>
      <div className="bt-ms-times">
        <div>
          <span className="bt-ms-lbl">Heure</span>
          <TimeField value={start} onChange={setStart} ariaLabel="Heure de la réunion" placeholder="14:00" testId="meeting-start" onBadChange={setBadS} />
        </div>
        <div>
          <span className="bt-ms-lbl">Fin <small>facultatif</small></span>
          <TimeField value={end} onChange={setEnd} ariaLabel="Fin de la réunion" placeholder="fin" testId="meeting-end" onBadChange={setBadE} />
        </div>
      </div>
      <div>
        <label className="bt-ms-lbl" htmlFor="bt-ms-place">Lieu <small>facultatif</small></label>
        <input id="bt-ms-place" className="bt-ms-input" data-testid="meeting-place" maxLength={MEETING_PLACE_MAX} value={place}
          placeholder="Ex : dépôt" onChange={(e) => setPlace(e.target.value)} autoComplete="off" />
      </div>
      <div>
        <span className="bt-ms-lbl">Participants</span>
        <div className="bt-ms-pills" role="radiogroup" aria-label="Participants" style={{ marginBottom: allTeam ? 0 : 6 }}>
          <button type="button" role="radio" className="bt-ms-pill" aria-checked={allTeam} aria-pressed={allTeam} data-testid="meeting-all" onClick={() => setAllTeam(true)}>Toute l’équipe</button>
          <button type="button" role="radio" className="bt-ms-pill" aria-checked={!allTeam} aria-pressed={!allTeam} data-testid="meeting-pick" onClick={() => setAllTeam(false)}>Choisir</button>
        </div>
        {!allTeam && (
          <div className="bt-ms-people" data-testid="meeting-people">
            {workers.map((w) => (
              <label key={w.id} className="bt-ms-chk">
                <input type="checkbox" checked={picked.includes(w.id)} onChange={() => toggle(w.id)} data-testid="meeting-person" data-id={w.id} />
                {w.name}
              </label>
            ))}
          </div>
        )}
      </div>
      <label className="bt-ms-chk">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} data-testid="meeting-notify" />
        Prévenir par notification
      </label>
      <p className="bt-ms-muted">Ne compte pas dans les heures. Pas d’e-mail : notification seulement pour ceux qui l’ont activée.</p>
      {error && <p className="bt-ms-err" role="alert" data-testid="meeting-error">{error}</p>}
      <div className="bt-ms-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        {meeting ? (
          confirmDel ? (
            <span className="bt-ms-confirm">Retirer la réunion ?
              <button type="button" className="yes" data-testid="meeting-del-yes" disabled={saving} onClick={remove}>Oui</button>
              <button type="button" onClick={() => setConfirmDel(false)}>Non</button>
            </span>
          ) : (
            <button type="button" className="bt-ms-btn danger" data-testid="meeting-del" onClick={() => setConfirmDel(true)}>Retirer la réunion</button>
          )
        ) : <span />}
        <button type="submit" className="bt-ms-btn" data-testid="meeting-save" disabled={saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Enregistrer la réunion
        </button>
      </div>
    </form>
  );
}
