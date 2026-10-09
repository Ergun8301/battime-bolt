// Lot 8 — EFFACER, avec une vraie annulation.
//
// Règle unique : on LIT chaque ligne en entier avant de l'effacer ; « Annuler »
// la remet à l'identique (même identifiant, mêmes valeurs), même 30 cases d'un
// coup. Tout passe par la session de la personne connectée (ses droits, sa RLS).
//
// Jamais effacé : une case sur laquelle des heures sont notées ou envoyées (la
// base le refuse d'ailleurs), une sortie oubliée à compléter, ni rien dans un
// mois clôturé. Ces cases sont GARDÉES et on le dit.
//
// Lot 2 — « brouillons propres ». Ce qui ne compte nulle part ne bloque plus :
//  · un BROUILLON VIDE (0 minute, jamais envoyé) part AVEC son intervention :
//    lu en entier, effacé seulement s'il est encore vide à cet instant (des
//    heures tapées entre-temps survivent, et la case est alors gardée) ;
//  · une ligne RETIRÉE par le salarié (status 'cancelled') est DÉTACHÉE
//    (planning_id → null) avant l'effacement : ses heures restent intactes,
//    seul le lien disparaît. Avant, la clé étrangère rendait la case
//    insupprimable pour toujours.
// « Annuler » (undoErase) remet dans l'ordre de la clé étrangère :
// l'intervention, puis les brouillons, puis le lien.
import { supabase } from '@/lib/supabase';
import { isEmptyDraft, type DraftLike } from '@/supabase/functions/_shared/day-hours';

type Row = Record<string, unknown> & { id: string };
const CHUNK = 100;
const chunks = <T,>(a: T[]) => Array.from({ length: Math.ceil(a.length / CHUNK) }, (_, i) => a.slice(i * CHUNK, (i + 1) * CHUNK));

export interface EraseResult {
  deleted: Row[]; skipped: number; reason: string;
  /** Lot 2 : brouillons vides effacés avec leur intervention (lus en entier). */
  drafts: Row[];
  /** Lot 2 : lignes retirées par le salarié, détachées de l'intervention effacée (heures intactes). */
  detached: { id: string; planning_id: string }[];
}

/** Une ligne d'heures, telle que l'effacement la classe. */
interface EntryLite extends DraftLike { id: string; planning_id: string | null; user_id: string; work_date: string; worksite_id: string | null; status: string; submitted_at?: string | null }
// `exit_forgotten` (lot 12) : absente tant que sa migration n'est pas passée.
// On la demande, et on relit sans elle si la base ne la connaît pas.
const ENTRY_COLS = 'id, planning_id, user_id, work_date, worksite_id, status, start_time, end_time, locked, submitted_at';
type Read = PromiseLike<{ data: unknown; error: { message?: string } | null }>;
async function readEntries(q: (cols: string) => Read): Promise<EntryLite[]> {
  let { data, error } = await q(`${ENTRY_COLS}, exit_forgotten`);
  if (error && /exit_forgotten/.test(error.message || '')) ({ data, error } = await q(ENTRY_COLS));
  if (error) throw error;
  return (data ?? []) as EntryLite[];
}
/** Vide ET jamais envoyé : le seul brouillon qui part avec son intervention (et qui ne s'affiche plus au bureau). */
export const isDisposableDraft = (t: DraftLike & { submitted_at?: unknown }) => isEmptyDraft(t) && !t.submitted_at;
const disposable = isDisposableDraft;
const push = (m: Map<string, string[]>, k: string, v: string) => { const l = m.get(k); if (l) l.push(v); else m.set(k, [v]); };
// Ce qui GARDE une case, du plus fort au plus faible : envoyée > sortie
// oubliée à compléter > notée. Une ligne retirée ne garde plus rien (lot 2).
// Les mêmes mots pour « Supprimer » et pour un déplacement (prepareMove).
const RANK: Record<string, number> = { sent: 3, exit: 2, draft: 1 };
const REASON: Record<string, string> = { sent: 'heures déjà envoyées', exit: 'sortie oubliée à compléter', draft: 'heures déjà notées par le salarié' };
const blockOf = (t: EntryLite) => (t.status === 'draft' ? (t.exit_forgotten ? 'exit' : 'draft') : 'sent');

