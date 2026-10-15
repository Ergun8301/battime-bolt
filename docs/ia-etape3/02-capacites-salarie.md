# 02 · Capacités du salarié : ce que l'assistant sait déjà, ce qu'il reste à créer

Constat en lecture seule du 15 octobre 2026 (commit b86a84c). Fichier de données : `docs/ia-etape3/capacites-salarie.json`, **105 entrées** : S1 à S104 de `docs/design-brief/fonctions-salarie.md` (libellés de l'annexe repris mot pour mot) plus **S105** « Transférer les saisies gardées sur le téléphone », une capacité réelle que l'annexe range dans les « 5 états » de l'envoi. Même schéma que `capacites-bureau.json` (dix champs, `verifie_dans` = références `fichier:ligne` séparées par « ; »). Un script a vérifié que chaque fichier cité existe, que chaque plage de lignes tient dans le fichier, et que chaque outil, navigation et guide cité existe (19 déclarations `WORKER_FUNCTIONS`, 9 clés `WORKER_NAV`, 25 fiches `WORKER_GUIDE`).

## Conventions

- `exposition` commence par l'état : **COUVERT** (outil, navigation, guide ou donnée du prompt déjà là) · **PARTIEL** (existe, la limite est dite) · **À CRÉER** (rien aujourd'hui ; l'outil proposé est nommé) · **RÉSERVÉ À L'HUMAIN** (`raison_humaine` remplie).
- `actions_existantes` : nom d'outil tel quel ; `WORKER_NAV:<clé>` ; `guide:<id>` (fiche et parcours) ; `instantane:<champ>` (donnée du prompt) ; `local:<lecteur>` ; `multi` (fiche « Tout confirmer »).
- `genre` = la facette la plus engageante (ecrire > ouvrir > lire > naviguer > guider) ; `niveau` = le plus élevé des facettes. Comme au bureau, **humain = niveau 3** (consentement, identifiants, présence physique, compte : l'humain reste l'auteur) sauf les états et gestes d'écran sans donnée, au **niveau 1** (équivalent de B71).
- Les noms d'outils proposés respectent `^[a-z_]{3,40}$` (contrainte de `assistant_journal_log`).

## Comptes

| Genre | Total | couvert | partiel | à créer | humain |
|---|--:|--:|--:|--:|--:|
| ecrire | 43 | 13 | 20 | 10 | · |
| lire | 25 | 2 | 9 | 14 | · |
| ouvrir | 7 | 3 | 2 | 2 | · |
| naviguer | 6 | · | 5 | 1 | · |
| guider | 5 | 5 | · | · | · |
| humain | 19 | · | · | · | 19 |
| **Total** | **105** | **23** | **36** | **27** | **19** |

| Niveau (vision §3) | Total | couvert | partiel | à créer | humain |
|---|--:|--:|--:|--:|--:|
| 1 libre | 53 | 10 | 16 | 17 | 10 |
| 2 fait + Annuler | 32 | 9 | 16 | 7 | · |
| 3 dernier clic humain | 20 | 4 | 4 | 3 | 9 |

Lecture : sur les 86 capacités non réservées à l'humain, **23** sont entièrement couvertes, **36** en partie, **27** pas du tout. Il faut créer environ **26 outils** (12 lectures, 14 gestes ou ouvertures) et élargir 4 outils existants (`terminer_pointage` : heure de fin ; `modifier_heures` : pause, note, statut ; `declarer_heures` et `envoyer_journee` : les contrôles de l'écran). `lire_ma_journee` seul sert 9 capacités, `ouvrir_ecran` au moins 8.

## Les 15 manques les plus importants pour un ouvrier

