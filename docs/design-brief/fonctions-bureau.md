# Cahier des fonctionnalités : écran principal du bureau (planning)

Route `/admin`. Ce cahier dit ce que l'écran fait aujourd'hui (fonctions, données, règles, états) et ce qui contraint son intégration. Il ne dit rien de l'apparence : parcours, hiérarchie, regroupements, forme sont libres.
- « Aujourd'hui » : structure actuelle, remise en cause librement tant que les capacités restent. « Manque aujourd'hui » : lacune actuelle. « (si dispo) » : affiché seulement si l'option existe pour l'entreprise. ◇ : contenu conservé tel quel dans un premier temps (§8).
- Section 9 (B1…) : liste de contrôle de la livraison.

## 1. À qui sert l'écran

**Qui.** Le « bureau » : comptes de rôle administrateur (patron, secrétaire…). Un seul niveau de droits, « Bureau · accès complet » : voit taux et coûts, sort la paie, modifie les réglages. Salariés et chefs d'équipe ont un autre écran ; un agent du support BEMEXO peut entrer en lecture seule.
**Où.** Ordinateur ; sous 1 024 px, téléphone et tablette en portrait (§7). Habitudes d'usage : non documentées, à valider avec le patron.
**Pour faire quoi.** Organiser (qui chez quel client, quand) ; suivre (heures, pointage, absents, réserves) ; corriger ou renvoyer des heures ; sortir la paie ; tenir fiches, congés, documents ; imprimer ; suivre coûts.
**Vocabulaire à garder.** chantier / client (un « client » EST un chantier), intervention (un salarié chez un client un jour), case (salarié × jour), pointage (« en direct » = chrono en cours), heures envoyées (seules elles comptent), brouillon, à relancer, panier (repas), pause, route (trajet entre chantiers), heures sup, réserve, borne (tablette de pointage par QR), verrouiller, clôturer, versions du planning, habilitations, congé / arrêt maladie / intempérie / repos, « Présent », « Autre » (client fourre-tout nommé par le salarié), chef d'équipe, bureau, comptable, « Note pour le poseur », « S-43 », assistant BEMEXO. Français, vouvoiement, « Touchez » au lieu de « Cliquez » sous 1 024 px.

## 2. Ce que la personne doit pouvoir faire

