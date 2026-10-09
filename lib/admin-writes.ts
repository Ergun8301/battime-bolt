// Écritures du bureau (suite de lib/planning-writes.ts), partagées ENTRE les
// écrans et l'Assistant BEMEXO (lot 7 : « l'IA a accès à tous les boutons »).
//
// Même règle qu'au lot 3 bis : l'assistant n'a JAMAIS sa propre version d'un
// geste. Chaque fonction est le code de l'écran, sorti tel quel et appelé par
// les deux : mêmes tables, mêmes champs, même RLS, mêmes droits (ceux de la
// personne connectée). Chaque fonction LÈVE l'erreur : l'appelant l'affiche.
import { supabase } from '@/lib/supabase';
import { setAbsence } from '@/lib/planning-writes';

// ── Planning : une bulle (popup « Enregistrer », glisser vers une autre case) ─
// Lot 11 : « Horaire prévu : début – fin » (les deux facultatifs). `estimatedEnd`
// absent (undefined) = comportement d'avant : poser un début efface la fin.
export interface SlotPatch { estimatedStart?: string | null; estimatedEnd?: string | null; notes?: string | null; userId?: string; workDate?: string }
const hhmmss = (v: string | null | undefined) => (v ? `${v.slice(0, 5)}:00` : null);
export async function updatePlanningSlot(companyId: string, id: string, p: SlotPatch) {
  const row: Record<string, unknown> = {};
  if (p.estimatedStart !== undefined) { row.estimated_start = hhmmss(p.estimatedStart); row.estimated_end = null; }
  if (p.estimatedEnd !== undefined) row.estimated_end = hhmmss(p.estimatedEnd);
  if (p.notes !== undefined) row.notes = (p.notes ?? '').trim() || null;
  if (p.userId) row.user_id = p.userId;
  if (p.workDate) row.work_date = p.workDate;
  const { error } = await supabase.from('planning').update(row).eq('id', id).eq('company_id', companyId);
  if (error) throw error;
}

// ── Fiche client ─────────────────────────────────────────────────────────────
export interface WorksitePatch {
  client_name?: string; product_type?: string | null; client_phone?: string | null; client_email?: string | null;
  city?: string | null; address?: string | null; description?: string | null; budget_hours?: number | null; budget_amount?: number | null;
}
/** « Fiche client » → « Enregistrer » (seuls les champs fournis changent). */
export async function updateWorksite(companyId: string, id: string, w: WorksitePatch) {
  const t = (v?: string | null) => (v ?? '').trim() || null;
  const row: Record<string, unknown> = {};
  if (w.client_name !== undefined) row.client_name = (w.client_name ?? '').trim();
  if (w.product_type !== undefined) row.product_type = t(w.product_type);
  if (w.client_phone !== undefined) row.client_phone = t(w.client_phone);
  if (w.client_email !== undefined) row.client_email = t(w.client_email);
  // `city` est NOT NULL en base : vide = chaîne vide, jamais null.
  if (w.city !== undefined) row.city = (w.city ?? '').trim();
  if (w.address !== undefined) row.address = t(w.address);
  if (w.description !== undefined) row.description = t(w.description);
  if (w.budget_hours !== undefined) row.budget_hours = w.budget_hours;
  if (w.budget_amount !== undefined) row.budget_amount = w.budget_amount;
  const { error } = await supabase.from('worksites').update(row).eq('id', id).eq('company_id', companyId);
  if (error) throw error;
}
/** « Archiver » (ou réactiver) un client. */
export async function setWorksiteActive(companyId: string, id: string, active: boolean) {
  const { error } = await supabase.from('worksites').update({ is_active: active }).eq('id', id).eq('company_id', companyId);
  if (error) throw error;
}

// ── Salariés ─────────────────────────────────────────────────────────────────
export type Role = 'admin' | 'lead' | 'worker';
/** Sélecteur « Salarié / Chef d'équipe / Bureau ». */
export async function setUserRole(userId: string, role: Role) {
  const { error } = await supabase.rpc('set_user_role', { p_user_id: userId, p_role: role });
  if (error) throw error;
}
/** Fiche salarié → identité (JAMAIS le n° de sécurité sociale d'ici). */
export async function updateWorkerIdentity(companyId: string, userId: string, p: { firstName: string; lastName: string; phone?: string | null }) {
  const { error } = await supabase.from('users').update({
    first_name: p.firstName.trim(), last_name: p.lastName.trim(), phone: (p.phone ?? '').trim() || null,
  }).eq('id', userId).eq('company_id', companyId);
  if (error) throw error;
}
/** Fiche salarié → « Archiver » / « Réactiver ». */
export async function setWorkerActive(companyId: string, userId: string, active: boolean) {
  const { error } = await supabase.from('users').update({ is_active: active }).eq('id', userId).eq('company_id', companyId);
  if (error) throw error;
}
/** Habilitations → « Ajouter ». */
export async function addCertification(companyId: string, userId: string, c: { type: string; label?: string | null; expiry: string }) {
  const { error } = await supabase.from('certifications').insert({
    company_id: companyId, user_id: userId, type: c.type, label: (c.label ?? '').trim() || null, expiry_date: c.expiry,
  });
  if (error) throw error;
}
export const CERT_TYPES = ['caces', 'carte_btp', 'habilitation_electrique', 'visite_medicale', 'travail_hauteur', 'autre'] as const;

