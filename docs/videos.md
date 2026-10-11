# Vidéos de formation : envoi direct (lot 13, oct. 2026)

Demande d'Ergun : « 100 % gratuit, sans carte, jusqu'aux 5 premiers clients ». Le bureau filme une consigne au téléphone (ou choisit un fichier) et l'envoie telle quelle. Le salarié la regarde **dans l'appli**. Tout reste sur le forfait **Supabase Free** déjà en place : aucune carte bancaire, aucun service en plus.

Les liens YouTube / Vimeo / Google Drive et les documents du lot 6 marchent **exactement comme avant**.

## Ce que voit le bureau

« Salariés » → « Formations » → « + Ajouter » : une troisième option apparaît, **« Vidéo (téléphone ou fichier) »**.

- **La jauge** : « 23 Mo utilisés sur 100 Mo », relue à chaque nouveau formulaire.
- **« Filmer »** ouvre la caméra du téléphone (`accept="video/*" capture="environment"`). Sur un ordinateur, le navigateur ignore la caméra et propose un fichier.
- **« Choisir un fichier »** accepte MP4, MOV (iPhone) et WebM.
- **L'aperçu** montre la vidéo, sa durée et sa taille. Rien n'est envoyé avant « Ajouter ».
- **Un refus clair, avant tout envoi** :
  - plus de 50 Mo : « Vidéo trop lourde : 50 Mo maximum. Raccourcissez-la, filmez en 720p, ou collez un lien YouTube, Vimeo ou Google Drive. » ;
  - autre format : « Format refusé : une vidéo MP4, MOV ou WebM. » ;
  - plus de place : « Plus assez de place : 98 Mo utilisés sur 100 Mo. Collez plutôt un lien YouTube, Vimeo ou Google Drive. »
