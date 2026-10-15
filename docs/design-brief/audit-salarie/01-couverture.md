# Audit adverse — couverture S1 à S104 du dossier salarié

Mission « couverture » · 15 octobre 2026 · auditeur adverse (pas de félicitations, que ce qui est faux, manquant ou impossible à intégrer).

**Audité** : `README.md` (§1 à §10), planche `BEMEXO Salarié - Dossier.dc.html` (39 écrans : E01 à E28, P01 à P03, AS1 à AS8), `donnees-exemple.ts`.
**Références** : `docs/design-brief/fonctions-salarie.md` (cahier, annexe S1 à S104), `integration-technique.md`, et le code réel : `app/poseur/page.tsx`, `app/pointer/page.tsx`, `components/poseur-day.tsx`, `live-timer.tsx`, `assistant-panel.tsx`, `worker-*.tsx`, `supabase/functions/_shared/worker-tours.ts`, `worker-assistant-core.ts`, `scripts/tests/*.mjs`.
**Méthode** (détail au §7) : les fichiers du designer sont traités comme des données. La planche a été rendue dans Chromium **réseau coupé** (aucune requête sortie ; son script de données a été évalué dans le navigateur, jamais dans Node). Pour chaque écran j'ai extrait le texte du DOM, **puis mesuré ce qui est réellement visible dans le cadre 390 × 844** (texte dans le cadre, non recouvert par la barre du bas ni par la feuille), et relu les captures. Un texte qui n'existe que dans la « note » du designer sous l'écran (et pas dans le cadre) est compté comme *décrit, non montré*.

Légende des verdicts : **✔** visible et conforme dans un cadre · **◐** partielle (ou seulement en note / hors cadre / réécrite) · **✘** rien dans la maquette, ou contredite · **∅** le README dit lui-même « non dessiné / inchangé ». Les lignes de la planche citées « L.nnn » sont celles du fichier `.dc.html` d'origine.

---

## 0. Verdict en dix lignes

1. **La numérotation est saine** : S1 à S104 sont tous au README, aucun n'est renuméroté ou perdu. Mais S83 à S93 (onze capacités) sont écrits sur **une seule ligne** « C » (README L.148), ce qui cache que **S89 et S90 ne sont dessinés nulle part** et que S93 est « non redessiné ».
2. **Les statuts C/R/D ne sont pas vrais.** Sur 104 capacités : **37 ✔, 49 ◐, 7 ✘, 11 ∅**. Les 7 ✘ sont cochées « couverte » sans rien dans la maquette : **S9, S19, S31, S61, S89, S90, S98**. Les 11 ∅ sont cochées « couverte » sur un écran que le README appelle « inchangé / non redessiné / pas encore dessiné » : S50, S56, S57, S63 à S68, S93, S95.
3. **L'écran de référence (E05) ne montre pas S6, S7 (1/3), S8, S31** : tout ce qui suit la mini-frise est sous la barre du bas. « Route / Pause » (S31), la carte de réunion et le « Terminé le … » (S9) ne sont visibles dans aucun cadre.
4. **Règles métier** : les gros garde-fous sont conservés (seuil 10 h strict, journée mixte, copie sans contrôle, « Fin le lendemain », téléphone qui ne démarre pas de pointage). Mais **la question « Tu as pris une pause ? » est réécrite avec 30 min présélectionnées + un bouton « Valider »**, le compteur « 1/3, 2/3, 3/3 » des questions d'envoi est faux, **les confirmations de retrait et de « Envoyer votre journée maintenant ? » ne sont pas dessinées**, et la règle des 14 h n'est mentionnée nulle part.
5. **README §6 (« Aucun libellé cité par l'assistant n'est renommé ») est faux** : « Activer les notifications », « Ma journée », « Ma semaine », « Mon mois », « Retirer ce chantier », « Début » / « Fin », « Terminer ma journée » (pointage oublié) changent ou disparaissent, et le scanner (en-tête → barre du bas) et le bouton assistant (barre du bas → en-tête) **échangent leurs places**. Sur les 44 ancres `data-guide` de `worker-tours.ts`, **une seule** est nommée au README.
6. **L'assistant (AS7, AS8) décrit un comportement qui n'est pas au cahier** : l'assistant ouvre le formulaire d'intervention pré-rempli, se réduit en pastille, et une fenêtre « Abandonner la modification ? » censée exister « sur le bureau » **n'existe pas dans le dépôt**. À l'inverse, l'historique de l'assistant (AS4 à AS6) est **déjà en service dans le code** avec d'autres libellés (le cahier le dit « pas en service » : périmé).
7. **/pointer** : P03 mélange deux cas du cahier en une combinaison impossible (« QR expiré » + « Réessayer »), P02 n'a plus « Ajouter une intervention » au départ, et sur les 6 états du cahier §7 un seul est dessiné proprement (arrivée / départ) : l'attente avec connexion sur place et « annulé / rien à enregistrer » sont en note seulement, l'information du QR fixe est absente.
8. **Bande des jours et données** : sur E14 et E15 le jaune « aujourd'hui » est posé sur le mercredi 14 ; le « jour affiché » n'est jamais distingué ; la tuile PAUSES affiche « 0:30 » en dur (journées vides comprises) ; E25 annonce « 31:30 ENVOYÉES » pour 16:00 ; la ligne d'aide « LE POINTAGE EN COURS NE PART PAS » est fausse sur 8 écrans.
9. **Écrans non dessinés** : le README en nomme 10 (Mois, Historique détaillé, formulaire de congé, Mes demandes, Documents, formations avec lecteur, Informations, scanner, connexion sur place, information QR fixe) + le guide pas à pas ; j'en trouve **19 de plus** qui ne sont que décrits en note, ou nulle part (liste au §6.2).
10. **Conséquence** : la liste de contrôle ne peut pas servir de recette en l'état. Demande globale au designer : une ligne par S, quatre statuts honnêtes, un libellé *visible dans le cadre* pour chaque « dessinée », et la table ancien → nouveau (§5).

---

## 1. Chiffres

| Mesure | Valeur |
|---|---|
| Lignes du README §3 | **94** = 86 C + 3 R + 5 D (S83 à S93 sont une seule ligne C) |
| Capacités représentées | **104** = 96 C + 3 R + 5 D (R : S47, S62, S72 · D : S51, S53, S55, S69, S77) |
| Annexe du cahier vs README | mêmes 104 numéros, aucun manquant, aucun en trop, aucun renuméroté. Libellés des 93 lignes simples : 12 identiques, 81 **abrégés** par le README sans changer le sens, **dont 7 abréviations qui font perdre une condition** : S8 (« réseau requis »), S26 (« dont pointage en cours »), S74 (« activer / couper »), S99 (« si ticket connu »), S102 (« rôle refusé »), S103 (« touchables »), S104 (« chantiers, pauses à préciser, route, panier ») |
| Écrans de la planche | **39** (28 E + 3 P + 8 AS) |
| Verdict vérifié (104 capacités) | **✔ 37 · ◐ 49 · ✘ 7 · ∅ 11** |
| Des 96 « C » | ✔ 35 · ◐ 43 · ✘ 7 · ∅ 11 |
| Des 3 « R » | ◐ 3 |
| Des 5 « D » | ✔ 2 (S69, S77) · ◐ 3 (S51, S53, S55 : la ligne de « Plus » est dessinée, la destination non) |
| Capacités citées par **aucun** écran (tableaux README §2, §9 et champs `covers`) | **16** : S10, S11, S48, S50, S56, S57, S63, S64, S65, S66, S67, S68, S90, S93, S101, S103 |
| Texte présent dans le DOM mais **hors cadre** | E05 : 23 textes (CHANTIERS DU JOUR, 3 cartes, Route / Pause, réunion, tâches 1/3) · E04 : 5 (carte Atelier Fictif, « Terminé le… ») · E12 : 2 |
| Écrans où la ligne d'aide « LE POINTAGE EN COURS NE PART PAS » est fausse | **8** : E04, E08, E09, E10, E11, E14, E18, E22 |
| Ancres `data-guide` visées par `worker-tours.ts` | **44** ; nommées au README : **1** (`journee.envoyer`) |
| Libellés entre « » cités par `worker-tours.ts`, `WORKER_GUIDE`, `WORKER_NAV` | **58** : 21 absents de la planche (13 parce que l'écran n'est pas dessiné, 8 réellement renommés ou supprimés) ; sur les 37 « trouvés », 9 ne le sont que comme fragment d'un autre texte (Au, Du, Début, Fin, Photo, Autre, En attente, Copier, Ma journée) |

---

## 2. Problèmes, par gravité

Chaque problème : **où**, **preuve**, **demande précise au designer**. Références code : `fichier:ligne` du dépôt ; « L.nnn » : planche d'origine.

### Bloquants

