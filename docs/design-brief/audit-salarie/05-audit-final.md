# Audit 05 · Livraison finale du dossier écran salarié (2e tentative, passe 3)

Auditeur adverse, 15/10/2026. Rien n'a été modifié dans le dépôt hors ce fichier et `captures-final/` (10 PNG). Fichiers du designer copiés hors dépôt, ouverts seulement dans Chromium sans réseau (React du dépôt, polices de `public/fonts/`, 0 requête sortie). Mesures : `scratchpad/a4/` (scripts de `a3/` repris, `PLANCHE` repointée).

## 0. Verdict

**Intégrable : NON.** La planche est enfin à jour et bonne comme référence visuelle ; le reste du dossier n'a pas bougé.

| Constat | Mesure |
|---|---|
| **Seule la planche a changé** | `BEMEXO Salarié - Dossier.dc.html` : 114 067 o, MD5 `b0aa2b8b…` (ancienne `a2e9f1ec…`). `README.md`, `tokens.css`, `salarie.css`, `donnees-exemple.ts`, `support.js` : `cmp` identique octet pour octet à la livraison de 04 |
| Planche | **74 écrans** (E 56, P 8, AS 10) + bande des 8 états + mini-frise (4 cas) + boutons d'envoi (6 valeurs). Les 35 écrans absents en 04 existent tous |
| Contrastes de la planche | **0 nœud sous le seuil** sur 74 écrans (3 310 nœuds) à 370 × 824, 390 × 844 et 360 × 640 (04 : 20 écrans sur 39, pire cas 2,26:1). Reste 1 glyphe (▣ 2,81:1) |
| Les 21 corrections de 04 §H.1 | **5 corrigées, 2 partielles, 14 non corrigées** (§1). Les 14 sont celles qui touchent `salarie.css` / README / `tokens.css` |
| Tests couleur | `test:creneaux` 5/5 et `test:missions` 19/19 inchangés ; mêmes 2 réserves qu'en 04 (§3) |
| **Défauts d'intégration, mesurés au navigateur** | (a) `.dz-feuille` sur un vrai `DialogContent` : feuille décalée de 187 px, ou formes de Tailwind qui gagnent ; `dz-voile` ne peut pas être passé (§6) ; (b) pas d'anneau de focus sur « Envoyer ma journée » et les boutons principaux ; (c) **nouveau** : les règles `.bt-total`, `.bt-send`, `.bt-iv`, `.bt-lt`… de `poseur-day.tsx` écrasent les `dz-*` posées « à côté » : la carte Total reste noire ou devient crème sur crème (§6.3) |
| Libellés contraires au code actuel | E08 (deux phrases du corps supprimées), E10, E13, E21, E24, E36, P02 (« Ouvrir mon espace » supprimé) (§4.2) |

## 1. État des 21 corrections de 04 §H.1

