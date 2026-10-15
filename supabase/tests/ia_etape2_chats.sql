-- Test de l'IA étape 2 (chats de l'assistant : historique PRIVÉ) — base VIDE uniquement :
--   npm run test:assistant-chats-rls
--   (= bash supabase/tests/run-rls.sh supabase/tests/ia_etape2_chats.sql, à lancer depuis la racine du dépôt)
--
-- Ce que ce test prouve : (a) un salarié ne lit QUE ses chats ; (b) l'administrateur de la même
-- entreprise ne lit PAS le chat d'un salarié ; (c) une autre entreprise ne lit rien ; (d) aucun client
-- n'écrit directement ; (e) append crée le chat avec le bon titre puis ajoute à un chat existant ;
-- (f) append sur le chat d'un autre = 42501 ; (g) entreprise sans IA refusée ; (h) 201e message refusé ;
-- (i) le 101e chat supprime le moins récent ; (j) clear ne supprime que MES chats ; (k) la purge à 30 jours ;
-- (l) cascade utilisateur / entreprise ; (m) texte vide ou trop long refusé, sans jamais citer le texte ;
-- (n) la politique de confidentialité (app/confidentialite/page.tsx, section 14) dit que le texte des chats est
-- conservé 30 jours, visible du seul auteur, effaçable — et plus « ni votre question, ni la réponse » ; la liste
-- « à mettre en ligne avec la migration » et la fiche du registre des traitements existent (docs/ia-vision.md §6).
-- (n) lit des fichiers du dépôt : à lancer depuis la racine, et il passe en dernier.
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

\i supabase/migrations/20261014090000_ia_etape2_chats.sql

\set coA  aaaaaaaa-0000-0000-0000-000000000000
\set coB  bbbbbbbb-0000-0000-0000-000000000000
\set coC  cccccccc-0000-0000-0000-000000000000
\set coD  dddddddd-0000-0000-0000-000000000000
\set adminA a0000000-0000-0000-0000-00000000000a
\set w1     a0000000-0000-0000-0000-00000000000c
\set w2     a0000000-0000-0000-0000-00000000000d
\set w3     a0000000-0000-0000-0000-00000000000e
\set w4     a0000000-0000-0000-0000-00000000000f
\set w5     a0000000-0000-0000-0000-000000000011
\set w6     a0000000-0000-0000-0000-000000000012
\set adminB b0000000-0000-0000-0000-00000000000b
\set adminC c0000000-0000-0000-0000-00000000000c
\set wD     d0000000-0000-0000-0000-00000000000d

INSERT INTO public.companies VALUES (:'coA', 'A', true), (:'coB', 'B', true), (:'coC', 'C', false), (:'coD', 'D', true);
INSERT INTO public.users VALUES
  (:'adminA', :'coA', 'admin', true),
  (:'w1', :'coA', 'worker', true),
  (:'w2', :'coA', 'worker', true),
  (:'w3', :'coA', 'worker', true),
  (:'w4', :'coA', 'worker', true),
  (:'w5', :'coA', 'worker', true),
  (:'w6', :'coA', 'worker', false),
  (:'adminB', :'coB', 'admin', true),
  (:'adminC', :'coC', 'admin', true),
  (:'wD', :'coD', 'worker', true);

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

-- ═══ 0 · Structure, droits, fonctions (en tant que propriétaire) ═══
SELECT pg_temp.expect((SELECT count(*) FROM pg_class WHERE relrowsecurity AND oid IN ('public.assistant_chats'::regclass, 'public.assistant_chat_messages'::regclass)) = 2, 'structure : RLS active sur les 2 tables');
SELECT pg_temp.expect((SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('assistant_chats', 'assistant_chat_messages')) = 3, 'structure : exactement 3 règles (2 sur les chats, 1 sur les messages)');
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('assistant_chats', 'assistant_chat_messages') AND cmd NOT IN ('SELECT', 'DELETE')), 'structure : aucune règle INSERT / UPDATE / ALL pour les clients');
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('assistant_chats', 'assistant_chat_messages')
  AND (coalesce(qual, '') || coalesce(with_check, '')) ~* '(company|is_admin|support|role)'), 'structure : aucune règle ne regarde l''entreprise, le rôle admin ou le support (le filtre est sur l''auteur)');
SELECT pg_temp.expect(NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('assistant_chats', 'assistant_chat_messages')
  AND roles <> ARRAY['authenticated']::name[]), 'structure : toutes les règles sont réservées à authenticated');
