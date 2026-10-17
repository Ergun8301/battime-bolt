# IA v2 : un vrai assistant (lot 7) et sa couche IA (lot 6, oct. 2026)

Toujours derrière **`companies.ai_enabled`** (rien ne change pour les autres).

## 0. Couche IA v2 (lot 6) : un seul réglage, une seule clé

> ⚠️ **Gemini gratuit = données fictives uniquement ; le payant est obligatoire avant tout vrai client (UE/Suisse).**
> Avec la clé gratuite, Google peut relire et réutiliser ce qui est envoyé. À la demande d'Ergun, **aucun bandeau** ne le
> rappelle plus à l'écran (ni chez le patron, ni chez le salarié) : l'avertissement vit ici, dans les PR et dans le plan,
> et le support BEMEXO voit la formule sur sa console (voir « Pas de bandeau à l'écran » plus bas).

> ## 🛑 AVANT LE PREMIER VRAI CLIENT QUI UTILISE L'ASSISTANT
>
> 1. **Passer Gemini en payant avec plafond** : `AI_CONFIG` avec la formule « payant » **et ses `plafonds`**
>    (`{"formule":"payant","plafonds":{"rapide":N,"documents":N}}` : demandes par jour pour tout le projet, sans `plafonds` il n'y en a aucun en payant),
>    facturation activée sur la clé, plafond de dépense ou alerte de budget réglé côté Google, et une **clé de test séparée** pour les essais
>    (jeu d'évaluation, démonstrations) : la clé des vrais clients ne sert qu'aux vrais clients.
> 2. **Sinon, les données des vrais salariés partent vers une formule gratuite que Google peut relire et réutiliser** (obligation UE/Suisse).
>    Plus aucun bandeau à l'écran ne le dit : personne ne le verra à notre place.
> 3. Ensuite : **Supabase Pro**, et la **politique de confidentialité mise à jour** (sous-traitant Google, formule payante).
>
> Contrôle : la console `/support` doit afficher « IA : formule payant ».

### Les secrets (Supabase → Edge Functions → Secrets)

| Secret | Rôle |
|---|---|
| `AI_CONFIG` | **Le seul réglage** (JSON) : la formule, le modèle de chaque niveau, les plafonds du jour. |
| `AI_API_KEY` | La clé de **Gemini**. `GEMINI_API_KEY` reste lue en repli : rien ne casse tant que les nouveaux secrets ne sont pas posés. |
| `ANTHROPIC_API_KEY` | La clé de **Claude** (fournisseur `anthropic`), lue seulement si un niveau de `AI_CONFIG` utilise Claude. Voir la section « Claude Sonnet 5.5 » plus bas. |

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

- Tous les champs sont facultatifs. `formule` : `essai` (défaut) ou `payant`. Modèle : `fournisseur:modèle` (`gemini` ou `anthropic`, mélange permis d'un niveau à l'autre).
- `plafonds` : demandes par jour pour **tout le projet**, par niveau. Par défaut 400 / 15 en `essai` (sous le gratuit de Google, à ajuster d'après les limites
  affichées dans Google AI Studio), aucun en `payant`. Pour passer en payant, une fois la facturation activée sur la clé : `{"formule":"payant"}`.
- Raccourci : la seule valeur `payant` (ou `essai`), sans JSON, donne la formule avec les modèles par défaut.
- **Absent ou invalide** : les réglages par défaut ci-dessus, sans jamais planter. Une seule ligne courte part dans les logs
  (`[ai] AI_CONFIG invalide (raison) : réglage par défaut`), jamais le contenu du secret. Un modèle Gemini Pro est refusé ; chez Claude, seuls `claude-sonnet-5-5`, `claude-sonnet-5` et `claude-haiku-5-5` sont admis (voir plus bas).
- **Anciens secrets non lus** : `AI_MODEL`, `AI_ACTION_MODEL`, `AI_FALLBACK_MODEL`, `AI_PROVIDER`, `AI_TIMEOUT_MS`, `AI_ACTION_WAIT_MS` ne sont
  plus lus du tout (on peut les supprimer) : un vieux secret ne peut pas ramener un modèle retiré par Google.

### Les trois modèles (vérifiés le 12/10/2026 dans la documentation de Google, à revoir chaque mois)

| Niveau | Modèle | Réflexion (`thinkingLevel`) | Quand |
|---|---|---|---|
| rapide | `gemini-3.5-flash-lite` | `minimal` | les questions **et** les ordres |
| documents | `gemini-3.8-flash` | `low` (`minimal` n'existe pas sur ce modèle) | un fichier est joint ; lecture d'un bulletin |
| secours | `gemini-3.1-flash-lite` | `minimal` | **seulement après** une erreur ou un délai dépassé du premier appel |

- **Un seul appel par demande** en temps normal. Le secours ne part jamais en même temps : fini la « course » entre un modèle fort et un modèle léger.
- Délais (`DELAIS` dans `_shared/ai-provider.ts`) : rapide 5 s puis secours, 8 s au plus au total ; documents **12 s** puis secours, **25 s** au plus (c'était 25 s / 40 s : voir le constat ci-dessous).
- Un modèle « documents » **lent ou indisponible** (délai dépassé, 429, 5xx, 404, injoignable) est **mis de côté 10 minutes** (`REPOS_MS`, variable d'isolat, rien en base) : les lectures suivantes
  vont tout de suite au secours au lieu de réattendre 12 s. Un 400 (mauvaise requête, clé refusée) ou une réponse illisible ne le met pas de côté. Si le secours échoue aussi,
  le modèle mis de côté est réessayé avec le temps qui reste. Le modèle « rapide » n'est jamais mis de côté (`REPOS_MS.rapide = 0`).
- Un résultat obtenu par le **secours** porte `secours: true` : la lecture d'un bulletin (écran « Coût réel » et assistant) le signale **« à vérifier »** (voir plus bas).
- Corps de la requête Gemini : ni `temperature`, ni `top_p`, ni `top_k` (retirés pour Gemini 3.6 et suivants) ; la réflexion passe **uniquement** par
  `thinkingConfig.thinkingLevel` (jamais avec `thinkingBudget` : erreur 400). Jamais de modèle Pro.

### Constat : `gemini-3.8-flash` (niveau « documents ») très lent, 12/10/2026

Journaux de la fonction de banc d'essai (lignes techniques seulement, aucun contenu), sur environ 8 appels « documents » : `[ai] gemini-3.8-flash : plus de 25000 ms, abandon` ×3 et
`[ai] fournisseur : HTTP 503` ×1, chaque fois suivis de `[ai] modèle documents indisponible : modèle de secours`. Aucun 429. Le secours répondait donc après 26 s en tout : chaque lecture
de document attendait 25 s pour rien.

Correctif : attente du premier appel ramenée à 12 s, et modèle mis de côté 10 minutes après un échec « lent ou indisponible ». Aucun nom de modèle ni la formule n'ont changé.
**Cause de la lenteur de `gemini-3.8-flash` non élucidée : à rechoisir le modèle « documents » si cela se confirme** (décision d'Ergun / Cowork, pas du code).

**Un secours léger est « à vérifier »** : un bulletin lu par le modèle de secours ressort avec les **quatre** chiffres (mois, brut, total employeur, heures) marqués « · à vérifier »
sur l'écran « Coût réel » (`payslip-read` → `payslipReply`, `sanitizeExtraction(…, secours)`), et l'assistant ajoute « Bulletin lu par le modèle de secours (plus léger) : contrôlez chaque chiffre avant de confirmer »
au-dessus de la carte (coût réel, ou invitation avec bulletin). Dans les deux cas rien n'est enregistré avant la validation de l'administrateur. L'assistant du salarié ne lit pas de bulletin.

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

### Pas de bandeau à l'écran (demande d'Ergun) ; la formule reste visible du support

Le lot 6 avait ajouté un bandeau « Mode essai (Gemini gratuit) : données fictives uniquement… » dans l'assistant du bureau, l'assistant du salarié et
l'écran « Coût réel » (lecture d'un bulletin). **Ergun ne l'a jamais demandé : il est retiré** (composant, styles et logique « en cas de doute on l'affiche »).
Les écrans du patron et du salarié ne disent plus rien de la formule. L'avertissement reste ailleurs : cette page (encadré en haut), les PR, le plan.

Ce qui **ne change pas** (tout est côté serveur) : le secret `AI_CONFIG`, le compteur global (`ai_project_usage`) et ses plafonds, `assistant_context`,
le champ `formule` joint à chaque réponse des fonctions, la demande `{ "statut": true }` (aucun quota, aucun appel au modèle) et `lib/ia-formule.ts` (`iaFormule`).

**Seul le support BEMEXO** voit la formule : une ligne discrète « IA : formule essai » ou « IA : formule payant » sur sa console `/support`, affichée
**après** les vérifications du lot 5 (compte inscrit dans `support_staff`, double vérification). « IA : formule inconnue » si la fonction ne répond pas ou
si l'ancienne version est encore déployée. Pas de chiffre du compteur (il est réservé au service) : le panneau support complet est prévu plus tard (lot 28).
Aucune migration. Un patron ou un salarié qui ouvre `/support` voit « Accès réservé » et la fonction n'est même pas interrogée. Test : `npm run test:ia-formule-ecrans`.

**Mise en ligne du retrait** : le front seulement (site statique). Aucune migration, aucun secret, **aucune fonction à redéployer** (côté fonctions, seuls des commentaires ont changé).

### Claude Sonnet 5.5 (étape 1 : l'Assistant sur Claude, Gemini en secours)

**Rien ne change tant que `AI_CONFIG` n'est pas modifié** : le défaut reste exactement celui d'avant (tout Gemini). Le code sait seulement parler à Claude en plus.
L'assistant du bureau (`assistant`), celui du salarié (`worker-assistant`) et la lecture des bulletins (`payslip-read`) passent tous par le même adaptateur
(`_shared/ai-provider.ts`, avec `_shared/ai-anthropic.ts` pour Claude) : un seul réglage les fait basculer ensemble.

**1. Poser la clé** (une fois) : Supabase → Edge Functions → Secrets → `ANTHROPIC_API_KEY` (déjà enregistrée). La clé de Gemini reste en place : c'est elle qui sert au secours.

**2. Essayer SANS toucher la production** : le banc d'évaluation accepte un réglage de remplacement pour sa seule passe (voir « Évaluer Claude » plus bas).

**3. Basculer** : `AI_CONFIG` =

```json
{
  "formule": "payant",
  "rapide": "anthropic:claude-sonnet-5-5",
  "documents": "anthropic:claude-sonnet-5-5",
  "secours": "gemini:gemini-3.1-flash-lite"
}
```

**Variante prudente** (le niveau « documents » reste sur Gemini, parce que Claude ne lit pas les photos HEIC/HEIF, voir « Limites ») :
`{"formule":"payant","rapide":"anthropic:claude-sonnet-5-5","documents":"gemini:gemini-3.8-flash","secours":"gemini:gemini-3.1-flash-lite"}`.
C'est aussi la variante à choisir tant que la lecture des bulletins n'est pas mesurée sur Claude.

**4. Revenir à Gemini en UN réglage** : supprimer le secret `AI_CONFIG` (retour exact au défaut d'avant : formule `essai`, plafonds 400 / 15 par jour pour le projet),
ou mettre `{"formule":"payant"}` (Gemini payant, sans plafond du projet). Aucun redéploiement ; `ANTHROPIC_API_KEY` peut rester posée, elle n'est plus lue.
Si `AI_CONFIG` est mal écrit (ou nomme un modèle refusé), l'appli retombe d'elle-même sur le défaut Gemini et une ligne le dit dans les logs.

**Ce que « payant » change exactement** : les `plafonds` du projet. En `essai`, 400 demandes « rapide » et 15 « documents » par jour pour TOUT le projet (le gratuit de Google) ;
en `payant`, aucun plafond global (`plafonds: null`), sauf si on en écrit un (`"plafonds":{"rapide":N,"documents":N}`). Claude est payant au volume, sans « gratuit » à ménager.
Rien d'autre ne bouge : les quotas par entreprise et par salarié (`ASSISTANT_DAILY_LIMIT` 50, `WORKER_ASSISTANT_DAILY_LIMIT` 20, `PAYSLIP_DAILY_LIMIT` 100) restent la limite de coût, et le compteur
`ai_project_usage` continue de compter. Pour un garde-fou de dépense, ajouter `plafonds` ET régler une alerte de budget dans la console Anthropic.

**Modèles admis chez Claude** (liste blanche stricte, sans date) : `claude-sonnet-5-5`, `claude-sonnet-5`, `claude-haiku-5-5`. Refusés avec le défaut Gemini à la place (et une ligne sans contenu dans les logs) :
Opus, Fable, Mythos (coût), tout identifiant daté, tout autre nom, un fournisseur inconnu. Même esprit que « jamais de Pro » chez Gemini.

**Clés par fournisseur** : `anthropic` lit `ANTHROPIC_API_KEY` ; `gemini` lit `AI_API_KEY` puis `GEMINI_API_KEY`. Un niveau dont le fournisseur n'a pas de clé est sauté, comme en cas de panne,
si le secours a SA clé (`aiDisponible(env, niveau)`) ; sans aucune clé utile, l'assistant répond comme avant « indisponible » / « lecture automatique indisponible » (les messages n'ont pas changé).

**Réflexion, vitesse et délais** (points de départ, À RÉGLER avec l'évaluation réelle) :

| Niveau / profil | Claude : `output_config.effort` | Gemini (inchangé) | Délais Claude (1er appel / total) | Délais Gemini (inchangés) |
|---|---|---|---|---|
| rapide (questions, ordres) | `low` | `minimal` | 9 s / 14 s | 5 s / 8 s |
| documents (fichier joint, bulletin) | `medium` | `low` | 20 s / 35 s | 12 s / 25 s |
| profil long (phrases longues, plusieurs actions, turc) | `medium` (secours `low`) | `medium` (secours `low`) | 18 s / 28 s | 14 s / 22 s |

- Pourquoi pas le défaut `high` : sur Sonnet 5.5 il ajoute une réflexion avant presque chaque réponse, trop lent pour un chat. `low` saute la réflexion sur les demandes simples ; `medium` garde de quoi
  comprendre plusieurs actions dans une phrase (mesuré sur Gemini : 11/11 en `medium` contre 4/11 en `minimal`). Le profil long ne change pas le quota (une demande = une unité).
- `thinking` est **omis** (réflexion adaptative) : `{"type":"disabled"}` est refusé (400) sur Sonnet 5.5 et `{"type":"between_tools"}` n'existe que sur ce modèle (400 sur Sonnet 5 et Haiku 5.5, qui sont admis) et couperait la réflexion dont le profil long a besoin.
- Jamais de `temperature`, `top_p`, `top_k`, ni de `budget_tokens` (400). Pas de `tool_choice` forcé (400) : `tool_choice: {"type":"auto"}` (+ `disable_parallel_tool_use` quand un seul appel est accepté)
  et la consigne « réponds UNIQUEMENT en appelant une des fonctions fournies ». Si Claude répond par du texte sans appeler de fonction : réponse illisible (`bad_response`), sans second appel (comme pour Gemini).
- Les totaux restent bornés (la fonction Edge a une limite d'exécution et la base est lue avant l'appel). Les valeurs vivent dans `DELAIS_ANTHROPIC` et `PROFIL_LONG_ANTHROPIC` ; celles de Gemini n'ont pas bougé.
- Outils : les déclarations (format Gemini) sont converties en JSON Schema pour Claude (types en minuscules, `nullable` → type + `null`, mots-clés inconnus retirés, objets fermés) ; un test passe TOUTES les déclarations réelles du bureau et du salarié
  dans un validateur. `strict: true` est DÉSACTIVÉ (`STRICT_ACTIF = false`) : mesuré le 14 octobre 2026 sur la vraie API, la toute première requête avec 12 outils stricts a pris 33,5 s (l'API compile une grammaire par jeu d'outils, puis la garde 24 h) contre 2,8 s sans strict. Le code qui lit l'appel revérifie de toute façon chaque argument.
  La sélection « stricte » (limites : 20 outils, 24 paramètres facultatifs, 16 unions) reste dans `outilsClaude(fonctions, true)` pour plus tard, par exemple avec un cache à chaud ; elle est testée mais jamais utilisée en production.
- Lecture d'un bulletin (`extractJson`) : sortie structurée de l'API (`output_config.format`, `json_schema`) plutôt qu'un outil unique, car elle garantit un JSON conforme sans `tool_choice` forcé.
- Réponse `refusal` de Claude : traitée comme une panne du niveau (le secours Gemini répond), sans mise au repos du niveau « documents » (un refus tient au contenu, pas au modèle). `max_tokens` atteint : jamais exécuté (arguments peut-être coupés).
- Pas de `cache_control` pour l'instant (étape suivante) : la requête est rangée dans l'ordre du cache (`tools`, `system`, `messages`). Pas non plus de « fallbacks » côté serveur d'Anthropic : le secours entre fournisseurs joue ce rôle.

**Limites connues**
- **HEIC / HEIF** : l'écran accepte ces photos d'iPhone, Claude non (JPEG, PNG, GIF, WebP et PDF seulement). Avec un niveau Claude, un tel fichier n'est PAS envoyé : le niveau échoue proprement et le **secours Gemini** le lit (`secours: true`,
  « à vérifier » pour un bulletin). Même chose pour une image de plus de 10 Mo en base64. Si le secours est aussi Claude, la lecture échoue comme une panne.
- Les délais, l'effort et le taux de réussite de Claude sur le jeu d'évaluation ne sont **pas encore mesurés** : le jeu est prêt, la mesure se fait avec la vraie clé (ci-dessous).
- Données : avec Claude, les données de l'entreprise (celles que l'assistant envoyait déjà à Gemini) partent chez Anthropic. Avant un vrai client : sous-traitant Anthropic à ajouter à la politique de confidentialité, comme Google.
- Prix de départ (à vérifier sur la page tarifs d'Anthropic) : environ 2 $ par million de jetons en entrée et 10 $ en sortie pour Sonnet 5.5.

**Évaluer Claude sans toucher la production** : `POST /functions/v1/assistant-eval` (en-tête `x-cron-secret` inchangé) avec, en plus des champs habituels, `aiConfig` (la chaîne JSON de `AI_CONFIG`, un objet JSON, ou le raccourci `payant`) :
`{"version":"v2","prodPath":true,"repeat":3,"aiConfig":"{\"formule\":\"payant\",\"rapide\":\"anthropic:claude-sonnet-5-5\",\"documents\":\"anthropic:claude-sonnet-5-5\",\"secours\":\"gemini:gemini-3.1-flash-lite\"}"}`.
- Validé par la **même fonction** que la production : un `aiConfig` invalide est une erreur **400** explicite (jamais un repli silencieux qui ferait croire que Claude a été testé).
- Il remplace `AI_CONFIG` pour cette passe seulement ; les clés restent celles de l'environnement (`ANTHROPIC_API_KEY` doit donc être posée).
- La réponse porte `config` (le `fournisseur:modèle` de chaque niveau, `surcharge: true`, et si les clés sont posées) et `modeles` (combien de cas ont été servis par chaque `fournisseur:modèle`, **secours compris** : un cas servi par Gemini ne compte jamais pour Claude).
  Un `modele` figure aussi sur chaque cas. Regarder `modeles` avant de lire le score.

### Mise en ligne (dans CET ordre)

1. **Appliquer la migration** `supabase/migrations/20261012090000_lot6_couche_ia_v2.sql`, puis lancer la requête de VÉRIFICATION de son en-tête (8 × `true`).
   Additive : deux tables neuves, une fonction neuve ; `assistant_consume` et `worker_assistant_consume` ne sont pas touchées. Tant que les fonctions
   ne sont pas redéployées, l'application fonctionne exactement comme avant.
2. **Ensuite seulement, déployer les 4 fonctions** : `assistant`, `worker-assistant`, `payslip-read`, `assistant-eval`. Les nouvelles versions appellent
   `assistant_context` : sans la migration, l'assistant répond « indisponible » (rien n'est corrompu).
3. (Facultatif, sans urgence) poser `AI_API_KEY` et `AI_CONFIG`. Tant qu'ils sont absents : `GEMINI_API_KEY` + réglages par défaut, formule **essai**.
4. Après le déploiement, relancer le jeu d'évaluation sur le vrai modèle : `POST /functions/v1/assistant-eval` avec `{ "version": "v2", "prodPath": true }`
   (les ordres passent maintenant par le modèle rapide, réflexion minimale).

Correction « retire X » et lecture de documents plus rapide (après la mesure du lot 6) : redéployer `assistant`, `worker-assistant` et `payslip-read` (ils embarquent l'adaptateur partagé),
et `assistant-eval` si le banc d'essai doit mesurer les nouveaux délais. Aucune migration, aucun secret.

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

### Après la mesure sur le vrai modèle (80 phrases, 78/80) : « retire X » et b47

- **b44 « retire karim du planning demain »** : le modèle répondait tantôt `supprimer_intervention` (juste), tantôt `effacer_planning` (2 échecs sur 3 essais). Les deux outils sont proches : la
  frontière est maintenant écrite dans leurs **descriptions** et dans la **consigne** de l'assistant. Un salarié (ou un chantier) et **UN seul jour** (« retire Marc du planning mardi ») →
  `supprimer_intervention` ; « vide / efface le planning » (de quelqu'un, d'une période, d'une semaine ou de l'équipe) → `effacer_planning`. Le verbe compte : « retire / enlève X + un jour » = une case, « vide / efface le planning » = tout ce qui est prévu. Les exemples ne contiennent **ni « cette semaine », ni phrase du jeu** : un exemple « cette semaine » avait fait régresser b36 sur le vrai modèle (il prenait la semaine en cours, passée, au lieu de la semaine prochaine). Retirer l'exemple n'a pas suffi (b36 échouait encore) : les paramètres de date (`du`, `au` d'`effacer_planning`, `date` de `supprimer_intervention`) rappellent maintenant la règle du calendrier — un nom de jour seul = le PROCHAIN jour de ce nom, aujourd'hui compris, jamais un jour déjà passé sauf s'il est dit. Les deux outils partent toujours **ensemble** (même domaine « planning », testé).
  Le modèle n'est pas déterministe (plus de `temperature` sur Gemini 3.x) : un test fixe les textes, pas la réponse du modèle ; à re-mesurer sur le vrai modèle après déploiement.
- **b47 « retire Kevin de la Villa Dupont vendredi »** : l'assistant rendait `supprimer_intervention`, Kevin, `planning_id` vide, « Choisissez l’intervention. » et les seules cases de Kevin : c'est
  **exactement le comportement voulu** (rien ce jour-là → on le dit, avec ses cases proches). C'était l'**attente du cas qui était fausse** : le contrôle `act` du banc répond « pas prête » dès qu'il y a un problème,
  donc b47 ne pouvait jamais passer. Le cas utilise maintenant `actAvecProblemes` (type `supprimer_intervention`, Kevin, `planning_id` vide, problèmes **exactement** `['Choisissez l’intervention.']`, choix non vide
  et uniquement de Kevin). Aucun test n'est supprimé ni assoupli : `act` est inchangé pour tous les autres cas (b47 est le seul à attendre un `planning_id` vide).

### Dates : prochain jour de la semaine, côté code

Mesuré sur le vrai modèle (aujourd'hui du jeu = jeudi 2026-10-01) : pour un nom de jour seul, le modèle renvoie parfois le jour **passé** de la semaine en cours, quel que soit le texte des descriptions
(b36 « vide le planning de karim de lundi à mercredi » → 2026-09-28 → 2026-09-30 au lieu de 2026-10-05 → 2026-10-07, y compris sur l'ancien code ; b06 « décale l'intervention de karim de vendredi à lundi »
→ 2026-09-25 / 2026-09-28 au lieu de 2026-10-02 / 2026-10-05). Le texte ne suffisant pas, la règle est aussi **en code**, en un seul endroit (`dateAVenir` / `plageAVenir` dans `_shared/fr-langue.ts`) :
si une date donnée par le modèle est **déjà passée** et que la phrase **nomme ce jour de la semaine** sans marqueur de passé, elle devient la **prochaine occurrence** de ce jour (aujourd'hui compris), et une plage garde `du ≤ au`.
Jamais touchée : une date qui n'est pas passée, un jour que la phrase ne nomme pas, ni quand le passé est dit (« dernier », « passé », « hier », « avant-hier », « précédent », « il y a », « depuis », « était »),
ni quand une date est écrite (`28/09`, « 28 septembre », « lundi 28 », `2026-09-28`) ou la semaine en cours dite (« cette semaine », « semaine en cours »).

Couvert (actions de **planning**, où un jour passé sans marqueur est presque toujours une erreur du modèle) : `affecter_planning` (dates), `modifier_intervention` (date, nouvelle_date),
`supprimer_intervention` (date), `effacer_planning` (du/au). **Pas** concernés, car leurs jours peuvent légitimement être passés (« Kevin est malade lundi et mardi » dit un jeudi = le lundi et le mardi passés) :
les absences et congés (`poser_absence`, `supprimer_absence`, `demander_conge`, `modifier_conge`), `corriger_pointage`, `ajouter_depense` et les heures du salarié (`declarer_heures`, `effacer_heures`, `copier_journee`).
Leurs dates restent celles du modèle, et les descriptions de `supprimer_absence` ne demandent pas « le prochain jour ».

## G · Phrases longues et plusieurs actions (français / turc)

**Le problème** (retour réel d'Ergun, sur le téléphone d'un salarié) : « Ajoute-moi une intervention. J'ai travaillé aujourd'hui de 8h à midi, puis pause d'1h, puis de 13h à 17h
sur un nouveau chantier : prénom Pierrick, nom Dupont, à Montagna 01250, pour la pose d'un store banne. » donnait UN créneau de 3 h (13h-17h perdu), la pause lue comme « cahier »,
le client et l'adresse ignorés, puis « sur quel chantier ? ». Attendu : UNE fiche avec les DEUX créneaux, la pause d'1 h, le nouveau chantier, à confirmer en un clic.

**Les causes, mesurées** : (1) le lecteur à expressions régulières passait AVANT l'IA et déformait les phrases longues ; (2) la consigne disait « appelle UNE fonction » et `callFunction`
ne gardait que le premier `functionCall` ; (3) `declarer_heures` n'avait aucun champ pour un NOUVEAU chantier ; (4) le palier « rapide » (réflexion « minimal », 5 s) ne comprenait que 4 phrases
longues sur 11 ; (5) la limite de 500 caractères ; (6) la dictée verrouillée sur `fr-FR`.

### Le profil « long » (`_shared/saisie-profil.ts`, `_shared/worker-turn.ts`)

Une phrase du salarié est « longue » dès qu'un seul de ces signaux joue : ≥ 120 caractères, turc détecté, plusieurs familles d'actions (panier, réserve, congé, envoi, copie, nouveau chantier,
heures), ≥ 3 plages horaires, 2 plages + le mot « pause », nouveau chantier + code postal/adresse/prénom, une plage + une pause dite en toutes lettres (« une demi-heure de pause », que le lecteur
local ne lit pas), une plage + une autocorrection (« 7h, non plutôt 7h30 »). Deux plages seules (« Ce matin 7h30-12h, après-midi 13h-16h30 ») restent **courtes**.

- **Court** : exactement le chemin d'avant (lecteur local, sinon une fonction, même consigne, mêmes outils, aucun champ de plus dans la requête). Les 80 phrases du jeu d'évaluation restent toutes courtes
  (test `npm run test:saisie-profil`, 0 « longue »), leurs sorties locales sont identiques (preuve par comparaison avant/après).
- **Long** : **jamais le lecteur local** (même sans clé ou en cas d'échec : une notice, jamais un repli sur le lecteur qui avait produit le bug) ; IA en réflexion « medium », fenêtres de **14 s puis 22 s au
  total** (`PROFIL_LONG` dans `ai-provider.ts` : des constantes du code, pas de la configuration `AI_CONFIG`), modèle de secours en « low » ; jusqu'à **4 appels de fonction** (`maxCalls`, `MAX_APPELS`).
  Une demande = **une unité de quota** du palier « rapide » (aucune migration). Latence mesurée : médiane 3,5 s, maximum 13 s sur 11 phrases (réflexion « medium » : 11/11 comprises contre 4/11 avant).
  Le client envoie `multi: true` ; sans ce drapeau (ancien navigateur en mémoire) le serveur reste en profil court, comme avant.
- Limite de saisie du salarié : **1500 caractères** (`WORKER_TEXT_MAX`), le bureau reste à 500.
- Outils du profil long : ceux du domaine de la phrase + un socle (heures, nouveau chantier, panier, envoi, réserves, congé, répondre), jamais `ranger_photo`. `declarer_heures` y gagne `nouveau_chantier`
  (nom du client, adresse, code postal, ville, travaux) et une ligne peut dire `chantier: "nouveau"`.

### Ce que le code corrige (le modèle se trompe de façon répétable) — `_shared/worker-multi.ts`

| Défaut mesuré | Règle déterministe |
|---|---|
| créneau fusionné 08:00-17:00 pause 60 | redécoupé selon les plages lues dans la phrase (français : « de 8h à midi », « 08.00-12.00 », « huit heures à midi » ; turc : « 8’den 12’ye kadar ») |
| pause décomptée deux fois (7h-12h « pause 60 » puis 13h-17h) | le trou entre deux créneaux EST la pause : la pause portée par un créneau et égale au trou (± 10 min) est mise à 0 ; l'écart n'est marqué « pause » que si le salarié l'a dite |
| ligne « nouveau » ou client non apparié | rattachée au nouveau chantier ; « Pierrick Dupont » n'est jamais « Villa Dupont » ; « Dupont » seul entre les deux → « à choisir » ; jamais « Autre » |
| créneau sans chantier nommé rempli au hasard depuis le planning | seulement quand aucun nouveau chantier n'est dit |
| chantier « nouveau » qui existe déjà (même nom + ville) | réutilisé, rien n'est créé (`reutilise_id`) |
| ville non dite | jamais inventée : la fiche la réclame |
| R1 · ville dite comme « adresse » (« adres Montagna 01250 » → adresse = Montagna, ville vide) | avec un code postal, une ville vide et une adresse sans chiffre ni mot de voie, DITE d'un seul tenant avec le code postal dans la phrase (« Montagna 01250 »), l'adresse EST la ville ; sinon, seulement si le modèle a rendu le code postal, les mots capitalisés qui le précèdent (hors nom du client). Un mot de voie (rue, avenue, chemin, place, sokak, cadde, mahalle, ZA, ZI, mairie, gare…) dans l'adresse OU dans ces mots (« Rue des Lilas », « Gül Sokak » en majuscules) n'est jamais une ville : la fiche réclame la ville. Une ville donnée par le modèle n'est jamais écrasée, une ville absente de la phrase ou un nombre sans code postal rendu (« devis Alpha 12345 ») jamais inventés |
| R2 · chantier DEVINÉ (« Villa Dupont » rendu pour « Pierrick Dupont, nouveau client », ou pour un « chantier » sans nom) | si aucun mot du chantier rendu n'est dans la phrase (hors mots du nouveau client), le créneau est SANS NOM : il prend le nouveau chantier (s'il est seul), sinon l'unique chantier nommé, sinon le planning comme avant ; « chez Dupont » + « Pierrick Dupont » reste « à choisir ». Un autre lieu dit sans nom (« ailleurs », « autre part », « başka bir yerde », « un autre chantier » ; pas « par ailleurs ») laisse le créneau sans nom « à choisir » : jamais rangé chez l'unique chantier nommé (un chantier existant « Autre » rendu par le modèle reste comme avant) |
| R3 · « nouveau chantier » dit pour un chantier qui existe déjà (« Bureau Martin à Villeurbanne »), sans bloc rendu | nom ET ville du chantier existant dits dans la phrase APRÈS « nouveau chantier » / « yeni şantiye » (≤ 15 mots), un seul candidat : bloc `reutilise_id`, la fiche dit « Chantier existant utilisé » (plus de « Non préparé : Nouveau chantier ») ; « …au Bureau Martin, demain je commence un nouveau chantier » reste « Non préparé : Nouveau chantier » |
| date non ISO en turc (« dün », « bugün », « yarın », `30.09`) | lue ; sinon « Date illisible » (jamais un repli silencieux sur aujourd'hui) |
| action non demandée (consigne cachée dans un nom de chantier) | un indice lexical est exigé dans la phrase pour chaque annexe (panier, réserve, congé, envoi) |
| plus de 4 actions | les appels écartés sont comptés et dits (« Autres actions »), les familles demandées et absentes sont listées (« Non préparé »), « Lecture rapide : vérifiez que tout y est » |

La réponse est une fiche `multi` : éléments dans l'ordre chantier → heures → panier → réserve → congé → envoi, **rien n'est enregistré avant « Tout confirmer »** (y compris les gestes « directs » du lot 7,
qui en profil long ne s'exécutent pas seuls). Les suppressions, copies et modifications de ligne ne sont jamais dans une fiche (elles gardent leur propre confirmation). Le chantier est créé à la confirmation
seulement, après avoir cherché un chantier actif de même nom + ville ; « Annuler » retire les lignes d'heures créées, le chantier reste (le salarié ne peut pas le supprimer).

### Limites connues

- Cartes, boutons et libellés restent en **français** ; seule la réponse libre suit la langue du salarié (turc ou français). Les textes pour le bureau (travaux, note de congé, détail de réserve) sont écrits en français.
- Dictée turque : dépend du navigateur (Chrome : `tr-TR` ; Safari iOS : selon la langue de dictée installée). À essayer sur un appareil réel avant la mise en ligne.
- En profil long, pas de repli local : ces phrases dépendent à 100 % du modèle (Gemini gratuit : 429/503 possibles). L'écran remet la phrase dans le champ si le modèle échoue (message « L’assistant n’a pas pu répondre. Utilisez la saisie habituelle. »). Une erreur du fournisseur consomme quand même une demande du quota journalier (débité avant l'appel, comme pour le profil court).
- Autres langues que le turc : traitées comme du français.
- **Données personnelles** : une phrase comme celle d'Ergun contient le prénom, le nom et l'adresse d'un client particulier. Ces données partent chez Google (formule gratuite : réutilisables par Google), sont écrites dans
  `worksites` (lisibles par tous les salariés de l'entreprise) ; le journal ne garde que « Chantier créé » et la ville. **Avant d'ouvrir le turc et les clients particuliers à de vrais salariés** : formule payante
  sans réutilisation des données, et mention dans la politique de confidentialité. Aucun journal ne contient le texte ni les arguments (test statique).
- La colonne `worksites.postal_code` n'est créée par aucune migration du dépôt : à confirmer en production (lecture seule) avant la mise en ligne ; le code ne dépend pas de son existence.

### Mesure (Cowork), avant toute mise en ligne

Le jeu compte maintenant **109 phrases** : les 80 d'origine (47 bureau + 33 salarié, inchangées) + **29 phrases longues du salarié** (`sl01–sl16` « Long FR », `st01–st13` « Long TR », dont la phrase exacte d'Ergun en `sl01` ; `st12` et `st13` mesurent R1 et R2). (Étape 2 : `sl17` et `st14` s'y ajoutent, avec un historique, et 15 suites de conversation `sc01–sc15` : le jeu compte alors 126 phrases, voir la section I.)
Les cas d'heures d'aujourd'hui sont mesurés sur une journée vide (`live: 'vide'`). Banc : `POST /functions/v1/assistant-eval` avec `{ "version": "v2", "prodPath": true, "repeat": 3, "parallel": 1, "ids": [...] }` —
`prodPath` = le chemin exact des clients (aucun nouvel essai après une erreur du fournisseur) ; `repeat` = 3 passes par cas (le modèle n'est plus à température fixe) ; **au plus 4 ids par appel avec `repeat: 3`, ou 12 avec
`repeat: 1`**, un par un (la clé gratuite est partagée avec la production ; la durée maximale d'une fonction n'a pas été vérifiée : réduire les lots au besoin). 200 ids au plus, un id inconnu est refusé.
Seuils : les 80 anciennes phrases ≥ 97,5 % (234 réussites sur 240 essais, aucun cas qui passait avant et échoue 3/3) ET les 29 nouvelles ≥ 97,5 % (85/87, aucun cas en échec 3/3), les 29 comptant toutes. Le rapport donne
par catégorie, par profil (court/long), la médiane et le maximum des temps, la cause de chaque échec (`fournisseur` ou `modèle ou code`) et le nombre de réponses du modèle de secours.
Tests sans modèle : `npm run test:saisie-profil`, `test:worker-multi`, `test:worker-turn`, `test:assistant-eval`, `test:ai-provider`, `test:ia-config`, `test:ia-domaines`.

**Mise en ligne** : le front d'abord, puis `worker-assistant` (et `assistant-eval` pour mesurer). Aucune migration, aucun secret, `assistant`, `payslip-read` et le bureau ne changent pas.

## H · Chat avec mémoire (étape 2 : l'écran)

L'assistant du bureau (fonction `assistant`) et celui du salarié (`worker-assistant`) deviennent un chat : il se souvient du sujet, on repart d'une page blanche en un clic, et on retrouve ses conversations.
Cette section décrit l'**écran** ; la base est dans `supabase/migrations/20261014090000_ia_etape2_chats.sql`, le serveur lit `body.history`. Décisions du 14 octobre 2026 (`docs/ia-vision.md` §6) : conservation **30 jours** après la dernière
activité, **texte seulement**, privé par utilisateur.

| Point | Comment |
|---|---|
| Mémoire | À chaque demande, l'écran envoie `history` : les 7 derniers messages TEXTE de la conversation en cours (avant la question), 600 caractères chacun. Le serveur nettoie encore (7 au plus, 600 par message, 3000 au total, rôles autres que `me` / `bot` ignorés, tout le reste ignoré sans erreur) et l'insère dans le prompt. Conversation neuve : la clé est **omise**, la requête est celle d'avant. |
| Jamais dans `history` | Les notices (erreur, quota, dictée), une question restée sans réponse (sa réponse a été une notice), un message sans texte (la bulle d'une carte qui pose sa question dans la carte). |
| « Nouveau chat » | Vide les messages, la question en attente et le chat courant ; grisé tant qu'une réponse est en cours **ou qu'une carte écrit** (« Je le fais… » : la carte serait démontée avant d'avoir montré « C'est fait » et son Annuler). Si une fiche attend son « Confirmer » (clôturer le mois, inviter…), le panneau demande d'abord « Abandonner cette action ? » (**Garder**, qui a le focus et que Échap choisit, ou **Abandonner**) : jamais de fiche qui disparaît sans un mot. Existe toujours (il ne dépend pas de la base). |
| Cartes : `working` / `waiting` | `ExtraControl` (le 2e argument de `renderExtra`) porte deux signaux de plus : `working(on)` — la carte ÉCRIT, appelé au départ et **toujours** à la fin, même si la carte a été démontée entre-temps (panneau fermé, historique ouvert) — et `waiting(on)` — la fiche attend son « Confirmer ». Le panneau les compte dans la conversation en mémoire (`Convo.working` / `Convo.waiting`, clés = l'objet `extra` de la réponse). Branchés dans les quatre cartes : `assistant-action-card`, `worker-action-card`, `worker-draft-card`, `worker-multi-card`. |
| « Historique » | N'apparaît que si l'écran reçoit `chats` (prop de `AssistantPanel`). 50 conversations au plus, la plus récente d'abord (`updated_at` décroissant), date relative (« aujourd’hui », « hier », « il y a 3 jours »), « Gardées 30 jours · visibles de vous seul ». Toucher une ligne rouvre la conversation (texte et liens) ; on la CONTINUE : le message suivant part avec l'historique et s'ajoute au **même** chat. Corbeille par ligne et « Tout effacer » : confirmation dans la ligne (« Supprimer ? Oui / Non »), pas de fenêtre du navigateur. États : chargement, vide (« Aucune conversation pour l’instant »), « Historique indisponible » (l'assistant reste utilisable). |
| Rouvrir : pas de course | La lecture d'une conversation peut durer. Si on quitte la vue pendant ce temps (« Retour », « Historique », panneau fermé) et qu'on pose une question, la conversation lue **ne remplace pas** l'écran à son arrivée (`HistoryView` sait s'il est encore à l'écran). `reopen` relit l'état **après** la lecture : refusé (`'occupe'`) si une réponse arrive ou si une carte écrit ; `'confirmer'` si une fiche attend (la ligne propose « Abandonner l'action en attente ? Garder / Abandonner »). Pendant une réponse ou une écriture, les lignes sont grisées et une phrase dit pourquoi. |
| Enregistrement | Après chaque tour COMPLET (question + réponse, hors notice) : `chats.append(chatId, texte tapé, réponse, liens)`. Le texte enregistré est celui que l'utilisateur a **tapé** (pas la demande en attente recollée à sa réponse). Le `chatId` renvoyé est gardé dans la conversation en mémoire de l'écran (champ `chatId` de `Convo`). Les enregistrements sont mis en file : deux tours rapprochés n'ouvrent jamais deux chats. |
| Si l'enregistrement échoue | L'erreur est avalée, **rien n'est écrit dans la console** (le contenu d'un chat n'a rien à faire dans un journal). L'assistant répond comme d'habitude et le contexte part quand même au serveur. Un tour perdu n'est pas rejoué : le suivant s'enregistre (dans le même chat, ou dans un nouveau si le premier n'a jamais pu s'ouvrir). Une panne passagère (500…) ne change rien : un seul essai par tour, le `chatId` est gardé. |
| Chat disparu ou plein | `ChatStore.append` rend `{ id }` ou `{ id: null, why }` avec `why` = `'introuvable'` (la fonction SQL répond 42501 sur un chat précis : supprimé depuis un autre onglet ou appareil, « Tout effacer » fait ailleurs), `'pleine'` (54000 : 200 messages) ou `'echec'` (tout le reste). Dans les deux premiers cas, réécrire sur ce chat échouerait à chaque tour, en silence : l'écran remet `chatId` à `null` et **réessaie une fois** le même tour sur un NOUVEAU chat, puis une ligne discrète (`role="status"`, hors contexte, jamais enregistrée) le dit **une fois** : « Cette conversation n’est plus dans l’historique : la suite est enregistrée dans un nouveau chat. » ou « Cette conversation est pleine (200 messages) : … ». Le tour suivant va au nouveau chat. (42501 dit aussi « session invalide » / « assistant non activé » : si c'était cela, l'essai sur le nouveau chat échoue pareil et rien ne change.) |
| Supprimer le chat affiché | Supprimer la conversation qui est à l'écran (ou « Tout effacer ») vide l'écran, comme « Nouveau chat ». `resetConvo` remet aussi `busy` à faux : une réponse encore en route à ce moment-là est jetée à son arrivée (garde `gen`, qui ne touche plus ni à `busy` ni à l'indicateur « Je regarde… », qui appartiennent peut-être à une nouvelle demande ; seul le compteur de questions restantes est mis à jour, le quota ayant été consommé) et ne laisse **plus** l'accueil avec « Je regarde… », Envoyer et « Nouveau chat » grisés. Tant qu'une carte écrit, la corbeille du chat affiché et « Tout effacer » sont grisés (si la suppression arrive quand même, l'écran reste mais n'est plus un chat enregistré). Si une fiche attend, la confirmation prévient qu'elle sera abandonnée. |
| Délai maximal | `invokeAssistant` (`lib/assistant.ts`, utilisée par `supabaseAssistantSource` ET `supabaseWorkerSource`) : 60 s (`ASK_TIMEOUT_MS`), requête abandonnée par `AbortController` et attente arrêtée même si le client ne tient pas compte du signal. Au-delà : la notice « L’assistant met trop de temps à répondre. Réessayez. » (jamais enregistrée ni envoyée comme contexte ; côté salarié la phrase revient dans le champ). Avant, un serveur qui ne répondait pas laissait le panneau bloqué jusqu'au rechargement. |
| Clavier et lecteur d'écran | Une action qui démonte le bouton focalisé ne renvoie plus le focus sur le haut de la page. Ouverture de l'historique : « Retour ». Corbeille ou « Tout effacer » : le focus va sur **« Non »** (le choix sûr) ; « Non » (ou Échap) le rend au bouton d'origine ; après « Oui », il va à la ligne suivante (sinon la précédente, sinon « Retour ») et une zone `role="status"` toujours présente annonce « Conversation supprimée. » / « Toutes les conversations ont été supprimées. » ; échec : retour au bouton d'origine. Conversation rouverte : le focus va dans le champ de saisie. Les mises à jour d'état faites après un `await` sont dessinées (`flushSync`) avant de donner le focus : un bouton encore `disabled` ne le reçoit pas. |

Code : `lib/assistant-chats.ts` (`ChatStore`, `supabaseChatStore` : lectures sous RLS + `assistant_chat_append` / `assistant_chat_clear` ; `memoryChatStore()` : démo, préviews et tests sans base ; `historyOf`, `jourRelatif`),
`components/assistant-panel.tsx` (en-tête, vue Historique), `components/assistant-bureau.tsx` (`supabaseChatStore`), `components/worker-assistant.tsx` (`supabaseChatStore`, `memoryChatStore()` en démo),
`AssistantSource.ask(question, file?, history?)` dans `lib/assistant.ts` et `lib/worker-assistant.ts` (les sources de démo acceptent `history` et l'ignorent).

### Limites connues

- Une conversation est pleine à **200 messages** : la base refuse (54000), l'écran **ouvre un nouveau chat** avec le tour qui n'a pas pu entrer et le dit une fois (voir « Chat disparu ou plein »). Le chat plein reste tel quel dans l'historique. 100 conversations au plus par utilisateur (les plus anciennes partent).
- Un chat supprimé depuis un autre onglet reste à l'écran de celui-ci tant qu'on n'y écrit pas : c'est le tour suivant qui le découvre et ouvre un nouveau chat (l'écran n'est pas relu en continu).
- Une carte qui n'en finit pas d'écrire (réseau coupé en plein envoi) garde « Nouveau chat » grisé : l'écriture n'a pas de délai maximal, comme avant. Fermer la page libère.
- Supprimer le chat affiché pendant qu'une réponse arrive jette cette réponse (le quota est consommé quand même) ; supprimer un chat, puis « Retour » et poser une question **avant** la fin de la suppression est un cas très rare qui vide aussi l'écran quand elle aboutit.
- Le texte de la réponse d'une carte d'action est enregistré tel que le serveur l'a écrit ; ce que la carte affiche ensuite (« ✅ Fait », choix, annulation) ne l'est pas.
- Le texte d'un tour avec pièce jointe est enregistré (question tapée + réponse) ; le fichier, jamais.
- Un chat ouvert depuis l'historique n'a pas de question « en attente » : une réponse à une question de l'assistant est comprise grâce à `history`, pas grâce à la mémoire de la demande.

### Tests

`npm run test:assistant-historique` (Playwright sur l'export statique `out`, base simulée, après `npm run build`) : nouveau chat, `history` envoyé (rien au 1er tour, puis les bons messages, 7 au plus), enregistrement du texte tapé, historique (ordre, dates), rouvrir et continuer,
suppression et « Tout effacer » avec confirmation, échec de l'enregistrement (500) sans bruit dans la console, notice non enregistrée, historique indisponible, téléphone 390 px (pas de défilement horizontal, boutons ≥ 40 px), côté salarié.
Revue de l'étape 2 (sections **R1 à R5**, une par défaut corrigé ; chacune échoue sur l'ancien code) : **R1** une carte qui écrit (écritures retardées de 2,5 s) → « Nouveau chat », rouvrir, corbeille du chat affiché et « Tout effacer » grisés, la carte montre « Fait » + Annuler ; une fiche à confirmer → « Abandonner cette action ? » (Garder / Échap / Abandonner) pour « Nouveau chat » et pour rouvrir, rien d'écrit ; **R2** « Retour » + une question pendant une lecture de 2,5 s (réponse rapide, puis réponse lente) → l'écran ne bascule pas sur l'ancien chat ; **R3** supprimer le chat affiché pendant une réponse suspendue → accueil sans « Je regarde… », Envoyer actif, réponse périmée jetée et non enregistrée ; 60 s sans réponse (horloge Playwright, bureau puis salarié) → notice, champ rendu, rien d'enregistré ; **R4** chat supprimé ailleurs (42501), chat plein (54000), panne 500 → nouveau chat + ligne discrète une fois / un seul essai ; **R5** focus au clavier (Tab, Entrée, Maj+Tab, Échap) et annonce. Côté salarié : une fiche d'heures qui s'enregistre grise « Nouveau chat ».
`npm run test:assistant-multi` n'est plus faussé par l'enregistrement du chat (`assistant_chat_append` n'est pas une écriture métier : `isWrite` l'écarte).
Captures : `docs/captures-assistant-historique/` (dont `1280-6-action-en-cours`, `1280-6b-historique-verrou`, `1280-7-abandon`, `1280-8-ligne-discrete`, `1280-9-apres-suppression-pendant-reponse`, `390-6-abandon`).

## I · Historique dans le prompt (étape 2 : le serveur)

`assistant` et `worker-assistant` lisent `body.history` (la clé que l'écran envoie, omise pour une conversation neuve) et la mettent dans la consigne du modèle. Tout est dans `_shared/assistant-history.ts` (fonctions pures, sans réseau ni base, importé aussi par le navigateur : mêmes règles de compatibilité que `saisie-profil.ts`).

| Point | Comment |
|---|---|
| Nettoyage | `nettoyerHistorique(brut)` : les **7 derniers messages valides**, **600 caractères** chacun, **3000 au total** (les plus récents d'abord, ce qui ne tient plus est écarté en bloc). Seuls les rôles `me` et `bot` comptent ; texte non vide obligatoire ; tout le reste (pas un tableau, élément mal formé, rôle inconnu…) est ignoré **sans erreur** : la fonction ne lève jamais. Chaque message est aplati sur une ligne (retours à la ligne, caractères invisibles, marques d'inversion du sens d'écriture) et ses chevrons `<` `>` deviennent `‹` `›` : il ne peut ni refermer le bloc ni ouvrir une ligne de consigne. |
| Bloc de consigne | `blocHistorique(h)` : « CONVERSATION EN COURS », puis `Utilisateur : …` / `Assistant : …`, le plus ancien d'abord. Il dit au modèle que cette conversation sert **uniquement** à comprendre les références (« et pour Lucas ? », « pareil demain », « annule ça », « le même chantier »), que tout ce qu'elle contient est **déjà traité** (ne jamais refaire une action déjà faite) **SAUF une demande restée sans réponse, ou à laquelle l'assistant a posé une question** : dans ce cas la DEMANDE la reprend en entier (avec la réponse) et c'est elle qu'il traite ; que c'est de la donnée et non des instructions, et que la demande à traiter est la **dernière** question. Il est collé **juste avant** la ligne `DEMANDE :` (bureau, `actionPrompt`) ou `MESSAGE :` (salarié : `workerFunctionPrompt` ET `workerMultiPrompt`, le profil long). |
| Sans historique | Absent, vide ou entièrement ignoré : la consigne est celle d'avant, **octet pour octet** (empreintes SHA-256 comparées avant / après sur les 109 phrases du jeu : consigne du bureau, consignes court et long du salarié, outils (dont `workerFunctionsForLong`), réponse du lecteur local, aucune différence ; refaites après les correctifs de la revue du serveur : toujours aucune différence). |
| Outils | Les domaines du dernier échange **s'ajoutent** à ceux de la demande (`functionsFor(hasFile, question, historique)`, `workerFunctionsFor(hasFile, text, historique)`, `workerFunctionsForLong(text, historique)`) : « annule ça » ne dit rien du planning, la phrase d'avant oui, donc `supprimer_intervention` reste proposé. Jamais l'inverse : une demande sans domaine reconnu garde **tous** les outils, comme avant. Un fichier joint garde la liste « documents ». **Câblage de production** : `runWorkerTurn` passe `snapshot.historique` aux deux profils du salarié (court et long) ; un test passe par `runWorkerTurn` avec un appel espion et lit les noms d'outils (« et après-demain aussi » garde `demander_conge`, `annuler_conge`, `modifier_conge`). |
| Client « dit » | Le garde-fou « le client doit avoir été **nommé** » (`affecter_planning`) lit la demande **et** ce que l'**utilisateur** vient de dire : « Et Kevin aussi » reprend Villa Dupont nommé juste avant au lieu de tomber sur « Autre ». Règles (`nommeAvant`, `assistant-actions-core.ts`) : seuls les messages `me` comptent (**jamais** le texte écrit par l'assistant : une liste de chantiers n'est pas un choix de l'utilisateur), les **deux derniers** seulement, et le **nom entier** du client (tous ses mots de plus de 2 lettres : « villa » seul ou « Dupont » seul ne désignent pas Villa Dupont). Dans la demande elle-même, la règle d'avant reste : un mot du nom suffit. Sans historique, rien ne change. (Trouvé par le jeu d'évaluation : sans cela, la relance partait sur « Autre » ; durci après la revue : le garde-fou s'affaiblissait à mesure que la conversation s'allongeait.) |
| Relance : le lecteur local s'efface | Sonde sur les deux lecteurs par mots-clés : une relance sans mot-clé local (« Et Lucas aussi », « Annule ça », « Et demain ? », les relances turques essayées) tombait **déjà** sur le modèle. Le lecteur répond **à côté** seulement quand la relance contient aussi un mot-clé qu'il connaît : « Pareil pour Sofiane, pose-le en maladie » → formulaire d'absence vide ; « Et l'après-midi 13h-17h pareil » → heures sans le chantier de ce matin ; « Combien d'heures sur ce chantier ? » → le total de la semaine. `doitSauterLeCheminLocal(demande, historique, nomme?)` = historique non vide **et** relance courte (12 mots, 120 caractères) portant une marque de renvoi. **Marques fortes** : « pareil », « idem », « même chose / le même chantier », « ça », « -le / -la / -lui / -y » collé à un verbe, « ce chantier / cette intervention… », « pour lui », quelques marques turques. Le pronom finit le mot : « Bourg-en-Bresse », « Montigny-le-Bretonneux », « Villars-les-Dombes » (trait d'union ou lettre derrière) sont des villes, pas des renvois. **Marque faible** : « aussi » / « également » ne font une relance que si la phrase ne nomme **ni un salarié ni un chantier connu** (`nomme`, calculé par chaque lecteur : « Ajoute Kevin comme salarié aussi » est une demande complète). Une demande complète (« Mets Karim sur Villa Dupont demain »), une question de guide (« Et comment j'ajoute un client ? »), « Et mon planning demain ? » ou « pareil qu'hier » ne sautent **jamais** (tests positifs et négatifs). Brancher : `handleActionLocally` lit `ctx.historique`, `handleWorkerLocally` lit `snapshot.historique`. |
| Plage horaire nue (salarié) | Une plage sans « pareil » ni chantier dit (« Et l'après-midi de 13h à 16h30 », « Plutôt 8h-12h », « Non, 8h-12h », « De 13h à 17h », « Puis 13h-17h », « Finalement 13h-17h ») n'a aucune marque de renvoi : le lecteur local la lisait quand même, avec le chantier du planning (pas celui de ce matin) ou « Intervention à Plutot ». Règle de `handleWorkerLocally` : si le lecteur rend un brouillon dont le chantier **n'est pas dit dans la phrase** (repris du planning, aucun trouvé, ou « Autre » déduit d'un mot qui n'est pas un lieu) **et** que le dernier échange de la conversation **parle d'heures** (une plage horaire, « heures », « brouillon » ou « pause »), c'est une suite : le modèle, qui voit le chantier d'avant, la lit. Un chantier dit (« …chez Martin »), un vrai lieu dit (« une intervention à Lyon ») ou une conversation qui ne parle pas d'heures gardent le lecteur local (instantané). |
| Réponse à une question de l'assistant | Quand l'assistant pose une question (« Sur quel chantier ? »), l'écran envoie `question` = « demande, réponse » (`components/assistant-panel.tsx`) alors que `history` contient déjà la demande d'origine : le bloc la déclarait **déjà traitée** puis la `DEMANDE` la répétait. `sansDemandeRecollee(history, question)` (appelée par `assistant`, `worker-assistant` et le banc) retire du bloc les messages de l'utilisateur qui forment le **début** de la question (une question : « Mets Karim demain, Villa Dupont » ; deux questions : « Mets Karim demain, Villa Dupont, de 8h à 12h »). La question de l'assistant reste. Si le début de la question n'est pas dans la conversation, l'historique est inchangé ; un historique qui devient vide donne la consigne d'avant. |
| Profil long du salarié | Les phrases libres (turc, autocorrection, pause en lettres, 120 caractères et plus, plusieurs actions) passent par `workerMultiPrompt`, qui porte le **même** bloc que le profil court, juste avant `MESSAGE :` (sans historique : octet pour octet la consigne d'avant). Un chantier que l'utilisateur a **dit** dans l'un de ses deux derniers messages compte comme dit pour le contrôle R2 de `normaliserHeures` (`worker-multi.ts`) : sans cela, « Yarın da aynısı » perdait le chantier d'hier (rendu « à choisir »). Le texte de l'assistant ne légitime jamais un chantier. |
| Si le modèle n'est pas disponible | L'historique n'est posé que si `aiDisponible` : sans clé, le lecteur local répond comme avant (jamais de saut qui laisserait la personne sans réponse). Une relance dont le modèle échoue donne l'erreur habituelle, pas la réponse du lecteur qui aurait été à côté. |
| Confidentialité, quota | Le texte de l'historique n'est **jamais** journalisé ni renvoyé (test statique : le seul `console.*` des deux fonctions est le message fixe « erreur interne »). Une demande reste une demande : un seul appel de quota, palier inchangé (il ne dépend que du fichier joint). Un client malveillant peut falsifier `history` : il n'obtient rien de plus que ce que ses propres droits permettent, les actions passent par les mêmes contrôles et la même carte de confirmation. |

**Évaluation** : le jeu passe de 109 à **126 phrases** (80 d'origine + 31 phrases longues + 15 suites) avec la catégorie « Suite de conversation » (`sc01`–`sc15` : 8 bureau, 5 salarié en français, 2 salarié en turc) et deux phrases LONGUES qui portent aussi un historique (`sl17`, `st14`). Chaque cas porte `history` (les messages d'avant) que le banc passe au **même** constructeur de consigne que la vraie fonction (`nettoyerHistorique` puis `sansDemandeRecollee`). Noms du jeu (Karim, Sofiane, Kevin ; pas de « Lucas »). `sc01` « Et Kevin aussi », `sc02` « Pareil mais lundi » (aujourd'hui du jeu est un jeudi : « jeudi » seul serait aujourd'hui), `sc03` « Non, retire ça » (retirer la case de Karim demain, ou une question ; jamais une nouvelle affectation), `sc04` « Combien d'heures sur ce chantier ? », `sc05` « Pareil pour Sofiane, pose-le en maladie » (saute le lecteur local), `sc06` « Et l'après-midi de 14h à 18h », `sc07` « Et pour la supprimer ? » (une question de guide, pas l'ordre de supprimer), `sc13` « Mets Karim demain, Villa Dupont » après la question « Sur quel chantier ? » (la réponse recollée à la demande : attendu l'**action**, jamais une réponse du genre « c'est déjà fait ») ; salarié : `sc08` « Et l'après-midi de 13h à 16h30 pareil » et `sc15` « Et l'après-midi de 13h à 16h30 » (une plage NUE, sans « pareil » : le chantier est celui de ce matin, Bureau Martin, pas celui du planning), `sc09` « et la pause c'était 30 minutes », `sc10` « Et Kevin ? » (collègues, date reprise de l'historique), `sc14` « Il y a une fissure au plafond, Villa Dupont » après « Sur quel chantier ? » (la réserve de la bonne ligne, pas une réponse) ; turc : `sc11` « Mola bir saatti. » (une seule ligne 08:00-17:00, pause 60), `sc12` « Peki ya dün? » (la réponse doit reprendre les 7 h 30 d'hier ; sa langue n'est pas contrôlée). **sc08 et sc15** : le matin n'est qu'un BROUILLON (`lignes_du_jour` est vide), donc deux lectures sont défendables et comptent toutes les deux : l'après-midi seul, OU le matin puis l'après-midi, dans les deux cas sur le chantier d'avant ; une seule ligne 07:30-16:30, un autre chantier ou un autre créneau échouent. **Phrases longues** : `sl17` « Et pareil demain de 8h à 16h30 avec une demi-heure de pause. » (français, signal « pause en lettres ») et `st14` « Yarın da aynısı. » (turc) : une ligne chez Bureau Martin demain, le chantier venant de la conversation (c'est le contrôle R2 qui le garde : voir « Profil long du salarié »). Les relances turques courtes restent en profil **court** (un seul indice de turc) : `tool-domains.test.ts` l'exige de tout cas dont l'id n'est pas `sl` / `st`, et la consigne courte répond en français (le turc complet passe par le profil long, cf. « Limites connues »). Mesure sur le vrai modèle : `POST /functions/v1/assistant-eval` avec `{ "version": "v2", "prodPath": true, "repeat": 3, "parallel": 1, "ids": ["sc01", …] }`.

### Limites connues

- **Branchements faits** (ils étaient listés ici « à brancher » avant la revue du serveur) : le bloc d'historique du profil long (`workerMultiPrompt`) et le passage de `snapshot.historique` aux outils des deux profils du salarié (`runWorkerTurn`).
- La date relative d'une relance (`dateAVenir`) ne regarde que la demande, pas la conversation : « Et Kevin aussi » reprend la date que le modèle donne.
- **Client « dit » strict** : un client que l'utilisateur n'a nommé que par UN mot (« chez Dupont ») n'est plus repris par une relance (« Et Kevin aussi ») : la carte demande le chantier. C'est voulu (le garde-fou ne doit pas s'affaiblir avec la conversation) ; le nom entier (« chez Villa Dupont ») est repris.
- **Une relance dont le modèle échoue** donne l'erreur habituelle (« Utilisez la saisie habituelle » côté salarié), pas la réponse du lecteur local, qui aurait été à côté pour une vraie relance. Pas de repli sur le lecteur local, volontairement : après les correctifs (villes à trait d'union, « aussi » avec un nom connu), les demandes complètes ne sautent plus ; restent « Je suis malade demain aussi » ou « Mets le panier aussi » après une conversation, lues par le modèle plutôt que localement (un peu plus lent, même résultat).
- **Plage horaire nue** : le lecteur local n'est écarté que si le dernier échange parle d'heures. « Plutôt 8h-12h » après une conversation sans rapport avec des heures est encore lu localement (« Intervention à Plutot ») : il n'y a rien à quoi la rattacher.
- **Réponse à une question** : seul le début de la question qui reprend les messages de l'utilisateur est retiré du bloc ; si l'écran change la façon de recoller la réponse (« demande, réponse »), `sansDemandeRecollee` doit suivre (test : `assistant-history.test.ts`).

### Tests

`npm run test:assistant-historique-serveur` (nettoyage, bloc, consignes identiques sans historique, **profil long** : consigne, outils et chantier dit plus haut, **câblage des outils** de `runWorkerTurn`, relances positives et négatives (villes à trait d'union, « aussi » + nom connu, plages horaires nues), **client « nommé »** (texte de l'assistant, un mot, message ancien), **demande recollée à sa réponse** (`sansDemandeRecollee`), lecteurs locaux, contrôles statiques, fonctions Edge de bout en bout), `test:assistant-eval` (126 phrases, 15 suites passées au même constructeur de consigne, sorties plausibles et mauvaises lectures, `sc08` / `sc15` à deux lectures), `test:assistant`, `test:assistant-actions`, `test:assistant-salarie`, `test:ia-domaines`, `test:saisie-profil`, `test:worker-turn`, `test:worker-multi`, `test:ai-provider`, `test:ia-config`.

**Mise en ligne** : redéployer `assistant` et `worker-assistant` (et `assistant-eval` pour mesurer). Aucune migration, aucun secret. Tant que les fonctions ne sont pas redéployées, elles ignorent la clé `history` : rien ne casse.

## J · Cache d'invites Anthropic (prompt caching)

**Pourquoi** : l'assistant du bureau, celui du salarié (profils court et long) et la boucle de lectures envoient à chaque question une longue partie identique (outils + consigne + guide, de 2 300 à 6 000 jetons) puis les données du moment. L'API relit à tarif réduit (0,1x, soit 0,20 $/M au lieu de 2 $/M sur Sonnet 5.5) un préfixe identique octet pour octet ; l'écriture coûte 1,25x la première fois.

**Comment** (code : `_shared/ai-anthropic.ts`, `messageUtilisateur`, `blocSysteme`) : ordre du cache de l'API = outils, puis `system`, puis messages. Deux marqueurs `cache_control: {type: 'ephemeral'}` (5 minutes, renouvelées à chaque lecture) : fin de `system` (couvre aussi les outils) et fin du bloc `stable` du message. `stable` = début EXACT du prompt, rendu par `actionPromptParts` (bureau), `workerFunctionPromptParts` (salarié court) et `workerMultiPromptParts` (salarié long) : consigne + règles + GUIDE, sans date, sans nom, sans donnée. Ce qui varie (date du jour, calendrier, salariés, chantiers, snapshot, historique, question) vient après, dans un second bloc sans marqueur. Un fichier joint : pas de marqueur dans le message (le fichier précède le texte et change). Le prompt est le même texte qu'avant, seulement réordonné : consigne et GUIDE d'abord, puis la date, le calendrier et les données (avant : le calendrier venait avant le GUIDE, et la date ouvrait la consigne du salarié). Gemini reçoit le même texte, sans champ de cache.

**Seuil** : 512 jetons minimum pour Sonnet 5.5 (en dessous l'API ignore le marqueur sans erreur) ; les préfixes réels font environ 2 300 (salarié court) à 6 000 (bureau) jetons. **Durée** : 5 minutes par défaut ; `CACHE_TTL = '1h'` (ai-anthropic.ts) passe à 1 heure (écriture à 2x), utile seulement si le trafic est plus espacé que 5 minutes. Le préfixe est le même pour toutes les entreprises (aucune donnée dedans) : le trafic de tous les clients entretient la même entrée de cache.

**Mesurer** : (1) journaux des fonctions `assistant` / `worker-assistant` : une ligne par appel `[ai] usage claude-sonnet-5-5 entree=… cache_ecrit=… cache_lu=… sortie=…` (nombres seulement) ; (2) réponse de `assistant-eval` : `cache` = `{essais, essaisAvecLecture, jetons: {entree, nonCaches, cacheEcrit, cacheLu, sortie}, partLue}` ; (3) console Anthropic : usage par clé, colonnes « cache read » / « cache write ». Bon signe : `cache_lu` élevé dès la 2e demande dans les 5 minutes, `partLue` de 70 % ou plus en régime continu.

**Test** : `npm run test:ai-anthropic` (préfixe identique octet pour octet entre deux entreprises, deux jours, deux questions ; rien de variable avant le marqueur ; fichier = pas de marqueur ; usage lu et journalisé), `test:boucle`, `test:worker-turn`. L'étalon `registre/avant-3b1.snapshot.json` a vu ses empreintes `prompt` recalculées (réordonnancement) ; ses empreintes d'outils, de réponses et de GUIDE (bureau `5766f6e9…3198`) sont inchangées.

**Mise en ligne** : redéployer `assistant`, `worker-assistant` et `assistant-eval`. Aucune migration, aucun secret.

## Prod

Lot 7 : migrations `20261001090000_lot7_assistant_journal.sql`, `20261001100000_lot7_collegues_documents.sql`, puis `assistant` et `worker-assistant`.
Lot 6 (couche IA v2) : voir « Mise en ligne » dans la section 0 (migration d'abord, puis les 4 fonctions).
