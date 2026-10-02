# Lot 11 — simplification après le test réel d'Ergun

Objectif : un patron ou une secrétaire comprend tout **sans formation**.
Pas d'interrupteur : c'est une simplification de l'existant, demandée par Ergun.
Aucune donnée effacée, migration 100 % additive.

## Ce qui change

| # | Où | Avant | Après |
|---|---|---|---|
| 1 | Bureau → « 📟 Borne » | Liste des bornes, « Ajouter une borne », lieu, nom | **Le code à 6 chiffres s'affiche tout de suite** (renouvelé tout seul). État « Tablette reliée — vue il y a X min » / « Aucune tablette reliée ». Une nouvelle tablette **remplace** l'ancienne. Un seul lien « Déconnecter la tablette » (avec confirmation) |
| 2 | Réglages, borne | Option GPS « vérifier que le salarié est sur place » | **Retirée partout** (plus de contrôle, plus de position enregistrée par la borne). « Horaires d'ouverture » gardés, facultatifs |
| 3 | Écran de la borne | Deux barres, « Borne », « Borne active » | **Une barre fine** : logo + entreprise · date et heure · « QR » + plein écran. Point vert = connectée. Le planning prend toute la place |
| 4 | Borne → QR | Retour après 60 s | **Retour au planning après 30 s** ou au toucher |
| 5 | Planning bureau | Une suppression à la fois | **« Sélectionner »** → cocher / « Tout sélectionner » (semaine affichée) → **« Supprimer (N) »** → carte **« Annuler »** qui remet tout. Jamais une journée envoyée, validée, en cours, une absence ou un jour clôturé (🔒 + raison au survol) |
| 6 | Intervention | « Heure de RDV » (roulette) | **« Horaire prévu : début – fin »**, facultatifs. On tape « 14h » / « 14:30 » ou on choisit au ¼ h. Raccourcis **Matin · Après-midi · Journée**. Une heure illisible est refusée (plus ignorée en silence) |
| 7 | Toutes les fenêtres | Défilement horizontal possible | **Aucune fenêtre ne défile en largeur** (ordinateur, tablette, téléphone) — sonde automatique sur 41 fenêtres × 3 tailles |
| 8 | Case verte « en cours » | — | Toujours liée à un **vrai pointage** (chrono ou QR) ; compteur « en direct » retiré |
| 9 | Barre du haut | « X salariés », « X h validées », … | **2 indicateurs** : 🟠 **« à relancer »** (journées planifiées non envoyées du mois, liste par salarié + bouton « Relancer ») et 📎 **« Pièces »**. Heures par chantier → « Coût chantiers » |
| 10 | Réglages, listes | Paragraphes d'explication | **Une ligne max + ⓘ** (survol, clic ou toucher) |
| 11 | Réserves | Le bureau seul lève | **« Lever la réserve »** : commentaire et photo facultatifs → onglet « Levées ». **Le salarié peut lever depuis son téléphone** (même formulaire). Trace gardée (qui, quand, commentaire, photo, « par le salarié »). « Rouvrir » demande confirmation et garde le commentaire |
| 12 | Export | Boutons différents selon l'écran | **Même menu « Exporter ▾ »** partout : PDF, Excel, CSV (CSV ajouté sur la fiche salarié, identique au CSV équipe) |
| 13 | Fiche salarié | Clôture du mois entier seulement | **« Clôturer jusqu'au… »** (fin de contrat en cours de mois) : le salarié ne peut plus rien saisir jusqu'à cette date, le bureau garde la main, **« Rouvrir »** n'efface rien. « Archiver » propose d'abord de clôturer |

### Idées ajoutées (parcours plus simple)

- « Exporter » ouvre **directement** l'export de l'équipe ; « Un seul salarié ? » en lien discret.
- Le QR de la borne remplit le code tout seul (`/borne?code=…`).
- Les jours clôturés d'un salarié ne sont plus « à relancer ».
- Fiche salarié : « X jours en attente » = même calcul que le planning (mois en cours).
- Arrivée par QR sur une tablette sans chantier : si le salarié a **un seul** chantier prévu ce jour-là, l'arrivée va sur ce chantier.
- L'Assistant BEMEXO explique les nouveaux boutons (Sélectionner, Horaire prévu, Clôturer jusqu'au…, Borne, Lever une réserve).

## Ce qui part en prod (feu vert d'Ergun)

1. **Migration** `20261002120000_lot11_cloture_salarie.sql` : table NEUVE
   `user_closures` + 3 triggers neufs + 1 fonction de lecture neuve. Rien de
   modifié. Pas de DELETE possible (« Rouvrir » pose une date).
2. **Fonction `kiosk`** (`--no-verify-jwt`) : une tablette par entreprise
   (relier = remplace), plus de GPS, actions `unpair` et `cancel_pairing`,
   plafond global d'essais de code, arrivée sur le chantier unique du jour.
3. **Fonction `assistant`** : aide à jour + réserves déjà levées par le
   salarié retirées de la liste « à lever ».
4. **Fonction `worker-assistant`** : aide « Lever une réserve » + levée avec
   commentaire.

Ordre : 1 → 2 → 3 → 4, puis l'application (bemexo.com). Avant la migration :
« Clôturer jusqu'au… » est caché, tout le reste marche. Avant `kiosk` : la
borne marche (le remplacement se fait par l'écran du bureau).

À savoir : les 4 bornes encore actives de l'entreprise de test sont retirées
à la première tablette reliée après le déploiement. Les colonnes GPS, nom et
lieu des bornes restent en base, ignorées.

## Tests

- `npx tsc --noEmit -p .` · `npm run build` · `deno test -A supabase/functions/`
- PGlite (base jetable) : `npm run test:cloture-salarie` · `npm run test:fin-pointage`
- Navigateur : `scripts/tests/admin-lot11.mjs`, `borne-lot11.mjs`,
  `reserves-lot11.mjs`, `export-lot11.mjs`, `reglages-lot11.mjs`,
  `fenetres-lot11.mjs` + non-régression lots 9 et 10, Assistant
- Captures (1280/1440, tablette 1024×768, téléphone 390×844) : `docs/captures-lot11/`
