# Répéter une migration dans une transaction annulée

Avant d'appliquer une migration sur la base de production, on la rejoue en
entier dans une transaction que l'on n'achève jamais. On y crée les fixtures, on
y applique le DDL, on y joue les scénarios — y compris ceux qui doivent échouer
— on lit le compte-rendu, et on laisse la transaction tomber.

Ce document ne décrit pas la mécanique. Il décrit les façons dont ces
répétitions ont MENTI, parce que chacune a coûté, et qu'aucune n'était visible
sur le moment : un harnais faux produit un rapport vert, ou un rapport rouge qui
accuse le mauvais coupable. Les sections 1 à 4 traitent de ces mensonges.

La section 5 traite du cas inverse, et c'est le plus dangereux : l'opération
qui ne peut PAS se répéter. Une suppression n'a pas de transaction annulée où
se tromper — d'où une obligation que les quatre autres sections n'ont pas.

---

## 1 · La frontière de transaction fait partie du scénario

**Le défaut, deux fois de suite à l'étape 26.** Un scénario vérifiait qu'un
pointage refusé par le serveur RESTE OUVERT — c'est-à-dire que le refus n'a rien
détruit. Le harnais ouvrait le chrono et le fermait dans le même bloc
`BEGIN … EXCEPTION`. L'échec a donc annulé la sous-transaction entière, y
compris l'ouverture, et le rapport a annoncé « chrono ouvert = 0 ».

Conclusion affichée : le pointage du salarié avait disparu. Conclusion réelle :
le test était faux. En production, démarrer et fermer sont **deux requêtes
distinctes** du navigateur, donc deux transactions ; un échec à la fermeture ne
peut pas défaire l'ouverture.

**La règle.** Dès qu'un scénario porte sur *ce qui survit à un échec*, la
frontière de transaction est le sujet même du test. Il faut la reproduire :
poser l'état AVANT le bloc d'exception, et n'y mettre que l'appel qui doit
échouer.

```sql
-- FAUX : l'échec annule aussi l'ouverture
BEGIN
  INSERT INTO active_sessions …;
  PERFORM stop_active_session(…);   -- lève
EXCEPTION WHEN others THEN … END;

-- JUSTE : deux transactions, comme le navigateur
INSERT INTO active_sessions …;      -- hors du bloc
BEGIN
  PERFORM stop_active_session(…);   -- lève
EXCEPTION WHEN others THEN … END;
```

**La racine, et elle est plus large.** C'est la même qu'au défaut de l'étape
20 : on testait la fonction, pas le chemin qui l'appelle. Une fonction juste,
appelée autrement qu'en vrai, ne prouve rien sur l'application.

### Le RÔLE fait partie du scénario, au même titre

Même racine, autre axe, et il a coûté deux fois le même jour.

Une répétition qui tourne en `postgres` ne prouve rien sur ce que fera un
salarié. `postgres` conserve tous les droits : il traverse la RLS, il exécute
les fonctions qu'on vient de révoquer, il ignore les policies qu'on est
précisément en train de vérifier. Deux preuves peuvent afficher les bonnes
valeurs et ne rien démontrer.

Toute assertion qui porte sur un droit, une policy ou une visibilité se joue
sous le rôle de l'application :

```sql
PERFORM set_config('request.jwt.claims',
                   json_build_object('sub', '<uuid réel>', 'role', 'authenticated')::text,
                   true);
EXECUTE 'set local role authenticated';   -- ou 'anon' pour un visiteur
```

et on revient en `postgres` (`RESET ROLE`) uniquement pour poser les fixtures et
écrire le rapport.

---

## 2 · On relit la fonction EN BASE, jamais le fichier qui l'a créée

**Le défaut, à l'étape 26.** `stop_active_session` a été réécrite à partir de
`20260920240500_etape16b_chrono_fiable.sql`, le fichier qui l'avait créée. Ce
fichier précède l'étape 21, qui avait ajouté `USING ERRCODE = 'BT001'` au refus
« même quart d'heure ». Le `CREATE OR REPLACE` aurait donc supprimé ce code en
silence, et remis l'écran à reconnaître un refus à sa phrase française.

