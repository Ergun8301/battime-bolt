# Vidéos de formation : envoi direct (lot 13, oct. 2026)

> **Mise à jour « formations simplifiées » (oct. 2026, décision du patron).** La fenêtre « Formations » du bureau n'a plus aucun texte d'aide ni d'état vide, et le formulaire est devenu : titre, **une rangée de gros boutons « Filmer » · « Fichier » · « Lien » · « Document »**, puis « Pour ». « Filmer » = l'enregistreur intégré (un seul appui) ; s'il est indisponible : la caméra du téléphone sous le même mot sur un écran tactile, rien du tout sur un ordinateur (jamais un « Filmer » qui ouvre l'explorateur de fichiers). « Fichier » ouvre le sélecteur de vidéos. « Document » n'existe que s'il y a un document à proposer. Liste vide : le formulaire est là d'office (sans « Annuler »). La jauge de place n'apparaît qu'à partir de 80 %. Plus d'avertissement GPS à l'écran. Les passages ci-dessous qui parlent des anciens boutons (« Filmer dans BEMEXO », « Filmer », « Choisir un fichier », « Vidéo (téléphone ou fichier) ») et de ces textes décrivent l'état d'avant.

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
- **« Retirer »** cache la vidéo aux salariés. Les « Vue » restent. **Le fichier est gardé** (D12 : rien n'est supprimé sans l'accord d'Ergun), donc il compte toujours dans les 100 Mo. « Remettre » la rend de nouveau visible. Seule une vidéo **publiée** se retire : un envoi qui n'est pas terminé ne se retire pas, pour ne jamais « libérer » de la place alors qu'un fichier peut encore arriver.
- **« Envoi non terminé »** : si un fichier est arrivé mais que la vidéo n'a jamais été publiée (le réseau a coupé avant la publication, ou le bureau a choisi une autre vidéo à la place), le fichier est **gardé et compté** dans les 100 Mo. Il est montré sous « Afficher les formations retirées et les envois non terminés » : « Envoi non terminé · 24 Mo · place fermée · fichier gardé · 14/10 », avec « ▶ Regarder » pour vérifier ce qu'il contient. Les salariés ne le voient pas. La jauge « 86 Mo utilisés sur 100 Mo » s'explique donc toujours par la liste.
- **Avertissement vie privée**, sous « Filmer » et « Choisir un fichier » : « Attention : une vidéo filmée au téléphone peut contenir la position GPS du lieu, lisible par tous ceux qui la reçoivent. Désactivez la localisation de l'appareil photo avant de filmer. » (voir « Vie privée » plus bas).
- **Trois envois par tranche de 3 heures.** Au-delà : « Déjà trois envois de vidéo préparés ces 3 dernières heures dans votre entreprise. Réessayez dans environ 1 h 20. » Rien n'est envoyé ; le fichier reste choisi.
- **La notification** passe par send-push, aux seuls destinataires, comme le lot 6. Jamais d'e-mail.

## Ce que voit le salarié

La vidéo est dans la même liste « Formations » que les liens et les documents : « Vidéo · 2 min 10 · 38 Mo · ajoutée le 13 oct. ».

- **« ▶ Regarder »** ouvre un lecteur intégré `<video controls preload="metadata" playsinline>`.
- **Le lien de lecture** est signé pour **10 minutes** au moment où le salarié touche « Regarder », jamais avant. Avant ce geste, aucun octet de la vidéo n'est téléchargé. Une vidéo de 50 Mo au plus se charge largement dans ce délai.
- **Si la lecture échoue** (par exemple un lien expiré après une pause, ou au retour sur l'appli), le lien est re-signé **une fois** et la lecture reprend où elle en était. Si ça échoue encore : « Lecture impossible sur cet appareil. Réessayez plus tard, ou demandez la vidéo au bureau. » Il n'y a pas de boucle : le compteur ne repart à zéro que quand la lecture a vraiment avancé d'au moins une seconde.
- **« Retirer » coupe l'accès au plus tard 10 minutes plus tard** : un lien déjà signé reste valable jusqu'à son expiration, puis la re-signature est refusée.
- **« Vue »** se coche à la main, comme au lot 6, avec « Annuler » pendant 10 s (la base accepte 10 min). « Annuler » ne supprime rien : la ligne reste et porte l'heure d'annulation.

## Limites du forfait gratuit (Supabase Free, lues le 11/10/2026)

| Limite | Valeur | Ce qui se passe quand on l'atteint |
|---|---|---|
| Taille d'un fichier | **50 Mo** (limite du forfait, non modifiable en Free) | L'écran refuse avant l'envoi. S'il est contourné, le bucket refuse lui-même : 50 Mo et types vidéo sont réglés **au niveau du bucket**. 50 Mo, c'est environ 50 s filmées en 1080p sur iPhone (HEVC), 75 s en 720p, ou 23 s en « Le plus compatible » (H.264) ; **environ 4 minutes avec « Filmer dans BEMEXO »** (720p, lot 14). |
| Place par entreprise | **100 Mo** (décision D8) | « Filmer » et « Choisir » disparaissent, avec un message. La **base** refuse toute nouvelle réservation, même si l'écran est contourné (borne exacte plus bas). Les liens YouTube / Vimeo / Drive restent possibles. Retirer une vidéo **ne libère pas** la place : le fichier est gardé. Le nettoyage n'est pas fait : les fichiers sans formation sont seulement **signalés** (« Fichiers vidéo à vérifier », lot 14, `docs/enregistreur-video.md`) ; aucune suppression sans l'accord d'Ergun (D12). |
| Stockage de tout le projet | **1 Go** (3,7 Mo utilisés aujourd'hui) | 5 entreprises × 100 Mo = 500 Mo, ce qui laisse de la place pour les documents. Au-delà de 1 Go, Supabase prévient, puis peut restreindre **tout le projet**, documents et photos compris. C'est pour cela que le quota par entreprise existe. |
| Transfert sortant | **5 Go par mois** (+ 5 Go en cache), partagés avec la base et les fonctions | Une vidéo de 25 Mo vue en entier par 15 salariés consomme 375 Mo. Compter environ une vidéo courte par mois et par entreprise. Rien n'est téléchargé avant « Regarder » (`preload="metadata"`). Au-delà, Supabase peut limiter tout le projet. |
| Mise en pause | Après 7 jours sans activité | Le projet entier s'endort, pas seulement les vidéos. |

**Un seul envoi à la fois par entreprise.** Si un autre compte du bureau envoie une vidéo, le second voit : « Une autre vidéo est en cours d'envoi dans votre entreprise. Réessayez dans quelques minutes. » Un envoi abandonné (onglet fermé) ne bloque plus personne au bout de 3 heures. Son auteur le reprend tout de suite, sur la même place. **Trois nouvelles places au plus par tranche de 3 heures** et par entreprise (reprendre sa place ne compte pas).

**Le quota est tenu par le serveur : ce qui est garanti, et la borne exacte.**

| Cas | Ce que la base garantit |
|---|---|
| 50 Mo par fichier | **Garanti** : le bucket refuse lui-même un fichier plus lourd ou d'un autre type. |
| 100 Mo par entreprise, avec l'appli (navigateur normal : la taille annoncée est la vraie) | **Garanti : jamais plus de 100 Mo.** `start_training_video` compte la **vraie** taille de tous les fichiers de l'entreprise (`storage.objects`) **plus la taille annoncée** de chaque place réservée dont le fichier n'est pas encore arrivé, et refuse ce qui dépasse. |
| 100 Mo par entreprise, avec un navigateur **trafiqué** (un compte du bureau qui appelle l'API à la main) | **Borne exacte : 100 Mo + 3 fichiers de 50 Mo au plus, soit strictement moins de 250 Mo.** Le test rejoue le pire cas : 99 Mo déjà stockés, puis 3 places, 3 URL signées avant l'arrivée des fichiers, 3 écrasements à 50 Mo = **249 Mo**. Ensuite plus rien ne part, même 1 octet. |

*Pourquoi la borne n'est pas 100 Mo pile avec un navigateur trafiqué.* Le stockage ne vérifie la règle d'envoi qu'**au moment où il crée l'URL d'envoi signée** ; l'URL reste valable 2 h, et le fichier est alors écrit avec les droits du service. La base ne voit la taille réelle qu'**après** l'arrivée. Un navigateur trafiqué peut donc annoncer 1 octet et envoyer 50 Mo, ou garder une URL « écraser » signée avant l'arrivée du fichier et remplacer ensuite ce fichier. Ce qui borne le dégât :

1. une place est **un seul chemin**, donc un seul fichier à la fois (50 Mo au plus) ;
2. une place réservée compte sa **taille annoncée** jusqu'à l'arrivée du fichier, et **reste comptée même si elle est « retirée »** ou fermée, tant qu'une URL signée peut être vivante (3 heures) : retirer ne libère jamais le quota. Une vidéo qui n'est pas publiée **ne peut pas être retirée** ;
3. **un seul envoi ouvert** à la fois par entreprise ;
4. **trois nouvelles places au plus** par tranche de 3 heures et par entreprise (15 min pour demander l'URL + 2 h de validité + marge). Passé ce délai, les URL signées sont mortes et la vraie taille de tous les fichiers est comptée ;
5. la règle d'envoi **refuse tout chemin** qui n'est pas une place ouverte de l'entreprise, réservée depuis moins de 15 minutes, ou dont le **fichier existe déjà** (donc ni écrasement, ni envoi sur une vidéo publiée, ni sur une place retirée).

*Avant le correctif de relecture*, retirer une place puis recommencer permettait de signer autant d'URL que l'on voulait : le test a reproduit 300 Mo stockés pour un quota de 100 Mo. Ce scénario est maintenant un test (« retirer puis recommencer : toujours UNE seule place »).

Fermer cette borne à 100 Mo pile pour un navigateur trafiqué demande l'une de ces deux choses, **non faites ici** : (1) un service intermédiaire (une fonction qui reçoit le fichier, le pèse, puis le dépose) ou un stockage payant ; (2) un déclencheur (trigger) sur `storage.objects` qui refuserait un fichier trop gros, ou un écrasement, au moment de son écriture. Le déclencheur est simple, mais il modifie une table gérée par Supabase et il n'a pas pu être vérifié qu'on peut le poser en production : à décider avec Ergun.

**Format.** Une vidéo filmée en HEVC sur iPhone (réglage « Haute efficacité », par défaut) peut ne pas se lire sur certains Android ou PC. Conseil : régler l'iPhone sur « Le plus compatible », ou passer par un lien YouTube. Depuis le lot 14 : l'**alerte HEVC** s'affiche avant l'envoi d'un fichier HEVC, et **« Filmer dans BEMEXO »** (enregistreur 720p) produit un format lisible partout (`docs/enregistreur-video.md`).

## Pourquoi un bucket et une table neufs (et pas « Documents »)

Option B retenue : un **bucket privé neuf** `formations` et une **table neuve** `training_videos`. Le salarié a une seule lecture unifiée : sa liste « Formations ».

- Dans `chantier-docs`, **tout membre** de l'entreprise peut écrire et effacer n'importe où dans le dossier de l'entreprise (policies d'origine). Un salarié pourrait remplir le quota ou effacer une vidéo.
- Un bucket n'a qu'une limite de taille. Celle de `chantier-docs` n'est pas réglée, et la changer toucherait tous les documents.
- `documents.worksite_id` est obligatoire, alors qu'une formation n'appartient à aucun chantier. Les listes « Documents » se rempliraient de vidéos.
- La table `trainings` du lot 6 n'est **pas touchée** (D10). Ses contraintes exigent un lien YouTube / Vimeo / Drive ou un document, et les élargir demanderait un DROP.

**Sécurité :**
- Le bucket est privé.
- L'envoi n'est accordé qu'**au bureau, sur sa place réservée, dans les 15 minutes, tant que le fichier n'existe pas**. C'est la policy `formations_office_insert`, vérifiée par le stockage quand il crée l'URL d'envoi signée.
- La lecture n'est accordée qu'au **bureau de l'entreprise**, ou au **salarié destinataire** d'une vidéo publiée et non retirée (policy `formations_read`), par lien signé de **10 minutes**.
- Il n'y a **aucune policy UPDATE ni DELETE** sur les fichiers, et la base n'accorde **jamais** d'écrasement : signer une URL « écraser » (upsert) sur un fichier qui existe est refusé (test). **Limite connue** : une URL « écraser » signée **avant** l'arrivée du fichier reste valable jusqu'à 2 h ; elle est comprise dans la borne de 250 Mo ci-dessus.
- Le navigateur ne détient jamais de clé de service.

**Hypothèses tirées de la documentation Supabase, non testées sur le vrai service** (à regarder à l'application de la migration) : la policy d'envoi est vérifiée à la création de l'URL signée et non à l'envoi ; l'URL signée vit 2 h ; la limite de taille et les types du bucket s'appliquent à l'envoi ; le propriétaire des fonctions (`postgres`) lit `storage.objects` (vérification v10 de l'en-tête). Si le stockage refusait déjà une URL « écraser » sans policy UPDATE, la borne serait meilleure ; elle n'est jamais pire.

**Policies de `storage.objects` en production.** Relues le 12/10/2026 : toutes sont limitées à **un seul bucket** (`bucket_id = '…'`) : `chantier_docs_*`, `company_logos_*`, `te_*` (time-entry-photos), `worker_photos_*`. Aucune policy INSERT, UPDATE ou ALL ne vaut pour tous les buckets : personne ne peut donc déposer dans `formations` par une autre porte.

## Vie privée : la position GPS des vidéos filmées

Un MP4 ou un MOV filmé au téléphone peut contenir la **position GPS** du lieu de tournage (balise de localisation QuickTime / ISO 6709 sur iPhone ; appli caméra d'Android quand la localisation est activée). Le fichier part **tel quel**, sans nettoyage, et chaque salarié destinataire peut le télécharger avec le lien de lecture : un gérant qui filme chez lui peut donc transmettre ses coordonnées.

- **Ce que fait le lot** : l'avertissement affiché dans le formulaire (voir plus haut). Rien n'est retiré du fichier.
- **À faire** : mentionner dans la politique de confidentialité que les vidéos sont hébergées par Supabase (UE, eu-west-3) et qu'une vidéo filmée peut contenir une position.
- **Lot 14** : l'enregistreur « Filmer dans BEMEXO » (`MediaRecorder`) n'écrit **aucune position GPS**. Le retrait des boîtes de localisation d'un fichier **choisi** (MP4 / MOV, sans réencodage) reste **non fait** : analyser un MP4 de 50 Mo dans le navigateur n'est pas assez simple pour être sûr, sans nouvelle dépendance.
- **Pas vérifié sur un vrai appareil** : iOS peut retirer la position dans certains parcours (sélecteur Photos), pas forcément avec « Filmer ».

## Migration

`supabase/migrations/20261011160000_lot13_videos_envoi_direct.sql` est **pas encore appliquée**. Cowork la relit et l'applique.

Elle est **100 % additive** et **n'exécute aucun DROP ni DELETE** :
- un bucket neuf, avec `ON CONFLICT DO NOTHING` ;
- 2 tables neuves : `training_videos` et `training_video_views` ;
- 12 fonctions neuves (SECURITY DEFINER, search_path vide) ;
- 2 policies neuves sur `storage.objects` et 2 sur les tables neuves, créées seulement si elles manquent.

Aucune table, colonne, contrainte, policy, fonction ou trigger existant n'est modifié. Aucun trigger n'est ajouté. Les droits par défaut de production (anon) sont repris explicitement.

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
| `npm run test:videos` | Règles pures (Deno) : types, tailles, quota, messages, jumeaux SQL/JS (limites, lien de 10 min, plafond de 3 places, policy d'envoi, retrait) | 8 tests verts |
| `npm run test:videos-db` | La migration sur un Postgres jetable (PGlite), avec le schéma `storage` simulé et les policies d'origine de `chantier-docs` (détail ci-dessous) | 168 vérifications vertes |
| `npm run build` puis `npm run test:videos-ecrans` | Les vrais écrans sur une base simulée (détail ci-dessous). Captures dans `docs/captures-videos/` | 109 vérifications vertes |
| `npm run test:formations-ecrans` | Non-régression du lot 6 | 104 vérifications vertes (voir la note) |

Ce que vérifie `npm run test:videos-db` :
- chargée deux fois, en-tête 11 × true (12 fonctions) ;
- contrôle automatique : aucun DROP ni DELETE exécuté, aucune policy « FOR DELETE », aucun trigger ajouté ;
- objets existants inchangés (fonctions, policies, triggers, colonnes, contraintes, droits, données) ;
- droits de l'anonyme, du salarié, du chef d'équipe, du bureau, d'un second compte bureau et d'une autre entreprise ;
- quota serveur avec une taille annoncée fausse ;
- **navigateur trafiqué** (entreprises de test dédiées) : retirer une place non publiée est refusé, recommencer reprend la même place ; une place retirée sans fichier reste comptée 3 h ; la signature d'une URL « écraser » est refusée dès que le fichier existe (vidéo publiée, place fermée, place ouverte dont le fichier est arrivé) ; **le pire cas rejoué** (99 Mo stockés + 3 places + 3 URL « écraser » signées avant l'arrivée des fichiers + 3 écrasements) donne 249 Mo, soit moins de 250 Mo ; la 4ᵉ nouvelle place dans les 3 h est refusée avec le délai (« environ 3 h », « 1 h », « 30 min ») ; reprendre sa place ne compte pas ;
- fichiers non terminés : `training_video_leftovers` (bureau seulement, entreprise seulement, taille réelle) ;
- envoi coupé, place reprise ;
- « Vue » sans effacement ;
- retour arrière puis rechargement.

Ce que vérifie `npm run test:videos-ecrans` :
- **L'envoi part vraiment** : il passe sur une vraie connexion vers un faux serveur de stockage local (HTTPS, certificat jetable). La progression, « Annuler » et la coupure réseau sont donc réels.
- **Migration absente** : textes identiques au build d'avant (`AVANT=1` sur le build d'avant), une seule lecture en échec.
- Refus au-delà de 50 Mo, quota plein, garde de la base, avertissement GPS (aussi quand un fichier est choisi).
- **Envoi non terminé** : le fichier arrivé sans publication est montré avec sa taille, gardé, compté dans la jauge, lisible par le bureau seulement.
- **Plafond de 3 envois** par tranche de 3 h : message clair, aucun octet envoyé.
- Lecture avec lien de 10 minutes, re-signature, « Vue ».
- Animations réduites ; téléphone de **360 px** (bureau et salarié, sans défilement horizontal).

Note sur `test:formations-ecrans` : c'est la non-régression du lot 6, mais la vérification « menu du téléphone (bureau) : même texte que le build d'avant » échoue **déjà sur la base, sans ce lot** (vérifié sur le build de a504a74) : son fichier « avant » date d'avant des lots plus récents.

## À vérifier sur de vrais appareils (le harnais tourne sous Chromium)

- `capture="environment"` sur iPhone et Android.
- Le sélecteur Photos d'iOS peut recompresser la vidéo.
- La lecture d'un .mov HEVC dans Chrome Android.
- Une requête Range (206) sur un lien signé de production, pour avancer dans la vidéo.
