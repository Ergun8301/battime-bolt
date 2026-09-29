// Lot 7 — exécute le jeu d'évaluation sur UNE version de l'assistant :
//   v1 = code d'avant le lot 7 (copie figée dans ./v1, modèle léger) ;
//   v2 = code du lot 7 (_shared, modèle fort pour les actions).
// Le chemin est celui des vraies fonctions : lecteur local d'abord, IA sinon,
// puis les MÊMES contrôles. Rien n'est lu ni écrit en base.
import type { ToolsRequest, ToolsResult } from '../_shared/ai-provider.ts';
import * as A2 from '../_shared/assistant-actions-core.ts';
import * as W2 from '../_shared/worker-assistant-core.ts';
import * as A1 from './v1/assistant-actions-core.ts';
import * as W1 from './v1/worker-assistant-core.ts';
import { ADMIN_RAW, CASES, FILES, LIVE_EN_COURS, ME, WORKER_LIVE, WORKER_RAW, type EvalCase, type Outcome } from './cases.ts';

export type Call = (req: ToolsRequest) => Promise<ToolsResult>;
export interface CaseResult { id: string; cote: string; categorie: string; phrase: string; ok: boolean; why: string | null; via: 'local' | 'ia' | 'erreur'; ms?: number }

type AnyReply = { answer?: string; links?: { action: string }[]; action?: { draft: { type: string }; problems: string[] } };
function fromAdmin(r: AnyReply | null): Outcome {
  if (!r) return { kind: 'none' };
  if (r.action) return { kind: 'action', type: r.action.draft.type, draft: r.action.draft as unknown as Record<string, unknown>, problems: r.action.problems };
  return { kind: 'answer', answer: r.answer, links: (r.links ?? []).map((l) => l.action) };
}
type AnyWorker = { kind: string; answer?: string; links?: { action: string }[]; action?: { draft: { type: string }; problems: string[] }; draft?: unknown; qui?: string; date?: string };
function fromWorker(r: AnyWorker | null): Outcome {
  if (!r) return { kind: 'none' };
  if (r.kind === 'action' && r.action) return { kind: 'action', type: r.action.draft.type, draft: r.action.draft as unknown as Record<string, unknown>, problems: r.action.problems };
  if (r.kind === 'draft') return { kind: 'draft', draft: r.draft as Record<string, unknown> };
  if (r.kind === 'collegues') return { kind: 'collegues', qui: r.qui, date: r.date };
  return { kind: 'answer', answer: r.answer, links: (r.links ?? []).map((l) => l.action) };
}

async function runOne(c: EvalCase, version: 'v1' | 'v2', call: Call): Promise<CaseResult> {
  const base = { id: c.id, cote: c.cote, categorie: c.categorie, phrase: c.phrase };
  const t0 = Date.now();
  const file = c.file ? FILES[c.file] : undefined;
  const kind = version === 'v2' && W2.looksLikeAction(c.phrase, !!file) ? 'action' : 'question';
  try {
    let out: Outcome;
    let via: CaseResult['via'] = 'local';
    if (c.cote === 'bureau') {
      const A = version === 'v2' ? A2 : A1;
      const ctx = A.buildActionContext(ADMIN_RAW as Parameters<typeof A2.buildActionContext>[0]) as A2.ActionContext;
      if (version === 'v2') { ctx.me = ME; ctx.demande = c.phrase; }
      const local = file ? null : A.handleActionLocally(c.phrase, ctx as never);
      if (local) out = fromAdmin(local as AnyReply);
      else {
        via = 'ia';
        const r = await call({ prompt: A.actionPrompt(ctx as never, '{}', A.guideForPrompt(), c.phrase), functions: A.ASSISTANT_FUNCTIONS, file, kind });
        out = r.ok ? fromAdmin(A.fromFunctionCall(r.call.name, r.call.args, ctx as never) as AnyReply) : { kind: 'none', answer: `IA : ${r.reason}` };
      }
    } else {
      const W = version === 'v2' ? W2 : W1;
      const snap = W.buildWorkerSnapshot(WORKER_RAW as never) as W2.WorkerSnapshot;
      if (version === 'v2') snap.demande = c.phrase;
      const live = { ...WORKER_LIVE, enCours: c.enCours ? LIVE_EN_COURS : null } as W2.WorkerLive;
      const local = file ? null : W.handleWorkerLocally(c.phrase, snap as never, live as never);
      if (local) out = fromWorker(local as AnyWorker);
      else {
        via = 'ia';
        const r = await call({ prompt: W.workerFunctionPrompt(snap as never, live as never, c.phrase), functions: W.WORKER_FUNCTIONS, file, kind });
        out = r.ok ? fromWorker(W.fromWorkerCall(r.call.name, r.call.args, snap as never, live as never) as AnyWorker) : { kind: 'none', answer: `IA : ${r.reason}` };
      }
    }
    const why = c.check(out);
    return { ...base, ok: !why, why, via, ms: Date.now() - t0 };
  } catch (e) {
    return { ...base, ok: false, why: `erreur : ${(e as Error).message}`, via: 'erreur' };
  }
}

export async function runEval(version: 'v1' | 'v2', call: Call, ids?: string[], parallel = 6, gapMs = 0) {
  const cases = CASES.filter((c) => !ids?.length || ids.includes(c.id));
  const results: CaseResult[] = [];
  for (let i = 0; i < cases.length; i += parallel) {
    if (i && gapMs) await new Promise((r) => setTimeout(r, gapMs));
    results.push(...await Promise.all(cases.slice(i, i + parallel).map((c) => runOne(c, version, call))));
  }
  const byCat = new Map<string, { ok: number; n: number }>();
  for (const r of results) {
    const k = `${r.cote === 'bureau' ? 'Bureau' : 'Salarié'} · ${r.categorie}`;
    const x = byCat.get(k) ?? { ok: 0, n: 0 };
    x.n++; if (r.ok) x.ok++;
    byCat.set(k, x);
  }
  const ok = results.filter((r) => r.ok).length;
  return {
    version, total: results.length, ok, pct: Math.round((ok / Math.max(1, results.length)) * 1000) / 10,
    categories: Array.from(byCat.entries()).map(([categorie, v]) => ({ categorie, ...v, pct: Math.round((v.ok / v.n) * 100) })),
    echecs: results.filter((r) => !r.ok).map((r) => ({ id: r.id, phrase: r.phrase, why: r.why, via: r.via })),
    // Lot 7 (lenteur) : temps par phrase passée par l'IA.
    temps: results.filter((r) => r.via === 'ia').map((r) => ({ id: r.id, ms: r.ms })),
  };
}
