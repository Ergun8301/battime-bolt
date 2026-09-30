# Lot 8 — L'Assistant sait revenir en arrière

Toujours derrière **`companies.ai_enabled`**. Effacer se fait **tout de suite**,
avec **« Annuler »** qui remet tout à l'identique (même 30 cases d'un coup).

## Comment « Annuler » restaure tout

- Avant d'effacer, l'écran **lit chaque ligne en entier** (identifiant, horaires,
  notes, auteur…). « Annuler » la remet **telle quelle** (`lib/erase.ts`).
- Un document : le fichier est gardé en mémoire, puis redéposé au même endroit.
- Chaque effacement **et** chaque annulation sont notés dans le journal
  `assistant_journal` (qui, quoi, quand, annulé ou non).
- Au-delà de **10 éléments**, la carte affiche le nombre (« 27 cases effacées »)
  et un bouton **« Annuler : tout remettre »** bien visible.
- L'annulation vit avec la conversation (elle survit à un redessin de l'écran) ;
  après un rechargement de la page, elle n'est plus proposée.

## Jamais effacé

| Interdit | Ce que fait l'Assistant |
|---|---|
| Heures envoyées ou validées | Refus en une phrase : « corrigez les heures » à la place |
| Mois clôturé | Les cases de ce mois sont gardées, et il le dit |
| Export de paie | Refus en une phrase |
| Case du planning avec des heures notées | Gardée (la base le refuse aussi), et il le dit |
| Clients, chantiers, salariés | **Archivés**, jamais effacés |

## Inventaire — chaque « créer » a son « modifier » et son « supprimer / annuler »

### Bureau

| Créer | Modifier | Supprimer / annuler |
|---|---|---|
| Intervention (`affecter_planning`) | `modifier_intervention` | **`supprimer_intervention`** |
| Planning de la semaine (`planning_semaine`) | `modifier_intervention` (case par case) | **`effacer_planning`** (un salarié ou toute l'équipe, jour / période / semaine) |
| Absence, congé (`poser_absence`) | `poser_absence` (les nouvelles dates remplacent) | **`supprimer_absence`** |
| Client / chantier (`creer_chantier`) | `modifier_client` | `archiver_client` (jamais effacé) |
| Invitation (`inviter_salarie`) | `relancer_invitation` | **`annuler_invitation`** |
| Salarié (après invitation) | `modifier_salarie`, `changer_role` | `archiver_salarie` (jamais effacé) |
| Document de chantier (`ranger_document`) | **`modifier_document`** (catégorie, nom) | **`supprimer_document`** |
| Dépense (`ajouter_depense`) | **`modifier_depense`** | **`supprimer_depense`** |
| Habilitation (`ajouter_habilitation`) | **`modifier_habilitation`** | **`supprimer_habilitation`** |
| Réponse à un congé (`repondre_conge`) | — | « Annuler » sur la carte |
| Réserve levée (`lever_reserve`) | — | « Annuler » sur la carte |
| Correction de pointage (`corriger_pointage`) | une nouvelle correction | ✗ heures envoyées : jamais effacées |
| Clôture du mois (`cloturer_mois`) | — | ✗ interdit |
| Réglages (`modifier_reglages`) | `modifier_reglages` | — |
| Rappel, relance (message envoyé) | — | — (un message parti ne se reprend pas) |

### Salarié (ce qu'il a saisi, tant que ce n'est pas envoyé)

| Créer | Modifier | Supprimer / annuler |
|---|---|---|
| Heures (dictées, copiées) | `modifier_heures` | **`effacer_heures`** (la journée ou une ligne, non envoyées) |
| Demande de congé | **`modifier_conge`** (en attente) | **`annuler_conge`** (en attente) |
| Pointage démarré | `terminer_pointage` (heure de fin) | **`annuler_pointage`** |
| Réserve signalée | `signaler_reserve` (détail) | **`retirer_reserve`** (journée non envoyée) |
| Photo / document | — (la catégorie se change au bureau) | **`retirer_photo`** (les siens) |
| Panier repas | `panier_repas` | `panier_repas` (retirer) |
| Réserve corrigée sur place | — | « Annuler » sur la carte |
| Journée envoyée | ✗ (le bureau corrige) | ✗ |
| Nouveau chantier | — | ✗ (le bureau archive) |

## Évaluation

Phrases ajoutées au jeu (`supabase/functions/assistant-eval/cases.ts`) : b34–b45 (bureau),
s26–s33 (salarié).

| Jeu (vrai modèle `gemini-3.5-flash-lite`) | Résultat |
|---|---|
| « Effacer » : b34–b45 (bureau) + s26–s33 (salarié) | **20 / 20** |
| Non-régression : b01–b28, b32, s01, s04, s08, s13, s16, s17, s23, s24 | **36 / 36** |

Test navigateur (vraie page planning, base simulée) :
`node scripts/tests/assistant-effacer.mjs out docs/captures-ia-supprimer` →
30 cases, 3 avec des heures (gardées, et c'est dit), **27 cases effacées**,
« Annuler : tout remettre » → les 30 cases reviennent **à l'identique** (6 / 6).
