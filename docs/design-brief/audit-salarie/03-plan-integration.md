# Audit adverse — plan d'intégration chiffré du dossier salarié

Mission « plan d'intégration chiffré » · 15 octobre 2026 · auditeur adverse (ce qui est faux, manquant ou impossible à intégrer ; pas de félicitations). Complète `01-couverture.md` (couverture S1 à S104) : je ne refais pas ce travail, je le cite quand un de ses constats pèse sur l'intégration.

**Audité** : `README.md` (279 l.), `tokens.css` (117 l.), `donnees-exemple.ts` (92 l.), planche `BEMEXO Salarié - Dossier.dc.html` (568 l., 39 écrans ; son script de données lu comme du texte, jamais exécuté), `support.js` (60 ko, moteur de la planche, non lu).
**Comparé à** : `app/poseur/page.tsx` (683 l.), `components/poseur-day.tsx` (3 086 l., lu en entier), `live-timer.tsx`, `missions-worker.tsx`, `worker-reserves.tsx`, `pause-picker.tsx`, `poseur-week/month/history/trainings.tsx`, `team-day.tsx`, `assistant-panel.tsx`, `worker-assistant.tsx`, `worker-draft-card.tsx`, `guide-tour.tsx`, `lib/types.ts`, `lib/offline-store.ts`, `lib/offline-sync.ts`, `lib/lazy-window.tsx`, `lib/live-session.ts`, `lib/company-settings.ts`, `supabase/functions/_shared/worker-tours.ts`, `day-part.ts`, le registre IA (`_shared/registre/`), `scripts/tests/*.mjs`, `scripts/bundle-budgets.json`, `docs/design-brief/integration-technique.md` et `fonctions-salarie.md`.
**Unités** : kB = 1 000 octets ; « gz » = gzip niveau 9 ; **agent-heure** = une heure de travail d'un agent (écriture, build, rejeu des tests), relecture humaine non comprise. Toutes les mesures sont refaites ici (méthode et fichiers au §9) ; une mesure qui n'a pas pu être faite est dite.

---

## 0. Verdict en douze lignes

1. **Le dossier ne contient aucun composant.** Le zip a 5 fichiers (README, `tokens.css`, `donnees-exemple.ts`, la planche, `support.js`) : 0 fichier TSX, 0 classe `dz-…`, aucun attribut `data-*` dans la planche (tout est en style en ligne). Le README (§5, §9) annonce pourtant 34 composants « dans `components/design/salarie/` » : ce dossier n'existe pas. L'intégration devra **écrire** ≈ 4 600 lignes de TSX et ≈ 2 500 lignes de CSS à partir de la planche (§1.1).
2. **Le poids tient dans le plafond, à une condition** : mettre le CSS dans des fichiers `.css`. `/poseur` pèse **336,5 kB** (plafond 345, marge 8,5). Le CSS écrit dans le TSX pèse déjà ≈ 10 kB gz dans ce chiffre ; un nouveau design écrit de la même façon ajouterait ≈ 9 kB gz et ferait passer la page à ≈ 355 kB (dépassement). En `.css` + chargement différé du calendrier, des documents, de l'équipe et des formations, `/poseur` descend à **≈ 305–320 kB** (§3).
3. **Les requêtes n'ont aucune marge** : `/poseur` fait **18 requêtes de données au chargement pour un plafond de 18** (`requetes-lot29.mjs:27`), chaîne de 2 pour un plafond de 2 (mesuré ici). La bande des 7 jours peut se calculer **sans requête de plus** (lectures de `fetchPending` élargies), mais le nom de l'entreprise exigé par la page « Plus » (E26) n'est pas lu côté salarié (§1.4).
4. **Deux tests de couleur échouent avec les teintes du dossier** : créneaux matin/soir ΔE 11,2 pour un minimum de 15 (`day-part.test.ts:103`) ; bordure de réunion `#D6457A` sur `#FBE0EA` à 3,40:1 pour un minimum de 4,5:1 (`missions.test.ts:232`). Les valeurs du code, elles, passent (§1.6).
5. **Repères** : 31 scripts navigateur visent `/poseur` (19 659 lignes) et 16 dépendent fortement des repères à remplacer. Le README en nomme 17 et se trompe sur 8 d'entre eux (`data-bub`, `data-creneau`, `data-withdrawn`, `data-live`, `.bt-err`, `role=button` n'existent pas sur la carte ou la bande, `data-day` n'existe que dans `TeamDay` ; `.bt-timecard` désigne les boutons Début/Fin de l'éditeur, pas la carte de pointage). Les vrais repères : **50 `data-testid`, 43 classes lues, 26 `data-guide`, 7 `data-guide-confirm`**, + **60 clés du registre IA** qui visent ces fichiers et leurs variables d'état (§2).
6. **Risques techniques majeurs** : éditeur et « + » qui doivent marcher sans réseau alors qu'il n'existe aucun cache (§4 R1) ; feuille du bas + clavier iOS (R5) ; guide pas à pas et textes de l'assistant qui disent « touchez votre nom » (R7, R8) ; décalage de version entre le site statique et les fonctions Edge de l'assistant (R8).
7. **Surface utile perdue** : en-tête fixe 176 px + barre 150 px (chiffres du README) laissent **518 px** sur 390×844 (avant : 690 px, 752 px en-tête caché) et **314 px** sur 360×640 (avant : 486 / 548). Seul 390×844 est dessiné (§4 R3).
8. **Plan** : 12 étapes, dont les trois premières **sans aucun changement visible** (alléger, extraire la logique pure, séparer modèle et vue) et qui rendent de la marge même si le design n'est jamais livré. Mise en ligne derrière `?ui=2` (aperçus seulement) puis, si le patron le veut, un réglage par entreprise (§5).
9. **Effort : 107 à 154 agent-heures** (≈ 130 au milieu), dont ≈ 22 à 34 dépendent de la vague 2 du designer (Mois, Historique, congés, documents, formations : étapes 10 et 11). Chemin critique 69 à 98 h si la vague 2 arrive avant la fin de l'étape 3 ; 2 à 3 voies en parallèle possibles à partir de l'étape 3.
10. **On peut avancer avant la vague 2** : étapes 0 à 9 (≈ 85 à 120 h) ; l'état mixte ancien/nouveau (Mois, Historique, congés, documents, formations, informations, scanner restent à l'ancien style dans la nouvelle coque) est tolérable pour des testeurs, **pas pour tous les salariés** (§5.5).
11. **Contrainte externe** : l'IA étape 3a-1 (en cours, non fusionnée) ajoute un job CI « Registre de l'assistant » qui bloquera les PR sur les clés de code ; chaque étape du redesign doit mettre à jour `surfaces-salarie.ts` dans la même PR (§2.4).
12. **Décisions du patron** : cinq, au §6.

---

## 1. Cartographie composant → code, props ↔ types réels

### 1.1 Ce qui est livré, mesuré

| Fichier | Taille | Contenu réel |
|---|---|---|
| `README.md` | 21 457 o, 279 l. | liste S1–S104, tableau de 28 lignes de composants (§5) + 4 composants d'assistant (§9) = **34 composants** (la ligne `QuestionPrevu / QuestionPause / QuestionDixHeures` en vaut 3), libellés déplacés, règle de la frise, tailles |
| `tokens.css` | 4 877 o, 117 l. | **variables seulement** (couleurs, rayons, espacements, durées) scopées `.dz-salarie`, `.bt-skin.dz-salarie` ; aucune classe de composant |
| `donnees-exemple.ts` | 6 278 o, 92 l. | types `EtatLigne`, `EtatJour`, `EtatEnvoi`, `Ligne`, `Jour` et un jeu par écran |
| `BEMEXO Salarié - Dossier.dc.html` | 75 782 o | 39 écrans en **style en ligne** dans un format de gabarit propriétaire (`x-dc`, `sc-for`, `sc-if`) ; ni classe, ni `data-*` |
| `support.js` | 60 151 o | moteur de la planche (charge React et Babel depuis un CDN) : **ne pas livrer** |

Conséquence : le « gabarit de l'intégration » (`integration-technique.md` §2.1, §2.3 : TSX présentationnel, jetons en classes `dz-`) **n'est pas respecté**. Ce qui est utilisable : la liste des props (README §5), les jeux de données, les valeurs de style lisibles dans la planche, `tokens.css`. Le reste est à écrire.

Volume à écrire (estimé par composant, §5.6) : ≈ 1 380 lignes pour la coque et la journée (15 composants), ≈ 1 210 pour les feuilles (11), ≈ 590 pour Semaine, Plus et Mon équipe, ≈ 220 pour `/pointer`, ≈ 735 pour l'assistant, ≈ 440 de colle (états, bande, frise, aide d'envoi, indicateurs) = **≈ 4 575 lignes de TSX**, plus ≈ 2 500 lignes de CSS et ≈ 300 lignes de tests unitaires.

### 1.2 Cartographie des 34 composants

