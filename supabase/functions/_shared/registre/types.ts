// Registre des capacités et des outils de l'assistant (étape 3, livraison 3a) :
// les TYPES. Contrat : docs/ia-etape3/00-conception-etape3.md §2.3.
//
// Aucune valeur ici, rien à l'exécution : un module de types seul, que tout le
// reste du registre importe (`import type`). TypeScript pur : ni Deno, ni React.
// Le navigateur n'importe jamais `index.ts` (README, test T8) ; ce fichier-ci ne
// pèse rien dans un chunk puisque les types sont effacés à la compilation.
//
// AUCUN import, volontairement : `tsc` suit les imports jusque dans `supabase/functions`
// (exclu du typage direct, tsconfig.json:27, mais pas de ce qu'on y importe) et le site
// compile en cible es5, que `ai-provider.ts` et ses dépendances (écrits pour Deno) ne
// passent pas. Un import de type vers eux ferait échouer `npm run typecheck`.

// ── Contrat §2.3 (mot pour mot) ─────────────────────────────────────────────

export type Cote = 'bureau' | 'salarie';
export type Genre = 'lire' | 'naviguer' | 'ouvrir' | 'guider' | 'ecrire' | 'humain';   // = champ « genre » des JSON
export type Livraison = '3a' | '3b' | '3c' | '3d1' | '3d2' | '3d3' | '3d4' | '3d5' | '3d6';
export type CategorieHumain = 'niveau3_valide' | 'droits_acces' | 'paiement' | 'securite' | 'appareil' | 'donnee_sensible' | 'hors_ecran' | 'doute_patron';

/**
 * Conditions de disponibilité d'une fonction : dix familles sont masquées sans
 * message tant que leur migration manque (02-capacites-bureau §« Disponibilité »).
 * Le §2.3 ne les nomme qu'en commentaire : les identifiants reprennent ceux de
 * 04-ouvrir-n-importe-quel-ecran §2 (`dispo` d'un ouvreur) plus `reunions` et `panier`.
 */
export type Dispo = 'taches' | 'reunions' | 'formations' | 'versions' | 'traces' | 'email' | 'borne' | 'panier' | 'chantier_termine' | 'ia';

export interface Capacite {
  id: string; cote: Cote; libelle: string;            // libellé du cahier, mot pour mot
  genre: Genre; niveau: 1 | 2 | 3;
  guides?: string[];                                  // ids GUIDE / WORKER_GUIDE ; ancres déduites de ADMIN_TOURS / WORKER_TOURS
  outil?: string;  ouvreurs?: string[];               // id d'outil (le plus engageant) ; ids d'ouvreurs (3b)
  humain?: { categorie: CategorieHumain; raison: string };            // geste final humain : aucun outil d'écriture
  dette?: { livraison: Livraison; avant: string; note: string };      // rien encore ; avant = AAAA-MM-JJ
  ecart?: { livraison: Livraison; note: string };                     // couvert en partie
  dispo?: Dispo[];       // tâches, réunions, formations, versions, traces, e-mails, borne, panier, chantier terminé
}

interface OutilBase { id: string; cote: Cote; roles: ('admin'|'worker'|'lead')[]; description: string /* français, lue par le modèle */;
  parametres: Record<string, unknown> /* format FunctionDecl.parameters actuel */; domaines: string[]; livraison: Livraison;
  pieceJointe?: boolean; /** Servi SEULEMENT si cet interrupteur est allumé (AI_ETAPE3), quelle que soit la livraison. */ interrupteur?: 'ouvrir'; dispo?: Dispo[]; proches?: string[] /* à ne pas confondre : ≥ 2 phrases d'évaluation les distinguent */;
  variantes?: { livraison: Livraison; parametres?: Record<string, unknown>; description?: string }[] /* extension d'un outil EXISTANT (nouveau paramètre) : servie seulement si l'interrupteur de sa livraison est allumé ; sinon `outilsPour` rend la déclaration gelée */ }
