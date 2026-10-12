// Edge Function : assistant-eval — fait tourner le JEU D'ÉVALUATION de
// l'Assistant BEMEXO sur le VRAI modèle (lot 7), avant / après.
//
// ISOLÉE : aucune donnée d'entreprise (tout est fictif, dans cases.ts), aucune
// lecture ni écriture en base, rien dans les logs. Appelable UNIQUEMENT avec le
// secret « cron » de la base (en-tête x-cron-secret, vérifié par
// public.verify_cron_secret), c'est-à-dire depuis la base elle-même (pg_net) :
// c'est la SEULE de ces fonctions qui garde la clé de service, pour cette seule
// vérification.
//   body : { version: 'v1' | 'v2', ids?: string[], parallel?: number, gapMs?: number, prodPath?: boolean }
//
// Lot 6 : TOUS les appels au modèle passent par l'adaptateur partagé
// (_shared/ai-provider.ts) : même réglage AI_CONFIG, même clé AI_API_KEY
// (repli GEMINI_API_KEY), même routage (un appel, secours après erreur) que les
// vraies fonctions. Les anciens essais « chronomètre » et « sonde » de modèles,
// qui appelaient Gemini en direct, sont retirés. `prodPath` = aucun nouvel essai
// après une erreur (le chemin exact des clients).
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

// Diagnostic : garde TOUTES les fonctions que le modèle a renvoyées (le code de production n'en garde qu'une).
const recordingFetch = (calls: unknown[]) => async (url: string, init: RequestInit) => {
  const res = await fetch(url, init);
  try {
    const j = await res.clone().json() as { candidates?: { content?: { parts?: { text?: string; functionCall?: unknown }[] } }[]; error?: { message?: string } };
    const parts = j.candidates?.[0]?.content?.parts ?? [];
    calls.push({
      modele: /models\/([^:]+):/.exec(url)?.[1] ?? '', http: res.status,
      fonctions: parts.filter((p) => p.functionCall).map((p) => p.functionCall),
      texte: parts.filter((p) => p.text).map((p) => p.text).join('').slice(0, 300), erreur: j.error?.message?.slice(0, 200),
    });
  } catch { /* ignoré */ }
  return res;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const secret = req.headers.get('x-cron-secret') ?? '';
  if (!secret) return json({ error: 'Non autorisé' }, 401);
  if (!(await secretOk(secret))) return json({ error: 'Non autorisé' }, 401);
  const body = await req.json().catch(() => ({})) as {
    version?: string; ids?: string[]; parallel?: number; gapMs?: number; prodPath?: boolean;
    /** Diagnostic : sans le lecteur local ; AI_CONFIG de remplacement ; niveau forcé ; appels bruts du modèle. */
    sansLocal?: boolean; aiConfig?: unknown; tier?: string; trace?: boolean;
  };
  const env = { get: (k: string) => (k === 'AI_CONFIG' && body.aiConfig ? JSON.stringify(body.aiConfig) : Deno.env.get(k)) };
  const tier = body.tier === 'documents' || body.tier === 'rapide' ? body.tier : undefined;
  const opt = { sansLocal: !!body.sansLocal, trace: !!body.trace };
  const rec = async (r: Parameters<typeof callFunction>[0]) => {
    const calls: unknown[] = [];
    const res = await callFunction({ ...r, ...(tier ? { tier } : {}) }, env, opt.trace ? recordingFetch(calls) : fetch);
    if (opt.trace) (res as { appels?: unknown }).appels = calls;
    return res;
  };
  const version = body.version === 'v1' ? 'v1' : 'v2';
  const ids = Array.isArray(body.ids) ? body.ids.slice(0, 80) : undefined;
  const gapMs = Math.min(Math.max(Number(body.gapMs) || 0, 0), 20_000);
  // prodPath : EXACTEMENT le chemin des clients, sans nouvel essai après une erreur.
  if (body.prodPath) return json(await runEval('v2', rec, ids, 1, gapMs, opt));
  // Sinon : la clé est partagée avec la prod, on va doucement et on réessaie après un
  // refus « trop de requêtes » (le banc d'essai ne doit pas mesurer le quota).
  const call = async (r: Parameters<typeof callFunction>[0]) => {
    let res = await rec(r);
    for (let i = 1; i <= 4 && !res.ok && res.reason === 'provider_error'; i++) {
      await new Promise((ok) => setTimeout(ok, 8_000 * i));
      res = await rec(r);
    }
    return res;
  };
  const parallel = Math.min(Math.max(Number(body.parallel) || 1, 1), 6);
  return json(await runEval(version, call, ids, parallel, gapMs, opt));
});
