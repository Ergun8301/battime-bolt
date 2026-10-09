// Assistant BEMEXO qui AGIT — l'EXÉCUTION, côté navigateur (lot 3 bis, lot 7).
//
// Chaque action passe par le code de l'interface (lib/planning-writes.ts,
// lib/admin-writes.ts, lib/corrections.ts, lib/chantier-docs.ts,
// lib/real-cost.ts), avec la session de la personne connectée : ses droits,
// sa RLS, rien de plus.
//
// Lot 7 : les actions directes (clair, complet, réversible) sont lancées par
// l'écran sans clic « Confirmer » ; chacune rend une VRAIE annulation (`undo`)
// qui défait exactement ce qui a été écrit. Tout est noté dans le journal
// `assistant_journal` (qui, quoi, quand — annulations comprises).
import { supabase } from '@/lib/supabase';
import {
  addPlanningSlot, createWorksite, invitedUserId, inviteWorker, savePayrollBasics, setAbsence, setWorksiteBudget, undoAbsence,
} from '@/lib/planning-writes';
import {
  addCertification, addExpense, approveLeave, attributeEntries, closeMonth, readCompanySettings, rejectLeave, resendInvitation,
  saveCompanySettings, sendHoursReminder, setReserveResolution, setUserRole, setWorkerActive, setWorksiteActive,
  updatePlanningSlot, updateWorkerIdentity, updateWorksite, type Role,
} from '@/lib/admin-writes';
import { removeWorksiteDocument, uploadWorksiteDocument } from '@/lib/chantier-docs';
import { sanitizeExtraction, supabaseCostSource } from '@/lib/real-cost';
import { corrigerHeures } from '@/lib/corrections';
import { casesLabel, eraseOne, erasePlanning, planningLinkReason, restoreRows, undoErase } from '@/lib/erase';
import { DOC_CATEGORY_LABEL, type ActionDraft, type ActionQuestion } from '@/supabase/functions/_shared/assistant-actions-core';

export type {
  ActionDraft, AssistantAction, EntryChoice, ActionQuestion,
} from '@/supabase/functions/_shared/assistant-actions-core';
export {
  ABSENCE_KINDS, ABSENCE_LABEL, CERT_LABEL, DOC_CATEGORY_LABEL, EXPENSE_LABEL, ROLE_LABEL, actionMode, applyAnswer, checkAction, frDate, questionFor, summarize,
} from '@/supabase/functions/_shared/assistant-actions-core';

export interface ActionOptions {
  salaries: { id: string; nom: string }[];
  chantiers: { id: string; nom: string; ville: string | null }[];
}
/** Ce que la réponse de l'assistant transporte jusqu'à la carte. */
export interface ActionExtra {
  action: { draft: ActionDraft; problems: string[]; summary: string; question?: ActionQuestion | null };
  options: ActionOptions;
  /** 📎 Le fichier joint, resté dans l'écran jusqu'à l'exécution. */
  attachment?: File;
  /** Lot 7 : la question posée s'il manque une info (le panneau garde la demande). */
  pendingQuestion?: string;
}

export interface ActionResult {
  ok: boolean; message: string; undo?: () => Promise<ActionResult>;
  /** Lot 8 : nombre d'éléments effacés (au-delà de 10, « Annuler » est mis en avant). */
  count?: number;
}
export type ActionExecutor = (d: ActionDraft, summary: string, attachment?: File) => Promise<ActionResult>;

const n = (v?: string) => (v && Number(v) > 0 ? Number(v) : null);
const yes = (v: string, fallback: boolean) => (v === 'oui' ? true : v === 'non' ? false : fallback);

/** Chiffres du bulletin → coût réel (lot 2), avec LES MÊMES contrôles que l'écran. */
export function bulletinFigures(b: { mois: string; brut: string; cout_employeur: string; heures_payees: string }) {
  const { figures, doubts } = sanitizeExtraction({ month: b.mois, gross: n(b.brut), employer_total: n(b.cout_employeur), paid_hours: n(b.heures_payees) });
  const complete = !!(figures.month && figures.gross && figures.employer_total && figures.paid_hours) && doubts.length === 0;
  return { figures, complete };
}

const errText = (e: unknown, fallback: string) => (e as { message?: string } | null)?.message || fallback;

/** Journal : qui, quoi, quand. L'action est faite même si la trace échoue ; on le dit. */
async function journal(action: string, summary: string, undone = false): Promise<boolean> {
  const { error } = await supabase.rpc('assistant_journal_log', { p_action: action, p_summary: summary, p_undone: undone });
  return !error;
}

