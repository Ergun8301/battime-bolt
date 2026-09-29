// Écritures du bureau, partagées ENTRE l'écran planning et l'Assistant BEMEXO.
//
// POURQUOI CE FICHIER EXISTE (lot 3 bis). L'assistant « fait à la place » du
// patron : inviter un salarié, créer un client, poser une absence, affecter
// quelqu'un. Il ne doit JAMAIS avoir sa propre version de ces gestes — sinon,
// le jour où l'écran change une règle, l'assistant continuerait l'ancienne.
// Ces fonctions sont donc le code de admin-planning.tsx, sorti TEL QUEL, et
// appelé par les deux. Mêmes tables, mêmes champs, même RLS, mêmes droits : ceux
// de la personne connectée.
//
// Chaque fonction LÈVE l'erreur Supabase : c'est l'appelant qui l'affiche.
import { supabase } from '@/lib/supabase';

export const ABSENCE_TYPES = ['conge', 'maladie', 'intemperie', 'repos'] as const;
export type AbsenceType = typeof ABSENCE_TYPES[number];

/** « Nouveau salarié » → « Envoyer l'invitation ». */
export async function inviteWorker(p: { companyId: string; email: string; firstName: string; lastName: string; phone?: string | null }) {
  const { error } = await supabase.functions.invoke('invite-worker', {
    body: { email: p.email, first_name: p.firstName, last_name: p.lastName, phone: p.phone || null, company_id: p.companyId, role: 'worker' },
  });
  if (error) throw error;
}

export interface NewWorksite {
  client_name: string; product_type?: string | null; client_phone?: string | null; client_email?: string | null;
  city?: string | null; address?: string | null; description?: string | null;
}

/** « Nouveau client » → « Créer le client ». Renvoie la ligne créée. */
export async function createWorksite(companyId: string, w: NewWorksite) {
  const t = (v?: string | null) => (v ?? '').trim() || null;
  const { data, error } = await supabase.from('worksites').insert({
    company_id: companyId, client_name: w.client_name.trim(), product_type: t(w.product_type),
    client_phone: t(w.client_phone), client_email: t(w.client_email), city: t(w.city), address: t(w.address),
    description: t(w.description), is_active: true,
  }).select().single();
  if (error) throw error;
  return data as { id: string; client_name: string };
}

/** « Ajouter au planning » / glisser un client sur une case. */
export async function addPlanningSlot(p: { companyId: string; createdBy: string; userId: string; worksiteId: string; workDate: string; notes?: string | null }) {
  const { error } = await supabase.from('planning').insert({
    company_id: p.companyId, created_by: p.createdBy, user_id: p.userId,
    worksite_id: p.worksiteId, work_date: p.workDate,
    estimated_start: null, estimated_end: null,
    notes: (p.notes ?? '').trim() || null, absence_type: null,
  });
  if (error) throw error;
}

/** Les jours « aaaa-mm-jj » de `from` à `to` inclus (400 au plus, comme l'écran). */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  let guard = 0;
  while (d <= end && guard < 400) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); guard++; }
  return out;
}

/**
 * Statut « Congé / Arrêt maladie / Intempérie / Repos » sur une période.
 * Borné à la période posée : sans le `.lte`, poser deux jours de maladie
 * effaçait toutes les absences déjà prévues après (congés du mois suivant).
 */
export async function setAbsence(p: { companyId: string; createdBy: string; userId: string; type: string; from: string; to: string }) {
  const dates = daysBetween(p.from, p.to);
  const { error: delErr } = await supabase.from('planning').delete()
    .eq('company_id', p.companyId).eq('user_id', p.userId)
    .gte('work_date', p.from).lte('work_date', p.to).not('absence_type', 'is', null);
  if (delErr) throw delErr;
  const rows = dates.map((dt) => ({
    company_id: p.companyId, created_by: p.createdBy, user_id: p.userId,
    worksite_id: null, work_date: dt, estimated_start: null, estimated_end: null,
    notes: null, absence_type: p.type,
  }));
  const { error } = await supabase.from('planning').insert(rows);
  if (error) throw error;
}
