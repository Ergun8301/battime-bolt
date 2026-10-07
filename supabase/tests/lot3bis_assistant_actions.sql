-- Test du lot 3 bis (assistant qui agit) — base VIDE uniquement, jamais en production :
--   npm run test:assistant-actions-rls
--
-- Vérifie que l'assistant n'a AUCUN droit en plus : ses actions passent par les
-- policies d'aujourd'hui (recopiées de la production pour `planning` et
-- `worksites`), donc un patron n'agit que sur SON entreprise ; et que le
-- journal des actions est réservé au patron, lu et écrit pour son entreprise.
\set ON_ERROR_STOP on

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

CREATE TYPE public.battime_role AS ENUM ('admin', 'lead', 'worker');
CREATE TABLE public.companies (id uuid PRIMARY KEY, name text, ai_enabled boolean NOT NULL DEFAULT false);
CREATE TABLE public.users (id uuid PRIMARY KEY, company_id uuid REFERENCES public.companies(id), role public.battime_role NOT NULL, is_active boolean DEFAULT true);
CREATE FUNCTION public.get_my_company_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT company_id FROM public.users WHERE id = auth.uid() AND is_active IS DISTINCT FROM false $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin' AND is_active IS DISTINCT FROM false) $$;
GRANT EXECUTE ON FUNCTION public.get_my_company_id(), public.is_admin() TO authenticated;
GRANT SELECT ON public.users, public.companies TO authenticated;

-- Tables métier + policies EXACTES de la production.
CREATE TABLE public.worksites (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, client_name text, is_active boolean DEFAULT true);
CREATE TABLE public.planning (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, created_by uuid, user_id uuid, worksite_id uuid,
  work_date date, estimated_start time, estimated_end time, notes text, absence_type text);
ALTER TABLE public.worksites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.worksites, public.planning TO authenticated;
CREATE POLICY worksites_admin_write ON public.worksites FOR ALL TO authenticated
  USING ((company_id = (SELECT u.company_id FROM users u WHERE u.id = (SELECT auth.uid()))) AND ((SELECT u.role FROM users u WHERE u.id = (SELECT auth.uid())) = 'admin'))
  WITH CHECK ((company_id = (SELECT u.company_id FROM users u WHERE u.id = (SELECT auth.uid()))) AND ((SELECT u.role FROM users u WHERE u.id = (SELECT auth.uid())) = 'admin'));
CREATE POLICY worksites_select_company ON public.worksites FOR SELECT TO authenticated USING (company_id = get_my_company_id());
CREATE POLICY worksites_worker_insert_own_company ON public.worksites FOR INSERT TO authenticated WITH CHECK (company_id = get_my_company_id());
CREATE POLICY planning_admin_write ON public.planning FOR ALL TO authenticated
  USING ((company_id = (SELECT u.company_id FROM users u WHERE u.id = (SELECT auth.uid()))) AND ((SELECT u.role FROM users u WHERE u.id = (SELECT auth.uid())) = 'admin'))
  WITH CHECK ((company_id = (SELECT u.company_id FROM users u WHERE u.id = (SELECT auth.uid()))) AND ((SELECT u.role FROM users u WHERE u.id = (SELECT auth.uid())) = 'admin'));
CREATE POLICY planning_worker_select_own ON public.planning FOR SELECT TO authenticated
  USING ((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid())));

\i supabase/migrations/20260930120000_lot3bis_assistant_actions.sql

INSERT INTO public.companies VALUES ('aaaaaaaa-0000-0000-0000-000000000000', 'A', true), ('bbbbbbbb-0000-0000-0000-000000000000', 'B', true), ('cccccccc-0000-0000-0000-000000000000', 'C', false);
INSERT INTO public.users VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000000', 'admin', true),
  ('a0000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000000', 'worker', true),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000000', 'admin', true),
  ('c0000000-0000-0000-0000-00000000000c', 'cccccccc-0000-0000-0000-000000000000', 'admin', true);
