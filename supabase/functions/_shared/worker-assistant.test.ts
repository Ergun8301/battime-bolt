// Tests de l'assistant salarié (lot 4) : `npm run test:assistant-salarie` (Deno).
import {
  answerSimpleQuestion, buildWorkerSnapshot, checkDraft, handleLocally, mondayOf, parseHoursText, resolveWorksite, sanitizeWorkerAi,
  workerPrompt, WORKER_SCHEMA, type WorkerSnapshot,
} from './worker-assistant-core.ts';
import { extractJson } from './ai-provider.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
const BTP: WorkerSnapshot = {
  aujourdhui: '2026-09-29',
  chantiers: [
    { id: 'w-dupont', nom: 'Villa Dupont', ville: 'Lyon' },
    { id: 'w-martin', nom: 'Bureau Martin', ville: 'Villeurbanne' },
    { id: 'w-leclerc', nom: 'Résidence Leclerc', ville: 'Bron' },
    { id: 'w-leclerc2', nom: 'Leclerc Drive', ville: 'Bron' },
    { id: 'w-ecole', nom: 'École Jules Ferry', ville: 'Lyon' },
  ],
  semaine: [{ date: '2026-09-28', minutes: 480 }, { date: '2026-09-29', minutes: 270 }],
  planning: [
    { date: '2026-09-30', chantier_id: 'w-dupont', chantier: 'Villa Dupont', debut: '07:30:00', fin: '16:30:00', absence: null },
    { date: '2026-09-29', chantier_id: 'w-martin', chantier: 'Bureau Martin', debut: '08:00:00', fin: '17:00:00', absence: null },
  ],
};
const RESTO: WorkerSnapshot = { ...BTP, chantiers: [{ id: 'r-comptoir', nom: 'Le Comptoir', ville: 'Lyon' }] };
const lines = (text: string, s = BTP) => {
  const d = parseHoursText(text, s);
  if (!d) throw new Error(`non compris : ${text}`);
  return { date: d.date, errors: d.errors, l: d.lines.map((x) => [x.worksite_id, x.start, x.end, x.break_minutes]) };
};

Deno.test('10 phrases réalistes (BTP + restaurant)', () => {
  eq(lines('Ce matin 7h30-12h Villa Dupont, après-midi 13h-16h30 Bureau Martin').l,
    [['w-dupont', '07:30', '12:00', 0], ['w-martin', '13:00', '16:30', 0]], '1. exemple du cahier des charges');
  eq(lines("j'ai bossé de 8h à 12h chez Dupont puis de 13h30 à 17h chez Martin").l,
    [['w-dupont', '08:00', '12:00', 0], ['w-martin', '13:30', '17:00', 0]], '2. « de … à … chez … puis »');
  eq(lines('hier 7h-15h30 école jules ferry pause 30 min'),
    { date: '2026-09-28', errors: [], l: [['w-ecole', '07:00', '15:30', 30]] }, '3. hier + pause + accents');
  eq(lines('8h/12h villa dupont, 13h/17h bureau martin').l,
    [['w-dupont', '08:00', '12:00', 0], ['w-martin', '13:00', '17:00', 0]], '4a. « 8h/12h »');
  eq(lines('7h30 - 12h villa dupont et 13h - 16h villa dupont').l,
    [['w-dupont', '07:30', '12:00', 0], ['w-dupont', '13:00', '16:00', 0]], '4. deux plages reliées par « et »');
  eq(lines('de 7h à midi sur le chantier Bureau Martin').l, [['w-martin', '07:00', '12:00', 0]], '5. « midi »');
  eq(lines('6h45-14h15 résidence leclerc').l, [['w-leclerc', '06:45', '14:15', 0]], '6. minutes partout');
  eq(lines('service midi 11h-15h, service soir 18h30-23h', RESTO).l,
    [['r-comptoir', '11:00', '15:00', 0], ['r-comptoir', '18:30', '23:00', 0]], '7. resto, coupure, un seul établissement');
  eq(lines('ce soir 19h-1h30', RESTO).l, [['r-comptoir', '19:00', '01:30', 0]], '8. resto, fermeture après minuit');
  eq(lines('avant-hier 7:30-16:00 villa dupont pause 1h').l, [['w-dupont', '07:30', '16:00', 60]], '9. « 7:30 » + pause 1h');
  eq(lines('avant-hier 7:30-16:00 villa dupont pause 1h').date, '2026-09-27', '9b. avant-hier');
  eq(lines('entre 8h et 12h bureau martin').l, [['w-martin', '08:00', '12:00', 0]], '10. « entre … et … »');
});

