# Vision de l'Assistant BEMEXO — cahier des charges décidé avec le patron

Écrit le 14 octobre 2026 d'après les demandes d'Ergun. Ce document est la référence : tout chantier sur l'assistant doit
s'y conformer, et rien de ce qui est écrit ici ne doit être « oublié parce qu'on ne l'a pas dit ».

## 1. Le principe

**Tout ce que l'interface sait faire, l'assistant sait le faire.** Il ne doit PAS être limité aux mots ou aux exemples cités
par le patron : le patron ne peut pas tout énumérer. Quand quelqu'un a une question ou une demande, il la pose à
l'assistant au lieu de la poser à Ergun, comme dans un chat avec Claude ou ChatGPT : en langage naturel, sans mots-clés,
phrases longues comprises, en français et en turc.

L'assistant ne « cherche pas des mots » : il comprend. Les anciens repères par mots-clés (guides, lecteur local) ne sont
qu'un raccourci de rapidité, jamais une limite.

## 2. Ce qu'il doit pouvoir faire

- **Répondre** à toute question sur l'entreprise (heures, chantiers, planning, équipe, documents…) et sur BEMEXO.
- **Naviguer** : ouvrir une page, une fenêtre, un pop-up, un formulaire, un tableau, un papier — jusqu'à l'écran d'impression.
- **Remplir** : formulaires, fiches clients, fiches salariés, plannings, interventions, tâches, absences, documents,
  dépenses… « tel qu'on le lui a demandé », y compris en plusieurs actions d'une seule phrase (une seule fiche de validation).
- **Lire** : PDF, photos, documents, dans n'importe quel format raisonnable (voir §5), et en tirer des champs à remplir.
- **Accompagner** : le salarié bloqué (« je ne sais pas quoi appuyer »), le patron, la secrétaire. Guider pas à pas, montrer
  où cliquer, ou faire à sa place quand on le lui demande.
- Être **rapide et fluide** : réponse qui démarre vite, pas d'écran figé, pas de formulaire à ressaisir.

Option (gratuite si simple) : le même assistant en lecture seule dans l'accès support de BEMEXO (/support).

## 3. Qui a le dernier mot — trois niveaux

| Niveau | Quoi | Comportement |
|---|---|---|
| 1. Libre | Lire, répondre, guider, ouvrir une page / fenêtre / formulaire, pré-remplir | Immédiat, sans confirmation |
| 2. Fait, annulable | Actions courantes et réversibles (créer une intervention, une tâche, un client, une absence, affecter, corriger un pointage…) | Exécuté tout de suite, avec « Annuler » / « Modifier » (comportement du lot 7) |
| 3. Dernier clic humain | Actions importantes ou difficiles à défaire : envoi des heures au comptable / export (verrouille les heures), envoi des journées, clôture d'un mois, suppression définitive, envoi d'e-mails à plusieurs personnes, abonnement et paiement, droits d'accès | L'assistant prépare tout ; l'utilisateur fait LE dernier clic (« j'envoie ou pas ? ») |

Liste du niveau 3 VALIDÉE par le patron le 14 octobre 2026 : envoi des heures au comptable / export, envoi des journées, clôture d'un mois,
suppression définitive, e-mails groupés, abonnement et paiement. Tout le reste est au niveau 2 (fait, avec « Annuler »). En cas de doute sur
une action nouvelle, elle va au niveau 3 jusqu'à décision du patron.

## 4. Garde-fous qui ne changent pas

- L'assistant agit avec **les droits de l'utilisateur qui parle** (son jeton, sa RLS) : jamais plus.
- Aucune donnée de paie sensible envoyée au modèle ; aucune question ni réponse dans les journaux ; pièces jointes jamais stockées.
- Le modèle ne dispose d'aucun accès direct à la base : il appelle des actions déclarées, qui exécutent le même code que l'interface.
- Quotas par entreprise et par jour, plafond de dépense dans la console du fournisseur.

## 5. Fichiers lus

Claude lit nativement : images (JPEG, PNG, WebP, GIF) et PDF. À convertir avant l'envoi : photos HEIC/HEIF d'iPhone
(conversion à l'écran ou secours Gemini), documents Word / Excel / PowerPoint / texte / CSV (extraction du texte côté serveur).
Un format vraiment illisible se dit clairement, jamais en silence.

## 6. Mémoire et chat

Conversation continue (il se souvient du sujet), bouton « Nouveau chat », historique des conversations (par utilisateur,
privé : ni le patron ni BEMEXO ne lisent le chat d'un salarié). Titre automatique, durée de conservation à décider.

## 7. Règle anti-oubli (la plus importante)

Pour qu'une fonction ne soit jamais « oubliée parce qu'on ne l'a pas dite à l'IA » :

1. **Un registre d'actions** : chaque écran / fenêtre / formulaire / écriture déclare ses capacités (identifiant, description
   en langage clair, paramètres, niveau 1-2-3, code exécuté). Les outils de l'assistant sont GÉNÉRÉS depuis ce registre.
   Ajouter un bouton à l'interface = l'ajouter au registre = l'assistant le sait.
2. **Un test de couverture** : il parcourt toutes les entrées de l'interface (fenêtres, formulaires, fonctions d'écriture
   de lib/*-writes.ts, ancres data-guide) et ÉCHOUE si l'une n'a ni outil dans le registre ni mention explicite
   « réservé à l'humain » avec sa raison. Ce test est lancé avec les autres : on ne peut plus oublier en silence.
3. **Une évaluation réelle** : un jeu de phrases (français et turc, phrases longues, plusieurs actions, fautes, argot du
   bâtiment) rejoué avant chaque changement de modèle ou d'outils ; objectif 90 % de réussite par catégorie.

## 8. Modèle et coûts

Claude Sonnet 5.5 (`claude-sonnet-5-5`) par défaut ; Gemini en secours automatique et en retour arrière par un seul réglage
(`AI_CONFIG`). Clé : secret `ANTHROPIC_API_KEY`. Un seul réglage bascule, aucun redéploiement. Les modèles Opus / Fable /
Mythos sont refusés (coût), comme les modèles Pro de Gemini.

## 9. Étapes

1. **Brancher Claude** (adaptateur, secours Gemini, évaluation sans toucher la prod) — en cours.
2. **Mémoire** : conversations enregistrées, « Nouveau chat », historique.
3. **Registre d'actions + test de couverture**, puis **boucle d'outils** : le modèle lit à la demande (planning, salarié,
   chantier…), navigue, remplit et propose, au lieu d'un instantané figé et d'une seule fonction forcée.
4. **Fichiers** : tous les formats du §5, remplissage de formulaires depuis un document.
5. **Fluidité** : réponses en flux, cache du prompt, budget par entreprise, alerte à 80 %.
6. **Évaluation** : 90 % par catégorie, bureau et salarié, français et turc.
