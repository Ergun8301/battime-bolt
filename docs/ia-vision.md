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

Conversation continue (il se souvient du sujet), bouton « Nouveau chat », historique des conversations. **Décidé le 14 octobre 2026** :

- **Mémoire** : à chaque demande, l'écran envoie les derniers messages de la conversation (7 au plus, 600 caractères chacun, 3000 en tout) et le serveur
  les met dans la consigne du modèle, pour comprendre « et pour Lucas aussi ? », « pareil demain », « annule ça ».
- **Privé, par utilisateur** : seul l'auteur lit son historique. Ni le patron, ni un administrateur de la même entreprise, ni le support BEMEXO ne lisent le
  chat d'un salarié : la base filtre sur l'auteur (pas sur l'entreprise) et la clé de service n'a pas accès à ces tables.
- **Texte seul** : on enregistre le texte des messages (et les liens de navigation de la réponse). Jamais une pièce jointe, jamais une carte d'action (un ancien
  chat rouvert montre du texte ; les cartes d'action ne reviennent pas), jamais un message d'erreur ou de quota. Si l'enregistrement échoue, l'assistant répond
  quand même, et le contenu n'est écrit dans aucune console ni aucun journal.
- **Conservation : 30 jours après la dernière activité**, puis suppression automatique (tâche quotidienne). Un chat où l'on écrit encore ne disparaît pas.
  L'utilisateur peut aussi supprimer un chat, ou tout effacer, quand il veut.
- **Titre automatique** : le début de la première question (60 caractères, espaces réduits), sans appel IA en plus.
- **Bornes** : 200 messages par chat, 100 chats par utilisateur (les moins récemment utilisés partent), 4000 caractères par message.

### 6.1 À mettre en ligne avec la migration

La migration `supabase/migrations/20261014090000_ia_etape2_chats.sql` ne se met pas en ligne seule :

1. **La migration**, puis sa requête de vérification (8 × true, en tête du fichier).
2. **Les fonctions** `assistant` et `worker-assistant` (elles lisent `history` ; avant leur redéploiement elles l'ignorent, rien ne casse).
3. **Le front** : l'écran du chat, qui enregistre par `assistant_chat_append`.
4. **La page Confidentialité** (`app/confidentialite/page.tsx`, section 14), **dans la même mise en ligne que le front, jamais après** : voir 6.2. C'est le même site
   statique ; la page doit donc être corrigée dans le même commit que l'écran.
5. **Le registre des traitements** : la fiche de 6.2 (le registre est tenu hors du dépôt, c'est à Ergun de l'y reporter).

Garde-fou : le test `npm run test:assistant-chats-rls`, dernière section (n), ÉCHOUE tant que la page dit encore « ni votre question, ni la réponse » ou n'annonce pas
les 30 jours que la purge applique.

### 6.2 Information des personnes (RGPD art. 13) et registre des traitements (art. 30)

Avant l'étape 2, la politique de confidentialité disait la vérité en écrivant « Ce que BEMEXO conserve : ni votre question, ni la réponse, ni les pièces jointes ».
Dès que l'écran enregistre, **c'est faux** : le texte des questions et des réponses est gardé 30 jours. L'entreprise cliente (responsable de traitement) s'appuie sur ce texte.

**Ligne à mettre dans la section 14 de la page** (à la place de la ligne actuelle) :

> **Ce que BEMEXO conserve** : le texte de vos conversations avec l'assistant (vos questions, ses réponses et les liens de navigation qu'elles contiennent) est conservé
> **30 jours après la dernière activité**, puis supprimé automatiquement. Il n'est visible que de vous seul dans l'application (ni votre employeur, ni vos collègues, ni le
> support de BEMEXO) et vous pouvez l'effacer à tout moment, une conversation ou tout l'historique. Les pièces jointes ne sont jamais conservées. Un journal garde seulement
> l'action effectuée (qui, quoi, quand, annulée ou non), sans le texte de votre demande, ainsi qu'un compteur quotidien par entreprise pour limiter l'usage.

Dans la même section, la ligne « Ce qui est envoyé » gagne aussi : « … et les derniers messages de la conversation en cours (7 au plus), pour que l'assistant comprenne
« et pour Lucas aussi ? » ». C'est la mémoire du §6, elle part chez les mêmes sous-traitants. Le commentaire de la page qui demande cette relecture (« étape 2 ») peut alors être retiré.

**Fiche pour le registre des traitements** — « Historique des conversations de l'assistant » :

| Rubrique | Contenu |
|---|---|
| Finalité | Permettre à l'utilisateur de retrouver et de continuer ses conversations avec l'assistant (« Nouveau chat », historique). |
| Base légale | Exécution du contrat (fournir le service), comme le reste de l'assistant. |
| Rôles | Entreprise cliente : responsable de traitement. BEMEXO : sous-traitant (art. 28). |
| Personnes concernées | Les utilisateurs de l'assistant (employeur, secrétaire, salariés) des entreprises qui l'ont activé (`ai_enabled`). |
| Données | Texte des questions et des réponses (4000 caractères au plus chacun), liens de navigation de la réponse, titre (début de la 1re question), date, côté (bureau ou salarié), identifiants de l'utilisateur et de l'entreprise. Le texte est libre : il peut citer des collègues, des clients, des chantiers. Jamais de pièce jointe, de carte d'action, de message d'erreur ou de quota. |
| Destinataires | Aucun pour l'enregistrement. (Le contenu d'une demande part chez Anthropic et, en secours, Google pour obtenir la réponse : traitement « assistant IA », section 14 de la politique.) Hébergement : Supabase, Union européenne. |
| Accès | L'auteur seul, dans l'application. Ni l'employeur, ni un administrateur de l'entreprise, ni le support BEMEXO, ni la clé de service. Seul le propriétaire de la base (éditeur SQL) garde l'accès technique que toute table a. |
| Durée | 30 jours après la dernière activité, puis suppression automatique (tâche quotidienne, 03:45 UTC). Suppression immédiate avec le compte du salarié ou l'entreprise. |
| Droits | L'utilisateur supprime une conversation ou tout son historique quand il veut, même si l'entreprise coupe l'assistant. |
| Sécurité | Règles d'accès au niveau base de données (filtre sur l'auteur) ; aucune écriture directe par l'application (une seule fonction) ; le contenu n'est écrit dans aucun journal ni message d'erreur. |

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
