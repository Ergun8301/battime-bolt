-- ═════════════════════════════════════════════════════════════════════════════
-- IA ÉTAPE 3c-0 (oct. 2026) — SÉCURITÉ DES CHATS DE L'ASSISTANT
-- ═════════════════════════════════════════════════════════════════════════════
-- POURQUOI (docs/ia-etape3/00-conception-etape3.md §0.2 et §4.4) : la migration
-- 20261014090000 filtre les chats sur le seul auteur (`user_id = auth.uid()`).
-- Conséquences vérifiées, déjà présentes aujourd'hui :
--   · un administrateur RÉTROGRADÉ relit pendant 30 jours les réponses du bureau
--     de son ancien rôle (heures, chantiers, absences de l'entreprise) ;
--   · un salarié ARCHIVÉ (users.is_active = false) relit ses chats, dont les
--     réponses lues avec les droits qu'il avait ;
--   · une personne qui change d'entreprise garde les chats de l'ancienne ;
--   · l'écran ne filtre pas le côté (`side`) : un bureau qui lisait un chat
--     « salarie » (ou l'inverse) le mélangeait à son historique.
-- L'étape 3c va faire LIRE des données de l'entreprise à l'assistant : ses
-- réponses (donc les chats) en contiendront davantage. Cette migration ferme
-- ces trois portes AVANT, et seule.
--
-- CE QUI CHANGE (rien d'autre n'est touché) :
--   1. Les 3 règles de lecture (chats : SELECT ; messages : SELECT) exigent en
--      plus : le chat est dans MON entreprise ACTUELLE et ACTIVE
--      (`company_id = get_my_company_id()`, qui rend NULL pour un archivé) et,
--      s'il est du côté « bureau », je suis administrateur AUJOURD'HUI
--      (`side = 'salarie' OR is_admin()`). Le filtre sur l'auteur reste.
--      La règle de suppression (DELETE) reste « mes chats », sans autre condition,
--      et « Tout effacer » (assistant_chat_clear) efface tout ce qui est à moi,
--      visible ou non (RGPD).
--   2. Un trigger sur public.users supprime les chats qui ne sont plus
--      légitimes dès que la situation change : rétrogradation → ses chats
--      « bureau » ; archivage ou changement d'entreprise → tous ses chats.
--      (La règle en 1 cache déjà ces chats ; le trigger les EFFACE, au lieu de
--      les garder invisibles, et ils ne reviennent pas si la personne redevient
--      administratrice.)
--   3. La purge quotidienne (purge_old_assistant_chats) supprime aussi, en plus
--      des 30 jours, les chats devenus illégitimes (ceux d'avant cette
--      migration comprise) : aucune donnée n'est touchée à l'APPLICATION du
--      fichier, le ménage se fait au prochain passage du cron (03:45 UTC).
--
-- ADDITIVE : aucune table, colonne, fonction d'écriture ni droit n'est modifié.
-- Sont remplacées : 3 règles (DROP POLICY IF EXISTS puis CREATE, mêmes noms) et le
-- CORPS de purge_old_assistant_chats (CREATE OR REPLACE, mêmes droits). Sont
-- créés : 1 fonction et 1 trigger. Rejouable.
-- Aucune donnée n'est supprimée À L'APPLICATION ; les DELETE ci-dessous ne
-- s'exécutent que dans le trigger (changement de rôle / d'archivage) et dans la
-- purge (cron).
--
-- RETOUR ARRIÈRE (à coller tel quel ; rend exactement l'état de 20261014090000) :
--   DROP TRIGGER IF EXISTS users_purge_chats_perdus ON public.users;
--   DROP FUNCTION IF EXISTS public.purge_chats_perdus();
--   DROP POLICY IF EXISTS assistant_chats_own_select ON public.assistant_chats;
--   CREATE POLICY assistant_chats_own_select ON public.assistant_chats
--     FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
--   DROP POLICY IF EXISTS assistant_chat_messages_own_select ON public.assistant_chat_messages;
--   CREATE POLICY assistant_chat_messages_own_select ON public.assistant_chat_messages
--     FOR SELECT TO authenticated
--     USING (EXISTS (SELECT 1 FROM public.assistant_chats c
--                     WHERE c.id = assistant_chat_messages.chat_id AND c.user_id = (SELECT auth.uid())));
--   CREATE OR REPLACE FUNCTION public.purge_old_assistant_chats() RETURNS integer
--    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
--   DECLARE n integer;
--   BEGIN
--     DELETE FROM public.assistant_chats WHERE updated_at < now() - interval '30 days';
--     GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
--   END; $f$;
--   REVOKE ALL ON FUNCTION public.purge_old_assistant_chats() FROM PUBLIC, anon, authenticated, service_role;
-- … puis, seulement si le fichier avait été inscrit dans l'historique (DELETE sur
-- l'historique uniquement, à coller par Ergun) :
--   DELETE FROM supabase_migrations.schema_migrations WHERE name = 'ia_3c0_chats_securite';
--
-- AVANT D'APPLIQUER (lecture seule ; à coller dans l'éditeur SQL) — combien de chats
-- seront jugés illégitimes (ils seront effacés par la prochaine purge) :
--   SELECT
--     count(*) FILTER (WHERE u.id IS NULL OR u.is_active IS NOT DISTINCT FROM false
--                      OR u.company_id IS DISTINCT FROM c.company_id)             AS chats_de_comptes_perdus,
--     count(*) FILTER (WHERE c.side = 'bureau' AND u.role::text <> 'admin'
--                      AND u.is_active IS DISTINCT FROM false
--                      AND u.company_id IS NOT DISTINCT FROM c.company_id)        AS chats_bureau_de_non_admins,
--     count(*)                                                                    AS chats_au_total
--   FROM public.assistant_chats c LEFT JOIN public.users u ON u.id = c.user_id;
--   -- et la liste des règles actuelles (3 attendues : 2 sur les chats, 1 sur les messages) :
--   SELECT tablename, policyname, cmd, qual FROM pg_policies
--    WHERE schemaname = 'public' AND tablename IN ('assistant_chats', 'assistant_chat_messages')
--    ORDER BY 1, 2;
--
-- VÉRIFICATION APRÈS APPLICATION (doit renvoyer 6 × true) :
--   SELECT
--     (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
--        AND tablename IN ('assistant_chats', 'assistant_chat_messages')) = 3                 AS trois_regles,
--     (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
--        AND tablename IN ('assistant_chats', 'assistant_chat_messages') AND cmd = 'SELECT'
--        AND qual ILIKE '%get_my_company_id%' AND qual ILIKE '%is_admin%'
--        AND qual ILIKE '%auth.uid%') = 2                                                     AS lecture_resserree,
--     (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
--        AND tablename = 'assistant_chats' AND cmd = 'DELETE'
--        AND qual NOT ILIKE '%is_admin%' AND qual ILIKE '%auth.uid%') = 1                     AS suppression_libre,
--     EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgname = 'users_purge_chats_perdus'
--        AND t.tgrelid = 'public.users'::regclass AND NOT t.tgisinternal)                     AS trigger_pose,
--     (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prosecdef
--        AND proname IN ('purge_chats_perdus', 'purge_old_assistant_chats')
--        AND proconfig @> ARRAY['search_path=""']) = 2                                       AS fonctions,
--     NOT has_function_privilege('authenticated', 'public.purge_chats_perdus()', 'EXECUTE')
--     AND NOT has_function_privilege('anon', 'public.purge_chats_perdus()', 'EXECUTE')
--     AND NOT has_function_privilege('authenticated', 'public.purge_old_assistant_chats()', 'EXECUTE') AS fermees;
--   -- (« lecture_resserree » = 2 : la règle des chats et celle des messages.)
--
-- HISTORIQUE : si le fichier est collé dans l'éditeur SQL, inscrire ensuite :
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261015090000', 'ia_3c0_chats_securite') ON CONFLICT DO NOTHING;
--
-- À METTRE EN LIGNE AVEC CETTE MIGRATION : le front (lib/assistant-chats.ts filtre
-- désormais `side` : un onglet resté ouvert avec l'ancien code continue de marcher,
-- la base filtre de toute façon). Aucune fonction Edge n'est concernée.
--
-- Testée sur un Postgres jetable : npm run test:assistant-chats-securite-rls
-- (supabase/tests/ia_3c0_chats_securite.sql, qui rejoue aussi la migration d'avant).
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 1 · LES RÈGLES DE LECTURE
-- ═════════════════════════════════════════════════════════════════════════════
-- (SELECT …) : évalué une fois par requête, pas une fois par ligne (même écriture
-- que le lot 29). `get_my_company_id()` rend NULL pour un compte archivé : la
-- comparaison est alors fausse, il ne lit plus rien. `is_admin()` est faux pour
-- un compte archivé ou rétrogradé.
DROP POLICY IF EXISTS assistant_chats_own_select ON public.assistant_chats;
CREATE POLICY assistant_chats_own_select ON public.assistant_chats
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid())
         AND company_id = (SELECT public.get_my_company_id())
         AND (side = 'salarie' OR (SELECT public.is_admin())));

