# 02 · Confirmations, gardes, erreurs et cas limites que le dossier ne dessine pas (ou dessine mal)

Sources : `audit-salarie/01-couverture.md` (constats PB01 à PB18, lignes « ✘ », « ∅ », « ◐ »), `components/poseur-day.tsx`, `live-timer.tsx`, `app/pointer/page.tsx`. Fonctionnel seulement : aucune consigne de forme, de couleur ni de place. Codes d'écran = ceux de la planche du designer (E01 à E28, P01 à P03, AS1 à AS8). Références `poseur-day.tsx:ligne`. S = numéro de capacité du cahier `fonctions-salarie.md`. Les libellés sont ceux du code actuel : les garder tels quels, ou donner une ligne « ancien → nouveau » (voir fichier 01).

Légende « Dossier » : **absent** = rien dans aucun cadre · **note** = dit seulement dans la note sous l'écran · **faux** = dessiné autrement que le comportement réel · **hors cadre** = présent dans le DOM mais sous la barre du bas ou hors du cadre 390 × 844.

## A. Envoi de la journée : ordre des contrôles

L'envoi (`handleSubmitDay`, `poseur-day.tsx:1583`) enchaîne **sept contrôles conditionnels**, dans cet ordre. Chacun peut ne pas se produire ; plusieurs peuvent se suivre. Le dossier ne donne l'ordre nulle part et affiche « AVANT L'ENVOI · 1/3, 2/3, 3/3 » : faux (les 3 ne s'enchaînent pas toujours, et la pause se repose une plage à la fois).