/** Cases du planning : par identifiants, ou un salarié (ou toute l'équipe) sur une période. */
export async function erasePlanning(companyId: string, o: { ids?: string[]; userId?: string | null; from?: string; to?: string; absences?: boolean }): Promise<EraseResult> {
  let q = supabase.from('planning').select('*').eq('company_id', companyId);
  if (o.ids) q = q.in('id', o.ids);
  else {
    q = q.gte('work_date', o.from!).lte('work_date', o.to!);
    if (o.userId) q = q.eq('user_id', o.userId);
    q = o.absences ? q.not('absence_type', 'is', null) : q.is('absence_type', null);
  }
  const { data, error } = await q.limit(2000);
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  if (!rows.length) return { deleted: [], skipped: 0, reason: '', drafts: [], detached: [] };

  const { data: cl } = await supabase.from('month_closures').select('month').eq('company_id', companyId);
  const closed = new Set(((cl ?? []) as { month: string }[]).map((c) => String(c.month).slice(0, 7)));
  const linked = new Map<string, string>();
  const mark = (id: string, st: string) => { if ((RANK[st] || 0) > (RANK[linked.get(id) || ''] || 0)) linked.set(id, st); };
  const draftsOf = new Map<string, string[]>();    // intervention → ses brouillons vides
  const cancelledOf = new Map<string, string[]>(); // intervention → ses lignes retirées
  for (const ids of chunks(rows.map((r) => r.id))) {
    const te = await readEntries((cols) => supabase.from('time_entries').select(cols).in('planning_id', ids));
    for (const t of te) {
      const pid = String(t.planning_id);
      if (t.status === 'cancelled') push(cancelledOf, pid, t.id);
      else if (disposable(t)) push(draftsOf, pid, t.id);
      else mark(pid, blockOf(t));
    }
  }
  // Filet de sécurité : des heures notées SANS planning_id (saisies avant le
  // lien, ou ajoutées par le salarié) sur le même salarié, jour et chantier
  // appartiennent aussi à la case. L'écran ne les propose déjà pas ; l'Assistant
  // (effacer par période) ne doit pas non plus les rendre orphelines. Un
  // brouillon vide « en vrac » part avec la case (lot 2).
  const users = Array.from(new Set(rows.map((r) => String(r.user_id))));
  const dates = rows.map((r) => String(r.work_date)).sort();
  const byKey = new Map<string, string>();
  const looseEmpty = new Map<string, string[]>();
  const keyOf = (r: { user_id?: unknown; work_date?: unknown; worksite_id?: unknown } | Row) => (r.worksite_id ? `${r.user_id}|${r.work_date}|${r.worksite_id}` : '');
  for (const part of chunks(users)) {
    const loose = await readEntries((cols) => supabase.from('time_entries').select(cols)
      .eq('company_id', companyId).in('user_id', part).gte('work_date', dates[0]).lte('work_date', dates[dates.length - 1])
      .is('planning_id', null).neq('status', 'cancelled'));
    for (const t of loose) {
      const k = keyOf(t);
      if (!k || !t.work_date) continue;
      if (disposable(t)) { push(looseEmpty, k, t.id); continue; }
      const st = blockOf(t);
      if ((RANK[st] || 0) > (RANK[byKey.get(k) || ''] || 0)) byKey.set(k, st);
    }
  }
  for (const r of rows) {
    const st = byKey.get(keyOf(r));
    if (st) mark(r.id, st);
  }
  const reasons = new Set<string>();
  let toDelete = rows.filter((r) => {
    if (closed.has(String(r.work_date).slice(0, 7))) { reasons.add('mois clôturé'); return false; }
    const st = linked.get(r.id);
    if (st) { reasons.add(REASON[st]); return false; }
    return true;
  });
  // Les brouillons vides en vrac d'une case partent avec sa PREMIÈRE intervention effacée.
  const owner = new Map<string, string>(); // brouillon → intervention
  for (const r of toDelete) {
    for (const id of draftsOf.get(r.id) || []) owner.set(id, r.id);
    for (const id of looseEmpty.get(keyOf(r)) || []) if (!owner.has(id)) owner.set(id, r.id);
  }

  // 1) Les brouillons vides, relus EN ENTIER (« Annuler » les remet à l'identique).
  //    Plus vides à la relecture : la case est gardée.
  const late = new Set<string>(); // interventions finalement gardées
  const fullDrafts: Row[] = [];
  for (const ids of chunks(Array.from(owner.keys()))) {
    const { data: full, error: fErr } = await supabase.from('time_entries').select('*').in('id', ids);
    if (fErr) throw fErr;
    for (const d of (full ?? []) as Row[]) {
      if (disposable(d as DraftLike & { submitted_at?: unknown })) fullDrafts.push(d);
      else { late.add(owner.get(d.id)!); reasons.add(REASON.draft); }
    }
  }
  const goneDrafts: Row[] = [];
  const detached: { id: string; planning_id: string }[] = [];
  const gone = new Set<string>();
  // Ce qui est déjà fait se défait dans l'ordre inverse avant de signaler une erreur.
  const rollback = async () => {
    if (gone.size) await restoreRows('planning', toDelete.filter((r) => gone.has(r.id)));
    await relink(detached);
    await restoreDrafts(goneDrafts);
  };
  try {
    // 2) Effacés un par un, seulement s'ils sont ENCORE vides et brouillons.
    for (const d of fullDrafts) {
      if (late.has(owner.get(d.id)!)) continue;
      const { data: del, error: dErr } = await supabase.from('time_entries').delete()
        .eq('id', d.id).eq('status', 'draft').eq('locked', false).is('submitted_at', null)
        .eq('start_time', String(d.start_time)).eq('end_time', String(d.end_time)).select('id');
      if (dErr) throw dErr;
      if (del && del.length) goneDrafts.push(d);
      else { late.add(owner.get(d.id)!); reasons.add(REASON.draft); }
    }
    // 3) Les lignes retirées sont détachées : leurs heures ne bougent pas.
    const cancelledIds = toDelete.filter((r) => !late.has(r.id)).flatMap((r) => (cancelledOf.get(r.id) || []).map((id) => ({ id, planning_id: r.id })));
    for (const part of chunks(cancelledIds)) {
      const { data: up, error: uErr } = await supabase.from('time_entries').update({ planning_id: null })
        .in('id', part.map((x) => x.id)).eq('status', 'cancelled').select('id');
      if (uErr) throw uErr;
      const done = new Set(((up ?? []) as { id: string }[]).map((x) => x.id));
      for (const x of part) {
        if (done.has(x.id)) detached.push(x);
        else { late.add(x.planning_id); reasons.add('heures modifiées entre-temps'); }
      }
    }
    // Une case gardée au dernier moment est remise comme elle était.
    if (late.size) {
      const kept = (pid: string) => late.has(pid);
      await restoreDrafts(goneDrafts.filter((d) => kept(owner.get(d.id)!)));
      await relink(detached.filter((x) => kept(x.planning_id)));
      goneDrafts.splice(0, goneDrafts.length, ...goneDrafts.filter((d) => !kept(owner.get(d.id)!)));
      detached.splice(0, detached.length, ...detached.filter((x) => !kept(x.planning_id)));
      toDelete = toDelete.filter((r) => !kept(r.id));
    }
    // 4) Les interventions.
    for (const ids of chunks(toDelete.map((r) => r.id))) {
      const { data: del, error: delErr } = await supabase.from('planning').delete().eq('company_id', companyId).in('id', ids).select('id');
      if (delErr) throw delErr;
      for (const x of (del ?? []) as { id: string }[]) gone.add(x.id);
    }
    // Une intervention que la base n'a pas effacée retrouve ses brouillons et ses liens.
    const stays = (pid: string) => !gone.has(pid);
    await restoreDrafts(goneDrafts.filter((d) => stays(owner.get(d.id)!)));
    await relink(detached.filter((x) => stays(x.planning_id)));
  } catch (err) {
    try { await rollback(); } catch (e) { console.error('Remise après échec impossible :', e); }
    throw err;
  }
  const deleted = toDelete.filter((r) => gone.has(r.id));
  return {
    deleted, skipped: rows.length - deleted.length, reason: Array.from(reasons).join(', '),
    drafts: goneDrafts.filter((d) => gone.has(owner.get(d.id)!)),
    detached: detached.filter((x) => gone.has(x.planning_id)),
  };
}

