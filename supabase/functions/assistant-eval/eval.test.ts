// Lot 7 — le banc d'évaluation lui-même, SANS IA (le modèle répond « indisponible ») :
// vérifie que le jeu tourne et donne le score du lecteur local seul.
//   npm run test:assistant-eval
// Avec une clé : GEMINI_API_KEY=… deno run -A supabase/functions/assistant-eval/cli.ts v2
import { runEval } from './run.ts';
import { envEvaluation, resumeEvaluation } from './config.ts';
import { callFunction, modeleServi, readConfig, reposReinit } from '../_shared/ai-provider.ts';
import { ADMIN_RAW, CASES, LIVE_VIDE, ME, sansLibellesEcran, WORKER_LIVE, WORKER_RAW, type Outcome } from './cases.ts';
import { actionPrompt, buildActionContext, guideForPrompt, type ActionContext } from '../_shared/assistant-actions-core.ts';
import { buildWorkerSnapshot, workerFunctionPrompt, type WorkerLive, type WorkerSnapshot } from '../_shared/worker-assistant-core.ts';
import { blocHistorique, nettoyerHistorique, sansDemandeRecollee } from '../_shared/assistant-history.ts';
import { detecteTurc } from '../_shared/saisie-profil.ts';
import { workerProfile } from '../_shared/worker-turn.ts';

Deno.test('Jeu d’évaluation : les 80 phrases d’origine (dans l’ordre) + les phrases longues du salarié + les suites de conversation, bureau ET salarié', () => {
  if (new Set(CASES.map((c) => c.id)).size !== CASES.length) throw new Error('identifiants en double');
  if (!CASES.some((c) => c.cote === 'bureau') || !CASES.some((c) => c.cote === 'salarie')) throw new Error('un côté manque');
  const anciens = [...Array.from({ length: 47 }, (_, i) => `b${String(i + 1).padStart(2, '0')}`), ...Array.from({ length: 33 }, (_, i) => `s${String(i + 1).padStart(2, '0')}`)];
  if (JSON.stringify(CASES.slice(0, 80).map((c) => c.id)) !== JSON.stringify(anciens)) throw new Error('les 80 phrases b01–b47, s01–s33 doivent rester en tête, dans l’ordre');
  const longs = CASES.filter((c) => /^(sl|st)\d\d$/.test(c.id));
  const suites = CASES.filter((c) => /^sc\d\d$/.test(c.id));
  if (longs.length < 14 || longs.length !== CASES.length - 80 - suites.length) throw new Error(`${longs.length} phrases longues (au moins 14 ; 31 attendues)`);
  if (longs.filter((c) => c.categorie === 'Long FR').length !== 17 || longs.filter((c) => c.categorie === 'Long TR').length !== 14 || longs.some((c) => c.cote !== 'salarie')) throw new Error('17 « Long FR » et 14 « Long TR », côté salarié');
  // La phrase exacte d'Ergun (retour réel d'un salarié) est le cas sl01.
  const ergun = "Ajoute-moi une intervention. J'ai travaillé aujourd'hui de 8h à midi, puis pause d'1h, puis de 13h à 17h sur un nouveau chantier : prénom Pierrick, nom Dupont, à Montagna 01250, pour la pose d'un store banne.";
  if (CASES.find((c) => c.id === 'sl01')?.phrase !== ergun) throw new Error('sl01 : la phrase exacte d’Ergun');
});

Deno.test('Banc : tourne sans IA ; ce que le lecteur local traite est juste', async () => {
  const r = await runEval('v2', async () => ({ ok: false, reason: 'provider_error' }));
  const localKo = r.echecs.filter((e) => e.via === 'local');
  console.log(`Sans IA : ${r.ok}/${r.total} (${r.pct} %) — le reste passe par le modèle.`);
  if (localKo.length) throw new Error(`Lecteur local faux :\n${localKo.map((e) => `${e.id} ${e.phrase} → ${e.why}`).join('\n')}`);
  // Les 80 phrases d'origine : 31 sont lues par le lecteur local, exactement comme avant.
  const anciens = await runEval('v2', async () => ({ ok: false, reason: 'provider_error' }), CASES.slice(0, 80).map((c) => c.id));
  if (anciens.total - anciens.temps.length !== 31) throw new Error(`${anciens.total - anciens.temps.length} phrases locales sur 80 (31 attendues)`);
});

