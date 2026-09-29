// Edge Function : assistant-eval — fait tourner le JEU D'ÉVALUATION de
// l'Assistant BEMEXO sur le VRAI modèle (lot 7), avant / après.
//
// ISOLÉE : aucune donnée d'entreprise (tout est fictif, dans cases.ts), aucune
// lecture ni écriture en base, rien dans les logs. Appelable UNIQUEMENT avec le
// secret « cron » de la base (en-tête x-cron-secret, vérifié par
// public.verify_cron_secret), c'est-à-dire depuis la base elle-même (pg_net).
//   body : { version: 'v1' | 'v2', ids?: string[] }
import { callFunction, DEFAULT_ACTION_MODEL } from '../_shared/ai-provider.ts';
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

// Quels modèles « flash » la clé voit-elle, et répondent-ils ? (noms + codes seulement)
async function probe() {
  const key = Deno.env.get('GEMINI_API_KEY') ?? '';
  const base = 'https://generativelanguage.googleapis.com/v1beta/models';
  const list = await fetch(`${base}?pageSize=200`, { headers: { 'x-goog-api-key': key } }).then((r) => r.json()).catch(() => ({})) as { models?: { name: string }[] };
  const names = (list.models ?? []).map((m) => m.name.replace('models/', '')).filter((n) => /flash|pro/.test(n) && !/tts|image|audio|live|embedding/.test(n));
  const tries = [];
  for (const m of names.filter((n) => /^gemini-(2\.5|3)/.test(n)).slice(0, 12)) {
    const r = await fetch(`${base}/${m}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Réponds juste OK.' }] }] }),
    }).catch(() => null);
    const err = r && !r.ok ? await r.json().then((b: { error?: { status?: string; message?: string } }) => `${b.error?.status ?? ''} ${(b.error?.message ?? '').slice(0, 160)}`).catch(() => '') : '';
    tries.push({ model: m, status: r?.status ?? 0, err });
  }
  return { models: names, tries, env: { AI_MODEL: Deno.env.get('AI_MODEL') ?? null, AI_ACTION_MODEL: Deno.env.get('AI_ACTION_MODEL') ?? null } };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const secret = req.headers.get('x-cron-secret') ?? '';
  if (!secret) return json({ error: 'Non autorisé' }, 401);
  if (!(await secretOk(secret))) return json({ error: 'Non autorisé' }, 401);
  const body = await req.json().catch(() => ({})) as {
    version?: string; ids?: string[]; parallel?: number; gapMs?: number; probe?: boolean; actionModel?: string; lightModel?: string;
  };
  if (body.probe) return json(await probe());
  const version = body.version === 'v1' ? 'v1' : 'v2';
  const model = (m?: string) => (m && /^[a-z0-9.-]{3,60}$/.test(m) ? m : '');
  const light = model(body.lightModel) || Deno.env.get('AI_MODEL') || 'gemini-3.1-flash-lite';
  const strong = model(body.actionModel) || Deno.env.get('AI_ACTION_MODEL') || '';
  // v1 = modèle léger seul (comme avant le lot 7) ; v2 = modèle fort pour les actions.
  const env = {
    get: (k: string) => {
      if (k === 'AI_MODEL') return light;
      if (k === 'AI_ACTION_MODEL') return version === 'v1' ? light : (strong || undefined);
      return Deno.env.get(k);
    },
  };
  // La clé est partagée avec la prod : on va doucement et on réessaie après un
  // refus « trop de requêtes » (le banc d'essai ne doit pas mesurer le quota).
  // Mesure honnête : une action part TOUJOURS sur le modèle fort (pas de repli
  // silencieux sur le léger quand le quota refuse), une question sur le léger.
  const pinned = (m: string) => ({ get: (k: string) => (k === 'AI_MODEL' || k === 'AI_ACTION_MODEL' ? m : env.get(k)) });
  const strongEnv = pinned(env.get('AI_ACTION_MODEL') || DEFAULT_ACTION_MODEL), lightEnv = pinned(light);
  const call = async (r: Parameters<typeof callFunction>[0]) => {
    const e = r.kind === 'action' && version === 'v2' ? strongEnv : lightEnv;
    let res = await callFunction(r, e);
    for (let i = 1; i <= 4 && !res.ok && res.reason === 'provider_error'; i++) {
      await new Promise((ok) => setTimeout(ok, 8_000 * i));
      res = await callFunction(r, e);
    }
    return res;
  };
  const parallel = Math.min(Math.max(Number(body.parallel) || 1, 1), 6);
  const gapMs = Math.min(Math.max(Number(body.gapMs) || 0, 0), 20_000);
  const result = await runEval(version, call, Array.isArray(body.ids) ? body.ids.slice(0, 80) : undefined, parallel, gapMs);
  return json(result);
});
