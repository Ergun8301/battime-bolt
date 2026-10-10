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

// Lot 2 : « repos » retiré — la base ne l'accepte pas (planning_absence_type_check).
export const ABSENCE_TYPES = ['conge', 'maladie', 'intemperie'] as const;
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
    // `city` est NOT NULL en base (comme l'import et « Ajouter ce chantier ») :
    // sans ville, une chaîne vide — `null` faisait échouer la création.
    client_phone: t(w.client_phone), client_email: t(w.client_email), city: (w.city ?? '').trim(), address: t(w.address),
    description: t(w.description), is_active: true,
  }).select().single();
  if (error) throw error;
  return data as { id: string; client_name: string };
}

/**
 * « Ajouter au planning » / glisser un client sur une case. Renvoie l'id créé
 * (lot 7 : « Annuler » de l'assistant). `estimatedStart` : heure prévue, comme
 * « Heure fixe » dans la bulle.
 */
export async function addPlanningSlot(p: { companyId: string; createdBy: string; userId: string; worksiteId: string; workDate: string; notes?: string | null; estimatedStart?: string | null; estimatedEnd?: string | null }): Promise<string> {
  const { data, error } = await supabase.from('planning').insert({
    company_id: p.companyId, created_by: p.createdBy, user_id: p.userId,
    worksite_id: p.worksiteId, work_date: p.workDate,
    estimated_start: p.estimatedStart ? `${p.estimatedStart.slice(0, 5)}:00` : null, estimated_end: p.estimatedEnd ? `${p.estimatedEnd.slice(0, 5)}:00` : null,
    notes: (p.notes ?? '').trim() || null, absence_type: null,
  }).select('id').single();
  if (error) throw error;
  return (data as { id: string }).id;
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
export interface AbsenceRow { work_date: string; absence_type: string; created_by: string | null }
/**
 * Renvoie ce qu'il faut pour ANNULER (lot 7) : les lignes créées, et les
 * absences qu'elles ont remplacées sur la période.
 */
export async function setAbsence(p: { companyId: string; createdBy: string; userId: string; type: string; from: string; to: string }): Promise<{ ids: string[]; replaced: AbsenceRow[] }> {
  const dates = daysBetween(p.from, p.to);
  const { data: before, error: readErr } = await supabase.from('planning').select('id, work_date, absence_type, created_by')
    .eq('company_id', p.companyId).eq('user_id', p.userId)
    .gte('work_date', p.from).lte('work_date', p.to).not('absence_type', 'is', null);
  if (readErr) throw readErr;
  const rows = dates.map((dt) => ({
    company_id: p.companyId, created_by: p.createdBy, user_id: p.userId,
    worksite_id: null, work_date: dt, estimated_start: null, estimated_end: null,
    notes: null, absence_type: p.type,
  }));
  // Lot 2 : la NOUVELLE absence d'abord, l'ancienne ensuite. Dans l'autre ordre,
  // un type refusé par la base (« Repos ») effaçait les congés déjà posés sur la
  // période, puis échouait : des absences perdues sans un mot.
  const { data, error } = await supabase.from('planning').insert(rows).select('id');
  if (error) throw error;
  const ids = ((data || []) as { id: string }[]).map((r) => r.id);
  const old = ((before || []) as (AbsenceRow & { id: string })[]);
  if (old.length) {
    const { error: delErr } = await supabase.from('planning').delete()
      .eq('company_id', p.companyId).in('id', old.map((r) => r.id));
    if (delErr) {
      // Rien ne doit rester en double : on retire ce qu'on vient de poser.
      await supabase.from('planning').delete().eq('company_id', p.companyId).in('id', ids);
      throw delErr;
    }
  }
  return { ids, replaced: old.map(({ work_date, absence_type, created_by }) => ({ work_date, absence_type, created_by })) };
}

/** Annule un `setAbsence` : retire les lignes posées, remet les absences remplacées. */
export async function undoAbsence(p: { companyId: string; userId: string; ids: string[]; replaced: AbsenceRow[] }) {
  if (p.ids.length) {
    const { error } = await supabase.from('planning').delete().eq('company_id', p.companyId).in('id', p.ids);
    if (error) throw error;
  }
  if (p.replaced.length) {
    const { error } = await supabase.from('planning').insert(p.replaced.map((r) => ({
      company_id: p.companyId, created_by: r.created_by, user_id: p.userId, worksite_id: null, work_date: r.work_date,
      estimated_start: null, estimated_end: null, notes: null, absence_type: r.absence_type,
    })));
    if (error) throw error;
  }
}

/** Budget main-d'œuvre d'un client (mêmes colonnes que la « Fiche client »). */
export async function setWorksiteBudget(companyId: string, worksiteId: string, hours: number | null, amount: number | null) {
  const { error } = await supabase.from('worksites').update({ budget_hours: hours, budget_amount: amount })
    .eq('id', worksiteId).eq('company_id', companyId);
  if (error) throw error;
}

/** Après une invitation : le compte est créé tout de suite (handle_new_user) → son id. */
export async function invitedUserId(companyId: string, email: string): Promise<string | null> {
  const { data } = await supabase.from('users').select('id').eq('company_id', companyId).ilike('email', email).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Infos paie NON sensibles (mêmes colonnes que « Infos paie » de la fiche
 * salarié). Le n° de sécurité sociale n'est JAMAIS écrit d'ici.
 */
export async function savePayrollBasics(p: { companyId: string; userId: string; hireDate?: string | null; contract?: string | null; hourlyRate?: number | null; weeklyHours?: number | null }) {
  const { error } = await supabase.from('user_payroll').upsert({
    user_id: p.userId, company_id: p.companyId,
    hire_date: p.hireDate || null, contract_type: (p.contract ?? '').trim() || null,
    hourly_rate: p.hourlyRate ?? null, weekly_hours: p.weeklyHours ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw error;
}
