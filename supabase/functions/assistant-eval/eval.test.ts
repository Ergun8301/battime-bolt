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

// ── b47 : l'attente était fausse (le comportement voulu ne pouvait JAMAIS passer) ──
// « retire Kevin de la Villa Dupont vendredi » : Kevin n'a rien vendredi → l'assistant le dit (« Choisissez l’intervention. »)
// et ne propose QUE les cases de Kevin (lot 8). Avant, le cas utilisait `act`, qui répond « pas prête » dès qu'il y a un problème.
const appel = (name: string, args: Record<string, unknown>) => async () => ({ ok: true as const, call: { name, args } });

Deno.test('b47 : la sortie réelle mesurée (supprimer_intervention, Kevin, vendredi, sans planning_id) PASSE', async () => {
  // Avec le chantier dit, et sans : le même résultat.
  for (const args of [{ salarie: 'Kevin', date: '2026-10-02', chantier: 'Villa Dupont' }, { salarie: 'Kevin', date: '2026-10-02' }]) {
    const r = await runEval('v2', appel('supprimer_intervention', args), ['b47']);
    if (r.ok !== 1) throw new Error(`b47 devrait passer : ${JSON.stringify(r.echecs)}`);
  }
});

Deno.test('b47 : le cas reste strict (autre salarié, case choisie à la place de Kevin, autre outil → échec)', async () => {
  const echec = async (name: string, args: Record<string, unknown>) => (await runEval('v2', appel(name, args), ['b47'])).echecs[0]?.why ?? null;
  // Karim a une case vendredi : action prête, ce n'est pas la réponse voulue pour Kevin.
  if (!/problèmes = \[\]/.test(String(await echec('supprimer_intervention', { salarie: 'Karim', date: '2026-10-02' })))) throw new Error('Karim devrait échouer (aucun problème ≠ « Choisissez l’intervention »)');
  // Mauvais outil.
  if (!/attendu supprimer_intervention, obtenu effacer_planning/.test(String(await echec('effacer_planning', { salarie: 'Kevin', du: '2026-10-02', au: '2026-10-02' })))) throw new Error('effacer_planning devrait échouer');
  // Réponse sans action.
  if (!/attendu l'action supprimer_intervention/.test(String(await echec('repondre', { reponse: 'Kevin n’a rien vendredi.' })))) throw new Error('une réponse seule devrait échouer');
});

Deno.test('`act` n’est PAS assoupli : une action « pas prête » reste un échec pour les autres cas (b44, b46 …)', async () => {
  // b44 « retire karim du planning demain » attend la case de Karim ; si le modèle rend Kevin (rien demain → « Choisissez … »), c'est « pas prête ».
  const r = await runEval('v2', appel('supprimer_intervention', { salarie: 'Kevin', date: '2026-10-02' }), ['b44']);
  if (r.ok !== 0 || !/pas prête : Choisissez l’intervention\./.test(String(r.echecs[0]?.why))) throw new Error(`b44 devrait échouer « pas prête » : ${JSON.stringify(r.echecs)}`);
  // Les deux comportements mesurés pour b44 : supprimer_intervention (OK) ou effacer_planning (échec).
  const ok = await runEval('v2', appel('supprimer_intervention', { salarie: 'Karim', date: '2026-10-02' }), ['b44']);
  const ko = await runEval('v2', appel('effacer_planning', { salarie: 'Karim', du: '2026-10-02', au: '2026-10-02' }), ['b44']);
  if (ok.ok !== 1 || ko.ok !== 0 || !/obtenu effacer_planning/.test(String(ko.echecs[0]?.why))) throw new Error('b44 : supprimer_intervention doit passer, effacer_planning échouer');
});
