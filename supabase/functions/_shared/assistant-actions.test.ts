// Tests de l'assistant qui AGIT (lot 3 bis) : `npm run test:assistant-actions` (Deno).
// L'IA est SIMULÉE : on vérifie la chaîne complète « appel de fonction →
// brouillon contrôlé », pour chaque action de la liste blanche.
import { callFunction } from './ai-provider.ts';
import {
  ASSISTANT_FUNCTIONS, actionPrompt, addDays, buildActionContext, checkAction, findGuide, fromFunctionCall,
  guideForPrompt, handleActionLocally, mondayOf, prepare, proposeWeek, questionFor, summarize, type ActionContext,
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
    ['repondre', 'inviter_salarie', 'creer_chantier', 'ranger_document', 'poser_absence', 'affecter_planning', 'planning_semaine', 'corriger_pointage',
      'modifier_intervention', 'repondre_conge', 'lever_reserve', 'ajouter_depense', 'modifier_client', 'archiver_client', 'changer_role',
      'relancer_invitation', 'envoyer_rappel', 'cloturer_mois', 'attribuer_client', 'ajouter_habilitation', 'modifier_salarie', 'archiver_salarie',
      'cout_reel', 'modifier_reglages',
      // Lot 8 : revenir en arrière — jamais un client, un chantier ni un salarié (ils s'archivent).
      'supprimer_intervention', 'effacer_planning', 'supprimer_absence', 'supprimer_document', 'modifier_document',
      'supprimer_depense', 'modifier_depense', 'supprimer_habilitation', 'modifier_habilitation', 'annuler_invitation'], 'liste blanche exacte (lot 8 : effacer, sans client/chantier/salarié ni paiement)');
  const names = body.tools[0].functionDeclarations.map((f: { name: string }) => f.name).join(' ');
  if (/supprimer_(client|chantier|salarie)|delete|paiement|stripe|abonnement/i.test(names)) throw new Error('fonction interdite exposée');
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
  eq(dup.problems, ['« Villa Dupont » existe déjà.'], 'doublon signalé (nom nettoyé : majuscules)');
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
  eq(of('u-lucas').every((l) => l.worksite_id === 'w-dupont'), true, 'Lucas : sans habitude ni pointage → chantier le plus utilisé');
  if (!d.notes.some((n) => n.startsWith('Lucas Petit : Villa Dupont · Lyon (chantier le plus utilisé'))) throw new Error('repli non expliqué');
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

// ═══ 📎 Pièces jointes (bureau) ═════════════════════════════════════════════
import { readAttachment } from './ai-provider.ts';

const CTX2: ActionContext = { ...CTX, chantiers: [...CTX.chantiers, { id: 'w-dupont2', nom: 'Dupont', ville: 'Viriat' }] };
const PDF = { mime: 'application/pdf', base64: btoa('%PDF-1.4 faux bulletin') };

Deno.test('📎 Bulletin → invitation pré-remplie + paie, JAMAIS le n° de sécu', async () => {
  const f = fakeGemini('inviter_salarie', {
    prenom: 'Marc', nom: 'Durand 1 85 05 78 006 084 36', email: 'marc@exemple.fr', date_entree: '2026-09-01', contrat: 'CDI',
    taux_horaire: 14.5, heures_hebdo: 35, bulletin_mois: '2026-09', bulletin_brut: 2450, bulletin_cout_employeur: 3480, bulletin_heures_payees: 151.67,
    numero_secu: '185057800608436',
  });
  const r = await callFunction({ prompt: 'x', functions: ASSISTANT_FUNCTIONS, file: PDF }, env, f.fetchImpl);
  const sent = JSON.parse(String(f.seen.init!.body));
  eq(sent.contents[0].parts[1].inline_data.mime_type, 'application/pdf', 'le fichier part au modèle');
  if (!r.ok) throw new Error('appel refusé');
  const a = fromFunctionCall(r.call.name, r.call.args, CTX).action!;
  const d = a.draft as Record<string, unknown>;
  eq([d.nom, d.date_entree, d.contrat, d.taux_horaire, d.heures_hebdo], ['Durand', '2026-09-01', 'CDI', '14.5', '35'], 'champs de paie repris');
  eq(d.bulletin, { mois: '2026-09', brut: '2450', cout_employeur: '3480', heures_payees: '151.67' }, 'chiffres du coût réel proposés');
  if (/185057800608436|1 85 05|secu/i.test(JSON.stringify(d))) throw new Error('n° de sécu dans le brouillon');
  if (JSON.stringify(ASSISTANT_FUNCTIONS).match(/"(numero_)?secu|nir"/i)) throw new Error('champ n° de sécu exposé au modèle');
  eq(a.problems, [], 'prêt à confirmer');
});

