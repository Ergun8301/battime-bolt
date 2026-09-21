# Répéter une migration dans une transaction annulée

Avant d'appliquer une migration sur la base de production, on la rejoue en
entier dans une transaction que l'on n'achève jamais. On y crée les fixtures, on
y applique le DDL, on y joue les scénarios — y compris ceux qui doivent échouer
— on lit le compte-rendu, et on laisse la transaction tomber.

Ce document ne décrit pas la mécanique. Il décrit les trois façons dont ces
répétitions ont MENTI, parce que chacune a coûté, et qu'aucune n'était visible
sur le moment : un harnais faux produit un rapport vert, ou un rapport rouge qui
accuse le mauvais coupable.

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

## Ce que le rapport doit contenir

Un scénario qui passe doit afficher **la valeur observée**, pas seulement
`true`. `ok = true` ne se relit pas ; `« il en voit 3 (attendu 3) »` se relit, et
c'est ce qui permet à quelqu'un d'autre de contredire le test.

Et tout scénario qui doit ÉCHOUER affiche le message d'erreur obtenu. Un refus
attendu qui se produit pour la mauvaise raison est un test vert sur un code
faux.
