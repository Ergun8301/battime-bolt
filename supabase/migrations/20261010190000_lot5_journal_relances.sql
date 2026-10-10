-- ═════════════════════════════════════════════════════════════════════════════
-- LOT 5 (statistiques) — JOURNAL DES RELANCES « heures manquantes »
-- ═════════════════════════════════════════════════════════════════════════════
-- PAS ENCORE APPLIQUÉE EN PRODUCTION : Cowork la relit et l'applique. Testée sur
-- un Postgres jetable : npm run test:stats-db (supabase/tests/lot5_journal_relances.mjs),
-- avec les droits PAR DÉFAUT de production, chargée deux fois, puis retirée par
-- le RETOUR ARRIÈRE ci-dessous et rechargée.
--
-- 100 % ADDITIVE : 1 table neuve, 2 fonctions neuves, 1 trigger neuf posé sur
-- reminder_log. Aucune table, colonne, policy ou fonction existante n'est
-- modifiée ; aucune donnée existante n'est touchée. Rejouable (IF NOT EXISTS /
-- OR REPLACE / DROP … IF EXISTS sur les seuls objets de ce fichier). La
-- fonction edge missing-days-reminders n'est PAS modifiée (rien à redéployer) :
-- le trigger note chaque relance automatique qu'elle inscrit déjà dans
-- reminder_log.
--
-- POURQUOI. L'écran « Statistiques » du bureau compte les relances reçues par
-- salarié. Aujourd'hui rien ne s'en souvient : reminder_log ne garde que la
-- DERNIÈRE relance automatique (une ligne par salarié, effacée dès qu'il est à
-- jour) et le bouton « Relancer » du bureau n'écrit rien. Ce journal sert
-- uniquement à compter ; il commence le jour de l'application (le passé ne se
-- reconstitue pas) et l'écran le dit (« relances comptées depuis le … »).
--
-- CE QUI EST COMPTÉ :
--   · 'auto'   : la relance automatique « journées manquantes » (cron
--                missing-days-reminders → reminder_log). Le rappel « heures du
--                jour non envoyées » n'écrit rien dans reminder_log : il n'est
--                PAS compté ;
--   · 'bureau' : le bouton « Relancer » du planning et l'action « envoyer un
--                rappel » de l'Assistant, via log_hours_reminder. Canal
--                'push' = notification partie ; 'mailto' = e-mail PRÉPARÉ dans
--                la messagerie du bureau (pas forcément parti).
--   Le bureau peut appeler log_hours_reminder autant qu'il veut, pour SON
--   entreprise seulement : c'est un compteur, pas une preuve opposable.
--
-- Tant que cette migration n'est pas appliquée, l'écran « Statistiques » cache
-- « Relances reçues » (table absente → 404) et « Relancer » fonctionne
-- exactement comme avant (fonction absente → 404 PGRST202, erreur avalée).
--
-- DROITS. Les fonctions tournent avec les droits du propriétaire (SECURITY
-- DEFINER, search_path vide) : elles vérifient elles-mêmes l'entreprise et le
-- rôle. Les objets neufs reçoivent par défaut TOUS les droits pour anon et
-- authenticated en production (pg_default_acl) : ils sont repris plus bas.

-- ── 1) Le journal ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hours_reminders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  source     text NOT NULL CHECK (source IN ('auto', 'bureau')),
  channel    text CHECK (channel IS NULL OR channel IN ('push', 'email', 'mailto')),
  -- Jours réclamés quand on les connaît (bouton du bureau) ; vide pour la
  -- relance automatique (reminder_log ne les porte pas).
  days       date[] NOT NULL DEFAULT '{}',
  sent_by    uuid REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS hours_reminders_company_idx ON public.hours_reminders (company_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS hours_reminders_user_idx ON public.hours_reminders (user_id, sent_at DESC);
COMMENT ON TABLE public.hours_reminders IS
  'Lot 5 : une ligne par relance « heures manquantes » (auto = cron missing-days-reminders via le trigger sur reminder_log ; bureau = bouton « Relancer » / Assistant via log_hours_reminder). Lu par le bureau de l''entreprise (statistiques). Aucune écriture directe : seules ces deux fonctions écrivent.';

ALTER TABLE public.hours_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hours_reminders FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.hours_reminders TO authenticated;
GRANT ALL ON public.hours_reminders TO service_role;

-- Lecture : le bureau de l'entreprise, et lui seul (ni le salarié, ni le chef
-- d'équipe, ni support_read — comme time_entry_edits). Aucune policy
-- d'écriture : seules les deux fonctions ci-dessous écrivent.
DROP POLICY IF EXISTS hours_reminders_admin_select ON public.hours_reminders;
CREATE POLICY hours_reminders_admin_select ON public.hours_reminders FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() AND public.is_admin());