Deno.test('📎 Devis → client + budget', async () => {
  const { reply } = await viaAi('creer_chantier', { nom_client: 'Maison Garnier', ville: 'Caluire', adresse: '12 rue des Lilas', budget_montant: 18400, budget_heures: 160 });
  const d = reply.action!.draft as Record<string, unknown>;
  eq([d.nom_client, d.adresse, d.budget_montant, d.budget_heures, reply.action!.problems], ['Maison Garnier', '12 rue des Lilas', '18400', '160', []], 'client et budget');
});

Deno.test('📎 Ranger un document : chantier ambigu → liste, jamais d’invention', () => {
  const amb = fromFunctionCall('ranger_document', { chantier: 'Dupont' }, CTX2).action!;
  eq([(amb.draft as { worksite_id: null }).worksite_id, amb.problems], [null, ['Choisissez le chantier.']], '« Dupont » : 2 chantiers');
  const ok = fromFunctionCall('ranger_document', { chantier: 'Dupont Viriat' }, CTX2).action!;
  eq([(ok.draft as { worksite_id: string }).worksite_id, ok.problems], ['w-dupont2', []], '« Dupont Viriat » : trouvé');
  eq(fromFunctionCall('ranger_document', { chantier: 'Chantier Inconnu' }, CTX2).action!.problems, ['Choisissez le chantier.'], 'inconnu → à choisir');
});

Deno.test('📎 Fichier reçu par le serveur : types refusés, taille, rien dans les logs', async () => {
  eq(readAttachment(undefined), { ok: true, file: undefined }, 'pas de fichier : normal');
  eq(readAttachment({ mime: 'text/plain', base64: 'aGVsbG8=' }).ok, false, 'texte refusé');
  eq(readAttachment({ mime: 'application/zip', base64: 'aGVsbG8=' }).ok, false, 'zip refusé');
  eq(readAttachment({ mime: 'image/heic', base64: 'aGVsbG8=' }).ok, true, 'HEIC accepté');
  eq(readAttachment({ mime: 'image/jpeg', base64: 'A'.repeat(12 * 1024 * 1024) }).ok, false, 'trop lourd refusé');
  const logs: string[] = [];
  const orig = console.error;
  console.error = (...x: unknown[]) => { logs.push(x.map(String).join(' ')); };
  try {
    await callFunction({ prompt: 'x', functions: ASSISTANT_FUNCTIONS, file: PDF }, env, () => Promise.resolve(new Response('err', { status: 500 })));
  } finally { console.error = orig; }
  if (logs.some((l) => l.includes(PDF.base64) || l.includes('bulletin'))) throw new Error('contenu du fichier dans les logs');
});

