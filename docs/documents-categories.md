# Documents : factures réservées au bureau, catégorie modifiable (lot 24)

Deux changements sur les documents d'un chantier (panneau « Documents », côté bureau et côté salarié).

## 1. Ce que ça fait

**Les factures sont réservées au bureau.** Un document rangé en « Facture » ou « Facture payée » n'est visible que par le bureau (compte administrateur actif de l'entreprise). C'est la **base de données** qui le décide, pas seulement l'écran :

- la ligne du document n'est plus lue par un salarié ni un chef d'équipe ;
- le **fichier** non plus : même en connaissant son chemin, un salarié ne peut ni le télécharger, ni demander un lien signé, ni le voir dans la liste du stockage ;
- un salarié ne peut ni **déposer** un document directement en facture, ni **passer** un document en facture (refusé avec le message « Les factures sont réservées au bureau. ») ;
- les documents **sans catégorie** et ceux des autres catégories (devis, plan, PV de réception, photo, réserve, autre) restent visibles comme avant. **Les devis restent visibles des salariés.**

**La catégorie se change après coup.** Dans la liste des documents, chaque ligne a un bouton avec sa catégorie (« Devis ▾ », « Sans catégorie ▾ »…). On le touche, on choisit, on enregistre. Un bandeau de 8 secondes propose « Annuler » pour remettre l'ancienne catégorie.

| Qui | Peut changer la catégorie de | Peut choisir |
|---|---|---|
| Bureau | tous les documents de son entreprise | les 8 catégories, ou « Sans catégorie » |
| Salarié, chef d'équipe | **ses propres** documents, seulement si la catégorie actuelle est vide ou dans {photo, plan, devis, PV de réception, autre} | photo, plan, devis, PV de réception, autre, ou « Sans catégorie » |

Pourquoi l'auteur peut corriger son document : l'assistant se trompe parfois de catégorie, et seul celui qui a envoyé le fichier sait ce que c'est. Il ne peut jamais choisir (ni quitter) une facture, ni « Réserve » (cette catégorie alimente le rapport de réserves, que seul le bureau manie).

Seule la **catégorie** change. Ni le fichier, ni le chantier, ni l'auteur, ni l'entreprise, ni la date : la base le refuse pour tout utilisateur connecté (déclencheur + droits de colonne). Le bureau peut en plus renommer un document (c'est ce que fait l'action « modifier un document » de l'assistant bureau). Chaque changement de catégorie est **tracé** (qui, quand, ancienne et nouvelle catégorie).

## 2. Ce que les salariés ne voient plus

> **CHANGEMENT NON ADDITIF DANS SES EFFETS.** La migration n'enlève rien, mais dès qu'elle est appliquée, des personnes **perdent une vue** qu'elles avaient.

Dès l'application, les **salariés et chefs d'équipe** ne voient plus :

- les factures dans la liste des documents d'un chantier (ni dans leur compteur de pièces, ni dans l'aperçu, ni au téléchargement) ;
- les factures dans le message « Envoyer au client » côté salarié (il ne les a plus dans sa liste) ;
- le fichier d'une facture, même avec son adresse directe ;
- le nom et le document d'une **formation** liée à une facture (la formation disparaît de leur liste ; le bureau la voit toujours dans son écran Formations) ;
- et un document passé en facture **après** avoir été rattaché à une formation disparaît de même, sans message.

Le compte **support** (accès temporaire d'un technicien) ne voit pas non plus les factures des entreprises qu'il visite.

**En production, il y a 0 document au 12/10/2026 : aucune donnée à migrer, personne ne perd rien aujourd'hui.** L'effet ne se verra qu'à mesure que le bureau rangera des documents en facture.

À savoir :

- les liens signés déjà émis restent valables jusqu'à leur expiration (1 h pour l'affichage, 7 jours pour un message au client) ;
- l'assistant salarié peut encore proposer « facture » pour un fichier : son exécution range alors le document **sans catégorie** et le dit (« Document rangé dans le chantier, sans catégorie : les factures sont réservées au bureau. ») ;
- l'effet de bord utile : l'action « modifier un document » de l'assistant bureau échouait toujours (aucune règle de mise à jour n'existait) ; elle fonctionne après la migration.

## 3. Appliquer et vérifier (Ergun)

