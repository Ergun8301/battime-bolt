// Edge Function : assistant-eval — fait tourner le JEU D'ÉVALUATION de
// l'Assistant BEMEXO sur le VRAI modèle (lot 7), avant / après.
//
// ISOLÉE : aucune donnée d'entreprise (tout est fictif, dans cases.ts), aucune
// lecture ni écriture en base, rien dans les logs. Appelable UNIQUEMENT avec le
// secret « cron » de la base (en-tête x-cron-secret, vérifié par
// public.verify_cron_secret), c'est-à-dire depuis la base elle-même (pg_net).
//   body : { version: 'v1' | 'v2', ids?: string[] }
import { callFunction } from '../_shared/ai-provider.ts';
import { runEval } from './run.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
// Vérifie le secret auprès de la base (fonction publique verify_cron_secret).
async function secretOk(candidate: string): Promise<boolean> {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const res = await fetch(`${Deno.env.get('SUPABASE_URL') ?? ''}/rest/v1/rpc/verify_cron_secret`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidate }),
  }).catch(() => null);
  return !!res?.ok && (await res.json().catch(() => false)) === true;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const secret = req.headers.get('x-cron-secret') ?? '';
  if (!secret) return json({ error: 'Non autorisé' }, 401);
  if (!(await secretOk(secret))) return json({ error: 'Non autorisé' }, 401);
  const body = await req.json().catch(() => ({})) as { version?: string; ids?: string[]; parallel?: number; gapMs?: number };
  const version = body.version === 'v1' ? 'v1' : 'v2';
  // v1 = modèle léger seul (comme avant le lot 7) ; v2 = modèle fort pour les actions.
  const env = version === 'v1'
    ? { get: (k: string) => (k === 'AI_ACTION_MODEL' ? (Deno.env.get('AI_MODEL') || 'gemini-3.1-flash-lite') : Deno.env.get(k)) }
    : Deno.env;
  // La clé est partagée avec la prod : on va doucement et on réessaie après un
  // refus « trop de requêtes » (le banc d'essai ne doit pas mesurer le quota).
  const call = async (r: Parameters<typeof callFunction>[0]) => {
    let res = await callFunction(r, env);
    for (let i = 1; i <= 3 && !res.ok && res.reason === 'provider_error'; i++) {
      await new Promise((ok) => setTimeout(ok, 10_000 * i));
      res = await callFunction(r, env);
    }
    return res;
  };
  const parallel = Math.min(Math.max(Number(body.parallel) || 1, 1), 6);
  const gapMs = Math.min(Math.max(Number(body.gapMs) || 0, 0), 20_000);
  const result = await runEval(version, call, Array.isArray(body.ids) ? body.ids.slice(0, 80) : undefined, parallel, gapMs);
  return json(result);
});
