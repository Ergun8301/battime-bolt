# IA v2 : un vrai assistant (lot 7) et sa couche IA (lot 6, oct. 2026)

Toujours derrière **`companies.ai_enabled`** (rien ne change pour les autres).

## 0. Couche IA v2 (lot 6) : un seul réglage, une seule clé

> ⚠️ **Gemini gratuit = données fictives uniquement ; le payant est obligatoire avant tout vrai client (UE/Suisse).**
> Avec la clé gratuite, Google peut relire et réutiliser ce qui est envoyé. Tant que la formule est « essai »,
> un bandeau le rappelle dans l'assistant du bureau, l'assistant du salarié et l'écran de lecture d'un bulletin.

### Les deux secrets (Supabase → Edge Functions → Secrets)

| Secret | Rôle |
|---|---|
| `AI_CONFIG` | **Le seul réglage** (JSON) : la formule, le modèle de chaque niveau, les plafonds du jour. |
| `AI_API_KEY` | **La seule clé.** `GEMINI_API_KEY` reste lue en repli : rien ne casse tant que les nouveaux secrets ne sont pas posés. |

Exemple à copier-coller dans `AI_CONFIG` (c'est aussi la valeur par défaut) :

```json
{
  "formule": "essai",
  "rapide": "gemini:gemini-3.5-flash-lite",
  "documents": "gemini:gemini-3.8-flash",
  "secours": "gemini:gemini-3.1-flash-lite",
  "plafonds": { "rapide": 400, "documents": 15 }
}
```

- Tous les champs sont facultatifs. `formule` : `essai` (défaut) ou `payant`. Modèle : `fournisseur:modèle` (seul `gemini` est branché).
- `plafonds` : demandes par jour pour **tout le projet**, par niveau. Par défaut 400 / 15 en `essai` (sous le gratuit de Google, à ajuster d'après les limites
  affichées dans Google AI Studio), aucun en `payant`. Pour passer en payant, une fois la facturation activée sur la clé : `{"formule":"payant"}`.
- Raccourci : la seule valeur `payant` (ou `essai`), sans JSON, donne la formule avec les modèles par défaut.
- **Absent ou invalide** : les réglages par défaut ci-dessus, sans jamais planter. Une seule ligne courte part dans les logs
  (`[ai] AI_CONFIG invalide (raison) : réglage par défaut`), jamais le contenu du secret. Un modèle Pro est refusé.
- **Anciens secrets non lus** : `AI_MODEL`, `AI_ACTION_MODEL`, `AI_FALLBACK_MODEL`, `AI_PROVIDER`, `AI_TIMEOUT_MS`, `AI_ACTION_WAIT_MS` ne sont
  plus lus du tout (on peut les supprimer) : un vieux secret ne peut pas ramener un modèle retiré par Google.

### Les trois modèles (vérifiés le 12/10/2026 dans la documentation de Google, à revoir chaque mois)

| Niveau | Modèle | Réflexion (`thinkingLevel`) | Quand |
|---|---|---|---|
| rapide | `gemini-3.5-flash-lite` | `minimal` | les questions **et** les ordres |
| documents | `gemini-3.8-flash` | `low` (`minimal` n'existe pas sur ce modèle) | un fichier est joint ; lecture d'un bulletin |
| secours | `gemini-3.1-flash-lite` | `minimal` | **seulement après** une erreur ou un délai dépassé du premier appel |

- **Un seul appel par demande** en temps normal. Le secours ne part jamais en même temps : fini la « course » entre un modèle fort et un modèle léger.
- Délais : rapide 5 s puis secours, 8 s au plus au total ; documents 25 s puis secours, 40 s au plus.
- Corps de la requête Gemini : ni `temperature`, ni `top_p`, ni `top_k` (retirés pour Gemini 3.6 et suivants) ; la réflexion passe **uniquement** par
  `thinkingConfig.thinkingLevel` (jamais avec `thinkingBudget` : erreur 400). Jamais de modèle Pro.

### Plus de clé de service

`assistant`, `worker-assistant` et `payslip-read` ne lisent plus `SUPABASE_SERVICE_ROLE_KEY`. Qui appelle, son rôle, son entreprise, `is_active`,
`ai_enabled` et le quota viennent de la fonction SQL **`public.assistant_context`**, appelée avec **le jeton de la personne** (clé `anon` + son
`Authorization`) ; tout le reste est lu avec ce même client (sa RLS). Droits : `authenticated` seulement (ni `anon`, ni la clé de service).
`assistant-eval` (banc d'essai protégé par le secret « cron » de la base) garde sa clé de service pour cette seule vérification ; ses appels au
modèle passent par le même adaptateur que les autres.

Côtés : `bureau` = admin ; `salarie` = salarié ou chef d'équipe ; `bulletin` = admin (lecture d'un bulletin).

### Compteur global et quotas

- Table **`ai_project_usage`** (jour de Google = heure du Pacifique, niveau, nombre) : le gratuit de Gemini est compté **par projet**. Quand le plafond
  du jour est atteint : « L'assistant est en pause jusqu'à demain… », **aucun appel au modèle**.
- Il n'avance **que si le quota de la personne / de l'entreprise a laissé passer** (même transaction, ligne verrouillée) : une demande refusée ne compte pas,
  et un utilisateur qui appelle la fonction en direct ne peut pas user le compteur au-delà de **son propre quota**.
- Les limites passées par l'appelant sont **bornées en base, par côté** : quota du jour 200 (bureau, par entreprise), 50 (salarié, par personne), 100 (bulletin, par entreprise), plafond global 100 000. Les défauts des fonctions (50 / 20 / 100) restent en dessous : un membre qui appelle la fonction en direct ne peut jamais pousser le compteur global au-delà de ce que l'usage normal de son quota permet.
- La lecture d'un bulletin, qui n'avait aucun quota, en reçoit un par entreprise et par jour (table `ai_bulletin_usage`, secret facultatif
  `PAYSLIP_DAILY_LIMIT`, 100 par défaut). Les secrets `ASSISTANT_DAILY_LIMIT` (50) et `WORKER_ASSISTANT_DAILY_LIMIT` (20) ne changent pas.
- Une phrase que l'assistant sait traiter sans modèle compte quand même (le quota est pris avant de lire les données) : le plafond est donc prudent.
- Les deux tables sont fermées à tous côté client (RLS sans policy, aucun droit) ; la clé de service peut les lire, jamais les vider. Elles ne
  contiennent que des nombres.

### Outils envoyés par domaine

Au lieu des 34 déclarations du bureau (19 côté salarié), seules celles du **domaine reconnu** partent au modèle (planning, heures, salariés, chantiers, documents, réglages ;
côté salarié : heures, congés, chantier, collègues). Plusieurs domaines reconnus → leur union ; **aucun reconnu → tout part**, comme avant ; « répondre »
est toujours là. Avec un fichier joint, la liste « documents » du lot 1 ne change pas. Test : pour **chacune** des 80 phrases du jeu d'évaluation
(bureau et salarié), l'outil attendu est dans la sélection (`npm run test:ia-domaines`, 573 déclarations au lieu de 1413 sur les phrases qui passent par le modèle).

### Bandeau « Mode essai »

Texte exact : « Mode essai (Gemini gratuit) : données fictives uniquement. Google peut relire et réutiliser ce que vous envoyez. »
Visible **avant** tout envoi dans l'assistant du bureau, l'assistant du salarié et l'écran « Coût réel » (lecture d'un bulletin). La source de vérité est
`formule` d'`AI_CONFIG` : à l'ouverture, l'écran demande `{ "statut": true }` à la fonction (aucun quota, aucun appel au modèle). **En cas de doute le
bandeau reste affiché** (fonction injoignable, ancienne version encore déployée) ; seul « payant » le retire.

### Mise en ligne (dans CET ordre)

1. **Appliquer la migration** `supabase/migrations/20261012090000_lot6_couche_ia_v2.sql`, puis lancer la requête de VÉRIFICATION de son en-tête (8 × `true`).
   Additive : deux tables neuves, une fonction neuve ; `assistant_consume` et `worker_assistant_consume` ne sont pas touchées. Tant que les fonctions
   ne sont pas redéployées, l'application fonctionne exactement comme avant.
2. **Ensuite seulement, déployer les 4 fonctions** : `assistant`, `worker-assistant`, `payslip-read`, `assistant-eval`. Les nouvelles versions appellent
   `assistant_context` : sans la migration, l'assistant répond « indisponible » (rien n'est corrompu).