Deno.test('Chantier ambigu ou inconnu : aucun choix inventé', () => {
  eq(resolveWorksite('Leclerc', BTP.chantiers), null, '« Leclerc » = 2 chantiers → ambigu');
  eq(resolveWorksite('résidence leclerc', BTP.chantiers), 'w-leclerc', 'précisé → trouvé');
  eq(resolveWorksite('chantier Moreau', BTP.chantiers), null, 'inconnu');
  const d = parseHoursText('8h-12h leclerc', BTP)!;
  eq([d.lines[0].worksite_id, d.lines[0].worksite_text], [null, 'leclerc'], 'brouillon sans chantier, texte gardé pour la liste');
  eq(parseHoursText('8h-12h', { ...BTP, planning: [] })!.lines[0].worksite_id, null, 'rien dit, rien au planning + plusieurs chantiers → à choisir');
});

Deno.test('Chantier non dit : pré-sélection depuis SON planning, modifiable', () => {
  const JOUR: WorkerSnapshot = { ...BTP, planning: [
    { date: '2026-09-29', chantier_id: 'w-dupont', chantier: 'Villa Dupont', debut: '07:30:00', fin: '12:00:00', absence: null },
    { date: '2026-09-29', chantier_id: 'w-martin', chantier: 'Bureau Martin', debut: '13:00:00', fin: '16:30:00', absence: null },
  ] };
  const d = parseHoursText('Ce matin 7h30-12h, après-midi 13h-16h30', JOUR)!;
  eq(d.lines.map((l) => [l.worksite_id, l.from_planning ?? false]), [['w-dupont', true], ['w-martin', true]], '1. chaque créneau → le chantier prévu à cette heure');
  eq(handleLocally('Ce matin 7h30-12h, après-midi 13h-16h30', JOUR)!.answer, 'Chantier repris de votre planning : vérifiez, puis enregistrez.', '1b. message clair');
  eq(parseHoursText('8h-12h', BTP)!.lines[0].worksite_id, 'w-martin', '2. un seul chantier prévu ce jour → celui-là');
  eq(parseHoursText('8h-12h bureau martin', JOUR)!.lines[0].from_planning ?? false, false, '3. chantier dit → le planning ne l’écrase pas');
  eq(parseHoursText('8h-12h leclerc', JOUR)!.lines[0].worksite_id, null, '4. chantier dit mais ambigu → liste, pas le planning');
  eq(parseHoursText('hier 8h-12h', JOUR)!.lines[0].worksite_id, null, '5. rien au planning ce jour-là → « Choisir le chantier… »');
  eq(parseHoursText('18h-20h', JOUR)!.lines[0].worksite_id, null, '6. créneau hors des horaires prévus (2 chantiers) → à choisir');
  const absent: WorkerSnapshot = { ...BTP, planning: [{ date: '2026-09-29', chantier_id: 'w-dupont', chantier: 'Villa Dupont', debut: null, fin: null, absence: 'conge' }] };
  eq(parseHoursText('8h-12h', absent)!.lines[0].worksite_id, null, '7. jour d’absence : aucun chantier pré-rempli');
  const ailleurs: WorkerSnapshot = { ...BTP, planning: [{ date: '2026-09-29', chantier_id: 'w-archive', chantier: null, debut: null, fin: null, absence: null }] };
  eq(parseHoursText('8h-12h', ailleurs)!.lines[0].worksite_id, null, '8. chantier du planning hors de sa liste → rien');
  const ai = sanitizeWorkerAi({ kind: 'draft', answer: '', date: '2026-09-29', lines: [{ chantier: '', debut: '13:00', fin: '16:30', pause: 0 }] }, JOUR);
  if (ai.kind !== 'draft') throw new Error('brouillon attendu');
  eq([ai.draft.lines[0].worksite_id, ai.draft.lines[0].from_planning], ['w-martin', true], '9. même règle pour la voie IA');
});

