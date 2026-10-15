# Audit 02 · Jetons et mesures réelles (dossier écran salarié)

Auditeur adverse, mission « jetons et mesures réelles ». Date : 2026-10-15.
Objet : `tokens.css` et la planche `BEMEXO Salarié - Dossier.dc.html` (39 écrans E01-E28, P01-P03, AS1-AS8, plus la bande des 8 états et les 4 cas de la mini-frise) contre `docs/design-brief/integration-technique.md` (§2.4, §3.5, §2.7, §2.8) et contre les contrôles de couleur du dépôt (`npm run test:creneaux`, `npm run test:missions`).
Rien n'a été modifié dans le dépôt, hors ce fichier et le dossier `captures/`. Les fichiers du designer ont été copiés dans le dossier temporaire de la session et ouverts seulement dans un navigateur sans réseau.
La couverture S1-S104 est traitée dans `01-couverture.md` ; ce fichier n'en reprend que ce qui se mesure (par exemple E05 et E04, §4.5).

## 0. Méthode, et ce que les mesures ne couvrent pas

- **Rendu.** Chromium 1194 (Playwright), viewport 1 800 × 1 300, aucune requête externe (0 tentative refusée). React et ReactDOM 18.2 viennent du dépôt (la planche en demande la 18.3.1 sur unpkg avec contrôle d'intégrité, impossible hors réseau). Polices Archivo et JetBrains Mono servies depuis `public/fonts/` : ce sont les fichiers de production, donc les largeurs de texte mesurées sont celles de l'application. Une seule erreur console, bénigne : `support.js` tente de relire son propre fichier en `file://`.
- **Texte et contraste.** Chaque nœud de texte visible est mesuré (`getComputedStyle`, `Range.getClientRects`). Contraste WCAG 2.x calculé sur les pixels réellement composés : fond remonté jusqu'à la racine, opacités de groupe comprises (c'est ce qui compte pour les états « atténués »). Fond en dégradé (rayures d'absence, squelette) : pire des couleurs. Seuil 4,5:1 (3:1 pour le texte large, 24 px ou 18,66 px en gras). 1 489 nœuds de texte mesurés sur les 39 écrans, plus 40 sur la bande des états et 30 sur les 4 frises.
- **Cibles tactiles.** La planche n'a presque aucun `<button>` : les boutons sont des `<span>`. Les cibles sont donc repérées par leur forme (47 `<button>`, 84 contrôles à `aria-label`, 450 formes arrondies, 61 tuiles, 3 « CTA nus », 4 cases) : 649 candidats. La surface réellement cliquable, elle, n'est pas dessinée.
- **Géométrie.** Le cadre « 390 × 844 » de la planche contient un liseré de 10 px : l'écran dessiné fait **370 × 824**. Les écrans ont été mesurés ainsi (c'est le dessin livré), puis re-mesurés à 390 × 844, 360 × 780 et 360 × 640 (cible de `integration-technique` §2.8, jamais dessinée).
- **Ce qui n'est pas mesurable.** La planche est statique, tout en style en ligne : 0 `var(--…)`, 0 classe `dz-`. Aucun état survol, focus, appui ou désactivé. Aucun composant TSX n'est livré (5 fichiers : README, tokens.css, données, planche, support.js) alors que `integration-technique` §2.1-2.3 attend des composants `components/design/…`. Les classes `dz-…` et les ancres `data-*` ne peuvent donc pas être vérifiées.

## 1. Verdict

