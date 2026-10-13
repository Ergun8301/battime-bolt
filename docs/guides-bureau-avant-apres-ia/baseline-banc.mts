// Le banc d'évaluation (sans IA) : toute la sortie hors durées.
//   npx -y deno@2 run -A docs/guides-bureau-avant-apres-ia/baseline-banc.ts <racine du dépôt à mesurer>
const root = Deno.args[0] ?? '.';
const { runEval } = await import(`${Deno.cwd()}/${root}/supabase/functions/assistant-eval/run.ts`.replace(/\/\.\//, '/'));
const r = await runEval('v2', async () => ({ ok: false, reason: 'provider_error' }));
const { temps: _t, ...reste } = r as Record<string, unknown>;
console.log(JSON.stringify(JSON.parse(JSON.stringify(reste, (k, v) => (/^(ms|maxMs|temps|duree|latence)/i.test(k) ? undefined : v))), null, 1));
