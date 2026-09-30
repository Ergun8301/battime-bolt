// Lot 8 — EFFACER, avec une vraie annulation.
//
// Règle unique : on LIT chaque ligne en entier avant de l'effacer ; « Annuler »
// la remet à l'identique (même identifiant, mêmes valeurs), même 30 cases d'un
// coup. Tout passe par la session de la personne connectée (ses droits, sa RLS).
//
// Jamais effacé : une case sur laquelle des heures sont notées ou envoyées (la
// base le refuse d'ailleurs), ni rien dans un mois clôturé. Ces cases sont
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
  const linked = new Map<string, string>();
  for (const ids of chunks(rows.map((r) => r.id))) {
    const { data: te, error: teErr } = await supabase.from('time_entries').select('planning_id, status').in('planning_id', ids).neq('status', 'cancelled');
    if (teErr) throw teErr;
    for (const t of (te ?? []) as { planning_id: string; status: string }[]) {
      if (linked.get(t.planning_id) !== 'sent') linked.set(t.planning_id, t.status === 'draft' ? 'draft' : 'sent');
    }
  }
  const reasons = new Set<string>();
  const toDelete = rows.filter((r) => {
    if (closed.has(String(r.work_date).slice(0, 7))) { reasons.add('mois clôturé'); return false; }
    const st = linked.get(r.id);
    if (st) { reasons.add(st === 'sent' ? 'heures déjà envoyées' : 'heures déjà notées par le salarié'); return false; }
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
