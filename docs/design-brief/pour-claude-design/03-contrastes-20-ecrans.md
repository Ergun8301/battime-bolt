# 03 · Contrastes : les 20 écrans sous 4,5:1, les 2 tests de teinte en échec, les teintes manquantes

Source unique : `audit-salarie/02-jetons-et-mesures.md` (§3 et §4, mesures du 15/10/2026 sur les 39 écrans de la planche, cadre dessiné 370 × 824, 1 489 nœuds de texte). Rien n'a été remesuré. Méthode : contraste WCAG 2.x calculé sur les pixels réellement composés (fond remonté jusqu'à la racine, opacités de groupe comprises) ; seuil 4,5:1 (3:1 pour le texte large : 24 px, ou 18,66 px en gras). « Nœud » = un texte visible sous le seuil. Total : **20 écrans sur 39, 94 nœuds, pire cas 2,26:1 (E16)**. Les 19 autres écrans (E01, E08, E09, E10, E13, E20 à E24, E28, P01 à P03, AS2, AS5 à AS8) n'ont aucun nœud sous le seuil.

## A. Les 20 écrans

| Écran | Nom | Nœuds | Pire ratio | Texte / couleurs fautives (couples du §B) | Cause probable (jeton) |
|---|---|---|---|---|---|
| E02 | Échec de chargement | 2 | 2,91:1 | « Envoyer ma journée → » grisé (2,91) ; ligne d'aide sous l'envoi (3,36) | Bouton inactif en opacité ; `--dz-texte-3` en texte |
| E03 | Journée vide | 5 | 2,91:1 | Envoyer grisé (2,91) ; ligne d'aide (3,36) ; blanc sur vert (3,20) ; jours « rien de prévu » (3,91) probable | Opacité de l'état inactif ; `--dz-texte-3` ; `--dz-en-cours` / `--dz-envoye-pastille` avec texte blanc |
| E04 | Planifiée, rien saisi | 5 | 3,20:1 | Blanc sur vert (coche de la bande) ; ligne d'aide (3,36) ; titres de section (4,35) ; jour « rien de prévu » (3,91) | `--dz-envoye-pastille` ; `--dz-texte-3` ; titre de section `#8A6A00` (hors jetons) ; opacité .45 |
| E05 | En cours · écran principal | 6 | 3,20:1 | Blanc sur vert (EN COURS, coche) ; ligne d'aide (3,36) ; libellé « PAUSES » `#B35F41` sur `#FFE1CC` (3,64) ; titres de section (4,35) ; « rien de prévu » (3,91) | `--dz-en-cours` ; `--dz-texte-3` ; opacité .75 sur le libellé PAUSES ; `#8A6A00` |
| E06 | Hors-ligne | 5 | 3,20:1 | Blanc sur vert ; ligne d'aide « HORS-LIGNE · L'ENVOI ATTEND LE RÉSEAU » (3,36) ; titres (4,35) ; « rien de prévu » | idem E04 |
| E07 | Retour du réseau | 5 | 3,20:1 | Blanc sur vert ; ligne d'aide (3,36) ; titres (4,35) ; « rien de prévu » | idem E04 |
| E11 | Arrêt · chevauchement | 5 | 3,20:1 | Blanc sur vert ; ligne d'aide (3,36) ; titres (4,35) ; « rien de prévu » | idem E04 |
| E12 | Journée envoyée | 9 | 3,20:1 | Blanc sur vert (ENVOYÉ ✓, bouton « Journée envoyée ✓ », coches) ; ville et heures de la carte RETIRÉ `#8A7F70` sur `#EFE9DE` (3,25) ; ligne d'aide (3,36) ; titres (4,35) | `--dz-envoye-pastille` ; `--dz-texte-3` sur le fond de carte retirée |
| E14 | Renvoyée par le bureau | 7 | 3,20:1 | Blanc sur vert ; blanc sur rouge `#E53935` (↺, 4,23) ; « PAUSES » `#B35F41` sur `#FFE1CC` (3,64) ; ligne d'aide (3,36) ; « rien de prévu » | `--dz-en-cours` ; `--dz-erreur` / `--dz-maintenant` avec texte blanc ; opacité .75 |
| E15 | Corrigée par le bureau | 7 | 3,20:1 | Blanc sur vert ; ligne d'aide (3,36) ; titres (4,35) ; « rien de prévu » | idem E04 |
| E16 | Verrouillée | 9 | **2,26:1** (pire de la planche) | Tuiles TOTAL, PAUSES, « PANIER ✓ Pris » en opacité .5 (2,26 à 3,63) ; bouton « + » à l'opacité .35 (2,33) ; envoyer grisé (2,91) ; ligne d'aide « MOIS CLÔTURÉ · DEMANDE À LA SECRÉTAIRE DE ROUVRIR » (3,36) | Pas de jeton d'état verrouillé : l'état est fait d'une **opacité** sur la tuile (jaune clair sur gris) |
| E17 | Pointage oublié | 4 | 3,20:1 | Blanc sur vert (bande) ; ligne d'aide (3,36) ; « rien de prévu » | `--dz-envoye-pastille` ; `--dz-texte-3` |
| E18 | Sortie oubliée à compléter | 6 | 3,20:1 | Blanc sur vert ; blanc sur rouge « SORTIE OUBLIÉE » (4,23) ; ligne d'aide (3,36) | `--dz-erreur` (`#E53935`) ; `--dz-envoye-pastille` ; `--dz-texte-3` |
| E19 | Transfert en échec | 4 | 3,20:1 | Blanc sur vert ; ligne d'aide sur 2 lignes (3,36) | idem E17 |
| E25 | Semaine | 5 | 3,20:1 | Blanc sur vert (jours envoyés) ; « rien de prévu » (3,91) ; titres de section (4,35) | `--dz-envoye-pastille` ; opacité .45 ; `#8A6A00` |
| E26 | Plus | 4 | 2,28:1 | Chevron « › » `#B5A994` sur `#FFFDF8` (2,28) ; badge « 2 à voir » blanc sur rouge (4,23) | Couleur du chevron hors jetons ; `--dz-erreur` avec texte blanc |
| E27 | Mon équipe (chef) | 1 | 3,20:1 | Blanc sur vert (ENVOYÉ ✓) | `--dz-envoye-pastille` |
| AS1 | Assistant · accueil | 3 | 2,28:1 | Chevron « › » `#B5A994` (2,28) ; texte d'aide du champ « Votre question… » `#8A7F70` sur blanc (3,92) | Chevron hors jetons ; `--dz-texte-3` en placeholder |
| AS3 | Assistant · à confirmer | 1 | 3,92:1 | Texte d'aide du champ `#8A7F70` sur blanc | `--dz-texte-3` |
| AS4 | Assistant · historique | 1 | 4,23:1 | « Supprimer » : blanc sur rouge `#E53935` | `--dz-erreur` / `--destructive` (`#E53B38` en HSL : 4,19) |

