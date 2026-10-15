// Générateur des OUTILS EXISTANTS du registre (étape 3, livraison 3a-1) — programme Deno.
//
//   npx -y deno@2 run --allow-read --allow-write --allow-env scripts/registre-outils-gen.ts [--verifier] [--regenerer-empreintes]
//
// Il lit les deux listes de déclarations que le modèle reçoit AUJOURD'HUI (ASSISTANT_FUNCTIONS, WORKER_FUNCTIONS), les listes
// qui les entourent (REMOVAL_TYPES, ATTACHMENT_ACTIONS, actionMode, tool-domains.ts) et le code des exécuteurs du navigateur
// (lib/assistant-actions.ts, lib/worker-actions.ts, makeWorkerSaver de lib/worker-assistant.ts), puis écrit :
//   · supabase/functions/_shared/registre/outils-bureau.ts   (34 : `repondre` + 33 outils)
//   · supabase/functions/_shared/registre/outils-salarie.ts  (19 : `repondre` + 18 outils)
//   · supabase/functions/_shared/registre/outils-empreintes.json  (SHA-256 gelés : chaque déclaration, puis la liste entière)
//
// POURQUOI UN PROGRAMME ET PAS DE LA SAISIE : 34 + 19 descriptions et schémas recopiés à la main finiraient par différer
// d'un caractère de ceux que le modèle lit (et la consigne a été réglée sur ces mots exacts : ia-v2.md). Le programme écrit les
// textes tels que le code les évalue ; la preuve, indépendante de lui, est `registre-outils.test.ts` (ré-assemblage = empreinte).
//
// Ce qui se LIT dans le code est lu (description, paramètres, mode, retrait, pièce jointe, domaines, exécuteur, fichiers de lib/,
// présence d'un `undo`). Ce qui est un JUGEMENT (« Annuler » exact ou partiel, notification d'un tiers, outils proches, valeurs
// incertaines) est écrit plus bas, dans FICHES_*, relu outil par outil, et vérifié contre le code quand le code permet de le
// vérifier (un « Annuler : non » exige qu'aucun `undo` ne soit posé dans l'exécuteur, et l'inverse).
//
// Une fois écrits, outils-*.ts sont la SOURCE (on y ajoutera les outils de 3b, 3c, 3d) : ce programme ne sert qu'à les remplir
// et à prouver, avec --verifier, qu'ils décrivent encore le code. Les empreintes sont GELÉES : il refuse de les réécrire si les
// déclarations ont changé, sauf avec --regenerer-empreintes (changement voulu, à écrire dans la PR).

import { actionMode, ASSISTANT_FUNCTIONS, ATTACHMENT_ACTIONS, REMOVAL_TYPES } from '../supabase/functions/_shared/assistant-actions-core.ts';
import { WORKER_ATTACHMENT_ACTIONS, WORKER_FUNCTIONS, WORKER_REMOVAL_TYPES, workerActionMode } from '../supabase/functions/_shared/worker-assistant-core.ts';
import { OFFICE_DOMAINS, WORKER_DOMAINS } from '../supabase/functions/_shared/tool-domains.ts';
import type { Outil } from '../supabase/functions/_shared/registre/types.ts';

// ── Types locaux ────────────────────────────────────────────────────────────

type Cote = 'bureau' | 'salarie';
type Annuler = 'oui' | 'partiel' | 'non';
type Mode = 'direct' | 'carte' | 'conditionnel';
interface Declaration { name: string; description: string; parameters: Record<string, unknown> }
interface DenoMini {
  args: string[];
  readTextFile(chemin: string | URL): Promise<string>;
  writeTextFile(chemin: string | URL, donnees: string): Promise<void>;
  stat(chemin: string | URL): Promise<unknown>;
  exit(code?: number): never;
}
// `globalThis` plutôt que `Deno.` : `npm run typecheck` (tsc, sans les types Deno) parcourt aussi scripts/*.ts.
const deno = (globalThis as unknown as { Deno: DenoMini }).Deno;

/** Ce qu'aucun code ne dit : un jugement relu à la main, outil par outil. */
interface Fiche {
  /** oui = « Annuler » défait exactement ; partiel = il existe mais peut ne pas tout défaire ; non = aucun `undo`. */
  annuler?: Annuler;
  /** Le résultat prévient un tiers (message, notification) : un « Annuler » exact ne le rattrape pas. */
  notifie?: true;
  /** Outils qu'on peut confondre : SYMÉTRIQUE (vérifié), chaque paire doit être départagée par ≥ 2 phrases d'évaluation (T7). */
  proches?: string[];
  /** Pourquoi une valeur certaine mais peu évidente (une ligne chacune). */
  note?: string[];
  /** Valeur à confirmer (une ligne chacune) : écrite dans l'entrée, jamais tue. */
  incertain?: string[];
  /** Paramètres dont le NOM est dans CHAMPS_CARTE mais qui ne sont pas des valeurs écrites à risque. */
  champsCarteNon?: string[];
  /** Paramètres ajoutés à la main à champsCarte. */
  champsCarteEn?: string[];
}

// ── Où lire ─────────────────────────────────────────────────────────────────

