// Test de couverture du registre (étape 3, livraison 3a-1) : T1 à T11 du contrat (docs/ia-etape3/00-conception-etape3.md §2.3).
//
// POURQUOI ce test existe : l'assistant ne peut faire (ou guider) que ce que le registre connaît. Sans lui, chaque bouton, chaque
// fenêtre, chaque RPC ajouté dans l'interface serait un oubli silencieux : l'assistant ne saurait rien de la nouveauté, personne ne
// le verrait avant qu'un patron la demande. Ici, l'oubli devient un échec de CI, avec la clé, le fichier:ligne et la ligne à coller.
//
// FORME : chaque Tn est une fonction PURE (le registre, le scan et le texte du code lui sont passés) ; les tests « dépôt réel » lui
// donnent le vrai dépôt, les tests « fixtures » lui donnent de petits dépôts fabriqués. Les fixtures prouvent que la règle est JUSTE
// (T8 et T11 passent trivialement aujourd'hui, faute de fichiers à contrôler : sans fixtures on ne saurait pas s'ils vérifient quoi que ce soit).
//
// DÉTERMINISME : aucune date lue hors de `aujourdhui()` (utilisée par le seul test de dette échue, injectable par REGISTRE_AUJOURDHUI) ;
// pas de réseau ; ordre de lecture trié. Durée : quelques secondes (le scan lit ~250 fichiers).
//
// RÉGLAGES (variables d'environnement, tous facultatifs ; --allow-env est donné par npm run test:couverture et par la CI) :
//   REGISTRE_AUJOURDHUI=AAAA-MM-JJ     la date du test de dette échue (T3), au lieu du jour
//   REGISTRE_DETTES_PERIMEES=avertir   une dette échue avertit au lieu d'échouer (PR sans rapport avec le registre ; la CI le pose, §2.3 T3)
//   REGISTRE_CLICS=bloquer             T10 échoue au lieu d'avertir (PR qui touche l'interface, une fois le redesign intégré)
//   REGISTRE_A_LA_LIVRAISON=1          T7 exige que chaque cas ait déjà été mesuré (mesures.json), à la livraison et pas à chaque PR
//   REGISTRE_REGENERER=1               réécrit dettes.json, clics.snapshot.json et complète ids.snapshot.json (exige --allow-write) ;
//                                      ou une liste « dettes,clics,ids » pour n'en régénérer que certains
//
//   npm run test:couverture   (npx -y deno@2.9.6 test --allow-env --allow-read supabase/functions/_shared/registre-couverture.test.ts)
import { ACTION_TYPES, actionMode, ATTACHMENT_ACTIONS, GUIDE, NAV_ACTIONS, REMOVAL_TYPES } from './assistant-actions-core.ts';
import { ASSISTANT_FUNCTIONS } from './assistant-outils.ts';
import { WORKER_ATTACHMENT_ACTIONS, WORKER_GUIDE, WORKER_NAV, WORKER_REMOVAL_TYPES, workerActionMode } from './worker-assistant-core.ts';
import { WORKER_FUNCTIONS } from './worker-outils.ts';
import { OFFICE_DOMAINS, WORKER_DOMAINS } from './tool-domains.ts';
import { ADMIN_SCREENS, ADMIN_TOURS } from './admin-tours.ts';
import { WORKER_TOURS } from './worker-tours.ts';
import { CASES } from '../assistant-eval/cases.ts';
import { grouperParCle, masquer, scannerSurfaces, type ResultatScan } from './registre-surfaces.ts';
import { lireSources, RACINE_DEPOT } from './registre-surfaces-cli.ts';
import { ALIAS_SANS_OUVREUR, OUVREURS, OUVREURS_REPORTES } from './registre/ouvreurs.ts';
import {
  CAPACITES_BUREAU, CAPACITES_SALARIE, ECRITURES_NON_ASSISTEES, HORIZON_DETTES, INTERNE, LIVRAISON_COURANTE, livraisonAtteinte, lireDettes,
  ORDRE_LIVRAISONS, OUTILS_BUREAU, OUTILS_SALARIE, SURFACES, SURFACES_EN_MIGRATION,
  type Capacite, type CategorieHumain, type ClicsSnapshot, type Cote, type DettesMax, type EntreeInterne, type Livraison, type Outil, type Ouvreur,
} from './registre/index.ts';

// ════════════════════════════════════════════════════════════════════════════
// Petits outils
// ════════════════════════════════════════════════════════════════════════════

/** Une variable d'environnement, ou undefined (sans --allow-env, Deno lève : le test reste lisible plutôt que de planter). */
function env(nom: string): string | undefined {
  try { return Deno.env.get(nom); } catch { return undefined; }
}

/**
 * LA seule horloge du fichier. Lue par le seul test de dette échue (T3) ; injectable pour qu'il soit rejouable à n'importe quelle date
 * (les mutations du script scripts/tests/registre-mutations.mjs s'en servent). Une date mal écrite est une erreur, jamais « aujourd'hui ».
 */
function aujourdhui(): { date: string; source: 'REGISTRE_AUJOURDHUI' | 'horloge' } {
  const injectee = env('REGISTRE_AUJOURDHUI');
  if (injectee !== undefined) {
    if (!dateValide(injectee)) throw new Error(`REGISTRE_AUJOURDHUI=« ${injectee} » : attendu AAAA-MM-JJ, une date qui existe`);
    return { date: injectee, source: 'REGISTRE_AUJOURDHUI' };
  }
  return { date: new Date().toISOString().slice(0, 10), source: 'horloge' };
}

