'use client';

// Design du bureau (v2) · l'objectif de la semaine sous le nom du salarié : « Prévu 30 / 35 h · manque 5 h » et « Pointé 28 h · écart −2 h ».
// L'objectif est l'horaire propre du salarié (fiche › « Heures par semaine »), sinon celui de l'entreprise, sinon 35 h (lib/overtime).
// Affichage seulement : heures supplémentaires, paie et exports ne lisent rien d'ici. Le sens est dans le texte (mot et signe), jamais dans la couleur seule.
import { useMemo } from 'react';
import { format } from 'date-fns';
import { lignesObjectif, prevuSemaine, totauxSemaine, type LignesObjectif } from '@/supabase/functions/_shared/bureau-vue';
import type { PlanningCtx } from './contexte-v2';

const heureParis = () => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());

/** Jauge : heures envoyées sur l'objectif, plafonnée à 100 % (0 sans objectif). */
export const pctObjectif = (envoyees: number, objectifH: number) => (objectifH > 0 ? Math.min(100, Math.round((envoyees / 60 / objectifH) * 100)) : 0);

/** Les lignes de chaque salarié pour la semaine affichée (toute l'équipe : la grille et le téléphone lisent la même table). */
export function useObjectifs(c: PlanningCtx): Record<string, LignesObjectif> {
  const dates = c.weekDays.map((d) => format(d, 'yyyy-MM-dd'));
  return useMemo(() => {
    const ids = c.workers.map((w) => w.id);
    const pv = prevuSemaine(dates, ids, c.planning, c.withdrawnIds, c.todayStr, heureParis());
    const env = totauxSemaine(dates, ids, c.realEntries, [], new Set()).parSalarie;
    return Object.fromEntries(ids.map((id) => [id, lignesObjectif(c.weeklyGoalFor(id), pv[id], env[id].envoyees)]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates.join('|'), c.workers, c.planning, c.realEntries, c.withdrawnIds, c.todayStr, c.weeklyGoalFor]);
}

export function Objectif({ o, pct, jauge = true }: { o: LignesObjectif; pct?: number; jauge?: boolean }) {
  return (
    <div className="dzp-obj" title={o.phrase} data-testid="objectif">
      {jauge && <div className="dzp-jauge" aria-hidden="true"><span style={{ width: `${pct ?? 0}%` }} /></div>}
      <span className="sr-only">{o.phrase}</span>
      <div className="dzp-obj__l" aria-hidden="true" data-testid="objectif-prevu"><span>{o.prevu}</span>{o.ecartObjectif ? <b data-ton={o.ton || undefined}>{o.ecartObjectif}</b> : null}</div>
      {o.pointe ? <div className="dzp-obj__l" aria-hidden="true" data-testid="objectif-pointe"><span>{o.pointe}</span><b>{o.ecartPointe}</b></div> : null}
    </div>
  );
}