SELECT pg_temp.expect(has_table_privilege('authenticated', 'public.assistant_chats', 'SELECT') AND has_table_privilege('authenticated', 'public.assistant_chats', 'DELETE'), 'droits : authenticated lit et supprime ses chats');
SELECT pg_temp.expect(NOT has_table_privilege('authenticated', 'public.assistant_chats', 'INSERT') AND NOT has_table_privilege('authenticated', 'public.assistant_chats', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.assistant_chats', 'TRUNCATE') AND NOT has_table_privilege('authenticated', 'public.assistant_chats', 'REFERENCES')
  AND NOT has_table_privilege('authenticated', 'public.assistant_chats', 'TRIGGER'), 'droits : authenticated n''écrit pas dans assistant_chats');
SELECT pg_temp.expect(has_table_privilege('authenticated', 'public.assistant_chat_messages', 'SELECT') AND NOT has_table_privilege('authenticated', 'public.assistant_chat_messages', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.assistant_chat_messages', 'UPDATE') AND NOT has_table_privilege('authenticated', 'public.assistant_chat_messages', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.assistant_chat_messages', 'TRUNCATE'), 'droits : authenticated lit seulement les messages');
SELECT pg_temp.expect(NOT has_table_privilege('anon', 'public.assistant_chats', 'SELECT') AND NOT has_table_privilege('anon', 'public.assistant_chat_messages', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.assistant_chats', 'INSERT') AND NOT has_table_privilege('anon', 'public.assistant_chat_messages', 'INSERT'), 'droits : anonyme n''a aucun accès');
SELECT pg_temp.expect(NOT has_table_privilege('service_role', 'public.assistant_chats', 'SELECT') AND NOT has_table_privilege('service_role', 'public.assistant_chat_messages', 'SELECT'), 'droits : même la clé de service ne lit pas les chats');
SELECT pg_temp.expect(NOT has_sequence_privilege('authenticated', 'public.assistant_chat_messages_id_seq', 'USAGE') AND NOT has_sequence_privilege('anon', 'public.assistant_chat_messages_id_seq', 'USAGE'), 'droits : la séquence des messages est fermée');
SELECT pg_temp.expect((SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prosecdef
    AND proname IN ('assistant_chat_append', 'assistant_chat_clear', 'purge_old_assistant_chats') AND proconfig @> ARRAY['search_path=""']) = 3, 'fonctions : 3 SECURITY DEFINER à search_path vide');
SELECT pg_temp.expect(has_function_privilege('authenticated', 'public.assistant_chat_append(uuid,text,text,jsonb)', 'EXECUTE') AND has_function_privilege('authenticated', 'public.assistant_chat_clear()', 'EXECUTE'), 'fonctions : authenticated peut appeler append et clear');
SELECT pg_temp.expect(NOT has_function_privilege('anon', 'public.assistant_chat_append(uuid,text,text,jsonb)', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.assistant_chat_clear()', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.assistant_chat_append(uuid,text,text,jsonb)', 'EXECUTE') AND NOT has_function_privilege('service_role', 'public.assistant_chat_clear()', 'EXECUTE'), 'fonctions : ni anonyme ni clé de service');
SELECT pg_temp.expect(NOT has_function_privilege('authenticated', 'public.purge_old_assistant_chats()', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.purge_old_assistant_chats()', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.purge_old_assistant_chats()', 'EXECUTE'), 'fonctions : la purge n''est appelable par aucun client');
-- Les 7 premières colonnes de la requête de vérification de l'en-tête de la migration (la 8e, le cron, a besoin de pg_cron).
SELECT pg_temp.expect(
  (SELECT count(*) FROM pg_class WHERE relrowsecurity AND oid IN ('public.assistant_chats'::regclass, 'public.assistant_chat_messages'::regclass)) = 2
  AND (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('assistant_chats', 'assistant_chat_messages')) = 3
  AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('assistant_chats', 'assistant_chat_messages') AND cmd NOT IN ('SELECT', 'DELETE'))
  AND has_table_privilege('authenticated', 'public.assistant_chats', 'SELECT') AND has_table_privilege('authenticated', 'public.assistant_chats', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.assistant_chats', 'INSERT') AND NOT has_table_privilege('authenticated', 'public.assistant_chats', 'UPDATE')
  AND has_table_privilege('authenticated', 'public.assistant_chat_messages', 'SELECT') AND NOT has_table_privilege('authenticated', 'public.assistant_chat_messages', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.assistant_chat_messages', 'UPDATE') AND NOT has_table_privilege('authenticated', 'public.assistant_chat_messages', 'DELETE')
  AND NOT has_table_privilege('anon', 'public.assistant_chats', 'SELECT') AND NOT has_table_privilege('anon', 'public.assistant_chat_messages', 'SELECT')
  AND NOT has_table_privilege('service_role', 'public.assistant_chats', 'SELECT') AND NOT has_table_privilege('service_role', 'public.assistant_chat_messages', 'SELECT')
  AND (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prosecdef AND proname IN ('assistant_chat_append', 'assistant_chat_clear', 'purge_old_assistant_chats') AND proconfig @> ARRAY['search_path=""']) = 3
  AND has_function_privilege('authenticated', 'public.assistant_chat_append(uuid,text,text,jsonb)', 'EXECUTE') AND has_function_privilege('authenticated', 'public.assistant_chat_clear()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.assistant_chat_append(uuid,text,text,jsonb)', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.assistant_chat_clear()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.purge_old_assistant_chats()', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.purge_old_assistant_chats()', 'EXECUTE'),
  'en-tête de la migration : la requête de vérification est vraie (hors cron)');

-- ═══ (e) Salarié 1 : le chat est créé avec le bon titre, puis on y ajoute ═══
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'w1', false);
SELECT public.assistant_chat_append(NULL,
  E'  Combien d''heures a fait Karim\n  cette semaine sur le chantier Dupont à Lyon, avec les pauses et les trajets ?  ',
  'Karim a fait 31 h 30 cette semaine.',
  '[{"label":"Voir les heures","action":"couts"}]') AS chat1 \gset
SELECT pg_temp.expect(:'chat1' IS NOT NULL, '(e) append sans chat : rend l''identifiant du nouveau chat');
SELECT pg_temp.expect((SELECT title FROM public.assistant_chats WHERE id = :'chat1') = 'Combien d''heures a fait Karim cette semaine sur le chantier',
  '(e) titre = début de la 1re question : espaces et retours réduits, 60 caractères coupés, espace final retiré');
SELECT pg_temp.expect((SELECT side FROM public.assistant_chats WHERE id = :'chat1') = 'salarie'
  AND (SELECT company_id FROM public.assistant_chats WHERE id = :'chat1') = :'coA'
  AND (SELECT user_id FROM public.assistant_chats WHERE id = :'chat1') = :'w1', '(e) côté, entreprise et auteur lus dans la session');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chat_messages WHERE chat_id = :'chat1') = 2, '(e) 2 messages ajoutés');
SELECT pg_temp.expect((SELECT array_agg(who ORDER BY id) FROM public.assistant_chat_messages WHERE chat_id = :'chat1') = ARRAY['me', 'bot'], '(e) la question (me) puis la réponse (bot)');
SELECT pg_temp.expect((SELECT text FROM public.assistant_chat_messages WHERE chat_id = :'chat1' AND who = 'me') = E'Combien d''heures a fait Karim\n  cette semaine sur le chantier Dupont à Lyon, avec les pauses et les trajets ?',
  '(e) la question est gardée telle quelle (seuls les blancs des bouts sont retirés)');
SELECT pg_temp.expect((SELECT links FROM public.assistant_chat_messages WHERE chat_id = :'chat1' AND who = 'bot') = '[{"label":"Voir les heures","action":"couts"}]'::jsonb
  AND (SELECT links FROM public.assistant_chat_messages WHERE chat_id = :'chat1' AND who = 'me') = '[]'::jsonb, '(e) les liens vont avec la réponse, pas avec la question');
SELECT (SELECT updated_at FROM public.assistant_chats WHERE id = :'chat1') AS maj1 \gset
SELECT public.assistant_chat_append(:'chat1', 'Et pour Lucas aussi ?', 'Lucas : 28 h.') AS chat1b \gset
SELECT pg_temp.expect(:'chat1b' = :'chat1', '(e) append sur un chat existant : même identifiant');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chat_messages WHERE chat_id = :'chat1') = 4, '(e) 4 messages après le 2e tour');
SELECT pg_temp.expect((SELECT array_agg(who ORDER BY id) FROM public.assistant_chat_messages WHERE chat_id = :'chat1') = ARRAY['me', 'bot', 'me', 'bot']
  AND (SELECT text FROM public.assistant_chat_messages WHERE chat_id = :'chat1' ORDER BY id DESC LIMIT 1) = 'Lucas : 28 h.', '(e) l''ordre d''arrivée est gardé');
