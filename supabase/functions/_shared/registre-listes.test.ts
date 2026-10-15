// Registre, livraison 3a-2 : la PREUVE « octet pour octet » que les listes, écrites à la main avant et GÉNÉRÉES depuis le registre maintenant,
// sont celles de la production.
//
// L'ÉTALON est registre/avant-3a2.snapshot.json : ce que ACTION_TYPES, REMOVAL_TYPES, ATTACHMENT_ACTIONS, WORKER_REMOVAL_TYPES,
// WORKER_ATTACHMENT_ACTIONS, les listes `tools` de tool-domains.ts, ASSISTANT_FUNCTIONS, WORKER_FUNCTIONS et les vocabulaires valaient sur
// origin/main (commit 37d6785), évalué puis COPIÉ EN DUR. Fichier gelé : il ne se régénère pas, il ne se retouche pas.
//
// Ce que le test prouve :
//   · les 34 + 19 déclarations envoyées au modèle : même JSON.stringify (donc mêmes objets, même ordre des outils ET des clés, mêmes descriptions),
//     même longueur en octets, même SHA-256 que l'étalon ET que outils-empreintes.json ;
//   · le choix des outils sur les 126 phrases du banc d'évaluation (avec fichier, sans fichier, avec historique) : identique à celui que l'ancien
//     code faisait avec les anciennes listes `tools` ;
//   · les listes d'identifiants (types d'écriture, retraits, pièces jointes, outils de chaque domaine) : mêmes ENSEMBLES. Leur ordre est désormais celui
//     du registre ; aucun code n'en dépend (includes, Set), et ce test le dit en comparant trié ;
//   · les vocabulaires déplacés dans registre/vocab.ts : mêmes valeurs, même ordre des clés, et AC / WC en sont de simples ré-exports ;
//   · les modules légers générés (outils-listes-*.ts) sont exactement ce que le registre produit, sans import.
//   npm run test:registre   (npx -y deno@2.9.6 test --allow-env --allow-read supabase/functions/_shared/registre-listes.test.ts)
import { ABSENCE_KINDS as ABS_AC, ACTION_TYPES, ATTACHMENT_ACTIONS, NAV_ACTIONS as NAV_AC, REMOVAL_TYPES } from './assistant-actions-core.ts';
import { ASSISTANT_FUNCTIONS, ATTACHMENT_FUNCTIONS, functionsFor } from './assistant-outils.ts';
import { DOC_CATEGORIES as DOC_WC, LEAVE_KINDS as LEAVE_WC, WORKER_ATTACHMENT_ACTIONS, WORKER_NAV as NAV_WC, WORKER_REMOVAL_TYPES } from './worker-assistant-core.ts';
import { WORKER_ATTACHMENT_FUNCTIONS, WORKER_FUNCTIONS, workerFunctionsFor } from './worker-outils.ts';
import { WORKER_FUNCTIONS_LONG, workerFunctionsForLong } from './worker-multi-prompt.ts';
import { domainTools, OFFICE_DOMAINS, pickTools, WORKER_DOMAINS } from './tool-domains.ts';
import { textePourOutils } from './assistant-history.ts';
import { DOMAINES_OUTILS as DOM_B } from './outils-listes-bureau.ts';
import { DOMAINES_OUTILS as DOM_S } from './outils-listes-salarie.ts';
import { ABSENCE_KINDS, DOC_CATEGORIES, LEAVE_KINDS, NAV_ACTIONS, WORKER_NAV } from './registre/vocab.ts';
import { DOMAINES_ORDRE, LIVRAISON_COURANTE } from './registre/config.ts';
import { texteListes } from './registre/listes.ts';
import { declarer, outilsPour, outilsServisPour } from './registre/outils-pour.ts';
import { OUTILS_BUREAU } from './registre/outils-bureau.ts';
import { OUTILS_SALARIE } from './registre/outils-salarie.ts';
import type { Outil } from './registre/types.ts';
import { CASES } from '../assistant-eval/cases.ts';

// ── Petits outils ───────────────────────────────────────────────────────────

