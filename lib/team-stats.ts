// Lot 5 — « Statistiques » du bureau : les lectures, puis le calcul avec les
// fonctions QUI EXISTENT DÉJÀ. Lecture seule : aucune écriture ici.
//
//   Heures, heures sup  weeklyRecap (lib/export-utils.ts), la fonction du CSV
//                       de paie, avec les mêmes entrées que l'export de
//                       l'équipe : lignes ENVOYÉES (lib/status.ts) sur les
//                       semaines entières, route payée si l'entreprise la paie,
//                       horaire de base weeklyHoursFor(salarié, entreprise), et
//                       payPeriod = la période (la semaine entière classe, seuls
//                       les jours de la période comptent : 12 mois = l'année).
//   Coût                my_worksite_labour, la fonction SQL de « Coût chantiers »
//                       (taux horaire actuel, sans majoration).
//   Journées oubliées   la règle du cockpit « à relancer » (missingDaysFrom).
//   Absences            les jours d'absence du planning.
//   Relances reçues     le journal hours_reminders (migration du lot 5) ; caché
//                       tant que la table n'existe pas.
//   Renvoyées           time_entry_edits kind = 'return' (lot 2), si lisible.
//
// Tâches et réunions (lot 4) ne sont jamais lues : elles ne comptent pas.
//
// PAGINATION. PostgREST plafonne une réponse à 1000 lignes SANS erreur : tout
// ce qui peut dépasser passe par fetchAllPaged, avec un ordre UNIQUE (sinon
// une page peut sauter ou répéter des lignes). Heures et planning sont en plus
// lus par tranches de 31 jours en parallèle (vue « Année »).

import { supabase } from '@/lib/supabase';
import { fetchAllPaged } from '@/lib/fetch-all';
import { weeklyRecap, type ExportEntry } from '@/lib/export-utils';
import { DEFAULT_OVERTIME_RATES, DEFAULT_WEEKLY_HOURS, weeklyHoursFor, type OvertimeRates } from '@/lib/overtime';
import { isExitToComplete, type QrFields } from '@/lib/qr-entry';
import { COUNTED_STATUSES } from '@/lib/status';
import { withdrawnSet } from '@/lib/planning-cells';
import {
  absencesByUser, countByUser, dayChunks, distinctUserDays, labourByUser, missingDaysFrom, recapByUser, wholeWeeks,
  type AbsenceCount, type LabourRowLike, type Period, type PlanRowLike,
} from '@/supabase/functions/_shared/team-stats-core';

export interface StatsRow {
  id: string;
  name: string;
  /** Hors liste du planning, présent parce qu'il a des heures ou des absences sur la période. */
  tag: 'archivé' | 'bureau' | null;
  /** Minutes travaillées (route payée comprise si l'entreprise la paie) = « Total heures » du CSV. */
  minutes: number;
  normal: number; t1: number; t2: number;
  /** t1 + t2 = « Heures sup 25 % » + « Heures sup 50 % » du CSV. */
  overtime: number;
  route: number;
  /** Horaire de base appliqué (h/semaine) ; null = aucune heure sur la période. */
  base: number | null;
  absences: AbsenceCount;
  /** Journées oubliées de la période (règle du cockpit), du plus récent au plus ancien. */
  forgotten: string[];
  /** Coût « Coût chantiers » ; null = rien de chiffré (pas d'heure, ou taux horaire manquant). */
  cost: number | null;
  /** Des heures sans taux horaire : « taux à renseigner ». */
  unpriced: boolean;
  returns: number;
  reminders: number;
}

export interface TeamStatsResult {
  rows: StatsRow[];
  travelPaid: boolean;
  rates: OvertimeRates;
  /** my_worksite_labour lisible. */
  costAvailable: boolean;
  /** Au moins un salarié de la liste a des heures chiffrées : sinon la colonne Coût est cachée. */
  anyPriced: boolean;
  returnsAvailable: boolean;
  remindersAvailable: boolean;
  /** Instant (ISO) de la plus ancienne relance notée au journal : « comptées depuis le… ». */
  remindersSince: string | null;
}

