# QR fixe à imprimer + position au scan (lot 12, oct. 2026)

Le bureau peut **imprimer un QR qui ne change pas**, à coller au mur du dépôt. C'est une **option, désactivée par défaut**, et **moins sûre** que le QR de la tablette. Pour compenser, le QR fixe **exige la position du salarié au moment du scan**, une seule fois, et vérifie qu'il est près de l'entreprise. **Aucune coordonnée du salarié n'est gardée.**

Le QR de la tablette, qui change chaque minute, **ne change pas** : jamais de position, aucun nouveau contrôle.

## Côté bureau

Fenêtre « Borne de pointage » (bouton 📟 Borne, ou Réglages → Borne & pointage) → section repliée **« QR fixe à imprimer (option) »**, badge « Désactivé ».

1. **Activer le QR fixe…** L'avertissement est affiché en clair : « Moins sécurisé : une photo de ce QR permet de pointer à toute heure depuis la zone autour de l'entreprise (le salarié doit quand même être connecté à son compte et accepter que sa position soit lue au moment du scan). Le QR de la tablette, qui change chaque minute, reste disponible. » Une confirmation rappelle :
   - d'**informer les salariés** (un écran d'information leur est montré au premier scan), d'inscrire ce traitement au **registre RGPD**, de consulter le **CSE** s'il existe ;
   - que la position n'est lue **qu'au moment du scan**, jamais en continu, et qu'aucune coordonnée du salarié n'est gardée ;
   - que la justice n'admet la géolocalisation pour contrôler le temps de travail **que s'il n'existe pas d'autre moyen** : le QR de la tablette et la saisie à la main restent toujours proposés.
2. **Poser le point ici** — une fois, **depuis votre téléphone, à l'endroit où le QR sera affiché**. Il faut une précision de **100 m ou mieux** ; sinon l'écran le dit (« Précision insuffisante (± 250 m)… Approchez-vous d'une fenêtre ou sortez, puis réessayez. »). Tant que le point n'est pas posé, le QR fixe refuse les pointages (et le dit).
3. **Rayon** : 100 m, **200 m (par défaut)**, 500 m ou 1 km.
4. **Imprimer** : une feuille A4 s'ouvre dans une fenêtre à part (nom de l'entreprise, « QR fixe — moins sécurisé », le QR, une phrase sur la position, la date et une **référence courte** de 4 caractères). On peut réimprimer à tout moment : c'est le même QR.
5. **Régénérer…** (avec confirmation) : un nouveau QR ; **l'ancien QR imprimé cesse aussitôt de marcher**. Le point et le rayon sont gardés.
6. **Désactiver…** (avec confirmation) : plus aucun pointage avec le QR imprimé. Le réactiver plus tard crée un **nouveau** QR.

La section indique aussi la référence, la date de création et le nombre de pointages des 7 derniers jours. « Tablette reliée », « Déconnecter la tablette » et « relier une nouvelle tablette » ne touchent **jamais** au QR fixe (et inversement).

## Côté salarié

Il scanne le QR imprimé avec l'appareil photo du téléphone ou avec le scanner de l'appli (l'icône s'affiche aussi quand seul un QR fixe est actif).

- **Premier scan d'un QR fixe sur ce téléphone** : un écran court « Ce QR demande votre position » — **pourquoi** (une photo pourrait servir ailleurs : on vérifie qu'il est à moins de 200 m de l'entreprise), **une seule lecture** au moment du scan, jamais en continu, **rien n'est gardé** (ni coordonnées, ni trajet : seulement « dans la zone : oui »), **il peut refuser** (« Scannez la tablette, ou ajoutez votre intervention à la main. »). Boutons « Continuer » et « Je refuse ».
- Il se connecte si besoin, puis la position est lue **une fois** (8 secondes au plus), envoyée avec le pointage, et **vérifiée par le serveur**. Arrivée ou départ : même écran que la tablette.
- **Refus de la localisation, position introuvable, hors zone ou trop imprécise** : « Pointage non enregistré » avec le motif et « Scannez la tablette, ou ajoutez votre intervention à la main. », un bouton « Ajouter mon intervention à la main » (son espace) et « Réessayer ».
- Le double scan en moins d'une minute reste refusé (« Déjà enregistré… »). Un compte **actif** de la **même entreprise** reste obligatoire.

## La règle de la zone