Deno.test('Phrases longues : JAMAIS le lecteur local (c’est lui qui déformait la phrase d’Ergun), toujours le modèle, en profil long', async () => {
  const vus: { profil?: string; functions: string[]; maxCalls?: number; tier?: string }[] = [];
  const espion = async (req: Parameters<Parameters<typeof runEval>[1]>[0]) => { vus.push({ profil: req.profil, functions: req.functions.map((f) => f.name), maxCalls: req.maxCalls, tier: req.tier }); return { ok: false as const, reason: 'provider_error' as const }; };
  const ids = CASES.filter((c) => /^(sl|st)\d\d$/.test(c.id)).map((c) => c.id);
  const r = await runEval('v2', espion, ids, 1, 0);
  if (r.temps.length !== ids.length || vus.length !== ids.length) throw new Error(`${r.temps.length} phrases sur ${ids.length} sont passées par le modèle`);
  if (vus.some((v) => v.profil !== 'long' || v.maxCalls !== 4 || v.tier !== 'rapide')) throw new Error(`requête : ${JSON.stringify(vus.find((v) => v.profil !== 'long' || v.maxCalls !== 4 || v.tier !== 'rapide'))}`);
  if (r.profils.find((p) => p.profil === 'long')?.n !== ids.length) throw new Error('profil long compté');
  if (r.echecs.some((e) => e.cause !== 'fournisseur')) throw new Error('une erreur du modèle est une cause « fournisseur »');
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

// ── Phrases longues : le MÊME chemin que la production, et des contrôles qui mordent ──
const appels = (...calls: { name: string; args: Record<string, unknown> }[]) => async () => ({ ok: true as const, call: calls[0], calls });
const heuresErgun = (lignes: unknown[], bloc: unknown = { nom: 'Pierrick Dupont', adresse: '', code_postal: '01250', ville: 'Montagna', description: 'pose d’un store banne' }) =>
  ({ name: 'declarer_heures', args: { date: '2026-10-01', lignes, ...(bloc ? { nouveau_chantier: bloc } : {}) } });
const L = (debut: string, fin: string, extra: Record<string, unknown> = {}) => ({ chantier: 'nouveau', debut, fin, ...extra });
const passe = async (id: string, ...calls: { name: string; args: Record<string, unknown> }[]) => (await runEval('v2', appels(...calls), [id])).echecs[0]?.why ?? null;

Deno.test('sl01 (phrase d’Ergun) : la sortie FUSIONNÉE du modèle (08:00-17:00 pause 60) PASSE — le code redécoupe en deux créneaux', async () => {
  const fusionne = heuresErgun([L('08:00', '17:00', { pause: 60 })]);
  const bien = heuresErgun([L('08:00', '12:00'), L('13:00', '17:00')]);
  for (const c of [fusionne, bien]) {
    const why = await passe('sl01', c);
    if (why) throw new Error(`sl01 devrait passer : ${why}`);
  }
  // Pause comptée deux fois par le modèle (créneau 08:00-12:00 pause 60, puis 13:00-17:00) : corrigée en code.
  if (await passe('sl01', heuresErgun([L('08:00', '12:00', { pause: 60 }), L('13:00', '17:00')]))) throw new Error('pause doublée : le code doit la retirer');
  // Le second créneau sans chantier nommé n'est PAS pris au hasard dans le planning (Villa Dupont, 08:00-12:00 prévu).
  if (await passe('sl01', heuresErgun([L('08:00', '12:00'), { chantier: '', debut: '13:00', fin: '17:00' }]))) throw new Error('ligne sans nom : rattachée au nouveau chantier');
  // Une action NON demandée (envoyer_journee) est écartée par le code (aucun indice dans la phrase) : la fiche reste juste.
  if (await passe('sl01', bien, { name: 'envoyer_journee', args: {} })) throw new Error('envoi non demandé : écarté');
});

Deno.test('sl01 : le contrôle ÉCHOUE pour un seul créneau, un bloc absent, un mauvais code postal, une ville inventée', async () => {
  const echec = async (...c: Parameters<typeof appels>) => String(await passe('sl01', ...c));
  if (!/créneaux = 08:00-12:00/.test(await echec(heuresErgun([L('08:00', '12:00')])))) throw new Error('un seul créneau (le bug d’origine) doit échouer');
  if (!/nom = «  »|nom/.test(await echec(heuresErgun([L('08:00', '12:00'), L('13:00', '17:00')], null)))) throw new Error('bloc absent');
  if (!/code postal = « 01000 »/.test(await echec(heuresErgun([L('08:00', '12:00'), L('13:00', '17:00')], { nom: 'Pierrick Dupont', code_postal: '01000', ville: 'Montagna', description: 'store' })))) throw new Error('mauvais code postal');
  if (!/ville = « Lyon »/.test(await echec(heuresErgun([L('08:00', '12:00'), L('13:00', '17:00')], { nom: 'Pierrick Dupont', code_postal: '01250', ville: 'Lyon', description: 'store' })))) throw new Error('mauvaise ville');
  if (!/Pierrick Dupont|nom/.test(await echec(heuresErgun([L('08:00', '12:00'), L('13:00', '17:00')], { nom: 'Pierre Durand', code_postal: '01250', ville: 'Montagna', description: 'store' })))) throw new Error('mauvais nom');
  if (!/attendu 1|éléments/.test(await echec({ name: 'repondre', args: { reponse: 'Je n’ai pas compris.' } }))) throw new Error('une simple réponse doit échouer');
});

// Sorties HABILLÉES à la main (ce que le code ne produit jamais) : les contrôles doivent mordre.
const ligne = (start: string, end: string, extra: Record<string, unknown> = {}) => ({ start, end, break_minutes: 0, worksite_id: null, worksite_text: 'Pierrick Dupont', nouveau: true, key: 'L0', ...extra });
const H = (lines: unknown[], extra: Record<string, unknown> = {}): Outcome => ({ kind: 'draft', id: 'i0', draft: { date: '2026-10-01', errors: [], lines, nouveau_chantier: { nom: 'Pierrick Dupont', adresse: '', code_postal: '01250', ville: 'Montagna', description: 'pose d’un store banne' }, ...extra } });
const fiche = (...items: Outcome[]): Outcome => ({ kind: 'multi', items, ignores: [], non_prepare: [] });
const cas = (id: string) => CASES.find((c) => c.id === id)!;
const annexe = (type: string, draft: Record<string, unknown>, extra: Partial<Outcome> = {}): Outcome => ({ kind: 'action', type, draft, problems: [], ...extra });

Deno.test('sl01 : contrôles sur des sorties fabriquées (pause doublée, 2e créneau pris au planning, envoi en trop, un seul créneau) ÉCHOUENT', () => {
  const sl01 = cas('sl01').check;
  const l1 = ligne('08:00', '12:00', { key: 'L0' }), l2 = ligne('13:00', '17:00', { key: 'L1', gap_before: 'pause' });
  if (sl01(fiche(H([l1, l2])))) throw new Error(`le bon résultat doit passer : ${sl01(fiche(H([l1, l2])))}`);
  const mal: [string, Outcome, RegExp][] = [
    ['pause doublée (net 420)', fiche(H([{ ...l1, break_minutes: 60 }, l2])), /net = 420/],
    ['2e créneau pris au planning', fiche(H([l1, { ...l2, nouveau: false, worksite_id: 'w-dupont', from_planning: true }])), /créneau 2/],
    ['envoi en trop', fiche(H([l1, l2]), annexe('envoyer_journee', {})), /éléments = heures > envoyer_journee/],
    ['un seul créneau', fiche(H([l1])), /créneaux = 08:00-12:00/],
    ['créneaux fusionnés', fiche(H([ligne('08:00', '17:00', { break_minutes: 60 })])), /créneaux = 08:00-17:00/],
    ['pas de pause marquée', fiche(H([l1, { ...l2, gap_before: null }])), /écarts/],
    ['erreur bloquante', fiche(H([l1, l2], { errors: ['Déjà noté aujourd\'hui : 07:30–12:00 (Villa Dupont).'] })), /erreurs/],
    ['ancien format (réponse seule)', { kind: 'answer', answer: 'Sur quel chantier ?' }, /éléments = answer/],
  ];
  for (const [nom, o, re] of mal) {
    const why = sl01(o);
    if (!why || !re.test(why)) throw new Error(`${nom} devrait échouer avec ${re} : ${why}`);
  }
  // L'ancien format non enveloppé (un seul élément) reste accepté.
  if (sl01(H([l1, l2]))) throw new Error('un seul élément non enveloppé passe');
});

Deno.test('sl07 : le bon ordre PASSE ; mauvais ordre, panier « Aucune ligne aujourd’hui », réserve oubliée ÉCHOUENT', () => {
  const sl07 = cas('sl07').check;
  const dupont = (start: string, end: string, key: string) => ({ start, end, break_minutes: 0, worksite_id: 'w-dupont', worksite_text: 'Villa Dupont', key });
  const h = H([dupont('07:30', '12:00', 'L0'), dupont('13:00', '16:30', 'L1')], { nouveau_chantier: undefined });
  const panier = annexe('panier_repas', { valeur: true }), reserve = annexe('signaler_reserve', { detail: 'fissure sur le mur sud', entry_id: 'draft:L1' }, { cible: { chantier_id: 'w-dupont', nouveau: false, nom: 'Villa Dupont' } });
  if (sl07(fiche(h, panier, reserve))) throw new Error(`le bon ordre doit passer : ${sl07(fiche(h, panier, reserve))}`);
  const mal: [string, Outcome, RegExp][] = [
    ['mauvais ordre', fiche(h, reserve, panier), /éléments = heures > signaler_reserve > panier_repas/],
    ['panier sans ligne', fiche(h, annexe('panier_repas', { valeur: true }, { problems: ['Aucune ligne aujourd’hui : notez d’abord vos heures.'] }), reserve), /panier_repas pas prêt/],
    ['réserve oubliée', fiche(h, panier), /éléments = heures > panier_repas/],
    ['mauvaise cible', fiche(h, panier, annexe('signaler_reserve', { detail: 'fissure' }, { cible: { chantier_id: 'w-martin', nouveau: false, nom: 'Bureau Martin' } })), /cible/],
  ];
  for (const [nom, o, re] of mal) {
    const why = sl07(o);
    if (!why || !re.test(why)) throw new Error(`${nom} devrait échouer avec ${re} : ${why}`);
  }
});

Deno.test('Turc : une réponse en FRANÇAIS à une question en turc échoue (st05) ; la réponse en turc passe ; le repli « Je n’ai pas compris » échoue', async () => {
  const rep = (reponse: string) => passe('st05', { name: 'repondre', args: { reponse } });
  if (await rep('Bu hafta toplam 7 saat 30 dakika çalıştınız.')) throw new Error(`réponse turque : ${await rep('Bu hafta toplam 7 saat 30 dakika çalıştınız.')}`);
  if (!/pas en turc|mêlée/.test(String(await rep('Cette semaine : 7 h 30 déclarées sur 1 jour.')))) throw new Error('réponse française : doit échouer');
  if (!/pas en turc|mêlée/.test(String(await rep('Bu hafta 7 heures çalıştınız.')))) throw new Error('réponse mêlée : doit échouer');
  if (!/7 h 30/.test(String(await rep('Bu hafta çok çalıştınız ve bildirdiniz.')))) throw new Error('il faut donner le total (7 h 30)');
  // st03 : panier + congé + envoi en une fiche, dans l'ordre D3 ; l'envoi dépend du panier.
  const st03 = await passe('st03', { name: 'demander_conge', args: { type: 'conge', du: '2026-10-05', au: '2026-10-07' } }, { name: 'panier_repas', args: { valeur: true } }, { name: 'envoyer_journee', args: {} });
  if (st03) throw new Error(`st03 devrait passer : ${st03}`);
  // st03 avec une réponse française à la place : échoue.
  if (!(await passe('st03', { name: 'repondre', args: { reponse: 'Je vais le faire.' } }))) throw new Error('st03 : une réponse seule doit échouer');
});

Deno.test('sl15 : cinq actions pour quatre appels — un faux modèle à 5 appels PASSE (rien n’est perdu en silence) ; l’oubli du panier SANS que la fiche le dise ÉCHOUE', async () => {
  const heures = { name: 'declarer_heures', args: { date: '2026-10-01', lignes: [{ chantier: 'Dupont', debut: '08:00', fin: '12:00' }, { chantier: 'Dupont', debut: '13:00', fin: '17:00' }] } };
  const cinq = [heures, { name: 'panier_repas', args: { valeur: true } }, { name: 'signaler_reserve', args: { chantier: 'Dupont', detail: 'fissure au plafond' } },
    { name: 'demander_conge', args: { type: 'conge', du: '2026-10-05', au: '2026-10-07' } }, { name: 'envoyer_journee', args: {} }];
  const why = await passe('sl15', ...cinq);
  if (why) throw new Error(`5 appels : ${why}`);
  // Un modèle qui oublie le panier : la fiche le DIT (« Non préparé »), donc le cas passe ; sans l'indication, il échoue.
  const oublie = cinq.filter((c) => c.name !== 'panier_repas');
  const dit = await passe('sl15', ...oublie);
  if (dit) throw new Error(`panier oublié mais dit : ${dit}`);
  const sl15 = cas('sl15').check;
  const d = (start: string, end: string, key: string) => ({ start, end, break_minutes: 0, worksite_id: 'w-dupont', worksite_text: 'Villa Dupont', key });
  const h = H([d('08:00', '12:00', 'L0'), d('13:00', '17:00', 'L1')], { nouveau_chantier: undefined });
  const sansPanier: Outcome = { kind: 'multi', items: [h, annexe('signaler_reserve', { detail: 'fissure' }), annexe('demander_conge', { du: '2026-10-05' })], ignores: [], non_prepare: [] };
  if (!/action perdue sans un mot : panier_repas/.test(String(sl15(sansPanier)))) throw new Error('un panier oublié sans un mot doit échouer');
  const envoiAvant: Outcome = { kind: 'multi', items: [h, annexe('envoyer_journee', {}), annexe('panier_repas', { valeur: true })], ignores: [], non_prepare: ['Réserve', 'Congé'] };
  if (!/DERNIER/.test(String(sl15(envoiAvant)))) throw new Error('l’envoi doit être le dernier');
});

Deno.test('Journée vide pour les heures d’aujourd’hui ; la même phrase avec la journée par défaut porte l’erreur « Déjà noté aujourd’hui »', async () => {
  if (!CASES.filter((c) => c.live === 'vide').every((c) => c.cote === 'salarie')) throw new Error('live vide : salarié seulement');
  if (LIVE_VIDE.lignes.length !== 0 || WORKER_LIVE.lignes.length !== 2) throw new Error('fixtures');
  const bien = heuresErgun([L('08:00', '12:00'), L('13:00', '17:00')]);
  const r = await runEval('v2', appels(bien), ['sl01']);
  if (r.ok !== 1) throw new Error('journée vide : sl01 passe');
  // Même sortie, journée par défaut : on le lit dans la fiche.
  const sl01 = cas('sl01');
  sl01.live = undefined;
  try {
    const x = await runEval('v2', appels(bien), ['sl01']);
    if (x.ok !== 0 || !/Déjà noté aujourd'hui/.test(JSON.stringify(x.echecs))) throw new Error(`journée par défaut : ${JSON.stringify(x.echecs).slice(0, 300)}`);
  } finally { sl01.live = 'vide'; }
});

Deno.test('repeat : N passes par cas, total et réussites comptent des essais, parCas dit combien ont réussi', async () => {
  const bien = heuresErgun([L('08:00', '12:00'), L('13:00', '17:00')]);
  let n = 0;
  const unSurDeux = async () => (n++ % 2 === 0 ? { ok: true as const, call: bien, calls: [bien] } : { ok: false as const, reason: 'provider_error' as const });
  const r = await runEval('v2', unSurDeux, ['sl01'], 1, 0, { repeat: 4 });
  if (r.total !== 4 || r.ok !== 2 || r.repeat !== 4) throw new Error(JSON.stringify({ total: r.total, ok: r.ok, repeat: r.repeat }));
  if (JSON.stringify(r.parCas) !== JSON.stringify([{ id: 'sl01', essais: 4, ok: 2 }])) throw new Error(JSON.stringify(r.parCas));
  if (r.echecs.length !== 2 || r.echecs.some((e) => e.cause !== 'fournisseur')) throw new Error('deux erreurs du fournisseur, comptées à part');
  const un = await runEval('v2', appels(bien), ['sl01']);
  if (un.total !== 1 || un.repeat !== 1) throw new Error('par défaut : une passe');
});

// ── Les 31 phrases longues avec une sortie PLAUSIBLE du modèle (y compris ses défauts mesurés) : toutes passent ──
// C'est le test de bout en bout du code (redécoupage, pause, rattachement, annexes) ; la vraie réussite se mesure sur le vrai modèle.
Deno.test('31 phrases longues : une sortie plausible du modèle (créneaux fusionnés, pause doublée, civilité devant le nom…) passe par le MÊME chemin que la production', async () => {
  type Appel = { name: string; args: Record<string, unknown> };
  const T = '2026-10-01';
  const nc = (nom: string, ville: string, code_postal: string, description: string, adresse = '') => ({ nom, adresse, code_postal, ville, description });
  const h = (lignes: unknown[], bloc?: unknown, date = T): Appel => ({ name: 'declarer_heures', args: { date, lignes, ...(bloc ? { nouveau_chantier: bloc } : {}) } });
  const l = (chantier: string, debut: string, fin: string, pause?: number) => ({ chantier, debut, fin, ...(pause !== undefined ? { pause } : {}) });
  const panier: Appel = { name: 'panier_repas', args: { valeur: true } }, envoi: Appel = { name: 'envoyer_journee', args: {} };
  const reserve = (detail: string, chantier = 'Dupont'): Appel => ({ name: 'signaler_reserve', args: { chantier, detail } });
  const conge: Appel = { name: 'demander_conge', args: { type: 'conge', du: '2026-10-05', au: '2026-10-07' } };
  const matin3 = [l('Dupont', '07:00', '10:00'), l('Martin', '10:30', '12:00'), l('Dupont', '13:00', '16:30')];
  const plausibles: Record<string, Appel[]> = {
    sl01: [h([l('nouveau', '08:00', '17:00', 60)], nc('Pierrick Dupont', 'Montagna', '01250', 'pose d’un store banne'))],
    sl02: [h(matin3)],
    sl03: [h([l('Martin', '08:00', '16:30', 30)]), panier],
    sl04: [h([l('nouveau', '14:00', '18:00')], nc('Madame Claire Martin', 'Bourg-en-Bresse', '01000', 'rénovation d’une salle de bain', '12 rue des Lilas'))],
    sl05: [h([l('nouveau', '09:00', '12:00'), l('nouveau', '14:00', '17:00')], nc('monsieur Ayhan Demir', 'Bourg-en-Bresse', '', 'pose d’une pergola'))],
    sl06: [h([l('nouveau', '08:00', '12:00')], nc('Paul Durand', '', '', 'pose de carrelage'))],
    sl07: [h([l('Dupont', '07:30', '12:00', 0), l('Dupont', '13:00', '16:30', 0)]), panier, reserve('fissure sur le mur sud')],
    sl08: [h([l('Dupont', '08:00', '12:00'), l('Dupont', '13:00', '17:00')], undefined, '2026-09-30'), conge],
    sl09: [h([l('Dupont', '07:00', '12:00', 45), l('Dupont', '12:45', '16:30')]), reserve('fissure sur le mur')],
    sl10: [h([l('Dupont', '08:00', '12:00'), l('', '13:00', '17:00')], nc('Claire Martin', 'Bron', '69500', 'installation d’une porte de garage'))],
    sl11: [h([l('Martin', '08:00', '17:00')]), envoi],
    sl12: [h([l('Bureau Martin', '08:00', '12:00'), l('Bureau Martin', '13:00', '17:00')], nc('Bureau Martin', 'Villeurbanne', '', ''))],
    sl13: [h(matin3.map((x, i) => (i === 2 ? l('nouveau', '13:00', '16:30') : x)), nc('Ayhan Demir', 'Bourg-en-Bresse', '01000', 'pose d’une pergola en aluminium', '5 rue des Tilleuls')), panier, reserve('fissure sur le mur sud'), envoi],
    sl14: [h([l('Dupont', '07:30', '12:00')])],
    sl15: [h([l('Dupont', '08:00', '12:00'), l('Dupont', '13:00', '17:00')]), panier, reserve('fissure au plafond'), conge, envoi],
    sl16: [h([l('Martin', '08:00', '16:30', 60)])],
    // Étape 2 : deux phrases longues qui renvoient à la conversation (le chantier est celui d'avant, la date est demain).
    sl17: [h([l('Martin', '08:00', '16:30', 30)], undefined, '2026-10-02')],
    st01: [h([l('nouveau', '08:00', '17:00', 60)], nc('Pierrick Dupont', 'Montagna', '01250', 'montage d’un store à bras'))],
    st02: [h(matin3)],
    st03: [conge, panier, envoi],
    st04: [reserve('fissure sur le mur')],
    st05: [{ name: 'repondre', args: { reponse: 'Bu hafta toplam 7 saat 30 dakika çalıştınız.' } }],
    st06: [h([l('Dupont', '07:00', '12:00'), l('nouveau', '13:00', '17:00')], nc('Ayşe Kaya', 'Montagna', '01250', 'réparation de toiture'))],
    st07: [h([l('Dupont', '07:30', '12:00'), l('Martin', '13:00', '16:30')], undefined, '2026-09-30')],
    st08: [h([l('Martin', '08:00', '17:00', 60)]), panier],
    st09: [h([l('Martin', '08:00', '16:30', 30)]), panier],
    st10: [h([l('Martin', '08:00', '17:00', 60)])],
    st11: [h([l('Dupont', '08:00', '12:00'), l('Martin', '13:00', '17:00')]), panier],
    st12: [h([l('nouveau', '09:00', '12:00'), l('nouveau', '14:00', '17:00')], nc('Ayhan Demir', '', '69500', 'montage d’une pergola', 'Bron'))],
    st13: [h([l('', '08:00', '12:00'), l('Martin', '13:00', '17:00')])],
    st14: [h([l('Martin', '08:00', '17:00')], undefined, '2026-10-02')],
  };
  const ids = CASES.filter((c) => /^(sl|st)\d\d$/.test(c.id)).map((c) => c.id);
  if (Object.keys(plausibles).sort().join() !== ids.slice().sort().join()) throw new Error('une sortie plausible par phrase longue');
  const ko: string[] = [];
  for (const id of ids) {
    const r = await runEval('v2', appels(...plausibles[id]), [id]);
    if (r.ok !== 1) ko.push(`${id} : ${r.echecs[0]?.why}`);
  }
  if (ko.length) throw new Error(`échecs :\n${ko.join('\n')}`);
});

// ── Les 5 échecs MESURÉS sur le vrai modèle (gemini-3.5-flash-lite, réflexion medium) : les sorties réelles passent maintenant ──
Deno.test('Sorties RÉELLES mesurées : st01 (ville en adresse + Villa Dupont deviné), st08 (Villa Dupont deviné), sl12 (« Nouveau chantier » sans bloc), st05 (« Ma semaine »)', async () => {
  const T = '2026-10-01';
  const h = (lignes: unknown[], bloc?: unknown) => ({ name: 'declarer_heures', args: { date: T, lignes, ...(bloc ? { nouveau_chantier: bloc } : {}) } });
  const l = (chantier: string, debut: string, fin: string) => ({ chantier, debut, fin });
  // st01 a) la ville est dans l'ADRESSE ; b) le créneau 1 a reçu « Villa Dupont » (deviné à cause du nom de famille).
  const st01 = await passe('st01', h([l('Villa Dupont', '08:00', '12:00'), l('Pierrick Dupont', '13:00', '17:00')], { nom: 'Pierrick Dupont', ville: '', adresse: 'Montagna', code_postal: '01250', description: 'Pose de store banne' }));
  if (st01) throw new Error(`st01 (sortie réelle) : ${st01}`);
  // st08 : créneau 1 = Villa Dupont (deviné), créneau 2 = Bureau Martin.
  const st08 = await passe('st08', h([l('Villa Dupont', '08:00', '12:00'), l('Bureau Martin', '13:00', '17:00')]), { name: 'panier_repas', args: { valeur: true } });
  if (st08) throw new Error(`st08 (sortie réelle) : ${st08}`);
  // sl12 : heures justes sur Bureau Martin, AUCUN bloc : le chantier est réutilisé (reutilise_id), pas « Non préparé ».
  const sl12 = await passe('sl12', h([l('Bureau Martin', '08:00', '12:00'), l('Bureau Martin', '13:00', '17:00')]));
  if (sl12) throw new Error(`sl12 (sortie réelle) : ${sl12}`);
  // st05 : réponse turque correcte qui cite l'écran « Ma semaine » (en français, comme toute l'appli).
  const reel = "Bu hafta toplam 15 saat 30 dakika çalıştınız (dün 7s 30dk, bugün 8s). Detayları 'Ma semaine' ekranından görebilirsiniz.";
  const st05 = await passe('st05', { name: 'repondre', args: { reponse: reel } });
  if (/mêlée/.test(String(st05))) throw new Error(`st05 : le libellé d’écran ne doit pas compter comme du français : ${st05}`);
  // (la réponse réelle donne 15 h 30 et non 7 h 30 : c'est le jeu de test du cas qui attend « 7 » ; le contrôle de langue, lui, passe.)
});

Deno.test('st12 / st13 : les variantes (ville dite comme adresse, un seul chantier cité) passent avec la sortie du modèle ; échouent si la ville manque ou si Dupont est deviné', async () => {
  const T = '2026-10-01';
  const h = (lignes: unknown[], bloc?: unknown) => ({ name: 'declarer_heures', args: { date: T, lignes, ...(bloc ? { nouveau_chantier: bloc } : {}) } });
  const l = (chantier: string, debut: string, fin: string) => ({ chantier, debut, fin });
  const demir = { nom: 'Ayhan Demir', ville: '', adresse: 'Bron', code_postal: '69500', description: 'Pergola montajı' };
  if (await passe('st12', h([l('nouveau', '09:00', '12:00'), l('nouveau', '14:00', '17:00')], demir))) throw new Error(`st12 : ${await passe('st12', h([l('nouveau', '09:00', '12:00'), l('nouveau', '14:00', '17:00')], demir))}`);
  // Une ville vraiment absente (ni adresse ni code postal) n'est PAS inventée : le cas échoue (« manque ville »).
  const sans = await passe('st12', h([l('nouveau', '09:00', '12:00'), l('nouveau', '14:00', '17:00')], { ...demir, adresse: '', code_postal: '' }));
  if (!/ville|code postal/.test(String(sans))) throw new Error(`st12 sans ville : doit échouer (${sans})`);
  // st13 : Martin cité pour le 2e créneau seulement, le 1er est sans nom ; « Villa Dupont » deviné ne passe pas non plus.
  if (await passe('st13', h([l('', '08:00', '12:00'), l('Martin', '13:00', '17:00')]))) throw new Error('st13 : créneau sans nom → Martin');
  if (await passe('st13', h([l('Villa Dupont', '08:00', '12:00'), l('Bureau Martin', '13:00', '17:00')]))) throw new Error('st13 : Villa Dupont deviné → Martin');
});

Deno.test('st05 : un libellé d’écran entre guillemets n’est pas du français ; une vraie réponse en français (guillemets ou non) échoue toujours', () => {
  const sans = sansLibellesEcran;
  if (/Ma semaine/.test(sans("Detayları 'Ma semaine' ekranından görebilirsiniz.")) || /Ma semaine/.test(sans('Detayları « Ma semaine » ekranından.')) || /Ma semaine/.test(sans('Detayları "Ma semaine" ekranından.'))) throw new Error('libellés entre guillemets retirés');
  // Une apostrophe de mot n'ouvre jamais une citation (le français autour reste visible au contrôle).
  if (!/vous/.test(sans("Bu hafta vous avez l'heure d'aujourd'hui et Martin’de çalıştınız"))) throw new Error('apostrophes de mots : rien n’est retiré');
  const cas5 = cas('st05').check;
  const rep = (answer: string): Outcome => ({ kind: 'answer', answer });
  const ok = [
    "Bu hafta toplam 7 saat 30 dakika çalıştınız. Detayları 'Ma semaine' ekranından görebilirsiniz.",
    'Bu hafta toplam 7 saat 30 dakika çalıştınız. Detayları « Ma semaine » ekranından görebilirsiniz.',
    'Bu hafta toplam 7 saat 30 dakika çalıştınız, "Ma semaine" ekranına bakın.',
  ];
  for (const a of ok) { const why = cas5(rep(a)); if (why) throw new Error(`doit passer : ${a} → ${why}`); }
  const ko: [string, RegExp][] = [
    ['Cette semaine, vous avez travaillé 7 h 30. Voir « Ma semaine ».', /pas en turc|mêlée/],
    ["Bu hafta 7 saat 30 dakika. Vous avez travaillé 7 h 30 déclarées, voir 'Ma semaine'.", /mêlée/],
    ['Bu hafta çalıştınız ve vous avez 7 h 30 déclarées « Ma semaine ».', /mêlée/],
    ["Cette semaine : 7 h 30 déclarées. Détails dans 'Ma semaine'.", /pas en turc|mêlée/],
    ["Voir 'Ma semaine' et « Ma journée » pour les détails complets.", /pas en turc/],
  ];
  for (const [a, re] of ko) { const why = String(cas5(rep(a))); if (!re.test(why)) throw new Error(`doit échouer (${re}) : ${a} → ${why}`); }
});

// ── aiConfig : essayer Claude pendant que la production reste sur Gemini ─────────
const PROD = { get: (k: string) => ({ AI_CONFIG: '{"formule":"payant","rapide":"gemini:gemini-3.5-flash-lite"}', AI_API_KEY: 'cle-g', ANTHROPIC_API_KEY: 'cle-a', AUTRE: 'x' } as Record<string, string>)[k] };
const CLAUDE = '{"formule":"payant","rapide":"anthropic:claude-sonnet-5-5","documents":"anthropic:claude-sonnet-5-5","secours":"gemini:gemini-3.1-flash-lite"}';

Deno.test('aiConfig : absent ou null → l’environnement tel quel (rien ne change pour la production) ; fourni → remplace AI_CONFIG et rien d’autre', () => {
  for (const v of [undefined, null]) {
    const e = envEvaluation(PROD, v);
    if (!e.ok || e.env !== PROD || e.surcharge) throw new Error('sans aiConfig : même environnement');
  }
  for (const v of [CLAUDE, ` ${CLAUDE} `, JSON.parse(CLAUDE)]) {
    const e = envEvaluation(PROD, v);
    if (!e.ok || !e.surcharge) throw new Error(`aiConfig refusé : ${JSON.stringify(v)}`);
    if (e.env.get('AI_API_KEY') !== 'cle-g' || e.env.get('ANTHROPIC_API_KEY') !== 'cle-a' || e.env.get('AUTRE') !== 'x') throw new Error('les clés et le reste restent ceux de l’environnement');
    const c = readConfig(e.env);
    if (c.rapide.fournisseur !== 'anthropic' || c.documents.model !== 'claude-sonnet-5-5' || c.secours.fournisseur !== 'gemini') throw new Error(JSON.stringify(c));
  }
  // Raccourci : « payant » = la formule avec les modèles par défaut (Gemini), validée comme en production.
  const p = envEvaluation(PROD, 'payant');
  if (!p.ok || readConfig(p.env).rapide.model !== 'gemini-3.5-flash-lite' || readConfig(p.env).plafonds !== null) throw new Error('raccourci payant');
  // La production, elle, n’a pas bougé.
  if (readConfig(PROD).rapide.fournisseur !== 'gemini') throw new Error('la config de la prod ne doit pas changer');
});

Deno.test('aiConfig invalide = erreur explicite (400), JAMAIS un repli silencieux sur le défaut', () => {
  const mauvais: unknown[] = [
    '{pas du json', '', '   ', 'gratuit', '[]', '42', 42, true, [], ['payant'],
    '{"rapide":"anthropic:claude-opus-5-5"}', '{"rapide":"anthropic:claude-fable-5-1"}', '{"documents":"anthropic:claude-mythos-5-1"}',
    '{"rapide":"anthropic:claude-sonnet-5-5-20260401"}', '{"rapide":"openai:gpt-5"}', '{"modele":"x"}', '{"rapide":"gemini:gemini-test-pro"}',
    '{"plafonds":{"rapide":0,"documents":1}}', { rapide: 'anthropic:claude-opus-5-5' },
  ];
  for (const v of mauvais) {
    const e = envEvaluation(PROD, v);
    if (e.ok || !/^aiConfig invalide/.test(e.error)) throw new Error(`devait être refusé : ${JSON.stringify(v)} → ${JSON.stringify(e)}`);
    if (e.error.length > 100 || (typeof v === 'string' && v.length > 8 && e.error.includes(v.slice(2, 12)))) throw new Error(`la raison ne répète pas le contenu : ${e.error}`);
  }
});

Deno.test('Évaluation avec aiConfig : les appels partent chez Claude, la réponse dit quel modèle a servi chaque cas ; en panne de Claude, c’est le secours Gemini qui est compté', async () => {
  const claudeOk = () => new Response(JSON.stringify({ content: [{ type: 'tool_use', id: 't', name: 'repondre', input: { reponse: 'ok' } }], stop_reason: 'tool_use' }), { status: 200 });
  const geminiOk = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: 'repondre', args: { reponse: 'ok' } } }] } }] }), { status: 200 });
  const lancer = async (claudeStatus: number) => {
    reposReinit();
    const urls: string[] = [];
    const fetchImpl = (url: string) => { urls.push(url); return Promise.resolve(url.includes('anthropic') ? (claudeStatus === 200 ? claudeOk() : new Response('{}', { status: claudeStatus })) : geminiOk()); };
    const ev = envEvaluation(PROD, CLAUDE);
    if (!ev.ok) throw new Error('aiConfig');
    const r = await runEval('v2', (req) => callFunction(req, ev.env, fetchImpl), CASES.slice(0, 12).map((c) => c.id), 1, 0);
    return { r, urls, ev };
  };
  const a = await lancer(200);
  const iaA = a.r.temps.length;
  if (!iaA) throw new Error('au moins un cas passe par le modèle');
  if (JSON.stringify(a.r.modeles) !== JSON.stringify([{ modele: 'anthropic:claude-sonnet-5-5', n: iaA }])) throw new Error(JSON.stringify(a.r.modeles));
  if (a.urls.length < iaA || a.urls.some((u) => !u.startsWith('https://api.anthropic.com/'))) throw new Error('tout chez Claude');
  const b = await lancer(529);
  if (JSON.stringify(b.r.modeles) !== JSON.stringify([{ modele: 'gemini:gemini-3.1-flash-lite', n: b.r.temps.length }])) throw new Error(`le secours n’est pas Claude : ${JSON.stringify(b.r.modeles)}`);
  // Résumé de la passe : ce qui a réellement servi, et si les clés sont posées (jamais les clés).
  const res = resumeEvaluation(a.ev.env, a.ev.surcharge);
  if (JSON.stringify(res) !== JSON.stringify({ surcharge: true, formule: 'payant', rapide: 'anthropic:claude-sonnet-5-5', documents: 'anthropic:claude-sonnet-5-5', secours: 'gemini:gemini-3.1-flash-lite', cles: { gemini: true, anthropic: true } })) throw new Error(JSON.stringify(res));
  if (JSON.stringify(res).includes('cle-a') || JSON.stringify(res).includes('cle-g')) throw new Error('aucune clé dans la réponse');
  // Sans aiConfig : la config de l’environnement, surcharge: false.
  const prod = resumeEvaluation(PROD, false);
  if (prod.surcharge || prod.rapide !== 'gemini:gemini-3.5-flash-lite') throw new Error(JSON.stringify(prod));
  // Un cas sans appel au modèle n’a pas de « modele ».
  const c = await runEval('v2', async () => ({ ok: false, reason: 'provider_error' }), ['b01']);
  if (c.modeles.some((m) => m.modele !== 'aucun')) throw new Error('un cas sans réponse du modèle est compté « aucun »');
  if (modeleServi({}) !== undefined) throw new Error('inconnu');
});

