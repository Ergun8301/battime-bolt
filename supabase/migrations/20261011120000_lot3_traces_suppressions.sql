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
--     DROP TRIGGER IF EXISTS traces_reunion_personnes ON public.meetings;
--   END IF;
--   IF to_regclass('public.meeting_participants') IS NOT NULL THEN
--     DROP TRIGGER IF EXISTS traces_reunion_participant_retire ON public.meeting_participants;
--   END IF;
-- END $$;
-- DROP FUNCTION IF EXISTS public.traces_capture();
-- DROP FUNCTION IF EXISTS public.traces_meeting();
-- DROP FUNCTION IF EXISTS public.traces_meeting_people();
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
--   (SELECT bool_and(p.prosecdef AND array_to_string(p.proconfig, ',') = 'search_path=""' AND NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('traces_capture', 'traces_meeting', 'traces_meeting_people', 'traces_classify', 'traces_author', 'traces_origin')) AS v6_fonctions_fermees,
--   (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('traces_capture', 'traces_meeting', 'traces_meeting_people', 'traces_classify', 'traces_author', 'traces_origin')) = 6 AS v7_six_fonctions,
--   (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'traces\_%') = 13 AS v8_treize_declencheurs,
--   (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'traces' AND indexname IN ('traces_company_date_idx', 'traces_user_date_idx', 'traces_object_idx')) = 3 AS v9_index;
--
-- SI L'APPLICATION ÉCHOUE AVEC « lock timeout » (canceling statement due to
-- lock timeout) : une longue requête occupait le planning ou les heures. Rien
-- n'a été appliqué ; il suffit de recoller le fichier un peu plus tard (il est
-- rejouable). Le fichier n'attend jamais plus de 5 secondes un verrou : les
-- salariés ne restent pas bloqués derrière lui.
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
--     (« Annuler » d'un ajout) n'est pas une intervention supprimée. Une
--     absence REMPLACÉE (nouvelle posée, ancienne retirée) : « modifiée »
--     (Congé → Arrêt maladie), rien si le type ne change pas ; son « Annuler »
--     (l'ancienne reposée, nouvel id) : « remise ».
--   · time_entries : ligne supprimée (sauf un brouillon VIDE jamais envoyé, qui
--     ne compte nulle part, et son propre brouillon posé il y a moins de 5
--     minutes : « Annuler » d'un ajout) ; retirée (statut « Retirée »,
--     avant/après) ; heures
--     décalées ou modifiées par QUELQU'UN D'AUTRE que le salarié, ou après
--     l'envoi ; remise. Un salarié qui tape ses propres brouillons : pas tracé.
--   · active_sessions : chrono supprimé SANS devenir une ligne d'heures (un
--     chrono fermé normalement — « J'ai fini », la borne, la nuit — écrit sa
--     ligne dans la même transaction : pas tracé ; moins d'une minute : pas
--     tracé) ; remis par « Annuler » (même salarié, même jour, 15 minutes, et
--     même heure de début ou même auteur sur le même chantier — un NOUVEAU
--     chrono lancé par le salarié après une suppression du bureau n'en est pas une).
--     Les coordonnées GPS du début ne sont JAMAIS recopiées.
--   · day_tasks : tâche supprimée (« Fait » n'est pas tracé).
--   · meetings : réunion supprimée ; décalée (date, heures) ; modifiée (titre,
--     lieu, « Toute l'équipe ») ; retirée à un salarié (enlevé de la liste, ou
--     « Toute l'équipe » devenue une liste sans lui). Une ligne-résumé pour le
--     bureau (avec la liste des participants ; lisible par l'équipe seulement
--     si la réunion est « Toute l'équipe » avant ET après) + une ligne par
--     salarié concerné (sans la liste : un participant ne voit pas les autres,
--     règle du lot 4). Un salarié retiré ne lit que l'avant, jamais les
--     nouveaux détails d'une réunion où il n'est plus invité.
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
-- toujours la ligne : il ne peut ni bloquer ni annuler la suppression. Les
-- lignes des salariés d'une réunion CHANGÉE sont écrites à la fin de la
-- transaction (déclencheurs de contrainte différés) : office_save_meeting
-- remplace les participants APRÈS avoir changé la réunion. Eux aussi
-- attrapent toute erreur : la validation n'échoue jamais à cause d'eux.
--
-- 100 % ADDITIVE : une table neuve, six fonctions neuves, treize déclencheurs
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

-- Jamais plus de 5 secondes d'attente d'un verrou (voir « lock timeout »).
SET LOCAL lock_timeout = '5s';

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
-- restée « Toute l'équipe ». Policies neuves, posées une fois (aucun DROP).
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
                  -- « Toute l'équipe » AVANT ET APRÈS : sinon le résumé dirait à
                  -- tous les détails d'une réunion devenue restreinte.
                  OR (user_id IS NULL AND object_table = 'meetings'
                      AND (before IS NULL OR before ->> 'all_team' = 'true')
                      AND (after IS NULL OR after ->> 'all_team' = 'true'))));
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
  v_repl jsonb;
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
    -- Pareil pour SON brouillon jamais envoyé (« Annuler » de l'assistant, ligne en trop).
    IF p_table = 'time_entries' AND p_actor IS NOT NULL AND p_old ->> 'user_id' = p_actor::text
       AND p_old ->> 'status' = 'draft' AND p_old ->> 'submitted_at' IS NULL
       AND (p_old ->> 'created_at')::timestamptz > now() - interval '5 minutes' THEN
      RETURN;
    END IF;
    -- Absence REMPLACÉE (lib/planning-writes.ts setAbsence : la nouvelle d'abord,
    -- l'ancienne ensuite, en deux requêtes) : même type → rien ; sinon « modifiée »,
    -- la nouvelle en après. Colonnes lues en jsonb (created_at peut manquer).
    IF p_table = 'planning' AND p_old ->> 'absence_type' IS NOT NULL THEN
      SELECT to_jsonb(p) INTO v_repl FROM public.planning p
       WHERE p.company_id = (p_old ->> 'company_id')::uuid AND p.user_id = (p_old ->> 'user_id')::uuid
         AND p.work_date = (p_old ->> 'work_date')::date AND p.absence_type IS NOT NULL AND p.id <> (p_old ->> 'id')::uuid
         AND (to_jsonb(p) ->> 'created_at')::timestamptz > now() - interval '5 minutes'
       ORDER BY to_jsonb(p) ->> 'created_at' DESC LIMIT 1;
      IF v_repl IS NOT NULL THEN
        IF v_repl ->> 'absence_type' = p_old ->> 'absence_type' THEN RETURN; END IF;
        p_new := v_repl;
        v_action := 'modifiee';
      END IF;
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
    v_action := coalesce(v_action, 'supprimee');

  ELSIF p_op = 'INSERT' THEN
    -- Remise : la dernière trace de cet objet dit « supprimée ».
    IF p_table IN ('planning', 'time_entries') THEN
      SELECT t.action INTO v_last FROM public.traces t
       WHERE t.object_id = (r ->> 'id')::uuid AND t.object_table = p_table
       ORDER BY t.id DESC LIMIT 1;
      -- « Annuler » d'une absence remplacée : l'ancienne reposée (nouvel id), même
      -- salarié, même jour, même type que l'avant d'une trace récente, et plus
      -- aucune autre absence ce jour-là (sinon c'est un remplacement qui commence).
      IF v_last IS NULL AND p_table = 'planning' AND r ->> 'absence_type' IS NOT NULL THEN
        SELECT 'supprimee' INTO v_last FROM public.traces t
         WHERE t.user_id = (r ->> 'user_id')::uuid AND t.object_table = 'planning' AND t.work_date = (r ->> 'work_date')::date
           AND t.action IN ('supprimee', 'modifiee') AND t.before ->> 'absence_type' = r ->> 'absence_type'
           AND t.created_at > now() - interval '15 minutes'
           AND NOT EXISTS (SELECT 1 FROM public.planning p WHERE p.user_id = (r ->> 'user_id')::uuid AND p.work_date = (r ->> 'work_date')::date
                            AND p.absence_type IS NOT NULL AND p.id <> (r ->> 'id')::uuid)
         LIMIT 1;
      END IF;
    ELSIF p_table = 'active_sessions' THEN
      -- Remis par « Annuler » (worker-actions remet la ligne lue) : la MÊME heure
      -- de début ; ou, si le serveur repose l'heure de prise (bouchon des lots 9
      -- et 11 : « comme en production »), la même personne que celle qui l'avait
      -- supprimé, sur le même chantier. Un nouveau chrono lancé par le salarié
      -- après une suppression du bureau n'est pas une remise.
      SELECT t.action INTO v_last FROM public.traces t
       WHERE t.object_id = (r ->> 'user_id')::uuid AND t.object_table = 'active_sessions'
         AND t.work_date = (r ->> 'work_date')::date AND t.created_at > now() - interval '15 minutes'
         AND ((t.before ->> 'started_at')::timestamptz = (r ->> 'started_at')::timestamptz
              OR (t.actor_id = p_actor AND t.before ->> 'worksite_id' IS NOT DISTINCT FROM r ->> 'worksite_id'))
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
-- Supprimée : le résumé et une ligne par participant (l'avant seulement).
-- Changée : le résumé seulement ; les lignes des salariés attendent la fin de
-- la transaction (traces_meeting_people), quand on sait qui la voit encore.
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
        FROM (SELECT NULL::uuid AS uid UNION ALL SELECT unnest(v_ids) WHERE v_after IS NULL) x;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'traces (meetings, %) : % [%] — action faite, trace non écrite', TG_OP, SQLERRM, SQLSTATE;
  END;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $fn$;

-- ── 6) Réunions changées : la ligne de chaque salarié, à la fin ────────────
-- office_save_meeting change la réunion PUIS remplace ses participants : c'est
-- seulement à la fin de la transaction (déclencheurs de contrainte DIFFÉRÉS)
-- qu'on sait qui la voit encore. Chacun ne lit que ce qui le concerne :
--   · il la voit encore (gardé dans la liste, ou « Toute l'équipe ») et le
--     jour, l'heure, le titre ou le lieu ont changé → sa ligne, avant → après ;
--   · il ne la voit plus → « retirée », l'avant seulement.
-- Un participant AJOUTÉ ne reçoit rien (recevoir une réunion n'est pas une
-- intervention supprimée). « Toute l'équipe » avant et après : le résumé suffit.
-- Deux déclencheurs, une fonction : meetings (UPDATE) et meeting_participants
-- (DELETE, retiré sans autre changement). Jamais deux lignes pour la même
-- personne dans la même transaction (now() = début de la transaction).
CREATE OR REPLACE FUNCTION public.traces_meeting_people()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  a record;
  -- Lu en jsonb : la même fonction sert aux deux tables.
  v_id uuid := (CASE WHEN TG_TABLE_NAME = 'meetings' THEN to_jsonb(NEW) ->> 'id' ELSE to_jsonb(OLD) ->> 'meeting_id' END)::uuid;
  m record;
  v_now jsonb;
  v_before jsonb;
  v_old uuid[];
  v_uid uuid;
  v_seen text;
  k text;
BEGIN
  BEGIN
    SELECT * INTO m FROM public.meetings mt WHERE mt.id = v_id;
    -- Réunion retirée entre-temps : déjà tracée (traces_meeting, BEFORE DELETE).
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_now := to_jsonb(m);
    -- Le résumé écrit par traces_meeting dans CETTE transaction (le premier : la liste d'origine).
    SELECT t.before INTO v_before FROM public.traces t
     WHERE t.object_id = v_id AND t.object_table = 'meetings' AND t.user_id IS NULL AND t.created_at = now()
       AND t.action IN ('decalee', 'modifiee')
     ORDER BY t.id LIMIT 1;

    IF TG_TABLE_NAME = 'meetings' THEN
      IF v_before IS NULL OR (v_before ->> 'all_team' = 'true' AND m.all_team) THEN RETURN NULL; END IF;
      -- Ce qu'un salarié qui la voit encore lit de changé.
      FOREACH k IN ARRAY ARRAY['meeting_date', 'start_time', 'end_time'] LOOP
        IF v_before -> k IS DISTINCT FROM v_now -> k THEN v_seen := 'decalee'; EXIT; END IF;
      END LOOP;
      IF v_seen IS NULL AND (v_before -> 'title' IS DISTINCT FROM v_now -> 'title' OR v_before -> 'place' IS DISTINCT FROM v_now -> 'place') THEN
        v_seen := 'modifiee';
      END IF;
      -- Qui la voyait : la liste d'avant, ou toute l'équipe active.
      IF v_before ->> 'all_team' = 'true' THEN
        SELECT coalesce(array_agg(u.id), '{}'::uuid[]) INTO v_old FROM public.users u
         WHERE u.company_id = m.company_id AND u.is_active IS DISTINCT FROM false AND u.role::text IN ('worker', 'lead');
      ELSE
        SELECT coalesce(array_agg(x::uuid), '{}'::uuid[]) INTO v_old FROM jsonb_array_elements_text(coalesce(v_before -> 'participants', '[]'::jsonb)) x;
      END IF;
      SELECT * INTO a FROM public.traces_author();
      v_before := v_before - 'participants';
      INSERT INTO public.traces (company_id, user_id, actor_id, actor_role, origin, action, object_table, object_id, work_date, before, after)
      SELECT m.company_id, x.uid, a.actor_id, a.actor_role, a.origin, CASE WHEN x.sees THEN v_seen ELSE 'retiree' END, 'meetings', v_id,
             (v_before ->> 'meeting_date')::date, v_before, CASE WHEN x.sees THEN v_now END
        FROM (SELECT o.uid, (m.all_team OR EXISTS (SELECT 1 FROM public.meeting_participants mp WHERE mp.meeting_id = v_id AND mp.user_id = o.uid)) AS sees
                FROM unnest(v_old) AS o(uid)
               WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.id = o.uid)) x
       WHERE (NOT x.sees OR v_seen IS NOT NULL)
         AND NOT EXISTS (SELECT 1 FROM public.traces t WHERE t.object_id = v_id AND t.object_table = 'meetings' AND t.user_id = x.uid AND t.created_at = now());
    ELSE
      -- Un participant retiré de la liste (sans autre changement visible, sinon
      -- c'est fait ci-dessus) : remis aussitôt (office_save_meeting remplace la
      -- liste), passé à « Toute l'équipe », ou compte supprimé → rien.
      v_uid := (to_jsonb(OLD) ->> 'user_id')::uuid;
      IF m.all_team
         OR EXISTS (SELECT 1 FROM public.meeting_participants mp WHERE mp.meeting_id = v_id AND mp.user_id = v_uid)
         OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_uid)
         OR EXISTS (SELECT 1 FROM public.traces t WHERE t.object_id = v_id AND t.object_table = 'meetings' AND t.user_id = v_uid AND t.created_at = now()) THEN
        RETURN NULL;
      END IF;
      v_before := coalesce(v_before, v_now) - 'participants';
      SELECT * INTO a FROM public.traces_author();
      INSERT INTO public.traces (company_id, user_id, actor_id, actor_role, origin, action, object_table, object_id, work_date, before, after)
      VALUES (m.company_id, v_uid, a.actor_id, a.actor_role, a.origin, 'retiree', 'meetings', v_id, (v_before ->> 'meeting_date')::date, v_before, NULL);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'traces (%, réunion, salariés) : % [%] — action faite, trace non écrite', TG_TABLE_NAME, SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END $fn$;

-- ── 7) Droits des fonctions : personne ne les appelle à la main ─────────────
-- Un déclencheur s'exécute sans droit EXECUTE (comme l'étape 27d).
REVOKE ALL ON FUNCTION public.traces_origin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.traces_author() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.traces_classify(text, text, jsonb, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.traces_capture() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.traces_meeting() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.traces_meeting_people() FROM PUBLIC, anon, authenticated;

-- ── 8) Les déclencheurs (neufs) ─────────────────────────────────────────────
-- Posés seulement s'ils n'existent pas encore (rejouable sans rien retirer), et
-- seulement si la table existe (tâches et réunions : lot 4). Les deux derniers
-- sont des déclencheurs de CONTRAINTE, différés à la fin de la transaction.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('traces_planning_supprimee', 'public.planning',        'TRIGGER', 'AFTER DELETE', 'REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT', 'traces_capture'),
    ('traces_planning_changee',   'public.planning',        'TRIGGER', 'AFTER UPDATE', 'REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT', 'traces_capture'),
    ('traces_planning_remise',    'public.planning',        'TRIGGER', 'AFTER INSERT', 'REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT', 'traces_capture'),
    ('traces_heures_supprimee',   'public.time_entries',    'TRIGGER', 'AFTER DELETE', 'REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT', 'traces_capture'),
    ('traces_heures_changee',     'public.time_entries',    'TRIGGER', 'AFTER UPDATE', 'REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT', 'traces_capture'),
    ('traces_heures_remise',      'public.time_entries',    'TRIGGER', 'AFTER INSERT', 'REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT', 'traces_capture'),
    ('traces_pointage_supprime',  'public.active_sessions', 'TRIGGER', 'AFTER DELETE', 'REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT', 'traces_capture'),
    ('traces_pointage_remis',     'public.active_sessions', 'TRIGGER', 'AFTER INSERT', 'REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT', 'traces_capture'),
    ('traces_tache_supprimee',    'public.day_tasks',       'TRIGGER', 'AFTER DELETE', 'REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT', 'traces_capture'),
    ('traces_reunion_supprimee',  'public.meetings',        'TRIGGER', 'BEFORE DELETE', 'FOR EACH ROW', 'traces_meeting'),
    ('traces_reunion_changee',    'public.meetings',        'TRIGGER', 'AFTER UPDATE', 'FOR EACH ROW', 'traces_meeting'),
    ('traces_reunion_personnes',  'public.meetings',        'CONSTRAINT TRIGGER', 'AFTER UPDATE', 'DEFERRABLE INITIALLY DEFERRED FOR EACH ROW', 'traces_meeting_people'),
    ('traces_reunion_participant_retire', 'public.meeting_participants', 'CONSTRAINT TRIGGER', 'AFTER DELETE', 'DEFERRABLE INITIALLY DEFERRED FOR EACH ROW', 'traces_meeting_people')
  ) AS v(name, tbl, kind, ev, how, fn) LOOP
    IF to_regclass(r.tbl) IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgname = r.name AND t.tgrelid = to_regclass(r.tbl)) THEN
      EXECUTE format('CREATE %s %I %s ON %s %s EXECUTE FUNCTION public.%I()', r.kind, r.name, r.ev, r.tbl, r.how, r.fn);
    END IF;
  END LOOP;
END $$;
