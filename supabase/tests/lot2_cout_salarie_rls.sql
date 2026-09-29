-- Test RLS du lot 2 (coût réel) — à lancer sur une base VIDE, jamais en production :
--   npm run test:cout-rls   (Postgres local requis : initdb/pg_ctl/psql)
--
-- Recrée le strict nécessaire de Supabase (rôles, auth.uid(), users, companies,
-- is_admin, get_my_company_id), applique la migration, puis vérifie :
--   admin de A voit/écrit les bulletins de A ; salarié de A ne voit rien, pas
--   même le sien ; admin de B ne voit rien de A ; anon n'a aucun droit.
\set ON_ERROR_STOP on

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TABLE public.companies (id uuid PRIMARY KEY, name text);
CREATE TABLE public.users (
  id uuid PRIMARY KEY, company_id uuid REFERENCES public.companies(id),
  role text NOT NULL, is_active boolean DEFAULT true
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.companies, public.users TO authenticated;
CREATE POLICY users_same_company ON public.users FOR SELECT TO authenticated USING (true);

CREATE FUNCTION public.get_my_company_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT company_id FROM public.users WHERE id = auth.uid() AND is_active IS DISTINCT FROM false $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin' AND is_active IS DISTINCT FROM false) $$;
GRANT EXECUTE ON FUNCTION public.get_my_company_id(), public.is_admin() TO authenticated;

\i supabase/migrations/20260929140000_lot2_cout_salarie.sql

-- Données : entreprise A (admin + salarié), entreprise B (admin).
INSERT INTO public.companies VALUES ('aaaaaaaa-0000-0000-0000-000000000000', 'A'), ('bbbbbbbb-0000-0000-0000-000000000000', 'B');
INSERT INTO public.users VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000000', 'admin', true),
  ('a0000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000000', 'worker', true),
  ('b0000000-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-000000000000', 'admin', true);
INSERT INTO public.payslip_figures (company_id, user_id, month, gross, employer_total, paid_hours)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000c', '2026-07-01', 2400, 3450, 151.67);

CREATE FUNCTION pg_temp.expect(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT ok THEN RAISE EXCEPTION 'ÉCHEC : %', label; END IF;
  RAISE NOTICE 'ok — %', label;
END $$;

-- ── Admin de A ─────────────────────────────────────────────────────────────
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', false);
SELECT pg_temp.expect((SELECT count(*) FROM public.payslip_figures) = 1, 'admin A voit le bulletin de son salarié');
INSERT INTO public.payslip_figures (company_id, user_id, month, gross, employer_total, paid_hours)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000c', '2026-08-01', 2450, 3528.40, 151.67);
SELECT pg_temp.expect((SELECT count(*) FROM public.payslip_figures) = 2, 'admin A enregistre un bulletin');
INSERT INTO public.company_cost_settings (company_id, btp_leave_enabled) VALUES ('aaaaaaaa-0000-0000-0000-000000000000', true);
SELECT pg_temp.expect((SELECT btp_leave_rate FROM public.company_cost_settings) = 20.70, 'taux congés BTP par défaut 20,70 %');

DO $$ BEGIN
  INSERT INTO public.payslip_figures (company_id, user_id, month, gross, employer_total, paid_hours)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-00000000000a', '2026-08-01', 2000, 2900, 151);
  RAISE EXCEPTION 'ÉCHEC : admin A a écrit un bulletin pour un salarié de B';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok — admin A ne peut pas viser un salarié de B';
END $$;

DO $$ BEGIN
  INSERT INTO public.payslip_figures (company_id, user_id, month, gross, employer_total, paid_hours)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000c', '2026-09-01', 3000, 2900, 151);
  RAISE EXCEPTION 'ÉCHEC : total employeur < brut accepté';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok — total employeur ≤ brut refusé par la base';
END $$;

-- ── Salarié de A : rien, pas même son propre coût ──────────────────────────
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000c', false);
SELECT pg_temp.expect((SELECT count(*) FROM public.payslip_figures) = 0, 'salarié ne voit aucun bulletin, pas même le sien');
SELECT pg_temp.expect((SELECT count(*) FROM public.company_cost_settings) = 0, 'salarié ne voit pas le réglage congés');
DO $$ BEGIN
  INSERT INTO public.payslip_figures (company_id, user_id, month, gross, employer_total, paid_hours)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000c', '2026-10-01', 2000, 2900, 151);
  RAISE EXCEPTION 'ÉCHEC : un salarié a écrit un bulletin';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok — salarié ne peut rien écrire';
END $$;
UPDATE public.payslip_figures SET gross = 1;
SELECT pg_temp.expect(true, 'UPDATE du salarié sans effet (aucune ligne visible)');

-- ── Admin de B : rien de A ─────────────────────────────────────────────────
SELECT set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-00000000000a', false);
SELECT pg_temp.expect((SELECT count(*) FROM public.payslip_figures) = 0, 'admin B ne voit rien de A');
DELETE FROM public.payslip_figures;
RESET ROLE;
SELECT pg_temp.expect((SELECT count(*) FROM public.payslip_figures) = 2, 'admin B n''a rien effacé de A ; salarié n''a rien modifié');
SELECT pg_temp.expect((SELECT min(gross) FROM public.payslip_figures) = 2400, 'brut intact');

-- ── Anon : aucun droit ─────────────────────────────────────────────────────
SET ROLE anon;
DO $$ BEGIN
  PERFORM count(*) FROM public.payslip_figures;
  RAISE EXCEPTION 'ÉCHEC : anon lit les bulletins';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok — anon refusé';
END $$;
RESET ROLE;

-- ── L'interrupteur est éteint par défaut ───────────────────────────────────
SELECT pg_temp.expect((SELECT count(*) FROM public.companies WHERE ai_enabled) = 0, 'ai_enabled faux par défaut');
