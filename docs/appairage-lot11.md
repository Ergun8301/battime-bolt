# Appairage de la tablette en un seul geste (lot 11 du plan IA)

La tablette affiche un QR et un code de vérification. Le patron scanne le QR
avec son téléphone, touche le même code parmi quatre, et la tablette se relie
toute seule, **dans l'icône installée sur l'iPad** (c'est elle qui reçoit son
jeton). Le code à 6 chiffres, le lien `/borne?code=` et le QR de la fenêtre
« Borne » du bureau restent le **secours**, inchangés.

Ce fichier décrit la partie **données et fonction** (migration, fonction
`kiosk`, règles pures, tests, mise en ligne, limites). Les écrans (tablette,
fenêtre « Associer cette tablette ? », fenêtre « Borne ») ont leur propre partie.

## Comment ça marche (appairage initié par l'appareil, comme une télévision)

1. **`pair_request`** (la tablette, sans compte). La fonction rend un
   *identifiant de demande* **signé** (HMAC, 10 min) et, la première fois, un
   *secret d'appareil* aléatoire de 256 bits. **Rien n'est écrit en base** :
   une route publique qui écrirait grossirait sans fin, et on ne supprime rien
   (voir « Croissance »). Le QR contient `/admin#borne=<identifiant>` ; le
   fragment (`#`) ne part jamais vers un serveur.
2. **`pair_lookup`** (le bureau). Le patron connecté (administrateur actif de
   son entreprise, jamais le compte support) ouvre le lien : la fonction rend
   le nom de **son** entreprise, l'âge du QR et **quatre codes** (le vrai et
   trois leurres). Lecture seule, aucun effet.
3. **`pair_confirm`** (le bureau). Le patron touche le code affiché sur SA
   tablette. Bon code : une ligne dans `kiosk_pair_approvals`. Mauvais code :
   la demande est **brûlée** (la tablette en affiche une neuve en quelques
   secondes). « Non, ce n'est pas ma tablette » : `decline`, même effet. Cette
   action **ne crée aucune tablette et ne révoque rien**.
