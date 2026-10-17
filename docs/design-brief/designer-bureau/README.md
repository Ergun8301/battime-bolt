# BEMEXO · Dossier écran bureau (/admin) · lots 1 à 3

Maquettes : `BEMEXO Bureau - Dossier.dc.html` (186 écrans : 60 Planning, 38 Heures et paie, 88 le reste). Onglets en haut pour passer d'un lot à l'autre ; `?ecran=PL17` affiche un seul écran.
Fichiers : `tokens.css` (portée `.dz-bureau`, `.bt-skin`, `.dz-portail`), `donnees-exemple.ts`, `bureau-base.js` + `bureau-lot1/2/3.js` (données des écrans de la planche, pas du code à livrer).
Dépendances ajoutées : **aucune**. Polices : Archivo, JetBrains Mono. Direction : **1a**, plein écran, bandeau de chiffres repliable.

## 0. Décisions prises avant de dessiner

1. **Pas d'étape « Valider »** (conforme au cahier) : Feuille d'heures, Corriger, Renvoyer, Relancer.
2. **Hors ligne** : seulement les échecs d'enregistrement (PL11). Pas de bannière.
3. **NOUVEAU, dessiné** : légende sur téléphone (PM04), repère « mois clôturé » (PL04, PL28), Échap ferme tout (PL05), refus du glisser d'un client sur une absence ou un mois clos (PL27, PL28), total d'heures sur le planning (PL01 : bandeau, total par jour, total par salarié). Les autres « manque aujourd'hui » ne sont pas dessinés (vue mois à l'écran, aller à une date, recherche dans le planning, déplacer au téléphone).
4. **Écrans ◇** : habillage BEMEXO, contenu identique (marqués « ◇ CONTENU CONSERVÉ »).
5. **Un seul accès par fonction** (voir §1).
6. **Clients / Chantiers** : les deux intitulés restent (barre / ☰).
7. **Assistant** : « Nouveau chat » et « Historique » (30 jours) dessinés comme fonctions réelles (IA06). L'inventaire qui disait « conversation effacée au rechargement » ne fait plus foi.

## 1. Où se trouve chaque fonction

**Ordinateur (≥ 1 024 px)**
- **Barre noire** (60 px, z 30) : logo · Planning / Statistiques · essai + « S'abonner » · ✦ Assistant · compte « Entreprise Test ▾ » (Réglages de l'entreprise, Déconnexion).
- **Barre de semaine** : S-NN + période, ← →, Aujourd'hui · Clients · Salariés (badge = congés + invitations) · Réserves (badge) · Sélectionner · imprimer (icône 34 px) · Borne · Plus ⋯ · Exporter · plein écran ⤢.
- **Plus ⋯** : Coût chantiers, Versions du planning, Interventions supprimées ou décalées, Formations, Envoyer par e-mail.
- **Bandeau repliable** : heures envoyées (barres des 7 jours), À relancer, En direct, Absents, Pièces. Replié : une ligne de 40 px. Choix gardé par utilisateur.
- **Salariés** : Nouveau salarié, Importer, Demandes de congé, Invitations en attente, accès bureau, liste.

**Doublons retirés** : Formations (était dans le menu du compte et dans Salariés) → Plus ⋯ seulement. Réglages (menu du compte et ☰) → menu du compte sur ordinateur, ☰ sur téléphone. Envoyer par e-mail (menu du compte) → Plus ⋯. Lien « historique des suppressions » dans Réglages → retiré, Plus ⋯ seulement. Compteurs « congés », « réserves » de l'ancienne barre noire → badges de Salariés et Réserves seulement. **À reporter dans `admin-tours.ts`.**

