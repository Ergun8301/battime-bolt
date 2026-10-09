# Lot 7 — IA v2 : un vrai assistant

Toujours derrière **`companies.ai_enabled`** (rien ne change pour les autres).

## 1. 🎤 Vocal

- Un appui = écoute **continue** (fr-FR), ne s'arrête jamais seule sur une pause.
- Texte en direct dans le champ, **Stop** puis correction, ou **Envoyer** pendant l'écoute.
- Même composant patron / salarié (`lib/dictation.ts`).
- Testé : Chrome Android + Safari iOS simulés (`scripts/tests/dictee.mjs`, 48/48).

## 2. ✅ Exécution directe

| Mode | Actions |
|---|---|
| **Fait tout de suite** + « Annuler » (vraie annulation) + « Modifier » | ajouter / déplacer une intervention, créer un client (sans budget), poser un congé, ranger un document, répondre à un congé, lever une réserve, ajouter une dépense, habilitation, fiche client / salarié · côté salarié : heures, pointer, congé, réserve, photo, panier, copier la veille, modifier ses horaires |
| **Carte à confirmer** | planning de la semaine, invitation d'un salarié (email), correction de pointages passés, coût / paie, clôture du mois, rôle, archivage, rappel |
| **Il manque une info** | UNE question courte + choix en un clic (pas de formulaire) |

Chaque action est notée dans `assistant_journal` (qui, quoi, quand, annulée ou non).

## 3. Qualité

- Titres propres : « Client · objet court », majuscule, sans « euh », sans la phrase dictée.
- Dates relatives (« jeudi prochain », « du lundi au mercredi », « le 12 ») et heures (« 3h de l'après-midi ») : `supabase/functions/_shared/fr-langue.ts`.
- Un **lieu seul** (« à Lyon ») n'est jamais pris pour le client situé dans cette ville : intervention « Autre », titre « Intervention à Lyon ».
- Modèle : **actions → `AI_ACTION_MODEL`** (défaut `gemini-3.5-flash`), questions → `AI_MODEL` (Flash-Lite). Repli automatique sur le léger si le fort refuse.
- ⚠️ La clé Gemini actuelle est en **niveau gratuit** : `gemini-3.5-flash` = **20 requêtes / jour** (constaté le 29/09). Au-delà, repli sur le léger (sans erreur visible). Pour profiter du modèle fort : activer la facturation sur la clé (Google AI Studio → Billing). Le niveau payant évite aussi que Google utilise les échanges pour améliorer ses produits.

## 4. Couverture

Toutes les actions d'écran (bureau + salarié) passent par le même code que l'écran
(`lib/planning-writes.ts`, `lib/admin-writes.ts`, `lib/worker-day.ts`, `lib/worker-entry.ts`, `lib/chantier-docs.ts`).

| Non branché | Pourquoi |
|---|---|
| Suppressions (bulle, client, salarié, dépense, habilitation, bulletin, invitation, pointage…) | Règle : jamais de suppression par l'assistant |
| Abonnement Stripe | Paiement : écran dédié |
| Export + verrouillage / envoi au comptable | Fichier généré à l'écran, verrouille les heures → guide + « M'y emmener » |
| Imports CSV | Correspondance des colonnes à l'écran → lien |
| Suivi de position | CNIL : le patron décide à l'écran |
| Accès support, borne | Sécurité (code affiché à l'écran) |
| Réordonner les bulles, photo de profil, notifications | Geste d'écran / appareil |
| Corrections d'équipe du chef d'équipe | Heures des collègues : écran dédié |

## A–D

| | |
|---|---|
| A · Planning des collègues (salarié) | Prénom + chantier/ville + horaires, « absent » sans motif. RPC `colleagues_planning` (≤ 14 jours). Réglage « Les salariés voient le planning de leurs collègues » (activé par défaut). |
| B · Intervention en une phrase | « Rajoute-moi une intervention à Lyon aujourd'hui de 14h à 18h » → faite, titre, lieu, horaires. |
| C · Documents | Catégorie : facture payée / facture / devis / réserve / photo / plan / PV de réception / autre, dite ou devinée. Colonne `documents.category`. |
| D · Aide | 45 fiches bureau + 25 salarié, synchronisées au code (test `assistant-aide.test.ts`), « M'y emmener » ; questions générales (métier, calcul, message client) courtes. |

## F · Évaluation sur le vrai modèle

`supabase/functions/assistant-eval` : 56 phrases réelles (fautes, oral), aucune
donnée d'entreprise, appelable seulement avec le secret de la base.

Mesure du 29/09, **même modèle avant / après** (`gemini-3.5-flash-lite`, quota séparé de la prod) :

| | Avant (v1) | Lot 7 (v2) |
|---|---|---|
| Bureau · Interventions | 2/7 | 7/7 |
| Bureau · Congés | 2/4 | 4/4 |
| Bureau · Clients | 1/5 | 5/5 |
| Bureau · Documents | 1/3 | 3/3 |
| Bureau · Salariés | 1/6 | 6/6 |
| Bureau · Réglages | 0/3 | 3/3 |
| Bureau · Aide | 4/4 | 4/4 |
| Salarié · Heures | 1/4 | 4/4 |
| Salarié · Pointage | 2/3 | 3/3 |
| Salarié · Congés | 1/2 | 2/2 |
| Salarié · Ma journée | 0/7 | 7/7 |
| Salarié · Réserves | 0/1 | 1/1 |
| Salarié · Documents | 1/2 | 2/2 |
| Salarié · Collègues | 0/3 | 3/3 |
| Salarié · Aide | 2/2 | 2/2 |
| **Total** | **18/56 (32 %)** | **56/56 (100 %)** |

1ᵉʳ passage v2 : 52/56 (93 %). Les 4 échecs, corrigés dans le code (pas au cas par cas) :
« à Lyon » pris pour le client situé à Lyon, « jeudi prochain » dit un jeudi,
« Pizzeria Exemple Mâcon » (même client, 2 villes) côté bureau et « la pizzeria de Bourg » côté salarié.

Retours préview (Cowork) : 2 cas ajoutés (« Comment je corrige le pointage d’un salarié ? »,
« comment je change ma photo ») → **58/58** au nouveau passage.

Relancer : `POST /functions/v1/assistant-eval` avec l'en-tête `x-cron-secret`,
body `{ "version": "v2", "ids": [...], "parallel": 1, "gapMs": 4000, "lightModel": "…", "actionModel": "…" }`.

## Prod (un seul déploiement, avec le feu vert d'Ergun)

1. Migrations `20261001090000_lot7_assistant_journal.sql`, `20261001100000_lot7_collegues_documents.sql`.
2. Redéployer `assistant` et `worker-assistant`.
3. (Optionnel) secret `AI_ACTION_MODEL`.
