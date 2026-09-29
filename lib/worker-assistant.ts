// Assistant BEMEXO côté SALARIÉ (lot 4) — navigateur.
//
// La source « vraie » appelle la fonction `worker-assistant` (brouillon ou
// réponse, jamais d'écriture). La source démo (préviews uniquement) exécute le
// MÊME lecteur de phrases que le serveur, sur des chantiers fictifs.
import { supabase } from '@/lib/supabase';
import { isPreviewHost } from '@/lib/hosting';
import { attachmentPayload } from '@/lib/attachment';
import { generateLocalId } from '@/lib/offline-store';
import { insertWorkerEntry } from '@/lib/worker-entry';
import type { AssistantReply, AssistantSource } from '@/lib/assistant';
import {
  fromWorkerCall, handleWorkerLocally, shiftMinutes, type Draft, type DraftLine, type WorkerAction, type WorkerLive, type WorkerSnapshot,
} from '@/supabase/functions/_shared/worker-assistant-core';

export * from '@/supabase/functions/_shared/worker-assistant-core';

export interface DraftExtra { draft: Draft; chantiers: WorkerSnapshot['chantiers'] }

export function isWorkerAssistantDemo(): boolean {
  if (typeof window === 'undefined' || !isPreviewHost()) return false;
  return new URLSearchParams(window.location.search).get('demo') === 'salarie';
}

/** Lot 3 bis / lot 7 : une action (faite tout de suite si elle est simple et complète). */
export interface WorkerActionExtra { workerAction: WorkerAction; chantiers: WorkerSnapshot['chantiers']; attachment?: File }

type ServerReply = {
  kind?: string; answer?: string; draft?: Draft; action?: WorkerAction; links?: { label: string; action: string }[];
  chantiers?: WorkerSnapshot['chantiers']; remaining?: number; notice?: boolean; error?: string;
  /** Lot 7 : UNE question s'il manque une info. */
  question?: { text: string };
};
const toReply = (d: ServerReply): AssistantReply => ({
  answer: d.answer || d.error || '…', links: d.links || [], remaining: d.remaining, notice: !!d.notice || !!d.error,
  extra: d.kind === 'draft' && d.draft ? ({ draft: d.draft, chantiers: d.chantiers || [] } as DraftExtra)
    : d.kind === 'action' && d.action ? ({ workerAction: d.action, chantiers: d.chantiers || [] } as WorkerActionExtra)
    : undefined,
  followUp: !!d.question || (d.kind === 'draft' && !!d.draft && d.draft.lines.some((l) => !l.worksite_id)),
});