Rien n'aurait cassé le jour même. C'est ce qui rend ce défaut dangereux.

**La règle.** Avant de remplacer une fonction existante :

```sql
SELECT pg_get_functiondef(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = '<nom>';
```

Le corps livré part de CE texte, jamais d'un fichier de migration. Un fichier
dit la vérité de son époque ; `CREATE OR REPLACE` réécrit tout, y compris ce
qu'il ignore.

**Le corollaire pour les signatures.** `CREATE OR REPLACE` ne remplace qu'à
signature identique. Ajouter un paramètre crée une SURCHARGE, et l'appel
existant du navigateur devient ambigu — PostgreSQL refuse, et le geste casse
pour tout le monde. On `DROP FUNCTION` d'abord, dans la même transaction.

---

## 3 · La production se recontrôle APRÈS, pas seulement avant

Une transaction non achevée est annulée par le serveur — mais c'est une
croyance sur l'outil, pas une observation. On la vérifie, à chaque fois, par une
requête qui compte ce qui devait ne pas bouger :

```sql
SELECT (SELECT count(*) FROM public.time_entries)              AS pointages,
       (SELECT count(*) FROM pg_class
         WHERE relname = '<table de test>'
           AND relnamespace = 'public'::regnamespace)          AS table_fantome,
       (SELECT pg_get_function_identity_arguments(p.oid) …)    AS signature_intacte;
```

Ce contrôle a déjà servi : lors d'un appel où le `rollback` final manquait, il a
prouvé en une requête que rien n'avait été écrit, au lieu de laisser la question
ouverte.

---

## 4 · On contrôle ce qui est NEUF, pas seulement ce qu'on sait fragile

**Le défaut, à l'étape 27.** La migration créait une fonction `SECURITY DEFINER`
et en remplaçait une autre. La relecture avant application a été sérieuse : elle
a même vérifié les droits de la fonction *remplacée*, parce qu'un
`DROP FUNCTION` les remet à zéro et que c'était le piège connu.

Elle n'a pas vérifié les droits de la fonction *créée*. Or les default
privileges du schéma `public` accordent `anon`, `authenticated` et
`service_role` à toute fonction nouvelle, et PostgreSQL y ajoute PUBLIC. Le
prédicat est donc parti en production appelable **sans compte**, avec des UUID
arbitraires, contournant la policy que la même migration venait d'écrire.

L'attention était là. Elle était pointée sur ce qu'on savait dangereux, et le
danger était ailleurs — sur l'objet neuf, celui qui n'avait pas encore
d'histoire et donc pas encore de soupçon.

**La règle.** La liste de contrôle d'une migration se construit sur ce qu'elle
FAIT, pas sur ce qu'on redoute. Pour toute fonction qu'elle **crée** autant que
pour celles qu'elle remplace :

```sql
SELECT p.proname,
       p.prosecdef                                               AS security_definer,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_peut,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS connecte_peut,
       array_to_string(p.proacl::text[], ' | ')                  AS droits
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN (…);
```

Toute fonction `SECURITY DEFINER` du schéma `public` est révoquée
explicitement, puis re-accordée à qui en a besoin. Sans exception pour les
petites : **c'est la taille de ce qu'une fonction lit qui compte, pas la
sienne.**

**Et on pose la question à PostgreSQL, pas à une chaîne de caractères.**
`has_function_privilege(rôle, oid, 'EXECUTE')` répond à la question elle-même.
Chercher `=X/` dans `proacl` a produit un « KO » sur un état correct, parce que
`postgres=X/postgres` contient cette sous-chaîne — l'entrée de PUBLIC est celle
dont le bénéficiaire est vide, donc qui **commence** par `=`.

### Deux pièges du balayage lui-même, payés tous les deux

