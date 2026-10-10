-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 4 — MISSIONS (TÂCHES DU JOUR) ET RÉUNIONS
-- ═════════════════════════════════════════════════════════════════════════════
-- PAS ENCORE APPLIQUÉE EN PRODUCTION : Cowork la relit et l'applique. Testée sur
-- un Postgres jetable : npm run test:missions-db (supabase/tests/lot4_missions_reunions.mjs),
-- avec les droits PAR DÉFAUT de production, chargée deux fois, puis retirée par
-- le RETOUR ARRIÈRE ci-dessous et rechargée.
--
-- 100 % ADDITIVE : 4 tables neuves, 3 fonctions neuves. Aucune table, colonne,
-- policy, fonction ou trigger existant n'est modifié ; aucune donnée n'est
-- touchée. Rejouable (IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS sur
-- les seules tables neuves).
--
-- NE COMPTE JAMAIS COMME HEURES. Tâches et réunions vivent dans LEURS tables :
-- rien ici n'écrit planning, time_entries ou active_sessions, et aucun trigger
-- n'est posé sur ces tables. Totaux, export de paie, coûts, relances « journée
-- non envoyée », borne : aucun de ces chemins ne lit ces tables.
--
-- LA RÈGLE :
--   · le bureau (is_admin) ajoute et retire les tâches d'un salarié actif (ou
--     chef d'équipe) de SON entreprise, et tient sa liste de « tâches
--     habituelles ». Pas de renommage : une tâche faite puis renommée resterait
--     « Fait » pour un autre texte — on la retire et on la remet ;
--   · le salarié lit SES tâches et coche « Fait » par set_day_task_done — et
--     RIEN d'autre : aucune policy d'écriture pour lui, et done_at / done_by ne
--     sont écrivables par personne en direct (droits par colonne) ; seule la
--     fonction les pose, pour le salarié concerné uniquement ;
--   · created_by vaut auth.uid() par défaut et ne figure pas dans les droits
--     d'insertion : il ne s'oublie pas et ne se falsifie pas ;
--   · une réunion s'écrit d'un bloc (réunion + participants, même transaction)
--     par office_save_meeting / office_delete_meeting, bureau seulement ;
--   · la lisent : le bureau de l'entreprise, ses participants, et toute
--     l'équipe quand elle est « Toute l'équipe ». Un participant ne lit que SA
--     ligne de participation, pas la liste des autres.
--
-- DROITS. Les fonctions tournent avec les droits du propriétaire (SECURITY
-- DEFINER, search_path vide) : elles contournent la RLS, CHAQUE fonction vérifie
-- donc elle-même l'entreprise et le rôle. Les objets neufs reçoivent par défaut
-- TOUS les droits pour anon et authenticated en production (pg_default_acl) :
-- ils sont repris explicitement plus bas (TRUNCATE, REFERENCES, TRIGGER compris).
-- Pas de policy « support_read » : lecture strictement limitée à l'entreprise
-- (même choix que le lot 2).
--
-- SUPPRIMER UN SALARIÉ (fiche salarié, sans heures ni planning) marche toujours :
-- ses tâches et ses participations partent avec lui (ON DELETE CASCADE) ; un
-- auteur supprimé laisse created_by / done_by à NULL.
--
-- Tant que cette migration n'est pas appliquée, l'application se comporte
-- EXACTEMENT comme avant : les lectures échouent en silence (PGRST205), le « + »
-- du planning n'ouvre que « Ajouter une intervention », « Ma journée » n'a
-- aucune section de plus, le menu « Imprimer » n'a pas « Avec les tâches ».

-- ── 1) Tâches habituelles (liste réutilisable du bureau) ───────────────────
CREATE TABLE IF NOT EXISTS public.task_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  text        text NOT NULL CHECK (length(btrim(text)) BETWEEN 1 AND 200),
  created_by  uuid DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- Une même tâche une seule fois par entreprise (« Ranger le dépôt » = « ranger le dépôt »).
