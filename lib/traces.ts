// Lot 3 — « Interventions supprimées ou décalées », côté navigateur. LECTURE
// SEULE : la table `traces` n'est écrite que par la base (déclencheurs), et
// personne ne peut la modifier.
//
// AVANT LA MIGRATION (20261011120000), RIEN NE CHANGE : la table manque
// (PGRST205) → les deux entrées restent cachées, chez le salarié comme au
// bureau. Toute AUTRE erreur (réseau…) n'affiche rien de plus non plus : on
// réessaiera à la prochaine ouverture.
import { markTracesTable, supabase } from '@/lib/supabase';
import { isMissingRelation } from '@/supabase/functions/_shared/missions';
import { parisMidnightISO, personIds, worksiteIds, type TraceNames, type TraceRow } from '@/supabase/functions/_shared/traces';

/** La table existe-t-elle ? 'missing' = migration pas passée (inutile de redemander). */
export async function tracesAvailable(): Promise<'on' | 'missing' | 'error'> {
  try {
    const { error } = await supabase.from('traces').select('id').limit(1);
    if (!error) { markTracesTable(true); return 'on'; }
    if (!isMissingRelation(error)) return 'error';
    markTracesTable(false);
    return 'missing';
  } catch {
    return 'error';
  }
}

/** Au plus tant de lignes par lecture ; au-delà, l'écran le dit (choisir une semaine, un salarié). */
export const TRACES_LIMIT = 500;

export type TracesResult = { ok: true; rows: TraceRow[]; names: TraceNames; truncated: boolean } | { ok: false; missing: boolean };

/**
 * Les traces d'une période (jours de Paris, `to` inclus), les plus récentes d'abord.
 *  · `mine` : le salarié — ses lignes (la base n'en montre pas d'autres) et le
 *    résumé d'une réunion « Toute l'équipe » ;
 *  · sinon le bureau : `userId` pour un salarié (ses lignes, plus le résumé d'une
 *    réunion restée « Toute l'équipe », comme dans son Historique), sinon toute
 *    l'entreprise (une réunion n'y figure qu'une fois : sa ligne-résumé).
 * La période est celle où la trace a été ÉCRITE (pas le jour concerné).
 */
export async function fetchTraces(p: { companyId: string; from: string; to: string; mine?: string; userId?: string | null }): Promise<TracesResult> {
  try {
    const end = new Date(`${p.to}T12:00:00Z`); end.setUTCDate(end.getUTCDate() + 1);
    let q = supabase.from('traces').select('*').eq('company_id', p.companyId)
      .gte('created_at', parisMidnightISO(p.from)).lt('created_at', parisMidnightISO(end.toISOString().slice(0, 10)));
    if (p.mine) q = q.or(`user_id.eq.${p.mine},and(user_id.is.null,object_table.eq.meetings)`);
    else if (p.userId) q = q.or(`user_id.eq.${p.userId},and(user_id.is.null,object_table.eq.meetings,before->>all_team.eq.true,or(after.is.null,after->>all_team.eq.true))`);
    else q = q.or('object_table.neq.meetings,user_id.is.null');
    const { data, error } = await q.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(TRACES_LIMIT);
    if (error) throw error;
    const rows = (data || []) as TraceRow[];
    const names: TraceNames = { worksites: {} };
    const sites = worksiteIds(rows);
    if (sites.length) {
      const { data: ws } = await supabase.from('worksites').select('id, client_name').in('id', sites);
      for (const w of (ws || []) as { id: string; client_name: string | null }[]) names.worksites[w.id] = w.client_name || 'Chantier';
    }
    // Au bureau : les noms (auteurs, salariés, participants), y compris les comptes archivés.
    if (!p.mine) {
      names.users = {};
      const ids = personIds(rows);
      if (ids.length) {
        const { data: us } = await supabase.from('users').select('id, first_name, last_name').in('id', ids);
        for (const u of (us || []) as { id: string; first_name: string | null; last_name: string | null }[]) {
          names.users[u.id] = `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Sans nom';
        }
      }
    }
    return { ok: true, rows, names, truncated: rows.length >= TRACES_LIMIT };
  } catch (e) {
    return { ok: false, missing: isMissingRelation(e) };
  }
}
