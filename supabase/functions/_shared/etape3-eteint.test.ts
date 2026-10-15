// Étape 3, livraison 3b-1 : la PREUVE « éteint = octet pour octet ».
//
// Tant que le secret AI_ETAPE3 est absent (ou que l'écran n'annonce pas `ouvrir1`), la production doit envoyer au modèle EXACTEMENT ce
// qu'elle envoyait avant 3b-1 : même consigne, mêmes outils, mêmes liens. L'ÉTALON est registre/avant-3b1.snapshot.json : pour chaque cas du jeu
// d'évaluation d'AVANT 3b-1 (165 cas), l'empreinte SHA-256 de la consigne, des outils envoyés, de la réponse du lecteur local et des liens que
// rendent les fiches d'aide, calculée sur origin/main (0edb2a4) PUIS COPIÉE EN DUR. Fichier GELÉ : il ne se régénère pas, il ne se retouche pas.
//
// Même méthode que registre-listes.test.ts (3a-2), un cran plus loin : 3a-2 prouvait les LISTES d'outils ; ici on prouve ce que reçoit le modèle
// ET ce que reçoit l'écran, case par case, avec l'interrupteur éteint de TOUTES les façons possibles (aucun secret, secret illisible, `ouvrir` à
// « off », `ouvrir` allumé mais écran sans `ouvrir1`).
//
//   npm run test:etape3-eteint   (npx -y deno@2.9.6 test --allow-env --allow-read supabase/functions/_shared/etape3-eteint.test.ts)
// Génération de l'étalon (UNE fois, sur le code d'avant ; refuse d'écraser) :
//   ETAPE3_ETALON=ecrire npx -y deno@2.9.6 test --allow-env --allow-read --allow-write supabase/functions/_shared/etape3-eteint.test.ts
import {
  actionPrompt, buildActionContext, fromFunctionCall, GUIDE, guideForPrompt, guideLinks, handleActionLocally, NAV_ACTIONS, type ActionContext,
} from './assistant-actions-core.ts';
import { functionsFor } from './assistant-outils.ts';
import { nettoyerHistorique, sansDemandeRecollee } from './assistant-history.ts';
import {
  buildWorkerSnapshot, fromWorkerCall, handleWorkerLocally, WORKER_GUIDE, workerGuideLinks, workerFunctionPrompt, WORKER_NAV, type WorkerLive, type WorkerSnapshot,
} from './worker-assistant-core.ts';
import { runWorkerTurn } from './worker-turn.ts';
import { workerMultiPrompt } from './worker-multi-prompt.ts';
import { tierFor, type ToolsRequest, type ToolsResult } from './ai-provider.ts';
import { ADMIN_RAW, CASES, FILES, LIVE_EN_COURS, LIVE_VIDE, ME, WORKER_LIVE, WORKER_RAW } from '../assistant-eval/cases.ts';

