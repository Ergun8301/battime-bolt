# Pointage salarié : alerte de chevauchement avec le pointage en cours, raccourcis après le scan

Lot 10. Front seul : aucune migration, aucune fonction edge, rien côté assistant.

## Ce que ça fait

### 1. L'alerte « Votre pointage est encore en cours »

Quand le salarié touche **OK** sur une intervention ajoutée à la main (ou dont il a changé les heures) et que ces heures recouvrent son pointage **en cours** du jour, une fenêtre s'ouvre au lieu d'écrire une ligne qui bloquerait ensuite l'envoi de la journée. Elle dit en français simple (vouvoiement) ce qui se passe, et ne laisse jamais le salarié devant un refus muet.

| Situation | Ce que dit la fenêtre | Boutons |
|---|---|---|
| L'intervention commence après le début du pointage et avant maintenant | « Vous pouvez terminer le pointage à HH:MM, l'heure où commence cette intervention : il comptera de … à HH:MM. » + la consigne pour la borne | **Terminer le pointage à HH:MM, puis ajouter** (ou « …, puis enregistrer » pour une modification) ; **Corriger les heures** |
| Elle commence avant (ou à la minute près) le début du pointage | « Le pointage a commencé à … : une intervention ne peut pas commencer avant. » + comment s'en sortir | Corriger les heures |
| Elle commence plus tard que maintenant | « Il est … : cette intervention commence à …, plus tard. » + comment s'en sortir | Corriger les heures |
| Terminer le pointage à cette heure chevaucherait une ligne déjà notée | Nomme la ligne (et dit si elle est déjà envoyée : seule la secrétaire peut la corriger) | Corriger les heures |
| La fonction de fermeture n'existe pas encore sur le serveur | « Terminer le pointage à une heure précise n'est pas disponible pour l'instant. » | Corriger les heures |

« Terminer le pointage à HH:MM » ferme le pointage à l'heure où l'intervention commence, par **la même fonction serveur que « Terminer ma journée »** (`finish_active_session`, une seule écriture atomique côté serveur), puis enregistre l'intervention par le chemin habituel. Le bouton, dans une fenêtre qui annonce toutes les conséquences, vaut la confirmation. « Corriger les heures » ferme la fenêtre : la fiche reste ouverte avec la saisie, rien n'est écrit.

Garde-fous, dans l'ordre :

1. Toutes les validations de la fiche passent d'abord (heures, chevauchement entre lignes, pause, chantier choisi) : on ne ferme jamais un pointage pour se heurter ensuite à un refus de la fiche.
2. L'alerte n'apparaît que si les **heures ont changé** (ajout, ou heures modifiées). Noter une observation, une pause ou une réception sur une ligne qui chevauchait déjà reste possible.
3. Seul le pointage **du jour de Paris affiché** compte. Un pointage d'un autre jour (« Sortie oubliée ») ou une fiche ouverte à cheval sur minuit : aucune alerte, comportement d'avant.
4. Mois clôturé, salarié clôturé : comportement d'avant (le refus habituel s'applique, l'alerte n'est pas ouverte).
5. Avant de fermer, le pointage est relu : s'il a changé ou disparu entre-temps (borne, autre appareil), rien n'est fermé et un message l'explique.
6. Si la réponse du serveur se perd (réseau), on relit le pointage avant de parler : « Le pointage semble avoir été terminé », et **aucune** ligne n'est ajoutée (pas de doublon). On ne dit jamais « Rien n'a été modifié » sans l'avoir vérifié.
7. Hors ligne : **jamais bloqué** (règle d'or de l'appli). Pas de fenêtre ; la saisie part dans la file du téléphone comme aujourd'hui, avec le message « Votre pointage est encore en cours : ces heures seront vérifiées au retour du réseau. » Le contrôle habituel de l'envoi prend le relais au retour du réseau.

### 2. Raccourcis juste après le scan (`/pointer`)

Sous « Ouvrir mon espace », sur l'écran de succès uniquement (jamais sur « Pointage annulé », ni sur une erreur ou un refus) :

