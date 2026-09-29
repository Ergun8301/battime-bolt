// Assistant BEMEXO qui AGIT (lot 3 bis) — l'EXÉCUTION, côté navigateur.
//
// Rien ne part d'ici sans le clic « Confirmer » sur la carte. Chaque action
// passe par le code de l'interface (lib/planning-writes.ts, lib/corrections.ts),
// avec la session du patron connecté : ses droits, sa RLS, rien de plus.
// Après réussite, une ligne est ajoutée au journal `assistant_actions`.
import { supabase } from '@/lib/supabase';
import { addPlanningSlot, createWorksite, invitedUserId, inviteWorker, savePayrollBasics, setAbsence, setWorksiteBudget } from '@/lib/planning-writes';
import { uploadWorksiteDocument } from '@/lib/chantier-docs';
import { sanitizeExtraction, supabaseCostSource } from '@/lib/real-cost';
import { corrigerHeures } from '@/lib/corrections';
import type { ActionDraft } from '@/supabase/functions/_shared/assistant-actions-core';

export type {
  ActionDraft, AssistantAction, EntryChoice,
} from '@/supabase/functions/_shared/assistant-actions-core';
export { ABSENCE_KINDS, ABSENCE_LABEL, checkAction, frDate, summarize } from '@/supabase/functions/_shared/assistant-actions-core';

export interface ActionOptions {
  salaries: { id: string; nom: string }[];
  chantiers: { id: string; nom: string; ville: string | null }[];
}
/** Ce que la réponse de l'assistant transporte jusqu'à la carte. */
export interface ActionExtra {
  action: { draft: ActionDraft; problems: string[]; summary: string };
  options: ActionOptions;
  /** 📎 Le fichier joint, resté dans l'écran jusqu'à « Confirmer ». */
  attachment?: File;
}

export interface ActionResult { ok: boolean; message: string }
export type ActionExecutor = (d: ActionDraft, summary: string, attachment?: File) => Promise<ActionResult>;

const LOG_NAME: Record<ActionDraft['type'], string> = {
  inviter_salarie: 'inviter_salarie', creer_chantier: 'creer_chantier', poser_absence: 'poser_absence',
  affecter_planning: 'affecter_planning', planning_semaine: 'appliquer_planning_semaine', corriger_pointage: 'corriger_pointage',
  ranger_document: 'ranger_document',
};
const n = (v?: string) => (v && Number(v) > 0 ? Number(v) : null);

/** Chiffres du bulletin → coût réel (lot 2), avec LES MÊMES contrôles que l'écran. */
export function bulletinFigures(b: NonNullable<Extract<ActionDraft, { type: 'inviter_salarie' }>['bulletin']>) {
  const { figures, doubts } = sanitizeExtraction({ month: b.mois, gross: n(b.brut), employer_total: n(b.cout_employeur), paid_hours: n(b.heures_payees) });
  const complete = !!(figures.month && figures.gross && figures.employer_total && figures.paid_hours) && doubts.length === 0;
  return { figures, complete };
}

const errText = (e: unknown, fallback: string) => (e as { message?: string } | null)?.message || fallback;

/** Exécuteur réel : le patron connecté, son entreprise. */
export function makeActionExecutor(user: { id: string; company_id: string }): ActionExecutor {
  const base = { companyId: user.company_id, createdBy: user.id };
  return async (d, summary, attachment) => {
    let message = '';
    try {
      switch (d.type) {
        case 'inviter_salarie': {
          await inviteWorker({ companyId: user.company_id, email: d.email, firstName: d.prenom, lastName: d.nom, phone: d.telephone });
          message = `Invitation envoyée à ${d.email}.`;
          // Bulletin joint : infos paie non sensibles + coût réel. Le bulletin
          // lui-même n'est PAS conservé (règle du lot 2), le n° de sécu jamais lu.
          const hasPay = !!(d.date_entree || d.contrat || n(d.taux_horaire) || n(d.heures_hebdo));
          const slip = d.bulletin ? bulletinFigures(d.bulletin) : null;
          if (hasPay || slip?.complete) {
            const uid = await invitedUserId(user.company_id, d.email);
            if (!uid) { message += ' Infos de paie à saisir sur sa fiche (compte pas encore visible).'; break; }
            if (hasPay) await savePayrollBasics({ companyId: user.company_id, userId: uid, hireDate: d.date_entree, contract: d.contrat, hourlyRate: n(d.taux_horaire), weeklyHours: n(d.heures_hebdo) });
            if (slip?.complete) {
              const err = await supabaseCostSource.save(user.company_id, uid, slip.figures, 'ai');
              message += err ? ` Coût réel non enregistré : ${err}` : ' Infos de paie et coût réel enregistrés.';
            } else message += ' Infos de paie enregistrées.';
          }
          break;
        }
        case 'creer_chantier': {
          const ws = await createWorksite(user.company_id, {
            client_name: d.nom_client, city: d.ville, address: d.adresse, client_phone: d.telephone, client_email: d.email, description: d.description,
          });
          message = `Client « ${d.nom_client} » créé.`;
          if (n(d.budget_heures) || n(d.budget_montant)) {
            await setWorksiteBudget(user.company_id, ws.id, n(d.budget_heures), n(d.budget_montant));
            message += ' Budget enregistré.';
          }
          if (attachment) {
            await uploadWorksiteDocument({ companyId: user.company_id, userId: user.id, worksiteId: ws.id, file: attachment });
            message += ' Devis rangé dans ses documents.';
          }
          break;
        }
        case 'ranger_document':
          if (!attachment) return { ok: false, message: 'Aucun fichier joint.' };
          await uploadWorksiteDocument({ companyId: user.company_id, userId: user.id, worksiteId: d.worksite_id!, file: attachment });
          message = 'Document rangé dans le chantier.';
          break;
        case 'poser_absence':
          await setAbsence({ ...base, userId: d.user_id!, type: d.absence_type, from: d.du, to: d.au });
          message = 'Absence enregistrée au planning.';
          break;
        case 'affecter_planning':
          for (const day of d.dates) await addPlanningSlot({ ...base, userId: d.user_id!, worksiteId: d.worksite_id!, workDate: day, notes: d.note });
          message = `${d.dates.length} jour${d.dates.length > 1 ? 's' : ''} ajouté${d.dates.length > 1 ? 's' : ''} au planning.`;
          break;
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
      }
    } catch (e) {
      return { ok: false, message: errText(e, 'Action impossible.') };
    }
    // Trace : qui, quoi, quand. L'action est faite même si la trace échoue ;
    // on le dit plutôt que de le cacher.
    const { error } = await supabase.rpc('assistant_log_action', { p_action: LOG_NAME[d.type], p_summary: summary });
    return { ok: true, message: error ? `${message} (journal non mis à jour)` : message };
  };
}

/** Démo (préviews) : rien n'est écrit. */
export const demoActionExecutor: ActionExecutor = async (d) => {
  await new Promise((r) => setTimeout(r, 450));
  const n = d.type === 'planning_semaine' ? d.lignes.filter((l) => l.worksite_id).length : 1;
  return { ok: true, message: d.type === 'planning_semaine' ? `Planning appliqué : ${n} affectations (démo, rien n’est écrit).` : 'Fait (démo, rien n’est écrit).' };
};