/** Invitations en attente → « Relancer » (même envoi que l'invitation). */
export async function resendInvitation(companyId: string, inv: { email: string; first_name: string | null; last_name: string | null; phone?: string | null }) {
  const { error } = await supabase.functions.invoke('invite-worker', {
    body: { email: inv.email, first_name: inv.first_name, last_name: inv.last_name, phone: inv.phone || null, company_id: companyId, role: 'worker' },
  });
  if (error) throw error;
}

/**
 * Invitations en attente → croix ✕ : annule l'invitation. Le serveur supprime
 * aussi le compte de l'invité s'il ne s'est jamais connecté et n'a aucune heure.
 */
export async function revokeInvitation(email: string) {
  const { error } = await supabase.functions.invoke('invite-worker', { body: { action: 'revoke', email } });
  if (error) throw error;
}

/**
 * Invitations en attente : date du dernier e-mail d'invitation, par adresse
 * (en minuscules). Absente = jamais envoyée (compte préparé sans e-mail).
 */
export async function fetchInvitationsSentAt(): Promise<Map<string, string | null>> {
  const { data, error } = await supabase.rpc('pending_invitations_sent_at');
  if (error) throw error;
  const sent = new Map<string, string | null>();
  for (const row of (data || []) as { email: string | null; invited_at: string | null }[]) {
    if (row.email) sent.set(row.email.toLowerCase(), row.invited_at);
  }
  return sent;
}

/** Le message d'erreur renvoyé par une fonction serveur (sinon `fallback`). */
export async function functionErrorMessage(err: unknown, fallback: string): Promise<string> {
  try {
    const body = await (err as { context?: Response }).context?.json();
    if (body?.error) return String(body.error);
  } catch { /* corps illisible : message générique */ }
  return fallback;
}

/** Cloche « Envoyer un rappel » (notification). Renvoie le nombre d'appareils touchés. */
export async function sendHoursReminder(userId: string, jours: string): Promise<number> {
  const { data, error } = await supabase.functions.invoke('send-push', {
    body: {
      user_ids: [userId],
      title: 'Pense à envoyer tes heures',
      body: jours ? `Il manque : ${jours}.` : 'Il manque des journées planifiées.',
      url: '/poseur',
      tag: 'rappel-heures',
    },
  });
  if (error) throw error;
  return (data as { sent?: number } | null)?.sent || 0;
}

// ── Mois, heures ─────────────────────────────────────────────────────────────
/** « Clôturer » un mois ('aaaa-mm'). */
export async function closeMonth(companyId: string, userId: string, month: string) {
  const { error } = await supabase.from('month_closures').insert({ company_id: companyId, month: `${month}-01`, closed_by: userId });
  if (error) throw error;
}
/** « Attribuer un client » aux heures notées sur « Autre » (ou sans chantier). */
export async function attributeEntries(companyId: string, p: { userId: string; date: string; fromWorksiteId: string | null; toWorksiteId: string }) {
  const base = supabase.from('time_entries').update({ worksite_id: p.toWorksiteId })
    .eq('company_id', companyId).eq('user_id', p.userId).eq('work_date', p.date);
  const { error } = await (p.fromWorksiteId ? base.eq('worksite_id', p.fromWorksiteId) : base.is('worksite_id', null));
  if (error) throw error;
}

// ── Congés ───────────────────────────────────────────────────────────────────
/** Notification au salarié : un bonus, jamais bloquant. */
export async function notifyWorker(userId: string, title: string, body: string, tag = 'conge') {
  try {
    await supabase.functions.invoke('send-push', { body: { user_ids: [userId], title, body, url: '/poseur', tag } });
  } catch { /* le push est un bonus, pas le canal de vérité */ }
}
const dmy = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export interface LeaveRow { id: string; user_id: string; type: string; start_date: string; end_date: string }
/**
 * Demande de congé → ✓. Mêmes opérations que « Statut » sur le planning (on
 * purge les absences de la période puis une ligne par jour), puis le statut,
 * puis la notification.
 */