4. **`pair_status`** (la tablette, avec identifiant ET secret d'appareil). Tant
   que personne n'a confirmé : `pending`. Après la confirmation : la ligne
   `kiosks` est créée **à ce moment-là** (même fabrication que le code à 6
   chiffres : `createTablet`, même règle « la dernière tablette gagne » qui
   révoque les autres tablettes de l'entreprise, jamais le QR fixe) et la
   tablette reçoit **les mêmes clés que `pair`** (`kiosk_id`, `token`, `seed`,
   `step`, `digits`, `kiosk_name`, `company_name`, `settings`) : l'écran réutilise
   le même stockage.

Réponses de `pair_status` : `pending`, `approved`, `expired`, `cancelled`,
`used`, `suspended` (borne coupée par BEMEXO : rien n'est consommé, la tablette
continue de demander et la remise réussit une fois la borne rallumée).

### Pourquoi ces choix (écarts avec le détail du lot, à connaître)

- **La table ne contient pas les demandes mais les approbations.** Une ligne =
  une confirmation, un refus ou un mauvais code d'un administrateur
  authentifié. Sans `DELETE` possible, une table remplie par une route publique
  non authentifiée grossirait sans fin, et l'adresse du client est falsifiable.
- **La ligne `kiosks` est créée à la remise du jeton**, pas à la confirmation :
  sinon la confirmation révoquerait l'ancienne tablette alors que la nouvelle
  n'a peut-être jamais reçu son jeton, et l'entreprise se retrouverait sans
  tablette.
- **Le jeton est dérivé** : `base64url(HMAC(clé serveur, 'bemexo-pair-token|' +
  identifiant + '|' + secret d'appareil))` (43 signes, comme aujourd'hui ;
  seule son empreinte SHA-256 va dans `kiosks.token_hash`). La **remise est
  rejouable** 3 min : si la réponse HTTP se perd (wifi de chantier, iPad en
  veille), la tablette redemande, le serveur retrouve la ligne par l'empreinte
  du jeton recalculé et rend le même jeton et la même graine, sans créer de
  deuxième tablette ni laisser une ligne orpheline.
- **Le code de vérification est stable pendant tout un épisode** : il vient de
  l'empreinte du secret d'appareil (pas du nonce de la demande) et la tablette
  renvoie son secret à chaque renouvellement du QR. Les trois leurres et la
  place du vrai sont aussi calculés de cette empreinte : on ne peut pas les
  éliminer en comparant plusieurs appels, et le patron qui a scanné l'ancien QR
  retrouve les mêmes quatre codes.
- **Le patron touche le bon code parmi quatre** (distance de Hamming ≥ 3 entre
  les codes, alphabet de 27 signes sans `0 O 1 I L U S Z B`).

## Fonction `kiosk` (supabase/functions/kiosk/index.ts)

| Action | Qui | Effet |
|---|---|---|
| `pair_request` | tablette, sans compte | identifiant signé de 10 min (+ secret d'appareil la première fois) ; n'écrit rien |
| `pair_status` | tablette, identifiant + secret | `pending` / `approved` (jeton + graine) / `expired` / `cancelled` / `used` / `suspended` |
| `pair_lookup` | administrateur | entreprise de l'appelant, 4 codes, âge, tablette actuelle (`replaces`) ; lecture seule |
| `pair_confirm` | administrateur | confirme (`code`, `confirm: true`, `replace: true` si besoin) ou refuse (`decline: true`) |

Ordre des contrôles des deux actions du bureau : jeton (`401 Non authentifié`)
→ rôle administrateur actif (`403 Réservé à l'administrateur`) → borne allumée
(`403 kiosk_disabled`) → **garde support** (`403 support_readonly`) → plafond
de l'entreprise → forme et signature de l'identifiant → demande déjà
confirmée/refusée → le reste. Un compte BEMEXO Support « entré » chez un client
reste `role = 'admin'` de sa propre entreprise : seule une lecture de
`support_staff` côté serveur l'arrête (le mode support ne change que le
`company_id` affiché dans le navigateur). Ce garde ne couvre que les nouvelles
actions ; `create_pairing`, `revoke`, `settings` et `fixed_*` n'en ont pas
(défaut préexistant, à traiter dans un lot à part).

**Second geste « Remplacer la tablette en service »**, imposé par le serveur :
si la tablette actuelle de l'entreprise a été vue il y a moins de 15 min,
`pair_confirm` répond `409 replace_required` tant que le corps ne porte pas
`replace: true` (rien n'est écrit, la demande reste confirmable). Sans
tablette, ou avec une tablette muette, un seul geste suffit.

Autres décisions :
- `company_id` et l'administrateur viennent **toujours de la base** (le profil
  de l'appelant), jamais du corps de la requête.
- Réponses `200 {"available": false}` (jamais d'erreur) tant que la migration
  manque ; `pair_request` ne répond `available: true` qu'après lecture réussie
  des **deux** tables. Une action inconnue reste `400 {"error":"Action inconnue"}`
  sans champ `code` (l'écran en dépend).
- `Cache-Control: no-store` sur toutes les réponses.
- **Journaux** : seulement `error.code`. Jamais le corps, l'identifiant de
  demande, le secret d'appareil, le code, le jeton ni la graine. Aucun
  `DELETE` : la clé service n'a pas ce droit sur les nouvelles tables.
- `pair` (code à 6 chiffres) n'a pas changé de comportement ; `createTablet` a
  été extrait de lui sans changer l'ordre ni les règles, et un jeton aléatoire
  y est toujours tiré.

### Plafonds de débit (sans lien avec le compteur du code à 6 chiffres)

Table `kiosk_pair_throttle`, un « seau » par empreinte HMAC (aucune adresse
gardée, 4 096 lignes au plus, réécrites toutes les 10 min, rien à purger) :

- `pair_request` : **30 par seau d'adresse et par 10 min** (`cf-connecting-ip`,
  sinon le premier `x-forwarded-for`). Sans adresse lisible, **aucun plafond
  d'adresse** : la sécurité de cette voie n'en dépend pas, et un en-tête absent
  ne doit pas bloquer toutes les tablettes.
- `pair_lookup` + `pair_confirm` : **20 par seau d'entreprise et par 10 min**.
- Espaces séparés : seaux 0 à 2047 = demandes anonymes ; 2048 à 4095 =
  opérations du bureau. Un déluge de demandes anonymes ne peut donc jamais
  bloquer un patron.
- `pair_status` n'est pas plafonné (il est peu coûteux et authentifié par le
  secret). Ni `pair_request` ni `pair_status` ne lisent ou n'écrivent
  `kiosk_pair_failures` : les 60 échecs globaux du code à 6 chiffres ne les
  bloquent pas, et inversement.

## Migration

Fichier : `supabase/migrations/20261013090000_lot11_appairage_un_geste.sql`
(nom d'enregistrement `lot11_appairage_un_geste`, **jamais `db push`**).
100 % additive : deux tables neuves, **RLS activée, aucune policy**, aucun droit
pour `anon` ni `authenticated`, et la clé service n'a **que** `SELECT`, `INSERT`
et `UPDATE` (ni `DELETE`, ni `TRUNCATE`, ni `REFERENCES`, ni `TRIGGER`). Aucune
fonction SQL, aucune clé étrangère (les colonnes `company_id`, `approved_by`,
`kiosk_id` sont de simples `uuid` : une clé sans `ON DELETE` bloquerait la
suppression d'une entreprise ou d'un compte). Après retrait des commentaires,
le fichier ne contient aucun `DROP`, `DELETE`, `TRUNCATE`, `CASCADE`, `ON DELETE`.

| Table | Contenu |
|---|---|
| `kiosk_pair_approvals` | une ligne par demande **confirmée ou refusée** : empreinte SHA-256 de l'identifiant (clé primaire = usage unique), empreinte tronquée du secret, entreprise et administrateur (venus de la base), dates de confirmation / refus / remise, tablette créée. Aucun secret en clair. |
| `kiosk_pair_throttle` | `bucket` (0 à 4095), `hits`, `window_start` : le plafond de débit. Ni adresse, ni entreprise. |

À faire par Cowork : coller le fichier dans l'éditeur SQL, lancer le bloc
**VÉRIFICATION** de l'en-tête (une ligne, **10 × true**), puis inscrire
l'historique sous le même nom (`INSERT INTO supabase_migrations.schema_migrations
(version, name) VALUES ('20261013090000', 'lot11_appairage_un_geste') ON CONFLICT
DO NOTHING;`). `npm run check:migrations` doit la lister « à appliquer » tant que
ce n'est pas fait. Retour arrière : le bloc commenté de l'en-tête (efface la
trace des appairages par QR ; à ne faire que si on est sûr). Les tablettes déjà
reliées ne sont pas touchées, et sans les tables la fonction répond
« indisponible » : la tablette retombe sur le code à 6 chiffres.

### Croissance des tables (pas de purge, `DELETE` exclu)

- `kiosk_pair_throttle` : 4 096 lignes au plus, réécrites ; ne grossit pas.
- `kiosk_pair_approvals` : une ligne par confirmation/refus d'un administrateur
  **authentifié**, plafonné à 20 opérations par 10 min et par entreprise, soit
  au pire **2 880 lignes par jour et par entreprise** (≈ 150 octets chacune,
  ≈ 430 Ko par jour) si un client malveillant s'acharne ; en usage normal, une
  poignée par an. Toute purge future demandera une décision explicite d'Ergun.

## Ordre de mise en ligne (chaque ordre intermédiaire est sans casse)

**Migration → front → fonction `kiosk`** (par fichier-pointeur).

| État | Effet |
|---|---|
| Migration seule | rien ne l'utilise |
| Migration + front, fonction ancienne | chaque tablette non appairée fait **un** `pair_request` par chargement → `400 Action inconnue` → écran actuel, sans message, plus aucun appel |
| Fonction nouvelle, migration absente | les 4 actions répondent `200 {available:false}` ; la tablette se tait |
| Fonction nouvelle, front ancien | aucun appel de la voie nouvelle |
| Tout en place | voie complète |

Fichiers à emporter avec `supabase/functions/kiosk/index.ts` : `_shared/kiosk-code.ts`,
`kiosk-rules.ts`, `fixed-qr.ts`, `kiosk-board.ts`, `live-place.ts` et, **nouveau,
`_shared/kiosk-pair.ts`**. Déploiement inchangé (`--no-verify-jwt`). Aucun
secret à ajouter (`KIOSK_SECRET`, sinon la clé service, servent déjà ; la
changer n'annule que les demandes en cours, 10 min). Retour arrière : redéployer
l'ancienne fonction (la tablette retombe sur le code) ; la migration peut rester.

## Ce qui est protégé, et ce qui ne l'est pas

Le rapprochement « toucher le bon code parmi quatre » protège contre le **clic
réflexe** (lien envoyé par SMS, faux QR collé près de la tablette, page piégée)
de quelqu'un qui **ne connaît pas** le code : il doit regarder SA tablette. Il
ne protège **pas** contre :

- un tiers qui fait tourner un faux écran de tablette (il appelle lui-même
  `pair_request`, donc connaît son code) et qui envoie au patron « touchez
  K7M 4QX » ;
- la photo du QR d'une vraie tablette (la photo contient le code).

Dans ces cas l'attaquant recevrait le jeton, la graine, le planning de la
semaine (prénoms, chantiers) et le QR de pointage tournant de l'entreprise, et
la vraie tablette serait révoquée. Mesures retenues : le second geste serveur
« Remplacer la tablette en service » (tablette actuelle vue il y a moins de
15 min), l'âge du QR et le nom de l'entreprise dans la fenêtre du patron, 10 min
de vie et usage unique, le nom de l'entreprise sur la tablette reliée et son
appui long qui la déconnecte.

## Limites connues

- **Admin d'une autre entreprise** : un administrateur qui photographie le QR
  d'une tablette non appairée peut la relier à SA propre entreprise. Aucune
  donnée de l'entreprise victime ne fuit ; l'appairage est à refaire.
- **Brûler une demande** : un administrateur qui a le QR d'une tablette peut
  l'annuler en se trompant exprès de code ; la tablette affiche un nouveau QR en
  3 s. Borné à 20 opérations par 10 min et par entreprise.
- **Seau partagé** : deux entreprises dont l'empreinte tombe dans le même seau
  (1 chance sur 2 048) partagent un compteur de 20 ; un client malveillant
  pourrait gêner 10 min l'appairage par QR d'une autre entreprise tombée dans
  son seau. Le secours (code à 6 chiffres) reste disponible.
- **Adresse du client** : `cf-connecting-ip` / `x-forwarded-for` n'ont pas été
  vérifiés sur la plateforme (la sécurité de cette voie n'en dépend pas).
  Conséquence possible : un tiers qui connaît l'adresse publique d'un magasin
  peut bloquer 10 min le QR de ses tablettes (elles retombent sur le code à 6
  chiffres, sans message).
- **Tablette en veille** : si l'écran s'éteint pendant l'attente, la tablette ne
  sonde plus ; si le patron confirme entre-temps, la remise reste possible
  jusqu'à 3 min après l'expiration de l'identifiant (4 min au minimum). Au-delà,
  la fenêtre du patron le dit (« La tablette n'a pas répondu… ») ; rien n'est
  cassé, l'ancienne tablette n'est révoquée qu'à la remise.
- **Fragment `#borne=`** : retiré de la barre d'adresse dès le premier rendu de
  `/admin`. S'il part dans GA4 avant ce retrait, il ne donne rien (sans le
  secret d'appareil, l'identifiant ne rend aucun jeton, et il expire en 10 min).
- **Compte BEMEXO Support** : le garde refuse aussi un compte à la fois support
  et administrateur de sa propre entreprise.

## À vérifier par Cowork après la mise en ligne (sans toucher aux données de production)

1. L'en-tête qui donne l'adresse du client (`cf-connecting-ip`, puis
   `x-forwarded-for`) sur la plateforme.
2. Si GA4 reçoit `/admin#borne=` ; exclusion à poser dans l'analytics
   (`public/cookies/bemexo-consent.js`, hors de ce lot).
3. Poser `frame-ancestors` et la politique de référent chez l'hébergeur (aucun
   fichier d'en-têtes dans le dépôt).
4. Le compte BEMEXO Support de production : confirmer qu'il est `admin` dans
   `users` (le garde l'arrête quel que soit son rôle, par `support_staff`).

## Tests de cette partie

| Commande | Ce qu'elle couvre |
|---|---|
| `npm run test:appairage` | règles pures (`kiosk-pair.ts`) : alphabet, code de vérification, identifiant signé, leurres, seaux, messages, expression du fragment identique à celle du bureau |
| `npm run test:kiosk-fonction` | la fonction de bout en bout contre une base simulée : avant la migration, nominal, rejeu, usage unique, concurrence, secret d'appareil, expiration (horloge simulée), rôles et mode support, borne coupée, remplacement, plafonds, secrets absents des journaux et de la base, aucun `DELETE` |
| `npm run test:appairage-db` | la migration sur PGlite : additive, rejouable, droits, contraintes, `10 × true`, retour arrière puis rechargement |
| `npm run test:kiosk` | règles de la borne : inchangé |
