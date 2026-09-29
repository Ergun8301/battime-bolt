# Nouveautés BEMEXO — branche d'intégration

Cette branche (`integration/bemexo-ia`) rassemble les 5 lots avant leur mise en
production. Elle n'est **jamais fusionnée dans `main` sans validation d'Ergun**.

Chaque lot arrive par sa propre branche (`feat/…`) et sa propre PR vers cette
branche, fusionnée seulement après validation de la préview.

| Lot | Sujet | Branche | État |
|---|---|---|---|
| 1 | Borne de pointage QR | `feat/borne-qr` (PR 110) / `feat/borne-qr-v2` | 2 versions, choix d'Ergun — en attente de validation de la préview ([détail](borne-pointage.md)) |
| 2 | — | — | — |
| 3 | — | — | — |
| 4 | — | — | — |
| 5 | — | — | — |

## Règles communes

- Migrations 100 % additives (nouvelles tables, nouvelles colonnes avec valeur
  par défaut). Aucun `DROP`, aucun `RENAME`, aucune policy ou fonction existante
  modifiée.
- Chaque nouveauté est cachée derrière un interrupteur par entreprise,
  désactivé par défaut : rien ne change pour les utilisateurs actuels.
- Les migrations et les fonctions Supabase sont listées dans la PR de chaque
  lot, et appliquées à la main, après validation.