CREATE UNIQUE INDEX IF NOT EXISTS task_templates_company_text_key
  ON public.task_templates (company_id, lower(btrim(text)));
COMMENT ON TABLE public.task_templates IS
  'Lot 4 : tâches habituelles du bureau (texte réutilisable). Bureau de l''entreprise seulement.';

ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.task_templates FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.task_templates TO authenticated;
GRANT INSERT (company_id, text) ON public.task_templates TO authenticated;
GRANT ALL ON public.task_templates TO service_role;

DROP POLICY IF EXISTS task_templates_admin_select ON public.task_templates;
CREATE POLICY task_templates_admin_select ON public.task_templates FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin());
DROP POLICY IF EXISTS task_templates_admin_insert ON public.task_templates;
CREATE POLICY task_templates_admin_insert ON public.task_templates FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() AND public.is_admin() AND created_by = auth.uid());
DROP POLICY IF EXISTS task_templates_admin_delete ON public.task_templates;
CREATE POLICY task_templates_admin_delete ON public.task_templates FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin());

-- ── 2) Tâches du jour d'un salarié ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.day_tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  -- CASCADE : « Supprimer » un salarié sans heures ni planning (fiche salarié)
  -- ne doit pas échouer à cause d'une tâche.
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  work_date   date NOT NULL,
  text        text NOT NULL CHECK (length(btrim(text)) BETWEEN 1 AND 200),
  -- Mêmes clés que day-part.ts (matin / après-midi / soir). NULL = sans moment.
  part        text CHECK (part IS NULL OR part IN ('matin', 'apres-midi', 'soir')),
  created_by  uuid DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Posés UNIQUEMENT par set_day_task_done (aucun droit d'écriture direct).
  done_at     timestamptz,
  done_by     uuid REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS day_tasks_company_date_idx ON public.day_tasks (company_id, work_date);
CREATE INDEX IF NOT EXISTS day_tasks_user_date_idx    ON public.day_tasks (user_id, work_date);
COMMENT ON TABLE public.day_tasks IS
  'Lot 4 : tâches courtes ajoutées par le bureau à la journée d''un salarié. Le salarié lit les siennes et coche « Fait » par set_day_task_done. Jamais des heures.';

ALTER TABLE public.day_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.day_tasks FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.day_tasks TO authenticated;
-- Droits PAR COLONNE : ni id, ni created_by, ni done_at / done_by à l'insertion.
-- AUCUN droit UPDATE : ni le texte, ni le salarié, ni le jour, ni « Fait ».
GRANT INSERT (company_id, user_id, work_date, text, part) ON public.day_tasks TO authenticated;
GRANT ALL ON public.day_tasks TO service_role;

-- Le bureau lit son entreprise ; le salarié (ou le chef d'équipe) lit SES tâches.
DROP POLICY IF EXISTS day_tasks_select ON public.day_tasks;
CREATE POLICY day_tasks_select ON public.day_tasks FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND (public.is_admin() OR user_id = auth.uid()));
-- Le bureau ajoute, pour un salarié ACTIF (ou chef d'équipe) de son entreprise.
DROP POLICY IF EXISTS day_tasks_admin_insert ON public.day_tasks;
CREATE POLICY day_tasks_admin_insert ON public.day_tasks FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() AND public.is_admin() AND created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.users u
                 WHERE u.id = day_tasks.user_id AND u.company_id = day_tasks.company_id
                   AND u.is_active IS DISTINCT FROM false AND u.role::text IN ('worker', 'lead')));
DROP POLICY IF EXISTS day_tasks_admin_delete ON public.day_tasks;
CREATE POLICY day_tasks_admin_delete ON public.day_tasks FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin());
-- Aucune policy UPDATE, aucune policy d'écriture pour le salarié : il coche
-- par la fonction ci-dessous.

