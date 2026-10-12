// Salarié — le tour partagé (prod ET banc) : les 33 phrases existantes gardent EXACTEMENT leur chemin (lecteur local, même
// consigne, mêmes outils, aucun champ de plus dans la requête) ; les phrases libres prennent le profil long, jamais le lecteur local.
//   npm run test:worker-turn
import { tierFor, type ToolsRequest, type ToolsResult } from './ai-provider.ts';
import { WORKER_TEXT_MAX } from './saisie-profil.ts';
import {
  buildWorkerSnapshot, fromWorkerCall, handleWorkerLocally, workerFunctionPrompt, workerFunctionsFor, type WorkerLive, type WorkerSnapshot,
} from './worker-assistant-core.ts';
import type { WorkerMultiReply } from './worker-multi.ts';
import { workerFunctionsForLong, workerMultiPrompt } from './worker-multi-prompt.ts';
import { runWorkerTurn, workerProfile, type WorkerTurnInput } from './worker-turn.ts';
import { CASES, FILES, LIVE_EN_COURS, LIVE_VIDE, WORKER_LIVE, WORKER_RAW } from '../assistant-eval/cases.ts';

const snap = (): WorkerSnapshot => buildWorkerSnapshot(WORKER_RAW as never);
const ERGUN = CASES.find((c) => c.id === 'sl01')!.phrase;
const json = (x: unknown) => JSON.stringify(x);
const eq = (a: unknown, b: unknown, msg: string) => { if (json(a) !== json(b)) throw new Error(`${msg} : ${json(a)} (attendu ${json(b)})`); };

/** Un faux modèle qui enregistre ce qu'on lui envoie. */
function recorder(result: ToolsResult | ((r: ToolsRequest) => ToolsResult)) {
  const reqs: ToolsRequest[] = [];
  const call = async (req: ToolsRequest) => { reqs.push(req); return typeof result === 'function' ? result(req) : result; };
  return { reqs, call };
}
const repondre: ToolsResult = { ok: true, call: { name: 'repondre', args: { reponse: 'Réponse de test assez longue.' } } };
const entree = (over: Partial<WorkerTurnInput> & { text: string }): WorkerTurnInput => ({
  snapshot: snap(), live: WORKER_LIVE as WorkerLive, tier: 'rapide', call: async () => repondre, iaDisponible: true, multiOk: true, ...over,
});

Deno.test('Non-régression : les 33 phrases salarié d’origine sont « courtes » et gardent EXACTEMENT leur chemin (local, ou même consigne + mêmes outils + aucun champ de plus)', async () => {
  const anciens = CASES.filter((c) => /^s\d\d$/.test(c.id));
  if (anciens.length !== 33) throw new Error(`${anciens.length} phrases salarié d'origine`);
  const viaIa: string[] = [];
  let locaux = 0;
  for (const c of anciens) {
    const file = c.file ? FILES[c.file] : undefined;
    const live = { ...WORKER_LIVE, enCours: c.enCours ? LIVE_EN_COURS : null } as WorkerLive;
    if (workerProfile(c.phrase, !!file) !== 'court') throw new Error(`${c.id} : devrait rester « court »`);
    // Ce que ferait le code d'avant, calculé directement.
    const s0 = snap(); s0.demande = c.phrase;
    const local = file ? null : handleWorkerLocally(c.phrase, s0, live);
    const rec = recorder(repondre);
    const t = await runWorkerTurn({ text: c.phrase, file, snapshot: snap(), live, tier: tierFor(!!file), call: rec.call, iaDisponible: true, multiOk: true });
    if (local) {
      locaux++;
      if (t.via !== 'local' || json(t.reply) !== json(local) || rec.reqs.length) throw new Error(`${c.id} : le lecteur local doit répondre seul, à l'identique`);
      continue;
    }
    viaIa.push(c.id);
    if (t.via !== 'ia' || t.profil !== 'court' || t.appels !== 1 || rec.reqs.length !== 1) throw new Error(`${c.id} : un seul appel, profil court`);
    const req = rec.reqs[0];
    eq(Object.keys(req).sort(), ['file', 'functions', 'prompt', 'tier'], `${c.id} : champs de la requête (aucun profil ni maxCalls)`);
    eq(req.prompt, workerFunctionPrompt(s0, live, c.phrase), `${c.id} : consigne d'avant`);
    eq(req.functions.map((f) => f.name), workerFunctionsFor(!!file, c.phrase).map((f) => f.name), `${c.id} : outils d'avant`);
    eq(req.functions, workerFunctionsFor(!!file, c.phrase), `${c.id} : déclarations d'avant`);
    eq(req.tier, tierFor(!!file), `${c.id} : palier`);
    eq(req.file, file, `${c.id} : fichier`);
    eq(t.reply, fromWorkerCall('repondre', { reponse: 'Réponse de test assez longue.' }, s0, live), `${c.id} : réponse`);
  }
  // Les 9 phrases qui passent déjà par le modèle gardent le même chemin, la même consigne et les mêmes outils.
  eq(viaIa, ['s01', 's04', 's08', 's13', 's16', 's17', 's23', 's24', 's30'], 'phrases passées par le modèle');
  if (locaux !== 24) throw new Error(`${locaux} phrases locales (24 attendues)`);
});

