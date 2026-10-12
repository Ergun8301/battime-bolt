// Lot 8 — VERSIONS DU PLANNING, côté navigateur : garder une version, la lire,
// et « Revenir à cette version ».
//
// Tout passe par la session du BUREAU connecté (ses droits, sa RLS) — jamais par
// une clé de service, jamais par une fonction SQL qui efface. Revenir à une
// version, c'est :
//   1. LIRE le planning et calculer la différence avec la version
//      (supabase/functions/_shared/planning-versions.ts) — rien n'est écrit ;
//   2. GARDER l'état actuel comme nouvelle version (« Annuler » y revient) ;
//      si ce n'est pas possible, on ne touche à rien ;
//   3. appliquer avec les écritures EXISTANTES du planning : retirer par
//      erasePlanning (lib/erase.ts : relit chaque case, garde celles qui portent
//      des heures, efface les brouillons vides, détache les lignes retirées),
//      déplacer par prepareMove + updatePlanningSlot (la règle du glisser),
//      remettre une case avec son identifiant d'origine quand c'est possible.
// Seules les CASES de travail bougent : jamais les heures, jamais les absences.
// Gardées (et c'est dit) : cases avec des heures, d'un mois clôturé, avec un
// pointage en cours, ajoutées par le salarié. Les traces du lot 3 notent chaque
// case touchée (origine « écran », ou « assistant » si c'est l'assistant qui restaure).
//
// L'aperçu que le bureau confirme porte une empreinte : si le planning a bougé
// entre l'aperçu et le clic, rien n'est fait et l'aperçu est refait. Même règle pour
// « Annuler » : il ne part en un clic que si le planning est resté comme le retour
// l'a laissé (empreinte `after`) ; sinon, c'est un nouvel aperçu à confirmer.
//
// AVANT LA MIGRATION (20261012100000), RIEN NE CHANGE : la table manque
// (PGRST205) → versionsAvailable() répond 'off', l'entrée « Versions » reste
// cachée et l'assistant n'écrit aucune version.
import { supabase, withOrigin } from '@/lib/supabase';
import { erasePlanning, prepareMove, undoMovePrep } from '@/lib/erase';
import { updatePlanningSlot } from '@/lib/admin-writes';
import { isMissingRelation } from '@/supabase/functions/_shared/missions';
import {
  CELLS_MAX, cellsFromRows, cellsSignature, chunkByKey, clipNote, clipRequest, countsOf, diffCells, emptyProtection, nothingToDo, planIsEmpty, planRestore, planSignature,
  REASON_CLOSED, REASON_LIVE, restoreSummary, usersOf, weekRange,
  type PlanningVersion, type Protection, type RestoreCounts, type RestorePlan, type VersionCell, type VersionDiff, type VersionKind,
} from '@/supabase/functions/_shared/planning-versions';

export type { PlanningVersion, RestoreCounts, RestorePlan, VersionCell } from '@/supabase/functions/_shared/planning-versions';

const CHUNK = 100;
const chunks = <T,>(a: T[]) => Array.from({ length: Math.ceil(a.length / CHUNK) }, (_, i) => a.slice(i * CHUNK, (i + 1) * CHUNK));
/** Le serveur rend au plus 1000 lignes par lecture : on lit page par page. */
const PAGE = 1000;
/** Une semaine plus chargée que ça (cases + absences) n'est pas lue : on le dit, rien n'est fait. */
const ROWS_MAX = CELLS_MAX * 2;
const LIST_MAX = 50;

// null = pas encore su ; 'off' est définitif pour la session (migration pas passée,
// ou retirée : droits repris) ; une erreur réseau sera redemandée.
let known: 'on' | 'off' | null = null;
/** La table existe-t-elle (et le bureau peut-il la lire) ? Une seule lecture par session. */
export async function versionsAvailable(): Promise<'on' | 'off' | 'error'> {
  if (known) return known;
  try {
    const { error } = await supabase.from('planning_versions').select('id').limit(1);
    if (!error) return (known = 'on');
    if (isMissingRelation(error) || String((error as { code?: string }).code || '') === '42501') return (known = 'off');
    return 'error';
  } catch {
    return 'error';
  }
}

