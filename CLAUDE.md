# BEMEXO : consignes pour Claude

## Au début de chaque session

1. **Relire le « Journal des changements importants » ci-dessous** avant toute action : il dit où en est le projet, ce qui a été décidé et ce qui reste à faire.
2. Pour l'historique plus ancien (avant le 19 octobre 2026) : `docs/REPRISE.md`.

## Tenue du journal

- À chaque **lot terminé** (PR fusionnée) ou **décision majeure** (choix produit, base de données, mise en ligne, client), ajouter **une ligne en haut du tableau**.
- Une ligne = **date** (AAAA-MM-JJ) · **ce qui a changé** · **pourquoi** · **ce qui reste à faire**. Phrases courtes ; numéro de PR quand il y en a une.
- Ne jamais réécrire ni supprimer une ligne passée. Si une chose est faite plus tard, l'écrire dans une nouvelle ligne.
- Le journal se met à jour dans la même PR que le changement qu'il décrit (ou dans une petite PR à part pour une décision sans code).

## Journal des changements importants

| Date | Ce qui a changé | Pourquoi | Reste à faire |
|---|---|---|---|
| 2026-10-21 | Ce fichier CLAUDE.md et son journal | Garder la mémoire du projet d'une session à l'autre | Le tenir à jour à chaque lot ou décision |
| 2026-10-21 | Décision : prochains chantiers à ouvrir chacun dans un nouveau chat Claude Code : zones de déplacement (réglage par entreprise : modèle BTP 1 à 5 de 10 en 10 km, personnalisé ou aucun), NFC (puce qui contient le lien du QR fixe), publication Play Store puis App Store | Éviter une PR trop grosse ; chaque sujet a ses risques | Expliquer le plan avant de coder ; montants des indemnités fournis par le comptable ; App Store : compte Apple (99 €/an), D-U-N-S, Mac ou service de compilation en ligne |
| 2026-10-21 | Mister Kebab Grill : rien de fait côté phase 2 (essai toujours `trialing`, fin le 23 oct. ; 15 salariés préparés, invitations jamais envoyées) | Ergun n'a pas encore donné son « ok » | Remettre l'essai de 30 jours à zéro, renvoyer les invitations après validation de la liste des 15 salariés ET du texte du mail, puis tableau de contrôle. Aucune suppression de données, aucun envoi sans son accord |
| 2026-10-21 | PR #239 fusionnée : « Envoyer à sa place » et « Valider ses heures » (intervention prévue sans saisie) ; « Tout valider » (salarié ou entreprise, jour, semaine ou mois ; boutons dans l'en-tête du jour, la case, la fenêtre de statut, la tuile « À relancer », la liste Salariés, la feuille d'heures ; bouton noir pour l'équipe) ; documents du salarié (bureau + appli salarié) ; menu du compte toujours visible ; icônes sur les fiches | Demandes d'Ergun : le bureau doit pouvoir valider les heures quand le salarié confirme par téléphone, sans chercher le bouton | Lecture des documents par l'IA (colonnes `ai_summary` / `ai_read_at` prêtes) ; vérifier la mise en ligne Cloudflare |
| 2026-10-21 | Base de production : colonne `time_entries.submitted_by` ; table `worker_documents` + bucket privé `worker-docs` (SQL collé par Ergun dans Supabase, vérifié : RLS, 6 règles) | Trace de qui a envoyé ou validé au nom du salarié ; documents par salarié | — |
| 2026-10-21 | PR #237 et #238 : le menu du compte reste sous la barre au défilement ; la légende du planning s'ouvre par un bouton ⓘ | Retours d'Ergun sur le bureau | — |
| 2026-10-20 | PR #236 : hébergement sur Cloudflare Pages, blocage des essais expirés actif, mentions légales | Passage sur Cloudflare | Préview de branche : `https://<branche>.bemexo.pages.dev` |
| 2026-10-19 | PR #234 : le nouveau bureau (v2) devient le défaut ; porte de secours `/admin?ui=1` | Fin de l'intégration du design du bureau | — |