1. **Deux contrôles de couleur du dépôt échouent avec les valeurs du dossier** : matin / soir (ΔE 11,22 pour 15 exigé) et bordure de réunion (3,40:1 pour 4,5 exigé). Le designer a bien retouché les teintes, mais pas assez pour les tests : `test:creneaux` passe de 5/5 à 4/5, `test:missions` de 19/19 à 17/19. Remplacements proposés et vérifiés au §3.5.
2. **La portée des jetons ne couvre pas les fenêtres Radix.** Le sélecteur `.dz-salarie .bt-skin` ne peut pas atteindre un contenu rendu dans `<body>`. Mesuré : un contenu `.bt-skin` seul n'a aucun `--dz-*` (§2.2).
3. **Les jetons ne sont pas utilisés par les maquettes** (0 `var(--…)`) et ne sont pas tous d'accord avec elles : 13 couleurs d'écran absentes du fichier, 12 tailles de police hors échelle, `--dz-fs-xs: 10.5px` qui contredit la règle des 12 px.
4. **Manquent les teintes de chantier** (`CHANTIER_PALETTES`, 7 entrées), l'encre secondaire (`DAY_PART_INK`), la teinte « repos » des absences et la case verte `#EEF9F2` ; le dossier réutilise les couleurs de créneau et de réunion comme couleurs de chantier (écran E22).
5. **Texte ≥ 12 px partout (minimum mesuré : 12 px sur 39 écrans, 0 texte en dessous)**, aucun texte chevauché. En revanche : **20 écrans sur 39 portent du texte sous 4,5:1** (94 nœuds, pire cas 2,26:1), et **les écrans E04 et E05 cachent sous la barre du bas ou hors du cadre les éléments censés prouver S4, S6, S7, S8, S9 et S31**.
6. **Défauts de mise en page mesurés** : l'étiquette d'état pousse le nom du chantier à la ligne (déjà dans E27 avec un nom de 14 caractères, jusqu'à 4 lignes avec un nom de 52), le repère « minuit » de la mini-frise est écrit 97 minutes trop tard, la feuille de l'éditeur (E21) n'est pas utilisable à 360 × 640 (bouton OK hors de la feuille), la pastille de l'assistant (AS7) coupe « 16h30 » en « 16h3… ».

## 2. (A) `tokens.css` contre `integration-technique` §2.4 et §3.5

### 2.1 Tableau de contrôle

| Règle (source) | Mesuré | Verdict |
|---|---|---|
| Noms `--dz-…` pour les jetons propres, noms shadcn conservés (§2.4) | 88 jetons `--dz-*` et 20 noms shadcn (19 + `--radius`) ; aucun autre préfixe | Conforme |
| Classes `dz-…`, sans redéfinir une seule `bt-…` (§2.4) | Le fichier ne définit aucune classe de composant `dz-…` (seulement la classe de portée `.dz-salarie`), et la planche n'en utilise aucune ; il ne touche aux `bt-…` que par le sélecteur de portée. Aucun TSX livré : les classes `dz-` n'existent pas encore | Non vérifiable (manque) |
| Portée `.dz-salarie` sur la racine de l'écran (§2.4) | Ligne 6 : `.dz-salarie, .dz-salarie .bt-skin, .bt-skin.dz-salarie` | Conforme pour l'écran |
| Portée sur `.bt-skin` (fenêtres Radix, rendues dans `<body>`) (§2.4, §4) | `.dz-salarie .bt-skin` exige un ancêtre `.dz-salarie`, absent d'un portail ; `.bt-skin.dz-salarie` exige les deux classes sur le même nœud, ce que le README ne dit nulle part. Mesure au §2.2 | **Écart** |
| Aucune couleur en dur hors du fichier de jetons (§2.4) | Dans `tokens.css` : conforme (c'est le fichier de jetons). Dans la planche : 351 occurrences hexadécimales dont 27 (8 %) hors jetons, 0 `var(--…)` | Écart (§2.5) |
| Variables shadcn complètes, une seule valeur par jeton (§4) | 19 noms posés, mais sept lignes où le triplet HSL ne donne pas l'hexadécimal du commentaire (§2.6) ; `--success`, `--warning`, `--orange` (+ premier plan) du dépôt non redéfinis | Écart mineur |
| Noms shadcn de `:root` touchés « à la dernière étape » seulement | Conforme (le fichier ne contient aucun bloc `:root`), mais le bloc `:root, .bt-skin` final n'est pas livré : l'intégrateur devra recopier les valeurs | À noter |
| Polices : aucune nouvelle, Archivo et JetBrains Mono | `--dz-font-ui: 'Archivo'`, `--dz-font-chiffres: 'JetBrains Mono'` : mêmes familles que `public/fonts/fonts.css` ; aucun `@font-face` ajouté. Poids : la planche demande JetBrains Mono en 800 et 900 (fichiers 400, 500, 700 seulement : le navigateur prend 700, sans conséquence visible) | Conforme |
| Durées | `--dz-t-rapide/normal/feuille/pulsation` = 120, 200, 260, 1 400 ms. Code actuel : pulsation 1,6 s (`bt-pl-pulse`, `planning-bubble.tsx:167`), fenêtre 200 ms (`ui/dialog.tsx:41`). La planche ne pose aucune pulsation : `@keyframes bxPulse` est défini mais jamais appliqué ; seul le squelette anime (1,2 s, hors jeton) | Mineur |
| Rayons | Jetons : 6, 12, 16, 22, 28, 999. La planche emploie 15 valeurs distinctes, dont 9 hors jetons (1, 3, 8, 10, **14** ×6, 18, 24, 40, 48). `--radius: 16px` donne `rounded-md` = 14 px et `rounded-sm` = 12 px à `components/ui` (Button, Input) : 14 px là où le dossier dit 12 px (`--dz-r-s`) | Écart mineur |
| Ombres | 2 ombres + voile en jetons. La planche emploie en plus `inset 0 -3px 0 #D9A200` (boutons de feuille, le jeton est à 4 px) et `0 14px 40px rgba(21,18,15,.45)` (pastille AS7). L'ombre de fenêtre `0 30px 80px` et le liseré 4 px ne sont que dans un commentaire (lignes 115-117), pas des jetons | Mineur |
| Tailles de texte : 12 px minimum (README §8) | Jetons lignes 73-74 : `--dz-fs-xs: 10.5px` et `--dz-fs-s: 12.5px`, aucun jeton 12 px. Le CSS de la planche emploie 16 tailles dont 12 hors des 6 jetons (12, 13, 13,5, 14,5, 15, 17, 18, 19, 20, 24, 26 ; 64 posé par le script ; 38, 40 et 52 aussi) | **Écart** : le fichier n'a pas suivi la règle |
| Cibles : 44 px, 48 pour les principales (§2.8) | `--dz-tap: 44px`, `--dz-tap-main: 56px`, `--dz-tap-tile: 64px` : valeurs retrouvées à la mesure (§4.4). Pas de jeton 48 px alors que les boutons de feuille sont à 52, les puces à 44, les boutons d'assistant à 48 | Mineur |
| Focus visible (§2.7) | `--ring: 30 17% 7%` (ligne 26), c'est-à-dire `#15120F`. Contraste 1,00:1 sur l'en-tête noir `#15120F` et 1,05:1 sur la carte de pointage `#1B1713` ; le `--ring` actuel de `.bt-skin` est jaune (11,54:1 sur noir) | **Écart** |
| Contraste du rouge destructif | `--destructive: 1 77% 56%` (ligne 22) = `#E53B38` ; texte blanc dessus : 4,19:1. Le dépôt actuel : 4,80:1 (`:root`) et 4,79:1 (`.bt-skin`). Le commentaire annonce `#E53935` (4,23:1) : sous 4,5:1 dans les deux cas | **Écart** |

### 2.2 Mesure de la portée (navigateur, `tokens.css` seul + le `.bt-skin` actuel injecté après)

Page de test : un `.dz-salarie` contenant un `.bt-skin`, puis trois nœuds frères dans `<body>` (comme un portail Radix). Le `.bt-skin` de la page reproduit celui de `app/poseur/page.tsx:127-148`.

| Nœud | `--dz-jaune` | `--dz-carte` | `--ring` | `--destructive` |
|---|---|---|---|---|
| Racine `.dz-salarie` | `#FFC21A` | `#FFFDF8` | `30 17% 7%` | `1 77% 56%` |
| `.bt-skin` dans la racine | `#FFC21A` | `#FFFDF8` | `30 17% 7%` | `1 77% 56%` |
| **Portail avec `.bt-skin` seul** | **non défini** | **non défini** | `43 100% 55%` (ancien) | `14 72% 44%` (ancien) |
| Portail avec `.bt-skin` **et** `.dz-salarie` | `#FFC21A` | `#FFFDF8` | `30 17% 7%` | `1 77% 56%` |
| Nœud sans classe | non défini | non défini | non défini | non défini |

Conséquence : 11 écrans de feuille (E08-E10, E13, E20-E24, AS6, AS7) reposent sur des contenus Radix qui n'ont aucun jeton `--dz-*` tant que `DialogContent` ne porte pas explicitement `dz-salarie`. Le voile et la croix intégrée ne peuvent pas être portés par cette classe : `ui/dialog.tsx:24` fixe `bg-black/80` sur l'overlay (pas de `bt-skin` dessus), `:47` ajoute une croix de 16 px que la feuille dessinée remplace par une croix de 44 px.

### 2.3 Ce que §3.5 exige, et ce que le fichier fournit

| Exigence (§3.5) | Dans `tokens.css` | Verdict |
|---|---|---|
| Teintes de créneau en hexadécimal | Lignes 57-59 : fond et trait pour matin, après-midi, soir ; ligne 60 : journée blanche | Présent, **retouché** (§3) |
| Réunion | Ligne 61 : `#FBE0EA` et `#D6457A` | Présent, bord **à corriger** |
| Jour courant (en-tête `#FFF3CC`, case `#FFF6DB`) | Lignes 62-63 | Présent, identique au code |
| Vert « en cours » (`#E7F6EE`, `#2FA36B`) | Ligne 47 (+ `#17663F`, `#2ED3A0`) | Présent, identique. Case verte `#EEF9F2` (lue par les deux tests) : absente |
| Absences | Lignes 66-68 : congé, maladie, intempérie, motif à 135° | Il manque « repos » (lettre R de la bande, `ABSENCE_VISUAL.repos` du dépôt) ; angle 45° dans le code ; teintes toutes différentes |
| États des heures | Lignes 45-54 | Nouveaux jetons, rien à comparer |
| **Couleur d'un chantier : 7 entrées `CHANTIER_PALETTES`** | **Aucune** (`tokens.css` n'en parle pas). Écran E22 : points de chantier `#4A8FE0` (= trait du matin), `#D6457A` (= trait de réunion), `#C0392B` (absent des jetons) | **Manque** |
| Encre secondaire `DAY_PART_INK` (`#57524A`) et règle `MEETING_TINT.ink === DAY_PART_INK` | Absente. Commentaire ligne 61 : « encre de réunion = encre des créneaux (`#15120F`) », alors que la planche écrit les sous-lignes sur les teintes en `#5B534A` (`--dz-texte-2`) | **À trancher** (§3.5) |
| Constantes de test absence `#E7E1D5`, badge envoyé `#EFEAE0` | Remplacées par d'autres valeurs (congé `#EFE6D2` / `#E4D6B8`) | Conflit avec bureau et borne (§2.4) |

### 2.4 Conflits avec les constantes du code

| Constante (fichier:ligne) | Code actuel | Dossier | Écart (ΔE) | Effet |
|---|---|---|---|---|
| `DAY_PART_INK` (`day-part.ts:58`) | `#57524A` | pas de valeur ; `#15120F` en commentaire ; `--dz-texte-2` `#5B534A` | 1,7 (vers texte-2) | Décision à prendre ; `#5B534A` passe 4,5:1 sur les 4 teintes (5,75 à 6,23:1) |
| Matin (`day-part.ts:60`) | fond `#DAEDFB`, bord `#2B5B91` | `#DDEBFA`, `#4A8FE0` | 1,8 ; 24,4 | Bord utilisé en bordure de pastille de tâche |
| Après-midi (`:61`) | `#FDE3CA`, `#8A4A12` | `#FCE3CF`, `#EE8A43` | 2,6 ; 32,0 | Trait identique à `--dz-a-envoyer-trait` |
| Soir (`:62`) | `#DFCCEE`, `#5E4589` | `#E8DCF6`, `#9A6FD6` | **7,0** ; 26,6 | **Fait tomber matin / soir de 19,1 à 11,2** |
| `MEETING_TINT` (`missions.ts:150`) | fond `#F9D6E0`, bord `#9E2A55` | `#FBE0EA`, `#D6457A` | 4,2 ; **17,8** | **Bord de 5,39:1 à 3,40:1**. Le bord sert de **couleur de texte** (`missions-worker.tsx:23`, `poseur-week.tsx:228,345`, `missions-office.tsx:90`) |
| `CHANTIER_PALETTES` (`planning-bubble.tsx:15-23`) | 7 entrées `bar`, `tagBg`, `tagText` | aucune | — | Voir §2.3 |
| `ABSENCE_VISUAL` (`admin-planning.tsx:529-534`) et `ABSENT_STYLE` (`kiosk-week-grid.tsx:28`) | 4 types (congé, repos, intempérie, maladie), motif à 45° | 3 types, motif à 135°, teintes différentes (ΔE 2,7 à 8,2) | jusqu'à 8,2 | La borne doit rester identique au bureau (lot 9) : elle est touchée sans être dans le périmètre annoncé |
| Vert « en cours », jour courant (`planning-bubble.tsx:63, 98, 117`) | `#E7F6EE`, `#2FA36B`, `#FFF3CC`, `#FFF6DB` | identiques | 0 | Aucun conflit |
| `.bt-skin` (`app/poseur/page.tsx:127-148`) | `--destructive: 14 72% 44%`, `--ring: 43 100% 55%`, `--muted-foreground: 40 6% 42%` | `1 77% 56%`, `30 17% 7%`, `30 10% 32%` | — | Contraste du rouge et focus dégradés (§2.1) |

### 2.5 La planche ne s'appuie pas sur les jetons

| Mesure | Résultat |
|---|---|
| `var(--…)` et classes `dz-` dans la planche | 0 et 0 |
| Couleurs hexadécimales distinctes de la planche | 53, dont 38 présentes dans `tokens.css` et **15 absentes** (13 relèvent des écrans, 2 de la mise en page de la planche : `#E9E2D4`, `#B88A00`) |
| Absentes, avec occurrences | `#3A332B` ×4, `#EFE7D9` ×4, `#FF6B6B` ×4 (kicker rouge, alors que le jeton est `--dz-oubli: #FF6B3D`), `#8A6A00` ×2, `#3A3129` ×2 et `#2A241E` ×1 (rayures sombres de la bande, mentionnées au README §4 mais pas dans le fichier), `#5C4300` ×2, `#6B4E00`, `#7A2A22`, `#F0B8AE`, `#C0392B`, `#B5A994`, `#F3ECE0` |
| Occurrences hexadécimales | 351, dont 324 (92 %) égales à un jeton, 27 hors jetons |
| `font-size` distincts | 16 pour 6 jetons ; 12 tailles hors jetons |
| `gap` distincts | 14 ; 7 hors de l'échelle `--dz-sp-*` (1, 2, 3, 5, 16, 40, 48) |
| Rayons | 9 hors jetons sur 15 |

Lecture : à 92 % les valeurs des maquettes sont bien celles du fichier, donc le fichier décrit le dessin, mais rien ne le prouve par construction. Quand le TSX sera écrit, chaque valeur hors jeton est une décision à prendre.

### 2.6 Autres écarts de jetons

- **Triplets HSL contre hexadécimal** (sept lignes, de 1 à 6 unités RGB) : `--card` donne `#FFFDFA` (commentaire `#FFFDF8`), `--secondary` `#E4DCCE` (`#E6DDCD`), `--muted-foreground` `#5A5249` (`#5B534A`), `--accent` `#FFF1CC` (`#FFF3CC`), `--destructive` `#E53B38` (`#E53935`), `--border` `#DDD4C6` (`#E3DACB`), `--input` `#D4CAB9` (`#D6CBB7`). Les cartes shadcn et les classes `dz-` dessineraient donc deux bordures différentes (`--border` contre `--dz-trait`).
- **Jetons de même valeur sous plusieurs noms** (huit paires) : `--dz-apres-midi-trait` = `--dz-a-envoyer-trait` (`#EE8A43`), `--dz-en-cours` = `--dz-envoye-pastille` (`#2FA36B`), `--dz-erreur` = `--dz-maintenant` (`#E53935`), `--dz-texte-3` = `--dz-cloture`, `--dz-jaune` = `--dz-envoye-heure`, `--dz-jaune-pale` = `--dz-jour-courant-entete`, `--dz-sable` = `--dz-telephone-fond`, `--dz-encre` = `--dz-envoye-fond` = `--dz-journee-trait`. Le premier couple est un vrai doublon de sens : un liseré orange dit « après-midi » ET « à envoyer » (§3.6).
- **`@media (prefers-reduced-motion)`** (lignes 111-113) : même défaut de portée que le reste (`.dz-salarie *`, `.bt-skin.dz-salarie *`).

## 3. (B) Les tests de teintes

### 3.1 Méthode

Lecture de `package.json` : `test:creneaux` = `deno test supabase/functions/_shared/day-part.test.ts`, `test:missions` = `deno test --allow-read …/missions.test.ts`. Copie de `supabase/functions/_shared/*.ts`, de `lib/time-input.ts` et des deux migrations lues par le test dans un dossier temporaire ; les deux commandes ont d'abord été rejouées **sans modification** (5/5 et 19/19 : la copie est fidèle). Puis, dans la copie seulement : `DAY_PARTS` (fond et bord), `MEETING_TINT` (fond et bord) et `DAY_PART_INK = #15120F` (ce que dit le commentaire ligne 61) prennent les valeurs de `tokens.css`. Les tests sont inchangés. Un second script recalcule **tous** les contrôles sans s'arrêter au premier échec (Deno s'arrête au premier échec de chaque test).

### 3.2 Ce que le designer a retouché

| Teinte | Code actuel | Dossier | ΔE de la retouche |
|---|---|---|---|
| Matin, fond | `#DAEDFB` | `#DDEBFA` | 1,8 |
| Après-midi, fond | `#FDE3CA` | `#FCE3CF` | 2,6 |
| Soir, fond | `#DFCCEE` | `#E8DCF6` | **7,0** |
| Réunion, fond | `#F9D6E0` | `#FBE0EA` | 4,2 |
| Réunion, bord | `#9E2A55` | `#D6457A` | **17,8** |

### 3.3 Résultat des tests du dépôt avec les valeurs du dossier

| Commande | Avant | Avec `tokens.css` | Échecs |
|---|---|---|---|
| `npm run test:creneaux` | 5 passés | **4 passés, 1 échec** | `teintes distinctes entre elles…` : `Matin / Soir : ΔE 11.2` (`day-part.test.ts:103`) |
| `npm run test:missions` | 19 passés | **17 passés, 2 échecs** | `réunion : couleur lisible…` : `bordure 3.40` (`missions.test.ts:232`) ; `réunion : jamais prise pour un chantier…` : `bordure / barre la plus proche : ΔE 19.2 (connu, accepté)` (`missions.test.ts:255`) |

Le second échec de `missions` n'est pas une régression de dessin : le test épingle une valeur « connue, acceptée » (bordure à 8-12 de la barre de chantier la plus proche, fond à 4-6 de la pastille d'initiales). Le nouveau bord (#D6457A) en est plus loin (19,2) ; le nouveau fond (#FBE0EA) est **plus proche** de la pastille `#EFD9E2` qu'avant (3,43 contre 4,8), donc plus facile à confondre avec une pastille de chantier. Le test s'arrête à la première des deux, la seconde apparaît dans le calcul complet.

### 3.4 Synthèse de tous les contrôles (42 lignes)

| Contrôle | Pire valeur du dossier | Seuil | Résultat |
|---|---|---|---|
| Texte `#15120F` sur chaque teinte de créneau et sur la réunion | 14,22:1 (soir) | ≥ 7 | passe |
| Encre secondaire sur chaque teinte | 14,22:1 si `#15120F` (le dossier) ; 5,90:1 si `#57524A` (le code actuel) | ≥ 4,5 | passe |
| ΔE entre créneaux | matin / soir **11,22** ; matin / après-midi 22,88 ; après-midi / soir 24,41 | ≥ 15 | **échec** (matin / soir) |
| ΔE créneau / blanc | 11,75 (matin) | ≥ 10 | passe |
| ΔE créneau / jour courant `#FFF6DB` | **8,63** (après-midi) | ≥ 8 | passe, marge 0,63 |
| ΔE créneau / vert `#E7F6EE` et `#EEF9F2` | 12,23 (matin / `#EEF9F2`) | ≥ 10 | passe |
| Bordure de réunion sur son fond | **3,40:1** | ≥ 4,5 | **échec** |
| ΔE réunion / créneaux | 10,16 (soir) | ≥ 10 | passe, marge 0,16 |
| ΔE réunion / blanc, jour courant, vert, absence `#E7E1D5`, badge `#EFEAE0` | 13,01 | ≥ 10 | passe |
| ΔE fond réunion / 7 barres de chantier | 59,66 | ≥ 25 | passe |
| Bord réunion / barre de chantier la plus proche (épinglé) | **19,21** | entre 8 et 12 | échec de valeur épinglée |
| Fond réunion / pastille d'initiales la plus proche (épinglé) | **3,43** | entre 4 et 6 | échec de valeur épinglée |

<details>
<summary>Les 42 lignes, sans regroupement</summary>

| # | Fichier de test | Contrôle | Valeur mesurée | Seuil | Résultat |
|---|---|---|---|---|---|
| 1 | day-part.test.ts · teintes lisibles | matin : #15120F / fond | **15,41:1** | ≥ 7 | passe |
| 2 | day-part.test.ts · teintes lisibles | matin : encre secondaire (dossier #15120F) / fond | **15,41:1** | ≥ 4,5 | passe |
| 3 | day-part.test.ts · teintes lisibles | après-midi : #15120F / fond | **15,13:1** | ≥ 7 | passe |
| 4 | day-part.test.ts · teintes lisibles | après-midi : encre secondaire (dossier #15120F) / fond | **15,13:1** | ≥ 4,5 | passe |
| 5 | day-part.test.ts · teintes lisibles | soir : #15120F / fond | **14,22:1** | ≥ 7 | passe |
| 6 | day-part.test.ts · teintes lisibles | soir : encre secondaire (dossier #15120F) / fond | **14,22:1** | ≥ 4,5 | passe |
| 7 | day-part.test.ts · teintes distinctes | matin / après-midi | **22,88** | ≥ 15 | passe |
| 8 | day-part.test.ts · teintes distinctes | matin / soir | **11,22** | ≥ 15 | **ÉCHEC** |
| 9 | day-part.test.ts · teintes distinctes | après-midi / soir | **24,41** | ≥ 15 | passe |
| 10 | day-part.test.ts · teintes distinctes | matin / blanc | **11,75** | ≥ 10 | passe |
| 11 | day-part.test.ts · teintes distinctes | matin / jour J case #FFF6DB | **23,34** | ≥ 8 | passe |
| 12 | day-part.test.ts · teintes distinctes | matin / vert #E7F6EE | **12,32** | ≥ 10 | passe |
| 13 | day-part.test.ts · teintes distinctes | matin / vert case #EEF9F2 | **12,23** | ≥ 10 | passe |
| 14 | day-part.test.ts · teintes distinctes | après-midi / blanc | **16,24** | ≥ 10 | passe |
| 15 | day-part.test.ts · teintes distinctes | après-midi / jour J case #FFF6DB | **8,63** | ≥ 8 | passe |
| 16 | day-part.test.ts · teintes distinctes | après-midi / vert #E7F6EE | **16,42** | ≥ 10 | passe |
| 17 | day-part.test.ts · teintes distinctes | après-midi / vert case #EEF9F2 | **15,80** | ≥ 10 | passe |
| 18 | day-part.test.ts · teintes distinctes | soir / blanc | **17,74** | ≥ 10 | passe |
| 19 | day-part.test.ts · teintes distinctes | soir / jour J case #FFF6DB | **28,24** | ≥ 8 | passe |
| 20 | day-part.test.ts · teintes distinctes | soir / vert #E7F6EE | **21,13** | ≥ 10 | passe |
| 21 | day-part.test.ts · teintes distinctes | soir / vert case #EEF9F2 | **20,50** | ≥ 10 | passe |
| 22 | missions.test.ts · réunion lisible | titre #15120F / fond réunion | **15,06:1** | ≥ 7 | passe |
| 23 | missions.test.ts · réunion lisible | encre (dossier #15120F) / fond réunion | **15,06:1** | ≥ 4,5 | passe |
| 24 | missions.test.ts · réunion lisible | bordure / fond réunion | **3,40:1** | ≥ 4,5 | **ÉCHEC** |
| 25 | missions.test.ts · réunion à part | réunion / matin | **14,66** | ≥ 10 | passe |
| 26 | missions.test.ts · réunion à part | réunion / après-midi | **15,37** | ≥ 10 | passe |
| 27 | missions.test.ts · réunion à part | réunion / soir | **10,16** | ≥ 10 | passe |
| 28 | missions.test.ts · réunion à part | réunion / blanc #FFFFFF | **13,86** | ≥ 10 | passe |
| 29 | missions.test.ts · réunion à part | réunion / jour J #FFF6DB | **20,52** | ≥ 10 | passe |
| 30 | missions.test.ts · réunion à part | réunion / vert #E7F6EE | **18,11** | ≥ 10 | passe |
| 31 | missions.test.ts · réunion à part | réunion / vert case #EEF9F2 | **17,05** | ≥ 10 | passe |
| 32 | missions.test.ts · réunion à part | réunion / absence #E7E1D5 | **13,71** | ≥ 10 | passe |
| 33 | missions.test.ts · réunion à part | réunion / badge envoyé #EFEAE0 | **13,01** | ≥ 10 | passe |
| 34 | missions.test.ts · réunion ≠ chantier | fond réunion / barre #C9821F | **69,17** | ≥ 25 | passe |
| 35 | missions.test.ts · réunion ≠ chantier | fond réunion / barre #A23E6B | **61,14** | ≥ 25 | passe |
| 36 | missions.test.ts · réunion ≠ chantier | fond réunion / barre #2F8A5B | **66,33** | ≥ 25 | passe |
| 37 | missions.test.ts · réunion ≠ chantier | fond réunion / barre #B5472E | **68,73** | ≥ 25 | passe |
| 38 | missions.test.ts · réunion ≠ chantier | fond réunion / barre #7A5EA8 | **59,66** | ≥ 25 | passe |
| 39 | missions.test.ts · réunion ≠ chantier | fond réunion / barre #5E7A33 | **66,13** | ≥ 25 | passe |
| 40 | missions.test.ts · réunion ≠ chantier | fond réunion / barre #A8742A | **62,10** | ≥ 25 | passe |
| 41 | missions.test.ts · réunion ≠ chantier (valeur épinglée) | bordure / barre la plus proche (épinglé 8 < ΔE < 12) | **19,21** | entre 8 et 12 (valeur épinglée) | **ÉCHEC** |
| 42 | missions.test.ts · réunion ≠ chantier (valeur épinglée) | fond / pastille d’initiales la plus proche (épinglé 4 < ΔE < 6) | **3,43** | entre 4 et 6 (valeur épinglée) | **ÉCHEC** |

</details>

### 3.5 Valeurs de remplacement, les plus proches qui passent

Recherche exhaustive dans l'espace RVB autour de la valeur du dossier (distance ΔE76 minimale), les autres teintes restant celles du dossier, toutes les contraintes des deux fichiers de test appliquées. Chaque remplacement a ensuite été remis dans la copie des fichiers du dépôt et les deux commandes rejouées.

| Échec | Valeur du dossier | Remplacement le plus proche | Décalage (ΔE) | Vérification |
|---|---|---|---|---|
| Matin / Soir 11,22 | `--dz-soir` `#E8DCF6` | **`#EAD6F4`** (matin / soir 15,02 ; réunion / soir 11,32) | 3,8 | `test:creneaux` 5/5 |
| idem, en bougeant le matin | `--dz-matin` `#DDEBFA` | `#D8EFFA` (matin / soir 15,01 ; matin / blanc 11,74) | 3,8 | `test:creneaux` 5/5 |
| idem, en bougeant les deux | matin et soir | `#D9ECF9` et `#E9D9F5` (15,05) | 2,0 et 1,9 | `test:creneaux` 5/5 |
| Bordure de réunion 3,40:1 | `--dz-reunion-trait` `#D6457A` | **`#BE2D67`** (4,51:1) | 7,8 | passe le contraste ; laisse un test épinglé rouge (ΔE 16,1 hors 8-12) |
| idem, en restant dans la valeur épinglée du test | `#D6457A` | **`#B7366A`** (4,52:1 ; ΔE 10,93 de la barre de chantier la plus proche) | 9,7 | `test:missions` : le contrôle de contraste et l'épinglage « bord / barre » passent |
| Fond de réunion à 3,43 de la pastille d'initiales (épinglé 4-6) | `--dz-reunion` `#FBE0EA` | `#FFE2EC` (4,54 ; ΔE 11,81 du créneau le plus proche) | 1,1 | `test:missions` 19/19 |

Avec `#EAD6F4` pour le soir, `#B7366A` pour le bord et `#FFE2EC` pour le fond : `test:creneaux` 5 passés, `test:missions` 19 passés (rejoués dans la copie). En ne remplaçant que ce qui échoue vraiment (`#EAD6F4` et `#B7366A`, fond du dossier gardé) : `test:creneaux` passe et `test:missions` garde **un seul** test rouge, l'épinglage « fond / pastille d'initiales » (3,4 pour 4-6), à ré-épingler à la main côté dépôt si le fond du dossier est gardé.

**Encre secondaire.** `DAY_PART_INK` doit rester une constante unique (`MEETING_TINT.ink === DAY_PART_INK`). Le dossier dit `#15120F` mais dessine ses sous-lignes en `#5B534A`. Proposition : `#5B534A`, qui passe 4,5:1 sur les quatre teintes (5,75 / 6,12 / 6,23 / 6,10:1).

### 3.6 Écarts non testés par le dépôt, qui posent problème

Mesure sur les jetons du dossier entre eux (le dépôt ne teste pas ces paires) :

| Paire | ΔE | Risque |
|---|---|---|
| Après-midi `#FCE3CF` / « À ENVOYER » `#FFE1CC` | **2,1** | Quasi identiques ; en plus le trait d'après-midi et le trait « à envoyer » sont la même valeur `#EE8A43`. Une ligne d'après-midi « à envoyer » ne se lit plus (E27) |
| Matin `#DDEBFA` / intempérie `#DCE6EE` | 4,1 (6,8 avec l'autre teinte) | Un jour d'intempérie ressemble à une ligne du matin |
| Après-midi / congé `#EFE6D2` | 6,1 | idem |
| Réunion `#FBE0EA` / maladie `#F1E2E2` et `#E7D2D2` | 6,7 et 7,9 | Une réunion se lit comme une absence maladie (Semaine, E25) |
| Réunion / `--dz-erreur-fond` `#FCE4E1` | 6,8 | Un message d'erreur rose proche d'une carte de réunion |
| Après-midi / sable `#E6DDCD` (« sur le téléphone ») | 7,2 | |

Autre contradiction de sens : dans la planche, la **bande de 5 px à gauche de chaque carte** porte la couleur du créneau (`tokens` : `--dz-*-trait`). Dans le code, une barre à gauche d'une bulle = la couleur du **chantier** (`planning-bubble.tsx:67`, `CHANTIER_PALETTES.bar`), et la réunion n'en a volontairement pas (`missions.ts:144-146` : « Bordure PLEINE et pas de barre à gauche : elle ne passe jamais pour un chantier »). La planche dessine pourtant une barre rose à gauche de la carte de réunion (E05). Cette bande porte aussi une information par la couleur seule (créneau) : le README §8 la range parmi les éléments « décoratifs ».

## 4. (C) Mesures sur les maquettes

Seuils : texte utile ≥ 12 px ; texte d'action ≥ 16 px ; cible ≥ 44 px (48 px pour les principales) ; contraste ≥ 4,5:1.

### 4.1 Tableau par écran (cadre dessiné, 370 × 824)

Colonnes : « Plus petit texte » = plus petit `font-size` d'un texte visible ; « Actions < 16 px » = actions dont tout le texte est sous 16 px (SG = initiales de l'avatar, QR = bouton scanner, FR·TR = dictée, ✕ = fermer, ✦ = pastille de l'assistant) ; « Cibles < 44 px » = cibles sous 44 px dans l'une des deux dimensions ; « Texte replié / coupé » = libellé court (24 caractères au plus : puce, étiquette, tuile, titre de carte) sur 2 lignes ou plus, ligne d'aide ou kicker sur 2 lignes, ou texte tronqué (les titres de message et les libellés longs de bouton sur 2 lignes sont normaux et ne sont pas comptés) ; « Contenu masqué » = blocs du contenu défilant sous la barre du bas ou hors du cadre.

| Écran | Nom | Textes mesurés | Plus petit texte | < 12 px | Actions < 16 px | Cibles < 44 px | Texte replié / coupé | Chevauché | Contraste < 4,5:1 (nb, pire) | Contenu masqué (barre ou cadre) |
|---|---|---|---|---|---|---|---|---|---|---|
| E01 | Chargement | 8 | 12 px | 0 | SG 13 | 0 | 0 | 0 | 0 | 0 |
| E02 | Échec de chargement | 18 | 12 px | 0 | SG 13, QR 12 | 0 | 0 | 0 | 2, 2,91:1 | 0 |
| E03 | Journée vide | 41 | 12 px | 0 | SG 13, QR 12 | 0 | 0 | 0 | 5, 2,91:1 | 0 |
| E04 | Planifiée, rien saisi | 59 | 12 px | 0 | SG 13, QR 12 | 0 | 0 | 0 | 5, 3,20:1 | 2 bloc(s) : 1 masqué(s), coupé de 29 px |
| E05 | En cours · écran principal | 74 | 12 px | 0 | SG 13, QR 12 | CTA « Ouvrir › » 58×21; case 26×26 | « 2 formations à voir › » 2 l.; « 1 à préciser ↓ » 2 l. | 0 | 6, 3,20:1 | 6 bloc(s) : 5 masqué(s), coupé de 3 px |
| E06 | Hors-ligne | 51 | 12 px | 0 | SG 13, QR 12 | case 26×26 | 0 | 0 | 5, 3,20:1 | 0 |
| E07 | Retour du réseau | 49 | 12 px | 0 | SG 13, QR 12 | 0 | aide 2 l. | 0 | 5, 3,20:1 | 0 |
| E08 | Contrôle · horaires prévus | 49 | 12 px | 0 | SG 13, QR 12, ✕ 15 | 0 | 0 | 0 | 0 | 0 |
| E09 | Contrôle · pause | 52 | 12 px | 0 | SG 13, QR 12, ✕ 15 | 0 | 0 | 0 | 0 | 0 |
| E10 | Contrôle · plus de 10 h | 44 | 12 px | 0 | SG 13, QR 12, ✕ 15 | 0 | 0 | 0 | 0 | 0 |
| E11 | Arrêt · chevauchement | 49 | 12 px | 0 | SG 13, QR 12 | 0 | 0 | 0 | 5, 3,20:1 | 0 |
| E12 | Journée envoyée | 58 | 12 px | 0 | SG 13, QR 12 | 0 | 0 | 0 | 9, 3,20:1 | 0 |
| E13 | Journée déjà envoyée | 48 | 12 px | 0 | SG 13, QR 12, ✕ 15 | 0 | 0 | 0 | 0 | 0 |
| E14 | Renvoyée par le bureau | 45 | 12 px | 0 | SG 13, QR 12 | 0 | « 1 à préciser ↓ » 2 l. | 0 | 7, 3,20:1 | 0 |
| E15 | Corrigée par le bureau | 49 | 12 px | 0 | SG 13, QR 12 | 0 | 0 | 0 | 7, 3,20:1 | 0 |
| E16 | Verrouillée | 50 | 12 px | 0 | SG 13, QR 12 | 0 | aide 2 l. | 0 | 9, 2,26:1 | 0 |
| E17 | Pointage oublié | 44 | 12 px | 0 | SG 13, QR 12 | 0 | 0 | 0 | 4, 3,20:1 | 0 |
| E18 | Sortie oubliée à compléter | 44 | 12 px | 0 | SG 13, QR 12 | 0 | 0 | 0 | 6, 3,20:1 | 0 |
| E19 | Transfert en échec | 50 | 12 px | 0 | SG 13, QR 12 | CTA « Relancer » 72×21 | aide 2 l. | 0 | 4, 3,20:1 | 0 |
| E20 | Lever une réserve | 56 | 12 px | 0 | SG 13, QR 12, ✕ 15 | 0 | 0 | 0 | 0 | 0 |
| E21 | Éditeur d'intervention | 68 | 12 px | 0 | SG 13, QR 12, ✕ 15 | 0 | 0 | 0 | 0 | feuille rognée de 28 px |
| E22 | Choisir le chantier | 44 | 12 px | 0 | SG 13, QR 12, ✕ 15 | 0 | 0 | 0 | 0 | 0 |
| E23 | Pointage encore en cours | 50 | 12 px | 0 | SG 13, QR 12, ✕ 15 | 0 | 0 | 0 | 0 | 0 |
| E24 | Dupliquer la journée | 55 | 12 px | 0 | SG 13, QR 12, ✕ 15 | 0 | 0 | 0 | 0 | 0 |
| E25 | Semaine | 61 | 12 px | 0 | SG 13 | 0 | kicker 2 l. | 0 | 5, 3,20:1 | 0 |
| E26 | Plus | 34 | 12 px | 0 | SG 13 | 0 | 0 | 0 | 4, 2,28:1 | 0 |
| E27 | Mon équipe (chef) | 29 | 12 px | 0 | SG 13 | 0 | « Résidence Test » 2 l. | 0 | 1, 3,20:1 | 0 |
| E28 | Compte archivé | 7 | 12 px | 0 | SG 13 | 0 | 0 | 0 | 0 | 0 |
| P01 | /pointer · arrivée | 9 | 12 px | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| P02 | /pointer · départ | 9 | 12 px | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| P03 | /pointer · non enregistré | 9 | 12 px | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| AS1 | Assistant · accueil | 20 | 12 px | 0 | FR·TR 12 | 0 | kicker 2 l. | 0 | 3, 2,28:1 | 0 |
| AS2 | Assistant · heures dites | 16 | 12 px | 0 | FR·TR 12 | 0 | kicker 2 l.; « Villa Exemple » 2 l.; « Résidence Test » 2 l.; « Autre chantier » 2 l. | 0 | 0 | 0 |
| AS3 | Assistant · à confirmer | 14 | 12 px | 0 | FR·TR 12 | 0 | kicker 2 l. | 0 | 1, 3,92:1 | 0 |
| AS4 | Assistant · historique | 19 | 12 px | 0 | 0 | 0 | 0 | 0 | 1, 4,23:1 | 0 |
| AS5 | Assistant · historique vide | 7 | 12 px | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| AS6 | Assistant · tout effacer | 18 | 12 px | 0 | ✕ 15 | 0 | 0 | 0 | 0 | 0 |
| AS7 | Formulaire pré-rempli + assistant réduit | 68 | 12 px | 0 | SG 13, QR 12, ✕ 15, ✦ 15 | CTA « Ouvrir › » 58×21 | kicker 2 l.; après-midi 13h-16h30 che… coupé | 0 | 0 | 0 |
| AS8 | Assistant · retour après OK | 14 | 12 px | 0 | FR·TR 12 | 0 | kicker 2 l. | 0 | 0 | 0 |

Blocs hors écrans : la **bande des 8 états** (12 px minimum, 4 contrastes sous 4,5:1 : coche blanche sur `#2FA36B` 3,20:1 ; « rien de prévu » 3,91:1 ; ↺ blanc sur `#E53935` 4,23:1) et les **4 cas de la mini-frise** (12 px minimum, 0 contraste sous 4,5:1, mais un défaut de position, §4.6).

Totaux : 39 écrans, 1 489 textes, **0 sous 12 px**, **0 chevauchement**, 20 écrans avec contraste insuffisant (94 textes), 649 cibles candidates dont aucune ne tombe sous 44 px hors les cases à cocher, les CTA nus (§4.4), la pastille décorative ✦ d'AS7 (36 px) et le retour passager d'E12 (42 px, non cliquable).

### 4.2 Contrastes sous 4,5:1, par cause

| Couple (texte / fond) | Ratio | Taille | Où | Écrans |
|---|---|---|---|---|
| Blanc sur vert `#2FA36B` | **3,20:1** | 12 px gras (étiquettes ENVOYÉ ✓, EN COURS, coche de la bande), 16 px gras (bouton « Journée envoyée ✓ ») | Bande des jours, cartes, bouton d'envoi | 14 : E03-E07, E11, E12, E14, E15, E17-E19, E25, E27 |
| `#8A7F70` sur crème `#F2EDE3` | **3,36:1** | 12 px mono | Ligne d'aide sous « Envoyer ma journée » : « LE POINTAGE EN COURS NE PART PAS », « MOIS CLÔTURÉ · DEMANDE À LA SECRÉTAIRE DE ROUVRIR », « HORS-LIGNE · L'ENVOI ATTEND LE RÉSEAU » | 14 : E02-E07, E11, E12, E14-E19 |
| `#8A6A00` sur crème | 4,35:1 | 12 px mono | Titres de section (CHANTIERS DU JOUR, PRÉVU AUJOURD'HUI, MES HEURES) | 12 |
| Jour « rien de prévu » (opacité .45) | 3,91:1 | 12 et 16 px | Bande des jours | 13 |
| Blanc sur rouge `#E53935` | 4,23:1 | 12 px gras, 16 px gras | SORTIE OUBLIÉE, ↺, badge « 2 à voir », bouton « Supprimer » | E14, E18, E26, AS4 |
| `#8A7F70` sur `#EFE9DE` | 3,25:1 | 12,5 px | Ville et heures de la carte RETIRÉ | E12 |
| `#B35F41` sur `#FFE1CC` | 3,64:1 | 12 px | Libellé « PAUSES » (opacité .75) | E05, E14 |
| `#8A7F70` sur blanc | 3,92:1 | 16 px | Texte d'aide du champ « Votre question… » | AS1, AS3 |
| **État verrouillé (opacité .5 sur la tuile)** | **2,26 à 3,63:1** | 12 et 14 px | « TOTAL », « PAUSES », « PANIER ✓ Pris » (jaune clair sur gris) | E16 (bouton « + » à l'opacité .35 : 2,33:1) |
| « Envoyer ma journée → » grisé | 2,91:1 | 16 px gras | Bouton d'envoi inactif | E02, E03, E16 |
| `#B5A994` sur `#FFFDF8` | 2,28:1 | 16 px | Chevron « › » des listes | E26, AS1 |

Remplacements les plus proches (ratio ≥ 4,5:1) :
- Blanc sur vert : **garder `#2FA36B` et passer le texte à l'encre `#15120F` (5,84:1)** ; sinon assombrir le vert jusqu'à `#0A8853` (blanc 4,5:1), ce qui l'amène à 4,14:1 sur le noir.
- Blanc sur rouge : `#E53935` → `#DF3331` (4,51:1), soit `--destructive: 1 73% 53%`.
- `#8A7F70` ne peut pas servir de texte (il faudrait `#6B6153`, presque `--dz-texte-2`) : utiliser `--dz-texte-2` `#5B534A` (6,47:1 sur la crème) pour la ligne d'aide, la ville et les heures retirées.
- `#8A6A00` → `#876700` (4,53:1).
- États atténués : l'opacité minimale qui passe est .77 pour un libellé de 12 px et .57 pour une valeur, et .54 pour « rien de prévu » ; mieux vaut un jeton de couleur par état qu'une opacité.

### 4.3 Texte d'action sous 16 px

- **QR** : bouton de 56 × 56 px, texte à **12 px**, sur 24 écrans (barre du pouce). Le README §8 range les boutons à 16 px.
- **FR·TR** : bouton de dictée 48 × 48, texte à 12 px (AS1, AS2, AS3, AS8).
- **✕** de fermeture de feuille : 15 px, cible 44 × 44 (11 écrans : E08-E10, E13, E20-E24, AS6, AS7).
- Avatar SG : 13 px, cible 44 × 44 (29 écrans).
- Tuile « Pauses · 1 à préciser ↓ » : 14 px, alors que c'est une action (fait défiler vers le trou).
- Cases : voir §4.4.

### 4.4 Cibles tactiles

Valeurs mesurées, comparées à ce que le README annonce :

| Élément | Annoncé | Mesuré à 370 px | À 360 px |
|---|---|---|---|
| `+`, `QR`, « Envoyer ma journée » | 56 | 56 × 56, 56 × 56, 214 × 56 | idem |
| Onglets du bas | 44 | 82,5 × 44 | 80 × 44 |
| Cellule de jour de la bande | non dit | 45,4 × 60 | **44,0 × 60** (limite : en dessous de 360 px elle passerait sous 44) |
| Tuiles Total / Pauses / Panier | 64 | 97-116,5 × 64 | idem |
| Boutons de feuille (OK, Annuler…) | 48 | 52 de haut | idem |
| **Case à cocher d'une tâche (S8)** | « Case 44 px » (README §3, ligne S8) | **26 × 26** dans une ligne de 44 px | idem |
| **CTA de la note d'en-tête** « Ouvrir › » / « Relancer » | 16 px | **58,3 × 20,8** et **72,4 × 20,8**, sans cadre ni marge (E05, E19, AS7) | idem |
| Pastille de l'assistant (AS7) : « Reprendre » | 16 px | 114,5 × 44 (la pastille ✦ de 36 × 36 est décorative) | idem |

Les cases et les CTA nus sont les seules cibles sous 44 px. Le dessin ne dit pas si la ligne entière (tâche) ou la note entière (bandeau) est la cible ; sinon la surface est de 26 × 26 ou de 58 × 21 px, pour des gants.

Boutons **principaux dessinés à 44 px au lieu de 48** (§2.8 : « 48 pour les boutons principaux ») : « Tout confirmer » et « Ignorer » (AS3), « Corriger », « Envoyer » et « + Ajouter des heures pour Alex » (E27), « Tout effacer » (AS4, destructif), « Déconnexion » (E26), « Annuler » et « Modifier » (AS2, AS8), « Réessayer » (E02). Le modèle des boutons de feuille est lui à 52.

Latent, hors des écrans dessinés : l'action des retours passagers (toast) est codée à 40 px de haut dans le gabarit (`planche.dc.html:333`) alors que « Réserve levée · Annuler » (S61) n'est pas dessiné.

### 4.5 Repli, coupure, masquage

- **L'étiquette d'état pousse le nom à la ligne** (la crainte notée par le designer). Dans la planche même : E27, « Résidence Test » sur **2 lignes** à côté de « ▣ CHEZ LE COMPTABLE » (étiquette de 169 px sur 310 de large utile). Essai avec de vrais noms (même carte, même police, 16 px gras) :

  | Étiquette (largeur) | planche | 27 car. | 38 car. | 52 car. |
  |---|---|---|---|---|
  | À ENVOYER (87 px) | 1 ligne | 2 | 2 | 2 |
  | ENVOYÉ ✓ (79) | 1 | 2 | 2 | 2 |
  | ▣ CHEZ LE COMPTABLE (169) | **2** | 3 | 3 | **4** |
  | SUR LE TÉLÉPHONE (145) | 1 | 2 | 3 | **4** |
  | EN COURS · ⧉ 2 (130) | 1 | 2 | 3 | **4** |
  | SORTIE OUBLIÉE (128) | 1 | 2 | 3 | **4** |
  | CHEVAUCHEMENT (120) | 1 | 2 | 3 | **4** |

  (écran de 360 px ; à 390 px : 4 lignes pour « ▣ CHEZ LE COMPTABLE » et 3 pour les autres étiquettes longues à 52 caractères ; à 370 px, entre les deux.) Dès 27 caractères (« Résidence Les Hauts de Bron »), toute carte tient sur au moins 2 lignes, même avec l'étiquette la plus courte. Capture 08.
- **Puces et tuiles repliées** : E05, « 2 formations à voir › » sur 2 lignes avec le « › » seul (chip de 169 px) ; E05 et E14, « 1 à préciser ↓ » sur 2 lignes avec la flèche seule, texte qui descend à 6 px du bord de la tuile au lieu de 10 ; AS2, trois puces de réponse (« Villa Exemple », « Résidence Test », « Autre chantier ») sur 2 lignes chacune.
- **Ligne d'aide sur 2 lignes** : E07, E16, E19 (la barre du bas passe de 155 à 171 px).
- **En-tête** : 170 px sans note, **226 px avec une note d'une ligne** (E05, E06, AS7), **232 px** avec une note de deux lignes (E19), 182 px (E25, titre sur 2 lignes). Le README §10 annonce « hauteur fixe ~176 px avec la bande » : vrai sans note seulement.
- **Barre du bas** : 155 px (171 avec une aide sur 2 lignes), contre « ~150 px de réserve » (README §10).
- **Pastille de l'assistant (AS7)** : le texte résumé de l'assistant n'est visible qu'à 58 % de sa longueur : « « après-midi 13h-16h3… » ; on lit **16h3 au lieu de 16h30**, c'est précisément la donnée à vérifier avant « Reprendre ». Le libellé « ASSISTANT · EN ATTENTE » passe sur 2 lignes (101 px de large). La pastille recouvre « AUJOURD'HUI » et les lettres de la bande des jours (le README dit qu'elle « ne cache aucun champ », ce qui est vrai des champs du formulaire seulement). Capture 05.
- **Écrans E04 et E05 : le contenu censé prouver les lignes S n'est pas visible.** E05 : 6 blocs sur 10 sous la barre du bas ou hors du cadre (443 px visibles sur 1 119 de contenu) : le premier chantier, la rangée Route / Pause (S31), la carte « en cours », la carte de réunion (S6) et la liste de tâches (S7, S8) ne se voient pas ; le titre « CHANTIERS DU JOUR » est coupé de 3 px par la barre. E04 : « Terminé le 15 octobre 2026 » (S9) est entièrement sous la barre, l'encadré « Ne partira pas » (S4) est masqué à 19 %. Le README coche pourtant S6, S7, S8, S31 sur E05 et S4, S9 sur E04. Capture 01.
- **E12** : le retour passager « Journée envoyée » est posé à 170 px du bas, il recouvre le titre de la carte RETIRÉ (S28) : la preuve de la ligne retirée est cachée par l'élément que le dessin montre au-dessus. Capture 06.
- **Feuille de l'éditeur (E21)** : contenu de 770 px dans une feuille plafonnée à 90 % (742 px). À 370 × 824, « Retirer cette intervention » **dépasse le bas de l'écran de 5 px** et la marge basse de 24 px a disparu ; à 390 × 844, 10 px de marge rognés ; à 360 × 780, « Retirer » est entièrement hors de la feuille et « Documents (2) » coupé de 25 px (109 px rognés) ; à **360 × 640, « OK », « Documents (2) » et « Retirer » sont tous hors de la feuille** (235 px rognés). Aucune zone défilante ni pied de feuille fixe n'est dessiné (le `DialogContent` actuel défile : `ui/dialog.tsx:41`, `overflow-y-auto`, mais alors « OK » est sous le pli). Capture 04.
- **Semaine (E25) à 360 px** : « Maison Démo · Villa Exemple » est tronqué avec des points de suspension (2 lignes de jour) ; à 370 px il tient.
- Aucun texte chevauché sur les 39 écrans, aux 4 largeurs.

### 4.6 Mini-frise : la règle d'échelle est respectée, le repère de graduation ne suit pas l'heure qu'il nomme

Les 3 graduations sont posées en `justify-content: space-between`, donc à 0 %, 50 % et 100 % quelle que soit l'heure écrite. Mesure de la position réelle du repère du milieu :

| Cas | Axe | Repère écrit | Position du repère | Position de l'heure | Écart |
|---|---|---|---|---|---|
| Journée ordinaire | 6h · 12h · 18h | 12h | 48,9 % | 50,0 % | −8 min |
| **Poste de nuit** | 20h · **minuit** · 7h | **minuit** | **51,1 %** | **36,4 %** | **+97 min** |
| **Journée sans ligne** | 8h · 13h · 17h | 13h | 48,9 % | 55,6 % | **−36 min** |
| Chevauchement | 6h · 11h · 16h | 11h | 48,9 % | 50,0 % | −6 min |
| E05, E11, E12 | 6h · 12h · 18h ou 6h · 11h · 16h | | 48,9 % | 50,0 % | −7 à −8 min |

Dans le cas de nuit, le repère « minuit » est écrit sous l'intervalle qui sépare les deux blocs (01:00 à 01:30), pas à minuit : le bloc noir 21:00-01:00 s'arrête visuellement **avant** le mot « minuit » alors qu'il le dépasse d'une heure. Le texte du README (« repère « minuit » au milieu ») décrit la position du dessin, qui est fausse. Pour l'axe sans ligne, 13h est le milieu arrondi à l'heure de 12h30. Hauteur de la piste : 18 px, 9 px par voie en cas de chevauchement ; la zone hachurée d'un chevauchement de 30 min fait 16 px de large sur 316 (à 5 min elle ferait 2,6 px : seule la phrase d'erreur porte l'information). Capture 07.

### 4.7 Ce qui reste de la zone de contenu à 360 × 640 (cible de §2.8, non dessinée)

| Écran | En-tête | Barre du bas | Zone de contenu visible | Part du cadre fixe |
|---|---|---|---|---|
| E03, E04 (sans note) | 170 | 155 | **315 px** | 51 % |
| E05 (note d'une ligne) | 226 | 155 | **259 px** | 60 % |
| E19 (note de 2 lignes, aide sur 2 lignes) | 232 | 171 | **237 px** | 63 % |

À 360 × 640 : E05 ne montre que les rappels et la carte de pointage (le bas de la carte est coupé de 9 px) ; 9 blocs sur 10 sont sous la barre. « Envoyer ce qui reste (2) » et « Journée déjà envoyée » passent sur 2 lignes, « POINTAGE EN COURS · DEPUIS 12:30 » aussi.

### 4.8 Captures

Dossier `docs/design-brief/audit-salarie/captures/` (rendu à 1,5×, les six premières sont les pires écrans par nombre de violations chiffrées). Toutes ont été ouvertes et relues.

| Fichier | Ce que l'image confirme |
|---|---|
| `01-E05-contenu-masque-et-cibles-nues.png` | Titre « CHANTIERS DU JOUR » coupé par la barre, plus aucune carte visible ; « Ouvrir › » sans cadre ; « 2 formations à voir › » sur 2 lignes avec « › » orphelin ; « 1 à préciser ↓ » sur 2 lignes, flèche contre le bord de la tuile |
| `02-E16-contrastes-et-etats-attenues.png` | Tuiles verrouillées délavées (2,26 à 3,63:1), « PANIER ✓ Pris » jaune clair sur gris, bouton d'envoi grisé, ligne d'aide sur 2 lignes |
| `03-E27-etiquette-pousse-le-nom.png` | « Résidence Test » sur 2 lignes à côté de « ▣ CHEZ LE COMPTABLE » ; bande orange d'après-midi identique au liseré « À ENVOYER » |
| `04-E21-feuille-coupee-360x640.png` | À 360 × 640 la feuille s'arrête en plein texte d'aide : ni « OK », ni « Documents », ni « Retirer » |
| `05-AS7-pastille-heures-tronquees.png` | « 16h3… », libellé sur 2 lignes, pastille sur les lettres de la bande |
| `06-E12-vert-blanc-3-2-et-toast-sur-carte.png` | Textes blancs sur vert (3,20:1) partout, retour passager sur la carte RETIRÉ |
| `07-detail-frise-4-cas-minuit-mal-place.png` | « minuit » sous l'espace entre les deux blocs, « 13h » à gauche de l'heure réelle |
| `08-stress-E16-nom-de-38-caracteres-360px.png` | Nom de 38 caractères sur 3 lignes à côté de « CHEZ LE COMPTABLE » à 360 px |

## 5. Problèmes, par gravité

Gravité : **bloquant** = un test du dépôt échoue ou une règle dure du dossier est violée ; **important** = défaut mesuré à corriger avant l'intégration ; **mineur** = à noter.

### Bloquants

1. **Matin / soir indiscernables pour `test:creneaux`.**
   Preuve : `--dz-matin` `#DDEBFA` et `--dz-soir` `#E8DCF6` : ΔE 11,22 pour 15 exigé (`day-part.test.ts:103`). Avant retouche : 19,1. La retouche du soir (ΔE 7,0) est la cause.
   Demande : remplacer `--dz-soir` par `#EAD6F4` (ΔE 15,02, mesuré), ou `--dz-matin` par `#D8EFFA`, ou les deux par `#D9ECF9` et `#E9D9F5` ; refaire passer `npm run test:creneaux`.
2. **Bordure de réunion trop claire pour `test:missions`, et pour la lecture.**
   Preuve : `--dz-reunion-trait` `#D6457A` sur `#FBE0EA` = 3,40:1 pour 4,5 (`missions.test.ts:232`) ; avant : 5,39:1. Le bord est une **couleur de texte** dans le code (heure de réunion : `missions-worker.tsx:23`, `poseur-week.tsx:228`).
   Demande : `#B7366A` (4,52:1, reste dans l'épinglage 8-12 du test) ou `#BE2D67` (4,51:1), et distinguer dans les jetons le trait décoratif (clair, la bande de la carte) du texte de réunion (foncé). Si le fond de réunion est gardé à `#FBE0EA`, son écart à la pastille d'initiales tombe à 3,43 (épinglé 4-6) : `#FFE2EC` le ramène à 4,54.

### Importants

3. **Portée : les fenêtres Radix n'ont aucun jeton.**
   Preuve : mesure navigateur, contenu `.bt-skin` seul : `--dz-jaune` et `--dz-carte` non définis ; `.dz-salarie .bt-skin` ne peut pas atteindre un portail dans `<body>` ; 11 écrans de feuille concernés ; `ui/dialog.tsx:24` voile `bg-black/80` non scopable.
   Demande : ajouter `.bt-skin` seul à la liste des sélecteurs du bloc de jetons de fenêtre, ou écrire dans le README que chaque `DialogContent` salarié porte `dz-salarie`, et lister voile (50 %), rayon, liseré et ombre comme jetons.
4. **Contrastes insuffisants sur 20 écrans.**
   Preuve : §4.2 ; blanc sur `#2FA36B` 3,20:1 (14 écrans), ligne d'aide sous l'envoi `#8A7F70` sur crème 3,36:1 (14 écrans), titres de section 4,35:1 (12), état verrouillé 2,26 à 3,63:1 (E16), blanc sur `#E53935` 4,23:1.
   Demande : texte `#15120F` sur `#2FA36B` ; ligne d'aide en `--dz-texte-2` ; `#8A6A00` → `#876700` ; `--dz-erreur` `#DF3331` pour porter du blanc ; états atténués par jetons de couleur (opacité ≥ .77 pour un libellé de 12 px).
5. **Focus invisible sur les fonds sombres.**
   Preuve : `--ring: 30 17% 7%` = `#15120F` : 1,00:1 sur l'en-tête (boutons ✦ et avatar) et sur la carte de pointage ; le dépôt a un anneau jaune (11,54:1 sur noir).
   Demande : un anneau à deux couleurs ou une variante claire sur les surfaces sombres (`--dz-ring-sur-noir`).
6. **Rouge destructif sous 4,5:1 avec du texte blanc.**
   Preuve : `1 77% 56%` = `#E53B38`, blanc dessus 4,19:1 (4,80:1 aujourd'hui) ; bouton « Supprimer » d'AS4.
   Demande : `--destructive: 1 73% 53%` (`#DF3331`, 4,51:1).
7. **E04 et E05 ne montrent pas ce qu'ils déclarent couvrir.**
   Preuve : E05, 6 blocs sur 10 sous la barre (443 px visibles sur 1 119) : S6, S7, S8 et S31 invisibles ; E04, S9 entièrement sous la barre, S4 masqué à 19 %.
   Demande : un état défilé de E05 (bas de page) et E04, ou une hauteur de cadre qui montre ces blocs.
8. **Étiquette d'état qui pousse le nom du chantier.**
   Preuve : E27, « Résidence Test » sur 2 lignes (14 caractères) ; à 360 px avec 38 caractères : 3 lignes pour 5 étiquettes sur 12, et 4 lignes avec 52 caractères pour ces mêmes cinq (« ▣ CHEZ LE COMPTABLE », « SUR LE TÉLÉPHONE », « EN COURS · ⧉ 2 », « SORTIE OUBLIÉE », « CHEVAUCHEMENT »).
   Demande : placer l'étiquette sur sa propre ligne (au-dessus du nom ou sous l'heure) et fixer la règle du nom (2 lignes maximum puis points de suspension) ; dessiner un nom de 40 caractères sur E16 et E27.
9. **Mini-frise : repère « minuit » à la mauvaise place.**
   Preuve : repère à 51,1 % de l'axe, minuit à 36,4 % (97 min d'écart) ; « 13h » du cas sans ligne à 48,9 % pour 55,6 % (36 min).
   Demande : positionner chaque graduation à l'abscisse de son heure (position absolue en %), ou n'écrire que des graduations alignées sur l'axe.
10. **Feuille E21 : bouton « OK » hors de la feuille à 360 × 640.**
    Preuve : « Retirer » dépasse l'écran de 5 px à 370 × 824 ; 109 px rognés à 360 × 780 (« Retirer » hors de la feuille), 235 px à 360 × 640 (« OK » hors de la feuille) ; aucun défilement dessiné.
    Demande : dessiner la feuille à 360 × 640 avec une zone défilante et un pied fixe contenant « OK » ; marge basse avec `env(safe-area-inset-bottom)`.
11. **Zone de contenu trop courte à 360 × 640.**
    Preuve : en-tête 226 px et barre 155 px = 60 % de l'écran ; 259 px visibles sur E05 (237 sur E19).
    Demande : dessiner E05 à 360 × 640 ; dire si la bande des jours ou la note d'en-tête se replie (le README §10 supprime le repli de l'en-tête) ; reprendre « ~176 px » et « ~150 px » du README (mesures : 170 à 232 et 155 à 171).
12. **Pastille de l'assistant : heures tronquées et bande recouverte.**
    Preuve : « 16h3… » (58 % du texte visible), libellé sur 2 lignes, pastille sur les lettres de la bande.
    Demande : résumé sur 2 lignes sans coupure d'heure, ou résumé court fixe (« Intervention 13:00 → 16:30 ») ; pastille posée sous la bande.
13. **Teintes de chantier absentes, couleurs de créneau et de réunion réutilisées pour les chantiers.**
    Preuve : aucune entrée `CHANTIER_PALETTES` ; E22 : `#4A8FE0` (= matin), `#D6457A` (= réunion), `#C0392B` (hors jetons).
    Demande : 7 couleurs de chantier (`bar`, `tagBg`, `tagText`) en hexadécimal ; dire si la bande de gauche des cartes est le créneau ou le chantier (dans le code : le chantier ; la réunion n'a pas de barre).
14. **Collisions de teintes non testées.**
    Preuve : après-midi `#FCE3CF` / « À ENVOYER » `#FFE1CC` : ΔE 2,1, même trait `#EE8A43` ; réunion / maladie 6,7-7,9 ; matin / intempérie 4,1.
    Demande : séparer le trait d'après-midi du trait « à envoyer » ; éloigner réunion et maladie ; viser ΔE ≥ 10 sur ces paires comme sur les autres.
15. **Absences : « repos » manquant, motif à 135° au lieu de 45°, teintes différentes de celles de la borne.**
    Preuve : `tokens.css:66-68` (3 types) contre `admin-planning.tsx:529-534` (4 types) et `kiosk-week-grid.tsx:28`.
    Demande : fournir `repos`, dire si l'angle et les teintes remplacent aussi bureau et borne (lot 9 : la borne reste identique au bureau).
16. **Encre secondaire non fournie, et contradictoire.**
    Preuve : commentaire `tokens.css:61` `#15120F` ; planche : sous-lignes en `#5B534A` ; code `#57524A` (`day-part.ts:58`).
    Demande : une seule valeur de `DAY_PART_INK` ; proposition `#5B534A` (5,75 à 6,23:1 sur les teintes).
17. **`tokens.css` contredit la règle des 12 px et ne décrit pas toutes les tailles.**
    Preuve : `--dz-fs-xs: 10.5px` (ligne 73), pas de jeton 12 px, 12 tailles de la planche hors jetons.
    Demande : `--dz-fs-xs: 12px` et une échelle qui contient les tailles réellement utilisées (13, 14, 15, 19, 24, 26).
18. **Cibles : case à cocher et CTA de note nus.**
    Preuve : case 26 × 26 (README S8 : « Case 44 px ») ; « Ouvrir › » 58,3 × 20,8, « Relancer » 72,4 × 20,8.
    Demande : dessiner la zone de toucher (ligne entière pour la tâche, note entière ou bouton de 44 px pour le CTA).
19. **Boutons principaux à 44 px.**
    Preuve : « Tout confirmer », « Tout effacer », « Envoyer » (E27), « Déconnexion », « Réessayer » à 44 px (§4.4).
    Demande : 48 px pour les boutons principaux et destructifs.
20. **Actions à 12 px.**
    Preuve : « QR » (24 écrans) et « FR·TR » (4 écrans) à 12 px ; ✕ à 15 px (11 écrans).
    Demande : 16 px, ou une icône sans texte avec nom accessible.
21. **Les maquettes n'utilisent pas les jetons.**
    Preuve : 0 `var(--…)`, 0 classe `dz-` ; 15 hexadécimaux absents (dont `#FF6B6B` ×4 alors que le jeton est `#FF6B3D`), 12 tailles, 9 rayons et 7 espacements hors échelle.
    Demande : ajouter les couleurs manquantes au fichier (ou les remplacer par un jeton) et livrer le TSX qui consomme les jetons.
22. **Aucun composant TSX livré.**
    Preuve : 5 fichiers dans le dossier ; `integration-technique` §2.1-2.3 attend `components/design/…`.
    Demande : livrer les composants du README §5, ou confirmer qu'ils sont à écrire côté dépôt.

### Mineurs

23. Triplets HSL qui ne donnent pas l'hexadécimal annoncé (7 lignes, jusqu'à 6 unités RVB) : un seul format source.
24. `--radius: 16px` donne 14 px aux boutons et champs shadcn, 12 px dans le dossier : fournir `rounded-md` et `rounded-sm` voulus.
25. E12 : le retour passager recouvre la carte RETIRÉ (S28) ; dessiner la carte retirée seule.
26. Pulsation `bxPulse` définie mais jamais appliquée, jeton à 1 400 ms pour 1,6 s dans le code.
27. Cadre « 390 × 844 » = écran de 370 × 824 : les maquettes sont plus étroites de 20 px que ce que le README annonce.
28. AS2 : trois puces de réponse sur 2 lignes ; E05 : « 2 formations à voir › » sur 2 lignes avec « › » orphelin ; tuile « 1 à préciser ↓ » sur 2 lignes.
29. Croix de 16 px intégrée au `DialogContent` (`ui/dialog.tsx:47`) en doublon de la croix de 44 px dessinée.
30. JetBrains Mono demandé en 800 et 900 (fichiers 400, 500, 700).
31. Triplets `--success`, `--warning`, `--orange` et palette `--chip-*` de `globals.css` non redéfinis sous `.dz-salarie`.

## 6. Reproductibilité

Les scripts sont dans le dossier temporaire de la session, `…/scratchpad/audit02/scripts/` : `harness.mjs` (rendu hors réseau), `inpage.js` (mesure d'un écran), `run-mesures.mjs` (4 largeurs), `tests-teintes.mjs` (42 contrôles), `stress-noms.mjs`, `frise.mjs`, `captures.mjs`. Les copies de test sont dans `…/scratchpad/audit02/repo-copy` (valeurs du dépôt), `repo-tokens` (valeurs du dossier), `repo-corrige-final` (soir `#EAD6F4`, bord `#B7366A`, fond `#FFE2EC`), `repo-corrige-bord`, `repo-corrige-matin`, `repo-corrige-soir`, `repo-corrige-conjoint` et `repo-min` (variantes de remplacement). Scripts de recherche des remplacements : `remplacements.mjs`, `remplacements2.mjs`, `remplacements-texte.mjs`. Commandes : `npx -y deno@2 test supabase/functions/_shared/day-part.test.ts` et `… test --allow-read supabase/functions/_shared/missions.test.ts` depuis chacune de ces copies. Les formules de contraste (WCAG 2.x) et d'écart (CIE76) sont celles des fichiers de test.