Action : **REMPLACE** (le balisage actuel disparaît, la logique reste), **ENVELOPPE** (le composant actuel reste, restylé), **AJOUTE** (rien d'équivalent), **DÉPLACE**. Lignes = code actuel.

| # | Composant du dossier | Zone actuelle | Action | Écart notable avec le réel |
|---|---|---|---|---|
| 1 | `EnteteJournee` | `page.tsx:534-616` (logo, date ou flèche retour, scanner, identité + `DropdownMenu`) ; `poseur-day:2588` (bouton ✨) | REMPLACE | le ✦ vient de la barre du bas, le scanner part dans la barre, l'avatar ouvre « Plus » ; `initiales` à calculer (l'exemple dit « SG » pour Sam Exemple) |
| 2 | `BandeJours` | aucune (la flèche `page.tsx:541` et le bandeau `page.tsx:463-499` en font une partie) | AJOUTE | 8 états à dériver de 5 lectures, **sans requête de plus** possible (§3.6) |
| 3 | `NoteEntete` | `poseur-day:2130-2144` (`bt-net`), `page.tsx:509-526` (`offlineBanner`), `463-499` | REMPLACE | 3 tons ; pas de ton pour « Envoi en cours… » (`bt-net-sync`, `poseur-day:2139`) |
| 4 | `Rappels` | `page.tsx:463-503`, `worker-reserves.tsx:80`, `TrainingsBanner` (`poseur-trainings.tsx:72`) | REMPLACE les bandeaux, ENVELOPPE `WorkerReserves` (liste et formulaire non dessinés) | props = **nombres** ; le réel passe des listes (`WorkerReserve[]`, `string[]`) |
| 5 | `CartePointage` | `live-timer.tsx:118-258` ; carte `card-live` `poseur-day:2278-2291` | REMPLACE le rendu, GARDE `stop`, le tick et `finLendemain` | `ecoule` = texte `2:42` ; le code tourne à la seconde (`0:47:01`) et un test mesure que **seul** `.bt-lt-el` bouge (`salarie-lot10.mjs:129-130`) |
| 6 | `TuilesJour` | `poseur-day:2180-2237` (`bt-total` + `bt-stats`) | REMPLACE | pas de prop pour la **valeur** des pauses (`0:30` en dur dans la planche), ni chantiers, ni route (`01-couverture` PB04) |
| 7 | `MiniFrise` | rien | AJOUTE + `friseAxe()` à écrire | types de segments incomplets (§1.5) |
| 8 | `CarteChantier` | `poseur-day:2278-2503` (5 sortes de cartes : en cours synthétique, prévu, ligne, retirée, sur le téléphone) | REMPLACE | état unique à dériver de 5 sources (§1.4) |
| 9 | `TrouRoutePause` | `poseur-day:2256-2272` + `computePauses` (178-201) | REMPLACE | convention inverse : la réponse est stockée sur la ligne **suivante** (`key`), le dossier dit `apresLigne` |
| 10 | `CarteReunion` | `missions-worker.tsx:101-117` | REMPLACE | `heure` simple ; le réel a début, fin, lieu, `all_team` |
| 11 | `ListeTaches` | `missions-worker.tsx:120-148` | REMPLACE | les tâches de l'exemple n'ont **pas d'`id`** alors que `onCocher(id)` en exige un |
| 12 | `JourneeVide` | `poseur-day:2506-2515` | REMPLACE | — |
| 13 | `MessageEtat` | `poseur-day:2247-2252` (renvoi), `2545-2553` (note), `2824-2838` (fenêtre « Mois clôturé ») | REMPLACE | la fenêtre `lateOpen` devient un bandeau (`01-couverture` PB16) |
| 14 | `BarrePouce` | `poseur-day:2556-2592` ; scanner `page.tsx:548-552` | REMPLACE | `EtatEnvoi` n'a que 5 valeurs, la planche en dessine 6 (`SEND.spin`) ; l'aide est une phrase à choisir (§1.5) |
| 15 | `OngletsBas` | `page.tsx:55-65, 598-603` (menu déroulant) | REMPLACE | `Historique` et `Formations` quittent la navigation (→ « Plus ») |
| 16 | `EditeurIntervention` | `poseur-day:2595-2804` (`div` fixe z-40, **pas** Radix) | REMPLACE le corps, GARDE `PausePicker`, `TimeCylinder`, `ChantierDocuments` | le dossier ne dessine ni le réglage de l'heure, ni l'état clavier ouvert |
| 17 | `ChoixChantier` | `poseur-day:2607-2673` | REMPLACE | « Autre chantier » toujours proposé = **changement de règle** déclaré par le README (S18) |
| 18-20 | `QuestionPrevu`, `QuestionPause`, `QuestionDixHeures` | `plannedAsk` `2855-2877`, `pauseAsk` `2881-2904`, `confirmOpen` `2907-2921` | ENVELOPPE (le `<Dialog open>` reste dans `poseur-day`, §2.4) | compteur « n/3 » faux, pause présélectionnée (`01-couverture` PB06, PB07) |
| 21 | `JourneeDejaEnvoyee` | `confirmCorrectOpen` `2841-2852` | ENVELOPPE | — |
| 22 | `PointageEncoursConflit` | `liveAsk` `2957-3012` | ENVELOPPE | 1 cas sur 6 dessiné ; la consigne borne disparaît (`01-couverture` PB05) |
| 23 | `LeverReserve` | `worker-reserves.tsx` (liste + fenêtre), `reserve-lift-form.tsx`, carte `poseur-day:2431-2456` | ENVELOPPE | état « levée » sur la carte et liste non dessinés (`01-couverture` PB14) |
| 24 | `DupliquerJournee` | `repeatOpen` `2807-2821` (`Calendar` = react-day-picker) | REMPLACE | le calendrier devient des puces de dates : **retire react-day-picker du premier chargement** (≈ 10 kB gz) |
| 25 | `VueSemaine` | `poseur-week.tsx` (395 l., différé) | REMPLACE | pas de navigation de semaine (`01-couverture` M3) |
| 26 | `PagePlus` | `page.tsx:564-613` | REMPLACE | **le nom de l'entreprise** (kicker E26) n'est pas lu côté salarié (§1.4) |
| 27 | `MonEquipe` | `team-day.tsx` (357 l., lit et écrit Supabase) | REMPLACE, **DÉPLACE** de la Journée vers « Plus » | séparer logique et vue ; Corriger/Envoyer par page au lieu de par ligne |
| 28 | `PagePointer` | `app/pointer/page.tsx` (352 l.) | REMPLACE | `refus.raison: 'QR expiré'` + `ticketConnu` = combinaison impossible (`01-couverture` PB09) |
| 29 | `AssistantPanneau` | `assistant-panel.tsx` (765 l., **partagé avec le bureau**) | ENVELOPPE (variante) | « 18 questions restantes » passe du pied à l'en-tête |
| 30 | `AssistantHistorique` | `assistant-panel.tsx:471-483, 586-770` | ENVELOPPE | historique **déjà en service** avec d'autres libellés (`01-couverture` PB10) |
| 31 | `AssistantPastille` | rien | AJOUTE + API de préremplissage | **nouvelle fonction** (§4 R9) |
| 32 | `CarteActions` | `worker-multi-card.tsx` (539 l.), `worker-action-card.tsx` (493), `worker-draft-card.tsx` (224) | ENVELOPPE | ces cartes portent 29 + 4 + 2 `data-testid` statiques (+ 9 dynamiques) |

(33 et 34 = les deux autres `Question…` de la ligne 18-20.) **Non remplacés par le dossier, donc conservés en l'état** : Mois (`poseur-month.tsx`, 113 l.), Historique (306), Formations (228) et son lecteur, Mes congés (`leave-request-dialog.tsx`, 187), Documents du chantier (`chantier-documents.tsx`, 456), Informations (`page.tsx:642-652`), lecteur de QR (`qr-scanner.tsx`), `GeoInfoDialog`, guide pas à pas (`guide-tour.tsx`), `PausePicker`, `TimeCylinder`, `TimeField`, `TermineLe`, et trois fenêtres que le dossier ne dessine pas : « Retirer ce chantier ? » (`poseur-day:2924-2952`), « Envoyer votre journée maintenant ? » (`3015-3030`), « Mois clôturé » (remplacée par un bandeau).

**Code mort à retirer en passant** : `canStartLive = false as boolean` (`poseur-day:1833`) rend inatteignables `startOnCard` (1970-1995), `startButton` (1998-2010), le bloc « Je commence sur un autre chantier » (2526-2533), la fenêtre `pickStart` (3032-3060) et `GeoInfoDialog` (3062-3071), soit ≈ 150 lignes et 3 états (`starting`, `geoAsk`, `pickStart`).

### 1.3 Les props du dossier collent-elles aux types réels ? Non, aucune

Les types de `donnees-exemple.ts` sont des **modèles de vue**, pas les types de `lib/types.ts`. Aucun composant ne peut recevoir directement `TimeEntryWithWorksite`, `Planning`, `PendingEntry` ou `OwnLiveSession`. Il faut une couche d'adaptation (§1.5) et des tests unitaires dessus (Deno, comme `day-hours.test.ts`).

### 1.4 Écarts de forme, un par un

