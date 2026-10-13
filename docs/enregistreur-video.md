# « Filmer dans BEMEXO », alerte HEVC et fichiers à vérifier (lot 14)

Suite du lot 13 (envoi direct d'une vidéo de formation : voir `docs/videos.md`). Le lot 13 reste tel quel : « Filmer » (l'appareil photo du téléphone), « Choisir un fichier », la barre de progression, le lecteur, les liens YouTube / Vimeo / Drive.

## Ce que ça fait

### 1. « Filmer dans BEMEXO » (le bureau, fenêtre « Formations » > « + Ajouter » > « Vidéo (téléphone ou fichier) »)

Un enregistreur intégré à l'appli, à côté de « Filmer » et de « Choisir un fichier » :

- **Image 720p** (1280 × 720 environ, 30 images par seconde), **1,5 Mbit/s** pour l'image + 64 kbit/s pour le son : environ **11,2 Mo par minute**, donc **environ 4 minutes** sous la limite de 50 Mo. Le fichier est lisible partout (MP4 H.264 sur iPhone / Safari ; WebM sinon).
- **Caméra arrière** par défaut (demandée, pas imposée : un ordinateur utilise sa webcam).
- **Minuteur**, puis **compte à rebours** (« Arrêt automatique dans 27 s ») sous 30 secondes. L'enregistrement **s'arrête tout seul** à 4 minutes, ou avant le plafond de taille (50 Mo moins 6 %, ou la place restante de l'entreprise si elle est plus petite). La vidéo est gardée, avec un message.
- **L'écran reste allumé** pendant la prise (si le téléphone le permet ; sinon on filme quand même, sans message).
- **Autorisation refusée** : message en français simple, avec le chemin sur iPhone (bouton « aA » de la barre d'adresse, « Réglages du site »). « Filmer » et « Choisir un fichier » restent utilisables.
- **Aperçu avant envoi**, puis « Ajouter » : l'envoi passe par **exactement le chemin du lot 13** (mêmes contrôles de taille et de type, même barre de progression, même publication). Rien ne quitte l'appareil avant « Ajouter ».
- **Aucune position GPS** n'est ajoutée à la vidéo (l'enregistreur n'en écrit pas).
- La caméra et le micro sont **coupés** dès l'arrêt, l'abandon, la fermeture de la fenêtre ou le changement d'onglet du formulaire.
- Le bouton n'apparaît que s'il peut marcher : appareil avec caméra, connexion sécurisée (HTTPS), au moins 2 Mo de place restante. Sinon (ou dans un navigateur intégré à une autre appli) on ne voit que « Filmer » et « Choisir un fichier ».

### 2. Alerte HEVC

Un fichier choisi (par « Filmer » ou « Choisir un fichier ») dont le codec vidéo est **HEVC** (le format récent des iPhone, `hvc1` / `hev1`) reçoit, **avant l'envoi**, un message : « Cette vidéo est au format HEVC… » avec le conseil « Changer de vidéo, puis Filmer dans BEMEXO ». L'alerte est **informative** : « Ajouter » reste possible (le bureau lit très bien du HEVC). Le fichier est lu par morceaux dans le navigateur (les quelques premiers octets de chaque « boîte » MP4 / MOV, puis le bloc `moov` : 4 Mo au plus) ; rien n'est envoyé pour cela.

### 3. Fichiers à vérifier (détection seulement, rien n'est supprimé)

Sous la liste des formations, un lien **« Fichiers vidéo à vérifier (N) »** (replié) apparaît **seulement quand il y a quelque chose** :

- les **fichiers du dossier privé** de l'entreprise qu'**aucune formation n'utilise** (ils comptent dans les 100 Mo) ;
- les **formations publiées dont le fichier manque** (les salariés verraient « Lecture impossible »).

La liste est **en lecture seule** : aucun bouton, aucun lien de suppression. Elle dit « Pour en retirer un, contactez BEMEXO ». Au plus 5 lignes par sorte (puis « + N autres »), et le total en Mo. Les envois non terminés restent là où ils étaient (« Envoi non terminé », lot 13).

## Ce qui n'est PAS fait

- **Aucune suppression**, ni SQL, ni stockage, ni bouton « Nettoyer ».
- **Retrait de la vidéo d'une formation archivée : en attente de la décision d'Ergun (D12).** C'est une suppression de fichier ; elle ne sera faite qu'avec son accord explicite.
- Pas de réécriture de l'en-tête WebM, pas de bascule caméra avant / arrière, pas de conversion HEVC → H.264, pas de retrait des métadonnées GPS d'un fichier choisi, pas de nouvelle dépendance.

## Migration (une seule, petite, en lecture seule)

`supabase/migrations/20261013143711_videos_fichiers_a_verifier.sql`, à appliquer **après** le lot 13 (déjà en ligne).

- Ajoute **une fonction** `video_files_audit()` (SECURITY DEFINER, `search_path` vide, STABLE, réservée au bureau connecté de l'entreprise). **Aucune table, colonne, policy, trigger.** Rien d'existant n'est remplacé.
- **Aucun DROP / DELETE / TRUNCATE / CASCADE** dans le fichier (le seul `DROP` est dans le bloc « RETOUR ARRIÈRE », en commentaire).
- Le fichier contient son retour arrière, sa vérification (« 6 × true », une requête en lecture seule) et la ligne d'historique à inscrire.
- **Tant qu'elle n'est pas appliquée** : l'appli reçoit « fonction absente » (PGRST202), n'affiche rien et aucune erreur n'apparaît ; le lot 13 continue de fonctionner (cette absence n'est pas confondue avec celle du lot 13).
- **Aucune fonction edge** nouvelle ni modifiée : rien à déployer.

## Comment tester sur téléphone

Rien de ceci n'est vérifiable dans Chromium de test (les prises du test viennent de la caméra factice de Chromium). À faire sur de vrais appareils, sur la préview `*.pages.dev` (HTTPS) :

1. **iPhone Safari** : « Filmer dans BEMEXO » s'affiche ? Fenêtre d'autorisation caméra + micro ; refus puis réautorisation (« aA » > « Réglages du site ») ; caméra arrière par défaut ; **poids réel d'une minute** (attendu environ 12 Mo : Safari honore-t-il 1,5 Mbit/s ?) ; arrêt à 4 minutes ; **écran qui reste allumé** (Safari 16.4 et plus) ; appli ajoutée à l'écran d'accueil ; appel entrant ou verrouillage pendant la prise (la prise doit être gardée avec « caméra interrompue ») ; portrait / paysage, rotation en cours de prise ; lecture du fichier sur un Android et sur un ordinateur.
2. **Android Chrome** : MP4 H.264 (récent) ou repli WebM ; chauffe et fluidité sur un téléphone modeste ; orientation ; lecture du WebM sur le bureau et sur iPhone (un iPhone ancien peut ne pas lire un WebM) ; avance rapide impossible sur un WebM (voir Limites).
3. **HEVC** : un **vrai `.mov` d'iPhone** réglé sur « Haute efficacité » : l'alerte apparaît-elle ? (où est le bloc `moov`, au début ou à la fin du fichier ?) ; le même fichier choisi depuis « Photos » (iOS peut le recompresser en H.264 avant que le navigateur le reçoive : l'alerte ne dit que ce qui arrive) et depuis « Fichiers » ; un `.mov` « Le plus compatible » (pas d'alerte) ; un MP4 HEVC d'Android.
4. **Navigateur intégré à une appli** (WhatsApp, Facebook) : le bouton peut être absent ; « Filmer » et « Choisir un fichier » restent.
5. **Fichiers à vérifier** : après application de la migration, ouvrir la fenêtre sur la vraie entreprise : la liste doit être vide (aucun lien) ou montrer de vrais cas ; **vérifier à la main** (tableau de bord Supabase) un fichier signalé **avant toute décision de suppression**.
6. `Range 206` sur un lien signé de production et lecture d'un MP4 fragmenté de Safari (durée, avance) : voir aussi `docs/videos.md`.

## Limites

- **WebM de `MediaRecorder` (Chrome, Firefox, Android sans H.264)** : le fichier n'a ni durée ni index. La barre de lecture peut ne pas permettre d'avancer. Le MP4 H.264 (Safari, Chrome récent) n'est pas touché. Pour cette raison la durée est **mesurée par le minuteur** et transmise (elle n'est pas lue dans le fichier).
- Un WebM peut ne pas se lire sur un iPhone ancien. Un MP4 H.264 se lit partout.
- `videoBitsPerSecond` n'est qu'une **cible** : les scènes agitées dépassent. Le plafond repose sur les **octets réellement reçus**, pas sur la durée seule.
- Détecteur HEVC par lecture des boîtes MP4 / MOV : sur un iPhone, `moov` est probablement **après** `mdat` (fin de fichier) ; **non confirmé faute de vrai fichier** (le test fabrique les deux cas). Un `moov` de plus de 4 Mo n'est lu que sur ses 4 premiers Mo. En cas de doute (fichier illisible, `.mov` sans `moov` lisible) : **aucune alerte**.
- Si le **micro est refusé**, l'enregistreur est refusé (pas de repli « sans le son »).
- La liste « à vérifier » est le plus souvent **vide** : par le chemin normal du lot 13, ces cas n'arrivent presque jamais (fichier supprimé à la main dans le tableau de bord, dépôt manuel, suppression d'une entreprise).
- Application installée / navigateurs intégrés : le bouton peut être absent.
- Contexte sécurisé obligatoire (HTTPS ou `localhost`) ; les `*.pages.dev` le sont.
- **En-têtes du site (lot 5)** : s'il en existe, pas de `Permissions-Policy` avec `camera=()` ou `microphone=()` (casserait l'enregistreur **et** le scanner QR) ; sinon `camera=(self), microphone=(self)` ; une CSP doit autoriser `blob:` en `media-src`. Aucun fichier `public/_headers` n'existe encore dans cette branche.