const RACINE = new URL('../', import.meta.url);
const DOSSIER_REGISTRE = new URL('supabase/functions/_shared/registre/', RACINE);
export const FICHIERS = {
  bureau: new URL('outils-bureau.ts', DOSSIER_REGISTRE),
  salarie: new URL('outils-salarie.ts', DOSSIER_REGISTRE),
  empreintes: new URL('outils-empreintes.json', DOSSIER_REGISTRE),
};
const EXECUTEUR = { bureau: 'lib/assistant-actions.ts', salarie: 'lib/worker-actions.ts' } as const;
const SAUVEUR = 'lib/worker-assistant.ts';

/** Modules de lib/ qui ne portent aucune écriture de l'outil : le client Supabase partagé et des formats d'heure. */
const LIB_NEUTRES = ['lib/supabase.ts', 'lib/utils.ts'];

/** Les paramètres de CHAMPS_CARTE (§1.2) tels qu'ils s'écrivent dans les déclarations d'aujourd'hui. « panier », « caisse de congés » et « endroit au pointage » n'ont pas encore de paramètre (3d-5). */
const NOMS_CHAMPS_CARTE = [
  'majoration_1', 'majoration_2', 'trajet_paye', 'heures_hebdo', 'relance_auto', 'alertes_budget', 'planning_collegues',
  'email', 'telephone', 'email_comptable',
];

const ROLES: Record<Cote, ('admin' | 'worker' | 'lead')[]> = { bureau: ['admin'], salarie: ['worker', 'lead'] };

// ── Jugement : une fiche par outil (ordre de la déclaration) ────────────────

const FICHES_BUREAU: Record<string, Fiche> = {
  repondre: {},
  inviter_salarie: {
    annuler: 'non', notifie: true, proches: ['cout_reel'],
    note: ['l\'invitation part par e-mail (invite-worker) : le message est déjà chez l\'invité, un « Annuler » exact n\'existe pas.'],
    incertain: ['champsCarte : taux_horaire (paie) n\'est pas dans la liste du §1.2 et reste hors champsCarte.'],
  },
  creer_chantier: {
    annuler: 'partiel', proches: ['ranger_document'],
    note: ['annuler partiel : « Annuler » supprime le client, ou l\'archive si la base refuse (il a déjà servi).'],
    incertain: ['champsCarte : règle cible du §1.2 (telephone, email) ; la condition du mode actuel est budget_heures / montant_devis (actionMode).'],
  },
  ranger_document: { annuler: 'oui', proches: ['creer_chantier', 'ajouter_depense'] },
  poser_absence: { annuler: 'oui', proches: ['repondre_conge'] },
  affecter_planning: {
    annuler: 'partiel', proches: ['modifier_intervention'],
    note: ['annuler partiel : une case qui porte des heures notées depuis est gardée, et c\'est dit (partialUndo).'],
  },
  planning_semaine: {
    annuler: 'partiel',
    note: ['annuler partiel : une case qui porte des heures notées depuis est gardée ; la version du planning gardée reste.'],
  },
  corriger_pointage: {
    annuler: 'non', notifie: true,
    note: ['le salarié est prévenu (send-push) avec le motif : un « Annuler » exact ne rattraperait pas le message ; la correction est tracée avant / après en base.'],
  },
  modifier_intervention: {
    annuler: 'oui', proches: ['affecter_planning'],
    note: ['« Annuler » remet l\'état d\'avant sans vérifier que ces champs valent encore la valeur écrite : §1.2 l\'exigera en 3d-1.'],
  },
  repondre_conge: { annuler: 'non', notifie: true, proches: ['poser_absence'], note: ['le salarié est prévenu (notifyWorker) de la décision.'] },
  lever_reserve: { annuler: 'non' },
  ajouter_depense: { annuler: 'non', proches: ['ranger_document'] },
  modifier_client: { annuler: 'non' },
  archiver_client: { annuler: 'non' },
  changer_role: { annuler: 'non', note: ['droits d\'accès : niveau 3 de la vision, jamais un geste direct.'] },
  relancer_invitation: { annuler: 'non', notifie: true, proches: ['envoyer_rappel'], note: ['renvoie l\'e-mail d\'invitation (invite-worker).'] },
  envoyer_rappel: { annuler: 'non', notifie: true, proches: ['relancer_invitation'], note: ['notification sur le téléphone du salarié (send-push).'] },
  cloturer_mois: { annuler: 'non' },
  attribuer_client: { annuler: 'non' },
  ajouter_habilitation: { annuler: 'non' },
  modifier_salarie: { annuler: 'non' },
  archiver_salarie: { annuler: 'non' },
  cout_reel: { annuler: 'non', proches: ['inviter_salarie'] },
  modifier_reglages: {
    annuler: 'non',
    incertain: ['champsCarte : heure_relance ajouté (il règle relance_auto) ; le §1.2 ne le nomme pas.'],
  },
  supprimer_intervention: { annuler: 'oui', proches: ['effacer_planning'], note: ['paire documentée : 2 échecs sur 3 avant correction (ia-v2.md, « retire X »).'] },
  effacer_planning: { annuler: 'oui', proches: ['supprimer_intervention'] },
  supprimer_absence: { annuler: 'oui' },
  supprimer_document: { annuler: 'oui', note: ['« Annuler » re-téléverse le fichier gardé en mémoire : perdu au rechargement de l\'écran.'] },
  modifier_document: {
    annuler: 'oui',
    note: ['« Annuler » remet catégorie et nom d\'avant sans vérifier qu\'ils valent encore la valeur écrite : §1.2 l\'exigera en 3d-1.'],
  },
  supprimer_depense: { annuler: 'oui' },
  modifier_depense: {
    annuler: 'oui',
    note: ['« Annuler » remet montant, libellé et catégorie d\'avant sans vérifier qu\'ils valent encore la valeur écrite : §1.2 l\'exigera en 3d-1.'],
  },
  supprimer_habilitation: { annuler: 'oui' },
  modifier_habilitation: {
    annuler: 'oui',
    note: ['« Annuler » remet date, libellé et alertes d\'avant sans vérifier qu\'ils valent encore la valeur écrite : §1.2 l\'exigera en 3d-1.'],
  },
  annuler_invitation: {
    annuler: 'partiel', champsCarteNon: ['email'],
    note: [
      'annuler partiel : « Annuler » renvoie une invitation (nouvel e-mail), pas la même ; aucun « Annuler » si l\'invitation n\'est plus trouvée.',
      'email = clé de recherche de l\'invitation à retirer, pas une adresse écrite : hors champsCarte.',
    ],
  },
};