Les décomptes par écran viennent du tableau §4.1 de l'audit ; l'audit ne ventile pas les nœuds écran par écran. Les couples ci-dessus sont ceux que le §4.2 de l'audit rattache à l'écran par liste explicite (vert 14 écrans, aide 14 écrans, rouge 4 écrans, `#8A7F70` sur `#EFE9DE` : E12, PAUSES : E05 et E14, chevron : E26 et AS1, envoyer grisé : E02, E03, E16, `#8A7F70` sur blanc : AS1 et AS3). Les titres de section (4,35, 12 écrans) et « rien de prévu » (3,91, 13 écrans) ne sont **pas nommés écran par écran** dans l'audit : leur présence sur E03 à E07, E11, E14, E15, E17, E25 est déduite des totaux ; à vérifier au moment du correctif.

## B. Les couples fautifs, par cause

| Couple (texte / fond) | Ratio | Taille | Écrans | Remplacement vérifié (≥ 4,5:1) |
|---|---|---|---|---|
| Blanc sur vert `#2FA36B` | 3,20 | 12 px gras (étiquettes ENVOYÉ ✓, EN COURS, coche de la bande) ; 16 px gras (bouton « Journée envoyée ✓ ») | 14 : E03-E07, E11, E12, E14, E15, E17-E19, E25, E27 | Texte `#15120F` sur `#2FA36B` (5,84) ; ou vert `#0A8853` (blanc 4,5, mais 4,14 sur le noir) |
| `#8A7F70` (`--dz-texte-3`) sur crème `#F2EDE3` | 3,36 | 12 px mono, ligne d'aide sous l'envoi | 14 : E02-E07, E11, E12, E14-E19 | `--dz-texte-2` `#5B534A` (6,47) |
| `#8A6A00` sur crème | 4,35 | 12 px mono, titres de section | 12 | `#876700` (4,53) |
| Jour « rien de prévu » (opacité .45) | 3,91 | 12 et 16 px | 13 | Opacité ≥ .54, ou jeton de couleur dédié |
| Blanc sur rouge `#E53935` (`--dz-erreur`) | 4,23 | 12 px gras, 16 px gras | E14, E18, E26, AS4 | `#DF3331` (4,51) = `--destructive: 1 73% 53%` |
| `#8A7F70` sur `#EFE9DE` | 3,25 | 12,5 px | E12 | `#5B534A` |
| `#B35F41` sur `#FFE1CC` (« PAUSES », opacité .75) | 3,64 | 12 px | E05, E14 | Opacité ≥ .77 pour un libellé de 12 px |
| `#8A7F70` sur blanc | 3,92 | 16 px | AS1, AS3 | `#5B534A` |
| État verrouillé (opacité .5 sur la tuile) | 2,26 à 3,63 | 12 et 14 px ; « + » à .35 : 2,33 | E16 | Opacité ≥ .77 (libellé 12 px) ou ≥ .57 (valeur) : mieux, **un jeton de couleur par état** |
| « Envoyer ma journée → » grisé | 2,91 | 16 px gras | E02, E03, E16 | Jeton « inactif » lisible |
| `#B5A994` sur `#FFFDF8` (chevron « › ») | 2,28 | 16 px | E26, AS1 | `#5B534A`, ou icône avec contraste 3:1 si le chevron est décoratif |