-- ── 3) « Fait » : le salarié concerné, et lui seul ─────────────────────────
-- Rejouable : cocher deux fois garde la première heure ; décocher efface.
CREATE OR REPLACE FUNCTION public.set_day_task_done(p_task_id uuid, p_done boolean)
 RETURNS public.day_tasks
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE v_me uuid := auth.uid(); t public.day_tasks%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Non connecté.' USING ERRCODE = '42501'; END IF;
  IF p_task_id IS NULL OR p_done IS NULL THEN RAISE EXCEPTION 'Tâche introuvable.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO t FROM public.day_tasks d
   WHERE d.id = p_task_id AND d.user_id = v_me AND d.company_id = public.get_my_company_id()
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cette tâche n''existe plus, ou elle n''est pas à vous.' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.day_tasks
     SET done_at = CASE WHEN p_done THEN coalesce(t.done_at, now()) END,
         done_by = CASE WHEN p_done THEN coalesce(t.done_by, v_me) END
   WHERE id = t.id
  RETURNING * INTO t;
  RETURN t;
END $fn$;

-- ── 4) Réunions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meetings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id),
  title         text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  meeting_date  date NOT NULL,
  start_time    time NOT NULL,
  end_time      time,
  place         text CHECK (place IS NULL OR length(place) <= 160),
  -- « Toute l'équipe » : chaque salarié actif ou chef d'équipe de l'entreprise,
  -- y compris un nouveau venu. Sinon : la liste meeting_participants.
  all_team      boolean NOT NULL DEFAULT false,
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meetings_id_company_key UNIQUE (id, company_id),
  CONSTRAINT meetings_end_after_start CHECK (end_time IS NULL OR end_time > start_time)
);
CREATE INDEX IF NOT EXISTS meetings_company_date_idx ON public.meetings (company_id, meeting_date);
COMMENT ON TABLE public.meetings IS
  'Lot 4 : réunions posées par le bureau (titre, date, heure, lieu). Écrites UNIQUEMENT par office_save_meeting / office_delete_meeting. Ne comptent jamais comme heures.';

CREATE TABLE IF NOT EXISTS public.meeting_participants (
  meeting_id  uuid NOT NULL,
  company_id  uuid NOT NULL,
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  PRIMARY KEY (meeting_id, user_id),
  -- Même entreprise que la réunion, par construction ; partent avec elle.
  CONSTRAINT meeting_participants_meeting_fkey FOREIGN KEY (meeting_id, company_id)
    REFERENCES public.meetings (id, company_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS meeting_participants_user_idx ON public.meeting_participants (user_id);
COMMENT ON TABLE public.meeting_participants IS
  'Lot 4 : participants d''une réunion (quand elle n''est pas « Toute l''équipe »). Écrits par office_save_meeting.';

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meetings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.meeting_participants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.meetings, public.meeting_participants TO authenticated;
GRANT ALL ON public.meetings, public.meeting_participants TO service_role;

-- Pas de récursion : la policy des participants ne lit pas « meetings ».
DROP POLICY IF EXISTS meeting_participants_select ON public.meeting_participants;
CREATE POLICY meeting_participants_select ON public.meeting_participants FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND (public.is_admin() OR user_id = auth.uid()));
DROP POLICY IF EXISTS meetings_select ON public.meetings;
CREATE POLICY meetings_select ON public.meetings FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id()
         AND (public.is_admin() OR all_team
              OR EXISTS (SELECT 1 FROM public.meeting_participants mp
                          WHERE mp.meeting_id = meetings.id AND mp.user_id = auth.uid())));
-- Aucune policy INSERT / UPDATE / DELETE : seules les fonctions ci-dessous écrivent.

