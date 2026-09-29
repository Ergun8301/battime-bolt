-- Test du lot 7 (journal de l'assistant, bureau + salarié) — base VIDE uniquement :
--   npm run test:assistant-journal
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

\i supabase/migrations/20261001090000_lot7_assistant_journal.sql

INSERT INTO public.companies VALUES ('aaaaaaaa-0000-0000-0000-000000000000', 'A', true), ('bbbbbbbb-0000-0000-0000-000000000000', 'B', true), ('cccccccc-0000-0000-0000-000000000000', 'C', false);
INSERT INTO public.users VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000000', 'admin', true),
  ('a0000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000000', 'worker', true),
  ('a0000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000000', 'worker', true),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000000', 'admin', true),
  ('c0000000-0000-0000-0000-00000000000c', 'cccccccc-0000-0000-0000-000000000000', 'admin', true);

CREATE FUNCTION pg_temp.expect(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT ok THEN RAISE EXCEPTION 'ÉCHEC : %', label; END IF; RAISE NOTICE 'ok — %', label; END $$;
CREATE FUNCTION pg_temp.expect_denied(sql text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE sql; RAISE EXCEPTION 'ÉCHEC : %', label;
EXCEPTION WHEN insufficient_privilege OR check_violation OR raise_exception THEN RAISE NOTICE 'ok — %', label; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.expect(boolean, text), pg_temp.expect_denied(text, text) TO authenticated;

SET ROLE authenticated;
-- ═══ Bureau A ═══
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', false);
SELECT public.assistant_journal_log('affecter_planning', 'Dupont · Remplacement chauffe-eau — Karim, jeu. 8 oct. à 14h');
SELECT public.assistant_journal_log('affecter_planning', 'Dupont · Remplacement chauffe-eau — Karim, jeu. 8 oct. à 14h', true);
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_journal) = 2, 'bureau A : action + annulation notées');
SELECT pg_temp.expect((SELECT bool_and(side = 'bureau' AND actor_id = auth.uid() AND company_id = 'aaaaaaaa-0000-0000-0000-000000000000') FROM public.assistant_journal), 'bureau A : qui / entreprise lus dans la session');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_journal WHERE undone) = 1, 'bureau A : annulation marquée');
SELECT pg_temp.expect_denied($$SELECT public.assistant_journal_log('Pas Bon!', 'x')$$, 'nom d''action hors format refusé');
SELECT pg_temp.expect_denied($$INSERT INTO public.assistant_journal (company_id, actor_id, side, action, summary) VALUES ('bbbbbbbb-0000-0000-0000-000000000000', auth.uid(), 'bureau', 'faux', 'x')$$, 'écriture directe refusée');
SELECT pg_temp.expect_denied($$UPDATE public.assistant_journal SET summary = 'maquillé'$$, 'modification refusée');
SELECT pg_temp.expect_denied($$DELETE FROM public.assistant_journal$$, 'suppression refusée');

-- ═══ Salarié A ═══
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000c', false);
SELECT public.assistant_journal_log('demander_conge', 'Congé du 12 au 16 oct.');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_journal) = 1, 'salarié A : ne lit QUE ses lignes');
SELECT pg_temp.expect((SELECT side FROM public.assistant_journal) = 'salarie', 'salarié A : noté côté salarié');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000d', false);
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_journal) = 0, 'collègue : ne voit rien des autres');

-- ═══ Bureau A relit tout ; bureau B ne voit rien ; C sans IA refusé ═══
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', false);
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_journal) = 3, 'bureau A : voit bureau + salariés de SON entreprise');
SELECT set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-00000000000b', false);
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_journal) = 0, 'bureau B : rien de A');
SELECT set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-00000000000c', false);
SELECT pg_temp.expect_denied($$SELECT public.assistant_journal_log('affecter_planning', 'x')$$, 'entreprise sans IA : refusé');
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT pg_temp.expect_denied($$SELECT public.assistant_journal_log('affecter_planning', 'x')$$, 'sans session : refusé');
RESET ROLE;
SELECT pg_temp.expect(has_function_privilege('anon', 'public.assistant_journal_log(text,text,boolean)', 'execute') = false, 'anonyme : pas d''accès');
