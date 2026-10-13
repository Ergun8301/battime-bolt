// Chantier terminé + bilan du chantier (lot 23, oct. 2026), côté navigateur.
//
// DEUX RÈGLES :
//   · AVANT LA MIGRATION (20261013180000), RIEN NE CHANGE : « suis-je prête ? » (lib/chantier-termine-ready.ts,
//     le seul morceau du premier chargement) répond « non » au moindre doute, en silence. Le bouton
//     « Terminer » et le bilan restent cachés.
//   · RIEN NE S'EFFACE, AUCUNE HEURE NE BOUGE : terminer = poser une date sur le chantier (une fonction
//     du bureau, qui ne touche que deux colonnes) ; rouvrir = la retirer. Aucune suppression ici.
//
// LE BILAN NE RECALCULE AUCUNE HEURE. Les heures, la route et le coût viennent de my_worksite_labour (la
// fonction que « Coût chantiers » et les alertes de budget appellent) ; une réserve est « levée » selon
// lib/reserves.ts (la seule définition) ; les dépenses, les documents et le budget sont des lectures
// directes. L'assemblage est dans supabase/functions/_shared/chantier-termine.ts (testé).
import { supabase } from '@/lib/supabase';
import { fetchAllPaged } from '@/lib/fetch-all';
import { isReserveLifted } from '@/lib/reserves';
import { COUNTED_STATUSES } from '@/lib/status';
import {
  buildBilan, countDrafts, countUpcoming, todayParis, type Bilan, type BilanEntry, type FinishCheck, type LabourRow,
} from '@/supabase/functions/_shared/chantier-termine';

export { completionKnownReady, completionReady } from '@/lib/chantier-termine-ready';

/** Les messages français que la base lève elle-même : affichables tels quels. */
const DB_MESSAGES = ['Réservé au bureau', 'Chantier introuvable', 'ne peut pas être dans le futur'];
export const OFFLINE_TEXT = 'Pas de connexion : rien n’a été changé. Réessayez.';
const FAILED_TEXT = 'Impossible pour le moment : rien n’a été changé. Réessayez dans un instant.';

function errorText(e: unknown): string {
  const m = String((e as { message?: string } | null)?.message ?? '');
  if (DB_MESSAGES.some((x) => m.includes(x))) return m;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return OFFLINE_TEXT;
  return FAILED_TEXT;
}

/**
 * Termine le chantier à ce jour (AAAA-MM-JJ, jamais dans le futur : la base le vérifie aussi) ou le ROUVRE (`null`).
 * Renvoie la date écrite par la base, ou null. Lève une erreur au texte français.
 */
export async function setWorksiteCompleted(worksiteId: string, day: string | null): Promise<string | null> {
  let res;
  try {
    res = await supabase.rpc('set_worksite_completed', { p_worksite: worksiteId, p_date: day });
  } catch (e) { throw new Error(errorText(e)); }
  if (res.error) throw new Error(errorText(res.error));
  return (res.data as string | null) ?? null;
}

const COUNTED = COUNTED_STATUSES as unknown as string[];

/**
 * Ce qu'il faut signaler AVANT de terminer : réserves non levées, pointages en cours, brouillons non envoyés,
 * interventions à venir. Cinq petites lectures en parallèle, à l'ouverture de la fenêtre (rien au chargement de
 * la page). Une lecture qui échoue LÈVE : l'appelant le dit et propose quand même de terminer (jamais un blocage).
 */
export async function loadFinishCheck(worksiteId: string, companyId: string): Promise<FinishCheck> {
  const today = todayParis();
  const [reserves, live, drafts, plan, doneToday] = await Promise.all([
    fetchAllPaged<{ reserve_resolved_at: string | null; reserve_fixed_at: string | null }>((f, t) => supabase.from('time_entries')
      .select('id, reserve_resolved_at, reserve_fixed_at')
      .eq('company_id', companyId).eq('worksite_id', worksiteId).eq('reception', 'avec').in('status', COUNTED)
      .order('id').range(f, t) as never),
    supabase.from('active_sessions').select('user_id', { count: 'exact', head: true }).eq('company_id', companyId).eq('worksite_id', worksiteId),
    fetchAllPaged<{ status: string; total_minutes: number }>((f, t) => supabase.from('time_entries')
      .select('id, status, total_minutes')
      .eq('company_id', companyId).eq('worksite_id', worksiteId).eq('status', 'draft')
      .order('id').range(f, t) as never),
    fetchAllPaged<{ id: string; work_date: string; absence_type: string | null }>((f, t) => supabase.from('planning')
      .select('id, work_date, absence_type')
      .eq('company_id', companyId).eq('worksite_id', worksiteId).gte('work_date', today)
      .order('id').range(f, t) as never),
    // Aujourd'hui : une case déjà pointée (heures envoyées) n'est plus « à venir ».
    supabase.from('time_entries').select('planning_id')
      .eq('company_id', companyId).eq('worksite_id', worksiteId).eq('work_date', today).in('status', COUNTED).not('planning_id', 'is', null),
  ]);
  if (live.error) throw live.error;
  if (doneToday.error) throw doneToday.error;
  return {
    reserves: reserves.filter((r) => !isReserveLifted(r)).length,
    live: live.count ?? 0,
    drafts: countDrafts(drafts),
    future: countUpcoming(plan, today, ((doneToday.data || []) as { planning_id: string }[]).map((r) => r.planning_id)),
  };
}

