# Planning v2b « Couleur » — mesures relevées dans la planche (BEMEXO Planning v2b - Couleur.dc.html)

Source : projet Claude Design cc404d2c-c9c2-49ee-b7dd-6ec05c4a2df6, fichier `design_handoff_planning_v2/BEMEXO Planning v2b - Couleur.dc.html` (lisible avec l'outil DesignSync, méthode get_file). Ce résumé reprend toutes les valeurs utiles à l'intégration.

## Page (A = 1440×900, B = 1024)
- Fond de page #F2EDE3. Police Archivo partout, `font-variant-numeric: tabular-nums`.
- **Niveau 1 · barre noire** 52 px, fond #15120F, padding 0 20px, gap 24px : logo BEME[X]O (21 px, 800, #F4F3F0 ; X sur fond #FFC21A, texte #15120F) · nav 14 px 600 nowrap : « Planning » actif (couleur #FFC21A, fond rgba(255,194,26,.12), padding 8px 12px, rayon 8px), « Statistiques » (#C9C4BC), séparateur 1×20 #3A352F, « Clients », « Salariés », « Réserves » (#C9C4BC). À droite : « ✦ Assistant » en CONTOUR (bordure 1px #3A352F, rayon 999, padding 7px 12px, ✦ jaune, texte #F4F3F0) · compte (rond 26 px #25201B, initiales 11 px #C9C4BC, « K Habitat ▾ »).
- **Niveau 2** 64 px, padding 0 24px, gap 12px, nowrap : ‹ › (36×36, rayon 8, bordure #D4D0C8, fond blanc) · « Aujourd'hui » (36 px, padding 0 14px) · titre « 12 – 18 octobre 2026 » (20 px, 800, -0.01em, lh 24) et dessous « Semaine 42 · <souligné>131 h envoyées sur 234 h</souligné> » (13 px #5E5850 ; le lien ouvre le bandeau déplié). À droite : Sélectionner, Imprimer, Plus ⋯ (boutons contour 36 px), puis **Exporter** seul bouton plein (#FFC21A, 700, padding 0 16px).
- **Bandeau replié** 44 px, marge 0 24px 10px, fond #FFFFFF, bordure #E6E3DD, rayon 10, padding 0 6px 0 14px, gap 18px, 14 px, nowrap : point 8 px #C62828 + « N journées à relancer » (700 #8E1B14) + « Ergun 3, Sofiane 1 » (#5E5850) · séparateur 1×18 #E6E3DD · point 8 px #2FA36B + « N pointent en ce moment » (600 #14613A) · « Déplier ▾ » à droite (13 px 600 #3A352F). Élément à 0 = absent ; tout à 0 = pas de bandeau (la grille remonte).
- **Grille** : carte sombre marge 0 24px, fond #1B1713, rayon 18, texte #F2EDE3. Colonnes `200px repeat(7, minmax(0,1fr))` (1440) et `160px repeat(7, minmax(0,1fr))` (sous 1280).
  - En-tête 44 px, bas 1px rgba(242,237,227,.14) : 1re case « 8 salariés » (13 px, rgba(242,237,227,.62)) ; jours : « Jeu » (rgba(242,237,227,.62), 500) + numéro (700) dans un rond 26 px (jaune #FFC21A + texte #15120F seulement pour aujourd'hui) + total d'heures envoyées du jour à droite (12 px, .62 ; vide si 0). Bordure gauche 1px rgba(242,237,227,.08).
  - Ligne salarié : bas 1px rgba(242,237,227,.08). Colonne salarié padding 6px 12px gap 10 : rond 28 px #2E2721 initiales 11 px 700 ; nom 14 px 600 (ellipsis) + pastille rouge chiffrée (min 18×18, rayon 9, #C62828, 11 px 700 blanc) = nb de jours en attente ; dessous « 24 h sur 38 h » (12 px .62, envoyées sur prévues).
  - Case : bordure gauche rgba(242,237,227,.08), padding 4px, gap 3px, min-height 50px. Vide = rien. Survol : fond rgba(242,237,227,.06) + « + » centré (rond 26 px, bordure rgba(242,237,227,.35), 16 px).
  - Absence : bloc min-height 41 px, rayon 8, rayures `repeating-linear-gradient(135deg, A 0 6px, B 6px 12px)` (congé #EFE6D2/#E4D6B8, maladie #F1E2E2/#E7D2D2, intempérie #DCE6EE/#CBD9E4, repos #E7E5DD/#D8D5CA), libellé 12 px 600 #3A352F (« Congé », « Maladie »…).
- Aujourd'hui : SEUL repère = rond jaune derrière le numéro. Pas de colonne teintée, pas de badge.

## Bulle (2 lignes, ~41 px)
- Conteneur : rayon 8, padding 4px 7px, colonne, min-width 0. Ligne 1 : client 13 px 600 lh 17 ellipsis (+ point vert d'eau 7 px avec halo `0 0 0 3px rgba(61,220,176,.25)` si en cours). Ligne 2 : 12 px lh 16 ellipsis : horaire « 8 h–12 h » ; « ✓ 7 h 30–16 h » si envoyée ; « Sans horaire » si sans horaire ; à droite le mot « à envoyer » (700, blanc) si à envoyer.
- Sous 130 px de large : « à envoyer » REMPLACE l'horaire (700, blanc).
- Coin « ajoutée par le salarié » : triangle 8 px #FFC21A en haut à droite (border-top 8px, border-left 8px transparent, rayon haut-droit 7).

| État | Fond | Bordure | Texte l1 | Texte l2 | Halo |
|---|---|---|---|---|---|
| prévue | rgba(242,237,227,.04) | 1px solid rgba(242,237,227,.28) | #F2EDE3 | rgba(242,237,227,.68) | — |
| sans horaire | idem prévue | idem | #F2EDE3 | « Sans horaire » .68 | — |
| en cours | rgba(61,220,176,.14) | 1px solid #3DDCB0 | #FFFFFF | #8FEFD3 | 0 0 18px rgba(61,220,176,.22) |
| à envoyer | linear-gradient(180deg,#E53935,#C62828) | 1px solid #FF6B6B | #FFFFFF | rgba(255,255,255,.9) + mot « à envoyer » | 0 0 18px rgba(229,57,53,.3) |
| envoyée | linear-gradient(180deg,#5560F5,#7442F5) | 1px solid transparent | #FFFFFF | rgba(255,255,255,.88), préfixe « ✓ » | — |
| retirée | transparent | 1px solid rgba(242,237,227,.12) | rgba(242,237,227,.4) barré | idem barré | — |
| survol | — | 1px solid #F2EDE3 | | | infobulle après 400 ms (chantier, durée, qui l'a créée) |
| sélectionnée | — | — | | | anneau `0 0 0 2px #FFC21A` |
| glissée | opacité .45 | | | | case cible : fond rgba(255,194,26,.12) + anneau jaune 2 px |

- Plus de : fonds de créneau (matin/après-midi/soir), liseré gauche, pastille de couleur de chantier, étiquettes en MAJUSCULES, pointillés, durée dans la bulle (elle va dans l'en-tête du jour, la colonne salarié, l'infobulle, la fiche).

## Bandeau déplié
- Grille 1.5fr 1fr 1fr, gap 12 : tuile sombre #15120F rayon 14 padding 20px 22px « Heures envoyées » (14 px .7) + valeur 52 px 800 -0.03em + « sur 234 h prévues » + 7 barres (16×70, fond rgba(244,243,240,.08), remplissage dégradé violet #5560F5→#7442F5 ; lettre du jour en jaune pour aujourd'hui) · tuile rouge (#FCE4E1, bordure #F0B8AE) « À relancer » + « N journées » (40 px 800) + liste « Ergun  mar. 13, mer. 14 » · tuile verte (#E2F3EA, bordure #B9E0CA) « En direct » + « N pointent » + noms. Absents et Pièces : tuiles seulement si > 0. « Replier ▴ ».

## Fiche d'une intervention (panneau 480 px)
- Titre client 26 px 800, sous-titre « restauration · Mâcon » 15 px #5E5850, ✕ 36×36 bordure #E6E3DD.
- Phrase d'état en haut dans sa couleur : à envoyer = bandeau #FCE4E1/#F0B8AE « Heures pas envoyées par Ergun pour cette journée. » ; envoyée = bandeau gris « Heures envoyées le 14/10 » ; en cours = bandeau vert « Pointe depuis 8 h 02 ».
- Lignes libellé / valeur (grille 130px 1fr, 15 px, séparateur #ECE9E4) : Salarié, Jour, Prévu « 8 h – 17 h · 9 h », Heures envoyées, Ajoutée par, puis Note.
- Pied : « Supprimer » (texte #B3261E) · « Copier vers… » (contour 44 px) · « Modifier » (plein #15120F, blanc). MÊMES champs et actions qu'aujourd'hui.

## Téléphone (390×844, un jour)
- Tout sombre #15120F/#F2EDE3. En-tête : logo + « Menu ». « Jeudi 15 octobre » 18 px 800 + « Semaine 42 » à droite. Bande de 7 jours (56 px) : lettre 12 px, numéro dans rond 30 px (jaune pour aujourd'hui), point rouge 5 px sous les jours qui ont des heures à envoyer.
- Carte rouge (dégradé #E53935→#C62828) 44 px « N journées à relancer › ».
- Liste par salarié (ordre actuel des salariés) : nom 14 px 700 + pastille rouge ; bulles plus grandes (rayon 10, padding 8px 12px, min-height 52, client 15 px, ligne 2 14 px), mêmes couleurs d'état. Salarié sans intervention : « Rien de prévu » + « + » (44 px) au toucher.

## Règle de couleurs v2b (H)
Rouge = action requise (= « Oubli de pointage » des Statistiques) · Vert d'eau #3DDCB0 = en ce moment (= « En direct ») · Violet dégradé = heures envoyées/réalisées (= « Normales ») · Jaune = marque, onglet actif, Exporter, rond d'aujourd'hui, anneau de sélection, coin « ajoutée par le salarié » · Contour clair = à venir · Rayures = absence. Chantier et client : pas de couleur.