export type Outil =
  | (OutilBase & { kind: 'reponse'; niveau: 1 })
  | (OutilBase & { kind: 'commande'; niveau: 1; commande: 'annuler_derniere_action' })   // ne s'exécute pas via registre-exec : exempt de T4 et T6, test propre
  | (OutilBase & { kind: 'ouverture'; niveau: 1 | 3; ouvreurs: string[] })
  | (OutilBase & { kind: 'lecture'; niveau: 1; libelle: string; champs: string[]; libres: string[]; limites: { lignes: number; car: number; ms: number } })
  | (OutilBase & { kind: 'ecriture'; niveau: 2 | 3; mode: 'direct' | 'carte' | 'conditionnel'; modeActuel: 'direct' | 'carte' | 'conditionnel'; retrait?: boolean; annuler: 'oui' | 'partiel' | 'non'; champsCarte?: string[] /* paramètres dans CHAMPS_CARTE */; notifie?: boolean /* le résultat prévient un tiers */;
      executeur: string; code: string[]; carte?: { titre: string; champs: { nom: string; libelle: string; kind: 'texte' | 'date' | 'heure' | 'nombre' | 'salarie' | 'chantier' | 'choix'; requis?: boolean }[] } });

/**
 * Même forme que `FunctionDecl` d'`ai-provider.ts:224` (typage structurel : les deux se
 * remplacent l'une l'autre), redéclarée ici pour ne rien importer (voir l'en-tête).
 */
export interface FunctionDecl { name: string; description: string; parameters: Record<string, unknown> }

/**
 * Signature d'`outilsPour` (3a-2 : ce que reçoit `callFunction`). Un TYPE, pas un
 * `declare function` : en 3a-1 la fonction n'existe pas, et une déclaration sans
 * corps laisserait compiler un import qui échouerait à l'exécution ; en 3a-2 la
 * vraie fonction s'écrira `export const outilsPour: OutilsPour = …` sans conflit de nom.
 */
export type OutilsPour = (cote: Cote, o?: { fichier?: boolean; livraison?: Livraison; etat?: { ouvrir?: boolean }; coupes?: readonly string[] }) => FunctionDecl[];

// ── Ouvreurs (livraison 3b) : les écrans que l'assistant sait ouvrir, pré-remplis, sans jamais enregistrer (§3.3) ──

/** Le type d'une valeur de pré-remplissage : ce que le serveur résout (salarié, chantier, date…) et ce que le navigateur revalide. */
export type KindParam = 'salarie' | 'chantier' | 'date' | 'lundi' | 'mois' | 'heure' | 'enum' | 'texte' | 'liste_dates';
export interface ParamOuvreur { kind: KindParam; requis?: boolean; valeurs?: readonly string[]; aide: string }
export interface Ouvreur {
  /** Stable, jamais renommé : 'salarie.fiche'. */
  id: string; cote: Cote; roles: ('admin' | 'worker' | 'lead')[];
  /** Libellé du bouton (français). */
  titre: string;
  /** Une phrase claire, lue par le modèle. */
  decrit: string;
  params: Record<string, ParamOuvreur>;
  /** 3 = ouvre la confirmation ou le formulaire d'un geste qui compte : le dernier clic reste humain, jamais ouvert d'office. */
  niveau: 1 | 3;
  dispo?: Dispo;
  ecran?: 'grand' | 'petit' | 'tous';
  /** Fenêtre à saisie : jamais ouverte par-dessus une autre fenêtre à saisie (réponse « occupé »), aucune saisie perdue. */
  formulaire?: boolean;
  /** Peut s'ouvrir par-dessus une autre fenêtre (documents). */
  empile?: boolean;
  /** Modules `components/` chargés par lazyWindow / dynamic que cet ouvreur ouvre (T1 : ils existent). */
  composants?: string[];
  /** États React que l'ouvreur pose (T1 : ils existent dans la page du côté). */
  etats?: string[];
  /** Ancres data-guide qui mènent à cet écran (T1 : elles existent). */
  ancres?: string[];
  /** Anciennes actions de lien (`salaries`, `nouveau_client`, `salarie:`…) : les chats gardés 30 jours en contiennent encore. */
  alias?: string[];
  /** Niveau 3 seulement : expression (sur la demande normalisée de la personne) qui doit s'y trouver. Une donnée du prompt (nom de chantier, texte d'un PDF) ne peut pas ouvrir un écran que la personne n'a pas évoqué. */
  declencheur?: string;
}
/** La forme LÉGÈRE (module GÉNÉRÉ, lu par le navigateur) : ids, rôles, paramètres typés, drapeaux. Jamais de texte lu par le modèle. */
export interface OuvreurLeger {
  id: string; roles: readonly ('admin' | 'worker' | 'lead')[]; niveau: 1 | 3; dispo?: Dispo; ecran?: 'grand' | 'petit' | 'tous'; formulaire?: boolean; empile?: boolean;
  params: Readonly<Record<string, { kind: KindParam; valeurs?: readonly string[] }>>;
}