| # | Gravité 04 | État | Mesure ou citation |
|---|---|---|---|
| 1 | Bloquant | **Corrigée** | Planche 114 067 o, 74 écrans ; 75 identifiants cités par le README dont 74 existent (le 75e, « E30 », est un préfixe : `confirmer.retirer` « Oui, retirer (E30) », la planche a E30a-c). README §0 dit « 30 écrans ajoutés » : 35 réels (74 − 39) |
| 2 | Bloquant | **Corrigée** | Bouton `‹` d'aria-label « Retour à ma journée » dessiné sur E14, E15, E18, E25, E27 (44 × 44, aucune cible < 44) |
| 3 | Bloquant | **Corrigée** | CHANTIERS · PAUSES · ROUTE · PANIER sur E03-E05, E08-E10, E13-E17b, E20a-E24… (capture 01). Réserves : règles du code non portées (§7, G4) |
| 4 | Bloquant | **Corrigée** | S4, S9 sur E04b ; S31 sur E05b ; S6, S7, S8, S34 sur E05c : preuves visibles, `underBar` < 0,1, `vis` ≥ 0,9 (`preuves2.mjs`). E05 garde 8 blocs sous la barre, E04 1 : voulu, la suite est dans les défilés |
| 5 | Bloquant | **Corrigée** | E09 : aucune puce présélectionnée, pas de « Valider · pause 30 min », indice « Pendant cette plage. Plusieurs pauses ? Additionne-les. » = `poseur-day.tsx:2898` |
| 6 | Important | **Non corrigée** | `salarie.css` identique. Vrai `DialogContent` Radix : `#ok` (`dz-bouton principal`) `box-shadow: rgb(217,162,0) 0 -3px 0 0 inset` seul, aucun anneau ; `.dz-envoyer[data-etat=pret]` idem (`-4px inset`) ; capture 08 |
| 7 | Important | **Non corrigée** | `grep -c z-index` : 0 dans `salarie.css`, 0 dans `tokens.css`, 0 dans le README |
| 8 | Important | **Non corrigée** | README : 0 occurrence de « échelle » ; la planche a le bloc « MINI-FRISE · RÈGLE D'ÉCHELLE » mais le README n'en dit rien |
| 9 | Important | **Non corrigée** | README muet ; `salarie.css:15` « En-tête (fixe…) » ; code : `header.bt-phdr.is-hidden` (`page.tsx:223, :551`) : ✦ disparaît au défilement |
| 10 | Important | **Non corrigée** | README : « Les phrases des guides concernés sont à mettre à jour, sans le mot onglet », aucune formulation. De plus la planche écrit « Variante des **onglets** Semaine, Mois… » **dans** l'écran E02 (mot interdit par `worker-tours.test.ts`) |
| 11 | Important | **Non corrigée** | README §4.3 « angle (45°) et teintes du bureau » ; `tokens.css` garde ses valeurs à 135° (fichier identique) |
| 12 | Important | **Non corrigée** | `salarie.css` : 90 classes `dz-*`, aucune pour Semaine, menu du compte, Mon équipe, assistant, `/pointer`, squelette, toasts (grep) |
| 13 | Important | **Partielle** | Corrigé : bouton « Journée envoyée » (42,2 → 56 px). Restent (370 × 824) : « Ouvrir › » 58 × 21 (E05, E05a-c, AS7), « Relancer » 72 × 21 (E19), 7 cases 26 × 26 (E05, E05c, E06), ✦ 36 × 36 (AS7), jours d'E24 43,7 × 52 (42,3 à 360) |
| 14 | Important | **Non corrigée** | README §7 identique : 0 `Rappels`, 0 `AssistantPastille`, 0 `travelPaid` |
| 15 | Important | **Partielle** | Voir §4.2 : corrigés E09, E11, E14, E16, E17, `aria-label` de la barre, E28, bouton d'E08 ; non corrigés corps d'E08, E10 (phrase), E13, E21, E24 ; P02 aggravé |
| 16 | Mineur | **Non corrigée** | Vert `#1F7A4D` sur `#25201B` : 3,04:1 (puce ✓ de la bande, mesurée dans la planche) ; README dit encore 3,51 |
| 17 | Mineur | **Non corrigée** | CSS identique : `#9C907E` (bord « prévu ») 2,68:1, `#D6CBB7` 1,58:1 ; toujours dans la planche (4 et 24 occurrences) |
| 18 | Mineur | **Non corrigée** | `salarie.css:8` : `outline: none`, pas de `transparent` |
| 19 | Mineur | **Non corrigée** | `tokens.css:45` commentaire « → 5,5:1 » sur un fond de squelette ; `.dz-compteur__valeur` en 900 |
| 20 | Mineur | **Non corrigée** | README §6.2 identique (§5.1) |
| 21 | Mineur | **Non corrigée** | `tokens.css` identique : `--dz-chantier-2 #1F7A4D` ; `#F5E5E0` / `#EAE6F5` à ΔE 9,0 / 9,4 du fond de réunion |

## 2. Mesure A · contrastes, cibles, débordements (planche livrée)

