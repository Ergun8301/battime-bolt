-- Test du lot « Zones d'indemnités BTP » — base VIDE uniquement, jamais en production :
--   npm run test:zones-btp-rls
--
-- Recrée le strict nécessaire de Supabase (rôles, auth.uid(), users, companies, worksites, is_admin,
-- get_my_company_id), applique la migration DEUX fois (rejouable), puis vérifie : le bureau lit et écrit SON
-- réglage et les positions de SES chantiers ; le salarié ne lit rien ; une autre entreprise ne voit ni n'écrit
-- rien ; on ne place pas le chantier d'une autre entreprise ; réglage éteint par défaut.
\set ON_ERROR_STOP on

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE
  AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(auth.jwt() ->> 'sub', '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO anon, authenticated;

CREATE TABLE public.companies (id uuid PRIMARY KEY, name text);
CREATE TABLE public.users (id uuid PRIMARY KEY, company_id uuid REFERENCES public.companies(id),
  first_name text, last_name text, role text NOT NULL, is_active boolean DEFAULT true);
CREATE TABLE public.worksites (id uuid PRIMARY KEY, company_id uuid REFERENCES public.companies(id), client_name text);
CREATE FUNCTION public.get_my_company_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT company_id FROM public.users WHERE id = auth.uid() AND is_active IS DISTINCT FROM false $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin' AND is_active IS DISTINCT FROM false) $$;
GRANT EXECUTE ON FUNCTION public.get_my_company_id(), public.is_admin() TO authenticated;
GRANT SELECT ON public.worksites TO authenticated;

BEGIN;
\i supabase/migrations/20261022090000_zones_btp.sql
COMMIT;
BEGIN;
\i supabase/migrations/20261022090000_zones_btp.sql
COMMIT;

INSERT INTO public.companies VALUES ('aaaaaaaa-0000-0000-0000-000000000000', 'A'), ('bbbbbbbb-0000-0000-0000-000000000000', 'B');
INSERT INTO public.users VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000000', 'Paul', 'Patron', 'admin', true),
  ('a0000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000000', 'Karim', 'B', 'worker', true),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000000', 'Bea', 'B', 'admin', true);
INSERT INTO public.worksites VALUES
  ('a1111111-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'Chantier A'),
  ('b1111111-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000', 'Chantier B');

CREATE FUNCTION pg_temp.expect(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT ok THEN RAISE EXCEPTION 'ÉCHEC : %', label; END IF; RAISE NOTICE 'ok — %', label; END $$;
CREATE FUNCTION pg_temp.as_user(uid text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false) $$;
GRANT EXECUTE ON FUNCTION pg_temp.expect(boolean, text), pg_temp.as_user(text) TO authenticated;
CREATE FUNCTION pg_temp.expect_denied(sql text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE sql;
  RAISE EXCEPTION 'ÉCHEC : %', label;
EXCEPTION WHEN insufficient_privilege OR check_violation THEN RAISE NOTICE 'ok — %', label;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.expect_denied(text, text) TO authenticated;

SET ROLE authenticated;

-- ═══ Le bureau de A ═══════════════════════════════════════════════════════
SELECT pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
SELECT pg_temp.expect((SELECT count(*) FROM public.btp_settings) = 0, 'aucune ligne au départ : réglage éteint pour tout le monde');
INSERT INTO public.btp_settings (company_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000000');
SELECT pg_temp.expect((SELECT NOT enabled AND limits_km = '{5,10,20,30,40,50}' AND amounts = '{}'::jsonb FROM public.btp_settings),
  'ligne neuve : éteint, zones 1A 0-5 … 5 40-50, montants vides');
UPDATE public.btp_settings SET enabled = true, amounts = '{"panier": 11.5}' WHERE company_id = 'aaaaaaaa-0000-0000-0000-000000000000';
SELECT pg_temp.expect((SELECT enabled FROM public.btp_settings), 'le bureau allume son réglage');
INSERT INTO public.worksite_geo (worksite_id, company_id, geocoded_for, latitude, longitude)
  VALUES ('a1111111-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', '1 rue a 69000 lyon', 45.76, 4.83);
SELECT pg_temp.expect((SELECT count(*) FROM public.worksite_geo) = 1, 'le bureau place son chantier');
SELECT pg_temp.expect_denied($$INSERT INTO public.worksite_geo (worksite_id, company_id, geocoded_for)
  VALUES ('b1111111-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'x')$$,
  'on ne place pas le chantier d''une autre entreprise sous son nom');
SELECT pg_temp.expect_denied($$INSERT INTO public.btp_settings (company_id) VALUES ('bbbbbbbb-0000-0000-0000-000000000000')$$,
  'le bureau de A n''écrit pas le réglage de B');
SELECT pg_temp.expect_denied($$UPDATE public.btp_settings SET limits_km = '{5,10}'$$, 'six limites exigées');

-- ═══ Le salarié de A ══════════════════════════════════════════════════════
SELECT pg_temp.as_user('a0000000-0000-0000-0000-00000000000c');
SELECT pg_temp.expect((SELECT count(*) FROM public.btp_settings) = 0, 'le salarié ne lit pas le réglage');
SELECT pg_temp.expect((SELECT count(*) FROM public.worksite_geo) = 0, 'le salarié ne lit pas les positions');
SELECT pg_temp.expect_denied($$INSERT INTO public.worksite_geo (worksite_id, company_id, geocoded_for)
  VALUES ('a1111111-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'x')$$, 'le salarié n''écrit rien');
UPDATE public.btp_settings SET enabled = false;
SELECT pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
SELECT pg_temp.expect((SELECT enabled FROM public.btp_settings), 'la mise à jour du salarié n''a rien touché');

-- ═══ Le bureau de B ═══════════════════════════════════════════════════════
SELECT pg_temp.as_user('b0000000-0000-0000-0000-00000000000b');
SELECT pg_temp.expect((SELECT count(*) FROM public.btp_settings) = 0, 'B ne voit pas le réglage de A');
SELECT pg_temp.expect((SELECT count(*) FROM public.worksite_geo) = 0, 'B ne voit pas les positions de A');
DELETE FROM public.worksite_geo;
SELECT pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
SELECT pg_temp.expect((SELECT count(*) FROM public.worksite_geo) = 1, 'B n''a rien supprimé chez A');

-- ═══ anon ═════════════════════════════════════════════════════════════════
RESET ROLE;
SET ROLE anon;
SELECT pg_temp.expect_denied('SELECT 1 FROM public.btp_settings', 'anon : aucun accès');
RESET ROLE;

-- ═══ Retour arrière ═══════════════════════════════════════════════════════
DROP TABLE IF EXISTS public.worksite_geo;
DROP TABLE IF EXISTS public.btp_settings;
SELECT pg_temp.expect(to_regclass('public.btp_settings') IS NULL AND to_regclass('public.worksite_geo') IS NULL, 'retour arrière : les deux tables partent, rien d''autre');
SELECT pg_temp.expect((SELECT count(*) FROM public.worksites) = 2, 'retour arrière : les chantiers sont intacts');
