-- Test du lot 7 (planning des collègues + catégorie des documents) — base VIDE uniquement :
--   npm run test:collegues
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
CREATE TABLE public.users (id uuid PRIMARY KEY, company_id uuid REFERENCES public.companies(id), role public.battime_role NOT NULL, is_active boolean DEFAULT true, first_name text);
CREATE FUNCTION public.get_my_company_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT company_id FROM public.users WHERE id = auth.uid() AND is_active IS DISTINCT FROM false $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin' AND is_active IS DISTINCT FROM false) $$;
GRANT EXECUTE ON FUNCTION public.get_my_company_id(), public.is_admin() TO authenticated;
CREATE TABLE public.worksites (id uuid PRIMARY KEY, company_id uuid, client_name text, city text NOT NULL DEFAULT '');
CREATE TABLE public.planning (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, user_id uuid, worksite_id uuid, work_date date,
  estimated_start time, estimated_end time, notes text, absence_type text);
CREATE TABLE public.documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, worksite_id uuid, label text);
-- La RLS d'aujourd'hui : un salarié ne lit que SON planning.
ALTER TABLE public.planning ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.planning TO authenticated;
CREATE POLICY planning_worker_select_own ON public.planning FOR SELECT TO authenticated
  USING ((company_id = get_my_company_id()) AND (is_admin() OR (user_id = auth.uid())));

\i supabase/migrations/20261001100000_lot7_collegues_documents.sql

INSERT INTO public.companies VALUES ('aaaaaaaa-0000-0000-0000-000000000000', 'A', true), ('bbbbbbbb-0000-0000-0000-000000000000', 'B', true);
INSERT INTO public.users VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000000', 'admin', true, 'Paul'),
  ('a0000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000000', 'worker', true, 'Karim'),
  ('a0000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000000', 'worker', true, 'Pierre'),
  ('a0000000-0000-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000000', 'worker', false, 'Ancien'),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000000', 'worker', true, 'Intrus');
INSERT INTO public.worksites VALUES ('aaaaaaaa-1111-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'Villa Dupont', 'Paris'),
  ('bbbbbbbb-1111-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000', 'Secret B', 'Lyon');
INSERT INTO public.planning (company_id, user_id, worksite_id, work_date, estimated_start, estimated_end, notes, absence_type) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000d', 'aaaaaaaa-1111-0000-0000-000000000000', '2026-10-05', '14:00', '15:00', 'Note privée', NULL),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000c', 'aaaaaaaa-1111-0000-0000-000000000000', '2026-10-05', '08:00', '12:00', NULL, NULL),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', NULL, '2026-10-05', NULL, NULL, NULL, 'maladie'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000e', 'aaaaaaaa-1111-0000-0000-000000000000', '2026-10-05', NULL, NULL, NULL, NULL),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-1111-0000-0000-000000000000', '2026-10-05', NULL, NULL, NULL, NULL);

CREATE FUNCTION pg_temp.expect(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT ok THEN RAISE EXCEPTION 'ÉCHEC : %', label; END IF; RAISE NOTICE 'ok — %', label; END $$;
CREATE FUNCTION pg_temp.expect_denied(sql text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE sql; RAISE EXCEPTION 'ÉCHEC : %', label;
EXCEPTION WHEN insufficient_privilege OR check_violation OR invalid_parameter_value THEN RAISE NOTICE 'ok — %', label; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.expect(boolean, text), pg_temp.expect_denied(text, text) TO authenticated;

SELECT pg_temp.expect((SELECT colleagues_planning_visible FROM public.companies WHERE id = 'aaaaaaaa-0000-0000-0000-000000000000'), 'réglage activé par défaut');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000c', false);
SELECT pg_temp.expect((SELECT count(*) FROM public.planning) = 1, 'salarié : la table planning ne montre toujours QUE sa ligne');
SELECT pg_temp.expect((SELECT count(*) FROM public.colleagues_planning('2026-10-05', '2026-10-05')) = 2, 'salarié : 2 collègues actifs (ni lui, ni l’archivé, ni l’autre entreprise)');
SELECT pg_temp.expect((SELECT prenom || ' ' || chantier || ' ' || ville || ' ' || debut || '-' || fin FROM public.colleagues_planning('2026-10-05', '2026-10-05') WHERE prenom = 'Pierre') = 'Pierre Villa Dupont Paris 14:00:00-15:00:00', 'Pierre : chantier, ville, horaires');
SELECT pg_temp.expect((SELECT absent AND chantier IS NULL AND debut IS NULL FROM public.colleagues_planning('2026-10-05', '2026-10-05') WHERE prenom = 'Paul'), 'absent : sans motif, sans rien d’autre');
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM public.colleagues_planning('2026-10-05', '2026-10-05') WHERE prenom IN ('Intrus', 'Ancien', 'Karim')), 'jamais soi-même, un archivé ou une autre entreprise');
SELECT pg_temp.expect_denied($$SELECT * FROM public.colleagues_planning('2026-10-01', '2026-10-30')$$, 'période > 14 jours refusée');
SELECT pg_temp.expect_denied($$SELECT public.set_colleagues_planning(false)$$, 'salarié : ne change pas le réglage');

SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', false);
SELECT public.set_colleagues_planning(false);
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000c', false);
SELECT pg_temp.expect((SELECT count(*) FROM public.colleagues_planning('2026-10-05', '2026-10-05')) = 0, 'réglage désactivé par le bureau → rien');
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT pg_temp.expect_denied($$SELECT * FROM public.colleagues_planning('2026-10-05', '2026-10-05')$$, 'sans session : refusé');
RESET ROLE;
SELECT pg_temp.expect(has_function_privilege('anon', 'public.colleagues_planning(date,date)', 'execute') = false, 'anonyme : pas d’accès');

INSERT INTO public.documents (company_id, worksite_id, label) VALUES ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000000', 'ancien');
SELECT pg_temp.expect((SELECT category FROM public.documents WHERE label = 'ancien') IS NULL, 'documents existants : catégorie vide');
INSERT INTO public.documents (company_id, worksite_id, label, category) VALUES ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000000', 'fact', 'facture_payee');
SELECT pg_temp.expect(true, 'catégorie « facture payée » acceptée');
SELECT pg_temp.expect_denied($$INSERT INTO public.documents (company_id, worksite_id, label, category) VALUES ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000000', 'x', 'n_importe_quoi')$$, 'catégorie inconnue refusée');
