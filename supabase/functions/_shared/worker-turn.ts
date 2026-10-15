// Salarié — UN tour de l'Assistant, de la phrase à la réponse : le MÊME code pour la
// vraie fonction (worker-assistant) et pour le banc de mesure (assistant-eval), pour
// que la mesure soit fidèle à la production.
//
// DEUX PROFILS (saisie-profil.ts) :
//   · « court »  le chemin d'avant, octet pour octet : le lecteur local d'abord (instantané,
//                gratuit), l'IA seulement s'il ne comprend pas — UN appel de fonction ;
//   · « long »   phrase libre, plusieurs actions, turc : JAMAIS le lecteur local (c'est lui qui
//                déformait les phrases longues), l'IA en réflexion « medium », jusqu'à 4 appels
//                de fonction rassemblés dans UNE fiche (worker-multi.ts). Sans clé ou en cas
//                d'échec : une notice, jamais un repli sur le lecteur local.
// Le palier de quota ne change JAMAIS (une demande = une unité, quel que soit le profil).
//
// Aucun console.* ici : le texte et les arguments du modèle contiennent des noms et adresses de particuliers.
import type { AiFile, Tier, ToolsRequest, ToolsResult } from './ai-provider.ts';
import type { ResultatBoucle } from './ai-boucle.ts';
import { WORKER_TEXT_MAX, profilSaisie } from './saisie-profil.ts';
import { fromWorkerCall, handleWorkerLocally, workerFunctionPrompt, type WorkerFullReply, type WorkerLive, type WorkerSnapshot } from './worker-assistant-core.ts';
import { workerFunctionsFor, type OptionsOutilsSalarie } from './worker-outils.ts';
import { buildLongReply, type LongLegacy, type WorkerMultiReply } from './worker-multi.ts';
import { workerFunctionsForLong, workerMultiPrompt } from './worker-multi-prompt.ts';

export type { WorkerMultiReply } from './worker-multi.ts';

export interface WorkerTurnInput {
  /** Déjà coupé à WORKER_TEXT_MAX par l'appelant ; le tour recoupe par sécurité. */
  text: string;
  file?: AiFile;
  /** Le tour pose snapshot.demande = text. */
  snapshot: WorkerSnapshot;
  live: WorkerLive;
  /** Palier de quota = tierFor(!!file) : 'rapide' | 'documents', JAMAIS modifié par le profil. */
  tier: Tier;
  /** Production : (r) => callFunction(r, Deno.env) ; banc : le `call` reçu (avec réessais). */
  call: (req: ToolsRequest) => Promise<ToolsResult>;
  /** Production : aiDisponible(Deno.env, tier) ; banc : true. */
  iaDisponible: boolean;
  /** Production : body.multi === true ; banc : true. Faux → profil TOUJOURS « court » (un ancien navigateur ne sait pas afficher la fiche). */
  multiOk: boolean;
  /** 3b-1 : ce que les interrupteurs changent dans les outils (`ouvrir_fenetre`, `outils_coupes`). Absent : les outils d'avant, octet pour octet. */
  etape3?: OptionsOutilsSalarie;
  /**
   * 3c (lectures à la demande) : présent SEULEMENT si l'interrupteur `boucle` est allumé et que l'écran annonce `boucle1` (worker-assistant/index.ts ; le banc le branche pour ses cas).
   * Essayée AVANT `call` pour l'appel au modèle ; `null` = « fais comme avant » (panne, pas Claude, budget) et `call` est alors appelé, exactement comme sans boucle.
   */
  boucle?: (req: ToolsRequest) => Promise<ResultatBoucle | null>;
}

export type WorkerTurnOut =
  | { via: 'local'; profil: 'court'; reply: WorkerFullReply }
  | { via: 'ia'; profil: 'court' | 'long'; reply: WorkerFullReply | WorkerMultiReply | LongLegacy; appels: number; secours?: true;
      /** 3c : le modèle a LU des données avant de répondre — l'appelant ne laisse alors aucun geste s'exécuter sans « Confirmer ». */ teinte?: true }
  | { via: 'erreur'; profil: 'court' | 'long'; raison: 'sans_cle' | 'not_configured' | 'provider_error' | 'bad_response' };

/** Un fichier joint force « court » (outils restreints à ranger_photo / repondre : un PDF piégé ne peut rien d'autre) ; sans multiOk aussi. */
export function workerProfile(text: string, hasFile: boolean, multiOk = true): 'court' | 'long' {
  return hasFile || !multiOk ? 'court' : profilSaisie(text).long ? 'long' : 'court';
}

export async function runWorkerTurn(i: WorkerTurnInput): Promise<WorkerTurnOut> {
  const text = i.text.slice(0, WORKER_TEXT_MAX);
  i.snapshot.demande = text;
  const profil = workerProfile(text, !!i.file, i.multiOk);

  // Profil court : le lecteur local d'abord, comme avant. Profil long : jamais.
  if (profil === 'court' && !i.file) {
    const local = handleWorkerLocally(text, i.snapshot, i.live, i.boucle ? { sansHeures: true } : undefined);
    if (local) return { via: 'local', profil, reply: local };
  }
  if (!i.iaDisponible) return { via: 'erreur', profil, raison: 'sans_cle' };

  if (profil === 'court') {
    // Exactement l'ancien appel : seulement les outils du domaine de la phrase, UN appel.
    const req: ToolsRequest = { prompt: workerFunctionPrompt(i.snapshot, i.live, text), functions: workerFunctionsFor(!!i.file, text, i.snapshot.historique, i.etape3), file: i.file, tier: i.tier };
    const b = i.boucle && !i.file ? await i.boucle(req) : null;
    const r = b ?? await i.call(req);
    if (!r.ok) return { via: 'erreur', profil, raison: r.reason };
    return { via: 'ia', profil, reply: fromWorkerCall(r.call.name, r.call.args, i.snapshot, i.live), appels: 1, ...(r.secours ? { secours: true as const } : {}), ...(b?.teinte ? { teinte: true as const } : {}) };
  }

  const reqLong: ToolsRequest = { prompt: workerMultiPrompt(i.snapshot, i.live, text), functions: workerFunctionsForLong(text, i.snapshot.historique, i.etape3), tier: i.tier, profil: 'long', maxCalls: 4 };
  const b = i.boucle ? await i.boucle(reqLong) : null;
  const r = b ?? await i.call(reqLong);
  if (!r.ok) return { via: 'erreur', profil, raison: r.reason };
  const calls = r.calls ?? [r.call];
  return { via: 'ia', profil, reply: buildLongReply(calls, text, i.snapshot, i.live, { secours: !!r.secours, rognes: r.rognes ?? 0 }), appels: calls.length, ...(r.secours ? { secours: true as const } : {}), ...(b?.teinte ? { teinte: true as const } : {}) };
}
