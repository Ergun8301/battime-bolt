# 01 · Architecture actuelle de l'assistant BEMEXO

État du dépôt : commit b86a84c (15 octobre 2026). Constat en lecture seule pour préparer l'étape 3 (`docs/ia-vision.md` §9 : registre d'actions, test de couverture, boucle d'outils).
Méthode : lecture des fichiers de la mission ; les comptes (outils, fiches, ancres, cas d'évaluation, tailles de consigne) viennent de l'import des modules TypeScript avec Node et de `grep`. « à vérifier » = non prouvé par le dépôt.
Sigles : `AC` = supabase/functions/_shared/assistant-actions-core.ts · `WC` = .../_shared/worker-assistant-core.ts · `IB` = supabase/functions/assistant/index.ts · `IS` = supabase/functions/worker-assistant/index.ts · `AP` = lib/assistant-actions.ts · `WA` = lib/worker-actions.ts · `PROV` = .../_shared/ai-provider.ts · `ANT` = .../_shared/ai-anthropic.ts · `AD` = components/admin-planning.tsx.

## 0. À retenir

1. **Pas de boucle.** `callFunction` (PROV:384-416) envoie UN message `user` et lit UNE réponse ; aucun adaptateur ne sait rejouer un tour avec un résultat d'outil (PROV:390 ; ANT:178-196). Le salarié « long » accepte jusqu'à 4 appels PARALLÈLES dans la même réponse (PROV:106, 359-379), pas en séquence.
2. **Le modèle ne lit rien à la demande et n'écrit jamais.** Il reçoit un instantané figé dans le prompt (§3) et choisit une fonction ; le serveur la contrôle (`prepare` + `checkAction`) ; c'est l'écran, dans le navigateur, avec la session de la personne, qui exécute, annule et journalise (IB:31-33).
3. **33 outils bureau + 18 outils salarié**, plus `repondre` de chaque côté (34 et 19 déclarations envoyées au modèle) ; `planning_collegues` est le seul outil de lecture. Chaque outil est défini à au moins 8 endroits qui ne se synchronisent que par des tests (§4).
4. **Niveau de fait** : 5 outils bureau « directs » (fait + Annuler) ; les 28 autres passent par une carte « Confirmer » (AC:527-537). Côté salarié, la plupart sont directs, 8 sont à confirmer (WC:624-631). Aucun outil pour : export, envoi au comptable, e-mails groupés, abonnement, imports, borne, formations, missions/réunions, statistiques, impression.
5. **Navigation** : 11 `NAV_ACTIONS` bureau (AC:37-50), 9 `WORKER_NAV` salarié (WC:438-449), 48 + 23 guides pas à pas, sur 82 + 44 ancres `data-guide`. Aucun registre des fenêtres : une chaîne `if/else` écrite à la main (AD:4371-4398).
6. **Évaluation** : `cases.ts` compte **126 cas**, pas 121 (47 b + 33 s + 17 sl + 14 st + 15 sc ; verrou `eval.test.ts:447`). 5 outils bureau n'ont aucun cas ; aucun cas turc côté bureau ; le banc bureau passe l'instantané `{}` (les questions chiffrées ne sont pas mesurées).
7. **Le bureau ne parle pas turc** : la consigne du bureau est française (AC:1803-1835), cartes et libellés aussi.
8. **Des tests figent du texte** : SHA-256 du guide du prompt (admin-tours.test.ts:410-416), lecture du source de `index.ts` (ai-config.test.ts:437-451), parsing de `docs/ia-v2.md` (ai-config.test.ts:486-500). Toute refonte doit les faire évoluer exprès.

## 1. Le flux d'une demande, du clic à l'écran

### 1.1 Bureau (administrateur, entreprise avec `companies.ai_enabled`)

1. **Entrée.** `aiOn = useAiEnabled(company_id)` (AD:1055). Le bouton étoile (`data-guide="bureau-nav.assistant"`, barre AD:3572, menu mobile AD:3862) ouvre `AssistantBureau`, chargé à la demande (AD:143) et monté seulement si `aiOn && role==='admin'` (AD:4366). Il enveloppe `components/assistant-panel.tsx` avec `supabaseAssistantSource`, `supabaseChatStore` et une `AssistantActionCard` comme `renderExtra` (components/assistant-bureau.tsx:22-42).
2. **Saisie** : texte 500 caractères (`MAX_QUESTION_CHARS`, assistant-core.ts:125), dictée fr-FR, pièce jointe (trombone, photo/PDF compressé, 8 Mo).
3. **`ask()`** (assistant-panel.tsx:320-360) : `history` = 7 derniers messages TEXTE, 600 car. (lib/assistant-chats.ts:53-56) ; si une question est en attente, la réponse est recollée « demande, réponse » (panel:335-337) ; appel `source.ask(full, fichier, history)`.
4. **Réseau** : `supabase.functions.invoke('assistant', { question, file?, history? })`, délai 60 s avec `AbortController` (lib/assistant.ts:56-95).
5. **Edge `assistant`** (IB:77-216) : JWT obligatoire (81-82) → `statut:true` rend la formule sans quota (85) → pièce jointe lue (`readAttachment`, PROV:457-466) → client Supabase **anon + jeton de la personne** (93-96) → `assistant_context('bureau')` (101) : rôle admin, `is_active`, `ai_enabled`, **quota consommé** (migration 20261012090000:139-234) ; refus 401/403/quota/pause (102-111).
6. **Lectures** : 17 requêtes parallèles sous RLS (119-142) ; `buildSnapshot` (assistant-core.ts:55-114) = ce que voit le modèle ; `buildActionContext` (AC:608-651) = tables de résolution nom → identifiant, qui restent côté serveur.
7. **Sans IA** si un lecteur local répond (IB:175-176, §1.3). Sinon, sans clé : guide ou « indisponible » (IB:179-184).
8. **IA** (IB:189-192) : `actionPrompt` (AC:1802-1836) + `functionsFor(hasFile, question, historique)` (AC:1658-1660) → `callFunction` : niveau « rapide » (« documents » si fichier). Réglage documenté pour la production : Claude `claude-sonnet-5-5`, effort `low`, 9 s puis 14 s au total (ia-v2.md:139-148 ; PROV:101-104), secours Gemini seulement après erreur/délai (PROV:316-349). Le secret `AI_CONFIG` n'est pas dans le dépôt ; sans lui le code retombe sur Gemini (PROV:69-73, 178-189) : réglage réel à vérifier.
9. **Après le modèle** : pour `corriger_pointage`, relecture des lignes envoyées du jour (IB:196-208) ; `fromFunctionCall` (AC:1724-1767) → `prepare` (1006-1287) → `checkAction` (808-1003) ; `avertirSecours` (bulletin) ; `reply()` (IB:65-75) ajoute `summary`, `question` (`questionFor`, AC:546-580) et `options` (salariés, chantiers).
10. **Écran** : `toReply` (lib/assistant.ts:45-49) → bulle + boutons de `links` + `renderExtra`. `go(action)` (panel:449-454) : `ask:` repose la question, sinon `onNavigate` (AD:4371-4398) et repli du panneau sous 640 px.
11. **Carte** (assistant-action-card.tsx:194-300) : phases `auto | question | form | done`. Mode direct sans problème → `auto` : l'écriture part au montage (« Je le fais… », une seule fois, `launched`, 295-300). Info manquante → `question` (puces). Sinon `form` : l'utilisateur corrige puis « Confirmer ». Suppressions (`isRemoval`) : toujours `form`, avec aperçu `makeRemovalPreview` (AP:530-540) ; `done` → `ActionDone` (« Fait » + Annuler + Modifier, action-done.tsx).
12. **Exécution** : `makeActionExecutor` (AP:115-523) dans `withOrigin('assistant')` (lib/supabase.ts:27-39), puis `assistant_journal_log` (AP:97-100, 508). `undo` rejoue le contraire et journalise `undone=true` (AP:510-519). `ctl.working/waiting` verrouillent « Nouveau chat » pendant l'écriture (panel:36-54).
13. **Enregistrement du chat** : `chats.append(chatId, texte tapé, réponse, liens)` après un tour complet (panel:104-124, 359) : texte seul, jamais la carte.

### 1.2 Salarié (rôles `worker` et `lead`)

Mêmes étapes 1-4 et 10-13, avec : bouton étoile de la barre du bas (`journee.assistant`), `WorkerAssistant` monté si `aiOn || demo` (app/poseur/page.tsx:653-670) ; limite de saisie **1 500** (`WORKER_TEXT_MAX`, saisie-profil.ts:13) ; corps `{ text, file?, multi:true, history? }` (lib/worker-assistant.ts:67-87). Côté serveur (IS:65-174) : quota `assistant_context('salarie')` (88) ; 8 lectures SUR SES DONNÉES (102-112) ; `buildWorkerSnapshot` (WC:405-425) + `live` (IS:128-140) ; puis **un seul tour partagé avec le banc** `runWorkerTurn` (worker-turn.ts:50-73) :
- profil **court** (défaut ; avec fichier ou sans `multi:true` toujours court) : lecteur local d'abord (`handleWorkerLocally`, WC:944-1027), sinon UNE fonction (`workerFunctionPrompt`, WC:1136-1159 ; outils par domaine `workerFunctionsFor`, WC:1106-1108) ;
- profil **long** (≥120 car., turc, plusieurs familles d'actions, 3 plages… ; `profilSaisie`, saisie-profil.ts:154) : jamais le lecteur local, réflexion `medium`, 14 s/22 s (Gemini) ou 18 s/28 s (Claude), jusqu'à 4 appels (`maxCalls:4`) rassemblés par `buildLongReply` (worker-multi.ts:671-832) en UNE fiche `multi` ; rien n'est écrit avant « Tout confirmer » (`runMulti`, worker-multi-run.ts:122-279 ; undo composite 296-317).
Réponses : `draft` (heures → `WorkerDraftCard`, enregistrées tout de suite si complètes, worker-draft-card.tsx:90), `action` (`WorkerActionCard`, worker-action-card.tsx:190-194), `multi`, `guide`, `answer`, `collegues` (le serveur lit la RPC `colleagues_planning` et formate la réponse, IS:144-150 : **le modèle ne revoit jamais ce résultat**).

### 1.3 Chemins sans IA (rapides, mais le quota est déjà pris : IB:101 avant IB:175 ; IS:88 avant IS:156)

| Côté | Déclencheur | Code | Résultat |
|---|---|---|---|
| Les deux | relance courte avec marque de renvoi + historique | assistant-history.ts:241-243 | saute les lecteurs, va au modèle |
| Bureau | effacer/vider heures, pointage, export, paie, mois clôturé | AC:1693-1696 | refus en une phrase (`REFUS_EFFACEMENT`, 1686) |
| Bureau | « efface le planning de la semaine prochaine » | AC:1697-1700 | carte `effacer_planning` |
| Bureau | « fais le planning de la semaine prochaine » | AC:1702-1705 | `proposeWeek` (AC:1302-1356) |
| Bureau | « ajoute un salarié » (sans chiffre ni @) / « pose un congé » (sans chiffre) | AC:1706-1715 | formulaire VIDE à remplir (seul « pré-remplissage » existant) |
| Bureau | « mets X en repos » | AC:1710-1712 | refus (`REFUS_REPOS`) |
| Bureau | « comment / où / aide / explique… » + fiche trouvée | AC:1716-1719, `findGuide` 346-359 | guide en 3 étapes + `guideLinks` |
| Salarié | « où sont mes collègues », « où est Paul » | WC:953-955, 1127-1134 | RPC serveur |
| Salarié | effacer/annuler heures, congé, réserve, photo ; pointage | WC:956-969 | carte de confirmation ; pointage : `NO_CANCEL_ANSWER` |
| Salarié | envoyer ma journée, panier, copier hier, lever la réserve, j'ai fini, congé, signaler une réserve | WC:970-1015 | carte ou geste direct |
| Salarié | « je commence » | WC:999-1002 | `QR_START_ANSWER` (le téléphone ne démarre plus de pointage, WC:781) |
| Salarié | « comment… » | WC:1016-1019 | guide + `workerGuideLinks` |
| Salarié | plage horaire / question simple (« combien d'heures ») | WC:236-308, 1021 | brouillon d'heures / texte |
| Les deux | pas de clé IA | IB:179-184 ; IS:160-168 | guide / « Je n'ai pas compris… » |

Démo : `?demo=assistant|salarie` sur un hôte de preview seulement (lib/assistant.ts:34-37, 147-227 ; lib/worker-assistant.ts:119-158) : l'IA est simulée, `prepare`/`check` sont les vrais.

### 1.4 Refus, pannes et ce que l'écran en fait

- **Refus** (IB:104-111 ; IS:90-97) : 401 « Non authentifié », 403 « Réservé au bureau » / « Réservé aux salariés » / « Assistant non activé » ; quota atteint ou pause du projet : réponse 200 avec `quota:true` (bureau) ou `notice:true` (salarié) et un texte (« Limite de N demandes par jour atteinte… ») — jamais enregistrée dans le chat ni envoyée comme contexte (`notice` → `lost`, panel:355 ; lib/assistant-chats.ts:53-56).
- **IA en panne** : `unavailable:true` « L'assistant n'a pas pu répondre. Réessayez dans un instant. » (IB:192) ; côté salarié la phrase revient dans le champ (`restoreOnFailure`, panel:351). Le quota est déjà débité (ia-v2.md:383).
- **Délai** : au bout de 60 s le client abandonne (`ASK_TIMEOUT_MESSAGE`, lib/assistant.ts:56-57, 81) ; le serveur peut finir, le quota est pris, la carte n'apparaît pas.
- **Erreur interne** : `console.error` à message fixe puis 500 « Erreur serveur » (IB:212-215 ; IS:170-173).
- **Compteur** : `remaining` revient dans chaque réponse (« N questions restantes aujourd'hui », panel:575).

## 2. Inventaire des outils et des actions existants

Légende. **D** = direct : fait au montage, puis « Fait » + Annuler + Modifier (AC:527-537 ; WC:624-631). **C** = carte, écriture au clic « Confirmer ». **N1** = lecture/réponse/guide, aucune écriture. « Vision » = niveau demandé par `docs/ia-vision.md` §3 quand il diffère. Annulation : **oui** = `undo` fourni ; **non** = rien à annuler depuis l'assistant. Carte bureau : une seule, `components/assistant-action-card.tsx` (gabarit par type, libellés 170-177). Garde-fous : `checkAction` (AC:808-1003) / `checkWorkerAction` (WC:663-749) + `prepare` ; aucun outil ne reçoit d'identifiant du modèle : noms → ids de SON entreprise (`resolve`, AC:773-787), n° de sécu effacé (`scrubNir`, AC:727).

### 2.1 Bureau : 33 outils + `repondre`

| Outil | Mode | Exécuteur AP | Annulation | Garde-fous principaux | Éval / tests |
|---|---|---|---|---|---|
| `repondre` | N1 | — | — | liens ≤3 parmi NAV + `salarie:id` (AC:1736-1745) ; « je n'ai pas accès » réécrit en guide (1730) | b29-b33 b43 sc04 sc07 |
| `inviter_salarie` | C | 129-146 | non | e-mail valide, taux/heures bornés (814-821) ; bulletin relu par `sanitizeExtraction` (AP:88-92) | b25 · test AC |
| `creer_chantier` | D (C si heures/devis) | 147-171 | oui : supprime, sinon archive (165-169) | doublon de nom (825) ; le montant du devis n'est jamais un budget (AC:447-452) | b12 b13 · test AC, RLS lot3bis |
| `ranger_document` | D | 172-181 | oui | fichier joint exigé ; chantier connu (828) | b17 b18 · test AC |
| `poser_absence` | D | 182-187 | oui (`undoAbsence`) | congé/maladie/intempérie seulement (« repos » refusé), ≤90 j, ≥ −31 j (831-838) | b08 b09 sc05 |
| `affecter_planning` | D | 188-196 | oui, partielle si des heures sont notées (107-112, 194) | client NOMMÉ (AC:1055-1066), −31/+366 j, ≤31 jours, refus si absent (839-848) | b01-b05 sc01 sc02 sc06 sc13 |
| `planning_semaine` | C | 197-218 | oui, partielle ; versions du planning avant/après | semaine ≥ lundi courant (1079-1083) ; jours déjà planifiés intouchés | b07 |
| `corriger_pointage` | C | 219-238 | **non** (tracé avant/après en base, salarié prévenu) | motif ≥3 car. (`reasonOk`), `precheck`, même voie que la fiche (`office_correct_entry`) | **aucun cas** · test AC, heures-sures.mjs |
| `modifier_intervention` | D | 240-297 | oui (état d'avant + `prepareMove`) | une case avec heures ne bouge pas (lib/erase) | b06 |
| `repondre_conge` | C | 298-304 | non | demande encore en attente (874-878) ; le salarié est prévenu | b10 b11 |
| `lever_reserve` | C | 305-308 | non | réserve ouverte (879-882) | b28 |
| `ajouter_depense` | C | 309-312 | non | montant ≠ 0, catégorie connue (883-888) | b16 |
| `modifier_client` | C | 313-321 | non | seuls les champs remplis changent (889-895) | b14 |
| `archiver_client` | C | 322-325 | non | jamais supprimer (prompt 1818) | b15 |
| `changer_role` | C (vision N3 : droits) | 326-329 | non | rôle ∈ worker/lead/admin (899-902) | b20 |
| `relancer_invitation` | C (e-mail) | 330-336 | non | invitation en attente (903-906) | b21 |
| `envoyer_rappel` | C (push) | 337-344 | non | échoue si notifications coupées (340-343) | b22 |
| `cloturer_mois` | C (vision N3) | 345-348 | non | mois ≤ courant, pas déjà clos (911-915) | b26 |
| `attribuer_client` | C | 349-356 | non | salarié + chantier + date (916-920) | **aucun cas** |
| `ajouter_habilitation` | C | 357-360 | non | type connu, date d'expiration (921-926) | b23 |
| `modifier_salarie` | C | 361-367 | non | prénom/nom/téléphone seulement (jamais n° de sécu) | **aucun cas** |
| `archiver_salarie` | C | 368-371 | non | — | b24 |
| `cout_reel` | C | 372-379 | non | chiffres du bulletin revérifiés (AP:373-376) ; secours = « à vérifier » (AC:1787-1792) | **aucun cas** (fichier) |
| `modifier_reglages` | C | 482-503 | non | bornes numériques, e-mails (990-1000) | b27 |
| `supprimer_intervention` | C + aperçu | 381-407 | oui (`undoErase`) | mois clôturé refusé (947) ; versions du planning | b34 b44 b46 b47 |
| `effacer_planning` | C + aperçu | 381-407 | oui | ≤62 jours (955) ; `ids` posés par l'écran, jamais par le modèle | b35 b36 |
| `supprimer_absence` | C + aperçu | 381-407 | oui | idem | b37 |
| `supprimer_document` | C | 408-428 | oui (fichier gardé en mémoire puis re-téléversé) | choix parmi ≤8 | b38 |
| `modifier_document` | C | 429-439 | oui | catégorie connue | b45 |
| `supprimer_depense` / `modifier_depense` | C | 440-455 | oui / oui | montant >0 | b39 / b40 |
| `supprimer_habilitation` / `modifier_habilitation` | C | 456-472 | oui / oui | date ISO | b41 / **aucun cas** |
| `annuler_invitation` | C | 473-481 | oui (= renvoyer l'invitation) | invitation en attente | b42 |

Avec un fichier joint, le modèle ne voit que 6 outils : `repondre ranger_document creer_chantier ajouter_depense inviter_salarie cout_reel` (AC:1650-1651), pour limiter l'effet d'un PDF piégé.

### 2.2 Salarié : `repondre` + 18 outils (19 déclarations, `WORKER_FUNCTIONS`, WC:1051-1093)

| Outil | Mode | Exécuteur WA | Annulation | Garde-fous principaux | Éval / tests |
|---|---|---|---|---|---|
| `repondre` | N1 | — | — | lien ∈ `WORKER_NAV` ; guide de la fiche trouvée (WC:1162-1174) | s05 s21 s22 s25 s28 st05 sc12 |
| `declarer_heures` | D (court) · fiche « Tout confirmer » (long) | lib/worker-assistant.ts:172-239 (`makeWorkerSaver`) | oui, seulement les lignes restées telles quelles (207-235) | `checkDraft` (WC:192-216) : HH:MM, ≤14 h, pause <durée, pas de chevauchement, date ≥ −31 j et ≤ demain ; chantier jamais inventé (`resolveWorksite` 119-130, `fillUnsaid` 157-179) | s01-s04 sl01-sl17 st01-st14 sc08 sc09 sc11 sc15 |
| `demander_conge` | D | 74-87 | oui (supprime la demande en attente) | 3 types, fin ≥ début (666-670) | s08 s09 sl08 st03 |
| `terminer_pointage` | D (C en profil long) | 109-184 | oui (relance le chrono d'abord, puis retire la ligne) | fin > début, nuit à cheval (116-125) | s06 s07 |
| `signaler_reserve` | D | 185-198 | oui | chantier non verrouillé | s15 sl07 sl09 st04 sc14 |
| `ranger_photo` | D | 199-225 | oui | une facture est réservée au bureau (205) ; seul outil avec `repondre` quand un fichier est joint (WC:1100-1101) | s16 s17 |
| `envoyer_journee` | C (vision N3) | 227-238 | **non** | seules SES lignes non envoyées ; le « prévu » du bureau ne part jamais (WC:568-572, 826) ; règle des 6 h (`sendWorkerDay`) | s10 sl11 st03 |
| `modifier_heures` | D (C si ligne envoyée) | 239-249 | oui | horaires cohérents (690-695) | s13 |
| `panier_repas` | D | 250-260 | oui | refus si l'entreprise n'a pas le panier (252) | s11 sl03 sl07 st03 st08 |
| `copier_journee` | D | 261-293 | oui (copies retouchées/envoyées gardées) | jour cible −31..+1 (699-703) | s12 |
| `reserve_corrigee` | D | 294-306 | oui | réserve ouverte | s14 |
| `nouveau_chantier` | C | 307-313 | **non** (le salarié ne peut pas le supprimer) | doublon nom+ville (707-710) | s24 |
| `email_client` | C | 434-439 | non | e-mail valide | s23 · aucun test unitaire |
| `effacer_heures` | C + aperçu (WA:471-484) | 315-342 | oui (réinsère) | brouillons non envoyés, non verrouillés ; `ids` posés par l'écran | s26 s27 s33 |
| `annuler_conge` / `modifier_conge` | C | 343-385 | oui / oui (nouvelle demande d'abord) | demande « pending » | s29 / s30 |
| `retirer_photo` | C | 401-419 | oui | documents SIENS (≤20, 14 derniers jours, IS:111) | s32 · aucun test unitaire |
| `retirer_reserve` | C | 420-433 | oui | journée non envoyée | s31 |
| `planning_collegues` | N1 (lecture) | RPC serveur IS:144-150 | — | prénom + chantier + horaires seulement ; réglage de l'entreprise | s18-s20 sc10 |

Désactivés (lot 12) : `commencer_pointage` et `annuler_pointage` existent encore dans l'union et l'exécuteur (WA:88-108, 386-400) mais `prepareWorkerAction` rend `null` (WC:781-784) et `fromWorkerCall` répond par texte (WC:1183-1184).

### 2.3 Navigation (« M'y emmener »)

- **Bureau** (`NAV_ACTIONS`, AC:37-50 → `onNavigate`, AD:4371-4398) : `salaries`→`setSalariesOpen` · `nouveau_salarie`→`setWorkerOpen` · `nouveau_client`→`setClientOpen` · `import_clients`→`setImportOpen` · `conges`→`setLeaveOpen` · `couts`→`setCostOpen` · `reserves`→`setReservesOpen` · `export`→`setExportOpen` · `reglages`→`setSettingsOpen` · `planning`→ferme le panneau · `clients`→liste des chantiers (mobile/ordinateur). Formes hors enum : `salarie:<id>` (feuille d'heures), `guide:<id>` (48 ids), lien « Versions de la semaine » porté par la carte (`onOpenVersions`, AD:4400-4406).
- **Salarié** (`WORKER_NAV`, WC:438-449 → app/poseur/page.tsx:657-669) : `journee semaine mois historique conges notifications photo borne infos`. `notifications` BASCULE les notifications (`togglePush`), `photo` ouvre le sélecteur de fichier, `borne` ouvre la caméra. Formes hors enum : `guide:<id>` (23 ids) et `ask:<question>` (posée dans le chat, panel:451 ; 2 fiches l'utilisent).
- Le modèle ne choisit que les clés de l'enum (`repondre.liens`, AC:1424) ; jamais `guide:` (testé, admin-tours.test.ts:429) : le bouton « Me guider pas à pas » est fabriqué par `guideLinks` (AC:1676-1679).

### 2.4 Guides et ancres `data-guide`

- **Fiches de guide** : `GUIDE` bureau = **50** (AC:63-339 ; 3 étapes au plus, un `lien: NavAction` chacune) ; `WORKER_GUIDE` = **25** (WC:469-524). `docs/ia-v2.md` dit 45 et 25. Tout le guide bureau part dans chaque prompt (AC:366-369 ; 10 519 car. / 11 200 octets, figés par test).
- **Parcours pas à pas** : `ADMIN_TOURS` = **48** (admin-tours.ts:68-295 : toutes les fiches sauf `position` et `sortie_oubliee`) ; `WORKER_TOURS` = **23** (worker-tours.ts:42-159 : toutes sauf `collegues` et `assistant`). Le guide MONTRE, ne clique jamais (guide-tour.tsx:1-22, test statique admin-tours.test.ts:419-450). Console support : `SUPPORT_TOUR` (admin-tours.ts:343-353), non joignable par l'assistant.
- **Ancres citées par les parcours** (82 bureau, 44 salarié ; 118 valeurs littérales `data-guide="…"` dans app/ + components/, plus 8 expressions conditionnelles) :
  - Bureau, barre et menu : `bureau-nav.` abonner assistant borne clients compte couts exporter reglages reserves salaries selection versions (+ `menu`, hors parcours) · `bureau-semaine.nav`.
  - Bureau, planning : `bureau-planning.` ajouter ajouter-valider attribuer autre bulle case nom · `bureau-edit.` documents enregistrer horaire supprimer · `bureau-statut.` absences feuille present · `bureau-absence.enregistrer` · `bureau-selection.` supprimer tout · `bureau-versions.` liste voir · `bureau-stat.` liste relance.
  - Bureau, personnes : `bureau-salaries.` conges envoyer importer liste nom nouveau · `bureau-fiche.` archiver cloturer corriger corriger-valider cout-bulletin enregistrer exporter habilitations · `bureau-invit.` liste voir · `bureau-conges.liste`.
  - Bureau, clients et coûts : `bureau-clients.` archiver budget crayon creer enregistrer importer nouveau supprimer · `bureau-cout.` depense periodes · `bureau-reserves.` a-traiter liste · `bureau-docs.email` · `bureau-export.` comptable menu mois un-salarie.
  - Bureau, réglages et borne : `bureau-reglages.` abonnement caisse collegues enregistrer recap rub-borne rub-heures rub-notif support · `bureau-borne.` code deconnecter.
  - Partagées bureau/salarié : `docs.envoyer` `docs.photo` `reserves.valider`.
  - Salarié (44) : `menu.` compte conges historique infos notifications photo semaine · `journee.` chantier copier envoyer panier plus sortie-oubliee terminer trou · `editeur.` ajouter-chantier autre chantier documents horaires note ok reserve retirer · `equipe.` ajouter corriger jour ok salarie · `conges.` annuler envoyer faire type · `reserves.` bandeau lever valider · `docs.` envoyer photo · `confirmer.retirer` `copier.valider` `entete.scanner` `historique.jour` `infos.fermer` `semaine.jour`.
- Tests de cohérence existants (précédent du futur test de couverture) : chaque cible existe dans le code, chaque libellé « » cité existe dans l'interface (assistant-aide.test.ts:27 ; admin-tours.test.ts:220-290 ; worker-tours.test.ts), plancher « ≥45 fiches bureau, ≥25 salarié » (assistant-aide.test.ts:41-44).

### 2.5 Tests et évaluation, en un coup d'œil

- Tests de la couche : assistant-actions (26), worker-assistant (17), worker-multi (67), worker-multi-run (22), worker-turn (10), assistant-history (32), ai-provider (12), ai-anthropic (29), ai-config (25), tool-domains (5), saisie-profil (11), admin-tours (25), worker-tours (11), assistant-aide (3), assistant-eval/eval.test (27). SQL : `test:assistant-quota`, `-salarie-rls`, `-actions-rls`, `-journal`, `-chats-rls`. Écran (Playwright) : `test:assistant-historique`, `test:assistant-multi`.
- Banc `assistant-eval` (index.ts, run.ts, config.ts) : 126 cas, 21 catégories (bureau 9 : Interventions 7, Congés 4, Clients 5, Documents 3, Salariés 6, Réglages 3, Aide 5, Effacer 14, Suite 8 ; salarié 12 : Heures 4, Pointage 3, Congés 2, Ma journée 7, Réserves 1, Documents 2, Collègues 3, Aide 3, Effacer 8, Long FR 17, Long TR 14, Suite 7). 16 cas turcs (st01-st14, sc11, sc12), tous côté salarié. `repeat` 1-5 passes, `prodPath` (aucun nouvel essai), `aiConfig` de remplacement validé comme en production ; la réponse dit quel `fournisseur:modèle` a servi chaque cas (secours compris).
- Dernière mesure consignée dans le dépôt : 78/80 sur le vrai modèle (`docs/ia-v2.md:307`) ; aucun score sur les 126 cas n'y est écrit (le chiffre « 35/36 » du suivi de tâches n'est pas dans le dépôt : à vérifier).

### 2.6 Capacités du cahier sans aucun outil (lecture rapide, à vérifier ligne à ligne)

Repères : `docs/design-brief/fonctions-bureau.md` (B1-B72, §9) et `fonctions-salarie.md` (S1-S104, annexe). Obtenu par les intitulés et par la recherche des mots dans les deux cœurs ; la correspondance exacte revient au document de couverture.
- **Bureau, lire** : B1-B14 (semaine, pointage en direct, légende, recherche), B39 feuille d'heures, B50 suppressions, B51 statistiques, B53 pièces jointes, B70 compteurs. Seul l'instantané (§3) répond ; aucune lecture à la demande.
- **Bureau, planning** : B16 glisser un client, B18 réordonner, B19-B20 copier (glisser, « vers d'autres jours », lendemain), B27 tâches et réunions, B48 imprimer, B49 versions (le lien « Versions de la semaine » n'est offert qu'après une action de planning, AP:197-218 et 381-407).
- **Bureau, personnes et clients** : B29 import CSV, B34 réactiver/supprimer un salarié et clôturer/rouvrir SES heures, B36 supprimer un client, B38 terminer/rouvrir un chantier, B40 renvoyer une journée, B41 relance automatique (le réglage seul), B54 rouvrir une réserve, B57 formations.
- **Bureau, sorties, argent, appareils** : B43-B47 export, envoi au comptable, verrou, rouvrir un mois ; B58 envoyer le planning ou un message aux salariés ; B55-B56 borne et QR fixe ; B63 support ; B64 abonnement. B59-B62 : `modifier_reglages` couvre 14 champs (AC:1567-1577), ni logo, ni caisse congés, ni panier, ni borne, ni notifications.
- **Salarié** : S8 cocher une tâche, S31 Route/Pause, S41-S43 questions de pause et de 10 h, S52 export PDF, S53 interventions supprimées, S59 liste des réserves, S62-S64 formations, S66-S67 parcourir et catégoriser ses documents, S68 envoyer au client (seul l'e-mail se mémorise), S69-S71 chef d'équipe (« écran dédié », ia-v2.md:259), S73-S74 photo et notifications (liens seulement), S10-S11 pointer par QR (volontairement).

## 3. Ce que le modèle voit, et ce qu'il ne voit jamais

**Bureau** (`actionPrompt`, AC:1802-1836) voit :
- règles ; CALENDRIER ; GUIDE (50 fiches) ; SALARIÉS = id, nom complet, rôle de tous les actifs (admin compris) ; CHANTIERS = id, nom, ville de tous les chantiers actifs ;
- DONNÉES = `Snapshot` (assistant-core.ts:28-41) : aujourd'hui/hier ; par salarié non admin `{id, "Prénom N.", heures_mois}` ; `pas_pointe_hier` ; `en_cours` (chantier, heure de début) ; `absents_aujourdhui` (motif) ; par chantier `{nom, ville, heures_total, budget_heures, budget_euros, main_oeuvre_euros, avancement_pct, depasse}` ; `conges_en_attente` ;
- bloc CONVERSATION (≤7 messages, 600 car., 3 000 au total, assistant-history.ts:23-25) ; DEMANDE (≤500) ; fichier joint éventuel.

**Taille mesurée** (jeu d'évaluation : 3 salariés, 6 chantiers) : squelette 15 527 car. avec instantané vide, dont GUIDE 10 519 ; l'instantané ajoute ~49 car. par salarié et ~155 par chantier ; outils : 18 474 car. pour les 34 déclarations, 6 179 pour le domaine planning (9). Soit de l'ordre de 4 000 jetons de consigne + 1 500 à 4 600 d'outils (estimation à 4 car./jeton, non mesurée en jetons). **Aucun plafond** sur le nombre de salariés/chantiers listés ; les requêtes sans `.limit()` dépendent du plafond de lignes de PostgREST (à vérifier).

**Salarié** (`workerFunctionPrompt`, WC:1136-1159) voit : GUIDE (25 fiches, 3 584 car.), CALENDRIER, chantiers actifs de l'ENTREPRISE (id, nom, ville), `heures_notees` de la semaine, `prevu_par_le_bureau` (SON planning de −2 à +1 jour), `en_cours`, `lignes_du_jour` (chantier, début, fin), historique. Prompt court 7 778 car., long 11 297 ; outils 6 060 car. pour les 19 déclarations (8 pour « heures », 18 en long). Le profil long ajoute un mémento turc (worker-multi-prompt.ts:40).

**Lu côté serveur mais jamais montré au modèle** : tout `ctx.planning` du bureau (−14/+13 jours), `time_entries` récents (2 000), documents (150), dépenses (150), habilitations (300), réserves (50), invitations, e-mails/téléphones ; côté salarié ses congés en attente, ses documents, les drapeaux panier/réserve des lignes, le nombre de lignes d'hier. Ils ne servent qu'à résoudre des identifiants (`slotsMatching`, `docsMatching`, `expensesMatching`…, AC:653-714). Conséquence : « qui est sur Villa Dupont jeudi ? » ou « liste les dépenses de ce chantier » n'a pas de donnée à lire.

**Jamais envoyé** : taux horaires, bulletins (sauf pièce jointe volontaire, non conservée), n° de sécu (effacé par `scrubNir`, AC:727), coût par salarié, heures pointées des collègues (le planning des collègues passe par une RPC limitée et par un texte fabriqué côté serveur).
**Envoyé, à confirmer au regard de la vision §4** : `main_oeuvre_euros` et `budget_euros` par chantier (assistant-core.ts:105-109, décision du lot 3 : « totaux par chantier seulement »). Les noms de clients (parfois des particuliers) et de salariés partent chez Anthropic, puis chez Google en secours.

## 4. Les coutures pour un registre

Aujourd'hui un outil bureau se décrit ici, sans structure commune ; seuls des tests les gardent alignés :
(a) `ACTION_TYPES` (AC:371-380) + union `ActionDraft` (435-502) ; (b) déclaration du modèle `ASSISTANT_FUNCTIONS` (1416-1641) ; (c) `prepare` (1006-1287) ; (d) `checkAction` (808-1003) ; (e) `summarize` (1359-1412, sans `default` : TypeScript force l'oubli) et `questionFor` (546-580) ; (f) `REMOVAL_TYPES` (511) et `actionMode` (527) ; (g) `ATTACHMENT_ACTIONS` (1650) ; (h) domaines (tool-domains.ts:26-51) ; (i) exécuteur navigateur (AP:128-504) et libellés de carte ; (j) règles de prompt (AC:1805-1823) ; (k) cas d'évaluation. Côté salarié, même découpage (WC:574-603, 612-631, 663-749, 783-916, 1051-1101 ; WA:48-55, 73-444 ; cards).

Sources de vérité candidates, dans l'ordre où elles coûtent le moins :
1. **Déclaration d'outil** : `ASSISTANT_FUNCTIONS` / `WORKER_FUNCTIONS` sont déjà des listes `{name, description, parameters}` convertibles Gemini/Claude (ANT:77-155 : `versSchemaClaude`, `outilsClaude`). Un registre qui les produit remplace (b) sans toucher au fournisseur. Les listes dérivées (a, f, g, h) sont des tableaux de noms facilement générés ; `tool-domains.test.ts:36-46` vérifie déjà « tout outil a un domaine » et « aucun nom inconnu ».
2. **Contrat de chaque outil** `{prepare, check, summarize, question, mode, removal, attachment, undo?, journalName}` : les fonctions `prepare`/`checkAction`/`summarize` sont des `switch` sur le même discriminant `type` — découpables par cas sans changer leur comportement.
3. **Exécuteur** : `exec` (AP) et `exec` (WA) sont des `switch` sur le même `type` et rendent le même `ActionResult {ok, message, undo?, partial?}` (AP:58-66 ; WA:27-33) ; chaque cas appelle un module `lib/*-writes.ts`. Un registre `execute[type]` est un déplacement de code, mais exige un `default` qui échoue (§6).
4. **Navigation** : `NAV_ACTIONS` ↔ `GUIDE[].lien` (typé `NavAction`) ↔ enum `repondre.liens` ↔ `onNavigate` (AD:4371-4398) ↔ `ADMIN_SCREENS`/`tourStep` (admin-tours.ts:25-28 ; AD:3242). Une table `{action → ouvrir()}` côté écran, dont les clés alimentent aussi l'enum du modèle, supprime la chaîne `if/else`. Pour « pré-remplir une fenêtre » il n'existe aucun mécanisme : seuls les formulaires de CARTE se pré-remplissent.
5. **Guides** : `GUIDE`/`WORKER_GUIDE` ↔ `ADMIN_TOURS`/`WORKER_TOURS` sont déjà reliés 1 pour 1 par `id` et par ancres `data-guide` vérifiées dans le source : c'est le modèle à suivre pour le test de couverture (balayer le code, échouer si une entrée n'est déclarée nulle part).
6. **Lectures** : le bloc de 17 (bureau) / 8 (salarié) requêtes est écrit en ligne dans les `index.ts` (IB:119-142 ; IS:102-112), avec un filtre de défense `company_id` par constructeur (assistant-core.ts:56 ; AC:623). Chaque requête peut devenir un outil de lecture exécuté avec le MÊME client `db` (jeton de la personne), à condition de garder ce filtre.
7. **Surface à couvrir par le test** : `lib/planning-writes.ts` (9 exports), `lib/admin-writes.ts` (23, lectures comprises), mais aussi `erase.ts`, `corrections.ts`, `office-edits.ts`, `chantier-docs.ts`, `leave.ts`, `worker-day.ts`, `worker-entry.ts`, `live-session.ts`, `real-cost.ts`, `worker-worksite.ts`, `planning-versions.ts`, `missions.ts`, `trainings.ts`. **Onze fichiers d'interface écrivent aussi en direct** (`.insert/.update/.delete/.upsert`) : admin-planning.tsx (6), poseur-day.tsx (6), worker-detail.tsx (5), team-day.tsx (2), chantier-documents, cost-report, import-dialog, leave-request-dialog, pending-invitations, planning-copier, app/borne/page.tsx (1 chacun). L'interface appelle 49 RPC distinctes et 10 fonctions Edge (send-push, invite-worker, send-payroll-export, send-staff-email, stripe-checkout, stripe-portal, kiosk, weekly-digest, cert-expiry-alerts, payslip-read). Un test limité à `lib/*-writes.ts` en manquerait une partie.

## 5. Contraintes fortes à ne pas casser

- **Droits du jeton.** Lectures par un client `anon` + `Authorization: Bearer <jeton>` (IB:93-96 ; IS:81-84). Aucune clé de service dans `assistant`/`worker-assistant`/`payslip-read` : testé (ai-config.test.ts:437-451 : un seul `createClient`, `loadAssistantContext(db,'bureau'|'salarie')` présent, `statut` traité avant le quota et avant `callFunction`, corps exact `body.statut === true) return json({ formule: FORMULE })`). Les écritures utilisent la session du navigateur ; la RLS fait foi.
- **Quota.** `assistant_context` est appelé UNE fois par demande, avant tout travail, et consomme de façon atomique (migration lot6:139-234) : bureau par ENTREPRISE et par jour (`ASSISTANT_DAILY_LIMIT`, 50 ; plafond SQL 200), salarié par PERSONNE (`WORKER_ASSISTANT_DAILY_LIMIT`, 20 ; plafond SQL 50), plafond de projet par niveau (`plafonds`, jour du Pacifique ; aucun en formule « payant » sans réglage explicite). Un refus ne compte pas ; une demande locale compte. Le palier (`rapide`/`documents`) est fixé par la présence d'un fichier (`tierFor`, PROV:207). Une demande à 4 appels reste une unité (ia-v2.md:178).
- **Journal.** `assistant_journal_log` (migration 20261001090000:36-52) est appelé par le NAVIGATEUR après l'écriture : réservé aux entreprises `ai_enabled`, `action ~ '^[a-z_]{3,40}$'` (**les noms d'outils générés ne doivent contenir ni chiffre ni majuscule**), résumé 1-400 car. (WA tronque à 380), lisible par le bureau (tout) ou l'auteur. Un échec du journal ne bloque pas l'action et se lit dans le message (AP:509). Aucune question ni réponse n'y entre.
- **Annuler.** `undo` est une fermeture JavaScript en mémoire (card-memory.ts:1-9) : elle disparaît au rechargement, n'est jamais enregistrée dans le chat (texte seul, vision §6) et ne survit pas à une conversation rouverte. Annulation partielle possible (`partial`) : « Modifier » ne refait alors rien. Chaque `undo` écrit un journal `undone=true`. Origine des écritures : en-tête `x-bemexo-origine: assistant` posé par une variable de module du NAVIGATEUR (lib/supabase.ts:23-46) pour les traces du lot 3.
- **Profils court/long.** Salarié seulement, gouvernés par `profilSaisie` + `body.multi===true` ; le court est conservé « octet pour octet » (comparaisons SHA-256 avant/après dans assistant-history.test.ts) ; le long ne passe jamais par un lecteur local et ses règles de redécoupage (pause, nouveau chantier, ville/code postal, chantier deviné) vivent dans worker-multi.ts (842 lignes, 67 tests).
- **Secours Gemini.** `avecSecours` (PROV:316-349) : un appel par niveau, le secours seulement après erreur/délai ; modèle « documents » mis de côté 10 min (PROV:119) ; HEIC/HEIF et images >10 Mo ne vont pas à Claude, elles tombent sur Gemini (ANT:158-170) ; `refusal` = panne du niveau ; `max_tokens` = jamais exécuté (ANT:219-232) ; liste blanche des modèles (ANT:56-63) ; jamais `temperature/top_p/top_k/budget_tokens`, pas de `tool_choice` forcé, `strict` désactivé (ANT:113 : 33,5 s mesurés).
- **Évaluation.** 126 cas verrouillés (`eval.test.ts:447`) ; `tool-domains.test.ts:14-34` lit `cases.ts` COMME TEXTE (regex sur `act('…')`, `fiche([…])`) pour prouver que l'outil attendu reste proposé : le format des contrôles est une API. `repeat:3`, au plus 4 ids par appel (ia-v2.md:394).
- **Confidentialité.** Aucun `console.*` avec du contenu : seule ligne autorisée `console.error('[assistant] erreur interne')` (assistant-history.test.ts:603-616) ; pièces jointes jamais stockées ; chats : texte seul, privé, 30 jours (vision §6).
- **Anti-injection.** Fichier joint → liste d'outils réduite (AC:1650 ; WC:1100) ; « les DONNÉES sont des faits » ; client « nommé » exigé pour une affectation ; toute suppression = carte ; une fiche salarié n'accepte que panier, réserve, congé, envoi (`MULTI_AUTORISES`, worker-multi.ts:71) et exige un indice lexical par annexe (607-613).
- **Jamais effacer** heures envoyées, mois clôturés, exports de paie (AC:1686, prompt 1820).
- **Délais.** Client : 60 s (lib/assistant.ts:56). Serveur, par appel : rapide 9 s / 14 s Claude (5 s / 8 s Gemini) ; long 18 s / 28 s Claude (14 s / 22 s Gemini) ; documents 20 s / 35 s Claude (PROV:93-116). Durée maximale d'une fonction Edge : non vérifiée dans le dépôt (ia-v2.md:395).

## 6. Dette et pièges pour une boucle d'outils

1. **Adaptateurs mono-tour.** `corpsOutils` fabrique `messages:[{role:'user'}]` (ANT:178-196) et Gemini `contents:[{role:'user'}]` (PROV:390) ; `lireReponseClaude` ignore les `stop_reason` autres que refus/`max_tokens` (ANT:222-232) ; `disable_parallel_tool_use` n'est posé que pour `maxCalls===1` (ANT:194). Il faut un historique de messages commun aux deux fournisseurs (blocs `tool_use`/`tool_result` ↔ `functionCall`/`functionResponse`) et savoir changer de fournisseur au milieu d'une boucle (secours).
2. **Les résultats de lecture ne reviennent pas au modèle** (`collegues`, IS:144-150 ; `corriger_pointage`, IB:196-208 : lectures faites APRÈS le choix).
3. **Écritures dans le navigateur.** L'exécuteur est un `switch` de fermetures (AP:128-504 ; WA:73-444) qui dépend de `supabase` navigateur, de `withOrigin` (variable de module) et de fichiers `File` en mémoire (suppression de document, téléversement). Une boucle côté serveur perdrait l'origine « assistant » des traces, l'`undo` et le journal ; une boucle pilotée par le navigateur doit renvoyer les `tool_result` au serveur (nouveau tour réseau, nouveau quota ?). Les deux options sont ouvertes : à décider.
4. **Aucun `default` dans les exécuteurs.** Un type sans `case` « réussit » avec un message vide, journalisé (AP:128-508 ; WA:73-446). `prepare` rend `null` pour un type inconnu (AC:1283), `summarize` est exhaustif ; `checkAction` n'oblige à rien.
5. **Une seule demande = un quota, mais plusieurs appels de modèle ensuite.** Le prompt bureau fait ~15 500 car. + outils : chaque tour de boucle le rejoue. Pas de `cache_control` (ANT:34-36), pas de streaming, pas de budget par entreprise (le plafond compte des demandes, pas des jetons, PROV:84), `MAX_TOKENS` 4 096 en `low` (ANT:68). Les fenêtres de délai (`DELAIS*`) sont calibrées pour UN appel.
6. **Sélection d'outils par expressions régulières françaises** (tool-domains.ts:26-71) : un outil non sélectionné n'existe pas pour le modèle ; une phrase turque ou sans mot reconnu reçoit TOUTES les déclarations (34 au bureau). Un catalogue de 100+ outils ne peut plus être envoyé entier (18 474 car. pour 34).
7. **Lecteurs locaux par mots-clés** (AC:1687-1721 ; WC:944-1027 ; ~150 lignes de regex) répondent AVANT le modèle, y compris à côté (rustines `doitSauterLeCheminLocal`, assistant-history.ts:241-243). Dans la vision (§1) ils ne sont qu'un raccourci : à garder, réduire ou retirer — décision liée aux tests qui les figent (tool-domains, assistant-history, 126 cas).
8. **Le profil long est un moteur de composition propre au salarié** (`buildLongReply`, 160 lignes d'arbitrage : fusion de `declarer_heures`, dépendances, ordre `chantier → heures → panier → réserve → congé → envoi`, suppressions refusées dans la fiche). Une boucle séquentielle ne le remplace pas sans réécrire ses 67 + 22 tests.
9. **Contrôles rejoués avec deux contextes.** La carte bureau rejoue `checkAction` avec un contexte réduit (`planning:[]`, `congesEnAttente:[]`, assistant-action-card.tsx:203-208) : « salarié absent ce jour » n'est vérifié que par le serveur.
10. **Banc d'évaluation mono-tour.** `runOne` fait UN `callFunction` puis `fromFunctionCall` (assistant-eval/run.ts) ; le prompt bureau y reçoit `'{}'` comme instantané ; `assistant-eval/v1/` garde deux copies figées des cœurs d'avant le lot 7 (à maintenir ou supprimer) ; une boucle impose des résultats d'outils simulés. 5 outils bureau sans cas ; Réserves salarié = 1 seul cas (un échec = 0 %), donc le seuil « 90 % par catégorie » est binaire pour les petites catégories ; aucune catégorie « question chiffrée ».
11. **Tests liés au texte** : guide du prompt figé (admin-tours.test.ts:410-416), tranche de source entre `export const ASSISTANT_FUNCTIONS` et `export const ATTACHMENT_ACTIONS` (admin-tours.test.ts:429) — déplacer ces constantes casse le test —, `docs/ia-v2.md` lu par deux tests (blocs JSON `AI_CONFIG`, titres « ## 0. », « ### Claude Sonnet 5.5 », avertissements, ai-config.test.ts:486-500 ; ai-anthropic.test.ts:666-680).
12. **Code mort** : `assistantPrompt`, `sanitizeAnswer`, `ASSISTANT_SCHEMA` (assistant-core.ts:128-185) et `workerPrompt`, `WORKER_SCHEMA` (WC:326-353) ne sont plus appelés par les fonctions (seulement par des tests) ; `commencer_pointage`/`annuler_pointage` survivent dans les unions.
13. **Interface sans registre.** `admin-planning.tsx` a 5 032 lignes ; ses fenêtres sont des `useState` locaux. Rien n'énumère « les fenêtres, formulaires, tableaux » que la vision veut ouvrir ; seuls les 48 + 23 parcours et leurs ancres en donnent une image partielle.
14. **Turc et libellés.** Aucun turc côté bureau ; cartes, boutons et textes pour le bureau restent en français (ia-v2.md:381) ; `isNewRequest` bureau est français (panel:239).
15. **Code de l'écran recopié, pas appelé.** La vision exige « le même code que l'interface » (§4), mais plusieurs cas de l'exécuteur refont leurs propres `supabase.from(...)` : `annuler_invitation` reproduit `revokeInvitation` (AP:476 ; admin-writes.ts:97-100), l'annulation de `creer_chantier` (AP:165-169), `supprimer_document`/`modifier_*` (AP:408-472), `effacer_heures`, `retirer_photo` (WA:315-342, 401-419). Un registre qui veut « une écriture = une entrée » devra décider s'il extrait ces fonctions ou s'il les référence telles quelles.
16. **Questions en attente par recollage.** « demande, réponse » (panel:335-337) + `sansDemandeRecollee` (assistant-history.ts:146-165) + `followUp` : un outil « demander à l'utilisateur » dans une boucle remplacerait ce mécanisme, mais les 32 tests d'`assistant-history.test.ts` et les 15 cas `sc` en dépendent.

## 7. Écarts avec les documents et le brief

- **121 cas** (brief) contre **126** (`cases.ts`, `eval.test.ts:447`, `docs/ia-v2.md:392`).
- `docs/ia-v2.md` §2 (tableau « Exécution directe ») range en « fait tout de suite » la réponse à un congé, lever une réserve, ajouter une dépense, habilitation, fiche client/salarié, que le code met en carte (et « pointer » côté salarié, désactivé depuis le lot 12) ; le code fait foi : `actionMode` n'a que 5 cas directs (AC:517-537). La vision §3 (niveau 2) les veut « faits avec Annuler » : écart à arbitrer, d'autant que 17 des 18 outils bureau « C » hors suppressions n'ont pas d'`undo` (seul `planning_semaine` en a un).
- Vision niveau 3 : seuls `cloturer_mois` et `envoyer_journee` ont aujourd'hui un outil « à confirmer » ; envoi au comptable/export, e-mails groupés, abonnement/paiement, droits d'accès (support) n'ont AUCUN outil ni mention « réservé à l'humain » (guides seulement : fiches `export`, `telecharger`, `abonnement`, `support`, `relancer`).
- Vision §2 « lire, remplir, guider » : l'instantané ne contient pas le planning, les documents ni les dépenses ; il n'existe pas d'outil de lecture sauf `planning_collegues`.
- Chiffre périmé dans `docs/ia-v2.md` : « 45 fiches bureau » (50 réelles, `assistant-aide.test.ts` n'exige qu'un plancher de 45). Les « 573 au lieu de 1 413 déclarations » (ia-v2.md:111) datent du lot 6 : à remesurer (à vérifier).
