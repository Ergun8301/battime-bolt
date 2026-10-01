# Lot 9 — retours d'Ergun après test réel (tablette + téléphone)

Pas d'interrupteur pour ce lot : c'est une correction de l'existant, demandée
par Ergun. Aucune donnée effacée, migration 100 % additive.

## Ce qui change

| # | Où | Avant | Après |
|---|---|---|---|
| 1 | Borne | « Plein écran » seulement, aucune sortie sans clavier | Bouton **« Quitter le plein écran »** toujours visible dans un coin (Échap marche toujours) |
| 2 | Borne | Gros QR + liste « Aujourd'hui » (option) | **Planning de la semaine**, mêmes bulles que le bureau, lecture seule : prénom + nom, chantier, ville, horaires prévus. Gros bouton **« Pointer (QR) »** → QR plein écran, retour au planning après 60 s ou au toucher. « Déconnecter » caché (appui long 5 s sur le nom de la borne) |
| 2 | Bureau → Borne | Case « Afficher le planning du jour » | **Retirée** (la colonne reste en base, ignorée) |
| 3 | Fonction `kiosk` | `sync` : prénom + horaire du jour | Nouvelle action **`board`** (jeton de la tablette) : champs minimaux, aucun identifiant, aucune note, aucun motif d'absence, aucune heure pointée |
| 4 | Bureau, borne, salarié | — | Case **verte « en cours depuis HH:MM »** dès qu'un pointage en direct est ouvert ; relue toutes les 30 s, sans recharger |
| 5 | Salarié, borne | « Pas encore un quart d'heure », arrondi au ¼ h | **« J'ai fini » à tout moment**, heure réelle à la minute ; < 1 min = annulé sans message d'erreur ; l'arrondi ne joue jamais contre le salarié |
| 6 | Salarié | Bloc « Pointer en direct » (liste + Je commence) | **« ▶ Je commence » sur chaque carte** de « Chantiers du jour ». « + » = heures à la main, sans chrono. Le QR de la borne démarre toujours le chrono. L'info géolocalisation reste liée au chrono |
| 7 | Salarié | Ligne « Panier repas » | **Case « Panier » du bloc noir = interrupteur** pris / non pris |
| 8 | Bureau | « 8 en attente » · « 1 h pointées » | **« 8 journées non envoyées »** (= somme exacte des pastilles « X jours en attente ») · **« 1 h validée »** |

## Règle « l'arrondi ne pénalise jamais »

- Début = minute **tronquée** (08:07:40 → 08:07), fin = minute **arrondie au-dessus**
  (16:52:20 → 16:53) : au plus +2 min en faveur du salarié.
- Moins d'une minute : pointage annulé, aucune ligne, aucun message d'erreur.
- Fin donnée à la main (pointage oublié) : prise telle quelle ; nuit à cheval acceptée.
- Une ligne à la minute ouverte puis enregistrée sans toucher la molette **garde
  ses minutes** (avant : recalée au quart d'heure).

## « En cours depuis » — une seule règle

`supabase/functions/_shared/live-place.ts` : une case (salarié × jour) passe en
vert si le salarié a un chrono ouvert ce jour-là. La bulle désignée est celle du
`planning_id`, sinon celle du même chantier, **jamais « la première »**. Chantier
hors planning (borne, « Autre ») → pastille verte à part dans la case.

## Ce qui part en prod (feu vert d'Ergun)

1. **Migration** `20261001120000_lot9_fin_pointage.sql` : une fonction NOUVELLE
   `finish_active_session` (rien de modifié, `stop_active_session` reste).
2. **Fonction `kiosk`** (`--no-verify-jwt`) : action `board`, départ via la
   nouvelle fonction (repli automatique sur l'ancienne), `settings` n'écrit
   plus `show_planning`.
3. **Fonction `worker-assistant`** : textes d'aide (« Je commence » sur la
   carte, case « Panier » du bloc noir).

Ordre : 1 → 2 → 3, puis l'application. Avant la migration, l'application et la
borne retombent sur l'ancienne fin de pointage (arrondi au ¼ h) : rien ne casse.
Avant la fonction `kiosk`, la borne affiche « Planning indisponible » et le
bouton « Pointer (QR) » marche (préview : `/borne?demo=1`).

## Tests

- `deno test -A supabase/functions/` · `npm run test:kiosk-board` · `npm run test:fin-pointage` (PGlite, base jetable)
- Navigateur : `scripts/tests/borne-lot9.mjs`, `salarie-lot9.mjs`, `admin-lot9.mjs` (+ non-régression des lots 7-8)
- Captures : `docs/captures-lot9/`
