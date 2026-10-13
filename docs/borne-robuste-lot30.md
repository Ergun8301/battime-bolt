# Borne robuste (lot 30 du plan IA)

La tablette de la borne **s'ouvre sans réseau**, **se recharge d'elle-même une
fois par nuit** (sans risque pour un pointage), **dit au bureau si son écran peut
s'éteindre**, et **relit le planning toutes les 60 secondes** au lieu de 30 pour
ménager le quota gratuit de Supabase.

Ce lot touche une migration (deux colonnes), la fonction `kiosk` (action `sync`),
le front de la tablette (`/borne`) et la fenêtre « Borne » du bureau.

## Ce que ça change

| # | Pour qui | Avant | Après |
|---|---|---|---|
| A | Tablette | Relancée sans réseau, elle n'affichait rien | Elle s'ouvre sur son planning (le dernier reçu), dit « **Pas de réseau — reprise automatique** » (« Le QR continue de tourner. Le planning reviendra avec le réseau. »), et reprend seule au retour du réseau |
| B | Tablette | Elle faisait tourner l'ancienne version du site jusqu'à ce qu'on la recharge à la main | Une fois par nuit (02:00–04:00, heure de Paris), si elle est en ligne, au calme depuis 10 minutes et que le serveur sert une autre version, elle se recharge |
| C | Bureau | Rien sur l'écran de la tablette | Sous « Tablette reliée » : « L'écran de la tablette peut s'éteindre : réglez Verrouillage auto sur Jamais », « Ouvrez la borne depuis l'icône installée », « Tablette hors ligne depuis 14:32 » — seulement si l'état est récent (voir plus bas) |
| D | Quota | `board` toutes les 30 s | `board` toutes les 60 s ; reprise immédiate au retour du réseau, au retour sur la page et au toucher |
| E | Mise en ligne | — | Chaque ordre intermédiaire est sans casse (tableau plus bas) |

## A. Démarrage sans réseau (service worker de la borne)

**Fichier** : `public/borne-sw.js`, enregistré par la page `/borne` **seulement**
(`lib/kiosk-offline.ts`), avec la portée `/borne`. Il est **distinct de
`public/sw.js`** (notifications push, portée `/`), qu'il ne touche pas : les deux
cohabitent (testé), et `/borne` est toujours contrôlée par celui de la borne
(portée la plus précise).

*Pourquoi `/borne-sw.js` et pas `/borne/sw.js`* : un service worker rangé dans
`/borne/` a la portée `/borne/` (avec la barre), qui **ne contient pas la page
`/borne`** elle-même ; il faudrait un en-tête serveur `Service-Worker-Allowed`
(donc `public/_headers`, que le lot 5 modifie). À la racine, on enregistre avec
la portée `/borne` sans toucher à rien d'autre. Vérifié en navigateur : une seule
inscription, `scope = …/borne`, `/connexion` et `/` ne sont jamais contrôlées.