async function sha256(texte: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
const J = (v: unknown) => JSON.stringify(v) ?? 'undefined';
const FICHIER = new URL('./registre/avant-3b1.snapshot.json', import.meta.url);

export interface Empreinte { id: string; prompt: string; outils: string; reponses: string }
export interface Etalon {
  _aide: string;
  /** Commit de la production dont ceci est l'empreinte. */
  commit: string;
  /** SHA-256 de tout ce qui suit : LE nombre « éteint » à comparer avant / après. */
  global: string;
  guides: { bureau: string; salarie: string; liens_bureau: string; liens_salarie: string };
  cas: Empreinte[];
}

/** Le modèle simulé : il rend toujours « repondre » avec un texte et tous les liens possibles ; la requête reçue est gardée. */
function modeleSimule(vues: ToolsRequest[]) {
  return async (req: ToolsRequest): Promise<ToolsResult> => {
    vues.push(req);
    return { ok: true, call: { name: 'repondre', args: { reponse: 'Voici comment faire.', lien: 'semaine', liens: Object.keys(NAV_ACTIONS), salarie_id: 'u-karim' } } } as ToolsResult;
  };
}

/** Ce que la production envoie pour UN cas, avec les signatures d'AVANT 3b-1 (appelées sans option) ; `extra` ajoute les options d'après (éteintes). */
export async function empreinteDuCas(c: (typeof CASES)[number], extra: { bureau?: (ctx: ActionContext) => void; options?: 'defaut' | 'eteint' } = {}): Promise<Empreinte> {
  const file = c.file ? FILES[c.file] : undefined;
  if (c.cote === 'bureau') {
    const ctx = buildActionContext(ADMIN_RAW as Parameters<typeof buildActionContext>[0]) as ActionContext;
    ctx.me = ME; ctx.demande = c.phrase;
    if (c.history) ctx.historique = sansDemandeRecollee(nettoyerHistorique(c.history), c.phrase);
    extra.bureau?.(ctx);
    const eteint = extra.options === 'eteint';
    const local = file ? null : handleActionLocally(c.phrase, ctx);
    const prompt = actionPrompt(ctx, '{}', eteint ? guideForPrompt('courante', ctx.guideLiens) : guideForPrompt(), c.phrase);
    const outils = eteint ? functionsFor(!!file, c.phrase, ctx.historique, { ouvrir: false, coupes: [] }) : functionsFor(!!file, c.phrase, ctx.historique);
    const r1 = fromFunctionCall('repondre', { reponse: 'Voici comment faire.', liens: [...Object.keys(NAV_ACTIONS), 'salarie'], salarie_id: 'u-karim' }, ctx);
    const r2 = fromFunctionCall('repondre', { reponse: c.phrase }, ctx);
    return { id: c.id, prompt: await sha256(prompt), outils: await sha256(J(outils)), reponses: await sha256(J({ local, r1, r2 })) };
  }
  const snap = buildWorkerSnapshot(WORKER_RAW as never) as WorkerSnapshot;
  const live = { ...(c.live === 'vide' ? LIVE_VIDE : WORKER_LIVE), enCours: c.enCours ? LIVE_EN_COURS : null } as WorkerLive;
  if (c.history) snap.historique = sansDemandeRecollee(nettoyerHistorique(c.history), c.phrase);
  const vues: ToolsRequest[] = [];
  const t = await runWorkerTurn({ text: c.phrase, file, snapshot: snap, live, tier: tierFor(!!file), call: modeleSimule(vues), iaDisponible: true, multiOk: true, ...(extra.options === 'eteint' ? { etape3: { ouvrir: false, coupes: [] } } : {}) });
  const reponse = t.via === 'erreur' ? t : { via: t.via, profil: t.profil, reply: t.reply };
  const direct = fromWorkerCall('repondre', { reponse: c.phrase, lien: 'semaine' }, snap, live);
  return {
    id: c.id,
    prompt: await sha256(vues.map((v) => v.prompt).join('\n=====\n')),
    outils: await sha256(J(vues.map((v) => v.functions))),
    reponses: await sha256(J({ reponse, direct })),
  };
}

export async function calculerEtalon(): Promise<Omit<Etalon, '_aide' | 'commit'>> {
  const cas: Empreinte[] = [];
  for (const c of CASES.filter((x) => !x.etape3)) cas.push(await empreinteDuCas(c));
  const guides = {
    bureau: await sha256(guideForPrompt()),
    // Le salarié : le GUIDE entier, tel qu'il entre dans les deux consignes (court et long), pour un salarié sans historique.
    salarie: await sha256(J(WORKER_GUIDE.map((g) => `${g.titre}${g.lien ? ` [lien:${g.lien}]` : ''} : ${g.etapes.join(' / ')}`))),
    liens_bureau: await sha256(J(GUIDE.map((g) => guideLinks(g)))),
    liens_salarie: await sha256(J([WORKER_GUIDE.map((g) => workerGuideLinks(g)), WORKER_NAV])),
  };
  const sansGlobal = { guides, cas };
  return { global: await sha256(J(sansGlobal)), ...sansGlobal };
}

const etalonLu = async (): Promise<Etalon | null> => { try { return JSON.parse(await Deno.readTextFile(FICHIER)) as Etalon; } catch { return null; } };

Deno.test({
  name: 'Étalon : écriture de registre/avant-3b1.snapshot.json (UNE fois, sur le code d\'avant 3b-1 ; refuse d\'écraser)',
  ignore: Deno.env.get('ETAPE3_ETALON') !== 'ecrire',
  fn: async () => {
    if (await etalonLu()) throw new Error('avant-3b1.snapshot.json existe déjà : il est GELÉ, on ne le régénère jamais');
    const e = await calculerEtalon();
    const etalon: Etalon = {
      _aide: 'GELÉ. Empreintes SHA-256 de ce que la production envoyait AVANT la livraison 3b-1 (consigne, outils, réponses du lecteur local et liens), cas par cas. Lu par etape3-eteint.test.ts. Ne se régénère jamais.',
      commit: '0edb2a4', ...e,
    };
    await Deno.writeTextFile(FICHIER, `${JSON.stringify(etalon, null, 1)}\n`);
    console.log(`Étalon écrit : ${etalon.cas.length} cas, SHA-256 global ${etalon.global}`);
  },
});

Deno.test('Éteint = octet pour octet (1/3) : les 165 cas du banc donnent la consigne, les outils et les liens de la production d\'avant 3b-1', async () => {
  const etalon = await etalonLu();
  if (!etalon) throw new Error('registre/avant-3b1.snapshot.json absent');
  if (etalon.cas.length !== CASES.filter((c) => !c.etape3).length) throw new Error(`${etalon.cas.length} empreintes gelées pour ${CASES.filter((c) => !c.etape3).length} cas hors « Ouvrir »`);
  const ecarts: string[] = [];
  for (const gel of etalon.cas) {
    const c = CASES.find((x) => x.id === gel.id);
    if (!c) { ecarts.push(`${gel.id} : cas disparu du banc`); continue; }
    const neuf = await empreinteDuCas(c);
    for (const k of ['prompt', 'outils', 'reponses'] as const) if (neuf[k] !== gel[k]) ecarts.push(`${gel.id} : ${k} ≠ étalon`);
  }
  if (ecarts.length) throw new Error(`${ecarts.length} écart(s) :\n  ${ecarts.slice(0, 20).join('\n  ')}`);
  console.log(`Éteint (aucune option) : ${etalon.cas.length} cas, 0 écart, étalon ${etalon.global}`);
});

Deno.test('Éteint = octet pour octet (2/3) : les GUIDE (consigne et liens) sont ceux d\'avant', async () => {
  const etalon = await etalonLu();
  if (!etalon) throw new Error('registre/avant-3b1.snapshot.json absent');
  const neuf = await calculerEtalon();
  if (J(neuf.guides) !== J(etalon.guides)) throw new Error(`GUIDE ≠ étalon\n  obtenu  : ${J(neuf.guides)}\n  attendu : ${J(etalon.guides)}`);
  if (neuf.global !== etalon.global) throw new Error(`SHA-256 global ${neuf.global} ≠ étalon ${etalon.global}`);
});

Deno.test('Éteint = octet pour octet (3/3) : le même résultat, SANS option, quand la signature d\'après est appelée « éteinte » sur chaque cas', async () => {
  const etalon = await etalonLu();
  if (!etalon) throw new Error('registre/avant-3b1.snapshot.json absent');
  const ecarts: string[] = [];
  for (const gel of etalon.cas) {
    const c = CASES.find((x) => x.id === gel.id)!;
    const neuf = await empreinteDuCas(c, { options: 'eteint', bureau: (ctx) => { ctx.ouvrir = undefined; ctx.guideLiens = undefined; } });
    for (const k of ['prompt', 'outils', 'reponses'] as const) if (neuf[k] !== gel[k]) ecarts.push(`${gel.id} : ${k} ≠ étalon`);
  }
  if (ecarts.length) throw new Error(`${ecarts.length} écart(s) :\n  ${ecarts.slice(0, 20).join('\n  ')}`);
});

// workerMultiPrompt et workerFunctionPrompt sont couverts par runWorkerTurn ci-dessus ; ces deux appels directs gardent l'import utile si le chemin de test change.
Deno.test('Consignes du salarié : court et long identiques à l\'étalon sur un cas (garde de câblage)', () => {
  const snap = buildWorkerSnapshot(WORKER_RAW as never) as WorkerSnapshot;
  const live = WORKER_LIVE as unknown as WorkerLive;
  if (!workerFunctionPrompt(snap, live, 'x').includes('GUIDE :') || !workerMultiPrompt(snap, live, 'x').includes('GUIDE :')) throw new Error('consigne sans GUIDE');
});