| # | Donnée du dossier | Réel (preuve) | Conséquence |
|---|---|---|---|
| 1 | `Ligne.etat` : 8 valeurs | aucun champ unique : `status` + `locked` + `exported_at` (badge sur `locked` seul, `poseur-day:2343-2349`), `exit_forgotten`, file `localStorage`, carte « prévu », chrono ouvert | fonction `etatLigne()` à écrire ; règle à trancher pour `validated` non verrouillé (aucun badge aujourd'hui) |
| 2 | `EtatLigne` n'a pas `refus` ni `renvoye` | la planche dessine « CHEVAUCHEMENT » (E11) et « À CORRIGER » (E14) (`ST.refus`, `ST.renvoye`) | le type du dossier ne peut pas typer sa propre planche |
| 3 | `debut/fin` = `'07:30'`, `fin: null` pour « fin à compléter » | la base donne `07:30:00` ; une sortie oubliée sans fin a **`end_time = start_time`** (`isExitToComplete`) | adaptateur ; sinon la frise trace 24 h (§1.5) |
| 4 | `correction` : un objet `{ par, avant, apres, motif }` | une **liste** de corrections, de deux sources (`time_entry_corrections` : `corrected_by_role 'admin'\|'lead'` ; `time_entry_edits` : `diffLabels(...)` qui peut parler de pause ou de chantier, pas seulement d'heures), triées par date (`poseur-day:2372-2397`) | `corrections: Correction[]` et `avant/apres` générés par `diffLabels` |
| 5 | `endroitNote: boolean` | le code affiche heure, **coordonnées et précision** (« mêmes chiffres que le bureau », `poseur-day:2398-2430`) | le dossier réduit à « Endroit noté » ce qui est aujourd'hui une transparence voulue (anciennes lignes seulement : `fonctions-salarie.md` O11) |
| 6 | `erreur: string` (E19 : « Refusé par le serveur : jour clôturé », « 5 essais sans réussite ») | `PendingEntry.lastError` = `error.message` **brut** de PostgREST (`offline-sync.ts:201`) ; `attempts` ; `MAX_ATTEMPTS = 5` | `raisonEchec(entry)` à écrire (réutiliser les regex d'`explainWriteError`, `poseur-day:669-693`) |
| 7 | `transfertEchec { date: '14/10', nombre }` | les refus portent sur **plusieurs jours** (`blocked[].work_date`), le toast actuel les joint (`poseur-day:891`) | `dates: string[]` |
| 8 | `Jour.etat` : une valeur parmi 8 dont `aujourdhui` | « aujourd'hui » **n'exclut pas** « envoyé / à envoyer / clôturé / absence » (la planche dit « la pastille reprend l'état du jour », `SS.T`) ; « jour affiché » absent du type (`01-couverture` PB11) | deux axes : `estAujourdhui`, `estAffiche` + `etat` ; règle de priorité oublié / renvoyé / clôturé |
| 9 | `EtatEnvoi` : 5 valeurs | la planche en dessine 6 (`SEND.spin` « Envoi… ») ; l'aide (« LE POINTAGE EN COURS NE PART PAS ») est codée en dur sur 8 écrans où elle est fausse (`01-couverture` M1) | `aideEnvoi(etat, contexte)` à écrire, 6 phrases |
| 10 | `trous[].apresLigne: 'l1'` | la réponse route/pause vit sur la ligne **qui suit** le trou (`gap_before`, `setGapKind` `poseur-day:840`) ; clé `e:`/`pe:` + id | traduction d'id dans les deux sens |
| 11 | `taches[]` sans `id` | `DayTask { id, text, part, start_time… }`, `toggle(t)` | ajouter `id` |
| 12 | `reunions[].heure: '17:15'` | `Meeting { start_time, end_time, place, all_team }` + `meetingsFor` (filtrage par participant) | `fin?` existe dans les props du README mais pas dans l'exemple |
| 13 | `rappels { journeesAEnvoyer: [{date}], reservesALever: 1, formationsAVoir: 2 }` | listes réelles (`toSend`, `WorkerReserve[]`, `trainings.unseen`) ; relecture sur **60 jours** (`page.tsx:227`) | la bande n'en montre que 7 : « N journées à envoyer » (S47) reste à dessiner |
| 14 | `salarie.role: 'poseur'`, `entreprise: 'Entreprise Test'` | `UserRole = 'admin' \| 'lead' \| 'worker'` ; **`companies.name` n'est pas lu côté salarié** : la lecture est limitée à 5 colonnes (`company-settings-core.ts:37-52`) et un test l'exige (`requetes-lot29.mjs:30, 394`) ; `auth-provider` ne charge pas l'entreprise | E26 (kicker « ENTREPRISE TEST · POSEUR ») impose d'ajouter une colonne et d'adapter le test, ou de renoncer au nom |
| 15 | `pointer.refus { raison: 'QR expiré', ticketConnu: true }` | un QR expiré n'a **pas** de ticket (`app/pointer/page.tsx:239-243`) ; phases `refused` et `error` distinctes | combinaison impossible (`01-couverture` PB09) |
| 16 | `chefEquipe.coequipiers: ['Alex', …]`, `jours` ISO | `TeamDay` travaille avec des ids de salariés ; formulaire d'ajout absent du dessin | ids dans les props ; formulaire à dessiner |
| 17 | `enCours.total: '6:42'` | minutes entières + `fmtHM` ; format `4:00` ici, `4h00` en Semaine, Mois, Historique et éditeur (`formatMinutesToHours`) | deux formats cohabitent dans l'état mixte (§5.5) |

### 1.5 Calculs que le dossier suppose faits ailleurs

À écrire, purs, testés en Deno (aucun n'existe) :

1. **`etatLigne()`** (ligne 1) et **`etatJour()`** (8 états de la bande, avec priorité).
2. **`bandeJours(planning, entrees, clotures, jourAffiche, aujourdhui)`** : lundi → dimanche ; absences (lettre C/M/I/R), clôture (mois ou salarié), renvoi (`status = 'draft'` et `submitted_at` non nul : la base interdit au salarié de repasser une ligne en brouillon, `poseur-day:687`), oubli (union `toSend`, `page.tsx:449`).
3. **`friseAxe(segments, maintenant, baseEntreprise)`** et **`friseSegments(...)`** : lignes notées, chrono (fin = maintenant), prévu non couvert (`plannedTodo`), trous (`askableGaps`), chevauchement sur deux pistes.
4. **`aideEnvoi()`**, **`raisonEchec()`**, **`kicker()`** (AUJOURD'HUI / RENVOYÉE / jour de la semaine / ERREUR), titre « Semaine 42 » (semaine ISO), « 31:30 ENVOYÉES » (la planche affiche 31:30 pour 16:00 : `01-couverture` M3).
5. **`corrections()`** à partir des deux journaux.

**La règle de la mini-frise (README §7), réimplémentée ici et essayée** (`work-plan/frise-proto.mjs`) :

| Cas | Axe obtenu | Verdict |
|---|---|---|
| ordinaire 07:30–11:30, 12:30–15:12, prévu 15:12–17:00 | 06:00 → 18:00 (12 h) | conforme au dessin |
| un seul créneau 12:00–13:00 | 08:00 → 16:00 (8 h) | largeur minimale tenue |
| nuit 21:00–01:00 puis 01:30–05:30 | 20:00 → 07:00, « minuit » au milieu | conforme |
| nuit 20:00–07:00 | 19:00 → 08:00 | conforme |
| aucune ligne | base entreprise (08:00–17:00 en dur dans la planche) | **l'horaire de base n'existe pas dans le code** : seul `weekly_hours` (heures **par semaine**), jamais lu côté salarié |
| **sortie oubliée `08:00 → 08:00` (réel : fin = début)** | **07:00 → 09:00 mais segment de 24 h : axe de 26 h** | **la règle `e <= s ⇒ e += 24 h` casse** ; avec une ligne 07:30–11:30 en plus : axe de 27 h |
| heures pile (début 08:00, fin 17:00) | ambiguïté « l'heure pleine qui précède » : 08:00 ou 07:00 | pas de vecteur de test dans le dossier |

Types de segments : le README en liste 5 (`fait`, `a-envoyer`, `en-cours`, `prevu`, `trou`) ; la planche en utilise 6 (`envoyer`, `cours`, `conflit` + `lane`) sous d'autres noms, et **8 états de ligne** existent (comptable, retiré, sur le téléphone, sortie oubliée : aucune correspondance dite). Le trou **répondu** (« pause », « route ») n'a pas de rendu. `de` et `a` des données d'exemple (`07:30`, `17:00`) sont le premier début et la dernière fin, **pas** les bornes d'axe (06:00, 18:00).

### 1.6 Teintes : ce que disent les tests, calculé

Le dossier demande de « repasser dans `test:creneaux` » (README §10.1). C'est fait ici, avec les formules des tests (WCAG, CIE76) :

| Mesure | Dossier | Seuil du test | Code actuel |
|---|---|---|---|
| ΔE matin / soir | **11,2** | ≥ 15 (`day-part.test.ts:103`) | 19,1 |
| ΔE matin / après-midi, après-midi / soir | 22,9 ; 24,4 | ≥ 15 | 25,8 ; 31,6 |
| titre `#15120F` sur chaque teinte | 14,2 à 15,4 | ≥ 7 | ok |
| `#5B534A` sur chaque teinte | 5,75 à 6,23 | ≥ 4,5 (encre du code `#57524A` : 5,90 à 6,40) | ok |
| ΔE après-midi / jour J `#FFF6DB` | 8,6 | ≥ 8 (`:105`) | ok (limite) |
| ΔE soir / réunion `#FBE0EA` | 10,2 | ≥ 10 (`missions.test.ts:239`) | ok (limite) |
| **bordure réunion `#D6457A` sur `#FBE0EA`** | **3,40** | **≥ 4,5 (`missions.test.ts:232`)** | `#9E2A55` sur `#F9D6E0` : 5,39 |

Seul le **soir** s'éloigne vraiment du code (ΔE 7,0) ; matin (1,8) et après-midi (2,6) sont indiscernables. Autres contrastes lus dans le dossier (texte ≥ 12 px, AA = 4,5) : `#8A7F70` sur `#F2EDE3` **3,36** (`--dz-texte-3`), `#9C907E` sur `#F2EDE3` **2,68** (trait « prévu »), blanc sur `#2FA36B` **3,20** (étiquette ENVOYÉ ✓, 12 px), `#8A7F70` sur `#1F1B17` **4,36** (bande clôturée), jour « rien de prévu » à opacité .45 : ≈ 3,7.

---

## 2. Les repères à conserver

### 2.1 Combien il y en a (fichiers à remplacer : `page.tsx`, `poseur-day.tsx`, `live-timer.tsx`, `missions-worker.tsx`, `worker-reserves.tsx`, `termine-le.tsx`, `pause-picker.tsx`, `time-field.tsx`)

| Repère | Total | Lus par au moins un script | Détail |
|---|---|---|---|
| `data-testid` statiques | **50** (+ dynamiques : `card-planned/card-live`, 9 préfixes de `PausePicker`, 2 de `TimeField`) | **44** | page 3, poseur-day 32, live-timer 3, missions 7, réserves 4, termine-le 1 |
| classes `.bt-*` | 26 + 114 + 15 + 12 + 8… | **43** | page 7, poseur-day 33, live-timer 2, pause-picker 1 |
| `data-guide="…"` | 26 valeurs statiques + 4 par `MENU_GUIDE` + 3 dynamiques | 26 | 44 cibles de guides au total, voir ci-dessous |
| `data-guide-confirm` | **7** dans `poseur-day` (+ 2 dans `guide-tour`) | — | le dossier en nomme 5 (manquent « Retirer » et « Envoyer maintenant ») |
| `aria-label` lus | 7 | 7 | « Mon compte et menu » (**12 scripts**), « Panier repas », « Ajouter un chantier » (3), « Retirer ce chantier » (2), « Assistant BEMEXO », « Informations », « Total des pauses (h:mm) » |

**Les 44 cibles de guide** (`worker-tours.ts` : 23 fiches, 65 étapes) : 9 dans `page.tsx` (`menu.compte`, `menu.photo`, `menu.conges`, `menu.infos`, `menu.notifications`, `menu.semaine`, `menu.historique`, `entete.scanner`, `infos.fermer`) → **toutes bougent ou disparaissent** ; 18 dans `poseur-day` ; 1 dans `live-timer` ; 3 dans les réserves ; 5 dans `team-day` ; 1 en Semaine ; 7 restent intactes jusqu'à la vague 2 (`conges.faire/type/envoyer/annuler`, `docs.photo`, `docs.envoyer`, `historique.jour`). **7 fiches commencent par « Touchez votre nom, en haut à droite »** (`MENU`) et 7 étapes demandent l'écran `'menu'` : ce menu n'existe plus dans le dossier.

### 2.2 Ce que le dossier nomme, et ce qui est faux

README §5, colonne « Repères à garder » : 17 repères cités.

Sur ces 17 : **8 correspondent à un repère salarié existant** (`.bt-total` : 27 scripts, `.bt-send` : 12, `data-guide="journee.envoyer"`, `.bt-ed` : 12, `.bt-save` : 7, `data-guide-confirm`, `#kx-pass`, et `.bt-timecard` : 6 scripts mais **sur les boutons Début/Fin de l'éditeur**, pas sur la carte de pointage où le README le met) ; **2 sont des renvois génériques** (« `data-guide` actuels de l'en-tête et du menu du compte », « entrées du menu du compte actuel ») qui n'en nomment aucun ; **7 n'existent pas là où le dossier les place** :
- `data-bub`, `data-creneau`, `data-withdrawn` : 0 occurrence dans `poseur-day`, `poseur-week`, `live-timer`, `page` (ce sont les bulles du planning du bureau) ;
- `data-live` : `admin-planning.tsx:499, 3970` seulement ; `.bt-err` : pages de connexion, d'inscription et de mot de passe ;
- `data-day` : `team-day.tsx:272` (boutons de jour du chef) et la feuille imprimée, **pas** sur la journée ;
- `role=button` : les cartes sont des `div onClick` sans `tabIndex` (`poseur-day:2298, 2334`) : le dossier l'**ajoute**, ce qui est bien (clavier, lecteur d'écran), mais le présente comme un repère « à garder ».

Se trompent donc sur 8 : les 7 inexistants + `.bt-timecard`. **Non cités du tout** : 44 `data-testid`, 41 classes lues, 24 ancres.

### 2.3 Table ancien → nouveau à demander au designer (regroupée ; la liste exhaustive est en annexe A)

| Repère actuel | Lu par | Devenir probable | À demander |
|---|---|---|---|
| `.bt-phdr`, `.bt-phdr-date` | 2, 1 (`guides-lot7:358`) | en-tête, titre = date | garder les deux classes |
| `.bt-phdr-back` | `formations-lot6:730, 768` | disparaît (jour jaune de la bande) | dire comment revenir de Formations / Historique |
| `aria-label="Mon compte et menu"`, `role=menu`, `menuitem` | 12 / 7 / 11 | disparaît (avatar → page Plus) | nouvel `aria-label` de l'avatar ; liste des lignes de Plus |
| `data-guide` `menu.compte/photo/conges/infos/notifications` | `guides-lot7` | lignes de la page Plus | ancres sur les lignes de Plus |
| `data-guide` `menu.journee/semaine/mois/historique` | 2 fiches (`planning`, `historique`) | onglets du bas ; Historique dans Plus | ancres sur les onglets |
| `scan-open` + `entete.scanner` | 2 scripts + 2 fiches (`pointer`, `borne`) | bouton `QR` de la barre | garder les deux sur le bouton |
| `dock-assistant` + `journee.assistant` | **9 scripts** | ✦ de l'en-tête | garder les deux |
| `.bt-fab`, `journee.plus` | 4 scripts | `+` (56 px) | garder |
| `.bt-send` ×5 états + `journee.envoyer` | 12 scripts | 6 états | garder, ajouter l'état « Envoi… » |
| `.bt-total`, `.bt-total-big`, `.bt-stats`, `.bt-stat(-n)`, `journee.panier`, `panier`, `total-prevu` | 27 / 2 / 7 | tuiles TOTAL, PAUSES, PANIER | `.bt-total` sur la tuile TOTAL ; `.bt-stat` sur chaque tuile |
| `card-entry`, `card-planned`, `card-live`, `card-exit-forgotten`, `card-office-edit`, `card-reserve`, `card-lift`, `day-returned`, `heure-exacte` | **13 scripts** pour `card-entry` | cartes | un `testid` par état d'étiquette ; `journee.chantier` et `journee.sortie-oubliee` sur la carte |
| `.bt-gap`, `.bt-gap-b`, `journee.trou` | 1 script | ligne orange Route / Pause | garder |
| `.bt-ed`, `.bt-ed-cancel`, `.bt-ed-doc`, `.bt-ed-trash`, `.bt-save`, `.bt-site*`, `.bt-note`, `.bt-times`, `.bt-timecard`, `.bt-dur`, `.bt-seg*`, `.bt-molette` | 12, 6, 5, 5 | feuille de l'éditeur (E21), champ unique « Début → fin » | **les deux boutons Début / Fin** (`editeur.horaires` ×2, 6 scripts) ; `editeur.*` (9 ancres) ; la fenêtre « Réglage de l'heure » |
| `planned-confirm(-send/-fix/-skip)`, `pause-ask(-range)`, `live-clash(-text/-why/-gap/-finish/-fix)`, `send-ask(-yes/-no)` | `heures-lot1`, `pause-lot3bis`, `pointage-lot10` | feuilles E08–E10, E23 ; `send-ask` non dessinée | garder les `testid` sur le contenu des feuilles |
| `live-timer`, `lt-finish`, `fin-lendemain`, `.bt-lt`, `.bt-lt-el`, `journee.terminer` | 3 scripts | carte de pointage | garder ; **« Terminer ma journée » du pointage oublié devient « Enregistrer la fin »** (renommage non listé, `01-couverture` §5) |
| `my-meeting(s)`, `my-task(s)`, `my-task-done`, `my-task-time`, `my-tasks-offline` | `missions-lot4`, `taches-heures-lot9` | `CarteReunion`, `ListeTaches` | garder ; case 26 px dans la planche contre « 44 px » au README |
| `reserves-banner`, `reserves-dialog`, `wr-item`, `wr-lift`, `reserves.bandeau/lever/valider` | `reserves-lot11` | puce rouge, feuille | garder |
| `menu-formations(-badge)`, `trainings-*` | `formations-lot6` | ligne de Plus, puce | garder |
| `bt-pp-chips`, `ed-pause-*`, `pause-*` | 6 scripts | puces de pauses 16 px | variante « téléphone » à redessiner (partagée avec le bureau en « compact ») |

**Disparaissent sans équivalent nommé dans le dossier** : `aria-label="Mon compte et menu"`, `[role=menu]` et `menuitem` (12, 7 et 11 scripts : c'est **le chemin de navigation de 12 scripts** vers Semaine, Historique, Formations et congés, d'où le helper commun de l'étape 0) ; les 9 ancres de `page.tsx` ; `.bt-phdr-back` et sa flèche `aria-label="Retour à ma journée"` ; `bt-net` et le bandeau « Chantiers pas encore partis » (aucun script ne les lit) ; l'en-tête qui se masque (`is-hidden`, aucun script) ; le bloc noir « Total aujourd'hui … travaillées » (`.bt-total-big`, lu par `heures-lot1`, `chantier-termine-lot23`, `salarie-lot12`) ; `card-start` et `start-other` (code mort : `salarie-lot9` et `salarie-lot10` vérifient leur **absence**).

### 2.4 Deux contraintes qui n'étaient pas dans le brief

**a) Le test des guides lit le code.** `worker-tours.test.ts` (`npm run test:guides`) cherche chaque ancre sur une ligne qui contient **à la fois** `data-guide` ou `MENU_GUIDE` **et** la valeur littérale (`anchors()`, lignes 40-50), et chaque « libellé » cité dans les textes. Conséquences : (i) `integration-technique.md` §5.1 dit que `guide` et `testId` « passent en props » : une ancre reçue en prop (`guide="journee.envoyer"` à l'appel, `data-guide={guide}` dans le composant) **n'est plus trouvée**. Les ancres doivent rester **littérales dans le JSX du composant**. (ii) `BANNED` contient « onglet » : ni les guides ni l'assistant ne peuvent appeler la barre du bas un « onglet », alors que le README (§6) le fait. Il faut un mot (« la barre du bas », « Plus »).

**b) Le registre de l'assistant (IA étape 3a-1) est adossé au code.** `surfaces-salarie.ts` contient **157 clés** distinctes ; **60** visent les fichiers à remplacer, dont 17 clés `dialogue:`, `fenetre:` et `ancre-dynamique:` liées à **des noms de variables d'état** : `dialogue:components/poseur-day#!!confirmDel`, `#!!liveAsk`, `#repeatOpen`, `#plannedAsk`, `#!!pauseAsk`, `#confirmOpen`, `#confirmCorrectOpen`, `#lateOpen`, `#sendAsk`, `#pickStart`, `dialogue:app/poseur/page#pendingOpen`, `#menuOpen`, `fenetre:poseur-week/month/history`, plus une clé **par numéro de ligne** (`ancre-dynamique:app/poseur/page.tsx:599`). Le job CI ajouté (`.github/workflows/ci.yml`, modifié dans l'arbre de travail, **non commité** au 15/10) fera échouer la PR si une clé du code n'est portée par aucune capacité (T1) ou si une clé déclarée a disparu (T2 ; avertissement seulement si `SURFACES_EN_MIGRATION` vaut `true`, il vaut `false` aujourd'hui : `registre/surfaces.ts:15`). Pour que ces clés restent valides : **le `<Dialog open={…}>` et l'état restent dans `poseur-day.tsx`** (les composants du dossier ne fournissent que le contenu : c'est aussi la consigne du brief, §2.3) ; chaque nouvelle fenêtre, ancre ou `lazyWindow` est déclarée dans `surfaces-salarie.ts` **dans la même PR** (≈ 1 à 2 h par étape, comptées au §5.6). 3a-1 n'étant pas fusionnée, ce point est un risque de collision : un autre workflow modifie en ce moment `registre/*.ts`.

---

## 3. Le budget

### 3.1 Point de départ (mesuré)

- **`/poseur` : 336,5 kB** (somme des gzip niveau 9 des 25 fichiers JS de `.next/app-build-manifest.json`, build du 15/10 00:58) ; `bundle-budgets.json` : mesure 335, plafond 345, objectif 300 (non bloquant). **Marge : 8,5 kB.**
- **`/pointer` : 146,4 kB** (plafond 151, marge 4,6).
- Où sont les kB de `/poseur` (gz) : react-dom 53,6 ; **chunk de la page 48,3** (`app/poseur/page`, 174,5 kB brut) ; supabase 41,1 ; Next client 32,0 ; Radix popper/dismissable 20,3 ; composants UI (`Button`, `Calendar`, `Dialog`…) 20,0 ; **chunk 9058 : 19,0 = react-day-picker (module de 32,3 kB brut ≈ 10,0 gz) + Radix `DropdownMenu` (22,7 kB brut ≈ 6,6 gz)** ; 572 : 17,5 ; sonner 8,3 ; date-fns 6,3 ; lucide 4,2.
- **Le CSS écrit dans le TSX pèse ≈ 10,1 kB gz** dans ce total (49,5 kB brut : `page` 6,2 + `poseur-day` 22,2 + `live-timer` 3,1 + `team-day` 3,4 + `chantier-documents` 5,0 + 7 autres fichiers ; mesure : concaténation des 11 constantes CSS, gzip niveau 9 ; 8,3 kB gz sans commentaires ni espaces).
- Composition de `poseur-day.tsx` : 181 873 o de source → 89,7 kB minifié (SWC) → 25,3 kB gz isolé, **dont 5,2 de CSS**. `page.tsx` : 22,3 kB minifié, 8,1 kB gz isolé, dont 2,2 de CSS.
- Requêtes au chargement : **18 de données** (`requetes-lot29.mjs`, exécuté ici : « 18 requêtes au chargement (budget ≤ 18) », chaîne `month_closures → time_entry_edits` = 2 pour un plafond de 2).

### 3.2 Croissance estimée

Densité mesurée sur du code existant comparable : 8 à 10 octets gz par ligne de source (`poseur-week` 8,4 ; `worker-reserves` 9,1 ; `poseur-trainings` 10,3 ; `team-day` 10,2 ; `live-timer` 7,0), × 0,8 pour la compression en commun dans un chunk.

| Bloc | Lignes | gz estimé |
|---|---|---|
| Coque + journée dans le premier chargement (15 composants) | ≈ 1 380 | +9,9 kB |
| Colle : `etatLigne`, `bandeJours`, `friseAxe`, `aideEnvoi`, lecture des clôtures remontée à la page | ≈ 440 | +3,2 kB |
| Éditeur + choix du chantier + tiroir d'heure (doivent rester **dans** le premier chargement, §4 R1) | ≈ 560 | +4,0 kB (moins ≈ 1,9 kB du balisage actuel de l'éditeur) |
| Autres feuilles (questions, conflit, réserve, dupliquer…) en chargement différé | ≈ 650 | 0 dans le premier chargement |
| Semaine, Plus, Équipe, assistant, `/pointer` | ≈ 1 800 | 0 pour `/poseur` (différés) ; `/pointer` +1,5 |
| Nouveau CSS (≈ 2 500 lignes, 35 à 45 kB brut) | | **+8 à +10 kB s'il est écrit dans le TSX ; 0 en `.css`** |

### 3.3 Gains possibles

| Levier | Gain gz | Condition |
|---|---|---|
| CSS actuel des 11 fichiers → `.css` | **−8 à −10 kB** | cascade identique (étape 1) |
| `Calendar` (react-day-picker) chargé à l'ouverture de « Dupliquer » | **−9 à −10 kB** | `repeatOpen` en `lazyWindow` ; le dossier remplace de toute façon le calendrier |
| `DropdownMenu` Radix retiré | **−6 à −6,6 kB** | seul `page.tsx` l'importe (vérifié par le graphe d'imports) ; vrai quand la page Plus remplace le menu |
| `ChantierDocuments` (5,7 isolé), `TeamDay` (4,7), `PoseurTrainings` (3,0), `ReserveLiftForm` (1,7) en différé | **−8 à −11 kB** | ils sont importés statiquement par `poseur-day` / `page` ; l'équipe n'est utile qu'au chef |
| Questions et fenêtres rares en différé (≈ 250 lignes) | −2 kB | avec préchauffage |
| Code mort (§1.2) | −1,5 kB | — |
| Balisage remplacé (en-tête, cartes, dock) | −3 à −4 kB | — |

### 3.4 Bilan par scénario (First Load JS de `/poseur`, plafond 345)

| Scénario | Calcul | Résultat |
|---|---|---|
| **A. Tout dans le TSX, rien de différé** (la méthode actuelle du dépôt) | 336,5 + 9,9 + 3,2 + 2,1 + 9 (CSS neuf) − 3,5 | **≈ 357 kB : dépasse de 12** |
| **B. CSS en `.css`, rien de différé** | 336,5 + 15,2 − 9 (CSS retiré) − 3,5 | **≈ 339 kB : passe, marge 6** |
| **C. CSS en `.css` + calendrier, documents, équipe, formations différés + menu retiré** | 336,5 + 15,2 − 9 − 9,5 − 9 − 6,3 − 3,5 | **≈ 314 kB** |
| **D. C + questions et fenêtres rares différées** | C − 2 − 1,5 | **≈ 310 kB** (mieux que l'objectif historique de 300 : non atteint, mais à 10 kB) |

Hypothèse haute (code neuf 40 % plus gros que prévu, soit +21,3 kB au lieu de +15,2) : B ≈ 345 (au plafond) ; C ≈ 320 ; D ≈ 317. Hypothèse basse (−40 %) : C ≈ 308 ; D ≈ 305. **Faisable dans le plafond avec C ou D**, B est trop juste. Si une coupe est nécessaire : différer d'abord `ChantierDocuments` et `TeamDay`, puis les questions d'envoi (en les préchauffant), jamais l'éditeur.

**Coût hors budget** : le `.css` n'entre pas dans `check-bundle-budget.mjs` (qui ne lit que « First Load JS »), mais il bloque le rendu. Estimation : 35 à 45 kB brut ≈ 7 à 9 kB gz pour le nouveau, contre 0 aujourd'hui (le CSS actuel est dans le JS). **Il n'existe aucun garde-fou CSS** : à ajouter (étape 0).

**`/pointer`** : +1,5 kB (≈ 220 lignes) − 1,2 kB (CSS de 3,4 kB brut sorti) ≈ **146,7 kB** pour un plafond de 151.

### 3.5 Pièges de mesure

`integration-technique.md` §1 : la CI ne mesure que sur les PR vers `main` (et, après 3a-1, `integration/**`) ; en local la mesure bouge de 1 à 5 kB. Un build (Next 14.2.33, polices `next/font`) est nécessaire pour valider chaque étape ; je n'ai pas relancé de build ici (le dernier, du 15/10, sert de référence). **Deux variantes dans un même bundle doublent le coût** : si v1 et v2 coexistent sous une bascule d'exécution, v2 doit être un chunk différé (sinon 336,5 + ≈ 40 kB).

### 3.6 Requêtes : la marge est nulle, la bande peut s'en passer

Lectures actuelles (mesurées, `INVENTAIRE=1`) : `month_closures`, `day_tasks`, `meetings`, `user_closures`, `companies`, `time_entries` ×3, `worksites`, `planning` ×2, `documents`, `active_sessions`, `rpc:my_training_videos`, `rpc:my_trainings`, puis `time_entry_edits`, `time_entry_corrections`, `time_entry_positions` = 18.

La bande des jours ne demande **aucune requête de plus** : `fetchPending` lit déjà `planning (work_date, absence_type)` et `time_entries (work_date, status)` sur 60 jours **sans borne haute** (`page.tsx:233-235`), donc la semaine entière y est ; il suffit d'ajouter `submitted_at, locked, exported_at` à la seconde lecture (« renvoyé » = brouillon avec `submitted_at`) et de **remonter à la page** les deux lectures de clôture que `PoseurDay` fait aujourd'hui (`poseur-day:697-715`). Contrepartie : `requetes-lot29.mjs` reconnaît ces lectures par leur `select` exact (`'work_date,absence_type'` ligne 179, `'work_date,status'` ligne 411) et en compte le nombre (lignes 412, 419, 425) : **2 détecteurs et 3 assertions à adapter**.
Ce qu'on ne peut pas faire sans dépasser 18 : une lecture dédiée aux jours de la semaine, aux réunions de la bande, ou au nom de l'entreprise.

---

## 4. Risques techniques

| # | Risque | Preuve | Parade |
|---|---|---|---|
| **R1** | **Hors-ligne : l'éditeur et « + » doivent marcher sans réseau, et rien n'est mis en cache.** | `public/sw.js` est « volontairement sans mise en cache » (push seulement) ; `fonctions-salarie.md` O12 : « rouvrir sans réseau n'est pas garanti » ; `lazy-window.tsx` saute le préchauffage en économie de données / 2G (`slowLink`) ; la file est dans `localStorage` (`battime_offline_<id>`), **hors des composants** | éditeur, choix du chantier, tiroir d'heure et barre dans le premier chargement ; les composants du dossier ne touchent **jamais** `offline-store` (le brief le dit : « sans appel au stockage ») ; test : réseau coupé après le repos, ouvrir « + », saisir, enregistrer, rétablir |
| **R2** | **Verrous anti double toucher** vivent dans le conteneur : `liveBusyRef` (sync), `slotBusyRef`, `submitting`, `syncing`, `copying`, `busyId`, `sendCtx` (`poseur-day:562-574`) ; `LiveTimer.stop` n'a qu'un `busy` d'état (asynchrone) | 33 `useState`, 12 `useRef`, 14 `useEffect` dans `PoseurDay` | séparer **modèle** (hook) et **vue** ; les vues reçoivent `disabled`/`busy` en props, jamais un verrou ; un test `dblclick` par action (OK, Envoyer, Terminer, chips de pause, Lever) |
| **R3** | **En-tête fixe, surface utile** : `--phdr-h` (`page.tsx:303-366`, 64 lignes ; `poseur-day:205, 209`) disparaît ; mais l'en-tête n'a **pas** une hauteur fixe : avec bande (E05, E25) sans bande (E01, E02, E26–E28, assistant) | README §10.3 « fixe ~176 px » contredit par `hasStrip:false` sur 13 écrans (E01, E02, E26–E28 et les huit de l'assistant) ; capture `salarie-en-cours.png` : ancien en-tête ≈ 62 px, dock ≈ 92 px | colonne flex (en-tête `flex:none`, défilement `flex:1; min-height:0`, barres `flex:none`) : plus de `position:fixed`, plus de mesure, le guide (`center()` travaille dans le rectangle du défilement) et `reachable()` restent justes. **Surface utile** : 390×844 : 518 px (avant 690 ; 752 en-tête caché) ; 360×640 : 314 px (avant 486 ; 548) ; +40 px de moins quand une note d'en-tête s'affiche. Aucun test ne lit `is-hidden` ou `--phdr-h` (vérifié) |
| **R4** | **Retours passagers à 170 px** : Sonner est monté **en haut au centre pour toute l'appli** (`app/layout.tsx`, `<Toaster position="top-center">`) ; 76 appels `toast.` dans `poseur-day` ; 19 des 31 scripts visant `/poseur` lisent `[data-sonner-toast]` (30 dans tout le dépôt) ; la barre fait 150 px dans le README, plus avec une aide longue | planche E12 `toast.b:'170px'` | un `Toaster` qui choisit sa position selon la route (`usePathname`), `offset` branché sur une variable CSS `--barre-h` mesurée, pas 170 en dur ; l'action « Annuler » de Sonner est plus petite que 44 px : la restyler ; surveiller les clics interceptés par un toast dans les scripts |
| **R5** | **Feuille du bas + clavier mobile** : l'éditeur actuel est plein écran `inset:0` à `100dvh` (`poseur-day:338-339`) ; une feuille ancrée en bas est masquée par le clavier iOS (la fenêtre visuelle rétrécit, pas la mise en page) | le dossier ne dessine aucun état clavier ouvert, ni 360×640 ; `app/layout.tsx` n'a ni `interactiveWidget` ni `viewportFit` ; Next 14.2.33 les gère dans `Viewport` | `interactiveWidget: 'resizes-content'` (Chrome Android) + écoute de `visualViewport` pour iOS (variable `--kb-h`, bouton OK au-dessus du clavier) ; hauteur maximale en `dvh` ; tests Playwright 390×844 **et 360×640**, avec `focus()` sur la note et sur « C'était quoi ? » |
| **R6** | **Éditeur plein écran → feuille Radix** : l'éditeur est un `div` z-40 sans piège de focus, sans Échap ; `ui/dialog.tsx` ajoute sa propre croix (« Close » en anglais, `sr-only`) alors que le dossier dessine titre + ✕ ; le tiroir d'heure (`bt-sheet`) est **dans** l'éditeur ; le retour Android (S101) passe par `popstate` et `anyLayerOpen` (`poseur-day:964-999`) qui **n'inclut pas** `plannedAsk` ni `pauseAsk` (le README les y ajoute) | `components/ui/dialog.tsx` : `fixed left-[50%] top-[50%]`, `rounded-xl`, fond noir 80 % | variante `sheet` dans `components/ui` (ou fichier à part), croix par défaut masquable ; tiroir d'heure en feuille imbriquée ; ajouter `plannedAsk`/`pauseAsk` à `anyLayerOpen` et `closeTopLayer` ; test : retour Android à chaque couche |
| **R7** | **Guide pas à pas (anneau mesuré sur `[data-guide]`)** : 37 des 44 cibles bougent ; `TourScreen` n'a pas `'plus'` ; `onStepEnter` pilote `setMenuOpen(s.ecran === 'menu')` (`page.tsx:406-417`) ; cible cachée par une barre fixe → « Ce bouton est caché par une fenêtre » | `guide-tour.tsx:231-253` (`reachable`, `center` une fois) | colonne flex (R3) ; `'menu'` → `'plus'` (onglet puis ligne) ; ancres littérales (§2.4a) ; `guides-lot7.mjs` (20 ancres, 629 l.) réécrit en entier ; **ne pas** poser `data-guide` sur un geste qui agit sur une ligne précise |
| **R8** | **Assistant et fonctions Edge** : `WORKER_GUIDE`, `WORKER_NAV`, réponses fixes parlent de « Ma journée », « Ma semaine », « votre nom, en haut à droite », « bouton ✨ de la barre du bas » (11 fiches sur 25, `01-couverture` §5) ; `worker-assistant-core.ts` est **partagé avec les fonctions Edge** (`worker-assistant`, `assistant-eval`) déployées à part | le site est l'export statique de `out/` (`netlify.toml`), les fonctions Edge de `supabase/functions/` se déploient à part | déploiement **coordonné** : front et deux fonctions le même jour ; pendant l'écart l'assistant décrit l'ancien écran. Parade : tant que `?ui=2` n'est pas la valeur par défaut, **ne pas** changer les textes de l'assistant ; au basculement, les deux d'un coup |
| **R9** | **Pastille de l'assistant au-dessus d'un formulaire (AS7)** : Radix modal pose `pointer-events:none` sur le reste, piège le focus et ferme sur « pointeur hors du contenu » ; l'assistant est z-70, les feuilles z-50 | `guide-tour.tsx:158-165` résout déjà ce cas pour sa carte (arrêt de `pointerdown` et `focusin`) | même technique pour la pastille ; **préremplissage** = nouvelle API de `PoseurDay` (valeurs, champs jaunes, retour à l'assistant à l'OK / ✕) ; aucune fonction existante (`worker-draft-card.tsx:173` rouvre la fiche **dans** l'assistant) : c'est une fonction neuve, pas un habillage |
| **R10** | **Tailles 12 px / 16 px** : les composants existants ne se règlent pas par jetons : `Button` h-10 / `text-sm`, `PausePicker` téléphone 13 px et ≈ 38 px de haut, `bt-gap-b` 12 px | `tokens.css:73` : `--dz-fs-xs: 10.5px` **contredit** README §8 (« rien sous 12 px ») ; **27 occurrences < 12 px** restent dans les écrans non refaits (Semaine 8, documents 7, équipe 5, congés 3, etc.) | corriger le jeton ; variantes `dz-` des boutons ; l'état mixte garde ses petits textes (§5.5) |
| **R11** | **Glyphes** : `✦ ▣ ↺ ⧉ ● ✓ →` portent le sens (forme en plus de la couleur) mais **ne sont dans aucun sous-ensemble** de nos polices (vérifié sur `fonts.css` : Archivo et JetBrains Mono couvrent `› ↓ · … — ×`, pas ces sept) | rendu laissé au repli du système (emoji, carré vide sur de vieux Android) | icônes SVG (`lucide-react` déjà présent) pour ✦ ▣ ↺ ⧉ ; test sur un Android ancien avant d'en dépendre |
| **R12** | **Portées des jetons** : `.dz-salarie .bt-skin` ne s'applique pas aux contenus Radix rendus dans `<body>` ; seul `.bt-skin.dz-salarie` (deux classes sur le **même** élément) fonctionne | `tokens.css:6` ; 29 fichiers utilisent `bt-skin` | ajouter `dz-salarie` à chaque `DialogContent` / `PopoverContent` de l'écran salarié ; `--destructive` passe de 2 valeurs (`14 72% 44%`, `0 72% 51%`) à `1 77% 56%` : les badges des vues non refaites changent de rouge |
| **R13** | **Tests Playwright 390×844** : 31 scripts navigateur, 19 659 lignes, dont 16 très dépendants des repères ; **19 lisent les toasts** ; `site-rapide-lot5.mjs` importe `playwright-core` sans repli et ne tourne pas ici (module introuvable) | voir annexe B | tout script est rejoué **deux fois** (v1 puis `?ui=2`) pendant la coexistence ; la CI ne lance **aucun** de ces scripts (types, build, budget, et bientôt le registre) |
| **R14** | **Mon équipe quitte la Journée** : aujourd'hui `TeamDay` s'affiche sur la journée du chef (`poseur-day:2156-2163`) ; dans le dossier il faut passer par Plus ; 5 ancres de guide, `salarie-lot14.mjs` | E26-E27 | décision produit (§6) ; si oui, redessiner « + Ajouter des heures » qui n'est qu'une note |
| **R15** | **Coordination** : 3a-1 modifie `registre/*.ts` et `.github/workflows/ci.yml` en ce moment (arbre de travail non commité) | `git status` du 15/10 | ne pas toucher à ces fichiers avant leur fusion ; les PR du redesign partent d'une base qui les contient |

---

## 5. Plan par étapes

### 5.1 Principes

1. **Étrangler, pas remplacer.** Aucune étape ne réécrit `poseur-day.tsx` d'un bloc : on **sépare le modèle de la vue** (étape 2) puis on ajoute une seconde vue. Preuve de non-régression de l'étape 2 : les 31 scripts navigateur rejoués **sans une seule modification** + captures identiques.
2. **Interrupteur.** `?ui=2` mémorisé en `sessionStorage`, **honoré seulement sur les hôtes d'aperçu** (`isPreviewHost()`, comme `?demo=salarie`, `page.tsx:190`) : zéro migration, zéro exposition en production. Option pilote (décision §6) : un réglage par entreprise, qui coûte une migration, une case dans les réglages du bureau et l'adaptation du test des **5 colonnes** lues (`requetes-lot29.mjs:30`).
3. **Le code de la v2 est un chunk différé** tant que la bascule n'est pas faite (sinon le budget compte les deux, §3.5).
4. **Chaque PR** : typecheck, build, `npm run budget`, `requetes-lot29`, les scripts touchés rejoués, le registre IA à jour, et une phrase de justification si le poids bouge de plus de 10 kB.
5. **Les composants du dossier ne contiennent que du contenu** ; `<Dialog open>`, états, verrous et appels restent dans les conteneurs.

### 5.2 Étapes

| # | Étape | Contenu | Fichiers touchés | Tests à adapter | Interrupteur | Effort (agent-h) |
|---|---|---|---|---|---|---|
| 0 | **Garde-fous** | captures de référence de chaque état (grille d'états ↔ scripts existants), budget CSS (nouveau script, seuil), baseline des 31 scripts navigateur consignée (annexe B), **helper de navigation commun** (`ouvrirVue`, `ouvrirMenuCompte`, `ouvrirEditeur`, `lireToasts`) posé dans les 12 scripts qui passent par le menu du compte : même comportement en v1, un seul point à changer pour la v2 ; aucun changement de code applicatif | `scripts/tests/` (nouveau helper + 12 scripts), `scripts/` (nouveaux), `bundle-budgets.json` (clé CSS) | les 12 scripts « Mon compte et menu » (changement mécanique, rejoués à l'identique) | — | **4 à 6** |
| 1 | **Alléger sans rien changer** | CSS des 11 fichiers → `.css` (même ordre, même cascade) ; `Calendar`, `ChantierDocuments`, `TeamDay` (chef seulement), `PoseurTrainings`, `ReserveLiftForm` en `lazyWindow` ; retrait du code mort (§1.2) | `app/poseur/page.tsx`, `poseur-day.tsx`, `live-timer.tsx`, `missions-worker.tsx`, `worker-reserves.tsx`, `pause-picker.tsx`, `team-day.tsx`, `poseur-trainings.tsx`, `reserve-lift-form.tsx`, `chantier-documents.tsx`, `geo-info-dialog.tsx`, nouveaux `.css`, `app/poseur/layout.tsx` | `requetes-lot29` (rien), `site-rapide-lot5` (les nouveaux chunks différés) ; registre : `fenetre:` des nouveaux `lazyWindow` | comportement **identique** | **5 à 7** |
| 2 | **Logique pure + séparation modèle / vue** | `etatLigne`, `bandeJours`, `friseAxe/Segments`, `aideEnvoi`, `raisonEchec`, `corrections` + tests Deno ; `PoseurDay` → `usePoseurDay()` (hook) + `JourneeV1` ; `PoseurPage` → `usePoseurPage()` + `PageV1` ; lecture des clôtures remontée | `lib/` (nouveaux), `components/poseur-day.tsx` (éclaté), `app/poseur/page.tsx`, `surfaces-salarie.ts` (clés `components/poseur-day#…` → nouveau fichier) | **aucun script** (c'est la preuve) ; registre | comportement **identique** | **8 à 12** |
| 3 | **Jetons + coque v2** | `dz-salarie.css` (jetons, corrigés §1.6, R10), `Toaster` par route, colonne flex, `EnteteJournee`, `BandeJours`, `NoteEntete`, `OngletsBas`, `BarrePouce`, `MessageEtat`, page « Plus » minimale (liens vers les vues anciennes), Mois / Historique / Formations / Congés **anciens** dans la coque | `components/design/salarie/*`, `page-v2.tsx`, `app/layout.tsx` (Toaster), `worker-tours.ts` (`'plus'`) | `guides-lot7`, `site-rapide-lot5`, `formations-lot6`, `fenetres-lot11`, `salarie-lot9/10/12`, `qr-fixe-lot12`, `traces-lot3`, `requetes-lot29` (2 détecteurs, 3 assertions), `brouillons-lot2` | `?ui=2` | **12 à 16** |
| 4 | **Journée v2** | `CartePointage`, `TuilesJour`, `MiniFrise`, `CarteChantier` (10 états), `TrouRoutePause`, `CarteReunion`, `ListeTaches`, `JourneeVide`, `Rappels` | `components/design/salarie/*`, `journee-v2.tsx` | `heures-lot1`, `missions-lot4`, `taches-heures-lot9`, `reserves-lot11`, `panier-lot3bis`, `chantier-termine-lot23`, `salarie-lot9/10`, `pointage-lot10` | `?ui=2` | **12 à 16** |
| 5 | **Feuilles** | `SheetShell`, `EditeurIntervention`, `ChoixChantier`, réglage de l'heure, questions ×3, déjà envoyée, conflit de pointage, lever une réserve, dupliquer ; clavier (R5), retour Android (R6), hors-ligne (R1) | `components/design/salarie/*`, `components/ui/dialog.tsx` (variante `sheet`), `poseur-day.tsx` (JSX des `<Dialog>`), `pause-picker.tsx` (variante) | `pause-lot3bis` (731 l.), `pointage-lot10` (769 l.), `heures-lot1`, `fenetres-lot11`, `brouillons-lot2`, `bureau-lot2`, `documents-lot24`, `salarie-lot12` | `?ui=2` | **14 à 20** |
| 6 | **Semaine, Plus, Mon équipe** | `VueSemaine` (+ navigation de semaine à décider), `PagePlus` complète (nom d'entreprise : décision R14), `MonEquipe` (séparer logique et vue de `TeamDay`) | `poseur-week.tsx`, `team-day.tsx`, `components/design/salarie/*` | `site-rapide-lot5`, `salarie-lot14`, `formations-lot6`, `traces-lot3` | `?ui=2` | **8 à 12** |
| 7 | **`/pointer` v2** | `PagePointer` (P01–P03 + attente, connexion, QR fixe laissés à l'ancien style) | `app/pointer/page.tsx` | `qr-fixe-lot12`, `salarie-lot10/12`, `pointage-lot10` (raccourcis) | `?ui=2` ; **indépendant**, démarre dès l'étape 1 | **4 à 6** |
| 8 | **Assistant v2** | `AssistantPanneau`, `AssistantHistorique`, `AssistantPastille`, `CarteActions` ; préremplissage de l'éditeur (nouvelle fonction) | `assistant-panel.tsx` (variante, partagé avec le bureau), `worker-assistant.tsx`, `worker-*-card.tsx`, `poseur-day.tsx` | `assistant-historique` (924 l.), `assistant-multi` (731 l.), `assistant-effacer`, `assistant-panneau`, `ia-formule-lot6` | `?ui=2` | **12 à 16** |
| 9 | **Guides, libellés, fonctions Edge** | `worker-tours.ts` (44 cibles), `WORKER_NAV` / `WORKER_GUIDE`, `QR_START_ANSWER`…, `test:guides`, déploiement coordonné (R8) | `_shared/worker-tours.ts`, `worker-assistant-core.ts`, `guide-tour.tsx`, deux fonctions Edge | `guides-lot7` (réécriture), `test:guides`, `test:assistant-aide` | au basculement | **6 à 9** |
| 10 | **Vague 2 du designer** | Mois, Historique + PDF, Mes congés, Documents du chantier, Formations + lecteur, Informations, scanner, QR fixe | 5 vues existantes, `ChantierDocuments`, `LeaveRequestDialog` | `formations-lot6` (860 l.), `documents-lot24`, `fenetres-lot11`, `site-rapide-lot5`, `videos-lot13`, `enregistreur-lot14` | `?ui=2` | **14 à 22** |
| 11 | **Bascule et nettoyage** | `?ui=2` → valeur par défaut, suppression de `JourneeV1` / `PageV1` et des anciens CSS, tests définitifs, registre, budgets resserrés | tout ce qui précède | rejeu complet | — | **8 à 12** |
| | **Total** | | | | | **107 à 154 (≈ 130)** |

### 5.3 Ordre, parallélisme, chemin critique

`0 → 1 → 2 → 3` en série (≈ 29 à 41 h). Ensuite trois voies :
- **A** : 4 → 5 (la journée et les feuilles, ≈ 26 à 36 h), la plus risquée ;
- **B** : 6 puis 8 (Semaine/Plus/Équipe, assistant, ≈ 20 à 28 h) ;
- **C** : 7 (`/pointer`, ≈ 4 à 6 h, démarrable après l'étape 1).
`9` suit A et B ; `10` suit la livraison du designer ; `11` clôt. **Chemin critique : 69 à 98 h** = étapes 0 à 3 en série (29 à 41 h) + voie A, étapes 4 et 5 (26 à 36 h) + étape 9 (6 à 9 h) + étape 11 (8 à 12 h), **à condition que l'étape 10 (vague 2, 14 à 22 h) se déroule en parallèle des voies A et B**, donc que le designer ait livré avant la fin de l'étape 3 ; sinon elle s'ajoute au chemin (jusqu'à 120 h). Machine : le rejeu des 31 scripts dure ≈ 50 à 60 minutes en série (mesure : annexe B), 20 minutes en 3 voies.

### 5.4 Ce qu'on peut faire AVANT que le designer livre Mois, Historique, congés, formations

**Tout de l'étape 0 à l'étape 9**, soit ≈ 85 à 120 agent-heures (4+5+8+12+12+14+8+4+12+6 en bas, 6+7+12+16+16+20+12+6+16+9 en haut), avec trois réserves :
1. les réponses du designer aux problèmes **bloquants** (§7 : composants absents, teintes) ; à défaut, décisions par défaut proposées ici (teintes du code, composants écrits d'après la planche) ;
2. la règle de la frise, les 8 états de ligne → segments et l'horaire de base doivent être tranchés avant l'étape 4 ;
3. le formulaire d'ajout du chef et la navigation de semaine avant l'étape 6.

Les étapes 0 à 2 **valent même si le design n'est jamais livré** : −25 à −35 kB sur `/poseur`, code mort retiré, logique testée.

### 5.5 État mixte : que se passe-t-il entre l'ancien et le nouveau style ?

Sous `?ui=2`, la nouvelle coque (en-tête, bande, barre, onglets) enveloppe des vues **anciennes** :

| Zone | Ce que voit l'utilisateur | Couture visible |
|---|---|---|
| Mois | `PoseurMonth` (cartes shadcn) sous le nouvel en-tête, onglet « Mois » actif | cartes à rayon 12–14 px et durées `4h00`, contre 16–22 px et `4:00` |
| Historique, Formations, Interventions supprimées | vues pleines `PoseurHistory` / `PoseurTrainings` / `TracesDialog`, ouvertes depuis Plus | pas de bouton retour du dossier : titre + flèche à rendre |
| Mes congés | `LeaveRequestDialog` centrée (pas une feuille) | fenêtre centrée sur une coque à feuilles |
| Documents | `ChantierDocuments` centrée **par-dessus** la feuille de l'éditeur | deux styles de fenêtre empilés |
| Informations, scanner, QR fixe de `/pointer`, connexion sur place | fenêtres et pages anciennes | `kx-*` sombre à côté du résultat P01–P03 |
| Textes | **27 occurrences < 12 px** et boutons < 44 px dans ces vues | contredit §8 du README : à dire aux testeurs |
| Couleurs | `--destructive` passe à `#E53935`, `--radius` à 16 px : les anciennes vues changent un peu | convergence involontaire, acceptable |

**Recommandation** : l'état mixte est acceptable pour les **testeurs** (aperçus, comptes de test) et **pas pour tous les salariés** : ne pas basculer avant la fin de l'étape 10 (décision §6).

### 5.6 Hypothèses de l'estimation

- **Volume** : ≈ 4 575 lignes de TSX + 2 500 de CSS + 300 de tests Deno ; **3 000 à 5 000 lignes** de scripts Playwright adaptées (15 à 25 % de 19 659) ; l'étape 2 déplace ≈ 3 000 lignes sans les réécrire.
- **Cadence** : 250 à 400 lignes d'UI relues par heure (build, captures, correction comprises) ; 500 lignes de test adaptées par heure ; les cycles de relecture adverse que le dépôt pratique (lots précédents) ajoutent ≈ 30 %.
- **Marges** : ± 40 %. Les étapes 5 (clavier, hors-ligne, retour Android) et 8 (fonction neuve) portent l'incertitude.
- **Registre IA** : ≈ 1 à 2 h par étape de 3 à 8, **comptées** dans les fourchettes.
- Hors estimation : relecture humaine, validations du patron, retours du designer, rédaction des captures de recette.

---

## 6. Décisions que seul le patron peut prendre

1. **Qui voit le nouvel écran, et quand** : comptes de test seulement, une entreprise pilote (réglage par entreprise : une migration et une case au bureau), ou tout le monde ; et **attendre la vague 2** (Mois, Historique, congés, documents, formations) ou accepter l'état mixte pour de vrais salariés.
2. **Surface utile** : accepter en-tête fixe + barre (518 px au lieu de 690/752 sur 390×844 ; 314 au lieu de 486/548 sur 360×640), ou demander au designer un en-tête repliable (il a retiré la rétraction).
3. **Changements de gestes** : Mon équipe passe de la Journée à « Plus » (un toucher de plus pour le chef) ; l'assistant passe de la barre du bas à l'en-tête, le scanner fait l'inverse ; le chrono perd ses secondes (`2:42`).
4. **Horaire de base de l'entreprise** pour la frise d'une journée vide : constante 08:00–17:00 (0 h) ou nouveau réglage entreprise (migration + écran bureau) ; et le **nom de l'entreprise** dans « Plus » (E26) : l'ajouter aux colonnes lues côté salarié ou y renoncer.
5. **Couleurs et budget** : garder les teintes du code (identiques au bureau, à la borne et au papier ; celles du dossier font échouer deux tests) ; accepter un **budget CSS** séparé du budget JS (`.css` hors des 345 kB).

---

## 7. Problèmes d'intégration (gravité, preuve, demande précise)

**PI01 · Bloquant · aucun composant, aucune classe, aucun repère livrés**
- **Où** : README §5 et §9 ; zip.
- **Preuve** : le zip contient 5 fichiers (`unzip -l` : README 21 457 o, `tokens.css` 4 877 o, `donnees-exemple.ts` 6 278 o, planche 75 782 o, `support.js` 60 151 o) ; 0 TSX ; la planche n'a aucun `data-*` ni classe ; `tokens.css` n'a que des variables ; `components/design/` n'existe pas dans le dépôt.
- **Demande** : livrer, par composant, le TSX présentationnel et ses classes `dz-` (au moins `CarteChantier`, `BarrePouce`, `EditeurIntervention`, `MiniFrise`, `BandeJours`, `CartePointage`), **ou** écrire noir sur blanc que l'intégration les écrit d'après la planche et fournir la table état → styles (couleur, bordure, étiquette, trait) de `ST`, `SS`, `SEGK`, `SEND`.

**PI02 · Bloquant · les teintes du dossier font échouer deux tests**
- **Où** : `tokens.css:57-61` ; `day-part.ts`, `missions.ts`.
- **Preuve** : ΔE matin/soir **11,2** pour ≥ 15 (`day-part.test.ts:103`) ; bordure de réunion `#D6457A` sur `#FBE0EA` **3,40:1** pour ≥ 4,5 (`missions.test.ts:232`) ; ΔE après-midi / jour J 8,6 pour ≥ 8 et soir / réunion 10,2 pour ≥ 10 sont à la limite. Le code (`#DAEDFB`, `#FDE3CA`, `#DFCCEE`, réunion `#F9D6E0` / `#9E2A55`) passe ; matin et après-midi du dossier en sont à 1,8 et 2,6 de ΔE.
- **Demande** : reprendre les valeurs du code, ou livrer un jeu dont les neuf mesures des tests sont calculées et passent, avec l'encre secondaire `#57524A` (`MEETING_TINT.ink === DAY_PART_INK`).

**PI03 · Important · la table « repères à garder » est fausse et incomplète**
- **Où** : README §5 colonne « Repères à garder ».
- **Preuve** : 17 repères cités : 8 existent (dont `.bt-timecard`, mal attribué), 2 sont des renvois génériques, **7 n'existent pas** là où le dossier les met (`data-bub`, `data-creneau`, `data-withdrawn` : 0 occurrence dans `poseur-day`, `poseur-week`, `live-timer`, `page` ; `data-live` : bureau seulement ; `.bt-err` : pages de connexion ; `data-day` : `team-day.tsx:272` seulement ; `role=button` : absent des cartes). Réel : 50 `data-testid`, 43 classes lues, 26 `data-guide`, 7 `data-guide-confirm`, 44 cibles de guide (§2).
- **Demande** : la table ancien → nouveau de l'annexe A, complétée ligne à ligne (« conservé sur tel élément / déplacé vers / supprimé, raison ») ; sans elle, l'adaptation des 16 scripts les plus dépendants se fait à l'aveugle.

**PI04 · Important · mini-frise : règle incomplète, cassée sur des données réelles**
- **Où** : README §7 ; planche `frise()`, `SEGK`.
- **Preuve** : avec `fin = début` (sortie oubliée, forme réelle en base) la règle `e <= s ⇒ e += 24 h` produit un axe de 26 à 27 h (réimplémentation : `work-plan/frise-proto.mjs`) ; 5 types de segments au README, 6 dans la planche (`conflit`, `lane`), 8 états de ligne sans correspondance ; trou répondu sans rendu ; `de/a` des données (07:30, 17:00) ≠ bornes (06:00, 18:00) ; « horaire de base de l'entreprise » inexistant (seul `weekly_hours`, jamais lu côté salarié) ; heures pile ambiguës.
- **Demande** : 8 vecteurs de test (entrée → axe + segments), la table état de ligne → type de segment, le rendu d'un trou répondu, l'horaire de base à utiliser, le traitement de `fin = début`.

**PI05 · Important · les types du dossier ne peuvent pas typer sa propre planche ni le réel**
- **Où** : `donnees-exemple.ts:4-15`.
- **Preuve** : `EtatLigne` sans `refus` ni `renvoye` (utilisés par `ST`) ; `Jour.etat` unique alors qu'« aujourd'hui » se combine avec les autres états ; `EtatEnvoi` sans « Envoi… » ; `correction` unique contre une liste de deux journaux ; `fin: null` contre `end_time = start_time` ; `salarie.role: 'poseur'` n'existe pas ; `taches` sans `id` ; `trous.apresLigne` à l'envers de `gap_before` ; `endroitNote` booléen contre des coordonnées affichées.
- **Demande** : corriger les types (liste du §1.4) et fournir un jeu par état **cohérent** (initiales `SE`, pauses `0:30` seulement quand il y a une pause).

**PI06 · Important · `tokens.css` contredit le README sur la taille minimale**
- **Où** : `tokens.css:73` (`--dz-fs-xs: 10.5px`), `:74` (`12.5px`) ; README §8.
- **Preuve** : §8 : « minimum 12 px » ; le jeton des étiquettes d'état et de section reste à 10,5 px ; 27 occurrences < 12 px dans les vues non refaites.
- **Demande** : jetons alignés (≥ 12 px), et la liste des éléments encore sous 12 px (aucun hors décoratifs).

**PI07 · Important · l'en-tête n'a pas la hauteur annoncée, et seul 390×844 est dessiné**
- **Où** : README §1, §10.3 ; planche `hasStrip`.
- **Preuve** : « fixe ~176 px avec la bande » mais 13 écrans (E01, E02, E26, E27, E28 et les huit de l'assistant) sans bande ; surface utile = 518 px sur 390×844 et **314 px sur 360×640** (taille exigée par `integration-technique.md` §2.8), que la planche ne montre jamais ; une note d'en-tête retire 40 px de plus.
- **Demande** : E05, E21 et E25 à **360×640**, avec une note d'en-tête, et la hauteur de chaque variante d'en-tête.

**PI08 · Important · la feuille de l'éditeur n'est dessinée ni avec le clavier, ni avec le réglage de l'heure**
- **Où** : E21, E22 ; README §5 (`onHeure`).
- **Preuve** : un seul état (clavier fermé) ; la fenêtre « Réglage de l'heure » n'est pas dessinée ; `app/layout.tsx` n'a ni `interactiveWidget` ni `viewportFit` ; iOS ne rétrécit pas la mise en page au clavier.
- **Demande** : E21 et E22 avec le clavier ouvert (champ « Note », « C'était quoi ? », recherche) à 390×844 et 360×640, la hauteur maximale de la feuille, et l'état « Réglage de l'heure ».

**PI09 · Important · le nom de l'entreprise n'est pas lu côté salarié**
- **Où** : E26 (kicker « ENTREPRISE TEST · POSEUR »).
- **Preuve** : `COLUMNS.worker` = 5 colonnes sans `name` (`company-settings-core.ts:37-52`), exigées telles quelles par `requetes-lot29.mjs:30, 394` ; `/poseur` est à 18 requêtes pour un plafond de 18.
- **Demande** : confirmer que le nom n'est pas indispensable, ou accepter l'ajout d'une colonne (et l'adaptation du test) ; aucune lecture de plus.

**PI10 · Important · « Mon équipe » déplacé et formulaire d'ajout absent**
- **Où** : E26, E27 ; README S69–S71.
- **Preuve** : `TeamDay` s'affiche aujourd'hui sur la journée du chef (`poseur-day:2156-2163`, `date === mountedToday`) ; E27 : « Corriger » et « Envoyer » sont deux boutons de page pour 3 lignes d'états différents ; « + Ajouter des heures » n'est qu'une note (`equipe.ajouter`, `equipe.ok`).
- **Demande** : le formulaire d'ajout (chantier, début, fin, « OK — envoyer au bureau »), les boutons par ligne, et confirmer le déplacement vers « Plus ».

**PI11 · Important · glyphes porteurs de sens absents de nos polices**
- **Où** : README §4, E05, E26, E12 (`✦ ▣ ↺ ⧉ ● ✓ →`).
- **Preuve** : `fonts.css` : ni Archivo ni JetBrains Mono ne couvrent ces glyphes (seuls `› ↓ · … — ×` le sont) ; rendu laissé au repli du système.
- **Demande** : un dessin SVG pour ✦ ▣ ↺ ⧉ (icônes ou pictogrammes), ou l'accord explicite d'un repli système.

**PI12 · Important · « retours passagers à 170 px » : valeur en dur, sans lien avec la barre réelle**
- **Où** : planche E12 (`toast.b:'170px'`), README §1 et S103.
- **Preuve** : la barre mesure ≈ 150 px dans le README, plus avec une ligne d'aide longue ou le clavier ; Sonner est global en haut au centre ; son bouton « Annuler » est < 44 px.
- **Demande** : « juste au-dessus de la barre » exprimé relativement (variable de hauteur), la taille de l'action « Annuler » (44 px), et le comportement avec le clavier ouvert.

**PI13 · Important · assistant : nouvelle fonction et panneau partagé avec le bureau**
- **Où** : AS7, AS8 ; README §9.
- **Preuve** : le préremplissage du formulaire, les champs jaunes et la pastille n'existent pas dans le code (`worker-draft-card.tsx:173` rouvre la fiche dans l'assistant) ; `assistant-panel.tsx` (765 l.) sert aussi `assistant-bureau.tsx` ; `01-couverture` PB10.
- **Demande** : confirmer que c'est une fonction demandée (sinon retirer AS7/AS8), les états chargement / erreur / verrou / quota épuisé de l'historique, et le panneau **bureau** s'il doit suivre.

**PI14 · Important · vocabulaire interdit et ancres à écrire en dur**
- **Où** : README §6 (« onglets en bas ») ; `integration-technique.md` §5.1.
- **Preuve** : `BANNED` de `worker-tours.test.ts` contient « onglet » ; le test des ancres exige `data-guide` et la valeur sur la même ligne ; 7 fiches commencent par « Touchez votre nom, en haut à droite ».
- **Demande** : le mot à employer pour la barre du bas dans les guides et l'assistant ; les textes de remplacement des 7 fiches `MENU` ; confirmer que les ancres sont posées littéralement par composant.

**PI15 · Important · le dossier ne dessine ni « Retirer », ni « Envoyer maintenant ? », ni les issues d'envoi**
- **Où** : README §5 ; `01-couverture` PB05.
- **Preuve** : `confirmDel` (`poseur-day:2924-2952`, `data-guide="confirmer.retirer"`) et `sendAsk` (`3015-3030`) sont deux des 7 `data-guide-confirm` ; elles resteront centrées, à l'ancien style, au milieu de feuilles.
- **Demande** : un écran pour chacune, ou la mention « habillage seulement, inchangé ».

**PI16 · Mineur · formats et libellés qui divergent entre écrans**
- **Où** : `donnees-exemple.ts`, E25 ; `poseur-week/month/history`.
- **Preuve** : durées `4:00` (dossier, Journée) contre `4h00` (Semaine, Mois, Historique, éditeur, `formatMinutesToHours`) ; initiales « SG » pour « Sam Exemple » ; jours `L M M J V S D` ambigus (deux « M ») ; E25 « 31:30 ENVOYÉES » pour 16:00 (`01-couverture` M3, M5).
- **Demande** : un seul format de durée, données d'exemple cohérentes, lettres de jours non ambiguës.

**PI17 · Mineur · `support.js` et la planche chargent des ressources externes**
- **Où** : planche (`fonts.googleapis.com`), `support.js` (React et Babel depuis un CDN).
- **Preuve** : `support.js` contient les adresses `unpkg.com/react@18.3.1`, `unpkg.com/react-dom@18.3.1` et `unpkg.com/@babel/standalone@7.29.0` ; la planche appelle `fonts.googleapis.com` (2 occurrences) : elle ne s'affiche pas hors réseau.
- **Demande** : ne pas considérer ces deux fichiers comme livrables ; ne rien en reprendre dans le dépôt.

---

## 8. Annexes

### A. Repères actuels des fichiers à remplacer (lus par au moins un script)

**`data-testid` (44)** — `page.tsx` : `scan-open`, `menu-formations`, `menu-formations-badge` · `poseur-day.tsx` : `card-start` (mort), `total-prevu`, `panier`, `day-returned`, `card-live`, `card-planned` (dynamique), `card-entry`, `card-exit-forgotten`, `card-office-edit`, `card-lift`, `start-other` (mort), `dock-assistant`, `heure-exacte`, `planned-confirm`, `planned-confirm-send`, `planned-confirm-fix`, `pause-ask`, `pause-ask-range`, `live-clash`, `live-clash-text`, `live-clash-why`, `live-clash-gap`, `live-clash-finish`, `live-clash-fix`, `send-ask`, `send-ask-yes`, `send-ask-no` · `live-timer.tsx` : `live-timer`, `fin-lendemain`, `lt-finish` · `missions-worker.tsx` : `my-meetings`, `my-meeting`, `my-tasks`, `my-tasks-offline`, `my-task`, `my-task-time`, `my-task-done` · `worker-reserves.tsx` : `reserves-banner`, `reserves-dialog`, `wr-item`, `wr-lift` · `termine-le.tsx` : `termine-le`.

**Classes `.bt-*` (43)** — `page` : `bt-phone`, `bt-phdr`, `bt-phdr-date`, `bt-phdr-back`, `bt-info`, `bt-phbody`, `bt-phscroll` · `poseur-day` : `bt-day`, `bt-day-scroll`, `bt-total`, `bt-total-big`, `bt-stats`, `bt-stat`, `bt-stat-n`, `bt-sec`, `bt-iv`, `bt-iv-name`, `bt-badge`, `bt-iv-mod`, `bt-plan-k`, `bt-gap`, `bt-gap-b`, `bt-dup`, `bt-fab`, `bt-send`, `bt-ed`, `bt-ed-cancel`, `bt-site-search`, `bt-site`, `bt-site-name`, `bt-times`, `bt-timecard`, `bt-dur`, `bt-note`, `bt-save`, `bt-ed-doc`, `bt-ed-trash`, `bt-seg`, `bt-segb`, `bt-molette` · `live-timer` : `bt-lt`, `bt-lt-big` · `pause-picker` : `bt-pp-chips`.

**`data-guide` (cœur)** — `entete.scanner`, `menu.compte`, `menu.photo`, `menu.conges`, `menu.infos`, `menu.notifications`, `menu.journee|semaine|mois|historique` (dynamique), `infos.fermer`, `journee.panier|trou|chantier|sortie-oubliee|copier|plus|envoyer|assistant|terminer`, `editeur.autre|chantier|ajouter-chantier|horaires|reserve|note|documents|retirer|ok`, `copier.valider`, `confirmer.retirer`, `reserves.bandeau|lever|valider` ; `data-guide-confirm` ×7 dans `poseur-day.tsx` (lignes 2842, 2856, 2882, 2908, 2925, 2958, 3017).

### B. Les 31 scripts navigateur qui visent `/poseur` (état de départ rejoué ici)

Poids = nombre de repères du cœur lus (testid + classes + ancres + libellés). Résultat = `✅ / ❌` imprimés par le script lui-même, build `out/` du 15/10.

À_REMPLIR_BASELINE

Scripts restants non rejoués ou en échec d'environnement : voir la colonne « Résultat ».

### C. Mesures et commandes (reproductibilité)

Voir §9.

---

## 9. Méthode et reproductibilité

1. **Lecture** : README, `tokens.css`, `donnees-exemple.ts`, planche (script de données lu comme **texte** : `sed -n 343,566p`, jamais exécuté ; la règle de la frise a été **réécrite à la main** pour l'essayer), code de la liste ci-dessus, `worker-tours.test.ts`, `registre/README.md`, `.github/workflows/ci.yml` (diff non commité).
2. **Poids** : `node -e` sur `.next/app-build-manifest.json` (gzip niveau 9 de chaque fichier JS de `/poseur/page` : 336,5 kB, 25 fichiers) ; composition du chunk 9058 coupée par modules webpack ; transpilation SWC de `next/dist/build/swc` pour les tailles minifiées par fichier (`minsize.cjs`) ; CSS en constantes extrait par expression régulière (`cssweight.cjs`) ; graphe d'imports statiques (`graph.cjs`).
3. **Requêtes** : `INVENTAIRE=1 node scripts/tests/requetes-lot29.mjs out <dossier hors dépôt> 42377` (build `out/` du 15/10) : 81 ✅ / 0 ❌ ; salarié : 18 requêtes, chaîne 2.
4. **Teintes** : `couleurs.mjs` (mêmes formules WCAG et CIE76 que `day-part.test.ts:74-90`).
5. **Repères et tests** : `tests-analysis.mjs`, `repères.mjs` (comptage par fichier et lecture par scripts) ; `run-baseline.sh` (3 voies, ports 43100+, captures hors dépôt).
6. **Géométrie** : captures de départ `shots-base/salarie-lot9/salarie-en-cours.png` (390×844 ×2) : en-tête ≈ 124 px à l'échelle 2 (≈ 62 px), dock ≈ 185 px (≈ 92 px).
7. **Fichiers de travail** (hors dépôt) : `/tmp/claude-0/-home-user-battime-bolt/30d30cad-b51e-52c5-a262-2c112413e34b/scratchpad/work-plan/`.
8. **Limites** : aucun build n'a été relancé (le `.next` et `out` du 15/10 00:58 servent de référence ; HEAD contient depuis des commits « WIP IA étape 3a-1 » sans effet sur le front) ; l'estimation de croissance (§3.2) est une extrapolation de densité, pas une mesure de composants écrits ; les gains de chargement différé sont des tailles **isolées** de modules (ils se recouvrent un peu dans un chunk) ; 360×640 et ordinateur ne sont pas dessinés, mes chiffres de surface utile viennent des hauteurs du README ; je n'ai pas lancé `test:guides` (Deno) ni la CI.

Aucun fichier du dépôt n'a été modifié, hormis ce rapport.
