// Assistant BEMEXO côté SALARIÉ (lot 4) — navigateur.
//
// La source « vraie » appelle la fonction `worker-assistant` (brouillon ou
// réponse, jamais d'écriture). La source démo (préviews uniquement) exécute le
// MÊME lecteur de phrases que le serveur, sur des chantiers fictifs.
import { supabase } from '@/lib/supabase';
import { isPreviewHost } from '@/lib/hosting';
import { generateLocalId } from '@/lib/offline-store';
import { insertWorkerEntry } from '@/lib/worker-entry';
import type { AssistantReply, AssistantSource } from '@/lib/assistant';
import {
  handleLocally, shiftMinutes, type Draft, type DraftLine, type WorkerSnapshot,
} from '@/supabase/functions/_shared/worker-assistant-core';

export * from '@/supabase/functions/_shared/worker-assistant-core';

export interface DraftExtra { draft: Draft; chantiers: WorkerSnapshot['chantiers'] }

export function isWorkerAssistantDemo(): boolean {
  if (typeof window === 'undefined' || !isPreviewHost()) return false;
  return new URLSearchParams(window.location.search).get('demo') === 'salarie';
}

type ServerReply = { kind?: string; answer?: string; draft?: Draft; chantiers?: WorkerSnapshot['chantiers']; remaining?: number; notice?: boolean; error?: string };
const toReply = (d: ServerReply): AssistantReply => ({
  answer: d.answer || d.error || '…', links: [], remaining: d.remaining, notice: !!d.notice || !!d.error,
  extra: d.kind === 'draft' && d.draft ? ({ draft: d.draft, chantiers: d.chantiers || [] } as DraftExtra) : undefined,
});

export const supabaseWorkerSource: AssistantSource = {
  demo: false,
  async ask(text) {
    try {
      const { data, error } = await supabase.functions.invoke('worker-assistant', { body: { text } });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const body = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => ({})) : {};
        return toReply({ error: (body as { error?: string }).error || 'Connexion impossible. Réessayez.' });
      }
      return toReply(data as ServerReply);
    } catch {
      return toReply({ error: 'Connexion impossible. Réessayez.' });
    }
  },
};

export const DEMO_SNAPSHOT: WorkerSnapshot = {
  aujourdhui: new Date().toLocaleDateString('sv-SE'),
  chantiers: [
    { id: 'demo-dupont', nom: 'Villa Dupont', ville: 'Lyon' },
    { id: 'demo-martin', nom: 'Bureau Martin', ville: 'Villeurbanne' },
    { id: 'demo-leclerc', nom: 'Résidence Leclerc', ville: 'Bron' },
    { id: 'demo-leclerc2', nom: 'Leclerc Drive', ville: 'Bron' },
  ],
  semaine: [{ date: new Date().toLocaleDateString('sv-SE'), minutes: 8 * 60 + 30 }],
  planning: [],
};

export function demoWorkerSource(): AssistantSource {
  let left = 20;
  return {
    demo: true,
    async ask(text) {
      await new Promise((r) => setTimeout(r, 500));
      left = Math.max(0, left - 1);
      const local = handleLocally(text, DEMO_SNAPSHOT);
      if (!local) return { answer: 'Mode démo : essayez « Ce matin 7h30-12h Villa Dupont, après-midi 13h-16h30 Bureau Martin ».', links: [], remaining: left };
      return toReply({ ...local, chantiers: DEMO_SNAPSHOT.chantiers, remaining: left } as ServerReply);
    },
  };
}

export type SaveLines = (date: string, lines: DraftLine[]) => Promise<{ ok: number; queued: number }>;

/**
 * Enregistre les lignes CONFIRMÉES, une par une, par le chemin de la saisie
 * manuelle (lib/worker-entry.ts). Le planning du jour est rattaché comme à la
 * main : le premier prévu sur ce chantier.
 */
export function makeWorkerSaver(user: { id: string; company_id: string }, chantiers: WorkerSnapshot['chantiers']): SaveLines {
  return async (date, lines) => {
    const { data: plans } = await supabase.from('planning').select('id, worksite_id').eq('user_id', user.id).eq('work_date', date);
    let ok = 0, queued = 0;
    for (const l of lines) {
      const ws = chantiers.find((c) => c.id === l.worksite_id);
      const r = await insertWorkerEntry({
        localId: generateLocalId(), company_id: user.company_id, user_id: user.id, worksite_id: l.worksite_id!,
        planning_id: ((plans || []) as { id: string; worksite_id: string | null }[]).find((p) => p.worksite_id === l.worksite_id)?.id ?? null,
        work_date: date, start_time: l.start, end_time: l.end, break_minutes: l.break_minutes,
        total_minutes: shiftMinutes(l.start, l.end, l.break_minutes), meal_allowance: false,
        observation: null, reception: null, _worksite_name: ws?.nom || '', _worksite_city: ws?.ville ?? null, _saved_at: Date.now(),
      });
      if (r === 'online') ok++; else queued++;
    }
    return { ok, queued };
  };
}

export const demoSaver: SaveLines = async (_d, lines) => { await new Promise((r) => setTimeout(r, 400)); return { ok: lines.length, queued: 0 }; };