-- ── 2) Relance automatique : noter ce que la fonction edge inscrit ──────────
-- reminder_log est « upserté » par missing-days-reminders (service_role) à
-- chaque relance envoyée. Un UPDATE sans nouvelle date n'est pas une relance ;
-- une suppression (remise à zéro) non plus. Le journal ne doit JAMAIS faire
-- échouer la relance : toute erreur d'écriture est avalée.
CREATE OR REPLACE FUNCTION public.log_auto_hours_reminder()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.last_sent_at IS NOT DISTINCT FROM OLD.last_sent_at THEN
    RETURN NULL;
  END IF;
  BEGIN
    INSERT INTO public.hours_reminders (company_id, user_id, sent_at, source, channel)
    VALUES (NEW.company_id, NEW.user_id, NEW.last_sent_at, 'auto',
            CASE WHEN NEW.channel IN ('push', 'email') THEN NEW.channel END);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END
$fn$;

DROP TRIGGER IF EXISTS reminder_log_journal ON public.reminder_log;
CREATE TRIGGER reminder_log_journal AFTER INSERT OR UPDATE ON public.reminder_log
  FOR EACH ROW EXECUTE FUNCTION public.log_auto_hours_reminder();

-- ── 3) Relance par le bureau (bouton « Relancer », Assistant) ───────────────
CREATE OR REPLACE FUNCTION public.log_hours_reminder(p_user_id uuid, p_days date[] DEFAULT '{}', p_channel text DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_me uuid := auth.uid();
  v_co uuid;
  v_id uuid;
BEGIN
  IF v_me IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé au bureau.' USING ERRCODE = '42501';
  END IF;
  v_co := public.get_my_company_id();
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id AND u.company_id = v_co) THEN
    RAISE EXCEPTION 'Salarié introuvable.' USING ERRCODE = 'P0002';
  END IF;
  IF p_channel IS NOT NULL AND p_channel NOT IN ('push', 'mailto') THEN
    RAISE EXCEPTION 'Canal inconnu.' USING ERRCODE = '22023';
  END IF;
  IF cardinality(coalesce(p_days, '{}')) > 62 THEN
    RAISE EXCEPTION 'Trop de jours.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hours_reminders (company_id, user_id, source, channel, days, sent_by)
  VALUES (v_co, p_user_id, 'bureau', p_channel, coalesce(p_days, '{}'), v_me)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$fn$;

-- ── 4) Droits (repris explicitement) ────────────────────────────────────────
REVOKE ALL ON FUNCTION public.log_hours_reminder(uuid, date[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_hours_reminder(uuid, date[], text) TO authenticated;
REVOKE ALL ON FUNCTION public.log_auto_hours_reminder() FROM PUBLIC, anon, authenticated;

-- VÉRIFICATION APRÈS APPLICATION — LECTURE SEULE, une ligne de résultat, toutes
-- les colonnes à true (le test l'exécute telle quelle).
-- SELECT
--   (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'hours_reminders') = 1 AS v1_une_policy_lecture,
--   (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'hours_reminders' AND cmd = 'SELECT') = 1 AS v2_lecture_seule,
--   (SELECT count(*) FROM pg_trigger WHERE tgname = 'reminder_log_journal' AND tgrelid = 'public.reminder_log'::regclass) = 1 AS v3_trigger_pose,
--   NOT has_table_privilege('anon', 'public.hours_reminders', 'SELECT') AND NOT has_table_privilege('anon', 'public.hours_reminders', 'INSERT') AS v4_anon_rien,
--   NOT has_table_privilege('authenticated', 'public.hours_reminders', 'INSERT') AND NOT has_table_privilege('authenticated', 'public.hours_reminders', 'UPDATE') AND NOT has_table_privilege('authenticated', 'public.hours_reminders', 'DELETE') AND NOT has_table_privilege('authenticated', 'public.hours_reminders', 'TRUNCATE') AS v5_aucune_ecriture_directe,
--   NOT has_function_privilege('anon', 'public.log_hours_reminder(uuid, date[], text)', 'EXECUTE') AND has_function_privilege('authenticated', 'public.log_hours_reminder(uuid, date[], text)', 'EXECUTE') AS v6_rpc_sans_anon,
--   NOT has_function_privilege('anon', 'public.log_auto_hours_reminder()', 'EXECUTE') AND NOT has_function_privilege('authenticated', 'public.log_auto_hours_reminder()', 'EXECUTE') AS v7_trigger_fermee,
--   (SELECT bool_and(p.prosecdef AND coalesce(array_to_string(p.proconfig, ','), '') LIKE '%search_path=%') FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('log_hours_reminder', 'log_auto_hours_reminder')) AS v8_definer_search_path_vide;

-- RETOUR ARRIÈRE — rien d'existant n'a été remplacé : on retire ce qui a été
-- ajouté. ⚠ Efface l'historique des relances (les relances elles-mêmes, la
-- table reminder_log et la fonction edge ne bougent pas). Pour l'exécuter :
-- copier les lignes ENTRE « DÉBUT » et « FIN » en retirant au début de chaque
-- ligne « -- » ET l'espace qui suit.
-- ── DÉBUT DU RETOUR ARRIÈRE ──
-- DROP TRIGGER IF EXISTS reminder_log_journal ON public.reminder_log;
-- DROP FUNCTION IF EXISTS public.log_auto_hours_reminder();
-- DROP FUNCTION IF EXISTS public.log_hours_reminder(uuid, date[], text);
-- DROP TABLE IF EXISTS public.hours_reminders;
-- ── FIN DU RETOUR ARRIÈRE ──
