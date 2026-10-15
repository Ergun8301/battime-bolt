# 00 · Conception de l'étape 3 : registre, ouvrir, lire, écrire

Écrit le 15 octobre 2026 sur le commit db25703 (code lu, rien modifié). Cadre : `docs/ia-vision.md` §2-3, §7, §9. Sources : `01`…`04`, `capacites-*.json`, `ia-v2.md`, `design-brief/fonctions-*.md`. Toute affirmation clé a été revérifiée dans le code (§0.2). Sigles : AC = `supabase/functions/_shared/assistant-actions-core.ts` · WC = `…/worker-assistant-core.ts` · PROV = `…/ai-provider.ts` · ANT = `…/ai-anthropic.ts` · IB / IS = `supabase/functions/assistant|worker-assistant/index.ts` · AP = `components/admin-planning.tsx` · PP = `app/poseur/page.tsx` · PD = `components/poseur-day.tsx`. « à vérifier » = non prouvé par le dépôt.

## 0. Lecture rapide

### 0.1 Quatre livraisons, mises en ligne une par une

| | Quoi | Effet pour l'utilisateur | Interrupteur / retour arrière | Dépend de | Effort (agents-h) |
|---|---|---|---|---|---|
| **3a** | Registre (243 capacités, ≈ 120 outils à terme) + test de couverture + job CI + mesure de référence | aucun (empreintes SHA-256 identiques) | tests seuls (3a-1) ; 3a-2 : redéployer la version précédente | rien | 28-35 |
| **3b** | Ouvrir n'importe quel écran, pré-rempli (53 ouvreurs, outil `ouvrir_fenetre`) | nouveau, niveau 1 | `AI_ETAPE3.ouvrir` | 3a | 46-58 |
| **3c** | Lecture à la demande (≈ 25 outils) + boucle d'outils + cache + repli | nouveau chemin de réponse | `AI_ETAPE3.boucle` + disjoncteur | 3a (3b pour ouvrir depuis la boucle) | 95-115 |
| **3d** | Écritures niveau 2 (« Annuler » généralisé), puis dernier clic niveau 3 (6 sous-livraisons) | nouveaux outils | `AI_ETAPE3.ecritures`, `modes`, `outils_coupes` | 3d-1 : 3a ; le reste : 3c, et 3b pour 3d-3 / 3d-4 | 158-204 |