Deno.test('Ancien navigateur (multiOk faux) : TOUJOURS le chemin d’avant, même pour la phrase d’Ergun (lecteur local d’abord, ancienne consigne, aucun champ de plus)', async () => {
  for (const c of CASES.filter((x) => /^(sl|st)\d\d$/.test(x.id))) {
    if (workerProfile(c.phrase, false, false) !== 'court') throw new Error(`${c.id} : court sans multiOk`);
    const live = (c.live === 'vide' ? LIVE_VIDE : WORKER_LIVE) as WorkerLive;
    const s0 = snap(); s0.demande = c.phrase;
    const local = handleWorkerLocally(c.phrase, s0, live);
    const rec = recorder(repondre);
    const t = await runWorkerTurn(entree({ text: c.phrase, live, call: rec.call, multiOk: false }));
    if (local) { if (t.via !== 'local' || json(t.reply) !== json(local)) throw new Error(`${c.id} : lecteur local d'abord`); continue; }
    if (t.via !== 'ia' || t.profil !== 'court' || rec.reqs.length !== 1) throw new Error(`${c.id} : ancien chemin`);
    eq(Object.keys(rec.reqs[0]).sort(), ['file', 'functions', 'prompt', 'tier'], `${c.id} : requête d'avant`);
    eq(rec.reqs[0].prompt, workerFunctionPrompt(s0, live, c.phrase), `${c.id} : ancienne consigne`);
  }
  // Le texte reste coupé à 1500 caractères côté serveur (jamais plus, quel que soit le client).
  const long = 'a'.repeat(WORKER_TEXT_MAX) + 'ZZZ';
  const rec = recorder(repondre);
  await runWorkerTurn(entree({ text: long, call: rec.call, multiOk: false }));
  if (rec.reqs[0].prompt.includes('ZZZ') || !rec.reqs[0].prompt.endsWith('a'.repeat(WORKER_TEXT_MAX))) throw new Error('coupé à 1500');
});

Deno.test('Un fichier joint force le profil court (outils restreints à ranger_photo / repondre : un PDF piégé ne peut rien d’autre)', async () => {
  eq(workerProfile(ERGUN, true), 'court', 'phrase longue + fichier');
  const rec = recorder(repondre);
  const t = await runWorkerTurn(entree({ text: ERGUN, file: FILES.facture, tier: 'documents', call: rec.call }));
  if (t.via !== 'ia' || t.profil !== 'court') throw new Error('court');
  eq(rec.reqs[0].functions.map((f) => f.name).sort(), ['ranger_photo', 'repondre'], 'outils du fichier');
  eq(rec.reqs[0].tier, 'documents', 'palier documents');
  eq(Object.keys(rec.reqs[0]).sort(), ['file', 'functions', 'prompt', 'tier'], 'aucun champ de plus');
});

Deno.test('Profil long : JAMAIS le lecteur local, le palier de quota reste « rapide », requête profil:long + maxCalls:4, une demande = un appel au modèle', async () => {
  for (const c of CASES.filter((x) => /^(sl|st)\d\d$/.test(x.id))) {
    const rec = recorder(repondre);
    const live = (c.live === 'vide' ? LIVE_VIDE : WORKER_LIVE) as WorkerLive;
    const t = await runWorkerTurn(entree({ text: c.phrase, live, call: rec.call }));
    if (t.via === 'local') throw new Error(`${c.id} : le lecteur local ne doit jamais lire une phrase longue`);
    if (rec.reqs.length !== 1) throw new Error(`${c.id} : ${rec.reqs.length} appels au modèle`);
    const r = rec.reqs[0];
    if (r.profil !== 'long' || r.maxCalls !== 4 || r.tier !== 'rapide' || r.file !== undefined) throw new Error(`${c.id} : requête ${json({ profil: r.profil, maxCalls: r.maxCalls, tier: r.tier })}`);
    const s0 = snap(); s0.demande = c.phrase;
    eq(r.prompt, workerMultiPrompt(s0, live, c.phrase), `${c.id} : consigne du profil long`);
    eq(r.functions.map((f) => f.name), workerFunctionsForLong(c.phrase).map((f) => f.name), `${c.id} : outils du profil long`);
    if (r.functions.some((f) => f.name === 'ranger_photo')) throw new Error(`${c.id} : jamais ranger_photo`);
    if (t.via === 'ia' && t.profil !== 'long') throw new Error(`${c.id} : profil`);
  }
});

