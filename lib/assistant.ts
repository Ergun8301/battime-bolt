// Assistant BEMEXO (lots 3 et 3 bis) — côté navigateur.
//
// Deux sources derrière la même interface : la vraie fonction `assistant`, et
// une démo en mémoire (préviews uniquement, `?demo=assistant`), sans requête.
// Une réponse peut porter une ACTION préparée (`extra`) : la carte de
// confirmation l'affiche, rien n'est fait avant « Confirmer ».
import { supabase } from '@/lib/supabase';
import { isPreviewHost } from '@/lib/hosting';
import { attachmentPayload } from '@/lib/attachment';
import type { AssistantLink } from '@/supabase/functions/_shared/assistant-core';
import {
  addDays, fromFunctionCall, handleActionLocally, mondayOf, summarize, findGuide, guideAnswer, NAV_ACTIONS,
  type ActionContext, type LocalReply,
} from '@/supabase/functions/_shared/assistant-actions-core';

import type { ActionExtra } from '@/lib/assistant-actions';

export { ACTION_SUGGESTIONS as ASSISTANT_SUGGESTIONS } from '@/supabase/functions/_shared/assistant-actions-core';
export type { AssistantLink } from '@/supabase/functions/_shared/assistant-core';

export interface AssistantReply { answer: string; links: AssistantLink[]; remaining?: number; notice?: boolean; extra?: unknown }
export interface AssistantSource { demo: boolean; ask(question: string, file?: File): Promise<AssistantReply> }

/** Démo : uniquement sur une preview, jamais sur bemexo.com. */
export function isAssistantDemo(): boolean {
  if (typeof window === 'undefined' || !isPreviewHost()) return false;
  return new URLSearchParams(window.location.search).get('demo') === 'assistant';
}

type ServerReply = {
  answer?: string; links?: AssistantLink[]; remaining?: number; quota?: boolean; unavailable?: boolean;
  action?: ActionExtra['action']; options?: ActionExtra['options'];
};
const toReply = (d: ServerReply): AssistantReply => ({
  answer: d.answer || '…', links: d.links || [], remaining: d.remaining, notice: !!(d.quota || d.unavailable),
  extra: d.action && d.options ? ({ action: d.action, options: d.options } as ActionExtra) : undefined,
});

export const supabaseAssistantSource: AssistantSource = {
  demo: false,
  async ask(question, file) {
    try {
      const body = file ? { question, file: await attachmentPayload(file) } : { question };
      const { data, error } = await supabase.functions.invoke('assistant', { body });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const body = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => ({})) : {};
        return { answer: (body as { error?: string }).error || 'Connexion impossible. Réessayez.', links: [], notice: true };
      }
      return toReply(data as ServerReply);
    } catch {
      return { answer: 'Connexion impossible. Réessayez.', links: [], notice: true };
    }
  },
};

// ── Démo : une petite entreprise fictive, le MÊME cœur que le serveur ───────
export function demoActionContext(): ActionContext {
  const today = new Date().toLocaleDateString('sv-SE');
  const mon = mondayOf(today);
  const week = [0, 1, 2, 3, 4].map((i) => addDays(mon, i));
  const next = week.map((d) => addDays(d, 7));
  return {
    today,
    salaries: [
      { id: 'demo-karim', prenom: 'Karim', nom: 'Benali', role: 'worker' },
      { id: 'demo-sofia', prenom: 'Sofia', nom: 'Rossi', role: 'lead' },
      { id: 'demo-lucas', prenom: 'Lucas', nom: 'Petit', role: 'worker' },
      { id: 'demo-ines', prenom: 'Inès', nom: 'Martin', role: 'worker' },
    ],
    chantiers: [
      { id: 'demo-dupont', nom: 'Villa Dupont', ville: 'Lyon' },
      { id: 'demo-martin', nom: 'Bureau Martin', ville: 'Villeurbanne' },
      { id: 'demo-leclerc', nom: 'Résidence Leclerc', ville: 'Bron' },
      { id: 'demo-dupont-viriat', nom: 'Dupont', ville: 'Viriat' },
    ],
    planning: [
      ...week.map((d) => ({ user_id: 'demo-karim', date: d, worksite_id: 'demo-dupont', absence: null })),
      ...week.map((d) => ({ user_id: 'demo-sofia', date: d, worksite_id: 'demo-martin', absence: null })),
      ...week.slice(0, 3).map((d) => ({ user_id: 'demo-ines', date: d, worksite_id: 'demo-leclerc', absence: null })),
      ...next.slice(0, 2).map((d) => ({ user_id: 'demo-sofia', date: d, worksite_id: null, absence: 'conge' })),
    ],
    congesEnAttente: [{ user_id: 'demo-ines', du: next[4], au: next[4] }],
    // Lucas n'est pas au planning, mais il a pointé sur Bureau Martin.
    pointages: [{ user_id: 'demo-lucas', date: addDays(today, -1), worksite_id: 'demo-martin' }],
  };
}

