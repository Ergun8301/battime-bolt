# Tâches avec heure de début et de fin (lot 9, oct. 2026)

Une tâche du jour (lot 4) peut maintenant avoir une heure : « de 10:00 à 11:30 ». C'est facultatif : une tâche sans heure marche comme avant (matin, après-midi, soir ou sans moment).

- **Bureau** : fenêtre « + » du planning, onglet « Tâche » : « Heure de … à … » sous le moment. Une fois les deux heures saisies, le moment se déduit tout seul (même règle que la couleur des créneaux : 10:00–11:30 → Matin, 14:00–15:00 → Après-midi, 08:00–17:00 → sans moment), et les pastilles se grisent.
- **Alerte, jamais bloquante** : si la tâche sort du créneau prévu du salarié ce jour-là (heures estimées de ses interventions), « Cette tâche dépasse le créneau prévu (08:00–12:00). Ajouter quand même ? ». « Non » n'écrit rien et garde la saisie ; « Ajouter quand même » l'écrit. Deux créneaux qui se touchent comptent pour un seul. S'il n'y a aucun créneau avec des heures ce jour-là (pas de planning, ou un rendez-vous « à 14:00 » seul), il n'y a rien à comparer, donc pas d'alerte.
- **Ordre** : d'abord les tâches avec heure, par heure, puis celles sans heure, par moment. Cet ordre est le même partout : bureau, « Ma journée », « Ma semaine », feuille imprimée.
- **Salarié** : « Ma journée » affiche « 10:00–11:30 » devant le texte, teinté comme le moment. « Ma semaine » affiche « ☐ 10:00–11:30 · Texte » (à partir de cette migration ; avant, la semaine ne montre pas les tâches, comme au lot 4).
- **Impression** : « Avec les tâches » (semaine, jour, feuille de mission d'un salarié) : « ☐ 10:00–11:30 · Préparer la commande », puis « ☐ Ranger le dépôt · Soir ».
- **Pas de modification** : pour changer une heure, on retire la tâche et on la remet (même règle que le texte au lot 4, sans droit UPDATE). Retirer demande toujours une confirmation.
- **Jamais des heures travaillées** : les heures d'une tâche servent seulement à l'affichage. Totaux, export de paie, coûts, statistiques, relances et borne ne lisent pas day_tasks. Le harnais vérifie que le cockpit ne change pas.

## Migration

`supabase/migrations/20261011130000_lot9_taches_avec_heures.sql`, **pas encore appliquée**. 100 % additive : colonnes `start_time` et `end_time` (time, NULL par défaut) sur `day_tasks`, contrainte `day_tasks_times_check` (les deux heures ou aucune, et la fin après le début), droit d'insertion sur ces deux colonnes pour le bureau (la policy du lot 4 décide toujours qui peut insérer). Aucune policy, fonction ou trigger n'est modifié. `set_day_task_done` renvoie la ligne avec ses heures, sans changement. L'en-tête du fichier contient le **RETOUR ARRIÈRE**, la **VÉRIFICATION** (6 × true) et la ligne **HISTORIQUE**. Le mot DROP n'apparaît que dans le retour arrière. Il n'y a aucun DELETE.

Avant l'application, l'appli est exactement celle d'aujourd'hui. Postgres répond « colonne absente » (42703) : les tâches sont relues une fois sans les heures, les champs « de … à … » restent cachés, et l'insertion envoie les 5 colonnes du lot 4, jamais `start_time` / `end_time`.

## Tester

- `npm run test:missions` : règles pures (tri, libellé, moment déduit, dépassement du créneau, colonne absente), avec Deno.
- `npm run test:taches-heures-db` : la migration sur un Postgres jetable (PGlite). Elle est chargée deux fois, puis on vérifie l'en-tête, la contrainte, les droits (salarié, bureau, autre entreprise, anonyme), puis le retour arrière et le rechargement.
- `npm run build`, puis `npm run test:taches-heures-ecrans` : les vrais écrans sur une base simulée, dans trois états (lot 4 absent, lot 9 absent, lot 9 appliqué). Les captures vont dans `docs/captures-taches-heures/`.
