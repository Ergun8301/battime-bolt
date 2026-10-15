# 01 · Repères réels de l'écran salarié (/poseur et /pointer)

Relevé par grep du code au 15/10/2026, branche `claude/determined-mayer-dnhach`. Fichiers : `app/poseur/page.tsx`, `app/pointer/page.tsx`, `components/` (`poseur-day`, `live-timer`, `missions-worker`, `worker-reserves`, `pause-picker`, `poseur-week`, `poseur-month`, `poseur-history`, `poseur-trainings`, `worker-assistant`, `worker-draft-card`, `guide-tour`, plus `termine-le`, `time-field`, `reserve-lift-form`, `leave-request-dialog` qui portent des repères de l'écran). Numéros de ligne = JSX (pour les classes : première utilisation dans `className`).

## Règle

**Un repère listé ici doit exister à l'identique dans la nouvelle version, sur l'élément qui joue le même rôle, ou recevoir une ligne « ancien → nouveau » (déplacé vers / fusionné avec / supprimé, et pourquoi).** Sont lus par du code de test (64 scripts navigateur dans `scripts/tests/`, `worker-tours.test.ts`) ou par l'assistant : un repère qui disparaît sans ligne fait échouer une recette.
Deux contraintes de forme : (1) chaque `data-guide` doit rester écrit en toutes lettres dans le JSX du composant qui porte l'élément (le test des guides cherche la valeur littérale à côté de `data-guide`) ; une ancre passée en prop ne serait plus trouvée. (2) Le mot « onglet » est interdit dans les textes des guides : le dossier doit donner un autre mot pour la barre du bas.

Colonne « README » : le README du designer (§5, colonne « Repères à garder », 17 repères cités) cite-t-il ce repère ? **oui** = cité et correctement placé · **faux** = cité mais l'élément n'existe pas là où il le place (ou mal attribué) · **non** = jamais cité. Total : 50 `data-testid` statiques, 43 classes lues, 26 `data-guide`, 7 `data-guide-confirm`, 7 `aria-label` lus : seuls 8 repères existants sont cités (`.bt-total`, `.bt-send`, `journee.envoyer`, `.bt-ed`, `.bt-save`, `data-guide-confirm` en générique, `#kx-pass`, `.bt-timecard` mal placé).

## A. Repères cités par le README mais faux ou mal attribués (à corriger côté dossier)

| Repère cité | Placé par le README sur | Réalité | README |
|---|---|---|---|
| `.bt-timecard` | `CartePointage` | Les **deux boutons Début / Fin** de l'éditeur (`poseur-day.tsx:2678`, `:2682`), lus par 6 scripts. La carte de pointage est `.bt-lt` (`live-timer.tsx:207`) | faux |
| `data-bub`, `data-creneau`, `data-withdrawn` | `CarteChantier` | Aucune occurrence dans l'écran salarié (bulles du planning du bureau) | faux |
| `role=button` | `CarteChantier` | Les cartes sont des `div onClick` sans rôle (`poseur-day.tsx:2298`, `:2334`) ; l'ajouter est bienvenu mais ce n'est pas un repère existant | faux |
| `data-live` | `CartePointage` | `admin-planning.tsx` seulement (bureau) ; le repère salarié est `data-testid="live-timer"` / `card-live` | faux |
| `.bt-err` | `MessageEtat` | Pages de connexion / inscription seulement ; l'écran salarié n'a pas de classe d'erreur lue | faux |
| `data-day` | `BandeJours` | `team-day.tsx:272` (jours du chef), pas la bande de /poseur | faux |
| « `data-guide` actuels de l'en-tête et du menu du compte » | `EnteteJournee` | Renvoi sans liste : voir §C (`entete.scanner`, `menu.*`) | non (générique) |

## B. `data-testid`

| Repère | Élément | Fichier:ligne | README |
|---|---|---|---|
| `scan-open` | Bouton scanner (en-tête) | `app/poseur/page.tsx:549` | non |
| `menu-formations` | Entrée du menu « Formations » | `app/poseur/page.tsx:605` | non |
| `menu-formations-badge` | Compteur de formations non vues | `app/poseur/page.tsx:607` | non |
| `total-prevu` | Total des créneaux prévus | `poseur-day.tsx:2188` | non |
| `panier` | Bascule du panier | `poseur-day.tsx:2222` | non |
| `day-returned` | Bandeau « journée renvoyée par le bureau » | `poseur-day.tsx:2248` | non |
| `card-live` | Carte du pointage en cours (ligne de la liste, et ligne prévue en cours) | `poseur-day.tsx:2281`, `:2298` | non |
| `card-planned` | Carte d'un créneau prévu | `poseur-day.tsx:2298` | non |
| `card-planned-overlap`, `card-planned-incomplete` | Avertissements « ne sera pas envoyé » sur un prévu | `poseur-day.tsx:2318`, `:2321` | non |
| `card-entry` | Carte d'une intervention saisie (13 scripts) | `poseur-day.tsx:2334` | non |
| `card-exit-forgotten` | Carte « sortie oubliée » | `poseur-day.tsx:2360` | non |
| `card-office-edit` | Ligne « le bureau a corrigé » | `poseur-day.tsx:2388` | non |
| `card-reserve` | Bloc réserve d'une carte | `poseur-day.tsx:2435` | non |
| `card-lift` | Bouton « lever la réserve » d'une carte | `poseur-day.tsx:2447` | non |
| `card-start`, `start-other` | Code mort (les scripts vérifient leur **absence**) | `poseur-day.tsx:2003`, `:2528` | non |
| `start-other-sheet` | Feuille « chantier du chrono » | `poseur-day.tsx:3036` | non |
| `dock-assistant` | Bouton assistant (barre du bas) | `poseur-day.tsx:2588` | non |
| `heure-exacte` | Mention « heure exacte gardée » de la molette | `poseur-day.tsx:2792` | non |
| `ed-pause-*` (préfixe) | Puces de pause de l'éditeur (`-label`, `-hint`, `-0`…, `-autre`, `-input`, `-preview`, `-ok`, `-error`) | `poseur-day.tsx:2700` → `pause-picker.tsx:149-205` | non |
| `pause-*` (préfixe) | Mêmes puces dans « Tu as pris une pause ? » | `poseur-day.tsx:2894` → `pause-picker.tsx:149-205` | non |
| `planned-confirm` | Fenêtre « Le bureau avait prévu… » | `poseur-day.tsx:2856` | non |
| `planned-confirm-list` | Liste des créneaux prévus de la fenêtre | `poseur-day.tsx:2861` | non |
| `planned-confirm-send` | « Oui, envoyer ces horaires » | `poseur-day.tsx:2870` | non |
| `planned-confirm-fix` | « Non, je corrige mes heures » | `poseur-day.tsx:2871` | non |
| `planned-confirm-skip` | « Envoyer seulement mes heures notées » | `poseur-day.tsx:2873` | non |
| `pause-ask` | Fenêtre « Tu as pris une pause ? » | `poseur-day.tsx:2882` | non |
| `pause-ask-range` | Plage concernée (« 7:30 d'affilée… ») | `poseur-day.tsx:2887` | non |
| `live-clash` | Fenêtre « Votre pointage est encore en cours » | `poseur-day.tsx:2958` | non |
| `live-clash-text` | Corps : heure de pointage et plage recouverte | `poseur-day.tsx:2966` | non |
| `live-clash-why` | Explication propre au cas (6 cas, voir fichier 02) | `poseur-day.tsx:2969` | non |
| `live-clash-gap` | Phrase « Après HH:MM, rien ne sera compté » | `poseur-day.tsx:2975` | non |
| `live-clash-finish` | « Terminer le pointage à HH:MM, puis ajouter / enregistrer » | `poseur-day.tsx:2999` | non |
| `live-clash-fix` | « Corriger les heures » (focus initial) | `poseur-day.tsx:3005` | non |
| `send-ask` | Fenêtre « Envoyer votre journée maintenant ? » | `poseur-day.tsx:3017` | non |
| `send-ask-yes` / `send-ask-no` | « Oui, envoyer ma journée » / « Pas maintenant » (focus initial sur le Non) | `poseur-day.tsx:3023`, `:3027` | non |
| `live-timer` | Carte du pointage (en cours ou oublié) | `live-timer.tsx:207` | non |
| `fin-lendemain` | Note « Fin le lendemain (jour) à HH:MM » | `live-timer.tsx:223` | non |
| `lt-finish` | « Terminer ma journée » (2 variantes) | `live-timer.tsx:230`, `:252` | non |
| `lt-end` | Champ de l'heure de fin du pointage oublié (préfixe `lt-end-list`) | `live-timer.tsx:219` → `time-field.tsx:61`, `:69` | non |
| `termine-le` | Mention « Terminé le … » d'un chantier | `termine-le.tsx:11` | non |
| `my-meetings`, `my-meeting` | Bloc et carte de réunion | `missions-worker.tsx:104`, `:107` | non |
| `my-tasks`, `my-tasks-offline` | Bloc des tâches ; « Hors-ligne : coche quand le réseau revient. » | `missions-worker.tsx:124`, `:130` | non |
| `my-task`, `my-task-time`, `my-task-done` | Ligne de tâche ; heure ; case (`aria-pressed`, `aria-label` dynamique) | `missions-worker.tsx:135`, `:136`, `:139` | non |
| `reserves-banner` | Puce / bandeau « N réserves à lever » | `worker-reserves.tsx:80` | non |
| `reserves-dialog` | Feuille de la liste des réserves | `worker-reserves.tsx:87` | non |
| `wr-item`, `wr-lift` | Ligne de réserve ; bouton « lever » | `worker-reserves.tsx:92`, `:103` | non |
| `reserve-lift-submit` | « Lever la réserve » du formulaire | `reserve-lift-form.tsx:83` | non |
| `week-meeting`, `week-tasks`, `week-task` | Réunion et tâches dans la Semaine | `poseur-week.tsx:226`, `:235`, `:237`, `:340`, `:350` | non |
| `history-traces`, `history-meal-count` | « Interventions supprimées » ; compteur de paniers | `poseur-history.tsx:218`, `:248` | non |
| `trainings-banner`, `trainings-list`, `training-row` (+ `data-seen`), `training-watch`, `training-open`, `training-na`, `training-seen` | Formations : puce, liste, ligne, lecteur, lien, indisponible, « Vue » | `poseur-trainings.tsx:75`, `:182`, `:196`, `:203`, `:207`, `:209`, `:211` | non |
| `draft-card`, `from-planning`, `{testId}`, `{testId}-error` | Fiche d'heures de l'assistant | `worker-draft-card.tsx:187`, `:199`, `:67`, `:71` | non |
| `guide-root`, `guide-ring` (`data-cible`), `guide-card`, `guide-count`, `guide-close`, `guide-text` (`data-phase`), `guide-missing`, `guide-covered`, `guide-prev`, `guide-next` | Guide pas à pas | `guide-tour.tsx:341-357` | non |

## C. `data-guide` (ancres des guides pas à pas et de l'assistant)

| Repère | Élément | Fichier:ligne | README |
|---|---|---|---|
| `entete.scanner` | Bouton scanner (en haut, jamais en bas aujourd'hui) | `app/poseur/page.tsx:549` | non |
| `menu.compte` | Nom / avatar qui ouvre le menu (`aria-label` « Mon compte et menu ») | `app/poseur/page.tsx:557` | non |
| `menu.photo`, `menu.conges`, `menu.infos`, `menu.notifications` | Lignes du menu du compte | `app/poseur/page.tsx:573`, `:576`, `:584`, `:590` | non |
| `menu.journee`, `menu.semaine`, `menu.mois`, `menu.historique` | Entrées de vue (valeurs de `MENU_GUIDE`) | `app/poseur/page.tsx:65`, `:599` | non |
| `infos.fermer` | « Fermer » de la fenêtre Informations | `app/poseur/page.tsx:649` | non |
| `journee.panier` | Panier | `poseur-day.tsx:2223` | non |
| `journee.trou` | Rangée Route / Pause du trou de la journée | `poseur-day.tsx:2266` | non |
| `journee.chantier` | Carte d'un prévu (hors pointage en cours) ou d'une intervention cliquable | `poseur-day.tsx:2298`, `:2334` | non |
| `journee.sortie-oubliee` | Carte « sortie oubliée » | `poseur-day.tsx:2360` | non |
| `journee.copier` | « Copier la journée d'hier » et « Dupliquer cette journée » (même valeur, 2 boutons) | `poseur-day.tsx:2510`, `:2538` | non |
| `journee.plus` | Bouton « + » (`aria-label` « Ajouter un chantier ») | `poseur-day.tsx:2561` | non |
| `journee.envoyer` | « Envoyer ma journée », 5 états (grisé, « Envoyer ce qui reste », envoi, « Journée envoyée ✓ », aucun) | `poseur-day.tsx:2569`, `:2571`, `:2575`, `:2579`, `:2581` | oui |
| `journee.assistant` | Bouton assistant ; cible de retour du focus à la fermeture du guide | `poseur-day.tsx:2588` ; `page.tsx:677` | non |
| `journee.terminer` | « Terminer ma journée » (2 variantes) | `live-timer.tsx:230`, `:252` | non |
| `editeur.chantier` / `editeur.autre` | Champ chantier / sous-formulaire « Autre chantier » | `poseur-day.tsx:2620` | non |
| `editeur.ajouter-chantier` | « Ajouter ce chantier » | `poseur-day.tsx:2655` | non |
| `editeur.horaires` | Boutons Début et Fin (même valeur ×2) | `poseur-day.tsx:2678`, `:2682` | non |
| `editeur.reserve` | Choix « Avec réserve » | `poseur-day.tsx:2718` | non |
| `editeur.note` | Champ note / détail des réserves | `poseur-day.tsx:2727` | non |
| `editeur.documents` | Bouton « Documents » | `poseur-day.tsx:2740` | non |
| `editeur.retirer` | Corbeille (`aria-label` « Retirer ce chantier ») | `poseur-day.tsx:2745` | non |
| `editeur.ok` | « OK » (classe `.bt-save`) | `poseur-day.tsx:2757` | non |
| `copier.valider` | « Copier (N) » du calendrier de duplication | `poseur-day.tsx:2816` | non |
| `confirmer.retirer` | « Oui, retirer » | `poseur-day.tsx:2940` | non |
| `reserves.bandeau` | Puce « réserves à lever » | `worker-reserves.tsx:80` | non |
| `reserves.lever` | Bouton « lever » d'une ligne | `worker-reserves.tsx:103` | non |
| `reserves.valider` | « Lever la réserve » | `reserve-lift-form.tsx:83` | non |
| `semaine.jour` | Jour ouvrable de la Semaine | `poseur-week.tsx:184`, `:308` | non |
| `historique.jour` | Carte d'un jour de l'Historique | `poseur-history.tsx:237` | non |
| `conges.faire`, `conges.type`, `conges.envoyer`, `conges.annuler` | Formulaire et liste des demandes de congé | `leave-request-dialog.tsx:120`, `:128`, `:149`, `:172` | non |

## D. `data-guide-confirm` (7 fenêtres de confirmation, lues par le guide : il se met sous elles)

Le README en nomme 5 (« QuestionPrevu / Pause / DixHeures », « JourneeDejaEnvoyee », « PointageEncoursConflit ») sous la forme générique ; **manquent « Retirer ce chantier ? » et « Envoyer votre journée maintenant ? »**. Les 7 doivent garder l'attribut sur le contenu de la fenêtre.

| Fenêtre | Titre actuel | Fichier:ligne | README |
|---|---|---|---|
| Journée déjà envoyée | « Journée déjà envoyée » | `poseur-day.tsx:2842` | oui (générique) |
| Horaires prévus | « Le bureau avait prévu… » (+ `planned-confirm`) | `poseur-day.tsx:2856` | oui (générique) |
| Pause | « Tu as pris une pause ? » (+ `pause-ask`) | `poseur-day.tsx:2882` | oui (générique) |
| Vérification (plus de 10 h) | « Vérification » | `poseur-day.tsx:2908` | oui (générique) |
| Retrait | « Retirer ce chantier ? » | `poseur-day.tsx:2925` | **non** |
| Pointage en cours | « Votre pointage est encore en cours » (+ `live-clash`) | `poseur-day.tsx:2958` | oui (générique) |
| Envoi après scan | « Envoyer votre journée maintenant ? » (+ `send-ask`) | `poseur-day.tsx:3017` | **non** |

Fenêtre voisine sans l'attribut : « Mois clôturé / Heures clôturées » (`poseur-day.tsx:2824`, bouton « Compris »).

## E. `aria-label` fixes lus par des scripts ou des guides

| Valeur | Élément | Fichier:ligne | README |
|---|---|---|---|
| « Mon compte et menu » (12 scripts, `role=menu` + `menuitem` derrière : 7 et 11 scripts) | Avatar / nom → menu | `app/poseur/page.tsx:557` ; contenu du menu `:564` | non |
| « Scanner la borne » | Scanner | `app/poseur/page.tsx:549` | non |
| « Retour à ma journée » (classe `.bt-phdr-back`) | Flèche de retour des vues | `app/poseur/page.tsx:541` | non |
| « Journées à envoyer » ; « Journée du {date} à envoyer » ; « Chantiers pas encore partis » | Rappels d'envoi (60 jours) et file du téléphone | `app/poseur/page.tsx:478`, `:467`, `:514` | non |
| « Informations » (`role=dialog`) | Fenêtre Informations | `app/poseur/page.tsx:643` | non |
| « Panier repas » | Bascule panier ; icône dans la Semaine | `poseur-day.tsx:2220` ; `poseur-week.tsx:271`, `:378` | non |
| « Ajouter un chantier » (3 scripts) | Bouton « + » | `poseur-day.tsx:2562` | non |
| « Assistant BEMEXO » | Bouton assistant | `poseur-day.tsx:2588` | non |
| « Retirer ce chantier » (2 scripts) | Corbeille de l'éditeur | `poseur-day.tsx:2745` | non |
| « Total des pauses (h:mm) » | Champ « Autre » des pauses | `pause-picker.tsx:188` | non |
| « Réserves à lever » | Puce réserves | `worker-reserves.tsx:80` | non |
| `{N} formation(s) à voir` (dynamique) ; « {titre} : vue / pas encore vue » | Puce et case des formations | `poseur-trainings.tsx:75`, `:212` | non |
| « {heure} · {texte} : fait (toucher pour décocher) / pas fait » | Case d'une tâche | `missions-worker.tsx:140` | non |
| « Envoyé » | Icône dans la Semaine | `poseur-week.tsx:274`, `:379` | non |
| « Chantier », « Retirer », « Début », « Fin » | Champs de la fiche d'heures de l'assistant | `worker-draft-card.tsx:193`, `:197`, `:201`, `:203` | non |
| « Guide pas à pas » (`role=dialog`) | Carte du guide | `guide-tour.tsx:344` | non |

## F. Classes `.bt-*` lues par les tests (43)

| Repère | Élément | Fichier:ligne (JSX) | README |
|---|---|---|---|
| `bt-phone`, `bt-phdr`, `bt-phdr-date`, `bt-phdr-back`, `bt-info`, `bt-phbody`, `bt-phscroll` | Cadre, en-tête, date (titre), retour, fenêtre Informations, corps défilant | `app/poseur/page.tsx:531`, `:534`, `:539`, `:541`, `:644`, `:619`, `:625` | non |
| `bt-day`, `bt-day-scroll` | Racine et zone défilante de la Journée | `poseur-day.tsx:2115`, `:2117` | non |
| `bt-total` | Bloc du total (27 scripts) | `poseur-day.tsx:2180` | oui |
| `bt-total-big` | Valeur « Total aujourd'hui » (3 scripts) | `poseur-day.tsx:2184` | non |
| `bt-stats`, `bt-stat`, `bt-stat-n` | Compteurs (chantiers, pauses, route, panier) | `poseur-day.tsx:2192`, `:2193`, `:2194` | non |
| `bt-sec` | Titre de section | `poseur-day.tsx:2243` | non |
| `bt-iv`, `bt-iv-name`, `bt-badge`, `bt-iv-mod`, `bt-plan-k` | Carte d'intervention, nom, étiquette d'état, mention de modification, étiquette « prévu » | `poseur-day.tsx:2281`, `:2284`, `:2344`, `:2498`, `:2299` | non |
| `bt-gap`, `bt-gap-b` | Trou de journée et ses boutons Route / Pause | `poseur-day.tsx:2257`, `:2267` | non |
| `bt-dup` | « Dupliquer cette journée » | `poseur-day.tsx:2538` | non |
| `bt-fab` | Bouton « + » | `poseur-day.tsx:2560` | non |
| `bt-send` | « Envoyer ma journée » (12 scripts, 5 états + `done`) | `poseur-day.tsx:2569-2581` | oui |
| `bt-ed`, `bt-ed-cancel`, `bt-ed-doc`, `bt-ed-trash`, `bt-save` | Éditeur, croix / annuler, documents, corbeille, OK | `poseur-day.tsx:2596`, `:2599`, `:2740`, `:2745`, `:2757` | oui (`bt-ed`, `bt-save`) · non (les 3 autres) |
| `bt-site-search`, `bt-site`, `bt-site-name` | Recherche de chantier, ligne, nom | `poseur-day.tsx:2610`, `:2619`, `:2625` | non |
| `bt-times`, `bt-timecard`, `bt-dur` | Bloc horaires, boutons Début / Fin, durée nette | `poseur-day.tsx:2677`, `:2678`, `:2686` | faux (`bt-timecard`) · non |
| `bt-note` | Champ note | `poseur-day.tsx:2726` | non |
| `bt-seg`, `bt-segb`, `bt-molette` | Choix du statut ; boutons ; molette d'heure | `poseur-day.tsx:2768`, `:2769`, `:2782` | non |
| `bt-lt`, `bt-lt-big` (valeur écoulée, définie `:78`) | Carte de pointage ; durée écoulée (`bt-lt-el`) | `live-timer.tsx:207` | non |
| `bt-pp-chips` | Rangée de puces de pause | `pause-picker.tsx:162` | non |

## G. /pointer (`app/pointer/page.tsx`)

| Repère | Élément | Ligne | README |
|---|---|---|---|
| `#kx-pass` | Champ mot de passe de la connexion sur place | `:135` | oui |
| `pointer-company` | Nom de l'entreprise | `:130` | non |
| `pointer-checking`, `-info`, `-login`, `-locating`, `-punching`, `-done`, `-refused`, `-error` | Enveloppe de chaque phase (`pointer-${phase}`) | `:252` | non |
| `fixed-info`, `fixed-info-ok` (« Continuer »), `fixed-info-no` (« Je refuse ») | Information sur le QR fixe | `:151`, `:160`, `:161` | non |
| `fixed-refused`, `fixed-refused-manual` (« Ajouter mon intervention à la main »), `fixed-refused-retry` (« Réessayer », si ticket connu) | Refus d'un QR fixe | `:269`, `:273`, `:274` | non |
| `punch-cancelled` | « Pointage annulé » (moins d'une minute) | `:282` | non |
| (aucun repère) | « Rien à enregistrer » + « Ouvrir mon espace » (état neutre) | `:322-329` | non |
| `after-before` (« Ajouter une intervention faite avant »), `after-send` (« Envoyer ma journée »), `after-add` (« Ajouter une intervention ») | Raccourcis après arrivée / départ | `:307`, `:312`, `:315` | non |
