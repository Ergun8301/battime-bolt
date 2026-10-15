// Registre, outils EXISTANTS (livraison 3a-1) : la PREUVE que les 34 + 19 entrées décrivent ce que le modèle reçoit AUJOURD'HUI.
//
// Le cœur : les outils `livraison: '3a'` du registre, ré-assemblés en { name, description, parameters } dans l'ordre du registre, redonnent
// (1) l'empreinte SHA-256 gelée dans registre/outils-empreintes.json — pour chaque outil puis pour la liste entière — et (2) octet pour octet
// JSON.stringify(ASSISTANT_FUNCTIONS) / JSON.stringify(WORKER_FUNCTIONS). Le reste vérifie que ce que le registre dit AUTOUR de la déclaration
// (mode, retrait, pièce jointe, domaines, exécuteur, « Annuler ») est vrai du code, et applique à ces entrées les règles de niveau du §1.2 (T4).
//   npm run test:registre-outils   (npx -y deno@2 test --allow-env --allow-read supabase/functions/_shared/registre-outils.test.ts)
import { actionMode, ASSISTANT_FUNCTIONS, ATTACHMENT_ACTIONS, REMOVAL_TYPES } from './assistant-actions-core.ts';
import { WORKER_ATTACHMENT_ACTIONS, WORKER_FUNCTIONS, WORKER_REMOVAL_TYPES, workerActionMode } from './worker-assistant-core.ts';
import { OFFICE_DOMAINS, WORKER_DOMAINS } from './tool-domains.ts';
import { OUTILS_BUREAU } from './registre/outils-bureau.ts';
import { OUTILS_SALARIE } from './registre/outils-salarie.ts';
import type { Outil } from './registre/types.ts';
import { assembler, construire, FICHIERS, REPERE, texteEmpreintes } from '../../../scripts/registre-outils-gen.ts';

// ── Petits outils ───────────────────────────────────────────────────────────