/** AAAA-MM-JJ qui existe (calculé à la main : aucun `new Date(texte)`, donc aucune dépendance au fuseau ni à l'horloge). */
export function dateValide(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [a, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const bissextile = (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
  const jours = [31, bissextile ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return mo >= 1 && mo <= 12 && j >= 1 && j <= jours;
}

const AVERTISSEMENTS: { test: string; lignes: string[] }[] = [];
/** Un avertissement n'arrête rien : il s'imprime tout de suite (le script de mutations le lit) et se rappelle en fin de test. */
function avertir(test: string, lignes: string[]): void {
  if (!lignes.length) return;
  AVERTISSEMENTS.push({ test, lignes });
  console.log(`AVERTISSEMENT ${test} : ${lignes.length} point(s)\n${lignes.map((l) => `  - ${l}`).join('\n')}`);
}

/** La commande qui réécrit les fichiers générés (dettes, clics, ids) : donnée telle quelle dans les messages, pour qu'on la colle. */
const REGENERER = (quoi: string) => `REGISTRE_REGENERER=${quoi} npx -y deno@2.9.6 test --allow-env --allow-read --allow-write supabase/functions/_shared/registre-couverture.test.ts`;

/** « 1 problème », « 3 problèmes » : le titre d'un échec dit COMBIEN. */
const pl = (n: number, un: string, plusieurs = `${un}s`) => `${n} ${n === 1 ? un : plusieurs}`;

/** Un échec lisible : le titre dit combien, chaque ligne dit quoi faire (clé, fichier:ligne, ligne à coller), l'aide dit où. */
function echoue(titre: string, lignes: string[], aide = ''): never {
  throw new Error(`${titre}\n${lignes.map((l) => `  ${l}`).join('\n')}${aide ? `\n${aide}` : ''}`);
}

const egal = (obtenu: unknown, attendu: unknown, msg: string) => {
  const a = JSON.stringify(obtenu); const b = JSON.stringify(attendu);
  if (a !== b) throw new Error(`${msg}\n  obtenu  : ${a}\n  attendu : ${b}`);
};
const vrai = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };

async function sha256(texte: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const lireTexte = (relatif: string) => Deno.readTextFile(new URL(relatif, RACINE_DEPOT));
async function existe(relatif: string): Promise<boolean> {
  try { await Deno.stat(new URL(relatif, RACINE_DEPOT)); return true; } catch { return false; }
}
function ligneDe(texte: string, decalage: number): number {
  let n = 1;
  for (let i = 0; i < decalage && i < texte.length; i++) if (texte[i] === '\n') n++;
  return n;
}

// ════════════════════════════════════════════════════════════════════════════
// Le registre tel qu'il est (une seule lecture), et ce que le test en déduit
// ════════════════════════════════════════════════════════════════════════════

interface Registre {
  capacites: readonly Capacite[];
  surfaces: Readonly<Record<string, readonly string[]>>;
  interne: readonly EntreeInterne[];
  ecritures: readonly EntreeInterne[];
  outils: readonly Outil[];
}
const REGISTRE: Registre = {
  capacites: [...CAPACITES_BUREAU, ...CAPACITES_SALARIE],
  surfaces: SURFACES,
  interne: INTERNE,
  ecritures: ECRITURES_NON_ASSISTEES,
  outils: [...OUTILS_BUREAU, ...OUTILS_SALARIE],
};

const CATEGORIES_HUMAIN: readonly CategorieHumain[] = ['niveau3_valide', 'droits_acces', 'paiement', 'securite', 'appareil', 'donnee_sensible', 'hors_ecran', 'doute_patron'];
const RAISON_MINIMUM = 30;

/** Une clé qui nomme une écriture : jamais dans `interne` (§2.3), toujours rattachée à une capacité ou à la liste « écritures non assistées ». */
const estCleDEcriture = (cle: string) => /^(rpc|fn|ecriture):/.test(cle) || /^table:[^:]*:(insert|update|delete|upsert)$/.test(cle);
/** Le scanner n'a pas pu lire le nom (`.from(variable)`, `invoke(nom)`) : T1 le refuse, sauf exception déclarée. */
const estNomCalcule = (cle: string) => /^(rpc|fn|fenetre):\?$/.test(cle) || /^table:\?:/.test(cle);
const PREFIXES_VALIDES = /^(fenetre|dialogue|rpc|fn|table|ecriture|ancre|ancre-dynamique|nav|guide|route):./;

const paramsDe = (o: Outil): string[] => Object.keys(((o.parametres as { properties?: Record<string, unknown> }).properties) ?? {});
const outilsServis = (outils: readonly Outil[], cote: Cote, courante: Livraison = LIVRAISON_COURANTE) =>
  outils.filter((o) => o.cote === cote && livraisonAtteinte(o.livraison, courante));

/** Le prochain id libre d'un côté (B139+ / S106+, §1.1) : jamais un id déjà publié, jamais un trou. */
function prochainId(capacites: readonly Capacite[], cote: Cote, deja = 0): string {
  const max = Math.max(0, ...capacites.filter((c) => c.cote === cote).map((c) => Number(c.id.slice(1)) || 0));
  return `${cote === 'bureau' ? 'B' : 'S'}${max + 1 + deja}`;
}
/**
 * Le côté PRÉSUMÉ d'un fichier, pour que le message dise dans quel surfaces-*.ts coller. D'abord ce que le registre sait déjà : si des clés de CE fichier
 * (dialogue:components/x#…, ecriture:lib/x#…, fenetre:x) sont déjà rangées sous des capacités B… ou S…, c'est le côté de la majorité (components/worker-detail.tsx
 * est la fiche salarié du BUREAU, malgré son nom). Sinon le chemin : écrans du salarié (poseur, pointer), lib/worker-*, live-session, offline.
 */
function cotePresume(fichier: string, surfaces: Readonly<Record<string, readonly string[]>> = {}): Cote {
  const base = fichier.replace(/\.[tj]sx?$/, '');
  const module = base.replace(/^components\//, '');
  const voix: Record<Cote, number> = { bureau: 0, salarie: 0 };
  for (const [id, cles] of Object.entries(surfaces)) {
    for (const cle of cles) if (cle.includes(`${base}#`) || cle === `fenetre:${module}`) voix[id[0] === 'S' ? 'salarie' : 'bureau']++;
  }
  if (voix.bureau !== voix.salarie) return voix.salarie > voix.bureau ? 'salarie' : 'bureau';
  return /(^|\/)(poseur|pointer)(\/|-|\.)|^lib\/(worker-|live-session|offline)/.test(fichier) ? 'salarie' : 'bureau';
}

// ── Exceptions de départ, dites ─────────────────────────────────────────────
// Le contrat exige zéro exception ; l'état du dépôt à la livraison 3a-1 en a quelques-unes, qui ne se règlent QUE par une ligne
// de commentaire dans le code de l'interface (lib/) ou par une ligne dans le registre, fichiers que cette livraison ne touche pas.
// Plutôt qu'un test rouge dès le premier jour ou un test affaibli en silence, chacune est ici, nommée, avec sa raison et la ligne
// qui la supprimera. Deux garanties : (1) toute AUTRE entrée du même genre fait échouer T1 ; (2) dès que l'exception n'est plus
// nécessaire (la ligne est posée), le test échoue jusqu'à ce qu'elle soit retirée d'ici : la liste ne peut que raccourcir.

interface NomCalcule { cle: string; fichier: string; raison: string; declaration: string }
const NOMS_CALCULES_ACCEPTES: readonly NomCalcule[] = [
  { cle: 'fn:?', fichier: 'lib/assistant.ts', declaration: '// registre:fn=assistant,worker-assistant',
    raison: 'invokeAssistant(name) appelle « assistant » ou « worker-assistant » selon le côté : une seule fonction pour les deux assistants (S83 la porte dans surfaces-salarie.ts).' },
  { cle: 'fn:?', fichier: 'lib/ia-formule.ts', declaration: '// registre:fn=assistant,worker-assistant,payslip-read',
    raison: 'iaFormule(fn) lit la formule d’essai d’une des trois fonctions d’IA, pour la seule console du support : aucune écriture.' },
  { cle: 'table:?:upsert', fichier: 'lib/erase.ts', declaration: '// registre:tables=worksite_expenses,certifications,planning,time_entries',
    raison: 'restoreRows(table, rows) remet des lignes effacées (l’« Annuler » d’un effacement) ; appelée avec worksite_expenses, certifications, planning, time_entries.' },
  { cle: 'table:?:delete', fichier: 'lib/erase.ts', declaration: '// registre:tables=worksite_expenses,certifications',
    raison: 'eraseOne(table, …) efface une dépense ou une habilitation (supprimer_depense, supprimer_habilitation) ; la table est un paramètre.' },
];

/**
 * Capacités du registre qui ne disent rien (ni outil, ni ouvreur, ni humain, ni dette, ni écart, ni fiche d'aide) : le registre les a laissées
 * nues parce que leur état est « couvert par un comportement hors registre » (instantané, lecteur local, fiche multi) et que le type
 * `Capacite` n'a pas de champ pour le dire. Même règle que ci-dessus : on ne les cache pas, on les nomme avec la correction proposée.
 */
const CAPACITES_MUETTES_CONNUES: readonly { id: string; correction: string }[] = [
  { id: 'S2', correction: "capacites-salarie.ts : outil: 'repondre' (lu dans l'instantané « prevu_par_le_bureau », comme B7)" },
  { id: 'S11', correction: "capacites-salarie.ts : ecart: { livraison: '3b', note: 'Lien « borne » (WORKER_NAV) aujourd’hui ; ouvreur en 3b.' }" },
  { id: 'S12', correction: "capacites-salarie.ts : outil: 'repondre' (lu dans l'instantané « en_cours »)" },
  { id: 'S85', correction: "capacites-salarie.ts : outil: 'repondre' (les suggestions posent une question à l'assistant), ou humain hors_ecran + raison" },
  { id: 'S88', correction: "capacites-salarie.ts : ecart: { livraison: '3d6', note: '« Tout confirmer » / « Ignorer » de la fiche multi ; plusieurs actions d’une phrase = 3d-6.' }, ou humain hors_ecran (le clic est humain)" },
];

/** Fiches d'aide sans capacité (GUIDE / WORKER_GUIDE) : à rattacher par `guides: ['…']` dans la capacité qui porte le geste. */
const GUIDES_SANS_CAPACITE_CONNUS: readonly { cote: Cote; id: string; correction: string }[] = [
  { cote: 'bureau', id: 'sortie_oubliee', correction: "capacites-bureau.ts : ajouter guides: ['sortie_oubliee'] à la capacité « À relancer » (B9) ou à celle des corrections de pointage" },
  { cote: 'salarie', id: 'collegues', correction: "capacites-salarie.ts : ajouter guides: ['collegues'] à S90 (« Questions heures, planning, collègues »)" },
];

// ════════════════════════════════════════════════════════════════════════════
// T1 couverture · T2 périmé
// ════════════════════════════════════════════════════════════════════════════

interface ContexteT1 {
  /** Clés couvertes par un ouvreur (`ouvreurs[*].composants / etats`, livraison 3b) : aucun ouvreur n'est livré en 3a. */
  clesOuvreurs: readonly string[];
  /** `ancre:x.y` citées par un parcours guidé qu'une capacité nomme dans `guides` (§2.3 : « couverte si un parcours la cite »). */
  ancresParcours: ReadonlySet<string>;
  nomsCalcules: readonly NomCalcule[];
  guidesSansCapaciteConnus: readonly { cote: Cote; id: string; correction: string }[];
  /** Les clés `nav:` / `guide:` issues du code (import direct, §2.3). */
  clesNav: readonly string[];
  guidesDuCode: readonly { cote: Cote; id: string }[];
  /** À partir de 3b les vocabulaires de navigation échouent (vague 5) ; avant, ils avertissent. */
  navBloquant: boolean;
}

/**
 * Les clés de surface que les ouvreurs LIVRÉS couvrent (3b-1) : leurs fenêtres (`composants` → `fenetre:`), leurs ancres (`ancre:`), et les actions de lien d'avant
 * qu'ils reprennent en `alias` (`nav:`), plus les actions « sans ouvreur » dites avec leur raison. Seules les clés qui existent vraiment sont rendues : un alias comme
 * `salarie:` ou `nouveau-client` n'est pas une entrée de NAV_ACTIONS (T2 y verrait une clé périmée).
 */
export function clesOuvreursDe(ouvreurs: readonly Ouvreur[], sansOuvreur: readonly { cote: Cote; alias: string }[], clesNav: readonly string[]): string[] {
  const cles = new Set<string>();
  for (const o of ouvreurs) {
    for (const c of o.composants ?? []) cles.add(`fenetre:${c}`);
    for (const a of o.ancres ?? []) cles.add(`ancre:${a}`);
    for (const a of o.alias ?? []) if (clesNav.includes(`nav:${o.cote}:${a}`)) cles.add(`nav:${o.cote}:${a}`);
  }
  for (const a of sansOuvreur) if (clesNav.includes(`nav:${a.cote}:${a.alias}`)) cles.add(`nav:${a.cote}:${a.alias}`);
  return Array.from(cles).sort();
}

/** Les pages où vivent les états d'un côté (T1 ouvreurs : un état cité par un ouvreur existe en `useState`). */
const PAGES_ETATS: Record<Cote, readonly string[]> = {
  bureau: ['components/admin-planning.tsx', 'app/admin/page.tsx'],
  salarie: ['app/poseur/page.tsx', 'components/poseur-day.tsx'],
};

export interface ContexteOuvreurs {
  ouvreurs: readonly Ouvreur[];
  sansOuvreur: readonly { cote: Cote; alias: string; raison: string }[];
  sources: Readonly<Record<string, string>>;
  /** Toutes les clés que le scanner a trouvées dans le code (fenetre:, ancre:…). */
  cles: ReadonlySet<string>;
  /** Les actions de lien d'avant, par côté : NAV_ACTIONS / WORKER_NAV, `lien` de chaque fiche, écrans des guides pas à pas. */
  liens: Record<Cote, readonly string[]>;
}

/**
 * T1 étendu (3b, §3.4) : chaque ouvreur référence des composants, états et ancres qui EXISTENT ; chaque action de lien d'avant (NAV_ACTIONS, WORKER_NAV, `lien` d'une
 * fiche, `AdminScreen`, `TourScreen`) est l'alias d'un ouvreur livré ou une entrée « sans ouvreur » avec sa raison — sinon ce lien n'a plus d'ouvreur et l'ouvreur d'après
 * ne sera pas écrit. Un ouvreur ne se range pas à la fois dans OUVREURS et dans OUVREURS_REPORTES.
 */
export function verifierT1Ouvreurs(c: ContexteOuvreurs): string[] {
  const p: string[] = [];
  for (const o of c.ouvreurs) {
    for (const m of o.composants ?? []) {
      if (!c.cles.has(`fenetre:${m}`)) p.push(`ouvreur « ${o.id} »  → composant « ${m} » : aucun lazyWindow / dynamic ne charge components/${m}.tsx (renommé ? corrigez composants dans registre/ouvreurs.ts)`);
    }
    for (const a of o.ancres ?? []) {
      if (!c.cles.has(`ancre:${a}`)) p.push(`ouvreur « ${o.id} »  → ancre « ${a} » : aucun data-guide ne la porte (renommée ? corrigez ancres dans registre/ouvreurs.ts)`);
    }
    for (const e of o.etats ?? []) {
      const ici = PAGES_ETATS[o.cote].some((f) => new RegExp(`const\\s*\\[\\s*${e}\\s*,`).test(c.sources[f] ?? ''));
      if (!ici) p.push(`ouvreur « ${o.id} »  → état « ${e} » : pas de \`const [${e}, …] = useState\` dans ${PAGES_ETATS[o.cote].join(' ni ')} (renommé ? corrigez etats dans registre/ouvreurs.ts)`);
    }
  }
  for (const cote of ['bureau', 'salarie'] as const) {
    const alias = new Set<string>([...c.ouvreurs.filter((o) => o.cote === cote).flatMap((o) => o.alias ?? []), ...c.sansOuvreur.filter((a) => a.cote === cote).map((a) => a.alias)]);
    for (const l of Array.from(new Set(c.liens[cote]))) {
      if (l.indexOf('ask:') === 0 || alias.has(l)) continue;
      p.push(`lien « ${l} » (${cote})  → ni l'alias d'un ouvreur livré, ni dans ALIAS_SANS_OUVREUR : ajoutez-le à \`alias\` de l'ouvreur qui l'ouvre, ou à ALIAS_SANS_OUVREUR avec sa raison (registre/ouvreurs.ts)`);
    }
  }
  const ids = new Set(c.ouvreurs.map((o) => o.id));
  for (const r of OUVREURS_REPORTES) if (ids.has(r.id)) p.push(`ouvreur « ${r.id} »  → déclaré livré ET reporté : retirez-le de OUVREURS_REPORTES`);
  return p;
}

function contexteReel(): ContexteT1 {
  const guidesDe = (cote: Cote) => new Set(REGISTRE.capacites.filter((c) => c.cote === cote).flatMap((c) => c.guides ?? []));
  const gb = guidesDe('bureau'); const gs = guidesDe('salarie');
  const ancres = new Set<string>();
  for (const t of ADMIN_TOURS) if (gb.has(t.id)) for (const e of t.etapes) ancres.add(`ancre:${e.cible}`);
  for (const t of WORKER_TOURS) if (gs.has(t.id)) for (const e of t.etapes) ancres.add(`ancre:${e.cible}`);
  const clesNav = [...Object.keys(NAV_ACTIONS).map((k) => `nav:bureau:${k}`), ...Object.keys(WORKER_NAV).map((k) => `nav:salarie:${k}`)];
  return {
    clesOuvreurs: clesOuvreursDe(OUVREURS, ALIAS_SANS_OUVREUR, clesNav),
    ancresParcours: ancres,
    nomsCalcules: NOMS_CALCULES_ACCEPTES,
    guidesSansCapaciteConnus: GUIDES_SANS_CAPACITE_CONNUS,
    clesNav,
    guidesDuCode: [...GUIDE.map((g) => ({ cote: 'bureau' as const, id: g.id })), ...WORKER_GUIDE.map((g) => ({ cote: 'salarie' as const, id: g.id }))],
    navBloquant: livraisonAtteinte('3b'),
  };
}

/** La ligne `// registre:…` qui déclare ce que le scanner ne sait pas lire. */
function declarationPour(cle: string): string {
  if (cle.startsWith('table:?')) return '// registre:tables=table_a,table_b   (juste avant l’appel, sans ligne vide ni « ; » entre les deux)';
  if (cle === 'fn:?') return '// registre:fn=fonction_a,fonction_b';
  if (cle === 'rpc:?') return '// registre:rpc=rpc_a,rpc_b';
  return 'écrivez le chargeur en clair : lazyWindow(() => import(\'@/components/ma-fenetre\'))';
}

/** Les clés déjà connues qui ressemblent le plus à `cle` (trigrammes) : « vous vouliez dire… ? » pour un renommage. */
function ressemblants(cle: string, candidats: Iterable<string>, n = 2): string[] {
  const tri = (s: string) => { const r = new Set<string>(); for (let i = 0; i + 3 <= s.length; i++) r.add(s.slice(i, i + 3)); return r; };
  const a = tri(cle.slice(cle.indexOf(':') + 1));
  const type = cle.slice(0, cle.indexOf(':'));
  const notes: [number, string][] = [];
  for (const c of candidats) {
    if (c === cle || c.slice(0, c.indexOf(':')) !== type) continue;
    const b = tri(c.slice(c.indexOf(':') + 1));
    let commun = 0; for (const x of a) if (b.has(x)) commun++;
    if (commun > 0) notes.push([commun / Math.max(a.size, b.size, 1), c]);
  }
  return notes.sort((x, y) => y[0] - x[0] || x[1].localeCompare(y[1])).slice(0, n).filter(([s]) => s >= 0.4).map(([, c]) => c);
}

export function verifierT1(r: Registre, scan: ResultatScan, ctx: ContexteT1): { problemes: string[]; avertissements: string[] } {
  const problemes: string[] = []; const avertissements: string[] = [];
  const couvertes = new Set<string>();
  for (const cles of Object.values(r.surfaces)) for (const c of cles) couvertes.add(c);
  for (const e of r.interne) couvertes.add(e.cle);
  for (const e of r.ecritures) couvertes.add(e.cle);
  for (const c of ctx.clesOuvreurs) couvertes.add(c);
  for (const c of ctx.ancresParcours) couvertes.add(c);

  // Un id neuf par fichier (les clés d'un même écran vont ensemble dans une même capacité), compté par côté : B139+ et S106+ ne se mélangent pas.
  const idParFichier = new Map<string, string>();
  const dejaSuggere: Record<Cote, number> = { bureau: 0, salarie: 0 };
  const idSuggere = (fichier: string): { cote: Cote; id: string } => {
    const cote = cotePresume(fichier, r.surfaces);
    let id = idParFichier.get(fichier);
    if (!id) { id = prochainId(r.capacites, cote, dejaSuggere[cote]++); idParFichier.set(fichier, id); }
    return { cote, id };
  };

  const exceptionsUtilisees = new Set<string>();
  for (const [cle, lieux] of grouperParCle(scan.occurrences)) {
    if (estNomCalcule(cle)) {
      for (const o of lieux) {
        const ex = ctx.nomsCalcules.find((n) => n.cle === cle && n.fichier === o.fichier);
        if (ex) { exceptionsUtilisees.add(`${ex.cle}@${ex.fichier}`); continue; }
        problemes.push(`${cle}  ${o.fichier}:${o.ligne}  → le scanner ne peut pas lire le nom : une écriture dynamique DÉCLARE ses noms. Posez juste avant l'appel : ${declarationPour(cle)}`);
      }
      continue;
    }
    if (couvertes.has(cle)) continue;
    const o = lieux[0];
    const ou = `${o.fichier}:${o.ligne}${lieux.length > 1 ? ` (+${lieux.length - 1} autre${lieux.length > 2 ? 's' : ''})` : ''}`;
    const { cote, id } = idSuggere(o.fichier);
    const surf = `surfaces-${cote}.ts`;
    if (estCleDEcriture(cle)) {
      problemes.push(`${cle}  ${ou}  → rattachez-la à la capacité qui porte ce geste : dans ${surf}, ajoutez '${cle}', à sa ligne, ou créez ${id} (capacites-${cote}.ts : outil, humain + raison ≥ ${RAISON_MINIMUM} car., ou dette datée) et collez  ${id}: ['${cle}'],  — une écriture ne va jamais dans interne-*.ts ; sans capacité : ECRITURES_NON_ASSISTEES (revue explicite, plafonnée par dettes.json)`);
    } else {
      problemes.push(`${cle}  ${ou}  → soit une capacité : dans ${surf}, ajoutez '${cle}' (ou créez ${id} et collez  ${id}: ['${cle}'],), soit interne-${cote}.ts avec une raison ≥ ${RAISON_MINIMUM} car. :  { cle: '${cle}', raison: '…' },`);
    }
  }
  for (const ex of ctx.nomsCalcules) {
    if (!exceptionsUtilisees.has(`${ex.cle}@${ex.fichier}`)) {
      problemes.push(`exception périmée  ${ex.cle} dans ${ex.fichier}  → le nom n'est plus calculé (déclaration « ${ex.declaration} » posée ?) : retirez cette entrée de NOMS_CALCULES_ACCEPTES et rattachez les nouvelles clés à leur capacité`);
    }
  }
  for (const e of r.interne) {
    if (estCleDEcriture(e.cle)) problemes.push(`${e.cle}  interne.ts  → une écriture ne va JAMAIS dans interne.ts : rattachez-la à une capacité (surfaces-*.ts) ou mettez-la dans ECRITURES_NON_ASSISTEES (revue explicite, plafonnée par dettes.json)`);
  }

  // nav: / guide: (importés du code, §2.3). Les guides échouent ; les liens de navigation avertissent jusqu'à 3b (vague 5).
  const cleCouverte = (cle: string) => couvertes.has(cle);
  const navSansOuvreur = ctx.clesNav.filter((c) => !cleCouverte(c));
  if (ctx.navBloquant) problemes.push(...navSansOuvreur.map((c) => `${c}  → lien de navigation sans ouvreur : depuis 3b chaque lien a son ouvreur (ouvreurs[*].alias) ou sa clé dans SURFACES`));
  else if (navSansOuvreur.length) avertissements.push(`${navSansOuvreur.length} liens de navigation sans ouvreur (les ouvreurs de la livraison 3b les rattachent ; échec à partir de 3b) : ${navSansOuvreur.join(', ')}`);
  const connus = new Set(ctx.guidesSansCapaciteConnus.map((g) => `${g.cote}:${g.id}`));
  const dansGuides = (cote: Cote) => new Set(r.capacites.filter((c) => c.cote === cote).flatMap((c) => c.guides ?? []));
  const gb = dansGuides('bureau'); const gs = dansGuides('salarie');
  const vusSansCapacite = new Set<string>();
  for (const g of ctx.guidesDuCode) {
    const cle = `guide:${g.cote}:${g.id}`;
    if (cleCouverte(cle) || (g.cote === 'bureau' ? gb : gs).has(g.id)) continue;
    vusSansCapacite.add(`${g.cote}:${g.id}`);
    if (connus.has(`${g.cote}:${g.id}`)) {
      avertissements.push(`${cle}  → fiche d'aide sans capacité (exception de départ) : ${ctx.guidesSansCapaciteConnus.find((x) => x.cote === g.cote && x.id === g.id)!.correction}`);
    } else {
      problemes.push(`${cle}  → fiche d'aide qu'aucune capacité ne nomme : ajoutez  guides: ['${g.id}']  à la capacité ${g.cote === 'bureau' ? 'B' : 'S'}… qui porte ce geste (capacites-${g.cote}.ts)`);
    }
  }
  for (const k of connus) {
    if (!vusSansCapacite.has(k)) problemes.push(`exception périmée  guide:${k}  → la fiche a maintenant sa capacité : retirez-la de GUIDES_SANS_CAPACITE_CONNUS`);
  }
  return { problemes, avertissements };
}

/** Où le registre déclare une clé (fichier:ligne dans surfaces-*.ts / interne-*.ts), pour dire QUOI corriger. */
function ouEstDeclaree(cle: string, textes: Record<string, string>): string | null {
  for (const [f, t] of Object.entries(textes)) {
    if (!/\/(surfaces|interne)-[a-z]+\.ts$/.test(f)) continue;
    const i = t.indexOf(`'${cle}'`) >= 0 ? t.indexOf(`'${cle}'`) : t.indexOf(`"${cle}"`);
    if (i >= 0) return `${f.replace('supabase/functions/_shared/registre/', '')}:${ligneDe(t, i)}`;
  }
  return null;
}

export function verifierT2(r: Registre, scan: ResultatScan, ctx: ContexteT1, textesRegistre: Record<string, string> = {}): { problemes: string[] } {
  const existantes = new Set<string>([...scan.occurrences.map((o) => o.cle), ...ctx.clesNav, ...ctx.guidesDuCode.map((g) => `guide:${g.cote}:${g.id}`)]);
  const declarees: { cle: string; par: string }[] = [];
  for (const [id, cles] of Object.entries(r.surfaces)) for (const cle of cles) declarees.push({ cle, par: id });
  for (const e of r.interne) declarees.push({ cle: e.cle, par: 'interne' });
  for (const e of r.ecritures) declarees.push({ cle: e.cle, par: 'écritures non assistées' });
  for (const cle of ctx.clesOuvreurs) declarees.push({ cle, par: 'ouvreur' });
  const problemes: string[] = [];
  for (const d of declarees) {
    if (existantes.has(d.cle)) continue;
    const pres = ressemblants(d.cle, existantes).filter((c) => !declarees.some((x) => x.cle === c));
    const ou = ouEstDeclaree(d.cle, textesRegistre);
    problemes.push(`${d.cle}  déclarée par ${d.par}${ou ? ` (${ou})` : ''}  → n'existe plus dans le code : ${pres.length ? `renommée en ${pres.map((p) => `« ${p} »`).join(' ou ')} ? Mettez la clé à jour, ` : ''}ou retirez-la${d.par === 'interne' ? '' : ' (et la capacité reste couverte par une autre clé, ou devient une dette datée)'}`);
  }
  // Une fiche d'aide qu'une capacité nomme et qui n'existe plus.
  const ids = (l: readonly { id: string }[]) => new Set(l.map((x) => x.id));
  const gb = ids(GUIDE); const gs = ids(WORKER_GUIDE);
  for (const c of r.capacites) for (const g of c.guides ?? []) {
    if (!(c.cote === 'bureau' ? gb : gs).has(g)) problemes.push(`${c.id}.guides « ${g} »  → cette fiche n'existe plus dans ${c.cote === 'bureau' ? 'GUIDE (assistant-actions-core.ts)' : 'WORKER_GUIDE (worker-assistant-core.ts)'} : mettez l'id à jour dans capacites-${c.cote}.ts`);
  }
  return { problemes };
}

// ════════════════════════════════════════════════════════════════════════════
// T3 forme · dette échue
// ════════════════════════════════════════════════════════════════════════════

interface Cahier { id: string; libelle: string; genre: string; niveau: number }
interface ContexteT3 {
  snapshotIds: readonly string[]; cahiers: Record<Cote, readonly Cahier[]> | null; horizon: string;
  /** Capacités muettes tolérées (exceptions de départ, dites) : avertissent, et échouent dès qu'elles n'ont plus lieu d'être. */
  muettesConnues?: readonly { id: string; correction: string }[];
}

export function verifierT3(r: Registre, ctx: ContexteT3): { problemes: string[]; avertissements: string[] } {
  const p: string[] = []; const avertissements: string[] = [];
  const toutesLesOutils = (cote: Cote) => new Set(r.outils.filter((o) => o.cote === cote).map((o) => o.id));
  const outilsParCote = { bureau: toutesLesOutils('bureau'), salarie: toutesLesOutils('salarie') };

  // — ids : forme, doublon, disparu, nouveau consécutif —
  const vus = new Set<string>();
  for (const c of r.capacites) {
    if (!/^[BS][1-9]\d*$/.test(c.id)) p.push(`${c.id}  → forme d'id : B<n> (bureau) ou S<n> (salarié)`);
    else if ((c.id[0] === 'B') !== (c.cote === 'bureau')) p.push(`${c.id}  → l'id commence par ${c.id[0]} mais cote vaut « ${c.cote} »`);
    if (vus.has(c.id)) p.push(`${c.id}  → id en double : un id n'est jamais réutilisé (nouveaux : ${prochainId(r.capacites, c.cote)})`);
    vus.add(c.id);
  }
  const actuels = new Set(r.capacites.map((c) => c.id));
  for (const id of ctx.snapshotIds) {
    if (!actuels.has(id)) p.push(`${id}  → id disparu : il figure dans ids.snapshot.json (publié) et ne peut ni être supprimé ni renuméroté. Remettez la capacité, quitte à la passer en humain + raison ou en dette`);
  }
  const nouveaux = (cote: Cote) => r.capacites.filter((c) => c.cote === cote && !ctx.snapshotIds.includes(c.id)).map((c) => Number(c.id.slice(1))).sort((a, b) => a - b);
  for (const cote of ['bureau', 'salarie'] as const) {
    const du = ctx.snapshotIds.filter((i) => i.startsWith(cote === 'bureau' ? 'B' : 'S')).map((i) => Number(i.slice(1)));
    const max = Math.max(0, ...du);
    const n = nouveaux(cote);
    n.forEach((v, i) => { if (v !== max + 1 + i) p.push(`${cote === 'bureau' ? 'B' : 'S'}${v}  → id neuf hors suite : après ${cote === 'bureau' ? 'B' : 'S'}${max} le suivant est ${cote === 'bureau' ? 'B' : 'S'}${max + 1 + i} (pas de trou, pas de réemploi)`); });
  }
  const aAjouter = r.capacites.filter((c) => !ctx.snapshotIds.includes(c.id)).map((c) => c.id);
  if (aAjouter.length) avertissements.push(`ids neufs absents de ids.snapshot.json : ${aAjouter.join(', ')}  → ${REGENERER('ids')}  les y inscrit ; sans cela leur suppression future passerait inaperçue`);

  // — chaque capacité dit ce qu'elle est —
  const muettes = new Map((ctx.muettesConnues ?? []).map((m) => [m.id, m.correction]));
  const vuesMuettes = new Set<string>();
  for (const c of r.capacites) {
    // §2.3 : « sans outil ni ouvreurs ni humain ni dette ». Une fiche d'aide (`guides`) ou un écart daté (`ecart`) disent aussi ce que la capacité est aujourd'hui.
    if (!c.outil && !(c.ouvreurs ?? []).length && !c.humain && !c.dette && !c.ecart && !(c.guides ?? []).length) {
      vuesMuettes.add(c.id);
      if (muettes.has(c.id)) avertissements.push(`${c.id}  → capacité muette (exception de départ) : ${muettes.get(c.id)}`);
      else p.push(`${c.id}  → ne dit rien : donnez-lui un outil, un ouvreur, humain + raison ≥ ${RAISON_MINIMUM} car., une fiche d'aide (guides) ou une dette datée { livraison, avant, note } (capacites-${c.cote}.ts)`);
    }
    if (c.outil && !outilsParCote[c.cote].has(c.outil)) p.push(`${c.id}.outil « ${c.outil} »  → aucun outil de ce nom côté ${c.cote} (outils-${c.cote}.ts) : faute de frappe ou outil renommé`);
    if (c.humain) {
      if (!CATEGORIES_HUMAIN.includes(c.humain.categorie)) p.push(`${c.id}.humain.categorie « ${c.humain.categorie} »  → hors de la liste fermée : ${CATEGORIES_HUMAIN.join(' · ')}`);
      const n = (c.humain.raison ?? '').trim().length;
      if (n < RAISON_MINIMUM) p.push(`${c.id}.humain.raison (${n} car.)  → au moins ${RAISON_MINIMUM} caractères : dites POURQUOI l'assistant ne fait pas ce clic`);
    }
    for (const [champ, e] of [['dette', c.dette], ['ecart', c.ecart]] as const) {
      if (!e) continue;
      if (!ORDRE_LIVRAISONS.includes(e.livraison)) p.push(`${c.id}.${champ}.livraison « ${e.livraison} »  → livraison inconnue (${ORDRE_LIVRAISONS.join(' · ')})`);
      if (!(e.note ?? '').trim()) p.push(`${c.id}.${champ}.note  → vide : dites ce qui manque`);
    }
    if (c.dette) {
      if (!dateValide(c.dette.avant)) p.push(`${c.id}.dette.avant « ${c.dette.avant} »  → attendu AAAA-MM-JJ, une date qui existe`);
      else if (c.dette.avant > ctx.horizon) p.push(`${c.id}.dette.avant ${c.dette.avant}  → après l'horizon ${ctx.horizon} (HORIZON_DETTES) : une dette qui irait plus loin est un renoncement, donc une capacité humain + raison`);
    }
  }

  for (const id of muettes.keys()) if (!vuesMuettes.has(id)) p.push(`exception périmée  ${id}  → la capacité dit maintenant ce qu'elle est : retirez-la de CAPACITES_MUETTES_CONNUES`);

  // — SURFACES, interne, écritures non assistées —
  for (const [id, cles] of Object.entries(r.surfaces)) {
    if (!actuels.has(id)) p.push(`SURFACES.${id}  → capacité inconnue : l'id n'existe ni dans capacites-bureau.ts ni dans capacites-salarie.ts`);
    for (const cle of cles) if (!PREFIXES_VALIDES.test(cle)) p.push(`SURFACES.${id} « ${cle} »  → clé mal formée : préfixe attendu parmi fenetre: dialogue: rpc: fn: table:<t>:<op> ecriture: ancre: ancre-dynamique: nav: guide: route:`);
  }
  const classees = new Set<string>();
  for (const [liste, entrees] of [['interne', r.interne], ['ecritures_non_assistees', r.ecritures]] as const) {
    for (const e of entrees) {
      const n = (e.raison ?? '').trim().length;
      if (n < RAISON_MINIMUM) p.push(`${liste} « ${e.cle} » (${n} car.)  → raison d'au moins ${RAISON_MINIMUM} caractères : dites POURQUOI ce n'est pas une capacité`);
      if (!PREFIXES_VALIDES.test(e.cle)) p.push(`${liste} « ${e.cle} »  → clé mal formée`);
      if (classees.has(e.cle)) p.push(`${liste} « ${e.cle} »  → classée deux fois (interne et écritures non assistées, ou deux fois la même)`);
      classees.add(e.cle);
    }
  }
  const dansSurfaces = new Set(Object.values(r.surfaces).flat());
  for (const e of classees) if (dansSurfaces.has(e)) p.push(`${e}  → à la fois dans une capacité (SURFACES) et classée interne : une clé n'est classée qu'à un seul endroit`);

  // — le libellé du cahier, mot pour mot (genre et niveau aussi : l'import les a repris tels quels) —
  if (ctx.cahiers) {
    for (const cote of ['bureau', 'salarie'] as const) {
      for (const j of ctx.cahiers[cote]) {
        const c = r.capacites.find((x) => x.id === j.id);
        if (!c) continue; // déjà signalé comme disparu
        if (c.libelle !== j.libelle) p.push(`${j.id}.libelle  → différent du cahier (docs/ia-etape3/capacites-${cote}.json) : « ${j.libelle} » — le libellé du cahier est repris mot pour mot`);
        if (c.genre !== j.genre) p.push(`${j.id}.genre « ${c.genre} »  → le cahier dit « ${j.genre} »`);
        if (c.niveau !== j.niveau) p.push(`${j.id}.niveau ${c.niveau}  → le cahier dit ${j.niveau}`);
      }
    }
  } else avertissements.push('docs/ia-etape3/capacites-*.json introuvables : libellés du cahier non vérifiés');
  return { problemes: p, avertissements };
}

/** Les dettes dont l'échéance est PASSÉE à `date` (strictement avant). `date` est passée en paramètre : jamais d'horloge ici. */
export function dettesEchues(capacites: readonly Capacite[], date: string): string[] {
  return capacites.filter((c) => c.dette && dateValide(c.dette.avant) && c.dette.avant < date)
    .map((c) => `${c.id}  dette ${c.dette!.livraison} échue le ${c.dette!.avant}  (« ${c.libelle} »)`);
}

// ════════════════════════════════════════════════════════════════════════════
// T4 niveaux
// ════════════════════════════════════════════════════════════════════════════

/**
 * `CHAMPS_CARTE` (§1.2) en NOMS DE PARAMÈTRES : la valeur force la carte, même dans un outil de niveau 2. Majorations, route payée, heures
 * hebdomadaires, panier, caisse de congés, relance automatique (et son heure), alertes de budget, endroit au pointage, planning des
 * collègues, et toute adresse e-mail ou numéro de téléphone. Un motif et pas une liste : un paramètre `email_comptable` ou `telephone_client`
 * ne doit pas échapper à la règle parce qu'on a oublié de le nommer.
 */
export const CHAMPS_CARTE = /^(majoration(_\w+)?|trajet_paye|heures_hebdo|panier(_\w+)?|caisse(_\w+)?|relance_auto|heure_relance|alertes?_budget|endroit(_\w+)?|localisation|planning_collegues|\w*e?mail\w*|\w*telephone\w*|tel|phone)$/;

export function verifierT4(r: Registre): string[] {
  const p: string[] = [];
  for (const o of r.outils) {
    if (o.kind === 'commande') continue;                       // exempt (§2.3) : ne s'exécute pas via registre-exec
    if (o.kind !== 'ecriture') {
      if ((o.niveau as number) === 2) p.push(`${o.id}  → un outil ${o.kind} est de niveau 1 (ou 3 pour une ouverture), jamais 2`);
      continue;
    }
    const params = paramsDe(o);
    const cartes = params.filter((n) => CHAMPS_CARTE.test(n));
    if (o.niveau === 2 && o.annuler === 'non') p.push(`${o.id}  → niveau 2 sans « Annuler » : pas d'« Annuler » exact ⇒ jamais niveau 2 ⇒ carte (mode: 'carte', niveau: 3) — outils-${o.cote}.ts`);
    if (o.niveau === 2 && cartes.length) {
      const listes = o.champsCarte ?? [];
      if (o.mode !== 'conditionnel') p.push(`${o.id}  → niveau 2 avec ${cartes.join(', ')} (CHAMPS_CARTE) : doit être mode: 'conditionnel' avec champsCarte: [${cartes.map((c) => `'${c}'`).join(', ')}] — la valeur force la carte`);
      else for (const c of cartes) if (!listes.includes(c)) p.push(`${o.id}  → champsCarte ne nomme pas « ${c} » (paramètre de CHAMPS_CARTE) : ajoutez-le`);
    }
    if (o.notifie && !(o.niveau === 3 || o.mode === 'conditionnel')) p.push(`${o.id}  → son résultat prévient un tiers (notifie) : niveau 3 (carte) ou conditionnel, jamais fait sans carte`);
    if (o.retrait && o.mode !== 'carte') p.push(`${o.id}  → un retrait passe toujours par la carte`);
    if ((o.mode === 'carte') !== (o.niveau === 3)) p.push(`${o.id}  → niveau ${o.niveau} et mode « ${o.mode} » ne s'accordent pas (niveau 3 ⇔ carte ; niveau 2 ⇔ direct ou conditionnel)`);
    for (const c of o.champsCarte ?? []) if (!params.includes(c)) p.push(`${o.id}  → champsCarte « ${c} » n'est pas un paramètre de l'outil`);
  }
  // Une capacité « réservée à l'humain » ne pointe jamais vers un outil qui écrit.
  for (const c of r.capacites) {
    if (!c.humain || !c.outil) continue;
    const o = r.outils.find((x) => x.cote === c.cote && x.id === c.outil);
    if (o && o.kind === 'ecriture') p.push(`${c.id}  → capacité humain (${c.humain.categorie}) mais son outil « ${o.id} » écrit : aucun outil n'écrit pour un geste réservé ; mettez un outil de lecture ou d'ouverture, ou retirez humain`);
  }
  return p;
}

// ════════════════════════════════════════════════════════════════════════════
// T5 cohérence avec le code d'aujourd'hui
// ════════════════════════════════════════════════════════════════════════════

interface CodeDuCote {
  fonctions: readonly { name: string; description: string; parameters: unknown }[];
  retraits: readonly string[];
  joints: readonly string[];
  domaines: Record<string, { tools: readonly string[] }>;
  liensNav: readonly string[];
  /** Les types d'action exportés par le code (bureau : ACTION_TYPES ; salarié : pas de liste exportée). */
  typesAction?: readonly string[];
  mode: (id: string) => 'direct' | 'carte' | 'conditionnel';
}

/** actionMode / workerActionMode essayés sur les champs qu'ils lisent : un résultat = fixe, deux = conditionnel (même sonde que registre-outils.test.ts). */
function modeObserve(cote: Cote, id: string): 'direct' | 'carte' | 'conditionnel' {
  const sondes: unknown[] = cote === 'bureau'
    ? [{ type: id }, { type: id, budget_heures: '10' }, { type: id, montant_devis: '100' }]
    : [{ type: id, choix: [] }, { type: id, entry_id: 'a', choix: [{ id: 'a', envoyee: true }] }, { type: id, entry_id: 'a', choix: [{ id: 'a', envoyee: false }] }];
  const vus = sondes.map((s) => (cote === 'bureau' ? actionMode(s as never) : workerActionMode(s as never)));
  const direct = vus.indexOf('direct') >= 0; const carte = vus.indexOf('confirm') >= 0;
  return direct && carte ? 'conditionnel' : direct ? 'direct' : 'carte';
}

const CODE: Record<Cote, CodeDuCote> = {
  bureau: {
    fonctions: ASSISTANT_FUNCTIONS as unknown as CodeDuCote['fonctions'], retraits: REMOVAL_TYPES, joints: ATTACHMENT_ACTIONS, domaines: OFFICE_DOMAINS,
    liensNav: [...Object.keys(NAV_ACTIONS), 'salarie'], typesAction: ACTION_TYPES, mode: (id) => modeObserve('bureau', id),
  },
  salarie: {
    fonctions: WORKER_FUNCTIONS as unknown as CodeDuCote['fonctions'], retraits: WORKER_REMOVAL_TYPES, joints: WORKER_ATTACHMENT_ACTIONS, domaines: WORKER_DOMAINS,
    liensNav: Object.keys(WORKER_NAV), mode: (id) => modeObserve('salarie', id),
  },
};
/** Seul type de retrait du salarié sans outil : désactivé au lot 12 (WC:781), le modèle ne l'appelle pas. */
const RETRAIT_SANS_OUTIL: Record<Cote, readonly string[]> = { bureau: [], salarie: ['annuler_pointage'] };

export function verifierT5(cote: Cote, servis: readonly Outil[], code: CodeDuCote): string[] {
  const p: string[] = [];
  const ids = servis.map((o) => o.id);
  const duCode = code.fonctions.map((f) => f.name);
  for (const i of ids) if (!duCode.includes(i)) p.push(`${cote}/${i}  → au registre mais pas dans ${cote === 'bureau' ? 'ASSISTANT_FUNCTIONS' : 'WORKER_FUNCTIONS'} : outil renommé ou retiré du code ? (outils-${cote}.ts)`);
  for (const i of duCode) if (!ids.includes(i)) p.push(`${cote}/${i}  → dans ${cote === 'bureau' ? 'ASSISTANT_FUNCTIONS' : 'WORKER_FUNCTIONS'} mais pas au registre : un outil ajouté au code doit avoir son entrée (outils-${cote}.ts, livraison '3a' ou suivante)`);
  const ecrits = servis.filter((o) => o.kind === 'ecriture').map((o) => o.id);
  if (code.typesAction) {
    for (const t of code.typesAction) if (!ecrits.includes(t)) p.push(`${cote}/${t}  → dans ACTION_TYPES mais pas une écriture du registre`);
    for (const i of ecrits) if (!code.typesAction.includes(i as never)) p.push(`${cote}/${i}  → écriture du registre absente d'ACTION_TYPES`);
  }
  for (const t of code.retraits) if (!ids.includes(t) && !RETRAIT_SANS_OUTIL[cote].includes(t)) p.push(`${cote}/${t}  → dans la liste des retraits du code mais sans outil au registre`);
  for (const t of code.joints) if (!ids.includes(t)) p.push(`${cote}/${t}  → dans la liste des pièces jointes du code mais sans outil au registre`);
  for (const o of servis) {
    if (o.kind === 'ecriture') {
      if (!!o.retrait !== code.retraits.includes(o.id)) p.push(`${cote}/${o.id}  → retrait: ${!!o.retrait} au registre, ${code.retraits.includes(o.id)} dans la liste des retraits du code`);
      const vu = code.mode(o.id);
      if (o.mode !== vu) p.push(`${cote}/${o.id}  → mode « ${o.mode} » au registre, « ${vu} » dans actionMode du code`);
    }
    if (!!o.pieceJointe !== code.joints.includes(o.id)) p.push(`${cote}/${o.id}  → pieceJointe: ${!!o.pieceJointe} au registre, ${code.joints.includes(o.id)} dans la liste des pièces jointes du code`);
    const doms = Object.keys(code.domaines).filter((k) => code.domaines[k].tools.includes(o.id));
    if (JSON.stringify(o.domaines) !== JSON.stringify(doms)) p.push(`${cote}/${o.id}  → domaines ${JSON.stringify(o.domaines)} au registre, ${JSON.stringify(doms)} dans tool-domains.ts`);
  }
  const repondre = servis.find((o) => o.id === 'repondre');
  // Le bureau propose un tableau `liens` (plusieurs boutons) ; le salarié un seul `lien` : les deux formes sont lues.
  const props = ((repondre?.parametres as { properties?: Record<string, { enum?: string[]; items?: { enum?: string[] } }> } | undefined)?.properties ?? {});
  const enumLiens = (props.liens?.items?.enum ?? props.lien?.enum ?? []) as string[];
  const attendu = [...code.liensNav].sort(); const lu = [...enumLiens].sort();
  if (JSON.stringify(attendu) !== JSON.stringify(lu)) p.push(`${cote}/repondre  → les liens proposés ${JSON.stringify(lu)} diffèrent de ${cote === 'bureau' ? 'NAV_ACTIONS (+ « salarie »)' : 'WORKER_NAV'} ${JSON.stringify(attendu)}`);
  return p;
}


/**
 * Les `case '…':` du commutateur `switch (type)` / `switch (d.type)` d'une fonction du code, lus sur le texte masqué (un `case` écrit dans un
 * commentaire ou une chaîne n'est pas une étiquette). Seul le niveau 1 du commutateur compte : un `switch` imbriqué ne ment pas sur les types.
 * `null` si la fonction ou son commutateur est introuvable (forme du code changée : T5 le dit au lieu de se taire).
 */
export function casesDeFonction(texte: string, signature: string): string[] | null {
  const m = masquer(texte); const nu = m.nu;
  const i = nu.indexOf(signature);
  if (i < 0) return null;
  let prof = 0; let j = nu.indexOf('(', i);
  for (; j < nu.length; j++) { if (nu[j] === '(') prof++; else if (nu[j] === ')') { prof--; if (!prof) break; } }
  const debut = nu.indexOf('{', j);
  if (debut < 0) return null;
  prof = 0; let fin = debut;
  for (; fin < nu.length; fin++) { if (nu[fin] === '{') prof++; else if (nu[fin] === '}') { prof--; if (!prof) break; } }
  const sw = /\bswitch\s*\(\s*(?:d\.)?type\s*\)\s*\{/.exec(nu.slice(debut, fin + 1));
  if (!sw) return null;
  const ouvre = debut + sw.index + sw[0].length - 1;
  const etiquettes: string[] = [];
  prof = 0;
  for (let e = ouvre; e < nu.length; e++) {
    const c = nu[e];
    if (c === '{') prof++;
    else if (c === '}') { prof--; if (!prof) break; }
    else if (prof === 1 && c === 'c' && !/[\w$.]/.test(nu[e - 1] ?? ' ')) {
      const mot = /^case\s+/.exec(nu.slice(e, e + 12));
      const ch = mot ? m.chaines.get(e + mot[0].length) : undefined;
      if (ch && !ch.interpolee) etiquettes.push(ch.valeur);
    }
  }
  return etiquettes;
}

/** Types d'action que le code du salarié traite encore alors que le modèle ne les appelle plus (lot 12, WC:781 : QR de la tablette obligatoire). */
const CASES_SALARIE_SANS_OUTIL = ['commencer_pointage', 'annuler_pointage'];
/** `declarer_heures` n'est pas un type de `prepareWorkerAction` : ses lignes passent par le brouillon multi-lignes (worker-multi.ts, makeWorkerSaver). */
const SALARIE_SANS_CASE_DE_PREPARATION = ['declarer_heures'];

/**
 * T5 (3a-2) : ce qui reste écrit À LA MAIN dans AC / WC — `prepare`, `checkAction`, `summarize`, `actionMode` (salarié : `prepareWorkerAction`,
 * `checkWorkerAction`, `workerActionMode`) — traite exactement les outils d'écriture du registre. Une écriture ajoutée au registre sans son
 * `case` serait préparée par rien (« action inconnue ») ; un `case` sans outil est du code mort que le modèle ne peut pas déclencher.
 * `actionMode` n'énumère que les EXCEPTIONS à son défaut (bureau : défaut « confirmer » ; salarié : défaut « direct », retraits déjà traités avant).
 */
export function verifierT5Cases(cote: Cote, servis: readonly Outil[], sources: { texte: string; fonctions: Record<string, string> }): string[] {
  const p: string[] = [];
  const ecritures = servis.filter((o) => o.kind === 'ecriture') as Extract<Outil, { kind: 'ecriture' }>[];
  const ids = ecritures.map((o) => o.id);
  const nomDeFichier = cote === 'bureau' ? 'assistant-actions-core.ts' : 'worker-assistant-core.ts';
  const lire = (nom: string) => {
    const c = casesDeFonction(sources.texte, sources.fonctions[nom]);
    if (!c) p.push(`${nomDeFichier}  → ${nom}() ou son commutateur « switch (type) » est introuvable : T5 ne sait plus comparer ses types au registre (forme du code changée ?)`);
    return c;
  };
  const exact = (nom: string, attendus: readonly string[], pourquoi: string) => {
    const c = lire(nom); if (!c) return;
    for (const a of attendus) if (!c.includes(a)) p.push(`${cote}/${a}  → écriture du registre sans « case '${a}' » dans ${nom}() : ${pourquoi}`);
    for (const e of c) if (!attendus.includes(e)) p.push(`${cote}/${e}  → « case '${e}' » dans ${nom}() mais ce n'est pas une écriture du registre (outils-${cote}.ts) : type mort, ou outil oublié au registre`);
  };
  if (cote === 'bureau') {
    for (const f of ['prepare', 'checkAction', 'summarize']) exact(f, ids, 'le modèle l\'appellerait et rien ne le préparerait');
    exact('actionMode', ecritures.filter((o) => o.mode !== 'carte').map((o) => o.id), 'seuls les outils « direct » ou « conditionnel » sont des exceptions au défaut « confirmer »');
  } else {
    exact('prepareWorkerAction', [...ids.filter((i) => !SALARIE_SANS_CASE_DE_PREPARATION.includes(i)), ...CASES_SALARIE_SANS_OUTIL], 'le modèle l\'appellerait et rien ne le préparerait');
    exact('checkWorkerAction', [...ids.filter((i) => !SALARIE_SANS_CASE_DE_PREPARATION.includes(i)), ...CASES_SALARIE_SANS_OUTIL], 'rien ne le contrôlerait avant la carte');
    const retraits = ecritures.filter((o) => o.retrait).map((o) => o.id);
    exact('workerActionMode', ecritures.filter((o) => o.mode !== 'direct' && retraits.indexOf(o.id) < 0).map((o) => o.id), 'seuls les outils « à confirmer » hors retraits (déjà confirmés avant le commutateur) sont des exceptions au défaut « direct »');
  }
  return p;
}

const FONCTIONS_A_LA_MAIN: Record<Cote, { fichier: string; fonctions: Record<string, string> }> = {
  bureau: {
    fichier: 'supabase/functions/_shared/assistant-actions-core.ts',
    fonctions: { prepare: 'export function prepare(', checkAction: 'export function checkAction(', summarize: 'export function summarize(', actionMode: 'export function actionMode(' },
  },
  salarie: {
    fichier: 'supabase/functions/_shared/worker-assistant-core.ts',
    fonctions: { prepareWorkerAction: 'export function prepareWorkerAction(', checkWorkerAction: 'export function checkWorkerAction(', workerActionMode: 'export function workerActionMode(' },
  },
};

// ════════════════════════════════════════════════════════════════════════════
// T6 liaison (exécuteurs, lectures, ouvreurs)
// ════════════════════════════════════════════════════════════════════════════

/** Où vit l'exécuteur de chaque côté AUJOURD'HUI (lib/registre-exec-<côté>.ts n'existe pas encore, il arrive avec 3d). */
const FICHIERS_EXECUTEUR: Record<Cote, readonly string[]> = {
  bureau: ['lib/assistant-actions.ts'],
  salarie: ['lib/worker-actions.ts', 'lib/worker-assistant.ts'],
};

/**
 * Les étiquettes d'un exécuteur : `case 'x':`, clés d'objet `x:` / `'x':`, méthodes `x(`. Lues sur le texte masqué : un `case 'x'` écrit dans
 * un commentaire ou dans une chaîne n'est pas un exécuteur (c'est le piège de l'expression régulière nue). Un peu large exprès : ce test
 * cherche l'ABSENCE d'un exécuteur, pas son bon fonctionnement.
 */
export function etiquettesExecuteur(texte: string): Set<string> {
  const m = masquer(texte); const cles = new Set<string>();
  for (const c of m.nu.matchAll(/\bcase\s+(?=['"`])/g)) {
    const ch = m.chaines.get(c.index! + c[0].length);
    if (ch && !ch.interpolee) cles.add(ch.valeur);
  }
  for (const ch of m.chaines.values()) if (!ch.interpolee && /^\s*:/.test(m.nu.slice(ch.fin + 1, ch.fin + 8))) cles.add(ch.valeur);
  for (const w of m.nu.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*[:(]/g)) cles.add(w[1]);
  for (const w of m.nu.matchAll(/\b(?:function|const|let)\s+([A-Za-z_$][\w$]*)/g)) cles.add(w[1]);
  return cles;
}

/** Le nom d'exécuteur est-il un `case '…'`, une fonction ou une constante de l'un de ces textes ? */
export function executeurPresent(executeur: string, textes: readonly string[]): boolean {
  return textes.some((t) => etiquettesExecuteur(t).has(executeur));
}

/**
 * `lib/registre-exec-<côté>.ts` (livraison 3d) : une clé par outil d'écriture, et un `default` qui LÈVE (un outil sans exécuteur ne doit
 * jamais s'exécuter en silence). Contrôlé sur le texte, sans l'importer.
 */
export function verifierExecRegistre(chemin: string, texte: string, ecritures: readonly string[]): string[] {
  const p: string[] = [];
  const etiquettes = etiquettesExecuteur(texte);
  for (const id of ecritures) {
    if (!etiquettes.has(id)) p.push(`${chemin}  → pas de clé « ${id} » : tout outil d'écriture du registre a son exécuteur ici (case '${id}': …)`);
  }
  const dflt = /\bdefault\s*:\s*([\s\S]*?)(?:\n\s*\}|$)/.exec(masquer(texte).nu);
  if (!dflt) p.push(`${chemin}  → pas de « default » : un outil inconnu doit LEVER, pas se taire`);
  else if (!/\bthrow\b/.test(dflt[1])) p.push(`${chemin}  → le « default » ne lève pas : écrivez  default: throw new Error(\`outil sans exécuteur : \${nom}\`);`);
  return p;
}

/** Chaque id d'ouvreur livré est une clé LITTÉRALE d'un `registerOpeners({ … })` (pas une clé calculée, que le test ne verrait pas). */
export function verifierOuvreursEnregistres(textes: Record<string, string>, ids: readonly string[]): string[] {
  const cles = new Set<string>();
  for (const t of Object.values(textes)) {
    const code = masquer(t).code;
    for (const m of code.matchAll(/\bregisterOpeners\s*\(\s*(?:['"`]\w+['"`]\s*,\s*)?\{/g)) {
      const debut = m.index! + m[0].length; let prof = 1; let fin = debut;
      while (fin < code.length && prof > 0) { if (code[fin] === '{') prof++; else if (code[fin] === '}') prof--; fin++; }
      for (const k of code.slice(debut, fin - 1).matchAll(/(?:^|[,{\s])(['"`])([\w.]+)\1\s*:/g)) cles.add(k[2]);
    }
  }
  return ids.filter((i) => !cles.has(i)).map((i) => `ouvreur « ${i} »  → pas de clé littérale dans registerOpeners({ '${i}': … }) : la page doit l'enregistrer, sinon l'assistant l'ouvre dans le vide`);
}

// ════════════════════════════════════════════════════════════════════════════
// T7 évaluation
// ════════════════════════════════════════════════════════════════════════════

/** Les outils qu'un cas attend, lus dans le texte de cases.ts (même lecture que tool-domains.test.ts : act('x'), fiche([…]), réponse…). */
export function outilsAttendus(src: string, id: string, cote: string): string[] {
  const OUTIL_DE_FICHE: Record<string, string> = { heures: 'declarer_heures', chantier: 'nouveau_chantier' };
  const at = src.indexOf(`id: '${id}'`);
  if (at < 0) return [];
  const next = src.indexOf("{ id: '", at + 5);
  let chunk = src.slice(at, next < 0 ? undefined : next);
  const nomme = /check: (\w+) \}/.exec(chunk);
  if (nomme) { const d = src.indexOf(`const ${nomme[1]}`); if (d >= 0) chunk = src.slice(d, src.indexOf('\n};', d) + 3); }
  const fiche = /fiche\(\[([^\]]*)\]/.exec(chunk);
  if (fiche) return Array.from(fiche[1].matchAll(/'(\w+)'/g)).map((m) => OUTIL_DE_FICHE[m[1]] ?? m[1]);
  const silence = /rienDeSilencieux\(\[([^\]]*)\]/.exec(chunk);
  if (silence) return ['declarer_heures', ...Array.from(silence[1].matchAll(/'(\w+)'/g)).map((m) => m[1])];
  if (/enTurc/.test(chunk)) return ['repondre'];
  const m = /check: act(?:AvecProblemes)?\('(\w+)'/.exec(chunk) ?? /o\.type === '(\w+)'/.exec(chunk);
  if (m) return [m[1]];
  if (/check: (answer|refus)\(/.test(chunk)) return ['repondre'];
  if (/check: draft\(/.test(chunk)) return ['declarer_heures'];
  if (/check: coll\(/.test(chunk)) return cote === 'salarie' ? ['planning_collegues'] : [];
  return [];
}

export function verifierT7(
  servis: readonly Outil[], cas: readonly { id: string; cote: Cote }[], src: string,
  mesures: { cas: readonly string[] | null; exigerMesures: boolean },
): { problemes: string[]; avertissements: string[] } {
  const p: string[] = []; const avertissements: string[] = [];
  const parOutil: Record<Cote, Map<string, string[]>> = { bureau: new Map(), salarie: new Map() };
  for (const c of cas) {
    const attendus = outilsAttendus(src, c.id, c.cote);
    if (!attendus.length) p.push(`cas ${c.id}  → outil attendu illisible dans cases.ts (le contrôle doit être act('x'), fiche([…]), answer(…)…)`);
    for (const t of attendus) {
      const m = parOutil[c.cote];
      m.set(t, [...(m.get(t) ?? []), c.id]);
      if (!servis.some((o) => o.cote === c.cote && o.id === t)) p.push(`cas ${c.id}  → attend l'outil « ${t} » qui n'est pas au registre ${c.cote} : faute de frappe, ou outil à ajouter à outils-${c.cote}.ts`);
    }
  }
  for (const o of servis) {
    if ((parOutil[o.cote].get(o.id) ?? []).length === 0) {
      p.push(`${o.cote}/${o.id}  → livré (livraison ${o.livraison} ≤ ${LIVRAISON_COURANTE}) mais aucun cas d'évaluation ne l'attend : ajoutez-en dans supabase/functions/assistant-eval/cases.ts, par ex.  { id: '…', cote: '${o.cote}', categorie: '…', phrase: '…', check: act('${o.id}', (d) => …) },`);
    }
  }
  for (const o of servis) for (const autre of o.proches ?? []) {
    if (o.id >= autre) continue; // chaque paire une fois
    const a = (parOutil[o.cote].get(o.id) ?? []).length; const b = (parOutil[o.cote].get(autre) ?? []).length;
    if (a < 1 || b < 1) p.push(`${o.cote}/${o.id} ↔ ${autre}  → outils proches : il faut au moins une phrase d'évaluation de chaque côté pour qu'on mesure qu'ils ne se confondent pas (${o.id} : ${a}, ${autre} : ${b})`);
  }
  // « Jamais exécuté » : à la livraison seulement (la mesure de référence est un travail de 3a, pas une condition de chaque PR).
  const mesures_ = mesures.cas ?? [];
  const jamais = cas.filter((c) => !mesures_.includes(c.id)).map((c) => c.id);
  if (jamais.length) {
    const ligne = `${jamais.length} cas jamais exécutés sur le vrai modèle (mesures.json ${mesures.cas === null ? 'illisible' : 'sans eux'}) : ${jamais.slice(0, 8).join(', ')}${jamais.length > 8 ? '…' : ''}  → lancez le banc (deux jours différents, §1.4) et rangez les scores`;
    (mesures.exigerMesures ? p : avertissements).push(ligne);
  }
  return { problemes: p, avertissements };
}

// ════════════════════════════════════════════════════════════════════════════
// T8 hygiène : le navigateur n'atteint jamais le registre lourd
// ════════════════════════════════════════════════════════════════════════════

interface Arete { vers: string; ligne: number }
const RACINE_REGISTRE = 'supabase/functions/_shared/registre/';
const DOSSIERS_NAVIGATEUR = /^(app|components|lib|hooks)\//;
/** Les seuls fichiers du registre que le navigateur a le droit d'atteindre : types (effacés), réglages, vocabulaires fermés, ouvreurs légers PAR CÔTÉ. */
const REGISTRE_AUTORISE = /^supabase\/functions\/_shared\/registre\/(types|config|vocab|ouvreurs-leger-(bureau|salarie))\.ts$/;
const estRegistreInterdit = (chemin: string) => chemin.startsWith(RACINE_REGISTRE) && !REGISTRE_AUTORISE.test(chemin);
const COTE_DU_MODULE = /(?:^|\/)(?:registre-exec|ouvreurs-leger|openers)-(bureau|salarie)\.tsx?$/;

function joindre(dossier: string, relatif: string): string {
  const parts = dossier ? dossier.split('/') : [];
  for (const s of relatif.split('/')) {
    if (s === '..') parts.pop(); else if (s !== '.' && s !== '') parts.push(s);
  }
  return parts.join('/');
}

/** Qui importe qui (valeurs seulement : `import type` et `export type` s'effacent à la compilation et ne pèsent rien dans un chunk). */
export function grapheImports(sources: Record<string, string>): Map<string, Arete[]> {
  const graphe = new Map<string, Arete[]>();
  const present = (p: string) => Object.prototype.hasOwnProperty.call(sources, p);
  const resoudre = (de: string, spec: string): string | null => {
    let base: string;
    if (spec.startsWith('@/')) base = spec.slice(2);
    else if (spec.startsWith('./') || spec.startsWith('../')) base = joindre(de.includes('/') ? de.slice(0, de.lastIndexOf('/')) : '', spec);
    else return null;
    for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) if (present(c)) return c;
    return null;
  };
  // Lus sur le texte masqué `nu` : un « import … from '…' » écrit dans un commentaire ou dans une chaîne n'est pas un import. Le nom du module,
  // lui, est relu dans la chaîne qui suit (le masque garde la table des chaînes).
  const RE_STATIQUE = /\b(import|export)\s+(type\s+)?(?:[\w$*{}\s,]+?\s+from\s*)?(?=['"])/g;
  const RE_DYNAMIQUE = /\bimport\s*\(\s*(?=['"`])/g;
  for (const [chemin, texte] of Object.entries(sources)) {
    if (!/\.tsx?$/.test(chemin)) continue;
    const m = masquer(texte);
    const aretes: Arete[] = [];
    for (const x of m.nu.matchAll(RE_STATIQUE)) {
      if (x[2]) continue;                                   // import type / export type
      const ch = m.chaines.get(x.index! + x[0].length);
      const vers = ch && !ch.interpolee ? resoudre(chemin, ch.valeur) : null;
      if (vers) aretes.push({ vers, ligne: ligneDe(texte, x.index!) });
    }
    for (const x of m.nu.matchAll(RE_DYNAMIQUE)) {
      const ch = m.chaines.get(x.index! + x[0].length);
      const vers = ch && !ch.interpolee ? resoudre(chemin, ch.valeur) : null;
      if (vers) aretes.push({ vers, ligne: ligneDe(texte, x.index!) });
    }
    graphe.set(chemin, aretes);
  }
  return graphe;
}

/** Ce que `racines` atteignent, avec le chemin le plus court (pour dire « par où »). */
export function atteints(graphe: Map<string, Arete[]>, racines: Iterable<string>): Map<string, { parent: string | null; ligne: number }> {
  const vus = new Map<string, { parent: string | null; ligne: number }>();
  const file: string[] = [];
  for (const r of racines) if (!vus.has(r)) { vus.set(r, { parent: null, ligne: 0 }); file.push(r); }
  while (file.length) {
    const f = file.shift()!;
    for (const a of graphe.get(f) ?? []) if (!vus.has(a.vers)) { vus.set(a.vers, { parent: f, ligne: a.ligne }); file.push(a.vers); }
  }
  return vus;
}
function cheminJusqua(vus: Map<string, { parent: string | null; ligne: number }>, cible: string): string {
  const etapes: string[] = [];
  for (let c: string | null = cible; c; c = vus.get(c)?.parent ?? null) etapes.unshift(c);
  return etapes.join(' → ');
}

export function verifierT8Imports(sources: Record<string, string>): string[] {
  const p: string[] = [];
  const graphe = grapheImports(sources);
  const racines = Object.keys(sources).filter((f) => DOSSIERS_NAVIGATEUR.test(f));
  const vus = atteints(graphe, racines);
  // 1. Le navigateur n'atteint ni capacites-*, ni outils-*, ni index.ts, ni surfaces / interne / ouvreurs lourds.
  for (const f of vus.keys()) {
    for (const a of graphe.get(f) ?? []) {
      if (!estRegistreInterdit(a.vers)) continue;
      p.push(`${f}:${a.ligne}  → importe ${a.vers.replace(RACINE_REGISTRE, 'registre/')}, que le navigateur ne doit jamais atteindre (tout le JavaScript d'un chunk est public). Chemin : ${cheminJusqua(vus, f)}. Le navigateur n'importe que registre/{types,config,vocab,ouvreurs-leger-<côté>}.ts : coupez cet import, ou passez par un module léger`);
    }
  }
  // 2. Par côté : /admin n'atteint rien du salarié et /poseur rien du bureau (exécuteurs et ouvreurs légers).
  for (const [page, interdit] of [['app/admin/', 'salarie'], ['app/poseur/', 'bureau']] as const) {
    const parPage = atteints(graphe, Object.keys(sources).filter((f) => f.startsWith(page)));
    for (const f of parPage.keys()) {
      const m = COTE_DU_MODULE.exec(f);
      if (m && m[1] === interdit) p.push(`${f}  → atteint depuis ${page} (${page === 'app/admin/' ? 'bureau' : 'salarié'}) alors qu'il est du côté ${interdit} : chemin ${cheminJusqua(parPage, f)}. Chaque page importe SON exécuteur et SES ouvreurs légers, jamais ceux de l'autre côté`);
    }
  }
  return p;
}

/** Les `.js` qu'une page de `out/` charge à l'ouverture (balises <script> et chemins de chunks cités dans le HTML). */
export function chunksDePage(html: string): string[] {
  return Array.from(new Set(Array.from(html.matchAll(/\/_next\/static\/[A-Za-z0-9_./~%-]*\.js/g)).map((m) => m[0]))).sort();
}

export interface Build { pages: Record<'admin' | 'poseur', { html: string; chunks: Record<string, string> }>; tous: Record<string, string> }
/** Noms d'outils d'un seul côté (ceux des deux côtés, comme `repondre`, sont partagés par construction). */
export function nomsExclusifs(outils: readonly Outil[], cote: Cote): string[] {
  const autre = new Set(outils.filter((o) => o.cote !== cote).map((o) => o.id));
  return outils.filter((o) => o.cote === cote && !autre.has(o.id)).map((o) => o.id);
}
export function verifierT8Build(build: Build, outils: readonly Outil[], idsOuvreurs: Record<Cote, readonly string[]> = { bureau: [], salarie: [] }): string[] {
  const p: string[] = [];
  const dans = (texte: string, nom: string) => new RegExp(`(?<![\\w.])${nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`).test(texte);
  for (const [page, cote] of [['poseur', 'bureau'], ['admin', 'salarie']] as const) {
    const interdits = [...nomsExclusifs(outils, cote), ...idsOuvreurs[cote]];
    for (const [fichier, texte] of Object.entries(build.pages[page].chunks)) {
      for (const nom of interdits) if (dans(texte, nom)) p.push(`out${fichier}  → le chunk de /${page} contient « ${nom} », ${idsOuvreurs[cote].includes(nom) ? `un id d'ouvreur du ${cote}` : `un nom d'outil du ${cote}`} : du code ${cote === 'bureau' ? 'du bureau' : 'du salarié'} a fuité dans l'autre page (voir T8 imports pour le chemin)`);
    }
  }
  for (const [fichier, texte] of Object.entries(build.tous)) {
    if (texte.includes('__openLink')) p.push(`out${fichier}  → contient window.__openLink, un crochet de TEST qui ne doit pas exister dans le build de production`);
  }
  return p;
}

async function lireBuild(): Promise<Build | null> {
  if (!(await existe('out/admin.html')) || !(await existe('out/poseur.html'))) return null;
  const lire = async (rel: string) => { try { return await lireTexte(rel); } catch { return ''; } };
  const page = async (nom: 'admin' | 'poseur') => {
    const html = await lire(`out/${nom}.html`);
    const chunks: Record<string, string> = {};
    for (const c of chunksDePage(html)) chunks[c] = await lire(`out${c}`);
    return { html, chunks };
  };
  const tous: Record<string, string> = {};
  const parcourir = async (rel: string) => {
    let entrees: Deno.DirEntry[];
    try { entrees = await Array.fromAsync(Deno.readDir(new URL(rel, RACINE_DEPOT))); } catch { return; }
    for (const e of entrees.sort((a, b) => a.name.localeCompare(b.name))) {
      const sous = `${rel}/${e.name}`;
      if (e.isDirectory) await parcourir(sous); else if (e.name.endsWith('.js')) tous[sous.replace(/^out/, '')] = await lire(sous);
    }
  };
  await parcourir('out/_next/static');
  return { pages: { admin: await page('admin'), poseur: await page('poseur') }, tous };
}

// ════════════════════════════════════════════════════════════════════════════
// T9 cliquet · T10 clics · T11 navigateur
// ════════════════════════════════════════════════════════════════════════════

export function compteursDettes(r: Registre): DettesMax {
  return {
    dette: r.capacites.filter((c) => c.dette).length,
    ecart: r.capacites.filter((c) => c.ecart).length,
    interne: r.interne.length,
    ecritures_non_assistees: r.ecritures.length,
  };
}

export function verifierT9(r: Registre, plafond: Readonly<DettesMax>, courante: Livraison = LIVRAISON_COURANTE): string[] {
  const p: string[] = [];
  const reel = compteursDettes(r);
  for (const k of ['dette', 'ecart', 'interne', 'ecritures_non_assistees'] as const) {
    if (reel[k] > plafond[k]) p.push(`${k}  ${reel[k]} dans le registre pour un plafond de ${plafond[k]} (dettes.json)  → ${k === 'dette' || k === 'ecart' ? 'une dette ou un écart de plus : fermez-en un, ou assumez la hausse en régénérant dettes.json (visible en revue)' : `${k === 'interne' ? 'une entrée interne de plus' : 'une écriture non assistée de plus'} : revue explicite, puis régénérez dettes.json`}`);
    else if (reel[k] < plafond[k]) p.push(`${k}  ${reel[k]} dans le registre pour un plafond de ${plafond[k]} (dettes.json)  → bravo, mais le plafond doit BAISSER dans la même PR (égalité : sinon la marge libérée en rouvrirait une sans bruit). Régénérez : ${REGENERER('dettes')}`);
  }
  for (const c of r.capacites) {
    for (const [champ, e] of [['dette', c.dette], ['ecart', c.ecart]] as const) {
      if (e && livraisonAtteinte(e.livraison, courante)) p.push(`${c.id}.${champ}  assigné à la livraison ${e.livraison}, déjà en ligne (≤ ${courante})  → c'est livré ou ça ne l'est pas : retirez ${champ === 'dette' ? 'la dette' : "l'écart"}, ou assignez-le à une livraison à venir`);
    }
  }
  return p;
}

export function verifierT10(snapshot: ClicsSnapshot, courant: ClicsSnapshot): { hausses: string[]; baisses: string[] } {
  const hausses: string[] = []; const baisses: string[] = [];
  for (const f of Object.keys(courant).sort()) {
    const avant = snapshot[f] ?? 0;
    if (courant[f] > avant) hausses.push(`${f}  ${avant} → ${courant[f]} gestionnaires onClick / onSelect / onSubmit  → un bouton neuf sur une écriture existante est invisible à T1 : nommez sa capacité dans la PR, puis régénérez clics.snapshot.json : ${REGENERER('clics')}`);
  }
  for (const f of Object.keys(snapshot).sort()) {
    if ((courant[f] ?? 0) < snapshot[f]) baisses.push(`${f}  ${snapshot[f]} → ${courant[f] ?? 0}`);
  }
  return { hausses, baisses };
}

/** Syntaxe et API hors de la cible navigateur (Safari < 16.4) : une erreur de syntaxe casserait le chunk ENTIER (même méthode que saisie-profil.test.ts (h)). */
export function verifierSyntaxeNavigateur(fichier: string, texte: string): string[] {
  const p: string[] = [];
  const m = masquer(texte);
  const regles: { motif: RegExp; sur: 'code' | 'nu'; dit: string }[] = [
    { motif: /\(\?<[=!]/g, sur: 'code', dit: 'assertion arrière « lookbehind » (erreur de syntaxe sur Safari < 16.4 : le chunk entier ne charge plus)' },
    { motif: /\.at\s*\(/g, sur: 'nu', dit: 'Array/String.prototype.at (Safari < 15.4) : écrivez  a[a.length - 1]' },
    { motif: /\bfindLast(?:Index)?\s*\(/g, sur: 'nu', dit: 'findLast / findLastIndex (Safari < 15.4)' },
    { motif: /\bObject\.hasOwn\s*\(/g, sur: 'nu', dit: 'Object.hasOwn (Safari < 15.4) : écrivez  Object.prototype.hasOwnProperty.call(o, k)' },
    { motif: /\breplaceAll\s*\(/g, sur: 'nu', dit: 'replaceAll (Safari < 13.1) : écrivez  .replace(/…/g, …)' },
    { motif: /\bstructuredClone\s*\(/g, sur: 'nu', dit: 'structuredClone (Safari < 15.4) : écrivez  JSON.parse(JSON.stringify(x))' },
  ];
  for (const r of regles) {
    for (const x of m[r.sur].matchAll(r.motif)) p.push(`${fichier}:${ligneDe(texte, x.index!)}  → ${r.dit}`);
  }
  return p;
}
const estFichierNavigateur = (c: string) => /^supabase\/functions\/_shared\/registre\/(?:ouvreurs-leger-[a-z]+|vocab)\.ts$/.test(c)
  || /^lib\/(?:openers(?:-[a-z]+)?|use-seed-on-open)\.tsx?$/.test(c) || /^lib\/registre-exec-[a-z]+\.tsx?$/.test(c);

// ════════════════════════════════════════════════════════════════════════════
// Lecture du dépôt réel (une fois)
// ════════════════════════════════════════════════════════════════════════════

let depotMemo: Promise<{ sources: Record<string, string>; scan: ResultatScan }> | null = null;
function depot() {
  depotMemo ??= (async () => { const sources = await lireSources(RACINE_DEPOT); return { sources, scan: scannerSurfaces(sources) }; })();
  return depotMemo;
}
let grapheMemo: Promise<Record<string, string>> | null = null;
function sourcesDuGraphe() {
  grapheMemo ??= lireSources(RACINE_DEPOT, ['app', 'components', 'lib', 'hooks', 'supabase/functions/_shared']);
  return grapheMemo;
}
async function textesRegistre(): Promise<Record<string, string>> {
  const rendu: Record<string, string> = {};
  for (const e of await Array.fromAsync(Deno.readDir(new URL(RACINE_REGISTRE, RACINE_DEPOT)))) {
    if (e.isFile && e.name.endsWith('.ts')) rendu[`${RACINE_REGISTRE}${e.name}`] = await lireTexte(`${RACINE_REGISTRE}${e.name}`);
  }
  return rendu;
}

async function lireJson<T>(relatif: string): Promise<T | null> {
  try { return JSON.parse(await lireTexte(relatif)) as T; } catch { return null; }
}
const texteJson = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
const trier = <T>(o: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

// ════════════════════════════════════════════════════════════════════════════
// Régénération (REGISTRE_REGENERER=1) : dettes.json, clics.snapshot.json, ids.snapshot.json
// ════════════════════════════════════════════════════════════════════════════

/** Quels fichiers générés réécrire : « 1 » = les trois, sinon la liste de REGISTRE_REGENERER (dettes, clics, ids). */
const A_REGENERER = ((v) => (v === undefined || v === '' || v === '0' ? [] : v === '1' ? ['dettes', 'clics', 'ids'] : v.split(',').map((x) => x.trim())))(env('REGISTRE_REGENERER'));

Deno.test({
  name: 'Régénération (REGISTRE_REGENERER) : dettes.json, clics.snapshot.json, ids.snapshot.json réécrits d\'après l\'état réel',
  ignore: A_REGENERER.length === 0,
  fn: async () => {
    const { scan } = await depot();
    const ecrire = (nom: string, valeur: unknown) => Deno.writeTextFile(new URL(`${RACINE_REGISTRE}${nom}`, RACINE_DEPOT), texteJson(valeur));
    const faits: string[] = [];
    if (A_REGENERER.includes('dettes')) { const plafond: { max: DettesMax } = { max: compteursDettes(REGISTRE) }; await ecrire('dettes.json', plafond); faits.push(`dettes.json ${JSON.stringify(plafond.max)}`); }
    if (A_REGENERER.includes('clics')) {
      await ecrire('clics.snapshot.json', trier(scan.clics));
      faits.push(`clics.snapshot.json ${Object.keys(scan.clics).length} fichiers, ${Object.values(scan.clics).reduce((a, b) => a + b, 0)} gestionnaires`);
    }
    if (A_REGENERER.includes('ids')) {
      // ids : jamais retirer un id publié, seulement en ajouter (T3 : « aucun ne disparaît »).
      const ancien = (await lireJson<string[]>(`${RACINE_REGISTRE}ids.snapshot.json`)) ?? [];
      const ordre = (a: string, b: string) => a[0].localeCompare(b[0]) || Number(a.slice(1)) - Number(b.slice(1));
      const ids = Array.from(new Set([...ancien, ...REGISTRE.capacites.map((c) => c.id)])).sort(ordre);
      await ecrire('ids.snapshot.json', ids);
      faits.push(`ids.snapshot.json ${ids.length} ids`);
    }
    console.log(`Régénéré : ${faits.join(' · ')}`);
  },
});

// ════════════════════════════════════════════════════════════════════════════
// LES TESTS SUR LE DÉPÔT RÉEL
// ════════════════════════════════════════════════════════════════════════════

Deno.test('T1 couverture : toute entrée de l’interface (fenêtre, dialogue, RPC, fonction, écriture de table, export de lib/, ancre, page) est portée par une capacité, classée interne ou déclarée', async () => {
  const { scan } = await depot();
  const { problemes, avertissements } = verifierT1(REGISTRE, scan, contexteReel());
  avertir('T1', avertissements);
  if (problemes.length) {
    echoue(`T1 couverture : ${pl(problemes.length, 'entrée d\'interface sans capacité', 'entrées d\'interface sans capacité')}`, problemes,
      '  Une capacité par geste : capacites-<côté>.ts (outil, humain + raison, ou dette datée) ; ses clés dans surfaces-<côté>.ts ; ce qui n\'est PAS une capacité (menu, légende, route publique) dans interne-<côté>.ts. Lecture complète : npx -y deno@2 run --allow-read supabase/functions/_shared/registre-surfaces-cli.ts');
  }
});

Deno.test('T1 ouvreurs (3b) : chaque ouvreur référence des composants, états et ancres qui existent ; chaque action de lien d\'avant (NAV_ACTIONS, WORKER_NAV, fiches du GUIDE, AdminScreen, TourScreen) a son ouvreur ou sa raison', async () => {
  const { scan } = await depot();
  const sources = await sourcesDuGraphe();
  const liensBureau = [...Object.keys(NAV_ACTIONS), ...GUIDE.map((g) => g.lien as string), ...ADMIN_SCREENS as string[]];
  const ecransSalarie = Array.from(new Set(WORKER_TOURS.flatMap((t) => t.etapes.map((e) => e.ecran).filter((e): e is NonNullable<typeof e> => !!e))));
  const p = verifierT1Ouvreurs({
    ouvreurs: OUVREURS, sansOuvreur: ALIAS_SANS_OUVREUR, sources, cles: new Set(scan.occurrences.map((o) => o.cle)),
    liens: { bureau: liensBureau, salarie: [...Object.keys(WORKER_NAV), ...WORKER_GUIDE.map((g) => g.lien as string), ...ecransSalarie] },
  });
  if (p.length) echoue(`T1 ouvreurs : ${pl(p.length, 'référence cassée', 'références cassées')}`, p, '  registre/ouvreurs.ts : composants, états et ancres sont lus dans le code ; les alias sont les anciennes actions de lien (les chats gardés 30 jours en contiennent encore).');
});

Deno.test('T2 périmé : toute clé déclarée (SURFACES, interne, écritures non assistées, fiches d’aide) existe encore dans le code', async () => {
  const { scan } = await depot();
  const { problemes } = verifierT2(REGISTRE, scan, contexteReel(), await textesRegistre());
  if (!problemes.length) return;
  if (SURFACES_EN_MIGRATION) { avertir('T2', problemes); return; }
  echoue(`T2 périmé : ${pl(problemes.length, 'clé déclarée qui n\'existe plus', 'clés déclarées qui n\'existent plus')}`, problemes,
    '  Renommer un RPC, une ancre ou une fenêtre casse ce test : mettez surfaces-<côté>.ts à jour. (Pendant le redesign, SURFACES_EN_MIGRATION = true dans surfaces.ts n\'en fait qu\'un avertissement.)');
});

Deno.test('T3 forme : ids, capacités qui disent ce qu’elles sont, raisons ≥ 30 caractères, catégories fermées, dettes datées avant l’horizon, libellés du cahier', async () => {
  const cahier = (cote: Cote) => lireJson<Cahier[]>(`docs/ia-etape3/capacites-${cote}.json`);
  const [b, s] = [await cahier('bureau'), await cahier('salarie')];
  const { problemes, avertissements } = verifierT3(REGISTRE, {
    snapshotIds: (await lireJson<string[]>(`${RACINE_REGISTRE}ids.snapshot.json`)) ?? [],
    cahiers: b && s ? { bureau: b, salarie: s } : null,
    horizon: HORIZON_DETTES,
    muettesConnues: CAPACITES_MUETTES_CONNUES,
  });
  avertir('T3', avertissements);
  if (problemes.length) echoue(`T3 forme : ${pl(problemes.length, 'problème')}`, problemes, '  Contrat §2.3 T3. Un id n\'est jamais renuméroté ni réutilisé ; nouveaux : B139+ / S106+.');
});

Deno.test('T3 dette échue : aucune dette n’a dépassé son échéance (la date vient de REGISTRE_AUJOURDHUI, sinon de l’horloge : le SEUL endroit)', () => {
  const { date, source } = aujourdhui();
  const echues = dettesEchues(REGISTRE.capacites, date);
  if (!echues.length) return;
  // §2.3 : une dette échue ne bloque que les PR qui touchent registre/ ou l'interface ; pour les autres, un avertissement (et l'issue quotidienne).
  if (env('REGISTRE_DETTES_PERIMEES') === 'avertir') { avertir('T3', echues.map((l) => `${l} [date ${date}, ${source}]`)); return; }
  echoue(`T3 dette échue au ${date} (${source}) : ${pl(echues.length, 'dette échue', 'dettes échues')}`, echues, '  Livrez la dette (outil, ouvreur) et supprimez-la, ou décalez son échéance en revue explicite (avant: … au plus ' + HORIZON_DETTES + '), ou passez la capacité en humain + raison. Une PR sans rapport avec le registre peut poser REGISTRE_DETTES_PERIMEES=avertir (la CI le fait quand la PR ne touche ni registre/ ni l\'interface).');
});

Deno.test('T4 niveaux : niveau 2 ⇒ « Annuler » ; champ de CHAMPS_CARTE ⇒ conditionnel ; tiers prévenu ⇒ carte ; capacité humain ⇒ aucun outil qui écrit', () => {
  const p = verifierT4(REGISTRE);
  if (p.length) echoue(`T4 niveaux : ${pl(p.length, 'problème')}`, p, '  Règle d\'or (§1.2) : pas d\'« Annuler » exact ⇒ jamais niveau 2 ⇒ carte (message déjà parti, tiers prévenu, droits d\'accès, nouveau chantier du salarié).');
});

for (const cote of ['bureau', 'salarie'] as const) {
  Deno.test(`T5 cohérence (${cote}) : les outils du registre = ceux du code (déclarations, types d’action, retraits, pièces jointes, domaines, liens, mode) et l’empreinte gelée`, async () => {
    const servis = outilsServis(REGISTRE.outils, cote);
    const p = verifierT5(cote, servis, CODE[cote]);
    // L'empreinte gelée (SHA-256) : le registre ré-assemblé, ET le code d'aujourd'hui, redonnent celle de outils-empreintes.json.
    const gel = await lireJson<Record<Cote, { liste: string }>>(`${RACINE_REGISTRE}outils-empreintes.json`);
    if (!gel) p.push('outils-empreintes.json  → illisible');
    else {
      const trois = servis.filter((o) => o.livraison === '3a').map((o) => ({ name: o.id, description: o.description, parameters: o.parametres }));
      const [duRegistre, duCode] = [await sha256(JSON.stringify(trois)), await sha256(JSON.stringify(CODE[cote].fonctions))];
      if (duRegistre !== gel[cote].liste) p.push(`${cote}  → le registre ré-assemblé (livraison 3a) ne redonne plus l'empreinte gelée de outils-empreintes.json : une description ou un schéma a changé. Si c'est voulu, c'est une livraison à empreinte déclarée (3b-0), pas une retouche`);
      if (duCode !== gel[cote].liste) p.push(`${cote}  → le code (${cote === 'bureau' ? 'ASSISTANT_FUNCTIONS' : 'WORKER_FUNCTIONS'}) ne redonne plus l'empreinte gelée : il a changé depuis le gel de outils-empreintes.json`);
    }
    // 3a-2 : les listes sont générées depuis le registre ; reste à la main ce que le code fait de chaque type d'écriture.
    const src = FONCTIONS_A_LA_MAIN[cote];
    p.push(...verifierT5Cases(cote, servis, { texte: await lireTexte(src.fichier), fonctions: src.fonctions }));
    if (p.length) echoue(`T5 cohérence (${cote}) : ${pl(p.length, 'écart')} avec le code`, p, '  Depuis 3a-2 le registre GÉNÈRE les listes (ASSISTANT_FUNCTIONS, ACTION_TYPES, REMOVAL_TYPES, ATTACHMENT_ACTIONS, domaines) : ce test compare l\'empreinte gelée et ce qui reste écrit à la main (prepare, checkAction, summarize, actionMode).');
  });
}

Deno.test('T6 liaison : l’exécuteur de chaque outil d’écriture existe, ses fichiers `code` aussi ; lectures livrées ↔ _shared/lectures/<id>.ts ; lib/registre-exec-<côté>.ts quand il existe', async () => {
  const { sources } = await depot();
  const p: string[] = [];
  for (const o of REGISTRE.outils) {
    if (o.kind === 'commande' || !livraisonAtteinte(o.livraison)) continue;
    if (o.kind === 'ecriture') {
      const fichiers = FICHIERS_EXECUTEUR[o.cote];
      if (!executeurPresent(o.executeur, fichiers.map((f) => sources[f] ?? ''))) {
        p.push(`${o.cote}/${o.id}  → exécuteur « ${o.executeur} » introuvable (case '${o.executeur}': ou fonction) dans ${fichiers.join(' ni ')} : un outil d'écriture sans exécuteur ne fait rien`);
      }
      for (const f of o.code) if (!(f in sources)) p.push(`${o.cote}/${o.id}  → code « ${f} » n'existe pas (outils-${o.cote}.ts)`);
    } else if (o.kind === 'lecture' && o.livraison !== '3a') {
      // Les lectures d'avant l'étape 3 (planning_collegues) gardent leur implémentation historique ; les 26 nouvelles ont chacune leur module.
      if (!(await existe(`supabase/functions/_shared/lectures/${o.id}.ts`))) p.push(`${o.cote}/${o.id}  → lecture livrée sans supabase/functions/_shared/lectures/${o.id}.ts`);
    }
  }
  for (const cote of ['bureau', 'salarie'] as const) {
    const rel = `lib/registre-exec-${cote}.ts`;
    if (sources[rel] === undefined) continue;                  // pas encore livré (3d)
    p.push(...verifierExecRegistre(rel, sources[rel], REGISTRE.outils.filter((o) => o.cote === cote && o.kind === 'ecriture' && livraisonAtteinte(o.livraison)).map((o) => o.id)));
  }
  // Les ouvreurs livrés : une clé littérale dans registerOpeners({…}).
  // 3b-1 : les ouvreurs LIVRÉS ; leurs implémentations vivent dans lib/openers-<côté>.ts (chargé à la demande par la page) et dans app/admin/page.tsx (abonnement).
  p.push(...verifierOuvreursEnregistres(Object.fromEntries(Object.entries(sources).filter(([f]) => /^(app|components|lib)\//.test(f))), OUVREURS.map((o) => o.id)));
  if (p.length) echoue(`T6 liaison : ${pl(p.length, 'problème')}`, p);
});

Deno.test('T7 évaluation : chaque outil livré a un cas d’évaluation, les paires d’outils proches ont leurs deux côtés, et (à la livraison) chaque cas a été mesuré', async () => {
  const src = await lireTexte('supabase/functions/assistant-eval/cases.ts');
  const mesures = await lireJson<{ mesures?: { cas?: Record<string, unknown> | string[] }[]; reference?: Record<string, unknown> }>(`${RACINE_REGISTRE}mesures.json`);
  const dernier = mesures?.mesures?.[mesures.mesures.length - 1]?.cas;
  const vus = Array.isArray(dernier) ? dernier : dernier ? Object.keys(dernier) : [];
  const servis = REGISTRE.outils.filter((o) => livraisonAtteinte(o.livraison));
  const { problemes, avertissements } = verifierT7(servis, CASES.map((c) => ({ id: c.id, cote: c.cote as Cote })), src, {
    cas: mesures ? vus : null, exigerMesures: env('REGISTRE_A_LA_LIVRAISON') === '1',
  });
  avertir('T7', avertissements);
  if (problemes.length) echoue(`T7 évaluation : ${pl(problemes.length, 'problème')}`, problemes, '  §1.4 : un outil livré sans phrase qui l\'attend ne se mesure pas ; une paire proche sans ses deux phrases ne prouve pas qu\'on les distingue.');
});

Deno.test('T8 hygiène : le navigateur (app/, components/, lib/, hooks/, imports transitifs) n’atteint jamais registre/capacites*, outils*, surfaces*, interne*, index.ts ; chaque page n’atteint que son côté', async () => {
  const sources = await sourcesDuGraphe();
  // Le graphe est-il VIVANT ? Un résolveur d'imports cassé ne verrait aucune fuite : on exige qu'il retrouve un lien connu (lib/assistant-actions.ts importe
  // le noyau de l'assistant, dans supabase/functions/_shared) et qu'il lise bien les alias « @/ ».
  const vus = atteints(grapheImports(sources), Object.keys(sources).filter((f) => DOSSIERS_NAVIGATEUR.test(f)));
  const partages = Array.from(vus.keys()).filter((f) => f.startsWith('supabase/functions/_shared/') && !f.startsWith(RACINE_REGISTRE)).length;
  vrai(vus.has('supabase/functions/_shared/assistant-actions-core.ts') && partages >= 10, `T8 : le graphe d'imports ne retrouve pas assistant-actions-core.ts depuis le navigateur (${partages} modules partagés atteints) : le résolveur d'imports est cassé, le test ne verrait aucune fuite`);
  const p = verifierT8Imports(sources);
  if (p.length) echoue(`T8 hygiène (imports) : ${pl(p.length, 'import interdit', 'imports interdits')}`, p, '  Le site est exporté en statique : tout le JavaScript d\'un chunk est public. Le navigateur n\'importe que registre/{types,config,vocab,ouvreurs-leger-<côté>}.ts (§1.1).');
});

Deno.test('T8 hygiène (build) : out/ — le chunk de /poseur n’a aucun nom d’outil du bureau, celui de /admin aucun du salarié, et window.__openLink n’existe pas en production', async () => {
  const build = await lireBuild();
  if (!build && Deno.env.get('REGISTRE_BUILD_OBLIGATOIRE') === '1') echoue('T8 build : out/ absent alors que le build est obligatoire (CI)', ['lancez  npm run build  avant ce test']);
  if (!build) { console.log('T8 build : out/ absent, contrôle ignoré (lancez  npm run build  pour le faire ; le job CI ne construit pas dans ce job)'); return; }
  const idsOuvreurs: Record<Cote, string[]> = { bureau: OUVREURS.filter((o) => o.cote === 'bureau').map((o) => o.id), salarie: OUVREURS.filter((o) => o.cote === 'salarie').map((o) => o.id) };
  const p = verifierT8Build(build, REGISTRE.outils, idsOuvreurs);
  if (p.length) echoue(`T8 hygiène (build out/) : ${pl(p.length, 'fuite', 'fuites')}`, p);
});

Deno.test('T9 cliquet : dette + écart + interne + écritures non assistées = dettes.json (égalité), et aucune dette assignée à une livraison déjà en ligne', async () => {
  let plafond: Readonly<DettesMax>;
  try { plafond = lireDettes(await lireTexte(`${RACINE_REGISTRE}dettes.json`)); } catch (e) { echoue('T9 cliquet : dettes.json illisible', [(e as Error).message]); }
  const p = verifierT9(REGISTRE, plafond);
  if (p.length) echoue(`T9 cliquet : ${pl(p.length, 'écart')} avec le plafond`, p, `  dettes.json est GÉNÉRÉ : ${REGENERER('dettes')}`);
});

Deno.test('T10 avertit : le nombre de gestionnaires onClick / onSelect / onSubmit d’un fichier d’interface n’a pas augmenté depuis clics.snapshot.json', async () => {
  const { scan } = await depot();
  const snapshot = await lireJson<ClicsSnapshot>(`${RACINE_REGISTRE}clics.snapshot.json`);
  if (!snapshot) echoue('T10 clics : clics.snapshot.json illisible', [`clics.snapshot.json illisible ou absent  → ${REGENERER('clics')}`]);
  const { hausses, baisses } = verifierT10(snapshot, scan.clics);
  if (baisses.length) console.log(`T10 : ${baisses.length} fichier(s) avec moins de gestionnaires que le snapshot (pensez à le régénérer) : ${baisses.join(' ; ')}`);
  if (!hausses.length) return;
  if (env('REGISTRE_CLICS') === 'bloquer') echoue(`T10 clics (bloquant : REGISTRE_CLICS=bloquer) : ${pl(hausses.length, 'fichier avec plus de gestionnaires', 'fichiers avec plus de gestionnaires')}`, hausses);
  avertir('T10', hausses);
});

Deno.test('T11 navigateur : les fichiers atteignables par le navigateur (ouvreurs légers, vocab, openers, use-seed-on-open, registre-exec-*) n’utilisent ni lookbehind, ni .at(), findLast, Object.hasOwn, replaceAll, structuredClone', async () => {
  const sources = await sourcesDuGraphe();
  const fichiers = Object.keys(sources).filter(estFichierNavigateur).sort();
  const p = fichiers.flatMap((f) => verifierSyntaxeNavigateur(f, sources[f]));
  console.log(`T11 : ${fichiers.length} fichier(s) navigateur contrôlé(s)${fichiers.length ? ` : ${fichiers.join(', ')}` : ' (aucun n\'est livré en 3a : voir les fixtures)'}`);
  if (p.length) echoue(`T11 navigateur : ${pl(p.length, 'syntaxe hors cible', 'syntaxes hors cible')}`, p, '  Safari < 16.4 : une erreur de syntaxe casse le chunk ENTIER, pas seulement la fonction fautive.');
});

Deno.test('Garde-fous du dépôt : le job CI « deno » lance ces tests sur main et integration/**, et le modèle de PR pose la question du registre', async () => {
  const p: string[] = [];
  const ci = (await lireTexte('.github/workflows/ci.yml').catch(() => '')).split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  if (!ci) p.push('.github/workflows/ci.yml  → introuvable');
  else {
    for (const t of ['registre-couverture.test.ts', 'registre-surfaces.test.ts', 'registre-outils.test.ts', 'registre-listes.test.ts']) if (!ci.includes(t)) p.push(`ci.yml  → ne lance plus ${t} : sans le job CI, T1 à T11 ne bloquent personne`);
    if (!/deno@2(\.\d+\.\d+)?\s+test\b/.test(ci)) p.push('ci.yml  → plus de commande « npx -y deno@2.9.6 test … » : le job Deno a disparu');
    if (!/branches:\s*\[\s*main\s*,\s*['"]integration\/\*\*['"]\s*\]/.test(ci)) p.push("ci.yml  → le filtre de branches n'est plus [main, 'integration/**'] : les lots fusionnés dans integration/* ne seraient plus contrôlés");
  }
  const pkg = await lireTexte('package.json').catch(() => '');
  for (const sc of ['test:couverture', 'test:registre']) if (!pkg.includes(`"${sc}"`)) p.push(`package.json  → script « ${sc} » absent (cité par le modèle de PR et le README du registre)`);
  const modele = await lireTexte('.github/pull_request_template.md').catch(() => '');
  if (!modele) p.push('.github/pull_request_template.md  → introuvable');
  else {
    if (!/clics\.snapshot/.test(modele)) p.push('pull_request_template.md  → plus de case « clics.snapshot régénéré, capacité nommée » (T10)');
    if (!/capacit/i.test(modele)) p.push('pull_request_template.md  → plus de question « bouton, fenêtre, RPC → capacité (id) ou raison »');
  }
  if (p.length) echoue(`Garde-fous du dépôt : ${pl(p.length, 'garde-fou manquant', 'garde-fous manquants')}`, p);
});

// ════════════════════════════════════════════════════════════════════════════
// FIXTURES : les règles sont JUSTES (pas seulement vertes sur le dépôt d'aujourd'hui)
// ════════════════════════════════════════════════════════════════════════════

const cap = (o: Partial<Capacite> & { id: string }): Capacite => ({ cote: o.id[0] === 'B' ? 'bureau' : 'salarie', libelle: `Capacité ${o.id}`, genre: 'ecrire', niveau: 2, ...o });
const outilBase = { cote: 'bureau' as Cote, roles: ['admin' as const], description: 'description assez longue', parametres: { type: 'object', properties: {} }, domaines: ['planning'], livraison: '3a' as Livraison };
const ecriture = (o: Record<string, unknown>): Outil => ({ ...outilBase, kind: 'ecriture', niveau: 2, mode: 'direct', modeActuel: 'direct', annuler: 'oui', executeur: 'x', code: ['lib/x.ts'], ...o }) as unknown as Outil;
const avecParams = (...noms: string[]) => ({ type: 'object', properties: Object.fromEntries(noms.map((n) => [n, { type: 'string' }])) });
const miniRegistre = (o: Partial<Registre> = {}): Registre => ({ capacites: [], surfaces: {}, interne: [], ecritures: [], outils: [], ...o });
const ctxVide = (o: Partial<ContexteT1> = {}): ContexteT1 => ({ clesOuvreurs: [], ancresParcours: new Set(), nomsCalcules: [], guidesSansCapaciteConnus: [], clesNav: [], guidesDuCode: [], navBloquant: false, ...o });

Deno.test('T1 couverture (fixtures) : le message donne la clé, fichier:ligne et la ligne à coller ; couvert, interne, parcours et exception ne sont pas signalés', () => {
  const scan = scannerSurfaces({
    'components/clients-list.tsx': ["const a = 1;", "supabase.rpc('set_foo', {});"].join('\n'),                       // rpc:set_foo ligne 2 : sans capacité (écran du bureau)
    'components/poseur-day.tsx': "supabase.rpc('set_baz', {});",                                                      // sans capacité, écran du salarié
    'components/admin-planning.tsx': "supabase.rpc('set_bar', {}); <div data-guide=\"un.parcours\" />",               // set_bar couvert ; ancre citée par un parcours
    'components/legende.tsx': "<div data-guide=\"leg.ende\" />",                                                     // ancre classée interne
    'lib/erase.ts': "export async function restoreRows(t, r) { await supabase.from(t).upsert(r); }",                  // table:?:upsert : exception déclarée
    'lib/autre.ts': "export async function eff(t) { await supabase.from(t).delete(); }",                              // table:?:delete hors exception : refusé
  });
  const r = miniRegistre({
    capacites: [cap({ id: 'B1' }), cap({ id: 'B2' })],
    surfaces: { B1: ['rpc:set_bar', 'ecriture:lib/erase#restoreRows'] },
    interne: [{ cle: 'ancre:leg.ende', raison: 'Légende décorative : aucune action à faire faire à l\'assistant.' }],
  });
  const ctx = ctxVide({ ancresParcours: new Set(['ancre:un.parcours']), nomsCalcules: [{ cle: 'table:?:upsert', fichier: 'lib/erase.ts', raison: 'x', declaration: '// registre:tables=a' }] });
  const { problemes } = verifierT1(r, scan, ctx);
  const texte = problemes.join('\n');
  vrai(texte.includes("rpc:set_foo  components/clients-list.tsx:2"), `clé et fichier:ligne attendus, obtenu :\n${texte}`);
  vrai(texte.includes("dans surfaces-bureau.ts") && texte.includes("B3: ['rpc:set_foo'],"), `la ligne à coller nomme le prochain id libre du bureau (B3) :\n${texte}`);
  vrai(texte.includes("rpc:set_baz  components/poseur-day.tsx:1") && texte.includes("S1: ['rpc:set_baz'],") && texte.includes('surfaces-salarie.ts'), `le côté salarié a son propre compteur (S1) :\n${texte}`);
  vrai(/table:\?:delete\s+lib\/autre\.ts:1\s+→.*registre:tables=/.test(texte), `un nom calculé hors exception doit dire de le déclarer :\n${texte}`);
  vrai(/ecriture:lib\/autre#eff\s+lib\/autre\.ts:1\s+→ rattachez-la/.test(texte), `un export de lib/ qui écrit demande sa capacité :\n${texte}`);
  vrai(!texte.includes('set_bar') && !texte.includes('leg.ende') && !texte.includes('un.parcours') && !texte.includes('table:?:upsert') && !texte.includes('restoreRows'), `rien d'autre ne doit être signalé :\n${texte}`);
});

Deno.test('T1 couverture (fixtures) : une écriture dans interne est refusée ; une exception qui n’a plus lieu d’être l’est aussi ; nav avertit avant 3b et échoue après ; une fiche d’aide sans capacité échoue sauf exception connue', () => {
  const scan = scannerSurfaces({});
  const r = miniRegistre({
    capacites: [cap({ id: 'B1', guides: ['dehors'] })],
    interne: [{ cle: 'rpc:set_user_role', raison: 'Une raison assez longue pour passer le contrôle de longueur.' }, { cle: 'table:worksites:update', raison: 'Une raison assez longue pour passer le contrôle de longueur.' }],
  });
  const ctx = ctxVide({
    nomsCalcules: [{ cle: 'fn:?', fichier: 'lib/disparu.ts', raison: 'x', declaration: '// registre:fn=a' }],
    clesNav: ['nav:bureau:planning'],
    guidesDuCode: [{ cote: 'bureau', id: 'dehors' }, { cote: 'bureau', id: 'orphelin' }, { cote: 'bureau', id: 'connu' }],
    guidesSansCapaciteConnus: [{ cote: 'bureau', id: 'connu', correction: 'fix' }, { cote: 'bureau', id: 'regle', correction: 'fix' }],
  });
  const a = verifierT1(r, scan, ctx);
  const t = a.problemes.join('\n');
  vrai(/rpc:set_user_role\s+interne\.ts\s+→ une écriture ne va JAMAIS/.test(t), `rpc dans interne :\n${t}`);
  vrai(/table:worksites:update\s+interne\.ts/.test(t), `table:*:update dans interne :\n${t}`);
  vrai(/exception périmée\s+fn:\?\s+dans lib\/disparu\.ts/.test(t), `exception inutile :\n${t}`);
  vrai(/guide:bureau:orphelin\s+→ fiche d'aide qu'aucune capacité ne nomme/.test(t), `fiche d'aide orpheline :\n${t}`);
  vrai(!/guide:bureau:dehors/.test(t) && !/guide:bureau:connu\s+→ fiche d'aide qu'aucune/.test(t), `fiche nommée ou connue non signalée :\n${t}`);
  vrai(/exception périmée\s+guide:bureau:regle/.test(t), `exception de fiche devenue inutile :\n${t}`);
  vrai(a.avertissements.some((l) => l.includes('nav:bureau:planning')) && !t.includes('nav:bureau:planning'), 'nav avertit avant 3b');
  vrai(a.avertissements.some((l) => l.includes('guide:bureau:connu')), 'la fiche connue avertit');
  const b = verifierT1(r, scan, { ...ctx, navBloquant: true });
  vrai(b.problemes.join('\n').includes('nav:bureau:planning'), 'nav échoue à partir de 3b');
});

Deno.test('T1 ouvreurs (fixtures) : composant, ancre, état et lien d\'avant sans ouvreur sont signalés ; un alias, un « sans ouvreur » et ask: ne le sont pas ; un ouvreur à la fois livré et reporté non plus', () => {
  const o = (x: Partial<Ouvreur> & { id: string }): Ouvreur => ({ cote: 'bureau', roles: ['admin'], titre: 'Titre', decrit: 'Une phrase claire.', params: {}, niveau: 1, ...x });
  const base: ContexteOuvreurs = {
    ouvreurs: [o({ id: 'a.b', composants: ['reserves-report'], ancres: ['bureau-nav.reserves'], etats: ['reservesOpen'], alias: ['reserves'] })],
    sansOuvreur: [{ cote: 'bureau', alias: 'couts', raison: 'x'.repeat(30) }],
    sources: { 'components/admin-planning.tsx': 'const [reservesOpen, setReservesOpen] = useState(false);' },
    cles: new Set(['fenetre:reserves-report', 'ancre:bureau-nav.reserves']),
    liens: { bureau: ['reserves', 'couts', 'ask:Où ?'], salarie: [] },
  };
  egal(verifierT1Ouvreurs(base), [], 'tout va bien');
  const un = (c: Partial<ContexteOuvreurs>) => verifierT1Ouvreurs({ ...base, ...c }).join('\n');
  vrai(un({ cles: new Set(['ancre:bureau-nav.reserves']) }).includes('composant « reserves-report »'), 'composant sans fenêtre');
  vrai(un({ cles: new Set(['fenetre:reserves-report']) }).includes('ancre « bureau-nav.reserves »'), 'ancre disparue');
  vrai(un({ sources: { 'components/admin-planning.tsx': 'const [autre, setAutre] = useState(0);' } }).includes('état « reservesOpen »'), 'état renommé');
  vrai(un({ sources: { 'components/poseur-day.tsx': 'const [reservesOpen, x] = useState(0);' } }).includes('état « reservesOpen »'), 'un état d\'une page d\'un AUTRE côté ne compte pas');
  vrai(un({ liens: { bureau: ['reserves', 'couts', 'clients'], salarie: [] } }).includes('lien « clients » (bureau)'), 'lien sans ouvreur');
  vrai(un({ liens: { bureau: [], salarie: ['journee'] } }).includes('lien « journee » (salarie)'), 'lien du salarié sans ouvreur (l\'alias du bureau ne le couvre pas)');
  vrai(un({ ouvreurs: [o({ id: 'historique.supprimees' })] }).includes('livré ET reporté'), 'livré et reporté à la fois');
  egal(clesOuvreursDe(base.ouvreurs, base.sansOuvreur, ['nav:bureau:reserves', 'nav:bureau:couts', 'nav:bureau:clients']), ['ancre:bureau-nav.reserves', 'fenetre:reserves-report', 'nav:bureau:couts', 'nav:bureau:reserves'], 'clés couvertes : seulement celles qui existent');
});

Deno.test('T2 périmé (fixtures) : une clé renommée dit ce qu’elle est devenue, une ligne de surfaces ; une fiche d’aide disparue est signalée', () => {
  const scan = scannerSurfaces({ 'components/a.tsx': "supabase.rpc('ensure_planning_slot_v2', {}); <div data-guide=\"bureau-nav.salaries\" />" });
  const r = miniRegistre({ capacites: [cap({ id: 'B1', guides: ['fantome'] })], surfaces: { B1: ['rpc:ensure_planning_slot', 'ancre:bureau-nav.salaries'] } });
  const { problemes } = verifierT2(r, scan, ctxVide(), { 'supabase/functions/_shared/registre/surfaces-bureau.ts': "B1: [\n    'rpc:ensure_planning_slot',\n  ]," });
  const t = problemes.join('\n');
  vrai(/rpc:ensure_planning_slot\s+déclarée par B1 \(surfaces-bureau\.ts:2\)\s+→ n'existe plus.*« rpc:ensure_planning_slot_v2 »/.test(t), `renommage :\n${t}`);
  vrai(!t.includes('bureau-nav.salaries'), 'la clé qui existe n\'est pas signalée');
  vrai(/B1\.guides « fantome »/.test(t), `fiche disparue :\n${t}`);
});

Deno.test('T3 forme (fixtures) : doublon, id disparu, id hors suite, capacité muette, raison courte, catégorie inconnue, dette hors horizon, libellé modifié', () => {
  const r = miniRegistre({
    capacites: [
      cap({ id: 'B1', libelle: 'Libellé modifié', outil: 'repondre' }),
      cap({ id: 'B1', outil: 'inconnu' }),
      cap({ id: 'B4' }),                                                                                       // muette, et B4 saute B3
      cap({ id: 'B5', humain: { categorie: 'nimporte' as CategorieHumain, raison: 'courte' } }),
      cap({ id: 'S1', dette: { livraison: '3c', avant: '2027-07-01', note: 'x' } }),
      cap({ id: 'S2', dette: { livraison: '3z' as Livraison, avant: '2027-02-30', note: '' } }),
    ],
    surfaces: { B99: ['rpc:x'], B5: ['nimporte:x'] },
    interne: [{ cle: 'route:/a', raison: 'trop court' }],
    outils: [{ ...outilBase, id: 'repondre', kind: 'reponse', niveau: 1 } as unknown as Outil],
  });
  const ctx3: ContexteT3 = {
    snapshotIds: ['B1', 'B2', 'S1', 'S2'], horizon: '2027-06-30',
    cahiers: { bureau: [{ id: 'B1', libelle: 'Libellé du cahier', genre: 'ecrire', niveau: 2 }], salarie: [] },
  };
  const { problemes, avertissements } = verifierT3(r, ctx3);
  const t = problemes.join('\n');
  for (const [motif, nom] of [
    [/B1\s+→ id en double/, 'doublon'], [/B2\s+→ id disparu/, 'disparu'], [/B4\s+→ id neuf hors suite : après B2 le suivant est B3/, 'hors suite'],
    [/B4\s+→ ne dit rien/, 'muette'], [/B1\.outil « inconnu »/, 'outil inconnu'], [/B5\.humain\.categorie « nimporte »/, 'catégorie'], [/B5\.humain\.raison \(6 car\.\)/, 'raison courte'],
    [/S1\.dette\.avant 2027-07-01\s+→ après l'horizon 2027-06-30/, 'horizon'], [/S2\.dette\.avant « 2027-02-30 »/, 'date impossible'], [/S2\.dette\.livraison « 3z »/, 'livraison'],
    [/SURFACES\.B99\s+→ capacité inconnue/, 'surface sans capacité'], [/SURFACES\.B5 « nimporte:x »\s+→ clé mal formée/, 'clé mal formée'], [/interne « route:\/a » \(10 car\.\)/, 'raison interne'],
    [/B1\.libelle\s+→ différent du cahier/, 'libellé du cahier'],
  ] as const) vrai(motif.test(t), `T3 doit signaler « ${nom} », obtenu :\n${t}`);
  vrai(avertissements.some((l) => l.includes('B4, B5')), 'les ids neufs absents du snapshot avertissent');
  // Exceptions de départ : une capacité muette connue avertit ; une exception qui ne l'est plus échoue.
  const m = verifierT3(r, { ...ctx3, muettesConnues: [{ id: 'B4', correction: 'fix' }, { id: 'S1', correction: 'fix' }] });
  vrai(!/B4\s+→ ne dit rien/.test(m.problemes.join('\n')) && m.avertissements.some((l) => l.includes('B4  → capacité muette (exception de départ) : fix')), 'muette connue : avertit');
  vrai(/exception périmée\s+S1\s+→ la capacité dit maintenant/.test(m.problemes.join('\n')), 'exception devenue inutile : échoue');
});

Deno.test('T3 dette échue (fixtures) : la date est injectée, jamais lue ici ; échue = strictement avant', () => {
  const caps = [cap({ id: 'B1', dette: { livraison: '3c', avant: '2027-01-31', note: 'n' } }), cap({ id: 'B2', dette: { livraison: '3c', avant: '2027-02-28', note: 'n' } }), cap({ id: 'B3' })];
  egal(dettesEchues(caps, '2027-01-31'), [], 'le jour même n\'est pas échu');
  egal(dettesEchues(caps, '2027-02-01').map((l) => l.slice(0, 2)), ['B1'], 'B1 échue le 02-01');
  egal(dettesEchues(caps, '2027-03-01').map((l) => l.slice(0, 2)), ['B1', 'B2'], 'B1 et B2 échues le 03-01');
  vrai(dateValide('2028-02-29') && !dateValide('2027-02-29') && !dateValide('2027-13-01') && !dateValide('27-01-01'), 'dateValide : bissextile et formats');
});

Deno.test('T4 niveaux (fixtures) : chaque règle du §1.2 est vérifiée et un outil correct ne l\'est jamais à tort', () => {
  const ok = [
    ecriture({ id: 'ok_direct', parametres: avecParams('salarie', 'date') }),
    ecriture({ id: 'ok_conditionnel', mode: 'conditionnel', modeActuel: 'conditionnel', champsCarte: ['telephone'], parametres: avecParams('nom', 'telephone') }),
    ecriture({ id: 'ok_carte', niveau: 3, mode: 'carte', modeActuel: 'carte', annuler: 'non', notifie: true, parametres: avecParams('salarie') }),
  ];
  egal(verifierT4(miniRegistre({ outils: ok })), [], 'trois outils justes');
  const cas: [string, Outil, RegExp][] = [
    ['niveau 2 sans Annuler', ecriture({ id: 'a', annuler: 'non' }), /a\s+→ niveau 2 sans « Annuler »/],
    ['CHAMPS_CARTE en direct', ecriture({ id: 'b', parametres: avecParams('email_comptable', 'heures_hebdo') }), /b\s+→ niveau 2 avec email_comptable, heures_hebdo \(CHAMPS_CARTE\) : doit être mode: 'conditionnel'/],
    ['conditionnel qui oublie un champ', ecriture({ id: 'c', mode: 'conditionnel', modeActuel: 'conditionnel', champsCarte: ['email'], parametres: avecParams('email', 'telephone') }), /c\s+→ champsCarte ne nomme pas « telephone »/],
    ['tiers prévenu sans carte', ecriture({ id: 'd', notifie: true }), /d\s+→ son résultat prévient un tiers/],
    ['retrait en direct', ecriture({ id: 'e', retrait: true }), /e\s+→ un retrait passe toujours par la carte/],
    ['niveau 3 en direct', ecriture({ id: 'f', niveau: 3 }), /f\s+→ niveau 3 et mode « direct » ne s'accordent pas/],
    ['champsCarte hors paramètres', ecriture({ id: 'g', mode: 'conditionnel', modeActuel: 'conditionnel', champsCarte: ['fantome'] }), /g\s+→ champsCarte « fantome » n'est pas un paramètre/],
  ];
  for (const [nom, o, motif] of cas) {
    const t = verifierT4(miniRegistre({ outils: [o] })).join('\n');
    vrai(motif.test(t), `T4 doit signaler « ${nom} », obtenu : ${t || '(rien)'}`);
  }
  // capacité humain ⇒ outil qui n'écrit pas ; une commande est exemptée
  const w = ecriture({ id: 'ecrit' });
  const t = verifierT4(miniRegistre({ capacites: [cap({ id: 'B1', outil: 'ecrit', humain: { categorie: 'paiement', raison: 'x'.repeat(40) } })], outils: [w] })).join('\n');
  vrai(/B1\s+→ capacité humain \(paiement\) mais son outil « ecrit » écrit/.test(t), `humain ⇒ pas d'écriture :\n${t}`);
  egal(verifierT4(miniRegistre({ outils: [{ ...outilBase, id: 'annuler_derniere_action', kind: 'commande', niveau: 1, commande: 'annuler_derniere_action' } as unknown as Outil] })), [], 'commande exemptée');
  vrai(CHAMPS_CARTE.test('majoration_1') && CHAMPS_CARTE.test('telephone_client') && CHAMPS_CARTE.test('mail') && !CHAMPS_CARTE.test('salarie') && !CHAMPS_CARTE.test('montant'), 'motif CHAMPS_CARTE');
});

Deno.test('T5 cohérence (fixtures) : un outil renommé, un mode, un retrait, une pièce jointe, un domaine ou un lien qui diffèrent du code sont signalés', () => {
  const decl = (name: string) => ({ name, description: 'd', parameters: { type: 'object' } });
  const code: CodeDuCote = {
    fonctions: [decl('repondre'), decl('ecrit')], retraits: ['ecrit'], joints: ['repondre'], domaines: { planning: { tools: ['ecrit'] } }, liensNav: ['a', 'b'],
    typesAction: ['ecrit'], mode: () => 'carte',
  };
  const repondre = { ...outilBase, id: 'repondre', kind: 'reponse', niveau: 1, domaines: [], pieceJointe: true, parametres: { type: 'object', properties: { liens: { items: { enum: ['a', 'b'] } } } } } as unknown as Outil;
  const ecrit = ecriture({ id: 'ecrit', niveau: 3, mode: 'carte', modeActuel: 'carte', retrait: true });
  egal(verifierT5('bureau', [repondre, ecrit], code), [], 'cohérent');
  const defauts: [string, Outil[], RegExp][] = [
    ['outil renommé', [repondre, ecriture({ id: 'ecrit2', niveau: 3, mode: 'carte', modeActuel: 'carte', retrait: true })], /bureau\/ecrit2\s+→ au registre mais pas dans ASSISTANT_FUNCTIONS/],
    ['outil du code sans entrée', [repondre], /bureau\/ecrit\s+→ dans ASSISTANT_FUNCTIONS mais pas au registre/],
    ['mode', [repondre, ecriture({ id: 'ecrit', retrait: true })], /bureau\/ecrit\s+→ mode « direct » au registre, « carte » dans actionMode/],
    ['retrait', [repondre, ecriture({ id: 'ecrit', niveau: 3, mode: 'carte', modeActuel: 'carte' })], /retrait: false au registre, true/],
    ['pièce jointe', [{ ...repondre, pieceJointe: false } as Outil, ecrit], /pieceJointe: false au registre, true/],
    ['domaine', [repondre, ecriture({ id: 'ecrit', niveau: 3, mode: 'carte', modeActuel: 'carte', retrait: true, domaines: ['heures'] })], /domaines \["heures"\] au registre, \["planning"\]/],
    ['liens', [{ ...repondre, parametres: { type: 'object', properties: { liens: { items: { enum: ['a'] } } } } } as unknown as Outil, ecrit], /bureau\/repondre\s+→ les liens proposés/],
  ];
  for (const [nom, outils, motif] of defauts) {
    const t = verifierT5('bureau', outils, code).join('\n');
    vrai(motif.test(t), `T5 doit signaler « ${nom} », obtenu : ${t || '(rien)'}`);
  }
});

Deno.test('T5 cohérence (fixtures, 3a-2) : un type d\'écriture sans case dans prepare / checkAction / summarize / actionMode, ou un case sans outil, est signalé', () => {
  const AC = `
    export function prepare(type: string, raw: Record<string, unknown>): X | null { let d; switch (type) { case 'a': d = 1; break; case 'b': { switch (raw.k) { case 'zz': break; } break; } } return d; }
    export function checkAction(d: D, ctx: C): string[] { const p = []; switch (d.type) { case 'a': break; case 'b': break; } return p; }
    export function summarize(d: D, ctx: C): string { switch (d.type) { case 'a': return 'x'; case 'b': return "y"; } }
    export function actionMode(d: D): 'direct' | 'confirm' { switch (d.type) { case 'a': return 'direct'; default: return 'confirm'; } }
    // case 'fantome': dans un commentaire
  `;
  const sources = { texte: AC, fonctions: FONCTIONS_A_LA_MAIN.bureau.fonctions };
  const a = ecriture({ id: 'a', niveau: 2, mode: 'direct', modeActuel: 'direct' });
  const b = ecriture({ id: 'b', niveau: 3, mode: 'carte', modeActuel: 'carte' });
  egal(verifierT5Cases('bureau', [a, b], sources), [], 'cohérent (le switch imbriqué et le commentaire ne comptent pas)');
  const c = ecriture({ id: 'c', niveau: 3, mode: 'carte', modeActuel: 'carte' });
  const defauts: [string, Outil[], string, RegExp][] = [
    ['écriture sans case', [a, b, c], AC, /bureau\/c\s+→ écriture du registre sans « case 'c' » dans prepare\(\)/],
    ['case sans outil', [a], AC, /bureau\/b\s+→ « case 'b' » dans prepare\(\) mais ce n'est pas une écriture/],
    ['actionMode : direct oublié', [ecriture({ id: 'a', niveau: 3, mode: 'carte', modeActuel: 'carte' }), b], AC, /bureau\/a\s+→ « case 'a' » dans actionMode\(\)/],
    ['actionMode : exception absente', [a, b, ecriture({ id: 'c', niveau: 2, mode: 'direct', modeActuel: 'direct' })], AC.replace("case 'a': return 'direct'; ", ''), /bureau\/a\s+→ écriture du registre sans « case 'a' » dans actionMode\(\)/],
    ['fonction introuvable', [a, b], AC.replace('export function summarize(', 'export function resume('), /summarize\(\) ou son commutateur « switch \(type\) » est introuvable/],
  ];
  for (const [nom, outils, texte, motif] of defauts) {
    const r = verifierT5Cases('bureau', outils, { ...sources, texte }).join('\n');
    vrai(motif.test(r), `T5 doit signaler « ${nom} », obtenu : ${r || '(rien)'}`);
  }
  // Salarié : defaut « direct », retraits déjà confirmés avant le commutateur ; declarer_heures et les deux types désactivés sont les exceptions déclarées.
  const WC = `
    export function prepareWorkerAction(type: string): W | null { switch (type) { case 'x': break; case 'y': break; case 'r': break; case 'commencer_pointage': break; case 'annuler_pointage': break; } return null; }
    export function checkWorkerAction(d: W): string[] { switch (d.type) { case 'x': break; case 'y': break; case 'r': break; case 'commencer_pointage': break; case 'annuler_pointage': break; } return []; }
    export function workerActionMode(d: W): 'direct' | 'confirm' { if (isWorkerRemoval(d)) return 'confirm'; switch (d.type) { case 'y': return 'confirm'; default: return 'direct'; } }
  `;
  const x = ecriture({ id: 'x', cote: 'salarie', niveau: 2, mode: 'direct', modeActuel: 'direct' } as never);
  const y = ecriture({ id: 'y', cote: 'salarie', niveau: 3, mode: 'carte', modeActuel: 'carte' } as never);
  const r = ecriture({ id: 'r', cote: 'salarie', niveau: 3, mode: 'carte', modeActuel: 'carte', retrait: true } as never);
  const dh = ecriture({ id: 'declarer_heures', cote: 'salarie', niveau: 2, mode: 'direct', modeActuel: 'direct' } as never);
  egal(verifierT5Cases('salarie', [x, y, r, dh], { texte: WC, fonctions: FONCTIONS_A_LA_MAIN.salarie.fonctions }), [], 'salarié cohérent');
  vrai(verifierT5Cases('salarie', [x, y, r, dh, ecriture({ id: 'z', cote: 'salarie', niveau: 3, mode: 'carte', modeActuel: 'carte' } as never)], { texte: WC, fonctions: FONCTIONS_A_LA_MAIN.salarie.fonctions }).join('\n').includes('salarie/z  → écriture du registre sans « case \'z\' » dans prepareWorkerAction()'), 'salarié : écriture sans case');
});

Deno.test('T6 liaison (fixtures) : exécuteur introuvable, lib/registre-exec-<côté>.ts sans clé ou sans default qui lève, ouvreur sans clé littérale', () => {
  vrai(executeurPresent('poser', ["switch (t) { case 'poser': { return 1; } }"]), 'case trouvé');
  vrai(executeurPresent('makeSaver', ['export function makeSaver(u) {}']), 'fonction trouvée');
  vrai(!executeurPresent('poser', ["// case 'poser':\n const s = \"case 'poser'\";"]), 'ni commentaire ni chaîne');
  vrai(!executeurPresent('poser', ["case 'poser2': break;"]), 'pas de préfixe');
  const bon = "export const EXEC = (n) => { switch (n) { case 'a': return 1; case 'b': return 2; default: throw new Error('outil sans exécuteur : ' + n); } };";
  egal(verifierExecRegistre('lib/registre-exec-bureau.ts', bon, ['a', 'b']), [], 'exécuteur juste');
  vrai(verifierExecRegistre('lib/registre-exec-bureau.ts', bon, ['a', 'b', 'c']).join('').includes('pas de clé « c »'), 'clé manquante');
  vrai(verifierExecRegistre('lib/registre-exec-bureau.ts', bon.replace(/default: throw[^;]*;/, 'default: return null;'), ['a']).join('').includes('ne lève pas'), 'default qui ne lève pas');
  vrai(verifierExecRegistre('lib/registre-exec-bureau.ts', "case 'a': return 1;", ['a']).join('').includes('pas de « default »'), 'pas de default');
  const page = "useEffect(() => registerOpeners('bureau', { 'planning.semaine': (p) => go(p), \"salarie.fiche\": () => {} , [calcule]: () => {} }), []);";
  egal(verifierOuvreursEnregistres({ 'app/admin/page.tsx': page }, ['planning.semaine', 'salarie.fiche']), [], 'clés littérales trouvées');
  const t = verifierOuvreursEnregistres({ 'app/admin/page.tsx': page }, ['planning.semaine', 'client.fiche']).join('\n');
  vrai(t.includes('« client.fiche »') && !t.includes('planning.semaine'), `ouvreur absent signalé :\n${t}`);
});

Deno.test('T7 évaluation (fixtures) : outil sans cas, outil attendu inconnu, paire proche à sens unique, et mesures exigées seulement à la livraison', () => {
  const src = [
    "{ id: 'c1', cote: 'bureau', categorie: 'x', phrase: 'a', check: act('alpha', (d) => null) },",
    "{ id: 'c2', cote: 'bureau', categorie: 'x', phrase: 'b', check: act('alpha', (d) => null) },",
    "{ id: 'c3', cote: 'bureau', categorie: 'x', phrase: 'c', check: actAvecProblemes('gamma', []) },",
    "{ id: 'c4', cote: 'bureau', categorie: 'x', phrase: 'd', check: act('fantome', (d) => null) },",
    "{ id: 'c5', cote: 'bureau', categorie: 'x', phrase: 'e', check: answer('planning') },",
  ].join('\n');
  const o = (id: string, extra: Record<string, unknown> = {}) => ecriture({ id, ...extra });
  const servis = [o('alpha', { proches: ['beta'] }), o('beta', { proches: ['alpha'] }), o('gamma'), o('repondre', { kind: 'reponse' })];
  const cas = ['c1', 'c2', 'c3', 'c4', 'c5'].map((id) => ({ id, cote: 'bureau' as Cote }));
  const a = verifierT7(servis, cas, src, { cas: ['c1', 'c2', 'c3', 'c4', 'c5'], exigerMesures: true });
  const t = a.problemes.join('\n');
  vrai(/bureau\/beta\s+→ livré .* aucun cas d'évaluation ne l'attend.*act\('beta'/.test(t), `outil sans cas :\n${t}`);
  vrai(/cas c4\s+→ attend l'outil « fantome »/.test(t), `outil attendu inconnu :\n${t}`);
  vrai(/alpha ↔ beta\s+→ outils proches/.test(t), `paire proche :\n${t}`);
  const b = verifierT7(servis, cas, src, { cas: ['c1'], exigerMesures: false });
  vrai(!b.problemes.join('').includes('jamais exécutés') && b.avertissements.some((l) => l.includes('4 cas jamais exécutés')), 'hors livraison : avertissement');
  const c = verifierT7(servis, cas, src, { cas: ['c1'], exigerMesures: true });
  vrai(c.problemes.join('').includes('4 cas jamais exécutés'), 'à la livraison : échec');
});

Deno.test('T8 hygiène (fixtures) : import direct, transitif, dynamique, réexport ; `import type` ignoré ; modules légers autorisés ; chaque page n’atteint que son côté', () => {
  const R = 'supabase/functions/_shared/registre/';
  const base: Record<string, string> = {
    [`${R}index.ts`]: "export * from './outils-bureau.ts'; export * from './types.ts';",
    [`${R}outils-bureau.ts`]: "export const X = 1;", [`${R}capacites-bureau.ts`]: "export const C = 1;", [`${R}surfaces.ts`]: "export const S = 1;",
    [`${R}types.ts`]: "export type T = 1;", [`${R}config.ts`]: "export const L = 1;", [`${R}vocab.ts`]: "export const V = 1;",
    [`${R}ouvreurs-leger-bureau.ts`]: "export const OB = 1;", [`${R}ouvreurs-leger-salarie.ts`]: "export const OS = 1;",
    'supabase/functions/_shared/pont.ts': "import { X } from './registre/outils-bureau.ts';\nexport const Y = X;",
    'lib/registre-exec-bureau.ts': "export const EB = 1;", 'lib/registre-exec-salarie.ts': "export const ES = 1;",
  };
  const juste = {
    ...base,
    'components/ok.tsx': "import type { T } from '@/supabase/functions/_shared/registre/index';\nimport { L } from '@/supabase/functions/_shared/registre/config';\nimport { OB } from '../supabase/functions/_shared/registre/ouvreurs-leger-bureau.ts';",
    'app/admin/page.tsx': "import { EB } from '@/lib/registre-exec-bureau';\nimport { OB } from '@/supabase/functions/_shared/registre/ouvreurs-leger-bureau';",
    'app/poseur/page.tsx': "import { ES } from '@/lib/registre-exec-salarie';\nimport { V } from '@/supabase/functions/_shared/registre/vocab';",
  };
  egal(verifierT8Imports(juste), [], 'un dépôt juste : types, config, vocab, légers de son côté');
  const mal: [string, Record<string, string>, RegExp][] = [
    ['direct', { ...juste, 'components/mal.tsx': "import { X } from '@/supabase/functions/_shared/registre/outils-bureau';" }, /components\/mal\.tsx:1\s+→ importe registre\/outils-bureau\.ts/],
    ['index', { ...juste, 'lib/mal.ts': "import * as R from '@/supabase/functions/_shared/registre/index.ts';" }, /lib\/mal\.ts:1\s+→ importe registre\/index\.ts/],
    ['transitif', { ...juste, 'components/mal.tsx': "import { Y } from '@/supabase/functions/_shared/pont';" }, /supabase\/functions\/_shared\/pont\.ts:1\s+→ importe registre\/outils-bureau\.ts.*Chemin : components\/mal\.tsx → supabase\/functions\/_shared\/pont\.ts/],
    ['dynamique', { ...juste, 'hooks/mal.ts': "const m = () => import('@/supabase/functions/_shared/registre/capacites-bureau');" }, /hooks\/mal\.ts:1\s+→ importe registre\/capacites-bureau\.ts/],
    ['réexport', { ...juste, 'lib/mal.ts': "export { S } from '@/supabase/functions/_shared/registre/surfaces';" }, /lib\/mal\.ts:1\s+→ importe registre\/surfaces\.ts/],
    ['multi-ligne', { ...juste, 'lib/mal.ts': "import {\n  X,\n} from '@/supabase/functions/_shared/registre/outils-bureau';" }, /lib\/mal\.ts:1\s+→ importe registre\/outils-bureau\.ts/],
    ['exécuteur de l\'autre côté', { ...juste, 'app/poseur/page.tsx': "import { EB } from '@/lib/registre-exec-bureau';" }, /lib\/registre-exec-bureau\.ts\s+→ atteint depuis app\/poseur\/ .*côté bureau/],
    ['léger de l\'autre côté, transitif', { ...juste, 'components/pont.tsx': "import { OS } from '@/supabase/functions/_shared/registre/ouvreurs-leger-salarie';", 'app/admin/page.tsx': "import { P } from '@/components/pont';" }, /ouvreurs-leger-salarie\.ts\s+→ atteint depuis app\/admin\//],
  ];
  for (const [nom, sources, motif] of mal) {
    const t = verifierT8Imports(sources).join('\n');
    vrai(motif.test(t), `T8 doit signaler « ${nom} », obtenu : ${t || '(rien)'}`);
  }
  // Un commentaire ou une chaîne qui cite l'import n'est pas un import.
  egal(verifierT8Imports({ ...juste, 'lib/doc.ts': "// import { X } from '@/supabase/functions/_shared/registre/outils-bureau';\nconst s = \"import { X } from '@/supabase/functions/_shared/registre/outils-bureau'\";" }), [], 'commentaire et chaîne ignorés');
});

Deno.test('T8 hygiène (build, fixtures) : un nom d’outil de l’autre côté dans un chunk de page, __openLink en production ; un mot partagé ou un mot plus long ne déclenchent rien', () => {
  const outils = [
    ...['repondre', 'affecter_planning', 'cloturer_mois'].map((id) => ({ ...outilBase, id, cote: 'bureau', kind: 'reponse', niveau: 1 })),
    ...['repondre', 'declarer_heures'].map((id) => ({ ...outilBase, id, cote: 'salarie', kind: 'reponse', niveau: 1 })),
  ] as unknown as Outil[];
  const build = (poseur: string, admin: string, autre = ''): Build => ({
    pages: { admin: { html: '', chunks: { '/_next/static/chunks/a.js': admin } }, poseur: { html: '', chunks: { '/_next/static/chunks/p.js': poseur } } },
    tous: { '/_next/static/chunks/a.js': admin, '/_next/static/chunks/p.js': poseur, ...(autre ? { '/_next/static/chunks/x.js': autre } : {}) },
  });
  egal(nomsExclusifs(outils, 'bureau'), ['affecter_planning', 'cloturer_mois'], 'noms exclusifs du bureau (repondre est partagé)');
  egal(verifierT8Build(build('t="repondre";declarer_heures()', 'x="affecter_planning";repondre'), outils), [], 'chaque page a ses noms et le mot partagé');
  vrai(verifierT8Build(build('a="affecter_planning"', ''), outils).join('').includes('/poseur contient « affecter_planning »'), 'outil du bureau dans /poseur');
  vrai(verifierT8Build(build('', 'x={declarer_heures:1}'), outils).join('').includes('/admin contient « declarer_heures »'), 'outil du salarié dans /admin');
  vrai(verifierT8Build(build('a="affecter_planning_v2"', ''), outils).length === 0, 'un mot plus long n\'est pas le nom');
  vrai(verifierT8Build(build('', '', 'window.__openLink=f'), outils).join('').includes('window.__openLink'), '__openLink en production');
  const ouvreurs = verifierT8Build(build('o="planning.semaine"', ''), outils, { bureau: ['planning.semaine'], salarie: [] }).join('');
  vrai(ouvreurs.includes('un id d\'ouvreur du bureau'), 'id d\'ouvreur du bureau dans /poseur');
  egal(chunksDePage('<script src="/_next/static/chunks/b.js"></script>"/_next/static/chunks/app/admin/page-1.js"x"/_next/static/chunks/b.js"'), ['/_next/static/chunks/app/admin/page-1.js', '/_next/static/chunks/b.js'], 'chunks d\'une page, sans doublon');
});

Deno.test('T10 avertit (fixtures) : plus de gestionnaires ou un nouveau fichier = hausse ; moins = simple remarque ; rien = rien', () => {
  const { hausses, baisses } = verifierT10({ 'components/a.tsx': 3, 'components/b.tsx': 2 }, { 'components/a.tsx': 4, 'components/b.tsx': 1, 'components/c.tsx': 1 });
  egal(hausses.map((h) => h.split('  ')[0]), ['components/a.tsx', 'components/c.tsx'], 'a et c ont augmenté');
  vrai(hausses[1].includes('0 → 1') && hausses[0].includes('3 → 4'), 'avant → après');
  egal(baisses, ['components/b.tsx  2 → 1'], 'b a baissé');
  egal(verifierT10({ 'x.tsx': 2 }, { 'x.tsx': 2 }), { hausses: [], baisses: [] }, 'identique');
  // Le scanner compte vraiment un onClick de plus.
  const un = scannerSurfaces({ 'components/a.tsx': '<button onClick={() => 1} />' }).clics;
  const deux = scannerSurfaces({ 'components/a.tsx': '<button onClick={() => 1} />\n<a onSelect={f} />' }).clics;
  egal(verifierT10(un, deux).hausses.length, 1, 'un gestionnaire de plus est vu');
});

Deno.test('T11 navigateur (fixtures) : chaque syntaxe ou API hors cible est repérée avec sa ligne ; commentaires et chaînes de texte ne comptent pas, mais un RegExp construit oui', () => {
  const faux: [string, string, RegExp][] = [
    ['lookbehind', "const re = /(?<=a)b/;", /f\.ts:1\s+→ assertion arrière/],
    ['lookbehind négatif', "const re = /(?<!a)b/;", /assertion arrière/],
    ['lookbehind construit', "const re = new RegExp('(?<=a)b');", /assertion arrière/],
    ['at', "const x = liste.at(-1);", /f\.ts:1\s+→ Array\/String\.prototype\.at/],
    ['findLast', "\nconst x = l.findLast((v) => v);", /f\.ts:2\s+→ findLast/],
    ['findLastIndex', "const x = l.findLastIndex((v) => v);", /findLast/],
    ['hasOwn', "if (Object.hasOwn(o, 'k')) {}", /Object\.hasOwn/],
    ['replaceAll', "const s = t.replaceAll('a', 'b');", /replaceAll/],
    ['structuredClone', "const c = structuredClone(o);", /structuredClone/],
  ];
  for (const [nom, texte, motif] of faux) {
    const t = verifierSyntaxeNavigateur('f.ts', texte).join('\n');
    vrai(motif.test(t), `T11 doit signaler « ${nom} », obtenu : ${t || '(rien)'}`);
  }
  const juste = [
    "// liste.at(-1) et replaceAll sont interdits ici",
    "/* structuredClone(x) */",
    "const m = 'texte avec .at( et replaceAll( et findLast(';",
    "const a = lieu.attente(3); const b = o.hasOwnProperty('k'); const c = x.replace(/a/g, 'b');",
    "const l = /(?:a)(?=b)(?!c)/;",
    "const q = fichier.format(); const r = chat(2);",
  ].join('\n');
  egal(verifierSyntaxeNavigateur('f.ts', juste), [], 'rien de fautif');
  vrai(estFichierNavigateur('lib/openers.ts') && estFichierNavigateur('lib/use-seed-on-open.tsx') && estFichierNavigateur('lib/registre-exec-bureau.ts')
    && estFichierNavigateur('supabase/functions/_shared/registre/ouvreurs-leger-salarie.ts') && estFichierNavigateur('supabase/functions/_shared/registre/vocab.ts')
    && !estFichierNavigateur('supabase/functions/_shared/registre/outils-bureau.ts') && !estFichierNavigateur('lib/assistant.ts'), 'les fichiers contrôlés sont ceux du §2.3');
});

Deno.test('T9 cliquet (fixtures) : plafond dépassé ET plafond trop haut échouent (égalité) ; dette assignée à une livraison en ligne échoue', () => {
  const r = miniRegistre({
    capacites: [
      cap({ id: 'B1', dette: { livraison: '3c', avant: '2027-01-31', note: 'n' } }), cap({ id: 'B2', ecart: { livraison: '3a', note: 'n' } }), cap({ id: 'B3', ecart: { livraison: '3d1', note: 'n' } }),
    ],
    interne: [{ cle: 'route:/x', raison: 'y'.repeat(40) }],
  });
  egal(compteursDettes(r), { dette: 1, ecart: 2, interne: 1, ecritures_non_assistees: 0 }, 'compteurs');
  const t0 = verifierT9(r, { dette: 1, ecart: 2, interne: 1, ecritures_non_assistees: 0 }).join('\n');
  vrai(/B2\.ecart\s+assigné à la livraison 3a, déjà en ligne/.test(t0) && !/B3\.ecart/.test(t0) && !/plafond/.test(t0), `seule B2 est due :\n${t0}`);
  const haut = verifierT9(r, { dette: 1, ecart: 5, interne: 1, ecritures_non_assistees: 0 }).join('\n');
  vrai(/ecart\s+2 dans le registre pour un plafond de 5.*BAISSER dans la même PR/.test(haut), `plafond trop haut :\n${haut}`);
  const bas = verifierT9(r, { dette: 0, ecart: 2, interne: 1, ecritures_non_assistees: 0 }).join('\n');
  vrai(/dette\s+1 dans le registre pour un plafond de 0/.test(bas), `plafond dépassé :\n${bas}`);
  vrai(/ecritures_non_assistees\s+1 dans/.test(verifierT9(miniRegistre({ ecritures: [{ cle: 'rpc:x', raison: 'y'.repeat(40) }] }), { dette: 0, ecart: 0, interne: 0, ecritures_non_assistees: 0 }).join('\n')), 'écritures non assistées plafonnées');
});

// ════════════════════════════════════════════════════════════════════════════
// Bilan : la liste vivante des questions (doute_patron) et ce qui avertit
// ════════════════════════════════════════════════════════════════════════════

Deno.test('Bilan : comptes du registre, avertissements, et la liste vivante des questions au patron (doute_patron, §2.4 et §8)', () => {
  const caps = REGISTRE.capacites;
  const par = (cote: Cote) => caps.filter((c) => c.cote === cote);
  const humains = caps.filter((c) => c.humain);
  const compte = (f: (c: Capacite) => boolean) => caps.filter(f).length;
  console.log('── Registre ──');
  console.log(`Capacités : ${caps.length} (bureau ${par('bureau').length}, salarié ${par('salarie').length}) · outils : ${REGISTRE.outils.length} (bureau ${REGISTRE.outils.filter((o) => o.cote === 'bureau').length}, salarié ${REGISTRE.outils.filter((o) => o.cote === 'salarie').length}) · livraison courante ${LIVRAISON_COURANTE}`);
  console.log(`Dette ${compte((c) => !!c.dette)} · écart ${compte((c) => !!c.ecart)} · humain ${humains.length} · avec outil ${compte((c) => !!c.outil)} · interne ${REGISTRE.interne.length} · écritures non assistées ${REGISTRE.ecritures.length}`);
  const parCategorie = new Map<string, number>();
  for (const c of humains) parCategorie.set(c.humain!.categorie, (parCategorie.get(c.humain!.categorie) ?? 0) + 1);
  console.log(`Humain par catégorie : ${[...parCategorie].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  if (AVERTISSEMENTS.length) console.log(`Avertissements (${AVERTISSEMENTS.reduce((n, a) => n + a.lignes.length, 0)}) : ${AVERTISSEMENTS.map((a) => `${a.test} ×${a.lignes.length}`).join(' · ')}`);
  const doutes = humains.filter((c) => c.humain!.categorie === 'doute_patron');
  console.log(`── Questions en attente du patron (doute_patron) : ${doutes.length} ──`);
  for (const c of doutes) console.log(`${c.id} · ${c.libelle}\n    ${c.humain!.raison}`);
  if (!doutes.length) console.log('(aucune)');
});
