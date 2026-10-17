# Guides pas à pas du BUREAU pour le planning v2 (lot 1, re-habillé « v2b Couleur ») : prêts, ÉTEINTS

Interrupteur unique : `GUIDES_BUREAU_UI2` dans `supabase/functions/_shared/guides-bureau-ui2.ts` (**`false`**).
Textes v2 : `supabase/functions/_shared/admin-tours-v2.ts` (`ficheV2`, appliquée par `admin-tours.ts` seulement quand l'interrupteur est `true` ; `AIDE_V2` pour la fiche d'aide de l'Assistant).

**Éteint, rien ne bouge** : `ADMIN_TOURS` est exactement la liste d'avant, l'empreinte `guideForPrompt` du bureau reste
`5766f6e975044b6dd3cd6964b8ab2b1414b51fd9ae7b89aa6002fa44d0273198` (test `admin-tours.test.ts`, `npm run test:guides-bureau` : 28 verts, dont trois
qui vérifient que les guides v2 sont éteints, que seules les cibles prévues changent, et que toutes les ancres v2 existent dans `components/design/bureau/`).
`AIDE_V2` n'est lue par aucun code tant que l'interrupteur est éteint (elle n'entre pas dans le paquet du navigateur) ; la fiche « borne » de `assistant-actions-core.ts` garde sa phrase d'avant.

## Ce qui change dans le planning v2b (README du designer §1 « un seul accès par fonction », §4 barre en deux niveaux)

| Cible (`data-guide`) | Texte v1 (ordinateur) | Texte v2b (ordinateur) | Téléphone v1 → v2b |
|---|---|---|---|
| `bureau-nav.couts` (fiches `couts`, `depense`) | Cliquez sur « Coût chantiers » (« Coûts » sur un écran étroit). | **2 étapes** : `bureau-nav.plus` « Cliquez sur « Plus ⋯ ». », puis `bureau-nav.couts` « Cliquez sur « Coût chantiers ». » | « Touchez « Coût chantiers ». » (inchangé : ligne du ☰) |
| `bureau-nav.versions` (fiche `versions`) | Cliquez sur la petite flèche ⟲, en haut à gauche du planning. | **2 étapes** : « Plus ⋯ », puis « Cliquez sur « Versions du planning ». » | « Touchez « Versions du planning (semaine affichée). » » → « Touchez « Versions du planning ». » |
| `bureau-nav.borne` (fiche `borne`) — **v2b** | Cliquez sur « Borne ». (bouton de la barre de semaine) | **2 étapes** : « Plus ⋯ », puis « Cliquez sur « Borne ». » (la Borne est une ligne de « Plus ⋯ », avec Formations et Envoyer par e-mail) | « Touchez « Borne ». » (inchangé : ligne du ☰) |
| `bureau-planning.ajouter` (fiche `affecter`, téléphone seulement) — **v2b** | Touchez « Ajouter un chantier » sous le salarié voulu. | (ordinateur : étape « case vide », inchangée) | « Touchez « + » à droite du nom du salarié voulu. » |

Fiche d'aide de l'Assistant (consigne du modèle) — **v2b** : fiche `borne`, 1re étape. v1 « Bouton « Borne » dans la barre du planning (ou Réglages → … ». » → v2b `AIDE_V2.borne` « Menu « Plus ⋯ » du planning → « Borne » (ou Réglages → « Borne & pointage » → « Relier la tablette »). … ».

**Nouvelles places, mêmes phrases** (v2b) : `bureau-nav.clients`, `.salaries`, `.reserves` sont maintenant dans la **barre noire du haut** (niveau 1 : Planning, Statistiques | Clients, Salariés, Réserves), mêmes intitulés, mêmes fenêtres : « Cliquez sur « Clients » / « Salariés » / « Réserves » » reste juste, le guide entoure le bouton où qu'il soit. « Sélectionner », « Exporter » et « Plus ⋯ » sont dans la barre de semaine (niveau 2), « Réglages de l'entreprise » dans le menu du compte (inchangé).

Ce qui ne change PAS (même ancre, même texte) : `bureau-nav.selection`, `.exporter`, `.abonner`, `.assistant` (devenu un bouton en contour), `.compte` puis `.reglages`, `.menu` (☰, « Menu » au téléphone), `bureau-semaine.nav`, `bureau-planning.case|bulle|nom|autre`, `bureau-stat.relance` (le bandeau replié « N journées à relancer » ; absent quand il n'y en a pas, la phrase dit « S'il y a des journées à relancer »), `bureau-stat.liste`, `bureau-clients.*`, `bureau-selection.*`, `bureau-edit.*`.

**L'astuce « Copier une case »** ne recouvre plus la grille : elle est sous la grille, à gauche, tant qu'on ne l'a pas fermée (« Compris » ; le « ? » de l'en-tête « 8 salariés » la fait revenir). Même texte, mêmes gestes.

Doublons retirés par la planche et leur effet sur les guides :

| Doublon retiré | Où il reste | Guide concerné |
|---|---|---|
| « Formations » dans Salariés et dans le menu du compte | « Plus ⋯ » (`menu-trainings`) | aucun guide pas à pas du bureau ne le cite |
| « Envoyer par e-mail » dans le menu du compte | « Plus ⋯ » (`menu-email`) | idem |
| « Borne » dans la barre de semaine (v2b) | « Plus ⋯ » (`bar-kiosk`) | fiche `borne` (ci-dessus) et fiche d'aide « borne » |
| « Réglages » dans le menu du compte ET le ☰ | menu du compte sur ordinateur, ☰ sur téléphone | aucun changement |
| ⟲ « Versions » dans le coin de la grille | « Plus ⋯ » | fiche `versions` |
| « + ajouter » sous chaque jour de la grille (v2b) | clic sur la case (ordinateur, « + » au survol), « + » à droite du nom (téléphone) | fiche `affecter` (téléphone) |

## À faire à la bascule du bureau (pas avant)

1. `GUIDES_BUREAU_UI2 = true` ET `BUREAU_UI2_PAR_DEFAUT = true` (`lib/use-bureau-ui2.ts`) dans le même commit ; appliquer `AIDE_V2` à la fiche d'aide « borne » de `assistant-actions-core.ts` (même commit).
2. Mettre à jour l'empreinte déclarée dans `admin-tours.test.ts` (SHA de `guideForPrompt`) : les fiches d'aide de l'Assistant sont dans la consigne du modèle ; régénérer `avant-3b1.snapshot.json` comme les trois exceptions documentées du README du registre.
3. Redéployer la fonction `assistant` (seule celle-là change) ; évaluer les phrases d'aide avant mise en ligne.
4. Rejouer `guides-bureau-lot7.mjs` en `/admin?ui=2` (les étapes « Plus ⋯ » s'ouvrent à la main : le menu est un état local du planning v2, le guide ne l'ouvre pas).

Limite connue : le guide n'ouvre pas « Plus ⋯ » à la place du patron (jamais d'écran qui agit) ; l'étape « Plus ⋯ » entoure le bouton, la suivante entoure la ligne qui n'existe qu'une fois le menu ouvert.
