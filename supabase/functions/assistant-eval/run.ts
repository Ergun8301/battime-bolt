// Lot 7 — exécute le jeu d'évaluation sur UNE version de l'assistant :
//   v1 = code d'avant le lot 7 (copie figée dans ./v1, modèle léger) ;
//   v2 = code actuel (_shared ; lot 6 : outils par domaine, comme les vraies fonctions).
// Le chemin est celui des vraies fonctions : lecteur local d'abord, IA sinon,
// puis les MÊMES contrôles. Rien n'est lu ni écrit en base.
// Salarié v2 : le tour est LE MÊME code que la vraie fonction (_shared/worker-turn.ts : lecteur local,
// profil court ou long), pour que la mesure soit fidèle à la production.
// Suites de conversation (étape 2) : un cas qui porte `history` la passe EXACTEMENT comme les vraies fonctions
// (assistant : ctx.historique ; worker-assistant : snapshot.historique, après nettoyerHistorique et sansDemandeRecollee) : même consigne,
// même choix des outils, et le lecteur local s'efface pour une relance. La version v1 (copie figée d'avant le lot 7) ignore `history`.
import { modeleServi, tierFor, type ToolsRequest, type ToolsResult } from '../_shared/ai-provider.ts';
import * as A2 from '../_shared/assistant-actions-core.ts';
import { functionsFor } from '../_shared/assistant-outils.ts';
import { nettoyerHistorique, sansDemandeRecollee } from '../_shared/assistant-history.ts';
import * as W2 from '../_shared/worker-assistant-core.ts';
import { runWorkerTurn } from '../_shared/worker-turn.ts';
import { ouvrirActif, outilsCoupes, type Etape3Env } from '../_shared/etape3-config.ts';
import { brancherOuvrirBureau, brancherOuvrirSalarie } from '../_shared/ouvrir.ts';
import * as A1 from './v1/assistant-actions-core.ts';
import * as W1 from './v1/worker-assistant-core.ts';
import { ADMIN_RAW, CASES, FILES, LIVE_EN_COURS, LIVE_VIDE, ME, WORKER_LIVE, WORKER_RAW, type EvalCase, type Outcome } from './cases.ts';

export type Call = (req: ToolsRequest) => Promise<ToolsResult>;
export interface CaseResult {
  id: string; cote: string; categorie: string; phrase: string; ok: boolean; why: string | null; via: 'local' | 'ia' | 'erreur'; ms?: number; sortie?: Outcome;
  /** Salarié v2 : court (lecteur local, ou une fonction) ou long (réflexion « medium », plusieurs fonctions). */
  profil?: 'court' | 'long';
  /** Nombre d'appels de fonction rendus par le modèle. */
  appels?: number;
  /** Le modèle de secours a répondu. */
  secours?: boolean;
  /** « fournisseur:modèle » qui a réellement répondu (Claude ou son secours Gemini) : on ne les confond jamais. */
  modele?: string;
}

type AnyReply = { answer?: string; links?: { action: string }[]; action?: { draft: { type: string }; problems: string[] }; auto?: boolean };
function fromAdmin(r: AnyReply | null): Outcome {
  if (!r) return { kind: 'none' };
  if (r.action) return { kind: 'action', type: r.action.draft.type, draft: r.action.draft as unknown as Record<string, unknown>, problems: r.action.problems };
  return { kind: 'answer', answer: r.answer, links: (r.links ?? []).map((l) => l.action), ...(r.auto ? { auto: true } : {}) };
}
type AnyWorker = {
  kind: string; answer?: string; links?: { action: string }[]; action?: { draft: { type: string }; problems: string[] }; draft?: unknown; qui?: string; date?: string; auto?: boolean;
  // fiche à plusieurs éléments
  items?: (Record<string, unknown> & { kind: string })[]; ignores?: { name: string }[]; non_prepare?: string[]; incertain?: boolean; note?: string;
};
/** Un élément de fiche → la même forme normalisée que les réponses seules (+ ce que les contrôles lisent : id, dépendances, cible…). */
function fromItem(it: Record<string, unknown> & { kind: string }): Outcome {
  const commun = { id: it.id as string | undefined, depend: it.depend as string[] | undefined };
  if (it.kind === 'heures') return { kind: 'draft', draft: it.draft as Record<string, unknown>, ...commun };
  if (it.kind === 'chantier') return { kind: 'chantier', nouveau_chantier: it.nouveau_chantier as Record<string, unknown>, manque: it.manque as string[], ...commun };
  const a = it.action as { draft: { type: string }; problems: string[] };
  return {
    kind: 'action', type: a.draft.type, draft: a.draft as unknown as Record<string, unknown>, problems: a.problems, ...commun,
    cible: it.cible as Outcome['cible'], deja_notees: it.deja_notees as Outcome['deja_notees'], avertissements: it.avertissements as string[] | undefined,
  };
}
function fromWorker(r: AnyWorker | null): Outcome {
  if (!r) return { kind: 'none' };
  if (r.kind === 'multi') return { kind: 'multi', items: (r.items ?? []).map(fromItem), ignores: (r.ignores ?? []).map((x) => x.name), non_prepare: r.non_prepare ?? [], incertain: !!r.incertain, note: r.note };
  if (r.kind === 'action' && r.action) return { kind: 'action', type: r.action.draft.type, draft: r.action.draft as unknown as Record<string, unknown>, problems: r.action.problems };
  if (r.kind === 'draft') return { kind: 'draft', draft: r.draft as Record<string, unknown> };
  if (r.kind === 'collegues') return { kind: 'collegues', qui: r.qui, date: r.date };
  return { kind: 'answer', answer: r.answer, links: (r.links ?? []).map((l) => l.action), ...(r.auto ? { auto: true } : {}) };
}