// ── Suites de conversation (étape 2 : le chat se souvient) ──────────────────────
// Le banc passe `history` EXACTEMENT comme les vraies fonctions (consigne, outils, lecteur local) ; ici, sans modèle.
const SUITES = CASES.filter((c) => /^sc\d\d$/.test(c.id));

Deno.test('Suites de conversation : 15 cas (8 bureau, 5 salarié FR, 2 salarié TR), tous avec leur historique ; les anciens cas sans (hors deux phrases longues)', () => {
  const ids = SUITES.map((c) => c.id);
  if (ids.join() !== Array.from({ length: 15 }, (_, i) => `sc${String(i + 1).padStart(2, '0')}`).join()) throw new Error(`ids : ${ids.join()}`);
  if (SUITES.some((c) => c.categorie !== 'Suite de conversation')) throw new Error('une seule catégorie : « Suite de conversation »');
  const bureau = SUITES.filter((c) => c.cote === 'bureau'), salarie = SUITES.filter((c) => c.cote === 'salarie');
  if (bureau.map((c) => c.id).join() !== 'sc01,sc02,sc03,sc04,sc05,sc06,sc07,sc13') throw new Error('8 cas bureau (sc01–sc07, sc13 : la réponse à une question)');
  if (salarie.map((c) => c.id).join() !== 'sc08,sc09,sc10,sc11,sc12,sc14,sc15') throw new Error('7 cas salarié (sc08–sc10 + sc14–sc15 FR, sc11–sc12 TR)');
  for (const c of SUITES) {
    const h = c.history ?? [];
    if (!h.length || h[0].who !== 'me' || h.some((m, i) => m.who !== (i % 2 === 0 ? 'me' : 'bot'))) throw new Error(`${c.id} : l’historique alterne « me » / « bot » en commençant par l’utilisateur`);
    // Les cas respectent déjà les bornes du contrat : rien n'est coupé ni écarté par le nettoyage.
    if (JSON.stringify(nettoyerHistorique(h).map((m) => m.text)) !== JSON.stringify(h.map((m) => m.text.replace(/\s+/g, ' ').trim()))) throw new Error(`${c.id} : l’historique n’est pas conservé tel quel par le nettoyage`);
    if (c.file) throw new Error(`${c.id} : pas de fichier dans une suite`);
  }
  // Turc : la phrase d'avant est bien turque ; la relance reste « courte » (tool-domains.test.ts l'exige des cas hors sl/st).
  for (const id of ['sc11', 'sc12']) {
    const c = SUITES.find((x) => x.id === id)!;
    if (!detecteTurc(c.history![0].text)) throw new Error(`${id} : la phrase d’avant doit être en turc`);
  }
  for (const c of salarie) if (workerProfile(c.phrase, false) !== 'court') throw new Error(`${c.id} : relance salarié en profil court`);
  // Les anciens cas (80 + 27 phrases longues) n'ont pas d'historique : leur consigne est celle d'avant. Seules sl17 et st14 (phrases LONGUES qui
  // renvoient à la conversation) en portent un : le profil long, lui aussi, voit la conversation.
  const avecHistorique = CASES.filter((c) => c.history).map((c) => c.id).filter((id) => !/^sc\d\d$/.test(id));
  if (avecHistorique.join() !== 'sl17,st14') throw new Error(`cas non « sc » avec historique : ${avecHistorique.join()} (sl17 et st14 seulement)`);
  if (CASES.length !== 111 + 15) throw new Error(`${CASES.length} cas (126 attendus : 80 + 31 phrases longues + 15 suites)`);
  // sl17 et st14 sont bien LONGUES (jamais le lecteur local, la consigne du profil long) et renvoient à leur historique.
  for (const id of ['sl17', 'st14']) {
    const c = CASES.find((x) => x.id === id)!;
    if (workerProfile(c.phrase, false) !== 'long') throw new Error(`${id} : phrase longue attendue`);
    if (!c.history?.length || c.history[0].who !== 'me') throw new Error(`${id} : historique attendu`);
  }
  if (!detecteTurc(CASES.find((x) => x.id === 'st14')!.phrase)) throw new Error('st14 : phrase turque');
});

