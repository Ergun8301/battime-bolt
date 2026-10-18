# Baseline des scripts navigateur qui visent `/poseur`

Étapes 0 et 1 du plan d'intégration du design salarié (`docs/design-brief/audit-salarie/03-plan-integration.md` §5.2, annexe B) : **aucun changement visible**, donc une preuve par rejeu. Ce fichier consigne l'état d'**avant** (commit `61a1b87`, origin/main), puis ce que les scripts donnent **après** chaque étape.

## Comment rejouer

```
npm run build
ln -s /opt/node22/lib/node_modules/playwright/node_modules/playwright-core node_modules/playwright-core   # temporaire, à supprimer ensuite
node scripts/tests/<script>.mjs out <dossier-de-captures-hors-dépôt> <port>
node scripts/tests/captures-reference-salarie.mjs out <dossier>          # 12 captures de référence
node scripts/tests/comparer-captures.mjs docs/design-brief/integration/captures-reference <dossier> [tolérance]
npm run budget -- build.log && npm run budget:css                       # poids JS puis poids CSS
```

Conditions de la baseline : build de production de `61a1b87` copié à part (`out-avant`), chaque script lancé contre cette copie (les scripts n'écrivent jamais dans `out/`), en trois voies parallèles (ports distincts, délai de 1 500 s), captures dans un dossier hors dépôt. Un script qui échoue pour une raison d'infrastructure (port occupé, délai sous charge) est **rejoué seul** ; la valeur retenue est celle du rejeu, et la remarque dit pourquoi. Les nombres sont ceux que le script imprime lui-même (« N ✅ / M ❌ »).

## État d'avant : ✅ / ❌ de chacun des 31 scripts

| Script | Lignes | Repères lus | ✅ / ❌ avant | Remarque |
|---|---|---|---|---|
| `guides-lot7` | 629 | 35 | **681 / 1** | 1 ❌ à chaque passe mais jamais le même (« tel infos 3 », « tel-390 », « petit-360 : bouton close ») : géométrie instable du script, 3 passes. |
| `pause-lot3bis` | 731 | 30 | **79 / 0** | 1re passe : 78 ✅ / 1 ❌ (P3, minutage sous charge) ; rejoué seul : vert. |
| `pointage-lot10` | 769 | 26 | **110 / 0** |  |
| `heures-lot1` | 475 | 21 | **37 / 0** |  |
| `bureau-lot2` | 739 | 18 | **80 / 0** |  |
| `chantier-termine-lot23` | 794 | 18 | **111 / 0** |  |
| `salarie-lot9` | 341 | 18 | **53 / 0** |  |
| `panier-lot3bis` | 750 | 17 | **76 / 0** |  |
| `missions-lot4` | 930 | 16 | **148 / 0** |  |
| `reserves-lot11` | 585 | 16 | **68 / 0** |  |
| `fenetres-lot11` | 453 | 13 | **120 / 0** |  |
| `brouillons-lot2` | 633 | 12 | **49 / 0** |  |
| `salarie-lot10` | 258 | 12 | **26 / 0** |  |
| `salarie-lot12` | 252 | 12 | **28 / 0** |  |
| `formations-lot6` | 860 | 11 | **115 / 0** |  |
| `site-rapide-lot5` | 522 | 11 | **94 / 0** |  |
| `taches-heures-lot9` | 718 | 8 | **75 / 0** |  |
| `assistant-multi` | 731 | 5 | **120 / 0** |  |
| `assistant-historique` | 924 | 4 | **185 / 0** | 1re passe en 3 voies : 184 ✅ / 1 ❌ (H6, minutage sous charge) ; rejoué seul : vert. |
| `documents-lot24` | 713 | 4 | **141 / 1** | 1re passe : interrompu (délai Playwright en H0, sous charge) ; rejoué seul : 141 ✅ / 1 ❌, stable : E1 compare `git diff origin/integration/bemexo-ia` (dépend de la branche, pas de l'écran). |
| `traces-lot3` | 487 | 4 | **65 / 0** |  |
| `enregistreur-lot14` | 1500 | 3 | **300 / 0** |  |
| `heures-sures` | 569 | 3 | **66 / 0** |  |
| `salarie-lot14` | 257 | 3 | **20 / 0** |  |
| `videos-lot13` | 1015 | 3 | **110 / 0** |  |
| `ia-formule-lot6` | 245 | 2 | **110 / 0** | 1re passe : port occupé (EADDRINUSE, infrastructure) ; rejoué seul : vert. |
| `mot-de-passe` | 268 | 2 | **74 / 0** |  |
| `requetes-lot29` | 440 | 2 | **81 / 0** |  |
| `planning-copier` | 830 | 1 | **159 / 0** |  |
| `qr-fixe-lot12` | 679 | 1 | **111 / 0** |  |
| `borne-allumee` | 562 | 0 | **74 / 0** |  |
| **Total (31 scripts)** | 19659 | | **3566 / 2** | |

Lecture : 29 scripts sont verts. Deux ne le sont pas **avant** tout changement, et resteront à 1 ❌ après : `guides-lot7` (un contrôle de géométrie qui change d'une passe à l'autre) et `documents-lot24` (E1, qui compare `git diff` à une branche d'intégration de l'environnement). `requetes-lot29` : « 18 requêtes au chargement (budget ≤ 18) », chaîne `month_closures → time_entry_edits` = 2.

Les captures que ces scripts écrivent dans `docs/captures-*` ne sont pas versionnées par cette étape (certains scripts réécrivent des PNG déjà suivis : ils ont été remis tels quels).

## Après l'étape 0 : helper de navigation commun

`scripts/tests/navigation-salarie.mjs` (`ouvrirMenuCompte`, `ouvrirVue`, `ouvrirEditeur`, `lireToasts`, `BOUTON_MENU_COMPTE`) remplace les gestes écrits à la main dans les 12 scripts qui passent par le menu du compte : même sélecteurs, mêmes attentes (les pauses sont passées en options), aucun changement de comportement. Quand le menu changera de forme (nouvelle barre du bas, page « Plus »), il n'y aura qu'un fichier à adapter. Les 12 scripts, rejoués contre le **même** build d'avant :

| Script | ✅ / ❌ avant | ✅ / ❌ avec le helper | Identique | Remarque |
|---|---|---|---|---|
| `chantier-termine-lot23` | 111 / 0 | 111 / 0 | oui | 1re passe 110 ✅ / 1 ❌ (A2, ≥ 44 px, géométrie sous charge) ; rejoué seul : 111 ✅ / 0 ❌. |
| `enregistreur-lot14` | 300 / 0 | 300 / 0 | oui |  |
| `fenetres-lot11` | 120 / 0 | 120 / 0 | oui |  |
| `formations-lot6` | 115 / 0 | 115 / 0 | oui |  |
| `missions-lot4` | 148 / 0 | 148 / 0 | oui |  |
| `panier-lot3bis` | 76 / 0 | 76 / 0 | oui | 1re passe : délai à l'alerte d'export du bureau (le script d'origine échoue pareil à ce moment-là) ; rejoué seul : 76 ✅ / 0 ❌. |
| `pause-lot3bis` | 79 / 0 | 79 / 0 | oui |  |
| `reserves-lot11` | 68 / 0 | 68 / 0 | oui |  |
| `site-rapide-lot5` | 94 / 0 | 94 / 0 | oui |  |
| `taches-heures-lot9` | 75 / 0 | 75 / 0 | oui |  |
| `traces-lot3` | 65 / 0 | 65 / 0 | oui |  |
| `videos-lot13` | 110 / 0 | 110 / 0 | oui |  |

**12 / 12 scripts identiques** à l'état d'avant.


## Après l'étape 4 (cartes de chantier, réunion, tâches, journée vide : `?ui=2` seulement)

Build de production de la branche, mêmes 31 scripts, mêmes conditions (3 voies, captures hors dépôt) : **tous identiques à l'état d'avant**, aucun script v1 modifié.

| Mesure | Avant | Après |
|---|---|---|
| 31 scripts navigateur (✅ / ❌) | 3 566 / 2 | **3 567 / 1** (`guides-lot7` 682 / 0 : son ❌ instable n'est pas sorti cette fois ; `documents-lot24` 141 / 1 : E1, inchangé) |
| 12 captures de référence v1 | identiques | identiques ; `07-copier-journee.png` diffère de 2 pixels (ligne y = 460) **une fois sur deux, aussi sur le build d'avant l'étape 4** (4 rejeux sur `ad9f2c5` : 4 fois) : animation du calendrier, pas un changement |
| `reserves-lot11` et `formations-lot6` rejoués en `/poseur?ui=2` | — | **68 / 0** et **115 / 0** (la copie ne change que quatre phrases attendues : la pastille chiffrée du bandeau n'est plus dite, « Formations » devient « Formations à voir », l'adresse finit par `?ui=2`) : aucune fonction ne disparaît |
| `/poseur` (First Load JS) | 275 kB (max 280) | 275 kB (max 280) |
| `/admin` | 359 kB | 359 kB |
| CSS `/poseur` gzip (max 32 kB) | 26,4 | 28,2 |
| `npm run test:registre` | 139 / 3 ❌ (ancre du menu décalée de 3 lignes, `clics.snapshot`) | 142 / 0 ; `dettes.json` et `ids.snapshot.json` inchangés |
| `test:creneaux`, `test:missions`, `test:salarie-vue`, `test:guides` | 5/5, 19/19, 14/14, 10/11 (ancres en double) | 5/5, 20/20, 14/14, 11/11 |

Preuve de fidélité (planche | implémentation) : `node scripts/tests/fidelite-salarie.mjs out docs/design-brief/integration/captures-fidelite 4392` : 99 ✅ / 0 ❌ ; 12 images de moins de 150 ko dans `captures-fidelite/` (E05 ×2, E04 ×2, E03, E25, E05b, E05c, E12, E42, E14, E29).

## Après l'étape 5 (feuilles du bas : éditeur, questions d'envoi, conflit de pointage, réserves… : `?ui=2` seulement)

Build de production de la branche, mêmes 31 scripts, mêmes conditions (3 voies, captures hors dépôt, copie du build à part) : **tous identiques à l'état d'avant**, aucun script v1 modifié.

| Mesure | Avant | Après |
|---|---|---|
| 31 scripts navigateur en v1 (✅ / ❌) | 3 567 / 1 | **3 567 / 1** (`documents-lot24` 141 / 1 : E1, inchangé ; `guides-lot7` 682 / 0) : chaque script donne le nombre d'avant |
| 12 captures de référence v1 | identiques | **12 / 12 identiques octet pour octet** (même `07-copier-journee.png`) |
| `/poseur` (First Load JS, max 280) | 275 kB | **276 kB** |
| `/admin` | 359 kB | **359 kB** (la variante « feuille » de `ui/dialog.tsx` est tirée dans `/admin` ; le clavier et le retour Android restent côté salarié, `ChantierDocuments` reçoit `feuille` en propriété et n'importe plus la coque) |
| CSS `/poseur` gzip (max 32 kB) | 28,2 | **30,4** : `feuilles-v2.css` ≈ 2,2 kB, relevé dans `scripts/bundle-budgets.json` avec sa justification (le plafond n'est pas touché) |
| `npm run test:registre` | 142 / 0 | 142 / 0 ; `clics.snapshot.json` : `poseur-day.tsx` 49 → 50 (le ✕ de la feuille de l'éditeur, commande officielle du README du registre) ; `dettes.json` et `ids.snapshot.json` inchangés, aucun plafond de dettes monté |
| `test:creneaux`, `test:missions`, `test:salarie-vue`, `test:guides` | 5/5, 20/20, 14/14, 11/11 | 5/5, 20/20, 14/14, 11/11 |
| `npm run typecheck` | vert | vert |

### Rejeu en `/poseur?ui=2` (copies générées, jamais les originaux)

`node scripts/tests/ui2-copies.mjs` écrit `scripts/tests/ui2-<nom>.mjs` (ignorés par git) : l'original mot pour mot, l'adresse `/poseur` devenue `/poseur?ui=2`, plus la table `ADAPTATIONS` du générateur (chaque ligne dit ce qui change à l'écran et pourquoi : un libellé ou un repère qui change de forme, jamais une fonction qui disparaît). Les 11 copies, contre le même build :

| Script (copie `ui2-…`) | ✅ / ❌ en v1 | ✅ / ❌ en `?ui=2` | Adaptations |
|---|---|---|---|
| `pointage-lot10` (les 6 cas du conflit, après le scan, retour Android) | 110 / 0 | **110 / 0** | aucune |
| `pause-lot3bis` (puces, question de pause, éditeur) | 79 / 0 | **79 / 0** | 2 : puces de 44 px de largeur naturelle au lieu de 4 cellules égales de 60 px ; la Semaine v2 ne liste plus « pause 1 h 15 » ligne par ligne |
| `heures-lot1` | 37 / 0 | **37 / 0** | aucune |
| `heures-sures` | 66 / 0 | **66 / 0** | aucune |
| `brouillons-lot2` | 49 / 0 | **49 / 0** | aucune |
| `documents-lot24` | 141 / 1 | **141 / 1** | aucune ; le ❌ est E1 (compare `git diff` à une branche d'intégration), le même qu'en v1 |
| `salarie-lot12` (éditeur) | 28 / 0 | **28 / 0** | aucune |
| `chantier-termine-lot23` | 111 / 0 | **111 / 0** | 5 : « Autre chantier » reste proposé sans résultat ; « POINTAGE EN COURS · DEPUIS » ; Semaine v2 en 7 lignes (flèche « Semaine précédente », ligne repérée par son `aria-label`) |
| `fenetres-lot11` (40 fenêtres × 3 tailles, dont celles du salarié) | 120 / 0 | **120 / 0** | aucune |
| `reserves-lot11` (liste et « Lever la réserve ») | 68 / 0 | **68 / 0** | aucune |
| `formations-lot6` | 115 / 0 | **115 / 0** | 4 (celles de l'étape 4 : pastille chiffrée non dite, « Formations à voir », adresse en `?ui=2`) |

Preuve de fidélité (planche | implémentation) : `node scripts/tests/fidelite-salarie.mjs out docs/design-brief/integration/captures-fidelite 4392` : **339 ✅ / 0 ❌** ; 35 images de moins de 180 ko dans `captures-fidelite/` (les 12 de l'étape 4, puis 13 à 35 : éditeur E21 à 390 × 844 et 360 × 640, clavier ouvert, E22, E22b, E22c, E39, E40, E08, E09, E09b, E10, E13, E16, E24, E23 ×3, E30c, E20a, E20, E35, E33). Chaque feuille est mesurée sur elle-même (cibles ≥ 44 px, texte ≥ 12 px, contrastes ≥ 4,5:1, dans l'écran, bouton principal visible, un seul voile et un seul ✕, angles de 28 px, focus au clavier visible) ; le retour Android ferme six couches (éditeur, horaires prévus, pause, vérification, journée déjà envoyée, réserves) ; hors-ligne, « + » → chantier → « OK » garde la saisie sur le téléphone (R1).

### Écarts à la planche, décidés et écrits
- **Libellés et repères du code** : titre « Horaires prévus par le bureau », « Chantier Maison Démo » / « Nouveau chantier » (titres de l'éditeur), « Annuler » comme nom accessible du ✕ de l'éditeur (`.bt-ed-cancel` gardé), « Fermer » pour le ✕ des fenêtres Radix (l'ancien « Close » était en anglais), « Documents » sans nombre, durée « 3h58 » (formatage du code). Les phrases de la planche absentes du code ne sont pas ajoutées.
- **Ordre des boutons** : celui du code (le principal en premier dans « Terminer le pointage… » et « Oui, envoyer ma journée »), pas celui de la planche.
- **Molette** : le tiroir « Réglage de l'heure » reste sombre (la molette `TimeCylinder` est inchangée et ses chiffres sont clairs) ; il reçoit le petit mot, le titre et les angles de la planche.
- **Kickers** : « AVANT L'ENVOI » sans compteur ni « PLAGE 1 SUR 2 » (le code ne connaît pas le nombre de plages au moment de la question).
- **Retour passager** : Sonner reste en haut de l'écran à l'étape 5 (la place « au-dessus de la barre » de la planche est venue à l'étape 6, voir plus bas).
- **E22 « Sur quel chantier ? »** n'est pas une feuille à part : le choix du chantier est la première section de la feuille de l'éditeur, comme dans le code ; pas de bouton « Continuer ».

## Après l'étape 8 (l'assistant v2, planche AS1 à AS10 : `?ui=2` seulement)

Variante v2 de `components/assistant-panel.tsx` (props `v2` et `prenom`, posées par `worker-assistant.tsx` seulement quand `useUi2()` est vrai : aperçu + `?ui=2`) et feuille `components/design/salarie/assistant-v2.css`. La logique IA, les fonctions Edge, l'ancien panneau (`.as-*`) et le bureau ne changent pas.

| Preuve | Résultat |
|---|---|
| 31 scripts v1 rejoués sur le build (3 voies, `lane.sh`) | **3 567 ✅ / 1 ❌**, le même 1 ❌ (`documents-lot24` E1) ; `guides-lot7` 682 / 0 (son contrôle de géométrie instable est passé) |
| `captures-reference-salarie` + `comparer-captures` | **12 / 12 identiques octet pour octet** |
| `assistant-panneau` (bureau), `assistant-effacer` | 10 / 0, 19 / 0 |
| `assistant-historique` et `assistant-multi` rejoués en `?ui=2` (copies `ui2-*.mjs`, ignorées par git : l'original, `/poseur` devenu `/poseur?ui=2`, et seulement les sélecteurs de classe doublés : `.as-bar textarea` → `.dz-as-barre textarea`, `.as-bot` → `.dz-as-groupe .dz-as-bot`, `.as-me`, `.as-typing` → `.dz-as-attente`, `.as-body` → `.dz-as-corps`, `.as-sugg button` → `.dz-as-suggestions button`, `.as-hname` / `.as-hdate`) | **185 / 0** et **120 / 0** : mêmes gestes, mêmes repères (`data-testid`, `aria-label`), aucune adaptation de comportement |
| `node scripts/tests/fidelite-assistant.mjs out docs/design-brief/integration/captures-fidelite 4393` | **110 ✅ / 0 ❌** ; 15 images « planche \| implémentation » de moins de 145 ko (`AS1` à `AS10`, 390 × 844 et 360 × 640), cibles ≥ 44 px, texte ≥ 12 px, contrastes ≥ 4,5:1, aucun défilement horizontal, garde de 700 ms, retour au chat, pastille, ancien panneau sans `?ui=2` |
| `test:salarie-vue` (16), `test:registre` (142), `test:ouvreurs` (4), `test:assistant-aide` (3), `test:guides` (11), `typecheck`, `build` | verts |
| Poids | `/poseur` 276 → 278 kB (max 280), `/admin` 359 → 360 kB (max 363) ; CSS du premier chargement `/poseur` 30,4 kB gzip (inchangé : la feuille de l'assistant, ≈ 3,0 kB gzip, est chargée avec le chunk de l'assistant) |

### Écarts à la planche, décidés et écrits
- **En-tête** : marge haute = zone sûre du téléphone + 14 px (comme la coque v2) ; la planche dessine 42 px de barre d'état de téléphone, qui n'existent pas dans l'application.
- **« N QUESTIONS RESTANTES »** : n'apparaît qu'après la première réponse (le serveur ne donne le compte qu'alors) ; avant : « ASSISTANT BEMEXO ».
- **« Me guider pas à pas » sur l'accueil (AS1, S89)** : pas ajouté à l'accueil (il faudrait un appel au serveur pour savoir quelle fiche proposer) ; il reste le lien sous une réponse, dessiné en pastille de 44 px.
- **Dictée** : la planche réunit la langue et le micro dans « FR·TR » ; le turc étant en production, la rangée « Dictée : Français / Türkçe » est gardée au-dessus de la saisie (pastilles de 44 px).
- **« + Nouveau chat » et « Historique »** : en haut du corps pendant toute la conversation (la planche ne les montre que sur l'accueil, défilés ailleurs).
- **Envoyer (↑)** : gris tant que le champ est vide (états inactifs en couleurs, README) ; la planche le montre jaune.
- **Cartes** : les textes sont ceux du code (« Fait — 1 créneau noté (3 h 30). », chantier « Nom · Ville »), « Annuler / Modifier » dans la carte verte (la planche les met dessous) ; « Fiche à confirmer » reste la fiche du code (champs modifiables, « Tout confirmer » en jaune puis « Ignorer »), pas la carte sombre de la planche.
- **AS7 / AS8** : la pastille « ASSISTANT · EN ATTENTE » + « Reprendre » existe (un écran ouvert depuis l'assistant sur téléphone ; elle se pose au-dessus des feuilles et de l'éditeur, comme la carte du guide), mais SANS formulaire pré-rempli : le préremplissage (champs jaunes, « Abandonner la modification ? », « Formulaire fermé, rien n'a été ajouté ») est la nouvelle fonction du plan (R9, étape 8 « API de préremplissage »), pas faite ici.
- **Retour Android** : pas branché sur l'assistant (un `history.back()` asynchrone au moment d'ouvrir un écran fermerait la couche que `poseur-day.tsx` vient de poser, qui lit le même marqueur `btLayer`).
- **Garde de 700 ms** : « Oui » de « Supprimer cette conversation ? », de « Tout effacer ? » et de « Abandonner cette action ? » ignore les touchers des 700 premières millisecondes (`aria-disabled`, couleurs d'inactif) ; ni la planche ni le code d'avant ne la dessinaient.
- **Historique** : dates « Aujourd'hui · 09:12 », « Hier · 18:40 », « 12 oct. · 07:55 » (`dateConversation`, règle pure testée) à la place de « aujourd'hui », « hier », « il y a 3 jours » ; « Une action est en cours… » garde le texte actuel (plus long).
- **Textes de l'accueil et de l'aide** : ceux de la planche (« Bonjour Sam. Demandez-moi de noter vos heures… », « Rien ne part avant « Envoyer » · français ou turc »), à la place de ceux du code d'avant, seulement en v2.
- **Registre** : `clics.snapshot.json` (et son test) passent de 567 à 591 gestionnaires (`assistant-panel.tsx` 22 → 46 : mêmes gestes que l'ancien panneau, aucune écriture nouvelle, aucune capacité nouvelle).

## Après les étapes 6 et 7 (Semaine, Mois, Historique, « Plus », équipe, congés, informations, formations, documents, retour passager, /pointer : `?ui=2` seulement)

Build de production de la branche, copié à part (`out-run`), mêmes 31 scripts en trois voies : **tous identiques à l'état d'avant**, aucun script v1 modifié.

| Mesure | Avant | Après |
|---|---|---|
| 31 scripts navigateur en v1 (✅ / ❌) | 3 567 / 1 | **3 567 / 1** (`documents-lot24` 141 / 1 : E1, inchangé ; `guides-lot7` 682 / 0) : chaque script donne le nombre d'avant. 1re passe : `enregistreur-lot14` 299 / 1 (« 100 Mo sur 100 : jauge visible », délai sous charge, écran du bureau) ; rejoué seul : 300 / 0 |
| 12 captures de référence v1 | 12 / 12 | **11 / 12** pixel pour pixel ; `07-copier-journee.png` diffère de 2 pixels (ligne y = 460) **aussi sur le build du commit précédent `d9a0a2c`, reconstruit à part** (3 rejeux sur chaque : mêmes 2 pixels, mêmes octets) : animation du calendrier, pas un changement |
| `/poseur` (First Load JS, max 280) | 276 kB | **278 kB** |
| `/admin` (max 363) · `/pointer` (max 151) | 359 · 147 | **359 · 147** |
| CSS `/poseur` gzip | 30,4 (max 32) | **32,9 (max relevé à 35)** : `vues-v2.css` ≈ 2,4 kB, justification écrite dans `scripts/bundle-budgets.json` |
| CSS `/pointer` gzip | 12,1 (max 18) | **14,3 (max 18 inchangé)** : `pointer-v2.css` ≈ 2,2 kB |
| `npm run test:registre` | 142 / 0 | 142 / 0 ; `clics.snapshot.json` : +1 fichier, +13 gestionnaires (commande officielle du README du registre) ; l'ancre dynamique du menu (`app/poseur/page.tsx`) passe de la ligne 588 à 669 ; `dettes.json` et `ids.snapshot.json` inchangés, **aucun plafond de dettes monté** |
| `test:creneaux`, `test:missions`, `test:salarie-vue`, `test:guides` | 5/5, 20/20, 14/14, 11/11 | 5/5, 20/20, 14/14, 11/11 (`REPETEES` de `worker-tours.test.ts` : 6 repères montés deux fois, jamais ensemble, avec la raison) |
| `npm run typecheck`, `npm run test:budget` | vert | vert |
| `requetes-lot29` en `?ui=2` | non rejoué | **18 requêtes au chargement** (budget ≤ 18). Découvert au rejeu : 21 en `?ui=2` depuis l'étape 3, la lecture « journées à envoyer » partait deux fois (avant et après la lecture du drapeau) ; corrigé dans `app/poseur/page.tsx` : le drapeau est lu tout de suite, une seule lecture, mêmes colonnes. En v1 : même requête, mêmes colonnes |

Preuve de fidélité (planche | implémentation) : `node scripts/tests/fidelite-salarie.mjs out docs/design-brief/integration/captures-fidelite 4392` : **518 ✅ / 0 ❌** ; 58 images de moins de 180 ko dans `captures-fidelite/` (les 35 d'avant, puis 36 à 58 : Semaine 360 × 640, Mois, Historique, Plus E26 ×2, équipe E27 ×2, congés ×2, informations, formations, lecteur de vidéo, documents du chantier, retour passager, P01 ×2, P02, P03, P03b, P03c, P00, P00b, P04). **Ce qui est dessiné par la planche est comparé à elle (E25, E26, E27, E20b, P00 à P04) ; le Mois, l'Historique, les congés, les informations, les formations et les documents n'y sont PAS dessinés (README § 3, S50 à S68) : l'image met à gauche l'écran voisin (même carte, même feuille, mêmes jetons) et le dit dans son titre.** Treize anciennes images ont bougé et ont été refaites : neuf d'une à quelques centaines de pixels (anti-crénelage, colonne décalée d'une ligne de pixels), quatre davantage (E12, E42, E29, E35 : même décalage, et le retour passager est maintenant au-dessus de la barre).

### Rejeu en `/poseur?ui=2` : 18 copies générées (11 d'avant + 7 de plus)

Toutes **vertes**, contre le même build. Seules les copies sont adaptées (table `ADAPTATIONS` de `scripts/tests/ui2-copies.mjs`, chaque ligne dit ce qui change à l'écran et pourquoi : un libellé, un repère ou un chemin qui change de forme, jamais une fonction qui disparaît).

| Script (copie `ui2-…`) | ✅ / ❌ en v1 | ✅ / ❌ en `?ui=2` | Adaptations (nouvelles à l'étape 6) |
|---|---|---|---|
| `salarie-lot14` (« Mon équipe » du chef) | 20 / 0 | **20 / 0** | 1 : « Mon équipe » est une page rangée dans « Plus » (entrée « Mon équipe », étiquette « chef »), plus une carte en haut de « Ma journée » : la copie y va par « Plus » → « Mon équipe » |
| `chantier-termine-lot23` | 111 / 0 | **111 / 0** | +2 (7 au total) : G7 et G10, « Mon équipe » par « Plus » |
| `traces-lot3` (Historique, « Interventions supprimées ») | 65 / 0 | **65 / 0** | 1 : le lien reste discret mais fait 44 px de haut au lieu de moins de 30 (cible tactile) |
| `qr-fixe-lot12` (/pointer#f=… en `?ui=2`, scanner, QR fixe) | 111 / 0 | **111 / 0** | 3 : « Arrivée enregistrée », « Départ enregistré », « Pointage non enregistré » s'écrivent en capitales espacées (planche) : `innerText` rend les capitales, la copie compare sans tenir compte de la casse |
| `salarie-lot9` | 53 / 0 | **53 / 0** | 4 : « POINTAGE EN COURS · DEPUIS hh:mm » ; carte noire à grand chrono (≤ 240 px) ; tuile Panier « Pris ✓ » |
| `salarie-lot10` | 26 / 0 | **26 / 0** | 1 : la mini-frise, `data-pointage` et la ligne d'aide « Le pointage en cours ne part pas » bougent quand le pointage apparaît : c'est leur rôle |
| `salarie-lot12`, `site-rapide-lot5`, `reserves-lot11`, `formations-lot6`, `fenetres-lot11`, `pointage-lot10`, `pause-lot3bis`, `heures-lot1`, `heures-sures`, `brouillons-lot2`, `documents-lot24` | 28, 94, 68, 115, 120, 110, 79, 37, 66, 49, 141 / 1 | **identiques** | celles de l'étape 5 (aucune pour la plupart) |
| `requetes-lot29` | 81 / 0 | **81 / 0** | 2 : les deux lectures « journées à envoyer » demandent plus de colonnes dans la même requête ; le nombre de requêtes ne change pas |

Total des 18 copies : 1 374 ✅ / 1 ❌ (le ❌ est E1 de `documents-lot24`, le même qu'en v1).

### Écarts à la planche, décidés et écrits (étapes 6 et 7)
- **« Plus » (E26) est le menu du compte, pas une liste nouvelle** : mêmes entrées, mêmes libellés (« Ma journée », « Ma semaine », « Mon mois », « Historique », « Réserves à lever » + compteur, « Formations à voir » + compteur, « Mes congés », « Mon équipe » (chef), « Changer ma photo », « Assistant BEMEXO », « Informations », notifications « Activer / Couper les notifications / Notifications bloquées », « Déconnexion »), mêmes `role=menu` / `menuitem`, mêmes repères `data-guide`. Les trois vues restent aussi dans la barre du bas (la planche ne les met que là). Les pastilles « PDF », « 1 en attente », « Activer » et la ligne « Interventions supprimées 60 jours · lecture seule » de la planche ne sont pas reprises : elles demandent des lectures de plus ou des textes que le code n'a pas (le lien « Interventions supprimées » reste dans l'Historique).
- **Nom de l'entreprise (kicker « ENTREPRISE TEST · POSEUR »)** : le salarié ne lit que 5 colonnes de `companies` (test `requetes-lot29`, 18 requêtes) et n'a donc pas le nom. Le petit mot dit « POSEUR » ou « CHEF D'ÉQUIPE » et ajoute le nom seulement quand la lecture commune l'a déjà (compte du bureau ou du support qui ouvre /poseur) : aucune requête de plus.
- **« Plus » est posée SUR l'écran en cours, qui reste monté dessous mais inerte** (`inert`, `aria-hidden`) : ouvrir et refermer ne relit rien (comme l'ancien menu déroulant) ; Tab ne sort jamais vers l'écran du dessous ; Échap, l'avatar et le bouton « Journée » la referment ; elle passe sous la barre Journée · Semaine · Mois · Plus, qui reste touchable.
- **« Mon équipe » (E27)** : une page (« Retour à ma journée », titre « Mon équipe ») à laquelle on va par « Plus » → « Mon équipe », et non plus une carte en haut de « Ma journée ». Le composant (`team-day.tsx`), ses droits, ses libellés et ses repères sont ceux d'avant ; la page lit en plus les chantiers actifs de l'entreprise À L'OUVERTURE (jamais au chargement : le chargement de /poseur reste à 18 requêtes). Le choix du salarié reste la liste déroulante d'avant (les trois pastilles de la planche changeraient le geste). Les guides « équipe » ouvrent cette page.
- **Mois, Historique, Mes congés, Informations, Formations, Documents du chantier** : non dessinés par la planche, restylés avec les mêmes jetons et les mêmes formes (cartes de la Semaine, feuille du bas, boutons de 44 px) ; contenu, libellés (y compris « Envoye » sans accent dans l'Historique), gestes et repères du code. « Mes congés » devient une feuille du bas (pied fixe : « Faire une demande » puis « Envoyer la demande » / « Annuler ») ; « Informations » aussi, et le retour du téléphone la referme. Les Documents du chantier étaient déjà une feuille : seul l'intérieur est restylé (actions de 44 px).
- **Semaine (E25)** : inchangée à l'étape 6 (en-tête « Ma semaine » et flèches gardés, décision du patron) ; une image à 360 × 640 s'ajoute.
- **Retour passager (Sonner)** : au-dessus de la barre du bas, à la hauteur MESURÉE de la barre (`--dz-barre-h`, jamais 170 px en dur), « Annuler » de 44 px, un seul Toaster pour tout le site qui choisit sa place PAR ROUTE (drapeau posé sur `<html>` par `/poseur` et `/pointer` seulement avec `?ui=2`, retiré en partant). Sans `?ui=2` : en haut au centre, comme avant (vérifié).
- **/pointer** : les huit écrans de la planche (P00, P00b, P01, P02, P03, P03b, P03c, P04) en trois ambiances (sombre ; rouge sombre pour le refus et l'erreur ; crème pour « annulé » et « rien à enregistrer »). Les textes sont ceux du code (la planche écrit « Hors zone », « QR expiré »… qui n'existent pas dans le code) ; le petit mot de la planche est le titre du code en capitales espacées. **P02 garde « Ouvrir mon espace »** (la planche l'avait retiré : fonction perdue, audit G1), en troisième ligne ; « Envoyer ma journée » est le bouton jaune. Sans `?ui=2` : la page garde sa feuille intégrée, sans aucune classe ni attribut de la v2 (vérifié).
- **Budget** : le JS des vues reste différé (`poseur-month`, `poseur-history`, `poseur-week`, formations, congés, équipe sont des morceaux chargés à l'ouverture ; « Mon équipe » n'est jamais préchauffée, pour que l'ancienne interface ne télécharge rien de plus).

## Après la bascule (étape 11 : le nouveau design est le défaut, `?ui=1` ramène l'ancien)

`lib/use-ui2.ts` : `UI2_PAR_DEFAUT = true` (un seul interrupteur pour tout défaire) ; `?ui=1` force l'ancien rendu pour la session (mémorisé en `sessionStorage`), `?ui=2` le rallume ; plus de condition « hôte d'aperçu ». `GUIDES_UI2 = true`. Le code v1 existe toujours.

**Les 31 originaux visent l'ancienne interface** : ils ne sont pas modifiés. Pour les rejouer en référence v1 : `node scripts/tests/ui2-copies.mjs --v1` écrit `scripts/tests/ui1-<nom>.mjs` (l'original + `?ui=1` devant chaque navigation vers `/poseur`, `/pointer` et `/apercu/assistant-salarie`, ignorés par git). Pour la preuve « défaut = v2 » : `node scripts/tests/ui2-copies.mjs --defaut` écrit les copies `ui2-<nom>.mjs` SANS `?ui=2` (mêmes adaptations, table `ADAPTATIONS`). Build de production de la branche, mêmes conditions (3 à 4 voies en parallèle, captures hors dépôt).

| Mesure | Résultat |
|---|---|
| 31 scripts v1 en `?ui=1` (✅ / ❌) | tous identiques à l'état d'avant (3 567 / 1) **sauf `guides-lot7`** : `pause-lot3bis` 79/0, `pointage-lot10` 110/0, `heures-lot1` 37/0, `bureau-lot2` 80/0, `chantier-termine-lot23` 111/0, `salarie-lot9` 53/0, `panier-lot3bis` 76/0, `missions-lot4` 148/0, `reserves-lot11` 68/0, `fenetres-lot11` 120/0, `brouillons-lot2` 49/0, `salarie-lot10` 26/0, `salarie-lot12` 28/0, `formations-lot6` 115/0, `site-rapide-lot5` 94/0, `taches-heures-lot9` 75/0, `assistant-multi` 120/0, `assistant-historique` 185/0, `documents-lot24` 141/1 (E1, inchangé), `traces-lot3` 65/0, `enregistreur-lot14` 300/0, `heures-sures` 66/0, `salarie-lot14` 20/0, `videos-lot13` 110/0, `ia-formule-lot6` 110/0, `mot-de-passe` 74/0, `requetes-lot29` 81/0 (18 requêtes), `planning-copier` 159/0, `qr-fixe-lot12` 111/0, `borne-allumee` 74/0. Rejeux : `formations-lot6` 114/1 la 1re fois (la copie `?ui=1` finissait l'adresse par `?ui=1` : `wp.url().endsWith('/poseur')`, adaptation du générateur), 115/0 ensuite ; `assistant-multi` / `assistant-historique` (démo `/apercu/assistant-salarie`) : le générateur y pose aussi `?ui=1`. |
| `guides-lot7` en `?ui=1` | **ne peut plus être une référence v1** : les guides servis sont ceux de la v2 pour tout le monde (`GUIDES_UI2` est global), donc un guide v2 se déroule sur l'ancien écran (ex. `menu.equipe`, `menu.reserves` absents du menu déroulant). Il est rejoué en v2 (ligne suivante). |
| 19 copies `ui2-…` rejouées SANS `?ui=2` (défaut = v2) | `pointage-lot10` 110/0, `pause-lot3bis` 79/0, `heures-lot1` 37/0, `heures-sures` 66/0, `brouillons-lot2` 49/0, `documents-lot24` 141/1 (E1), `salarie-lot12` 28/0, `chantier-termine-lot23` 111/0, `fenetres-lot11` 120/0, `reserves-lot11` 68/0, `salarie-lot14` 20/0, `traces-lot3` 65/0, `qr-fixe-lot12` 111/0, `salarie-lot9` 53/0, `salarie-lot10` 26/0, `site-rapide-lot5` 94/0, `requetes-lot29` 81/0 (18 requêtes), `formations-lot6` 115/0, **`guides-lot7` 682/1** (le ❌ est l'instable de la baseline : « petit-360 : bouton close ≥ 44 px (87×44) », géométrie à 43,99 px) |
| Adaptations nouvelles de la table (copies seulement) | `pause-lot3bis`, `heures-sures` (salarié), `guides-lot7` : le champ de l'assistant v2 est `.dz-as-barre`, les liens sont `.dz-as-bot .dz-as-liens` (planche AS1 ; ces copies tournaient avant l'étape 8). `site-rapide-lot5` : l'accueil de l'assistant v2 dit « Demandez-moi de noter vos heures… » au lieu de « Dites-moi vos heures… ». `guides-lot7` : la page « Plus » est attendue avant d'être lue (elle glisse), la carte du guide est mesurée 900 ms après (elle choisit son côté en 300 ms), « Close » devient « Fermer », les guides `equipe` et `lever-reserve` commencent par `menu.equipe` / `menu.reserves` (nouvelles ancres de « Plus »). Aucune fonction ne disparaît. |
| `fidelite-salarie.mjs` | **518 ✅ / 0 ❌** ; 16 images de `captures-fidelite/` refaites (pixels : défaut = v2, date du jour) ; `fidelite-assistant.mjs` 110 ✅ / 0 ❌ (son rendu « ancien panneau » passe par `?ui=1`) ; `test:coque-v2` 31 ✅ / 0 ❌ |
| 12 captures de référence v1 (`captures-reference-salarie.mjs`, désormais en `?ui=1`) | **11 / 12** pixel pour pixel ; `07-copier-journee.png` : les mêmes 2 pixels (ligne y = 460, animation du calendrier) que sur tous les builds précédents |
| `/poseur` (First Load JS, max 280) · `/admin` (max 363) · `/pointer` (max 151) | **279 kB** (278 avant : le drapeau lit `useSyncExternalStore`) · 360 · 148 |
| CSS gzip `/poseur` (max 35) · `/pointer` (max 18) · `/admin` (max 20) | 32,9 · 14,3 · 14,2 : inchangés (toutes les feuilles v2 étaient déjà dans le premier chargement derrière des règles `.bt-ui2` / `.dz-*`) |
| `test:registre` | 142 / 0 ; `clics.snapshot.json` inchangé (deux ancres, aucun gestionnaire de plus) ; `avant-3b1.snapshot.json` régénéré (2e exception documentée du README du registre) ; `guides.bureau` SHA `5766f6e9…3198` intact (`test:guides-bureau` 25/25) |
| `test:guides` 17/17 · `test:salarie-vue` 16/16 · `test:assistant-aide` 3/3 · `test:budget` 21/21 · `typecheck` | verts |

Rien de fusionné ni déployé par cette étape. Retour arrière : `UI2_PAR_DEFAUT = false` (`lib/use-ui2.ts`) et `GUIDES_UI2 = false` (`guides-ui2.ts`) puis redéployer `worker-assistant`, ou simplement annuler le commit de bascule.

## Après « fiche à confirmer claire » (date hors période, travaux jamais inventés, fiche et barre de saisie refaites)

Cas réel d'Ergun (« une intervention pour M. Patrick Du Maine, Paris, lundi prochain, 8 h-17 h ») : une fiche impossible à confirmer, la raison cachée sous la barre, « Volet » inventé.

- **Serveur (à déployer : `worker-assistant`)** : `dateDeclarable` / `reponseHorsPeriode` (worker-assistant-core.ts) décident sur la DATE CALCULÉE (jusqu'à demain, 31 jours en arrière), jamais sur des mots-clés ; profil long (`buildLongReply`), profil court (`fromWorkerCall`) et lecteur local (`handleLocally`, qui rabattait en silence une date future sur aujourd'hui) répondent en texte, FR ou TR (langue = `detecteTurc`), avec l'alternative « aujourd'hui ou hier ». Mêlée à une autre action, la journée hors période est dite « laissée de côté ». Travaux : la consigne et la description d'outil disent « seulement si dits » ; `travauxDits` vide une description dont aucun mot (4 lettres ou plus) n'est dans la phrase (sauf turc : la description est traduite). Cause de « Volet » : la consigne demandait d'extraire « le type de travaux » et le champ s'appelait « Type de travaux », sans « seulement s'il est dit ».
- **Étalon `avant-3b1.snapshot.json` régénéré** (3e exception documentée) : 70 cas du profil long (consigne et description d'outil changées volontairement) ; les autres empreintes, les réponses et les guides sont identiques.
- **Fiche (v2 seulement, v1 inchangée octet pour octet)** : classes `dz-f-*` dans `assistant-v2.css`, plus de feuille embarquée ni de style en ligne ; champs de 48 px, étiquettes sur une ligne, rangée Code postal / Ville alignée par le haut ; « Impossible de confirmer : <raison complète> » + « Voir le point » au-dessus des boutons, dans la barre collée en bas de la zone défilante ; Ignorer / Tout confirmer dans l'ordre de la planche AS3.
- **Barre de saisie v2** : [trombone « Joindre un fichier ou une photo »] [champ] [micro] [envoyer] ; plus de rangée « Dictée » ni de « FR·TR » ; langue de dictée = choix mémorisé, sinon langue du téléphone (turc possible en interne).
- Preuves : `fidelite-assistant.mjs` 142 ✅ / 0 ❌ (AS3b : raison entière et visible, rien sous la barre, champs alignés, 390×844 et 360×640) ; images `captures-fidelite/AVANT-APRES-fiche-*.png`, `AS3-fiche-*.png` ; v1 en `?ui=1` : `assistant-multi` 120/0, `assistant-historique` 185/0, `pause-lot3bis` 79/0, `heures-sures` 66/0 ; 19 copies `ui2-` sans drapeau : toutes vertes aux échecs déjà connus près (`documents-lot24` E1 141/1 ; `reserves-lot11` 66/2, dépend de la date du jour ; `guides-lot7` et `chantier-termine-lot23` verts au second passage, un échec instable sous charge au premier) ; `/poseur` 279 kB, CSS 32,9 kB gzip.
- Les copies `ui2-*` n'avaient aucune référence à la rangée « Dictée » ou à « FR·TR » (seuls `assistant-multi` §D et `dictee.mjs`, scripts de l'ancien panneau, la visent : ils tournent sur la v1, inchangée).
## Après l'équilibre et la navigation (octobre 2026 : retours d'Ergun sur son téléphone)

Demandes d'Ergun (elles PRIMENT sur la planche quand elles la contredisent ; la planche ne dessine ni le Mois, ni l'Historique, ni le détail de « Plus ») : (A) la même grammaire sur toutes les pages (bandeau d'en-tête sombre + petit mot jaune, cartes, accents jaune/vert), (B) des statistiques dans le Mois, (C) un menu qui ne double pas la barre du bas, (D) le profil, (E) les guides. Audit complet des fonctions v1 → v2 : `audit-v1-v2-compte.md`. Images 390×844 et 360×640 : `captures-equilibre/` (`node scripts/tests/equilibre-salarie.mjs`, 75 contrôles ✅ / 0 ❌).

| Changement | Détail |
|---|---|
| Barre du bas | **Journée · Semaine · Mois** (plus de « Plus »). La pastille rouge « à voir » passe sur l'**avatar**. Historique, Formations et Mon équipe (rangées dans « Mon compte ») n'allument aucun onglet. |
| Menu (avatar, en haut à droite) | s'appelle **« Mon compte »** (titre ; petit mot jaune « PRÉNOM · RÔLE »). Retirés : Ma journée, Ma semaine, Mon mois (doublon de la barre du bas) et « Assistant BEMEXO » (doublon du ✦ jaune de l'en-tête, visible sur chaque écran). Restent : Historique, Réserves à lever, Formations à voir, Mes congés, Mon équipe (chef), Changer ma photo, Informations, notifications, Déconnexion ; un rond jaune devant chaque ligne (icônes de l'ancien menu). |
| Doublons et boutons inutiles retirés | (1) onglet « Plus » : même page que l'avatar ; (2) lignes Journée / Semaine / Mois du menu : dans la barre ; (3) ligne « Assistant » : le ✦ ; (4) flèche de retour de la Semaine et du Mois : la barre du bas suffit (gardée sur Historique, Formations, Équipe, un jour ouvert) ; (5) titre « Historique » répété dans la page (déjà dans l'en-tête, gardé pour les lecteurs d'écran) ; (6) pastille de l'onglet « Plus » : déplacée sur l'avatar. Gardés : QR / « + » / « Envoyer ma journée » de la Journée. |
| En-têtes | Semaine, Mois, Historique : petit mot jaune « MES HEURES » + titre ; Formations « MON COMPTE » ; Équipe « MON ÉQUIPE » (comme « AUJOURD'HUI » de la Journée). |
| Semaine et Mois | cartes de total **sombres** (comme le pointage), petit mot et reste « à envoyer » en jaune ; barres de la Semaine recolorées pour le noir. |
| Mois : résumé | heures du mois (envoyées), jours travaillés, paniers, congés, absences (maladie, intempérie), jours « à envoyer » et leurs heures (`+ 12h00 à envoyer`). **Aucune requête de plus** (`resumeMois`, règle pure testée dans `salarie-vue.ts`, calculée sur les lignes et affectations déjà lues). Avant : le Mois montrait seulement un total (`69h30 envoyées · 9 jours envoyés`, carte « MOIS · HEURES ») : Ergun avait peu de chances de le voir comme des « stats ». Les congés affichent la pastille CONGÉ (ils disaient « À déclarer »). |
| Profil | seule la photo existait en v1 (gardée) ; nom, téléphone, mot de passe, langue et bouton de géolocalisation n'existaient pas : rien créé (voir `audit-v1-v2-compte.md`). |
| Guides et fiches | « Plus » → « Mon compte » partout ; guide `planning` : deux pas (l'onglet « Semaine » de la barre du bas, ancre `barre.semaine`, puis un jour) ; `menu.journee/semaine/mois` ne sont plus visées par les guides v2 ; `test:guides` 17/17. `guideForPrompt` bureau intact (SHA `5766f6e9…3198`, `test:guides-bureau` 25/25). |

| Mesure | Résultat |
|---|---|
| 19 copies `ui2-…` SANS `?ui=2` | `pointage-lot10` 110/0, `pause-lot3bis` 79/0, `heures-lot1` 37/0, `heures-sures` 66/0, `brouillons-lot2` 49/0, `salarie-lot12` 28/0, `fenetres-lot11` 120/0, `reserves-lot11` 68/0, `salarie-lot14` 20/0, `traces-lot3` 65/0, `qr-fixe-lot12` 111/0, `salarie-lot9` 53/0, `salarie-lot10` 26/0, `site-rapide-lot5` 94/0, `requetes-lot29` 81/0 (18 requêtes), `formations-lot6` 115/0, `chantier-termine-lot23` 111/0 (110/1 sous charge à la 1re passe, « A2 champs ≥ 44 px (43) » du bureau, 111/0 rejoué seul), `documents-lot24` 141/1 (E1, inchangé), **`guides-lot7` 674/1** (682 avant : le guide `planning` a un pas de moins ; le ❌ est l'instable de la baseline, « petit-360 : bouton close 87×44 ») |
| Références v1 (`?ui=1`) rejouées | `missions-lot4` 148/0, `taches-heures-lot9` 75/0 (elles passent par le helper partagé `navigation-salarie.mjs`, rendu compatible v1 et v2), `reserves-lot11` 66/2 (le défaut connu de la date du jour, après minuit heure de Paris) |
| `fidelite-salarie.mjs` | **520 ✅ / 0 ❌** (518 avant) ; 45 images de `captures-fidelite/` refaites (la barre du bas change sur toutes) ; `fidelite-assistant.mjs` 110/0 ; `test:coque-v2` 31/0 |
| `/poseur` (max 280) · `/admin` (max 363) · `/pointer` (max 151) | **280,0 kB** (279 avant : marge nulle, au plafond mais dedans) · 360 · 148 |
| CSS gzip `/poseur` (max 35) · `/pointer` · `/admin` | 33,2 (32,9 mesuré) · 14,3 · 14,2 |
| `test:registre` | 142 / 0 ; `clics.snapshot.json` inchangé (aucun gestionnaire de plus ni de moins net) ; `avant-3b1.snapshot.json` régénéré (3e exception documentée du README du registre, écart prouvé : `guides.salarie`, `global`, 55 consignes salarié, 1 réponse « Aide » ; bureau, liens et outils identiques) ; ancres 130 valeurs / 173 occurrences (+`barre.semaine`) |
| `test:guides` 17/17 · `test:salarie-vue` 17/17 (+`resumeMois`) · `test:assistant-aide` 3/3 · `test:budget` 21/21 · `typecheck` | verts |

**ADAPTATIONS ajoutées à `ui2-copies.mjs`** (copies seulement) : `guides-lot7` (guide `planning` : barre du bas au lieu du nom + ligne de menu), `formations-lot6` (le titre se lit dans `.bt-phdr-date`, le retour porte maintenant le petit mot jaune au-dessus). Helper `navigation-salarie.mjs` : le bouton du compte se cherche par `aria-label^="Mon compte"` (v1 : « Mon compte et menu », v2 : « Mon compte[, n à voir] ») et `ouvrirVue('Ma semaine' | 'Mon mois' | 'Ma journée')` touche l'onglet du bas quand la barre existe (le menu n'a plus ces lignes). `fidelite-salarie.mjs` : le « Plus en bas » disparaît (barre à 3 onglets, aucune allumée sous « Mon compte », pastille sur l'avatar, 8 entrées de menu attendues et 4 retirées vérifiées, titre « Mon compte »).

**À déployer** : `worker-assistant` seulement (les fiches d'aide de l'Assistant sont dans la consigne du modèle : `worker-tours-v2.ts` → `worker-assistant-core.ts` via `WORKER_GUIDE_V2`) ; aucune autre fonction, aucune migration. Évaluer les phrases d'aide avant mise en ligne. Les guides pas à pas sont servis par le navigateur (déploiement du site).


## Après le lot 1 du bureau (planning v2, `/admin?ui=2` : aperçus et local seulement, éteint par défaut)

Dossier du designer : `docs/design-brief/designer-bureau/` (planche de 186 écrans, README, `tokens.css`). Ce lot : le PLANNING (écrans `PL*` et `PM*`) ; Heures et paie (lot 2) et le reste (lot 3) viennent ensuite sur les mêmes bases.
Méthode du salarié : un interrupteur, des variantes v2 qui réutilisent les gestionnaires existants SANS les modifier, la fidélité vue côte à côte, des scripts rejoués.

### Ce qui existe

| Pièce | Fichier |
|---|---|
| Interrupteur du bureau (`?ui=2` sur aperçu / local, mémorisé en session, **jamais par défaut** : `BUREAU_UI2_PAR_DEFAUT = false`, `?ui=1` l'éteint ; séparé de celui du salarié) | `lib/use-bureau-ui2.ts` |
| Jetons (`.dz-bureau`, `.bt-skin`, `.dz-portail`) + fenêtre / panneau / feuille réutilisables (lots 2 et 3) | `components/design/bureau/bureau-jetons.css`, `fenetres-bureau.css`, `fenetre-bureau.tsx` |
| Planning v2 : barre noire, barre de semaine, « Plus ⋯ », menu du compte, tiroir Clients, bandeau repliable, grille, bulles, légende, sélection, fiche d'intervention (panneau), téléphone (en-tête, jours, cartes, menu ☰ en feuille du bas) | `components/design/bureau/*-v2.tsx`, `planning-v2.css` |
| Ce que le planning v2 reçoit de l'écran existant (états + gestionnaires, rien d'autre) | `components/design/bureau/contexte-v2.ts`, branche `ui2` dans `components/admin-planning.tsx` |
| Règles pures (total d'heures du jour / du salarié / de la semaine, jauge, plage d'une absence, « Bruno ×2, Fanny ×2, Eli ») | `supabase/functions/_shared/bureau-vue.ts` (+ test, `npm run test:bureau-vue` 6/6) |
| Guides du bureau pour la v2, **ÉTEINTS** (`GUIDES_BUREAU_UI2 = false`) | `guides-bureau-ui2.ts`, `admin-tours-v2.ts`, `docs/design-brief/integration/guides-bureau-v2.md` (tableau cible \| texte v1 \| texte v2) |
| Preuves | `scripts/tests/fidelite-bureau.mjs` (`npm run test:fidelite-bureau`), `bureau-sim.mjs` (base simulée = données de la planche), `bureau-v1-identique.mjs`, `ui2-bureau-copies.mjs` |

**Le v2 est chargé en différé** (`import()` dans `admin-planning.tsx`, seulement si le drapeau est actif) : 16,0 kB gzip de JavaScript et 10,0 kB gzip de CSS à part, jamais dans le premier chargement.

### Mesures (build de production de la branche, mêmes conditions que la base `origin/claude/bureau-lot1` construite à côté)

| Mesure | Base | Branche |
|---|---|---|
| `/admin` First Load JS (max 363) | 360,0 kB | **362,0 kB** (+2,0 : le branchement et le contexte ; **marge 1 kB : les lots 2 et 3 ne doivent rien ajouter au morceau principal**) |
| `/poseur` (max 280) · `/pointer` (max 151) | 280,0 · 148 | 280,0 · 148 (inchangés) |
| CSS gzip `/admin` (max 20) | 14,2 | **14,2** (le CSS v2 est dans le morceau différé) |
| Requêtes au chargement | `requetes-lot29` 79 ✅ / 2 ❌ | **79 / 2** : mêmes lectures, même nombre ; les 2 ❌ sont ceux de la base (partie salarié, hors lot) |
| HTML de `/admin` SANS `?ui=2` (`bureau-v1-identique.mjs` : planning 1440 / 1024 / 390, menu du compte, liste Clients, fenêtre d'une intervention, menu ☰) | — | **7 / 7 identiques octet pour octet** à la base |
| 13 scripts du bureau rejoués en v1 (`planning-lot2` 86/0, `planning-lot3` 81/0, `planning-copier` 159/0, `absences-lot2` 25/0, `versions-lot8` 146/0, `traces-lot3` 64/1, `admin-lot9` 39/0, `admin-lot10` 60/0, `admin-lot11` 138/0, `statistiques-lot5` 120/0, `missions-lot4` 144/4, `invitations-admin` 61/0, `requetes-lot29` 79/2) | 1 202 ✅ / 7 ❌ | **1 202 ✅ / 7 ❌** : chaque script donne le nombre de la base (les 7 ❌ sont ceux de la base : `traces-lot3` « lien discret 44 px », `missions-lot4` ×4 et `requetes-lot29` ×2, partie salarié) |
| `test:registre` | — | **142 / 0** (voir ci-dessous) ; `test:guides-bureau` **28 / 28** ; empreinte `guideForPrompt` du bureau **inchangée** (`5766f6e9…3198`) ; `test:bureau-vue` 6/6 ; `typecheck` vert |
| `fidelite-bureau.mjs` | — | **118 ✅ / 0 ❌** : 21 images « planche \| implémentation » (`captures-bureau/`), mesures (cibles ≥ 40 px au pointeur / 44 px au toucher, texte ≥ 11 px, contrastes 4,5:1 ou 3:1 en grand texte, contour de focus ≥ 2 px) et 60 contrôles de PARCOURS (menus, fenêtres, écritures du planning, sélection, glisser, téléphone) |

Registre (`npm run test:registre`) : le planning v2 pose les MÊMES ancres de guide que l'ancien (l'écran v2 remplace l'écran v1, jamais les deux) + `bureau-nav.plus` ; le menu ☰ v2 est le même menu (capacité B72) ; « Plus ⋯ » est rangé avec B52. Constantes du scanner mises à jour AVEC leur raison (dialogues 32 → 33, ancres 130/173 → 131/223, gestionnaires 75/605 → 84/699, ancre dynamique du menu ☰ v2) ; `clics.snapshot.json` régénéré par la commande officielle (deux fichiers du salarié étaient déjà en écart sur la base : `assistant-panel.tsx` −1, `worker-multi-card.tsx` +2, non touchés par ce lot).

### Rejeu en `/admin?ui=2` (copies générées `ui2b-…`, jamais les originaux : `node scripts/tests/ui2-bureau-copies.mjs`)

| Script (copie `ui2b-…`) | v1 | `?ui=2` | Adaptations |
|---|---|---|---|
| `planning-lot2` (glisser, copier Ctrl / Alt / ⌘, refus, annuler, Assistant) | 86 / 0 | **86 / 0** | repères `bt-pl-*` → `dzp-*` ; écran de test plus haut (lignes plus hautes) ; lecture du glisser (fantôme, pastille « + », curseur « copier », case visée) |
| `versions-lot8` | 146 / 0 | **144 / 0** | « Versions du planning » est une ligne de « Plus ⋯ » (on ouvre le menu) ; 2 contrôles de géométrie du coin de la grille n'ont plus d'objet |
| `absences-lot2` | 25 / 0 | **25 / 0** | repères seulement |
| `traces-lot3` | 64 / 1 | **64 / 1** | repères ; le menu ☰ v2 finit chaque ligne par « › » |
| `requetes-lot29` | 79 / 2 | **79 / 2** | repères seulement |

Les autres scripts du bureau ne sont **pas rejoués en v2** (liste et raison dans `NON_REJOUES` du générateur) : leurs contrôles sondent la mise en page de l'ANCIEN écran (classes et géométrie du cockpit, bouton « ＋ Tâche » dans chaque case, lignes vides de remplissage, légende en popover). Leur fonction est couverte par les PARCOURS de `fidelite-bureau.mjs`. Ils restent verts en v1 (tableau ci-dessus).

### Écarts à la planche (liste honnête)

**Dessiné par la planche, volontairement PAS fait (nouvelle fonction)** : plein écran ⤢ (PL03 : aucun plein écran n'existe dans le code ; la planche ne le marque pas « NOUVEAU » mais ce serait une nouvelle fonction) ; « Formations : 2 à voir » (le compteur n'existe pas côté bureau) ; SIRET dans le menu du compte (donnée absente) ; « Dina · arrêt maladie, du 12 au 16 » reste calculé sur les lignes de planning lues, rien de plus.
**Déplacé sans création** : « ＋ Tâche » n'est plus dans chaque case (un seul accès : « Ajouter une tâche à ce créneau » de la fiche, ou la pastille « Tâches » d'une case qui en a) ; « Formations » et « Envoyer par e-mail » sont dans « Plus ⋯ » seulement ; Réglages dans le menu du compte seulement ; « Versions » et « Interventions supprimées ou décalées » dans « Plus ⋯ » ; les invitations en attente sont dans la fenêtre « Salariés » (plus de ligne sous la barre) ; légende sous la grille (« Légende ▾ », ouverte d'office à partir de 1 600 px) et dans le menu ☰ au téléphone.
**Habillage seulement (contenu d'avant conservé)** : les fenêtres Radix (Ajouter, Copier vers, Supprimer ?, Statut, Absences, Clients / Salariés / Réserves, Imprimer, Exporter, Versions, Traces…) reçoivent les jetons du bureau (liseré jaune 4 px, rayon 20 px, croix 40 / 44 px) mais pas la mise en page dessinée écran par écran (PL13 à PL16, PL20, PL29, PL33 à PL41, PL42 à PL44 : lots suivants si Ergun les veut) ; la ligne « Horaire prévu » de la fiche reprend le composant d'avant (champs + préréglages) au lieu des deux colonnes Début / Fin de PL17 ; la réunion montre titre, lieu ou « toute l'équipe » et heure (pas de nombre de participants : donnée absente).
**États non redessinés** : chargement (PL07), échec de lecture (PL08), semaine vide (PL10), échec d'enregistrement (PL11) : ils gardent le rendu d'avant ; l'entreprise vide (PL09) a sa carte « Deux étapes » dans la grille ; l'astuce « Copier une case » (PL12) est la carte flottante de la planche avec le texte et les gestes d'avant (« Compris », « ? » dans le coin).
**Tablette** : sous 1 024 px, la disposition téléphone (PM16 dessine le portrait 834 px avec la même disposition).
**Mesures de la planche elle-même** : S'abonner (28 px), imprimer (34 px), Replier (24 px), « + ajouter » et « Tâches 1/3 » (24 px) sont dessinés sous 40 px : leur dessin est gardé, leur zone cliquable est de 40 px (44 au toucher) par un pseudo-élément. Le style de certains éléments dépend de la donnée (largeur de la jauge, hauteur des 7 barres) : seuls ces valeurs sont en `style`, tout le reste est en classes `dzp-*`.
## Après le lot 2 du BUREAU « Heures et paie » (octobre 2026 : `/admin?ui=2` sur aperçu ou en local seulement, `BUREAU_UI2_PAR_DEFAUT = false`)

Branche `claude/bureau-lot2-heures-paie`, posée sur `origin/claude/bureau-lot1` (le dossier du designer ; la fondation du lot 1 n'était pas encore poussée : `lib/use-bureau-ui2.ts` et `components/design/bureau/bureau-jetons.css` sont écrits ici avec les noms demandés, **on gardera la version du lot 1 en cas de conflit**).

**Ce qui est fait (habillage seulement, aucune fonction ajoutée, aucune requête de plus, aucune migration, aucune fonction déployée)** : la feuille d'heures du salarié (HP01 à HP03, HM01 : cartes de chiffres, tableau, fiche d'une ligne avec son historique), Corriger (HP04 à HP07, HM02), Renvoyer (HP08, HP09, HM03), brouillon vide, congés (HP12 à HP16, HM04, dont la fenêtre « Refuser le congé de … ? »), Exporter l'équipe (HP17 à HP19, HM05 : trois pastilles, comptable, clôture du mois, « Un seul salarié ? »), alerte de verrouillage (HP20 à HP22, HM06), clôture du mois (HP28 à HP30, HM07), « Exporter un salarié » (HP31). Les logiques (états, requêtes, écritures, handlers) restent dans `worker-detail.tsx`, `leave-admin-dialog.tsx`, `export-verrou-dialog.tsx` et `admin-planning.tsx`, qui passent leurs états et leurs gestes aux vues v2 (`components/design/bureau/*-v2.tsx`) ; les vues v2 sont chargées en différé (import dynamique, chunks séparés, jamais téléchargés sans le drapeau).

Fichiers de `admin-planning.tsx` touchés (À SURVEILLER AU MERGE AVEC LE LOT 1) : la ligne d'import de `react` (+`lazy`, `Suspense`), un import du drapeau sur la ligne de `export-menu`, trois `lazy()` avant `export default function AdminPlanning`, `const ui2b = useBureauUi2()` après `exportWorkerOpen`, et trois blocs `{ui2b && …}` + `{!ui2b && ( … )}` autour des fenêtres « Exporter l'équipe », « Clôturer le mois » et « Exporter un salarié » (leurs lignes d'origine ne sont PAS modifiées : mêmes clés pour le registre) ; une propriété `onRelancer` sur `<WorkerDetailDialog>`. Aucune ligne n'est insérée avant la ligne 409 (clé `ancre-dynamique` du registre).

| Preuve | Résultat |
|---|---|
| Sans le drapeau, scripts du bureau rejoués sur le build du lot 2 contre le build de `origin/claude/bureau-lot1` (ceux qui touchent aussi `/poseur` sont rejoués par leurs copies `ui1-*`, `node scripts/tests/ui2-copies.mjs --v1`) | **identiques pour les 25 scripts** : `export-lot11` 80/0, `export-alerte-lot18` 99/0, `heures-lot1` 37/0, `brouillons-lot2` 49/0, `bureau-lot2` 80/0, `panier-lot3bis` 76/0, `pause-lot3bis` 79/0, `admin-lot9` 39/0, `admin-lot10` 60/0, `admin-lot11` 138/0, `absences-lot2` 25/0, `fenetres-lot11` 120/0, `statistiques-lot5` 120/0, `site-rapide-lot5` 94/0, `requetes-lot29` 81/0, `heures-sures` 66/0, `taches-heures-lot9` 75/0, `traces-lot3` 65/0, `chantier-termine-lot23` 111/0, `planning-lot2` 86/0, `planning-lot3` 81/0, `reglages-lot10` 33/0, `reglages-lot11` 25/0, `guides-bureau-lot7` 1070/0 (1069/1 sur les DEUX builds à une passe : « B · Précédent », instable), `invitations-admin` ✓ |
| Copies `?ui=2` adaptées (`node scripts/tests/copies-ui2-bureau.mjs`, table `ADAPTATIONS` + `COMMUNES`, chaque ligne dit ce qui change à l'écran et pourquoi) | `export-lot11` **80/0**, `export-alerte-lot18` **99/0**, `heures-lot1` 37/0, `brouillons-lot2` 49/0, `bureau-lot2` 80/0, `panier-lot3bis` 76/0 (1 passe sous charge : la 1re alerte attendue 10 s n'est pas venue, rejouée seule 5 fois : 76/0), `pause-lot3bis` 79/0, `admin-lot11` 138/0, `absences-lot2` 25/0, `fenetres-lot11` 120/0, `statistiques-lot5` 120/0, `guides-bureau-lot7` 1070/0 : **mêmes nombres qu'en v1** |
| `node scripts/tests/fidelite-bureau-heures.mjs out docs/design-brief/integration/captures-bureau-heures 4401` (avec `PLANCHE_DIR`, captures faites par `scripts/tests/planche-bureau.mjs`) | **200 ✅ / 0 ❌** ; 26 images « planche \| implémentation » (HP01, HP03 à HP06, HP08, HP12, HP13, HP17 à HP20, HP28, HP29, HP31, HM01 à HM07 ; 1440 × 900, 1024 × 768, 390 × 844, 360 × 640 pour la correction) ; mesures : cibles ≥ 40 px (pointeur) / 44 px (toucher), texte ≥ 11 px, contrastes ≥ 4,5:1 (3:1 en grand texte), aucun défilement horizontal, rôle `dialog` / `alertdialog`, contour de focus 2 px, rien d'écrit à l'ouverture, Échap ferme, et sans drapeau : aucune règle `dz-hb-` ni aucun chunk v2 téléchargé |
| `npm run typecheck`, `npm run test:registre`, `npm run test:guides-bureau`, `npm run test:budget` | verts : registre 142 / 0, guides bureau 25 / 25 (empreinte `guideForPrompt` SHA `5766f6e9…3198` intacte) |
| Poids | `/admin` **361 kB** (360 avant ; max 363) : seules les trois déclarations `lazy` et le drapeau sont dans le premier chargement ; CSS `/admin` **14,2 kB gzip** (inchangé, max 20) ; la v2 pèse ≈ 18 kB de JS gzip (5 chunks) et ≈ 6,0 kB de CSS gzip, chargés seulement quand le drapeau est actif |

Adaptations de rejeu (copies seulement ; les originaux ne bougent pas) : les formats d'export sont trois pastilles (plus de menu « Exporter ▾ ») ; l'alerte de verrouillage a son titre, la période, la phrase et le fichier en éléments séparés, un ✕ en plus, l'ordre des boutons de la planche ; le bouton principal de l'alerte s'appelle `export-verrou-valider` (le script de l'alerte reconnaît le chunk de l'ancienne alerte par `export-verrou-confirm` et exige UN fichier) ; la feuille d'heures est un tableau (repère `fiche-ligne`) ; « Corriger » est dans la fiche de la ligne et ouvre une fenêtre (`correct-panel`) ; « Renvoyer » a sa fenêtre (`renvoi-fenetre`) ; l'historique, « Changé après renvoi » et « était … » se lisent dans la fiche de la ligne ; les étiquettes d'état s'écrivent en capitales (planche) ; durées en h:mm ; « Clôturer jusqu'au… » / « Rouvrir » (un salarié) sont dans l'onglet « Gérer » (décision validée : un seul accès par fonction).

### Écarts à la planche (honnêtes), y compris ce que la planche dessine et que le code ne permet pas : NON inventé
- **HP11 « Relancer par e-mail »** (message modifiable, Copier, Ouvrir l'e-mail) : le code envoie une notification, ou ouvre le courrier directement ; aucune fenêtre de message n'existe. Seul le bouton « Relancer » de la fiche (même envoi que « À relancer ») est ajouté, visible quand des jours sont en attente.
- **HP04 « Corriger » SANS prévenir** : le code ne sait que « Corriger et prévenir ». **« Route payée / Route non payée » comme choix par ligne** : la route payée est un réglage de l'entreprise ; la ligne choisit « Aucun », la route (dite payée ou non selon le réglage) ou « Pause avant », seulement quand la ligne précédente finit avant. Pause en liste déroulante : les puces du code sont gardées.
- **HP01** : « + 7:00 prévues » (la fiche ne lit pas le planning), lignes « PRÉVUE » et « EN DIRECT » (ni planning ni pointage en cours lus) ; chaque ligne montre en plus TOUTES les étiquettes du code (corrigé par le bureau, QR, sortie oubliée, réserve…) au lieu d'une seule ; ordre du lundi au dimanche (le code montrait le plus récent d'abord). Au téléphone les quatre chiffres sont gardés (la planche en montre deux).
- **HP17 à HP19** : « Heures envoyées » et « Salariés » de la période (aucun chiffre avant l'export : le comptage ne se fait qu'au clic, pour l'alerte), nom du cabinet (seule l'adresse du comptable est enregistrée). **HP28 à HP30** : liste des jours en brouillon (le code compte seulement), « Clôturé le … par … » et « Annuler » après la clôture (rien n'est gardé : « Rouvrir… » existe).
- **HP23 à HP27, HP10, HP07** : les messages (export fait, verrou en échec, envoi déjà fait / réussi / échoué, correction enregistrée) restent les messages Sonner actuels (le Toaster est commun à tout le site : pas touché ici) ; le brouillon vide supprimé garde son « Annuler » dans la fiche.
- **Onglet « Gérer »** : la fiche « Gérer » garde son ancien habillage (lot 3, EQ09) avec seulement les deux onglets au-dessus pour aller et venir ; c'est aussi là que sont « Clôturer jusqu'au… » et « Rouvrir ». Le coût réel (EQ13) est dans « Gérer » aussi.
- **Bandeau de chiffres liés, « À relancer » (PL42, PL43)** : lot 1.
- **Guides** : préparés, ÉTEINTS (`supabase/functions/_shared/admin-tours-ui2.ts`, tableau cible \| texte v1 \| texte v2 dans `guides-bureau-heures-v2.md`) ; deux ancres manquent en v2 (la ligne de la feuille d'heures, l'onglet « Gérer »).

Registre : `clics.snapshot.json` régénéré par la commande officielle du README (+5 fichiers, +40 gestionnaires v2, plus deux écarts déjà présents sur `main` : `assistant-panel.tsx` 46 → 45, `worker-multi-card.tsx` 7 → 9) et deux nombres écrits en dur dans `registre-surfaces.test.ts` (ancres 181 occurrences, +8 repères repris par les v2 ; gestionnaires 645 dans 80 fichiers) ; liste `DUAL` de `admin-tours.test.ts` (les 8 ancres reprises par une v2 existent deux fois, jamais montées ensemble).

## Après le planning v2b « Couleur » (17 oct. 2026 : re-habillage du lot 1 du bureau, `/admin?ui=2` sur aperçu ou en local seulement, `BUREAU_UI2_PAR_DEFAUT = false`)

Planche retenue par l'arbitrage : `docs/design-brief/designer-planning-v2/` (README, `SPEC-v2b.md`, `tokens.css` bloc `.dz-planning-v2b`). L'outil DesignSync n'était pas disponible dans cette session : intégration faite sur `SPEC-v2b.md` seul, **pas d'image côte à côte planche | implémentation**.

**Ce qui change (habillage seulement, mêmes fonctions, mêmes gestionnaires d'`admin-planning.tsx`, non modifié)** : fichiers `components/design/bureau/` (`planning-v2.tsx`, `barres-v2.tsx`, `bandeau-v2.tsx`, `grille-v2.tsx`, `bulle-v2.tsx`, `fiche-v2.tsx`, `mobile-v2.tsx`, `missions-v2.tsx`, légende de `menu-mobile-v2.tsx`, `planning-v2.css` réécrit). `bureau-jetons.css` et `fenetres-bureau.css` (partagés avec le lot 2) ne bougent pas : les jetons v2b sont portés par `.dz-planning-v2b` (et la fiche `.dzp-fiche-v2b`).
- Barre niveau 1 (noire, 52 px) : Planning, Statistiques | Clients (même tiroir), Salariés, Réserves (mêmes fenêtres, pastilles rouges) | ✦ Assistant en contour, compte. Niveau 2 (64 px) : ‹ › Aujourd'hui, « 12 – 18 octobre 2026 », « Semaine 42 · 105 h 15 envoyées sur 138 h 45 » (lien qui déplie / replie les chiffres) ; Sélectionner, Imprimer, Plus ⋯ (Borne, Formations, Envoyer par e-mail ; puis Coût chantiers, Versions, Interventions supprimées : rien n'est retiré), Exporter (seul bouton jaune).
- Bandeau REPLIÉ par défaut (choix gardé par utilisateur, nouvelle clé) : « N journées à relancer · Bruno 2, Fanny 2 » (ouvre la même liste « À relancer ») et « N pointent en ce moment » ; un élément à 0 est absent, tout à 0 = pas de bandeau. Déplié : Heures envoyées (barres violettes), À relancer, En direct ; Absents et Pièces seulement si > 0.
- Grille sur carte sombre ; colonne salarié 200 px (160 sous 1 280) : initiales, nom, pastille rouge (jours en attente), « 24 h 15 sur 31 h 45 » ; en-tête « Jeu (15) » + heures envoyées du jour (vide si 0) ; aujourd'hui = rond jaune seul ; case sans « + » au repos (« + » au survol d'une case vide), plus de « + ajouter ».
- Bulle à 2 lignes (client ; « 8 h–12 h », « ✓ 7 h 30–16 h », « Sans horaire ») ; états : prévue (contour clair), en cours (vert d'eau + point), à envoyer (rouge, seul mot « à envoyer », qui remplace l'horaire sous 130 px — y compris les jours passés sans heures), envoyée (violet), retirée (barrée), coin jaune = ajoutée par le salarié ; heures « hors planning » = même bulle avec le coin. Durée, ville, réserve, documents, auteur : infobulle (attribut `title`) et fiche.
- Fiche (panneau 480 px) : client 26 px, « produit · ville », une phrase d'état colorée, lignes Salarié / Jour / Prévu (le composant « Horaire prévu » d'avant, éditable) / Heures envoyées / Ajoutée par / (Réception) / Note ; pied Supprimer · Copier vers… · Enregistrer ; Dupliquer au lendemain et Ajouter une tâche restent dans le corps.
- Téléphone : tout sombre, « Jeudi 15 octobre » + Semaine 42 ‹ ›, 7 jours (rond jaune aujourd'hui, point rouge = jour en attente), carte rouge « N journées à relancer › », liste par salarié, « Rien de prévu », « + » (44 px) et « ☐ » (tâche) à droite du nom.
- L'astuce « Copier une case » est sous la grille, à gauche (une fois, « Compris »), plus en carte flottante sur la grille.

| Preuve | Résultat |
|---|---|
| `node scripts/tests/planning-v2b-controles.mjs out docs/design-brief/integration/captures-planning-v2b 4431` (les 10 contrôles du README §7, base simulée `bureau-sim.mjs` : 8 salariés, tous les états, jeudi 15 oct.) | **10 OK / 0 ÉCHEC** : (1) 8 lignes, bas de la dernière à 852 px sur 900, sans défiler ; (2) 38 bulles, 41 px, ≤ 2 lignes, 0 majuscule ; (3) « à envoyer » 7 fois = 7 bulles rouges, aucun autre mot d'état dans la grille ; (4) 0 « + » au repos ; (5) un seul repère jaune (rond du 15), ni teinte ni badge ; (6) aucune valeur 0 (replié et déplié) ; (7) « journées à relancer » 1 fois ; (8) 825 éléments, 0 JetBrains Mono, 0 letter-spacing > 0 ; (9) 1024 px : 184 lignes de texte, 0 retour à la ligne, page de 1024 px ; (10) jaune plein : logo, Exporter, rond d'aujourd'hui + 3 coins « ajoutée par le salarié » (autorisés par v2b, comme l'anneau de sélection, présent seulement en mode Sélectionner). Téléphone 390 px : aucun défilement horizontal. Captures : `captures-planning-v2b/` (1440, 1440 déplié, 1024, fiche, téléphone) |
| `bureau-v1-identique.mjs` (sans drapeau, base = build de `origin/claude/planning-v2b`) | **7 / 7 identiques octet pour octet** |
| 13 scripts du bureau en v1 (base \| branche) | **identiques** : planning-lot2 86/0, planning-lot3 81/0, planning-copier 159/0, absences-lot2 25/0, versions-lot8 146/0, admin-lot9 39/0, admin-lot10 60/0, admin-lot11 138/0, statistiques-lot5 120/0, missions-lot4 144/4, requetes-lot29 79/2, invitations-admin 1/0 (sa ligne de résumé), traces-lot3 plante dans sa partie salarié sur les DEUX builds (« Historique » sorti du menu du compte par les retouches salarié, déjà sur la base) |
| Copies `ui2b-` du planning (`node scripts/tests/ui2-bureau-copies.mjs`) | planning-lot2 **86/0** (2 adaptations v2b ajoutées : l'infobulle voulue par la planche, l'horaire « 8 h–17 h »), absences-lot2 25/0, versions-lot8 144/0, requetes-lot29 79/2 (les 2 ❌ salarié de la base), traces-lot3 : même plantage salarié qu'en v1 |
| Copies `ui2b-` du lot 2 (`copies-ui2-bureau.mjs`) | déjà cassées sur la base (écrites avant la fusion du lot 1 : elles cherchent les classes `bt-pl-*` du planning v1 sous `?ui=2`) : mêmes plantages / comptes sur la base et la branche (export-lot11, export-alerte, heures-lot1 11/26, bureau-lot2, panier, pause, brouillons, fenetres, statistiques) ; admin-lot11 diffère seulement par le libellé du bandeau (« 8 journées à relancer Kevin 3… », et le contrôle « bandeau = somme des pastilles » passe désormais). guides-bureau-lot7 plante sur les deux builds ; sur la branche, « borne 1/3 : anneau » échoue : la Borne est dans « Plus ⋯ », le guide v2 (éteint) ajoute l'étape « Plus ⋯ » |
| `fidelite-bureau-heures.mjs` (lot 2) | **172 ✅ / 4 ❌ sur la base ET sur la branche** (les 4 mêmes : HP12, HP18, HP20, HP28 au téléphone) : aucune régression |
| `test:registre` | **143 / 0** : `clics.snapshot.json` régénéré par la commande officielle (bandeau +2, barres +1, grille −1, mobile −1, planning −1 : total des gestionnaires inchangé) ; ancres 232 → **231** occurrences (« + ajouter » de la grille supprimé ; l'ancre `bureau-planning.ajouter` reste sur le « + » du téléphone) |
| `test:guides-bureau` | **28 / 28** ; empreinte `guideForPrompt` du bureau **inchangée** (`5766f6e9…3198`) ; `GUIDES_BUREAU_UI2 = false` |
| `typecheck`, eslint des fichiers touchés | verts (2 avertissements `<img>` d'avant) |
| Poids (`check-bundle-budget.mjs`, `budget:css`) | `/admin` **362 kB** (= base, max 363), `/borne` 171 (max 172), `/poseur` 280, `/pointer` 148 ; CSS `/admin` 14,2 kB gzip (inchangé) ; morceau différé du planning 15,5 kB gzip de JS (16,0 avant) et 8,2 kB de CSS (8,5 avant). Aucun plafond relevé. NB : un premier essai qui branchait la phrase « Borne » de l'Assistant derrière l'interrupteur faisait entrer `admin-tours-v2` dans un morceau partagé (+1 kB `/admin`, +1 kB `/apercu/assistant-salarie`) : abandonné, la phrase v2b est préparée dans `AIDE_V2` (non branchée) |

### Écarts à la planche (décidés et écrits)
- Pas d'image planche | implémentation (DesignSync indisponible) ; mesures prises de `SPEC-v2b.md`.
- Données : celles de `bureau-sim.mjs` (Alex, Bruno…, 105 h 15 sur 138 h 45), pas celles de la planche (Ergun, Sofiane, 131 h sur 234 h).
- Bouton plein de la fiche : « Enregistrer » (la planche dit « Modifier ») : la fiche est éditable en place, même action qu'avant ; « Prévu » est le composant « Horaire prévu » d'avant (champs + préréglages) au lieu de « 8 h – 17 h · 9 h ».
- Infobulle : attribut `title` du navigateur (délai du navigateur, pas 400 ms) : aucune nouvelle bibliothèque.
- Plus ⋯ contient aussi Coût chantiers, Versions du planning et Interventions supprimées (déjà là au lot 1 : on ne retire aucune fonction).
- Téléphone : flèches de semaine gardées (« Semaine 42 ‹ › ») ; « N pointent en ce moment » en vert sous la carte rouge ; le compteur « absents » du lot 1 n'est plus en haut (l'absence se lit sur la ligne du salarié) ; les étiquettes « EN COURS » / « ENVOYÉ » des cartes sont retirées (la couleur de la bulle le dit) ; « + Tâche » devient un bouton « ☐ » de 44 px (même geste).
- Chef d'équipe : « Chef · » devant « 24 h sur 38 h » (plus d'étiquette en majuscules).
- Réunion : une ligne sans couleur (titre + heure) ; lieu et « toute l'équipe » dans l'infobulle (et sous le titre au téléphone).
- Mois clôturé : « clôturé » (minuscules) à la place du total du jour, cases à peine teintées ; plus d'étiquette « CLOS ».
- Puce « en cours depuis … » d'un pointage sans intervention prévue (cas absent des données d'exemple) : texte d'avant, habillé vert d'eau.
- Légende : sous la grille à droite, fermée par défaut, aux états v2b (plus de créneaux matin / après-midi / soir).
- À 1 024 px, le total d'heures d'un jour peut s'abréger (« 36 h… ») plutôt que passer à la ligne.


## Après le lot 3 A du bureau (18 oct. 2026 : clients, chantiers, documents, réserves, salariés, invitations, fiche salarié, formations, e-mails ; `/admin?ui=2` sur aperçu ou en local seulement, `BUREAU_UI2_PAR_DEFAUT = false`)

Planche : `docs/design-brief/designer-bureau/` (CL01 à CL18, EQ01 à EQ19, XM01 à XM04, XM15, XM16), rendue avec `support.js` et React 18.3.1 (`scripts/tests/planche-bureau.mjs`). Images côte à côte planche | écran à la même échelle : `captures-lot3a/` (29 paires, `scripts/tests/cote-a-cote.mjs`). Hors de ce lot (autre agent) : ST*, RG*, IA*, la page Statistiques.

**Ce qui change (habillage seulement, mêmes fenêtres, mêmes champs, mêmes gestionnaires)**
- Vues différées dans `components/design/bureau/` : `lot3a-ui.tsx` (coque du lot 2 + blocs de la planche : lignes, champs, alertes, recherche, vide, jauge, dépôt, coches, segments, onglets), `reserves-v2`, `equipe-clients-v2`, `termine-v2`, `import-v2`, `documents-v2`, `gerer-v2` (avec le coût réel). Elles sont réexportées par `exporter-v2.tsx` (`lot3a-v2.ts`) : **aucun nouveau morceau différé** (chaque morceau coûte au chargeur partagé par toutes les pages, `/poseur` et `/apercu/assistant-salarie` sont au plafond). CSS dans `heures-v2.css` (bloc « Lot 3 A ») pour la même raison. Ces vues n'importent rien du premier chargement de `/admin` (sinon le module est tiré dans un morceau partagé ajouté au premier chargement : essayé, +1,6 kB).
- Branchements (`if (ui2) return <Suspense><…V2/></Suspense>` après les hooks, ou `{!ui2b && (…)}` autour de la fenêtre d'avant) : `reserves-report`, `chantier-termine`, `import-dialog`, `import-workers-dialog`, `chantier-documents` (bureau seulement, pas la feuille du salarié), `worker-detail` (onglet Gérer), `real-cost-card` (la vue v2 lui est passée par la fiche), `trainings-admin` et `staff-email-dialog` (contenu d'avant dans la coque v2, habillé par CSS).
- `admin-planning.tsx` : seulement le branchement de cinq fenêtres qui y vivent (Chantiers au téléphone, fiche client, nouveau client, Salariés, nouveau salarié) ; les états passent en listes ordonnées (`Lot3Ctx`, quelques centaines d'octets de moins qu'un objet à clés) ; `changeRole(u, rôle, dejaDemande)` : la v2 pose la question dans une fenêtre, le changement est le même.
- `pending-invitations.tsx` : la logique devient `useInvitationsAttente` (dates d'envoi, un envoi à la fois, arrêt à la première erreur) ; la liste d'avant l'utilise telle quelle (invitations-admin identique à la base), la fenêtre v2 pose ses deux questions en fenêtres (EQ05, EQ06).
- Nouvelles questions en fenêtre, devant le MÊME geste : archiver un client (CL07), changer un rôle (EQ07, remplace `window.confirm`), supprimer une invitation et « Envoyer toutes » (EQ06), rouvrir une réserve (CL18, la confirmation en ligne d'avant), archiver un salarié avec « Clôturer d'abord ses heures » (EQ12).
- Refus dits dans la fenêtre (le message d'avant reste) : fichier trop lourd (CL13), clôture refusée par le serveur (EQ11), réserves illisibles (CL16), échec de l'envoi groupé (EQ05).

| Preuve | Résultat |
|---|---|
| `node scripts/tests/bureau-lot3a-controles.mjs out <images> 4461` (simulateur `bureau-sim.mjs`) | **125 ✅ / 0 ❌** : chaque fenêtre s'ouvre, se ferme par ✕ et par Échap ; gestes = mêmes écritures (set_user_role, invite-worker, PATCH worksites, POST worksites, set_reserve_resolution, user_payroll…) ; états vides (recherche, réserves) et erreurs (réserves illisibles, e-mail invalide, nom manquant, fichier trop lourd) ; aucun défilement horizontal à 390, 834 et 1440 px |
| `bureau-v1-identique.mjs` (sans drapeau, base = build de `origin/main`) | **7 / 7 identiques octet pour octet** (le test attendait au téléphone un sélecteur dont le premier élément, la grille d'ordinateur, est caché : 25 s puis échec, sur la base aussi ; il attend maintenant la carte du téléphone) |
| Scripts du bureau en v1, base \| branche | **identiques** : admin-lot11 138/0, admin-lot9 39/0, admin-lot10 60/0, planning-lot2 86/0, requetes-lot29 79/2 (les 2 ❌ salarié déjà sur la base ; le profil est lu 1 ou 2 fois selon la course, ≤ 2 des deux côtés), invitations-admin 61 ✓ / 0 ✗ (la liste d'avant passe par `useInvitationsAttente`). |
| Copies `ui2b-` (régénérées, base \| branche) | **identiques** : planning-lot2 86/0, versions-lot8 144/0, requetes-lot29 79/2 (les 2 ❌ de la base) ; absences-lot2 et admin-lot11 (copie du lot 2) s'arrêtent au même endroit sur la base et la branche (déjà cassées sur main, voir « Après le planning v2b ») |
| `test:registre` | **143 / 0** : `clics.snapshot.json` régénéré (+7 fichiers, +84 gestionnaires) ; ancres 231 → 257 occurrences (les mêmes ancres reposées par les fenêtres v2, aucune valeur nouvelle) ; 5 ancres dynamiques des briques (`lot3a-ui.tsx`) rattachées à B72 comme celle du menu ☰ v2 |
| `test:guides-bureau` | **28 / 28** ; empreinte `guideForPrompt` bureau inchangée ; `GUIDES_BUREAU_UI2 = false` |
| `typecheck`, eslint des fichiers touchés | verts (les seules erreurs eslint sont celles d'avant, apostrophes de `worker-detail.tsx` et `admin-planning.tsx`) |
| Poids (taille exacte, `getJsPageSizeInKb`) | `/admin` 362,30 → **362,82** kB (max 363), `/poseur` 280,17 → 280,21 (max 280, arrondi 280), `/borne` 170,52 → 170,54, `/apercu/assistant-salarie` 290,43 → **281,79** (commit 1387184 repris : `GeoInfoDialog` à la demande) ; CSS `/admin` 14,2 kB (inchangé). Aucun plafond relevé |

### Écrans faits
CL03 à CL18, EQ01 à EQ19, XM01 à XM04, XM15, XM16 (EQ15 à EQ19 et XM15, XM16 : contenu d'avant dans la coque v2).

### Non faits ou partiels (fonction absente : rien créé)
- CL01, CL02 : le tiroir « Clients » appartient au planning v2b (`barres-v2.tsx`, hors périmètre) : non retouché (état vide « Aucun client », sans « + Nouveau client « … » »).
- CL05 : jauge « Consommé 94 h · 3 290 € · 78 % » et « en cours depuis le 01/09 » : la fiche ne calcule ni la consommation ni la date de début (le suivi est dans Coût chantiers) ; « Description » est gardée (champ d'avant).
- CL06 : « Suppression impossible » avec le nombre d'interventions et de documents : le gestionnaire ne renvoie que son refus (message d'avant) et ne compte pas les documents.
- CL11 : le choix de catégorie reste la fenêtre d'avant (annulation 20 s, avertissements), ouverte depuis le panneau v2. Suppression d'un document : question du navigateur d'avant.
- CL12 : choisir les documents envoyés n'existe pas (le message reprend toutes les pièces).
- CL15 : « Rouvrir le chantier » n'est pas au pied du bilan (il est dans la fiche client).
- EQ08 : « Retirer » le dernier accès bureau reste désactivé (infobulle), pas de message « Refusé ».
- EQ13 : le bulletin n'est pas conservé (pas de « Changer ») ; la ligne « Coût réel » ouvre le panneau.
- EQ14 : « Supprimer » reste actif (refus au clic si le salarié a des données) ; le formulaire reste affiché sous l'alerte « Compte archivé ».
- EQ16, EQ17 : l'ajout d'une formation et « qui l'a vue » restent dans le panneau (formulaire et détail dépliés en place), pas en fenêtre ni en second panneau ; la jauge de quota est celle du panneau d'envoi d'avant.
- EQ18, EQ19 : liste « Qui reçoit ? » d'avant (Tout sélectionner, aperçu de l'e-mail, journal) ; la confirmation « Envoyer N e-mails ? » est en place dans le panneau.

### Écarts à la planche (décidés)
- Données : celles du simulateur (Alex, Bruno… ; réserves sans observation → « sans détail écrit »).
- Fenêtres larges : 680 / 700 / 760 px comme la planche ; Formations 640, E-mail 620.
- XM02 : tous les champs de l'ordinateur (mêmes champs) et pied Supprimer · Archiver · Enregistrer ; XM03 : « Importer », « Demandes de congé », le sélecteur de rôle et « Relancer » restent sur chaque ligne (ils passent à la ligne).
- Lignes : « Relancer » (cloche d'avant) gardé sur la ligne d'un salarié en attente ; « Photos » gardé sur une réserve.
- EQ02 : l'adresse doit avoir une fin (« .fr ») avant « Envoyer l'invitation » (règle d'écran, la fonction d'invitation ne change pas) ; CL04 : « Créer le client » désactivé tant que le nom manque.
- EQ10 : la date se choisit dans la fenêtre (champ date, au plus tard aujourd'hui) ; les brouillons bloqués sont recomptés à chaque date (même requête qu'avant).
- Polices de la planche non chargées dans l'environnement de capture (police de repli) : les images comparent la mise en page.
