// Tests de l'assistant qui AGIT (lot 3 bis) : `npm run test:assistant-actions` (Deno).
// L'IA est SIMULÉE : on vérifie la chaîne complète « appel de fonction →
// brouillon contrôlé », pour chaque action de la liste blanche.
import { callFunction } from './ai-provider.ts';
import {
  ASSISTANT_FUNCTIONS, actionPrompt, addDays, buildActionContext, checkAction, findGuide, fromFunctionCall,
  guideForPrompt, handleActionLocally, mondayOf, prepare, proposeWeek, summarize, type ActionContext,
} from './assistant-actions-core.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
const TODAY = '2026-09-30'; // mercredi
const MON = mondayOf(TODAY), NEXT = addDays(MON, 7);
const CTX: ActionContext = {
  today: TODAY,
  salaries: [
    { id: 'u-karim', prenom: 'Karim', nom: 'Benali', role: 'worker' },
    { id: 'u-sofia', prenom: 'Sofia', nom: 'Rossi', role: 'lead' },
    { id: 'u-lucas', prenom: 'Lucas', nom: 'Petit', role: 'worker' },
    { id: 'u-lucie', prenom: 'Lucie', nom: 'Petit', role: 'worker' },
    { id: 'u-boss', prenom: 'Paul', nom: 'Patron', role: 'admin' },
  ],
  chantiers: [
    { id: 'w-dupont', nom: 'Villa Dupont', ville: 'Lyon' },
    { id: 'w-martin', nom: 'Bureau Martin', ville: 'Villeurbanne' },
  ],
  planning: [
    ...[0, 1, 2, 3, 4].map((i) => ({ user_id: 'u-karim', date: addDays(MON, i), worksite_id: 'w-dupont', absence: null })),
    ...[0, 1].map((i) => ({ user_id: 'u-sofia', date: addDays(MON, i), worksite_id: 'w-martin', absence: null })),
    { user_id: 'u-sofia', date: NEXT, worksite_id: null, absence: 'conge' },
    { user_id: 'u-karim', date: addDays(NEXT, 1), worksite_id: 'w-martin', absence: null },
  ],
  congesEnAttente: [{ user_id: 'u-sofia', du: addDays(NEXT, 4), au: addDays(NEXT, 4) }],
};

/** Gemini simulé : renvoie l'appel de fonction voulu, et garde la requête. */
function fakeGemini(name: string, args: Record<string, unknown>) {
  const seen: { url?: string; init?: RequestInit } = {};
  const fetchImpl = (url: string, init: RequestInit) => {
    seen.url = url; seen.init = init;
    return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }] })));
  };
  return { seen, fetchImpl };
}
const env = { get: (k: string) => (k === 'GEMINI_API_KEY' ? 'AQ.test' : undefined) };

async function viaAi(name: string, args: Record<string, unknown>, entries = [] as { id: string; chantier: string; debut: string; fin: string }[]) {
  const f = fakeGemini(name, args);
  const r = await callFunction({ prompt: actionPrompt(CTX, '{}', guideForPrompt(), 'x'), functions: ASSISTANT_FUNCTIONS }, env, f.fetchImpl);
  if (!r.ok) throw new Error(`appel refusé : ${r.reason}`);
  return { reply: fromFunctionCall(r.call.name, r.call.args, CTX, entries), seen: f.seen };
}

Deno.test('Appel de fonctions : liste blanche, mode ANY, clé en en-tête', async () => {
  const { seen } = await viaAi('repondre', { reponse: 'ok' });
  const body = JSON.parse(String(seen.init!.body));
  eq(body.toolConfig.functionCallingConfig.mode, 'ANY', 'le modèle doit appeler une fonction');
  eq(body.tools[0].functionDeclarations.map((f: { name: string }) => f.name),
    ['repondre', 'inviter_salarie', 'creer_chantier', 'poser_absence', 'affecter_planning', 'planning_semaine', 'corriger_pointage'], 'liste blanche exacte');
  if (JSON.stringify(body).match(/supprim|delete/i) && !JSON.stringify(body).includes('Jamais de suppression')) throw new Error('fonction de suppression exposée');
  eq((seen.init!.headers as Record<string, string>)['x-goog-api-key'], 'AQ.test', 'clé en en-tête');
  const bad = await callFunction({ prompt: '', functions: ASSISTANT_FUNCTIONS }, env, fakeGemini('supprimer_salarie', {}).fetchImpl);
  eq(bad, { ok: false, reason: 'bad_response' }, 'fonction hors liste → refusée');
});

