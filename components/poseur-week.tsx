'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { isCounted } from '@/lib/status';
import { TimeEntry, Worksite, Planning } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChevronLeft, ChevronRight, MapPin, Clock, Utensils,
  Send, AlertTriangle,
} from 'lucide-react';
import { format, addDays, addWeeks, subWeeks, parseISO } from 'date-fns';
import { DAYS_IN_WEEK, weekDays as buildWeekDays, weekStart as startOfWorkWeek } from '@/lib/week';
import { fr } from 'date-fns/locale';
import { slotLabel } from '@/lib/slot';
import { formatPause } from '@/supabase/functions/_shared/pause';
import { fetchMyMissions, type DayTask, type Meeting } from '@/lib/missions';
import { MEETING_TINT, meetingsFor, meetingTimeLabel, taskTimeLabel, tasksFor } from '@/supabase/functions/_shared/missions';
import TermineLe from '@/components/termine-le'; // lot 23 : « Terminé le … »
// Coque v2 (?ui=2) : la Semaine de la planche (E25) — carte à barres puis une ligne par jour.
import { useUi2 } from '@/components/design/salarie/shell-v2';
import { BarresSemaine, minutesSemaine, type BarreJour } from '@/components/design/salarie/carte-total';
import { etatJour, hm, semaineIso } from '@/supabase/functions/_shared/salarie-vue';

/**
 * Horaire prévu, lisible (lot 11). Créneau habituel → « Matin » / « Après-midi »
 * / « Journée » ; heures précises → « 14:00–18:00 » ; heure de début seule (un
 * rendez-vous « à 14:00 ») → « Prévu · 14:00 » — avant, elle n'apparaissait pas.
 */
function plannedLabel(start?: string | null, end?: string | null): string | null {
  const s = start?.substring(0, 5);
  const e = end?.substring(0, 5);
  if (s && e) {
    if ((s === '08:00' && e === '12:00') || (s === '13:00' && e === '17:00') || (s === '08:00' && e === '17:00')) return slotLabel(start, end);
    if (s === '13:30' && e === '17:00') return 'Après-midi';
    return `${s}–${e}`;
  }
  if (s) return `Prévu · ${s}`;
  return null;
}