| # | Contrôle | Déclencheur | Ce que l'utilisateur doit pouvoir faire | Écran | Ce qui manque |
|---|---|---|---|---|---|
| A1 | Sortie oubliée sans fin | Une ligne « à compléter » (entrée sans heure de fin) est encore à envoyer | Être arrêté, voir pourquoi (« Sortie oubliée : mets ton heure de fin avant d'envoyer. »), tomber sur la ligne à compléter | E18 (état) | Arrêt d'envoi absent ; la note de E11 dit « mêmes phrases » que « Ajoute un chantier » : faux (deux phrases différentes) |
| A2 | Chevauchement | Deux lignes à envoyer (saisies, file du téléphone, prévus confirmés) se recouvrent, au moins une modifiable | Être bloqué, lire les deux plages (« Deux chantiers se chevauchent : 08:00–12:00 et 11:00–15:00. Corrige l'un des deux avant d'envoyer. »), corriger l'une des deux | E11 | Dessiné (une seule variante) ; l'état de carte « À ENVOYER » est remplacé par « CHEVAUCHEMENT » : le vocabulaire d'états doit rester celui du cahier. Recouvrement si l'une des deux lignes est déjà envoyée (non modifiable) : à dire |
| A3 | Horaires prévus | Des créneaux prévus par le bureau, non ouverts, sont à envoyer | Répondre « Oui, envoyer ces horaires » / « Non, je corrige mes heures » / « Envoyer seulement mes heures notées » (3e choix présent seulement s'il y a aussi des heures notées) ; voir la liste des créneaux ; si deux prévus se recouvrent, être bloqué | E08 | Dessiné ; le 3e choix et le blocage « deux prévus qui se chevauchent » absents ; focus initial voulu par le dossier sur « Non, je corrige » alors que le code place le premier bouton sur « Oui, envoyer ces horaires » |
| A4 | Pause | Plus de 6 h d'affilée sans pause notée (écarts de moins de 20 min comptés comme continus), **une plage à la fois** | Répondre d'un seul toucher (« Non », 15 min, … ou « Autre » + saisie validée) sans valeur présélectionnée ; plusieurs plages = plusieurs questions successives ; savoir de quelle plage on parle (« 7:30 d'affilée ») | E09 | Interaction réécrite : 30 min présélectionnées + « Valider » (un salarié qui valide sans lire se voit retirer 30 min). Indice « Pendant cette plage. Plusieurs pauses ? Additionne-les. » supprimé. Seuil de 6 h et écart de 20 min nulle part. Deuxième plage non dessinée. « Autre » : aperçu « = 1 h 15 » et 4 messages d'erreur absents (voir D4) |
| A5 | Journée vide | Plus rien à envoyer au moment de continuer | Être arrêté (« Ajoute un chantier ») | E03 (état) | Arrêt absent |
| A6 | Plus de 10 h | Total strictement supérieur à 10 h sur ce qui va partir (pause déduite) ; 10:00 pile ne déclenche rien | Lire le total (« Total : 10:45 (dépasse 10h). Vérifie tes horaires. »), choisir « Corriger » ou « Confirmer l'envoi » | E10 | Dessiné ; la frontière 10:00 non illustrée ; texte de fenêtre réécrit |
| A7 | Envoi proprement dit | Après A1 à A6 | Voir l'état « Envoi… » pendant l'écriture ; ne pas pouvoir relancer | E05 (état prêt) | État « Envoi… » jamais dessiné ; ligne d'aide « Le pointage en cours ne part pas » codée en dur sur 8 écrans sans pointage |

## B. Issues d'envoi et files d'attente

| # | Cas | Déclencheur | Ce que l'utilisateur doit pouvoir faire | Écran | Ce qui manque |
|---|---|---|---|---|---|
| B1 | Envoi partiel | Une ligne verrouillée entre-temps est ignorée par le serveur | Lire « N chantier(s) envoyé(s) sur M — les autres sont verrouillés. » et voir lesquels restent | – | Absent |
| B2 | Rien envoyé | Journée verrouillée ou modifiée côté bureau | Lire « Rien n'a été envoyé : la journée est verrouillée ou a changé. Recharge. », recharger | – | Absent |
| B3 | Échec d'écriture | Erreur serveur ou réseau pendant l'envoi | Voir un message d'échec (« Impossible d'envoyer » + cause) ; l'écran se recharge et ne garde pas de cartes « prévu » périmées | – | Absent |
| B4 | Envoi sans réseau | Appui sur « Envoyer ma journée » hors-ligne | Savoir que le geste est gardé (« Journée gardée sur le téléphone — elle partira dès que tu auras du réseau. ») ; les prévus confirmés rejoignent la file | E06 (hors-ligne) | Message de confirmation absent ; le cas « envoi demandé hors-ligne » diffère de « saisie hors-ligne » |
| B5 | Retour du réseau | La file du téléphone se vide seule | Voir « N chantier(s) envoyé(s) » ; aucun bouton nécessaire | E07 | Bandeau « 2 saisies vont partir » alors qu'une carte est déjà « À ENVOYER » : incohérent |
| B6 | Transferts en échec | Des lignes de la file sont refusées (journée verrouillée…) | Lire « N chantier(s) du JJ/MM ne part(ent) pas. Préviens le bureau. » (message qui reste dix secondes), « Relancer » | E19 | Dessiné ; la zone de toucher de « Relancer » (72 × 21 px) et la durée du message ne sont pas dites |
| B7 | Réseau instable à l'enregistrement | Enregistrement d'une ligne : réponse perdue | Savoir que « ça partira tout seul » | – | Absent |
| B8 | Raccourci envoi après scan | `/pointer` → « Envoyer ma journée » | Voir « Envoyer votre journée maintenant ? » avec le total de la journée, « Oui, envoyer ma journée » / « Pas maintenant » (focus initial sur « Pas maintenant » ; Entrée n'envoie jamais) ; raccourci valable 3 min, même compte, jour courant (« Ce raccourci a expiré : touchez « Envoyer ma journée » ») ; cas particuliers : pas de réseau, file à vider d'abord, heures non chargées | P02 puis E05 | Fenêtre et tous les messages absents (capacités S48, S97) |

## C. Journée envoyée, renvoyée, clôturée

| # | Cas | Déclencheur | Ce que l'utilisateur doit pouvoir faire | Écran | Ce qui manque |
|---|---|---|---|---|---|
| C1 | Journée déjà envoyée | Toucher une carte, « + » ou un réglage d'une journée entièrement envoyée | Lire que la secrétaire sera informée, « Annuler » / « Continuer » | E13 | Dessiné (texte réécrit) ; la **journée mixte** (envoyé + brouillon) ne demande **pas** de confirmation, mais corriger une ligne envoyée prévient quand même la secrétaire (« Correction envoyée — la secrétaire est prévenue ») : note seulement |
| C2 | Retrait d'une intervention | Corbeille de l'éditeur | Confirmer par « Retirer ce chantier ? », trois textes selon le cas : envoyée (« restera visible comme « Retiré » et la secrétaire en sera informée »), brouillon vide (« sera supprimé »), autre (« Les heures seront perdues »), boutons « Non » / « Oui, retirer » | E21 (corbeille seule) | **Aucun écran** pour la confirmation ni les trois textes ; résultat (« Chantier retiré — la secrétaire est prévenue », « Impossible de retirer : chantier verrouillé par le bureau ») absent |
| C3 | Ligne retirée | Intervention envoyée puis retirée | La voir en « Retiré », barrée, hors total, jamais effacée | E12 | Dessinée mais recouverte par le retour passager (hors cadre) |
| C4 | Mois clôturé | Mois clos par le bureau : toucher une carte, « + », le panier, copier, Route / Pause | Fenêtre « Mois clôturé » : « Le bureau a clôturé ce mois : la paie est partie… elle peut rouvrir le mois », « Compris » | E16 | Devenu bandeau permanent au texte hybride ; **deux textes distincts** à conserver : « Mois clôturé » et « Heures clôturées » (« Le bureau a clôturé tes heures jusqu'au {date} ») selon que le mois ou le salarié est clos. Jours « à venir » après la date de clôture |
| C5 | Journée renvoyée par le bureau | Dernier geste du bureau = renvoi, lignes repassées en brouillon | Lire le message, le motif, rouvrir la journée | E14 | Étiquette « À CORRIGER » absente du vocabulaire ; jour « aujourd'hui » mal posé ; priorité « oublié » contre « renvoyé » non dite |
| C6 | Corrections du bureau ou du chef | Ligne modifiée côté bureau | Voir l'ancienne et la nouvelle valeur et le motif | E15 | Dessiné ; ancien et nouveau doivent rester lisibles ensemble |
| C7 | Jour passé non envoyé | Un ou plusieurs jours des 60 derniers sont restés en brouillon | Voir la liste « N journées à envoyer » et ouvrir un jour | E05 (note d'en-tête) | Liste absente ; la bande ne montre que 7 jours alors que les rappels en relisent 60 |
| C8 | Panier verrouillé | Toutes les lignes sont chez le comptable, ou mois clos, ou hors-ligne sur une ligne déjà au serveur | Comprendre pourquoi (« Journée chez le comptable : vois avec la secrétaire. », « Panier non pris en compte (journée verrouillée ou hors-ligne) ») | E16 | Variante « chez le comptable » et variante « entreprise sans panier » absentes ; le panier hors-ligne sur ligne déjà envoyée reste un point ouvert |

## D. Éditeur d'intervention : refus et cas limites

| # | Cas | Déclencheur | Ce que l'utilisateur doit pouvoir faire | Écran | Ce qui manque |
|---|---|---|---|---|---|
| D1 | Refus de « OK » | Heures vides (« Indique l'heure de début et de fin »), identiques (« Le début et la fin sont identiques. »), chevauchement avec une ligne existante (« Ces heures chevauchent 11:00–11:30, déjà noté. Corrige le début ou la fin. »), pause ≥ durée de la ligne, chantier non choisi (« Choisis un chantier ») | Voir pourquoi, rester dans la feuille | E21 | Aucun des refus dessiné |
| D2 | Ligne verrouillée entre-temps | « OK » sur un chantier verrouillé par le bureau | Lire « Ce chantier n'a pas changé : il est verrouillé par le bureau. » | – | Absent |
| D3 | Autre chantier | Choix « Autre chantier » | Écrire « C'était quoi ? » (nom 80 car. max., ville 60), « Ajouter ce chantier » ; en cas d'échec, « Vos heures partiront sur « Autre » » | E22 | Dans la note seulement, pas dans le cadre ; aucun résultat de recherche (« Aucun chantier trouvé ») |
| D4 | Pause « Autre » | Saisie libre de la pause | Aperçu (« = 1 h 15 »), quatre messages d'erreur, puces plus longues que la ligne grisées, alerte au-dessus | E21 | Absents |
| D5 | Réglage de l'heure | Toucher Début ou Fin | Molette au quart d'heure ; **heure exacte gardée** si non retouchée (07:32 reste 07:32), écrite telle quelle si retouchée ; fenêtre « Réglage de l'heure » / « Valider les heures » | E21 | Fenêtre absente ; le champ affiche 07:30 alors que la note dit 07:32 : contradiction. Début et Fin sont deux boutons distincts aujourd'hui |
| D6 | Annuler | Fermer sans enregistrer | Sortir sans confirmation, saisie perdue | E21 | Pas de bouton « Annuler » (✕ seulement), alors qu'AS7 en a un |
| D7 | Statut et réserve | « Avec réserve » | Champ « Détail des réserves » | E21 | Libellé absent |
| D8 | Créneau prévu | Toucher un prévu | Ouvrir l'éditeur avec chantier figé ; **prévu sans début ou fin, ou chevauchant une saisie : « il ne partira pas » et l'écran le dit** ; hors total | E04 | Message visible partiellement ; la carte « heures à préciser » (hors cadre) ne le dit pas |
| D9 | Copie de journée | « Copier la journée d'hier » / « Dupliquer cette journée » | Hier vide (« Aucun chantier hier à copier »), heures à compléter (« Rien à copier : … »), hors-ligne (« Copie indisponible hors-ligne »), jours déjà remplis (chevauchements permis, aucun contrôle), jours de congé ou clos | E24 | Bouton d'entrée absent ; calendrier remplacé par des puces ; « ven. 16 » (congé) présélectionné ; erreurs absentes |
| D10 | Route / Pause d'un trou | Trou entre deux lignes (ex. 1:00 entre 11:30 et 12:30) | Répondre Route ou Pause ; voir l'état répondu ; mois clos : refusé | E05 | Hors cadre (jamais visible) ; état répondu jamais dessiné |

## E. Pointage en cours et pointage oublié

| # | Cas | Déclencheur | Ce que l'utilisateur doit pouvoir faire | Écran | Ce qui manque |
|---|---|---|---|---|---|
| E1 | Pointage en cours | Pointage ouvert aujourd'hui (la borne ou le QR démarre, jamais le téléphone) | Voir chantier, heure de début, durée écoulée, « Terminer ma journée » ; toucher la carte : rappel « Pointage en cours : … » (la ligne ne s'ouvre pas) ; le pointage compte dans le total mais n'est **jamais** envoyé par « Envoyer » | E05 | Carte hors cadre à l'écran de référence ; règle « ne s'ouvre pas » non dite (le README dit qu'elle ouvre l'éditeur) |
| E2 | Terminer | « Terminer ma journée » | Heure réelle gardée à la minute ; en cas d'échec, le pointage reste en cours et le dit | E05 | Messages d'échec absents |
| E3 | Pointage oublié | Pointage ouvert depuis un jour précédent | « Sortie oubliée » + « depuis lundi 08:00 » ; question « Tu as fini à quelle heure ? » ; champ d'heure ; « Terminer ma journée » | E17 | Question supprimée, bouton renommé « Enregistrer la fin » sans ligne de renommage ; bande des jours incohérente |
| E4 | Fin le lendemain | Heure de fin avant le début sur un pointage de la veille | Lire avant d'écrire « Fin le lendemain (mardi 06:30) à 06:30 : la nuit est comptée sur la journée du début » | E17 | Dessiné |
| E5 | Fin refusée | Fin = début (jour passé) ou fin avant début (aujourd'hui) | Lire « Fin et début à la même heure (08:00) : rien à compter » / « Indique une heure après 08:00 » | E17 | Note seulement |
| E6 | Règle des 14 h | Pointage ouvert depuis plus de 14 h : « sortie oubliée » la nuit ; jour clôturé : il reste ouvert ; un poste de nuit commencé à 21 h reste « en cours » ; ouvert, il s'affiche « Sortie oubliée » même en cours | Savoir à quelle journée appartient la deuxième ligne d'un poste de nuit | E18, frise « Poste de nuit » | **Aucune mention** au README ni sur la planche |
| E7 | Sortie oubliée d'une ligne | Ligne sans fin, ou fin posée sur l'heure prévue | Compléter ; lire « Fin posée sur l'heure prévue (12:00). Vérifie avant d'envoyer. » | E18 | Dessiné ; arrêt d'envoi A1 absent |

## F. « Votre pointage est encore en cours » (enregistrer une intervention qui chevauche le pointage)

Fenêtre unique à **six cas** (`poseur-day.tsx:2958-3010`). Toujours : titre, texte « Vous êtes pointé depuis HH:MM et le pointage n'est pas terminé. Vos heures HH:MM–HH:MM le chevauchent : la journée serait bloquée à l'envoi… », jamais de refus muet, Entrée sans effet par défaut, focus initial sur « Corriger les heures ».

| # | Cas | Déclencheur | Ce que l'utilisateur doit pouvoir faire | Écran | Ce qui manque |
|---|---|---|---|---|---|
| F1 | Terminer possible | L'intervention commence après le début du pointage et avant maintenant | « Terminer le pointage à HH:MM, puis ajouter / enregistrer » (le pointage compte de son début à l'heure de début de l'intervention) ou « Corriger les heures » ; si l'intervention finit avant maintenant : « Après HH:MM, rien ne sera compté… » ; **consigne borne** : « si vous pointez à la borne, ne scannez plus en partant… sinon la borne ouvrira un nouveau pointage » | E23 | Texte réécrit ; **consigne borne supprimée** ; texte exact testé par `pointage-lot10.mjs` |
| F2 | Avant le début | L'intervention recouvre le début du pointage | Seul « Corriger les heures » ; texte propre au cas | – | Note de E23 seulement |
| F3 | Début identique | L'intervention commence à la même minute | Seul « Corriger » ; renvoi vers « Terminer ma journée » si c'est le travail en cours | – | Note seulement |
| F4 | Dans le futur | L'intervention commence après l'heure actuelle | Seul « Corriger » ; texte « Il est HH:MM… » | – | Note seulement |
| F5 | Collision | Terminer à cette heure recouvre une autre ligne notée (éventuellement déjà envoyée, non modifiable : « seule la secrétaire peut la corriger ») | Seul « Corriger » ; savoir quelle ligne gêne | – | Note seulement |
| F6 | Indisponible | Cas résiduel | Seul « Corriger » ; « Terminer le pointage à une heure précise n'est pas disponible… » | – | Note seulement |

Après le bouton « Terminer… » : états « Un instant… » (en cours, fenêtre non fermable), puis succès (« Pointage terminé : HH:MM à HH:MM (heure choisie par vous) ») ou l'un des échecs : pointage déjà changé / annulé / fermé entre-temps (« Le pointage a été fermé à HH:MM. Vérifiez vos heures… »), réponse perdue (« La réponse n'est pas arrivée : vérifiez… »), vérification impossible, heure future, fiche fermée (« La fiche a été fermée : rien n'a été modifié »). **Hors-ligne** : l'enregistrement passe, avec « Votre pointage est encore en cours : ces heures seront vérifiées au retour du réseau ». Aucun de ces états n'est dessiné.

## G. Réserves, tâches, retours passagers

| # | Cas | Déclencheur | Ce que l'utilisateur doit pouvoir faire | Écran | Ce qui manque |
|---|---|---|---|---|---|
| G1 | État d'une réserve sur la carte | Intervention avec réserve | Distinguer à lever / levée par le bureau / levée le JJ mois | E05 | Aucune carte avec réserve ; pas de prop correspondante |
| G2 | Liste des réserves | Toucher « N réserves à lever » | Voir date, chantier · ville, « Sans détail écrit. » ; lever une ligne | E20 | Liste absente (saute de la puce à la feuille) |
| G3 | Lever une réserve | Formulaire | Commentaire (500 car.), photo ; **indisponible hors-ligne** ; **marche même sur un mois clôturé** | E20 | Dessiné ; règles hors-ligne / mois clos en note |
| G4 | Réserve levée | Après « Lever la réserve » | Retour « Réserve levée » avec « Annuler » pendant 10 s ; annulation = « Réserve remise à lever » ; erreurs de levée | E20 | Retour passager touchable jamais dessiné |
| G5 | Retours passagers | Journée envoyée, panier noté / retiré, chantier retiré, copie… | Lire le message sans qu'il masque une carte ; toucher « Annuler » quand il en porte un | E12 | Aucun retour avec action ; celui de E12 recouvre la carte « Retiré » |
| G6 | Tâches | Cocher une tâche | Hors-ligne : case désactivée + « Hors-ligne : coche quand le réseau revient. » ; zone de toucher réelle | E06 | Compteur « 1/3 » hors cadre (E05) ; case 26 px |
| G7 | Réunion du jour | Réunion planifiée | Voir la carte (heure, lieu) | E05 | Hors cadre |
| G8 | « Terminé le … » | Chantier marqué terminé | Voir la date sur le pointage en cours, la Semaine, le Mois, l'Historique | E04 | Seule la 4e carte (hors cadre) |

## H. Accès, réseau, /pointer, assistant, guide

| # | Cas | Déclencheur | Ce que l'utilisateur doit pouvoir faire | Écran | Ce qui manque |
|---|---|---|---|---|---|
| H1 | Chargement | Ouverture | Attendre | E01 | Dessiné |
| H2 | Échec de chargement | Réseau ou serveur | « Impossible de charger tes données », réessayer ; ne pas laisser un « + » actif ni « Rien à envoyer » | E02 | « RIEN À ENVOYER » et « + » actif affichés en cas d'échec |
| H3 | Hors-ligne | Perte de réseau | « Hors-ligne, tout est gardé · N en attente » ; ajouter, modifier, retirer sans réseau (étiquette « sur le téléphone ») | E06 | Dessiné |
| H4 | Compte archivé / rôle refusé | Accès | Message et sortie | E28 | « Se déconnecter » ajouté alors que le cahier prévoit une déconnexion automatique |
| H5 | Bouton retour Android | Retour avec une feuille ouverte | La couche se referme (y compris les questions d'envoi : **décision non listée aux points ouverts**) | – | Comportement non dit |
| H6 | /pointer · attente | Ouverture du lien QR | « Vérification du QR… », position, pointage ; connexion sur place (`#kx-pass`) avec ses erreurs | P01 (note) | Ni attente ni connexion dessinées |
| H7 | /pointer · information QR fixe | Première utilisation d'un QR fixe | « Continuer » / « Je refuse » | – | Absent |
| H8 | /pointer · refus d'un QR fixe | Position refusée, imprécise, hors zone, QR remplacé, point non posé | Lire la raison, « Ajouter mon intervention à la main », « Réessayer » seulement si le ticket est connu | P03 | P03 mélange ce cas avec « QR expiré » (combinaison impossible : un QR expiré n'a pas de ticket, donc pas de « Réessayer ») |
| H9 | /pointer · message serveur | QR expiré ou autre message serveur | Message + « Ouvrir mon espace » seul | P03 | À séparer de H8 |
| H10 | /pointer · neutres | Pointage annulé (moins d'une minute) ; « Rien à enregistrer » ; double scan | Message neutre + « Ouvrir mon espace » | P03 (note) | Note seulement |
| H11 | /pointer · départ | Après un départ | **Deux** boutons : « Envoyer ma journée » et « Ajouter une intervention » (plage jusqu'à l'heure du départ) ; arrivée : « Ajouter une intervention faite avant » | P02 | « Ajouter une intervention » absent du départ |
| H12 | Assistant · historique | Ouverture de l'historique | Conversations, « Retour », suppression et « Tout effacer ? » **confirmées en place par Oui / Non**, chargement, erreur (« Historique indisponible », « Réessayer »), verrou (« Une action est en cours… »), quota épuisé, « Abandonner cette action ? » | AS4 à AS6 | Garder / Supprimer + alerte modale à la place ; états chargement, erreur, verrou, quota absents |
| H13 | Assistant · raccourcis et questions | « Me guider pas à pas », raccourcis d'écran, questions heures / planning / collègues (si autorisé) | Capacités S89, S90 | AS1 | Aucun écran |
| H14 | Guide pas à pas | « Me guider pas à pas » | Anneau sur l'élément, étapes, « Je ne vois pas ce bouton », « Ce bouton est caché par une fenêtre » | – | 44 cibles changent de place, aucune table ancien → nouveau |
