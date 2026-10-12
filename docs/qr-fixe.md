# QR fixe à imprimer + position au scan (lot 12, oct. 2026)

Le bureau peut **imprimer un QR qui ne change pas**, à coller au mur du dépôt. C'est une **option, désactivée par défaut**, et **moins sûre** que le QR de la tablette. Le QR fixe demande **la position du salarié au moment du scan**, une seule fois, et la compare à celle de l'entreprise. **Aucune coordonnée du salarié n'est gardée.**

**Ce que vaut cette position, dit sans détour :** elle est **déclarée par le téléphone** du salarié. Le serveur ne peut pas la contrôler, et on la falsifie en quelques minutes (coordonnées simulées dans un navigateur, appel direct à la fonction). La zone est donc **un frein** (celui qui photographie le QR ne pointe plus de chez lui sans effort), **pas une preuve de présence**. « Dans la zone : oui » ne prouve pas que le salarié était sur place. L'écran du bureau le dit en clair.

Le QR de la tablette, qui change chaque minute, **ne change pas** : jamais de position, aucun nouveau contrôle, aucun plafond.

## Côté bureau

Fenêtre « Borne de pointage » (bouton 📟 Borne, ou Réglages → Borne & pointage) → section repliée **« QR fixe à imprimer (option) »**, badge « Désactivé ».

1. **Activer le QR fixe…** L'avertissement est affiché en clair : « Moins sécurisé : une photo de ce QR permet de pointer à toute heure. Le salarié doit être connecté à son compte et son téléphone envoie sa position au moment du scan, mais cette position est déclarée par le téléphone et peut être falsifiée : la zone est un frein, pas une preuve de présence. Le QR de la tablette, qui change chaque minute, reste disponible. » Une confirmation rappelle :
   - que **la zone est un frein, pas une preuve** (position déclarée, falsifiable) ;
   - d'**informer les salariés** (un écran d'information leur est montré au premier scan **de chaque compte**), d'inscrire ce traitement au **registre RGPD**, de consulter le **CSE** s'il existe ;
   - que la position n'est lue **qu'au moment du scan**, jamais en continu, qu'aucune coordonnée du salarié n'est gardée, et que « dans la zone : oui » se relit dans la section ;
   - que la justice n'admet la géolocalisation pour contrôler le temps de travail **que s'il n'existe pas d'autre moyen** : le QR de la tablette et la saisie à la main restent toujours proposés.
   - **Si aucune tablette n'est reliée**, un second avertissement le dit : le QR fixe serait alors le seul pointage en direct (le chrono du téléphone n'est plus proposé), et un salarié qui refuse sa position ne pourrait qu'ajouter son intervention à la main. La confirmation ne parle plus de « la tablette » comme d'un autre moyen.
2. **Poser le point ici** — une fois, **depuis votre téléphone, à l'endroit où le QR sera affiché**. Il faut une précision de **100 m ou mieux** ; sinon l'écran le dit (« Précision insuffisante (± 250 m)… Approchez-vous d'une fenêtre ou sortez, puis réessayez. »). Tant que le point n'est pas posé, le QR fixe refuse les pointages (et le dit).
3. **Rayon** : 100 m, **200 m (par défaut)**, 500 m ou 1 km.
4. **Imprimer** : une feuille A4 s'ouvre dans une fenêtre à part (nom de l'entreprise, « QR fixe — moins sécurisé », le QR, une phrase sur la position, la date et une **référence courte** de 4 caractères). On peut réimprimer à tout moment : c'est le même QR. La phrase « Vous pouvez refuser : … » ne cite la tablette que si une tablette est reliée.
5. **Régénérer…** (avec confirmation) : un nouveau QR ; **l'ancien QR imprimé cesse aussitôt de marcher**. Le point et le rayon sont gardés.
6. **Désactiver…** (avec confirmation) : plus aucun pointage avec le QR imprimé. Le réactiver plus tard crée un **nouveau** QR.
7. **Derniers pointages avec ce QR** (liste repliée, les 20 derniers) : qui, arrivée ou départ, date et heure, **« dans la zone : oui »**. C'est la lecture de la trace par le bureau (la table `kiosk_punches` reste fermée aux comptes : la fonction `kiosk` lit pour le bureau de l'entreprise seulement). La liste redit sa réserve : position déclarée par le téléphone, **pas une preuve de présence**, aucune coordonnée gardée. Elle reste lisible même quand le QR est désactivé.

