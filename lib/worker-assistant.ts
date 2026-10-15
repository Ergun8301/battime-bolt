// Assistant BEMEXO côté SALARIÉ (lot 4) — navigateur.
//
// La source « vraie » appelle la fonction `worker-assistant` (brouillon ou
// réponse, jamais d'écriture). La source démo (préviews uniquement) exécute le
// MÊME lecteur de phrases que le serveur, sur des chantiers fictifs.
import { supabase, withOrigin } from '@/lib/supabase';
import { bestPlanningFor, type PlannedLike } from '@/supabase/functions/_shared/day-hours';
import { isPreviewHost } from '@/lib/hosting';
import { attachmentPayload } from '@/lib/attachment';
import { generateLocalId, getPendingEntries, removePendingEntry } from '@/lib/offline-store';
import { insertWorkerEntry } from '@/lib/worker-entry';
import { ASK_TIMEOUT_MESSAGE, invokeAssistant, type AssistantReply, type AssistantSource } from '@/lib/assistant';
import {
  formatColleagues, fromWorkerCall, handleWorkerLocally, norm, shiftMinutes, type ColleagueRow, type Draft, type DraftLine, type WorkerAction, type WorkerLive, type WorkerSnapshot,
} from '@/supabase/functions/_shared/worker-assistant-core';
import { profilSaisie } from '@/supabase/functions/_shared/saisie-profil';
import { buildLongReply, type MultiIgnore, type MultiItem, type WorkerMultiReply } from '@/supabase/functions/_shared/worker-multi';
import type { SaveOutcome } from '@/supabase/functions/_shared/worker-multi-run';

export * from '@/supabase/functions/_shared/worker-assistant-core';

export interface DraftExtra { draft: Draft; chantiers: WorkerSnapshot['chantiers'] }

/** Une fiche récapitulative à plusieurs actions (profil « long » du serveur) : rendue par components/worker-multi-card.tsx. */
export interface MultiExtra {
  multi: {
    items: MultiItem[]; ignores: MultiIgnore[]; non_prepare: string[]; incertain: boolean; deja_notees: WorkerMultiReply['deja_notees'];
    note?: string; date: string; aujourdhui: string; chantiers: WorkerSnapshot['chantiers'];
  };
}

export function isWorkerAssistantDemo(): boolean {
  if (typeof window === 'undefined' || !isPreviewHost()) return false;
  return new URLSearchParams(window.location.search).get('demo') === 'salarie';
}

/** Lot 3 bis / lot 7 : une action (faite tout de suite si elle est simple et complète). */
export interface WorkerActionExtra {
  workerAction: WorkerAction; chantiers: WorkerSnapshot['chantiers']; attachment?: File;
  /** Profil long : un geste « direct » (modifier une ligne, copier une journée, terminer le pointage) attend quand même « Confirmer ». */
  confirmer?: true;
}

type ServerReply = {
  kind?: string; answer?: string; draft?: Draft; action?: WorkerAction; links?: { label: string; action: string }[];
  chantiers?: WorkerSnapshot['chantiers']; remaining?: number; notice?: boolean; error?: string;
  /** Lot 7 : UNE question s'il manque une info. */
  question?: { text: string };
  /** Interne (support BEMEXO) : la fonction la renvoie toujours, l'écran ne l'affiche jamais. */
  formule?: string | null;
  /** Profil long : une fiche à plusieurs éléments (kind 'multi'). */
  items?: MultiItem[]; ignores?: MultiIgnore[]; non_prepare?: string[]; incertain?: boolean; deja_notees?: WorkerMultiReply['deja_notees'];
  note?: string; date?: string; aujourdhui?: string; confirmer?: boolean;
  /** Étape 3 : ouvrir l'écran du premier lien sans attendre le toucher (décidé par le serveur). */
  auto?: boolean;
};
const toReply = (d: ServerReply): AssistantReply => {
  const multi = d.kind === 'multi' && Array.isArray(d.items) && d.items.length > 0;
  return {
    answer: d.answer || d.error || '…', links: d.links || [], remaining: d.remaining, notice: !!d.notice || !!d.error,
    extra: multi ? ({ multi: { items: d.items!, ignores: d.ignores || [], non_prepare: d.non_prepare || [], incertain: !!d.incertain, deja_notees: d.deja_notees || [], note: d.note, date: d.date || '', aujourdhui: d.aujourdhui || '', chantiers: d.chantiers || [] } } as MultiExtra)
      : d.kind === 'draft' && d.draft ? ({ draft: d.draft, chantiers: d.chantiers || [] } as DraftExtra)
      : d.kind === 'action' && d.action ? ({ workerAction: d.action, chantiers: d.chantiers || [], ...(d.confirmer ? { confirmer: true as const } : {}) } as WorkerActionExtra)
      : undefined,
    followUp: !multi && (!!d.question || (d.kind === 'draft' && !!d.draft && d.draft.lines.some((l) => !l.worksite_id))),
    ...(d.auto ? { auto: true } : {}),
  };
};

