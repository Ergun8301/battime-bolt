-- ═════════════════════════════════════════════════════════════════════════════
-- IA ÉTAPE 2 (oct. 2026) — L'ASSISTANT DEVIENT UN CHAT : HISTORIQUE PRIVÉ
-- ═════════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE (à coller tel quel si besoin ; rien d'autre n'est touché) :
--   SELECT cron.unschedule('bemexo-purge-assistant-chats')
--    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bemexo-purge-assistant-chats');
--   DROP FUNCTION IF EXISTS public.purge_old_assistant_chats();
--   DROP FUNCTION IF EXISTS public.assistant_chat_clear();
--   DROP FUNCTION IF EXISTS public.assistant_chat_append(uuid, text, text, jsonb);
--   DROP TABLE IF EXISTS public.assistant_chat_messages;   -- EFFACE tous les chats enregistrés
--   DROP TABLE IF EXISTS public.assistant_chats;           -- (l'assistant, lui, continue de répondre)
-- … puis, seulement si le fichier avait été inscrit dans l'historique (c'est un
-- DELETE, sur l'historique uniquement, à coller par Ergun) :
--   DELETE FROM supabase_migrations.schema_migrations WHERE name = 'ia_etape2_chats';
--
-- VÉRIFICATION APRÈS APPLICATION (doit renvoyer 8 × true) :
--   SELECT
--     (SELECT count(*) FROM pg_class WHERE relrowsecurity AND oid IN
--        ('public.assistant_chats'::regclass, 'public.assistant_chat_messages'::regclass)) = 2   AS rls,
--     (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
--        AND tablename IN ('assistant_chats', 'assistant_chat_messages')) = 3
--     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
--        AND tablename IN ('assistant_chats', 'assistant_chat_messages')
--        AND cmd NOT IN ('SELECT', 'DELETE'))                                                    AS regles,
--     has_table_privilege('authenticated', 'public.assistant_chats', 'SELECT')
--     AND has_table_privilege('authenticated', 'public.assistant_chats', 'DELETE')
--     AND NOT has_table_privilege('authenticated', 'public.assistant_chats', 'INSERT')
--     AND NOT has_table_privilege('authenticated', 'public.assistant_chats', 'UPDATE')
--     AND has_table_privilege('authenticated', 'public.assistant_chat_messages', 'SELECT')
--     AND NOT has_table_privilege('authenticated', 'public.assistant_chat_messages', 'INSERT')
--     AND NOT has_table_privilege('authenticated', 'public.assistant_chat_messages', 'UPDATE')
--     AND NOT has_table_privilege('authenticated', 'public.assistant_chat_messages', 'DELETE')  AS droits_clients,
--     NOT has_table_privilege('anon', 'public.assistant_chats', 'SELECT')
--     AND NOT has_table_privilege('anon', 'public.assistant_chat_messages', 'SELECT')
--     AND NOT has_table_privilege('service_role', 'public.assistant_chats', 'SELECT')
--     AND NOT has_table_privilege('service_role', 'public.assistant_chat_messages', 'SELECT')   AS pas_anon_ni_cle_service,
--     (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prosecdef
--        AND proname IN ('assistant_chat_append', 'assistant_chat_clear', 'purge_old_assistant_chats')
--        AND proconfig @> ARRAY['search_path=""']) = 3                                          AS fonctions,
--     has_function_privilege('authenticated', 'public.assistant_chat_append(uuid,text,text,jsonb)', 'EXECUTE')
--     AND has_function_privilege('authenticated', 'public.assistant_chat_clear()', 'EXECUTE')
--     AND NOT has_function_privilege('anon', 'public.assistant_chat_append(uuid,text,text,jsonb)', 'EXECUTE')
--     AND NOT has_function_privilege('anon', 'public.assistant_chat_clear()', 'EXECUTE')        AS droits_fonctions,
--     NOT has_function_privilege('authenticated', 'public.purge_old_assistant_chats()', 'EXECUTE')
--     AND NOT has_function_privilege('anon', 'public.purge_old_assistant_chats()', 'EXECUTE')   AS purge_fermee,
--     EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bemexo-purge-assistant-chats'
--             AND schedule = '45 3 * * *')                                                      AS cron;
--
-- HISTORIQUE : si le fichier est collé dans l'éditeur SQL, inscrire ensuite :
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261014090000', 'ia_etape2_chats') ON CONFLICT DO NOTHING;
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI : l'assistant (bureau et salarié) devient un vrai chat, avec une
-- mémoire de conversation. L'écran se souvient du sujet (« et pour Lucas aussi ? ») en
-- renvoyant les derniers messages au serveur ; ce fichier ajoute ce qu'il faut
-- pour RETROUVER ses conversations : « Nouveau chat », un historique, un titre.
--
-- CE QUI EST DÉCIDÉ (docs/ia-vision.md §6, 14 oct. 2026) :
--   · PRIVÉ PAR UTILISATEUR. Le filtre est sur l'AUTEUR (user_id = auth.uid()),
--     jamais sur l'entreprise : ni le patron, ni un administrateur de la même
--     entreprise, ni le support BEMEXO ne lisent le chat d'un salarié. Il n'y a
--     donc AUCUNE règle « support_read », « is_admin() » ou « même entreprise »
--     sur ces deux tables, et la clé de service n'y a pas accès non plus (un
--     code qui l'utiliserait par erreur ne pourrait pas lire un chat). Seul le
--     propriétaire de la base (éditeur SQL) garde, comme pour toute table, un
--     accès technique : aucune règle ne peut l'en empêcher.
--   · TEXTE SEUL. Jamais une pièce jointe, jamais une carte d'action, jamais un
--     message d'erreur ou de quota : un ancien chat rouvert montre du texte.
--   · 30 JOURS APRÈS LA DERNIÈRE ACTIVITÉ, puis suppression automatique (§ 5).
--     Un chat où l'on écrit encore ne disparaît pas. L'utilisateur peut aussi
--     supprimer un chat, ou tout effacer, quand il veut.
--   · TITRE AUTOMATIQUE = début de la première question (60 caractères, espaces
--     réduits). Aucun appel IA en plus : pas de coût, pas de fuite supplémentaire.
--   · BORNES : 200 messages par chat, 100 chats par utilisateur (les moins
--     récemment utilisés partent), 4000 caractères par message.
--
-- COMMENT ON ÉCRIT : les clients n'ont AUCUN droit d'écriture sur les tables
-- (ni INSERT, ni UPDATE, et aucune règle d'écriture). Tout passe par
-- assistant_chat_append, qui lit l'auteur, l'entreprise et le côté dans la
-- SESSION et ne fait confiance à aucun paramètre pour cela.
--
-- LE CONTENU N'APPARAÎT JAMAIS DANS UNE ERREUR NI UN JOURNAL. Piège connu de
-- Postgres : quand un CHECK échoue à l'insertion, le DETAIL de l'erreur recopie
-- la ligne entière, donc le texte du chat, et les journaux de la base le
-- gardent. La fonction vérifie donc tout AVANT d'insérer (les CHECK des tables
-- ne sont qu'une seconde barrière) et ses messages d'erreur sont fixes.
--
-- 100 % ADDITIVE : deux tables neuves, trois fonctions neuves, un travail cron
-- neuf. Aucune table, colonne, règle, trigger ou fonction existante n'est
-- modifiée (assistant_journal et assistant_actions ne bougent pas). Aucune
-- donnée existante n'est touchée à l'application. Rejouable (IF NOT EXISTS,
-- OR REPLACE, DROP POLICY IF EXISTS sur NOS règles ; le cron est re-planifié
-- sous le même nom).
--
-- À SAVOIR (règle « DROP ou DELETE ») : DROP POLICY IF EXISTS apparaît 3 fois,
-- uniquement sur les règles de CES deux tables neuves (pour pouvoir rejouer le
-- fichier). DELETE apparaît dans 3 fonctions (plafond de 100 chats, « tout
-- effacer », purge de 30 jours) : aucune ne s'exécute à l'application du
-- fichier, seulement quand un utilisateur ou le cron les appelle, et chacune
-- ne touche que des chats (jamais une autre table). ON DELETE CASCADE apparaît
-- 3 fois (entreprise supprimée, salarié supprimé, chat supprimé : leurs chats
-- ou leurs messages suivent, c'est voulu).
--
-- Testée sur un Postgres jetable : npm run test:assistant-chats-rls
-- (supabase/tests/ia_etape2_chats.sql).
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 1 · LES TABLES
-- ═════════════════════════════════════════════════════════════════════════════

-- Un chat. `user_id` suit public.users : un salarié supprimé emporte ses chats.
-- `company_id` ne sert PAS à filtrer la lecture (voir plus haut) : il sert à
-- l'interrupteur ai_enabled et à emporter les chats avec l'entreprise supprimée.
CREATE TABLE IF NOT EXISTS public.assistant_chats (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE CASCADE,
  company_id uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  side       text        NOT NULL CHECK (side IN ('bureau', 'salarie')),
  title      text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- La liste de l'écran (50 plus récents d'un utilisateur) et le plafond de 100.
CREATE INDEX IF NOT EXISTS assistant_chats_user_recent ON public.assistant_chats (user_id, updated_at DESC);
-- Suppression d'une entreprise : retrouver ses chats sans parcourir la table.
CREATE INDEX IF NOT EXISTS assistant_chats_company ON public.assistant_chats (company_id);

-- Les messages d'un chat, dans l'ordre d'arrivée (`id` croît : on trie dessus).
-- `links` : les liens de navigation de la réponse (jamais une carte d'action).
CREATE TABLE IF NOT EXISTS public.assistant_chat_messages (
  id      bigserial   PRIMARY KEY,
  chat_id uuid        NOT NULL REFERENCES public.assistant_chats(id) ON DELETE CASCADE,
  who     text        NOT NULL CHECK (who IN ('me', 'bot')),
  text    text        NOT NULL CHECK (char_length(text) BETWEEN 1 AND 4000),
  links   jsonb       NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(links) = 'array'),
  at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assistant_chat_messages_chat ON public.assistant_chat_messages (chat_id, id);

COMMENT ON TABLE public.assistant_chats IS
  'Chats de l''assistant. PRIVÉS : lisibles par leur seul auteur (user_id = auth.uid()), ni employeur ni support. Écriture par assistant_chat_append seulement. Purge à 30 jours d''inactivité.';
COMMENT ON TABLE public.assistant_chat_messages IS
  'Messages (texte seul) des chats de l''assistant. Mêmes règles que assistant_chats : visibles du seul auteur du chat.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 2 · DROITS ET RÈGLES (RLS)
-- ═════════════════════════════════════════════════════════════════════════════
-- Lecture et suppression : SES chats, et c'est tout. Pas de règle INSERT/UPDATE :
-- même si un droit d'écriture était donné par erreur un jour, la base refuserait.
-- Les messages n'ont ni DELETE ni écriture pour les clients : ils partent avec
-- leur chat (la cascade s'exécute avec les droits du propriétaire des tables).
-- (SELECT auth.uid()) : évalué une fois par requête, pas une fois par ligne
-- (même écriture que le lot 29).
ALTER TABLE public.assistant_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_chat_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.assistant_chats FROM anon, authenticated, service_role;
GRANT SELECT, DELETE ON public.assistant_chats TO authenticated;

REVOKE ALL ON public.assistant_chat_messages FROM anon, authenticated, service_role;
GRANT SELECT ON public.assistant_chat_messages TO authenticated;

-- La séquence des messages : personne côté client n'a de raison d'y toucher.
REVOKE ALL ON SEQUENCE public.assistant_chat_messages_id_seq FROM anon, authenticated, service_role;

DROP POLICY IF EXISTS assistant_chats_own_select ON public.assistant_chats;
CREATE POLICY assistant_chats_own_select ON public.assistant_chats
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS assistant_chats_own_delete ON public.assistant_chats;
CREATE POLICY assistant_chats_own_delete ON public.assistant_chats
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Un message se lit si le chat qui le porte est le mien.
DROP POLICY IF EXISTS assistant_chat_messages_own_select ON public.assistant_chat_messages;
CREATE POLICY assistant_chat_messages_own_select ON public.assistant_chat_messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assistant_chats c
                  WHERE c.id = assistant_chat_messages.chat_id AND c.user_id = (SELECT auth.uid())));

-- ═════════════════════════════════════════════════════════════════════════════
-- 3 · SEUL CHEMIN D'ÉCRITURE : assistant_chat_append
-- ═════════════════════════════════════════════════════════════════════════════
-- Ajoute un TOUR complet (la question, puis la réponse) à un chat, ou ouvre un
-- chat (p_chat_id NULL). Rend l'identifiant du chat.
--   · même garde que assistant_journal_log : session valide + entreprise
--     ai_enabled (sinon 42501) ;
--   · auteur, entreprise et côté (bureau/salarié) viennent de la SESSION ;
--   · un chat qui n'est pas le mien, ou qui n'existe pas, donne la MÊME erreur
--     42501 (on ne révèle pas qu'il existe) ;
--   · 200 messages au plus par chat (54000, message clair) ; 100 chats au plus
--     par utilisateur : à l'ouverture du 101e, le moins récemment utilisé part ;
--   · texte vide ou de plus de 4000 caractères : refusé (22023), jamais coupé
--     en silence ; liens : un tableau de 10 objets au plus, 4000 caractères.
-- SECURITY DEFINER, search_path vide, tout est qualifié, aucun SQL dynamique.
CREATE OR REPLACE FUNCTION public.assistant_chat_append(
  p_chat_id uuid, p_user_text text, p_bot_text text, p_links jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  c_max_messages CONSTANT integer := 200;
  c_max_chats    CONSTANT integer := 100;
  c_max_texte    CONSTANT integer := 4000;
  -- Espace, tabulation, retours à la ligne, saut de page, tabulation verticale, espace insécable.
  c_blancs       CONSTANT text := E' \t\r\n\f' || chr(11) || chr(160);
  v_uid     uuid := auth.uid();
  v_company uuid := public.get_my_company_id();
  v_user    text;
  v_bot     text;
  v_links   jsonb := coalesce(p_links, '[]'::jsonb);
  v_links_ok boolean;
  v_title   text;
  v_chat    uuid;
  v_n       integer;
BEGIN
  IF v_uid IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Session invalide.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = v_company AND ai_enabled) THEN
    RAISE EXCEPTION 'Assistant non activé.' USING ERRCODE = '42501';
  END IF;

  -- Tout est vérifié AVANT d'écrire (voir l'en-tête : un CHECK qui échoue
  -- recopierait le texte dans l'erreur). Les messages ne citent jamais le texte.
  -- btrim avec une liste de caractères : linéaire (pas d'expression régulière
  -- ancrée sur un texte que l'on ne maîtrise pas).
  v_user := btrim(p_user_text, c_blancs);
  v_bot  := btrim(p_bot_text, c_blancs);
  IF coalesce(char_length(v_user), 0) NOT BETWEEN 1 AND c_max_texte THEN
    RAISE EXCEPTION 'Question vide ou trop longue (1 à 4000 caractères).' USING ERRCODE = '22023';
  END IF;
  IF coalesce(char_length(v_bot), 0) NOT BETWEEN 1 AND c_max_texte THEN
    RAISE EXCEPTION 'Réponse vide ou trop longue (1 à 4000 caractères).' USING ERRCODE = '22023';
  END IF;
  v_links_ok := jsonb_typeof(v_links) = 'array';
  IF v_links_ok THEN
    v_links_ok := jsonb_array_length(v_links) <= 10
      AND char_length(v_links::text) <= 4000
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_links) AS e WHERE jsonb_typeof(e) <> 'object');
  END IF;
  IF NOT v_links_ok THEN
    RAISE EXCEPTION 'Liens invalides.' USING ERRCODE = '22023';
  END IF;

  -- Un appel à la fois par utilisateur : les plafonds (200 messages, 100 chats)
  -- tiennent même si deux onglets écrivent en même temps.
  PERFORM pg_advisory_xact_lock(hashtextextended('assistant_chat:' || v_uid::text, 0));

  IF p_chat_id IS NULL THEN
    -- Titre = début de la première question, espaces réduits, 60 caractères.
    -- Le texte est déjà borné à 4000 caractères : la réduction reste bornée.
    v_title := btrim(left(regexp_replace(v_user, '\s+', ' ', 'g'), 60));
    IF v_title = '' THEN
      v_title := 'Conversation';
    END IF;
    INSERT INTO public.assistant_chats (user_id, company_id, side, title)
    VALUES (v_uid, v_company, CASE WHEN public.is_admin() THEN 'bureau' ELSE 'salarie' END, v_title)
    RETURNING id INTO v_chat;
    -- 100 chats au plus : on garde les 99 autres les plus récemment utilisés
    -- (+ celui-ci), les moins récents partent avec leurs messages. Le chat qu'on
    -- vient d'ouvrir est exclu des deux côtés : il ne peut pas se supprimer lui-même.
    DELETE FROM public.assistant_chats d
     WHERE d.user_id = v_uid
       AND d.id IN (SELECT o.id FROM public.assistant_chats o
                     WHERE o.user_id = v_uid AND o.id <> v_chat
                     ORDER BY o.updated_at DESC, o.created_at DESC, o.id DESC
                     OFFSET c_max_chats - 1);
  ELSE
    -- Le chat doit être à MOI. Inconnu ou à un autre : même erreur, rien ne fuit.
    SELECT c.id INTO v_chat FROM public.assistant_chats c
     WHERE c.id = p_chat_id AND c.user_id = v_uid
       FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Conversation introuvable.' USING ERRCODE = '42501';
    END IF;
    SELECT count(*) INTO v_n FROM public.assistant_chat_messages m WHERE m.chat_id = v_chat;
    IF v_n + 2 > c_max_messages THEN
      RAISE EXCEPTION 'Cette conversation est pleine (200 messages au plus) : ouvrez un nouveau chat.'
        USING ERRCODE = '54000';
    END IF;
  END IF;

  INSERT INTO public.assistant_chat_messages (chat_id, who, text) VALUES (v_chat, 'me', v_user);
  INSERT INTO public.assistant_chat_messages (chat_id, who, text, links) VALUES (v_chat, 'bot', v_bot, v_links);
  UPDATE public.assistant_chats SET updated_at = now() WHERE id = v_chat;
  RETURN v_chat;
END;
$fn$;
COMMENT ON FUNCTION public.assistant_chat_append(uuid, text, text, jsonb) IS
  'IA étape 2 : seul chemin d''écriture d''un chat (question + réponse, texte seul). Auteur, entreprise et côté lus dans la session. 200 messages par chat, 100 chats par utilisateur.';
REVOKE ALL ON FUNCTION public.assistant_chat_append(uuid, text, text, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.assistant_chat_append(uuid, text, text, jsonb) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4 · « TOUT EFFACER »
-- ═════════════════════════════════════════════════════════════════════════════
-- Supprime TOUS les chats de la personne connectée (et seulement les siens) et
-- rend leur nombre. Volontairement SANS la garde ai_enabled : si l'entreprise
-- coupe l'assistant, chacun doit pouvoir effacer ce qu'il a écrit.
CREATE OR REPLACE FUNCTION public.assistant_chat_clear()
 RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_n   integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Session invalide.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.assistant_chats WHERE user_id = v_uid;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$fn$;
COMMENT ON FUNCTION public.assistant_chat_clear() IS
  'IA étape 2 : supprime tous les chats de la personne connectée, rend leur nombre.';
REVOKE ALL ON FUNCTION public.assistant_chat_clear() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.assistant_chat_clear() TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5 · LA PURGE : 30 JOURS APRÈS LA DERNIÈRE ACTIVITÉ
-- ═════════════════════════════════════════════════════════════════════════════
-- Une règle de conservation qui ne s'exécute pas est pire que pas de règle (voir
-- la purge des positions) : d'où pg_cron. `updated_at` bouge à chaque message,
-- donc un chat où l'on écrit encore n'est jamais purgé. Les messages suivent
-- (cascade). Personne ne peut l'appeler depuis l'application : seul le cron
-- (qui tourne avec les droits du propriétaire) et l'éditeur SQL.
CREATE OR REPLACE FUNCTION public.purge_old_assistant_chats()
 RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  n integer;
BEGIN
  DELETE FROM public.assistant_chats WHERE updated_at < now() - interval '30 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$fn$;
COMMENT ON FUNCTION public.purge_old_assistant_chats() IS
  'IA étape 2 : supprime les chats sans activité depuis plus de 30 jours (cron quotidien).';
REVOKE ALL ON FUNCTION public.purge_old_assistant_chats() FROM PUBLIC, anon, authenticated, service_role;

-- Chaque jour à 03:45 UTC (04:45 ou 05:45 à Paris, loin des heures de travail et
-- de la purge des positions à 03:15). Nom stable : re-planifier remplace.
-- Garde « si pg_cron existe » : sur une base sans l'extension (test, aperçu), le
-- fichier s'applique quand même et seule la planification est sautée.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('bemexo-purge-assistant-chats')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bemexo-purge-assistant-chats');
    PERFORM cron.schedule('bemexo-purge-assistant-chats', '45 3 * * *',
      $cron$ SELECT public.purge_old_assistant_chats(); $cron$);
  END IF;
END $$;