1. **Les journées d'avant** (S47, S54, S39, S38) : tous les gestes de journée visent aujourd'hui (`supabase/functions/worker-assistant/index.ts:107`, `supabase/functions/_shared/worker-assistant-core.ts:826`) ; la journée oubliée d'hier, piège le plus fréquent (`app/poseur/page.tsx:170-173`), ne peut ni se lire ni s'envoyer.
2. **Lire sa journée comme l'écran** (S104, S37, S16, S21, S4, S35, S45) : total avec le pointage en cours, état de chaque ligne, pauses à préciser, route, panier, prévu non confirmé, corrections et renvoi du bureau avec motif. Outil `lire_ma_journee`.
3. **Confirmer les horaires prévus sans les retaper** (S3, S40) : l'assistant n'envoie jamais le prévu et n'a pas le « Oui, c'est ce que j'ai fait ». Outil `confirmer_prevu` (niveau 2).
4. **Répondre à la pause** (S41, S22) : « Tu as pris une pause ? » et changer la pause d'une ligne existante. Outil `poser_pause`.
5. **Les contrôles de l'écran avant d'écrire ou d'envoyer** (S26, S30, S42, S43) : chevauchement avec les lignes déjà notées, pointage en cours, plus de 10 h.
6. **Heures et mois clôturés** (S46) : l'assistant l'ignore ; une ligne refusée par la base est gardée sur le téléphone puis « ne part pas ».
7. **Sortie oubliée** (S14, S15) : compléter l'heure de fin d'un jour précédent, nuit comprise (le paramètre `fin` manque à la déclaration du modèle).
8. **Route ou pause d'un trou** (S31) : seulement la fiche d'aide.
9. **Réserves de tous les jours** (S59, S60, S38) : le bandeau de l'écran couvre tous les jours, l'assistant les lignes d'aujourd'hui ; la photo de la levée manque.
10. **Documents du chantier** (S5, S25, S66, S67, S68) : compter, parcourir, ouvrir, changer la catégorie, préparer l'e-mail au client (l'envoi reste à l'utilisateur).
11. **Congés** (S56, S58) : l'état d'une demande, le motif d'un refus, les absences posées par le bureau.
12. **Lire une période** (S49, S50, S51, S53) : semaine prochaine, mois, historique, « Interventions supprimées ». Le prompt a les heures de la semaine en cours et le planning de -2 à +1 jour.
13. **Tâches et réunions du jour** (S6, S7, S8) : aucune donnée dans le prompt, aucun outil pour cocher « Fait ».
14. **Ouvrir la bonne fenêtre, déjà remplie** (S1, S17, S25, S34, S54, S55, S63) : la vision (niveau 1) le veut ; `WORKER_NAV` n'a que 9 écrans, sans paramètre.
15. **Formations** (S62, S63, S64) : « N formations à voir », ouvrir, marquer « Vue ».

Suivent : chef d'équipe (S69 à S71), file du téléphone (S79, S80, S105), couper les notifications (S74), statut et note d'une ligne (S23, S24, S27).

## Écarts de règle trouvés (à corriger en créant le registre)

- Chantier terminé : l'assistant peut le proposer, l'écran non (S9, S18 ; déjà noté dans `docs/chantier-termine.md:107`).
- `terminer_pointage` sans heure de fin côté modèle (S14) ; totaux de l'assistant sans le pointage en cours (S16).
- Panier : refusé sur journée vide (S81) et sans prévenir la secrétaire sur journée envoyée (S32, S44). `copier_journee` accepte -31 j à +1 j, le calendrier de l'écran aujourd'hui et le futur (S34).
- `WORKER_NAV:borne` ouvre le lecteur même sans tablette reliée (S11) ; `WORKER_NAV:notifications` n'éteint jamais les notifications (S74). La suggestion « J'ai fini ma journée » est lue comme `terminer_pointage` : sans pointage ouvert, cas général depuis que le téléphone ne pointe plus, la carte dit « Aucun pointage en cours » (S85, à vérifier à l'écran).
- Le cahier dit « Nouveau chat / Historique : pas en service » (S92) : ils le sont depuis l'étape 2. Le texte « L'endroit au pointage » n'est plus exact (S36, S75).

## Décisions du patron nécessaires

- Niveau 3 retenu par prudence, à confirmer : `nouveau_chantier` (S19, non annulable par le salarié) ; les suppressions (S28, S57, S66), car la règle D3 (« heures sûres ») veut une carte même annulable alors que la vision ne met en niveau 3 que la suppression définitive.
- Envoi de la journée : l'utilisateur fait le dernier clic sur la carte (S39) ; dans « Tout confirmer » l'envoi part avec les heures en un seul clic (S88). Corriger une ligne envoyée passe par une carte, plus prudent que le niveau 2 (S27). Retirer une ligne envoyée : permis à l'écran, refusé à l'assistant (S28).
- Chef d'équipe (S69 à S71) : il a le droit de voir et envoyer les heures de son équipe, mais la consigne interdit toute donnée d'un collègue.
- Se déconnecter (S76) classé réservé à l'humain.

À vérifier hors dépôt : le comportement réel de la base (refus ou non) pour des heures sur un mois clôturé écrites par l'assistant, et l'affichage exact de la carte « Aucun pointage en cours ». Rien n'a été exécuté dans un navigateur ni sur le vrai modèle.
