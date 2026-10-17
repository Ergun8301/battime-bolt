'use client';

// Design du bureau (v2) · la réunion et le compteur de tâches d'une case. Mêmes données, mêmes gestes et mêmes repères que MeetingChip / TasksBadge
// (components/missions-office.tsx) ; seul le dessin change : carte rose (titre, lieu, heure à droite) et pastille « ☐ Tâches 1/3 ».
import { toast } from 'sonner';
import type { Meeting } from '@/lib/missions';
import { hhmm, meetingTimeLabel, taskProgress } from '@/supabase/functions/_shared/missions';

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

export function ReunionV2({ m, onOpen, inert = false, grande = false }: { m: Meeting; onOpen?: () => void; inert?: boolean; grande?: boolean }) {
  const quand = meetingTimeLabel(m.start_time, m.end_time);
  const plein = `Réunion · ${quand} · ${m.title}${m.place ? ` · ${m.place}` : ''}${m.all_team ? ' · toute l’équipe' : ''} — ne compte pas dans les heures`;
  const sous = [m.place, m.all_team ? 'toute l’équipe' : ''].filter(Boolean).join(' · ');
  return (
    <button type="button" className="dzp-reunion" data-grande={grande ? '' : undefined} data-inerte={inert ? '' : undefined} title={plein} aria-label={plein} data-testid="meeting-chip" data-meeting={m.id}
      onPointerDown={stop} onClick={(e) => { e.stopPropagation(); if (inert) { toast('Réunion / tâches — hors sélection'); return; } onOpen?.(); }}>
      <span className="dzp-reunion__txt"><b>{m.title}</b>{sous ? <span>{sous}</span> : null}</span>
      <span className="dzp-reunion__heure">{grande ? quand : hhmm(m.start_time)}</span>
    </button>
  );
}

export function TachesV2({ tasks, onOpen, inert = false }: { tasks: { done_at: string | null }[]; onOpen?: () => void; inert?: boolean }) {
  const p = taskProgress(tasks);
  const toutes = p.total > 0 && p.done === p.total;
  return (
    <button type="button" className="dzp-taches" data-fait={toutes ? '' : undefined} data-testid="tasks-badge" data-done={p.done} data-total={p.total}
      title={`${p.done} faite(s) sur ${p.total} — cliquer pour voir les tâches`}
      onPointerDown={stop} onClick={(e) => { e.stopPropagation(); if (inert) { toast('Réunion / tâches — hors sélection'); return; } onOpen?.(); }}>
      {toutes ? '✓' : '☐'} {p.total > 1 ? 'Tâches' : 'Tâche'} {p.label}
    </button>
  );
}