-- ── 5) Poser ou modifier une réunion, d'un bloc ────────────────────────────
-- p_id NULL = nouvelle réunion. Les participants sont REMPLACÉS à chaque
-- enregistrement (liste vide si « Toute l'équipe »).
CREATE OR REPLACE FUNCTION public.office_save_meeting(
  p_id uuid, p_title text, p_date date, p_start time, p_end time, p_place text, p_all_team boolean, p_user_ids uuid[])
 RETURNS public.meetings
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_me uuid := auth.uid(); v_co uuid; v_title text := btrim(coalesce(p_title, ''));
  v_place text := nullif(btrim(coalesce(p_place, '')), ''); v_all boolean := coalesce(p_all_team, false);
  v_ids uuid[]; m public.meetings%ROWTYPE;
BEGIN
  IF v_me IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Réservé au bureau.' USING ERRCODE = '42501'; END IF;
  v_co := public.get_my_company_id();
  IF v_co IS NULL THEN RAISE EXCEPTION 'Réservé au bureau.' USING ERRCODE = '42501'; END IF;
  IF length(v_title) < 1 OR length(v_title) > 120 THEN
    RAISE EXCEPTION 'Donnez un titre (120 caractères au plus).' USING ERRCODE = '22023'; END IF;
  IF p_date IS NULL OR p_start IS NULL THEN RAISE EXCEPTION 'Indiquez la date et l''heure.' USING ERRCODE = '22023'; END IF;
  IF p_end IS NOT NULL AND p_end <= p_start THEN RAISE EXCEPTION 'La fin doit être après le début.' USING ERRCODE = '22023'; END IF;
  IF v_place IS NOT NULL AND length(v_place) > 160 THEN RAISE EXCEPTION 'Lieu trop long (160 caractères au plus).' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(array_agg(DISTINCT x), '{}'::uuid[]) INTO v_ids
    FROM unnest(coalesce(p_user_ids, '{}'::uuid[])) AS x WHERE x IS NOT NULL;
  IF v_all THEN
    v_ids := '{}'::uuid[];
  ELSE
    IF cardinality(v_ids) = 0 THEN RAISE EXCEPTION 'Choisissez au moins un participant.' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_ids) AS x
                WHERE NOT EXISTS (SELECT 1 FROM public.users u
                                   WHERE u.id = x AND u.company_id = v_co
                                     AND u.is_active IS DISTINCT FROM false AND u.role::text IN ('worker', 'lead'))) THEN
      RAISE EXCEPTION 'Participant introuvable ou archivé.' USING ERRCODE = '22023'; END IF;
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.meetings (company_id, title, meeting_date, start_time, end_time, place, all_team, created_by)
    VALUES (v_co, v_title, p_date, p_start, p_end, v_place, v_all, v_me)
    RETURNING * INTO m;
  ELSE
    UPDATE public.meetings
       SET title = v_title, meeting_date = p_date, start_time = p_start, end_time = p_end,
           place = v_place, all_team = v_all, updated_at = now()
     WHERE id = p_id AND company_id = v_co
    RETURNING * INTO m;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cette réunion n''existe pas, ou vous n''y avez pas accès.' USING ERRCODE = 'P0002'; END IF;
    DELETE FROM public.meeting_participants mp WHERE mp.meeting_id = m.id;
  END IF;
  INSERT INTO public.meeting_participants (meeting_id, company_id, user_id)
  SELECT m.id, v_co, x FROM unnest(v_ids) AS x;
  RETURN m;
END $fn$;

