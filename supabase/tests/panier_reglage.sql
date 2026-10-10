-- Test du lot 3 bis — réglage « Utiliser le panier repas » — base VIDE uniquement :
--   npm run test:panier-rls   (Postgres JETABLE via run-rls.sh, jamais une vraie base)
--
-- `companies` comme en PRODUCTION : RLS avec des policies SELECT seulement (aucune
-- UPDATE), droits de table pour anon / authenticated, les deux gardes
-- d'interrupteurs (kiosk / IA, support). La migration est chargée TELLE QUELLE,
-- trois fois (rejouable).
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
CREATE TABLE public.companies (
  id uuid PRIMARY KEY, name text,
  kiosk_enabled boolean NOT NULL DEFAULT false,
  ai_enabled boolean NOT NULL DEFAULT false,
  support_enabled boolean NOT NULL DEFAULT false,
  travel_paid boolean DEFAULT false
);
CREATE TABLE public.users (id uuid PRIMARY KEY, company_id uuid REFERENCES public.companies(id), role public.battime_role NOT NULL, is_active boolean DEFAULT true, first_name text);
-- Définitions de PRODUCTION (étape 2 et étape 14).
CREATE FUNCTION public.get_my_company_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
  AS $$ SELECT u.company_id FROM public.users u WHERE u.id = auth.uid() AND u.is_active IS DISTINCT FROM false LIMIT 1 $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin' AND is_active IS DISTINCT FROM false) $$;
REVOKE EXECUTE ON FUNCTION public.get_my_company_id(), public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_company_id(), public.is_admin() TO authenticated;

-- RLS de production : SELECT de SON entreprise, aucune policy UPDATE. Droits de
-- table larges (comme en production), c'est la RLS qui ferme.
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.companies TO anon, authenticated;
GRANT ALL ON public.companies TO service_role;
CREATE POLICY companies_select_own_company ON public.companies FOR SELECT TO authenticated USING (id = public.get_my_company_id());
GRANT SELECT ON public.users TO authenticated;

-- Les paniers déjà notés (un par jour sur les lignes vivantes, comme en production).
CREATE TABLE public.time_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, user_id uuid, work_date date,
  meal_allowance boolean DEFAULT false, status text NOT NULL DEFAULT 'draft');
CREATE UNIQUE INDEX time_entries_one_meal_per_day ON public.time_entries (user_id, work_date) WHERE meal_allowance AND status <> 'cancelled';

-- Garde kiosk_enabled / ai_enabled : la VRAIE migration.
\i supabase/migrations/20260929150000_verrou_interrupteurs.sql
-- Garde support_enabled : recopiée MOT POUR MOT de 20260930090000_lot5_acces_support.sql
-- (ce fichier crée aussi des tables liées à auth.users, absentes ici).
CREATE OR REPLACE FUNCTION public.guard_company_support_flag()
 RETURNS trigger
 LANGUAGE plpgsql
 -- SECURITY INVOKER, volontairement : `current_user` doit être celui qui écrit.
 SET search_path TO ''
AS $fn$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN new;
  END IF;
  IF (TG_OP = 'INSERT' AND coalesce(new.support_enabled, false))
     OR (TG_OP = 'UPDATE' AND new.support_enabled IS DISTINCT FROM old.support_enabled) THEN
    RAISE EXCEPTION 'Activation réservée à BEMEXO (support_enabled).' USING ERRCODE = '42501';
  END IF;
  RETURN new;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.guard_company_support_flag() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS companies_support_flag_guard ON public.companies;
CREATE TRIGGER companies_support_flag_guard
  BEFORE INSERT OR UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.guard_company_support_flag();

-- Données AVANT la migration : deux entreprises, des paniers notés.
INSERT INTO public.companies (id, name, kiosk_enabled, ai_enabled, support_enabled) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Entreprise Test', true, false, true),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Entreprise Autre', false, true, false);
INSERT INTO public.users VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000000', 'admin', true, 'Alex'),
  ('a0000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000000', 'lead', true, 'Camille'),
  ('a0000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000000', 'worker', true, 'Sam'),
  ('a0000000-0000-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000000', 'admin', false, 'Ancien'),
  ('b0000000-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-000000000000', 'admin', true, 'Dominique');
INSERT INTO public.time_entries (company_id, user_id, work_date, meal_allowance, status) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000c', '2026-10-05', true, 'submitted'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000c', '2026-10-05', false, 'submitted'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000c', '2026-10-06', true, 'draft'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-00000000000a', '2026-10-05', true, 'submitted');
CREATE TABLE pg_temp.paniers_avant AS SELECT id, meal_allowance, status FROM public.time_entries;

-- La migration, deux fois de suite.
\i supabase/migrations/20261010120000_lot3bis_panier_reglage.sql
\i supabase/migrations/20261010120000_lot3bis_panier_reglage.sql

