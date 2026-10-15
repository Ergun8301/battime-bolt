# Journal de l'étape 3 (assistant)

| Date | Livraison | État | Notes |
|---|---|---|---|
| 2026-10-15 | 3a-1 registre + test de couverture | en ligne (PR #198) | aucun changement en production |
| 2026-10-15 | 3a-2 listes d'outils générées | en ligne (PR #199), fonctions assistant v26 / worker-assistant v20 / assistant-eval v39 | 1 895 variantes identiques à l'octet ; éval réelle 12/12 |
| 2026-10-15 | 3b-0 trois fiches fausses du guide | en ligne (PR #200), assistant v27 / assistant-eval v40 | éval réelle 159/160 avant 160/160 : le cas s24 (salarié) varie de lui-même (3 essais sur 5) |
| 2026-10-15 | 3b-1 ouvrir 27 écrans (interrupteur éteint) | PR #201 | secret `AI_ETAPE3` à poser seulement après la mesure réelle ; borne.gestion et historique.supprimees reportés ; vagues 3-5 après le redesign |

Prochaines étapes (ancien) : fusion de 3b-1, déploiement des fonctions (éteint), mesure « Ouvrir » avec le paramètre `etape3` de l'éval, puis `AI_ETAPE3` en mode `pilote`.

| 2026-10-15 | 3c réduit : lectures à la demande (8 bureau + 3 salarié) + boucle d'outils | PR #207, éteint par défaut | secret `AI_ETAPE3.boucle` à poser par le patron ; écran annonce `boucle1` ; mesures : voir ci-dessous |

## 3c réduit — ce qui est livré (et ce qui est volontairement laissé de côté)
- Livré : `_shared/ai-boucle.ts`, `_shared/lectures/` (11 outils), `etape3-config.boucleActive`, teinte (`confirmer: true`), page Confidentialité, banc (`assistant-eval/cases-boucle.ts`, 18 cas), `test:boucle`.
- Laissé de côté (3d / après les premiers clients) : migration 3c-3 (compteur d'appels, bail, cadence, `assistant_trace`), instantané minimal du prompt, listes plafonnées, streaming, boucle pour les phrases turques longues du salarié (profil long : elles passent par la boucle seulement si l'interrupteur est allumé, non mesuré).
- Retour arrière : retirer `boucle` du secret `AI_ETAPE3` (immédiat), ou redéployer le sha précédent.
