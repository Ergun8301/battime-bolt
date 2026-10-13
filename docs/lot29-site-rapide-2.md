# Lot 29 — Site rapide, étape 2 : moins de requêtes, règles d'accès optimisées, index

> **Objectif chiffré non atteint** : bureau 24 requêtes (visé : environ 20), salarié 18 (visé : environ 15). Aller plus loin change ce que voit l'utilisateur ; les leviers chiffrés sont plus bas (« Pourquoi pas environ 20 »), décision d'Ergun.

## Ce que ça fait
Rien ne change à l'écran. Le site fait simplement moins de requêtes et en fait moins pour rien.

**Côté écran (aucune migration nécessaire)**
- Les réglages de l'entreprise (nom, logo, trajet payé, heures de la semaine, majorations, e-mail du comptable, essai/abonnement, assistant, borne, position, panier) sont lus **une seule fois** pour tout l'écran (`lib/company-settings.ts`). Avant : 4 lectures de la même ligne au chargement du bureau, 7 côté salarié, plus une relecture du nom à chaque sondage de 60 s.
- Le salarié ne lit que **5 colonnes** (trajet, assistant, borne, position, panier) : pas d'e-mail du comptable, de majorations ni d'abonnement dans son téléphone.
- **Onglet caché = zéro requête** (bureau et salarié). Au retour sur l'onglet, les compteurs sont relus si l'onglet est resté caché 30 s ou plus (pas de rafale à chaque va-et-vient). Les réglages ne sont relus au retour que si la dernière lecture a 5 minutes ou plus.
- Les réglages sont relus **tout de suite** après « Enregistrer » (même si le panier repas, enregistré à part, échoue) et après une action de l'assistant : le nouveau nom apparaît dans l'en-tête sans attendre 60 s.
- Les **exports de paie** (Excel, PDF, CSV, envoi au comptable) relisent les réglages au clic : heures de base, majorations, trajet payé et nom ne sont jamais périmés. Lecture impossible : export annulé avec un message, jamais de fichier avec des valeurs par défaut.
- Si la **première lecture échoue** (réseau mobile), un nouvel essai part chaque minute tant que l'onglet est visible et que rien n'a été lu (onglet caché : aucun essai, relecture au retour avec toutes les colonnes). Une fois lu, plus rien.
- Le nombre de salariés (forfait) vient de la liste déjà lue par le planning : une requête de moins.
- Salarié : les journées « à envoyer » et les brouillons sont lus ensemble (3 requêtes au lieu de 4) ; corrections, modifications et positions du jour partent en parallèle (un aller-retour au lieu de trois).
- Les lectures paginées (documents, tâches, réunions…) s'arrêtent dès qu'une page est plus courte que la taille demandée : une requête de moins quand il y a peu de lignes.

**Côté base (migration à appliquer)** : `supabase/migrations/20261013120000_lot29_regles_acces_index.sql`
- 33 règles d'accès signalées par l'outil d'analyse de Supabase sont réécrites : `auth.uid()`, `get_my_company_id()` et `is_admin()` sont entourés de `(SELECT …)` pour être calculés une fois par requête et non une fois par ligne. Transformation purement syntaxique, **mêmes droits**. `is_my_team_member(user_id, work_date)` n'est jamais entouré (il dépend de la ligne).
- 4 index : `planning(company_id, work_date)`, `time_entries(company_id, work_date)`, `worksite_expenses(worksite_id)`, `active_sessions(planning_id)`.
- Rien n'est supprimé (ni `DROP`, ni `DELETE`, ni `CASCADE`). Les règles hors de la liste, la règle `support_read` et les 17 index inutilisés ne sont pas touchés.
- Le front et la migration peuvent être mis en ligne dans n'importe quel ordre.

