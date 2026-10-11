# Historique des migrations : contrôle par nom

Les numéros de version de la production ne correspondent jamais à ceux des
fichiers de `supabase/migrations` (fichiers collés dans l'éditeur SQL, ou
appliqués sous un autre horodatage). On compare donc **par nom**.

**Règle :** jamais de `supabase db push`.

## Vérifier avant une mise en ligne

1. En production, lire l'historique :

   ```sql
   SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
   ```

2. Enregistrer le résultat dans un fichier. Formats acceptés : JSON, CSV, Markdown, texte de psql, ou sortie de l'outil Supabase.
3. Lancer :

   ```
   npm run check:migrations -- historique.json
   ```

## Résultat

| Code de sortie | Signification |
|---|---|
| 0 | Tout est inscrit |
| 1 | Il reste un fichier **à appliquer**, ou une inscription sans fichier inconnue |
| 2 | Fichier illisible |

Les écarts anciens et connus (relevés au lot 0) sont listés dans `supabase/migrations-historique.json`. Ils ne déclenchent pas d'alerte.

## Après chaque migration collée dans l'éditeur SQL

Inscrire le fichier sous **son nom exact**. La ligne `INSERT` est donnée dans l'en-tête « HISTORIQUE » de chaque fichier.