Deno.test('Horaires incohérents refusés', () => {
  eq(parseHoursText('12h-8h villa dupont', BTP)!.errors.length, 1, '20 h de travail : refusé');
  eq(parseHoursText('8h-8h villa dupont', BTP)!.errors.length, 1, 'début = fin');
  eq(parseHoursText('25h-26h villa dupont', BTP)!.lines.length, 0, 'heures impossibles');
  eq(parseHoursText('8h-12h villa dupont pause 5h', BTP)!.errors.length, 1, 'pause plus longue que le créneau');
  eq(parseHoursText('8h-12h villa dupont, 11h-14h bureau martin', BTP)!.errors.some((e) => e.includes('chevauchent')), true, 'chevauchement');
  eq(checkDraft('2026-10-05', [{ worksite_id: 'w-dupont', worksite_text: '', start: '08:00', end: '12:00', break_minutes: 0 }], BTP).errors.length, 1, 'date trop loin dans le futur');
  eq(checkDraft('2026-09-29', [{ worksite_id: 'w-intrus', worksite_text: '', start: '08:00', end: '12:00', break_minutes: 0 }], BTP).lines[0].worksite_id, null, 'identifiant hors liste écarté');
});

Deno.test('Questions sur SES données uniquement', () => {
  eq(answerSimpleQuestion('Combien d’heures cette semaine ?', BTP), 'Cette semaine : 12 h 30 déclarées sur 2 jours.', 'semaine');
  eq(answerSimpleQuestion('Mon planning demain ?', BTP), 'Demain : Villa Dupont de 07:30 à 16:30.', 'planning demain');
  const REFUS = 'Je ne peux répondre que sur vos propres heures ; pour vos collègues, seulement où ils sont au planning.';
  eq(answerSimpleQuestion('combien je gagne de l’heure ?', BTP), REFUS, 'coût refusé');
  eq(answerSimpleQuestion('les heures de mes collègues ?', BTP), REFUS, 'heures des collègues refusées (lot 7 : seulement où ils sont)');
  eq(handleLocally('raconte une blague', BTP), null, 'hors sujet → IA');
  if (JSON.stringify(BTP).match(/cost|taux|rate/i)) throw new Error('instantané avec un coût');
});

Deno.test('IA simulée : le chantier est re-vérifié, les horaires re-contrôlés', async () => {
  const fake = () => Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
    kind: 'draft', answer: '', date: '2026-09-29',
    lines: [{ chantier: 'Chantier Inventé', debut: '8h', fin: '12h', pause: 0 }, { chantier: 'Villa Dupont', debut: '13:00', fin: '09:00', pause: 0 }],
  }) }] } }] })));
  const r = await extractJson({ prompt: workerPrompt(BTP, 'x'), schema: WORKER_SCHEMA }, { get: (k) => (k === 'GEMINI_API_KEY' ? 'k' : undefined) }, fake);
  if (!r.ok) throw new Error('réponse attendue');
  const s = sanitizeWorkerAi(r.data, BTP);
  if (s.kind !== 'draft') throw new Error('brouillon attendu');
  eq(s.draft.lines.map((l) => [l.worksite_id, l.start, l.end]), [[null, '08:00', '12:00']], 'chantier inventé → à choisir ; 13h→9h écarté');
  eq(s.draft.errors.length, 1, 'erreur signalée');
  eq(sanitizeWorkerAi({ kind: 'answer', answer: '' }, BTP).kind, 'answer', 'réponse vide gérée');
});