/** « Annuler » d'un effacement : l'intervention, puis ses brouillons, puis le lien des lignes retirées. */
export async function undoErase(r: EraseResult): Promise<void> {
  await restoreRows('planning', r.deleted);
  await restoreDrafts(r.drafts);
  await relink(r.detached);
}

/** Remet des brouillons effacés. `total_minutes` est calculé par la base : jamais renvoyé. */
export async function restoreDrafts(rows: Row[]): Promise<void> {
  if (!rows.length) return;
  await restoreRows('time_entries', rows.map(({ total_minutes: _t, worksite: _w, ...r }) => r as Row));
}

/** Rattache de nouveau des lignes retirées à leur intervention (remise). */
async function relink(rows: { id: string; planning_id: string }[]): Promise<void> {
  const byPlan = new Map<string, string[]>();
  for (const x of rows) push(byPlan, x.planning_id, x.id);
  for (const [pid, ids] of Array.from(byPlan.entries())) {
    const { error } = await supabase.from('time_entries').update({ planning_id: pid })
      .in('id', ids).eq('status', 'cancelled').is('planning_id', null);
    if (error) throw error;
  }
}

/**
 * Lot 2 : un brouillon VIDE effacé depuis la fiche du salarié. Relu en entier,
 * revérifié (vide, jamais envoyé), effacé seulement s'il n'a pas changé.
 * Rend la ligne pour « Annuler » (restoreDrafts).
 */