Autres mesures de contraste hors texte (pas dans les 20 écrans, à corriger avec les mêmes jetons) : le focus `--ring: 30 17% 7%` (`#15120F`) vaut 1,00:1 sur l'en-tête noir et 1,05:1 sur la carte de pointage `#1B1713` (il faut un anneau clair sur fond sombre) ; la bande des 8 états contient la coche blanche sur vert (3,20), « rien de prévu » (3,91) et ↺ blanc sur rouge (4,23).

## C. Les 2 contrôles de couleur du dépôt en échec avec `tokens.css`

Commandes : `npm run test:creneaux` (`deno test supabase/functions/_shared/day-part.test.ts`) : 5/5 aujourd'hui, **4/5** avec le dossier. `npm run test:missions` (`…/missions.test.ts`) : 19/19 aujourd'hui, **17/19** avec le dossier. Les contrôles s'arrêtent au premier échec de chaque test ; l'audit a recalculé les 42 contrôles sans s'arrêter.

| # | Test (fichier:ligne) | Mesuré avec le dossier | **Valeur minimale exigée** | Jeton fautif | Cause |
|---|---|---|---|---|---|
| 1 | `day-part.test.ts:103`, « teintes distinctes entre elles » : matin / soir | ΔE 11,22 (avant retouche : 19,1) | **ΔE ≥ 15** | `--dz-soir` `#E8DCF6` (code actuel `#DFCCEE`, retouche de ΔE 7,0) avec `--dz-matin` `#DDEBFA` | Le soir a été éclairci vers le matin |
| 2 | `missions.test.ts:232`, « réunion : couleur lisible… » : bordure sur fond de réunion | 3,40:1 (avant : 5,39:1) | **≥ 4,5:1** | `--dz-reunion-trait` `#D6457A` sur `--dz-reunion` `#FBE0EA` | Le bord sert de **couleur de texte** (heure de réunion : `missions-worker.tsx:23`, `poseur-week.tsx:228` et `:345`, `missions-office.tsx:90`) ; ne peut pas être une teinte vive décorative |

