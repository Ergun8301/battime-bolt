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

**Changer `WEB_HOST` dans `lib/hosting.ts` — le jour même, pas avant.** Les
mentions légales déclarent le lieu de traitement des données personnelles :
elles doivent nommer qui sert réellement le domaine.

#### On a essayé de l'anticiper, et ça a raté

L'étape 23 a déclaré Cloudflare **en avance**, sur un raisonnement étayé : la
production Netlify était gelée depuis le 4 août, vérifié auprès de son API
(`published_at` 2026-08-04, `commit_ref` `66724fe`, 45 commits sur `main`
depuis). Le changement ne pouvait donc pas atteindre `bemexo.com`.

**Treize minutes après la fusion, un abonnement Netlify a été payé.** Le blocage
a sauté, la production a repris, et elle a publié ce commit sur `bemexo.com` :

```
deploy        6ab0d74325c49c0008aa5913
published_at  2026-09-21T07:06:49Z
commit_ref    0651aa7…   (l'étape 23)
context       production
```

Une page légale servie par Netlify déclarait Cloudflare — exactement ce que
l'ordre choisi prétendait éviter. L'étape 24 l'a remise droite.

**La leçon n'est pas « il fallait mieux vérifier ».** La vérification était
juste au moment où elle a été faite. La leçon est qu'une prémisse qu'un **tiers
peut retourner à tout moment** — un hébergeur, un paiement, un réglage de
compte — ne porte pas un ordre d'opérations. Ce qui rend cette déclaration
vraie, c'est le DNS. Le champ suit donc le DNS, et rien d'autre.

Corollaire pratique : **tant que les deux hébergeurs peuvent servir le domaine,
il n'existe aucun instant où une valeur unique est vraie partout.** On accepte
donc que `bemexo.pages.dev` affiche « Netlify » pendant la phase de test — une
adresse de test n'est pas une mention légale publiée — et on bascule les deux
ensemble, le jour J.

#### La zone DNS n'est pas chez Cloudflare, et ça change l'opération

Relevé sur le domaine réel :

| | |
|---|---|
| Serveurs de noms | `ns11.infomaniak.ch` / `ns12.infomaniak.ch` |
| `A` (racine) | `75.2.60.5` — Netlify |
| `www` | `apex-loadbalancer.netlify.com` |
| `MX` | `mta-gw.infomaniak.ch` |
| `TXT` | `v=spf1 include:spf.infomaniak.ch -all` + 2 vérifications Google |

**Le domaine porte la messagerie professionnelle.** Servir la racine depuis
Cloudflare Pages impose de déplacer la zone entière chez Cloudflare, parce que
Cloudflare exige ses propres serveurs de noms pour un domaine apex. Ce
déplacement recopie les enregistrements — et un `MX` ou un `SPF` oublié coupe
le courrier de l'entreprise, pas seulement le site.

C'est donc une opération à part, avec sa propre vérification :

1. Relever la zone complète chez Infomaniak, enregistrement par enregistrement.
2. Créer la zone chez Cloudflare et **comparer les deux listes ligne à ligne**
   avant de changer les serveurs de noms — surtout `MX`, `SPF`, `DKIM`, `DMARC`
   et les vérifications de propriété.
3. Seulement ensuite, changer les serveurs de noms chez le registraire.
4. Vérifier le certificat, la redirection `www`, **et l'envoi comme la
   réception d'un courriel réel**.

Le retour arrière reste un changement de serveurs de noms tant que la zone
Infomaniak existe encore : ne pas la supprimer avant plusieurs jours.

Et garder le projet Netlify en place aussi longtemps.

## Ce que la migration ne touche pas

Supabase — base, authentification, storage, fonctions edge et tâches planifiées
— ne bouge pas. Stripe non plus. Seule change la machine qui sert les fichiers.