/** Les cases de travail d'une semaine (et les jours d'absence), lues en base, toutes, page par page. */
export async function readWeek(companyId: string, monday: string): Promise<{ cells: VersionCell[]; absentDays: Set<string> }> {
  const { from, to } = weekRange(monday);
  const rows: Record<string, unknown>[] = [];
  // `select('*')` : les colonnes que la base a (ordre des bulles, « ajoutée par le salarié »…).
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabase.from('planning').select('*')
      .eq('company_id', companyId).gte('work_date', from).lte('work_date', to)
      .order('work_date').order('id').range(off, off + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE) break;
    if (rows.length > ROWS_MAX) throw new Error('Semaine trop chargée pour garder une version');
  }
  const { cells, absentDays } = cellsFromRows(rows, { companyId, monday });
  return { cells, absentDays };
}

const asVersion = (r: Record<string, unknown>): PlanningVersion => ({
  ...(r as unknown as PlanningVersion),
  cells: Array.isArray(r.cells) ? (r.cells as VersionCell[]) : [],
  user_ids: Array.isArray(r.user_ids) ? (r.user_ids as string[]) : [],
});

/** Les versions d'une semaine, la plus récente d'abord (les 50 dernières). */
export async function listVersions(companyId: string, monday: string): Promise<PlanningVersion[]> {
  const { data, error } = await supabase.from('planning_versions').select('*')
    .eq('company_id', companyId).eq('week_start', monday).order('number', { ascending: false }).limit(LIST_MAX);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(asVersion);
}

async function latestVersion(companyId: string, monday: string): Promise<PlanningVersion | null> {
  const { data, error } = await supabase.from('planning_versions').select('*')
    .eq('company_id', companyId).eq('week_start', monday).order('number', { ascending: false }).limit(1);
  if (error) throw error;
  const r = ((data ?? []) as Record<string, unknown>[])[0];
  return r ? asVersion(r) : null;
}

/** Garde une version (l'état actuel de la semaine, sauf copie fournie). N°, auteur et date : posés par la base. */
export async function saveVersion(companyId: string, monday: string, kind: VersionKind, o: { request?: string | null; note?: string | null; cells?: VersionCell[] } = {}): Promise<PlanningVersion> {
  const cells = o.cells ?? (await readWeek(companyId, monday)).cells;
  if (cells.length > CELLS_MAX) throw new Error(`Trop de cases pour une version (${cells.length}, ${CELLS_MAX} au plus).`);
  const { data, error } = await supabase.from('planning_versions').insert({
    company_id: companyId, week_start: monday, kind,
    request: kind === 'assistant' ? clipRequest(o.request) : null, note: clipNote(o.note),
    cells, user_ids: usersOf(cells),
  }).select('*').single();
  if (error) throw error;
  return asVersion(data as Record<string, unknown>);
}

// ── L'assistant : avant et après un changement en bloc ─────────────────────
/**
 * AVANT d'écrire : V1 « initiale » si la semaine n'a encore aucune version ;
 * sinon, si le planning a changé à la main depuis la dernière version, cet état
 * est gardé (« Avant l'assistant ») — chaque essai reste réversible.
 * `skipEmpty` (effacer) : une semaine sans aucune case ni version n'a rien à garder.
 * Jamais bloquant : une version qui ne s'écrit pas n'empêche pas l'action, mais
 * on le dit (faux = « version non gardée »). Fonction éteinte : vrai.
 */
export async function recordBeforeAssistant(companyId: string, mondays: string[], o: { skipEmpty?: boolean } = {}): Promise<boolean> {
  if (!mondays.length || (await versionsAvailable()) !== 'on') return true;
  let all = true;
  for (const monday of mondays) {
    try {
      const { cells } = await readWeek(companyId, monday);
      const last = await latestVersion(companyId, monday);
      if (!last) { if (cells.length || !o.skipEmpty) await saveVersion(companyId, monday, 'initial', { cells }); }
      else if (cellsSignature(last.cells) !== cellsSignature(cells)) await saveVersion(companyId, monday, 'avant_assistant', { cells });
    } catch (e) { all = false; console.error('Version « avant » non gardée :', e); }
  }
  return all;
}