-- ── 6) Retirer une réunion (ses participants partent avec elle) ────────────
CREATE OR REPLACE FUNCTION public.office_delete_meeting(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Réservé au bureau.' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.meetings m WHERE m.id = p_id AND m.company_id = public.get_my_company_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cette réunion n''existe pas, ou vous n''y avez pas accès.' USING ERRCODE = 'P0002'; END IF;
  RETURN true;
END $fn$;

-- ── 7) Droits des fonctions (repris explicitement : voir « DROITS ») ───────
REVOKE ALL ON FUNCTION public.set_day_task_done(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.office_save_meeting(uuid, text, date, time, time, text, boolean, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.office_delete_meeting(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_day_task_done(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.office_save_meeting(uuid, text, date, time, time, text, boolean, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.office_delete_meeting(uuid) TO authenticated;

-- VÉRIFICATION APRÈS APPLICATION — LECTURE SEULE, une ligne de résultat, toutes
-- les colonnes à true (le test l'exécute telle quelle).
-- SELECT
--   (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'task_templates') = 3 AS v1_task_templates_3_policies,
--   (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'day_tasks') = 3 AS v2_day_tasks_3_policies,
--   (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('meetings', 'meeting_participants') AND cmd = 'SELECT') = 2 AS v3_reunions_lecture_seule,
--   NOT has_table_privilege('anon', 'public.day_tasks', 'SELECT') AND NOT has_table_privilege('anon', 'public.task_templates', 'SELECT') AND NOT has_table_privilege('anon', 'public.meetings', 'SELECT') AND NOT has_table_privilege('anon', 'public.meeting_participants', 'SELECT') AS v4_anon_rien,
--   NOT has_table_privilege('authenticated', 'public.day_tasks', 'TRUNCATE') AND NOT has_table_privilege('authenticated', 'public.task_templates', 'TRUNCATE') AND NOT has_table_privilege('authenticated', 'public.meetings', 'TRUNCATE') AND NOT has_table_privilege('authenticated', 'public.meeting_participants', 'TRUNCATE') AND NOT has_table_privilege('anon', 'public.day_tasks', 'TRUNCATE') AND NOT has_table_privilege('anon', 'public.meetings', 'TRUNCATE') AS v5_pas_de_truncate,
--   NOT has_column_privilege('authenticated', 'public.day_tasks', 'done_at', 'UPDATE') AND NOT has_column_privilege('authenticated', 'public.day_tasks', 'text', 'UPDATE') AND NOT has_column_privilege('authenticated', 'public.day_tasks', 'done_at', 'INSERT') AND NOT has_column_privilege('authenticated', 'public.day_tasks', 'created_by', 'INSERT') AND has_column_privilege('authenticated', 'public.day_tasks', 'text', 'INSERT') AS v6_droits_par_colonne,
--   NOT has_table_privilege('authenticated', 'public.meetings', 'INSERT') AND NOT has_table_privilege('authenticated', 'public.meeting_participants', 'INSERT') AND NOT has_table_privilege('authenticated', 'public.meetings', 'DELETE') AS v7_reunions_par_fonction_seulement,
--   NOT has_function_privilege('anon', 'public.set_day_task_done(uuid, boolean)', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.office_save_meeting(uuid, text, date, time, time, text, boolean, uuid[])', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.office_delete_meeting(uuid)', 'EXECUTE') AND has_function_privilege('authenticated', 'public.set_day_task_done(uuid, boolean)', 'EXECUTE') AS v8_fonctions_sans_anon,
--   (SELECT bool_and(p.prosecdef AND coalesce(array_to_string(p.proconfig, ','), '') LIKE '%search_path=%') FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('set_day_task_done', 'office_save_meeting', 'office_delete_meeting')) AS v9_definer_search_path_vide,
--   (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('public.day_tasks'::regclass, 'public.task_templates'::regclass, 'public.meetings'::regclass, 'public.meeting_participants'::regclass)) = 0 AS v10_aucun_trigger;

-- RETOUR ARRIÈRE — rien d'existant n'a été remplacé : on retire ce qui a été
-- ajouté. ⚠ Efface les tâches, leurs « Fait », les tâches habituelles, les
-- réunions et leurs participants. Les heures, le planning et tout le reste ne
-- bougent pas. Pour l'exécuter : copier les lignes ENTRE « DÉBUT » et « FIN » en
-- retirant au début de chaque ligne « -- » ET l'espace qui suit.
-- ── DÉBUT DU RETOUR ARRIÈRE ──
-- DROP FUNCTION IF EXISTS public.office_delete_meeting(uuid);
-- DROP FUNCTION IF EXISTS public.office_save_meeting(uuid, text, date, time, time, text, boolean, uuid[]);
-- DROP FUNCTION IF EXISTS public.set_day_task_done(uuid, boolean);
-- DROP TABLE IF EXISTS public.meetings, public.meeting_participants;  -- ensemble : la policy de l'une lit l'autre
-- DROP TABLE IF EXISTS public.day_tasks;
-- DROP TABLE IF EXISTS public.task_templates;
-- ── FIN DU RETOUR ARRIÈRE ──