export const supabaseWorkerSource: AssistantSource = {
  demo: false,
  async ask(text, file, history) {
    try {
      // `multi: true` : ce navigateur sait afficher la fiche à plusieurs éléments (sans lui, le serveur répond comme avant).
      // `history` (étape 2, chat avec mémoire) : omis quand la conversation vient de commencer.
      // `caps` (étape 3) : `ouvrir1` = cet écran sait ouvrir un lien `ouvrir:…` ; sans lui le serveur n'en envoie aucun.
      const body = { text, ...(file ? { file: await attachmentPayload(file) } : {}), multi: true, ...(history?.length ? { history } : {}), caps: ['ouvrir1'] };
      // Délai maximal (voir invokeAssistant) : sans lui, un serveur qui ne répond pas bloquerait le panneau jusqu'au rechargement.
      const { data, error, timedOut } = await invokeAssistant('worker-assistant', body);
      if (timedOut) return toReply({ error: ASK_TIMEOUT_MESSAGE });
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

/** Démo : la phrase d'exemple « longue » (Ergun) — les appels de l'IA sont SIMULÉS, la fiche est construite par le VRAI code (redécoupage, pause, rattachement). */
export const DEMO_PHRASE_LONGUE = "Ajoute-moi une intervention. J'ai travaillé aujourd'hui de 8h à midi, puis pause d'1h, puis de 13h à 17h sur un nouveau chantier : prénom Pierrick, nom Dupont, à Montagna 01250, pour la pose d'un store banne.";
/** Démo : une journée vide (sinon les 2 lignes déjà notées chevaucheraient la fiche d'exemple). */
const DEMO_LIVE_VIDE: WorkerLive = { ...DEMO_LIVE, lignes: [] };

export function demoWorkerSource(): AssistantSource {
  let left = 20;
  return {
    demo: true,
    // La démo accepte l'historique et l'ignore : ses réponses viennent de la phrase seule.
    async ask(text, file, _history) {
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
      // Phrase longue : jamais le lecteur local (comme sur le serveur). Seule la phrase d'exemple est simulée.
      if (profilSaisie(text).long) {
        if (!/store banne/.test(norm(text))) return { answer: 'En démo, seule la phrase d’exemple longue est simulée.', links: [], remaining: left };
        const fiche = buildLongReply([{ name: 'declarer_heures', args: {
          date: DEMO_SNAPSHOT.aujourdhui, lignes: [{ chantier: 'nouveau', debut: '08:00', fin: '17:00', pause: 60 }],
          nouveau_chantier: { nom: 'Pierrick Dupont', adresse: '', code_postal: '01250', ville: 'Montagna', description: 'pose d’un store banne' },
        } }], text, DEMO_SNAPSHOT, DEMO_LIVE_VIDE);
        return toReply({ ...fiche, chantiers: DEMO_SNAPSHOT.chantiers, remaining: left } as ServerReply);
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

/** Le résultat d'un enregistrement de lignes (voir SaveOutcome : `created`, `queuedLocalIds` et `queuedOffline` servent à la fiche « Tout confirmer »). */
export type SaveLines = (date: string, lines: DraftLine[]) => Promise<SaveOutcome>;

/**
 * Enregistre les lignes CONFIRMÉES, une par une, par le chemin de la saisie
 * manuelle (lib/worker-entry.ts). Le planning du jour est rattaché comme à la
 * main : celui de ce chantier que la ligne recouvre le plus.
 *
 * `undoPartiel` (fiche « Tout confirmer » seulement ; défaut : comportement d'avant) : « Annuler » est
 * TOUJOURS proposé dès qu'une ligne a été écrite OU gardée sur le téléphone, et il retire aussi du
 * téléphone les lignes de la fiche encore en file (jamais un DELETE serveur de plus que celui, gardé, d'avant).
 */
export function makeWorkerSaver(user: { id: string; company_id: string }, chantiers: WorkerSnapshot['chantiers'], opts?: { undoPartiel?: boolean }): SaveLines {
  // Lot 3 : les lignes écrites (et leur « Annuler ») sont tracées « assistant ».
  return (date, lines) => withOrigin('assistant', async () => {
    // Le planning rattaché est un confort : sa lecture ne fait jamais échouer l'enregistrement.
    let plans: unknown[] = [];
    try {
      const r = await supabase.from('planning').select('id, worksite_id, absence_type, estimated_start, estimated_end').eq('user_id', user.id).eq('work_date', date);
      plans = r.data ?? [];
    } catch { /* hors ligne : pas de rattachement au planning */ }
    let ok = 0, queued = 0, queuedOffline = 0;
    // Lot 1 : chaque ligne enregistrée, avec ses heures telles qu'elles sont parties.
    const created: { key?: string; localId: string; start: string; end: string }[] = [];
    const enFile: { key?: string; localId: string; start: string; end: string }[] = [];
    for (const l of lines) {
      const ws = chantiers.find((c) => c.id === l.worksite_id);
      const localId = generateLocalId();
      const r = await insertWorkerEntry({
        localId, company_id: user.company_id, user_id: user.id, worksite_id: l.worksite_id!,
        // Lot 1 : le planning de ce chantier que la ligne recouvre le plus (plus « le premier »).
        planning_id: bestPlanningFor({ start: l.start, end: l.end, worksite_id: l.worksite_id ?? null }, plans as PlannedLike[]),
        work_date: date, start_time: l.start, end_time: l.end, break_minutes: l.break_minutes,
        total_minutes: shiftMinutes(l.start, l.end, l.break_minutes), meal_allowance: false,
        observation: l.observation || null, reception: null, _worksite_name: ws?.nom || '', _worksite_city: ws?.ville ?? null, _saved_at: Date.now(),
        // Une pause dite entre deux créneaux (fiche « Tout confirmer ») : écrite avec la ligne qui la suit.
        ...(l.gap_before ? { gap_before: l.gap_before } : {}),
      });
      const trace = { key: l.key, localId, start: l.start.slice(0, 5), end: l.end.slice(0, 5) };
      if (r === 'online') { ok++; created.push(trace); } else { queued++; enFile.push(trace); if (r === 'offline') queuedOffline++; }
    }
    // Lot 7 : « Annuler » retire ces lignes (brouillons, comme « Retirer » à l'écran).
    // Lot 1 : seulement celles restées telles quelles — une ligne retouchée depuis
    // dans « Ma journée » (autres heures), envoyée ou renvoyée par le bureau est
    // GARDÉE, et c'est dit. Comme pour « copier ma journée ».
    const partiel = !!opts?.undoPartiel;
    const aDefaire = [...created, ...enFile];
    const undo = (partiel ? aDefaire.length > 0 : !queued) ? () => withOrigin('assistant', async () => {
      // Fiche « Tout confirmer » : les lignes encore en file sur le téléphone sont retirées du stockage local.
      let dropped = 0;
      if (partiel) {
        const encore = new Set(getPendingEntries(user.id).map((e) => e.localId));
        for (const q of enFile) if (encore.has(q.localId)) { removePendingEntry(user.id, q.localId); dropped++; }
      }
      const { data: now, error: rErr } = await supabase.from('time_entries').select('id, client_id, start_time, end_time, status, submitted_at')
        .eq('user_id', user.id).in('client_id', aDefaire.map((c) => c.localId));
      if (rErr) {
        return dropped ? { ok: true, message: `Annulé en partie : ${dropped} ligne${dropped > 1 ? 's' : ''} gardée${dropped > 1 ? 's' : ''} sur le téléphone retirée${dropped > 1 ? 's' : ''}. Les autres : réessayez.`, partial: true }
          : { ok: false, message: 'Annulation impossible pour le moment : réessayez.' };
      }
      const rows = (now ?? []) as { id: string; client_id: string; start_time: string; end_time: string; status: string; submitted_at: string | null }[];
      let gone = 0;
      for (const r of rows) {
        const c = aDefaire.find((x) => x.localId === r.client_id);
        if (!c || r.status !== 'draft' || r.submitted_at || r.start_time.slice(0, 5) !== c.start || r.end_time.slice(0, 5) !== c.end) continue;
        const { data: del, error } = await supabase.from('time_entries').delete().eq('id', r.id).eq('user_id', user.id)
          .eq('status', 'draft').is('submitted_at', null).eq('start_time', r.start_time).eq('end_time', r.end_time).select('id');
        if (!error) gone += del?.length ?? 0;
      }
      const kept = rows.length - gone;
      const why = `${kept} ligne${kept > 1 ? 's' : ''} gardée${kept > 1 ? 's' : ''} (modifiée${kept > 1 ? 's' : ''} ou envoyée${kept > 1 ? 's' : ''} depuis)`;
      const retirees = gone + dropped;
      if (!retirees) return { ok: false, message: rows.length ? `Rien n’a été retiré : ${why}. Corrigez-les dans « Ma journée ».` : 'Rien à retirer : ces lignes ne sont plus là.' };
      await supabase.rpc('assistant_journal_log', { p_action: 'declarer_heures', p_summary: `Heures du ${date} (${retirees} ligne(s) retirée(s)${kept ? `, ${kept} gardée(s)` : ''})`, p_undone: true });
      return kept ? { ok: true, message: `Annulé en partie : ${retirees} ligne${retirees > 1 ? 's' : ''} retirée${retirees > 1 ? 's' : ''}, ${why}.`, partial: true } : { ok: true, message: 'Annulé : les lignes sont retirées.' };
    }) : undefined;
    if (ok) await supabase.rpc('assistant_journal_log', { p_action: 'declarer_heures', p_summary: `Heures du ${date} (${ok} ligne(s))`, p_undone: false });
    return partiel ? { ok, queued, undo, created, queuedLocalIds: enFile.map((q) => q.localId), queuedOffline } : { ok, queued, undo };
  });
}

export const demoSaver: SaveLines = async (_d, lines) => {
  await new Promise((r) => setTimeout(r, 400));
  return { ok: lines.length, queued: 0, undo: async () => ({ ok: true, message: 'Annulé (démo).' }), created: lines.map((l, i) => ({ key: l.key, localId: `demo-${i}`, start: l.start, end: l.end })), queuedLocalIds: [], queuedOffline: 0 };
};
