# Lot 7 — guides pas à pas (côté salarié, bureau et support)

> « L'assistant doit expliquer au salarié, simplement, quoi faire sur son téléphone. »

Quand un salarié demande « comment je demande un congé ? », l'assistant répond comme avant par une fiche écrite (3 étapes) et un bouton vers l'écran. Il ajoute maintenant **« Me guider pas à pas »** : l'assistant se replie, l'écran s'ouvre, un **anneau jaune entoure le vrai bouton** à toucher, et une carte en bas dit une phrase très simple par étape.

Le guide **montre, il ne fait jamais** : aucun toucher à la place du salarié, rien d'envoyé, rien d'écrit en base, aucune donnée qui sort.

## Comment ça marche

| Pièce | Rôle |
|---|---|
| `supabase/functions/_shared/worker-tours.ts` | Les fiches de guidage : `{ id, etapes: [{ ecran?, cible, texte }] }`. Sans dépendance : lu par le navigateur **et** par la fonction |
| `components/guide-tour.tsx` | Le composant **commun** (il ne connaît ni le salarié ni le bureau) : `steps`, `onStepEnter(step, index)`, `onClose`, `returnFocus?` |
| `data-guide="…"` | L'ancre posée sur le vrai bouton, dans le code des écrans (attribut seulement : aucun changement de comportement, de classe ni de style) |
| `worker-assistant-core.ts` | `WORKER_GUIDE[].id` (stable) et `workerGuideLinks(g)` : le raccourci vers l'écran, **puis** `{ label: 'Me guider pas à pas', action: 'guide:<id>' }` quand la fiche a un guidage. Même helper pour la voie locale et la voie modèle |
| `app/poseur/page.tsx` | `onNavigate('guide:<id>')` : replie l'assistant, lance le guide ; `onStepEnter` prépare l'écran (menu du compte, semaine, « Mes congés », « Informations »…). Un id inconnu est ignoré |

L'`id` d'une fiche d'aide (`WORKER_GUIDE`) est celui de sa fiche de guidage. Les fiches dont le raccourci est `ask:…` (collègues, assistant) n'ont pas de bouton à entourer : pas de guide.

## Ce que fait le composant