// ── Surfaces : ce que parcourt le test de couverture (§2.3, tableau « Clés de surface ») ──

/** Les opérations d'écriture d'une table que le scanner repère (`.from('t')` suivi de …). */
export type OperationTable = 'insert' | 'update' | 'delete' | 'upsert';

/**
 * Une clé de surface = une entrée de l'interface ou du code qu'une capacité doit
 * couvrir (ou que `interne.ts` classe avec une raison). Le préfixe dit de quoi
 * il s'agit ; ce qui suit est le nom brut trouvé par le scanner.
 *   fenetre:<module> · dialogue:<fichier>#<expr> · rpc:<nom> · fn:<nom> ·
 *   table:<t>:<op> (`<t>` vaut `?` pour un `.from(variable)`, que T1 refuse) ·
 *   ecriture:<fichier>#<fn> · ancre:<valeur> · nav:<côté>:<clé> ·
 *   guide:<côté>:<id> · route:<chemin>
 */
export type CleSurface =
  | `fenetre:${string}`
  | `dialogue:${string}`
  | `rpc:${string}`
  | `fn:${string}`
  | `table:${string}:${OperationTable}`
  | `ecriture:${string}`
  | `ancre:${string}`
  | `nav:${Cote}:${string}`
  | `guide:${Cote}:${string}`
  | `route:${string}`;

/**
 * Une entrée de `interne.ts` : ce qui n'est PAS une capacité (menu ☰, légende,
 * bandeau, route publique…) et la raison, d'au moins 30 caractères (T3).
 * Jamais une clé d'écriture (`rpc:`, `fn:`, `table:*:insert|update|delete|upsert`) :
 * celles-là vont dans la liste séparée des écritures non assistées (T1, T9).
 */
export interface EntreeInterne { cle: CleSurface; raison: string }

// ── Dettes : plafond généré, vérifié à l'égalité (T9) ───────────────────────

/** Les quatre compteurs que `dettes.json` fige ; fermer une dette baisse le plafond dans la même PR. */
export interface DettesMax { dette: number; ecart: number; interne: number; ecritures_non_assistees: number }
/** Forme de `registre/dettes.json` (fichier généré, jamais édité à la main). */
export interface FichierDettes { max: DettesMax }

// ── Instantanés versionnés ──────────────────────────────────────────────────

/** `ids.snapshot.json` : tous les ids de capacités déjà publiés (T3 : aucun ne disparaît, aucun n'est réutilisé). */
export type IdsSnapshot = string[];
/** `clics.snapshot.json` : fichier d'interface → nombre de gestionnaires `onClick` / `onSelect` / `onSubmit` (T10). */
export type ClicsSnapshot = Record<string, number>;
