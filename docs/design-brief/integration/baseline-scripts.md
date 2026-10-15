# Baseline des scripts navigateur qui visent `/poseur`

Étapes 0 et 1 du plan d'intégration du design salarié (`docs/design-brief/audit-salarie/03-plan-integration.md` §5.2, annexe B) : **aucun changement visible**, donc une preuve par rejeu. Ce fichier consigne l'état d'**avant** (commit `61a1b87`, origin/main), puis ce que les scripts donnent **après** chaque étape.

## Comment rejouer

```
npm run build
ln -s /opt/node22/lib/node_modules/playwright/node_modules/playwright-core node_modules/playwright-core   # temporaire, à supprimer ensuite
node scripts/tests/<script>.mjs out <dossier-de-captures-hors-dépôt> <port>
node scripts/tests/captures-reference-salarie.mjs out <dossier>          # 12 captures de référence
node scripts/tests/comparer-captures.mjs docs/design-brief/integration/captures-reference <dossier> [tolérance]
npm run budget -- build.log && npm run budget:css                       # poids JS puis poids CSS
```

Conditions de la baseline : build de production de `61a1b87` copié à part (`out-avant`), chaque script lancé contre cette copie (les scripts n'écrivent jamais dans `out/`), en trois voies parallèles (ports distincts, délai de 1 500 s), captures dans un dossier hors dépôt. Un script qui échoue pour une raison d'infrastructure (port occupé, délai sous charge) est **rejoué seul** ; la valeur retenue est celle du rejeu, et la remarque dit pourquoi. Les nombres sont ceux que le script imprime lui-même (« N ✅ / M ❌ »).

## État d'avant : ✅ / ❌ de chacun des 31 scripts

| Script | Lignes | Repères lus | ✅ / ❌ avant | Remarque |
|---|---|---|---|---|
| `guides-lot7` | 629 | 35 | **681 / 1** | 1 ❌ à chaque passe mais jamais le même (« tel infos 3 », « tel-390 », « petit-360 : bouton close ») : géométrie instable du script, 3 passes. |
| `pause-lot3bis` | 731 | 30 | **79 / 0** | 1re passe : 78 ✅ / 1 ❌ (P3, minutage sous charge) ; rejoué seul : vert. |
| `pointage-lot10` | 769 | 26 | **110 / 0** |  |
| `heures-lot1` | 475 | 21 | **37 / 0** |  |
| `bureau-lot2` | 739 | 18 | **80 / 0** |  |
| `chantier-termine-lot23` | 794 | 18 | **111 / 0** |  |
| `salarie-lot9` | 341 | 18 | **53 / 0** |  |
| `panier-lot3bis` | 750 | 17 | **76 / 0** |  |
| `missions-lot4` | 930 | 16 | **148 / 0** |  |
| `reserves-lot11` | 585 | 16 | **68 / 0** |  |
| `fenetres-lot11` | 453 | 13 | **120 / 0** |  |
| `brouillons-lot2` | 633 | 12 | **49 / 0** |  |
| `salarie-lot10` | 258 | 12 | **26 / 0** |  |
| `salarie-lot12` | 252 | 12 | **28 / 0** |  |
| `formations-lot6` | 860 | 11 | **115 / 0** |  |
| `site-rapide-lot5` | 522 | 11 | **94 / 0** |  |
| `taches-heures-lot9` | 718 | 8 | **75 / 0** |  |
| `assistant-multi` | 731 | 5 | **120 / 0** |  |
| `assistant-historique` | 924 | 4 | **185 / 0** | 1re passe en 3 voies : 184 ✅ / 1 ❌ (H6, minutage sous charge) ; rejoué seul : vert. |
| `documents-lot24` | 713 | 4 | **141 / 1** | 1re passe : interrompu (délai Playwright en H0, sous charge) ; rejoué seul : 141 ✅ / 1 ❌, stable : E1 compare `git diff origin/integration/bemexo-ia` (dépend de la branche, pas de l'écran). |
| `traces-lot3` | 487 | 4 | **65 / 0** |  |
| `enregistreur-lot14` | 1500 | 3 | **300 / 0** |  |
| `heures-sures` | 569 | 3 | **66 / 0** |  |
| `salarie-lot14` | 257 | 3 | **20 / 0** |  |
| `videos-lot13` | 1015 | 3 | **110 / 0** |  |
| `ia-formule-lot6` | 245 | 2 | **110 / 0** | 1re passe : port occupé (EADDRINUSE, infrastructure) ; rejoué seul : vert. |
| `mot-de-passe` | 268 | 2 | **74 / 0** |  |
| `requetes-lot29` | 440 | 2 | **81 / 0** |  |
| `planning-copier` | 830 | 1 | **159 / 0** |  |
| `qr-fixe-lot12` | 679 | 1 | **111 / 0** |  |
| `borne-allumee` | 562 | 0 | **74 / 0** |  |
| **Total (31 scripts)** | 19659 | | **3566 / 2** | |

Lecture : 29 scripts sont verts. Deux ne le sont pas **avant** tout changement, et resteront à 1 ❌ après : `guides-lot7` (un contrôle de géométrie qui change d'une passe à l'autre) et `documents-lot24` (E1, qui compare `git diff` à une branche d'intégration de l'environnement). `requetes-lot29` : « 18 requêtes au chargement (budget ≤ 18) », chaîne `month_closures → time_entry_edits` = 2.

Les captures que ces scripts écrivent dans `docs/captures-*` ne sont pas versionnées par cette étape (certains scripts réécrivent des PNG déjà suivis : ils ont été remis tels quels).

## Après l'étape 0 : helper de navigation commun

`scripts/tests/navigation-salarie.mjs` (`ouvrirMenuCompte`, `ouvrirVue`, `ouvrirEditeur`, `lireToasts`, `BOUTON_MENU_COMPTE`) remplace les gestes écrits à la main dans les 12 scripts qui passent par le menu du compte : même sélecteurs, mêmes attentes (les pauses sont passées en options), aucun changement de comportement. Quand le menu changera de forme (nouvelle barre du bas, page « Plus »), il n'y aura qu'un fichier à adapter. Les 12 scripts, rejoués contre le **même** build d'avant :

| Script | ✅ / ❌ avant | ✅ / ❌ avec le helper | Identique | Remarque |
|---|---|---|---|---|
| `chantier-termine-lot23` | 111 / 0 | 111 / 0 | oui | 1re passe 110 ✅ / 1 ❌ (A2, ≥ 44 px, géométrie sous charge) ; rejoué seul : 111 ✅ / 0 ❌. |
| `enregistreur-lot14` | 300 / 0 | 300 / 0 | oui |  |
| `fenetres-lot11` | 120 / 0 | 120 / 0 | oui |  |
| `formations-lot6` | 115 / 0 | 115 / 0 | oui |  |
| `missions-lot4` | 148 / 0 | 148 / 0 | oui |  |
| `panier-lot3bis` | 76 / 0 | 76 / 0 | oui | 1re passe : délai à l'alerte d'export du bureau (le script d'origine échoue pareil à ce moment-là) ; rejoué seul : 76 ✅ / 0 ❌. |
| `pause-lot3bis` | 79 / 0 | 79 / 0 | oui |  |
| `reserves-lot11` | 68 / 0 | 68 / 0 | oui |  |
| `site-rapide-lot5` | 94 / 0 | 94 / 0 | oui |  |
| `taches-heures-lot9` | 75 / 0 | 75 / 0 | oui |  |
| `traces-lot3` | 65 / 0 | 65 / 0 | oui |  |
| `videos-lot13` | 110 / 0 | 110 / 0 | oui |  |

**12 / 12 scripts identiques** à l'état d'avant.
