// Demande de congé du salarié, partagée entre « Mes congés » et l'Assistant
// BEMEXO (lot 3 bis). Même RPC, mêmes contrôles côté serveur.
import { supabase } from '@/lib/supabase';

export const LEAVE_KINDS = ['conge', 'maladie', 'intemperie'] as const;

export async function requestLeave(p: { type: string; start: string; end: string; note?: string | null }) {
  const { error } = await supabase.rpc('request_leave', {
    p_type: p.type, p_start_date: p.start, p_end_date: p.end, p_note: (p.note ?? '').trim() || null,
  });
  if (error) throw error;
}