SELECT pg_temp.expect((SELECT updated_at FROM public.assistant_chats WHERE id = :'chat1') > :'maj1'::timestamptz, '(e) updated_at avance à chaque tour');
SELECT pg_temp.expect((SELECT title FROM public.assistant_chats WHERE id = :'chat1') = 'Combien d''heures a fait Karim cette semaine sur le chantier', '(e) le titre ne change plus');
SELECT public.assistant_chat_append(NULL, 'Bonjour', 'Bonjour !') AS chat1_court \gset
SELECT pg_temp.expect((SELECT title FROM public.assistant_chats WHERE id = :'chat1_court') = 'Bonjour', '(e) titre : une question courte donne un titre court');
SELECT public.assistant_chat_append(NULL, repeat('é', 70), 'ok') AS chat1_acc \gset
SELECT pg_temp.expect((SELECT char_length(title) FROM public.assistant_chats WHERE id = :'chat1_acc') = 60, '(e) titre : 60 CARACTÈRES (accents compris), pas 60 octets');
SELECT public.assistant_chat_append(NULL, E'\n\n  \tAnnule ça\n', 'C''est annulé.', NULL) AS chat1_nul \gset
SELECT pg_temp.expect((SELECT title FROM public.assistant_chats WHERE id = :'chat1_nul') = 'Annule ça'
  AND (SELECT links FROM public.assistant_chat_messages WHERE chat_id = :'chat1_nul' AND who = 'bot') = '[]'::jsonb, '(e) titre : blancs de tête retirés ; liens NULL = aucun lien');

-- ═══ (a) Chacun ne lit QUE ses chats ═══
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats) = 4, '(a) salarié 1 : lit ses 4 chats');
SELECT set_config('request.jwt.claim.sub', :'w2', false);
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats) = 0 AND (SELECT count(*) FROM public.assistant_chat_messages) = 0, '(a) collègue : ne voit aucun chat ni message de salarié 1');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'chat1') = 0 AND (SELECT count(*) FROM public.assistant_chat_messages WHERE chat_id = :'chat1') = 0, '(a) collègue : même en connaissant l''identifiant, rien');
SELECT public.assistant_chat_append(NULL, 'Quand est mon prochain chantier ?', 'Demain à 8 h, chez Dupont.') AS chat2 \gset
SELECT public.assistant_chat_append(NULL, 'Puis-je poser un congé ?', 'Oui, depuis l''écran Congés.') AS chat2b \gset
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats) = 2 AND (SELECT count(*) FROM public.assistant_chat_messages) = 4, '(a) collègue : ne voit que ses 2 chats et leurs 4 messages');
SELECT set_config('request.jwt.claim.sub', :'w1', false);
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats) = 4 AND (SELECT count(*) FROM public.assistant_chats WHERE id IN (:'chat2', :'chat2b')) = 0, '(a) salarié 1 : toujours ses 4, pas ceux du collègue');

-- ═══ (b) L'administrateur de la MÊME entreprise ne lit pas le chat d'un salarié ═══
SELECT set_config('request.jwt.claim.sub', :'adminA', false);
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats) = 0 AND (SELECT count(*) FROM public.assistant_chat_messages) = 0, '(b) administrateur de la même entreprise : ne voit aucun chat de salarié');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'chat1') = 0 AND (SELECT count(*) FROM public.assistant_chat_messages WHERE chat_id = :'chat1') = 0, '(b) administrateur : même avec l''identifiant, ni le chat ni ses messages');
SELECT public.assistant_chat_append(NULL, 'Qui est en retard aujourd''hui ?', 'Personne pour l''instant.') AS chat_adm \gset
SELECT pg_temp.expect((SELECT side FROM public.assistant_chats WHERE id = :'chat_adm') = 'bureau', '(b) administrateur : son chat est côté bureau');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats) = 1, '(b) administrateur : voit SON chat seulement');
SELECT set_config('request.jwt.claim.sub', :'w1', false);
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'chat_adm') = 0, '(b) et le salarié ne voit pas le chat de l''administrateur');

-- ═══ (c) Une autre entreprise ne lit rien ═══
SELECT set_config('request.jwt.claim.sub', :'adminB', false);
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats) = 0 AND (SELECT count(*) FROM public.assistant_chat_messages) = 0, '(c) autre entreprise : ne voit rien');
SELECT set_config('request.jwt.claim.sub', :'adminC', false);
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats) = 0 AND (SELECT count(*) FROM public.assistant_chat_messages) = 0, '(c) entreprise sans IA : ne voit rien non plus');
-- Sans session : rien non plus (auth.uid() est NULL, aucune ligne n'a user_id NULL).
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats) = 0 AND (SELECT count(*) FROM public.assistant_chat_messages) = 0, '(c) sans session : ne voit rien');

