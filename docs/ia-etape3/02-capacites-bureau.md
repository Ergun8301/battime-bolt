# Étape 3 — Capacités du bureau : résumé

Écrit le 15 octobre 2026, d'après le code au commit `b86a84c` (lecture seule). Fichier source : `capacites-bureau.json` — **138 capacités** : les 72 lignes B1…B72 de `docs/design-brief/fonctions-bureau.md` (libellés repris mot pour mot) et 66 sous-capacités ou fenêtres sans ligne propre (B73…B138). Niveaux : `docs/ia-vision.md` §3 ; en cas de doute sur une action nouvelle, niveau 3. Convention : genre « humain » = niveau 3 (l'assistant prépare, l'humain fait le dernier clic) sauf B71 (états d'écran, niveau 1).

## 1. Comptes

| Genre | Niveau 1 | Niveau 2 | Niveau 3 | Total |
|---|--:|--:|--:|--:|
| lire | 30 | · | · | 30 |
| naviguer | 2 | · | · | 2 |
| ouvrir | 12 | · | · | 12 |
| guider | 4 | · | · | 4 |
| écrire | · | 43 | 26 | 69 |
| humain | 1 | · | 20 | 21 |
| **Total** | **49** | **43** | **46** | **138** |

| État | B1–B72 | B73–B138 | Total |
|---|--:|--:|--:|
| couvert aujourd’hui | 11 | 11 | 22 |
| partiel (existe, fait moins) | 39 | 17 | 56 |
| à créer | 19 | 37 | 56 |
| sans objet (réservé à l’humain) | 3 | 1 | 4 |
| **Total** | **72** | **66** | **138** |

« Partiel » : un outil, un lien ou une fiche d'aide existe mais fait moins que ce qu'il faudrait (la fiche commence alors par « PARTIEL — »). Lecture : 78 capacités sur 138 ont déjà quelque chose, 22 seulement sont complètes.