export async function approveLeave(companyId: string, adminId: string, r: LeaveRow) {
  await setAbsence({ companyId, createdBy: adminId, userId: r.user_id, type: r.type, from: r.start_date, to: r.end_date });
  const { error } = await supabase.from('leave_requests')
    .update({ status: 'approved', decided_at: new Date().toISOString(), decided_by: adminId }).eq('id', r.id);
  if (error) throw error;
  await notifyWorker(r.user_id, 'Congé accepté', `Ta demande du ${dmy(r.start_date)} au ${dmy(r.end_date)} a été acceptée.`);
}
/** Demande de congé → ✗ (motif facultatif). */
export async function rejectLeave(adminId: string, r: LeaveRow, note: string) {
  const { error } = await supabase.from('leave_requests').update({
    status: 'rejected', decided_at: new Date().toISOString(), decided_by: adminId, decision_note: note.trim() || null,
  }).eq('id', r.id);
  if (error) throw error;
  await notifyWorker(r.user_id, 'Congé refusé', note.trim() || `Ta demande du ${dmy(r.start_date)} n'a pas été retenue.`);
}

// ── Réserves, dépenses ───────────────────────────────────────────────────────
/** Réserves → « Lever la réserve » / « Rouvrir ». */
export async function setReserveResolution(entryId: string, resolved: boolean, note?: string | null) {
  const { error } = await supabase.rpc('set_reserve_resolution', { p_entry_id: entryId, p_resolved: resolved, p_note: note ?? null });
  if (error) throw error;
}
export const EXPENSE_CATEGORIES = ['materiaux', 'sous_traitance', 'location', 'autre'] as const;
/** Coût chantiers → « Ajouter une dépense ». */
export async function addExpense(companyId: string, userId: string | null, e: { worksiteId: string; spentOn: string; category: string; label?: string | null; amount: number }) {
  const { data, error } = await supabase.from('worksite_expenses').insert({
    company_id: companyId, worksite_id: e.worksiteId, spent_on: e.spentOn,
    category: e.category, label: (e.label ?? '').trim() || null, amount: e.amount, created_by: userId,
  }).select('id').single();
  if (error) throw error;
  return (data as { id: string }).id;
}

// ── Réglages de l'entreprise ─────────────────────────────────────────────────
export interface CompanySettings {
  name: string; siret: string; tva_intra: string; address: string; postal_code: string; city: string; phone: string; email: string; logo_url: string;
  auto_reminder_enabled: boolean; reminder_hour: number; budget_alerts_enabled: boolean; travel_paid: boolean;
  weekly_hours: number; accountant_email: string | null; overtime_rate_1: number; overtime_rate_2: number;
}
/** « Réglages de l'entreprise » → « Enregistrer » (fonction serveur `update_company_info`). */
export async function saveCompanySettings(s: CompanySettings) {
  const { error } = await supabase.rpc('update_company_info', {
    p_name: s.name, p_siret: s.siret, p_tva_intra: s.tva_intra, p_address: s.address,
    p_postal_code: s.postal_code, p_city: s.city, p_phone: s.phone, p_email: s.email, p_logo_url: s.logo_url,
    p_auto_reminder_enabled: s.auto_reminder_enabled, p_reminder_hour: s.reminder_hour,
    p_budget_alerts_enabled: s.budget_alerts_enabled,
    p_travel_paid: s.travel_paid,
    p_weekly_hours: s.weekly_hours,
    p_accountant_email: s.accountant_email,
    p_overtime_rate_1: s.overtime_rate_1,
    p_overtime_rate_2: s.overtime_rate_2,
  });
  if (error) throw error;
}
/** Réglages actuels (mêmes colonnes et mêmes valeurs par défaut que l'écran). */
export async function readCompanySettings(companyId: string): Promise<CompanySettings> {
  const { data, error } = await supabase.from('companies')
    .select('name, siret, tva_intra, address, postal_code, city, phone, email, logo_url, auto_reminder_enabled, reminder_hour, budget_alerts_enabled, travel_paid, weekly_hours, accountant_email, overtime_rate_1, overtime_rate_2')
    .eq('id', companyId).maybeSingle();
  if (error) throw error;
  const d = (data || {}) as Partial<Record<keyof CompanySettings, unknown>>;
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    name: s(d.name), siret: s(d.siret), tva_intra: s(d.tva_intra), address: s(d.address), postal_code: s(d.postal_code),
    city: s(d.city), phone: s(d.phone), email: s(d.email), logo_url: s(d.logo_url),
    auto_reminder_enabled: (d.auto_reminder_enabled as boolean | null) ?? true,
    reminder_hour: (d.reminder_hour as number | null) ?? 17,
    budget_alerts_enabled: (d.budget_alerts_enabled as boolean | null) ?? true,
    travel_paid: (d.travel_paid as boolean | null) ?? false,
    weekly_hours: (d.weekly_hours as number | null) ?? 35,
    accountant_email: (d.accountant_email as string | null) || null,
    overtime_rate_1: (d.overtime_rate_1 as number | null) ?? 25,
    overtime_rate_2: (d.overtime_rate_2 as number | null) ?? 50,
  };
}
