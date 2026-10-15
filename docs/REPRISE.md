# Point de reprise (15 octobre 2026) — à lire en premier dans un chat neuf

## Ce qui est EN LIGNE et vérifié
- Assistant IA : Claude Sonnet 5.5 (Gemini en secours), chat avec mémoire (30 jours), registre d'outils + test de couverture, listes d'outils générées, **ouvrir 27 écrans** (secret `AI_ETAPE3` posé par le patron en mode `pilote` pour K Habitat). Mesures réelles : 160/160 anciens cas, « Ouvrir » 77/94 avant correction turque puis 21/22 turc.
- Fonctions Supabase : assistant v30, worker-assistant v23, assistant-eval v43 (déploiement par fichier pointeur vers un sha GitHub, voir docs/ia-etape3/05-journal.md).
- Tout le cœur métier (pointage, validation, export, clôture, borne, formations…) est déjà en production : **le produit est vendable tel quel** ; le reste est de l'amélioration.

## Ce qui est EN COURS / ARRÊTÉ (rien n'est cassé, rien de fusionné)
- Intégration du design salarié (plan : docs/design-brief/audit-salarie/03-plan-integration.md ; audit final : 05-audit-final.md). Étapes 0-1 (filets + alléger, invisibles) **partiellement faites, non fusionnées** sur la branche `claude/determined-mayer-dnhach` (commits WIP). Décision : design FIGÉ, on s'appuie sur la planche finale du designer, on corrige soi-même focus/portail Radix/requêtes.
- IA 3c (lire les données + boucle d'outils) : agent arrêté très tôt ; worktree local `worktree-agent-a487badefd04615f2` (peut avoir disparu). Spec : docs/ia-etape3/00-conception-etape3.md §4.

## Défauts connus à traiter (petits)
1. « Ajoute un salarié, son prénom c'est pierre, son nom c'est Xavier » : le modèle renvoie parfois des champs vides (formulaire vide). Ancien défaut. Piste : améliorer la consigne et mesurer sur le vrai modèle (PAS de règles de mots-clés). Rapport : scratchpad `enquete-salarie-nouveau.md` (perdu avec la session ; résumé : prepare l.1022 prend seulement les arguments du modèle).
2. CI GitHub Actions ne se déclenche plus depuis la PR #201 (aperçus Netlify/Cloudflare OK) : probable quota/facturation Actions ; à vérifier dans l'onglet Actions de GitHub.
3. test:assistant-aide a été réparé et ajouté à la CI ; `borne.gestion` et `historique.supprimees` reportés.

## Décisions de cap (patron + avis externes)
- Un agent à la fois (quota d'abonnement limité, remise à zéro le dimanche).
- Relectures adverses seulement pour la sécurité (droits, paie, suppression). Évaluation 260 phrases : une fois avant mise en ligne d'un lot, pas à chaque retouche.
- IA : finir 3c version réduite (≈ 8 lectures bureau + 3 salarié) puis geler ; 3d (écritures niveau 2/3 généralisées) après les premiers clients.
- Design : finir le salarié ; bureau limité au cœur (planning, validation, export, clôture) tant que le dossier B1–B72 n'est pas livré.
- Le patron a donné l'autorisation permanente d'agir sur GitHub, Supabase, Cloudflare, Netlify pour BEMEXO (fusion, déploiement, migrations additives) ; les SECRETS restent posés par lui.
