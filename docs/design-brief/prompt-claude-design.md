Bonjour. C'est toi qui as dessiné la première version de BEMEXO (identité, couleurs, polices) : tu connais le produit. Aujourd'hui je te demande de REDESSINER deux écrans, et je te laisse une vraie liberté.

LES DEUX ÉCRANS
1. La page principale du bureau : le planning de la secrétaire et du patron (route /admin). Ordinateur d'abord, utilisable aussi sur téléphone et tablette.
2. La page principale du salarié (route /poseur, avec /pointer). Téléphone d'abord, sur chantier, parfois sans réseau.

CE QUE JE TE DEMANDE
Repenser l'intuition et le parcours de l'utilisateur : la hiérarchie, la manière de lire un planning, de saisir ses heures, d'envoyer sa journée, de trouver une action. Tu peux changer l'organisation, les couleurs, les formes, la composition, les gestes, les mots d'accroche. Je veux des différences, des idées audacieuses, pas un simple ravalement. Je ne te dis rien du dessin : c'est ton travail de designer.

CE QUI NE PEUT PAS BOUGER : LES FONCTIONS
Tout ce que l'écran sait faire aujourd'hui doit rester faisable. Les trois documents joints sont ta référence :
- fonctions-bureau.md : ce que fait l'écran du bureau, avec une liste de contrôle B1 à B72.
- fonctions-salarie.md : ce que fait l'écran du salarié, avec une liste de contrôle S1 à S104.
- integration-technique.md : les contraintes techniques pour que ton design s'encastre dans le code existant.
Ces documents décrivent les FONCTIONS, les données, les règles métier et les états. Ils ne décrivent volontairement pas l'apparence actuelle. Si une phrase te semble t'imposer un choix de design, ignore-la et dis-le-moi. Tu peux regrouper, fusionner, déplacer ou renommer des fonctions, mais aucune ne doit disparaître sans que tu le dises.

LA FORME DE LIVRAISON (détails dans integration-technique.md)
- Des composants React présentationnels (props et callbacks), sans appel à la base de données ni au réseau.
- Les jetons de design (couleurs, rayons, ombres, espacements, typographie) dans UN seul fichier CSS.
- Des données d'exemple réalistes pour chaque état.
- Une attention particulière à l'accessibilité et aux zones tactiles.
- Les repères techniques listés dans integration-technique.md (section « Ce qui doit rester stable ») restent sur les éléments, même déplacés.

CE QUE JE VEUX EN RETOUR, POUR CHAQUE ÉCRAN
1. La liste de contrôle (B1 à B72, S1 à S104) : chaque ligne marquée couverte, regroupée ou déplacée, avec où et pourquoi.
2. Tous les états dessinés (vide, chargement, hors-ligne, erreur, verrouillé, etc., voir la section « États » des cahiers) sur téléphone, et sur ordinateur pour le bureau.
3. Le tableau des composants (nom, zone, props, callbacks).
4. Le fichier de jetons, et les dépendances ajoutées s'il y en a (idéalement aucune).

COMMENT TRAVAILLER
Commence par le salarié : c'est l'écran le plus simple à valider. Montre-moi d'abord ton parcours et deux directions différentes avant de tout détailler. Si deux documents se contredisent, ou si un point est impossible techniquement, pose-moi la question au lieu de choisir en silence.
