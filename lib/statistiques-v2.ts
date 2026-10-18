// Design du bureau (v2, `?ui=2`) · « Statistiques » re-dessinée (dossier docs/design-brief/designer-statistiques). LECTURE SEULE.
//
// AUCUNE NOUVELLE RÈGLE. Les mêmes lectures que lib/team-stats.ts (le popup du lot 5) et les mêmes fonctions de calcul, découpées par PILIER
// (un jour en Semaine, une semaine du mois en Mois, un mois en Année) :
//   · heures, normales, sup    weeklyRecap (CSV de paie) avec payPeriod = le pilier : la semaine entière classe, seuls les jours du pilier
//                              comptent ; Σ des piliers = la période, au centième près (les tranches sont jour par jour) ;
//   · oublis                   missingDaysFrom (cockpit « à relancer ») ;
//   · absences                 absencesByUser (jours du planning, jusqu'à aujourd'hui) ;
//   · coût                     my_worksite_labour (« Coût chantiers » : taux horaire actuel, sans majoration) ;
//   · contrat (ligne pointillée)  l'horaire de base weeklyHoursFor(salarié, entreprise) réparti du lundi au vendredi, jours passés seulement ;
//   · chantiers (anneau)       les mêmes heures envoyées, rangées par chantier (time_entries.worksite_id, noms de worksites).
// Aucune écriture, aucune migration, aucune fonction serveur nouvelle.

import { supabase } from '@/lib/supabase';
import { fetchAllPaged } from '@/lib/fetch-all';
import { weeklyRecap, type ExportEntry } from '@/lib/export-utils';
import { DEFAULT_WEEKLY_HOURS, routeMinutesByEntry, weeklyHoursFor } from '@/lib/overtime';
import { isExitToComplete, type QrFields } from '@/lib/qr-entry';
import { COUNTED_STATUSES } from '@/lib/status';
import { withdrawnSet } from '@/lib/planning-cells';
import { addDaysISO } from '@/supabase/functions/_shared/print-period';
import {
  absencesByUser, dayChunks, isoWeek, labourByUser, missingDaysFrom, mondayOf, periodFor, recapByUser, shiftPeriod, wholeWeeks,
  type LabourRowLike, type PeriodKind, type PlanRowLike,
} from '@/supabase/functions/_shared/team-stats-core';

export type Vue = 'semaine' | 'mois' | 'annee';
const KIND: Record<Vue, PeriodKind> = { semaine: 'week', mois: 'month', annee: 'year' };

const DOW = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const DOWL = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const MS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const ML = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MA = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const jour = (iso: string) => Number(iso.slice(8, 10));
const mois = (iso: string) => Number(iso.slice(5, 7)) - 1;
/** 0 = lundi … 6 = dimanche. */
export const dowLun = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
const ouvre = (iso: string) => dowLun(iso) < 5;
const joursEntre = (from: string, to: string) => { const out: string[] = []; for (let d = from; d <= to; d = addDaysISO(d, 1)) out.push(d); return out; };

export interface Pilier { label: string; sub: string; full: string; from: string; to: string; days: string[]; today: boolean; future: boolean }
export interface Periode {
  vue: Vue; off: number; from: string; to: string; piliers: Pilier[];
  title: string; sub: string; unit: string; cmp: string; kick: string;
  /** La période précédente comparable (coupée au même avancement si la période affichée est en cours). */
  prev: { from: string; to: string; today: string };
  future: boolean;
}

