# Audit 04 · Passe 3 du dossier écran salarié

Auditeur adverse, 15/10/2026. Livraison auditée : `README.md` (28 451 o), `tokens.css` (9 094 o), `salarie.css` (22 301 o), `donnees-exemple.ts` (9 772 o), planche `BEMEXO Salarié - Dossier.dc.html` (75 782 o), `support.js`. Rien n'a été modifié dans le dépôt hors ce fichier et `captures-passe3/` (9 PNG). Les fichiers du designer ont été copiés hors dépôt et ouverts seulement dans Chromium sans réseau (React du dépôt, polices de `public/fonts/`, 0 requête externe sortie).

## 0. Verdict en dix lignes

**Intégrable en l'état : NON.**

1. **La planche n'a pas été mise à jour.** Son empreinte MD5 (`a2e9f1ec711fdfb392557fe893eb581f`) est identique à celle de la planche auditée en passe 1 (audit 02) et à celle de la livraison « passe 2 ». Elle contient 39 écrans (E01-E28, P01-P03, AS1-AS8). Le README en cite 68 identifiants : **35 n'existent pas** (E04b, E05a-c, E09b, E16b, E17b, E20a-b, E21b, E22b-c, E23b, E29, E30a-c, E31-E40, E42, AS9, AS10, P00, P00b, P03b, P03c, P04). Parmi eux, E04b, E05b, E05c, E21b et E29 sont annoncés « ajoutés » depuis la passe 2 déjà.
2. **Aucun des changements visuels annoncés n'est dans la planche.** E05 montre toujours 3 tuiles TOTAL / PAUSES / PANIER sans grand chiffre de 44 px ni barres des 7 jours (capture 01). La planche ne contient aucune des valeurs de la passe 3 : 0 occurrence de `#C62828`, `#1F7A4D`, `#655B50`, `#755800`, `#B7366A`, `#EAD6F4`, `#FFE4A8` ; 16 de `#E53935`, 9 de `#8A7F70`, 11 de `#2FA36B`.
3. **Contrastes de la planche : inchangés.** 20 écrans sur 39 sous 4,5:1, pire cas 2,26:1 (E16), mesures identiques à l'audit 02 octet pour octet (§A).
4. **Ce qui a vraiment changé, ce sont `tokens.css` et `salarie.css`.** Les couples de couleur du CSS sont bons : 94 des 97 couples mesurés passent (§A.3). Les valeurs rejouées passent `test:creneaux` et `test:missions`, avec deux réserves (§B).
5. **Trois défauts de `salarie.css` mesurés au navigateur** : l'anneau de focus disparaît sur « Envoyer ma journée » et sur tous les boutons principaux ; `.dz-feuille` posée sur un `DialogContent` réel est décalée (moitié hors écran) ; aucun `z-index` dans le fichier (§F).
6. **Une erreur est de notre côté** : le titre de la fenêtre des horaires prévus est « Horaires prévus par le bureau » dans le code ; « Le bureau avait prévu… » n'apparaît que dans des commentaires. Notre fichier 01 §D s'est trompé et le designer a « corrigé » vers la mauvaise valeur (README §6.1). La passe 2 avait raison.
7. **Sept cibles de guide changent de place** : cela casse 5 phrases de guides, 1 test navigateur et 2 totaux épinglés du registre (§C.2).
8. **Couverture 81 / 12 / 10 / 1** : le décompte arithmétique est exact, mais seuls **42 des 81 « dessinés »** ont tous leurs écrans dans le fichier livré (§E).
9. **Régressions de documentation** : couches `z-index`, règle d'échelle de la frise, composants `Rappels` / `AssistantPastille` retirés du README (§G).
10. **Plan** : redemander l'export réel de la planche avant tout travail (correction 1), puis appliquer les corrections intégrateur de §H.2.

## A. Contrastes, cibles, débordements

### A.1 Méthode

Même harnais que l'audit 02 (copie dans `scratchpad/a3/`), rejoué sur la planche livrée à 370 × 824 (cadre dessiné), 390 × 844 et 360 × 640. Contraste WCAG 2.x sur les pixels composés (fond remonté jusqu'à la racine, opacités de groupe comprises). Seuils : 4,5:1, 3:1 pour le texte large. Cibles repérées par forme (boutons = `<span>`). Les sorties 370 × 824 et 360 × 640 sont **identiques octet pour octet** à celles de l'audit 02 (`cmp` : mêmes fichiers JSON).

### A.2 Écrans encore fautifs (planche livrée)