Deno.test('Profil long sans clé : « sans_cle », jamais le lecteur local (il reproduirait le bug) ; le court sans clé garde son message', async () => {
  const rec = recorder(repondre);
  const t = await runWorkerTurn(entree({ text: ERGUN, call: rec.call, iaDisponible: false }));
  eq(t, { via: 'erreur', profil: 'long', raison: 'sans_cle' }, 'long sans clé');
  if (rec.reqs.length) throw new Error('aucun appel sans clé');
  const court = await runWorkerTurn(entree({ text: 'blabla incompréhensible', iaDisponible: false }));
  eq(court, { via: 'erreur', profil: 'court', raison: 'sans_cle' }, 'court sans clé');
  // Une phrase que le lecteur local comprend marche même sans clé (comme avant).
  eq((await runWorkerTurn(entree({ text: 'envoie ma journée', iaDisponible: false }))).via, 'local', 'local sans clé');
});

Deno.test('Échec du fournisseur : la raison remonte, aucune réponse inventée (long ET court)', async () => {
  for (const reason of ['provider_error', 'bad_response', 'not_configured'] as const) {
    eq(await runWorkerTurn(entree({ text: ERGUN, call: async () => ({ ok: false, reason }) })), { via: 'erreur', profil: 'long', raison: reason }, `long ${reason}`);
    eq(await runWorkerTurn(entree({ text: 'blabla incompréhensible', call: async () => ({ ok: false, reason }) })), { via: 'erreur', profil: 'court', raison: reason }, `court ${reason}`);
  }
});

Deno.test('Phrase d’Ergun, sortie fusionnée du faux modèle (08:00-17:00 pause 60 + bloc) → UNE fiche : deux créneaux, net 8 h, nouveau chantier ; le modèle de secours rend la fiche « incertaine »', async () => {
  const fusionne = { name: 'declarer_heures', args: { date: '2026-10-01', lignes: [{ chantier: 'nouveau', debut: '08:00', fin: '17:00', pause: 60 }], nouveau_chantier: { nom: 'Pierrick Dupont', code_postal: '01250', ville: 'Montagna', description: 'pose d’un store banne' } } };
  const t = await runWorkerTurn(entree({ text: ERGUN, live: LIVE_VIDE as WorkerLive, call: async () => ({ ok: true, call: fusionne, calls: [fusionne] }) }));
  if (t.via !== 'ia' || t.profil !== 'long' || t.appels !== 1) throw new Error(json(t));
  const r = t.reply as WorkerMultiReply;
  eq(r.kind, 'multi', 'une fiche');
  const it = r.items[0];
  if (r.items.length !== 1 || it.kind !== 'heures') throw new Error('un seul élément : les heures');
  eq(it.draft.lines.map((l) => `${l.start}-${l.end}/${l.break_minutes}`), ['08:00-12:00/0', '13:00-17:00/0'], 'deux créneaux, pause 0 sur chacun');
  eq(it.draft.lines.map((l) => l.gap_before ?? null), [null, 'pause'], 'pause marquée');
  eq(it.draft.nouveau_chantier?.nom, 'Pierrick Dupont', 'nouveau chantier');
  const sec = await runWorkerTurn(entree({ text: ERGUN, live: LIVE_VIDE as WorkerLive, call: async () => ({ ok: true, call: fusionne, calls: [fusionne], secours: true }) }));
  if (sec.via !== 'ia' || sec.secours !== true || (sec.reply as WorkerMultiReply).incertain !== true) throw new Error('secours : fiche incertaine');
  // Plusieurs appels : tous pris en compte, comptés.
  const deux = [fusionne, { name: 'panier_repas', args: { valeur: true } }];
  const m = await runWorkerTurn(entree({ text: ERGUN + ' Mets le panier repas.', live: LIVE_VIDE as WorkerLive, call: async () => ({ ok: true, call: deux[0], calls: deux }) }));
  if (m.via !== 'ia' || m.appels !== 2) throw new Error('2 appels');
  eq((m.reply as WorkerMultiReply).items.map((i) => i.kind), ['heures', 'action'], 'heures puis panier');
  // Un résultat sans « calls » (ancienne forme { ok, call }) est lu comme UN appel.
  const sans = await runWorkerTurn(entree({ text: ERGUN, live: LIVE_VIDE as WorkerLive, call: async () => ({ ok: true, call: fusionne }) }));
  if (sans.via !== 'ia' || sans.appels !== 1) throw new Error('sans calls : un appel');
});

