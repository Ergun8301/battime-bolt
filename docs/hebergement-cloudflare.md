# Migration de l'hébergement : Netlify → Cloudflare Pages

## Le constat qui rend tout simple

L'application n'a **aucune route API**, **aucune Server Action**, **aucun
middleware** et **aucun rendu serveur**. Les 22 pages sont pré-rendues et
parlent à Supabase depuis le navigateur.

Elle se réduit donc à un **export statique** — 112 fichiers — que n'importe
quel hébergeur de fichiers sert. Pas d'adaptateur, pas de `next-on-pages`, pas
de Worker, pas de runtime edge à comprendre ni à maintenir.

C'est la première chose vérifiée, avant de choisir quoi que ce soit : une
migration d'hébergement se décide sur ce que l'application demande réellement,
pas sur ce que l'ancien hébergeur avait installé.

## Ce qui aurait cassé en silence, et qui est corrigé

Deux dépendances à Netlify étaient écrites en dur dans le code, sans que rien
ne les signale.

**La reconnaissance d'une preview** se faisait sur `deploy-preview-*`, la forme
des adresses Netlify. Sur Cloudflare (`*.pages.dev`), deux écrans se seraient
éteints sans bruit : le blocage d'essai testable en preview, et le planning de
démonstration `?demo=N`. Personne n'aurait vu d'erreur — ils auraient
simplement cessé d'exister. C'est maintenant `isPreviewHost()`
(`lib/hosting.ts`), qui reconnaît les deux hébergeurs **et** le développement
local.

**Le nom de l'hébergeur figure dans les mentions légales et dans la politique
de confidentialité.** Ce n'est pas une mention décorative : c'est une
déclaration sur le lieu de traitement des données personnelles. La laisser
périmée rendrait ces deux pages fausses. Elle vient désormais d'une constante
unique, `WEB_HOST` dans `lib/hosting.ts` — **une ligne à changer, le jour de la
bascule**, et impossible à oublier puisque les deux pages la lisent.

## La bascule, en quatre étapes réversibles

L'ordre compte : chaque étape se vérifie et s'annule seule.

### 1 · Netlify sert déjà l'export statique *(fait dans cette PR)*

`netlify.toml` publie `out/` au lieu de `.next`, sans le greffon Next.js.

Les deux hébergeurs servent alors **exactement le même artefact**. Sans cette
étape, une différence de comportement après la bascule serait indémêlable :
vient-elle du site ou de l'hébergeur ? Ici, la réponse est connue d'avance.

**À vérifier sur la production Netlify avant d'aller plus loin** : les pages
publiques, la connexion, `/poseur`, `/admin`, l'installation PWA, et les
notifications push (`/sw.js` doit répondre).

### 2 · Créer le projet Cloudflare Pages

Dépôt `Ergun8301/battime-bolt`, branche de production `main`.

| Réglage | Valeur |
|---|---|
| Build command | `npm run build` |
| Output directory | `out` |
| Node version | 20 |

**Variables d'environnement** — à poser en production **et** en preview, avec
les mêmes valeurs qu'aujourd'hui sur Netlify. Elles sont toutes `NEXT_PUBLIC_`,
donc lues au moment du build : un oubli ne produit pas d'erreur de build, il
produit une application qui ne se connecte à rien.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `NEXT_PUBLIC_PAYWALL_ENFORCED`

### 3 · Tester sur l'adresse `*.pages.dev`, DNS inchangé

Le site tourne alors en double : Netlify sert encore les visiteurs, Cloudflare
sert l'adresse de test. Rien n'est engagé.

À vérifier, en plus de l'étape 1 :

- **Supabase** accepte l'origine `*.pages.dev` — sinon l'authentification
  échoue et c'est le premier symptôme qu'on verra.
- **Stripe** : les URL de retour de paiement pointent vers `bemexo.com`, pas
  vers l'adresse de test.
- Les **previews** : `?demo=3` sur `/admin` doit afficher le planning de
  démonstration. Si ce n'est pas le cas, `isPreviewHost()` ne reconnaît pas la
  forme d'adresse — et c'est exactement le défaut que cette PR corrige.

### 4 · Bascule DNS *(décision d'Ergun, pas la mienne)*

`bemexo.com` vers Cloudflare, puis :

- changer `WEB_HOST` dans `lib/hosting.ts` — **les mentions légales déclarent
  l'hébergeur, elles doivent devenir vraies le jour même** ;
- vérifier le certificat et la redirection `www` ;
- garder Netlify en place quelques jours : le retour arrière est un simple
  changement de DNS tant que le projet existe encore.

## Ce que la migration ne touche pas

Supabase — base, authentification, storage, fonctions edge et tâches planifiées
— ne bouge pas. Stripe non plus. Seule change la machine qui sert les fichiers.
