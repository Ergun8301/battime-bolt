// Assistant BEMEXO côté SALARIÉ (lot 4) — navigateur.
//
// La source « vraie » appelle la fonction `worker-assistant` (brouillon ou
// réponse, jamais d'écriture). La source démo (préviews uniquement) exécute le
// MÊME lecteur de phrases que le serveur, sur des chantiers fictifs.
import { supabase, withOrigin } from '@/lib/supabase';
import { bestPlanningFor, type PlannedLike } from '@/supabase/functions/_shared/day-hours';
import { isPreviewHost } from '@/lib/hosting';
import { attachmentPayload } from '@/lib/attachment';
import { generateLocalId } from '@/lib/offline-store';
import { insertWorkerEntry } from '@/lib/worker-entry';
import type { AssistantReply, AssistantSource } from '@/lib/assistant';
import { iaFormule } from '@/lib/ia-formule';
import {
  formatColleagues, fromWorkerCall, handleWorkerLocally, shiftMinutes, type ColleagueRow, type Draft, type DraftLine, type WorkerAction, type WorkerLive, type WorkerSnapshot,
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
  /** Lot 6 : formule IA active (bandeau « Mode essai »). */
  formule?: string | null;
};
const toReply = (d: ServerReply): AssistantReply => ({
  answer: d.answer || d.error || '…', links: d.links || [], remaining: d.remaining, notice: !!d.notice || !!d.error,
  extra: d.kind === 'draft' && d.draft ? ({ draft: d.draft, chantiers: d.chantiers || [] } as DraftExtra)
    : d.kind === 'action' && d.action ? ({ workerAction: d.action, chantiers: d.chantiers || [] } as WorkerActionExtra)
    : undefined,
  followUp: !!d.question || (d.kind === 'draft' && !!d.draft && d.draft.lines.some((l) => !l.worksite_id)),
  ...(d.formule !== undefined ? { formule: d.formule } : {}),
});

export const supabaseWorkerSource: AssistantSource = {
  demo: false,
  status: () => iaFormule('worker-assistant'),
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
      if (local?.kind === 'collegues') {
        const rows: ColleagueRow[] = [
          { prenom: 'Sofia', date: local.date, chantier: 'Bureau Martin', ville: 'Villeurbanne', debut: '08:00', fin: '12:00', absent: false },
          { prenom: 'Lucas', date: local.date, chantier: 'Résidence Leclerc', ville: 'Bron', debut: '07:30', fin: '16:30', absent: false },
          { prenom: 'Inès', date: local.date, chantier: null, ville: null, debut: null, fin: null, absent: true },
        ];
        return { answer: formatColleagues(rows, local.qui, local.date, DEMO_SNAPSHOT.aujourdhui), links: [], remaining: left };
      }
      if (!local) return { answer: 'Mode démo : essayez « Ce matin 7h30-12h Villa Dupont, après-midi 13h-16h30 Bureau Martin ».', links: [], remaining: left };
      return toReply({ ...local, chantiers: DEMO_SNAPSHOT.chantiers, remaining: left } as ServerReply);
    },
  };
}

export type SaveLines = (date: string, lines: DraftLine[]) => Promise<{ ok: number; queued: number; undo?: () => Promise<{ ok: boolean; message: string; partial?: boolean }> }>;

/**
 * Enregistre les lignes CONFIRMÉES, une par une, par le chemin de la saisie
 * manuelle (lib/worker-entry.ts). Le planning du jour est rattaché comme à la
 * main : celui de ce chantier que la ligne recouvre le plus.
 */