/** Exécuteur réel : la personne du bureau connectée, son entreprise. */
export function makeActionExecutor(user: { id: string; company_id: string }): ActionExecutor {
  const cid = user.company_id;
  const base = { companyId: cid, createdBy: user.id };
  return async (d, summary, attachment) => {
    let message = '';
    // Lot 8 : l'annulation peut rendre son propre message (« 27 cases remises »).
    let undo: (() => Promise<void | string>) | undefined;
    let count: number | undefined;
    try {
      switch (d.type) {
        case 'inviter_salarie': {
          await inviteWorker({ companyId: cid, email: d.email, firstName: d.prenom, lastName: d.nom, phone: d.telephone });
          message = `Invitation envoyée à ${d.email}.`;
          // Bulletin joint : infos paie non sensibles + coût réel. Le bulletin
          // lui-même n'est PAS conservé (règle du lot 2), le n° de sécu jamais lu.
          const hasPay = !!(d.date_entree || d.contrat || n(d.taux_horaire) || n(d.heures_hebdo));
          const slip = d.bulletin ? bulletinFigures(d.bulletin) : null;
          if (hasPay || slip?.complete) {
            const uid = await invitedUserId(cid, d.email);
            if (!uid) { message += ' Infos de paie à saisir sur sa fiche (compte pas encore visible).'; break; }
            if (hasPay) await savePayrollBasics({ companyId: cid, userId: uid, hireDate: d.date_entree, contract: d.contrat, hourlyRate: n(d.taux_horaire), weeklyHours: n(d.heures_hebdo) });
            if (slip?.complete) {
              const err = await supabaseCostSource.save(cid, uid, slip.figures, 'ai');
              message += err ? ` Coût réel non enregistré : ${err}` : ' Infos de paie et coût réel enregistrés.';
            } else message += ' Infos de paie enregistrées.';
          }
          break;
        }
        case 'creer_chantier': {
          const ws = await createWorksite(cid, {
            client_name: d.nom_client, city: d.ville, address: d.adresse, client_phone: d.telephone, client_email: d.email, description: d.description,
          });
          message = `Client « ${d.nom_client} » créé.`;
          if (n(d.budget_heures) || n(d.budget_montant)) {
            await setWorksiteBudget(cid, ws.id, n(d.budget_heures), n(d.budget_montant));
            message += ' Budget enregistré.';
          }
          let doc: { id: string; path: string } | null = null;
          if (attachment) {
            doc = await uploadWorksiteDocument({ companyId: cid, userId: user.id, worksiteId: ws.id, file: attachment });
            message += ' Devis rangé dans ses documents.';
          }
          // Annuler : le client vient d'être créé, rien d'autre ne s'y rattache —
          // on le retire ; si la base refuse (il a déjà servi), on l'archive.
          undo = async () => {
            if (doc) await removeWorksiteDocument(doc.id, doc.path);
            const { error } = await supabase.from('worksites').delete().eq('id', ws.id).eq('company_id', cid);
            if (error) await setWorksiteActive(cid, ws.id, false);
          };
          break;
        }
        case 'ranger_document': {
          if (!attachment) return { ok: false, message: 'Aucun fichier joint.' };
          const doc = await uploadWorksiteDocument({
            companyId: cid, userId: user.id, worksiteId: d.worksite_id!, file: attachment,
            ...(d.categorie ? { category: d.categorie } : {}), ...(d.libelle ? { label: d.libelle } : {}),
          });
          message = d.categorie ? `Rangé dans le chantier (${DOC_CATEGORY_LABEL[d.categorie]}).` : 'Document rangé dans le chantier.';
          undo = () => removeWorksiteDocument(doc.id, doc.path);
          break;
        }
        case 'poser_absence': {
          const r = await setAbsence({ ...base, userId: d.user_id!, type: d.absence_type, from: d.du, to: d.au });
          message = 'Absence enregistrée au planning.';
          undo = () => undoAbsence({ companyId: cid, userId: d.user_id!, ids: r.ids, replaced: r.replaced });
          break;
        }
        case 'affecter_planning': {
          const ids: string[] = [];
          for (const day of d.dates) ids.push(await addPlanningSlot({ ...base, userId: d.user_id!, worksiteId: d.worksite_id!, workDate: day, notes: d.note, estimatedStart: d.debut || null, estimatedEnd: d.fin || null }));
          message = `${d.dates.length} jour${d.dates.length > 1 ? 's' : ''} ajouté${d.dates.length > 1 ? 's' : ''} au planning.`;
          undo = async () => {
            const { error } = await supabase.from('planning').delete().eq('company_id', cid).in('id', ids);
            if (error) throw error;
          };
          break;
        }
        case 'planning_semaine': {
          const rows = d.lignes.filter((l) => l.worksite_id);
          for (const l of rows) await addPlanningSlot({ ...base, userId: l.user_id, worksiteId: l.worksite_id!, workDate: l.date });
          message = `Planning appliqué : ${rows.length} affectation${rows.length > 1 ? 's' : ''}.`;
          break;
        }
        case 'corriger_pointage': {
          const r = await corrigerHeures({ entryId: d.entry_id!, newStart: d.debut, newEnd: d.fin });
          if (!r.ok) return { ok: false, message: r.message };
          message = r.message;
          break;
        }
        // ── Lot 7 ──
        case 'modifier_intervention': {
          // L'état d'avant, pour « Annuler ».
          const { data: prev, error: readErr } = await supabase.from('planning').select('user_id, work_date, estimated_start, estimated_end, notes')
            .eq('id', d.planning_id!).eq('company_id', cid).single();
          if (readErr) throw readErr;
          const p0 = prev as { user_id: string; work_date: string; estimated_start: string | null; estimated_end: string | null; notes: string | null };
          // Lot 2 : changer de jour ou de salarié = la même garde que le glisser du
          // planning. Une case qui porte des heures (ou retirée par le salarié) ne bouge pas.
          if ((d.nouvelle_date && d.nouvelle_date !== p0.work_date) || (d.nouveau_user_id && d.nouveau_user_id !== p0.user_id)) {
            const lock = await planningLinkReason(cid, d.planning_id!);
            if (lock) return { ok: false, message: `Rien n’a été déplacé : ${lock}.` };
          }
          // Lot 11 : « décale à 9h » sur 08:00–12:00 garde la fin (09:00–12:00) tant
          // qu'elle reste après le nouveau début ; sinon la fin est retirée.
          const keptEnd = d.debut && p0.estimated_end && p0.estimated_end.slice(0, 5) > d.debut.slice(0, 5) ? p0.estimated_end : null;
          await updatePlanningSlot(cid, d.planning_id!, {
            ...(d.nouvelle_date ? { workDate: d.nouvelle_date } : {}), ...(d.nouveau_user_id ? { userId: d.nouveau_user_id } : {}),
            ...(d.debut ? { estimatedStart: d.debut, estimatedEnd: keptEnd } : {}), ...(d.note !== null ? { notes: d.note } : {}),
          });
          message = 'Intervention modifiée.';
          // « Annuler » remet le début ET la fin d'avant.
          undo = () => updatePlanningSlot(cid, d.planning_id!, {
            userId: p0.user_id, workDate: p0.work_date, estimatedStart: p0.estimated_start, estimatedEnd: p0.estimated_end, notes: p0.notes,
          });
          break;
        }
        case 'repondre_conge': {
          const c = d.choix.find((x) => x.id === d.leave_id)!;
          const row = { id: c.id, user_id: c.user_id, type: c.type, start_date: c.du, end_date: c.au };
          if (d.decision === 'refuser') { await rejectLeave(user.id, row, d.motif); message = 'Demande refusée, le salarié est prévenu.'; }
          else { await approveLeave(cid, user.id, row); message = 'Demande acceptée, absence posée au planning, le salarié est prévenu.'; }
          break;
        }
        case 'lever_reserve':
          await setReserveResolution(d.entry_id!, true, d.note || null);
          message = 'Réserve levée.';
          break;
        case 'ajouter_depense':
          await addExpense(cid, user.id, { worksiteId: d.worksite_id!, spentOn: d.date, category: d.categorie, label: d.libelle, amount: Number(d.montant) });
          message = 'Dépense ajoutée au coût du chantier.';
          break;
        case 'modifier_client':
          await updateWorksite(cid, d.worksite_id!, {
            ...(d.nom ? { client_name: d.nom } : {}), ...(d.ville ? { city: d.ville } : {}), ...(d.adresse ? { address: d.adresse } : {}),
            ...(d.telephone ? { client_phone: d.telephone } : {}), ...(d.email ? { client_email: d.email } : {}),
            ...(d.description ? { description: d.description } : {}),
            ...(d.budget_heures ? { budget_hours: Number(d.budget_heures) } : {}), ...(d.budget_montant ? { budget_amount: Number(d.budget_montant) } : {}),
          });
          message = 'Fiche client enregistrée.';
          break;
        case 'archiver_client':
          await setWorksiteActive(cid, d.worksite_id!, false);
          message = 'Client archivé.';
          break;
        case 'changer_role':
          await setUserRole(d.user_id!, d.role as Role);
          message = 'Rôle changé.';
          break;
        case 'relancer_invitation': {
          const { data: inv } = await supabase.from('invitations').select('email, first_name, last_name, phone').eq('company_id', cid).eq('email', d.email).is('accepted_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
          if (!inv) return { ok: false, message: 'Invitation introuvable (déjà acceptée ?).' };
          await resendInvitation(cid, inv as { email: string; first_name: string | null; last_name: string | null; phone: string | null });
          message = 'Invitation renvoyée.';
          break;
        }
        case 'envoyer_rappel': {
          const sent = await sendHoursReminder(d.user_id!, '');
          message = sent > 0 ? 'Rappel envoyé sur son téléphone.' : 'Il n’a pas activé les notifications : rappel non envoyé. Utilisez la cloche du planning (email).';
          if (!sent) return { ok: false, message };
          break;
        }
        case 'cloturer_mois':
          await closeMonth(cid, user.id, d.mois);
          message = 'Mois clôturé.';
          break;
        case 'attribuer_client': {
          // Les heures notées sur « Autre » (ou sans chantier) ce jour-là.
          const { data: autre } = await supabase.from('worksites').select('id').eq('company_id', cid).eq('client_name', 'Autre').limit(1).maybeSingle();
          const from = (autre as { id: string } | null)?.id ?? null;
          await attributeEntries(cid, { userId: d.user_id!, date: d.date, fromWorksiteId: from, toWorksiteId: d.worksite_id! });
          message = 'Client attribué.';
          break;
        }
        case 'ajouter_habilitation':
          await addCertification(cid, d.user_id!, { type: d.categorie, label: d.libelle, expiry: d.expiration });
          message = 'Habilitation ajoutée.';
          break;
        case 'modifier_salarie': {
          const { data: u } = await supabase.from('users').select('first_name, last_name, phone').eq('id', d.user_id!).eq('company_id', cid).single();
          const w = u as { first_name: string | null; last_name: string | null; phone: string | null };
          await updateWorkerIdentity(cid, d.user_id!, { firstName: d.prenom || w.first_name || '', lastName: d.nom || w.last_name || '', phone: d.telephone || w.phone });
          message = 'Fiche du salarié enregistrée.';
          break;
        }
        case 'archiver_salarie':
          await setWorkerActive(cid, d.user_id!, false);
          message = 'Salarié archivé.';
          break;
        case 'cout_reel': {
          const slip = bulletinFigures({ mois: d.mois, brut: d.brut, cout_employeur: d.cout_employeur, heures_payees: d.heures_payees });
          if (!slip.complete) return { ok: false, message: 'Chiffres du bulletin incomplets ou incohérents.' };
          const err = await supabaseCostSource.save(cid, d.user_id!, slip.figures, 'ai');
          if (err) return { ok: false, message: err };
          message = 'Coût réel enregistré. Le bulletin n’est pas conservé.';
          break;
        }
        // ── Lot 8 : revenir en arrière. Tout est lu AVANT d'être effacé : « Annuler » remet à l'identique. ──
        case 'supprimer_intervention':
        case 'effacer_planning':
        case 'supprimer_absence': {
          const r = d.type === 'supprimer_intervention'
            ? await erasePlanning(cid, { ids: [d.planning_id!] })
            : await erasePlanning(cid, { userId: d.user_id, from: d.du, to: d.au, absences: d.type === 'supprimer_absence' });
          if (!r.deleted.length) {
            return { ok: false, message: r.skipped ? `Rien n’a été retiré : ${r.reason}.` : d.type === 'supprimer_absence' ? 'Aucune absence sur ces jours.' : 'Aucune case à effacer sur cette période.' };
          }
          const k = r.deleted.length;
          count = k;
          message = d.type === 'supprimer_intervention' ? 'Retiré du planning.'
            : d.type === 'supprimer_absence' ? `${k} jour${k > 1 ? 's' : ''} d’absence retiré${k > 1 ? 's' : ''}.`
            : `${casesLabel(k)}.`;
          if (r.skipped) message += ` ${r.skipped} gardée${r.skipped > 1 ? 's' : ''} (${r.reason}).`;
          // Lot 2 : même « Annuler » que l'écran — l'intervention, ses brouillons vides, le lien des lignes retirées.
          undo = async () => { await undoErase(r); return k > 1 ? `Annulé : ${casesLabel(k, 'remise')} au planning.` : 'Annulé : c’est comme avant.'; };
          break;
        }
        case 'supprimer_document': {
          const { data: doc, error: readErr } = await supabase.from('documents').select('*').eq('id', d.document_id!).eq('company_id', cid).single();
          if (readErr) throw readErr;
          const row = doc as Record<string, unknown> & { id: string; file_path: string; label: string | null; file_name: string | null };
          // Le fichier est gardé EN MÉMOIRE : « Annuler » le remet tel quel.
          const { data: blob, error: dlErr } = await supabase.storage.from('chantier-docs').download(row.file_path);
          if (dlErr || !blob) return { ok: false, message: 'Le fichier n’a pas pu être lu : rien n’a été supprimé.' };
          const { data: gone, error: delErr } = await supabase.from('documents').delete().eq('id', row.id).select('id');
          if (delErr) throw delErr;
          if (!gone || gone.length === 0) return { ok: false, message: 'Suppression refusée : ce document ne vous appartient pas.' };
          await supabase.storage.from('chantier-docs').remove([row.file_path]);
          message = `Document « ${row.label || row.file_name || 'sans nom'} » supprimé.`;
          undo = async () => {
            const up = await supabase.storage.from('chantier-docs').upload(row.file_path, blob, { upsert: true, contentType: blob.type || undefined });
            if (up.error) throw up.error;
            // La base exige que la personne qui (re)dépose soit l'auteur.
            const { error } = await supabase.from('documents').insert({ ...row, uploaded_by: user.id });
            if (error) throw error;
          };
          break;
        }
        case 'modifier_document': {
          const { data: prev, error: readErr } = await supabase.from('documents').select('category, label').eq('id', d.document_id!).eq('company_id', cid).single();
          if (readErr) throw readErr;
          const patch = { ...(d.categorie ? { category: d.categorie } : {}), ...(d.libelle ? { label: d.libelle } : {}) };
          const { data: upd, error } = await supabase.from('documents').update(patch).eq('id', d.document_id!).eq('company_id', cid).select('id');
          if (error) throw error;
          if (!upd || upd.length === 0) return { ok: false, message: 'Modification refusée : ce document ne vous appartient pas.' };
          message = 'Document modifié.';
          undo = async () => { const { error: e } = await supabase.from('documents').update(prev as Record<string, unknown>).eq('id', d.document_id!).eq('company_id', cid); if (e) throw e; };
          break;
        }
        case 'supprimer_depense': {
          const row = await eraseOne('worksite_expenses', cid, d.expense_id!);
          message = 'Dépense supprimée.';
          undo = () => restoreRows('worksite_expenses', [row]);
          break;
        }
        case 'modifier_depense': {
          const { data: prev, error: readErr } = await supabase.from('worksite_expenses').select('amount, label, category').eq('id', d.expense_id!).eq('company_id', cid).single();
          if (readErr) throw readErr;
          const patch = { ...(d.montant ? { amount: Number(d.montant) } : {}), ...(d.libelle ? { label: d.libelle } : {}), ...(d.categorie ? { category: d.categorie } : {}) };
          const { error } = await supabase.from('worksite_expenses').update(patch).eq('id', d.expense_id!).eq('company_id', cid);
          if (error) throw error;
          message = 'Dépense corrigée.';
          undo = async () => { const { error: e } = await supabase.from('worksite_expenses').update(prev as Record<string, unknown>).eq('id', d.expense_id!).eq('company_id', cid); if (e) throw e; };
          break;
        }
        case 'supprimer_habilitation': {
          const row = await eraseOne('certifications', cid, d.cert_id!);
          message = 'Habilitation supprimée.';
          undo = () => restoreRows('certifications', [row]);
          break;
        }
        case 'modifier_habilitation': {
          const { data: prev, error: readErr } = await supabase.from('certifications').select('expiry_date, label, alert_30_sent_at, alert_7_sent_at').eq('id', d.cert_id!).eq('company_id', cid).single();
          if (readErr) throw readErr;
          // Nouvelle date → les alertes d'expiration repartent de zéro.
          const patch = { ...(d.expiration ? { expiry_date: d.expiration, alert_30_sent_at: null, alert_7_sent_at: null } : {}), ...(d.libelle ? { label: d.libelle } : {}) };
          const { error } = await supabase.from('certifications').update(patch).eq('id', d.cert_id!).eq('company_id', cid);
          if (error) throw error;
          message = 'Habilitation modifiée.';
          undo = async () => { const { error: e } = await supabase.from('certifications').update(prev as Record<string, unknown>).eq('id', d.cert_id!).eq('company_id', cid); if (e) throw e; };
          break;
        }
        case 'annuler_invitation': {
          const { data: inv } = await supabase.from('invitations').select('email, first_name, last_name, phone').eq('company_id', cid).eq('email', d.email).is('accepted_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
          // Même chemin que la croix de « Invitations en attente ».
          const { error } = await supabase.functions.invoke('invite-worker', { body: { action: 'revoke', email: d.email } });
          if (error) throw new Error('Impossible d’annuler l’invitation.');
          message = `Invitation de ${d.email} annulée.`;
          if (inv) undo = async () => { await resendInvitation(cid, inv as { email: string; first_name: string | null; last_name: string | null; phone: string | null }); return 'Annulé : l’invitation est renvoyée.'; };
          break;
        }
        case 'modifier_reglages': {
          const cur = await readCompanySettings(cid);
          await saveCompanySettings({
            ...cur,
            weekly_hours: n(d.heures_hebdo) ?? cur.weekly_hours,
            accountant_email: d.email_comptable || cur.accountant_email,
            auto_reminder_enabled: yes(d.relance_auto, cur.auto_reminder_enabled),
            reminder_hour: d.heure_relance ? Number(d.heure_relance) : cur.reminder_hour,
            budget_alerts_enabled: yes(d.alertes_budget, cur.budget_alerts_enabled),
            travel_paid: yes(d.trajet_paye, cur.travel_paid),
            overtime_rate_1: d.majoration_1 ? Number(d.majoration_1) : cur.overtime_rate_1,
            overtime_rate_2: d.majoration_2 ? Number(d.majoration_2) : cur.overtime_rate_2,
            phone: d.telephone || cur.phone, email: d.email || cur.email, address: d.adresse || cur.address,
            postal_code: d.code_postal || cur.postal_code, city: d.ville || cur.city,
          });
          if (d.planning_collegues) {
            const { error } = await supabase.rpc('set_colleagues_planning', { p_enabled: d.planning_collegues === 'oui' });
            if (error) throw error;
          }
          message = 'Réglages enregistrés.';
          break;
        }
      }
    } catch (e) {
      return { ok: false, message: errText(e, 'Action impossible.') };
    }
    const logged = await journal(d.type, summary);
    const result: ActionResult = { ok: true, message: logged ? message : `${message} (journal non mis à jour)`, ...(count ? { count } : {}) };
    if (undo) {
      const run = undo;
      result.undo = async () => {
        let said: void | string;
        try { said = await run(); } catch (e) { return { ok: false, message: errText(e, 'Annulation impossible.') }; }
        await journal(d.type, summary, true);
        return { ok: true, message: typeof said === 'string' ? said : 'Annulé : c’est comme avant.' };
      };
    }
    return result;
  };
}

/** Démo (préviews) : rien n'est écrit, l'annulation non plus. */
export const demoActionExecutor: ActionExecutor = async (d) => {
  await new Promise((r) => setTimeout(r, 450));
  const k = d.type === 'planning_semaine' ? d.lignes.filter((l) => l.worksite_id).length : 1;
  const direct = ['affecter_planning', 'poser_absence', 'ranger_document', 'modifier_intervention', 'creer_chantier',
    'supprimer_intervention', 'effacer_planning', 'supprimer_absence', 'supprimer_document', 'modifier_document',
    'supprimer_depense', 'modifier_depense', 'supprimer_habilitation', 'modifier_habilitation'].includes(d.type);
  if (d.type === 'effacer_planning') {
    const k = 27;
    return { ok: true, count: k, message: `${casesLabel(k)} (démo, rien n’est écrit).`, undo: async () => { await new Promise((r) => setTimeout(r, 300)); return { ok: true, message: `Annulé : ${casesLabel(k, 'remise')} au planning (démo).` }; } };
  }
  return {
    ok: true,
    message: d.type === 'planning_semaine' ? `Planning appliqué : ${k} affectations (démo, rien n’est écrit).` : 'démo, rien n’est écrit.',
    ...(direct ? { undo: async () => { await new Promise((r) => setTimeout(r, 300)); return { ok: true, message: 'Annulé (démo).' }; } } : {}),
  };
};