/** APRÈS avoir écrit : la nouvelle version, avec la demande. Renvoie les semaines gardées et si tout s'est bien passé. */
export async function recordAfterAssistant(companyId: string, mondays: string[], request: string | null | undefined, note: string): Promise<{ weeks: string[]; ok: boolean }> {
  const weeks: string[] = [];
  if (!mondays.length || (await versionsAvailable()) !== 'on') return { weeks, ok: true };
  let ok = true;
  for (const monday of mondays) {
    try {
      const { cells } = await readWeek(companyId, monday);
      const last = await latestVersion(companyId, monday);
      if (last && cellsSignature(last.cells) === cellsSignature(cells)) continue; // rien n'a changé sur cette semaine
      await saveVersion(companyId, monday, 'assistant', { request, note, cells });
      weeks.push(monday);
    } catch (e) { ok = false; console.error('Version « essai » non gardée :', e); }
  }
  return { weeks, ok };
}

// ── Revenir à une version ───────────────────────────────────────────────────
const monthOf = (iso: string) => iso.slice(0, 7);
const HOURS = 'heures déjà notées par le salarié';

/**
 * Les cases (parmi `cells`) qui portent un pointage en cours : par leur identifiant,
 * ou, pour un pointage sans lien, même salarié, jour et chantier (placeLive l'y rattache).
 */
async function liveIds(companyId: string, monday: string, cells: VersionCell[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!cells.length) return out;
  const { from, to } = weekRange(monday);
  const { data, error } = await supabase.from('active_sessions').select('user_id, planning_id, work_date, worksite_id')
    .eq('company_id', companyId).gte('work_date', from).lte('work_date', to);
  if (error) throw error;
  const ids = new Set(cells.map((c) => c.id));
  for (const s of (data ?? []) as { user_id: string; planning_id: string | null; work_date: string; worksite_id: string | null }[]) {
    if (s.planning_id) { if (ids.has(s.planning_id)) out.add(s.planning_id); continue; }
    for (const c of cells) if (c.user_id === s.user_id && c.work_date === String(s.work_date).slice(0, 10) && c.worksite_id && c.worksite_id === s.worksite_id) out.add(c.id);
  }
  return out;
}

/**
 * Ce qui garde une case, lu en base : heures (le même code que « Supprimer »,
 * lecture seule), pointage en cours, mois clôturé ; et ce qui empêche de remettre
 * une case : identifiant déjà pris, chantier supprimé, salarié archivé. Toute
 * lecture qui échoue arrête tout (rien n'est écrit à ce stade).
 */
async function protectionFor(companyId: string, monday: string, absentDays: Set<string>, diff: VersionDiff): Promise<Protection> {
  const p = emptyProtection();
  p.absentDays = absentDays;
  const { data: cl, error: clErr } = await supabase.from('month_closures').select('month').eq('company_id', companyId);
  if (clErr) throw clErr;
  for (const c of (cl ?? []) as { month: string }[]) p.closedMonths.add(String(c.month).slice(0, 7));

  const touched = [...diff.remove, ...diff.update.map((u) => u.from)];
  // Paquets qui gardent ensemble les cases du même salarié, jour et chantier (erase les juge ensemble).
  for (const part of chunkByKey(touched, CHUNK)) {
    const r = await erasePlanning(companyId, { ids: part.map((c) => c.id), dryRun: true });
    const free = new Set(r.deleted.map((x) => x.id));
    const why = r.reason.split(', ').filter((x) => x && x !== REASON_CLOSED).join(', ') || HOURS;
    for (const c of part) if (!free.has(c.id)) p.kept.set(c.id, p.closedMonths.has(monthOf(c.work_date)) ? REASON_CLOSED : why);
  }
  // Pointage en cours sur la case : la ligne d'heures naîtra à la fin du pointage avec cette case.
  for (const id of Array.from(await liveIds(companyId, monday, touched))) {
    const was = p.kept.get(id);
    p.kept.set(id, was && was !== REASON_LIVE ? `${was}, ${REASON_LIVE}` : REASON_LIVE);
  }
  // Chantiers et salariés que les cases à poser désignent : supprimés ou archivés depuis → elles ne reviennent pas.
  const sites = new Set<string>(), users = new Set<string>();
  for (const a of diff.add) { if (a.worksite_id) sites.add(a.worksite_id); users.add(a.user_id); }
  for (const u of diff.update) {
    if (u.to.worksite_id && u.to.worksite_id !== u.from.worksite_id) sites.add(u.to.worksite_id);
    if (u.to.user_id !== u.from.user_id) users.add(u.to.user_id);
  }
  for (const part of chunks(Array.from(sites))) {
    const { data, error } = await supabase.from('worksites').select('id').eq('company_id', companyId).in('id', part);
    if (error) throw error;
    const have = new Set(((data ?? []) as { id: string }[]).map((x) => x.id));
    for (const id of part) if (!have.has(id)) p.goneWorksites.add(id);
  }
  for (const part of chunks(Array.from(users))) {
    const { data, error } = await supabase.from('users').select('id, is_active').eq('company_id', companyId).in('id', part);
    if (error) throw error;
    const active = new Set(((data ?? []) as { id: string; is_active: boolean | null }[]).filter((x) => x.is_active !== false).map((x) => x.id));
    for (const id of part) if (!active.has(id)) p.goneUsers.add(id);
  }
  for (const part of chunks(diff.add.map((c) => c.id))) {
    const { data, error } = await supabase.from('planning').select('id').eq('company_id', companyId).in('id', part);
    if (error) throw error;
    for (const x of (data ?? []) as { id: string }[]) p.takenIds.add(x.id);
  }
  return p;
}

