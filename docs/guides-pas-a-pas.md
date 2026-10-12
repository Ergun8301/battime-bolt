# Lot 7 — guides pas à pas (côté salarié)

> « L'assistant doit expliquer au salarié, simplement, quoi faire sur son téléphone. »

Quand un salarié demande « comment je demande un congé ? », l'assistant répond comme avant par une fiche écrite (3 étapes) et un bouton vers l'écran. Il ajoute maintenant **« Me guider pas à pas »** : l'assistant se replie, l'écran s'ouvre, un **anneau jaune entoure le vrai bouton** à toucher, et une carte en bas dit une phrase très simple par étape.

Le guide **montre, il ne fait jamais** : aucun toucher à la place du salarié, rien d'envoyé, rien d'écrit en base, aucune donnée qui sort.

## Comment ça marche

| Pièce | Rôle |
|---|---|
| `supabase/functions/_shared/worker-tours.ts` | Les fiches de guidage : `{ id, etapes: [{ ecran?, cible, texte }] }`. Sans dépendance : lu par le navigateur **et** par la fonction |
| `components/guide-tour.tsx` | Le composant **commun** (il ne connaît ni le salarié ni le bureau) : `steps`, `onStepEnter(step, index)`, `onClose`, `returnFocus?` |
| `data-guide="…"` | L'ancre posée sur le vrai bouton, dans le code des écrans (attribut seulement : aucun changement de comportement, de classe ni de style) |
| `worker-assistant-core.ts` | `WORKER_GUIDE[].id` (stable) et `workerGuideLinks(g)` : le raccourci vers l'écran, **puis** `{ label: 'Me guider pas à pas', action: 'guide:<id>' }` quand la fiche a un guidage. Même helper pour la voie locale et la voie modèle |
| `app/poseur/page.tsx` | `onNavigate('guide:<id>')` : replie l'assistant, lance le guide ; `onStepEnter` prépare l'écran (menu du compte, semaine, « Mes congés », « Informations »…). Un id inconnu est ignoré |

L'`id` d'une fiche d'aide (`WORKER_GUIDE`) est celui de sa fiche de guidage. Les fiches dont le raccourci est `ask:…` (collègues, assistant) n'ont pas de bouton à entourer : pas de guide.

## Ce que fait le composant

