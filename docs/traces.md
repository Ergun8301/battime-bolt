# Interventions supprimées ou décalées (lot 3, oct. 2026)

Quand une intervention du planning, des heures, un pointage en cours, une tâche ou une réunion est **supprimé ou décalé**, la base écrit une **trace** : quoi, qui, quand, d'où (écran, assistant…), avec **l'avant et l'après complets**. Personne ne peut écrire, modifier ni effacer une trace — pas même le service. Rien n'est restauré d'ici : c'est une liste en **lecture seule** (la restauration viendra avec les versions du planning, lot 8).

- **Salarié** : dans « Historique », un lien discret « Interventions supprimées ». Il voit les **60 derniers jours** de **son** planning, de ses heures, de ses tâches et réunions : « Intervention décalée — par le bureau — Avant ven. 16/10 · 08:00–12:00 · Villa Exemple / Après lun. 19/10 · 09:00–13:00 · Résidence Test ». Qui : « vous », « le bureau », « le chef d'équipe », « l'assistant du bureau », « automatiquement, la nuit ».
- **Bureau** : Réglages → « Interventions supprimées ou décalées » → Voir (et le menu ☰ du téléphone). Toute l'entreprise, filtrable par salarié et par **semaine / mois**, avec le nom de l'auteur et l'origine (Écran, Assistant, Automatique…). Une réunion n'y figure qu'une fois, avec ses participants.

## Ce qui est tracé (et ce qui ne l'est pas)

| | Tracé | Pas tracé (bruit) |
|---|---|---|
| Planning | case supprimée, décalée (jour, heures, salarié), modifiée (chantier, absence), remise par « Annuler » | création ; ordre dans la case ; consigne ; case posée puis retirée dans les 5 minutes par la même personne |
| Heures | ligne supprimée, retirée (« Retirée », avec avant/après), heures changées par **quelqu'un d'autre** ou **après l'envoi**, remise | le salarié qui tape ses propres brouillons ; un brouillon vide jamais envoyé ; envoi, validation, verrou, export |
| Pointage en cours | chrono supprimé **sans** devenir des heures (par ex. par un admin), remis | chrono fermé normalement (« J'ai fini », borne, nuit) ; moins d'une minute |
| Tâches | tâche supprimée | « Fait » |
| Réunions | supprimée, décalée (date, heures), modifiée (titre, lieu, « Toute l'équipe ») | seule la liste des participants change |

Jamais de coordonnées GPS dans une trace. Un participant ne voit pas la liste des autres participants (règle du lot 4).

**D'où** : par défaut « écran » ; pendant une action de l'assistant, l'appli envoie l'en-tête `x-bemexo-origine: assistant` (lib/supabase.ts, `withOrigin`) ; sans utilisateur connecté (cron, service), « automatique ». Une fonction serveur peut dire « restauration » (lot 8).

**Jamais bloquant** : si une trace ne peut pas être écrite, l'action passe quand même (avertissement dans les journaux de la base).

## Migration

`supabase/migrations/20261011120000_lot3_traces_suppressions.sql` — **pas encore appliquée**. 100 % additive : table `traces`, 5 fonctions, 11 déclencheurs (une écriture par instruction : effacer 100 cases = un seul ajout de 100 traces). Aucune instruction `DROP` ni `DELETE` hors du retour arrière. L'en-tête contient le **RETOUR ARRIÈRE** (les traces cessent d'être écrites, la table est gardée), la **VÉRIFICATION APRÈS APPLICATION** (9 × `true`) et la ligne d'**HISTORIQUE**.

Tant qu'elle n'est pas appliquée, l'application est exactement celle d'avant : les deux entrées restent cachées.

**Durées de conservation** (décision D6) : heures 5 ans, planning et tâches 1 an. La purge n'est **pas** dans ce lot (elle demande un `DELETE`) : rien n'est effacé pour l'instant.

## Tester

- `npm run test:traces` — mise en forme (jours, heures, qui, avant → après), Deno.
- `npm run test:traces-db` — la migration sur un Postgres jetable (PGlite), avec les vraies fonctions des lots 2, 4, 9, 11, 12 et 14 : chaque table, droits de lecture, personne n'écrit, erreur de trace non bloquante, performance, retour arrière.
- `npm run build` puis `npm run test:traces-ecrans` — les vrais écrans sur une base simulée, avec et sans la migration ; captures dans `docs/captures-traces/`.
