-- Test de l'IA étape 3c-0 (sécurité des chats de l'assistant) — base VIDE uniquement :
--   npm run test:assistant-chats-securite-rls
--   (= bash supabase/tests/run-rls.sh supabase/tests/ia_3c0_chats_securite.sql, depuis la racine du dépôt)
--
-- Rejoue la migration d'AVANT (20261014090000, testée en l'état par ia_etape2_chats.sql, qui reste inchangé) puis
-- la migration 3c-0 (20261015090000), et prouve : (a) un administrateur RÉTROGRADÉ ne relit plus ses chats « bureau »
-- (le trigger les efface ; et même un chat « bureau » posé en base pour un non-admin reste invisible) ; (b) un salarié
-- ARCHIVÉ ne lit plus rien ; (c) une personne qui change d'entreprise perd les chats de l'ancienne ; (d) un salarié
-- promu puis rétrogradé garde ses chats « salarie » ; (e) l'administrateur actif lit toujours ses chats des deux côtés,
-- un autre administrateur de l'entreprise ne lit toujours pas ; (f) même chose pour les messages ; (g) on peut toujours
-- supprimer ses propres chats (même après rétrogradation) ; (h) la purge efface en plus les chats d'avant devenus
-- illégitimes et garde les autres ; (i) aucun client ne peut appeler le trigger ni la purge ; (j) les droits d'écriture
-- de la migration d'avant sont intacts ; (k) la requête de vérification de l'en-tête de la migration est vraie.
\set ON_ERROR_STOP on

-- La base jetable peut être en SQL_ASCII (locale POSIX du poste) : char_length() et left() compteraient des
-- octets, pas des caractères — alors qu'en production la base est en UTF8. On travaille donc toujours en UTF8.
SELECT current_setting('server_encoding') <> 'UTF8' AS autre_encodage \gset
\if :autre_encodage
  CREATE DATABASE chats_utf8 TEMPLATE template0 ENCODING 'UTF8';
  \c chats_utf8
\endif
\encoding UTF8

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
-- ON DELETE SET NULL (et non CASCADE) : supprimer une entreprise garde ses salariés, ce qui prouve que ce sont
-- bien les chats eux-mêmes (company_id) qui partent avec elle, pas un effet de bord par les salariés.
CREATE TABLE public.users (id uuid PRIMARY KEY, company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL, role public.battime_role NOT NULL, is_active boolean DEFAULT true);
CREATE FUNCTION public.get_my_company_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT company_id FROM public.users WHERE id = auth.uid() AND is_active IS DISTINCT FROM false $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin' AND is_active IS DISTINCT FROM false) $$;
GRANT EXECUTE ON FUNCTION public.get_my_company_id(), public.is_admin() TO authenticated;
GRANT SELECT ON public.users, public.companies TO authenticated;

-- Comme sur Supabase : tout objet neuf du schéma public est AUTOMATIQUEMENT ouvert à anon, authenticated et
-- service_role. Sans cette ligne le test ne prouverait rien : les REVOKE de la migration n'auraient rien à retirer.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

