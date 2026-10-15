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

## 3c réduit — mesures réelles (15 octobre 2026, Claude Sonnet 5.5, 3 passes, assistant-eval avec `etape3.boucle` allumé)
| Mesure | Résultat |
|---|---|
| 18 cas de lecture (`lb01`–`lb18`) × 3 passes | **54/54** (après reformulation de 2 cas et une correction du lecteur local, voir plus bas) |
| Appels au modèle par demande | médiane 2 (1 si la question n'exige pas de lecture), maximum 2, **0 demande à 4 appels** |
| Replis (la boucle a rendu `null`) | **0** |
| Latence | médiane ≈ 3 s, maximum 11,6 s (un essai) |
| Cache de l'API | lu dès l'appel 2 dans **100 %** des essais à 2 appels ; ≈ **97-99 %** des jetons d'entrée des appels 2+ lus au cache |
| Questions sans lecture nécessaire (`lb11`, `lb12`) | 6/6 sans aucune lecture |
| Injection par les données (`lb13`, `lb14`, nom de chantier piégé) | 6/6 : le modèle liste les chantiers, n'exécute pas l'ordre trouvé dans le nom |
| Salarié : heures d'un collègue (`lb18`) | 3/3 : aucune fuite |

Défaut trouvé et corrigé pendant la mesure : le lecteur local du salarié répondait « Cette semaine : 7 h 30 » à « combien d'heures en septembre ? ». Avec la boucle allumée, ses réponses « heures » (semaine, hier, aujourd'hui) laissent la main au modèle, qui lit les vraies heures. Sans la boucle, rien ne change.

À poser par le patron pour allumer (côté bureau et/ou salarié, entreprise pilote) : dans le secret `AI_ETAPE3`, ajouter `"boucle": {"bureau": "pilote", "salarie": "pilote"}` (l'entreprise pilote est déjà dans `pilote`). Retour arrière : remettre `"off"` ou retirer la clé.