Deno.test('5 bis. Planning proposé sans habitude : ordre des replis, « Pas de chantier » en dernier', () => {
  const base: ActionContext = {
    today: TODAY,
    salaries: [
      { id: 'a', prenom: 'Ali', nom: 'A', role: 'worker' },
      { id: 'b', prenom: 'Bea', nom: 'B', role: 'worker' },
      { id: 'c', prenom: 'Cyr', nom: 'C', role: 'worker' },
    ],
    chantiers: [
      { id: 'w-macon', nom: 'Mister Grill Kebab', ville: 'Mâcon' },
      { id: 'w-bourg', nom: 'Mister Grill Kebab', ville: 'Bourg-en-Bresse' },
      { id: 'w-autre', nom: 'Autre', ville: null },
    ],
    planning: [], congesEnAttente: [], pointages: [],
  };
  const site = (ctx: ActionContext, u: string) => {
    const l = (proposeWeek(ctx, NEXT).draft as { lignes: { user_id: string; worksite_id: string | null }[] }).lignes.filter((x) => x.user_id === u);
    return Array.from(new Set(l.map((x) => x.worksite_id)));
  };
  // 2) dernier chantier pointé (cas réel : pointé aujourd'hui sur Mâcon, rien au planning)
  const p2 = { ...base, pointages: [
    { user_id: 'a', date: addDays(TODAY, -8), worksite_id: 'w-bourg' },
    { user_id: 'a', date: addDays(TODAY, -1), worksite_id: 'w-macon' },
    { user_id: 'a', date: TODAY, worksite_id: 'w-macon' },
  ] };
  eq(site(p2, 'a'), ['w-macon'], 'dernier pointage (le plus récent)');
  const notes2 = (proposeWeek(p2, NEXT).draft as { notes: string[] }).notes;
  if (!notes2.includes('Ali A : Mister Grill Kebab · Mâcon (dernier chantier pointé), à vérifier.')) throw new Error(`note : ${notes2}`);
  // 3) sans rien pour Bea : chantier le plus utilisé de l'entreprise
  eq(site(p2, 'b'), ['w-macon'], 'chantier le plus utilisé');
  // 1) le planning de la semaine en cours passe avant le pointage
  const p1 = { ...p2, planning: [{ user_id: 'a', date: addDays(MON, 1), worksite_id: 'w-bourg', absence: null }] };
  eq(site(p1, 'a'), ['w-bourg'], 'planning de la semaine avant le pointage');
  // chantier archivé : jamais proposé
  const archived = { ...base, chantiers: base.chantiers.filter((c) => c.id !== 'w-macon'), pointages: [{ user_id: 'a', date: TODAY, worksite_id: 'w-macon' }] };
  eq(site(archived, 'a'), [null], 'chantier archivé ignoré');
  // dernier recours : rien nulle part → « Pas de chantier » + explication
  const none = proposeWeek(base, NEXT).draft as { lignes: { worksite_id: string | null }[]; notes: string[] };
  eq(none.lignes.every((l) => l.worksite_id === null), true, 'rien de connu → à choisir');
  if (!none.notes.every((n) => n.includes('aucun chantier trouvé'))) throw new Error('dernier recours non expliqué');
  // l'IA donne une semaine fausse (année passée) → semaine prochaine
  eq((prepare('planning_semaine', { semaine_du: '2025-10-06' }, p2)!.draft as { semaine_du: string }).semaine_du, NEXT, 'semaine fausse corrigée');
  eq((prepare('planning_semaine', { semaine_du: addDays(NEXT, 7) }, p2)!.draft as { semaine_du: string }).semaine_du, addDays(NEXT, 7), 'semaine demandée gardée');
});

Deno.test('Contexte : pointages de l’entreprise seulement, pointage en cours compté', () => {
  const c = buildActionContext({
    companyId: 'c1', today: TODAY,
    users: [{ id: 'a', company_id: 'c1', first_name: 'A', last_name: 'A', role: 'worker', is_active: true }],
    worksites: [{ id: 'w1', company_id: 'c1', client_name: 'X', city: null }],
    planning: [], leaves: [],
    entries: [
      { user_id: 'a', company_id: 'c1', work_date: '2026-09-28', worksite_id: 'w1' },
      { user_id: 'b', company_id: 'c2', work_date: '2026-09-28', worksite_id: 'w2' },
      { user_id: 'a', company_id: 'c1', work_date: '2026-09-27', worksite_id: null },
    ],
    sessions: [{ user_id: 'a', company_id: 'c1', worksite_id: 'w1', started_at: '2026-09-30T06:00:00Z' }],
  });
  eq(c.pointages, [{ user_id: 'a', date: '2026-09-28', worksite_id: 'w1' }, { user_id: 'a', date: TODAY, worksite_id: 'w1' }], 'filtré');
});