const FICHES_SALARIE: Record<string, Fiche> = {
  effacer_heures: { annuler: 'oui', proches: ['retirer_reserve'] },
  annuler_conge: { annuler: 'oui' },
  modifier_conge: {
    annuler: 'partiel',
    note: ['annuler partiel : si la nouvelle demande ne peut plus être retirée (traitée par le bureau), l\'ancienne est renvoyée et c\'est dit.'],
  },
  retirer_photo: { annuler: 'oui', note: ['« Annuler » re-téléverse le fichier gardé en mémoire : perdu au rechargement de l\'écran.'] },
  retirer_reserve: { annuler: 'oui', proches: ['effacer_heures', 'reserve_corrigee'] },
  repondre: {},
  declarer_heures: {
    annuler: 'partiel', proches: ['modifier_heures', 'terminer_pointage', 'copier_journee'],
    note: [
      'l\'écriture ne passe pas par makeWorkerExecutor mais par makeWorkerSaver (lib/worker-assistant.ts), partagé avec la fiche « Tout confirmer ».',
      'annuler partiel : une ligne retouchée ou envoyée depuis est gardée ; aucun « Annuler » si des lignes sont restées en file hors ligne (profil court).',
    ],
  },
  demander_conge: { annuler: 'oui', note: ['« Annuler » retire la demande tant qu\'elle est en attente ; refusé si le bureau l\'a déjà traitée.'] },
  terminer_pointage: {
    annuler: 'partiel', proches: ['declarer_heures'],
    note: ['annuler partiel : aucun « Annuler » sans chantier connu ; il peut refuser et garder la ligne (GARDEE, DEUX_FOIS, INCERTAIN).'],
  },
  ranger_photo: { annuler: 'oui' },
  signaler_reserve: {
    annuler: 'oui', proches: ['reserve_corrigee'],
    note: ['« Annuler » remet la réserve et l\'observation d\'avant sans vérifier qu\'elles valent encore la valeur écrite : §1.2 l\'exigera en 3d-1.'],
  },
  envoyer_journee: {
    annuler: 'non',
    incertain: ['notifie : la journée part au bureau (visible à la validation) sans notification dans le code ; non posé.'],
  },
  modifier_heures: {
    annuler: 'oui', proches: ['declarer_heures'],
    note: ['« Annuler » remet les horaires d\'avant (refusé si la ligne est verrouillée) sans vérifier qu\'ils valent encore la valeur écrite : §1.2 l\'exigera en 3d-1.'],
  },
  panier_repas: {
    annuler: 'oui',
    note: ['« Annuler » remet l\'état du panier d\'avant sans vérifier qu\'il vaut encore la valeur écrite : §1.2 l\'exigera en 3d-1.'],
    incertain: [
      'champsCarte : `valeur` = le panier du jour du salarié, pas le réglage « panier » de l\'entreprise du §1.2 ; laissé hors champsCarte.',
      'dispo : non posé ; l\'outil reste proposé et l\'exécuteur refuse poliment si l\'entreprise n\'utilise pas le panier (MEAL_OFF_MESSAGE).',
    ],
  },
  copier_journee: {
    annuler: 'partiel', proches: ['declarer_heures'],
    note: ['annuler partiel : une copie retouchée ou envoyée depuis est gardée, et c\'est dit.'],
  },
  reserve_corrigee: {
    annuler: 'oui', proches: ['signaler_reserve', 'retirer_reserve'],
    note: ['« Annuler » rouvre la réserve sans vérifier qu\'elle est encore levée par cette action : §1.2 l\'exigera en 3d-1.'],
  },
  nouveau_chantier: { annuler: 'non', note: ['le salarié ne peut pas supprimer un chantier : pas d\'« Annuler » exact (règle d\'or du §1.2).'] },
  email_client: { annuler: 'non' },
  planning_collegues: {},
};

/** Les lectures d'aujourd'hui : un seul outil, dont le résultat ne revient JAMAIS au modèle (le serveur formate la réponse, IS:144-150). */
const LECTURES: Record<string, { libelle: string; champs: string[]; libres: string[]; limites: { lignes: number; car: number; ms: number }; incertain: string[] }> = {
  planning_collegues: {
    libelle: 'Planning des collègues',
    champs: ['prenom', 'work_date', 'chantier', 'ville', 'debut', 'fin', 'absent'],   // colonnes de la RPC colleagues_planning
    libres: ['prenom', 'chantier', 'ville'],
    limites: { lignes: 0, car: 0, ms: 0 },
    incertain: [
      'limites : 0 = aucune limite codée aujourd\'hui (la RPC borne la période à 14 jours, le serveur interroge un seul jour) ; à fixer par 3c.',
      'kind lecture : aucun _shared/lectures/planning_collegues.ts (le serveur lit la RPC lui-même) ; remplacé par lire_collegues en 3c.',
    ],
  },
};

