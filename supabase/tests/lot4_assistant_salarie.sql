-- Test du lot 4 (quota salarié + étanchéité) — base VIDE uniquement :
--   npm run test:assistant-salarie-rls
\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
CREATE TABLE public.users (id uuid PRIMARY KEY);
\i supabase/migrations/20260929170000_lot4_assistant_salarie.sql

-- Reproduction de la règle EXISTANTE que l'assistant réutilise : un salarié ne
-- lit que SES lignes (policy « user_id = auth.uid() » des tables de pointage).
CREATE TABLE public.time_entries (id serial PRIMARY KEY, user_id uuid, start_time time, end_time time);
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.time_entries TO authenticated;
GRANT USAGE ON SEQUENCE public.time_entries_id_seq TO authenticated;
CREATE POLICY own ON public.time_entries FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

INSERT INTO public.users VALUES ('11111111-0000-0000-0000-000000000001'), ('22222222-0000-0000-0000-000000000002');
INSERT INTO public.time_entries (user_id, start_time, end_time) VALUES
  ('11111111-0000-0000-0000-000000000001', '08:00', '12:00'),
  ('22222222-0000-0000-0000-000000000002', '06:00', '20:00');
CREATE FUNCTION pg_temp.expect(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT ok THEN RAISE EXCEPTION 'ÉCHEC : %', label; END IF; RAISE NOTICE 'ok — %', label; END $$;

SET ROLE service_role;
SELECT public.worker_assistant_consume('11111111-0000-0000-0000-000000000001', 2);
SELECT pg_temp.expect(public.worker_assistant_consume('11111111-0000-0000-0000-000000000001', 2) = 2, '2e demande = limite');
SELECT pg_temp.expect(public.worker_assistant_consume('11111111-0000-0000-0000-000000000001', 2) IS NULL, '3e demande refusée');
SELECT pg_temp.expect(public.worker_assistant_consume('22222222-0000-0000-0000-000000000002', 2) = 1, 'quota séparé par salarié');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000001', false);
SELECT pg_temp.expect((SELECT count(*) FROM public.time_entries) = 1, 'le salarié ne lit que SES heures');
SELECT pg_temp.expect((SELECT count(*) FROM public.time_entries WHERE user_id = '22222222-0000-0000-0000-000000000002') = 0, 'rien d''un collègue, même en le demandant');
DO $$ BEGIN
  INSERT INTO public.time_entries (user_id, start_time, end_time) VALUES ('22222222-0000-0000-0000-000000000002', '08:00', '09:00');
  RAISE EXCEPTION 'ÉCHEC : écriture pour un collègue';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok — impossible d''enregistrer au nom d''un collègue';
END $$;
DO $$ BEGIN
  PERFORM public.worker_assistant_consume('11111111-0000-0000-0000-000000000001', 999);
  RAISE EXCEPTION 'ÉCHEC : compteur manipulable';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok — le salarié ne peut pas remettre son compteur à zéro';
END $$;
DO $$ BEGIN
  PERFORM count(*) FROM public.worker_assistant_usage;
  RAISE EXCEPTION 'ÉCHEC : compteur lisible';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok — compteur illisible côté client';
END $$;
RESET ROLE;
