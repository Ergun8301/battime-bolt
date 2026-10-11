-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 3 (oct. 2026) — TRACES : INTERVENTIONS SUPPRIMÉES OU DÉCALÉES
-- ═════════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE — les traces cessent d'être écrites ; la table et ce qu'elle
-- contient sont GARDÉS (rien n'est effacé). Pour l'exécuter : copier les lignes
-- ENTRE « DÉBUT » et « FIN » en retirant au début de chaque ligne « -- » ET
-- l'espace qui suit.
-- ── DÉBUT DU RETOUR ARRIÈRE ──
-- DROP TRIGGER IF EXISTS traces_planning_supprimee ON public.planning;
-- DROP TRIGGER IF EXISTS traces_planning_changee ON public.planning;
-- DROP TRIGGER IF EXISTS traces_planning_remise ON public.planning;
-- DROP TRIGGER IF EXISTS traces_heures_supprimee ON public.time_entries;
-- DROP TRIGGER IF EXISTS traces_heures_changee ON public.time_entries;
-- DROP TRIGGER IF EXISTS traces_heures_remise ON public.time_entries;
-- DROP TRIGGER IF EXISTS traces_pointage_supprime ON public.active_sessions;
-- DROP TRIGGER IF EXISTS traces_pointage_remis ON public.active_sessions;
-- DO $$ BEGIN
--   IF to_regclass('public.day_tasks') IS NOT NULL THEN
--     DROP TRIGGER IF EXISTS traces_tache_supprimee ON public.day_tasks;
--   END IF;
--   IF to_regclass('public.meetings') IS NOT NULL THEN
--     DROP TRIGGER IF EXISTS traces_reunion_supprimee ON public.meetings;
--     DROP TRIGGER IF EXISTS traces_reunion_changee ON public.meetings;
--   END IF;
-- END $$;
-- DROP FUNCTION IF EXISTS public.traces_capture();
-- DROP FUNCTION IF EXISTS public.traces_meeting();
-- DROP FUNCTION IF EXISTS public.traces_classify(text, text, jsonb, jsonb, uuid);
-- DROP FUNCTION IF EXISTS public.traces_author();
-- DROP FUNCTION IF EXISTS public.traces_origin();
-- ── FIN DU RETOUR ARRIÈRE ──
-- Pour retirer AUSSI la table (⚠ efface toutes les traces), en plus, à part :
--   DROP TABLE IF EXISTS public.traces;
--
-- VÉRIFICATION APRÈS APPLICATION — LECTURE SEULE, une ligne, 9 × true :
-- SELECT
--   (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.traces'::regclass) AS v1_rls_active,
--   (SELECT string_agg(policyname || ':' || cmd, ',' ORDER BY policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'traces') = 'traces_select_office:SELECT,traces_select_own:SELECT' AS v2_lecture_seule,
--   NOT has_table_privilege('anon', 'public.traces', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS v3_anon_rien,
--   has_table_privilege('authenticated', 'public.traces', 'SELECT') AND NOT has_table_privilege('authenticated', 'public.traces', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS v4_personne_n_ecrit,
--   NOT has_table_privilege('service_role', 'public.traces', 'INSERT,UPDATE,DELETE,TRUNCATE') AS v5_meme_le_service,
--   (SELECT bool_and(p.prosecdef AND array_to_string(p.proconfig, ',') = 'search_path=""' AND NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('traces_capture', 'traces_meeting', 'traces_classify', 'traces_author', 'traces_origin')) AS v6_fonctions_fermees,
--   (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('traces_capture', 'traces_meeting', 'traces_classify', 'traces_author', 'traces_origin')) = 5 AS v7_cinq_fonctions,
--   (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'traces\_%') = 11 AS v8_onze_declencheurs,
--   (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'traces' AND indexname IN ('traces_company_date_idx', 'traces_user_date_idx', 'traces_object_idx')) = 3 AS v9_index;
--
-- HISTORIQUE : si le fichier est collé dans l'éditeur SQL, inscrire ensuite :
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261011120000', 'lot3_traces_suppressions') ON CONFLICT DO NOTHING;
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI : aujourd'hui seules les corrections d'heures du bureau sont tracées
-- en entier (time_entry_edits). Une case du planning supprimée ou déplacée, un
-- brouillon effacé, une ligne retirée, une tâche ou une réunion supprimée, un
-- chrono supprimé par un admin (possible directement par l'API) : rien, ou
-- seulement dans la mémoire du navigateur (« Annuler »).
--
-- CE QUE FAIT LE FICHIER : une table `traces` remplie PAR LA BASE, à chaque
-- suppression ou décalage, avec l'AVANT et l'APRÈS complets. Personne ne peut
-- l'écrire, la modifier ni l'effacer (aucun droit d'écriture, même pour le
-- service). Lecture : le bureau lit son entreprise ; le salarié lit SES lignes
-- (son planning, ses heures, ses tâches, ses réunions), rien d'autre.
--
-- CE QUI EST TRACÉ (le reste est du bruit et ne l'est pas) :
--   · planning : case supprimée ; décalée (jour, heures prévues ou salarié —
--     changée de salarié : une ligne pour l'ancien ET pour le nouveau) ;
--     modifiée (chantier ou absence) ; remise (« Annuler » remet le même id).
--     Une case posée puis retirée dans les 5 minutes par la même personne
--     (« Annuler » d'un ajout) n'est pas une intervention supprimée.
--   · time_entries : ligne supprimée (sauf un brouillon VIDE jamais envoyé, qui
--     ne compte nulle part) ; retirée (statut « Retirée », avant/après) ; heures
--     décalées ou modifiées par QUELQU'UN D'AUTRE que le salarié, ou après
--     l'envoi ; remise. Un salarié qui tape ses propres brouillons : pas tracé.
--   · active_sessions : chrono supprimé SANS devenir une ligne d'heures (un
--     chrono fermé normalement — « J'ai fini », la borne, la nuit — écrit sa
--     ligne dans la même transaction : pas tracé ; moins d'une minute : pas
--     tracé) ; remis par « Annuler » (même salarié, même jour, 15 minutes).
--     Les coordonnées GPS du début ne sont JAMAIS recopiées.
--   · day_tasks : tâche supprimée (« Fait » n'est pas tracé).
--   · meetings : réunion supprimée ; décalée (date, heures) ; modifiée (titre,
--     lieu, « Toute l'équipe »). Une ligne-résumé pour le bureau (avec la liste
--     des participants) + une ligne par participant (sans la liste : un
--     participant ne voit pas les autres, règle du lot 4).
--
-- QUI ET D'OÙ : `actor_id` = auth.uid() (NULL = système), `actor_role` = son
-- rôle à cet instant. `origin` : 'ecran' par défaut quand quelqu'un est
-- connecté, 'systeme' sinon ; l'appli envoie l'en-tête `x-bemexo-origine:
-- assistant` pendant une action de l'assistant (lib/supabase.ts). Une fonction
-- serveur peut poser set_config('bemexo.origine', 'restauration', true) (lot 8).
-- Un client ne peut annoncer par l'en-tête que 'ecran', 'assistant' ou 'borne'.
--
-- JAMAIS BLOQUANT : déclencheurs AFTER, une écriture par INSTRUCTION (et non
-- par ligne : effacer 100 cases = un seul INSERT de 100 traces). En cas
-- d'erreur de trace, l'action de l'utilisateur passe quand même (EXCEPTION
-- WHEN OTHERS → RAISE WARNING). Exception documentée : la réunion supprimée
-- est lue AVANT la suppression (BEFORE DELETE), parce que la clé étrangère
-- efface ses participants avant tout déclencheur AFTER ; ce déclencheur rend
-- toujours la ligne : il ne peut ni bloquer ni annuler la suppression.
--
-- 100 % ADDITIVE : une table neuve, cinq fonctions neuves, onze déclencheurs
-- neufs. Aucune table, colonne, policy, fonction ou déclencheur existant n'est
-- modifié ; aucune donnée existante n'est lue ni réécrite à l'application.
-- Rejouable (IF NOT EXISTS, OR REPLACE pour les fonctions ; policies et
-- déclencheurs posés seulement s'ils manquent). Les déclencheurs des tâches et
-- des réunions ne sont posés que si les tables du lot 4 existent.
--
-- À SAVOIR (règle « DROP ou DELETE ») : hors du retour arrière, le mot DELETE
-- n'apparaît que comme ÉVÉNEMENT surveillé ('AFTER DELETE' dans la liste des
-- déclencheurs), comme valeur comparée (TG_OP = 'DELETE') et dans les
-- commentaires. Aucune instruction DELETE ni DROP n'est exécutée.
--
-- DURÉES DE CONSERVATION (décision D6) : heures 5 ans, planning et tâches 1 an.
-- PAS de purge ici (elle demanderait un DELETE) : elle viendra à part.
--
-- Tant que ce fichier n'est pas appliqué, l'application se comporte EXACTEMENT
-- comme avant : la lecture de `traces` échoue (PGRST205) et les deux entrées
-- (« Historique » du salarié, Réglages / menu du bureau) restent cachées.
--
-- Testée sur un Postgres jetable : npm run test:traces-db
-- (supabase/tests/lot3_traces_suppressions.mjs).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) La table ─────────────────────────────────────────────────────────────
-- Pas de clé étrangère vers users : une trace survit au salarié supprimé.
CREATE TABLE IF NOT EXISTS public.traces (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id    uuid NOT NULL,
  -- Le salarié concerné. NULL : ligne-résumé d'une réunion.
  user_id       uuid,
  -- Qui a agi (auth.uid()) ; NULL = système (cron, service). Son rôle à cet instant.
  actor_id      uuid,
  actor_role    text,
  origin        text NOT NULL CHECK (origin IN ('ecran', 'assistant', 'borne', 'systeme', 'restauration')),
  action        text NOT NULL CHECK (action IN ('supprimee', 'decalee', 'modifiee', 'retiree', 'remise')),
  object_table  text NOT NULL CHECK (object_table IN ('planning', 'time_entries', 'active_sessions', 'day_tasks', 'meetings')),
  -- L'id de la ligne (pour un chrono : le salarié, clé de active_sessions).
  object_id     uuid NOT NULL,
  -- Le jour concerné (jour du planning, des heures, de la réunion).
  work_date     date,
  before        jsonb,
  after         jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS traces_company_date_idx ON public.traces (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS traces_user_date_idx ON public.traces (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS traces_object_idx ON public.traces (object_id);
COMMENT ON TABLE public.traces IS
  'Lot 3 : interventions supprimées ou décalées (planning, heures, chrono, tâches, réunions), avant/après. Écrite UNIQUEMENT par des déclencheurs ; personne ne la modifie ni ne l''efface.';

ALTER TABLE public.traces ENABLE ROW LEVEL SECURITY;
-- Les objets neufs reçoivent par défaut TOUS les droits en production
-- (pg_default_acl) : repris explicitement. Même le service ne fait que lire.
REVOKE ALL ON public.traces FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.traces TO authenticated, service_role;
REVOKE ALL ON SEQUENCE public.traces_id_seq FROM PUBLIC, anon, authenticated, service_role;

-- Le bureau lit toute son entreprise. Le salarié (ou le chef d'équipe) lit SES
-- lignes, des seuls types qui le concernent, plus le résumé d'une réunion
-- « Toute l'équipe ». Policies neuves, posées une fois (aucun DROP).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'traces' AND policyname = 'traces_select_office') THEN
    CREATE POLICY traces_select_office ON public.traces FOR SELECT TO authenticated
      USING (company_id = public.get_my_company_id() AND public.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'traces' AND policyname = 'traces_select_own') THEN
    CREATE POLICY traces_select_own ON public.traces FOR SELECT TO authenticated
      USING (company_id = public.get_my_company_id()
             AND object_table IN ('planning', 'time_entries', 'active_sessions', 'day_tasks', 'meetings')
             AND (user_id = auth.uid()
                  OR (user_id IS NULL AND object_table = 'meetings'
                      AND coalesce(before ->> 'all_team', after ->> 'all_team') = 'true')));
  END IF;
END $$;

-- ── 2) D'où vient l'action ──────────────────────────────────────────────────
-- Serveur (set_config, transaction) > en-tête de l'appli (3 valeurs seulement)
-- > « écran » si quelqu'un est connecté, « système » sinon. Un en-tête illisible
-- ne fait rien échouer : on retombe sur le défaut.
CREATE OR REPLACE FUNCTION public.traces_origin()
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_set text := nullif(current_setting('bemexo.origine', true), '');
  v_head text;
BEGIN
  IF v_set IN ('ecran', 'assistant', 'borne', 'systeme', 'restauration') THEN RETURN v_set; END IF;
  BEGIN
    v_head := nullif(current_setting('request.headers', true), '')::json ->> 'x-bemexo-origine';
  EXCEPTION WHEN OTHERS THEN v_head := NULL;
  END;
  IF v_head IN ('ecran', 'assistant', 'borne') THEN RETURN v_head; END IF;
  RETURN CASE WHEN auth.uid() IS NULL THEN 'systeme' ELSE 'ecran' END;
END $fn$;

-- Qui agit, son rôle, d'où : lu UNE fois par instruction.
CREATE OR REPLACE FUNCTION public.traces_author(OUT actor_id uuid, OUT actor_role text, OUT origin text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
  actor_id := auth.uid();
  IF actor_id IS NOT NULL THEN
    SELECT u.role::text INTO actor_role FROM public.users u WHERE u.id = actor_id;
  END IF;
  origin := public.traces_origin();
END $fn$;

-- ── 3) Faut-il tracer cette ligne, et comment ? ─────────────────────────────
-- Une ligne avant / après (jsonb) → 0 ou 1 trace. Les règles de « CE QUI EST
-- TRACÉ » ci-dessus, table par table. Lu en jsonb : une colonne absente (lot
-- pas encore appliqué) ne fait rien échouer.
CREATE OR REPLACE FUNCTION public.traces_classify(p_table text, p_op text, p_old jsonb, p_new jsonb, p_actor uuid)
 RETURNS TABLE (company_id uuid, user_id uuid, action text, object_id uuid, work_date date, before jsonb, after jsonb)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  r jsonb := coalesce(p_new, p_old);
  v_key text := CASE WHEN p_table = 'active_sessions' THEN 'user_id' ELSE 'id' END;
  v_action text;
  v_last text;
  -- Ce qui se voit, par table : décalé (jour, heures, salarié) / modifié (le reste).
  v_moved text[] := CASE p_table
    WHEN 'planning' THEN ARRAY['work_date', 'user_id', 'estimated_start', 'estimated_end']
    WHEN 'time_entries' THEN ARRAY['work_date', 'user_id', 'start_time', 'end_time']
    ELSE ARRAY[]::text[] END;
  v_changed text[] := CASE p_table
    WHEN 'planning' THEN ARRAY['worksite_id', 'absence_type']
    WHEN 'time_entries' THEN ARRAY['worksite_id', 'break_minutes']
    ELSE ARRAY[]::text[] END;
  k text;
BEGIN
  IF p_op = 'DELETE' THEN
    -- Un brouillon VIDE (0 minute) jamais envoyé ne compte nulle part.
    IF p_table = 'time_entries' AND p_old ->> 'status' = 'draft' AND p_old ->> 'submitted_at' IS NULL
       AND coalesce(p_old ->> 'exit_forgotten', 'false') = 'false' AND p_old ->> 'start_time' = p_old ->> 'end_time' THEN
      RETURN;
    END IF;
    -- Posée puis retirée aussitôt par la même personne : un « Annuler » d'ajout.
    IF p_table IN ('planning', 'day_tasks') AND p_actor IS NOT NULL AND p_old ->> 'created_by' = p_actor::text
       AND (p_old ->> 'created_at')::timestamptz > now() - interval '5 minutes' THEN
      RETURN;
    END IF;
    IF p_table = 'active_sessions' THEN
      -- Moins d'une minute : un appui de trop, pas une heure travaillée.
      IF (p_old ->> 'started_at')::timestamptz > now() - interval '1 minute' THEN RETURN; END IF;
      -- Fermé normalement : sa ligne d'heures est écrite dans CETTE transaction.
      IF EXISTS (SELECT 1 FROM public.time_entries t
                  WHERE t.user_id = (p_old ->> 'user_id')::uuid AND t.work_date = (p_old ->> 'work_date')::date
                    AND txid_status((txid_current() >> 32 << 32) + t.xmin::text::bigint) = 'in progress') THEN
        RETURN;
      END IF;
      -- Jamais de coordonnées dans une trace.
      p_old := p_old - 'start_lat' - 'start_lng' - 'start_accuracy_m' - 'start_located_at';
    END IF;
    v_action := 'supprimee';

  ELSIF p_op = 'INSERT' THEN
    -- Remise : la dernière trace de cet objet dit « supprimée ».
    IF p_table IN ('planning', 'time_entries') THEN
      SELECT t.action INTO v_last FROM public.traces t
       WHERE t.object_id = (r ->> 'id')::uuid AND t.object_table = p_table
       ORDER BY t.id DESC LIMIT 1;
    ELSIF p_table = 'active_sessions' THEN
      SELECT t.action INTO v_last FROM public.traces t
       WHERE t.object_id = (r ->> 'user_id')::uuid AND t.object_table = 'active_sessions'
         AND t.work_date = (r ->> 'work_date')::date AND t.created_at > now() - interval '15 minutes'
       ORDER BY t.id DESC LIMIT 1;
      p_new := p_new - 'start_lat' - 'start_lng' - 'start_accuracy_m' - 'start_located_at';
    END IF;
    IF v_last IS DISTINCT FROM 'supprimee' THEN RETURN; END IF;
    v_action := 'remise';

  ELSE -- UPDATE
    IF p_table = 'time_entries' AND p_new ->> 'status' = 'cancelled' AND p_old ->> 'status' IS DISTINCT FROM 'cancelled' THEN
      v_action := 'retiree';
    ELSE
      FOREACH k IN ARRAY v_moved LOOP
        IF p_old -> k IS DISTINCT FROM p_new -> k THEN v_action := 'decalee'; EXIT; END IF;
      END LOOP;
      IF v_action IS NULL THEN
        FOREACH k IN ARRAY v_changed LOOP
          IF p_old -> k IS DISTINCT FROM p_new -> k THEN v_action := 'modifiee'; EXIT; END IF;
        END LOOP;
      END IF;
      IF v_action IS NULL THEN RETURN; END IF;
      -- Ses propres brouillons, jamais envoyés : le salarié tape, ce n'est pas une trace.
      IF p_table = 'time_entries' AND p_actor IS NOT NULL AND p_actor::text = p_old ->> 'user_id'
         AND p_old ->> 'status' = 'draft' AND p_old ->> 'submitted_at' IS NULL THEN
        RETURN;
      END IF;
    END IF;
  END IF;

  -- Changée de salarié : une ligne pour chacun des deux (l'ancien la voit partir).
  RETURN QUERY SELECT (r ->> 'company_id')::uuid, x.uid, v_action, (r ->> v_key)::uuid, (r ->> 'work_date')::date, p_old, p_new
    FROM (SELECT DISTINCT u::uuid AS uid FROM unnest(ARRAY[r ->> 'user_id', p_old ->> 'user_id']) AS u WHERE u IS NOT NULL) x;
END $fn$;

-- ── 4) Le déclencheur commun (planning, heures, chrono, tâches) ─────────────
-- Une instruction = un INSERT. Les tables de transition s'appellent old_rows /
-- new_rows dans CHAQUE déclencheur ci-dessous.
CREATE OR REPLACE FUNCTION public.traces_capture()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  a record;
  v_key text := CASE WHEN TG_TABLE_NAME = 'active_sessions' THEN 'user_id' ELSE 'id' END;
BEGIN
  BEGIN
    SELECT * INTO a FROM public.traces_author();
    IF TG_OP = 'DELETE' THEN
      INSERT INTO public.traces (company_id, user_id, actor_id, actor_role, origin, action, object_table, object_id, work_date, before, after)
      SELECT c.company_id, c.user_id, a.actor_id, a.actor_role, a.origin, c.action, TG_TABLE_NAME, c.object_id, c.work_date, c.before, c.after
        FROM old_rows o
        CROSS JOIN LATERAL public.traces_classify(TG_TABLE_NAME, TG_OP, to_jsonb(o), NULL, a.actor_id) c;
    ELSIF TG_OP = 'INSERT' THEN
      INSERT INTO public.traces (company_id, user_id, actor_id, actor_role, origin, action, object_table, object_id, work_date, before, after)
      SELECT c.company_id, c.user_id, a.actor_id, a.actor_role, a.origin, c.action, TG_TABLE_NAME, c.object_id, c.work_date, c.before, c.after
        FROM new_rows n
        CROSS JOIN LATERAL public.traces_classify(TG_TABLE_NAME, TG_OP, NULL, to_jsonb(n), a.actor_id) c;
    ELSE
      INSERT INTO public.traces (company_id, user_id, actor_id, actor_role, origin, action, object_table, object_id, work_date, before, after)
      SELECT c.company_id, c.user_id, a.actor_id, a.actor_role, a.origin, c.action, TG_TABLE_NAME, c.object_id, c.work_date, c.before, c.after
        FROM old_rows o
        JOIN new_rows n ON to_jsonb(o) ->> v_key = to_jsonb(n) ->> v_key
        CROSS JOIN LATERAL public.traces_classify(TG_TABLE_NAME, TG_OP, to_jsonb(o), to_jsonb(n), a.actor_id) c;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'traces (%, %) : % [%] — action faite, trace non écrite', TG_TABLE_NAME, TG_OP, SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END $fn$;

-- ── 5) Réunions : un résumé pour le bureau + une ligne par participant ──────
-- BEFORE DELETE (voir « JAMAIS BLOQUANT ») et AFTER UPDATE : dans les deux cas
-- la liste des participants est encore celle d'avant. Rend toujours la ligne.
CREATE OR REPLACE FUNCTION public.traces_meeting()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  a record;
  v_action text;
  v_ids uuid[];
  v_before jsonb := to_jsonb(OLD);
  v_after jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(NEW) END;
BEGIN
  BEGIN
    IF TG_OP = 'DELETE' THEN
      v_action := 'supprimee';
    ELSIF (OLD.meeting_date, OLD.start_time, OLD.end_time) IS DISTINCT FROM (NEW.meeting_date, NEW.start_time, NEW.end_time) THEN
      v_action := 'decalee';
    ELSIF (OLD.title, OLD.place, OLD.all_team) IS DISTINCT FROM (NEW.title, NEW.place, NEW.all_team) THEN
      v_action := 'modifiee';
    END IF;
    IF v_action IS NOT NULL THEN
      SELECT * INTO a FROM public.traces_author();
      SELECT coalesce(array_agg(mp.user_id ORDER BY mp.user_id), '{}'::uuid[]) INTO v_ids
        FROM public.meeting_participants mp WHERE mp.meeting_id = OLD.id;
      INSERT INTO public.traces (company_id, user_id, actor_id, actor_role, origin, action, object_table, object_id, work_date, before, after)
      SELECT OLD.company_id, x.uid, a.actor_id, a.actor_role, a.origin, v_action, 'meetings', OLD.id, OLD.meeting_date,
             CASE WHEN x.uid IS NULL THEN v_before || jsonb_build_object('participants', to_jsonb(v_ids)) ELSE v_before END,
             v_after
        FROM (SELECT NULL::uuid AS uid UNION ALL SELECT unnest(v_ids)) x;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'traces (meetings, %) : % [%] — action faite, trace non écrite', TG_OP, SQLERRM, SQLSTATE;
  END;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $fn$;

-- ── 6) Droits des fonctions : personne ne les appelle à la main ─────────────
-- Un déclencheur s'exécute sans droit EXECUTE (comme l'étape 27d).
REVOKE ALL ON FUNCTION public.traces_origin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.traces_author() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.traces_classify(text, text, jsonb, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.traces_capture() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.traces_meeting() FROM PUBLIC, anon, authenticated;

-- ── 7) Les déclencheurs (neufs) ─────────────────────────────────────────────
-- Posés seulement s'ils n'existent pas encore (rejouable sans rien retirer), et
-- seulement si la table existe (tâches et réunions : lot 4).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('traces_planning_supprimee', 'public.planning',        'AFTER DELETE', 'REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT', 'traces_capture'),
    ('traces_planning_changee',   'public.planning',        'AFTER UPDATE', 'REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT', 'traces_capture'),
    ('traces_planning_remise',    'public.planning',        'AFTER INSERT', 'REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT', 'traces_capture'),
    ('traces_heures_supprimee',   'public.time_entries',    'AFTER DELETE', 'REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT', 'traces_capture'),
    ('traces_heures_changee',     'public.time_entries',    'AFTER UPDATE', 'REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT', 'traces_capture'),
    ('traces_heures_remise',      'public.time_entries',    'AFTER INSERT', 'REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT', 'traces_capture'),
    ('traces_pointage_supprime',  'public.active_sessions', 'AFTER DELETE', 'REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT', 'traces_capture'),
    ('traces_pointage_remis',     'public.active_sessions', 'AFTER INSERT', 'REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT', 'traces_capture'),
    ('traces_tache_supprimee',    'public.day_tasks',       'AFTER DELETE', 'REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT', 'traces_capture'),
    ('traces_reunion_supprimee',  'public.meetings',        'BEFORE DELETE', 'FOR EACH ROW', 'traces_meeting'),
    ('traces_reunion_changee',    'public.meetings',        'AFTER UPDATE', 'FOR EACH ROW', 'traces_meeting')
  ) AS v(name, tbl, ev, how, fn) LOOP
    IF to_regclass(r.tbl) IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgname = r.name AND t.tgrelid = to_regclass(r.tbl)) THEN
      EXECUTE format('CREATE TRIGGER %I %s ON %s %s EXECUTE FUNCTION public.%I()', r.name, r.ev, r.tbl, r.how, r.fn);
    END IF;
  END LOOP;
END $$;