export const supabaseWorkerSource: AssistantSource = {
  demo: false,
  async ask(text, file) {
    try {
      const body = file ? { text, file: await attachmentPayload(file) } : { text };
      const { data, error } = await supabase.functions.invoke('worker-assistant', { body });
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
    { id: 'demo-dupont-viriat', nom: 'Dupont', ville: 'Viriat' },
  ],
  semaine: [{ date: new Date().toLocaleDateString('sv-SE'), minutes: 8 * 60 + 30 }],
  planning: [
    { date: new Date().toLocaleDateString('sv-SE'), chantier_id: 'demo-dupont', chantier: 'Villa Dupont', debut: '07:30', fin: '12:00', absence: null },
    { date: new Date().toLocaleDateString('sv-SE'), chantier_id: 'demo-martin', chantier: 'Bureau Martin', debut: '13:00', fin: '16:30', absence: null },
  ],
};

/** Démo : rien en cours, deux lignes notées aujourd'hui. */
export const DEMO_LIVE: WorkerLive = {
  enCours: null,
  lignes: [
    { id: 'demo-e1', chantier: 'Dupont', chantier_id: 'demo-dupont-viriat', debut: '07:30', fin: '12:00', envoyee: false },
    { id: 'demo-e2', chantier: 'Bureau Martin', chantier_id: 'demo-martin', debut: '13:00', fin: '16:30', envoyee: false },
  ],
};

export function demoWorkerSource(): AssistantSource {
  let left = 20;
  return {
    demo: true,
    async ask(text, file) {
      await new Promise((r) => setTimeout(r, 500));
      left = Math.max(0, left - 1);
      // 📎 Photo jointe : l'IA est SIMULÉE, le contrôle est le vrai.
      if (file) {
        const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const reply = fromWorkerCall('ranger_photo', {
          chantier: /viriat/.test(t) ? 'Dupont à Viriat' : /dupont/.test(t) ? 'Dupont' : '',
          reserve: /reserve/.test(t), detail: /reserve/.test(t) ? 'Joint silicone à reprendre (d’après la photo)' : '',
        }, DEMO_SNAPSHOT, DEMO_LIVE);
        return toReply({ ...reply, chantiers: DEMO_SNAPSHOT.chantiers, remaining: left } as ServerReply);
      }
      const local = handleWorkerLocally(text, DEMO_SNAPSHOT, DEMO_LIVE);
      if (!local) return { answer: 'Mode démo : essayez « Ce matin 7h30-12h Villa Dupont, après-midi 13h-16h30 Bureau Martin ».', links: [], remaining: left };
      return toReply({ ...local, chantiers: DEMO_SNAPSHOT.chantiers, remaining: left } as ServerReply);
    },
  };
}

export type SaveLines = (date: string, lines: DraftLine[]) => Promise<{ ok: number; queued: number; undo?: () => Promise<{ ok: boolean; message: string }> }>;

/**
 * Enregistre les lignes CONFIRMÉES, une par une, par le chemin de la saisie
 * manuelle (lib/worker-entry.ts). Le planning du jour est rattaché comme à la
 * main : le premier prévu sur ce chantier.
 */
export function makeWorkerSaver(user: { id: string; company_id: string }, chantiers: WorkerSnapshot['chantiers']): SaveLines {
  return async (date, lines) => {
    const { data: plans } = await supabase.from('planning').select('id, worksite_id').eq('user_id', user.id).eq('work_date', date);
    let ok = 0, queued = 0;
    const created: string[] = [];
    for (const l of lines) {
      const ws = chantiers.find((c) => c.id === l.worksite_id);
      const localId = generateLocalId();
      const r = await insertWorkerEntry({
        localId, company_id: user.company_id, user_id: user.id, worksite_id: l.worksite_id!,
        planning_id: ((plans || []) as { id: string; worksite_id: string | null }[]).find((p) => p.worksite_id === l.worksite_id)?.id ?? null,
        work_date: date, start_time: l.start, end_time: l.end, break_minutes: l.break_minutes,
        total_minutes: shiftMinutes(l.start, l.end, l.break_minutes), meal_allowance: false,
        observation: l.observation || null, reception: null, _worksite_name: ws?.nom || '', _worksite_city: ws?.ville ?? null, _saved_at: Date.now(),
      });
      if (r === 'online') { ok++; created.push(localId); } else queued++;
    }
    // Lot 7 : « Annuler » retire ces lignes (brouillons, comme « Retirer » à l'écran).
    const undo = queued ? undefined : async () => {
      const { error } = await supabase.from('time_entries').delete().eq('user_id', user.id).eq('status', 'draft').in('client_id', created);
      if (error) return { ok: false, message: 'Annulation impossible : la journée a déjà été envoyée ou verrouillée.' };
      await supabase.rpc('assistant_journal_log', { p_action: 'declarer_heures', p_summary: `Heures du ${date} (${created.length} ligne(s))`, p_undone: true });
      return { ok: true, message: 'Annulé : les lignes sont retirées.' };
    };
    if (ok) await supabase.rpc('assistant_journal_log', { p_action: 'declarer_heures', p_summary: `Heures du ${date} (${ok} ligne(s))`, p_undone: false });
    return { ok, queued, undo };
  };
}

export const demoSaver: SaveLines = async (_d, lines) => {
  await new Promise((r) => setTimeout(r, 400));
  return { ok: lines.length, queued: 0, undo: async () => ({ ok: true, message: 'Annulé (démo).' }) };
};
