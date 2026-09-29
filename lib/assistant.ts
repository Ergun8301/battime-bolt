// Assistant BEMEXO (lot 3) — côté navigateur.
//
// Deux sources derrière la même interface : la vraie fonction `assistant`, et
// une démo en mémoire (préviews uniquement, `?demo=assistant`), sans requête.
import { supabase } from '@/lib/supabase';
import { isPreviewHost } from '@/lib/hosting';
import type { AssistantLink } from '@/supabase/functions/_shared/assistant-core';

export { ASSISTANT_SUGGESTIONS } from '@/supabase/functions/_shared/assistant-core';
export type { AssistantLink } from '@/supabase/functions/_shared/assistant-core';

export interface AssistantReply { answer: string; links: AssistantLink[]; remaining?: number; notice?: boolean; extra?: unknown }
export interface AssistantSource { demo: boolean; ask(question: string): Promise<AssistantReply> }

/** Démo : uniquement sur une preview, jamais sur bemexo.com. */
export function isAssistantDemo(): boolean {
  if (typeof window === 'undefined' || !isPreviewHost()) return false;
  return new URLSearchParams(window.location.search).get('demo') === 'assistant';
}

export const supabaseAssistantSource: AssistantSource = {
  demo: false,
  async ask(question) {
    try {
      const { data, error } = await supabase.functions.invoke('assistant', { body: { question } });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const body = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => ({})) : {};
        return { answer: (body as { error?: string }).error || 'Connexion impossible. Réessayez.', links: [], notice: true };
      }
      const d = data as { answer?: string; links?: AssistantLink[]; remaining?: number; quota?: boolean; unavailable?: boolean };
      return { answer: d.answer || '…', links: d.links || [], remaining: d.remaining, notice: !!(d.quota || d.unavailable) };
    } catch {
      return { answer: 'Connexion impossible. Réessayez.', links: [], notice: true };
    }
  },
};

/** Réponses fictives pour vérifier l'écran sans base (préviews). */
export function demoAssistantSource(): AssistantSource {
  let left = 50;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  return {
    demo: true,
    async ask(q) {
      await wait(700);
      left = Math.max(0, left - 1);
      const t = q.toLowerCase();
      if (/point|déclar|oubli/.test(t)) {
        return { answer: 'Hier, 1 salarié prévu n’a rien déclaré : Karim B. (prévu sur Villa Dupont). Les 4 autres ont pointé.', links: [{ label: 'Fiche de Karim', action: 'salarie:demo-karim' }], remaining: left };
      }
      if (/budget|dépass|rentab/.test(t)) {
        return { answer: '1 chantier dépasse son budget : Villa Dupont, 110 % (110 h pour 100 h prévues). Bureau Martin est à 45 %.', links: [{ label: 'Voir les coûts', action: 'couts' }], remaining: left };
      }
      if (/moment|en cours|maintenant|où/.test(t)) {
        return { answer: '2 personnes pointent en ce moment : Karim B. sur Villa Dupont (depuis 08:02) et Sofia R. sur Bureau Martin (depuis 08:15).', links: [], remaining: left };
      }
      if (/cong|absen|vacance/.test(t)) {
        return { answer: '1 demande en attente : Sofia R., congé du 12 au 16 octobre.', links: [{ label: 'Répondre', action: 'conges' }], remaining: left };
      }
      if (/heure|mois/.test(t)) {
        return { answer: 'Ce mois-ci : Karim B. 142 h, Sofia R. 128 h, Lucas P. 96 h.', links: [], remaining: left };
      }
      return { answer: 'Mode démo : essayez une des questions proposées.', links: [], remaining: left };
    },
  };
}
