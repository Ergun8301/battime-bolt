# Borne de pointage QR — lot 1

Une tablette à l'entrée affiche un QR qui change chaque minute. Le salarié le
scanne avec l'appareil photo de son téléphone : arrivée ou départ, sur son compte.

## Parcours

| Qui | Où | Quoi |
|---|---|---|
| Bureau | Paramètres → Borne de pointage | Ajouter une borne (nom + lieu) → code 6 chiffres, 10 min |
| Tablette | `/borne` | Saisie du code → reçoit son secret → QR plein écran, pour toujours |
| Salarié | QR → `/pointer?b=…&c=…` | Connexion si besoin → retour auto → « ✅ Arrivée enregistrée — 08:02 » |

## Sécurité

- QR calculé **sur la tablette** (HMAC-SHA256, pas de 60 s, 8 chiffres). Aucun appel serveur, marche hors ligne.
- Le serveur accepte le pas courant ±1, refuse : borne révoquée, autre entreprise, compte archivé, interrupteur éteint, double scan < 60 s, > 200 m (option GPS).
- Secret de la tablette jamais stocké : le serveur garde `sha256(secret)` et une clé **dérivée** pour vérifier les QR.
- Arrivée / départ : `active_sessions` et `stop_active_session()` appelés **avec le jeton du salarié** → RLS, garde, mois clôturé, arrondi : inchangés.
- Tables `kiosk_*` : RLS active, **aucune policy**, accès par l'Edge Function uniquement.
- Aucune position du salarié n'est enregistrée (comparée, puis oubliée).

## Préview (sans base)

- `/borne?demo=1` : borne fictive, QR réel, planning démo
- `/pointer?demo=in` / `?demo=out` : écran de confirmation

Actif **uniquement** sur les préviews (`isPreviewHost()`), jamais sur bemexo.com.

## Mise en service (après validation)

1. Migration `supabase/migrations/20260929120000_borne_pointage_qr.sql`
2. Fonction : `supabase functions deploy kiosk --no-verify-jwt`
3. Activer une entreprise : `UPDATE public.companies SET kiosk_enabled = true WHERE id = '…';`

## Choix simples retenus

- Chaque borne est rattachée à **un lieu** (chantier / établissement) : c'est là que l'arrivée est ouverte (`worksite_id` obligatoire du pointage). Le planning du jour du salarié sur ce lieu est rattaché s'il existe.
- Borne sans position (permission refusée) + option GPS : pas de blocage, un avertissement s'affiche côté bureau.
- Veille : horaires en heure de la tablette ; un toucher réveille 2 min.

## Idées pour plus tard

Arrondi des heures, PIN de secours, IA, accès support.