export interface RestorePreview { plan: RestorePlan; counts: RestoreCounts; summary: string; current: VersionCell[]; sig: string }

const wrongWeek = (companyId: string, monday: string, v: PlanningVersion) => v.company_id !== companyId || String(v.week_start).slice(0, 10) !== monday;
const WRONG_WEEK = 'Cette version n’est pas celle de cette semaine : rien n’a été changé.';

async function planOf(companyId: string, monday: string, version: PlanningVersion): Promise<{ plan: RestorePlan; diff: VersionDiff; current: VersionCell[] }> {
  const { cells: current, absentDays } = await readWeek(companyId, monday);
  const diff = diffCells(current, version.cells, { monday });
  if (!diff.add.length && !diff.remove.length && !diff.update.length) return { plan: planRestore(diff, emptyProtection()), diff, current };
  return { plan: planRestore(diff, await protectionFor(companyId, monday, absentDays, diff)), diff, current };
}
const previewOf = (plan: RestorePlan, current: VersionCell[]): RestorePreview => {
  const counts = countsOf(plan);
  return { plan, counts, summary: restoreSummary(counts), current, sig: planSignature(plan) };
};

/** « Voir » : ce que le retour ferait, lu en base, RIEN n'est écrit. */
export async function previewRestore(companyId: string, monday: string, version: PlanningVersion): Promise<RestorePreview> {
  if (wrongWeek(companyId, monday, version)) throw new Error(WRONG_WEEK);
  const { plan, current } = await planOf(companyId, monday, version);
  return previewOf(plan, current);
}

export interface RestoreResult {
  ok: boolean;
  /** « Revenu à la V2 : 12 cases remises, 3 retirées, 2 gardées (heures déjà notées). » */
  message: string;
  counts: RestoreCounts;
  /** L'état gardé juste avant : « Annuler » y revient. */
  saved: PlanningVersion | null;
  /** Le planning a bougé depuis l'aperçu : RIEN n'a été fait, voici l'aperçu à confirmer de nouveau. */
  stale?: RestorePreview;
  /** L'empreinte du planning juste après ce retour : « Annuler » ne part seul que si elle est toujours vraie. */
  after?: string;
}

const errText = (e: unknown) => (e as { message?: string } | null)?.message || 'erreur inconnue';
const code = (e: unknown) => String((e as { code?: string } | null)?.code || '');
const PLAN_ROW = (companyId: string, c: VersionCell, createdBy: string, withId: boolean) => ({
  ...(withId ? { id: c.id } : {}), company_id: companyId, user_id: c.user_id, worksite_id: c.worksite_id, work_date: c.work_date,
  estimated_start: c.estimated_start, estimated_end: c.estimated_end, notes: c.notes, absence_type: null, created_by: createdBy,
  ...(typeof c.position === 'number' ? { position: c.position } : {}),
});

// Un seul retour à la fois par semaine (double clic, deux fenêtres, assistant en même temps).
const running = new Set<string>();

