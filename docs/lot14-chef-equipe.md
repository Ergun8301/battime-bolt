# Lot 14 — chef d'équipe : toute l'équipe, sur 7 jours

Aucun nouveau réglage. Les salariés ne changent rien.

| | Avant | Après |
|---|---|---|
| Qui | Les salariés présents sur **son** chantier | **Tous** les salariés et chefs actifs de l'entreprise (jamais le Bureau) |
| Quand | Le jour même | Les **7 derniers jours**, aujourd'hui compris |
| Doublon | Possible | Déjà une ligne ce jour-là sur ce chantier → **corrigée**, pas doublée (refus en base) |
| Trace | — | **« par le chef d'équipe »** sur la fiche salarié (bureau), posée par la base |
| Envoi | Le salarié | **« OK » envoie au bureau** (salariés qui n'ouvrent jamais l'appli). Le salarié peut encore corriger tant que ce n'est pas validé (« modifié après envoi ») |
| Interdit | — | Ligne validée ou verrouillée, mois clôturé, salarié clôturé (gardes existants) |
| Écran | « Mon équipe aujourd'hui » | « Mon équipe » : choix du **jour** (7 derniers) et du **salarié** |

## Base

Migration `20261006120000_lot14_chef_equipe_7_jours.sql` :
- **nouvelle version** de `is_my_team_member(uuid, date)` (même signature, même
  sécurité) : toutes les policies et `correct_time_entry` suivent sans être modifiées ;
- additif : colonnes `time_entries.lead_edited_by` / `lead_edited_at`, trigger
  `time_entries_lead_guard` (pas de doublon, trace), fonction `lead_send_entries`
  (le chef envoie : vérifié avec SES droits, passé en « envoyé » AU NOM du
  salarié, donc tous les gardes du salarié s'appliquent) ;
- retour arrière : l'ancienne version est recopiée à la fin du fichier.

## Tests

- PGlite `npm run test:chef-equipe` (54 vérifications, dont « le chef envoie → la journée entre dans l'export du mois »)
- Navigateur `scripts/tests/salarie-lot14.mjs` + non-régression
- Captures `docs/captures-lot14/`
