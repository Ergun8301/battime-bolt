// Lot 7 — exécute le jeu d'évaluation sur UNE version de l'assistant :
//   v1 = code d'avant le lot 7 (copie figée dans ./v1, modèle léger) ;
//   v2 = code actuel (_shared ; lot 6 : outils par domaine, comme les vraies fonctions).
// Le chemin est celui des vraies fonctions : lecteur local d'abord, IA sinon,
// puis les MÊMES contrôles. Rien n'est lu ni écrit en base.
// Salarié v2 : le tour est LE MÊME code que la vraie fonction (_shared/worker-turn.ts : lecteur local,
// profil court ou long), pour que la mesure soit fidèle à la production.
import { tierFor, type ToolsRequest, type ToolsResult } from '../_shared/ai-provider.ts';
import * as A2 from '../_shared/assistant-actions-core.ts';
import * as W2 from '../_shared/worker-assistant-core.ts';
import { runWorkerTurn } from '../_shared/worker-turn.ts';
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
}

type AnyReply = { answer?: string; links?: { action: string }[]; action?: { draft: { type: string }; problems: string[] } };
function fromAdmin(r: AnyReply | null): Outcome {
  if (!r) return { kind: 'none' };
  if (r.action) return { kind: 'action', type: r.action.draft.type, draft: r.action.draft as unknown as Record<string, unknown>, problems: r.action.problems };
  return { kind: 'answer', answer: r.answer, links: (r.links ?? []).map((l) => l.action) };
}
type AnyWorker = {
  kind: string; answer?: string; links?: { action: string }[]; action?: { draft: { type: string }; problems: string[] }; draft?: unknown; qui?: string; date?: string;
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
  return { kind: 'answer', answer: r.answer, links: (r.links ?? []).map((l) => l.action) };
}

async function runOne(c: EvalCase, version: 'v1' | 'v2', call: Call): Promise<CaseResult> {
  const base = { id: c.id, cote: c.cote, categorie: c.categorie, phrase: c.phrase };
  const t0 = Date.now();
  const file = c.file ? FILES[c.file] : undefined;
  try {
    let out: Outcome;
    let via: CaseResult['via'] = 'local';
    let suite: Pick<CaseResult, 'profil' | 'appels' | 'secours'> = {};
    if (c.cote === 'bureau') {
      const A = version === 'v2' ? A2 : A1;
      const ctx = A.buildActionContext(ADMIN_RAW as Parameters<typeof A2.buildActionContext>[0]) as A2.ActionContext;
      if (version === 'v2') { ctx.me = ME; ctx.demande = c.phrase; }
      const local = file ? null : A.handleActionLocally(c.phrase, ctx as never);
      if (local) out = fromAdmin(local as AnyReply);
      else {
        via = 'ia';
        const r = await call({ prompt: A.actionPrompt(ctx as never, '{}', A.guideForPrompt(), c.phrase), functions: version === 'v2' ? A2.functionsFor(!!file, c.phrase) : A.ASSISTANT_FUNCTIONS, file });
        out = r.ok ? fromAdmin(A.fromFunctionCall(r.call.name, r.call.args, ctx as never) as AnyReply) : { kind: 'none', answer: `IA : ${r.reason}` };
      }
    } else if (version === 'v2') {
      const snap = W2.buildWorkerSnapshot(WORKER_RAW as never) as W2.WorkerSnapshot;
      const live = { ...(c.live === 'vide' ? LIVE_VIDE : WORKER_LIVE), enCours: c.enCours ? LIVE_EN_COURS : null } as W2.WorkerLive;
      const t = await runWorkerTurn({ text: c.phrase, file, snapshot: snap, live, tier: tierFor(!!file), call, iaDisponible: true, multiOk: true });
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
    const why = c.check(out);
    // Diagnostic : pour un échec, ce que l'assistant a réellement préparé (jeu fictif, rien d'une vraie entreprise).
    return { ...base, ok: !why, why, via, ms: Date.now() - t0, ...suite, ...(why ? { sortie: out } : {}) };
  } catch (e) {
    return { ...base, ok: false, why: `erreur : ${(e as Error).message}`, via: 'erreur' };
  }
}

const mediane = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };

/**
 * `opts.repeat` : chaque cas est passé N fois (le modèle n'est plus à température fixe : 3 passes par cas donnent la vraie
 * réussite). `total` et `ok` comptent alors des ESSAIS ; `parCas` dit, pour chaque cas, combien d'essais ont réussi.
 */
export async function runEval(version: 'v1' | 'v2', call: Call, ids?: string[], parallel = 6, gapMs = 0, opts: { repeat?: number } = {}) {
  const repeat = Math.max(1, Math.floor(opts.repeat ?? 1));
  const cases = CASES.filter((c) => !ids?.length || ids.includes(c.id));
  const essais = cases.flatMap((c) => Array.from({ length: repeat }, () => c));
  const results: CaseResult[] = [];
  for (let i = 0; i < essais.length; i += parallel) {
    if (i && gapMs) await new Promise((r) => setTimeout(r, gapMs));
    results.push(...await Promise.all(essais.slice(i, i + parallel).map((c) => runOne(c, version, call))));
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
  return {
    version, repeat, total: results.length, ok, pct: Math.round((ok / Math.max(1, results.length)) * 1000) / 10,
    categories: Array.from(byCat.entries()).map(([categorie, v]) => ({ categorie, ...v, pct: Math.round((v.ok / v.n) * 100) })),
    echecs: results.filter((r) => !r.ok).map((r) => ({ id: r.id, phrase: r.phrase, why: r.why, via: r.via, profil: r.profil, cause: fournisseur(r) ? 'fournisseur' : 'modèle ou code', sortie: r.sortie })),
    // Chaque cas : combien d'essais réussis (« aucun cas en échec 3/3 »).
    parCas: cases.map((c) => ({ id: c.id, essais: repeat, ok: results.filter((r) => r.id === c.id && r.ok).length })),
    // Lot 7 (lenteur) : temps par phrase passée par l'IA ; profils court / long : réussite, médiane, maximum, réponses du secours.
    temps: results.filter((r) => r.via === 'ia').map((r) => ({ id: r.id, ms: r.ms })),
    profils,
  };
}
