# Lot 12 — pointage par QR : entrée, sortie, oubli

Automatique selon la présence d'une tablette reliée. **Aucun nouveau réglage.**
Migration 100 % additive, aucune donnée effacée.

## Ce qui change

| Cas | Avant | Après |
|---|---|---|
| **Sans tablette** | « Je commence » sur les cartes, gros bloc « POINTAGE EN COURS » | Plus de chrono sur le téléphone : le salarié saisit ses heures (« + ») et envoie |
| **Avec tablette — entrée** | Scan QR **ou** « Je commence » | **Scan QR uniquement** (refusé en base depuis le téléphone, l'API ou l'Assistant) |
| **Sortie** | 2e scan ou « J'ai fini » | 2e scan, ou petite carte **« Tu es pointé depuis 08:00 — Terminer ma journée »** |
| **Pause** | Rien | Non scannée. À l'envoi, journée QR de plus de 6 h sans pause → **« Tu as pris une pause ? »** : Non / 30 min / 1 h (un toucher). Un scan à midi = 2 lignes, pas de question |
| **Sortie oubliée** | Chrono ouvert sans limite ; la borne refusait le lendemain | **Chaque nuit** (01:30–02:30 Paris), le chrono d'un jour précédent devient un brouillon **« sortie oubliée »** (fin = heure prévue, sinon **« fin à compléter »**). Le scan du lendemain marche normalement |
| **Ligne « à compléter »** | — | Impossible à envoyer (refus en base), hors export et clôture, comptée dans **« à relancer »** |
| **Case verte du bureau** | Tout chrono ouvert | Seulement un chrono ouvert **aujourd'hui** (bureau, borne, Assistant) |
| **Bureau — fiche salarié** | « modifié après envoi » | + badges **« QR »**, **« corrigé »** (heures d'une ligne QR changées), **« sortie oubliée »** |
| **« À relancer »** | Mois en cours | **Mois précédent + mois en cours**, sauf mois clôturé / salarié clôturé |
| **Réglage « Endroit au pointage en direct »** | Visible | **Caché** (pas effacé) ; reste affiché seulement s'il était activé, pour le désactiver |
| **Assistant salarié** | « Je commence », « annule mon pointage » | Renvoie au QR de la tablette ; seul « J'ai fini » reste |

Le moteur du chrono (`active_sessions`, `finish_active_session`) est **gardé** :
c'est lui que la borne utilise.

## Ce qui part en prod (avec le lot 11, feu vert d'Ergun)

1. **Migration** `20261003120000_lot12_pointage_qr.sql` (après celle du lot 11) :
   3 colonnes sur `time_entries` (`source`, `exit_forgotten`, `corrected_at`),
   1 sur `active_sessions` (`source`), 6 fonctions neuves, 2 triggers neufs,
   1 travail cron `bemexo-close-forgotten-sessions`. Rien de modifié.
2. **Fonction `kiosk`** (`--no-verify-jwt`) : arrivée par `kiosk_open_session`,
   sortie oubliée fermée au scan du lendemain, case verte du jour seulement.
3. **Fonction `assistant`** : aide (sortie oubliée, endroit), chronos du jour seulement.
4. **Fonction `worker-assistant`** : plus de « commencer » / « annuler » un pointage.

⚠ **Ordre impératif : la fonction `kiosk` AVANT la migration du lot 12.**
L'ancienne `kiosk` (v4) insère le chrono au nom du salarié, sans passer par
`kiosk_open_session` : après la migration, le nouveau garde la refuserait
(« avec la tablette, la journée commence en scannant le QR ») et les arrivées
QR tomberaient. La nouvelle `kiosk` marche avant la migration (repli).

Ordre complet : migration lot 11 → `kiosk` → migration lot 12 → `assistant`
→ `worker-assistant` → application (bemexo.com).

Avant la migration, l'application marche (badges absents, pas de fermeture de
nuit).

## Tests

- PGlite : `npm run test:pointage-qr` (48 vérifications : règles en base, cron, refus, trace)
- Deno : `deno test -A supabase/functions/` (dont kiosk de bout en bout, lot 12)
- Navigateur : `scripts/tests/salarie-lot12.mjs` (+ lots 9, 10, 11 mis à jour)
- Captures : `docs/captures-lot12/`
