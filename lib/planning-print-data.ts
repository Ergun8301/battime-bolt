// Lot 3bis — lecture d'une période qui n'est PAS celle de l'écran, pour l'imprimer
// (une autre semaine, un jour d'une autre semaine, un mois).
//
// Mêmes tables, mêmes colonnes, même filtre entreprise et mêmes règles que la
// grille (admin-planning fetchPlanning) — mais :
//  - AUCUNE écriture : pas d'ensure_planning_slot (imprimer ne change rien) ;
//    des heures envoyées sur un chantier sans créneau s'impriment donc comme
//    « ajoutées par le salarié » (mêmes heures) ;
//  - lecture paginée (un mois de 40 salariés dépasse le plafond de 1 000 lignes) ;
//  - toute erreur est LEVÉE : une feuille incomplète ne doit jamais avoir l'air complète.
// Lot 4 : aussi les réunions de la période (toujours imprimées) et, avec « Avec les
// tâches », les tâches du jour — une table encore absente (migration pas passée)
// donne simplement « aucune » ; le mois n'imprime ni l'un ni l'autre.
import { supabase } from '@/lib/supabase';
import type { PlanningWithWorksite } from '@/lib/types';
import { chunk, fetchAllPaged } from '@/lib/fetch-all';
import { isDisposableDraft } from '@/lib/erase';
import { DRAFT_COLS, SENT_COLS, withdrawnSet, type DraftRow, type EntryRow } from '@/lib/planning-cells';
import { loadMissionsForPrint, MISSIONS_OFF, type MissionsState } from '@/lib/missions';

export interface PrintData {
  from: string;
  to: string;
  planning: PlanningWithWorksite[];
  real: EntryRow[];
  drafts: DraftRow[];
  withdrawn: Set<string>;
  /** Nom de chaque chantier cité, archivés compris (sinon une heure hors planning s'imprimerait « Autre »). */
  wsNames: Map<string, string>;
  /** Lot 4 : réunions (et tâches si demandées) de la période ; jamais des heures. */
  missions: MissionsState;
}

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function loadPrintData(companyId: string, from: string, to: string, want: { tasks: boolean; meetings: boolean } = { tasks: false, meetings: false }): Promise<PrintData> {
  // Ordre total (date puis id) : une page ne peut ni sauter ni répéter une ligne.
  const drafts = (cols: string) => fetchAllPaged<DraftRow>((f, t) => supabase.from('time_entries').select(cols)
    .eq('company_id', companyId).eq('status', 'draft').gte('work_date', from).lte('work_date', to)
    .order('work_date').order('id').range(f, t) as unknown as Page<DraftRow>);
  const [planning, real, draftRows, cancelled, missions] = await Promise.all([
    // Sans la jointure `user` de l'écran : la feuille ne lit jamais p.user (les noms
    // viennent de la liste des salariés). Le type la déclare : d'où la conversion.
    fetchAllPaged<PlanningWithWorksite>((f, t) => supabase.from('planning').select('*, worksite:worksites(*)')
      .eq('company_id', companyId).gte('work_date', from).lte('work_date', to)
      .order('work_date').order('id').range(f, t) as unknown as Page<PlanningWithWorksite>),
    fetchAllPaged<EntryRow>((f, t) => supabase.from('time_entries').select(SENT_COLS)
      .eq('company_id', companyId).in('status', ['submitted', 'validated']).gte('work_date', from).lte('work_date', to)
      .order('work_date').order('id').range(f, t) as unknown as Page<EntryRow>),
    // `exit_forgotten` (lot 12) peut manquer en base : relu sans elle, comme l'écran.
    drafts(`${DRAFT_COLS}, exit_forgotten`).catch((e: { message?: string }) => {
      if (/exit_forgotten/.test(e?.message || '')) return drafts(DRAFT_COLS);
      throw e;
    }),
    fetchAllPaged<{ planning_id: string | null }>((f, t) => supabase.from('time_entries').select('planning_id')
      .eq('company_id', companyId).eq('status', 'cancelled').not('planning_id', 'is', null).gte('work_date', from).lte('work_date', to)
      .order('work_date').order('id').range(f, t) as unknown as Page<{ planning_id: string | null }>),
    want.tasks || want.meetings ? loadMissionsForPrint(companyId, from, to, want) : Promise.resolve(MISSIONS_OFF),
  ]);
  // Lot 2 : un brouillon VIDE (0 minute, jamais envoyé) ne s'affiche pas — ni à l'écran, ni sur papier.
  const shown = draftRows.filter((d) => !isDisposableDraft(d));
  // Noms des chantiers : ceux des jointures, puis ceux qui manquent (chantier archivé,
  // hors de la liste active de l'écran, cité seulement par des heures sans créneau).
  const wsNames = new Map<string, string>();
  for (const p of planning) if (p.worksite_id && p.worksite?.client_name) wsNames.set(p.worksite_id, p.worksite.client_name);
  const missing = Array.from(new Set(real.concat(shown).map((e) => e.worksite_id).filter((id): id is string => !!id && !wsNames.has(id))));
  for (const ids of chunk(missing, 100)) {
    const { data, error } = await supabase.from('worksites').select('id, client_name').eq('company_id', companyId).in('id', ids);
    if (error) throw error;
    for (const w of (data || []) as { id: string; client_name: string }[]) wsNames.set(w.id, w.client_name);
  }
  return { from, to, planning, real, drafts: shown, withdrawn: withdrawnSet(cancelled), wsNames, missions };
}
