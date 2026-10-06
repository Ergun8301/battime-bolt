# Mise en prod groupée — lots 11 + 12 (+ 13 front, + 14)

**Rien n'est appliqué tant qu'Ergun n'a pas donné son feu vert lui-même.**
Projet Supabase `sdperbcquvneohotjono`. Fonctions déployées depuis le DERNIER
commit de `integration/bemexo-ia`.

## Ordre exact

| # | Étape | Contrôle |
|---|---|---|
| 0 | État de départ | SQL A |
| 1 | Migration `20261002120000_lot11_cloture_salarie.sql` | SQL B |
| 2 | Fonction `kiosk` (`--no-verify-jwt`) | version listée + un scan QR réel sur la tablette de test |
| 3 | Migration `20261003120000_lot12_pointage_qr.sql` | SQL C + un scan QR réel (chrono `source = 'qr'`) |
| 3 bis | Migration `20261006120000_lot14_chef_equipe_7_jours.sql` (lot 14) | SQL D |
| 4 | Fonction `assistant` | version listée |
| 5 | Fonction `worker-assistant` | version listée |
| 6 | **Fusion dans `main` (Ergun), IMMÉDIATEMENT après l'étape 5** | bemexo.com affiche le lot 12 |

- `kiosk` AVANT la migration du lot 12 : l'ancienne `kiosk` (v4) insère le
  chrono sans passer par `kiosk_open_session` ; après la migration, le nouveau
  garde la refuserait et les arrivées QR tomberaient. La nouvelle marche avant
  la migration (repli).
- Étape 6 tout de suite après 5 : entre la migration du lot 12 et la nouvelle
  appli, l'ancienne appli montre encore « Je commence » ; dans une entreprise
  avec tablette, la base le refuse (« avec la tablette, la journée commence en
  scannant le QR »). Plus la fenêtre est courte, moins de salariés la voient.

## `kiosks_actifs` (tablettes non retirées) — aujourd'hui **4**

| Moment | Valeur attendue | Pourquoi |
|---|---|---|
| SQL A (départ) | **4** | les 4 bornes de l'entreprise de test |
| SQL B (après migration lot 11) | **4** | la migration ne touche pas `kiosks` |
| Après `kiosk` (étape 2) | **4** tant que personne ne relie de tablette ; **1** dès qu'une tablette est reliée (elle remplace les autres, `revoked_at` posé, rien d'effacé) ; **0** après « Déconnecter la tablette » | règle du lot 11, dans la fonction |
| SQL C (après migration lot 12) | **inchangé** par la migration (4, ou 1 si une tablette a été reliée entre-temps) | la migration ne touche pas `kiosks` |

## SQL A — départ

```sql
SELECT (SELECT count(*) FROM public.companies WHERE kiosk_enabled) AS entreprises_borne_1,
       (SELECT count(*) FROM public.kiosks WHERE revoked_at IS NULL) AS kiosks_actifs_4,
       (SELECT count(*) FROM public.active_sessions) AS chronos_ouverts,
       to_regclass('public.user_closures') IS NOT NULL AS lot11_deja_false,
       (SELECT count(*) FROM pg_extension WHERE extname = 'pg_cron') AS pg_cron_1;
```

## SQL B — après la migration du lot 11

```sql
SELECT (SELECT count(*) FROM pg_policies WHERE tablename = 'user_closures') AS policies_4,
       (SELECT count(*) FROM pg_trigger WHERE tgname IN ('time_entries_guard_user_closure','active_sessions_guard_user_closure','user_closures_guard')) AS triggers_3,
       (SELECT count(*) FROM pg_trigger WHERE tgname IN ('time_entries_guard_write','time_entries_guard_delete','active_sessions_guard','active_sessions_position_guard')) AS anciens_4,
       has_function_privilege('authenticated', 'public.user_closed_until(uuid)', 'EXECUTE') AS salarie_false,
       (SELECT count(*) FROM public.kiosks WHERE revoked_at IS NULL) AS kiosks_actifs_4;
```

## SQL C — après la migration du lot 12