Deno.test('Lot 7 : un client doit être NOMMÉ — « à Lyon » reste un lieu', async () => {
  const { ADMIN_RAW, ME } = await import('../assistant-eval/cases.ts');
  const ctx = buildActionContext(ADMIN_RAW as Parameters<typeof buildActionContext>[0]);
  ctx.me = ME;
  const plan = (demande: string, args: Record<string, unknown>) => {
    ctx.demande = demande;
    const r = fromFunctionCall('affecter_planning', args, ctx);
    return r.action!.draft as { worksite_id: string | null; note: string };
  };
  const lyon = plan('Rajoute-moi une intervention à Lyon aujourd’hui de 14h à 18h', { salarie: 'moi', chantier: 'Villa Dupont', dates: ['2026-10-01'] });
  eq([lyon.worksite_id, lyon.note], ['w-autre', 'Intervention à Lyon'], 'le modèle a traduit Lyon en client : on revient au lieu');
  eq(plan('mets kevin sur mister grill macon lundi', { salarie: 'Kevin', chantier: 'Mister Grill Kebab', lieu: 'Mâcon', dates: ['lundi'] }).worksite_id, 'w-mgk-macon', 'client + ville départagent');
  eq(plan('mets kevin sur mister grill lundi', { salarie: 'Kevin', chantier: 'Mister Grill Kebab', dates: ['lundi'] }).worksite_id, null, 'ambigu : on demande, jamais « Autre »');
  eq(plan('Karim demain chez Martin', { salarie: 'Karim', chantier: 'Bureau Martin', dates: ['demain'] }).worksite_id, 'w-martin', 'client nommé');
});

Deno.test('Lot 8 : un salarié nommé → SEULEMENT ses cases ; rien ce jour-là → on le dit + ses cases proches', () => {
  // « Ergun K. » : l'initiale K ne doit plus voler « Karim ».
  const ctx: ActionContext = {
    ...CTX,
    salaries: [...CTX.salaries, { id: 'u-ergun', prenom: 'Ergun', nom: 'K.', role: 'admin' }],
    planning: [
      ...[0, 1, 2].map((i) => ({ id: `k${i}`, user_id: 'u-karim', date: addDays(MON, i), worksite_id: 'w-dupont', absence: null })),
      ...[0, 1, 2, 3].map((i) => ({ id: `s${i}`, user_id: 'u-sofia', date: addDays(MON, i), worksite_id: 'w-dupont', absence: null })),
    ],
  };
  const jeudi = addDays(MON, 3);
  const r = fromFunctionCall('supprimer_intervention', { salarie: 'Karim', chantier: 'Villa Dupont', date: jeudi }, ctx);
  const d = r.action!.draft as Extract<NonNullable<typeof r.action>['draft'], { type: 'supprimer_intervention' }>;
  eq(d.user_id, 'u-karim', 'Karim reconnu malgré « Ergun K. »');
  eq(d.planning_id, null, 'rien ce jeudi : on ne retire rien tout seul');
  eq(d.choix.map((c) => c.nom), ['Karim', 'Karim', 'Karim'], 'jamais les cases de Sofia');
  eq(d.choix[0].date, addDays(MON, 2), 'la plus proche en premier');
  const q = questionFor(d, r.action!.problems, ctx)!;
  if (!/^Karim n’a rien jeudi 1 octobre\. Ses cases les plus proches/.test(q.text)) throw new Error(q.text);
  // Rien du tout au planning : une phrase.
  const r2 = fromFunctionCall('supprimer_intervention', { salarie: 'Lucas', date: jeudi }, ctx);
  eq(r2.action!.problems, ['Lucas n’a rien jeudi 1 octobre, ni aucun autre jour au planning.'], 'Lucas sans aucune case');
  // Le jour dit existe : retiré directement.
  const r3 = fromFunctionCall('supprimer_intervention', { salarie: 'Karim', date: addDays(MON, 1) }, ctx);
  eq((r3.action!.draft as typeof d).planning_id, 'k1', 'la case de Karim ce jour-là');
});
