-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 29 (oct. 2026) — SITE RAPIDE 2 : RÈGLES D'ACCÈS OPTIMISÉES + 4 INDEX
-- ═════════════════════════════════════════════════════════════════════════════
-- CE QUE FAIT CE FICHIER : (1) entoure auth.uid(), get_my_company_id() et is_admin()
-- de (SELECT …) dans 33 règles d'accès (ALTER POLICY) : la base évalue alors
-- l'appel UNE fois par requête au lieu d'une fois par ligne (alerte « auth_rls_initplan »
-- de l'outil d'analyse de Supabase). Transformation purement SYNTAXIQUE : aucun droit
-- ne change (même commande, mêmes rôles, mêmes conditions). is_my_team_member(user_id,
-- work_date) n'est JAMAIS entouré (il dépend de la ligne). (2) ajoute 4 index.
-- Rien n'est supprimé. Les règles hors de cette liste (dont support_read) ne bougent pas.
--
-- AVANT D'APPLIQUER : à un moment calme (pas pendant la fermeture nocturne des pointages
-- oubliés, ni en pleine saisie) : ALTER POLICY verrouille chaque table le temps de la
-- transaction (lock_timeout 5 s : si une table est occupée, tout est annulé, on réessaie).
-- Le bloc ci-dessous est UN SEUL DO : tout passe ou rien ne passe. Il commence par
-- COMPARER chaque règle à la définition de production relevée le 13/10/2026 ; au moindre
-- écart (règle changée depuis, absente, rôle différent) il s'arrête avec le nom de la règle.
-- Il est rejouable (2e passage : rien ne change, rien n'échoue).
-- Relever AVANT (lecture seule) et garder la valeur pour la comparaison d'après :
--   SELECT count(*) FROM pg_policies WHERE schemaname = 'public';
--
-- RETOUR ARRIÈRE (à coller tel quel si besoin ; définitions de PRODUCTION d'avant, en clair).
-- Sans « TO » : les rôles ne changent pas. Les index ne gênent rien : les retirer est facultatif.
--   ALTER POLICY active_sessions_delete ON public.active_sessions
--     USING ((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid())));
--   ALTER POLICY active_sessions_insert_own ON public.active_sessions
--     WITH CHECK ((user_id = auth.uid()) AND (company_id = get_my_company_id()));
--   ALTER POLICY active_sessions_select ON public.active_sessions
--     USING ((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid())));
--   ALTER POLICY assistant_journal_read ON public.assistant_journal
--     USING ((company_id = get_my_company_id()) AND (is_admin() OR (actor_id = auth.uid())));
--   ALTER POLICY day_tasks_admin_insert ON public.day_tasks
--     WITH CHECK ((company_id = get_my_company_id()) AND is_admin() AND (created_by = auth.uid()) AND (EXISTS ( SELECT 1 FROM users u WHERE ((u.id = day_tasks.user_id) AND (u.company_id = day_tasks.company_id) AND (u.is_active IS DISTINCT FROM false) AND ((u.role)::text = ANY (ARRAY['worker'::text, 'lead'::text]))))));
--   ALTER POLICY day_tasks_select ON public.day_tasks
--     USING ((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid())));
--   ALTER POLICY documents_delete ON public.documents
--     USING ((company_id = get_my_company_id()) AND (is_admin() OR (uploaded_by = auth.uid())));
--   ALTER POLICY documents_insert ON public.documents
--     WITH CHECK ((company_id = get_my_company_id()) AND (uploaded_by = auth.uid()));
--   ALTER POLICY leave_requests_delete ON public.leave_requests
--     USING ((company_id = get_my_company_id()) AND (is_admin() OR ((user_id = auth.uid()) AND (status = 'pending'::text))));
--   ALTER POLICY leave_requests_select ON public.leave_requests
--     USING ((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid())));
--   ALTER POLICY meeting_participants_select ON public.meeting_participants
--     USING ((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid())));
--   ALTER POLICY meetings_select ON public.meetings
--     USING ((company_id = get_my_company_id()) AND (is_admin() OR all_team OR (EXISTS ( SELECT 1 FROM meeting_participants mp WHERE ((mp.meeting_id = meetings.id) AND (mp.user_id = auth.uid()))))));
--   ALTER POLICY month_closures_admin_write ON public.month_closures
--     USING ((company_id = get_my_company_id()) AND is_admin())
--     WITH CHECK ((company_id = get_my_company_id()) AND is_admin() AND ((closed_by IS NULL) OR (closed_by = auth.uid())));
--   ALTER POLICY planning_worker_select_own ON public.planning
--     USING ((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid()) OR is_my_team_member(user_id, work_date)));
--   ALTER POLICY push_subscriptions_own_delete ON public.push_subscriptions
--     USING (user_id = auth.uid());
--   ALTER POLICY push_subscriptions_own_select ON public.push_subscriptions
--     USING (user_id = auth.uid());
--   ALTER POLICY task_templates_admin_insert ON public.task_templates
--     WITH CHECK ((company_id = get_my_company_id()) AND is_admin() AND (created_by = auth.uid()));
--   ALTER POLICY time_entries_select_company_admin_or_own_worker ON public.time_entries
--     USING ((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid()) OR is_my_team_member(user_id, work_date)));
--   ALTER POLICY time_entries_worker_delete_own_draft ON public.time_entries
--     USING ((user_id = auth.uid()) AND (company_id = get_my_company_id()) AND (status = 'draft'::text) AND (locked = false));
--   ALTER POLICY time_entries_worker_insert ON public.time_entries
--     WITH CHECK ((user_id = auth.uid()) AND (company_id = get_my_company_id()) AND (status = 'draft'::text));
--   ALTER POLICY time_entries_worker_update ON public.time_entries
--     USING ((user_id = auth.uid()) AND (company_id = get_my_company_id()) AND (status = ANY (ARRAY['draft'::text, 'submitted'::text])) AND (locked = false))
--     WITH CHECK ((user_id = auth.uid()) AND (company_id = get_my_company_id()) AND (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'cancelled'::text])) AND (locked = false));
--   ALTER POLICY time_entry_corrections_insert ON public.time_entry_corrections
--     WITH CHECK ((company_id = get_my_company_id()) AND (corrected_by = auth.uid()) AND (is_admin() OR is_my_team_member(worker_id, work_date)));
--   ALTER POLICY time_entry_corrections_select ON public.time_entry_corrections
--     USING ((company_id = get_my_company_id()) AND (is_admin() OR (worker_id = auth.uid()) OR (corrected_by = auth.uid())));
--   ALTER POLICY time_entry_corrections_update_notify ON public.time_entry_corrections
--     USING ((company_id = get_my_company_id()) AND (corrected_by = auth.uid()) AND (notified_at IS NULL))
--     WITH CHECK ((company_id = get_my_company_id()) AND (corrected_by = auth.uid()));
--   ALTER POLICY time_entry_edits_select ON public.time_entry_edits
--     USING ((company_id = get_my_company_id()) AND (is_admin() OR (worker_id = auth.uid())));
--   ALTER POLICY time_entry_positions_select ON public.time_entry_positions
--     USING ((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid())));
--   ALTER POLICY traces_select_own ON public.traces
--     USING ((company_id = get_my_company_id()) AND (object_table = ANY (ARRAY['planning'::text, 'time_entries'::text, 'active_sessions'::text, 'day_tasks'::text, 'meetings'::text])) AND ((user_id = auth.uid()) OR ((user_id IS NULL) AND (object_table = 'meetings'::text) AND ((before IS NULL) OR ((before ->> 'all_team'::text) = 'true'::text)) AND ((after IS NULL) OR ((after ->> 'all_team'::text) = 'true'::text)))));
--   ALTER POLICY training_video_views_select ON public.training_video_views
--     USING ((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid())));
--   ALTER POLICY training_views_select ON public.training_views
--     USING ((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid())));
--   ALTER POLICY user_closures_admin_insert ON public.user_closures
--     WITH CHECK ((company_id = get_my_company_id()) AND is_admin() AND ((closed_by IS NULL) OR (closed_by = auth.uid())) AND (EXISTS ( SELECT 1 FROM users u WHERE ((u.id = user_closures.user_id) AND (u.company_id = user_closures.company_id)))));
--   ALTER POLICY user_closures_admin_update ON public.user_closures
--     USING ((company_id = get_my_company_id()) AND is_admin())
--     WITH CHECK ((company_id = get_my_company_id()) AND is_admin() AND (EXISTS ( SELECT 1 FROM users u WHERE ((u.id = user_closures.user_id) AND (u.company_id = user_closures.company_id)))) AND ((closed_by IS NULL) OR (closed_by = auth.uid()) OR (EXISTS ( SELECT 1 FROM users b WHERE ((b.id = user_closures.closed_by) AND (b.company_id = user_closures.company_id))))));
--   ALTER POLICY user_closures_select ON public.user_closures
--     USING ((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid())));
--   ALTER POLICY users_select_company ON public.users
--     USING ((company_id = get_my_company_id()) OR (id = auth.uid()));
--   DROP INDEX IF EXISTS public.planning_company_date_idx;
--   DROP INDEX IF EXISTS public.time_entries_company_date_idx;
--   DROP INDEX IF EXISTS public.worksite_expenses_worksite_idx;
--   DROP INDEX IF EXISTS public.active_sessions_planning_idx;
--
-- VÉRIFICATION APRÈS APPLICATION — LECTURE SEULE, une ligne, 9 × true :
--   WITH p AS (
--     SELECT tablename AS t, policyname AS n, cmd, roles::text AS r, permissive,
--            coalesce(qual, '') AS q, coalesce(with_check, '') AS w
--       FROM pg_policies
--      WHERE schemaname = 'public'
--        AND (tablename, policyname) IN (VALUES ('active_sessions','active_sessions_delete'),('active_sessions','active_sessions_insert_own'),('active_sessions','active_sessions_select'),('assistant_journal','assistant_journal_read'),('day_tasks','day_tasks_admin_insert'),('day_tasks','day_tasks_select'),('documents','documents_delete'),('documents','documents_insert'),('leave_requests','leave_requests_delete'),('leave_requests','leave_requests_select'),('meeting_participants','meeting_participants_select'),('meetings','meetings_select'),('month_closures','month_closures_admin_write'),('planning','planning_worker_select_own'),('push_subscriptions','push_subscriptions_own_delete'),('push_subscriptions','push_subscriptions_own_select'),('task_templates','task_templates_admin_insert'),('time_entries','time_entries_select_company_admin_or_own_worker'),('time_entries','time_entries_worker_delete_own_draft'),('time_entries','time_entries_worker_insert'),('time_entries','time_entries_worker_update'),('time_entry_corrections','time_entry_corrections_insert'),('time_entry_corrections','time_entry_corrections_select'),('time_entry_corrections','time_entry_corrections_update_notify'),('time_entry_edits','time_entry_edits_select'),('time_entry_positions','time_entry_positions_select'),('traces','traces_select_own'),('training_video_views','training_video_views_select'),('training_views','training_views_select'),('user_closures','user_closures_admin_insert'),('user_closures','user_closures_admin_update'),('user_closures','user_closures_select'),('users','users_select_company'))
--   ), k AS (
--     SELECT '\( SELECT (auth\.uid\(\)|get_my_company_id\(\)|is_admin\(\)) AS [a-z_]+\)'::text AS wrap,
--            '(auth\.uid|get_my_company_id|is_admin)\(\)'::text AS nue
--   )
--   SELECT
--     (SELECT count(*) FROM p) = 33                                                   AS v1_33_regles_presentes,
--     (SELECT bool_and(permissive = 'PERMISSIVE') FROM p)                             AS v2_toutes_permissives,
--     (SELECT count(*) FILTER (WHERE r = '{public}') = 4 AND count(*) FILTER (WHERE r = '{authenticated}') = 29 FROM p) AS v3_roles_inchanges,
--     (SELECT bool_and(regexp_replace(q || ' ' || w, k.wrap, '', 'g') !~ k.nue) FROM p, k) AS v4_aucun_appel_nu,
--     (SELECT sum((SELECT count(*) FROM regexp_matches(q || ' ' || w, k.wrap, 'g'))) FROM p, k) = 96 AS v5_96_appels_entoures,
--     (SELECT count(*) FROM p WHERE q || w ~ 'is_my_team_member') = 3
--       AND NOT EXISTS (SELECT 1 FROM p WHERE q || w ~ '\( SELECT (public\.)?is_my_team_member') AS v6_is_my_team_member_nu,
--     (SELECT md5(string_agg(t || '|' || n || '|' || cmd || '|' || r || '|'
--             || btrim(regexp_replace(regexp_replace(q, k.wrap, '\1', 'g'), '\s+', ' ', 'g')) || '|'
--             || btrim(regexp_replace(regexp_replace(w, k.wrap, '\1', 'g'), '\s+', ' ', 'g')), E'\n' ORDER BY t, n))
--        FROM p, k) = '2546598ba648691bc0355de152c2d0b5'                                                        AS v7_texte_identique_a_l_export,
--     (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('planning_company_date_idx', 'time_entries_company_date_idx', 'worksite_expenses_worksite_idx', 'active_sessions_planning_idx')) = 4 AS v8_4_index,
--     (SELECT bool_and(i.indisvalid AND i.indisready) FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
--       WHERE c.relname IN ('planning_company_date_idx', 'time_entries_company_date_idx', 'worksite_expenses_worksite_idx', 'active_sessions_planning_idx'))              AS v9_index_valides;
--   Puis : SELECT count(*) FROM pg_policies WHERE schemaname = 'public';  -- = la valeur relevée avant
--
-- HISTORIQUE : si le fichier est collé dans l'éditeur SQL, inscrire ensuite :
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261013120000', 'lot29_regles_acces_index') ON CONFLICT DO NOTHING;
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI : sur le serveur, une fonction STABLE appelée « nue » dans une règle est
-- recalculée pour chaque ligne lue ; entourée de (SELECT …), elle l'est une fois.
-- Peu visible avec 13 lignes, indispensable avant de vrais clients. Les index couvrent
-- les filtres les plus fréquents (entreprise + date) et deux clés étrangères.
-- ─────────────────────────────────────────────────────────────────────────────