3. (Facultatif, sans urgence) poser `AI_API_KEY` et `AI_CONFIG`. Tant qu'ils sont absents : `GEMINI_API_KEY` + réglages par défaut, formule **essai**.
4. Après le déploiement, relancer le jeu d'évaluation sur le vrai modèle : `POST /functions/v1/assistant-eval` avec `{ "version": "v2", "prodPath": true }`
   (les ordres passent maintenant par le modèle rapide, réflexion minimale).

Retour arrière : redéployer les trois fonctions d'avant le lot 6, puis le bloc RETOUR ARRIÈRE de la migration (les tables de compteurs restent).

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
- Modèle (lot 6) : questions **et** actions passent par le modèle « rapide » (un seul appel), le modèle « documents » est réservé aux fichiers joints, le secours ne part qu'après une erreur : voir la section 0. (Avant le lot 6 : un modèle fort pour les actions, `AI_ACTION_MODEL`, en course avec le léger : retiré.)
- ⚠️ La clé Gemini actuelle est en **niveau gratuit** : quotas par projet et par jour très bas, et Google peut réutiliser les échanges pour améliorer ses produits. Pour un vrai client : activer la facturation sur la clé (Google AI Studio → Billing) puis `{"formule":"payant"}` dans `AI_CONFIG`.

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

Mesure du 29/09, **même modèle avant / après** (`gemini-3.5-flash-lite`, quota séparé de la prod, avant la couche IA du lot 6 : réflexion par défaut, tous les outils) :

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
body `{ "version": "v2", "ids": [...], "parallel": 1, "gapMs": 4000 }`. Le modèle est celui d'`AI_CONFIG` (lot 6), le même que pour les clients ;
`"prodPath": true` = sans nouvel essai après une erreur. Les anciens essais « chronomètre » et « sonde » de modèles (appels directs à Gemini) sont retirés.

## Prod

Lot 7 : migrations `20261001090000_lot7_assistant_journal.sql`, `20261001100000_lot7_collegues_documents.sql`, puis `assistant` et `worker-assistant`.
Lot 6 (couche IA v2) : voir « Mise en ligne » dans la section 0 (migration d'abord, puis les 4 fonctions).