Méthode 04 : contraste WCAG 2.x sur pixels composés (fond remonté jusqu'à la racine, opacités de groupe), seuils 4,5:1 / 3:1 (≥ 24 px, ou ≥ 18,66 px gras). Écrans à fenêtre : le texte sous le voile n'est pas compté.

| Mesure | 370 × 824 (dessiné) | 390 × 844 | 360 × 640 |
|---|---|---|---|
| Nœuds de texte visibles | 3 310 | idem | idem |
| Contraste sous le seuil | **0** | **0** | **0** |
| Texte < 12 px | 0 | 0 | 0 |
| Cibles < 44 px (formes) | 21 | 14 | 21 |
| Recouvrement d'encre | 0 | 0 | 0 |
| Rectangles de ligne qui se touchent | 26 (carte Total, interligne .9) | idem | idem |
| Feuilles dont le pied (OK, boutons) sort de l'écran | 0 | 0 | 0 |
| Hauteur de contenu visible E05 | 443 px | 463 | **259** (en-tête 226 + barre 155) |

Détail :
- **Contraste, reste** : ▣ `#15120F` sur `#655B50` = **2,81:1** (état « clôturé » de la bande des 8 états ; E16/E16b sous voile). Boutons d'envoi (6 valeurs) : minimum 4,71:1. Avant : 121 nœuds sur 20 écrans.
- **Cibles** (listées au #13). À 390 × 844 les jours d'E24 passent (≥ 44).
- **Rectangles de ligne** : « TOTAL AUJOURD'HUI » / « 6:42 » / « 2 chantiers · semaine… » se touchent par boîte de ligne (grand chiffre en interligne .9), sans recouvrement d'encre visible (captures 01, 02, 03). Faux positif du harnais, signalé pour ne pas être recompté.
- **Compteurs à 360** : le libellé « CHANTIERS » dépasse le remplissage de la tuile de **11 px** (3 px à 370) et « 1 à préciser » de 2 px : le mot touche le bord de la tuile sans être coupé (capture 02).
- **E38 / E39** : « Retirer ce chantier » et « Documents » sont dans le corps de la feuille, rogné par le pied fixe (défilement voulu). À 360 × 640, E21 : OK visible dans le pied (vérifié), Documents / Retirer à faire défiler.
- **Contenu sous la barre** : E05 8 blocs (370), 7 (390), 9 (360 × 640) ; E04 1 ; à 360 × 640 17 preuves S sur 81 sortent du cadre (liste §6.2) : les écrans ne sont dessinés qu'à 370 × 824 (sauf E21b).
- **Bande des 8 états, mini-frise, boutons d'envoi** : texte ≥ 12 px ; contraste : seul ▣ ; 4 frises à 0.

## 3. Mesure B · tests du dépôt avec les valeurs de `tokens.css`

Copie hors dépôt de `supabase/functions/_shared`, `supabase/migrations`, `lib/time-input.ts` ; `npx -y deno@2 test …`.

| Essai | `test:creneaux` | `test:missions` |
|---|---|---|
| 0. Dépôt tel quel | 5 / 5 | 19 / 19 |
| 1. `tokens.css` : `DAY_PART_INK #5B534A`, matin `#DDEBFA`, après-midi `#FCE3CF`, soir `#EAD6F4` + traits, réunion `#FFE2EC` / `#B7366A` | **4 / 5** (`day-part.test.ts:95` épingle `#DAEDFB`) | 19 / 19 |
| 2. Idem + ligne 95 à `#DDEBFA` | 5 / 5 | 19 / 19 |
| 3. Idem + 7 barres et 7 fonds d'étiquette de chantier du designer | 5 / 5 | **18 / 19** : « bordure / barre la plus proche : ΔE 46,2 » (épinglé 8-12) ; le second épinglé donnerait 8,95 (épinglé 4-6) |

- Rouge `#C62828` : 0 occurrence de `E53935`, `C62828`, `DF3331`, `14 72%` dans `scripts/tests`, `lib`, `supabase/functions/_shared` (grep) : **ne casse rien**. Mais `app/poseur/page.tsx:143` et `app/admin/page.tsx:40` posent `--destructive:14 72% 44%` dans `.bt-skin` (même spécificité que `tokens.css`, chargé après) : à supprimer côté `/poseur` ; `/admin` garde le sien (ne pas charger `tokens.css` globalement).
- Blanc sur `#C62828` : 5,62:1.
- Fonds d'étiquette `#F5E5E0` (chantier 3) et `#EAE6F5` (chantier 4) : ΔE 9,0 et 9,4 du fond de réunion, sous les 10 que le dépôt exige pour les teintes de fond (non testé pour les étiquettes).

## 4. Mesure D · gardes et libellés

### 4.1 Ordre des 7 contrôles d'envoi (`components/poseur-day.tsx`, `handleSubmitDay` `:1583`)

| # README | Code | Écran planche | Conforme |
|---|---|---|---|
| 1 Sortie oubliée sans fin | `:1586-1587` toast `EXIT_TO_COMPLETE_MSG` (`lib/qr-entry.ts:25`) puis ouvre la ligne | E31 : texte identique, dessiné en toast | oui |
| 2 Chevauchement | `:1591` `overlapBlocks()` (toast ; les deux prévus : après « Oui », `:1612`, donc rang 3) | E11 : texte identique | oui, nuance de rang |
| 3 Horaires prévus | `:1593` `setPlannedAsk(true)` | E08 | ordre oui, **libellés non** (§4.2) |
| 4 Pause, une plage à la fois | `:1594` → `askNextPause :1617` | E09, E09b | oui |
| 5 Journée vide | `continueSubmit :1657-1662` toast « Ajoute un chantier » | E32 | oui |
| 6 Plus de 10 h strict | `:1559` `totalMins > 600` | E10 | ordre oui, libellé partiel |
| 7 Envoi | `doSubmit :1688` ; issues `:1735-1741` ; hors-ligne `:1698-1717` | E33, E34, E35 | oui |

### 4.2 Libellés de la planche contre le code

| Écran | Code actuel | Planche livrée | État |
|---|---|---|---|
| E08 titre | « Horaires prévus par le bureau » (`:2858`) | « Le bureau avait prévu… » (le README §6.1 le demande : erreur de notre fichier 01, à ne pas suivre) | écart |
| E08 corps | « Tu n'as pas noté d'heures pour : » + liste + « Tu as travaillé exactement ces horaires ? » (`:2862-2868`) | **les deux phrases supprimées** : seule la ligne « Villa Exemple 13:30 → 17:00 · 3:30 » (capture 04) | **écart** |
| E08 boutons | « Oui, envoyer ces horaires », « Non, je corrige mes heures », « Envoyer seulement mes heures notées » | identiques | corrigé |
| E09 | « Tu as pris une pause ? », « 07:30–15:00 : 7:30 d'affilée, sans pause notée. », rien de présélectionné | « De 07:30 à 15:00 : 7:30 d'affilée. » (sans « sans pause notée »), libellé « Durée » inventé | quasi |
| E10 | « Total : 10:45 (dépasse 10h). Vérifie tes horaires. » + « Envoyer quand même ta journée ? » ; Corriger / Confirmer l'envoi | 1re phrase et boutons conformes ; **« Envoyer quand même ta journée ? » absente** | écart |
| Kickers | aucun dans le code | « AVANT L'ENVOI », « … · PLAGE 1 SUR 2 » (un compteur de retour) ; E13 « MODIFIER » | ajout non demandé |
| E13 | « Cette journée a déjà été envoyée. Si tu y touches, la secrétaire en sera informée. » | « Si tu continues, la secrétaire sera prévenue de ta correction. » | **écart** |
| E16 / E16b | fenêtre « Mois clôturé » / « Heures clôturées » + « Compris » | idem (phrase raccourcie par « … ») | corrigé |
| E17 | « Tu as fini à quelle heure ? » + « Terminer ma journée » | idem | corrigé |
| E21 | titre `slotTitle` : « Chantier {nom} » / « Nouveau chantier » (`:2053`) | « Modifier l'intervention » ; E22 « NOUVELLE INTERVENTION » ; AS7 « Nouvelle intervention » | **écart** |
| E24 | « Dupliquer cette journée » ; « Choisis les jours où copier cette journée (mêmes chantiers + heures). » ; calendrier de mois ; « Copier (N) » | « Sur quels jours ? » ; 7 puces de dates (ven. 16 → jeu. 22) ; « Copier (1) » | **écart** (impossible de viser au-delà de 7 jours) |
| E36 | « Votre journée compte 6:42. Une fois envoyée, la modifier prévient la secrétaire. » (`:3020`) | « Total de la journée : 8:45. » | écart |
| P02 | `kx-btn` « Ouvrir mon espace » + « Envoyer ma journée » + « Ajouter une intervention » (`app/pointer/page.tsx:302-316`) | **2 boutons, « Ouvrir mon espace » supprimé** (capture 05) | **fonction perdue** |
| P03c | « Rien à enregistrer » (`:325`) / « rien n'est enregistré » (`:286`) | titre « Pointage annulé » | écart |
| E11, E14 | étiquette « À ENVOYER » | idem | corrigé |
| Barre du bas | `aria-label` « Scanner la borne », « Ajouter un chantier » | idem (runtime) | corrigé |
| E28 | pas de bouton | pas de bouton | corrigé |

## 5. Mesure C · repères

### 5.1 133 repères (fichier 01) contre README §6.2 et planche

| Constat | Détail |
|---|---|
| Planche | 0 `data-testid`, 0 `data-guide`, 0 classe (tout en style en ligne ; 0 `var(--…)`, 2 mots `dz-`). Au rendu : 29 `aria-label` distincts. Sur les 15 `aria-label` fixes de 01 §E, 7 présents (Mon compte et menu, Scanner la borne, Retour à ma journée, Journées à envoyer, Ajouter un chantier, Assistant BEMEXO, Réserves à lever) ; « Panier repas » (tuile sans label), « Informations » (pas de fenêtre), formations, tâches : absents. Présence « à l'identique » invérifiable |
| README (identique à 04) | 219 atomes relevés : 178 en toutes lettres, **32 abrégés** (`planned-confirm-*`, `live-clash-*`, jokers `history-*`, `trainings-*`, `training-*`, `guide-*`, `conges.*`), 9 non couverts |
| Absents du README | `bt-lt-el`, `data-seen`, `data-cible`, `data-phase`, `{testId}-error`, `pointer-info`, `role=dialog` (Informations, guide), `{N} formation(s) à voir`, `{titre} : vue / pas encore vue` |
| Renommés | aucun (`data-*`, ids, classes) ; `.bt-ed-trash` devient un bouton à texte (attributs gardés) |
| Collisions | 0 `dz-` dans `app`, `components`, `lib`, `public` ; `salarie.css` ne définit aucune `bt-*` (7 mentions en commentaires) ; `.dz-sombre` cité par le README est défini seulement dans `tokens.css:149` |

### 5.2 Les 7 cibles de guide qui changent de place : ce que ça casse (lignes actuelles)

`guide-tour.tsx` mesure `[data-guide]` : un déplacement ne le casse pas si la cible reste un `<button>` visible, non recouvert.

| Cible | Code actuel | Ce qui casse |
|---|---|---|
| `entete.scanner` (→ barre du bas, `QR`) | `app/poseur/page.tsx:566` | `worker-tours.ts:63` « l'icône du scanner, **en haut** », `:145` ; `worker-assistant-core.ts:510` « Icône scanner en haut de l'écran. » ; `guides-lot7.mjs:325-328` ; `registre/surfaces-salarie.ts:25` ; `scan-open` : `qr-fixe-lot12.mjs` ×3, `salarie-lot12.mjs` ×1 |
| `journee.assistant` (→ en-tête, ✦) | `poseur-day.tsx:2588` | `onAssistant` à remonter dans `page.tsx` ; `page.tsx:694` `returnFocus` marche ; **en-tête rétractable** (`:551`) ; `worker-assistant-core.ts:517, :519` « Bouton ✨ de la barre du bas. » ; `guides-lot7.mjs:278,298` ; `dock-assistant` lu par **10 scripts** (nouveau : `ouvrir-ecrans.mjs` ×2) |
| `menu.journee` / `.semaine` / `.mois` (→ boutons de la barre) | `page.tsx:66` (`MENU_GUIDE`, a aussi `menu.historique`), `:616` | `registre-surfaces.test.ts:394` épingle **129 ancres / 163 occurrences** et 5 expressions dont `app/poseur/page.tsx` ; guide `menu` ouvre le menu qui recouvre la barre ; `worker-tours.ts:80` « Touchez « Ma semaine » (ou « Mon mois ») » ; `worker-assistant-core.ts:480` ; 7 scripts citent « Ma semaine » ou « Mon mois » |
| `editeur.documents` | `poseur-day.tsx:2740` | rien d'obligatoire |
| `editeur.retirer` (corbeille → bouton texte) | `poseur-day.tsx:2745` | `worker-tours.ts:110` « touchez la corbeille » ; `worker-assistant-core.ts:495` ; `bt-ed-trash` / `bt-ed-doc` : 4 scripts |

## 6. Mesures E et F

### 6.1 Couverture S1-S104

README §3 : **81 dessinés, 12 partiels, 10 non dessinés, 1 comportement = 104** : recompté ligne à ligne, exact. Les 81 écrans-preuve cités existent tous dans la planche (04 : 42 sur 81).

| Preuve visible sans défilement caché (370 × 824, 81 « dessinés ») | Nombre |
|---|---|
| Preuve complète | **78** |
| Marquées par le script | 3 : S37 (E16 : sous voile ; visible sur E27, E29, E12 : **faux positif**), S90, S100 |
| Défaut réel | **S100** : P02 sans « Ouvrir mon espace » ; **S90** : AS1 sans le mot « collègues » (AS10 oui) |
| Preuve présente mais contraire au code | S34 (E24 : 7 puces au lieu du calendrier), S40 (E08), S42 (E10), S44 (E13), S48 / S97 (E36), S98 (P03c) |

6.2 À 360 × 640 (non dessiné) : 17 sur 81 sortent du cadre : S4, S5, S8, S9, S16, S33, S34, S36, S54, S76, S89 (défilement du corps), S22, S24, S25 (corps de feuille), S37, S90, S100.

### 6.3 Faisabilité d'intégration (F)

| Point | Mesure |
|---|---|
| Poids du CSS | `tokens.css` 9 094 o (3,78 ko gzip) + `salarie.css` 22 301 o (4,71 ko gzip) = 31 395 o, **8 162 o gzip** ; CSS global actuel 62 031 o. Hors budget JS (`check-bundle-budget.mjs` ne lit que le JS) ; à importer dans `app/poseur/layout.tsx` et `app/pointer/layout.tsx` |
| Requêtes | `fetchPending` (`page.tsx:225-241`) : `planning (work_date, absence_type)` et `time_entries (work_date, status)` : ni minutes ni heures. Les barres des 7 jours demandent `total_minutes`, `start_time`, `end_time`, `break_minutes` : colonnes à ajouter aux 2 `select` existants, 0 nouvelle requête (`requetes-lot29.mjs` = 18) ; les 7 jours doivent être remontés du parent |
| Collisions `dz-` / `bt-` | 0 collision de nom (90 classes `dz-*`) |
| **`.bt-*` contre `.dz-*` (nouveau)** | Le README §7 pose `dz-*` « à côté » des `bt-*` ; les `bt-*` vivent dans les `<style>` de `poseur-day.tsx` (`DAY_CSS :203`), `page.tsx` (`POSEUR_CSS :68`), `live-timer.tsx` (`LT_CSS :65`), rendus dans le corps, donc **après** le fichier importé, à spécificité égale. Élément portant `bt-X dz-Y`, CSS réel du dépôt : `bt-total` + `dz-total` : 7 propriétés écrasées (fond `#15120F` au lieu de `#FFFDF8`, rayon 20, remplissage 20, `overflow:hidden`) ; `bt-send` + `dz-envoyer` 7 ; `bt-iv` + `dz-carte` 5 ; `bt-lt` + `dz-pointage` 4 ; `bt-stat` + `dz-compteur` 4 ; `bt-gap` + `dz-trou` 3 ; `bt-phdr` + `dz-entete` 3 ; `bt-sec` 7 ; `bt-phdr-back` 4 ; `bt-site` 4 ; `bt-stats` 1. Capture 10 : ordre réel → carte noire, barres noires invisibles ; ordre inverse → fond crème mais `color:#F2EDE3` de `.bt-total` reste : chiffre crème sur crème |
| **Portail Radix (vrai `DialogContent` de `ui/dialog.tsx`, React + Radix du dépôt, Tailwind compilé avec `app/globals.css`)** | `className="bt-skin dz-portail dz-feuille"`. Feuille Tailwind d'abord : `left:0`, `top:422px`, `transform: translate(-187px,-211px)`, `border:4px`, `padding:24px` → rectangle **[-187, 211, 374, 422]**, moitié hors écran (capture 06). `dz-` d'abord : Tailwind gagne : rayon 12, fond `#F2EDE3`, `left:195px`, `display:grid`, rectangle [8, 211] (capture 07). Le `✕` de Radix (16 px, `absolute right-4 top-4`) s'ajoute au `✕` de 44 px de `dz-feuille__fermer` : **deux boutons de fermeture** |
| `dz-voile` | `ui/dialog.tsx:24` : `<DialogOverlay />` rendu sans propriété par `DialogContent` ; **le README §10 (« passer className="dz-voile" à l'Overlay ») est irréalisable** sans modifier `dialog.tsx` ; voile mesuré `rgba(0,0,0,.8)` (Tailwind) |
| Focus (navigateur, clavier) | `.dz-envoyer[data-etat=pret]` et `.dz-bouton[data-ton=principal]` : pas d'anneau (§1 #6). Autres boutons : `0 0 0 2px #FFFDF8, 0 0 0 4px #15120F`. **Sur le noir `#15120F`** (✦, avatar) : l'anneau crème intérieur est visible (18,4:1), l'extérieur encre disparaît (capture 09) ; sur « Envoyer » aucun (capture 08) |
| Mode contraste forcé | `outline:none` sans contour transparent |
| `z-index` | 0 ; `.dz-barre`, `.dz-pastille`, `.dz-retour` en `position:fixed` ; Radix : voile et contenu à 50 |
| Classes manquantes | voir #12 ; la géométrie du CSS et celle de la planche concordent pour la carte Total (rayon 18, remplissage 12/14, chiffre 44 px, tuile 14 / 8 9) |

## 7. Mesure G · régressions de fonction (code actuel → planche)

| # | Ce que fait `/poseur` ou `/pointer` aujourd'hui | Dans la planche | État |
|---|---|---|---|
| G1 | P02 : lien « Ouvrir mon espace » après un départ (`pointer/page.tsx:302`) | supprimé | **perdu** |
| G2 | E08 : « Tu n'as pas noté d'heures pour : » et « Tu as travaillé exactement ces horaires ? » | supprimés | **perdu** |
| G3 | E10 : « Envoyer quand même ta journée ? » | supprimée | perdu |
| G4 | Compteurs : route **masquée si 0**, « route · payée », panier absent si `meal === false`, `aria-label` « Panier repas » + `aria-pressed`, `title` « Journée chez le comptable… » (`poseur-day.tsx:2205-2236`) | ROUTE toujours affichée (« 0:00 »), ni « payée », ni variante sans panier, pas d'`aria-label` | écart |
| G5 | Total : unité « travaillées » (`:2186`) | « h » | écart mineur |
| G6 | Duplication : calendrier de mois, jours futurs seulement (`:2815`) | 7 puces | écart |
| G7 | Retour passager `toast.success('Journée envoyée')` (`:1741`), « N chantier(s) envoyé(s) » (`:895`) | texte dans les notes, jamais dessiné (la planche d'E12 n'a plus de toast) | non montré |
| G8 | Copie : « Aucun chantier hier à copier », « Rien à copier : … », « Copie indisponible hors-ligne », « Copié sur N jour(s) » | notes seulement | non montré |
| G9 | `toast.success('Chantier retiré — la secrétaire est prévenue')` (`:1456`) | note d'E30a | non montré |
| G10 | Rappels, `AssistantPastille`, retour passager à 170 px, contrat de couches (README passe 2) | absents du README et du CSS | perdus (corr. 7, 14) |
| G11 | 56 messages `toast.*` du code ; 36 introuvables dans README ou planche (indicateur grossier : apostrophes et HTML en faussent une part) | | à compléter |

Reprises correctes : consigne borne d'E23 (« ne scannez plus en partant ») rétablie ; erreurs de « OK » d'E38 ; E28 sans « Se déconnecter » ; AS4-AS6 en place Non / Oui.

## 8. Nombre d'écrans

| Source | Nombre |
|---|---|
| Planche livrée | **74** écrans numérotés : E01-E40 et E42 avec variantes (E 56), P00-P04 avec variantes (8), AS1-AS10 (10) ; plus 3 blocs (bande des 8 états, mini-frise 4 cas, boutons d'envoi 6 valeurs). E41 n'existe pas |
| README | 74 identifiants + « E30 » (préfixe) |
| README §0 « 30 écrans ajoutés, 20 redessinés » | 35 ajoutés (74 − 39) |
| Planche passe 3 de 04 | 39 |

## 9. Corrections restantes

### Bloquant

1. **Anneau de focus** absent sur « Envoyer ma journée » et les boutons principaux (`salarie.css`, 3 lignes) : mesuré avec un vrai `DialogContent`, capture 08.
2. **`.bt-*` écrase `.dz-*`** : carte Total noire (ou crème sur crème), `bt-send`, `bt-iv`, `bt-lt` (§6.3). Le README doit dire quelles règles `bt-*` sont retirées de `DAY_CSS` / `POSEUR_CSS` / `LT_CSS`, ou la feuille doit viser `.dz-salarie .dz-total`.
3. **`.dz-feuille` inutilisable** sur `ui/dialog.tsx` tel quel (rectangle [-187, 211]) et `dz-voile` irréalisable ; deux `✕`.
4. **P02 : « Ouvrir mon espace » supprimé** (fonction), E08 : deux phrases du corps supprimées, E10 : « Envoyer quand même ta journée ? » supprimée.
5. **README non remis à jour** : il décrit déjà la planche mais garde les erreurs de 04 (E08 « Le bureau avait prévu… » à tort, `§4.1` « 3,51 », `§7`, `§6.2`).

### Important

6. Libellés E13, E21, E24 (7 jours seulement), E36, P03c (§4.2).
7. Compteurs : route masquée si 0, « · payée », variante sans panier, `aria-label` (G4).
8. Contrat `z-index` (0 dans `salarie.css`).
9. En-tête rétractable : dire si ✦ reste visible.
10. 5 phrases de guides (`worker-tours.ts:63,80,110,145` ; `worker-assistant-core.ts:480,495,510,517,519`) et mot « onglets » dans E02.
11. Absences : 45° ou 135°, ΔE sous 10 (matin / intempérie 7,3 ; après-midi / congé 8,6 ; après-midi / repos 8,1).
12. Classes manquantes (Semaine, menu, équipe, assistant, `/pointer`, squelette, toasts).
13. Cibles : « Ouvrir › » et « Relancer » 21 px, 7 cases 26 px, ✦ 36 px, jours d'E24 43,7 / 42,3 px.
14. README §7 : `Rappels`, `AssistantPastille`, `travelPaid`.
15. S100, S90 (§6.1).

### Mineur

16. ▣ 2,81:1 ; vert sur noir de la bande 3,04:1 (README 3,51) ; bord « prévu » 2,68:1 ; champs 1,58:1.
17. `outline` transparent ; commentaire `--dz-squelette-clair` ; graisse 900.
18. README §6.2 : 32 repères abrégés + 9 manquants ; `aria-label` « Panier repas » absent de la planche.
19. Kickers « AVANT L'ENVOI » / « PLAGE 1 SUR 2 » : ajoutés alors que le code n'en a pas.
20. `--dz-chantier-2` = vert « envoyé » ; étiquettes à ΔE 9,0 / 9,4.
21. Compteurs à 360 : « CHANTIERS » dépasse de 11 px ; E21 / AS1… à 360 × 640 : 259 px de contenu visible.

### Ce que l'intégrateur peut corriger seul

| Sujet | Action |
|---|---|
| Focus | `.dz-envoyer[data-etat=pret]:focus-visible { box-shadow: var(--dz-focus), inset 0 -4px 0 … }` idem `.dz-bouton[data-ton=principal]` ; `outline: 2px solid transparent` |
| `z-index` | couches posées dans `salarie.css` |
| `.bt-*` contre `.dz-*` | retirer ou borner les règles `bt-*` visuelles de `DAY_CSS`, `POSEUR_CSS`, `LT_CSS` pour les classes appariées |
| `ui/dialog.tsx` | variante « feuille » sans classes de centrage et de forme, `overlayClassName`, un seul `✕` |
| `.bt-skin` de `page.tsx:127-148` | supprimer pour que `--destructive #C62828` et `--ring` s'appliquent |
| Tests | `day-part.test.ts:95` ; `missions.test.ts` (`CHANTIER_BARS`, 46,2 et 8,95) ; `planning-lot3.mjs:320` et `#57524A` écrits à la main |
| Libellés | rétablir les phrases d'E08 (titre « Horaires prévus par le bureau »), E10, E13, E21, E24, E36, P02 à partir du code |
| Guides | 9 phrases ; `registre-surfaces.test.ts:394` ; 11 scripts (`dock-assistant` 10, `scan-open` 2) |
| Requêtes | élargir les 2 `select` de `fetchPending` ; import CSS dans les deux layouts |
| Repères | table exhaustive des 133 par grep |

## 10. Ce qui change de visuel

**La carte Total passe d'une carte noire de 52 px à une carte crème à grand chiffre de 44 px avec les barres des 7 jours, suivie de 4 tuiles-compteurs séparées (chantiers, pauses, route, panier) au lieu des compteurs en ligne dans la carte ; la Semaine ouvre sur la même carte (31:30 et barres) puis 7 lignes au lieu de la grille.**

Captures (`captures-final/`) : 01 E05 Total et compteurs ; 02 E05a à 360 × 640 ; 03 E25 Semaine ; 04 E08 corps supprimé ; 05 P02 sans « Ouvrir mon espace » ; 06 et 07 feuille sur un vrai `DialogContent` (deux ordres de chargement) ; 08 focus sur « Envoyer » (aucun anneau) ; 09 focus sur noir (anneau crème) ; 10 conflit `.bt-total` / `.dz-total`.