-- ═══ (d) Aucun client n'écrit directement ═══
SELECT set_config('request.jwt.claim.sub', :'w1', false);
SELECT pg_temp.expect_state(format($f$INSERT INTO public.assistant_chats (id, user_id, company_id, side, title) VALUES (gen_random_uuid(), auth.uid(), %L, 'salarie', 'forgé')$f$, :'coA'), '42501', '(d) INSERT direct d''un chat : refusé');
SELECT pg_temp.expect_state(format($f$INSERT INTO public.assistant_chat_messages (chat_id, who, text) VALUES (%L, 'me', 'forgé')$f$, :'chat1'), '42501', '(d) INSERT direct d''un message : refusé');
SELECT pg_temp.expect_state($f$UPDATE public.assistant_chats SET title = 'maquillé'$f$, '42501', '(d) UPDATE direct d''un chat : refusé');
SELECT pg_temp.expect_state($f$UPDATE public.assistant_chat_messages SET text = 'maquillé'$f$, '42501', '(d) UPDATE direct d''un message : refusé');
SELECT pg_temp.expect_state($f$DELETE FROM public.assistant_chat_messages$f$, '42501', '(d) DELETE direct de messages : refusé (ils partent avec leur chat)');
SELECT pg_temp.expect_state($f$TRUNCATE public.assistant_chats$f$, '42501', '(d) TRUNCATE : refusé');
SELECT pg_temp.expect_state($f$SELECT nextval('public.assistant_chat_messages_id_seq')$f$, '42501', '(d) la séquence des messages : refusée');
SET ROLE anon;
SELECT pg_temp.expect_state($f$SELECT count(*) FROM public.assistant_chats$f$, '42501', '(d) anonyme : lecture refusée');
SELECT pg_temp.expect_state($f$SELECT public.assistant_chat_append(NULL, 'x', 'y')$f$, '42501', '(d) anonyme : append refusé');
SELECT pg_temp.expect_state($f$SELECT public.assistant_chat_clear()$f$, '42501', '(d) anonyme : clear refusé');
SET ROLE authenticated;
SELECT pg_temp.expect_state($f$SELECT public.purge_old_assistant_chats()$f$, '42501', '(d) un client ne peut pas lancer la purge');
-- Défense en profondeur : MÊME si un droit d'écriture était donné par erreur un jour, les règles (aucune règle
-- INSERT/UPDATE) refuseraient encore. On donne le droit dans une transaction, on essaie, puis on annule tout.
RESET ROLE;
BEGIN;
GRANT INSERT, UPDATE ON public.assistant_chats, public.assistant_chat_messages TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'w1', true);
SELECT pg_temp.expect_state(format($f$INSERT INTO public.assistant_chats (user_id, company_id, side, title) VALUES (auth.uid(), %L, 'salarie', 'forgé')$f$, :'coA'), '42501', '(d) même avec un droit INSERT donné par erreur : les règles refusent un chat');
SELECT pg_temp.expect_state(format($f$INSERT INTO public.assistant_chat_messages (chat_id, who, text) VALUES (%L, 'me', 'forgé')$f$, :'chat1'), '42501', '(d) même avec un droit INSERT donné par erreur : les règles refusent un message');
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.assistant_chats SET title = 'maquillé';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.expect(n = 0, '(d) même avec un droit UPDATE donné par erreur : aucun chat modifié');
  UPDATE public.assistant_chat_messages SET text = 'maquillé';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.expect(n = 0, '(d) même avec un droit UPDATE donné par erreur : aucun message modifié');
END $$;
ROLLBACK;
SELECT pg_temp.expect(NOT has_table_privilege('authenticated', 'public.assistant_chats', 'INSERT') AND NOT has_table_privilege('authenticated', 'public.assistant_chat_messages', 'UPDATE'), '(d) le droit donné pour l''essai a bien été annulé');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE title = 'maquillé' OR title = 'forgé') = 0, '(d) rien n''a été écrit pendant ces essais');

-- ═══ Suppression directe : SES chats seulement ═══
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'w2', false);
WITH d AS (DELETE FROM public.assistant_chats WHERE id = :'chat1' RETURNING 1) SELECT count(*) AS n_vol FROM d \gset
SELECT pg_temp.expect(:n_vol = 0, '(d) un salarié ne peut pas supprimer le chat d''un autre');
WITH d AS (DELETE FROM public.assistant_chats WHERE id = :'chat2b' RETURNING 1) SELECT count(*) AS n_mien FROM d \gset
SELECT pg_temp.expect(:n_mien = 1, '(d) un salarié supprime son propre chat');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats) = 1, '(d) il lui reste un chat');
RESET ROLE;
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chat_messages WHERE chat_id = :'chat2b') = 0, '(d) le chat supprimé a emporté ses messages');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chat_messages WHERE chat_id = :'chat1') = 4, '(d) les messages du chat d''un autre sont intacts');
SET ROLE authenticated;

-- ═══ (f) append sur le chat d'un autre = 42501, et rien n'est écrit ═══
SELECT set_config('request.jwt.claim.sub', :'w2', false);
SELECT pg_temp.expect_state(format($f$SELECT public.assistant_chat_append(%L, 'intrus', 'intrus')$f$, :'chat1'), '42501', '(f) salarié : append sur le chat d''un collègue refusé (42501)', 'intrus');
SELECT set_config('request.jwt.claim.sub', :'adminA', false);
SELECT pg_temp.expect_state(format($f$SELECT public.assistant_chat_append(%L, 'intrus', 'intrus')$f$, :'chat1'), '42501', '(f) administrateur de la même entreprise : append sur le chat d''un salarié refusé (42501)');
SELECT set_config('request.jwt.claim.sub', :'adminB', false);
SELECT pg_temp.expect_state(format($f$SELECT public.assistant_chat_append(%L, 'intrus', 'intrus')$f$, :'chat1'), '42501', '(f) autre entreprise : append refusé (42501)');
SELECT pg_temp.expect_state($f$SELECT public.assistant_chat_append('99999999-9999-9999-9999-999999999999', 'x', 'y')$f$, '42501', '(f) chat inexistant : même erreur 42501 (on ne révèle pas ce qui existe)');
RESET ROLE;
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chat_messages WHERE chat_id = :'chat1') = 4
  AND NOT EXISTS (SELECT 1 FROM public.assistant_chat_messages WHERE text = 'intrus'), '(f) aucun message écrit par ces essais');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats) = 6, '(f) aucun chat créé par ces essais non plus (6 chats en tout)');
SET ROLE authenticated;

