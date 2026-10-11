-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 0 (oct. 2026) — FERMETURE NOCTURNE DES POINTAGES OUBLIÉS
-- ═════════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE (à coller tel quel si besoin, rien d'autre n'est touché) :
--   SELECT cron.unschedule('bemexo-close-forgotten-sessions')
--    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bemexo-close-forgotten-sessions');
--   DROP FUNCTION IF EXISTS public.close_forgotten_sessions(uuid);
--
-- VÉRIFICATION APRÈS APPLICATION (doit renvoyer 4 × true) :
--   SELECT
--     EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'close_forgotten_sessions'
--             AND pronamespace = 'public'::regnamespace AND prosecdef)                     AS fonction,
--     NOT has_function_privilege('authenticated', 'public.close_forgotten_sessions(uuid)', 'EXECUTE')
--     AND NOT has_function_privilege('anon', 'public.close_forgotten_sessions(uuid)', 'EXECUTE') AS droits,
--     EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bemexo-close-forgotten-sessions'
--             AND schedule = '30 0 * * *')                                                  AS cron,
--     public.close_forgotten_sessions('00000000-0000-0000-0000-000000000000') = 0           AS appel_vide;
--
-- HISTORIQUE : si le fichier est collé dans l'éditeur SQL, inscrire ensuite :
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261011090000', 'lot0_fermeture_pointages_oublies') ON CONFLICT DO NOTHING;
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI : la partie 6 du lot 12 n'a jamais été appliquée en production (la
-- base a reçu « lot12_pointage_qr_partie1 » seulement). Sans elle, un salarié
-- qui oublie de scanner à la sortie garde un chrono ouvert : le scan du
-- lendemain est bloqué. La borne appelle déjà close_forgotten_sessions (elle
-- ignore l'erreur tant que la fonction manque) : rien à redéployer.
--
-- CE QUE FAIT LA FONCTION (mot pour mot la partie 6 du lot 12, déjà testée) :
-- un chrono resté ouvert un jour PRÉCÉDENT (heure de Paris) devient une ligne
-- d'heures en BROUILLON marquée « sortie oubliée » (exit_forgotten = true).
--   · Fin = heure prévue du planning si elle est après le début ; sinon fin =
--     début, c'est-à-dire « à compléter » : la ligne ne peut pas être envoyée
--     tant que le salarié n'a pas mis son heure de sortie.
--   · Jour clos (mois clôturé ou salarié clôturé) : on n'écrit rien, on laisse.
--   · Rien ne se perd : la ligne « en cours » est retirée SEULEMENT après que
--     la ligne d'heures a été écrite, dans la même transaction. L'heure de
--     début, le chantier, le créneau et la source (qr) sont recopiés.
--
-- 100 % ADDITIVE : une fonction neuve et un travail cron neuf. Aucune table,
-- colonne, policy, trigger ou fonction existante n'est modifiée ; aucune
-- donnée existante n'est touchée à l'application. Rejouable (OR REPLACE ;
-- le cron est re-planifié sous le même nom).
--
-- À SAVOIR (règle « DROP ou DELETE ») : le mot DELETE apparaît UNE fois, dans
-- le corps de la fonction (retrait de la ligne « en cours » une fois recopiée
-- en brouillon). Il ne s'exécute pas à l'application du fichier, seulement
-- chaque nuit, et uniquement sur des chronos d'un jour passé.
--
-- Testée sur un Postgres jetable : npm run test:fermeture-nuit
-- (supabase/tests/lot0_fermeture_pointages_oublies.mjs).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.close_forgotten_sessions(p_user uuid DEFAULT NULL)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  s record;
  v_today date := (now() AT TIME ZONE 'Europe/Paris')::date;
  v_start time;
  v_plan time;
  v_end time;
  v_n integer := 0;
BEGIN
  FOR s IN
    SELECT * FROM public.active_sessions a
     WHERE a.work_date < v_today AND (p_user IS NULL OR a.user_id = p_user)
     FOR UPDATE SKIP LOCKED
  LOOP
    IF public.is_month_closed(s.company_id, s.work_date)
       OR coalesce(public.user_closed_until(s.user_id) >= s.work_date, false) THEN
      CONTINUE;
    END IF;
    v_start := date_trunc('minute', s.started_at AT TIME ZONE 'Europe/Paris')::time;
    v_plan := NULL;
    IF s.planning_id IS NOT NULL THEN
      SELECT p.estimated_end INTO v_plan FROM public.planning p WHERE p.id = s.planning_id;
    END IF;
    v_end := CASE WHEN v_plan IS NOT NULL AND v_plan > v_start THEN v_plan ELSE v_start END;

    INSERT INTO public.time_entries
      (company_id, user_id, worksite_id, planning_id, work_date,
       start_time, end_time, break_minutes, meal_allowance, status, source, exit_forgotten)
    VALUES
      (s.company_id, s.user_id, s.worksite_id, s.planning_id, s.work_date,
       v_start, v_end, 0, false, 'draft', s.source, true);

    DELETE FROM public.active_sessions a
     WHERE a.user_id = s.user_id AND a.started_at = s.started_at;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.close_forgotten_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_forgotten_sessions(uuid) TO service_role;

-- Chaque nuit à 00:30 UTC (01:30 ou 02:30 à Paris) : le vendredi oublié ne
-- reste pas ouvert tout le week-end. Nom stable : re-planifier remplace.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('bemexo-close-forgotten-sessions')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bemexo-close-forgotten-sessions');
    PERFORM cron.schedule('bemexo-close-forgotten-sessions', '30 0 * * *',
      $cron$ SELECT public.close_forgotten_sessions(); $cron$);
  END IF;
END $$;
