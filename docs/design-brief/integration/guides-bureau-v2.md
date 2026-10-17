# Guides pas à pas du BUREAU pour le planning v2 (lot 1) : prêts, ÉTEINTS

Interrupteur unique : `GUIDES_BUREAU_UI2` dans `supabase/functions/_shared/guides-bureau-ui2.ts` (**`false`** à la livraison du lot 1).
Textes v2 : `supabase/functions/_shared/admin-tours-v2.ts` (`ficheV2`, appliquée par `admin-tours.ts` seulement quand l'interrupteur est `true`).

**Éteint, rien ne bouge** : `ADMIN_TOURS` est exactement la liste d'avant, l'empreinte `guideForPrompt` du bureau reste
`5766f6e975044b6dd3cd6964b8ab2b1414b51fd9ae7b89aa6002fa44d0273198` (test `admin-tours.test.ts`, `npm run test:guides-bureau` : 28 verts, dont trois nouveaux
qui vérifient que les guides v2 sont éteints, que seules deux cibles changent, et que toutes les ancres v2 existent dans `components/design/bureau/`).

## Ce qui change dans le planning v2 (README du designer, « un seul accès par fonction »)

| Cible (`data-guide`) | Texte v1 (ordinateur) | Texte v2 (ordinateur) | Téléphone v1 → v2 |
|---|---|---|---|
| `bureau-nav.couts` (fiches `couts`, `depense`) | Cliquez sur « Coût chantiers » (« Coûts » sur un écran étroit). | **2 étapes** : `bureau-nav.plus` « Cliquez sur « Plus ⋯ ». », puis `bureau-nav.couts` « Cliquez sur « Coût chantiers ». » | « Touchez « Coût chantiers ». » (inchangé : ligne du ☰) |
| `bureau-nav.versions` (fiche `versions`) | Cliquez sur la petite flèche ⟲, en haut à gauche du planning. | **2 étapes** : « Plus ⋯ », puis « Cliquez sur « Versions du planning ». » | « Touchez « Versions du planning (semaine affichée). » » → « Touchez « Versions du planning ». » (le ☰ v2 n'a plus la précision entre parenthèses) |

Ce qui ne change PAS (même ancre, même place, même texte) : `bureau-nav.salaries`, `.clients`, `.reserves`, `.selection`, `.exporter`, `.borne`, `.abonner`, `.assistant`, `.compte` (nom de l'entreprise) puis `.reglages` (Réglages de l'entreprise, dans le menu du compte), `.menu` (☰), `bureau-semaine.nav`, `bureau-planning.*`, `bureau-stat.*`, `bureau-clients.*`, `bureau-selection.*`, `bureau-edit.*`.

Doublons retirés par la planche (README §1) et leur effet sur les guides :

| Doublon retiré | Où il reste | Guide concerné |
|---|---|---|
| « Formations » dans Salariés et dans le menu du compte | « Plus ⋯ » (`menu-trainings`) | aucun guide pas à pas du bureau ne le cite (la fiche d'aide de l'Assistant, si) |
| « Envoyer par e-mail » dans le menu du compte | « Plus ⋯ » (`menu-email`) | idem |
| « Réglages » dans le menu du compte ET le ☰ | menu du compte sur ordinateur, ☰ sur téléphone (comme avant pour les guides) | aucun changement |
| ⟲ « Versions » dans le coin de la grille | « Plus ⋯ » | fiche `versions` (ci-dessus) |
| compteurs « congés » et « réserves » de l'ancienne barre noire | badges de « Salariés » et « Réserves » | aucun |

## À faire à la bascule du bureau (pas avant)

1. `GUIDES_BUREAU_UI2 = true` ET `BUREAU_UI2_PAR_DEFAUT = true` (`lib/use-bureau-ui2.ts`) dans le même commit.
2. Mettre à jour l'empreinte déclarée dans `admin-tours.test.ts` (SHA de `guideForPrompt`) : les fiches d'aide de l'Assistant sont dans la consigne du modèle ; régénérer `avant-3b1.snapshot.json` comme les trois exceptions documentées du README du registre.
3. Redéployer la fonction `assistant` (seule celle-là change) ; évaluer les phrases d'aide avant mise en ligne.
4. Rejouer `guides-bureau-lot7.mjs` en `/admin?ui=2` (les étapes « Plus ⋯ » s'ouvrent à la main : le menu est un état local du planning v2, le guide ne l'ouvre pas).

Limite connue : le guide n'ouvre pas « Plus ⋯ » à la place du patron (jamais d'écran qui agit) ; l'étape « Plus ⋯ » entoure le bouton, la suivante entoure la ligne qui n'existe qu'une fois le menu ouvert.
