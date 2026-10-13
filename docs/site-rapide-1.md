# Site rapide 1 : Excel et PDF au clic, fenêtres à l'ouverture, cache long, budgets de poids

Aucune fonctionnalité nouvelle, aucune migration, aucune fonction edge, aucun réglage de l'IA.
Le site pèse moins au premier chargement : `/admin` passe de **774 à 353 kB** et `/poseur` de **550 à 335 kB** (base `integration/bemexo-ia` du 13 octobre, lots 11, 14, 24 et 29 compris ; avant tous les lots parallèles : 766 et 544)
(JavaScript compressé, colonne « First Load JS » de `next build`).

## Ce qui change

| | Avant | Maintenant |
|---|---|---|
| Excel (`xlsx`, 139 kB) et PDF (`jspdf` + `html2canvas` + `dompurify` + `canvg`, 105 kB, et `jspdf-autotable`) | dans le premier chargement de `/admin` et de `/poseur` | chargés **au clic** ; préchauffés à l'ouverture du menu « Exporter ▾ » (équipe et fiche salarié) et de la fenêtre d'export ; jsPDF seul est préchargé au repos dans l'Historique salarié |
| Fenêtres du bureau (Réglages, Coûts, Statistiques, Congés, Réserves, fiche salarié, documents de chantier, les 2 imports, Borne, Formations, assistant) | dans le premier chargement | chargées **au repos** (un fichier à la fois), au démarrage d'un guide pas à pas, ou à l'ouverture |
| Écrans du salarié (Ma semaine, Mon mois, Historique, Mes congés) | dans le premier chargement | idem : au repos, ou à l'ouverture. Tant que le code d'un onglet n'est pas là, des blocs gris (les mêmes que ceux de l'onglet pendant qu'il charge ses données) |
| Assistant du salarié, lecteur de QR | dans le premier chargement | l'assistant se charge dès que la page est montée (hors file de préchauffage, même en économie de données : il garde la conversation) ; le lecteur de QR seulement à l'appui sur « Scanner la borne » (préchargé au toucher), jamais au repos |
| Fichiers fixes | pas de consigne de cache | `public/_headers` : un an et `immutable` pour `/_next/static/*` (noms hachés), 30 jours pour `/fonts/*.woff2` (et **pas** pour `fonts.css`, dont le nom ne change pas), **rien** sur le HTML |
| Police | `@import` au fond du CSS de 8 écrans, Inter préchargée | `<link>` de `fonts.css` et préchargement d'Archivo dans le `<head>` ; Inter n'est plus préchargée |
| Poids | personne ne surveille | `npm run budget` échoue si une page dépasse son budget |

### Comment les fenêtres se chargent (`lib/lazy-window.tsx`)