CREATE FUNCTION pg_temp.expect(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'ÉCHEC : %', label; END IF; RAISE NOTICE 'ok — %', label; END $$;
-- Exige une erreur AVEC le code attendu (pas n'importe quelle erreur) ; et, si on le demande, que ni le
-- message ni le détail de l'erreur ne contiennent un texte donné (le contenu d'un chat ne doit jamais fuir).
CREATE FUNCTION pg_temp.expect_state(sql text, state text, label text, secret text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE got text; msg text := ''; det text := '';
BEGIN
  BEGIN
    EXECUTE sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS got = RETURNED_SQLSTATE, msg = MESSAGE_TEXT, det = PG_EXCEPTION_DETAIL;
  END;
  IF got IS NULL THEN RAISE EXCEPTION 'ÉCHEC : % (aucune erreur)', label; END IF;
  IF got <> state THEN RAISE EXCEPTION 'ÉCHEC : % (code % au lieu de %)', label, got, state; END IF;
  IF secret IS NOT NULL AND (position(secret in msg) > 0 OR position(secret in det) > 0) THEN
    RAISE EXCEPTION 'ÉCHEC : % (le texte du chat apparaît dans l''erreur)', label;
  END IF;
  RAISE NOTICE 'ok — %', label;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.expect(boolean, text), pg_temp.expect_state(text, text, text, text) TO authenticated, anon;
\i supabase/migrations/20261014090000_ia_etape2_chats.sql

\set coA  aaaaaaaa-0000-0000-0000-000000000000
\set coB  bbbbbbbb-0000-0000-0000-000000000000
\set adminA  a0000000-0000-0000-0000-00000000000a
\set adminA2 a0000000-0000-0000-0000-0000000000a2
\set w1      a0000000-0000-0000-0000-00000000000c
\set w2      a0000000-0000-0000-0000-00000000000d
\set w3      a0000000-0000-0000-0000-00000000000e
\set w4      a0000000-0000-0000-0000-00000000000f
\set w5      a0000000-0000-0000-0000-000000000011
\set adminB  b0000000-0000-0000-0000-00000000000b

INSERT INTO public.companies VALUES (:'coA', 'A', true), (:'coB', 'B', true);
INSERT INTO public.users VALUES
  (:'adminA',  :'coA', 'admin',  true),
  (:'adminA2', :'coA', 'admin',  true),
  (:'w1',      :'coA', 'worker', true),
  (:'w2',      :'coA', 'worker', true),
  (:'w3',      :'coA', 'admin',  true),
  (:'w4',      :'coA', 'worker', true),
  (:'w5',      :'coA', 'worker', true),
  (:'adminB',  :'coB', 'admin',  true);

-- ═══ 0 · AVANT la migration 3c-0 : les failles sont réelles ═══
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'w3', false);
SELECT public.assistant_chat_append(NULL, 'Combien d''heures a fait Karim ce mois ?', 'Karim : 140 h.') AS avant_bureau \gset
SELECT set_config('request.jwt.claim.sub', :'w2', false);
SELECT public.assistant_chat_append(NULL, 'Mes heures ?', '31 h.') AS avant_archive \gset
RESET ROLE;
UPDATE public.users SET role = 'worker' WHERE id = :'w3';
UPDATE public.users SET is_active = false WHERE id = :'w2';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'w3', false);
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'avant_bureau') = 1,
  '(0) AVANT 3c-0 : un administrateur rétrogradé relit encore son chat « bureau » (la faille)');
SELECT set_config('request.jwt.claim.sub', :'w2', false);
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'avant_archive') = 1,
  '(0) AVANT 3c-0 : un salarié archivé relit encore son chat (la faille)');
RESET ROLE;
-- On remet l'état de départ avant d'appliquer la migration.
UPDATE public.users SET role = 'admin' WHERE id = :'w3';
UPDATE public.users SET is_active = true WHERE id = :'w2';
DELETE FROM public.assistant_chats WHERE id IN (:'avant_bureau', :'avant_archive');

\i supabase/migrations/20261015090000_ia_3c0_chats_securite.sql
-- Rejouable : la 2e application ne casse rien et ne change rien.
\i supabase/migrations/20261015090000_ia_3c0_chats_securite.sql

-- ═══ 1 · Structure ═══
SELECT pg_temp.expect((SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('assistant_chats', 'assistant_chat_messages')) = 3,
  'structure : toujours exactement 3 règles');
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('assistant_chats', 'assistant_chat_messages') AND cmd NOT IN ('SELECT', 'DELETE')),
  'structure : toujours aucune règle INSERT / UPDATE / ALL pour les clients');
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('assistant_chats', 'assistant_chat_messages') AND qual NOT ILIKE '%auth.uid%'),
  'structure : TOUTES les règles gardent le filtre sur l''auteur (user_id = auth.uid())');
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('assistant_chats', 'assistant_chat_messages') AND (qual ILIKE '%support%' OR qual ILIKE '%service_role%')),
  'structure : aucune règle « support »');