CREATE FUNCTION pg_temp.expect(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT ok THEN RAISE EXCEPTION 'ÉCHEC : %', label; END IF; RAISE NOTICE 'ok — %', label; END $$;
CREATE FUNCTION pg_temp.expect_denied(sql text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE sql; RAISE EXCEPTION 'ÉCHEC : %', label;
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok — %', label; END $$;
CREATE FUNCTION pg_temp.rows_updated(sql text) RETURNS int LANGUAGE plpgsql AS $$
DECLARE n int; BEGIN EXECUTE sql; GET DIAGNOSTICS n = ROW_COUNT; RETURN n; END $$;
CREATE FUNCTION pg_temp.paniers_intacts() RETURNS boolean LANGUAGE sql AS $$
  SELECT NOT EXISTS (
    (SELECT id, meal_allowance, status FROM pg_temp.paniers_avant EXCEPT SELECT id, meal_allowance, status FROM public.time_entries)
    UNION ALL
    (SELECT id, meal_allowance, status FROM public.time_entries EXCEPT SELECT id, meal_allowance, status FROM pg_temp.paniers_avant)) $$;
GRANT EXECUTE ON FUNCTION pg_temp.expect(boolean, text), pg_temp.expect_denied(text, text), pg_temp.rows_updated(text) TO anon, authenticated;

-- 1) La colonne : neuve, par défaut OUI, jamais vide ; rien ne change pour personne.
SELECT pg_temp.expect((SELECT data_type = 'boolean' AND column_default = 'true' AND is_nullable = 'NO' FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'meal_enabled'), 'colonne meal_enabled : boolean, défaut true, NOT NULL');
SELECT pg_temp.expect((SELECT bool_and(meal_enabled) AND count(*) = 2 FROM public.companies), 'migration rejouée 2 fois : les entreprises existantes sont à « oui »');
SELECT pg_temp.expect((SELECT prosecdef AND 'search_path=""' = ANY (proconfig) FROM pg_proc WHERE proname = 'set_meal_enabled'), 'set_meal_enabled : SECURITY DEFINER, search_path vide');
SELECT pg_temp.expect(has_function_privilege('anon', 'public.set_meal_enabled(boolean)', 'execute') = false, 'anonyme : pas le droit d’exécuter set_meal_enabled');
SELECT pg_temp.expect(has_function_privilege('authenticated', 'public.set_meal_enabled(boolean)', 'execute'), 'connecté : peut appeler (la fonction trie ensuite)');
SELECT pg_temp.expect((SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.companies'::regclass AND NOT tgisinternal) = 2, 'companies : toujours les 2 mêmes gardes, aucun trigger ajouté');
SELECT pg_temp.expect((SELECT count(*) FROM pg_policies WHERE tablename = 'companies') = 1 AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'companies' AND cmd <> 'SELECT'), 'companies : aucune policy ajoutée (SELECT seulement)');

-- 2) Anonyme : refusé net.
SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT pg_temp.expect_denied($$SELECT public.set_meal_enabled(false)$$, 'anonyme : set_meal_enabled refusé');
RESET ROLE;

SET ROLE authenticated;
-- 3) Salarié, chef d'équipe, admin archivé, session vide : refusés.
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000c', false);
SELECT pg_temp.expect((SELECT meal_enabled FROM public.companies) AND (SELECT count(*) FROM public.companies) = 1, 'salarié : lit le réglage de SON entreprise seulement (sa journée en dépend)');
SELECT pg_temp.expect_denied($$SELECT public.set_meal_enabled(false)$$, 'salarié : ne change pas le réglage');
SELECT pg_temp.expect(pg_temp.rows_updated($$UPDATE public.companies SET meal_enabled = false$$) = 0, 'salarié : écriture directe → 0 ligne (aucune policy UPDATE)');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000b', false);
SELECT pg_temp.expect_denied($$SELECT public.set_meal_enabled(false)$$, 'chef d’équipe : ne change pas le réglage');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000e', false);
SELECT pg_temp.expect_denied($$SELECT public.set_meal_enabled(false)$$, 'admin archivé : refusé');
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT pg_temp.expect_denied($$SELECT public.set_meal_enabled(false)$$, 'sans session : refusé');