| Demande | Stratégie |
|---|---|
| La page `/borne` (HTML) | **Réseau d'abord** : en ligne, la tablette a toujours la page du dernier déploiement, jamais une copie périmée. Le réseau a **4 s** ; au-delà, sans réseau, ou si le serveur répond autre chose qu'une page (5xx, 404), la **dernière bonne page** est servie (et mise à jour dès que le réseau répond). La copie est rangée sous `/borne` seul : `?code=…` ne laisse aucune trace. |
| Sans copie ni réseau (caches vidés) | Petit écran « Pas de réseau — reprise automatique », qui recharge la borne tout seul au retour du réseau |
| `/_next/static/…` (code, nom = empreinte du contenu) | Cache d'abord |
| Polices, logos, scripts de cookies | Cache d'abord, remis à jour en arrière-plan |
| Tout le reste (**Supabase**, statistiques, autres pages, tout ce qui n'est pas un GET) | **Jamais touché** : le navigateur le traite seul |

À chaque bonne page reçue, les fichiers qu'elle cite sont mis en cache d'avance
(18 fichiers de code, de styles et de cookies, 9 polices, logos : environ 1,1 Mo) : la borne est
complète hors ligne dès son installation, sans attendre un second chargement.

**Aucun appel Supabase, aucun jeton, aucun QR n'est jamais gardé** : les caches ne
contiennent que des fichiers du site (vérifié sur le contenu réel des caches). Les
caches sont **versionnés** (`bx-borne-page-v1`, `bx-borne-assets-v1`) ; une
nouvelle version de ce fichier retire les anciens caches `bx-borne-…` (et eux
seuls) à son activation. **C'est, avec le plafond du cache de fichiers, la seule
suppression de ce lot** (`cache.delete`, jamais de `.delete()` / `.remove()` sur
des données).

### Ce qui marche hors ligne, et ce qui ne marche pas

L'analyse du code montre que **le QR tournant est calculé sur la tablette** : la
graine est reçue une fois à l'appairage et conservée (`localStorage`), le code est
recalculé chaque minute (`kiosk-code.ts`, HMAC-SHA-256, 8 chiffres). Donc :

- **Marche hors ligne** : l'ouverture de la borne ; le planning de la dernière
  lecture (avec l'heure à laquelle il a été lu) ; le QR, qui continue de tourner
  (le test compare le QR affiché hors ligne à un QR de référence recalculé à part :
  identique). Un salarié peut pointer **si son téléphone a du réseau** : c'est le
  serveur qui vérifie le QR, pas la tablette.
- **Ne marche pas hors ligne** : la mise à jour du planning et des pastilles « en
  cours depuis » (elles s'effacent au bout de 2 minutes, comme avant) ; la
  détection d'une borne retirée par le bureau ou suspendue par BEMEXO (la tablette
  continue d'afficher un QR que le serveur refusera ; elle le saura au retour du
  réseau). **Le message ne promet donc rien sur la validité du QR.**

## B. Rechargement de nuit

Règles pures : `supabase/functions/_shared/kiosk-night-reload.ts` ; côté page :
`app/borne/night-reload.ts`. La page se pose la question une fois par minute.

Elle se recharge **seulement si tout est vrai** :

1. il est entre **02:00 inclus et 04:00 exclu, heure de Paris** (la même heure que
   l'horloge de la borne et que ses heures d'ouverture, heure d'été et d'hiver
   comprises) ;
2. la tablette est **en ligne** et la page **visible** ;
3. rien n'est ouvert à l'écran (QR de pointage, confirmation, appairage en attente) ;
4. **aucun toucher ni touche depuis 10 minutes** (un QR affiché suppose un toucher ;
   le ticket d'un salarié vit 5 minutes : la marge est double) ;
5. la nuit n'est pas déjà marquée ;
6. le serveur sert une **autre version** que celle qui tourne (voir ci-dessous).

**Jamais de boucle** : le marqueur de la nuit (`bx_borne_night` : jour de Paris) est
écrit **avant** toute tentative, puis relu ; s'il ne tient pas (stockage bloqué ou
plein), la tablette ne se recharge **jamais**. Une tentative qui échoue (le serveur
ne répond pas) n'est pas refaite avant la nuit suivante ; hors ligne, il n'y a pas
de tentative du tout, et si le réseau revient avant 04:00, une tentative a lieu. Une
page qui vient de se (re)charger compte comme « touchée » : 10 minutes de calme
avant toute décision. Si quelqu'un s'approche pendant la vérification, la nuit est
rendue et la minute suivante réessaie.

*Écart avec la demande (à connaître)* : le rechargement n'a lieu que si **la
version diffère**. Une nuit sans déploiement ne recharge rien (une seule requête,
vers le HTML statique, pas vers Supabase). Raison : un rechargement inutile peut
faire perdre le plein écran (hors appli installée) et, sur iPad, le verrou d'écran
jusqu'au prochain toucher (voir « Limites »). Si la version ne peut pas être
déterminée (d'un côté ou de l'autre), on retombe sur le comportement demandé :
un rechargement par nuit.

**La version** (`supabase/functions/_shared/kiosk-version.ts`) est l'empreinte
(FNV-1a, 8 signes) des noms des quatre fichiers qui font la borne (`webpack`,
`main-app`, `app/layout`, `app/borne/page` : leurs noms portent l'empreinte de
leur contenu). Aucun numéro à tenir à la main, rien à ajouter au build. Elle se lit
sur la page ouverte (les `<script>` et les fichiers que le navigateur a chargés, via
`PerformanceObserver`) et dans le HTML frais du serveur.

## C. L'état de l'écran, du bureau à la tablette

La tablette joint à son `sync` (toutes les 5 minutes, et 3 s après un changement
du verrou d'écran ou de l'icône installée, au plus une fois par minute) un objet :

| Champ | Valeurs |
|---|---|
| `wake` | `held` (verrou tenu), `denied` (refusé), `unsupported` ; absent tant qu'on ne sait pas |
| `standalone` | ouverte depuis l'icône installée (`navigator.standalone`, mode `standalone` / `minimal-ui`, ou `fullscreen` **sans** API plein écran d'un onglet) |
| `fullscreen`, `online` | booléens |
| `version` | l'empreinte de 8 signes ; envoyée une fois la page chargée |

**Validation côté fonction** (`_shared/kiosk-client-state.ts`) : liste blanche de
ces cinq champs, types stricts, version `[A-Za-z0-9._-]{1,24}`, entrée de 1 024
signes au plus. Un champ connu mal formé, un objet trop gros ou sans champ connu
**fait ignorer l'objet entier** (le `sync` répond comme avant, rien n'est écrit,
rien n'est journalisé). Les champs inconnus sont ignorés (jamais gardés) : ni
jeton, ni graine, ni texte libre, ni position — testé en vérifiant la base **et**
les journaux. La copie écrite remplace l'état précédent. La base borne aussi la
taille (objet de 256 octets au plus). Écriture dans `kiosks.client_state` et
`client_state_at` par la **clé service seule**, **à part** du « vu à » : une panne
de cette écriture n'empêche jamais le `sync` (seul le code d'erreur est journalisé).

