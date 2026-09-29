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

## Côté salarié (même moteur, actions du salarié)

| Demande | Carte | Exécuté par (code de l'écran salarié) |
|---|---|---|
| « 7h30-12h Villa Dupont… » | Brouillon d'heures (lot 4) | `insertWorkerEntry` |
| « Je commence (sur Villa Dupont) » | Début de pointage (chantier du planning si rien n'est dit) | `startLiveSession` (= « Je commence ») |
| « J'ai fini » | Fin de pointage (heure de fin facultative) | `stopLiveSession` → `stop_active_session` |
| « Demander un congé » / « congé du 12 au 16 » | Demande de congé | `requestLeave` → RPC `request_leave` |
| « Signaler une réserve sur Villa Dupont : fissure » | Réserve, **détail facultatif** | `markEntryReserve` (SA ligne du jour) |
| « Comment je signale une réserve ? » | 3 étapes + **M'y emmener** | Ma journée / Ma semaine / Mon mois / Historique / Mes congés |

Jamais les données d'un collègue ni les coûts. `lib/live-session.ts` et
`lib/leave.ts` = code de `live-timer.tsx` et de « Mes congés », sortis tels quels.

## 📎 Pièces jointes (photo JPG/PNG/HEIC, PDF — 8 Mo, photos compressées sur le téléphone)

| Rôle | Fichier + phrase | Carte | Exécuté par |
|---|---|---|---|
| Salarié | photo + « mets-la sur Dupont à Viriat, il y a une réserve » | Chantier, ☑ Avec réserve, détail pré-rempli **facultatif** | `uploadWorksiteDocument` (= bouton Documents) + `markEntryReserve` |
| Patron | bulletin + « enregistre ce nouveau salarié » | Invitation pré-remplie + entrée, contrat, taux, heures + coût réel (lot 2) | `inviteWorker` + `savePayrollBasics` (sans n° de sécu) + `supabaseCostSource.save` |
| Patron | devis + « c'est validé, nouveau client » | Client + adresse + montant et heures prévus | `createWorksite` + `setWorksiteBudget` + devis rangé dans ses documents |
| Patron | photo/PDF + « range ça sur Dupont » | Chantier à choisir si plusieurs « Dupont » | `uploadWorksiteDocument` |

- Le fichier reste dans l'écran jusqu'à « Confirmer » ; rien n'est rangé avant.
- Le bulletin n'est **jamais conservé** ; le n° de sécurité sociale n'est **ni demandé au modèle, ni gardé** (effacé s'il apparaît).
- Types refusés → message clair. Aucun contenu de fichier dans les logs.

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
3. Déployer `worker-assistant` (avec le lot 4)

## Contrôles

- `npm run test:assistant-actions` — 10 séries, IA simulée (bureau)
- `npm run test:assistant-salarie` — 9 séries (lot 4 + actions salarié)
- `npm run test:assistant-actions-rls` — 17 vérifications
- Captures : `docs/captures-assistant-actions/`