-- ═══ (g) Entreprise sans IA, sans session, compte désactivé : refusés ═══
SELECT set_config('request.jwt.claim.sub', :'adminC', false);
SELECT pg_temp.expect_state($f$SELECT public.assistant_chat_append(NULL, 'Bonjour', 'Bonjour !')$f$, '42501', '(g) entreprise sans ai_enabled : refusée (42501)');
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT pg_temp.expect_state($f$SELECT public.assistant_chat_append(NULL, 'Bonjour', 'Bonjour !')$f$, '42501', '(g) sans session : append refusé (42501)');
SELECT pg_temp.expect_state($f$SELECT public.assistant_chat_clear()$f$, '42501', '(g) sans session : clear refusé (42501)');
SELECT set_config('request.jwt.claim.sub', :'w6', false);
SELECT pg_temp.expect_state($f$SELECT public.assistant_chat_append(NULL, 'Bonjour', 'Bonjour !')$f$, '42501', '(g) compte désactivé : refusé (42501)');
-- L'interrupteur coupé APRÈS coup : on ne peut plus écrire dans un chat existant, mais on peut toujours tout effacer.
SELECT set_config('request.jwt.claim.sub', :'wD', false);
SELECT public.assistant_chat_append(NULL, 'Bonjour', 'Bonjour !') AS chat_d \gset
RESET ROLE;
UPDATE public.companies SET ai_enabled = false WHERE id = :'coD';
SET ROLE authenticated;
SELECT pg_temp.expect_state(format($f$SELECT public.assistant_chat_append(%L, 'encore', 'encore')$f$, :'chat_d'), '42501', '(g) IA coupée pour l''entreprise : plus d''écriture, même dans un chat existant');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats) = 1, '(g) IA coupée : l''utilisateur relit encore son chat');
SELECT pg_temp.expect(public.assistant_chat_clear() = 1, '(g) IA coupée : l''utilisateur peut quand même tout effacer');
RESET ROLE;
UPDATE public.companies SET ai_enabled = true WHERE id = :'coD';
SET ROLE authenticated;

-- ═══ (m) Texte vide ou trop long refusé ; le texte n'apparaît jamais dans l'erreur ═══
SELECT set_config('request.jwt.claim.sub', :'w1', false);
SELECT count(*) AS n_chats_avant FROM public.assistant_chats \gset
SELECT pg_temp.expect_state($f$SELECT public.assistant_chat_append(NULL, '', 'réponse')$f$, '22023', '(m) question vide : refusée');
SELECT pg_temp.expect_state($f$SELECT public.assistant_chat_append(NULL, NULL, 'réponse')$f$, '22023', '(m) question NULL : refusée');
SELECT pg_temp.expect_state($f$SELECT public.assistant_chat_append(NULL, E' \n\t  ', 'réponse')$f$, '22023', '(m) question faite de blancs : refusée');
SELECT pg_temp.expect_state($f$SELECT public.assistant_chat_append(NULL, 'question', '')$f$, '22023', '(m) réponse vide : refusée');
SELECT pg_temp.expect_state($f$SELECT public.assistant_chat_append(NULL, 'question', NULL)$f$, '22023', '(m) réponse NULL : refusée');
SELECT pg_temp.expect_state($f$SELECT public.assistant_chat_append(NULL, 'question', E'\n  ')$f$, '22023', '(m) réponse faite de blancs : refusée');
SELECT pg_temp.expect_state($f$SELECT public.assistant_chat_append(NULL, repeat('SECRETQ', 600), 'réponse')$f$, '22023', '(m) question de 4200 caractères : refusée, texte absent de l''erreur', 'SECRETQ');
SELECT pg_temp.expect_state($f$SELECT public.assistant_chat_append(NULL, 'question', repeat('SECRETR', 600))$f$, '22023', '(m) réponse de 4200 caractères : refusée, texte absent de l''erreur', 'SECRETR');
SELECT pg_temp.expect_state($f$SELECT public.assistant_chat_append(NULL, repeat('a', 4001), 'réponse')$f$, '22023', '(m) 4001 caractères : refusé (frontière)');
SELECT pg_temp.expect_state($f$SELECT public.assistant_chat_append(NULL, 'question', repeat('b', 4001))$f$, '22023', '(m) réponse de 4001 caractères : refusée (frontière)');
SELECT pg_temp.expect_state($f$SELECT public.assistant_chat_append(NULL, 'question', 'réponse', '{"label":"x"}'::jsonb)$f$, '22023', '(m) liens : un objet au lieu d''un tableau, refusé');
SELECT pg_temp.expect_state($f$SELECT public.assistant_chat_append(NULL, 'question', 'réponse', '[1, 2]'::jsonb)$f$, '22023', '(m) liens : des éléments qui ne sont pas des objets, refusé');
SELECT pg_temp.expect_state($f$SELECT public.assistant_chat_append(NULL, 'question', 'réponse', '"texte"'::jsonb)$f$, '22023', '(m) liens : un texte, refusé');
SELECT pg_temp.expect_state($f$SELECT public.assistant_chat_append(NULL, 'question', 'réponse', (SELECT jsonb_agg(jsonb_build_object('label', 'l' || g, 'action', 'couts')) FROM generate_series(1, 11) g))$f$, '22023', '(m) liens : 11 liens, refusé (10 au plus)');
SELECT pg_temp.expect_state($f$SELECT public.assistant_chat_append(NULL, 'question', 'réponse', jsonb_build_array(jsonb_build_object('label', repeat('x', 5000), 'action', 'couts')))$f$, '22023', '(m) liens : plus de 4000 caractères, refusé');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats) = :n_chats_avant, '(m) aucun chat vide ni à moitié écrit après ces refus');
SELECT pg_temp.expect_state(format($f$SELECT public.assistant_chat_append(%L, '', 'réponse')$f$, :'chat1'), '22023', '(m) question vide sur un chat existant : refusée');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chat_messages WHERE chat_id = :'chat1') = 4, '(m) le chat existant n''a pas bougé');
SELECT public.assistant_chat_append(NULL, repeat('a', 4000), repeat('b', 4000)) AS chat_4000 \gset
SELECT pg_temp.expect((SELECT max(char_length(text)) FROM public.assistant_chat_messages WHERE chat_id = :'chat_4000') = 4000
  AND (SELECT title FROM public.assistant_chats WHERE id = :'chat_4000') = repeat('a', 60), '(m) 4000 caractères exactement : accepté ; le titre reste à 60');
