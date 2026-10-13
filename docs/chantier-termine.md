# Chantier terminé et bilan du chantier (lot 23)

**En une phrase** : le bureau peut dire « ce chantier est terminé le … » (et le rouvrir quand il veut), il voit en une page le bilan du chantier (heures, dépenses, réserves, documents, budget), et les salariés ne se voient plus proposer ce chantier pour une nouvelle intervention.

Rien n'est supprimé et aucune heure n'est modifiée : « terminer » pose seulement une date sur le chantier.

## 1. Pour le bureau

Tout se passe dans la **fiche client** (téléphone : ☰ → Chantiers → la ligne ; ordinateur : Clients → le crayon). Un petit bloc affiche « Chantier en cours » ou « Terminé le 12 octobre 2026 », avec les boutons « Bilan du chantier » et « Terminer le chantier » (ou « Rouvrir le chantier »).

### Terminer

- La date de fin est **celle du jour par défaut**, modifiable, **jamais dans le futur** (l'écran et la base le refusent).
- Avant de terminer, l'écran contrôle quatre choses et les signale. Ce sont des **avertissements, jamais des blocages** : le bouton devient « Terminer quand même ».
  1. les **réserves non levées** de ce chantier ;
  2. les **pointages en cours** (chrono ouvert sur ce chantier) ;
  3. les **brouillons non envoyés** (un brouillon vide ne compte pas) ;
  4. les **interventions planifiées à venir** (aujourd'hui s'il reste à pointer, ou plus tard ; une absence n'est pas une intervention).
- Si le contrôle lui-même ne peut pas se faire (réseau, lecture refusée), l'écran le dit et laisse terminer.
- Un refus de la base (compte pas du bureau, chantier d'une autre entreprise, date future) s'affiche en français et rien ne change.

### Rouvrir

« Rouvrir le chantier » retire la date. Le chantier est de nouveau proposé aux salariés. Rien d'autre ne bouge.

### Le bilan (lecture seule)

Une seule colonne, lisible sur téléphone, aucun bouton d'écriture :

| Rubrique | Ce qu'on y lit | D'où vient le chiffre |
|---|---|---|
| Période | première et dernière intervention, date de fin | interventions qui comptent (envoyées) |
| Heures | « Heures validées », dont route payée, « Heures en attente », puis chaque salarié | `my_worksite_labour` : **la même fonction que « Coût chantiers »** et les alertes de budget |
| Main-d'œuvre | coût, avec « Taux horaire manquant : coût incomplet » si besoin | idem |
| Dépenses | total et par catégorie (Matériaux, Sous-traitance, Location, Divers) | `worksite_expenses`, mêmes catégories et mêmes mots que « Coût chantiers » |
| Réserves | « À lever » (avec qui et quoi) et « Levées » | même règle que le registre des réserves (`lib/reserves.ts`) : levée par le bureau **ou** par le salarié |
| Documents rangés | nombre par catégorie, **factures comprises** (le bureau seulement, lot 24) | `documents` |
| Budget prévu / réel | heures et euros prévus contre réels, barre et pourcentage, 70 / 80 / 100 % | **même fonction que « Coût chantiers »** (`budgetProgress`) |
| Coût total | main-d'œuvre + dépenses | comme la carte « Total » de « Coût chantiers » |

**« Validées » et « en attente »** : l'application ne distingue plus « validée » de « envoyée » (le statut « validée » est un reste historique, traité comme « envoyée » partout). Le bilan dit donc :

- **Heures validées** = les heures **envoyées** par les salariés. C'est exactement le chiffre de « Coût chantiers » pour ce chantier, route payée comprise ;
- **Heures en attente** = les **brouillons** non envoyés. Ils ne comptent nulle part ailleurs, donc ils ne sont **jamais** ajoutés au total.

**Aucun chiffre n'est recalculé** : les heures, la route et le coût viennent de la fonction SQL de « Coût chantiers » ; le bilan ne fait que les ranger par salarié. Le test compare le bilan à des sommes SQL indépendantes et à l'écran « Coût chantiers » sur le même jeu de données.

Le bilan couvre **toute la vie du chantier** (pas une période choisie). Il lit ses données **à l'ouverture** (rien n'est lu au chargement du bureau), et reste en chargement différé (voir `docs/site-rapide-1.md`).

« Terminé » n'est **pas** « archivé » : un chantier terminé reste actif (il garde sa place dans les listes du bureau, avec « Terminé le … »), seul l'archivage le range pour de bon.

## 2. Pour les salariés (et les chefs d'équipe)

- Un chantier terminé **n'est plus proposé** dans « + » (nouvelle intervention) ni dans la liste de « Mon équipe » du chef d'équipe. Même en tapant son nom : « Aucun chantier trouvé ».
- Il garde **son nom, ses heures, son historique** partout ailleurs : cartes de « Ma journée », semaine, mois, historique, pointage en cours. Le total du jour est exact.
- Là où le chantier est affiché, on lit **« Terminé le … »**.
- Un **pointage déjà en cours** sur ce chantier continue normalement (« Terminer ma journée » marche). Une intervention **déjà planifiée** par le bureau reste dans la journée.
- Il n'y a **aucun blocage en base** : le masquage est seulement dans les listes de choix. Rien ne casse.

## 3. Ce que fait la migration

`supabase/migrations/20261013180000_lot23_chantier_termine.sql` — **additive**, rejouable, sans `DROP`, `DELETE`, `TRUNCATE`, `CASCADE` ni clé étrangère (aucun de ces mots, même dans les commentaires).

| Objet | Rôle |
|---|---|
| `worksites.completed_at` (timestamptz) | le jour de fin, écrit **à midi UTC** (le même jour partout en Europe). **Peut déjà exister en production** (audit du 13/10 : colonne présente, 0 ligne renseignée) ; aucune migration du dépôt ne la crée, d'où `ADD COLUMN IF NOT EXISTS` |
| `worksites.completed_by` (uuid) | qui l'a posé (sans clé étrangère : la trace survit au compte) |
| `worksite_completion_ready()` | « suis-je prête ? » : l'écran cache tout tant qu'elle manque |
| `set_worksite_completed(chantier, jour)` | terminer (un jour) ou rouvrir (`NULL`). **Bureau de l'entreprise du chantier seulement**, jamais dans le futur ; ne touche que les deux colonnes |
| `guard_worksite_completion()` + déclencheur | ceinture : un non-bureau ne pose jamais le statut (à l'insertion d'un chantier par un salarié, il est remis à vide) |

**Aucune règle d'accès (RLS) de `worksites` n'est créée, modifiée ni retirée.** Un salarié ne peut toujours qu'**insérer** un chantier ; il ne peut jamais en changer le statut (essayé : fonction refusée, `UPDATE` direct = 0 ligne, insertion avec statut forcé = remis à vide).

Le **mode support** (lecture seule, lot 5) : le bilan se lit, aucun bouton « Terminer » ni « Rouvrir » ; côté base, la fonction ne trouve pas le chantier du client (le compte support est « bureau » de **sa propre** entreprise seulement). Les heures ne sont pas affichées en mode support (la fonction de coût répond pour l'entreprise du compte connecté, pas pour le client visité) : le bilan le dit au lieu de montrer des zéros.

## 4. Mettre en ligne (Ergun) : la migration d'abord, puis l'application

1. **Avant** (éditeur SQL) : voir si la colonne existe déjà (normal) :
   ```sql
   SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'worksites' AND column_name IN ('completed_at', 'completed_by');
   ```
   `completed_at` (timestamptz) peut être là ; `completed_by` ne l'est pas. Et les règles de `worksites` : `SELECT policyname, cmd FROM pg_policies WHERE tablename = 'worksites';` → `worksites_select_company`, `worksites_worker_insert_own_company`, `worksites_admin_write`, `support_read`.
2. **Coller et exécuter** le fichier de migration dans l'éditeur SQL (jamais `db push`).
3. **Après** : exécuter la requête du bloc « VÉRIFICATION » de l'en-tête du fichier : **9 × true**.
4. Inscrire l'historique (ligne `INSERT` du bloc « HISTORIQUE », nom `lot23_chantier_termine`).
5. **Ensuite seulement**, mettre en ligne l'application.

**Tant que la migration n'est pas appliquée** (ou après son retour arrière), l'application est exactement celle d'avant : pas de bloc dans la fiche client, pas de « Terminé le … » dans les fiches, aucun message, aucune erreur (l'écran interroge `worksite_completion_ready()` et se tait si elle manque, est refusée ou si la colonne n'est pas dans la ligne lue). Le test le prouve : fonction absente, fonction refusée, réseau coupé, colonne absente, absence de réponse.

**Retour arrière** : bloc « RETOUR ARRIÈRE » de l'en-tête (en commentaire). Il **neutralise sans rien retirer** : deux `REVOKE` rendent les fonctions inappelables, l'application cache de nouveau tout (sans message) et plus personne ne peut poser ou retirer le statut. Le déclencheur de garde reste en place, les colonnes et leurs valeurs sont **gardées** (rien n'est effacé ; le fichier ne contient aucun `DROP`, même en commentaire). Rejouer le fichier rend les droits. Un chantier déjà terminé reste masqué des listes de choix des salariés (c'est la donnée qui décide) ; pour le rouvrir à la main : `UPDATE public.worksites SET completed_at = NULL, completed_by = NULL WHERE id = '…';`. Retirer vraiment les objets serait une décision à part.

## 5. À tester sur téléphone (Ergun)

Après la migration et la mise en ligne, sur un chantier **de test** (pas un vrai client) :

1. ☰ → Chantiers → ouvrir la fiche : « Chantier en cours », boutons « Bilan du chantier » et « Terminer le chantier ».
2. « Bilan du chantier » : toutes les rubriques tiennent sur l'écran sans glisser de côté ; **comparer avec ☰ → Coût chantiers** : mêmes heures, même route, même pourcentage de budget.
3. « Terminer le chantier » : la date du jour est proposée ; essayer demain (refusé). Avec une réserve, un brouillon, un pointage ou une intervention à venir sur ce chantier : les avertissements apparaissent, le bouton dit « Terminer quand même ».
4. Terminer : la fiche affiche « Terminé le … » ; la liste des chantiers aussi.
5. Sur le téléphone **d'un salarié** : « + » ne propose plus ce chantier ; ses anciennes heures, la semaine et l'historique le montrent encore avec « Terminé le … » ; un pointage ouvert avant se termine normalement.
6. « Rouvrir le chantier » : le salarié le revoit dans « + ».

## 6. Limites (à connaître)

- **Borne / QR et assistants IA** : la fonction de la borne et les assistants (bureau et salarié) lisent leurs listes de chantiers côté serveur (fonctions edge). Ce lot n'y touche pas : ils peuvent encore proposer un chantier terminé. Pour les en tenir à l'écart il faudra une modification des fonctions `kiosk`, `worker-assistant` et `assistant` (filtre `completed_at IS NULL`), à faire dans un lot qui touche l'IA / la borne. De même, `lib/worker-worksite.ts` (chantier créé ou retrouvé par l'assistant du salarié) ne connaît pas le statut.
- **Guides pas à pas** : pas de fiche ajoutée. Les fiches du bureau (`admin-tours.ts`) sont liées au guide écrit de l'assistant (IA), qu'on ne touche pas ici, et le test refuse une ancre sans étape.
- Le bilan ne propose pas de période : c'est **toute la vie** du chantier (comme le budget).
- Le bureau garde un chantier terminé dans ses listes (palette de glisser-déposer comprise), avec la mention « Terminé le … » : il peut encore y planifier un passage (SAV).
- Le bilan lit **toutes** les lignes de « Coût chantiers » de l'entreprise (une seule fonction, sans période) pour n'en garder que celles du chantier : c'est le prix de ne pas recalculer.
- Le statut est un **jour** (écrit à midi UTC). Un chantier terminé le 1ᵉʳ octobre affiche « Terminé le 1 octobre 2026 » (même écriture que le reste de l'application).

## 7. Poids

`next build` (Next 14.2.33), First Load JS : **`/admin` 353 → 355 kB** (budget 363), **`/poseur` 335 → 335 kB** (budget 345), `/borne` 167, partagé 88,6 : tous les budgets tiennent, aucun n'est élargi. Le bloc de la fiche est dans le premier chargement (petit) ; le contrôle avant de terminer et le bilan sont dans une fenêtre chargée à l'ouverture (`components/chantier-termine.tsx`, `lib/lazy-window.tsx`). Le statut « terminé » du salarié tient dans un fichier minuscule (`chantier-statut.ts`).

## 8. Tests

| Commande | Ce qu'elle prouve |
|---|---|
| `npm run test:chantier-termine-db` | la migration sur une vraie base jetable (PGlite), **rejouée avec la colonne absente puis déjà présente** : additive, rejouable, retour arrière, vérification 9 × true, abus (salarié, chef d'équipe, bureau désactivé, autre entreprise, compte support, anonyme, insertion avec statut forcé), date future refusée, aucun blocage des écritures, bilan = sommes SQL indépendantes (heures, route, brouillons, réserves, dépenses, documents, budget). 237 vérifications |
| `npm run test:chantier-termine` | les règles pures (Deno) : date, avertissements, comptages, formats et budget identiques à « Coût chantiers », bilan complet |
| `npm run test:chantier-termine-ecrans` (après `npm run build`) | les vraies pages à 390 px : fiche, terminer avec ses quatre avertissements, erreurs, rouvrir, bilan, mêmes chiffres que « Coût chantiers », fonction cachée avant la migration, mode support, salarié et chef d'équipe. 95 vérifications |

Captures à 390 px : `docs/captures-chantier-termine/` (fiche, terminer avec avertissements, bilan haut et bas, journée du salarié, choix de chantier sans le chantier terminé).

La sonde de débordement des fenêtres (`scripts/tests/fenetres-lot11.mjs`) mesure aussi « Terminer le chantier » et « Bilan du chantier », sur le chantier aux noms interminables, à trois tailles d'écran.
