# Cahier des fonctionnalités : écran principal du salarié

Ce cahier dit ce que l'écran du salarié fait **actuellement** (route /poseur, page /pointer). Rien sur la forme : parcours, hiérarchie, couleurs, composition, gestes sont libres. Obligations : couvrir les capacités S1 à S104 de l'annexe, respecter les règles métier, tenir dans la section 8. « Actuellement » = constat sur la version en service, remplaçable tant que les capacités restent ; les mots entre guillemets sont les libellés actuels ; « O3 » = objectif 3 (section 2). Tout existe dans le code ; ce qui n'est pas en service est signalé.

## 1. À qui sert l'écran, dans quelles conditions

- **Qui** : salarié (ouvrier, poseur) et chef d'équipe, qui a en plus « Mon équipe » (O10). Patron et secrétaire : autre écran.
- **Appareil** : téléphone en portrait, application installable ; usage sur ordinateur possible (actuellement format téléphone ; seules Semaine, Mois, Historique s'élargissent).
- **Conditions** (indications du patron, non mesurées) : sur chantier, souvent debout et une main libre, parfois avec des gants ou les mains sales ; réseau absent par moments (l'écran gère le hors-ligne) ; publics peu à l'aise avec l'informatique ; journée parfois remplie le soir ou le lendemain.
- **Langue** : français partout ; seul l'assistant comprend le turc (dictée, écrit) et répond dans la langue posée, fiches, boutons et messages restant en français. **Tutoiement** : Ma journée, carte de pointage, Mon équipe, pauses, messages. **Vouvoiement** : /pointer, fenêtre « Votre pointage est encore en cours », assistant, guides. Ne pas unifier sans réécrire guides et assistant.
- **Vocabulaire à garder** : chantier ; intervention (ligne d'heures sur un chantier) ; pointage ; pause ; panier (repas) ; route (trajet entre chantiers) ; réserve ; « Envoyer ma journée » ; secrétaire, bureau ; borne ou tablette (écran fixe avec QR) ; prévu ; « chez le comptable » (remis à la paie) ; sortie oubliée ; congé, arrêt maladie, intempérie ; « Autre chantier ».

## 2. Ce que la personne doit pouvoir faire

Depuis tout écran : accès à Ma journée, Semaine, Mois, Historique, Formations, congés, informations, déconnexion. Actuellement, « Ma journée » (aujourd'hui par défaut, ou un autre jour ouvert depuis Semaine, Mois ou un rappel) concentre presque tout ; les autres vues sont dans le menu du compte ; le reste s'ouvre en fenêtres.

### O1. Savoir ce qu'on attend de moi (S1 à S9)
**Données** : créneaux prévus (chantier, ville, début, fin ; Matin / Après-midi / Journée ou heures libres ; début seul = « fin à préciser », sans heures = « heures à préciser ») ; absences (congé, maladie, intempérie, repos) ; réunions (titre, heures, lieu, équipe ou invité) ; tâches (texte, heures ou moment, fait ou non). **Règles** : le prévu n'est pas du travail : hors total, envoyé après un « oui » (O4), il disparaît quand des heures saisies le couvrent ; chevauchant ou sans début/fin, il ne partira pas et l'écran le dit. Absences : Semaine et Mois seulement. Réunions et tâches jamais en heures. Tâche cochée : enregistrée aussitôt (annulée avec message si refus), réseau requis.
**Affichage** : (S1) jour affiché lisible, retour à aujourd'hui (flèche) ; (S5) pastille de documents (nombre) sur les cartes prévues et saisies ; (S7) « Tâches du jour », compteur « 1/3 » (si installé) ; (S9) « Terminé le … » d'un chantier terminé : cartes, pointage en cours, Semaine, Mois, Historique (si installé).

### O2. Pointer (S10 à S16)
**Possible** : (a) scanner le QR de la tablette : appareil photo du téléphone (→ /pointer, section 7) ou lecteur intégré (si tablette reliée ou QR fixe actif ; caméra arrière, QR étranger refusé, « Caméra refusée… scannez avec l'appareil photo du téléphone », fermer éteint la caméra) ; le serveur décide arrivée ou départ ; (b) terminer un pointage ouvert (« Terminer ma journée ») ; (c) sans tablette, saisir ses heures (O3). **N'existe plus** : démarrer ou annuler un pointage par un bouton de l'écran ou de l'assistant ; scanner un QR avec le téléphone pointe bien.
**Pointage en cours** (jour courant) : chantier, début posé par le serveur (Paris), temps écoulé en direct. Pas une heure travaillée : la ligne naît à « Terminer » (moins d'une minute = annulé sans erreur) ; le total inclut les minutes courantes ; « Envoyer » ne l'envoie jamais ; l'intervention correspondante indique « en cours depuis HH:MM » et ne s'ouvre pas. « Terminer » : fermé (« 08:00 à 16:30 »), annulé, déjà fermé, erreur (il reste ouvert).
**Pointage oublié** (ouvert un jour précédent) : « Sortie oubliée … depuis lundi 08:00 », « Tu as fini à quelle heure ? » ; fin = début refusée (message) ; fin < début = fin le lendemain, annoncée avant d'écrire (« Fin le lendemain … la nuit est comptée sur la journée du début »). Chaque nuit (vers 1 h 30 – 2 h 30, Paris), un pointage d'un jour précédent ouvert depuis plus de 14 h (un poste de nuit commencé à 21 h reste ouvert) devient une ligne « sortie oubliée » à envoyer (fin = heure prévue, sinon « fin à compléter » : non envoyable) ; jour clôturé (mois ou salarié) : il reste ouvert. Ouvert, il s'affiche en « Sortie oubliée », même un poste de nuit en cours.

### O3. Saisir, corriger, retirer ses heures (S17 à S38)
**Éditeur** (nouvelle intervention, créneau prévu, ligne existante, saisie sur le téléphone) ; champs, ordre libre :
- **Chantier** : actifs (nom, ville) + recherche ; « Autre chantier — travail non prévu » toujours proposé, même pendant une recherche sans résultat (il disparaît actuellement si la recherche ne contient pas « autre ») : « C'était quoi ? » (nom 80 car., ville 60), « Ajouter ce chantier » crée un vrai chantier visible du bureau (réseau requis, sinon heures sur « Autre »). Chantier terminé proposé jusqu'à sa date de fin ; ligne existante ou prévu : chantier figé.
- **Début, fin** : défaut au quart d'heure ; toute heure retouchée est écrite telle quelle, une heure non retouchée reste intacte (08:07 gardé : l'arrondi ne pénalise jamais) ; fin avant début = nuit ; durée nette = fin − début − pause.
- **Total des pauses de la ligne** : 0, 15 min, 30, 45, 1 h, 1 h 30, 2 h ou « Autre » h:mm ; plusieurs pauses : additionner ; strictement plus courte que la ligne, sinon OK bloqué. Lecture de « Autre » (à garder, quel que soit le widget) : accepte 45, 45 min, 1h30, 1:15, 1,15 ; refuse 1:5, 1h5, 1,5, 1:75, un chiffre seul de 1 à 9 (« Écris 1:00 pour une heure, ou 5 min. »), plus de 12 h ; illisible : « Durée non comprise. Ex. 1:15 ou 45 min. » ; aperçu « = 1 h 15 » ; puces plus longues que la ligne grisées.
- **Statut du chantier** (facultatif) : En cours / Sans réserve / Avec réserve (retoucher = retirer). **Note** (facultative), « Détail des réserves » si Avec réserve.
- **Documents** (si le chantier est connu : ni saisie du téléphone, ni avant son choix) ; **retirer** (ligne existante) ; **OK** ; **Annuler** (sans confirmation).

**OK** vérifie : heures remplies et différentes, pas de chevauchement, pause valide, chantier choisi ; n'écrit que ce qui a changé. Intervention recouvrant le pointage en cours : « Votre pointage est encore en cours » (en ligne, jour courant, heures modifiées seulement ; hors-ligne l'enregistrement passe, toast « ces heures seront vérifiées au retour du réseau ») ; un cas à deux boutons, « Terminer le pointage à HH:MM, puis ajouter/enregistrer » ou corriger ; cinq cas à bouton unique « Corriger les heures » (intervention avant le début du pointage, début quasi identique, début futur, collision avec une ligne déjà notée, fonction indisponible).
**Retirer** (confirmation) : jamais envoyé → supprimé ; envoyé une fois (même renvoyé) → « Retiré », hors total.
**Trous** : entre deux interventions, un écart ≤ 2 h demande Route ou Pause (réponse sur l'intervention suivante), sinon ni l'une ni l'autre (« N à préciser ») ; > 2 h : pas de question ; route « payée » ou non selon l'entreprise.
**Panier** : un par jour ; absent si l'entreprise n'en utilise pas ; sur journée vide, choix gardé puis posé sur la première ligne ; impossible si tout est chez le comptable.
**Copier** (en ligne seulement) : « Copier la journée d'hier » (journée vide, sans carte prévue) ; « Dupliquer cette journée » vers d'autres jours (aujourd'hui ou à venir, jour affiché exclu, sélection multiple) : chantier, heures, pause, note (planning rattaché si le même chantier y est prévu), jamais le panier, les lignes retirées ni de 0 minute ; copies « à envoyer ». Aucun contrôle de chevauchement, de jour envoyé ou clôturé : un refus du serveur fait échouer toute la copie (« Impossible de copier »), un jour rempli reçoit des chevauchements qui bloqueront l'envoi. Un seul message, pas d'erreur par jour (retours par jour = nouvelle fonction).
**Retours du bureau** : « Le bureau a corrigé : 08:00–12:00 → 08:00–12:30 » + motif, ou « Ton chef a corrigé » ; « Endroit noté » seulement si enregistré (anciennes lignes, O11).
**Verrous** : ligne « chez le comptable » intouchable ; mois ou heures du salarié clôturés : plus d'ajout, d'ouverture, de panier, de route/pause ni de copie (« Mois clôturé » / « Heures clôturées », renvoi à la secrétaire qui peut rouvrir).

### O4. Envoyer sa journée (S39 à S48)
**États du geste (5)** : hors-ligne (grisé) ; saisies sur le téléphone, « Envoyer ce qui reste (N) » (actif, spinner) ; prêt ; « Journée envoyée ✓ » ; rien à envoyer (grisé, « Envoyer ma journée → » : journée vide, lignes toutes chez le comptable ou seul un pointage en cours). « Envoyer ce qui reste (N) » ne fait que transférer les saisies : elles arrivent « à envoyer », un second geste envoie la journée. Exception rare (coupure juste après le toucher d'« Envoyer ma journée ») : « Journée gardée sur le téléphone — elle partira dès que tu auras du réseau » ; elle part envoyée toute seule.
**Contrôles dans l'ordre** : (1) sortie oubliée sans fin : refus ; (2) chevauchement : refus avec les heures ; (3) prévu non saisi : « Horaires prévus par le bureau » (« Tu as travaillé exactement ces horaires ? ») Oui / Non, je corrige / « Envoyer seulement mes heures notées » (seulement s'il y a déjà des heures notées) ; (4) plage > 6 h d'affilée (écarts < 20 min) sans pause : « Tu as pris une pause ? » Non / 15 min à 2 h / Autre, une plage à la fois ; (5) aucune ligne : « Ajoute un chantier » ; (6) total des heures qui vont partir (brouillons + prévu confirmé, hors lignes déjà envoyées, pause déduite) strictement > 10 h : « Vérification » Corriger / Confirmer l'envoi ; (7) envoi. **Issues** : « Journée envoyée » ; « N chantiers envoyés sur M — les autres sont verrouillés » ; rien envoyé ; refus de clôture.
**Après envoi** : « Journée déjà envoyée » (Annuler / Continuer, secrétaire informée) ne s'ouvre au toucher d'une ligne, du panier, de « + », de Route/Pause ou de l'envoi que si toutes les lignes du jour sont envoyées et que rien n'attend sur le téléphone. Journée mixte (ligne envoyée + brouillon) : pas de confirmation ; corriger une ligne envoyée prévient quand même la secrétaire (« Correction envoyée — la secrétaire est prévenue », après enregistrement) ; retirer une ligne envoyée garde sa confirmation. **Renvoyée** : le bureau renvoie une journée avec un motif ; lignes « à envoyer ».
**Rappels** : « journée du 18 octobre à envoyer » (une : ouvre ce jour) ou « N journées à envoyer » (liste) = jours planifiés passés sans heures envoyées (absences exclues) + jours ≤ aujourd'hui avec lignes à envoyer ; un jour futur n'est pas un oubli.
**Après un scan** : « Ajouter une intervention » (plage autour de l'heure scannée) ou « Envoyer ma journée » (« Envoyer votre journée maintenant ? » Oui / Pas maintenant, puis les contrôles) ; valable 3 min, même compte, jour courant.

### O5. Semaine, mois, historique (S49 à S54)
**Semaine** (lundi–dimanche) : navigation, total « envoyées » ; par jour (jour courant identifiable) : affectations (chantier, ville, Matin / Après-midi / Journée ou heures), absences + note, réunions, tâches avec heure, heures notées avec leur état (envoyée, « Retirée ») ; toucher un jour l'ouvre. Les 7 jours doivent tous être visibles (la grille actuelle du grand écran, à 6 colonnes, fait passer le dimanche à la ligne : défaut).
**Mois** : navigation, total envoyé ; seulement les jours avec planning ou heures : date, total ou « À envoyer » / « À déclarer », planning ; toucher ouvre le jour.
**Historique** : toutes les interventions, récentes d'abord, par jour (total envoyé, paniers) ; ligne : chantier, ville, début–fin, durée, Panier / « Envoye » (sans accent, comme le PDF) / « Brouillon » (= « à envoyer ») / Retirée ; pas d'état « chez le comptable » ; ni période ni pagination (anciennes lignes possiblement tronquées) ; toucher un jour ou une ligne n'ouvre rien (contrairement à Semaine et Mois). **« PDF »** des heures envoyées. **« Interventions supprimées »** (si disponible) : 60 jours de planning, heures, tâches, réunions supprimés ou décalés, lecture seule.

### O6. Congés (S55 à S58)
« Mes congés » : « Faire une demande » → type (Congé / Arrêt maladie / Intempérie), Du / Au (fin non avant début), mot facultatif, « Envoyer la demande ». « Mes demandes » : période, type, En attente / Acceptée / Refusée (+ motif) ; en attente : corbeille, annulation immédiate sans confirmation. Le bureau pose l'absence à l'acceptation (visible en Semaine et Mois).

### O7. Réserves à lever (S38, S59 à S61)
Rappel « N réserves à lever » (interventions envoyées « avec réserve », ni levées par le bureau ni par le salarié, tous jours, 50 max) → liste : date, chantier · ville, détail ou « Sans détail écrit. » ; « Lever la réserve » → commentaire facultatif (500 car.), photo facultative, « Lever la réserve » / « Annuler » ; même formulaire depuis l'intervention du jour (à lever / levée par le bureau / levée le jj mmm). Indisponible hors-ligne ; marche sur mois clôturé. Après levée : 10 s de « Annuler » ; le bureau voit nom, date, commentaire, photo.

### O8. Formations (S62 à S64)
Liste (non vues d'abord) : document ou vidéo, titre, « {type} · ajoutée le {date} » ; « Ouvrir ↗ » (lien externe) ou « ▶ Regarder » (vidéo du bureau, lecteur intégré) ; « ○ Vue » / « ✓ Vue le jj/mm », annulable 10 min. Rappel « N formations à voir » ; entrée de menu (si au moins une) avec le nombre non vu.

### O9. Documents d'un chantier (S25, S65 à S68)
« Documents — {chantier} » : « Photo » et « Fichier », 15 Mo, rattachés au chantier, au jour et à l'intervention d'origine ; Photos et Fichiers séparés (compteurs), par journée ; par pièce : aperçu, nom, auteur, date, ouvrir / télécharger, supprimer (confirmation). Catégorie (Photo, Plan, Devis, PV…) modifiable par l'auteur, annulable ; factures réservées au bureau, invisibles. « Envoyer au client » : e-mail du client (enregistré sur le chantier), « Ouvrir l'e-mail » (liens valables 7 jours) ou « Copier » ; toutes les pièces du chantier.

### O10. Chef d'équipe (S69 à S71)
« Mon équipe », jour courant seulement : un jour parmi les 7 derniers, un salarié ; ses interventions (chantier, début–fin · durée, « chez le comptable » / « envoyé » / « à envoyer ») ; « Corriger » (indisponible si chez le comptable ou validée) ; « Envoyer » ; « Ajouter des heures pour {prénom} » : chantier, début, fin, « OK — envoyer au bureau ». Une ligne existante sur le même chantier est corrigée, jamais doublée ; corriger du déjà envoyé prévient le salarié ; « OK » enregistre et envoie (journée « par le chef d'équipe », corrigeable par le salarié tant qu'elle n'est pas validée) ; début = fin refusé.

### O11. Compte, notifications, informations (S72 à S77)
Identité : prénom (+ nom sur grand écran), photo ou initiales. Menu du compte : Changer ma photo (image, 6 Mo max), Mes congés, Assistant (si IA), Informations, Notifications (« Activer les notifications » / « Couper les notifications » / « Notifications bloquées » ; absent si l'appareil ne les gère pas ; permission demandée au toucher), vues, Formations, Déconnexion. « Informations » : « L'endroit au pointage » (texte actuel : l'entreprise note l'endroit au départ et à la fin d'un pointage, refus sans conséquence), lien « Politique de confidentialité », à afficher tels quels. **N'est plus exact** : l'endroit n'est plus relevé par le téléphone ni par la borne (seul le QR fixe lit une position, sans la garder) ; « Endroit noté » ne concerne que d'anciennes lignes ; réglage d'entreprise conservé ; texte à faire valider par le métier.

### O12. Sans réseau (S78 à S81)
Règle d'or : l'heure n'est jamais bloquée faute de réseau : on peut ajouter, modifier, retirer des interventions « sur le téléphone », qualifier leurs trous, noter le panier ; « Hors-ligne, tout est gardé · N en attente ». **Grisés ou masqués** : envoyer, copier, lever une réserve (carte du jour), cocher une tâche. **Échouent avec un message, sans être grisés** : terminer un pointage ouvert (« La fermeture a échoué. Le pointage reste ouvert. » : aucun repli, l'heure de fermeture vient du serveur), lever une réserve (liste du bandeau), documents, demande de congé, retirer une ligne déjà au bureau, Mon équipe, assistant, photo de profil, « Vue » des formations. **Indisponibles** : créer un « Autre chantier », corriger une ligne déjà au bureau. Au retour du réseau ou de l'application, les saisies sont transférées seules en lignes « à envoyer » (l'envoi reste un geste, sauf le cas rare de O4), jamais en double ; refus définitif ou 5 échecs : « N chantier(s) du jj/mm ne part(ent) pas. Préviens le bureau. », relançable d'un toucher. Pas de cache : rouvrir sans réseau n'est pas garanti.

### O13. Assistant BEMEXO (S82 à S93)
Seulement si l'entreprise a activé l'IA. Écrit ou dicté (français ou turc ; rien ne part avant « Envoyer »), 1 500 caractères, pièce jointe photo ou PDF (8 Mo), 20 questions par jour par défaut (« N questions restantes aujourd'hui »). Sous « Bonjour », 4 suggestions : « Ce matin 7h30-12h, après-midi 13h-16h30 », « J'ai fini ma journée », « Demander un congé », « Comment je signale une réserve ? ». Réponses : texte, raccourcis vers les écrans, « Me guider pas à pas » et fiches. Heures dites : notées tout de suite si claires (Annuler / Modifier), sinon « Sur quel chantier ? », sinon fiche à corriger. Autres gestes :
- **Geste simple** (congé, terminer le pointage ouvert, réserve, document, horaires non envoyés, panier, copie) : fait tout de suite, avec Annuler / Modifier.
- **À confirmer d'abord** : envoyer la journée, créer un chantier, e-mail client, corriger une ligne déjà envoyée, toute suppression (effacer des heures, annuler ou modifier un congé, retirer un document ou une réserve).
- Phrase longue ou à plusieurs actions : fiche « Tout confirmer » / « Ignorer ».
- Démarrer ou annuler un pointage par l'assistant n'existe pas : il répond de scanner le QR de la tablette ou d'utiliser « + ».

Il répond aussi sur ses heures, son planning, ses collègues (O14). Conversation gardée jusqu'au rechargement. **Pas en service (mise au point)** : « Nouveau chat » et « Historique » (privé, 30 jours). **« Me guider pas à pas »** : ouvre au besoin menu, vue ou fenêtre et désigne le vrai bouton, une étape à la fois, sans jamais toucher à la place du salarié ; 23 guides.

### O14. Planning des collègues
Aucun écran. Seulement par l'assistant, si le bureau l'autorise : « Où est Paul demain ? » → prénom, chantier (ville), horaires prévus ; jamais les heures pointées ; une absence = « absent ». Sinon : « Le bureau n'a pas partagé le planning des collègues, ou personne n'est prévu ce jour-là. »

## 3. Informations à montrer (S104 ; sens et règles de calcul)

- **Total du jour** (h:mm) = durées nettes (pause déduite) des interventions non retirées + saisies sur le téléphone + minutes du pointage en cours ; sans prévu, trous ni route.
- **Prévu non confirmé** = créneaux prévus envoyables (début et fin connus, non couverts, sans chevauchement), ex. « + 7:30 prévues par le bureau, pas encore confirmées ».
- **Chantiers** = lignes comptées dans le total. **Pauses** = pauses des lignes + trous Pause ; « N à préciser » = trous ≤ 2 h sans réponse. **Route** = trous Route, si > 0, « payée » selon l'entreprise, hors total. **Panier** pris / non pris. **En cours depuis HH:MM** (+ temps écoulé).
- **États** : intervention = à envoyer · envoyé · chez le comptable · retiré · sur le téléphone ; créneau = prévu · en cours. L'ancien « validé » vaut « envoyé ».
- Pointage en heure de Paris ; le « aujourd'hui » de l'écran suit l'horloge du téléphone, ne bascule pas pendant une saisie, relecture chaque minute.

## 4. Fenêtres et formulaires existants

Détaillés en section 2 (réglage de l'heure : section 5 ; retours passagers : 8.2). « Votre pointage est encore en cours » et « Envoyer votre journée maintenant ? » ouvrent sur le choix sans conséquence (Entrée ne ferme jamais le pointage ni n'envoie la journée). **Demandes du système, non stylables** : notifications, caméra, micro, position, sélecteurs.

## 5. Gestes existants (effet fonctionnel seulement)

- **Choix de l'heure** : toute heure retouchée est écrite telle quelle, une heure non retouchée reste intacte, choix par défaut au quart d'heure. Actuellement : fenêtre « Réglage de l'heure » (Début / Fin, durée totale, « Heure exacte gardée : 08:07 — la molette ne montre que les quarts d'heure », « Valider les heures » ferme sans enregistrer) avec molette à deux colonnes (heures, minutes 00/15/30/45) en boucle ; ailleurs champ texte (« 14h », « midi ») + liste au quart d'heure (pointage oublié, Mon équipe), sélecteur natif (assistant).
- Toucher une intervention l'ouvre, sauf ses gestes propres (Lever la réserve).
- **Retour du téléphone (Android)** referme la couche ouverte (éditeur, réglage d'heure, confirmations, documents) au lieu de quitter l'application ; pas pour l'assistant, les congés, les informations, le scanner, ni les deux questions d'envoi (« Horaires prévus », « Tu as pris une pause ? » : à décider). Fermer une question d'envoi l'abandonne.
- **Bascules** (un toucher pose, le second retire) : panier, pauses, statut, langue de dictée, « Vue », « Fait ». Sélection multiple de dates (dupliquer).

## 6. États et cas limites

- **Chargement** : attente ; échec « Impossible de charger tes données » ; vue différée : « Cet écran n'a pas pu se charger… » **Accès** : compte archivé → « Ce compte a été archivé par votre entreprise. » puis déconnexion ; autre rôle → connexion.
- **Journée vide** : « Aucun chantier aujourd'hui. » (même sur un autre jour) + « Copier la journée d'hier » (en ligne, mois ouvert). **Planifiée sans heures** : total 0:00, « + 7:30 prévues… ».
- **Autres états** : O2, O3, O4, O12. Erreurs d'écriture dites en phrases de chantier (« Le bureau a clôturé tes heures jusqu'au 15 octobre… »). Chaque vue a un message de vide (« Aucune … »). Réglages d'entreprise qui font apparaître ou disparaître : panier, assistant, scanner, route payée, endroit noté.
- **Fonctions pas encore installées côté serveur** (réunions, tâches, formations, motifs de correction, traces, catégories, « Terminé le ») : rien ne s'affiche, aucun message ; le design doit tolérer leur absence.
- **Points ouverts** : panier coché hors-ligne sur une ligne déjà au serveur (rien n'est écrit) ; envoi actif sur mois clôturé (le serveur refuse) ; « validé » sans étiquette ; toast « touche « J'ai fini » en haut » alors que le bouton est « Terminer ma journée » (aligner libellé et assistant) ; mêmes états, mots différents (« Brouillon » en Historique et Mois = « à envoyer » ; « Envoye » sans accent en Historique et PDF) ; questions d'envoi hors pile du retour du téléphone ; grille Semaine à 6 colonnes (O5).

## 7. Page /pointer (confirmation après scan du QR)

Page séparée, sans en-tête ni menu actuellement ; atteinte en scannant le QR de la tablette (qui change chaque minute) ; sans code : « Scannez le QR affiché sur la borne. »
1. **Attente** (vérification du QR, lecture de position, pointage en cours) ; **connexion sur place** sans session : entreprise nommée, e-mail, mot de passe, « Se connecter et pointer », « Mot de passe oublié ? » ; erreurs (identifiants incorrects, e-mail non confirmé).
2. **QR fixe imprimé** (information une fois par compte, avant la lecture de position) : « Ce QR demande votre position » : pourquoi, une seule lecture, rien n'est gardé (seulement « dans la zone : oui »), refus possible ; « Continuer » / « Je refuse ».
3. **Arrivée enregistrée** : heure, « Bonne journée, {prénom} ! », chantier ; « Ouvrir mon espace » ; « Ajouter une intervention faite avant ». **Départ enregistré** : heure, « À bientôt, {prénom} ! », « Heures enregistrées : début → fin » ; « Ouvrir mon espace » ; « Envoyer ma journée » ; « Ajouter une intervention » (un seul raccourci par affichage).
4. **Pointage annulé (moins d'une minute)** ou **rien à enregistrer** (pointages trop proches) : rien d'enregistré, neutre, « Ouvrir mon espace ».
5. **Pointage non enregistré** : message du serveur (QR ou lien expiré, borne retirée, autre entreprise, compte inactif, heures clôturées, pointage d'un autre jour resté ouvert…) ; « Ouvrir mon espace ».
6. **Refus du QR fixe** : raison (position refusée, imprécise, hors zone, QR remplacé, point non posé) + autre moyen ; « Ajouter mon intervention à la main » ; « Réessayer » seulement si un ticket est connu (ni après « Je refuse » sur l'information du QR fixe, ni pour un refus au moment du ticket).

## 8. Hors périmètre, à ne pas toucher, et pourquoi

### 8.1 Fonctionnel
- Hors périmètre : écran du bureau, borne, connexion, inscription, pages légales.
- **Démarrer ou annuler un pointage depuis le téléphone** : retiré volontairement (code inatteignable : « Je commence », « Sur quel chantier ? », « L'endroit au pointage »). Ne rien concevoir. Scanner un QR reste un pointage.
- N'existent pas : écran du planning des collègues (O14), impression (seul export : PDF de l'historique), interface en turc.
- Calculs, droits, clôtures, verrous : décidés par le serveur. Les confirmations de O3 et O4, de la suppression d'un document et la levée de réserve annulable sont des garde-fous métier à conserver. Jamais de taux horaire ni de coût.

### 8.2 Technique
Pile, jetons, polices, CSS, fenêtres Radix (`bt-skin`), `data-guide` / `data-testid`, classes `.bt-*` : integration-technique.md. Pour cet écran :
- Composants de présentation (props, callbacks), sans appel de données, sous `components/` (Next 14 statique, `'use client'`, Supabase appelé depuis le navigateur). /poseur plafonné à 345 kB (mesuré 335).
- Contraintes réelles : zoom bloqué, `env(safe-area-inset-*)`. Au choix : page sans défilement, en-tête superposé et rétractable. Si l'en-tête est conservé et mesuré, sa hauteur alimente `--phdr-h` ; sinon l'intégration supprime ce code.
- **Retours passagers** : seul retour de la plupart des actions, dont les « Annuler » de 10 s. Visibles et touchables au-dessus de toute barre ou tiroir ; 10 s gardées pour « Annuler ». Couches à conserver : en-tête 30, éditeur 40, Radix 50, guide 60, assistant 70, Informations 95, scanner 96, retours passagers au-dessus. La liste des réserves se referme après chaque levée pour que le retour reste touchable.
- **Guides et assistant** : les `data-guide` et `data-guide-confirm` restent sur un élément affiché, touchable, non recouvert (`npm run test:guides`). Guides (worker-tours.ts) et assistant (worker-assistant-core.ts) citent des libellés exacts (« Envoyer ma journée », « Terminer ma journée », « Activer les notifications », « + »…) et l'emplacement de boutons : renommer ou déplacer un bouton cité rend ces phrases fausses (à réécrire, puis redéployer).
- Tests navigateur (390×844) lisant des `data-testid` et des classes `.bt-*` : props ou table ancien → nouveau. Garder les verrous anti double toucher et la file hors-ligne (`battime_offline_<id>`).

## Annexe : liste exhaustive des capacités (à cocher)

**Journée prévue**
- S1 Jour affiché ; retour à aujourd'hui
- S2 Créneaux prévus, distincts des heures saisies
- S3 Noter ses heures sur un créneau prévu
- S4 Savoir qu'un créneau prévu ne partira pas
- S5 Nombre de documents d'un chantier
- S6 Réunions du jour
- S7 Tâches du jour et compteur
- S8 Cocher une tâche (réseau requis)
- S9 « Terminé le … » sur un chantier terminé

**Pointer**
- S10 Pointer en scannant le QR de la tablette
- S11 Scanner ce QR depuis l'application
- S12 Pointage en cours (chantier, début, durée)
- S13 Terminer le pointage en cours
- S14 Pointage oublié : indiquer la fin (nuit comprise)
- S15 Voir et compléter une « sortie oubliée »
- S16 Pointage rattaché au chantier et au total

**Saisir, corriger, retirer**
- S17 Ajouter une intervention à la main
- S18 Choisir le chantier (recherche, « Autre chantier »)
- S19 Créer un « Autre chantier »
- S20 Régler début et fin ; heure exacte gardée
- S21 Durée nette (pause déduite)
- S22 Total des pauses de la ligne, contrôlé
- S23 Statut du chantier (réserve ou non)
- S24 Note ou détail des réserves
- S25 Documents du chantier depuis l'éditeur
- S26 Enregistrer avec contrôles (dont pointage en cours)
- S27 Corriger une intervention (même envoyée)
- S28 Retirer une intervention (confirmation)
- S29 Fermer l'éditeur sans enregistrer
- S30 Terminer le pointage recouvert par une intervention
- S31 Qualifier un trou : Route ou Pause
- S32 Panier du jour (cocher / décocher)
- S33 Copier la journée d'hier
- S34 Dupliquer la journée sur d'autres jours
- S35 Corrections du bureau / du chef et leur motif
- S36 « Endroit noté » (anciennes lignes)
- S37 État de chaque intervention
- S38 État d'une réserve ; la lever

**Envoyer**
- S39 « Envoyer ma journée » et ses 5 états
- S40 Confirmer / corriger les horaires prévus
- S41 Répondre à « Tu as pris une pause ? »
- S42 Confirmer une journée de plus de 10 h
- S43 Arrêt avant envoi (chevauchement…)
- S44 Modifier une journée envoyée (« Journée déjà envoyée »)
- S45 Journée renvoyée par le bureau, avec motif
- S46 Clôture et ce qu'elle bloque
- S47 Rappels « journée(s) à envoyer » ; ouvrir le jour
- S48 Après un scan : raccourcis ajouter / envoyer

**Semaine, mois, historique**
- S49 Ma semaine (7 jours visibles)
- S50 Mon mois
- S51 Historique
- S52 Export PDF de l'historique
- S53 « Interventions supprimées »
- S54 Ouvrir un jour depuis semaine, mois ou rappel

**Congés**
- S55 Faire une demande
- S56 Mes demandes : états, motif de refus
- S57 Annuler une demande en attente
- S58 Absences posées par le bureau

**Réserves**
- S59 Rappel « N réserves à lever » et liste
- S60 Lever une réserve (commentaire, photo)
- S61 Annuler la levée (10 s)

**Formations**
- S62 Rappel « N formations à voir », menu avec compteur
- S63 Ouvrir un lien ou document, regarder une vidéo
- S64 Marquer « Vue » (annulable)

**Documents**
- S65 Ajouter une photo ou un fichier (15 Mo)
- S66 Parcourir par journée, ouvrir, supprimer
- S67 Changer la catégorie
- S68 Envoyer les documents au client par e-mail

**Chef d'équipe**
- S69 « Mon équipe » : jour, salarié, interventions
- S70 Corriger / envoyer l'intervention d'un coéquipier
- S71 Ajouter des heures pour un coéquipier

**Compte**
- S72 Nom, photo, menu du compte
- S73 Changer sa photo
- S74 Activer / couper les notifications
- S75 « L'endroit au pointage » et confidentialité
- S76 Se déconnecter
- S77 Naviguer entre les vues

**Hors-ligne**
- S78 Ajouter, modifier, retirer ses heures sans réseau
- S79 État hors-ligne et nombre en attente
- S80 Transfert au retour du réseau, relance, échecs signalés
- S81 Panier d'une journée encore vide

**Assistant**
- S82 Ouvrir l'assistant (si IA activée)
- S83 Écrire ou dicter (français, turc)
- S84 Joindre une photo ou un PDF
- S85 Suggestions de départ
- S86 Heures dites en une phrase, Annuler / Modifier
- S87 Actions (congé, terminer le pointage ouvert, réserve, document, envoi…) : simples ou à confirmer
- S88 Fiche « Tout confirmer » / « Ignorer »
- S89 Raccourcis vers les écrans, « Me guider pas à pas »
- S90 Questions heures, planning, collègues (si autorisé)
- S91 Questions restantes du jour
- S92 « Nouveau chat », « Historique » (pas en service)
- S93 Guide pas à pas

**Page /pointer**
- S94 Vérifier le QR ; se connecter sur place
- S95 Information et position du QR fixe (refus possible)
- S96 Arrivée + « Ajouter une intervention faite avant »
- S97 Départ + « Envoyer ma journée », « Ajouter une intervention »
- S98 Pointage annulé (< 1 min) ; « Rien à enregistrer »
- S99 Pointage non enregistré, refus du QR fixe, « Réessayer » (si ticket connu)
- S100 « Ouvrir mon espace »

**Transverses**
- S101 Retour du téléphone referme la couche ouverte
- S102 Accès : compte archivé, rôle refusé, chargement
- S103 Retours passagers visibles et touchables
- S104 Total du jour, prévu non confirmé, compteurs (chantiers, pauses à préciser, route, panier)
