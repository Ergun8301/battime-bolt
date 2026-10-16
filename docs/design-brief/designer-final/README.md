# BEMEXO · Dossier écran salarié (/poseur, /pointer) · passe 3

Maquettes : `BEMEXO Salarié - Dossier.dc.html` (planche + écrans E, AS, P).
Fichiers : `tokens.css` (jetons ; portée `.dz-salarie`, `.bt-skin`, `.dz-portail`), `salarie.css` (classes `dz-*`), `donnees-exemple.ts`.
Dépendances ajoutées : **aucune** (barres et frise en CSS). Polices : Archivo, JetBrains Mono.
Intégré dans cette passe : `01-reperes-reels.md`, `02-confirmations-et-gardes.md`, `03-contrastes-20-ecrans.md`.

---

## 0. Ce qui change

- **Visuel « Statistiques »** : le total devient une carte à grand chiffre (44 px) avec les **barres des 7 jours** (CSS, `aria-hidden`), suivie de 4 compteurs (chantiers, pauses, route, panier), comme les compteurs `.bt-stats` réels. La Semaine (E25) ouvre sur la même carte. Réunion sans barre à gauche. États verrouillé / inactif faits de **couleurs**, plus d'opacité.
- **Libellés remis à l'identique du code** (§6.1) : 12 écarts de la passe 2 corrigés.
- **Repères** : correspondance complète des 133 repères du fichier 01 (§6.2).
- **Gardes et confirmations** : 30 écrans ajoutés et 20 redessinés d'après le fichier 02 (§2).
- **Couleurs** : valeurs rejouées par l'intégration adoptées pour soir et réunion ; à envoyer séparé d'après-midi ; teintes manquantes fournies (§4).
- **S90** rattaché à AS1 et AS10.

---

## 1. Structure de l'écran

1. **En-tête** `.bt-phdr.dz-entete.dz-sombre` : retour « Retour à ma journée » quand un autre jour ou une autre vue est affiché, titre (`.bt-phdr-date`), ✦ assistant, avatar (menu du compte).
2. **Bande des 7 jours** : 8 états.
3. **Note d'en-tête** : jour à envoyer, hors-ligne, transfert en échec.
4. **Contenu** `.bt-day-scroll` : rappels, pointage, **carte Total + compteurs**, mini-frise, chantiers, trous, prévus, réunion, tâches, « Dupliquer cette journée ». Réserve basse `170px + safe-area`.
5. **Barre du bas** : `+`, `QR`, « Envoyer ma journée », ligne d'aide (seulement quand elle a quelque chose à dire), puis 4 boutons **Journée · Semaine · Mois · Plus**.
   *Dans les textes des guides, dire « les boutons du bas » ; le mot « onglet » n'est jamais employé.*
6. **Feuilles** : en-tête fixe, corps qui défile, pied fixe (le bouton principal y reste visible), hauteur max `100dvh − 24px`.

---

## 2. Écrans

### Envoi : ordre des contrôles (handleSubmitDay)
Chacun peut ne pas se produire ; plusieurs peuvent se suivre. Le kicker dit « AVANT L'ENVOI » sans compteur « 1/3 ».

| # | Contrôle | Écran |
|---|---|---|
| 1 | Sortie oubliée sans fin | **E31** |
| 2 | Chevauchement (dont deux prévus qui se recouvrent) | E11 |
| 3 | Horaires prévus (3e choix seulement si heures notées) | E08 |
| 4 | Pause : > 6 h d'affilée (écarts < 20 min continus), une plage à la fois | E09, **E09b** |
| 5 | Journée vide | **E32** |
| 6 | Plus de 10 h, strictement (10:00 pile : rien) | E10 |
| 7 | Envoi | **E33** (« Envoi… ») · issues **E34** · hors-ligne **E35** |