/** Exécuteurs qui ne sont pas un `case` du commutateur de makeActionExecutor / makeWorkerExecutor. */
const EXECUTEURS_A_PART: Record<string, { cle: string; fichier: string; debut: string; fin: string }> = {
  declarer_heures: { cle: 'makeWorkerSaver', fichier: SAUVEUR, debut: 'export function makeWorkerSaver', fin: 'export const demoSaver' },
};

// ── Lire le code ────────────────────────────────────────────────────────────

const lire = (chemin: string) => deno.readTextFile(new URL(chemin, RACINE));
const sansCommentaires = (t: string) => t.split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');

/** identifiant importé → module de lib/ (« lib/erase.ts »), pour les imports `@/lib/…` seulement. */
async function importsLib(src: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const re = /import\s*\{([^}]*)\}\s*from\s*'@\/lib\/([a-z0-9-]+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let fichier = `lib/${m[2]}.ts`;
    try { await deno.stat(new URL(fichier, RACINE)); } catch { fichier = `lib/${m[2]}.tsx`; await deno.stat(new URL(fichier, RACINE)); }
    for (const brut of m[1].split(',')) {
      const nom = brut.trim();
      if (!nom || /^type\s/.test(nom)) continue;
      out[(/\sas\s+(\w+)$/.exec(nom)?.[1]) ?? nom] = fichier;
    }
  }
  return out;
}

/** Les `case 'x':` du commutateur d'un exécuteur → leur corps (les `case` empilés partagent le même). */
function blocsDuCommutateur(src: string): Record<string, string> {
  const debut = src.indexOf('switch (d.type) {');
  const fin = src.indexOf('\n    } catch (e) {', debut);
  if (debut < 0 || fin < 0) throw new Error('commutateur d\'exécuteur introuvable (forme du code changée ?)');
  const blocs: Record<string, string> = {};
  let etiquettes: string[] = [];
  let corps: string[] = [];
  const clore = () => { for (const e of etiquettes) blocs[e] = corps.join('\n'); etiquettes = []; corps = []; };
  for (const l of src.slice(debut, fin).split('\n').slice(1)) {
    const m = /^ {8}case '([a-z_]+)':(.*)$/.exec(l);
    if (m) {
      if (corps.length) clore();
      etiquettes.push(m[1]);
      const reste = m[2].trim();
      if (reste && reste !== '{') corps.push(reste);
      continue;
    }
    if (!etiquettes.length || /^\s*(\/\/.*)?$/.test(l)) continue;
    corps.push(l);
  }
  clore();
  return blocs;
}