SELECT pg_temp.expect((SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('assistant_chats', 'assistant_chat_messages') AND cmd = 'SELECT'
    AND qual ILIKE '%get_my_company_id%' AND qual ILIKE '%is_admin%') = 2, 'structure : les 2 règles de lecture exigent l''entreprise active ET, côté bureau, le rôle actuel');
SELECT pg_temp.expect((SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'assistant_chats' AND cmd = 'DELETE' AND qual NOT ILIKE '%is_admin%' AND qual NOT ILIKE '%get_my_company_id%') = 1,
  'structure : la suppression reste libre (mes chats, sans condition de rôle)');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgname = 'users_purge_chats_perdus' AND t.tgrelid = 'public.users'::regclass AND NOT t.tgisinternal),
  'structure : le trigger est posé sur public.users');
SELECT pg_temp.expect((SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prosecdef
    AND proname IN ('purge_chats_perdus', 'purge_old_assistant_chats', 'assistant_chat_append', 'assistant_chat_clear') AND proconfig @> ARRAY['search_path=""']) = 4,
  'structure : les 4 fonctions de chat sont SECURITY DEFINER à search_path vide');
SELECT pg_temp.expect(NOT has_function_privilege('authenticated', 'public.purge_chats_perdus()', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.purge_chats_perdus()', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.purge_chats_perdus()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.purge_old_assistant_chats()', 'EXECUTE') AND NOT has_function_privilege('service_role', 'public.purge_old_assistant_chats()', 'EXECUTE'),
  '(i) le trigger et la purge ne sont appelables par aucun client');
SELECT pg_temp.expect(has_table_privilege('authenticated', 'public.assistant_chats', 'SELECT') AND has_table_privilege('authenticated', 'public.assistant_chats', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.assistant_chats', 'INSERT') AND NOT has_table_privilege('authenticated', 'public.assistant_chats', 'UPDATE')
  AND NOT has_table_privilege('service_role', 'public.assistant_chats', 'SELECT'), '(j) les droits d''écriture de la migration d''avant sont intacts');
WITH v AS (
  SELECT
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('assistant_chats', 'assistant_chat_messages')) = 3 AS trois_regles,
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('assistant_chats', 'assistant_chat_messages') AND cmd = 'SELECT'
       AND qual ILIKE '%get_my_company_id%' AND qual ILIKE '%is_admin%' AND qual ILIKE '%auth.uid%') = 2 AS lecture_resserree,
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'assistant_chats' AND cmd = 'DELETE'
       AND qual NOT ILIKE '%is_admin%' AND qual ILIKE '%auth.uid%') = 1 AS suppression_libre,
    EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgname = 'users_purge_chats_perdus' AND t.tgrelid = 'public.users'::regclass AND NOT t.tgisinternal) AS trigger_pose,
    (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prosecdef AND proname IN ('purge_chats_perdus', 'purge_old_assistant_chats')
       AND proconfig @> ARRAY['search_path=""']) = 2 AS fonctions,
    NOT has_function_privilege('authenticated', 'public.purge_chats_perdus()', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.purge_chats_perdus()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.purge_old_assistant_chats()', 'EXECUTE') AS fermees)
SELECT pg_temp.expect(v.trois_regles AND v.lecture_resserree AND v.suppression_libre AND v.trigger_pose AND v.fonctions AND v.fermees,
  '(k) en-tête de la migration : la requête de vérification APRÈS application est vraie (6 × true)') FROM v;

-- ═══ (a) Administrateur rétrogradé ═══
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'w3', false);
SELECT public.assistant_chat_append(NULL, 'Combien d''heures a fait Karim ce mois ?', 'Karim : 140 h.') AS c3b \gset
SELECT pg_temp.expect((SELECT side FROM public.assistant_chats WHERE id = :'c3b') = 'bureau', '(a) avant : l''administrateur a un chat « bureau »');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chat_messages WHERE chat_id = :'c3b') = 2, '(a) avant : il en lit les 2 messages');
SELECT set_config('request.jwt.claim.sub', :'adminA2', false);
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'c3b') = 0
  AND (SELECT count(*) FROM public.assistant_chat_messages WHERE chat_id = :'c3b') = 0, '(e) un AUTRE administrateur de la même entreprise ne lit toujours pas ce chat');
