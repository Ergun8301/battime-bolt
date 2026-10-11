# La borne s'ouvre et reste allumée (lot 2 du plan IA)

Front seulement : aucune migration, aucune fonction à redéployer.

## Ce qui change pour la tablette

1. **L'icône ouvre la borne.** /borne a maintenant son propre manifeste
   (`public/borne.webmanifest`) : nom « BEMEXO Borne », ouverture sur
   `/borne`, plein écran, la tablette peut être tenue dans les deux sens,
   icônes PNG 192 et 512. Les autres pages gardent `public/manifest.json`
   (ouverture sur `/`, téléphone en portrait, comme avant ; seules des icônes
   PNG ont été ajoutées).
2. **Filet de sécurité.** Une tablette déjà reliée qui arrive sur `/`
   (ancienne icône) est renvoyée sur `/borne`, plus sur la vitrine. Sur
   `/landing`, seulement si elle est ouverte depuis une icône installée : un
   visiteur dans un onglet voit toujours la vitrine. Une personne connectée
   (patron, salarié) va toujours dans son espace.
3. **Écran gardé allumé.** Le verrou d'écran est redemandé à chaque toucher,
   quand la tablette le relâche (batterie faible…), au retour sur la page et
   toutes les 60 s. S'il est refusé ou si la tablette ne sait pas le faire, un
   petit rappel apparaît en bas à droite : « Écran non maintenu allumé ·
   réglez la mise en veille sur « Jamais » » (un toucher le masque). Pendant
   les heures de veille, l'écran reste noir mais allumé, comme avant.
4. **Plein écran au premier toucher**, une seule fois (le navigateur exige un
   geste). Rien sur iPhone, qui ne le permet pas. L'icône plein écran marche
   comme avant.
5. **« Borne suspendue » au lieu de déconnecter.** Si la borne est mise en
   pause pour l'entreprise (interrupteur réservé à BEMEXO, même quelques
   minutes), la tablette affiche « Borne suspendue — la borne de pointage est
   en pause pour cette entreprise », reste reliée et revérifie chaque minute ;
   elle repart toute seule. Pendant la pause, l'écran n'est plus forcé allumé
   (la tablette peut se mettre en veille). Le bureau ne peut rien faire pendant
   la pause : **seule la tablette peut alors se déconnecter**, par le lien
   discret « Déconnecter cette tablette » en bas de l'écran, toujours avec
   confirmation. Seule une tablette déconnectée par le bureau, remplacée par
   une autre, ou inconnue, oublie son appairage d'elle-même (comme avant).
6. **Appairage mieux gardé** : la tablette demande au navigateur de ne pas
   effacer ses données pour faire de la place (`navigator.storage.persist()`),
   à l'appairage et à chaque ouverture d'une tablette déjà reliée.

## Ce qui change pour le bureau

Dans la fenêtre « Borne de pointage », une aide repliée **« Installer la
tablette »** : ajouter la borne à l'écran d'accueil, l'ouvrir depuis l'icône
et la relier depuis l'icône (sur iPad l'icône a sa propre mémoire), régler le
verrouillage automatique sur « Jamais », Accès guidé / Épinglage, et remplacer
une ancienne icône.

## À faire une fois sur la tablette actuelle

Supprimer l'ancienne icône BEMEXO, ouvrir `bemexo.com/borne`, « Ajouter à
l'écran d'accueil », puis ouvrir la borne depuis la nouvelle icône. Sur iPad,
la relier de nouveau depuis l'icône (nouveau code du bureau).

## Tests

- `node scripts/tests/borne-allumee.mjs out docs/captures-borne-allumee 42100`
  (après `npm run build`) : manifestes, renvois, verrou d'écran simulé, plein
  écran, 403 / 401 / 410, stockage persistant, aide du bureau.
- Harnais existants relancés : borne-lot9, borne-lot10, borne-lot11,
  admin-lot9/10/11, reglages-lot10/11, tests Deno kiosk. borne-lot9 et
  borne-lot10 tiennent compte du plein écran au premier toucher.

Captures : `docs/captures-borne-allumee/` (`avant-…` = ancienne version,
`apres-…` = cette version). Les icônes PNG ont été tirées du logo
`public/icon-512.svg` avec Chromium (sans nouvelle dépendance).

## Limites connues

- Le verrou d'écran ne peut pas dépasser un refus du système : sur iPad avant
  iPadOS 18.4 (icône installée), seul le réglage « Verrouillage automatique :
  Jamais » garde l'écran allumé.
- Le bureau ne voit pas encore si le verrou est tenu sur la tablette (il
  faudrait l'envoyer avec `sync`, donc toucher la fonction `kiosk`).
- Pas encore de démarrage hors ligne (pas de cache) : une tablette relancée
  sans réseau n'affiche rien tant que le réseau n'est pas revenu.
