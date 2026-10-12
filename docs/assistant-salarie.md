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

## Lot 7 — « Me guider pas à pas »

Chaque réponse « guide » (ex. « comment je demande un congé ? ») garde sa fiche écrite et son bouton vers l'écran, puis ajoute **« Me guider pas à pas »** quand la fiche a un guidage : un anneau entoure le vrai bouton, une phrase par étape (voir `docs/guides-pas-a-pas.md`).

- Une fiche d'aide (`WORKER_GUIDE`) a un `id` stable ; sa fiche de guidage (`supabase/functions/_shared/worker-tours.ts`) porte le même `id`. 23 fiches : tout ce qui se fait sur un écran, chef d'équipe compris. Les fiches « collègues » et « assistant » (`ask:`) n'en ont pas.
- Voie locale et voie modèle fabriquent leurs boutons avec le **même** helper (`workerGuideLinks`) : raccourci, puis guide. Le modèle ne peut pas ajouter le guide d'une autre fiche. Aucun nouveau champ dans les réponses.
- Le guide ne fait rien à la place du salarié : pas d'écriture, pas de réseau, pas de toucher automatique.
- Mise en ligne : **le front d'abord, puis `worker-assistant`**. Aucune migration.
- Tests : `npm run test:guides` (Deno) et `node scripts/tests/guides-lot7.mjs out <dossier>` (navigateur).
- Retour : une étape de la fiche écrite « Historique » disait « Touchez un jour » alors que cet écran n'a pas de jour à toucher ; elle dit maintenant « Faites défiler : un bloc par jour ».
