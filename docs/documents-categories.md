# Documents : factures réservées au bureau, catégorie modifiable (lot 24)

Deux changements sur les documents d'un chantier (panneau « Documents », côté bureau et côté salarié).

## 1. Ce que ça fait

**Les factures sont réservées au bureau.** Un document rangé en « Facture » ou « Facture payée » n'est visible que par le bureau (compte administrateur actif de l'entreprise). C'est la **base de données** qui le décide, pas seulement l'écran :

- la ligne du document n'est plus lue par un salarié ni un chef d'équipe ;
- le **fichier** non plus : même en connaissant son chemin, un salarié ne peut ni le télécharger, ni demander un lien signé, ni le voir dans la liste du stockage ;
- un salarié ne peut ni **déposer** un document directement en facture, ni **passer** un document en facture (refusé avec le message « Les factures sont réservées au bureau. ») ;
- les documents **sans catégorie** et ceux des autres catégories (devis, plan, PV de réception, photo, réserve, autre) restent visibles comme avant. **Les devis restent visibles des salariés.**

**La catégorie se change après coup.** Dans la liste des documents, chaque ligne a un bouton avec sa catégorie (« Devis ▾ », « Sans catégorie ▾ »…). On le touche, on choisit, on enregistre. Un bandeau propose « Annuler » pour remettre l'ancienne catégorie : il reste 20 secondes, et ne s'efface pas tant qu'on le survole ou qu'il a le focus (au clavier ou au lecteur d'écran, il faut le temps de l'atteindre). Si l'annulation échoue, le message d'alerte reste jusqu'à « Fermer ».

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
- l'assistant salarié peut encore proposer « facture » pour un fichier (la carte affiche « Catégorie : Facture ») : une fois la migration appliquée, **l'exécution ne range rien** et le dit (« Les factures sont réservées au bureau : donnez ce fichier au bureau. Il n'a pas été rangé. »). On ne le range surtout pas « sans catégorie » : un document sans catégorie est visible de **tous** les collègues, l'inverse de ce qu'on veut pour une facture. Avant la migration, rien ne change (la base accepte encore la catégorie) ;
- la suppression d'une **intervention** qui porte des documents continue de marcher (par le salarié sur son brouillon comme par le bureau) : les documents restent, détachés de l'intervention, avec la même catégorie. La base gère ce cas à part (action « SET NULL » de la clé étrangère), le test le prouve ;
- l'effet de bord utile : l'action « modifier un document » de l'assistant bureau échouait toujours (aucune règle de mise à jour n'existait) ; elle fonctionne après la migration.

## 3. Appliquer et vérifier (Ergun)

La migration est `supabase/migrations/20261013120200_lot24_documents_factures_categorie.sql` (le numéro `…120000` est celui du lot 29). Elle est **additive** (aucune suppression, aucun `ALTER POLICY`, aucun `DROP`), rejouable, et indépendante du lot 29 (ordre d'application indifférent). Elle ne touche à aucune règle existante de `documents` ; elle **remplace deux fonctions par la même avec une condition de plus** : `my_trainings()` (un filtre : plus de facture dans les formations des salariés) et `guard_document_write()` (le contrôle du rattachement à l'intervention et le recalage du jour ne jouent qu'à l'envoi ou quand le rattachement change : sans cela, une intervention déplacée de chantier empêchait le bureau de changer la catégorie du document). Les deux définitions d'origine sont dans le bloc de retour arrière.

1. **Avant** : dans l'éditeur SQL, `SELECT policyname, cmd FROM pg_policies WHERE tablename = 'documents';` doit rendre **4 règles** (`documents_select`, `documents_insert`, `documents_delete`, `support_read`). Une règle de mise à jour posée à la main se combinerait avec la nôtre. Et la requête « fonction d'origine » de l'en-tête (`guard_document_write`) doit rendre **true**.
2. Coller et exécuter le fichier, jamais `db push`.
3. **Après** : exécuter la requête du bloc « VÉRIFICATION » de l'en-tête du fichier : **14 × true**.
4. Inscrire l'historique (ligne `INSERT` du bloc « HISTORIQUE »).
5. Voir la trace : `SELECT * FROM public.document_category_log ORDER BY id DESC LIMIT 10;`
6. Retour arrière : bloc « RETOUR ARRIÈRE » de l'en-tête (en commentaire). Les salariés revoient alors les factures, le bouton disparaît ; la table de trace est conservée.

**Tant que la migration n'est pas appliquée**, l'application est exactement celle d'avant : pas de bouton de catégorie, aucun message, aucune erreur (l'écran interroge une petite fonction `document_category_ready()` et se tait si elle n'existe pas).

## 4. Comment tester sur téléphone

Pré-requis : migration appliquée, données **fictives**, pas l'entreprise de démonstration.