-- Les CHECK des tables sont la seconde barrière (essai en propriétaire, qui contourne droits et règles).
RESET ROLE;
SELECT pg_temp.expect_state(format($f$INSERT INTO public.assistant_chat_messages (chat_id, who, text) VALUES (%L, 'me', '')$f$, :'chat1'), '23514', '(m) CHECK de la table : texte vide refusé');
SELECT pg_temp.expect_state(format($f$INSERT INTO public.assistant_chat_messages (chat_id, who, text) VALUES (%L, 'me', repeat('x', 4001))$f$, :'chat1'), '23514', '(m) CHECK de la table : 4001 caractères refusés');
SELECT pg_temp.expect_state(format($f$INSERT INTO public.assistant_chat_messages (chat_id, who, text) VALUES (%L, 'robot', 'x')$f$, :'chat1'), '23514', '(m) CHECK de la table : who hors de me/bot refusé');
SELECT pg_temp.expect_state(format($f$INSERT INTO public.assistant_chat_messages (chat_id, who, text, links) VALUES (%L, 'bot', 'x', '{}')$f$, :'chat1'), '23514', '(m) CHECK de la table : links doit être un tableau');
SELECT pg_temp.expect_state(format($f$INSERT INTO public.assistant_chats (user_id, company_id, side, title) VALUES (%L, %L, 'salarie', '')$f$, :'w1', :'coA'), '23514', '(m) CHECK de la table : titre vide refusé');
SELECT pg_temp.expect_state(format($f$INSERT INTO public.assistant_chats (user_id, company_id, side, title) VALUES (%L, %L, 'salarie', repeat('t', 81))$f$, :'w1', :'coA'), '23514', '(m) CHECK de la table : titre de 81 caractères refusé');
SELECT pg_temp.expect_state(format($f$INSERT INTO public.assistant_chats (user_id, company_id, side, title) VALUES (%L, %L, 'patron', 'x')$f$, :'w1', :'coA'), '23514', '(m) CHECK de la table : côté hors de bureau/salarie refusé');
SELECT pg_temp.expect_state(format($f$INSERT INTO public.assistant_chats (user_id, company_id, side, title) VALUES (%L, %L, 'salarie', 'x')$f$, '99999999-0000-0000-0000-000000000000', :'coA'), '23503', '(m) clé étrangère : un chat ne peut pas appartenir à un utilisateur inconnu');
SET ROLE authenticated;

-- ═══ (h) 200 messages par chat : le 201e est refusé ═══
SELECT set_config('request.jwt.claim.sub', :'w5', false);
SELECT public.assistant_chat_append(NULL, 'Question 1', 'Réponse 1') AS chat_h \gset
SELECT count(public.assistant_chat_append(:'chat_h', 'Question ' || g, 'Réponse ' || g)) AS n_tours FROM generate_series(2, 100) g \gset
SELECT pg_temp.expect(:n_tours = 99, '(h) 100 tours au total : acceptés');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chat_messages WHERE chat_id = :'chat_h') = 200, '(h) le chat contient exactement 200 messages');
SELECT updated_at AS maj_h FROM public.assistant_chats WHERE id = :'chat_h' \gset
SELECT pg_temp.expect_state(format($f$SELECT public.assistant_chat_append(%L, 'SECRETH', 'SECRETH')$f$, :'chat_h'), '54000', '(h) le 201e message est refusé (54000), texte absent de l''erreur', 'SECRETH');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chat_messages WHERE chat_id = :'chat_h') = 200
  AND (SELECT updated_at FROM public.assistant_chats WHERE id = :'chat_h') = :'maj_h'::timestamptz, '(h) rien n''a été écrit : toujours 200 messages, updated_at inchangé');
SELECT pg_temp.expect(public.assistant_chat_append(NULL, 'Nouvelle question', 'Nouvelle réponse') IS NOT NULL, '(h) un NOUVEAU chat s''ouvre sans problème (la limite est par chat)');

-- ═══ (i) 100 chats par utilisateur : le 101e supprime le moins récemment utilisé ═══
SELECT set_config('request.jwt.claim.sub', :'w4', false);
SELECT count(public.assistant_chat_append(NULL, 'Chat ' || g, 'ok')) AS n_cree FROM generate_series(1, 100) g \gset
SELECT pg_temp.expect(:n_cree = 100 AND (SELECT count(*) FROM public.assistant_chats) = 100, '(i) 100 chats ouverts : tous gardés');
RESET ROLE;
-- « Chat 1 » devient le plus ancien, « Chat 100 » le plus récent.
UPDATE public.assistant_chats SET updated_at = now() - ((101 - substring(title from '(\d+)$')::int) * interval '1 minute') WHERE user_id = :'w4';
SELECT id AS c_un FROM public.assistant_chats WHERE user_id = :'w4' AND title = 'Chat 1' \gset
SELECT id AS c_deux FROM public.assistant_chats WHERE user_id = :'w4' AND title = 'Chat 2' \gset
SELECT count(*) AS n_chats_w1 FROM public.assistant_chats WHERE user_id = :'w1' \gset
SET ROLE authenticated;
-- On relance « Chat 1 » : il devient le plus récent, c'est donc « Chat 2 » qui est maintenant le plus ancien.
SELECT public.assistant_chat_append(:'c_un', 'relance', 'ok') AS x \gset
SELECT public.assistant_chat_append(NULL, 'Chat 101', 'ok') AS c_cent_un \gset
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats) = 100, '(i) le 101e chat : toujours 100 chats');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'c_deux') = 0, '(i) le moins récemment utilisé (Chat 2) a été supprimé');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'c_un') = 1, '(i) un vieux chat relancé récemment est GARDÉ (on compte la dernière activité, pas la création)');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'c_cent_un') = 1, '(i) le chat qu''on vient d''ouvrir est bien là');
RESET ROLE;
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chat_messages WHERE chat_id = :'c_deux') = 0, '(i) les messages du chat supprimé sont partis avec lui');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE user_id = :'w1') = :n_chats_w1, '(i) les chats des autres utilisateurs n''ont pas bougé');
SET ROLE authenticated;

