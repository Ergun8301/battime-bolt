# 04 · Ouvrir n'importe quel écran : table des écrans, registre d'ouvreurs, pré-remplissage, test

Écrit le 15 octobre 2026, code lu en lecture seule (rien n'est implémenté). Cadre : `docs/ia-vision.md` §2 (« naviguer », « remplir »), §3 (niveau 1 : ouvrir et pré-remplir sont libres ; niveau 3 : le dernier clic reste humain), §7 (registre + test de couverture). Le résumé `02-capacites-bureau.md` parle d'un outil `ouvrir_fenetre(cible)` : je garde ce nom.

Abréviations de chemins (les numéros sont des lignes) : **AP** = `components/admin-planning.tsx` · **PP** = `app/poseur/page.tsx` · **PD** = `components/poseur-day.tsx` · **AC** = `supabase/functions/_shared/assistant-actions-core.ts` · **WA** = `supabase/functions/_shared/worker-assistant-core.ts` · **LW** = `lib/lazy-window.tsx` · **AT** = `supabase/functions/_shared/admin-tours.ts` · **WT** = `supabase/functions/_shared/worker-tours.ts` · **PA** = `components/assistant-panel.tsx` · **AD** = `app/admin/page.tsx`.
Notation Effort·Risque : F faible (état déjà là, moins d'une demi-journée) · M moyen (paramètres à résoudre, ou prop `init` à ajouter à un composant) · É élevé (composant de plus de 1000 lignes, ou garde-fou à contourner).

## 0. L'essentiel

- Aujourd'hui l'assistant sait ouvrir **10 écrans du bureau** (`NAV_ACTIONS` a 11 clés, AC:37-50, mais `planning` ne fait que replier le panneau, AP:4390) + la fiche d'un salarié (`salarie:<id>`, AC:1741, AP:4394), et **8 écrans du salarié** (`WORKER_NAV` a 9 clés, WA:438-449, mais `notifications` agit, PP:663). La table recense **35 ouvreurs bureau** et **18 salarié** (plus 2 lignes de contexte chacun) : 11 sur 35 et 8 sur 18 sont ouvrables aujourd'hui, le reste est invisible pour l'assistant.
- Aucun lien ne porte de paramètre (sauf `salarie:<id>`). Les paramètres demandés (semaine, mois, salarié, période d'export) n'existent pas dans le vocabulaire.
- Chaque écran est ouvert par un état React local, aiguillé à **trois endroits qui se recopient** : `onNavigate` (AP:4371-4398), `tourStep` (AP:3242-3278) et les props du menu ☰ (AP:4189-4216) ; côté salarié `onNavigate` (PP:657-669) et `tourStep` (PP:406-417).
- Proposition : un registre d'« ouvreurs » (déclaration pure, partagée navigateur/serveur, comme `admin-tours.ts`) + un outil `ouvrir_fenetre(id, params)` à identifiant fermé + une file d'attente pour les écrans pas encore montés + des valeurs initiales passées à l'ouvreur (jamais un clic simulé sur « Enregistrer »).
- Le test de couverture lit **six signaux déjà présents dans le code** (modules `lazyWindow`/`dynamic`, états `open*`, `<Dialog open=>`, ancres `data-guide`, vocabulaires `NAV_ACTIONS`/`WORKER_NAV`/écrans de guide, routes `page.tsx`) et échoue si l'un n'est ni dans le registre ni dans la liste « réservé à l'humain » avec sa raison.

## 1. Table de tous les écrans

### 1.1 Pages et routes (26 fichiers `page.tsx`, export statique : `next.config.js:3`, donc ni route dynamique ni paramètre de chemin)

| Route | Qui | Paramètres lus aujourd'hui | Pour l'assistant |
|---|---|---|---|
| `/admin` | rôle `admin` seul (`app/admin/layout.tsx:53`, rendu nul sinon `:71`) | `?subscribed=1` retour Stripe (AD:94) ; `#borne=<60 car.>` appairage d'une tablette (`layout.tsx:28-45`, `lib/kiosk-pair-stash.ts:22`) | tout se passe par états dans la page ; aucune URL à fabriquer |
| `/poseur` | rôle `worker` ou `lead` (`app/poseur/layout.tsx:31`, rendu nul sinon `:48`) | `?a=ajouter/avant/envoyer&t&u&h` posé par `/pointer`, lu une fois puis effacé (`supabase/functions/_shared/after-scan.ts:21`, PD:2065-2070) | idem ; `view` et `selectedDate` sont des états (PP:167-168) |
| `/pointer`, `/borne`, `/support`, `/apercu/*` | scan d'un QR / tablette / personnel BEMEXO / démos | `#f=` (QR fixe, `app/pointer/page.tsx:230-232`) | hors assistant : voir §4.3 |
| 17 pages publiques et d'accès (`connexion`, `inscription`, `mot-de-passe-oublie`, `auth/confirm`, `desabonnement`, `cgu`, `cgv`, `confidentialite`, `mentions-legales`, `landing`, `fonctionnalites/*`, `suisse/*`, `/`) | public | — | hors assistant (l'utilisateur est déjà connecté) |

### 1.2 Bureau : fenêtres, pages-fenêtres et formulaires (id proposé = identifiant stable du registre)

| id | Écran | Ouverture aujourd'hui (état : ligne) | Assistant aujourd'hui | Paramètres voulus et ce qu'il faut | E·R |
|---|---|---|---|---|---|
| `planning.semaine` | Grille, semaine affichée | `currentWeekStart` AP:1008, `changeWeek` AP:1975 ; téléphone `mobileDayIdx` AP:1011 | NAV `planning` : replie seulement le panneau (AP:4390) ; guide `semaine` | `lundi` (+ `jour` au téléphone) : `changeWeek` + `setMobileDayIdx` ; le rechargement est déjà déclenché par la semaine (effets AP:1438, 1454) | F·F |
| `planning.ajouter` | « Ajouter » : intervention, tâche, réunion | `addOpen`+`addTarget` AP:1142-1143 ; `openAdd` AP:2378, `openTaskAdd` AP:2396, `openMeeting` AP:2404 ; rendu AP:4702 | non (les cartes écrivent directement, niveau 2) ; guide `affecter` | `salarie, date, chantier, debut, fin, note, type` : `openAdd` remet 10 états à zéro (AP:2379-2383), l'ouvreur fixe `addWorksite/addStart/addEnd/addNote` ensuite (états AP:1144-1156) | M·M |
| `planning.intervention` | Fenêtre d'une intervention | `editing` AP:1164 via `openEdit` AP:2877 ; rendu AP:4791 | non ; guides `heure_note`, `retirer`, `documents` | `salarie, date, chantier` → id du planning (même résolution que `supprimer_intervention`) ; plusieurs cases : question | M·F |
| `planning.copier` | « Copier vers un autre jour » | `copyFor` AP:1172 ; lazy AP:123 (`warm:'never'`) | non ; pas de guide | `intervention` ; l'écriture reste au clic « Copier sur ces N jours » | M·F |
| `planning.selection` | Mode « Sélectionner » | `selectMode` AP:1180, `enterSelect` AP:1969 | non ; guide `selection` | aucun ; « Supprimer (N) » reste humain (confirmation `eraseAsk` AP:4108) | F·F |
| `planning.versions` | Versions du planning | `versionsOpen` AP:1661, drapeau `versionsOn` AP:1660 ; `dynamic` AP:108 | seulement via la carte d'une action (`onOpenVersions` AP:4400) ; guide `versions` (lien `planning`) | `lundi` → `changeWeek` d'abord ; indisponible si `versionsOn` faux | F·F |
| `planning.supprimees` | Interventions supprimées ou décalées | `tracesOpen` AP:1646, `tracesOn` ; `dynamic` AP:105 ; aussi depuis Réglages (AP:4187) | non ; pas de guide | aucun | F·F |
| `planning.imprimer` | Menu d'impression → feuille A4 | `printOpen` AP:1065, `PrintMenu` AP:3608, `startPrint` AP:1078, `window.print()` AP:1280 | non (« jusqu'à l'écran d'impression », vision §2) ; pas de guide | `periode` (semaine/jour/mois + date), `salarie` ou toute l'équipe, `signature`, `taches` = `PrintOptions` (`planning-print.tsx:32`) ; `PrintMenu` garde son état : prop `init` ; bouton absent sous 1024 px | M·M |
| `salaries.liste` | « Salariés » | `salariesOpen` AP:1056 ; rendu AP:4250 | oui `salaries` (AP:4383) ; guides `ajouter_salarie`, `role`… | `recherche` (`salariesQuery` AP:1058) | F·F |
| `salarie.nouveau` | « Nouveau salarié » | `workerOpen` AP:1237 ; champs `wFirst/wLast/wEmail/wPhone` AP:1343-1346 ; rendu AP:5014 | oui `nouveau_salarie` ; la carte `inviter_salarie` écrit | `prenom, nom, email, telephone` dans les états existants ; l'e-mail part au clic humain | F·F |
| `salaries.importer` | Import CSV/Excel de salariés | `importWorkersOpen` AP:1031 ; lazy AP:124 | non (fiche `importer_salaries` pointe `salaries`) | aucun (le fichier est choisi par la personne) | F·F |
| `salarie.fiche` | Fiche salarié : Gérer / Feuille d'heures | `ficheWorker`+`ficheMode` AP:1052-1053 ; lazy AP:118 (`isOpen: p.worker != null`) ; rendu AP:4178 | oui `salarie:<id>` en mode heures seulement (AP:4394-4397) ; guides `fiche_salarie`, `feuille`, `habilitations`, `cout_reel`… | `salarie`, `mode` (hours/manage), `periode` (le composant garde `range` = aujourd'hui, `worker-detail.tsx:120` : prop `init`), `rubrique` ; jamais n° de sécu, taux, bulletin (vision §4) | M·F |
| `salarie.statut` | Statut (Présent, absence, Feuille d'heures) | `statusTarget` AP:1051 ; rendu AP:4150 | non ; guides `present`, `absence` | `salarie`, `date` | F·F |
| `absence.poser` | Formulaire d'absence (calendrier) | `pendingAbsence` AP:1210 (posé AP:2478), plage `absRange` AP:1211 ; rendu AP:4748 | non ; l'écriture est la carte `poser_absence` | `salarie, type, du, au` → `setPendingAbsence` + `setAbsRange` | M·F |
| `conges.demandes` | Demandes de congé (bureau) | `leaveOpen` AP:1032 ; lazy AP:116 | oui `conges` ; guide `demandes_conge` | `salarie` (filtre : prop à ajouter) | F·F |
| `formations.gestion` | Formations (bureau) | `trainingsOpen` AP:1627, `trainingsOn` ; lazy AP:127 (`warm:'mounted'`) | non ; pas de guide | aucun | F·F |
| `email.groupe` | « Envoyer par e-mail » | `emailOpen` AP:1630, `emailVisible` AP:1631 ; lazy AP:129 (`warm:'never'`) | non ; pas de guide | `mode`, `destinataires`, `texte` : états internes (`staff-email-dialog.tsx:29-35`) → prop `init` (**à vérifier** que le composant l'accepte sans casser « picked ») ; l'envoi = niveau 3 | M·M |
| `clients.liste` | Liste Clients (menu) / « Chantiers » (téléphone) | `chantierMenuOpen` AP:1015 ; `mobileChantiersOpen` AP:1021 (rendu AP:4469) | oui `clients` (AP:4391-4393, seuil 640 px) | `recherche` (`clientsQuery` AP:1057) ; seuil à unifier (§1.4, point 5) | F·M |
| `client.nouveau` | « Nouveau client » | `clientOpen` AP:1227 ; champs `cName…cDesc` AP:1228-1234 ; rendu AP:4991 | oui `nouveau_client` ; carte `creer_chantier` | `nom, produit, telephone, email, ville, adresse, description` | F·F |
| `client.fiche` | Fiche client (budget, terminer, archiver) | `clientFiche` AP:1190 ; `openClientFiche` AP:2887 recopie déjà 9 états `ws*` (AP:1196-1205) ; rendu AP:4909 | non (NAV `clients` seulement) ; guides `budget`, `fiche_client`, `archiver_client` | `chantier` (nom → id) ; le pré-remplissage existe | F·F |
| `clients.importer` | Import CSV/Excel de clients | `importOpen` AP:1022 | oui `import_clients` | aucun | F·F |
| `chantier.documents` | Documents du chantier | `docsWorksite` AP:1195 ; lazy AP:119 ; rendu AP:4978 | non ; guides `documents`, `envoyer_client` | `chantier`, `jour` (`workDate`) | F·F |
| `chantier.termine` | Terminer / Rouvrir / Bilan | `termineTarget` AP:1191 ; lazy AP:120 (`isOpen: p.target != null`) | non ; pas de guide | `chantier`, `mode` ; le clic final est dans la fenêtre | M·F |
| `export.equipe` | « Exporter l'équipe » | `exportOpen` AP:1119, période `exportRange` AP:1125 ; rendu AP:4555 | oui `export` (AP:4388) ; guides `export`, `telecharger`, `cloture` | `periode` (semaine, mois, dates) → `setExportRange` ; **ne jamais appeler `demanderExport`** (AP:2825) : export et envoi au comptable = niveau 3 | F·F |
| `export.salarie` | « Exporter un salarié » | `exportWorkerOpen` AP:1124 ; rendu AP:4670 | non ; guide `telecharger` | `salarie` → même ouvreur que `salarie.fiche` (mode heures) | F·F |
| `cloture.mois` | Confirmation « Clôturer {mois} ? » | `closureTarget` AP:1123 via `askClosure` AP:1696 ; rendu AP:4642 | non (carte `cloturer_mois`) ; guide `cloture` | `mois` : `askClosure` ne vérifie pas que le mois est clôturable (liste `closableMonths` = mois précédent et en cours, AP:1690) : l'ouvreur DOIT le faire ; niveau 3 : « Clôturer » reste humain ; « Rouvrir » (AP:1721, sans confirmation) n'est pas ouvrable | M·F |
| `couts.chantiers` | « Coût chantiers » | `costOpen` AP:1023 ; lazy AP:115 | oui `couts` ; guides `couts`, `depense` | `periode` (preset month/week/custom + `range`, `cost-report.tsx:147-148`), `chantier` déplié (`:151`) : prop `init` | M·F |
| `stats.equipe` | Statistiques (lecture seule) | `statsOpen` AP:1024 ; bouton AP:3415 ; lazy AP:117 | non ; aucune ancre ni guide | aucun (période : **à vérifier** dans `team-stats.tsx`) | F·F |
| `reserves.registre` | Réserves de chantier | `reservesOpen` AP:1025 ; lazy AP:113 | oui `reserves` ; guides `reserves`, `lever_reserve` | `onglet` (À traiter / levées, `reserves-report.tsx:287`), `chantier` | F·F |
| `relances.liste` | « À relancer » (panneau / fenêtre mobile) | `statPanel='waiting'` AP:983 ; `relanceOpen` AP:997 (rendu AP:4141) | non ; guide `rappel` | aucun ; « Relancer » par ligne reste une action | F·F |
| `invitations.liste` | Invitations en attente (ligne repliée) | état interne `open`, `pending-invitations.tsx:104` ; deux instances AP:3625 et AP:3906 | non ; guides `relancer`, `annuler_invitation` | signal ou prop pour déplier ; « Envoyer toutes » = niveau 3 | M·F |
| `reglages.entreprise` | Réglages de l'entreprise | `settingsOpen` AP:1060 ; lazy AP:114 | oui `reglages` ; guides `reglages`, `support`, `recap`, `caisse`, `collegues`, `position` | `rubrique` (accordéon interne `secs`, `company-settings.tsx:591-815`) : prop `init` | M·F |
| `borne.gestion` | Gestion des bornes (code de la tablette) | `kioskOpen` AP:1030, `kioskOn` ; lazy AP:126 | non (la fiche `borne` pointe `planning`, AC:290) ; guide `borne` | aucun ; le code à 6 chiffres s'affiche à la personne, jamais au modèle | F·M |
| `abonnement.choisir` | « Choisissez votre abonnement » | `subOpen` AD:78, via `onSubscribe` AD:190 ; rendu AD:193 | non ; guide `abonnement` | aucun ; le paiement (Stripe) est niveau 3 | F·F |
| `heures.attribuer` | « Attribuer » / heures ajoutées par le salarié | `attributeTarget` AP:1126 (AP:4509) ; `extraTarget` AP:1129 (AP:4532) | non (carte `attribuer_client`) ; guide `attribuer` | `salarie, date, chantier` | M·F |
| (guide) | « Me guider pas à pas » | `tour` AP:1019 ; `guide:<id>` (AP:4374) | oui, 48 fiches (AT:65) | reste tel quel : le bouton est fabriqué par le code (`guideButton`, AC:1672), jamais choisi par le modèle ; `ouvrir_fenetre` est un outil distinct | — |
| (interne) | Menu ☰ et menu du compte | `mobileMenuOpen` AP:1017, `accountMenuOpen` AP:1016 | guide seulement (`AdminScreen` `menu`/`compte`, AT:25) | non proposé au modèle : aucun intérêt hors guide (raison à écrire au registre) | — |

### 1.3 Salarié : vues, fenêtres et couches de l'éditeur

| id | Écran | Ouverture aujourd'hui (état : ligne) | Assistant aujourd'hui | Paramètres voulus et ce qu'il faut | E·R |
|---|---|---|---|---|---|
| `jour.ouvrir` | Ma journée (aujourd'hui) | `view='day'`, `goHome` PP:399 | oui `journee` (PP:658) | — | F·F |
| `jour.date` | Une autre journée | `selectedDate` PP:168, `openDay` PP:398 (appelé par Semaine/Mois PP:629-631 et le bandeau PP:466-490) | non | `date` ISO ; la lecture reste celle de la journée existante (ses données, sous RLS) | F·F |
| `semaine.ouvrir` | Ma semaine | `view='week'`, `goTo` PP:400 ; lazy PP:43 ; semaine interne `weekStart` (`poseur-week.tsx:64`) | oui `semaine` | `lundi` : prop `init` | M·F |
| `mois.ouvrir` | Mon mois | `view='month'` ; mois interne `monthStart` (`poseur-month.tsx:26`) | oui `mois` | `mois` : prop `init` | M·F |
| `historique.ouvrir` | Historique | `view='history'` ; lazy PP:45 | oui `historique` | — | F·F |
| `historique.supprimees` | Mes interventions supprimées | `tracesOpen` (`poseur-history.tsx:46`), `dynamic` `:23` | non | — | F·F |
| `formations.ouvrir` | Formations | `view='formations'` PP:62 ; entrée du menu si `trainingsMenu` (PP:179,604) | non (pas dans `WORKER_NAV`) | `formation` (titre ou id, capacité S63) ; indisponible sans formation | F·F |
| `conges.demande` | Mes congés + « Faire une demande » | `leaveOpen` PP:183 ; lazy PP:49 ; champs `type/start/end/note` (`leave-request-dialog.tsx:56-59`), `adding` (`:62`) | oui `conges` (PP:662) ; la demande = carte `demander_conge` | `type, du, au, note` : prop `init` (+ `adding`) ; l'envoi est le clic de la personne | M·F |
| `infos.ouvrir` | Informations (position, données) | `infoOpen` PP:194 ; rendu PP:642 | oui `infos` | — | F·F |
| `jour.ligne_nouvelle` | Fiche « + » (nouvelle ligne d'heures) | `openSlot={kind:'new'}` PD:519 ; `openNew` PD:1102 ; états `fStart/fEnd/fWorksiteId/fObs…` PD:520-539 | non (le brouillon `declarer_heures` est une carte) ; guides `noter-heures`, `autre-chantier` | `date, debut, fin, chantier, note` ; précédent : `afterScanSpan` PD:2106 | É·M |
| `jour.ligne` | Fiche d'une ligne existante | `openPlanned/openEntry/openPending` PD:1080-1095 | non ; guides `modifier-heures`, `retirer-ligne`, `reserve` | `ligne` ; journée envoyée : passe par `askCorrect` (PD:1133) | É·M |
| `jour.documents` | Documents du chantier | `docsWs` PD:592 ; rendu PD:3082 | non ; guide `photo-document` | `chantier` | M·F |
| `jour.dupliquer` | « Dupliquer cette journée » | `repeatOpen` PD:581 ; dates `copyDates` PD:583 | non ; guide `copier-journee` | `jours` ; l'écriture est au clic « Copier » | M·F |
| `jour.envoyer` | « Envoyer votre journée maintenant ? » | `sendAsk` PD:572 ; précédent `a=envoyer` PD:2090-2099 | non ; guide `envoyer-journee` | aucun ; niveau 3 : la confirmation s'ouvre, Entrée ne confirme jamais (`fonctions-salarie.md:97`) | M·F |
| `reserves.liste` | Bandeau « réserves à lever » + liste | état interne `open`, `worker-reserves.tsx:32` ; monté PP:503 | non ; guide `lever-reserve` | signal ou prop | M·F |
| `equipe.jour` | « Mon équipe » (chef d'équipe) | `TeamDay` PD:2156-2161 (rôle `lead`, jour courant) ; `day/who` (`team-day.tsx:116-117`) | non ; guide `equipe` | `jour, salarie` ; rôle `lead` seulement | M·M |
| `scanner.ouvrir` | Lecteur de QR (caméra) | `scanOpen` PP:193 ; lazy PP:53 (`warm:'never'`) | oui `borne` (PP:665) | geste d'appareil (permission caméra) : bouton seulement | F·M |
| `photo.profil` | Sélecteur de photo | `photoInputRef.click()` PP:664 | oui `photo` | geste d'appareil : bouton seulement | F·F |
| `notifications.activer` | Autorisation des notifications | `togglePush` PP:287, appelé par l'action `notifications` (PP:663) | oui, mais c'est une **action** (demande de permission), pas une navigation | réservé à l'humain (§4.3) | — |
| (interne) | Menu du compte | `menuOpen` PP:198 | guide seulement (`TourScreen` `menu`, WT:21) | non proposé au modèle | — |

### 1.4 Constats

1. **Un tiers seulement est ouvrable côté bureau.** 16 des 50 fiches de `GUIDE` (AC:63-420) ont pour `lien` la valeur `planning`, qui ne fait que replier le panneau (AP:4390). Pour la grille elle-même (`affecter`, `semaine`) c'est juste ; pour `borne`, `versions`, `selection`, `documents`, `envoyer_client`, `attribuer`, la fenêtre voulue n'est pas la grille : « M'y emmener » ne mène alors nulle part.
2. **Les paramètres sont perdus à l'enregistrement.** `cleanLinks` (`lib/assistant-chats.ts:70-77`) ne garde que `label` et `action` ; la base borne à 10 liens et 4000 caractères (`supabase/migrations/20261014090000_ia_etape2_chats.sql:255-256`, `LINKS_MAX` `:43`). Les paramètres doivent donc **vivre dans la chaîne `action`** (comme `salarie:<id>` aujourd'hui), pas dans un champ de plus.
3. **Trois aiguillages à tenir synchronisés** (voir §0). Ajouter un écran = le brancher à chacun ; l'oubli ne fait échouer aucun test.
4. **Deux mécanismes de chargement différé** : 22 appels `lazyWindow` (16 bureau, 6 salarié dont les 3 onglets, `errorFallback` PP:43-48) et 7 modules chargés par `next/dynamic` (`traces-dialog`, `planning-versions-dialog`, `kiosk-pair-confirm`, `kiosk-fixed-qr`, `training-video-*`). Le test doit voir les deux.
5. **Deux seuils de petit écran.** `onNavigate` ouvre le menu déroulant « Clients » sauf sous 640 px (AP:4391-4393) ; la barre qui le porte est cachée sous 1024 px (CSS AP:789, seuil du guide AP:3241). Entre 641 et 1023 px le lien « Clients » ouvrirait donc un menu invisible : **à vérifier sur un appareil** (le test `guides-bureau-lot7.mjs` couvre 768 px pour le guide, pas pour ce lien). Le panneau de l'assistant ne se replie lui aussi que sous 640 px (PA:453) alors qu'il couvre 420 px à droite (PA:130, `z-index:70`) : une fenêtre ouverte entre 641 et 1023 px passe en partie dessous.
6. **Certaines fenêtres gardent leur état** : `mount:'open'` = montée à la première ouverture puis jamais démontée (LW:28). Les valeurs initiales doivent donc s'appliquer **à chaque ouverture**, pas seulement au montage.
7. **Une « navigation » qui agit** : `notifications` (PP:663) déclenche la demande de permission. À sortir du vocabulaire de navigation.
8. **Reste d'un ancien chemin** : `STATIC_ACTIONS` (`assistant-core.ts:120`, `couts`/`conges`) n'est lu que par `sanitizeAnswer` (`:128`), que seul `assistant.test.ts` appelle (recherche faite dans tout le dépôt hors `node_modules` et `out`). À retirer au socle.

## 2. Mécanisme central : le registre d'ouvreurs

### 2.1 Deux moitiés, une seule liste d'identifiants

**(a) La déclaration** : `supabase/functions/_shared/openers.ts`, du TypeScript pur sans React ni accès réseau, lu par le navigateur ET par les fonctions (même règle que `admin-tours.ts:1-3`, importé via `@/supabase/functions/_shared/…` comme `lib/assistant.ts:13`). Elle ne contient aucune fonction qui ouvre quoi que ce soit.

```ts
export type ParamKind = 'salarie' | 'chantier' | 'date' | 'lundi' | 'mois' | 'enum' | 'texte' | 'liste_dates';
export interface Ouvreur {
  id: string;                         // stable, jamais renommé : 'salarie.fiche'
  cote: 'bureau' | 'salarie';         // la fonction qui l'expose : assistant / worker-assistant
  roles: ('admin' | 'worker' | 'lead')[];
  titre: string;                      // libellé du bouton, en français (les libellés restent français, ia-v2 §G)
  decrit: string;                     // une phrase claire, lue par le modèle
  params: Record<string, { kind: ParamKind; requis?: boolean; valeurs?: string[]; aide: string }>;
  niveau: 1 | 3;                      // 3 = ouvre la confirmation, le dernier clic reste humain
  dispo?: 'versions' | 'traces' | 'formations' | 'borne' | 'email' | 'taches' | 'chantier_termine' | 'ia';
  ecran?: 'grand' | 'petit' | 'tous'; // 'grand' = absent sous 1024 px (impression)
  empile?: boolean;                   // peut s'ouvrir par-dessus une autre fenêtre (documents)
  formulaire?: boolean;               // fenêtre à saisie : jamais fermée par un autre ouvreur
  composants?: string[];              // modules lazy/dynamic ouverts : 'components/worker-detail'
  etats?: string[];                   // états React pilotés : ['ficheWorker', 'ficheMode']
  ancres?: string[];                  // data-guide qui y mènent : ['bureau-nav.salaries']
  alias?: string[];                   // anciennes actions : 'salaries', 'salarie:' (compatibilité)
}
export const RESERVE_HUMAIN: { cible: string; raison: string; dette?: string }[] = [ /* §4.3 */ ];
```

**(b) L'implémentation** : `lib/openers.ts` (navigateur) fournit `registerOpeners(cote, impls)` et `openLink(action)`. Chaque écran enregistre ses fonctions dans un `useEffect` avec nettoyage : `AdminPlanning` pour le bureau, `PoseurPage` pour le salarié, et `PoseurDay` pour ses couches (éditeur, documents, duplication). Les fonctions lisent l'état courant par des `ref` (comme `here` en PP:404-405), pour ne jamais ouvrir sur des données périmées. Le registre est par page : la page `/poseur` n'enregistre aucun id du bureau (le code du bureau n'y est a priori pas chargé, `/admin` étant une autre page : **à vérifier** dans `out/`).

Les trois aiguillages actuels disparaissent : `onNavigate = (a) => openLink(a)` (une ligne), et `tourStep` appelle `openLink` pour ses écrans (les `AdminScreen`/`TourScreen` deviennent des alias d'ouvreurs, `ADMIN_SCREENS` AT:27 ne diverge plus).

### 2.2 L'outil unique et ce que le serveur fait du choix du modèle

```ts
{ name: 'ouvrir_fenetre',
  description: 'Ouvrir un écran, une fenêtre ou un formulaire de BEMEXO. N’enregistre rien. Pour EXPLIQUER où cliquer, répondre (repondre), pas ouvrir. Écrans : <id(params*)> …',   // liste générée du registre, une ligne par id
  parameters: { type: 'object', required: ['id'], properties: {
    id: { type: 'string', enum: [/* ids du côté, générés */] },
    salarie: S('nom tel que dit'), chantier: S('…'), date: S('aaaa-mm-jj ou nom de jour'), mois: S('aaaa-mm'),
    periode: { type: 'string', enum: ['jour', 'semaine', 'mois'] }, mode: S('…'), rubrique: S('…'), texte: S('…') } } }
```

Les paramètres sont **plats et tous facultatifs** (une seule déclaration pour tous les ids, pas d'union, les déclarations étant écrites au format Gemini puis converties pour Claude, `ia-v2.md:183`). Le détail par id (« `salarie.fiche(salarie*, mode, du, au)` ») est dans la description : de l'ordre de 1 k jetons par côté (35 ids bureau, 18 salarié ; estimation non mesurée), dans le bloc mis en cache (`03-boucle-d-outils.md` §3.3). C'est un outil **terminal de niveau 1** (`OutilTerminal`, `03-boucle-d-outils.md:84`) : il ne boucle pas.

Traitement serveur, dans l'ordre (une seule fonction pure `ouvrirDepuisAppel(args, ctx, cote, role)` dans `openers.ts`, testée sans réseau) :
1. `id` : recherche par égalité dans un tableau, jamais `OUVREURS[id]` (leçon de `findAdminTour`, AT:297, `guide:constructor`), et l'ouvreur doit être du bon `cote` et du bon rôle. Sinon : réponse « Je ne peux pas ouvrir cet écran » + le lien de la fiche d'aide la plus proche.
2. Chaque paramètre est résolu avec les outils **déjà là** : `resolveSalarie` (AC:786), le rapprochement de chantier de `affecter_planning`, `parseDateFr` et `dateAVenir` pour « lundi » (`fr-langue.ts`), `mondayOf` (AC:742). Un nom inconnu ou ambigu ne devient jamais un id deviné : on réutilise « UNE question courte + choix en un clic » (`ia-v2.md` §2). Les noms viennent de la liste que la fonction a lue **avec le jeton de la personne** (sa RLS).
3. Le lien rendu est `{ label: titre, action: 'ouvrir:<id>?salarie=<uuid>&mode=hours' }`. Les valeurs sont des identifiants, des dates ISO ou des mots d'une liste fermée : aucun texte libre n'est exécuté (les champs de type `texte` ne servent qu'à pré-remplir, §3). Longueur visée : moins de 200 caractères ; 3 liens au plus par réponse (limite actuelle AC:1743).
4. Réponse : le texte du modèle (700 caractères au plus) + le lien. Aucun appel à une écriture : niveau 1, sans carte ni « Annuler ».

Compatibilité : les actions d'avant (`couts`, `salaries`, `salarie:<id>`, `guide:<id>`, `ask:…`) restent valides comme **alias** (`alias` du registre) : les conversations rouvertes depuis l'historique (30 jours) contiennent encore ces chaînes (`assistant-chats.ts:93-98`). Le champ `liens` de l'outil `repondre` (AC:1424) devient inutile : `ouvrir_fenetre` le remplace ; `repondre` garde la réponse et le bouton « Me guider pas à pas », ajouté par le code (AC:1750-1761).

### 2.3 Droits : quatre barrières, aucune ne repose sur le modèle

1. **La fonction côté serveur.** `assistant` appelle `loadAssistantContext(db, 'bureau')` avec le jeton de la personne et répond 403 « Réservé au bureau » à un non-admin (`assistant/index.ts:105`) ; `worker-assistant` est son pendant (`worker-assistant/index.ts:88-92`, « Réservé aux salariés »). Les enums de l'outil sont générés **par côté** : un salarié ne voit jamais un id du bureau, même en forgeant une requête, parce que la fonction du bureau lui est fermée et que celle du salarié ne les connaît pas.
2. **Le validateur de lien** (étape 2 ci-dessus) refait le contrôle du côté et du rôle sur ce que le modèle renvoie.
3. **Le navigateur** : `openLink` vérifie que l'id est enregistré **sur cette page**, que `roles` contient `user.role`, que le drapeau `dispo` est vrai (les drapeaux `versionsOn`, `tracesOn`, `trainingsOn`, `kioskOn`, `emailVisible` sont des états locaux, AP:1660,1645,1626,1029,1631 : le serveur ne les connaît pas, un lien « mort » doit donc répondre « Cette fonction n'est pas activée chez vous »), et que la largeur convient. Un lien lu dans un ancien chat est une donnée non fiable : il passe par les mêmes contrôles.
4. **Les garde-fous existants** : `app/admin/layout.tsx:53` et `app/poseur/layout.tsx:31` renvoient vers la connexion si le rôle ne convient pas ; et ouvrir une fenêtre ne donne aucune donnée : toute lecture passe par la RLS. Jamais d'`eval`, de `import()` construit à partir d'une chaîne ni de chemin d'URL : les `import()` restent littéraux dans les `lazyWindow(() => import('@/components/…'))` (export statique).

Pour un salarié qui demande une fenêtre du bureau : l'outil ne la propose pas ; le modèle répond par `repondre` (avec le guide pas à pas si la fiche existe) ou « c'est le bureau qui s'en occupe ». À mesurer dans l'évaluation (cas négatifs, §5.3).

### 2.4 Chargement différé (`lazyWindow`)

- **Ouvrir = poser l'état.** Le `Wrapper` charge le code dès que `open` est vrai et rend la fenêtre quand il est prêt (LW:98-120) ; en cas d'échec il affiche `LAZY_ERROR` et rappelle `close` (LW:113-116), le clic suivant réessaie. Un ouvreur n'a donc **rien à attendre**, et il ne réimplémente rien.
- **Objets au lieu de booléens.** `salarie.fiche`, `chantier.termine`, `planning.copier` s'ouvrent par un objet non nul (`isOpen: p.worker != null`, etc. AP:118,120,123,132) : l'ouvreur retrouve l'objet dans les listes déjà chargées (`workers`, `worksites`, `planning`).
- **Préchauffage au moment du lien.** Dès qu'une réponse contient un lien, `openers.ts` appelle `Composant.preload()` (LW:138) du composant concerné, comme le font déjà les boutons (`onPointerEnter={() => TrainingsAdmin.preload()}`, AP:3450). Utile pour `warm:'never'` (copier, e-mail, verrou, scanner) ; `warmAll()` (LW:72) reste réservé au guide.
- **Écran pas prêt.** Tant que salariés et clients ne sont pas lus, la page affiche « Chargement du planning… » (`fonctions-bureau.md` §6) : `openLink` met la demande en **file** (une seule, 10 secondes au plus) et la rejoue quand `registerOpeners` annonce `prêt`. Même schéma que `afterScanPending`, variable de module qui survit au remontage de la journée (PD:475). Si l'écran cible n'est pas monté (vue Semaine alors que l'ouvreur est dans `PoseurDay`), l'ouvreur de page change de vue d'abord, puis la file est rejouée au montage de l'enfant.
- **Une seule fenêtre à la fois.** Avant d'ouvrir, un ouvreur ferme la navigation sans saisie (menus, panneaux, listes) avec la table `navigation` déjà écrite pour le guide (AP:3256-3262), mais **jamais** une fenêtre `formulaire` (nouveau salarié, nouveau client, réglages, fiche, modification, ajout, absence, documents) : règle déjà posée par `tourStep` (AP:3253-3255). Si une telle fenêtre est ouverte, l'ouvreur répond `occupe` et l'assistant dit « terminez ou fermez la fenêtre en cours » : aucune saisie perdue.

### 2.5 Téléphone et petits écrans

| Cas | Comportement |
|---|---|
| Moins de 641 px | Le panneau prend toute la largeur ou presque (420 px au plus, PA:130) : il se replie après le clic (PA:453), la fenêtre s'ouvre, la conversation reste en mémoire (`mount:'warm'`) et se rouvre par le bouton « Assistant BEMEXO » (l'étoile). |
| 641 à 1023 px (tablette) | Le bureau a la disposition « téléphone » (AP:789,3241) mais le panneau reste ouvert, couvre 420 px à droite et passe au-dessus des fenêtres (`z-index` 70 contre 50 pour Radix : PA:130, `guide-tour.tsx:39`). Proposition : **replier le panneau dès que la largeur est sous 1024 px**, un seul seuil (1023) partagé par le guide et les ouvreurs (`isNarrow()` dans `lib/openers.ts`). |
| Ouvreurs à deux visages | `clients.liste` (menu déroulant ou fenêtre « Chantiers »), `planning.semaine` (`mobileDayIdx` en plus), `planning.selection` (libellés différents). L'ouvreur choisit selon `isNarrow()`, comme `tourStep` (AP:3247-3270). |
| Absent au téléphone | `planning.imprimer` : pas de bouton (`fonctions-bureau.md` §7) : réponse « Sur téléphone, imprimez avec le menu du navigateur » (`ecran:'grand'`). |
| Ouverture automatique ou bouton | La vision dit « immédiat, sans confirmation » pour ouvrir. Proposition à faire valider par le patron : sur 1024 px et plus, quand la personne a **demandé** d'ouvrir (« ouvre… », « emmène-moi… »), la fenêtre s'ouvre seule (`auto: true`) et le panneau reste visible ; sinon (question « où est… ») un bouton « Ouvrir … », un seul toucher. Jamais d'ouverture automatique d'un niveau 3 (`export.equipe`, `cloture.mois`, `email.groupe`, `jour.envoyer`) ni d'un geste d'appareil. |
| Retour du téléphone | Les couches de la journée du salarié empilent une entrée d'historique (PD:983-999) : un ouvreur qui pose ces mêmes états en profite sans code de plus. `conges`, `infos`, scanner et assistant n'y sont pas (`fonctions-salarie.md:103`) : écart connu, pas lié aux ouvreurs. |
| Focus | Après l'ouverture, Radix place le focus dans la fenêtre ; pour la fermeture, `returnFocus` du guide (AP:4417) montre le modèle à suivre (ramener sur le bouton « Assistant BEMEXO »). |

## 3. Pré-remplir un formulaire ouvert sans casser l'état

Règles (toutes vérifiables par test) :
1. **Une graine, appliquée à l'ouverture.** L'ouvreur reçoit des valeurs typées, déjà validées par le serveur ET revalidées ici, et les pose **dans le même geste** que l'ouverture (`openAdd` puis `setAddWorksite…`, ou `openClientFiche(ws)` qui recopie déjà neuf états, AP:2887-2900). Aucun effet qui « surveille » une prop : l'état reste celui du composant, l'utilisateur peut tout changer comme avant.
2. **Jamais dans un formulaire déjà ouvert** : si la fenêtre `formulaire` est ouverte (peut-être avec de la saisie), l'ouvreur répond `occupe`, il n'écrase rien.
3. **Composants à état interne** (`WorkerDetail`, `CostReport`, `CompanySettings`, `PrintMenu`, `LeaveRequestDialog`, `StaffEmailDialog`, `PoseurWeek`, `PoseurMonth` ; `PlanningVersionsDialog` reçoit déjà `monday` en prop, AP:4226) : une prop facultative `init?: {...}` plus un compteur `initKey`, appliquée au **passage de fermé à ouvert** (un petit `useSeedOnOpen(open, init, apply)` partagé), car ces fenêtres ne sont pas démontées entre deux ouvertures (LW:28). Sans `init`, le composant se comporte à l'octet près comme avant.
4. **Précédent à copier pour la journée du salarié** : `afterScanPending` (PD:475, lu PD:2065-2111) pose les heures proposées dans la fiche « + » une fois la journée chargée, **en passant par les mêmes gardes** que le bouton : journée envoyée → `askCorrect` (PD:2109), mois clôturé → `lateOpen` (`openNew` PD:1103, retour PD:2105), mauvais compte ou autre jour → rien, délai de 3 minutes. Les ouvreurs de la journée (`jour.ligne_nouvelle`, `jour.envoyer`) reprennent ce schéma, sans nouvelle URL.
5. **Jamais d'enregistrement.** L'ouvreur ne clique ni « Enregistrer », ni « Envoyer », ni « Clôturer ». Le niveau 2 (faire avec « Annuler ») reste le travail des cartes d'action (`affecter_planning`…), qui ne passent pas par les ouvreurs.
6. **Seulement des champs sûrs.** Les `params` d'un ouvreur ne contiennent jamais n° de sécurité sociale, taux horaire, matricule, bulletin, e-mail d'un autre que le destinataire demandé (vision §4). Les textes (nom, adresse, note) entrent dans l'état React comme du texte, bornés comme les champs (`maxLength` existants).
7. **Visible.** Une ligne `aria-live` « Pré-rempli par l'assistant : vérifiez avant d'enregistrer » dans la fenêtre pré-remplie, retirée à la première frappe. Une valeur inconnue reste vide : jamais devinée (règle déjà appliquée aux villes, `ia-v2.md` §G).

Champs graine, par formulaire : nouveau client (`cName…cDesc` AP:1228-1234), nouveau salarié (`wFirst…wPhone` AP:1343-1346), ajouter (`addWorksite/addStart/addEnd/addNote/addKind`, AP:1144-1156), absence (`absRange` AP:1211), export (`exportRange` AP:1125), congé du salarié (`leave-request-dialog.tsx:56-59`), fiche « + » du salarié (`fStart/fEnd/fWorksiteId/fObs`, PD:520-539).

## 4. Effort, risque, ordre, et ce qui n'est pas ouvrable

### 4.1 Récapitulatif (colonne E·R des tables)

Bureau (35 ouvreurs) : F·F 20 · M·F 10 · M·M 3 · F·M 2. Salarié (18 ouvreurs) : F·F 7 · M·F 7 · M·M 1 · F·M 1 · É·M 2. Aucun É côté bureau : tous ses écrans ont déjà un état local ou un setter. Les deux seuls É sont les fiches d'heures de la journée du salarié (PD : 3086 lignes, 58 `useState`), et seulement parce qu'on y pose une graine ; la navigation vers la journée est F·F. Les 5 M·M/F·M du bureau sont `planning.ajouter` (10 états remis à zéro), `planning.imprimer` (impression directe), `email.groupe` (niveau 3), `clients.liste` (seuil de largeur), `borne.gestion` (code affiché).

### 4.2 Ordre de mise en œuvre

0. **Socle** : `openers.ts` (déclarations, validateur, génération de l'outil), `lib/openers.ts` (registre, file, `isNarrow`, alias), outil `ouvrir_fenetre` dans les deux fonctions, `onNavigate` des deux pages ramenés à `openLink`. **Aucune fenêtre nouvelle** : on déclare en alias ce que `NAV_ACTIONS` et `WORKER_NAV` ouvrent déjà, on donne aux fiches `borne`, `versions`, `selection`, `documents`… leur vrai ouvreur au lieu de `planning`, on sort `notifications` de la navigation. Test de couverture en version « avertit ».
1. **Vague 1, sans paramètre** (F·F) : `salaries.liste`, `salaries.importer`, `clients.importer`, `reserves.registre`, `conges.demandes`, `stats.equipe`, `planning.supprimees`, `planning.versions`, `formations.gestion`, `abonnement.choisir`, `relances.liste`, `planning.selection`, `borne.gestion`, `clients.liste` (avec le seuil unique) ; salarié : `jour.date`, `historique.supprimees`, `formations.ouvrir`.
2. **Vague 2, paramètres déjà en états** : `planning.semaine`, `salarie.fiche` (sans période), `client.fiche`, `chantier.documents`, `client.nouveau`, `salarie.nouveau`, `export.equipe` (période), `cloture.mois`, `planning.ajouter`, `salarie.statut`, `absence.poser`, `export.salarie`.
3. **Vague 3, props `init`** : `salarie.fiche` (période), `couts.chantiers`, `reglages.entreprise` (rubrique), `planning.imprimer`, `email.groupe`, `invitations.liste`, `chantier.termine`, `planning.intervention`, `planning.copier`, `heures.attribuer` ; salarié : `semaine.ouvrir`, `mois.ouvrir`, `conges.demande`, `reserves.liste`.
4. **Vague 4, la journée du salarié** : `jour.ligne_nouvelle` et `jour.ligne` (É), puis `jour.documents`, `jour.dupliquer`, `jour.envoyer`, `equipe.jour` (M), sur le modèle `afterScanPending`. Test d'écran sur téléphone 390 px et à 768 px.
5. **Fin** : le guide appelle `openLink` pour ses écrans (suppression des doublons AP:3242-3278 et PP:406-417), le test de couverture passe de « avertit » à « échoue ». Ne pas le faire plus tôt : le guide a ses propres tests d'écran (`test:guides-bureau-ecrans`) à ne pas casser en cours de route.

### 4.3 Ce qui n'est pas ouvrable, et pourquoi (alimente `RESERVE_HUMAIN`)

| Cible | Raison |
|---|---|
| Confirmations nées d'un clic (`eraseAsk` AP:4108, `verrouAsk` AP:1133, `confirmDel`, `liveAsk`, `pauseAsk`, `confirmCorrectOpen`, `lateOpen`, `undoCard` AP:1184) | Elles portent une fermeture (`go`) bâtie par le clic précédent ; les ouvrir seules n'a pas de sens. Pour le niveau 3, l'assistant ouvre la fenêtre qui précède (export, sélection, journée) et la personne clique. |
| Bouton « Exporter ▾ » et « Envoyer à {comptable} » (`demanderExport` AP:2825), « Clôturer », « Envoyer toutes les invitations », « Envoyer ma journée » | Niveau 3 validé par le patron : l'ouvreur prépare (période, mois, destinataires), le clic reste humain. |
| « Rouvrir » un mois (AP:1721) | Supprime la clôture sans confirmation : décision à prendre ; en attendant, niveau 3. |
| Appairage d'une tablette `/admin#borne=…` (`app/admin/layout.tsx:28-75`, `components/kiosk-pair-confirm.tsx`) | Sécurité : la personne lit 4 codes sur la tablette et touche le bon ; l'assistant n'a ni le jeton ni le code. |
| Retour Stripe `?subscribed=1`, écran de blocage d'essai (AD:94, AD:133,167), portail Stripe (`openPortal`, `company-settings.tsx:580`) | États du paiement : abonnement et paiement = niveau 3. L'assistant ouvre seulement « Choisissez votre abonnement ». |
| Accès support BEMEXO (`bureau-reglages.support`, `support-access.tsx`), droits d'accès / rôle | Droits d'accès : niveau 3. Ouvrir `reglages.entreprise` est libre, activer reste un clic. |
| Notifications (`notifications.activer`), caméra (scanner, enregistreur vidéo), sélecteur de photo | Permissions et gestes d'appareil : un lien « Ouvrir le scanner » peut être proposé (le toucher de la personne est le geste), jamais déclenché seul. |
| `/pointer`, `/borne`, `/support`, `/apercu/*`, pages publiques et d'accès | Jetons à usage unique, autre appareil, console du personnel BEMEXO, démos, ou page sans objet pour quelqu'un de connecté. |
| Menus ☰ / compte, légende (`legendOpen` AP:1061), bandeaux (aide de démarrage, astuce copie) | Pas des fenêtres : navigation du guide, infobulles. Raison écrite, entrée « interne ». |
| Console de la vidéo, lecteur, orphelines | Dans `formations.gestion` ; pas d'entrée propre. |

## 5. Le test de couverture : comment une fenêtre sans ouvreur est détectée

Un fichier Deno `supabase/functions/_shared/openers-coverage.test.ts`, lancé par `npm run test:ouvreurs`, avec la même lecture de sources que `admin-tours.test.ts:17-29` (parcours de `app/` et `components/`). Il est destiné à être **fusionné** avec le test de couverture des actions (même commande, mêmes entrées `RESERVE_HUMAIN`), pour qu'un oubli ne soit possible dans aucune des deux listes.

### 5.1 Les signaux (du plus sûr au plus heuristique)

1. **Modules fenêtres.** Expression `lazyWindow(?:<[^>]*>)?\(\s*\(\)\s*=>\s*import\('@/components/([\w-]+)'\)` et `dynamic\(\s*\(\)\s*=>\s*import\('@/components/([\w-]+)'\)`. Aujourd'hui : 22 modules `lazyWindow` + 7 modules `dynamic`. Chaque module doit figurer dans `composants` d'un ouvreur, ou dans `RESERVE_HUMAIN` (ex. `kiosk-pair-confirm`), ou dans une liste d'enfants explicites (`kiosk-fixed-qr` appartient à `borne.gestion`). Le panneau de l'assistant lui-même (`assistant-bureau`, `worker-assistant`) et la confirmation `export-verrou-dialog` vont dans `interne` avec leur raison.
2. **États d'ouverture.** Dans les fichiers de pages et d'écrans (AP, PP, PD, AD), les `useState` dont le nom finit en `Open`, `Target`, `Ask`, `Fiche`, `Worksite`, ou vaut `editing`, `statPanel`, `tour`, `openSlot`, `docsWs`, `confirmDel`… Chacun doit figurer dans `etats` d'un ouvreur ou dans la liste `interne` avec sa raison. Mesuré avec une expression de ce genre : 42 noms dans AP, 7 dans PP, 15 dans PD, 1 dans AD. Faux positifs connus : `openReserves` (compteur, AP:1026), `docsByWorksite` (tableau, AP:979), `addWorksite` (champ de formulaire) : ils vont dans `interne` (« compteur », « donnée »). Faux négatifs connus : `ficheWorker`, `copyFor`, `pendingAbsence`, `selectMode`, `editMeeting`, rattrapés par les signaux 1 et 3. Ce coût est voulu : un état de plus non classé fait échouer le test.
3. **Fenêtres dans le JSX.** `<(Dialog|AlertDialog|Sheet|Popover|DropdownMenu)\b[^>]*\bopen=\{([^}]+)\}` : l'identifiant (sans `!`, `!!`, `&&`) doit figurer dans `etats` d'un ouvreur ou dans `interne`. Il rattrape une fenêtre dont l'état n'est pas nommé « open » (`<Dialog open={!!pendingAbsence}` AP:4748). AP contient 16 `<Dialog` ; le menu ☰ a un `<Sheet` (`admin-mobile-menu.tsx:92`).
4. **Ancres `data-guide`.** On réutilise la fonction `anchors()` de `admin-tours.test.ts:40-50`. Dans un sens : toute ancre déclarée par un ouvreur (`ancres`) doit exister dans le code (le test des guides fait déjà ce contrôle, `:220`). Dans l'autre : toute ancre dont l'espace de nom est une **entrée de navigation** (`bureau-nav.*`, `menu.*`, `entete.*`, `journee.plus`, `bureau-clients.nouveau/importer/crayon`, `bureau-salaries.nouveau/importer/conges`, `bureau-invit.voir`, `bureau-stat.relance`) doit être revendiquée par un ouvreur ou classée « guide seulement ». Les ancres de champs et de boutons d'action (`.enregistrer`, `.creer`, `.supprimer`…) relèvent du registre d'actions.
5. **Vocabulaires historiques.** Chaque clé de `NAV_ACTIONS` (AC:37), de `WORKER_NAV` (WA:438), chaque `lien` de `GUIDE` et de `WORKER_GUIDE`, chaque valeur de `AdminScreen` (AT:25) et de `TourScreen` (WT:21) doit résoudre vers un id ou un alias du registre. Le test ne juge pas si le lien est le BON écran (`borne` → `planning` passerait par l'alias `planning.semaine`) : la vague 0 corrige les fiches à la main ; le test garantit seulement que ces vocabulaires ne divergent plus du registre.
6. **Routes.** Chaque `app/**/page.tsx` (26 aujourd'hui) est soit l'écran d'un côté (`/admin`, `/poseur`), soit dans `RESERVE_HUMAIN` avec sa raison.

### 5.2 Les contrôles inverses (le registre ne ment pas)

- Tout id déclaré doit avoir une implémentation enregistrée du bon côté : le test lit les clés passées à `registerOpeners({...})` (forme imposée : littéraux `'id': () => …` pour que l'expression régulière les voie). Id déclaré sans implémentation : échec, sauf `dette: 'AAAA-MM-JJ'` **futur** (la dette expire et le test échoue après cette date : pas de liste d'oubli silencieuse).
- Chaque id a au moins 2 phrases françaises et 1 turque dans le jeu d'évaluation (`assistant-eval`), avec la catégorie « Ouvrir » (bureau, salarié). Seuil de la vision : 90 % par catégorie.
- Un passage d'écran sur la vraie page (`scripts/tests/*.mjs` sur `out/`, comme `guides-bureau-lot7.mjs`) à 1280 px et 390 px : pour chaque id, `openLink` fait apparaître `role="dialog"` ou la vue attendue, sans écriture réseau (liste blanche des lectures, comme dans ce script).

### 5.3 Cas négatifs à tester

Un salarié demande « ouvre les réglages de l'entreprise » : pas de lien du bureau ; un id inventé, `guide:constructor`, `ouvrir:__proto__` : rien ; un lien du bureau collé dans un chat du salarié : refusé par `openLink` ; un formulaire ouvert avec de la saisie : `occupe`, la saisie est intacte ; `cloture.mois` avec un mois hors de `closableMonths` : refus ; `planning.imprimer` à 390 px : message, pas de fenêtre ; une fonction absente (`versionsOn` faux) : « pas activée chez vous ».

### 5.4 Limites du test (à dire clairement)

Il ne comprend pas le sens, il lit des noms et des formes. Angles morts connus : un formulaire en ligne qui n'est ni une fenêtre ni un composant différé (la carte « Lever la réserve », `liftingId` PD:594 et PD:2443) échappe aux trois premiers signaux : il relève du registre d'actions (`lever_reserve`), pas des ouvreurs ; une fenêtre bâtie sans `Dialog`/`Sheet`/`Popover` de la bibliothèque passerait aussi. Atténuation : les signaux 1 et 3 couvrent aujourd'hui toutes les fenêtres que j'ai relevées (par exemple `pickStart`, PD:3035, est un `<Dialog open={pickStart}>`) et le passage d'écran (§5.2) ferme le reste. Dans PD, les états `*Ask`, `*Open`, `openSlot`, `docsWs`, `confirmDel`, `pickStart` sont tous lus par le test : chacun a un ouvreur (éditeur, documents, duplication, envoi) ou une raison écrite (confirmations, §4.3).

## 6. Points à vérifier ou à décider

- **À vérifier sur appareil** : le lien « Clients » entre 641 et 1023 px (§1.4, point 5) ; `window.print()` lancé sans geste après les attentes asynchrones de `startPrint` (AP:1270-1283), surtout sur iPhone (le commentaire AP:1268 dit que `print()` y rend la main tout de suite) : sinon l'ouvreur d'impression ouvre le menu pré-rempli et la personne touche « Imprimer » ; l'acceptation d'une prop `init` par `StaffEmailDialog` ; la période de `TeamStats`.
- **À décider avec le patron** : ouverture automatique ou bouton (§2.5) ; ouvrir `borne.gestion` (le code s'affiche à l'écran de la personne, jamais au modèle ; `ia-v2.md:257` range pourtant « Accès support, borne » parmi les actions non branchées, pour la même raison de sécurité) ; « Rouvrir un mois » en niveau 3 ; ouvrir en nouvel onglet la page `confidentialite` depuis l'assistant.
- **Non traité ici** : le sens des ouvreurs pour un compte en session de support (lecture seule, `enModeSupport`, AP:2830) : les fenêtres s'ouvrent, la base refuse les écritures ; les traductions turques des libellés de boutons (restent français, `ia-v2.md` §G).