export interface BilanData {
  worksite: { id: string; client_name: string; city: string | null; completed_at: string | null };
  bilan: Bilan;
  /** Mode support : my_worksite_labour répond pour l'entreprise du compte support, pas pour le client visité. Mieux vaut le dire que montrer des zéros. */
  hoursUnavailable: boolean;
}

/**
 * Le bilan, lu À L'OUVERTURE de la fenêtre (rien au chargement de la page). Les lectures en échec LÈVENT :
 * « mieux vaut rien qu'un chiffre faux », comme Coût chantiers.
 */
export async function loadBilan(worksiteId: string, companyId: string, supportMode: boolean): Promise<BilanData> {
  const [wsRes, labourRes, entries, usersRes, expenses, docs] = await Promise.all([
    supabase.from('worksites').select('id, client_name, city, completed_at, budget_hours, budget_amount').eq('id', worksiteId).eq('company_id', companyId).maybeSingle(),
    // Mode support : cette fonction est celle du bureau, elle ne répond que pour SA propre entreprise.
    supportMode ? Promise.resolve({ data: [] as LabourRow[], error: null }) : supabase.rpc('my_worksite_labour', { p_from: null, p_to: null }),
    fetchAllPaged<{
      id: string; user_id: string; work_date: string; status: string; total_minutes: number; reception: string | null; observation: string | null;
      reserve_resolved_at: string | null; reserve_fixed_at: string | null;
    }>((f, t) => supabase.from('time_entries')
      .select('id, user_id, work_date, status, total_minutes, reception, observation, reserve_resolved_at, reserve_fixed_at')
      .eq('company_id', companyId).eq('worksite_id', worksiteId).in('status', ['draft', ...COUNTED])
      .order('work_date', { ascending: false }).order('id').range(f, t) as never),
    supabase.from('users').select('id, first_name, last_name').eq('company_id', companyId),
    fetchAllPaged<{ category: string; amount: number }>((f, t) => supabase.from('worksite_expenses')
      .select('id, category, amount').eq('company_id', companyId).eq('worksite_id', worksiteId)
      .order('id').range(f, t) as never),
    fetchAllPaged<{ category: string | null }>((f, t) => supabase.from('documents')
      .select('id, category').eq('company_id', companyId).eq('worksite_id', worksiteId)
      .order('id').range(f, t) as never),
  ]);
  if (wsRes.error || !wsRes.data) throw wsRes.error || new Error('Chantier introuvable.');
  if (labourRes.error) throw labourRes.error;
  const ws = wsRes.data as { id: string; client_name: string | null; city: string | null; completed_at?: string | null; budget_hours: number | null; budget_amount: number | null };

  const names: Record<string, string> = {};
  for (const u of (usersRes.data || []) as { id: string; first_name: string | null; last_name: string | null }[]) {
    names[u.id] = `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Salarié';
  }
  const bilanEntries: BilanEntry[] = entries.map((e) => ({
    id: e.id, user_id: e.user_id, work_date: e.work_date, status: e.status, total_minutes: Number(e.total_minutes || 0),
    reception: e.reception, observation: e.observation, lifted: isReserveLifted(e),
  }));
  const completed = ws.completed_at ?? null;
  return {
    worksite: { id: ws.id, client_name: ws.client_name || 'Chantier', city: ws.city, completed_at: completed },
    hoursUnavailable: supportMode,
    bilan: buildBilan({
      worksiteId, completedDay: completed ? String(completed).slice(0, 10) : null,
      labour: ((labourRes.data || []) as LabourRow[]),
      entries: bilanEntries, names,
      expenses: expenses.map((e) => ({ category: e.category, amount: Number(e.amount) })),
      docs: docs.map((d) => ({ category: d.category })),
      budget: { hours: ws.budget_hours, amount: ws.budget_amount },
      office: true, // fenêtre du bureau : les factures se comptent (lot 24)
    }),
  };
}