RESET ROLE;
UPDATE public.users SET role = 'lead' WHERE id = :'w3';
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'c3b') = 0
  AND (SELECT count(*) FROM public.assistant_chat_messages WHERE chat_id = :'c3b') = 0, '(a) rétrogradé : le trigger a EFFACÉ le chat « bureau » et ses messages');
-- Un chat « bureau » resté en base (créé avant la migration) : la règle le cache de toute façon.
INSERT INTO public.assistant_chats (id, user_id, company_id, side, title) VALUES ('11111111-0000-0000-0000-000000000001', :'w3', :'coA', 'bureau', 'Reste d''avant');
INSERT INTO public.assistant_chat_messages (chat_id, who, text) VALUES ('11111111-0000-0000-0000-000000000001', 'me', 'Q'), ('11111111-0000-0000-0000-000000000001', 'bot', 'R : heures de tout le monde');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'w3', false);
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats) = 0, '(a) rétrogradé : même un chat « bureau » resté en base est INVISIBLE (règle de lecture)');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chat_messages) = 0, '(f) rétrogradé : ses messages « bureau » aussi');
-- (g) Postgres applique AUSSI la règle de lecture à un DELETE ... WHERE : un chat caché ne s'efface pas un par un,
-- mais « Tout effacer » (assistant_chat_clear, SECURITY DEFINER) efface tout ce qui est à moi, caché ou non.
WITH d AS (DELETE FROM public.assistant_chats WHERE id = '11111111-0000-0000-0000-000000000001' RETURNING 1) SELECT count(*) AS n_del FROM d \gset
SELECT pg_temp.expect(:n_del = 0, '(g) rétrogradé : un chat caché ne se supprime pas un par un (il est invisible)');
SELECT public.assistant_chat_clear() AS n_clear \gset
SELECT pg_temp.expect(:n_clear = 1, '(g) rétrogradé : « Tout effacer » efface bien son vieux chat caché (droit d''effacement conservé)');
-- Son chat « salarie » (nouveau, créé depuis qu'il n'est plus administrateur) est lisible.
SELECT public.assistant_chat_append(NULL, 'Mes heures ?', 'Vous : 35 h.') AS c3s \gset
SELECT pg_temp.expect((SELECT side FROM public.assistant_chats WHERE id = :'c3s') = 'salarie', '(a) rétrogradé : ses nouveaux chats sont « salarie »');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'c3s') = 1, '(a) rétrogradé : il lit ses chats « salarie »');
RESET ROLE;

-- ═══ (b) Salarié archivé ═══
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'w2', false);
SELECT public.assistant_chat_append(NULL, 'Mes heures de la semaine ?', '31 h.') AS c2 \gset
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'c2') = 1, '(b) avant : le salarié lit son chat');
RESET ROLE;
UPDATE public.users SET is_active = false WHERE id = :'w2';
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE user_id = :'w2') = 0 AND (SELECT count(*) FROM public.assistant_chat_messages WHERE chat_id = :'c2') = 0,
  '(b) archivé : le trigger a effacé tous ses chats et leurs messages');
INSERT INTO public.assistant_chats (id, user_id, company_id, side, title) VALUES ('22222222-0000-0000-0000-000000000002', :'w2', :'coA', 'salarie', 'Reste d''avant');
INSERT INTO public.assistant_chat_messages (chat_id, who, text) VALUES ('22222222-0000-0000-0000-000000000002', 'me', 'Q'), ('22222222-0000-0000-0000-000000000002', 'bot', 'R');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'w2', false);
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats) = 0 AND (SELECT count(*) FROM public.assistant_chat_messages) = 0, '(b) archivé : un chat resté en base est INVISIBLE (chats et messages)');
RESET ROLE;