**A. Lire la semaine.** Aujourd'hui : lundi→dimanche, une ligne par salarié actif (salariés et chefs d'équipe, par prénom ; ni bureau ni archivés), une case par jour. Case = absence du jour OU interventions (ordre mémorisé), plus heures hors planning, pointage en direct, réunions, tâches (compteur). Intervention : client (pour « Autre », la note), produit · ville, horaire prévu (facultatif), créneau (matin avant 12 h / après-midi 12–18 h / soir après 18 h / journée entière ou sans horaire, calculé sur l'horaire), état des heures (prévue ; saisie « à envoyer » + début–fin + durée ; envoyée + heures réelles + durée), « retirée par le salarié », « ajoutée par le salarié », réception (sans réserve / réserve à traiter / réserve levée / chantier en cours), nombre de documents, « en cours depuis HH:MM » (jour ajouté si ancien). Heures hors planning = déclarées sur un client non prévu ce jour-là (ou sans client) : nom, durée, « ajouté par le salarié » ou « saisi, à envoyer » ; envoyées sur un client précis, elles créent une intervention « ajoutée par le salarié ». Salarié : nom, photo ou initiales, absence du jour, « N jours en attente » / « À jour ». Tout code visuel a sa légende (ordinateur, papier) ; manque aujourd'hui sur téléphone, qui affiche les mêmes codes. Pas de mise à jour instantanée entre postes (relu après chaque écriture ; compteurs 60 s, direct 30 s).

**B. Planifier : créer, affecter, modifier, déplacer, copier, supprimer.**
- Créer : clic sur une case (client pré-choisi = dernier créé dans la session) ; glisser un client de la liste Clients sur une case (sans horaire) ; téléphone : « Ajouter un chantier ». Client obligatoire ; horaire prévu facultatif (une fin exige un début, fin après début ; préréglages Matin 08:00–12:00, Après-midi 13:30–17:00, Journée 08:00–17:00) ; note pour le poseur. Rendez-vous à heure fixe : mettre une fin, sinon le salarié ne voit pas l'heure. Pas d'ajout par clic ni sur téléphone un jour d'absence ; manque aujourd'hui : le glisser d'un client n'est refusé ni sur une absence, ni en mois ou chez un salarié clôturé.
- Modifier horaire et note ; lire heures déclarées, observation, photos ; ouvrir fiche client et documents.
- Déplacer / réordonner : glisser vers une autre case ou dans la case (déposer sur une intervention l'insère avant). Ordinateur seulement ; manque aujourd'hui : téléphone (copier puis supprimer) et clavier.
- Copier : glisser avec Ctrl, Alt/Option ou ⌘ ; « Copier vers un autre jour… » (salarié, semaines −4 à +26, plusieurs jours, refus avec raison) ; « Dupliquer au lendemain ». Reprend client, horaire prévu, note, jamais les heures.
- Refus, raison dite. Copie ou déplacement vers : un jour d'absence, un mois ou un salarié clôturé ; (copie) un doublon (même client, mêmes heures) ou un horaire prévu qui en chevauche un autre (même client matin ET après-midi : permis). Déplacement ou suppression d'une intervention portant : heures envoyées, heures notées (brouillon non vide), sortie oubliée à compléter, pointage en cours, ou dans un mois / chez un salarié clôturé ; copier reste possible. Un brouillon vide (0 min) part avec l'intervention ; réordonner dans la même case n'est jamais refusé (même avec heures envoyées ou mois clôturé).
- Supprimer (intervention ou sélection) : « Supprimer ? » si la case porte des heures retirées par le salarié (elles restent dans sa fiche) ; message persistant « N supprimée(s) · Annuler » qui remet à l'identique. Copie par glisser : même « Annuler » (refusé si des heures y sont notées depuis, ou mois clôturé) ; « Copier vers… », « Dupliquer » : message seulement.

**C. Sélectionner pour supprimer.** Cocher. Ordinateur : une intervention, la semaine d'un salarié (son nom), une journée (en-tête de jour), toute la semaine (« Tout sélectionner »). Téléphone : une intervention, celles d'un salarié pour le jour affiché (son nom), tout le jour. Compteur ; « Supprimer (N) » (confirmation si plusieurs) ; « Terminer ». Verrouillés, raison au toucher : cas de B, absences (« à changer avec Présent »), heures « ajoutées par le salarié », réunions, tâches. Changer de semaine vide la sélection ; ni ajout par clic ni glisser pendant le mode.

**D. Absences, tâches, réunions.**
- Absence : nom ou absence → « Statut de {prénom} à partir d'aujourd'hui / du {jour} » : Présent, Congé, Arrêt maladie, Intempérie, Feuille d'heures. Poser : 1er et dernier jour, ou sans fin = jusqu'au retour « Présent » (90 jours) ; remplace les absences de la période. « Présent » retire l'absence EN COURS dès la date (celles posées plus tard restent, signalées), confirmation si plusieurs jours, Annuler. « Repos » s'affiche, ne se crée pas. Un absent qui pointe reste visible.
- Tâches (si dispo) : texte, moment facultatif ou heure de…à… (hors créneau : « Ajouter quand même ? » non bloquant), tâches habituelles, retrait confirmé, « Fait HH:MM / Pas fait » (coché par le salarié), x/y sur la case, « Ajouter une tâche à ce créneau » depuis une intervention. Pas d'ajout un jour d'absence. Jamais dans les heures.
- Réunions (si dispo) : titre, date, heure, fin et lieu facultatifs, toute l'équipe ou participants, « Prévenir par notification » ; modifier, retirer (confirmé). Jamais dans les heures ; imprimées.

**E. Naviguer, trouver.** Semaine précédente / suivante ; retour à la semaine actuelle (repère actuelle / autre) ; « S-43 » + période ; jour courant repéré (non rafraîchi à minuit). Téléphone : un des 7 jours (initial = aujourd'hui, conservé en changeant de semaine). Recherche dans la liste des clients et dans celle des salariés. Manque aujourd'hui : saut à une date, vue mois à l'écran, recherche ou filtre dans le planning.

**F. Salariés.** Inviter (formulaire ou import) = compte + e-mail d'invitation. Non activé : « invitations en attente » (envoyer / renvoyer, le renvoi invalide l'ancien lien ; supprimer confirmé, retire le compte jamais connecté ; « Envoyer toutes » : confirmation, arrêt à la première erreur). Rôle Salarié / Chef d'équipe / Bureau changé depuis la liste, confirmation détaillant les droits (chef d'équipe : saisit et corrige les heures de tous les salariés actifs sur les 7 derniers jours (aujourd'hui compris), jamais une ligne verrouillée par un export ni en mois ou chez un salarié clôturé ; saisies marquées « par le chef d'équipe », le salarié garde la main tant que rien n'est verrouillé ; ni taux, coûts, paie, réglages, comptes bureau) ; un bureau actif au moins (refus serveur affiché). Fiche (§4) : archiver (propose de clôturer ses heures avant) ou réactiver un archivé (sans clôture proposée) ; clôturer jusqu'à une date (confirmation annonçant les brouillons bloqués ; remplace l'ancienne date ; refusé après aujourd'hui ou avec un pointage ouvert sur un jour clos, message serveur affiché ; « Clôturer et archiver » en un geste, pour une fin de contrat ; la période de la fiche passe alors du 1er du mois à cette date : relevé final) / rouvrir (ne supprime rien) ; supprimer sans donnée seulement ; habilitations (alertes e-mail à 30 j et 7 j) ; coût réel (si IA) : bulletin déposé, chiffres vérifiés, Valider. Manque aujourd'hui : liste des archivés (leur fiche est inatteignable depuis la liste Salariés).

**G. Clients.** Créer, modifier, archiver (sort des listes), supprimer sans donnée liée seulement (« Archivez-le plutôt »), importer CSV/Excel. Budget main-d'œuvre facultatif (heures, montant) : suivi dans Coût, alertes e-mail à 70/80/100 %. « Autre » ne se termine pas. Attribuer un vrai client à des heures « ajoutées par le salarié » ou sur « Autre » (existant ou à créer).

**H. Heures : lire, corriger, renvoyer, relancer, congés.** Pas d'étape « valider » : les heures envoyées comptent aussitôt. Fiche salarié « Feuille d'heures » : période (Aujourd'hui / Cette semaine = semaine courante / Créneau), total, semaine par semaine avec heures sup ; par ligne : date, client, début–fin, durée, panier, pause, route (payée ou non), observation, indicateurs d'état (brouillon, renvoyée, retirée, ajoutée par le salarié, modifiée après envoi, corrigée par le bureau ou le chef d'équipe, pointage QR, sortie oubliée, réception), historique (avant→après, motif, qui, quand, « pas prévenu »). Corriger (lignes envoyées) : début, fin, pause, panier, route ou pause avant, motif d'au moins 3 caractères lu par le salarié ; « Corriger et prévenir » le notifie ; journée déjà chez le comptable : signalée, sans blocage ; ni mois ni salarié clôturé ne bloquent (le bureau garde la main). Renvoyer au salarié : journée en brouillon, ne compte plus, motif de 3 à 500 caractères ; refusé (message serveur affiché) si la journée est déjà chez le comptable, le mois clôturé ou les heures du salarié clôturées : seul Corriger reste possible. Supprimer un brouillon vide (Annuler). Relancer : par salarié (notification, sinon e-mail préparé) ; relance automatique (heure réglable) : journée manquante (un rappel tous les 2 jours, 3 au plus) et heures saisies non envoyées (le jour même, hors quota), sur 14 jours, salariés et chefs d'équipe, notification sinon e-mail. Congés : « En attente (N) » accepter (pose l'absence, notifie) ou refuser (motif facultatif, notifie) ; « Traitées ».

**I. Paie : exporter, comptable, verrou, clôture (imprimer : §7).**
- Exporter l'équipe : Aujourd'hui / Cette semaine (= la semaine affichée au planning) / Créneau, sans période par défaut (« Choisissez une période. »), en PDF, Excel ou CSV paie. « Envoyer à {comptable} » : adresse fixée dans les réglages (sinon désactivé + message), Excel en pièce jointe, copie à l'expéditeur (le compte bureau), jamais deux fois (« Déjà envoyé le jj/mm à HH:mm — non renvoyé » : rien renvoyé, heures verrouillées comme prévu), avertit si la période est déjà partie.
- Seules les heures envoyées sortent. « Exporter verrouille les heures de la période » (rappel permanent) : le salarié ne peut plus les modifier ; le bureau le peut encore.
- Avant tout fichier qui verrouille, alerte « Cet export va verrouiller N lignes d'heures de M salariés » (+ lignes déjà verrouillées) : Exporter et verrouiller / Exporter sans verrouiller (pas pour l'envoi) / Annuler. Chiffres changés entre-temps : nouvelle alerte, rien parti. Comptage ou réglages illisibles : rien exporté. Verrou en échec après le fichier : message 12 s (ce qui est sorti, ce qui reste modifiable) ; envoi échoué : pas de verrou.
- Clôture du mois (précédent et en cours) : confirmation annonçant « N journées en brouillon » qui resteront bloquées ; Rouvrir. Effet : plus de saisie ni envoi par les salariés ; interventions du mois ni supprimables ni déplaçables, rien ne peut y être copié ni déplacé, mais elles restent source de copie vers un jour ouvert ; jours retirés de « à relancer ».
- Un seul salarié : sa fiche en « Feuille d'heures », export sans verrou.

**J. Versions et historique (bureau, si dispo) ◇.** Versions d'une semaine (V1, essais de l'assistant, versions gardées) : « Voir » (aperçu sans écriture), « Revenir à la V{n} » (après aperçu et confirmation ; garde d'abord l'état actuel ; ni heures ni absences touchées ; cases avec heures, en mois clôturé ou pointage en cours « gardées » : « N remises, N retirées, N gardées » ; planning bougé depuis l'aperçu : rien n'est fait, aperçu refait ; Annuler), « Garder cette version ». Historique « Interventions supprimées ou décalées » : lecture seule, filtre salarié, semaine / mois.

**K. Statistiques et coûts (bureau) ◇.** Statistiques en lecture seule (Semaine / Mois / Année ; Heures, Heures sup, Absences, Oublis, Coût si taux ; classement, détail par salarié). Coût par chantier (Ce mois / Cette semaine / Créneau ; Heures dont route, Main d'œuvre, Dépenses, Total ; « taux manquant : coût incomplet » ; budget ; ajouter / supprimer une dépense).

**L. Réserves, documents, fin de chantier ◇.** Réserves : à traiter / levées ; « Lever » (note, photo facultatives) par le bureau OU le salarié ; « Rouvrir » confirmé. Documents d'un chantier : onglets Photos / Fichiers par jour ; Photo ou Fichier (15 Mo) rattaché au jour et à l'intervention ; ouvrir, télécharger, supprimer ; catégorie (Devis, Plan, PV de réception, Photo, Réserve, Facture, Facture payée, Autre, Sans catégorie) : le bureau toutes, le salarié seulement photo / plan / devis / PV / autre ; facture invisible aux salariés ; « Réserve » alimente le registre des réserves ; catégorie modifiable après coup (Annuler ≈ 20 s). « Envoyer au client » : adresse modifiable, « Ouvrir l'e-mail », « Copier ». Terminer le chantier (si dispo) : date ≤ aujourd'hui, avertissements jamais bloquants, plus proposé aux salariés, rien supprimé ; Rouvrir ; Bilan en lecture seule.

**M. Borne, formations, e-mails (si dispo) ◇.** Borne : la tablette montre un QR que le patron scanne avec son téléphone (4 codes à toucher) ; secours : code à 6 chiffres affiché au bureau (fenêtre Borne, avec un QR), à saisir sur la tablette ; une seule tablette ; remplacement et déconnexion confirmés ; horaires d'ouverture ; QR fixe imprimable désactivé par défaut, activation confirmée. Tablette : planning de la semaine en lecture seule, sans heures, coûts, statut d'envoi, photos ni documents ; toute absence y est « Absent », sans motif ; plus le QR de pointage. Formations : vidéo filmée ou fichier (50 Mo), lien ou document, équipe entière ou certains salariés, « x/y vues » avec qui l'a vue (date) ou pas, « Ouvrir » ; retirer (confirmé) / remettre ; quota vidéo de l'entreprise 100 Mo, jauge dès 80 %. E-mails aux salariés : « Planning (PDF) » ou « Message » (500 caractères) ; destinataires non sélectionnables, raison dite ; confirmation « Envoyer N e-mails ? » ; 50 par jour.

**N. Réglages et abonnement ◇.** 4 rubriques repliables, un seul Enregistrer (§4), sauf « planning des collègues » et « endroit au pointage » (effet immédiat). « Endroit au pointage » : visible seulement s'il est actif, on ne peut que le désactiver (immédiat, sans confirmation) ; l'activation avec avertissement légal n'est plus proposée : ne pas dessiner de parcours d'activation. Abonnement : essai (jours restants) ou terminé + « S'abonner » ; forfaits lus en base (plage de salariés, prix HT/mois ; trop petits désactivés ; paiement Stripe) ; « Gérer mon abonnement ».

**O. Assistant et guide (si dispo) ◇.** Écrit (500 caractères), voix, photo ou PDF (8 Mo), 4 suggestions, boutons vers les écrans, « Me guider pas à pas » (entoure le vrai bouton ; refusé sur téléphone si glisser-déposer requis). Une trentaine d'opérations. Actions directes (« Fait — … », Annuler / Modifier) : placer, déplacer ou modifier une intervention, poser une absence, ranger un document, créer un client sans budget. Le reste (suppressions et remplacements, corrections d'heures, congés, réserves, rôles, clôture de mois, réglages, coût réel, rappels et invitations, planning de semaine) : carte à confirmer. Abonnement, export, paie, envois groupés : pas d'action, seulement explication, lien ou guide. Questions restantes. À venir, non fusionné à ce jour : « Nouveau chat », « Historique » (privé, 30 jours) ; l'inventaire (bureau.md) dit le contraire (conversation en mémoire jusqu'au rechargement) : une seule source doit faire foi.

**P. Compte, support.** Menu compte : entreprise (nom, logo), utilisateur, Réglages, Formations, E-mail, Déconnexion. Mode support : le patron autorise 1 h / 24 h / 7 j, retire, lit le journal ; l'agent entre avec une indication permanente (entreprise, lecture seule, expiration, Quitter).

## 3. À voir d'un coup d'œil

- **À relancer** : nombre de journées passées (avant aujourd'hui), mois précédent et en cours, où un salarié avait une intervention prévue sans heure envoyée ; hors absences, interventions retirées, mois clôturés, période clôturée du salarié ; plus les jours « sortie oubliée à compléter ». Journées, pas interventions. Détail par salarié : nom (ouvre sa fiche), jours, « N j », Relancer (« relancé » pour la session) ; vide : « Tout le monde est à jour. » ; à zéro : « Tout est envoyé en {mois} ». Même source que l'indication par salarié (§2A).
- **Pièces** : total de documents, détail par chantier (ouvre ses documents ; états lecture, échec, « Aucune pièce jointe »).
- **Un nombre chacun** : congés en attente, réserves à traiter, invitations non activées. **Abonnement** : jours d'essai restants / terminé / rien si abonné. **Clôtures** : « clôturé au jj/mm » (liste Salariés), mois « clos » (export).
- Manque aujourd'hui : total d'heures sur le planning, indicateur de mois clôturé (on le découvre au refus), charge par jour.

## 4. Fenêtres et formulaires existants

Regroupables, fusionnables, repensables (sauf ◇, §8). Aucune capacité ne disparaît.

1. **Abonnement** (« Choisissez votre abonnement ») : 3 forfaits, « Recommandé pour votre équipe », « Trop petit pour votre équipe » ; ◇ écran de blocage d'essai. 2. Informations et actions secondaires, à la demande : compte, légende, impression (§7), détail de À relancer / Pièces (§3).
3. **Liste Clients** : « Rechercher un client… », lignes glissables (nom, produit · ville, « Terminé le … » ; Autre : « Chantier non listé — le salarié le nomme »), modifier la fiche, Nouveau client, Importer (CSV/Excel).
4. **Ajouter** (titre selon le choix) : sélecteur Intervention | Tâche | Réunion (si dispo) ; Intervention : Client, Horaire prévu (début, fin, préréglages, Effacer), Note pour le poseur, « Ajouter au planning ».
5. **Intervention** : client, adresse, Fiche, Documents, Horaire prévu, Note, Heures déclarées (lecture seule), Enregistrer ; Copier vers un autre jour…, Dupliquer au lendemain, Ajouter une tâche à ce créneau (ferme la fenêtre, préremplit l'horaire), Supprimer. Copier, Dupliquer et Ajouter une tâche sont désactivés tant qu'une modification n'est pas enregistrée (« Enregistrez d'abord vos changements »). 6. **Copier vers un autre jour** : case copiée, « Pour qui ? », semaine, 7 jours, raisons des refus, « Copier sur ces N jours ».
7. **Statut du salarié** (§2D) ; **Absence** (calendrier à plage, Retour, Enregistrer) ; **Supprimer ? / Retirer ?** (jours, absence qui reste, Garder / Supprimer (N)).
8. **Fiche client** : Nom du client, Type de produit, Téléphone, Email, Ville, Adresse, Description, Budget main-d'œuvre (Heures prévues, Montant prévu), Chantier en cours / Terminé le…, Bilan, Terminer / Rouvrir, Enregistrer, Documents, Archiver, Supprimer. 9. **Nouveau client** : Nom*, mêmes champs sans budget. 10. **Attribuer un client** (liste, Autre en tête, « Créer un nouveau client… ») ; **Heures ajoutées par le salarié** (durée, Documents, Attribuer).
11. **Salariés** : Nouveau salarié, Importer, Demandes de congé (nombre), Formations, « Bureau · accès complet » (Retirer ; « Un seul accès bureau. »), recherche, par salarié : nom, CHEF, « clôturé au jj/mm », repère si jours en attente, rappel, rôle. 12. **Nouveau salarié** : Prénom*, Nom*, Email*, Téléphone, « Envoyer l'invitation ».
13. **Exporter l'équipe** : périodes, Exporter (PDF / Excel / CSV), Envoyer à {comptable}, mention de verrou, Clôture du mois, « Un seul salarié ? » ; **Alerte de verrouillage** (§2I) ; **Clôturer {mois} ?** ; **Exporter un salarié** (liste).
14. Transverses : **Invitations en attente** (nom, e-mail, « Invitée le JJ/MM », Envoyer / Renvoyer, suppression, « Envoyer toutes »), **infobulle (i)**, **champ d'heure** (« 14h », « 14:30 » ou liste au quart d'heure), **aide de démarrage** (« Pour démarrer · Deux étapes » : Ajoutez un salarié, Créez un client ; cochée seule, fermable), **astuce « Copier une case »** (fermable). Téléphone : **Chantiers** (= liste Clients), **navigation** (§7).
15. ◇ **Terminer / Rouvrir / Bilan du chantier**, **Documents du chantier**, **Demandes de congé**, **Réserves**, **Coût par chantier**, **Statistiques**, **Versions du planning**, **Interventions supprimées ou décalées**, **Borne de pointage** (+ QR fixe, « Associer cette tablette ? »), **Formations**, **Envoyer par e-mail**, **Assistant BEMEXO**, **Guide pas à pas**.
16. ◇ **Importer des clients** (CSV/Excel 8 Mo ; Nom du client* + 7 colonnes facultatives ; « Ignorer les clients déjà présents ») ; **Importer des salariés** (Prénom*, Nom*, Email*, Téléphone ; un compte et un e-mail par ligne).
17. ◇ **Fiche salarié** : Gérer = Prénom, Nom, Téléphone, E-mail (lecture seule), Taux horaire (coût chargé), Horaire hebdomadaire propre, N° de sécurité sociale, Date d'embauche, Type de contrat, Matricule de paie (si la colonne existe), Habilitations (CACES, Carte BTP, Habilitation électrique, Visite médicale, Travail en hauteur, Autre ; expiration), Coût réel, Archiver / Réactiver, Clôturer jusqu'au… / Rouvrir, Supprimer ; Feuille d'heures = §2H.
18. ◇ **Réglages** : Entreprise (logo PNG/JPG/SVG 2 Mo max, nom, SIRET, TVA intracom., adresse, contacts, abonnement) ; Heures & paie (horaire de base, majorations 1er / 2e taux, route payée ou non, panier repas, comptable, caisse de congés BTP (si IA)) ; Borne & pointage (tablette, QR fixe, endroit au pointage, planning des collègues : effet immédiat) ; Notifications & support (relance automatique + heure 6 h–21 h, alertes de budget en bascule, récap + « Envoyer le récap maintenant », habilitations + « Vérifier les habilitations », Support BEMEXO (si activé, jamais en session support)) ; lien vers l'historique des suppressions.

## 5. Gestes existants et leur effet

- **Clic / toucher** : case vide → ajouter ; intervention → ouvrir (en sélection : cocher) ; nom du salarié → statut (en sélection : cocher sa semaine sur ordinateur, ses interventions du jour sur téléphone) ; en-tête de jour (ordinateur) → cocher la journée (en sélection seulement) ; absence → statut ; heures « ajoutées par le salarié » → documents / attribuer ; réunion ou compteur de tâches → ouvrir ; « + Tâche » → ajouter une tâche ; compteurs de tête → détail ; clic à côté d'un menu → le ferme.
- **Glisser une intervention** (souris ou stylet, après 8 px ; aucun équivalent clavier ; au doigt non garanti) : déplacer, insérer, réordonner (§2B) ; cible nommée « Déposer ici » / « Copier ici » ; refus : message avec raison.
- **Ctrl, Alt/Option ou ⌘ maintenu** (au départ, en route ou au dépôt) → copier ; l'état au dépôt compte. **Glisser un client** → crée l'intervention sans horaire.
- **Clavier** : Échap ferme les fenêtres et le menu d'impression, quitte la sélection, annule un glisser (les autres menus et panneaux ne se ferment qu'au clic extérieur : manque aujourd'hui, Échap) ; Ctrl/Cmd+P imprime (§7) ; Entrée valide une heure ; dans l'assistant Entrée envoie, Maj+Entrée saute une ligne ; Entrée / Espace ouvrent une intervention en vue téléphone.
- **Survol** : infobulles d'aide (souris). **Absents aujourd'hui** : clic droit, double-clic, appui long, balayage, autres raccourcis.

## 6. États et cas limites

- **Chargement** : tant que salariés et clients ne sont pas lus, « Chargement du planning… » remplace tout. Fenêtres chargées à l'ouverture sans indicateur ; échec : message, la fenêtre se ferme.
- **Erreurs** : lecture salariés / clients : « Impossible de charger les données », grille vide ; lecture du planning : aucun message, état précédent conservé (manque aujourd'hui) ; écritures : « Impossible d'enregistrer », « Rien n'a été effacé » ; un compteur en échec garde son chiffre (jamais 0). **Hors ligne** : aucun mode ni bannière, seulement les échecs d'écriture.
- **Retours d'action** : toute écriture répond par un message transitoire (succès, erreur, astuce) qui dit ce qui a été fait ou non ; exceptions plus durables : carte Annuler (reste jusqu'à fermeture), échec de verrou d'export (12 s).
- **Accès** : non-bureau renvoyé à la connexion ; compte archivé déconnecté. **Essai** : en cours ; expiré sans blocage (utilisable + S'abonner) ; expiré avec blocage (écran plein « Votre essai gratuit est terminé. », 3 forfaits) ; abonné ou sans date d'essai : jamais bloqué ; retour de paiement : « Activation… ».
- **Lecture seule (support)** : écritures refusées par la base ; coupés : Terminer / Rouvrir un chantier, relier une tablette, e-mails aux salariés ; export sans verrou ; bloc « Support » des réglages absent.
- **Entreprise vide** : 0 salarié : planning sans ligne (aujourd'hui des lignes vides avec « + » pour ajouter un salarié), impression désactivée, aide de démarrage ; téléphone : l'aide ou « Aucun salarié… » ; 0 client : « Aucun client » / « Aucun chantier pour le moment ».
- **Un seul salarié / beaucoup** (démonstration jusqu'à 30) : la page s'allonge, pas de pagination, listes internes défilantes, noms longs coupés ; beaucoup d'interventions dans une case : elles s'empilent. **Semaine vide** : cases invitant à ajouter ; « à relancer » peut rester > 0.
- **Fonctions absentes** (tâches, réunions, formations, versions, e-mails, borne, assistant, chantier terminé, panier) : masquées sans message. **Invitations** : aucune = rien ; dates d'envoi illisibles : envoi groupé désactivé, Réessayer ; un envoi à la fois.

## 7. Téléphone / petit écran et impression A4

**Seuil.** Sous 1 024 px (téléphones ET tablettes en portrait) : disposition réduite ; au-delà : disposition ordinateur. Les deux restent complètes en capacités, sauf « non disponible ».

**Téléphone : à rester faisable.** Aujourd'hui : un jour à la fois. Requis : entreprise, essai + S'abonner, assistant, accès à la navigation, compteurs (« à relancer » ouvre la liste avec Relancer), changement de semaine, choix du jour parmi 7, déconnexion. Par salarié : nom, photo, état (absence / EN COURS / ENVOYÉ), interventions, heures hors planning, réunions, tâches, « Ajouter un chantier », « + Tâche » ; toucher le nom → statut ; toucher une intervention → modifier, copier vers un autre jour, dupliquer, ajouter une tâche, supprimer ; Sélectionner (« Tout sélectionner » = le jour). Navigation, depuis un point d'entrée unique, avec ces intitulés : Salariés, Chantiers (= liste Clients), Demandes de congé, Formations, Réserves de chantier, Borne, Coût chantiers, Statistiques, Exporter, Envoyer par e-mail, Sélectionner des interventions, Réglages de l'entreprise, Versions du planning, Interventions supprimées ou décalées, Déconnexion (certaines si dispo ; nombres de congés et réserves).
**Non disponible aujourd'hui** : glisser-déposer (donc ni déplacement ni création par glisser un client), légende, bouton d'impression (le menu du navigateur imprime le jour affiché), retour direct à la semaine actuelle. Cibles tactiles d'au moins 44 px sur écran tactile (règle actuelle) ; zoom navigateur bloqué.

**Impression A4 paysage.**
- Lancement : menu « Imprimer le planning » : période Semaine / Jour / Mois (celle de l'écran par défaut ; semaine et mois navigables ; jour : Aujourd'hui, Demain ou date) ; toute l'équipe (à chaque ouverture) ou un salarié ; « Avec colonne signature », « Avec les tâches » (semaine et jour, si dispo), mémorisées ; « Imprimer » (« Préparation… » si une autre période doit être lue ; échec signalé). Ctrl/Cmd+P ou menu du navigateur : imprime sans menu la période affichée (semaine sur ordinateur, jour sur téléphone), toute l'équipe, sans signature, sauf fenêtre ouverte ou semaine pas chargée. N'écrit rien.
- Contenu : en-tête (logo BEMEXO, période, entreprise et son logo), légende (créneaux et plages, journée entière ou sans horaire, heures envoyées, réunion), date d'impression ; une ligne par salarié (photo ou initiales, nom), une colonne par jour ; mêmes bulles que l'écran, sauf états en direct (« en cours depuis »), sélection et repère du jour. PDF : « Planning S-43 » (ou jour, ou mois) – Entreprise [– Prénom si un seul salarié]. « Retirée par le salarié » reste barrée ; heures « ajoutées par le salarié » imprimées ; réunions toujours, tâches sur option. Absences : congé et intempérie en toutes lettres ; **arrêt maladie imprimé « Absent »** (donnée de santé, feuille affichée au dépôt). Mois : sans détail horaire, un petit bloc par intervention portant le code du chantier, clé « Chantiers : code titre » en tête, absences en lettres (C, I, A, R ; maladie → A), ni tâches ni réunions.
- Pagination : une page autant que possible (mise à l'échelle automatique), sinon plusieurs pages avec en-tête et légende répétés. À ne pas changer : format et orientation, les informations ci-dessus, lisibilité d'une feuille affichée au mur, fidélité à l'écran. Les mêmes éléments d'intervention servent à l'écran, au papier, à la tablette de pointage et à la ligne « en cours depuis » de l'écran salarié : les redessiner les redessine partout.

## 8. Hors périmètre de la première étape

**8.1 Contenu conservé (◇).** Seuls leur point d'entrée, leur ouverture et leur cadre peuvent changer : éléments ◇ de §2 (J à O) et §4 (n°15 à 18), feuille imprimée A4 ; d'après l'inventaire, de ≈ 190 lignes de code (imports, versions…) à ≈ 1 600 (fiche salarié). Raisons : fenêtres chargées à l'ouverture, règles de calcul ou d'écriture propres (paie, heures sup, verrous, serveur), intitulés cités par l'assistant et le guide, feuille imprimée identique à l'écran. L'inventaire n'a relu qu'en partie : fiche salarié, borne, formations, e-mail, actions de l'assistant, import de salariés, guide.

**8.2 Contraintes d'encastrement qui touchent aux fonctions.**
- Pages statiques, tout dans le navigateur avec les droits de la personne connectée : aucune règle ni écriture ne change. Deux dispositions, bascule à 1 024 px (guide et impression en dépendent).
- L'assistant et le guide citent des intitulés mot pour mot (« Salariés », « Clients », « Sélectionner », « Exporter », « Coût chantiers », « Réserves », « S'abonner », « Réglages de l'entreprise », « Feuille d'heures », « Présent », « Me guider pas à pas »…) et entourent le vrai bouton : garder ces intitulés, chaque bouton cité visible et touchable dans la disposition annoncée ; signaler tout renommage. Le guide appelle le point d'entrée de navigation du téléphone « menu ☰ » ; s'il change, signaler le renommage.
- Appairage de la borne : /admin doit accepter `#borne=…` avant et après connexion (le patron arrive souvent déconnecté : le fragment est mémorisé, retiré de l'adresse, repris après connexion ou rattrapé dans un /admin déjà ouvert) et ouvrir « Associer cette tablette ? ».
- Poids, habillage des fenêtres, thème, zoom, langue : `integration-technique.md`. Prévisualisation : mode démonstration (30 salariés fictifs, aucune écriture).

## 9. Annexe : liste exhaustive des capacités

B1 Voir la semaine, salarié par jour.
B2 Lire une intervention : client, lieu, horaire prévu, créneau.
B3 Distinguer prévue / à envoyer / envoyée.
B4 Voir « retirée », « ajoutée par le salarié », heures hors planning.
B5 Voir la réception (sans, réserve à traiter, levée, en cours).
B6 Voir le nombre de documents d'un chantier.
B7 Voir qui pointe en direct, depuis quand.
B8 Voir l'absence du jour de chaque salarié.
B9 Voir « N jours en attente » / « À jour » par salarié.
B10 Voir réunions et tâches (x/y), même un jour d'absence.
B11 Consulter la légende des codes visuels (ordinateur, papier).
B12 Changer de semaine, revenir à l'actuelle, lire S-NN.
B13 Téléphone : voir et agir sur la journée de son choix pour chaque salarié (aujourd'hui : un jour à la fois, une carte par salarié).
B14 Rechercher un client, un salarié.
B15 Créer une intervention (case, téléphone).
B16 Créer une intervention en glissant un client.
B17 Modifier horaire et note ; lire heures déclarées, photos.
B18 Déplacer, réordonner par glisser.
B19 Copier par glisser (Ctrl / Alt / Option / ⌘).
B20 Copier vers d'autres jours ; dupliquer au lendemain.
B21 Comprendre un refus (verrou, absence, mois clôturé).
B22 Supprimer une intervention (confirmation si heures retirées).
B23 Annuler une suppression ou une copie par glisser.
B24 Sélectionner plusieurs interventions (jour au téléphone) et les supprimer.
B25 Poser une absence (plage ou jusqu'au retour).
B26 Remettre « Présent ».
B27 Gérer les tâches du jour et les réunions.
B28 Attribuer un client à des heures « ajoutées par le salarié » ou sur « Autre ».
B29 Inviter un salarié ; en importer par CSV/Excel.
B30 Gérer les invitations en attente.
B31 Changer un rôle (confirmation des droits).
B32 Modifier la fiche salarié (identité, paie).
B33 Gérer les habilitations ; valider un bulletin pour le coût réel (si IA).
B34 Archiver, réactiver, supprimer un salarié ; clôturer (et archiver) / rouvrir ses heures.
B35 Créer un client ; en importer par CSV/Excel.
B36 Modifier la fiche client et son budget ; l'archiver ou la supprimer.
B37 Gérer les documents d'un chantier (catégories, droits) ; les envoyer au client.
B38 Terminer, rouvrir un chantier ; lire son bilan.
B39 Lire la feuille d'heures d'un salarié.
B40 Corriger des heures (motif, salarié prévenu) ; renvoyer une journée ; supprimer un brouillon vide.
B41 Relancer (à la main ou automatiquement) ; détail de « à relancer ».
B42 Accepter ou refuser un congé.
B43 Exporter l'équipe (PDF, Excel, CSV).
B44 Envoyer l'export au comptable sans doublon.
B45 Choisir le verrou avant l'export.
B46 Clôturer / rouvrir un mois.
B47 Exporter un seul salarié, sans verrou.
B48 Imprimer le planning en A4 paysage (semaine, jour, mois ; options ; Ctrl/Cmd+P).
B49 Versions d'une semaine : voir, revenir, annuler, garder.
B50 Lire l'historique des suppressions et décalages.
B51 Statistiques (heures, heures sup, absences, oublis, coût).
B52 Coût par chantier et dépenses.
B53 Voir les pièces jointes de l'entreprise par chantier.
B54 Registre des réserves : lever, rouvrir.
B55 Relier une tablette (QR ou code), la remplacer, la déconnecter ; régler ses horaires, lire son état.
B56 Gérer le QR fixe imprimable.
B57 Gérer les formations (ajouter, suivre qui a vu quoi, retirer / remettre, quota vidéo).
B58 Envoyer planning PDF ou message aux salariés.
B59 Régler l'entreprise (logo, coordonnées).
B60 Régler heures & paie.
B61 Régler borne & pointage.
B62 Régler notifications et alertes.
B63 Autoriser ou retirer le support BEMEXO ; lire son journal ; voir le mode support.
B64 Voir l'essai, s'abonner, gérer l'abonnement ; subir le blocage d'essai.
B65 Ouvrir le menu du compte ; se déconnecter.
B66 Dialoguer avec l'assistant (écrit, voix, pièce jointe).
B67 Faire agir l'assistant (Annuler / Modifier, confirmations).
B68 Guide pas à pas ; nouveau chat, historique (à venir, non fusionné).
B69 Être aidé : démarrage, astuce de copie, infobulles, saisie d'heure.
B70 Voir invitations, congés, réserves, pièces en attente.
B71 Gérer les états : chargement, erreurs, messages d'action, hors ligne, vide, essai, lecture seule, options absentes.
B72 Téléphone : atteindre depuis un point d'entrée unique toutes les fonctions de la barre du bureau, avec leurs intitulés.
