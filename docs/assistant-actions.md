# Lot 3 bis — L'Assistant BEMEXO qui agit et qui forme

Toujours derrière **`companies.ai_enabled`**. Il remplace « lecture seule » par
**préparer → confirmer → exécuter**.

## Côté bureau

| Demande | Ce que fait l'assistant | Exécuté par (même code que l'écran) |
|---|---|---|
| « Ajouter un salarié » / « Invite Marc Durand marc@… » | Carte d'invitation modifiable | `inviteWorker` → fonction `invite-worker` |
| « Crée le client Garnier à Caluire » | Carte client | `createWorksite` → `worksites` |
| « Poser un congé » / « Karim malade du 1er au 3 » | Carte d'absence | `setAbsence` (même règle que « Statut ») |
| « Mets Lucas sur Villa Dupont demain » | Carte d'affectation | `addPlanningSlot` → `planning` |
| « Fais le planning de la semaine prochaine » | **Brouillon** : chantier habituel de chacun, congés et jours déjà planifiés respectés, congés en attente signalés | `addPlanningSlot`, ligne par ligne, après « Appliquer » |
| « Corrige Karim hier 7h30-16h » | Carte de correction (choix de la ligne si plusieurs) | `corrigerHeures` → RPC `correct_time_entry` + le salarié est prévenu |
| « Comment je clôture le mois ? » | 3 étapes + **M'y emmener** | Ouvre l'écran (Exporter, Réglages, Salariés…) |
| « Qui n'a pas pointé hier ? » | Réponse chiffrée, comme avant | — |

`lib/planning-writes.ts` : les écritures de `admin-planning.tsx` sorties **telles
quelles** ; l'écran et l'assistant appellent les mêmes fonctions.

## Garde-fous

- Rien sans **Confirmer** (Annuler = rien n'est fait). Chaque carte est modifiable
  et recontrôlée à chaque changement.
- Liste blanche : l'IA ne peut appeler que 7 fonctions (`repondre` + 6 actions).
  **Aucune suppression.** Aucun nom inventé : inconnu ou ambigu → à choisir.
- Droits du patron connecté (RLS d'aujourd'hui) : il n'agit que sur son entreprise.
- Journal `assistant_actions` : qui, quoi, quand (lisible par le patron).
- Même quota (50 demandes / jour / entreprise). Rien sur la paie sensible.
- Plus de « Lecture seule » ni de « je n'ai pas accès ».

## Aperçu (préviews)

`/apercu/assistant?demo=assistant` — actions préparées par le vrai cœur, exécution simulée.

## ⏰ Après feu vert d'Ergun

1. Migration `supabase/migrations/20260930120000_lot3bis_assistant_actions.sql`
2. Redéployer la fonction `assistant` (déjà en prod en version lot 3)

## Contrôles

- `npm run test:assistant-actions` — 10 séries, IA simulée
- `npm run test:assistant-actions-rls` — 17 vérifications
- Captures : `docs/captures-assistant-actions/`