## Chiffres mesurés (`npm run test:requetes`, base simulée, hors profil)
| | Avant | Après | Budget du test |
|---|---|---|---|
| Bureau 1440 px | 29 | **24** | ≤ 24 |
| Bureau 390 px | 29 | **24** | ≤ 24 |
| Salarié 390 px | 25 | **18** | ≤ 18 |
| Lectures de `companies` (bureau / salarié) | 4 / 7 | **1 / 1** | 1 |
| Chaîne la plus longue après le profil (bureau / salarié) | 3 / 4 | **1 / 2** | ≤ 2 |
| Onglet caché ~4 min 20 (bureau / salarié) | 43 / 16 | **0 / 0** | 0 |
| `companies` relu par le sondage de 60 s | oui | **non** | 0 |
| Départ corrections / modifications / positions | 529 ms d'écart | **14 ms** | < 125 ms |
| Documents lus (0 / 3 / 499 / 500 / 501 / 1203 lignes) | 1, 2, 2, 2, 3, 4 | **1, 1, 1, 2, 2, 3** | |

Poids : la page `/poseur` perd environ 2,5 ko (gzip), la page `/admin` est inchangée (± 0).

## Pourquoi pas « environ 20 » et « environ 15 »
Les points demandés (pause onglet caché, lecture unique, crochet commun, pagination, lectures en parallèle) changent la durée et le sondage plus que le nombre de requêtes du premier chargement. Atteindre 20 / 15 demande de **différer des lectures qui alimentent un élément visible** (entrées de menu « Formations » et « Traces », bandeau formations, pastille 📎), ce qui change ce que voit l'utilisateur : non fait. Leviers restants, à décider :
- Bureau : reporter les sondes `trainings` et `traces` (déjà revérifiées à l'ouverture de « Salariés », « Réglages » et du menu) : −2 → 22 ; plus `planning_versions` : −3 → 21 ; fusionner les deux lectures `time_entries` « annulées » : −1 → 20. Effet visible : une entrée de menu qui apparaît environ 300 ms plus tard.
- Salarié : différer les 2 appels de formations (bandeau qui apparaît plus tard) : −2 → 16 ; (f) pastilles 📎 en un seul compteur (hors lot) : −1 → 15.

## À tester sur téléphone (préview .pages.dev)
1. Bureau : ouvrir `/admin` — nom, logo, bouton « Borne », compteurs (congés, réserves, invitations), panneau d'abonnement comme avant.
2. Réglages de l'entreprise : changer le nom, « Enregistrer » → le nouveau nom apparaît **tout de suite** dans l'en-tête. Demander à l'assistant de changer un réglage (ex. temps de trajet payé) : l'écran suit.
3. Laisser le bureau en arrière-plan 2 minutes, revenir : les compteurs se mettent à jour dans la seconde. Revenir après 10 secondes seulement : rien ne bouge, rien ne clignote.
4. Salarié : `/poseur`, passer Journée → Semaine → Journée plusieurs fois : la case « Panier », le temps de trajet et la mention de position restent stables (pas de clignotement).
5. Salarié : « Je commence » / « J'ai fini » sur une journée qui a déjà une ligne : corrections, modifications et positions s'affichent normalement.
6. Salarié : le bandeau « journées à envoyer » se met à jour au retour sur l'application après une minute d'absence.
7. Un réglage changé depuis le bureau (position, panier) : le salarié le voit au rechargement ou au retour sur l'application après 5 minutes ou plus.
8. Comparer avec la production : aucune différence de rendu à 390 px (captures : `docs/captures-lot29/bureau-390.png`, `salarie-390.png`).

## Limites
- Un réglage changé **ailleurs** (autre administrateur, autre appareil, SQL) n'apparaît à l'écran qu'au rechargement ou au retour sur l'onglet après 5 minutes ou plus (avant : sous 60 s). Les exports de paie, eux, relisent au clic. Le bouton « Je commence » du salarié (aujourd'hui masqué dans l'application) relirait l'interrupteur de position à chaque geste (au plus une fois par 30 s).
- Retour sur l'onglet après moins de 30 s : rien n'est relu tout de suite, mais la prochaine lecture garde son échéance d'avant (jamais plus d'une minute entre deux lectures des compteurs).
- Le gain des règles d'accès est partiel : environ 36 autres règles appellent encore les fonctions « nues » ; elles ne sont pas dans la liste de l'analyseur et ne sont pas touchées.
- Chaîne plus longue que 2 dans les cas dégradés : `ensure_planning_slot` + relecture (heure sans créneau), `ensure_other_worksite` + relecture, colonne `exit_forgotten` ou `start_time/end_time` absente, plus de 500 documents (page 2).
- Si une colonne de `companies` manque en base (préview sur une autre base, retour arrière), la lecture groupée échoue et le site relit les réglages par petits groupes (6 requêtes en parallèle côté bureau, 5 côté salarié). Chaque réglage manquant se cache tout seul, sans message d'erreur. Le repli reste actif jusqu'au rechargement.
- Pour le rôle « anonyme » seulement : sur `time_entry_corrections` et `time_entry_positions`, un `DELETE`/`UPDATE` qui ne trouvait rien répond maintenant « permission denied » au lieu de « 0 ligne ». Aucune ligne n'est touchée, personne ne gagne ni ne perd d'accès (voir le test).