- **La barre de progression est réelle** : elle compte les octets vraiment partis (XHR vers une URL d'envoi signée). « Annuler l'envoi » coupe l'envoi, et rien n'est publié.
- **Si le réseau coupe** : « La connexion a été coupée pendant l'envoi : rien n'est publié. Réessayez quand le réseau revient. » Le fichier reste choisi ; il suffit de toucher « Ajouter » de nouveau.
- **Si l'envoi est arrivé mais que le réseau a coupé avant la publication**, le nouvel « Ajouter » publie le même fichier sans le renvoyer.
- **Dans la liste**, une vidéo s'affiche ainsi : « Vidéo · 2 min 10 · 38 Mo · Toute l'équipe · 13/10 », avec « x/y vues ». Le bouton « ▶ Regarder » ouvre le lecteur intégré.
- **« Retirer »** cache la vidéo aux salariés. Les « Vue » restent. **Le fichier est gardé** (D12 : rien n'est supprimé sans l'accord d'Ergun), donc il compte toujours dans les 100 Mo. « Remettre » la rend de nouveau visible.
- **La notification** passe par send-push, aux seuls destinataires, comme le lot 6. Jamais d'e-mail.

## Ce que voit le salarié

La vidéo est dans la même liste « Formations » que les liens et les documents : « Vidéo · 2 min 10 · 38 Mo · ajoutée le 13 oct. ».

- **« ▶ Regarder »** ouvre un lecteur intégré `<video controls preload="metadata" playsinline>`.
- **Le lien de lecture** est signé (1 h) au moment où le salarié touche « Regarder », jamais avant. Avant ce geste, aucun octet de la vidéo n'est téléchargé.
- **Si la lecture échoue** (par exemple un lien expiré au retour sur l'appli), le lien est re-signé **une fois** et la lecture reprend où elle en était. Si ça échoue encore : « Lecture impossible sur cet appareil. Réessayez plus tard, ou demandez la vidéo au bureau. » Il n'y a pas de boucle.
- **« Vue »** se coche à la main, comme au lot 6, avec « Annuler » pendant 10 s (la base accepte 10 min). « Annuler » ne supprime rien : la ligne reste et porte l'heure d'annulation.

## Limites du forfait gratuit (Supabase Free, lues le 11/10/2026)

| Limite | Valeur | Ce qui se passe quand on l'atteint |
|---|---|---|
| Taille d'un fichier | **50 Mo** (limite du forfait, non modifiable en Free) | L'écran refuse avant l'envoi. S'il est contourné, le bucket refuse lui-même : 50 Mo et types vidéo sont réglés **au niveau du bucket**. 50 Mo, c'est environ 50 s filmées en 1080p sur iPhone (HEVC), 75 s en 720p, ou 23 s en « Le plus compatible » (H.264). |
| Place par entreprise | **100 Mo** (décision D8) | « Filmer » et « Choisir » disparaissent, avec un message. La **base** refuse toute nouvelle réservation, même si l'écran est contourné. Les liens YouTube / Vimeo / Drive restent possibles. Retirer une vidéo **ne libère pas** la place : le fichier est gardé. Le nettoyage se fera avec confirmation, au lot 14, avec l'accord d'Ergun. |
| Stockage de tout le projet | **1 Go** (3,7 Mo utilisés aujourd'hui) | 5 entreprises × 100 Mo = 500 Mo, ce qui laisse de la place pour les documents. Au-delà de 1 Go, Supabase prévient, puis peut restreindre **tout le projet**, documents et photos compris. C'est pour cela que le quota par entreprise existe. |
| Transfert sortant | **5 Go par mois** (+ 5 Go en cache), partagés avec la base et les fonctions | Une vidéo de 25 Mo vue en entier par 15 salariés consomme 375 Mo. Compter environ une vidéo courte par mois et par entreprise. Rien n'est téléchargé avant « Regarder » (`preload="metadata"`). Au-delà, Supabase peut limiter tout le projet. |
| Mise en pause | Après 7 jours sans activité | Le projet entier s'endort, pas seulement les vidéos. |

**Un seul envoi à la fois par entreprise.** Si un autre compte du bureau envoie une vidéo, le second voit : « Une autre vidéo est en cours d'envoi dans votre entreprise. Réessayez dans quelques minutes. » Un envoi abandonné (onglet fermé) ne bloque plus personne au bout de 3 heures. Son auteur le reprend tout de suite.

**Le quota est tenu par le serveur.** start_training_video compte la **vraie** taille des fichiers déjà stockés (`storage.objects`), plus l'envoi en cours, et refuse ce qui dépasse. Il n'existe qu'une façon de dépasser : un navigateur trafiqué qui annonce une taille plus petite que le fichier réel. Le dépassement est alors d'**un seul fichier**, 50 Mo au plus (limite du bucket). Ensuite plus rien ne part, puisque la vraie taille est comptée. Il est impossible de faire mieux sans service payant : le stockage gratuit ne laisse pas la base voir la taille d'un envoi avant qu'il soit fini.

**Format.** Une vidéo filmée en HEVC sur iPhone (réglage « Haute efficacité », par défaut) peut ne pas se lire sur certains Android ou PC. Conseil : régler l'iPhone sur « Le plus compatible », ou passer par un lien YouTube. L'alerte HEVC et l'enregistreur 720p sont prévus au lot 14.

## Pourquoi un bucket et une table neufs (et pas « Documents »)

Option B retenue : un **bucket privé neuf** `formations` et une **table neuve** `training_videos`. Le salarié a une seule lecture unifiée : sa liste « Formations ».

- Dans `chantier-docs`, **tout membre** de l'entreprise peut écrire et effacer n'importe où dans le dossier de l'entreprise (policies d'origine). Un salarié pourrait remplir le quota ou effacer une vidéo.
- Un bucket n'a qu'une limite de taille. Celle de `chantier-docs` n'est pas réglée, et la changer toucherait tous les documents.
- `documents.worksite_id` est obligatoire, alors qu'une formation n'appartient à aucun chantier. Les listes « Documents » se rempliraient de vidéos.
- La table `trainings` du lot 6 n'est **pas touchée** (D10). Ses contraintes exigent un lien YouTube / Vimeo / Drive ou un document, et les élargir demanderait un DROP.

**Sécurité :**
- Le bucket est privé.
- L'envoi n'est accordé qu'**au bureau, sur sa place réservée, dans les 15 minutes**. C'est la policy `formations_office_insert`, vérifiée par le stockage quand il crée l'URL d'envoi signée.
- La lecture n'est accordée qu'au **bureau de l'entreprise**, ou au **salarié destinataire** d'une vidéo publiée et non retirée (policy `formations_read`), par lien signé d'1 h.
- Il n'y a **aucune policy UPDATE ni DELETE** sur les fichiers : on n'écrase pas, on n'efface pas.
- Le navigateur ne détient jamais de clé de service.

## Migration

`supabase/migrations/20261011160000_lot13_videos_envoi_direct.sql` est **pas encore appliquée**. Cowork la relit et l'applique.

Elle est **100 % additive** et **n'exécute aucun DROP ni DELETE** :
- un bucket neuf, avec `ON CONFLICT DO NOTHING` ;
- 2 tables neuves : `training_videos` et `training_video_views` ;
- 11 fonctions neuves (SECURITY DEFINER, search_path vide) ;
- 2 policies neuves sur `storage.objects` et 2 sur les tables neuves, créées seulement si elles manquent.

Aucune table, colonne, contrainte, policy, fonction ou trigger existant n'est modifié. Les droits par défaut de production (anon) sont repris explicitement.

**En-tête du fichier :**
- **RETOUR ARRIÈRE** (DROP en commentaire) : les fichiers et le bucket restent ; on ne les retire qu'au tableau de bord, avec l'accord d'Ergun ;
- **VÉRIFICATION APRÈS APPLICATION** : une requête qui renvoie **11 × true** ;
- **HISTORIQUE** :

```sql
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261011160000', 'lot13_videos_envoi_direct') ON CONFLICT DO NOTHING;
```

**Tant qu'elle n'est pas appliquée**, l'appli est **exactement** celle d'avant. Le harnais d'écran le prouve en comparant les textes avec le build d'avant. Il n'y a qu'une lecture en échec silencieux par page (PGRST205 / PGRST202), jamais répétée.

**Ordre** : le lot 6 doit être appliqué (c'est le cas en production). Aucune fonction edge à redéployer : send-push existe déjà.

**Passage au payant (plus tard, hors de ce lot)** :
1. relever la limite globale au tableau de bord ;
2. `UPDATE storage.buckets SET file_size_limit = … WHERE id = 'formations'` ;
3. `CREATE OR REPLACE FUNCTION public.training_video_quota_bytes()` avec la nouvelle valeur.

L'écran lit les deux valeurs dans `training_video_limits()` : rien à changer dans le code.

## Tester

| Commande | Ce qu'elle vérifie | Résultat |
|---|---|---|
| `npm run test:videos` | Règles pures (Deno) : types, tailles, quota, messages, jumeaux SQL/JS | 6 tests verts |
| `npm run test:videos-db` | La migration sur un Postgres jetable (PGlite), avec le schéma `storage` simulé et les policies d'origine de `chantier-docs` (détail ci-dessous) | 133 vérifications vertes |
| `npm run build` puis `npm run test:videos-ecrans` | Les vrais écrans sur une base simulée (détail ci-dessous). Captures dans `docs/captures-videos/` | 87 vérifications vertes |
| `npm run test:formations-ecrans` | Non-régression du lot 6 | 104 vérifications vertes (voir la note) |

Ce que vérifie `npm run test:videos-db` :
- chargée deux fois, en-tête 11 × true ;
- contrôle automatique : aucun DROP ni DELETE exécuté ;
- objets existants inchangés (fonctions, policies, triggers, colonnes, contraintes, droits, données) ;
- droits de l'anonyme, du salarié, du chef d'équipe, du bureau, d'un second compte bureau et d'une autre entreprise ;
- quota serveur, y compris un navigateur trafiqué ;
- envoi coupé, place reprise ;
- « Vue » sans effacement ;
- retour arrière puis rechargement.

Ce que vérifie `npm run test:videos-ecrans` :
- **L'envoi part vraiment** : il passe sur une vraie connexion vers un faux serveur de stockage local (HTTPS, certificat jetable). La progression, « Annuler » et la coupure réseau sont donc réels.
- **Migration absente** : textes identiques au build d'avant (`AVANT=1` sur le build d'avant).
- Refus au-delà de 50 Mo, quota plein, garde de la base.
- Lecture, re-signature, « Vue ».
- Animations réduites, téléphone de 390 px.

Note sur `test:formations-ecrans` : c'est la non-régression du lot 6, mais la vérification « menu du téléphone (bureau) : même texte que le build d'avant » échoue **déjà sur la base, sans ce lot** : son fichier « avant » date d'avant des lots plus récents.

## À vérifier sur de vrais appareils (le harnais tourne sous Chromium)

- `capture="environment"` sur iPhone et Android.
- Le sélecteur Photos d'iOS peut recompresser la vidéo.
- La lecture d'un .mov HEVC dans Chrome Android.
- Une requête Range (206) sur un lien signé de production, pour avancer dans la vidéo.
