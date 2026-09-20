-- 2026-09-20 — Étape 16 bis : fermer un chrono ne doit jamais doubler des heures.
--
-- TROU 1 — LA FERMETURE N'ÉTAIT PAS ATOMIQUE.
--   Le navigateur écrivait l'intervention, PUIS effaçait le chrono. Si la
--   seconde requête échoue — un salarié sur un chantier perd le réseau entre
--   les deux, ce qui est le quotidien — l'intervention existe et le chrono
--   aussi. À la réouverture, le chrono est toujours là ; le salarié le ferme à
--   nouveau et crée une SECONDE intervention pour la même période. Deux fois
--   les mêmes heures, envoyées en paie.
--
--   C'est le pire résultat possible dans cette application, et il venait de
--   mon propre code. Les deux écritures passent maintenant par une seule
--   fonction, donc une seule transaction : soit les deux, soit aucune.
--
-- TROU 2 — LE BUREAU POUVAIT CLÔTURER UN MOIS PENDANT QU'UN SALARIÉ POINTE.
--   La clôture ne regardait que les brouillons de `time_entries`. Un chrono en
--   cours n'y étant pas (c'est tout l'intérêt de la table séparée), rien ne
--   l'arrêtait. Ensuite, la fermeture du chrono est refusée par le garde des
--   heures : le mois est clos. Le salarié se retrouve avec un pointage
--   impossible à transformer, et ses heures coincées jusqu'à ce qu'un
--   administrateur rouvre le mois.
--
--   On ne clôture pas un mois dans lequel quelqu'un travaille encore.
--
-- À exécuter AVANT de fusionner la PR.

-- ── 1) Fermer le chrono en une seule transaction ──────────────────────────
-- L'heure de DÉBUT vient de `started_at` côté serveur, pas du navigateur : le
-- fuseau et l'arrondi sont ainsi calculés au même endroit pour tout le monde.
-- L'heure de FIN est celle que le salarié a indiquée, ou maintenant.
CREATE OR REPLACE FUNCTION public.stop_active_session(p_end time DEFAULT NULL)
 RETURNS TABLE (entry_id uuid, work_date date, start_time time, end_time time)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  s record;
  v_local timestamp;
  v_start time;
  v_end time;
  v_id uuid;
BEGIN
  SELECT * INTO s FROM public.active_sessions a WHERE a.user_id = auth.uid();
  IF s IS NULL THEN
    RAISE EXCEPTION 'Aucun pointage en cours';
  END IF;

  -- Arrondi au quart d'heure, comme la molette de saisie : une heure affichée
  -- et une heure enregistrée qui diffèrent seraient incompréhensibles.
  v_local := s.started_at AT TIME ZONE 'Europe/Paris';
  v_start := (date_trunc('hour', v_local)
              + (round(extract(minute FROM v_local) / 15.0) * interval '15 minutes'))::time;

  IF p_end IS NULL THEN
    v_local := now() AT TIME ZONE 'Europe/Paris';
    v_end := (date_trunc('hour', v_local)
              + (round(extract(minute FROM v_local) / 15.0) * interval '15 minutes'))::time;
  ELSE
    v_end := (date_trunc('hour', p_end::time)
              + (round(extract(minute FROM p_end::time) / 15.0) * interval '15 minutes'))::time;
  END IF;

  IF v_start = v_end THEN
    RAISE EXCEPTION 'Début et fin tombent sur le même quart d''heure : rien à enregistrer.';
  END IF;

  INSERT INTO public.time_entries
    (company_id, user_id, worksite_id, planning_id, work_date,
     start_time, end_time, break_minutes, meal_allowance, status)
  VALUES
    (s.company_id, s.user_id, s.worksite_id, s.planning_id, s.work_date,
     v_start, v_end, 0, false, 'draft')
  RETURNING id INTO v_id;

  DELETE FROM public.active_sessions a WHERE a.user_id = s.user_id;

  RETURN QUERY SELECT v_id, s.work_date, v_start, v_end;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.stop_active_session(time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stop_active_session(time) TO authenticated;

-- ── 2) On ne clôture pas un mois où quelqu'un pointe encore ───────────────
CREATE OR REPLACE FUNCTION public.guard_month_closure()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_qui text;
BEGIN
  SELECT string_agg(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ', ')
    INTO v_qui
  FROM public.active_sessions a
  JOIN public.users u ON u.id = a.user_id
  WHERE a.company_id = new.company_id
    AND date_trunc('month', a.work_date)::date = new.month;

  IF v_qui IS NOT NULL AND btrim(v_qui) <> '' THEN
    RAISE EXCEPTION 'Impossible de clôturer : % a un pointage encore ouvert sur ce mois. Sa journée doit être fermée avant.', v_qui;
  END IF;
  RETURN new;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.guard_month_closure() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS month_closures_guard ON public.month_closures;
CREATE TRIGGER month_closures_guard
  BEFORE INSERT ON public.month_closures
  FOR EACH ROW EXECUTE FUNCTION public.guard_month_closure();

-- Contrôle :
-- SELECT
--   (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.proname='stop_active_session') AS rpc_fermeture,
--   (SELECT count(*) FROM pg_trigger WHERE tgname='month_closures_guard') AS garde_cloture;