/**
 * « Revenir à cette version » (après confirmation). `origin: 'assistant'` seulement
 * quand c'est l'assistant qui restaure (traces) ; sinon, l'écran. `expect` : l'empreinte
 * de l'aperçu confirmé — si le planning a bougé depuis, rien n'est fait (`stale`).
 * `ifStateIs` (« Annuler ») : l'empreinte du planning laissée par le retour — idem.
 */
export async function restoreVersion(p: { companyId: string; userId: string; monday: string; version: PlanningVersion; origin?: 'assistant'; label?: string; expect?: string; ifStateIs?: string }): Promise<RestoreResult> {
  const none = countsOf({ add: [], remove: [], update: [], kept: [], skipped: [], same: 0 });
  if (wrongWeek(p.companyId, p.monday, p.version)) return { ok: false, message: WRONG_WEEK, counts: none, saved: null };
  const key = `${p.companyId}|${p.monday}`;
  if (running.has(key)) return { ok: false, message: 'Un retour en arrière est déjà en cours sur cette semaine : rien n’a été changé.', counts: none, saved: null };
  running.add(key);
  try {
    const run = () => doRestore(p);
    return await (p.origin === 'assistant' ? withOrigin('assistant', run) : run());
  } finally {
    running.delete(key);
  }
}

