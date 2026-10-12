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
| date non ISO en turc (« dün », « bugün », « yarın », `30.09`) | lue ; sinon « Date illisible » (jamais un repli silencieux sur aujourd'hui) |
| action non demandée (consigne cachée dans un nom de chantier) | un indice lexical est exigé dans la phrase pour chaque annexe (panier, réserve, congé, envoi) |
| plus de 4 actions | les appels écartés sont comptés et dits (« Autres actions »), les familles demandées et absentes sont listées (« Non préparé »), « Lecture rapide : vérifiez que tout y est » |

La réponse est une fiche `multi` : éléments dans l'ordre chantier → heures → panier → réserve → congé → envoi, **rien n'est enregistré avant « Tout confirmer »** (y compris les gestes « directs » du lot 7,
qui en profil long ne s'exécutent pas seuls). Les suppressions, copies et modifications de ligne ne sont jamais dans une fiche (elles gardent leur propre confirmation). Le chantier est créé à la confirmation
seulement, après avoir cherché un chantier actif de même nom + ville ; « Annuler » retire les lignes d'heures créées, le chantier reste (le salarié ne peut pas le supprimer).

### Limites connues

- Cartes, boutons et libellés restent en **français** ; seule la réponse libre suit la langue du salarié (turc ou français). Les textes pour le bureau (travaux, note de congé, détail de réserve) sont écrits en français.
- Dictée turque : dépend du navigateur (Chrome : `tr-TR` ; Safari iOS : selon la langue de dictée installée). À essayer sur un appareil réel avant la mise en ligne.
- En profil long, pas de repli local : ces phrases dépendent à 100 % du modèle (Gemini gratuit : 429/503 possibles). L'écran remet la phrase dans le champ si le modèle échoue.
- Autres langues que le turc : traitées comme du français.
- **Données personnelles** : une phrase comme celle d'Ergun contient le prénom, le nom et l'adresse d'un client particulier. Ces données partent chez Google (formule gratuite : réutilisables par Google), sont écrites dans
  `worksites` (lisibles par tous les salariés de l'entreprise) ; le journal ne garde que « Chantier créé » et la ville. **Avant d'ouvrir le turc et les clients particuliers à de vrais salariés** : formule payante
  sans réutilisation des données, et mention dans la politique de confidentialité. Aucun journal ne contient le texte ni les arguments (test statique).
- La colonne `worksites.postal_code` n'est créée par aucune migration du dépôt : à confirmer en production (lecture seule) avant la mise en ligne ; le code ne dépend pas de son existence.

### Mesure (Cowork), avant toute mise en ligne

Le jeu compte maintenant **107 phrases** : les 80 d'origine (47 bureau + 33 salarié, inchangées) + **27 phrases longues du salarié** (`sl01–sl16` « Long FR », `st01–st11` « Long TR », dont la phrase exacte d'Ergun en `sl01`).
Les cas d'heures d'aujourd'hui sont mesurés sur une journée vide (`live: 'vide'`). Banc : `POST /functions/v1/assistant-eval` avec `{ "version": "v2", "prodPath": true, "repeat": 3, "parallel": 1, "ids": [...] }` —
`prodPath` = le chemin exact des clients (aucun nouvel essai après une erreur du fournisseur) ; `repeat` = 3 passes par cas (le modèle n'est plus à température fixe) ; **au plus 4 ids par appel avec `repeat: 3`, ou 12 avec
`repeat: 1`**, un par un (la clé gratuite est partagée avec la production ; la durée maximale d'une fonction n'a pas été vérifiée : réduire les lots au besoin). 200 ids au plus, un id inconnu est refusé.
Seuils : les 80 anciennes phrases ≥ 97,5 % (234 réussites sur 240 essais, aucun cas qui passait avant et échoue 3/3) ET les 27 nouvelles ≥ 97,5 % (79/81, aucun cas en échec 3/3), les 27 comptant toutes. Le rapport donne
par catégorie, par profil (court/long), la médiane et le maximum des temps, la cause de chaque échec (`fournisseur` ou `modèle ou code`) et le nombre de réponses du modèle de secours.
Tests sans modèle : `npm run test:saisie-profil`, `test:worker-multi`, `test:worker-turn`, `test:assistant-eval`, `test:ai-provider`, `test:ia-config`, `test:ia-domaines`.

**Mise en ligne** : le front d'abord, puis `worker-assistant` (et `assistant-eval` pour mesurer). Aucune migration, aucun secret, `assistant`, `payslip-read` et le bureau ne changent pas.

## Prod

Lot 7 : migrations `20261001090000_lot7_assistant_journal.sql`, `20261001100000_lot7_collegues_documents.sql`, puis `assistant` et `worker-assistant`.
Lot 6 (couche IA v2) : voir « Mise en ligne » dans la section 0 (migration d'abord, puis les 4 fonctions).