const ECRITURES_EN_LIGNE = /\.(insert|update|delete|upsert)\(|\.rpc\(|\.functions\.invoke\(|\.storage\b/g;

interface Analyse { executeur: string; code: string[]; enLigne: string[]; aUndo: boolean }
/** Fichiers de lib/ qu'un corps appelle réellement (un identifiant importé y figure) ; l'exécuteur lui-même s'ajoute s'il écrit en ligne. */
function analyser(corps: string, imports: Record<string, string>, fichierExecuteur: string, executeur: string): Analyse {
  const t = sansCommentaires(corps);
  const modules: Record<string, true> = {};
  for (const id of Object.keys(imports)) {
    if (LIB_NEUTRES.indexOf(imports[id]) >= 0) continue;
    if (new RegExp(`\\b${id}\\b`).test(t)) modules[imports[id]] = true;
  }
  const enLigne: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(ECRITURES_EN_LIGNE.source, 'g');
  while ((m = re.exec(t))) { const motif = m[0].replace(/\($/, ''); if (enLigne.indexOf(motif) < 0) enLigne.push(motif); }
  const code = Object.keys(modules).sort();
  if (enLigne.length) code.push(fichierExecuteur);
  return { executeur, code, enLigne, aUndo: /\bundo\s*=/.test(t) };
}

// ── Écrire du TypeScript lisible ────────────────────────────────────────────

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
/** Apostrophes simples comme le reste du dépôt ; guillemets doubles (JSON) dès qu'il y a une apostrophe droite, un antislash ou un caractère de contrôle. */
const chaine = (s: string) => (/['\\\u0000-\u001f]/.test(s) ? JSON.stringify(s) : `'${s}'`);
const cle = (k: string) => {
  if (/^\d+$/.test(k)) throw new Error(`clé numérique « ${k} » : l'ordre des clés ne serait plus celui de JSON.stringify`);
  return IDENT.test(k) ? k : chaine(k);
};

function lit(v: unknown, ind: string, largeur = 120): string {
  if (v === null) return 'null';
  if (typeof v === 'string') return chaine(v);
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') { if (!isFinite(v)) throw new Error('nombre non fini'); return String(v); }
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    const items = v.map((x) => lit(x, `${ind}  `, largeur));
    const une = `[${items.join(', ')}]`;
    return une.indexOf('\n') < 0 && ind.length + une.length <= largeur ? une : `[\n${items.map((i) => `${ind}  ${i},`).join('\n')}\n${ind}]`;
  }
  if (typeof v === 'object') {
    const e = Object.keys(v as object).map((k) => {
      const x = (v as Record<string, unknown>)[k];
      if (x === undefined) throw new Error(`valeur « undefined » à la clé ${k} : JSON.stringify la perdrait`);
      return `${cle(k)}: ${lit(x, `${ind}  `, largeur)}`;
    });
    if (!e.length) return '{}';
    const une = `{ ${e.join(', ')} }`;
    return une.indexOf('\n') < 0 && ind.length + une.length <= largeur ? une : `{\n${e.map((i) => `${ind}  ${i},`).join('\n')}\n${ind}}`;
  }
  throw new Error(`valeur non sérialisable : ${typeof v}`);
}

const GROUPES = [
  ['id', 'cote', 'roles', 'kind', 'niveau', 'commande', 'ouvreurs'],
  ['description'],
  ['parametres'],
  ['domaines', 'livraison', 'pieceJointe', 'dispo', 'proches', 'variantes'],
  ['libelle', 'champs', 'libres', 'limites'],
  ['mode', 'modeActuel', 'retrait', 'annuler', 'champsCarte', 'notifie'],
  ['executeur', 'code', 'carte'],
];

function texteEntree(o: Record<string, unknown>, commentaires: string[]): string {
  const I = '    ';
  const lignes: string[] = [];
  for (const g of GROUPES) {
    const parts = g.filter((k) => k in o).map((k) => `${cle(k)}: ${lit(o[k], I)}`);
    if (!parts.length) continue;
    const une = `${I}${parts.join(', ')},`;
    if (g.length === 1 || une.length <= 150 || parts.some((p) => p.indexOf('\n') >= 0)) lignes.push(une);
    else for (const p of parts) lignes.push(`${I}${p},`);
  }
  return `${commentaires.map((c) => `  // ${c}`).join('\n')}\n  {\n${lignes.join('\n')}\n  },`;
}

// ── Construire ──────────────────────────────────────────────────────────────

export interface Empreintes {
  methode: string;
  sources: { bureau: string; salarie: string };
  bureau: { nombre: number; liste: string; outils: { nom: string; sha256: string }[] };
  salarie: { nombre: number; liste: string; outils: { nom: string; sha256: string }[] };
}
export interface Registre {
  bureau: Outil[];
  salarie: Outil[];
  /** Le texte du module jusqu'au repère « fin des outils de la livraison 3a » compris (ce que le script possède). */
  teteBureau: string;
  teteSalarie: string;
  empreintes: Empreintes;
  /** Corps des `case` de chaque exécuteur (et de makeWorkerSaver), pour les tests. */
  executeurs: { bureau: Record<string, string>; salarie: Record<string, string>; sauveur: string };
}

async function sha256(texte: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Le mode de fait d'après actionMode / workerActionMode, en essayant les champs que ces fonctions lisent (budget, devis, ligne déjà envoyée). */
function modeDe(cote: Cote, id: string): Mode {
  const sondes: unknown[] = cote === 'bureau'
    ? [{ type: id }, { type: id, budget_heures: '10' }, { type: id, montant_devis: '100' }]
    : [{ type: id, choix: [] }, { type: id, entry_id: 'a', choix: [{ id: 'a', envoyee: true }] }, { type: id, entry_id: 'a', choix: [{ id: 'a', envoyee: false }] }];
  let direct = false;
  let carte = false;
  for (const s of sondes) {
    const m = cote === 'bureau' ? actionMode(s as never) : workerActionMode(s as never);
    if (m === 'direct') direct = true; else carte = true;
  }
  return direct && carte ? 'conditionnel' : direct ? 'direct' : 'carte';
}

function verifierDeclarations(decls: Declaration[], cote: Cote) {
  for (const d of decls) {
    const k = Object.keys(d).join(',');
    if (k !== 'name,description,parameters') throw new Error(`${cote}/${d.name} : clés « ${k} » au lieu de name,description,parameters (l'empreinte dépend de cet ordre)`);
  }
}

async function construireCote(cote: Cote, decls: Declaration[]) {
  verifierDeclarations(decls, cote);
  const fiches = cote === 'bureau' ? FICHES_BUREAU : FICHES_SALARIE;
  const domaines = cote === 'bureau' ? OFFICE_DOMAINS : WORKER_DOMAINS;
  const retraits = (cote === 'bureau' ? REMOVAL_TYPES : WORKER_REMOVAL_TYPES) as readonly string[];
  const joints = (cote === 'bureau' ? ATTACHMENT_ACTIONS : WORKER_ATTACHMENT_ACTIONS) as readonly string[];

  // Aucune fiche en trop ni en moins : un outil ajouté au code sans fiche fait échouer ici, pas en silence.
  const noms = decls.map((d) => d.name);
  for (const n of noms) if (!(n in fiches)) throw new Error(`${cote}/${n} : pas de fiche dans FICHES_${cote.toUpperCase()}`);
  for (const n of Object.keys(fiches)) if (noms.indexOf(n) < 0) throw new Error(`${cote}/${n} : fiche sans déclaration`);
  for (const n of noms) for (const p of fiches[n].proches ?? []) {
    if (noms.indexOf(p) < 0) throw new Error(`${cote}/${n} : proche « ${p} » inconnu`);
    if ((fiches[p].proches ?? []).indexOf(n) < 0) throw new Error(`${cote}/${n} ↔ ${p} : la paire « proches » doit être symétrique`);
  }

  const srcExec = await lire(EXECUTEUR[cote]);
  const blocs = blocsDuCommutateur(srcExec);
  const importsExec = await importsLib(srcExec);
  const srcSauveur = await lire(SAUVEUR);
  const importsSauveur = await importsLib(srcSauveur);

  const outils: Record<string, unknown>[] = [];
  const coms: string[][] = [];
  for (const d of decls) {
    const f = fiches[d.name];
    const props = Object.keys(((d.parameters.properties ?? {}) as Record<string, unknown>));
    const dom = Object.keys(domaines).filter((k) => (domaines[k].tools as readonly string[]).indexOf(d.name) >= 0);
    const base: Record<string, unknown> = { id: d.name, cote, roles: ROLES[cote] };
    const c: string[] = [];
    const incertain = [...(f.incertain ?? [])];

    if (d.name === 'repondre') {
      Object.assign(base, { kind: 'reponse', niveau: 1 });
      c.push('repondre · réponse · niveau 1 · toujours proposé');
    } else if (LECTURES[d.name]) {
      const l = LECTURES[d.name];
      Object.assign(base, { kind: 'lecture', niveau: 1 });
      incertain.push(...l.incertain);
      c.push(`${d.name} · lecture · niveau 1 · le modèle ne revoit pas le résultat`);
    } else {
      const mode = modeDe(cote, d.name);
      const niveau = mode === 'carte' ? 3 : 2;
      const annuler = f.annuler;
      if (!annuler) throw new Error(`${cote}/${d.name} : « annuler » manque`);
      // Exécuteur : un `case` du commutateur, sinon la fonction à part déclarée dans EXECUTEURS_A_PART.
      const apart = EXECUTEURS_A_PART[d.name];
      let a: Analyse;
      if (apart) {
        const i = srcSauveur.indexOf(apart.debut);
        const j = srcSauveur.indexOf(apart.fin, i);
        if (i < 0 || j < 0) throw new Error(`${cote}/${d.name} : ${apart.cle} introuvable dans ${apart.fichier}`);
        a = analyser(srcSauveur.slice(i, j), importsSauveur, apart.fichier, apart.cle);
      } else {
        if (!(d.name in blocs)) throw new Error(`${cote}/${d.name} : aucun case '${d.name}' dans ${EXECUTEUR[cote]}`);
        a = analyser(blocs[d.name], importsExec, EXECUTEUR[cote], d.name);
      }
      // « Annuler » : le jugement doit s'accorder au code (un `undo` posé, ou non).
      if ((annuler === 'non') === a.aUndo) throw new Error(`${cote}/${d.name} : annuler « ${annuler} » mais ${a.aUndo ? 'un undo est posé' : 'aucun undo n\'est posé'} dans l'exécuteur`);
      if (niveau === 2 && annuler === 'non') throw new Error(`${cote}/${d.name} : niveau 2 sans « Annuler » (T4)`);
      if (f.notifie && niveau === 2 && mode !== 'conditionnel') throw new Error(`${cote}/${d.name} : notifie un tiers mais direct (T4)`);
      // champsCarte : les paramètres de ce nom, hors exceptions relues, plus ceux ajoutés à la main.
      const champs = props.filter((p) => (NOMS_CHAMPS_CARTE.indexOf(p) >= 0 && (f.champsCarteNon ?? []).indexOf(p) < 0) || (f.champsCarteEn ?? []).indexOf(p) >= 0);
      if (niveau === 2 && champs.length && mode !== 'conditionnel') throw new Error(`${cote}/${d.name} : niveau 2 avec ${champs.join(', ')} dans CHAMPS_CARTE doit être conditionnel (T4)`);
      Object.assign(base, { kind: 'ecriture', niveau });
      const eco: Record<string, unknown> = { mode, modeActuel: mode };
      if (retraits.indexOf(d.name) >= 0) eco.retrait = true;
      eco.annuler = annuler;
      if (champs.length) eco.champsCarte = champs;
      if (f.notifie) eco.notifie = true;
      eco.executeur = a.executeur;
      eco.code = a.code;
      (base as Record<string, unknown>).__eco = eco;
      c.push(`${d.name} · écriture · niveau ${niveau} (${mode}) · Annuler : ${annuler}${f.notifie ? ' · prévient un tiers' : ''}${retraits.indexOf(d.name) >= 0 ? ' · retrait' : ''}`);
      if (a.enLigne.length) c.push(`note : écrit aussi en ligne dans l'exécuteur (${a.enLigne.join(', ')}) : à extraire dans lib/*-writes.ts avant qu'un exécuteur du registre l'appelle (§5.2).`);
    }

    const outil: Record<string, unknown> = { ...base };
    delete outil.__eco;
    outil.description = d.description;
    outil.parametres = d.parameters;
    outil.domaines = dom;
    outil.livraison = '3a';
    if (joints.indexOf(d.name) >= 0) outil.pieceJointe = true;
    if (f.proches && f.proches.length) outil.proches = f.proches;
    if (LECTURES[d.name]) {
      const l = LECTURES[d.name];
      outil.libelle = l.libelle; outil.champs = l.champs; outil.libres = l.libres; outil.limites = l.limites;
    }
    const eco = (base as Record<string, unknown>).__eco;
    if (eco) Object.assign(outil, eco);

    for (const n of f.note ?? []) c.push(`note : ${n}`);
    for (const n of incertain) c.push(`incertain : ${n}`);
    outils.push(outil);
    coms.push(c);
  }
  return { outils, coms, executeurs: blocs, sauveur: srcSauveur };
}

const ENTETE_COMMUN = (cote: Cote, total: number, hors: number) => `// Outils de l'assistant du ${cote === 'bureau' ? 'BUREAU' : 'SALARIÉ'} qui EXISTENT aujourd'hui (${total} déclarations : \`repondre\` + ${hors} outils) : ce que le modèle voit (description et
// paramètres, mot pour mot) et la règle de chaque outil (niveau, mode, « Annuler », exécuteur). Couche STABLE du registre.
// Contrat : docs/ia-etape3/00-conception-etape3.md §2.3. Ordre = celui de ${cote === 'bureau' ? 'ASSISTANT_FUNCTIONS (assistant-actions-core.ts)' : 'WORKER_FUNCTIONS (worker-assistant-core.ts)'} : il fait
// partie de ce que le modèle reçoit, donc de l'empreinte.
//
// Les entrées jusqu'au repère « fin des outils de la livraison 3a » sont GÉNÉRÉES par scripts/registre-outils-gen.ts d'après le code : pour
// changer un jugement (« Annuler », outils proches…), éditer les FICHES du script et le relancer, pas ce fichier. Le script disparaît en 3a-2,
// quand les listes de AC sortent du registre. Après le repère, les outils des livraisons suivantes (3b, 3c, 3d) s'écrivent à la main ; le script
// les laisse intacts. POURQUOI GÉNÉRÉ : des descriptions recopiées à la main finiraient par différer d'un caractère de celles sur lesquelles la
// consigne a été réglée. La preuve du contraire est outils-empreintes.json (SHA-256 gelés) et registre-outils.test.ts : les outils
// \`livraison: '3a'\`, ré-assemblés en { name, description, parameters }, redonnent la liste d'aujourd'hui. Changer un mot d'une description ou
// d'un schéma fait donc échouer ce test : c'est voulu, c'est une livraison à empreinte déclarée (3b-0), jamais une retouche en passant.
//
// Lecture d'une entrée (§1.2) : \`kind\` + \`niveau\` = ce que l'outil est AUJOURD'HUI ; \`mode\` = \`modeActuel\` en 3a (aucun changement de
// comportement) ; \`annuler\` : oui = l'inverse exact, partiel = « Annuler » existe mais peut ne pas tout défaire, non = rien à rejouer ;
// \`notifie\` : le résultat prévient un tiers ; \`champsCarte\` : paramètres de CHAMPS_CARTE (§1.2) ; \`executeur\` : le \`case\` de l'exécuteur du
// navigateur ; \`code\` : fichiers de lib/ réellement appelés par ce \`case\` (l'exécuteur lui-même quand il écrit aussi en ligne) ; \`retrait\` :
// REMOVAL_TYPES ; \`pieceJointe\` : ATTACHMENT_ACTIONS ; \`domaines\` : tool-domains.ts. Les lignes « note » justifient une valeur sûre mais peu
// évidente, les lignes « incertain » signalent une valeur à confirmer.`;

const ENTETE_SALARIE_PLUS = `//
// PROFIL LONG (phrase libre de ≥ 120 caractères, turc, plusieurs actions : saisie-profil.ts) : tout geste \`direct\` ci-dessous y passe par une
// fiche à confirmer (worker-multi.ts, \`confirmer: true\`). \`mode\` décrit le profil court, le seul que workerActionMode connaisse. Le profil long
// a en outre deux déclarations à lui (DECLARER_HEURES_LONG, NOUVEAU_CHANTIER_LONG, worker-multi-prompt.ts) que ce registre ne porte pas
// encore : \`variantes\` (§2.3) ne prévoit que l'extension d'un outil par une livraison, pas un profil : à trancher avant 3a-2.`;

/**
 * Le repère après lequel le script ne touche à rien : les outils des livraisons suivantes (3b, 3c, 3d) s'écrivent à la main
 * à la suite. Sans lui, relancer le script effacerait leur travail.
 */
export const REPERE = '  // ── fin des outils de la livraison 3a (ci-dessus : généré par scripts/registre-outils-gen.ts ; les outils des livraisons suivantes s\'ajoutent APRÈS ce repère) ──';
const REPERE_DEBUT = '\n  // ── fin des outils de la livraison 3a';   // avec son début de ligne : l'en-tête du fichier cite aussi ces mots

function texteTete(cote: Cote, outils: Record<string, unknown>[], coms: string[][]): string {
  const total = outils.length;
  const nom = cote === 'bureau' ? 'OUTILS_BUREAU' : 'OUTILS_SALARIE';
  const entete = ENTETE_COMMUN(cote, total, total - 1) + (cote === 'salarie' ? `\n${ENTETE_SALARIE_PLUS}` : '');
  const corps = outils.map((o, i) => texteEntree(o, coms[i])).join('\n');
  return `${entete}\nimport type { Outil } from './types.ts';\n\nexport const ${nom}: Outil[] = [\n${corps}\n${REPERE}\n`;
}

/** Le fichier à écrire : la tête du script + ce qui suit le repère dans le fichier actuel (outils des livraisons suivantes), intact. */
export function assembler(tete: string, existant: string | null): string {
  let suite = '';
  if (existant) {
    const i = existant.indexOf(REPERE_DEBUT);
    const finLigne = i < 0 ? -1 : existant.indexOf('\n', i + 1);
    const fin = existant.lastIndexOf('\n];');
    if (finLigne >= 0 && fin > finLigne) suite = existant.slice(finLigne + 1, fin + 1);
  }
  return `${tete}${suite}];\n`;
}

/** Preuve de génération : la tête écrite, évaluée comme du JavaScript, redonne exactement les objets et les déclarations d'origine. */
function verifierRelecture(cote: Cote, tete: string, outils: Record<string, unknown>[], decls: Declaration[]) {
  const i = tete.indexOf('= [\n');
  const lu = new Function(`return ${tete.slice(i + 2)}]`)() as Record<string, unknown>[];
  if (JSON.stringify(lu) !== JSON.stringify(outils)) throw new Error(`${cote} : le texte écrit ne redonne pas les outils en mémoire`);
  const rassemble = lu.map((o) => ({ name: o.id, description: o.description, parameters: o.parametres }));
  if (JSON.stringify(rassemble) !== JSON.stringify(decls)) throw new Error(`${cote} : les outils ré-assemblés diffèrent des déclarations`);
}

export async function construire(): Promise<Registre> {
  const dB = ASSISTANT_FUNCTIONS as unknown as Declaration[];
  const dS = WORKER_FUNCTIONS as unknown as Declaration[];
  const b = await construireCote('bureau', dB);
  const s = await construireCote('salarie', dS);
  const teteBureau = texteTete('bureau', b.outils, b.coms);
  const teteSalarie = texteTete('salarie', s.outils, s.coms);
  verifierRelecture('bureau', teteBureau, b.outils, dB);
  verifierRelecture('salarie', teteSalarie, s.outils, dS);
  const bloc = async (decls: Declaration[]) => ({
    nombre: decls.length,
    liste: await sha256(JSON.stringify(decls)),
    outils: await Promise.all(decls.map(async (d) => ({ nom: d.name, sha256: await sha256(JSON.stringify(d)) }))),
  });
  const empreintes: Empreintes = {
    methode: 'SHA-256 (hex) du JSON.stringify de la déclaration { name, description, parameters } telle que le modèle la reçoit aujourd\'hui ; « liste » = celui du tableau entier, dans l\'ordre actuel (celui de JSON.stringify(functionsFor(…)) sans filtre). GELÉ : fichier généré par scripts/registre-outils-gen.ts, jamais édité à la main.',
    sources: {
      bureau: 'supabase/functions/_shared/assistant-actions-core.ts : ASSISTANT_FUNCTIONS',
      salarie: 'supabase/functions/_shared/worker-assistant-core.ts : WORKER_FUNCTIONS',
    },
    bureau: await bloc(dB),
    salarie: await bloc(dS),
  };
  return {
    bureau: b.outils as unknown as Outil[],
    salarie: s.outils as unknown as Outil[],
    teteBureau, teteSalarie, empreintes,
    executeurs: { bureau: b.executeurs, salarie: s.executeurs, sauveur: s.sauveur },
  };
}

export const texteEmpreintes = (e: Empreintes) => `${JSON.stringify(e, null, 2)}\n`;

// ── Programme ───────────────────────────────────────────────────────────────

async function lireOuNull(u: URL): Promise<string | null> {
  try { return await deno.readTextFile(u); } catch { return null; }
}

async function main() {
  const args = deno.args;
  const verifier = args.indexOf('--verifier') >= 0;
  const regenerer = args.indexOf('--regenerer-empreintes') >= 0;
  const r = await construire();
  const [bureau, salarie, gelees] = [await lireOuNull(FICHIERS.bureau), await lireOuNull(FICHIERS.salarie), await lireOuNull(FICHIERS.empreintes)];
  const cibles: [URL, string][] = [
    [FICHIERS.bureau, assembler(r.teteBureau, bureau)], [FICHIERS.salarie, assembler(r.teteSalarie, salarie)], [FICHIERS.empreintes, texteEmpreintes(r.empreintes)],
  ];
  const resume = `bureau ${r.bureau.length} déclarations (${r.bureau.length - 1} outils + repondre), salarié ${r.salarie.length} (${r.salarie.length - 1} + repondre)`;

  if (verifier) {
    let ecart = 0;
    for (const [u, texte] of cibles) {
      if ((await lireOuNull(u)) !== texte) { console.error(`ÉCART : ${u.pathname.split('/').slice(-1)[0]} n'est pas ce que le code produit aujourd'hui`); ecart++; }
    }
    if (ecart) { console.error('Relancer sans --verifier pour réécrire les modules (et --regenerer-empreintes si les déclarations ont changé exprès).'); deno.exit(1); }
    console.log(`OK : outils-bureau.ts, outils-salarie.ts et outils-empreintes.json décrivent exactement le code (${resume}).`);
    return;
  }

  // Gel : les empreintes déjà écrites ne bougent que sur demande explicite.
  if (gelees !== null && gelees !== texteEmpreintes(r.empreintes) && !regenerer) {
    console.error('REFUS : les déclarations ont changé depuis le gel de outils-empreintes.json. Si le changement est voulu (livraison à empreinte déclarée), relancer avec --regenerer-empreintes et l\'écrire dans la PR.');
    deno.exit(1);
  }
  for (const [u, texte] of cibles) await deno.writeTextFile(u, texte);
  console.log(`Écrit : outils-bureau.ts, outils-salarie.ts, outils-empreintes.json (${resume}).`);
}

// Pas d'`await` de premier niveau : `npm run typecheck` (tsc, cible es5) parcourt aussi scripts/*.ts.
if ((import.meta as unknown as { main?: boolean }).main) main().catch((e) => { console.error(e); deno.exit(1); });