- **Pas de clignotement, pas d'indicateur de chargement pour une fenêtre** : elle n'apparaît que quand son code est là. Seuls les trois onglets du salarié, déjà à l'écran, montrent des blocs gris en attendant. Quand il est déjà arrivé (le cas normal), elle s'affiche tout de suite.
- **Préchauffage** : après le chargement de la page, un fichier à la fois, 100 ms entre deux, quand le navigateur est au repos. Coupé en mode « économie de données » et en 2g (la fenêtre s'ouvre alors avec le délai du téléchargement). Les guides pas à pas chargent tout d'un coup en démarrant (ils ne cherchent leur cible que 1,5 s).
- **Une fenêtre ouverte n'est plus démontée** : les saisies en cours sont conservées à la fermeture/réouverture, comme avant. Exception voulue : le lecteur de QR, démonté à la fermeture pour couper la caméra.
- **Hors ligne ou fichier introuvable** : message « Impossible de charger cette fenêtre. Vérifiez votre connexion ou rechargez la page. », la fenêtre se referme, le clic suivant réessaie. Pour les onglets du salarié, le texte « Cet écran n'a pas pu se charger… » remplace les blocs gris (pas de message flottant en plus) et une nouvelle tentative a lieu au retour du réseau, ou en changeant d'onglet. L'assistant, chargé en fond, échoue **en silence** : le message n'apparaît que si on l'ouvre. Aucune erreur, aucun écran cassé. Pour l'export : « Impossible de charger l'outil d'export… » et **aucune heure n'est verrouillée** (le verrouillage vient après le fichier).
- L'impression du planning (Ctrl+P) reste dans le premier chargement : elle doit être prête au `beforeprint`.

### Export : l'ordre ne change pas

`exportEntriesToExcel`, `exportEntriesToPDF` et `excelAsBase64` sont devenues asynchrones ; chaque appelant les **attend avant** de verrouiller les heures. Le CSV reste synchrone.

## Poids avant / après (First Load JS, kB, compressé)

Mesures de cette machine (`next build`, Next 14.2.33), un build après chaque étape.

| Route | Audit d'origine | Avant le lot (`d3cda09`) | Base actuelle (`c9cd8bc`, lots 11, 14, 24 et 29 compris) | Après V1 (Excel/PDF) | **Final (V1 + V2, base fusionnée)** | Budget | Objectif du plan |
|---|---|---|---|---|---|---|---|
| `/admin` | 722 | 766 | 774 | 489 | **353** | 363 | 350 |
| `/poseur` | 487 | 544 | 550 | 410 | **335** | 345 | 300 |
| `/borne` | 161 | 163 | 167 | 163 | 167 | 170 | 170 |
| `/pointer` | 142 | 146 | 146 | 146 | 146 | 151 | 170 |
| `/connexion` | 149 | 150 | 150 | 150 | 150 | 155 | 150 |
| `/inscription` | 146 | 146 | 146 | 146 | 147 | 152 | 150 |
| `/support` | n/m | 148 | 148 | 148 | 149 | 155 | 150 |
| `/` | 133 | 134 | 134 | 134 | 134 | 139 | 150 |
| `/landing` | 90 | 90.8 | 91 | 90.9 | 91.6 | 97 | 150 |
| `/cgu` (pages légales) | n/m | 96.8 | 97 | 96.9 | 97.5 | 103 | 150 |
| `/apercu/*` (démos internes) | n/m | 178 à 274 | 178 à 276 | 178 à 274 | 179 à 280 | 290 | n/a |
| Partagé par toutes les pages | 87.7 | 87.8 | 88.0 | 88.0 | 88.6 | 96 | n/a |

n/m = non mesuré à l'audit. Journaux : `build-avant.log`, `build-v1.log`, `build-final.log` (notes jetables).

La colonne « final » est mesurée après la fusion de `integration/bemexo-ia` (lots 11, 14, 24 et 29 : appairage en un geste, enregistreur vidéo, documents, site rapide 2) et des corrections de relecture (états d'attente des onglets, nouvelle tentative). La colonne « base actuelle » est un `next build` de `integration/bemexo-ia` seule, sans ce lot : c'est la comparaison à lire pour savoir ce que le lot 5 change maintenant (`/admin` 774 → 353, `/poseur` 550 → 335, `/borne` inchangée à 167). `/borne` a pris 4 kB avec le lot 11 (`app/borne/pair-qr.tsx`, 163 → 167) ; ce lot n'y touche pas : son budget est plafonné à 170 kB, soit 3 kB de marge seulement. Entre les builds de ce lot : `/admin` 350 → 351 → 353 → 353 et `/poseur` 328 → 329 → 331 → 335 (avant toute fusion, après les lots 11 et 14 et les corrections, après le lot 29, après le lot 24). Le lot 24 pèse 4 kB sur `/poseur` : `poseur-day.tsx` importe `chantier-documents` (qui importe le nouveau `document-category`) en statique ; côté bureau, cette fenêtre est différée.

- **Sorties du premier chargement de `/admin`** : `xlsx` ≈ 139 kB, `jsPDF` et ses aides ≈ 105 kB, `jspdf-autotable` (une partie de 10 kB), le code des fenêtres et de l'assistant.
- Le JavaScript partagé grossit de 0,7 kB (redécoupage de webpack) : toutes les pages le portent, d'où +0,5 à +0,7 kB sur les routes qui n'ont pas bougé.
- **Cibles du plan** : `/admin` ≤ 350 kB est manquée de 3 kB (353 sur la base fusionnée ; objectif affiché, non bloquant : le budget est à 363). `/poseur` ≤ 300 kB ne l'est pas (335) : `components/poseur-day.tsx` (lot 29) importe encore `ChantierDocuments` en statique, et `lib/assistant-actions` reste lié à l'assistant. Gain restant à prendre dans un lot suivant. `/connexion` et `/support` sont au bord de la cible « pages publiques ≤ 150 » : budget 155.
- `/apercu/cout-salarie` importe `SET_CSS` de `company-settings` : cette page de démonstration reste lourde (212 kB).
- `node_modules` de la machine de développement a `xlsx` 0.18.5 alors que le lock demande 0.20.3 ; `xlsx` quittant le premier chargement, l'écart est négligeable, mais les budgets sont à re-contrôler sur la CI / la préview.

## Budgets de poids

```
npm run build 2>&1 | tee build.log
npm run budget -- build.log
npm run test:budget
```

- `scripts/bundle-budgets.json` : pour chaque route, la `mesure` du moment, le `max` (mesure arrondie au kB supérieur + 10 pour `/admin` et `/poseur`, + 5 ailleurs) et, quand il existe, l'`objectif` (affiché, jamais bloquant). Un groupe `/apercu/*` pour les pages de démonstration, un plafond `default` de 150 kB, un budget pour le JavaScript partagé.
- Le script **échoue** (code 1) si une route ou le partagé dépasse son `max`, si le tableau est absent, ou si `/admin` ou `/poseur` manquent. Il **avertit** sans échouer si une route grossit de plus de 10 kB par rapport à sa mesure (« à justifier dans la PR et à reporter dans `bundle-budgets.json` ») ou si une route n'a pas de budget propre (plafond 150 kB appliqué).
- Étape de CI : `.github/workflows/ci.yml` (commit à part : il peut être refusé au push faute du droit `workflow`). La CI ne tourne que sur les PR vers `main` : le contrôle a donc lieu à la PR groupée.
- Les budgets sont à **re-mesurer** après la fusion des lots 11, 14 et 29 (ils peuvent faire bouger les routes) ; mettre à jour `bundle-budgets.json` dans la PR groupée en le justifiant.

## À tester sur téléphone (préview `.pages.dev`)

1. **iPhone (Safari)** : Historique → bouton « PDF », au premier clic après avoir ouvert l'onglet, puis après rechargement de la page : le fichier doit se télécharger ou s'ouvrir sans bouton « autoriser ». C'est le point à risque (seul téléchargement qui était synchrone dans le geste) : non vérifié sur un vrai iPhone.
2. Bureau en 390 px : ☰ → Réglages, Coûts, Statistiques, Congés, Réserves, Borne : la fenêtre s'ouvre du premier coup, sans clignoter, y compris dès le chargement de la page ; fermer puis rouvrir garde les saisies.
3. « Exporter ▾ » (équipe et fiche salarié) : PDF, Excel, CSV ; « Envoyer au comptable » ; les heures ne sont verrouillées qu'après un téléchargement réussi.
4. Guide pas à pas (bureau et salarié) : toutes les étapes qui ouvrent une fenêtre montrent leur anneau (pas de « Je ne vois pas ce bouton »).
5. Salarié hors ligne (mode avion **après** avoir laissé la page 5 s ouverte) : Ma semaine, Mon mois, Historique, Congés s'ouvrent ; côté bureau, Ctrl+P imprime la feuille.
6. Mode « économie de données » : une fenêtre jamais ouverte s'ouvre avec un court délai, sans erreur.
7. En-têtes : `curl -I` d'un fichier `/_next/static/…` (`immutable`), de `/fonts/archivo-latin.woff2` (30 jours), de `/fonts/fonts.css` et de `/admin` (**pas** de cache long). Les règles ont été passées dans les analyseurs de `_headers` de Netlify (`@netlify/headers-parser`) et de Cloudflare Pages (code de workers-sdk) : `fonts.css` ne reçoit aucun `Cache-Control`, les polices un seul ; à confirmer par ce `curl -I` sur la préview. Pourquoi `/fonts/*.woff2` et pas `/fonts/*` : les en-têtes de plusieurs règles qui correspondent s'additionnent sur Cloudflare, donc on ne peut pas « corriger » `fonts.css` par une règle de plus ; la règle ne doit pas le viser du tout.

## Limites

- Premier chargement sur connexion très lente ou en mode économie de données : pas de préchauffage automatique ; la fenêtre s'ouvre avec le délai du téléchargement (rien n'est affiché avant, donc pas de clignotement).
- Hors ligne, un fichier jamais téléchargé ne peut pas s'ouvrir : message clair (voir plus haut).
- Une fois qu'une fenêtre a été ouverte, elle reste montée (invisible) : comme avant le lot, elle ne coûte rien tant qu'elle est fermée.
- `ChantierDocuments` côté `/poseur` reste statique (importé par `poseur-day.tsx`, lots 24 et 29) : c'est le premier gain à prendre pour `/poseur`.

## Tests

- `npm run test:budget` : analyse du tableau de `next build`, dépassements, avertissements, route inconnue, groupe `/apercu/*`, et contrôle statique de `public/_headers`.
- `npm run test:site-rapide-ecrans` (après `npm run build`, sur les vraies pages avec une base simulée) : rien de lourd au chargement ni au repos, chunks à l'ouverture du menu d'export, vrais fichiers PDF / Excel / CSV / pièce jointe du comptable, verrouillage après le fichier, aucune écriture si l'outil ne charge pas, fenêtres sans clignotement ni téléchargement de plus à la 2ᵉ ouverture, onglets salarié, réseau coupé après le repos, chunk de fenêtre bloqué (message puis réessai), onglet dont le code tarde (blocs gris), onglet en échec puis nouvelle tentative (retour du réseau, retour sur l'onglet), assistant en échec de fond (aucun message avant qu'on l'ouvre), fenêtres du menu ☰ à 390 px sans clignoter ni déborder (Coûts avec des heures fictives), police Archivo chargée.

Captures à 390 px : `docs/captures-site-rapide-1/` (Réglages, Coûts avec des heures fictives, fiche salarié et menu Exporter côté bureau ; Mon mois et Mes congés hors ligne côté salarié).