**Ce que dit la fenêtre « Borne »** (`components/kiosk-health.tsx`) :

| Situation | Phrase |
|---|---|
| État de moins de **15 minutes**, verrou refusé ou non pris en charge | « L'écran de la tablette peut s'éteindre : réglez Verrouillage auto sur Jamais. » + bouton « Voir comment » |
| État de moins de 15 minutes, icône non installée | « Ouvrez la borne depuis l'icône installée. » + bouton « Voir comment » |
| État de **15 minutes ou plus** | « Tablette hors ligne depuis 14:32 » (« depuis hier 21:05 », « depuis le 11 oct. à 21:05 ») + « Réseau coupé ou écran éteint. » ; les autres phrases ne sont plus vraies : rien |
| Jamais d'état (ancienne page, fonction ou migration pas en ligne), ou état illisible | **Rien**, la fenêtre est celle d'avant |

« Hors ligne depuis » vient de `client_state_at`, écrite **seulement** par la
tablette : un pointage (qui met aussi à jour « vu à ») ne la fait pas croire en ligne.
« Voir comment » ouvre l'aide « Installer la tablette » déjà présente. Boutons de
44 px, zone annoncée aux lecteurs d'écran (`role="status"`), focus visible, 390 px
sans défilement horizontal. Le mode support (lecture seule) voit les mêmes phrases.

## D. Relecture toutes les 60 s