20 écrans, 121 nœuds de texte sous le seuil avec ce filtre (nœud visible à plus de 30 %, hors écrans cachés par un voile ; l'audit 02 en comptait 94 avec un filtre plus strict : mêmes 20 écrans, même pire cas).

| Écran | Nœuds | Pire ratio | Cause (couple fautif, nombre de nœuds) |
|---|---|---|---|
| E02 | 2 | 2,91 | « Envoyer ma journée → » grisé `#8A7F70` sur `#E6DDCD` ; aide `#8A7F70` sur crème 3,36 |
| E03 | 7 | 2,91 | idem + blanc sur `#2FA36B` 3,20 (×3) |
| E04 | 7 | 3,20 | blanc sur `#2FA36B` ×3 ; aide 3,36 ; lettres de jours `#817C75` sur `#25201B` 3,91 ×2 (opacité .45) |
| E05 | 7 | 3,20 | blanc sur vert ×2 ; aide 3,36 ; « PAUSES » `#B35F41` sur `#FFE1CC` 3,64 |
| E06, E07, E11, E17, E18, E19 | 6, 6, 6, 5, 8, 5 | 3,20 | blanc sur vert (coches) ; aide 3,36 ; lettres de jours 3,91 |
| E12 | 11 | 3,20 | blanc sur vert ×5 ; `#8A7F70` sur `#EFE9DE` 3,25 ×2 (ville de la ligne RETIRÉ) ; aide 3,36 |
| E14 | 7 | 3,20 | vert ; aide ; « PAUSES » 3,64 |
| E15 | 9 | 3,20 | vert ×5 ; aide ; lettres 3,91 |
| E16 | 9 | **2,26** | tuiles verrouillées en opacité : « PANIER » `#DBC27D` sur `#848079` 2,26 ; « + » à .35 2,33 ; « TOTAL » 2,49 |
| E25 | 6 | 3,20 | blanc sur vert ×4 ; lettres 3,91 |
| E26 | 11 | 2,28 | chevrons `#B5A994` sur `#FFFDF8` ×8 ; blanc sur `#E53935` 4,23 ; titres `#8A6A00` 4,35 |
| E27 | 1 | 3,20 | « ENVOYÉ ✓ » blanc sur vert |
| AS1 | 6 | 2,28 | chevrons ×4 ; placeholder 3,92 ; titre 4,35 |
| AS3 / AS4 | 1 / 1 | 3,92 / 4,23 | placeholder `#8A7F70` ; « Supprimer » blanc sur `#E53935` |

Autres mesures (planche livrée) :

| Mesure | Résultat |
|---|---|
| Texte < 12 px | 0 sur 39 écrans (`salarie.css` : minimum 12 px) |
| Cibles < 44 px dessinées | 9 formes sur 5 écrans : E05 « Ouvrir › » 58 × 21 et 3 cases de tâche 26 × 26 ; E06 case 26 × 26 ; E12 bouton « Journée envoyée » 362 × 42,2 ; E19 « Relancer » 72 × 21 ; AS7 ✦ 36 × 36 et « Ouvrir › » 58 × 21. Le CSS dit 44 px minimum, le dessin non |
| Recouvrement de texte | 0 à 370 × 824 et 360 × 640 ; 1 à 390 × 844 (AS7 : texte de la pastille sur « Reprendre ») |
| Contenu sous la barre du bas | E04 : 2 blocs ; E05 : 6 blocs (« Réunion sécurité » 294 px sous la barre, « TÂCHES DU JOUR » 486 px) ; à 360 × 640 : 19 écrans |
| E21 (feuille) | OK coupé de 28 px (370 × 824), 10 px (390 × 844), **235 px** (360 × 640 : le bouton OK sort de la feuille, capture 05) |

### A.3 Couples de couleur de `tokens.css` / `salarie.css` (97 couples, calcul sur les valeurs)

94 passent. Chaque affirmation du README §4.1 est confirmée : blanc sur `#1F7A4D` 5,32 ; `#655B50` sur crème 5,69, sable 4,92 ; `#755800` 5,71 ; blanc sur `#C62828` 5,62 ; `#655B50` sur `#EFE9DE` 5,49 ; `#7A3A00` sur `#FFE4A8` 6,95 ; encre secondaire `#5B534A` 6,23 / 6,12 / 5,55 / 6,24 sur matin / après-midi / soir / réunion. Les triplets HSL de `tokens.css` redonnent maintenant exactement les hexadécimaux (0 écart, contre 7 en passe 1). Écarts mesurés :

| Couple | Mesure | Seuil | Remarque |
|---|---|---|---|
| Vert `#1F7A4D` sur le noir de la bande | **3,04** sur `#25201B` (3,51 seulement sur `#15120F`) | 3 | le README annonce 3,51 ; marge de 0,04 |
| Bord de carte « prévu » `#9C907E` sur crème | 2,68 | 3 | bord pointillé, seul signe de la carte transparente |
| Bords de champs, puces, boutons `#D6CBB7` sur blanc | 1,58 | 3 (WCAG 1.4.11) | identique au dépôt actuel, non corrigé |
| `--dz-squelette-clair` | commentaire « → 5,5:1 » | — | c'est un fond de squelette : 1,01:1 sur crème, le commentaire est faux |
| Réunion, bord `#B7366A` | 4,63 | 4,5 | passe, marge 0,13 |

## B. Tests de couleur du dépôt

Méthode : copie hors dépôt de `supabase/functions/_shared`, `lib/time-input.ts` et des migrations lues par les tests (état de la branche) ; `npx -y deno@2 test …` ; base de référence 5/5 et 19/19. Valeurs remplacées : `DAY_PARTS` fond et trait, `DAY_PART_INK`, `MEETING_TINT` (fond et bord).

| Essai | `test:creneaux` | `test:missions` |
|---|---|---|
| 0. Dépôt tel quel | 5 / 5 | 19 / 19 |
| 1. Valeurs de `tokens.css`, tests intacts | **4 / 5** : `day-part.test.ts:95` épingle le matin à `#DAEDFB` ; la valeur du designer est `#DDEBFA` | 19 / 19 |
| 2. Idem + ligne 95 mise à `#DDEBFA` | **5 / 5** | 19 / 19 |
| 3. Idem + les 7 barres de chantier du designer dans `CHANTIER_BARS` du test | 5 / 5 | **18 / 19** : « bordure / barre la plus proche : ΔE 46,2 » (épinglé entre 8 et 12) ; la seconde épingle « fond / pastille » donnerait 8,95 (épinglé entre 4 et 6) |

Lecture :
- Le README (« test:missions 19/19 avec les trois valeurs ») est exact **à palette de chantier du dépôt inchangée**. Le designer écrit « matin `#DDEBFA` inchangé » : c'est inchangé depuis sa passe 2, pas depuis le code (`#DAEDFB`, ΔE 1,8) ; la ligne 95 doit être modifiée par l'intégrateur.
- Adopter les 7 teintes de chantier du designer fait échouer deux valeurs **épinglées** du test (pas des seuils) : à ré-épingler à la main. Mesures : texte d'étiquette sur fond 5,98 à 8,38:1 ; barres à 58 de ΔE du fond de réunion au moins ; barre la plus proche de la barre d'une autre : ΔE 25,9. Le fond d'étiquette `#F5E5E0` (chantier 3) est à 9,0 du fond de réunion et `#EAE6F5` à 9,4 : sous les 10 que le dépôt exige entre réunion et teintes de fond (le test ne couvre pas les étiquettes).
- Sens des couleurs : `--dz-chantier-2` `#1F7A4D` est le vert « envoyé / en cours » de l'interface ; `--dz-chantier-1` `#1D5FA8` côtoie le trait du matin.
- **Rouge `#C62828`** : aucune occurrence de `E53935`, `C62828`, `14 72%`, `0 72%`, `DF3331`, `destructive` dans `scripts/tests`, `lib`, `supabase/functions/_shared` (grep). Aucun test ne fixe la valeur du rouge ; la seule couleur d'avertissement lue est `#C0461F` (`appairage-un-geste.mjs:736`, orange, non concernée). **Le rouge ne casse rien.** Attention : le bloc `.bt-skin{…}` injecté par `app/poseur/page.tsx:127-148` (`--destructive:14 72% 44%`, `--ring:43 100% 55%`, `--muted-foreground:40 6% 42%`) a la même spécificité et vient **après** `tokens.css` : il gagne tant qu'on ne le supprime pas.
- Tests navigateur qui épinglent les anciennes valeurs (non lancés par la CI) : `planning-lot3.mjs:320` (`rgb(87, 82, 74)` = `#57524A`), `taches-heures-lot9.mjs`, `missions-lot4.mjs`, `impression-lot3bis.mjs`, `impression-cadre.mjs` (`rgb(218,237,251)`, `rgb(253,227,202)`, `rgb(223,204,238)`, `rgb(249,214,224)`). Les `#57524A` écrits à la main dans `planning-print-sheet.tsx:121,139`, `admin-planning.tsx:723`, `staff-email-dialog.tsx:54,84` doivent suivre `DAY_PART_INK`.
- Absences : README §4.3 dit que le salarié « reprend l'angle (45°) et les teintes du bureau », mais `tokens.css` garde ses propres valeurs à 135° avec le commentaire « propositions à remplacer par celles du code ». Avec les teintes du code (`admin-planning.tsx:529-534`), paires non testées sous ΔE 10 : matin / intempérie **7,3**, après-midi / congé **8,6**, après-midi / repos **8,1**, réunion / maladie **10,0**.

## C. Repères

### C.1 Fichier 01 contre README §6.2 et planche

Le total « 133 » est la somme de l'en-tête du fichier 01 (50 `data-testid` + 43 classes + 26 `data-guide` + 7 `data-guide-confirm` + 7 `aria-label`). Le README §6.2 le reprend sans le recompter. Contrôle ligne à ligne (219 atomes relevés dans les tableaux B à G) :

| Constat | Détail |
|---|---|
| Planche | **0** `data-testid`, **0** `data-guide`, **0** classe : tout est en style en ligne. La présence « à l'identique dans la planche » est invérifiable, par construction |
| Repères écrits en toutes lettres dans le README | 178 sur 219 (le reste : 32 abrégés ci-dessous, 9 non couverts dont 1 artefact de ligne `:78` et 1 doublon) |
| Couverts par une notation abrégée, noms non écrits | 32 : `planned-confirm` + `-list`, `-send`, `-fix`, `-skip` ; `live-clash` + 5 suffixes ; jokers `history-*`, `trainings-*`, `training-*`, `guide-*`, `conges.*`. Le README exige pourtant « en toutes lettres » |
| **Absents du README** (hors artefact et doublon) | `bt-lt-el` (lu par `salarie-lot10.mjs:129-130`), `data-seen`, `data-cible`, `data-phase`, `{testId}-error`, `pointer-info`, `role=dialog` (Informations, guide), `aria-label` `{N} formation(s) à voir` et `{titre} : vue / pas encore vue` |
| Inventés | **0** repère inventé : les atomes du §6.2 absents du fichier 01 sont des noms de composants, de classes `dz-*` ou de propriétés. Nouveaux attributs `data-etat`, `data-dz-creneau`, `data-ton` : aucune collision dans `app`, `components`, `lib`, `scripts/tests` |
| « Aucun renommé » | Vrai pour les `data-*`, ids et classes. Ce qui change : `.bt-ed-trash` devient un bouton à texte (classe, `data-guide` et `aria-label` gardés) ; `aria-label` « Ajouter une intervention » → « Ajouter un chantier » et « Scanner le QR de la borne » → « Scanner la borne » (alignement sur le code, mais la planche porte encore les anciens : 1 occurrence de « Scanner le QR de la borne ») |
| Corrections du README passe 1 (`.bt-timecard`, `data-bub`, `data-live`, `.bt-err`, `data-day`) | Reprises correctement |

### C.2 Les 7 cibles qui changent de place : ce qui casse

`guide-tour.tsx` ne contient aucune ancre en dur ; il mesure `[data-guide]`, place sa carte en bas puis la remonte si elle couvre la cible (`:211-216`), et affiche « Ce bouton est caché par une fenêtre » si la cible est recouverte (`:234-269`). Il ne casse donc pas à cause d'un déplacement, **à condition** que les cibles restent des `<button>` visibles, non recouvertes par la barre fixe ni par un en-tête rétracté. Ce qui casse :

| Cible | Code actuel | Ce qui casse (ancre) | Phrases et tests faux |
|---|---|---|---|
| `entete.scanner` (en-tête → barre du bas, bouton `QR`) | `app/poseur/page.tsx:549` | `data-guide`, `data-testid="scan-open"` et `aria-label` à déplacer sur le bouton de la barre ; le nom d'ancre reste « entete » (5 fichiers le citent) | `worker-tours.ts:63` (guide `pointer`) « touchez l'icône du scanner, **en haut** » ; `:145` (guide `borne`) « l'icône du scanner » alors que le bouton s'appelle « QR » ; `worker-assistant-core.ts:505` « **Icône scanner en haut de l'écran.** » ; `guides-lot7.mjs:325-328` ; `registre/surfaces-salarie.ts:25` (S11) ; scripts `scan-open` : `qr-fixe-lot12.mjs` ×3, `salarie-lot12.mjs` ×1 |
| `journee.assistant` (barre du bas → en-tête, ✦) | `poseur-day.tsx:2588` (`dock-assistant`) | le bouton passe de `poseur-day` à `page.tsx` : il faut remonter `onAssistant` ; `page.tsx:677` (`returnFocus`) marche si l'attribut est gardé ; **l'en-tête se rétracte à la descente** (`hdrHidden`, `--phdr-h`) alors que le README le dit « fixe » : si l'en-tête se cache, ✦ devient injoignable | `worker-assistant-core.ts:512` et `:514` « **Bouton ✨ de la barre du bas.** » ; commentaires `worker-assistant.tsx:42`, `assistant-panel.tsx:224` ; `guides-lot7.mjs:278,298` (« le focus revient au bouton ✨ de la barre du bas ») ; `dock-assistant` lu par 9 scripts (guides-lot7, pause-lot3bis, panier-lot3bis, site-rapide-lot5, assistant-historique, assistant-multi, heures-sures, bureau-lot2, ia-formule-lot6) |
| `menu.journee`, `menu.semaine`, `menu.mois` (lignes du menu → boutons de la barre) | `page.tsx:65` (`MENU_GUIDE`) et `:599` (`data-guide={MENU_GUIDE[t.value]}`) | **`registre-surfaces.test.ts:393-396` épingle 129 ancres littérales / 163 occurrences et 5 expressions d'ancre dynamique dont `app/poseur/page.tsx`** : retirer la table ou rendre les trois ancres littérales change ces totaux. `onStepEnter` ouvre le menu (`ecran: 'menu'`, `page.tsx:406-417`) : le menu ouvert recouvre la barre, donc « Ce bouton est caché par une fenêtre ». `TourScreen` n'a pas `'plus'` | `worker-tours.ts:80` (guide `planning`) « Touchez **« Ma semaine »** (ou **« Mon mois »**) » alors que les boutons s'appellent « Semaine » et « Mois » (le test des libellés passe encore tant que les lignes du menu gardent « Ma semaine ») ; son étape 1 (`menu.compte`, « votre nom, en haut à droite ») devient inutile ; `worker-assistant-core.ts:475` « Menu → « Ma semaine » ou « Mon mois » » ; `guides-lot7.mjs:356` (« menu ouvert par le guide ») ; 7 scripts citent « Ma semaine » ou « Mon mois » |
| `editeur.documents` (pied → corps de la feuille) | `poseur-day.tsx:2740` | rien d'obligatoire ; le corps est un vrai défilement, le guide le centre (`guide-tour.tsx:105`) | aucune phrase fausse (3 phrases citent « Documents » sans position) |
| `editeur.retirer` (corbeille → bouton « Retirer ce chantier ») | `poseur-day.tsx:2745` | rien d'obligatoire | `worker-tours.ts:110` « touchez **la corbeille** (« Retirer ce chantier ») » ; `worker-assistant-core.ts:489-490` (« Retirer ») ; scripts citant `bt-ed-trash` ou `bt-ed-doc` : `documents-lot24`, `bureau-lot2`, `brouillons-lot2`, `fenetres-lot11` ×2 |

Mot interdit « onglet » : `worker-tours.test.ts` le refuse. La planche en contient encore 2 (notes), le README dit « les boutons du bas » (bon).

## D. Gardes et confirmations

### D.1 Ordre des 7 contrôles d'envoi contre `poseur-day.tsx`

| # README | Code (`handleSubmitDay`, `:1583`) | Conforme |
|---|---|---|
| 1 Sortie oubliée sans fin → E31 | `:1585-1587` `isExitToComplete`, **toast** `EXIT_TO_COMPLETE_MSG` (« Sortie oubliée : mets ton heure de fin avant d'envoyer. ») puis ouvre la ligne | oui (c'est un toast, pas une fenêtre) |
| 2 Chevauchement (dont deux prévus) → E11 | `:1591` `overlapBlocks()` (toast). Le recouvrement de **deux prévus** n'est testé qu'après « Oui, envoyer ces horaires » (`answerPlanned` `:1612`) | oui, nuance : le README le place au rang 2, le code le teste au rang 3 |
| 3 Horaires prévus → E08 | `:1594` `plannedAsk` | oui |
| 4 Pause, une plage à la fois → E09, E09b | `askNextPause` `:1620`, 6 h, une plage à la fois | oui |
| 5 Journée vide → E32 | `continueSubmit` `:1657-1663` toast « Ajoute un chantier » (aussi `:1724`) | oui |
| 6 Plus de 10 h strict → E10 | `checkCoherenceWarnings` `:1559` `totalMins > 600` | oui |
| 7 Envoi → E33, issues E34, hors-ligne E35 | `doSubmit` (hors-ligne `:1698-1717`, issues `:1735-1741`) | oui |

L'ordre est exact. **Aucun des écrans de cet enchaînement n'existe dans la planche** sauf E08, E09, E10, E11 (anciens textes).

### D.2 Chaque ligne du fichier 02 : écran preuve existant ?

« Existe » = écran présent dans la planche livrée. « Libellé » = conforme au code dans le fichier livré.

| Lignes | Écran annoncé | Existe | État dans la planche livrée |
|---|---|---|---|
| A1 sortie oubliée | E31 | **non** | E18 seul, sans arrêt d'envoi |
| A2 chevauchement | E11 | oui | étiquette « CHEVAUCHEMENT » encore là (README : « À ENVOYER ») ; titre « Envoi impossible : deux chantiers se chevauchent » ≠ code « Deux chantiers se chevauchent : 08:00–12:00 et 11:00–15:00. Corrige l'un des deux avant d'envoyer. » |
| A3 horaires prévus | E08 | oui | « Non, je corrige » (code : « Non, je corrige mes heures ») ; kicker « 1/3 » ; note « focus initial sur Non » (le code n'a pas d'`onOpenAutoFocus` : Radix focalise le premier bouton, « Oui, envoyer ces horaires ») |
| A4 pause | E09, E09b | E09 seul | 30 min **présélectionnées** + « Valider · pause 30 min » : le contraire de la consigne ; kicker « 2/3 » ; indice « Pendant cette plage… » absent |
| A5 journée vide | E32 | **non** | — |
| A6 plus de 10 h | E10 | oui | « Tu vas envoyer 10:45 de travail aujourd'hui. C'est bien ça ? » (code : « Total : 10:45 (dépasse 10h). Vérifie tes horaires. » + « Envoyer quand même ta journée ? ») ; kicker « 3/3 » |
| A7 « Envoi… » | E33 | **non** | l'état existe seulement dans la planche des 6 boutons d'envoi |
| B1, B2, B3 issues | E34 | **non** | — |
| B4 envoi hors-ligne | E35 | **non** | — |
| B5 retour du réseau | E07 | oui | bandeau « 2 saisies vont partir » + carte « À ENVOYER » : l'incohérence relevée n'est pas corrigée |
| B6 transferts en échec | E19 | oui | « Relancer » 72 × 21 |
| B7 réseau instable | texte | — | README « Textes non dessinés » |
| B8 envoi après scan | E36 | **non** | P02 présent sans la fenêtre ; libellés « Oui, envoyer ma journée » / « Pas maintenant » absents du README |
| C1 déjà envoyée | E13 | oui | « Si tu continues, la secrétaire sera prévenue de ta correction. » (code : « Cette journée a déjà été envoyée. Si tu y touches, la secrétaire en sera informée. ») ; kicker « MODIFIER » inventé |
| C2 retrait (3 textes) | E30a-c | **non** | résultat « Chantier retiré — la secrétaire est prévenue » absent partout |
| C3 ligne retirée | E12 | oui | « RETIRÉ » barré visible ; retour passager « Journée envoyée » encore posé sur les cartes |
| C4 mois clôturé | E16, E16b | E16 seul | **bandeau** « Mois clôturé » (code : fenêtre + « Compris ») ; « Heures clôturées » en note seulement |
| C5 renvoyée | E14 | oui | étiquette « À CORRIGER » encore présente ; pas de flèche ‹ de retour |
| C6 corrigée | E15 | oui | ancien → nouveau lisibles |
| C7 journées à envoyer | E37 | **non** | — |
| C8 panier verrouillé | E16 | oui | variantes absentes |
| D1 refus de OK | E38 | **non** | — |
| D2 ligne verrouillée | aucun | — | « Ce chantier n'a pas changé… » nulle part |
| D3 autre chantier | E22b, E22c | **non** | E22 : « Autre chantier — travail non prévu » seulement |
| D4 pause « Autre » | E39 | **non** | — |
| D5 réglage de l'heure | E40 | **non** | E21 : « Heure exacte gardée : 07:32 » en note |
| D6 annuler | — | oui | E21 ✕ seul, conforme |
| D7 détail des réserves | E39 | **non** | — |
| D8 prévu qui ne partira pas | E04b | **non** | E04 : texte « Ne partira pas » masqué à 19 % par la barre |
| D9 copie | E24 | oui | calendrier en puces, « ven. 16 » (congé) présélectionné ; erreurs absentes |
| D10 route / pause | E05c | **non** | « 1:00 entre 11:30 et 12:30 » à 143 px sous la barre dans E05 |
| E1, E2 pointage en cours | E05, E23b | E05 seul | carte visible ; E23b absent |
| E3, E5 pointage oublié | E17, E17b | E17 seul | bouton « **Enregistrer la fin** » (code : « Terminer ma journée »), question « Tu as fini à quelle heure ? » **seulement dans la note** |
| E4 fin le lendemain, E7 | E17, E18 | oui | dessinés |
| E6 règle des 14 h | texte | — | README « Textes non dessinés » |
| F1 terminer possible | E23 | oui | consigne borne toujours absente de la fenêtre dessinée |
| F2-F6, états « Un instant… » | E23b | **non** | README texte seul |
| G1 réserve sur la carte | E42 | **non** | — |
| G2, G4 liste, « Réserve levée » | E20a, E20b | **non** | — |
| G3 lever | E20 | oui | dessiné |
| G5 retours passagers | E12 | oui | un seul toast, sans action |
| G6 tâches hors-ligne | E06 | oui | case 26 × 26 |
| G7, G8 réunion, « Terminé le » | E05c, E04b | **non** | hors cadre dans E05 / E04 |
| H1 chargement | E01 | oui | |
| H2 échec de chargement | E02 | oui | « Envoyer ma journée → » grisé et « RIEN À ENVOYER » **encore affichés** (README : « E02 sans bouton ») |
| H3 hors-ligne | E06 | oui | |
| H4 compte archivé | E28 | oui | « Se déconnecter » toujours présent (README : supprimé) |
| H5 retour Android | texte | — | README |
| H6, H7 /pointer attente, QR fixe | P00, P00b, P04 | **non** | — |
| H8, H9, H10 refus, expiré, neutres | P03, P03b, P03c | P03 seul | P03 mélange toujours « QR expiré » et « Réessayer » |
| H11 départ | P02 | oui | un seul raccourci (« Envoyer ma journée ») ; « Ajouter une intervention » absent |
| H12 historique assistant | AS4-AS6, AS9 | AS4-AS6 | « Garder / Supprimer » + « Tout effacer ? » en fenêtre : non corrigé ; AS9 absent |
| H13 questions heures, planning, collègues | AS10 | **non** | AS1 ne contient pas le mot « collègues » |
| H14 guide | table | oui | README §6.2 : 7 cibles ; voir C.2 |

Bilan : sur 68 lignes, **34 s'appuient sur un écran absent**, 5 sur du texte seul, 29 sur un écran existant dont l'état est celui de la passe 2.

### D.3 Écarts de libellé exacts (code contre planche livrée)

| Élément | Code actuel | Planche livrée |
|---|---|---|
| E08 bouton | « Non, je corrige mes heures » (`poseur-day.tsx:2871`) | « Non, je corrige » |
| E08 corps | « Tu n'as pas noté d'heures pour : » + liste « Chantier · 13:30–17:00 (3:30) » + « Tu as travaillé exactement ces horaires ? » | « Villa Exemple 13:30 → 17:00 (3:30). Tu as travaillé exactement ces horaires ? » |
| E08 titre | « Horaires prévus par le bureau » (`poseur-day.tsx:2858`) | « Horaires prévus par le bureau » (**conforme**) ; le README §6.1 le remplace à tort par « Le bureau avait prévu… » |
| E09 | `zeroLabel` « Non », `confirmLabel` « OK », indice « Pendant cette plage. Plusieurs pauses ? Additionne-les. », rien de présélectionné ; corps « 07:30–15:00 : 7:30 d'affilée, sans pause notée. » | « Valider · pause 30 min », 30 min présélectionnées, corps « De 07:30 à 15:00 sans arrêt (7:30 d'affilée). » |
| E10 | « Total : 10:45 (dépasse 10h). Vérifie tes horaires. » puis « Envoyer quand même ta journée ? » | « Tu vas envoyer 10:45 de travail aujourd'hui. C'est bien ça ? » |
| Kickers | aucun kicker dans le code | « AVANT L'ENVOI · 1/3 », « 2/3 », « 3/3 » (README : plus de compteur) |
| E13 | « Cette journée a déjà été envoyée. Si tu y touches, la secrétaire en sera informée. » | « Si tu continues, la secrétaire sera prévenue de ta correction. » + kicker « MODIFIER » |
| E16 | fenêtre « Mois clôturé » / « Heures clôturées » + « Compris » | bandeau |
| E17 | « Terminer ma journée » (`live-timer.tsx:230,252`) | « Enregistrer la fin » |
| E21 | titre = nom du chantier (`slotTitle`) ; « Retirer ce chantier » | « Modifier l'intervention » ; « Retirer cette intervention » |
| E24 | titre « Dupliquer cette journée » ; bouton « Copier (N) » | « Sur quels jours ? » ; « Copier sur 2 jours » |
| E11 / E14 | étiquette « À ENVOYER » | « CHEVAUCHEMENT » / « À CORRIGER » |
| Barre du bas | `aria-label` « Scanner la borne », « Ajouter un chantier » | « Scanner le QR de la borne » |
| E28 | pas de bouton (déconnexion automatique) | « Se déconnecter » |

