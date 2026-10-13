# Appairage de la tablette en un seul geste (lot 11 du plan IA)

La tablette affiche un QR et un code de vérification. Le patron scanne le QR
avec son téléphone, touche le même code parmi quatre, et la tablette se relie
toute seule, **dans l'icône installée sur l'iPad** (c'est elle qui reçoit son
jeton). Le code à 6 chiffres, le lien `/borne?code=` et le QR de la fenêtre
« Borne » du bureau restent le **secours**, inchangés.

Ce fichier décrit les **trois parties** : les écrans (tablette, fenêtre
« Associer cette tablette ? », fenêtre « Borne » du bureau), puis les données et
la fonction (migration, fonction `kiosk`, règles pures), puis les tests, la mise
en ligne, ce qu'il faut essayer sur iPad et les limites.

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

## Les écrans

### La tablette (`/borne` non reliée)

L'écran affiche, sous le logo, un **grand QR** (noir sur blanc, jamais inversé),
le **code de vérification** (`K7M 4QX`, lettres et chiffres lisibles à 1 m) et
l'état « En attente de votre confirmation sur le téléphone… ». Le **code à
6 chiffres est le secours**, replié sous le QR (« Pas de téléphone sous la main ?
Taper un code à 6 chiffres ») : même champ, même bouton « Relier », mêmes
phrases qu'avant.