const egal = (obtenu: unknown, attendu: unknown, msg: string) => {
  const a = JSON.stringify(obtenu); const b = JSON.stringify(attendu);
  if (a !== b) throw new Error(`${msg}\n  obtenu  : ${a}\n  attendu : ${b}`);
};
const vrai = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };
async function sha256(texte: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** Les outils de la livraison 3a seulement : les suivants (3b, 3c, 3d) viendront s'ajouter dans les mêmes fichiers. */
const de3a = (outils: Outil[]) => outils.filter((o) => o.livraison === '3a');
/** Ce que `callFunction` envoie au modèle pour un outil. Écrit ICI, indépendamment du générateur. */
const declaration = (o: Outil) => ({ name: o.id, description: o.description, parameters: o.parametres });

interface BlocGele { nombre: number; liste: string; outils: { nom: string; sha256: string }[] }
const GEL = JSON.parse(await Deno.readTextFile(new URL('./registre/outils-empreintes.json', import.meta.url))) as { bureau: BlocGele; salarie: BlocGele };

const COTES = [
  { cote: 'bureau' as const, outils: de3a(OUTILS_BUREAU), vivant: ASSISTANT_FUNCTIONS as readonly unknown[], gel: GEL.bureau, nom: 'ASSISTANT_FUNCTIONS', attendus: 34 },
  { cote: 'salarie' as const, outils: de3a(OUTILS_SALARIE), vivant: WORKER_FUNCTIONS as readonly unknown[], gel: GEL.salarie, nom: 'WORKER_FUNCTIONS', attendus: 19 },
];

// ── La preuve : ré-assemblé = empreinte gelée = déclarations d'aujourd'hui ───

for (const { cote, outils, vivant, gel, nom, attendus } of COTES) {
  Deno.test(`Empreinte ${cote} : les ${attendus} outils du registre, ré-assemblés dans l'ordre, redonnent le SHA-256 gelé de la liste`, async () => {
    egal(outils.length, attendus, `${cote} : nombre d'outils 3a`);
    egal(gel.nombre, attendus, `${cote} : nombre gelé`);
    const decls = outils.map(declaration);
    egal(await sha256(JSON.stringify(decls)), gel.liste, `${cote} : empreinte de la liste ré-assemblée`);
  });

  Deno.test(`Empreinte ${cote} : chaque outil redonne son SHA-256 gelé (noms et ordre compris)`, async () => {
    egal(outils.map((o) => o.id), gel.outils.map((o) => o.nom), `${cote} : noms et ordre des outils`);
    const ecarts: string[] = [];
    for (let i = 0; i < outils.length; i++) {
      const lu = await sha256(JSON.stringify(declaration(outils[i])));
      if (lu !== gel.outils[i].sha256) ecarts.push(outils[i].id);
    }
    vrai(!ecarts.length, `${cote} : description ou paramètres modifiés pour : ${ecarts.join(', ')} (le modèle ne recevrait plus la même déclaration)`);
  });

  Deno.test(`Octet pour octet ${cote} : le registre ré-assemblé est JSON.stringify(${nom}), et l'empreinte gelée est celle du code d'aujourd'hui`, async () => {
    const decls = outils.map(declaration);
    const a = JSON.stringify(decls); const b = JSON.stringify(vivant);
    if (a !== b) {
      const i = vivant.findIndex((v, k) => JSON.stringify(v) !== JSON.stringify(decls[k]));
      throw new Error(`${cote} : le registre diffère de ${nom}${i >= 0 ? ` à partir de « ${(vivant[i] as { name: string }).name} » (rang ${i})` : ' (longueur)'}`);
    }
    vrai(new TextEncoder().encode(a).length === new TextEncoder().encode(b).length, `${cote} : longueur en octets`);
    egal(await sha256(b), gel.liste, `${cote} : le code a changé depuis le gel de outils-empreintes.json (livraison à empreinte déclarée ?)`);
    for (let i = 0; i < vivant.length; i++) {
      egal(await sha256(JSON.stringify(vivant[i])), gel.outils[i].sha256, `${cote}/${(vivant[i] as { name: string }).name} : empreinte du code d'aujourd'hui`);
    }
  });
}

// ── Forme et règles de niveau (T4 sur les outils existants) ──────────────────

for (const { cote, outils } of COTES) {
  const domaines = cote === 'bureau' ? OFFICE_DOMAINS : WORKER_DOMAINS;
  Deno.test(`Forme ${cote} : ids, rôles, schémas, champs de chaque kind`, async () => {
    const ids = outils.map((o) => o.id);
    egal(Array.from(new Set(ids)).length, ids.length, `${cote} : id en double`);
    for (const o of outils) {
      // CHECK de assistant_journal.action (migration 20261001090000) : ^[a-z_]{3,40}$.
      vrai(/^[a-z_]{3,40}$/.test(o.id), `${cote}/${o.id} : nom hors de ^[a-z_]{3,40}$ (le journal le refuserait)`);
      egal(o.cote, cote, `${o.id} : côté`);
      egal(o.roles, cote === 'bureau' ? ['admin'] : ['worker', 'lead'], `${o.id} : rôles`);
      vrai(o.description.trim().length > 20, `${o.id} : description vide`);
      egal((o.parametres as { type?: string }).type, 'object', `${o.id} : parametres.type`);
      egal(o.livraison, '3a', `${o.id} : livraison`);
      for (const d of o.domaines) vrai(d in domaines, `${o.id} : domaine « ${d} » inconnu de tool-domains.ts`);
      if (o.kind === 'ecriture') {
        vrai(o.niveau === 2 || o.niveau === 3, `${o.id} : niveau d'une écriture`);
        egal(o.modeActuel, o.mode, `${o.id} : en 3a modeActuel = mode (aucun changement de comportement)`);
        vrai(o.executeur.length > 0 && o.code.length > 0, `${o.id} : executeur et code attendus`);
        for (const f of o.code) {
          try { await Deno.stat(new URL(`../../../${f}`, import.meta.url)); } catch { throw new Error(`${o.id} : code « ${f} » n'existe pas`); }
        }
        const props = Object.keys(((o.parametres as { properties?: Record<string, unknown> }).properties ?? {}));
        for (const c of o.champsCarte ?? []) vrai(props.indexOf(c) >= 0, `${o.id} : champsCarte « ${c} » n'est pas un paramètre`);
      } else if (o.kind === 'lecture') {
        vrai(o.libelle.length > 0 && o.champs.length > 0 && o.libres.length > 0, `${o.id} : libelle, champs et libres attendus`);
        for (const l of o.libres) vrai(o.champs.indexOf(l) >= 0, `${o.id} : champ libre « ${l} » hors de champs`);
        egal(o.niveau, 1, `${o.id} : niveau d'une lecture`);
      } else if (o.kind === 'reponse') {
        egal(o.niveau, 1, `${o.id} : niveau d'une réponse`);
      } else throw new Error(`${o.id} : kind « ${o.kind} » inattendu en 3a`);
    }
    // `proches` : ids connus du même côté, paires symétriques (T7 exigera ≥ 2 phrases d'évaluation par paire).
    for (const o of outils) for (const p of o.proches ?? []) {
      const autre = outils.find((x) => x.id === p);
      vrai(!!autre, `${o.id} : proche « ${p} » inconnu`);
      vrai((autre!.proches ?? []).indexOf(o.id) >= 0, `${o.id} ↔ ${p} : paire non symétrique`);
    }
  });

  Deno.test(`Niveaux ${cote} (T4, §1.2) : niveau 2 ⇒ « Annuler » ; champ de CHAMPS_CARTE ⇒ conditionnel ; tiers prévenu ⇒ carte ou conditionnel ; retrait ⇒ carte`, () => {
    for (const o of outils) {
      if (o.kind !== 'ecriture') continue;
      if (o.niveau === 2) vrai(o.annuler !== 'non', `${o.id} : niveau 2 sans « Annuler »`);
      if (o.niveau === 2 && (o.champsCarte ?? []).length) vrai(o.mode === 'conditionnel', `${o.id} : niveau 2 avec ${(o.champsCarte ?? []).join(', ')} doit être conditionnel`);
      if (o.notifie) vrai(o.niveau === 3 || o.mode === 'conditionnel', `${o.id} : prévient un tiers mais fait sans carte`);
      if (o.retrait) vrai(o.mode === 'carte', `${o.id} : un retrait passe toujours par la carte`);
      vrai((o.mode === 'carte') === (o.niveau === 3), `${o.id} : niveau ${o.niveau} et mode ${o.mode} ne s'accordent pas`);
    }
  });
}

// ── Ce que le registre dit autour de la déclaration est vrai du code ─────────

/** actionMode / workerActionMode essayés sur les champs qu'ils lisent (budget, devis, ligne déjà envoyée) : un seul résultat = fixe, deux = conditionnel. */
function modeObserve(cote: 'bureau' | 'salarie', id: string): 'direct' | 'carte' | 'conditionnel' {
  const sondes: unknown[] = cote === 'bureau'
    ? [{ type: id }, { type: id, budget_heures: '10' }, { type: id, montant_devis: '100' }]
    : [{ type: id, choix: [] }, { type: id, entry_id: 'a', choix: [{ id: 'a', envoyee: true }] }, { type: id, entry_id: 'a', choix: [{ id: 'a', envoyee: false }] }];
  const vus = sondes.map((s) => (cote === 'bureau' ? actionMode(s as never) : workerActionMode(s as never)));
  const direct = vus.indexOf('direct') >= 0; const carte = vus.indexOf('confirm') >= 0;
  return direct && carte ? 'conditionnel' : direct ? 'direct' : 'carte';
}

for (const { cote, outils } of COTES) {
  const retraits = (cote === 'bureau' ? REMOVAL_TYPES : WORKER_REMOVAL_TYPES) as readonly string[];
  const joints = (cote === 'bureau' ? ATTACHMENT_ACTIONS : WORKER_ATTACHMENT_ACTIONS) as readonly string[];
  const domaines = cote === 'bureau' ? OFFICE_DOMAINS : WORKER_DOMAINS;

  Deno.test(`Listes du code ${cote} : mode, retrait, pièce jointe et domaines du registre = actionMode, REMOVAL_TYPES, ATTACHMENT_ACTIONS, tool-domains`, () => {
    for (const o of outils) {
      if (o.kind === 'ecriture') {
        egal(o.mode, modeObserve(cote, o.id), `${o.id} : mode`);
        egal(!!o.retrait, retraits.indexOf(o.id) >= 0, `${o.id} : retrait`);
      }
      egal(!!o.pieceJointe, joints.indexOf(o.id) >= 0, `${o.id} : pieceJointe`);
      egal(o.domaines, Object.keys(domaines).filter((k) => (domaines[k].tools as readonly string[]).indexOf(o.id) >= 0), `${o.id} : domaines`);
    }
    // Rien dans les listes du code que le registre ne connaisse : un type de retrait ou de pièce jointe sans outil.
    const ids = outils.map((o) => o.id);
    const inconnus = [...retraits, ...joints].filter((n) => ids.indexOf(n) < 0);
    // Seul `annuler_pointage` est un type sans outil (désactivé au lot 12, WC:781) ; le modèle ne l'appelle pas.
    egal(inconnus, cote === 'salarie' ? ['annuler_pointage'] : [], `${cote} : types de retrait / pièce jointe sans outil`);
  });
}

Deno.test('Exécuteurs : chaque écriture a son exécuteur dans le code, « Annuler : non » ⇔ aucun undo posé, aucun case orphelin', async () => {
  const r = await construire();
  const ex = { bureau: r.executeurs.bureau, salarie: r.executeurs.salarie };
  const sauveur = r.executeurs.sauveur.slice(r.executeurs.sauveur.indexOf('export function makeWorkerSaver'), r.executeurs.sauveur.indexOf('export const demoSaver'));
  for (const { cote, outils } of COTES) {
    const reclames: string[] = [];
    for (const o of outils) {
      if (o.kind !== 'ecriture') continue;
      const corps = o.executeur === 'makeWorkerSaver' ? sauveur : ex[cote][o.executeur];
      vrai(typeof corps === 'string' && corps.length > 0, `${cote}/${o.id} : exécuteur « ${o.executeur} » introuvable dans le code`);
      const aUndo = /\bundo\s*=/.test(corps.split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n'));
      egal(o.annuler !== 'non', aUndo, `${cote}/${o.id} : « Annuler : ${o.annuler} » mais ${aUndo ? 'un undo est posé' : 'aucun undo n\'est posé'}`);
      if (o.executeur !== 'makeWorkerSaver') reclames.push(o.executeur);
    }
    // Un `case` de l'exécuteur que le registre ne réclame pas = une écriture ajoutée au code sans entrée de registre.
    // Les deux cas désactivés au lot 12 (WC:781) existent encore dans l'exécuteur salarié.
    const orphelins = Object.keys(ex[cote]).filter((c) => reclames.indexOf(c) < 0 && !(cote === 'salarie' && (c === 'commencer_pointage' || c === 'annuler_pointage')));
    egal(orphelins, [], `${cote} : cases de l'exécuteur sans outil`);
  }
});

Deno.test('Dérive : ce que le générateur produit aujourd\'hui = les entrées 3a et les empreintes commitées', async () => {
  const r = await construire();
  egal(de3a(OUTILS_BUREAU), r.bureau, 'outils du bureau : le registre a dérivé du code (ou a été retouché à la main sans passer par FICHES)');
  egal(de3a(OUTILS_SALARIE), r.salarie, 'outils du salarié : idem');
  const [b, s, e] = [await Deno.readTextFile(FICHIERS.bureau), await Deno.readTextFile(FICHIERS.salarie), await Deno.readTextFile(FICHIERS.empreintes)];
  vrai(b.startsWith(r.teteBureau), 'outils-bureau.ts ne commence plus par ce que le générateur écrit (relancer scripts/registre-outils-gen.ts)');
  vrai(s.startsWith(r.teteSalarie), 'outils-salarie.ts ne commence plus par ce que le générateur écrit');
  vrai(e === texteEmpreintes(r.empreintes), 'outils-empreintes.json n\'est plus celui du code d\'aujourd\'hui');
});

Deno.test('Générateur : ce qui suit le repère « fin des outils 3a » (outils des livraisons suivantes) n\'est jamais effacé', async () => {
  const r = await construire();
  const suite = '  {\n    id: \'ouvrir_fenetre\', livraison: \'3b\',\n  },\n';
  const ecrit = assembler(r.teteBureau, null);
  vrai(ecrit.endsWith(`${REPERE}\n];\n`), 'sans fichier : la tête puis la fermeture');
  const avecSuite = `${r.teteBureau}${suite}];\n`;
  egal(assembler(r.teteBureau, avecSuite), avecSuite, 'idempotent avec des outils après le repère');
  // Une tête qui change (jugement corrigé dans FICHES) garde la suite.
  const autreTete = r.teteBureau.replace('Outils de l\'assistant', 'Outils de l\'assistant (rééditée)');
  egal(assembler(autreTete, avecSuite), `${autreTete}${suite}];\n`, 'la suite survit à une nouvelle tête');
  // L'en-tête cite les mots du repère : seul le repère entier, en début de ligne, compte.
  vrai(r.teteBureau.indexOf('« fin des outils de la livraison 3a »') >= 0, 'l\'en-tête cite le repère (le piège que assembler évite)');
  egal(assembler(r.teteBureau, r.teteBureau + '];\n'), r.teteBureau + '];\n', 'idempotent sans outils après le repère');
});

// ── Les comptes du contrat (§0.2), recomptés ─────────────────────────────────

Deno.test('Comptes : 33 + 18 outils (+ repondre), modes, « Annuler », retraits, pièces jointes — ce que le contrat annonce, mesuré', () => {
  const B = COTES[0].outils; const S = COTES[1].outils;
  const ecr = (o: Outil[]) => o.filter((x) => x.kind === 'ecriture') as Extract<Outil, { kind: 'ecriture' }>[];
  const comptes = {
    bureau: {
      declarations: B.length, outils: B.length - 1,
      direct: ecr(B).filter((o) => o.mode === 'direct').length, conditionnel: ecr(B).filter((o) => o.mode === 'conditionnel').length, carte: ecr(B).filter((o) => o.mode === 'carte').length,
      carteSansAnnuler: ecr(B).filter((o) => o.mode === 'carte' && o.annuler === 'non').length,
      annulerOui: ecr(B).filter((o) => o.annuler === 'oui').length, annulerPartiel: ecr(B).filter((o) => o.annuler === 'partiel').length, annulerNon: ecr(B).filter((o) => o.annuler === 'non').length,
      retraits: ecr(B).filter((o) => o.retrait).length, piecesJointes: B.filter((o) => o.pieceJointe).length, notifie: ecr(B).filter((o) => o.notifie).length,
    },
    salarie: {
      declarations: S.length, outils: S.length - 1,
      direct: ecr(S).filter((o) => o.mode === 'direct').length, conditionnel: ecr(S).filter((o) => o.mode === 'conditionnel').length, carte: ecr(S).filter((o) => o.mode === 'carte').length,
      annulerOui: ecr(S).filter((o) => o.annuler === 'oui').length, annulerPartiel: ecr(S).filter((o) => o.annuler === 'partiel').length, annulerNon: ecr(S).filter((o) => o.annuler === 'non').length,
      retraits: ecr(S).filter((o) => o.retrait).length, piecesJointes: S.filter((o) => o.pieceJointe).length, lectures: S.filter((o) => o.kind === 'lecture').length,
    },
  };
  console.log(`Comptes mesurés : ${JSON.stringify(comptes)}`);
  // §0.2 : 33 + 18 outils ; 5 outils bureau non « carte » (4 directs + creer_chantier conditionnel) ; 17 outils bureau « carte » sans undo ;
  // 10 retraits bureau ; ATTACHMENT_ACTIONS = repondre + 5 (bureau) et ranger_photo + repondre (salarié) ; 8 outils salarié « à confirmer ».
  egal([comptes.bureau.outils, comptes.salarie.outils], [33, 18], 'outils (hors repondre)');
  egal([comptes.bureau.direct, comptes.bureau.conditionnel], [4, 1], 'bureau : directs et conditionnel');
  egal(comptes.bureau.carteSansAnnuler, 17, 'bureau : outils « carte » sans undo');
  egal(comptes.bureau.retraits, 10, 'bureau : retraits');
  egal([comptes.bureau.piecesJointes, comptes.salarie.piecesJointes], [6, 2], 'outils proposés avec un fichier joint');
  egal(comptes.salarie.carte, 8, 'salarié : outils « à confirmer »');
  egal(comptes.salarie.retraits, 5, 'salarié : retraits déclarés (6 types dans WORKER_REMOVAL_TYPES, dont annuler_pointage désactivé)');
  egal(comptes.salarie.lectures, 1, 'salarié : planning_collegues, seul outil de lecture');
});