const NO_ABSENCE: AbsenceCount = { conge: 0, maladie: 0, intemperie: 0, autre: 0, total: 0, upcoming: 0 };
type Paged<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
/** fetchAllPaged sur une requête supabase-js (le typage des constructeurs est trop large). */
const paged = <T>(build: (f: number, t: number) => unknown): Promise<T[]> => fetchAllPaged<T>((f, t) => build(f, t) as Paged<T>);
/** Une lecture facultative : null si elle échoue (table absente, colonne absente, refus). */
const optional = <T>(p: Promise<T>): Promise<T | null> => p.then((v) => v, () => null);
/** Minuit (heure locale du bureau) d'un jour, en instant ISO — pour filtrer des horodatages. */
const localMidnight = (iso: string) => new Date(`${iso}T00:00:00`).toISOString();
const addDay = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

type EntryRow = { id: string; user_id: string; work_date: string; start_time: string; end_time: string; total_minutes: number; status: string; gap_before: 'route' | 'pause' | null };
type UserRow = { id: string; first_name: string | null; last_name: string | null; role: string | null; is_active: boolean | null };

/**
 * Lit et calcule les statistiques de la période. Lève une erreur si une
 * lecture INDISPENSABLE échoue (heures, planning, salariés, réglages) : l'écran
 * dit alors « Chiffres illisibles » — mieux vaut rien qu'un chiffre faux. Les
 * lectures facultatives (coût, renvois, relances) ne cachent que leur chiffre.
 */