DROP POLICY IF EXISTS assistant_chat_messages_own_select ON public.assistant_chat_messages;
CREATE POLICY assistant_chat_messages_own_select ON public.assistant_chat_messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assistant_chats c
                  WHERE c.id = assistant_chat_messages.chat_id
                    AND c.user_id = (SELECT auth.uid())
                    AND c.company_id = (SELECT public.get_my_company_id())
                    AND (c.side = 'salarie' OR (SELECT public.is_admin()))));

-- La règle de suppression (assistant_chats_own_delete) ne change pas. Nuance de
-- Postgres : un DELETE ... WHERE applique aussi la règle de lecture, donc un chat
-- devenu invisible ne se supprime plus « un par un » ; « Tout effacer »
-- (assistant_chat_clear, SECURITY DEFINER) efface en revanche tout ce qui est à
-- moi, visible ou non : le droit d'effacement reste entier.

-- ═════════════════════════════════════════════════════════════════════════════
-- 2 · LE TRIGGER : UN CHAT QUI N'EST PLUS LÉGITIME EST EFFACÉ
-- ═════════════════════════════════════════════════════════════════════════════
-- Se déclenche seulement quand role, is_active ou company_id change vraiment.
--   · archivé (is_active passe à false) ou autre entreprise → tous ses chats ;
--   · administrateur qui cesse de l'être (rôle ≠ admin) → ses chats « bureau ».
-- Un salarié promu administrateur puis rétrogradé garde ses chats « salarie ».
CREATE OR REPLACE FUNCTION public.purge_chats_perdus()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
BEGIN
  IF NEW.is_active IS NOT DISTINCT FROM false
     OR NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    DELETE FROM public.assistant_chats WHERE user_id = NEW.id;
  ELSIF OLD.role::text = 'admin' AND NEW.role::text <> 'admin' THEN
    DELETE FROM public.assistant_chats WHERE user_id = NEW.id AND side = 'bureau';
  END IF;
  RETURN NEW;