Deno.test('1. Inviter un salarié : préparé, contrôlé', async () => {
  const { reply } = await viaAi('inviter_salarie', { prenom: 'Marc', nom: 'Durand', email: 'Marc.Durand@exemple.fr', telephone: '0600000000' });
  const a = reply.action!;
  eq([a.draft.type, a.problems], ['inviter_salarie', []], 'prêt à confirmer');
  eq((a.draft as { email: string }).email, 'marc.durand@exemple.fr', 'email en minuscules');
  eq(checkAction({ ...a.draft, email: 'pas-un-email' } as never, CTX).length, 1, 'email invalide → bloqué');
  eq(summarize(a.draft, CTX), 'Inviter Marc Durand (marc.durand@exemple.fr)', 'résumé pour le journal');
});

Deno.test('2. Créer un client / chantier', async () => {
  const { reply } = await viaAi('creer_chantier', { nom_client: 'Maison Garnier', ville: 'Caluire' });
  eq(reply.action!.problems, [], 'prêt');
  const dup = prepare('creer_chantier', { nom_client: 'villa dupont' }, CTX)!;
  eq(dup.problems, ['« villa dupont » existe déjà.'], 'doublon signalé');
});

Deno.test('3. Poser une absence', async () => {
  const { reply } = await viaAi('poser_absence', { salarie: 'Karim', type: 'maladie', du: '2026-10-01', au: '2026-10-03' });
  const d = reply.action!.draft as { user_id: string; absence_type: string };
  eq([d.user_id, d.absence_type, reply.action!.problems], ['u-karim', 'maladie', []], 'nom → id, type gardé');
  eq(prepare('poser_absence', { salarie: 'Petit', type: 'conge', du: '2026-10-01' }, CTX)!.problems, ['Choisissez le salarié.'], '« Petit » ambigu → à choisir, jamais deviné');
  eq(prepare('poser_absence', { salarie: 'Karim', type: 'conge', du: '2026-10-05', au: '2026-10-01' }, CTX)!.problems, ['La date de fin est avant le début.'], 'dates à l’envers');
});

Deno.test('4. Affecter au planning', async () => {
  const { reply } = await viaAi('affecter_planning', { salarie: 'Lucas', chantier: 'Villa Dupont', dates: ['2026-10-01', '2026-10-02'] });
  const d = reply.action!.draft as { user_id: string; worksite_id: string; dates: string[] };
  eq([d.user_id, d.worksite_id, d.dates, reply.action!.problems], ['u-lucas', 'w-dupont', ['2026-10-01', '2026-10-02'], []], 'prêt');
  eq(prepare('affecter_planning', { salarie: 'Lucas', chantier: 'Chantier Inventé', dates: ['2026-10-01'] }, CTX)!.problems, ['Choisissez le chantier.'], 'chantier inconnu → jamais inventé');
  eq(prepare('affecter_planning', { salarie: 'Sofia', chantier: 'Villa Dupont', dates: [NEXT] }, CTX)!.problems, ['Ce salarié est absent l’un de ces jours.'], 'jour d’absence signalé');
});

Deno.test('5. Planning de la semaine prochaine : congés, déjà planifié, chantier habituel', () => {
  const a = proposeWeek(CTX, NEXT);
  const d = a.draft as { lignes: { user_id: string; date: string; worksite_id: string | null }[]; notes: string[] };
  const of = (u: string) => d.lignes.filter((l) => l.user_id === u);
  eq(of('u-karim').length, 4, 'Karim : 5 jours − 1 déjà planifié');
  eq(of('u-karim').every((l) => l.worksite_id === 'w-dupont'), true, 'Karim : son chantier habituel');
  if (of('u-karim').some((l) => l.date === addDays(NEXT, 1))) throw new Error('jour déjà planifié touché');
  eq(of('u-sofia').map((l) => l.date), [addDays(NEXT, 1), addDays(NEXT, 2), addDays(NEXT, 3)], 'Sofia : ni son congé, ni le congé demandé');
  eq(of('u-sofia').every((l) => l.worksite_id === 'w-martin'), true, 'Sofia : Bureau Martin');
  eq(of('u-lucas').every((l) => l.worksite_id === null), true, 'Lucas : pas d’habitude → à choisir');
  eq(of('u-boss').length, 0, 'le bureau n’est pas planifié');
  if (!d.notes.some((n) => n.includes('congé demandé en attente'))) throw new Error('congé en attente non signalé');
  eq(a.problems, [], 'applicable');
  eq(handleActionLocally('Faire le planning de la semaine prochaine', CTX)!.action!.draft.type, 'planning_semaine', 'suggestion → sans IA');
});