async function runOne(c: EvalCase, version: 'v1' | 'v2', appel: Call, e3: Etape3Env): Promise<CaseResult> {
  // Chaque cas note quel modèle a servi (le dernier appel), pour que le rapport dise Claude ou secours.
  let servi: string | undefined;
  const call: Call = async (req) => { const r = await appel(req); servi = modeleServi(r) ?? servi; return r; };
  const base = { id: c.id, cote: c.cote, categorie: c.categorie, phrase: c.phrase };
  const t0 = Date.now();
  const file = c.file ? FILES[c.file] : undefined;
  // Étape 3 : `ouvrir` allumé pour CE cas ? Les mêmes quatre conditions que la production (ouvrirActif) ; le banc annonce toujours `ouvrir1`. Éteint : rien ne change.
  const ouvrirOn = version === 'v2' && ouvrirActif(e3, c.cote, ADMIN_RAW.companyId, ['ouvrir1'], !!file);
  const coupes = version === 'v2' ? outilsCoupes(e3) : [];
  const optsOutils = ouvrirOn || coupes.length ? { ouvrir: ouvrirOn, coupes } : undefined;
  try {
    let out: Outcome;
    let via: CaseResult['via'] = 'local';
    let suite: Pick<CaseResult, 'profil' | 'appels' | 'secours'> = {};
    if (c.cote === 'bureau') {
      const A = version === 'v2' ? A2 : A1;
      const ctx = A.buildActionContext(ADMIN_RAW as Parameters<typeof A2.buildActionContext>[0]) as A2.ActionContext;
      if (version === 'v2') { ctx.me = ME; ctx.demande = c.phrase; if (c.history) ctx.historique = sansDemandeRecollee(nettoyerHistorique(c.history), c.phrase); }
      if (ouvrirOn) brancherOuvrirBureau(ctx);
      const local = file ? null : A.handleActionLocally(c.phrase, ctx as never);
      if (local) out = fromAdmin(local as AnyReply);
      else {
        via = 'ia';
        const r = await call({
          prompt: A.actionPrompt(ctx as never, '{}', ouvrirOn ? A2.guideForPrompt('etape3', ctx.guideLiens) : A.guideForPrompt(), c.phrase),
          functions: version === 'v2' ? (optsOutils ? functionsFor(!!file, c.phrase, ctx.historique, optsOutils) : functionsFor(!!file, c.phrase, ctx.historique)) : A1.ASSISTANT_FUNCTIONS, file,
        });
        out = r.ok ? fromAdmin(A.fromFunctionCall(r.call.name, r.call.args, ctx as never) as AnyReply) : { kind: 'none', answer: `IA : ${r.reason}` };
      }
    } else if (version === 'v2') {
      const snap = W2.buildWorkerSnapshot(WORKER_RAW as never) as W2.WorkerSnapshot;
      const live = { ...(c.live === 'vide' ? LIVE_VIDE : WORKER_LIVE), enCours: c.enCours ? LIVE_EN_COURS : null } as W2.WorkerLive;
      if (c.history) snap.historique = sansDemandeRecollee(nettoyerHistorique(c.history), c.phrase);
      if (ouvrirOn) brancherOuvrirSalarie(snap, 'worker');
      const t = await runWorkerTurn({ text: c.phrase, file, snapshot: snap, live, tier: tierFor(!!file), call, iaDisponible: true, multiOk: true, ...(optsOutils ? { etape3: optsOutils } : {}) });
      via = t.via === 'local' ? 'local' : 'ia';
      suite = { profil: t.profil, ...(t.via === 'ia' ? { appels: t.appels, ...(t.secours ? { secours: true } : {}) } : {}) };
      out = t.via === 'erreur' ? { kind: 'none', answer: `IA : ${t.raison}` } : fromWorker(t.reply as AnyWorker);
    } else {
      const snap = W1.buildWorkerSnapshot(WORKER_RAW as never) as W2.WorkerSnapshot;
      const live = { ...WORKER_LIVE, enCours: c.enCours ? LIVE_EN_COURS : null } as W2.WorkerLive;
      const local = file ? null : W1.handleWorkerLocally(c.phrase, snap as never, live as never);
      if (local) out = fromWorker(local as AnyWorker);
      else {
        via = 'ia';
        const r = await call({ prompt: W1.workerFunctionPrompt(snap as never, live as never, c.phrase), functions: W1.WORKER_FUNCTIONS, file });
        out = r.ok ? fromWorker(W1.fromWorkerCall(r.call.name, r.call.args, snap as never, live as never) as AnyWorker) : { kind: 'none', answer: `IA : ${r.reason}` };
      }
    }
    if (ouvrirOn) out = { ...out, etape3: true };
    const why = c.check(out);
    // Diagnostic : pour un échec, ce que l'assistant a réellement préparé (jeu fictif, rien d'une vraie entreprise).
    return { ...base, ok: !why, why, via, ms: Date.now() - t0, ...suite, ...(servi ? { modele: servi } : {}), ...(why ? { sortie: out } : {}) };
  } catch (e) {
    return { ...base, ok: false, why: `erreur : ${(e as Error).message}`, via: 'erreur', ...(servi ? { modele: servi } : {}) };
  }
}