-- ═══ (j) clear ne supprime que MES chats ═══
SELECT set_config('request.jwt.claim.sub', :'w2', false);
SELECT public.assistant_chat_append(NULL, 'Un autre chat', 'Voilà.') AS x \gset
SELECT count(*) AS n_w2 FROM public.assistant_chats \gset
SELECT pg_temp.expect(:n_w2 = 2, '(j) avant : le collègue a 2 chats');
RESET ROLE;
SELECT count(*) AS n_total_avant FROM public.assistant_chats \gset
SELECT count(*) AS n_msg_total_avant FROM public.assistant_chat_messages \gset
SET ROLE authenticated;
SELECT public.assistant_chat_clear() AS n_efface \gset
SELECT pg_temp.expect(:n_efface = 2, '(j) clear rend le nombre de chats supprimés (2)');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats) = 0, '(j) le collègue n''a plus aucun chat');
SELECT pg_temp.expect(public.assistant_chat_clear() = 0, '(j) clear une 2e fois : 0');
RESET ROLE;
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats) = :n_total_avant - 2, '(j) tous les autres chats sont intacts (seuls les 2 du collègue sont partis)');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chat_messages) = :n_msg_total_avant - 4, '(j) leurs messages sont partis, ceux des autres sont intacts');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE user_id IN (:'w1', :'adminA', :'w4', :'w5')) > 100, '(j) w1, administrateur, w4 et w5 ont toujours leurs chats');
SET ROLE authenticated;

-- ═══ (k) La purge : un chat vieux de 31 jours part, celui de 29 jours reste ═══
SELECT set_config('request.jwt.claim.sub', :'adminB', false);
SELECT public.assistant_chat_append(NULL, 'Vieux chat', 'Réponse ancienne') AS c_vieux \gset
SELECT public.assistant_chat_append(NULL, 'Chat récent', 'Réponse récente') AS c_recent \gset
RESET ROLE;
UPDATE public.assistant_chats SET updated_at = now() - interval '31 days' WHERE id = :'c_vieux';
UPDATE public.assistant_chats SET updated_at = now() - interval '29 days' WHERE id = :'c_recent';
SELECT public.purge_old_assistant_chats() AS n_purge \gset
SELECT pg_temp.expect(:n_purge = 1, '(k) la purge supprime 1 chat (rend 1)');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'c_vieux') = 0 AND (SELECT count(*) FROM public.assistant_chat_messages WHERE chat_id = :'c_vieux') = 0, '(k) le chat de 31 jours est supprimé avec ses messages');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'c_recent') = 1 AND (SELECT count(*) FROM public.assistant_chat_messages WHERE chat_id = :'c_recent') = 2, '(k) le chat de 29 jours est gardé avec ses messages');
-- 30 jours « après la dernière activité » : un vieux chat où l'on écrit à nouveau n'est pas purgé.
UPDATE public.assistant_chats SET updated_at = now() - interval '40 days' WHERE id = :'c_recent';
SET ROLE authenticated;
SELECT public.assistant_chat_append(:'c_recent', 'Je reviens', 'Content de vous revoir.') AS x \gset
RESET ROLE;
SELECT pg_temp.expect(public.purge_old_assistant_chats() = 0, '(k) un chat de 40 jours relancé aujourd''hui n''est PAS purgé (on compte depuis la dernière activité)');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'c_recent') = 1, '(k) il est toujours là');
UPDATE public.assistant_chats SET updated_at = now() - interval '30 days 1 minute' WHERE id = :'c_recent';
SELECT pg_temp.expect(public.purge_old_assistant_chats() = 1, '(k) juste au-delà de 30 jours : purgé');

-- ═══ (l) Supprimer un utilisateur ou une entreprise supprime ses chats (cascade) ═══
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'w3', false);
SELECT public.assistant_chat_append(NULL, 'Chat du salarié supprimé', 'ok') AS c_w3 \gset
SELECT set_config('request.jwt.claim.sub', :'wD', false);
SELECT public.assistant_chat_append(NULL, 'Chat de l''entreprise supprimée', 'ok') AS c_cod \gset
RESET ROLE;
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id IN (:'c_w3', :'c_cod')) = 2 AND (SELECT count(*) FROM public.assistant_chat_messages WHERE chat_id IN (:'c_w3', :'c_cod')) = 4, '(l) avant : les 2 chats et leurs 4 messages existent');
DELETE FROM public.users WHERE id = :'w3';
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'c_w3') = 0 AND (SELECT count(*) FROM public.assistant_chat_messages WHERE chat_id = :'c_w3') = 0, '(l) utilisateur supprimé : ses chats et leurs messages partent');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'c_cod') = 1, '(l) les chats des autres utilisateurs ne bougent pas');
DELETE FROM public.companies WHERE id = :'coD';
SELECT pg_temp.expect((SELECT count(*) FROM public.users WHERE id = :'wD') = 1, '(l) (le salarié de l''entreprise supprimée existe toujours : ce sont bien les chats qui suivent l''entreprise)');
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats WHERE id = :'c_cod') = 0 AND (SELECT count(*) FROM public.assistant_chat_messages WHERE chat_id = :'c_cod') = 0, '(l) entreprise supprimée : ses chats et leurs messages partent');

-- ═══ Rejouable : la migration peut être collée une 2e fois, sans erreur ni perte ═══
SELECT count(*) AS n_chats_av, (SELECT count(*) FROM public.assistant_chat_messages) AS n_msg_av FROM public.assistant_chats \gset
\i supabase/migrations/20261014090000_ia_etape2_chats.sql
SELECT pg_temp.expect((SELECT count(*) FROM public.assistant_chats) = :n_chats_av AND (SELECT count(*) FROM public.assistant_chat_messages) = :n_msg_av, 'rejeu : la migration rejouée ne touche à aucune donnée');
SELECT pg_temp.expect((SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('assistant_chats', 'assistant_chat_messages')) = 3
  AND NOT has_table_privilege('authenticated', 'public.assistant_chats', 'INSERT') AND has_table_privilege('authenticated', 'public.assistant_chats', 'DELETE'), 'rejeu : toujours 3 règles et les mêmes droits');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'w1', false);