1. **Bureau** : chantier → Documents. Chaque ligne a un bouton « Sans catégorie ▾ » (ou sa catégorie). Toucher, choisir « Facture », lire « Les salariés ne verront plus ce document. », Enregistrer. Le bandeau « Catégorie changée : Facture. » apparaît en bas : toucher « Annuler » (dans les 20 secondes), la catégorie revient.
2. **Salarié** (autre téléphone, compte de test) : le document passé en facture a **disparu** de sa liste et de son compteur. Un ancien lien enregistré (hors lien signé encore valable) n'ouvre rien.
3. **Salarié** : envoyer une photo, elle porte « Sans catégorie ▾ ». Choisir « Plan » : OK. On ne lui propose ni Facture, ni Facture payée, ni Réserve. Sur le document d'un collègue, pas de bouton.
4. **Salarié** : demander à l'assistant de ranger un fichier « facture … » et valider : rien n'est rangé, avec la phrase « Les factures sont réservées au bureau : donnez ce fichier au bureau. Il n'a pas été rangé. ».
4 bis. **Salarié** : envoyer une photo depuis une intervention en brouillon, puis supprimer ce brouillon : la suppression marche, la photo reste dans les documents du chantier.
5. Mode avion, puis Enregistrer : « Pas de connexion : rien n'a été changé. Réessayez. » Rétablir le réseau : « Réessayer ».
6. **Bureau** : repasser la facture en « Devis » : le salarié la revoit après réouverture du panneau.
7. **Assistant bureau** : « mets la catégorie devis sur le document X » : « Document modifié. » (avant la migration : « Modification refusée »).
8. À 390 px : aucun défilement horizontal, boutons faciles à toucher au pouce. Sur un petit téléphone (320 × 568, ou téléphone couché), « Annuler » / « Enregistrer » restent visibles en bas de la fenêtre pendant qu'on fait défiler les choix.
9. Si le bureau passe en facture un document que le salarié a ouvert dans son panneau puis qu'il touche son bouton de catégorie : « Ce document n'est plus disponible ou a été modifié par le bureau. », la fenêtre se ferme et la liste se recharge (plus de « Réessayez » inutile).

## 5. Tests

| Commande | Ce qu'elle prouve |
|---|---|
| `npm run test:documents-db` | la base (PGlite) : lecture des lignes et des fichiers, dépôt, changement, trace, formations, abus (salarié, collègue, archivé, autre entreprise, anonyme, support), suppression d'une intervention qui porte des documents (salarié, bureau, facture), intervention déplacée de chantier ou de jour, cohabitation avec le lot 29, retour arrière |
| `npm run test:documents` | les règles pures de l'écran (catégories, qui peut quoi, avertissements, messages d'erreur, refus d'une facture par l'assistant salarié) et leur accord avec la migration |
| `npm run build` puis `npm run test:documents-ecrans` | l'écran sur une base simulée : 390 px et 1024 px (bureau, salarié sans factures, erreurs, document disparu, réponse perdue puis « Annuler », migration absente ou muette), clavier (flèches), petits téléphones (360 × 640, 320 × 568, 667 × 375), bandeau (durée, pause), absence de clignotement et de décalage, aucune suppression ajoutée |

Captures à 390 px : `docs/captures-documents-categories/` (`01-liste-bureau`, `02-choix-bureau`, `03-erreur-refus`, `04-bandeau-annuler`, `05-liste-salarie`, `06-choix-salarie`, `07-migration-absente`, `08-petit-360x640`, `09-petit-320x568`, `10-paysage-667x375`).

## 6. Limites connues

- Pas de choix de catégorie **à l'envoi** : « Photo » et « Fichier » restent comme avant (sans catégorie), on classe ensuite en un geste. À proposer si besoin.
- Le message « Annuler » est un **bandeau dans le panneau**, pas un message flottant : le panneau Documents est une fenêtre qui rend inerte ce qui est derrière elle, un message flottant y serait intouchable.
- Changer la catégorie d'une photo de levée de réserve (hors « Réserve ») la sort du rapport de réserves : le bureau en est averti, l'auteur salarié ne peut pas le faire.
- La carte de confirmation de l'assistant salarié affiche encore « Catégorie : Facture » avant validation ; l'exécution refuse ensuite de ranger le fichier et le dit (la carte vient de l'IA, non modifiée ici).
- Si l'intervention rattachée a changé de jour ou de chantier depuis l'envoi, le document **garde** son jour et son chantier : seule la catégorie change (avant ce lot, la base refusait tout changement dans le cas du chantier déplacé, et recalait le jour dans l'autre).
- Le bandeau « Annuler » est en bas de la liste dans l'ordre du clavier : après Enregistrer, le focus revient sur le bouton de la ligne, et il faut tabuler jusqu'au bandeau (20 s, arrêtées dès qu'il a le focus).
- Un fichier donné à l'assistant salarié comme « facture » n'est **pas rangé** : le salarié doit le remettre au bureau. Le bureau n'en est pas prévenu.
- La suppression de la **ligne** d'une facture par son auteur salarié, déposée avant la migration, par une requête sans aucun filtre : possible (jamais celle du bureau ni d'un collègue, jamais le fichier). L'application n'envoie jamais une telle requête.
- Un chemin de fichier complet et connu permet de savoir si c'est une facture (la fonction qui décide répond oui/non) ; les chemins contiennent des identifiants non devinables.
- Le trou ancien du stockage (tout membre d'une entreprise peut effacer n'importe quel fichier non-facture de son dossier) n'est pas fermé ici.
- Les boutons existants « télécharger » et « corbeille » restent à 34 px (non touchés pour ne pas gêner d'autres lots) ; les éléments neufs font 44 px au moins (options : 48 px).
- Les fichiers orphelins du stockage (sans ligne) restent lisibles par les membres de l'entreprise.
