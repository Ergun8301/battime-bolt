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

**Gestes sur une ligne** : un bouton qui agit sur UNE ligne précise d'une liste n'est jamais entouré (le guide mène à la première ligne visible, le patron pourrait accepter le congé de Dupont ou renvoyer l'invitation de la mauvaise personne parce que l'anneau l'y a mené). L'ancre est sur **un seul conteneur** : la liste entière (les demandes en attente avec leur titre, tous les chantiers à réserves). L'anneau les couvre toutes, jamais la première avec ses boutons ✓ ✗ ou « Lever la réserve » dedans ; la phrase dit « repérez la bonne demande, puis… ». Le conteneur reprend la mise en page de la fenêtre (`grid gap-4`) : l'écran ne change pas. Le test navigateur joue avec deux demandes et deux chantiers. Concerné : accepter/refuser un congé, « Relancer », la croix d'une invitation, « Renvoyer », « Lever la réserve », « Clôturer » / « Rouvrir » un mois, « Revenir à cette version », le rôle d'un salarié. Le test interdit ces ancres.

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
- **« Suivant » seul** (sans cliquer sur les vrais boutons) mène aux Réglages (les rubriques repliées restent à ouvrir par le patron) et, dans `telecharger`, rouvre l'export d'équipe après « Un seul salarié ? » (la fenêtre « Exporter un salarié » est de la navigation, le guide la referme).
- **Changement de mise en page pendant un guide** (tablette qu'on tourne, fenêtre redimensionnée au-delà de 1 024 px) : le guide **se ferme** (ses étapes, écrites pour l'ordinateur ou pour le ☰, ne correspondraient plus). Il suffit de le relancer.
- « Précédent » vers un écran recouvert par une fenêtre de saisie ouverte ne ferme pas cette fenêtre : l'anneau passe sur la fenêtre « Salariés » rouverte ou la carte dit « caché par une fenêtre ». Ce qui est tapé n'est jamais perdu.
- Le guide ne fait aucun appel réseau, mais **les écrans qu'il ouvre en ont besoin** (Salariés, Coûts, Réserves, Réglages, Versions lisent la base à l'ouverture) : sans réseau ils restent vides et la carte dit « Je ne vois pas ce bouton sur votre écran. » ; « Fermer » et Échap marchent.
- Le bandeau « Mode support » (z-index 90) peut recouvrir la carte du guide quand elle est en haut (à regarder sur téléphone).
- Bug existant signalé, hors lot : le raccourci d'écran `clients` de l'assistant décide « téléphone » à 640 px (au lieu de 1 023 px), donc entre 641 et 1 023 px il ouvre un menu caché. Le guide utilise son propre seuil 1 023 px.
- `aria-hidden` : relevé avec une fenêtre ouverte, la racine du guide (`[data-testid=guide-root]`) n'a **pas** `aria-hidden` (ni elle ni un parent).

### Tests

- `npm run test:guides-bureau` (Deno, `admin-tours.test.ts`) : 48 fiches ↔ `GUIDE` (ids figés, 50 entrées), 1 à 5 étapes sur ordinateur **et** sous 1 024 px (menu ☰ compris), phrases ≤ 140 caractères, vouvoiement, jargon (« anneau » interdit : le patron voit un cadre jaune), « Cliquez » / « Touchez » avec un contrôle de grammaire sous 1 024 px (« touchez sur », « puis sur »), libellés du ☰ (pas le « Coûts » de la barre), le crayon « du client voulu », l'étape qui suit les Réglages ouvre la fenêtre, recherche stricte (`constructor`, `__proto__`), chaque ancre posée, une ancre = un élément sauf la liste `DUAL` (avec la raison), aucune ancre inutilisée, **aucune ancre sur un geste qui agit sur une ligne**, libellés cités présents dans le code, verrous de texte (verrouillage des heures, « à partir du jour », durée et lecture seule du support, « Ne cliquez pas »), liens `guide:<id>` des voies locale et modèle, faux positifs (« Quel Martin ? », demande de rédaction, réponse chiffrée), consigne identique, une seule fabrique du bouton, `tourStep` sans écriture.
- `npm run test:guides-bureau-ecrans` (`scripts/tests/guides-bureau-lot7.mjs`, après `npm run build`) : la vraie page `/admin` dans un vrai navigateur, 1 280, 1 100, 768 et 390 px ; l'anneau **pile** sur la cible, les parcours au vrai clic, « Suivant » seul sur les 48 fiches à 1 280 et 390 px, saisies préservées, Échap, réseau coupé, la liste des réserves (2 chantiers), « Un seul salarié ? » puis l'export d'équipe, la fermeture au franchissement de 1 024 px, **aucune écriture depuis l'apparition de la carte** (liste blanche nommée des seules lectures par RPC).

