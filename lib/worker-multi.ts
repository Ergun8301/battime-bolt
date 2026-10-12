// Fiche « Tout confirmer » de l'Assistant BEMEXO salarié : les VRAIS accès (base, téléphone) donnés à
// runMulti (supabase/functions/_shared/worker-multi-run.ts), qui lui reste pur et testé avec de faux.
//
// Chaque écriture passe par le code des écrans du salarié, avec SA session, sous withOrigin('assistant')
// (chacune séparément : l'origine est une variable de module, une requête de l'application qui se
// croiserait avec une écriture longue serait sinon marquée « assistant » à tort).
import { supabase, withOrigin } from '@/lib/supabase';
import { createWorksiteSalarie, findWorksite } from '@/lib/worker-worksite';
import { demoSaver, makeWorkerSaver } from '@/lib/worker-assistant';
import { demoWorkerExecutor, type WorkerActionExecutor } from '@/lib/worker-actions';
import type { MultiDeps } from '@/supabase/functions/_shared/worker-multi-run';

export type { MultiExtra } from '@/lib/worker-assistant';

const todayParis = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

export function makeMultiDeps(user: { id: string; company_id: string }, execute: WorkerActionExecutor): MultiDeps {
  return {
    online: () => navigator.onLine,
    today: todayParis,
    findWorksite: (nw) => findWorksite(user.company_id, nw),
    createWorksite: (nw) => withOrigin('assistant', () => createWorksiteSalarie(user.company_id, nw)),
    makeSaver: (chantiers) => makeWorkerSaver(user, chantiers, { undoPartiel: true }),
    // Les identifiants réels des lignes écrites (la réserve se pose sur une ligne qui existe).
    resolveEntryIds: async (localIds) => {
      if (!localIds.length) return {};
      const { data, error } = await supabase.from('time_entries').select('id, client_id').eq('user_id', user.id).in('client_id', localIds);
      if (error) throw error;
      const out: Record<string, string> = {};
      for (const r of (data ?? []) as { id: string; client_id: string | null }[]) if (r.client_id) out[r.client_id] = r.id;
      return out;
    },
    execute,
    // Une trace, jamais une étape : `assistant_journal_log` refuse (42501) quand l'assistant n'est pas activé.
    journal: async (action, summary) => {
      try { await supabase.rpc('assistant_journal_log', { p_action: action, p_summary: summary, p_undone: false }); } catch { /* sans effet */ }
    },
  };
}

/** Démo (préviews) : aucune requête, aucun chantier créé ailleurs qu'en mémoire. */
export function demoMultiDeps(): MultiDeps {
  return {
    online: () => true,
    today: todayParis,
    findWorksite: async () => null,
    createWorksite: async (nw) => { await new Promise((r) => setTimeout(r, 300)); return { id: 'demo-nouveau-chantier', nom: nw.nom, ville: nw.ville }; },
    makeSaver: () => demoSaver,
    resolveEntryIds: async (localIds) => Object.fromEntries(localIds.map((id) => [id, `demo-entry-${id}`])),
    execute: demoWorkerExecutor,
    journal: async () => {},
  };
}