- **Écritures de niveau 2 (43)** : « Annuler » existe déjà pour 8, est à créer pour 30, est impossible pour 5 (message déjà parti).
- **Outils existants (33 actions + « repondre »)** : 5 sont déjà directs avec « Annuler » ; 14 sont encore en carte à confirmer alors que la capacité est de niveau 2 ; 11 restent en carte (niveau 3) ; 3 n'ont pas d'équivalent d'écran (planning_semaine, modifier_habilitation, modifier_depense). Ces 33 actions sont toutes dans un domaine de `tool-domains.ts`.
- **À créer** : 50 outils (20 de lecture, 26 d'écriture, 2 d'ouverture ou de navigation, 2 de préparation d'envoi) et 8 extensions d'outils existants, plus 1 fiche d'aide. Un seul `ouvrir_fenetre(cible)` couvre 24 capacités.

## 2. Les 15 manques les plus importants pour un secrétaire

| # | Manque | Capacités | Constat vérifié dans le code |
|--:|---|---|---|
| 1 | Lire le planning (qui, où, quand, état des heures) | B1–B5, B8, B10, B21 | « Que fait Karim jeudi ? » n'a pas de réponse : la fonction lit le planning de −14 à +13 jours (`supabase/functions/assistant/index.ts:118`) mais le modèle ne reçoit qu'un instantané de chiffres (`supabase/functions/_shared/assistant-core.ts:28`), sans planning. |
| 2 | Changer de semaine ou de jour | B12, B13 | L'assistant explique (fiche « semaine ») mais ne navigue pas ; le geste existe à l'écran (`components/admin-planning.tsx:1975`). |
| 3 | Ouvrir la bonne fenêtre, pré-remplie | B72–B78, B27, B49, B50, B55, B57, B65 | 11 liens seulement (`supabase/functions/_shared/assistant-actions-core.ts:37`) ; 24 capacités attendent une ouverture absente (statistiques, formations, borne, versions, e-mail, fiche client, statut, documents…) ; un seul gestionnaire côté écran (`components/admin-planning.tsx:4371`). |
| 4 | Copier ou dupliquer une intervention | B19, B20 | Aucun outil de copie : `affecter_planning` ne lit ni l'horaire ni la note de la case source et n'applique pas les refus de `supabase/functions/_shared/copy-slot.ts:52`. |
| 5 | Feuille d'heures et « qui doit des heures » | B39, B9, B137 | Le modèle ne voit que le total du mois par salarié et « pas pointé hier » ; l'écran suit deux mois, les cases retirées et les clôtures. |
| 6 | Préparer l'export et l'envoi au comptable | B43–B45, B135 | Un guide et une fenêtre sans période. Il faut ouvrir « Exporter » à la bonne période et dire « N lignes seraient verrouillées » ; le clic reste humain (liste 3). |
| 7 | Imprimer le planning | B48 | Aucun outil, et la fiche « telecharger » répond à « imprimer » par l'export des heures (`supabase/functions/_shared/assistant-actions-core.ts:264`). |
| 8 | Statistiques et coût par période | B51, B52 | Ni heures sup, ni oublis, ni semaine ou année ; le coût d'un chantier n'existe que sur toute sa vie. |
| 9 | Tâches et réunions | B10, B27, B110–B116 | Neuf capacités, aucun outil ni fiche d'aide. |
| 10 | Corriger les heures jusqu'au bout | B40, B83–B85 | `corriger_pointage` ne change que début et fin ; pause, panier, route, « renvoyer au salarié », brouillon vide absents ; aucun « Annuler » (`lib/assistant-actions.ts:219`). |
| 11 | Terminer ou rouvrir un chantier, lire son bilan | B38, B101, B102 | Aucun outil ; la fiche « archiver_client » répond aussi à « chantier terminé » (`supabase/functions/_shared/assistant-actions-core.ts:218`). |
| 12 | Rouvrir un mois ; clôturer les heures d'un salarié | B80–B82 | `cloturer_mois` existe, pas son inverse ; la fin de contrat n'a qu'une fiche d'aide. |
| 13 | Retrouver un document, l'envoyer au client | B6, B53, B78, B105 | Rien ne liste les documents (150 lus par la fonction, non transmis au modèle) ; `ranger_document` exige un fichier joint. |
| 14 | « Annule ça » et « Annuler » partout | B23 + 30 capacités | 16 outils portent une annulation, mais seulement derrière le bouton de la carte ; elle manque pour 30 des 43 écritures de niveau 2. |
| 15 | Réserves et réglages incomplets | B108, B109, B117–B120 | Rouvrir et lire les réserves ; nom, SIRET, TVA, logo, panier repas, caisse de congés, désactivation de l'endroit au pointage absents de `modifier_reglages`. |

## 3. À trancher par le patron (niveaux)

1. **Suppressions que « Annuler » restaure à l'identique** (B22, B24, B26, B85, B87, B94, B104, B107) : niveau 3 par prudence (décision D3, `supabase/functions/_shared/assistant-actions-core.ts:507`) ou niveau 2 ?
2. **« Droits d'accès »** : cités dans le tableau du §3 (`docs/ia-vision.md:35`) mais absents de la liste validée (`docs/ia-vision.md:37`) ; mis en niveau 3 : changer un rôle (B31), archiver ou réactiver un salarié (B34, B92), support BEMEXO (B63), déconnecter la tablette (B124).
3. **Messages déjà partis** (invitation B29, B30, rappel B41, réponse à un congé B42) : niveau 2 sans « Annuler » possible, ou niveau 3 ?
4. **Paie** : infos de paie (B90) et bulletin (B136) en niveau 3 ; `cout_reel` envoie pourtant un bulletin au modèle alors que le §4 dit « aucune donnée de paie sensible envoyée au modèle » (`docs/ia-vision.md:44`) ; l'adresse du comptable (B122) doit rester en niveau 3 dans un outil `modifier_reglages` qui passe sinon en niveau 2.
5. **Par analogie, niveau 3 par doute** : rouvrir un mois, clôturer et rouvrir les heures d'un salarié (B80–B82), renvoyer une journée (B83), notifier une réunion (B110), récap et alertes par e-mail (B96, B121).
6. **« Corriger un pointage »** est cité au niveau 2 (`docs/ia-vision.md:34`) alors que le code le traite en carte, sans « Annuler » (B40, B84).

## 4. Écarts relevés dans le code

- **Le test de couverture annoncé (`ia-vision.md` §7.2, « lib/*-writes.ts ») est trop étroit** : deux fichiers seulement portent ce nom (`admin-writes.ts`, `planning-writes.ts`). 24 écritures ou appels de fonctions serveur directs vivent dans 9 composants du bureau (ex. rouvrir un mois `components/admin-planning.tsx:1725`, supprimer un client `components/admin-planning.tsx:3012`, infos de paie `components/worker-detail.tsx:725`, endroit au pointage `components/company-settings.tsx:337`) et 22 autres fichiers de `lib/` écrivent aussi (`missions.ts`, `trainings.ts`, `worker-closure.ts`, `reserve-lift.ts`…). À vérifier : ces totaux comptent aussi des fichiers côté salarié.
- **Deux fiches d'aide fausses** : « telecharger » (imprimer) et « archiver_client » (chantier terminé). Deux fiches sans visite guidée : « position », « sortie_oubliee ».
- **Trois outils sans équivalent d'écran** : `planning_semaine`, `modifier_habilitation`, `modifier_depense` (et le renommage de `modifier_document`) : le registre, bâti sur l'interface, ne les verrait pas.
- **Deux chemins pour lever une réserve** : `lib/admin-writes.ts:201` (assistant) et `lib/reserve-lift.ts:41` (écran, avec photo) : à unifier avant de générer l'outil.
- **Disponibilité** : dix familles de fonctions sont masquées « si dispo » (tâches, réunions, formations, versions, traces, e-mails, borne, panier, chantier terminé, assistant) et le mode support est en lecture seule (B71) : le registre doit porter une condition par action.
- **Cahier** : B68 est périmé (« Nouveau chat » et « Historique » sont en ligne) ; B5 a pour libellé « sans » au lieu de « sans réserve » (repris tel quel).

## 5. Contrôles faits

JSON valide (`node -e`), 138 entrées, mêmes dix champs partout ; les 72 libellés du cahier sont identiques mot pour mot. Chaque `actions_existantes` est vérifié contre `ASSISTANT_FUNCTIONS` (34 outils), `NAV_ACTIONS` (11 cibles, plus le lien « salarie ») et `GUIDE` (50 fiches, 48 visites guidées). Chaque `verifie_dans` est résolu par recherche de texte dans le dépôt (aucun numéro de ligne tapé à la main), puis relu par un second script. **À vérifier** : rien n'a été exécuté dans un navigateur ni sur le vrai modèle ; les comportements décrits viennent de la lecture du code, et les règles d'écran que je n'ai pas relues dans le code (options « si dispo », libellés du cahier) restent celles du cahier.
