-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 12 — POINTAGE PAR QR : ENTRÉE / SORTIE, SORTIE OUBLIÉE, TRACE POUR LE BUREAU
-- ═════════════════════════════════════════════════════════════════════════════
-- NON appliquée : feu vert d'Ergun (part avec le lot 11). Testée sur un
-- Postgres jetable : npm run test:pointage-qr (supabase/tests/lot12_pointage_qr.mjs).
--
-- 100 % ADDITIVE. Trois colonnes neuves sur time_entries, une sur
-- active_sessions (toutes avec valeur par défaut), cinq fonctions neuves, deux
-- triggers neufs, un travail cron neuf. Aucune table, colonne, policy ou
-- fonction existante n'est modifiée ; aucune donnée n'est touchée.
--
-- LES RÈGLES (demande d'Ergun, lot 12) :
--   · Avec une tablette reliée, une journée COMMENCE uniquement par un scan QR.
--     Le téléphone (et l'Assistant) peuvent seulement la TERMINER. Le refus est
--     en base : un appel direct à l'API ne contourne pas la règle.
--   · Sans tablette, l'écran du salarié ne propose plus le chrono : il saisit
--     ses heures (rien à faire ici, la base ne bloque rien).
--   · Sortie oubliée : CHAQUE NUIT, un chrono resté ouvert un jour précédent est
--     fermé en BROUILLON « sortie oubliée ». Fin = heure prévue du planning si
--     elle est après le début ; sinon fin = début (= « à compléter »).
--   · Une ligne « à compléter » (sortie oubliée ET fin = début) ne peut pas être
--     envoyée tant que le salarié n'a pas mis sa fin. Elle reste donc hors de
--     l'export et de la clôture (qui ne lisent que les lignes envoyées).
--   · Trace pour le bureau : `source = 'qr'` (ligne venue d'un pointage QR),
--     `exit_forgotten` (sortie oubliée), `corrected_at` (heures d'une ligne QR
--     changées après coup — par le salarié ou le bureau). Personne ne peut les
--     poser ni les effacer à la main.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) Colonnes neuves ──────────────────────────────────────────────────────
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS source text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS exit_forgotten boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS corrected_at timestamptz DEFAULT NULL;
ALTER TABLE public.active_sessions
  ADD COLUMN IF NOT EXISTS source text DEFAULT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_entries_source_check') THEN
    ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_source_check CHECK (source IS NULL OR source = 'qr');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'active_sessions_source_check') THEN
    ALTER TABLE public.active_sessions ADD CONSTRAINT active_sessions_source_check CHECK (source IS NULL OR source = 'qr');
  END IF;
END $$;

COMMENT ON COLUMN public.time_entries.source IS
  'Lot 12 : ''qr'' = ligne venue d''un pointage commencé à la tablette (QR). Posé par la base, jamais à la main.';
COMMENT ON COLUMN public.time_entries.exit_forgotten IS
  'Lot 12 : chrono oublié, fermé la nuit en brouillon. Avec fin = début, la ligne est « à compléter » et ne peut pas être envoyée.';
COMMENT ON COLUMN public.time_entries.corrected_at IS
  'Lot 12 : heures d''une ligne QR changées après coup (salarié ou bureau). Compléter une sortie oubliée n''est pas une correction.';

-- ── 2) Une tablette est-elle reliée ? ───────────────────────────────────────
-- Les salariés ne lisent pas la table des bornes (policy admin) : la réponse
-- passe par ces deux fonctions, qui ne disent que oui / non.
CREATE OR REPLACE FUNCTION public.company_kiosk_active(p_company uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.kiosks k
      JOIN public.companies c ON c.id = k.company_id
     WHERE k.company_id = p_company AND k.revoked_at IS NULL AND c.kiosk_enabled
  );
$fn$;
REVOKE EXECUTE ON FUNCTION public.company_kiosk_active(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.company_has_kiosk()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
  SELECT coalesce(public.company_kiosk_active(public.get_my_company_id()), false);
$fn$;
REVOKE EXECUTE ON FUNCTION public.company_has_kiosk() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_has_kiosk() TO authenticated;

-- ── 3) Garde du chrono : avec tablette, on commence par le QR ───────────────
-- Les gardes existants (chantier de l'entreprise, mois clos, clôture du
-- salarié) passent avant ou après, inchangés.
CREATE OR REPLACE FUNCTION public.guard_active_session_qr()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    new.source := old.source;
    RETURN new;
  END IF;
  -- Cron / service : rien à vérifier (aucun de ces chemins ne crée de chrono).
  IF auth.uid() IS NULL THEN
    RETURN new;
  END IF;
  IF current_setting('bemexo.kiosk_start', true) = '1' THEN
    new.source := 'qr';
    RETURN new;
  END IF;
  new.source := NULL;
  IF public.company_kiosk_active(new.company_id) THEN
    RAISE EXCEPTION 'active_sessions: avec la tablette, la journée commence en scannant le QR'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN new;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.guard_active_session_qr() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS active_sessions_qr_guard ON public.active_sessions;