## À vérifier AVANT la fusion de la pagination (obligatoire)
`fetchAllPaged` s'arrête quand une page revient plus courte que 500 lignes. Cela suppose que le plafond serveur « Max rows » (Supabase : Dashboard → Settings → API) est **au moins 500, idéalement 1000** (défaut 1000). **Ne pas fusionner `lib/fetch-all.ts` tant que ce réglage n'est pas confirmé.** Le filet dans le code est incomplet : une page plus longue que demandée lève une erreur, et une page courte dont la taille est un multiple de 50 (100, 200, 250…) fait redemander une page ; mais un plafond réglé à une valeur qui n'est pas un multiple de 50 (60, 120, 333…) tronquerait un export de paie sans erreur. Si le réglage est inférieur à 500, ne rien fusionner de la partie (d).

## Migration : appliquer et vérifier (par Cowork)
Nom du fichier : `20261013120000_lot29_regles_acces_index.sql`. Jamais de `db push`.
1. Lecture seule avant : `SELECT count(*) FROM pg_policies WHERE schemaname='public';` (à garder) et `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('planning','time_entries','worksite_expenses','active_sessions');` (si un index équivalent existe sous un autre nom, retirer la ligne correspondante du fichier : sinon simple alerte « doublon »).
2. Appliquer hors fermeture nocturne des pointages oubliés : chaque `ALTER POLICY` verrouille sa table pendant la transaction (`lock_timeout` 5 s : si une table est occupée, tout est annulé, on réessaie).
3. Le bloc compare d'abord chacune des 33 règles à la définition de production du 13/10/2026 ; au moindre écart il s'arrête avec le nom de la règle et ne change rien. Dans ce cas, relever les nouvelles définitions et régénérer (voir le test).
4. Après : lancer la requête « VÉRIFICATION » de l'en-tête du fichier → **9 × true** ; relancer le comptage de règles (identique) ; puis se connecter en administrateur, chef d'équipe et salarié de test et vérifier que chacun voit ce qu'il voyait (planning, heures, documents, réunions).
5. Inscrire dans l'historique (si le fichier est collé dans l'éditeur SQL) : `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261013120000','lot29_regles_acces_index') ON CONFLICT DO NOTHING;`
6. Retour arrière : les 33 `ALTER POLICY` vers les anciennes définitions sont listés en clair en commentaire dans l'en-tête du fichier.

Si un autre lot (24, 23, 19, 18) modifie une des 33 règles avant l'application, appliquer le lot 29 d'abord, sinon régénérer le fichier (la garde protège).

## Tests
- Contrôle « aucune suppression » de la migration : après retrait des commentaires, `grep -iwE 'drop|delete|truncate|cascade'` doit être **vide**. Un `grep -i delete` sans `-w` signale à tort 10 lignes : ce sont les NOMS de 5 règles (`active_sessions_delete`, `documents_delete`, `leave_requests_delete`, `push_subscriptions_own_delete`, `time_entries_worker_delete_own_draft`), jamais une instruction ; renommer une règle changerait ses droits.
- `npm run test:regles-acces` (à lancer seul, environ 2,5 min) : régénère la migration depuis l'export de production (`supabase/tests/fixtures/policies-prod-2026-10-13.txt`), compare règle par règle avant/après sur 54 934 sondes (2 entreprises, administrateur, chef d'équipe, salarié, salarié archivé, support, anonyme), vérifie que 3 mutations volontaires sont bien détectées, le rejeu, la garde et la vérification « 9 × true ».
- `npm run test:reglages-entreprise` (lecture groupée, repli, erreurs), `npm run test:pagination`, `npm run test:requetes` (budgets de requêtes dans de vrais navigateurs, après `npm run build`).
