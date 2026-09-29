-- Test du lot 5 (accès support) — base VIDE uniquement, jamais en production :
--   npm run test:support-rls
--
-- Recrée le strict nécessaire de Supabase (rôles, auth.uid(), auth.jwt() avec
-- `aal`, auth.users, users, companies, is_admin, get_my_company_id) et deux
-- tables métier AVEC leurs policies d'aujourd'hui, applique la migration, puis
-- vérifie les quatre verrous, la lecture seule, l'expiration, le retrait et le
-- journal non modifiable.
\set ON_ERROR_STOP on

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE
  AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(auth.jwt() ->> 'sub', '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO anon, authenticated;

CREATE TABLE public.companies (id uuid PRIMARY KEY, name text,
  kiosk_enabled boolean NOT NULL DEFAULT false, ai_enabled boolean NOT NULL DEFAULT false);
CREATE TABLE public.users (id uuid PRIMARY KEY, company_id uuid REFERENCES public.companies(id),
  first_name text, last_name text, role text NOT NULL, is_active boolean DEFAULT true);
CREATE FUNCTION public.get_my_company_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT company_id FROM public.users WHERE id = auth.uid() AND is_active IS DISTINCT FROM false $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin' AND is_active IS DISTINCT FROM false) $$;
GRANT EXECUTE ON FUNCTION public.get_my_company_id(), public.is_admin() TO authenticated;

-- Policies « d'aujourd'hui » (même forme qu'en production).
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.companies TO authenticated;
GRANT SELECT ON public.users TO authenticated;
CREATE POLICY companies_select_own_company ON public.companies FOR SELECT TO authenticated USING (id = public.get_my_company_id());
CREATE POLICY companies_admin_update ON public.companies FOR UPDATE TO authenticated
  USING (id = public.get_my_company_id() AND public.is_admin()) WITH CHECK (id = public.get_my_company_id());
CREATE POLICY users_select_company ON public.users FOR SELECT TO authenticated USING (company_id = public.get_my_company_id());

CREATE TABLE public.time_entries (id serial PRIMARY KEY, company_id uuid, user_id uuid, minutes int);
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries TO authenticated;
GRANT USAGE ON SEQUENCE public.time_entries_id_seq TO authenticated;
CREATE POLICY time_entries_select_company_admin_or_own_worker ON public.time_entries FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND (public.is_admin() OR user_id = auth.uid()));
CREATE POLICY time_entries_admin_all_mutations ON public.time_entries FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin())
  WITH CHECK (company_id = public.get_my_company_id() AND public.is_admin());

CREATE TABLE public.payslip_figures (id serial PRIMARY KEY, company_id uuid, gross numeric);
ALTER TABLE public.payslip_figures ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.payslip_figures TO authenticated;
CREATE POLICY payslip_figures_admin ON public.payslip_figures FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin());

\i supabase/migrations/20260929150000_verrou_interrupteurs.sql
\i supabase/migrations/20260930090000_lot5_acces_support.sql

-- A : patron + salarié. B : patron. S : compte support (sa propre entreprise « BEMEXO Support »).
INSERT INTO public.companies (id, name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000000', 'A'), ('bbbbbbbb-0000-0000-0000-000000000000', 'B'),
  ('55555555-0000-0000-0000-000000000000', 'BEMEXO Support');
INSERT INTO auth.users VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'patron@a.fr'), ('a0000000-0000-0000-0000-00000000000c', 'karim@a.fr'),
  ('b0000000-0000-0000-0000-00000000000b', 'patron@b.fr'), ('50000000-0000-0000-0000-000000000005', 'support@bemexo.com');
INSERT INTO public.users VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000000', 'Paul', 'Patron', 'admin', true),
  ('a0000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000000', 'Karim', 'B', 'worker', true),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000000', 'Bea', 'B', 'admin', true),
  ('50000000-0000-0000-0000-000000000005', '55555555-0000-0000-0000-000000000000', 'Ergun', 'Support', 'admin', true);
INSERT INTO public.time_entries (company_id, user_id, minutes) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000c', 480),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000c', 240),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-00000000000b', 300);
INSERT INTO public.payslip_figures (company_id, gross) VALUES ('aaaaaaaa-0000-0000-0000-000000000000', 2400);
INSERT INTO public.support_staff (user_id, label) VALUES ('50000000-0000-0000-0000-000000000005', 'Ergun — support BEMEXO');