`BOARD_EVERY_MS` passe de 30 s à **60 s**. Le `sync` reste toutes les 5 minutes
(il n'était pas à 30 s). Relecture **sans attendre** : retour du réseau
(événement `online`, puis deux nouveaux essais à 5 s et 20 s si l'écran dit encore
« pas de réseau »), retour sur la page, toucher — dès que le planning a plus de
20 s ; une rafale de touchers ne lance qu'**une** relecture.

Les pastilles « en cours depuis » restent effacées au bout de 2 minutes (inchangé :
une seule relecture ratée les masque jusqu'à la suivante).

### Quota (Supabase gratuit : 500 000 appels de fonction par mois)

| Tablette | Avant | Après |
|---|---|---|
| Allumée 24 h sur 24 | ~3 170 appels/jour ≈ 95 000/mois | ~1 750/jour ≈ **52 000/mois** |
| Ouverte 13 h par jour | ~1 800/jour ≈ 55 000/mois | ~1 070/jour ≈ **32 000/mois** |
| Tablettes tenables dans le quota | ~5 (24 h/24) | **~9** (24 h/24), ~15 (13 h/jour) |

Le rechargement de nuit ne compte pas : il demande le HTML statique, pas la fonction.
Chaque `sync` fait maintenant deux écritures sur `kiosks` (« vu à », puis l'état) :
576 par jour et par tablette.

## Mise en ligne : migration → front → fonction `kiosk`

| État | Effet |
|---|---|
| Migration seule | Rien ne l'utilise |
| Migration + front, fonction ancienne | La tablette envoie `client_state`, l'ancienne fonction l'ignore ; le bureau n'a rien à dire (colonnes vides) : comme avant. Le service worker, le rechargement de nuit et les 60 s marchent déjà |
| Front sans migration, fonction ancienne | Comme avant, plus le service worker, le rechargement de nuit et les 60 s. La fenêtre « Borne » tente les colonnes neuves, reçoit « colonne inconnue » (42703), retombe sur la lecture d'avant et s'en souvient : une requête par relecture, sans message |
| Fonction nouvelle, migration absente | L'écriture de l'état échoue proprement (colonne inconnue), rien n'est journalisé, `sync` répond comme avant |
| Fonction nouvelle, front ancien | Aucun état reçu : rien de nouveau |
| Tout en place | Voie complète |

1. **Migration** `supabase/migrations/20261013170000_lot30_borne_robuste.sql` (nom
   d'enregistrement `lot30_borne_robuste`, **jamais `db push`**). Coller le fichier
   dans l'éditeur SQL (si l'outil bloque les mots `DROP` jusque dans les
   commentaires, retirer l'en-tête de commentaires : le fichier n'a aucun `DROP`
   hors commentaires), lancer le bloc **VÉRIFICATION** de l'en-tête (**8 × true**),
   puis inscrire l'historique :
   `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261013170000', 'lot30_borne_robuste') ON CONFLICT DO NOTHING;`.
   `npm run check:migrations` la liste « à appliquer » tant que ce n'est pas fait.
   Retour arrière : le bloc commenté de l'en-tête (efface l'état gardé de chaque
   tablette ; il se reconstitue en 5 minutes).
2. **Front** (déploiement habituel du site). Les tablettes déjà ouvertes prennent
   la nouvelle version à leur prochain rechargement (la nuit suivante), ou plus tôt
   en fermant et rouvrant la borne.
3. **Fonction `kiosk`** (`--no-verify-jwt`, inchangé), fichiers à emporter :
   `supabase/functions/kiosk/index.ts` et `_shared/` : `kiosk-code.ts`,
   `kiosk-rules.ts`, `fixed-qr.ts`, `kiosk-board.ts`, `live-place.ts`,
   `kiosk-pair.ts` et, **nouveau**, **`kiosk-client-state.ts`** (importe
   `kiosk-rules.ts`). Aucun secret à ajouter. Retour arrière : redéployer l'ancienne
   fonction (la tablette continue d'envoyer son état, qui est ignoré).

## Tester sur une vraie tablette (entreprise fictive)

1. **Installer le service worker** : ouvrir `bemexo.com/borne` (en ligne), attendre
   10 secondes, relier la tablette depuis l'icône installée (voir
   `docs/borne-allumee.md`).
2. **Mode avion** : passer en mode avion → la pastille « Pas de réseau — reprise
   automatique » apparaît dans la minute (ou tout de suite), le planning reste, le
   QR s'affiche et change chaque minute. Désactiver le mode avion : la pastille
   disparaît en quelques secondes, sans toucher la tablette.
3. **Relance sans réseau** : mode avion, fermer complètement la borne (iPad : la
   balayer dans le sélecteur d'applications ; Android : la fermer), la rouvrir
   depuis l'icône → la borne s'ouvre sur le dernier planning avec la pastille.
4. **Après un déploiement** : mettre en ligne une nouvelle version, rouvrir la borne
   en ligne → elle affiche la nouvelle version du premier coup. Mode avion, relancer
   → c'est la nouvelle version qui s'ouvre.
5. **Fenêtre du bureau** : sur la tablette, mettre Verrouillage auto sur « 2 minutes »
   et ouvrir la borne **dans Safari** (pas depuis l'icône) : au bout de quelques
   minutes, le bureau dit « Ouvrez la borne depuis l'icône installée » et, si le
   verrou est refusé, « L'écran de la tablette peut s'éteindre… ». Éteindre le wifi
   15 minutes : « Tablette hors ligne depuis … ».
6. **La nuit** : après un déploiement, laisser la tablette branchée, ouverte sur la
   borne, sans la toucher. Le lendemain, vérifier qu'elle affiche la nouvelle version
   **et qu'elle est restée allumée** (c'est le point à surveiller sur iPad). La
   version envoyée se lit en SQL (lecture seule) :
   `SELECT name, client_state->>'version' AS version, client_state_at FROM public.kiosks WHERE revoked_at IS NULL;`

## Tests

| Commande | Ce qu'elle couvre |
|---|---|
| `npm run test:borne-robuste` | règles pures : état envoyé (liste blanche, taille, types, `__proto__`), phrases du bureau (récent, périmé, absent, 15 min pile, hier), rechargement de nuit (plage, heure d'été et d'hiver, 10 minutes, une seule fois en 48 h, hors ligne), version, règles du service worker (ce qu'il touche, ce qu'il ne touche jamais) |
| `npm run test:kiosk-fonction` | la fonction de bout en bout : avant la migration (réponse identique, rien de visible ni journalisé), après (copie nettoyée, date du serveur, remplacement), état invalide / trop gros, secrets, entreprise étrangère, tablette retirée ou coupée, panne de la base, aucune autre action n'écrit l'état |
| `npm run test:borne-robuste-db` | la migration sur PGlite : additive, rejouable, contrainte de taille, droits (bureau de l'entreprise / autre entreprise / salarié / anonyme, droits par défaut de production), retour arrière puis rechargement, **8 × true** |
| `npm run test:borne-robuste-ecrans` (après `npm run build`) | navigateur réel : service worker (portée, caches, rien de Supabase, cohabitation avec le push), démarrage sans réseau (QR comparé à un QR de référence), déploiement simulé, réseau lent, panne, écran de secours, nouvelle version du service worker, rechargement de nuit (11 scénarios), relecture à 60 s, état envoyé avec `sync` |
| `npm run test:borne-robuste-bureau` (après `npm run build`) | la fenêtre « Borne » : état récent / périmé / absent, le temps qui passe, repli (42703, 42501, panne), 390 px, 360 px, tablette, accessibilité, mode support |

Deux tests existants ont été mis à jour pour la cadence de 60 s (`borne-lot10.mjs`,
sections A et D ; `borne-allumee.mjs`, section E) : leurs assertions ne sont pas
affaiblies, seules les durées passent de 30 à 60 s.

Captures (390 px et tablette) : `docs/captures-borne-robuste-lot30/`.

## Limites connues

- **Non vérifiable sans iPad ni Android réels** : le service worker en appli installée
  sur iPadOS, l'ouverture hors ligne après un « tuer l'appli », le comportement de
  `display: fullscreen` d'un WebAPK Android (la détection de l'icône installée suit
  les règles de la norme, testée avec un faux `matchMedia`), et surtout **le verrou
  d'écran après le rechargement de nuit sur iPad** : WebKit exige parfois un geste
  pour l'accorder ; sans geste de la nuit, l'écran ne reste allumé que si le
  verrouillage automatique est sur « Jamais » (c'est la consigne d'installation).
  La borne redemande le verrou à son ouverture, toutes les 60 s et au premier toucher.
- **Après un rechargement, le plein écran du navigateur est perdu** (hors appli
  installée) jusqu'au premier toucher du matin.
- **Safari (onglet, pas icône)** efface les données d'un site non ouvert depuis 7 jours,
  service worker compris : installer l'icône (les applis de l'écran d'accueil en sont
  exemptées). La borne est ouverte tous les jours : sans objet en usage normal.
- **Première ouverture** : la tablette doit être en ligne une fois pour installer le
  service worker et remplir ses caches. Données du navigateur effacées : même chose.
- **Une ancienne version peut tourner hors ligne** jusqu'au retour du réseau, puis
  jusqu'à la nuit suivante (la prochaine fenêtre de rechargement).
- **`navigator.onLine`** n'est pas fiable (wifi sans internet) : la pastille apparaît
  quand un appel échoue, pas quand l'icône du wifi change.
- **Horloge** : hors ligne pendant des jours, l'horloge de la tablette peut dériver ;
  le serveur accepte la minute précédente et suivante, pas davantage.
- **Une borne retirée ou suspendue** pendant que la tablette est hors ligne continue
  d'afficher un QR que le serveur refusera, jusqu'au retour du réseau.
- **« Hors ligne depuis »** ne distingue pas un réseau coupé d'un écran éteint (JavaScript
  est suspendu dans les deux cas) : la précision le dit.
- **Version inconnue** (autre empreinte de fichiers, serveur de développement) : le
  rechargement de nuit retombe sur « une fois par nuit sans condition ».
- **En-têtes d'hébergement** : le service worker se rafraîchit toujours depuis le
  réseau (`updateViaCache: 'none'`), mais `/borne` ne doit jamais recevoir un
  `Cache-Control: immutable` (le lot 5 pose des en-têtes sur `/_next/static` : sans
  conséquence). Aucun fichier d'en-têtes n'a été modifié dans ce lot.
- Au chargement, la page fait deux fois `sync` + `board` (comportement antérieur à ce
  lot, inchangé).

## Retirer le service worker d'une tablette

Publier à la place de `public/borne-sw.js` :

```js
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const n of await caches.keys()) if (n.indexOf('bx-borne-') === 0) await caches.delete(n);
  await self.registration.unregister();
})()));
```

puis, au déploiement suivant, retirer l'appel `registerBorneServiceWorker()` de
`app/borne/page.tsx`. Les tablettes reprennent leur fonctionnement d'avant (la borne
ne démarre alors plus sans réseau).

## Fichiers

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20261013170000_lot30_borne_robuste.sql` | deux colonnes sur `kiosks` |
| `supabase/functions/kiosk/index.ts` | `sync` accepte et écrit `client_state` |
| `supabase/functions/_shared/kiosk-client-state.ts` | validation (liste blanche) et phrases du bureau |
| `supabase/functions/_shared/kiosk-night-reload.ts` | règles du rechargement de nuit |
| `supabase/functions/_shared/kiosk-version.ts` | version de l'appli |
| `public/borne-sw.js` | service worker de la borne |
| `lib/kiosk-offline.ts` | enregistrement, version, marqueur de nuit, état envoyé |
| `app/borne/night-reload.ts`, `app/borne/page.tsx` | rechargement de nuit, 60 s, pastille hors ligne, état dans `sync` |
| `components/kiosk-health.tsx`, `components/kiosk-admin.tsx` | phrases du bureau, lecture avec repli |
| `supabase/tests/lot30_borne_robuste.mjs`, `supabase/functions/_shared/kiosk-robuste.test.ts`, `kiosk-function.check.ts`, `scripts/tests/borne-robuste.mjs`, `borne-robuste-bureau.mjs` | tests |