```sql
SELECT (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND ((table_name = 'time_entries' AND column_name IN ('source','exit_forgotten','corrected_at')) OR (table_name = 'active_sessions' AND column_name = 'source'))) AS colonnes_4,
       (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('company_kiosk_active','company_has_kiosk','guard_active_session_qr','guard_time_entry_qr','kiosk_open_session','close_forgotten_sessions')) AS fonctions_6,
       (SELECT count(*) FROM pg_trigger WHERE tgname IN ('active_sessions_qr_guard','time_entries_qr_guard')) AS triggers_2,
       (SELECT count(*) FROM cron.job WHERE jobname = 'bemexo-close-forgotten-sessions' AND schedule = '30 0 * * *') AS cron_1,
       has_function_privilege('authenticated', 'public.kiosk_open_session(uuid,uuid,uuid,date)', 'EXECUTE') AS open_salarie_false,
       has_function_privilege('authenticated', 'public.close_forgotten_sessions(uuid)', 'EXECUTE') AS close_salarie_false,
       (SELECT count(*) FROM public.time_entries WHERE source IS NOT NULL OR exit_forgotten OR corrected_at IS NOT NULL) AS lignes_touchees_0,
       (SELECT count(*) FROM public.kiosks WHERE revoked_at IS NULL) AS kiosks_actifs_inchange;
```

## SQL D — après la migration du lot 14

```sql
SELECT (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'time_entries' AND column_name IN ('lead_edited_by','lead_edited_at')) AS colonnes_2,
       (SELECT count(*) FROM pg_trigger WHERE tgname = 'time_entries_lead_guard') AS trigger_1,
       (SELECT prosrc LIKE '%- 6%' FROM pg_proc WHERE proname = 'is_my_team_member') AS regle_7_jours_true,
       has_function_privilege('authenticated', 'public.lead_send_entries(uuid[])', 'EXECUTE') AS envoi_chef_true,
       (SELECT count(*) FROM pg_policies WHERE tablename = 'time_entries') AS policies_inchangees,
       (SELECT count(*) FROM public.time_entries WHERE lead_edited_by IS NOT NULL) AS lignes_touchees_0,
       (SELECT count(*) FROM public.kiosks WHERE revoked_at IS NULL) AS kiosks_actifs_inchange;
```

`policies_inchangees` : même nombre qu'avant la migration (la noter au SQL A).
Lot 13 : front seul, rien à appliquer. Il part avec la fusion dans `main`.

### R14 (avant R12 et R11)

Le SQL complet est en bas de `20261006120000_lot14_chef_equipe_7_jours.sql` :
retirer la fonction `lead_send_entries`, le trigger `time_entries_lead_guard`, la fonction `guard_time_entry_lead`,
et remettre l'ancienne `is_my_team_member` (recopiée mot pour mot).

## Retour arrière

Ordre : R14 → R12 → (si besoin) anciennes fonctions `kiosk` v4 `cca24c8`,
`assistant` v7 `f788f84`, `worker-assistant` v5 `cca24c8` → R11 (R11 toujours
APRÈS R12 : la fermeture de nuit utilise une fonction du lot 11). Colonnes et
table gardées (sans effet, trace conservée).

Avant R12 : vérifier qu'aucune ligne « fin à compléter » n'est en brouillon
(`exit_forgotten AND status = 'draft' AND start_time = end_time`) — sans le
garde, l'ancienne appli pourrait l'envoyer à 0 h.

### R12

```sql
SELECT cron.unschedule('bemexo-close-forgotten-sessions');
DROP TRIGGER IF EXISTS time_entries_qr_guard ON public.time_entries;
DROP TRIGGER IF EXISTS active_sessions_qr_guard ON public.active_sessions;
DROP FUNCTION IF EXISTS public.close_forgotten_sessions(uuid), public.kiosk_open_session(uuid, uuid, uuid, date), public.guard_time_entry_qr(), public.guard_active_session_qr(), public.company_has_kiosk(), public.company_kiosk_active(uuid);
```

### R11

```sql
DROP TRIGGER IF EXISTS time_entries_guard_user_closure ON public.time_entries;
DROP TRIGGER IF EXISTS active_sessions_guard_user_closure ON public.active_sessions;
DROP TRIGGER IF EXISTS user_closures_guard ON public.user_closures;
DROP FUNCTION IF EXISTS public.guard_time_entry_user_closure(), public.guard_active_session_user_closure(), public.guard_user_closure(), public.user_closed_until(uuid);
```