const egal = (obtenu: unknown, attendu: unknown, msg: string) => {
  const a = JSON.stringify(obtenu); const b = JSON.stringify(attendu);
  if (a !== b) throw new Error(`${msg}\n  obtenu  : ${a}\n  attendu : ${b}`);
};
const vrai = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };
const trie = (l: readonly string[]) => [...l].sort();
const octets = (t: string) => new TextEncoder().encode(t).length;
async function sha256(texte: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
const lire = (relatif: string) => Deno.readTextFile(new URL(relatif, import.meta.url));

interface Decl { name: string; description: string; parameters: Record<string, unknown> }
interface Etalon {
  bureau: {
    ASSISTANT_FUNCTIONS: Decl[]; ATTACHMENT_FUNCTIONS: string[]; ACTION_TYPES: string[]; REMOVAL_TYPES: string[]; ATTACHMENT_ACTIONS: string[];
    DOMAINES: Record<string, string[]>; NAV_ACTIONS: Record<string, string>; ABSENCE_KINDS: string[];
  };
  salarie: {
    WORKER_FUNCTIONS: Decl[]; WORKER_ATTACHMENT_FUNCTIONS: string[]; WORKER_REMOVAL_TYPES: string[]; WORKER_ATTACHMENT_ACTIONS: string[];
    DOMAINES: Record<string, string[]>; WORKER_NAV: Record<string, string>; LEAVE_KINDS: string[]; DOC_CATEGORIES: string[];
  };
}
const AVANT = JSON.parse(await lire('./registre/avant-3a2.snapshot.json')) as Etalon;
const GEL = JSON.parse(await lire('./registre/outils-empreintes.json')) as { bureau: { liste: string; nombre: number }; salarie: { liste: string; nombre: number } };

/** Les anciens domaines : les mots (qui n'ont pas changé) et les anciennes listes `tools` de l'étalon. */
const anciensDomaines = (actuels: typeof OFFICE_DOMAINS, avant: Record<string, string[]>) =>
  Object.fromEntries(Object.entries(actuels).map(([k, d]) => [k, { re: d.re, tools: avant[k] }]));

// ── 1. Les déclarations que reçoit le modèle ─────────────────────────────────

const COTES = [
  { cote: 'bureau', nom: 'ASSISTANT_FUNCTIONS', neuf: ASSISTANT_FUNCTIONS as Decl[], avant: AVANT.bureau.ASSISTANT_FUNCTIONS, joints: ATTACHMENT_FUNCTIONS as Decl[], jointsAvant: AVANT.bureau.ATTACHMENT_FUNCTIONS, gel: GEL.bureau, outils: OUTILS_BUREAU },
  { cote: 'salarie', nom: 'WORKER_FUNCTIONS', neuf: WORKER_FUNCTIONS as Decl[], avant: AVANT.salarie.WORKER_FUNCTIONS, joints: WORKER_ATTACHMENT_FUNCTIONS as Decl[], jointsAvant: AVANT.salarie.WORKER_ATTACHMENT_FUNCTIONS, gel: GEL.salarie, outils: OUTILS_SALARIE },
] as const;

for (const { cote, nom, neuf, avant, joints, jointsAvant, gel } of COTES) {
  Deno.test(`Octet pour octet ${cote} : ${nom} généré = ${nom} d'avant 3a-2 (même JSON, même longueur, même SHA-256, outil par outil)`, async () => {
    egal(neuf.length, avant.length, `${cote} : nombre d'outils`);
    const a = JSON.stringify(neuf); const b = JSON.stringify(avant);
    if (a !== b) {
      const i = avant.findIndex((v, k) => JSON.stringify(v) !== JSON.stringify(neuf[k]));
      throw new Error(`${cote} : ${nom} diffère de l'étalon à partir de « ${avant[i]?.name} » (rang ${i})`);
    }
    vrai(octets(a) === octets(b), `${cote} : longueur en octets`);
    egal(await sha256(a), gel.liste, `${cote} : SHA-256 de la liste ≠ outils-empreintes.json`);
    egal(await sha256(b), gel.liste, `${cote} : SHA-256 de l'étalon ≠ outils-empreintes.json (l'étalon n'est pas celui qui a été gelé)`);
    for (let i = 0; i < avant.length; i++) {
      egal(Object.keys(neuf[i]), ['name', 'description', 'parameters'], `${cote}/${avant[i].name} : clés (leur ordre est dans l'empreinte)`);
      egal(await sha256(JSON.stringify(neuf[i])), await sha256(JSON.stringify(avant[i])), `${cote}/${avant[i].name} : SHA-256 de la déclaration`);
    }
  });

  Deno.test(`Fichier joint ${cote} : la liste « documents » générée = celle d'avant (mêmes objets, même ordre), et c'est ce que rend outilsPour(fichier)`, () => {
    egal(joints.map((f) => f.name), jointsAvant, `${cote} : outils proposés avec un fichier`);
    egal(joints, avant.filter((f) => jointsAvant.includes(f.name)), `${cote} : déclarations proposées avec un fichier`);
    egal(outilsPour(cote, { fichier: true }), joints, `${cote} : outilsPour(fichier) = liste « documents »`);
    egal(outilsPour(cote), neuf, `${cote} : outilsPour() = liste complète`);
    egal(outilsPour(cote, { livraison: LIVRAISON_COURANTE }), neuf, `${cote} : livraison courante = tout`);
  });
}

Deno.test('Profil long du salarié : les déclarations qui ne sont ni DECLARER_HEURES_LONG ni NOUVEAU_CHANTIER_LONG sont celles d\'avant', () => {
  const sans = (l: readonly Decl[]) => l.filter((f) => f.name !== 'declarer_heures' && f.name !== 'nouveau_chantier');
  egal(sans(WORKER_FUNCTIONS_LONG as Decl[]), sans(AVANT.salarie.WORKER_FUNCTIONS), 'WORKER_FUNCTIONS_LONG');
  egal((WORKER_FUNCTIONS_LONG as Decl[]).map((f) => f.name), AVANT.salarie.WORKER_FUNCTIONS.map((f) => f.name), 'ordre du profil long');
});

// ── 2. Le choix des outils sur les 126 phrases du banc ───────────────────────

Deno.test('Choix des outils : sur chaque phrase du banc (avec ou sans fichier, avec son historique), functionsFor / workerFunctionsFor rendent exactement ce que rendait l\'ancien code', () => {
  const vieuxB = anciensDomaines(OFFICE_DOMAINS, AVANT.bureau.DOMAINES);
  const vieuxS = anciensDomaines(WORKER_DOMAINS, AVANT.salarie.DOMAINES);
  const jointsB = AVANT.bureau.ASSISTANT_FUNCTIONS.filter((f) => AVANT.bureau.ATTACHMENT_FUNCTIONS.includes(f.name));
  const jointsS = AVANT.salarie.WORKER_FUNCTIONS.filter((f) => AVANT.salarie.WORKER_ATTACHMENT_FUNCTIONS.includes(f.name));
  let n = 0;
  for (const c of CASES) {
    for (const fichier of c.file ? [true] : [false, true]) {
      const h = c.history;
      if (c.cote === 'bureau') {
        const ancien = fichier ? jointsB : pickTools(AVANT.bureau.ASSISTANT_FUNCTIONS, c.phrase && domainTools(c.phrase, vieuxB) ? textePourOutils(c.phrase, h) : c.phrase, vieuxB);
        egal(functionsFor(fichier, c.phrase, h), ancien, `${c.id} (fichier ${fichier}) : outils du bureau`);
      } else {
        const ancien = fichier ? jointsS : pickTools(AVANT.salarie.WORKER_FUNCTIONS, c.phrase && domainTools(c.phrase, vieuxS) ? textePourOutils(c.phrase, h) : c.phrase, vieuxS);
        egal(workerFunctionsFor(fichier, c.phrase, h), ancien, `${c.id} (fichier ${fichier}) : outils du salarié`);
        if (!fichier) vrai(workerFunctionsForLong(c.phrase, h).length > 0, `${c.id} : profil long vide`);
      }
      n++;
    }
  }
  vrai(n >= CASES.length, 'au moins une comparaison par cas');
  console.log(`Choix des outils : ${CASES.length} cas, ${n} comparaisons, 0 écart`);
});

// ── 3. Les listes d'identifiants ─────────────────────────────────────────────

Deno.test('Listes d\'identifiants : types d\'écriture, retraits, pièces jointes et outils de chaque domaine = ceux d\'avant (mêmes ensembles ; l\'ordre est celui du registre)', () => {
  egal(trie(ACTION_TYPES), trie(AVANT.bureau.ACTION_TYPES), 'ACTION_TYPES');
  egal(trie(REMOVAL_TYPES), trie(AVANT.bureau.REMOVAL_TYPES), 'REMOVAL_TYPES');
  egal(trie(ATTACHMENT_ACTIONS), trie(AVANT.bureau.ATTACHMENT_ACTIONS), 'ATTACHMENT_ACTIONS');
  egal(trie(WORKER_REMOVAL_TYPES), trie(AVANT.salarie.WORKER_REMOVAL_TYPES), 'WORKER_REMOVAL_TYPES');
  egal(trie(WORKER_ATTACHMENT_ACTIONS), trie(AVANT.salarie.WORKER_ATTACHMENT_ACTIONS), 'WORKER_ATTACHMENT_ACTIONS');
  for (const [domaines, avant, cote] of [[OFFICE_DOMAINS, AVANT.bureau.DOMAINES, 'bureau'], [WORKER_DOMAINS, AVANT.salarie.DOMAINES, 'salarie']] as const) {
    egal(Object.keys(domaines), Object.keys(avant), `${cote} : domaines (ordre des clés)`);
    egal(Object.keys(domaines), DOMAINES_ORDRE[cote], `${cote} : DOMAINES_ORDRE (registre/config.ts)`);
    for (const k of Object.keys(avant)) egal(trie(domaines[k].tools), trie(avant[k]), `${cote}/${k} : outils du domaine`);
  }
  // Pourquoi l'ordre ne compte pas : ces listes ne servent qu'à `includes` (retraits, pièces jointes) et à un Set (domainTools).
  // Les déclarations envoyées au modèle, elles, gardent l'ordre des outils (section 1).
  egal(DOM_B.planning.length + DOM_B.heures.length > 0 && DOM_S.heures.length > 0, true, 'listes de domaines non vides');
});

// ── 4. Les vocabulaires fermés ───────────────────────────────────────────────

Deno.test('Vocabulaires : NAV_ACTIONS, WORKER_NAV, ABSENCE_KINDS, LEAVE_KINDS, DOC_CATEGORIES = ceux d\'avant (même ordre des clés), ré-exportés tels quels par AC et WC', () => {
  egal(NAV_ACTIONS, AVANT.bureau.NAV_ACTIONS, 'NAV_ACTIONS');
  egal(WORKER_NAV, AVANT.salarie.WORKER_NAV, 'WORKER_NAV');
  egal(ABSENCE_KINDS, AVANT.bureau.ABSENCE_KINDS, 'ABSENCE_KINDS');
  egal(LEAVE_KINDS, AVANT.salarie.LEAVE_KINDS, 'LEAVE_KINDS');
  egal(DOC_CATEGORIES, AVANT.salarie.DOC_CATEGORIES, 'DOC_CATEGORIES');
  vrai(NAV_AC === NAV_ACTIONS && ABS_AC === ABSENCE_KINDS && NAV_WC === WORKER_NAV && LEAVE_WC === LEAVE_KINDS && DOC_WC === DOC_CATEGORIES, 'AC / WC ré-exportent les mêmes objets (une seule liste)');
});

// ── 5. Les modules légers générés ────────────────────────────────────────────

Deno.test('Modules légers : outils-listes-bureau.ts et -salarie.ts sont exactement ce que le registre produit, et n\'importent rien', async () => {
  for (const [cote, outils, fichier] of [['bureau', OUTILS_BUREAU, './outils-listes-bureau.ts'], ['salarie', OUTILS_SALARIE, './outils-listes-salarie.ts']] as const) {
    const ecrit = await lire(fichier);
    vrai(ecrit === texteListes(cote, outils), `${fichier} n'est pas celui que le registre produit : relancer  npx -y deno@2 run --allow-read --allow-write scripts/registre-listes-gen.ts`);
    vrai(!/^\s*import\b/m.test(ecrit.replace(/^\/\/.*$/gm, '')), `${fichier} : un module que le navigateur importe n'importe rien (il ne doit pas atteindre registre/outils-*.ts)`);
    vrai(!/\bdescription\b/.test(ecrit.replace(/^\/\/.*$/gm, '')), `${fichier} : aucun texte lu par le modèle`);
  }
  // AC et WC n'importent pas les outils du registre (atteints par le navigateur : T8) ; ils importent seulement les modules légers.
  for (const f of ['./assistant-actions-core.ts', './worker-assistant-core.ts', './tool-domains.ts']) {
    const s = (await lire(f)).replace(/^\s*\/\/.*$/gm, '');
    vrai(!/registre\/(outils|index|capacites|surfaces|interne|listes|outils-pour)/.test(s), `${f} : importe le registre lourd`);
    vrai(!/export const (ASSISTANT_FUNCTIONS|WORKER_FUNCTIONS)\b/.test(s), `${f} : les déclarations ne sont plus écrites ici`);
  }
});

// ── 6. outilsPour : livraison et variantes ───────────────────────────────────

Deno.test('outilsPour : un outil d\'une livraison suivante n\'est pas servi tant que sa livraison n\'est pas atteinte ; une variante non plus ; l\'ordre des clés est celui de l\'empreinte', () => {
  const base = { cote: 'bureau' as const, roles: ['admin' as const], kind: 'reponse' as const, niveau: 1 as const, domaines: [] as string[] };
  const a = { ...base, id: 'repondre', description: 'description de a', parametres: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] }, livraison: '3a', pieceJointe: true,
    variantes: [{ livraison: '3b', parametres: { properties: { y: { type: 'number' } } }, description: 'description de a, 3b' }] } as unknown as Outil;
  const b = { ...base, id: 'neuf', description: 'outil de 3b', parametres: { type: 'object', properties: {} }, livraison: '3b' } as unknown as Outil;
  const c = { ...base, id: 'autre_cote', cote: 'salarie' as const, roles: ['worker' as const], description: 'outil du salarié', parametres: { type: 'object', properties: {} }, livraison: '3a' } as unknown as Outil;
  const tous = [a, b, c];
  egal(outilsServisPour(tous, 'bureau').map((f) => f.name), ['repondre'], '3a : seul repondre est servi (neuf = 3b)');
  egal(outilsServisPour(tous, 'bureau', { livraison: '3a' })[0], { name: 'repondre', description: 'description de a', parameters: a.parametres }, '3a : la déclaration est celle de l\'outil gelé, sans la variante');
  egal(outilsServisPour(tous, 'bureau', { livraison: '3b' }).map((f) => f.name), ['repondre', 'neuf'], '3b : neuf est servi');
  egal(outilsServisPour(tous, 'bureau', { livraison: '3b' })[0], {
    name: 'repondre', description: 'description de a, 3b',
    parameters: { type: 'object', properties: { x: { type: 'string' }, y: { type: 'number' } }, required: ['x'] },
  }, '3b : la variante ajoute son paramètre');
  egal(outilsServisPour(tous, 'bureau', { fichier: true, livraison: '3b' }).map((f) => f.name), ['repondre'], 'fichier : seuls les outils à pièce jointe');
  egal(outilsServisPour(tous, 'salarie').map((f) => f.name), ['autre_cote'], 'un côté ne sert pas l\'autre');
  egal(Object.keys(declarer(a, '3a')), ['name', 'description', 'parameters'], 'clés');
  vrai(declarer(a, '3a').parameters === a.parametres, 'sans variante appliquée, les paramètres sont l\'objet du registre (aucune copie)');
});