- **Carte** en bas (feuille basse, zone sûre iPhone) : « Étape 2 sur 4 », la phrase, **Précédent / Suivant (Terminer à la fin) / Fermer**, tous ≥ 44 px. Elle passe **en haut** quand elle cacherait la cible ou des boutons (bouton collé en bas, feuille de molette).
- **Anneau** : la cible + 4 px, `pointer-events: none` (les touchers passent). Il suit le défilement, le redimensionnement et la rotation (événements + `ResizeObserver` + filet de sécurité). Il fait défiler la liste pour montrer une cible hors écran.
- **Le salarié touche le vrai bouton** : le guide avance tout seul (clic en capture, et appui + relâché pour les boutons qui réagissent dès l'appui, comme le menu du compte). Au dernier pas, toucher la cible termine le guide.
- **Échap** ferme le guide **seul** (la fenêtre ouverte dessous reste), **Fermer** aussi ; le focus revient au bouton qui l'avait lancé, sinon au bouton ✨ de la barre du bas.
- **Accessibilité** : `role="dialog"` non modal, phrase en `aria-live="polite"`, focus sur la carte à l'ouverture, `prefers-reduced-motion` (ni pulsation ni entrée animée, défilement sans animation), contraste noir / crème / jaune de l'app.
- **Au-dessus** de l'écran et des fenêtres de l'app (z-index 60, au-dessus des fenêtres Radix à 50, pour qu'on puisse toujours continuer), **sauf** devant une **boîte de confirmation** (`data-guide-confirm`, ex. « Retirer ce chantier ? ») qui ne contient pas la cible : le guide passe dessous. Un guide dont la cible est dans une fenêtre se pose au-dessus d'elle.

## Cible absente ou cachée (jamais de blocage)

Le composant réessaie ~1,5 s, puis :

- **absente** (écran pas prêt, fonction éteinte pour l'entreprise, autre état) : « *Je ne vois pas ce bouton sur votre écran.* » + la phrase de l'étape, sans anneau ;
- **cachée** par une fenêtre ou une feuille ouverte : « *Ce bouton est caché par une fenêtre. Fermez-la pour le voir.* » ;
- « Suivant » marche toujours. Le composant **continue de chercher** : si le bouton apparaît plus tard (le salarié ferme la fenêtre), l'anneau revient.

Une étape qui dépend d'un état le dit dans sa phrase (« Dans la fiche du chantier, touchez… », « S'il y a un pointage en cours… »).

## Ajouter une fiche

1. Donner un `id` (slug) à l'entrée de `WORKER_GUIDE` si elle n'en a pas, et vérifier qu'elle se fait sur un écran.
2. Ajouter dans `worker-tours.ts` : `{ id, etapes: [{ ecran?, cible, texte }] }`, **1 à 5 étapes**, **140 caractères au plus** par phrase, une seule idée.
3. Poser `data-guide="ecran.bouton"` sur le vrai élément (une ancre = un élément par écran ; si elle est répétée à dessein — les 5 états du bouton « Envoyer ma journée », la liste des cartes — l'ajouter à `REPETEES` dans le test, avec la raison).
4. `ecran` = **navigation seulement** : `journee`, `semaine`, `mois`, `historique`, `conges` (ouvre la fenêtre « Mes congés »), `infos` (ouvre « Informations »), `menu` (ouvre le menu du compte). Jamais `notifications`, `photo` ni `borne` : ce sont des gestes qui agissent, le salarié les touche lui-même. Absent = on reste où on est, menu refermé.
5. Lancer `npm run test:guides`.

### Langage

Vouvoiement, phrases courtes, mots simples, **« Touchez »** (jamais « cliquez »), le libellé exact du bouton entre « ». Pas de jargon (brouillon, statut, synchronisation…). Une phrase « pourquoi » seulement quand elle évite une erreur.

## La règle des ancres et du test

`npm run test:guides` (Deno, `supabase/functions/_shared/worker-tours.test.ts`) vérifie :

- chaque fiche a un `id` qui existe dans `WORKER_GUIDE`, sans doublon ;
- 1 à 5 étapes, texte non vide de 140 caractères au plus, terminé par un point ; aucun mot de la liste de jargon, aucun tutoiement ;
- chaque `cible` existe comme `data-guide` dans `app/` et `components/` ; aucune ancre en double (hors `REPETEES`), aucune ancre posée mais jamais visée ;
- chaque libellé cité entre « » existe dans le code des écrans (même normalisation que `assistant-aide.test.ts`) ;
- chaque entrée de `WORKER_GUIDE` à lien d'écran a un guide (et les entrées `ask:` n'en ont pas) ;
- chaque réponse « guide » du serveur — voie locale **et** voie modèle (faux appel `repondre`) — contient le lien `guide:<id>` **exactement quand** la fiche existe, après le raccourci ;
- le composant n'appelle ni réseau, ni `.click()`, ni stockage ; la page du salarié n'ouvre, pour une étape, que de la navigation.

Un bouton renommé, une ancre retirée : le test casse, on met le guide à jour dans le même commit.

`scripts/tests/guides-lot7.mjs` (`npm run test:guides-ecrans`, après `npm run build`) rejoue tout dans un vrai navigateur : téléphone 390×844 et 360×640, tablette 768, ordinateur 1280 ; l'anneau pile sur la cible, les 23 guides, les vrais toucher, Échap / Fermer / focus, le menu qui s'ouvre et se referme, la cible absente ou cachée, les boîtes de confirmation, le défilement et la rotation, le mouvement réduit, **aucune écriture** pendant les guides.

Captures : `docs/captures-lot7b/` (la réponse avec les deux boutons, l'anneau sur le nom, l'étape dans la fenêtre « Mes congés », la carte en haut pour un bouton collé en bas, un bouton caché par la molette, une boîte de confirmation au-dessus du guide).

## Mise en ligne : front d'abord, fonction ensuite

1. **Le front** (cette PR) : sans « Me guider pas à pas » côté fonction, rien ne change pour le salarié (le bouton n'apparaît pas).
2. **Puis la fonction `worker-assistant`** (redéploiement par fichier-pointeur ; elle emporte le nouveau fichier `_shared/worker-tours.ts`). Aucune migration.

Dans l'autre ordre (fonction avant front), l'ancien écran reçoit le bouton « Me guider pas à pas » et appelle `onNavigate('guide:…')` : sa chaîne de `if` n'a pas de cas pour cette action, **il ne se passe rien** (aucune erreur, aucun mauvais écran) ; sur téléphone le panneau se replie, sur grand écran il reste ouvert. Un bouton qui ne répond pas : c'est pourquoi l'ordre est front, puis fonction.

## Pour le bureau et le support (lot suivant)

Le composant est générique : une fiche par fonction et par rôle, ses ancres `data-guide` dans les écrans du bureau, un test sur le même modèle, et la même ligne `onNavigate` côté bureau. Les 23 fiches salarié (chef d'équipe compris) sont dans `worker-tours.ts`.
