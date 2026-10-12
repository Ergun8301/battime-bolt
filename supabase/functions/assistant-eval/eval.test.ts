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

// ── Dates : les mauvaises sorties MESURÉES sur le vrai modèle (jour passé pour un nom de jour seul) sont corrigées en code ──
// Aujourd'hui du jeu = jeudi 2026-10-01. b36 : du=2026-09-28 au=2026-09-30 (au lieu de 2026-10-05 → 2026-10-07) ;
// b06 : date=2026-09-25 nouvelle_date=2026-09-28 (au lieu de 2026-10-02 → 2026-10-05).
Deno.test('b36 et b06 : les dates passées renvoyées par le modèle sont ramenées à la prochaine occurrence', async () => {
  const b36 = await runEval('v2', appel('effacer_planning', { salarie: 'Karim', du: '2026-09-28', au: '2026-09-30' }), ['b36']);
  const b06 = await runEval('v2', appel('modifier_intervention', { salarie: 'Karim', date: '2026-09-25', nouvelle_date: '2026-09-28' }), ['b06']);
  if (b36.ok !== 1 || b06.ok !== 1) throw new Error(`dates : ${JSON.stringify([...b36.echecs, ...b06.echecs])}`);
  // Les bonnes dates restent bonnes.
  const bon = await runEval('v2', appel('effacer_planning', { salarie: 'Karim', du: '2026-10-05', au: '2026-10-07' }), ['b36']);
  if (bon.ok !== 1) throw new Error('b36 avec les bonnes dates devrait passer');
  // Une date passée que la phrase ne désigne pas n'est PAS réécrite en silence : le cas échoue (le contrôle reste strict).
  const faux = await runEval('v2', appel('effacer_planning', { salarie: 'Karim', du: '2026-09-29', au: '2026-09-30' }), ['b36']);
  if (faux.ok !== 0) throw new Error('mardi→mercredi passés pour « lundi à mercredi » : doit échouer (ce n’est pas le lundi)');
});