DO $mig$
DECLARE
  v_exp   jsonb := $j$[
    {"t":"active_sessions","p":"active_sessions_delete","c":"d","r":"authenticated","q":"((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid())))","w":null},
    {"t":"active_sessions","p":"active_sessions_insert_own","c":"a","r":"authenticated","q":null,"w":"((user_id = auth.uid()) AND (company_id = get_my_company_id()))"},
    {"t":"active_sessions","p":"active_sessions_select","c":"r","r":"authenticated","q":"((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid())))","w":null},
    {"t":"assistant_journal","p":"assistant_journal_read","c":"r","r":"authenticated","q":"((company_id = get_my_company_id()) AND (is_admin() OR (actor_id = auth.uid())))","w":null},
    {"t":"day_tasks","p":"day_tasks_admin_insert","c":"a","r":"authenticated","q":null,"w":"((company_id = get_my_company_id()) AND is_admin() AND (created_by = auth.uid()) AND (EXISTS ( SELECT 1 FROM users u WHERE ((u.id = day_tasks.user_id) AND (u.company_id = day_tasks.company_id) AND (u.is_active IS DISTINCT FROM false) AND ((u.role)::text = ANY (ARRAY['worker'::text, 'lead'::text]))))))"},
    {"t":"day_tasks","p":"day_tasks_select","c":"r","r":"authenticated","q":"((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid())))","w":null},
    {"t":"documents","p":"documents_delete","c":"d","r":"authenticated","q":"((company_id = get_my_company_id()) AND (is_admin() OR (uploaded_by = auth.uid())))","w":null},
    {"t":"documents","p":"documents_insert","c":"a","r":"authenticated","q":null,"w":"((company_id = get_my_company_id()) AND (uploaded_by = auth.uid()))"},
    {"t":"leave_requests","p":"leave_requests_delete","c":"d","r":"authenticated","q":"((company_id = get_my_company_id()) AND (is_admin() OR ((user_id = auth.uid()) AND (status = 'pending'::text))))","w":null},
    {"t":"leave_requests","p":"leave_requests_select","c":"r","r":"authenticated","q":"((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid())))","w":null},
    {"t":"meeting_participants","p":"meeting_participants_select","c":"r","r":"authenticated","q":"((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid())))","w":null},
    {"t":"meetings","p":"meetings_select","c":"r","r":"authenticated","q":"((company_id = get_my_company_id()) AND (is_admin() OR all_team OR (EXISTS ( SELECT 1 FROM meeting_participants mp WHERE ((mp.meeting_id = meetings.id) AND (mp.user_id = auth.uid()))))))","w":null},
    {"t":"month_closures","p":"month_closures_admin_write","c":"*","r":"authenticated","q":"((company_id = get_my_company_id()) AND is_admin())","w":"((company_id = get_my_company_id()) AND is_admin() AND ((closed_by IS NULL) OR (closed_by = auth.uid())))"},
    {"t":"planning","p":"planning_worker_select_own","c":"r","r":"authenticated","q":"((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid()) OR is_my_team_member(user_id, work_date)))","w":null},
    {"t":"push_subscriptions","p":"push_subscriptions_own_delete","c":"d","r":"authenticated","q":"(user_id = auth.uid())","w":null},
    {"t":"push_subscriptions","p":"push_subscriptions_own_select","c":"r","r":"authenticated","q":"(user_id = auth.uid())","w":null},
    {"t":"task_templates","p":"task_templates_admin_insert","c":"a","r":"authenticated","q":null,"w":"((company_id = get_my_company_id()) AND is_admin() AND (created_by = auth.uid()))"},
    {"t":"time_entries","p":"time_entries_select_company_admin_or_own_worker","c":"r","r":"authenticated","q":"((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid()) OR is_my_team_member(user_id, work_date)))","w":null},
    {"t":"time_entries","p":"time_entries_worker_delete_own_draft","c":"d","r":"authenticated","q":"((user_id = auth.uid()) AND (company_id = get_my_company_id()) AND (status = 'draft'::text) AND (locked = false))","w":null},
    {"t":"time_entries","p":"time_entries_worker_insert","c":"a","r":"authenticated","q":null,"w":"((user_id = auth.uid()) AND (company_id = get_my_company_id()) AND (status = 'draft'::text))"},
    {"t":"time_entries","p":"time_entries_worker_update","c":"w","r":"authenticated","q":"((user_id = auth.uid()) AND (company_id = get_my_company_id()) AND (status = ANY (ARRAY['draft'::text, 'submitted'::text])) AND (locked = false))","w":"((user_id = auth.uid()) AND (company_id = get_my_company_id()) AND (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'cancelled'::text])) AND (locked = false))"},
    {"t":"time_entry_corrections","p":"time_entry_corrections_insert","c":"a","r":"public","q":null,"w":"((company_id = get_my_company_id()) AND (corrected_by = auth.uid()) AND (is_admin() OR is_my_team_member(worker_id, work_date)))"},
    {"t":"time_entry_corrections","p":"time_entry_corrections_select","c":"r","r":"public","q":"((company_id = get_my_company_id()) AND (is_admin() OR (worker_id = auth.uid()) OR (corrected_by = auth.uid())))","w":null},
    {"t":"time_entry_corrections","p":"time_entry_corrections_update_notify","c":"w","r":"public","q":"((company_id = get_my_company_id()) AND (corrected_by = auth.uid()) AND (notified_at IS NULL))","w":"((company_id = get_my_company_id()) AND (corrected_by = auth.uid()))"},
    {"t":"time_entry_edits","p":"time_entry_edits_select","c":"r","r":"authenticated","q":"((company_id = get_my_company_id()) AND (is_admin() OR (worker_id = auth.uid())))","w":null},
    {"t":"time_entry_positions","p":"time_entry_positions_select","c":"r","r":"public","q":"((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid())))","w":null},
    {"t":"traces","p":"traces_select_own","c":"r","r":"authenticated","q":"((company_id = get_my_company_id()) AND (object_table = ANY (ARRAY['planning'::text, 'time_entries'::text, 'active_sessions'::text, 'day_tasks'::text, 'meetings'::text])) AND ((user_id = auth.uid()) OR ((user_id IS NULL) AND (object_table = 'meetings'::text) AND ((before IS NULL) OR ((before ->> 'all_team'::text) = 'true'::text)) AND ((after IS NULL) OR ((after ->> 'all_team'::text) = 'true'::text)))))","w":null},
    {"t":"training_video_views","p":"training_video_views_select","c":"r","r":"authenticated","q":"((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid())))","w":null},
    {"t":"training_views","p":"training_views_select","c":"r","r":"authenticated","q":"((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid())))","w":null},
    {"t":"user_closures","p":"user_closures_admin_insert","c":"a","r":"authenticated","q":null,"w":"((company_id = get_my_company_id()) AND is_admin() AND ((closed_by IS NULL) OR (closed_by = auth.uid())) AND (EXISTS ( SELECT 1 FROM users u WHERE ((u.id = user_closures.user_id) AND (u.company_id = user_closures.company_id)))))"},
    {"t":"user_closures","p":"user_closures_admin_update","c":"w","r":"authenticated","q":"((company_id = get_my_company_id()) AND is_admin())","w":"((company_id = get_my_company_id()) AND is_admin() AND (EXISTS ( SELECT 1 FROM users u WHERE ((u.id = user_closures.user_id) AND (u.company_id = user_closures.company_id)))) AND ((closed_by IS NULL) OR (closed_by = auth.uid()) OR (EXISTS ( SELECT 1 FROM users b WHERE ((b.id = user_closures.closed_by) AND (b.company_id = user_closures.company_id))))))"},
    {"t":"user_closures","p":"user_closures_select","c":"r","r":"authenticated","q":"((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid())))","w":null},
    {"t":"users","p":"users_select_company","c":"r","r":"authenticated","q":"((company_id = get_my_company_id()) OR (id = auth.uid()))","w":null}
  ]$j$;
  v_wrap  constant text := '\( SELECT (auth\.uid\(\)|get_my_company_id\(\)|is_admin\(\)) AS [a-z_]+\)';
  v_nue   constant text := '(auth\.uid|get_my_company_id|is_admin)\(\)';
  e       jsonb;
  c       record;
  v_n     int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM set_config('search_path', 'pg_catalog, public', true);
  -- 1) GARDE-FOU AVANT

  FOR e IN SELECT * FROM jsonb_array_elements(v_exp) LOOP
    SELECT p.polcmd::text AS cmd, pp.roles::text AS roles, pp.qual, pp.with_check INTO c
      FROM pg_policy p JOIN pg_class k ON k.oid = p.polrelid JOIN pg_namespace n ON n.oid = k.relnamespace
      JOIN pg_policies pp ON pp.schemaname = n.nspname AND pp.tablename = k.relname AND pp.policyname = p.polname
     WHERE n.nspname = 'public' AND k.relname = e->>'t' AND p.polname = e->>'p' AND p.polpermissive;
    IF NOT FOUND THEN RAISE EXCEPTION 'lot29 (avant) : règle % introuvable sur %', e->>'p', e->>'t'; END IF;
    IF c.cmd <> e->>'c' OR c.roles <> '{' || (e->>'r') || '}'
       OR regexp_replace(regexp_replace(c.qual, v_wrap, '\1', 'g'), '\s+', ' ', 'g')
          IS DISTINCT FROM regexp_replace(e->>'q', '\s+', ' ', 'g')
       OR regexp_replace(regexp_replace(c.with_check, v_wrap, '\1', 'g'), '\s+', ' ', 'g')
          IS DISTINCT FROM regexp_replace(e->>'w', '\s+', ' ', 'g') THEN
      RAISE EXCEPTION 'lot29 (avant) : la règle % de % n''a pas la définition attendue (commande, rôles ou texte)', e->>'p', e->>'t';
    END IF;
  END LOOP;

  -- 2) LES RÈGLES
  ALTER POLICY active_sessions_delete ON public.active_sessions
    USING ((company_id = (SELECT get_my_company_id())) AND ((SELECT is_admin()) OR (user_id = (SELECT auth.uid()))));
  ALTER POLICY active_sessions_insert_own ON public.active_sessions
    WITH CHECK ((user_id = (SELECT auth.uid())) AND (company_id = (SELECT get_my_company_id())));
  ALTER POLICY active_sessions_select ON public.active_sessions
    USING ((company_id = (SELECT get_my_company_id())) AND ((SELECT is_admin()) OR (user_id = (SELECT auth.uid()))));
  ALTER POLICY assistant_journal_read ON public.assistant_journal
    USING ((company_id = (SELECT get_my_company_id())) AND ((SELECT is_admin()) OR (actor_id = (SELECT auth.uid()))));
  ALTER POLICY day_tasks_admin_insert ON public.day_tasks
    WITH CHECK ((company_id = (SELECT get_my_company_id())) AND (SELECT is_admin()) AND (created_by = (SELECT auth.uid())) AND (EXISTS ( SELECT 1 FROM users u WHERE ((u.id = day_tasks.user_id) AND (u.company_id = day_tasks.company_id) AND (u.is_active IS DISTINCT FROM false) AND ((u.role)::text = ANY (ARRAY['worker'::text, 'lead'::text]))))));
  ALTER POLICY day_tasks_select ON public.day_tasks
    USING ((company_id = (SELECT get_my_company_id())) AND ((SELECT is_admin()) OR (user_id = (SELECT auth.uid()))));
  ALTER POLICY documents_delete ON public.documents
    USING ((company_id = (SELECT get_my_company_id())) AND ((SELECT is_admin()) OR (uploaded_by = (SELECT auth.uid()))));
  ALTER POLICY documents_insert ON public.documents
    WITH CHECK ((company_id = (SELECT get_my_company_id())) AND (uploaded_by = (SELECT auth.uid())));
  ALTER POLICY leave_requests_delete ON public.leave_requests
    USING ((company_id = (SELECT get_my_company_id())) AND ((SELECT is_admin()) OR ((user_id = (SELECT auth.uid())) AND (status = 'pending'::text))));
  ALTER POLICY leave_requests_select ON public.leave_requests
    USING ((company_id = (SELECT get_my_company_id())) AND ((SELECT is_admin()) OR (user_id = (SELECT auth.uid()))));
  ALTER POLICY meeting_participants_select ON public.meeting_participants
    USING ((company_id = (SELECT get_my_company_id())) AND ((SELECT is_admin()) OR (user_id = (SELECT auth.uid()))));
  ALTER POLICY meetings_select ON public.meetings
    USING ((company_id = (SELECT get_my_company_id())) AND ((SELECT is_admin()) OR all_team OR (EXISTS ( SELECT 1 FROM meeting_participants mp WHERE ((mp.meeting_id = meetings.id) AND (mp.user_id = (SELECT auth.uid())))))));
  ALTER POLICY month_closures_admin_write ON public.month_closures
    USING ((company_id = (SELECT get_my_company_id())) AND (SELECT is_admin()))
    WITH CHECK ((company_id = (SELECT get_my_company_id())) AND (SELECT is_admin()) AND ((closed_by IS NULL) OR (closed_by = (SELECT auth.uid()))));
  ALTER POLICY planning_worker_select_own ON public.planning
    USING ((company_id = (SELECT get_my_company_id())) AND ((SELECT is_admin()) OR (user_id = (SELECT auth.uid())) OR is_my_team_member(user_id, work_date)));
  ALTER POLICY push_subscriptions_own_delete ON public.push_subscriptions
    USING (user_id = (SELECT auth.uid()));
  ALTER POLICY push_subscriptions_own_select ON public.push_subscriptions
    USING (user_id = (SELECT auth.uid()));
  ALTER POLICY task_templates_admin_insert ON public.task_templates
    WITH CHECK ((company_id = (SELECT get_my_company_id())) AND (SELECT is_admin()) AND (created_by = (SELECT auth.uid())));
  ALTER POLICY time_entries_select_company_admin_or_own_worker ON public.time_entries
    USING ((company_id = (SELECT get_my_company_id())) AND ((SELECT is_admin()) OR (user_id = (SELECT auth.uid())) OR is_my_team_member(user_id, work_date)));
  ALTER POLICY time_entries_worker_delete_own_draft ON public.time_entries
    USING ((user_id = (SELECT auth.uid())) AND (company_id = (SELECT get_my_company_id())) AND (status = 'draft'::text) AND (locked = false));
  ALTER POLICY time_entries_worker_insert ON public.time_entries
    WITH CHECK ((user_id = (SELECT auth.uid())) AND (company_id = (SELECT get_my_company_id())) AND (status = 'draft'::text));
  ALTER POLICY time_entries_worker_update ON public.time_entries
    USING ((user_id = (SELECT auth.uid())) AND (company_id = (SELECT get_my_company_id())) AND (status = ANY (ARRAY['draft'::text, 'submitted'::text])) AND (locked = false))
    WITH CHECK ((user_id = (SELECT auth.uid())) AND (company_id = (SELECT get_my_company_id())) AND (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'cancelled'::text])) AND (locked = false));
  ALTER POLICY time_entry_corrections_insert ON public.time_entry_corrections
    WITH CHECK ((company_id = (SELECT get_my_company_id())) AND (corrected_by = (SELECT auth.uid())) AND ((SELECT is_admin()) OR is_my_team_member(worker_id, work_date)));
  ALTER POLICY time_entry_corrections_select ON public.time_entry_corrections
    USING ((company_id = (SELECT get_my_company_id())) AND ((SELECT is_admin()) OR (worker_id = (SELECT auth.uid())) OR (corrected_by = (SELECT auth.uid()))));
  ALTER POLICY time_entry_corrections_update_notify ON public.time_entry_corrections
    USING ((company_id = (SELECT get_my_company_id())) AND (corrected_by = (SELECT auth.uid())) AND (notified_at IS NULL))
    WITH CHECK ((company_id = (SELECT get_my_company_id())) AND (corrected_by = (SELECT auth.uid())));
  ALTER POLICY time_entry_edits_select ON public.time_entry_edits
    USING ((company_id = (SELECT get_my_company_id())) AND ((SELECT is_admin()) OR (worker_id = (SELECT auth.uid()))));
  ALTER POLICY time_entry_positions_select ON public.time_entry_positions
    USING ((company_id = (SELECT get_my_company_id())) AND ((SELECT is_admin()) OR (user_id = (SELECT auth.uid()))));
  ALTER POLICY traces_select_own ON public.traces
    USING ((company_id = (SELECT get_my_company_id())) AND (object_table = ANY (ARRAY['planning'::text, 'time_entries'::text, 'active_sessions'::text, 'day_tasks'::text, 'meetings'::text])) AND ((user_id = (SELECT auth.uid())) OR ((user_id IS NULL) AND (object_table = 'meetings'::text) AND ((before IS NULL) OR ((before ->> 'all_team'::text) = 'true'::text)) AND ((after IS NULL) OR ((after ->> 'all_team'::text) = 'true'::text)))));
  ALTER POLICY training_video_views_select ON public.training_video_views
    USING ((company_id = (SELECT get_my_company_id())) AND ((SELECT is_admin()) OR (user_id = (SELECT auth.uid()))));
  ALTER POLICY training_views_select ON public.training_views
    USING ((company_id = (SELECT get_my_company_id())) AND ((SELECT is_admin()) OR (user_id = (SELECT auth.uid()))));
  ALTER POLICY user_closures_admin_insert ON public.user_closures
    WITH CHECK ((company_id = (SELECT get_my_company_id())) AND (SELECT is_admin()) AND ((closed_by IS NULL) OR (closed_by = (SELECT auth.uid()))) AND (EXISTS ( SELECT 1 FROM users u WHERE ((u.id = user_closures.user_id) AND (u.company_id = user_closures.company_id)))));
  ALTER POLICY user_closures_admin_update ON public.user_closures
    USING ((company_id = (SELECT get_my_company_id())) AND (SELECT is_admin()))
    WITH CHECK ((company_id = (SELECT get_my_company_id())) AND (SELECT is_admin()) AND (EXISTS ( SELECT 1 FROM users u WHERE ((u.id = user_closures.user_id) AND (u.company_id = user_closures.company_id)))) AND ((closed_by IS NULL) OR (closed_by = (SELECT auth.uid())) OR (EXISTS ( SELECT 1 FROM users b WHERE ((b.id = user_closures.closed_by) AND (b.company_id = user_closures.company_id))))));
  ALTER POLICY user_closures_select ON public.user_closures
    USING ((company_id = (SELECT get_my_company_id())) AND ((SELECT is_admin()) OR (user_id = (SELECT auth.uid()))));
  ALTER POLICY users_select_company ON public.users
    USING ((company_id = (SELECT get_my_company_id())) OR (id = (SELECT auth.uid())));

  -- 3) LES INDEX
  CREATE INDEX IF NOT EXISTS planning_company_date_idx ON public.planning (company_id, work_date);
  CREATE INDEX IF NOT EXISTS time_entries_company_date_idx ON public.time_entries (company_id, work_date);
  CREATE INDEX IF NOT EXISTS worksite_expenses_worksite_idx ON public.worksite_expenses (worksite_id);
  CREATE INDEX IF NOT EXISTS active_sessions_planning_idx ON public.active_sessions (planning_id);

  -- 4) CONTRÔLE APRÈS (annule tout en cas d'écart)

  FOR e IN SELECT * FROM jsonb_array_elements(v_exp) LOOP
    SELECT p.polcmd::text AS cmd, pp.roles::text AS roles, pp.qual, pp.with_check INTO c
      FROM pg_policy p JOIN pg_class k ON k.oid = p.polrelid JOIN pg_namespace n ON n.oid = k.relnamespace
      JOIN pg_policies pp ON pp.schemaname = n.nspname AND pp.tablename = k.relname AND pp.policyname = p.polname
     WHERE n.nspname = 'public' AND k.relname = e->>'t' AND p.polname = e->>'p' AND p.polpermissive;
    IF NOT FOUND THEN RAISE EXCEPTION 'lot29 (après) : règle % introuvable sur %', e->>'p', e->>'t'; END IF;
    IF c.cmd <> e->>'c' OR c.roles <> '{' || (e->>'r') || '}'
       OR regexp_replace(regexp_replace(c.qual, v_wrap, '\1', 'g'), '\s+', ' ', 'g')
          IS DISTINCT FROM regexp_replace(e->>'q', '\s+', ' ', 'g')
       OR regexp_replace(regexp_replace(c.with_check, v_wrap, '\1', 'g'), '\s+', ' ', 'g')
          IS DISTINCT FROM regexp_replace(e->>'w', '\s+', ' ', 'g') THEN
      RAISE EXCEPTION 'lot29 (après) : la règle % de % n''a pas la définition attendue (commande, rôles ou texte)', e->>'p', e->>'t';
    END IF;
    -- plus aucun appel « nu », et autant d'appels entourés que de nus avant
    IF regexp_replace(coalesce(c.qual, '') || ' ' || coalesce(c.with_check, ''), v_wrap, '', 'g') ~ v_nue THEN
      RAISE EXCEPTION 'lot29 (après) : il reste un appel nu dans %', e->>'p';
    END IF;
    SELECT count(*) INTO v_n FROM regexp_matches(coalesce(c.qual, '') || ' ' || coalesce(c.with_check, ''), v_wrap, 'g');
    IF v_n <> (SELECT count(*) FROM regexp_matches(coalesce(e->>'q', '') || ' ' || coalesce(e->>'w', ''), v_nue, 'g')) THEN
      RAISE EXCEPTION 'lot29 (après) : nombre d''appels entourés inattendu dans % (%)', e->>'p', v_n;
    END IF;
  END LOOP;
END
$mig$;