- Paysage : QR à gauche, titre, consigne, code et état à droite. Portrait et
  téléphone : une seule colonne. Le QR est visible sans défiler en 1280×800,
  1024×768 et 768×1024 ; à hauteur réduite (clavier à l'écran), l'écran
  **défile** (avant, il était coupé).
- Le QR **ne passe jamais devant les doigts** : si quelqu'un tape un code
  (moins de 20 s depuis la dernière frappe), le QR attend ; il apparaît ensuite,
  le secours s'ouvre et la saisie est gardée. Le champ perd le focus quand le QR
  apparaît (le clavier de l'iPad cacherait la moitié du QR).
- Le QR est renouvelé 60 s avant sa fin (10 min de vie), **avec le même secret
  d'appareil** : le code de vérification ne change pas. La tablette interroge
  `pair_status` toutes les 3 s pendant 3 min, puis toutes les 8 s ; rien
  quand l'onglet est caché ou hors ligne ; reprise immédiate au retour.
- **30 min sans toucher l'écran** : plus de renouvellement, le dernier QR
  s'éteint à sa fin (« Ce QR n’est plus actif. » + « Afficher un nouveau QR »).
  Environ 350 appels par épisode de 30 min, puis plus rien (quota Supabase Free).
- Écran allumé tant que le QR attend (verrou d'écran). Le plein écran au premier
  toucher ne change pas.
- Borne coupée par BEMEXO pendant l'attente : « Borne suspendue pour votre
  entreprise. La liaison reprendra dès qu’elle sera réactivée. », rien n'est
  effacé, la liaison aboutit une fois la borne rallumée.
- **Repli sans un mot** : fonction ou migration pas encore en ligne (`400 Action
  inconnue`, `404`, `501`, `available:false`), ou deux `5xx` de suite sur le
  sondage → la tablette garde **exactement** son écran d'avant (code à
  6 chiffres), sans message, et ne rappelle plus rien jusqu'au rechargement.
  Réseau coupé, `429`, `5xx` sur la demande : écran d'avant, nouvel essai après
  5 s, 15 s puis 60 s (60 s pour un `429`), et tout de suite au retour du réseau.
- `/borne?code=123456` (lien ou QR de la fenêtre « Borne ») : **aucune** demande
  de QR, comportement du lot précédent inchangé.
- Tablette déconnectée par le bureau : le bandeau dit « … Tapez un nouveau code
  pour la relier. » (texte d'avant) ou « … Scannez le QR pour la relier de
  nouveau. » quand le QR est affiché.
- Le **secret d'appareil ne vit qu'en mémoire** de la page : jamais dans le
  stockage, l'adresse, une trace ou le QR. Recharger la page = nouvelle demande,
  nouveau secret, nouveau code, aucun dégât.

### Le bureau : la fenêtre « Associer cette tablette ? »

Le QR ouvre `/admin#borne=<identifiant>`. **Le patron scanne avec l'appareil
photo, donc dans le navigateur par défaut de son téléphone, et il y est le plus
souvent déconnecté** : c'est le cas normal.

1. `/admin` garde le fragment (`sessionStorage`, clé `bx_borne_req`, 10 min,
   propre à l'onglet), le **retire de la barre d'adresse tout de suite**, puis
   renvoie vers `/connexion` comme d'habitude.
2. Le patron se connecte ; le tour habituel le ramène sur `/admin` **dans le même
   onglet** : la mémoire est là, la fenêtre s'ouvre.
3. Elle montre **le nom de son entreprise** (donné par le serveur), l'âge du QR
   (« QR affiché il y a 2 min ») et **quatre codes**. Il touche celui qu'affiche
   sa tablette : c'est la confirmation (un seul geste).
4. Tablette actuelle **en service** (vue il y a moins de 15 min) : avertissement
   rouge « ⚠ La tablette actuelle est en service (vue il y a 3 min). Elle sera
   déconnectée. », et toucher un code ouvre le panneau « Remplacer la tablette en
   service ? » ; rien n'est envoyé avant le bouton « Remplacer la tablette en
   service » (le serveur l'impose aussi). Tablette muette depuis longtemps : un
   seul geste, avec « La tablette actuelle (vue il y a 2 h) sera déconnectée. ».
5. Après la confirmation, la fenêtre **vérifie de bout en bout** : elle relit les
   tablettes (lecture sous RLS, toutes les 3 s, 30 s au plus, aucun appel à la
   fonction) et dit « Tablette reliée. » ou « La tablette n’a pas répondu :
   réveillez-la, sinon scannez de nouveau son QR. ». Si la lecture est
   impossible, le texte de confirmation reste seul.
6. Les refus du serveur sont affichés **mot pour mot** (QR expiré, déjà servi,
   mauvais code, trop d'essais, borne coupée, compte support, `401`
   « Non authentifié », `403` « Réservé à l'administrateur »). « Non, ce n’est
   pas ma tablette » refuse la demande. Échap et ✕ ferment.
7. **Compte BEMEXO Support** (mode lecture seule) : la fenêtre refuse sans
   aucun appel, avec le texte du compte support.
8. Un salarié qui scanne atterrit sur son espace : la mémoire expire seule. Sans
   fragment, **zéro appel supplémentaire** et rien de téléchargé en plus (la
   fenêtre est chargée à la demande).

La fenêtre défile et garde 96 px de marge en bas à 390 px : la bannière cookies
du site (fixe, en bas) ne masque pas les boutons.

### Le bureau : la fenêtre « Borne »

- **Tablette déjà reliée** : plus de code à l'ouverture. La fenêtre dit « Si la
  tablette affiche un QR, scannez-le avec votre téléphone : c’est le plus
  simple. » et propose **« Relier une autre tablette »** ; ce bouton crée le code
  (avant, un code était créé à **chaque ouverture**, et la tablette qui le
  tapait remplaçait l'ancienne sans que personne l'ait décidé).
- Sans tablette, ou si la lecture des tablettes échoue : le code s'affiche comme
  avant, avec une ligne d'introduction conditionnelle (la fenêtre ne sait pas si
  la fonction `kiosk` est déjà à jour et ne fait aucun appel pour le savoir) et la
  légende du petit QR devient « Secours : à scanner avec la tablette ».
- Pendant la première lecture des tablettes, le bloc du code est en attente
  (`···`), sans appel.
- Quand une tablette neuve apparaît pendant que le code est affiché : toast
  « Tablette reliée », l'ancienne est déconnectée (secours inchangé), le code
  inutilisé est périmé et la fenêtre se replie.
- Mode support : aucun code, « Mode support : lecture seule, impossible de relier
  une tablette. ».

## Tester sur téléphone (entreprise fictive uniquement)

Le parcours qui compte est celui du patron **déconnecté** :

1. Sur la tablette (ou un deuxième ordinateur), ouvrir `/borne` non reliée : le QR
   et le code s'affichent.
2. Sur le téléphone, avec l'appareil photo, scanner le QR : le navigateur ouvre
   `/admin#borne=…`, puis `/connexion` (l'adresse n'a plus de fragment).
3. Se connecter avec le compte du patron de l'entreprise de test : retour
   automatique sur « Associer cette tablette ? », avec le nom de l'entreprise.
4. Toucher le code affiché sur la tablette : « C’est confirmé… », puis
   « Tablette reliée. » dans les secondes qui suivent ; la tablette affiche son
   planning.
5. Se tromper exprès de code : le message du serveur, et la tablette affiche
   un nouveau QR toute seule.

Déjà connecté dans ce navigateur : mêmes étapes sans la connexion.

## À tester sur iPad

À faire avec une entreprise fictive, une tablette de test et le téléphone du
patron de test :

1. **iPad, icône installée, borne non reliée** : le QR et le code de
   vérification s'affichent sans clavier à l'écran, lisibles à 1 m, en paysage
   **et** en portrait.
2. **Téléphone du patron déconnecté** (le cas normal) : scan → connexion → retour
   automatique sur « Associer cette tablette ? » (le fragment a survécu) ;
   toucher le bon code → la tablette affiche son planning en moins de 10 s,
   **dans l'icône** (fermer et rouvrir l'icône : toujours reliée) ; la fenêtre du
   téléphone dit « Tablette reliée. ».
3. Même chose, téléphone **déjà connecté** dans ce navigateur.
4. Toucher un mauvais code : message ; la tablette affiche un nouveau QR toute
   seule (même code de vérification).
5. **Écran de l'iPad qui se verrouille** pendant l'attente (verrouillage auto à
   2 min) : au réveil, le QR est valable ou renouvelé, sans manipulation.
   **Confirmer depuis le téléphone pendant que l'iPad est verrouillé** : au
   réveil l'iPad se relie (ou la fenêtre du téléphone a dit « La tablette n’a
   pas répondu »).
6. **Laisser la tablette 30 min** sur le QR : « Ce QR n’est plus actif. » +
   « Afficher un nouveau QR ».
7. **Tablette déjà reliée et vivante** : la fenêtre « Borne » du bureau
   n'affiche plus de code tant qu'on ne touche pas « Relier une autre tablette » ;
   scanner le QR d'une seconde tablette de test demande le second geste
   « Remplacer la tablette en service ».
8. **Secours** : le code à 6 chiffres et le lien `/borne?code=` fonctionnent
   comme avant.
9. **Borne coupée par BEMEXO** pendant l'attente : « Borne suspendue… », rien
   n'est effacé ; rallumée, la liaison aboutit.
10. **Mode support** : la fenêtre refuse avec le message du compte support.

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
- **Le scan ouvre le navigateur par défaut du téléphone**, pas l'appli installée :
  le cas normal est un patron déconnecté, qui se connecte puis revient sur la
  fenêtre (c'est le parcours central des essais). Un lien « mot de passe oublié »
  ouvert dans un autre onglet fait perdre la demande : le patron rescanne.
  Proposition à Ergun, hors lot : un bouton « Scanner la tablette » dans la
  fenêtre « Borne » (`components/qr-scanner.tsx` existe déjà) pour les patrons
  déjà dans l'appli installée.
- **Navigation privée** : sans `sessionStorage`, le fragment n'est pas gardé, la
  fenêtre ne s'ouvre pas après la connexion et le patron rescanne.
- **Guide « bureau-borne »** (`_shared/admin-tours.ts`, non modifié) : ses ancres
  `bureau-borne.code` et `bureau-borne.deconnecter` étaient déjà absentes fenêtre
  fermée ; avec une tablette reliée, `bureau-borne.code` est maintenant absente
  aussi fenêtre ouverte (le code est replié).
- Le toast « Tablette reliée » peut s'afficher deux fois si la fenêtre « Borne »
  (sondage de 5 s) et la fenêtre « Associer » sont ouvertes dans le même onglet.
- Le texte « Confirmé. Connexion de la tablette… » prévu pour la tablette n'est
  jamais visible : la tablette passe au planning dès qu'elle a son jeton, c'est
  le retour que voit le patron.
- Poids du site : « First Load JS shared by all » passe de 87,8 à 88 kB (la
  table des morceaux chargés à la demande, pour la fenêtre « Associer ») ; aucune
  autre page ne grossit.

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
| `npm run build` puis `npm run test:appairage-ecrans` | les écrans, navigateur réel, fonction `kiosk` simulée : le QR et le code de la tablette, le sondage (3 s puis 8 s, rien onglet caché), la saisie en cours, le renouvellement à code stable, `expired` / `cancelled` / `used` / `suspended`, l'arrêt à 30 min, tous les replis silencieux, `?code=`, les bandeaux « déconnectée », la hauteur réduite, le verrou d'écran ; la fenêtre « Associer cette tablette ? » (4 codes, second geste, erreurs du serveur, mode support, patron déconnecté qui revient, vérification de bout en bout, bannière cookies) ; la fenêtre « Borne » (code caché, « Relier une autre tablette ») ; un parcours complet tablette + bureau. Captures à 390 px et en tablette dans `docs/captures-appairage-lot11/` |
| `node scripts/tests/borne-lot11.mjs out docs/captures-lot11` | non-régression de la borne et de la fenêtre « Borne » (deux scénarios réécrits : A6, plus de code à l'ouverture avec une tablette reliée, et L13-4, la légende « Secours : à scanner avec la tablette ») |

Captures (390 px et tablette) : `docs/captures-appairage-lot11/` —
`tablette-qr-1280x800`, `-1024x768`, `-768x1024`, `-390x844`, `-390x500`,
`tablette-clavier-768x420`, `tablette-secours-390x844`,
`tablette-inactive-390x844`, `tablette-deconnectee-1024x768`,
`tablette-repli-1024x768`, `bureau-associer-390x844`, `-banniere-`, `-remplace-`,
`-verifie-`, `-erreur-`, `-support-`, `bureau-borne-tablette-reliee-390x844`,
`bureau-borne-code-revele-390x844`.

## Fichiers de la partie écrans

| Fichier | Rôle |
|---|---|
| `app/borne/pair-qr.tsx` | machine à états du QR de la tablette (`usePairQr`) et les deux textes de bandeau « déconnectée » |
| `app/borne/page.tsx` | écran non relié : QR, code de vérification, secours replié, défilement ; verrou d'écran pendant l'attente |
| `lib/kiosk-pair-stash.ts` | mémoire du fragment `#borne=` (sans aucun import) |
| `app/admin/layout.tsx` | garde le fragment avant la redirection, ouvre la fenêtre (chargée à la demande) |
| `components/kiosk-pair-confirm.tsx` | fenêtre « Associer cette tablette ? » |
| `components/kiosk-admin.tsx` | fenêtre « Borne » : code caché derrière « Relier une autre tablette » |
| `scripts/tests/appairage-un-geste.mjs`, `scripts/tests/borne-lot11.mjs` | tests navigateur |
