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
4. Avec un outil : `outils-*.ts` et un cas d'évaluation. Sans : `humain` + raison, ou `dette` datée (au plus tard `HORIZON_DETTES`).
5. Fermer une dette baisse `dettes.json` dans la même PR (fichier généré, comparé à l'égalité).

## Qui lit quoi
| Fichier | Lu par |
|---|---|
| `index.ts` (tout le registre) | fonctions Edge `assistant`, `worker-assistant`, `assistant-eval` ; tests Deno |
| `surfaces*.ts`, `interne*.ts`, `*.snapshot.json`, `dettes.json` | test de couverture et scanner `../registre-surfaces.ts` |
| `mesures.json` | banc d'évaluation et test T7 |
| `config.ts`, `types.ts` | tout le registre |

## La règle : le navigateur n'importe jamais `index.ts`
Le site est exporté en statique : tout le JavaScript d'un chunk est public. `index.ts` tire les textes du modèle, les noms de RPC et de tables et les raisons de sécurité. Rien dans `app/`, `components/`, `lib/` ni `hooks/` ne doit l'atteindre, même par un import transitif (test T8). Le navigateur ne lit que les modules légers par côté (livraison 3b).

Les fichiers `*.snapshot.json` et `dettes.json` sont générés : on ne les édite pas à la main.
