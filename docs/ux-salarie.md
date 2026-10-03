# Lot 6 — UX salarié (écran épuré)

Règle : **aucun texte d'explication sur les écrans** ; l'aide passe par ✨ et par
« ℹ️ Informations » dans le menu.

## Fait

| | Avant | Après |
|---|---|---|
| Barre du bas (salarié) | `+` · Envoyer, **recouvert** par le bouton flottant « Assistant BEMEXO » | `+` · **Envoyer ma journée** · **✨** (rond). Sans `ai_enabled` : pas de ✨, « Envoyer » reprend la largeur |
| Bouton flottant | Salarié et patron | **Supprimé** partout dans l'app (reste seulement sur les pages de démo) |
| 📷 Scanner | — | Icône dans l'en-tête, à gauche de l'avatar, **si `kiosk_enabled`**. Caméra dans l'appli : BarcodeDetector, sinon **jsQR** (chargé à la demande). Le QR ouvre `/pointer?k=…&c=…` : même flux que le lot 1 |
| Pointer en direct | Sélecteur + « Je commence » + 2 textes | Sélecteur + « Je commence », rien d'autre |
| Pointer en direct (lot 9) | Sélecteur + « Je commence » | **Bloc supprimé** : « ▶ Je commence » sur chaque carte de « Chantiers du jour » (+ « Je commence sur un autre chantier » seulement les jours sans aucune carte) — voir [lot 9](lot9-borne-encours.md) |
| Info « l'endroit au pointage » (CNIL) | Encadré permanent | **Déplacée**, pas supprimée : menu → « ℹ️ Informations », et petite fenêtre **une seule fois** au premier pointage (« J'ai compris », mémorisé par salarié sur l'appareil), **avant** toute collecte — aussi quand c'est l'assistant qui démarre le pointage |
| Détail des réserves | « (obligatoire) », bandeau rouge, OK bloqué | **« Détail des réserves (facultatif) »**, placeholder « Ex. : fissure mur sud », rien ne bloque OK |
| Menu salarié | — | + « ✨ Assistant BEMEXO » (si `ai_enabled`) et « ℹ️ Informations » |
| Patron | Bouton flottant sur le planning | ✨ dans la barre (bureau) et dans l'en-tête à côté du menu (mobile) |

**Base de données** : aucun texte de réserve n'est exigé côté serveur (vérifié :
contraintes de `time_entries`, trigger `guard_time_entry_write`, RPC
`mark_reserve_fixed` / `set_reserve_resolution` — la note y est déjà facultative).
**Aucune migration** pour ce lot.

## À décider — autres textes d'explication repérés (rien supprimé)

| Écran | Texte |
|---|---|
| Ma journée (bas) | « Touche un chantier pour le corriger (la secrétaire sera prévenue). » |
| Ma journée (mois clôturé) | « Mois clôturé — vois avec la secrétaire pour modifier. » (utile : à garder ?) |
| Éditeur de chantier | « Touche une heure pour la régler » |
| Éditeur de chantier | Encadré « ☕ Les pauses sont calculées automatiquement d'après vos horaires. » |
| Éditeur « Autre chantier » | « Le bureau le verra sous ce nom. Vous pouvez aussi ne rien mettre et rester sur « Autre ». » |
| Dupliquer la journée | « Choisis les jours où copier cette journée (mêmes chantiers + heures). » |
| Fenêtre « journée envoyée » | « Cette journée a déjà été envoyée. Si tu y touches, la secrétaire en sera informée. » |
| Fenêtre « mois clôturé » | « Le bureau a clôturé ce mois : la paie est partie… » |
| Retirer un chantier envoyé | « Il a déjà été envoyé : il restera visible comme « Retiré »… » |
| Pointage en cours | « Rien n'est compté tant que tu n'as pas fermé. » |

## Captures (mobile, base simulée dans le navigateur de test)

`docs/captures-ux-salarie/` : `avant-*` et `apres-*` (journée, patron mobile et
bureau, menu, Informations, info au premier pointage, assistant ouvert, scanner,
réserve facultative).
