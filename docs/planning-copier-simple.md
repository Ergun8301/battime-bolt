# Copier une case du planning, simplement

## Ce que ça change pour vous

Avant, pour **copier** une intervention il fallait maintenir **Ctrl** (Windows) ou **⌥ Option** (Mac) en la glissant. Personne ne le devinait, et sur téléphone il n'y avait aucun moyen de copier.

Maintenant :

1. **Une astuce bien visible** reste sous la barre du planning, jusqu'à ce que vous cliquiez sur **Compris**.
   - Sur ordinateur : « Copier une case : cliquez dessus puis « Copier vers… », ou glissez-la en maintenant Ctrl (Windows) ou ⌥ Option (Mac). »
   - Sur téléphone et tablette : « Copier une case : touchez-la puis « Copier vers… ». » (pas de Ctrl : le doigt n'en a pas)
   - Le petit **?** la réaffiche (dans le coin en haut à gauche de la grille ; sur téléphone, à côté de « Sélectionner »).
   - L'ancienne bulle d'aide du navigateur (qui disparaissait en une seconde) n'existe plus.
2. **Cliquez (ou touchez) une intervention** : la fenêtre s'ouvre comme avant. En bas, une rangée **Actions** :
   - **Copier vers un autre jour…** : vous choisissez un ou plusieurs jours (même une autre semaine, même un autre salarié), puis « Copier ».
   - **Dupliquer au lendemain** : un seul geste, la case est copiée sur le jour suivant.
   - **Ajouter une tâche à ce créneau** : ouvre la fenêtre des tâches, avec les heures du créneau déjà écrites (vous les changez si besoin). Une tâche peut être avant, pendant ou après le créneau.
   - **Supprimer** : le même bouton qu'avant, avec les mêmes questions et les mêmes protections. Il est seulement rangé ici, plus grand.
3. **« ＋ Tâche »** apparaît sur chaque case qui contient déjà une intervention (ordinateur et téléphone). Un clic ouvre la fenêtre des tâches pour ce salarié et ce jour. Il n'apparaît pas un jour d'absence, ni en mode « Sélectionner », ni si les tâches ne sont pas activées.
4. **« Formations »** se voit enfin : dans le menu du compte (en haut à droite) et, sur les grands écrans (1440 px et plus), dans la barre du haut. L'entrée dans « Salariés » reste.

Rien d'autre ne change : mêmes couleurs, même grille, mêmes règles, même impression. **Ctrl ou ⌥ + glisser** marche exactement comme avant (avec son message « Annuler »).

## Les mêmes règles que la copie par glisser

La copie écrit une seule ligne de planning neuve : le chantier, l'horaire prévu et la note. **Jamais** les heures du salarié, ni les documents, ni le pointage. L'original ne bouge pas. Une copie est refusée (on le dit, rien n'est écrit) si :

- le salarié est **absent** ce jour-là ;
- le **mois est clôturé**, ou les heures du **salarié sont clôturées** ;
- la **même intervention aux mêmes heures** est déjà dans la case ;
- les **heures prévues chevauchent** une autre intervention du jour.

Dans « Copier vers… », les jours refusés sont grisés et la raison est écrite en dessous.

Une case dont les **heures sont déjà envoyées** peut être copiée (comme avec Ctrl), mais pas supprimée (« Heures envoyées — non supprimable », comme avant).

## Ce qui n'a PAS été fait (à la demande d'Ergun)

- **Pas de bouton « Annuler »** après un déplacement ou une copie par « Copier vers… » / « Dupliquer ». Le message dit simplement ce qui a été fait (« Case copiée sur mar. 21 et mer. 22 »). Une copie en trop se retire avec « Supprimer ». (Le message « Annuler » du glisser avec Ctrl, qui existait déjà, est inchangé.)
- **Pas de refonte de « Versions du planning »** : cette fenêtre, ses textes et ses guides sont exactement ceux d'avant.

## Comment tester

### Sur ordinateur (souris ou pavé tactile)

1. Ouvrez le planning : l'astuce est sous la barre. Cliquez **Compris** : elle disparaît, le **?** apparaît en haut à gauche de la grille. Rechargez la page : elle reste fermée. Cliquez **?** : elle revient.
2. Cliquez une intervention, puis **Dupliquer au lendemain** : la copie apparaît le lendemain. Un message vert le dit.
3. Cliquez une intervention, puis **Copier vers un autre jour…** : cliquez deux ou trois jours (ils deviennent jaunes), puis **Copier sur ces jours**. Essayez les flèches ‹ › pour la semaine suivante.
4. Essayez un jour où la personne est absente : il est grisé, la raison est écrite.
5. Dans la fenêtre, changez l'horaire **sans enregistrer** : « Copier » et « Dupliquer » attendent (« Enregistrez d'abord… »).
6. Sur une case aux heures envoyées : « Supprimer » est refusé, « Dupliquer » marche.
7. Sur une case de salarié déjà planifié, cliquez **＋ Tâche** : la fenêtre s'ouvre sur « Tâche ». Ou, dans la fenêtre d'une intervention, **Ajouter une tâche à ce créneau** (08:00 → 12:00 déjà écrits). Une tâche 10:00–11:00 passe sans alerte ; 13:00–14:00 demande « Ajouter quand même ? ».
8. En haut à droite, le menu de l'entreprise propose **Formations**.

### Sur téléphone

1. L'astuce est en haut de la liste du jour (sans mot « Ctrl »). **Compris** la ferme, le **?** (à côté de « Sélectionner ») la réaffiche.
2. Touchez une intervention : en bas de la fenêtre, faites défiler jusqu'à **Actions**. Tous les boutons font au moins 44 px de haut.
3. **Copier vers un autre jour…** : touchez les jours, puis « Copier ».
4. **＋ Tâche** est à droite de « Ajouter un chantier » sur la carte de chaque salarié déjà planifié.

## Limites

- « Copier vers… » propose de 4 semaines avant à 26 semaines après la semaine affichée. Les semaines autres que celle de l'écran sont lues **seulement quand vous les ouvrez** dans la fenêtre, puis **relues au moment de copier** (rien n'est lu en plus au chargement de la page).
- Les copies ne reprennent que ce qui est **enregistré** : une modification non enregistrée bloque « Copier » et « Dupliquer » le temps de cliquer sur « Enregistrer ».
- « Dupliquer au lendemain » prend le jour d'après tel quel (le vendredi donne le samedi). Pour sauter le week-end, utilisez « Copier vers… ».
- Le bouton « Formations » de la barre n'apparaît qu'à partir de 1440 px de large (avec le mot à partir de 1700 px) : en dessous, la barre est déjà pleine (Borne, assistant, congés, réserves…). Le menu du compte et « Salariés » le proposent à toutes les largeurs.
- Rien n'est écrit sans votre clic, rien n'est supprimé en plus de ce que « Supprimer » faisait déjà, aucun changement de base de données.

