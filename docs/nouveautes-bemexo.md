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
| 9 | Borne en planning, « en cours » partout, une seule logique salarié | `feat/lot9-borne-encours` | fusionné (PR 124) — migration + `kiosk` + `worker-assistant` **en production** — [détail](lot9-borne-encours.md) |
| 10 | Finitions d'affichage (plus de flash, barre du haut, réglages en rubriques) | `feat/lot10-finitions` | fusionné (PR 125) — application seule |
| 11 | Simplification : une tablette, sélection multiple, horaire prévu, réserves levées par le salarié, « Clôturer jusqu'au… » | `feat/lot11-simplification` | fusionné (PR 126) — part en prod avec le lot 12 — [détail](lot11-simplification.md) |
| 12 | Pointage QR : entrée / sortie, sortie oubliée fermée la nuit, pause, badges bureau | `feat/lot12-pointage-qr` | fusionné (PR 127, 128) — part avec le lot 11 — [détail](lot12-pointage-qr.md) |
| 13 | Fenêtre Borne : copier le code, lien, légende du QR | `feat/lot13-borne-copier` | fusionné (PR 129) — front seul |
| 14 | Chef d'équipe : toute l'équipe, 7 jours, trace « par le chef d'équipe » | `feat/lot14-chef-equipe` | PR ouverte — [détail](lot14-chef-equipe.md) |

## Règles communes

- Migrations 100 % additives (nouvelles tables, nouvelles colonnes avec valeur
  par défaut). Aucun `DROP`, aucun `RENAME`, aucune policy ou fonction existante
  modifiée.
- Chaque nouveauté est cachée derrière un interrupteur par entreprise,
  désactivé par défaut : rien ne change pour les utilisateurs actuels.
  **Exception demandée par Ergun : le lot 9** (retours de terrain) change
  l'écran pour tous — borne, carte salarié, bandeau du bureau. Voir
  [lot 9](lot9-borne-encours.md). Idem lots 10 et 11 (simplification, voir
  [lot 11](lot11-simplification.md)).
- Les migrations et les fonctions Supabase sont listées dans la PR de chaque
  lot, et appliquées à la main, après validation.