- **Carte** en bas (feuille basse, zone sûre iPhone) : « Étape 2 sur 4 », la phrase, **Précédent / Suivant (Terminer à la fin) / Fermer**, tous ≥ 44 px. Elle passe **en haut** quand elle cacherait la cible ou des boutons (bouton collé en bas, feuille de molette).
- **Anneau** : la cible + 4 px, `pointer-events: none` (les touchers passent). Il suit le défilement, le redimensionnement et la rotation (événements + `ResizeObserver` + filet de sécurité). Il fait défiler la liste pour montrer une cible hors écran.
- **Le salarié touche le vrai bouton** : le guide avance tout seul (clic en capture, et appui + relâché pour les boutons qui réagissent dès l'appui, comme le menu du compte). Au dernier pas, toucher la cible termine le guide.
- **Échap** ferme le guide **seul** (la fenêtre ouverte dessous reste), **Fermer** aussi ; le focus revient au bouton qui l'avait lancé, sinon au bouton ✨ de la barre du bas.
- **Accessibilité** : `role="dialog"` non modal, phrase en `aria-live="polite"`, focus sur la carte à l'ouverture, `prefers-reduced-motion` (ni pulsation ni entrée animée, défilement sans animation), contraste noir / crème / jaune de l'app.
- **Au-dessus** de l'écran et des fenêtres de l'app (z-index 60, au-dessus des fenêtres Radix à 50, pour qu'on puisse toujours continuer), **sauf** devant une **boîte de confirmation** (`data-guide-confirm`, ex. « Retirer ce chantier ? ») qui ne contient pas la cible : le guide passe dessous. Un guide dont la cible est dans une fenêtre se pose au-dessus d'elle.

## Cible absente ou cachée (jamais de blocage)

Le composant réessaie ~1,5 s, puis :

- **absente** (écran pas prêt, fonction éteinte pour l'entreprise, autre état) : « *Je ne vois pas ce bouton sur votre écran.* » + la phrase de l'étape, sans anneau ;
- **cachée** par une fenêtre ou une feuille ouverte : « *Ce bouton est caché par une fenêtre. Fermez-la pour le voir.* » ;
- « Suivant » marche toujours. Le composant **continue de chercher** : si le bouton apparaît plus tard (le salarié ferme la fenêtre), l'anneau revient.

Une étape qui dépend d'un état le dit dans sa phrase (« Dans la fiche du chantier, touchez… », « S'il y a un pointage en cours… »).

## Ajouter une fiche

1. Donner un `id` (slug) à l'entrée de `WORKER_GUIDE` si elle n'en a pas, et vérifier qu'elle se fait sur un écran.
2. Ajouter dans `worker-tours.ts` : `{ id, etapes: [{ ecran?, cible, texte }] }`, **1 à 5 étapes**, **140 caractères au plus** par phrase, une seule idée.
3. Poser `data-guide="ecran.bouton"` sur le vrai élément (une ancre = un élément par écran ; si elle est répétée à dessein — les 5 états du bouton « Envoyer ma journée », la liste des cartes — l'ajouter à `REPETEES` dans le test, avec la raison).
4. `ecran` = **navigation seulement** : `journee`, `semaine`, `mois`, `historique`, `conges` (ouvre la fenêtre « Mes congés »), `infos` (ouvre « Informations »), `menu` (ouvre le menu du compte). Jamais `notifications`, `photo` ni `borne` : ce sont des gestes qui agissent, le salarié les touche lui-même. Absent = on reste où on est, menu refermé.
5. Lancer `npm run test:guides`.

### Langage

Vouvoiement, phrases courtes, mots simples, **« Touchez »** (jamais « cliquez »), le libellé exact du bouton entre « ». Pas de jargon (brouillon, statut, synchronisation…). Une phrase « pourquoi » seulement quand elle évite une erreur.

## La règle des ancres et du test

`npm run test:guides` (Deno, `supabase/functions/_shared/worker-tours.test.ts`) vérifie :

- chaque fiche a un `id` qui existe dans `WORKER_GUIDE`, sans doublon ;
- 1 à 5 étapes, texte non vide de 140 caractères au plus, terminé par un point ; aucun mot de la liste de jargon, aucun tutoiement ;
- chaque `cible` existe comme `data-guide` dans `app/` et `components/` ; aucune ancre en double (hors `REPETEES`), aucune ancre posée mais jamais visée ;
- chaque libellé cité entre « » existe dans le code des écrans (même normalisation que `assistant-aide.test.ts`) ;
- chaque entrée de `WORKER_GUIDE` à lien d'écran a un guide (et les entrées `ask:` n'en ont pas) ;
- chaque réponse « guide » du serveur — voie locale **et** voie modèle (faux appel `repondre`) — contient le lien `guide:<id>` **exactement quand** la fiche existe, après le raccourci ;
- le composant n'appelle ni réseau, ni `.click()`, ni stockage ; la page du salarié n'ouvre, pour une étape, que de la navigation.

Un bouton renommé, une ancre retirée : le test casse, on met le guide à jour dans le même commit.

`scripts/tests/guides-lot7.mjs` (`npm run test:guides-ecrans`, après `npm run build`) rejoue tout dans un vrai navigateur : téléphone 390×844 et 360×640, tablette 768, ordinateur 1280 ; l'anneau pile sur la cible, les 23 guides, les vrais toucher, Échap / Fermer / focus, le menu qui s'ouvre et se referme, la cible absente ou cachée, les boîtes de confirmation, le défilement et la rotation, le mouvement réduit, **aucune écriture** pendant les guides.

Captures : `docs/captures-lot7b/` (la réponse avec les deux boutons, l'anneau sur le nom, l'étape dans la fenêtre « Mes congés », la carte en haut pour un bouton collé en bas, un bouton caché par la molette, une boîte de confirmation au-dessus du guide).

## Mise en ligne : front d'abord, fonction ensuite

1. **Le front** (cette PR) : sans « Me guider pas à pas » côté fonction, rien ne change pour le salarié (le bouton n'apparaît pas).
2. **Puis la fonction `worker-assistant`** (redéploiement par fichier-pointeur ; elle emporte le nouveau fichier `_shared/worker-tours.ts`). Aucune migration.

Dans l'autre ordre (fonction avant front), l'ancien écran reçoit le bouton « Me guider pas à pas » et appelle `onNavigate('guide:…')` : sa chaîne de `if` n'a pas de cas pour cette action, **il ne se passe rien** (aucune erreur, aucun mauvais écran) ; sur téléphone le panneau se replie, sur grand écran il reste ouvert. Un bouton qui ne répond pas : c'est pourquoi l'ordre est front, puis fonction.

## Le bureau (patron, secrétaire)

Le patron demande « comment j'ajoute un salarié ? » : l'assistant du bureau répond par la fiche écrite et deux boutons, **le raccourci de l'écran** (« Salariés », « Exporter / clôturer »…) puis **« Me guider pas à pas »**. Un clic replie l'assistant (sur tous les écrans) et le guide entoure le vrai bouton, étape par étape, **au clic sur ordinateur, au toucher sous 1 024 px**. Le guide **montre, il ne fait jamais** : aucun clic à la place du patron, rien d'envoyé, rien d'écrit, aucune donnée lue.

### Les pièces

| Pièce | Rôle |
|---|---|
| `supabase/functions/_shared/admin-tours.ts` | **48 fiches** (une par entrée de `GUIDE` qui se fait sur un écran, mêmes `id`, sans dépendance). `position` et `sortie_oubliee` n'ont rien à entourer : pas de fiche. `adminStepsFor(fiche, petitEcran)` rend les étapes selon la mise en page |
| `assistant-actions-core.ts` | `guideButton(g)` et `guideLinks(g)` : **l'unique endroit** qui fabrique « Me guider pas à pas » (voie locale, voie modèle, réponse sans clé IA, démonstration du navigateur). `GUIDE` et `guideForPrompt()` n'ont pas bougé |
| `components/admin-planning.tsx` | `onNavigate('guide:<id>')` : replie l'assistant, lance le guide ; `tourStep` prépare l'écran (voir plus bas). Un id inconnu (`guide:constructor`, `guide:`) est ignoré |
| `data-guide="bureau-…"` | L'ancre sur le vrai bouton (attribut seulement : aucun changement de comportement, de classe ni de style) |

### Un texte, deux verbes

Une seule fiche par entrée : **« Cliquez »** à l'ordinateur, **« Touchez »** sous 1 024 px (la majuscule est gardée : « …, puis cliquez sur « Exporter » » devient « …, puis touchez « Exporter » »). Une phrase propre au petit écran (`mobile`) remplace la dérivation quand le libellé change (« Clients » devient « Chantiers », « Réserves » devient « Réserves de chantier »). La limite est **1 023 px** : la tablette 768 px a la même mise en page que le téléphone (menu ☰, pas de barre d'outils, pas de glisser-déposer). Sous 1 024 px, les boutons de la barre sont des lignes du menu ☰ : le guide ajoute l'étape « Touchez le bouton « Menu » » avant la première ligne du menu.

### Ce que le guide ouvre (et ce qu'il ne touche jamais)

`ecran` = navigation seulement : le menu ☰, le menu du compte, le menu « Clients » (ou la fenêtre « Chantiers »), et les fenêtres Salariés, Nouveau salarié, Nouveau client, Congés, Export, Coût chantiers, Réserves, Réglages, Versions. Règle de `tourStep` :

- une étape **sans écran** ne ferme et n'ouvre **rien** (le patron vient peut-être d'ouvrir la fenêtre lui-même) ;
- une étape **avec écran** ferme la navigation sans saisie qui n'est pas l'écran demandé, puis ouvre celui-ci s'il ne l'est pas déjà ;
- **jamais fermées** par le guide, parce qu'elles peuvent contenir une saisie non enregistrée : Nouveau salarié, Nouveau client, Réglages, fiche salarié, fiche client, modification d'une intervention, ajout, absence en cours, documents, attribution. Si l'une recouvre la cible, la carte dit « Ce bouton est caché par une fenêtre. Fermez-la pour le voir. » ;
- **jamais ouverts** par le guide : la Borne (l'ouverture crée un code d'appairage), le mode « Sélectionner », les statistiques, les imports, l'impression, l'assistant, un salarié ou un client précis.

**Gestes sur une ligne** : un bouton qui agit sur UNE ligne précise d'une liste n'est jamais entouré (le guide mène à la première ligne visible, le patron pourrait accepter le congé de Dupont ou renvoyer l'invitation de la mauvaise personne parce que l'anneau l'y a mené). L'ancre est sur la **liste** (ou, pour les congés, sur la ligne de la demande) et la phrase dit « repérez la bonne demande, puis… ». Concerné : accepter/refuser un congé, « Relancer », la croix d'une invitation, « Renvoyer », « Lever la réserve », « Clôturer » / « Rouvrir » un mois, « Revenir à cette version », le rôle d'un salarié. Le test interdit ces ancres.

**Verrouillage des heures** : l'export d'ÉQUIPE verrouille les heures de la période ; l'export d'UN salarié ne verrouille rien. `export` et `telecharger` le disent, `telecharger` propose d'abord « Un seul salarié ? », l'anneau est sur « Exporter », jamais sur un format.

### Les 48 fiches

`ajouter_salarie`, `importer_salaries`, `creer_client`, `importer_clients`, `affecter`, `absence`, `demandes_conge`, `corriger`, `export`, `cloture`, `couts`, `budget`, `reserves`, `role`, `reglages`, `documents`, `relancer`, `semaine`, `deplacer`, `heure_note`, `retirer`, `selection`, `versions`, `present`, `attribuer`, `annuler_invitation`, `rappel`, `fiche_client`, `archiver_client`, `supprimer_client`, `fiche_salarie`, `archiver_salarie`, `cloture_salarie`, `feuille`, `habilitations`, `cout_reel`, `reouvrir`, `telecharger`, `lever_reserve`, `depense`, `envoyer_client`, `borne`, `support`, `abonnement`, `recap`, `caisse`, `collegues`, `assistant`.

### Le bouton dans les réponses de l'assistant

- **Voie locale** (réponses sans IA) : la regex d'intention est la même qu'avant ; la réponse gagne seulement le bouton.
- **Voie modèle** : le bouton n'est **jamais choisi par le modèle** (le schéma de l'outil `repondre` ne propose pas `guide:`). Le serveur l'ajoute **juste après le raccourci de la fiche** quand : (a) la demande dit « comment / explique / à quoi sert / où est », (b) la réponse n'est pas une question de précision (« Quel Martin ? »), (c) le modèle n'a pas répondu sur des données (lien `salarie:…`), (d) la réponse parle de la même fiche que la demande, (e) le raccourci de cette fiche est dans la réponse. Ou quand la réponse « je n'ai pas accès » a été remplacée par la fiche. Jamais le guide d'une autre fiche. Maximum 3 liens du modèle + le bouton.
- Conséquence assumée : quand la réponse du modèle ne ressemble pas assez à la fiche, il n'y a que le raccourci d'écran. Le bouton est un bonus, jamais indispensable.

### Preuve que l'IA n'a pas bougé

`docs/guides-bureau-avant-apres-ia/` (`node docs/guides-bureau-avant-apres-ia/comparer.mjs`) :

- `guideForPrompt()` : **11 200 octets, SHA-256 `8e2b61c3…959e6a`, identique** ; la consigne complète ne contient ni « Me guider pas à pas » ni `guide:` (verrouillé par `npm run test:guides-bureau`) ;
- **voie locale**, 44 phrases bureau sans fichier : 4 sorties changent, un bouton en plus à la fin : **b29** (`export` → + `guide:telecharger`), **b30** (`reserves` → + `guide:reserves`), **b31** (`planning` → + `guide:deplacer`), **b33** (`salaries` → + `guide:corriger`) ;
- **voie modèle**, 47 phrases × 3 réponses simulées : le bouton n'est inséré que pour **b30** et **b31** (réponse = texte de la fiche + intention « à quoi sert » / « explique … comment »). b29 et b33 n'ont que le raccourci (leur réponse écrite se rapproche d'une autre fiche) ;
- **b17, b18, b19** (phrases avec fichier) ne passent **jamais** par la voie locale (`assistant/index.ts` : `att.file ? null : handleActionLocally`) ; rejouées par la voie modèle, aucun bouton ;
- **banc d'évaluation sans IA** (`npm run test:assistant-eval`) : identique, 31/109, `parCas` et catégories compris.

### Les écarts entre le texte écrit et le vrai chemin

Le guide pas à pas suit le **vrai** chemin ; il peut donc contredire d'une ligne la réponse écrite juste au-dessus. Le texte écrit (`GUIDE`) n'a pas été corrigé : il change la consigne du modèle (interdit dans ce lot, à proposer comme lot à part avec relance du banc). Six entrées sont inexactes :

| Entrée | Le texte écrit dit | Le vrai chemin |
|---|---|---|
| `reglages` | « menu en haut à gauche (logo) » | le bouton du compte, avec le nom de l'entreprise, en haut à droite (☰ sur petit écran) |
| `fiche_salarie`, `archiver_salarie`, `habilitations` | « cliquez son nom sur le planning » | ouvre le statut ; la fiche passe par « Salariés » puis le nom |
| `attribuer` | « Attribuer » | le bouton se nomme « Attribuer / changer le client » |
| `abonnement` | « Gérer mon abonnement » | absent pendant l'essai ; « S'abonner » est en haut de l'écran |
| `caisse` | « Caisse de congés » | « Caisse de congés BTP », dans la rubrique « Heures & paie » |

### Limites (à dire aux patrons)

- **Après la mise en ligne, recharger la page du bureau.** Un onglet resté ouvert garde l'ancien code et reçoit le nouveau bouton sans savoir le lancer (sur téléphone le panneau se replie, rien d'autre).
- `deplacer` (glisser-déposer) est « ordinateur seulement » : sur petit écran le bouton existe (le serveur ne connaît pas la taille de l'écran) mais un clic affiche « Ce guide se fait sur ordinateur… » et ne lance rien. Sur ordinateur, **« Suivant » est le seul moyen d'avancer** (un glisser n'est pas un clic) et la première étape dit « Ne cliquez pas dessus : attrapez-la ».
- Les rubriques repliées de « Réglages de l'entreprise » ne sont pas ouvertes par le guide : une étape demande au patron de cliquer lui-même la rubrique (« si elle est fermée »).
- Le guide ne choisit jamais un salarié, un client, un mois ou une journée à la place du patron : les phrases disent « le salarié voulu », « le mois voulu ». Sur un élément répété, l'anneau montre le premier visible.
- « Précédent » vers un écran recouvert par une fenêtre de saisie ouverte ne ferme pas cette fenêtre : l'anneau passe sur la fenêtre « Salariés » rouverte ou la carte dit « caché par une fenêtre ». Ce qui est tapé n'est jamais perdu.
- Le guide ne fait aucun appel réseau, mais **les écrans qu'il ouvre en ont besoin** (Salariés, Coûts, Réserves, Réglages, Versions lisent la base à l'ouverture) : sans réseau ils restent vides et la carte dit « Je ne vois pas ce bouton sur votre écran. » ; « Fermer » et Échap marchent.
- Le bandeau « Mode support » (z-index 90) peut recouvrir la carte du guide quand elle est en haut (à regarder sur téléphone).
- Bug existant signalé, hors lot : le raccourci d'écran `clients` de l'assistant décide « téléphone » à 640 px (au lieu de 1 023 px), donc entre 641 et 1 023 px il ouvre un menu caché. Le guide utilise son propre seuil 1 023 px.
- `aria-hidden` : relevé avec une fenêtre ouverte, la racine du guide (`[data-testid=guide-root]`) n'a **pas** `aria-hidden` (ni elle ni un parent).

### Tests

- `npm run test:guides-bureau` (Deno, `admin-tours.test.ts`) : 48 fiches ↔ `GUIDE` (ids figés, 50 entrées), 1 à 5 étapes sur ordinateur **et** sous 1 024 px (menu ☰ compris), phrases ≤ 140 caractères, vouvoiement, jargon, « Cliquez » / « Touchez », recherche stricte (`constructor`, `__proto__`), chaque ancre posée, une ancre = un élément sauf la liste `DUAL` (avec la raison), aucune ancre inutilisée, **aucune ancre sur un geste qui agit sur une ligne**, libellés cités présents dans le code, verrous de texte (verrouillage des heures, « à partir du jour », durée et lecture seule du support, « Ne cliquez pas »), liens `guide:<id>` des voies locale et modèle, faux positifs (« Quel Martin ? », demande de rédaction, réponse chiffrée), consigne identique, une seule fabrique du bouton, `tourStep` sans écriture.
- `npm run test:guides-bureau-ecrans` (`scripts/tests/guides-bureau-lot7.mjs`, après `npm run build`) : la vraie page `/admin` dans un vrai navigateur, 1 280, 1 100, 768 et 390 px ; l'anneau **pile** sur la cible, les parcours au vrai clic, « Suivant » seul sur les 48 fiches à 1 280 et 390 px, saisies préservées, Échap, réseau coupé, **aucune écriture depuis l'apparition de la carte** (liste blanche nommée des seules lectures par RPC).

Captures à 390 px : `docs/captures-lot7-fin/` (la réponse avec les deux boutons, l'anneau sur une ligne du menu ☰, l'anneau dans la fenêtre Salariés, l'étape des Réglages avec la rubrique repliée, la ligne du support).

### Mise en ligne : front d'abord, fonction ensuite

1. **Le front** (release) : sans le bouton côté fonction, rien ne change pour le patron.
2. **Puis la fonction `assistant`** (redéploiement par fichier-pointeur ; elle emporte `_shared/admin-tours.ts` et `_shared/worker-tours.ts`). Aucune migration.
3. Dire aux patrons de **recharger la page** : dans l'autre ordre, l'ancien écran reçoit un bouton qui ne répond pas.

### Tester sur téléphone (390) et tablette (768)

« Comment j'ajoute un salarié ? » : deux boutons ; « Me guider pas à pas » replie l'assistant, le ☰ s'ouvre, l'anneau suit « Salariés », « Nouveau salarié » puis « Envoyer l'invitation » (sans rien envoyer). « Comment je règle la caisse congés ? » : une rubrique à ouvrir soi-même. « Comment je déplace une intervention ? » : le message « sur ordinateur ». « Comment je réponds à une demande de congé ? » : l'anneau entoure la ligne de la demande, pas la coche. La Borne n'affiche pas de nouveau code tant qu'on ne touche pas « Borne ».
