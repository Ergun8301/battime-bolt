// Lot 7 — le banc d'évaluation lui-même, SANS IA (le modèle répond « indisponible ») :
// vérifie que le jeu tourne et donne le score du lecteur local seul.
//   npm run test:assistant-eval
// Avec une clé : GEMINI_API_KEY=… deno run -A supabase/functions/assistant-eval/cli.ts v2
import { runEval } from './run.ts';
import { CASES, LIVE_VIDE, WORKER_LIVE, type Outcome } from './cases.ts';

Deno.test('Jeu d’évaluation : les 80 phrases d’origine (dans l’ordre) + les phrases longues du salarié, bureau ET salarié', () => {
  if (new Set(CASES.map((c) => c.id)).size !== CASES.length) throw new Error('identifiants en double');
  if (!CASES.some((c) => c.cote === 'bureau') || !CASES.some((c) => c.cote === 'salarie')) throw new Error('un côté manque');
  const anciens = [...Array.from({ length: 47 }, (_, i) => `b${String(i + 1).padStart(2, '0')}`), ...Array.from({ length: 33 }, (_, i) => `s${String(i + 1).padStart(2, '0')}`)];
  if (JSON.stringify(CASES.slice(0, 80).map((c) => c.id)) !== JSON.stringify(anciens)) throw new Error('les 80 phrases b01–b47, s01–s33 doivent rester en tête, dans l’ordre');
  const longs = CASES.filter((c) => /^(sl|st)\d\d$/.test(c.id));
  if (longs.length < 14 || longs.length !== CASES.length - 80) throw new Error(`${longs.length} phrases longues (au moins 14 ; 27 attendues)`);
  if (longs.filter((c) => c.categorie === 'Long FR').length !== 16 || longs.filter((c) => c.categorie === 'Long TR').length !== 11 || longs.some((c) => c.cote !== 'salarie')) throw new Error('16 « Long FR » et 11 « Long TR », côté salarié');
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

// ── Les 27 phrases longues avec une sortie PLAUSIBLE du modèle (y compris ses défauts mesurés) : toutes passent ──
// C'est le test de bout en bout du code (redécoupage, pause, rattachement, annexes) ; la vraie réussite se mesure sur le vrai modèle.
Deno.test('27 phrases longues : une sortie plausible du modèle (créneaux fusionnés, pause doublée, civilité devant le nom…) passe par le MÊME chemin que la production', async () => {
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