Deno.test('Suites de conversation : la consigne envoyée au modèle porte l’historique JUSTE avant la demande (même constructeur que la production) ; jamais pour les anciens cas', async () => {
  const vus = new Map<string, { prompt: string; outils: string[] }>();
  let courant = '';
  const espion = async (req: Parameters<Parameters<typeof runEval>[1]>[0]) => { vus.set(courant, { prompt: req.prompt, outils: req.functions.map((f) => f.name) }); return { ok: false as const, reason: 'provider_error' as const }; };
  for (const c of CASES.filter((x) => /^(sc\d\d|b01|b05|b29|s01|s02|s26|st05)$/.test(x.id))) { courant = c.id; await runEval('v2', espion, [c.id]); }
  for (const c of SUITES) {
    const v = vus.get(c.id);
    if (!v) { throw new Error(`${c.id} : jamais passé par le modèle (le lecteur local l’a traité ?)`); }
    // sc13 et sc14 : la demande d'origine est recollée à la réponse (« Mets Karim demain, Villa Dupont ») : le bloc ne la répète pas (la question de l'assistant reste).
    const recollee = c.id === 'sc13' || c.id === 'sc14';
    const bloc = blocHistorique(recollee ? c.history!.slice(1) : c.history);
    if (JSON.stringify(sansDemandeRecollee(nettoyerHistorique(c.history), c.phrase)) !== JSON.stringify(nettoyerHistorique(recollee ? c.history!.slice(1) : c.history))) throw new Error(`${c.id} : seules sc13 et sc14 perdent leur première ligne (la demande recollée)`);
    if (recollee && (v.prompt.includes(`Utilisateur : ${c.history![0].text}`) || !v.prompt.includes(`Assistant : ${c.history![1].text}`))) throw new Error(`${c.id} : la demande recollée ne doit plus figurer dans le bloc, la question de l’assistant oui`);
    const fin = c.cote === 'bureau' ? `${bloc}\n\nDEMANDE : ${c.phrase}` : `${bloc}\nMESSAGE : ${c.phrase}`;
    if (!v.prompt.endsWith(fin)) throw new Error(`${c.id} : le bloc d’historique doit précéder immédiatement la demande, qui reste la DERNIÈRE ligne`);
    if (v.prompt.split('<conversation>').length !== 2) throw new Error(`${c.id} : un seul bloc de conversation`);
  }
  // Bit pour bit le prompt de la vraie fonction : bureau (sc01) et salarié profil court (sc09).
  const sc01 = SUITES.find((c) => c.id === 'sc01')!;
  const ctx = buildActionContext(ADMIN_RAW as Parameters<typeof buildActionContext>[0]) as ActionContext;
  ctx.me = ME; ctx.demande = sc01.phrase; ctx.historique = nettoyerHistorique(sc01.history);
  if (vus.get('sc01')!.prompt !== actionPrompt(ctx, '{}', guideForPrompt(), sc01.phrase)) throw new Error('sc01 : le banc n’utilise pas actionPrompt de la production');
  const sc09 = SUITES.find((c) => c.id === 'sc09')!;
  const snap = buildWorkerSnapshot(WORKER_RAW as never) as WorkerSnapshot;
  snap.demande = sc09.phrase; snap.historique = nettoyerHistorique(sc09.history);
  if (vus.get('sc09')!.prompt !== workerFunctionPrompt(snap, LIVE_VIDE as unknown as WorkerLive, sc09.phrase)) throw new Error('sc09 : le banc n’utilise pas workerFunctionPrompt de la production');
  // Les anciens cas qui passent par le modèle : aucun bloc d'historique.
  const anciens = Array.from(vus.entries()).filter(([id]) => !id.startsWith('sc'));
  if (!anciens.length || anciens.some(([, v]) => v.prompt.includes('CONVERSATION EN COURS') || v.prompt.includes('<conversation>'))) throw new Error('les anciens cas gardent leur consigne d’avant');
  // Les outils tiennent compte de la phrase d'avant : « Non, retire ça » garde les outils de planning.
  if (!vus.get('sc03')!.outils.includes('supprimer_intervention')) throw new Error('sc03 : supprimer_intervention doit être proposé');
});

