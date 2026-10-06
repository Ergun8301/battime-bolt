// Lot 14 — trace « par le chef d'équipe » d'une ligne d'heures (posée par la
// base : migration 20261006120000_lot14_chef_equipe_7_jours). Requête à part
// et silencieuse : tant que la migration n'est pas passée, les colonnes
// n'existent pas et le bureau voit exactement l'écran d'avant.

export interface LeadMark { lead_edited_by: string | null; lead_edited_at: string | null }

export async function fetchLeadMarks(
  supabase: { from: (t: string) => { select: (c: string) => { in: (k: string, v: string[]) => PromiseLike<{ data: unknown; error: unknown }> } } },
  ids: string[],
): Promise<Map<string, LeadMark>> {
  const out = new Map<string, LeadMark>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from('time_entries')
      .select('id, lead_edited_by, lead_edited_at').in('id', ids.slice(i, i + 200));
    if (error) return new Map();
    for (const r of (data || []) as (LeadMark & { id: string })[]) if (r.lead_edited_by) out.set(r.id, r);
  }
  return out;
}
