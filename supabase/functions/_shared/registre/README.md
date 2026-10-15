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
| `outils-pour.ts` (`outilsPour`), `listes.ts` | fonctions Edge via `../assistant-outils.ts` (`ASSISTANT_FUNCTIONS`, `functionsFor`) et `../worker-outils.ts` (`WORKER_FUNCTIONS`, `workerFunctionsFor`) ; générateur et tests |
| `vocab.ts` (`NAV_ACTIONS`, `WORKER_NAV`, `ABSENCE_KINDS`, `LEAVE_KINDS`, `DOC_CATEGORIES`) | **module léger** : déclarations d'outils, AC et WC (qui le ré-exportent), donc le navigateur |
| `../outils-listes-bureau.ts`, `../outils-listes-salarie.ts` | **GÉNÉRÉS** (ne pas éditer), **légers** et sans import : AC, WC, `tool-domains.ts`, donc le navigateur |
| `avant-3a2.snapshot.json` | étalon GELÉ de ce que la production avait avant 3a-2 : `registre-listes.test.ts`, `scripts/registre-outils-gen.ts` |

## La règle : le navigateur n'importe jamais `index.ts`
Le site est exporté en statique : tout le JavaScript d'un chunk est public. `index.ts` tire les textes du modèle, les noms de RPC et de tables et les raisons de sécurité. Rien dans `app/`, `components/`, `lib/` ni `hooks/` ne doit l'atteindre, même par un import transitif (test T8). Le navigateur ne lit que les modules légers par côté (livraison 3b).

Depuis 3a-2, les 34 + 19 déclarations que reçoit le modèle ne sont plus écrites dans `assistant-actions-core.ts` ni `worker-assistant-core.ts` (atteints par le navigateur) : `outils-pour.ts` les rend depuis `outils-*.ts`, et seuls `assistant-outils.ts` / `worker-outils.ts` (serveur) les exposent. Les listes d'identifiants que le navigateur lit aussi (retraits, pièces jointes…) passent par les modules légers générés `outils-listes-*.ts`.

Les fichiers `*.snapshot.json`, `dettes.json` et `outils-listes-*.ts` sont générés : on ne les édite pas à la main (`avant-3a2.snapshot.json` est gelé : on ne le régénère jamais).