export async function loadTeamStats(companyId: string, period: Period, today: string): Promise<TeamStatsResult> {
  const { from, to } = period;
  const weeks = wholeWeeks(from, to);

  const [compRes, payroll, users, entryChunks, planChunks, labour, cancelled, incomplete, returns, reminders, firstReminder] = await Promise.all([
    supabase.from('companies').select('travel_paid, weekly_hours, overtime_rate_1, overtime_rate_2').eq('id', companyId).maybeSingle(),
    paged<{ user_id: string; weekly_hours: number | null }>((f, t) => supabase.from('user_payroll')
      .select('user_id, weekly_hours').eq('company_id', companyId).order('user_id').range(f, t)),
    paged<UserRow>((f, t) => supabase.from('users')
      .select('id, first_name, last_name, role, is_active').eq('company_id', companyId).order('id').range(f, t)),
    // Les heures ENVOYÉES des semaines entières (l'export lit exactement ces lignes).
    Promise.all(dayChunks(weeks.from, weeks.to).map((c) => paged<EntryRow>((f, t) => supabase.from('time_entries')
      .select('id, user_id, work_date, start_time, end_time, total_minutes, status, gap_before')
      .eq('company_id', companyId).in('status', [...COUNTED_STATUSES])
      .gte('work_date', c.from).lte('work_date', c.to)
      .order('work_date').order('id').range(f, t)))),
    Promise.all(dayChunks(from, to).map((c) => paged<PlanRowLike>((f, t) => supabase.from('planning')
      .select('id, user_id, work_date, absence_type').eq('company_id', companyId)
      .gte('work_date', c.from).lte('work_date', c.to)
      .order('work_date').order('id').range(f, t)))),
    // Coût : la fonction de « Coût chantiers », une ligne par chantier × salarié (couple unique).
    optional(paged<LabourRowLike>((f, t) => supabase.rpc('my_worksite_labour', { p_from: from, p_to: to })
      .order('user_id').order('worksite_id').range(f, t))),
    // Cases retirées par le salarié : rien à lui réclamer (même lecture que le cockpit).
    optional(paged<{ id: string; planning_id: string | null }>((f, t) => supabase.from('time_entries')
      .select('id, planning_id').eq('company_id', companyId).eq('status', 'cancelled').not('planning_id', 'is', null)
      .gte('work_date', from).lte('work_date', to).order('id').range(f, t))),
    // Lot 12 : sorties oubliées « à compléter » (colonne absente avant la migration → rien).
    optional(paged<QrFields & { id: string; user_id: string; work_date: string }>((f, t) => supabase.from('time_entries')
      .select('id, user_id, work_date, start_time, end_time, exit_forgotten').eq('company_id', companyId)
      .eq('exit_forgotten', true).eq('status', 'draft').gte('work_date', from).lte('work_date', to).order('id').range(f, t))),
    // Lot 2 : journées renvoyées par le bureau.
    optional(paged<{ id: string; worker_id: string; work_date: string }>((f, t) => supabase.from('time_entry_edits')
      .select('id, worker_id, work_date').eq('company_id', companyId).eq('kind', 'return')
      .gte('work_date', from).lte('work_date', to).order('id').range(f, t))),
    // Lot 5 : journal des relances (table absente tant que la migration n'est pas passée).
    optional(paged<{ id: string; user_id: string; sent_at: string }>((f, t) => supabase.from('hours_reminders')
      .select('id, user_id, sent_at').eq('company_id', companyId)
      .gte('sent_at', localMidnight(from)).lt('sent_at', localMidnight(addDay(to))).order('id').range(f, t))),
    optional(Promise.resolve(supabase.from('hours_reminders').select('sent_at').eq('company_id', companyId)
      .order('sent_at', { ascending: true }).limit(1)).then(({ data, error }) => { if (error) throw error; return (data || []) as { sent_at: string }[]; })),
  ]);
  if (compRes.error) throw compRes.error;

  const comp = compRes.data as { travel_paid?: boolean | null; weekly_hours?: number | null; overtime_rate_1?: number | null; overtime_rate_2?: number | null } | null;
  const travelPaid = !!comp?.travel_paid;
  const companyWeekly = comp?.weekly_hours ?? DEFAULT_WEEKLY_HOURS;
  const entries = entryChunks.flat();
  const plan = planChunks.flat();

  // ── Heures et heures sup : LA fonction du CSV de paie ─────────────────────
  const overrides = new Map(payroll.filter((r) => r.weekly_hours != null).map((r) => [r.user_id, r.weekly_hours as number]));
  const weeklyHoursByWorker = new Map<string, number>(
    Array.from(new Set(entries.map((e) => e.user_id))).map((id) => [id, weeklyHoursFor(overrides.get(id) ?? null, companyWeekly)]),
  );
  const recap = recapByUser(weeklyRecap({
    recapEntries: entries as unknown as ExportEntry[],
    travelPaid,
    weeklyHoursByWorker,
    payPeriod: { from, to },
  }));

  // ── Journées oubliées : la règle du cockpit ───────────────────────────────
  const missing = missingDaysFrom({
    planRows: plan,
    declaredRows: entries,
    withdrawnIds: withdrawnSet(cancelled),
    incompleteRows: (incomplete || []).filter((r) => isExitToComplete(r)),
    today,
  });

  const absences = absencesByUser(plan, from, to, today);
  const cost = labour ? labourByUser(labour) : null;
  const returnsBy = returns ? distinctUserDays(returns.map((r) => ({ user_id: r.worker_id, work_date: r.work_date })), from, to) : null;
  const remindersBy = reminders ? countByUser(reminders) : null;

  // ── Les lignes : la liste du planning, plus qui a des heures ou des absences ──
  const known = new Map(users.map((u) => [u.id, u]));
  const inGrid = (u: UserRow) => (u.role === 'worker' || u.role === 'lead') && u.is_active === true;
  const ids = new Set<string>(users.filter(inGrid).map((u) => u.id));
  recap.forEach((r, id) => { if (r.minutes > 0) ids.add(id); });
  absences.forEach((a, id) => { if (a.total > 0) ids.add(id); });

  const rows: StatsRow[] = Array.from(ids).map((id) => {
    const u = known.get(id);
    const r = recap.get(id);
    const l = cost?.get(id);
    const tag: StatsRow['tag'] = u && inGrid(u) ? null : (!u || u.is_active === false ? 'archivé' : u.role === 'admin' ? 'bureau' : 'archivé');
    return {
      id,
      name: `${u?.first_name || ''} ${u?.last_name || ''}`.trim() || 'Salarié',
      tag,
      minutes: r?.minutes || 0,
      normal: r?.normal || 0,
      t1: r?.t1 || 0,
      t2: r?.t2 || 0,
      overtime: (r?.t1 || 0) + (r?.t2 || 0),
      route: r?.route || 0,
      base: r ? r.base : null,
      absences: absences.get(id) || NO_ABSENCE,
      forgotten: (missing.get(id) || []).filter((d) => d >= from && d <= to),
      cost: l && l.priced ? l.cost : null,
      unpriced: !!l && l.unpriced > 0,
      returns: returnsBy?.get(id) || 0,
      reminders: remindersBy?.get(id) || 0,
    };
  });

  return {
    rows,
    travelPaid,
    rates: { tier1: comp?.overtime_rate_1 ?? DEFAULT_OVERTIME_RATES.tier1, tier2: comp?.overtime_rate_2 ?? DEFAULT_OVERTIME_RATES.tier2 },
    costAvailable: !!cost,
    anyPriced: rows.some((r) => r.cost !== null),
    returnsAvailable: !!returnsBy,
    remindersAvailable: !!remindersBy,
    remindersSince: firstReminder && firstReminder.length ? firstReminder[0].sent_at : null,
  };
}
