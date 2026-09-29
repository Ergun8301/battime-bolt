# Nouveautés BEMEXO — branche d'intégration

Cette branche (`integration/bemexo-ia`) rassemble les 5 lots avant leur mise en
production. Elle n'est **jamais fusionnée dans `main` sans validation d'Ergun**.

Chaque lot arrive par sa propre branche (`feat/…`) et sa propre PR vers cette
branche, fusionnée seulement après validation de la préview.

| Lot | Sujet | Branche | État |
|---|---|---|---|
| 1 | Borne de pointage QR | `feat/borne-qr` | fusionné (PR 110) — **en production** (migration + fonction `kiosk`) |
| 2 | Coût réel d'un salarié (bulletin de paie) | `feat/cout-salarie` | fusionné (PR 112) — **en production** (migrations + `payslip-read`) |
| 3 | Assistant BEMEXO (bureau) | `feat/assistant-bureau` | fusionné (PR 114) — **en production** (migration + `assistant`) |
| 3 bis | Assistant qui agit et qui forme (bureau, puis salarié) | `feat/assistant-actions` | PR ouverte — [détail](assistant-actions.md) |
| 4 | Assistant BEMEXO (salarié) | `feat/assistant-salarie` | fusionné (PR 115) — pas en production — [détail](assistant-salarie.md) |
| 5 | Accès support BEMEXO | `feat/acces-support` | PR ouverte — [détail](acces-support.md) |

## Règles communes

- Migrations 100 % additives (nouvelles tables, nouvelles colonnes avec valeur
  par défaut). Aucun `DROP`, aucun `RENAME`, aucune policy ou fonction existante
  modifiée.
- Chaque nouveauté est cachée derrière un interrupteur par entreprise,
  désactivé par défaut : rien ne change pour les utilisateurs actuels.
- Les migrations et les fonctions Supabase sont listées dans la PR de chaque
  lot, et appliquées à la main, après validation.