La migration est `supabase/migrations/20261013120000_lot24_documents_factures_categorie.sql`. Elle est **additive** (aucune suppression, aucun `ALTER POLICY`), rejouable, et indépendante du lot 29 (ordre d'application indifférent).

1. **Avant** : dans l'éditeur SQL, `SELECT policyname, cmd FROM pg_policies WHERE tablename = 'documents';` doit rendre **4 règles** (`documents_select`, `documents_insert`, `documents_delete`, `support_read`). Une règle de mise à jour posée à la main se combinerait avec la nôtre.
2. Coller et exécuter le fichier, jamais `db push`.
3. **Après** : exécuter la requête du bloc « VÉRIFICATION » de l'en-tête du fichier : **13 × true**.
4. Inscrire l'historique (ligne `INSERT` du bloc « HISTORIQUE »).
5. Voir la trace : `SELECT * FROM public.document_category_log ORDER BY id DESC LIMIT 10;`
6. Retour arrière : bloc « RETOUR ARRIÈRE » de l'en-tête (en commentaire). Les salariés revoient alors les factures, le bouton disparaît ; la table de trace est conservée.

**Tant que la migration n'est pas appliquée**, l'application est exactement celle d'avant : pas de bouton de catégorie, aucun message, aucune erreur (l'écran interroge une petite fonction `document_category_ready()` et se tait si elle n'existe pas).

## 4. Comment tester sur téléphone

Pré-requis : migration appliquée, données **fictives**, pas l'entreprise de démonstration.

1. **Bureau** : chantier → Documents. Chaque ligne a un bouton « Sans catégorie ▾ » (ou sa catégorie). Toucher, choisir « Facture », lire « Les salariés ne verront plus ce document. », Enregistrer. Le bandeau « Catégorie changée : Facture. » apparaît en bas : toucher « Annuler » dans les 8 secondes, la catégorie revient.
2. **Salarié** (autre téléphone, compte de test) : le document passé en facture a **disparu** de sa liste et de son compteur. Un ancien lien enregistré (hors lien signé encore valable) n'ouvre rien.
3. **Salarié** : envoyer une photo, elle porte « Sans catégorie ▾ ». Choisir « Plan » : OK. On ne lui propose ni Facture, ni Facture payée, ni Réserve. Sur le document d'un collègue, pas de bouton.
4. **Salarié** : demander à l'assistant de ranger un fichier « facture … » : il est rangé sans catégorie, avec la phrase « les factures sont réservées au bureau ».
5. Mode avion, puis Enregistrer : « Pas de connexion : rien n'a été changé. Réessayez. » Rétablir le réseau : « Réessayer ».
6. **Bureau** : repasser la facture en « Devis » : le salarié la revoit après réouverture du panneau.
7. **Assistant bureau** : « mets la catégorie devis sur le document X » : « Document modifié. » (avant la migration : « Modification refusée »).
8. À 390 px : aucun défilement horizontal, boutons faciles à toucher au pouce.

## 5. Tests

| Commande | Ce qu'elle prouve |
|---|---|
| `npm run test:documents-db` | la base (PGlite) : lecture des lignes et des fichiers, dépôt, changement, trace, formations, abus (salarié, collègue, archivé, autre entreprise, anonyme, support), cohabitation avec le lot 29, retour arrière |
| `npm run test:documents` | les règles pures de l'écran (catégories, qui peut quoi, avertissements, messages d'erreur) et leur accord avec la migration |
| `npm run build` puis `npm run test:documents-ecrans` | l'écran à 390 px et 1024 px sur une base simulée : bureau, salarié sans factures, erreurs, migration absente, clavier, aucun défilement horizontal, aucune suppression ajoutée |

Captures à 390 px : `docs/captures-documents-categories/` (`01-liste-bureau`, `02-choix-bureau`, `03-erreur-refus`, `04-bandeau-annuler`, `05-liste-salarie`, `06-choix-salarie`, `07-migration-absente`).

## 6. Limites connues

- Pas de choix de catégorie **à l'envoi** : « Photo » et « Fichier » restent comme avant (sans catégorie), on classe ensuite en un geste. À proposer si besoin.
- Le message « Annuler » est un **bandeau dans le panneau**, pas un message flottant : le panneau Documents est une fenêtre qui rend inerte ce qui est derrière elle, un message flottant y serait intouchable.
- Changer la catégorie d'une photo de levée de réserve (hors « Réserve ») la sort du rapport de réserves : le bureau en est averti, l'auteur salarié ne peut pas le faire.
- La carte de confirmation de l'assistant salarié affiche encore « Catégorie : Facture » avant validation ; l'exécution range ensuite sans catégorie et le dit.
- Si l'intervention rattachée a changé de jour depuis l'envoi, la base recale la date du document à l'occasion du changement de catégorie (comportement existant).
- La suppression de la **ligne** d'une facture par son auteur salarié, déposée avant la migration, par une requête sans aucun filtre : possible (jamais celle du bureau ni d'un collègue, jamais le fichier). L'application n'envoie jamais une telle requête.
- Un chemin de fichier complet et connu permet de savoir si c'est une facture (la fonction qui décide répond oui/non) ; les chemins contiennent des identifiants non devinables.
- Le trou ancien du stockage (tout membre d'une entreprise peut effacer n'importe quel fichier non-facture de son dossier) n'est pas fermé ici.
- Les boutons existants « télécharger » et « corbeille » restent à 34 px (non touchés pour ne pas gêner d'autres lots) ; les éléments neufs font 44 px au moins (options : 48 px).
- Les fichiers orphelins du stockage (sans ligne) restent lisibles par les membres de l'entreprise.
