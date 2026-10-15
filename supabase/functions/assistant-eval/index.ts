// Edge Function : assistant-eval — fait tourner le JEU D'ÉVALUATION de
// l'Assistant BEMEXO sur le VRAI modèle (lot 7), avant / après.
//
// ISOLÉE : aucune donnée d'entreprise (tout est fictif, dans cases.ts), aucune
// lecture ni écriture en base, rien dans les logs. Appelable UNIQUEMENT avec le
// secret « cron » de la base (en-tête x-cron-secret, vérifié par
// public.verify_cron_secret), c'est-à-dire depuis la base elle-même (pg_net) :
// c'est la SEULE de ces fonctions qui garde la clé de service, pour cette seule
// vérification.
//   body : { version: 'v1' | 'v2', ids?: string[], parallel?: number, gapMs?: number, prodPath?: boolean, repeat?: number, aiConfig?: string | object, etape3?: string | object }
//   ids : 200 au plus, tous connus (un id inconnu est refusé : plus de « 80/80 » sans avoir lancé un seul cas) ;
//   repeat : 1 à 5 passes par cas. Les phrases longues peuvent durer jusqu'à 22 s chacune : peu d'ids par appel
//   (4 avec repeat 3, 12 avec repeat 1), un par un (parallel 1).
//
// Lot 6 : TOUS les appels au modèle passent par l'adaptateur partagé
// (_shared/ai-provider.ts) : même réglage AI_CONFIG, mêmes clés (AI_API_KEY, repli GEMINI_API_KEY ;
// ANTHROPIC_API_KEY pour Claude), même routage (un appel, secours après erreur) que les vraies fonctions.
// `aiConfig` (facultatif) remplace AI_CONFIG pour CETTE passe seulement (config.ts) : mesurer Claude sans toucher la production.
// `etape3` (facultatif, étape 3) fait de même pour AI_ETAPE3 : absent = TOUT ÉTEINT (les cas d'avant restent mesurés « éteint »), fourni = le bras B ; invalide → 400 ; les cas « Ouvrir » exigent
// `ouvrir` allumé. Invalide → 400. La réponse porte `config` (fournisseur:modèle de chaque niveau) et `modeles` (qui a servi les cas, secours compris). Les anciens essais « chronomètre » et « sonde » de modèles,
// qui appelaient Gemini en direct, sont retirés. `prodPath` = aucun nouvel essai
// après une erreur (le chemin exact des clients).
import { callFunction } from '../_shared/ai-provider.ts';
import { envEtape3, envEvaluation, resumeEvaluation } from './config.ts';
import { boucleActive, ouvrirActif } from '../_shared/etape3-config.ts';
import { ADMIN_RAW, CASES } from './cases.ts';
import { CASES_BOUCLE } from './cases-boucle.ts';
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
  const body = await req.json().catch(() => ({})) as {
    version?: string; ids?: string[]; parallel?: number; gapMs?: number; prodPath?: boolean; repeat?: number; aiConfig?: unknown; etape3?: unknown;
  };
  const version = body.version === 'v1' ? 'v1' : 'v2';
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : undefined;
  if (ids && ids.length > 200) return json({ error: '200 ids au plus' }, 400);
  const TOUS = [...CASES, ...CASES_BOUCLE];
  const connus = new Set(TOUS.map((c) => c.id));
  const inconnus = ids?.filter((id) => !connus.has(id)) ?? [];
  if (inconnus.length) return json({ error: `ids inconnus : ${inconnus.slice(0, 10).join(', ')}` }, 400);
  // Réglage de la passe : celui de l'environnement, ou `aiConfig` (validé comme en production, sinon 400).
  const ev = envEvaluation(Deno.env, body.aiConfig);
  if (!ev.ok) return json({ error: ev.error }, 400);
  const env = ev.env;
  // Étape 3 : `etape3` (comme `aiConfig`, même méthode de validation, 400 si invalide). Absent = TOUT ÉTEINT, jamais le secret de l'environnement.
  const e3 = envEtape3(body.etape3);
  if (!e3.ok) return json({ error: e3.error }, 400);
  // Un cas « Ouvrir » ne se joue que si l'interrupteur de son côté est allumé : l'inverse fausserait la mesure en silence.
  const faux = (ids ?? []).filter((id) => { const c = TOUS.find((x) => x.id === id); return !!c?.etape3 && !ouvrirActif(e3.env, c.cote, ADMIN_RAW.companyId, ['ouvrir1'], false); });
  if (faux.length) return json({ error: `cas « Ouvrir » sans interrupteur allumé (etape3.ouvrir) : ${faux.slice(0, 10).join(', ')}` }, 400);
  // Même garde pour la boucle : un cas de lecture sans l'interrupteur `boucle` (de son côté) fausserait la mesure en silence.
  const fauxBoucle = (ids ?? []).filter((id) => { const c = TOUS.find((x) => x.id === id); return !!c?.boucle && !boucleActive(e3.env, c.cote, ADMIN_RAW.companyId, ['boucle1'], false); });
  if (fauxBoucle.length) return json({ error: `cas « Lecture » sans interrupteur allumé (etape3.boucle) : ${fauxBoucle.slice(0, 10).join(', ')}` }, 400);
  const config = resumeEvaluation(env, ev.surcharge);
  const gapMs = Math.min(Math.max(Number(body.gapMs) || 0, 0), 20_000);
  const repeat = Math.min(Math.max(Math.floor(Number(body.repeat) || 1), 1), 5);
  // prodPath : EXACTEMENT le chemin des clients, sans nouvel essai après une erreur.
  if (body.prodPath) return json({ config, etape3: e3.allume, ...await runEval('v2', (r) => callFunction(r, env), ids, 1, gapMs, { repeat, etape3: e3.env, env }) });
  // Sinon : la clé est partagée avec la prod, on va doucement et on réessaie après un
  // refus « trop de requêtes » (le banc d'essai ne doit pas mesurer le quota).
  const call = async (r: Parameters<typeof callFunction>[0]) => {
    let res = await callFunction(r, env);
    for (let i = 1; i <= 4 && !res.ok && res.reason === 'provider_error'; i++) {
      await new Promise((ok) => setTimeout(ok, 8_000 * i));
      res = await callFunction(r, env);
    }
    return res;
  };
  const parallel = Math.min(Math.max(Number(body.parallel) || 1, 1), 6);
  return json({ config, etape3: e3.allume, ...await runEval(version, call, ids, parallel, gapMs, { repeat, etape3: e3.env, env }) });
});