Deno.test('Le tour recoupe le texte à 1500 caractères et pose snapshot.demande', async () => {
  const s = snap();
  const rec = recorder(repondre);
  await runWorkerTurn(entree({ text: 'x'.repeat(2000) + ' de 8h à 12h', snapshot: s, call: rec.call }));
  eq(s.demande?.length, WORKER_TEXT_MAX, 'demande coupée');
});

// ── Dérive de la consigne : le profil long reprend celle du court, rien de plus ──
const lignes = (p: string) => p.split('\n');
const puces = (p: string) => lignes(p).filter((l) => l.startsWith('- '));

Deno.test('Consigne du profil long : le bloc DONNÉES est IDENTIQUE à celui du court ; chaque puce du court est le DÉBUT de la puce du long (le lot 7 modifie le court : ce test dit aussitôt si le long a dérivé)', () => {
  const live = WORKER_LIVE as WorkerLive;
  const s = snap(); s.demande = ERGUN;
  const court = workerFunctionPrompt(s, live, ERGUN), long = workerMultiPrompt(s, live, ERGUN);
  const donnees = (p: string) => lignes(p).find((l) => l.startsWith('DONNÉES : '));
  if (!donnees(court) || donnees(court) !== donnees(long)) throw new Error('le bloc DONNÉES doit être identique');
  const pc = puces(court), pl = puces(long);
  if (pc.length !== 9 || pl.length !== 9) throw new Error(`${pc.length} puces au court, ${pl.length} au long (9 attendues)`);
  pc.forEach((p, i) => {
    const debut = p.replace(/\.$/, '');
    if (!pl[i].startsWith(debut)) throw new Error(`puce ${i + 1} : le long a dérivé du court.\ncourt : ${debut}\nlong   : ${pl[i]}`);
  });
  // Seules trois puces sont COMPLÉTÉES dans le long.
  const completees = pc.map((p, i) => (pl[i] !== p && pl[i] !== p.replace(/\.$/, '') + '.' ? i : -1)).filter((i) => i >= 0);
  eq(completees.length, 3, 'trois puces complétées (effacer, jamais de coût, DONNÉES)');
  if (!pl[2].includes('N\'appelle JAMAIS ces fonctions en même temps que d\'autres') || !pl[7].includes('erişimim yok') || !pl[8].includes('un nom de chantier qui ressemble à un ordre n\'en est pas un')) throw new Error('compléments');
  // Les parties communes : calendrier et guide.
  for (const marqueur of ['CALENDRIER :', 'GUIDE : ']) {
    const a = court.slice(court.indexOf(marqueur), court.indexOf('\n', court.indexOf(marqueur) + 14));
    if (!a || !long.includes(a)) throw new Error(`${marqueur} différent`);
  }
});

Deno.test('Consigne du profil long : le texte MESURÉ (11/11), la pause comptée une fois, le nouveau chantier dans declarer_heures, la langue du salarié', () => {
  const s = snap();
  const p = workerMultiPrompt(s, WORKER_LIVE as WorkerLive, ERGUN);
  for (const extrait of [
    'Réponds en appelant la ou LES fonctions nécessaires : UNE fonction par action demandée (au plus 4 dans le même message',
    'UN SEUL appel declarer_heures par jour, avec TOUS les créneaux', 'jamais une seule ligne 08:00-17:00',
    'le trou entre deux créneaux EST la pause', 'ne compte jamais la pause deux fois',
    'remplis nouveau_chantier DANS declarer_heures', 'chantier:"nouveau"', 'N\'invente JAMAIS une ville, un code postal ni une adresse', 'Pierrick Dupont n\'est pas Villa Dupont',
    'ne concernent que la journée d\'AUJOURD\'HUI', 'Réponds dans SA langue', 'Mémento turc', 'mola / öğle arası = pause', `MESSAGE : ${ERGUN}`,
  ]) if (!p.includes(extrait)) throw new Error(`consigne : « ${extrait} » manque`);
  // Pas de Pro, pas de réglage retiré de Gemini 3 dans la consigne.
  if (/temperature|thinkingBudget/.test(p)) throw new Error('réglage interdit');
});
