# Lot 1 — Heures sûres

But : aucune heure perdue, et une confirmation avant toute suppression.

## Ce qui change

**1. « Annuler » après « J’ai fini » (assistant du salarié)**
Avant, « Annuler » effaçait d’abord la ligne d’heures, puis essayait de relancer le chrono. Avec une borne active, la base refuse de relancer le chrono : la ligne avait disparu et le chrono n’était pas revenu.
Maintenant :
- le chrono est relancé d’abord ;
- la ligne n’est retirée que si le chrono est bien reparti ;
- si la base refuse (borne active, mois clos…), la ligne reste et l’assistant dit : « La journée reste terminée : vos heures sont gardées. Corrigez l’heure de fin dans « Ma journée ». » ;
- si la ligne ne peut pas partir après coup, l’assistant relit d’abord la ligne : si elle est encore là, le chrono relancé est retiré (jamais d’heures comptées deux fois) ; si elle est partie (réseau coupé au mauvais moment), le chrono reste, c’est lui qui porte les heures ;
- si le chrono relancé ne peut pas être retiré (après un second essai), l’assistant le dit clairement : « prévenez le bureau pour l’arrêter, sinon ces heures compteront deux fois ».

La même règle s’applique à « Changer ma demande de congé » : la nouvelle demande part d’abord, l’ancienne est retirée ensuite (et relue en cas de doute réseau, pour ne jamais laisser le salarié sans demande). « Annuler » remet l’ancienne avant de retirer la nouvelle, et dit si la nouvelle n’a pas pu être retirée. Une copie de journée, ou une ligne dictée, retouchée ou envoyée depuis n’est plus retirée par « Annuler » : c’est dit.

**2. Confirmation avant toute suppression (les deux assistants)**
Supprimer une intervention, une absence, un document, une dépense, une habilitation ou une invitation ; modifier un document, une dépense ou une habilitation ; côté salarié, effacer ses heures non envoyées, une demande de congé, une photo ou une réserve : l’assistant montre d’abord une carte « Ce qui sera retiré » (ou « remplacé »). Elle dit ce qui part, combien, quels jours, et ce qui reste parce qu’il porte des heures. Pour les heures du salarié et le planning, ces chiffres sont lus en base, et seules les lignes montrées partent au clic. Rien n’est écrit avant le clic ; « Garder » ne change rien. « Annuler » reste possible juste après.
Restent directs, avec « Annuler » : placer, déplacer ou modifier une intervention, poser une absence, ranger un document, créer un client sans budget.

**3. Planning du bureau**
« Supprimer (N) » sur plusieurs cases, ou « Supprimer » sur une case qui porte des heures retirées par le salarié, ouvre une petite fenêtre « Supprimer ? ». Une case seule sans heures se supprime tout de suite, avec « Annuler ».
« Présent » (fenêtre « Statut de … à partir du … ») ne retire plus que l’absence en cours ce jour-là. Un congé posé plus tard reste, et la fenêtre « Retirer N jours d’absence ? » le rappelle. « Annuler » remet l’absence.

**4. Corriger des heures par l’assistant**
Même chemin que la fiche salarié (« Corriger cette journée ») : le motif est obligatoire, le salarié le lit, la correction est tracée (avant, après, motif). Sans motif, le bouton reste grisé.

**5. « Planning de la semaine »**
Après « Appliquer », « Annuler » retire les cases ajoutées. Une case qui porte des heures depuis est gardée, et c’est dit (« Annulé en partie », ou « Rien n’a été retiré »). Dans ce cas « Modifier » ne refait pas l’action : elle serait en double.

**6. Fichier joint**
Quand un fichier est joint, l’assistant ne propose au modèle que les outils de documents (répondre, ranger, créer le client d’un devis, ajouter une dépense, inviter ou coût réel depuis un bulletin). Un PDF piégé ne peut pas demander une suppression, une relance ou un rappel.

**7. Devis**
Le montant d’un devis n’est plus enregistré comme budget main-d’œuvre (il comprend matériaux et marge, et faussait les alertes). La carte l’affiche comme « Montant du devis (HT) », pour information. Seules les heures prévues, si le devis les donne en heures, deviennent un budget.

## Traces
Les heures effacées par l’assistant du salarié sont écrites dans le journal de l’assistant (par exemple : « 1 ligne effacée (Villa Dupont 07:30–12:00) »). Une copie complète de toute suppression faite par la base viendra avec le lot 3.

## Mise en ligne
Aucune migration. Il faut redéployer deux fonctions : `assistant` et `worker-assistant`.
Dès la mise en ligne du site, l’écran applique déjà la confirmation, le motif obligatoire et le refus du devis comme budget (tout est décidé dans le navigateur). Après le redéploiement des deux fonctions : le modèle sait transmettre le motif dit et le montant du devis, la question « Laquelle ? » revient pour les suppressions, et un fichier joint ne donne plus accès qu’aux outils de documents.

## Vérifié
- Tests Deno de `_shared` (et banc d’évaluation hors IA).
- Écran réel, base simulée : `scripts/tests/heures-sures.mjs` (66 vérifications, dont les cas de la relecture : réponse réseau perdue, chrono impossible à retirer, congé, copie, heures dictées, « Présent ») et les harnais existants touchés.
- Captures avant / après : `docs/captures-heures-sures/` (le constat « avant » est dans `avant-constats.txt`).
