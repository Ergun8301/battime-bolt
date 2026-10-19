# Registre de l'assistant (étape 3)

Contrat : `docs/ia-etape3/00-conception-etape3.md` (§1, §2). Aucune seconde liste ailleurs : le registre est la vérité.

## À quoi il sert
- **Capacités** (B1…, S1…) : ce que le patron / le salarié fait dans BEMEXO, avec genre et niveau, et un outil, des ouvreurs, un « réservé à l'humain » avec raison, ou une dette datée.
- **Outils** : ce que le modèle voit (description, paramètres) et la règle de chacun (niveau, mode, « Annuler »).
- **Surfaces** : les clés de code (`rpc:`, `table:`, `fenetre:`, `ancre:`…) que chaque capacité couvre.
- Le test de couverture (`npm run test:couverture`) échoue quand le code a une entrée que rien ne porte.

## Ajouter une capacité
1. Prendre l'id suivant (B139+ / S106+) dans `capacites-bureau.ts` ou `capacites-salarie.ts`. Un id n'est jamais renuméroté ni réutilisé.
2. Rattacher ses clés de code dans `surfaces-bureau.ts` / `surfaces-salarie.ts`.
3. Si ce n'est pas une capacité (menu, légende, route publique) : `interne-*.ts`, raison ≥ 30 caractères. Jamais une écriture.
4. Avec un outil : `outils-*.ts` et un cas d'évaluation, puis `npx -y deno@2 run --allow-read --allow-write scripts/registre-listes-gen.ts` (réécrit `_shared/outils-listes-*.ts` : types d'écriture, retraits, pièces jointes, outils de chaque domaine ; le test `registre-listes.test.ts` échoue tant que c'est oublié). Le code à la main (`prepare`, `checkAction`, `summarize`, `actionMode` d'AC / WC) doit aussi traiter le nouveau type d'écriture : T5 le vérifie. Sans : `humain` + raison, ou `dette` datée (au plus tard `HORIZON_DETTES`).
5. Fermer une dette baisse `dettes.json` dans la même PR (fichier généré, comparé à l'égalité).

## Qui lit quoi
| Fichier | Lu par |
|---|---|
| `index.ts` (tout le registre) | fonctions Edge `assistant`, `worker-assistant`, `assistant-eval` ; tests Deno |
| `surfaces*.ts`, `interne*.ts`, `*.snapshot.json`, `dettes.json` | test de couverture et scanner `../registre-surfaces.ts` |
| `mesures.json` | banc d'évaluation et test T7 |
| `config.ts`, `types.ts` | tout le registre |
| `ouvreurs.ts`, `outil-ouvrir.ts`, `ouvreurs-gen.ts` (3b) | fonctions Edge (`ouvrir.ts`, `guide-etape3.ts`, `outils-pour.ts`) et tests ; jamais le navigateur |
| `ouvreurs-leger-bureau.ts`, `ouvreurs-leger-salarie.ts` (**GÉNÉRÉS**) | **module léger** par côté : `/admin` et `/poseur` (via `lib/openers-bureau.ts`, `lib/openers-salarie.ts`, chargés à la demande) |
| `outils-pour.ts` (`outilsPour`), `listes.ts` | fonctions Edge via `../assistant-outils.ts` (`ASSISTANT_FUNCTIONS`, `functionsFor`) et `../worker-outils.ts` (`WORKER_FUNCTIONS`, `workerFunctionsFor`) ; générateur et tests |
| `vocab.ts` (`NAV_ACTIONS`, `WORKER_NAV`, `ABSENCE_KINDS`, `LEAVE_KINDS`, `DOC_CATEGORIES`) | **module léger** : déclarations d'outils, AC et WC (qui le ré-exportent), donc le navigateur |
| `../outils-listes-bureau.ts`, `../outils-listes-salarie.ts` | **GÉNÉRÉS** (ne pas éditer), **légers** et sans import : AC, WC, `tool-domains.ts`, donc le navigateur |
| `avant-3a2.snapshot.json` | étalon GELÉ de ce que la production avait avant 3a-2 : `registre-listes.test.ts`, `scripts/registre-outils-gen.ts` |

## Régénérer ce qui est généré (commandes officielles)
| Fichier | Quand | Commande |
|---|---|---|
| `../outils-listes-bureau.ts`, `../outils-listes-salarie.ts` (listes d'outils) et `ouvreurs-leger-bureau.ts`, `ouvreurs-leger-salarie.ts` (ouvreurs légers) | on change un outil (`outils-*.ts`) ou un ouvreur (`ouvreurs.ts`) | `npm run registre:generer` |
| les mêmes, sans rien écrire (CI, relecture) | avant une PR | `npm run registre:verifier` (sort en erreur si un fichier n'est pas celui que le registre produit) |
| `dettes.json`, `clics.snapshot.json`, `ids.snapshot.json` | on ferme une dette, on ajoute un bouton, on crée une capacité | `REGISTRE_REGENERER=dettes,clics,ids npx -y deno@2.9.6 test --allow-env --allow-read --allow-write supabase/functions/_shared/registre-couverture.test.ts` |
| `avant-3a2.snapshot.json`, `avant-3b1.snapshot.json`, `outils-empreintes.json` | **jamais** : étalons gelés (production d'avant 3a-2 / d'avant 3b-1, SHA-256 des outils) | — |

Exception documentée (2026-10-15, relecture 3b-1) : `avant-3b1.snapshot.json` a été régénéré UNE fois, volontairement, parce que le texte de quatre fiches du GUIDE bureau a changé (étapes fusionnées pour respecter « 3 étapes au plus » ; PR #200). Commande : supprimer le fichier puis `ETAPE3_ETALON=ecrire … etape3-eteint.test.ts`. Écart prouvé : seuls `guides.bureau`, `global`, les consignes qui portent le GUIDE (83 cas) et 5 réponses du lecteur local « Aide » (b29, gu01, gu02, gu04, gu05) bougent ; outils, liens et GUIDE salarié sont identiques.

Seconde exception documentée (2026-10-16, bascule du design salarié, étape 11) : `avant-3b1.snapshot.json` a été régénéré une seconde fois (suppression + `ETAPE3_ETALON=ecrire`) parce que `GUIDES_UI2` passe à `true` (`guides-ui2.ts`) : les fiches d'aide du GUIDE **salarié** décrivent désormais le nouveau design. Écart prouvé (comparaison champ par champ avec l'ancien fichier) : seuls `guides.salarie`, `global`, la consigne de 55 cas salarié (ceux qui portent le GUIDE) et la réponse du lecteur local « Aide » de 2 cas (s21, s25) bougent ; **`guides.bureau` (SHA 5766f6e9…3198), `liens_bureau`, `liens_salarie`, tous les outils et tous les cas bureau sont identiques**.

Troisième exception documentée (2026-10-16, navigation repensée du salarié, demande d'Ergun) : `avant-3b1.snapshot.json` a été régénéré une troisième fois (suppression + `ETAPE3_ETALON=ecrire`) parce que les fiches d'aide du GUIDE **salarié** v2 disent « Mon compte » à la place de « Plus » et que la fiche `planning` passe par la barre du bas. Écart prouvé (comparaison champ par champ avec l'ancien fichier) : seuls `guides.salarie`, `global`, la consigne de 55 cas salarié (ceux qui portent le GUIDE) et la réponse du lecteur local « Aide » d'un cas bougent ; **`guides.bureau` (SHA 5766f6e9…3198), `liens_bureau`, `liens_salarie`, tous les outils sont identiques**. `clics.snapshot.json` n'a pas bougé.

Quatrième exception documentée (2026-10-19, bascule du bureau v2, accord d'Ergun) : `avant-3b1.snapshot.json` a été régénéré une quatrième fois (suppression + `ETAPE3_ETALON=ecrire`) parce que les fiches d'aide du GUIDE **bureau** décrivent désormais le bureau v2 (« Plus ⋯ » pour Coût chantiers, Réserves, Borne et Imprimer ; « Accepter » / « Refuser » ; « Corriger » dans la ligne ; « PDF », « Excel », « CSV paie » ; « Salariés » → « Invitations en attente » ; versions du planning plus affichées). Écart prouvé (comparaison champ par champ avec l'ancien fichier) : seuls `guides.bureau` (SHA 5766f6e9…3198 → 02d2bbe4…5d4f), `global`, la consigne de 83 cas bureau (ceux qui portent le GUIDE) et la réponse du lecteur local « Aide » de 6 cas (b29, b30, b33, ov02, gu01, gu03) bougent ; **`guides.salarie`, `liens_bureau`, `liens_salarie`, tous les outils et tous les cas salarié sont identiques**.

Les tests échouent tant qu'un fichier généré n'est pas à jour (`registre-listes.test.ts`, `registre-ouvreurs.test.ts`, T9). `npm run test:registre` lance toute la famille (couverture, scanner, outils, listes, ouvreurs, interrupteur, éteint à l'octet, ouvrir).

## La règle : le navigateur n'importe jamais `index.ts`
Le site est exporté en statique : tout le JavaScript d'un chunk est public. `index.ts` tire les textes du modèle, les noms de RPC et de tables et les raisons de sécurité. Rien dans `app/`, `components/`, `lib/` ni `hooks/` ne doit l'atteindre, même par un import transitif (test T8). Le navigateur ne lit que les modules légers par côté (livraison 3b).

Depuis 3a-2, les 34 + 19 déclarations que reçoit le modèle ne sont plus écrites dans `assistant-actions-core.ts` ni `worker-assistant-core.ts` (atteints par le navigateur) : `outils-pour.ts` les rend depuis `outils-*.ts`, et seuls `assistant-outils.ts` / `worker-outils.ts` (serveur) les exposent. Les listes d'identifiants que le navigateur lit aussi (retraits, pièces jointes…) passent par les modules légers générés `outils-listes-*.ts`.

Les fichiers `*.snapshot.json`, `dettes.json` et `outils-listes-*.ts` sont générés : on ne les édite pas à la main (`avant-3a2.snapshot.json` est gelé : on ne le régénère jamais).

## Ouvrir un écran (livraison 3b-1) : fichiers et budget de poids
Écrit AVANT le code du navigateur (kB compressés, comme `npm run budget` : First Load JS ; les modules chargés à la demande ne comptent pas). Mesure de départ (origin/main 0edb2a4) : `/admin` 358 (budget 363), `/poseur` 335 (345), `/apercu/assistant` 230 et `/apercu/assistant-salarie` 282 (290). On ne relève JAMAIS un budget : si la mesure dépasse, on découpe en import dynamique.

| Fichier | Où il pèse | Budget |
|---|---|---|
| `lib/openers.ts` (registre de la page, `openLink`, file de 10 s, `isNarrow`, validation) | chunk de l'assistant (chargé à la demande) et `/apercu/assistant*` | ≤ 1,6 |
| `registre/ouvreurs-leger-bureau.ts` | chargé à la demande depuis `/admin` | ≤ 1,0 |
| `registre/ouvreurs-leger-salarie.ts` | chargé à la demande depuis `/poseur` | ≤ 0,3 |
| `lib/openers-bureau.ts` (les 25 implémentations) | chargé à la demande depuis `/admin` | ≤ 3,0 |
| `lib/openers-salarie.ts` (les 2 implémentations) | chargé à la demande depuis `/poseur` | ≤ 0,8 |
| ajouts à `components/admin-planning.tsx` (l'objet de poignées + l'effet) | `/admin`, premier chargement | ≤ 0,7 |
| ajout à `app/admin/page.tsx` (abonnement) | `/admin`, premier chargement | ≤ 0,15 |
| ajouts à `app/poseur/page.tsx` | `/poseur`, premier chargement | ≤ 0,4 |
| `assistant-actions-core.ts` (variante du GUIDE, branche `ouvrir_fenetre`) | `/admin` et `/apercu/assistant` | ≤ 0,3 |
| panneau (`go()`, ouverture automatique) + `lib/assistant.ts`, `lib/worker-assistant.ts` (`caps`, `auto`) | chunk de l'assistant | ≤ 0,5 |

Total attendu au premier chargement : `/admin` ≈ +1,2 (≤ 363), `/poseur` ≈ +0,4 (≤ 345), `/apercu/*` ≈ +2,5 (≤ 290). Mesures réelles et vérification : voir le message du commit « budget » de la livraison.
