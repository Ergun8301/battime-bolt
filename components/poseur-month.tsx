'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { isCounted } from '@/lib/status';
import { TimeEntry, Worksite, Planning } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, MapPin, Clock, Send } from 'lucide-react';
import { format, startOfMonth, endOfMonth, addMonths, subMonths, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { termineLe } from '@/supabase/functions/_shared/chantier-statut'; // lot 23 : « Terminé le … »
import { useUi2 } from '@/components/design/salarie/shell-v2'; // coque v2 (?ui=2) : le Mois en cartes, comme la Semaine (E25)
import { hm, resumeMois } from '@/supabase/functions/_shared/salarie-vue';

interface EntryW extends TimeEntry { worksite: Worksite | null }
interface PlanW extends Planning { worksite: Worksite | null }

function fmt(m: number) { return `${Math.floor(m / 60)}h${(m % 60).toString().padStart(2, '0')}`; }
const ABS: Record<string, string> = { conge: 'Congé', maladie: 'Maladie', intemperie: 'Intempérie', repos: 'Repos' };

// Monthly view: navigate months (◀▶), month total, and a tappable list of the
// days that have planning/entries — tap a day to declare/edit it.
export default function PoseurMonth({ onSelectDay }: { onSelectDay?: (date: string) => void } = {}) {
  const { user } = useAuth();
  const ui2 = useUi2();
  const [monthStart, setMonthStart] = useState(startOfMonth(new Date()));
  const [planning, setPlanning] = useState<PlanW[]>([]);
  const [entries, setEntries] = useState<EntryW[]>([]);
  const [loading, setLoading] = useState(true);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const from = format(monthStart, 'yyyy-MM-dd');
      const to = format(endOfMonth(monthStart), 'yyyy-MM-dd');
      const [planRes, entRes] = await Promise.all([
        supabase.from('planning').select('*, worksite:worksites(*)').eq('user_id', user.id).gte('work_date', from).lte('work_date', to),
        supabase.from('time_entries').select('*, worksite:worksites(*)').eq('user_id', user.id).gte('work_date', from).lte('work_date', to).order('start_time'),
      ]);
      if (!planRes.error) setPlanning(planRes.data || []);
      if (!entRes.error) setEntries(entRes.data || []);
    } catch (err) {
      console.error('Error fetching month:', err);
    } finally {
      setLoading(false);
    }
  }, [user, monthStart]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalSent = entries.filter((e) => isCounted(e.status)).reduce((s, e) => s + e.total_minutes, 0);
  const dayKeys = Array.from(new Set([...planning.map((p) => p.work_date), ...entries.map((e) => e.work_date)])).sort();

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-full" />{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }

  if (ui2) {
    const resume = resumeMois(entries, planning);
    const envoyes = resume.joursTravailles;
    return (
      <div className="dz-semaine dz-mois" data-testid="dz-mois">
        <div className="dz-sem-nav">
          <button type="button" onClick={() => setMonthStart(subMonths(monthStart, 1))} aria-label="Mois précédent"><ChevronLeft className="h-5 w-5" /></button>
          <div className="dz-sem-nav-t capitalize">{format(monthStart, 'MMMM yyyy', { locale: fr })}</div>
          <button type="button" onClick={() => setMonthStart(addMonths(monthStart, 1))} aria-label="Mois suivant"><ChevronRight className="h-5 w-5" /></button>
        </div>
        {/* Le résumé du mois (rien de relu : les lignes et les affectations de la page). Même grammaire que la Journée : carte sombre, petit mot jaune, tuiles crème. */}
        <div className="dz-mois-resume" data-testid="dz-mois-total">
          <div className="bt-total-k capitalize">{format(monthStart, 'MMMM', { locale: fr })} · heures</div>
          <div className="dz-total-valeur"><span className="bt-total-big">{hm(resume.minutes)}</span><span className="dz-total-unite">h</span></div>
          <div className="dz-total-detail">
            {resume.minutes > 0 ? `${fmt(resume.minutes)} envoyées · ` : ''}{envoyes} jour{envoyes > 1 ? 's' : ''} envoyé{envoyes > 1 ? 's' : ''}
            {resume.aEnvoyerMinutes > 0 && <span className="dz-mois-reste"> · + {fmt(resume.aEnvoyerMinutes)} à envoyer</span>}
          </div>
        </div>
        <div className="bt-stats dz-compteurs" data-testid="dz-mois-stats">
          <div className="bt-stat dz-compteur" data-testid="mois-jours"><span className="dz-compteur-cle">Jours</span><span className="bt-stat-n">{resume.joursTravailles}</span></div>
          {resume.paniers > 0 && <div className="bt-stat dz-compteur" data-testid="mois-paniers"><span className="dz-compteur-cle">Paniers</span><span className="bt-stat-n">{resume.paniers}</span></div>}
          {resume.conges > 0 && <div className="bt-stat dz-compteur" data-testid="mois-conges"><span className="dz-compteur-cle">Congés</span><span className="bt-stat-n">{resume.conges}</span></div>}
          {resume.absences > 0 && <div className="bt-stat dz-compteur" data-testid="mois-absences"><span className="dz-compteur-cle">Absences</span><span className="bt-stat-n">{resume.absences}</span></div>}
          <div className="bt-stat dz-compteur" data-testid="mois-a-envoyer" data-ton={resume.aEnvoyerJours > 0 ? 'a-envoyer' : undefined}><span className="dz-compteur-cle">À envoyer</span><span className="bt-stat-n">{resume.aEnvoyerJours}</span></div>
        </div>
        {dayKeys.length === 0 ? (
          <p className="dz-vide">Aucune affectation ce mois-ci.</p>
        ) : dayKeys.map((d) => {
          const dPlan = planning.filter((p) => p.work_date === d);
          const dEnt = entries.filter((e) => e.work_date === d);
          const dayTotal = dEnt.filter((e) => isCounted(e.status)).reduce((s, e) => s + e.total_minutes, 0);
          const declared = dEnt.some((e) => isCounted(e.status));
          const hasDraft = dEnt.some((e) => e.status === 'draft');
          const isToday = d === todayStr;
          const absence = dPlan.find((p) => p.absence_type)?.absence_type;
          const pastille = dayTotal > 0
            ? { t: `${fmt(dayTotal)}${declared ? ' ✓' : ''}${hasDraft ? ' · À envoyer' : ''}`, e: hasDraft ? 'a-envoyer' : 'envoye' }
            : absence && dEnt.length === 0 ? { t: (ABS[absence] || absence).toUpperCase(), e: 'absence' } // un congé n'est pas « À déclarer » : la même pastille que la Semaine
            : { t: hasDraft ? 'À envoyer' : 'À déclarer', e: hasDraft ? 'a-envoyer' : 'prevu' };
          return (
            // Couleur de la carte : un jour passé encore « à déclarer » demande un geste (comme « à envoyer ») ; seul un jour à venir est « prévu » (violet).
            <button key={d} type="button" onClick={() => onSelectDay?.(d)} className={`dz-sem-jour${isToday ? ' is-today' : ''}`} data-carte={pastille.e === 'prevu' && d < todayStr ? 'a-envoyer' : pastille.e}>
              <span className="dz-sem-ligne">
                <span className="dz-sem-centre">
                  <span className="dz-sem-nom capitalize">{format(parseISO(d), 'EEEE d MMMM', { locale: fr })}</span>
                </span>
                <span className="dz-sem-pastille" data-etat={pastille.e}>{pastille.t}</span>
              </span>
              <span className="dz-mois-lignes">
                {dPlan.map((p) => (
                  <span key={p.id} className="dz-sem-sous">
                    {p.absence_type ? (ABS[p.absence_type] || p.absence_type) : <>{p.worksite?.client_name || 'Chantier'}{termineLe(p.worksite, true) ? ` · ${termineLe(p.worksite, true)}` : ''}</>}
                  </span>
                ))}
                {dEnt.map((e) => (
                  <span key={e.id} className={`dz-sem-sous${e.status === 'cancelled' ? ' dz-barre-texte' : ''}`}>{e.worksite?.client_name || 'Chantier'}{termineLe(e.worksite, true) ? ` · ${termineLe(e.worksite, true)}` : ''} · {e.start_time?.substring(0, 5)}–{e.end_time?.substring(0, 5)}{e.status === 'cancelled' ? ' · retirée' : e.status === 'draft' ? ' · brouillon' : ''}</span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={() => setMonthStart(subMonths(monthStart, 1))}><ChevronLeft className="h-4 w-4" /></Button>
        <div className="text-center">
          <p className="font-semibold text-sm capitalize">{format(monthStart, 'MMMM yyyy', { locale: fr })}</p>
          {totalSent > 0 && <p className="text-xs text-muted-foreground mt-0.5">{fmt(totalSent)} envoyées</p>}
        </div>
        <Button variant="outline" size="icon" onClick={() => setMonthStart(addMonths(monthStart, 1))}><ChevronRight className="h-4 w-4" /></Button>
      </div>

      {dayKeys.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">Aucune affectation ce mois-ci.</p>
      ) : (
        <div className="space-y-2">
          {dayKeys.map((d) => {
            const dPlan = planning.filter((p) => p.work_date === d);
            const dEnt = entries.filter((e) => e.work_date === d);
            // Le total du jour = heures envoyées ; un brouillon non envoyé est
            // signalé « À envoyer », une ligne retirée ne compte pas.
            const dayTotal = dEnt.filter((e) => isCounted(e.status)).reduce((s, e) => s + e.total_minutes, 0);
            const declared = dEnt.some((e) => isCounted(e.status));
            const hasDraft = dEnt.some((e) => e.status === 'draft');
            const isToday = d === todayStr;
            return (
              <button
                key={d}
                onClick={() => onSelectDay?.(d)}
                className={`w-full text-left rounded-lg border p-3 transition-colors hover:border-primary/60 ${isToday ? 'border-primary bg-primary/5' : 'bg-card'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold capitalize text-sm">{format(parseISO(d), 'EEEE d MMMM', { locale: fr })}</p>
                  {dayTotal > 0
                    ? <span className="text-sm font-semibold text-[#15120F] flex items-center gap-1">{declared && <Send className="h-3 w-3 opacity-70" />}{fmt(dayTotal)}{hasDraft && <span className="text-xs font-medium text-orange-600">· À envoyer</span>}</span>
                    : <span className="text-xs text-orange-600">{hasDraft ? 'À envoyer' : 'À déclarer'}</span>}
                </div>
                <div className="mt-1 space-y-0.5">
                  {dPlan.map((p) => (
                    <p key={p.id} className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                      {p.absence_type ? (ABS[p.absence_type] || p.absence_type) : <><MapPin className="h-3 w-3 shrink-0" />{p.worksite?.client_name || 'Chantier'}{termineLe(p.worksite, true) ? ` · ${termineLe(p.worksite, true)}` : ''}</>}
                    </p>
                  ))}
                  {dEnt.map((e) => (
                    <p key={e.id} className={`text-xs text-muted-foreground flex items-center gap-1 truncate${e.status === 'cancelled' ? ' line-through' : ''}`}><Clock className="h-3 w-3 shrink-0" />{e.worksite?.client_name || 'Chantier'}{termineLe(e.worksite, true) ? ` · ${termineLe(e.worksite, true)}` : ''} · {e.start_time?.substring(0, 5)}–{e.end_time?.substring(0, 5)}{e.status === 'cancelled' ? ' · retirée' : e.status === 'draft' ? ' · brouillon' : ''}</p>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
