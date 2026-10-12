// Lot 6 — l'appel au modèle ne dépasse JAMAIS le plafond de temps, et il n'y a
// plus de course entre un modèle fort et un modèle léger : UN appel, le secours
// seulement après une erreur ou un délai dépassé.   npm run test:ai-provider
// (Le réglage AI_CONFIG, les clés et le routage : ai-config.test.ts.)
import { callFunction, DELAIS, MODELES_PAR_DEFAUT, reposReinit } from './ai-provider.ts';

const FN = [{ name: 'repondre', description: 'x', parameters: { type: 'object', properties: {} } }];
const ok = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: 'repondre', args: { reponse: 'ok' } } }] } }] }), { status: 200 });
type Plan = Record<string, { ms?: number; status?: number }>;
function fakeGemini(plan: Plan) {
  reposReinit(); // chaque scénario repart à neuf : aucun modèle mis de côté par le précédent
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
const { rapide: R, documents: D, secours: S } = MODELES_PAR_DEFAUT;

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

Deno.test('Documents : 12 s au premier modèle, 25 s au plus secours compris (délais raccourcis ici pour ne pas attendre)', async () => {
  if (DELAIS.documents.premier !== 12_000 || DELAIS.documents.total !== 25_000) throw new Error(`réglage : ${JSON.stringify(DELAIS.documents)}`);
  const vrais = DELAIS.documents;
  DELAIS.documents = { premier: 300, total: 2500 };
  try {
    const PDF = { mime: 'application/pdf', base64: 'JVBERi0xLjQK' };
    // Le modèle « documents » dépasse son délai : abandon à 0,3 s, puis le secours répond.
    const f = fakeGemini({ [D]: { ms: 60_000 } });
    const t0 = Date.now();
    const r = await callFunction({ prompt: 'x', functions: FN, file: PDF }, env, f.fetchImpl);
    const ms = Date.now() - t0;
    if (!r.ok || f.calls.map((c) => c.model).join(',') !== `${D},${S}`) throw new Error(`appels : ${f.calls.map((c) => c.model).join(',')}`);
    if (ms < 250 || ms > 1500) throw new Error(`le secours devait partir après ~0,3 s, pas ${ms} ms`);
    // Tout est lent : échec propre dans le plafond total, deux appels.
    const g = fakeGemini({ [D]: { ms: 60_000 }, [S]: { ms: 60_000 } });
    const t1 = Date.now();
    const x = await callFunction({ prompt: 'x', functions: FN, file: PDF }, env, g.fetchImpl);
    const ms2 = Date.now() - t1;
    if (x.ok || x.reason !== 'provider_error' || g.calls.length !== 2 || ms2 > 2500 + 500) throw new Error(`plafond : ${g.calls.length} appel(s), ${ms2} ms`);
  } finally {
    DELAIS.documents = vrais;
  }
});