Deno.test('Instantané : jamais les heures ni le planning d’un collègue', () => {
  const s = buildWorkerSnapshot({
    userId: 'moi', companyId: 'c1', today: '2026-09-29',
    worksites: [{ id: 'w1', company_id: 'c1', client_name: 'Villa Dupont', city: null }, { id: 'wx', company_id: 'c2', client_name: 'Secret', city: null }],
    entries: [
      { user_id: 'moi', work_date: '2026-09-28', start_time: '08:00:00', end_time: '12:00:00', break_minutes: 0, status: 'draft' },
      { user_id: 'moi', work_date: '2026-09-29', start_time: '13:00:00', end_time: '17:30:00', break_minutes: 30, status: 'submitted' },
      { user_id: 'moi', work_date: '2026-09-21', start_time: '08:00:00', end_time: '17:00:00', break_minutes: 0, status: 'draft' },
      { user_id: 'moi', work_date: '2026-09-29', start_time: '07:00:00', end_time: '08:00:00', break_minutes: 0, status: 'cancelled' },
      { user_id: 'collegue', work_date: '2026-09-29', start_time: '06:00:00', end_time: '20:00:00', break_minutes: 0, status: 'draft' },
    ],
    planning: [
      { user_id: 'moi', work_date: '2026-09-30', estimated_start: '07:30', estimated_end: '16:30', absence_type: null, worksite_id: 'w1' },
      { user_id: 'collegue', work_date: '2026-09-30', estimated_start: '05:00', estimated_end: '12:00', absence_type: null, worksite_id: 'w1' },
    ],
  });
  eq(s.semaine, [{ date: '2026-09-28', minutes: 240 }, { date: '2026-09-29', minutes: 240 }], 'ses heures de la semaine seulement');
  eq(s.planning.length, 1, 'son planning seulement');
  eq(s.chantiers.map((c) => c.id), ['w1'], 'chantiers de son entreprise');
  if (JSON.stringify(s).includes('collegue') || JSON.stringify(s).includes('Secret')) throw new Error('fuite');
  eq(mondayOf('2026-10-04'), '2026-09-28', 'lundi d’un dimanche');
});

// ═══ Lot 3 bis — guide et actions du salarié ════════════════════════════════
import {
  checkWorkerAction, fromWorkerCall, handleWorkerLocally, prepareWorkerAction, WORKER_FUNCTIONS, type WorkerLive,
} from './worker-assistant-core.ts';
import { callFunction } from './ai-provider.ts';

const IDLE: WorkerLive = { enCours: null, lignes: [{ id: 'e1', chantier: 'Villa Dupont', debut: '07:30', fin: '12:00', envoyee: false }, { id: 'e2', chantier: 'Bureau Martin', debut: '13:00', fin: '16:30', envoyee: true }] };
const RUNNING: WorkerLive = { enCours: { chantier_id: 'w-martin', chantier: 'Bureau Martin', depuis: '2026-09-29T06:02:00Z' }, lignes: [] };
const kindOf = (r: unknown) => (r as { kind: string }).kind;
const act = (r: unknown) => (r as { action: { draft: Record<string, unknown>; problems: string[] } }).action;

Deno.test('3 bis salarié — actions locales : pointage, congé, réserve, guide', () => {
  const start = handleWorkerLocally('Je commence sur villa dupont', BTP, IDLE);
  eq([kindOf(start), act(start).draft.type, act(start).draft.worksite_id, act(start).problems], ['action', 'commencer_pointage', 'w-dupont', []], 'début de pointage, chantier résolu');
  eq(act(handleWorkerLocally('Je commence mon pointage', BTP, IDLE)).draft.worksite_id, 'w-martin', 'rien dit → chantier du planning du jour');
  eq(act(handleWorkerLocally('je commence', BTP, RUNNING)).problems, ['Un pointage est déjà en cours (Bureau Martin).'], 'déjà en cours → bloqué');
  const stop = handleWorkerLocally("J'ai fini", BTP, RUNNING);
  eq([act(stop).draft.type, act(stop).problems], ['terminer_pointage', []], 'fin de pointage');
  eq(act(handleWorkerLocally('termine mon pointage', BTP, IDLE)).problems, ['Aucun pointage en cours.'], 'rien à terminer');
  const leave = handleWorkerLocally('Demander un congé', BTP, IDLE);
  eq([act(leave).draft.type, act(leave).problems], ['demander_conge', ['Choisissez les dates.']], 'carte de congé à remplir');
  const res = handleWorkerLocally('Signaler une réserve sur villa dupont : fissure mur sud', BTP, IDLE);
  eq([act(res).draft.entry_id, act(res).draft.detail, act(res).problems], ['e1', 'fissure mur sud', []], 'réserve : chantier et détail');
  eq(act(handleWorkerLocally('signaler une réserve', BTP, IDLE)).problems, ['Choisissez le chantier.'], 'deux chantiers → à choisir');
  eq(checkWorkerAction({ type: 'signaler_reserve', entry_id: 'e1', detail: '', choix: IDLE.lignes }, BTP, IDLE), [], 'détail FACULTATIF');
  const g = handleWorkerLocally('Comment je signale une réserve ?', BTP, IDLE) as { kind: string; links: { action: string }[]; answer: string };
  eq([g.kind, g.links[0].action], ['guide', 'journee'], 'guide + M’y emmener');
  eq(g.answer.split('\n').length, 4, '3 étapes');
  eq((handleWorkerLocally('comment j’ajoute une photo', BTP, IDLE) as { links: { action: string }[] }).links[0].action, 'journee', 'photo → Ma journée');
  eq(kindOf(handleWorkerLocally('7h30-12h villa dupont', BTP, IDLE)), 'draft', 'les heures (lot 4) marchent toujours');
  eq(kindOf(handleWorkerLocally('les heures de mes collègues ?', BTP, IDLE)), 'answer', 'collègues toujours refusés');
});