/** La période affichée (`off` = 0 : celle d'aujourd'hui) et ses piliers — mêmes libellés que la planche. */
export function periodeV2(vue: Vue, off: number, today: string): Periode {
  const base = shiftPeriod(periodFor(KIND[vue], today), off);
  const { from, to } = base;
  let piliers: Pilier[] = []; let title = ''; let sub = ''; let unit = ''; let cmp = ''; let kick = '';
  const p = (x: Omit<Pilier, 'today' | 'future'>): Pilier => ({ ...x, today: today >= x.from && today <= x.to, future: x.from > today });
  if (vue === 'semaine') {
    piliers = joursEntre(from, to).map((d, i) => p({ label: DOW[i], sub: String(jour(d)), full: `${DOWL[i]} ${jour(d)} ${ML[mois(d)]}`, from: d, to: d, days: [d] }));
    const s = mois(from) === mois(to) ? `${jour(from)} – ${jour(to)} ${MS[mois(to)]} ${to.slice(0, 4)}` : `${jour(from)} ${MS[mois(from)]} – ${jour(to)} ${MS[mois(to)]} ${to.slice(0, 4)}`;
    title = `Semaine ${isoWeek(from)}`; sub = s.toUpperCase(); unit = 'JOUR'; cmp = 'vs sem. préc.'; kick = 'DÉTAIL DU JOUR';
  } else if (vue === 'mois') {
    const groupes: string[][] = [];
    for (const d of joursEntre(from, to)) { const g = groupes[groupes.length - 1]; if (g && mondayOf(g[0]) === mondayOf(d)) g.push(d); else groupes.push([d]); }
    piliers = groupes.map((g) => { const f = g[0], l = g[g.length - 1]; return p({ label: `S${isoWeek(f)}`, sub: `${jour(f)}–${jour(l)}`, full: `Semaine ${isoWeek(f)} · ${jour(f)}–${jour(l)} ${MS[mois(f)]}`, from: f, to: l, days: g }); });
    title = `${cap(ML[mois(from)])} ${from.slice(0, 4)}`; sub = `${groupes.length} SEMAINES`; unit = 'SEMAINE'; cmp = 'vs mois préc.'; kick = 'DÉTAIL DE LA SEMAINE';
  } else {
    const y = from.slice(0, 4);
    piliers = MA.map((lab, m) => { const mm = String(m + 1).padStart(2, '0'); const pm = periodFor('month', `${y}-${mm}-01`); return p({ label: lab, sub: '', full: `${cap(ML[m])} ${y}`, from: pm.from, to: pm.to, days: joursEntre(pm.from, pm.to) }); });
    title = `Année ${y}`; sub = `JANV. – DÉC. ${y}`; unit = 'MOIS'; cmp = 'vs année préc.'; kick = 'DÉTAIL DU MOIS';
  }
  const pp = shiftPeriod(base, -1);
  let prev = { from: pp.from, to: pp.to, today };
  if (today >= from && today <= to) {
    // Même avancement : semaine → J-7 ; mois → même jour du mois précédent (borné à sa fin) ; année → même date N-1.
    let cut: string;
    if (vue === 'semaine') cut = addDaysISO(today, -7);
    else if (vue === 'mois') { const d = Math.min(jour(today), jour(pp.to)); cut = `${pp.from.slice(0, 8)}${String(d).padStart(2, '0')}`; }
    else { const c = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`; cut = c.endsWith('02-29') ? c.replace('02-29', '02-28') : c; }
    prev = { from: pp.from, to: cut, today: cut };
  }
  return { vue, off, from, to, piliers, title, sub, unit, cmp, kick, prev, future: from > today };
}

// ─── Lectures (les mêmes que lib/team-stats.ts, sur la période précédente + la période) ─────────────────────────────

type Paged<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
const paged = <T>(build: (f: number, t: number) => unknown): Promise<T[]> => fetchAllPaged<T>((f, t) => build(f, t) as Paged<T>);
const optional = <T>(p: Promise<T>): Promise<T | null> => p.then((v) => v, () => null);

export type EntryRow = {
  id: string; user_id: string; work_date: string; start_time: string; end_time: string; total_minutes: number; status: string;
  gap_before: 'route' | 'pause' | null; worksite_id: string | null; break_minutes?: number | null;
};
type PlanRow = PlanRowLike & { worksite_id?: string | null };
type UserRow = { id: string; first_name: string | null; last_name: string | null; role: string | null; is_active: boolean | null };

export interface Brut {
  users: UserRow[]; weekly: Map<string, number>; companyWeekly: number; travelPaid: boolean;
  entries: EntryRow[]; plan: PlanRow[]; withdrawn: Set<string>; incomplete: { user_id: string; work_date: string }[];
  worksites: Map<string, string>; labour: LabourRowLike[] | null;
}

/**
 * Lit tout ce qu'il faut pour la période et la période précédente comparable. Lève une erreur si une lecture INDISPENSABLE échoue
 * (heures, planning, salariés, réglages) : la page dit alors « Impossible de charger les statistiques », sans chiffre partiel.
 * Facultatives (rien ne casse sans elles) : coût, cases retirées, sorties « à compléter », noms des chantiers.
 */
export async function lireStatsV2(companyId: string, per: Periode): Promise<Brut> {
  const from = per.prev.from < per.from ? per.prev.from : per.from;
  const to = per.to;
  const weeks = wholeWeeks(from, to);
  const [compRes, payroll, users, entryChunks, planChunks, labour, cancelled, incomplete, ws] = await Promise.all([
    supabase.from('companies').select('travel_paid, weekly_hours').eq('id', companyId).maybeSingle(),
    paged<{ user_id: string; weekly_hours: number | null }>((f, t) => supabase.from('user_payroll')
      .select('user_id, weekly_hours').eq('company_id', companyId).order('user_id').range(f, t)),
    paged<UserRow>((f, t) => supabase.from('users')
      .select('id, first_name, last_name, role, is_active').eq('company_id', companyId).order('id').range(f, t)),
    Promise.all(dayChunks(weeks.from, weeks.to).map((c) => paged<EntryRow>((f, t) => supabase.from('time_entries')
      .select('id, user_id, work_date, start_time, end_time, total_minutes, status, gap_before, worksite_id, break_minutes')
      .eq('company_id', companyId).in('status', [...COUNTED_STATUSES])
      .gte('work_date', c.from).lte('work_date', c.to)
      .order('work_date').order('id').range(f, t)))),
    Promise.all(dayChunks(from, to).map((c) => paged<PlanRow>((f, t) => supabase.from('planning')
      .select('id, user_id, work_date, absence_type, worksite_id').eq('company_id', companyId)
      .gte('work_date', c.from).lte('work_date', c.to)
      .order('work_date').order('id').range(f, t)))),
    per.future ? Promise.resolve(null) : optional(paged<LabourRowLike>((f, t) => supabase.rpc('my_worksite_labour', { p_from: per.from, p_to: per.to })
      .order('user_id').order('worksite_id').range(f, t))),
    optional(paged<{ id: string; planning_id: string | null }>((f, t) => supabase.from('time_entries')
      .select('id, planning_id').eq('company_id', companyId).eq('status', 'cancelled').not('planning_id', 'is', null)
      .gte('work_date', from).lte('work_date', to).order('id').range(f, t))),
    optional(paged<QrFields & { id: string; user_id: string; work_date: string }>((f, t) => supabase.from('time_entries')
      .select('id, user_id, work_date, start_time, end_time, exit_forgotten').eq('company_id', companyId)
      .eq('exit_forgotten', true).eq('status', 'draft').gte('work_date', from).lte('work_date', to).order('id').range(f, t))),
    optional(paged<{ id: string; client_name: string | null }>((f, t) => supabase.from('worksites')
      .select('id, client_name').eq('company_id', companyId).order('id').range(f, t))),
  ]);
  if (compRes.error) throw compRes.error;
  const comp = compRes.data as { travel_paid?: boolean | null; weekly_hours?: number | null } | null;
  return {
    users,
    weekly: new Map(payroll.filter((r) => r.weekly_hours != null).map((r) => [r.user_id, r.weekly_hours as number])),
    companyWeekly: comp?.weekly_hours ?? DEFAULT_WEEKLY_HOURS,
    travelPaid: !!comp?.travel_paid,
    entries: entryChunks.flat(),
    plan: planChunks.flat(),
    withdrawn: withdrawnSet(cancelled),
    incomplete: (incomplete || []).filter((r) => isExitToComplete(r)),
    worksites: new Map((ws || []).map((w) => [w.id, w.client_name || 'Chantier'])),
    labour,
  };
}

// ─── Calcul (pur) ───────────────────────────────────────────────────────────────────────────────────────────────

/** Minutes : n normales, s sup (25 % + 50 %), m = n + s (= « Total heures » du CSV) ; abs en JOURS ; oub en jours ; con = contrat (min). */
export interface Cellule { n: number; s: number; m: number; abs: number; oub: number; con: number }
const zero = (): Cellule => ({ n: 0, s: 0, m: 0, abs: 0, oub: 0, con: 0 });
export const somme = (l: Cellule[]): Cellule => l.reduce((t, x) => ({ n: t.n + x.n, s: t.s + x.s, m: t.m + x.m, abs: t.abs + x.abs, oub: t.oub + x.oub, con: t.con + x.con }), zero());

export interface SalarieV2 {
  id: string; name: string; first: string; ini: string; role: string; tag: 'archivé' | 'bureau' | null;
  /** Horaire de base (h/semaine). */
  base: number;
  cells: Cellule[]; tot: Cellule; prev: Cellule;
  /** Journées oubliées de la période (règle du cockpit), du plus récent au plus ancien. */
  oublis: string[];
  /** Coût « Coût chantiers » de la période ; null = non chiffré. */
  cost: number | null; unpriced: boolean;
  /** Taux horaire actuel déduit de « Coût chantiers » (€/h) ; null = inconnu. */
  rate: number | null;
  /** Minutes par chantier, par pilier. */
  chantiers: Map<string, number>[];
}
export interface StatsV2 {
  per: Periode; today: string; salaries: SalarieV2[];
  /** Au moins un salarié chiffré : le coût s'affiche ; sinon il disparaît sans un mot. */
  coutActif: boolean;
  worksites: Map<string, string>;
  brut: Brut;
}

const ROLE: Record<string, string> = { lead: "Chef d'équipe", worker: 'Salarié', admin: 'Bureau' };

export function calculerStatsV2(brut: Brut, per: Periode, today: string): StatsV2 {
  const { piliers } = per;
  const weeklyByWorker = new Map<string, number>();
  const baseOf = (id: string) => { let b = weeklyByWorker.get(id); if (b == null) { b = weeklyHoursFor(brut.weekly.get(id) ?? null, brut.companyWeekly); weeklyByWorker.set(id, b); } return b; };
  for (const u of brut.users) baseOf(u.id);
  for (const e of brut.entries) baseOf(e.user_id);
  const recap = (from: string, to: string) => recapByUser(weeklyRecap({
    recapEntries: brut.entries as unknown as ExportEntry[], travelPaid: brut.travelPaid, weeklyHoursByWorker: weeklyByWorker, payPeriod: { from, to },
  }));
  const parPilier = piliers.map((b) => (b.future ? new Map() : recap(b.from, b.to < today ? b.to : today)));
  const prevRecap = recap(per.prev.from, per.prev.to);

  const missNow = missingDaysFrom({ planRows: brut.plan, declaredRows: brut.entries, withdrawnIds: brut.withdrawn, incompleteRows: brut.incomplete, today });
  const missPrev = per.prev.today === today ? missNow : missingDaysFrom({ planRows: brut.plan, declaredRows: brut.entries, withdrawnIds: brut.withdrawn, incompleteRows: brut.incomplete, today: per.prev.today });
  const absPilier = piliers.map((b) => absencesByUser(brut.plan, b.from, b.to, today));
  const absTot = absencesByUser(brut.plan, per.from, per.to, today);
  const absPrev = absencesByUser(brut.plan, per.prev.from, per.prev.to, per.prev.today);

  // Les heures envoyées par chantier (route payée comprise si l'entreprise la paie, comme « Total heures »).
  const route = brut.travelPaid ? routeMinutesByEntry(brut.entries) : new Map<string, number>();
  const idx = new Map<string, number>(); piliers.forEach((b, i) => b.days.forEach((d) => idx.set(d, i)));
  const chParUser = new Map<string, Map<string, number>[]>();
  for (const e of brut.entries) {
    const i = idx.get(e.work_date); if (i == null || e.work_date > today || !e.worksite_id) continue;
    let arr = chParUser.get(e.user_id); if (!arr) { arr = piliers.map(() => new Map()); chParUser.set(e.user_id, arr); }
    arr[i].set(e.worksite_id, (arr[i].get(e.worksite_id) || 0) + Math.max(0, e.total_minutes || 0) + (route.get(e.id) || 0));
  }

  const labour = brut.labour ? labourByUser(brut.labour) : null;
  const known = new Map(brut.users.map((u) => [u.id, u]));
  const inGrid = (u: UserRow) => (u.role === 'worker' || u.role === 'lead') && u.is_active === true;
  const ids = new Set<string>(brut.users.filter(inGrid).map((u) => u.id));
  parPilier.forEach((m) => m.forEach((r, id) => { if (r.minutes > 0) ids.add(id); }));
  absTot.forEach((a, id) => { if (a.total > 0) ids.add(id); });
  missNow.forEach((d, id) => { if (d.some((x) => x >= per.from && x <= per.to)) ids.add(id); });

  const salaries: SalarieV2[] = Array.from(ids).map((id) => {
    const u = known.get(id);
    const first = u?.first_name?.trim() || ''; const last = u?.last_name?.trim() || '';
    const name = `${first} ${last}`.trim() || 'Salarié';
    const tag: SalarieV2['tag'] = u && inGrid(u) ? null : (!u || u.is_active === false ? 'archivé' : u.role === 'admin' ? 'bureau' : 'archivé');
    const base = baseOf(id);
    const parJour = Math.round((base * 60) / 5);
    const miss = missNow.get(id) || [];
    const cells = piliers.map((b, i): Cellule => {
      const r = parPilier[i].get(id);
      const n = r?.normal || 0; const s = (r?.t1 || 0) + (r?.t2 || 0);
      return {
        n, s, m: r?.minutes || 0,
        abs: absPilier[i].get(id)?.total || 0,
        oub: miss.filter((d) => d >= b.from && d <= b.to).length,
        con: b.days.filter((d) => d <= today && ouvre(d)).length * parJour,
      };
    });
    const pr = prevRecap.get(id);
    const prev: Cellule = {
      n: pr?.normal || 0, s: (pr?.t1 || 0) + (pr?.t2 || 0), m: pr?.minutes || 0,
      abs: absPrev.get(id)?.total || 0,
      oub: (missPrev.get(id) || []).filter((d) => d >= per.prev.from && d <= per.prev.to).length, con: 0,
    };
    const l = labour?.get(id);
    const pricedMin = l ? l.paid - l.unpriced : 0;
    return {
      id, name, first: first || name.split(' ')[0], ini: ((first[0] || '') + (last[0] || '')).toUpperCase() || name.slice(0, 2).toUpperCase(),
      role: tag === 'archivé' ? 'Archivé' : ROLE[u?.role || ''] || 'Salarié', tag, base,
      cells, tot: somme(cells), prev,
      oublis: miss.filter((d) => d >= per.from && d <= per.to),
      cost: l && l.priced ? l.cost : null, unpriced: !!l && l.unpriced > 0,
      rate: l && l.priced && pricedMin > 0 ? l.cost / (pricedMin / 60) : null,
      chantiers: chParUser.get(id) || piliers.map(() => new Map()),
    };
  });
  salaries.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return { per, today, salaries, coutActif: salaries.some((s) => s.cost != null), worksites: brut.worksites, brut };
}

/** La part prévue d'un pilier à venir (contour pointillé) : horaire de base réparti du lundi au vendredi. */
export function contratTheorique(b: Pilier, scope: SalarieV2[]): number {
  const ouvres = b.days.filter(ouvre).length;
  return scope.reduce((t, s) => t + ouvres * Math.round((s.base * 60) / 5), 0);
}

// ─── Fiche salarié : le détail jour par jour ─────────────────────────────────────────────────────────────────────

export interface JourV2 {
  date: string; n: number; s: number; m: number; route: number;
  absence: string | null; oubli: boolean;
  creneaux: { debut: string; fin: string; gap: 'route' | 'pause' | null; pause: number }[];
  chantiers: Map<string, number>;
  /** Chantier prévu au planning ce jour-là (oubli). */
  prevu: string | null;
}

/** Les jours (passés) d'un salarié sur [from, to], avec les MÊMES calculs (weeklyRecap jour par jour, règle du cockpit). */
export function joursSalarie(st: StatsV2, sal: SalarieV2, from: string, to: string): JourV2[] {
  const { brut, today } = st;
  const mine = brut.entries.filter((e) => e.user_id === sal.id);
  const route = brut.travelPaid ? routeMinutesByEntry(mine) : new Map<string, number>();
  const wk = new Map([[sal.id, sal.base]]);
  const plan = brut.plan.filter((p) => p.user_id === sal.id);
  const out: JourV2[] = [];
  const oub = new Set(sal.oublis);
  for (const d of joursEntre(from, to < today ? to : today)) {
    const r = recapByUser(weeklyRecap({ recapEntries: mine as unknown as ExportEntry[], travelPaid: brut.travelPaid, weeklyHoursByWorker: wk, payPeriod: { from: d, to: d } })).get(sal.id);
    const es = mine.filter((e) => e.work_date === d).sort((a, b) => (a.start_time < b.start_time ? -1 : 1));
    const ch = new Map<string, number>();
    for (const e of es) if (e.worksite_id) ch.set(e.worksite_id, (ch.get(e.worksite_id) || 0) + Math.max(0, e.total_minutes || 0) + (route.get(e.id) || 0));
    const ab = plan.find((p) => p.work_date === d && p.absence_type);
    const pv = plan.find((p) => p.work_date === d && !p.absence_type && p.worksite_id);
    out.push({
      date: d, n: r?.normal || 0, s: (r?.t1 || 0) + (r?.t2 || 0), m: r?.minutes || 0, route: r?.route || 0,
      absence: ab ? String(ab.absence_type) : null, oubli: oub.has(d),
      creneaux: es.map((e) => ({ debut: e.start_time, fin: e.end_time, gap: e.gap_before, pause: Math.max(0, Number(e.break_minutes || 0)) })),
      chantiers: ch, prevu: pv?.worksite_id ? brut.worksites.get(pv.worksite_id) || null : null,
    });
  }
  return out;
}

export const LIB_ABSENCE: Record<string, string> = { conge: 'Congé', maladie: 'Arrêt maladie', intemperie: 'Intempérie', repos: 'Repos' };