**Téléphone (< 1 024 px)** : en-tête noir (entreprise, essai + S'abonner, ✦, ☰), semaine ← →, 7 jours, compteurs (à relancer, en direct, absent). Menu ☰ = point d'entrée unique avec les intitulés du cahier, plus « Légende ».

## 2. Libellés

Gardés mot pour mot : Salariés, Clients / Chantiers, Réserves / Réserves de chantier, Sélectionner / Sélectionner des interventions, Coût chantiers / Coûts (< 1 280 px), Exporter, S'abonner, Réglages de l'entreprise, Feuille d'heures, Présent, Me guider pas à pas, menu ☰.
**Aucun renommage.** Nouveaux libellés : « Replier ▴ », « Déplier ▾ », « Légende ▾ », « CLOS », « Refusé : … » (cible de dépôt), « Déposer ici · sans horaire ».
Libellés fixes sans verbe de geste ; « Cliquez » seulement dans les notes d'ordinateur (IA07), « Touchez » au téléphone (XM10).

## 3. Règles visuelles

- **Bulle d'intervention** : bande gauche = créneau ; pastille = couleur du chantier ; prévue = pointillés ; à envoyer = trait #C98500 + « À ENVOYER » ; envoyée = fond encre, heure jaune, « ENVOYÉ » vert ; en direct = fond #E7F6EE + « EN COURS DEPUIS HH:MM » ; retirée = barrée, grisée ; ajoutée par le salarié = trait encre + étiquette encre/jaune ; jour passé sans heures = « PAS D'HEURES ENVOYÉES ». Même composant à l'écran, sur papier, sur la borne, en grand (téléphone) et en compact (grille).
- **Absences** : rayures 135°, mêmes valeurs que le salarié (décision validée). La borne et l'imprimé seront alignés ensuite.
- **Glisser** : source à 45 %, contour pointillé ; case visée jaune pâle + anneau jaune + « Déposer ici » / « Copier ici » ; refus : anneau rouge + « Refusé : raison » puis message.
- **Sélection** : case à cocher sur chaque bulle ; verrouillée = « – » grisé, la raison au clic.
- **Mois clôturé** : en-tête et cases #EFE9DE, étiquette « CLOS » (#655B50, blanc 6,4:1), aucune case « + ».
- **Fenêtres** : liseré jaune 4 px en haut ; centrée 20 px de rayon ; panneau latéral 480 px (760 px pour Fiche salarié, Exporter, Réglages, Documents) ; feuille du bas 28 px au téléphone. Voile 50 % (fenêtre), 32 % (panneau).
- **Focus** : contour 2 px encre, décalage 2 px (jaune sur fond noir) ; `forced-colors` : CanvasText. Les boutons n'ont plus d'ombre interne : le contour ne se cache plus.
- **Cibles** : 40 px au pointeur, 44 px au toucher, 48 px pour les boutons principaux du téléphone. Cases à cocher du téléphone 26 px dans une ligne de 44 px.
- **Textes** : 11 px minimum (étiquettes mono de la grille), 12,5 px pour les phrases.

## 4. Superposition

20 page Statistiques · 30 barre collante, pastille plein écran, bandeau de sélection · 40-45 bandeau, menus, tiroir Clients · 50 fenêtres et panneaux (55-56 quand une fenêtre s'ouvre sur un panneau) · 60 guide et ✦ · 70 panneau assistant · 90 bandeau support · 95 Informations · 96 lecteur de QR · messages au-dessus de tout.
Rôles `dialog` / `alertdialog` seulement sur les fenêtres modales (Ctrl/Cmd+P en dépend) ; ni le bandeau ni les menus n'en portent.

## 5. Décisions validées et points ouverts

- Absences : celles du salarié (rayures 135°) — validé. Borne et imprimé à aligner ensuite.
- Lien « Salariés archivés » : retiré (ce serait une nouvelle fonction).
- Doublons retirés (Formations et « Envoyer par e-mail » dans Plus ⋯, Réglages dans le menu du compte) : validé.
- Lignes vides du planning : supprimées, validé (la grille s'arrête au dernier salarié). Le calcul `GHOST_ROW_H` peut être retiré.
- Tablette paysage : disposition ordinateur ; le glisser au doigt reste « non garanti ».
- Borne : hors de ce dossier ; elle garde l'ancien rendu tant que ses classes ne passent pas en `dz-`.

## 6. Liste de contrôle B1 à B72

Les 72 lignes sont couvertes. Écrans cités = écrans où la capacité est visible (10 premiers).

| B | Capacité | État | Écrans |
|---|---|---|---|
| B1 | Voir la semaine | Dessiné | PL01, PL03, PM01 |
| B2 | Lire une intervention | Dessiné | PL01, PL13, PL17, PM01 |
| B3 | Prévue / à envoyer / envoyée | Dessiné | PL01, PM01, HP01 |
| B4 | Retirée, ajoutée, hors planning | Dessiné | PL01, PL19, PL39, PM01, HP01 |
| B5 | Réception | Dessiné | PL01, PL19, PM01, HP01, CL16 |
| B6 | Nombre de documents | Dessiné | PL01, PL19, PL44, PM01 |
| B7 | Pointage en direct | Dessiné | PL01, PM01 |
| B8 | Absence du jour | Dessiné | PL01, PM01 |
| B9 | Jours en attente / À jour | Dessiné | PL01, PM01, PM02 |
| B10 | Réunions et tâches | Dessiné | PL01, PL37, PM01 |
| B11 | Légende | Dessiné | PL02, PM04 |
| B12 | Changer de semaine, S-NN | Dessiné | PL01, PL04, PM01 |
| B13 | Téléphone : un jour au choix | Dessiné | PM01, PM02, PM16 |
| B14 | Rechercher client, salarié | Dessiné | PL26, CL01, CL02, EQ01, XM01 |
| B15 | Créer une intervention | Dessiné | PL13, PL14, PM06 |
| B16 | Glisser un client | Dessiné | PL26, PL27, PL28, CL01 |
| B17 | Modifier horaire, note ; lire heures | Dessiné | PL17, PL18, PL19, PM05 |
| B18 | Déplacer, réordonner | Dessiné | PL22 |
| B19 | Copier par glisser | Dessiné | PL23 |
| B20 | Copier vers / dupliquer | Dessiné | PL17, PL18, PL20, PL21, PM05, PM07 |
| B21 | Comprendre un refus | Dessiné | PL04, PL19, PL20, PL24, PL25, PL27, PL28, PL32, PM07, PM10 … |
| B22 | Supprimer une intervention | Dessiné | PL19, PL29, PM05, PM15 |
| B23 | Annuler suppression / copie | Dessiné | PL30, PM15, HP10 |
| B24 | Sélection multiple | Dessiné | PL31, PL32, PL33, PM09, PM10 |
| B25 | Poser une absence | Dessiné | PL34, PL35, PM08, HP14 |
| B26 | Remettre Présent | Dessiné | PL34, PL36, PM08 |
| B27 | Tâches et réunions | Dessiné | PL15, PL16, PL17, PL37, PL38, PM05 |
| B28 | Attribuer un client | Dessiné | PL39 |
| B29 | Inviter, importer salariés | Dessiné | EQ01, EQ02, EQ03, XM03 |
| B30 | Invitations en attente | Dessiné | EQ04, EQ05, EQ06, XM03 |
| B31 | Changer un rôle | Dessiné | EQ01, EQ07, EQ08, XM03 |
| B32 | Fiche salarié | Dessiné | EQ09 |
| B33 | Habilitations, coût réel | Dessiné | EQ09, EQ13 |
| B34 | Archiver, clôturer, supprimer salarié | Dessiné | EQ09, EQ10, EQ11, EQ12, EQ14 |
| B35 | Créer, importer clients | Dessiné | CL01, CL03, CL04, CL08, CL09, XM01 |
| B36 | Fiche client, budget, archiver | Dessiné | CL05, CL06, CL07, XM02 |
| B37 | Documents du chantier | Dessiné | CL05, CL10, CL11, CL12, CL13, XM02 |
| B38 | Terminer, rouvrir, bilan | Dessiné | CL05, CL14, CL15, XM02 |
| B39 | Feuille d’heures | Dessiné | PL34, HP01, HP02, HP03, HM01 |
| B40 | Corriger, renvoyer, brouillon vide | Dessiné | HP03, HP04, HP05, HP06, HP07, HP08, HP09, HP10, HM02, HM03 |
| B41 | Relancer | Dessiné | PL42, PL43, PM14, HP11, RG04 |
| B42 | Congés | Dessiné | HP12, HP13, HP14, HP15, HP16, HM04 |
| B43 | Exporter l’équipe | Dessiné | HP17, HP18, HP23, HM05 |
| B44 | Envoyer au comptable | Dessiné | HP06, HP17, HP18, HP19, HP21, HP25, HP26, HP27, HM05 |
| B45 | Verrou avant export | Dessiné | HP20, HP21, HP22, HP23, HP24, HM06 |
| B46 | Clôturer / rouvrir un mois | Dessiné | PL28, HP18, HP28, HP29, HP30, HM05, HM07 |
| B47 | Exporter un salarié | Dessiné | HP18, HP31 |
| B48 | Imprimer A4 | Dessiné | PL40, PL41 |
| B49 | Versions | Dessiné | PL05, ST05, ST06, ST07, ST08, XM13 |
| B50 | Historique suppressions | Dessiné | PL05, ST09, XM14 |
| B51 | Statistiques | Dessiné | ST01, ST02, XM07 |
| B52 | Coût par chantier | Dessiné | PL05, ST03, ST04, XM06 |
| B53 | Pièces jointes | Dessiné | PL44 |
| B54 | Réserves | Dessiné | CL16, CL17, CL18, XM04 |
| B55 | Relier la tablette | Dessiné | RG03, RG07, RG08, RG09, RG10, XM05 |
| B56 | QR fixe | Dessiné | RG09, RG11 |
| B57 | Formations | Dessiné | PL05, EQ15, EQ16, EQ17, XM15 |
| B58 | E-mails aux salariés | Dessiné | PL05, EQ18, EQ19, XM16 |
| B59 | Réglages entreprise | Dessiné | PL06, RG01, RG05, RG06, XM08 |
| B60 | Heures & paie | Dessiné | RG02, XM08 |
| B61 | Borne & pointage | Dessiné | RG03, XM08 |
| B62 | Notifications | Dessiné | RG04, XM08 |
| B63 | Support BEMEXO | Dessiné | RG04, RG16, RG17, XM08 |
| B64 | Essai, abonnement | Dessiné | PM03, RG01, RG12, RG13, RG14, RG15, XM12 |
| B65 | Menu du compte | Dessiné | PL06, PM03 |
| B66 | Dialoguer avec l’assistant | Dessiné | IA01, IA04, IA05, IA08, XM09 |
| B67 | Faire agir l’assistant | Dessiné | IA02, IA03, XM09 |
| B68 | Guide, nouveau chat, historique | Dessiné | IA04, IA06, IA07, XM10, XM11 |
| B69 | Aides | Dessiné | PL09, PL12, PL14, PM13, RG18 |
| B70 | Voir ce qui attend | Dessiné | PL42, PM01, HP12, EQ01, EQ04 |
| B71 | États | Dessiné | PL07, PL08, PL09, PL10, PL11, PL41, PM11, PM12, PM13, HP16 … |
| B72 | Téléphone : point d’entrée unique | Dessiné | PM03, XM10 |


## 7. Écrans

### Planning (60 écrans)

**Semaine, bandeau, navigation**

- `PL01` Semaine · chiffres dépliés · NOUVEAU
- `PL02` Semaine · chiffres repliés, légende ouverte
- `PL03` Plein écran
- `PL04` Autre semaine · mois clôturé · NOUVEAU
- `PL05` Plus ⋯ ouvert · NOUVEAU
- `PL06` Menu du compte

**États de l’écran**

- `PL07` Chargement
- `PL08` Échec de lecture
- `PL09` Entreprise vide · aide de démarrage
- `PL10` Semaine vide
- `PL11` Échec d’enregistrement
- `PL12` Astuce « Copier une case »

**Ajouter**

- `PL13` Ajouter · Intervention
- `PL14` Ajouter · horaire refusé
- `PL15` Ajouter · Tâche
- `PL16` Ajouter · Réunion

**Intervention : lire, modifier, copier**

- `PL17` Intervention prévue
- `PL18` Intervention · changements non enregistrés
- `PL19` Intervention avec heures envoyées
- `PL20` Copier vers un autre jour
- `PL21` Copie faite

**Glisser-déposer (ordinateur)**

- `PL22` Déplacer
- `PL23` Copier (Ctrl, Alt ou ⌘)
- `PL24` Dépôt refusé · absence
- `PL25` Départ refusé · heures envoyées
- `PL26` Glisser un client
- `PL27` Client refusé · absence · NOUVEAU
- `PL28` Client refusé · mois clôturé · NOUVEAU

**Supprimer, sélectionner**

- `PL29` Supprimer ? · heures retirées
- `PL30` Supprimée · Annuler
- `PL31` Mode « Sélectionner »
- `PL32` Sélection · raison du verrou
- `PL33` Supprimer (3) ?

**Statut, absences, tâches, réunions**

- `PL34` Statut du salarié
- `PL35` Poser une absence
- `PL36` Remettre « Présent »
- `PL37` Tâches de la case
- `PL38` Réunion
- `PL39` Heures ajoutées par le salarié · attribuer

**Imprimer, compteurs**

- `PL40` Imprimer le planning
- `PL41` Imprimer · préparation, échec
- `PL42` À relancer · détail
- `PL43` À relancer · à jour
- `PL44` Pièces · détail

**Téléphone et tablette (sous 1 024 px)**

- `PM01` Jour · aujourd’hui
- `PM02` Jour · lundi
- `PM03` Menu ☰
- `PM04` Légende · NOUVEAU
- `PM05` Intervention
- `PM06` Ajouter un chantier
- `PM07` Copier vers un autre jour
- `PM08` Statut du salarié
- `PM09` Sélectionner des interventions
- `PM10` Sélection · verrou
- `PM11` Chargement
- `PM12` Échec de lecture
- `PM13` Entreprise vide
- `PM14` À relancer
- `PM15` Supprimée · Annuler
- `PM16` Tablette portrait (834 px)

### Heures et paie (38 écrans)

**Feuille d’heures**

- `HP01` Feuille d’heures · cette semaine · ◇
- `HP02` Feuille d’heures · créneau · ◇
- `HP03` Ligne · détail et historique · ◇

**Corriger, renvoyer, relancer**

- `HP04` Corriger des heures · ◇
- `HP05` Corriger · motif trop court · ◇
- `HP06` Corriger · journée chez le comptable · ◇
- `HP07` Correction enregistrée · ◇
- `HP08` Renvoyer une journée · ◇
- `HP09` Renvoyer · refusé · ◇
- `HP10` Brouillon vide supprimé · ◇
- `HP11` Relancer · sans notification · ◇

**Demandes de congé**

- `HP12` Congés · en attente · ◇
- `HP13` Refuser un congé · ◇
- `HP14` Congé accepté · ◇
- `HP15` Congés · traitées · ◇
- `HP16` Congés · aucune demande · ◇

**Exporter, comptable, verrou**

- `HP17` Exporter · sans période
- `HP18` Exporter · période choisie
- `HP19` Exporter · comptable non réglé
- `HP20` Alerte de verrouillage
- `HP21` Alerte · envoi au comptable, période déjà partie
- `HP22` Alerte · chiffres changés
- `HP23` Export fait
- `HP24` Verrou en échec après le fichier
- `HP25` Envoi · déjà envoyé
- `HP26` Envoi réussi
- `HP27` Envoi échoué · comptage illisible

**Clôture du mois, un seul salarié**

- `HP28` Clôturer septembre ?
- `HP29` Mois clos
- `HP30` Rouvrir septembre ?
- `HP31` Exporter un salarié

**Téléphone**

- `HM01` Feuille d’heures · ◇
- `HM02` Corriger · ◇
- `HM03` Renvoyer · ◇
- `HM04` Demandes de congé · ◇
- `HM05` Exporter
- `HM06` Alerte de verrouillage
- `HM07` Clôturer le mois

### Chantiers, équipe, statistiques, réglages (88 écrans)

**Clients, chantiers, documents, réserves**

- `CL01` Liste Clients
- `CL02` Clients · aucun résultat
- `CL03` Nouveau client
- `CL04` Nouveau client · nom manquant
- `CL05` Fiche client · ◇
- `CL06` Supprimer refusé · ◇
- `CL07` Archiver le client ? · ◇
- `CL08` Importer des clients · ◇
- `CL09` Importer · aperçu et erreurs · ◇
- `CL10` Documents · photos · ◇
- `CL11` Documents · fichiers et catégorie · ◇
- `CL12` Envoyer au client · ◇
- `CL13` Ajout refusé · fichier trop lourd · ◇
- `CL14` Terminer le chantier · ◇
- `CL15` Bilan du chantier · ◇
- `CL16` Réserves · à traiter · ◇
- `CL17` Lever une réserve · ◇
- `CL18` Réserves · levées, rouvrir · ◇

**Salariés, invitations, rôles, fiche**

- `EQ01` Salariés
- `EQ02` Nouveau salarié · e-mail invalide
- `EQ03` Importer des salariés · ◇
- `EQ04` Invitations en attente
- `EQ05` Envoyer toutes · arrêt à la première erreur
- `EQ06` Supprimer une invitation ?
- `EQ07` Changer le rôle · chef d’équipe
- `EQ08` Retirer le dernier accès bureau · refusé
- `EQ09` Fiche salarié · Gérer · ◇
- `EQ10` Clôturer les heures · ◇
- `EQ11` Clôture refusée · ◇
- `EQ12` Archiver le salarié ? · ◇
- `EQ13` Coût réel · bulletin · ◇
- `EQ14` Salarié archivé · ◇

**Formations, e-mails aux salariés**

- `EQ15` Formations · ◇
- `EQ16` Ajouter une formation · ◇
- `EQ17` Formation · qui l’a vue · ◇
- `EQ18` Envoyer par e-mail · ◇
- `EQ19` Envoyer 3 e-mails ? · ◇

**Statistiques, coûts, versions, historique**

- `ST01` Statistiques · ◇
- `ST02` Statistiques · détail salarié · ◇
- `ST03` Coût chantiers · ◇
- `ST04` Ajouter une dépense · ◇
- `ST05` Versions du planning · ◇
- `ST06` Aperçu d’une version · ◇
- `ST07` Revenir à la V2 ? · ◇
- `ST08` Retour refusé · planning bougé · ◇
- `ST09` Interventions supprimées ou décalées · ◇

**Réglages de l’entreprise**

- `RG01` Réglages · Entreprise · ◇
- `RG02` Réglages · Heures & paie · ◇
- `RG03` Réglages · Borne & pointage · ◇
- `RG04` Réglages · Notifications & support · ◇
- `RG05` Fermer sans enregistrer ? · ◇
- `RG06` Logo refusé · ◇

**Borne de pointage**

- `RG07` Borne · aucune tablette · ◇
- `RG08` Associer cette tablette ? · ◇
- `RG09` Borne reliée · ◇
- `RG10` Déconnecter la tablette ? · ◇
- `RG11` Activer le QR fixe ? · ◇

**Abonnement, support, aides**

- `RG12` Choisissez votre abonnement
- `RG13` Essai terminé · blocage · ◇
- `RG14` Essai expiré · sans blocage
- `RG15` Activation…
- `RG16` Autoriser le support BEMEXO · ◇
- `RG17` Mode support · lecture seule
- `RG18` Infobulle et saisie d’heure

**Assistant BEMEXO et guide**

- `IA01` Assistant · accueil
- `IA02` Action directe faite
- `IA03` Carte à confirmer
- `IA04` Explication seule
- `IA05` Pièce jointe et dictée
- `IA06` Historique des conversations
- `IA07` Guide pas à pas
- `IA08` Assistant · message trop long, échec

**Téléphone · écrans du menu ☰**

- `XM01` Chantiers
- `XM02` Fiche client · ◇
- `XM03` Salariés
- `XM04` Réserves de chantier · ◇
- `XM05` Borne · ◇
- `XM06` Coût chantiers · ◇
- `XM07` Statistiques · ◇
- `XM08` Réglages de l’entreprise · ◇
- `XM09` Assistant
- `XM10` Guide · menu ☰
- `XM11` Guide refusé · glisser requis
- `XM12` Essai terminé · blocage · ◇
- `XM13` Versions du planning · ◇
- `XM14` Interventions supprimées ou décalées · ◇
- `XM15` Formations · ◇
- `XM16` Envoyer par e-mail · ◇