CREATE FUNCTION pg_temp.expect(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT ok THEN RAISE EXCEPTION 'ÉCHEC : %', label; END IF; RAISE NOTICE 'ok — %', label; END $$;
-- Se connecter « comme » quelqu'un, avec ou sans double vérification.
CREATE FUNCTION pg_temp.as_user(uid text, aal text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', uid, 'aal', aal, 'role', 'authenticated')::text, false) $$;
GRANT EXECUTE ON FUNCTION pg_temp.expect(boolean, text), pg_temp.as_user(text, text) TO authenticated;
CREATE FUNCTION pg_temp.expect_denied(sql text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE sql;
  RAISE EXCEPTION 'ÉCHEC : %', label;
EXCEPTION WHEN insufficient_privilege OR check_violation OR invalid_parameter_value THEN RAISE NOTICE 'ok — %', label;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.expect_denied(text, text) TO authenticated;

-- ═══ 1. Rien n'est ouvert par défaut ═══════════════════════════════════════
SET ROLE authenticated;
SELECT pg_temp.as_user('50000000-0000-0000-0000-000000000005', 'aal2');
SELECT pg_temp.expect((SELECT count(*) FROM public.time_entries WHERE company_id = 'aaaaaaaa-0000-0000-0000-000000000000') = 0, 'support (MFA ok) sans autorisation : 0 heure de A');
SELECT pg_temp.expect(cardinality(public.support_company_ids()) = 0, 'support sans autorisation : aucune entreprise');

SELECT pg_temp.as_user('a0000000-0000-0000-0000-00000000000a', 'aal1');
SELECT pg_temp.expect((SELECT count(*) FROM public.time_entries) = 2, 'le patron de A voit toujours ses 2 lignes (rien ne change)');
SELECT pg_temp.expect_denied('SELECT public.support_grant(24)', 'interrupteur éteint : le patron ne peut pas autoriser');
SELECT pg_temp.expect_denied('UPDATE public.companies SET support_enabled = true', 'le patron ne peut pas allumer support_enabled');
RESET ROLE;

-- ═══ 2. BEMEXO allume A, le patron autorise ════════════════════════════════
UPDATE public.companies SET support_enabled = true WHERE id = 'aaaaaaaa-0000-0000-0000-000000000000';
SET ROLE authenticated;
SELECT pg_temp.as_user('a0000000-0000-0000-0000-00000000000c', 'aal1');
SELECT pg_temp.expect_denied('SELECT public.support_grant(24)', 'un salarié ne peut pas autoriser le support');
SELECT pg_temp.as_user('a0000000-0000-0000-0000-00000000000a', 'aal1');
SELECT pg_temp.expect_denied('SELECT public.support_grant(5)', 'durée hors liste (1 h / 24 h / 7 j) refusée');
SELECT pg_temp.expect_denied('UPDATE public.companies SET support_enabled = false', 'le patron ne peut pas non plus éteindre l''interrupteur');
SELECT pg_temp.expect(public.support_grant(24) > now() + interval '23 hours', 'le patron de A autorise pour 24 h');
SELECT pg_temp.expect((SELECT count(*) FROM public.support_grants) = 1, 'il voit son autorisation');
SELECT pg_temp.expect_denied($$INSERT INTO public.support_grants (company_id, granted_by, expires_at) VALUES ('aaaaaaaa-0000-0000-0000-000000000000', auth.uid(), now() + interval '1 day')$$, 'écriture directe dans support_grants refusée');
SELECT pg_temp.expect_denied('SELECT * FROM public.support_staff', 'la liste des comptes support est illisible');

-- ═══ 3. Double vérification obligatoire ═════════════════════════════════════
SELECT pg_temp.as_user('50000000-0000-0000-0000-000000000005', 'aal1');
SELECT pg_temp.expect((SELECT count(*) FROM public.time_entries WHERE company_id = 'aaaaaaaa-0000-0000-0000-000000000000') = 0, 'support SANS code MFA (aal1) : 0 ligne');
SELECT pg_temp.expect_denied($$SELECT * FROM public.support_enter('aaaaaaaa-0000-0000-0000-000000000000')$$, 'support sans MFA : « Entrer » refusé');
SELECT pg_temp.expect(public.support_is_staff(), 'l''écran sait quand même qu''il faut demander le code');

-- ═══ 4. Support avec MFA : lecture de A, rien d'autre ═══════════════════════
SELECT pg_temp.as_user('50000000-0000-0000-0000-000000000005', 'aal2');
SELECT pg_temp.expect((SELECT name FROM public.support_enter('aaaaaaaa-0000-0000-0000-000000000000')) = 'A', '« Entrer » dans A');
SELECT pg_temp.expect((SELECT count(*) FROM public.support_my_companies()) = 1, 'A apparaît dans sa liste');
SELECT pg_temp.expect((SELECT count(*) FROM public.time_entries WHERE company_id = 'aaaaaaaa-0000-0000-0000-000000000000') = 2, 'il lit les heures de A');
SELECT pg_temp.expect((SELECT count(*) FROM public.users WHERE company_id = 'aaaaaaaa-0000-0000-0000-000000000000') = 2, 'il lit les salariés de A');
SELECT pg_temp.expect((SELECT count(*) FROM public.companies WHERE id = 'aaaaaaaa-0000-0000-0000-000000000000') = 1, 'il lit la fiche entreprise de A');
SELECT pg_temp.expect((SELECT count(*) FROM public.time_entries WHERE company_id = 'bbbbbbbb-0000-0000-0000-000000000000') = 0, 'B (non autorisée) reste invisible');
SELECT pg_temp.expect((SELECT count(*) FROM public.payslip_figures) = 0, 'bulletins de A : jamais visibles au support');
SELECT pg_temp.expect_denied($$SELECT * FROM public.support_enter('bbbbbbbb-0000-0000-0000-000000000000')$$, '« Entrer » dans B refusé');
SELECT pg_temp.expect((SELECT count(*) FROM public.support_access_log) = 0, 'le support ne lit pas le journal (réservé au patron)');

-- ═══ 5. Lecture seule, vérifiée par la base ═════════════════════════════════
SELECT pg_temp.expect_denied($$INSERT INTO public.time_entries (company_id, user_id, minutes) VALUES ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000c', 60)$$, 'support : ajout d''heure refusé');
WITH u AS (UPDATE public.time_entries SET minutes = 1 WHERE company_id = 'aaaaaaaa-0000-0000-0000-000000000000' RETURNING 1)
SELECT pg_temp.expect((SELECT count(*) FROM u) = 0, 'support : modification d''heure sans effet (0 ligne)');
WITH d AS (DELETE FROM public.time_entries WHERE company_id = 'aaaaaaaa-0000-0000-0000-000000000000' RETURNING 1)
SELECT pg_temp.expect((SELECT count(*) FROM d) = 0, 'support : suppression sans effet (0 ligne)');
WITH u AS (UPDATE public.companies SET name = 'piraté' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000000' RETURNING 1)
SELECT pg_temp.expect((SELECT count(*) FROM u) = 0, 'support : fiche entreprise non modifiable');
SELECT pg_temp.expect_denied('SELECT public.support_grant(168)', 'support : ne peut pas se donner lui-même un accès');
SELECT public.support_exit('aaaaaaaa-0000-0000-0000-000000000000');

-- ═══ 6. Un autre patron avec MFA n'a rien ═══════════════════════════════════
SELECT pg_temp.as_user('b0000000-0000-0000-0000-00000000000b', 'aal2');
SELECT pg_temp.expect((SELECT count(*) FROM public.time_entries WHERE company_id = 'aaaaaaaa-0000-0000-0000-000000000000') = 0, 'patron de B (MFA) : 0 ligne de A');
SELECT pg_temp.expect_denied($$SELECT * FROM public.support_enter('aaaaaaaa-0000-0000-0000-000000000000')$$, 'patron de B : « Entrer » refusé');
SELECT pg_temp.expect((SELECT count(*) FROM public.support_access_log) = 0, 'patron de B : ne voit pas le journal de A');

-- ═══ 7. Journal lisible par le patron, non modifiable ═══════════════════════
SELECT pg_temp.as_user('a0000000-0000-0000-0000-00000000000a', 'aal1');
SELECT pg_temp.expect((SELECT string_agg(event, ',' ORDER BY id) FROM public.support_access_log) = 'autorise,entre,sort', 'journal du patron : autorisé → entré → sorti');
SELECT pg_temp.expect((SELECT actor_label FROM public.support_access_log WHERE event = 'entre') = 'Ergun — support BEMEXO', 'on voit QUI est entré');
SELECT pg_temp.expect_denied('DELETE FROM public.support_access_log', 'patron : suppression du journal refusée');
SELECT pg_temp.expect_denied($$UPDATE public.support_access_log SET actor_label = 'x'$$, 'patron : modification du journal refusée');
RESET ROLE;
SELECT pg_temp.expect_denied('DELETE FROM public.support_access_log', 'même le propriétaire de la base ne peut pas effacer le journal');
SELECT pg_temp.expect_denied($$UPDATE public.support_access_log SET detail = 'x'$$, 'ni le modifier');
SELECT pg_temp.expect_denied('TRUNCATE public.support_access_log', 'ni le vider');
SET ROLE service_role;
SELECT pg_temp.expect_denied('DELETE FROM public.support_access_log', 'ni la clé service');
RESET ROLE;
SELECT pg_temp.expect_denied($$INSERT INTO public.support_grants (company_id, granted_by, expires_at) VALUES ('bbbbbbbb-0000-0000-0000-000000000000', gen_random_uuid(), now() + interval '30 days')$$, 'jamais plus de 7 jours, même en SQL direct');

-- ═══ 8. Retrait et expiration ═══════════════════════════════════════════════
SET ROLE authenticated;
SELECT pg_temp.as_user('a0000000-0000-0000-0000-00000000000a', 'aal1');
SELECT public.support_revoke();
SELECT pg_temp.as_user('50000000-0000-0000-0000-000000000005', 'aal2');
SELECT pg_temp.expect((SELECT count(*) FROM public.time_entries WHERE company_id = 'aaaaaaaa-0000-0000-0000-000000000000') = 0, 'retrait : lecture coupée immédiatement');
SELECT pg_temp.as_user('a0000000-0000-0000-0000-00000000000a', 'aal1');
SELECT public.support_grant(1);
SELECT pg_temp.expect((SELECT count(*) FROM public.support_grants WHERE revoked_at IS NULL) = 1, 'nouvelle autorisation : une seule ouverte à la fois');
RESET ROLE;
UPDATE public.support_grants SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' WHERE revoked_at IS NULL;
SET ROLE authenticated;
SELECT pg_temp.as_user('50000000-0000-0000-0000-000000000005', 'aal2');
SELECT pg_temp.expect((SELECT count(*) FROM public.time_entries WHERE company_id = 'aaaaaaaa-0000-0000-0000-000000000000') = 0, 'expiration : lecture coupée toute seule');
SELECT pg_temp.expect((SELECT count(*) FROM public.support_my_companies()) = 0, 'expiration : A disparaît de sa liste');
SELECT pg_temp.as_user('a0000000-0000-0000-0000-00000000000a', 'aal1');
SELECT public.support_grant(24);
RESET ROLE;
UPDATE public.companies SET support_enabled = false WHERE id = 'aaaaaaaa-0000-0000-0000-000000000000';
SET ROLE authenticated;
SELECT pg_temp.as_user('50000000-0000-0000-0000-000000000005', 'aal2');
SELECT pg_temp.expect((SELECT count(*) FROM public.time_entries WHERE company_id = 'aaaaaaaa-0000-0000-0000-000000000000') = 0, 'interrupteur éteint par BEMEXO : tout est coupé, même avec une autorisation');
SELECT pg_temp.as_user('a0000000-0000-0000-0000-00000000000a', 'aal1');
SELECT pg_temp.expect((SELECT string_agg(event, ',' ORDER BY id) FROM public.support_access_log) = 'autorise,entre,sort,retire,autorise,autorise', 'journal complet, dans l''ordre');
SELECT pg_temp.expect((SELECT count(*) FROM public.time_entries) = 2, 'le patron de A : toujours ses 2 lignes, rien n''a bougé');
RESET ROLE;

SET ROLE anon;
SELECT pg_temp.expect_denied('SELECT public.support_company_ids()', 'anonyme : aucune fonction support');
RESET ROLE;
SELECT pg_temp.expect((SELECT count(*) FROM pg_policies WHERE policyname = 'support_read') = 3, 'policies support_read ajoutées (3 tables présentes dans ce test)');
SELECT pg_temp.expect((SELECT count(*) FROM pg_policies WHERE policyname <> 'support_read' AND tablename IN ('time_entries','users','companies','payslip_figures')) = 6, 'les 6 policies d''origine sont intactes');