Le serveur accepte si la distance au point est au plus **rayon + marge**, la marge étant la précision annoncée par le téléphone, **plafonnée à 100 m** (200 m de rayon, ± 60 m annoncés → 260 m acceptés ; ± 140 m → 300 m au plus). Au-delà de **± 150 m**, la position est jugée **trop imprécise** : refus clair (le cas typique : à l'intérieur, sans GPS). Règles et seuils : `supabase/functions/_shared/fixed-qr.ts`.

## Données personnelles (RGPD)

- **Ce qui est lu** : la position du téléphone, **une fois**, au moment où le salarié scanne le QR fixe et après l'avoir accepté. Jamais avant, jamais après, jamais en continu (pas de `watchPosition`). Le QR de la tablette ne lit jamais la position.
- **Ce qui est gardé** : sur la ligne du pointage (`kiosk_punches.in_zone`), **« dans la zone : oui »**. Les coordonnées du salarié ne sont écrites **nulle part** : ni table, ni journal de la fonction. Le point de référence posé par le bureau est la position de **l'entreprise**, pas celle d'un salarié ; seul le bureau de l'entreprise le lit.
- **Droit de refuser** : refuser (« Je refuse », ou refuser la localisation dans le téléphone) n'empêche jamais de travailler : le QR de la tablette et la saisie à la main restent toujours proposés, et rien n'est reproché au salarié.
- **À faire par l'entreprise** avant d'activer : informer les salariés, inscrire le traitement au registre RGPD, consulter le CSE s'il existe. La jurisprudence (Cass. soc. 2011 et 2018, Conseil d'État 2017) n'admet la géolocalisation pour contrôler le temps de travail que s'il n'existe pas d'autre moyen : c'est pourquoi le QR fixe n'est qu'une **option** à côté de la tablette et de la saisie à la main. **Un avis juridique reste conseillé.**
- **À mettre à jour** : la politique de confidentialité (position lue au scan du QR fixe, rien de gardé).

## Comment c'est fait

- Le QR fixe est **une ligne « fixe » de la table `kiosks`** (colonne neuve `kind`, défaut `tablette`). Les pointages la référencent comme une tablette : aucune contrainte existante n'est relâchée. Au plus un QR fixe actif par entreprise. Désactiver ou régénérer pose `revoked_at` : **rien n'est supprimé**.
- Le QR contient `https://<site>/pointer#f=<id>.<signature>` ; la signature = HMAC(clé serveur, id, sel) n'est **stockée nulle part** (réimpression possible, régénération immédiate). Le fragment `#` ne part jamais vers le serveur du site.
- Fonction `kiosk` : nouvelles actions du bureau `fixed_status`, `fixed_enable` (confirmation obligatoire), `fixed_disable`, `fixed_regenerate` (confirmation), `fixed_point`, `fixed_radius` ; `fixed_status` rend le jeton, le site construit l'adresse (pas d'action « url » séparée). Nouvelles branches dans `ticket` (jeton `f` → ticket `fq`) et `punch` (position exigée). Les branches de la tablette (`k`/`c`) sont inchangées, sauf deux protections : une ligne « fixe » est refusée comme borne inconnue, et les QR refusés sont comptés par adresse (au-delà de 30 en 10 minutes : « Trop d'essais »).
- **`company_kiosk_active` / `company_has_kiosk` ne sont pas modifiées** : un QR fixe actif y compte comme une borne. Conséquences voulues : l'icône du scanner apparaît chez le salarié ; la règle « avec un QR à scanner, la journée commence par un scan » vaut aussi pour le QR fixe (le chrono du téléphone n'est de toute façon plus proposé à l'écran depuis le lot 12) ; la **saisie à la main n'est jamais bloquée**.

## Migration

`supabase/migrations/20261011150000_lot12_qr_fixe_position.sql` — **pas encore appliquée**. 100 % additive, **aucune instruction `DROP` ni `DELETE`** hors du retour arrière (commenté) : colonne `kiosks.kind` (+ contrôle, + index unique partiel), 5 colonnes dans `kiosk_settings` (point, précision, date, rayon ; contrôles), `kiosk_punches.in_zone`, table `kiosk_ticket_failures` (clé service seule). Droits repris explicitement (anon et comptes sans accès à la table neuve ; le bureau lit `kind`, jamais le sel). L'en-tête contient le **RETOUR ARRIÈRE** (le QR fixe est d'abord coupé, puis les objets neufs retirés ; les pointages restent), la **VÉRIFICATION APRÈS APPLICATION** (8 × `true`) et la ligne d'**HISTORIQUE**.

**Avant la migration**, l'application et la fonction marchent exactement comme aujourd'hui : la section n'apparaît pas au bureau, un QR fixe scanné répond « pas disponible pour l'instant » avec les autres moyens.

**Ordre de mise en production** : migration, puis redéploiement de la fonction `kiosk` (`supabase functions deploy kiosk --no-verify-jwt`), puis le site. Recharger les fenêtres du bureau déjà ouvertes.

## Tester

- `npm run test:qr-fixe` — distance, marge de précision, rayon, jeton (Deno).
- `npm run test:kiosk-fonction` — la fonction `kiosk` de bout en bout sur une base simulée : avant la migration (tout comme avant), bureau (activer, point, rayon, régénérer, désactiver), scan (dans la zone, hors zone, imprécis, sans position, double scan, aucune coordonnée gardée), jeton révoqué / désactivé / faux / autre entreprise, plafond, QR de la tablette inchangé.
- `npm run test:qr-fixe-db` — la migration sur un Postgres jetable (PGlite) : chargée deux fois, en-tête 8 × `true`, retour arrière puis rechargement, objets existants inchangés, droits (salarié, bureau, autre entreprise, anonyme), aucune instruction `DROP`/`DELETE` exécutée.
- `npm run build` puis `npm run test:qr-fixe-ecrans` — les vrais écrans (bureau et salarié), avec et sans la migration ; captures dans `docs/captures-qr-fixe/`.
