# Versions du planning (lot 8, oct. 2026)

Chaque fois que l'assistant change le planning d'une semaine **en bloc**, l'appli garde une **version** : V1 « Initiale » (la semaine telle qu'elle était avant son premier changement), puis chaque essai (V2, V3…) avec la **date**, l'**auteur** et la **demande** faite à l'assistant. Le bureau peut aussi « Garder cette version » à la main. « **Revenir à cette version** » remet les cases du planning comme elles étaient, après une confirmation qui dit exactement ce qui va changer.

## Ce qui est gardé

| | |
|---|---|
| **Une version** | une semaine, **lundi → dimanche**, de **toute l'entreprise** : n° (posé par la base : 1, 2, 3…), sorte, date et auteur (posés par la base), la copie des **cases de travail** (salarié, chantier, jour, heures prévues, note, ordre), les salariés présents |
| **Les sortes** | `initial` (V1), `assistant` (un essai, avec sa demande), `manuel` (« Garder cette version »), `avant_assistant` (changements faits à la main depuis la dernière version, gardés avant un nouvel essai), `avant_retour` (l'état gardé juste avant un retour en arrière : « Annuler » y revient) |
| **La demande** (décision D5) | 500 caractères au plus, **seulement sur un essai de l'assistant** : c'est le **seul** endroit où le texte d'une demande est gardé. Lisible par le **bureau** de l'entreprise, personne d'autre (ni salarié, ni chef d'équipe) |
| **Durée** (décision D5) | **12 mois**. La **purge n'est pas dans ce lot** (elle demande un `DELETE`) : pour l'instant, rien n'est effacé, et une version est inmodifiable et inéffaçable, même par le bureau. L'index `planning_versions_date_idx` est là pour la purge, qui viendra à part, avec son propre accord |
| **Jamais dans une version** | les heures (`time_entries`), les pointages en cours, les **absences** (congé, maladie, intempérie, repos) |
| **Limites** | 2000 cases par version (la base refuse au-delà ; l'écran le dit : « Trop de cases pour une version »), 50 versions listées par semaine (les plus récentes), 12 semaines suivies par une action de l'assistant (« efface le trimestre ») |

Quand les versions sont écrites :

- **Assistant, bureau** : `planning_semaine` (« Fais le planning de la semaine prochaine ») et `effacer_planning` (« Efface le planning de la semaine prochaine »). **Avant** d'écrire : V1 « Initiale » si la semaine n'a encore aucune version, sinon « Avant l'assistant » si le planning a changé à la main depuis la dernière version. **Après** : l'essai, avec la demande telle qu'écrite ou dictée (coupée à 500 caractères, jamais au milieu d'une émoji). Rien n'est gardé pour une suppression d'une seule case, ni pour les absences.
- **Une version qui ne peut pas s'écrire n'empêche pas l'action** (la table peut être indisponible) : le message ajoute « (version du planning non gardée) ».
- **Bureau** : « Garder cette version ».

## Où le trouver