Total ≈ 330-410 agents-heures (une heure d'un agent seul, relecture et tests compris ; hors attente du patron et du vrai modèle). Ordre et parallélisme : §6.

### 0.2 Ce qui a été revérifié, et ce qui corrige ou complète les documents 01-04
- **La CI ne lance aucun test.** `.github/workflows/ci.yml` = typecheck + build + budgets, pour les PR vers `main` seulement (ci.yml:6, 26-35) ; les 122 scripts `test:*` (48 Deno, 64 Node, 10 SQL) se lancent à la main. « Lancé avec les autres » (vision §7.2) n'existe donc pas encore : 3a ajoute le job.
- **Marge de poids** : `/admin` pèse 353 kB pour un budget de 363 (`scripts/bundle-budgets.json:22-25`) : la part « navigateur » du registre doit rester ≤ 3 kB compressés.
- **`AI_CONFIG` ne peut pas porter l'interrupteur** : une clé inconnue donne « champ inconnu » puis TOUT Gemini en formule essai (PROV:141, 178-188). Confirmé (03 §6.2).
- **Surface à couvrir, mesurée le 15/10** : 22 modules `lazyWindow` + 7 `dynamic`, 55 `open={…}` JSX, 49 RPC, 10 fonctions Edge, 42 couples table×opération (21 tables), 26 pages, 129 ancres `data-guide` (fonction `anchors()` d'`admin-tours.test.ts:40-50`, sur `app/` + `components/` ; 01 en compte 118 littéraux d'attribut). **121 de ces 129 ancres sont déjà citées par un parcours** (il en reste 8 à classer : `bureau-nav.menu`, `journee.assistant`, 6 de `support-console.*`) ; 2 ancres sont construites par expression (`menu.semaine`, `menu.historique`). Seuls 2 fichiers se nomment `lib/*-writes.ts` ; 24 fichiers de `lib/` (dont ces 2) et 13 de `components/`+`app/` contiennent un `.insert/.update/.delete/.upsert` (dont quelques-uns ne sont pas des écritures de base) : le test vise RPC, table, fonction, pas un nom de fichier.
- **Comptes confirmés** : 33 + 18 outils (+ `repondre` ×2 = 34 + 19 déclarations), 11 / 9 liens de navigation, 50 / 25 fiches, 48 / 23 parcours, 126 cas (`eval.test.ts:447`), 5 outils bureau sans aucun cas (`corriger_pointage`, `attribuer_client`, `modifier_salarie`, `cout_reel`, `modifier_habilitation`), 17 outils bureau « carte » sans `undo` (lib/assistant-actions.ts:129-479). Périmé : « 45 fiches » (ia-v2.md:268) → 50.
- **Les JSON de capacités** (138 + 105, genres et niveaux recomptés) ne contiennent aucune clé de code et, côté bureau, aucun champ d'état exploitable : remplir `SURFACES` est un vrai travail (§2.4), pas un import.
- **Le niveau 3 des JSON** mêle le validé (liste du 14/10) et des « doutes » (46 bureau, 20 salarié) : les doutes deviennent des défauts (§7) et, s'ils sont de vraies décisions de produit, des questions (§8).
- **Les coûts de 03** sont calculés (3,7 car./jeton, ±15 %), pas mesurés : budget de pilote, pas garantie.
- **Oubli comblé** : la vision demande « plusieurs actions d'une seule phrase, une seule fiche » (§2) ; seul le salarié long le fait (`buildLongReply`) : prévu en 3d-6.
- **Risque de calendrier** : le nouveau design du bureau (tâche n°70, intégration salarié puis bureau) remaniera AP (5 032 lignes). Le registre est donc en deux couches (§1.1) ; ne pas démarrer les vagues 3 de 3b côté bureau pendant cette intégration (à coordonner).

## 1. Règles communes

### 1.1 Où vit le registre
- **Un dossier, `supabase/functions/_shared/registre/`** : TypeScript pur (ni Deno, ni React ; imports relatifs en `.ts`). Seul endroit lisible à la fois par le navigateur (`@/supabase/functions/_shared/…`, précédent `lib/assistant.ts:13`, `admin-tours.ts:1-3`), les fonctions Edge et les tests Deno ; `tsconfig.json:27` l'exclut du typage direct mais `tsc` le suit par import.
- **Deux couches.** *Stable* : `capacites-bureau.ts` (B1…B138), `capacites-salarie.ts` (S1…S105), `outils-*.ts`, `ouvreurs.ts`, phrases d'évaluation. *Volatile* : `surfaces.ts` (capacité → clés de code), `interne.ts`, `lib/openers.ts`. Un redesign ne doit toucher que la couche volatile.
- **Léger / lourd.** Le navigateur n'importe que `ouvreurs-leger.ts` (ids, rôles, paramètres, `dispo`, `ecran`). Les textes lus par le modèle (`capacites-*`, `outils-*`) ne sont jamais importés par `app/` ni `components/` (test T8).
- Ids jamais renumérotés ni réutilisés ; nouveaux : B139+, S106+ ; noms d'outils `^[a-z_]{3,40}$` (CHECK de `assistant_journal.action`, migration 20261001090000:19). Ne pas toucher aux titres de `docs/ia-v2.md` (lus par `ai-config.test.ts:486-500`).

### 1.2 Les trois niveaux de la vision, traduits en règles vérifiables

| Niveau | Type d'outil | Règle (testée) |
|---|---|---|
| 1 libre | `reponse`, `lecture`, `ouverture` | n'écrit rien ; une ouverture ne clique jamais « Enregistrer », « Envoyer », « Clôturer » ; pré-remplir = poser des valeurs que la personne peut changer |
| 2 fait + Annuler | `ecriture`, `mode:'direct'` | `annuler` ∈ {oui, partiel} ; exécuté par la fonction `lib/` que l'écran appelle ; journalisé ; « Annuler » = inverse exact |
| 3 carte | `ecriture`, `mode:'carte'` | rien n'est écrit avant « Confirmer » ; « Annuler » si possible |
| 3 fenêtre | `ouverture` de niveau 3 + lectures | l'assistant lit (« 12 lignes seraient verrouillées »), ouvre la vraie fenêtre pré-remplie, la personne fait le clic ; jamais ouverte d'office |
| réservé | `humain {categorie, raison}` | aucun outil n'écrit ; l'assistant guide ou ouvre |

Règle d'or : **pas d'« Annuler » exact ⇒ jamais niveau 2 ⇒ carte** (message déjà parti, droits d'accès, nouveau chantier du salarié). Le serveur envoie `action.mode` ; l'écran le suit s'il est présent, sinon `actionMode(draft)` (AC:527), plus strict.

### 1.3 Interrupteur, compatibilité, ordre de mise en ligne
- **Secret neuf `AI_ETAPE3`**, jamais dans `AI_CONFIG`. Lu par `_shared/etape3-config.ts` : `etat(env, fonction, cote, companyId): boolean` ; absent, illisible ou inconnu = tout éteint = comportement d'aujourd'hui, sans jamais lever.
```json
{ "ouvrir": {"bureau":"off","salarie":"off"}, "boucle": {"bureau":"off","salarie":"off"},
  "ecritures": {"bureau":"off","salarie":"off","modes":"actuel"},
  "pilote": ["<uuid entreprise>"], "pct": 0, "outils_coupes": ["copier_intervention"] }
```
  Valeurs `off | pilote | pct | on` ; `pilote` = entreprises listées ; `pct` = FNV-1a de `companyId` modulo 100 (stable par entreprise, pas par demande) ; `modes:"actuel"` = chaque outil garde son mode d'aujourd'hui (les nouveaux outils d'écriture sont des cartes), `"cible"` = les modes du registre (niveau 2 = fait + « Annuler ») ; `outils_coupes` retire un outil par son id (arrêt d'urgence sans redéployer).
- **Négociation** : l'écran ajoute `caps:['ouvrir1','mode1','etat1']` au corps (précédent `multi:true`, ia-v2.md:353) ; le serveur n'émet un lien `ouvrir:`, un `action.mode` ou un événement `etat` que si la capacité est annoncée : un onglet resté ouvert avec l'ancien code ne casse pas.
- **Ordre** : migration éventuelle (requête de vérification en tête du fichier) → front → fonctions avec interrupteur éteint (prompt et outils identiques : SHA-256) → secret en `pilote` → mesure → `pct` 10 → 50 → 100. Fonctions déployées ensemble : `assistant`, `worker-assistant`, `assistant-eval`. Retour arrière : secret, puis redéploiement du commit précédent ; front : déploiement précédent.

### 1.4 Mesure (identique pour toutes les livraisons)
- Banc `assistant-eval` (126 cas, 21 catégories), `prodPath:true`, 3 passes, ≤ 4 ids par appel (≤ 12 à 1 passe ; ia-v2.md:394). Il accepte `etape3` (comme `aiConfig`, même parseur, 400 si invalide) pour comparer le **bras A** (tout éteint) au **bras B** sans toucher la production.
- **Seuil** : ≥ 90 % des essais par catégorie, bureau et salarié, FR et TR comptés à part ; toute nouvelle catégorie compte ≥ 10 cas ; aucun cas en échec 3/3 ; aucune catégorie existante sous sa valeur de référence (3a). `run.ts` marque les catégories < 90 %.
- Taille du jeu : 126 (aujourd'hui) → ≈ 156 (3a) → ≈ 256 (3b) → ≈ 342 (3c) → ≈ 490 (3d). Une passe complète en fin d'étape (≈ 490 cas × 3) : ≈ 45 $ et ≈ 1 h 40, hypothèse de 0,03 $ et 4 s par cas, à mesurer. La mesure du banc exige le secret `x-cron-secret` et la clé Anthropic (hors dépôt).
- Les contrôles du banc (`act('x')`, `fiche([…])`) sont lus comme du texte par `tool-domains.test.ts:13-35` : tout nouveau contrôle (`ouvre(id)`, `lit(outil)`, `repondAvec([…])`) doit y être appris ; `expectedTools` devient un module partagé.

### 1.5 Tests existants qui figent du texte ou du code : à faire évoluer exprès, jamais à contourner
`admin-tours.test.ts:410-416` (SHA-256 de `guideForPrompt`, 11 200 octets) · `admin-tours.test.ts:429` (source entre `ASSISTANT_FUNCTIONS` et `ATTACHMENT_ACTIONS`) · `ai-config.test.ts:437-451` (un seul `createClient`, `statut` avant le quota, corps exact du `statut`) · `ai-config.test.ts:486-500` (titres et blocs de `docs/ia-v2.md`) · `assistant-history.test.ts:603-616` (aucun `console.*` sauf « erreur interne » ; un seul `loadAssistantContext(`, `tierFor(!!att.file)`, `if (iaOk) … historique =`) · `tool-domains.test.ts` (chaque outil dans un domaine ; `cases.ts` lu comme du texte) · `eval.test.ts:447` (126 cas). Toute branche ajoutée dans IB / IS (boucle, `caps`) doit les laisser vrais.

## 2. Livraison 3a : registre et test de couverture (aucun changement de comportement)

Correspondance avec la vision §7 : (1) registre d'actions → `registre/` ; (2) test de couverture qui échoue → `registre-couverture.test.ts` + job CI ; (3) évaluation réelle → mesure de référence ici, seuils à chaque livraison.

### 2.1 Périmètre
- **3a-1** : données du registre, scanner de l'interface, test `npm run test:couverture` (T1-T10), job CI, modèle de PR, mesure de référence. **Ni `assistant`, ni `worker-assistant`, ni le front ne sont modifiés** (seuls changent le dépôt de tests, la CI et le jeu d'évaluation).
- **3a-2** : les listes écrites à la main deviennent générées, octet pour octet : `ACTION_TYPES` (AC:371), `REMOVAL_TYPES` (AC:511), `ATTACHMENT_ACTIONS` (AC:1650), `WORKER_REMOVAL_TYPES` (WC:612), `WORKER_ATTACHMENT_ACTIONS` (WC:1100), les listes `tools` des domaines (`tool-domains.ts`), puis `ASSISTANT_FUNCTIONS` (AC:1416) et `WORKER_FUNCTIONS` (WC:1051), mêmes objets et même ordre. Restent à la main : `ActionDraft`, `prepare` (AC:1006), `checkAction` (AC:808), `summarize` (AC:1359), `actionMode` ; T5 les compare au registre. Indispensable avant 3b : l'enum d'`ouvrir_fenetre` est générée.

### 2.2 Fichiers touchés
Nouveaux : `_shared/registre/{types,capacites-bureau,capacites-salarie,surfaces,interne,outils-bureau,outils-salarie,config,index}.ts` · `registre/vocab.ts` (vocabulaires fermés lus par les déclarations : `NAV_ACTIONS`, `WORKER_NAV`, `ABSENCE_KINDS`, `LEAVE_KINDS`, `DOC_CATEGORIES`, déplacés pour éviter un import circulaire ; AC et WC les ré-exportent) · `registre/{ids,clics}.snapshot.json` · `_shared/registre-surfaces.ts` (scanner pur : prend `{chemin: texte}`) · `registre-surfaces.test.ts` · `registre-couverture.test.ts` · `scripts/registre-import.mjs` (une fois) · `scripts/tests/registre-mutations.mjs` · `.github/pull_request_template.md`.
Modifiés : `package.json` (`test:couverture`, `test:registre`) · `ci.yml` (job Deno `denoland/setup-deno`, PR vers `main` et `integration`) · `assistant-eval/cases.ts` (+≈ 30) et `eval.test.ts:447` · `assistant-eval/run.ts` (marque < 90 %). 3a-2 seulement : AC, WC, `tool-domains.ts`, `admin-tours.test.ts:429` (lit le source entre `export const ASSISTANT_FUNCTIONS` et `export const ATTACHMENT_ACTIONS` : à réécrire exprès).

### 2.3 Contrat d'interface (types exacts)
```ts
export type Cote = 'bureau' | 'salarie';
export type Genre = 'lire' | 'naviguer' | 'ouvrir' | 'guider' | 'ecrire' | 'humain';   // = champ « genre » des JSON
export type Livraison = '3a' | '3b' | '3c' | '3d1' | '3d2' | '3d3' | '3d4' | '3d5' | '3d6';
export type CategorieHumain = 'niveau3_valide' | 'droits_acces' | 'paiement' | 'securite' | 'appareil' | 'donnee_sensible' | 'hors_ecran' | 'doute_patron';
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
export const SURFACES: Record<string, string[]> = { B31: ['rpc:set_user_role', 'ecriture:lib/admin-writes#setUserRole'] /* … */ };
interface OutilBase { id: string; cote: Cote; roles: ('admin'|'worker'|'lead')[]; description: string /* français, lue par le modèle */;
  parametres: Record<string, unknown> /* format FunctionDecl.parameters actuel */; domaines: string[]; livraison: Livraison;
  pieceJointe?: boolean; dispo?: Dispo[]; proches?: string[] /* à ne pas confondre : ≥ 2 phrases d'évaluation les distinguent */ }
export type Outil =
  | (OutilBase & { kind: 'reponse'; niveau: 1 })
  | (OutilBase & { kind: 'ouverture'; niveau: 1 | 3; ouvreurs: string[] })
  | (OutilBase & { kind: 'lecture'; niveau: 1; libelle: string; champs: string[]; libres: string[]; limites: { lignes: number; car: number; ms: number } })
  | (OutilBase & { kind: 'ecriture'; niveau: 2 | 3; mode: 'direct' | 'carte' | 'conditionnel'; modeActuel: 'direct' | 'carte' | 'conditionnel'; retrait?: boolean; annuler: 'oui' | 'partiel' | 'non';
      executeur: string; code: string[]; carte?: { titre: string; champs: { nom: string; libelle: string; kind: 'texte' | 'date' | 'heure' | 'nombre' | 'salarie' | 'chantier' | 'choix'; requis?: boolean }[] } });
export declare function outilsPour(cote: Cote, o?: { fichier?: boolean; livraison?: Livraison }): FunctionDecl[];   // 3a-2 : ce que reçoit callFunction
```
`config.ts` : `LIVRAISON_COURANTE`, `DETTES_MAX`, `HORIZON_DETTES = '2027-03-31'`. `interne.ts` : `{cle, raison}[]` pour ce qui n'est pas une capacité (menus ☰, légende, bandeaux, routes publiques).

**Clés de surface** (ce que parcourt le test) :

| Clé | Désigne | Trouvée par |
|---|---|---|
| `fenetre:<module>` | module de `components/` chargé par `lazyWindow(() => import('@/components/…'))` ou `dynamic(…)` | expression régulière ; 22 + 7 |
| `dialogue:<fichier>#<expr>` | `<Dialog>`, `<AlertDialog>`, `<Sheet>`, `<Popover>` ou `<DropdownMenu>` avec `open={expr}`, hors modules fenêtres et hors `components/ui/` | idem ; ≈ 35 sur 55 |
| `rpc:<nom>` · `fn:<nom>` · `table:<t>:<op>` | `.rpc('x')` · `functions.invoke('f')` · `.from('t')` suivi de `.insert`, `.update`, `.delete` ou `.upsert`, dans `app/`, `components/`, `lib/` | idem ; 49 · 10 · 42 ; un `.from(variable)` ressort en `table:?` |
| `ecriture:<fichier>#<fn>` | chaque export d'un module de `lib/` dont le corps écrit ou appelle `.rpc(` | tranche entre deux `export` ; les 2 fichiers `*-writes.ts` (32 fonctions exportées, lectures comprises) et les 22 autres modules de `lib/` qui écrivent |
| `ancre:<valeur>` | `data-guide` | `anchors()` : 129 ; couverte si un parcours la cite et si ce parcours est dans `guides` d'une capacité |
| `nav:<côté>:<clé>` · `guide:<côté>:<id>` | `NAV_ACTIONS` (11), `WORKER_NAV` (9), `GUIDE` (50), `WORKER_GUIDE` (25), `lien` de chaque fiche | import direct |
| `route:<chemin>` | `app/**/page.tsx` | parcours de dossier ; 26 |

**Tests du registre** (`registre-couverture.test.ts`) :

| | Échoue quand… |
|---|---|
| T1 couverture | une clé du code n'est dans aucun `SURFACES`, aucun `ouvreurs[*].composants/etats`, ni `interne.ts`. Message : clé, `fichier:ligne`, ligne à coller |
| T2 périmé | une clé déclarée n'existe plus (renommer un RPC, une ancre ou une fenêtre casse le test) |
| T3 forme | id en double ou disparu (`ids.snapshot`) ; capacité sans `outil` ni `ouvreurs` ni `humain` ni `dette` ; `raison` < 30 caractères ou catégorie inconnue ; `dette.avant` passée ou après `HORIZON_DETTES` |
| T4 niveaux | règles de §1.2 (niveau 2 ⇒ `annuler` ≠ `non` ; capacité `humain` ⇒ outil jamais `ecriture`) |
| T5 cohérence | outils, `ACTION_TYPES`, `REMOVAL_TYPES`, `ATTACHMENT_ACTIONS`, domaines, `NAV_ACTIONS`, `WORKER_NAV`, `actionMode` ≠ registre ; après 3a-2 : listes générées ≠ empreinte gelée |
| T6 liaison | outil `ecriture` sans clé dans `lib/registre-exec.ts` ou sans `default` qui lève ; lecture sans `_shared/lectures/<id>.ts` ; ouvreur sans clé littérale dans `registerOpeners({…})` |
| T7 évaluation | outil ou ouvreur livré (livraison ≤ `LIVRAISON_COURANTE`) sans cas attendu dans `cases.ts` ; paire `proches` sans 2 phrases distinctives |
| T8 hygiène | `app/` ou `components/` importe `registre/capacites*` ou `registre/outils*` |
| T9 cliquet | `dette` + `ecart` > `DETTES_MAX`, ou une assignée à une livraison ≤ `LIVRAISON_COURANTE` |
| T10 avertit | le nombre de gestionnaires `onClick` / `onSelect` / `onSubmit` d'un fichier d'interface a augmenté depuis `clics.snapshot` (le « bouton neuf sur écriture existante » que T1 ne voit pas). Non bloquant, bloquant une fois le redesign intégré |

Exemple de sortie en échec : `T1 couverture : 2 entrées d'interface sans capacité` / `rpc:set_foo components/worker-detail.tsx:812 → ajoutez-la à SURFACES (capacité B…) ou, si ce n'est pas une capacité, à registre/interne.ts avec sa raison` / `ancre:bureau-fiche.nouveau components/worker-detail.tsx:990 → …`.

### 2.4 Remplir le registre à partir des JSON
`scripts/registre-import.mjs` (une fois, Node) lit `capacites-bureau.json` et `capacites-salarie.json` et écrit `capacites-*.ts` :
- `id`, `libelle`, `genre`, `niveau` : tels quels. `actions_existantes` : nom d'outil → `outil` ; `NAV_ACTION:k` / `WORKER_NAV:k` → clé `nav:…` ; `guide:g` → `guides` ; `instantane:*`, `local:*`, `multi` → ignorés (comportement, pas code).
- `exposition` « PARTIEL — » → `ecart` ; « À CRÉER » ou outil proposé inexistant → `dette` (livraison selon le genre : lire → 3c, ouvrir/naviguer → 3b, écrire → sous-livraison de §5.1, date selon §6) ; `genre:humain` + `raison_humaine` → `humain` (catégorie proposée par mots-clés, revue à la main).
- `verifie_dans` sert une fois à proposer des `SURFACES` (RPC, table, fonction dans ±15 lignes), puis n'est pas conservé : les numéros de ligne pourrissent.
- Le reste est **piloté par le test** : lancer T1, lire les ≈ 330 clés sans capacité, les affecter (ou les classer `interne` avec raison), relancer. Les surfaces absentes des cahiers créent B139+/S106+ (console support, vidéos orphelines…).
- Départ attendu d'après 02 : ≈ 83 `dette`, ≈ 92 `ecart`, ≈ 45 couvertes, ≈ 23 `humain`. `DETTES_MAX` est figé à ce total et ne fait que baisser.

**Règle « réservé à l'humain + raison »** : une capacité `humain` dit pourquoi, dans une catégorie fermée (`niveau3_valide` = liste du 14/10 ; `droits_acces`, `paiement`, `securite`, `appareil`, `donnee_sensible` = vision §4 ; `hors_ecran` ; `doute_patron` = niveau 3 par défaut en attente du patron). Les `doute_patron` sont imprimés par le test : c'est la liste vivante des questions (§8). Un geste que seul l'humain fait peut quand même avoir un outil de lecture ou d'ouverture (ex. `export.equipe`).

**Comment un NOUVEAU bouton oblige à toucher le registre**

| Le développeur ajoute… | Le test voit… | Il doit… |
|---|---|---|
| un `supabase.rpc`, `.from().update()`, `functions.invoke` | `rpc:x`, `table:t:op`, `fn:f` (T1) | rattacher la clé à une capacité (nouvelle ligne B139+) : `outil`, `humain` + raison, ou `dette` datée (et monter `DETTES_MAX`, visible en revue) |
| une fenêtre (`lazyWindow`, `dynamic`, `<Dialog open=…>`) | `fenetre:x`, `dialogue:…` (T1) | idem, genre `ouvrir` |
| un `data-guide` | `ancre:…` (T1) | l'entourer par un parcours ou la classer `interne` |
| un export dans un module d'écriture de `lib/` | `ecriture:…` (T1) | idem |
| un renommage ou retrait | clé introuvable (T2) | mettre `surfaces.ts` à jour |
| un bouton qui réutilise une écriture existante | **rien** (limite du test) | case « registre » du modèle de PR |

Limites dites : le test lit des noms et des formes, pas le sens ; il ne voit ni un bouton neuf sur une écriture existante (T10 le signale seulement), ni un calcul purement local (génération du PDF d'export, `runExport`). Une écriture construite dynamiquement ressort en `table:?`.

### 2.5 Tests, évaluation, sortie
- **Tests à écrire** : T1-T10 ; `registre-surfaces.test.ts` (chaque expression régulière sur des sources de poche, positifs et négatifs : `lazyWindow<Props>(`, `.from(x)`, commentaires) ; idempotence de l'import ; `scripts/tests/registre-mutations.mjs` (copie temporaire du dépôt, applique 4 mutations, exige l'échec de la bonne assertion : RPC fantôme dans un composant → T1 ; ancre renommée → T2 ; `raison` vidée → T3 ; `outil` renommé → T5).
- **Évaluation (+≈ 30 cas)** : 3 cas pour chacun des 5 outils bureau sans cas (le bulletin de `cout_reel` exige une pièce de test), ≥ 10 cas turcs côté bureau (outils existants : aucun aujourd'hui), « Réserves » salarié porté de 1 à 5. Pas de seuil en 3a : toute catégorie sous 90 % est inscrite comme travail de 3d. **Mesure de référence** : ≈ 156 cas × 3 passes sur le chemin actuel, score par catégorie consigné dans `docs/ia-etape3/mesures.md` : c'est le bras A de toute la suite (aucun score complet n'est dans le dépôt).
- **Critères de sortie 3a** : (1) `npm run test:couverture` vert, `DETTES_MAX` renseigné ; (2) les 4 mutations échouent comme prévu ; (3) le job CI s'exécute sur une PR de test vers `main` et vers `integration` ; (4) 3a-2 : empreintes SHA-256 de `actionPrompt(…)` et de `JSON.stringify(functionsFor(…))` identiques avant / après sur les 126 cas, 0 écart ; (5) les 15 fichiers de test de la couche IA (01 §2.5) et `test:assistant-historique-serveur` restent verts ; (6) `npm run budget` inchangé à ±0,5 kB ; (7) mesure de référence consignée.
- **Risques** : faux positifs du scanner (chaque exception coûte une ligne avec raison dans `interne.ts`) ; blocage d'une PR sans rapport (le message donne la ligne à coller) ; déplacer les déclarations (3a-2) peut casser des tests qui lisent le source (`admin-tours.test.ts:429`, `ai-config.test.ts:437-451`) : à faire évoluer exprès. **Retour arrière** : 3a-1 = `git revert` (aucun effet en production) ; 3a-2 = redéployer les fonctions du commit précédent.
- **Mise en ligne** : 3a-1 ne se déploie pas (dépôt et CI). 3a-2 : aucune migration, front inchangé, puis `assistant`, `worker-assistant`, `assistant-eval` ensemble après preuve SHA.
- **Effort 28-35** : scanner + T1-T10 + tests du scanner 7 · remplissage des ≈ 330 clés 8 · T5/T6 et cohérence avec l'existant 3 · CI, modèle de PR, mutations 2 · 3a-2 6 · +30 cas et mesure 3 · revue 2.

## 3. Livraison 3b : ouvrir n'importe quel écran (niveau 1)

### 3.1 Périmètre
Ouvrir toute page, fenêtre ou formulaire, avec paramètres et pré-remplissage, sans jamais enregistrer. **53 ouvreurs** (35 bureau, 18 salarié ; tables de `04` §1.2-1.3, comptes recomptés), en vagues : (1) sans paramètre ; (2) paramètres déjà portés par des états (semaine, fiche, export, absence…) ; (3) props `init` sur ≈ 12 composants à état interne (`WorkerDetail`, `CostReport`, `CompanySettings`, `PrintMenu`, `LeaveRequestDialog`, `StaffEmailDialog`, `PoseurWeek`, `PoseurMonth`, `TeamStats`…) ; (4) la journée du salarié (`jour.ligne_nouvelle`, `jour.envoyer`…), sur le modèle `afterScanPending` (PD:475) ; (5) le guide pas à pas appelle lui aussi `openLink`. Conséquences : les trois aiguillages recopiés (`onNavigate` AP:4371 et PP:657, `tourStep` AP:3242 et PP:406, props du menu ☰ AP:4189) deviennent un seul `openLink` ; trois fiches fausses corrigées (`telecharger` répond à « imprimer » par l'export, `archiver_client` à « chantier terminé », `borne` mène au planning) ; `notifications` sort de la navigation (geste d'appareil, PP:663) ; `STATIC_ACTIONS`, `sanitizeAnswer`, `assistantPrompt` (code mort, seuls `assistant.test.ts` les appelle) sont retirés.

| Vague | Ouvreurs (id) |
|---|---|
| 1 sans paramètre | bureau : `salaries.liste`, `salaries.importer`, `clients.importer`, `reserves.registre`, `conges.demandes`, `stats.equipe`, `planning.supprimees`, `planning.versions`, `formations.gestion`, `abonnement.choisir`, `relances.liste`, `planning.selection`, `borne.gestion`, `clients.liste` · salarié : `jour.date`, `historique.supprimees`, `formations.ouvrir` |
| 2 paramètres déjà en états | `planning.semaine`, `salarie.fiche` (sans période), `client.fiche`, `chantier.documents`, `client.nouveau`, `salarie.nouveau`, `export.equipe` (période), `cloture.mois`, `planning.ajouter`, `salarie.statut`, `absence.poser`, `export.salarie` |
| 3 props `init` | `salarie.fiche` (période), `couts.chantiers`, `reglages.entreprise` (rubrique), `planning.imprimer`, `email.groupe`, `invitations.liste`, `chantier.termine`, `planning.intervention`, `planning.copier`, `heures.attribuer` · salarié : `semaine.ouvrir`, `mois.ouvrir`, `conges.demande`, `reserves.liste` |
| 4 journée du salarié | `jour.ligne_nouvelle`, `jour.ligne`, `jour.documents`, `jour.dupliquer`, `jour.envoyer`, `equipe.jour` |
| 5 fin | `tourStep` (AP:3242, PP:406) appelle `openLink` et les doublons disparaissent ; T1 sur les vocabulaires de navigation passe de « avertit » à « échoue » |

Déjà ouvrables aujourd'hui, repris en alias : bureau `salaries`, `nouveau_salarie`, `nouveau_client`, `import_clients`, `conges`, `couts`, `reserves`, `export`, `reglages`, `planning`, `clients`, `salarie:<id>` ; salarié `journee`, `semaine`, `mois`, `historique`, `conges`, `infos`, `borne` (lecteur), `photo` (sélecteur).

### 3.2 Fichiers touchés
Nouveaux : `registre/ouvreurs.ts`, `ouvreurs-leger.ts` · `_shared/ouvrir.ts` (`ouvrirDepuisAppel`, pur) · `lib/openers.ts` · `lib/use-seed-on-open.ts`. Modifiés : AC, WC (outil, consigne, `fromFunctionCall`) · `tool-domains.ts` (`ouvrir_fenetre` toujours présent, comme `repondre`, et `tool-domains.test.ts:36-46` adapté) · AP, PP, PD · ≈ 12 fenêtres (`init` facultatif : sans lui le composant est identique à l'octet près) · `assistant-panel.tsx` (`go()`, bouton d'un lien `ouvrir:`) · `lib/assistant.ts`, `lib/worker-assistant.ts` (`caps`) · `GUIDE` / `WORKER_GUIDE` (`lien` vers un ouvreur).

### 3.3 Contrat d'interface
```ts
export interface Ouvreur { id: string; cote: Cote; roles: ('admin'|'worker'|'lead')[]; titre: string; decrit: string;
  params: Record<string, { kind: 'salarie'|'chantier'|'date'|'lundi'|'mois'|'enum'|'texte'|'liste_dates'; requis?: boolean; valeurs?: string[]; aide: string }>;
  niveau: 1 | 3;  dispo?: Dispo;  ecran?: 'grand' | 'petit' | 'tous';  formulaire?: boolean;  empile?: boolean;
  composants?: string[];  etats?: string[];  ancres?: string[];  alias?: string[] }
// navigateur : lib/openers.ts
registerOpeners(cote: Cote, impls: Record<string, (p: Record<string, string>) => void>): () => void;   // dans un useEffect ; clés littérales
openLink(action: string): 'ouvert' | 'occupe' | 'indisponible' | 'inconnu' | 'file';                  // file unique, 10 s
isNarrow(): boolean;   // un seul seuil, 1023 px (aujourd'hui 640 px pour le panneau et 1024 px pour la mise en page)
useSeedOnOpen(open: boolean, init: object | undefined, apply: (i: object) => void): void;            // appliqué au passage fermé → ouvert
```
- **Outil** `ouvrir_fenetre{ id (enum générée par côté), salarie?, chantier?, date?, mois?, periode?, mode?, rubrique?, texte? }`, kind `ouverture`, terminal, un seul pour tous les écrans (≈ 1 k jetons de description, dans la partie cachée en 3c).
- **Lien** : `{label, action:'ouvrir:<id>?salarie=<uuid>&mode=hours'}` : les paramètres vivent dans la chaîne `action`, car `cleanLinks` (lib/assistant-chats.ts:70-77) ne garde que `label` et `action` et la base borne les liens à 10 / 4 000 caractères (migration 20261014090000:255-256). Valeurs = identifiants, dates ISO, mots d'une liste fermée, ou texte ≤ 80 caractères nettoyé ; ≤ 200 caractères par lien. Anciennes actions (`couts`, `salarie:<id>`, `guide:<id>`, `ask:…`) gardées en `alias` : les chats rouverts (30 jours) en contiennent.
- **Serveur** `ouvrirDepuisAppel(args, ctx, cote, role)` : (1) id cherché par égalité dans un tableau, jamais `OUVREURS[id]` (`guide:constructor`), du bon côté et du bon rôle ; (2) chaque paramètre résolu par l'existant (`resolveSalarie` AC:786, `resolveChantier`, `parseDateFr`, `mondayOf`) ; nom inconnu ou ambigu = une question avec choix, jamais un identifiant deviné ; (3) ≤ 3 liens ; (4) texte ≤ 700 caractères ; (5) aucun appel d'écriture.
- **Droits, quatre barrières** : fonction par côté (403 « Réservé au bureau », IB:105 ; `role` rendu par `assistant_context`, assistant-context.ts:16) ; enum par côté ; validation du lien ; `openLink` (id enregistré sur cette page, rôle, `dispo`, largeur). Un lien lu dans un ancien chat est une donnée non fiable : mêmes contrôles.
- **Règles d'écran** : jamais dans une fenêtre `formulaire` ouverte (réponse `occupe`, aucune saisie perdue) ; valeurs posées dans le même geste que l'ouverture, appliquées à chaque ouverture (les fenêtres `mount:'open'` ne sont jamais démontées, lazy-window.tsx) ; ligne `aria-live` « Pré-rempli par l'assistant : vérifiez avant d'enregistrer » ; niveau 3 (`export.equipe`, `cloture.mois`, `email.groupe`, `jour.envoyer`) jamais ouvert d'office ; `export.equipe` pose la période mais n'appelle jamais `demanderExport` (AP:2825).

### 3.4 Tests, évaluation, sortie
- **Tests** : `ouvrir.test.ts` (résolution, ambiguïtés, côté et rôle, `__proto__`, longueurs, aucun écrit) ; T1 étendu (chaque ouvreur : `composants`, `etats`, `ancres` existent ; chaque `lien` de fiche et chaque `AdminScreen` résout vers un ouvreur ou un alias) ; Playwright `scripts/tests/ouvrir-ecrans.mjs` : pour **chaque** id, à 1280, 768 et 390 px, `openLink` fait apparaître le `role="dialog"` ou la vue, sans requête d'écriture (liste blanche de lectures, comme `guides-bureau-lot7.mjs`) + 7 cas négatifs de `04` §5.3 ; non-régression : `test:guides-bureau-ecrans`, `test:guides-ecrans`, `test:assistant-historique`, `test:assistant-multi`, `test:bureau-ecrans`.
- **Évaluation (≈ 100 cas)** : « Ouvrir · bureau FR » ≥ 36, « bureau TR » ≥ 14, « salarié FR » ≥ 20, « salarié TR » ≥ 10, « pré-remplir » ≥ 12, « refus » ≥ 10 (un salarié demande un écran du bureau ; un niveau 3 n'est pas ouvert d'office ; formulaire occupé). **Chacun des 53 ids est l'attendu d'au moins 1 phrase FR** (T7), les 20 plus fréquents aussi d'une phrase TR. Toutes les catégories existantes sont rejouées : la liste d'outils change pour chaque demande.
- **Critères de sortie** : 53/53 implémentés (T6) ; Playwright 53 × 3 largeurs vert ; 0 requête d'écriture à l'ouverture ; `/admin` ≤ 363 kB et `/poseur` dans son budget ; chaque catégorie « Ouvrir » ≥ 90 %, FR et TR ; aucune catégorie existante sous le bras A ; empreintes SHA identiques quand `AI_ETAPE3` est éteint ; 1 semaine de pilote sans lien « inconnu » signalé.
- **Risques** : collision avec le redesign du bureau (AP, tâche n°70) ; `init` régressant une fenêtre (prop facultative + test à l'octet) ; panneau couvrant les fenêtres entre 641 et 1023 px (seuil unique) ; `window.print()` après des attentes asynchrones, surtout sur iPhone (`planning.imprimer` ouvre alors le menu pré-rempli, la personne touche « Imprimer ») — à vérifier sur appareil, comme le lien « Clients » entre 641 et 1023 px. **Retour arrière** : `ouvrir:"off"` (l'outil n'est plus proposé ; les anciens liens marchent par alias) ; front précédent.
- **Mise en ligne** : aucune migration ni changement de confidentialité. 3b-1 (socle + vagues 1-2, ≈ 30 ids) puis 3b-2 (vagues 3-4) : chaque fois front → fonctions éteintes → secret `pilote` → mesure → `pct`.
- **Effort 46-58** : socle (`openers`, `openLink`, file, `ouvrirDepuisAppel`, outil, consigne) 12 · 53 implémentations dont les `init` 16 · journée du salarié 6 · fiches fausses, alias, retrait du code mort 3 · tests d'écran 7 · évaluation et deux tours de réglage de consigne 9 · revue 3.

## 4. Livraison 3c : lecture à la demande et boucle d'outils

### 4.1 Périmètre
- **Outils de lecture** (kind `lecture`, niveau 1, jeton de la personne, RLS) : bureau ≈ 16 (`lire_planning`, `lire_heures`, `lire_chantier`, `lire_documents`, `lire_depenses`, `lire_conges`, `lire_habilitations`, `lire_reserves`, `lire_invitations`, `lire_taches_reunions`, `lire_stats`, `lire_cout_chantier`, `lire_verrou_export`, `lire_formations`, `lire_suppressions`, `lire_versions_planning`) ; salarié ≈ 9 (`lire_ma_journee`, `lire_mes_heures`, `lire_mon_planning`, `lire_mes_conges`, `lire_mes_reserves`, `lire_mes_documents`, `lire_taches_et_reunions`, `lire_formations`, `lire_collegues`, qui remplace le texte fabriqué par le serveur, IS:144-150, jamais revu par le modèle). Les 20 + 12 lectures des JSON sont fusionnées par domaine.
- **La boucle** `_shared/ai-boucle.ts` : le modèle lit (en parallèle), puis rend UN outil terminal (`repondre`, écriture, `ouvrir_fenetre`) ; `fromFunctionCall` → `prepare` → `checkAction` → carte, **inchangés** ; les écritures restent dans le navigateur (session, `withOrigin('assistant')`, `undo`, journal). Hors boucle en v1 : fichier joint (liste réduite AC:1650), profil long du salarié (`buildLongReply`), lecteurs locaux par mots-clés (gardés devant : gratuits, `REFUS_EFFACEMENT` déterministe).
- **Cache et repli** : appels multi-tours (aujourd'hui un seul message `user`, ANT:178-196 ; PROV:390), `usage` jamais lu, aucun `cache_control` (ANT:34-36).

### 4.2 Fichiers touchés
Nouveaux : `_shared/ai-boucle.ts` · `_shared/lectures/{lecteur,<outil>}.ts` · `_shared/etape3-config.ts` · `supabase/tests/lectures_rls.sql`. Modifiés : ANT (`corpsMulti`, `lireBrut`, `usage` ; **`corpsOutils` et `callFunction` intacts**) · IB, IS (branche avant `callFunction` ; `buildActionContext` découpé : seules les listes SALARIÉS / CHANTIERS bloquent, les 15 autres lectures partent en parallèle de l'appel 1) · `lib/assistant.ts`, `lib/worker-assistant.ts`, `assistant-panel.tsx` (`caps`, libellé d'attente, minuteur d'inactivité si SSE) · `app/confidentialite/page.tsx` (section 14) et la section (n) de `supabase/tests/ia_etape2_chats.sql` · `assistant-history.test.ts:603-616` (une seule ligne chiffrée autorisée en plus) · `assistant-eval` (banc de boucle). Migration (3c-3 seulement) : compteur de jetons par entreprise.

### 4.3 Contrat d'interface
```ts
export interface Lecteur { from(table: string): any; rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> }   // jeton en production, jeu fictif au banc
export interface ContexteLecture { db: Lecteur; cote: Cote; companyId: string; userId: string; today: string; signal: AbortSignal }
export interface ResultatLecture { donnees: Record<string, unknown>[]; tronque?: { gardees: number; sur: number; conseil: string }; non_fiable: string; alerte?: string }
export interface Budget { appels: 4; lectures: 8; car: 24_000; totalMs: 32_000; reserveSecoursMs: 8_000; lectureMs: 3_000 }
export interface Trace { appels: number; usage: { input: number; cacheEcrit: number; cacheLu: number; sortie: number }[]; lectures: { nom: string; ms: number; lignes: number; car: number; tronque: boolean }[]; teinte: boolean; repli?: 'gemini' | 'notice' }   // NOMBRES seulement
export async function boucleOutils(req: ReqBoucle, env: Env, fetchImpl?: FetchLike): Promise<ToolsResult & { trace: Trace; teinte: boolean }>;   // même forme que callFunction : tout l'aval est inchangé
```
- **Entrée dans la boucle** : `etat(env,'boucle',cote,me.companyId) && !fichier && iaOk && !disjoncteur`, après quota et lecteur local ; sinon chemin actuel, intact. Disjoncteur par isolat, sans base : 5 pannes sur 10 boucles → 10 min de chemin actuel.
- **Règles** : 4 appels, 8 lectures (4 par message), 24 000 caractères cumulés (6 000 par résultat), 3 s par lecture, 32 s au total dont 8 s réservées au secours (écran : 60 s, lib/assistant.ts:56) ; lecture + écriture dans un même message = l'écriture reçoit `is_error` (« lis d'abord ») ; lecture + `repondre` = `repondre` gagne ; outil inconnu ou arguments invalides : une seconde chance puis panne. Un ordre simple reste à 1 appel.
- **Lectures** : colonnes en liste blanche, `.eq('company_id')` en plus de la RLS (AC:623), `.limit(n+1)`, périodes ≤ 28 j (planning) / 56 j (heures) ; résultats en **noms** (« Prénom N. », chantier), jamais d'UUID ; jamais taux, brut, bulletin, e-mail, téléphone, n° de sécu, coût par salarié, heures des collègues côté salarié ; erreurs = message fixe ; texte libre nettoyé comme l'historique (`aplatir`, assistant-history.ts:49) ; aucun `console.*` avec du contenu.
- **Injection par les données** : (1) le modèle ne peut rien exécuter, la défense qui compte ; (2) `nommeAvant` (AC:793) inchangé : un client lu mais non dit par l'utilisateur ne vaut pas « dit » (la carte pose la question) ; (3) valeurs libres marquées `non_fiable` + rappel `role:system` après chaque résultat ; (4) détecteur FR / TR / EN sur les champs libres : une alerte met la requête en **teinte**, `action.mode` forcé à `confirm` (aucune écriture directe), compteur sans texte. Le détecteur se contourne : il ne remplace ni (1) ni (2).
- **Cache** : `system` en 2 blocs (1 : règles + guide + consigne de boucle, identique pour toutes les entreprises du côté, TTL 1 h ; 2 : date + SALARIÉS + CHANTIERS, TTL 5 min), outils **triés par nom**, ensemble fixe par côté en mode boucle (le filtre par domaine reste dans le chemin actuel), effort `low` figé. Garde permanente : `cache_read_input_tokens > 0` à l'appel 2 (au banc, pas en CI).
- **Repli** (`avecSecours` réutilisé, PROV:316) : panne à l'appel 1 = comme aujourd'hui ; à l'appel k ≥ 2 = **un seul** appel Gemini sur le chemin actuel avec un bloc « RÉSULTATS DÉJÀ LUS » (si ≥ 6 s restent) ; `refusal`, `max_tokens`, outil inconnu 2 fois, budget épuisé = même ligne ; Gemini en échec = `unavailable:true` (IB:192). Jamais de reprise de la boucle chez Gemini (blocs `thinking` non transférables ; continuation multi-tours non mesurée : à vérifier). Aucun texte intermédiaire n'est affiché ; le quota reste débité.
- **Coût (calculé, 03 §3)** : un appel aujourd'hui ≈ 0,017 $ ; boucle de 3 appels ≈ 0,086 $ sans cache, ≈ 0,020 $ cache chaud, ≈ 0,048 $ cache froid ; pire cas admis 0,139 / 0,051 / 0,079 $. Bureau à 50 demandes par jour : 0,84 $ aujourd'hui, 0,99 $ cache chaud, 4,29 $ sans cache. **Pas d'élargissement sans cache vérifié.** Aucun compteur de jetons n'existe (`usage` jamais lu) : l'alerte à 80 % de la vision (§9, étape 5) précède `pct` > 10.
- **Streaming** : v1 = libellé générique côté client après 2,5 s, sans protocole nouveau ; événements SSE `etat` (libellé FIXE de l'outil) seulement si le p90 du pilote dépasse 12 s (`functions-js` 2.5.0 rend le flux tel quel, FunctionsClient.ts:125 ; `invokeAssistant` coupe aujourd'hui à la réponse des en-têtes : minuteur d'inactivité à prévoir). Le texte n'est pas streamé (cartes non streamables, `repondre` réécrit après coup).

### 4.4 Tests, évaluation, sortie
- **Tests (Deno, `fetchImpl` scripté, sans réseau)** : 1 appel terminal identique à `callFunction` ; lecture puis terminal ; lectures parallèles ; lecture + écriture ; outil inconnu ; budgets ; chaque ligne de la table de repli ; injection (nom de chantier piégé FR / TR) ; troncature de 200 lignes ; propriété « aucun champ interdit ni UUID dans aucun résultat » sur le jeu fictif ; statique « aucun `console.*` avec du contenu » ; `etape3-config` (absent, invalide, `pct` stable). SQL `lectures_rls.sql` : chaque table lue, avec le jeton d'un salarié de l'entreprise A, ne rend rien de B ni les heures d'un collègue.
- **Évaluation (≈ 86 cas + 6 sans modèle)** : « Question chiffrée » 12 (« combien d'heures sur Villa Dupont ce mois ? » ; la réponse contient le total calculé sur la fixture), « Lire puis proposer » 12, « Comparer » 10, « Turc bureau » 12, « Injection par les données » 10, « Salarié · lire » 14 (dont 5 TR), « Collègues » 6, « Résultat tronqué » 6 et « Panne » (sans modèle). Banc : `Lecteur` fictif adossé à `ADMIN_RAW` / `WORKER_RAW` (+ heures, dépenses, documents), `runOneBoucle`, `CaseResult` + tours, lectures, jetons, coût ; le banc bureau passait `{}` en instantané aujourd'hui (aucune question chiffrée mesurée).
- **Critères de sortie** (03 §6.3, 7.3) : banc ≥ 90 % par catégorie et ≥ bras A ; 0 écriture directe issue d'une injection ; latence p50 ≤ 8 s, p90 ≤ 20 s, max ≤ 32 s ; tours médiane ≤ 2 et ≤ 5 % de cas à 4 appels ; coût médian ≤ 0,03 $ (pire cas ≤ 0,08 $) ; `cache_read > 0` à l'appel 2 dans 100 % des essais ; ≥ 70 % des jetons d'entrée lus en cache aux appels 2+ ; chaque ligne de repli couverte. **Pilote** (1-2 entreprises, 2 semaines) : ≥ 90 % de boucles sans repli, mêmes seuils de latence et de coût relevés dans les journaux (une ligne de nombres par demande).
- **Risques** : coût ×5 sans cache ; latence ; confusion entre outils proches (précédent `supprimer_intervention` / `effacer_planning`, 2 échecs sur 3, ia-v2.md:309) → champ `proches` ; charge base doublée ; limites de durée Edge non vérifiées dans le dépôt (150 s / 400 s selon le plan : à vérifier) ; données nouvelles chez Anthropic et Google. **Retour arrière** : `boucle:"off"` immédiat, disjoncteur, `outils_coupes`.
- **Barrière de confidentialité (manuelle)** : `boucle` ne passe pas à `pilote` pour une entreprise réelle avant la mise à jour de la page Confidentialité (section 14, « ce qui est envoyé » : heures par salarié, chantiers, budgets), **dans le même commit que le front**, et du registre des traitements (hors dépôt, à Ergun).
- **Mise en ligne** : 3c-1 = code dormant + banc + 6 lectures de tête (bureau : planning, heures, chantier, congés, réserves, documents ; salarié : journée, heures, planning) + pilote Ergun ; 3c-2 = front (`caps`, libellé) + page Confidentialité + lectures restantes ; 3c-3 = migration (compteur de jetons, RPC bornée à l'entreprise de l'appelant ; falsifiable par l'appelant au pire pour sa propre entreprise : à vérifier) + alerte 80 % + `pct`. Ordre habituel : migration → front → fonctions éteintes → secret.
- **Effort 95-115** : ANT multi-tours, `usage`, cache 12 · boucle, budgets, repli, disjoncteur, config 14 · cadre des lectures 8 · 25 outils de lecture 34 · découpe de `buildActionContext` 4 · front 8 · banc 10 · cas et fixtures 6 · confidentialité 3 · migration et alerte 8 · pilote et réglages 8.

## 5. Livraison 3d : écritures de niveau 2, puis dernier clic de niveau 3

### 5.1 Ordre de priorité (d'après les « 15 manques » de 02 ; les n° renvoient à ces listes)

| Sous-livraison | Contenu | Manques servis | Dépend de | Effort |
|---|---|---|---|---|
| **3d-1** « Annuler partout » | socle des écritures : `lib/registre-exec.ts` (tables d'exécuteurs, `default` qui lève), `action.mode`, cartes pilotées par le registre (titre, champs éditables), `annuler_derniere_action` (le panneau rejoue le dernier `undo` en mémoire, B23). Conversion en niveau 2 des outils dont l'inverse est exact : `ajouter_depense`, `ajouter_habilitation`, `modifier_client`, `archiver_client`, `attribuer_client`, `modifier_salarie`, `modifier_reglages` (le champ e-mail du comptable reste en carte : `mode:'conditionnel'`), `lever_reserve` (+ `rouvrir_reserve`), salarié `email_client` | bureau 14, 15 | 3a | 22-28 |
| **3d-2** secrétaire | `copier_intervention` (B19-20), `ajouter_tache`, `enregistrer_reunion` (retrait en carte), `terminer_chantier` / `rouvrir_chantier`, `corriger_pointage` étendu (pause, panier, route) avec « Annuler » exact, `modifier_intervention` (fin), `poser_absence` sans fin, `garder_version_planning` | bureau 4, 9, 10, 11 | 3d-1, 3c | 38-48 |
| **3d-3** ouvrier | `confirmer_prevu` (S3, S40), `poser_pause` (S41, S22), `completer_sortie_oubliee` (S14-15), gestes sur les journées passées (paramètre `date`), lever une réserve ancienne + photo, `cocher_tache` (S8), `marquer_formation_vue` (S64), `qualifier_trou` (S31), contrôles de l'écran (chevauchement avec les lignes notées, plus de 10 h, mois clôturé) | salarié 1, 3-9, 13, 15 | 3d-1, 3c, 3b | 32-42 |
| **3d-4** dernier clic | cartes : `rouvrir_mois`, `cloturer_heures_salarie`, `rouvrir_heures_salarie`, `renvoyer_journee`, `changer_role` / `archiver` / `reactiver`, `modifier_paie_salarie`, `envoyer_recap_maintenant`, `verifier_habilitations_maintenant`, retraits de tâche et de réunion. Fenêtres (aucun outil d'écriture) : export, envoi au comptable, e-mails groupés, « envoyer toutes les invitations », abonnement = `ouvrir_fenetre` de niveau 3 + `lire_verrou_export` | bureau 6, 12 | 3b, 3c, 3d-1 | 24-30 |
| **3d-5** le reste | réglages étendus (nom, SIRET, TVA, panier, caisse de congés, désactiver l'endroit au pointage), formations, horaires de la borne, tâches habituelles, `reordonner_interventions`, documents (catégorie, nom) ; **objectif : 0 dette** | bureau 13, 15 ; salarié 10 | 3d-1 | 22-30 |
| **3d-6** plusieurs actions | fiche bureau unique : jusqu'à 4 actions indépendantes d'une phrase, un « Tout confirmer », « Annuler » composite ; le résultat de la boucle porte `calls[]` (la forme existe, `r.calls`, PROV:235) | vision §2 | 3c, 3d-1 | 20-26 |

3d-1 peut passer avant 3c (il ne dépend que de 3a). 3d-2 et 3d-3 sont indépendants (fichiers différents) et se mènent en parallèle.

Placement des 30 manques de 02 : bureau 1, 5, 8 et salarié 2, 11, 12 → lectures de 3c ; bureau 2, 3, 7 et salarié 14 → ouvreurs de 3b ; bureau 6 et 13, salarié 10 et 15 → ouvreur (3b) + lecture (3c) + éventuelle écriture ci-dessus ; bureau 9 et salarié 13 → lecture (3c) puis écriture (3d-2, 3d-3).

### 5.2 Fichiers touchés et contrat d'interface
- **Un outil d'écriture = une entrée du registre** (`kind:'ecriture'`) + ses fonctions pures (`prepare`, `checkAction`, `summarize`, `questionFor`, dans `_shared/`) + **un exécuteur** dans `lib/registre-exec.ts` qui appelle la fonction de `lib/` **déjà utilisée par l'écran**. Là où l'écran écrit en ligne (rouvrir un mois AP:1721, supprimer un client AP:3012, fiche de paie `worker-detail.tsx:725`, endroit au pointage `company-settings.tsx:337`…), on **extrait d'abord** la fonction dans `lib/*-writes.ts`, l'écran l'appelle, puis l'exécuteur : un test statique interdit à un exécuteur d'importer un composant. Les copies actuelles (`annuler_invitation`, annulation de `creer_chantier`, `effacer_heures`, `retirer_photo`…) sont ramenées au même appel.
- `ActionResult {ok, message, undo?, partial?, count?, versionsWeek?}` inchangé ; `undo` reste une fermeture en mémoire (card-memory.ts : disparaît au rechargement, jamais enregistrée dans le chat). Journal : `assistant_journal_log(<id d'outil>, résumé ≤ 380)` après l'écriture, et `undone=true` à l'annulation ; origine `assistant` (`withOrigin`). Les lectures ne sont pas journalisées.
- Réponse serveur : `action.mode` ('direct' | 'confirm') et `action.annuler`. `direct` seulement si le mode cible de l'outil est `direct`, `modes:"cible"`, aucun problème, requête non teintée ; sinon le `modeActuel` de l'outil.
- **Niveau 3 fenêtre** : aucun exécuteur ; l'outil enchaîne lectures puis `ouvrir_fenetre` (niveau 3) ; le texte dit ce qui va se passer ; le clic est celui de la fenêtre réelle (choix du verrou, alerte, Stripe).
- **Garde-fous conservés** : le salarié et le client sont résolus par `resolve` (AC:773) ; client « dit » (`nommeAvant`) ; toute suppression en carte avec aperçu (AC:511) ; mois clôturé, heures envoyées et exports de paie jamais effacés (AC:1686) ; liste d'outils réduite avec un fichier joint.

### 5.3 Tests, évaluation, sortie
- **Par outil** : unitaires (`prepare`, `checkAction`, `summarize`, `questionFor`, `default` de l'exécuteur) ; **Playwright à base simulée avec état** (modèle `assistant-effacer.mjs`) : faire → « Fait » → « Annuler » → l'empreinte des tables est identique à l'avant ; pour une carte : rien d'écrit avant « Confirmer » ; journal `undone=true` ; `modes:"actuel"` rend bien la carte ; pour toute RPC nouvelle, un test SQL RLS (`run-rls.sh`). Écran existant rejoué quand on extrait une écriture (`test:bureau-ecrans`, `test:planning-lot2`, `test:brouillons`, `test:heures-ecrans`, etc.).
- **Évaluation (≈ 150 cas sur 3d)** : ≥ 3 phrases par outil (2 FR, 1 TR) groupées en catégories de ≥ 10 ; contrôle du **mode** attendu (`direct` ou `carte`) ajouté à `Outcome` ; cas de refus (message parti ⇒ carte), de proximité (`copier_intervention` / `affecter_planning`, `terminer_chantier` / `archiver_client`) et d'injection sur écriture.
- **Critères de sortie par sous-livraison** : tests verts ; chaque outil ≥ 3 cas ; catégories ≥ 90 % (FR et TR) ; « Annuler » prouvé pour 100 % des outils de niveau 2 ; 100 % des niveaux 3 exigent un clic (carte ou fenêtre) ; pilote d'une semaine sans écriture non voulue relevée au journal. **Sortie de l'étape 3** : `dette` = 0 et `ecart` = 0 ; tout `humain` avec raison ; ≈ 490 cas ≥ 90 % par catégorie.
- **Risques** : écriture non voulue par mauvaise compréhension (atténué : retour à `modes:"actuel"`, teinte, `nommeAvant`, question plutôt que devinette, `checkAction` rejoué) ; annulation partielle ou impossible (⇒ carte) ; double notification au salarié sur une correction annulée (`office_edit_mark_notified`, à vérifier) ; régression des écrans à l'extraction ; deux onglets ; session de support en lecture seule (la base refuse : l'assistant doit le dire, à vérifier) ; hors réseau. **Retour arrière** : `outils_coupes` (un outil), `modes:"actuel"` (tous les niveaux 2 repassent à leur mode d'aujourd'hui), `ecritures:"off"`.
- **Mise en ligne** : pas de migration attendue, sauf RPC nouvelle (à confirmer par outil, ex. `rouvrir_reserve`) : migration d'abord avec requête de vérification. Puis front (exécuteurs, cartes, `annuler_derniere_action`) → fonctions éteintes → secret.
- **Effort 158-204** (tableau 5.1), dont ≈ 40 h d'extractions d'écriture et de tests d'écran.

## 6. Ordre des mises en ligne et parallélisme
`3a-1` → `3a-2` → { `3b-1` ∥ `3c-1` ∥ `3d-1` } → { `3b-2` ∥ `3c-2` } → `3c-3` → { `3d-2` ∥ `3d-3` } → `3d-4` → `3d-5` → `3d-6`. Chemin critique : 3a → 3c → 3d-2/3d-3 → 3d-4. Échéances de `dette` proposées : 3b au 30/11/2026, 3c au 31/12/2026, 3d au 31/03/2027 (reculer une échéance = une ligne visible en revue). Chaque mise en ligne suit l'ordre de §1.3 ; aucune ne dépend d'une autre pour son retour arrière.

## 7. (a) Décisions prises par défaut

| # | Décision | Raison |
|---|---|---|
| 1 | Registre dans `supabase/functions/_shared/registre/`, TypeScript pur | seul emplacement lisible par navigateur, fonctions Edge et tests ; précédent `admin-tours.ts` |
| 2 | Ids B1…B138 / S1…S105 des cahiers conservés, jamais renumérotés ; surfaces de code dans un fichier séparé | le redesign (tâche n°70) change le code, pas les capacités |
| 3 | Test de couverture en Deno + job CI ; `dette` datée et cliquet `DETTES_MAX` au lieu d'un échec immédiat | 3a doit pouvoir sortir avec ≈ 130 trous connus ; un trou ne peut plus apparaître en silence |
| 4 | Scanner par RPC, table, fonction, export, fenêtre, ancre, route (pas par nom de fichier `*-writes.ts`) | 2 fichiers seulement portent ce nom, ≈ 35 autres écrivent |
| 5 | Déclarations des 51 outils existants déplacées dans le registre, preuve SHA-256 | « outils générés » (vision §7) sans changer un octet |
| 6 | Interrupteur `AI_ETAPE3` séparé de `AI_CONFIG`, pilote par entreprise puis pourcentage ; `outils_coupes` | `AI_CONFIG` replierait la production sur Gemini (PROV:141) |
| 7 | Négociation `caps` et `action.mode` serveur | un onglet ancien ne casse pas ; retour arrière sans front |
| 8 | Ouverture automatique si la personne l'a demandée (≥ 1024 px), bouton sinon ; panneau replié sous 1024 px ; jamais d'ouverture d'office d'un niveau 3 ni d'un geste d'appareil | vision niveau 1 « immédiat » ; niveau 3 = dernier clic humain |
| 9 | Paramètres d'ouverture dans la chaîne `action` du lien | `cleanLinks` ne garde que `label` et `action` |
| 10 | `borne.gestion` ouvrable (le code s'affiche à la personne, jamais au modèle) ; `notifications` sorti de la navigation | écran derrière le même rôle ; un geste d'appareil n'est pas une navigation |
| 11 | Lectures côté serveur sous le jeton, colonnes en liste blanche, noms et non UUID, filtre `company_id` en plus de la RLS | vision §4 : mêmes droits que la personne, rien de plus |
| 12 | Boucle : 4 appels, 8 lectures, 24 000 car., 32 s ; cache en 2 blocs ; ensemble d'outils fixe et trié | le cache conditionne le coût (×5 sans) |
| 13 | Pas de reprise de boucle chez Gemini : un appel de secours avec les faits lus | `thinking` non transférable, continuation non mesurée |
| 14 | Hors boucle en v1 : fichier joint, profil long du salarié, lecteurs locaux (conservés devant) | surface d'attaque, 89 tests de la fiche multi, `REFUS_EFFACEMENT` |
| 15 | Une boucle = une demande de quota ; quotas 50 / 20 inchangés pendant les pilotes | 03 §3.4 ; à revoir d'après la mesure |
| 16 | Pas de streaming du texte ; libellé générique d'abord, SSE `etat` seulement si p90 > 12 s | coût de protocole pour un gain incertain |
| 17 | Écritures toujours dans le navigateur (session de la personne) ; `undo` en mémoire | RLS, origine `assistant`, journal ; chats en texte seul (vision §6) |
| 18 | Niveau 2 seulement si l'« Annuler » est exact ; sinon carte. `corriger_pointage` reste en carte tant que l'annulation exacte n'existe pas (3d-2) | règle d'or ; lot 1 « heures sûres » |
| 19 | Suppressions : statu quo (aperçu, « Confirmer », « Annuler ») | décision D3 du lot 1 ; question 1 |
| 20 | Droits d'accès (rôle, archiver / réactiver, support, déconnecter la tablette) en niveau 3 ; tout « doute » en niveau 3 (vision §3) | tableau de la vision ; question 2 |
| 21 | Export, envoi au comptable, e-mails groupés, abonnement : l'assistant lit, ouvre pré-rempli, ne clique jamais ; le fichier d'export reste fabriqué dans le navigateur | liste du 14/10 |
| 22 | Descriptions d'outils en français ; le turc est compris par le modèle ; réponse libre dans la langue de la question ; cartes et boutons restent en français | ia-v2.md §G ; pas de traduction d'écran dans cette étape |
| 23 | Bulletin joint pour `cout_reel` inchangé ; chef d'équipe : toujours aucune donnée de collègue via l'assistant (S69-S71 restent à l'écran dédié) | statu quo ; question 7 pour le bulletin ; le chef d'équipe n'est pas bloquant |
| 24 | Seuil 90 % sur les essais (3 passes), catégories ≥ 10 cas, FR et TR séparés ; mesure de référence en 3a | une catégorie d'un seul cas vaut 0 % ou 100 % |
| 25 | Fichiers, formats et remplissage depuis un document : hors étape 3 | vision §9, étape 4 |

## 8. (b) Questions qui exigent l'avis du patron

Si la réponse est « les défauts partout », rien n'est bloqué.

1. **Suppressions annulables** (intervention, absence, dépense, habilitation, document) : on garde l'écran « Vérifiez ce qui sera retiré, puis Confirmer », ou on les fait tout de suite avec « Annuler » (restauration à l'identique) ? *Défaut : écran de confirmation. Avant 3d-1.*
2. **Droits d'accès** (changer un rôle, archiver ou réactiver un salarié, autoriser le support BEMEXO, déconnecter la tablette) : dernier clic humain ? La vision les cite dans son tableau mais pas dans la liste validée. *Défaut : oui. Avant 3d-4.*
3. **Messages déjà partis** (inviter un salarié, rappel sur son téléphone, réponse à un congé, relance) : un clic « Confirmer » (défaut) ou fait tout de suite, sans « Annuler » possible puisque le message est parti ? *Avant 3d-1.*
4. **Rouvrir un mois, clôturer ou rouvrir les heures d'un salarié, renvoyer une journée à un salarié** : dernier clic humain (défaut) ou fait avec « Annuler » ? *Avant 3d-4.*
5. **Données lues par l'assistant** : les heures de chaque salarié jour par jour, les noms de clients et les budgets partent chez Anthropic (Google en secours). Accord, avec mise à jour de la page Confidentialité et du registre des traitements avant tout client réel ? Jamais les taux, bulletins, n° de sécurité sociale, coûts par salarié, ni les heures des collègues côté salarié. *Défaut : oui. Avant le pilote de 3c.*
6. **Plafond de dépense IA** par entreprise et par mois (ordre de grandeur calculé pour 50 demandes par jour : ≈ 18 $ aujourd'hui, ≈ 22 $ avec la boucle et le cache, ≈ 94 $ sans cache) : à fixer dans la console Anthropic avec une alerte à 80 %. *Avant tout `pct` > 10.*
7. **Bulletin de paie joint** : on garde l'envoi volontaire du bulletin au modèle pour le coût réel (non conservé, « à vérifier » si le secours répond), alors que la vision §4 dit « aucune donnée de paie sensible envoyée au modèle » ? *Défaut : oui, inchangé. Avant 3d-4.*
