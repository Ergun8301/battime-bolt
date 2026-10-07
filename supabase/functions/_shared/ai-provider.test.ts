// Lot 7 (lenteur) — l'appel au modèle ne dépasse JAMAIS le plafond de temps :
// modèle fort lent → le léger répond ; fort refusé (quota) → mis au repos ;
// léger surchargé → modèle de secours.   npm run test:ai-provider
import { callFunction } from './ai-provider.ts';

const FN = [{ name: 'repondre', description: 'x', parameters: { type: 'object', properties: {} } }];
const ok = (name = 'repondre') => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name, args: { reponse: 'ok' } } }] } }] }), { status: 200 });
type Plan = Record<string, { ms?: number; status?: number }>;
function fakeGemini(plan: Plan) {
  const calls: string[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    const model = decodeURIComponent(/models\/([^:]+):/.exec(url)![1]);
    calls.push(model);
    const p = plan[model] ?? {};
    return new Promise<Response>((resolve, reject) => {
      const t = setTimeout(() => resolve(p.status ? new Response('{}', { status: p.status }) : ok()), p.ms ?? 5);
      init.signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')); });
    });
  };
  return { calls, fetchImpl };
}
const env = (x: Record<string, string>) => ({
  get: (k: string) => ({ GEMINI_API_KEY: 'k', AI_MODEL: 'leger', AI_ACTION_MODEL: 'fort', AI_FALLBACK_MODEL: 'secours', AI_TIMEOUT_MS: '600', AI_ACTION_WAIT_MS: '150', ...x } as Record<string, string>)[k],
});

Deno.test('Modèle fort trop lent : le léger répond, sans attendre le fort', async () => {
  const f = fakeGemini({ fort: { ms: 5000 }, leger: { ms: 40 } });
  const t0 = Date.now();
  const r = await callFunction({ prompt: 'x', functions: FN, kind: 'action' }, env({}), f.fetchImpl);
  const ms = Date.now() - t0;
  if (!r.ok) throw new Error('attendu une réponse');
  if (ms > 400) throw new Error(`trop long : ${ms} ms`);
});

Deno.test('Modèle fort refusé (quota) : mis au repos, plus rappelé', async () => {
  const e = env({ AI_ACTION_MODEL: 'fort-quota' });
  const f = fakeGemini({ 'fort-quota': { status: 429 } });
  const r1 = await callFunction({ prompt: 'x', functions: FN, kind: 'action' }, e, f.fetchImpl);
  const r2 = await callFunction({ prompt: 'x', functions: FN, kind: 'action' }, e, f.fetchImpl);
  if (!r1.ok || !r2.ok) throw new Error('le léger doit répondre');
  if (f.calls.filter((c) => c === 'fort-quota').length !== 1) throw new Error(`fort rappelé : ${f.calls.join(',')}`);
});

Deno.test('Léger surchargé (503) : modèle de secours ; tout en panne : échec dans le plafond', async () => {
  const f = fakeGemini({ leger: { status: 503 } });
  const r = await callFunction({ prompt: 'x', functions: FN, kind: 'question' }, env({ AI_TIMEOUT_MS: '3000' }), f.fetchImpl);
  if (!r.ok || !f.calls.includes('secours')) throw new Error(`secours non utilisé : ${f.calls.join(',')}`);
  const g = fakeGemini({ leger: { ms: 5000 }, secours: { ms: 5000 } });
  const t0 = Date.now();
  const r2 = await callFunction({ prompt: 'x', functions: FN, kind: 'question' }, env({}), g.fetchImpl);
  if (r2.ok || Date.now() - t0 > 900) throw new Error(`plafond dépassé : ${Date.now() - t0} ms`);
});