### Liste
| Code | État |
|---|---|
| E01 | Chargement |
| E02 | Échec de chargement (ni « + » actif, ni « Rien à envoyer ») |
| E03 | Journée vide |
| E04 / **E04b** | Planifiée, haut / défilé (« ne partira pas », « terminé le ») |
| E05 / **E05a** / **E05b** / **E05c** | En cours : haut / total et frise / chantiers, trou, prévu / réunion, tâches, Dupliquer |
| **E37** | Journées à envoyer (60 jours) |
| E06 | Hors-ligne |
| E07 | Retour du réseau (file qui se vide seule, Route répondu) |
| E08, E09, **E09b**, E10 | Contrôles 3, 4, 6 |
| E11, **E31**, **E32** | Arrêts 2, 1, 5 |
| E12 | Journée envoyée (ligne RETIRÉ, endroit noté) |
| **E33**, **E34**, **E35**, **E36** | Envoi… · envoi partiel / rien envoyé / échec · envoi demandé hors-ligne · « Envoyer votre journée maintenant ? » après scan |
| E13 | Journée déjà envoyée |
| E14 | Renvoyée par le bureau (étiquette À ENVOYER, ↺ prime sur « oublié ») |
| E15 | Corrigée par le bureau / le chef |
| E16 / **E16b** | Fenêtre « Mois clôturé » / « Heures clôturées », bouton « Compris » |
| E17 / **E17b** | Pointage oublié : « Tu as fini à quelle heure ? » + « Terminer ma journée » / fin refusée |
| E18 | Sortie oubliée à compléter |
| E19 | Transfert en échec |
| **E20a**, E20, **E20b** | Liste des réserves · lever · « Réserve levée » + Annuler (10 s) |
| E21, E21b | Éditeur 390 × 844, 360 × 640 (Début et Fin = deux boutons) |
| **E30a/b/c** | « Retirer ce chantier ? » : ligne envoyée / brouillon vide / autre cas |
| **E38** | Éditeur : OK refusé |
| **E39** | Éditeur : pause « Autre » (aperçu « = 1 h 15 »), puces grisées, « Détail des réserves » |
| **E40** | « Réglage de l'heure » (molette) + « Valider les heures » |
| E22, **E22b**, **E22c** | Choisir le chantier · aucun résultat · « C'était quoi ? » |
| E23, **E23b** | Pointage en cours : cas F1 (avec consigne borne) · cas à un seul bouton |
| E24 | Dupliquer : calendrier, « Copier (N) », congé non sélectionnable |
| E25 | Semaine (carte à barres + 7 jours) |
| E26 | Menu du compte (ouvert par l'avatar et par « Plus ») |
| E27 | Mon équipe |
| E28 | Compte archivé (déconnexion automatique, sans bouton) |
| E29 | Noms de 52 caractères |
| **E42** | Réserve sur la carte : à lever / levée par le bureau / levée le JJ mois |
| AS1–AS8, **AS9**, **AS10** | Assistant (AS9 : états de l'historique ; AS10 : questions heures, planning, collègues) |
| **P00**, **P00b**, **P04** | /pointer : vérification · connexion sur place (`#kx-pass`) · information QR fixe |
| P01, P02 | Arrivée · départ (deux raccourcis : Envoyer ma journée, Ajouter une intervention) |
| P03, **P03b**, **P03c** | Refus du QR fixe (Réessayer si ticket) · QR expiré (Ouvrir mon espace seul) · neutre |

### Textes non dessinés, à garder tels quels (fichier 02)
- **Après « Terminer le pointage… »** (E23) : « Un instant… » (non fermable), « Pointage terminé : HH:MM à HH:MM (heure choisie par vous) », pointage changé / annulé / fermé (« Le pointage a été fermé à HH:MM. Vérifiez vos heures… »), réponse perdue, vérification impossible, heure future, « La fiche a été fermée : rien n'a été modifié ». Hors-ligne : « Votre pointage est encore en cours : ces heures seront vérifiées au retour du réseau ». Ils s'affichent dans le corps de la feuille E23, à la place du texte.
- **Pointage en cours touché** : la carte ne s'ouvre pas, retour passager « Pointage en cours : … ».
- **Règle des 14 h** (E17, E18) : ouvert depuis plus de 14 h → « sortie oubliée » la nuit ; jour clôturé → reste ouvert ; poste commencé à 21 h → reste « en cours ». La 2e ligne d'un poste de nuit appartient à la journée du début.
- **Réseau instable à l'enregistrement** : « ça partira tout seul » (texte actuel).
- **Journée mixte** : pas de question ; après correction d'une ligne envoyée, « Correction envoyée — la secrétaire est prévenue ».
- **Retour Android** : referme la couche du dessus, y compris les questions d'envoi (l'envoi est abandonné). *Décision à ajouter aux points ouverts du cahier.*

---

## 3. Liste de contrôle S1 à S104

États : **Dessiné** · **Partiel** · **Pas dessiné** · **Comportement** (règle sans écran). Aucun « caché ».

| S | État | Écran | Ce qui manque |
|---|---|---|---|
| S1 | Dessiné | E05, E14, E15 (retour) | — |
| S2 | Dessiné | E04, E05b | — |
| S3 | Partiel | E04, E21 | Éditeur ouvert depuis un prévu |
| S4 | Dessiné | E04b, E05b | — |
| S5 | Dessiné | E04, E05 | — |
| S6 | Dessiné | E05c | — |
| S7 | Dessiné | E05c | — |
| S8 | Dessiné | E05c, E06 | — |
| S9 | Dessiné | E04b | — |
| S10 | Partiel | P00–P04 | Appareil photo |
| S11 | Partiel | `QR` (E05) | Scanner intégré |
| S12 | Dessiné | E05 | — |
| S13 | Dessiné | E05 | — |
| S14 | Dessiné | E17, E17b | — |
| S15 | Dessiné | E18 | — |
| S16 | Dessiné | E05, E05a, E05b | — |
| S17 | Dessiné | E05, E22, AS7 | — |
| S18 | Dessiné | E22, E22b | — |
| S19 | Dessiné | E22c | — |
| S20 | Dessiné | E21, E40 | — |
| S21 | Dessiné | E21 | — |
| S22 | Dessiné | E21, E39 | — |
| S23 | Dessiné | E21 | — |
| S24 | Dessiné | E39 | — |
| S25 | Dessiné | E21 | — |
| S26 | Dessiné | E21, E38, E23 | — |
| S27 | Dessiné | E13, E15 | — |
| S28 | Dessiné | E30a, E30b, E30c, E12 | — |
| S29 | Dessiné | E21 | — |
| S30 | Dessiné | E23, E23b | — |
| S31 | Dessiné | E05b, E07 (répondu) | — |
| S32 | Dessiné | E05a, E03 | — |
| S33 | Dessiné | E03 | — |
| S34 | Dessiné | E05c, E24 | — |
| S35 | Dessiné | E15 | — |
| S36 | Dessiné | E12 | — |
| S37 | Dessiné | E05, E06, E12, E16, E18, E04, E29 | — |
| S38 | Dessiné | E42, E20a, E20 | — |
| S39 | Dessiné | Planche, E06, E07, E05, E33, E12, E03, E34, E35 | — |
| S40 | Dessiné | E08 | — |
| S41 | Dessiné | E09, E09b | — |
| S42 | Dessiné | E10 | — |
| S43 | Dessiné | E11, E31, E32 | — |
| S44 | Dessiné | E13 | — |
| S45 | Dessiné | E14 | — |
| S46 | Dessiné | E16, E16b | — |
| S47 | Dessiné | E05, E37 | — |
| S48 | Dessiné | P02, E36 | — |
| S49 | Dessiné | E25 | — |
| S50 | Pas dessiné | — | Mois (prochaine vague) |
| S51 | Partiel | E26 | Vue Historique |
| S52 | Partiel | E26 | Bouton PDF dans la vue |
| S53 | Partiel | E26 | Vue Interventions supprimées |
| S54 | Dessiné | Bande, E25 | — |
| S55 | Partiel | E26 | Formulaire de congé |
| S56 | Pas dessiné | — | Mes demandes |
| S57 | Pas dessiné | — | Annuler une demande |
| S58 | Partiel | Bande (C), E25 | Lettres M, I, R en légende seulement |
| S59 | Dessiné | E05, E20a | — |
| S60 | Dessiné | E20 | — |
| S61 | Dessiné | E20b | — |
| S62 | Dessiné | E05, bouton Plus, E26 | — |
| S63 | Pas dessiné | — | Formations |
| S64 | Pas dessiné | — | idem |
| S65 | Pas dessiné | — | Documents du chantier |
| S66 | Pas dessiné | — | idem |
| S67 | Pas dessiné | — | idem |
| S68 | Pas dessiné | — | idem |
| S69 | Dessiné | E26, E27 | — |
| S70 | Dessiné | E27 | — |
| S71 | Partiel | E27 | Formulaire d'ajout pour un coéquipier |
| S72 | Dessiné | E05, E26 | — |
| S73 | Partiel | E26 | Parcours photo |
| S74 | Partiel | E26 | États Couper / Bloquées |
| S75 | Partiel | E26 | Fenêtre Informations |
| S76 | Dessiné | E26 | — |
| S77 | Dessiné | Barre du bas | — |
| S78 | Dessiné | E06, E35 | — |
| S79 | Dessiné | E06 | — |
| S80 | Dessiné | E07, E19 | — |
| S81 | Dessiné | E03 | — |
| S82 | Dessiné | E05, AS1 | — |
| S83 | Dessiné | AS1 | — |
| S84 | Dessiné | AS1 | — |
| S85 | Dessiné | AS1 | — |
| S86 | Dessiné | AS2, AS7, AS8 | — |
| S87 | Dessiné | AS2, AS3, AS8 | — |
| S88 | Dessiné | AS3 | — |
| S89 | Dessiné | AS1 (« Me guider pas à pas »), AS7 | — |
| S90 | Dessiné | AS10, AS1 | — |
| S91 | Dessiné | AS1 | — |
| S92 | Dessiné | AS4, AS5, AS6, AS9 | — |
| S93 | Pas dessiné | — | Guide pas à pas : composant inchangé, cibles en §6.2 |
| S94 | Dessiné | P00, P00b | — |
| S95 | Dessiné | P04, P03 | — |
| S96 | Dessiné | P01 | — |
| S97 | Dessiné | P02, E36 | — |
| S98 | Dessiné | P03c | — |
| S99 | Dessiné | P03, P03b | — |
| S100 | Dessiné | P01, P02 | — |
| S101 | Comportement | Toutes les feuilles | §2 « Retour Android » |
| S102 | Dessiné | E01, E02, E28 | — |
| S103 | Dessiné | E20b, E35 | — |
| S104 | Dessiné | E04, E05a (carte Total, frise) | — |

Bilan : 81 dessinés, 12 partiels, 10 pas dessinés, 1 comportement (sur 104). Tout ce qui reste partiel ou non dessiné relève de la prochaine vague, sauf S3, S10, S11, S58, S71, S73–S75.

---

## 4. Couleurs

### 4.1 Les 20 écrans du fichier 03

| Couple fautif | Écrans | Correctif | Nouveau ratio |
|---|---|---|---|
| Blanc sur vert `#2FA36B` | 14 | fond `--dz-vert-plein #1F7A4D` | 5,32:1 |
| `--dz-texte-3 #8A7F70` (aide, placeholder) | 14 + AS1, AS3 | `#655B50` | 5,69 (crème), 4,92 (sable), 6,2 (blanc) |
| Titres de section `#8A6A00` | 12 | `--dz-titre-section #755800` | 5,71:1 |
| « Rien de prévu » opacité .45 | 13 | opacité .6 | 5,84:1 |
| Blanc sur rouge `#E53935` | E14, E18, E26, AS4 | `--destructive #C62828` | 5,62:1 |
| `#8A7F70` sur `#EFE9DE` (RETIRÉ) | E12 | `#655B50` | 5,49:1 |
| « PAUSES » opacité .75 | E05, E14 | plus d'opacité, texte `#7A3A00` sur `#FFE4A8` | 6,95:1 |
| Tuiles verrouillées opacité .5, `+` à .35 | E16 | `--dz-verrou-fond/-texte` ; `+` actif (il ouvre « Mois clôturé ») | 5,6:1 |
| Envoyer grisé | E02, E03, E16 | `--dz-inactif-fond/-texte` ; E02 sans bouton | 4,92:1 |
| Chevron `#B5A994` | E26, AS1 | `#655B50` | 5,8:1 |

Écart avec le fichier 03 : pour le vert, je garde le texte blanc sur un vert plus foncé (5,32:1) plutôt que du noir sur `#2FA36B`, pour que « Journée envoyée ✓ » se lise comme un bouton plein ; le vert foncé fait 3,51:1 sur le noir de la bande (élément graphique, seuil 3:1). Le rouge `#C62828` est plus foncé que `#DF3331` proposé : à rejouer si un test épingle le rouge.

### 4.2 Tests de teinte du dépôt
| Test | Valeur adoptée | Résultat annoncé par l'intégration |
|---|---|---|
| matin / soir | matin `#DDEBFA` inchangé, soir **`#EAD6F4`** | ΔE 15,02 ; réunion / soir 11,81 |
| bordure de réunion | **`#B7366A`** (bord et texte de l'heure) | 4,63:1 ; ΔE 10,93 de la barre la plus proche |
| fond de réunion / pastille d'initiales | **`#FFE2EC`** | `test:missions` 19/19 avec les trois valeurs |

La réunion n'a plus de barre à gauche (`missions.ts:144-146`). Le trait décoratif n'existe plus : le bord sert aussi de couleur de texte.

### 4.3 Teintes fournies
- **Chantiers** (`CHANTIER_PALETTES`) : 7 × (barre / fond d'étiquette / texte d'étiquette), dans `tokens.css`. Barres ≥ ΔE 58 du fond de réunion, texte ≥ 5,98:1. **La bande de gauche des cartes reste le créneau** ; le chantier n'apparaît qu'en pastille (E22).
- **Encre secondaire** `DAY_PART_INK` = **`#5B534A`** (une seule valeur).
- **Case verte** = **`#EEF9F2`** (`--dz-case-verte`). Le vert plein sous texte blanc s'appelle `--dz-vert-plein`.
- **Repères de test gardés** : `#E7E1D5` (absence), `#EFEAE0` (badge envoyé).
- **Repos** : `#E7E5DD` / `#D8D5CA`. **Absences** : le salarié reprend l'angle (45°) et les teintes du bureau (`admin-planning.tsx:529-534`), pour que la borne reste identique : remplacer mes 6 valeurs par celles du code.
- **À envoyer ≠ après-midi** : fond `#FFE4A8` (ΔE 20,3 d'après-midi, était 2,1), trait `#C98500` séparé du trait après-midi.
- **Focus** : `--dz-focus` (anneau 2 px crème + 2 px encre) et `--dz-ring-sur-noir` (jaune actuel de `.bt-skin`).
- **Hexadécimaux hors jetons** : tous rattachés (`--dz-texte-note`, `--dz-trait-doux`, `--dz-erreur-vif`, `--dz-jaune-texte`, `--dz-erreur-texte-2`, `--dz-erreur-bord-doux`, `--dz-squelette-clair`, absences sombres). `#E9E2D4` et `#B88A00` : planche seulement.
- **Triplets HSL** : recalculés depuis l'hexadécimal (une seule valeur source).
- **Tailles** : `--dz-fs-12` à `--dz-fs-44`, toutes les tailles de la planche.

### 4.4 Paires encore proches (non testées), laissées en l'état
Matin / intempérie, réunion / maladie, après-midi / congé : dépendent des teintes d'absence du code (§4.3), à mesurer après recopie. Réunion / fond d'erreur : ΔE 6,9 ; le fond d'erreur est toujours accompagné d'un bord rouge et d'un texte rouge foncé.

---

## 5. Bande des 7 jours

8 états, chacun avec une forme : aujourd'hui (jaune), envoyé (✓ sur `#1F7A4D`), à envoyer (anneau + !), à venir (pointillé), absence (rayures + lettre), rien de prévu (texte .6), clôturé (▣), renvoyé (↺, prime sur « à envoyer »). `aria-label` « {état}, {jour} {date} ». Élément nouveau : aucun repère existant.

---

## 6. Libellés et repères

### 6.1 Libellés de la passe 2 remis à l'identique du code
| Passe 2 | Passe 3 (= code) | Écran |
|---|---|---|
| « Non, je corrige » | « Non, je corrige mes heures » | E08 |
| « Horaires prévus par le bureau » | « Le bureau avait prévu… » | E08 |
| 30 min présélectionnées + « Valider · pause 30 min » | un toucher, rien de présélectionné ; indice « Pendant cette plage. Plusieurs pauses ? Additionne-les. » | E09 |
| « Tu vas envoyer 10:45… » | « Total : 10:45 (dépasse 10h). Vérifie tes horaires. » | E10 |
| étiquette « CHEVAUCHEMENT » | « À ENVOYER » | E11 |
| étiquette « À CORRIGER » | « À ENVOYER » | E14 |
| bandeau « Mois clôturé » | fenêtre « Mois clôturé » / « Heures clôturées » + « Compris » | E16, E16b |
| « Enregistrer la fin », sans question | « Tu as fini à quelle heure ? » + « Terminer ma journée » | E17 |
| « Retirer cette intervention » | « Retirer ce chantier » (`aria-label` du code) | E21 |
| consigne borne supprimée | rétablie | E23 |
| « Se déconnecter » | supprimé (déconnexion automatique) | E28 |
| « Annuler » dans l'éditeur | supprimé (✕ seulement, comme le code) | AS7 |
| « Garder / Supprimer », « Tout effacer ? » en fenêtre | « Non / Oui », confirmation en place | AS4, AS6 |
| P03 « QR expiré » + « Réessayer » | séparés : P03 (refus du QR fixe, Réessayer si ticket), P03b (QR expiré, Ouvrir mon espace seul) | P03, P03b |
| P02 : Envoyer + Ouvrir mon espace | « Envoyer ma journée » + « Ajouter une intervention » | P02 |
| `aria-label` « Ajouter une intervention », « Scanner le QR de la borne » | « Ajouter un chantier », « Scanner la borne » | barre du bas |
| ligne d'aide « Le pointage en cours ne part pas » sur 8 écrans sans pointage | affichée seulement avec un pointage en cours | — |

Les textes marqués « … » dans les maquettes sont des fragments du code : reprendre la phrase entière, sans la réécrire.

### 6.2 Correspondance des repères (fichier 01)

**Règle** : tous les repères restent écrits en toutes lettres dans le JSX du composant qui porte l'élément. Aucun n'est renommé. Les lignes « déplacé » changent d'endroit à l'écran, pas de valeur.

**Corrections du README passe 1** (fichier 01 §A) : `.bt-timecard` = boutons Début / Fin de l'éditeur (pas la carte de pointage, qui est `.bt-lt`) ; `data-bub`, `data-creneau`, `data-withdrawn`, `data-live`, `.bt-err`, `data-day` n'existent pas dans l'écran salarié : retirés du dossier (les attributs de style de `salarie.css` sont `data-etat`, `data-dz-creneau`, `data-ton`). `role=button` sur les cartes : **ajout**, pas un repère existant.

| Repères | Nouvel élément | Statut |
|---|---|---|
| `scan-open`, `entete.scanner`, « Scanner la borne » | bouton `QR` de la barre du bas | **déplacé** (en-tête → bas). Guide : « en bas, à gauche d'Envoyer ma journée » |
| `dock-assistant`, `journee.assistant`, « Assistant BEMEXO » | ✦ de l'en-tête | **déplacé** (bas → en-tête), reste la cible de retour du focus |
| `menu.compte`, « Mon compte et menu », `role=menu` / `menuitem` | avatar → même menu, rendu E26 ; « Plus » ouvre ce même menu | inchangé |
| `menu.photo`, `menu.conges`, `menu.infos`, `menu.notifications`, `menu.historique` | lignes de E26 | inchangé |
| `menu.journee`, `menu.semaine`, `menu.mois` | boutons Journée / Semaine / Mois de la barre du bas | **déplacé**. Les 3 `menuitem` restent dans le menu, sans `data-guide`, pour les scripts |
| `.bt-phdr-back`, « Retour à ma journée » | bouton ‹ de l'en-tête (autre jour, Semaine, Mois, Mon équipe) | inchangé (E14, E15, E18, E25, E27) |
| `bt-phone`, `bt-phdr`, `bt-phdr-date`, `bt-phbody`, `bt-phscroll`, `bt-day`, `bt-day-scroll`, `bt-info`, `infos.fermer`, « Informations » | cadre, en-tête, titre, corps, Journée, fenêtre Informations | inchangé |
| `.bt-total` · `.bt-total-big` · `total-prevu` | carte Total · grand chiffre · ligne « + N prévues » | inchangé (nouvel aspect) |
| `.bt-stats`, `.bt-stat`, `.bt-stat-n` | 4 compteurs sous la carte Total | inchangé |
| `panier`, `journee.panier`, « Panier repas » | compteur Panier | inchangé |
| `.bt-sec` | titres de section | inchangé |
| `day-returned` | message « Le bureau t'a renvoyé cette journée » | inchangé |
| `card-live`, `card-planned`, `card-planned-overlap`, `card-planned-incomplete`, `card-entry`, `card-exit-forgotten`, `card-office-edit`, `card-reserve`, `card-lift`, `termine-le` | CarteChantier et ses encadrés | inchangé |
| `.bt-iv`, `.bt-iv-name`, `.bt-badge`, `.bt-iv-mod`, `.bt-plan-k` | carte, nom, étiquette d'état, encadré de correction, étiquette PRÉVU | inchangé |
| `journee.chantier`, `journee.sortie-oubliee` | cartes | inchangé |
| `card-start`, `start-other` | absents (les scripts vérifient leur absence) | inchangé |
| `.bt-gap`, `.bt-gap-b`, `journee.trou` | rangée Route / Pause | inchangé |
| `.bt-dup`, `journee.copier` (×2) | « Copier la journée d'hier » (E03), « Dupliquer cette journée » (E05c) | inchangé |
| `.bt-fab`, `journee.plus`, « Ajouter un chantier » | `+` | inchangé |
| `.bt-send`, `journee.envoyer` | « Envoyer ma journée » (6 valeurs) | inchangé |
| `.bt-lt`, `.bt-lt-big`, `live-timer`, `lt-finish`, `journee.terminer`, `lt-end`, `fin-lendemain` | carte de pointage, durée, « Terminer ma journée », champ de fin, note | inchangé |
| `.bt-ed`, `.bt-ed-cancel`, `.bt-save`, `editeur.ok` | feuille, ✕, OK (pied fixe) | inchangé |
| `.bt-ed-doc`, `editeur.documents` | « Documents (N) » | **déplacé** (pied → corps de la feuille) |
| `.bt-ed-trash`, `editeur.retirer`, « Retirer ce chantier » | bouton « Retirer ce chantier » | **déplacé** (pied → corps) ; corbeille → bouton avec texte |
| `.bt-times`, `.bt-timecard` (×2), `editeur.horaires`, `.bt-dur`, `heure-exacte`, `.bt-molette` | Début, Fin, durée nette, note, molette (E40) | inchangé |
| `ed-pause-*`, `.bt-pp-chips`, « Total des pauses (h:mm) » | puces et champ « Autre » (E39) | inchangé |
| `.bt-seg`, `.bt-segb`, `editeur.reserve`, `.bt-note`, `editeur.note` | statut, Avec réserve, note / Détail des réserves | inchangé |
| `.bt-site-search`, `.bt-site`, `.bt-site-name`, `editeur.chantier`, `editeur.autre`, `editeur.ajouter-chantier` | E22, E22b, E22c | inchangé |
| `start-other-sheet` | non redessiné | inchangé |
| `planned-confirm`, `-list`, `-send`, `-fix`, `-skip` | E08 | inchangé |
| `pause-ask`, `pause-ask-range`, `pause-*` | E09, E09b | inchangé |
| `live-clash`, `-text`, `-why`, `-gap`, `-finish`, `-fix` | E23, E23b | inchangé |
| `send-ask`, `send-ask-yes`, `send-ask-no` | E36 | inchangé |
| `confirmer.retirer` | « Oui, retirer » (E30) | inchangé |
| `copier.valider` | « Copier (N) » (E24) | inchangé |
| `data-guide-confirm` (7) | E13, E08, E09, E10, E30a–c, E23, E36 | inchangé ; « Mois clôturé » (E16) reste sans attribut |
| `my-meetings`, `my-meeting`, `my-tasks`, `my-tasks-offline`, `my-task`, `my-task-time`, `my-task-done`, `aria-label` des tâches | réunion, tâches (E05c, E06) | inchangé |
| `reserves-banner`, `reserves.bandeau`, « Réserves à lever » | puce de rappel | inchangé |
| `reserves-dialog`, `wr-item`, `wr-lift`, `reserves.lever` | E20a | inchangé |
| `reserve-lift-submit`, `reserves.valider` | « Lever la réserve » (E20) | inchangé |
| « Journées à envoyer » · « Journée du {date} à envoyer » · « Chantiers pas encore partis » | E37 · note d'en-tête · note hors-ligne | inchangé |
| `week-meeting`, `week-tasks`, `week-task`, `semaine.jour`, « Envoyé », « Panier repas » (Semaine) | lignes de E25 | inchangé ; barres de E25 : nouvelles, `aria-hidden` |
| `menu-formations`, `menu-formations-badge` | ligne Formations de E26 et son badge | inchangé |
| `history-*`, `trainings-*`, `training-*`, `historique.jour`, `conges.*` | vues de la prochaine vague | inchangé |
| `draft-card`, `from-planning`, `{testId}`, « Chantier », « Retirer », « Début », « Fin » | fiche d'heures de l'assistant (AS2, AS3) | inchangé |
| `guide-*`, « Guide pas à pas » | composant inchangé | inchangé |
| `#kx-pass`, `pointer-company`, `pointer-login` | P00b | inchangé |
| `pointer-checking`, `-locating`, `-punching` | P00 | inchangé |
| `fixed-info`, `fixed-info-ok`, `fixed-info-no` | P04 | inchangé |
| `pointer-done`, `after-before` | P01 | inchangé |
| `after-send`, `after-add` | P02 | inchangé |
| `fixed-refused`, `fixed-refused-manual`, `fixed-refused-retry` | P03 | inchangé |
| `pointer-error`, `pointer-refused` | P03b | inchangé |
| `punch-cancelled` · « Rien à enregistrer » | P03c | inchangé |

**Guide pas à pas** : 7 cibles changent de place (`entete.scanner`, `journee.assistant`, `menu.journee`, `menu.semaine`, `menu.mois`, `editeur.documents`, `editeur.retirer`). Les 19 autres restent au même endroit relatif. Les phrases des guides concernés (`worker-tours.ts`) sont à mettre à jour, sans le mot « onglet ».

---

## 7. Composants

Dans `components/design/salarie/`, `'use client'`, sans appel réseau. Styles : classes `dz-*` de `salarie.css` **posées à côté** des classes `.bt-*` et des repères du §6.2. Aucun `style=` sauf `left` / `width` de la frise et `height` des barres (valeurs calculées).

| Composant | Racine | Props | Callbacks |
|---|---|---|---|
| `EnteteJournee` | `.bt-phdr.dz-entete.dz-sombre` | `kicker, titre, retour?, initiales, photo?` | `onRetour, onAssistant, onCompte` |
| `BandeJours` | `.dz-jours` | `jours, jourAffiche` | `onJour` |
| `NoteEntete` | `.dz-note-entete` | `ton, texte, action?` | `onAction` |
| `CartePointage` | `.bt-lt.dz-pointage` | `variante, chantier, debut, ecoule, finSaisie?, finLendemain?, erreur?` | `onTerminer, onFinChange` |
| `CarteTotal` | `.bt-total.dz-total` | `total, prevu?, semaine: {jour, heures, etat}[], verrouille` | — |
| `Compteurs` | `.bt-stats.dz-compteurs` | `tuiles: Tuiles` | `onPauses, onPanier` |
| `MiniFrise` | `.dz-frise` | `segments, maintenant?, base?` | — |
| `CarteChantier` | `.bt-iv.dz-carte` | `ligne, creneau, reserve?` | `onOuvrir, onLever` |
| `TrouRoutePause` | `.bt-gap.dz-trou` | `debut, fin, reponse` | `onRoute, onPause` |
| `CarteReunion` / `ListeTaches` | `.dz-reunion` / `.dz-taches` | inchangées | `onCocher(id)` |
| `BarreBas` | `.dz-barre` | `envoi: EtatEnvoi, aide, actif, pastillePlus` | `onAjouter, onScanner, onEnvoyer, onVue` |
| `Feuille` | `.bt-skin.dz-portail.dz-feuille` | `titre, kicker, role, pied` | `onFermer` |
| `EditeurIntervention` | `Feuille` + `.bt-ed` | `ligne, pauses, statut, note, erreur?` | `onOk, onRetirer, onDocuments, onHeure` |
| `ListeReserves`, `JourneesAEnvoyer` | `Feuille` + `.dz-ligne-liste` | `lignes[]` | `onLever(id)`, `onOuvrir(date)` |
| `Molette`, `CalendrierCopie` | `.bt-molette.dz-molette`, `.dz-calendrier` | `valeur` / `jours[]` | `onValider`, `onCopier` |

---

## 8. Tailles et cibles

Texte ≥ 12 px, actions 16 px. Cibles ≥ 44 px (ligne de tâche entière, crans de la molette, jours du calendrier, « Relancer » de la note d'en-tête). Décoratif : poignée, liseré des feuilles, bande de créneau, rayures, pulsation, traits « maintenant » et « minuit », barres des 7 jours (l'information est dans la Semaine et le total).

## 9. Assistant (AS1–AS10)

AS1 accueil (suggestions, « Me guider pas à pas ») · AS2 heures dites · AS3 à confirmer · AS4 historique, suppression en place Non / Oui · AS5 vide · AS6 « Tout effacer ? » en place · AS7 formulaire pré-rempli (✕ seulement) + pastille sur 2 lignes · AS8 retour · **AS9** chargement, « Historique indisponible », « Une action est en cours… », quota, « Abandonner cette action ? » · **AS10** questions heures, planning, collègues (S90 ; collègues seulement si l'entreprise l'autorise).

## 10. Technique

- `tokens.css` puis `salarie.css`. Jetons sur `.dz-salarie, .bt-skin, .dz-portail` : un contenu Radix qui ne porte que `.bt-skin` reçoit bien les `--dz-*`.
- Voile Radix (`ui/dialog.tsx:24`, `bg-black/80`) : passer `className="dz-voile"` à l'`Overlay` des fenêtres salarié.
- Focus : `:focus-visible { box-shadow: var(--dz-focus) }` dans les trois portées.
- Prochaine vague (Mois, Historique, congé, documents, formations) : mêmes règles, mêmes jetons, repères du fichier 01 §B–C gardés tels quels.