## Pour les développeurs

- `components/planning-copier.tsx` (premier chargement, léger) : l'astuce (mémoire `localStorage` dans un `try/catch`, clé `bemexo-astuce-copier-case`), le « ? », la rangée « Actions ».
- `components/planning-copy-dialog.tsx` (chargé à l'ouverture, `lib/lazy-window`, jamais préchauffé) : le choix des jours. Il n'écrit rien.
- `components/admin-planning.tsx` : `copyOne` est l'**unique** écriture d'une copie. `copySlot` (glisser avec Ctrl ou Alt, avec son « Annuler ») et `copyToDays` (« Copier vers… », « Dupliquer au lendemain ») l'appellent. Les règles sont `copyRefusal` / `targetRefusal` (`supabase/functions/_shared/copy-slot.ts`), l'écriture `addPlanningSlot` (`lib/planning-writes.ts`). « Supprimer » est le `deleteAffectation` d'avant, le bouton est seulement déplacé dans la rangée.
- Les traces (lot 3) sont écrites par la base comme pour toute copie (origine « écran »). Aucune écriture de version n'est ajoutée.
- `components/missions-office.tsx` : `DayTasksPanel` accepte `defaultStart` / `defaultEnd` (heures pré-remplies) et affiche l'aide « Une tâche peut être avant, pendant ou après le créneau du salarié. ».
- Test : `npm run test:planning-copier-ecrans` (après `npm run build`).
- Captures : `docs/captures-planning-copier/` (astuce à 1280 et 390 px, fenêtre avec « Actions » à 1280 et 390 px, « Copier vers… » à 390 px, barre avec « Formations » à 1440 px).
- Test existant adapté : `scripts/tests/planning-lot2.mjs` cherchait l'ancienne info-bulle (`title`) des bulles ; il vérifie maintenant que la bulle n'a plus de `title` ET que l'astuce visible écrit la même consigne (Ctrl ou ⌥ + glisser pour copier). Son écran de test passe de 900 à 1200 px de haut : la grille est un peu plus longue (astuce, « ＋ Tâche »), et à 900 px les dernières lignes passaient sous le bord, ce qui faisait défiler la page pendant les glissers.