-- 4) L'admin de A décoche : A seulement, rien d'autre ne bouge.
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', false);
SELECT pg_temp.expect(pg_temp.rows_updated($$UPDATE public.companies SET meal_enabled = false$$) = 0, 'admin : écriture directe → 0 ligne (seule la fonction écrit)');
SELECT pg_temp.expect(public.set_meal_enabled(false) = false, 'admin de A : set_meal_enabled(false) rend false');
SELECT pg_temp.expect((SELECT NOT meal_enabled FROM public.companies), 'admin de A : relit « non »');
RESET ROLE;
SELECT pg_temp.expect((SELECT meal_enabled FROM public.companies WHERE id = 'bbbbbbbb-0000-0000-0000-000000000000'), 'entreprise B : toujours « oui » (autre entreprise intouchée)');
SELECT pg_temp.expect((SELECT kiosk_enabled AND NOT ai_enabled AND support_enabled FROM public.companies WHERE id = 'aaaaaaaa-0000-0000-0000-000000000000')
  AND (SELECT NOT kiosk_enabled AND ai_enabled AND NOT support_enabled FROM public.companies WHERE id = 'bbbbbbbb-0000-0000-0000-000000000000'),
  'interrupteurs borne / IA / support : inchangés dans A et B');
SELECT pg_temp.expect(pg_temp.paniers_intacts(), 'paniers déjà notés (meal_allowance) : intacts après « non »');

-- 5) Rejouer la migration ne remet PAS « oui » sur une entreprise qui a décoché.
\i supabase/migrations/20261010120000_lot3bis_panier_reglage.sql
SELECT pg_temp.expect((SELECT NOT meal_enabled FROM public.companies WHERE id = 'aaaaaaaa-0000-0000-0000-000000000000'), 'migration rejouée une 3e fois : A reste à « non »');

-- 6) L'admin de B ne touche que B ; null = oui ; recocher.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-00000000000a', false);
SELECT pg_temp.expect(public.set_meal_enabled(false) = false, 'admin de B : décoche B');
RESET ROLE;
SELECT pg_temp.expect((SELECT NOT meal_enabled FROM public.companies WHERE id = 'aaaaaaaa-0000-0000-0000-000000000000') AND (SELECT NOT meal_enabled FROM public.companies WHERE id = 'bbbbbbbb-0000-0000-0000-000000000000'), 'B décoché par son admin, A inchangé');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', false);
SELECT pg_temp.expect(public.set_meal_enabled(null) = true, 'set_meal_enabled(null) → oui');
SELECT pg_temp.expect((SELECT meal_enabled FROM public.companies), 'admin de A : recoché, relit « oui »');
RESET ROLE;
SELECT pg_temp.expect((SELECT NOT meal_enabled FROM public.companies WHERE id = 'bbbbbbbb-0000-0000-0000-000000000000'), 'B reste à « non » quand A recoche');
SELECT pg_temp.expect(pg_temp.paniers_intacts(), 'paniers déjà notés : intacts après « non » puis « oui »');

-- 7) Les gardes d'interrupteurs tiennent toujours. Même si une policy UPDATE
--    existait (état d'avant), l'admin ne change ni la borne, ni l'IA, ni le
--    support — mais le panier, si (aucune garde ne le compare).
CREATE POLICY companies_test_update ON public.companies FOR UPDATE TO authenticated
  USING (id = public.get_my_company_id()) WITH CHECK (id = public.get_my_company_id());
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', false);
SELECT pg_temp.expect_denied($$UPDATE public.companies SET kiosk_enabled = false$$, 'garde : l’admin ne change pas kiosk_enabled');
SELECT pg_temp.expect_denied($$UPDATE public.companies SET ai_enabled = true, meal_enabled = false$$, 'garde : l’admin ne change pas ai_enabled (même noyé avec le panier)');
SELECT pg_temp.expect_denied($$UPDATE public.companies SET support_enabled = false$$, 'garde : l’admin ne change pas support_enabled');
SELECT pg_temp.expect(pg_temp.rows_updated($$UPDATE public.companies SET meal_enabled = false$$) = 1, 'garde : le panier seul n’est pas bloqué par les gardes');
SELECT pg_temp.expect(public.set_meal_enabled(true) = true, 'la fonction passe les gardes (propriétaire postgres)');
RESET ROLE;
DROP POLICY companies_test_update ON public.companies;
SELECT pg_temp.expect((SELECT kiosk_enabled AND NOT ai_enabled AND support_enabled AND meal_enabled FROM public.companies WHERE id = 'aaaaaaaa-0000-0000-0000-000000000000'), 'A : interrupteurs intacts, panier à « oui »');
SELECT pg_temp.expect(pg_temp.paniers_intacts(), 'paniers déjà notés : intacts à la fin');

-- 8) Retour arrière documenté : rien ne casse, aucun panier noté n'est touché.
DROP FUNCTION IF EXISTS public.set_meal_enabled(boolean);
ALTER TABLE public.companies DROP COLUMN IF EXISTS meal_enabled;
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'meal_enabled') AND pg_temp.paniers_intacts(), 'RETOUR ARRIÈRE : colonne et fonction retirées, paniers intacts');