Captures à 390 px : `docs/captures-lot7-fin/` `01` à `05` (la réponse avec les deux boutons, l'anneau sur une ligne du menu ☰, l'anneau dans la fenêtre Salariés, l'étape des Réglages avec la rubrique repliée, la ligne du support) ; `06` à `08` pour la console support (voir plus bas).

### Mise en ligne : front d'abord, fonction ensuite

1. **Le front** (release) : sans le bouton côté fonction, rien ne change pour le patron.
2. **Puis la fonction `assistant`** (redéploiement par fichier-pointeur ; elle emporte `_shared/admin-tours.ts` et `_shared/worker-tours.ts`). Aucune migration.
3. Dire aux patrons de **recharger la page** : dans l'autre ordre, l'ancien écran reçoit un bouton qui ne répond pas.

### Tester sur téléphone (390) et tablette (768)

« Comment j'ajoute un salarié ? » : deux boutons ; « Me guider pas à pas » replie l'assistant, le ☰ s'ouvre, l'anneau suit « Salariés », « Nouveau salarié » puis « Envoyer l'invitation » (sans rien envoyer). « Comment je règle la caisse congés ? » : une rubrique à ouvrir soi-même. « Comment je déplace une intervention ? » : le message « sur ordinateur ». « Comment je réponds à une demande de congé ? » : l'anneau entoure la liste des demandes, pas une coche. La Borne n'affiche pas de nouveau code tant qu'on ne touche pas « Borne ».

## La console du support BEMEXO (`/support`)

Il n'y a **pas d'assistant côté support** : un petit bouton **« Me guider pas à pas »** est donc sur la page elle-même, à droite du titre « Support BEMEXO » (sur téléphone, il passe sous le titre). Même composant (`guide-tour.tsx`), mêmes règles que le bureau : le guide **montre, il ne fait jamais**. Il n'appelle ni « Se connecter », ni « Valider », ni « Entrer », ni « Quitter » (les deux derniers s'écrivent dans le journal du client), il ne lit aucune donnée.

### Les pièces

| Pièce | Rôle |
|---|---|
| `admin-tours.ts` : `SUPPORT_TOUR`, `supportStepsFor(état, petitEcran)` | La fiche : 7 étapes, chacune dit dans quels **états de la console** elle s'affiche. Hors `ADMIN_TOURS` : l'assistant du bureau ne la lance jamais |
| `components/support-console.tsx` | Le bouton `data-testid="support-guide-open"`, l'état du guide, `<GuideTour>`, et les 6 ancres `data-guide="support-console.…"` (`connexion`, `qr`, `code`, `valider`, `entreprises`, `quitter`) |
| `app/support/page.tsx`, `app/apercu/acces-support/page.tsx` | **Inchangées** : la console porte tout (la démo d'aperçu reçoit donc le bouton aussi) |

### Ce que dit la fiche, état par état

| État de la console | Bouton | Étapes |
|---|---|---|
| `loading` (on ne sait pas encore qui est là) | non | — |
| `not-staff` (patron, salarié ou compte non support : « Accès réservé ») | **non** | — |
| `signed-out` (personne de connecté) | oui | 1 : « Cliquez sur « Se connecter » avec le compte support, puis revenez sur cette page. » |
| `enroll` (première fois : QR code) | oui | 3 : le QR code, la case du code à 6 chiffres, « Valider » |
| `challenge` (double vérification) | oui | 2 : la case du code, « Valider » |
| `ready` (liste des entreprises) | oui | 1 : « Cliquez sur « Entrer » à côté de l'entreprise voulue. S'il n'y en a aucune, le patron doit d'abord l'autoriser. » |
| `inside` (déjà entré chez un client) | oui | 1 : « Vous êtes en lecture seule. Cliquez sur « Quitter » quand vous avez fini. » |

« Cliquez » devient « Touchez » sous 1 024 px (même dérivation que le bureau). Le bouton « Quitter » est bien « Quitter » à l'écran (pas « Sortir »). Sur téléphone, l'étape du QR code dit de scanner avec un autre appareil **ou de toucher l'œil** pour voir la clé (on ne scanne pas l'écran qu'on tient). Sous 480 px, le bouton « Me guider pas à pas » prend toute la largeur sous le titre (titre et bouton ne tiennent pas sur une ligne).

### Règles de sécurité

- **« Entrer » n'est jamais entouré.** L'ancre `support-console.entreprises` est sur la **liste** des entreprises (ou sur la phrase « Aucune pour l'instant… » quand il n'y en a aucune) ; la phrase dit de choisir l'entreprise voulue. Le test interdit toute ancre sur le bouton « Entrer » (`support-enter`) et sur `support-console.entrer`.
- **Un visiteur non connecté n'apprend rien de plus que la page publique** : sa fiche se limite à « Se connecter » (le DOM ne contient d'ailleurs que cette ancre, les autres états n'existent pas à l'écran). La double vérification, la liste des entreprises et la lecture seule ne sont dites qu'aux états atteints **après** `support_is_staff` vrai (et la double vérification passée pour `ready` et `inside`).
- **Un changement d'état ferme le guide** (code validé, « Quitter »…) ; il ne se rouvre pas tout seul.
- **Rien n'est lu au rendu** : la page est exportée en statique. La largeur de l'écran (`matchMedia`, seuil 1 023 px) n'est lue **qu'au clic** sur le bouton, et les étapes sont rangées dans l'état : `<GuideTour>` repart de zéro quand il reçoit de nouveaux objets à chaque rendu (bug trouvé et corrigé pendant les essais : l'anneau clignotait sur la page d'aperçu).
- Le CSS de la console ne contient **aucune apostrophe** (elles font échouer l'hydratation React : erreurs 418/423/425) ; le test le vérifie.
- La case du code a `autoFocus` et la carte du guide prend le focus à l'ouverture : le curseur sort de la case, mais elle reste utilisable (un clic dedans, 6 chiffres, « Valider » s'active) ; testé.
- « Entrer » recharge la page (`/admin`) : le guide s'arrête là. Après « Se connecter », la personne arrive sur `/admin` et doit revenir sur `/support` (dit dans la phrase 1).

