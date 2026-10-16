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
