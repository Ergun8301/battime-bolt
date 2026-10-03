// Lot 7 — le banc d'évaluation lui-même, SANS IA (le modèle répond « indisponible ») :
// vérifie que le jeu tourne et donne le score du lecteur local seul.
//   npm run test:assistant-eval
// Avec une clé : GEMINI_API_KEY=… deno run -A supabase/functions/assistant-eval/cli.ts v2
import { runEval } from './run.ts';
import { CASES } from './cases.ts';

Deno.test('Jeu d’évaluation : ≥ 40 phrases, bureau ET salarié', () => {
  if (CASES.length < 40) throw new Error(`${CASES.length} phrases`);
  if (new Set(CASES.map((c) => c.id)).size !== CASES.length) throw new Error('identifiants en double');
  if (!CASES.some((c) => c.cote === 'bureau') || !CASES.some((c) => c.cote === 'salarie')) throw new Error('un côté manque');
});

Deno.test('Banc : tourne sans IA ; ce que le lecteur local traite est juste', async () => {
  const r = await runEval('v2', async () => ({ ok: false, reason: 'provider_error' }));
  const localKo = r.echecs.filter((e) => e.via === 'local');
  console.log(`Sans IA : ${r.ok}/${r.total} (${r.pct} %) — le reste passe par le modèle.`);
  if (localKo.length) throw new Error(`Lecteur local faux :\n${localKo.map((e) => `${e.id} ${e.phrase} → ${e.why}`).join('\n')}`);
});