- après une **arrivée** : **Ajouter une intervention faite avant** : ouvre la fiche « + » avec fin = heure d'arrivée (elle ne chevauche donc pas le pointage qui démarre) ;
- après un **départ** : **Envoyer ma journée** et **Ajouter une intervention** (fiche « + » qui commence à l'heure de fin du pointage qui vient d'être enregistré).

« Envoyer ma journée » n'envoie rien à lui seul : il ouvre `/poseur` avec la fenêtre « Envoyer votre journée maintenant ? », qui demande « Oui, envoyer ma journée » ou « Pas maintenant ». Après le « oui », l'envoi garde toutes ses questions habituelles (sortie à compléter, chevauchement, horaires prévus, pause, total de plus de 10 h).

Pas de bouton « Terminer » : après une arrivée, un départ scanné moins d'une minute plus tard annule tout (lot 9) ; après un départ, il n'y a plus de pointage à terminer. Le libellé « Terminer ma journée » reste réservé au bouton du pointage en cours.

Comment ça marche : le lien est calculé **au toucher** (l'écran de succès peut rester ouvert des heures) et porte `?a=…&t=…&u=…&h=…`. `/poseur` le lit **une seule fois**, dans un effet, efface aussitôt l'adresse (un rechargement ou un retour arrière ne rejoue rien), puis agit dans les trois minutes, pour le même compte, sur la journée d'aujourd'hui. Valeurs fermées (`ajouter`, `avant`, `envoyer`) ; au pire, un lien fabriqué fait ouvrir une fiche vide ou une fenêtre de confirmation. Les raccourcis n'écrivent rien et ne demandent aucune position.

## Comment tester sur téléphone

Entreprise fictive, salarié fictif (Karim Benali), tablette reliée.

1. Scanner l'arrivée à la borne. L'écran vert propose « Ajouter une intervention faite avant » (pas « Envoyer ma journée »). Le toucher ouvre `/poseur` sur la fiche « + » (fin = heure d'arrivée) ; l'adresse n'a plus de `?a=` ; recharger la page ne rouvre rien. Laisser l'écran vert ouvert 15 minutes puis toucher : ça marche toujours.
2. Avec un pointage ouvert depuis une heure ou plus : ajouter une intervention qui commence plus tard mais avant maintenant. L'alerte propose « Terminer le pointage à HH:MM, puis ajouter » et rappelle la consigne sur la borne ; « Corriger les heures » garde la saisie.
3. Toucher « Terminer… » : le pointage se ferme à l'heure de début, l'intervention est ajoutée, plus de carte « Tu es pointé », « Envoyer ma journée » ne parle pas de chevauchement.
4. Une intervention qui commence avant le début du pointage, puis une qui commence plus tard qu'« il est » : deux explications différentes, aucun bouton « Terminer ».
5. Sans choisir de chantier, taper OK sur une intervention qui chevauche : « Choisis un chantier », aucune alerte, le pointage tourne toujours.
6. Mode avion : saisir une intervention qui chevauche : elle est enregistrée sur le téléphone, avec le message « sera vérifiée au retour du réseau ». Réseau revenu : au moment d'envoyer, le contrôle habituel s'applique.
7. Bouton « retour » d'Android avec la fenêtre ouverte : elle se ferme, l'appli reste ouverte.
8. Scanner le départ à la borne : l'écran propose « Envoyer ma journée » et « Ajouter une intervention ». « Envoyer ma journée » ouvre `/poseur` avec « Envoyer votre journée maintenant ? » ; rien ne part avant « Oui, envoyer ma journée ». « Ajouter une intervention » ouvre une fiche qui commence à l'heure de fin du pointage.
9. Scanner le départ moins d'une minute après l'arrivée : « Pointage annulé », aucun raccourci.
10. Après « Terminer à HH:MM », scanner à la borne en partant : c'est une arrivée (la fenêtre l'annonce). **À dire à l'équipe.**
11. QR fixe (si activé) : le flux position / information est inchangé.

## Limites connues

1. **Fenêtre de course avec la borne.** La fonction de fermeture agit sur « le pointage courant du salarié », pas sur un pointage identifié. Le pointage est relu juste avant la fermeture (aucun autre appel entre les deux), mais si la borne le fermait puis en ouvrait un nouveau dans ces quelques dizaines de millisecondes, la fermeture viserait le nouveau, avec une fin plus ancienne que son début : le serveur l'effacerait (`cancelled`). Acceptée faute de migration ; le message « annulé ou a changé » est donc prudent.
2. **Horloge du téléphone.** « Maintenant » (garde « pas dans le futur ») et la date de Paris viennent de l'horloge du téléphone. Un téléphone en avance peut contourner la garde ; le serveur accepte une fin future. L'enjeu est le propre pointage du salarié, qui peut déjà saisir à la main n'importe quelles heures.
3. **Hors ligne : jamais bloqué.** L'alerte n'est pas ouverte sans réseau. Une intervention qui chevauche le dernier pointage connu est mise en file ; le contrôle existant à l'envoi (`overlapBlocks`) la bloquera au retour du réseau, avec son message actuel.
4. **Un pointage démarré à la borne il y a quelques secondes** est vu grâce à une relecture au moment du « OK » (en ligne, délai de 3 s). Hors ligne, seul le dernier pointage relu (toutes les 30 s) est connu.
5. **Dépend du lot 9 pour l'offre « Terminer à HH:MM ».** Si `finish_active_session` n'est pas appliquée en production, l'offre disparaît d'elle-même (fenêtre « pas disponible », un seul bouton « Corriger les heures ») ; rien n'est écrit, aucun arrondi (on n'utilise volontairement pas le repli `stop_active_session`, qui arrondit au quart d'heure et ferme de façon irréversible). L'alerte, elle, reste utile.
6. **Trace d'origine.** La ligne issue de « Terminer à HH:MM » est écrite par `finish_active_session` avec l'origine `qr` (le pointage existe encore à l'insertion), mais son heure de **fin** a été choisie par le salarié sur son téléphone. Le bureau ne peut pas la distinguer d'un vrai scan de départ (même situation que la « sortie oubliée ») ; aucune colonne ni signalement en base (pas de migration). Le message de succès dit que l'heure a été choisie par le salarié. Les raccourcis de `/pointer` n'écrivent rien et ne laissent aucune trace.
7. **Après « Terminer à HH:MM », le pointage n'existe plus** : un scan en partant sera lu comme une **arrivée** et ouvrira un pointage parasite que la fermeture nocturne transformera en « sortie oubliée à compléter ». La fenêtre donne la consigne (« ne scannez plus en partant : ajoutez vos dernières heures à la main ») ; **à diffuser à l'équipe**.
8. L'**Assistant** ne compare pas au pointage en cours : il peut encore créer le chevauchement que l'écran refuse (fichiers d'assistant hors périmètre).
9. « Terminer ma journée » (bouton du pointage) ne contrôle pas les lignes existantes : une ligne manuelle qui chevauchait déjà le pointage (créée avant ce lot, ou par l'Assistant) bloque toujours l'envoi, avec le texte existant.
10. « Envoyer ma journée » reste permis pendant qu'un pointage du jour est ouvert (comportement actuel, non modifié).
11. Un admin qui scanne arrive toujours sur `/connexion` en touchant les liens (existant, non modifié).
12. **Tutoiement / vouvoiement.** Les nouveaux textes vouvoient (consigne du lot, comme `/pointer`) ; l'écran `/poseur` voisin tutoie (« Choisis un chantier »…). Ce mélange est connu et laissé en l'état.
13. La molette de l'écran ne propose que des quarts d'heure : la minute de tolérance (un recouvrement d'une minute est accepté) se vérifie dans les tests Deno, pas dans le test navigateur.

## Retour arrière

Revenir à la version précédente du site. Aucune donnée à défaire.

## Tests

- `npm run test:pointage-regles` : règles pures (`live-clash.test.ts`, `after-scan.test.ts`).
- `npm run build` puis `npm run test:pointage-ecrans` : vraies pages `/poseur` et `/pointer` sur base simulée, 390 px.

## Captures (390 × 844) : `docs/captures-pointage-lot10/`

`alerte-terminer`, `alerte-avant`, `alerte-collision`, `alerte-indisponible`, `envoi-confirmer`, `pointer-arrivee`, `pointer-depart`.
