-- Test du verrou kiosk_enabled / ai_enabled — base VIDE uniquement :
--   bash supabase/tests/run-rls.sh supabase/tests/verrou_interrupteurs.sql
\set ON_ERROR_STOP on

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

-- Le strict nécessaire : companies avec ses deux colonnes (lots 1 et 2) et une
-- policy « l'admin modifie SA ligne », comme en production.
CREATE TABLE public.companies (
  id uuid PRIMARY KEY, name text,
  kiosk_enabled boolean NOT NULL DEFAULT false,
  ai_enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE public.users (id uuid PRIMARY KEY, company_id uuid, role text);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
CREATE POLICY c_sel ON public.companies FOR SELECT TO authenticated USING (true);
CREATE POLICY c_upd ON public.companies FOR UPDATE TO authenticated
  USING (id = (SELECT company_id FROM public.users WHERE users.id = auth.uid()))
  WITH CHECK (id = (SELECT company_id FROM public.users WHERE users.id = auth.uid()));
CREATE POLICY c_ins ON public.companies FOR INSERT TO authenticated WITH CHECK (true);
GRANT SELECT ON public.users TO authenticated;

\i supabase/migrations/20260929150000_verrou_interrupteurs.sql

INSERT INTO public.companies (id, name) VALUES ('aaaaaaaa-0000-0000-0000-000000000000', 'A');
INSERT INTO public.users VALUES ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000000', 'admin');

CREATE FUNCTION pg_temp.expect(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT ok THEN RAISE EXCEPTION 'ÉCHEC : %', label; END IF; RAISE NOTICE 'ok — %', label; END $$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', false);

UPDATE public.companies SET name = 'A renommée';
SELECT pg_temp.expect((SELECT name FROM public.companies) = 'A renommée', 'le patron modifie toujours ses autres réglages');
UPDATE public.companies SET name = 'A', kiosk_enabled = false;
SELECT pg_temp.expect(true, 'réécrire la même valeur (false) ne bloque pas un enregistrement');

DO $$ BEGIN
  UPDATE public.companies SET kiosk_enabled = true;
  RAISE EXCEPTION 'ÉCHEC : le patron a activé kiosk_enabled';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok — le patron ne peut pas activer kiosk_enabled';
END $$;
DO $$ BEGIN
  UPDATE public.companies SET ai_enabled = true, name = 'x';
  RAISE EXCEPTION 'ÉCHEC : le patron a activé ai_enabled';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok — le patron ne peut pas activer ai_enabled (même noyé dans un autre changement)';
END $$;
DO $$ BEGIN
  INSERT INTO public.companies (id, name, ai_enabled) VALUES ('bbbbbbbb-0000-0000-0000-000000000000', 'B', true);
  RAISE EXCEPTION 'ÉCHEC : entreprise créée avec ai_enabled';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok — impossible de créer une entreprise déjà activée';
END $$;
INSERT INTO public.companies (id, name) VALUES ('cccccccc-0000-0000-0000-000000000000', 'C');
SELECT pg_temp.expect(true, 'création normale d''une entreprise inchangée');

RESET ROLE;
SET ROLE service_role;
UPDATE public.companies SET kiosk_enabled = true, ai_enabled = true WHERE id = 'aaaaaaaa-0000-0000-0000-000000000000';
RESET ROLE;
SELECT pg_temp.expect((SELECT kiosk_enabled AND ai_enabled FROM public.companies WHERE name = 'A'), 'la clé service active les deux');

SET ROLE authenticated;
DO $$ BEGIN
  UPDATE public.companies SET ai_enabled = false WHERE id = 'aaaaaaaa-0000-0000-0000-000000000000';
  RAISE EXCEPTION 'ÉCHEC : le patron a désactivé ai_enabled';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok — le patron ne peut pas non plus éteindre';
END $$;
RESET ROLE;

UPDATE public.companies SET ai_enabled = false WHERE name = 'A';
SELECT pg_temp.expect((SELECT NOT ai_enabled FROM public.companies WHERE name = 'A'), 'l''éditeur SQL (postgres) garde la main');
