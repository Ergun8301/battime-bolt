// Lot 8 — EFFACER, avec une vraie annulation.
//
// Règle unique : on LIT chaque ligne en entier avant de l'effacer ; « Annuler »
// la remet à l'identique (même identifiant, mêmes valeurs), même 30 cases d'un
// coup. Tout passe par la session de la personne connectée (ses droits, sa RLS).
//
// Jamais effacé : une case sur laquelle des heures sont notées ou envoyées (la
// base le refuse d'ailleurs), une case que le salarié a retirée (sa ligne
// 'cancelled' la désigne encore), ni rien dans un mois clôturé. Ces cases sont
// GARDÉES et on le dit.
import { supabase } from '@/lib/supabase';

type Row = Record<string, unknown> & { id: string };
const CHUNK = 100;
const chunks = <T,>(a: T[]) => Array.from({ length: Math.ceil(a.length / CHUNK) }, (_, i) => a.slice(i * CHUNK, (i + 1) * CHUNK));

export interface EraseResult { deleted: Row[]; skipped: number; reason: string }

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
  if (!rows.length) return { deleted: [], skipped: 0, reason: '' };

  const { data: cl } = await supabase.from('month_closures').select('month').eq('company_id', companyId);
  const closed = new Set(((cl ?? []) as { month: string }[]).map((c) => String(c.month).slice(0, 7)));
  // Lot 11 : les lignes RETIRÉES par le salarié (status 'cancelled') sont lues
  // aussi. Elles gardent leur planning_id (time_entries_planning_id_fkey, sans
  // ON DELETE) : effacer leur case échouait sur la clé étrangère et faisait
  // échouer TOUT le lot de 100 (« Impossible »). Ces cases sont gardées, et on
  // dit pourquoi. Rang : envoyée > notée > retirée.
  const RANK: Record<string, number> = { sent: 3, draft: 2, cancelled: 1 };
  const linked = new Map<string, string>();
  const mark = (id: string, st: string) => { if ((RANK[st] || 0) > (RANK[linked.get(id) || ''] || 0)) linked.set(id, st); };
  for (const ids of chunks(rows.map((r) => r.id))) {
    const { data: te, error: teErr } = await supabase.from('time_entries').select('planning_id, status').in('planning_id', ids);
    if (teErr) throw teErr;
    for (const t of (te ?? []) as { planning_id: string; status: string }[]) {
      mark(t.planning_id, t.status === 'cancelled' ? 'cancelled' : t.status === 'draft' ? 'draft' : 'sent');
    }
  }
  // Filet de sécurité : des heures notées SANS planning_id (saisies avant le
  // lien, ou ajoutées par le salarié) sur le même salarié, jour et chantier
  // appartiennent aussi à la case. L'écran ne les propose déjà pas ; l'Assistant
  // (effacer par période) ne doit pas non plus les rendre orphelines.
  const users = Array.from(new Set(rows.map((r) => String(r.user_id))));
  const dates = rows.map((r) => String(r.work_date)).sort();
  const byKey = new Map<string, string>();
  for (const part of chunks(users)) {
    const { data: loose, error: lErr } = await supabase.from('time_entries').select('user_id, work_date, worksite_id, status')
      .eq('company_id', companyId).in('user_id', part).gte('work_date', dates[0]).lte('work_date', dates[dates.length - 1])
      .is('planning_id', null).neq('status', 'cancelled');
    if (lErr) throw lErr;
    for (const t of (loose ?? []) as { user_id: string; work_date: string; worksite_id: string | null; status: string }[]) {
      if (!t.worksite_id || !t.work_date) continue;
      const k = `${t.user_id}|${t.work_date}|${t.worksite_id}`;
      if (byKey.get(k) !== 'sent') byKey.set(k, t.status === 'draft' ? 'draft' : 'sent');
    }
  }
  for (const r of rows) {
    const st = r.worksite_id ? byKey.get(`${r.user_id}|${r.work_date}|${r.worksite_id}`) : undefined;
    if (st) mark(r.id, st);
  }
  const reasons = new Set<string>();
  const toDelete = rows.filter((r) => {
    if (closed.has(String(r.work_date).slice(0, 7))) { reasons.add('mois clôturé'); return false; }
    const st = linked.get(r.id);
    if (st) {
      reasons.add(st === 'sent' ? 'heures déjà envoyées' : st === 'draft' ? 'heures déjà notées par le salarié' : 'retirée par le salarié');
      return false;
    }
    return true;
  });
  const gone = new Set<string>();
  for (const ids of chunks(toDelete.map((r) => r.id))) {
    const { data: del, error: delErr } = await supabase.from('planning').delete().eq('company_id', companyId).in('id', ids).select('id');
    if (delErr) {
      // Ce qui est déjà parti reste restaurable : on remet avant de signaler.
      if (gone.size) await restoreRows('planning', toDelete.filter((r) => gone.has(r.id)));
      throw delErr;
    }
    for (const x of (del ?? []) as { id: string }[]) gone.add(x.id);
  }
  const deleted = toDelete.filter((r) => gone.has(r.id));
  return { deleted, skipped: rows.length - deleted.length, reason: Array.from(reasons).join(', ') };
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

/**
 * Lot 2 : pourquoi une case ne peut PAS changer de jour ni de salarié (null =
 * elle le peut). Même lecture que erasePlanning : les lignes d'heures qui la
 * désignent (envoyées, notées ou retirées), puis les heures sans lien du même
 * salarié, jour et chantier. Une ligne garde son planning_id : déplacer la case
 * la laissait désigner un autre jour, et le chargement suivant recréait une
 * bulle « ajoutée par le salarié » à l'ancienne place (ensure_planning_slot).
 * Partagé par l'Assistant (modifier_intervention) ; le glisser du planning fait
 * la même vérification sur ce qu'il affiche déjà (moveLock).
 */
export async function planningLinkReason(companyId: string, id: string): Promise<string | null> {
  const { data: p, error } = await supabase.from('planning').select('user_id, work_date, worksite_id')
    .eq('id', id).eq('company_id', companyId).maybeSingle();
  if (error) throw error;
  if (!p) return null;
  const RANK: Record<string, number> = { sent: 3, draft: 2, cancelled: 1 };
  let worst = '';
  const mark = (status: string) => {
    const st = status === 'cancelled' ? 'cancelled' : status === 'draft' ? 'draft' : 'sent';
    if (RANK[st] > (RANK[worst] || 0)) worst = st;
  };
  const { data: te, error: teErr } = await supabase.from('time_entries').select('status').eq('planning_id', id);
  if (teErr) throw teErr;
  for (const t of (te ?? []) as { status: string }[]) mark(t.status);
  const row = p as { user_id: string; work_date: string; worksite_id: string | null };
  if (worst !== 'sent' && row.worksite_id) {
    const { data: loose, error: lErr } = await supabase.from('time_entries').select('status')
      .eq('company_id', companyId).eq('user_id', row.user_id).eq('work_date', row.work_date).eq('worksite_id', row.worksite_id)
      .is('planning_id', null).neq('status', 'cancelled');
    if (lErr) throw lErr;
    for (const t of (loose ?? []) as { status: string }[]) mark(t.status);
  }
  return worst === 'sent' ? 'heures déjà envoyées' : worst === 'draft' ? 'heures déjà notées par le salarié' : worst === 'cancelled' ? 'retirée par le salarié' : null;
}