Deno.test('Suites de conversation : une relance qui contient un mot-clé du lecteur local (sc05 « pose-le en maladie », sc08 « 13h à 16h30 pareil »), ou une plage horaire NUE (sc15, sans « pareil »), va au MODÈLE', async () => {
  const r = await runEval('v2', async () => ({ ok: false, reason: 'provider_error' }), ['sc05', 'sc08', 'sc15']);
  if (r.temps.length !== 3 || r.echecs.some((e) => e.via !== 'ia')) throw new Error(`sc05, sc08 et sc15 doivent passer par le modèle : ${JSON.stringify(r.echecs.map((e) => [e.id, e.via]))}`);
  // Sans le modèle (banc sans IA), AUCUNE suite n'est lue de travers par le lecteur local.
  const toutes = await runEval('v2', async () => ({ ok: false, reason: 'provider_error' }), SUITES.map((c) => c.id));
  if (toutes.echecs.some((e) => e.via === 'local')) throw new Error('un cas de suite lu par le lecteur local ?');
  if (toutes.temps.length !== 15) throw new Error(`${toutes.temps.length} suites sur 15 passent par le modèle`);
});

Deno.test('Suites de conversation : une sortie plausible PASSE ; la mauvaise lecture (refaire l’action d’avant, mauvaise date, mauvais salarié, réponse hors sujet) ÉCHOUE', async () => {
  type Appel = { name: string; args: Record<string, unknown> };
  const ok: Record<string, Appel> = {
    sc01: { name: 'affecter_planning', args: { salarie: 'Kevin', chantier: 'Villa Dupont', dates: ['2026-10-02'] } },
    sc02: { name: 'affecter_planning', args: { salarie: 'Karim', chantier: 'Villa Dupont', dates: ['2026-10-05'] } },
    sc03: { name: 'supprimer_intervention', args: { salarie: 'Karim', date: '2026-10-02', chantier: 'Villa Dupont' } },
    sc04: { name: 'repondre', args: { reponse: 'Villa Dupont : 152 h au total depuis le début du chantier.' } },
    sc05: { name: 'poser_absence', args: { salarie: 'Sofiane', type: 'maladie', du: '2026-10-01', au: '2026-10-02' } },
    sc06: { name: 'affecter_planning', args: { salarie: 'moi', chantier: '', lieu: 'Lyon', dates: ['2026-10-02'], debut: '14:00', fin: '18:00' } },
    sc07: { name: 'repondre', args: { reponse: 'Pour supprimer une intervention : cliquez la case sur le planning, puis « Supprimer ».' } },
    sc08: { name: 'declarer_heures', args: { date: '2026-10-01', lignes: [{ chantier: 'Dupont', debut: '13:00', fin: '16:30' }] } },
    sc09: { name: 'declarer_heures', args: { date: '2026-10-01', lignes: [{ chantier: 'Martin', debut: '08:00', fin: '16:30', pause: 30 }] } },
    sc10: { name: 'planning_collegues', args: { qui: 'Kevin', date: '2026-10-02' } },
    sc11: { name: 'declarer_heures', args: { date: '2026-10-01', lignes: [{ chantier: 'Martin', debut: '08:00', fin: '17:00', pause: 60 }] } },
    sc12: { name: 'repondre', args: { reponse: 'Dün toplam 7 saat 30 dakika çalıştınız.' } },
    // La réponse à une question de l'assistant : l'ACTION complète (Karim, Villa Dupont, demain), la réserve de la ligne e1.
    sc13: { name: 'affecter_planning', args: { salarie: 'Karim', chantier: 'Villa Dupont', dates: ['2026-10-02'] } },
    sc14: { name: 'signaler_reserve', args: { chantier: 'Villa Dupont', detail: 'fissure au plafond' } },
    sc15: { name: 'declarer_heures', args: { date: '2026-10-01', lignes: [{ chantier: 'Martin', debut: '13:00', fin: '16:30' }] } },
  };
  // sc12 : la langue de la réponse n'est pas contrôlée (profil court) ; une réponse française qui reprend les 7 h 30 passe aussi.
  if (await passe('sc12', { name: 'repondre', args: { reponse: 'Hier : 7 h 30 déclarées.' } })) throw new Error('sc12 : la réponse française qui reprend les 7 h 30 est une bonne lecture');
  for (const [id, call] of Object.entries(ok)) {
    const why = await passe(id, call);
    if (why) throw new Error(`${id} devrait passer : ${why}`);
  }
  const ko: [string, Appel, RegExp][] = [
    ['sc01', { name: 'affecter_planning', args: { salarie: 'Karim', chantier: 'Villa Dupont', dates: ['2026-10-02'] } }, /user_id/],
    ['sc01', { name: 'affecter_planning', args: { salarie: 'Kevin', chantier: 'Villa Dupont', dates: ['2026-10-05'] } }, /dates/],
    ['sc02', { name: 'affecter_planning', args: { salarie: 'Karim', chantier: 'Villa Dupont', dates: ['2026-10-02'] } }, /dates/],
    ['sc03', { name: 'affecter_planning', args: { salarie: 'Karim', chantier: 'Villa Dupont', dates: ['2026-10-02'] } }, /attendu supprimer_intervention/],
    ['sc03', { name: 'supprimer_intervention', args: { salarie: 'Kevin', date: '2026-10-02' } }, /pas prête/],
    ['sc03', { name: 'repondre', args: { reponse: 'C’est fait.' } }, /ni action ni question/],
    ['sc04', { name: 'repondre', args: { reponse: 'Je ne sais pas de quel chantier vous parlez.' } }, /ne reprend pas/],
    ['sc05', { name: 'poser_absence', args: { salarie: 'Sofiane', type: 'conge', du: '2026-10-01', au: '2026-10-02' } }, /absence_type/],
    ['sc05', { name: 'poser_absence', args: { salarie: 'Kevin', type: 'maladie', du: '2026-10-01', au: '2026-10-02' } }, /user_id/],
    ['sc06', { name: 'affecter_planning', args: { salarie: 'moi', chantier: '', lieu: 'Lyon', dates: ['2026-10-02'], debut: '08:00', fin: '12:00' } }, /debut/],
    ['sc07', { name: 'supprimer_intervention', args: { salarie: 'Karim', date: '2026-10-02' } }, /attendu une réponse/],
    // sc08 : le matin n'est qu'un BROUILLON (rien n'est enregistré) : « l'après-midi seul » ET « matin + après-midi » sont toutes deux de bonnes lectures (voir plus bas) ;
    // une seule ligne 07:30-16:30, un autre chantier ou un autre créneau échouent.
    ['sc08', { name: 'declarer_heures', args: { date: '2026-10-01', lignes: [{ chantier: 'Dupont', debut: '07:30', fin: '16:30' }] } }, /lignes/],
    ['sc08', { name: 'declarer_heures', args: { date: '2026-10-01', lignes: [{ chantier: 'Dupont', debut: '07:30', fin: '12:00' }, { chantier: 'Martin', debut: '13:00', fin: '16:30' }] } }, /lignes/],
    ['sc08', { name: 'declarer_heures', args: { date: '2026-10-01', lignes: [{ chantier: 'Martin', debut: '13:00', fin: '16:30' }] } }, /lignes/],
    ['sc08', { name: 'declarer_heures', args: { date: '2026-10-01', lignes: [{ chantier: 'Dupont', debut: '14:00', fin: '16:30' }] } }, /lignes/],
    ['sc08', { name: 'declarer_heures', args: { date: '2026-10-02', lignes: [{ chantier: 'Dupont', debut: '13:00', fin: '16:30' }] } }, /2026-10-02/],
    ['sc09', { name: 'declarer_heures', args: { date: '2026-10-01', lignes: [{ chantier: 'Martin', debut: '08:00', fin: '16:30' }] } }, /pause 30/],
    ['sc09', { name: 'terminer_pointage', args: {} }, /attendu des heures/],
    ['sc10', { name: 'planning_collegues', args: { qui: 'Kevin', date: '2026-10-01' } }, /date = 2026-10-01/],
    ['sc10', { name: 'planning_collegues', args: { qui: 'Sofiane', date: '2026-10-02' } }, /qui = « Sofiane »/],
    ['sc11', { name: 'declarer_heures', args: { date: '2026-10-01', lignes: [{ chantier: 'Martin', debut: '08:00', fin: '17:00', pause: 30 }] } }, /pause 60/],
    ['sc12', { name: 'repondre', args: { reponse: 'Dün çok çalıştınız ve bildirdiniz.' } }, /ne reprend pas/],
    ['sc12', { name: 'declarer_heures', args: { date: '2026-09-30', lignes: [{ chantier: 'Martin', debut: '08:00', fin: '16:30' }] } }, /attendu une réponse/],
    // sc13 : traiter « Villa Dupont » seul, ou répondre « c'est déjà fait », ne sont PAS l'action demandée ; un autre salarié, un autre jour non plus.
    ['sc13', { name: 'repondre', args: { reponse: 'Karim est déjà sur Villa Dupont demain, c’est fait.' } }, /attendu l'action affecter_planning/],
    ['sc13', { name: 'repondre', args: { reponse: 'Villa Dupont est un chantier à Lyon.' } }, /attendu l'action affecter_planning/],
    ['sc13', { name: 'affecter_planning', args: { salarie: 'Kevin', chantier: 'Villa Dupont', dates: ['2026-10-02'] } }, /user_id/],
    ['sc13', { name: 'affecter_planning', args: { salarie: 'Karim', chantier: 'Villa Dupont', dates: ['2026-10-05'] } }, /dates/],
    ['sc13', { name: 'affecter_planning', args: { salarie: 'Karim', chantier: 'Bureau Martin', dates: ['2026-10-02'] } }, /worksite_id/],
    // sc14 : la réserve de la bonne ligne (Villa Dupont = e1), pas une réponse ; pas la ligne de Bureau Martin.
    ['sc14', { name: 'repondre', args: { reponse: 'Une fissure au plafond, c’est déjà noté.' } }, /attendu l'action signaler_reserve/],
    ['sc14', { name: 'signaler_reserve', args: { chantier: 'Bureau Martin', detail: 'fissure au plafond' } }, /entry_id/],
    // sc15 : le chantier est CELUI D'AVANT (Martin), jamais celui du planning (Dupont) ; une ligne de 07:30 à 16:30 n'est pas les deux créneaux.
    ['sc15', { name: 'declarer_heures', args: { date: '2026-10-01', lignes: [{ chantier: 'Dupont', debut: '13:00', fin: '16:30' }] } }, /lignes/],
    ['sc15', { name: 'declarer_heures', args: { date: '2026-10-01', lignes: [{ chantier: '', debut: '13:00', fin: '16:30' }] } }, /lignes|chantier/],
    ['sc15', { name: 'declarer_heures', args: { date: '2026-10-01', lignes: [{ chantier: 'Martin', debut: '07:30', fin: '16:30' }] } }, /lignes/],
  ];
  for (const [id, call, re] of ko) {
    const why = await passe(id, call);
    if (!why || !re.test(why)) throw new Error(`${id} ${JSON.stringify(call.args).slice(0, 80)} devrait échouer avec ${re} : ${why}`);
  }
  // sc08 et sc15 : l'après-midi SEUL ou matin + après-midi sont deux bonnes lectures (le matin n'est qu'un brouillon : lignes_du_jour est vide).
  const matinEtAprem = (chantier: string) => ({ name: 'declarer_heures', args: { date: '2026-10-01', lignes: [{ chantier, debut: '07:30', fin: '12:00' }, { chantier, debut: '13:00', fin: '16:30' }] } });
  for (const [id, chantier] of [['sc08', 'Dupont'], ['sc15', 'Martin']] as const) {
    const why = await passe(id, matinEtAprem(chantier));
    if (why) throw new Error(`${id} : matin (brouillon) + après-midi est une bonne lecture : ${why}`);
  }
  // sc03 : une QUESTION pour savoir quoi annuler est acceptée, et la famille « effacer le planning » de Karim demain aussi.
  if (await passe('sc03', { name: 'repondre', args: { reponse: 'Quelle intervention voulez-vous annuler ?' } })) throw new Error('sc03 : une question est une bonne réponse');
  if (await passe('sc03', { name: 'effacer_planning', args: { salarie: 'Karim', du: '2026-10-02', au: '2026-10-02' } })) throw new Error('sc03 : effacer_planning de Karim demain est la bonne famille');
  if (!(await passe('sc03', { name: 'effacer_planning', args: { salarie: 'Karim', du: '2026-10-02', au: '2026-10-09' } }))) throw new Error('sc03 : effacer toute une semaine, non');
});

Deno.test('sl17 / st14 (phrases LONGUES qui renvoient à la conversation) : le chantier d’AVANT, la date de demain, la pause comptée UNE fois — le planning, un autre chantier ou la mauvaise date ÉCHOUENT', async () => {
  const h = (date: string, lignes: unknown[]): { name: string; args: Record<string, unknown> } => ({ name: 'declarer_heures', args: { date, lignes } });
  const l = (chantier: string, debut: string, fin: string, pause?: number) => ({ chantier, debut, fin, ...(pause !== undefined ? { pause } : {}) });
  const DEMAIN = '2026-10-02';
  for (const [id, bon] of [['sl17', h(DEMAIN, [l('Martin', '08:00', '16:30', 30)])], ['st14', h(DEMAIN, [l('Martin', '08:00', '17:00')])]] as const) {
    const why = await passe(id, bon);
    if (why) throw new Error(`${id} devrait passer : ${why}`);
  }
  const ko: [string, ReturnType<typeof h>, RegExp][] = [
    // Le chantier « deviné » (Villa Dupont : celui du planning d'aujourd'hui, jamais dit par l'utilisateur) ou absent : la ligne n'est pas chez Bureau Martin.
    ['sl17', h(DEMAIN, [l('Dupont', '08:00', '16:30', 30)]), /chantier/],
    ['sl17', h(DEMAIN, [l('', '08:00', '16:30', 30)]), /chantier/],
    ['sl17', h('2026-10-01', [l('Martin', '08:00', '16:30', 30)]), /date = 2026-10-01/],
    ['sl17', h(DEMAIN, [l('Martin', '08:00', '16:30')]), /net = 510/],
    ['sl17', h(DEMAIN, [l('Martin', '08:00', '17:00', 30)]), /créneaux/],
    ['st14', h(DEMAIN, [l('Dupont', '08:00', '17:00')]), /chantier/],
    ['st14', h(DEMAIN, [l('', '08:00', '17:00')]), /chantier/],
    ['st14', h('2026-10-01', [l('Martin', '08:00', '17:00')]), /date = 2026-10-01/],
    ['st14', h(DEMAIN, [l('Martin', '08:00', '16:00')]), /créneaux/],
    ['st14', { name: 'repondre', args: { reponse: 'Yarın için aynı taslak hazır.' } }, /éléments/],
  ];
  for (const [id, call, re] of ko) {
    const why = await passe(id, call);
    if (!why || !re.test(why)) throw new Error(`${id} ${JSON.stringify(call.args).slice(0, 90)} devrait échouer avec ${re} : ${why}`);
  }
});