La section indique aussi la référence, la date de création et le nombre de pointages des 7 derniers jours. « Tablette reliée », « Déconnecter la tablette » et « relier une nouvelle tablette » ne touchent **jamais** au QR fixe (et inversement).

### Quand BEMEXO coupe la borne

Si l'interrupteur `kiosk_enabled` de l'entreprise est coupé, le bouton « Borne » et « Relier la tablette » disparaissent, et le QR fixe imprimé **ne marche plus** (le scan répond que la borne est désactivée). Pour que le bureau n'ait pas à attendre qu'on rallume avant de couper un QR compromis :

- si un QR fixe est encore actif, la section s'affiche **dans Réglages → Borne & pointage**, ouverte, avec un message (« La borne est coupée par BEMEXO : ce QR fixe ne marche pas pour l'instant… ») ;
- le bureau peut **le désactiver** et **le régénérer** (l'ancien QR photographié ne servira plus quand la borne sera rallumée) ; il ne peut pas **l'activer**, poser le point ni changer le rayon (la fonction `kiosk` le refuse : `fixed_status`, `fixed_disable` et `fixed_regenerate` sont les seules actions du QR fixe permises borne coupée, et « régénérer » exige un QR fixe actif).

## Côté salarié

Il scanne le QR imprimé avec l'appareil photo du téléphone ou avec le scanner de l'appli (l'icône s'affiche aussi quand seul un QR fixe est actif).

- **Premier scan d'un QR fixe PAR COMPTE** : un écran court « Ce QR demande votre position » — **pourquoi** (une photo pourrait servir ailleurs : on vérifie qu'il est à moins de 200 m de l'entreprise), **une seule lecture** au moment du scan, jamais en continu, **rien n'est gardé** (ni coordonnées, ni trajet : seulement « dans la zone : oui », que le bureau peut lire), **il peut refuser** (« Scannez la tablette, ou ajoutez votre intervention à la main. »). Boutons « Continuer » et « Je refuse ».
  - L'écran est **mémorisé par compte** (une marque par salarié sur le téléphone), **pas par téléphone** : un collègue qui se connecte sur le même téléphone voit l'écran à son tour, **avant** que sa position soit lue. Si le salarié n'est pas connecté, la connexion passe d'abord, puis l'écran, puis la lecture. Un autre téléphone, ou une navigation privée, remontre l'écran : mieux vaut trop informer que pas assez.
- Il se connecte si besoin, puis la position est lue **une fois** (8 secondes au plus), envoyée avec le pointage, et **comparée par le serveur**. Arrivée ou départ : même écran que la tablette.
- **Refus de la localisation, position introuvable, hors zone ou trop imprécise** : « Pointage non enregistré » avec le motif et l'autre moyen, un bouton « Ajouter mon intervention à la main » (son espace) et « Réessayer ». **L'autre moyen dit vrai** : « Scannez la tablette, ou ajoutez votre intervention à la main. » si une tablette est reliée ; **« Ajoutez votre intervention à la main. »** sinon (la fonction `kiosk` sait si une tablette est reliée et le dit dans le ticket, `has_tablet`). Quand l'entreprise n'est pas connue (QR invalide, migration absente) : « Ajoutez votre intervention à la main, ou scannez la tablette si votre entreprise en a une. »
- Le double scan en moins d'une minute reste refusé (« Déjà enregistré… »). Un compte **actif** de la **même entreprise** reste obligatoire.

## La règle de la zone

Le serveur accepte si la distance au point est au plus **rayon + marge**, la marge étant la précision annoncée par le téléphone, **plafonnée à 100 m** (200 m de rayon, ± 60 m annoncés → 260 m acceptés ; ± 140 m → 300 m au plus). Au-delà de **± 150 m**, la position est jugée **trop imprécise** : refus clair (le cas typique : à l'intérieur, sans GPS). Règles et seuils : `supabase/functions/_shared/fixed-qr.ts`.

Rappel : la position et sa précision sont **annoncées par le téléphone**. Cette règle écarte l'erreur et la photo utilisée de loin sans effort ; elle ne résiste pas à quelqu'un qui veut tricher.

## Données personnelles (RGPD)

- **Ce qui est lu** : la position du téléphone, **une fois**, au moment où le salarié scanne le QR fixe et après l'avoir accepté. Jamais avant, jamais après, jamais en continu (pas de `watchPosition`). Le QR de la tablette ne lit jamais la position.
- **Ce qui est gardé** : sur la ligne du pointage (`kiosk_punches.in_zone`), **« dans la zone : oui »**. Les coordonnées du salarié sont écrites **nulle part** : ni table, ni journal de la fonction. Le bureau de l'entreprise relit « dans la zone : oui » (qui, quand) dans la section du QR fixe. Le point de référence posé par le bureau est la position de **l'entreprise**, pas celle d'un salarié ; seul le bureau de l'entreprise le lit.
- **Adresse IP** : le plafond d'essais refusés **ne garde aucune adresse**. Le couple (adresse, QR visé) est haché avec la clé serveur ; seuls 12 bits du résultat servent (un « seau » de 0 à 4 095). La table `kiosk_ticket_failures` n'a qu'une ligne par seau (4 096 au plus), réécrite après 10 minutes : elle ne grossit pas, ne garde ni adresse ni date de scan au-delà de 10 minutes, et n'a besoin d'**aucune purge** (donc d'aucun `DELETE`, pas de fichier `_suppressions.sql`).
- **Droit de refuser** : refuser (« Je refuse », ou refuser la localisation dans le téléphone) n'empêche jamais de travailler : la saisie à la main reste toujours proposée (et le QR de la tablette, quand il y en a une), et rien n'est reproché au salarié.
- **À faire par l'entreprise** avant d'activer : informer les salariés, inscrire le traitement au registre RGPD, consulter le CSE s'il existe. La jurisprudence (Cass. soc. 2011 et 2018, Conseil d'État 2017) n'admet la géolocalisation pour contrôler le temps de travail que s'il n'existe pas d'autre moyen : c'est pourquoi le QR fixe n'est qu'une **option** à côté de la tablette et de la saisie à la main. **Un avis juridique reste conseillé.**
- **À mettre à jour** : la politique de confidentialité (position lue au scan du QR fixe, rien de gardé sauf « dans la zone : oui »).