## Tests

| Commande | Ce qu'elle prouve |
|---|---|
| `npm run test:enregistreur` | règles pures de l'enregistreur (type de fichier, plafond, arrêt automatique, textes) et détection HEVC (tampons fabriqués) |
| `npm run test:videos` | règles du lot 13 + lecture de la liste « à vérifier » et ses textes |
| `npm run test:videos-audit-db` | la fonction SQL sur un vrai Postgres (PGlite) : cas, droits, entreprises, 150 fichiers, lecture seule, retour arrière |
| `npm run test:videos-db` | non-régression du lot 13 |
| `npm run test:enregistreur-ecrans` | les vraies pages : prise complète, arrêt automatique, refus, caméra coupée, nettoyage, écran allumé, HEVC, liste à vérifier, 390 px |
| `npm run test:videos-ecrans` | non-régression des écrans du lot 13 |

### Chiffres mesurés (build et tests de cette branche)

| Mesure | Avant | Après |
|---|---|---|
| `npm run test:videos` (règles du lot 13) | 8 tests | 11 tests (+ liste « à vérifier » et textes) |
| `npm run test:videos-db` (SQL du lot 13) | 168 ok | 168 ok (inchangé) |
| `npm run test:videos-ecrans` (écrans du lot 13) | 106 ✅ | 106 ✅ (script non modifié) |
| Nouveaux : `test:enregistreur` / `test:videos-audit-db` / `test:enregistreur-ecrans` | | 17 tests / 49 ok / 174 ✅ |
| `npm run build`, route `/admin` (là où vit la fenêtre « Formations ») | 273 kB, First Load 766 kB | 273 kB, First Load 766 kB (écart nul : tout est chargé à la demande) |
| Morceau JS du panneau d'envoi (chargé au choix de « Vidéo ») | 5,9 Ko | 13,7 Ko (bouton, alerte HEVC, détecteur) |
| Nouveaux morceaux JS, chargés seulement à l'ouverture | | enregistreur 6,6 Ko (2,5 Ko compressé) ; liste « à vérifier » 2,1 Ko (0,9 Ko compressé) |
| Lectures à l'ouverture de la fenêtre « Formations » | N | N + 1 (`rpc/video_files_audit`, en GET, seulement si le lot 13 est actif) |
| Poids d'une prise de test (caméra factice de Chromium, WebM VP8) | | 150 à 190 Ko pour 3 s, soit 50 à 63 Ko/s observés (image de test très simple) contre 195,5 Ko/s nominaux (≈ 11,2 Mo par minute) : une vraie scène pèsera davantage, à mesurer sur téléphone |

Captures à 390 px : `docs/captures-enregistreur/` (panneau, caméra prête, en cours, compte à rebours, aperçu après arrêt automatique, refus, alerte HEVC, liste à vérifier).

## Fichiers

`components/training-video-recorder.tsx` (enregistreur), `components/training-video-orphans.tsx` (liste en lecture seule), `components/training-video-upload.tsx` (bouton, alerte, notes), `components/trainings-admin.tsx` (quelques lignes), `lib/training-videos.ts` (`fetchVideoFilesAudit`), `supabase/functions/_shared/video-recorder.ts`, `video-sniff.ts`, `training-videos.ts` (règles pures, importées par le site ; ce ne sont pas des fonctions déployées).
