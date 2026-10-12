// Lot 6 — l'appel au modèle ne dépasse JAMAIS le plafond de temps, et il n'y a
// plus de course entre un modèle fort et un modèle léger : UN appel, le secours
// seulement après une erreur ou un délai dépassé.   npm run test:ai-provider
// (Le réglage AI_CONFIG, les clés et le routage : ai-config.test.ts.)
import { callFunction, DELAIS, MODELES_PAR_DEFAUT } from './ai-provider.ts';

const FN = [{ name: 'repondre', description: 'x', parameters: { type: 'object', properties: {} } }];
const ok = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: 'repondre', args: { reponse: 'ok' } } }] } }] }), { status: 200 });
type Plan = Record<string, { ms?: number; status?: number }>;
function fakeGemini(plan: Plan) {
  const calls: { model: string; at: number }[] = [];
  let enCours = 0, maxEnMemeTemps = 0;
  const fetchImpl = (url: string, init: RequestInit) => {
    const model = decodeURIComponent(/models\/([^:]+):/.exec(url)![1]);
    calls.push({ model, at: Date.now() });
    enCours++; maxEnMemeTemps = Math.max(maxEnMemeTemps, enCours);
    const p = plan[model] ?? {};
    return new Promise<Response>((resolve, reject) => {
      const t = setTimeout(() => { enCours--; resolve(p.status ? new Response('{}', { status: p.status }) : ok()); }, p.ms ?? 5);
      init.signal?.addEventListener('abort', () => { clearTimeout(t); enCours--; reject(new DOMException('aborted', 'AbortError')); });
    });
  };
  return { calls, fetchImpl, maxEnMemeTemps: () => maxEnMemeTemps };
}
const env = { get: (k: string) => ({ AI_API_KEY: 'k' } as Record<string, string>)[k] };
const { rapide: R, secours: S } = MODELES_PAR_DEFAUT;

Deno.test('Plus de course : un modèle lent mais qui répond est le SEUL appelé (jamais deux en même temps)', async () => {
  const f = fakeGemini({ [R]: { ms: 700 } });
  const r = await callFunction({ prompt: 'ajoute une intervention', functions: FN }, env, f.fetchImpl);
  if (!r.ok) throw new Error('réponse attendue');
  if (f.calls.length !== 1 || f.calls[0].model !== R || f.maxEnMemeTemps() !== 1) throw new Error(`appels : ${f.calls.map((c) => c.model).join(',')}`);
});

Deno.test('Erreur du modèle rapide (quota 429, surcharge 503) : le secours répond, après coup', async () => {
  for (const status of [429, 503]) {
    const f = fakeGemini({ [R]: { status } });
    const r = await callFunction({ prompt: 'x', functions: FN }, env, f.fetchImpl);
    if (!r.ok || f.calls.map((c) => c.model).join(',') !== `${R},${S}` || f.maxEnMemeTemps() !== 1) throw new Error(`${status} : ${f.calls.map((c) => c.model).join(',')}`);
  }
});

Deno.test('Tout en panne ou trop lent : échec propre, dans le plafond de temps total', async () => {
  const f = fakeGemini({ [R]: { ms: 60_000 }, [S]: { ms: 60_000 } });
  const t0 = Date.now();
  const r = await callFunction({ prompt: 'x', functions: FN }, env, f.fetchImpl);
  const ms = Date.now() - t0;
  if (r.ok || r.reason !== 'provider_error') throw new Error('échec attendu');
  if (ms > DELAIS.rapide.total + 500) throw new Error(`plafond dépassé : ${ms} ms`);
  if (f.calls.length !== 2) throw new Error(`${f.calls.length} appel(s)`);
});