Deno.test('3 bis salarié — IA simulée (appel de fonctions)', async () => {
  const fake = (name: string, args: Record<string, unknown>) => () =>
    Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }] })));
  const env = { get: (k: string) => (k === 'GEMINI_API_KEY' ? 'AQ.k' : undefined) };
  const r = await callFunction({ prompt: 'x', functions: WORKER_FUNCTIONS }, env, fake('demander_conge', { type: 'conge', du: '2026-10-12', au: '2026-10-16', note: 'mariage' }));
  if (!r.ok) throw new Error('appel refusé');
  const leave = fromWorkerCall(r.call.name, r.call.args, BTP, IDLE);
  eq([act(leave).draft.du, act(leave).draft.au, act(leave).problems], ['2026-10-12', '2026-10-16', []], 'congé prêt');
  const hours = fromWorkerCall('declarer_heures', { date: '2026-09-29', lignes: [{ chantier: 'Villa Dupont', debut: '7:30', fin: '12:00' }] }, BTP, IDLE);
  eq(kindOf(hours), 'draft', 'heures → brouillon du lot 4');
  const refus = fromWorkerCall('repondre', { reponse: 'Je n’ai pas accès à ça.' }, BTP, IDLE) as { answer: string };
  if (/pas acc[eè]s/.test(refus.answer)) throw new Error('refus non remplacé');
  eq(prepareWorkerAction('supprimer_heures', {}, BTP, IDLE), null, 'action hors liste → rien');
  if (JSON.stringify(WORKER_FUNCTIONS).match(/cout|salaire|supprim/i) && !JSON.stringify(WORKER_FUNCTIONS).includes('jamais')) throw new Error('fonction interdite exposée');
});

Deno.test('📎 Salarié : photo → documents du bon chantier + « Avec réserve » pré-rempli', () => {
  const SNAP = { ...BTP, chantiers: [...BTP.chantiers, { id: 'w-dupont-viriat', nom: 'Dupont', ville: 'Viriat' }] };
  const LIVE: WorkerLive = { enCours: null, lignes: [{ id: 'e9', chantier: 'Dupont', chantier_id: 'w-dupont-viriat', debut: '07:30', fin: '16:00', envoyee: false }] };
  const r = fromWorkerCall('ranger_photo', { chantier: 'Dupont à Viriat', reserve: true, detail: 'joint à reprendre' }, SNAP, LIVE);
  eq([act(r).draft.worksite_id, act(r).draft.reserve, act(r).draft.detail, act(r).problems], ['w-dupont-viriat', true, 'Joint à reprendre', []], 'bon chantier, réserve, détail modifiable (nettoyé)');
  eq(act(fromWorkerCall('ranger_photo', { chantier: 'Dupont', reserve: false }, SNAP, LIVE)).problems, ['Choisissez le chantier.'], '« Dupont » ambigu → liste');
  eq(act(fromWorkerCall('ranger_photo', { chantier: 'Bureau Martin', reserve: true }, SNAP, LIVE)).problems.length, 1, 'réserve sans heures ce jour-là → signalé');
  eq(checkWorkerAction({ type: 'ranger_photo', worksite_id: 'w-dupont-viriat', chantier_texte: '', reserve: true, detail: '', lignes: LIVE.lignes }, SNAP, LIVE), [], 'détail de réserve FACULTATIF');
});