END;
$fn$;
COMMENT ON FUNCTION public.purge_chats_perdus() IS
  'IA étape 3c-0 : supprime les chats d''un compte archivé ou déplacé, et les chats « bureau » d''un administrateur rétrogradé (trigger sur public.users).';
REVOKE ALL ON FUNCTION public.purge_chats_perdus() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS users_purge_chats_perdus ON public.users;
CREATE TRIGGER users_purge_chats_perdus
  AFTER UPDATE OF role, is_active, company_id ON public.users
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role
        OR OLD.is_active IS DISTINCT FROM NEW.is_active
        OR OLD.company_id IS DISTINCT FROM NEW.company_id)
  EXECUTE FUNCTION public.purge_chats_perdus();

-- ═════════════════════════════════════════════════════════════════════════════
-- 3 · LA PURGE QUOTIDIENNE RATTRAPE LES CHATS D'AVANT
-- ═════════════════════════════════════════════════════════════════════════════
-- Même fonction, mêmes droits (fermée à tous les clients), mêmes 30 jours ; en
-- plus : les chats d'un compte archivé / supprimé / déplacé, et les chats « bureau »
-- d'une personne qui n'est plus administratrice. C'est ce qui nettoie les chats
-- créés avant le trigger, sans toucher une donnée à l'application du fichier.
CREATE OR REPLACE FUNCTION public.purge_old_assistant_chats()
 RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  n integer;
  m integer;
BEGIN
  DELETE FROM public.assistant_chats WHERE updated_at < now() - interval '30 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM public.assistant_chats c
   WHERE NOT EXISTS (SELECT 1 FROM public.users u
                      WHERE u.id = c.user_id
                        AND u.is_active IS DISTINCT FROM false
                        AND u.company_id IS NOT DISTINCT FROM c.company_id
                        AND (c.side = 'salarie' OR u.role::text = 'admin'));
  GET DIAGNOSTICS m = ROW_COUNT;
  RETURN n + m;
END;
$fn$;
COMMENT ON FUNCTION public.purge_old_assistant_chats() IS
  'IA étape 2 + 3c-0 : supprime les chats sans activité depuis plus de 30 jours et ceux qui ne sont plus légitimes (compte archivé ou déplacé, chat « bureau » d''un non-administrateur). Cron quotidien.';
REVOKE ALL ON FUNCTION public.purge_old_assistant_chats() FROM PUBLIC, anon, authenticated, service_role;