function withSummary(r: LocalReply, ctx: ActionContext): AssistantReply {
  return {
    answer: r.answer, links: r.links,
    extra: r.action ? ({
      action: { ...r.action, summary: summarize(r.action.draft, ctx) },
      options: {
        salaries: ctx.salaries.map((s) => ({ id: s.id, nom: `${s.prenom} ${s.nom}` })),
        chantiers: ctx.chantiers,
      },
    } as ActionExtra) : undefined,
  };
}

/** Réponses fictives pour vérifier l'écran sans base (préviews). */
export function demoAssistantSource(): AssistantSource {
  let left = 50;
  const ctx = demoActionContext();
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  return {
    demo: true,
    async ask(q, file) {
      await wait(600);
      left = Math.max(0, left - 1);
      const t = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const done = (r: AssistantReply) => ({ ...r, remaining: left });
      // 📎 Fichier joint : l'IA est SIMULÉE (lecture fictive), le contrôle est le vrai.
      if (file) {
        if (/paie|bulletin|salari|embauch/.test(t + file.name.toLowerCase())) {
          return done(withSummary(fromFunctionCall('inviter_salarie', {
            prenom: 'Marc', nom: 'Durand', date_entree: '2026-09-01', contrat: 'CDI', taux_horaire: 14.5, heures_hebdo: 35,
            bulletin_mois: '2026-09', bulletin_brut: 2450, bulletin_cout_employeur: 3480, bulletin_heures_payees: 151.67,
          }, ctx), ctx));
        }
        if (/devis|client|valide/.test(t + file.name.toLowerCase())) {
          return done(withSummary(fromFunctionCall('creer_chantier', {
            nom_client: 'Maison Garnier', ville: 'Caluire', adresse: '12 rue des Lilas', telephone: '06 12 34 56 78', budget_montant: 18400, budget_heures: 160,
          }, ctx), ctx));
        }
        return done(withSummary(fromFunctionCall('ranger_document', { chantier: /viriat/.test(t) ? 'Dupont Viriat' : 'Dupont' }, ctx), ctx));
      }
      const local = handleActionLocally(q, ctx);
      if (local) return done(withSummary(local, ctx));
      // Phrases détaillées : l'IA est SIMULÉE (même contrôle que la vraie).
      if (/\b(mets|met|affecte|place)\b/.test(t)) {
        return done(withSummary(fromFunctionCall('affecter_planning', { salarie: 'Lucas', chantier: 'Villa Dupont', dates: [addDays(ctx.today, 1)] }, ctx), ctx));
      }
      if (/corrig/.test(t)) {
        return done(withSummary(fromFunctionCall('corriger_pointage', { salarie: 'Karim', date: addDays(ctx.today, -1), debut: '7:30', fin: '16:00' }, ctx,
          [{ id: 'demo-e1', chantier: 'Villa Dupont', debut: '07:30', fin: '17:00' }]), ctx));
      }
      if (/\b(client|chantier)\b/.test(t) && /\b(cree|nouveau|ajoute)/.test(t)) {
        return done(withSummary(fromFunctionCall('creer_chantier', { nom_client: 'Maison Garnier', ville: 'Caluire' }, ctx), ctx));
      }
      if (/point|declar|oubli/.test(t)) {
        return done({ answer: 'Hier, 1 salarié prévu n’a rien déclaré : Karim B. (prévu sur Villa Dupont). Les 3 autres ont pointé.', links: [{ label: 'Fiche de Karim', action: 'salarie:demo-karim' }] });
      }
      if (/budget|depass|rentab/.test(t)) {
        return done({ answer: '1 chantier dépasse son budget : Villa Dupont, 110 % (110 h pour 100 h prévues).', links: [{ label: NAV_ACTIONS.couts, action: 'couts' }] });
      }
      const g = findGuide(t);
      if (g) return done({ answer: guideAnswer(g), links: g.lien ? [{ label: NAV_ACTIONS[g.lien], action: g.lien }] : [] });
      return done({ answer: 'Mode démo : essayez une suggestion, « Mets Lucas sur Villa Dupont demain » ou « Comment je clôture le mois ? ».', links: [] });
    },
  };
}