interface TimeEntryWithWorksite extends TimeEntry {
  worksite: Worksite | null;
}
interface PlanningWithWorksite extends Planning {
  worksite: Worksite | null;
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

const ABSENCE_LABELS: Record<string, string> = {
  conge: 'Congé',
  maladie: 'Maladie',
  intemperie: 'Intempérie',
  repos: 'Repos',
};

export default function PoseurWeek({ onSelectDay }: { onSelectDay?: (date: string) => void } = {}) {
  const { user } = useAuth();
  const ui2 = useUi2();
  const [weekStart, setWeekStart] = useState(startOfWorkWeek());
  const [planning, setPlanning] = useState<PlanningWithWorksite[]>([]);
  const [entries, setEntries] = useState<TimeEntryWithWorksite[]>([]);
  // Lot 4 : les réunions de la semaine (lecture à part, silencieuse ; vide tant
  // que la migration n'est pas passée). Jamais additionnées aux heures.
  // Lot 9 : et mes tâches, avec leur heure (« 10:00–11:30 · Texte ») — seulement
  // une fois la migration du lot 9 passée : avant, la semaine reste celle du lot 4.
  const [meetings, setMeetings] = useState<{ list: Meeting[]; participants: Record<string, string[]>; tasks: DayTask[] }>({ list: [], participants: {}, tasks: [] });
  const [loading, setLoading] = useState(true);

  const weekEnd = addDays(weekStart, DAYS_IN_WEEK - 1); // lundi → dimanche

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const startStr = format(weekStart, 'yyyy-MM-dd');
      const endStr = format(weekEnd, 'yyyy-MM-dd');

      const [planningRes, entriesRes] = await Promise.all([
        supabase
          .from('planning')
          .select('*, worksite:worksites(*)')
          .eq('user_id', user.id)
          .gte('work_date', startStr)
          .lte('work_date', endStr),
        supabase
          .from('time_entries')
          .select('*, worksite:worksites(*)')
          .eq('user_id', user.id)
          .gte('work_date', startStr)
          .lte('work_date', endStr)
          .order('start_time'),
      ]);

      if (planningRes.error) throw planningRes.error;
      if (entriesRes.error) throw entriesRes.error;

      setPlanning(planningRes.data || []);
      setEntries(entriesRes.data || []);
    } catch (err) {
      console.error('Error fetching week:', err);
    } finally {
      setLoading(false);
    }
  }, [user, weekStart]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    if (!user?.id || !user.company_id) return;
    let stale = false;
    const from = format(weekStart, 'yyyy-MM-dd');
    fetchMyMissions(user.id, user.company_id, from, format(addDays(weekStart, DAYS_IN_WEEK - 1), 'yyyy-MM-dd'), { tasks: 'timed' }).then((r) => {
      if (stale || r === null) return; // lecture en échec : rien de plus
      setMeetings(r === 'missing' ? { list: [], participants: {}, tasks: [] } : { list: r.meetings, participants: r.participants, tasks: r.tasks });
    });
    return () => { stale = true; };
  }, [user?.id, user?.company_id, weekStart]);
  const meetingsOn = (d: string) => (user ? meetingsFor(meetings.list, meetings.participants, user.id, d, user.role !== 'admin') : []);
  // Avec heure d'abord, par heure ; puis les autres (même ordre que « Ma journée »).
  const tasksOn = (d: string) => (user ? tasksFor(meetings.tasks, user.id, d) : []);

  const weekDays = buildWeekDays(weekStart);
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Seules les heures envoyées comptent : une intervention retirée n'est plus
  // additionnée (elle reste visible, barrée).
  const totalSent = entries
    .filter((e) => isCounted(e.status))
    .reduce((s, e) => s + e.total_minutes, 0);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  if (ui2) {
    const JOURS3 = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    const jours = weekDays.map((day, i) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const plan = planning.filter((p) => p.work_date === dateStr).sort((a, b) => (a.estimated_start || '99:99').localeCompare(b.estimated_start || '99:99'));
      const lignes = entries.filter((e) => e.work_date === dateStr && e.status !== 'cancelled');
      const absence = plan.find((p) => p.absence_type)?.absence_type ?? null;
      const etat = etatJour({ date: dateStr, absence, prevu: plan.some((p) => !p.absence_type), lignes });
      const minutes = lignes.reduce((t, e) => t + (e.total_minutes || 0), 0);
      return { day, dateStr, i, plan, lignes, absence, etat, minutes, aujourdhui: dateStr === todayStr };
    });
    const barres: BarreJour[] = jours.map((j) => ({ date: j.dateStr, jour: 'LMMJVSD'[j.i], etat: j.etat, aujourdhui: j.aujourdhui, affiche: j.aujourdhui, minutes: j.minutes, prevu: j.plan.reduce((t, x) => { const d = x.estimated_start?.substring(0, 5), f = x.estimated_end?.substring(0, 5); return !x.absence_type && d && f && f > d ? t + (Number(f.slice(0, 2)) * 60 + Number(f.slice(3)) - Number(d.slice(0, 2)) * 60 - Number(d.slice(3))) : t; }, 0) }));
    const envoyes = jours.filter((j) => j.etat === 'envoye').length;
    const aEnvoyer = jours.filter((j) => j.etat === 'a-envoyer' || j.etat === 'renvoye' || j.etat === 'oublie');
    const nomsDe = (j: (typeof jours)[number]) => {
      const noms = Array.from(new Set([...j.lignes.map((e) => e.worksite?.client_name || 'Autre'), ...(j.lignes.length ? [] : j.plan.filter((p) => !p.absence_type).map((p) => p.worksite?.client_name || 'Chantier'))]));
      return noms.join(' · ');
    };
    // « prévu 08:00–16:00 », « prévu Matin » ; une heure de début seule donne déjà « Prévu · 16:30 » (jamais « prévu Prévu · … »).
    const prevuDe = (p: PlanningWithWorksite) => { const l = plannedLabel(p.estimated_start, p.estimated_end) ?? ''; return l.startsWith('Prévu') ? l : `prévu ${l}`.trim(); };
    const sousDe = (j: (typeof jours)[number]) => {
      // Les heures notées d'abord ; un prévu d'un chantier pas encore noté ce jour-là reste visible à la suite (la Semaine d'avant le montrait aussi).
      const heures = j.lignes.map((e) => `${e.start_time?.substring(0, 5)}–${e.end_time?.substring(0, 5)}`).join(' · ');
      const restants = j.plan.filter((x) => !x.absence_type && !j.lignes.some((l) => l.worksite_id === x.worksite_id)).map(prevuDe);
      if (j.lignes.length) return [heures, ...restants].join(' · ');
      return restants[0] ?? '';
    };
    return (
      <div className="dz-semaine" data-testid="dz-semaine">
        <div className="dz-sem-nav">
          <button type="button" onClick={() => setWeekStart(subWeeks(weekStart, 1))} aria-label="Semaine précédente"><ChevronLeft className="h-5 w-5" /></button>
          <div className="dz-sem-nav-t">{format(weekStart, 'd MMMM', { locale: fr })} – {format(weekEnd, 'd MMMM yyyy', { locale: fr })}</div>
          <button type="button" onClick={() => setWeekStart(addWeeks(weekStart, 1))} aria-label="Semaine suivante"><ChevronRight className="h-5 w-5" /></button>
        </div>
        <div className="bt-total dz-total dz-sem-carte" data-testid="dz-sem-total">
          <div className="dz-total-gauche">
            <div className="bt-total-k">Semaine {semaineIso(format(weekStart, 'yyyy-MM-dd'))} · heures</div>
            <div className="dz-total-valeur"><span className="bt-total-big">{hm(minutesSemaine(barres))}</span><span className="dz-total-unite">h</span></div>
            <div className="dz-total-detail">
              {envoyes} jour{envoyes > 1 ? 's' : ''} envoyé{envoyes > 1 ? 's' : ''}
              {aEnvoyer.length > 0 && ` · ${format(aEnvoyer[0].day, 'EEEE d', { locale: fr })} à envoyer`}
            </div>
          </div>
          <BarresSemaine barres={barres} />
        </div>
        {jours.map((j) => {
          const dayMeetings = meetingsOn(j.dateStr);
          const dayTasks = tasksOn(j.dateStr);
          const canOpen = !!onSelectDay;
          const nom = j.absence ? (ABSENCE_LABELS[j.absence] || j.absence) : nomsDe(j);
          const sous = j.absence ? (j.plan.find((p) => p.absence_type)?.notes ? `« ${j.plan.find((p) => p.absence_type)!.notes} »` : '') : sousDe(j);
          const pastille = j.absence ? { t: (ABSENCE_LABELS[j.absence] || j.absence).toUpperCase(), e: 'absence' }
            : j.lignes.length ? (j.etat === 'envoye' ? { t: `${hm(j.minutes)} ✓`, e: 'envoye' } : { t: 'À ENVOYER', e: 'a-envoyer' })
            : j.plan.length ? { t: 'PRÉVU', e: 'prevu' } : null;
          return (
            <div
              key={j.dateStr}
              role={canOpen ? 'button' : undefined}
              tabIndex={canOpen ? 0 : undefined}
              onClick={canOpen ? () => onSelectDay?.(j.dateStr) : undefined}
              onKeyDown={canOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectDay?.(j.dateStr); } } : undefined}
              data-guide={canOpen ? 'semaine.jour' : undefined}
              aria-label={`${format(j.day, 'EEEE d MMMM', { locale: fr })}${j.aujourdhui ? ', aujourd’hui' : ''}`}
              className={`dz-sem-jour${j.aujourdhui ? ' is-today' : ''}`}
              data-carte={pastille?.e ?? 'vide'}
            >
              <div className="dz-sem-ligne">
                <div className="dz-sem-date">{JOURS3[j.i]}<b>{format(j.day, 'd')}</b></div>
                <div className="dz-sem-centre">
                  <div className="dz-sem-nom">{nom || '—'}</div>
                  {sous && <div className="dz-sem-sous">{sous}</div>}
                </div>
                {pastille && (pastille.e === 'a-envoyer' && j.minutes > 0 ? (
                  <span className="dz-sem-droite"><b className="dz-sem-heures" data-testid="dz-sem-heures">{hm(j.minutes)}</b><span className="dz-sem-pastille" data-etat={pastille.e}>{pastille.t}</span></span>
                ) : <span className="dz-sem-pastille" data-etat={pastille.e}>{pastille.t}</span>)}
              </div>
              {(dayMeetings.length > 0 || dayTasks.length > 0) && (
                <div className="dz-sem-extra">
                  {dayMeetings.map((m) => (
                    <div key={m.id} className="dz-sem-reunion" data-testid="week-meeting">
                      <span aria-hidden="true">👥</span><b>{meetingTimeLabel(m.start_time, m.end_time)}</b><span>{m.title}</span>
                    </div>
                  ))}
                  {dayTasks.length > 0 && (
                    <div className="dz-sem-taches" data-testid="week-tasks">
                      {dayTasks.map((t) => (
                        <div key={t.id} className={t.done_at ? 'dz-sem-tache-fait' : undefined} data-testid="week-task">
                          <span aria-hidden="true">{t.done_at ? '☑' : '☐'}</span> {taskTimeLabel(t) ? `${taskTimeLabel(t)} · ` : ''}{t.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center">
          <p className="font-semibold text-sm">
            {format(weekStart, 'd MMMM', { locale: fr })} – {format(weekEnd, 'd MMMM yyyy', { locale: fr })}
          </p>
          {totalSent > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatMinutes(totalSent)} envoyées
            </p>
          )}
        </div>
        <Button variant="outline" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Day-by-day list (mobile / portrait) */}
      <div className="space-y-3 lg:hidden">
        {weekDays.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isToday = dateStr === todayStr;
          const dayPlanning = planning
            .filter(p => p.work_date === dateStr)
            .sort((a, b) => (a.estimated_start || '99:99').localeCompare(b.estimated_start || '99:99'));
          const dayEntries = entries.filter(e => e.work_date === dateStr);
          const dayMeetings = meetingsOn(dateStr);
          const dayTasks = tasksOn(dateStr);
          const hasContent = dayPlanning.length > 0 || dayEntries.length > 0 || dayMeetings.length > 0 || dayTasks.length > 0;
          const canOpen = !!onSelectDay;

          return (
            <div
              key={dateStr}
              onClick={canOpen ? () => onSelectDay?.(dateStr) : undefined}
              data-guide={canOpen ? 'semaine.jour' : undefined}
              className={`rounded-lg border p-3 space-y-2 transition-colors ${canOpen ? 'cursor-pointer hover:border-primary/60' : ''} ${isToday ? 'border-primary bg-primary/5' : 'bg-card'}`}
            >
              {/* Day header */}
              <div className="flex items-center gap-2">
                <p className={`font-semibold capitalize text-sm ${isToday ? 'text-[#15120F]' : ''}`}>
                  {format(day, 'EEEE d MMMM', { locale: fr })}
                </p>
                {isToday && (
                  <Badge variant="default" className="text-xs py-0">Aujourd'hui</Badge>
                )}
              </div>

              {/* Planning assignments */}
              {dayPlanning.map((p) => (
                <div key={p.id}>
                  {p.absence_type ? (
                    <div className="flex items-center gap-2 text-sm bg-[#ECE6D9] rounded p-2 text-[#6E6A63]">
                      <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
                      <span className="font-medium">{ABSENCE_LABELS[p.absence_type] || p.absence_type}</span>
                      {p.notes && <span className="text-[#8a8378] text-xs">— {p.notes}</span>}
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 text-sm bg-[#FFF6DD] border border-[#EAD9A0] rounded p-2 text-[#15120F]">
                      <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium truncate block">{p.worksite?.client_name || 'Chantier'}</span>
                        {p.worksite?.city && <span className="text-[#9a7c14] text-xs">{p.worksite.city}</span>}
                        <TermineLe ws={p.worksite} />
                      </div>
                      {plannedLabel(p.estimated_start, p.estimated_end) && (
                        <span className="text-[#9a7c14] text-xs shrink-0">
                          {plannedLabel(p.estimated_start, p.estimated_end)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Lot 4 : réunions (couleur à part, ne comptent pas comme heures) */}
              {dayMeetings.map((m) => (
                <div key={m.id} className="flex items-center gap-2 text-sm rounded p-2 text-[#15120F]" style={{ background: MEETING_TINT.bg, border: `1px solid ${MEETING_TINT.edge}` }} data-testid="week-meeting">
                  <span aria-hidden="true">👥</span>
                  <span className="font-mono text-xs font-bold shrink-0" style={{ color: MEETING_TINT.edge }}>{meetingTimeLabel(m.start_time, m.end_time)}</span>
                  <span className="font-medium truncate">{m.title}</span>
                </div>
              ))}

              {/* Lot 9 : tâches du jour, l'heure devant (ne comptent pas comme heures) */}
              {dayTasks.length > 0 && (
                <div className="rounded border border-[rgba(21,18,15,.12)] bg-white p-2 text-sm text-[#15120F] space-y-0.5" data-testid="week-tasks">
                  {dayTasks.map((t) => (
                    <div key={t.id} className={`flex items-baseline gap-1.5 min-w-0 ${t.done_at ? 'text-[#6E6A63] line-through' : ''}`} data-testid="week-task">
                      <span aria-hidden="true" className="shrink-0">{t.done_at ? '☑' : '☐'}</span>
                      {taskTimeLabel(t) && <span className="font-mono text-xs font-bold shrink-0">{taskTimeLabel(t)} ·</span>}
                      <span className="truncate">{t.text}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Time entries */}
              {dayEntries.map((entry) => {
                const isCancelled = entry.status === 'cancelled';
                const statusColor =
                  isCancelled ? 'bg-[#F3EEE3] border-[rgba(21,18,15,.10)] text-[#9a948a] line-through' :
                  entry.status === 'submitted' ? 'bg-white border-[rgba(21,18,15,.14)] text-[#15120F]' :
                  'bg-[#F3EEE3] border-[rgba(21,18,15,.10)] text-[#6E6A63]';

                return (
                  <div key={entry.id} className={`flex items-start gap-2 text-sm border rounded p-2 ${statusColor}`}>
                    <Clock className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium truncate block">{entry.worksite?.client_name || 'Autre'}</span>
                      <TermineLe ws={entry.worksite} />
                      <span className="text-xs opacity-75">
                        {entry.start_time?.substring(0, 5)}–{entry.end_time?.substring(0, 5)}
                        {/* Lot 3bis : « pause 1 h 15 », plus « pause 75min ». */}
                        {entry.break_minutes > 0 ? ` · pause ${formatPause(entry.break_minutes)}` : ''}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="font-semibold">{formatMinutes(entry.total_minutes)}</span>
                      <div className="flex items-center gap-1">
                        {isCancelled && <span className="text-[10px] font-semibold no-underline">Retirée</span>}
                        {!isCancelled && entry.meal_allowance && (
                          <Utensils className="h-3 w-3 opacity-60" aria-label="Panier repas" />
                        )}
                        {entry.status === 'submitted' && (
                          <Send className="h-3 w-3 opacity-70" aria-label="Envoyé" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {!hasContent && (
                <p className="text-sm text-muted-foreground text-center py-1">Aucune affectation</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Week grid (landscape / desktop) */}
      <div className="hidden lg:grid grid-cols-6 gap-3">
        {weekDays.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isToday = dateStr === todayStr;
          const dayPlanning = planning
            .filter(p => p.work_date === dateStr)
            .sort((a, b) => (a.estimated_start || '99:99').localeCompare(b.estimated_start || '99:99'));
          const dayEntries = entries.filter(e => e.work_date === dateStr);
          const dayMeetings = meetingsOn(dateStr);
          const dayTasks = tasksOn(dateStr);
          const hasContent = dayPlanning.length > 0 || dayEntries.length > 0 || dayMeetings.length > 0 || dayTasks.length > 0;
          const canOpen = !!onSelectDay;

          return (
            <div
              key={dateStr}
              onClick={canOpen ? () => onSelectDay?.(dateStr) : undefined}
              data-guide={canOpen ? 'semaine.jour' : undefined}
              className={`rounded-lg border p-2 min-h-[140px] flex flex-col transition-colors ${canOpen ? 'cursor-pointer hover:border-primary/60' : ''} ${isToday ? 'border-primary bg-primary/5' : 'bg-card'}`}
            >
              <div className="text-center mb-2 pb-2 border-b">
                <p className={`text-xs capitalize ${isToday ? 'text-[#15120F] font-medium' : 'text-muted-foreground'}`}>
                  {format(day, 'EEEE', { locale: fr })}
                </p>
                <p className={`text-lg font-bold ${isToday ? 'text-[#15120F]' : ''}`}>{format(day, 'd')}</p>
              </div>

              <div className="space-y-1 flex-1">
                {dayPlanning.map((p) => (
                  p.absence_type ? (
                    <div key={p.id} className="rounded bg-[#ECE6D9] text-[#6E6A63] px-1.5 py-1 text-[11px] flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-orange-500 shrink-0" />
                      <span className="truncate">{ABSENCE_LABELS[p.absence_type] || p.absence_type}</span>
                    </div>
                  ) : (
                    <div key={p.id} className="rounded bg-[#FFF6DD] border border-[#EAD9A0] text-[#15120F] px-1.5 py-1 text-[11px]">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate font-medium">{p.worksite?.client_name || 'Chantier'}</span>
                      </div>
                      <TermineLe ws={p.worksite} court />
                      {plannedLabel(p.estimated_start, p.estimated_end) && (
                        <div className="text-[#9a7c14] mt-0.5">{plannedLabel(p.estimated_start, p.estimated_end)}</div>
                      )}
                    </div>
                  )
                ))}

                {dayMeetings.map((m) => (
                  <div key={m.id} className="rounded px-1.5 py-1 text-[11px] text-[#15120F]" style={{ background: MEETING_TINT.bg, border: `1px solid ${MEETING_TINT.edge}` }} data-testid="week-meeting">
                    <div className="flex items-center gap-1">
                      <span aria-hidden="true">👥</span>
                      <span className="truncate font-medium">{m.title}</span>
                    </div>
                    <div className="mt-0.5 font-mono" style={{ color: MEETING_TINT.edge }}>{meetingTimeLabel(m.start_time, m.end_time)}</div>
                  </div>
                ))}

                {dayTasks.map((t) => (
                  <div key={t.id} className={`rounded border border-[rgba(21,18,15,.12)] bg-white px-1.5 py-1 text-[11px] ${t.done_at ? 'text-[#6E6A63] line-through' : 'text-[#15120F]'}`} data-testid="week-task">
                    <div className="flex items-center gap-1 min-w-0">
                      <span aria-hidden="true" className="shrink-0">{t.done_at ? '☑' : '☐'}</span>
                      <span className="truncate font-medium">{t.text}</span>
                    </div>
                    {taskTimeLabel(t) && <div className="mt-0.5 font-mono">{taskTimeLabel(t)}</div>}
                  </div>
                ))}

                {dayEntries.map((entry) => {
                  const isCancelled = entry.status === 'cancelled';
                  const statusColor =
                    isCancelled ? 'bg-[#F3EEE3] border-[rgba(21,18,15,.10)] text-[#9a948a] line-through' :
                    entry.status === 'submitted' ? 'bg-white border-[rgba(21,18,15,.14)] text-[#15120F]' :
                    'bg-[#F3EEE3] border-[rgba(21,18,15,.10)] text-[#6E6A63]';
                  return (
                    <div key={entry.id} className={`rounded border px-1.5 py-1 text-[11px] ${statusColor}`}>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span className="truncate font-medium">{entry.worksite?.client_name || 'Chantier'}</span>
                      </div>
                      <TermineLe ws={entry.worksite} court />
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="opacity-75">{entry.start_time?.substring(0, 5)}–{entry.end_time?.substring(0, 5)}</span>
                        <span className="font-semibold">{formatMinutes(entry.total_minutes)}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {isCancelled && <span className="text-[10px] font-semibold no-underline">Retirée</span>}
                        {!isCancelled && entry.meal_allowance && <Utensils className="h-3 w-3 opacity-60" aria-label="Panier repas" />}
                        {entry.status === 'submitted' && <Send className="h-3 w-3 opacity-70" aria-label="Envoyé" />}
                      </div>
                    </div>
                  );
                })}

                {!hasContent && (
                  <p className="text-[11px] text-muted-foreground text-center py-2">—</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