## E. Couverture S1 à S104

Décompte du README §3 : 81 dessinés, 12 partiels, 10 non dessinés, 1 comportement = 104. **Arithmétique exacte.** Mais :

| Dessinés | Nombre |
|---|---|
| Tous les écrans cités sont dans la planche livrée | **41** (+ S77, « barre du bas », sans identifiant) = 42 |
| Au moins un écran cité absent | 29 (S2, S8, S14, S16, S18, S20, S22, S26, S28, S30, S31, S32, S34, S37, S38, S39, S41, S43, S46, S47, S48, S59, S78, S90, S92, S95, S97, S99, S104) |
| **Tous** les écrans cités absents | **10** : S4, S6, S7, S9, S19, S24, S61, S94, S98, S103 |

Échantillon de 35 capacités (31 lignes), dont les 7 nommées (S16, S32, S104, S4, S9, S34, S90). « Preuve » = présence visible, sans défilement caché, dans l'écran de la planche livrée.

| S | Capacité | Écrans cités | Preuve visible |
|---|---|---|---|
| S1 | Jour affiché ; **retour à aujourd'hui** | E05, E14, E15 | jour : oui ; **flèche ‹ : aucune dans les 39 écrans** (E14, E15, E25 n'en ont pas) |
| S2 | Créneaux prévus | E04, E05b | oui (E04) |
| S4 | Prévu qui ne partira pas | E04b, E05b | **non** : E04b absent ; dans E04 le texte est couvert à 19 % par la barre |
| S6 | Réunions | E05c | **non** : « Réunion sécurité » 294 px sous la barre |
| S7 | Tâches et compteur | E05c | **non** : 486 px sous la barre |
| S8 | Cocher une tâche | E05c, E06 | partiel : E06 grisé visible |
| S9 | « Terminé le … » | E04b | **non** : couvert à 100 % |
| S12, S13 | Pointage en cours, terminer | E05 | oui |
| S16 | Pointage rattaché au total | E05, E05a, E05b | oui sur E05 ; E05a absent |
| S14 | Pointage oublié, fin | E17, E17b | **non** : question « Tu as fini à quelle heure ? » dans la note seulement |
| S20 | Heure exacte gardée | E21, E40 | note seulement ; molette absente |
| S22 | Pauses contrôlées | E21, E39 | puces seules ; « Autre » sans aperçu |
| S28 | Retirer (confirmation) | E30a-c, E12 | **non** : confirmation absente |
| S31 | Qualifier un trou | E05b, E07 | **non** : 143 px sous la barre ; état répondu jamais dessiné |
| S32 | Panier | E05a, E03 | oui (tuile PANIER d'E03) |
| S34 | Dupliquer | E05c, E24 | oui (E24) ; bouton d'entrée absent |
| S38 | État d'une réserve, lever | E42, E20a, E20 | E20 seul |
| S39 | « Envoyer ma journée », 5 états | planche, E33-E35 | planche des 6 boutons : oui ; E33-E35 : non |
| S41 | Question pause | E09, E09b | E09 présélectionné (faux) |
| S43 | Arrêt avant envoi | E11, E31, E32 | E11 seul |
| S46 | Clôture | E16, E16b | bandeau ≠ fenêtre |
| S47 | Rappels journées à envoyer | E05, E37 | note d'en-tête oui ; liste 60 jours absente |
| S48, S97 | Après un scan | P02, E36 | P02 seul, un seul raccourci |
| S49 | Ma semaine | E25 | oui, **mais sans carte Total ni barres** (README : « carte à barres ») |
| S54 | Ouvrir un jour | bande, E25 | oui |
| S59 | Rappel réserves | E05, E20a | puce oui ; liste non |
| S82, S86 | Ouvrir l'assistant, heures dites | E05, AS1, AS2 | oui |
| S90 | Questions heures, planning, **collègues** | AS10, AS1 | **non** : AS1 sans le mot « collègues » ; AS10 absent |
| S92 | Nouveau chat, historique | AS4-AS6, AS9 | AS4-AS6 (anciens libellés) ; AS9 absent |
| S95, S99 | Position QR fixe, refus | P04, P03, P03b | P03 mélange refus et expiré |
| **S104** | Total, prévu, **4 compteurs** | E04, E05a | **non** : E04/E05 montrent 3 tuiles (TOTAL, PAUSES, PANIER) ; **aucun compteur « chantiers » ni « route »** dans les 39 écrans ; seul « + 7:30 prévues… » (E04) est visible |

Résultat sur les 35 : **9 preuves visibles et complètes** (S2, S12, S13, S16, S32, S34, S54, S82, S86), **17 partielles**, **9 non démontrées** (S4, S6, S7, S9, S14, S28, S31, S90, S104).

## F. Faisabilité d'intégration

| Point | Mesure ou constat |
|---|---|
| Poids du CSS | `tokens.css` 9 094 o (3,77 ko gzip) + `salarie.css` 22 301 o (4,69 ko gzip) = **31,4 ko bruts, 8,2 ko gzip, 7,3 ko brotli**. Le CSS global actuel : 62 031 o, 12,0 ko gzip (`out/_next/static/css`) : +68 % |
| Budget | `check-bundle-budget.mjs` lit « First Load JS » (JavaScript) : un `.css` importé **n'entre pas** dans les 335 / 345 ko de `/poseur`. À importer dans `app/poseur/layout.tsx` et `app/pointer/layout.tsx` (existent), **pas** dans le layout racine : 22 pages seraient alourdies, et le sélecteur `.bt-skin` de `tokens.css` redéfinirait les fenêtres de `/admin` (29 fichiers l'utilisent) |
| Requêtes | `fetchPending` (`page.tsx:224`) lit `planning (work_date, absence_type)` et `time_entries (work_date, status)` : **ni minutes, ni heures de début/fin**. Les barres des 7 jours et le prévu demandent `total_minutes`, `start_time`, `end_time`, `break_minutes` : colonnes à **ajouter aux lectures existantes**, sans nouvelle requête (18 sur 18 aujourd'hui, `requetes-lot29.mjs:27`). Mais `PoseurDay` charge son jour à part : il faut remonter les 7 jours du parent. Risque de cohérence : barre d'aujourd'hui (relue toutes les 60 s) contre grand chiffre (état vivant, file hors-ligne, pointage en cours) |
| 4 compteurs | données déjà dans `poseur-day.tsx:2180-2237` : pas de requête. Mais `Tuiles` ne porte pas « · payée » (`travelPaid`), ni la règle « route seulement si > 0 », ni l'absence du panier quand `meal === false`, ni l'infobulle « Journée chez le comptable : vois avec la secrétaire. » |
| Types | `donnees-exemple.ts` compile seul en `--strict` (0 erreur) mais n'importe rien de `lib/types.ts`. Écarts : `Ligne.etat` est dérivé de 5 sources (`status`, `locked` / `exported_at`, file `localStorage`, `planning`, `active_sessions`) ; l'état `'renvoye'` utilisé par la carte d'E14 n'est pas dans `EtatLigne` ; heures `'HH:MM'` contre `'HH:MM:SS'` en base ; `Jour.absence` `'C'|'M'|'I'|'R'` contre `'conge'|'maladie'|'intemperie'|'repos'` |
| Collision `dz-*` / `bt-*` | 0 occurrence de `dz-` dans `app`, `components`, `lib`, `public` ; 90 classes `dz-*` dans `salarie.css`, aucune ne redéfinit une `bt-*`. Toutes les classes du README §7 existent dans le CSS |
| Classes manquantes | aucune classe pour Semaine (barres d'E25), menu du compte, Mon équipe, bulles et historique de l'assistant, `/pointer` (P00-P04), squelette (E01), messages d'état, toasts : `salarie.css` couvre la Journée et les feuilles |
| **Portail Radix** | Test navigateur sur un `DialogContent` réel (classes de `ui/dialog.tsx:41` compilées par Tailwind) portant `bt-skin dz-portail dz-feuille` : ordre Tailwind puis `dz-` → `left:0` mais `translate(-187px,-211px)` (feuille moitié hors écran, capture 08) ; ordre inverse → `border-radius:12px`, `padding:24px`, fond crème, `top:422px` (Tailwind gagne, capture 09). `.dz-feuille` ne fonctionne pas tant que `ui/dialog.tsx` ne laisse pas tomber `left-[50%] top-[50%] translate-* max-w-lg rounded-xl p-6 border bg-background`. Le voile : `bg-black/80` (`dialog.tsx:24`) et `.dz-voile` se disputent `background` selon l'ordre de chargement |
| **Focus** | `.dz-salarie :focus-visible` (0,2,0) est battue par `.dz-envoyer[data-etat="pret"]` et `.dz-bouton[data-ton="principal"]` (0,2,0, plus bas dans le fichier) qui posent leur propre `box-shadow` : **mesuré au clavier, aucun anneau sur « Envoyer ma journée » (prêt, envoi en cours) ni sur les boutons principaux des feuilles** (capture 06 ; capture 07 : anneau présent sur « Journée envoyée »). Sur fond noir l'anneau double est visible (crème 18,4:1) |
| Focus, suite | `outline:none` sans `outline: 2px solid transparent` : aucun indicateur en mode contraste forcé de Windows |
| `.bt-skin` injecté | `page.tsx:127-148` (même spécificité, placé après la feuille) écrase `--destructive`, `--ring`, `--muted-foreground` de `tokens.css` : à supprimer, comme annoncé par `integration-technique` §4 |
| `z-index` | 0 occurrence dans `salarie.css` : `.dz-barre`, `.dz-pastille`, `.dz-retour` sont `position: fixed` sans couche ; le contrat de couches (30 / 40 / 50 / 60 / 70 / 95 / 96) du README de la passe 2 a été retiré |
| Calendrier à 360 px | `.dz-calendrier__jour` : (360 − 40 − 24) / 7 = **42,3 px** de large, sous 44 |
| Carte Total à 360 px | balisage reconstitué avec leurs classes : carte 114 px, compteurs 91 px de haut (valeurs sur 2-3 lignes dans des tuiles de 79 px), soit 215 px (avec l'écart) sur 314 px visibles : à confirmer par un écran dessiné |
| Polices | `.dz-compteur__valeur` : JetBrains Mono à 900, graisse livrée 400 / 500 / 700 seulement ; glyphes ✦ ▣ ↺ ⧉ ● ✓ hors des sous-ensembles des polices (audit 03 R11) |

## G. Régressions de fonction

Le fichier livré n'ayant pas changé, **la suppression de la carte Total sur E06, E07, E12, E15, E19 et du message « Journée envoyée » d'E12 n'est pas dans la planche** : ces cinq écrans ont encore leurs tuiles et E12 porte encore `hasToast:true, toast « Journée envoyée »`. Si ces retraits sont réels dans le projet du designer, voici ce qui n'est plus montré nulle part :

| Fonction ou message du code | Où | État dans README / planche |
|---|---|---|
| `toast.success('Journée envoyée')` | `poseur-day.tsx:1741` | README E34 liste partiel / rien / échec, **pas le succès** ; seul le bouton « Journée envoyée ✓ » (E12) reste |
| Total du jour sur journée envoyée, hors-ligne, corrigée, transfert en échec | `bt-total` sur tous les états | à confirmer écran par écran |
| « Chantier retiré — la secrétaire est prévenue », « Impossible de retirer : chantier verrouillé par le bureau » | résultat du retrait | nulle part (README : E30 = confirmation seule) |
| « Aucun chantier hier à copier », « Rien à copier : … », « Copie indisponible hors-ligne », « Impossible de copier » | copie de journée | nulle part |
| « Journée chez le comptable : vois avec la secrétaire. », « Panier non pris en compte… » | panier verrouillé | nulle part |
| Erreurs de « OK » (« Indique l'heure de début et de fin », « Le début et la fin sont identiques. », chevauchement, « Choisis un chantier ») | éditeur | E38 annoncé, absent |
| « Ce chantier n'a pas changé : il est verrouillé par le bureau. » | éditeur | nulle part |
| Consigne borne de « Votre pointage est encore en cours » | E23 | annoncée « rétablie », absente de la fenêtre dessinée |
| `· payée` de la route, route masquée si 0, panier absent si l'entreprise n'en a pas | `bt-stats` | `Tuiles` ne les porte pas |
| Mini-frise : règle d'échelle (axe, nuit, « minuit » à sa vraie position) | README passe 2 | **section supprimée du README** ; seule la planche la contient en commentaire de script |
| Couches `z-index`, retours passagers à 170 px touchables 10 s | README passe 2 §1 | **supprimés** du README passe 3 |
| Composants `Rappels`, `AssistantPastille` ; `Toaster` (Sonner) dans les consignes Radix | README passe 2 §7 et §10 | absents du tableau §7 et de §10 (les classes `dz-rappel`, `dz-pastille`, `dz-retour` existent) |
| Intégration avec `.bt-skin` des fenêtres `AlertDialogContent`, `Popover`, `DropdownMenuContent` | README passe 2 §10 | seul le voile de `Dialog` est mentionné |

Messages cités dans le fichier 02 et introuvables ni dans le README ni dans la planche : 55 sur 137 (indicateur grossier : les variables `HH:MM` et les points de suspension faussent une part).

## H. Verdict et corrections

### H.1 À demander au designer (numérotées)

**Bloquant**

1. **Fournir la planche réellement à jour** (fichier ou lien du projet) : MD5 identique à celle de la passe 1 ; 35 écrans cités par le README absents ; 0 valeur de la passe 3 dans les maquettes. Tant que ce n'est pas fait, A, D, E ne se vérifient pas (§0.1-0.3).
2. Dessiner **S1 : la flèche « Retour à ma journée »** : aucun des 39 écrans n'en a une (E14, E15, E18, E25, E27 cités par README §6.2) ; le README la dit présente.
3. Dessiner **S104 complet** : 4 compteurs (chantiers, pauses, route, panier) ; la planche en montre 3, sans « chantiers » ni « route ».
4. Rendre **visibles sans défilement caché** les preuves de S4, S6, S7, S9, S31 (E04 et E05 : 5 blocs sous la barre ; à 360 × 640, 19 écrans) : les écrans E04b, E05a-c annoncés n'existent pas.
5. Reprendre E09 : 30 min présélectionnées + « Valider · pause 30 min » sont le comportement que le fichier 02 demandait de supprimer.

**Important**

6. Corriger le **focus** de `salarie.css` : `.dz-envoyer[data-etat="pret"]` et `.dz-bouton[data-ton="principal"]` écrasent l'anneau (mesuré). Composer l'ombre : `box-shadow: var(--dz-focus), inset 0 -4px 0 …` dans l'état `:focus-visible`.
7. Remettre le **contrat de couches `z-index`** (supprimé du README) et le poser dans `salarie.css` (`.dz-barre`, `.dz-pastille`, `.dz-retour`).
8. Reposer la **règle d'échelle de la mini-frise** dans le README (supprimée).
9. Dire **si l'en-tête se rétracte** (`hdrHidden` actuel) : le README le dit « fixe », mais ✦ y passe et ne doit pas disparaître au défilement.
10. Phrases de guides : donner les 5 nouvelles formulations pour `pointer` (« en haut »), `borne`, `planning` (« Ma semaine » / « Mon mois » → « Semaine » / « Mois »), `retirer-ligne` (« la corbeille ») et les 4 fiches de `worker-assistant-core.ts` (§C.2) ; dire si le bouton `QR` garde le mot « icône ».
11. Absences : trancher entre README §4.3 (45°, teintes du code) et `tokens.css` (135°, valeurs propres) ; mesurer les paires sous ΔE 10 avec les teintes du code (matin / intempérie 7,3 ; après-midi / congé 8,6 ; après-midi / repos 8,1).
12. Étendre `salarie.css` à ce qu'il annonce : Semaine (barres sur la carte), menu du compte, Mon équipe, assistant (bulles, historique), `/pointer`, squelette, messages d'état, toasts.
13. Corriger les cibles : « Ouvrir › » et « Relancer » à 21 px dans le dessin, cases de tâche 26 px, bouton « Journée envoyée » 42,2 px, ✦ de la pastille 36 px, jour du calendrier 42,3 px à 360 px.
14. README §7 : remettre `Rappels`, `AssistantPastille` et le retour passager ; ajouter `travelPaid`, la règle « route si > 0 » et l'état « sans panier » à `Tuiles`.
15. Reprendre les libellés qui divergent encore du code (D.3), notamment E10, E13, E17, E21, E24, P02.

**Mineur**

16. Vert plein sur le noir de la bande : 3,04:1 mesuré (le README annonce 3,51 : valeur sur `#15120F`, pas sur `#25201B`).
17. Bord « prévu » `#9C907E` 2,68:1 ; bords de champs `#D6CBB7` 1,58:1.
18. `outline: 2px solid transparent` pour le mode contraste forcé.
19. `--dz-squelette-clair` : commentaire faux ; `.dz-compteur__valeur` en 900 (graisse non livrée).
20. README §6.2 : écrire en toutes lettres les repères abrégés et ajouter `bt-lt-el`, `data-seen`, `data-cible`, `data-phase`, `{testId}-error`, `pointer-info`, `role=dialog`, les `aria-label` de formations.
21. Chantiers : `--dz-chantier-2` = vert « envoyé » (même valeur `#1F7A4D`) ; `#F5E5E0` et `#EAE6F5` à ΔE 9,0 / 9,4 du fond de réunion.

### H.2 Ce que l'intégrateur peut corriger seul

| Sujet | Action |
|---|---|
| Titre « Horaires prévus par le bureau » | Corriger `01-reperes-reels.md` §D (et `02` A3 : texte exact de la fenêtre) ; dire au designer que la passe 2 avait raison ; ne pas suivre README §6.1 sur ce point |
| `day-part.test.ts:95` | Remplacer `#DAEDFB` par la valeur retenue ; `DAY_PART_INK` `#5B534A` passe 4,5:1 sur les 4 teintes |
| `missions.test.ts` | Si les 7 chantiers sont adoptés : mettre à jour `CHANTIER_BARS` et ré-épingler les 2 valeurs (46,2 et 8,95) |
| `planning-lot3.mjs:320`, `#57524A` à la main | Suivre `DAY_PART_INK` ; mettre à jour les `rgb(...)` des 5 scripts navigateur |
| `ui/dialog.tsx` | Variante « feuille » qui retire les classes de centrage et de forme ; `className="dz-voile"` sur l'overlay avec un ordre de chargement maîtrisé |
| Focus et `z-index` | 3 lignes de CSS (correction 6 et 7) |
| `.bt-skin` de `page.tsx:127-148` | Supprimer, pour que `--destructive` `#C62828` et `--ring` s'appliquent |
| Import CSS | `app/poseur/layout.tsx` et `app/pointer/layout.tsx`, pas le layout racine |
| Requêtes | Élargir les 2 `select` de `fetchPending` (`total_minutes, start_time, end_time, break_minutes, submitted_at, locked, exported_at`) et remonter les 7 jours ; vérifier `requetes-lot29.mjs` = 18 |
| Guides | Réécrire les 5 phrases de `worker-tours.ts` (`:63`, `:80`, `:110`, `:145`) et 4 de `worker-assistant-core.ts` (`:475`, `:489`, `:505`, `:512`, `:514`) ; adapter `registre-surfaces.test.ts:393-396`, `guides-lot7.mjs:278,298,325-328,356` |
| Table des repères | Produire par grep la table exhaustive des 133 (README §6.2 abrégé) |
| Tests `scan-open`, `dock-assistant` | Rejouer les 11 scripts qui citent `dock-assistant` et les 2 qui citent `scan-open` après déplacement |

### H.3 Fichiers de mesure

Scripts et sorties : `scratchpad/a3/` (hors dépôt). Captures (`captures-passe3/`) : 01 E05 inchangé sans carte Total ; 02 E16 contrastes 2,26 ; 03 E12 vert / blanc et retour sur carte ; 04 E10 kicker 3/3 et texte ancien ; 05 E21 à 360 × 640 ; 06 et 07 focus au clavier (sans anneau / avec anneau) ; 08 et 09 `dz-feuille` sur un `DialogContent` réel.