- **Ordinateur** : une petite icône ⟲ dans le **coin de la grille du planning**, à côté de « Salarié » (la barre du haut n'a plus de place au pire cas : lot 3). Info-bulle « Versions du planning de cette semaine ».
- **Téléphone** : menu ☰ → « Versions du planning (semaine affichée) ».
- **Assistant** : la carte « Fait » d'un planning ou d'un effacement propose « Versions de la semaine » (ouvre la liste de la semaine concernée).
- Réservé au **bureau** (rôle admin) ; la fenêtre porte sur la **semaine affichée**.
- **Avant la migration** : la table manque (`PGRST205`) ou n'est pas lisible (`42501`) → **aucune entrée n'apparaît**, une seule lecture est faite, l'assistant n'écrit aucune version. Déployer l'écran avant la migration est donc sans effet.

## « Revenir à cette version »

1. **Voir** : l'aperçu est calculé en lisant la base, **rien n'est écrit** : « 12 cases remises, 3 retirées, 2 modifiées, 2 gardées (heures déjà notées par le salarié, pointage en cours), 1 non remise (mois clôturé) », avec le détail case par case.
2. **Confirmer** : le bouton « Revenir à la V2 » n'apparaît qu'après l'aperçu. Si le planning a **bougé entre l'aperçu et le clic** (empreinte des cases concernées), rien n'est fait : le nouvel aperçu est montré, à confirmer de nouveau.
3. **D'abord garder l'état actuel** comme nouvelle version (`avant_retour`). **Si elle ne peut pas être gardée, rien n'est touché.**
4. **Ensuite seulement les cases du planning** (les pointages en cours sont relus une dernière fois juste avant d'écrire : un pointage qui vient de démarrer garde sa case) : retirées par `erasePlanning` (le même chemin que « Supprimer » : relit chaque case, garde celles qui portent des heures, efface les brouillons vides, détache les lignes retirées), déplacées par `prepareMove` + `updatePlanningSlot` (la règle du glisser), remises avec leur **identifiant d'origine** quand il est libre (les traces du lot 3 disent « remise »), sinon en case neuve.
5. **« Annuler »** juste après : revient à l'état gardé en (3). Il ne part en un clic que si le planning est resté **tel que le retour l'a laissé** ; sinon, un nouvel aperçu à confirmer.

**GARDÉ comme maintenant, et dit** (jamais retiré, jamais modifié) : une case qui porte des **heures** (notées ou envoyées, sortie oubliée à compléter), une case d'un **mois clôturé**, une case avec un **pointage en cours**, une case **ajoutée par le salarié** (l'écran la dit « non supprimable »).
**Non remise, et dit** : une case de la version dans un mois clôturé, sur un jour où le salarié a **une absence**, pour un chantier **supprimé** ou un salarié **archivé**.

**Jamais touché** : les heures (minutes, statuts, envois), les pointages en cours, les absences, les clôtures, les cases d'une autre semaine ou d'une autre entreprise (lecture, copie et retour sont bornés à l'entreprise et à la semaine ; la RLS fait le reste).
**Seule exception, héritée de « Supprimer » (lot 2)** : quand une case SANS heures est retirée, son brouillon **vide** (0 minute, jamais envoyé) part avec elle, et une ligne « retirée » par le salarié est **détachée** de la case (ses heures restent, seul le lien disparaît).

**Échec à mi-chemin** : « Retour interrompu (…). Déjà fait : … « Annuler » remet le planning d'avant. » — l'état d'avant a été gardé en (3), donc « Annuler » reprend là où on en était. **Un seul retour à la fois** par semaine (double clic, deux fenêtres) ; la fenêtre ne se ferme pas pendant un retour.

**Traces (lot 3)** : chaque case touchée par un retour est tracée par la base — origine « écran » (ou « assistant » si c'est l'assistant qui restaure : `withOrigin`). L'origine « restauration » n'est pas utilisée : le retour se fait depuis le navigateur, avec les écritures existantes, pas par une fonction du serveur.

**À savoir** : « Annuler » après un retour remet les cases effacées (même identifiant), mais pas le **lien** entre elles et d'éventuelles lignes d'heures « retirées » par le salarié (leurs heures ne bougent pas ; seul le lien disparaît).

## Migration

`supabase/migrations/20261012100000_lot8_versions_planning.sql` — **pas encore appliquée**. 100 % additive : une table `planning_versions`, une fonction (le déclencheur qui pose n°, auteur, date), un déclencheur, deux index, deux policies. Aucune table, colonne, policy, fonction ni déclencheur existant n'est modifié.

- **Droits** : RLS active ; le **bureau** de l'entreprise (`is_admin()`) **lit et ajoute**, rien d'autre. **Aucune** policy ni aucun droit UPDATE, DELETE ou TRUNCATE, pour personne (le service non plus : aucun droit donné). `anon` : rien. Ajout limité à 7 colonnes : ni l'identifiant, ni le n°, ni l'auteur, ni la date ne se choisissent.
- **Numérotation sans doublon** : le déclencheur prend un verrou par (entreprise, semaine) avant de numéroter. Essayé à la main sur un vrai Postgres 16 avec `pgbench` (hors suite de tests : PGlite n'a qu'une seule connexion) : 300 ajouts lancés par 20 connexions sur deux entreprises → n° 1 à 152 et 1 à 148, aucun doublon, aucun échec ; deux transactions en même temps sur la même semaine : la seconde attend la première, puis prend le n° suivant. `npm run test:versions-db` vérifie la présence du verrou et la numérotation de 12 ajouts lancés ensemble.
- **Contrôles de la base** : semaine = un lundi ; sorte parmi cinq ; `request` seulement pour `assistant`, 500 caractères au plus ; `note` 200 ; `cells` un tableau de 2000 au plus ; 1000 salariés au plus.
- **Pas de clé étrangère** (comme `traces`) : une version n'empêche aucune suppression d'entreprise ; elle reste lisible comme historique jusqu'à la purge.
- **Aucun `DROP`, `DELETE`, `TRUNCATE`, `CASCADE` ni `ON DELETE` dans le SQL exécutable** : ils n'apparaissent que dans les commentaires de l'en-tête (le retour arrière).
- L'en-tête contient le **RETOUR ARRIÈRE** (les versions cessent d'être lues et écrites par l'appli ; la table et les versions déjà gardées **restent**), la **VÉRIFICATION APRÈS APPLICATION** (une lecture seule, 10 × `true`) et la ligne d'**HISTORIQUE** (`20261012100000`, `lot8_versions_planning`).

## Ordre de déploiement

1. **La migration** (Cowork, avec sa VÉRIFICATION puis l'HISTORIQUE).
2. **Le front** (l'entrée « Versions » apparaît d'elle-même à la prochaine ouverture de l'écran).

**Aucune fonction Edge** n'est à déployer pour ce lot. (La fiche d'aide « Revenir à une version d'avant du planning » est dans `assistant-actions-core.ts` : l'assistant la connaîtra au prochain déploiement de sa fonction, sans urgence ; les libellés cités sont vérifiés par `npm run test:assistant-aide`.) Déployer le front avant la migration est sans effet ; appliquer la migration sans le front aussi.

## Tests

| Commande | Ce qu'elle prouve |
|---|---|
| `npm run test:versions` | règles pures : différence, cases gardées, rien à faire, demande coupée à 500, semaine lundi → dimanche, aucune case d'une autre semaine ou entreprise dans un plan, paquets |
| `PGLITE_DIR=/tmp/pglite-test npm run test:versions-db` | la migration sur un Postgres jetable : droits, deux entreprises, n° sans doublon, contrôles, rejouable, retour arrière, aucun DROP / DELETE exécuté |
| `npm run build` puis `npm run test:versions-ecrans` | les écrans : entrée cachée sans migration, liste, aperçu, confirmation, état gardé d'abord, cases gardées, échecs, « Annuler », assistant (playwright-core doit être résoluble) |
