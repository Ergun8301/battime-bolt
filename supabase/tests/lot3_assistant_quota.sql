-- Test du quota de l'assistant (lot 3) — base VIDE uniquement :
--   npm run test:assistant-quota
\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE TABLE public.companies (id uuid PRIMARY KEY);
\i supabase/migrations/20260929160000_lot3_assistant_bureau.sql
INSERT INTO public.companies VALUES ('aaaaaaaa-0000-0000-0000-000000000000'), ('bbbbbbbb-0000-0000-0000-000000000000');
CREATE FUNCTION pg_temp.expect(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT ok THEN RAISE EXCEPTION 'ÉCHEC : %', label; END IF; RAISE NOTICE 'ok — %', label; END $$;

SET ROLE service_role;
SELECT pg_temp.expect(public.assistant_consume('aaaaaaaa-0000-0000-0000-000000000000', 3) = 1, '1re question comptée');
SELECT public.assistant_consume('aaaaaaaa-0000-0000-0000-000000000000', 3);
SELECT pg_temp.expect(public.assistant_consume('aaaaaaaa-0000-0000-0000-000000000000', 3) = 3, '3e question = limite atteinte pile');
SELECT pg_temp.expect(public.assistant_consume('aaaaaaaa-0000-0000-0000-000000000000', 3) IS NULL, '4e question refusée');
SELECT pg_temp.expect((SELECT questions FROM public.assistant_usage WHERE company_id = 'aaaaaaaa-0000-0000-0000-000000000000') = 3, 'un refus ne compte pas');
SELECT pg_temp.expect(public.assistant_consume('bbbbbbbb-0000-0000-0000-000000000000', 3) = 1, 'quota séparé par entreprise');
SELECT pg_temp.expect(public.assistant_consume('bbbbbbbb-0000-0000-0000-000000000000', 0) IS NULL, 'limite 0 = assistant coupé');
RESET ROLE;

SET ROLE authenticated;
DO $$ BEGIN
  PERFORM public.assistant_consume('aaaaaaaa-0000-0000-0000-000000000000', 1000);
  RAISE EXCEPTION 'ÉCHEC : un utilisateur a appelé assistant_consume';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok — un patron ne peut pas manipuler le compteur';
END $$;
DO $$ BEGIN
  PERFORM count(*) FROM public.assistant_usage;
  RAISE EXCEPTION 'ÉCHEC : compteur lisible';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok — compteur illisible côté client';
END $$;
RESET ROLE;
SELECT pg_temp.expect((SELECT count(*) FROM information_schema.columns WHERE table_name = 'assistant_usage') = 3, 'rien d''autre que (entreprise, jour, nombre) n''est stocké');