**Ne pas exclure la classe qu'on vient de toucher.** La requête qui a conclu
« `correct_time_entry` est la seule encore ouverte » portait
`and p.prorettype <> 'trigger'::regtype` — donc elle écartait exactement les
fonctions de trigger, celles qu'on venait d'aligner à la main une heure plus
tôt. Deux fonctions ouvertes ont survécu à un balayage qui se croyait complet,
et une règle annoncée « sans exception » est partie avec deux contre-exemples
vivants. Un balayage de droits n'a pas de `WHERE` sur le type de retour.

**Le balayage compte son propre instrument.** La même requête, rejouée dans une
répétition, a annoncé « 2 fonctions encore ouvertes » après avoir tout révoqué.
Les deux étaient `_as` et `_rec` — les fonctions d'aide créées par le test
lui-même, dans le schéma `public`, donc dotées des mêmes default privileges que
le code qu'elles mesurent. Avant de croire un balayage qui trouve quelque
chose : **lire les noms**.

### `EXECUTE` sur une fonction de trigger : vérifié au `CREATE TRIGGER`

Révoquer `EXECUTE` sur une fonction de trigger n'empêche aucun trigger de
partir : PostgreSQL vérifie ce droit à la création du trigger, pas à chaque
déclenchement. Mesuré sous `authenticated`, deux fois et indépendamment.

**La dépendance que ça crée, et elle est pour plus tard :** une migration qui
RECRÉE un de ces triggers doit tourner avec un rôle qui a gardé `EXECUTE` —
`postgres`. Toutes les migrations de ce dépôt y tournent déjà, donc il n'y a
rien à faire aujourd'hui. C'est écrit ici parce que c'est le genre de
dépendance invisible qu'on redécouvre trois ans plus tard, un soir, en se
demandant pourquoi un `CREATE TRIGGER` échoue.

---

## 5 · Une suppression ne se répète pas : on exporte AVANT

Tout ce document repose sur un privilège : on peut se tromper dans une
transaction annulée, et il n'en reste rien. **Une purge n'a pas ce filet.**
`DELETE … COMMIT`, et la donnée n'existe plus — ni dans une transaction
ouverte, ni dans une sauvegarde qu'on aurait pensé à prendre.

**Le défaut, le 23/09.** Purge de la base demandée, et légitimement : Ergun
préparait des démos et voulait repartir propre. Elle a été exécutée telle
quelle, contrôlée avant et après, garde par garde. Le rapport était exact.

Ce qui manquait n'était pas dans le rapport, c'était avant : ces 46 pointages
étaient les **seules vraies données de test du produit**. Celles du 17/09 sur
cinq chantiers avaient servi à prouver le double comptage du bandeau, à
vérifier le multi-chantier, à mesurer les corrections. Rien n'en a été exporté.
Elles sont irrécupérables.

**La règle.** Une demande de suppression n'est pas une demande de destruction
sans trace. Avant tout `DELETE` non annulable, on propose un export — même
court, même un CSV collé dans la réponse. On ne demande pas l'autorisation
d'exporter : on exporte, on montre, puis on supprime.

Le calcul n'est pas discutable : proposer coûte trente secondes, effacer est
définitif. Et c'est précisément quand la demande est claire et qu'on a raison
d'obéir qu'on oublie de le faire — il n'y a aucun doute à lever, donc aucune
alarme ne se déclenche.

Le symétrique vaut aussi : ne jamais annoncer comme réglé ce qu'on n'a pas pu
vérifier soi-même. Un abonnement Stripe signalé sur un compte qu'on n'atteint
pas reste **ouvert** dans le rapport, nommément, jusqu'à ce que son
propriétaire dise le contraire.

---

## Ce que le rapport doit contenir

Un scénario qui passe doit afficher **la valeur observée**, pas seulement
`true`. `ok = true` ne se relit pas ; `« il en voit 3 (attendu 3) »` se relit, et
c'est ce qui permet à quelqu'un d'autre de contredire le test.

Et tout scénario qui doit ÉCHOUER affiche le message d'erreur obtenu. Un refus
attendu qui se produit pour la mauvaise raison est un test vert sur un code
faux.