Deno.test('6. Corriger un pointage', async () => {
  const one = [{ id: 'e1', chantier: 'Villa Dupont', debut: '07:30', fin: '17:00' }];
  const { reply } = await viaAi('corriger_pointage', { salarie: 'Karim', date: '2026-09-29', debut: '7h30', fin: '16h' }, one);
  const d = reply.action!.draft as { entry_id: string; debut: string; fin: string };
  eq([d.entry_id, d.debut, d.fin, reply.action!.problems], ['e1', '07:30', '16:00', []], 'une seule ligne → choisie');
  const two = [...one, { id: 'e2', chantier: 'Bureau Martin', debut: '13:00', fin: '17:00' }];
  eq(prepare('corriger_pointage', { salarie: 'Karim', date: '2026-09-29', debut: '8:00', fin: '12:00' }, CTX, two)!.problems, ['Choisissez la ligne à corriger.'], 'plusieurs lignes → à choisir');
  eq(prepare('corriger_pointage', { salarie: 'Karim', date: '2026-09-29', debut: '8:00', fin: '12:00' }, CTX, [])!.problems, ['Aucune heure envoyée ce jour-là à corriger.'], 'rien à corriger');
});

Deno.test('Guide : « comment… » → 3 étapes + bouton, jamais « je n’ai pas accès »', () => {
  const r = handleActionLocally('Comment j’ajoute un salarié ?', CTX)!;
  eq(r.answer.split('\n').length, 4, 'titre + 3 étapes');
  eq(r.links, [{ label: 'Nouveau salarié', action: 'nouveau_salarie' }], '« M’y emmener »');
  eq(findGuide('comment je cloture le mois')!.lien, 'export', 'clôture → écran Exporter');
  eq(findGuide('où je change le logo')!.lien, 'reglages', 'logo → Réglages');
  const refus = fromFunctionCall('repondre', { reponse: 'Je n’ai pas accès à la création de salariés.' }, CTX);
  if (/pas acc[eè]s/i.test(refus.answer)) throw new Error('refus non remplacé');
  const lien = fromFunctionCall('repondre', { reponse: 'ok', liens: ['couts', 'inconnu', 'salarie'], salarie_id: 'u-karim' }, CTX);
  eq(lien.links.map((l) => l.action), ['couts', 'salarie:u-karim'], 'liens hors liste écartés');
  eq(fromFunctionCall('repondre', { reponse: 'ok', liens: ['salarie'], salarie_id: 'u-intrus' }, CTX).links, [], 'id inconnu écarté');
});

Deno.test('Suggestions de démarrage : action directe, sans IA', () => {
  eq(handleActionLocally('Ajouter un salarié', CTX)!.action!.draft.type, 'inviter_salarie', 'carte vide à remplir');
  eq(handleActionLocally('Poser un congé', CTX)!.action!.draft.type, 'poser_absence', 'carte d’absence');
  eq(handleActionLocally('Qui n’a pas pointé hier ?', CTX), null, 'question chiffrée → IA');
  eq(handleActionLocally('ajoute Marc Durand marc@x.fr', CTX), null, 'phrase détaillée → IA');
});

Deno.test('Contexte : jamais une autre entreprise, jamais un salarié archivé', () => {
  const c = buildActionContext({
    companyId: 'c1', today: TODAY,
    users: [
      { id: 'a', company_id: 'c1', first_name: 'A', last_name: 'A', role: 'worker', is_active: true },
      { id: 'b', company_id: 'c2', first_name: 'B', last_name: 'B', role: 'worker', is_active: true },
      { id: 'z', company_id: 'c1', first_name: 'Z', last_name: 'Z', role: 'worker', is_active: false },
    ],
    worksites: [{ id: 'w1', company_id: 'c1', client_name: 'X', city: null }, { id: 'w2', company_id: 'c2', client_name: 'Secret', city: null }],
    planning: [{ user_id: 'b', company_id: 'c2', work_date: TODAY, worksite_id: 'w2', absence_type: null }],
    leaves: [],
  });
  eq([c.salaries.map((s) => s.id), c.chantiers.map((w) => w.id), c.planning.length], [['a'], ['w1'], 0], 'filtré');
  if (JSON.stringify(c).match(/secu|social|payroll|bulletin|taux/i)) throw new Error('paie dans le contexte');
});
