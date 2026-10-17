# Guides du bureau pour la v2 « Heures et paie » : préparés, ÉTEINTS

Lot 2 du design bureau (`?ui=2` sur aperçu ou en local, interrupteur `BUREAU_UI2_PAR_DEFAUT = false` dans `lib/use-bureau-ui2.ts`).

**Rien n'est branché.** `supabase/functions/_shared/admin-tours.ts` n'est pas touché : l'empreinte `guideForPrompt` du bureau (SHA `5766f6e9…3198`, `admin-tours.test.ts`) est intacte (`npm run test:guides-bureau` : 25 / 25). Les textes v2 sont dans `supabase/functions/_shared/admin-tours-ui2.ts` (`GUIDES_BUREAU_UI2 = false`, aucun import dans le reste du code). Seule modification du test : la liste `DUAL` (une ancre peut exister deux fois, l'écran d'avant OU sa v2, jamais les deux ensemble), avec sa raison.

## Tableau cible | texte v1 (aujourd'hui) | texte v2

| Fiche · cible | Texte v1 | Texte v2 |
|---|---|---|
| `demandes_conge` · `bureau-conges.liste` | Repérez la bonne demande, puis cliquez sur la coche ✓ pour accepter ou sur la croix ✗ pour refuser. (mobile : touchez la coche ✓ … la croix ✗) | Repérez la bonne demande, puis cliquez sur « Accepter » ou sur « Refuser ». (mobile : touchez) |
| `corriger` · `bureau-fiche.corriger` | Sur une journée déjà envoyée, cliquez sur « Corriger les heures ». | Cliquez sur la ligne de la journée envoyée, puis sur « Corriger ». **Ancre à poser** : la ligne (voir plus bas) |
| `corriger` · `bureau-fiche.corriger-valider` | Tapez le motif, puis cliquez sur « Corriger et prévenir ». | inchangé |
| `export` · `bureau-export.menu` | Choisissez la période, puis ouvrez « Exporter » et choisissez un format : cela verrouille les heures. | Choisissez la période, puis cliquez sur « PDF », « Excel » ou « CSV paie » : cela verrouille les heures (une alerte vous dit combien de lignes avant). |
| `export` · `bureau-export.comptable` | Ou « Envoyer à » votre comptable (son adresse se règle dans les Réglages). | Ou « Envoyer » au comptable (son adresse se règle dans les Réglages). |
| `cloture` · `bureau-export.mois` | … puis cliquez sur « Clôturer » : ses heures sont verrouillées. | … puis cliquez sur « Clôturer… » : ses heures sont verrouillées. |
| `reouvrir` · `bureau-export.mois` | … puis cliquez sur « Rouvrir ». | … puis cliquez sur « Rouvrir… ». |
| `telecharger` · `bureau-export.un-salarie` | Pour télécharger sans rien verrouiller, cliquez sur « Un seul salarié ? » et choisissez-le. | inchangé |
| `telecharger` · `bureau-export.menu` | Pour toute l'équipe : période, puis « Exporter ». Attention : cela verrouille les heures de la période. | Pour toute l'équipe : période, puis « PDF », « Excel » ou « CSV paie ». Attention : … |
| `cloture_salarie` · `bureau-fiche.exporter` | Pour récupérer ses heures, cliquez d'abord sur « Exporter » (cela ne verrouille rien). | … cliquez d'abord sur « Exporter ce salarié (sans verrou) ». (mobile : touchez d'abord « Exporter ») |

## Ancres qui bougent ou manquent en v2 (à traiter AVANT d'allumer)

- `bureau-fiche.corriger` : le bouton « Corriger » est dans la fiche de la ligne (on y arrive en cliquant une ligne de la feuille d'heures). La fiche « corriger » aura donc un pas de plus, avec une ancre sur la ligne (`bureau-fiche.ligne`), qu'une fiche doit viser (sinon le test « Ancres posées mais jamais visées » échoue).
- `bureau-fiche.cloturer` (fiche « cloture_salarie ») : « Clôturer jusqu'au… » n'est plus dans la feuille d'heures (la planche le range dans l'onglet « Gérer », EQ09/EQ10, lot 3). Il faudra un pas « onglet Gérer » (`bureau-fiche.onglet-gerer`) avant ce pas. En v2, tant que le lot 3 n'est pas livré, l'onglet « Gérer » montre l'ancienne fiche (qui garde ce bouton).
- Libellés « Exporter ▾ » (menu) : en v2 trois pastilles ; `bureau-export.menu` désigne leur groupe.

## Pour allumer (à la bascule du bureau)

1. `GUIDES_BUREAU_UI2 = true` ; faire lire `TEXTES_HEURES_V2` par `admin-tours.ts` à la place du texte v1 de la même `cible` (et `v2Mobile`).
2. Poser les deux ancres ci-dessus, ajouter les deux pas, adapter les tests `admin-tours.test.ts` (ancres, DUAL qui disparaît quand l'écran d'avant est supprimé).
3. Régénérer l'empreinte `guideForPrompt` avec sa justification, puis redéployer la fonction qui porte les fiches d'aide (le texte des guides est lu par l'assistant du bureau).