const mediane = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };

/**
 * `opts.repeat` : chaque cas est passé N fois (le modèle n'est plus à température fixe : 3 passes par cas donnent la vraie
 * réussite). `total` et `ok` comptent alors des ESSAIS ; `parCas` dit, pour chaque cas, combien d'essais ont réussi.
 */
export async function runEval(version: 'v1' | 'v2', call: Call, ids?: string[], parallel = 6, gapMs = 0, opts: { repeat?: number; etape3?: Etape3Env } = {}) {
  const repeat = Math.max(1, Math.floor(opts.repeat ?? 1));
  // Étape 3 : sans `etape3` (ou éteint) le banc est TOUT ÉTEINT ; un cas « Ouvrir » ne se joue que si son interrupteur est allumé (jamais en v1).
  const e3: Etape3Env = opts.etape3 ?? { get: () => undefined };
  const cases = CASES.filter((c) => !ids?.length || ids.includes(c.id)).filter((c) => !c.etape3 || (version === 'v2' && ouvrirActif(e3, c.cote, ADMIN_RAW.companyId, ['ouvrir1'], !!c.file)));
  const essais = cases.flatMap((c) => Array.from({ length: repeat }, () => c));
  const results: CaseResult[] = [];
  for (let i = 0; i < essais.length; i += parallel) {
    if (i && gapMs) await new Promise((r) => setTimeout(r, gapMs));
    results.push(...await Promise.all(essais.slice(i, i + parallel).map((c) => runOne(c, version, call, e3))));
  }
  const byCat = new Map<string, { ok: number; n: number }>();
  for (const r of results) {
    const k = `${r.cote === 'bureau' ? 'Bureau' : 'Salarié'} · ${r.categorie}`;
    const x = byCat.get(k) ?? { ok: 0, n: 0 };
    x.n++; if (r.ok) x.ok++;
    byCat.set(k, x);
  }
  const ok = results.filter((r) => r.ok).length;
  // Une erreur du fournisseur (503, 429, délai) n'est pas une mauvaise lecture : comptée à part.
  const fournisseur = (r: CaseResult) => !r.ok && r.sortie?.kind === 'none' && /^IA : /.test(r.sortie.answer ?? '');
  const profils = (['court', 'long'] as const).map((profil) => {
    const rs = results.filter((r) => r.profil === profil && r.via === 'ia');
    return { profil, n: rs.length, ok: rs.filter((r) => r.ok).length, medianeMs: mediane(rs.map((r) => r.ms ?? 0)), maxMs: Math.max(0, ...rs.map((r) => r.ms ?? 0)), secours: rs.filter((r) => r.secours).length };
  });
  // Qui a servi les cas passés par l'IA (« anthropic:claude-sonnet-5-5 », « gemini:… » = le secours) ; « aucun » = erreur de bout en bout.
  const compte = new Map<string, number>();
  for (const r of results.filter((x) => x.via === 'ia')) compte.set(r.modele ?? 'aucun', (compte.get(r.modele ?? 'aucun') ?? 0) + 1);
  return {
    version, repeat, total: results.length, ok, pct: Math.round((ok / Math.max(1, results.length)) * 1000) / 10,
    categories: Array.from(byCat.entries()).map(([categorie, v]) => ({ categorie, ...v, pct: Math.round((v.ok / v.n) * 100) })),
    echecs: results.filter((r) => !r.ok).map((r) => ({ id: r.id, phrase: r.phrase, why: r.why, via: r.via, profil: r.profil, cause: fournisseur(r) ? 'fournisseur' : 'modèle ou code', sortie: r.sortie })),
    // Chaque cas : combien d'essais réussis (« aucun cas en échec 3/3 »).
    parCas: cases.map((c) => ({ id: c.id, essais: repeat, ok: results.filter((r) => r.id === c.id && r.ok).length })),
    // Lot 7 (lenteur) : temps par phrase passée par l'IA ; profils court / long : réussite, médiane, maximum, réponses du secours.
    temps: results.filter((r) => r.via === 'ia').map((r) => ({ id: r.id, ms: r.ms })),
    profils,
    modeles: Array.from(compte.entries()).map(([modele, n]) => ({ modele, n })),
  };
}