async function doRestore({ companyId, userId, monday, version, label, expect, ifStateIs }: { companyId: string; userId: string; monday: string; version: PlanningVersion; label?: string; expect?: string; ifStateIs?: string }): Promise<RestoreResult> {
  const zero = countsOf({ add: [], remove: [], update: [], kept: [], skipped: [], same: 0 });
  // 1) Tout est LU d'abord (la différence, ce qui garde une case) : le planning a pu bouger depuis l'aperçu.
  let plan: RestorePlan; let current: VersionCell[];
  try {
    ({ plan, current } = await planOf(companyId, monday, version));
  } catch (e) {
    return { ok: false, message: `Lecture du planning impossible : rien n’a été changé (${errText(e)}).`, counts: zero, saved: null };
  }
  if (expect !== undefined && planSignature(plan) !== expect) {
    return { ok: false, stale: previewOf(plan, current), message: 'Le planning a changé depuis l’aperçu : rien n’a été changé. Vérifiez le nouvel aperçu, puis confirmez de nouveau.', counts: countsOf(plan), saved: null };
  }
  if (ifStateIs !== undefined && cellsSignature(current) !== ifStateIs) {
    return { ok: false, stale: previewOf(plan, current), message: `Le planning a changé depuis le retour : rien n’a été changé. Vérifiez l’aperçu de la V${version.number}, puis confirmez.`, counts: countsOf(plan), saved: null };
  }
  // Rien à écrire (déjà comme la version, ou tout est gardé) : on le dit, sans nouvelle version.
  if (planIsEmpty(plan)) {
    const counts = countsOf(plan);
    return { ok: true, message: restoreSummary(counts), counts, saved: null };
  }
  // 2) L'état actuel, gardé AVANT tout changement. Impossible → on ne touche à rien.
  let saved: PlanningVersion;
  try {
    saved = await saveVersion(companyId, monday, 'avant_retour', { cells: current, note: `Avant le retour à la V${version.number}` });
  } catch (e) {
    return { ok: false, message: `L’état actuel n’a pas pu être gardé : rien n’a été changé (${errText(e)}).`, counts: zero, saved: null };
  }
  const kept = [...plan.kept];
  const skipped = [...plan.skipped];
  let added = 0, removed = 0, changed = 0;
  let failure: string | null = null;
  try {
    // Un pointage a pu démarrer depuis la lecture : on regarde encore, juste avant d'écrire.
    const live = await liveIds(companyId, monday, [...plan.remove, ...plan.update.map((u) => u.from)]);
    for (const c of plan.remove) if (live.has(c.id)) kept.push({ cell: c, reason: REASON_LIVE });
    for (const u of plan.update) if (live.has(u.from.id)) kept.push({ cell: u.from, reason: REASON_LIVE });
    // 3a) Retirer : le chemin de « Supprimer » (relit chaque case ; des heures notées entre-temps la gardent).
    for (const part of chunkByKey(plan.remove.filter((c) => !live.has(c.id)), CHUNK)) {
      const r = await erasePlanning(companyId, { ids: part.map((c) => c.id) });
      removed += r.deleted.length;
      const gone = new Set(r.deleted.map((x) => x.id));
      // Sans raison donnée, la case n'existait plus (retirée entre-temps par quelqu'un d'autre) : rien à dire.
      for (const c of part) if (!gone.has(c.id) && r.reason) kept.push({ cell: c, reason: r.reason });
    }
    // 3b) Modifier ; changer de jour ou de salarié = la règle du glisser (prepareMove).
    for (const u of plan.update.filter((x) => !live.has(x.from.id))) {
      let prep = null;
      if (u.move) {
        prep = await prepareMove(companyId, u.from.id);
        if (prep.reason) { kept.push({ cell: u.from, reason: prep.reason }); continue; }
      }
      try {
        await updatePlanningSlot(companyId, u.from.id, {
          userId: u.to.user_id, workDate: u.to.work_date, worksiteId: u.to.worksite_id,
          estimatedStart: u.to.estimated_start, estimatedEnd: u.to.estimated_end, notes: u.to.notes,
        });
        changed++;
      } catch (err) {
        if (prep) await undoMovePrep(prep).catch((e) => console.error('Remise après échec impossible :', e));
        throw err;
      }
    }
    // 3c) Remettre : avec l'identifiant d'origine quand il est libre (les traces le
    // disent « remise »), sinon une case neuve.
    const withId = plan.add.filter((a) => a.keepId).map((a) => a.cell);
    const fresh = plan.add.filter((a) => !a.keepId).map((a) => a.cell);
    // L'auteur d'origine, s'il existe encore ; sinon celui qui revient en arrière (une clé étrangère ne doit pas tout arrêter).
    const authors = new Set<string>();
    for (const part of chunks(Array.from(new Set(plan.add.map((a) => a.cell.created_by).filter((x): x is string => !!x))))) {
      const { data, error } = await supabase.from('users').select('id').eq('company_id', companyId).in('id', part);
      if (error) throw error;
      for (const x of (data ?? []) as { id: string }[]) authors.add(x.id);
    }
    const by = (c: VersionCell) => (c.created_by && authors.has(c.created_by) ? c.created_by : userId);
    for (const part of chunks(withId)) {
      const { error } = await supabase.from('planning').insert(part.map((c) => PLAN_ROW(companyId, c, by(c), true)));
      if (!error) { added += part.length; continue; }
      if (code(error) !== '23505') throw error;
      // Un identifiant pris entre-temps : case par case. Déjà là au même endroit (un autre
      // retour en même temps) : rien à faire. Sinon, une case neuve pour celle-là.
      for (const c of part) {
        const one = await supabase.from('planning').insert(PLAN_ROW(companyId, c, by(c), true));
        if (!one.error) { added++; continue; }
        if (code(one.error) !== '23505') throw one.error;
        const { data: there, error: tErr } = await supabase.from('planning').select('id, user_id, work_date, worksite_id').eq('company_id', companyId).eq('id', c.id).maybeSingle();
        if (tErr) throw tErr;
        const t = there as { user_id: string; work_date: string; worksite_id: string | null } | null;
        if (t && t.user_id === c.user_id && String(t.work_date).slice(0, 10) === c.work_date && (t.worksite_id ?? null) === c.worksite_id) continue;
        fresh.push(c);
      }
    }
    for (const part of chunks(fresh)) {
      const { error } = await supabase.from('planning').insert(part.map((c) => PLAN_ROW(companyId, c, by(c), false)));
      if (error) throw error;
      added += part.length;
    }
  } catch (e) {
    failure = errText(e);
  }
  const counts = countsOf({ add: [], remove: [], update: [], kept, skipped, same: plan.same });
  counts.added = added; counts.removed = removed; counts.changed = changed;
  const head = label ?? `Revenu à la V${version.number}`;
  // Le planning tel que ce retour le laisse : « Annuler » en dépend.
  const after = await readWeek(companyId, monday).then((w) => cellsSignature(w.cells)).catch(() => undefined);
  if (failure) {
    const done = added + removed + changed;
    return { ok: false, counts, saved, after, message: `Retour interrompu (${failure}).${done ? ` Déjà fait : ${restoreSummary(counts)}` : ' Rien n’a été changé.'} « Annuler » remet le planning d’avant.` };
  }
  return { ok: true, counts, saved, after, message: nothingToDo(counts) ? restoreSummary(counts) : `${head} : ${restoreSummary(counts)}` };
}