export function makeWorkerSaver(user: { id: string; company_id: string }, chantiers: WorkerSnapshot['chantiers']): SaveLines {
  // Lot 3 : les lignes écrites (et leur « Annuler ») sont tracées « assistant ».
  return (date, lines) => withOrigin('assistant', async () => {
    const { data: plans } = await supabase.from('planning').select('id, worksite_id, absence_type, estimated_start, estimated_end').eq('user_id', user.id).eq('work_date', date);
    let ok = 0, queued = 0;
    // Lot 1 : chaque ligne enregistrée, avec ses heures telles qu'elles sont parties.
    const created: { localId: string; start: string; end: string }[] = [];
    for (const l of lines) {
      const ws = chantiers.find((c) => c.id === l.worksite_id);
      const localId = generateLocalId();
      const r = await insertWorkerEntry({
        localId, company_id: user.company_id, user_id: user.id, worksite_id: l.worksite_id!,
        // Lot 1 : le planning de ce chantier que la ligne recouvre le plus (plus « le premier »).
        planning_id: bestPlanningFor({ start: l.start, end: l.end, worksite_id: l.worksite_id ?? null }, (plans || []) as PlannedLike[]),
        work_date: date, start_time: l.start, end_time: l.end, break_minutes: l.break_minutes,
        total_minutes: shiftMinutes(l.start, l.end, l.break_minutes), meal_allowance: false,
        observation: l.observation || null, reception: null, _worksite_name: ws?.nom || '', _worksite_city: ws?.ville ?? null, _saved_at: Date.now(),
      });
      if (r === 'online') { ok++; created.push({ localId, start: l.start.slice(0, 5), end: l.end.slice(0, 5) }); } else queued++;
    }
    // Lot 7 : « Annuler » retire ces lignes (brouillons, comme « Retirer » à l'écran).
    // Lot 1 : seulement celles restées telles quelles — une ligne retouchée depuis
    // dans « Ma journée » (autres heures), envoyée ou renvoyée par le bureau est
    // GARDÉE, et c'est dit. Comme pour « copier ma journée ».
    const undo = queued ? undefined : () => withOrigin('assistant', async () => {
      const { data: now, error: rErr } = await supabase.from('time_entries').select('id, client_id, start_time, end_time, status, submitted_at')
        .eq('user_id', user.id).in('client_id', created.map((c) => c.localId));
      if (rErr) return { ok: false, message: 'Annulation impossible pour le moment : réessayez.' };
      const rows = (now ?? []) as { id: string; client_id: string; start_time: string; end_time: string; status: string; submitted_at: string | null }[];
      let gone = 0;
      for (const r of rows) {
        const c = created.find((x) => x.localId === r.client_id);
        if (!c || r.status !== 'draft' || r.submitted_at || r.start_time.slice(0, 5) !== c.start || r.end_time.slice(0, 5) !== c.end) continue;
        const { data: del, error } = await supabase.from('time_entries').delete().eq('id', r.id).eq('user_id', user.id)
          .eq('status', 'draft').is('submitted_at', null).eq('start_time', r.start_time).eq('end_time', r.end_time).select('id');
        if (!error) gone += del?.length ?? 0;
      }
      const kept = rows.length - gone;
      const why = `${kept} ligne${kept > 1 ? 's' : ''} gardée${kept > 1 ? 's' : ''} (modifiée${kept > 1 ? 's' : ''} ou envoyée${kept > 1 ? 's' : ''} depuis)`;
      if (!gone) return { ok: false, message: rows.length ? `Rien n’a été retiré : ${why}. Corrigez-les dans « Ma journée ».` : 'Rien à retirer : ces lignes ne sont plus là.' };
      await supabase.rpc('assistant_journal_log', { p_action: 'declarer_heures', p_summary: `Heures du ${date} (${gone} ligne(s) retirée(s)${kept ? `, ${kept} gardée(s)` : ''})`, p_undone: true });
      return kept ? { ok: true, message: `Annulé en partie : ${gone} ligne${gone > 1 ? 's' : ''} retirée${gone > 1 ? 's' : ''}, ${why}.`, partial: true } : { ok: true, message: 'Annulé : les lignes sont retirées.' };
    });
    if (ok) await supabase.rpc('assistant_journal_log', { p_action: 'declarer_heures', p_summary: `Heures du ${date} (${ok} ligne(s))`, p_undone: false });
    return { ok, queued, undo };
  });
}

export const demoSaver: SaveLines = async (_d, lines) => {
  await new Promise((r) => setTimeout(r, 400));
  return { ok: lines.length, queued: 0, undo: async () => ({ ok: true, message: 'Annulé (démo).' }) };
};