INSERT INTO public.worksites (id, company_id, client_name) VALUES
  ('aaaaaaaa-1111-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'Villa A'),
  ('bbbbbbbb-1111-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000', 'Villa B');

CREATE FUNCTION pg_temp.expect(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT ok THEN RAISE EXCEPTION 'ÉCHEC : %', label; END IF; RAISE NOTICE 'ok — %', label; END $$;
CREATE FUNCTION pg_temp.expect_denied(sql text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE sql; RAISE EXCEPTION 'ÉCHEC : %', label;
EXCEPTION WHEN insufficient_privilege OR check_violation THEN RAISE NOTICE 'ok — %', label; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.expect(boolean, text), pg_temp.expect_denied(text, text) TO authenticated;

SET ROLE authenticated;
-- ═══ Patron de A : les actions de l'assistant (mêmes écritures que l'écran) ═
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', false);
INSERT INTO public.worksites (company_id, client_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000000', 'Maison Garnier');
SELECT pg_temp.expect(true, 'patron A : crée un client chez lui');
INSERT INTO public.planning (company_id, created_by, user_id, worksite_id, work_date) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000000', auth.uid(), 'a0000000-0000-0000-0000-00000000000c', 'aaaaaaaa-1111-0000-0000-000000000000', '2026-10-05');
SELECT pg_temp.expect(true, 'patron A : affecte son salarié');
INSERT INTO public.planning (company_id, created_by, user_id, work_date, absence_type) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000000', auth.uid(), 'a0000000-0000-0000-0000-00000000000c', '2026-10-06', 'conge');
SELECT pg_temp.expect(true, 'patron A : pose une absence');
SELECT pg_temp.expect_denied($$INSERT INTO public.worksites (company_id, client_name) VALUES ('bbbbbbbb-0000-0000-0000-000000000000', 'Intrus')$$, 'patron A : client chez B refusé');
SELECT pg_temp.expect_denied($$INSERT INTO public.planning (company_id, created_by, user_id, worksite_id, work_date) VALUES ('bbbbbbbb-0000-0000-0000-000000000000', auth.uid(), 'b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-1111-0000-0000-000000000000', '2026-10-05')$$, 'patron A : planning de B refusé');
SELECT public.assistant_log_action('affecter_planning', 'Karim sur Villa A : lun. 5 oct.');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_actions) = 1, 'patron A : action notée et lisible');
SELECT pg_temp.expect((SELECT company_id FROM public.assistant_actions) = 'aaaaaaaa-0000-0000-0000-000000000000' AND (SELECT actor_id FROM public.assistant_actions) = auth.uid(), 'entreprise et auteur lus dans la session');
SELECT pg_temp.expect_denied($$SELECT public.assistant_log_action('supprimer_tout', 'x')$$, 'action hors liste refusée au journal');
SELECT pg_temp.expect_denied($$INSERT INTO public.assistant_actions (company_id, actor_id, action, summary) VALUES ('bbbbbbbb-0000-0000-0000-000000000000', auth.uid(), 'creer_chantier', 'faux')$$, 'écriture directe du journal refusée');
SELECT pg_temp.expect_denied($$DELETE FROM public.assistant_actions$$, 'effacer le journal refusé');

-- ═══ Salarié de A : aucune action de bureau ═════════════════════════════════
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000c', false);
SELECT pg_temp.expect_denied($$INSERT INTO public.planning (company_id, created_by, user_id, worksite_id, work_date) VALUES ('aaaaaaaa-0000-0000-0000-000000000000', auth.uid(), auth.uid(), 'aaaaaaaa-1111-0000-0000-000000000000', '2026-10-07')$$, 'salarié : pas d’écriture au planning');
SELECT pg_temp.expect_denied($$SELECT public.assistant_log_action('creer_chantier', 'x')$$, 'salarié : pas de journal bureau');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_actions) = 0, 'salarié : journal invisible');

-- ═══ Patron de B, patron de C (assistant éteint) ════════════════════════════
SELECT set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-00000000000b', false);
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_actions) = 0, 'patron B : ne voit pas le journal de A');
SELECT pg_temp.expect((SELECT count(*) FROM public.planning) = 0, 'patron B : ne voit pas le planning de A');
SELECT set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-00000000000c', false);
SELECT pg_temp.expect_denied($$SELECT public.assistant_log_action('creer_chantier', 'x')$$, 'entreprise sans ai_enabled : refusé');
RESET ROLE;

SET ROLE anon;
SELECT pg_temp.expect_denied($$SELECT public.assistant_log_action('creer_chantier', 'x')$$, 'anonyme : refusé');
RESET ROLE;