### Décision à valider par Ergun

Le bouton est visible aussi d'un visiteur **non connecté** (`signed-out`), mais sa fiche se limite à « Se connecter ». Si Ergun préfère « support vérifié seulement » (`ready` et `inside`), il suffit de retirer `signed-out`, `enroll` et `challenge` des fiches `connexion`, `qr`, `code` et `valider` (et d'adapter les chiffres du test).

### Tests

- `npm run test:guides-bureau` (Deno) : les 6 ancres distinctes, 1 / 3 / 2 / 1 / 1 étape selon l'état et **0 pour `loading` et `not-staff`** (aux deux largeurs), phrases ≤ 140 caractères au vouvoiement, « Touchez » sous 1 024 px, libellés « Se connecter », « Valider », « Entrer », « Quitter » présents dans `support-console.tsx` et « Sortir » absent, ancres posées une fois (la liste des entreprises : sur `.sc-list` et sur la phrase vide), jamais d'ancre sur « Entrer », fiche `signed-out` sans « QR », « Valider », « Entrer » ni « Quitter », pas d'apostrophe dans le CSS, `window` / `matchMedia` une seule fois (le gestionnaire du clic), aucune action de la console appelée par le guide, pages `app/support` et `app/apercu/acces-support` non touchées.
- `ONLY=s node scripts/tests/guides-bureau-lot7.mjs out docs/captures-lot7-fin` (après `npm run build`) : la vraie route `/support` avec une base simulée (`support_is_staff`, double vérification par le jeton et le facteur TOTP) et `/apercu/acces-support?demo=support`, à 1 280 et 390 px. Anneau **pile** sur « Se connecter », le QR code, la case du code, « Valider », la **liste** des entreprises (plus grande que « Entrer » et qui le contient) ou la phrase vide, « Quitter » ; pas de bouton en `loading` ni `not-staff` ; Échap, « Fermer », focus rendu au bouton ; la case du code reste utilisable ; sur la démo, le guide se ferme quand le code est validé ; **aucune écriture depuis l'apparition de la carte** (aucune RPC `support_enter` / `support_exit`, aucun `/auth/v1/factors`), « Entrer » jamais cliqué. L'état `enroll` passe par la vraie route avec un mock de la création du facteur (la démo d'aperçu démarre à la double vérification) : cette requête part au chargement de la page, **avant** la carte du guide.

Captures à 390 px : `docs/captures-lot7-fin/06-support-enroll.png`, `07-support-liste-des-entreprises.png`, `08-support-pret.png` (démo : liste des entreprises).

### Mise en ligne

Le front seul suffit (aucune fonction ni migration pour le support). À tester sur téléphone : `/support` connecté avec le compte support (bouton visible, anneau sur la liste), connecté en patron (« Accès réservé », pas de bouton), déconnecté (« Se connecter » seulement).