-- ═══ (c) Changement d'entreprise ═══
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'w4', false);
SELECT public.assistant_chat_append(NULL, 'Où est le chantier Dupont ?', 'Rue des Lilas.') AS c4 \gset
RESET ROLE;
UPDATE public.users SET company_id = :'coB' WHERE id = :'w4';
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE user_id = :'w4') = 0, '(c) changement d''entreprise : les chats de l''ancienne sont effacés');
INSERT INTO public.assistant_chats (id, user_id, company_id, side, title) VALUES ('33333333-0000-0000-0000-000000000003', :'w4', :'coA', 'salarie', 'Reste de l''ancienne entreprise');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'w4', false);
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats) = 0, '(c) un chat de l''ANCIENNE entreprise resté en base est invisible dans la nouvelle');
SELECT public.assistant_chat_append(NULL, 'Bonjour', 'Bonjour !') AS c4b \gset
SELECT pg_temp.expect((SELECT company_id FROM public.assistant_chats WHERE id = :'c4b') = :'coB', '(c) ses nouveaux chats portent la nouvelle entreprise');
RESET ROLE;

-- ═══ (d) Promu puis rétrogradé : les chats « salarie » restent, les « bureau » partent ═══
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'w5', false);
SELECT public.assistant_chat_append(NULL, 'Mon planning ?', 'Lundi : Dupont.') AS c5s \gset
RESET ROLE;
UPDATE public.users SET role = 'admin' WHERE id = :'w5';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'w5', false);
SELECT public.assistant_chat_append(NULL, 'Qui est en congé ?', 'Personne.') AS c5b \gset
SELECT pg_temp.expect((SELECT side FROM public.assistant_chats WHERE id = :'c5b') = 'bureau', '(e) promu : son nouveau chat est « bureau »');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id IN (:'c5s', :'c5b')) = 2, '(e) administrateur actif : il lit ses chats des DEUX côtés (le filtre de côté est celui de l''écran)');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chat_messages WHERE chat_id IN (:'c5s', :'c5b')) = 4, '(f) administrateur actif : il lit les messages des deux côtés');
RESET ROLE;
UPDATE public.users SET role = 'worker' WHERE id = :'w5';
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'c5b') = 0, '(d) rétrogradé : le chat « bureau » est effacé');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'c5s') = 1, '(d) rétrogradé : le chat « salarie » est gardé');
UPDATE public.users SET role = 'admin' WHERE id = :'w5';
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'c5b') = 0, '(d) re-promu : le chat « bureau » effacé ne revient pas');
-- Un changement qui ne touche ni le rôle, ni l'archivage, ni l'entreprise ne supprime rien.
UPDATE public.users SET is_active = true WHERE id = :'w5';
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'c5s') = 1, '(d) une mise à jour sans changement de rôle ni d''archivage ne supprime rien');
UPDATE public.users SET role = 'lead' WHERE id = :'w5';
UPDATE public.users SET role = 'worker' WHERE id = :'w5';
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'c5s') = 1, '(d) lead ↔ worker : le chat « salarie » reste');

-- ═══ (e) Un salarié ordinaire ne voit que les siens ; les autres rien ═══
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'w1', false);
SELECT public.assistant_chat_append(NULL, 'Mes heures ?', '35 h.') AS c1 \gset
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats) = 1 AND (SELECT id FROM public.assistant_chats) = :'c1', '(e) un salarié actif ne lit que son chat');
SELECT set_config('request.jwt.claim.sub', :'adminA', false);
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'c1') = 0 AND (SELECT count(*) FROM public.assistant_chat_messages WHERE chat_id = :'c1') = 0,
  '(e) l''administrateur actif ne lit toujours pas le chat d''un salarié');
SELECT set_config('request.jwt.claim.sub', :'adminB', false);
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'c1') = 0, '(e) une autre entreprise ne lit rien');
-- L'écriture reste fermée aux clients.
SELECT pg_temp.expect_state($$INSERT INTO public.assistant_chats (user_id, company_id, side, title) VALUES (auth.uid(), get_my_company_id(), 'bureau', 'x')$$, '42501', '(j) un client ne peut toujours pas insérer un chat');
RESET ROLE;