export async function eraseEmptyDraft(companyId: string, id: string): Promise<Row> {
  const { data, error } = await supabase.from('time_entries').select('*').eq('id', id).eq('company_id', companyId).single();
  if (error) throw error;
  const row = data as Row;
  if (!disposable(row as DraftLike & { submitted_at?: unknown })) throw new Error('Ce brouillon n’est plus vide : rien n’a été supprimé.');
  const { data: del, error: delErr } = await supabase.from('time_entries').delete()
    .eq('id', id).eq('company_id', companyId).eq('status', 'draft').eq('locked', false).is('submitted_at', null)
    .eq('start_time', String(row.start_time)).eq('end_time', String(row.end_time)).select('id');
  if (delErr) throw delErr;
  if (!del || del.length === 0) throw new Error('Ce brouillon a changé entre-temps : rien n’a été supprimé.');
  return row;
}

/** Remet des lignes effacées, à l'identique. */
export async function restoreRows(table: string, rows: Row[]): Promise<void> {
  for (const part of chunks(rows)) {
    const { error } = await supabase.from(table).upsert(part, { onConflict: 'id' });
    if (error) throw error;
  }
}

/** Une ligne (dépense, habilitation…) : lue en entier, effacée, restaurable. */
export async function eraseOne(table: string, companyId: string, id: string): Promise<Row> {
  const { data, error } = await supabase.from(table).select('*').eq('id', id).eq('company_id', companyId).single();
  if (error) throw error;
  const { data: del, error: delErr } = await supabase.from(table).delete().eq('id', id).eq('company_id', companyId).select('id');
  if (delErr) throw delErr;
  if (!del || del.length === 0) throw new Error('Suppression refusée (droits).');
  return data as Row;
}

/** « 27 cases effacées » — le nombre, toujours. */
export const casesLabel = (n: number, verbe = 'effacée') => `${n} case${n > 1 ? 's' : ''} ${verbe}${n > 1 ? 's' : ''}`;

/** Ce qu'un déplacement a défait avant de changer la case de place (pour le remettre). */
export interface MovePrep { reason: string | null; drafts: Row[]; detached: { id: string; planning_id: string }[] }

