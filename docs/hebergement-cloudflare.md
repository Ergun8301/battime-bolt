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
| Nom du projet | `bemexo` |
| Framework preset | aucun / `None` |
| Build command | `npm run build` |
| Output directory | `out` |
| Root directory | la racine du dépôt |
| Branche de production | `main` |
| `NODE_VERSION` | `22` |

`NODE_VERSION` se pose comme une variable d'environnement. **22** et pas une
autre : c'est la version sous laquelle cet export est construit et vérifié. Le
dépôt ne contient ni `.nvmrc` ni `engines`, donc chaque hébergeur choisit sa
propre version par défaut — exactement le genre d'écart qui rend un bug
« présent chez l'un, absent chez l'autre » et impossible à expliquer.

### Les quatre variables `NEXT_PUBLIC_`, et ce que chacune fait si on l'oublie

Elles sont lues **au moment du build**. Un oubli ne casse jamais le build.

J'avais d'abord écrit ici qu'un oubli « produit une application qui ne se
connecte à rien ». **C'est faux**, et le code le dit : `lib/supabase.ts` porte
des valeurs de repli codées en dur. Les quatre ne se comportent pas pareil, et
la différence est tout ce qui compte :

| Variable | Si elle manque | Ça se voit ? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | repli sur le projet de production (`lib/supabase.ts`) | sans objet — ça marche |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | repli sur la clé publiable du même fichier | sans objet — ça marche |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | notifications push coupées | **oui** : « Notifications non configurées » |
| `NEXT_PUBLIC_PAYWALL_ENFORCED` | **le paywall s'éteint** | **non. Rien.** |

**La dernière ligne est la seule qui soit dangereuse.** `paywallEnforced` vaut
`process.env.NEXT_PUBLIC_PAYWALL_ENFORCED === 'true'` : toute autre valeur, y
compris l'absence, vaut *non*. Si elle est à `true` sur Netlify aujourd'hui et
qu'on l'oublie sur Cloudflare, **les essais expirés cessent d'être bloqués** —
sans erreur, sans trace, sans que personne ne s'en aperçoive avant de regarder
les encaissements.

Donc : relever sa valeur actuelle sur Netlify *(Site configuration →
Environment variables)* et la reporter telle quelle, en production **et** en
preview.

### 3 · Tester sur l'adresse `*.pages.dev`, DNS inchangé

Le site tourne alors en double : Netlify sert encore les visiteurs, Cloudflare
sert l'adresse de test. Rien n'est engagé.

À vérifier, en plus de l'étape 1 :

- **Supabase doit accepter la nouvelle origine.** Ce n'est pas une précaution
  générique : les trois parcours qui envoient un e-mail — inscription
  (`app/inscription`), renvoi de confirmation (`app/connexion`) et mot de passe
  oublié (`app/mot-de-passe-oublie`) — construisent leur lien de retour avec
  `${window.location.origin}/connexion`. Depuis une adresse `*.pages.dev`, ce
  lien n'est pas dans la liste blanche, et Supabase le remplace par la *Site
  URL*. L'utilisateur clique et atterrit ailleurs.

  → *Authentication → URL Configuration → Redirect URLs* du projet
  `sdperbcquvneohotjono` : ajouter `https://bemexo.pages.dev/**` et
  `https://*.bemexo.pages.dev/**` (les previews). **Ne pas toucher à la *Site
  URL*** avant l'étape 4 : c'est elle qui protège la production.

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