**PB01 · Liste de contrôle : des statuts « couverte » faux, des lignes invérifiables**
- **Où** : README §3 (L.66 à L.159), §2 (L.58), §9 ; champs `covers` de la planche.
- **Preuve** : 7 capacités « C » sans rien dans le cadre (S9, S19, S31, S61, S89, S90, S98) ; 11 « C » sur des écrans que le README dit non dessinés (S50, S56, S57, S63 à S68, S93, S95). S94 est contradictoire : §2 L.58 « connexion sur place de /pointer » est dans « pas encore dessinés », §3 L.149 dit « C — P01 (attente, #kx-pass conservé) » alors que P01 est l'arrivée enregistrée. S50 : « même liste que Semaine » (L.115) est faux (cahier O5 : le Mois ne liste que les jours avec planning ou heures, avec « À envoyer » / « À déclarer »). S83 à S93 : une ligne pour onze capacités, et le §9 rattache S89 à AS7 (formulaire pré-rempli), qui n'est pas « raccourcis vers les écrans / Me guider pas à pas ». 16 capacités ne sont citées par aucun écran. Les libellés de capacité du README sont abrégés : 7 abréviations font perdre une condition du cahier (S8, S26, S74, S99, S102, S103, S104 : voir §1), ce qui masque deux manques réels (S103 « touchables », S104 « chantiers, route »).
- **Demande** : (1) une ligne par S (104 lignes, S83 à S93 séparés) ; (2) quatre statuts, pas trois : *dessinée* (écran + libellé ou état **visible dans le cadre**), *décrite en note seulement*, *non dessinée (prochaine vague)*, *déplacée (où)* ; (3) pour chaque « dessinée », le code d'écran **et** le texte visible qui la prouve ; (4) repasser en « non dessinée / note seulement » au minimum S9, S19, S31, S50, S56, S57, S61, S63 à S68, S89, S90, S93, S95, S98 ; (5) aligner §2, §3, §9 et les `covers`.

**PB02 · Libellés et ancres : README §6 est faux et la table ancien → nouveau manque**
- **Où** : README §6 (L.209 à L.213) ; §5, colonne « Repères à garder » ; planche header (L.440), E26 (L.523), E17 (L.496), E21 (L.508).
- **Preuve** : voir §5 pour le détail. En bref : « Activer les notifications » devient une ligne « Notifications » + pastille « Activer » (E26), alors que §6 le déclare non renommé ; « Ma journée » / « Ma semaine » / « Mon mois » (`WORKER_NAV`, `worker-assistant-core.ts:439-441`, 11 fiches `WORKER_GUIDE` (sur 25), 10 scripts de test) n'existent plus (onglets « Journée / Semaine / Mois », titre = la date) ; « Retirer ce chantier » → « Retirer cette intervention » ; « Terminer ma journée » du pointage oublié → « Enregistrer la fin » ; « Début » et « Fin » (deux boutons `.bt-timecard`, `poseur-day.tsx:2677-2685`) → un champ « Début → fin » ; le README attribue `.bt-timecard` à la carte de pointage, c'est faux ; scanner (en-tête, `page.tsx:548-551`, `data-guide="entete.scanner"`) et assistant (barre du bas, `poseur-day.tsx:2588`, `journee.assistant`) échangent leurs places ; l'aria-label « Mon compte et menu » (12 scripts) et le rôle `menu` disparaissent. `worker-tours.ts` vise **44** ancres, le README n'en nomme qu'**une**. `npm run test:guides` vérifie que chaque ancre existe et que chaque libellé entre « » est dans le code : il échouera sur plusieurs fiches tant que les textes ou les écrans ne sont pas alignés.
- **Demande** : livrer **la table complète ancien → nouveau** : pour chacune des 44 ancres + `journee.assistant` + les `data-testid` lus par les scripts (`scan-open`, `dock-assistant`, `lt-finish`, `panier`, `planned-confirm-*`…) + les `aria-label` + les classes `.bt-*` : « conservé sur tel élément / déplacé vers / supprimé (raison) ». Corriger §6 : lister chaque libellé renommé ou déplacé (§5 en donne 20 lignes) au lieu de « aucun renommé ».

### Importants

**PB03 · L'écran de référence ne montre pas ses propres capacités (E05, E04)**
- **Où** : E05 (L.463), E04 (L.459), E12 (L.482).
- **Preuve** : mesure de visibilité : sous la mini-frise de E05, **23 textes sont hors cadre** (« 1:00 entre 11:30 et 12:30 — c'était quoi ? », Route, Pause, carte « Villa Exemple EN COURS · ⧉ 2 », carte réunion, « TÂCHES DU JOUR 1/3 »). S31 (Route / Pause) n'apparaît dans aucun autre écran. Sur E04 la carte « Atelier Fictif » (« heures à préciser », « Terminé le 15 octobre 2026 ») est hors cadre : **S9 n'est visible nulle part**, et `CartePointage` n'a pas de prop `termineLe` (README L.186) alors que le cahier S9 exige carte, pointage en cours, Semaine, Mois, Historique. Sur E12 le retour passager recouvre la carte RETIRÉ.
- **Demande** : une variante défilée de E05 (E05b : chantiers, trou Route / Pause avec une réponse posée, réunion, tâches) et de E04 (4e carte) ; montrer « Terminé le … » sur le pointage en cours, la Semaine, le Mois, l'Historique ou dire où il va ; décaler le retour passager de E12 pour qu'il ne masque pas « RETIRÉ ».

**PB04 · S104 : les compteurs « chantiers » et « route (payée) » disparaissent sans le dire**
- **Où** : README L.187 (`TuilesJour`: `total, pausesAPreciser, panier, verrouille`), L.159 ; planche tuiles (L.381-382).
- **Preuve** : le code affiche quatre compteurs dans `.bt-stats` : chantiers, pauses (+ « N à préciser »), route (« · payée » si l'entreprise la paie, si > 0) et panier (`poseur-day.tsx:2192-2224`). La planche n'en garde que trois (TOTAL, PAUSES, PANIER). Le cahier §3 et l'annexe S104 listent « chantiers, pauses à préciser, route, panier ».
- **Demande** : redessiner les compteurs chantiers et route (avec « payée / non payée »), ou écrire où ils vont et pourquoi ; ajouter les props `chantiers` et `route` à `TuilesJour`.

**PB05 · Garde-fous métier non dessinés (cahier §8.1 : « à conserver »)**
- **Où** : E21 (L.508), E23 (L.514), P02 (L.532), E12 (L.482).
- **Preuve** : (a) confirmation de retrait « Retirer ce chantier ? » avec ses trois textes (envoyé → « restera visible comme « Retiré » et la secrétaire en sera informée » ; brouillon vide → « sera supprimé » ; sinon « Les heures seront perdues »), boutons « Non » / « Oui, retirer » (`poseur-day.tsx:2923-2952`, `data-guide="confirmer.retirer"`, lue par 3 scripts) : **aucun écran**. (b) « Envoyer votre journée maintenant ? » Oui / Pas maintenant, avec le total (`poseur-day.tsx:3016-3030`) : absent, alors que S48 est cochée C sur P02. (c) refus de l'OK de l'éditeur (heures vides ou identiques, chevauchement, pause ≥ ligne, chantier non choisi) : absents. (d) « Votre pointage est encore en cours » : un cas sur six dessiné ; le texte est réécrit alors que `pointage-lot10.mjs` teste les textes exacts, et **la consigne « si vous pointez à la borne, ne scannez plus en partant… sinon la borne ouvrira un nouveau pointage » disparaît** (`poseur-day.tsx:2977`). (e) issues d'envoi (« N chantiers envoyés sur M — les autres sont verrouillés », rien envoyé, refus de clôture) : absentes.
- **Demande** : pour chacun, soit un écran, soit la mention explicite « inchangé : habillage seulement » dans le README ; remettre la consigne borne dans E23 ; dessiner les deux textes de retrait (envoyé / brouillon) ; dessiner « Envoyer votre journée maintenant ? ».

**PB06 · Contrôles d'envoi : compteur faux, un refus sur trois dessiné, note fausse**
- **Où** : E08 (L.471), E09 (L.474), E10 (L.477), E11 (L.479).
- **Preuve** : « AVANT L'ENVOI · 1/3 », « 2/3 », « 3/3 » suppose que les trois questions se suivent toujours. Dans le code chaque contrôle est conditionnel et la pause se pose **une plage à la fois**, donc plusieurs fois (`poseur-day.tsx:1583-1667`). Ordre réel : (1) sortie oubliée sans fin, (2) chevauchement, (3) prévu, (4) pauses, (5) « Ajoute un chantier », (6) > 10 h, (7) envoi : l'ordre n'est écrit nulle part au README. E11 ne dessine que (2) ; la note « Mêmes phrases pour « sortie oubliée sans fin » et « Ajoute un chantier » » est fausse (`lib/qr-entry.ts:25` et `poseur-day.tsx:1662` sont deux phrases différentes, aujourd'hui des toasts).
- **Demande** : supprimer le compteur « n/3 » (ou le justifier par un exemple où les trois s'enchaînent) ; dessiner les arrêts (1) et (5) avec leur texte ; écrire l'ordre des 7 contrôles au README ; dessiner la 2e plage de pause (« une plage à la fois »).

**PB07 · « Tu as pris une pause ? » : interaction réécrite et pause présélectionnée**
- **Où** : E09 (L.474-476) ; code `pause-picker.tsx:62`, `poseur-day.tsx:2892-2901`.
- **Preuve** : dans le code, chaque puce valide en un toucher (« Non », 15 min, …) ; seul « Autre » demande « OK ». La planche présélectionne **« 30 min »** et ajoute un bouton « Valider · pause 30 min ». Un salarié qui touche « Valider » sans lire déduit 30 min de sa paie. L'indice « Pendant cette plage. Plusieurs pauses ? Additionne-les. » disparaît. Le seuil (> 6 h d'affilée, écarts < 20 min) n'est écrit nulle part à l'écran ni en note.
- **Demande** : aucune valeur présélectionnée (état initial vide) ; garder le toucher unique ou justifier le bouton « Valider » ; remettre l'indice « additionne-les » ; écrire le seuil dans la note.

**PB08 · Pointage oublié et nuit (S14, S15)**
- **Où** : E17 (L.496), E18 (L.499), frise « Poste de nuit » (L.557).
- **Preuve** : le code demande « Tu as fini à quelle heure ? » (`live-timer.tsx:218`) et garde « Terminer ma journée » (`live-timer.tsx:230-231`, `lt-finish`, `journee.terminer`) ; E17 supprime la question et renomme le bouton « Enregistrer la fin » (props `onEnregistrerFin`, README L.186). La bande de E17 donne le lundi 12 « ✓ envoyé » alors que le pointage ouvert date de lundi 08:00. La **règle des 14 h** (pointage d'un jour précédent ouvert depuis plus de 14 h → ligne « sortie oubliée » la nuit ; un poste de nuit commencé à 21 h reste ouvert ; ouvert il s'affiche « Sortie oubliée » même en cours) n'apparaît ni au README ni sur la planche ; la frise « Poste de nuit » (21:00 → 01:00 puis 01:30 → 05:30 « en cours ») ne dit pas à quelle journée appartient la 2e ligne (« la nuit est comptée sur la journée du début »).
- **Demande** : remettre « Tu as fini à quelle heure ? » ; garder « Terminer ma journée » (ou lister le renommage dans la table PB02) ; écrire la règle 14 h et le cas « poste de nuit en cours = Sortie oubliée » ; corriger la bande de E17.

**PB09 · /pointer : P03 impossible, P02 incomplet, états absents**
- **Où** : P02 (L.532), P03 (L.533), `donnees-exemple.ts:91` (`pointer.refus`).
- **Preuve** : P03 affiche « QR expiré » (cas 5 du cahier : message serveur, bouton unique « Ouvrir mon espace ») avec les boutons du cas 6 (refus de QR fixe : « Réessayer » + « Ajouter mon intervention à la main »). Dans `app/pointer/page.tsx:239-243` un QR expiré n'a pas de ticket : « Réessayer » n'existe pas dans ce cas ; l'exemple `refus: { raison: 'QR expiré', ticketConnu: true }` est donc impossible. P02 n'a que « Envoyer ma journée » et la note invente « sinon « Ajouter une intervention » », alors que le code montre **les deux** boutons au départ (`pointer/page.tsx:311-317`). Sur les 6 états du cahier §7 : (3) arrivée / départ dessiné (P01, P02) ; (5) message serveur et (6) refus de QR fixe fondus dans P03 ; (4) « Pointage annulé (moins d'une minute) » et « Rien à enregistrer » (neutres, `pointer/page.tsx:279-290` et `322-329`) **en note seulement** ; (1) attente (« Vérification du QR… ») et connexion sur place **en note seulement** ; (2) information du QR fixe **absente**.
- **Demande** : P03a (message serveur + « Ouvrir mon espace »), P03b (refus de QR fixe : une raison parmi position refusée / imprécise / hors zone / QR remplacé / point non posé + « Ajouter mon intervention à la main » + « Réessayer » si ticket connu), P03c neutre (annulé / rien à enregistrer) ; remettre « Ajouter une intervention » sur P02 ; dessiner attente, connexion sur place, information QR fixe ; corriger l'exemple.

**PB10 · Assistant : comportement nouveau, S89 et S90 absents, historique qui diverge du code en service**
- **Où** : AS1 à AS8 (L.537 à L.551), README §9.
- **Preuve** : (a) AS7 et AS8 : l'assistant ouvre le formulaire d'intervention du jour pré-rempli, se réduit en pastille « ASSISTANT · EN ATTENTE / Reprendre », message « Formulaire fermé, rien n'a été ajouté. ». Dans le code, « Modifier » rouvre la fiche **dans l'assistant** (`worker-draft-card.tsx:173`) ; les chaînes « Formulaire fermé, rien n'a été ajouté. », « ASSISTANT · EN ATTENTE » et « Abandonner la modification ? » n'existent **nulle part** dans le dépôt (recherche sur tout le dépôt hors `node_modules`). (b) README §9 : « la fenêtre « Abandonner la modification ? » s'ouvre (même règle que sur le bureau) » : la règle « sur le bureau » est introuvable (le code a seulement « Abandonner cette action ? », `assistant-panel.tsx:481`, qui sert à un autre cas : une fiche pas encore confirmée). (c) S89 (raccourcis vers les écrans, « Me guider pas à pas ») et S90 (heures, planning, collègues) : aucun écran. (d) AS4 à AS6 : l'historique est déjà en service dans le code (`assistant-panel.tsx:471-483`, `586-770`) avec « Conversations », « Retour », confirmation **en place** « Supprimer ? » **Oui / Non**, « Tout effacer ? » **Oui / Non**, états chargement / erreur (« Historique indisponible », « Réessayer »), verrou (« Une action est en cours… ») et « Abandonner cette action ? » ; la planche dessine « Historique », « ‹ Retour à la conversation », **Garder / Supprimer**, une alerte modale pour « Tout effacer ? », et aucun de ces états. Le cahier (« pas en service ») est périmé : le designer a travaillé sur une base fausse. (e) « N questions restantes aujourd'hui » (pied, `assistant-panel.tsx:575`) devient « 18 QUESTIONS RESTANTES » en en-tête ; « Bonjour 👋 » devient « Bonjour Sam ». Tests concernés : `assistant-historique.mjs`, `assistant-effacer.mjs`, `assistant-panneau.mjs`.
- **Demande** : dire si AS7 / AS8 sont une **nouvelle fonction demandée** (sinon les retirer) ; dessiner S89 et S90 ; repartir du code (`assistant-panel.tsx`) pour l'historique : mêmes libellés ou table de renommage ; dessiner les états chargement / erreur / verrou / « Abandonner cette action ? » et le quota épuisé.

**PB11 · Bande des 7 jours : états faux, règle d'absences changée en silence**
- **Où** : E14 (L.487), E15 (L.490), E18 (L.499), README §4 ; `strip(...)` L.440.
- **Preuve** : E14 (mardi 13 ouvert) : jaune « aujourd'hui » sur le **14** ; E15 (mercredi 14) : jaune sur le 14 et le jeudi 15 en « à venir » ; E18 (lundi 12) : le jaune est bien sur le 15 mais **rien ne marque le jour ouvert** (« contour crème si affiché », §4, n'existe nulle part). Impossible de vérifier S1 « toucher le jour jaune revient à aujourd'hui » dans ces écrans. Le cahier O1 dit « Absences : Semaine et Mois seulement » ; la bande les montre sur Journée (rayures + lettre) : changement de règle non déclaré, qui oblige à charger planning, heures, absences et clôtures de la semaine au chargement de `/poseur`. Les rappels du code relisent **60 jours** (`page.tsx:227`), la bande n'en montre que 7 (S47 : la liste « N journées à envoyer » n'est pas dessinée).
- **Demande** : dessiner séparément « aujourd'hui » et « jour affiché » (E14, E15, E18 corrigés) ; déclarer l'extension aux absences ; dessiner « N journées à envoyer » ; préciser la règle de priorité si un jour est à la fois « oublié » et « renvoyé ».

**PB12 · « Dupliquer cette journée » : l'entrée n'est dessinée nulle part**
- **Où** : E24 (L.517), README L.99.
- **Preuve** : README : « ouvert par « Dupliquer cette journée » sous la liste des chantiers (même place qu'aujourd'hui) » ; ce texte n'est dans aucun cadre (`poseur-day.tsx:2535-2542`, visible seulement si la journée n'est pas vide et le mois ouvert). E24 : puces de dates (le code a un calendrier, `copier.valider` : « choisissez les jours sur le calendrier, puis touchez « Copier » ») ; bouton « Copier sur 2 jours » (le code : « Copier (N) ») ; **« ven. 16 » est présélectionné alors que c'est un jour de congé** (E05, E25).
- **Demande** : dessiner le bouton d'entrée (sous les cartes, E05b) ; justifier ou retirer la présélection ; noter les jours déjà remplis ou en absence ; lister « Copier sur N jours » dans la table PB02.

**PB13 · Éditeur d'intervention : S19, S20, « Annuler », réglage de l'heure**
- **Où** : E21 (L.508), E22 (L.511), AS7 (L.548).
- **Preuve** : S19 : « C'était quoi ? » (nom 80 car., ville 60) et « Ajouter ce chantier » ne sont que dans la note de E22. S20 : un seul champ « Début → fin 07:30 → 11:30 » ; la note dit « Heure exacte gardée : 07:32 » alors que le champ affiche 07:30 ; la fenêtre « Réglage de l'heure » (molette, « Valider les heures ») n'est pas dessinée ; l'éditeur du code a deux boutons Début / Fin (`.bt-timecard`). E21 n'a pas de bouton « Annuler » (le cahier : « **Annuler** (sans confirmation) »), AS7 en a un.
- **Demande** : dessiner le sous-formulaire « Autre chantier », la fenêtre « Réglage de l'heure » et une ligne dont l'heure retouchée diffère du quart d'heure (affichage cohérent) ; trancher « Annuler » (bouton ou ✕ seul) et l'écrire partout.

**PB14 · Réserves : état sur la carte, liste, retour passager**
- **Où** : E20 (L.505), E05 (L.463), `CarteChantier` (README L.189).
- **Preuve** : S38 : l'état d'une réserve sur l'intervention du jour (à lever / levée par le bureau / levée le jj mmm) n'est dessiné sur aucune carte et `CarteChantier` n'a pas de prop réserve. S59 : la liste (date, chantier · ville, « Sans détail écrit. », `worker-reserves.tsx`) n'est pas dessinée : E20 saute de la puce à la feuille. S61 / S103 : « Réserve levée · Annuler » (10 s) n'est dessiné nulle part (`hasToast:false`).
- **Demande** : dessiner la carte avec réserve (3 états), la liste, et le retour passager avec son bouton « Annuler » au-dessus de la barre.

**PB15 · Écrans « pas encore dessinés » : liste complète et impact (voir §6)**
- **Où** : README §2 L.58, §3, §9.
- **Preuve** : 10 écrans déclarés + guide S93 ; **19** autres écrans ou états décrits en note seulement, ou nulle part (§6.2). Impact : 11 lignes ∅ + 10 lignes ◐ qui dépendent d'un écran non dessiné (S11, S25, S51, S52, S53, S54, S55, S62, S75, S94) ; 8 ancres de guide (`conges.faire / type / envoyer / annuler`, `docs.photo`, `docs.envoyer`, `historique.jour`, `infos.fermer`) et 8 fiches `WORKER_GUIDE` sans écran cible.
- **Demande** : confirmer l'ordre de la prochaine vague et inscrire, pour chaque écran non dessiné, les libellés et ancres qu'il garde.

**PB16 · Clôture : une fenêtre devient un bandeau, avec un texte hybride**
- **Où** : E16 (L.493).
- **Preuve** : dans le code « Mois clôturé » et « Heures clôturées » sont une **fenêtre** (`poseur-day.tsx:2824-2842`) avec deux corps de texte différents (« …la paie est partie… elle peut rouvrir le mois » / « Le bureau a clôturé tes heures jusqu'au {date}… »). E16 : bandeau permanent, titre « Mois clôturé » + corps de « Heures clôturées » ; note « Variante « Heures clôturées » : même message, autre titre » : faux. L'envoi devient grisé sur mois clôturé : le cahier §6 le listait comme point ouvert (« envoi actif sur mois clôturé »), tranché sans le dire. 6 scripts testent les fenêtres « Mois clôturé » / « Heures clôturées ». Bande : le 16, 17, 18 restent « à venir » alors que « clôturé jusqu'au 31 octobre ».
- **Demande** : conserver les deux textes ; dire si c'est un bandeau, une fenêtre, ou les deux ; lister la décision au §10.

**PB17 · Vocabulaire d'états : trois étiquettes nouvelles et un point ouvert ignoré**
- **Où** : E11 (L.479), E14 (L.487), README S37 (L.102).
- **Preuve** : le README liste 8 étiquettes ; la planche en utilise aussi « À CORRIGER » (E14), « CHEVAUCHEMENT » et « 11:00–11:30 » (E11, qui **remplace** l'état « À ENVOYER » de la 2e carte). Le cahier §3 : « L'ancien « validé » vaut « envoyé » » ; §6 : « Brouillon » (Historique, Mois) = « à envoyer », « Envoye » sans accent (Historique et PDF) : le README ne dit rien, Mois et Historique n'étant pas dessinés.
- **Demande** : remplacer « À CORRIGER » par « À ENVOYER » (la note de E14 le dit) ou justifier un 9e état ; garder l'état sur les cartes de E11 ; fixer le vocabulaire Mois / Historique (« À ENVOYER », « ENVOYÉ ») ou le signaler comme point ouvert.

**PB18 · Décisions prises sans être listées au §10**
- **Où** : README §10, S101, E08, E16, E28.
- **Preuve** : (a) S101 : « questions d'envoi (E08, E09) incluses » dans la pile du retour Android : le cahier §5 disait « à décider » ; (b) E08 : « focus initial sur « Non, je corrige » » : dans le code le premier bouton est « Oui, envoyer ces horaires » (`poseur-day.tsx:2870`) et aucun `onOpenAutoFocus` n'est posé ; (c) envoi grisé sur mois clôturé (PB16) ; (d) E28 : bouton « Se déconnecter » + « Vous allez être déconnecté » (le cahier : déconnexion automatique) ; (e) « Abandonner la modification ? » (PB10) ; (f) le point « panier coché hors-ligne sur une ligne déjà au serveur (rien n'est écrit) » reste ouvert et n'est pas repris.
- **Demande** : ajouter ces décisions au §10 « Points à valider ».

### Mineurs

- **M1 · Ligne d'aide fausse et état inutilisé** — « LE POINTAGE EN COURS NE PART PAS » est codée en dur dans l'état « prêt » (L.420) : affichée sur 8 écrans sans pointage (E04, E08, E09, E10, E11, E14, E18, E22). L'état « Envoi… » (L.423) n'est jamais montré ; E02 (échec de chargement) affiche « RIEN À ENVOYER » et un « + » actif. *Demande : ligne d'aide contextuelle ; dessiner « Envoi… ».*
- **M2 · Tuile PAUSES « 0:30 » en dur** (L.382) — journées vides (E03, E04, E17), E08 et E13 (une ligne brute de 4:00 pour un total de 4:00 ou 7:30), E09 (« sans pause notée » avec 0:30 déjà comptées). *Demande : données cohérentes, une valeur par écran.*
- **M3 · E25 Semaine** — « 31:30 ENVOYÉES » alors que 7:30 + 8:30 = 16:00 ; pas de navigation de semaine ; ville, créneau, état « Retirée », tâches avec heure absents (cahier O5). *Demande : corriger le total, dessiner la navigation.*
- **M4 · Case de tâche 26 px** (L.194) alors que README S8 dit « Case 44 px ». *Demande : zone tactile 44 px réelle ou corriger le README.*
- **M5 · Données d'exemple** — initiales « SG » pour « Sam Exemple » (`donnees-exemple.ts:24`, bande, avatar) ; E27 : jours « mer. 14, jeu. 15, ven. 9 » (ordre et nombre incohérents avec « 7 derniers jours »). *Demande : « SE » ; ordre chronologique.*
- **M6 · Apostrophes** — la planche utilise l'apostrophe droite `'` partout ; le code utilise `’` (`J’ai fini ma journée`, `worker-assistant-core.ts:1192`). Les « 4 suggestions exactes » ne le sont pas au caractère près. *Demande : copier les chaînes du code telles quelles.*
- **M7 · Phrases de spécification affichées comme texte d'interface** — E22 « Toujours proposé, même sans résultat », E20 « Indisponible hors-ligne. Marche même sur un mois clôturé. », E21 « la molette ne montre que les quarts d'heure » : à ne pas livrer comme libellés. *Demande : marquer ce qui est copie d'écran et ce qui est annotation.*
- **M8 · Mini-frise vs sa règle** — E12 : le trait « maintenant » (16:05) élargit l'axe à 18 h alors qu'aucun pointage n'est en cours (la règle du README : seul le pointage en cours compte ; sans lui l'axe serait 6 h → 17 h) ; E11 dit « Chevauchement 11:00–11:30 », la démo de tête « … : envoi bloqué ».
- **M9 · E07 incohérent** — « Réseau revenu : 2 saisies vont partir… » mais une carte est déjà « À ENVOYER » et le cahier dit que le transfert est automatique.
- **M10 · Tolérance et appareils** — le cahier §6 (« fonctions pas encore installées : rien ne s'affiche ») n'est dessiné nulle part ; 360 × 640 et l'ordinateur (`.bt-phone` 480 / 920 px) ne sont pas traités (integration §2.8).

---

## 3. Tableau S1 à S104

« README » = statut du README (C couverte, R regroupée, D déplacée). « Vérifié » = mon verdict (✔ ◐ ✘ ∅, légende en tête). Le détail de chaque ◐ / ✘ / ∅ est repris dans les problèmes PB01 à PB18.

| S | Capacité (cahier) | README | Vérifié | Constat (preuve) |
|---|---|---|---|---|
| S1 | Jour affiché ; retour à aujourd'hui | C | ◐ | E05 : kicker « AUJOURD’HUI » + jour jaune OK. E14 (mardi 13) et E15 (mercredi 14) posent le jaune « aujourd’hui » sur le 14 alors qu’aujourd’hui est jeudi 15 partout ailleurs ; le « contour crème si affiché » (§4) n’existe nulle part : sur E18 (lundi 12) rien ne distingue le jour ouvert. Planche L.440, L.487, L.490. |
| S2 | Créneaux prévus, distincts des heures saisies | C | ✔ | E04 : cartes en pointillés, étiquette « PRÉVU », hors total (0:00). |
| S3 | Noter ses heures sur un créneau prévu | C | ✔ | E04 : « Touche une carte pour noter tes heures… » ; l’éditeur d’un prévu (chantier figé) n’est pas dessiné à part, E21 montre une ligne « À ENVOYER ». |
| S4 | Savoir qu'un créneau prévu ne partira pas | C | ◐ | E04 : « Ne partira pas : chevauche Villa Exemple et n’a pas de fin. » visible mais tronquée en bas par la barre ; la carte « sans heures » (Atelier Fictif) est hors cadre et ne dit pas qu’elle ne partira pas (cahier O1 : « sans début/fin, il ne partira pas et l’écran le dit »). |
| S5 | Nombre de documents d'un chantier | C | ✔ | E04 : « PRÉVU · ⧉ 1 » visible ; « EN COURS · ⧉ 2 » (E05) hors cadre. |
| S6 | Réunions du jour | C | ◐ | E05 : la carte rose de réunion est hors cadre (sous la barre). Seule trace visible : E25 « Villa Exemple · Réunion 17:15 ». |
| S7 | Tâches du jour et compteur | C | ◐ | Compteur « 0/1 » visible sur E06 ; « 1/3 » (E05) hors cadre. |
| S8 | Cocher une tâche (réseau requis) | C | ◐ | E06 : case grisée visible. La case dessinée fait 26 px (planche L.194) alors que le README dit « Case 44 px ». |
| S9 | « Terminé le … » sur un chantier terminé | C | ✘ | Seule trace : « Terminé le 15 octobre 2026 » sur la 4e carte de E04, hors cadre. Rien sur le pointage en cours (CartePointage n’a pas de prop termineLe, README L.186), Semaine, Mois, Historique (cahier S9). |
| S10 | Pointer en scannant le QR de la tablette | C | ✔ | P01 : résultat d’arrivée après scan de l’appareil photo (le scan lui-même est hors écran). Aucun écran ne cite S10 dans son champ « covers ». |
| S11 | Scanner ce QR depuis l'application | C | ◐ | Bouton « QR » visible (barre du pouce). Lecteur intégré non dessiné (README §2 L.58). Emplacement changé (en-tête → barre du bas) sans être déclaré ; variante « scanner absent » non dessinée. |
| S12 | Pointage en cours (chantier, début, durée) | C | ✔ | E05 : carte sombre « POINTAGE EN COURS · DEPUIS 12:30 », 2:42, Villa Exemple / Lyon. |
| S13 | Terminer le pointage en cours | C | ✔ | E05 : « Terminer ma journée » dans la carte. |
| S14 | Pointage oublié : indiquer la fin (nuit comprise) | C | ◐ | E17 : carte rouge, champ 06:30, « Fin le lendemain (mardi 06:30) — la nuit est comptée sur la journée du début. » OK. Manquent « Tu as fini à quelle heure ? » (live-timer.tsx:218) ; le bouton est renommé « Enregistrer la fin » alors que le code garde « Terminer ma journée » (live-timer.tsx:230-231, data-testid lt-finish, data-guide journee.terminer) ; refus « fin = début » en note seulement. |
| S15 | Voir et compléter une « sortie oubliée » | C | ✔ | E18 : deux cas (« 08:00 → fin à compléter » bloquant ; « Fin posée sur l’heure prévue (12:00). Vérifie avant d’envoyer. »). |
| S16 | Pointage rattaché au chantier et au total | C | ◐ | E05 : total 6:42 inclut les minutes courantes (OK). La carte « en cours depuis 12:30 » est hors cadre ; la règle « ne s’ouvre pas » (cahier O2) n’est dite nulle part (README S3 : « toucher la carte ouvre l’éditeur »). |
| S17 | Ajouter une intervention à la main | C | ✔ | Bouton « + » 56 px (aria-label « Ajouter une intervention »). |
| S18 | Choisir le chantier (recherche, « Autre chantier ») | C | ◐ | E22 : recherche « vil », « Autre chantier » toujours proposé. Absents : cas « Aucun chantier trouvé » ; un bouton « Continuer » inventé ; sous-libellé « Toujours proposé, même sans résultat » est une phrase de spec affichée comme texte d’interface. |
| S19 | Créer un « Autre chantier » | C | ✘ | « C’était quoi ? » et « Ajouter ce chantier » n’existent que dans la note de E22 (planche L.511-512), pas dans le cadre. |
| S20 | Régler début et fin ; heure exacte gardée | C | ◐ | E21 : un seul champ « Début → fin 07:30 → 11:30 ». Les deux boutons Début / Fin (`.bt-timecard` ×2, lus par 6 scripts) et la fenêtre « Réglage de l’heure » (molette, « Valider les heures ») ne sont pas dessinés ; la note annonce « Heure exacte gardée : 07:32 » alors que le champ affiche 07:30. |
| S21 | Durée nette (pause déduite) | C | ✔ | E21 : « 4:00 net ». |
| S22 | Total des pauses de la ligne, contrôlé | C | ◐ | E21 : puces 0 / 15 / 30 / 45 / 1 h / 1 h 30 / 2 h / Autre. Absents : lecture de « Autre » (aperçu « = 1 h 15 », 4 messages d’erreur), puces trop longues grisées, indice « Plusieurs pauses ? Additionne-les. » (pause-picker/poseur-day.tsx:2698-2704). |
| S23 | Statut du chantier (réserve ou non) | C | ✔ | E21 : En cours / Sans réserve / Avec réserve. |
| S24 | Note ou détail des réserves | C | ◐ | E21 : champ « Note ». Le libellé « Détail des réserves » (si Avec réserve, poseur-day.tsx:2724) n’est pas dessiné. |
| S25 | Documents du chantier depuis l'éditeur | C | ◐ | E21 : bouton « Documents (2) ». L’écran Documents n’est pas dessiné (README : « inchangé »). |
| S26 | Enregistrer avec contrôles (dont pointage en cours) | C | ◐ | E21 : « OK ». Les refus de l’OK (heures vides ou identiques, chevauchement, pause ≥ ligne, chantier non choisi) ne sont pas dessinés ; E11 est l’arrêt à l’envoi, pas à l’OK ; E23 ne montre qu’un des 6 cas du pointage en cours. |
| S27 | Corriger une intervention (même envoyée) | C | ◐ | E13 et E15 visibles. « Correction envoyée — la secrétaire est prévenue » (journée mixte) et la confirmation de retrait d’une ligne envoyée ne sont pas dessinées. |
| S28 | Retirer une intervention (confirmation) | C | ◐ | E21 « Retirer cette intervention » (le code : « Retirer ce chantier », poseur-day.tsx:2745) ; carte « RETIRÉ » E12 : titre et étiquette visibles, le reste recouvert par le retour passager. La confirmation « Retirer ce chantier ? / Oui, retirer » (poseur-day.tsx:2923-2952) n’est dessinée nulle part. |
| S29 | Fermer l'éditeur sans enregistrer | C | ✔ | ✕ + note « sans confirmation ». (E21 n’a pas de bouton « Annuler », AS7 en a un : incohérence.) |
| S30 | Terminer le pointage recouvert par une intervention | C | ◐ | E23 : cas à deux boutons (texte réécrit, la consigne borne « ne scannez plus en partant » disparaît, poseur-day.tsx:2977). Les 5 cas à bouton unique ne sont que nommés en note. |
| S31 | Qualifier un trou : Route ou Pause | C | ✘ | « 1:00 entre 11:30 et 12:30 — c’était quoi ? » + Route / Pause sont dans la zone de E05 sous la barre : aucun texte visible dans aucun cadre. Seule la tuile « PAUSES 1 à préciser ↓ » se voit. L’état répondu (gap(…, ans), L.409) n’est jamais utilisé. |
| S32 | Panier du jour (cocher / décocher) | C | ◐ | Tuile « PANIER » 64 px, bascule visible (E03, E05, E12). Variante « entreprise sans panier » non dessinée (props panier: boolean/null non expliqué) ; libellés « repas pris / non pris » cités par le guide remplacés par « ✓ Pris / Non pris ». |
| S33 | Copier la journée d'hier | C | ✔ | E03 : « Aucun chantier aujourd’hui. » + « Copier la journée d’hier ». |
| S34 | Dupliquer la journée sur d'autres jours | C | ◐ | E24 visible (puces de dates au lieu du calendrier ; bouton « Copier sur 2 jours » au lieu de « Copier (N) »). Le bouton d’entrée « Dupliquer cette journée » n’est dessiné sur aucun écran ; « ven. 16 » (jour de congé, E05) est présélectionné. |
| S35 | Corrections du bureau / du chef et leur motif | C | ✔ | E15 : « Le bureau a corrigé : 08:00–12:00 → 08:00–12:30 · « motif » » et « Ton chef a corrigé : … ». |
| S36 | « Endroit noté » (anciennes lignes) | C | ✔ | E12 : « Endroit noté ». |
| S37 | État de chaque intervention | C | ◐ | Visibles : À ENVOYER (E07), ENVOYÉ ✓, ▣ CHEZ LE COMPTABLE, RETIRÉ, SUR LE TÉLÉPHONE, PRÉVU, SORTIE OUBLIÉE. « EN COURS » est hors cadre (E05). Étiquettes hors vocabulaire du cahier : « À CORRIGER » (E14), « CHEVAUCHEMENT » et « 11:00–11:30 » à la place de l’état (E11). |
| S38 | État d'une réserve ; la lever | C | ◐ | E20 : formulaire de levée visible. L’état d’une réserve sur la carte du jour (« à lever / levée par le bureau / levée le jj mmm ») n’est dessiné nulle part et CarteChantier n’a pas de prop réserve (README L.189). |
| S39 | « Envoyer ma journée » et ses 5 états | C | ✔ | Les 5 états sont visibles : E06 (grisé), E07 (« Envoyer ce qui reste (2) »), E05 (prêt), E12 (« Journée envoyée ✓ »), E03 (rien à envoyer). Réserves : l’état « Envoi… » (L.423) n’est jamais montré ; ligne d’aide fausse sur 8 écrans (problème M1) ; issues d’envoi (« N chantiers envoyés sur M… ») non dessinées. |
| S40 | Confirmer / corriger les horaires prévus | C | ✔ | E08 (mais compteur « 1/3 », voir PB06). |
| S41 | Répondre à « Tu as pris une pause ? » | C | ◐ | E09 visible, mais interaction réécrite : chaque puce envoie en un toucher dans le code (pause-picker.tsx:62, poseur-day.tsx:2892-2901) ; la planche exige puce + « Valider · pause 30 min » avec 30 min présélectionné (L.474-476). |
| S42 | Confirmer une journée de plus de 10 h | C | ✔ | E10 (10:45) ; seuil « strictement > 10 h » dit en note (code : totalMins > 600, poseur-day.tsx:1559). |
| S43 | Arrêt avant envoi (chevauchement…) | C | ◐ | E11 ne montre que le chevauchement. « Ajoute un chantier » et « Sortie oubliée : mets ton heure de fin avant d’envoyer. » (qui sont des phrases différentes) ne sont pas dessinées ; la note « Mêmes phrases pour… » est fausse. |
| S44 | Modifier une journée envoyée (« Journée déjà envoyée ») | C | ✔ | E13 « Journée déjà envoyée » (corps de texte réécrit, poseur-day.tsx:2846). |
| S45 | Journée renvoyée par le bureau, avec motif | C | ◐ | E14 : message + motif + ↺. L’étiquette de carte « À CORRIGER » contredit la note « lignes repassées à envoyer » ; le jaune « aujourd’hui » est sur le 14 ; « PAUSES 1 à préciser » avec une seule ligne (un trou exige deux lignes). |
| S46 | Clôture et ce qu'elle bloque | C | ◐ | E16 : « Mois clôturé » + ▣. Le code est une fenêtre (poseur-day.tsx:2824-2840) avec deux corps de texte différents ; E16 est un bandeau permanent au texte hybride, et la note « Heures clôturées : même message, autre titre » est fausse. Bande : 16-18 restent « à venir » alors que « jusqu’au 31 octobre ». |
| S47 | Rappels « journée(s) à envoyer » ; ouvrir le jour | R | ◐ | E05 : note d’en-tête « Mardi 13 à envoyer · Ouvrir › » + anneau orange. La liste « N journées à envoyer » (page.tsx:475-498) n’est pas dessinée ; le code relit 60 jours (page.tsx:227), la bande n’en montre que 7. |
| S48 | Après un scan : raccourcis ajouter / envoyer | C | ◐ | P02 : « Envoyer ma journée » visible. Manquent : « Ajouter une intervention » au départ (app/pointer/page.tsx:315), « Envoyer votre journée maintenant ? » Oui / Pas maintenant (poseur-day.tsx:3016-3030), plage autour de l’heure scannée. Aucun écran ne cite S48. |
| S49 | Ma semaine (7 jours visibles) | C | ◐ | E25 : 7 jours en liste. Absents : navigation de semaine ; ville, créneau, état « Retirée » ; total « 31:30 ENVOYÉES » faux (7:30 + 8:30 = 16:00). |
| S50 | Mon mois | C | ∅ | Mois non dessiné. « Même liste que Semaine » est faux : le Mois ne montre que les jours avec planning ou heures, avec « À envoyer » / « À déclarer » (cahier O5). |
| S51 | Historique | D | ◐ | Ligne « Historique » dans E26 ; la vue n’est pas dessinée (README §2). |
| S52 | Export PDF de l'historique | C | ◐ | Badge « PDF » sur la ligne Historique (E26) ; le bouton dans la vue n’est pas dessiné. |
| S53 | « Interventions supprimées » | D | ◐ | E26 : « Interventions supprimées — 60 jours · lecture seule » (sous-ligne). Vue non dessinée. |
| S54 | Ouvrir un jour depuis semaine, mois ou rappel | C | ◐ | Bande, Semaine (E25) et note d’en-tête OK ; Mois non dessiné. |
| S55 | Faire une demande | D | ◐ | E26 : « Mes congés — 1 en attente ». Formulaire non dessiné (README §2). |
| S56 | Mes demandes : états, motif de refus | C | ∅ | « Mes demandes, motif de refus » : « non redessiné ». |
| S57 | Annuler une demande en attente | C | ∅ | « Annuler une demande » : « non redessiné ». |
| S58 | Absences posées par le bureau | C | ✔ | Bande : rayures + « C » ; E25 « CONGÉ ». Lettres M / I / R seulement dans la légende ; « M » se confond avec l’initiale de mardi / mercredi. |
| S59 | Rappel « N réserves à lever » et liste | C | ◐ | E05 : puce rouge « 1 réserve à lever › » ; la liste (date, chantier · ville, « Sans détail écrit. », worker-reserves.tsx) n’est pas dessinée. |
| S60 | Lever une réserve (commentaire, photo) | C | ✔ | E20 (commentaire 500 car., photo, « Lever la réserve » / « Annuler »). |
| S61 | Annuler la levée (10 s) | C | ✘ | Aucun retour passager avec « Annuler » n’est dessiné (E20 : hasToast false, L.505). Texte uniquement dans la note. |
| S62 | Rappel « N formations à voir », menu avec compteur | R | ◐ | Puce « 2 formations à voir › » (E05) et ligne « Formations — 2 à voir » (E26) OK. La « pastille rouge sur l’onglet Plus » (README) n’existe dans aucune barre d’onglets (TABS, L.425, n’a pas de pastille). |
| S63 | Ouvrir un lien ou document, regarder une vidéo | C | ∅ | « Liste des formations (inchangée) » : non dessinée ; lecteur intégré cité au §2. |
| S64 | Marquer « Vue » (annulable) | C | ∅ | idem. |
| S65 | Ajouter une photo ou un fichier (15 Mo) | C | ∅ | Documents du chantier : « inchangé », non dessiné. |
| S66 | Parcourir par journée, ouvrir, supprimer | C | ∅ | idem. |
| S67 | Changer la catégorie | C | ∅ | idem. |
| S68 | Envoyer les documents au client par e-mail | C | ∅ | idem. |
| S69 | « Mon équipe » : jour, salarié, interventions | D | ✔ | E26 : « Mon équipe — chef » ; E27. |
| S70 | Corriger / envoyer l'intervention d'un coéquipier | C | ◐ | E27 : « Corriger » et « Envoyer » sont deux boutons de page pour trois lignes d’états différents (envoyé / à envoyer / chez le comptable) : on ne sait pas laquelle ils visent (cahier : par intervention). |
| S71 | Ajouter des heures pour un coéquipier | C | ◐ | E27 : bouton « + Ajouter des heures pour Alex ». Le formulaire (chantier, début, fin, « OK — envoyer au bureau ») n’est que dans la note. |
| S72 | Nom, photo, menu du compte | R | ◐ | Avatar « SG » + page Plus (E26) OK. aria-label « Mon compte et menu » (12 scripts de test) et nom en clair (guides : « Touchez votre nom ») supprimés ; initiales « SG » pour « Sam Exemple » (donnees-exemple.ts:24). |
| S73 | Changer sa photo | C | ✔ | E26 : « Changer ma photo ». |
| S74 | Activer / couper les notifications | C | ◐ | E26 : « Notifications — Activer ». Le libellé « Activer les notifications » (cité par README §6, WORKER_NAV, guide menu.notifications) a disparu ; états Couper / Bloquées en note seulement. |
| S75 | « L'endroit au pointage » et confidentialité | C | ◐ | E26 : « Informations — L’endroit au pointage · confidentialité ». Fenêtre Informations non dessinée ; le point « texte à faire valider par le métier » (cahier O11) n’est pas repris au §10. |
| S76 | Se déconnecter | C | ✔ | E26 : bouton rouge « Déconnexion ». |
| S77 | Naviguer entre les vues | D | ✔ | Onglets Journée / Semaine / Mois / Plus (libellés ≠ « Ma journée », « Ma semaine », « Mon mois »). |
| S78 | Ajouter, modifier, retirer ses heures sans réseau | C | ✔ | E06 : étiquette « SUR LE TÉLÉPHONE ». |
| S79 | État hors-ligne et nombre en attente | C | ✔ | E06 : « Hors-ligne, tout est gardé · 2 en attente ». |
| S80 | Transfert au retour du réseau, relance, échecs signalés | C | ✔ | E07 et E19 (« 2 chantiers du 14/10 ne partent pas. Préviens le bureau. » + « Relancer »). E07 est incohérente (bandeau « 2 saisies », une carte déjà « À ENVOYER »). |
| S81 | Panier d'une journée encore vide | C | ✔ | E03 : panier « ✓ Pris » sur journée vide. |
| S82 | Ouvrir l'assistant (si IA activée) | C | ✔ | ✦ 44 px en en-tête (aria-label « Assistant BEMEXO »). Déplacé de la barre du bas vers l’en-tête sans être déclaré. |
| S83 | Écrire ou dicter (français, turc) | C | ✔ | AS1 : champ « Votre question… », dictée « FR·TR ». |
| S84 | Joindre une photo ou un PDF | C | ✔ | AS1 : bouton ⧉ « Joindre une photo ou un PDF » (état pièce jointe non dessiné). |
| S85 | Suggestions de départ | C | ✔ | AS1 : 4 suggestions (apostrophe droite ' au lieu de ’ du code : worker-assistant-core.ts:1192). |
| S86 | Heures dites en une phrase, Annuler / Modifier | C | ✔ | AS2 : « Fait — Maison Démo 07:30 → 12:00 » + Annuler / Modifier. AS7/AS8 décrivent un comportement nouveau (voir PB10). |
| S87 | Actions (congé, terminer le pointage ouvert, réserve, document, envoi…) : simples ou à confirmer | C | ✔ | AS2 (simple) et AS3 (à confirmer). |
| S88 | Fiche « Tout confirmer » / « Ignorer » | C | ✔ | AS3 : « 2 actions à confirmer » · Ignorer · Tout confirmer. |
| S89 | Raccourcis vers les écrans, « Me guider pas à pas » | C | ✘ | Aucun raccourci d’écran, aucun « Me guider pas à pas » dans AS1–AS8. Le README rattache S89 à AS7 (formulaire pré-rempli) : autre fonction. |
| S90 | Questions heures, planning, collègues (si autorisé) | C | ✘ | Aucun écran : pas de question heures / planning / « Où est Paul demain ? ». Absent de tout champ « covers ». |
| S91 | Questions restantes du jour | C | ◐ | AS1 : « 18 QUESTIONS RESTANTES » (le code dit « N questions restantes aujourd’hui » en pied : assistant-panel.tsx:575). Quota épuisé non dessiné. |
| S92 | « Nouveau chat », « Historique » (pas en service) | C | ◐ | AS4–AS6 dessinés, mais l’assistant du code est déjà en service avec d’autres libellés (Conversations / Retour / Oui-Non, confirmation en place) ; états chargement, erreur, verrou, « Abandonner cette action ? » absents (voir PB10). |
| S93 | Guide pas à pas | C | ∅ | « Guide pas à pas (S93) : anneau actuel, non redessiné » ; mais 44 ancres changent de place (PB02). |
| S94 | Vérifier le QR ; se connecter sur place | C | ◐ | P01 est l’arrivée enregistrée, pas l’attente. « Vérification du QR… » et la connexion sur place (#kx-pass, erreurs) ne sont que dans la note de P01 ; §2 L.58 dit « pas encore dessinée », §3 dit C. |
| S95 | Information et position du QR fixe (refus possible) | C | ∅ | « Information non redessinée » ; P03 n’est pas un refus de QR fixe (voir PB09). |
| S96 | Arrivée + « Ajouter une intervention faite avant » | C | ✔ | P01 : « Bonne journée, Sam ! », chantier, « Ajouter une intervention faite avant ». |
| S97 | Départ + « Envoyer ma journée », « Ajouter une intervention » | C | ◐ | P02 : « Envoyer ma journée » + « Ouvrir mon espace ». « Ajouter une intervention » (plage jusqu’à l’heure de départ) manque ; la note « sinon » invente une condition (app/pointer/page.tsx:311-317 montre les deux boutons). |
| S98 | Pointage annulé (< 1 min) ; « Rien à enregistrer » | C | ✘ | « Pointage annulé (moins d’une minute) » et « Rien à enregistrer » ne sont que dans la note de P03. |
| S99 | Pointage non enregistré, refus du QR fixe, « Réessayer » (si ticket connu) | C | ◐ | P03 mélange le cas 5 (message serveur « QR expiré ») et le cas 6 (boutons du refus de QR fixe) : combinaison impossible ; pas de raison de refus de QR fixe. |
| S100 | « Ouvrir mon espace » | C | ◐ | P01, P02 OK ; P03 sans « Ouvrir mon espace » (cas 5 du cahier §7). |
| S101 | Retour du téléphone referme la couche ouverte | C | ◐ | Comportement non visible ; le README tranche le point « à décider » du cahier (questions d’envoi dans la pile du retour) sans le signaler au §10. |
| S102 | Accès : compte archivé, rôle refusé, chargement | C | ✔ | E01, E02, E28 (E28 ajoute un bouton « Se déconnecter » alors que le cahier dit « puis déconnexion »). |
| S103 | Retours passagers visibles et touchables | C | ◐ | E12 : retour passager « Journée envoyée » à 170 px du bas, sans « Annuler » ; il recouvre la carte RETIRÉ. Aucun retour touchable (« Annuler » 10 s) n’est dessiné. |
| S104 | Total du jour, prévu non confirmé, compteurs (chantiers, pauses à préciser, route, panier) | C | ◐ | Total, prévu non confirmé (E04), pauses à préciser, panier, « en cours depuis » OK. Compteurs « chantiers » et « route (payée) » supprimés (TuilesJour, README L.187 ; code poseur-day.tsx:2192-2208). |

---

## 4. Règles métier : contrôle des onze exemples demandés et de quelques autres

Verdicts : **respectée** · **respectée en note seulement** (écrite sous l'écran, rien dans le cadre) · **altérée** · **non traitée**.

| # | Règle (cahier) | Ce que montrent README / planche | Verdict |
|---|---|---|---|
| 1 | Le téléphone ne démarre plus de pointage (O2, §8.1) | Aucun « Je commence » ni « Annuler le pointage ». Seuls : QR (barre) et « Terminer ma journée » (E05). README §6 corrige le toast « touche « J'ai fini » en haut » → « Terminer ma journée » (le code dit encore « J'ai fini », `poseur-day.tsx:2013`). | **respectée** |
| 2 | Envoi : 7 contrôles, dans l'ordre (O4) | (3) E08, (4) E09, (6) E10, (2) E11, (7) E12. (1) sortie oubliée sans fin et (5) « Ajoute un chantier » **non dessinés** (la note « mêmes phrases » est fausse). L'ordre n'est écrit nulle part ; compteur « n/3 » faux. Ordre réel vérifié : `poseur-day.tsx:1583-1667`. | **altérée / partielle** (PB06) |
| 3 | Les heures envoyées ne sont jamais effacées (retrait → « Retiré ») | E12 : carte « RETIRÉ » barrée, hors total (7:30 = 4:00 + 3:30) ; E24 : « jamais … les lignes retirées ». La confirmation « Il a déjà été envoyé : il restera visible comme « Retiré »… » n'est pas dessinée ; « Retirer cette intervention » n'est montré que sur un brouillon. | **respectée** (garde-fou non dessiné : PB05) |
| 4 | Panier : un par jour, absent si l'entreprise n'en a pas, impossible si tout est chez le comptable | Tuile bascule (E03, E05, E12) ; atténuée en E16. Variante « sans panier » et infobulle « Journée chez le comptable : vois avec la secrétaire. » (`poseur-day.tsx:2224`) non dessinées. | **respectée** (variantes manquantes) |
| 5 | Mois clôturé : plus d'ajout, d'ouverture, de panier, de route/pause, de copie | E16 : « + » et panier atténués, ▣, envoi grisé, « Mois clôturé ». Le code est une fenêtre à deux textes ; E16 est un bandeau au texte hybride (PB16). | **respectée dans le fond, forme changée** |
| 6 | Journée mixte : pas de confirmation ; corriger une ligne envoyée prévient quand même la secrétaire | Note de E13 seulement. Retour passager « Correction envoyée — la secrétaire est prévenue » non dessiné. | **respectée en note seulement** |
| 7 | Copier la journée : aucun contrôle de chevauchement, de jour envoyé ou clôturé | E24 : « Un jour déjà rempli recevra des chevauchements. » + note « Impossible de copier ». Omis : copies « à envoyer », planning rattaché, « ni de 0 minute ». « ven. 16 » (congé) présélectionné. | **respectée** (PB12) |
| 8 | Seuil de 10 h strictement supérieur | E10 : note « Seuil strict > 10 h, sur les heures qui vont partir (pause déduite) » ; exemple 10:45 (la frontière 10:00 n'est pas illustrée). Code : `totalMins > 600` (`poseur-day.tsx:1559`). Le texte de la fenêtre est réécrit. | **respectée** |
| 9 | Pause obligatoire après plus de 6 h d'affilée (écarts < 20 min), une plage à la fois | E09 « 7:30 d'affilée » ; 30 min présélectionnées + « Valider » ; seuil, écarts < 20 min et répétition par plage non écrits. | **altérée** (PB07) |
| 10 | « Fin le lendemain », annoncée avant d'écrire | E17 : « Fin le lendemain (mardi 06:30) — la nuit est comptée sur la journée du début. » « Fin = début refusée » : note seulement. | **respectée** |
| 11 | Pointage ouvert depuis plus de 14 h → « sortie oubliée » la nuit ; jour clôturé : il reste ouvert ; ouvert il s'affiche « Sortie oubliée » même en cours de nuit | Rien au README ni sur la planche (E18 : « Elle a été créée cette nuit » seulement). La frise « Poste de nuit » ne dit pas à quelle journée appartient la 2e ligne. | **non traitée** (PB08) |
| 12 | Prévu : hors total ; sans début/fin ou chevauchant, « il ne partira pas et l'écran le dit » | Hors total ✔ (E04). « Ne partira pas » dit pour la carte qui chevauche **et** n'a pas de fin ; la carte « heures à préciser » (hors cadre) ne le dit pas. | **partielle** (S4) |
| 13 | « Envoyer ce qui reste (N) » ne fait que transférer | Note E07 ✔ ; E07 incohérente (M9). | **respectée en note** |
| 14 | Absences visibles en Semaine et Mois seulement (O1) | La bande de **Journée** les montre (rayures + lettre). | **altérée** (PB11) |
| 15 | Pointage en cours : « Envoyer » ne l'envoie jamais ; la ligne « en cours depuis » ne s'ouvre pas | « ne part pas » ✔ mais mal placé (M1) ; « ne s'ouvre pas » écrit nulle part (README S3 : « toucher la carte ouvre l'éditeur »). | **partielle** |
| 16 | Après scan : valable 3 min, même compte, jour courant ; « Envoyer votre journée maintenant ? » sans effet par défaut (Entrée n'envoie jamais) | Note P02 : « Valable 3 min » ; la question n'est pas dessinée. | **non traitée** (PB05) |
| 17 | « Votre pointage est encore en cours » : texte exact + consigne borne (Entrée sans effet) | Texte réécrit, consigne borne retirée. | **altérée** (PB05) |
| 18 | Heure retouchée écrite telle quelle, heure non retouchée intacte | E21 : le champ montre 07:30 et la note « Heure exacte gardée : 07:32 ». | **contradiction visible** (PB13) |
| 19 | Lever une réserve : hors-ligne indisponible, marche sur mois clôturé, annulable 10 s | Notes de E20 ; retour passager non dessiné. | **respectée en note seulement** |

---

## 5. Libellés renommés ou déplacés : ce que README §6 oublie

**Ce que README §6 dit** : « Aucun libellé cité par l'assistant n'est renommé » (cinq libellés nommés) ; « déplacés » : vues Semaine / Mois / Historique → onglets ; menu du compte → page « Plus » ; « Interventions supprimées » → sous Historique ; flèche de retour → jour jaune ; toast « J'ai fini » à corriger.

**Ce qui est faux ou manquant** (les nombres de scripts sont le nombre de fichiers de `scripts/tests/*.mjs` qui contiennent la chaîne) :

| # | Libellé ou repère actuel (source) | Lu par | Dans la planche | Dit au §6 ? |
|---|---|---|---|---|
| 1 | « **Ma journée** » (titre de vue, `page.tsx:56`, `WORKER_NAV.journee`) | 11 fiches `WORKER_GUIDE` (sur 25), `QR_START_ANSWER`, `NO_CANCEL_ANSWER`, `PREVU_NON_CONFIRME` (`worker-assistant-core.ts:560, 779, 780`) ; 10 scripts | Onglet « Journée », titre = la date. « Ma journée » reste dans E01 / E02 et dans le texte de AS2 (« Visible dans Ma journée ») : l'écran n'a plus ce mot | non |
| 2 | « **Ma semaine** », « **Mon mois** » (`page.tsx:57-58`, `WORKER_NAV`) | tour et fiche `planning` ; `menuitem` « Ma semaine » cliqué par `chantier-termine-lot23.mjs:668, 708` ; titre « ma semaine » lu par `guides-lot7.mjs:358` ; `site-rapide-lot5.mjs:351` (7 scripts au total) | « Semaine », « Mois » (onglets) | « déplacés » seulement |
| 3 | Menu du compte : `aria-label="Mon compte et menu"`, `data-guide="menu.compte"`, « Touchez votre nom, en haut à droite. » (`page.tsx:557`) ; entrées `menu.photo / conges / infos / notifications / semaine / historique / journee / mois` | 7 tours (`conge`, `planning`, `historique`, `notifications`, `photo-profil`, `annuler-conge`, `infos`) et leurs fiches ; **12 scripts** (`[role=menu]` attendu) | Avatar « SG » (2 lettres, sans nom, sans aria-label), page « Plus » (ni menu, ni `role=menu`) ; le type `TourScreen` de `worker-tours.ts` n'a pas d'écran « plus » | déplacement oui ; aria-label, rôle, nom, 9 ancres non |
| 4 | « **Activer les notifications** » (`page.tsx:594`, `WORKER_NAV.notifications`, fiche, `menu.notifications`) | assistant, guide | Ligne « Notifications » + pastille « Activer » (E26) | **§6 affirme le contraire** |
| 5 | **Scanner** : icône **en haut**, `aria-label="Scanner la borne"`, `data-testid="scan-open"`, `data-guide="entete.scanner"` (`page.tsx:548-551`) | tour `pointer` (« l'icône du scanner, en haut »), tour `borne`, `WORKER_GUIDE.borne` (« Icône scanner en haut de l'écran ») ; `qr-fixe-lot12.mjs`, `salarie-lot12.mjs` | Bouton « QR » **en bas** (aria-label « Scanner le QR de la borne ») | non |
| 6 | **Assistant** : bouton ✨ « de la barre du bas » (`poseur-day.tsx:2588`, `data-testid="dock-assistant"`, `data-guide="journee.assistant"`), 🎤 et 📎 | `WORKER_GUIDE.collegues`, `.assistant` ; `returnFocus` du guide (`page.tsx:677`) ; 9 scripts | ✦ **en en-tête** ; dictée « FR·TR », pièce jointe « ⧉ » | non |
| 7 | « **Début** » et « **Fin** » : deux boutons `.bt-timecard`, `data-guide="editeur.horaires"` ×2 (`poseur-day.tsx:2677-2685`) | tours `noter-heures`, `modifier-heures`, `sortie-oubliee` (« Touchez « Début » puis « Fin » ») ; `.bt-timecard` lu par **6 scripts** | Un champ « Début → fin » ; README L.186 attribue `.bt-timecard` à `CartePointage` (faux) | non |
| 8 | « **Retirer ce chantier** » (aria-label, titre, `editeur.retirer`) ; confirmation « Retirer ce chantier ? », « Non » / « **Oui, retirer** » (`confirmer.retirer`) | tour `retirer-ligne` ; 2 scripts (aria-label), 3 scripts (« Oui, retirer ») | « Retirer cette intervention » ; confirmation non dessinée | non |
| 9 | « **Terminer ma journée** » sur le pointage oublié + « **Tu as fini à quelle heure ?** » (`live-timer.tsx:218, 231`, `lt-finish`) | tour `sortie-oubliee`, `WORKER_GUIDE` | « Enregistrer la fin » ; question absente | §6 : « Terminer ma journée » non renommé (vrai pour E05, **faux pour E17**) |
| 10 | « **Tu es pointé depuis HH:MM** » (`live-timer.tsx:245`) | 3 scripts (`pointage-lot10`, `salarie-lot9`, `chantier-termine-lot23`) | « POINTAGE EN COURS · DEPUIS 12:30 » | non |
| 11 | Bloc noir « **Total aujourd'hui** … travaillées », compteurs chantier(s) / pause(s) / route · payée ; « **Panier** » + « repas pris / non pris » (`aria-label="Panier repas"`, `journee.panier`, testid `panier`) | fiche `panier` (« la case « Panier » du bloc noir (pris / non pris) ») ; 3 scripts | TOTAL / PAUSES / PANIER « ✓ Pris / Non pris », tuiles claires, plus de bloc noir | non |
| 12 | « **Mes heures ›** » (`bt-iv-cta`, `poseur-day.tsx:2314`) | fiche `reserve` | absent | non |
| 13 | Bandeau **jaune** « ⚠ N réserves à lever › » (`reserves.bandeau`) | fiche `lever-reserve` (« bandeau jaune des réserves à lever ») | puce rouge pâle « 1 réserve à lever › » | non |
| 14 | Bandeaux « journée du … à envoyer » / « journées à envoyer » (`aria-label`), « Chantiers pas encore partis » (`page.tsx:467-525`) | 2 scripts, **9 scripts** | Note d'en-tête « Mardi 13 à envoyer · Ouvrir › », « Hors-ligne, tout est gardé · N en attente » | non |
| 15 | « **Dupliquer cette journée** » (`journee.copier` ×2), « **Copier (N)** » (`copier.valider`), calendrier | fiche `copier-journee`, tour (« sur le calendrier, puis touchez « Copier » ») ; 3 scripts | « Copier sur 2 jours » + puces ; bouton d'entrée absent | non |
| 16 | Textes des fenêtres : « Journée déjà envoyée » (corps), « Votre pointage est encore en cours » (corps + consigne borne), « Vérification », chevauchement | `pointage-lot10.mjs` teste des textes exacts (cas 5, 25, 26…) ; `heures-lot1.mjs` | réécrits | non |
| 17 | « **Mois clôturé** » / « **Heures clôturées** » (fenêtre) | 6 scripts | bandeau permanent | non |
| 18 | Assistant : « Bonjour 👋 », « Conversations », « Retour », « Oui / Non », « {N} questions restantes aujourd'hui », « Aucune conversation pour l'instant » (`assistant-panel.tsx:493, 575, 700-760`) | `assistant-historique.mjs`, `assistant-effacer.mjs`, `assistant-panneau.mjs` (testids `assistant-history-*`) | « Bonjour Sam », « Historique », « ‹ Retour à la conversation », « Garder / Supprimer », « 18 QUESTIONS RESTANTES », « Aucune conversation » | non |
| 19 | « Non, je corrige **mes heures** » (`poseur-day.tsx:2871`, testid `planned-confirm-fix`) | `heures-lot1.mjs`, `guides-lot7.mjs` | « Non, je corrige » | non |
| 20 | Apostrophes typographiques `’` (suggestions, guides) | `worker-tours.test.ts` (normalisé) ; suggestions comparées à la lettre | apostrophes droites `'` | non |

**Verdict §5** : **19 lignes** de renommages ou de déplacements ne sont pas (ou pas entièrement) au §6 (lignes 1 à 3 en partie, 5 à 20), et la ligne 4 **contredit** §6. Lues par l'assistant (`WORKER_GUIDE`, `worker-tours.ts`, réponses fixes) : lignes 1 à 9, 11, 12, 13, 15 (et le titre de la ligne 16). Lues par des scripts de test : lignes 1 à 3, 5 à 11, 14 à 19.

**Libellés cités par les guides qui seront intacts parce que leur écran n'est pas dessiné** (13) : Ajouter ce chantier, Annuler ma demande, Dupliquer cette journée, Envoyer au client, Envoyer la demande, Faire une demande, Fichier, Levées (libellé bureau), OK — envoyer au bureau, Où est Paul demain ?, Où sont mes collègues ?, Ouvrir l'e-mail, par le chef d'équipe. Ils ne seront « vrais » que si ces écrans gardent leurs textes : à écrire au README.

---

## 6. Écrans « pas encore dessinés » : liste exacte et impact

### 6.1 Déclarés par le README (§2 L.58, §3, §9)

| Écran | Capacités touchées (statut README → vérifié) | Ancres, fiches, tests touchés |
|---|---|---|
| Mois | S50 (C → ∅), S54 (C → ◐), S9 | `menu.mois`, fiche `planning` (« Mon mois »), `site-rapide-lot5.mjs` ; vocabulaire « À envoyer / À déclarer » |
| Historique détaillé | S51 (D → ◐), S52 (C → ◐), S53 (D → ◐), S9 | `historique.jour`, fiche `historique` ; « Envoye » sans accent (Historique et PDF, défaut déjà relevé au cahier §6) |
| Formulaire de congé | S55 (D → ◐) | `conges.faire`, `conges.type`, `conges.envoyer` ; fiche `conge` ; `fenetres-lot11.mjs` |
| Mes demandes | S56, S57 (C → ∅) | `conges.annuler` ; fiche `annuler-conge` |
| Documents du chantier | S25 (C → ◐), S65 à S68 (C → ∅) | `docs.photo`, `docs.envoyer`, `editeur.documents` ; fiches `photo-document`, `envoyer-client`, `reserve` |
| Formations avec lecteur | S62 (R → ◐), S63, S64 (C → ∅) | lecteur `training-video-player.tsx` ; `formations-lot6.mjs` |
| Informations | S75 (C → ◐) | `infos.fermer` ; fiche `infos` ; texte « à faire valider par le métier » (cahier O11) |
| Scanner intégré | S11 (C → ◐) | `entete.scanner` ; `scan-open` ; « Caméra refusée… » |
| Connexion sur place de /pointer | S94 (C → ◐) | `#kx-pass`, messages d'erreur de connexion |
| Information sur le QR fixe | S95 (C → ∅) | `fixed-info`, « Continuer » / « Je refuse » |
| Guide pas à pas | S93 (C → ∅) | 44 ancres (PB02) |

**Impact** : 11 lignes « ∅ » et 10 lignes « ◐ » (S11, S25, S51, S52, S53, S54, S55, S62, S75, S94) dépendent d'un écran non dessiné ; 8 ancres de guide (`conges.faire / type / envoyer / annuler`, `docs.photo`, `docs.envoyer`, `historique.jour`, `infos.fermer`) et 8 fiches `WORKER_GUIDE` (`conge`, `annuler-conge`, `historique`, `photo-document`, `envoyer-client`, `infos`, `borne`, `planning`) n'ont pas d'écran cible redessiné. Toute la liste est **indépendante** de l'intégration de Journée et Semaine, mais ne peut pas être recettée.

### 6.2 Non déclarés : décrits en note seulement ou absents (19)

| # | Écran ou état | S | Où c'est dit |
|---|---|---|---|
| 1 | « C'était quoi ? » + « Ajouter ce chantier » | S19 | note E22 |
| 2 | Fenêtre « Réglage de l'heure » (molette, « Valider les heures ») | S20 | nulle part (prop `onHeure`) |
| 3 | Confirmation de retrait (3 textes) | S28 | nulle part |
| 4 | « Envoyer votre journée maintenant ? » + « Ajouter une intervention » avec plage | S48, S97 | nulle part |
| 5 | Liste des réserves à lever | S59 | note E20 (« la liste se referme ») |
| 6 | Liste « N journées à envoyer » | S47 | README L.112 |
| 7 | Formulaire d'ajout du chef (« OK — envoyer au bureau ») | S71 | note E27 |
| 8 | Les 5 cas à bouton unique de « Votre pointage est encore en cours » | S26, S30 | note E23 |
| 9 | Retours passagers avec « Annuler » (10 s) | S61, S103 | notes E20, E12 |
| 10 | /pointer neutre : annulé (< 1 min) / rien à enregistrer | S98 | note P03 |
| 11 | /pointer attente (« Vérification du QR… », position, pointage) | S94 | note P01 |
| 12 | Bouton « Dupliquer cette journée » | S34 | README L.99 |
| 13 | États « Couper les notifications », « Notifications bloquées » | S74 | note E26 |
| 14 | Assistant : raccourcis vers les écrans + « Me guider pas à pas » | S89 | nulle part |
| 15 | Assistant : réponses heures / planning / collègues | S90 | nulle part |
| 16 | Refus de l'OK de l'éditeur (heures, chevauchement, pause, chantier) | S26 | nulle part |
| 17 | Issues d'envoi (« N chantiers envoyés sur M… », rien envoyé, refus de clôture) | S39, S43 | nulle part |
| 18 | Carte avec réserve (à lever / levée par le bureau / levée le jj mmm) | S38 | nulle part |
| 19 | Arrêts « Ajoute un chantier » et « Sortie oubliée : mets ton heure de fin… » | S43 | note E11 (fausse) |

---

## 7. Méthode et reproductibilité

1. **Lecture** : README, cahier (annexe S1 à S104 extraite par script et comparée au README : 104 numéros sur 104 identiques ; libellés : 12 identiques, 81 abrégés, 7 abréviations qui perdent une condition, voir §1), `integration-technique.md`, code réel (fichiers cités), `worker-tours.ts`, `worker-assistant-core.ts` (`WORKER_NAV`, `WORKER_GUIDE`), `worker-tours.test.ts` (ce que `test:guides` vérifie), `scripts/tests/*.mjs` (recherche des libellés).
2. **Rendu de la planche** : script Playwright (Chromium `/opt/pw-browsers/chromium-1194`), contexte `offline: true`, toute requête réseau annulée (aucune n'a été tentée). Le template `x-dc` de la planche a été développé dans le navigateur (`sc-for`, `sc-if`, `{{ }}`) à partir de son propre script de données ; `support.js` n'a pas été exécuté (il charge React et Babel depuis unpkg, hôte bloqué ici), le rendu est donc ma reconstruction fidèle du template, pas celle de l'outil du designer.
3. **Extraction du texte** par écran, **puis mesure de visibilité** : pour chaque nœud de texte, rectangle dans le cadre 390 × 844 et `document.elementFromPoint` pour détecter la barre du bas et la feuille. C'est ce qui a révélé les 23 textes hors cadre de E05, les 5 de E04 et les 2 de E12. Les captures de chaque écran ont été relues pour E04, E05, E11, E12, E14, E17, E24, AS7.
4. **Comparaison automatique** des 58 libellés entre « » de `worker-tours.ts`, `WORKER_GUIDE` et `WORKER_NAV` avec le texte de la planche, puis relecture manuelle des faux positifs (9 fragments).
5. **Limites** : je n'ai pas lancé `test:guides` ni les scripts navigateur (la planche n'est pas branchée au code) ; les conséquences sur les tests sont déduites de la lecture. Je n'ai pas audité les tailles de texte (12 px / 16 px), les contrastes ni le poids de page (autres missions). Les cadres sont à 390 × 844 ; 360 × 640 et l'ordinateur ne sont pas dessinés.
6. **Fichiers de travail** (hors dépôt) : `/tmp/claude-0/-home-user-battime-bolt/30d30cad-b51e-52c5-a262-2c112413e34b/scratchpad/work-couverture/` — `scripts/extract.mjs`, `scripts/visible.mjs`, `scripts/analyse.mjs`, `scripts/table.mjs`, `out/ecrans.json` (texte par écran), `out/visibilite.json` (visible / hors cadre), `out/shots/*.png`.

Aucun fichier du dépôt n'a été modifié, hormis ce rapport.