## Comment c'est fait

- Le QR fixe est **une ligne « fixe » de la table `kiosks`** (colonne neuve `kind`, défaut `tablette`). Les pointages la référencent comme une tablette : aucune contrainte existante n'est relâchée. Au plus un QR fixe actif par entreprise. Désactiver ou régénérer pose `revoked_at` : **rien n'est supprimé**.
- Le QR contient `https://<site>/pointer#f=<id>.<signature>` ; la signature = HMAC(clé serveur, id, sel) n'est **stockée nulle part** (réimpression possible, régénération immédiate). Le fragment `#` ne part jamais vers le serveur du site.
- Fonction `kiosk` : actions du bureau `fixed_status` (état, jeton, `kiosk_enabled`, `has_tablet`, derniers pointages), `fixed_enable` (confirmation obligatoire), `fixed_disable`, `fixed_regenerate` (confirmation), `fixed_point`, `fixed_radius` ; `fixed_status` rend le jeton, le site construit l'adresse (pas d'action « url » séparée). Nouvelles branches dans `ticket` (jeton `f` → ticket `fq`) et `punch` (position exigée).
- **Plafond des essais refusés** : 30 jetons de QR fixe faux en 10 minutes par couple (adresse, QR visé), puis « Trop d'essais » (429) à la place du refus normal. **Le plafond ne gêne jamais un QR valable** : le jeton est vérifié d'abord, la table n'est même pas lue pour un bon QR. Il **ne touche pas au QR de la tablette** et **ne compte pas les échecs d'une autre entreprise** (le seau dépend du QR visé). Table absente (migration pas passée) : aucun plafond.
- Les branches de la tablette (`k`/`c`) sont **inchangées**, sauf qu'une ligne « fixe » y est refusée comme borne inconnue.
- **`revoke`** (« Déconnecter la tablette ») **ne retire jamais une ligne « fixe »** : une fenêtre du bureau restée ouverte avec l'ancienne version du site, qui prendrait le QR fixe pour une tablette, ne le coupe donc pas. Seuls `fixed_disable` et `fixed_regenerate` le coupent.
- **`company_kiosk_active` / `company_has_kiosk` ne sont pas modifiées** : un QR fixe actif y compte comme une borne. Conséquences voulues : l'icône du scanner apparaît chez le salarié ; la règle « avec un QR à scanner, la journée commence par un scan » vaut aussi pour le QR fixe (le chrono du téléphone n'est de toute façon plus proposé à l'écran depuis le lot 12) ; la **saisie à la main n'est jamais bloquée**. Dans une entreprise **sans tablette**, le QR fixe devient donc le seul pointage en direct : les écrans le disent (voir plus haut). C'est un point à confirmer par Ergun (question ouverte).