SELECT pg_temp.expect(public.assistant_chat_append(NULL, 'Après le rejeu', 'Ça marche.') IS NOT NULL, 'rejeu : append fonctionne encore');
RESET ROLE;

-- ═══ (n) Information des personnes : la politique de confidentialité dit la vérité ═══
-- Dès que cette migration est appliquée et que l'écran enregistre, le TEXTE des questions et des réponses est gardé
-- 30 jours. La page app/confidentialite/page.tsx (section 14, ligne « Ce que BEMEXO conserve ») ne doit plus affirmer
-- « ni votre question, ni la réponse » (RGPD art. 13 : l'information donnée aux personnes doit être exacte). Cette
-- section lit des fichiers du dépôt (le test se lance depuis la racine, voir l'en-tête) et passe EN DERNIER : si elle
-- échoue, tout ce qui précède a déjà passé. La page se corrige dans la même mise en ligne que le front (docs/ia-vision.md §6.1).
\set migration_txt `cat supabase/migrations/20261014090000_ia_etape2_chats.sql 2>/dev/null`
\set vision_txt `cat docs/ia-vision.md 2>/dev/null`
\set page_txt `cat app/confidentialite/page.tsx 2>/dev/null`

-- Texte « à plat » d'un fichier de page : commentaires JSX retirés, balises retirées, &apos; en apostrophe, blancs réduits.
CREATE FUNCTION pg_temp.a_plat(brut text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(regexp_replace(
    replace(replace(
      regexp_replace(regexp_replace(coalesce(brut, ''), '\{/\*.*?\*/\}', ' ', 'g'), '<[^>]*>', ' ', 'g'),
      '&apos;', chr(39)), '&nbsp;', ' '),
    '\s+', ' ', 'g'))
$$;

-- (n1) Le correctif est tracé là où Ergun le lira : l'en-tête de la migration (liste « à mettre en ligne avec la
-- migration ») et le document de décision (liste + texte de la ligne + fiche du registre des traitements).
SELECT pg_temp.expect(length(:'migration_txt') > 1000, '(n) fichiers lus (test lancé depuis la racine du dépôt)');
SELECT pg_temp.expect(position('À METTRE EN LIGNE AVEC CETTE MIGRATION' in :'migration_txt') > 0
  AND position('app/confidentialite/page.tsx' in :'migration_txt') > 0
  AND position('registre des traitements' in :'migration_txt') > 0, '(n) l''en-tête de la migration met la page Confidentialité et le registre dans la liste « à mettre en ligne avec la migration »');
SELECT pg_temp.expect(position('### 6.1 À mettre en ligne avec la migration' in :'vision_txt') > 0
  AND position('app/confidentialite/page.tsx' in :'vision_txt') > 0
  AND position('jamais après' in :'vision_txt') > 0, '(n) docs/ia-vision.md §6.1 : la page Confidentialité est dans la liste, avec le front, jamais après');
SELECT pg_temp.expect(position('### 6.2 Information des personnes' in :'vision_txt') > 0
  AND position('Fiche pour le registre des traitements' in :'vision_txt') > 0
  AND position('30 jours après la dernière activité' in :'vision_txt') > 0, '(n) docs/ia-vision.md §6.2 : le texte de la ligne et la fiche du registre des traitements (30 jours après la dernière activité)');

-- (n2) La durée annoncée est celle que la purge applique : on la lit dans la fonction (son comportement exact à
-- 29 / 31 jours est déjà prouvé en (k)), puis on exige la même durée dans la page.
SELECT coalesce(substring(pg_get_functiondef('public.purge_old_assistant_chats()'::regprocedure) from 'interval ''(\d+) days'''), '') AS jours_purge \gset
SELECT pg_temp.expect(:'jours_purge' = '30', '(n) la purge de la base supprime après 30 jours (la durée que la page doit annoncer)');

-- (n3) LA PAGE. Les contrôles sont volontairement larges sur la formulation : ils exigent la vérité, pas des mots précis.
SELECT pg_temp.a_plat(:'page_txt') AS page_plat \gset
SELECT coalesce(substring(:'page_plat' from '14\. L''assistant BEMEXO.*?15\. Contact'), '') AS section14 \gset
SELECT pg_temp.expect(length(:'page_plat') > 2000, '(n) la page Confidentialité est lisible (app/confidentialite/page.tsx)');
SELECT pg_temp.expect(length(:'section14') > 500, '(n) la section 14 « L''assistant BEMEXO » existe dans la page');
SELECT pg_temp.expect(position('ni votre question' in :'page_plat') = 0,
  '(n) la page n''affirme plus « ni votre question, ni la réponse » : le texte des conversations EST conservé');
SELECT pg_temp.expect(:'section14' ~ ('conserv[^.]{0,250}' || :'jours_purge' || ' jours|' || :'jours_purge' || ' jours[^.]{0,250}conserv'),
  '(n) la page dit que le texte est conservé pendant la durée de la purge (30 jours)');
SELECT pg_temp.expect(position('dernière activité' in :'section14') > 0,
  '(n) la page précise que les 30 jours courent depuis la dernière activité (un chat où l''on écrit encore reste)');
SELECT pg_temp.expect(:'section14' ~ '(visible|lisible|accessible|consultable)[^.]{0,120}(seul|uniquement|exclusivement)|(seul|uniquement|exclusivement)[^.]{0,120}(visible|lisible|accessible|consultable)',
  '(n) la page dit que la conversation n''est visible que de son auteur');
SELECT pg_temp.expect(:'section14' ~ '(pouvez|peut|possibilité|droit)[^.]{0,120}(effa[cç]|supprim)|(effa[cç]|supprim)[^.]{0,80}(à tout moment|à tout instant|quand vous)|effa[cç]able',
  '(n) la page dit que l''utilisateur peut effacer ses conversations quand il veut (et pas seulement « supprimé automatiquement »)');
SELECT pg_temp.expect(:'section14' ~ 'pièces jointes',
  '(n) la page parle toujours des pièces jointes (jamais conservées)');