-- ═══ (h) La purge efface en plus les chats devenus illégitimes ═══
INSERT INTO public.assistant_chats (id, user_id, company_id, side, title) VALUES
  ('44444444-0000-0000-0000-000000000001', :'w3', :'coA', 'bureau', 'non-admin'),
  ('44444444-0000-0000-0000-000000000002', :'w2', :'coA', 'salarie', 'archivé'),
  ('44444444-0000-0000-0000-000000000003', :'w4', :'coA', 'salarie', 'ancienne entreprise');
INSERT INTO public.assistant_chats (id, user_id, company_id, side, title) VALUES
  ('55555555-0000-0000-0000-000000000001', :'adminA', :'coA', 'bureau', 'ok bureau'),
  ('55555555-0000-0000-0000-000000000002', :'w1', :'coA', 'salarie', 'ok salarié'),
  ('55555555-0000-0000-0000-000000000003', :'adminA', :'coA', 'salarie', 'ok admin ancien salarié');
INSERT INTO public.assistant_chat_messages (chat_id, who, text)
  SELECT id, 'me', 'Q' FROM public.assistant_chats WHERE title IN ('non-admin', 'archivé', 'ancienne entreprise', 'ok bureau');
SELECT count(*) AS n_avant FROM public.assistant_chats \gset
-- Le chat d'archivé inséré plus haut (2222…) est resté en base : la purge le compte aussi.
SELECT count(*) AS n_reste_archive FROM public.assistant_chats WHERE user_id = :'w2' AND id::text NOT LIKE '44444444%' \gset
SELECT count(*) AS n_reste_ancien FROM public.assistant_chats WHERE user_id = :'w4' AND company_id = :'coA' AND id::text NOT LIKE '44444444%' \gset
SELECT public.purge_old_assistant_chats() AS n_purge \gset
SELECT pg_temp.expect(:n_purge = 3 + :n_reste_archive + :n_reste_ancien, '(h) la purge rend le nombre exact de chats illégitimes (et aucun chat de moins de 30 jours)');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats) = :n_avant - :n_purge, '(h) elle n''a supprimé que ceux-là');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id::text LIKE '44444444%') = 0, '(h) non-admin « bureau », archivé et ancienne entreprise sont partis');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chat_messages m WHERE NOT EXISTS (SELECT 1 FROM public.assistant_chats c WHERE c.id = m.chat_id)) = 0, '(h) leurs messages sont partis avec eux');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id::text LIKE '55555555%') = 3, '(h) les 3 chats légitimes sont gardés');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chat_messages WHERE chat_id = '55555555-0000-0000-0000-000000000001') = 1, '(h) et leurs messages');
-- La règle des 30 jours fonctionne toujours.
UPDATE public.assistant_chats SET updated_at = now() - interval '31 days' WHERE id = '55555555-0000-0000-0000-000000000002';
SELECT pg_temp.expect(public.purge_old_assistant_chats() = 1, '(h) la purge des 30 jours fonctionne toujours (rend 1)');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = '55555555-0000-0000-0000-000000000002') = 0, '(h) le chat de 31 jours est parti');
SELECT pg_temp.expect(public.purge_old_assistant_chats() = 0, '(h) 2e passage : rien à faire (idempotent)');

-- ═══ Rétrogradation groupée (une requête, plusieurs personnes) ═══
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'adminA', false);
SELECT public.assistant_chat_append(NULL, 'Qui est absent ?', 'Personne.') AS ca \gset
RESET ROLE;
UPDATE public.users SET role = 'worker' WHERE id IN (:'adminA', :'adminB');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'ca') = 0, '(a) rétrogradation groupée : le chat « bureau » est effacé');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE user_id IN (:'adminA', :'adminB') AND side = 'bureau') = 0, '(a) rétrogradation groupée : aucun chat « bureau » ne reste');