CREATE TRIGGER active_sessions_qr_guard
  BEFORE INSERT OR UPDATE ON public.active_sessions
  FOR EACH ROW EXECUTE FUNCTION public.guard_active_session_qr();

-- ── 4) Garde des lignes d'heures : trace QR, sortie oubliée, correction ────
-- Nom choisi pour passer APRÈS time_entries_guard_write (ordre alphabétique).
CREATE OR REPLACE FUNCTION public.guard_time_entry_qr()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
  -- Cron (fermeture de nuit) / service : il pose lui-même ses colonnes.
  IF auth.uid() IS NULL THEN
    RETURN new;
  END IF;

  IF TG_OP = 'INSERT' THEN
    new.exit_forgotten := false;
    new.corrected_at := NULL;
    -- Ligne QR = celle que finish_active_session écrit pour un chrono commencé
    -- au QR (le chrono existe encore au moment de l'insertion : même salarié,
    -- même jour, même chantier, même minute de début).
    IF EXISTS (
      SELECT 1 FROM public.active_sessions a
       WHERE a.user_id = new.user_id AND a.source = 'qr'
         AND a.work_date = new.work_date AND a.worksite_id = new.worksite_id
         AND date_trunc('minute', a.started_at AT TIME ZONE 'Europe/Paris')::time = new.start_time
    ) THEN
      new.source := 'qr';
    ELSE
      new.source := NULL;
    END IF;
  ELSE
    new.source := old.source;
    new.exit_forgotten := old.exit_forgotten;
    IF old.source = 'qr'
       AND (new.start_time, new.end_time) IS DISTINCT FROM (old.start_time, old.end_time)
       -- Mettre l'heure de fin d'une sortie oubliée « à compléter » : ce n'est
       -- pas une correction, c'est la saisie demandée.
       AND NOT (old.exit_forgotten AND old.end_time = old.start_time AND new.start_time = old.start_time)
    THEN
      new.corrected_at := now();
    ELSE
      new.corrected_at := old.corrected_at;
    END IF;
  END IF;

  IF new.exit_forgotten AND new.end_time = new.start_time AND new.status IN ('submitted', 'validated') THEN
    RAISE EXCEPTION 'time_entries: sortie oubliée — indiquez l''heure de fin avant d''envoyer'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN new;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.guard_time_entry_qr() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS time_entries_qr_guard ON public.time_entries;
CREATE TRIGGER time_entries_qr_guard
  BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_time_entry_qr();

-- ── 5) Arrivée par la tablette (fonction `kiosk`, service_role SEUL) ───────
-- Le chrono est inséré AU NOM DU SALARIÉ (auth.uid() = lui) : tous les gardes
-- existants s'appliquent (chantier, mois clos, clôture du salarié). Le drapeau
-- de transaction bemexo.kiosk_start laisse passer la règle « QR seulement ».
CREATE OR REPLACE FUNCTION public.kiosk_open_session(
  p_user uuid, p_worksite uuid, p_planning uuid, p_date date
)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_company uuid;
BEGIN
  SELECT u.company_id INTO v_company FROM public.users u WHERE u.id = p_user;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Salarié introuvable';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('bemexo.kiosk_start', '1', true);
  INSERT INTO public.active_sessions (user_id, company_id, worksite_id, planning_id, work_date)
  VALUES (p_user, v_company, p_worksite, p_planning, p_date);
  PERFORM set_config('bemexo.kiosk_start', '', true);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.kiosk_open_session(uuid, uuid, uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiosk_open_session(uuid, uuid, uuid, date) TO service_role;

-- ── 6) Fermeture des sorties oubliées (cron chaque nuit + borne le matin) ──
-- Un chrono d'un jour PRÉCÉDENT devient un brouillon « sortie oubliée ».
-- Jour clos (mois clôturé ou salarié clôturé) : on n'écrit rien, on laisse.
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

-- Vérification après application :
--   SELECT column_name FROM information_schema.columns WHERE table_name IN ('time_entries','active_sessions')
--     AND column_name IN ('source','exit_forgotten','corrected_at');           -- 4 lignes
--   SELECT tgname FROM pg_trigger WHERE tgname IN ('active_sessions_qr_guard','time_entries_qr_guard'); -- 2
--   SELECT jobname, schedule FROM cron.job WHERE jobname = 'bemexo-close-forgotten-sessions';            -- 1