/**
 * Lot 2 : avant qu'une case change de jour ou de salarié. Même classement que
 * erasePlanning, sur les lignes d'heures qui la désignent puis sur les heures
 * sans lien du même salarié, jour et chantier :
 *  · envoyées, notées, sortie oubliée à compléter → elle ne bouge pas (`reason`).
 *    La ligne garderait son planning_id : elle désignerait un autre jour, et le
 *    chargement suivant recréait une bulle « ajoutée par le salarié » à
 *    l'ancienne place (ensure_planning_slot) ;
 *  · un brouillon VIDE jamais envoyé est effacé (relu en entier, gardé s'il a
 *    changé entre-temps) ;
 *  · une ligne RETIRÉE est détachée : ses heures restent, sur leur jour, et la
 *    case déplacée n'apparaît pas « retirée » à sa nouvelle place.
 * Rien n'est déplacé ici : l'appelant déplace, puis undoMovePrep remet tout si
 * le déplacement échoue (ou s'il est annulé). Partagé par le glisser du
 * planning et l'Assistant (modifier_intervention).
 */
export async function prepareMove(companyId: string, id: string): Promise<MovePrep> {
  const kept = (reason: string): MovePrep => ({ reason, drafts: [], detached: [] });
  const { data: p, error } = await supabase.from('planning').select('user_id, work_date, worksite_id')
    .eq('id', id).eq('company_id', companyId).maybeSingle();
  if (error) throw error;
  if (!p) return { reason: null, drafts: [], detached: [] };
  const row = p as { user_id: string; work_date: string; worksite_id: string | null };
  let worst = '';
  const mark = (t: EntryLite) => { const st = blockOf(t); if (RANK[st] > (RANK[worst] || 0)) worst = st; };
  const empties: string[] = [];
  const cancelled: string[] = [];
  for (const t of await readEntries((cols) => supabase.from('time_entries').select(cols).eq('planning_id', id))) {
    if (t.status === 'cancelled') cancelled.push(t.id);
    else if (disposable(t)) empties.push(t.id);
    else mark(t);
  }
  if (!worst && row.worksite_id) {
    const loose = await readEntries((cols) => supabase.from('time_entries').select(cols)
      .eq('company_id', companyId).eq('user_id', row.user_id).eq('work_date', row.work_date).eq('worksite_id', row.worksite_id)
      .is('planning_id', null).neq('status', 'cancelled'));
    for (const t of loose) if (!disposable(t)) mark(t);
  }
  if (worst) return kept(REASON[worst]);

  const out: MovePrep = { reason: null, drafts: [], detached: [] };
  // Gardée au dernier moment : ce qui est déjà défait est remis, rien ne bouge.
  const late = async (reason: string) => { await undoMovePrep(out); return kept(reason); };
  try {
    if (empties.length) {
      const { data: full, error: fErr } = await supabase.from('time_entries').select('*').in('id', empties);
      if (fErr) throw fErr;
      for (const d of (full ?? []) as Row[]) {
        if (!disposable(d as DraftLike & { submitted_at?: unknown })) return await late(REASON.draft);
        const { data: del, error: dErr } = await supabase.from('time_entries').delete()
          .eq('id', d.id).eq('status', 'draft').eq('locked', false).is('submitted_at', null)
          .eq('start_time', String(d.start_time)).eq('end_time', String(d.end_time)).select('id');
        if (dErr) throw dErr;
        if (!del || !del.length) return await late(REASON.draft);
        out.drafts.push(d);
      }
    }
    if (cancelled.length) {
      const { data: up, error: uErr } = await supabase.from('time_entries').update({ planning_id: null })
        .in('id', cancelled).eq('status', 'cancelled').select('id');
      if (uErr) throw uErr;
      for (const x of (up ?? []) as { id: string }[]) out.detached.push({ id: x.id, planning_id: id });
      if (out.detached.length !== cancelled.length) return await late('heures modifiées entre-temps');
    }
  } catch (err) {
    try { await undoMovePrep(out); } catch (e) { console.error('Remise après échec impossible :', e); }
    throw err;
  }
  return out;
}

/** Remet ce que prepareMove a défait : les brouillons vides, puis le lien des lignes retirées. */
export async function undoMovePrep(m: MovePrep): Promise<void> {
  await restoreDrafts(m.drafts);
  await relink(m.detached);
}