## Migration

`supabase/migrations/20261011150000_lot12_qr_fixe_position.sql` — **pas encore appliquée**. 100 % additive, **aucune instruction `DROP` ni `DELETE`** hors du retour arrière (commenté), **aucun fichier `_suppressions.sql`** : colonne `kiosks.kind` (+ contrôle, + index unique partiel), 5 colonnes dans `kiosk_settings` (point, précision, date, rayon ; contrôles), `kiosk_punches.in_zone` (+ un index partiel de lecture), table `kiosk_ticket_failures` (un seau par ligne, **sans colonne d'identité donc sans séquence**, clé service seule). Droits repris explicitement (anon et comptes sans accès à la table neuve ; le bureau lit `kind`, jamais le sel). L'en-tête contient le **RETOUR ARRIÈRE** (le QR fixe est d'abord coupé, puis les objets neufs retirés ; les pointages restent), la **VÉRIFICATION APRÈS APPLICATION** (9 × `true`) et la ligne d'**HISTORIQUE**.

**Avant la migration**, l'application et la fonction marchent exactement comme aujourd'hui : la section n'apparaît pas au bureau, un QR fixe scanné répond « pas disponible pour l'instant » avec les autres moyens.

**Ordre de mise en production** : migration, puis redéploiement de la fonction `kiosk` (`supabase functions deploy kiosk --no-verify-jwt`), puis le site. Recharger les fenêtres du bureau déjà ouvertes (la fonction protège déjà le QR fixe contre le « Déconnecter la tablette » d'une ancienne fenêtre, mais l'ancienne fenêtre ne montrerait pas la section).

## Limites connues

- La position est **déclarée par le téléphone** : un frein, pas une preuve (voir plus haut). Ni la fonction ni la base ne peuvent le corriger.
- « Dans la zone : oui » se lit dans la section du QR fixe (20 derniers pointages). Il n'est **pas** montré dans la fiche d'heures : les pointages de la borne ne sont pas rattachés à une ligne d'heures, ce lien serait un autre lot.
- Pas de plage horaire pour le QR fixe : il marche à toute heure, ce que dit l'avertissement.
- L'adresse du client, pour le plafond, est lue comme pour l'appairage (premier élément de `x-forwarded-for`). Si elle est falsifiée, le plafond est contourné ; cela ne donne aucun accès (le jeton est une signature) et la table reste bornée.
- Le plafond ne protège pas le QR de la tablette (6 chiffres) contre un essai répété : cela n'a pas changé avec ce lot.
- Marque « information lue » : par compte et par téléphone (un autre téléphone la remontre). Une mémorisation côté serveur demanderait une table de plus.

## Tester

- `npm run test:qr-fixe` — distance, marge de précision, rayon, jeton, messages selon la tablette, seaux du plafond (Deno).
- `npm run test:kiosk-fonction` — la fonction `kiosk` de bout en bout sur une base simulée : avant la migration (tout comme avant), bureau (activer, point, rayon, régénérer, désactiver, borne coupée), scan (dans la zone, hors zone, imprécis, sans position, double scan, aucune coordonnée gardée, derniers pointages), jeton révoqué / désactivé / faux / autre entreprise, plafond (jamais un QR valable, jamais la tablette, aucune adresse gardée), « Déconnecter la tablette » d'une ancienne fenêtre, QR de la tablette inchangé.
- `npm run test:qr-fixe-db` — la migration sur un Postgres jetable (PGlite) : chargée deux fois, en-tête 9 × `true`, retour arrière puis rechargement, objets existants inchangés, aucune séquence neuve, droits (salarié, bureau, autre entreprise, anonyme), aucune instruction `DROP`/`DELETE` exécutée.
- `npm run build` puis `npm run test:qr-fixe-ecrans` — les vrais écrans (bureau, réglages borne coupée, salarié), avec et sans la migration ; captures dans `docs/captures-qr-fixe/`.
