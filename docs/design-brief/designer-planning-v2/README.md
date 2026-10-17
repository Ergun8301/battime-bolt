# BEMEXO · Planning bureau v2

Portée : planning semaine (ordinateur), bulle d'intervention, bandeau de chiffres, barre d'outils, fiche d'intervention, planning téléphone (un jour). Aucune nouvelle fonction.

Fichiers : `BEMEXO Planning v2 - Planche.dc.html` (planche, repères A à H), `tokens.css` (complet, lignes changées marquées « v2 »).

> Direction RETENUE par l'arbitrage (Ergun, coordination) : **v2b « Couleur »** — `BEMEXO Planning v2b - Couleur.dc.html` (copiée ici). Page crème des Statistiques, grille sur carte sombre #1B1713, bulles aux couleurs de la légende des Statistiques : violet = envoyée, rouge = à envoyer, vert d'eau = en cours. Bloc `.dz-planning-v2b` en fin de `tokens.css`. Source : projet Claude Design cc404d2c…, dossier `design_handoff_planning_v2/`.

## 1. Règle de couleurs

- **Rouge** (#C62828, fond #FCE4E1, trait #F0B8AE, mot #B3261E) : action requise. Heures à envoyer, journée à relancer, pastille chiffrée. Seule couleur qui crie.
- **Vert** (#2FA36B point, #1F7A4D bord) : en ce moment (pointe).
- **Gris** (#EFEDE9) : réglé (heures envoyées). S'efface.
- **Jaune** (#FFC21A) : marque et action principale. Logo, onglet actif, bouton Exporter, rond derrière le numéro d'aujourd'hui. Rien d'autre.
- **Violet** (#5B5BFF) : données, uniquement dans les graphiques.
- **Rayures 135°** : absence (couleurs du salarié).
- **Chantier, client, créneau (matin, après-midi, soir), réunion** : pas de couleur sur les bulles.

## 2. Bulle

- 2 lignes : client (13 px, 600), puis horaire (12 px, « 8 h–12 h »). Hauteur 41 px. `white-space: nowrap` + `text-overflow: ellipsis` sur les deux lignes.
- La durée n'est plus dans la bulle : elle est dans l'en-tête du jour, la colonne salarié, l'infobulle et la fiche.
- États : prévue (blanc, trait gris plein), sans horaire, en cours (point + bord vert), à envoyer (rouge + mot « à envoyer »), envoyée (gris, ✓), ajoutée par le salarié (coin noir 8 px en haut à droite), retirée (barrée, estompée), survol, sélectionnée (anneau noir 2 px), glissée (45 %).
- Un mot seulement si une action est requise : « à envoyer ». Sous 130 px de large, il remplace l'horaire.
- Supprimés : étiquettes « PAS D'HEURES ENVOYÉES », « ENVOYÉ », « AJOUTÉE PAR LE SALARIÉ », fonds de créneau, liseré gauche, pastille de couleur de chantier, bordures pointillées.

## 3. Grille

- Colonne salarié 200 px (160 px sous 1280 px) : initiales, nom, pastille rouge chiffrée (jours en attente), « 24 h sur 38 h ».
- En-tête des jours 44 px : « Jeu », numéro, total d'heures envoyées à droite (vide si 0).
- Case : padding 4 px, min 50 px. Vide = rien. « + » centré seulement au survol (ordinateur) ou au toucher (téléphone). « + ajouter » sous chaque jour : supprimé.
- Pas de lignes vides sous le dernier salarié (décision précédente maintenue).
- L'astuce « Copier une case » ne doit pas recouvrir la grille : en bas à gauche, une fois, ou dans le guide.

## 4. Barre d'outils

- Niveau 1 (barre noire 52 px) : Planning, Statistiques | Clients, Salariés, Réserves | Assistant (contour), compte. Clients, Salariés et Réserves ouvrent les mêmes fenêtres qu'aujourd'hui, mêmes intitulés.
- Niveau 2 (64 px) : ‹ › Aujourd'hui, titre « 12 – 18 octobre 2026 », sous-titre « Semaine 42 · 131 h envoyées sur 234 h » (valeurs des données d'exemple) (lien vers le bandeau déplié). À droite : Sélectionner, Imprimer, Plus ⋯, Exporter (seul bouton plein, jaune).
- Plus ⋯ : Borne, Formations, Envoyer par e-mail. Réglages : menu du compte.
- Assistant : mettre à jour la phrase qui situe Borne (« dans Plus ⋯ »).

## 5. Bandeau de chiffres

- Replié (44 px) : seulement « N journées à relancer · Ergun 3, Sofiane 1 » (rouge) et « N pointent en ce moment » (vert). Valeur à 0 = élément absent. Tout à 0 = pas de bandeau.
- Déplié : tuile sombre Heures envoyées (barres violettes par jour), tuile rouge À relancer (liste salarié + jours), tuile verte En direct. Absents et Pièces seulement si > 0.
- « Jours en attente » est écrit en toutes lettres ici et nulle part ailleurs.

## 6. Typographie

- Archivo partout, `font-variant-numeric: tabular-nums` pour les chiffres. Plus de JetBrains Mono, plus de majuscules espacées sur le planning.

## 7. Contrôles (à vérifier par Claude Code)

1. 1440×900, données d'exemple de la planche : 8 salariés visibles sans défiler, une ligne chacun.
2. Bulle : 2 lignes maximum, aucune étiquette en majuscules.
3. Mot « à envoyer » seulement sur les bulles rouges ; aucun autre mot d'état.
4. Aucun « + » visible au repos ; aucun « + ajouter ».
5. Aujourd'hui : un seul repère (rond jaune). Pas de colonne teintée, pas de badge.
6. Bandeau : aucune valeur 0 affichée.
7. « jours en attente » / « journées à relancer » écrit une seule fois à l'écran.
8. Aucun élément en JetBrains Mono ni `letter-spacing` > 0 sur le planning.
9. À 1024 px de large : aucune ligne de texte ne passe à la ligne (barres, en-têtes, bulles, colonne salarié).
10. Jaune plein : seulement logo, onglet actif, Exporter, rond d'aujourd'hui.
