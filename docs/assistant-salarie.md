# Assistant BEMEXO côté salarié — lot 4

Le même bouton que le bureau, dans l'app salarié. On dicte ou on écrit ses heures ; l'assistant prépare le pointage ; le salarié vérifie puis « Enregistrer ».

| Point | Comment |
|---|---|
| Lecture des phrases | Lecteur local d'abord (« 7h30-12h Villa Dupont, 13h-16h30 Bureau Martin », « de 8h à midi », « hier… pause 30 min », « 8h/12h », service resto après minuit) ; IA seulement en secours |
| Chantier | Résolu dans la liste des chantiers du salarié. Inconnu ou ambigu → à choisir, jamais inventé |
| Chantier non dit | Pré-sélectionné depuis SON planning pour ce créneau (📅 « D’après votre planning — modifiable »). Rien au planning → « Choisir le chantier… » |
| Contrôles | Horaires illisibles, début = fin, > 14 h, pause trop longue, chevauchements, date hors période → refusé |
| Enregistrement | Uniquement après « Enregistrer », via `lib/worker-entry.ts` = le chemin de la saisie manuelle (sorti tel quel de `poseur-day.tsx`) : statut `draft`, anti-doublon, hors ligne, même RLS |
| Questions | Ses heures (semaine, hier, aujourd'hui) et son planning. Coût et collègues refusés |
| Quota | 20 demandes / jour / salarié (`WORKER_ASSISTANT_DAILY_LIMIT`) |
| Stockage | Un compteur (salarié, jour, nombre). Aucun contenu, aucun log |

Pause : champ modifiable dans le brouillon, enregistré dans `break_minutes` (colonne existante ; la saisie manuelle met 0).

## Préview

`/apercu/assistant-salarie?demo=salarie` — préviews uniquement ; le vrai lecteur de phrases, sur des chantiers fictifs.

## Mise en service (après feu vert d'Ergun)

1. Migration `supabase/migrations/20260929170000_lot4_assistant_salarie.sql`
2. `supabase functions deploy worker-assistant`
3. Secret facultatif `WORKER_ASSISTANT_DAILY_LIMIT`

## Tests

`npm run test:assistant-salarie` (phrases, ambiguïtés, incohérences, étanchéité, IA simulée) · `npm run test:assistant-salarie-rls`
