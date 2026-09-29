// Assistant BEMEXO qui AGIT (lot 3 bis) — l'EXÉCUTION, côté navigateur.
//
// Rien ne part d'ici sans le clic « Confirmer » sur la carte. Chaque action
// passe par le code de l'interface (lib/planning-writes.ts, lib/corrections.ts),
// avec la session du patron connecté : ses droits, sa RLS, rien de plus.
// Après réussite, une ligne est ajoutée au journal `assistant_actions`.
import { supabase } from '@/lib/supabase';
import { addPlanningSlot, createWorksite, inviteWorker, setAbsence } from '@/lib/planning-writes';
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
}

export interface ActionResult { ok: boolean; message: string }
export type ActionExecutor = (d: ActionDraft, summary: string) => Promise<ActionResult>;

const LOG_NAME: Record<ActionDraft['type'], string> = {
  inviter_salarie: 'inviter_salarie', creer_chantier: 'creer_chantier', poser_absence: 'poser_absence',
  affecter_planning: 'affecter_planning', planning_semaine: 'appliquer_planning_semaine', corriger_pointage: 'corriger_pointage',
};

const errText = (e: unknown, fallback: string) => (e as { message?: string } | null)?.message || fallback;

/** Exécuteur réel : le patron connecté, son entreprise. */
export function makeActionExecutor(user: { id: string; company_id: string }): ActionExecutor {
  const base = { companyId: user.company_id, createdBy: user.id };
  return async (d, summary) => {
    let message = '';
    try {
      switch (d.type) {
        case 'inviter_salarie':
          await inviteWorker({ companyId: user.company_id, email: d.email, firstName: d.prenom, lastName: d.nom, phone: d.telephone });
          message = `Invitation envoyée à ${d.email}.`;
          break;
        case 'creer_chantier':
          await createWorksite(user.company_id, {
            client_name: d.nom_client, city: d.ville, address: d.adresse, client_phone: d.telephone, client_email: d.email, description: d.description,
          });
          message = `Client « ${d.nom_client} » créé.`;
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