Le test `missions` échoue en plus sur un contrôle de valeur épinglée (`missions.test.ts:255`, « réunion : jamais prise pour un chantier… ») : bord / barre de chantier la plus proche ΔE 19,2 (épinglé entre 8 et 12) ; le dépôt compte donc **3 tests rouges sur 2 commandes**. Il n'est pas une régression de dessin mais s'éteint avec le bord corrigé ci-dessous. Après correctif du bord, un 4e contrôle épinglé (fond de réunion / pastille d'initiales la plus proche) tombe à ΔE 3,43 pour un épinglage 4 à 6, tant que le fond reste `#FBE0EA`.

Contrôles qui passent mais avec peu de marge (ne pas les dégrader) : après-midi / jour courant `#FFF6DB` ΔE 8,63 pour 8 ; réunion / soir ΔE 10,16 pour 10.

Valeurs de remplacement les plus proches qui font passer (recherche exhaustive RVB, rejouées sur une copie du dépôt) :

| Échec | Remplacement | Résultat |
|---|---|---|
| Matin / soir | `--dz-soir` **`#EAD6F4`** (matin / soir 15,02 ; réunion / soir 11,32) | `test:creneaux` 5/5 |
| idem, en bougeant le matin | `--dz-matin` `#D8EFFA` (15,01) | 5/5 |
| idem, en bougeant les deux | `#D9ECF9` et `#E9D9F5` (15,05) | 5/5 |
| Bordure de réunion | **`#B7366A`** (4,52:1, ΔE 10,93 de la barre de chantier la plus proche, reste dans l'épinglage) ; ou `#BE2D67` (4,51:1, laisse l'épinglage rouge à ΔE 16,1) | contraste et épinglage « bord / barre » passent |
| Fond de réunion trop proche de la pastille d'initiales | `--dz-reunion` `#FFE2EC` (4,54 ; ΔE 11,81 du créneau le plus proche) | `test:missions` 19/19 avec les trois valeurs |

En ne remplaçant que ce qui échoue (`#EAD6F4` et `#B7366A`, fond `#FBE0EA` gardé) : `test:creneaux` 5/5, `test:missions` garde un seul rouge, l'épinglage fond / pastille (3,4 pour 4 à 6), à ré-épingler côté dépôt. Il faut aussi, dans les jetons, **distinguer le trait décoratif de réunion (clair) du texte de réunion (foncé)**.

## D. Teintes et jetons manquants

| Manque | Détail | Où le code le lit | Demande |
|---|---|---|---|
| **Teintes de chantier** | Aucune des 7 entrées `CHANTIER_PALETTES` (`bar`, `tagBg`, `tagText`) n'est dans `tokens.css`. L'écran E22 réutilise `#4A8FE0` (= trait du matin), `#D6457A` (= trait de réunion) et `#C0392B` (hors jetons) comme couleurs de chantier | `planning-bubble.tsx:15-23` ; barre à gauche de la bulle = chantier (`:67`) ; la réunion n'a volontairement **pas** de barre (`missions.ts:144-146`) | 7 couleurs en hexadécimal, ≥ ΔE 25 du fond de réunion (test existant) ; dire si la bande de gauche des cartes est le créneau ou le chantier |
| **Encre secondaire** `DAY_PART_INK` | Commentaire de `tokens.css:61` : `#15120F` ; la planche dessine les sous-lignes en `#5B534A` ; le code a `#57524A` | `day-part.ts:58` ; règle `MEETING_TINT.ink === DAY_PART_INK` | Une seule valeur ; proposition `#5B534A` (5,75 / 6,12 / 6,23 / 6,10:1 sur matin, après-midi, soir, réunion) |
| **Absence « repos »** | `tokens.css:66-68` définit congé, maladie, intempérie ; manque « repos » (lettre R de la bande). Motif à 135° contre 45° dans le code ; teintes différentes (ΔE 2,7 à 8,2) | `admin-planning.tsx:529-534`, `kiosk-week-grid.tsx:28` (la borne doit rester identique au bureau) | Fournir `repos` ; dire si angle et teintes remplacent aussi bureau et borne |
| **Case verte** `#EEF9F2` | Lue par les deux tests de teinte, absente des jetons | `day-part.test.ts` et `missions.test.ts` (contrôles 13, 17, 21, 31 des 42) | L'ajouter |
| **Constantes de test d'absence et de badge** | `#E7E1D5` (absence) et `#EFEAE0` (badge envoyé) servent de repères aux tests ; le dossier a d'autres valeurs (congé `#EFE6D2` / `#E4D6B8`) | `missions.test.ts` (contrôles 32, 33) | Garder ces deux teintes ou fournir les remplacements |
| **Anneau de focus sur fond sombre** | `--ring` = `#15120F` : invisible sur noir (1,00:1) | `.bt-skin` actuel : jaune `43 100% 55%` (11,54:1 sur noir) | Variante claire (`--dz-ring-sur-noir`) ou anneau à deux couleurs |
| **Texte blanc sur vert / rouge** | `#2FA36B` et `#E53935` ne portent pas du blanc à 4,5:1 | voir §B | Texte `#15120F` sur le vert ; rouge `#DF3331` (`--destructive: 1 73% 53%`) |
| **Couleurs d'écran absentes du fichier** | 15 hexadécimaux de la planche hors jetons : `#3A332B` ×4, `#EFE7D9` ×4, `#FF6B6B` ×4 (le jeton est `--dz-oubli: #FF6B3D`), `#8A6A00` ×2, `#3A3129` ×2, `#2A241E`, `#5C4300` ×2, `#6B4E00`, `#7A2A22`, `#F0B8AE`, `#C0392B`, `#B5A994`, `#F3ECE0`, + `#E9E2D4` et `#B88A00` (mise en page de la planche) | – | Les ajouter ou les remplacer par un jeton |
| **Jetons pour les états atténués** | États verrouillé, inactif, « rien de prévu » faits d'opacités .35 à .5 | – | Une couleur par état plutôt qu'une opacité |
| **Collisions de teintes non testées** | Après-midi `#FCE3CF` / « À ENVOYER » `#FFE1CC` ΔE 2,1 (même trait `#EE8A43`) ; matin / intempérie `#DCE6EE` 4,1 ; réunion / maladie `#F1E2E2` et `#E7D2D2` 6,7 et 7,9 ; réunion / `--dz-erreur-fond` `#FCE4E1` 6,8 ; après-midi / congé 6,1 ; après-midi / sable `#E6DDCD` 7,2 | – | Viser ΔE ≥ 10 sur ces paires comme sur les autres ; séparer le trait « après-midi » du trait « à envoyer » |
| **Rouge destructif** | `--destructive: 1 77% 56%` = `#E53B38` : blanc dessus 4,19:1 (aujourd'hui 4,80:1) | `.bt-skin` `app/poseur/page.tsx:127-148` | `1 73% 53%` (`#DF3331`, 4,51:1) |
| **Triplets HSL ≠ hexadécimal annoncé** | 7 lignes (`--card`, `--secondary`, `--muted-foreground`, `--accent`, `--destructive`, `--border`, `--input`), écart de 1 à 6 unités RVB | – | Une seule valeur source par jeton |
| **Portée des jetons** | `.dz-salarie .bt-skin` n'atteint pas les fenêtres Radix (rendues dans `<body>`) : un contenu `.bt-skin` seul n'a aucun `--dz-*` ; 11 écrans de feuille concernés (E08-E10, E13, E20-E24, AS6, AS7) | `ui/dialog.tsx:24` voile `bg-black/80` non scopable | Ajouter `.bt-skin` seul au bloc de jetons de fenêtre, ou imposer `dz-salarie` sur chaque `DialogContent` salarié |
| **Taille de texte** | `--dz-fs-xs: 10.5px`, pas de jeton 12 px ; 12 tailles de la planche hors jetons | – | `--dz-fs-xs: 12px` et une échelle contenant 13, 14, 15, 19, 24, 26 |
